import {decodePinnedArchive,loadPmxArchive,readPinnedResponse} from './pmx-source.js';
export {materialTextures} from './pmx-source.js';
export const KLEE_SOURCE={
  label:'可莉',url:'https://i0.hdslb.com/bfs/game-static/6c7d34e8ca3f07623f9de5ce03a0600eddfda45c.zip',
  sha256:'894fb807efca259c75f663ae3c4798533d39506ea8c49d1ec1c7a1dc9e16ea4f',
  bytes:1235776,page:'https://ys.biligame.com/pjdkx/',editor:'神帝宇',copyright:'miHoYo',
  use:'非商业模型预览；官方原件直接取得，禁止二次配布；完整规则见原包。',
  previewUnitScale:.08,unitPolicy:'显式 MMD 预览归一化；未验证标准身高。',
  limitations:'未启用 MMD 刚体、IK、grant 运行时；不代表接触或动作质量验收。'
};
export const KLEE_DEPENDENCIES=['klee-source.js','pmx-source.js','vendor/three/mmd/loaders/MMDLoader.js','vendor/three/mmd/loaders/TGALoader.js','vendor/three/mmd/shaders/MMDToonShader.js','vendor/three/mmd/libs/mmdparser.module.js'];
const MEMBERS=new Map(Object.entries({'可莉/':0,'可莉/Texture/':0,'可莉/Texture/mc3.png':33861,'可莉/Texture/toon.png':1270,'可莉/Texture/头发.jpg':189144,'可莉/Texture/脸.jpg':140275,'可莉/Texture/衣服.jpg':409027,'可莉/Texture/表情.png':136533,'可莉/使用规则.txt':287,'可莉/可莉2.0.pmx':1082447}));
const SPEC={source:KLEE_SOURCE,members:MEMBERS,flags:2048,encoding:'utf-8',total:1992844,root:'可莉/',model:'可莉/可莉2.0.pmx',textures:['可莉/Texture/mc3.png','可莉/Texture/toon.png','可莉/Texture/头发.jpg','可莉/Texture/脸.jpg','可莉/Texture/衣服.jpg','可莉/Texture/表情.png'],bones:238,materials:12,textureMaps:12,diffuseImages:4,name:'KleePreview',format:'official-pmx-zip'};
export const decodeKleeArchive=(buffer,signal)=>decodePinnedArchive(buffer,SPEC,signal);
export async function loadKleeSource({signal}={}){
  signal?.throwIfAborted();const cacheControlledAtFetch=!!globalThis.navigator?.serviceWorker?.controller;let response;
  try{response=await fetch(KLEE_SOURCE.url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});}
  catch(error){if(signal?.aborted||error.name==='AbortError')throw error;throw new Error(globalThis.navigator?.onLine===false?'当前离线，可莉原件尚未缓存或已清理。请联网重新载入。':'可莉官方原件暂时无法读取，可切回其它角色或重新载入。');}
  const buffer=await readPinnedResponse(response,KLEE_SOURCE,signal);
  return loadPmxArchive(buffer,SPEC,{signal,cacheControlledAtFetch});
}
