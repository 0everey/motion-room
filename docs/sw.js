const VERSION="r26-load-p0-16c7fb51709e8fba";
const SHELL_IDENTITIES={"assets/fonts/motion-heading.ttf":"7dde8c2003e3dafb8268ed798b96a5c449ac6a69810d654d1f29883058b77ffb","credits.txt":"a2978b177ca9260380fb65e14eb5880526dc158ae098da8d59438d514c376310","index.html":"6c7d7ac6accc646fcd6e94afd0374ac560f438b76af42def30c845d571c87e6f","maintenance-method.md":"a93b58c91395d546ca7bcbad976af17c68844929e318c8abfd0b265bd4852025","runtime-chunk-3PY7URGQ.js":"351ea7b3b51865eaaa60102488d4c13f478e43d3110e94d22b3057b9d12be88f","runtime-chunk-4KMRWNCV.js":"ab86e73d10effd7ecc9c1bb0a43c47f887e78c32ad998b7ea41fb35a91e232b2","runtime-chunk-AKQ6ITRA.js":"4302d91cfe15a37e4a4c1b6604ae6af0d74334320dba380f8a67f4a2192d5edf","runtime-chunk-I5VFTHXP.js":"30dda6553c6f2986ea690d5aa3244e9af9eaa494ffcd4bd00b09b16bc2cb0099","runtime-chunk-MBA5QNKB.js":"bbc6286247adb17063f982ae098aa5ed2c1a809bac28b7aaf19e7514ecc750a1","runtime-chunk-QETBCUR3.js":"184480afd8054896c4e3af459c38b5109c5ad7f103eb331beec95bea4123f9b8","runtime-chunk-U4ANP327.js":"15e8b66da9df590e045f9f7f4228ee21587b4108a417696b715b8ebe216eec58","runtime-library-entry-YJKNLZFY.js":"0c2ea0d365b04100043ec83f367ace21a336cd0b8141f332ea08c6f9c1b5b034","runtime-style-02779c1b5063.css":"02779c1b5063ed862c524ad91201cf39c45f1f5892feefd9c054b007d74c886d","workbench.html":"67b7572e641788e867ee3b8ac9993e58bbb2b1ec051dd566eacb8cf97f930c3c"};
const LEGACY_IDENTITIES={"preview-environments.js":"ddca8eefd82b1068d59d9557142fc63674f7950530c81b66a0853f166c6f0ab0","preview-stage.js":"a02573c863e970d07ccb0e1df3eda50f89c57b055e7aabc67a78fd06cc8eba27","vendor/three/RoomEnvironment.js":"f57dbf407cc45cc43e3206a95275a9f3d2dee1ec78e9b9e5bcc5e645065fa5ce","library-entry.js":"705bdf374361a43066d0d1ae71d0bfa1baa2028fe69a6b5f0315d08e142f4488","catalog-loader.js":"6bc81a7c633409118239bf06a0707f56ca49cd4edfb72571d8b746e2d85ebf87","resource-queue.js":"20e2f78a6ae799305e25a258c09fab82dc4ec0639536e21c0e9ce212cb256731","held-items.js":"2d434a6bd682b56f618174649e60b4834b4ac2777c5909fda28f98d4f5073a4b","pmx-source.js":"2c23fdbcdeef091d89022f40821647a977b93bd2d71752c1946495911ccd0a98","yuuka-source.js":"78713856860d7fd3cb13f30c3947068a91a835d46e95b052ee2198923d6af09d","klee-source.js":"1ded1c0b17828cfd2dadd825001e9f3dde741f5f506ae1cc5687daef21da3214","vendor/three/mmd/loaders/MMDLoader.js":"ea805ba7f189b335572be9604d132371d76a1295b7f2bbceffe481986cea4839","vendor/three/mmd/loaders/TGALoader.js":"ce938459ed99d5234f9665270cca8552464d0d1703a094e49760631e6b14c7a3","vendor/three/mmd/shaders/MMDToonShader.js":"b1e01ab0442c3c04ec7fbfb024c15d7636c1ff94de260a839ab4ecbd69ffca5b","vendor/three/mmd/libs/mmdparser.module.js":"77562d8a91949633814a6ce1f4060dcb95b1a672e8549f41e6524eb6f1c30c68","styles.css":"43d1309488847095e3e0f4a421b419187197d866afaf9e505f7446561720d94f","app.js":"79505a2712503b643f2378d0537732e70b6f6dfc754fab05456fa942f2df3f82","mvp.js":"d47c0c476aae462a6378f58d4196886b836a4922b12ed57ec52fe6355bc0ef3e","renderer.js":"be0ef76ec9a9dd95cec580bec168d83c6e46eaa1c07c0f7072e597333ebbf1bc","workbench.css":"51284c95904a8487821e95d8aa491641271fa83cd721dbee71b6b2ae26a0c517","workbench.js":"6e97ceb357f95f261c98846e88ed2f459ccf146e00f07d4ec1df837cfe46a08a","motion-session.js":"450c978338cb1a77276971b10f85b6653a2f1b61952fd800c55a1e374da8dd8a","workbench-renderer.js":"53a6b715e8db9578dad57396d67dc4a6ec43b92c3e945db80cc86b3b4d99aa42","native-root.js":"6c774251b150f3faf038d68e2e193b2d538a8727f3d6fa4de5c68d2745b5a2ef","vendor/three/SkeletonUtils.js":"dec1842699024dea647e24668c660e77f5f39e0d2d4707dba426009b9c0fd8fd","studio.js":"fd4d625f90793a49e07decd06065f698b332ca06e802fa4a9204c4331445b571","studio.css":"02779c1b5063ed862c524ad91201cf39c45f1f5892feefd9c054b007d74c886d","library-browser.js":"2779a3788f5e2d43306d66a7692f006323b9b3344840a6a0841cc9c256756cc2","motion-wall.js":"da0e139ec464822e28ad60a0245dff7e107831efe55309b93820a3ae79fa4080","character.js":"87f5a6d8db08c3d1fe059dca4f3367709730c500bc4e38df239fa1b6d78733da","cache-client.js":"79f63979fc378a837d546ec933b32ceee83acd2e4e14b04ddefaf0f3a1cc17c3","vendor/three/three.module.min.js":"08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7","vendor/three/GLTFLoader.js":"d6b517ee599c974f9b3648b11621dc23d41de24adcac3c826b3985a9313f6b84","vendor/three/BufferGeometryUtils.js":"b9ea77ef3aacbf82d386c33311067e6ea4a3aac4190b32e001bdd11d063fb6ae","runtime-config.js":"c301c86a958e4f0dd4596ad3abf11286c2ca89a3b889b9e4d7ed3a3c35362035","workbench.html":"4d83b496d67a16954ebde87ad24466a59683a259280b378915c2ffe6d4acd7df","index.html":"6c7d7ac6accc646fcd6e94afd0374ac560f438b76af42def30c845d571c87e6f","assets/fonts/motion-heading.ttf":"7dde8c2003e3dafb8268ed798b96a5c449ac6a69810d654d1f29883058b77ffb","data/navigation.json":"091b6adc54c6d8c36fd819a81e7b24ebc1e7bd9e5ec5efb99d355b0edec251a5"};
const KLEE_URL='https://i0.hdslb.com/bfs/game-static/6c7d34e8ca3f07623f9de5ce03a0600eddfda45c.zip',KLEE_SHA256='894fb807efca259c75f663ae3c4798533d39506ea8c49d1ec1c7a1dc9e16ea4f';
async function validOfficial(bytes){return bytes.byteLength===1235776&&Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')===KLEE_SHA256;}
const ROOT=new URL('./',self.location.href),PREFIX=`motion-room:${ROOT.pathname}:`,SHELL=PREFIX+'shell:'+VERSION,PREVIEW=PREFIX+'preview:v1';
const YUUKA_URL=new URL('models/user-yuuka-f4ac2e7340a8.zip',ROOT).href,YUUKA_SHA256='f4ac2e7340a8806cfa52a8ba7e298db5bf440ac201e08dc3680a58d9282e917d';
const missingYuuka='优香原包尚未导入或已清理，请在预览设置导入 Yuuka_Hayase1_0_rev2.zip。';
async function validYuuka(bytes){return bytes.byteLength===9392148&&Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')===YUUKA_SHA256;}
async function validPinned(url,bytes){return url===KLEE_URL?validOfficial(bytes):url===YUUKA_URL?validYuuka(bytes):true;}
const SHELL_PATHS=["assets/fonts/motion-heading.ttf","credits.txt","index.html","maintenance-method.md","runtime-chunk-3PY7URGQ.js","runtime-chunk-4KMRWNCV.js","runtime-chunk-AKQ6ITRA.js","runtime-chunk-I5VFTHXP.js","runtime-chunk-MBA5QNKB.js","runtime-chunk-QETBCUR3.js","runtime-chunk-U4ANP327.js","runtime-library-entry-YJKNLZFY.js","runtime-style-02779c1b5063.css","workbench.html"];
const BUDGET=192*1024*1024,MAX_FILE=64*1024*1024;
const INSTANCE=self.crypto.randomUUID();let clearNumber=0,epoch=INSTANCE+':0',enabled=true,queue=Promise.resolve();const inflight=new Map();
const serial=fn=>{const result=queue.then(fn,fn);queue=result.catch(()=>{});return result;};
function relative(url){return url.origin===ROOT.origin&&url.pathname.startsWith(ROOT.pathname)?url.pathname.slice(ROOT.pathname.length):null;}
function canonicalURL(value){const url=new URL(value,ROOT),path=relative(url);if(!url.search&&['','index.html','workbench.html'].includes(path))url.hash='';return url;}
function category(url){if(url.href===KLEE_URL||url.href===YUUKA_URL)return 'preview';const path=relative(url);if(path===null||url.search||url.hash)return null;if(!path||path==='index.html'||path==='workbench.html'||path==='data/catalog.json'||path==='data/navigation.json'||path==='credits.txt'||path==='maintenance-method.md'||path==='vendor/three/mmd/SOURCES.json'||/\.(?:js|mjs|css|ttf|woff2?)$/i.test(path))return 'shell';if(/^data\/catalog\/(?:navigation|details)-[a-f0-9]{12}\.json\.gz$/.test(path))return 'preview';if(/^data\/clips\/[^/]+\.mvp\.gz$/i.test(path)||/^data\/(?:roots|animator-roots)\/[^/]+\.json$/i.test(path)||/^(?:assets|models|textures|vendor)\/.+\.(?:glb|gltf|bin|png|jpe?g|webp|ktx2?)$/i.test(path))return 'preview';return null;}
async function broadcast(type,detail={}){for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({source:'motion-room-cache',type,...detail});}
async function entries(){const cache=await caches.open(PREVIEW),keys=await cache.keys();return Promise.all(keys.map(async key=>{const response=await cache.match(key);return {key,bytes:Number(response?.headers.get('x-motion-bytes'))||0,stored:Number(response?.headers.get('x-motion-stored'))||0};}));}
async function writeComplete(request,response,ticket){
  if(response.status!==200||response.type==='opaque')return;
  const target=canonicalURL(request.url),kind=category(target);if(!kind)return;
  const length=Number(response.headers.get('content-length'));if(length>MAX_FILE)throw new Error('单个资源超过64 MB，未缓存，可在线预览。');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>MAX_FILE)throw new Error('单个资源超过64 MB，未缓存，可在线预览。');
  const expected=kind==='shell'&&SHELL_IDENTITIES?.[relative(target)];if(expected&&Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')!==expected)throw new Error('应用版本已更新，旧页面不能覆盖当前页面缓存。');
  if(!await validPinned(target.href,bytes))throw new Error('可莉官方原件版本不符，未缓存，请重新载入。');
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
async function status(url,resources=[]){
  await queue;const list=await entries(),preview=await caches.open(PREVIEW),shell=await caches.open(SHELL);
  const current=url?!!await preview.match(new URL(url,ROOT).href):false;
  const required=resources.map(value=>new URL(value,ROOT));let assetsCached=required.length>0;
  for(const resource of required){const kind=category(resource),cache=kind==='shell'?shell:preview;const response=kind?await cache.match(resource.href):null;if(!response||resource.href===YUUKA_URL&&!await validYuuka(await response.arrayBuffer()))assetsCached=false;}
  let shellReady=true;for(const path of SHELL_PATHS)if(!await shell.match(new URL(path,ROOT).href))shellReady=false;
  return {version:VERSION,pageStoreProtocol:1,shellPaths:SHELL_PATHS,localModelImport:1,epoch,enabled,url:url?new URL(url,ROOT).href:null,resourceURLs:required.map(r=>r.href),bytes:list.reduce((n,e)=>n+e.bytes,0),count:list.length,budget:BUDGET,currentCached:current,assetsKnown:required.length>0,assetsCached,shellReady,offlineReady:current&&assetsCached&&shellReady};
}
// Installation does no network work. The page schedules verified complete
// resources below foreground work; the worker only stores completed bytes.
self.addEventListener('install',event=>event.waitUntil((async()=>{await caches.open(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const old=(await caches.keys()).filter(key=>key.startsWith(PREFIX+'shell:')&&key!==SHELL);for(const key of old.slice(0,-1))await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;const url=canonicalURL(request.url),kind=category(url);if(!kind)return;
  event.respondWith((async()=>{
    if(request.cache==='no-store')return fetch(request);
    const cache=await caches.open(kind==='shell'?SHELL:PREVIEW);let cached=await cache.match(new Request(url.href));
    const legacy=kind==='shell'&&LEGACY_IDENTITIES?.[relative(url)];
    if(!cached&&legacy){for(const key of (await caches.keys()).filter(key=>key.startsWith(PREFIX+'shell:')&&key!==SHELL).reverse()){const candidate=await(await caches.open(key)).match(url.href);if(candidate&&Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await candidate.clone().arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('')===legacy){cached=candidate;break;}}}
    if(cached&&(url.href===KLEE_URL||url.href===YUUKA_URL)&&!await validPinned(url.href,await cached.clone().arrayBuffer())){await serial(()=>cache.delete(url.href));cached=null;}
    if(cached&&request.mode==='navigate'){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
      const update=fetch(request,{signal:controller.signal,cache:'no-cache'}).then(async response=>{try{await writeComplete(request,response.clone(),epoch);}catch{}return response;}).finally(()=>clearTimeout(timeout));
      event.waitUntil(update.catch(()=>{}));
      return Promise.race([update.catch(()=>cached),new Promise(resolve=>setTimeout(()=>resolve(cached),500))]);
    }
    if(cached)return cached;
    if(url.href===YUUKA_URL)return new Response(missingYuuka,{status:404,headers:{'content-type':'text/plain;charset=utf-8'}});
    // No clone/drain or independent caching fetch. Abort belongs to the page's
    // shared transport consumer; bytes are committed only by STORE_RESOURCE.
    try{return await fetch(request);}catch(error){if(cached)return cached;if(request.mode==='navigate'){const page=url.pathname.endsWith('/workbench.html')?'workbench.html':'index.html',fallback=await cache.match(new URL(page,ROOT).href);if(fallback)return fallback;}throw error;}
  })());
});
self.addEventListener('message',event=>{
  const message=event.data,port=event.ports?.[0];if(!message||message.source!=='motion-room-page'||!port)return;
  event.waitUntil((async()=>{try{
    let result;
    if(message.type==='STATUS')result=await status(message.url,message.resources||[]);
    else if(message.type==='IMPORT_USER_MODEL'){
      const ticket=epoch;
      if(message.epoch!==ticket)throw Object.assign(new Error('缓存已清理或切换，请重新导入。'),{name:'AbortError'});
      if(!(message.buffer instanceof ArrayBuffer)||!await validYuuka(message.buffer))throw new Error('优香原包版本或内容不符，请使用 Yuuka_Hayase1_0_rev2.zip。');
      await serial(()=>{if(ticket!==epoch)throw Object.assign(new Error('导入已被清理取消。'),{name:'AbortError'});enabled=true;});
      await writeComplete(new Request(YUUKA_URL),new Response(message.buffer,{status:200,headers:{'content-type':'application/zip'}}),ticket);
      if(ticket!==epoch||!enabled)throw Object.assign(new Error('导入已被清理取消。'),{name:'AbortError'});
      result={url:YUUKA_URL,sha256:YUUKA_SHA256,bytes:9392148,epoch};
    }
    else if(message.type==='RESUME'){await serial(()=>{enabled=true;});result={epoch,enabled};}
    else if(message.type==='MISSING_RESOURCES'){
      const missing=[];for(const value of (message.urls||[]).slice(0,256)){const url=canonicalURL(value),kind=category(url);if(!kind)throw new Error('资源不在本站预览缓存范围内。');const response=await(await caches.open(kind==='shell'?SHELL:PREVIEW)).match(url.href);if(!response)missing.push(url.href);}result={missing,epoch,version:VERSION};
    }
    else if(message.type==='STORE_RESOURCE'){
      const url=canonicalURL(message.url);if(message.version!==VERSION||message.epoch!==epoch)throw Object.assign(new Error('缓存版本或代次已变化。'),{name:'AbortError'});
      if(!(message.buffer instanceof ArrayBuffer)||message.buffer.byteLength>MAX_FILE||!category(url))throw new Error('缓存资源无效。');
      await writeComplete(new Request(url.href),new Response(message.buffer,{status:200,headers:message.headers||[]}),message.epoch);result={stored:true};
    }
    else if(message.type==='CACHE_RESOURCES'){result=await status(message.url,message.resources||[]);}
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
