/* VOCAL.zip — 기존 자료 가져오기 (Media PRD step A).
 * Pick many files from Photos / iCloud Drive / Voice Memos, read their capture date and length
 * without extracting, filter by date and length, flag duplicates and missing dates, suggest songs,
 * then import only what the user confirmed. Nothing is uploaded before the user presses import. */
(() => {
'use strict';
const localStorage = window.VzipAccountScope?.storage || window.localStorage;

const VZ = window.VZ, M = VZ.media, esc = VZ.esc;
const SOURCES = {
  photos:{icon:'images', title:'사진 앱 / iCloud 사진', sub:'노래·레슨 영상', accept:'video/*,.mov,.mp4,.m4v', start:'2025-12-31', end:'2026-09-13',
    tip:'사진 보관함에서 영상을 여러 개 선택하세요. 영상은 원본 음성만 추출해 저장해요.'},
  drive:{icon:'cloud', title:'iCloud Drive', sub:'음원·영상 파일', accept:'audio/*,video/*,.m4a,.mp3,.wav,.aac,.flac,.ogg,.mov,.mp4,.m4v', start:'', end:'',
    tip:'파일 앱에서 폴더를 열고 여러 파일을 선택하세요.'},
  memo:{icon:'microphone', title:'음성 메모', sub:'노래 연습 녹음', accept:'audio/*,.m4a,.mp3,.wav,.aac,.caf', start:'2025-07-24', end:'today',
    tip:'음성 메모 앱에서 녹음을 선택 → 공유 → "파일에 저장"으로 한 폴더에 모은 뒤, 여기서 그 폴더의 파일을 여러 개 선택하세요.'},
  folder:{icon:'folder-open', title:'컴퓨터 폴더', sub:'맥·PC 브라우저에서 폴더째', accept:'audio/*,video/*,.m4a,.mp3,.wav,.aac,.caf,.flac,.ogg,.webm,.mov,.mp4,.m4v', start:'', end:'', folder:true,
    tip:'폴더를 고르거나 이 화면에 끌어다 놓으면 하위 폴더까지 음성·영상 파일만 골라 분석해요. 아이폰·아이패드에서는 폴더 선택이 안 돼요.'},
  vocalzip:{icon:'archive', title:'기존 Vocalzip', sub:'저장된 파일 이전', accept:'', disabled:true,
    tip:'Cloudflare R2 저장소를 설정하면 기존 파일을 옮길 수 있어요. 지금은 기존 저장소(기기·클라우드)에 그대로 안전하게 보관돼요.'}
};
const KEY = 'vzip_import_hub_conditions_v1';
const SOURCE_TYPE = {photos:'photos', drive:'icloud-drive', memo:'voice-memo', folder:'computer-folder'};
let hub = fresh();
function fresh() { return {source:null, phase:'source', rows:[], filter:'all', group:false, autoPractice:true, progress:'', cond:null, occasion:'practice', limit:100}; }
/* ---------- upload queue (kept across reloads) ----------
 * Only identifiers and states are stored (no file data). After Safari closes, the files must be picked again; files the
 * server already has (same content fingerprint) are then left out automatically. */
const QKEY = 'vzip_upload_queue_v1';
const loadQueue = () => { try { return JSON.parse(localStorage.getItem(QKEY) || 'null'); } catch { return null; } };
let qTimer = null;
function saveQueue(now) {
  const write = () => { qTimer = null; try {
    const rows = hub.rows.filter(r => r.queued);
    if (!rows.length) return;
    localStorage.setItem(QKEY, JSON.stringify({id:hub.batch, source:hub.source, startedAt:hub.startedAt, updatedAt:Date.now(), user:window.vzipCloudUserId?.() || '', pendingCount:hub.pendingFiles?.length || 0, total:hub.totalFiles || rows.length,
      items:rows.map(r => ({id:r.id, name:r.name, size:r.size, hash:r.hash || '', state:r.state, error:r.state === 'failed' ? r.msg || '' : '', doneAt:r.doneAt || 0}))}));
  } catch {} };
  if (now) { clearTimeout(qTimer); write(); } else if (!qTimer) qTimer = setTimeout(write, 1500);
}
const counts = rows => {
  const c = {total:rows.length, done:0, uploading:0, waiting:0, failed:0, dup:0, skipped:0};
  for (const r of rows) c[r.state === 'done' ? 'done' : r.state === 'uploading' ? 'uploading' : r.state === 'failed' ? 'failed' : r.state === 'dup' ? 'dup' : r.state === 'skipped' ? 'skipped' : 'waiting']++;
  return c;
};
/** Errors that are not the file's fault: wait and try again instead of counting a failure. */
const isAuth = e => /로그인|auth|JWT|401|403/i.test(e?.message || '');
const isBusy = e => /다른 파일을 업로드/.test(e?.message || '');
const isNetwork = e => e?.name === 'TypeError' || /network|load failed|fetch|연결|timeout|중단/i.test(e?.message || '');
function conditionsFor(source) {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}')[source] || {}; } catch {}
  const s = SOURCES[source];
  const min = saved.min == null || saved.min === 30 && saved.minPolicy !== 25 ? 25 : Math.max(25, saved.min);
  return {start:saved.start ?? s.start, end:saved.end ?? (s.end === 'today' ? VZ.today() : s.end), min, max:saved.max ?? 480};
}
function saveConditions() { try { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[hub.source] = {...hub.cond, minPolicy:25, end:hub.source === 'memo' && hub.cond.end === VZ.today() ? undefined : hub.cond.end}; localStorage.setItem(KEY, JSON.stringify(all)); } catch {} }
const mmss = sec => sec == null ? '—' : VZ.clock(sec);
const parseMmss = text => { const m = String(text).trim().match(/^(\d+)(?::(\d{1,2}))?$/); return m ? Number(m[1]) * (m[2] != null ? 60 : 1) + Number(m[2] || 0) : null; };
const dateFromName = name => { const m = String(name).match(/(20\d{2})[-._ ]?(0[1-9]|1[0-2])[-._ ]?(0[1-9]|[12]\d|3[01])/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; };

/* ---------- lessons and folders ---------- */
const lessonsOn = date => date ? VZ.db.lessons.filter(l => l.date === date && VZ.lessonStatus(l) !== 'cancelled') : [];
const mediaOnly = files => files.filter(f => !/^\.|^__MACOSX$/.test(f.name) && !/(^|\/)(\.|__MACOSX)/.test(f.webkitRelativePath || '') && /^(audio|video)\//.test(M.typeOf(f)));
/** Files dropped on the page, including everything inside dropped folders. */
async function droppedFiles(dt) {
  const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])];
  const out = [];
  const walk = async entry => {
    if (entry.isFile) { out.push(await new Promise((res, rej) => entry.file(res, rej))); return; }
    const reader = entry.createReader();
    for (let batch; (batch = await new Promise((res, rej) => reader.readEntries(res, rej))).length;) for (const e of batch) await walk(e);
  };
  for (const e of entries) await walk(e);
  return out;
}
function pickFiles(all) {
  const files = mediaOnly(all), skipped = all.length - files.length;
  if (skipped) VZ.toast('음성·영상이 아닌 파일 ' + skipped + '개는 건너뛰었어요.');
  if (files.length) analyze(files); else if (all.length) VZ.toast('가져올 음성·영상 파일이 없어요.', 'error');
}

/* ---------- song suggestion (file name / title / show / aliases; no transcription yet) ---------- */
const norm = t => String(t || '').toLowerCase().normalize('NFC').replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^0-9a-z가-힣]+/g, ' ').trim();
VZ.suggestSongs = name => {
  const n = norm(name), compact = n.replace(/ /g, ''), words = new Set(n.split(' ').filter(w => w.length > 1));
  const out = [];
  for (const s of VZ.db.songs) {
    let best = 0;
    for (const label of [s.title, ...(s.aliases || [])]) {
      const l = norm(label), lc = l.replace(/ /g, '');
      if (lc.length >= 2 && compact.includes(lc)) best = Math.max(best, 0.95);
      else { const lw = l.split(' ').filter(w => w.length > 1); if (lw.length) { const hit = lw.filter(w => words.has(w)).length / lw.length; if (hit >= 0.5) best = Math.max(best, 0.4 + hit * 0.4); } }
    }
    if (best) out.push({id:s.id, score:best});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
};

/* ---------- analysis ---------- */
/** What the library already has (fresh from the server) and what a stopped upload already finished. */
async function knownFiles() {
  const existing = await M.list(true).catch(() => []); // fresh: what the server has now decides what is a duplicate
  const known = {hash:new Set(existing.map(m => m.fileHash).filter(Boolean)), nameSize:new Set(existing.map(m => (m.originalMedia?.name || m.originalFilename || '') + '|' + (m.originalMedia?.size || m.size || ''))), seen:new Map()};
  // Files saved through the quick 파일 가져오기 kept no fingerprint or original name: their name (the file name without the
  // extension, when no song was chosen) plus the exact size still identifies them.
  known.baseSize = new Set(existing.filter(m => m.size).map(m => baseKey(m.name, m.size)));
  // Files a stopped upload already finished count as already in the library (by content fingerprint and name+size).
  for (const q of loadQueue()?.items || []) if (q.state === 'done') { if (q.hash) known.hash.add(q.hash); known.nameSize.add(q.name + '|' + q.size); }
  return known;
}
const baseKey = (name, size) => String(name || '').replace(/\.[^.]+$/, '').trim().toLowerCase() + '|' + size;
/** Read one picked file's date, length and fingerprint (nothing is uploaded) and flag duplicates. */
async function inspectFile(file, known) {
  const row = {id:VZ.uid(), file, name:file.name, size:file.size, type:M.typeOf(file), state:'pending', song:'', approved:false, occasion:hub.occasion || 'practice'};
  try {
    const info = await window.vzipInspectMedia(file);
    row.readable = info.readable !== false;
    row.duration = info.duration ?? (await M.measure({blob:file, type:row.type, name:file.name}, 8000) || null);
    row.video = info.hasVideo || row.type.startsWith('video/');
    const meta = info.metadata || {};
    const fromName = dateFromName(file.name), named = window.VzipMediaDates?.fromName?.(file.name);
    // A full yyyy-MM-dd_HH-mm-ss name is the user's own label and wins; then the file's own capture/recording date;
    // a date-only name next; anything else waits for the user.
    if (named) Object.assign(row, {date:named.recordedDate, dateSource:'filename', dateOk:true});
    else if (meta.dateSource === 'metadata') Object.assign(row, {date:meta.recordedDate, dateSource:'metadata', dateOk:true});
    else if (fromName) Object.assign(row, {date:fromName, dateSource:'filename', dateOk:true});
    else Object.assign(row, {date:meta.recordedDate || '', dateSource:'unconfirmed', dateOk:false});
    row.hash = await M.fingerprint(file);
  } catch (e) { row.error = e.message; }
  if (!/^(audio|video)\//.test(row.type)) row.error = '지원하지 않는 형식이에요.';
  row.dup = known.hash.has(row.hash) || known.nameSize.has(file.name + '|' + file.size) || known.baseSize.has(baseKey(file.name, file.size)) ? '전체 녹음에 이미 있어요' : known.seen.has(row.hash) ? '선택한 파일끼리 같아요' : '';
  if (row.hash && !known.seen.has(row.hash)) known.seen.set(row.hash, row);
  const sug = VZ.suggestSongs(file.name);
  row.suggestions = sug; if (sug[0]?.score >= 0.9) row.song = sug[0].id;
  evaluate(row);
  row.selected = row.status === 'ok';
  VZ.processingLog?.record(row.id, {originalName:row.name, size:row.size, state:row.error?'failed':'review', error:row.error||'', songId:row.song, songSource:row.song?'파일명 추천 (가져오기 전 확인)':'미지정', date:row.date, dateSource:row.dateSource});
  return row;
}
async function analyze(files) {
  hub.phase = 'analyzing'; hub.rows = []; draw();
  const known = await knownFiles();
  for (const [i, file] of files.entries()) {
    hub.progress = '파일 확인 중 ' + (i + 1) + '/' + files.length + ' · ' + file.name; drawProgress();
    hub.rows.push(await inspectFile(file, known));
  }
  hub.phase = 'review'; hub.progress = ''; draw();
}
/* ---------- automatic batches (many files from 파일 가져오기) ----------
 * No review step: files are checked and uploaded in short windows, one batch after another. Duplicates are left out,
 * unreadable files are listed as failed, and a file without any date keeps the date the file itself carries
 * (file modified) — it can be changed later in the library. Pausing keeps the remaining files for "이어서 올리기". */
const BATCH = () => window.__vzipBatchSize || 4; // tests use small batches
async function runAuto(files) {
  if (hub.running || hub.autoRunning) return;
  if (!window.vzipCloudSignedIn?.()) { VZ.toast('여러 파일을 한꺼번에 올리려면 먼저 로그인해 주세요. 로그인 후 다시 선택하면 돼요.', 'error'); if (files) { hub = fresh(); draw(); } return; }
  if (files) { hub.pendingFiles = files.slice(); hub.totalFiles = files.length; hub.batchCount = Math.ceil(files.length / BATCH()); hub.batchNo = 0; }
  hub.auto = true; hub.phase = 'importing'; hub.paused = false; hub.notice = ''; hub.batch ||= VZ.uid(); hub.startedAt ||= Date.now(); hub.autoRunning = true;
  M.keepAwake(true); M.holdBackup?.(true); draw();
  try { await autoLoop(); } finally { hub.autoRunning = false; hub.inBatch = 0; M.keepAwake(false); M.holdBackup?.(false); hub.stage = ''; saveQueue(true); if (host()) draw(); }
}
async function autoLoop() {
  hub.known ||= await knownFiles();
  // Files left waiting from a paused batch go first.
  const leftover = hub.rows.filter(r => r.queued && (r.state === 'waiting' || r.state === 'uploading'));
  if (leftover.length) { await runImport(leftover, {more:true}); if (hub.paused) return; }
  while (hub.pendingFiles?.length && !hub.paused) {
    const part = hub.pendingFiles.splice(0, BATCH()); hub.batchNo++;
    const rows = []; hub.inBatch = part.length; // files of this batch still being checked count toward the total
    for (const [i, file] of part.entries()) {
      if (hub.paused) { hub.pendingFiles.unshift(...part.slice(i)); hub.batchNo--; break; }
      hub.stage = '묶음 ' + hub.batchNo + '/' + hub.batchCount + ' · 파일 확인 중 ' + (i + 1) + '/' + part.length; drawRow({});
      const row = await inspectFile(file, hub.known);
      if (row.error) Object.assign(row, {queued:true, state:'failed', msg:'실패: ' + row.error, file:null});
      else if (row.status === 'out') Object.assign(row, {queued:true, state:'skipped', msg:row.duration != null && row.duration < 25 ? '25초 미만이라 가져오지 않음' : '길이를 확인할 수 없어 가져오지 않음', file:null});
      hub.rows.push(row); rows.push(row); hub.inBatch--;
    }
    hub.inBatch = 0;
    if (hub.paused) { // files already checked in this batch wait in the queue for "이어서 올리기"
      for (const r of rows) if (!r.error && r.state !== 'skipped') Object.assign(r, {queued:true, state:r.dup ? 'dup' : 'waiting', msg:r.dup ? '중복 제외 · ' + r.dup : ''});
      saveQueue(true); break;
    }
    hub.stage = '묶음 ' + hub.batchNo + '/' + hub.batchCount + ' · 올리는 중';
    await runImport(rows.filter(r => !r.error && r.state !== 'skipped'), {more:!!hub.pendingFiles.length});
  }
  if (!hub.paused && !hub.pendingFiles?.length && hub.phase !== 'done') { hub.phase = 'done'; M.invalidate(); }
}
/** ok | dup | needs-date | out | error */
function evaluate(row) {
  const c = hub.cond;
  row.reasons = [];
  if (row.error) { row.status = 'error'; return; }
  if (row.duration == null) row.reasons.push('길이 확인 불가');
  else if (row.duration < Math.max(25, c.min) || row.duration > c.max) row.reasons.push(row.duration < 25 ? '25초 미만 · 가져오지 않음' : '길이 ' + mmss(row.duration));
  if (row.dateOk && row.date && ((c.start && row.date < c.start) || (c.end && row.date > c.end))) row.reasons.push('기간 밖 ' + VZ.dateLabel(row.date));
  row.status = row.reasons.length ? 'out' : row.dup ? 'dup' : !row.dateOk ? 'needs-date' : 'ok';
}

/* ---------- import ---------- */
async function runImport(rows, {more = false} = {}) {
  if (hub.running) return;
  hub.more = more;
  if (!window.vzipCloudSignedIn?.() && rows.length > 20) { VZ.toast('파일이 많으면 로그인한 뒤 올려 주세요. 기기 저장 공간이 부족해질 수 있어요.', 'error'); return; }
  hub.batch ||= VZ.uid(); hub.startedAt ||= Date.now();
  // Same content already in the library, or picked twice: never uploaded again.
  for (const r of rows) { if (r.state === 'skipped') continue; r.queued = true; if (r.state !== 'done') { Object.assign(r, r.dup ? {state:'dup', msg:'중복 제외 · ' + r.dup} : {state:'waiting', msg:''}); r.tries = 0; } }
  hub.phase = 'importing'; hub.paused = false; hub.notice = ''; hub.running = true; draw(); saveQueue(true);
  M.keepAwake(true); M.holdBackup?.(true);
  try { await importRows(rows); } finally { hub.running = false; M.keepAwake(false); M.holdBackup?.(false); saveQueue(true); if (host()) draw(); }
}
/** One file at a time from the picked File (no device copy); done = the server confirmed it. */
async function importRows(rows) {
  const direct = !!window.vzipCloudSignedIn?.();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (hub.paused) break;
    if (row.state === 'done' || row.state === 'dup' || row.state === 'skipped') continue;
    if (!(Number(row.duration) >= 25)) { row.state = 'skipped'; row.msg = row.duration != null && row.duration < 25 ? '25초 미만이라 가져오지 않음' : '길이를 확인할 수 없어 가져오지 않음'; row.file = null; drawRow(row); continue; }
    if (direct && !window.vzipCloudSignedIn?.()) { hub.paused = true; hub.notice = '로그인이 풀렸어요. 다시 로그인한 뒤 "이어서 올리기"를 눌러 주세요. 완료된 파일은 그대로예요.'; break; }
    if (!row.file) { row.state = 'failed'; row.msg = '원본 파일을 다시 선택해야 해요.'; continue; }
    row.state = 'uploading'; row.msg = '준비 중…'; hub.current = row; drawRow(row);
    VZ.processingLog?.record(row.id, {state:'uploading', originalName:row.name, songId:row.song, songSource:row.song?(row.suggestions?.[0]?.id===row.song?'파일명 추천 · 확인 후 저장':'직접 지정'):'미지정', date:row.date, dateSource:row.dateSource});
    try {
      const song = VZ.song(row.song);
      const extra = {occasion:row.occasion, sourceType:SOURCE_TYPE[hub.source] || 'files', originalFilename:row.name, fileHash:row.hash, importedAt:Date.now(), recordedAtSource:row.dateSource === 'metadata' ? 'metadata' : row.dateSource === 'filename' ? 'filename' : 'user'};
      const saved = await M.importFile(row.file, {id:row.id, songId:song ? song.id : '', song:VZ.songLabel(song), date:row.dateSource === 'metadata' || row.dateSource === 'unconfirmed' ? '' : row.date, extra, direct, durationSeconds:row.duration},
        p => { row.msg = typeof p === 'number' ? '업로드 ' + p + '%' : String(p); drawRow(row); });
      row.busySince = 0; row.state = 'done'; row.doneAt = Date.now(); row.msg = saved.cloud ? '✓ 업로드 완료 (서버 확인)' : '✓ 이 기기에 저장 (로그인하면 업로드)'; row.saved = saved; row.file = null;
      VZ.processingLog?.record(row.id, {state:'done', savedName:saved.name||'', songId:saved.songId||row.song, cloud:!!saved.cloud, pendingUpload:!!saved.pendingUpload, audioExtraction:!!saved.audioExtraction||!!saved.extracted, losslessFlac:!!saved.losslessFlac||!!saved.flac, savedSize:saved.savedSize||saved.size||0, error:''});
    } catch (e) {
      if (isAuth(e)) { row.state = 'waiting'; row.msg = ''; hub.paused = true; hub.notice = '로그인이 만료됐어요. 다시 로그인한 뒤 "이어서 올리기"를 눌러 주세요. 완료된 파일은 그대로예요.'; }
      else if (isBusy(e)) {
        // Another upload (the background device backup finishing its current file, or another tab / the home-screen
        // app) holds the one upload slot. Waiting is not a failure: keep the file first in line until the slot frees.
        row.busySince ||= Date.now();
        const waited = Math.round((Date.now() - row.busySince) / 1000);
        row.state = 'waiting';
        row.msg = waited < 90 ? '다른 업로드가 끝나길 기다리는 중…' : '다른 업로드가 끝나길 기다리는 중 (' + Math.floor(waited / 60) + '분) · 다른 탭이나 홈 화면 앱에서 올리고 있다면 그쪽을 끝내 주세요';
        drawRow(row);
        await new Promise(r => setTimeout(r, 5000));
        if (!hub.paused) { rows.splice(i + 1, 0, row); } // same file again next, order kept
      }
      else if (isNetwork(e) && (row.tries = (row.tries || 0) + 1) <= 3) {
        row.state = 'waiting'; row.msg = '연결이 끊겨 잠시 후 다시 시도해요…'; drawRow(row);
        await new Promise(r => setTimeout(r, 3000 * row.tries));
        if (!hub.paused) { rows.push(row); } // try again at the end of the list
      } else { row.state = 'failed'; row.msg = '실패: ' + (e.message || '알 수 없는 오류'); }
      VZ.processingLog?.record(row.id, {state:row.state, error:row.state==='failed'?(e.message||'알 수 없는 오류'):''});
    }
    hub.current = null; drawRow(row); saveQueue();
  }
  hub.current = null;
  if (hub.paused) { draw(); return; }
  // Practice records for files whose song the user confirmed (one per file, never duplicated).
  let made = 0;
  if (hub.autoPractice) {
    const linked = new Set(VZ.db.practices.flatMap(p => p.mediaIds || []));
    const todo = rows.filter(r => r.state === 'done' && r.song && r.occasion === 'practice' && !linked.has(r.id));
    if (todo.length) VZ.change(d => { for (const r of todo) {
      const seconds = Math.max(0, Number(r.saved?.durationSeconds || r.duration) || 0);
      d.practices.push({id:VZ.uid(), date:M.dateOf(r.saved) || r.date, minutes:0, manualMinutes:0, mediaSeconds:seconds, practiceTimeSource:'unconfirmed', mediaIds:[r.id], practiceMode:'song', technique:[], songId:r.song, categoryId:'', categoryLabel:'', detail:'', rating:0,
        memo:'', completed:[], assignmentNotes:{}, importedFrom:SOURCE_TYPE[hub.source], suggestedSongId:r.suggestions?.[0]?.id || '', confirmedSongId:r.song});
      made++; } }, {silent:true});
  }
  hub.made = (hub.made || 0) + made;
  // Files approved as that day's lesson recording go into the lesson (once).
  const toLesson = rows.filter(r => r.state === 'done' && r.lessonId).filter(r => { const l = VZ.db.lessons.find(x => x.id === r.lessonId); return l && !(l.recordings || []).some(x => x.id === r.id); });
  if (toLesson.length && VZ.change(d => { for (const r of toLesson) { const l = d.lessons.find(x => x.id === r.lessonId); if (l && !(l.recordings || []).some(x => x.id === r.id)) { l.recordings ||= []; l.recordings.push({id:r.id, note:''}); } } }, {silent:true})) hub.linked = (hub.linked || 0) + toLesson.length;
  if (hub.more) { M.invalidate(); return; } // the next batch follows
  hub.phase = 'done'; M.invalidate(); draw();
}

/* ---------- view ---------- */
VZ.route('import-hub', {title:'기존 자료 가져오기', back:true, tab:'record', noAutoRefresh:true,
  render() { return '<div data-hub></div>'; },
  mount(main) {
    VZ.setGuard(() => hub.phase === 'review' && hub.rows.some(r => r.selected) ? '분석한 파일을 아직 가져오지 않았어요. 나가면 선택이 사라져요. 나갈까요?' : hub.phase === 'importing' ? '가져오는 중이에요. 나가면 남은 파일은 가져오지 않아요. 나갈까요?' : '');
    draw();
  },
  leave() { if (hub.phase !== 'importing') { M.destroyAll(); if (hub.phase === 'source' || hub.phase === 'done' && !hub.rows.some(r => r.state === 'failed' && r.file)) hub = fresh(); } }});
VZ.retryImportFailures = async () => {
  if (hub.running || hub.autoRunning) return {retried:0, missing:0};
  const failed = hub.rows.filter(r => r.state === 'failed'), ready = failed.filter(r => r.file);
  if (ready.length) await runImport(ready);
  return {retried:ready.length, missing:failed.length-ready.length};
};
function host() { return document.querySelector('[data-hub]'); }
function draw() {
  const h = host(); if (!h) return;
  if (hub.phase === 'source') {
    // A bulk upload that stopped (Safari closed, logged out…) is shown with its counts; picking the files again skips the done ones.
    const q = loadQueue(), qc = q ? counts(q.items) : null, left = qc ? qc.waiting + qc.uploading + qc.failed + (q.pendingCount || 0) : 0;
    if (qc && q.total) qc.total = Math.max(q.total, qc.total);
    const stopped = q && left ? '<div class="card stack" style="margin-bottom:12px;border:1px solid var(--warn-soft)" data-stopped><strong>중단된 업로드가 있어요</strong>' +
      '<p class="small" style="margin:0">전체 ' + qc.total + '개 · 완료 ' + qc.done + ' · 남음 ' + left + (qc.failed ? ' (실패 ' + qc.failed + ')' : '') + (qc.dup ? ' · 중복 제외 ' + qc.dup : '') + ' · ' + esc(new Date(q.updatedAt).toLocaleString('ko-KR')) + '</p>' +
      '<p class="small muted" style="margin:0">브라우저가 닫히면 원본 파일을 다시 선택해야 해요. 아래 버튼으로 같은 파일들을 다시 고르면 이미 올라간 파일은 자동으로 빠지고 남은 것만 올려요. 더 많이 골라도 괜찮아요.</p>' +
      '<label class="btn block" style="cursor:pointer"><i class="ph ph-arrow-clockwise"></i>같은 파일 다시 골라 이어 올리기<input type="file" multiple accept="' + esc(SOURCES.drive.accept) + '" class="sr-only" data-q-resume></label>' +
      '<div class="btn-row"><button type="button" class="btn secondary" data-q-report>기록 저장</button><button type="button" class="btn ghost" data-q-clear>기록 지우기</button></div></div>' : '';
    h.innerHTML = stopped + '<p class="muted" style="margin-top:0">어디에 있는 자료를 가져올까요? 선택한 파일은 가져오기를 누르기 전까지 올라가지 않아요.</p><div class="stack">' +
      Object.entries(SOURCES).map(([k, s]) => '<button type="button" class="card item" data-src="' + k + '"' + (s.disabled ? ' aria-disabled="true"' : '') + '><span class="avatar"><i class="ph ph-' + s.icon + '"></i></span><span class="item-main"><span class="item-title">' + esc(s.title) + '</span><span class="item-sub">' + esc(s.sub) + (s.disabled ? ' · R2 설정 후' : '') + '</span></span><i class="ph ph-caret-right chev"></i></button>').join('') + '</div>';
    h.querySelector('[data-q-report]')?.addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({app:'VOCAL.zip', kind:'upload-queue', ...loadQueue()}, null, 2)], {type:'application/json'})); a.download = 'vocalzip-upload-queue-' + VZ.today() + '.json'; a.click(); });
    // Picking the files again resumes: already uploaded ones are found by content and skipped.
    h.querySelector('[data-q-resume]')?.addEventListener('change', e => {
      const all = [...e.target.files]; e.target.value = ''; if (!all.length) return;
      if (!mediaOnly(all).length) { VZ.toast('가져올 음성·영상 파일이 없어요.', 'error'); return; }
      VZ.openImportHub({files:all});
    });
    h.querySelector('[data-q-clear]')?.addEventListener('click', async () => { if (!await VZ.confirm('중단된 업로드 기록', '진행 상태 기록만 지워요. 이미 올라간 파일과 전체 녹음은 그대로예요.', {ok:'기록 지우기'})) return; try { localStorage.removeItem(QKEY); } catch {} draw(); });
    h.querySelectorAll('[data-src]').forEach(b => b.onclick = () => {
      const k = b.dataset.src;
      if (SOURCES[k].disabled) { VZ.toast(SOURCES[k].tip); return; }
      hub.source = k; hub.cond = conditionsFor(k); hub.phase = 'pick'; draw();
    });
    return;
  }
  const s = SOURCES[hub.source], c = hub.cond;
  if (hub.phase === 'pick') {
    h.innerHTML = '<div class="row" style="margin-bottom:8px"><span class="avatar"><i class="ph ph-' + s.icon + '"></i></span><strong class="grow">' + esc(s.title) + '</strong><button type="button" class="btn sm ghost" data-reset>출처 변경</button></div>' +
      '<div class="card stack"><strong>가져오기 조건</strong>' +
      '<div class="two"><label class="field" style="margin:0"><span>시작일</span><input type="date" data-c="start" value="' + esc(c.start) + '"></label><label class="field" style="margin:0"><span>종료일</span><input type="date" data-c="end" value="' + esc(c.end) + '"></label></div>' +
      '<div class="two"><label class="field" style="margin:0"><span>최소 길이 (분:초)</span><input type="text" inputmode="numeric" data-c="min" value="' + mmss(c.min) + '"></label><label class="field" style="margin:0"><span>최대 길이 (분:초)</span><input type="text" inputmode="numeric" data-c="max" value="' + mmss(c.max) + '"></label></div>' +
      '<p class="small muted" style="margin:0">날짜는 파일 속 촬영·녹음일 기준이에요. 길이는 최소·최대 값을 포함해요. 원본 날짜가 없는 파일은 "날짜 확인 필요"로 따로 보여 드려요.</p></div>' +
      '<p class="small muted">' + esc(s.tip) + '</p>' +
      (s.folder ? '<label class="btn block" style="cursor:pointer;margin-bottom:8px"><i class="ph ph-folder-open"></i>폴더 통째로 선택<input type="file" webkitdirectory directory multiple class="sr-only" data-folder></label>' : '') +
      '<label class="btn block' + (s.folder ? ' secondary' : '') + '" style="cursor:pointer"><i class="ph ph-' + (s.folder ? 'files' : 'folder-open') + '"></i>파일 여러 개 선택<input type="file" multiple accept="' + esc(s.accept) + '" class="sr-only" data-files></label>' +
      '<div class="hub-drop" data-drop>여기에 파일이나 폴더를 끌어다 놓아도 돼요 (컴퓨터)</div>';
    h.querySelector('[data-reset]').onclick = () => { hub = fresh(); draw(); };
    h.querySelectorAll('[data-c]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.c;
      if (k === 'min' || k === 'max') { const v = parseMmss(inp.value); if (v == null || k === 'min' && v < 25) { VZ.toast(k === 'min' && v != null ? '25초 미만 파일은 가져올 수 없어요.' : '길이는 분:초로 입력해 주세요. 예: 0:25, 8:00', 'error'); inp.value = mmss(c[k]); return; } c[k] = v; inp.value = mmss(v); }
      else c[k] = inp.value;
      saveConditions();
    });
    h.querySelector('[data-files]').onchange = e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) pickFiles(files); };
    h.querySelector('[data-folder]')?.addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; pickFiles(files); });
    const drop = h.querySelector('[data-drop]');
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = async e => { e.preventDefault(); drop.classList.remove('over'); try { pickFiles(await droppedFiles(e.dataTransfer)); } catch (err) { VZ.toast('끌어다 놓은 파일을 읽지 못했어요: ' + err.message, 'error'); } };
    return;
  }
  if (hub.phase === 'analyzing') { h.innerHTML = '<div class="card stack"><strong>파일 분석 중</strong><p class="small muted" data-progress style="margin:0">' + esc(hub.progress) + '</p><p class="small muted" style="margin:0">파일을 올리지 않고 날짜·길이만 읽고 있어요.</p></div>'; return; }
  const rows = hub.rows, count = st => rows.filter(r => r.status === st).length;
  const chips = [['all', '전체 ' + rows.length], ['ok', '조건 충족 ' + count('ok')], ['dup', '중복 의심 ' + count('dup')], ['needs-date', '날짜 확인 필요 ' + count('needs-date')], ['out', '조건 밖 ' + count('out')], ['error', '읽기 실패 ' + count('error')]].filter(([k, label]) => k === 'all' || !label.endsWith(' 0'));
  const visible = rows.filter(r => hub.filter === 'all' || r.status === hub.filter).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const songOpts = v => '<option value="">곡 미지정</option>' + VZ.songsNewest().map(x => '<option value="' + esc(x.id) + '"' + (x.id === v ? ' selected' : '') + '>' + esc(x.title) + '</option>').join('');
  const rowHtml = r => {
    const sug = r.suggestions?.[0], sugSong = sug && VZ.song(sug.id);
    const badge = {ok:'', dup:'<span class="badge warn">중복 의심 · ' + esc(r.dup) + '</span>', 'needs-date':'<span class="badge warn">날짜 확인 필요</span>', out:'<span class="badge">' + esc(r.reasons.join(' · ')) + '</span>', error:'<span class="badge danger">' + esc(r.error || '읽기 실패') + '</span>'}[r.status];
    return '<div class="hub-row" data-row="' + r.id + '"><label class="hub-check"><input type="checkbox" data-sel' + (r.selected ? ' checked' : '') + (r.status === 'error' || r.state === 'done' || !(Number(r.duration) >= 25) ? ' disabled' : '') + ' aria-label="' + esc(r.name) + ' 선택"></label><div class="hub-main">' +
      '<div class="hub-top"><strong>' + (r.dateOk ? esc(VZ.dateLabel(r.date)) : '날짜 미확인') + '</strong><span class="small muted">' + mmss(r.duration) + (r.video ? ' · 영상→음성' : '') + '</span></div>' +
      '<div class="small muted hub-name" title="' + esc(r.name) + '">' + esc(r.name) + '</div>' + (badge ? '<div>' + badge + '</div>' : '') +
      (r.status === 'needs-date' || r.dateSource === 'filename' ? '<label class="hub-date"><span class="small">녹음 날짜' + (r.dateSource === 'filename' ? ' (파일명)' : r.date ? ' · 파일 수정일 ' + esc(r.date) + '을 넣어 뒀어요' : '') + '</span><input type="date" data-date value="' + esc(r.date || '') + '"></label>' : '') +
      '<div class="hub-song"><select data-occ-row aria-label="' + esc(r.name) + ' 종류">' + M.OCCASIONS.map(([k, v]) => '<option value="' + k + '"' + (r.occasion === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><select data-song aria-label="' + esc(r.name) + ' 곡">' + songOpts(r.song) + '</select>' + (sugSong && r.song !== sug.id ? '<button type="button" class="chip" data-approve>추천: ' + esc(sugSong.title) + ' 승인</button>' : '') + '</div>' +
      (() => { const ls = r.dateOk ? lessonsOn(r.date) : [], linked = r.lessonId && VZ.db.lessons.find(l => l.id === r.lessonId);
        if (linked) return '<div class="hub-lesson"><span class="badge ok">✓ ' + esc(VZ.dateLabel(linked.date)) + ' 레슨 녹음으로 연결</span><button type="button" class="chip" data-lesson-off>연결 안 함</button></div>';
        return ls.length ? '<div class="hub-lesson"><button type="button" class="chip" data-lesson-on="' + esc(ls[0].id) + '"><i class="ph ph-chalkboard-teacher"></i> 이 날 레슨' + (VZ.lessonSongIds(ls[0]).length ? ' (' + esc(VZ.lessonSongIds(ls[0]).map(VZ.songTitle).filter(Boolean).join(', ')) + ')' : '') + ' 녹음으로 연결</button></div>' : ''; })() +
      '<div class="hub-actions"><button type="button" class="chip" data-play><i class="ph ph-play"></i> 들어보기</button><span class="small" data-msg>' + esc(r.msg || '') + '</span></div><div data-p></div></div></div>';
  };
  let list;
  if (hub.group) {
    const groups = new Map(); for (const r of visible) { const k = r.song || r.suggestions?.[0]?.id || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    list = [...groups.entries()].map(([k, rs]) => '<h3 class="cal-group">' + esc(VZ.songTitle(k) || '곡 미지정') + ' · ' + rs.length + '</h3>' + rs.map(rowHtml).join('')).join('');
  } else list = visible.slice(0, hub.limit).map(rowHtml).join('') + (visible.length > hub.limit ? '<button type="button" class="btn ghost block" data-more-rows>' + (visible.length - hub.limit) + '개 더 보기</button>' : '');
  const selected = rows.filter(r => r.selected && r.state !== 'done');
  if (hub.phase === 'review') {
    h.innerHTML = '<div class="row" style="margin-bottom:8px"><span class="avatar"><i class="ph ph-' + s.icon + '"></i></span><strong class="grow">' + esc(s.title) + ' 분석 결과</strong><button type="button" class="btn sm ghost" data-again>다시 선택</button></div>' +
      '<div class="chips" style="flex-wrap:wrap;margin-bottom:10px">' + chips.map(([k, label]) => '<button type="button" class="chip" data-f="' + k + '" aria-pressed="' + (hub.filter === k) + '">' + label + '</button>').join('') + '</div>' +
      '<div class="chips" style="flex-wrap:wrap;margin-bottom:10px"><button type="button" class="chip" data-all>전체 선택</button><button type="button" class="chip" data-none>선택 해제</button><button type="button" class="chip" data-nodup>중복 제외</button><button type="button" class="chip" data-approve-all>추천곡 일괄 승인</button><button type="button" class="chip" data-approve-lessons>레슨 연결 일괄 승인</button><button type="button" class="chip" data-group aria-pressed="' + hub.group + '">곡별 묶어 보기</button></div>' +
      '<label class="field"><span>선택한 파일의 종류 한 번에 지정</span><select data-bulk-occ><option value="">선택…</option>' + M.OCCASIONS.map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>선택한 파일의 곡 한 번에 지정</span><select data-bulk data-pick="song"><option value="">선택…</option>' + songOpts('').replace('<option value="">곡 미지정</option>', '<option value="__none">곡 미지정</option>') + '</select></label>' +
      '<label class="item" style="padding:0 0 10px"><input type="checkbox" data-auto' + (hub.autoPractice ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main small">곡을 정한 "연습" 파일은 그 날짜의 연습 기록으로 만들기 (시간은 직접 입력 · 같은 파일은 한 번만)</span></label>' +
      '<div class="stack" data-list>' + (list || '<p class="small muted">이 조건에 해당하는 파일이 없어요.</p>') + '</div>' +
      '<div class="sheet-foot" style="position:sticky;bottom:calc(var(--nav-h) + var(--safe-b));margin:16px -16px 0;padding:12px 16px"><button type="button" class="btn block" data-import' + (selected.length ? '' : ' disabled') + '>선택한 ' + selected.length + '개 가져오기</button></div>';
    wireReview(h);
    h.querySelector('[data-more-rows]')?.addEventListener('click', () => { hub.limit += 200; draw(); });
    return;
  }
  h.innerHTML = (hub.phase === 'done' ? resultHtml() : dashHtml()) + listsHtml();
  wireDash(h);
}
/* ---------- upload progress / result ---------- */
function resultHtml() {
  const q = hub.rows.filter(r => r.queued), c = counts(q);
  return '<div class="card stack" data-result><strong>가져오기 완료</strong>' +
    '<p class="small muted" style="margin:0">저장 ' + c.done + '개' + (c.skipped ? ' · 길이 미달/미확인 제외 ' + c.skipped + '개' : '') + (c.dup ? ' · 중복 제외 ' + c.dup + '개' : '') + (c.failed ? ' · 실패 ' + c.failed + '개' : '') + '</p>' +
    '<div class="btn-row"><a class="btn" href="#/library">전체 녹음 보기</a><a class="btn secondary" href="#/processing-log">처리 내역</a><button type="button" class="btn secondary" data-report>결과 보고서 저장</button></div>' +
    (hub.made ? '<p class="small muted" style="margin:0">연습 기록 ' + hub.made + '개 생성</p>' : '') +
    (hub.linked ? '<p class="small muted" style="margin:0">레슨 녹음 ' + hub.linked + '개 연결</p>' : '') +
    '<button type="button" class="btn ghost block" data-more>다른 자료 가져오기</button></div>';
}
function dashHtml() {
  const q = hub.rows.filter(r => r.queued), c = counts(q), failed = c.failed, cur = hub.current;
  const unchecked = (hub.pendingFiles?.length || 0) + (hub.autoRunning ? hub.rows.filter(r => !r.queued).length + (hub.inBatch || 0) : 0);
  c.waiting += unchecked; c.total += unchecked;
  const running = (hub.running || hub.autoRunning) && !hub.paused;
  const pct = c.total ? Math.round((c.done + c.failed + c.dup + c.skipped) / c.total * 100) : 0, importing = hub.phase === 'importing';
  return '<div class="card stack up-dash" data-dash><div class="row between"><strong>' + (importing ? (running ? '올리는 중…' : hub.paused && (hub.running || hub.autoRunning) ? '멈추는 중…' : '일시정지됨') : '업로드 결과') + '</strong><span class="small muted">전체 ' + c.total + '개</span></div>' +
    '<div class="up-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
    '<div class="up-counts">' + [['done', '완료', c.done], ['uploading', '업로드 중', c.uploading], ['waiting', '대기', c.waiting], ['skipped', '길이 제외', c.skipped], ['failed', '실패', c.failed], ['dup', '중복 제외', c.dup]].map(([k, t, n]) => '<div data-count="' + k + '"><b>' + n + '</b><span>' + t + '</span></div>').join('') + '</div>' +
    (hub.stage ? '<p class="small" style="margin:0;font-weight:600">' + esc(hub.stage) + '</p>' : '') +
    (cur ? '<p class="small ellipsis" style="margin:0" data-current>지금: ' + esc(cur.name) + ' · ' + esc(cur.msg || '') + '</p>' : '') +
    (hub.notice ? '<p class="small" style="margin:0;color:var(--warn)">' + esc(hub.notice) + '</p>' : '') +
    '<p class="small muted" style="margin:0">완료는 서버에 저장된 것을 확인한 파일만 세요. 멈추거나 중단돼도 완료된 파일은 그대로예요.</p>' +
    '<div class="btn-row">' + (importing ? (running ? '<button type="button" class="btn secondary" data-pause>일시정지</button>' : hub.running || hub.autoRunning ? '' : '<button type="button" class="btn" data-resume>이어서 올리기</button>') : '') +
      (failed && !hub.running && !hub.autoRunning && !hub.pendingFiles?.length ? '<button type="button" class="btn secondary" data-retry>실패한 ' + failed + '개만 다시</button>' : '') + '</div>' +
    '</div>';
}
function listsHtml() {
  const q = hub.rows.filter(r => r.queued), failed = q.filter(r => r.state === 'failed'), done = q.filter(r => r.state === 'done'), dup = q.filter(r => r.state === 'dup'), skipped = q.filter(r => r.state === 'skipped');
  const line = r => '<div class="item"><span class="item-main"><span class="item-title">' + esc(r.state === 'done' ? r.saved?.name || r.name : r.name) + '</span><span class="item-sub" style="white-space:normal">' + esc((r.state === 'done' && r.saved?.name && r.saved.name !== r.name ? '원본: ' + r.name + ' · ' : '') + (r.msg || '')) + '</span></span></div>';
  return (failed.length ? '<h3 class="cal-group">실패 ' + failed.length + '</h3><div class="list">' + failed.map(line).join('') + '</div>' : '') +
    (done.length ? '<details class="up-list"><summary>완료한 파일 ' + done.length + '개 보기</summary><div class="list">' + done.slice(-300).reverse().map(line).join('') + (done.length > 300 ? '<div class="item small muted">최근 300개만 보여요. 전체는 결과 보고서에 있어요.</div>' : '') + '</div></details>' : '') +
    (dup.length ? '<details class="up-list"><summary>중복이라 뺀 파일 ' + dup.length + '개 보기</summary><div class="list">' + dup.slice(0, 300).map(line).join('') + '</div></details>' : '') +
    (skipped.length ? '<details class="up-list"><summary>길이 때문에 제외한 파일 ' + skipped.length + '개 보기</summary><div class="list">' + skipped.slice(0, 300).map(line).join('') + '</div></details>' : '');
}
function report() {
  const q = hub.rows.filter(r => r.queued), data = {app:'VOCAL.zip', kind:'upload-report', batch:hub.batch, startedAt:new Date(hub.startedAt || Date.now()).toISOString(), savedAt:new Date().toISOString(), counts:counts(q),
    items:q.map(r => ({name:r.state === 'done' ? r.saved?.name || r.name : r.name, originalName:r.name, size:r.size, fingerprint:r.hash || '', state:r.state, message:r.msg || '', mediaId:r.state === 'done' ? r.id : ''}))};
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'})); a.download = 'vocalzip-upload-report-' + VZ.today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function wireDash(h) {
  h.querySelector('[data-pause]')?.addEventListener('click', () => { hub.paused = true; hub.notice = '지금 올리는 파일까지 마치고 멈춰요.'; draw(); });
  h.querySelector('[data-resume]')?.addEventListener('click', () => { hub.notice = ''; if (hub.auto) runAuto(); else runImport(hub.rows.filter(r => r.queued && (r.state === 'waiting' || r.state === 'uploading'))); });
  h.querySelector('[data-retry]')?.addEventListener('click', () => runImport(hub.rows.filter(r => r.queued && r.state === 'failed')));
  h.querySelector('[data-report]')?.addEventListener('click', report);
  h.querySelector('[data-more]')?.addEventListener('click', () => { hub = fresh(); draw(); });
}
function drawProgress() { const p = host()?.querySelector('[data-progress]'); if (p) p.textContent = hub.progress; else draw(); }
function drawRow(row) {
  const h = host(); if (!h) return;
  if (hub.phase === 'done') { draw(); return; }
  const dash = h.querySelector('[data-dash]');
  if (dash) { dash.outerHTML = dashHtml(); wireDash(h); return; }
  const el = h.querySelector('[data-row="' + row.id + '"] [data-msg]'); if (el) el.textContent = row.msg || ''; else draw();
}
function wirePlay(h) {
  h.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
    const el = b.closest('[data-row]'), r = hub.rows.find(x => x.id === el.dataset.row), slot = el.querySelector('[data-p]');
    if (slot._p) { slot._p.destroy(); slot._p = null; slot.innerHTML = ''; return; }
    const item = r.saved || {id:'preview-' + r.id, name:r.name, type:r.type, blob:r.file, durationSeconds:r.duration};
    if (!item.blob && !item.cloud && !item.local) return;
    slot._p = M.player(slot, item, {}); slot._p.play();
  });
}
function wireReview(h) {
  const byRow = el => hub.rows.find(r => r.id === el.closest('[data-row]').dataset.row);
  h.querySelector('[data-again]').onclick = () => { hub.phase = 'pick'; hub.rows = []; draw(); };
  h.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { hub.filter = b.dataset.f; draw(); });
  h.querySelector('[data-all]').onclick = () => { hub.rows.forEach(r => { if (r.status !== 'error' && Number(r.duration) >= 25) r.selected = true; }); draw(); };
  h.querySelector('[data-none]').onclick = () => { hub.rows.forEach(r => { r.selected = false; }); draw(); };
  h.querySelector('[data-nodup]').onclick = () => { hub.rows.forEach(r => { if (r.dup) r.selected = false; }); draw(); };
  h.querySelector('[data-approve-all]').onclick = () => { let n = 0; hub.rows.forEach(r => { const s = r.suggestions?.[0]; if (s && r.song !== s.id) { r.song = s.id; n++; } }); VZ.toast(n ? '추천곡 ' + n + '개를 승인했어요.' : '승인할 추천곡이 없어요.'); draw(); };
  h.querySelector('[data-group]').onclick = () => { hub.group = !hub.group; draw(); };
  h.querySelector('[data-auto]').onchange = e => { hub.autoPractice = e.target.checked; };
  h.querySelector('[data-bulk]').onchange = e => { const v = e.target.value; if (!v) return; hub.rows.forEach(r => { if (r.selected) r.song = v === '__none' ? '' : v; }); draw(); };
  h.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { const r = byRow(c); r.selected = c.checked; draw(); });
  h.querySelectorAll('[data-song]').forEach(sel => sel.onchange = () => { byRow(sel).song = sel.value; });
  h.querySelectorAll('[data-occ-row]').forEach(sel => sel.onchange = () => { const r = byRow(sel); r.occasion = sel.value; if (r.occasion !== 'lesson') r.lessonId = ''; draw(); });
  const linkLesson = (r, id) => { const l = VZ.db.lessons.find(x => x.id === id); if (!l) return; r.lessonId = id; r.occasion = 'lesson'; const songs = VZ.lessonSongIds(l); if (!r.song && songs.length === 1) r.song = songs[0]; };
  h.querySelectorAll('[data-lesson-on]').forEach(b => b.onclick = () => { linkLesson(byRow(b), b.dataset.lessonOn); draw(); });
  h.querySelectorAll('[data-lesson-off]').forEach(b => b.onclick = () => { const r = byRow(b); r.lessonId = ''; r.occasion = 'practice'; draw(); });
  h.querySelector('[data-approve-lessons]').onclick = () => { let n = 0; hub.rows.forEach(r => { const l = r.dateOk && !r.lessonId && lessonsOn(r.date)[0]; if (l && r.state !== 'done') { linkLesson(r, l.id); n++; } }); VZ.toast(n ? n + '개 파일을 그날 레슨 녹음으로 연결할게요.' : '같은 날 레슨이 있는 파일이 없어요.'); draw(); };
  h.querySelector('[data-bulk-occ]').onchange = e => { const v = e.target.value; if (!v) return; hub.occasion = v; hub.rows.forEach(r => { if (r.selected) r.occasion = v; }); draw(); };
  h.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => { const r = byRow(b); r.song = r.suggestions[0].id; draw(); });
  h.querySelectorAll('[data-date]').forEach(inp => inp.onchange = () => {
    const r = byRow(inp); if (!inp.value) return;
    Object.assign(r, {date:inp.value, dateOk:true, dateSource:r.dateSource === 'filename' ? 'filename' : 'user'}); evaluate(r); if (r.status === 'ok') r.selected = true; draw();
  });
  h.querySelector('[data-import]').onclick = () => {
    const rows = hub.rows.filter(r => r.selected && r.state !== 'done' && Number(r.duration) >= 25);
    const undated = rows.filter(r => !r.dateOk);
    if (undated.length) { VZ.toast('날짜를 확인하지 않은 파일 ' + undated.length + '개가 있어요. 날짜를 정하거나 선택을 해제해 주세요.', 'error'); hub.filter = 'needs-date'; draw(); return; }
    runImport(rows);
  };
  wirePlay(h);
}
VZ.openImportHub = ({files, review = false} = {}) => {
  if (hub.phase === 'importing') { VZ.nav('#/import-hub'); return; }
  hub = fresh();
  // Files handed over from the library still exclude recordings shorter than 25 seconds.
  if (files?.length) {
    hub.source = 'drive'; hub.cond = {start:'', end:'', min:25, max:24 * 3600}; VZ.nav('#/import-hub');
    const media = mediaOnly(files), skipped = files.length - media.length;
    if (skipped) VZ.toast('음성·영상이 아닌 파일 ' + skipped + '개는 건너뛰었어요.');
    setTimeout(() => review ? analyze(media) : runAuto(media), 0); return;
  }
  VZ.nav('#/import-hub');
};
})();
