import * as THREE from './vendor/three/three.module.min.js';

export const KLEE_SOURCE={
  url:'https://i0.hdslb.com/bfs/game-static/6c7d34e8ca3f07623f9de5ce03a0600eddfda45c.zip',
  sha256:'894fb807efca259c75f663ae3c4798533d39506ea8c49d1ec1c7a1dc9e16ea4f',
  bytes:1235776,page:'https://ys.biligame.com/pjdkx/',editor:'神帝宇',copyright:'miHoYo',
  use:'非商业模型预览；官方原件直接取得，禁止二次配布；完整规则见原包。',
  previewUnitScale:.08,unitPolicy:'显式 MMD 预览归一化；未验证标准身高。',
  limitations:'未启用 MMD 刚体、IK、grant 运行时；不代表接触或动作质量验收。'
};
export const KLEE_DEPENDENCIES=['klee-source.js','vendor/three/mmd/loaders/MMDLoader.js','vendor/three/mmd/loaders/TGALoader.js','vendor/three/mmd/shaders/MMDToonShader.js','vendor/three/mmd/libs/mmdparser.module.js'];
const MEMBERS=new Map(Object.entries({'可莉/':0,'可莉/Texture/':0,'可莉/Texture/mc3.png':33861,'可莉/Texture/toon.png':1270,'可莉/Texture/头发.jpg':189144,'可莉/Texture/脸.jpg':140275,'可莉/Texture/衣服.jpg':409027,'可莉/Texture/表情.png':136533,'可莉/使用规则.txt':287,'可莉/可莉2.0.pmx':1082447}));
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

export async function decodeKleeArchive(buffer,signal){
  abort(signal);
  if(buffer.byteLength!==KLEE_SOURCE.bytes||await digest(buffer)!==KLEE_SOURCE.sha256)throw invalid('可莉官方原件版本不符，未采用；请重新载入。');
  abort(signal);
  const view=new DataView(buffer),bytes=new Uint8Array(buffer),end=buffer.byteLength-22;
  if(view.getUint32(end,true)!==0x06054b50||view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==MEMBERS.size||view.getUint16(end+10,true)!==MEMBERS.size||view.getUint16(end+20,true))throw invalid('可莉原包目录无效。');
  const offset=view.getUint32(end+16,true),size=view.getUint32(end+12,true),files=new Map(),decoder=new TextDecoder('utf-8',{fatal:true});
  if(offset+size!==end)throw invalid('可莉原包目录边界无效。');
  let cursor=offset,total=0;
  for(let i=0;i<MEMBERS.size;i++){
    abort(signal);
    if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)throw invalid('可莉原包成员目录无效。');
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),packed=view.getUint32(cursor+20,true),length=view.getUint32(cursor+24,true),n=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true),next=cursor+46+n+extra+comment;
    if(next>end||flags!==2048||![0,8].includes(method)||local+30>offset)throw invalid('可莉原包成员格式无效。');
    const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+n));
    if(!MEMBERS.has(name)||MEMBERS.get(name)!==length||files.has(name))throw invalid('可莉原包成员身份不符。');
    if(view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method)throw invalid('可莉原包本地目录无效。');
    const localName=view.getUint16(local+26,true),start=local+30+localName+view.getUint16(local+28,true);
    if(start+packed>offset||decoder.decode(bytes.subarray(local+30,local+30+localName))!==name)throw invalid('可莉原包成员边界无效。');
    const compressed=bytes.slice(start,start+packed);
    let data;
    if(method===0)data=compressed;
    else{
      let stream;
      try{stream=new DecompressionStream('deflate-raw');}catch{throw new Error('当前浏览器不支持此模型的本地解压，请更新浏览器后重试。');}
      const reader=new Blob([compressed]).stream().pipeThrough(stream).getReader(),parts=[];let count=0;
      const cancel=()=>{reader.cancel(signal.reason).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
      try{while(true){abort(signal);const item=await reader.read();if(item.done)break;count+=item.value.byteLength;if(count>length)throw invalid('可莉原包解压长度不符。');parts.push(item.value);}data=new Uint8Array(count);let at=0;for(const part of parts){data.set(part,at);at+=part.byteLength;}}
      finally{signal?.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
    abort(signal);if(data.byteLength!==length)throw invalid('可莉原包解压长度不符。');
    files.set(name,data);total+=length;cursor=next;
  }
  if(cursor!==end||total!==1992844)throw invalid('可莉原包内容不完整。');
  return files;
}

function disposePending(mesh){
  if(!mesh)return;const textures=new Set();mesh.geometry?.dispose();mesh.skeleton?.dispose();
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material){for(const texture of materialTextures(material))textures.add(texture);material.dispose();}
  for(const texture of textures){texture.image?.close?.();texture.dispose();}
}
async function readArchive(response,signal){
  if(!response.ok)throw new Error(`可莉官方原件读取失败（HTTP ${response.status}），可切回其它角色或重新载入。`);
  if(Number(response.headers.get('content-length'))>KLEE_SOURCE.bytes)throw invalid('可莉官方原件大小不符。');
  const reader=response.body.getReader(),parts=[];let length=0;
  try{while(true){abort(signal);const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>KLEE_SOURCE.bytes)throw invalid('可莉官方原件超过预期大小。');parts.push(item.value);}const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}return bytes.buffer;}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function loadKleeSource({signal}={}){
  abort(signal);const cacheControlledAtFetch=!!globalThis.navigator?.serviceWorker?.controller;let response;
  try{response=await fetch(KLEE_SOURCE.url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});}
  catch(error){if(signal?.aborted||error.name==='AbortError')throw error;throw new Error(globalThis.navigator?.onLine===false?'当前离线，可莉原件尚未缓存或已清理。请联网重新载入。':'可莉官方原件暂时无法读取，可切回其它角色或重新载入。');}
  const buffer=await readArchive(response,signal),files=await decodeKleeArchive(buffer,signal);
  abort(signal);const {MMDLoader}=await import('./vendor/three/mmd/loaders/MMDLoader.js');abort(signal);
  const urls=new Set(),mapped=new Map();let mesh,transferred=false,rejectTextures;
  const make=(data,type)=>{const url=URL.createObjectURL(new Blob([data],{type}));urls.add(url);return url;};
  const release=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
  const cancelled=()=>{rejectTextures?.(signal.reason);release();};signal?.addEventListener('abort',cancelled,{once:true});
  try{
    for(const [name,data]of files)if(/\.(?:png|jpg)$/.test(name))mapped.set('memory://klee/'+name.slice('可莉/'.length),make(data,name.endsWith('.png')?'image/png':'image/jpeg'));
    const modelURL=make(files.get('可莉/可莉2.0.pmx'),'application/octet-stream');
    let complete;const ready=new Promise((resolve,reject)=>{complete=resolve;rejectTextures=reject;});
    // A texture can fail before the PMX FileLoader invokes onLoad.
    ready.catch(()=>{});
    const manager=new THREE.LoadingManager(complete,undefined,url=>rejectTextures(new Error('可莉贴图未完整读取：'+url)));
    manager.setURLModifier(url=>{if(urls.has(url)||url.startsWith('data:'))return url;const key=url.replaceAll('\\','/');if(mapped.has(key))return mapped.get(key);throw new Error('可莉原包引用了未提供的贴图。');});
    mesh=await new Promise((resolve,reject)=>new MMDLoader(manager).setResourcePath('memory://klee/').load(modelURL,resolve,undefined,reject));
    await ready;abort(signal);
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(mesh.skeleton.bones.length!==238||materials.length!==12||materials.some(m=>!m.map?.image))throw new Error('可莉骨架或贴图尚未完整就绪。');
    const scene=new THREE.Group();scene.name='KleePreview';scene.scale.setScalar(KLEE_SOURCE.previewUnitScale);scene.add(mesh);scene.updateMatrixWorld(true);abort(signal);transferred=true;
    return {scene,source:{...KLEE_SOURCE,verifiedSha256:KLEE_SOURCE.sha256,bytes:buffer.byteLength,format:'official-pmx-zip',cacheControlledAtFetch,textureMaps:materials.length,parser:'Three r170 MMDLoader',handedness:'PMX left→right once in original loader'}};
  }finally{signal?.removeEventListener('abort',cancelled);release();if(!transferred)disposePending(mesh);}
}
