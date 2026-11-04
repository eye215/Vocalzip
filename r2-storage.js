/* VOCAL.zip client for the R2 media Worker (r2-worker/). Holds no secret: it sends the user's
 * Supabase access token, and the Worker decides what that user may touch.
 * Inactive until window.VZIP_R2_ENDPOINT (r2-config.js) is set, so the app keeps using the
 * existing storage until the owner has set R2 up. */
(() => {
'use strict';
const endpoint = () => String(window.VZIP_R2_ENDPOINT || '').replace(/\/+$/, '');
const signed = new Map(); // key → {url, until}
async function token() {
  const t = await window.vzipCloudAccessToken?.();
  if (!t) throw Error('로그인이 필요해요.');
  return t;
}
async function api(path, {method = 'GET', body, headers = {}, signal} = {}) {
  const init = {method, signal, headers:{authorization:'Bearer ' + await token(), ...headers}};
  if (body instanceof Blob) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  const res = await fetch(endpoint() + path, init);
  if (!res.ok) {
    let msg = ''; try { msg = (await res.json()).error; } catch {}
    const e = Error(res.status === 401 ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : res.status === 403 ? '이 파일에 접근할 수 없어요.' : res.status === 413 ? '파일이 너무 커요.' : '저장소 오류 (' + res.status + (msg ? ': ' + msg : '') + ')');
    e.status = res.status; throw e;
  }
  return res.status === 204 ? null : res.json();
}
const extOf = (file, type) => (String(file.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1] || ({'audio/mp4':'m4a', 'audio/x-m4a':'m4a', 'audio/mpeg':'mp3', 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/aac':'aac', 'audio/ogg':'ogg', 'audio/flac':'flac', 'audio/webm':'webm', 'video/mp4':'mp4', 'video/quicktime':'mov', 'video/webm':'webm'})[type] || 'bin').toLowerCase();

/** Upload a file as parts (resumable per part, 3 tries each). Returns {key, size, etag}. */
async function upload(file, {mediaId, type = file.type, onProgress, signal} = {}) {
  const start = await api('/v1/uploads', {method:'POST', signal, body:{mediaId, contentType:type, size:file.size, ext:extOf(file, type)}});
  const q = '?key=' + encodeURIComponent(start.key), base = '/v1/uploads/' + encodeURIComponent(start.uploadId);
  const parts = [];
  try {
    for (let offset = 0, n = 1; offset < file.size; offset += start.partSize, n++) {
      const piece = file.slice(offset, offset + start.partSize);
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) throw new DOMException('업로드를 취소했어요.', 'AbortError');
        try { parts.push(await api(base + '/parts/' + n + q, {method:'PUT', body:piece, signal})); break; }
        catch (e) { if (e.name === 'AbortError' || [401, 403, 413].includes(e.status) || attempt >= 2) throw e; await new Promise(r => setTimeout(r, 1000 * (attempt + 1) ** 2)); }
      }
      onProgress?.(Math.min(99, Math.round((offset + piece.size) / file.size * 100)));
    }
    const done = await api(base + '/complete' + q, {method:'POST', body:{parts}, signal});
    if (done.size !== file.size) throw Error('업로드한 크기가 원본과 달라요.');
    onProgress?.(100);
    return done;
  } catch (e) {
    api(base + q, {method:'DELETE'}).catch(() => {});
    throw e;
  }
}
/** A playback URL usable in <audio src> (signed, about an hour). */
async function url(key) {
  const hit = signed.get(key);
  if (hit && hit.until > Date.now()) return hit.url;
  const r = await api('/v1/sign', {method:'POST', body:{key, ttl:3600}});
  signed.set(key, {url:r.url, until:(r.expires - 120) * 1000});
  return r.url;
}
async function remove(key) { signed.delete(key); await api('/v1/media/' + key.split('/').map(encodeURIComponent).join('/'), {method:'DELETE'}); }
/** Size of a stored file, or null when it is missing. */
async function stat(key) {
  // One byte with Range: the reply's Content-Range carries the full size (no download).
  const res = await fetch(endpoint() + '/v1/media/' + key.split('/').map(encodeURIComponent).join('/'), {headers:{authorization:'Bearer ' + await token(), range:'bytes=0-0'}, cache:'no-store'});
  if (res.status === 404) return null;
  if (!res.ok) throw Error('저장소 확인 실패 (' + res.status + ')');
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  await res.body?.cancel();
  return {size:Number.isFinite(total) && total > 0 ? total : Number(res.headers.get('content-length')), etag:res.headers.get('etag')};
}
async function usage() { return api('/v1/usage'); }
async function health() {
  if (!endpoint()) return {ok:false, reason:'not-configured'};
  try { const r = await fetch(endpoint() + '/health'); return r.ok ? await r.json() : {ok:false, reason:'http ' + r.status}; } catch (e) { return {ok:false, reason:e.message}; }
}
window.VzipR2 = {configured:() => !!endpoint(), enabled:() => !!endpoint() && !!window.vzipCloudSignedIn?.(), upload, url, remove, stat, usage, health, extOf};
})();
