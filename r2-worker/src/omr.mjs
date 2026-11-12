/* PDF score → MusicXML (OMR PoC, Phase 07-B/16). Song score PDFs are converted automatically in the background
 * (decided 2026-11-11); the owner can also ask again from the app.
 *
 * Owner (Supabase sign-in, after user()):
 *   POST /v1/omr        {key: u/<uid>/<scoreId>/original.pdf}  → {job}   (an active job for the same score is reused)
 *   GET  /v1/omr?score=<scoreId>                              → {job|null}
 * Converter (GitHub Actions run of .github/workflows/omr-worker.yml on main, proven with GitHub's OIDC token — no
 * shared secret exists anywhere):
 *   POST /v1/omr-runner/next                 → {job:{id,size}|null}   claims the oldest waiting job; if none, queues one
 *                                              never-converted score PDF of any account (backend auto-conversion)
 *   GET  /v1/omr-runner/<id>/source          → the PDF bytes (only while that job is claimed)
 *   PUT  /v1/omr-runner/<id>/result          body = .mxl (zip)  → stored as u/<uid>/<scoreId>/omr.mxl next to the PDF
 *   POST /v1/omr-runner/<id>/fail  {code}
 * Records: omr-jobs/<id>.json, omr-queue/<created>-<id> (waiting/claimed), omr-index/<uid>/<scoreId> → latest job id.
 * All outside u/<uid>/, so they are not files and do not count as storage. The original PDF is never changed. */
const JOB = /^[a-f0-9]{24}$/;
const SCORE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const CODES = new Set(['engine', 'no-music', 'timeout', 'too-large', 'unreadable']);
const MAX_PDF = 50 * 1024 * 1024, MAX_RESULT = 20 * 1024 * 1024, MAX_ACTIVE = 3, CLAIM_MS = 45 * 60 * 1000, MAX_ATTEMPTS = 2;
const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const OMR_AUDIENCE = 'vocalzip-omr';
let githubKeys = {at: 0, keys: []};

const publicJob = j => j && ({id: j.id, scoreId: j.scoreId, status: j.status, created: j.created, finished: j.finished || null,
  error: j.error || null, resultKey: j.status === 'done' ? j.resultKey : null, resultSize: j.resultSize || null, movements: j.movements || null});
const read = async (env, key) => { const o = await env.MEDIA.get(key); return o ? o.json() : null; };
const write = (env, key, value) => env.MEDIA.put(key, JSON.stringify(value), {httpMetadata: {contentType: 'application/json'}});
const randomId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');

export async function handleOmrUser(request, env, uid, url, {fail, json, readJson}) {
  const method = request.method;
  if (method === 'GET') {
    const scoreId = url.searchParams.get('score') || '';
    if (!SCORE_ID.test(scoreId)) fail(400, 'score id required');
    const ref = await read(env, 'omr-index/' + uid + '/' + scoreId);
    const job = ref && JOB.test(ref.id) ? await read(env, 'omr-jobs/' + ref.id + '.json') : null;
    return json({job: job && job.owner === uid ? publicJob(job) : null});
  }
  if (method !== 'POST') fail(405, 'method not allowed');
  const body = await readJson(request), key = String(body.key || '');
  const m = key.match(/^u\/([^/]+)\/([A-Za-z0-9_-]{1,100})\/original\.pdf$/);
  if (!m || m[1] !== uid) fail(403, 'not your score');
  const scoreId = m[2], head = await env.MEDIA.head(key);
  if (!head) fail(404, 'score not found');
  if (head.size > MAX_PDF) fail(413, 'score too large');
  const ref = await read(env, 'omr-index/' + uid + '/' + scoreId);
  const last = ref && JOB.test(ref.id) ? await read(env, 'omr-jobs/' + ref.id + '.json') : null;
  if (last && (last.status === 'queued' || last.status === 'running')) return json({job: publicJob(last)});
  let active = 0, cursor;
  do {
    const page = await env.MEDIA.list({prefix: 'omr-queue/', cursor, limit: 1000, include: ['customMetadata']});
    active += page.objects.filter(o => o.customMetadata?.owner === uid).length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  if (active >= MAX_ACTIVE) fail(429, 'too many conversions waiting');
  return json({job: publicJob(await createJob(env, uid, key, scoreId, head.size, 'owner'))}, 201);
}
async function createJob(env, uid, key, scoreId, size, source) {
  const now = Date.now(), id = randomId();
  const job = {v: 1, id, owner: uid, key, scoreId, size, status: 'queued', created: now, attempts: 0, source,
    resultKey: 'u/' + uid + '/' + scoreId + '/omr.mxl'};
  await write(env, 'omr-jobs/' + id + '.json', job);
  await env.MEDIA.put('omr-queue/' + String(now).padStart(15, '0') + '-' + id, '', {customMetadata: {owner: uid, id}});
  await write(env, 'omr-index/' + uid + '/' + scoreId, {id});
  return job;
}
/* Backend auto-conversion (decided 2026-11-11): when nothing waits, queue one score PDF that has never been converted
 * (no job record for it). Only song scores (u/<uid>/score-…/original.pdf) up to 50MB; performance archive PDFs and
 * other files are never touched. A failed or finished score is not queued again automatically. */
async function discover(env) {
  let cursor;
  do {
    const page = await env.MEDIA.list({prefix: 'u/', cursor, limit: 1000});
    for (const o of page.objects) {
      const m = o.key.match(/^u\/([0-9a-f-]{36})\/(score-[A-Za-z0-9_-]{1,94})\/original\.pdf$/);
      if (!m || o.size > MAX_PDF) continue;
      if (await env.MEDIA.head('omr-index/' + m[1] + '/' + m[2])) continue;
      return createJob(env, m[1], o.key, m[2], o.size, 'auto');
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return null;
}

/** Converter routes; null when the path is not one of them. */
export async function handleOmrRunner(request, env, path, {fail, json, readJson, b64urlDecode}) {
  if (!path.startsWith('/v1/omr-runner/')) return null;
  await runnerIdentity(request, env, {fail, b64urlDecode});
  const method = request.method;
  if (path === '/v1/omr-runner/next' && method === 'POST') {
    for (let round = 0; round < 2; round++) {
    if (round === 1 && !await discover(env)) break;
    const page = await env.MEDIA.list({prefix: 'omr-queue/', limit: 50, include: ['customMetadata']});
    for (const entry of page.objects) {
      const id = entry.customMetadata?.id || entry.key.split('-').pop();
      const job = JOB.test(id) ? await read(env, 'omr-jobs/' + id + '.json') : null;
      if (!job) { await env.MEDIA.delete(entry.key); continue; }
      const stale = job.status === 'running' && Date.now() - (job.claimedAt || 0) > CLAIM_MS;
      if (job.status !== 'queued' && !stale) continue;
      if (job.attempts >= MAX_ATTEMPTS) { await finish(env, job, entry.key, {status: 'failed', error: 'timeout'}); continue; }
      if (!await env.MEDIA.head(job.key)) { await finish(env, job, entry.key, {status: 'failed', error: 'unreadable'}); continue; }
      Object.assign(job, {status: 'running', claimedAt: Date.now(), attempts: (job.attempts || 0) + 1, queueKey: entry.key});
      await write(env, 'omr-jobs/' + id + '.json', job);
      return json({job: {id, size: job.size}});
    }
    }
    return json({job: null});
  }
  const m = path.match(/^\/v1\/omr-runner\/([a-f0-9]{24})\/(source|result|fail)$/);
  if (!m) fail(404, 'not found');
  const job = await read(env, 'omr-jobs/' + m[1] + '.json');
  if (!job || job.status !== 'running') fail(409, 'job is not running');
  if (m[2] === 'source' && method === 'GET') {
    const obj = await env.MEDIA.get(job.key);
    if (!obj) fail(404, 'score not found');
    return new Response(obj.body, {headers: {'content-type': 'application/pdf', 'content-length': String(obj.size), 'cache-control': 'no-store'}});
  }
  if (m[2] === 'result' && method === 'PUT') {
    const length = Number(request.headers.get('content-length') || 0);
    if (!(length > 4) || length > MAX_RESULT) fail(413, 'result size');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length !== length || bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail(400, 'result must be a compressed MusicXML (.mxl) file');
    if (!await env.MEDIA.head(job.key)) { await finish(env, job, job.queueKey, {status: 'failed', error: 'unreadable'}); fail(410, 'score was deleted'); }
    const movements = Math.max(1, Math.min(99, Number(request.headers.get('x-omr-movements')) || 1));
    await env.MEDIA.put(job.resultKey, bytes, {httpMetadata: {contentType: 'application/vnd.recordare.musicxml'},
      customMetadata: {mediaId: job.scoreId, omrJob: job.id, engine: 'audiveris'}});
    await finish(env, job, job.queueKey, {status: 'done', resultSize: bytes.length, movements});
    return json({ok: true});
  }
  if (m[2] === 'fail' && method === 'POST') {
    const code = String((await readJson(request)).code || '');
    await finish(env, job, job.queueKey, {status: 'failed', error: CODES.has(code) ? code : 'engine'});
    return json({ok: true});
  }
  fail(405, 'method not allowed');
}
async function finish(env, job, queueKey, changes) {
  Object.assign(job, changes, {finished: Date.now()});
  delete job.queueKey;
  await write(env, 'omr-jobs/' + job.id + '.json', job);
  if (queueKey) await env.MEDIA.delete(queueKey);
}

/* Only this repository's omr-worker.yml, running from main (schedule or manual start), may convert. Pull requests,
 * forks and other workflows get no OIDC token for this audience or carry a different job_workflow_ref. */
async function runnerIdentity(request, env, {fail, b64urlDecode}) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) fail(401, 'runner token required');
  const parts = m[1].trim().split('.');
  if (parts.length !== 3) fail(401, 'invalid runner token');
  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); }
  catch { fail(401, 'invalid runner token'); }
  if (header.alg !== 'RS256') fail(401, 'invalid runner token');
  const jwk = await githubKey(env, header.kid, false) || await githubKey(env, header.kid, true);
  if (!jwk) fail(401, 'unknown runner key');
  const alg = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
  const key = await crypto.subtle.importKey('jwk', {kty: jwk.kty, n: jwk.n, e: jwk.e}, alg, false, ['verify']);
  if (!await crypto.subtle.verify(alg, key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) fail(401, 'invalid runner signature');
  const repo = env.OMR_REPOSITORY || 'eye215/Vocalzip', now = Date.now() / 1000;
  if (claims.iss !== GITHUB_ISSUER || claims.aud !== OMR_AUDIENCE || !(claims.exp > now) || !(claims.nbf == null || claims.nbf <= now + 60)) fail(401, 'runner token rejected');
  if (claims.repository !== repo || claims.job_workflow_ref !== repo + '/.github/workflows/omr-worker.yml@refs/heads/main' ||
      claims.ref !== 'refs/heads/main' || !['schedule', 'workflow_dispatch'].includes(claims.event_name)) fail(403, 'runner not allowed');
}
async function githubKey(env, kid, refresh) {
  const url = GITHUB_ISSUER + '/.well-known/jwks';
  if (refresh || Date.now() - githubKeys.at > 10 * 60 * 1000) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('runner keys unavailable');
    githubKeys = {at: Date.now(), keys: (await res.json()).keys || []};
  }
  return githubKeys.keys.find(k => k.kid === kid && k.kty === 'RSA') || null;
}
