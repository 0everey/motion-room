// MVP1 is a position stream. It is already in Y-up metres; no FK or axis conversion here.
export const MAX_DECODED_BYTES = 64 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

async function readLimited(stream, limit, signal) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('预览文件超过安全大小限制。');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function fetchMotion(url, signal) {
  const response = await fetch(url, {signal, credentials:'same-origin'});
  if (!response.ok) throw new Error(`预览读取失败（HTTP ${response.status}）。`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_DECODED_BYTES) throw new Error('预览文件超过安全大小限制。');
  let bytes;
  if (response.body) bytes = await readLimited(response.body, MAX_DECODED_BYTES, signal);
  else {
    bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_DECODED_BYTES) throw new Error('预览文件超过安全大小限制。');
  }
  // Hosting may already decode Content-Encoding:gzip. Only decompress a gzip payload.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (!globalThis.DecompressionStream) throw new Error('当前浏览器不支持 gzip 预览解压。请使用较新的浏览器。');
    try {
      bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_DECODED_BYTES, signal);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`预览解压失败：${error.message}`);
    }
  }
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  return parseMotion(bytes);
}

export function parseMotion(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const fail = message => { throw new Error(`预览数据无效：${message}`); };
  if (bytes.byteLength < 12 || bytes.byteLength > MAX_DECODED_BYTES) fail('文件长度超出范围。');
  const magic=String.fromCharCode(...bytes.subarray(0,4));
  if (!['MVP1','MVP2'].includes(magic)) fail('文件标识不是 MVP1/MVP2。');
  const hasRotations=magic==='MVP2';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const metadataLength = view.getUint32(4,true);
  if (!metadataLength || metadataLength > MAX_METADATA_BYTES || metadataLength > bytes.byteLength - 8) fail('元数据长度错误。');
  let meta;
  try { meta = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(8,8+metadataLength))); }
  catch { fail('元数据不是有效的 UTF-8 JSON。'); }
  if (!meta || meta.schema !== (hasRotations?'motion-preview.v2':'motion-preview.v1') || !['source','native','cloud'].includes(meta.kind)) fail('不支持的数据格式或来源。');
  const {frameCount,jointCount,names,parents} = meta;
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 180000) fail('帧数错误。');
  if (!Number.isInteger(jointCount) || jointCount < 1 || jointCount > 256) fail('骨数错误。');
  if (!Array.isArray(names) || names.length !== jointCount || names.some(n => typeof n !== 'string' || !n || n.length > 160) || new Set(names).size !== jointCount) fail('骨骼名称错误。');
  if (!Array.isArray(parents) || parents.length !== jointCount || parents.some((p,i) => !Number.isInteger(p) || p < -1 || p >= jointCount || p === i)) fail('骨骼连接错误。');
  // Parent order is arbitrary (Native UpperChest can be last). Check cycles without FK.
  const marks = new Uint8Array(jointCount);
  const visit = i => {
    if (marks[i] === 1) fail('骨骼连接含环。');
    if (marks[i] === 2) return;
    marks[i] = 1;
    if (parents[i] >= 0) visit(parents[i]);
    marks[i] = 2;
  };
  for (let i=0;i<jointCount;i++) visit(i);
  if (meta.space !== 'Y-up metres') fail('坐标约定不是 Y-up 米制。');
  if (!Number.isFinite(meta.fps) || meta.fps <= 0 || meta.fps > 1000 || !Number.isFinite(meta.duration) || meta.duration < 0) fail('时间元数据错误。');
  const dataOffset = Math.ceil((8 + metadataLength)/4)*4;
  for (let i=8+metadataLength;i<dataOffset;i++) if (bytes[i] !== 0) fail('对齐填充错误。');
  const expected = dataOffset + frameCount*4 + frameCount*jointCount*(hasRotations?7:3)*4;
  if (!Number.isSafeInteger(expected) || expected !== bytes.byteLength) fail('姿态数据长度与元数据不符。');
  let times, positions,rotations;
  if (littleEndian && (bytes.byteOffset+dataOffset)%4 === 0) {
    times = new Float32Array(bytes.buffer,bytes.byteOffset+dataOffset,frameCount);
    positions = new Float32Array(bytes.buffer,bytes.byteOffset+dataOffset+frameCount*4,frameCount*jointCount*3);
    if(hasRotations) rotations=new Float32Array(bytes.buffer,bytes.byteOffset+dataOffset+frameCount*4+positions.byteLength,frameCount*jointCount*4);
  } else {
    times = new Float32Array(frameCount);
    positions = new Float32Array(frameCount*jointCount*3);
    for(let i=0;i<times.length;i++) times[i]=view.getFloat32(dataOffset+i*4,true);
    for(let i=0;i<positions.length;i++) positions[i]=view.getFloat32(dataOffset+frameCount*4+i*4,true);
    if(hasRotations){rotations=new Float32Array(frameCount*jointCount*4);for(let i=0;i<rotations.length;i++)rotations[i]=view.getFloat32(dataOffset+frameCount*4+positions.byteLength+i*4,true);}
  }
  for(let i=0;i<times.length;i++) if(!Number.isFinite(times[i]) || times[i]<0 || (i>0 && times[i]<=times[i-1])) fail('采样时间必须有限且严格递增。');
  if(Math.abs(times[0])>0.0001) fail('采样时间未从零开始。');
  const duration = times[times.length-1];
  if(Math.abs(meta.duration-duration)>Math.max(0.001,duration*0.00001)) fail('时长与最后采样时间不符。');
  for(let i=0;i<positions.length;i++) if(!Number.isFinite(positions[i])) fail('姿态含非有限数值。');
  if(hasRotations){
    if(!Array.isArray(meta.restWorldQuaternions)||meta.restWorldQuaternions.length!==jointCount||!Array.isArray(meta.restDirections)||meta.restDirections.length!==jointCount||!Array.isArray(meta.restPositions)||meta.restPositions.length!==jointCount)fail('缺少完整旋转基准。');
    for(const q of meta.restWorldQuaternions)if(!Array.isArray(q)||q.length!==4||q.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...q)-1)>0.01)fail('旋转基准无效。');
    for(const list of [meta.restDirections,meta.restPositions])for(const p of list)if(!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))fail('骨骼基准无效。');
    for(let i=0;i<rotations.length;i+=4)if(Math.abs(Math.hypot(...rotations.subarray(i,i+4))-1)>0.01||rotations.subarray(i,i+4).some(v=>!Number.isFinite(v)))fail('旋转采样无效。');
  }
  return {meta,times,positions,rotations,duration,byteLength:bytes.byteLength};
}

export function sampleMotion(motion,time,output) {
  const {times,positions,meta:{jointCount}} = motion;
  let lower=0,upper=times.length-1;
  const clamped=Math.max(0,Math.min(motion.duration,time));
  while(lower<upper){const middle=(lower+upper+1)>>1;if(times[middle]<=clamped)lower=middle;else upper=middle-1;}
  const next=Math.min(lower+1,times.length-1);
  const alpha=next===lower?0:(clamped-times[lower])/(times[next]-times[lower]);
  const stride=jointCount*3;
  if(alpha===0)output.set(positions.subarray(lower*stride,(lower+1)*stride));
  else for(let i=0;i<stride;i++) output[i]=positions[lower*stride+i]*(1-alpha)+positions[next*stride+i]*alpha;
  return {frame:lower,next,alpha};
}
