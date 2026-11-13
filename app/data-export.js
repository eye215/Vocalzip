/* 내 데이터 전체 내보내기 (설정 › 관리 › 내 데이터 내보내기, #/data-export).
 * Read-only: it only reads the app record (VZ.db), the media list (VZ.media.list / window.vzipReadMedia) and signed
 * links (window.VzipR2.url / prefetch, window.vzipCloudMediaUrl). Nothing on the server or in the media store is written,
 * moved, re-uploaded or re-encoded; the only local write is this page's own progress note (which parts were saved).
 *
 * 1. 기록: one JSON (the whole app record + every recording/score/MR/performance file's metadata) and a CSV of recordings.
 * 2. 원본 파일: original bytes, STOREd (no compression) into ZIP parts ≤ the chosen size (app/data-export-model.js).
 *    Each file is fetched whole (CRC on the fly) before it enters the part, so a broken download never leaves half a
 *    file in a ZIP and can be retried. With the File System Access API the parts stream into a folder the user picks;
 *    otherwise each part becomes a Blob that is downloaded, and the next part is built after it (on iPhone after a tap,
 *    so Safari has finished saving and only one part is in memory). Each part carries manifest.json (file → record id). */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const X = window.VzipDataExportModel, M = VZ.media, esc = VZ.esc;
const storage = () => window.VzipAccountScope?.storage || window.localStorage;
const PROGRESS = 'vzip_data_export_v1';
const MB = 1024 * 1024;
const SIZES = [[250, '250MB'], [500, '500MB'], [1000, '1GB']];
const ios = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canFolder = () => typeof window.showDirectoryPicker === 'function' && window.isSecureContext && !ios();
const fmt = X.formatBytes, n = v => Number(v || 0).toLocaleString('ko-KR');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const abortError = () => new DOMException('멈췄어요.', 'AbortError');

/* ---------- what there is to export ---------- */
const TYPES = {'audio/mp4':'m4a', 'audio/x-m4a':'m4a', 'audio/mpeg':'mp3', 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/flac':'flac', 'audio/aac':'aac', 'audio/ogg':'ogg', 'audio/webm':'webm', 'audio/x-caf':'caf',
  'video/mp4':'mp4', 'video/quicktime':'mov', 'video/webm':'webm', 'application/pdf':'pdf', 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif', 'image/heic':'heic', 'text/plain':'txt'};
const extOf = (...hints) => {
  for (const h of hints) {
    const s = String(h || ''), mime = TYPES[s.split(';')[0].trim().toLowerCase()];
    if (mime) return mime;
    const ext = s.split('/').pop().match(/\.([a-z][a-z0-9]{0,7})$/i)?.[1]; // "original.m4a", "MR.mp3" — not "곡 2026.11.02"
    if (ext) return ext.toLowerCase();
  }
  return 'bin';
};
const ymdOf = ms => Number(ms) > 0 ? VZ.ymd(new Date(Number(ms))) : '';
const songTitle = id => (id != null && VZ.songTitle(id)) || '';
const noonOf = ymd => { const d = VZ.parseYmd?.(ymd); if (d) d.setHours(12, 0, 0, 0); return d || undefined; };
const plainAnalysis = a => { if (!a || typeof a !== 'object') return null; const {curve, ...rest} = a; return rest; };

async function catalog() {
  state.owner = window.vzipCloudUserId?.() || '';
  const media = await M.list(true);
  const listError = M.cloudError?.() || '';
  const db = VZ.db, deleted = new Set((db.deleted?.media || []).map(String));
  const owner = window.vzipCloudUserId?.() || '';
  const used = new Set(), library = [], recordings = [], missing = [];
  // Library: score PDFs (+ OMR .mxl next to them), MR files, performance files — grouped by song / performance.
  const songs = [...(db.songs || [])].filter(s => s && !s.deleted).sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ko'));
  for (const song of songs) {
    const folder = X.safeName(song.title, {max:60, fallback:'곡 ' + song.id});
    for (const s of (song.scores || []).filter(s => s && !s.deleted && s.r2Key)) {
      const date = ymdOf(s.uploadedAt), stem = X.safeName(X.datedTitle(date, s.title || String(s.fileName || '').replace(/\.pdf$/i, '')), {max:80});
      library.push({kind:'score', id:s.id, songId:song.id, songTitle:song.title || '', title:s.title || s.fileName || '', date, month:date.slice(0, 7), size:Number(s.size) || 0,
        r2Key:s.r2Key, path:X.uniquePath('악보/' + folder + '/' + stem + '.pdf', used), group:'library', when:Number(s.uploadedAt) || undefined});
      if (/\/original\.pdf$/.test(s.r2Key))
        library.push({kind:'omr', id:s.id, songId:song.id, songTitle:song.title || '', title:(s.title || '') + ' (MusicXML)', date, month:date.slice(0, 7), size:0, optional:true,
          r2Key:s.r2Key.replace(/original\.pdf$/, 'omr.mxl'), path:X.uniquePath('악보/' + folder + '/' + stem + '.mxl', used), group:'library', when:Number(s.uploadedAt) || undefined});
    }
    for (const t of (song.mrTracks || []).filter(t => t && !t.deleted && t.kind === 'file' && t.r2Key)) {
      const date = ymdOf(t.created), stem = X.safeName(t.title || String(t.fileName || '').replace(/\.[^.]+$/, ''), {max:80});
      library.push({kind:'mr', id:t.id, songId:song.id, songTitle:song.title || '', title:t.title || t.fileName || '', date, month:date.slice(0, 7), size:Number(t.size) || 0,
        r2Key:t.r2Key, path:X.uniquePath('MR/' + folder + '/' + stem + '.' + extOf(t.fileName, t.r2Key, t.type), used), group:'library', when:Number(t.created) || undefined});
    }
  }
  for (const show of db.performances || []) {
    for (const a of (show.assets || []).filter(a => a && a.key && owner && a.ownerId === owner && String(a.key).startsWith('u/' + owner + '/'))) {
      const date = ymdOf(a.created), name = String(a.name || '').replace(/\.[^.]+$/, '');
      library.push({kind:'asset', id:a.id, performanceId:show.id, title:a.name || '', date, month:date.slice(0, 7), size:Number(a.size) || 0, r2Key:a.key,
        path:X.uniquePath('공연 자료/' + X.safeName(show.title || show.work || show.name || '공연', {max:60}) + '/' + X.safeName(name, {max:80}) + '.' + extOf(a.name, a.key, a.type), used), group:'library', when:Number(a.created) || undefined});
    }
  }
  // Recordings: oldest first, foldered by month, named "date title.ext".
  const list = media.filter(m => m && m.id != null && !deleted.has(String(m.id)))
    .sort((a, b) => (M.dateOf(a) || '9999').localeCompare(M.dateOf(b) || '9999') || (Number(a.created) || 0) - (Number(b.created) || 0) || String(a.id).localeCompare(String(b.id)));
  for (const m of list) {
    const blob = M.blobOf(m), date = M.dateOf(m), cloudOk = !!m.cloud && (m.storageProvider === 'r2' ? !!m.r2Key : true);
    const source = blob ? 'device' : cloudOk ? 'cloud' : '';
    const ext = blob ? extOf(M.typeOf(m), m.name) : extOf(m.r2Key, m.type, m.path, m.name);
    const row = {kind:'recording', id:m.id, item:m, songId:m.songId ?? null, songTitle:songTitle(m.songId) || m.song || '', title:M.label(m), date, month:date.slice(0, 7),
      size:blob ? blob.size : Number(m.size || m.savedSize) || 0, source, r2Key:!blob && m.storageProvider === 'r2' ? m.r2Key : '', group:'recordings',
      when:Number(m.created) > 0 && ymdOf(m.created) === date ? Number(m.created) : undefined};
    if (!source) { missing.push(row); continue; }
    row.path = X.uniquePath('녹음/' + (row.month || '날짜 없음') + '/' + X.safeName(X.datedTitle(date, row.title), {max:90}) + '.' + ext, used);
    recordings.push(row);
  }
  return {media:list, library, recordings, missing, listError, files:[...library, ...recordings]};
}

/* ---------- 기록 (JSON / CSV) ---------- */
const clone = v => JSON.parse(JSON.stringify(v ?? null));
const CATS = {song:'곡 녹음', lesson:'레슨 녹음', training:'트레이닝', room:'연습실'};
function recordingMeta(r) {
  const m = r.item, owner = M.owner(m);
  return {id:m.id, name:M.label(m), date:r.date || null, recordedDate:m.recordedDate || null, dateSource:m.dateSource || null, created:Number(m.created) > 0 ? new Date(Number(m.created)).toISOString() : null,
    songId:m.songId ?? null, songTitle:r.songTitle || null, category:M.recordingCategory(m), occasion:M.occasion(m), source:m.source || null,
    lessonId:owner.lesson?.id ?? null, practiceId:owner.practice?.id ?? null, type:M.typeOf(m), size:r.size || null, durationSeconds:Number(m.durationSeconds) || null,
    storage:m.storageProvider === 'r2' ? 'r2' : m.cloud ? 'cloud' : 'device', onDevice:!!M.blobOf(m), inCloud:!!m.cloud, r2Key:m.r2Key || null,
    exportPath:r.path || null, analysis:plainAnalysis(m.analysis)};
}
function recordsJson(cat) {
  const db = VZ.db, fileRow = f => ({kind:f.kind, id:f.id, songId:f.songId ?? null, songTitle:f.songTitle || null, performanceId:f.performanceId ?? null, title:f.title || null, date:f.date || null, size:f.size || null, r2Key:f.r2Key, exportPath:f.path, optional:!!f.optional});
  return {
    format:'vocalzip-records-export', version:1, exportedAt:new Date().toISOString(), appVersion:VZ.version || null, account:{id:window.vzipCloudUserId?.() || null},
    note:'VOCAL.zip 기록 전체와 파일 목록이에요. 녹음·악보 원본 파일은 “원본 파일” 내보내기의 ZIP 파트에 있고, 각 파트의 manifest.json이 파일과 이 기록의 id를 연결해요.',
    counts:{songs:(db.songs || []).length, lessons:(db.lessons || []).length, practices:(db.practices || []).length, assignments:(db.assignments || []).length,
      recordings:cat.recordings.length, recordingsWithoutOriginal:cat.missing.length, scores:cat.library.filter(f => f.kind === 'score').length,
      mrFiles:cat.library.filter(f => f.kind === 'mr').length, performanceFiles:cat.library.filter(f => f.kind === 'asset').length},
    records:clone(db),
    files:{recordings:[...cat.recordings, ...cat.missing].map(recordingMeta), library:cat.library.map(fileRow)}
  };
}
function recordingsCsv(cat) {
  const rows = [...cat.recordings, ...cat.missing].map(r => ({r, m:recordingMeta(r)}));
  const a = x => x.m.analysis?.metrics || {};
  return X.csv(rows, [
    ['날짜', x => x.m.date], ['날짜 근거', x => ({metadata:'파일 정보', filename:'파일 이름', manual:'직접 입력', 'file-modified':'파일 수정일', 'upload-time':'올린 시각'})[x.m.dateSource] || x.m.dateSource || ''],
    ['제목', x => x.m.name], ['곡', x => x.m.songTitle], ['분류', x => CATS[x.m.category] || x.m.category], ['구분', x => M.occasionLabel(x.m.occasion)],
    ['길이(초)', x => x.m.durationSeconds ?? ''], ['크기(바이트)', x => x.m.size ?? ''], ['형식', x => x.m.type], ['위치', x => x.m.onDevice && x.m.inCloud ? '기기+클라우드' : x.m.inCloud ? '클라우드' : x.m.onDevice ? '기기' : '원본 없음'],
    ['분석', x => x.m.analysis ? 'v' + (x.m.analysis.v || 1) : ''], ['음정 평균 오차(cent)', x => a(x).intonation?.meanAbsCents ?? ''],
    ['음역', x => a(x).range?.low && a(x).range?.high ? a(x).range.low + '~' + a(x).range.high : ''], ['노래한 시간(초)', x => a(x).voicedSeconds ?? ''],
    ['내보내기 파일', x => x.m.exportPath || ''], ['id', x => x.m.id], ['R2 키', x => x.m.r2Key || '']
  ]);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return url;
}

/* ---------- 원본 파일 (ZIP parts) ---------- */
let state = {cat:null, loading:null, limit:ios() ? 250 : 500, mode:canFolder() ? 'folder' : 'download'};
let job = null;
function plan(cat, limit) {
  const parts = X.planParts(cat.files, {limit:limit * MB}), total = parts.length, day = VZ.today();
  for (const p of parts) {
    p.total = total; p.number = p.index + 1;
    const [a, b] = [p.months[0], p.months.at(-1)];
    p.label = p.group === 'library' ? '악보·MR·공연 자료' : !a ? '날짜 없는 녹음' : a === b ? a.replace('-', '.') : a.replace('-', '.') + '–' + b.replace('-', '.');
    p.fileName = 'vocalzip-files-' + day + '-' + String(p.number).padStart(2, '0') + 'of' + String(total).padStart(2, '0') + '.zip';
    p.key = X.hex(X.crc32(new TextEncoder().encode(p.files.map(f => f.kind + ':' + f.id + ':' + f.size).join('|'))));
  }
  return parts;
}
const readSaved = () => { try { const v = JSON.parse(storage().getItem(PROGRESS) || 'null'); return v && Array.isArray(v.saved) ? v : {saved:[]}; } catch { return {saved:[]}; } };
const writeSaved = v => { try { storage().setItem(PROGRESS, JSON.stringify(v)); } catch {} };
/** Parts saved earlier stay ticked while their exact file list is unchanged (key = part's files + sizes). */
function markSaved(part, on = true) {
  const v = readSaved(), keys = new Set(v.saved);
  on ? keys.add(part.key) : keys.delete(part.key);
  writeSaved({saved:[...keys].slice(-500), at:Date.now()});
}

function newJob(parts, mode, dir) {
  const saved = new Set(readSaved().saved);
  for (const p of parts) Object.assign(p, {status:saved.has(p.key) ? 'saved' : 'waiting', earlier:saved.has(p.key), done:0, filesDone:0, error:null});
  return {owner:window.vzipCloudUserId?.() || '', parts, mode, dir, at:0, state:'idle', partJob:null, controller:null, pauseRequested:false, failure:null, skip:null, awake:false, lastBlob:null, autoNext:mode === 'folder' || !ios()};
}
function awake(on) { if (!job || job.awake === on) return; job.awake = on; M.keepAwake?.(on); }

function sinkFor(part) {
  if (job.mode === 'folder') {
    let writable = null;
    return {
      async write(chunk) { writable ||= await (await job.dir.getFileHandle(part.fileName, {create:true})).createWritable(); await writable.write(chunk); },
      async close() { await writable?.close(); writable = null; return null; },
      abort() { writable?.abort?.().catch?.(() => {}); writable = null; }
    };
  }
  // In memory: small header chunks are joined every 8 MB; file bodies are already Blobs, so nothing is copied twice.
  const pieces = []; let small = [], smallBytes = 0;
  const flush = () => { if (small.length) { pieces.push(new Blob(small)); small = []; smallBytes = 0; } };
  return {
    write(chunk) { if (chunk instanceof Blob) { flush(); pieces.push(chunk); } else { small.push(chunk); smallBytes += chunk.byteLength; if (smallBytes > 8 * MB) flush(); } },
    async close() { flush(); return new Blob(pieces, {type:'application/zip'}); },
    abort() { pieces.length = 0; small = []; }
  };
}
/** One whole file as a Blob (+ CRC), from this device or a signed cloud link. Null for an optional file that is not there. */
async function fetchFile(f, signal, onBytes) {
  if (f.source === 'device') {
    const blob = M.blobOf(f.item);
    if (!blob) throw Error('이 기기의 파일을 읽지 못했어요.');
    const crc = await X.crcOfBlob(blob, signal); // read once for the CRC; the ZIP then refers to the same Blob (no copy)
    onBytes(blob.size);
    return {blob, crc, size:blob.size};
  }
  const url = f.kind === 'recording' && !f.r2Key ? await window.vzipCloudMediaUrl(f.item) : await window.VzipR2.url(f.r2Key);
  if (signal.aborted) throw abortError();
  const res = await fetch(url, {signal, cache:'no-store'});
  if (f.optional && (res.status === 404 || res.status === 403)) { await res.body?.cancel?.(); return null; }
  if (!res.ok) { const e = Error(res.status === 404 ? '저장소에 파일이 없어요 (404)' : '파일을 받지 못했어요 (' + res.status + ')'); e.status = res.status; throw e; }
  const reader = res.body.getReader(), pieces = [];
  let crc = 0, size = 0, chunk = [], chunkBytes = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    crc = X.crc32(value, crc); size += value.byteLength; chunk.push(value); chunkBytes += value.byteLength;
    if (chunkBytes >= 8 * MB) { pieces.push(new Blob(chunk)); chunk = []; chunkBytes = 0; }
    onBytes(size);
  }
  if (chunk.length) pieces.push(new Blob(chunk));
  const expected = Number(res.headers.get('content-length'));
  if (expected > 0 && expected !== size && !res.headers.get('content-encoding')) throw Error('파일을 끝까지 받지 못했어요 (' + size + '/' + expected + ')');
  return {blob:new Blob(pieces, {type:res.headers.get('content-type') || ''}), crc, size};
}
async function withRetry(fn, signal) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (e.name === 'AbortError' || signal.aborted || [401, 403, 404].includes(e.status) || attempt >= 2) throw e;
      await sleep(1000 * (attempt + 1) ** 2);
    }
  }
}
async function buildPart(part) {
  let pj = job.partJob;
  if (!pj || pj.part !== part) {
    pj?.sink.abort(); job.lastBlob = null;
    // iPhone: the user tapped "다음 파트" after Safari saved the last one, so its memory can go before the next part is built.
    if (!job.autoNext && job.lastUrl) { URL.revokeObjectURL(job.lastUrl); job.lastUrl = null; }
    const sink = sinkFor(part);
    pj = job.partJob = {part, sink, zip:X.createZip(c => sink.write(c)), next:0, rows:[], bytes:0, extras:part.index === 0};
    part.done = 0; part.filesDone = 0;
  }
  part.status = 'building'; part.error = null; paint();
  window.VzipR2?.prefetch?.(part.files.slice(pj.next).filter(f => f.r2Key && f.source !== 'device').map(f => f.r2Key))?.catch?.(() => {});
  if (pj.extras) { // the first part also carries the 기록 JSON/CSV, so one ZIP is a self-contained backup
    const enc = new TextEncoder(), cat = state.cat;
    await pj.zip.add('기록/vocalzip-records.json', enc.encode(JSON.stringify(recordsJson(cat), null, 1)));
    await pj.zip.add('기록/recordings.csv', enc.encode(recordingsCsv(cat)));
    pj.extras = false;
  }
  while (pj.next < part.files.length) {
    if (job?.partJob !== pj) throw abortError(); // cancelled (or replaced) while a file was being read
    // A pause (잠시 멈추기, or leaving the screen) that arrived while nothing was downloading, e.g. while a file was being
    // written into the ZIP, had no request to abort: stop here instead of carrying on with the next file.
    if (job.pauseRequested) throw abortError();
    const f = part.files[pj.next], base = {path:f.path, kind:f.kind, id:f.id, songId:f.songId ?? null, performanceId:f.performanceId ?? null, date:f.date || null, source:f.source || 'cloud', r2Key:f.r2Key || null};
    if (job.skip === f) { job.skip = null; pj.rows.push({...base, status:'skipped', error:job.failure?.message || ''}); job.failure = null; pj.next++; part.filesDone++; continue; }
    const controller = job.controller = new AbortController();
    let got;
    try { got = await withRetry(() => fetchFile(f, controller.signal, bytes => progress(part, pj.bytes + bytes)), controller.signal); }
    catch (e) {
      if (e.name === 'AbortError' || controller.signal.aborted) throw abortError();
      job.failure = {part, file:f, message:e.message || String(e)};
      throw e;
    }
    if (got) {
      const r = await pj.zip.add(f.path, got.blob, {date:f.when ? new Date(f.when) : noonOf(f.date), ...(got.crc != null ? {crc:got.crc, size:got.size} : {})});
      pj.rows.push({...base, size:r.size, crc32:X.hex(r.crc), status:'ok'});
      pj.bytes += Math.max(f.size, r.size);
    } else { pj.rows.push({...base, status:'absent'}); pj.bytes += f.size; }
    pj.next++; part.filesDone++; progress(part, pj.bytes);
  }
  const manifest = {format:'vocalzip-files-export', version:1, exportedAt:new Date().toISOString(), account:window.vzipCloudUserId?.() || null,
    part:{number:part.number, total:part.total, label:part.label, fileName:part.fileName},
    note:'원본 파일을 압축·변환하지 않고 그대로 담았어요. id는 기록 JSON(vocalzip-records.json)의 녹음·악보·MR id와 같아요. status: ok 포함, absent 원본 없음(선택 파일), skipped 받지 못해 건너뜀.',
    files:pj.rows};
  await pj.zip.add('manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 1)));
  await pj.zip.finish();
  const blob = await pj.sink.close();
  job.partJob = null;
  return blob;
}
let painted = 0;
function progress(part, bytes) {
  part.done = bytes;
  const now = Date.now(); if (now - painted < 200) return; painted = now;
  const row = document.querySelector('[data-part="' + part.index + '"]');
  if (!row) return;
  row.querySelector('[data-bar]')?.style.setProperty('--p', Math.min(100, part.bytes ? bytes / part.bytes * 100 : 0).toFixed(1) + '%');
  const line = row.querySelector('[data-line]'); if (line) line.textContent = partLine(part);
}
async function pump() {
  if (!job || job.pumping) return;
  const j = job;
  job.pumping = true; job.state = 'running'; job.pauseRequested = false; awake(true); paint();
  try {
    while (job.at < job.parts.length) {
      const part = job.parts[job.at];
      if (part.status === 'saved') { job.at++; continue; }
      const blob = await buildPart(part);
      if (job.mode === 'download') { job.lastBlob = blob; job.lastUrl = download(blob, part.fileName); }
      part.status = 'saved'; part.earlier = false; markSaved(part); part.done = part.bytes;
      job.at++;
      const more = job.parts.slice(job.at).some(p => p.status !== 'saved');
      if (more && !job.autoNext) { job.state = 'next'; return; }
      if (more && job.mode === 'download') { paint(); await sleep(1500); if (job.pauseRequested) throw abortError(); }
    }
    job.state = 'done'; job.lastBlob = job.mode === 'download' ? job.lastBlob : null;
  } catch (e) {
    if (job !== j || j.cancelled) return;
    const part = job.parts[job.at];
    if (e.name === 'AbortError') { job.state = 'paused'; if (part && part.status === 'building') part.status = 'paused'; }
    else { job.state = 'failed'; if (part) { part.status = 'failed'; part.error = job.failure ? job.failure.message : e.message; } if (!job.failure) job.failure = {part, file:null, message:e.message || String(e)}; if (!job.failure.file) { job.partJob?.sink.abort(); job.partJob = null; } }
  } finally {
    if (job === j) { j.pumping = false; j.controller = null; awake(false); }
    paint();
  }
}
function pause() { if (!job || job.state !== 'running') return; job.pauseRequested = true; job.controller?.abort(); }
function cancel() {
  if (!job) return;
  job.cancelled = true; job.controller?.abort(); job.partJob?.sink.abort(); awake(false); job = null; paint();
}

/* ---------- page ---------- */
function partLine(p) {
  const size = fmt(p.bytes);
  if (p.status === 'saved') return (p.earlier ? '이전에 저장함' : job?.mode === 'folder' ? '폴더에 저장했어요' : '다운로드를 시작했어요') + ' · ' + n(p.files.length) + '개 · ' + size;
  if (p.status === 'building') return '만드는 중 ' + n(p.filesDone) + '/' + n(p.files.length) + '개 · ' + fmt(p.done) + ' / ' + size;
  if (p.status === 'paused') return '멈춤 ' + n(p.filesDone) + '/' + n(p.files.length) + '개 · ' + fmt(p.done) + ' / ' + size;
  if (p.status === 'failed') return '멈춤 · 확인 필요';
  return n(p.files.length) + '개 · ' + size;
}
function summaryHtml(cat) {
  const lib = k => cat.library.filter(f => f.kind === k), bytes = list => list.reduce((s, f) => s + (Number(f.size) || 0), 0);
  const device = cat.recordings.filter(f => f.source === 'device').length;
  const rows = [['녹음', cat.recordings], ['악보 PDF', lib('score')], ['MR', lib('mr')], ['공연 자료', lib('asset')]].filter(r => r[1].length || r[0] === '녹음');
  return '<dl class="vz-export-stats">' + rows.map(([label, list]) => '<div><dt>' + label + '</dt><dd>' + n(list.length) + '개 · ' + fmt(bytes(list)) + '</dd></div>').join('') +
    '<div class="vz-export-total"><dt>합계</dt><dd>' + fmt(bytes(cat.files)) + '</dd></div></dl>' +
    (lib('omr').length ? '<p class="vz-export-note">악보마다 변환된 MusicXML(.mxl)이 있으면 함께 담아요.</p>' : '') +
    (device ? '<p class="vz-export-note">이 기기에만 있는 녹음 ' + n(device) + '개도 포함해요.</p>' : '') +
    (cat.missing.length ? '<p class="vz-export-note vz-export-warn">원본을 찾지 못한 녹음 ' + n(cat.missing.length) + '개는 기록(JSON·CSV)에만 남아요.</p>' : '') +
    (cat.listError ? '<p class="vz-export-note vz-export-warn" role="alert">' + esc(cat.listError) + ' 지금 보이는 파일만 내보내요.</p>' : '');
}
function controlsHtml() {
  const cat = state.cat;
  if (!cat) return '';
  if (!cat.files.length) return '<p class="vz-export-note">내보낼 파일이 없어요.</p>';
  if (!job) {
    const parts = plan(cat, state.limit), saved = new Set(readSaved().saved), left = parts.filter(p => !saved.has(p.key)).length;
    const seg = SIZES.map(([v, label]) => '<button type="button" data-limit="' + v + '" aria-pressed="' + (state.limit === v) + '">' + label + '</button>').join('');
    const dest = canFolder() ? '<fieldset class="vz-export-dest"><legend>저장 방법</legend>' +
      '<label><input type="radio" name="vz-export-mode" value="folder"' + (state.mode === 'folder' ? ' checked' : '') + '><span><b>폴더에 바로 저장</b><small>폴더를 한 번 고르면 파트를 차례로 저장해요</small></span></label>' +
      '<label><input type="radio" name="vz-export-mode" value="download"' + (state.mode === 'download' ? ' checked' : '') + '><span><b>파트마다 다운로드</b><small>브라우저의 다운로드 폴더에 저장돼요</small></span></label></fieldset>' : '';
    return '<div class="vz-export-field"><span id="vz-export-size">파트 크기</span><div class="vz-export-seg" role="group" aria-labelledby="vz-export-size">' + seg + '</div></div>' + dest +
      '<p class="vz-export-note">' + n(parts.length) + '개 파트로 나눠요' + (ios() ? '. iPhone에서는 파트 하나를 저장할 때마다 “다음 파트”를 눌러 주세요. 메모리를 아끼려고 한 번에 한 파트만 만들어요.' : '.') + '</p>' +
      (left ? '<button type="button" class="btn block" data-start><i class="ph ph-download-simple"></i>' + (left < parts.length ? '남은 파트 ' + n(left) + '개 이어서 받기' : '원본 파일 내보내기 시작') + '</button>'
        : '<p class="vz-export-note vz-export-ok">모든 파트를 저장했어요.</p>') +
      (left < parts.length ? '<button type="button" class="btn ghost block" data-reset>처음부터 다시 받기</button>' : '') +
      '<ol class="vz-export-parts">' + parts.map(p => partHtml(p, saved.has(p.key) ? 'saved-earlier' : 'idle')).join('') + '</ol>';
  }
  const s = job.state, f = job.failure;
  const next = job.parts.findIndex((p, i) => i >= job.at && p.status !== 'saved');
  const main = s === 'running' ? '<button type="button" class="btn secondary block" data-pause><i class="ph ph-pause"></i>잠시 멈추기</button>'
    : s === 'paused' ? '<button type="button" class="btn block" data-resume><i class="ph ph-play"></i>이어서 받기</button>'
    : s === 'next' ? '<button type="button" class="btn block" data-next><i class="ph ph-arrow-right"></i>다음 파트 만들기 (' + n(next + 1) + '/' + n(job.parts.length) + ')</button>'
    : s === 'failed' ? '<div class="vz-export-fail" role="alert"><p><b>' + esc(f?.file ? '“' + (f.file.path.split('/').pop()) + '”을(를) 받지 못했어요' : '파트를 만들지 못했어요') + '</b><span>' + esc(f?.message || '') + '</span></p>' +
        '<div class="vz-export-row"><button type="button" class="btn" data-retry><i class="ph ph-arrow-clockwise"></i>다시 시도</button>' + (f?.file ? '<button type="button" class="btn secondary" data-skip>이 파일 건너뛰기</button>' : '') + '</div></div>'
    : s === 'done' ? '<p class="vz-export-note vz-export-ok" role="status">모든 파트를 ' + (job.mode === 'folder' ? '폴더에 저장했어요.' : '내려받았어요. 다운로드 폴더(iPhone은 파일 앱 › 다운로드)를 확인해 주세요.') + '</p>' : '';
  const again = job.mode === 'download' && job.lastBlob && ['next', 'done', 'paused', 'failed'].includes(s) ? '<button type="button" class="btn ghost block" data-again>방금 파트 다시 저장</button>' : '';
  const stop = s !== 'done' ? '<button type="button" class="btn ghost block" data-cancel>내보내기 그만두기</button>' : '<button type="button" class="btn ghost block" data-cancel>닫기</button>';
  return '<div class="vz-export-run" aria-live="polite">' + main + again + '</div><ol class="vz-export-parts">' + job.parts.map(p => partHtml(p)).join('') + '</ol>' + stop;
}
function partHtml(p, idle) {
  const status = idle === 'saved-earlier' ? 'saved' : idle === 'idle' ? 'waiting' : p.status;
  const line = idle === 'saved-earlier' ? '이전에 저장함 · ' + n(p.files.length) + '개 · ' + fmt(p.bytes) : idle === 'idle' ? n(p.files.length) + '개 · ' + fmt(p.bytes) : partLine(p);
  const pct = status === 'saved' ? 100 : p.bytes ? Math.min(100, (p.done || 0) / p.bytes * 100) : 0;
  const redo = !job || !['running'].includes(job.state) ? (status === 'saved' && job ? '<button type="button" class="vz-export-redo" data-redo="' + p.index + '">다시 받기</button>' : '') : '';
  return '<li data-part="' + p.index + '" data-status="' + status + '"><div class="vz-export-part-head"><b>파트 ' + n(p.number) + '/' + n(p.total) + '</b><span>' + esc(p.label) + '</span>' + redo + '</div>' +
    '<div class="vz-export-bar" data-bar style="--p:' + pct.toFixed(1) + '%" aria-hidden="true"></div><small data-line>' + esc(line) + '</small></li>';
}
function paint() {
  const host = document.querySelector('[data-export-files]');
  if (!host) return;
  host.querySelector('[data-export-summary]').innerHTML = state.cat ? summaryHtml(state.cat) : state.error ? '<p class="vz-export-note vz-export-warn" role="alert">' + esc(state.error) + '</p><button type="button" class="btn secondary" data-reload>다시 확인</button>' : '<p class="vz-export-note">파일 목록을 확인하는 중…</p>';
  host.querySelector('[data-export-controls]').innerHTML = controlsHtml();
}
async function load(force) {
  if (state.loading && !force) return state.loading;
  state.error = '';
  state.loading = catalog().then(cat => { state.cat = cat; }, e => { state.error = '파일 목록을 불러오지 못했어요: ' + (e.message || e); }).finally(() => { state.loading = null; paint(); });
  return state.loading;
}
async function start() {
  if (job || !state.cat) return;
  let dir = null;
  const mode = canFolder() ? state.mode : 'download';
  if (mode === 'folder') {
    try { dir = await window.showDirectoryPicker({id:'vocalzip-export', mode:'readwrite', startIn:'downloads'}); }
    catch (e) { if (e.name !== 'AbortError') VZ.toast('폴더를 열지 못했어요: ' + e.message, 'error'); return; }
  }
  const total = state.cat.files.reduce((s, f) => s + (Number(f.size) || 0), 0);
  if (total > 2 * 1024 ** 3 && !await VZ.confirm('원본 파일 내보내기', '모두 ' + fmt(total) + '예요. 인터넷 속도에 따라 오래(수십 분~몇 시간) 걸릴 수 있어요. 받는 동안 이 화면을 켜 두세요. 중간에 멈춰도 저장한 파트부터 이어서 받을 수 있어요.', {ok:'시작'})) return;
  job = newJob(plan(state.cat, state.limit), mode, dir);
  pump();
}

function onClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  const ds = t.dataset;
  if ('limit' in ds) { state.limit = Number(ds.limit); paint(); }
  else if ('start' in ds) start();
  else if ('reset' in ds) { if (!job) { writeSaved({saved:[]}); paint(); } }
  else if ('pause' in ds) pause();
  else if ('resume' in ds || 'next' in ds) { job.lastBlob = null; pump(); }
  else if ('retry' in ds) { job.failure = null; pump(); }
  else if ('skip' in ds) { job.skip = job.failure?.file || null; pump(); }
  else if ('again' in ds) { const p = job.parts[Math.max(0, job.at - 1)]; if (job.lastBlob) job.lastUrl = download(job.lastBlob, p.fileName); }
  else if ('redo' in ds) { const p = job.parts[Number(ds.redo)]; if (!p) return; markSaved(p, false); p.status = 'waiting'; p.earlier = false; p.done = 0; job.at = Math.min(job.at, p.index); if (job.state === 'done' || job.state === 'next') job.state = 'paused'; paint(); }
  else if ('cancel' in ds) { if (job?.state === 'done') { job = null; paint(); return; } VZ.confirm('내보내기 그만두기', '지금 만들던 파트는 버려요. 이미 저장한 파트는 그대로 남고 다음에 이어서 받을 수 있어요. 서버의 파일은 바뀌지 않아요.', {ok:'그만두기'}).then(ok => { if (ok) cancel(); }); }
  else if ('reload' in ds) load(true);
}

VZ.route('data-export', {title:'내 데이터 내보내기', back:true, tab:'home', noAutoRefresh:true,
  render() {
    const db = VZ.db;
    return '<div class="vz-export">' +
      '<p class="vz-export-lead">내 기록과 파일을 이 기기에 백업해요. 서버의 기록과 파일은 바꾸거나 지우지 않아요.</p>' +
      '<section class="vz-export-card" aria-labelledby="vz-export-records"><h2 id="vz-export-records">기록</h2>' +
        '<p class="vz-export-note">곡 ' + n(db.songs?.length) + '개 · 레슨 ' + n(db.lessons?.length) + '개 · 연습 ' + n(db.practices?.length) + '개, 목표·계획·분석 요약·설정과 녹음·악보 파일 목록을 바로 받아요. 파일 원본은 들어 있지 않아요.</p>' +
        '<div class="vz-export-row"><button type="button" class="btn" data-json><i class="ph ph-file-text"></i>기록 JSON</button><button type="button" class="btn secondary" data-csv><i class="ph ph-table"></i>녹음 목록 CSV</button></div></section>' +
      '<section class="vz-export-card" data-export-files aria-labelledby="vz-export-files-title"><h2 id="vz-export-files-title">원본 파일</h2>' +
        '<div data-export-summary></div>' +
        '<p class="vz-export-note">녹음은 압축·변환하지 않은 원본 그대로, 악보 PDF·MR과 함께 ZIP 파트로 나눠 받아요. 파일 이름은 “날짜 제목”이고, 파트마다 manifest.json에 기록 id가 있어요. 크기가 커서 오래 걸릴 수 있어요. 받는 동안 이 화면을 켜 두세요.</p>' +
        '<div data-export-controls></div></section>' +
      '</div>';
  },
  mount(main) {
    // Listen on this screen's own root, not on #view: #view outlives the screen, and other screens use the same
    // data-* names (녹음 취소, 연습 세트 시작하기 …), which must never reach the export.
    const root = main.querySelector('.vz-export');
    root.addEventListener('click', onClick);
    root.addEventListener('change', e => { if (e.target.name === 'vz-export-mode') state.mode = e.target.value; });
    const records = async kind => {
      try {
        if (!state.cat) await load();
        if (!state.cat) throw Error(state.error || '파일 목록을 불러오지 못했어요.');
        const day = VZ.today();
        if (kind === 'json') download(new Blob([JSON.stringify(recordsJson(state.cat), null, 1)], {type:'application/json'}), 'vocalzip-records-' + day + '.json');
        else download(new Blob([recordingsCsv(state.cat)], {type:'text/csv;charset=utf-8'}), 'vocalzip-recordings-' + day + '.csv');
      } catch (e) { VZ.toast('기록을 내보내지 못했어요: ' + e.message, 'error'); }
    };
    main.querySelector('[data-json]').onclick = () => records('json');
    main.querySelector('[data-csv]').onclick = () => records('csv');
    VZ.setGuard(() => job && ['running'].includes(job.state) ? '파일을 내보내는 중이에요. 나가면 지금 파트를 멈춰요. 저장한 파트는 남고 나중에 이어서 받을 수 있어요. 나갈까요?' : '');
    paint();
    if (!job) load(true);
  },
  leave() { pause(); }
});
window.addEventListener('beforeunload', e => { if (job?.state === 'running') { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('vzip:auth-changed', () => {
  const owner = window.vzipCloudUserId?.() || '';
  if (job && owner !== job.owner) cancel();
  if (state.owner !== undefined && state.owner !== owner) { state.cat = null; if (document.querySelector('[data-export-files]')) load(true); }
});
window.VzipAccountScope?.beforeLeave?.(() => { cancel(); state.cat = null; });
VZ.dataExport = {catalog, recordsJson, recordingsCsv, plan};
})();
