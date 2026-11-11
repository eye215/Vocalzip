// Score → MusicXML conversion queue: owner requests, GitHub-OIDC converter, results next to the PDF.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {webcrypto as crypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const SUPABASE_URL = 'https://demo.supabase.co', ORIGIN = 'https://vocalzip.yullul.com', GH = 'https://token.actions.githubusercontent.com';
const ALICE = '11111111-1111-4111-8111-111111111111', BOB = '22222222-2222-4222-8222-222222222222';
const b64 = buf => Buffer.from(buf).toString('base64url');
let ec, rsa, other, mf;
const sign = async (key, alg, header, body) => {
  const h = b64(JSON.stringify(header)), p = b64(JSON.stringify(body)), data = new TextEncoder().encode(h + '.' + p);
  return h + '.' + p + '.' + b64(await crypto.subtle.sign(alg, key, data));
};
const userToken = sub => sign(ec.privateKey, {name:'ECDSA', hash:'SHA-256'}, {alg:'ES256', typ:'JWT', kid:'k1'},
  {sub, iss:SUPABASE_URL + '/auth/v1', exp:Math.floor(Date.now() / 1000) + 600, role:'authenticated'});
const runnerClaims = (over = {}) => ({iss:GH, aud:'vocalzip-omr', exp:Math.floor(Date.now() / 1000) + 300, nbf:Math.floor(Date.now() / 1000) - 5,
  repository:'eye215/Vocalzip', ref:'refs/heads/main', event_name:'schedule', job_workflow_ref:'eye215/Vocalzip/.github/workflows/omr-worker.yml@refs/heads/main', ...over});
const runnerToken = (over, key = rsa.privateKey, kid = 'gh1') => sign(key, {name:'RSASSA-PKCS1-v1_5'}, {alg:'RS256', typ:'JWT', kid}, runnerClaims(over));
const call = async (path, {method = 'GET', auth, body, headers = {}, origin = true} = {}) => {
  const h = {...(origin ? {origin:ORIGIN} : {}), ...headers};
  if (auth) h.authorization = 'Bearer ' + auth;
  if (body && !(body instanceof Uint8Array)) { h['content-type'] = 'application/json'; body = JSON.stringify(body); }
  if (body instanceof Uint8Array) h['content-length'] = String(body.length);
  return mf.dispatchFetch('http://media.test' + path, {method, headers:h, body});
};
before(async () => {
  ec = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign', 'verify']);
  const rsaParams = {name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1, 0, 1]), hash:'SHA-256'};
  rsa = await crypto.subtle.generateKey(rsaParams, true, ['sign', 'verify']);
  other = await crypto.subtle.generateKey(rsaParams, true, ['sign', 'verify']);
  const supa = {...await crypto.subtle.exportKey('jwk', ec.publicKey), kid:'k1', alg:'ES256', use:'sig'};
  const gh = {...await crypto.subtle.exportKey('jwk', rsa.publicKey), kid:'gh1', alg:'RS256', use:'sig'};
  mf = new Miniflare({modules:true, modulesRules:[{type:'ESModule', include:['**/*.mjs']}], scriptPath:fileURLToPath(new URL('../src/index.js', import.meta.url)), compatibilityDate:'2025-01-01',
    r2Buckets:['MEDIA'], bindings:{SUPABASE_URL, ALLOWED_ORIGINS:ORIGIN, SIGNING_SECRET:'signing-secret-for-tests-0123456789'},
    outboundService:req => {
      if (req.url === SUPABASE_URL + '/auth/v1/.well-known/jwks.json') return Response.json({keys:[supa]});
      if (req.url === GH + '/.well-known/jwks') return Response.json({keys:[gh]});
      return new Response('no', {status:404});
    }});
});
after(() => mf?.dispose());

async function uploadPdf(uid, scoreId, bytes = new TextEncoder().encode('%PDF-1.4 fake score')) {
  const auth = await userToken(uid);
  const start = await (await call('/v1/uploads', {method:'POST', auth, body:{mediaId:scoreId, contentType:'application/pdf', size:bytes.length, ext:'pdf'}})).json();
  const part = await (await call('/v1/uploads/' + encodeURIComponent(start.uploadId) + '/parts/1?key=' + encodeURIComponent(start.key), {method:'PUT', auth, body:bytes})).json();
  const done = await call('/v1/uploads/' + encodeURIComponent(start.uploadId) + '/complete?key=' + encodeURIComponent(start.key), {method:'POST', auth, body:{parts:[part]}});
  assert.equal(done.status, 200, await done.clone().text());
  return start.key;
}
const mxl = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);

test('owner queues a conversion; the main-branch converter claims it, reads the PDF and stores the result next to it', async () => {
  const key = await uploadPdf(ALICE, 'score-a'), auth = await userToken(ALICE);
  assert.equal((await call('/v1/omr?score=score-a', {auth})).status, 200);
  assert.deepEqual(await (await call('/v1/omr?score=score-a', {auth})).json(), {job:null});
  const made = await call('/v1/omr', {method:'POST', auth, body:{key}});
  assert.equal(made.status, 201);
  const {job} = await made.json();
  assert.equal(job.status, 'queued');
  const again = await (await call('/v1/omr', {method:'POST', auth, body:{key}})).json();
  assert.equal(again.job.id, job.id, 'a waiting job is reused, not duplicated');

  const runner = await runnerToken();
  const next = await (await call('/v1/omr-runner/next', {method:'POST', auth:runner, origin:false})).json();
  assert.equal(next.job.id, job.id);
  assert.equal((await (await call('/v1/omr?score=score-a', {auth})).json()).job.status, 'running');
  const src = await call('/v1/omr-runner/' + job.id + '/source', {auth:runner, origin:false});
  assert.equal(src.status, 200);
  assert.equal(await src.text(), '%PDF-1.4 fake score');
  assert.equal((await call('/v1/omr-runner/' + job.id + '/result', {method:'PUT', auth:runner, origin:false, body:new TextEncoder().encode('not a zip')})).status, 400);
  const put = await call('/v1/omr-runner/' + job.id + '/result', {method:'PUT', auth:runner, origin:false, body:mxl, headers:{'x-omr-movements':'1'}});
  assert.equal(put.status, 200, await put.clone().text());
  const status = (await (await call('/v1/omr?score=score-a', {auth})).json()).job;
  assert.equal(status.status, 'done');
  assert.equal(status.resultKey, 'u/' + ALICE + '/score-a/omr.mxl');
  const file = await call('/v1/media/' + status.resultKey, {auth});
  assert.equal(file.status, 200);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), mxl);
  const pdf = await call('/v1/media/' + key, {auth});
  assert.equal(await pdf.text(), '%PDF-1.4 fake score', 'the original PDF is unchanged');
  assert.equal((await call('/v1/omr-runner/' + job.id + '/source', {auth:runner, origin:false})).status, 409, 'finished jobs no longer expose the PDF');
  assert.deepEqual(await (await call('/v1/omr-runner/next', {method:'POST', auth:runner, origin:false})).json(), {job:null});
});

test('only the owner can queue or read a score conversion', async () => {
  const key = await uploadPdf(ALICE, 'score-b');
  const bob = await userToken(BOB);
  assert.equal((await call('/v1/omr', {method:'POST', auth:bob, body:{key}})).status, 403);
  assert.equal((await call('/v1/omr', {method:'POST', auth:bob, body:{key:'u/' + BOB + '/x/original.pdf'}})).status, 404);
  assert.equal((await call('/v1/omr', {method:'POST', auth:bob, body:{key:'u/' + BOB + '/x/original.m4a'}})).status, 403, 'PDF scores only');
  assert.equal((await call('/v1/omr', {method:'POST', body:{key}})).status, 401);
  const {job} = await (await call('/v1/omr', {method:'POST', auth:await userToken(ALICE), body:{key}})).json();
  assert.deepEqual(await (await call('/v1/omr?score=score-b', {auth:bob})).json(), {job:null});
  const runner = await runnerToken();
  assert.equal((await (await call('/v1/omr-runner/next', {method:'POST', auth:runner, origin:false})).json()).job.id, job.id);
  assert.equal((await call('/v1/omr-runner/' + job.id + '/fail', {method:'POST', auth:runner, origin:false, body:{code:'no-music'}})).status, 200);
  const failed = (await (await call('/v1/omr?score=score-b', {auth:await userToken(ALICE)})).json()).job;
  assert.deepEqual([failed.status, failed.error, failed.resultKey], ['failed', 'no-music', null]);
});

test('converter access needs a GitHub OIDC token for this repository main-branch omr workflow', async () => {
  const key = await uploadPdf(ALICE, 'score-c');
  await call('/v1/omr', {method:'POST', auth:await userToken(ALICE), body:{key}});
  const next = auth => call('/v1/omr-runner/next', {method:'POST', auth, origin:false});
  assert.equal((await next()).status, 401);
  assert.equal((await next(await userToken(ALICE))).status, 401, 'a user session is not a converter');
  assert.equal((await next(await runnerToken({}, other.privateKey))).status, 401, 'unknown signing key');
  for (const over of [{repository:'someone/Vocalzip', job_workflow_ref:'someone/Vocalzip/.github/workflows/omr-worker.yml@refs/heads/main'},
    {ref:'refs/pull/9/merge', job_workflow_ref:'eye215/Vocalzip/.github/workflows/omr-worker.yml@refs/pull/9/merge'},
    {event_name:'pull_request'}, {job_workflow_ref:'eye215/Vocalzip/.github/workflows/ui-checks.yml@refs/heads/main'}])
    assert.equal((await next(await runnerToken(over))).status, 403, JSON.stringify(over));
  for (const over of [{aud:'sts.amazonaws.com'}, {iss:'https://evil.example'}, {exp:Math.floor(Date.now() / 1000) - 10}])
    assert.equal((await next(await runnerToken(over))).status, 401, JSON.stringify(over));
  assert.equal((await next(await runnerToken({event_name:'workflow_dispatch'}))).status, 200);
});

test('conversion records stay out of the file list and usage; waiting jobs per account are limited', async () => {
  const auth = await userToken(BOB);
  for (const id of ['b1', 'b2', 'b3', 'b4']) await uploadPdf(BOB, id);
  for (const id of ['b1', 'b2', 'b3']) assert.equal((await call('/v1/omr', {method:'POST', auth, body:{key:'u/' + BOB + '/' + id + '/original.pdf'}})).status, 201);
  assert.equal((await call('/v1/omr', {method:'POST', auth, body:{key:'u/' + BOB + '/b4/original.pdf'}})).status, 429);
  const objects = (await (await call('/v1/objects', {auth})).json()).objects.map(o => o.key);
  assert.ok(objects.every(k => k.startsWith('u/' + BOB + '/') && k.endsWith('/original.pdf')), objects.join());
});
