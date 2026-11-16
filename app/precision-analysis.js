/* Opt-in bridge: decoded file -> isolated worker -> append-only result store. No legacy analysis or media writes. */
(()=>{'use strict';const V=window.VZ,Store=window.VzipPrecisionStore;if(!V||!Store)return;
let running=false;
const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'local';
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const digest=async b=>hex(await crypto.subtle.digest('SHA-256',b));
function abortError(){return new DOMException('정밀 분석을 멈췄어요.','AbortError');}
async function read(item,signal){
 const src=await V.media.src(item);if(signal.aborted){if(src.revoke)URL.revokeObjectURL(src.url);throw abortError();}
 try{const response=await fetch(src.url,{signal});if(!response.ok)throw Error('녹음을 불러오지 못했어요.');const limit=25*1024*1024;if(Number(response.headers.get('content-length'))>limit)throw Error('정밀 분석은 25MB 이하 파일을 사용해 주세요.');
  if(!response.body){const b=await response.arrayBuffer();if(b.byteLength>limit)throw Error('파일 크기 한도 초과');return b;}
  const reader=response.body.getReader(),chunks=[];let n=0;try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>limit){await reader.cancel();throw Error('파일 크기 한도 초과');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(n);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return bytes.buffer;
 }finally{if(src.revoke)URL.revokeObjectURL(src.url);}
}
function worker(samples,sampleRate,options,signal,onProgress){return new Promise((resolve,reject)=>{
 const w=new Worker('app/precision-report-worker.js?v=1'),end=()=>{w.terminate();signal.removeEventListener('abort',abort);},abort=()=>{end();reject(abortError());};
 if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
 w.onmessage=({data})=>{if(data.progress!=null){onProgress(data.progress);return;}end();data.error?reject(Error(data.error)):resolve(data.result);};w.onerror=()=>{end();reject(Error('정밀 분석 모듈을 불러오지 못했어요. 관련 PR 적용 상태를 확인해 주세요.'));};
 w.postMessage({samples,sampleRate,options},[samples.buffer]);
});}
V.precisionAnalyze=async(item,{context={},signal,onProgress=()=>{},start=0,end=null,force=false}={})=>{
 if(running)throw Error('다른 정밀 분석이 끝난 뒤 시도해 주세요.');if(signal?.aborted)throw abortError();if(!(start>=0)||end!=null&&!(end>start&&end-start<=60))throw Error('분석 구간은 60초 이내로 골라 주세요.');
 if(item.durationSeconds>180)throw Error('긴 녹음은 먼저 짧은 파일로 나누어 주세요. 기기의 전체 파일 디코딩 한도를 넘어요.');
 const current=owner(),controller=new AbortController(),relay=()=>controller.abort(),timeout=setTimeout(()=>controller.abort(),90000);signal?.addEventListener('abort',relay,{once:true});running=true;
 try{
  const race=promise=>Promise.race([promise,new Promise((_,reject)=>{if(controller.signal.aborted)reject(abortError());else controller.signal.addEventListener('abort',()=>reject(abortError()),{once:true});})]);
  const bytes=await race(read(item,controller.signal)),revision='sha256:'+await digest(bytes);if(owner()!==current)throw abortError();
  const C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!C)throw Error('이 브라우저에서 오디오 분석을 지원하지 않아요.');
  // Decode at 16 kHz for spectral analysis, unlike the 8 kHz pitch-only path. Original bytes remain unmodified.
  const ctx=new C(1,1,16000),audio=await race(ctx.decodeAudioData(bytes.slice(0))),actualEnd=end??audio.duration;
  if(actualEnd>audio.duration+.01||actualEnd-start>60)throw Error('60초 이내의 실제 구간을 선택해 주세요. 긴 녹음은 구간을 나누어 분석해요.');
  const sampleRate=audio.sampleRate,a=Math.floor(start*sampleRate),b=Math.floor(actualEnd*sampleRate),samples=new Float32Array(Math.max(0,b-a));
  for(let ch=0;ch<audio.numberOfChannels;ch++){const x=audio.getChannelData(ch);for(let i=0;i<samples.length;i++)samples[i]+=x[a+i]/audio.numberOfChannels;}
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
