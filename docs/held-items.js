import * as THREE from './vendor/three/three.module.min.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';

export const HELD_ITEMS=Object.freeze({
  none:{key:'none',label:'无手持物品'},
  greatsword:{key:'greatsword',label:'单手大剑',asset:'models/held-greatsword-c82f73e0df5d.glb',sha256:'c82f73e0df5d9de2d67abdbe5ca9e5bfef029769a3b6daf45cd32b7caec709dc',lengthRatio:.76,turn:0,author:'Shadow Models 3D',license:'CC BY 4.0',source:'https://sketchfab.com/3d-models/greatsword-e2fe8da3bed74e1c9895966730afac05'},
  m416:{key:'m416',label:'M416',asset:'models/held-m416-1fffac6602a7.glb',sha256:'1fffac6602a701ab899e31183a147f05ae657ae52106390ea77286c67c970637',lengthRatio:.51,turn:Math.PI/2,author:'KisameBR',license:'CC BY 4.0',source:'https://sketchfab.com/3d-models/m416-c4af2388345b47b995cd5daa8531bde2'}
});
// The rifle's canonical barrel is +Z. In the palm rest frame its shooting
// direction follows wrist-to-middle (+X), requiring the item-specific +90° yaw.
export const isHeldItem=key=>Object.hasOwn(HELD_ITEMS,key);

export async function loadHeldItem(key,signal){
  const item=HELD_ITEMS[key];if(!item?.asset)throw new Error('未知的手持物品。');
  const url=new URL(item.asset,import.meta.url),response=await fetch(url,{signal,credentials:'same-origin'});
  if(!response.ok)throw new Error(`${item.label}读取失败（HTTP ${response.status}）。`);
  const data=await response.arrayBuffer();signal.throwIfAborted();
  if(data.byteLength>16*1024*1024)throw new Error('手持物品超过预览资源限制。');
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(sha!==item.sha256)throw new Error('手持物品与已登记来源版本不一致。');
  const asset=await new GLTFLoader().parseAsync(data,url.href.slice(0,url.href.lastIndexOf('/')+1));
  asset.scene.traverse(mesh=>{if(!mesh.isMesh)return;mesh.frustumCulled=false;mesh.userData.heldItem=key;mesh.geometry.computeBoundingBox();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.userData.heldItem=key;});
  return asset.scene;
}

// Build the socket from the target's actual wrist/knuckle rest frame. The
// canonical item grip is the origin; world units are compensated by the full
// bone matrix, including Klee's explicit PMX scale.
export function mountHeldItem(character,bones,rests,profile,key,template){
  const item=HELD_ITEMS[key],handName=profile.mapping.RightHand,hand=bones.get(handName.replace(/\s/g,'_'));
  if(!hand)throw new Error('当前角色缺少可用的右手骨骼。');
  character.updateMatrixWorld(true);
  const wrist=rests.get(hand.name).worldP.clone(),point=semantic=>{const name=profile.mapping[semantic];return name?rests.get(name.replace(/\s/g,'_'))?.worldP.clone():null;};
  const middle=point('RightHandMiddle1'),index=point('RightHandIndex1'),pinky=point('RightHandPinky1');
  if(!middle||!index||!pinky)throw new Error('当前角色缺少已核的手掌握持基准。');
  const fingers=middle.clone().sub(wrist).normalize(),up=index.clone().sub(pinky);
  up.addScaledVector(fingers,-up.dot(fingers)).normalize();if(up.y<0)up.negate();
  if(!Number.isFinite(up.length())||up.lengthSq()<.9)throw new Error('手掌坐标基准退化。');
  const normal=new THREE.Vector3().crossVectors(fingers,up).normalize(),basis=new THREE.Matrix4().makeBasis(fingers,up,normal),orientation=new THREE.Quaternion().setFromRotationMatrix(basis);
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn));
  const anchor=wrist.clone().lerp(middle,.52),height=new THREE.Box3().setFromObject(character).getSize(new THREE.Vector3()).y,length=height*item.lengthRatio;
  if(!Number.isFinite(length)||length<=0)throw new Error('角色的实际展示尺度无效。');
  const desired=new THREE.Matrix4().compose(anchor,orientation,new THREE.Vector3(length,length,length));
  const group=new THREE.Group();group.name='Handheld_'+key;group.userData.heldItem=key;group.userData.heldGrip=true;group.userData.handName=hand.name;group.userData.normalizedLength=length;
  group.matrixAutoUpdate=false;group.matrix.copy(hand.matrixWorld.clone().invert().multiply(desired));group.add(template.clone(true));hand.add(group);character.updateMatrixWorld(true);
  return group;
}

export function heldObject(root){let found=null;root?.traverse(o=>{if(o.userData.heldGrip)found=o;});return found;}
export function heldDiagnostics(root,bones,profile){
  const item=heldObject(root);if(!item)return null;
  const hand=bones.get(profile.mapping.RightHand.replace(/\s/g,'_'));
  const left=bones.get(profile.mapping.LeftHand.replace(/\s/g,'_')),middle=bones.get(profile.mapping.RightHandMiddle1.replace(/\s/g,'_')),grip=item.getWorldPosition(new THREE.Vector3()),forward=new THREE.Vector3(0,0,1).transformDirection(item.matrixWorld),support=left?left.getWorldPosition(new THREE.Vector3()).sub(grip).normalize():null,palm=hand&&middle?hand.getWorldPosition(new THREE.Vector3()).lerp(middle.getWorldPosition(new THREE.Vector3()),.52):null;return {key:item.userData.heldItem,hand:hand?.name,parentMatchesHand:item.parent===hand,leftHandWorld:left?.getWorldPosition(new THREE.Vector3()).toArray(),handMatrix:hand?.matrixWorld.toArray(),palmWorld:palm?.toArray(),gripToPalm:palm?grip.distanceTo(palm):null,forwardWorld:forward.toArray(),forwardSupportDot:support?forward.dot(support):null,gripWorld:item.getWorldPosition(new THREE.Vector3()).toArray(),handWorld:hand?.getWorldPosition(new THREE.Vector3()).toArray(),worldMatrix:item.matrixWorld.toArray(),length:item.userData.normalizedLength};
}
