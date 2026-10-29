import {fetchMotion} from './mvp.js';
import {MotionRenderer} from './renderer.js';
import {PreviewCache} from './cache-client.js';

const $=id=>document.getElementById(id);
const ui=Object.fromEntries(['totalCount','repositoryLink','search','categoryFilter','readyFilter','sourceFilter','resultCount','readyCount','clipList','emptyResults','clearFilters','prevPage','nextPage','pageLabel','clipBreadcrumb','clipName','clipEnglish','variantButtons','variantMeta','stageStatus','frameLabel','stageMessage','stageMessageTitle','stageMessageText','retryLoad','workflowStageLink','timeline','currentTime','durationTime','startButton','playButton','playIcon','playText','endButton','speedSelect','loopToggle','modelToggle','skeletonToggle','trailToggle','followToggle','resetCamera','detailId','detailDuration','detailJoints','detailLoop','rootPolicy','coordinatePolicy','loopPolicy','sourceLink','workflowLink','footerSummary'].map(id=>[id,$(id)]));
for(const id of ['variantGuidance','guidanceVariant','variantUseRow','variantUse','variantRestrictionsRow','variantRestrictions','variantContracts','variantRootContractRow','variantRootContract','variantLoopContractRow','variantLoopContract'])ui[id]=$(id);
for(const id of ['clearCacheLabel','cacheUsage','cacheCount','cacheMessage','cacheMeterFill','clearCacheButton','currentCacheStatus','libraryPanel','libraryToggle','libraryClose','libraryBackdrop','fullscreenButton'])ui[id]=$(id);
const PAGE_SIZE=40,CACHE_LIMIT=16*1024*1024,CACHE_COUNT=3;
const state={catalog:null,filtered:[],page:0,selected:null,variant:null,motion:null,phase:'catalog-loading',error:null,rendererError:null,time:0,frame:0,playing:false,speed:1,loop:false,anchorTime:0,anchorNow:0,raf:0,generation:0,controller:null,cache:new Map(),cacheBytes:0,requestCount:0,loadedId:null,loadedVariant:null,hidden:document.hidden};
let offline=null,cacheReady=Promise.resolve(false),cacheRefreshTimer=0,lastClearEpoch=-1,cacheClearing=false;
let renderer=null;
function createRenderer(){
  if(renderer)return;
  try{renderer=new MotionRenderer($('motionCanvas'),{onChange:()=>{if(state.rendererRecoverable&&renderer?.modelReady===true){state.rendererError=null;state.rendererRecoverable=false;}requestRender();scheduleCacheRefresh();},onError:error=>{state.rendererRecoverable=renderer?.modelReady===false;state.rendererError=navigator.onLine?error.message:'当前离线，角色资源尚未缓存。请联网后重试。';pause();showMessage('三维预览不可用',state.rendererError,'error',{retry:state.rendererRecoverable});ui.stageStatus.textContent='图形错误';updateControls();}});if(currentMotion())renderer.setMotion(currentMotion());}
  catch(error){state.rendererError=error.message;showMessage('三维预览不可用',error.message,'error');}
  updateControls();requestRender();
}
const number=n=>Number(n).toLocaleString('zh-CN');
const formatTime=t=>{t=Math.max(0,Number.isFinite(t)?t:0);return `${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;};
const kindLabel=key=>({source:'Source · 源采样',native:'Native · 原角色',cloud:'Cloud · 云端烘焙'}[key]||key);
const variants=clip=>(Array.isArray(clip?.variants)?clip.variants:[]).filter(v=>v&&['source','native','cloud'].includes(v.key)&&typeof v.url==='string'&&v.url.length);
const ready=clip=>variants(clip).some(v=>v.hasRotations===true);
const setText=(id,value)=>{ui[id].textContent=value??'—';};
const byteLabel=bytes=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;
function selectedURL(){try{return state.variant?motionURL(state.variant.url):null;}catch{return null;}}
function rendererAssets(){const value=renderer?.getOfflineAssets?.()||renderer?.offlineAssets||state.catalog?.library?.previewAssets||[];return Array.isArray(value)?value.filter(url=>typeof url==='string'):[];}
function cacheStatusText(text,cached=false){const dot=document.createElement('i');ui.currentCacheStatus.replaceChildren(dot,document.createTextNode(text));ui.currentCacheStatus.classList.toggle('cached',cached);}
function renderCache(stats,error){
  ui.clearCacheButton.disabled=!offline?.available||cacheClearing;
  ui.cacheUsage.textContent=stats?byteLabel(stats.bytes):'尚未启用';ui.cacheCount.textContent=stats?`${number(stats.count)} 个资源`:'';
  ui.cacheMeterFill.style.width=stats?`${Math.min(100,stats.bytes/stats.budget*100)}%`:'0%';
  if(error){ui.cacheMessage.textContent=error;cacheStatusText('仅在线播放');return;}
  if(state.phase==='cleared'){cacheStatusText('预览缓存已清理');ui.cacheMessage.textContent='预览资源已清空，当前预览不可离线播放；选择动作可重新加载。';return;}
  const matches=stats?.url===selectedURL();
  if(matches&&stats.offlineReady&&currentMotion()?.rotations&&!state.rendererError){cacheStatusText('可离线预览',true);ui.cacheMessage.textContent='当前动作与角色资源已完整缓存，可离线重开。';}
  else if(matches&&stats.currentCached){cacheStatusText(stats.assetsCached?'动作已缓存':'动作已缓存 · 角色资源待确认');ui.cacheMessage.textContent=stats.assetsKnown?'角色资源正在缓存，完成后可离线预览。':'动作已缓存，角色资源清单接入后确认离线状态。';}
  else{cacheStatusText(offline?.available?'当前动作未缓存':'正在准备离线缓存');ui.cacheMessage.textContent='看过的完整资源会自动缓存，可随时清理。';}
}
function scheduleCacheRefresh(){if(cacheRefreshTimer||!offline?.available||cacheClearing||state.phase==='cleared')return;cacheRefreshTimer=setTimeout(async()=>{cacheRefreshTimer=0;if(cacheClearing||state.phase==='cleared')return;const assets=rendererAssets();if(JSON.stringify(assets)!==JSON.stringify(offline.resources))await offline.registerResources(assets);await offline.refresh(selectedURL());},250);}
function applyCacheClear(event={}){
  if(event.epoch!==undefined&&event.epoch===lastClearEpoch)return;if(event.epoch!==undefined)lastClearEpoch=event.epoch;
  if(cacheRefreshTimer){clearTimeout(cacheRefreshTimer);cacheRefreshTimer=0;}state.generation++;state.controller?.abort();state.phase='cleared';resetClock();state.motion=null;state.loadedId=null;state.loadedVariant=null;state.error=null;state.cache.clear();state.cacheBytes=0;renderer?.setMotion(null);
  if(renderer?.clearPreviewResources)Promise.resolve(renderer.clearPreviewResources()).catch(error=>{ui.cacheMessage.textContent=error.message;});
  ui.stageStatus.textContent='预览缓存已清理';showMessage('预览缓存已清理','选择动作重新加载；离线页面仍可打开。');updateTime();renderDetails();requestRender();cacheStatusText('预览缓存已清理');
}
function currentMotion(){
  const motion=state.motion;
  return state.phase==='ready'&&motion&&state.selected&&state.variant
    &&state.loadedId===state.selected.id&&state.loadedVariant===state.variant.key
    &&motion.meta.kind===state.variant.key
    &&(motion.meta.id===undefined||String(motion.meta.id)===String(state.selected.id))?motion:null;
}
function safeGitHub(value){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function repositoryURL(library){const value=library?.repository;if(typeof value!=='string')return null;return safeGitHub(value.includes('://')?value:`https://github.com/${value}`);}
function setLink(element,url){if(url){element.href=url;element.hidden=false;}else{element.removeAttribute('href');element.hidden=true;}}
function motionURL(value){
  if(typeof value!=='string'||!value||value.includes('\\')||/^[a-z]+:/i.test(value)||value.startsWith('/')||value.split('/').some(p=>p==='..'))throw new Error('预览路径必须是本站相对路径。');
  const url=new URL(value,document.baseURI);
  if(url.origin!==location.origin||url.search||url.hash)throw new Error('预览路径无效。');
  return url.href;
}
function showMessage(title,text,type='normal',{retry=false,workflow=false}={}){
  ui.stageMessage.hidden=false;ui.stageMessage.classList.toggle('error',type==='error');ui.stageMessageTitle.textContent=title;ui.stageMessageText.textContent=text;ui.retryLoad.hidden=!retry;ui.workflowStageLink.hidden=!(workflow&&ui.workflowStageLink.hasAttribute('href'));
}
function hideMessage(){ui.stageMessage.hidden=true;}
function syncClock(now){
  const motion=currentMotion();
  if(!state.playing||!motion)return;
  let time=state.anchorTime+(now-state.anchorNow)*.001*state.speed;
  if(time>=motion.duration){
    if(state.loop&&motion.duration>0){time%=motion.duration;state.anchorTime=time;state.anchorNow=now;}
    else{time=motion.duration;state.playing=false;state.anchorTime=time;state.anchorNow=0;}
  }
  state.time=Math.max(0,time);
}
function requestRender(){if(!state.raf&&!document.hidden)state.raf=requestAnimationFrame(tick);}
function tick(now){
  state.raf=0;if(document.hidden)return;
  syncClock(now);
  if(renderer&&!state.rendererError){if(!currentMotion()&&renderer.motion)renderer.setMotion(null);const sample=renderer.draw(state.time);if(sample)state.frame=sample.frame;}
  updateTime();
  if(state.playing)requestRender();
}
function resetClock(){state.playing=false;state.time=0;state.frame=0;state.anchorTime=0;state.anchorNow=0;}
function pause(){if(state.playing&&!document.hidden)syncClock(performance.now());state.playing=false;state.anchorTime=state.time;state.anchorNow=0;updateControls();requestRender();}
function play(){
  const motion=currentMotion();
  if(!motion||!renderer||state.rendererError||renderer.modelReady===false||motion.duration<=0)return;
  if(renderer.modelReady===true&&!motion.rotations)return;
  if(state.time>=motion.duration)state.time=0;
  state.playing=true;state.anchorTime=state.time;state.anchorNow=performance.now();updateControls();requestRender();
}
function seek(time){const motion=currentMotion();if(!motion)return;pause();state.time=Math.max(0,Math.min(motion.duration,Number(time)||0));state.anchorTime=state.time;state.anchorNow=0;requestRender();updateTime();}
function updateControls(){
  const motion=currentMotion(),hasRoleTrack=renderer?.modelReady!==true||!!motion?.rotations,playable=!!motion&&!!renderer&&!state.rendererError&&renderer.modelReady!==false&&hasRoleTrack,playing=playable&&state.playing;
  for(const id of ['timeline','startButton','playButton','endButton'])ui[id].disabled=!playable;
  ui.playIcon.textContent=playing?'Ⅱ':'▶';ui.playText.textContent=playing?'暂停':'播放';ui.playButton.setAttribute('aria-label',playing?'暂停预览（空格）':'播放预览（空格）');
  ui.timeline.max=String(motion?.duration||1);
  if(motion&&renderer&&!state.rendererError){
    if(renderer.modelReady===false){ui.stageStatus.textContent='角色资源加载中';showMessage('正在准备大黑塔','角色资源就绪后即可播放与旋转预览。');}
    else if(!hasRoleTrack){ui.stageStatus.textContent='角色动作待转换';showMessage('这段角色动作还在准备中','现有骨点预览已保留，完整角色旋转轨道就绪后即可播放。');}
    else{if(['正在准备大黑塔','这段角色动作还在准备中'].includes(ui.stageMessageTitle.textContent))hideMessage();ui.stageStatus.textContent=renderer.modelReady===undefined?'骨点预览 · 大黑塔待接入':playing?'预览播放中':state.time>=motion.duration&&motion.duration>0?'结束 · 保持末帧':'预览已暂停';}
  }
  else if(motion&&!renderer&&!state.rendererError){ui.stageStatus.textContent='正在准备角色';showMessage('正在准备大黑塔','角色资源就绪后即可播放与旋转预览。');}
  else if(state.phase==='loading')ui.stageStatus.textContent='读取当前分片';
  else if(state.phase==='pending')ui.stageStatus.textContent='待烘焙';
  else if(state.phase==='error')ui.stageStatus.textContent='加载失败';
}
function updateTime(){
  const motion=currentMotion(),time=motion?state.time:0;
  ui.currentTime.textContent=formatTime(time);ui.durationTime.textContent=formatTime(motion?.duration||0);ui.timeline.value=String(time);
  ui.timeline.setAttribute('aria-valuetext',`${formatTime(time)} / ${formatTime(motion?.duration||0)}`);
  ui.frameLabel.textContent=motion?`FRAME ${String(state.frame+1).padStart(3,'0')} / ${number(motion.meta.frameCount)}`:'—';
  updateControls();
}
function cacheGet(key){const data=state.cache.get(key);if(data){state.cache.delete(key);state.cache.set(key,data);}return data;}
function cachePut(key,data){
  if(state.cache.has(key)){state.cacheBytes-=state.cache.get(key).byteLength;state.cache.delete(key);}
  // An oversized motion is held only by the current player, never by the LRU.
  if(data.byteLength>CACHE_LIMIT){state.cache.clear();state.cacheBytes=0;return;}
  while(state.cache.size>=CACHE_COUNT||state.cacheBytes+data.byteLength>CACHE_LIMIT){const oldest=state.cache.keys().next().value;state.cacheBytes-=state.cache.get(oldest).byteLength;state.cache.delete(oldest);}
  state.cache.set(key,data);state.cacheBytes+=data.byteLength;
}
function sourceURL(clip){
  const repo=repositoryURL(state.catalog?.library);if(!repo)return null;
  const path=clip?.path;
  if(typeof path!=='string'||!path||path.includes('\\')||path.startsWith('/')||/^[a-z]+:/i.test(path)||path.split('/').some(p=>p==='..'))return repo;
  const head=state.catalog.library.sourceHead||'main';
  return `${repo.replace(/\/$/,'')}/blob/${encodeURIComponent(head)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function renderGuidance(variant){
  const text=value=>typeof value==='string'?value.trim():Array.isArray(value)&&value.every(item=>typeof item==='string')?value.map(item=>item.trim()).filter(Boolean).join('；\n'):'';
  const seen=new Set();
  const field=(row,id,value,duplicateOf='')=>{
    const content=text(value),duplicate=text(duplicateOf);
    const show=!!content&&content!==duplicate&&!seen.has(content);
    ui[row].hidden=!show;ui[id].textContent=show?content:'';
    if(show)seen.add(content);
    return show;
  };
  const use=field('variantUseRow','variantUse',variant?.use);
  const restrictions=field('variantRestrictionsRow','variantRestrictions',variant?.restrictions);
  const root=field('variantRootContractRow','variantRootContract',variant?.rootContract,variant?.rootPolicy);
  const loop=field('variantLoopContractRow','variantLoopContract',variant?.loopContract,variant?.loopPolicy);
  ui.variantContracts.hidden=!(root||loop);
  ui.variantGuidance.hidden=!(use||restrictions||root||loop);
  ui.guidanceVariant.textContent=variant?kindLabel(variant.key):'';
}
function renderDetails(){
  const clip=state.selected,variant=state.variant,motion=currentMotion(),meta=motion?.meta;
  if(!clip)return;
  setText('clipName',clip.name||clip.english||clip.id);setText('clipEnglish',clip.english||clip.id);
  setText('clipBreadcrumb',[clip.category||clip.categoryCode,clip.subcategory].filter(Boolean).join(' / ')||'MOTION PREVIEW');
  setText('detailId',clip.id);
  setText('detailDuration',meta?`${motion.duration.toFixed(2)} s / ${meta.fps} Hz`:Number.isFinite(variant?.duration)?`${variant.duration.toFixed(2)} s / ${variant.fps||'—'} Hz`:'待烘焙');
  setText('detailJoints',meta?`${meta.jointCount} 骨`:variant?.joints?`${variant.joints} 骨`:'—');
  const sourceLoop=clip.loop;const loopPolicy=meta?.loopPolicy||variant?.loopPolicy;
  setText('detailLoop',sourceLoop===true?'源标记循环 · 未验无缝':sourceLoop===false?'源标记非循环':typeof sourceLoop==='string'?sourceLoop:'未标记');
  if(loopPolicy)ui.detailLoop.title=typeof loopPolicy==='string'?loopPolicy:JSON.stringify(loopPolicy);else ui.detailLoop.removeAttribute('title');
  setText('loopPolicy',typeof loopPolicy==='string'?loopPolicy:'循环预览独立控制，不改变源属性。');
  const root=meta?.rootPolicy||variant?.rootPolicy;
  const defaultRoot=variant?.key==='native'?'Native：原 Avatar 世界骨点；根运动未应用（applyRootMotion=false），不叠加 RootT 摘要。':variant?'Source / Cloud：保留源世界骨点位置，不另加根运动。':'尚无预览；不会播放其它动作。';
  setText('rootPolicy',typeof root==='string'?root:defaultRoot);
  const coordinate=meta?.coordinatePolicy||variant?.coordinatePolicy;
  setText('coordinatePolicy',typeof coordinate==='string'?coordinate:variant?.key==='native'?'Y-up · 米；Native 原坐标。':variant?'Y-up · 米；源坐标已转换一次。':'Y-up · 米');
  if(variant?.key==='native'&&!ui.rootPolicy.textContent.includes('RootT'))ui.rootPolicy.textContent+=' · 根运动未应用，不叠加 RootT。';
  setText('variantMeta',meta?`${meta.jointCount} 骨 · ${meta.fps} Hz`:variant?'世界姿态采样':'尚无预览');
  renderGuidance(variant);
  setLink(ui.sourceLink,sourceURL(clip));
}
function renderVariants(){
  ui.variantButtons.replaceChildren();
  const list=variants(state.selected);
  for(const variant of list){const button=document.createElement('button');button.type='button';button.textContent=kindLabel(variant.key);button.setAttribute('aria-pressed',String(state.variant?.key===variant.key));button.dataset.variant=variant.key;button.addEventListener('click',()=>selectVariant(variant.key));ui.variantButtons.append(button);}
  if(!list.length){const span=document.createElement('span');span.className='variant-meta';span.textContent='待烘焙 · 仅目录信息';ui.variantButtons.append(span);}
}
async function selectClip(id,preferredKey=null){
  const clip=state.catalog?.clips.find(c=>c.id===id);if(!clip)throw new Error(`目录中没有动作 ${id}`);
  const previousKey=preferredKey||state.variant?.key;
  state.selected=clip;const options=variants(clip);state.variant=options.find(v=>v.key===previousKey&&(preferredKey||v.hasRotations===true))||options.find(v=>v.hasRotations===true)||options[0]||null;
  const selectedIndex=state.filtered.findIndex(c=>c.id===clip.id);if(selectedIndex>=0)state.page=Math.floor(selectedIndex/PAGE_SIZE);
  renderList();renderVariants();
  await loadSelection();
}
async function selectVariant(key){const variant=variants(state.selected).find(v=>v.key===key);if(!variant)return;state.variant=variant;renderVariants();await loadSelection();}
async function loadSelection(){
  const generation=++state.generation;state.controller?.abort();const controller=new AbortController();state.controller=controller;
  const clip=state.selected,variant=state.variant;
  if(offline?.available)offline.resume().catch(error=>renderCache(offline.last,error.message));
  closeLibrary(false);
  // Enter the new lifecycle before removing the old payload. All consumers then see no active motion.
  state.phase=variant?'loading':'pending';
  if(state.rendererRecoverable){state.rendererError=null;state.rendererRecoverable=false;}
  resetClock();state.motion=null;state.loadedId=null;state.loadedVariant=null;state.error=null;renderer?.setMotion(null);updateTime();requestRender();
  renderDetails();
  if(!variant){const workflow=ui.workflowStageLink.hasAttribute('href');showMessage('这段动作还没有预览',workflow?'目录信息已保留。可在 GitHub 手动触发云端烘焙，结果入库并同步发布后即可在这里查看。':'当前暂无预览，后续由维护者按需补充。你可以先选择已有预览的动作。','normal',{workflow});return;}
  showMessage('正在读取这一段…',`${kindLabel(variant.key)} · 不加载整库或原始 FBX`);
  try{
    const url=motionURL(variant.url);let motion=cacheGet(url);
    if(!motion){state.requestCount++;motion=await fetchMotion(url,controller.signal);}
    if(generation!==state.generation||controller.signal.aborted)return;
    if(motion.meta.kind!==variant.key)throw new Error('分片来源与所选变体不一致。');
    // The catalog may carry an explicit data identity. Never substitute another clip.
    if(motion.meta.id!==undefined&&String(motion.meta.id)!==String(clip.id))throw new Error('分片动作 ID 与目录选择不一致。');
    cachePut(url,motion);state.motion=motion;state.loadedId=clip.id;state.loadedVariant=variant.key;state.phase='ready';renderer?.setMotion(motion);
    if(state.rendererError){showMessage('三维预览不可用',state.rendererError,'error');ui.stageStatus.textContent='图形不可用';}else hideMessage();
    renderDetails();updateTime();requestRender();
    cacheReady.then(async()=>{if(generation!==state.generation)return;await offline.ensureCurrent(url);if(generation!==state.generation)return;const assets=rendererAssets();if(assets.length)await offline.registerResources(assets);await offline.refresh(selectedURL());});
  }catch(error){
    if(generation!==state.generation||error.name==='AbortError')return;
    state.phase='error';state.error=navigator.onLine?error.message:'当前离线，且这一段尚未缓存。请联网后重新加载。';state.motion=null;state.loadedId=null;state.loadedVariant=null;resetClock();renderer?.setMotion(null);ui.stageStatus.textContent='加载失败';showMessage('这段预览暂时无法读取',state.error,'error',{retry:true});renderDetails();updateTime();requestRender();
    if(offline?.available)offline.invalidate(selectedURL()).catch(()=>{});
  }
}
function filterClips(){
  if(!state.catalog)return;
  const tokens=ui.search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),category=ui.categoryFilter.value,status=ui.readyFilter.value,source=ui.sourceFilter.value;
  state.filtered=state.catalog.clips.filter(clip=>{
    if(category!=='all'&&clip.categoryCode!==category&&clip.category!==category)return false;
    if(status==='ready'&&!ready(clip)||status==='pending'&&ready(clip))return false;
    if(source!=='all'&&!variants(clip).some(v=>v.key===source&&(status!=='ready'||v.hasRotations===true)))return false;
    const text=[clip.name,clip.english,clip.id,clip.searchText,clip.category,clip.subcategory,clip.weapon].filter(Boolean).join(' ').toLocaleLowerCase();
    return tokens.every(token=>text.includes(token));
  });state.page=0;renderList();
}
function renderList(){
  const items=state.filtered,totalPages=Math.ceil(items.length/PAGE_SIZE);state.page=Math.min(state.page,Math.max(0,totalPages-1));ui.clipList.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const [index,clip] of items.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE).entries()){
    const row=document.createElement('button');row.type='button';row.className='clip-row';row.dataset.clipId=clip.id;row.setAttribute('aria-current',String(state.selected?.id===clip.id));
    const ordinal=document.createElement('span');ordinal.className='clip-index';ordinal.textContent=state.selected?.id===clip.id?'✧':String(state.page*PAGE_SIZE+index+1).padStart(2,'0');
    const text=document.createElement('span');text.className='clip-row-text';const name=document.createElement('span');name.className='clip-row-name';name.textContent=clip.name||clip.english||clip.id;const english=document.createElement('span');english.className='clip-row-en';english.textContent=clip.english||clip.id;text.append(name,english);
    const badge=document.createElement('span');badge.className='clip-row-badge';const v=variants(clip).filter(v=>v.hasRotations===true);if(v.length){const hasCloud=v.some(x=>x.key==='cloud');badge.textContent=hasCloud?'云端 +':v.length>1?`${v.length} 来源`:'可预览';if(hasCloud)badge.classList.add('cloud');}else{badge.textContent='待烘焙';badge.classList.add('pending');}
    row.append(ordinal,text,badge);row.addEventListener('click',()=>selectClip(clip.id));fragment.append(row);
  }
  ui.clipList.append(fragment);const selectedRow=ui.clipList.querySelector('[aria-current=true]');if(selectedRow)ui.clipList.scrollTop=Math.max(0,selectedRow.offsetTop-ui.clipList.offsetTop-ui.clipList.clientHeight/2+selectedRow.offsetHeight/2);ui.emptyResults.hidden=items.length>0;ui.clipList.hidden=items.length===0;
  ui.resultCount.textContent=`${number(items.length)} 个结果`;ui.pageLabel.textContent=totalPages?`${state.page+1} / ${totalPages}`:'0 / 0';ui.prevPage.disabled=state.page===0;ui.nextPage.disabled=state.page>=totalPages-1;
}
function configureCatalog(catalog){
  if(catalog?.version!==1||!Array.isArray(catalog.clips)||catalog.clips.length>10000||catalog.clips.some(c=>!c||typeof c.id!=='string'||!c.id)||new Set(catalog.clips.map(c=>c.id)).size!==catalog.clips.length)throw new Error('动作目录格式无效。');
  state.catalog=catalog;state.filtered=catalog.clips;
  const count=catalog.clips.length,readyIds=catalog.clips.filter(ready).length,variantCount=catalog.clips.reduce((n,c)=>n+variants(c).filter(v=>v.hasRotations===true).length,0);
  setText('totalCount',number(count));setText('readyCount',`${number(readyIds)} 个已有预览`);setText('footerSummary',`${number(count)} 个动作 · ${number(readyIds)} 个可预览 · ${number(variantCount)} 个变体`);
  setLink(ui.repositoryLink,repositoryURL(catalog.library));
  const workflow=safeGitHub(catalog.library?.cloudWorkflowUrl);setLink(ui.workflowLink,workflow);setLink(ui.workflowStageLink,workflow);
  for(const category of catalog.categories||[]){if(!category||typeof category.code!=='string')continue;const option=document.createElement('option');option.value=category.code;option.textContent=category.label||category.code;ui.categoryFilter.append(option);}
  filterClips();
  const first=catalog.clips.find(c=>ready(c)&&/standing.to.crouched/i.test(c.english||''))||catalog.clips.find(ready)||catalog.clips[0];
  if(first)selectClip(first.id);else{state.phase='empty';showMessage('目录为空','当前还没有可浏览的动作。');setText('stageStatus','暂无动作');}
}

ui.playButton.addEventListener('click',()=>state.playing?pause():play());ui.startButton.addEventListener('click',()=>seek(0));ui.endButton.addEventListener('click',()=>seek(currentMotion()?.duration||0));ui.timeline.addEventListener('input',()=>seek(Number(ui.timeline.value)));
ui.speedSelect.addEventListener('change',()=>{if(state.playing&&!document.hidden)syncClock(performance.now());state.speed=Number(ui.speedSelect.value);state.anchorTime=state.time;state.anchorNow=state.playing?performance.now():0;requestRender();});
ui.loopToggle.addEventListener('click',()=>{state.loop=!state.loop;ui.loopToggle.setAttribute('aria-pressed',String(state.loop));});
ui.retryLoad.addEventListener('click',loadSelection);
for(const id of ['search','categoryFilter','readyFilter','sourceFilter'])ui[id].addEventListener(id==='search'?'input':'change',filterClips);
ui.clearFilters.addEventListener('click',()=>{ui.search.value='';ui.categoryFilter.value='all';ui.readyFilter.value='all';ui.sourceFilter.value='all';filterClips();ui.search.focus();});
const mobileLayout=window.matchMedia('(max-width: 760px)');
function closeLibrary(restore=true){const wasOpen=ui.libraryPanel.classList.contains('open');ui.libraryPanel.classList.remove('open');ui.libraryPanel.inert=mobileLayout.matches;ui.libraryPanel.removeAttribute('role');ui.libraryPanel.removeAttribute('aria-modal');ui.libraryBackdrop.hidden=true;ui.libraryToggle.setAttribute('aria-expanded','false');document.body.classList.remove('library-open');if(wasOpen)(restore?ui.libraryToggle:$('preview')).focus({preventScroll:true});}
function openLibrary(){if(!mobileLayout.matches)return;ui.libraryPanel.inert=false;ui.libraryPanel.classList.add('open');ui.libraryPanel.setAttribute('role','dialog');ui.libraryPanel.setAttribute('aria-modal','true');ui.libraryBackdrop.hidden=false;ui.libraryToggle.setAttribute('aria-expanded','true');document.body.classList.add('library-open');ui.search.focus({preventScroll:true});}
ui.libraryToggle.addEventListener('click',openLibrary);ui.libraryClose.addEventListener('click',()=>closeLibrary());ui.libraryBackdrop.addEventListener('click',()=>closeLibrary());mobileLayout.addEventListener('change',()=>closeLibrary(false));closeLibrary(false);
ui.libraryPanel.addEventListener('keydown',event=>{if(!mobileLayout.matches||!ui.libraryPanel.classList.contains('open'))return;if(event.key==='Escape'){event.preventDefault();closeLibrary();}if(event.key==='Tab'){const controls=[...ui.libraryPanel.querySelectorAll('button:not(:disabled),input,select,a[href]')].filter(el=>el.offsetParent!==null),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
ui.fullscreenButton.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else throw new Error('此浏览器暂不支持舞台全屏。');}catch(error){ui.cacheMessage.textContent=error.message;}});
ui.clearCacheButton.addEventListener('click',async()=>{if(cacheClearing||!offline?.available)return;cacheClearing=true;ui.clearCacheButton.disabled=true;ui.clearCacheLabel.textContent='正在清理…';applyCacheClear();try{await offline.clear();ui.cacheMessage.textContent='预览缓存已清理；重新选片可再次缓存。';}catch(error){ui.cacheMessage.textContent=`清理未完成：${error.message}`;cacheStatusText('清理未完成');}finally{cacheClearing=false;ui.clearCacheLabel.textContent='清理预览缓存';await offline.refresh(selectedURL());}});
ui.prevPage.addEventListener('click',()=>{state.page=Math.max(0,state.page-1);renderList();ui.clipList.scrollTop=0;});ui.nextPage.addEventListener('click',()=>{state.page++;renderList();ui.clipList.scrollTop=0;});
ui.clipList.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;const buttons=[...ui.clipList.querySelectorAll('button')];let index=buttons.indexOf(document.activeElement);if(index<0)return;e.preventDefault();if(e.key==='Home')index=0;else if(e.key==='End')index=buttons.length-1;else index=Math.max(0,Math.min(buttons.length-1,index+(e.key==='ArrowDown'?1:-1)));buttons[index]?.focus();});
function toggleView(id,key){ui[id].addEventListener('click',()=>{if(!renderer)return;const value=!renderer[key];renderer.setOptions({[key]:value});ui[id].setAttribute('aria-pressed',String(value));});}
toggleView('modelToggle','model');toggleView('skeletonToggle','skeleton');toggleView('trailToggle','trail');toggleView('followToggle','follow');ui.resetCamera.addEventListener('click',()=>renderer?.resetCamera());
ui.trailToggle.title='实际髋点的世界位置轨迹，不投射或补造根位移。';
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,[contenteditable=true]'))return;
  if(e.key==='/'&&!e.target.closest('button')){e.preventDefault();ui.search.focus();}
  if(e.code==='Space'&&(e.target===$('motionCanvas')||e.target===document.body||e.target===$('preview'))){e.preventDefault();state.playing?pause():play();}
});
document.addEventListener('visibilitychange',()=>{
  state.hidden=document.hidden;
  if(document.hidden){if(state.playing)syncClock(performance.now());state.anchorTime=state.time;state.anchorNow=0;if(state.raf){cancelAnimationFrame(state.raf);state.raf=0;}}
  else{if(state.playing){state.anchorTime=state.time;state.anchorNow=performance.now();}requestRender();}
});
window.addEventListener('pagehide',()=>{state.controller?.abort();if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;});

const qaSnapshot=()=>{const motion=currentMotion();return {phase:state.phase,selectedId:state.selected?.id||null,variant:state.variant?.key||null,loadedId:state.loadedId,loadedVariant:state.loadedVariant,time:motion?state.time:0,duration:motion?.duration||0,frame:motion?state.frame:0,frames:motion?.meta.frameCount||0,joints:motion?.meta.jointCount||0,playing:!!motion&&state.playing,speed:state.speed,loop:state.loop,cacheBytes:state.cacheBytes,cacheCount:state.cache.size,cacheKeys:[...state.cache.keys()].map(k=>new URL(k).pathname),currentBytes:motion?.byteLength||0,rafScheduled:!!state.raf,hidden:document.hidden,error:state.error,rendererError:state.rendererError,rendererReady:!!renderer&&!state.rendererError&&renderer.modelReady!==false,rendering:{modelReady:renderer?.modelReady??null,modelStats:renderer?.modelStats||null,mappedBones:renderer?.mapping?.length||0,hasRotations:!!motion?.rotations},requestCount:state.requestCount,generation:state.generation,listDOMCount:ui.clipList.children.length,filteredCount:state.filtered.length,page:state.page,persistentCache:offline?.last||null,cacheError:offline?.error||null,cacheClearing};};
const qa={get state(){return qaSnapshot();},select:(id,key)=>selectClip(id,key),selectVariant,seek,play,pause,redraw:requestRender};
for(const key of ['phase','selectedId','variant','loadedId','loadedVariant','time','duration','playing','cacheBytes','cacheCount','rafScheduled','error'])Object.defineProperty(qa,key,{get:()=>qaSnapshot()[key]});
Object.defineProperty(window,'motionPreviewQA',{value:qa,writable:false});

offline=new PreviewCache({onChange:renderCache,onClear:applyCacheClear});cacheReady=offline.init();
Object.defineProperty(window,'motionPreviewCache',{value:{registerAssets:urls=>offline.registerResources(urls),refresh:()=>offline.refresh(selectedURL()),get state(){return offline.last;}}});
cacheReady.then(async available=>{if(state.phase==='cleared')return;createRenderer();if(!available)return;await offline.resume();const assets=rendererAssets();if(assets.length)await offline.registerResources(assets);if(currentMotion())await offline.ensureCurrent(selectedURL());else await offline.refresh(selectedURL());});
window.addEventListener('online',()=>offline.refresh(selectedURL()));window.addEventListener('offline',()=>offline.refresh(selectedURL()));

try{
  const response=await fetch(new URL('./data/catalog.json',import.meta.url),{credentials:'same-origin'});if(!response.ok)throw new Error(`目录读取失败（HTTP ${response.status}）。`);
  const text=await response.text();if(text.length>16*1024*1024)throw new Error('目录超过大小限制。');configureCatalog(JSON.parse(text));
}catch(error){state.phase='catalog-error';state.error=error.message;setText('resultCount','目录读取失败');setText('stageStatus','目录不可用');setText('footerSummary','目录暂不可用');showMessage('动作目录暂时无法读取',error.message,'error');ui.clipList.hidden=true;updateControls();}
requestRender();
