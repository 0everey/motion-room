export const CATEGORY_COLORS={'01':'#2989b3','02':'#d78336','03':'#d65768','04':'#8b67bd','05':'#516cbb','06':'#aa63a6','07':'#3d9e99','08':'#b96558','09':'#73933d','10':'#cf718b','11':'#9a70c5','12':'#3c9a78','13':'#748494'};
export const categoryColor=row=>CATEGORY_COLORS[row?.categoryCode]||'#748494';
export const readyVariants=row=>(row?.variants||[]).filter(v=>v.hasRotations===true);
export const variantFor=(row,kind='source')=>readyVariants(row).find(v=>v.key===kind)||readyVariants(row).find(v=>v.key==='source')||readyVariants(row)[0];
export const actualDuration=(row,kind='source')=>variantFor(row,kind)?.duration??row.duration??0;
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[_-]/g,' ');
export function searchCatalog(catalog,state){
  let query=normalize(state.query).trim(),inPlace=state.inPlace||'all',loop=state.loop||'all';
  if(/非原地|not in place/.test(query)){inPlace='no';query=query.replace(/非原地|not in place/g,' ');}else if(/原地|in place/.test(query)){inPlace='yes';query=query.replace(/原地|in place/g,' ');}
  const tokens=query.split(/\s+/).filter(Boolean);
  const matches=(hay,token)=>hay.includes(token)||(token==='步枪'&&/rifle|步枪/.test(hay))||(token==='装弹'&&/reload|换弹|装弹/.test(hay));
  let rows=catalog.clips.filter(row=>{
    if(state.category&&state.category!=='all'&&row.categoryCode!==state.category)return false;
    if(state.subcategory&&state.subcategory!=='all'&&row.subcategory!==state.subcategory)return false;
    if(state.weapon&&state.weapon!=='all'&&row.weapon!==state.weapon)return false;
    if(inPlace!=='all'&&row.inPlace!==(inPlace==='yes'))return false;
    if(loop!=='all'&&row.loop!==(loop==='yes'))return false;
    if(state.favoritesOnly&&!state.favorites?.includes(row.id))return false;
    const duration=actualDuration(row,state.variant);
    if(state.duration==='short'&&duration>2)return false;
    if(state.duration==='medium'&&(duration<=2||duration>5))return false;
    if(state.duration==='long'&&duration<=5)return false;
    const hay=normalize([row.name,row.english,row.id,row.category,row.subcategory,row.weapon,row.searchText,row.originalSource?.sha256,row.originalSource?.mixamoId].join(' '));
    return tokens.every(token=>matches(hay,token));
  });
  const score=row=>tokens.reduce((n,t)=>n+(normalize(row.name).startsWith(t)?8:0)+(normalize(row.english).startsWith(t)?6:0),0)+(row.namePinyin&&normalize(row.namePinyin).replaceAll(' ','').startsWith(query.replaceAll(' ',''))?18:0)+(row.nameInitials&&row.nameInitials.startsWith(query.replaceAll(' ',''))?16:0);
  if(state.sort==='duration')rows.sort((a,b)=>actualDuration(a,state.variant)-actualDuration(b,state.variant));
  else if(state.sort==='name')rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','zh-CN'));
  else if(tokens.length)rows.sort((a,b)=>score(b)-score(a));
  else if(state.sort==='relevance'&&state.category==='all'&&!state.basketOnly){const groups=new Map();for(const row of rows){if(!groups.has(row.categoryCode))groups.set(row.categoryCode,[]);groups.get(row.categoryCode).push(row);}const mixed=[];for(let i=0;mixed.length<rows.length;i++)for(const group of groups.values())if(group[i])mixed.push(group[i]);rows=mixed;}
  return rows;
}
export function originalSource(row,catalog){
  const item=row.originalSource,release=catalog.library?.originalSources;
  if(!item||!release||!/^[a-f0-9]{40}$/.test(release.commit)||!/^0everey\/[A-Za-z0-9_.-]+$/.test(release.repository))return null;
  if(!/^clips\/.+\.fbx$/i.test(item.path)||item.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(item.sha256))return null;
  const encoded=item.path.split('/').map(encodeURIComponent).join('/');
  return {...item,repository:release.repository,commit:release.commit,
    url:`https://raw.githubusercontent.com/${release.repository}/${release.commit}/${encoded}`,
    page:`https://github.com/${release.repository}/blob/${release.commit}/${encoded}`};
}
export function sourceText(row,catalog,variant){
  const source=originalSource(row,catalog);
  return JSON.stringify({schema:'motion-source-reference.v1',id:row.id,name:row.name,english:row.english,
    originalSource:source?{mixamoId:source.mixamoId,path:source.path,sha256:source.sha256,bytes:source.bytes,repository:source.repository,commit:source.commit,url:source.url,page:source.page}:null,
    currentPreview:variant?{variant:variant.key,url:new URL(variant.url,location.href).href,sha256:variant.sha256,sourceSha256Role:variant.sourceSha256Role||'original source FBX',sourceIdentities:variant.sourceIdentities||{sourceFbxSha256:variant.sourceSha256},fps:variant.fps,frames:variant.frames,duration:variant.duration}:null},null,2);
}
export async function downloadVerified(url,{sha256,bytes,filename},signal){
  const response=await fetch(url,{signal,credentials:'omit'});
  if(!response.ok)throw new Error(`下载失败：HTTP ${response.status}`);
  if(Number(response.headers.get('content-length'))>64*1024*1024)throw new Error('下载文件超过本次大小限制。');
  const data=await response.arrayBuffer();
  if(data.byteLength>64*1024*1024||(bytes&&data.byteLength!==bytes))throw new Error('文件字节数与来源记录不一致，未保存。');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(sha256&&digest!==sha256)throw new Error('文件 SHA-256 与来源记录不一致，未保存。');
  const link=document.createElement('a'),blob=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));
  link.href=blob;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(blob),30000);
  return {filename,bytes:data.byteLength,sha256:digest,url};
}

export class MotionBank{
  constructor({onChange=()=>{},fetchMotion,budget=192*1024*1024}){Object.assign(this,{onChange,fetchMotion,budget});this.entries=new Map();this.generation=0;this.phase='empty';this.errors=new Map();this.items=[];this.bytes=0;this.inflight=0;}
  async load(rows,kind='source'){
    const generation=++this.generation;this.controller?.abort();this.controller=new AbortController();this.items=rows.map(row=>({row,variant:variantFor(row,kind)}));this.errors=new Map();this.phase='loading';
    const needed=new Set(this.items.filter(x=>x.variant).map(x=>x.variant.sha256));
    for(const [key,value]of this.entries)if(!needed.has(key)&&this.bytes+this.items.reduce((n,x)=>n+(this.entries.has(x.variant?.sha256)?0:(x.variant?.uncompressedBytes||0)),0)>this.budget){this.entries.delete(key);this.bytes-=value.motion.byteLength;}
    const projected=this.items.reduce((n,x)=>n+(x.variant?.uncompressedBytes||0),0);
    if(projected>this.budget){this.phase='error';this.error='本页解码数据超过192 MB，请降低同屏数量或收窄时长。';this.onChange();return false;}
    let cursor=0;this.inflight=0;this.error=null;this.onChange();
    const run=async()=>{
      while(cursor<this.items.length&&generation===this.generation){const item=this.items[cursor++],variant=item.variant;
        if(!variant){this.errors.set(item.row.id,'该项预览供给尚未完成');this.onChange();continue;}
        if(this.entries.has(variant.sha256)){this.entries.get(variant.sha256).used=performance.now();continue;}
        this.inflight++;this.onChange();
        try{const motion=await this.fetchMotion(new URL(variant.url,import.meta.url),this.controller.signal);if(generation!==this.generation)return;
          if(motion.meta.id!==item.row.id||motion.meta.kind!==variant.key||!motion.rotations)throw new Error('实际预览身份与当前卡片不一致。');
          while(this.bytes+motion.byteLength>this.budget){const victim=[...this.entries].filter(([key])=>!needed.has(key)).sort((a,b)=>a[1].used-b[1].used)[0];if(!victim)throw new Error('当前可见动作超过内存预算，请减少同屏数量。');this.entries.delete(victim[0]);this.bytes-=victim[1].motion.byteLength;}
          this.entries.set(variant.sha256,{motion,used:performance.now()});this.bytes+=motion.byteLength;
        }catch(error){if(generation===this.generation&&error.name!=='AbortError')this.errors.set(item.row.id,error.message);}
        finally{if(generation===this.generation){this.inflight--;this.onChange();}}
      }
    };
    await Promise.all(Array.from({length:Math.min(4,this.items.length)},run));
    if(generation!==this.generation)return false;this.phase=this.errors.size?'partial':'ready';this.onChange();return true;
  }
  motion(item){return this.entries.get(item.variant?.sha256)?.motion||null;}
  clear(){this.generation++;this.controller?.abort();this.entries.clear();this.bytes=0;this.inflight=0;this.items=[];this.errors.clear();this.phase='cleared';this.onChange();}
  snapshot(){return {phase:this.phase,generation:this.generation,decodedBytes:this.bytes,budget:this.budget,inflight:this.inflight,visible:this.items.map(x=>({id:x.row.id,variant:x.variant?.key,sha256:x.variant?.sha256,ready:!!this.motion(x),error:this.errors.get(x.row.id)||null})),errors:[...this.errors]};}
}
