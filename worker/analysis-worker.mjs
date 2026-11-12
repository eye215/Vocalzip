// VOCAL.zip server analysis worker. Runs on GitHub Actions (.github/workflows/analysis-worker.yml) every
// 10 minutes, independent of any open app: it takes queued jobs from Supabase (vocal_analysis_jobs), reads
// the recording (Cloudflare R2, read-only token; or the older Supabase Storage copy), decodes it with
// ffmpeg and
//   'vocal' → runs the same measurements as the app (app/vocal-analysis.js) and stores metadata.analysis;
//   'song'  → reuses a saved transcript; otherwise, for a song recording without a song (never lesson / training /
//             room), transcribes its 30 sung seconds once (OpenAI STT) within the service-wide monthly cap
//             (vzip_auto_stt_budget, owner-approved $2.00 for all accounts; each clip is reserved in the database
//             before the API is called), compares the text with the user's lyrics (song-text-match.mjs) and keeps
//             candidates for user approval. Without OPENAI_API_KEY or the budget migration (20261115) it fails
//             closed: no paid call. A song is never assigned automatically.
// Original files are only read. Writes touch one analysis JSON key or the job result on the
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
/* Automatic STT: at most this many paid clips per run, on top of the monthly cap kept in the database. */
export const MAX_AUTO_STT_PER_RUN = 50;
export const CAP_REASON = 'monthly automatic STT cap reached';

/** Same purpose rule as the app (app/media.js M.recordingCategory), from what the server has: the recording's
 * metadata and the owner's lessons / practices (vocal_data). Only 'song' recordings get automatic STT. */
export function recordingCategory(meta = {}, id = meta?.id, {lessons = [], practices = []} = {}) {
  const explicit = String(meta?.recordingCategory || '');
  if (['song', 'lesson', 'training', 'room'].includes(explicit)) return explicit;
  if (meta?.source === 'practice-room' || (meta?.source === 'practice' && /^[a-zA-Z0-9-]{8,80}-[01]$/.test(String(id || '')))) return 'room';
  const lesson = lessons.some(l => (l?.recordings || []).some(r => r?.id === id));
  const practice = practices.find(p => (p?.mediaIds || []).includes(id));
  const occasion = ['performance', 'lesson', 'practice'].includes(meta?.occasion) ? meta.occasion
    : lesson ? 'lesson' : practice ? 'practice' : meta?.source === 'lesson' ? 'lesson' : 'practice';
  if (occasion === 'lesson') return 'lesson';
  if (practice?.practiceRoom) return 'room';
  if (practice?.practiceMode === 'training') return 'training';
  return 'song';
}

/* Match confidence is a recommendation signal, never permission to change a song. */
export const AUTO = {minScore:0.40, minMargin:0.12, minChars:30};
export function decide(transcript, match) {
  const top = match.matches?.[0], second = match.matches?.[1];
  const chars = normalizeText(transcript).replace(/\s+/g, '').length;
  const margin = top ? top.score - (second && second.songId !== top.songId ? second.score : 0) : 0;
  const confident = !!match.candidate && !!top && top.songId === match.candidate &&
    top.score >= AUTO.minScore && margin >= AUTO.minMargin && chars >= AUTO.minChars;
  return {auto:false, songId:null, confident, score:top?.score ?? 0, margin, chars,
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
const clean = v => String(v ?? '').trim();
const NEEDS_KEY = 'needs SUPABASE_SERVICE_ROLE_KEY (older Supabase Storage file)';
/** R2 endpoint from R2_ACCOUNT_ID: the 32-character account id, or the S3 endpoint URL pasted whole. */
export function r2Endpoint(id = env.R2_ACCOUNT_ID, override = env.R2_ENDPOINT) {
  if (override) return clean(override);
  const v = clean(id);
  if (/^[0-9a-f]{32}$/i.test(v)) return 'https://' + v.toLowerCase() + '.r2.cloudflarestorage.com';
  const m = /^(?:https?:\/\/)?([0-9a-f]{32})\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com\b/i.exec(v);
  if (m) return 'https://' + m[1].toLowerCase() + '.r2.cloudflarestorage.com';
  throw new Error('R2_ACCOUNT_ID should be the 32-character account id (' + describeSecret(v) + ')');
}
/** The shape of a secret, never its value (logs are public). */
export function describeSecret(v) {
  const s = String(v ?? '');
  if (!s) return 'missing';
  const kinds = [s.length + ' chars'];
  if (s !== s.trim()) kinds.push('spaces or line breaks around it');
  if (/^https?:\/\//i.test(s.trim())) kinds.push('starts with http');
  if (/\s/.test(s.trim())) kinds.push('spaces inside');
  if (/^[0-9a-f]+$/i.test(s.trim())) kinds.push('hex');
  return kinds.join(', ');
}
/** Checks the settings before any job is touched; returns notes for the log (shapes only). */
export function preflight() {
  const notes = [], problems = [];
  if (!env.R2_ENDPOINT) {
    try { const host = new URL(r2Endpoint()).host; notes.push('R2 endpoint host ok (' + host.replace(/^[0-9a-f]{32}/, '<account>') + ')'); }
    catch (e) { problems.push(e.message); }
    for (const [name, len] of [['R2_ACCESS_KEY_ID', 32], ['R2_SECRET_ACCESS_KEY', 64]]) {
      const v = clean(env[name]);
      if (!v) problems.push(name + ' is missing');
      else if (v.length !== len) notes.push(name + ': ' + describeSecret(env[name]) + ' (R2 keys are usually ' + len + ')');
      else notes.push(name + ' set (' + len + ' chars)');
    }
  }
  notes.push('OPENAI_API_KEY ' + (clean(env.OPENAI_API_KEY) ? 'set' : 'missing (automatic STT off)') + '; song candidates always require user approval');
  return {notes, problems};
}
async function getR2(key) {
  if (!/^u\/[0-9a-f-]{36}\//.test(key) || key.includes('..')) throw new Error('R2 key is outside a user folder');
  const base = r2Endpoint();
  const url = new URL(base), path = '/' + (env.R2_BUCKET || 'vocalzip-media') + '/' + encodePath(key);
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const headers = {host:url.host, 'x-amz-content-sha256':'UNSIGNED-PAYLOAD', 'x-amz-date':amzDate};
  const authorization = signV4({method:'GET', path, headers, payloadHash:'UNSIGNED-PAYLOAD', region:'auto', service:'s3', accessKey:clean(env.R2_ACCESS_KEY_ID), secretKey:clean(env.R2_SECRET_ACCESS_KEY)});
  return download(url.origin + path, {...headers, authorization});
}
/** Older recordings kept in Supabase Storage (single file or parts). */
async function getStorage(path) {
  if (!clean(env.SUPABASE_SERVICE_ROLE_KEY)) throw Object.assign(new Error(NEEDS_KEY), {setup:true});
  const base = env.STORAGE_ENDPOINT || (env.SUPABASE_URL || 'https://chxnbtiyuyhiywzeshis.supabase.co') + '/storage/v1';
  return download(base + '/object/vocal-recordings/' + encodePath(path), {authorization:'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, apikey:env.SUPABASE_SERVICE_ROLE_KEY});
}
/** "fetch failed" says nothing: name the cause (DNS, refused, reset, timeout, TLS, bad URL). */
export function networkCause(e) {
  // Node nests the real error: cause, cause.cause, or AggregateError.errors (one per address tried).
  const find = x => x && (x.code || find(x.cause) || (x.errors || []).map(find).find(Boolean));
  const c = e?.cause, code = String(find(c) || e?.code || '');
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /TIMEOUT/i.test(code)) return 'timeout' + (code ? ' ' + code : '');
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return 'DNS ' + code + ' (host name not found: check R2_ACCOUNT_ID)';
  if (/ECONNREFUSED/.test(code)) return 'connection refused';
  if (/ECONNRESET|UND_ERR_SOCKET/.test(code)) return 'connection reset ' + code;
  if (/CERT|SSL|TLS|SIGNATURE|VERIFY/i.test(code + ' ' + (c?.message || ''))) return 'TLS ' + code;
  if (/Invalid URL|ERR_INVALID_URL/i.test(code + ' ' + (c?.message || e?.message || ''))) return 'invalid URL';
  return (code || c?.name || e?.name || 'unknown').toString().slice(0, 40);
}
async function download(url, headers) {
  let res;
  try { res = await fetch(url, {headers, signal:AbortSignal.timeout(120000)}); }
  catch (e) { throw new Error('download network error: ' + networkCause(e)); }
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
      const ff = spawn(env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', file, '-t', String(seconds), '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1']);
      const out = [];
      ff.stdout.on('data', d => out.push(d)); ff.stderr.resume();
      const kill = setTimeout(() => ff.kill('SIGKILL'), 5 * 60000); // a stuck decode never holds the whole run
      ff.on('error', e => { clearTimeout(kill); reject(e); });
      ff.on('close', code => {
        clearTimeout(kill);
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
/** One paid transcription. An HTTP error answer is not billed (billed:false); a network error or timeout may be. */
async function transcribe(wav) {
  const form = new FormData();
  form.set('model', STT_MODEL); form.set('file', new Blob([wav], {type:'audio/wav'}), 'clip.wav');
  let res;
  try { res = await fetch((env.OPENAI_BASE || 'https://api.openai.com/v1') + '/audio/transcriptions', {method:'POST', headers:{authorization:'Bearer ' + clean(env.OPENAI_API_KEY)}, body:form, signal:AbortSignal.timeout(90000)}); }
  catch (e) { throw Object.assign(new Error('speech recognition network error: ' + networkCause(e)), {billed:true}); }
  if (!res.ok) throw Object.assign(new Error('speech recognition failed (' + res.status + ')'), {billed:false});
  const body = await res.json().catch(() => ({}));
  return String(body.text || '').slice(0, 1600);
}

/* ---------- jobs ---------- */
// Lyrics and references are read once per owner for a short while: a re-check of hundreds of 'review' jobs of
// one account then reads the account's data once, not once per recording.
const refsCache = new Map(), REFS_TTL_MS = 60000;
async function references(db, owner) {
  const hit = refsCache.get(owner);
  if (hit && Date.now() - hit.at < REFS_TTL_MS) return hit.value;
  // Fingerprint first: if lyrics change while they are being read, the stored fingerprint is the older one and the
  // job is simply matched once more later (never the other way round).
  const sig = await db.query('select public.vzip_song_refs_sig($1) as s', [owner]).then(r => r.rows[0]?.s ?? null, () => null);
  const value = {...await readReferences(db, owner), sig};
  refsCache.set(owner, {at:Date.now(), value});
  return value;
}
async function readReferences(db, owner) {
  const {rows:[data]} = await db.query('select payload from public.vocal_data where user_id = $1', [owner]);
  const payload = data?.payload || {}, gone = new Set(payload.deleted?.songs || []);
  const songs = (payload.songs || []).filter(s => s?.id && !gone.has(s.id));
  const list = v => Array.isArray(v) ? v : [];
  const owned = {lessons:list(payload.lessons), practices:list(payload.practices)};
  // Lyrics typed on the song page first, and the Korean translation too (a Korean-language production is sung in the
  // translated words); recorded references only for songs without original lyrics (as in the app).
  const text = (s, key) => String(s[key] || '').trim();
  const typed = songs.flatMap(s => ['lyrics', 'translation'].filter(key => text(s, key).length >= 12)
    .map(key => ({songId:s.id, transcript:text(s, key).slice(0, 16000), source:key})));
  const has = new Set(typed.filter(r => r.source === 'lyrics').map(r => r.songId)), known = new Set(songs.map(s => s.id));
  const {rows} = await db.query("select record_id, transcript from public.vocal_song_texts where user_id = $1 and kind = 'reference' and deleted_at is null", [owner]).catch(() => ({rows:[]}));
  return {songs, owned, refs:[...typed, ...rows.filter(r => known.has(r.record_id) && !has.has(r.record_id)).map(r => ({songId:r.record_id, transcript:r.transcript}))]};
}
async function finish(db, job, status, result = null, error = null, cost = 0) {
  await db.query('update public.vocal_analysis_jobs set status = $2, result = coalesce($3::jsonb, result), last_error = $4, cost_usd = cost_usd + $5, locked_at = null, locked_by = null, updated_at = now() where id = $1',
    [job.id, status, result && JSON.stringify(result), error, cost]);
}
async function vocalJob(db, job, meta, audio) {
  if (meta.analysis?.v) return finish(db, job, 'done', {reused:true});
  const samples = await audio();
  const r = VA.analyze(samples, 16000);
  const summary = {v:r.version, at:Date.now(), seconds:r.seconds, metrics:r.metrics, confidence:r.confidence, by:'server', scope:{kind:'whole-recording', cut:samples.length >= MAX_SECONDS * 16000}};
  // Only the analysis key changes, on the row as it is now; an analysis saved meanwhile (app) is kept.
  await db.query("update public.vocal_media set metadata = jsonb_set(metadata, '{analysis}', $3::jsonb), updated_at = now() where id = $1 and user_id = $2 and (metadata -> 'analysis' ->> 'v') is null",
    [job.media_id, job.user_id, JSON.stringify(summary)]);
  return finish(db, job, 'done', {voicedSeconds:r.metrics.voicedSeconds, confidence:r.confidence});
}
async function songJob(db, job, meta, audio, stt) {
  if (meta.songId || meta.song) return finish(db, job, 'skipped', {reason:'already assigned'});
  const owner = job.user_id;
  // 1–2. A transcript paid for before (by the app or an earlier attempt) is reused: never paid twice.
  const saved = await db.query("select transcript from public.vocal_song_texts where user_id = $1 and kind = 'recognition' and record_id = $2 and deleted_at is null", [owner, job.media_id]).catch(() => ({rows:[]}));
  let transcript = saved.rows[0]?.transcript ?? job.result?.transcript ?? null, cost = 0, paid = false;
  const {songs, refs, sig, owned} = await references(db, owner);
  // Remember what this job was matched with; a later change of lyrics or references queues it again
  // (vzip_recheck_review_jobs). Without the column (migration not run yet) nothing changes.
  if (sig) await db.query('update public.vocal_analysis_jobs set refs_sig = $2 where id = $1', [job.id, sig]).catch(() => {});
  if (!refs.length) return finish(db, job, 'review', {reason:'no lyrics to compare', transcript});
  if (transcript == null) {
    // 3. Automatic STT only when the owner's budget exists in the database and the key is set; otherwise (and for
    // lesson / training / room recordings, or once the monthly cap is reached) fail closed as before: no download,
    // no decoding, no paid call. The app's own request (vzip-song-stt) stays available.
    const closed = reason => finish(db, job, 'review', {reason, requiresRequest:true});
    if (!stt?.enabled) return closed('paid transcription requires an authorized user request');
    if (recordingCategory(meta, job.media_id, owned) !== 'song') return closed('not a song recording');
    if (stt.capped) return closed(CAP_REASON);
    if (stt.used >= stt.limit) throw Object.assign(new Error('per-run STT limit'), {defer:true});
    const {rows:[month]} = await db.query('select spent_usd, cap_usd from public.vzip_auto_stt_month_state()');
    if (Number(month.spent_usd) + COST_PER_CLIP_USD > Number(month.cap_usd)) { stt.capped = true; return closed(CAP_REASON); }
    // 4. The 30 sung seconds (found here for free); nothing is paid when there is no singing.
    const samples = await audio(), {start, sung} = singingWindow(samples, 16000);
    if (sung < MIN_SUNG) return finish(db, job, 'review', {reason:'no singing found'});
    // 5. Reserve the clip in the database (atomic, service-wide), then one paid call, then settle.
    const {rows:[r]} = await db.query('select ledger_id, refused from public.vzip_auto_stt_reserve($1, $2)', [job.id, COST_PER_CLIP_USD]);
    if (!r?.ledger_id) {
      if (r?.refused === 'cap') { stt.capped = true; return closed(CAP_REASON); }
      return closed('already transcribed automatically');
    }
    stt.used++;
    try {
      transcript = await transcribe(wav16(samples.subarray(Math.floor(start * 16000), Math.floor((start + CLIP) * 16000)), 16000));
    } catch (e) {
      await db.query('select public.vzip_auto_stt_settle($1, $2)', [r.ledger_id, e.billed === false ? 'released' : 'failed']).catch(() => {});
      if (e.billed !== false) stt.spent += COST_PER_CLIP_USD;
      throw e;
    }
    stt.spent += COST_PER_CLIP_USD; paid = true;
    // Kept on the job at once (own statement): whatever fails next, a retry reuses it instead of paying again.
    await db.query("update public.vocal_analysis_jobs set result = jsonb_build_object('transcript', $2::text, 'stt', 'auto'), cost_usd = cost_usd + $3 where id = $1", [job.id, transcript, COST_PER_CLIP_USD]);
    await db.query('begin');
    try {
      await db.query('select public.vzip_auto_stt_settle($1, $2)', [r.ledger_id, 'charged']);
      if (transcript.trim()) await db.query("insert into public.vocal_song_texts (user_id, kind, record_id, transcript, source) values ($1, 'recognition', $2, $3, 'stt') on conflict do nothing", [owner, job.media_id, transcript]);
      await db.query('commit');
    } catch (e) { await db.query('rollback'); throw e; }
  }
  // Recommendations only. Never update the recording's song fields.
  const d = decide(transcript, matchTranscripts(transcript, refs));
  // Same label the app writes (VZ.songLabel): "title — show".
  const title = id => { const s = songs.find(x => x.id === id); return s ? s.title + (s.show ? ' — ' + s.show : '') : ''; };
  const top3 = d.top3.map(m => ({...m, title:title(m.songId)}));
  return finish(db, job, 'review', {transcript, top3, score:d.score, margin:d.margin, auto:false, requiresApproval:true, ...(paid || job.result?.stt === 'auto' ? {stt:'auto'} : {})}, null, cost);
}

/** Automatic STT needs the key and the owner's budget ledger (migration 20261115); otherwise it stays closed. */
export async function autoSttReady(db) {
  if (!clean(env.OPENAI_API_KEY)) return false;
  const {rows:[t]} = await db.query("select to_regprocedure('public.vzip_auto_stt_reserve(bigint,numeric)') is not null and to_regprocedure('public.vzip_auto_stt_settle(bigint,text)') is not null and to_regprocedure('public.vzip_auto_stt_month_state()') is not null as ok");
  return !!t.ok;
}
/** Cached text can be matched without an API key; new text is paid only within the monthly cap (autoSttReady). */
export async function kindsFor(db) {
  const {rows:[t]} = await db.query("select to_regclass('public.vocal_song_texts') is not null as ok");
  return t.ok ? ['vocal', 'song'] : ['vocal'];
}
export async function run({db, worker = 'gh-' + (env.GITHUB_RUN_ID || process.pid), budgetMs = 40 * 60000, maxJobs = Number(env.WORKER_MAX_JOBS) || 400, maxStt = MAX_AUTO_STT_PER_RUN, log = console.log, verbose = env.WORKER_VERBOSE === '1'} = {}) {
  const only = clean(env.WORKER_KINDS).split(',').map(clean).filter(Boolean);
  let kinds = (await kindsFor(db)).filter(k => !only.length || only.includes(k));
  const started = Date.now(), stats = {done:0, review:0, skipped:0, failed:0, retry:0}, errors = {};
  // Automatic STT for this run: at most maxStt clips, and never past the monthly cap (checked in the database).
  const stt = {enabled:kinds.includes('song') && await autoSttReady(db), used:0, limit:Math.max(0, Math.min(MAX_AUTO_STT_PER_RUN, maxStt)), spent:0, capped:false};
  let streak = 0, stopped = false; // consecutive failures: the same problem for every file (settings, network) stops the run
  refsCache.clear(); // each run reads the lyrics fresh
  await db.query('select public.vzip_fail_abandoned_jobs()');
  let cached = null; // the decoded file is shared by the song and vocal jobs of the same recording
  for (let taken = 0; !stopped && kinds.length && taken < maxJobs && Date.now() - started < budgetMs;) {
    const {rows:jobs} = await db.query('select * from public.vzip_claim_analysis_jobs($1, $2, $3)', [worker, Math.min(5, maxJobs - taken), kinds]);
    if (!jobs.length) break;
    // UPDATE … RETURNING has no order: oldest first (song identification before measurements, as claimed).
    jobs.sort((a, b) => (b.kind === 'song') - (a.kind === 'song') || Number(a.id) - Number(b.id));
    if (taken && taken % 50 < jobs.length) log('analysis worker progress: ' + taken + ' · ' + JSON.stringify(stats));
    for (const [i, job] of jobs.entries()) {
      if (stopped) {
        // Not tried in this run: back to the queue without using up an attempt.
        await db.query("update public.vocal_analysis_jobs set status = 'queued', attempts = greatest(0, attempts - 1), locked_at = null, locked_by = null, updated_at = now() where id = $1", [job.id]);
        continue;
      }
      taken++;
      try {
        const {rows:[row]} = await db.query('select metadata from public.vocal_media where id = $1 and user_id = $2', [job.media_id, job.user_id]);
        if (!row) { await finish(db, job, 'skipped', {reason:'recording deleted'}); stats.skipped++; continue; }
        const audio = async () => {
          if (cached?.key !== job.user_id + '/' + job.media_id) {
            const bytes = await readMedia(row.metadata, job.user_id);
            if (verbose) log('  read ok: ' + (bytes.length / 1048576).toFixed(1) + ' MB from ' + (row.metadata.storageProvider === 'r2' ? 'R2' : 'Supabase Storage'));
            const samples = await decode(bytes);
            if (verbose) log('  decoded: ' + (samples.length / 16000).toFixed(1) + ' s of audio');
            cached = {key:job.user_id + '/' + job.media_id, samples};
          }
          return cached.samples;
        };
        await (job.kind === 'vocal' ? vocalJob(db, job, row.metadata, audio) : songJob(db, job, row.metadata, audio, stt));
        const {rows:[after]} = await db.query('select status from public.vocal_analysis_jobs where id = $1', [job.id]);
        if (verbose) {
          const {rows:[m]} = await db.query("select (metadata -> 'analysis' ->> 'v') is not null as measured, coalesce(metadata ->> 'songId', '') <> '' as has_song from public.vocal_media where id = $1 and user_id = $2", [job.media_id, job.user_id]);
          log('  ' + job.kind + ' job → ' + after.status + ' · saved in Supabase: measurement ' + (m.measured ? 'yes' : 'no') + ', song ' + (m.has_song ? 'yes' : 'no'));
        }
        stats[after.status === 'done' ? 'done' : after.status === 'review' ? 'review' : 'skipped']++;
        streak = 0;
      } catch (e) {
        await db.query('rollback').catch(() => {});
        if (e.defer) {
          // This run's STT clips are used up: song jobs wait for the next run (no attempt used); measurements go on.
          await db.query("update public.vocal_analysis_jobs set status = 'queued', attempts = greatest(0, attempts - 1), locked_at = null, locked_by = null, updated_at = now() where id = $1", [job.id]);
          kinds = kinds.filter(k => k !== 'song'); stats.deferred = (stats.deferred || 0) + 1; taken--; continue;
        }
        if (e.setup) {
          // A missing setting, not a broken file: set aside without using up an attempt or stopping the run,
          // and not counted against max_jobs. Queued again once the setting exists (see --requeue).
          await db.query("update public.vocal_analysis_jobs set status = 'failed', attempts = greatest(0, attempts - 1), last_error = $2, locked_at = null, locked_by = null, updated_at = now() where id = $1", [job.id, e.message]);
          stats.setup = (stats.setup || 0) + 1; taken--; continue;
        }
        const last = job.attempts >= 3, message = String(e.message || e).slice(0, 300);
        // A retry waits 30 minutes (held as a fresh lock), so one bad moment does not use up every attempt in one run.
        await db.query("update public.vocal_analysis_jobs set status = $2, last_error = $3, locked_at = case when $2 = 'running' then now() else null end, locked_by = case when $2 = 'running' then 'retry-wait' else null end, updated_at = now() where id = $1",
          [job.id, last ? 'failed' : 'running', message]);
        stats[last ? 'failed' : 'retry']++;
        const kind = message.replace(/["'][^"']*["']/g, '…').slice(0, 80); errors[kind] = (errors[kind] || 0) + 1; // own messages, no file names
        if (++streak >= 8) stopped = true;
      }
    }
  }
  log('analysis worker: ' + JSON.stringify(stats) + ' in ' + Math.round((Date.now() - started) / 1000) + 's');
  if (Object.keys(errors).length) log('analysis worker errors: ' + JSON.stringify(errors));
  if (stopped) log('analysis worker: stopped early after 8 failures in a row (same problem for every file?)');
  if (stt.enabled) {
    // Counts and dollars only (public log).
    const month = await db.query('select spent_usd, cap_usd from public.vzip_auto_stt_month_state()').then(r => r.rows[0], () => null);
    log('automatic STT: ' + stt.used + ' clip(s) this run (≈ $' + stt.spent.toFixed(4) + ')' + (month ? ' · this month $' + Number(month.spent_usd).toFixed(4) + ' / $' + Number(month.cap_usd).toFixed(2) : '') + (stt.capped ? ' · monthly cap reached' : '') + (stats.deferred ? ' · ' + stats.deferred + ' song job(s) left for the next run' : ''));
  } else if (kinds.includes('song') || stats.review) log('automatic STT: off (needs OPENAI_API_KEY and the budget migration)');
  stats.stt = {clips:stt.used, usd:stt.spent, capped:stt.capped};
  stats.errors = errors; stats.stopped = stopped;
  return stats;
}

/** What is wrong with a connection string, without printing it (logs are public): never the password. */
export function describeDbUrl(raw) {
  const notes = [];
  let u; try { u = new URL(raw.trim()); } catch { return 'not a valid URL (it should start with postgresql://)'; }
  const host = u.hostname, user = decodeURIComponent(u.username), pass = u.password;
  const pooler = /\.pooler\.supabase\.com$/.test(host), direct = /^db\.[a-z0-9]+\.supabase\.co$/.test(host);
  notes.push('host=' + (pooler ? 'session/transaction pooler' : direct ? 'DIRECT (use the Session pooler address instead)' : 'other'));
  notes.push('port=' + (u.port || '5432') + (pooler && u.port === '6543' ? ' (transaction pooler: use Session pooler, port 5432)' : ''));
  notes.push('user=' + (/^postgres\.[a-z0-9]{20}$/.test(user) ? 'postgres.<project>' : user === 'postgres' ? 'postgres (the pooler needs postgres.<project>)' : 'unexpected form'));
  notes.push('password=' + (!pass ? 'missing' : /\[|\]|YOUR-PASSWORD/i.test(decodeURIComponent(pass)) ? 'still has [ ] or YOUR-PASSWORD' : 'length ' + decodeURIComponent(pass).length));
  if (raw !== raw.trim()) notes.push('spaces around the value');
  if ((raw.match(/@/g) || []).length > 1) notes.push('more than one @: a special character in the password must be written as %40 etc.');
  return notes.join(', ');
}
// CLI: `node worker/analysis-worker.mjs` (work) or `--peek` (writes jobs=<n> for the workflow to skip setup when idle).
if (import.meta.url === 'file://' + process.argv[1]) {
  if (!env.SUPABASE_DB_URL) { console.log('analysis worker: SUPABASE_DB_URL is not set, nothing to do'); process.exit(0); }
  const db = new pg.Client({connectionString:env.SUPABASE_DB_URL, ssl:env.SUPABASE_DB_SSL === 'off' ? false : {rejectUnauthorized:false}});
  try { await db.connect(); }
  catch (e) { console.log('analysis worker: cannot connect to the database (' + e.message + ')'); console.log('check: ' + describeDbUrl(env.SUPABASE_DB_URL)); process.exit(1); }
  try {
    if (process.argv.includes('--peek')) {
      const kinds = await kindsFor(db);
      const {rows:[r]} = await db.query("select count(*)::int as n from public.vocal_analysis_jobs where attempts < 3 and kind = any($1) and (status = 'queued' or (status = 'running' and locked_at < now() - interval '30 minutes'))", [kinds]);
      console.log('analysis worker: ' + r.n + ' job(s) waiting');
      if (env.GITHUB_OUTPUT) (await import('node:fs')).appendFileSync(env.GITHUB_OUTPUT, 'jobs=' + r.n + '\n');
    } else {
      // Settings first: with a broken R2 setting no job is touched (nothing used up, nothing marked failed).
      const {notes, problems} = preflight();
      for (const n of notes) console.log('settings: ' + n);
      if (problems.length) { for (const p of problems) console.log('settings problem: ' + p); process.exitCode = 1; }
      else {
        if (env.WORKER_REQUEUE_NETWORK === '1') {
          // Jobs that only failed because the file could not be reached go back to the queue, attempts reset.
          const {rowCount} = await db.query("update public.vocal_analysis_jobs set status = 'queued', attempts = 0, last_error = null, locked_at = null, locked_by = null, updated_at = now() where status in ('queued', 'running', 'failed') and (last_error = 'fetch failed' or last_error like 'download network error%' or (last_error = $1 and $2))", [NEEDS_KEY, !!clean(env.SUPABASE_SERVICE_ROLE_KEY)]);
          console.log('analysis worker: ' + rowCount + ' job(s) that failed on the network (or waited for a setting now present) are queued again');
        }
        if (env.WORKER_REQUEUE_STT === '1') {
          // One-off (owner request 2026-11-12): song jobs that stopped at "needs an app request" before automatic STT
          // existed go back to the queue. The automatic-STT rules (unassigned song recordings only, monthly cap) decide
          // what is actually transcribed; anything else returns to the same review state without cost.
          const {rowCount} = await db.query("update public.vocal_analysis_jobs set status = 'queued', attempts = 0, last_error = null, locked_at = null, locked_by = null, updated_at = now() where kind = 'song' and status = 'review' and result->>'requiresRequest' = 'true'");
          console.log('analysis worker: ' + rowCount + ' song job(s) that waited for an app request are queued again');
        }
        const s = await run({db});
        // For the workflow: did this run get anywhere (then it may start the next run while work is left)?
        const processed = ['done', 'review', 'skipped', 'failed', 'retry'].reduce((a, k) => a + (s[k] || 0), 0);
        if (env.GITHUB_OUTPUT) (await import('node:fs')).appendFileSync(env.GITHUB_OUTPUT, 'processed=' + processed + '\nstopped=' + !!s.stopped + '\n');
      }
    }
  } finally { await db.end(); }
}
