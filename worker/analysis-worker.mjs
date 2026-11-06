// VOCAL.zip server analysis worker. Runs on GitHub Actions (.github/workflows/analysis-worker.yml) every
// 10 minutes, independent of any open app: it takes queued jobs from Supabase (vocal_analysis_jobs), reads
// the recording (Cloudflare R2, read-only token; or the older Supabase Storage copy), decodes it with
// ffmpeg and
//   'vocal' → runs the same measurements as the app (app/vocal-analysis.js) and stores metadata.analysis;
//   'song'  → reuses the saved transcript or transcribes the 30 sung seconds once (OpenAI STT), compares
//             it with the user's lyrics (song-text-match.mjs) and assigns the song only when the match is
//             clearly strong and the recording still has no song; otherwise keeps the top 3 for review.
// Original files are only read. Writes touch one JSON key (or song fields while still empty) on the
// current row, so edits made meanwhile are never overwritten. Logs carry counts only (public repo).
import pg from 'pg';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createHash, createHmac} from 'node:crypto';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {matchTranscripts, normalizeText} from '../song-text-match.mjs';

const require = createRequire(import.meta.url);
const VA = require('../app/vocal-analysis.js');
const env = process.env;
export const COST_PER_CLIP_USD = 0.0015;            // gpt-4o-mini-transcribe ≈ $0.003/min × 30 s
const STT_MODEL = 'gpt-4o-mini-transcribe';
const MAX_BYTES = 300 * 1024 * 1024, MAX_SECONDS = 15 * 60, CLIP = 30, SEARCH = 120, MIN_SUNG = 4;

/* ---------- auto-assign policy ----------
 * Lyric similarity is not a probability of being right. A song is assigned without asking only when the
 * matcher itself is confident (its own threshold and margin) AND the match is much stronger than that, the
 * runner-up is far behind, and enough words were recognized. Everything else goes to "확인 필요" with
 * the top 3. These numbers are deliberately strict until they are tuned on real recordings. */
export const AUTO = {minScore:0.40, minMargin:0.12, minChars:30};
export function decide(transcript, match) {
  const top = match.matches?.[0], second = match.matches?.[1];
  const chars = normalizeText(transcript).replace(/\s+/g, '').length;
  const margin = top ? top.score - (second && second.songId !== top.songId ? second.score : 0) : 0;
  const auto = !!match.candidate && !!top && top.songId === match.candidate &&
    top.score >= AUTO.minScore && margin >= AUTO.minMargin && chars >= AUTO.minChars;
  return {auto, songId:auto ? top.songId : null, score:top?.score ?? 0, margin, chars,
    top3:(match.matches || []).slice(0, 3).map(m => ({songId:m.songId, score:Math.round(m.score * 1000) / 1000}))};
}

/* ---------- Cloudflare R2 (S3 API, AWS Signature V4, read-only token) ---------- */
const sha256 = data => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encodePath = p => p.split('/').map(s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
/** Signature V4 for one request; returns the Authorization header (headers must include host and x-amz-date). */
export function signV4({method, path, query = '', headers, payloadHash, region, service, accessKey, secretKey}) {
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const canonHeaders = names.map(n => n + ':' + String(Object.entries(headers).find(([k]) => k.toLowerCase() === n)[1]).trim() + '\n').join('');
  const signed = names.join(';');
  const canonical = [method, path, query, canonHeaders, signed, payloadHash].join('\n');
  const amzDate = headers['x-amz-date'], day = amzDate.slice(0, 8), scope = day + '/' + region + '/' + service + '/aws4_request';
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), service), 'aws4_request');
  return 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope + ', SignedHeaders=' + signed + ', Signature=' + createHmac('sha256', key).update(toSign).digest('hex');
}
async function getR2(key) {
  if (!/^u\/[0-9a-f-]{36}\//.test(key) || key.includes('..')) throw new Error('R2 key is outside a user folder');
  const base = env.R2_ENDPOINT || 'https://' + env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const url = new URL(base), path = '/' + (env.R2_BUCKET || 'vocalzip-media') + '/' + encodePath(key);
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const headers = {host:url.host, 'x-amz-content-sha256':'UNSIGNED-PAYLOAD', 'x-amz-date':amzDate};
  const authorization = signV4({method:'GET', path, headers, payloadHash:'UNSIGNED-PAYLOAD', region:'auto', service:'s3', accessKey:env.R2_ACCESS_KEY_ID, secretKey:env.R2_SECRET_ACCESS_KEY});
  return download(url.origin + path, {...headers, authorization});
}
/** Older recordings kept in Supabase Storage (single file or parts). */
async function getStorage(path) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('older Supabase Storage file: SUPABASE_SERVICE_ROLE_KEY is not set');
  const base = env.STORAGE_ENDPOINT || (env.SUPABASE_URL || 'https://chxnbtiyuyhiywzeshis.supabase.co') + '/storage/v1';
  return download(base + '/object/vocal-recordings/' + encodePath(path), {authorization:'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, apikey:env.SUPABASE_SERVICE_ROLE_KEY});
}
async function download(url, headers) {
  const res = await fetch(url, {headers, signal:AbortSignal.timeout(120000)});
  if (!res.ok) throw new Error('download failed (' + res.status + ')');
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('file too large');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('file too large');
  return bytes;
}
async function readMedia(meta, owner) {
  if (meta.storageProvider === 'r2' && meta.r2Key) {
    if (!meta.r2Key.startsWith('u/' + owner + '/')) throw new Error('R2 key belongs to another account');
    return getR2(meta.r2Key);
  }
  const parts = meta.storageVersion === 2 ? (meta.parts || []).map(p => p.path) : meta.path ? [meta.path] : [];
  if (!parts.length) throw new Error('no stored copy');
  if (parts.some(p => !String(p).startsWith(owner + '/') || String(p).includes('..'))) throw new Error('storage path belongs to another account');
  return Buffer.concat(await Promise.all(parts.map(getStorage)));
}

/* ---------- audio ---------- */
/** Decode any supported file (M4A/AAC, MP3, WAV, FLAC, video audio…) to 16 kHz mono float samples.
 * From a temporary file, not a pipe: M4A/MP4 often keeps its index at the end, which needs seeking. */
export async function decode(bytes, {seconds = MAX_SECONDS, rate = 16000} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'vzip-')), file = join(dir, 'in');
  try {
    await writeFile(file, bytes);
    return await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-t', String(seconds), '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1']);
      const out = [];
      ff.stdout.on('data', d => out.push(d)); ff.stderr.resume();
      ff.on('error', reject);
      ff.on('close', code => {
        if (code !== 0) return reject(new Error('could not decode the audio'));
        const buf = Buffer.concat(out);
        resolve(Float32Array.from(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4))));
      });
    });
  } finally { await rm(dir, {recursive:true, force:true}); }
}
/** The 30 seconds with the most singing in the first two minutes (same rule as the app's song finder). */
export function singingWindow(samples, rate) {
  const head = samples.subarray(0, Math.min(samples.length, SEARCH * rate));
  const r = VA.analyze(head, rate), c = r.curve, fps = r.fps, win = Math.min(c.length, CLIP * fps);
  let sum = 0, best = -1, at = 0;
  for (let i = 0; i < c.length; i++) { sum += c[i] != null ? 1 : 0; if (i >= win) sum -= c[i - win] != null ? 1 : 0; if (i >= win - 1 && sum > best) { best = sum; at = i - win + 1; } }
  const total = head.length / rate;
  return {start:Math.max(0, Math.min(at / fps - 0.5, total - CLIP)), sung:best / fps};
}
export function wav16(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) { const v = Math.max(-1, Math.min(1, samples[i])); b.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2); }
  return b;
}
async function transcribe(wav) {
  const form = new FormData();
  form.set('model', STT_MODEL); form.set('file', new Blob([wav], {type:'audio/wav'}), 'clip.wav');
  const res = await fetch((env.OPENAI_BASE || 'https://api.openai.com/v1') + '/audio/transcriptions', {method:'POST', headers:{authorization:'Bearer ' + env.OPENAI_API_KEY}, body:form, signal:AbortSignal.timeout(90000)});
  if (!res.ok) throw new Error('speech recognition failed (' + res.status + ')');
  return String((await res.json()).text || '').slice(0, 1600);
}

/* ---------- jobs ---------- */
async function references(db, owner) {
  const {rows:[data]} = await db.query('select payload from public.vocal_data where user_id = $1', [owner]);
  const payload = data?.payload || {}, gone = new Set(payload.deleted?.songs || []);
  const songs = (payload.songs || []).filter(s => s?.id && !gone.has(s.id));
  // Lyrics typed on the song page first; recorded references only for songs without lyrics (as in the app).
  const typed = songs.filter(s => String(s.lyrics || '').trim().length >= 12).map(s => ({songId:s.id, transcript:String(s.lyrics).trim().slice(0, 16000)}));
  const has = new Set(typed.map(r => r.songId)), known = new Set(songs.map(s => s.id));
  const {rows} = await db.query("select record_id, transcript from public.vocal_song_texts where user_id = $1 and kind = 'reference' and deleted_at is null", [owner]).catch(() => ({rows:[]}));
  return {songs, refs:[...typed, ...rows.filter(r => known.has(r.record_id) && !has.has(r.record_id)).map(r => ({songId:r.record_id, transcript:r.transcript}))]};
}
async function finish(db, job, status, result = null, error = null, cost = 0) {
  await db.query('update public.vocal_analysis_jobs set status = $2, result = coalesce($3::jsonb, result), last_error = $4, cost_usd = cost_usd + $5, locked_at = null, locked_by = null, updated_at = now() where id = $1',
    [job.id, status, result && JSON.stringify(result), error, cost]);
}
async function vocalJob(db, job, meta, audio) {
  if (meta.analysis?.v) return finish(db, job, 'done', {reused:true});
  const samples = await audio();
  const r = VA.analyze(samples, 16000);
  const summary = {v:r.version, at:Date.now(), seconds:r.seconds, metrics:r.metrics, confidence:r.confidence, by:'server'};
  // Only the analysis key changes, on the row as it is now; an analysis saved meanwhile (app) is kept.
  await db.query("update public.vocal_media set metadata = jsonb_set(metadata, '{analysis}', $3::jsonb), updated_at = now() where id = $1 and user_id = $2 and (metadata -> 'analysis' ->> 'v') is null",
    [job.media_id, job.user_id, JSON.stringify(summary)]);
  return finish(db, job, 'done', {voicedSeconds:r.metrics.voicedSeconds, confidence:r.confidence});
}
async function songJob(db, job, meta, audio) {
  if (meta.songId || meta.song) return finish(db, job, 'skipped', {reason:'already assigned'});
  const owner = job.user_id;
  // 1–2. A transcript paid for before (by the app or an earlier attempt) is reused: never paid twice.
  const saved = await db.query("select transcript from public.vocal_song_texts where user_id = $1 and kind = 'recognition' and record_id = $2 and deleted_at is null", [owner, job.media_id]).catch(() => ({rows:[]}));
  let transcript = saved.rows[0]?.transcript ?? job.result?.transcript ?? null, cost = 0;
  const {songs, refs} = await references(db, owner);
  if (!refs.length) return finish(db, job, 'review', {reason:'no lyrics to compare', transcript});
  if (transcript == null) {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    // 3. The 30 sung seconds (found on the server for free); nothing is paid when there is no singing.
    const samples = await audio(), {start, sung} = singingWindow(samples, 16000);
    if (sung < MIN_SUNG) return finish(db, job, 'review', {reason:'no singing found'});
    // 4. One paid transcription; it is saved before anything else can fail, and counted with the app's usage.
    transcript = await transcribe(wav16(samples.subarray(Math.floor(start * 16000), Math.floor((start + CLIP) * 16000)), 16000));
    // Kept on the job at once (own statement): whatever fails next, a retry reuses it instead of paying again.
    await db.query("update public.vocal_analysis_jobs set result = jsonb_build_object('transcript', $2::text), cost_usd = cost_usd + $3 where id = $1", [job.id, transcript, COST_PER_CLIP_USD]);
    await db.query('begin');
    try {
      if (transcript.trim()) await db.query("insert into public.vocal_song_texts (user_id, kind, record_id, transcript, source) values ($1, 'recognition', $2, $3, 'stt') on conflict do nothing", [owner, job.media_id, transcript]);
      await db.query("insert into public.vzip_song_stt_quota as q (user_id, usage_date, used_today, used_total) values ($1, (timezone('utc', now()))::date, 1, 1) on conflict (user_id) do update set usage_date = excluded.usage_date, used_today = case when q.usage_date = excluded.usage_date then q.used_today + 1 else 1 end, used_total = q.used_total + 1", [owner]);
      await db.query('commit');
    } catch (e) { await db.query('rollback'); throw e; }
  }
  // 5–7. Compare with the lyrics; assign only a clearly strong match, and only while the file has no song.
  const d = decide(transcript, matchTranscripts(transcript, refs));
  // Same label the app writes (VZ.songLabel): "title — show".
  const title = id => { const s = songs.find(x => x.id === id); return s ? s.title + (s.show ? ' — ' + s.show : '') : ''; };
  const top3 = d.top3.map(m => ({...m, title:title(m.songId)}));
  if (d.auto) {
    const {rowCount} = await db.query(
      "update public.vocal_media set metadata = metadata || jsonb_build_object('songId', $3::text, 'song', $4::text, 'songSource', 'ai', 'aiSong', $5::jsonb), updated_at = now() where id = $1 and user_id = $2 and coalesce(metadata ->> 'songId', '') = '' and coalesce(metadata ->> 'song', '') = ''",
      [job.media_id, owner, d.songId, title(d.songId), JSON.stringify({score:Math.round(d.score * 1000) / 1000, at:Date.now()})]);
    if (!rowCount) return finish(db, job, 'skipped', {reason:'assigned by the user meanwhile', transcript, top3});
    return finish(db, job, 'done', {songId:d.songId, title:title(d.songId), score:d.score, auto:true, transcript, top3}, null, cost);
  }
  return finish(db, job, 'review', {transcript, top3, score:d.score, margin:d.margin}, null, cost);
}

/** Song identification needs an STT key and the lyrics / usage tables; otherwise only measurements run. */
export async function kindsFor(db) {
  if (!env.OPENAI_API_KEY) return ['vocal'];
  const {rows:[t]} = await db.query("select to_regclass('public.vocal_song_texts') is not null and to_regclass('public.vzip_song_stt_quota') is not null as ok");
  return t.ok ? ['vocal', 'song'] : ['vocal'];
}
export async function run({db, worker = 'gh-' + (env.GITHUB_RUN_ID || process.pid), budgetMs = 45 * 60000, maxJobs = 400, log = console.log} = {}) {
  const started = Date.now(), kinds = await kindsFor(db), stats = {done:0, review:0, skipped:0, failed:0, retry:0};
  await db.query('select public.vzip_fail_abandoned_jobs()');
  let cached = null; // the decoded file is shared by the song and vocal jobs of the same recording
  for (let taken = 0; taken < maxJobs && Date.now() - started < budgetMs;) {
    const {rows:jobs} = await db.query('select * from public.vzip_claim_analysis_jobs($1, $2, $3)', [worker, 5, kinds]);
    if (!jobs.length) break;
    // UPDATE … RETURNING has no order: oldest first (song identification before measurements, as claimed).
    jobs.sort((a, b) => (b.kind === 'song') - (a.kind === 'song') || Number(a.id) - Number(b.id));
    for (const job of jobs) {
      taken++;
      try {
        const {rows:[row]} = await db.query('select metadata from public.vocal_media where id = $1 and user_id = $2', [job.media_id, job.user_id]);
        if (!row) { await finish(db, job, 'skipped', {reason:'recording deleted'}); stats.skipped++; continue; }
        const audio = async () => {
          if (cached?.key !== job.user_id + '/' + job.media_id) cached = {key:job.user_id + '/' + job.media_id, samples:await decode(await readMedia(row.metadata, job.user_id))};
          return cached.samples;
        };
        await (job.kind === 'vocal' ? vocalJob : songJob)(db, job, row.metadata, audio);
        const {rows:[after]} = await db.query('select status from public.vocal_analysis_jobs where id = $1', [job.id]);
        stats[after.status === 'done' ? 'done' : after.status === 'review' ? 'review' : 'skipped']++;
      } catch (e) {
        await db.query('rollback').catch(() => {});
        const last = job.attempts >= 3;
        await finish(db, job, last ? 'failed' : 'queued', null, String(e.message || e).slice(0, 300));
        stats[last ? 'failed' : 'retry']++;
      }
    }
  }
  log('analysis worker: ' + JSON.stringify(stats) + ' in ' + Math.round((Date.now() - started) / 1000) + 's');
  return stats;
}

// CLI: `node worker/analysis-worker.mjs` (work) or `--peek` (writes jobs=<n> for the workflow to skip setup when idle).
if (import.meta.url === 'file://' + process.argv[1]) {
  if (!env.SUPABASE_DB_URL) { console.log('analysis worker: SUPABASE_DB_URL is not set, nothing to do'); process.exit(0); }
  const db = new pg.Client({connectionString:env.SUPABASE_DB_URL, ssl:env.SUPABASE_DB_SSL === 'off' ? false : {rejectUnauthorized:false}});
  await db.connect();
  try {
    if (process.argv.includes('--peek')) {
      const kinds = await kindsFor(db);
      const {rows:[r]} = await db.query("select count(*)::int as n from public.vocal_analysis_jobs where attempts < 3 and kind = any($1) and (status = 'queued' or (status = 'running' and locked_at < now() - interval '30 minutes'))", [kinds]);
      console.log('analysis worker: ' + r.n + ' job(s) waiting');
      if (env.GITHUB_OUTPUT) (await import('node:fs')).appendFileSync(env.GITHUB_OUTPUT, 'jobs=' + r.n + '\n');
    } else await run({db});
  } finally { await db.end(); }
}
