const VERSION='r6-20261029-pages-speed1';
const ROOT=new URL('./',self.location.href),PREFIX=`motion-room:${ROOT.pathname}:`,SHELL=PREFIX+'shell:'+VERSION,PREVIEW=PREFIX+'preview:v1';
const SHELL_PATHS=['./','index.html','styles.css','app.js','mvp.js','renderer.js','character.js','cache-client.js','assets/fonts/motion-heading.ttf','data/catalog.json','credits.txt','workbench.html','workbench.css','workbench.js','motion-session.js','workbench-renderer.js','vendor/three/SkeletonUtils.js'];
const BUDGET=192*1024*1024,MAX_FILE=64*1024*1024;
const INSTANCE=self.crypto.randomUUID();let clearNumber=0,epoch=INSTANCE+':0',enabled=true,queue=Promise.resolve();const inflight=new Map();
const serial=fn=>{const result=queue.then(fn,fn);queue=result.catch(()=>{});return result;};
function relative(url){return url.origin===ROOT.origin&&url.pathname.startsWith(ROOT.pathname)?url.pathname.slice(ROOT.pathname.length):null;}
function canonicalURL(value){const url=new URL(value,ROOT),path=relative(url);if(!url.search&&['','index.html','workbench.html'].includes(path))url.hash='';return url;}
function category(url){const path=relative(url);if(path===null||url.search||url.hash)return null;if(!path||path==='index.html'||path==='workbench.html'||path==='data/catalog.json'||path==='credits.txt'||/\.(?:js|mjs|css|ttf|woff2?)$/i.test(path))return 'shell';if(/^data\/clips\/[^/]+\.mvp\.gz$/i.test(path)||/^data\/roots\/[^/]+\.json$/i.test(path)||/^(?:assets|models|textures|vendor)\/.+\.(?:glb|gltf|bin|png|jpe?g|webp|ktx2?)$/i.test(path))return 'preview';return null;}
async function broadcast(type,detail={}){for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({source:'motion-room-cache',type,...detail});}
async function entries(){const cache=await caches.open(PREVIEW),keys=await cache.keys();return Promise.all(keys.map(async key=>{const response=await cache.match(key);return {key,bytes:Number(response?.headers.get('x-motion-bytes'))||0,stored:Number(response?.headers.get('x-motion-stored'))||0};}));}
async function writeComplete(request,response,ticket){
  if(response.status!==200||response.type==='opaque')return;
  const target=canonicalURL(request.url),kind=category(target);if(!kind)return;
  const length=Number(response.headers.get('content-length'));if(length>MAX_FILE)throw new Error('单个资源超过64 MB，未缓存，可在线预览。');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>MAX_FILE)throw new Error('单个资源超过64 MB，未缓存，可在线预览。');
  await serial(async()=>{
    if(kind==='preview'&&(!enabled||ticket!==epoch))return;
    const headers=new Headers(response.headers);headers.delete('content-encoding');headers.set('content-length',String(bytes.byteLength));headers.set('x-motion-bytes',String(bytes.byteLength));headers.set('x-motion-stored',String(Date.now()));
    const cache=await caches.open(kind==='shell'?SHELL:PREVIEW);
    if(kind==='preview'){
      const list=(await entries()).sort((a,b)=>a.stored-b.stored);let used=list.reduce((n,e)=>n+e.bytes,0);const existing=list.find(e=>e.key.url===target.href);if(existing)used-=existing.bytes;
      while(used+bytes.byteLength>BUDGET&&list.length){const oldest=list.shift();if(oldest.key.url===target.href)continue;await cache.delete(oldest.key);used-=oldest.bytes;}
    }
    await cache.put(new Request(target.href),new Response(bytes,{status:200,headers}));
  });
}
async function cacheResource(url,{resume=false}={}){
  const target=canonicalURL(url),kind=category(target);if(!kind)throw new Error('资源不在本站预览缓存范围内。');
  if(resume)await serial(()=>{enabled=true;});
  if(kind==='preview'&&!enabled)return;
  const cache=await caches.open(kind==='shell'?SHELL:PREVIEW);if(await cache.match(target.href))return;
  if(inflight.has(target.href))return inflight.get(target.href).promise;
  const controller=new AbortController(),ticket=epoch;
  const promise=(async()=>{const request=new Request(target.href,{credentials:'same-origin'}),response=await fetch(request,{signal:controller.signal,cache:kind==='preview'?'no-store':'default'});if(response.status!==200)throw new Error(`资源读取失败（HTTP ${response.status}）。`);await writeComplete(request,response,ticket);})().finally(()=>inflight.delete(target.href));
  inflight.set(target.href,{promise,controller,kind});return promise;
}
async function status(url,resources=[]){
  await queue;const list=await entries(),preview=await caches.open(PREVIEW),shell=await caches.open(SHELL);
  const current=url?!!await preview.match(new URL(url,ROOT).href):false;
  const required=resources.map(value=>new URL(value,ROOT));let assetsCached=required.length>0;
  for(const resource of required){const kind=category(resource),cache=kind==='shell'?shell:preview;if(!kind||!await cache.match(resource.href))assetsCached=false;}
  let shellReady=true;for(const path of SHELL_PATHS)if(!await shell.match(new URL(path,ROOT).href))shellReady=false;
  return {version:VERSION,epoch,enabled,url:url?new URL(url,ROOT).href:null,resourceURLs:required.map(r=>r.href),bytes:list.reduce((n,e)=>n+e.bytes,0),count:list.length,budget:BUDGET,currentCached:current,assetsKnown:required.length>0,assetsCached,shellReady,offlineReady:current&&assetsCached&&shellReady};
}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);for(const path of SHELL_PATHS){const request=new Request(new URL(path,ROOT),{cache:'reload'}),response=await fetch(request);if(!response.ok)throw new Error(`页面资源未就绪：${path}`);await cache.put(request,response);}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX+'shell:')&&key!==SHELL)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;const url=canonicalURL(request.url),kind=category(url);if(!kind)return;
  event.respondWith((async()=>{
    const cache=await caches.open(kind==='shell'?SHELL:PREVIEW),cached=await cache.match(new Request(url.href));
    if(cached&&kind==='preview')return cached;
    const controller=new AbortController(),ticket=epoch,key=url.href;
    const network=fetch(request,{signal:controller.signal,cache:kind==='preview'?'no-store':'default'});
    const task={controller,kind,promise:network.then(response=>writeComplete(request,response.clone(),ticket))};
    inflight.set(key,task);event.waitUntil(task.promise.catch(error=>{if(error.name!=='AbortError')return broadcast('CACHE_ERROR',{error:error.message});}).finally(()=>{if(inflight.get(key)===task)inflight.delete(key);}));
    try{
      return await network;
    }catch(error){if(cached)return cached;if(request.mode==='navigate'){const page=url.pathname.endsWith('/workbench.html')?'workbench.html':'index.html',fallback=await cache.match(new URL(page,ROOT).href);if(fallback)return fallback;}throw error;}
  })());
});
self.addEventListener('message',event=>{
  const message=event.data,port=event.ports?.[0];if(!message||message.source!=='motion-room-page'||!port)return;
  event.waitUntil((async()=>{try{
    let result;
    if(message.type==='STATUS')result=await status(message.url,message.resources||[]);
    else if(message.type==='RESUME'){await serial(()=>{enabled=true;});result={epoch,enabled};}
    else if(message.type==='CACHE_RESOURCES'){for(const url of (message.urls||[]).slice(0,100))await cacheResource(url,{resume:!!message.resume});result=await status(message.url,message.resources||[]);}
    else if(message.type==='INVALIDATE'){const url=new URL(message.url,ROOT);if(category(url)==='preview')await serial(async()=>{await(await caches.open(PREVIEW)).delete(url.href);});result={invalidated:true};}
    else if(message.type==='CLEAR_PREVIEW'){
      // Advance before cancellation; every older queued write will fail its epoch check.
      enabled=false;epoch=INSTANCE+':'+(++clearNumber);for(const task of inflight.values())if(task.kind==='preview')task.controller.abort();
      await serial(async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX+'preview:'))await caches.delete(key);});
      result=await status(null,[]);await broadcast('CACHE_CLEARED',{epoch});
    }else throw new Error('未知缓存操作。');
    port.postMessage({ok:true,result});
  }catch(error){port.postMessage({ok:false,error:error.message,name:error.name});}})());
});
