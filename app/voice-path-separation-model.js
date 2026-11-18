/* Shared version/source contract for the server fallback. Pure; no media, network or storage writes. */
((root)=>{
'use strict';
const VERSION='vp-sep-1',FIELD='voicePathSeparation';
function source(meta){
 const n=Number(meta?.size),key=meta?.r2Key;
 return meta?.storageProvider==='r2'&&!(Number(meta.durationSeconds)>900)&&typeof key==='string'&&key.length>0&&Number.isSafeInteger(n)&&n>0&&n<=250*1024*1024?{provider:'r2',key,bytes:n}:null;
}
const same=(a,b)=>!!a&&!!b&&a.provider===b.provider&&a.key===b.key&&a.bytes===b.bytes;
function current(meta){const q=meta?.[FIELD];return q?.version===VERSION&&same(q.source,source(meta))?q:null;}
function request(meta,id,now,{retry=false}={}){
 const src=source(meta),old=current(meta);if(!src||!id||!Number.isFinite(now))return null;
 if(old&&(!retry||!['failed','withheld'].includes(old.state)))return null;
 const previous=meta?.[FIELD]?.state==='done'?meta[FIELD]:meta?.[FIELD]?.previous;
 return {version:VERSION,requestId:String(id),source:src,state:'queued',requestedAt:now,...(previous?{previous}:{} )};
}
// The raw mixture's jumps/flatness tests distinguish a second instrument, not isolated-voice quality.
// Keep its numerical periodicity/error limits; no timbre, breath, onset or loudness rows are released.
function quality(r){
 const P=typeof module==='object'&&module.exports?require('./voice-path-model.js'):root.VzipVoicePath;
 const c=r?.confidence,T=P.THRESHOLDS;
 if(r?.version!==P.VERSION||!(r.voicedSeconds>=T.MIN_VOICED_SECONDS))return {ok:false,why:'sample-short'};
 if(!Number.isFinite(c?.meanStrength)||c.meanStrength<T.MIXED_MIN_STRENGTH)return {ok:false,why:'weak-pitch'};
 if(!Number.isFinite(c.glitchShare)||c.glitchShare>T.MIXED_MAX_GLITCH_SHARE)return {ok:false,why:'many-glitches'};
 if(!Number.isFinite(c.outsideBandShare)||c.outsideBandShare>T.MIXED_MAX_OUTSIDE_SHARE)return {ok:false,why:'follows-accompaniment'};
 return {ok:true,why:'ai-separated-pitch'};
}
const api={VERSION,FIELD,source,same,current,request,quality};
root.VzipVoicePathSeparation=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
