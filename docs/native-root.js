const LIMIT=4*1024*1024;
const number=x=>typeof x==='number'&&Number.isFinite(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const RULES={maxLegacyPositionErrorM:.00001,maxLegacyAngleErrorDeg:.01,maxFalseTrueLocalPositionErrorM:.00001,maxFalseTrueLocalAngleErrorDeg:.01,maxFalseActorPositionM:.00001,maxFalseActorAngleDeg:.01,maxAppliedDeltaPositionErrorM:.00001,maxAppliedDeltaAngleErrorDeg:.01,maxClockErrorSeconds:.00001};

export function validateNativeRoot(data,{id,variant}){
  const fail=message=>{throw new Error('Native Animator 根数据无效：'+message);};
  if(!data||data.schema!=='motion-native-animator-root.v1'||data.id!==id||data.baseMotionSha256!==variant.sha256||data.space!=='Y-up metres'||data.actorRootSource!=='Original Unity Animator applyRootMotion=true'||data.rootApplication!=='Apply sampled actor transform exactly once outside the existing Native pose'||data.posePolicy!=='Existing Native MVP2 is the verified root-unapplied actor-local pose'||data.loopPolicy!=='Repeat resets this sampled segment; no seamless or cross-cycle accumulation claim'||data.unityVersion!=='2022.3.17f1c1')fail('格式、单位或动作内容身份不一致。');
  if(!hash(data.evidence?.actualSamplerResultSha256)||!hash(data.evidence?.samplerSha256)||!hash(data.evidence?.inputRequestSha256))fail('缺少实际采样来源身份。');
  for(const key of ['nativeClipSha256','avatarFbxSha256','nativeSavedFramesSha256'])if(data.sourceIdentities?.[key]!==variant.sourceIdentities[key])fail('原 clip / Avatar / 保存帧身份不一致。');
  for(const key of ['avatarImporterSha256','nativeClipMetaSha256'])if(!hash(data.sourceIdentities?.[key])||data.sourceIdentities[key]!==variant.animatorRootSummary?.sourceIdentities?.[key])fail('原 Avatar 导入配置 / 动画身份不一致。');
  if(!number(data.humanScale)||data.humanScale<=0||data.humanScale!==variant.rootDataSummary?.humanScale)fail('实际 Avatar 尺度不一致。');
  const basis=data.sourceCoordinateBasis;if(!Array.isArray(basis)||basis.length!==3||basis[1]!==1||basis.some(x=>x!==-1&&x!==1))fail('缺少原 Native 坐标映射。');
  const proof=data.validation;if(proof?.passed!==true||proof.originalFiveInputsUnchanged!==true||proof.sceneRestored!==true||Object.entries(RULES).some(([k,max])=>!number(proof[k])||proof[k]<0||proof[k]>max))fail('原姿态和实际根的对照未通过。');
  const {times,positions,rotations,duration}=data;
  if(!number(duration)||duration<=.001||Math.abs(duration-variant.duration)>.00001||!Array.isArray(times)||times.length<2||times.length>180000||!Array.isArray(positions)||!Array.isArray(rotations)||times.length!==positions.length||times.length!==rotations.length||Math.abs(times[0])>.000001||Math.abs(times.at(-1)-duration)>.00001||times.some((x,i)=>!number(x)||(i&&x<=times[i-1])))fail('采样时钟不完整。');
  for(const [values,size] of [[positions,3],[rotations,4]])if(values.some(row=>!Array.isArray(row)||row.length!==size||row.some(x=>!number(x))))fail('根变换含无效数值。');
  if(rotations.some(q=>Math.abs(Math.hypot(...q)-1)>.0001)||Math.hypot(...positions[0])>.00001||Math.abs(rotations[0][3])<1-.00001)fail('旋转或初始根变换不正确。');
  return data;
}

export async function fetchNativeRoot({id,variant},signal){
  if(!variant.animatorRoot||!hash(variant.animatorRootSha256))throw new Error('当前 Native 尚无已验证的实际 Animator 根轨迹。');
  const response=await fetch(new URL(variant.animatorRoot,import.meta.url),{signal,credentials:'same-origin'});
  if(!response.ok)throw new Error('实际 Animator 根轨迹读取失败（HTTP '+response.status+'）。');
  const declared=Number(response.headers.get('content-length'));if(declared>LIMIT)throw new Error('实际根轨迹超过大小限制。');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>LIMIT||bytes.byteLength!==variant.animatorRootBytes)throw new Error('实际根轨迹字节数不符。');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==variant.animatorRootSha256)throw new Error('实际根轨迹内容身份不一致。');
  if(signal?.aborted)throw new DOMException('已取消','AbortError');
  const result=validateNativeRoot(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),{id,variant});
  return {...result,byteLength:bytes.byteLength,sha256:digest};
}

export function sampleNativeRoot(data,time){
  const t=Math.max(0,Math.min(data.duration,time)),times=data.times;let lo=0,hi=times.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(times[mid]<=t)lo=mid;else hi=mid-1;}
  const next=Math.min(lo+1,times.length-1),alpha=next===lo?0:(t-times[lo])/(times[next]-times[lo]);
  const position=data.positions[lo].map((v,i)=>v+(data.positions[next][i]-v)*alpha),a=data.rotations[lo],b=[...data.rotations[next]];
  let dot=a.reduce((sum,x,i)=>sum+x*b[i],0);if(dot<0){for(let i=0;i<4;i++)b[i]*=-1;dot=-dot;}
  let rotation;if(dot>.9995)rotation=a.map((x,i)=>x+(b[i]-x)*alpha);else{const theta=Math.acos(Math.max(-1,Math.min(1,dot))),sin=Math.sin(theta),w1=Math.sin((1-alpha)*theta)/sin,w2=Math.sin(alpha*theta)/sin;rotation=a.map((x,i)=>x*w1+b[i]*w2);}
  const norm=Math.hypot(...rotation);rotation=rotation.map(x=>x/norm);
  return {position,rotation,time:t,frame:lo,next,alpha};
}
