/* Bounded, read-only audio downloads. Deadlines include URL lookup and the response body.
 * Retries discard partial bytes, ask for the source again, and never save a partial file.
 * Diagnostics contain only fixed codes, HTTP status, attempt count and byte counts. */
(function(root){
'use strict';
const POLICY = Object.freeze({resolveMs:15000, idleMs:20000, totalMs:180000, attempts:2});
const MESSAGE = {network:'파일 연결이 끊겼어요. 연결을 확인하고 다시 시도해 주세요.',
  'resolve-timeout':'파일 주소를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
  'idle-timeout':'파일을 받는 동안 연결이 멈췄어요. 다시 시도해 주세요.',
  'total-timeout':'파일을 불러오는 시간이 너무 오래 걸려 멈췄어요. 연결을 확인하고 다시 시도해 주세요.',
  size:'파일이 너무 커요. 250MB 이하 파일만 분석할 수 있어요.',http:'파일을 받지 못했어요.',
  'processing-timeout':'소리를 읽는 시간이 너무 오래 걸려 멈췄어요. 다시 시도해 주세요.'};
const aborted = () => new DOMException('분석 중단','AbortError');
function issue(code, stage, attempt, status, bytes) {
  const e = Error(MESSAGE[code] + (code === 'http' ? ' (' + status + ')' : ''));
  e.diagnostic = {code, stage, attempt, status:status || null, bytes}; return e;
}
function wait(promise, signal) {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason || aborted());return;}
    const stop=()=>{signal.removeEventListener('abort',stop);reject(signal.reason || aborted());};
    signal.addEventListener('abort',stop,{once:true});
    Promise.resolve(promise).then(v=>{signal.removeEventListener('abort',stop);resolve(v);},e=>{signal.removeEventListener('abort',stop);reject(e);});
  });
}
async function read({source, signal, onProgress=()=>{}, onEvent=()=>{}, onRetry=()=>{}, maxBytes=250*1024*1024,
  policy=POLICY, fetch:fetchFile=root.fetch.bind(root)}={}) {
  const rules={...POLICY,...policy}, started=Date.now();
  for(let attempt=1;attempt<=rules.attempts;attempt++) {
    if(signal?.aborted)throw aborted();
    const ctl=new AbortController(), stop=()=>ctl.abort(aborted());
    let timer,src,reader,timeout,complete=false,stage='source',bytes=0;
    const arm=(ms,code)=>{
      clearTimeout(timer);
      const remaining=rules.totalMs-(Date.now()-started);
      timer=setTimeout(()=>{timeout=issue(remaining<=ms?'total-timeout':code,stage,attempt,null,bytes);ctl.abort(timeout);},Math.max(0,Math.min(ms,remaining)));
    };
    signal?.addEventListener('abort',stop,{once:true});
    try {
      arm(rules.resolveMs,'resolve-timeout');
      const finding=Promise.resolve().then(()=>{if(ctl.signal.aborted)throw ctl.signal.reason;return source({signal:ctl.signal,attempt});});
      // A non-cancellable provider can return an object URL after the caller left. Release it too.
      finding.then(late=>{if(ctl.signal.aborted&&late?.revoke)root.URL.revokeObjectURL(late.url);},()=>{});
      src=await wait(finding,ctl.signal);
      stage='headers';arm(rules.idleMs,'idle-timeout');
      const res=await wait(fetchFile(src.url,{signal:ctl.signal}),ctl.signal);
      if(!res.ok){res.body?.cancel?.().catch(()=>{});throw issue('http',stage,attempt,res.status,bytes);}
      const length=Number(res.headers?.get?.('content-length'))||0;
      if(length>maxBytes){res.body?.cancel?.().catch(()=>{});throw issue('size',stage,attempt,null,bytes);}
      stage='body';arm(rules.idleMs,'idle-timeout');
      let result;
      if(res.body?.getReader && !src.revoke) {
        reader=res.body.getReader();const parts=[];
        for(;;) {
          const part=await wait(reader.read(),ctl.signal);if(part.done)break;
          bytes+=part.value.byteLength;
          if(bytes>maxBytes)throw issue('size',stage,attempt,null,bytes);
          parts.push(part.value);arm(rules.idleMs,'idle-timeout');
          onProgress(length?Math.min(1,bytes/length):null);
        }
        result=await wait(new Blob(parts).arrayBuffer(),ctl.signal);
      } else { result=await wait(res.arrayBuffer(),ctl.signal);bytes=result.byteLength; }
      if(bytes>maxBytes)throw issue('size',stage,attempt,null,bytes);
      complete=true;onProgress(1);
      if(attempt>1)onEvent({code:'recovered',stage,attempt,status:null,bytes});
      return result;
    } catch(error) {
      error=timeout || error; // older Safari drops AbortController.abort(reason)
      if(signal?.aborted || error?.name==='AbortError')throw aborted();
      const e=error?.diagnostic?error:issue(error?.status?'http':'network',stage,attempt,error?.status,bytes);
      onEvent(e.diagnostic);
      const d=e.diagnostic,retry=d.code==='network'||d.code==='resolve-timeout'||d.code==='idle-timeout'||
        (d.code==='http'&&([401,403,408,429].includes(d.status)||d.status>=500));
      if(!retry || attempt===rules.attempts || Date.now()-started>=rules.totalMs)throw e;
      onRetry(d);
    } finally {
      clearTimeout(timer);signal?.removeEventListener('abort',stop);
      if(!complete){ctl.abort();reader?.cancel().catch(()=>{});}
      if(src?.revoke)root.URL.revokeObjectURL(src.url);
    }
  }
}
/** Deadline for a non-cancellable decoder, or a worker whose abort listener releases its buffers. */
async function task(work,{signal,ms=30000,stage='decode'}={}) {
  if(signal?.aborted)throw aborted();
  const ctl=new AbortController(),stop=()=>ctl.abort(aborted());
  signal?.addEventListener('abort',stop,{once:true});
  let timeout;
  const timer=setTimeout(()=>{timeout=issue('processing-timeout',stage,1,null,0);ctl.abort(timeout);},ms);
  try{return await wait(Promise.resolve().then(()=>{if(ctl.signal.aborted)throw ctl.signal.reason;return work(ctl.signal);}),ctl.signal);}
  catch(error){throw signal?.aborted?aborted():timeout || error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);ctl.abort();}
}
const recordingSource = (media,item) => async ({signal,attempt}) => {
  const now=media.srcNow?.(item);
  if(now?.revoke || (attempt===1&&now))return now;
  if(item.storageProvider==='r2' && item.r2Key && typeof root.VzipR2?.url==='function')
    return {url:await root.VzipR2.url(item.r2Key,{signal,refresh:attempt>1}),revoke:false};
  return media.src(item);
};
const api={read,task,recordingSource,POLICY};
if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipAudioFile=api;
})(typeof window==='object'?window:globalThis);
