export class PreviewCache {
  constructor({onChange=()=>{},onClear=()=>{}}={}){this.onChange=onChange;this.onClear=onClear;this.resources=[];this.available=false;this.error=null;this.registration=null;this.initializing=null;this.initPending=false;this.messageHandler=null;this.currentURL=null;this.last=null;this.refreshGeneration=0;}
  async init(){
    if(this.initializing)return this.initializing;
    this.initPending=true;this.initializing=(async()=>{
      if(!('serviceWorker' in navigator)||!window.isSecureContext)throw new Error('当前浏览器未启用离线缓存，可继续在线预览。');
      if(!this.messageHandler){this.messageHandler=event=>{if(event.data?.source!=='motion-room-cache')return;if(event.data.type==='CACHE_CLEARED'){this.onClear(event.data);this.refresh(null);}if(event.data.type==='CACHE_ERROR'){this.error=event.data.error;this.onChange(this.last,this.error);}};navigator.serviceWorker.addEventListener('message',this.messageHandler);}
      const scopeURL=new URL('./',import.meta.url),existing=await navigator.serviceWorker.getRegistration(scopeURL.href);
      if(existing?.active&&navigator.serviceWorker.controller){this.registration=existing;if(navigator.onLine)existing.update().catch(()=>{});}
      else this.registration=await navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:scopeURL.pathname});
      await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('离线缓存安装未完成，可继续在线预览。')),15000))]);
      if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('离线缓存尚未接管页面，请刷新后重试。')),12000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
      this.available=true;this.error=null;await this.refresh();return true;
    })().catch(error=>{this.error=error.message;this.onChange(this.last,this.error);return false;}).finally(()=>{this.initPending=false;});return this.initializing;
  }
  retry(){if(this.initPending)return this.initializing;this.refreshGeneration++;this.initializing=null;this.error=null;return this.init();}
  async command(type,detail={}){
    const worker=navigator.serviceWorker.controller;if(!worker)throw new Error('离线缓存暂未就绪。');
    return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(new Error('缓存操作超时，请重试。'));},45000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ok?resolve(event.data.result):reject(Object.assign(new Error(event.data?.error||'缓存操作失败。'),{name:event.data?.name||'Error'}));};worker.postMessage({source:'motion-room-page',type,...detail},[channel.port2]);});
  }
  async refresh(url=this.currentURL){this.currentURL=url;const generation=++this.refreshGeneration;if(!this.available)return null;try{const result=await this.command('STATUS',{url,resources:this.resources});if(generation!==this.refreshGeneration)return this.last;this.last=result;this.error=null;this.onChange(this.last,null);return this.last;}catch(error){if(generation!==this.refreshGeneration)return this.last;this.error=error.message;this.onChange(this.last,this.error);return null;}}
  async resume(){if(this.available)await this.command('RESUME');}
  async registerResources(urls){this.resources=[...new Set((urls||[]).filter(value=>typeof value==='string'))];if(!this.available)return;try{await this.command('CACHE_RESOURCES',{urls:this.resources,url:this.currentURL,resources:this.resources});await this.refresh();}catch(error){if(error.name==='AbortError')return;this.error=error.message;this.onChange(this.last,this.error);}}
  async ensureCurrent(url){this.currentURL=url;if(!this.available)return;try{await this.command('CACHE_RESOURCES',{urls:[url],url,resources:this.resources});await this.refresh(url);}catch(error){if(error.name==='AbortError')return;this.error=error.message;this.onChange(this.last,this.error);}}
  async invalidate(url){if(this.available)await this.command('INVALIDATE',{url});}
  async clear(){if(!this.available)throw new Error('离线缓存尚未就绪。');const result=await this.command('CLEAR_PREVIEW');this.last=result;this.currentURL=null;this.onChange(result,null);return result;}
}
