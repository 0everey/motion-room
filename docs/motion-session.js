import {fetchMotion} from './mvp.js';
import {fetchNativeRoot} from './native-root.js';

export const SESSION_SCHEMA='motion-workbench.recipe.v1';
const clone=value=>structuredClone(value);
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const ident=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);

export function validateRecipe(input,catalog){
  if(!input||input.schema!==SESSION_SCHEMA||!Array.isArray(input.nodes)||!Array.isArray(input.actors))throw new Error('配方格式不受支持。');
  if(input.nodes.length<1||input.nodes.length>32||input.actors.length<1||input.actors.length>8)throw new Error('配方支持 1–32 个节点、1–8 个实例。');
  const recipe=clone(input),nodes=new Map(),clips=new Map(catalog.clips.map(c=>[c.id,c]));
  for(const node of recipe.nodes){
    if(!ident(node.id)||nodes.has(node.id))throw new Error('节点标识缺失或重复。');
    nodes.set(node.id,node);
    if(node.type==='clip'){
      const row=clips.get(node.clipId),v=row?.variants?.find(v=>v.key===node.variant&&v.hasRotations===true);
      if(!v)throw new Error(`节点 ${node.id} 的动作或来源尚无完整预览。`);
      if(node.sha256!==v.sha256)throw new Error(`节点 ${node.id} 的内容版本已变化，请重新选取。`);
      if(recipe.rootMode==='animator'&&node.variant==='native'&&(!v.animatorRoot||node.animatorRootSha256!==v.animatorRootSha256))throw new Error(`节点 ${node.id} 缺少对应内容版本的实际 Animator 根轨迹，请重新选取或使用原姿态模式。`);
      if(!finite(node.speed,.1,4)||!finite(node.phase,0,3600)||!['once','repeat'].includes(node.loop))throw new Error('片段速度、相位或循环模式无效。');
    }else if(node.type==='blend'){
      if(!ident(node.a)||!ident(node.b)||!finite(node.weight,0,1)||!['seconds','phase'].includes(node.sync))throw new Error('混合输入、权重或时间策略无效。');
    }else if(node.type==='sequence'){
      if(!Array.isArray(node.inputs)||node.inputs.length<2||node.inputs.length>16||node.inputs.some(x=>!ident(x))||!finite(node.transition,0,10)||!['linear','smoothstep'].includes(node.curve)||!['once','repeat'].includes(node.loop))throw new Error('顺序节点的输入、过渡或循环无效。');
    }else if(node.type==='output'){
      if(!ident(node.input))throw new Error('输出节点缺少输入。');
    }else throw new Error(`尚不支持节点类型 ${String(node.type)}。`);
  }
  const marks=new Map();
  function visit(id){
    const node=nodes.get(id);if(!node)throw new Error(`缺少节点 ${id}。`);
    if(marks.get(id)===1)throw new Error('节点之间不能循环引用。');
    if(marks.get(id)===2)return;
    marks.set(id,1);if(node.type==='blend'){visit(node.a);visit(node.b);}else if(node.type==='sequence')for(const input of node.inputs)visit(input);else if(node.type==='output')visit(node.input);marks.set(id,2);
  }
  for(const id of nodes.keys())visit(id);
  const actorIds=new Set();
  for(const actor of recipe.actors){
    if(!ident(actor.id)||actorIds.has(actor.id)||!nodes.has(actor.node))throw new Error('实例标识重复或输出节点缺失。');
    actorIds.add(actor.id);
    if(typeof actor.label!=='string'||actor.label.length>60||!finite(actor.speed,.1,4)||!finite(actor.offset,0,3600)||!finite(actor.hold,0,3600)||typeof actor.paused!=='boolean'||typeof actor.visible!=='boolean')throw new Error('实例参数无效。');
    if(actor.clock===undefined)actor.clock='seconds';
    if(!['seconds','phase'].includes(actor.clock))throw new Error('实例时间策略无效。');
  }
  if(recipe.speed===undefined)recipe.speed=1;
  if(recipe.layout===undefined)recipe.layout='compare';
  if(!['compare','world'].includes(recipe.layout))throw new Error('展示布局无效。');
  if(recipe.view){const v=recipe.view;if(!finite(v.yaw,-1000000,1000000)||!finite(v.pitch,-.65,.75)||!finite(v.zoom,.5,2.5)||typeof v.follow!=='boolean'||typeof v.skeleton!=='boolean'||typeof v.grid!=='boolean'||(v.focus!=='all'&&!actorIds.has(v.focus)))throw new Error('配方视角参数无效。');}
  if(!['trajectory','in-place','animator'].includes(recipe.rootMode)||typeof recipe.loop!=='boolean'||!finite(recipe.time,0,3600)||!finite(recipe.speed,.1,4))throw new Error('播放或根轨迹参数无效。');
  return recipe;
}

export function defaultRecipe(catalog){
  const ready=catalog.clips.filter(c=>c.variants?.some(v=>v.hasRotations===true));
  const a=ready.find(c=>/standing.to.crouched/i.test(c.english||''))||ready[0];
  const b=ready.find(c=>/picking.up.object/i.test(c.english||''))||ready[1]||a;
  if(!a||!b)throw new Error('目录中还没有完整姿态供给。');
  const leaf=(id,row)=>{const v=row.variants.find(v=>v.key==='source'&&v.hasRotations)||row.variants.find(v=>v.hasRotations);return {id,type:'clip',clipId:row.id,variant:v.key,sha256:v.sha256,speed:1,phase:0,loop:'repeat'};};
  return {schema:SESSION_SCHEMA,nodes:[leaf('A',a),leaf('B',b),{id:'Mix',type:'blend',a:'A',b:'B',weight:.5,sync:'phase'}],actors:['A','B','Mix'].map((node,i)=>({id:'actor'+i,node,label:['动作 A','动作 B','混合结果'][i],speed:1,offset:0,hold:0,paused:false,visible:true,clock:'phase'})),rootMode:'trajectory',loop:true,time:0,speed:1,layout:'compare'};
}

export class MotionSession{
  constructor(catalog,{onChange=()=>{}}={}){this.catalog=catalog;this.onChange=onChange;this.phase='empty';this.error=null;this.generation=0;this.motions=new Map();this.roots=new Map();this.playing=false;this.time=0;this.anchorTime=0;this.anchorNow=0;this.speed=1;}
  get nodes(){return new Map(this.recipe?.nodes.map(n=>[n.id,n])||[]);}
  row(node){return this.catalog.clips.find(c=>c.id===node.clipId);}
  variant(node){return this.row(node)?.variants.find(v=>v.key===node.variant);}
  key(node){return `${node.clipId}:${node.variant}:${node.sha256}`;}
  rootKey(node){return this.key(node)+':'+(node.animatorRootSha256||'');}
  needsRoot(node){return this.recipe.rootMode==='animator'&&node.variant==='native';}
  async setRecipe(input){
    const recipe=validateRecipe(input,this.catalog),ticket=++this.generation;
    this.controller?.abort();this.controller=new AbortController();const signal=this.controller.signal,needsRoot=n=>recipe.rootMode==='animator'&&n.variant==='native';this.playing=false;this.phase='loading';this.error=null;this.recipe=recipe;this.speed=recipe.speed;this.time=recipe.time;this.anchorTime=this.time;
    const prior=this.motions,priorRoots=this.roots,next=new Map(),nextRoots=new Map(),leaves=recipe.nodes.filter(n=>n.type==='clip');
    if(leaves.every(n=>prior.has(this.key(n))&&(!needsRoot(n)||priorRoots.has(this.rootKey(n))))){
      for(const n of leaves)next.set(this.key(n),prior.get(this.key(n)));
      for(const n of leaves)if(needsRoot(n))nextRoots.set(this.rootKey(n),priorRoots.get(this.rootKey(n)));
      this.motions=next;this.roots=nextRoots;this.phase='ready';this.time=Math.min(this.time,this.duration);this.anchorTime=this.time;this.onChange();return true;
    }
    this.onChange();
    try{
      const unique=[...new Map(leaves.map(n=>[this.key(n),n])).values()];
      await Promise.all(unique.map(async node=>{
        const key=this.key(node);
        const v=this.variant(node);let motion=prior.get(key);
        if(!motion)motion=await fetchMotion(new URL(v.url,import.meta.url),signal);
        if(motion.meta.id!==node.clipId||motion.meta.kind!==node.variant||!motion.rotations)throw new Error(`动作 ${node.id} 的实际身份与配方不一致。`);
        if(needsRoot(node)){const root=priorRoots.get(this.rootKey(node))||await fetchNativeRoot({id:node.clipId,variant:v},signal);nextRoots.set(this.rootKey(node),root);}
        next.set(key,motion);
      }));
      if(ticket!==this.generation)return false;
      if([...next.values(),...nextRoots.values()].reduce((n,m)=>n+m.byteLength,0)>96*1024*1024)throw new Error('本次组合的姿态与根数据超过 96 MB，请减少输入。');
      this.motions=next;this.roots=nextRoots;this.phase='ready';this.time=Math.min(this.time,this.duration);this.anchorTime=this.time;this.onChange();return true;
    }catch(error){if(ticket!==this.generation||error.name==='AbortError')return false;this.motions.clear();this.roots.clear();this.phase='error';this.error=typeof navigator!=='undefined'&&!navigator.onLine?'当前离线，组合中有资源尚未缓存或已被清理。请联网重新载入。':error.message;this.onChange();throw error;}
  }
  sequenceParts(node,durationOf){
    const parts=[];let end=0;
    for(const [i,id] of node.inputs.entries()){const duration=durationOf(id),fade=i?Math.min(node.transition,parts[i-1].duration/2,duration/2):0,start=i?end-fade:0;end=start+duration;parts.push({id,duration,start,end,fade});}
    return parts;
  }
  durationOf(id,cache=new Map(),nodes=this.nodes){
    if(cache.has(id))return cache.get(id);const n=nodes.get(id);if(!n)return 0;
    const child=id=>this.durationOf(id,cache,nodes);let duration;
    if(n.type==='clip')duration=(this.motions.get(this.key(n))?.duration||0)/n.speed;
    else if(n.type==='blend')duration=Math.max(child(n.a),child(n.b));
    else if(n.type==='output')duration=child(n.input);
    else duration=this.sequenceParts(n,child).at(-1).end;
    cache.set(id,duration);return duration;
  }
  get duration(){const cache=new Map(),nodes=this.nodes;return Math.max(.001,...(this.recipe?.actors.map(a=>this.durationOf(a.node,cache,nodes)/(a.clock==='seconds'?a.speed:1))||[]));}
  clock(now=performance.now()){
    if(this.playing){let t=this.anchorTime+(now-this.anchorNow)*.001*this.speed;if(t>=this.duration){if(this.recipe.loop)t%=this.duration;else{t=this.duration;this.playing=false;}}this.time=Math.max(0,t);}
    return this.time;
  }
  play(){if(this.phase!=='ready')return;if(this.time>=this.duration)this.time=0;this.playing=true;this.anchorTime=this.time;this.anchorNow=performance.now();this.onChange();}
  pause(){this.clock();this.playing=false;this.anchorTime=this.time;this.onChange();}
  seek(time){if(!finite(time,0,3600))throw new Error('时间必须在 0–3600 秒内。');this.playing=false;this.time=Math.min(time,this.duration);this.anchorTime=this.time;this.onChange();}
  setSpeed(speed){if(!finite(speed,.1,4))throw new Error('速度必须在 0.1–4 倍之间。');this.clock();this.speed=speed;if(this.recipe)this.recipe.speed=speed;this.anchorTime=this.time;this.anchorNow=performance.now();this.onChange();}
  clear(){this.generation++;this.controller?.abort();this.motions.clear();this.roots.clear();this.playing=false;this.phase='cleared';this.error=null;this.onChange();}
  localTime(node,time,terminal=false){const duration=this.motions.get(this.key(node)).duration,t=Math.max(0,time*node.speed+node.phase);if(node.loop==='repeat'&&duration>0){const local=t%duration;return terminal&&t>0&&(local<1e-7||duration-local<1e-7)?duration:local;}return Math.min(duration,t);}
  resolve(time,solver=null){
    if(this.phase!=='ready')return {outputs:[],evaluations:[]};
    const nodes=this.nodes,evaluations=[],durations=new Map(),durationOf=id=>this.durationOf(id,durations,nodes);
    const outputs=this.recipe.actors.filter(a=>a.visible).map(actor=>{
      const memo=new Map();
      const solve=(id,t,terminal=false)=>{
        const key=id+':'+t+':'+terminal;if(memo.has(key))return memo.get(key);
        const node=nodes.get(id);let pose=null;
        if(node.type==='clip'){
          const localTime=this.localTime(node,t,terminal);
          evaluations.push({actor:actor.id,node:id,nodeTime:t,localTime,terminal,clipId:node.clipId,variant:node.variant,sha256:node.sha256,animatorRootSha256:this.needsRoot(node)?node.animatorRootSha256:null,animatorRootApplied:this.needsRoot(node)&&this.roots.has(this.rootKey(node))});
          if(solver)pose=solver.sample(this.motions.get(this.key(node)),localTime,this.recipe.rootMode,this.needsRoot(node)?this.roots.get(this.rootKey(node)):null);
        }else if(node.type==='blend'){
          const duration=durationOf(id),ta=node.sync==='phase'?t*durationOf(node.a)/duration:t,tb=node.sync==='phase'?t*durationOf(node.b)/duration:t;
          const a=solve(node.a,ta,terminal),b=solve(node.b,tb,terminal);if(solver)pose=solver.blend(a,b,node.weight);
        }else if(node.type==='output')pose=solve(node.input,t,terminal);
        else{
          const parts=this.sequenceParts(node,durationOf),duration=parts.at(-1).end,local=node.loop==='repeat'&&duration>0?Math.max(0,t)%duration:Math.min(duration,Math.max(0,t));
          let i=parts.findIndex(p=>local<p.end);if(i<0)i=parts.length-1;
          const current=parts[i],next=parts[i+1],atEnd=terminal||(node.loop==='once'&&local>=duration),a=solve(current.id,local-current.start,atEnd);
          if(next&&next.fade>0&&local>=next.start){let weight=(local-next.start)/next.fade;weight=Math.max(0,Math.min(1,weight));if(node.curve==='smoothstep')weight=weight*weight*(3-2*weight);const b=solve(next.id,local-next.start);if(solver)pose=solver.blend(a,b,weight);}
          else pose=a;
        }
        memo.set(key,pose);return pose;
      };
      const referenceTime=actor.paused?actor.hold:(time+actor.offset)*actor.speed;
      const nodeTime=actor.clock==='phase'?referenceTime*durationOf(actor.node)/this.duration:referenceTime;
      return {actor,pose:solve(actor.node,nodeTime,!this.recipe.loop&&!actor.paused&&time>=this.duration)};
    });
    return {outputs,evaluations};
  }
  evaluate(time,solver){return this.resolve(time,solver).outputs;}
  exportRecipe(){return {...clone(this.recipe),time:this.time};}
  snapshot(){
    return {schema:'motion-workbench.state.v1',phase:this.phase,error:this.error,generation:this.generation,time:this.time,duration:this.duration,playing:this.playing,speed:this.speed,decodedBytes:[...this.motions.values(),...this.roots.values()].reduce((n,m)=>n+m.byteLength,0),nativeAnimatorRootProfiles:this.roots.size,recipe:this.recipe?this.exportRecipe():null,
      evaluations:this.resolve(this.time).evaluations,
      graphTiming:(this.recipe?.nodes.filter(n=>n.type==='sequence')||[]).map(n=>({node:n.id,duration:this.durationOf(n.id),parts:this.sequenceParts(n,id=>this.durationOf(id)),transitionPolicy:'每次过渡不超过相邻两段各自时长的一半'})),
      inputs:(this.recipe?.nodes.filter(n=>n.type==='clip')||[]).map(n=>{const v=this.variant(n),m=this.motions.get(this.key(n));return {node:n.id,clipId:n.clipId,variant:n.variant,sha256:n.sha256,loaded:!!m,duration:m?.duration||v.duration,frames:m?.meta.frameCount||v.frames,rootCapability:n.variant==='native'?(Number.isFinite(v.rootDataSummary?.humanScale)&&v.rootDataSummary.humanScale>0?(v.animatorRoot?'Native 对应 Avatar 尺度及实际 Animator 根轨迹已实测；是否应用取决于当前根模式':'Native 对应 Avatar 尺度已实测；Animator 根投影与姿态分离待实测'):'Native 根应用待 Avatar 尺度与 Animator 投影实测'):'Source/Cloud 实测髋轨迹；不等同 Unity Animator root',use:v.use||null,restrictions:v.restrictions||null,sourceHumanScale:v.rootDataSummary?.humanScale||null,animatorRootAvailable:!!v.animatorRoot,animatorRootLoaded:this.needsRoot(n)&&this.roots.has(this.rootKey(n)),animatorRootSha256:v.animatorRootSha256||null,rootContract:v.rootContract||v.rootPolicy,loopContract:v.loopContract||v.loopPolicy,qualityAccepted:false};}),
      capabilities:{multipleInstances:true,maxActors:8,nodeTypes:['clip','blend','sequence','output'],targetLocalBlend:true,deterministicSeek:true,recipeReload:true,recipeIncludesView:true,rootModes:['trajectory','in-place','animator'],views:['compare','world'],loop:'重复播放会重置本段轨迹；未承诺无缝或跨圈累计',nativeAnimatorRootApplied:this.recipe?.rootMode==='animator'&&this.phase==='ready'&&this.roots.size>0,contactQualityAccepted:false,anonymousImageGeneration:false}};
  }
}

export function encodeRecipe(recipe){const bytes=new TextEncoder().encode(JSON.stringify(recipe));if(bytes.length>12000)throw new Error('配方太长，请用配方文件分享。');let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decodeRecipe(text){if(text.length>16000||!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('分享配方无效或过长。');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));}
