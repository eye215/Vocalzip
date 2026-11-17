/* Opt-in bridge: decoded file -> isolated worker -> append-only result store. No legacy analysis or media writes. */
(()=>{'use strict';const V=window.VZ,Store=window.VzipPrecisionStore,L=window.VzipAudioFile;if(!V||!Store)return;
const MAX_SOURCE_SECONDS=600,MAX_BYTES=25*1024*1024,MAX_DECODED_BYTES=80*1024*1024;
let running=false;
const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'local';
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const digest=async b=>hex(await crypto.subtle.digest('SHA-256',b));
function abortError(){return new DOMException('정밀 분석을 멈췄어요.','AbortError');}
async function read(item,signal){
 try{return await L.read({source:L.recordingSource(V.media,item),signal,maxBytes:MAX_BYTES});}
 catch(error){if(error?.diagnostic?.code==='size')throw Error('정밀 분석은 25MB 이하 파일을 사용해 주세요.');throw error;}
}
function worker(samples,sampleRate,options,signal,onProgress){return new Promise((resolve,reject)=>{
 const w=new Worker('app/precision-report-worker.js?v=2'),end=()=>{w.terminate();signal.removeEventListener('abort',abort);},abort=()=>{end();reject(abortError());};
 if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
 w.onmessage=({data})=>{if(data.progress!=null){onProgress(data.progress);return;}end();data.error?reject(Error(data.error)):resolve(data.result);};w.onerror=()=>{end();reject(Error('정밀 분석 모듈을 불러오지 못했어요. 관련 PR 적용 상태를 확인해 주세요.'));};
 w.postMessage({samples,sampleRate,options},[samples.buffer]);
});}
V.precisionAnalyze=async(item,{context={},signal,onProgress=()=>{},start=0,end=null,force=false}={})=>{
 if(running)throw Error('다른 정밀 분석이 끝난 뒤 시도해 주세요.');if(signal?.aborted)throw abortError();if(!Number.isFinite(start)||start<0||end!=null&&(!Number.isFinite(end)||!(end>start&&end-start<=60)))throw Error('분석 구간은 60초 이내로 골라 주세요.');
 if(item.durationSeconds>MAX_SOURCE_SECONDS)throw Error('이 기기에서는 10분 이하 녹음의 구간을 분석할 수 있어요. 더 긴 녹음은 짧게 나누어 주세요.');
 if(item.size>MAX_BYTES)throw Error('정밀 분석은 25MB 이하 파일을 사용해 주세요.');
 if(item.durationSeconds>60&&end==null)throw Error('긴 녹음은 시작과 끝을 지정해 60초 이내 구간을 골라 주세요.');
 const current=owner(),controller=new AbortController(),relay=()=>controller.abort(),timeout=setTimeout(()=>controller.abort(),90000);signal?.addEventListener('abort',relay,{once:true});running=true;
 try{
  // Finished reads must release their abort closures so full bytes/decoded audio are not retained through the worker.
  const race=promise=>new Promise((resolve,reject)=>{
   const signal=controller.signal,release=()=>signal.removeEventListener('abort',abort),abort=()=>{release();reject(abortError());};
   if(signal.aborted){reject(abortError());return;}signal.addEventListener('abort',abort,{once:true});
   Promise.resolve(promise).then(value=>{release();resolve(value);},error=>{release();reject(error);});
  });
  let bytes=await race(read(item,controller.signal));const revision='sha256:'+await digest(bytes);if(controller.signal.aborted||owner()!==current)throw abortError();
  const C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!C)throw Error('이 브라우저에서 오디오 분석을 지원하지 않아요.');
  // Decode at 16 kHz for spectral analysis, unlike the 8 kHz pitch-only path. Original bytes remain unmodified.
  const ctx=new C(1,1,16000);let audio=await race(ctx.decodeAudioData(bytes.slice(0)));bytes=null;const actualEnd=end??audio.duration;
  if(audio.duration>MAX_SOURCE_SECONDS||audio.numberOfChannels>2||audio.length*audio.numberOfChannels*4>MAX_DECODED_BYTES)throw Error('이 기기에서 읽을 수 있는 음원 범위를 넘었어요. 10분 이하의 모노·스테레오 파일로 나누어 주세요.');
  if(actualEnd<=start||actualEnd>audio.duration+1/audio.sampleRate||actualEnd-start>60)throw Error('60초 이내의 실제 구간을 선택해 주세요. 긴 녹음은 구간을 나누어 분석해요.');
  const sampleRate=audio.sampleRate,a=Math.floor(start*sampleRate),b=Math.min(audio.length,Math.floor(actualEnd*sampleRate)),samples=new Float32Array(Math.max(0,b-a));
  for(let ch=0;ch<audio.numberOfChannels;ch++){const x=audio.getChannelData(ch);for(let i=0;i<samples.length;i++)samples[i]+=x[a+i]/audio.numberOfChannels;}
  audio=null; // only the selected interval is retained while the worker computes
  const conditions={...context,owner:current,source:context.source||'unknown'},scope={start,end:actualEnd},options={sourceId:String(item.id),sourceRevision:revision,context:conditions,scope};
  const key=await digest(new TextEncoder().encode(JSON.stringify({sourceId:item.id,revision,engine:'pa-1.0.0',transition:'pt-1.0.0',resonance:'pr-1.0.0',sampleRate,context:conditions,scope}))),cached=force?null:await Store.cached(current,key);
  if(cached){if(controller.signal.aborted||owner()!==current)throw abortError();return {...cached.result,archiveId:cached.id,fromCache:true};}
  const result=await worker(samples,sampleRate,options,controller.signal,onProgress);if(controller.signal.aborted||owner()!==current)throw abortError();
  result.recordedDate=V.media.dateOf(item);result.songId=item.songId||'';
  const id=crypto.randomUUID();await Store.append({id,owner:current,key,result},{signal:controller.signal});if(owner()!==current)throw abortError();
  return {...result,archiveId:id};
 }finally{running=false;clearTimeout(timeout);signal?.removeEventListener('abort',relay);}
};
/* Explicitly enabled automatic mode only follows an existing analysis completion. Never starts a bulk reanalysis. */
window.addEventListener('vzip:analysis-saved',async ev=>{
 if(window.VZIP_PRECISION_AUTO_ANALYSIS_ENABLED!==true||running)return;
 const item=V.media.cached().find(m=>m.id===ev.detail?.id);if(!item||!(item.durationSeconds>0&&item.durationSeconds<=60))return;
 try{await V.precisionAnalyze(item,{context:{source:'unknown',task:'song'}});}catch{ /* Original and legacy result stay as saved. */ }
});
})();
