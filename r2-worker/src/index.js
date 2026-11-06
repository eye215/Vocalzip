/* VOCAL.zip media API on Cloudflare Workers + R2.
 *
 * The browser never sees an R2 key. It signs in with Supabase as before and sends the Supabase
 * access token; this Worker checks the token and lets each user touch only `u/<user id>/…`.
 *
 *   GET    /health                                  → {ok}
 *   POST   /v1/uploads            {mediaId, contentType, size, ext}   → {key, uploadId, partSize}
 *   PUT    /v1/uploads/:uploadId/parts/:n?key=…     body = bytes       → {partNumber, etag}
 *   POST   /v1/uploads/:uploadId/complete?key=…     {parts:[{partNumber, etag}]} → {key, size, etag}
 *   DELETE /v1/uploads/:uploadId?key=…              (abort an unfinished upload)
 *   POST   /v1/sign               {key, ttl?}       → {url, expires}   (for <audio src>, which cannot send headers)
 *   GET    /v1/media/<key>?exp=…&sig=…  or with Authorization  (Range supported)
 *   HEAD   /v1/media/<key>
 *   DELETE /v1/media/<key>
 *   GET    /v1/usage                                → {objects, bytes}
 *   GET    /v1/me                                   → {user}   (sign-in check, no storage access)
 *
 * Bindings (wrangler.toml / dashboard):
 *   MEDIA                 R2 bucket
 *   SUPABASE_URL          e.g. https://<project>.supabase.co  (tokens must be issued by <url>/auth/v1)
 *   ALLOWED_ORIGINS       comma separated, e.g. https://vocalzip.yullul.com
 *   SIGNING_SECRET        secret: random string used to sign playback links
 *   SUPABASE_JWT_SECRET   secret, optional: only for projects still on the legacy HS256 JWT secret
 *   MAX_FILE_BYTES        optional, default 2 GiB
 */
const PART_SIZE = 8 * 1024 * 1024; // R2 needs ≥5 MiB for every part but the last.
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const EXT = /^[a-z0-9]{1,8}$/;
// Recordings and song PDF scores retain their existing upload contract.
const TYPE = /^(?:(audio|video)\/[A-Za-z0-9.+-]{1,60}|application\/pdf)$/;
const ARCHIVE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const enc = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, {status: cors ? 204 : 403, headers: cors || {}});
    try {
      const res = await route(request, env, ctx);
      if (cors) for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json({error: status === 500 ? 'internal error' : e.message}, status, cors || {});
    }
  }
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers}});

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin, vary: 'Origin',
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, range',
    'access-control-expose-headers': 'etag, content-length, content-range, accept-ranges',
    'access-control-max-age': '600'
  };
}

async function route(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/health') return json({ok: true, bucket: !!env.MEDIA});
  if (request.headers.get('origin') && !corsHeaders(request, env)) fail(403, 'origin not allowed');
  if (!env.MEDIA) fail(500, 'MEDIA bucket is not bound');

  if (path.startsWith('/v1/media/') && (method === 'GET' || method === 'HEAD')) {
    const key = decodeURIComponent(path.slice('/v1/media/'.length));
    if (url.searchParams.has('sig')) await checkSignature(env, key, url.searchParams);
    else ownKey(await user(request, env), key);
    return serve(request, env, key);
  }

  const uid = await user(request, env);
  // Short audio preview for opt-in STT. Reads only the caller's R2 object and
  // transforms the excerpt at Cloudflare, avoiding whole-file decoding on iOS.
  if (path.startsWith('/v1/clip/') && method === 'GET') {
    const key = ownKey(uid, decodeURIComponent(path.slice('/v1/clip/'.length)));
    if (env.STT_CLIP_ENABLED !== 'true') fail(503, 'STT clip extraction is disabled');
    const allowed = String(env.STT_CLIP_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.includes(uid)) fail(403, 'STT clip extraction is not allowed');
    if (!env.MEDIA_TRANSFORM) fail(503, 'media transformations binding is not enabled');
    if (!/\.(m4a|mp4)$/i.test(key)) fail(415, 'only M4A/MP4 clips are supported');
    const time = Number(url.searchParams.get('time') ?? '20');
    const duration = Number(url.searchParams.get('duration') ?? '30');
    if (!Number.isInteger(time) || time < 0 || time > 570 || duration !== 30 || time + duration > 600)
      fail(400, 'invalid clip interval');
    const obj = await env.MEDIA.get(key);
    if (!obj?.body) fail(404, 'audio not found');
    if (obj.size > 100 * 1024 * 1024) fail(413, 'audio too large for transform');
    try {
      const transformed = await env.MEDIA_TRANSFORM.input(obj.body).output({
        mode:'audio', time: time + 's', duration:'30s', format:'m4a'
      }).response();
      if (!transformed.ok || !transformed.body) fail(422, 'audio clip transformation failed');
      const headers = new Headers({
        'content-type':'audio/mp4',
        'content-disposition':'attachment; filename="vocalzip-stt-clip.m4a"',
        'cache-control':'no-store',
        'x-content-type-options':'nosniff'
      });
      // Prevent playback/cache of an untrusted upstream error body.
      return new Response(transformed.body, {status:200, headers});
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('audio clip transform', error);
      fail(422, 'audio clip transformation unavailable for this format');
    }
  }
  let m;
  if (path === '/v1/uploads' && method === 'POST') {
    const body = await readJson(request);
    if (!ID.test(String(body.mediaId || ''))) fail(400, 'invalid mediaId');
    const archive = body.purpose === 'performance';
    if (!TYPE.test(String(body.contentType || '')) && !(archive && ARCHIVE_TYPES.has(body.contentType))) fail(400, 'unsupported file type');
    if (archive && !String(body.mediaId).startsWith('performance-')) fail(400, 'invalid performance asset id');
    const size = Number(body.size), max = Number(env.MAX_FILE_BYTES) || 2 * 1024 ** 3;
    if (!(size > 0) || size > max) fail(413, 'file is empty or too large');
    const ext = String(body.ext || 'bin').toLowerCase();
    if (!EXT.test(ext)) fail(400, 'invalid extension');
    const key = 'u/' + uid + '/' + body.mediaId + '/original.' + ext;
    const upload = await env.MEDIA.createMultipartUpload(key, {httpMetadata: {contentType: body.contentType}, customMetadata: {owner: uid, mediaId: body.mediaId, size: String(size), ...(archive ? {purpose:'performance'} : {})}});
    return json({key, uploadId: upload.uploadId, partSize: PART_SIZE});
  }
  if ((m = path.match(/^\/v1\/uploads\/([^/]+)\/parts\/(\d{1,5})$/)) && method === 'PUT') {
    const key = ownKey(uid, url.searchParams.get('key')), n = Number(m[2]);
    if (n < 1 || n > 10000) fail(400, 'invalid part number');
    const length = Number(request.headers.get('content-length'));
    if (!(length > 0) || length > PART_SIZE) fail(413, 'part must be 1 byte – 8 MiB');
    const part = await env.MEDIA.resumeMultipartUpload(key, decodeURIComponent(m[1])).uploadPart(n, request.body);
    return json({partNumber: part.partNumber, etag: part.etag});
  }
  if ((m = path.match(/^\/v1\/uploads\/([^/]+)\/complete$/)) && method === 'POST') {
    const key = ownKey(uid, url.searchParams.get('key'));
    const {parts} = await readJson(request);
    if (!Array.isArray(parts) || !parts.length || parts.some(p => !(p.partNumber > 0) || typeof p.etag !== 'string')) fail(400, 'invalid parts');
    const done = await env.MEDIA.resumeMultipartUpload(key, decodeURIComponent(m[1])).complete(parts.map(p => ({partNumber: p.partNumber, etag: p.etag})).sort((a, b) => a.partNumber - b.partNumber));
    return json({key, size: done.size, etag: done.httpEtag});
  }
  if ((m = path.match(/^\/v1\/uploads\/([^/]+)$/)) && method === 'DELETE') {
    const key = ownKey(uid, url.searchParams.get('key'));
    try { await env.MEDIA.resumeMultipartUpload(key, decodeURIComponent(m[1])).abort(); } catch {}
    return json({ok: true});
  }
  if (path === '/v1/me' && method === 'GET') return json({user: uid});
  if (path === '/v1/sign' && method === 'POST') {
    // Expiry is rounded up to the next hour, so a file gets the same link all hour and the browser can reuse what it
    // already downloaded. {keys:[…]} signs up to 100 files in one request (the list screen prefetches visible ones).
    const body = await readJson(request), ttl = Math.min(Math.max(Number(body.ttl) || 3600, 60), 6 * 3600);
    const exp = Math.ceil((Math.floor(Date.now() / 1000) + ttl) / 3600) * 3600;
    const link = async key => new URL('/v1/media/' + key.split('/').map(encodeURIComponent).join('/') + '?exp=' + exp + '&sig=' + await hmac(env, key + '\n' + exp), url).href;
    if (Array.isArray(body.keys)) {
      if (!body.keys.length || body.keys.length > 100) fail(400, '1–100 keys');
      const urls = {};
      for (const k of body.keys) urls[k] = await link(ownKey(uid, k));
      return json({urls, expires: exp});
    }
    return json({url: await link(ownKey(uid, body.key)), expires: exp});
  }
  if (path.startsWith('/v1/media/') && method === 'DELETE') {
    const key = ownKey(uid, decodeURIComponent(path.slice('/v1/media/'.length)));
    await env.MEDIA.delete(key);
    return json({ok: true});
  }
  // Read-only list of the caller's own objects (for the app's upload check). Never lists another user's prefix.
  if (path === '/v1/objects' && method === 'GET') {
    const page = await env.MEDIA.list({prefix: 'u/' + uid + '/', cursor: url.searchParams.get('cursor') || undefined, limit: 1000, include: ['customMetadata']});
    return json({objects: page.objects.map(o => ({key: o.key, size: o.size, uploaded: o.uploaded?.toISOString?.() || null, mediaId: o.customMetadata?.mediaId || o.key.split('/')[2] || ''})),
      cursor: page.truncated ? page.cursor : null});
  }
  if (path === '/v1/usage' && method === 'GET') {
    let cursor, objects = 0, bytes = 0;
    do {
      const page = await env.MEDIA.list({prefix: 'u/' + uid + '/', cursor, limit: 1000});
      for (const o of page.objects) { objects++; bytes += o.size; }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return json({objects, bytes});
  }
  fail(404, 'not found');
}

function ownKey(uid, key) {
  key = String(key || '');
  if (!key.startsWith('u/' + uid + '/') || key.includes('..') || key.includes('//') || key.length > 300) fail(403, 'not your file');
  return key;
}
async function readJson(request) {
  if (Number(request.headers.get('content-length')) > 64 * 1024) fail(413, 'body too large');
  try { return await request.json(); } catch { fail(400, 'invalid JSON'); }
}

/* ---------- streaming with Range ---------- */
async function serve(request, env, key) {
  const range = parseRange(request.headers.get('range'));
  if (request.method === 'HEAD') {
    const head = await env.MEDIA.head(key);
    if (!head) fail(404, 'file not found');
    return new Response(null, {headers: baseHeaders(head, head.size)});
  }
  let obj;
  try { obj = await env.MEDIA.get(key, range ? {range, onlyIf: request.headers} : {onlyIf: request.headers}); }
  catch (e) {
    const head = range && await env.MEDIA.head(key);
    if (head) return new Response(null, {status: 416, headers: {'content-range': 'bytes */' + head.size}});
    throw e;
  }
  if (!obj) fail(404, 'file not found');
  if (!('body' in obj) || !obj.body) return new Response(null, {status: 304, headers: baseHeaders(obj, obj.size)});
  if (!range) return new Response(obj.body, {headers: baseHeaders(obj, obj.size)});
  const start = range.suffix != null ? Math.max(0, obj.size - range.suffix) : range.offset;
  const end = range.suffix != null ? obj.size - 1 : Math.min(obj.size - 1, range.length != null ? range.offset + range.length - 1 : obj.size - 1);
  if (start >= obj.size) return new Response(null, {status: 416, headers: {'content-range': 'bytes */' + obj.size}});
  const h = baseHeaders(obj, end - start + 1);
  h.set('content-range', 'bytes ' + start + '-' + end + '/' + obj.size);
  return new Response(obj.body, {status: 206, headers: h});
}
function baseHeaders(obj, length) {
  const h = new Headers();
  obj.writeHttpMetadata?.(h);
  h.set('x-content-type-options', 'nosniff');
  if (obj.customMetadata?.purpose === 'performance' && !/^(image|video|audio)\//.test(h.get('content-type') || '')) h.set('content-disposition', 'attachment');
  h.set('etag', obj.httpEtag); h.set('accept-ranges', 'bytes'); h.set('content-length', String(length));
  h.set('cache-control', 'private, max-age=3600');
  return h;
}
function parseRange(value) {
  const m = String(value || '').match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) return {suffix: Number(m[2])};
  const offset = Number(m[1]);
  return m[2] ? {offset, length: Number(m[2]) - offset + 1} : {offset};
}

/* ---------- playback link signatures ---------- */
async function hmac(env, text) {
  if (!env.SIGNING_SECRET || env.SIGNING_SECRET.length < 16) fail(500, 'SIGNING_SECRET is not set');
  const k = await crypto.subtle.importKey('raw', enc.encode(env.SIGNING_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}
async function checkSignature(env, key, params) {
  const exp = Number(params.get('exp'));
  if (!(exp > Date.now() / 1000)) fail(403, 'link expired');
  const expected = await hmac(env, key + '\n' + exp), given = params.get('sig') || '';
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) fail(403, 'bad signature');
}
function timingSafeEqual(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

/* ---------- Supabase access tokens ---------- */
let jwksCache = {url: '', at: 0, keys: []};
async function user(request, env) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) fail(401, 'sign in required');
  const claims = await verifyJwt(m[1].trim(), env);
  if (!claims.sub || !/^[0-9a-f-]{36}$/i.test(claims.sub)) fail(401, 'invalid user');
  return claims.sub.toLowerCase();
}
async function verifyJwt(token, env, now = Date.now() / 1000) {
  const parts = token.split('.');
  if (parts.length !== 3) fail(401, 'invalid token');
  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); } catch { fail(401, 'invalid token'); }
  const data = enc.encode(parts[0] + '.' + parts[1]), sig = b64urlDecode(parts[2]);
  let ok = false;
  if (header.alg === 'HS256') {
    if (!env.SUPABASE_JWT_SECRET) fail(401, 'HS256 tokens need SUPABASE_JWT_SECRET');
    const k = await crypto.subtle.importKey('raw', enc.encode(env.SUPABASE_JWT_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
    ok = await crypto.subtle.verify('HMAC', k, sig, data);
  } else if (header.alg === 'ES256' || header.alg === 'RS256') {
    const jwk = await findKey(env, header.kid, false) || await findKey(env, header.kid, true);
    if (!jwk) fail(401, 'unknown signing key');
    const alg = header.alg === 'ES256' ? {name: 'ECDSA', namedCurve: 'P-256'} : {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
    const k = await crypto.subtle.importKey('jwk', jwk, alg, false, ['verify']);
    ok = await crypto.subtle.verify(header.alg === 'ES256' ? {name: 'ECDSA', hash: 'SHA-256'} : alg, k, sig, data);
  } else fail(401, 'unsupported token');
  if (!ok) fail(401, 'invalid token signature');
  const issuer = String(env.SUPABASE_URL || '').replace(/\/+$/, '') + '/auth/v1';
  if (claims.iss !== issuer) fail(401, 'token from another project');
  if (!(claims.exp > now)) fail(401, 'token expired');
  if (claims.role !== 'authenticated') fail(401, 'sign in required');
  return claims;
}
async function findKey(env, kid, refresh) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '') + '/auth/v1/.well-known/jwks.json';
  if (refresh || jwksCache.url !== url || Date.now() - jwksCache.at > 10 * 60 * 1000) {
    const res = await fetch(url, {cf: {cacheTtl: 600}});
    if (!res.ok) fail(503, 'could not load signing keys');
    jwksCache = {url, at: Date.now(), keys: (await res.json()).keys || []};
  }
  return jwksCache.keys.find(k => k.kid === kid) || null;
}
function b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); }
