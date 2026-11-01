// This entry has no renderer, character, PMX or Three dependency.
import {loadCatalog} from './catalog-loader.js';
import {searchCatalog,categoryColor,variantFor,originalSource,sourceText,downloadVerified} from './library-browser.js';
const $=id=>document.getElementById(id),events=new AbortController();
let catalog,rows=[],intent=0,runtimePromise,shared=null,detailsController,detailsId,downloading=false;
let state={query:'',category:'all',subcategory:'all',weapon:'all',inPlace:'all',loopFilter:'all',duration:'all',posture:'all',variant:'source',sort:'relevance',page:0,density:12,style:'character',character:'ue4',heldItem:'none',mode:'wall',favorites:[],basket:[],favoritesOnly:false,basketOnly:false};
const started=performance.now();let visibleAt=null;
function bind(id,type,fn){$(id)?.addEventListener(type,fn,{signal:events.signal});}
function changed(){intent++;state.page=Math.max(0,state.page||0);render();try{localStorage.setItem('motion-studio-browse-v1',JSON.stringify(state));}catch{}}
function select(id,detail=false){state.selected=id;if(detail)state.mode='detail';intent++;renderSelection();runtime();}
function renderSelection(){
  const row=catalog.clips.find(r=>r.id===state.selected);if(!row)return;
  $('selectionName').textContent=row.name;$('selectionEnglish').textContent=row.english;$('selectionCategory').textContent=row.category+' / '+row.subcategory;$('selectionId').textContent=row.id;
  $('selectedPath').textContent=row.originalSource?.path||'';const source=row.detailReady?originalSource(row,catalog):null;
  $('downloadOriginal').disabled=!source||downloading;$('copyPath').disabled=!source;$('copySource').disabled=!row.detailReady;
  $('downloadOriginal').textContent=source?'下载 '+(source.format||'fbx').toUpperCase():'读取原件信息…';$('selectionNote').textContent=source?(source.author?`${source.author} · ${source.license}`:source.path):'目录已就绪，当前详情优先读取。';
  for(const tile of $('wallTiles').children)tile.classList.toggle('selected',tile.dataset.id===row.id);
  if(!row.detailReady&&detailsId!==row.id){detailsController?.abort();detailsController=new AbortController();detailsId=row.id;const selected=row.id;
    catalog.ensureRows([selected],{signal:detailsController.signal}).then(()=>{if(!events.signal.aborted&&state.selected===selected)renderSelection();}).catch(error=>{if(error.name!=='AbortError'&&!events.signal.aborted&&state.selected===selected){detailsId=null;$('selectionNote').textContent='详情读取失败，可重新选择重试。';}});
  }
}
async function copy(text){try{await navigator.clipboard.writeText(text);}catch{$('recipeText').value=text;$('dialogTitle').textContent='复制来源';$('recipeDialog').showModal();}}
function render(){
  if(!catalog)return;document.body.classList.add('wall-mode');
  const matches=searchCatalog(catalog,{...state,loop:state.loopFilter}).filter(r=>(state.posture==='all'||r.postures?.includes(state.posture))&&(!state.basketOnly||state.basket.includes(r.id))&&(state.variant==='source'||r.variants.some(v=>v.key===state.variant)));
  const pages=Math.max(1,Math.ceil(matches.length/state.density));state.page=Math.min(state.page,pages-1);rows=matches.slice(state.page*state.density,(state.page+1)*state.density);
  $('resultCount').textContent=`${matches.length.toLocaleString()} / ${catalog.clips.length.toLocaleString()} 个动作`;$('pageLabel').textContent=`${state.page+1} / ${pages}`;$('pageRange').textContent=matches.length?`${state.page*state.density+1}–${Math.min((state.page+1)*state.density,matches.length)} / ${matches.length}`:'没有匹配动作';$('pageJump').max=pages;$('pageJump').value=state.page+1;$('prevPage').disabled=state.page===0;$('nextPage').disabled=state.page===pages-1;
  $('search').value=state.query;for(const [id,key] of [['sortBy','sort'],['density','density'],['characterSelect','character'],['heldItemSelect','heldItem'],['wallStyle','style'],['variantKind','variant'],['subcategory','subcategory'],['weapon','weapon'],['inPlace','inPlace'],['loopFilter','loopFilter'],['durationFilter','duration'],['posture','posture']])$(id).value=state[key];
  $('categories').replaceChildren();for(const c of [{code:'all',label:'全部动作',count:catalog.clips.length},...catalog.categories]){const b=document.createElement('button');b.className='category-button';b.dataset.category=c.code;b.classList.toggle('active',c.code===state.category);b.style.setProperty('--cat',categoryColor({categoryCode:c.code}));for(const [klass,text] of [['code',c.code==='all'?'ALL':c.code==='seated'?'15':c.code],['name',c.label],['count',c.count]]){const s=document.createElement('span');s.className=klass;s.textContent=text;b.append(s);}b.addEventListener('click',()=>{state.category=c.code;state.subcategory='all';state.page=0;state.mode='wall';changed();},{signal:events.signal});$('categories').append(b);}
  const tiles=$('wallTiles');tiles.hidden=false;const columns=innerWidth<600?2:Math.min(4,Math.ceil(Math.sqrt(rows.length||1)));tiles.style.setProperty('--cols',columns);tiles.style.setProperty('--rows',Math.ceil((rows.length||1)/columns));tiles.replaceChildren();
  for(const row of rows){const tile=document.createElement('article');tile.className='motion-tile';tile.dataset.id=row.id;tile.style.setProperty('--cat',categoryColor(row));const top=document.createElement('span');top.className='tile-top';top.textContent=row.category;const bottom=document.createElement('div');bottom.className='tile-bottom';const name=document.createElement('button');name.className='tile-name';name.textContent=row.name;name.title=row.english;name.addEventListener('click',()=>select(row.id),{signal:events.signal});name.addEventListener('dblclick',()=>select(row.id,true),{signal:events.signal});const meta=document.createElement('span');meta.className='tile-meta';meta.textContent=variantFor(row,state.variant)?.duration.toFixed(2)+' s';bottom.append(name,meta);tile.append(top,bottom);tiles.append(tile);}
  $('stageStatus').textContent='目录可用 · 正在载入预览';$('totalReady').textContent=`${catalog.clips.length} 项可查找`;$('footerSummary').textContent=`${catalog.clips.length.toLocaleString()} 动作 · 按当前选择加载`;
  renderSelection();
}
function runtime(){if(!runtimePromise)runtimePromise=import('./studio.js').catch(error=>{runtimePromise=null;$('stageStatus').textContent='目录可用 · 预览加载失败';$('stageMessage').hidden=false;$('stageMessage').textContent='预览暂时未能载入，目录仍可搜索与分类；点击“精看选中动作”重试。';console.error(error);});return runtimePromise;}
window.motionNavigation={get state(){return {phase:catalog?'ready':'loading',intent,started,visibleAt,browse:structuredClone(state),indexRevision:catalog?.revision};},takeover(){const result={browse:structuredClone(state),shared,intent,visibleAt};events.abort();detailsController?.abort();$('categories').replaceChildren();for(const id of ['subcategory','weapon','posture'])$(id).replaceChildren(new Option('全部','all'));return result;}};
try{
  catalog=await loadCatalog();
  try{const saved=JSON.parse(localStorage.getItem('motion-studio-browse-v1')||'null');if(saved)Object.assign(state,saved);}catch{}
  try{const fragment=location.hash,kind=fragment.startsWith('#workspace=')?'workspace':fragment.startsWith('#recipe=')?'recipe':null;if(kind){const text=fragment.slice(kind.length+2);if(text.length>16000||!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('分享内容无效。');const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));shared={kind,value};if(kind==='workspace')Object.assign(state,value.browse);else state.mode='mix';if(kind==='recipe')state.selected=value.nodes?.find(n=>n.type==='clip')?.clipId;}}
  catch(error){$('stageStatus').textContent=error.message;}
  if(!catalog.clips.some(r=>r.id===state.selected))state.selected=catalog.clips[0].id;
  if(![12,24,48,64].includes(Number(state.density)))state.density=12;state.density=Number(state.density);state.page=Math.max(0,Number(state.page)||0);
  for(const [id,key] of [['subcategory','subcategory'],['weapon','weapon'],['posture','postures']])for(const value of [...new Set(catalog.clips.flatMap(r=>r[key]||[]))].sort()){if(value==='未指定')continue;$(id).append(new Option(value,value));}
  bind('search','input',()=>{state.query=$('search').value.slice(0,200);state.page=0;state.mode='wall';changed();});
  for(const [id,key] of [['sortBy','sort'],['density','density'],['wallStyle','style'],['variantKind','variant'],['subcategory','subcategory'],['weapon','weapon'],['inPlace','inPlace'],['loopFilter','loopFilter'],['durationFilter','duration'],['posture','posture']])bind(id,'change',()=>{state[key]=id==='density'?Number($(id).value):$(id).value;state.page=0;state.mode='wall';changed();});
  for(const [id,key] of [['characterSelect','character'],['heldItemSelect','heldItem']])bind(id,'change',()=>{state[key]=$(id).value;intent++;runtime();});
  bind('nextPage','click',()=>{state.page++;changed();});bind('prevPage','click',()=>{state.page=Math.max(0,state.page-1);changed();});bind('jumpPage','click',()=>{state.page=Math.max(0,Number($('pageJump').value)-1);changed();});
  bind('inspectSelected','click',()=>select(state.selected,true));for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{state.mode=b.dataset.mode;intent++;runtime();},{signal:events.signal});
  bind('copyPath','click',()=>copy(catalog.clips.find(r=>r.id===state.selected)?.originalSource?.path||''));
  bind('copySource','click',()=>{const row=catalog.clips.find(r=>r.id===state.selected);if(row?.detailReady)copy(sourceText(row,catalog,variantFor(row,state.variant)));});
  bind('downloadOriginal','click',async()=>{const row=catalog.clips.find(r=>r.id===state.selected),source=row?.detailReady?originalSource(row,catalog):null;if(!source||downloading)return;downloading=true;renderSelection();try{await downloadVerified(source.url,{sha256:source.sha256,bytes:source.bytes,filename:source.path.split('/').at(-1)});}catch(error){$('selectionNote').textContent=error.message;}finally{downloading=false;if(!events.signal.aborted)renderSelection();}});
  bind('home','click',()=>{state.mode='wall';changed();});bind('clearFilters','click',()=>{Object.assign(state,{query:'',category:'all',subcategory:'all',weapon:'all',inPlace:'all',loopFilter:'all',duration:'all',posture:'all',page:0});changed();});
  bind('favoritesOnly','click',()=>{state.favoritesOnly=!state.favoritesOnly;changed();});bind('favoriteSelected','click',()=>{state.favorites=state.favorites.includes(state.selected)?state.favorites.filter(x=>x!==state.selected):[...state.favorites,state.selected];changed();});
  const open=panel=>{$(panel).classList.add('open');$('panelBackdrop').hidden=false;};bind('toggleFilters','click',()=>open('filterPanel'));bind('toggleInspector','click',()=>open('inspectorPanel'));bind('panelBackdrop','click',()=>{$('filterPanel').classList.remove('open');$('inspectorPanel').classList.remove('open');$('panelBackdrop').hidden=true;});bind('advancedToggle','click',()=>document.body.classList.toggle('advanced-mode'));
  render();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));visibleAt=performance.now();performance.mark('motion-navigation-visible');runtime();
}catch(error){$('stageStatus').textContent='目录读取失败';$('stageMessage').hidden=false;$('stageMessage').textContent=error.message+' 请刷新重试。';}
