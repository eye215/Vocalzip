// Server analysis worker against a real Postgres (the CI database job, or VZ_TEST_DB locally), real ffmpeg
// decoding, and local stand-ins for Cloudflare R2 and the STT API. Checks zero automatic paid calls without the
// budget migration, approval-only candidates, protection of user edits, retries and failure; then, with the
// migration (20261115), automatic STT within the monthly cap: reservation, per-run limit, category rules.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import pg from 'pg';
import {signV4, decide, AUTO, describeDbUrl, r2Endpoint, describeSecret, networkCause, recordingCategory, CAP_REASON, COST_PER_CLIP_USD} from '../worker/analysis-worker.mjs';

const require = createRequire(import.meta.url);
const {synth} = require('./synth-vocal.cjs');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const LYRICS_A = 'There is a moment when the world stands still and every dream I ever had comes rushing in like morning light across the hills I will not wait another day this is the moment this is the day when I send all my doubts away';
const LYRICS_B = 'Something has changed within me something is not the same I am through with playing by the rules of someone elses game too late for second guessing too late to go back to sleep';

test('Held-result reanalysis accepts only current, readable, unprocessed recordings', async () => {
  const {unreliableCandidate, UNRELIABLE_CAMPAIGN} = await import('../worker/analysis-worker.mjs');
  const analysis = {v:2, at:123, metrics:{phrases:null, voicedSeconds:20}, confidence:{pitchConfidence:0.4}};
  const row = {user_id:U1, metadata:{type:'audio/wav', storageProvider:'r2', r2Key:'u/' + U1 + '/a.wav', analysis}};
  assert.equal(unreliableCandidate(row), true);
  const withMeta = patch => ({...row, metadata:{...row.metadata, ...patch}});
  assert.equal(unreliableCandidate(withMeta({analysis:{...analysis, confidence:{pitchConfidence:0.9}}})), false);
  assert.equal(unreliableCandidate(withMeta({analysis:{...analysis, v:1}})), false);
  assert.equal(unreliableCandidate(withMeta({analysis:{...analysis, scope:{unreliableReanalysis:UNRELIABLE_CAMPAIGN}}})), false);
  assert.equal(unreliableCandidate(withMeta({r2Key:'u/' + U2 + '/a.wav'})), false);
  assert.equal(unreliableCandidate(withMeta({r2Key:''})), false);
  assert.equal(unreliableCandidate(withMeta({type:'application/pdf'})), false);
  assert.equal(unreliableCandidate(withMeta({deleted:true})), false);
  assert.equal(unreliableCandidate(withMeta({analysis:{...analysis, scope:{separationWanted:true}}})), false);
  assert.equal(unreliableCandidate(withMeta({storageProvider:'supabase', path:U1 + '/a.wav'})), true);
  assert.equal(unreliableCandidate(withMeta({storageProvider:'supabase', storageVersion:2, parts:[{path:U1 + '/1'}, {path:U2 + '/2'}]})), false);
});

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

test('Recording purpose follows the app rule: only song recordings get automatic STT', () => {
  const owned = {lessons:[{id:'L1', recordings:[{id:'in-lesson'}]}], practices:[{id:'P1', mediaIds:['in-room'], practiceRoom:true}, {id:'P2', mediaIds:['in-training'], practiceMode:'training'}, {id:'P3', mediaIds:['in-practice']}]};
  assert.equal(recordingCategory({}, 'plain', owned), 'song');                         // untagged, unlinked: a song take
  for (const c of ['song', 'lesson', 'training', 'room']) assert.equal(recordingCategory({recordingCategory:c}, 'in-lesson', owned), c, 'explicit choice wins');
  assert.equal(recordingCategory({source:'practice-room'}, 'x', owned), 'room');
  assert.equal(recordingCategory({source:'practice'}, 'abcd1234-ef-1', owned), 'room');
  assert.equal(recordingCategory({}, 'in-lesson', owned), 'lesson');
  assert.equal(recordingCategory({source:'lesson'}, 'x', owned), 'lesson');
  assert.equal(recordingCategory({occasion:'lesson'}, 'x', owned), 'lesson');
  assert.equal(recordingCategory({occasion:'performance'}, 'in-lesson', owned), 'song');  // the user's occasion wins over the link
  assert.equal(recordingCategory({}, 'in-room', owned), 'room');
  assert.equal(recordingCategory({}, 'in-training', owned), 'training');
  assert.equal(recordingCategory({}, 'in-practice', owned), 'song');
  assert.equal(recordingCategory({recordingCategory:'other'}, 'plain'), 'song');
});

const DB = process.env.VZ_TEST_DB;
const skip = !DB || spawnSync('ffmpeg', ['-version']).status !== 0 ? 'needs VZ_TEST_DB and ffmpeg' : false;
let admin, db, r2, stt, files = new Map(), sttCalls = 0, sttText = new Map(), dbName, sttDelay = 0, sttStatus = 200;
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
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
      sttCalls++;
      const body = Buffer.concat(chunks).toString('latin1');
      if (sttDelay) await new Promise(r => setTimeout(r, sttDelay));
      if (!body.includes('gpt-4o-mini-transcribe') || !body.includes('RIFF') || req.headers.authorization !== 'Bearer test-openai') { res.writeHead(400); return res.end('{}'); }
      if (sttStatus !== 200) { res.writeHead(sttStatus); return res.end('{}'); }
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

  // Existing text can be reused; without the budget migration neither an upload nor an API key authorizes new paid inference.
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

test('Older analyses (v1, or v2 without detail) are analysed again with history kept; current ones are reused', {skip}, async () => {
  const {requeueOldAnalyses, isCurrentAnalysis} = await import('../worker/analysis-worker.mjs');
  const VA = require('../app/vocal-analysis.js');
  for (const id of ['ra1', 'ra2', 'ra3']) files.set(key(U1, id, 'wav'), wav());
  await media('ra1', {name:'v1', type:'audio/wav', storageProvider:'r2', r2Key:key(U1, 'ra1', 'wav'), songId:'s1', analysis:{v:1, at:111, metrics:{voicedSeconds:20}}});
  await media('ra2', {name:'v2 old', type:'audio/wav', storageProvider:'r2', r2Key:key(U1, 'ra2', 'wav'), songId:'s1', analysis:{v:2, at:222, metrics:{voicedSeconds:20}}});
  const current = {v:VA.VERSION, at:333, metrics:{voicedSeconds:20, phrases:null, pitchBands:null}};
  await media('ra3', {name:'current', type:'audio/wav', storageProvider:'r2', r2Key:key(U1, 'ra3', 'wav'), songId:'s1', analysis:current});
  await media('ra4', {name:'score', type:'application/pdf', storageProvider:'r2', r2Key:key(U1, 'ra4', 'pdf'), analysis:{v:1}});
  assert.equal(isCurrentAnalysis(current), true); assert.equal(isCurrentAnalysis({v:2, metrics:{}}), false); assert.equal(isCurrentAnalysis({v:1, metrics:{phrases:null}}), false);
  const queued = await requeueOldAnalyses(db);
  assert.ok(queued >= 2);
  assert.equal((await jobs('ra4')).vocal, undefined, 'non-audio files are never queued');
  assert.equal((await jobs('ra3')).vocal, undefined, 'a current analysis is not queued');
  await work();
  const row = async id => (await db.query('select metadata from public.vocal_media where id = $1', [id])).rows[0].metadata;
  for (const [id, at] of [['ra1', 111], ['ra2', 222]]) {
    const a = (await row(id)).analysis;
    assert.equal(a.v, VA.VERSION); assert.ok(Object.prototype.hasOwnProperty.call(a.metrics, 'phrases'));
    assert.equal(a.history.at(-1).at, at, 'the older analysis is kept in history');
  }
  assert.deepEqual((await row('ra3')).analysis, current, 'current analysis untouched');
  assert.equal((await row('ra1')).songId, 's1', 'nothing but analysis changes');
});

test('Held-result backfill previews without writes, queues once, preserves all history, and processes current results', {skip}, async () => {
  const {requeueUnreliableAnalyses, UNRELIABLE_CAMPAIGN} = await import('../worker/analysis-worker.mjs');
  const owner = '77777777-7777-4777-8777-777777777777';
  await db.query('insert into auth.users (id) values ($1)', [owner]);
  const history = Array.from({length:7}, (_, i) => ({v:1, at:i + 1, metrics:{voicedSeconds:i}}));
  const held = {v:2, at:700, metrics:{phrases:null, voicedSeconds:20}, confidence:{pitchConfidence:0.3}, history};
  for (const id of ['held-1', 'held-2', 'held-running', 'held-changed']) {
    files.set(key(owner, id, 'wav'), wav());
    await media(id, {name:id, type:'audio/wav', songId:'s1', storageProvider:'r2', r2Key:key(owner, id, 'wav'), analysis:held}, owner);
  }
  await db.query("insert into public.vocal_analysis_jobs (user_id,media_id,kind,status) values ($1,'held-running','vocal','running')", [owner]);
  const snapshot = async () => (await db.query('select id, metadata from public.vocal_media where user_id=$1 order by id', [owner])).rows;
  const before = await snapshot();
  const preview = await requeueUnreliableAnalyses(db, {limit:500});
  assert.equal(preview.dryRun, true); assert.equal(preview.queued, 0); assert.ok(preview.eligible >= 3);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(Object.keys(await jobs('held-1')), []);
  await assert.rejects(requeueUnreliableAnalyses(db, {apply:true, limit:0}), /1 to 500/);
  const second = new pg.Client({connectionString:DB.replace(/\/[^/]*$/, '/' + dbName)});
  await second.connect();
  let applied;
  try { applied = await Promise.all([db, second].map(client => requeueUnreliableAnalyses(client, {apply:true, limit:500}))); }
  finally { await second.end(); }
  assert.ok(applied.reduce((n, c) => n + c.queued, 0) >= 3);
  assert.equal((await jobs('held-1')).vocal.status, 'queued');
  assert.equal((await jobs('held-running')).vocal.status, 'running');
  assert.deepEqual(await snapshot(), before, 'enqueue never mutates a previous analysis');
  assert.equal((await requeueUnreliableAnalyses(db, {apply:true, limit:500})).queued, 0, 'rerun does not reset pending jobs');
  // Even an edit with the same timestamp invalidates the request fingerprint.
  const edited = {...held, confidence:{pitchConfidence:0.5}};
  await db.query("update public.vocal_media set metadata=jsonb_set(metadata,'{analysis}',$1) where id='held-changed'", [JSON.stringify(edited)]);
  await work();
  assert.deepEqual((await row('held-changed')).analysis, edited);
  for (const id of ['held-1', 'held-2']) {
    const current = (await row(id)).analysis;
    assert.equal(current.scope.unreliableReanalysis, UNRELIABLE_CAMPAIGN);
    assert.equal(current.by, 'server');
    assert.deepEqual(current.history.slice(0, 7), history);
    const {history:ignored, ...old} = held;
    assert.deepEqual(current.history.at(-1), old);
    assert.equal((await jobs(id)).vocal.result.reanalyze.campaign, UNRELIABLE_CAMPAIGN);
  }
  assert.equal((await requeueUnreliableAnalyses(db, {apply:true, limit:500})).queued, 1, 'only the newly edited source is eligible again');
  assert.equal((await requeueUnreliableAnalyses(db, {apply:true, limit:500})).queued, 0);
});

test('A take whose MR drowns the voice is measured with the song\'s own MR file taken out (알고 있는 MR 빼기)', {skip}, async () => {
  // Its own account (no cached song list from earlier tests): one song with an uploaded MR file, one without.
  const U3 = '44444444-4444-4444-8444-444444444444', Y = require('./helpers/mr-synth.cjs');
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [U3]);
  const pcm = x => { let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(x[i] / peak * 0.9 * 32767), 44 + i * 2); return b; };
  const mr = Y.mr(60), take = Y.record(Y.vocal(20).x, mr, {offset:11, db:8}).x;
  files.set('u/' + U3 + '/mr-1/original.wav', pcm(mr));
  for (const id of ['mx1', 'mx2']) files.set(key(U3, id, 'wav'), pcm(take));
  await db.query('insert into public.vocal_data (user_id, payload) values ($1, $2)', [U3, JSON.stringify({songs:[
    {id:'with-mr', title:'MR 있는 곡', mrTracks:[{id:'mr-1', kind:'file', title:'연습 MR', r2Key:'u/' + U3 + '/mr-1/original.wav'}, {id:'yt', kind:'youtube', videoId:'x'}]},
    {id:'no-mr', title:'MR 없는 곡'}], lessons:[], practices:[], assignments:[], categories:[]})]);
  await media('mx1', {name:'MR 큰 녹음', type:'audio/wav', storageProvider:'r2', r2Key:key(U3, 'mx1', 'wav'), songId:'with-mr'}, U3);
  await media('mx2', {name:'MR 파일 없는 곡', type:'audio/wav', storageProvider:'r2', r2Key:key(U3, 'mx2', 'wav'), songId:'no-mr'}, U3);
  await work();
  const a1 = (await row('mx1')).analysis, a2 = (await row('mx2')).analysis;
  assert.equal(a1.confidence.mrRemoved.trackId, 'mr-1');
  assert.ok(Math.abs(a1.confidence.mrRemoved.offsetSeconds - 11) < 0.01, 'offset ' + a1.confidence.mrRemoved.offsetSeconds);
  assert.ok(a1.confidence.pitchConfidence >= 0.8, 'cleaned ' + a1.confidence.pitchConfidence);
  assert.equal(a1.voice, undefined); assert.equal(a1.by, 'server');
  assert.equal((await jobs('mx1')).vocal.result.mrRemoved, true);
  // Without an MR file the take is measured as recorded (held back by the app's confidence rule), nothing invented.
  assert.equal(a2.confidence.mrRemoved, undefined);
  assert.ok(a2.confidence.pitchConfidence < 0.8, 'as recorded ' + a2.confidence.pitchConfidence);
  assert.equal((await row('mx1')).songId, 'with-mr', 'nothing but analysis changes');
});

test('A take still held back without a song MR file is separated by AI and measured on the voice (AI 분리 후 측정)', {skip}, async () => {
  const U6 = '66666666-6666-4666-8666-666666666666', Y = require('./helpers/mr-synth.cjs'), sep = await import('../worker/separation-worker.mjs');
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [U6]);
  const pcm = x => { let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(x[i] / peak * 0.9 * 32767), 44 + i * 2); return b; };
  const voice = Y.vocal(20).x, take = Y.record(voice, Y.mr(60), {offset:4, db:8}).x;
  for (const id of ['sx1', 'sx2', 'sx3']) files.set(key(U6, id, 'wav'), pcm(take));
  await db.query('insert into public.vocal_data (user_id, payload) values ($1, $2)', [U6, JSON.stringify({songs:[{id:'yt-only', title:'유튜브 MR로 부른 곡', mrTracks:[{id:'yt', kind:'youtube', videoId:'x'}]}], lessons:[], practices:[], assignments:[], categories:[]})]);
  for (const id of ['sx1', 'sx2', 'sx3']) await media(id, {name:'MR 큰 녹음', type:'audio/wav', storageProvider:'r2', r2Key:key(U6, id, 'wav'), songId:'yt-only'}, U6);
  await work();
  const held = (await row('sx1')).analysis;
  assert.ok(held.confidence.pitchConfidence < 0.8); assert.equal(held.confidence.mrRemoved, undefined);
  assert.equal(held.scope.separationWanted, true, 'no MR file fitted: waits for AI separation');
  const rows = (await sep.waiting(db)).filter(r => r.user_id === U6);
  assert.deepEqual(rows.map(r => r.id).sort(), ['sx1', 'sx2', 'sx3']);
  // The separator (a stand-in writing the clean voice) succeeds for sx1 and fails for sx2.
  const dir = mkdtempSync(join(tmpdir(), 'vzv-')), vocals = join(dir, 'vocals.wav'); writeFileSync(vocals, pcm(voice));
  const cmd = 'node ' + ROOT + 'tests/helpers/fake-demucs.cjs';
  process.env.FAKE_VOCALS = vocals;
  assert.equal(await sep.separateOne(db, rows.find(r => r.id === 'sx1'), {cmd}), 'separated');
  process.env.FAKE_FAIL = '1';
  assert.equal(await sep.separateOne(db, rows.find(r => r.id === 'sx2'), {cmd}), 'failed');
  delete process.env.FAKE_FAIL;
  // A separation that still fails the confidence rule (here: the take comes back unchanged) is not saved.
  const same = join(dir, 'same.wav'); writeFileSync(same, pcm(take)); process.env.FAKE_VOCALS = same;
  assert.equal(await sep.separateOne(db, rows.find(r => r.id === 'sx3'), {cmd}), 'not-better');
  const a3 = (await row('sx3')).analysis;
  assert.equal(a3.confidence.aiSeparated, undefined); assert.equal(a3.scope.separationResult, 'not-better'); assert.equal(a3.at, rows.find(r => r.id === 'sx3').metadata.analysis.at);
  rmSync(dir, {recursive:true});
  const a1 = (await row('sx1')).analysis, a2 = (await row('sx2')).analysis;
  assert.deepEqual(a1.confidence.aiSeparated, {model:'htdemucs'});
  assert.ok(a1.confidence.pitchConfidence >= 0.8, 'separated ' + a1.confidence.pitchConfidence);
  assert.equal(a1.by, 'server'); assert.equal(a1.scope.separationWanted, undefined); assert.equal(a1.scope.separationResult, 'separated');
  assert.equal(a1.history.at(-1).at, held.at, 'the held-back result is kept in history');
  // A failed separation keeps the measurement as it was and is not tried again.
  assert.equal(a2.confidence.aiSeparated, undefined); assert.equal(a2.scope.separationTried, true); assert.equal(a2.scope.separationWanted, false);
  assert.deepEqual((await sep.waiting(db)).filter(r => r.user_id === U6), []);
  assert.equal((await row('sx1')).songId, 'yt-only', 'nothing but analysis changes');
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
  assert.equal(sttCalls - before, 0);                                                   // API key without the budget migration does not authorize spending
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

test('Without the budget migration, uncached jobs never contact speech recognition even when an API key is configured', {skip}, async () => {
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

/* ---------- automatic STT within the monthly cap (migration 20261115) ---------- */
const U3 = '44444444-4444-4444-8444-444444444444', U4 = '55555555-5555-4555-8555-555555555555';
const month = async () => (await db.query('select spent_usd::float spent, cap_usd::float cap, clips from public.vzip_auto_stt_month_state()')).rows[0];
const ledger = async (where = 'true') => (await db.query('select status, count(*)::int n from public.vzip_auto_stt_ledger where ' + where + ' group by status order by status')).rows;
const setCap = cap => db.query('update public.vzip_auto_stt_budget set monthly_cap_usd = $1', [cap]);
const takeOf = async (id, meta = {}, user = U1, voice = true) => { files.set(key(user, id, 'wav'), wav(voice ? {} : {withVoice:false})); await media(id, {name:'take', storageProvider:'r2', r2Key:key(user, id, 'wav'), analysis:{v:1}, ...meta}, user); };
const songUser = async user => {
  await db.query('insert into auth.users(id) values ($1) on conflict do nothing', [user]);
  await db.query("insert into public.vocal_data (user_id, payload) values ($1, $2) on conflict (user_id) do update set payload = excluded.payload", [user, JSON.stringify({songs:[{id:'s1', title:'This Is the Moment', lyrics:LYRICS_A}, {id:'s2', title:'Defying Gravity', lyrics:LYRICS_B}]})]);
};

test('With the budget migration: song recordings without a song are transcribed once; lesson / training / room and assigned ones never', {skip}, async () => {
  await db.query(readFileSync(ROOT + 'supabase/migrations/20261115_auto_stt_budget.sql', 'utf8'));
  await db.query(readFileSync(ROOT + 'supabase/migrations/20261115_auto_stt_budget.sql', 'utf8')); // safe to run again
  await db.query("update public.vocal_analysis_jobs set status = 'done', locked_at = null, locked_by = null where status in ('queued', 'running')");
  assert.deepEqual(await month(), {spent:0, cap:2, clips:0});
  const {rows:[d]} = await db.query('select payload from public.vocal_data where user_id = $1', [U1]);
  d.payload.lessons = [{id:'L1', recordings:[{id:'au-linked'}]}];
  await db.query('update public.vocal_data set payload = $2 where user_id = $1', [U1, JSON.stringify(d.payload)]);
  sttText.set('queue', ['this is the moment this is the day when I send all my doubts away']);
  await takeOf('au-song');                                        // the only one that may be paid for
  await takeOf('au-lesson', {recordingCategory:'lesson'});
  await takeOf('au-training', {recordingCategory:'training'});
  await takeOf('au-room', {recordingCategory:'room'});
  await takeOf('au-roomsrc', {source:'practice-room'});
  await takeOf('au-linked');                                       // linked to a lesson in the owner's records
  await takeOf('au-assigned', {songId:'s2', song:'Defying Gravity'});
  await takeOf('au-later');                                        // the user picks a song before the worker gets to it
  await db.query("update public.vocal_media set metadata = metadata || '{\"songId\":\"s1\"}' where id = 'au-later'");
  await takeOf('au-saved');                                        // transcribed earlier (by the app)
  await db.query("insert into public.vocal_song_texts (user_id, kind, record_id, transcript, source) values ($1, 'recognition', 'au-saved', 'something has changed within me something is not the same I am through with playing by the rules', 'stt')", [U1]);
  await takeOf('au-mr', {}, U1, false);                            // accompaniment only: no singing, nothing paid
  assert.equal((await jobs('au-assigned')).song, undefined, 'a recording with a song is never queued for song identification');

  const before = sttCalls, stats = await work();
  assert.equal(sttCalls - before, 1, 'one paid clip: au-song only');
  assert.deepEqual(stats.stt, {clips:1, usd:COST_PER_CLIP_USD, capped:false});
  const j = (await jobs('au-song')).song;
  assert.equal(j.status, 'review'); assert.equal(j.result.requiresApproval, true); assert.equal(j.result.auto, false); assert.equal(j.result.stt, 'auto');
  assert.equal(j.result.top3[0].songId, 's1'); assert.equal(Number(j.cost_usd), COST_PER_CLIP_USD);
  assert.equal((await row('au-song')).songId, undefined, 'a suggestion only: the user confirms in the app');
  const {rows:[text]} = await db.query("select source from public.vocal_song_texts where user_id = $1 and kind = 'recognition' and record_id = 'au-song'", [U1]);
  assert.equal(text.source, 'stt', 'saved so it is never paid for again and syncs to the app');
  for (const id of ['au-lesson', 'au-training', 'au-room', 'au-roomsrc', 'au-linked']) {
    const r = (await jobs(id)).song;
    assert.deepEqual([r.status, r.result.requiresRequest, r.result.reason, Number(r.cost_usd)], ['review', true, 'not a song recording', 0], id);
  }
  assert.equal((await jobs('au-later')).song.status, 'skipped');
  const saved = (await jobs('au-saved')).song;
  assert.equal(saved.result.top3[0].songId, 's2'); assert.equal(Number(saved.cost_usd), 0); assert.equal(saved.result.stt, undefined);
  assert.equal((await jobs('au-mr')).song.result.reason, 'no singing found');
  assert.deepEqual(await ledger(), [{status:'charged', n:1}]);
  assert.deepEqual(await month(), {spent:COST_PER_CLIP_USD, cap:2, clips:1});
  const {rows:[q]} = await db.query('select used_total from public.vzip_song_stt_quota where user_id = $1', [U1]);
  assert.equal(q, undefined, "the app's own STT count is not touched");

  // Matched again later (lyrics changed): the saved text is reused, never a second charge for the recording.
  await db.query("update public.vocal_analysis_jobs set status = 'queued', attempts = 0, result = null where media_id = 'au-song' and kind = 'song'");
  await work();
  assert.equal(sttCalls - before, 1);
  assert.deepEqual(await ledger(), [{status:'charged', n:1}]);
  // Even without the saved text, the ledger refuses to pay twice for the same recording.
  await db.query("delete from public.vocal_song_texts where user_id = $1 and record_id = 'au-song'", [U1]);
  await db.query("update public.vocal_analysis_jobs set status = 'queued', attempts = 0, result = null where media_id = 'au-song' and kind = 'song'");
  await work();
  assert.equal(sttCalls - before, 1);
  assert.equal((await jobs('au-song')).song.result.reason, 'already transcribed automatically');

  // The app can read the month's total, but not the ledger or the worker's functions.
  await db.query('begin'); await db.query('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub', $1, true)", [U2]);
  const {rows:[seen]} = await db.query('select spent_usd::float s, cap_usd::float c, clips from public.vzip_auto_stt_month_usage()');
  await db.query('rollback');
  assert.deepEqual(seen, {s:COST_PER_CLIP_USD, c:2, clips:1});
  const {rows:[perm]} = await db.query("select has_function_privilege('authenticated', 'public.vzip_auto_stt_reserve(bigint,numeric)', 'execute') r, has_function_privilege('authenticated', 'public.vzip_auto_stt_settle(bigint,text)', 'execute') s, has_function_privilege('authenticated', 'public.vzip_auto_stt_month_state()', 'execute') m, has_table_privilege('authenticated', 'public.vzip_auto_stt_ledger', 'select') l, has_table_privilege('authenticated', 'public.vzip_auto_stt_budget', 'update') b");
  assert.deepEqual(perm, {r:false, s:false, m:false, l:false, b:false});
});

test('At the monthly cap nothing is sent to the API; last month does not count', {skip}, async () => {
  await songUser(U3);
  // A full previous month is not this month's spend.
  await db.query("insert into public.vzip_auto_stt_ledger (month, user_id, media_id, status, amount_usd) select (date_trunc('month', timezone('utc', now())) - interval '1 month')::date, $1, 'old-' || g, 'charged', 0.05 from generate_series(1, 60) g", [U3]);
  assert.equal((await month()).spent, COST_PER_CLIP_USD);
  const {spent} = await month();
  await setCap(spent + COST_PER_CLIP_USD / 2);                    // less than one clip left
  await takeOf('cap-1', {}, U3); await takeOf('cap-2', {}, U3);
  const before = sttCalls, stats = await work();
  assert.equal(sttCalls, before, 'no API call at the cap');
  assert.equal(stats.stt.capped, true); assert.equal(stats.stt.clips, 0);
  for (const id of ['cap-1', 'cap-2']) {
    const j = (await jobs(id)).song;
    assert.deepEqual([j.status, j.result.requiresRequest, j.result.reason, Number(j.cost_usd)], ['review', true, CAP_REASON, 0]);
  }
  assert.equal((await month()).clips, 1, 'nothing reserved');
  await setCap(2);
});

test('Two workers at once never overshoot the cap: each clip is reserved in the database first', {skip}, async () => {
  // The reservation itself: a second reservation waits for the first and then sees it.
  await songUser(U4);
  await takeOf('race-a', {}, U4); await takeOf('race-b', {}, U4);
  const {spent} = await month();
  await setCap(spent + COST_PER_CLIP_USD);                        // room for exactly one clip
  const other = new pg.Client({connectionString:DB.replace(/\/[^/]*$/, '/' + dbName)}); await other.connect();
  try {
    const reserve = async (c, id) => (await c.query("select ledger_id, refused from public.vzip_auto_stt_reserve((select id from public.vocal_analysis_jobs where media_id = $1 and kind = 'song'), $2)", [id, COST_PER_CLIP_USD])).rows[0];
    await db.query('begin');
    const first = await reserve(db, 'race-a');
    const pending = reserve(other, 'race-b');                    // blocks on the budget row
    await new Promise(r => setTimeout(r, 200));
    await db.query('commit');
    const second = await pending;
    assert.ok(first.ledger_id); assert.equal(second.ledger_id, null); assert.equal(second.refused, 'cap');
    await db.query('select public.vzip_auto_stt_settle($1, $2)', [first.ledger_id, 'released']);
  } finally { await other.end(); }

  // Whole runs: two workers, eight eligible recordings, room for three clips, slow API answers.
  await db.query("update public.vocal_analysis_jobs set status = 'done' where media_id in ('race-a', 'race-b')");
  for (let i = 0; i < 8; i++) await takeOf('race' + i, {}, U4);
  const now = await month();
  await setCap(now.spent + 3 * COST_PER_CLIP_USD);
  sttText.set('queue', Array.from({length:8}, () => 'this is the moment this is the day when I send all my doubts away'));
  sttDelay = 150;
  const before = sttCalls, {run} = await import('../worker/analysis-worker.mjs');
  const second = new pg.Client({connectionString:DB.replace(/\/[^/]*$/, '/' + dbName)}); await second.connect();
  try { await Promise.all([run({db, worker:'w1', log:() => {}}), run({db:second, worker:'w2', log:() => {}})]); }
  finally { sttDelay = 0; await second.end(); }
  assert.equal(sttCalls - before, 3, 'exactly the clips that fit');
  const after = await month();
  assert.ok(after.spent <= after.cap + 1e-9); assert.equal(after.clips - now.clips, 3);
  const {rows} = await db.query("select result ->> 'reason' reason, count(*)::int n from public.vocal_analysis_jobs where user_id = $1 and kind = 'song' and media_id like 'race_' group by 1 order by 1", [U4]);
  assert.deepEqual(rows, [{reason:CAP_REASON, n:5}, {reason:null, n:3}]);
  await setCap(2);
});

test('At most the per-run limit is paid in one run; the rest wait queued without using an attempt', {skip}, async () => {
  for (let i = 0; i < 4; i++) await takeOf('lim' + i, {}, U4);
  sttText.set('queue', Array.from({length:4}, () => 'something has changed within me something is not the same I am through with playing'));
  const {run} = await import('../worker/analysis-worker.mjs'), before = sttCalls;
  const stats = await run({db, maxStt:2, log:() => {}});
  assert.equal(sttCalls - before, 2); assert.equal(stats.stt.clips, 2); assert.ok(stats.deferred >= 2);
  const {rows} = await db.query("select status, attempts, count(*)::int n from public.vocal_analysis_jobs where media_id like 'lim_' and kind = 'song' group by 1, 2 order by 1", []);
  assert.deepEqual(rows, [{status:'queued', attempts:0, n:2}, {status:'review', attempts:1, n:2}]);
  await run({db, maxStt:2, log:() => {}});
  assert.equal(sttCalls - before, 4);
  assert.equal((await db.query("select count(*)::int n from public.vocal_analysis_jobs where media_id like 'lim_' and kind = 'song' and result ->> 'stt' = 'auto'")).rows[0].n, 4);
});

test('An API error answer is released (not counted); without the key nothing is paid, as before', {skip}, async () => {
  await takeOf('err1', {}, U4);
  const start = await month(), before = sttCalls;
  sttStatus = 500;
  try { await work(); } finally { sttStatus = 200; }
  assert.equal(sttCalls - before, 1);
  const j = (await jobs('err1')).song;
  assert.equal(j.status, 'running'); assert.equal(j.last_error, 'speech recognition failed (500)'); assert.equal(Number(j.cost_usd), 0); // waits to retry
  assert.deepEqual(await month(), start, 'a refused call does not count toward the cap');
  assert.deepEqual(await ledger("media_id = 'err1'"), [{status:'released', n:1}]);

  const apiKey = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    await takeOf('nokey1', {}, U4);
    await db.query("update public.vocal_analysis_jobs set locked_at = now() - interval '31 minutes' where media_id = 'err1'");
    await work();
  } finally { process.env.OPENAI_API_KEY = apiKey; }
  assert.equal(sttCalls - before, 1, 'no key: no call');
  for (const id of ['nokey1', 'err1']) {
    const r = (await jobs(id)).song;
    assert.deepEqual([r.status, r.result.requiresRequest, r.result.reason], ['review', true, 'paid transcription requires an authorized user request'], id);
  }
  assert.deepEqual(await month(), start);
});
