/* VOCAL.zip client for the R2 media Worker (r2-worker/). Holds no secret: it sends the user's
 * Supabase access token, and the Worker decides what that user may touch.
 * Inactive until window.VZIP_R2_ENDPOINT (r2-config.js) is set, so the app keeps using the
 * existing storage until the owner has set R2 up. */
(() => {
'use strict';
const localStorage = window.VzipAccountScope?.storage || window.localStorage;

const endpoint = () => String(window.VZIP_R2_ENDPOINT || '').replace(/\/+$/, '');
const signed = new Map(); // key → {url, until}
async function token() {
  const t = await window.vzipCloudAccessToken?.();
  if (!t) throw Error('로그인이 필요해요.');
  return t;
}
async function api(path, {method = 'GET', body, headers = {}, signal} = {}) {
  const init = {method, signal, headers:{authorization:'Bearer ' + await token(), ...(window.VzipAccountScope?{'X-Client-Info':'vocalzip-device-session-v2'}:{}), ...headers}};
  if (body instanceof Blob) init.body = await body.arrayBuffer(); // one part (≤8MiB); a buffer is sent the same way by every browser
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  const res = await fetch(endpoint() + path, init);
  if (!res.ok) {
    let msg = ''; try { msg = (await res.json()).error; } catch {}
    const e = Error(res.status === 401 ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : res.status === 403 ? '이 파일에 접근할 수 없어요.' : res.status === 413 ? '파일이 너무 커요.' : '저장소 오류 (' + res.status + (msg ? ': ' + msg : '') + ')');
    e.status = res.status; throw e;
  }
  return res.status === 204 ? null : res.json();
}
function uploadError(status,msg=''){
 const error=Error(status===401?'로그인이 만료됐어요. 다시 로그인해 주세요.':status===403?'이 파일에 접근할 수 없어요.':status===413?'파일이 너무 커요.':'저장소 오류 ('+status+(msg?': '+msg:'')+')');
 error.status=status;return error;
}
/** XHR sends one bounded part buffer and reports bytes; ArrayBuffer is consistent in Safari. */
async function sendPart(path,{piece,signal,onBytes,headers={}}){
 if(!window.XMLHttpRequest)return api(path,{method:'PUT',body:piece,signal,headers});
 const access=await token(),payload=await piece.arrayBuffer();
 if(signal?.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');
 return new Promise((resolve,reject)=>{
  const xhr=new window.XMLHttpRequest();let settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
  const cancel=()=>{xhr.abort();done(new DOMException('업로드를 취소했어요.','AbortError'));};
  xhr.open('PUT',endpoint()+path);xhr.responseType='json';xhr.withCredentials=false;
  xhr.setRequestHeader('authorization','Bearer '+access);
  if(window.VzipAccountScope)xhr.setRequestHeader('X-Client-Info','vocalzip-device-session-v2');
  for(const [name,value]of Object.entries(headers))xhr.setRequestHeader(name,value);
  xhr.upload.onprogress=event=>{if(!settled&&event.lengthComputable)onBytes?.(Math.min(piece.size,event.loaded));};
  xhr.onload=()=>{const data=xhr.response;if(xhr.status<200||xhr.status>=300)done(uploadError(xhr.status,typeof data?.error==='string'?data.error:''));else if(!data||typeof data!=='object')done(uploadError(502,'invalid response'));else done(null,data);};
  xhr.onerror=()=>done(Error('업로드 연결이 끊겼어요.'));
  xhr.onabort=()=>done(new DOMException('업로드를 취소했어요.','AbortError'));
  xhr.ontimeout=()=>done(Error('업로드 연결 시간이 초과됐어요.'));
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted){cancel();return;}
  try{xhr.send(payload);}catch(error){done(error);}
 });
}
const extOf = (file, type) => (String(file.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1] || ({'application/pdf':'pdf', 'audio/mp4':'m4a', 'audio/x-m4a':'m4a', 'audio/mpeg':'mp3', 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/aac':'aac', 'audio/ogg':'ogg', 'audio/flac':'flac', 'audio/webm':'webm', 'video/mp4':'mp4', 'video/quicktime':'mov', 'video/webm':'webm'})[type] || 'bin').toLowerCase();

/** Upload a file as parts (resumable per part, 3 tries each). Returns {key, size, etag}. */
async function upload(file, {mediaId, type = file.type, onProgress, signal, purpose, recoveryContext, onReceipt} = {}) {
  if(recoveryContext){
    const client=transferClient(onReceipt);
    if(check.uploadContract==='merkle-v2'||client.pending().some(entry=>entry.id===mediaId))
      return client.upload(file,{mediaId,type,ext:extOf(file,type),context:recoveryContext,onProgress,signal});
  }
  const start = await api('/v1/uploads', {method:'POST', signal, body:{mediaId, contentType:type, size:file.size, ext:extOf(file, type), ...(purpose ? {purpose} : {})}});
  const q = '?key=' + encodeURIComponent(start.key), base = '/v1/uploads/' + encodeURIComponent(start.uploadId);
  if(!Number.isSafeInteger(start.partSize)||start.partSize<1||start.partSize>8*1024*1024){
    await api('/v1/uploads/'+encodeURIComponent(start.uploadId)+'?key='+encodeURIComponent(start.key),{method:'DELETE'}).catch(()=>{});
    throw Error('저장소 전송 구간을 확인하지 못했어요.');
  }
  const parts = new Array(Math.ceil(file.size/start.partSize));
  // At most 32MiB of part buffers; save-data, slow links and low-memory devices retain two senders.
  const connection=window.navigator?.connection;
  const lanes=connection?.saveData||/^(slow-2g|2g|3g)$/.test(connection?.effectiveType||'')||(window.navigator?.deviceMemory>0&&window.navigator.deviceMemory<=2)?2:4;
  const controller=new AbortController(),cancel=()=>controller.abort(signal?.reason);
  if(signal?.aborted)cancel();signal?.addEventListener('abort',cancel,{once:true});
  let next=0,bytesDone=0,failure=null,lastProgress=0;const inFlight=new Map();
  const progress=value=>{lastProgress=Math.max(lastProgress,value);try{onProgress?.(lastProgress);}catch{}};
  const report=()=>progress(Math.min(99,Math.round((bytesDone+[...inFlight.values()].reduce((sum,n)=>sum+n,0))/file.size*100)));
  const send=async()=>{
    while(!failure&&!controller.signal.aborted){
      const index=next++;if(index>=parts.length)return;
      const piece=file.slice(index*start.partSize,(index+1)*start.partSize);
      try{
        for(let attempt=0;;attempt++){
          if(controller.signal.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');
          try{inFlight.set(index,0);parts[index]=await sendPart(base+'/parts/'+(index+1)+q,{piece,signal:controller.signal,onBytes:sent=>{inFlight.set(index,sent);report();}});break;}
          catch(error){if(error.name==='AbortError'||[401,403,413].includes(error.status)||attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)**2));}
        }
        inFlight.delete(index);bytesDone+=piece.size;report();
      }catch(error){if(!failure)failure=error;controller.abort();return;}
    }
  };
  try {
    await Promise.all(Array.from({length:lanes},()=>send()));
    if(failure)throw failure;
    if(controller.signal.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');
    const done = await api(base + '/complete' + q, {method:'POST', body:{parts}, signal});
    if (done.size !== file.size) throw Error('업로드한 크기가 원본과 달라요.');
    await onReceipt?.(recoveryContext,done);
    progress(100);
    return done;
  } catch (e) {
    api(base + q, {method:'DELETE'}).catch(() => {});
    throw e;
  } finally {signal?.removeEventListener('abort',cancel);}
}
function transferClient(onReceipt){
  if(!window.VzipResumableUploads)throw Error('업로드 재개 모듈을 불러오지 못했어요. 새로고침해 주세요.');
  const identity=()=>!window.vzipCloudSignedIn?.()||window.VzipAccountScope?.leaving?null:{
    owner:window.vzipCloudUserId?.()||'',
    session:window.vzipCloudSessionId?.()||(window.VzipAccountScope?'':'legacy'),endpoint:endpoint()
  };
  const transferApi=(path,options={})=>options.method==='PUT'&&options.body instanceof Blob?sendPart(path,{piece:options.body,signal:options.signal,headers:options.headers,onBytes:options.onUploadBytes}):api(path,options);
  return window.VzipResumableUploads.create({storage:localStorage,identity,api:transferApi,onReceipt});
}
function hasPendingTransfer(id){return !!endpoint()&&!!window.vzipCloudSignedIn?.()&&transferClient().pending().some(entry=>entry.id===id);}
async function recoverLibraryTransfers(id,onReceipt){
  if(!endpoint()||!window.vzipCloudSignedIn?.())return [];
  const client=transferClient(onReceipt),out=[];
  for(const entry of client.pending().filter(entry=>!id||entry.id===id)){
    try{out.push(await client.finish(entry.id));}
    catch(error){if(error.code==='identity')throw error;out.push({id:entry.id,status:'pending',code:error.code||'unavailable'});}
  }
  return out;
}
function acknowledgeTransfer(id,metadata){
  if(!endpoint()||!window.vzipCloudSignedIn?.())return;
  try{transferClient().acknowledge(id,metadata);}catch(error){if(error.code==='identity')throw error;}
}
/* Playback links: kept on this device until shortly before they expire (also across reloads), asked for once per file
 * even when several screens want it at the same time, and signed in batches for the rows on screen. A link already here
 * lets a tap start playback right away (iPhone Safari only plays inside the tap). */
const SKEY = window.VzipAccountScope?'vzip_r2_links_v2':'vzip_r2_links_v1', TTL = 3 * 3600, MARGIN = 300;
try { const saved = JSON.parse(localStorage.getItem(SKEY) || '{}'), now = Date.now(); for (const [k, v] of Object.entries(saved)) if (v?.until > now) signed.set(k, v); } catch {}
let saveTimer = null;
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { const now = Date.now(), out = {}; for (const [k, v] of signed) if (v.until > now) out[k] = v; localStorage.setItem(SKEY, JSON.stringify(out)); } catch {} }, 300); };
const keep = (key, link, expires) => { if(window.VzipAccountScope&&!new URL(link,location.href).searchParams.get('cap'))throw Error('저장소의 로그인 세션 업데이트를 기다리고 있어요. 잠시 후 다시 시도해 주세요.');signed.set(key, {url:link, until:(expires - MARGIN) * 1000}); persist(); };
/** A valid link already on this device, or '' (synchronous). */
window.addEventListener('vzip:auth-changed',()=>{if(!window.VzipAccountScope)return;const next=window.vzipCloudSessionId?.()||'',old=localStorage.getItem('vzip_r2_link_session_v2')||'';if(old!==next||!next){signed.clear();localStorage.removeItem(SKEY);localStorage.setItem('vzip_r2_link_session_v2',next);}});
function cachedUrl(key) { if(window.VzipAccountScope&&!window.vzipCloudSignedIn?.())return '';const hit = signed.get(key); return hit && hit.until > Date.now() ? hit.url : ''; }
const asking = new Map();
const single = key => api('/v1/sign', {method:'POST', body:{key, ttl:TTL}}).then(r => { keep(key, r.url, r.expires); return r.url; });
/** A playback URL usable in <audio src> (signed for a few hours). */
async function url(key) {
  const hit = cachedUrl(key); if (hit) return hit;
  if (asking.has(key)) return asking.get(key);
  const p = single(key); asking.set(key, p);
  try { return await p; } finally { if (asking.get(key) === p) asking.delete(key); }
}
let batchOff = false;
/** Sign the given files ahead of a tap (100 per request). Quietly does nothing if the Worker cannot batch yet. */
async function prefetch(keys) {
  if (batchOff || !endpoint() || !window.vzipCloudSignedIn?.()) return;
  const todo = [...new Set(keys.filter(k => k && !cachedUrl(k) && !asking.has(k)))];
  for (let i = 0; i < todo.length && !batchOff; i += 100) {
    const part = todo.slice(i, i + 100);
    const batch = api('/v1/sign', {method:'POST', body:{keys:part, ttl:TTL}}).then(r => {
      if (!r?.urls) { batchOff = true; return {}; }
      for (const k of part) if (r.urls[k]) keep(k, r.urls[k], r.expires);
      return r.urls;
    }, e => { if (e.status === 400 || e.status === 404) batchOff = true; return {}; });
    // A tap during the batch waits for it; a file the batch did not sign is asked for on its own.
    for (const k of part) { const p = batch.then(urls => urls[k] || single(k)); asking.set(k, p); p.catch(() => {}).finally(() => { if (asking.get(k) === p) asking.delete(k); }); }
    await batch;
  }
}
async function remove(key) { signed.delete(key); persist(); await api('/v1/media/' + key.split('/').map(encodeURIComponent).join('/'), {method:'DELETE'}); }
/** Size of a stored file, or null when it is missing. */
async function stat(key) {
  // One byte with Range: the reply's Content-Range carries the full size (no download).
  const res = await fetch(endpoint() + '/v1/media/' + key.split('/').map(encodeURIComponent).join('/'), {headers:{authorization:'Bearer ' + await token(), ...(window.VzipAccountScope?{'X-Client-Info':'vocalzip-device-session-v2'}:{}), range:'bytes=0-0'}, cache:'no-store'});
  if (res.status === 404) return null;
  if (!res.ok) throw Error('저장소 확인 실패 (' + res.status + ')');
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  await res.body?.cancel();
  return {size:Number.isFinite(total) && total > 0 ? total : Number(res.headers.get('content-length')), etag:res.headers.get('etag')};
}
/** R2 is used only after the Worker accepted this user's sign-in once; otherwise the app keeps
 * the existing storage (e.g. the Worker still needs SUPABASE_JWT_SECRET). Re-checked every 10 min. */
let check = {token:'', ok:false, reason:'', until:0};
async function ready() {
  if (!endpoint() || !window.vzipCloudSignedIn?.()) return false;
  let t; try { t = await token(); } catch { return false; }
  if (check.token === t && check.until > Date.now()) return check.ok;
  try { const accepted=await api('/v1/me'); check = {token:t, ok:true, reason:'', uploadContract:accepted.uploadContract||'', until:Date.now() + 600000}; }
  catch (e) { check = {token:t, ok:false, reason:e.status === 401 ? 'auth' : e.status ? 'http ' + e.status : 'network', until:Date.now() + (e.status ? 600000 : 60000)}; }
  return check.ok;
}
/** Download only a transformed 30-second excerpt of an R2 M4A/MP4 audio file.
 * Never decodes/downloads the entire original on iPhone; the Worker enforces ownership.
 * Requires the optional Cloudflare Media Transformations binding on the deployed Worker. */
async function clip(key, {time=20, duration=30, signal}={}) {
  if (!Number.isInteger(time) || time<0 || time>570 || duration!==30) throw Error('잘못된 분석 구간이에요.');
  const target=endpoint()+'/v1/clip/'+String(key).split('/').map(encodeURIComponent).join('/')+
    '?time='+time+'&duration=30';
  const res=await fetch(target,{headers:{authorization:'Bearer '+await token()},cache:'no-store',signal});
  if(!res.ok){
    let message='';try{message=(await res.json()).error||''}catch{}
    const error=Error(res.status===503?(message==='STT clip extraction is disabled'?'Cloudflare STT_CLIP_ENABLED가 false예요. 테스트하려면 true로 변경해 주세요.':message==='media transformations binding is not enabled'?'Cloudflare MEDIA_TRANSFORM 바인딩이 현재 배포에 없어요.':message||'Cloudflare 서버에서 추출 기능을 사용할 수 없어요 (503).'):
      res.status===422?'해당 녹음 형식은 30초 구간 추출을 지원하지 않아요.':
      '음원 구간 추출 실패 ('+res.status+(message?': '+message:'')+')');
    error.status=res.status;throw error;
  }
  const mime=(res.headers.get('content-type')||'').split(';')[0];
  if(mime!=='audio/mp4')throw Error('분석용 음원 형식이 올바르지 않아요.');
  const body=await res.blob();
  if(!body.size||body.size>6*1024*1024)throw Error('30초 음원 크기를 확인해 주세요.');
  return new File([body],'vocalzip-stt-clip.m4a',{type:'audio/mp4'});
}
async function usage() { return api('/v1/usage'); }
/** Every object under the user's own folder (read-only; the Worker lists only u/<user>/). */
async function objects() {
  const out = [];
  for (let cursor = ''; ;) {
    const page = await api('/v1/objects' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    out.push(...(page.objects || [])); if (!page.cursor) return out; cursor = page.cursor;
  }
}
async function health() {
  if (!endpoint()) return {ok:false, reason:'not-configured'};
  try { const r = await fetch(endpoint() + '/health'); return r.ok ? await r.json() : {ok:false, reason:'http ' + r.status}; } catch (e) { return {ok:false, reason:e.message}; }
}
window.VzipR2 = {configured:() => !!endpoint(), enabled:() => !!endpoint() && !!window.vzipCloudSignedIn?.(), upload, hasPendingTransfer, recoverLibraryTransfers, acknowledgeTransfer, url, cachedUrl, prefetch, remove, stat, clip, usage, objects, health, extOf, ready, lastCheck:() => ({ok:check.ok, reason:check.reason})};
})();
