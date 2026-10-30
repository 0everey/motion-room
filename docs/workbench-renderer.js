import * as THREE from './vendor/three/three.module.min.js';
import {clone as cloneSkeleton} from './vendor/three/SkeletonUtils.js';
import {MotionRenderer,buildRetargetMapping,disposeSkeletons} from './renderer.js';
import {sampleMotion} from './mvp.js';
import {CHARACTER_PROFILES} from './character.js';
import {sampleNativeRoot} from './native-root.js';

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
  constructor(template,profile=CHARACTER_PROFILES.herta){this.characterProfile=profile;this.hipName=profile.hip;this.root=cloneSkeleton(template);this.root.visible=true;Object.assign(this,inspect(this.root));this.calibrations=new WeakMap();this.samples=0;}
  reset(){for(const bone of this.list){const r=this.rests.get(bone.name);bone.quaternion.copy(r.localQ);bone.position.copy(r.localP);}this.root.position.set(0,0,0);this.root.quaternion.identity();this.root.updateMatrixWorld(true);}
  sample(motion,time,rootMode,animatorRoot=null){
    this.reset();let c=this.calibrations.get(motion);
    if(!c){const hip=motion.meta.names.indexOf('Hips');if(hip<0)throw new Error('真实输入缺少 Hips。');c={mapping:buildRetargetMapping(motion,this.bones,this.rests,this.characterProfile),hip,ratio:this.rests.get(this.hipName).worldP.y/motion.meta.restPositions[hip][1],positions:new Float32Array(motion.meta.jointCount*3)};if(!Number.isFinite(c.ratio)||c.ratio<=0)throw new Error('目标与源的真实尺度无法校准。');this.calibrations.set(motion,c);}
    const {frame,next,alpha}=sampleMotion(motion,time,c.positions),n=motion.meta.jointCount;
    for(const e of c.mapping){const a=(frame*n+e.source)*4,b=(next*n+e.source)*4,world=q().fromArray(motion.rotations,a).slerp(q().fromArray(motion.rotations,b),alpha).multiply(e.offset);e.bone.parent?.updateWorldMatrix(true,false);const parent=e.bone.parent?e.bone.parent.getWorldQuaternion(q()):q();e.bone.quaternion.copy(parent.invert().multiply(world));}
    const hip=this.bones.get(this.hipName),rest=this.rests.get(this.hipName),o=c.hip*3;
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
    }else if(rootMode==='animator'){
      if(!animatorRoot)throw new Error('当前 Native 缺少实际 Animator 根轨迹。');
      const actual=sampleNativeRoot(animatorRoot,time);rootP=actual.position.map(x=>x*c.ratio);rootQ=actual.rotation;
    }
    const applied=motion.meta.kind==='native'&&rootMode==='animator';
    const pose={positions:this.list.map(b=>b.position.toArray()),rotations:this.list.map(b=>b.quaternion.toArray()),rootP:rootMode!=='in-place'?rootP:[0,0,0],rootQ,residualP,residualQ,frame,time,kind:motion.meta.kind,mapped:c.mapping.length,rootScale:c.ratio,animatorRootApplied:applied,rootSampleTime:time,animatorRootContributions:applied?[{clipId:motion.meta.id,variant:'native',sha256:animatorRoot.sha256,time,sourceToTargetScale:c.ratio,weight:1}]:[]};
    this.samples++;return pose;
  }
  blend(a,b,weight){
    if(weight===0)return a;if(weight===1)return b;
    if(a.rotations.length!==b.rotations.length)throw new Error('混合目标骨架身份不一致。');
    const contributions=[...(a.animatorRootContributions||[]).map(c=>({...c,weight:c.weight*(1-weight)})),...(b.animatorRootContributions||[]).map(c=>({...c,weight:c.weight*weight}))].filter(c=>c.weight>0);
    return {positions:a.positions.map((p,i)=>lerp(p,b.positions[i],weight)),rotations:a.rotations.map((r,i)=>slerp(r,b.rotations[i],weight)),rootP:lerp(a.rootP,b.rootP,weight),rootQ:slerp(a.rootQ,b.rootQ,weight),residualP:lerp(a.residualP,b.residualP,weight),residualQ:slerp(a.residualQ,b.residualQ,weight),kind:'blend',mapped:Math.min(a.mapped,b.mapped),frame:a.frame,time:a.time,animatorRootApplied:contributions.length>0,animatorRootContributions:contributions};
  }
}

export class WorkbenchRenderer extends MotionRenderer{
  constructor(canvas,options={}){super(canvas,options);this.webgl.info.autoReset=false;this.actorRigs=new Map();this.worldGrid=new THREE.GridHelper(24,24,0xb29a70,0xc7c4c1);this.worldGrid.position.y=-.015;this.worldGrid.material.transparent=true;this.worldGrid.material.opacity=.25;this.scene.add(this.worldGrid);this.follow=false;this.lastResult=[];this.clipFrames=new WeakMap();}
  prepare(){
    if(!this.modelReady||!this.character)return false;
    if(this.template!==this.character){this.dropActors();this.template=this.character;this.solver=new TargetPoseSolver(this.character,this.characterProfile);this.influenceBounds=new Map();
      // Bound every actual skin vertex in each influencing bone's bind space.
      // The union transformed by the current bones contains linear-blended skin,
      // without reskinning all vertices every frame or guessing a hip padding.
      this.character.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const key=mesh.name+'|'+mesh.geometry.uuid,positions=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,boxes=mesh.skeleton.bones.map(()=>new THREE.Box3());
        for(let i=0;i<positions.count;i++){const point=v().fromBufferAttribute(positions,i).applyMatrix4(mesh.bindMatrix);for(let k=0;k<4;k++){const index=indices.getComponent(i,k),weight=weights.getComponent(i,k);if(weight>0)boxes[index].expandByPoint(point.clone().applyMatrix4(mesh.skeleton.boneInverses[index]));}}
        this.influenceBounds.set(key,boxes);
      });
      // Any weighted vertex stays within this hip-relative reach under joint rotation.
      // The bind-space radius plus the lengths of the real parent chain bounds LBS.
      this.reachRadius=0;const hipName=this.hipName||'Hips';
      this.character.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const boxes=this.influenceBounds.get(mesh.name+'|'+mesh.geometry.uuid);boxes.forEach((box,i)=>{if(box.isEmpty())return;let radius=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])radius=Math.max(radius,Math.hypot(x,y,z));let bone=mesh.skeleton.bones[i];const boneScale=bone.getWorldScale(v());radius*=Math.max(Math.abs(boneScale.x),Math.abs(boneScale.y),Math.abs(boneScale.z));while(bone&&bone.name!==hipName){const scale=bone.parent?.getWorldScale(v())||v().set(1,1,1);radius+=bone.position.length()*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z));bone=bone.parent?.isBone?bone.parent:null;}this.reachRadius=Math.max(this.reachRadius,radius);});});
      this.boundsKey=null;
    }
    this.character.visible=false;if(this.helper)this.helper.visible=false;return true;
  }
  removeActor(rig){rig.group.removeFromParent();rig.helper.removeFromParent();rig.scene?.clear();rig.ownedMaterials?.forEach(m=>m.dispose());rig.helper.geometry.dispose();rig.helper.material.dispose();disposeSkeletons(rig.root);}
  dropActors(){if(!this.actorRigs)return;for(const rig of this.actorRigs.values())this.removeActor(rig);this.actorRigs.clear();disposeSkeletons(this.solver?.root);this.solver=null;this.template=null;this.lastResult=[];this.influenceBounds?.clear();this.actorBounds?.clear();this.labelPositions=[];this.boundsKey=null;this.clipFrames=new WeakMap();}
  clearPreviewResources(){this.dropActors();super.clearPreviewResources();}
  makeActor(id){
    const group=new THREE.Group(),motionRoot=new THREE.Group(),poseRoot=new THREE.Group(),root=cloneSkeleton(this.character);root.visible=true;group.add(motionRoot);motionRoot.add(poseRoot);poseRoot.add(root);
    const data=inspect(root),helper=new THREE.SkeletonHelper(root),scene=new THREE.Scene(),ownedMaterials=[];
    for(const light of this.scene.children.filter(x=>x.isLight))scene.add(light.clone());
    const grid=this.worldGrid.clone();scene.add(grid);scene.add(group);scene.add(helper);
    root.traverse(mesh=>{if(!mesh.isMesh)return;const copy=m=>{const next=m.clone();ownedMaterials.push(next);return next;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);});
    const rig={id,group,motionRoot,poseRoot,root,helper,scene,grid,ownedMaterials,bounds:new THREE.Box3(),...data};this.actorRigs.set(id,rig);return rig;
  }
  skinBounds(rig){
    const box=rig.bounds.makeEmpty(),scratch=this.boundScratch||(this.boundScratch=new THREE.Box3()),post=this.boundPost||(this.boundPost=new THREE.Matrix4()),matrix=this.boundMatrix||(this.boundMatrix=new THREE.Matrix4());rig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const boxes=this.influenceBounds.get(mesh.name+'|'+mesh.geometry.uuid);post.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
      boxes.forEach((part,i)=>{if(!part.isEmpty())box.union(scratch.copy(part).applyMatrix4(matrix.multiplyMatrices(post,mesh.skeleton.bones[i].matrixWorld)));});
    });return box;
  }
  fixedClipFrame(session,node){
    const motion=session.motions.get(session.key(node)),root=session.recipe.rootMode==='animator'&&node.variant==='native'?session.roots.get(session.rootKey(node)):null;
    let variants=this.clipFrames.get(motion);if(!variants){variants=new Map();this.clipFrames.set(motion,variants);}
    const key=this.characterProfile.key+':'+session.recipe.rootMode+':'+(root?.sha256||'');let record=variants.get(key);
    if(!record){let maxAngle=0,n=motion.meta.jointCount;for(let f=1;f<motion.meta.frameCount;f++)for(let j=0;j<n;j++){const a=((f-1)*n+j)*4,b=(f*n+j)*4;let dot=0;for(let k=0;k<4;k++)dot+=motion.rotations[a+k]*motion.rotations[b+k];maxAngle=Math.max(maxAngle,2*Math.acos(Math.min(1,Math.abs(dot))));}
      record={motion,root,mode:session.recipe.rootMode,index:0,total:Math.max(1,motion.meta.frameCount*2-1),box:new THREE.Box3(),padding:.025+this.reachRadius*(1-Math.cos(maxAngle/4)),ready:false};variants.set(key,record);
    }return record;
  }
  prepareFixedFrames(session){
    if(this.follow){this.framingReady=true;return true;}
    const clips=[...session.nodes.values()].filter(n=>n.type==='clip'),records=clips.map(n=>this.fixedClipFrame(session,n)),start=performance.now();
    const raw={root:this.solver.root,bounds:new THREE.Box3()},position=v(),rotation=q(),scale=v().set(1,1,1),outer=new THREE.Matrix4(),inner=new THREE.Matrix4();
    for(const record of records){while(!record.ready&&performance.now()-start<7){const f=record.index/2,t=record.motion.times[Math.floor(f)]+(record.index%2?(record.motion.times[Math.min(record.motion.meta.frameCount-1,Math.ceil(f))]-record.motion.times[Math.floor(f)])/2:0),pose=this.solver.sample(record.motion,t,record.mode,record.root);
      outer.compose(position.fromArray(pose.rootP),rotation.fromArray(pose.rootQ),scale);inner.compose(position.fromArray(pose.residualP),rotation.fromArray(pose.residualQ),scale);outer.multiply(inner);
      record.box.union(this.skinBounds(raw).clone().applyMatrix4(outer));record.index++;if(record.index>=record.total){record.box.expandByScalar(record.padding);record.ready=true;}
    }}
    this.framingReady=records.every(r=>r.ready);if(!this.framingReady)this.onChange();return this.framingReady;
  }
  drawSession(session,time){
    this.lastTime=time;this.webgl.info.reset();
    if(!this.prepare()){super.draw(0);return [];}
    if(session.phase!=='ready'){this.webgl.setScissorTest(false);this.webgl.clear();this.boundsKey=null;return [];}
    if(!this.prepareFixedFrames(session)){this.webgl.setScissorTest(false);this.webgl.clear();this.lastResult=[];return [];}
    const computed=session.evaluate(time,this.solver),result=this.focusActor?computed.filter(r=>r.actor.id===this.focusActor):computed,ids=new Set(result.map(r=>r.actor.id));
    for(const [id,rig] of this.actorRigs)if(!ids.has(id)){this.removeActor(rig);this.actorRigs.delete(id);}
    if(!result.length){this.webgl.setScissorTest(false);this.webgl.setViewport(0,0,this.width||1,this.height||1);this.webgl.clear();this.labelPositions=[];this.lastResult=[];this.boundsKey=null;return [];}
    let centerX=0,centerZ=0;
    for(const [index,{actor,pose}] of result.entries()){
      const rig=this.actorRigs.get(actor.id)||this.makeActor(actor.id);rig.group.position.set(session.recipe.layout==='world'?(index-(result.length-1)/2)*2.15:0,0,0);
      const destination=session.recipe.layout==='world'?this.scene:rig.scene;if(rig.group.parent!==destination){destination.add(rig.group);destination.add(rig.helper);}
      rig.grid.visible=this.trail;
      const tint=actor.color||(actor.node==='A'?'#43bdd7':actor.node==='B'?'#ed8979':actor.node==='Mix'?'#dfbd67':'#c1b7d5');if(rig.tint!==tint){rig.tint=tint;for(const material of rig.ownedMaterials)if(!material.userData.bodyColorProfile)material.color.set('#ffffff').lerp(new THREE.Color(tint),.14);}
      rig.motionRoot.position.fromArray(pose.rootP);rig.motionRoot.quaternion.fromArray(pose.rootQ);rig.poseRoot.position.fromArray(pose.residualP);rig.poseRoot.quaternion.fromArray(pose.residualQ);
      for(let i=0;i<rig.list.length;i++){rig.list[i].position.fromArray(pose.positions[i]);rig.list[i].quaternion.fromArray(pose.rotations[i]);}
      rig.root.visible=this.model;rig.helper.visible=this.skeleton;rig.group.updateMatrixWorld(true);
      const hip=rig.bones.get(this.hipName).getWorldPosition(v());centerX+=hip.x;centerZ+=hip.z;
    }
    this.floor.position.set(0,0,0);this.floor.visible=false;this.worldGrid.visible=this.trail;
    const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
    if(this.width!==width||this.height!==height){this.width=width;this.height=height;this.webgl.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
    const count=Math.max(1,session.recipe.wallCount||result.length),boundsKey=session.generation+':ready:'+result.map(x=>x.actor.id+':'+x.actor.node).join(',')+':'+session.recipe.rootMode+':'+session.recipe.layout;
    if(this.boundsKey!==boundsKey){
      this.actorBounds=new Map();const nodes=session.nodes;
      for(const {actor} of result){
        const leaves=new Set(),seen=new Set();const visit=id=>{if(seen.has(id))return;seen.add(id);const n=nodes.get(id);if(n.type==='clip')leaves.add(n);else if(n.type==='blend'){visit(n.a);visit(n.b);}else if(n.type==='sequence')n.inputs.forEach(visit);else visit(n.input);};visit(actor.node);
        const box=new THREE.Box3();
        for(const n of leaves){const m=session.motions.get(session.key(n)),hi=m.meta.names.indexOf('Hips'),ratio=this.rests.get(this.hipName).worldP.y/m.meta.restPositions[hi][1],first=hi*3;
          for(let f=0;f<m.meta.frameCount;f++){const o=(f*m.meta.jointCount+hi)*3,raw=v().set(m.positions[o],m.positions[o+1]-m.meta.restPositions[hi][1],m.positions[o+2]).multiplyScalar(ratio).add(this.rests.get(this.hipName).worldP);if(session.recipe.rootMode==='in-place'&&m.meta.kind!=='native'){raw.x-=(m.positions[o]-m.positions[first])*ratio;raw.z-=(m.positions[o+2]-m.positions[first+2])*ratio;}if(session.recipe.rootMode==='animator'&&m.meta.kind==='native'){const actual=sampleNativeRoot(session.roots.get(session.rootKey(n)),m.times[f]);raw.applyQuaternion(q().fromArray(actual.rotation)).add(v().fromArray(actual.position).multiplyScalar(ratio));}box.expandByPoint(raw);}
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
      const columns=session.recipe.wallColumns||Math.min(3,count),rows=Math.ceil(count/columns);this.webgl.setScissorTest(true);
      const bodies=new Map(),commonBody=new THREE.Box3();for(const {actor} of result){const rig=this.actorRigs.get(actor.id),body=this.skinBounds(rig),hip=rig.bones.get(this.hipName).getWorldPosition(v());bodies.set(actor.id,body);commonBody.union(body.clone().translate(hip.negate()));}
      for(const [i,{actor}] of result.entries()){
        const slot=actor.slot??i,col=slot%columns,row=Math.floor(slot/columns),x=Math.floor(col*width/columns),bottom=session.recipe.wallCount?35:8,y=Math.floor((rows-row-1)*height/rows)+bottom,w=Math.floor(width/columns),h=Math.max(1,Math.floor(height/rows)-bottom-22),rig=this.actorRigs.get(actor.id);rig.root.visible=this.model;rig.helper.visible=this.skeleton;
        const body=bodies.get(actor.id),hip=rig.bones.get(this.hipName||'Hips').getWorldPosition(v()),range=this.actorBounds.get(actor.id),leaf=session.nodes.get(actor.node),fixed=leaf?.type==='clip'?this.fixedClipFrame(session,leaf).box:null,box=this.follow?(session.recipe.wallCount?body.clone():commonBody.clone().translate(hip)):(fixed?fixed.clone():range.clone().expandByScalar(this.reachRadius));
        box.expandByScalar(.08);
        fit(box,w/h);this.webgl.setViewport(x,y,w,h);this.webgl.setScissor(x,y,w,h);this.webgl.render(rig.scene,this.camera);this.labelPositions.push({id:actor.id,x:(col+.5)/columns,y:(row+1)/rows});
      }
      this.webgl.setScissorTest(false);this.webgl.setViewport(0,0,width,height);
    }else{
      const box=new THREE.Box3();for(const {actor} of result){const rig=this.actorRigs.get(actor.id),body=this.skinBounds(rig),hip=rig.bones.get(this.hipName).getWorldPosition(v()),range=this.actorBounds.get(actor.id),part=range.clone().expandByScalar(this.reachRadius).translate(rig.group.position);box.union(part);rig.root.visible=this.model;rig.helper.visible=this.skeleton;}box.expandByScalar(.08);
      if(this.follow)box.setFromCenterAndSize(v().set(centerX/count,.9,centerZ/count),box.getSize(v()));fit(box,width/height);this.webgl.render(this.scene,this.camera);
      for(const {actor} of result){const p=this.actorRigs.get(actor.id).bones.get(this.hipName).getWorldPosition(v());p.y-=this.rests.get(this.hipName).worldP.y;p.project(this.camera);this.labelPositions.push({id:actor.id,x:(p.x+1)/2,y:(1-p.y)/2});}
    }
    this.lastResult=result;return result;
  }
  diagnostics(){
    return {modelReady:this.modelReady,framingReady:this.framingReady,character:this.characterProfile.key,characterLabel:this.characterProfile.label,bodyColors:this.characterProfile.bodyColors||null,hipBone:this.hipName,camera:{policy:this.follow?'follow':'fixed-full-motion',position:this.camera.position.toArray(),viewMatrix:this.camera.matrixWorldInverse.toArray(),projectionMatrix:this.camera.projectionMatrix.toArray(),yaw:this.yaw,pitch:this.pitch,zoom:this.zoom},reachRadius:this.reachRadius,time:this.lastTime,renderCalls:this.webgl.info.render.calls,triangles:this.webgl.info.render.triangles,actors:[...this.actorRigs.values()].map(r=>{const pose=this.lastResult.find(x=>x.actor.id===r.id)?.pose;return {id:r.id,bones:r.list.length,skeletonUuid:[...new Set(r.list.map(b=>b.uuid))].length,hip:r.bones.get(this.hipName)?.getWorldPosition(v()).toArray(),poseFingerprint:pose?fingerprint(pose):null,rootP:pose?.rootP,rootQ:pose?.rootQ,rootScale:pose?.rootScale,rootSampleTime:pose?.rootSampleTime,animatorRootApplied:pose?.animatorRootApplied||false,animatorRootContributions:pose?.animatorRootContributions||[],residualP:pose?.residualP};}),skeletonsIndependent:[...this.actorRigs.values()].every((a,i,all)=>all.every((b,j)=>i===j||a.bones.get(this.hipName)!==b.bones.get(this.hipName))),floorWorld:this.floor.position.toArray(),sharedAssetOwner:'base-model',poseSamples:this.solver?.samples||0};
  }
}
