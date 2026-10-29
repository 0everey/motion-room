import * as THREE from './vendor/three/three.module.min.js';
import {clone as cloneSkeleton} from './vendor/three/SkeletonUtils.js';
import {MotionRenderer,buildRetargetMapping,disposeSkeletons} from './renderer.js';
import {sampleMotion} from './mvp.js';

const q=()=>new THREE.Quaternion(),v=()=>new THREE.Vector3();
const Y=new THREE.Vector3(0,1,0);
function inspect(root){
  root.updateMatrixWorld(true);const bones=new Map(),rests=new Map(),list=[];
  root.traverse(b=>{if(b.isBone){bones.set(b.name,b);list.push(b);rests.set(b.name,{localQ:b.quaternion.clone(),localP:b.position.clone(),worldQ:b.getWorldQuaternion(q()),worldP:b.getWorldPosition(v())});}});
  return {bones,rests,list};
}
function slerp(a,b,t){return q().fromArray(a).slerp(q().fromArray(b),t).toArray();}
function lerp(a,b,t){return a.map((x,i)=>x+(b[i]-x)*t);}
function fingerprint(pose){let hash=2166136261;const view=new DataView(new ArrayBuffer(4));for(const values of [...pose.positions,...pose.rotations,pose.rootP,pose.rootQ,pose.residualP,pose.residualQ])for(const x of values){view.setFloat32(0,x,true);for(let i=0;i<4;i++)hash=Math.imul(hash^view.getUint8(i),16777619);}return (hash>>>0).toString(16).padStart(8,'0');}

export class TargetPoseSolver{
  constructor(template){this.root=cloneSkeleton(template);this.root.visible=true;Object.assign(this,inspect(this.root));this.calibrations=new WeakMap();this.samples=0;}
  reset(){for(const bone of this.list){const r=this.rests.get(bone.name);bone.quaternion.copy(r.localQ);bone.position.copy(r.localP);}this.root.position.set(0,0,0);this.root.quaternion.identity();this.root.updateMatrixWorld(true);}
  sample(motion,time,rootMode){
    this.reset();let c=this.calibrations.get(motion);
    if(!c){const hip=motion.meta.names.indexOf('Hips');if(hip<0)throw new Error('真实输入缺少 Hips。');c={mapping:buildRetargetMapping(motion,this.bones,this.rests),hip,ratio:this.rests.get('Hips').worldP.y/motion.meta.restPositions[hip][1],positions:new Float32Array(motion.meta.jointCount*3)};if(!Number.isFinite(c.ratio)||c.ratio<=0)throw new Error('目标与源的真实尺度无法校准。');this.calibrations.set(motion,c);}
    const {frame,next,alpha}=sampleMotion(motion,time,c.positions),n=motion.meta.jointCount;
    for(const e of c.mapping){const a=(frame*n+e.source)*4,b=(next*n+e.source)*4,world=q().fromArray(motion.rotations,a).slerp(q().fromArray(motion.rotations,b),alpha).multiply(e.offset);e.bone.parent?.updateWorldMatrix(true,false);const parent=e.bone.parent?e.bone.parent.getWorldQuaternion(q()):q();e.bone.quaternion.copy(parent.invert().multiply(world));}
    const hip=this.bones.get('Hips'),rest=this.rests.get('Hips'),o=c.hip*3;
    const world=rest.worldP.clone().add(v().set(c.positions[o],c.positions[o+1]-motion.meta.restPositions[c.hip][1],c.positions[o+2]).multiplyScalar(c.ratio));
    hip.parent.updateWorldMatrix(true,false);hip.position.copy(hip.parent.worldToLocal(world));this.root.updateMatrixWorld(true);
    // The target-local hierarchy includes this explicit residual container.
    // R * inverse(R) * rawPose reconstructs the original exactly, once.
    // Native remains its original root-unapplied pose; no RootT is invented.
    let rootP=[0,0,0],rootQ=[0,0,0,1],residualP=[0,0,0],residualQ=[0,0,0,1];
    if(motion.meta.kind!=='native'){
      const first=c.hip*3;rootP=[(c.positions[o]-motion.positions[first])*c.ratio,0,(c.positions[o+2]-motion.positions[first+2])*c.ratio];
      // Translation-only hip trajectory is the declared preview extraction.
      // Body heading stays in pose; this is not Unity Humanoid Root Transform.
      residualP=rootP.map(x=>-x);
    }
    const pose={positions:this.list.map(b=>b.position.toArray()),rotations:this.list.map(b=>b.quaternion.toArray()),rootP:rootMode==='trajectory'?rootP:[0,0,0],rootQ,residualP,residualQ,frame,time,kind:motion.meta.kind,mapped:c.mapping.length};
    this.samples++;return pose;
  }
  blend(a,b,weight){
    if(weight===0)return a;if(weight===1)return b;
    if(a.rotations.length!==b.rotations.length)throw new Error('混合目标骨架身份不一致。');
    return {positions:a.positions.map((p,i)=>lerp(p,b.positions[i],weight)),rotations:a.rotations.map((r,i)=>slerp(r,b.rotations[i],weight)),rootP:lerp(a.rootP,b.rootP,weight),rootQ:slerp(a.rootQ,b.rootQ,weight),residualP:lerp(a.residualP,b.residualP,weight),residualQ:slerp(a.residualQ,b.residualQ,weight),kind:'blend',mapped:Math.min(a.mapped,b.mapped),frame:a.frame,time:a.time};
  }
}

export class WorkbenchRenderer extends MotionRenderer{
  constructor(canvas,options={}){super(canvas,options);this.actorRigs=new Map();this.worldGrid=new THREE.GridHelper(24,24,0xb29a70,0xc7c4c1);this.worldGrid.position.y=-.015;this.worldGrid.material.transparent=true;this.worldGrid.material.opacity=.25;this.scene.add(this.worldGrid);this.follow=true;this.lastResult=[];}
  prepare(){
    if(!this.modelReady||!this.character)return false;
    if(this.template!==this.character){this.dropActors();this.template=this.character;this.solver=new TargetPoseSolver(this.character);this.influenceBounds=new Map();
      // Bound every actual skin vertex in each influencing bone's bind space.
      // The union transformed by the current bones contains linear-blended skin,
      // without reskinning all vertices every frame or guessing a hip padding.
      this.character.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const key=mesh.name+'|'+mesh.geometry.uuid,positions=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,boxes=mesh.skeleton.bones.map(()=>new THREE.Box3());
        for(let i=0;i<positions.count;i++){const point=v().fromBufferAttribute(positions,i).applyMatrix4(mesh.bindMatrix);for(let k=0;k<4;k++){const index=indices.getComponent(i,k),weight=weights.getComponent(i,k);if(weight>0)boxes[index].expandByPoint(point.clone().applyMatrix4(mesh.skeleton.boneInverses[index]));}}
        this.influenceBounds.set(key,boxes);
      });this.boundsKey=null;}
    this.character.visible=false;if(this.helper)this.helper.visible=false;return true;
  }
  removeActor(rig){this.scene.remove(rig.group);this.scene.remove(rig.helper);rig.helper.geometry.dispose();rig.helper.material.dispose();disposeSkeletons(rig.root);}
  dropActors(){if(!this.actorRigs)return;for(const rig of this.actorRigs.values())this.removeActor(rig);this.actorRigs.clear();disposeSkeletons(this.solver?.root);this.solver=null;this.template=null;this.lastResult=[];this.influenceBounds?.clear();this.actorBounds?.clear();this.labelPositions=[];this.boundsKey=null;}
  clearPreviewResources(){this.dropActors();super.clearPreviewResources();}
  makeActor(id){
    const group=new THREE.Group(),motionRoot=new THREE.Group(),poseRoot=new THREE.Group(),root=cloneSkeleton(this.character);root.visible=true;group.add(motionRoot);motionRoot.add(poseRoot);poseRoot.add(root);
    const data=inspect(root),helper=new THREE.SkeletonHelper(root);this.scene.add(group);this.scene.add(helper);
    const rig={id,group,motionRoot,poseRoot,root,helper,...data};this.actorRigs.set(id,rig);return rig;
  }
  skinBounds(rig){
    const box=new THREE.Box3();rig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const boxes=this.influenceBounds.get(mesh.name+'|'+mesh.geometry.uuid),post=new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
      boxes.forEach((part,i)=>{if(!part.isEmpty())box.union(part.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(post,mesh.skeleton.bones[i].matrixWorld)));});
    });return box;
  }
  drawSession(session,time){
    this.lastTime=time;
    if(!this.prepare()){super.draw(0);return [];}
    if(session.phase!=='ready'){this.webgl.setScissorTest(false);this.webgl.clear();this.boundsKey=null;return [];}
    const computed=session.evaluate(time,this.solver),result=this.focusActor?computed.filter(r=>r.actor.id===this.focusActor):computed,ids=new Set(result.map(r=>r.actor.id));
    for(const [id,rig] of this.actorRigs)if(!ids.has(id)){this.removeActor(rig);this.actorRigs.delete(id);}
    if(!result.length){this.webgl.setScissorTest(false);this.webgl.setViewport(0,0,this.width||1,this.height||1);this.webgl.clear();this.labelPositions=[];this.lastResult=[];this.boundsKey=null;return [];}
    let centerX=0,centerZ=0;
    for(const [index,{actor,pose}] of result.entries()){
      const rig=this.actorRigs.get(actor.id)||this.makeActor(actor.id);rig.group.position.set(session.recipe.layout==='world'?(index-(result.length-1)/2)*2.15:0,0,0);
      rig.motionRoot.position.fromArray(pose.rootP);rig.motionRoot.quaternion.fromArray(pose.rootQ);rig.poseRoot.position.fromArray(pose.residualP);rig.poseRoot.quaternion.fromArray(pose.residualQ);
      for(let i=0;i<rig.list.length;i++){rig.list[i].position.fromArray(pose.positions[i]);rig.list[i].quaternion.fromArray(pose.rotations[i]);}
      rig.root.visible=this.model;rig.helper.visible=this.skeleton;rig.group.updateMatrixWorld(true);
      const hip=rig.bones.get('Hips').getWorldPosition(v());centerX+=hip.x;centerZ+=hip.z;
    }
    this.floor.position.set(0,0,0);this.floor.visible=false;this.worldGrid.visible=this.trail;
    const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
    if(this.width!==width||this.height!==height){this.width=width;this.height=height;this.webgl.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
    const count=Math.max(1,result.length),boundsKey=session.generation+':ready:'+result.map(x=>x.actor.id+':'+x.actor.node).join(',')+':'+session.recipe.rootMode+':'+session.recipe.layout;
    if(this.boundsKey!==boundsKey){
      this.actorBounds=new Map();const nodes=session.nodes;
      for(const {actor} of result){
        const leaves=new Set(),seen=new Set();const visit=id=>{if(seen.has(id))return;seen.add(id);const n=nodes.get(id);if(n.type==='clip')leaves.add(n);else if(n.type==='blend'){visit(n.a);visit(n.b);}else if(n.type==='sequence')n.inputs.forEach(visit);else visit(n.input);};visit(actor.node);
        const box=new THREE.Box3();
        for(const n of leaves){const m=session.motions.get(session.key(n)),hi=m.meta.names.indexOf('Hips'),ratio=this.rests.get('Hips').worldP.y/m.meta.restPositions[hi][1],first=hi*3;
          for(let f=0;f<m.meta.frameCount;f++){const o=(f*m.meta.jointCount+hi)*3,raw=v().set(m.positions[o],m.positions[o+1]-m.meta.restPositions[hi][1],m.positions[o+2]).multiplyScalar(ratio).add(this.rests.get('Hips').worldP);if(session.recipe.rootMode==='in-place'&&m.meta.kind!=='native'){raw.x-=(m.positions[o]-m.positions[first])*ratio;raw.z-=(m.positions[o+2]-m.positions[first+2])*ratio;}box.expandByPoint(raw);}
        }
        this.actorBounds.set(actor.id,box);
      }
      this.boundsKey=boundsKey;
    }
    const fit=(box,aspect)=>{
      const center=box.getCenter(v()),right=v().set(Math.cos(this.yaw),0,-Math.sin(this.yaw)),up=v().set(-Math.sin(this.yaw)*Math.sin(this.pitch),Math.cos(this.pitch),-Math.cos(this.yaw)*Math.sin(this.pitch)),forward=v().set(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
      let distance=1;const tangent=Math.tan(this.camera.fov*Math.PI/360);
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const delta=v().set(x,y,z).sub(center),depth=delta.dot(forward);distance=Math.max(distance,Math.abs(delta.dot(right))/(tangent*aspect)+depth,Math.abs(delta.dot(up))/tangent+depth);}
      this.camera.aspect=aspect;this.camera.updateProjectionMatrix();this.camera.position.copy(center).addScaledVector(forward,distance*1.06*this.zoom);this.camera.lookAt(center);
    };
    this.webgl.setScissorTest(false);this.webgl.setViewport(0,0,width,height);this.webgl.clear();this.labelPositions=[];
    if(session.recipe.layout==='compare'){
      const columns=Math.min(3,count),rows=Math.ceil(count/columns);this.webgl.setScissorTest(true);
      const bodies=new Map(),commonBody=new THREE.Box3();for(const {actor} of result){const rig=this.actorRigs.get(actor.id),body=this.skinBounds(rig),hip=rig.bones.get('Hips').getWorldPosition(v());bodies.set(actor.id,body);commonBody.union(body.clone().translate(hip.negate()));}
      for(const [i,{actor}] of result.entries()){
        for(const [id,rig] of this.actorRigs){rig.root.visible=id===actor.id&&this.model;rig.helper.visible=id===actor.id&&this.skeleton;}
        const col=i%columns,row=Math.floor(i/columns),x=Math.floor(col*width/columns),y=Math.floor((rows-row-1)*height/rows),w=Math.floor(width/columns),h=Math.floor(height/rows),rig=this.actorRigs.get(actor.id);
        const body=bodies.get(actor.id),hip=rig.bones.get('Hips').getWorldPosition(v()),range=this.actorBounds.get(actor.id),box=this.follow?commonBody.clone().translate(hip):new THREE.Box3(range.min.clone().add(body.min.clone().sub(hip)),range.max.clone().add(body.max.clone().sub(hip)));
        box.expandByScalar(.08);
        fit(box,w/h);this.webgl.setViewport(x,y,w,h);this.webgl.setScissor(x,y,w,h);this.webgl.render(this.scene,this.camera);this.labelPositions.push({id:actor.id,x:(col+.5)/columns,y:(row+1)/rows});
      }
      this.webgl.setScissorTest(false);this.webgl.setViewport(0,0,width,height);
    }else{
      const box=new THREE.Box3();for(const {actor} of result){const rig=this.actorRigs.get(actor.id),body=this.skinBounds(rig),hip=rig.bones.get('Hips').getWorldPosition(v()),range=this.actorBounds.get(actor.id),part=new THREE.Box3(range.min.clone().add(body.min.clone().sub(hip)),range.max.clone().add(body.max.clone().sub(hip))).translate(rig.group.position);box.union(part);rig.root.visible=this.model;rig.helper.visible=this.skeleton;}box.expandByScalar(.08);
      if(this.follow)box.setFromCenterAndSize(v().set(centerX/count,.9,centerZ/count),box.getSize(v()));fit(box,width/height);this.webgl.render(this.scene,this.camera);
      for(const {actor} of result){const p=this.actorRigs.get(actor.id).bones.get('Hips').getWorldPosition(v());p.y-=this.rests.get('Hips').worldP.y;p.project(this.camera);this.labelPositions.push({id:actor.id,x:(p.x+1)/2,y:(1-p.y)/2});}
    }
    this.lastResult=result;return result;
  }
  diagnostics(){
    return {modelReady:this.modelReady,time:this.lastTime,actors:[...this.actorRigs.values()].map(r=>{const pose=this.lastResult.find(x=>x.actor.id===r.id)?.pose;return {id:r.id,bones:r.list.length,skeletonUuid:[...new Set(r.list.map(b=>b.uuid))].length,hip:r.bones.get('Hips')?.getWorldPosition(v()).toArray(),poseFingerprint:pose?fingerprint(pose):null,rootP:pose?.rootP,residualP:pose?.residualP};}),skeletonsIndependent:[...this.actorRigs.values()].every((a,i,all)=>all.every((b,j)=>i===j||a.bones.get('Hips')!==b.bones.get('Hips'))),floorWorld:this.floor.position.toArray(),sharedAssetOwner:'base-model',poseSamples:this.solver?.samples||0};
  }
}
