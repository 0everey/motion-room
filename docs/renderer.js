import * as THREE from './vendor/three/three.module.min.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';
import {sampleMotion} from './mvp.js';
import {MODEL_ASSET,CHARACTER_PROFILES,DEFAULT_CHARACTER} from './character.js';

const ASSETS=[MODEL_ASSET,'character.js','vendor/three/three.module.min.js','vendor/three/GLTFLoader.js','vendor/three/BufferGeometryUtils.js'];
const Q=()=>new THREE.Quaternion(),V=()=>new THREE.Vector3();
const safeName=name=>name?.replace(/\s/g,'_');
export function disposeSkeletons(root){const skeletons=new Set();root?.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();}
function disposeObject(root){if(!root)return;disposeSkeletons(root);const textures=new Set();root.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}});for(const t of textures){t.image?.close?.();t.dispose();}}

// The base geometry owns one color buffer. Cloned actors share it like positions/skin weights.
export function applyBodyColors(mesh,profile){
  const config=profile.bodyColors;if(!config||!mesh.isSkinnedMesh)return null;
  if(mesh.geometry.userData.bodyColorProfile===profile.key)return mesh.geometry.userData.bodyColorStats;
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
  if(!indices||!weights)throw new Error('分区预览缺少真实蒙皮权重。');
  const palette=Object.fromEntries(Object.entries(config.palette).map(([key,hex])=>[key,new THREE.Color(hex)]));
  const regions=mesh.skeleton.bones.map(bone=>{for(let node=bone;node?.isBone;node=node.parent)if(config.roots[node.name])return config.roots[node.name];return 'torso';});
  const color=new Float32Array(indices.count*3),vertices=Object.fromEntries(Object.keys(palette).map(key=>[key,0]));
  for(let i=0;i<indices.count;i++){
    const totals={};let sum=0;
    for(let k=0;k<4;k++){const weight=weights.getComponent(i,k);if(!Number.isFinite(weight)||weight<0)throw new Error('分区预览蒙皮权重无效。');if(!weight)continue;const region=regions[indices.getComponent(i,k)];if(!region)throw new Error('分区预览骨骼身份无效。');const value=palette[region];color[i*3]+=value.r*weight;color[i*3+1]+=value.g*weight;color[i*3+2]+=value.b*weight;totals[region]=(totals[region]||0)+weight;sum+=weight;}
    if(sum<=0)throw new Error('分区预览出现未绑定顶点。');for(let k=0;k<3;k++)color[i*3+k]/=sum;
    vertices[Object.keys(totals).reduce((a,b)=>totals[a]>=totals[b]?a:b)]++;
  }
  mesh.geometry.setAttribute('color',new THREE.BufferAttribute(color,3));
  const face=applyFaceColors(mesh,profile);
  const stats={profile:profile.key,palette:config.palette,vertices,bufferBytes:color.byteLength,coordinateBasis:'character bone branches and original skin weights',face};
  mesh.geometry.userData.bodyColorProfile=profile.key;mesh.geometry.userData.bodyColorStats=stats;return stats;
}

// Paint the real head in bind-local coordinates, so turning the head never moves the face.
export function applyFaceColors(mesh,profile){
  const config=profile.face;if(!config)return null;const boneIndex=mesh.skeleton.bones.findIndex(b=>b.name===config.bone);if(boneIndex<0)throw new Error('头部朝向预览缺少目标骨骼。');
  const transform=mesh.skeleton.boneInverses[boneIndex].clone().multiply(mesh.bindMatrix),positions=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,color=mesh.geometry.attributes.color,box=new THREE.Box3(),points=[];
  for(let i=0;i<positions.count;i++){let weight=0;for(let k=0;k<4;k++)if(indices.getComponent(i,k)===boneIndex)weight+=weights.getComponent(i,k);if(weight>.6){const point=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(transform);box.expandByPoint(point);points.push({i,point});}}
  const span=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),paint={skin:new THREE.Color(config.skin),ink:new THREE.Color(config.ink),nose:new THREE.Color(config.nose)},counts={skin:0,eyes:0,nose:0,mouth:0};
  for(const{i,point}of points){const p=point.toArray(),lo=box.min.toArray(),hi=box.max.toArray(),u=(p[config.across]-center.getComponent(config.across))/(span.getComponent(config.across)/2),v=(p[config.up]-lo[config.up])/span.getComponent(config.up),front=config.frontSign<0?(hi[config.front]-p[config.front])/span.getComponent(config.front):(p[config.front]-lo[config.front])/span.getComponent(config.front);if(front<.65)continue;
    let kind=null,tone=null;if(Math.abs(u)<.84&&v>.18&&v<.86){kind='skin';tone=paint.skin;}
    if(((Math.abs(u)-.36)/.20)**2+((v-.62)/.07)**2<1){kind='eyes';tone=paint.ink;}
    if(Math.abs(u)<.11&&v>.40&&v<.55){kind='nose';tone=paint.nose;}
    if(Math.abs(u)<.38&&v>.26&&v<.32){kind='mouth';tone=paint.ink;}
    if(tone){color.setXYZ(i,tone.r,tone.g,tone.b);counts[kind]++;}
  }color.needsUpdate=true;return{bone:config.bone,coordinates:'head bind-local',counts,frontSign:config.frontSign};
}

// One calibration authority for the compatibility player and workbench solver.
export function buildRetargetMapping(m,bones,rests,profile=CHARACTER_PROFILES.herta){
  if(!m?.rotations)return [];
  const used=new Set(),mapping=[];
  for(let i=m.meta.names.length-1;i>=0;i--){
    const targetName=profile.mapping[m.meta.names[i]],bone=bones.get(safeName(targetName));if(!bone||used.has(bone))continue;used.add(bone);
    const rest=rests.get(bone.name),nextName=profile.next[targetName],child=nextName?bones.get(safeName(nextName)):bone.children.find(x=>x.isBone);
    const targetDirection=child&&targetName!==profile.mapping.Head?rests.get(child.name).worldP.clone().sub(rest.worldP):new THREE.Vector3(...(targetName===profile.mapping.Head?(profile.headAimAxis||[0,1,0]):[0,1,0])).applyQuaternion(rest.worldQ);
    const sourceDirection=new THREE.Vector3(...m.meta.restDirections[i]).normalize();
    const corrected=Q().setFromUnitVectors(targetDirection.normalize(),sourceDirection).multiply(rest.worldQ.clone());
    const offset=new THREE.Quaternion(...m.meta.restWorldQuaternions[i]).invert().multiply(corrected);
    mapping.push({source:i,bone,offset});
  }
  const depth=x=>{let d=0;while(x.parent){d++;x=x.parent;}return d;};
  return mapping.sort((a,b)=>depth(a.bone)-depth(b.bone));
}

export class MotionRenderer{
  constructor(canvas,{onChange=()=>{},onError=()=>{}}={}){
    Object.assign(this,{canvas,onChange,onError,motion:null,modelReady:false,model:true,skeleton:false,trail:true,follow:true,yaw:0.3,pitch:0.10,zoom:1,lastTime:0,loadGeneration:0});
    this.webgl=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
    this.webgl.setPixelRatio(Math.min(devicePixelRatio||1,1.75));this.webgl.setClearColor(0,0);
    this.webgl.outputColorSpace=THREE.SRGBColorSpace;this.webgl.toneMapping=THREE.NoToneMapping;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(38,1,0.03,300);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xb2a69d,1.0));
    const key=new THREE.DirectionalLight(0xffffff,1.5);key.position.set(-2,5,4);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xc7d6ff,0.35);fill.position.set(3,2,-3);this.scene.add(fill);
    this.floor=new THREE.Group();this.scene.add(this.floor);
    const disk=new THREE.Mesh(new THREE.CircleGeometry(1.2,96),new THREE.MeshBasicMaterial({color:0xf2ede4,transparent:true,opacity:0.66,depthWrite:false}));disk.rotation.x=-Math.PI/2;disk.position.y=-0.012;this.floor.add(disk);
    for(const radius of [1.1,1.16]){const ring=new THREE.Mesh(new THREE.RingGeometry(radius,radius+0.004,96),new THREE.MeshBasicMaterial({color:0xb59b6c,transparent:true,opacity:0.48,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-0.008;this.floor.add(ring);}
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const ctx=shadowCanvas.getContext('2d'),g=ctx.createRadialGradient(64,64,4,64,64,64);g.addColorStop(0,'rgba(54,46,43,.26)');g.addColorStop(1,'rgba(54,46,43,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.25,0.75),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-0.006;this.floor.add(shadow);
    this.characterProfile=CHARACTER_PROFILES[DEFAULT_CHARACTER];this.hipName=this.characterProfile.hip;this.bindInput();this.resizeObserver=new ResizeObserver(()=>onChange());this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onError(new Error('图形上下文已丢失，请刷新页面恢复。'));});
    this.loadModel();
  }
  getOfflineAssets(){return [this.characterProfile.asset,...ASSETS.slice(1)];}
  async setCharacter(key){const profile=CHARACTER_PROFILES[key];if(!profile?.asset)throw new Error('该预览模型尚未准备完成。');if(profile===this.characterProfile&&this.modelReady)return true;this.clearPreviewResources();this.characterProfile=profile;this.hipName=profile.hip;await this.loadModel();return this.modelReady&&this.characterProfile===profile;}
  async loadModel(){
    if(this.loading)return this.loading;
    const generation=++this.loadGeneration;this.modelController=new AbortController();this.modelReady=false;
    this.loading=(async()=>{
      const url=new URL(this.characterProfile.asset,import.meta.url),response=await fetch(url,{signal:this.modelController.signal,credentials:'same-origin'});
      if(!response.ok)throw new Error(`${this.characterProfile.label}读取失败（HTTP ${response.status}）。`);
      const buffer=await response.arrayBuffer();if(buffer.byteLength>64*1024*1024)throw new Error('角色数据超过加载限制。');
      const asset=await new GLTFLoader().parseAsync(buffer,url.href.slice(0,url.href.lastIndexOf('/')+1));
      if(generation!==this.loadGeneration){disposeObject(asset.scene);return;}
      this.character=asset.scene;this.bones=new Map();this.rests=new Map();
      this.character.updateMatrixWorld(true);
      this.character.traverse(o=>{
        if(o.isBone){this.bones.set(o.name,o);const q=Q(),p=V();o.getWorldQuaternion(q);o.getWorldPosition(p);this.rests.set(o.name,{worldQ:q,worldP:p,localQ:o.quaternion.clone(),localP:o.position.clone()});}
        if(o.isMesh){o.frustumCulled=false;const bodyColors=applyBodyColors(o,this.characterProfile);const convert=m=>{if(!m)return m;const next=this.characterProfile.material==='standard'?new THREE.MeshStandardMaterial({color:bodyColors?0xffffff:0xd8dce2,vertexColors:!!bodyColors,roughness:.65,metalness:.08}):new THREE.MeshToonMaterial({color:0xffffff,map:m.map,side:THREE.DoubleSide,transparent:m.transparent,opacity:m.opacity,alphaTest:m.transparent?0.3:0,depthWrite:!m.transparent});if(bodyColors)next.userData.bodyColorProfile=this.characterProfile.key;m.dispose();return next;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}
      });
      if(!this.bones.has(this.hipName))throw new Error('角色缺少真实髋骨绑定。');
      this.scene.add(this.character);this.character.updateMatrixWorld(true);
      this.helper=new THREE.SkeletonHelper(this.character);this.helper.visible=this.skeleton;this.scene.add(this.helper);
      this.modelReady=true;this.modelStats={bones:this.bones.size,meshes:0,vertices:0};this.character.traverse(o=>{if(o.isMesh){this.modelStats.meshes++;this.modelStats.vertices+=o.geometry.attributes.position.count;}});
      if(this.motion)this.configureRetarget();this.onChange();
    })().catch(error=>{if(error.name!=='AbortError'&&generation===this.loadGeneration)this.onError(error);}).finally(()=>{if(generation===this.loadGeneration)this.loading=null;});
    return this.loading;
  }
  clearPreviewResources(){
    this.loadGeneration++;this.modelController?.abort();this.loading=null;this.modelReady=false;this.motion=null;this.mapping=[];
    if(this.character){this.scene.remove(this.character);disposeObject(this.character);this.character=null;}
    if(this.helper){this.scene.remove(this.helper);this.helper.geometry.dispose();this.helper.material.dispose();this.helper=null;}
    if(this.trailLine){this.scene.remove(this.trailLine);disposeObject(this.trailLine);this.trailLine=null;}
    this.bones=new Map();this.rests=new Map();this.pose=null;this.modelStats=null;this.worldCenter=null;this.worldRadius=null;this.heightRatio=null;this.hipIndex=-1;this.modelController=null;
    this.webgl.renderLists.dispose();this.onChange();
  }
  setMotion(motion){
    this.motion=motion;this.mapping=[];
    if(this.bones)for(const [name,b] of this.bones){const r=this.rests.get(name);b.quaternion.copy(r.localQ);b.position.copy(r.localP);}
    if(this.trailLine){this.scene.remove(this.trailLine);disposeObject(this.trailLine);this.trailLine=null;}
    if(motion){this.pose=new Float32Array(motion.meta.jointCount*3);if(this.modelReady)this.configureRetarget();else this.loadModel();}
    this.onChange();
  }
  configureRetarget(){
    const m=this.motion;if(!m?.rotations){this.mapping=[];return;}
    this.mapping=buildRetargetMapping(m,this.bones,this.rests,this.characterProfile);
    this.hipIndex=m.meta.names.indexOf('Hips');this.heightRatio=this.rests.get(this.hipName).worldP.y/(m.meta.restPositions[this.hipIndex]?.[1]||1);
    const hip=m.meta.names.indexOf('Hips'),points=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let frame=0;frame<m.meta.frameCount;frame++){const o=(frame*m.meta.jointCount+hip)*3;points.push(new THREE.Vector3(m.positions[o]*this.heightRatio,0.002,m.positions[o+2]*this.heightRatio));minX=Math.min(minX,m.positions[o]);maxX=Math.max(maxX,m.positions[o]);minY=Math.min(minY,m.positions[o+1]);maxY=Math.max(maxY,m.positions[o+1]);minZ=Math.min(minZ,m.positions[o+2]);maxZ=Math.max(maxZ,m.positions[o+2]);}
    this.worldCenter=new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2-0.05,(minZ+maxZ)/2).multiplyScalar(this.heightRatio);this.worldRadius=Math.max(1.3,Math.hypot(maxX-minX,maxY-minY,maxZ-minZ)*this.heightRatio/2+1.3);
    this.trailLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xab8751,transparent:true,opacity:0.55}));this.trailLine.visible=this.trail;this.scene.add(this.trailLine);
  }
  setOptions(options){for(const key of ['model','skeleton','trail','follow'])if(key in options)this[key]=!!options[key];this.onChange();}
  resetCamera(){this.yaw=0.3;this.pitch=0.1;this.zoom=1;this.onChange();}
  bindInput(){
    const pointers=new Map();let previousDistance=0;
    this.canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,[e.clientX,e.clientY]);this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===1){this.yaw-=(e.clientX-old[0])*0.008;this.pitch=Math.max(-0.65,Math.min(0.75,this.pitch+(e.clientY-old[1])*0.006));}else{const a=[...pointers.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(previousDistance)this.zoom=Math.max(.5,Math.min(2.5,this.zoom*previousDistance/d));previousDistance=d;}this.onChange();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,e=>{pointers.delete(e.pointerId);previousDistance=0;});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.5,Math.min(2.5,this.zoom*Math.exp(e.deltaY*.001)));this.onChange();},{passive:false});
    this.canvas.addEventListener('keydown',e=>{
      if(e.altKey||e.ctrlKey||e.metaKey)return;
      if(e.key==='ArrowLeft')this.yaw-=.12;
      else if(e.key==='ArrowRight')this.yaw+=.12;
      else if(e.key==='ArrowUp')this.pitch=Math.min(.75,this.pitch+.08);
      else if(e.key==='ArrowDown')this.pitch=Math.max(-.65,this.pitch-.08);
      else if(e.key==='+'||e.key==='='||e.code==='NumpadAdd')this.zoom=Math.max(.5,this.zoom/1.1);
      else if(e.key==='-'||e.key==='_'||e.code==='NumpadSubtract')this.zoom=Math.min(2.5,this.zoom*1.1);
      else if(e.key.toLowerCase()==='r'){e.preventDefault();this.resetCamera();return;}
      else return;
      e.preventDefault();this.onChange();
    });
    this.canvas.style.touchAction='none';
  }
  draw(seconds){
    this.lastTime=seconds;const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
    if(this.width!==width||this.height!==height){this.width=width;this.height=height;this.webgl.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
    let sampled={frame:0};let center=new THREE.Vector3(0,0.9,0);
    if(this.motion){sampled=sampleMotion(this.motion,seconds,this.pose);
      if(this.modelReady&&this.mapping?.length){
        const {frame,next,alpha}=sampled,m=this.motion,n=m.meta.jointCount;
        for(const entry of this.mapping){const a=(frame*n+entry.source)*4,b=(next*n+entry.source)*4,q=new THREE.Quaternion().fromArray(m.rotations,a).slerp(new THREE.Quaternion().fromArray(m.rotations,b),alpha).multiply(entry.offset);entry.bone.parent?.updateWorldMatrix(true,false);const parentQ=entry.bone.parent?entry.bone.parent.getWorldQuaternion(Q()):Q();entry.bone.quaternion.copy(parentQ.invert().multiply(q));}
        const hip=this.bones.get(this.hipName),rest=this.rests.get(this.hipName),p=this.hipIndex*3;
        const world=rest.worldP.clone().add(new THREE.Vector3(this.pose[p],this.pose[p+1]-m.meta.restPositions[this.hipIndex][1],this.pose[p+2]).multiplyScalar(this.heightRatio));
        hip.parent.updateWorldMatrix(true,false);hip.position.copy(hip.parent.worldToLocal(world));this.character.updateMatrixWorld(true);
        center=world.clone();center.y-=0.08;
        this.floor.position.x=world.x;this.floor.position.z=world.z;
      }
    }
    if(!this.follow&&this.worldCenter)center=this.worldCenter.clone();
    const radius=!this.follow?(this.worldRadius||1.3):1.12;
    const fov=this.camera.fov*Math.PI/180,distance=Math.max(radius/Math.tan(fov/2),radius/(Math.tan(fov/2)*this.camera.aspect))*this.zoom;
    const horizontal=distance*Math.cos(this.pitch);this.camera.position.set(center.x+Math.sin(this.yaw)*horizontal,center.y+distance*Math.sin(this.pitch),center.z+Math.cos(this.yaw)*horizontal);this.camera.lookAt(center);
    if(this.character)this.character.visible=this.model&&(!this.motion||!!this.motion.rotations);
    if(this.helper)this.helper.visible=this.skeleton&&!!this.motion?.rotations;
    if(this.trailLine)this.trailLine.visible=this.trail;
    this.webgl.render(this.scene,this.camera);return sampled;
  }
}
