import {resourceBytes,decodeJSON,sha256,forgetResourceBytes,PRIORITY} from './resource-queue.js';
let pending;
export function loadCatalog(){if(!pending)pending=load().catch(error=>{pending=null;throw error;});return pending;}
async function verified(descriptor,options){const bytes=await resourceBytes(descriptor.url,{...options,cache:true,limit:8*1024*1024});if(bytes.byteLength!==descriptor.bytes||await sha256(bytes)!==descriptor.sha256){forgetResourceBytes(descriptor.url);throw new Error('目录分片版本或内容校验失败，请刷新重试。');}return decodeJSON(bytes,{...options,key:descriptor.url});}
async function load(){
  const manifest=await decodeJSON(await resourceBytes('data/navigation.json',{priority:PRIORITY.target,cache:true,limit:256*1024}),{key:'navigation-manifest'});
  if(manifest.schema!=='motion-room.catalog.v2'||!/^[a-f0-9]{64}$/.test(manifest.revision))throw new Error('导航版本无效。');
  const nav=await verified(manifest.index,{priority:PRIORITY.target});if(nav.revision!==manifest.revision||nav.schema!=='motion-room.navigation.v1')throw new Error('导航与详情不属于同一版本。');
  const categories=new Map(manifest.categories.map(c=>[c.code,c.label])),clips=nav.clips.map(values=>{const r=Object.fromEntries(nav.fields.map((key,i)=>[key,values[i]]).filter(([,v])=>v!==null));r.category=categories.get(r.categoryCode);return r;});
  if(clips.length!==manifest.library.count||new Set(clips.map(r=>r.id)).size!==clips.length)throw new Error('导航条目不完整。');
  const catalog={version:manifest.version,library:manifest.library,categories:manifest.categories,clips,revision:manifest.revision},byId=new Map(clips.map(r=>[r.id,r]));
  const loaded=new Set();catalog.metadataURLs=ids=>['data/navigation.json',manifest.index.url,...[...new Set(ids.map(id=>byId.get(id)?.detailShard).filter(Number.isInteger))].map(i=>manifest.details[i].url)];
  catalog.ensureRows=async(ids,{signal,priority=PRIORITY.target}={})=>{
    const groups=[...new Set(ids.map(id=>{const row=byId.get(id);if(!row)throw new Error('当前目录不存在该动作。');return row.detailShard;}))];
    await Promise.all(groups.map(async i=>{if(loaded.has(i))return;const descriptor=manifest.details[i];if(!descriptor||!/^data\/catalog\/details-[a-f0-9]{12}\.json\.gz$/.test(descriptor.url))throw new Error('详情分片路径无效。');const detail=await verified(descriptor,{signal,priority});signal?.throwIfAborted();
      if(detail.schema!=='motion-room.details.v1'||detail.revision!==manifest.revision||JSON.stringify(detail.clips.map(r=>r.id))!==JSON.stringify(descriptor.ids))throw new Error('详情与导航身份不一致。');
      for(const row of detail.clips){const target=byId.get(row.id);if(!target||JSON.stringify(target.variants.map(v=>[v.key,v.sha256]))!==JSON.stringify(row.variants.map(v=>[v.key,v.sha256])))throw new Error('动作变体身份变化。');}
      for(const row of detail.clips)Object.assign(byId.get(row.id),row,{detailReady:true});loaded.add(i);
    }));return ids.map(id=>byId.get(id));
  };
  return catalog;
}
