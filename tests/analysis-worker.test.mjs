// Server analysis worker against a real Postgres (the CI database job, or VZ_TEST_DB locally), real ffmpeg
// decoding, and local stand-ins for Cloudflare R2 and the STT API. Checks the queue, song auto-assignment,
// protection of user edits, no double STT charge, retries and failure.
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
test('Auto-assign only on a clearly strong, well-separated match with enough words', () => {
  const strong = {candidate:'s1', matches:[{songId:'s1', score:0.62}, {songId:'s2', score:0.08}]};
  assert.equal(decide('this is the moment this is the day when I send', strong).auto, true);
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
    'supabase/migrations/20261106_vzip_song_stt_quota.sql', 'supabase/migrations/20261108_vzip_song_stt_no_limit_usage.sql', 'supabase/migrations/20261109_server_analysis_jobs.sql'])
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

test('Uploads are queued by the database and worked on without any app: songs sorted, measurements saved, user edits kept, STT paid once', {skip}, async () => {
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

  const stats = await work();
  const broken = (await db.query("select media_id, kind, last_error from public.vocal_analysis_jobs where status in ('failed', 'queued')")).rows;
  assert.deepEqual(broken, []);
  assert.equal(stats.failed, 0);
  const a1 = await row('a1'), j1 = await jobs('a1');
  assert.equal(a1.songId, 's1'); assert.equal(a1.song, 'This Is the Moment'); assert.equal(a1.songSource, 'ai');
  assert.equal(a1.review, '좋았음'); assert.equal(a1.name, '11-5 #3');                     // other fields untouched
  assert.equal(a1.analysis.v, 1); assert.equal(a1.analysis.by, 'server');
  assert.deepEqual([a1.analysis.metrics.range.low, a1.analysis.metrics.range.high], ['A3', 'C5']);  // decoded from AAC
  assert.equal(j1.song.status, 'done'); assert.equal(j1.song.result.auto, true); assert.equal(Number(j1.song.cost_usd), 0.0015);
  const j2 = await jobs('a2');
  assert.equal(j2.song.status, 'review'); assert.equal((await row('a2')).songId, undefined);   // stays unsorted, top 3 kept
  assert.equal(j2.song.result.top3.length, 2); assert.ok(j2.song.result.top3[0].title);
  assert.equal((await jobs('a3')).vocal.status, 'done');
  const j4 = await jobs('a4');
  assert.equal(j4.song.status, 'review'); assert.equal(j4.song.result.reason, 'no singing found');  // nothing paid for an MR-only take
  assert.equal((await row('a4')).analysis.metrics.voicedSeconds, 0);
  const j5 = await jobs('a5'), a5 = await row('a5');
  assert.equal(j5.song.status, 'skipped'); assert.equal(a5.songId, 's2'); assert.equal(a5.songSource, undefined); // the user's choice stands
  const a6 = await row('a6');
  assert.equal(a6.songId, 's2'); assert.equal(Number((await jobs('a6')).song.cost_usd), 0);       // saved transcript reused, not paid
  assert.equal(sttCalls, 2);                                                                       // a1 and a2 only
  const {rows:[q]} = await db.query('select used_total from public.vzip_song_stt_quota where user_id = $1', [U1]);
  assert.equal(q.used_total, 2);                                                                   // counted with the app's spend display
  const {rows:[saved]} = await db.query("select count(*)::int n from public.vocal_song_texts where user_id = $1 and kind = 'recognition'", [U1]);
  assert.equal(saved.n, 3);

  // A second run finds nothing to do: no duplicate analysis, no second charge.
  const again = await work();
  assert.deepEqual([again.done, again.review, again.skipped], [0, 0, 0]);
  assert.equal(sttCalls, 2);
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
  assert.equal(x.song.status, 'failed');
  // A song job that already paid for its transcript (earlier attempt) uses it instead of paying again.
  files.set(key(U1, 'y1', 'wav'), wav({}));
  await media('y1', {name:'재시도', storageProvider:'r2', r2Key:key(U1, 'y1', 'wav')});
  await db.query("update public.vocal_analysis_jobs set result = jsonb_build_object('transcript', 'this is the moment this is the day when I send all my doubts away'), attempts = 1 where media_id = 'y1' and kind = 'song'");
  const before = sttCalls; await work();
  assert.equal(sttCalls, before); assert.equal((await row('y1')).songId, 's1');
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

test('100 uploads, two workers at once: every recording done exactly once, one paid transcription each', {skip}, async () => {
  const take = wav({}), user = '33333333-3333-4333-8333-333333333333';
  await db.query("insert into public.vocal_data (user_id, payload) values ($1, $2) on conflict (user_id) do update set payload = excluded.payload", [user, JSON.stringify({songs:[{id:'s1', title:'This Is the Moment', lyrics:LYRICS_A}, {id:'s2', title:'Defying Gravity', lyrics:LYRICS_B}]})]);
  for (let i = 0; i < 100; i++) { files.set(key(user, 'h' + i, 'wav'), take); await media('h' + i, {name:'take ' + i, storageProvider:'r2', r2Key:key(user, 'h' + i, 'wav')}, user); }
  sttText.set('queue', Array.from({length:200}, () => 'this is the moment this is the day when I send all my doubts away'));
  const before = sttCalls, {run} = await import('../worker/analysis-worker.mjs');
  const second = new pg.Client({connectionString:DB.replace(/\/[^/]*$/, '/' + dbName)}); await second.connect();
  try { await Promise.all([run({db, worker:'w1', log:() => {}}), run({db:second, worker:'w2', log:() => {}})]); } finally { await second.end(); }
  const {rows} = await db.query("select kind, status, count(*)::int n, sum(attempts)::int tries from public.vocal_analysis_jobs where user_id = $1 group by kind, status order by kind", [user]);
  assert.deepEqual(rows, [{kind:'song', status:'done', n:100, tries:100}, {kind:'vocal', status:'done', n:100, tries:100}]);
  assert.equal(sttCalls - before, 100);                                                   // one paid call per recording
  const {rows:[q]} = await db.query('select used_total from public.vzip_song_stt_quota where user_id = $1', [user]);
  assert.equal(q.used_total, 100);
  const {rows:[m]} = await db.query("select count(*) filter (where metadata ->> 'songId' = 's1')::int sorted, count(*) filter (where metadata -> 'analysis' ->> 'v' = '1')::int measured from public.vocal_media where user_id = $1", [user]);
  assert.deepEqual(m, {sorted:100, measured:100});
  const {rows:[c]} = await db.query('select sum(cost_usd)::float cost from public.vocal_analysis_jobs where user_id = $1', [user]);
  assert.equal(Math.round(c.cost * 1e4) / 1e4, 0.15);                                     // cost tracked per job
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
