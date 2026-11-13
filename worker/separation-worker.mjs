// VOCAL.zip AI 분리 후 측정 (server, GitHub Actions): recordings whose voice the MR drowned and that had no song MR file
// to subtract (worker/analysis-worker.mjs marks them analysis.scope.separationWanted) are split into voice and
// accompaniment with Demucs (open-source, CPU, no paid API), and the voice alone is measured with the app's analyzer.
//   · The recording is read from this account's storage, separated in a temporary folder on the runner and deleted;
//     nothing but the measurement summary is written (metadata.analysis, the previous one kept in history).
//   · The result is marked confidence.aiSeparated and shown as "AI 분리 후 측정(참고)"; it is judged like any other.
//   · A take that cannot be separated, or is still unreadable afterwards, is marked separationTried and not retried.
// Logs show counts only (this repository is public). Needs SUPABASE_DB_URL and the R2 read secrets, like the
// analysis worker; DEMUCS_CMD overrides the separator command (tests use a stand-in).
import pg from 'pg';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readMedia, decode, reliableResult} from './analysis-worker.mjs';

const require = createRequire(import.meta.url);
const VA = require('../app/vocal-analysis.js');
const env = process.env;
const MODEL = 'htdemucs', MAX_SECONDS = 15 * 60, SEPARATE_TIMEOUT_MS = 20 * 60000;

/** Recordings waiting for separation (oldest first). */
export async function waiting(db, limit = 1000) {
  const {rows} = await db.query(
    "select id, user_id, metadata from public.vocal_media where metadata -> 'analysis' -> 'scope' ->> 'separationWanted' = 'true' and not coalesce((metadata -> 'analysis' -> 'scope' ->> 'separationTried')::boolean, false) order by updated_at limit $1",
    [limit]);
  return rows;
}
/** Run the separator on a WAV; resolves with the path of the separated voice. */
function separate(input, outDir, cmd = env.DEMUCS_CMD || 'python3 -m demucs') {
  return new Promise((resolve, reject) => {
    const [bin, ...pre] = cmd.split(' ').filter(Boolean);
    const args = [...pre, '--two-stems', 'vocals', '-n', MODEL, '-d', 'cpu', '-o', outDir, input];
    const p = spawn(bin, args, {stdio:['ignore', 'ignore', 'pipe']});
    let err = ''; p.stderr.on('data', d => { err = (err + d).slice(-400); });
    const kill = setTimeout(() => p.kill('SIGKILL'), SEPARATE_TIMEOUT_MS);
    p.on('error', e => { clearTimeout(kill); reject(e); });
    p.on('close', async code => {
      clearTimeout(kill);
      if (code !== 0) return reject(new Error('separation failed (' + code + ')'));
      // Demucs writes <out>/<model>/<input name>/vocals.wav
      try {
        const base = join(outDir, MODEL), dirs = await readdir(base);
        resolve(join(base, dirs[0], 'vocals.wav'));
      } catch { reject(new Error('separation produced no voice file')); }
    });
  });
}
/** 16-bit 44.1 kHz mono WAV of decoded samples (the separator's input). */
function wav(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}
/** Write the analysis only while the row still holds the analysis this run read (an app/server save meanwhile wins). */
async function save(db, row, analysis) {
  const before = row.metadata?.analysis;
  const {rowCount} = await db.query("update public.vocal_media set metadata = jsonb_set(metadata, '{analysis}', $3::jsonb), updated_at = now() where id = $1 and user_id = $2 and coalesce(metadata -> 'analysis' ->> 'at', '') = $4",
    [row.id, row.user_id, JSON.stringify(analysis), before?.at != null ? String(before.at) : '']);
  return rowCount === 1;
}
const tried = (row, why) => ({...row.metadata.analysis, scope:{...row.metadata.analysis.scope, separationWanted:false, separationTried:true, separationResult:why}});

/** One recording: separate, measure the voice, keep it when it reads better than the take as recorded. */
export async function separateOne(db, row, {cmd} = {}) {
  const meta = row.metadata || {}, previous = meta.analysis;
  const dir = await mkdtemp(join(tmpdir(), 'vzsep-'));
  try {
    const samples = await decode(await readMedia(meta, row.user_id), {rate:44100, seconds:MAX_SECONDS});
    const input = join(dir, 'take.wav');
    await writeFile(input, wav(samples, 44100));
    let voicePath;
    try { voicePath = await separate(input, join(dir, 'out'), cmd); }
    catch { await save(db, row, tried(row, 'failed')); return 'failed'; }
    const voice = await decode(await readFile(voicePath), {rate:16000, seconds:MAX_SECONDS});
    const r = VA.analyze(voice, 16000);
    const better = reliableResult(r) || (r.confidence?.pitchConfidence || 0) > (previous?.confidence?.pitchConfidence || 0) + 0.1;
    if (!better || !r.metrics?.voicedSeconds) { await save(db, row, tried(row, 'not-better')); return 'not-better'; }
    r.confidence.aiSeparated = {model:MODEL};
    const history = Array.isArray(previous?.history) ? previous.history.slice() : [];
    if (previous?.v) { const {history:ignored, ...kept} = previous; history.push(kept); }
    const summary = {v:r.version, at:Date.now(), seconds:r.seconds, metrics:r.metrics, confidence:r.confidence, by:'server',
      ...(history.length ? {history} : {}), scope:{kind:'whole-recording', cut:samples.length >= MAX_SECONDS * 44100, separationTried:true, separationResult:'separated',
        ...(previous?.scope?.unreliableReanalysis ? {unreliableReanalysis:previous.scope.unreliableReanalysis} : {})}};
    return await save(db, row, summary) ? 'separated' : 'changed';
  } catch {
    // A file that cannot be read now stays waiting for the next run.
    return 'error';
  } finally { await rm(dir, {recursive:true, force:true}); }
}
/** Up to maxJobs recordings within the time budget. Returns counts by outcome. */
export async function run({db, maxJobs = Number(env.SEPARATE_MAX_JOBS) || 12, budgetMs = 50 * 60000, cmd, log = console.log} = {}) {
  const started = Date.now(), counts = {};
  for (const row of await waiting(db, maxJobs)) {
    if (Date.now() - started > budgetMs) break;
    const outcome = await separateOne(db, row, {cmd});
    counts[outcome] = (counts[outcome] || 0) + 1;
  }
  log('separation worker: ' + JSON.stringify(counts));
  return counts;
}

/** Self-test without any user data: a synthetic take (song-like MR 8 dB over a sung melody) is separated with the real
 * separator and measured before and after. Prints timings and confidences only. */
export async function selftest({cmd, log = console.log} = {}) {
  const Y = require('../tests/helpers/mr-synth.cjs'), dir = await mkdtemp(join(tmpdir(), 'vzself-'));
  try {
    const take = Y.record(Y.vocal(30).x, Y.mr(60), {offset:5, db:8}).x;
    const before = VA.analyze(take, Y.SR);
    // 8 kHz synthetic → 44.1 kHz WAV like a real take (ffmpeg resamples).
    const input = join(dir, 'take8k.wav'); await writeFile(input, wav(take, Y.SR));
    const up = await decode(await readFile(input), {rate:44100, seconds:MAX_SECONDS});
    const wav44 = join(dir, 'take.wav'); await writeFile(wav44, wav(up, 44100));
    const t0 = Date.now(), voicePath = await separate(wav44, join(dir, 'out'), cmd), seconds = (Date.now() - t0) / 1000;
    const after = VA.analyze(await decode(await readFile(voicePath), {rate:16000, seconds:MAX_SECONDS}), 16000);
    const result = {audioSeconds:30, separateSeconds:Math.round(seconds), pitchConfidence:{before:before.confidence.pitchConfidence, after:after.confidence.pitchConfidence},
      reliable:{before:reliableResult(before), after:reliableResult(after)}, notes:{before:before.metrics.intonation?.notes ?? 0, after:after.metrics.intonation?.notes ?? 0}};
    log('separation selftest: ' + JSON.stringify(result));
    return result;
  } finally { await rm(dir, {recursive:true, force:true}); }
}

if (import.meta.url === 'file://' + process.argv[1] && process.argv.includes('--selftest')) {
  await selftest();
} else if (import.meta.url === 'file://' + process.argv[1]) {
  if (!env.SUPABASE_DB_URL) { console.log('separation worker: SUPABASE_DB_URL is not set; nothing to do'); process.exit(0); }
  const db = new pg.Client({connectionString:env.SUPABASE_DB_URL, ssl:env.SUPABASE_DB_SSL === 'off' ? false : {rejectUnauthorized:false}});
  try { await db.connect(); } catch (e) { console.log('separation worker: cannot connect to the database (' + e.message + ')'); process.exit(1); }
  try {
    if (process.argv.includes('--peek')) {
      const n = (await waiting(db)).length;
      console.log('separation worker: ' + n + ' recording(s) waiting');
      if (env.GITHUB_OUTPUT) (await import('node:fs')).appendFileSync(env.GITHUB_OUTPUT, 'waiting=' + n + '\n');
    } else await run({db});
  } finally { await db.end(); }
}
