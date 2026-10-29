import {MotionSession,defaultRecipe,encodeRecipe,decodeRecipe} from './motion-session.js';
import {WorkbenchRenderer} from './workbench-renderer.js';
import {PreviewCache} from './cache-client.js';

const $=id=>document.getElementById(id);
let session=null,renderer=null,offline=null,raf=0,clearing=false,rendererError=null,cacheGeneration=-1,noticeTimer=0,visibleLimit=40;
const rootProofs=new Map();let rootProofGeneration=-1;
const mobile=matchMedia('(max-width:760px)');
function notice(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,5500);}
function fail(error){notice(error.message||String(error));$('stageStatus').textContent='请检查当前操作';}
function request(){if(!raf&&!document.hidden)raf=requestAnimationFrame(draw);}
function draw(now){
  raf=0;if(!session||document.hidden)return;
  try{session.clock(now);if(renderer)renderer.drawSession(session,session.time);for(const label of $('actorLabels').children){const p=renderer.labelPositions?.find(p=>p.id===label.dataset.actor);if(p){label.style.left=(p.x*100)+'%';label.style.top=`calc(${p.y*100}% - 32px)`;}}}catch(error){rendererError=error.message;session.pause();fail(error);}
  $('currentTime').textContent=session.time.toFixed(2);$('durationTime').textContent=session.duration.toFixed(2)+' s';$('timeline').max=String(session.duration);$('timeline').value=String(session.time);$('playButton').textContent=session.playing?'Ⅱ':'▶';
  const ready=session.phase==='ready'&&renderer?.modelReady&&!rendererError,hasVisible=session.recipe?.actors.some(a=>a.visible);
  $('playButton').disabled=!ready;$('timeline').disabled=!ready;
  $('stageMessage').hidden=!!ready&&hasVisible;$('stageMessage').textContent=rendererError||session.error||(ready&&!hasVisible?'暂无可见实例，请在实例面板恢复显示。':session.phase==='cleared'?'预览缓存已清理。选择动作或重新载入以继续。':'正在读取真实角色与姿态…');
  $('retryLoad').hidden=!['cleared','error'].includes(session.phase)&&!rendererError;
  $('stageStatus').textContent=ready?(session.playing?'真实多实例播放中':'真实多实例 · 已暂停'):session.phase==='cleared'?'缓存已清理':session.phase==='error'?'载入失败':'准备真实角色与姿态';
  if(ready){ensureCache();ensureRootProofs();}if(session.playing)request();
}
function node(id){return session?.recipe?.nodes.find(n=>n.id===id);}
function readyRows(){return session.catalog.clips.filter(c=>c.variants?.some(v=>v.hasRotations===true));}
function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
function syncSpeed(){
  const select=$('speedSelect'),value=String(session.speed);
  for(const item of [...select.options])if(item.dataset.custom==='true'&&item.value!==value)item.remove();
  if(![...select.options].some(item=>item.value===value)){const item=option(value,value+'× · 自定义');item.dataset.custom='true';select.append(item);}
  select.value=value;
}
async function edit(change){
  try{const recipe=currentRecipe();change(recipe);for(const n of recipe.nodes.filter(n=>n.type==='clip')){if(recipe.rootMode==='animator'&&n.variant==='native'){const row=session.catalog.clips.find(c=>c.id===n.clipId),variant=row?.variants.find(v=>v.key===n.variant);n.animatorRootSha256=variant?.animatorRootSha256;}else delete n.animatorRootSha256;}if(recipe.view?.focus!=='all'&&!recipe.actors.some(a=>a.id===recipe.view.focus&&a.visible))recipe.view.focus=recipe.actors.find(a=>a.visible)?.id||'all';await session.setRecipe(recipe);syncUI();return true;}catch(error){fail(error);return false;}
}
function currentRecipe(refresh=true){if(refresh)session.clock();return {...session.exportRecipe(),view:{yaw:renderer.yaw,pitch:renderer.pitch,zoom:renderer.zoom,follow:renderer.follow,skeleton:renderer.skeleton,grid:renderer.trail,focus:renderer.focusActor||'all'}};}
async function assign(id,kind=null,target=$('assignTarget').value){
  const row=session.catalog.clips.find(c=>c.id===id),v=row?.variants.find(v=>v.key===kind&&v.hasRotations)||row?.variants.find(v=>v.key==='source'&&v.hasRotations)||row?.variants.find(v=>v.hasRotations);
  if(!v)throw new Error('这段动作尚无完整预览。');
  return edit(recipe=>{const n=recipe.nodes.find(n=>n.id===target);if(!n||n.type!=='clip')throw new Error('当前配方没有该片段输入，请用配方编辑器调整。');Object.assign(n,{clipId:id,variant:v.key,sha256:v.sha256,phase:0});});
}
function syncInputs(){
  for(const id of ['A','B']){
    const n=node(id),select=$('clip'+id),variants=$('variant'+id),isClip=n?.type==='clip';select.disabled=!isClip;variants.disabled=!isClip;$('speed'+id).disabled=!isClip;$('phase'+id).disabled=!isClip;
    if(!isClip){select.value='';variants.replaceChildren();if($('guidance'+id))$('guidance'+id).hidden=true;continue;}select.value=n.clipId;variants.replaceChildren();
    for(const v of session.row(n).variants.filter(v=>v.hasRotations===true))variants.append(option(v.key,{source:'Source · 源采样',native:'Native · 原姿态',cloud:'Cloud · 远端烘焙'}[v.key]));
    variants.value=n.variant;$('speed'+id).value=n.speed;$('phase'+id).value=n.phase;
    let guidance=$('guidance'+id);if(!guidance){guidance=document.createElement('details');guidance.id='guidance'+id;guidance.className='wb-guidance';select.closest('article').append(guidance);}
    const actual=session.variant(n),parts=[actual.use,actual.restrictions,actual.rootContract,actual.loopContract].filter(Boolean).map(x=>Array.isArray(x)?x.join('；'):String(x));
    guidance.replaceChildren();const title=document.createElement('summary');title.textContent=actual.key==='native'?'Native 用途与限制':'来源用途与限制';guidance.append(title);
    for(const text of parts){const p=document.createElement('p');p.textContent=text;guidance.append(p);}guidance.hidden=!parts.length;guidance.open=actual.key==='native';
  }
  const mix=node('Mix');$('blendWeight').disabled=!mix||mix.type!=='blend';$('syncMode').disabled=!mix||mix.type!=='blend';
  if(mix?.type==='blend'){$('blendWeight').value=mix.weight;$('weightValue').textContent=mix.weight.toFixed(2);$('syncMode').value=mix.sync;}
  $('rootMode').value=session.recipe.rootMode;$('layoutMode').value=session.recipe.layout;syncSpeed();$('loopToggle').setAttribute('aria-pressed',String(session.recipe.loop));
  const natives=session.recipe.nodes.filter(n=>n.type==='clip'&&n.variant==='native');$('copyRootProbe').disabled=!natives.length;
  $('rootNote').textContent=natives.length?`${natives.length} 个 Native 输入：${natives.filter(n=>session.variant(n).rootDataSummary?.humanScale>0).length} 个已实测 Avatar 尺度，${natives.filter(n=>session.variant(n).animatorRoot).length} 个有实际 Animator 根轨迹。${session.recipe.rootMode==='animator'?'当前按真实叶时刻应用一次根运动。':'当前保留原未应用根姿态；可选择实际 Animator 根运动。'}`:'Source / Cloud 保留实际水平髋轨迹；原地模式移除该轨迹，不冒 Unity Animator 根运动。';
}
function syncActors(){
  const actors=session.recipe.actors,focus=session.recipe.view?.focus||$('focusActor').value;$('focusActor').replaceChildren(option('all','全部实例'));
  $('actorControls').replaceChildren();$('actorLabels').replaceChildren();
  for(const actor of actors){
    $('focusActor').append(option(actor.id,actor.label+(actor.visible?'':'（隐藏）')));
    const box=document.createElement('div');box.className='wb-actor-control';const out=document.createElement('select');out.setAttribute('aria-label',actor.label+'输出节点');
    for(const n of session.recipe.nodes)out.append(option(n.id,n.id+' · '+({clip:'动作',blend:'混合',sequence:'顺序',output:'输出'}[n.type])));out.value=actor.node;out.addEventListener('change',()=>edit(r=>r.actors.find(a=>a.id===actor.id).node=out.value));
    const pause=document.createElement('button');pause.textContent=actor.paused?'恢复':'暂停';pause.setAttribute('aria-label',actor.label+(actor.paused?'恢复':'暂停'));pause.addEventListener('click',()=>edit(r=>{const a=r.actors.find(a=>a.id===actor.id);if(!a.paused)a.hold=(session.time+a.offset)*a.speed;a.paused=!a.paused;}));
    const info=document.createElement('small');info.textContent=actor.label;
    const speed=document.createElement('input');speed.type='number';speed.min='.1';speed.max='4';speed.step='.1';speed.value=actor.speed;speed.setAttribute('aria-label',actor.label+'速度');speed.addEventListener('change',()=>edit(r=>r.actors.find(a=>a.id===actor.id).speed=Number(speed.value)));
    const remove=document.createElement('button');remove.textContent='移除';remove.disabled=actors.length===1;remove.addEventListener('click',()=>edit(r=>r.actors=r.actors.filter(a=>a.id!==actor.id)));
    const show=document.createElement('button');show.textContent=actor.visible?'隐藏':'显示';show.addEventListener('click',()=>edit(r=>{const a=r.actors.find(a=>a.id===actor.id);a.visible=!a.visible;}));
    box.append(out,pause,info,speed,show,remove);$('actorControls').append(box);
    if(actor.visible){const label=document.createElement('span');label.dataset.actor=actor.id;label.textContent=actor.label;$('actorLabels').append(label);}
  }
  $('focusActor').value=focus==='all'&&session.recipe.view?'all':actors.some(a=>a.id===focus)?focus:mobile.matches?(actors.find(a=>a.node==='Mix')||actors[0]).id:'all';
  renderer.focusActor=$('focusActor').value==='all'?null:$('focusActor').value;
  $('actorLabels').hidden=!!renderer.focusActor;
  $('addActor').disabled=actors.length>=8;
  const blend=$('blendPanel');if(blend){if(mobile.matches)document.querySelector('.wb-main').insertBefore(blend,document.querySelector('.wb-inputs'));else document.querySelector('.wb-inspector').prepend(blend);}
}
function syncUI(){if(!session?.recipe)return;if(session.recipe.view){const v=session.recipe.view;Object.assign(renderer,{yaw:v.yaw,pitch:v.pitch,zoom:v.zoom,follow:v.follow,skeleton:v.skeleton,trail:v.grid});}for(const [id,key] of [['skeletonToggle','skeleton'],['gridToggle','trail'],['followToggle','follow']])$(id).setAttribute('aria-pressed',String(renderer[key]));syncInputs();syncActors();$('nodeSummary').replaceChildren();for(const n of session.recipe.nodes){const s=document.createElement('span');s.textContent=n.type==='clip'?n.id+' · '+(session.row(n)?.name||n.clipId):n.type==='blend'?`${n.id} · ${n.a} + ${n.b}`:n.type==='sequence'?`${n.id} · ${n.inputs.join(' → ')}`:`${n.id} ← ${n.input}`;$('nodeSummary').append(s);}syncNodes();request();}
function syncNodes(){
  const host=$('nodeEditor');if(!host)return;host.replaceChildren();
  for(const n of session.recipe.nodes){
    const card=document.createElement('article');card.className='wb-node-card';const title=document.createElement('strong');title.textContent=n.id+' · '+({clip:'片段',blend:'混合',sequence:'顺序',output:'输出'}[n.type]);card.append(title);
    const update=(key,value)=>edit(r=>r.nodes.find(x=>x.id===n.id)[key]=value);
    const connection=(label,value,change)=>{const field=document.createElement('label');field.textContent=label;const select=document.createElement('select');for(const other of session.recipe.nodes)if(other.id!==n.id)select.append(option(other.id,other.id));select.value=value;select.addEventListener('change',()=>change(select.value));field.append(select);card.append(field);};
    const number=(label,key,min,max,step)=>{const field=document.createElement('label');field.textContent=label;const input=document.createElement('input');Object.assign(input,{type:'number',min:String(min),max:String(max),step:String(step),value:String(n[key])});input.addEventListener('change',()=>update(key,Number(input.value)));field.append(input);card.append(field);};
    const choices=(label,key,values)=>{const field=document.createElement('label');field.textContent=label;const select=document.createElement('select');for(const [key,text] of values)select.append(option(key,text));select.value=n[key];select.addEventListener('change',()=>update(key,select.value));field.append(select);card.append(field);};
    if(n.type==='clip'){
      const text=document.createElement('small');text.textContent=(session.row(n)?.name||n.clipId)+' · '+n.variant;card.append(text);number('速度','speed',.1,4,.1);number('相位秒','phase',0,3600,.05);choices('循环','loop',[['once','一次后保持'],['repeat','重复重置']]);
    }else if(n.type==='blend'){
      connection('输入 A',n.a,value=>update('a',value));connection('输入 B',n.b,value=>update('b',value));number('B 权重','weight',0,1,.01);choices('时间','sync',[['phase','归一化相位'],['seconds','各自按秒']]);
    }else if(n.type==='sequence'){
      n.inputs.forEach((id,i)=>connection('片段 '+(i+1),id,value=>edit(r=>r.nodes.find(x=>x.id===n.id).inputs[i]=value)));
      number('最长过渡秒','transition',0,10,.05);choices('过渡曲线','curve',[['linear','线性'],['smoothstep','平滑']]);choices('循环','loop',[['once','一次后保持'],['repeat','整段重复']]);
    }else connection('输入',n.input,value=>update('input',value));
    const remove=document.createElement('button');remove.textContent='删除节点';remove.addEventListener('click',()=>edit(r=>r.nodes=r.nodes.filter(x=>x.id!==n.id)));card.append(remove);host.append(card);
  }
}
function addNode(type){return edit(r=>{let i=1;while(r.nodes.some(n=>n.id===type+i))i++;const ids=r.nodes.map(n=>n.id),id=type+i;
  if(type==='clip'){const source=r.nodes.find(n=>n.type==='clip');r.nodes.push({...source,id});}
  else if(type==='blend')r.nodes.push({id,type,a:ids[0],b:ids[1]||ids[0],weight:.5,sync:'phase'});
  else if(type==='sequence')r.nodes.push({id,type,inputs:[ids[0],ids[1]||ids[0]],transition:.2,curve:'smoothstep',loop:'repeat'});
  else r.nodes.push({id,type,input:ids.at(-1)});
});}
function list(){
  const query=$('search').value.trim().toLocaleLowerCase(),rows=readyRows().filter(c=>[c.name,c.english,c.id,c.category].join(' ').toLocaleLowerCase().includes(query));
  $('catalogCount').textContent=`${rows.length} 个可预览`;$('clipList').replaceChildren();
  for(const row of rows.slice(0,visibleLimit)){const b=document.createElement('button');b.type='button';const name=document.createElement('span'),sub=document.createElement('small');name.textContent=row.name||row.id;sub.textContent=row.english||row.id;b.append(name,sub);b.addEventListener('click',()=>assign(row.id).catch(fail));$('clipList').append(b);}
  $('moreClips').hidden=rows.length<=visibleLimit;
}
async function ensureCache(){
  if(session?.phase!=='ready'||!renderer?.modelReady||rendererError||!offline?.available||clearing||cacheGeneration===session.generation)return;
  const ticket=session.generation;cacheGeneration=ticket;
  try{
    const motions=[...new Set(session.recipe.nodes.filter(n=>n.type==='clip').map(n=>session.variant(n).url))];
    if(ticket!==session.generation||session.phase!=='ready')return;
    const resources=requiredResources();
    await offline.resume();if(ticket!==session.generation||session.phase!=='ready')return;
    await offline.registerResources(resources);if(ticket!==session.generation||session.phase!=='ready')return;
    await offline.ensureCurrent(new URL(motions[0],location.href).href);
  }catch(error){if(ticket===session.generation){cacheGeneration=-1;$('cacheState').textContent='组合缓存未完整：'+error.message;}}
}
function requiredResources(){if(!renderer||!session?.recipe)return [];const variants=session.recipe.nodes.filter(n=>n.type==='clip').map(n=>session.variant(n));return [...new Set([...renderer.getOfflineAssets(),'vendor/three/SkeletonUtils.js','motion-session.js','workbench-renderer.js','native-root.js',...variants.map(v=>v.url),...variants.map(v=>v.rootData).filter(Boolean),...(session.recipe.rootMode==='animator'?variants.map(v=>v.animatorRoot).filter(Boolean):[])])].map(url=>new URL(url,location.href).href).sort();}
async function ensureRootProofs(){
  if(session.phase!=='ready'||rootProofGeneration===session.generation)return;
  const ticket=session.generation;rootProofGeneration=ticket;
  for(const n of session.recipe.nodes.filter(n=>n.type==='clip'&&n.variant==='native')){
    const variant=session.variant(n),existing=rootProofs.get(variant.rootDataSha256);
    if(!variant.rootData)continue;
    if(existing&&existing.nativeClipSha256===variant.sourceIdentities.nativeClipSha256&&existing.sourceIdentities.avatarFbxSha256===variant.sourceIdentities.avatarFbxSha256)continue;
    rootProofs.delete(variant.rootDataSha256);
    try{
      const response=await fetch(variant.rootData,{signal:session.controller.signal});if(!response.ok)throw new Error('根曲线读取失败：HTTP '+response.status);
      const bytes=await response.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw new Error('根曲线分片过大。');
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(digest!==variant.rootDataSha256)throw new Error('根曲线内容身份不匹配。');
      const data=JSON.parse(new TextDecoder().decode(bytes));
      if(data.schema!=='motion-native-root-curves.v1'||data.id!==n.clipId||data.nativeClipSha256!==variant.sourceIdentities.nativeClipSha256||data.sourceIdentities.avatarFbxSha256!==variant.sourceIdentities.avatarFbxSha256||data.animatorRootApplied!==false)throw new Error('根曲线与当前 Native / Avatar 来源不一致。');
      const expected=['RootT.x','RootT.y','RootT.z','RootQ.x','RootQ.y','RootQ.z','RootQ.w'];
      if(expected.some(key=>!Array.isArray(data.curves[key])||!data.curves[key].length||data.curves[key].some((k,i,keys)=>!Number.isFinite(k.time)||!Number.isFinite(k.value)||(i&&k.time<=keys[i-1].time))))throw new Error('原始根曲线不完整。');
      if(ticket!==session.generation||session.phase!=='ready')return;rootProofs.set(digest,data);
    }catch(error){if(error.name!=='AbortError'&&ticket===session.generation){rootProofGeneration=-1;notice(error.message);}return {node:n.id,error:error.message};}
  }
}
function rootSummaries(){return (session.recipe?.nodes.filter(n=>n.type==='clip'&&n.variant==='native')||[]).map(n=>{const v=session.variant(n),data=rootProofs.get(v.rootDataSha256);return {node:n.id,id:n.clipId,loaded:!!data,...v.rootDataSummary,rawUnits:'RootT 是归一化 Humanoid 单位；不是米',animatorRootApplied:false,sourceIdentity:v.sourceIdentities.nativeClipSha256};});}
function boundCache(){
  const stats=offline?.last;if(!stats)return null;
  const expected=requiredResources(),reported=[...(stats.resourceURLs||[])].sort(),first=session?.recipe?.nodes.find(n=>n.type==='clip'),url=first?new URL(session.variant(first).url,location.href).href:null;
  const matches=session?.phase==='ready'&&offline?.available&&!offline?.error&&stats.url===url&&JSON.stringify(expected)===JSON.stringify(reported);
  return {...stats,currentCombination:matches,offlineReady:matches&&stats.offlineReady};
}
function cacheChanged(stats,error){
  error=error||offline?.error;
  $('clearCacheButton').disabled=clearing||!offline?.available;
  $('retryCacheButton').hidden=!error;
  $('cacheUsage').textContent=stats?`${(stats.bytes/1048576).toFixed(1)} MB · ${stats.count} 个资源`:'预览缓存准备中';
  $('cacheState').textContent=error?'仅在线播放 · '+error:session?.phase==='cleared'?'预览缓存已清理':boundCache()?.offlineReady?'当前完整组合可离线重开':session?.phase==='error'?'当前组合未完整缓存':'当前组合缓存中';
}
function clearLocal(){session?.clear();renderer?.clearPreviewResources();rootProofs.clear();rootProofGeneration=-1;cacheGeneration=-1;request();}
function report(){session.clock();if(renderer?.modelReady&&session.phase==='ready')renderer.drawSession(session,session.time);return {...session.snapshot(),recipe:currentRecipe(false),nativeRootSupply:rootSummaries(),rendering:renderer?.diagnostics()||null,cache:boundCache(),rendererError,site:location.origin+location.pathname};}
async function copy(text){
  $('recipeText').value=text;
  try{await navigator.clipboard.writeText(text);notice('已复制，可粘贴给 AI 或重新载入。');}catch{$('recipeDialog').showModal();$('recipeText').focus();$('recipeText').select();notice('请复制选中的文本。');}
}
function openEditor(){session.pause();$('recipeText').value=JSON.stringify(report(),null,2);if(!$('recipeDialog').open)$('recipeDialog').showModal();}
function download(){const data=JSON.stringify({schema:'motion-workbench.share.v1',recipe:currentRecipe(),state:report()},null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='motion-workbench-recipe.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

try{
  const response=await fetch('./data/catalog.json');if(!response.ok)throw new Error('目录读取失败：HTTP '+response.status);
  const text=await response.text();if(text.length>16*1024*1024)throw new Error('目录超过大小限制。');const catalog=JSON.parse(text);
  if(catalog.version!==1||!Array.isArray(catalog.clips))throw new Error('目录格式无效。');
  session=new MotionSession(catalog,{onChange:()=>{cacheChanged(offline?.last);request();}});
  renderer=new WorkbenchRenderer($('motionCanvas'),{onChange:request,onError:error=>{rendererError=error.message;session.pause();request();}});
  offline=new PreviewCache({onChange:cacheChanged,onClear:clearLocal});offline.init().then(available=>{cacheChanged(offline.last,offline.error);if(available)ensureCache();});
  for(const id of ['A','B']){
    for(const row of readyRows())$('clip'+id).append(option(row.id,row.name||row.english||row.id));
    $('clip'+id).addEventListener('change',()=>assign($('clip'+id).value,null,id).catch(fail));
    $('variant'+id).addEventListener('change',()=>assign(node(id).clipId,$('variant'+id).value,id).catch(fail));
    for(const [prefix,key] of [['speed','speed'],['phase','phase']])$(prefix+id).addEventListener('change',()=>edit(r=>{r.nodes.find(n=>n.id===id)[key]=Number($(prefix+id).value);}));
  }
  $('search').addEventListener('input',()=>{visibleLimit=40;list();});$('moreClips').addEventListener('click',()=>{visibleLimit+=40;list();});
  $('blendWeight').addEventListener('input',()=>edit(r=>r.nodes.find(n=>n.id==='Mix').weight=Number($('blendWeight').value)));
  $('syncMode').addEventListener('change',()=>edit(r=>{const sync=$('syncMode').value;r.nodes.find(n=>n.id==='Mix').sync=sync;for(const actor of r.actors)actor.clock=sync;}));
  $('rootMode').addEventListener('change',()=>edit(r=>r.rootMode=$('rootMode').value));
  $('layoutMode').addEventListener('change',()=>edit(r=>r.layout=$('layoutMode').value));
  $('playButton').addEventListener('click',()=>session.playing?session.pause():session.play());$('startButton').addEventListener('click',()=>session.seek(0));$('timeline').addEventListener('input',()=>session.seek(Number($('timeline').value)));$('speedSelect').addEventListener('change',()=>session.setSpeed(Number($('speedSelect').value)));
  $('loopToggle').addEventListener('click',()=>edit(r=>r.loop=!r.loop));
  $('focusActor').addEventListener('change',()=>{renderer.focusActor=$('focusActor').value==='all'?null:$('focusActor').value;$('actorLabels').hidden=!!renderer.focusActor;request();});
  mobile.addEventListener('change',()=>{syncActors();request();});$('resetCamera').addEventListener('click',()=>renderer.resetCamera());
  for(const [id,key] of [['skeletonToggle','skeleton'],['gridToggle','trail'],['followToggle','follow']])$(id).addEventListener('click',()=>{renderer.setOptions({[key]:!renderer[key]});$(id).setAttribute('aria-pressed',String(renderer[key]));request();});
  $('addActor').addEventListener('click',()=>edit(r=>{let i=1;while(r.actors.some(a=>a.id==='extra'+i))i++;r.actors.push({id:'extra'+i,node:'Mix',label:'混合实例 '+i,speed:1,offset:0,hold:0,paused:false,visible:true,clock:node('Mix')?.sync||'seconds'});}));
  for(const type of ['clip','blend','sequence','output'])$('addNode'+type).addEventListener('click',()=>addNode(type));
  $('clearCacheButton').addEventListener('click',async()=>{if(clearing||!offline.available)return;clearing=true;clearLocal();cacheChanged(offline.last);try{await offline.clear();notice('所有实例与预览缓存已清理。');}catch(error){fail(error);}finally{clearing=false;cacheChanged(offline.last);}});
  $('retryCacheButton').addEventListener('click',async()=>{$('retryCacheButton').disabled=true;try{const available=await offline.retry();cacheGeneration=-1;cacheChanged(offline.last,offline.error);if(available)ensureCache();}finally{$('retryCacheButton').disabled=false;}});
  $('retryLoad').addEventListener('click',async()=>{try{rendererError=null;renderer.loadModel();await session.setRecipe(session.exportRecipe());syncUI();}catch(error){fail(error);}});
  $('copyProbe').addEventListener('click',()=>copy(JSON.stringify(report(),null,2)));$('downloadRecipe').addEventListener('click',download);$('openRecipe').addEventListener('click',openEditor);$('showRecipe').addEventListener('click',openEditor);$('copyText').addEventListener('click',()=>copy($('recipeText').value));
  $('copyRootProbe').addEventListener('click',async()=>{
    const ticket=session.generation,failure=await ensureRootProofs();
    if(ticket!==session.generation||session.phase!=='ready'){notice('当前组合已改变，请重新复制原始根曲线。');return;}
    const natives=session.recipe.nodes.filter(n=>n.type==='clip'&&n.variant==='native'),records=natives.map(n=>rootProofs.get(session.variant(n).rootDataSha256)),missing=natives.filter((n,i)=>!records[i]);
    if(!natives.length||missing.length){notice('未复制：'+(missing.length?'节点 '+missing.map(n=>n.id).join('、')+' 的原始根曲线未完整取得。':'当前没有 Native 输入。')+(failure?' '+failure.error:' 请等待载入完成或联网重试。'));return;}
    copy(JSON.stringify({schema:'motion-native-root-probe.v1',complete:true,animatorRootApplied:false,inputs:natives.map(n=>({node:n.id,clipId:n.clipId,variant:n.variant,sha256:n.sha256,rootDataSha256:session.variant(n).rootDataSha256})),records},null,2));
  });
  $('copyLink').addEventListener('click',()=>{try{const u=new URL(location.href);u.hash='recipe='+encodeRecipe(currentRecipe());copy(u.href);}catch(error){fail(error);}});
  $('applyRecipe').addEventListener('click',async()=>{try{const input=JSON.parse($('recipeText').value);await session.setRecipe(input.recipe||input);syncUI();$('recipeDialog').close();notice('配方已载入，同一会话已恢复。');}catch(error){fail(error);}});
  $('recipeFile').addEventListener('change',async()=>{const file=$('recipeFile').files[0];if(!file)return;if(file.size>1024*1024){notice('配方文件超过 1 MB。');return;}$('recipeText').value=await file.text();});
  let recipe=defaultRecipe(catalog);if(location.hash.startsWith('#recipe=')){try{recipe=decodeRecipe(location.hash.slice(8));}catch(error){notice(error.message);}}
  try{await session.setRecipe(recipe);}catch(error){fail(error);}list();syncUI();
  const api={get state(){return report();},get recipe(){return currentRecipe();},get catalog(){return readyRows().map(r=>({id:r.id,name:r.name,variants:r.variants.filter(v=>v.hasRotations).map(v=>({key:v.key,sha256:v.sha256,duration:v.duration}))}));},setRecipe:async r=>{const result=await session.setRecipe(r);syncUI();return result;},select:assign,seek:t=>session.seek(t),play:()=>session.play(),pause:()=>session.pause(),redraw:request};
  Object.defineProperty(window,'motionPreviewQA',{value:api,writable:false});Object.defineProperty(window,'motionWorkbench',{value:api,writable:false});
  let resume=false;document.addEventListener('visibilitychange',()=>{if(document.hidden){resume=session.playing;session.pause();if(raf){cancelAnimationFrame(raf);raf=0;}}else{if(resume)session.play();request();}});
  window.addEventListener('pagehide',()=>{session.controller?.abort();session.playing=false;if(raf)cancelAnimationFrame(raf);});
  document.addEventListener('keydown',event=>{if(event.code==='Space'&&(event.target===$('motionCanvas')||event.target===document.body)){event.preventDefault();session.playing?session.pause():session.play();}});
  request();
}catch(error){$('stageMessage').textContent=error.message;$('stageMessage').hidden=false;$('stageStatus').textContent='工作台未就绪';fail(error);}
