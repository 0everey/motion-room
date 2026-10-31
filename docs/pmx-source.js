import * as THREE from './vendor/three/three.module.min.js';

const abort=signal=>signal?.throwIfAborted();
const invalid=message=>Object.assign(new Error(message),{code:'MODEL_SOURCE_INVALID'});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
// MMD shader map getters are non-enumerable; their textures live in uniforms.
export function materialTextures(material){
  const textures=new Set();
  for(const value of Object.values(material||{}))if(value?.isTexture)textures.add(value);
  for(const uniform of Object.values(material?.uniforms||{}))for(const value of Array.isArray(uniform?.value)?uniform.value:[uniform?.value])if(value?.isTexture)textures.add(value);
  return textures;
}

export async function decodePinnedArchive(buffer,spec,signal){
  const source=spec.source,MEMBERS=spec.members;
  abort(signal);
  if(buffer.byteLength!==source.bytes||await digest(buffer)!==source.sha256)throw invalid('角色原包版本不符，未采用；请重新载入。');
  abort(signal);
  const view=new DataView(buffer),bytes=new Uint8Array(buffer),end=buffer.byteLength-22;
  if(view.getUint32(end,true)!==0x06054b50||view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==MEMBERS.size||view.getUint16(end+10,true)!==MEMBERS.size||view.getUint16(end+20,true))throw invalid('角色原包目录无效。');
  const offset=view.getUint32(end+16,true),size=view.getUint32(end+12,true),files=new Map(),decoder=new TextDecoder(spec.encoding,{fatal:true});
  if(offset+size!==end)throw invalid('角色原包目录边界无效。');
  let cursor=offset,total=0;
  for(let i=0;i<MEMBERS.size;i++){
    abort(signal);
    if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)throw invalid('角色原包成员目录无效。');
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),packed=view.getUint32(cursor+20,true),length=view.getUint32(cursor+24,true),n=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true),next=cursor+46+n+extra+comment;
    if(next>end||flags!==spec.flags||![0,8].includes(method)||local+30>offset)throw invalid('角色原包成员格式无效。');
    const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+n));
    if(!MEMBERS.has(name)||MEMBERS.get(name)!==length||files.has(name))throw invalid('角色原包成员身份不符。');
    if(view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method)throw invalid('角色原包本地目录无效。');
    const localName=view.getUint16(local+26,true),start=local+30+localName+view.getUint16(local+28,true);
    if(start+packed>offset||decoder.decode(bytes.subarray(local+30,local+30+localName))!==name)throw invalid('角色原包成员边界无效。');
    const compressed=bytes.slice(start,start+packed);
    let data;
    if(method===0)data=compressed;
    else{
      let stream;
      try{stream=new DecompressionStream('deflate-raw');}catch{throw new Error('当前浏览器不支持此模型的本地解压，请更新浏览器后重试。');}
      const reader=new Blob([compressed]).stream().pipeThrough(stream).getReader(),parts=[];let count=0;
      const cancel=()=>{reader.cancel(signal.reason).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
      try{while(true){abort(signal);const item=await reader.read();if(item.done)break;count+=item.value.byteLength;if(count>length)throw invalid('角色原包解压长度不符。');parts.push(item.value);}data=new Uint8Array(count);let at=0;for(const part of parts){data.set(part,at);at+=part.byteLength;}}
      finally{signal?.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
    abort(signal);if(data.byteLength!==length)throw invalid('角色原包解压长度不符。');
    files.set(name,data);total+=length;cursor=next;
  }
  if(cursor!==end||total!==spec.total)throw invalid('角色原包内容不完整。');
  return files;
}

function disposePending(mesh){
  if(!mesh)return;const textures=new Set();mesh.geometry?.dispose();mesh.skeleton?.dispose();
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material){for(const texture of materialTextures(material))textures.add(texture);material.dispose();}
  for(const texture of textures){texture.image?.close?.();texture.dispose();}
}
export async function readPinnedResponse(response,source,signal){

  if(!response.ok)throw new Error(source.missingMessage||`${source.label}原件读取失败（HTTP ${response.status}），可切回其它角色或重新载入。`);
  if(Number(response.headers.get('content-length'))>source.bytes)throw invalid('角色原包大小不符。');
  const reader=response.body.getReader(),parts=[];let length=0;
  try{while(true){abort(signal);const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>source.bytes)throw invalid('角色原包超过预期大小。');parts.push(item.value);}const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}return bytes.buffer;}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function loadPmxArchive(buffer,spec,{signal,cacheControlledAtFetch=false}={}){
  const files=await decodePinnedArchive(buffer,spec,signal),source=spec.source;
  abort(signal);const {MMDLoader}=await import('./vendor/three/mmd/loaders/MMDLoader.js');abort(signal);
  const urls=new Set(),mapped=new Map(),usedTextures=new Set();let mesh,transferred=false,rejectTextures;
  const make=(data,type)=>{const url=URL.createObjectURL(new Blob([data],{type}));urls.add(url);return url;};
  const release=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
  const cancelled=()=>{rejectTextures?.(signal.reason);release();};signal?.addEventListener('abort',cancelled,{once:true});
  try{
    for(const [name,data]of files)if(spec.textures.includes(name))mapped.set('memory://pinned/'+name.slice(spec.root.length),make(data,name.endsWith('.png')?'image/png':'image/jpeg'));
    const modelURL=make(files.get(spec.model),'application/octet-stream');
    let complete;const ready=new Promise((resolve,reject)=>{complete=resolve;rejectTextures=reject;});
    // A texture can fail before the PMX FileLoader invokes onLoad.
    ready.catch(()=>{});
    const manager=new THREE.LoadingManager(complete,undefined,url=>rejectTextures(new Error('角色贴图未完整读取：'+url)));
    manager.setURLModifier(url=>{if(urls.has(url)||url.startsWith('data:'))return url;const key=url.replaceAll('\\','/');if(mapped.has(key)){usedTextures.add(key);return mapped.get(key);}throw new Error('角色原包引用了未提供的贴图。');});
    mesh=await new Promise((resolve,reject)=>new MMDLoader(manager).setResourcePath('memory://pinned/').load(modelURL,resolve,undefined,reject));
    await ready;abort(signal);
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const mappedMaterials=materials.filter(m=>m.map?.image),uniqueImages=new Set(mappedMaterials.map(m=>m.map.image));
    if(mesh.skeleton.bones.length!==spec.bones||materials.length!==spec.materials||mappedMaterials.length!==spec.textureMaps||uniqueImages.size!==spec.diffuseImages||usedTextures.size!==spec.textures.length)throw new Error('角色骨架或贴图尚未完整就绪。');
    const scene=new THREE.Group();scene.name=spec.name;scene.scale.setScalar(source.previewUnitScale);scene.add(mesh);scene.updateMatrixWorld(true);abort(signal);transferred=true;
    return {scene,source:{...source,verifiedSha256:source.sha256,bytes:buffer.byteLength,format:spec.format,cacheControlledAtFetch,bones:mesh.skeleton.bones.length,materials:materials.length,textureMaps:mappedMaterials.length,diffuseTextureFiles:uniqueImages.size,textureFiles:usedTextures.size,parser:'Three r170 MMDLoader',handedness:'PMX left→right once in original loader'}};
  }finally{signal?.removeEventListener('abort',cancelled);release();if(!transferred)disposePending(mesh);}
}
