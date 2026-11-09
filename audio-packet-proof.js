/* Bounded packet-copy proof. A null snapshot requires the caller's exact-byte fallback. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipAudioPacketProof=api;})(globalThis,()=>{
'use strict';
const DEFAULT_BLOCK=1024*1024,MAX_PACKETS=65536;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function create({maxPackets=MAX_PACKETS,blockSize=DEFAULT_BLOCK,hash=digest}={}){
 if(!Number.isSafeInteger(maxPackets)||maxPackets<1||maxPackets>MAX_PACKETS||!Number.isSafeInteger(blockSize)||blockSize<1||blockSize>DEFAULT_BLOCK)throw Error('Invalid proof limits');
 let lengths=[],timestamps=[],durations=[],hashes=[],buffer=new Uint8Array(blockSize),used=0,bytes=0,enabled=true,sealed=false;
 const disable=()=>{enabled=false;buffer=null;lengths=[];timestamps=[];durations=[];hashes=[];};
 const flush=async()=>{if(!used)return;const value=await hash(buffer.subarray(0,used));if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value))throw Error('Digest unavailable');hashes.push(value);used=0;};
 async function add(packet){
  if(sealed)throw Error('Packet proof is sealed');
  if(!enabled)return false;
  if(lengths.length>=maxPackets){disable();return false;}
  const data=packet?.data;
  if(!(data instanceof Uint8Array)||!Number.isFinite(packet.timestamp)||!Number.isFinite(packet.duration))throw Error('Invalid audio packet');
  lengths.push(data.byteLength);timestamps.push(packet.timestamp);durations.push(packet.duration);bytes+=data.byteLength;
  try{
   for(let offset=0;offset<data.byteLength;){
    const count=Math.min(buffer.length-used,data.byteLength-offset);
    buffer.set(data.subarray(offset,offset+count),used);offset+=count;used+=count;
    if(used===buffer.length)await flush();
   }
   return true;
  }catch{disable();return false;}
 }
 async function finish(){
  if(sealed)throw Error('Packet proof is sealed');sealed=true;
  if(!enabled)return null;
  try{await flush();buffer=null;return {version:1,blockSize,packets:lengths.length,bytes,lengths,timestamps,durations,hashes};}
  catch{disable();return null;}
 }
 return {add,finish};
}
function same(a,b,sampleRate){
 if(!a||!b||a.version!==1||b.version!==1||a.blockSize!==b.blockSize||a.packets!==b.packets||a.bytes!==b.bytes||!(sampleRate>0)||!Number.isFinite(sampleRate))return false;
 if(!a.packets||!a.bytes||!Array.isArray(a.hashes)||!Array.isArray(b.hashes)||a.hashes.length!==Math.ceil(a.bytes/a.blockSize)||b.hashes.length!==a.hashes.length)return false;
 for(const key of ['lengths','timestamps','durations'])if(!Array.isArray(a[key])||!Array.isArray(b[key])||a[key].length!==a.packets||b[key].length!==b.packets)return false;
 const tolerance=1/sampleRate+0.000001;
 for(let i=0;i<a.packets;i++)if(a.lengths[i]!==b.lengths[i]||!Number.isFinite(a.timestamps[i])||!Number.isFinite(b.timestamps[i])||!Number.isFinite(a.durations[i])||!Number.isFinite(b.durations[i])||Math.abs(a.timestamps[i]-b.timestamps[i])>tolerance||Math.abs(a.durations[i]-b.durations[i])>tolerance)return false;
 return a.hashes.every((h,i)=>/^[0-9a-f]{64}$/.test(h)&&h===b.hashes[i]);
}
return {create,same};
});
