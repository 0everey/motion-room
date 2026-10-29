import * as THREE from './vendor/three/three.module.min.js';
import {sampleMotion} from './mvp.js';
import {categoryColor} from './library-browser.js';

export function wallColumns(count,width,height){
  if(count<=1)return 1;
  const target=width/Math.max(1,height);
  let best=1,score=Infinity;
  for(let cols=1;cols<=count;cols++){const rows=Math.ceil(count/cols),aspect=width/cols/(height/rows),value=Math.abs(Math.log(aspect/.9))+(rows*cols-count)/count*.8;if(value<score){score=value;best=cols;}}
  return best;
}

export class SkeletonWall{
  constructor(canvas,{onChange=()=>{},onError=()=>{}}={}){
    Object.assign(this,{canvas,onChange,onError,yaw:.35,pitch:.06,zoom:1,frames:0,lastTime:0,columns:1,lastIds:[],fingerprints:new Map()});
    this.webgl=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});this.webgl.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.webgl.setClearColor(0,0);
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);this.camera.position.z=10;
    this.positions=new Float32Array(64*256*2*3);this.colors=new Float32Array(this.positions.length);
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setDrawRange(0,0);
    this.lines=new THREE.LineSegments(this.geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:1,depthTest:false}));this.lines.frustumCulled=false;this.scene.add(this.lines);
    this.headPositions=new Float32Array(64*3);this.headColors=new Float32Array(64*3);this.headGeometry=new THREE.BufferGeometry();this.headGeometry.setAttribute('position',new THREE.BufferAttribute(this.headPositions,3).setUsage(THREE.DynamicDrawUsage));this.headGeometry.setAttribute('color',new THREE.BufferAttribute(this.headColors,3).setUsage(THREE.DynamicDrawUsage));this.headGeometry.setDrawRange(0,0);
    this.heads=new THREE.Points(this.headGeometry,new THREE.PointsMaterial({size:5,sizeAttenuation:false,vertexColors:true,depthTest:false}));this.heads.frustumCulled=false;this.scene.add(this.heads);
    this.prepared=new WeakMap();this.palette=new Map();this.resizeObserver=new ResizeObserver(onChange);this.resizeObserver.observe(canvas);
    let drag=null;canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;this.yaw+=(e.clientX-drag[0])*.008;this.pitch=Math.max(-.6,Math.min(.6,this.pitch+(e.clientY-drag[1])*.005));drag=[e.clientX,e.clientY];onChange();});for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>drag=null);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onError(new Error('骨架图形上下文丢失，请刷新后重试。'));});
  }
  prepare(motion){
    let data=this.prepared.get(motion);if(data)return data;
    const n=motion.meta.jointCount,hip=motion.meta.names.indexOf('Hips');if(hip<0)throw new Error('速览动作缺少实际Hips。');
    let minY=Infinity,maxY=-Infinity,radius=0;
    for(let f=0;f<motion.meta.frameCount;f++){const base=f*n*3,h=base+hip*3,hx=motion.positions[h],hz=motion.positions[h+2];for(let j=0;j<n;j++){const o=base+j*3;minY=Math.min(minY,motion.positions[o+1]);maxY=Math.max(maxY,motion.positions[o+1]);radius=Math.max(radius,Math.hypot(motion.positions[o]-hx,motion.positions[o+2]-hz));}}
    data={pose:new Float32Array(n*3),hip,head:Math.max(0,motion.meta.names.indexOf('Head')),minY,maxY,radius:Math.max(.3,radius),centerY:(minY+maxY)/2,edges:motion.meta.parents.map((parent,index)=>[parent,index]).filter(([parent])=>parent>=0)};
    this.prepared.set(motion,data);return data;
  }
  draw(bank,time,{phase=false,loop=true}={}){
    const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
    if(this.width!==width||this.height!==height){this.width=width;this.height=height;this.webgl.setSize(width,height,false);}
    const count=bank.items.length,columns=wallColumns(Math.max(1,count),width,height),rows=Math.max(1,Math.ceil(count/columns));this.columns=columns;this.rows=rows;
    this.camera.left=0;this.camera.right=columns;this.camera.top=rows;this.camera.bottom=0;this.camera.updateProjectionMatrix();
    let cursor=0,heads=0;const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);this.lastIds=[];this.fingerprints.clear();
    for(const [index,item]of bank.items.entries()){
      const motion=bank.motion(item);if(!motion)continue;const data=this.prepare(motion),duration=motion.duration,local=duration>0?(phase?(loop?time%1:Math.min(1,time))*duration:loop?time%duration:Math.min(time,duration)):0,sample=sampleMotion(motion,local,data.pose),pose=data.pose,h=data.hip*3;
      const cellWidth=width/columns,cellHeight=height/rows,usableHeight=Math.max(.14,(cellHeight-49)/cellHeight),vertical=Math.max(.8,(data.maxY-data.minY)*Math.abs(cp)+2*data.radius*Math.abs(sp)),scale=Math.min(.82/(2*data.radius*cellHeight/cellWidth),usableHeight/(vertical*1.08))/this.zoom;
      const col=index%columns,row=Math.floor(index/columns),cx=col+.5,center=rows-row-.47;
      const project=(j,target,o)=>{const k=j*3,x=pose[k]-pose[h],z=pose[k+2]-pose[h+2],y=pose[k+1]-data.centerY,rx=x*cy+z*sy,rz=-x*sy+z*cy;target[o]=cx+rx*scale*cellHeight/cellWidth;target[o+1]=center+(y*cp-rz*sp)*scale;target[o+2]=0;};
      let color=this.palette.get(item.row.categoryCode);if(!color){color=new THREE.Color(categoryColor(item.row));this.palette.set(item.row.categoryCode,color);}
      for(const [a,b]of data.edges){project(a,this.positions,cursor);project(b,this.positions,cursor+3);for(let k=0;k<2;k++){this.colors[cursor+k*3]=color.r;this.colors[cursor+k*3+1]=color.g;this.colors[cursor+k*3+2]=color.b;}cursor+=6;}
      project(data.head,this.headPositions,heads*3);this.headColors[heads*3]=color.r;this.headColors[heads*3+1]=color.g;this.headColors[heads*3+2]=color.b;heads++;
      let fingerprint=0;for(let j=0;j<pose.length;j+=7)fingerprint+=pose[j]*(j+1);this.fingerprints.set(item.row.id,{time:local,frame:sample.frame,fingerprint});this.lastIds.push(item.row.id);
    }
    this.geometry.setDrawRange(0,cursor/3);this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;this.headGeometry.setDrawRange(0,heads);this.headGeometry.attributes.position.needsUpdate=true;this.headGeometry.attributes.color.needsUpdate=true;
    this.webgl.render(this.scene,this.camera);this.frames++;this.lastTime=time;return {columns,rows};
  }
  clear(){this.geometry.setDrawRange(0,0);this.headGeometry.setDrawRange(0,0);this.webgl.clear();this.lastIds=[];this.fingerprints.clear();this.prepared=new WeakMap();}
  diagnostics(){return {kind:'original-world-pose-skeleton',modelReady:false,displayRootPolicy:'每个视口去水平髋位移；保留原纵向运动和全部实际骨连接',columns:this.columns,rows:this.rows,draws:this.frames,time:this.lastTime,renderedIDs:this.lastIds,independentMotionCount:new Set(this.lastIds).size,poseStates:Object.fromEntries(this.fingerprints),drawCalls:this.webgl.info.render.calls,decodedOwner:'visible-page MotionBank',staticThumbnails:false};}
}

export class WallSession{
  constructor(bank){this.bank=bank;this.phase='ready';this.generation=0;this.signature='';this._nodes=new Map();this._byKey=new Map();this._motions={get:key=>{const item=this._byKey.get(key);return item?this.bank.motion(item):null;}};this.items=[];}
  update(){
    const items=this.bank.items.map((item,slot)=>({...item,slot})).filter(x=>this.bank.motion(x)),signature=this.bank.generation+':'+items.map(x=>x.row.id+':'+x.variant.sha256).join(',');
    if(signature!==this.signature){this.signature=signature;this.generation++;this.phase='ready';this.items=items;this._nodes=new Map(items.map(item=>['wall'+item.slot,{id:'wall'+item.slot,type:'clip',clipId:item.row.id,variant:item.variant.key,sha256:item.variant.sha256}]));this._byKey=new Map(items.map(item=>[this.key(this._nodes.get('wall'+item.slot)),item]));this.recipe={rootMode:'in-place',layout:'compare',wallCount:this.bank.items.length,actors:items.map(item=>({id:'wallactor'+item.slot,node:'wall'+item.slot,slot:item.slot,label:item.row.name,visible:true,color:categoryColor(item.row)}))};}
    return items.length;
  }
  get nodes(){return this._nodes;}
  get motions(){return this._motions;}
  clear(){this.generation++;this.signature='';this.items=[];this._nodes.clear();this._byKey.clear();this.recipe={rootMode:'in-place',layout:'compare',wallCount:0,actors:[]};this.phase='cleared';}
  key(node){return node.clipId+':'+node.variant+':'+node.sha256;}
  evaluate(time,solver){return this.items.map((item,i)=>{const motion=this.bank.motion(item),local=motion.duration>0?(this.loop===false?Math.min(time,motion.duration):time%motion.duration):0;return {actor:this.recipe.actors[i],pose:solver.sample(motion,local,'in-place')};});}
}
