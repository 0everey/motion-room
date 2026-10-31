import {CHARACTER_PROFILES,DEFAULT_CHARACTER} from './character.js';
import {MotionSession,defaultRecipe,validateRecipe,encodeRecipe,decodeRecipe} from './motion-session.js';
import {WorkbenchRenderer} from './workbench-renderer.js';
import {fetchMotion} from './mvp.js';
import {PreviewCache} from './cache-client.js';
import {CATEGORY_COLORS,categoryColor,readyVariants,variantFor,actualDuration,searchCatalog,originalSource,sourceText,downloadVerified,MotionBank} from './library-browser.js';
import {SkeletonWall,WallSession,wallColumns} from './motion-wall.js';
import {YUUKA_SOURCE} from './yuuka-source.js';

const $=id=>document.getElementById(id),clone=value=>structuredClone(value),option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;};
const defaults={query:'',category:'all',subcategory:'all',weapon:'all',inPlace:'all',loopFilter:'all',duration:'all',posture:'all',variant:'source',sort:'relevance',page:0,density:12,style:'character',favoritesOnly:false,basketOnly:false,rootMotion:false,character:DEFAULT_CHARACTER};
let state={...defaults,density:12,selected:null,mode:'wall',panel:'source',playing:!matchMedia('(prefers-reduced-motion:reduce)').matches,time:0,speed:1,anchorNow:performance.now(),anchorTime:0,loop:true,favorites:[],basket:[]};
let catalog,mainSession,detailSession,bank,wall,wallSession,renderer,offline,filtered=[],pageRows=[],raf=0,lastDraw=0,noticeTimer=0,selectionNote=0,actorIndex=0,nodeIndex=0,sequencePage=0,lastCacheGeneration='',modelError=null,clearing=false,downloadState=null,drawTimes=[];
const rootProofs=new Map();let nativeRootTicket=0,restoringWorkspace=true,viewIntent=0;
let modelImportGeneration=0,modelImport={phase:'idle',error:null};
function importControl(){const button=$('importYuuka');if(!button)return;button.disabled=clearing||modelImport.phase==='reading';button.textContent=clearing?'清理中…':modelImport.phase==='reading'?'正在导入…':'导入优香ZIP';}
function importFeedback(){const message=$('modelImportStatus');if(!message)return;importControl();message.textContent=modelImport.error||({reading:'正在校验原包，仅在此浏览器保存…',ready:'优香原包已在此浏览器保存。',cached:'原包已保存，保持当前角色。',idle:'仅此浏览器保存，不上传。'}[modelImport.phase]||'仅此浏览器保存，不上传。');}
async function importYuuka(file){
  if(clearing){notice('正在清理预览缓存，请完成后再导入。');return false;}
  const ticket=++modelImportGeneration,intent=viewIntent;modelImport={phase:'reading',error:null};importFeedback();
  const current=()=>ticket===modelImportGeneration&&!clearing;
  try{
    if(!file||typeof file.arrayBuffer!=='function'||file.size!==YUUKA_SOURCE.bytes)throw new Error('请导入原始 Yuuka_Hayase1_0_rev2.zip（1.0 rev2）。');
    await offline.init();if(!current())return false;
    if(!offline.available)throw new Error(offline.error||'本地缓存未就绪，请重试离线缓存后导入。');
    const status=await offline.command('STATUS');if(!current())return false;
    if(status.localModelImport!==1)throw new Error('当前页面仍由旧版缓存控制。请保留配方，关闭本站旧标签后重新打开，再导入原包。');
    const buffer=await file.arrayBuffer();if(!current())return false;
    const receipt=await offline.command('IMPORT_USER_MODEL',{buffer,epoch:status.epoch});if(!current())return false;
    if(intent!==viewIntent){modelImport={phase:'cached',error:null};return receipt;}
    state.character='yuuka';modelError=null;const active=ensureRenderer();if(!active.modelReady)await active.loadModel();if(!current()||state.character!=='yuuka'||active.characterProfile.key!=='yuuka')return false;
    if(!active.modelReady)throw new Error(modelError||'优香原包已保存，角色尚未载入。可重新载入或切回其它角色。');
    if(state.mode==='wall'){if(['cleared','error'].includes(bank.phase))filterRows();}
    else{const session=activeSession();if(['cleared','error'].includes(session.phase))await session.setRecipe(session.exportRecipe());}
    if(!current()||state.character!=='yuuka')return false;
    modelImport={phase:'ready',error:null};lastCacheGeneration='';persistent();syncInspector();request();return receipt;
  }catch(error){if(current()){modelImport={phase:'error',error:error.message};fail(error);}throw error;}
  finally{if(current()){if(modelImport.phase==='reading')modelImport={phase:'cached',error:null};importFeedback();}}
}
function notice(text){clearTimeout(noticeTimer);if(state.panel==='view'){$('notice').hidden=true;$('modelImportStatus').textContent=text;return;}$('notice').textContent=text;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,5000);}
function fail(error){notice(error.message||String(error));}
function request(){if(!raf&&!document.hidden)raf=requestAnimationFrame(draw);}
function activeSession(){return state.mode==='detail'?detailSession:mainSession;}
function selected(){return catalog?.clips.find(row=>row.id===state.selected)||null;}
function selectedVariant(){const row=selected();return row?variantFor(row,state.variant):null;}
function cleanBrowse(input){
  if(!input||typeof input!=='object')return {};const next={},choices={variant:['source','native','cloud'],sort:['relevance','name','duration'],inPlace:['all','yes','no'],loopFilter:['all','yes','no'],duration:['all','short','medium','long'],style:['skeleton','character'],panel:['source','blend','actors','nodes','view']};
  for(const [key,values]of Object.entries(choices))if(values.includes(input[key]))next[key]=input[key];
  if(CHARACTER_PROFILES[input.character]?.asset)next.character=input.character;if(typeof input.rootMotion==='boolean')next.rootMotion=input.rootMotion;
  if(['wall','detail','mix'].includes(input.mode))next.mode=input.mode;
  if(typeof input.query==='string')next.query=input.query.slice(0,200);
  for(const key of ['favoritesOnly','basketOnly'])if(typeof input[key]==='boolean')next[key]=input[key];
  if([12,24,48,64].includes(Number(input.density)))next.density=Number(input.density);
  if(Number.isInteger(input.page))next.page=Math.max(0,Math.min(10000,input.page));
  for(const key of ['category','subcategory','weapon','posture']){const field=key==='category'?'categoryCode':key;if(input[key]==='all'||catalog.clips.some(r=>key==='posture'?r.postures?.includes(input[key]):r[field]===input[key]))next[key]=input[key];}
  const ids=new Set(catalog.clips.map(r=>r.id));if(ids.has(input.selected))next.selected=input.selected;
  for(const key of ['favorites','basket'])if(Array.isArray(input[key]))next[key]=[...new Set(input[key].filter(x=>ids.has(x)))].slice(0,2446);
  return next;
}
function browseSnapshot(){return {...cleanBrowse(state),mode:state.mode};}
function mainRecipe(){const recipe=mainSession.exportRecipe();if(state.mode==='mix'&&renderer){const focus=renderer.focusActor;recipe.view={yaw:renderer.yaw,pitch:renderer.pitch,zoom:renderer.zoom,follow:renderer.follow,skeleton:renderer.skeleton,grid:renderer.trail,focus:recipe.actors.some(a=>a.id===focus)?focus:'all'};}return recipe;}
function saveMainRecipe(){if(restoringWorkspace||mainSession?.phase!=='ready')return;try{localStorage.setItem('motion-studio-recipe-v1',JSON.stringify(mainRecipe()));}catch{notice('浏览器无法保存工作区；请用“保存配方”保留当前修改。');}}
function persistent(){if(restoringWorkspace)return;try{localStorage.setItem('motion-studio-browse-v1',JSON.stringify(browseSnapshot()));}catch{}saveMainRecipe();}
function workspace(){return {schema:'motion-workbench.share.v2',recipe:mainRecipe(),browse:browseSnapshot()};}
function currentRecipe(){const s=activeSession();if(!s?.recipe)return null;s.clock();return {...s.exportRecipe(),view:{yaw:renderer?.yaw??.3,pitch:renderer?.pitch??.1,zoom:renderer?.zoom??1,follow:renderer?.follow??false,skeleton:renderer?.skeleton??false,grid:renderer?.trail??true,focus:renderer?.focusActor||'all'}};}
function ensureRenderer(){
  if(!renderer){renderer=new WorkbenchRenderer($('motionCanvas'),{onChange:()=>{if(offline)cacheChanged(offline.last,offline.error);request();},onError:error=>{modelError=error.message;fail(error);request();}});}
  if(renderer.characterProfile.key!==state.character){modelError=null;renderer.setCharacter(state.character).catch(fail);}else if(!renderer.modelReady&&!renderer.loading&&!modelError)renderer.loadModel();
  return renderer;
}
function setPanel(panel){if(panel==='view'&&!$('notice').hidden){$('modelImportStatus').textContent=$('notice').textContent;$('notice').hidden=true;clearTimeout(noticeTimer);}if(['blend','actors','nodes'].includes(panel)&&!document.body.classList.contains('advanced-mode'))setAdvanced(true);state.panel=panel;for(const b of document.querySelectorAll('[data-panel]'))b.classList.toggle('active',b.dataset.panel===panel);for(const page of document.querySelectorAll('[data-inspector]'))page.hidden=page.dataset.inspector!==panel;persistent();}
function setAdvanced(enabled){document.body.classList.toggle('advanced-mode',enabled);$('advancedToggle').setAttribute('aria-pressed',String(enabled));if(!enabled&&['blend','actors','nodes'].includes(state.panel))setPanel('source');}
function closePanels(){$('filterPanel').classList.remove('open');$('inspectorPanel').classList.remove('open');$('panelBackdrop').hidden=true;}
function closeMenu(){$('workspaceMenu').hidden=true;$('workspaceMenuToggle').setAttribute('aria-expanded','false');}
function openPanel(which){closePanels();$(which).classList.add('open');$('panelBackdrop').hidden=false;}
function modeChanged(mode){
  viewIntent++;
  mainSession?.pause();detailSession?.pause();state.mode=mode;
  for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('active',b.dataset.mode===mode);
  document.body.classList.toggle('wall-mode',mode==='wall');for(const element of document.querySelectorAll('.wall-only'))element.hidden=mode!=='wall';
  $('workspaceTitle').textContent={wall:'全库动作墙',detail:'单片精看',mix:'真实混合与节点'}[mode];
  $('wallTiles').hidden=mode!=='wall';$('actorLabels').hidden=mode==='wall';
  if(mode==='mix')setAdvanced(true);
  if(mode!=='wall'||state.style==='character')ensureRenderer().focusActor=null;
  if(mode==='wall'){state.anchorNow=performance.now();state.anchorTime=state.time;}
  else if(mode==='detail'&&!detailSession.recipe)inspectSelected().catch(fail);
  syncInspector();persistent();if(offline)cacheChanged(offline.last,offline.error);request();
}
function syncFilters(){
  $('search').value=state.query;$('variantKind').value=state.variant;$('sortBy').value=state.sort;$('density').value=state.density;$('wallStyle').value=state.style;
  for(const [id,key]of [['subcategory','subcategory'],['weapon','weapon'],['inPlace','inPlace'],['loopFilter','loopFilter'],['durationFilter','duration'],['posture','posture']])$(id).value=state[key];
  $('favoritesOnly').classList.toggle('active',state.favoritesOnly);$('basketOnly').classList.toggle('active',state.basketOnly);$('basketCount').textContent=state.basket.length;
  for(const b of $('categories').children)b.classList.toggle('active',b.dataset.category===state.category);
}
function filterRows(){
  viewIntent++;
  if(state.mode!=='wall')modeChanged('wall');
  filtered=searchCatalog(catalog,{...state,loop:state.loopFilter}).filter(row=>(state.posture==='all'||row.postures?.includes(state.posture))&&(!state.basketOnly||state.basket.includes(row.id))&&(state.variant==='source'||readyVariants(row).some(v=>v.key===state.variant)));
  const pages=Math.max(1,Math.ceil(filtered.length/state.density));state.page=Math.max(0,Math.min(pages-1,state.page));
  pageRows=filtered.slice(state.page*state.density,(state.page+1)*state.density);
  $('resultCount').textContent=`${filtered.length.toLocaleString()} / ${catalog.clips.length.toLocaleString()} 个动作`;
  $('pageLabel').textContent=`${state.page+1} / ${pages}`;$('pageJump').value=state.page+1;$('pageJump').max=pages;$('prevPage').disabled=state.page===0;$('nextPage').disabled=state.page===pages-1;
  $('pageRange').textContent=filtered.length?`${state.page*state.density+1}–${Math.min((state.page+1)*state.density,filtered.length)} / ${filtered.length}`:'没有匹配动作';
  renderTiles();syncFilters();renderSelection();persistent();
  wallSession?.clear();
  bank.load(pageRows,state.variant).catch(fail);request();
}
function renderTiles(){
  const rect=$('stage').getBoundingClientRect(),cols=wallColumns(Math.max(1,pageRows.length),rect.width,rect.height),rows=Math.max(1,Math.ceil(pageRows.length/cols));
  $('wallTiles').style.setProperty('--cols',cols);$('wallTiles').style.setProperty('--rows',rows);$('wallTiles').replaceChildren();
  for(const row of pageRows){
    const tile=document.createElement('article');tile.className='motion-tile';tile.dataset.id=row.id;tile.style.setProperty('--cat',categoryColor(row));tile.classList.toggle('selected',row.id===state.selected);
    const top=document.createElement('div');top.className='tile-top';const category=document.createElement('span');category.className='source-kind';category.textContent=`${row.categoryCode} · ${row.category}`;
    const pick=document.createElement('button');pick.className='tile-pick';pick.classList.toggle('active',state.basket.includes(row.id));pick.textContent=state.basket.includes(row.id)?'✓':'+';pick.title='加入 / 移出对比篮';pick.setAttribute('aria-label',row.name+'加入或移出对比篮');pick.addEventListener('click',()=>toggleBasket(row.id));top.append(category,pick);
    const bottom=document.createElement('div');bottom.className='tile-bottom';const name=document.createElement('button');name.className='tile-name';name.textContent=row.name;name.title=row.name+' · '+row.english;name.addEventListener('click',()=>selectRow(row.id));name.addEventListener('dblclick',()=>inspectSelected().catch(fail));
    const meta=document.createElement('div');meta.className='tile-meta';const kind=document.createElement('span'),duration=document.createElement('span'),variant=variantFor(row,state.variant);kind.textContent=variant?.key||'待预览';duration.textContent=variant?`${variant.frames}f · ${variant.duration.toFixed(2)}s`:`索引 ${row.duration.toFixed(2)}s`;meta.append(kind,duration);bottom.append(name,meta);
    const message=document.createElement('span');message.className='tile-message';message.textContent='读取真实动作…';tile.append(top,bottom,message);$('wallTiles').append(tile);
  }
}
function tileStatus(){
  if(!bank)return;let ready=0;
    for(const [i,tile]of [...$('wallTiles').children].entries()){const item=bank.items[i],message=tile.querySelector('.tile-message'),loaded=item&&bank.motion(item),error=(item&&bank.errors.get(item.row.id))||bank.error;if(loaded)ready++;message.hidden=!!loaded&&!error;message.textContent=error?'载入失败 · 可重试':item?.variant?'读取真实动作…':'预览生成中';message.title=error||'';message.classList.toggle('error',!!error);}
  if(state.mode==='wall'){$('stageStatus').textContent=`${ready} / ${pageRows.length} 片就绪 · ${state.style==='skeleton'?'完整源骨架':'独立角色骨架'}`;}
}
function selectRow(id){viewIntent++;state.selected=id;selectionNote=0;for(const tile of $('wallTiles').children)tile.classList.toggle('selected',tile.dataset.id===id);renderSelection();persistent();if(innerWidth<=1000)openPanel('inspectorPanel');}
function toggleFavorite(id=state.selected){if(!id)return;state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];if(state.favoritesOnly)filterRows();else{renderSelection();syncFilters();persistent();}}
function toggleBasket(id=state.selected){if(!id)return;state.basket=state.basket.includes(id)?state.basket.filter(x=>x!==id):[...state.basket,id];if(state.basketOnly)filterRows();else{renderTiles();tileStatus();renderSelection();syncFilters();persistent();}}
function renderSelection(){
  const row=selected(),variant=selectedVariant();if(!row)return;
  $('selectedPath').textContent=row.originalSource?.path||'';$('selectedPath').title=row.originalSource?.path||'';$('rootMotionNote').textContent=(state.mode!=='wall'&&activeSession()?.recipe?.rootMode!=='in-place')?(activeSession()?.recipe?.rootMode==='animator'&&activeSession()?.recipe?.nodes.some(n=>n.type==='clip'&&n.variant==='native')?'根运动：Native输入使用对应的实测根轨迹。':'根运动：按源动作髋部轨迹预览位移。'):'原地预览；开启Root Motion可精看实际位移。';
  $('selectionCategory').style.setProperty('--cat',categoryColor(row));$('selectionCategory').textContent=row.category+' / '+row.subcategory;$('selectionName').textContent=row.name;$('selectionName').title=row.name;$('selectionEnglish').textContent=row.english;$('selectionEnglish').title=row.english;
  $('selectionFlags').replaceChildren();for(const [text,klass]of [[variant?.key||'待预览',variant?.key],[row.inPlace?'原地标记':'非原地标记',''],[row.loop?'源标记循环':'源标记单次',''],[filtered.some(x=>x.id===row.id)?'已选':'筛选结果外已选','']]){const s=document.createElement('span');s.textContent=text;s.className=klass||'';$('selectionFlags').append(s);}
  $('selectionFacts').replaceChildren();for(const [key,value]of [['实际时长',variant?variant.duration.toFixed(3)+' s':'待实采'],['帧率 / 帧数',variant?`${variant.fps} / ${variant.frames}`:'—'],['骨骼',variant?variant.joints:'—'],['武器分类',row.weapon]]){const box=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;box.append(dt,dd);$('selectionFacts').append(box);}
  const source=originalSource(row,catalog),downloading=downloadState?.phase==='loading';$('downloadOriginal').disabled=!source||downloading;$('copySource').disabled=!source;$('downloadOriginal').title=source?'下载原始Mixamo Source FBX；当前Native变体不是原FBX。':'原件公开版本正在准备';$('downloadPreview').disabled=!variant||downloading;$('inspectSelected').disabled=!variant;$('assignA').disabled=!variant;$('assignB').disabled=!variant;
  $('favoriteSelected').textContent=state.favorites.includes(row.id)?'★ 已收藏':'☆ 收藏';$('favoriteSelected').classList.toggle('favorite-on',state.favorites.includes(row.id));$('basketSelected').textContent=state.basket.includes(row.id)?'✓ 已在对比篮 · 移出':'＋ 加入对比篮';
  const notes=[`实际时长 ${variant?.duration.toFixed(3)||'待采样'} 秒；${variant?.frames||'—'} 帧，${variant?.fps||'—'} FPS，${variant?.joints||'—'} 骨。`,variant?.use,variant?.restrictions,variant?.rootContract||variant?.rootPolicy,variant?.loopContract||variant?.loopPolicy,source?`原FBX：${source.path}。原件 ${Math.ceil(source.bytes/1024)} KB，来源提交 ${source.commit.slice(0,12)}。`:'原FBX固定版本尚未就绪。',`预览仅为候选；分类、姿态与循环来自索引标记，不代表目标接触或无缝质量通过。`].filter(Boolean).flatMap(x=>{const text=Array.isArray(x)?x.join('；'):String(x);const size=innerHeight<620?38:innerHeight<760?56:80;return Array.from({length:Math.ceil(text.length/size)},(_,i)=>text.slice(i*size,(i+1)*size));});
  selectionNote=Math.max(0,Math.min(notes.length-1,selectionNote));$('selectionNote').textContent=notes[selectionNote]||'';$('notePage').textContent=`${selectionNote+1} / ${notes.length}`;$('notePrev').disabled=selectionNote===0;$('noteNext').disabled=selectionNote===notes.length-1;$('selectionId').textContent=row.id;$('selectionId').title=row.id;
}
async function acceptRecipe(session,recipe,commit,valid=()=>true){
  const pending=session.setRecipe(recipe),generation=session.generation;
  if(!await pending||session.generation!==generation||session.phase!=='ready'||!valid())return false;
  commit?.();return true;
}
async function edit(change,onCommit=null,intent=null){
  const recipe=clone(mainSession.exportRecipe());change(recipe);
  for(const n of recipe.nodes.filter(n=>n.type==='clip')){const row=catalog.clips.find(r=>r.id===n.clipId),variant=row?.variants.find(v=>v.key===n.variant);if(recipe.rootMode==='animator'&&n.variant==='native')n.animatorRootSha256=variant?.animatorRootSha256;else delete n.animatorRootSha256;}
  if(recipe.view&&recipe.view.focus!=='all'&&!recipe.actors.some(a=>a.id===recipe.view.focus))recipe.view.focus='all';
  try{return await acceptRecipe(mainSession,recipe,()=>{syncInspector();request();onCommit?.();},()=>intent===null||intent===viewIntent);}catch(error){syncInspector();throw error;}
}
async function assign(id,kind=null,target='A'){
  const intent=++viewIntent,row=catalog.clips.find(x=>x.id===id),variant=variantFor(row,kind||state.variant);if(!variant)throw new Error('该动作尚无完整预览。');
  return edit(r=>{const n=r.nodes.find(x=>x.id===target);if(!n||n.type!=='clip')throw new Error('配方没有该片段输入，请在节点页编辑。');Object.assign(n,{clipId:id,variant:variant.key,sha256:variant.sha256,phase:0});},()=>{state.selected=id;modeChanged('mix');setPanel('blend');renderSelection();},intent);
}
async function toggleRootMotion(){
  const current=state.mode==='wall'?false:activeSession()?.recipe?.rootMode!=='in-place';state.rootMotion=!current;persistent();
  if(state.mode==='wall')return inspectSelected();
  const s=activeSession(),recipe=s.exportRecipe(),hasNative=recipe.nodes.some(n=>n.type==='clip'&&n.variant==='native');recipe.rootMode=state.rootMotion?(hasNative?'animator':'trajectory'):'in-place';
  for(const n of recipe.nodes.filter(n=>n.type==='clip')){if(n.variant==='native'&&recipe.rootMode==='animator')n.animatorRootSha256=s.variant(n).animatorRootSha256;else delete n.animatorRootSha256;}
  return acceptRecipe(s,recipe,()=>{syncInspector();persistent();request();});
}
async function inspectSelected(){
  const intent=++viewIntent,row=selected(),variant=selectedVariant();if(!variant)throw new Error('当前动作的完整预览尚未就绪。');
  const leaf={id:'Detail',type:'clip',clipId:row.id,variant:variant.key,sha256:variant.sha256,speed:1,phase:0,loop:'repeat'},rootMode=state.rootMotion?(variant.key==='native'?'animator':'trajectory'):'in-place';if(rootMode==='animator'&&variant.key==='native')leaf.animatorRootSha256=variant.animatorRootSha256;
  const recipe={schema:'motion-workbench.recipe.v1',nodes:[leaf],actors:[{id:'detailActor',node:'Detail',label:row.name,speed:1,offset:0,hold:0,paused:false,visible:true,clock:'seconds',color:categoryColor(row)}],rootMode,loop:true,time:0,speed:1,layout:'compare'};
  const existing=bank.entries.get(variant.sha256)?.motion;if(existing)detailSession.motions.set(detailSession.key(leaf),existing);
  return acceptRecipe(detailSession,recipe,()=>{modeChanged('detail');ensureRenderer();detailSession.play();},()=>intent===viewIntent&&state.selected===row.id);
}
function syncSpeed(){const s=state.mode==='wall'?state.speed:activeSession()?.speed||1;const value=String(s);if(![...$('speedSelect').options].some(o=>o.value===value))$('speedSelect').append(option(value,value+'×'));$('speedSelect').value=value;}
function nodeSelect(value,change){const select=document.createElement('select');for(const n of mainSession.recipe.nodes)select.append(option(n.id,n.id+' · '+({clip:'片段',blend:'混合',sequence:'顺序',output:'输出'}[n.type])));select.value=value;select.addEventListener('change',()=>change(select.value));return select;}
function field(host,label,input){const l=document.createElement('label');l.append(document.createTextNode(label),input);host.append(l);}
function numberField(host,label,value,min,max,step,change){const input=document.createElement('input');Object.assign(input,{type:'number',value:String(value),min:String(min),max:String(max),step:String(step)});input.addEventListener('change',()=>change(Number(input.value)));field(host,label,input);}
function choices(host,label,value,values,change){const select=document.createElement('select');for(const [id,name]of values)select.append(option(id,name));select.value=value;select.addEventListener('change',()=>change(select.value));field(host,label,select);}
function syncInspector(){
  if(!mainSession?.recipe)return;
  for(const id of ['A','B']){const n=mainSession.recipe.nodes.find(n=>n.id===id),row=n?.type==='clip'?mainSession.row(n):null;$('name'+id).textContent=row?.name||'当前无此片段节点';$('name'+id).title=row?.english||'';$('variant'+id).replaceChildren();if(row)for(const v of readyVariants(row))$('variant'+id).append(option(v.key,{source:'Source 原采样',native:'Native 原Avatar',cloud:'Cloud 烘焙'}[v.key]));$('variant'+id).value=n?.variant||'';$('variant'+id).disabled=!row;for(const key of ['speed','phase']){$(key+id).disabled=!row;$(key+id).value=n?.[key]??0;}}
  const mix=mainSession.recipe.nodes.find(n=>n.id==='Mix'&&n.type==='blend');$('blendWeight').disabled=!mix;$('syncMode').disabled=!mix;if(mix){$('blendWeight').value=mix.weight;$('weightValue').textContent=mix.weight.toFixed(2);$('syncMode').value=mix.sync;}
  const s=activeSession();if(s?.recipe){$('rootMode').value=s.recipe.rootMode;$('layoutMode').value=s.recipe.layout;$('focusActor').replaceChildren(option('all','全部实例'));for(const a of s.recipe.actors)$('focusActor').append(option(a.id,a.label));$('focusActor').value=renderer?.focusActor||'all';const native=s.recipe.nodes.filter(n=>n.type==='clip'&&n.variant==='native');$('copyRootProbe').disabled=!native.length;$('rootNote').textContent=native.length?`${native.length} 个Native输入；当前${s.recipe.rootMode==='animator'?'按实际Animator根轨迹应用一次':'保留原未应用根姿态'}。动作墙独立原地速览。`:'Source / Cloud 是实际髋轨迹预览，不等同Unity Animator根。动作墙独立去水平髋位移。';}
  for(const [id,key]of [['skeletonToggle','skeleton'],['gridToggle','trail'],['followToggle','follow']])$(id).setAttribute('aria-pressed',String(renderer?.[key]??(key!=='skeleton')));
  $('characterSelect').value=state.character;const rootActive=state.mode==='wall'?false:s?.recipe?.rootMode!=='in-place';$('rootMotionToggle').setAttribute('aria-pressed',String(rootActive));$('rootMotionToggle').textContent=state.mode==='wall'?'精看 Root Motion':rootActive?'Root Motion 开':'Root Motion 关';
  syncActors();syncNodes();syncSpeed();renderSelection();
}
function syncActors(){
  const actors=mainSession.recipe.actors;actorIndex=Math.max(0,Math.min(actors.length-1,actorIndex));const actor=actors[actorIndex],host=$('actorControls');host.replaceChildren();$('actorPage').textContent=`${actorIndex+1} / ${actors.length}`;$('actorPrev').disabled=actorIndex===0;$('actorNext').disabled=actorIndex===actors.length-1;$('addActor').disabled=actors.length>=8;
  const card=document.createElement('article');card.className='edit-card';const h=document.createElement('h3');h.textContent=actor.label;card.append(h);const update=(key,value)=>edit(r=>r.actors.find(a=>a.id===actor.id)[key]=value).catch(fail);
  field(card,'输出节点',nodeSelect(actor.node,value=>update('node',value)));numberField(card,'速度',actor.speed,.1,4,.1,v=>update('speed',v));numberField(card,'偏移秒',actor.offset,0,3600,.05,v=>update('offset',v));choices(card,'时间',actor.clock,[['seconds','秒'],['phase','归一化相位']],v=>update('clock',v));
  for(const [text,key]of [[actor.visible?'隐藏':'显示','visible'],[actor.paused?'恢复':'暂停','paused']]){const b=document.createElement('button');b.textContent=text;b.addEventListener('click',()=>edit(r=>{const a=r.actors.find(a=>a.id===actor.id);if(key==='paused'&&!a.paused)a.hold=(mainSession.time+a.offset)*a.speed;a[key]=!a[key];}).catch(fail));card.append(b);}
  const remove=document.createElement('button');remove.className='danger';remove.textContent='移除此实例';remove.disabled=actors.length===1;remove.addEventListener('click',()=>edit(r=>r.actors=r.actors.filter(a=>a.id!==actor.id)).catch(fail));card.append(remove);host.append(card);
}
function syncNodes(){
  const nodes=mainSession.recipe.nodes;nodeIndex=Math.max(0,Math.min(nodes.length-1,nodeIndex));const n=nodes[nodeIndex],host=$('nodeEditor');host.replaceChildren();$('nodePage').textContent=`${nodeIndex+1} / ${nodes.length}`;$('nodePrev').disabled=nodeIndex===0;$('nodeNext').disabled=nodeIndex===nodes.length-1;
  const card=document.createElement('article');card.className='edit-card';const h=document.createElement('h3');h.textContent=n.id+' · '+({clip:'片段',blend:'混合',sequence:'顺序',output:'输出'}[n.type]);card.append(h);const update=(key,value)=>edit(r=>r.nodes.find(x=>x.id===n.id)[key]=value).catch(fail);
  const connect=(label,value,change)=>field(card,label,nodeSelect(value,change));
  if(n.type==='clip'){const text=document.createElement('p');text.className='short-note';text.textContent=mainSession.row(n)?.name+' · '+n.variant;card.append(text);const replace=document.createElement('button');replace.textContent='用当前选中动作替换';replace.addEventListener('click',()=>assign(state.selected,state.variant,n.id).catch(fail));card.append(replace);numberField(card,'速度',n.speed,.1,4,.1,v=>update('speed',v));numberField(card,'相位秒',n.phase,0,3600,.05,v=>update('phase',v));choices(card,'循环',n.loop,[['repeat','重复重置'],['once','一次后保持']],v=>update('loop',v));}
  else if(n.type==='blend'){connect('输入A',n.a,v=>update('a',v));connect('输入B',n.b,v=>update('b',v));numberField(card,'B权重',n.weight,0,1,.01,v=>update('weight',v));choices(card,'时间',n.sync,[['seconds','各自按秒'],['phase','归一化相位']],v=>update('sync',v));}
  else if(n.type==='output')connect('输入',n.input,v=>update('input',v));
  else{const pages=Math.ceil(n.inputs.length/4);sequencePage=Math.max(0,Math.min(pages-1,sequencePage));const pager=document.createElement('div');pager.className='item-pager';for(const direction of [-1,1]){const b=document.createElement('button');b.textContent=direction<0?'‹':'›';b.disabled=direction<0?sequencePage===0:sequencePage===pages-1;b.addEventListener('click',()=>{sequencePage+=direction;syncNodes();});pager.append(b);}const label=document.createElement('span');label.textContent=`片段 ${sequencePage+1} / ${pages}`;pager.insertBefore(label,pager.lastChild);card.append(pager);n.inputs.slice(sequencePage*4,sequencePage*4+4).forEach((id,j)=>connect('片段 '+(sequencePage*4+j+1),id,value=>edit(r=>r.nodes.find(x=>x.id===n.id).inputs[sequencePage*4+j]=value).catch(fail)));numberField(card,'过渡秒',n.transition,0,10,.05,v=>update('transition',v));choices(card,'曲线',n.curve,[['linear','线性'],['smoothstep','平滑']],v=>update('curve',v));choices(card,'循环',n.loop,[['once','一次后保持'],['repeat','整段重复']],v=>update('loop',v));}
  const remove=document.createElement('button');remove.className='danger';remove.textContent='删除节点';remove.addEventListener('click',()=>edit(r=>r.nodes=r.nodes.filter(x=>x.id!==n.id)).catch(fail));card.append(remove);host.append(card);
}
function addNode(type){edit(r=>{let i=1;while(r.nodes.some(n=>n.id===type+i))i++;const id=type+i,ids=r.nodes.map(n=>n.id);if(type==='clip'){const row=selected(),v=selectedVariant();if(!v)throw new Error('先选择可预览动作。');r.nodes.push({id,type,clipId:row.id,variant:v.key,sha256:v.sha256,speed:1,phase:0,loop:'repeat'});}else if(type==='blend')r.nodes.push({id,type,a:ids[0],b:ids[1]||ids[0],weight:.5,sync:'phase'});else if(type==='sequence')r.nodes.push({id,type,inputs:[ids[0],ids[1]||ids[0]],transition:.2,curve:'smoothstep',loop:'repeat'});else r.nodes.push({id,type,input:ids.at(-1)});nodeIndex=r.nodes.length-1;}).catch(fail);}

function galleryClock(now){if(state.playing)state.time=state.anchorTime+(now-state.anchorNow)*.001*state.speed;return state.time;}
function galleryDuration(){return Math.max(.001,...bank.items.map(item=>bank.motion(item)?.duration||item.variant?.duration||0));}
function draw(now){
  raf=0;if(!catalog||document.hidden)return;
  const began=performance.now(),gallery=state.mode==='wall',s=activeSession();let time,playing,duration;
  if(gallery){time=galleryClock(now);duration=galleryDuration();playing=state.playing;if(!state.loop&&time>=duration){state.time=duration;state.playing=false;time=duration;playing=false;}}
  else{time=s?.clock(now)||0;duration=s?.duration||.001;playing=s?.playing||false;}
  const character=(!gallery||state.style==='character'),modelReady=character&&renderer?.modelReady;
  $('motionCanvas').hidden=!modelReady;$('wallCanvas').hidden=!!modelReady||!gallery;
  try{
    if(gallery&&!modelReady){wall.draw(bank,time,{loop:state.loop});}
    else if(modelReady&&(!playing||now-lastDraw>=1000/(gallery?30:60))){
      if(gallery){wallSession.update();wallSession.loop=state.loop;const rect=$('stage').getBoundingClientRect();wallSession.recipe.wallColumns=wallColumns(Math.max(1,bank.items.length),rect.width,rect.height);renderer.focusActor=null;renderer.drawSession(wallSession,time);}
      else renderer.drawSession(s,time);
      lastDraw=now;
    }
  }catch(error){modelError=error.message;fail(error);if(!gallery)s?.pause();}
  if(gallery&&modelReady&&!renderer.lastResult?.length&&bank.items.some(item=>bank.motion(item))){$('motionCanvas').hidden=true;$('wallCanvas').hidden=false;wall.draw(bank,time,{loop:state.loop});}
  const hasRendered=!!renderer?.lastResult?.length,ready=(modelReady?hasRendered:true)&&(gallery?bank.phase!=='error'&&bank.items.some(item=>bank.motion(item)):s?.phase==='ready'&&modelReady);
  const loadingNote=modelReady&&renderer.framingReady===false?'后台准备取景 · 已就绪内容可继续查看':character&&!modelReady?'后台加载角色与贴图…':!ready?'后台加载动作…':'';
  $('stageMessage').hidden=!(modelError||(gallery?bank.error:s?.error)||(gallery?bank.phase:s?.phase)==='cleared'||!filtered.length&&gallery);$('stageMessage').textContent=modelError||(modelReady&&renderer.framingReady===false?'正在准备整段动作的固定取景…':gallery&&bank.error?bank.error:(gallery?bank.phase:s?.phase)==='cleared'?'预览已清理；在视图页重新载入，或切换动作页继续。':!filtered.length&&gallery?'没有匹配动作，请修改关键词或重置筛选。':!gallery&&s?.error?s.error:character&&!modelReady?'读取真实角色与贴图…':'读取当前页真实动作…');
  $('renderBadge').textContent=gallery?(modelReady?'真实角色 · '+bank.items.filter(x=>bank.motion(x)).length+'片原地对照':'骨架速览 · 原始世界姿态'):(state.mode==='mix'?'A / B / 混合 · 实际角色':'单片实际角色');
  $('playButton').textContent=playing?'Ⅱ':'▶';$('playButton').disabled=!ready;$('currentTime').textContent=(gallery&&state.loop?time%duration:time).toFixed(2);$('durationTime').textContent=duration.toFixed(2)+' s';$('timeline').max=String(duration);$('timeline').value=String(gallery&&state.loop?time%duration:time);$('timeline').disabled=!ready;$('loopToggle').setAttribute('aria-pressed',String(gallery?state.loop:s?.recipe?.loop));
  if(gallery&&modelReady){const rendered=new Set((renderer.lastResult||[]).map(r=>r.actor.id));for(const[i,tile]of [...$('wallTiles').children].entries()){const item=bank.items[i],message=tile.querySelector('.tile-message');if(item&&bank.motion(item)&&!bank.errors.has(item.row.id)){message.hidden=rendered.has('wallactor'+i);message.textContent='后台准备取景…';}}$('stageStatus').textContent=`${renderer.lastResult?.length||0} / ${pageRows.length} 片可看${renderer.framingReady===false?' · 其余后台准备':''}`;}
  if(!gallery){$('stageStatus').textContent=s?.phase==='cleared'?'预览已清理':s?.phase==='error'?'载入失败':ready?(playing?'实际角色播放中':'实际角色已暂停')+(renderer.preparingActors?' · '+renderer.preparingActors+'项后台准备':''):(loadingNote||'准备角色与动作');renderActorLabels(s);}
  $('retryLoad').hidden=!(modelError||s?.phase==='error'||s?.phase==='cleared'||bank.phase==='error'||bank.phase==='cleared'||bank.errors.size>0);
  drawTimes.push(performance.now()-began);if(drawTimes.length>300)drawTimes.shift();
  if(ready)ensureCache().catch(()=>{});if((playing&&ready||modelReady&&renderer.framingReady===false)&&!modelError)request();
}
function renderActorLabels(s){
  if(!s?.recipe||s.phase!=='ready'){$('actorLabels').hidden=true;$('actorLabels').replaceChildren();return;}
  $('actorLabels').hidden=state.mode==='wall'||!!renderer?.focusActor;if($('actorLabels').hidden)return;
  const positions=renderer?.labelPositions||[];if($('actorLabels').children.length!==positions.length)$('actorLabels').replaceChildren(...positions.map(()=>document.createElement('span')));
  const rows=s.recipe.layout==='compare'?Math.ceil(positions.length/Math.min(3,Math.max(1,positions.length))):0;
  for(const [i,p]of positions.entries()){const label=$('actorLabels').children[i],a=s.recipe.actors.find(a=>a.id===p.id);label.textContent=a?.label||p.id;label.style.left=p.x*100+'%';label.style.top=(rows?(p.y-1/rows)*100+'%':p.y*100+'%');label.style.marginTop='6px';label.style.setProperty('--actor',a?.node==='A'?'#4bc6df':a?.node==='B'?'#ed9b8a':'#e4c57e');}
}

function requiredResources(){const common=['studio.js','studio.css','library-browser.js','motion-wall.js','mvp.js','renderer.js','workbench-renderer.js','motion-session.js','native-root.js','cache-client.js','character.js','vendor/three/three.module.min.js','vendor/three/GLTFLoader.js','vendor/three/BufferGeometryUtils.js','vendor/three/SkeletonUtils.js'];if(renderer?.modelReady)common.push(...renderer.getOfflineAssets());if(state.mode==='wall')common.push(...bank.items.filter(x=>bank.motion(x)).map(x=>x.variant.url));else{const s=activeSession();if(s?.recipe)for(const n of s.recipe.nodes.filter(n=>n.type==='clip')){const v=s.variant(n);common.push(v.url);if(v.rootData)common.push(v.rootData);if(s.recipe.rootMode==='animator'&&v.animatorRoot)common.push(v.animatorRoot);}}return [...new Set(common)].map(x=>new URL(x,location.href).href).sort();}
function cacheTicket(){return `${state.mode}:${state.mode==='wall'?bank.generation:activeSession().generation}:${state.mode==='wall'?state.style:'character'}:${state.character}:${renderer?.modelReady?'model':'pending-model'}`;}
async function ensureCache(){
  if(!offline?.available||clearing||(state.mode==='wall'&&bank.phase!=='ready'))return;const ticket=cacheTicket();if(lastCacheGeneration===ticket)return;lastCacheGeneration=ticket;
  const resources=requiredResources(),motion=resources.find(x=>x.endsWith('.mvp.gz'));if(!motion)return;
  const valid=()=>!clearing&&ticket===cacheTicket()&&(state.mode==='wall'?bank.phase==='ready':activeSession().phase==='ready');
  try{await offline.resume();if(!valid())return;await offline.registerResources(resources);if(!valid())return;if(offline.error)throw new Error(offline.error);await offline.ensureCurrent(motion);if(offline.error)throw new Error(offline.error);}catch(error){if(valid())cacheChanged(offline.last,error.message);}
}
function boundCache(){
  const stats=offline?.last;if(!stats)return null;
  const expected=requiredResources(),reported=[...(stats.resourceURLs||[])].sort(),motion=expected.find(url=>url.endsWith('.mvp.gz'));
  const ready=state.mode==='wall'?bank?.phase==='ready'&&(state.style==='skeleton'||renderer?.modelReady):activeSession()?.phase==='ready'&&renderer?.modelReady;
  const matches=!!(ready&&!clearing&&offline.available&&!offline.error&&motion&&stats.url===motion&&JSON.stringify(expected)===JSON.stringify(reported));
  return {...stats,currentCombination:matches,offlineReady:matches&&!!stats.offlineReady};
}
function cacheChanged(stats,error){importControl();$('retryLoad').disabled=clearing;$('retryCacheButton').disabled=clearing;stats=boundCache();$('cacheUsage').textContent=stats?`${(stats.bytes/1048576).toFixed(1)} MB · ${stats.count}个资源`:'离线缓存准备中';$('cacheState').textContent=error?'缓存未完整 · 可重试':stats?.offlineReady?'当前依赖可离线重开':state.mode==='wall'?`本页按需加载 · ${(bank?.bytes/1048576||0).toFixed(1)} MB`:'组合缓存中';$('clearCacheButton').disabled=!offline?.available||clearing;$('retryCacheButton').hidden=!error;}
function clearLocal(){viewIntent++;modelImportGeneration++;modelImport={phase:'idle',error:null};importFeedback();bank?.clear();wallSession?.clear();mainSession?.clear();detailSession?.clear();wall?.clear();renderer?.clearPreviewResources();modelError=null;lastCacheGeneration='';rootProofs.clear();nativeRootTicket++;state.playing=false;state.time=0;state.anchorTime=0;state.anchorNow=performance.now();$('actorLabels').hidden=true;$('actorLabels').replaceChildren();tileStatus();request();}
function report(){
  const s=activeSession(),gallery=state.mode==='wall';if(gallery)galleryClock(performance.now());else s?.clock();
  if(!gallery&&renderer?.modelReady&&s?.phase==='ready')renderer.drawSession(s,s.time);
  const evaluations=gallery?bank.items.map((item,i)=>({actor:'wallactor'+i,node:'wall'+i,clipId:item.row.id,variant:item.variant?.key,sha256:item.variant?.sha256,localTime:bank.motion(item)?.duration>0?(state.loop?state.time%bank.motion(item).duration:Math.min(state.time,bank.motion(item).duration)):0,loaded:!!bank.motion(item),animatorRootApplied:false})):s?.resolve(s.time).evaluations||[];
  return {...(s?.snapshot()||{}),phase:gallery?bank.phase:s?.phase,time:gallery?state.time:s?.time||0,duration:gallery?galleryDuration():s?.duration||0,playing:gallery?state.playing:!!s?.playing,speed:gallery?state.speed:s?.speed||1,loop:gallery?state.loop:s?.recipe?.loop,decodedBytes:gallery?bank.bytes:s?.snapshot().decodedBytes||0,mainPlayback:{phase:mainSession.phase,time:mainSession.time,duration:mainSession.duration,playing:mainSession.playing,speed:mainSession.speed,loop:mainSession.recipe?.loop},recipe:gallery?null:s?.recipe?currentRecipe():null,mixRecipe:mainSession.exportRecipe(),evaluations,nativeAnimatorRootProfiles:gallery?0:s?.roots.size||0,nativeRootSupply:gallery?[]:(s?.recipe?.nodes.filter(n=>n.type==='clip'&&n.variant==='native')||[]).map(n=>{const v=s.variant(n);return {node:n.id,id:n.clipId,loaded:rootProofs.has(v.rootDataSha256),...v.rootDataSummary,rawUnits:'RootT 是归一化 Humanoid 单位；不是米',animatorRootApplied:false,sourceIdentity:v.sourceIdentities.nativeClipSha256};}),site:location.origin+location.pathname,mode:state.mode,character:{key:state.character,label:CHARACTER_PROFILES[state.character].label,asset:CHARACTER_PROFILES[state.character].asset,source:renderer?.modelReady&&renderer.characterProfile.key===state.character?renderer.modelSource:null,expectedSource:CHARACTER_PROFILES[state.character].source||null},advanced:document.body.classList.contains('advanced-mode'),
    library:{total:catalog.clips.length,ready:catalog.clips.filter(r=>readyVariants(r).length).length,results:filtered.length,query:state.query,filters:{category:state.category,subcategory:state.subcategory,weapon:state.weapon,inPlace:state.inPlace,loop:state.loopFilter,duration:state.duration,posture:state.posture},page:state.page,density:state.density,selected:state.selected},
    gallery:{...bank.snapshot(),style:state.style,playing:state.playing,time:state.time,speed:state.speed,loop:state.loop,duration:galleryDuration(),sourceSkeleton:wall.diagnostics(),actorRendering:state.style==='character'?renderer?.diagnostics():null},
    rendering:gallery&&(state.style==='skeleton'||!renderer?.modelReady)?wall.diagnostics():renderer?.diagnostics()||{modelReady:false},modelImport:{...modelImport,expectedSha256:YUUKA_SOURCE.sha256},cache:boundCache(),cacheError:offline?.error||null,rendererError:modelError,download:downloadState,
    performance:{recentDrawMs:drawTimes.slice(-120),drawCount:wall.frames,rendererCalls:renderer?.webgl.info.render.calls||0},
    capabilities:{...(s?.snapshot().capabilities||{}),nativeAnimatorRootApplied:!gallery&&s?.recipe?.rootMode==='animator'&&s.roots.size>0,allCatalogSearch:true,sourceCopy:true,originalFBXDownload:!!catalog.library?.originalSources,bulkSkeletonMax:64,bulkCharacterMax:64,singleViewport:true}};
}
async function copy(text){$('recipeText').value=text;try{await navigator.clipboard.writeText(text);notice('已复制。');}catch{$('dialogTitle').textContent='手动复制';$('recipeDialog').showModal();$('recipeText').focus();$('recipeText').select();notice('浏览器未授予剪贴板，请复制选中文本。');}}
function openEditor(){activeSession()?.pause();$('dialogTitle').textContent='配方与工作区';$('recipeText').value=JSON.stringify(workspace(),null,2);if(!$('recipeDialog').open)$('recipeDialog').showModal();}
function downloadRecipe(){const value={...workspace(),state:report()},url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='motion-workbench-recipe.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function applyWorkspace(input){
  const recipe=validateRecipe(input.recipe||input,catalog),intent=++viewIntent,pending=mainSession.setRecipe(recipe),generation=mainSession.generation;
  if(!await pending||mainSession.generation!==generation||mainSession.phase!=='ready'||intent!==viewIntent)return false;
  let mode='mix';if(input.browse){const browse=cleanBrowse(input.browse);mode=browse.mode||'mix';state={...state,...browse,playing:false,anchorNow:performance.now(),anchorTime:0};filterRows();}
  if(mode==='detail'){const inspection=inspectSelected(),detailGeneration=detailSession.generation;if(!await inspection||detailSession.generation!==detailGeneration||state.mode!=='detail'||mainSession.generation!==generation)return false;}else modeChanged(mode);
  if(mode==='mix'&&recipe.view)Object.assign(ensureRenderer(),{yaw:recipe.view.yaw,pitch:recipe.view.pitch,zoom:recipe.view.zoom,follow:recipe.view.follow,skeleton:recipe.view.skeleton,trail:recipe.view.grid,focusActor:recipe.view.focus==='all'?null:recipe.view.focus});
  persistent();$('recipeDialog').close();syncInspector();notice('配方与工作区已载入。');return true;
}

async function downloadSelected(kind){
  const row=selected(),variant=selectedVariant(),original=originalSource(row,catalog);if(!row||downloadState?.phase==='loading')return;
  const config=kind==='original'?{url:original?.url,sha256:original?.sha256,bytes:original?.bytes,filename:original?.path.split('/').at(-1)}:{url:variant?new URL(variant.url,location.href).href:null,sha256:variant?.sha256,bytes:variant?.bytes,filename:variant?.url.split('/').at(-1)};
  if(!config.url)throw new Error('当前固定版本下载尚未准备完成。');downloadState={phase:'loading',kind,id:row.id};renderSelection();notice('正在读取并校验 '+config.filename+'…');
  try{const result=await downloadVerified(config.url,config);downloadState={phase:'save-triggered',kind,id:row.id,...result};notice('已校验来源，开始保存 '+result.filename);}catch(error){downloadState={phase:'error',kind,id:row.id,error:error.message};throw error;}finally{renderSelection();}
}
async function copyRoot(){
  const s=activeSession(),ticket=s.generation,natives=s.recipe.nodes.filter(n=>n.type==='clip'&&n.variant==='native');if(!natives.length)throw new Error('当前精看或混合没有Native输入。');const records=[];
  for(const n of natives){const v=s.variant(n);let data=rootProofs.get(v.rootDataSha256);if(!data){const response=await fetch(v.rootData,{signal:s.controller.signal});if(!response.ok)throw new Error('原根曲线读取失败');const bytes=await response.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw new Error('原根曲线超过大小限制');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==v.rootDataSha256)throw new Error('原根曲线内容身份不一致');data=JSON.parse(new TextDecoder().decode(bytes));if(data.schema!=='motion-native-root-curves.v1'||data.id!==n.clipId||data.nativeClipSha256!==v.sourceIdentities.nativeClipSha256||data.sourceIdentities.avatarFbxSha256!==v.sourceIdentities.avatarFbxSha256||data.animatorRootApplied!==false)throw new Error('原根曲线来源对象不一致');const expected=['RootT.x','RootT.y','RootT.z','RootQ.x','RootQ.y','RootQ.z','RootQ.w'];if(expected.some(key=>!Array.isArray(data.curves?.[key])||!data.curves[key].length||data.curves[key].some((k,i,keys)=>!Number.isFinite(k.time)||!Number.isFinite(k.value)||(i&&k.time<=keys[i-1].time))))throw new Error('原始根曲线不完整。');if(ticket!==s.generation||s.phase!=='ready')throw new Error('当前组合已改变，请重新复制');rootProofs.set(hash,data);}records.push(data);}
  if(ticket!==s.generation||s.phase!=='ready')throw new Error('当前组合已改变，请重新复制');await copy(JSON.stringify({schema:'motion-native-root-probe.v1',complete:true,animatorRootApplied:false,inputs:natives.map(n=>({node:n.id,clipId:n.clipId,variant:n.variant,sha256:n.sha256,rootDataSha256:s.variant(n).rootDataSha256})),records},null,2));
}

try{
  const response=await fetch('data/catalog.json');if(!response.ok)throw new Error('目录读取失败');const text=await response.text();if(text.length>16*1024*1024)throw new Error('目录超过大小限制');catalog=JSON.parse(text);if(catalog.version!==1||!Array.isArray(catalog.clips))throw new Error('目录结构不正确');
  try{const saved=JSON.parse(localStorage.getItem('motion-studio-browse-v1')||'null');if(saved)state={...state,...cleanBrowse(saved),playing:state.playing,anchorNow:performance.now(),anchorTime:0};}catch{}
  state.density=[12,24,48,64].includes(Number(state.density))?Number(state.density):24;if(!CHARACTER_PROFILES[state.character]?.asset)state.character=DEFAULT_CHARACTER;state.favorites=state.favorites.filter(id=>catalog.clips.some(r=>r.id===id));state.basket=state.basket.filter(id=>catalog.clips.some(r=>r.id===id));if(!catalog.clips.some(r=>r.id===state.selected))state.selected=catalog.clips[0].id;
  const savedMode=state.mode;
  mainSession=new MotionSession(catalog,{onChange:()=>{lastCacheGeneration='';saveMainRecipe();if(offline)cacheChanged(offline.last,offline.error);request();}});detailSession=new MotionSession(catalog,{onChange:()=>{lastCacheGeneration='';if(offline)cacheChanged(offline.last,offline.error);request();}});
  bank=new MotionBank({fetchMotion,onChange:()=>{tileStatus();lastCacheGeneration='';if(offline)cacheChanged(offline.last,offline.error);request();}});wall=new SkeletonWall($('wallCanvas'),{onChange:request,onError:fail});wallSession=new WallSession(bank);
  offline=new PreviewCache({onChange:cacheChanged,onClear:clearLocal});offline.init().then(()=>{cacheChanged(offline.last,offline.error);request();});
  for(const cat of [{code:'all',label:'全部动作',count:catalog.clips.length},...catalog.categories]){const b=document.createElement('button');b.className='category-button';b.dataset.category=cat.code;b.style.setProperty('--cat',CATEGORY_COLORS[cat.code]||'#3e708e');const code=document.createElement('span'),name=document.createElement('span'),count=document.createElement('span');code.className='code';code.textContent=cat.code==='all'?'ALL':cat.code;name.className='name';name.textContent=cat.label;count.className='count';count.textContent=cat.count;b.title=cat.label;b.append(code,name,count);b.addEventListener('click',()=>{state.category=cat.code;state.subcategory='all';state.page=0;filterRows();});$('categories').append(b);}
  for(const name of [...new Set(catalog.clips.map(r=>r.subcategory))].sort((a,b)=>a.localeCompare(b,'zh-CN')))$('subcategory').append(option(name,name));for(const name of [...new Set(catalog.clips.map(r=>r.weapon))].sort((a,b)=>a.localeCompare(b,'zh-CN')))$('weapon').append(option(name,name));for(const name of [...new Set(catalog.clips.flatMap(r=>r.postures||[]))].filter(x=>x!=='未指定'))$('posture').append(option(name,name));
  const bind=(id,event,fn)=>$(id).addEventListener(event,fn);let searchTimer;bind('search','input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=$('search').value;state.page=0;filterRows();},120);});
  for(const [id,key]of [['subcategory','subcategory'],['weapon','weapon'],['inPlace','inPlace'],['loopFilter','loopFilter'],['durationFilter','duration'],['posture','posture'],['variantKind','variant'],['sortBy','sort']])bind(id,'change',()=>{state[key]=$(id).value;state.page=0;filterRows();});
  bind('density','change',()=>{state.density=Number($('density').value);state.page=0;filterRows();});bind('wallStyle','change',()=>{state.style=$('wallStyle').value;modelError=null;if(state.style==='character')ensureRenderer();persistent();if(offline)cacheChanged(offline.last,offline.error);request();});bind('favoritesOnly','click',()=>{state.favoritesOnly=!state.favoritesOnly;state.page=0;filterRows();});bind('basketOnly','click',()=>{state.basketOnly=!state.basketOnly;state.page=0;filterRows();});bind('clearFilters','click',()=>{state={...state,...defaults,density:state.density,style:state.style,selected:state.selected};filterRows();});
  for(const [id,delta]of [['prevPage',-1],['nextPage',1]])bind(id,'click',()=>{state.page+=delta;filterRows();});bind('jumpPage','click',()=>{state.page=Number($('pageJump').value)-1;filterRows();});bind('pageJump','keydown',event=>{if(event.key==='Enter'){$('jumpPage').click();event.preventDefault();}});
  for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>b.dataset.mode==='detail'?inspectSelected().catch(fail):modeChanged(b.dataset.mode));for(const b of document.querySelectorAll('[data-panel]'))b.addEventListener('click',()=>setPanel(b.dataset.panel));for(const b of document.querySelectorAll('[data-add-node]'))b.addEventListener('click',()=>addNode(b.dataset.addNode));
  bind('home','click',()=>modeChanged('wall'));bind('advancedToggle','click',()=>setAdvanced(!document.body.classList.contains('advanced-mode')));bind('copyPath','click',()=>copy(selected()?.originalSource?.path||''));bind('rootMotionToggle','click',()=>toggleRootMotion().catch(fail));bind('characterSelect','change',async()=>{modelImportGeneration++;modelImport={phase:'idle',error:null};importFeedback();state.character=$('characterSelect').value;try{const active=ensureRenderer();await active.loadModel();if(active.characterProfile.key!==state.character)return;persistent();syncInspector();request();}catch(error){fail(error);}});bind('toggleFilters','click',()=>openPanel('filterPanel'));bind('toggleInspector','click',()=>openPanel('inspectorPanel'));bind('panelBackdrop','click',closePanels);
  bind('workspaceMenuToggle','click',()=>{const open=$('workspaceMenu').hidden;$('workspaceMenu').hidden=!open;$('workspaceMenuToggle').setAttribute('aria-expanded',String(open));if(open)$('copyProbeMenu').focus();});bind('copyProbeMenu','click',()=>{closeMenu();copy(JSON.stringify(report(),null,2));});bind('downloadRecipeMenu','click',()=>{closeMenu();downloadRecipe();});bind('openRecipeMenu','click',()=>{closeMenu();openEditor();});document.addEventListener('pointerdown',event=>{if(!$('workspaceMenu').contains(event.target)&&event.target!==$('workspaceMenuToggle'))closeMenu();});
  bind('inspectSelected','click',()=>inspectSelected().catch(fail));bind('assignA','click',()=>assign(state.selected,null,'A').catch(fail));bind('assignB','click',()=>assign(state.selected,null,'B').catch(fail));bind('copySource','click',()=>copy(sourceText(selected(),catalog,selectedVariant())));bind('downloadOriginal','click',()=>downloadSelected('original').catch(fail));bind('downloadPreview','click',()=>downloadSelected('preview').catch(fail));bind('favoriteSelected','click',()=>toggleFavorite());bind('basketSelected','click',()=>toggleBasket());bind('notePrev','click',()=>{selectionNote--;renderSelection();});bind('noteNext','click',()=>{selectionNote++;renderSelection();});
  for(const canvas of [$('wallCanvas'),$('motionCanvas')]){let start=null;canvas.addEventListener('pointerdown',event=>start=[event.clientX,event.clientY]);canvas.addEventListener('click',event=>{if(state.mode!=='wall'||(start&&Math.hypot(event.clientX-start[0],event.clientY-start[1])>7))return;const rect=canvas.getBoundingClientRect(),cols=wallColumns(Math.max(1,pageRows.length),rect.width,rect.height),rows=Math.ceil(pageRows.length/cols),slot=Math.floor((event.clientY-rect.top)/rect.height*rows)*cols+Math.floor((event.clientX-rect.left)/rect.width*cols);if(pageRows[slot])selectRow(pageRows[slot].id);});canvas.addEventListener('dblclick',()=>inspectSelected().catch(fail));}
  bind('playButton','click',()=>{if(state.mode==='wall'){galleryClock(performance.now());state.playing=!state.playing;state.anchorTime=state.time;state.anchorNow=performance.now();request();}else{const s=activeSession();s.playing?s.pause():s.play();}});bind('startButton','click',()=>{if(state.mode==='wall'){state.time=0;state.anchorTime=0;state.anchorNow=performance.now();request();}else activeSession().seek(0);});bind('timeline','input',()=>{const t=Number($('timeline').value);if(state.mode==='wall'){state.playing=false;state.time=t;state.anchorTime=t;request();}else activeSession().seek(t);});bind('speedSelect','change',()=>{const speed=Number($('speedSelect').value);if(state.mode==='wall'){galleryClock(performance.now());state.speed=speed;state.anchorTime=state.time;state.anchorNow=performance.now();}else activeSession().setSpeed(speed);request();});bind('loopToggle','click',()=>{if(state.mode==='wall')state.loop=!state.loop;else{const s=activeSession(),r=s.exportRecipe();r.loop=!r.loop;s.setRecipe(r).catch(fail);}request();});
  bind('resetCamera','click',()=>{wall.yaw=.35;wall.pitch=.06;wall.zoom=1;renderer?.resetCamera();request();});
  for(const id of ['A','B']){bind('name'+id,'click',()=>{const n=mainSession.recipe.nodes.find(n=>n.id===id);if(n?.type==='clip'){state.selected=n.clipId;state.variant=n.variant;renderSelection();setPanel('source');}});bind('focus'+id,'click',()=>{modeChanged('mix');ensureRenderer().focusActor=mainSession.recipe.actors.find(a=>a.node===id)?.id||null;request();});bind('variant'+id,'change',()=>assign(mainSession.recipe.nodes.find(n=>n.id===id).clipId,$('variant'+id).value,id).catch(fail));for(const key of ['speed','phase'])bind(key+id,'change',()=>edit(r=>r.nodes.find(n=>n.id===id)[key]=Number($(key+id).value)).catch(fail));}
  bind('blendWeight','input',()=>edit(r=>r.nodes.find(n=>n.id==='Mix').weight=Number($('blendWeight').value)).catch(fail));bind('syncMode','change',()=>edit(r=>{const sync=$('syncMode').value;r.nodes.find(n=>n.id==='Mix').sync=sync;for(const a of r.actors)a.clock=sync;}).catch(fail));bind('showMix','click',()=>{modeChanged('mix');ensureRenderer().focusActor=null;mainSession.play();request();});
  bind('actorPrev','click',()=>{actorIndex--;syncActors();});bind('actorNext','click',()=>{actorIndex++;syncActors();});bind('nodePrev','click',()=>{nodeIndex--;sequencePage=0;syncNodes();});bind('nodeNext','click',()=>{nodeIndex++;sequencePage=0;syncNodes();});bind('addActor','click',()=>edit(r=>{let i=1;while(r.actors.some(a=>a.id==='extra'+i))i++;r.actors.push({id:'extra'+i,node:r.nodes.at(-1).id,label:'实例 '+i,speed:1,offset:0,hold:0,paused:false,visible:true,clock:'seconds'});actorIndex=r.actors.length-1;}).catch(fail));
  bind('rootMode','change',()=>{const s=activeSession(),r=s.exportRecipe();r.rootMode=$('rootMode').value;for(const n of r.nodes.filter(n=>n.type==='clip')){if(r.rootMode==='animator'&&n.variant==='native')n.animatorRootSha256=s.variant(n).animatorRootSha256;else delete n.animatorRootSha256;}acceptRecipe(s,r,syncInspector).catch(fail);});bind('layoutMode','change',()=>{const s=activeSession(),r=s.exportRecipe();r.layout=$('layoutMode').value;acceptRecipe(s,r,syncInspector).catch(fail);});bind('focusActor','change',()=>{ensureRenderer().focusActor=$('focusActor').value==='all'?null:$('focusActor').value;request();});
  for(const [id,key]of [['skeletonToggle','skeleton'],['gridToggle','trail'],['followToggle','follow']])bind(id,'click',()=>{const r=ensureRenderer();r.setOptions({[key]:!r[key]});$(id).setAttribute('aria-pressed',String(r[key]));request();});
  bind('copyProbe','click',()=>copy(JSON.stringify(report(),null,2)));bind('downloadRecipe','click',downloadRecipe);bind('openRecipe','click',openEditor);bind('showRecipe','click',openEditor);bind('copyText','click',()=>copy($('recipeText').value));bind('copyRootProbe','click',()=>copyRoot().catch(fail));bind('copyLink','click',()=>{try{const u=new URL(location.href);u.hash='workspace='+encodeRecipe(workspace());copy(u.href);}catch(error){fail(error);}});
  bind('applyRecipe','click',async()=>{try{await applyWorkspace(JSON.parse($('recipeText').value));}catch(error){fail(error);}});bind('recipeFile','change',async()=>{const file=$('recipeFile').files[0];if(!file)return;if(file.size>1024*1024){notice('配方超过1 MB');return;}$('recipeText').value=await file.text();});
  bind('importYuuka','click',()=>$('yuukaFile').click());bind('yuukaFile','change',async()=>{const file=$('yuukaFile').files[0];$('yuukaFile').value='';if(file)try{await importYuuka(file);}catch{}});
  bind('clearCacheButton','click',async()=>{if(clearing)return;clearing=true;clearLocal();try{if(offline.available)await offline.clear();notice('已清理全部预览实例和缓存。');}catch(error){fail(error);}finally{clearing=false;cacheChanged(offline.last);}});bind('retryLoad','click',async()=>{modelError=null;if(state.mode==='wall'){if(state.style==='character')ensureRenderer();filterRows();}else{ensureRenderer();const s=activeSession();try{await s.setRecipe(s.exportRecipe());}catch(error){fail(error);}}request();});bind('retryCacheButton','click',async()=>{try{await offline.retry();lastCacheGeneration='';request();}catch(error){fail(error);}});
  let recipe=defaultRecipe(catalog),restoreMode=savedMode||'wall';
  try{const saved=localStorage.getItem('motion-studio-recipe-v1');if(saved)recipe=validateRecipe(JSON.parse(saved),catalog);}catch{notice('保存的配方已损坏或内容版本过期，已恢复默认配方；筛选与收藏仍保留。');}
  try{if(location.hash.startsWith('#recipe=')){recipe=validateRecipe(decodeRecipe(location.hash.slice(8)),catalog);restoreMode='mix';}else if(location.hash.startsWith('#workspace=')){const shared=decodeRecipe(location.hash.slice(11));if(shared.schema!=='motion-workbench.share.v2')throw new Error('分享工作区格式无效。');const checked=validateRecipe(shared.recipe,catalog);state={...state,...cleanBrowse(shared.browse)};recipe=checked;restoreMode=state.mode;}}catch(error){notice(error.message+' 已保留本机工作区。');}
  const startupIntent=viewIntent,startupPending=mainSession.setRecipe(recipe),startupGeneration=mainSession.generation;let startupCurrent=false;try{startupCurrent=!!await startupPending&&mainSession.generation===startupGeneration&&viewIntent===startupIntent&&mainSession.phase==='ready';}catch(error){if(mainSession.generation===startupGeneration&&viewIntent===startupIntent&&mainSession.phase!=='cleared'){notice('混合配方未载入：'+error.message+' 可先浏览动作墙或重试。');restoreMode='wall';startupCurrent=true;}}
  if(startupCurrent)filterRows();setPanel(state.panel||'source');syncInspector();$('totalReady').textContent=`${catalog.clips.filter(r=>readyVariants(r).length).length} / ${catalog.clips.length} 项实际可预览`;$('footerSummary').textContent=`${catalog.clips.length.toLocaleString()} 动作 · 保留实际帧与完整旋转`;
  if(startupCurrent){if(restoreMode==='detail'){try{await inspectSelected();}catch(error){if(detailSession.phase!=='cleared'){notice('选中动作未载入：'+error.message);modeChanged('wall');}}}else modeChanged(restoreMode);}
  if(startupCurrent&&restoreMode==='mix'&&recipe.view)Object.assign(ensureRenderer(),{yaw:recipe.view.yaw,pitch:recipe.view.pitch,zoom:recipe.view.zoom,follow:recipe.view.follow,skeleton:recipe.view.skeleton,trail:recipe.view.grid,focusActor:recipe.view.focus==='all'?null:recipe.view.focus});
  if(!location.hash.startsWith('#recipe=')&&!location.hash.startsWith('#workspace=')&&renderer)renderer.follow=false;
  restoringWorkspace=false;persistent();
  const api={get state(){return report();},get recipe(){return currentRecipe();},get catalog(){return catalog.clips.filter(r=>readyVariants(r).length).map(r=>({id:r.id,name:r.name,variants:readyVariants(r).map(v=>({key:v.key,sha256:v.sha256,duration:v.duration}))}));},importCharacter:importYuuka,setRecipe:async r=>{const intent=++viewIntent;return acceptRecipe(mainSession,r,()=>{modeChanged('mix');if(r.view)Object.assign(ensureRenderer(),{yaw:r.view.yaw,pitch:r.view.pitch,zoom:r.view.zoom,follow:r.view.follow,skeleton:r.view.skeleton,trail:r.view.grid,focusActor:r.view.focus==='all'?null:r.view.focus});syncInspector();persistent();},()=>intent===viewIntent);},select:assign,seek:t=>{if(state.mode==='wall'){if(!Number.isFinite(t)||t<0||t>3600)throw new Error('时间必须在0–3600秒内');state.playing=false;state.time=t;state.anchorTime=t;request();}else activeSession().seek(t);},play:()=>{if(state.mode==='wall'){state.playing=true;state.anchorNow=performance.now();state.anchorTime=state.time;request();}else activeSession().play();},pause:()=>{if(state.mode==='wall'){galleryClock(performance.now());state.playing=false;request();}else activeSession().pause();},redraw:request,browse:(input={})=>{const cleaned=cleanBrowse(input);state={...state,...cleaned,page:cleaned.page??0};modeChanged('wall');filterRows();},inspect:id=>{selectRow(id);return inspectSelected();},clear:clearLocal};
  Object.defineProperty(window,'motionPreviewQA',{value:api,writable:false});Object.defineProperty(window,'motionWorkbench',{value:api,writable:false});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){event.preventDefault();$('search').focus();}if(event.key==='Escape'){closePanels();closeMenu();}if(event.code==='Space'&&(event.target===document.body||event.target.tagName==='CANVAS')){event.preventDefault();$('playButton').click();}});
  document.addEventListener('keydown',event=>{if(state.mode==='wall'&&event.target.tagName==='CANVAS'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();(event.key==='ArrowLeft'?$('prevPage'):$('nextPage')).click();}},true);
  let resume=false;document.addEventListener('visibilitychange',()=>{if(document.hidden){resume=state.mode==='wall'?state.playing:activeSession().playing;api.pause();if(raf){cancelAnimationFrame(raf);raf=0;}}else{if(resume)api.play();request();}});window.addEventListener('resize',()=>{if(getComputedStyle($('toggleInspector')).display==='none')closePanels();renderTiles();tileStatus();renderSelection();request();});window.addEventListener('pagehide',()=>{persistent();bank.controller?.abort();mainSession.controller?.abort();detailSession.controller?.abort();if(raf)cancelAnimationFrame(raf);});request();
}catch(error){$('stageMessage').textContent=error.stack||error.message;$('stageStatus').textContent='工作台载入失败';fail(error);}
