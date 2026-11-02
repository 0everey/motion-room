import * as THREE from './vendor/three/three.module.min.js';
import {RoomEnvironment} from './vendor/three/RoomEnvironment.js';
import {environmentProfile} from './preview-environments.js';

// One renderer owns this movable stage, its reflection target and its one shadow map.
// Per-actor scenes borrow them only for their current scissored render.
export class PreviewStage{
  constructor(renderer,key){
    const started=performance.now();this.renderer=renderer;this.root=new THREE.Group();this.root.name='preview-environment';
    this.floor=new THREE.Group();this.root.add(this.floor);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({roughness:1,metalness:0}));
    this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.025;this.ground.receiveShadow=true;this.floor.add(this.ground);
    this.grid=new THREE.GridHelper(200,200);this.grid.position.y=-.022;this.grid.material.transparent=true;this.grid.material.opacity=.45;this.grid.material.depthWrite=false;this.floor.add(this.grid);
    this.platform=new THREE.Group();this.floor.add(this.platform);
    const disk=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.06,96),new THREE.MeshStandardMaterial({color:'#57525b',roughness:.72,metalness:.18}));disk.position.y=-.052;disk.receiveShadow=true;this.platform.add(disk);
    const ringMaterial=new THREE.MeshStandardMaterial({color:'#c6ab72',roughness:.4,metalness:.5});
    for(const radius of [.94,.985]){const ring=new THREE.Mesh(new THREE.RingGeometry(radius,radius+.004,96),ringMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=-.017;this.platform.add(ring);}
    this.key=new THREE.DirectionalLight();this.key.castShadow=true;this.key.shadow.bias=-.00005;this.key.shadow.normalBias=.005;
    this.fill=new THREE.DirectionalLight();this.hemisphere=new THREE.HemisphereLight();
    this.root.add(this.key,this.key.target,this.fill,this.fill.target,this.hemisphere);
    this.background=new THREE.Color();this.fog=new THREE.Fog(0,10,48);this.shadowBounds=new THREE.Box3();this.size=0;this.binds=0;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);
    try{this.reflectionTarget=generator.fromScene(room,.04,.1,100);}finally{room.dispose();generator.dispose();}
    this.setProfile(key);this.initializationMs=performance.now()-started;
  }
  setProfile(key){
    const profile=environmentProfile(key);if(this.profile===profile)return false;this.profile=profile;
    this.background.set(profile.background);this.fog.color.copy(this.background);this.fog.near=profile.fogNear;this.fog.far=profile.fogFar;
    this.ground.material.color.set(profile.ground);this.grid.material.color.set(profile.grid);
    this.grid.material.opacity=profile.gridOpacity??.45;this.grid.scale.setScalar(profile.gridScale||1);this.grid.position.y=profile.platform?-.018:-.022;this.platform.visible=profile.platform;
    // GridHelper's shared vertex colors must not multiply away the intended grid tone.
    this.grid.material.vertexColors=false;this.grid.material.needsUpdate=true;
    this.key.color.set(profile.keyColor);this.key.intensity=profile.keyIntensity;
    this.fill.color.set(profile.fillColor);this.fill.intensity=profile.fillIntensity;
    this.hemisphere.color.set(profile.sky);this.hemisphere.groundColor.set(profile.bounce);this.hemisphere.intensity=profile.hemisphere;
    return true;
  }
  bind(scene,bounds,width,height,gridVisible=true){
    if(this.root.parent!==scene)scene.add(this.root);this.scene=scene;this.binds++;
    scene.background=this.background;scene.fog=this.fog;scene.environment=this.reflectionTarget.texture;scene.environmentIntensity=this.profile.reflection;
    this.grid.visible=gridVisible;
    const box=this.shadowBounds.copy(bounds),direction=new THREE.Vector3(...this.profile.sun).normalize();
    if(box.isEmpty()||!Number.isFinite(box.min.x))box.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1));
    const subjectCenter=box.getCenter(new THREE.Vector3()),platformRadius=Math.max(1.75,box.getSize(new THREE.Vector3()).length()/2+.35);
    // Include where every whole-clip caster corner projects onto the real ground.
    const min=box.min.clone(),max=box.max.clone();
    for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z])box.expandByPoint(new THREE.Vector3(x,y,z).addScaledVector(direction,-(y+.025)/direction.y));
    box.expandByScalar(.2);const center=box.getCenter(new THREE.Vector3()),radius=Math.max(1.4,box.getSize(new THREE.Vector3()).length()/2),distance=radius*2+8;
    this.floor.position.set(subjectCenter.x,0,subjectCenter.z);this.platform.scale.set(platformRadius,1,platformRadius);
    this.key.position.copy(center).addScaledVector(direction,distance);this.key.target.position.copy(center);
    this.fill.position.copy(center).add(new THREE.Vector3(4,3,-5));this.fill.target.position.copy(center);
    const size=Math.min(width,height)<280?256:Math.min(width,height)<600?512:1024;
    if(this.size!==size){this.key.shadow.map?.dispose();this.key.shadow.map=null;this.key.shadow.mapSize.set(size,size);this.size=size;}
    Object.assign(this.key.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:.1,far:distance+radius+8});
    this.key.shadow.camera.updateProjectionMatrix();this.root.updateMatrixWorld(true);
    this.key.target.updateMatrixWorld(true);this.fill.target.updateMatrixWorld(true);
  }
  releaseScene(scene){if(this.root.parent===scene)this.root.removeFromParent();if(this.scene===scene)this.scene=null;}
  diagnostics(){return {key:this.profile.key,label:this.profile.label,shadow:'single-directional-map',shadowSize:this.size,shadowMapTexture:this.key.shadow.map?.texture.uuid||null,reflection:'one-local-room-pmrem',reflectionTexture:this.reflectionTarget.texture.uuid,initializationMs:this.initializationMs,binds:this.binds,shadowBounds:{min:this.shadowBounds.min.toArray(),max:this.shadowBounds.max.toArray()},textures:this.renderer.info.memory.textures,geometries:this.renderer.info.memory.geometries};}
  dispose(){
    this.root.removeFromParent();const geometries=new Set(),materials=new Set();
    this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.key.shadow.map?.dispose();this.reflectionTarget.dispose();this.root.clear();this.scene=null;
  }
}
