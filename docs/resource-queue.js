// A slot belongs to the complete operation, including its response body.
// A shared operation belongs to all live consumers, at their highest priority.
export const PRIORITY=Object.freeze({target:0,visible:10,background:100});
const cancelled=()=>new DOMException('已取消','AbortError');
export class PriorityPool{
  constructor({concurrency=4,reserve=1,background=1,preemptible=true}={}){Object.assign(this,{concurrency,reserve,background,preemptible});this.jobs=new Map();this.active=new Set();this.sequence=0;this.completed=0;this.cancelled=0;this.preemptions=0;}
  run(key,work,{signal,priority=PRIORITY.visible}={}){
    if(signal?.aborted)return Promise.reject(cancelled());
    let job=this.jobs.get(key);
    if(!job){job={key,work,order:this.sequence++,consumers:new Set(),state:'queued',controller:new AbortController()};this.jobs.set(key,job);}
    return new Promise((resolve,reject)=>{
      const consumer={priority,resolve,reject,signal};
      consumer.abort=()=>{job.consumers.delete(consumer);reject(cancelled());if(!job.consumers.size){if(this.jobs.get(key)===job)this.jobs.delete(key);job.controller.abort();this.cancelled++;}this.pump();};
      job.consumers.add(consumer);signal?.addEventListener('abort',consumer.abort,{once:true});
      queueMicrotask(()=>this.pump());
    });
  }
  priority(job){return Math.min(...[...job.consumers].map(c=>c.priority));}
  canStart(job){const p=this.priority(job),lower=[...this.active].filter(j=>this.priority(j)>PRIORITY.target).length,bg=[...this.active].filter(j=>this.priority(j)>=PRIORITY.background).length;return this.active.size<this.concurrency&&(p===PRIORITY.target||lower<this.concurrency-this.reserve)&&(p<PRIORITY.background||bg<this.background);}
  pump(){
    const pending=[...this.jobs.values()].filter(j=>j.state==='queued'&&j.consumers.size).sort((a,b)=>this.priority(a)-this.priority(b)||a.order-b.order);
    if(this.preemptible&&pending.some(j=>this.priority(j)===PRIORITY.target)&&this.active.size>=this.concurrency&&![...this.active].some(j=>j.controller.signal.aborted)){
      const victim=[...this.active].filter(j=>j.consumers.size&&!j.preempted&&this.priority(j)>PRIORITY.target).sort((a,b)=>this.priority(b)-this.priority(a)||b.order-a.order)[0];
      if(victim){victim.preempted=true;this.preemptions++;victim.controller.abort();}
    }
    for(const job of pending){if(!this.canStart(job))continue;job.state='running';this.active.add(job);
      const finish=(error,value)=>{if(job.preempted&&job.consumers.size){job.preempted=false;job.controller=new AbortController();job.state='queued';}else this.settle(job,error,value);};
      Promise.resolve().then(()=>{job.controller.signal.throwIfAborted();return job.work(job.controller.signal);}).then(value=>finish(null,value),error=>finish(error)).finally(()=>{this.active.delete(job);if(job.state==='done'&&this.jobs.get(job.key)===job)this.jobs.delete(job.key);this.pump();});
    }
  }
  settle(job,error,value){this.completed++;job.state='done';if(this.jobs.get(job.key)===job)this.jobs.delete(job.key);for(const c of job.consumers){c.signal?.removeEventListener('abort',c.abort);error?c.reject(error):c.resolve(value);}job.consumers.clear();}
  snapshot(){return {limit:this.concurrency,reservedForTarget:this.reserve,preemptions:this.preemptions,active:[...this.active].map(j=>({key:j.key,priority:this.priority(j),consumers:j.consumers.size})),queued:[...this.jobs.values()].filter(j=>j.state==='queued').map(j=>({key:j.key,priority:this.priority(j),consumers:j.consumers.size})),completed:this.completed,cancelled:this.cancelled};}
}
export const transfers=new PriorityPool(),decodes=new PriorityPool({concurrency:1,reserve:0,background:1,preemptible:false});
const byteCache=new Map(),CACHE_LIMIT=16*1024*1024;let cacheBytes=0;
export function clearResourceBytes(){byteCache.clear();cacheBytes=0;}
export function forgetResourceBytes(url){const href=new URL(url,import.meta.url).href,value=byteCache.get(href);if(value){byteCache.delete(href);cacheBytes-=value.bytes.byteLength;}}
export function resourceDiagnostics(){return {network:transfers.snapshot(),decode:decodes.snapshot(),cachedBytes:cacheBytes,cacheLimit:CACHE_LIMIT};}
export const sha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function readResource(url,{signal,priority=PRIORITY.visible,limit=64*1024*1024,cache=false,credentials,referrerPolicy,fetchCache='default'}={}){
  const href=new URL(url,import.meta.url).href;
  let result=byteCache.get(href);
  if(result){byteCache.delete(href);byteCache.set(href,result);}
  else result=await transfers.run(href,async activeSignal=>{
    const response=await fetch(href,{signal:activeSignal,credentials:credentials||(new URL(href).origin===location.origin?'same-origin':'omit'),referrerPolicy,cache:fetchCache});
    if(!response.ok)throw new Error(`资源读取失败（HTTP ${response.status}）。`);
    const max=64*1024*1024;if(Number(response.headers.get('content-length'))>max)throw new Error('资源超过64 MB限制。');
    const parts=[];let length=0;const reader=response.body?.getReader();
    try{if(reader){for(;;){activeSignal.throwIfAborted();const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>max)throw new Error('资源超过64 MB限制。');parts.push(next.value);}}else{const value=new Uint8Array(await response.arrayBuffer());length=value.byteLength;if(length>max)throw new Error('资源超过64 MB限制。');parts.push(value);}}
    catch(error){await reader?.cancel().catch(()=>{});throw error;}finally{reader?.releaseLock();}
    activeSignal.throwIfAborted();const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    return {url:href,bytes,headers:[...response.headers],status:response.status};
  },{signal,priority});
  signal?.throwIfAborted();if(result.bytes.byteLength>limit)throw new Error('资源超过当前类型大小限制。');
  if(cache&&!byteCache.has(href)&&result.bytes.byteLength<=CACHE_LIMIT){while(cacheBytes+result.bytes.byteLength>CACHE_LIMIT&&byteCache.size){const [key,value]=byteCache.entries().next().value;byteCache.delete(key);cacheBytes-=value.bytes.byteLength;}byteCache.set(href,result);cacheBytes+=result.bytes.byteLength;}
  return result;
}
export async function resourceBytes(url,options){return (await readResource(url,options)).bytes;}
export async function decodeJSON(bytes,{signal,priority=PRIORITY.target,key='json'}={}){
  return decodes.run(key,async activeSignal=>{await new Promise(resolve=>setTimeout(resolve,0));activeSignal.throwIfAborted();let data=bytes;
    if(data[0]===31&&data[1]===139){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));data=new Uint8Array(await new Response(stream).arrayBuffer());}
    if(data.byteLength>16*1024*1024)throw new Error('目录解压超过大小限制。');activeSignal.throwIfAborted();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
  },{signal,priority});
}
