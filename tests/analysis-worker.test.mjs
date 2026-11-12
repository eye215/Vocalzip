// Server analysis worker against a real Postgres (the CI database job, or VZ_TEST_DB locally), real ffmpeg
// decoding, and local stand-ins for Cloudflare R2 and the STT API. Checks zero automatic paid calls,
// approval-only cached candidates, protection of user edits, retries and failure.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import pg from 'pg';
import {signV4, decide, AUTO, describeDbUrl, r2Endpoint, describeSecret, networkCause} from '../worker/analysis-worker.mjs';

const require = createRequire(import.meta.url);
const {synth} = require('./synth-vocal.cjs');
const ROOT = new URL('..', import.meta.url).pathname;
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const LYRICS_A = 'There is a moment when the world stands still and every dream I ever had comes rushing in like morning light across the hills I will not wait another day this is the moment this is the day when I send all my doubts away';
const LYRICS_B = 'Something has changed within me something is not the same I am through with playing by the rules of someone elses game too late for second guessing too late to go back to sleep';

test('Signature V4 matches the AWS S3 GET example', () => {
  const auth = signV4({method:'GET', path:'/test.txt', headers:{host:'examplebucket.s3.amazonaws.com', range:'bytes=0-9', 'x-amz-content-sha256':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'x-amz-date':'20130524T000000Z'},
    payloadHash:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', region:'us-east-1', service:'s3', accessKey:'AKIAIOSFODNN7EXAMPLE', secretKey:'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'});
  assert.equal(auth, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});
test('Even a strong match requires user approval; confidence is separate from assignment', () => {
  const strong = {candidate:'s1', matches:[{songId:'s1', score:0.62}, {songId:'s2', score:0.08}]};
  assert.equal(decide('this is the moment this is the day when I send', strong).auto, false);
  assert.equal(decide('this is the moment this is the day when I send', strong).songId, null);
  assert.equal(decide('this is the moment this is the day when I send', strong).confident, true);
  assert.equal(decide('the moment', strong).auto, false, 'too few words');
  assert.equal(decide('this is the moment this is the day when I send', {candidate:'s1', matches:[{songId:'s1', score:0.36}, {songId:'s2', score:0.05}]}).auto, false, 'below ' + AUTO.minScore);
  assert.equal(decide('this is the moment this is the day when I send', {candidate:'s1', matches:[{songId:'s1', score:0.55}, {songId:'s2', score:0.47}]}).auto, false, 'runner-up too close');
  assert.equal(decide('this is the moment this is the day when I send', {candidate:null, matches:[{songId:'s1', score:0.9}]}).auto, false, 'matcher itself unsure');
});

test('A wrong database address is explained without ever printing the password', () => {
  const ok = describeDbUrl('postgresql://postgres.abcdefghijklmnopqrst:Secret123@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres');
  assert.match(ok, /pooler/); assert.match(ok, /postgres\.<project>/); assert.doesNotMatch(ok, /Secret123/);
  const direct = describeDbUrl('postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnopqrst.supabase.co:5432/postgres');
  assert.match(direct, /DIRECT/); assert.match(direct, /needs postgres\.<project>/); assert.match(direct, /YOUR-PASSWORD/);
  const special = describeDbUrl('postgresql://postgres.abcdefghijklmnopqrst:pa@ss@aws-0-x.pooler.supabase.com:5432/postgres');
  assert.match(special, /%40/); assert.doesNotMatch(special, /pa@ss/);
});

test('R2_ACCOUNT_ID: the bare id or a pasted endpoint URL both work; anything else is explained without its value', () => {
  const id = '0123456789abcdef0123456789abcdef', url = 'https://' + id + '.r2.cloudflarestorage.com';
  for (const v of [id, ' ' + id + '\n', url, url + '/vocalzip-media', id.toUpperCase(), 'https://' + id + '.eu.r2.cloudflarestorage.com']) assert.equal(r2Endpoint(v, ''), url, JSON.stringify(v));
  assert.throws(() => r2Endpoint('my-account', ''), e => /32-character/.test(e.message) && !e.message.includes('my-account'));
  assert.throws(() => r2Endpoint('', ''), /missing/);
  assert.match(describeSecret(' abc\n'), /spaces or line breaks/); assert.doesNotMatch(describeSecret('s3cr3t'), /s3cr3t/);
});
test('"fetch failed" is named: DNS, refused, timeout, TLS', () => {
  const err = code => Object.assign(new TypeError('fetch failed'), {cause:{code}});
  assert.match(networkCause(err('ENOTFOUND')), /DNS ENOTFOUND.*R2_ACCOUNT_ID/);
  assert.equal(networkCause(err('ECONNREFUSED')), 'connection refused');
  assert.match(networkCause(err('UND_ERR_CONNECT_TIMEOUT')), /timeout/);
  assert.match(networkCause(Object.assign(new Error('x'), {name:'TimeoutError'})), /timeout/);
  assert.match(networkCause(err('UNABLE_TO_VERIFY_LEAF_SIGNATURE')), /^TLS/);
});

const DB = process.env.VZ_TEST_DB;
const skip = !DB || spawnSync('ffmpeg', ['-version']).status !== 0 ? 'needs VZ_TEST_DB and ffmpeg' : false;
let admin, db, r2, stt, files = new Map(), sttCalls = 0, sttText = new Map(), dbName;
const wav = opt => { const {samples, sr} = synth({sr:22050, ...opt}); const b = Buffer.alloc(44 + samples.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40); for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 20000))), 44 + i * 2); return b; };
// A real AAC M4A with its index (moov) at the end, like an iPhone recording: written to a file (MP4 needs seeking).
const m4a = buf => { const dir = mkdtempSync(join(tmpdir(), 'vzt-')), out = join(dir, 'a.m4a');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'wav', '-i', 'pipe:0', '-c:a', 'aac', '-b:a', '96k', out], {input:buf});
  if (r.status !== 0) throw new Error('test M4A could not be made'); const bytes = readFileSync(out); rmSync(dir, {recursive:true}); return bytes; };
const key = (u, id, ext) => 'u/' + u + '/' + id + '/original.' + ext;
const listen = handler => new Promise(r => { const s = createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const media = async (id, meta, user = U1) => db.query('insert into public.vocal_media (id, user_id, metadata) values ($1, $2, $3)', [id, user, JSON.stringify(meta)]);
const row = async id => (await db.query('select metadata from public.vocal_media where id = $1', [id])).rows[0].metadata;
const jobs = async id => Object.fromEntries((await db.query('select kind, status, attempts, result, cost_usd, last_error from public.vocal_analysis_jobs where media_id = $1', [id])).rows.map(r => [r.kind, r]));
async function work() { const {run} = await import('../worker/analysis-worker.mjs'); return run({db, log:() => {}}); }

before(async () => {
  if (skip) return;
  admin = new pg.Client({connectionString:DB}); await admin.connect();
  for (const {datname} of (await admin.query("select datname from pg_database where datname like 'vzw\\_%'")).rows) await admin.query('drop database if exists ' + datname);
  dbName = 'vzw_' + Date.now();
  await admin.query('create database ' + dbName);
  db = new pg.Client({connectionString:DB.replace(/\/[^/]*$/, '/' + dbName)}); await db.connect();
  for (const f of ['billing/tests/sql-setup.sql', 'supabase/tests/app-tables.sql', 'billing/migrations/20261104_billing_cloud.sql', 'supabase/migrations/20261106_keep_history.sql', 'supabase/migrations/20261106_song_text_cloud_sync.sql', 'supabase/migrations/20261106_song_text_tombstones.sql',
    'supabase/migrations/20261106_vzip_song_stt_quota.sql', 'supabase/migrations/20261108_vzip_song_stt_no_limit_usage.sql', 'supabase/migrations/20261109_server_analysis_jobs.sql', 'supabase/migrations/20261110_wake_analysis_worker.sql', 'supabase/migrations/20261111_recheck_review_songs.sql', 'supabase/migrations/20261112_song_refs_sig_translation.sql'])
    // Roles are server-wide: a second local run must not fail on "already exists".
    await db.query(readFileSync(ROOT + f, 'utf8').replace(/create role (anon|authenticated) nologin;/g, (_, r) => "do $$ begin if not exists (select 1 from pg_roles where rolname = '" + r + "') then create role " + r + " nologin; end if; end $$;"));
  await db.query("update public.vocal_data set payload = $1 where user_id = $2", [JSON.stringify({songs:[{id:'s1', title:'This Is the Moment', lyrics:LYRICS_A}, {id:'s2', title:'Defying Gravity', lyrics:LYRICS_B}], lessons:[], practices:[], assignments:[], categories:[]}), U1]);
  r2 = await listen((req, res) => {
    const k = decodeURIComponent(req.url.replace(/^\/vocalzip-media\//, ''));
    if (!/^AWS4-HMAC-SHA256 Credential=test-key\//.test(req.headers.authorization || '') || !files.has(k)) { res.writeHead(files.has(k) ? 403 : 404); return res.end(); }
    res.writeHead(200, {'content-type':'application/octet-stream'}); res.end(files.get(k));
  });
  stt = await listen((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      sttCalls++;
      const body = Buffer.concat(chunks).toString('latin1');
      if (!body.includes('gpt-4o-mini-transcribe') || !body.includes('RIFF') || req.headers.authorization !== 'Bearer test-openai') { res.writeHead(400); return res.end('{}'); }
      res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({text:sttText.get('queue')?.shift() ?? ''}));
    });
  });
  Object.assign(process.env, {R2_ENDPOINT:'http://127.0.0.1:' + r2.address().port, R2_ACCESS_KEY_ID:'test-key', R2_SECRET_ACCESS_KEY:'test-secret', OPENAI_API_KEY:'test-openai', OPENAI_BASE:'http://127.0.0.1:' + stt.address().port});
});
after(async () => {
  if (skip) return;
  r2?.close(); stt?.close(); await db?.end();
  await admin.query('drop database if exists ' + dbName); await admin.end();
});

test('Uploads keep free measurements and cached candidates, never pay or auto-assign', {skip}, async () => {
  const sung = wav({}), mr = wav({withVoice:false});
  files.set(key(U1, 'a1', 'm4a'), m4a(sung));               // real AAC in M4A, as from Voice Memos
  files.set(key(U1, 'a2', 'wav'), sung);
  files.set(key(U1, 'a3', 'wav'), sung);
  files.set(key(U1, 'a4', 'wav'), mr);
  files.set(key(U1, 'a5', 'wav'), sung);
  files.set(key(U1, 'a6', 'wav'), sung);
  sttText.set('queue', [
    'this is the moment this is the day when I send all my doubts away',   // a1 → clearly s1
    'la la la oh yeah baby tonight'                                         // a2 → no clear match
  ]);
  await media('a1', {name:'11-5 #3', storageProvider:'r2', r2Key:key(U1, 'a1', 'm4a'), review:'좋았음'});
  await media('a2', {name:'메모 2', storageProvider:'r2', r2Key:key(U1, 'a2', 'wav')});
  await media('a3', {name:'지정됨', storageProvider:'r2', r2Key:key(U1, 'a3', 'wav'), songId:'s2', song:'Defying Gravity'});
  await media('a4', {name:'반주만', storageProvider:'r2', r2Key:key(U1, 'a4', 'wav')});
  await media('a5', {name:'사용자가 곧 지정', storageProvider:'r2', r2Key:key(U1, 'a5', 'wav')});
  await media('a6', {name:'이미 받아쓴 파일', storageProvider:'r2', r2Key:key(U1, 'a6', 'wav')});
  await db.query("insert into public.vocal_song_texts (user_id, kind, record_id, transcript, source) values ($1, 'recognition', 'a6', 'something has changed within me something is not the same I am through with playing by the rules', 'stt')", [U1]);
  // The trigger queued the work: measurements for all, song identification only where no song is set.
  assert.deepEqual(Object.keys(await jobs('a3')).sort(), ['vocal']);
  assert.deepEqual(Object.keys(await jobs('a1')).sort(), ['song', 'vocal']);
  // The user picks a song for a5 before the server gets to it.
  await db.query("update public.vocal_media set metadata = metadata || '{\"songId\":\"s2\",\"song\":\"Defying Gravity\"}' where id = 'a5'");

  // Existing text can be reused; neither an upload nor an API key authorizes new paid inference.
  for (const [id, text] of [['a1', 'this is the moment this is the day when I send all my doubts away'], ['a2', 'la la la oh yeah baby tonight']])
    await db.query("insert into public.vocal_song_texts (user_id, kind, record_id, transcript, source) values ($1, 'recognition', $2, $3, 'stt')", [U1, id, text]);
  const stats = await work();
  const broken = (await db.query("select media_id, kind, last_error from public.vocal_analysis_jobs where status in ('failed', 'queued')")).rows;
  assert.deepEqual(broken, []);
  assert.equal(stats.failed, 0);
  const a1 = await row('a1'), j1 = await jobs('a1');
  assert.equal(a1.songId, undefined); assert.equal(a1.song, undefined); assert.equal(a1.songSource, undefined);
  assert.equal(a1.review, '좋았음'); assert.equal(a1.name, '11-5 #3');                     // other fields untouched
  assert.equal(a1.analysis.v, 2); assert.equal(a1.analysis.by, 'server');
  assert.deepEqual([a1.analysis.metrics.range.low, a1.analysis.metrics.range.high], ['A3', 'C5']);  // decoded from AAC
  assert.equal(j1.song.status, 'review'); assert.equal(j1.song.result.requiresApproval, true); assert.equal(j1.song.result.top3[0].songId, 's1'); assert.equal(Number(j1.song.cost_usd), 0);
  const j2 = await jobs('a2');
  assert.equal(j2.song.status, 'review'); assert.equal((await row('a2')).songId, undefined);   // stays unsorted, top 3 kept
  assert.equal(j2.song.result.top3.length, 2); assert.ok(j2.song.result.top3[0].title);
  assert.equal((await jobs('a3')).vocal.status, 'done');
  const j4 = await jobs('a4');
  assert.equal(j4.song.status, 'review'); assert.equal(j4.song.result.requiresRequest, true);  // nothing paid for an MR-only take
  assert.equal((await row('a4')).analysis.metrics.voicedSeconds, 0);
  const j5 = await jobs('a5'), a5 = await row('a5');
  assert.equal(j5.song.status, 'skipped'); assert.equal(a5.songId, 's2'); assert.equal(a5.songSource, undefined); // the user's choice stands
  const a6 = await row('a6');
  assert.equal(a6.songId, undefined); assert.equal((await jobs('a6')).song.result.top3[0].songId, 's2'); assert.equal(Number((await jobs('a6')).song.cost_usd), 0);       // saved transcript reused, not paid
  assert.equal(sttCalls, 0);                                                                       // no upload authorizes paid inference
  const {rows:[q]} = await db.query('select used_total from public.vzip_song_stt_quota where user_id = $1', [U1]);
  assert.equal(q, undefined);                                                                   // no quota row is created by automatic work
  const {rows:[saved]} = await db.query("select count(*)::int n from public.vocal_song_texts where user_id = $1 and kind = 'recognition'", [U1]);
  assert.equal(saved.n, 3);

  // A second run finds nothing to do: no duplicate analysis, no second charge.
  const again = await work();
  assert.deepEqual([again.done, again.review, again.skipped], [0, 0, 0]);
  assert.equal(sttCalls, 0);
  // Existing recordings can be queued by their owner only (RLS-style function).
  await media('b1', {name:'old', storageProvider:'r2', r2Key:key(U1, 'b1', 'wav'), analysis:{v:1}, songId:'s1'});
  await db.query('begin'); await db.query('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [U2]);
  const {rows:[other]} = await db.query('select public.vzip_enqueue_my_media() as n'); await db.query('rollback');
  assert.equal(other.n, 0);
});

test('A file that cannot be read is retried and then marked failed; a paid transcript survives a later failure', {skip}, async () => {
  await media('x1', {name:'사라진 파일', storageProvider:'r2', r2Key:key(U1, 'x1', 'wav')});
  // A failed job waits 30 minutes before the next try (not retried inside the same run).
  await work();
  assert.equal((await jobs('x1')).vocal.attempts, 1);
  await work();
  assert.equal((await jobs('x1')).vocal.attempts, 1, 'not retried while waiting');
  for (let i = 0; i < 2; i++) { await db.query("update public.vocal_analysis_jobs set locked_at = now() - interval '31 minutes' where media_id = 'x1'"); await work(); }
  const x = await jobs('x1');
  assert.equal(x.vocal.status, 'failed'); assert.equal(x.vocal.attempts, 3); assert.match(x.vocal.last_error, /download failed \(404\)/);
  assert.equal(x.song.status, 'review'); assert.equal(x.song.result.requiresRequest, true);
  // A song job that already paid for its transcript (earlier attempt) uses it instead of paying again.
  files.set(key(U1, 'y1', 'wav'), wav({}));
  await media('y1', {name:'재시도', storageProvider:'r2', r2Key:key(U1, 'y1', 'wav')});
  await db.query("update public.vocal_analysis_jobs set result = jsonb_build_object('transcript', 'this is the moment this is the day when I send all my doubts away'), attempts = 1 where media_id = 'y1' and kind = 'song'");
  const before = sttCalls; await work();
  assert.equal(sttCalls, before); assert.equal((await row('y1')).songId, undefined); assert.equal((await jobs('y1')).song.result.top3[0].songId, 's1');
  // Nothing an app user can do changes jobs: no insert/update rights, and only own rows are visible.
  await db.query('begin'); await db.query('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [U2]);
  const {rows:[seen]} = await db.query('select count(*)::int n from public.vocal_analysis_jobs');
  await assert.rejects(db.query("update public.vocal_analysis_jobs set status = 'done'"), /permission denied/);
  await db.query('rollback');
  assert.equal(seen.n, 0);
  await db.query('begin'); await db.query('set local role authenticated');
  await assert.rejects(db.query("select * from public.vzip_claim_analysis_jobs('x', 5)"), /permission denied/);
  await db.query('rollback');
});

test('100 uploads, two workers at once: measurements once, paid API calls and assignments zero', {skip}, async () => {
  const take = wav({}), user = '33333333-3333-4333-8333-333333333333';
  await db.query("insert into public.vocal_data (user_id, payload) values ($1, $2) on conflict (user_id) do update set payload = excluded.payload", [user, JSON.stringify({songs:[{id:'s1', title:'This Is the Moment', lyrics:LYRICS_A}, {id:'s2', title:'Defying Gravity', lyrics:LYRICS_B}]})]);
  for (let i = 0; i < 100; i++) { files.set(key(user, 'h' + i, 'wav'), take); await media('h' + i, {name:'take ' + i, storageProvider:'r2', r2Key:key(user, 'h' + i, 'wav')}, user); }
  sttText.set('queue', Array.from({length:200}, () => 'this is the moment this is the day when I send all my doubts away'));
  const before = sttCalls, {run} = await import('../worker/analysis-worker.mjs');
  const second = new pg.Client({connectionString:DB.replace(/\/[^/]*$/, '/' + dbName)}); await second.connect();
  try { await Promise.all([run({db, worker:'w1', log:() => {}}), run({db:second, worker:'w2', log:() => {}})]); } finally { await second.end(); }
  const {rows} = await db.query("select kind, status, count(*)::int n, sum(attempts)::int tries from public.vocal_analysis_jobs where user_id = $1 group by kind, status order by kind", [user]);
  assert.deepEqual(rows, [{kind:'song', status:'review', n:100, tries:100}, {kind:'vocal', status:'done', n:100, tries:100}]);
  assert.equal(sttCalls - before, 0);                                                   // API key presence does not authorize spending
  const {rows:[q]} = await db.query('select used_total from public.vzip_song_stt_quota where user_id = $1', [user]);
  assert.equal(q, undefined);
  const {rows:[m]} = await db.query("select count(*) filter (where metadata ->> 'songId' = 's1')::int sorted, count(*) filter (where metadata -> 'analysis' ->> 'v' = '2')::int measured from public.vocal_media where user_id = $1", [user]);
  assert.deepEqual(m, {sorted:0, measured:100});
  const {rows:[c]} = await db.query('select sum(cost_usd)::float cost from public.vocal_analysis_jobs where user_id = $1', [user]);
  assert.equal(Number(c.cost), 0);                                     // automatic work incurred no STT cost
});

test('The same problem for every file stops the run early and keeps the untried files queued', {skip}, async () => {
  const user = '22222222-2222-4222-8222-222222222222';
  for (let i = 0; i < 15; i++) await media('bad' + i, {name:'x', storageProvider:'r2', r2Key:key(user, 'bad' + i, 'wav'), songId:'s1', analysis:undefined}, user); // no such files in R2
  const stats = await work();
  assert.equal(stats.stopped, true); assert.equal(stats.retry, 8);
  assert.deepEqual(Object.keys(stats.errors), ['download failed (404)']);
  const {rows} = await db.query("select status, attempts, count(*)::int n from public.vocal_analysis_jobs where user_id = $1 group by 1, 2 order by 1, 2", [user]);
  assert.deepEqual(rows, [{status:'queued', attempts:0, n:7}, {status:'running', attempts:1, n:8}]); // 7 untouched, 8 waiting to retry
});

test('An unreachable R2 address is recorded as a network error with its cause', {skip}, async () => {
  const keep = process.env.R2_ENDPOINT;
  process.env.R2_ENDPOINT = 'http://127.0.0.1:59999'; // nothing listens there
  try {
    await media('net1', {name:'x', storageProvider:'r2', r2Key:key(U1, 'net1', 'wav'), songId:'s1'});
    await work();
    assert.equal((await jobs('net1')).vocal.last_error, 'download network error: connection refused');
  } finally { process.env.R2_ENDPOINT = keep; }
});

test('Older Supabase Storage files without the service key are set aside (no attempt used, run continues to R2 files)', {skip}, async () => {
  const user = '22222222-2222-4222-8222-222222222222';
  await db.query("update public.vocal_analysis_jobs set status = 'done' where user_id = $1", [user]); // earlier test's jobs out of the way
  await media('old1', {name:'x', path:user + '/old1.wav', songId:'s1'}, user);
  files.set(key(user, 'new1', 'wav'), wav({}));
  await media('new1', {name:'y', storageProvider:'r2', r2Key:key(user, 'new1', 'wav'), songId:'s1'}, user);
  const keep = process.env.WORKER_MAX_JOBS; process.env.WORKER_MAX_JOBS = '1';
  try { const stats = await work(); assert.equal(stats.setup, 1); assert.equal(stats.done, 1); }
  finally { if (keep == null) delete process.env.WORKER_MAX_JOBS; else process.env.WORKER_MAX_JOBS = keep; }
  const o = (await jobs('old1')).vocal, n = (await jobs('new1')).vocal;
  assert.deepEqual([o.status, o.attempts, o.last_error], ['failed', 0, 'needs SUPABASE_SERVICE_ROLE_KEY (older Supabase Storage file)']);
  assert.equal(n.status, 'done');
});

test('Uncached jobs never contact speech recognition even when an API key is configured', {skip}, async () => {
  const keep = process.env.OPENAI_BASE, user = '22222222-2222-4222-8222-222222222222';
  await db.query("insert into public.vocal_data (user_id, payload) values ($1, $2) on conflict (user_id) do update set payload = excluded.payload", [user, JSON.stringify({songs:[{id:'s1', title:'This Is the Moment', lyrics:LYRICS_A}]})]);
  files.set(key(user, 'sttnet', 'wav'), wav({}));
  await media('sttnet', {name:'x', storageProvider:'r2', r2Key:key(user, 'sttnet', 'wav'), analysis:{v:1}}, user);
  process.env.OPENAI_BASE = 'http://127.0.0.1:59998';
  try { await work(); } finally { process.env.OPENAI_BASE = keep; }
  const j = (await jobs('sttnet')).song;
  assert.equal(j.last_error, null); assert.equal(j.status, 'review'); assert.equal(j.result.requiresRequest, true); assert.equal(Number(j.cost_usd), 0);
});

test('"곡 확인 필요" is matched again only after lyrics change: no new STT charge, no-singing files left alone', {skip}, async () => {
  const LYRICS_C = 'Moonlight on the water silver on the sea I can hear you calling softly back to me hold me till the morning let the night be long';
  const recheck = async (force = false) => (await db.query('select public.vzip_recheck_review_jobs($1) as n', [force])).rows[0].n;
  const age = () => db.query("update public.vocal_analysis_jobs set updated_at = now() - interval '1 hour' where kind = 'song' and status = 'review'");
  files.set(key(U1, 'rc1', 'wav'), wav({}));
  files.set(key(U1, 'rc2', 'wav'), wav({withVoice:false}));
  await media('rc1', {name:'아직 모르는 곡', storageProvider:'r2', r2Key:key(U1, 'rc1', 'wav'), analysis:{v:1}});
  await media('rc2', {name:'반주만', storageProvider:'r2', r2Key:key(U1, 'rc2', 'wav'), analysis:{v:1}});
  await db.query("insert into public.vocal_song_texts (user_id, kind, record_id, transcript, source) values ($1, 'recognition', 'rc1', 'moonlight on the water silver on the sea I can hear you calling softly', 'stt')", [U1]);
  await work();
  assert.equal((await jobs('rc1')).song.status, 'review');
  assert.equal((await jobs('rc2')).song.status, 'review');
  assert.equal((await jobs('rc2')).song.result.requiresRequest, true);
  // Legacy no-singing jobs still remain excluded by the unchanged recheck SQL.
  await db.query("update public.vocal_analysis_jobs set result = jsonb_build_object('reason', 'no singing found') where media_id = 'rc2' and kind = 'song'");
  const sig = (await db.query("select refs_sig from public.vocal_analysis_jobs where media_id = 'rc1' and kind = 'song'")).rows[0].refs_sig;
  assert.match(sig, /^[0-9a-f]{32}$/, 'the worker remembers what it compared with');

  // Nothing changed: nothing is queued again, however long it waits.
  await age();
  assert.equal(await recheck(), 0);
  // New lyrics, but just now edited jobs rest first (30 minutes).
  const {rows:[d]} = await db.query('select payload from public.vocal_data where user_id = $1', [U1]);
  d.payload.songs.push({id:'s3', title:'Moonlight', lyrics:LYRICS_C});
  await db.query('update public.vocal_data set payload = $2 where user_id = $1', [U1, JSON.stringify(d.payload)]);
  await db.query("update public.vocal_analysis_jobs set updated_at = now() where media_id = 'rc1' and kind = 'song'");
  const before = await recheck();
  assert.equal((await jobs('rc1')).song.status, 'review', 'rested less than 30 minutes');
  await age();
  assert.ok(await recheck() + before >= 1);
  assert.equal((await jobs('rc1')).song.status, 'queued');
  assert.equal((await jobs('rc2')).song.status, 'review', 'no singing: the audio has not changed, so neither would the answer');

  const paid = sttCalls, apiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try { await work(); } finally { process.env.OPENAI_API_KEY = apiKey; }
  assert.equal(sttCalls, paid, 'the saved transcript is reused');
  const after = await jobs('rc1');
  assert.equal(after.song.status, 'review');
  assert.equal(after.song.result.requiresApproval, true);
  assert.equal(after.song.result.top3[0].songId, 's3');
  assert.equal((await row('rc1')).songId, undefined);
  assert.equal((await db.query("select rechecks from public.vocal_analysis_jobs where media_id = 'rc1' and kind = 'song'")).rows[0].rechecks, 1);

  // A recording the user sorted meanwhile is never queued again; force re-queues the rest once.
  await age();
  assert.equal(await recheck(), 0, 'fingerprints are current again');
  const forced = await recheck(true);
  assert.ok(forced >= 0);
  assert.equal((await jobs('rc2')).song.status, 'review');
  // The app cannot call either function.
  const {rows:[perm]} = await db.query("select has_function_privilege('authenticated', 'public.vzip_recheck_review_jobs(boolean, integer)', 'execute') as r, has_function_privilege('authenticated', 'public.vzip_song_refs_sig(uuid)', 'execute') as s");
  assert.deepEqual(perm, {r:false, s:false});
  await db.query("update public.vocal_analysis_jobs set status = 'review', locked_at = null, locked_by = null where status = 'queued' and kind = 'song'");
});
test('A recording sung in the Korean translation is matched through it; adding a translation re-queues review jobs once (no STT)', {skip}, async () => {
  const recheck = async () => (await db.query('select public.vzip_recheck_review_jobs(false) as n')).rows[0].n;
  const age = () => db.query("update public.vocal_analysis_jobs set updated_at = now() - interval '1 hour' where kind = 'song' and status = 'review'");
  const sig = async () => (await db.query('select public.vzip_song_refs_sig($1) as s', [U1])).rows[0].s;
  const songs = async edit => { const {rows:[d]} = await db.query('select payload from public.vocal_data where user_id = $1', [U1]); edit(d.payload.songs); await db.query('update public.vocal_data set payload = $2 where user_id = $1', [U1, JSON.stringify(d.payload)]); };
  const KO = '지금 이 순간 지금 여기 간절히 바라고 원했던 이 순간 나만의 꿈이 나만의 소원 이뤄질지 몰라 여기 바로 오늘';
  await songs(list => list.push({id:'s4', title:'지금 이 순간', lyrics:'This is the moment this is the day when I send all my doubts away'}));
  files.set(key(U1, 'kt1', 'wav'), wav({}));
  await media('kt1', {name:'한국어 공연', storageProvider:'r2', r2Key:key(U1, 'kt1', 'wav'), analysis:{v:1}});
  await db.query("insert into public.vocal_song_texts (user_id, kind, record_id, transcript, source) values ($1, 'recognition', 'kt1', '지금 이 순간 지금 여기 간절히 바라고 원했던 이 순간 나만의 꿈이', 'stt')", [U1]);
  await work();
  assert.notEqual((await jobs('kt1')).song.result.top3?.[0]?.songId, 's4', 'English original only: no match yet');

  // A translation under 12 characters is not compared, so nothing changes; a real one changes the fingerprint.
  const plain = await sig();
  await songs(list => { list.find(x => x.id === 's4').translation = '짧은 번역'; });
  assert.equal(await sig(), plain);
  await songs(list => { list.find(x => x.id === 's4').translation = KO; });
  assert.notEqual(await sig(), plain);

  await age();
  assert.ok(await recheck() >= 1);
  assert.equal((await jobs('kt1')).song.status, 'queued');
  const paid = sttCalls; await work();
  assert.equal(sttCalls, paid, 'the saved transcript is reused');
  const after = await jobs('kt1');
  assert.equal(after.song.status, 'review');
  assert.equal(after.song.result.top3[0].songId, 's4');
  assert.equal(after.song.result.top3.filter(m => m.songId === 's4').length, 1, 'listed once though it has two texts');
  assert.equal(after.song.result.requiresApproval, true);
  assert.equal((await row('kt1')).songId, undefined, 'never assigned without the user');
  await songs(list => list.splice(list.findIndex(x => x.id === 's4'), 1));
});

test('Supabase wakes the GitHub worker only when recordings wait, no worker is busy and none was just started', {skip}, async () => {
  // Stand-ins for Supabase's pg_net and Vault (plain Postgres has neither).
  await db.query(`create schema if not exists vault; create schema if not exists net;
    create table if not exists net.calls (id bigserial primary key, url text, body jsonb, headers jsonb);
    create table if not exists net._http_response (id bigint, status_code int, content text, error_msg text);
    create or replace function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as $f$ insert into net.calls (url, body, headers) values (url, body, headers) returning id $f$;
    create table if not exists vault.stub (name text, decrypted_secret text);
    create or replace view vault.decrypted_secrets as select * from vault.stub;`);
  await db.query("update public.vocal_analysis_jobs set status = 'done', locked_at = null, locked_by = null");
  const wake = async () => (await db.query('select public.vzip_wake_worker() as r')).rows[0].r;
  const calls = async () => (await db.query('select * from net.calls order by id')).rows;
  assert.equal(await wake(), 'idle');
  await media('wake-1', {name:'새 녹음', r2Key:'u/' + U1 + '/wake-1/original.wav', type:'audio/wav'});
  assert.equal(await wake(), 'no github_actions_token in Vault');
  assert.equal((await calls()).length, 0);
  await db.query("insert into vault.stub values ('github_actions_token', 'gh-test-token')");
  assert.match(await wake(), /^started \(\d+ waiting\)$/);
  const [call] = await calls();
  assert.equal(call.url, 'https://api.github.com/repos/eye215/Vocalzip/actions/workflows/analysis-worker.yml/dispatches');
  assert.deepEqual(call.body, {ref:'main'});
  assert.equal(call.headers.Authorization, 'Bearer gh-test-token');
  assert.equal(await wake(), 'recently started'); // no second request within 15 minutes
  await db.query("update public.vzip_worker_wake set last_at = now() - interval '20 minutes'");
  await db.query("update public.vocal_analysis_jobs set status = 'running', locked_at = now(), locked_by = 'gh-run' where media_id = 'wake-1' and kind = 'vocal'");
  assert.equal(await wake(), 'busy'); // a worker is on it
  await db.query("update public.vocal_analysis_jobs set locked_by = 'retry-wait' where media_id = 'wake-1' and kind = 'vocal'");
  assert.match(await wake(), /^started/); // a file waiting to retry is not a busy worker
  assert.equal((await calls()).length, 2);
  // The status shows GitHub's answer for the last request.
  await db.query('insert into net._http_response (id, status_code) select last_request, 204 from public.vzip_worker_wake');
  const {rows:[st]} = await db.query('select * from public.vzip_wake_worker_status()');
  assert.equal(st.github_status, 204);
  assert.match(st.last_result, /^started/);
  // The app's roles cannot call it or read the table.
  const {rows:[perm]} = await db.query("select has_function_privilege('authenticated', 'public.vzip_wake_worker(boolean)', 'execute') as f, has_table_privilege('authenticated', 'public.vzip_worker_wake', 'select') as t");
  assert.deepEqual(perm, {f:false, t:false});
});
