// Runs the Worker in Miniflare (local workerd + in-memory R2). No Cloudflare account needed.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {webcrypto as crypto} from 'node:crypto';

const SUPABASE_URL = 'https://demo.supabase.co', HS = 'legacy-jwt-secret-for-tests-only-0123456789';
const ALICE = '11111111-1111-4111-8111-111111111111', BOB = '22222222-2222-4222-8222-222222222222';
const ORIGIN = 'https://vocalzip.yullul.com';
const b64 = buf => Buffer.from(buf).toString('base64url');
let ecKeys, jwk, mf, jwksHits = 0;
async function token(sub, {alg = 'ES256', iss = SUPABASE_URL + '/auth/v1', exp = Math.floor(Date.now() / 1000) + 600, role = 'authenticated'} = {}) {
  const header = b64(JSON.stringify({alg, typ:'JWT', kid:alg === 'ES256' ? 'k1' : undefined})), body = b64(JSON.stringify({sub, iss, exp, role, aud:'authenticated'}));
  const data = new TextEncoder().encode(header + '.' + body);
  const sig = alg === 'ES256'
    ? await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, ecKeys.privateKey, data)
    : await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(HS), {name:'HMAC', hash:'SHA-256'}, false, ['sign']), data);
  return header + '.' + body + '.' + b64(sig);
}
const call = async (path, {method = 'GET', auth, body, headers = {}} = {}) => {
  const h = {origin:ORIGIN, ...headers};
  if (auth) h.authorization = 'Bearer ' + auth;
  if (body && !(body instanceof Uint8Array)) { h['content-type'] = 'application/json'; body = JSON.stringify(body); }
  if (body instanceof Uint8Array) h['content-length'] = String(body.length);
  return mf.dispatchFetch('http://media.test' + path, {method, headers:h, body});
};
before(async () => {
  ecKeys = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign', 'verify']);
  jwk = {...await crypto.subtle.exportKey('jwk', ecKeys.publicKey), kid:'k1', alg:'ES256', use:'sig'};
  mf = new Miniflare({modules:true, scriptPath:new URL('../src/index.js', import.meta.url).pathname, compatibilityDate:'2025-01-01',
    r2Buckets:['MEDIA'],
    bindings:{SUPABASE_URL, ALLOWED_ORIGINS:ORIGIN + ',https://eye215.github.io', SIGNING_SECRET:'signing-secret-for-tests-0123456789', SUPABASE_JWT_SECRET:HS},
    outboundService:req => { if (req.url === SUPABASE_URL + '/auth/v1/.well-known/jwks.json') { jwksHits++; return new Response(JSON.stringify({keys:[jwk]}), {headers:{'content-type':'application/json'}}); } return new Response('blocked', {status:599}); }});
});
after(() => mf?.dispose());

async function upload(auth, mediaId, bytes, type = 'audio/mp4') {
  const start = await (await call('/v1/uploads', {method:'POST', auth, body:{mediaId, contentType:type, size:bytes.length, ext:'m4a'}})).json();
  const parts = [];
  for (let i = 0, n = 1; i < bytes.length; i += start.partSize, n++) {
    const res = await call('/v1/uploads/' + encodeURIComponent(start.uploadId) + '/parts/' + n + '?key=' + encodeURIComponent(start.key), {method:'PUT', auth, body:bytes.subarray(i, i + start.partSize)});
    assert.equal(res.status, 200, await res.clone().text());
    parts.push(await res.json());
  }
  const done = await call('/v1/uploads/' + encodeURIComponent(start.uploadId) + '/complete?key=' + encodeURIComponent(start.key), {method:'POST', auth, body:{parts}});
  assert.equal(done.status, 200, await done.clone().text());
  return {...start, ...await done.json()};
}

test('health needs no sign-in; everything else does', async () => {
  assert.deepEqual(await (await call('/health')).json(), {ok:true, bucket:true});
  assert.equal((await call('/v1/usage')).status, 401);
  assert.equal((await call('/v1/usage', {auth:'not.a.token'})).status, 401);
});

test('tokens are checked: signature, issuer, expiry, role (ES256 via JWKS and legacy HS256)', async () => {
  assert.equal((await call('/v1/usage', {auth:await token(ALICE)})).status, 200);
  assert.deepEqual(await (await call('/v1/me', {auth:await token(ALICE)})).json(), {user:ALICE});
  assert.ok(jwksHits >= 1);
  assert.equal((await call('/v1/usage', {auth:await token(ALICE, {alg:'HS256'})})).status, 200);
  assert.equal((await call('/v1/usage', {auth:await token(ALICE, {iss:'https://other.supabase.co/auth/v1'})})).status, 401);
  assert.equal((await call('/v1/usage', {auth:await token(ALICE, {exp:Math.floor(Date.now() / 1000) - 5})})).status, 401);
  assert.equal((await call('/v1/usage', {auth:await token(ALICE, {role:'anon'})})).status, 401);
  const t = await token(ALICE), forged = t.slice(0, -4) + (t.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal((await call('/v1/usage', {auth:forged})).status, 401);
});

test('CORS allows only the app origins', async () => {
  const ok = await mf.dispatchFetch('http://media.test/v1/uploads', {method:'OPTIONS', headers:{origin:ORIGIN, 'access-control-request-method':'POST'}});
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const bad = await mf.dispatchFetch('http://media.test/v1/usage', {headers:{origin:'https://evil.example', authorization:'Bearer ' + await token(ALICE)}});
  assert.equal(bad.status, 403);
});

test('multipart upload keeps the bytes exactly, streams ranges, and reports usage', async () => {
  const auth = await token(ALICE);
  const bytes = new Uint8Array(8 * 1024 * 1024 + 12345).map((_, i) => (i * 31 + 7) & 255); // two parts
  const up = await upload(auth, 'media-1', bytes);
  assert.equal(up.key, 'u/' + ALICE + '/media-1/original.m4a');
  assert.equal(up.size, bytes.length);
  const full = await call('/v1/media/' + up.key, {auth});
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'audio/mp4');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), bytes);
  const part = await call('/v1/media/' + up.key, {auth, headers:{range:'bytes=100-199'}});
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 100-199/' + bytes.length);
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), bytes.subarray(100, 200));
  const tail = await call('/v1/media/' + up.key, {auth, headers:{range:'bytes=-10'}});
  assert.equal(tail.status, 206);
  assert.deepEqual(new Uint8Array(await tail.arrayBuffer()), bytes.subarray(bytes.length - 10));
  assert.equal((await call('/v1/media/' + up.key, {auth, headers:{range:'bytes=' + (bytes.length + 10) + '-'}})).status, 416);
  const head = await call('/v1/media/' + up.key, {method:'HEAD', auth});
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.deepEqual(await (await call('/v1/usage', {auth})).json(), {objects:1, bytes:bytes.length});
});

test('signed playback links work without a header, expire, and cannot be reused for another file', async () => {
  const auth = await token(ALICE);
  const up = await upload(auth, 'media-2', new Uint8Array([1, 2, 3, 4, 5]));
  const {url} = await (await call('/v1/sign', {method:'POST', auth, body:{key:up.key, ttl:120}})).json();
  const path = new URL(url).pathname + new URL(url).search;
  const res = await call(path);
  assert.equal(res.status, 200);
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3, 4, 5]);
  assert.equal((await call(path.replace('media-2', 'media-1'))).status, 403);
  assert.equal((await call(path.replace(/exp=\d+/, 'exp=' + (Math.floor(Date.now() / 1000) + 99999)))).status, 403);
  assert.equal((await call(path.replace(/exp=\d+/, 'exp=1'))).status, 403);
});

test('a user can never read, sign, upload into or delete another user\'s files', async () => {
  const alice = await token(ALICE), bob = await token(BOB);
  const up = await upload(alice, 'media-3', new Uint8Array([9, 9, 9]));
  assert.equal((await call('/v1/media/' + up.key, {auth:bob})).status, 403);
  assert.equal((await call('/v1/sign', {method:'POST', auth:bob, body:{key:up.key}})).status, 403);
  assert.equal((await call('/v1/media/' + up.key, {method:'DELETE', auth:bob})).status, 403);
  assert.notEqual((await call('/v1/media/u/' + BOB + '/..%2F..%2F' + ALICE + '/media-3/original.m4a', {auth:bob})).status, 200);
  const start = await (await call('/v1/uploads', {method:'POST', auth:bob, body:{mediaId:'x', contentType:'audio/mp4', size:3, ext:'m4a'}})).json();
  assert.equal((await call('/v1/uploads/' + encodeURIComponent(start.uploadId) + '/parts/1?key=' + encodeURIComponent(up.key), {method:'PUT', auth:bob, body:new Uint8Array([0])})).status, 403);
  assert.equal((await call('/v1/media/' + up.key, {auth:alice})).status, 200); // still there
});

test('rejects non-media types, bad ids and oversized parts; delete removes the file', async () => {
  const auth = await token(ALICE);
  assert.equal((await call('/v1/uploads', {method:'POST', auth, body:{mediaId:'a', contentType:'text/html', size:3, ext:'html'}})).status, 400);
  assert.equal((await call('/v1/uploads', {method:'POST', auth, body:{mediaId:'../x', contentType:'audio/mp4', size:3, ext:'m4a'}})).status, 400);
  assert.equal((await call('/v1/uploads', {method:'POST', auth, body:{mediaId:'a', contentType:'audio/mp4', size:0, ext:'m4a'}})).status, 413);
  const start = await (await call('/v1/uploads', {method:'POST', auth, body:{mediaId:'big', contentType:'audio/wav', size:20e6, ext:'wav'}})).json();
  // Refused before the body is read: the client sees 413, or a dropped connection while still sending.
  const big = await call('/v1/uploads/' + encodeURIComponent(start.uploadId) + '/parts/1?key=' + encodeURIComponent(start.key), {method:'PUT', auth, body:new Uint8Array(8 * 1024 * 1024 + 1)}).catch(e => e);
  assert.ok(big instanceof Error || big.status === 413, String(big.status));
  assert.equal((await call('/v1/uploads/' + encodeURIComponent(start.uploadId) + '?key=' + encodeURIComponent(start.key), {method:'DELETE', auth})).status, 200);
  const up = await upload(auth, 'gone', new Uint8Array([1]));
  assert.equal((await call('/v1/media/' + up.key, {method:'DELETE', auth})).status, 200);
  assert.equal((await call('/v1/media/' + up.key, {auth})).status, 404);
});

test('objects lists only the caller\'s own files, read-only, page by page', async () => {
  const alice = await token(ALICE), bob = await token(BOB);
  await upload(alice, 'list-a1', new Uint8Array(10).fill(1));
  await upload(bob, 'list-b1', new Uint8Array(12).fill(2));
  const res = await call('/v1/objects', {auth:alice});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.objects.length >= 1);
  assert.ok(body.objects.every(o => o.key.startsWith('u/' + ALICE + '/')));
  const mine = body.objects.find(o => o.mediaId === 'list-a1');
  assert.equal(mine.size, 10); assert.equal(mine.key, 'u/' + ALICE + '/list-a1/original.m4a'); assert.ok(mine.uploaded);
  assert.equal(body.cursor, null);
  assert.equal((await call('/v1/objects')).status, 401);
  assert.equal((await call('/v1/objects', {method:'POST', auth:alice})).status, 404);
});
