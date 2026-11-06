/* VOCAL.zip v6 media: IndexedDB store (v5-compatible), cloud merge, player, recorder engine. */
(() => {
'use strict';
const VZ = window.VZ;
const LOCAL_LIMIT = 25 * 1024 * 1024;

/* ---------- storage (same DB / record shape as v5) ---------- */
const typeOf = file => {
  if (file?.type?.startsWith('audio/') || file?.type?.startsWith('video/')) return file.type;
  return ({mov:'video/quicktime',mp4:'video/mp4',m4v:'video/mp4',m4a:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav',aac:'audio/aac',ogg:'audio/ogg',webm:'video/webm',flac:'audio/flac',caf:'audio/x-caf'})[String(file?.name || '').split('.').pop().toLowerCase()] || 'application/octet-stream';
};
const blobOf = item => item.blob instanceof Blob ? (item.blob.type === typeOf(item) ? item.blob : new Blob([item.blob], {type:typeOf(item)}))
  : item.bytes instanceof ArrayBuffer || ArrayBuffer.isView(item.bytes) ? new Blob([item.bytes], {type:typeOf(item)}) : null;
async function tx(mode, action) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('vocalzip_media_v1', 1);
    let blocked = false;
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('recordings')) req.result.createObjectStore('recordings', {keyPath:'id'}); };
    req.onsuccess = () => { if (blocked) req.result.close(); else resolve(req.result); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => { blocked = true; reject(Error('다른 VOCAL.zip 탭을 닫고 다시 시도해 주세요.')); };
  });
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction('recordings', mode), r = action(t.objectStore('recordings'));
      let result; r.onsuccess = () => { result = r.result; }; r.onerror = () => reject(r.error);
      t.oncomplete = () => resolve(result); t.onabort = t.onerror = () => reject(t.error || Error('파일 저장이 중단됐어요.'));
    });
  } finally { db.close(); }
}
const quota = e => e?.name === 'QuotaExceededError' || /quota|space/i.test(e?.message || '') ? Error('기기 저장 공간이 부족해요. 공간을 확보하거나 클라우드에 저장해 주세요.') : e;
/** Globals relied on by cloud-sync.js. */
window.vzipStorePracticeMedia = async item => {
  try {
    if (item.blob.size > LOCAL_LIMIT) { await tx('readwrite', s => s.put(item)); return; }
    const bytes = await item.blob.arrayBuffer();
    const local = {...item, blob:new Blob([bytes], {type:typeOf(item)})};
    try { await tx('readwrite', s => s.put(local)); }
    catch (error) {
      if (error.name !== 'DataCloneError' && !/Blob|File data/i.test(error.message || '')) throw error;
      const fallback = {...local, bytes}; delete fallback.blob;
      await tx('readwrite', s => s.put(fallback));
    }
  } catch (e) { throw quota(e); }
};
window.vzipReadMedia = () => tx('readonly', s => s.getAll());
window.vzipMediaBlob = blobOf; window.vzipMediaType = typeOf;

const M = VZ.media = {typeOf, blobOf, LOCAL_LIMIT};
let cache = null, loading = null, generation = 0, cloudError = '';
M.cloudError = () => cloudError;
/** Any change (login, upload, edit) starts a new generation; results of older reads are never cached. */
M.typeOf = typeOf;
M.invalidate = () => { cache = null; generation++; };
/** Local + cloud items merged by id, newest first. */
M.list = async (force) => {
  if (cache && !force) return cache;
  const mine = generation;
  if (loading && loading.generation === mine) return loading.promise;
  const promise = (async () => {
    const map = new Map();
    let failed = '';
    try { (await window.vzipReadMedia()).forEach(x => map.set(x.id, {...x, local:true})); } catch (e) { console.error(e); failed = '이 기기의 파일을 읽지 못했어요.'; }
    if (window.vzipCloudSignedIn?.()) {
      try { mergeCloud(map, await window.vzipCloudMediaList()); }
      catch (e) { failed = '클라우드 목록을 불러오지 못했어요: ' + e.message; }
    }
    const list = sortList(map);
    // A read that started before a login/change, or that missed a source, is shown but not kept.
    if (generation === mine) { cloudError = failed; if (!failed) cache = list; }
    return list;
  })();
  loading = {generation:mine, promise};
  try { return await promise; } finally { if (loading?.promise === promise) loading = null; }
};
M.cached = () => cache || [];
function mergeCloud(map, items) { items.forEach(x => map.set(x.id, {...x, ...(map.get(x.id) || {}), cloud:true, path:x.path, parts:x.parts, storageVersion:x.storageVersion, storageProvider:x.storageProvider, r2Key:x.r2Key, legacyStorage:x.legacyStorage})); }
// Newest recording day first (the file's own date), then newest saved.
const sortList = map => [...map.values()].sort((a, b) => (M.dateOf(b) || '').localeCompare(M.dateOf(a) || '') || (b.created || 0) - (a.created || 0));
/** The list as last kept on this device (no network), to draw a screen at once while M.list() refreshes. Null if none. */
M.peek = async () => {
  if (cache) return cache;
  if (!window.vzipCloudSignedIn?.()) return null;
  let cloud = null; try { cloud = await window.vzipCloudMediaCached?.(); } catch {}
  if (!cloud) return null;
  const map = new Map(); try { (await window.vzipReadMedia()).forEach(x => map.set(x.id, {...x, local:true})); } catch {}
  mergeCloud(map, cloud); return sortList(map);
};
/** Sign ahead the R2 files about to be shown, so a tap can play at once (one request per 100 files). */
M.prefetch = items => { const keys = items.filter(m => m.storageProvider === 'r2' && m.r2Key && !blobOf(m)).map(m => m.r2Key); if (keys.length) window.VzipR2?.prefetch?.(keys).catch?.(() => {}); };
/** A source that is ready without waiting (device file, or an R2 link already here), else null. */
M.srcNow = item => {
  const blob = blobOf(item); if (blob) return {url:URL.createObjectURL(blob), revoke:true};
  const link = item.cloud && item.storageProvider === 'r2' && item.r2Key ? window.VzipR2?.cachedUrl?.(item.r2Key) : '';
  return link ? {url:link, revoke:false} : null;
};
/** File name from song + recording day ("곡 2026.11.02"); numbered when that name is taken. */
const usedNames = new Set();
M.autoName = (songTitle, ymd, exceptId = '', list = cache || []) => {
  const base = (String(songTitle || '').trim() || '녹음') + (ymd ? ' ' + ymd.replace(/-/g, '.') : '');
  const taken = new Set([...list.filter(m => m.id !== exceptId).map(m => M.label(m)), ...usedNames]);
  let name = base, n = 2;
  while (taken.has(name)) name = base + ' ' + n++;
  return name;
};
M.reserveName = name => { usedNames.add(name); };
/** Calendar day of a recording: explicit recordedDate (metadata or manual) wins over the timestamp. */
M.dateOf = item => /^\d{4}-\d{2}-\d{2}$/.test(item?.recordedDate || '') ? item.recordedDate : Number(item?.created) > 0 ? VZ.ymd(new Date(Number(item.created))) : '';
M.isVideo = item => typeOf(item).startsWith('video/');
M.label = item => item.name || '이름 없는 녹음';
M.sourceLabel = s => ({practice:'연습', record:'연습', lesson:'레슨', import:'가져옴'})[s] || '연습';
/** Recordings belong to a lesson or a practice: the record they are linked to, else their origin.
 * Files not linked anywhere count as practice (like their time does). */
M.owner = item => {
  const db = VZ.db, id = item.id;
  const lesson = db.lessons.find(l => (l.recordings || []).some(r => r.id === id));
  const practice = db.practices.find(p => (p.mediaIds || []).includes(id));
  if (lesson) return {kind:'lesson', lesson, practice};
  if (practice) return {kind:'practice', practice};
  return {kind:item.source === 'lesson' ? 'lesson' : 'practice'};
};
/** 공연 / 레슨 / 연습: the user's own choice wins; otherwise where the file is linked or came from. */
M.OCCASIONS = [['performance', '공연'], ['lesson', '레슨'], ['practice', '연습']];
M.occasion = item => ['performance', 'lesson', 'practice'].includes(item?.occasion) ? item.occasion : M.owner(item).kind;
M.occasionLabel = k => ({performance:'공연', lesson:'레슨', practice:'연습'})[k] || '연습';
const changed = () => { M.invalidate(); window.dispatchEvent(new Event('vzip:v6-media')); };
['vzip:cloud-media-changed', 'vzip:media-saved', 'vzip:media-updated', 'vzip:auth-changed'].forEach(n => window.addEventListener(n, changed));

/** Save a freshly captured or imported blob. Large blobs go to the cloud when signed in. */
M.saveBlob = async (item, onProgress, signal) => {
  let saved = item;
  if (item.blob.size > LOCAL_LIMIT) {
    if (!window.vzipCloudSignedIn?.()) throw Error('25MB 초과 파일은 로그인 후 클라우드에 저장할 수 있어요.');
    const type = item.type.split(';')[0], ext = (item.name.match(/\.(\w+)$/) || [])[1] || (type.includes('mp4') ? 'mp4' : type.includes('quicktime') ? 'mov' : 'webm');
    const file = new File([item.blob], item.name.replace(/\.\w+$/, '') + '.' + ext, {type:item.type, lastModified:item.created || Date.now()});
    saved = await window.vzipCloudImport(file, {...item, blob:undefined, name:item.name.replace(/\.\w+$/, '')}, onProgress, {signal});
  } else {
    await window.vzipStorePracticeMedia(item);
  }
  window.dispatchEvent(new CustomEvent('vzip:media-saved', {detail:{id:saved.id, source:item.source, durationSeconds:item.durationSeconds}}));
  return saved;
};
/** Import a picked File. Videos become their original audio (vzipPrepareMedia, from main);
 * the capture date comes from file metadata unless the user picked one (choice.date). */
M.importFile = async (file, choice, onProgress, signal) => {
  const type = typeOf(file);
  if (!/^(audio|video)\//.test(type)) throw Error('지원하지 않는 형식이에요.');
  if (!file.size) throw Error('빈 파일은 가져올 수 없어요.');
  if (file.size > (window.VzipChunks?.MAX_SIZE || 1073741824)) throw Error('파일당 최대 1GB까지 가져올 수 있어요.');
  if (!window.vzipPrepareMedia) throw Error('가져오기 모듈을 불러오지 못했어요. 새로고침해 주세요.');
  const typed = file.type === type ? file : new File([file], file.name, {type, lastModified:file.lastModified});
  const prepared = await window.vzipPrepareMedia(typed, {signal, onProgress:msg => onProgress?.(msg)});
  try {
    const out = prepared.file, meta = {...prepared.metadata};
    // Keep the length so practice time can include imported files.
    if (!(Number(meta.durationSeconds) > 0)) meta.durationSeconds = await M.measure({blob:out, type:out.type || typeOf(out), name:out.name}, 8000);
    // A file named yyyy-MM-dd_HH-mm-ss keeps that exact time (also when the chosen date is the same day).
    const named = window.VzipMediaDates?.fromName?.(file.name);
    if (named?.timeless && (!choice.date || choice.date === named.recordedDate)) {
      // Month-day names ("11-5 #10.m4a") give the day; the file's own time is kept when it is on that day.
      if (meta.recordedDate !== named.recordedDate) { const d = VZ.parseYmd(named.recordedDate), keep = new Date(meta.created || file.lastModified || Date.now()); Object.assign(meta, {created:new Date(d.getFullYear(), d.getMonth(), d.getDate(), keep.getHours(), keep.getMinutes()).getTime(), recordedDate:named.recordedDate, dateSource:'filename'}); }
    } else if (named && (!choice.date || choice.date === named.recordedDate)) Object.assign(meta, named);
    else if (choice.date) {
      const d = VZ.parseYmd(choice.date), keep = new Date(meta.created || file.lastModified || Date.now());
      Object.assign(meta, {created:new Date(d.getFullYear(), d.getMonth(), d.getDate(), keep.getHours(), keep.getMinutes()).getTime(), recordedDate:choice.date, dateSource:'manual'});
    }
    // A file given a song is named after the song and its recording day.
    const day = /^\d{4}-\d{2}-\d{2}$/.test(meta.recordedDate || '') ? meta.recordedDate : VZ.ymd(new Date(meta.created || file.lastModified || Date.now()));
    const title = choice.songId ? VZ.songTitle(choice.songId) : '';
    const name = title ? M.autoName(title, day) : (choice.name || file.name).replace(/\.[^.]+$/, '');
    // choice.extra carries import facts (source type, original file name, hash, imported time) kept with the file.
    const info = {...meta, ...(choice.extra || {}), id:choice.id, name, type:out.type || typeOf(out), songId:choice.songId || '', song:choice.song || '', source:'import'};
    let saved;
    // Large files, and bulk imports (choice.direct), go straight to the cloud from the picked file: no device copy, so a
    // thousand files never fill Safari's storage. "Done" then means the server confirmed the row (see vzipCloudImport).
    if (window.vzipCloudSignedIn?.() && (out.size > LOCAL_LIMIT || choice.direct)) {
      saved = {...await window.vzipCloudImport(out, info, p => onProgress?.(p), {signal}), cloud:true};
    } else if (window.vzipCloudSignedIn?.()) {
      // Signed in: keep the file on this device first, then the cloud upload runs from that copy.
      // iOS pauses web apps in the background; the upload resumes on return and nothing is lost.
      if (signal?.aborted) throw new DOMException('취소', 'AbortError');
      saved = {...info, blob:out, importedAt:Date.now(), local:true, pendingUpload:true};
      await window.vzipStorePracticeMedia(saved);
      window.dispatchEvent(new CustomEvent('vzip:media-saved', {detail:{id:saved.id, source:'import'}}));
    } else {
      if (out.size > LOCAL_LIMIT) throw Error('25MB 초과 음원은 로그인 후 가져올 수 있어요.');
      if (signal?.aborted) throw new DOMException('취소', 'AbortError');
      saved = {...info, blob:out, importedAt:Date.now(), local:true};
      await window.vzipStorePracticeMedia(saved);
      window.dispatchEvent(new CustomEvent('vzip:media-saved', {detail:{id:saved.id, source:'import'}}));
    }
    // Only a saved file claims its name, so a failed attempt retries under the same name.
    if (title) M.reserveName(name);
    window.dispatchEvent(new CustomEvent('vzip:media-imported', {detail:{id:info.id, date:info.recordedDate}}));
    onProgress?.(100);
    return {...saved, originalSize:file.size, savedSize:out.size, extracted:!!meta.audioExtraction, flac:!!meta.losslessFlac};
  } finally { await prepared.dispose(); }
};
M.update = async (item, changes, {quiet = false} = {}) => {
  if (item.cloud) await window.vzipCloudMediaUpdate(item, changes);
  if (item.local) {
    const stored = (await window.vzipReadMedia()).find(x => x.id === item.id);
    if (stored) await tx('readwrite', s => s.put({...stored, ...changes}));
  }
  // Only the changed fields travel; cloudDone tells the sync layer the cloud row is already saved.
  if (!quiet) window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:item.id, changes, cloudDone:!!item.cloud}}));
};
/** Conservative song-only change for bulk suggestions.
 * Cloud metadata is merged under a database compare-and-swap, not overwritten from a list snapshot. */
M.assignSongSafe=async(item,changes,{expectedSongId='',expectedSong='',expectedUpdatedAt=null}={})=>{
 const selected={songId:String(changes.songId||''),song:String(changes.song||'')};
 let existing=null;
 if(item.local){
  existing=(await window.vzipReadMedia()).find(x=>x.id===item.id);
  if(existing&&((existing.songId||'')!==expectedSongId||(existing.song||'')!==expectedSong))
   throw Error('이 기기에서 곡이 변경됐어요. 목록을 새로고침해 주세요.');
 }
 let cloudResult=null;
 if(item.cloud){
  if(!window.vzipCloudMediaAssignSong)throw Error('곡 전용 안전 저장 기능을 확인할 수 없어요.');
  cloudResult=await window.vzipCloudMediaAssignSong(item,selected,{expectedSongId,expectedSong,expectedUpdatedAt});
 }
 if(item.local&&existing)await tx('readwrite',s=>s.put({...existing,...selected}));
 // Only the song changed; the cloud row (if any) is already written: the sync layer must not re-send device fields.
 window.dispatchEvent(new CustomEvent('vzip:media-updated',{detail:{id:item.id,changes:selected,cloudDone:!!item.cloud}}));
 return cloudResult||{updatedAt:null};
};
/* ---------- durations ---------- */
/** Read a file's length from its metadata only (no full download/decode). */
M.measure = (item, timeout = 15000) => new Promise(async resolve => {
  let src = null, el = null, timer = null;
  const done = value => { clearTimeout(timer); if (el) { el.removeAttribute('src'); el.load?.(); } if (src?.revoke) URL.revokeObjectURL(src.url); resolve(value); };
  try { src = await M.src(item); } catch { done(0); return; }
  el = document.createElement('audio'); el.preload = 'metadata'; el.muted = true;
  el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 10) / 10 : 0);
  el.onerror = () => done(0);
  timer = setTimeout(() => done(0), timeout);
  el.src = src.url;
});
const measured = new Set();
/** Fill missing durations (imports before this change were saved without one). Returns how many were filled. */
M.fillDurations = async (items, {limit = 10} = {}) => {
  // A few at a time: each one reads the start of the file, and hundreds would crowd out playback on a phone.
  let filled = 0, tried = 0;
  for (const item of items) {
    if (Number(item.durationSeconds) > 0 || measured.has(item.id)) continue;
    if (tried++ >= limit) break;
    measured.add(item.id);
    const seconds = await M.measure(item);
    if (!seconds) continue;
    try { await M.update(item, {durationSeconds:seconds}, {quiet:true}); item.durationSeconds = seconds; filled++; } catch {}
  }
  if (filled) { M.invalidate(); window.dispatchEvent(new Event('vzip:v6-media')); }
  return filled;
};
const removing = new Set();
M.confirmRemove = item => VZ.confirm('파일 영구 삭제', '“' + M.label(item) + '” 파일을 삭제할까요?\n\n이 기기와 클라우드의 파일 및 연결을 삭제해요. 연습·레슨 기록, 메모와 연습 시간은 남아요. 다른 기기에 따로 내려받은 사본은 남을 수 있어요. 파일은 복구할 수 없어요.', {ok:'파일 영구 삭제', danger:true});
M.remove = async item => {
  if (removing.has(item.id)) throw Error('이미 삭제 중이에요.');
  if (backup.running) throw Error('자동 백업이 끝난 뒤 삭제해 주세요.');
  removing.add(item.id); M.holdBackup(true);
  try {
    // A list snapshot can predate automatic backup. Resolve the cloud copy again.
    if (item.cloud || window.vzipCloudSignedIn?.()) await window.vzipCloudMediaDelete(item);
    // Save the unlink intent before removing local bytes; a failed write remains retryable.
    if (!VZ.change(d => window.VzipDataMerge.deleteMedia(d, item.id), {silent:true})) throw Error('파일 연결 정리를 저장하지 못했어요. 다시 시도해 주세요.');
    for (const player of players) if (player.item.id === item.id) player.destroy();
    await tx('readwrite', s => s.delete(item.id));
    changed();
  } finally { removing.delete(item.id); M.holdBackup(false); }
};
M.src = async item => {
  const blob = blobOf(item);
  if (blob) return {url:URL.createObjectURL(blob), revoke:true};
  if (item.cloud) return {url:await window.vzipCloudMediaUrl(item), revoke:false};
  throw Error('이 기기와 클라우드 모두에서 원본을 찾지 못했어요.');
};
M.download = async item => {
  const {url, revoke} = await M.src(item);
  const a = document.createElement('a'); a.href = url; a.download = M.label(item); document.body.append(a); a.click(); a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/* ---------- automatic cloud backup ---------- */
/* While signed in, copy device-only files to the user's cloud so they survive a cleared browser,
 * another app context (Safari / home-screen app / in-app browser) or a new phone. Additive only:
 * nothing is overwritten or deleted, and an existing cloud copy with the same id is kept. */
const extOf = type => ({'audio/mp4':'m4a','video/mp4':'mp4','video/quicktime':'mov','audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/aac':'aac','audio/ogg':'ogg','audio/flac':'flac','audio/webm':'webm','video/webm':'webm'})[String(type || '').split(';')[0]] || 'bin';
const backup = {running:false, total:0, done:0, failed:0, waiting:false};
M.backupStatus = () => ({...backup});
M.localOnly = items => items.filter(m => m.local && !m.cloud && blobOf(m) && !(VZ.db.deleted?.media || []).includes(m.id));
/** A bulk upload holds the single upload slot; the background backup waits until it ends. */
let held = 0;
M.holdBackup = on => { held = Math.max(0, held + (on ? 1 : -1)); if (!held) M.scheduleBackup(3000); };
M.backupLocal = async () => {
  if (held) return backup;
  if (backup.running || !window.vzipCloudSignedIn?.() || !window.vzipCloudImport) return backup;
  // Only device files can need uploading: with none on this device there is nothing to ask the server (and no list refresh).
  try { if (!(await window.vzipReadMedia()).length) return backup; } catch {}
  if (backup.running) return backup;
  backup.running = true; backup.waiting = false; M.keepAwake(true);
  const notify = () => window.dispatchEvent(new Event('vzip:v6-backup'));
  try {
    const pending = M.localOnly(await M.list(true));
    Object.assign(backup, {total:pending.length, done:0, failed:0}); notify();
    for (const item of pending) {
      if (!window.vzipCloudSignedIn?.() || held) break;
      let prepared = null;
      try {
        let blob = blobOf(item), info = {...item};
        delete info.blob; delete info.bytes; delete info.local; delete info.cloud;
        // The cloud keeps audio only; device videos (older camera recordings) upload their original audio.
        if (M.isVideo(item)) {
          if (!window.vzipPrepareMedia) throw Error('영상 음원 추출을 사용할 수 없어요.');
          prepared = await window.vzipPrepareMedia(new File([blob], M.label(item) + '.' + extOf(item.type), {type:typeOf(item), lastModified:item.created || Date.now()}));
          blob = prepared.file; info = {...info, ...prepared.metadata, created:item.created, recordedDate:item.recordedDate || prepared.metadata.recordedDate, dateSource:item.dateSource || prepared.metadata.dateSource, type:prepared.file.type};
        }
        const type = blob.type || typeOf(item);
        const file = new File([blob], M.label(item) + '.' + extOf(type), {type, lastModified:item.created || Date.now()});
        const meta = await window.vzipCloudImport(file, {...info, id:item.id, name:M.label(item), type, source:item.source || 'practice'});
        // Fields the importer does not carry (rating, review, waveform) follow in one update.
        const extra = {}; for (const k of ['rating', 'review', 'waveform', 'importedAt', 'occasion']) if (item[k] != null) extra[k] = item[k];
        if (Object.keys(extra).length) await window.vzipCloudMediaUpdate({...meta, id:item.id}, extra);
        backup.done++;
      } catch (e) {
        backup.failed++;
        // Another upload holds the lock: try again shortly instead of counting it lost.
        if (/다른 파일을 업로드/.test(e.message || '')) backup.waiting = true;
        console.warn('backup failed', item.id, e);
      } finally { await prepared?.dispose?.(); notify(); }
    }
  } finally {
    backup.running = false; M.keepAwake(false); M.invalidate(); notify();
    window.dispatchEvent(new Event('vzip:v6-media'));
    if (backup.waiting) setTimeout(() => M.backupLocal(), 15000);
    // Uploads cut off by leaving the app (or a weak connection) are retried with a growing pause.
    else if (backup.failed) { backup.retries = (backup.retries || 0) + 1; M.scheduleBackup(Math.min(600000, 15000 * 2 ** Math.min(backup.retries, 6))); }
    else backup.retries = 0;
  }
  return backup;
};
/** Keep the screen on while files are being saved or uploaded (where the browser allows it). */
let awake = 0, lock = null;
const relock = async () => { if (awake > 0 && !lock && document.visibilityState === 'visible' && navigator.wakeLock) { try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch {} } };
M.keepAwake = on => { awake = Math.max(0, awake + (on ? 1 : -1)); if (awake) relock(); else { lock?.release?.().catch(() => {}); lock = null; } };
// Coming back to the app (or getting a connection back) picks up any upload that was left over.
const resume = () => { if (document.visibilityState !== 'visible') return; relock(); if (window.vzipCloudSignedIn?.() && !backup.running) { backup.retries = 0; M.scheduleBackup(800); } };
document.addEventListener('visibilitychange', resume);
window.addEventListener('online', resume);
window.addEventListener('pageshow', resume);
/* Upload indicator on every screen while the cloud upload runs. */
window.addEventListener('vzip:v6-backup', () => {
  let pill = document.getElementById('vz-upload-pill');
  if (!backup.running || !backup.total) { pill?.remove(); return; }
  if (!pill) { pill = document.createElement('a'); pill.id = 'vz-upload-pill'; pill.href = '#/library'; pill.setAttribute('role', 'status'); document.body.append(pill); }
  pill.textContent = '☁ 클라우드 업로드 중 ' + Math.min(backup.total, backup.done + backup.failed + 1) + '/' + backup.total + ' · 다른 앱을 쓰다 와도 이어서 올라가요';
});
let backupTimer = null;
M.scheduleBackup = (delay = 3000) => { clearTimeout(backupTimer); backupTimer = setTimeout(() => M.backupLocal().catch(() => {}), delay); };
window.addEventListener('vzip:auth-changed', () => { if (window.vzipCloudSignedIn?.()) M.scheduleBackup(4000); });
window.addEventListener('vzip:media-saved', () => M.scheduleBackup(2500));

/* ---------- import helpers ---------- */
/** Cheap fingerprint for duplicate checks: size + first/last 256KB (never reads the whole file). */
M.fingerprint = async file => {
  const edge = 256 * 1024, parts = [new TextEncoder().encode(String(file.size)), new Uint8Array(await file.slice(0, edge).arrayBuffer())];
  if (file.size > edge * 2) parts.push(new Uint8Array(await file.slice(file.size - edge).arrayBuffer()));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { all.set(p, at); at += p.length; }
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', all)), b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
};
/* ---------- player ---------- */
const players = new Set();
M.playing = () => [...players].some(p => !p.el.paused);
M.stopAll = except => players.forEach(p => { if (p !== except) p.pause(); });
M.destroyAll = () => [...players].forEach(p => p.destroy());
window.addEventListener('pagehide', () => M.destroyAll());
/** Custom player with seek, speed and A-B loop. opts: {tools:bool, onReady} */
M.player = (host, item, opts = {}) => {
  const video = M.isVideo(item);
  host.innerHTML = '<div class="player"><div class="player-row"><button type="button" class="player-btn" data-play aria-label="재생"><i class="ph-fill ph-play"></i></button><input type="range" min="0" max="1000" value="0" step="1" aria-label="재생 위치" disabled><span class="time">0:00 / ' + VZ.clock(item.durationSeconds) + '</span></div>' +
    (opts.tools ? '<div class="tools">' + (opts.speed === false ? '' : '<button type="button" class="chip" data-speed>속도 1.0×</button>') + '<button type="button" class="chip" data-a>A 지점</button><button type="button" class="chip" data-b disabled>B 지점</button><button type="button" class="chip" data-clear hidden>반복 해제</button></div>' : '') +
    '<p class="small muted" data-msg role="status"></p></div>';
  const root = host.firstChild, btn = root.querySelector('[data-play]'), range = root.querySelector('input'), time = root.querySelector('.time'), msg = root.querySelector('[data-msg]');
  const el = document.createElement(video ? 'video' : 'audio');
  el.preload = 'metadata'; el.playsInline = true; el.setAttribute('playsinline', '');
  if (video) root.prepend(el);
  let url = null, revoke = false, ready = null, loopA = null, loopB = null, dead = false;
  const duration = () => Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Number(item.durationSeconds) || 0;
  const paint = () => {
    const d = duration();
    if (!range.matches(':active')) range.value = d ? Math.round(el.currentTime / d * 1000) : 0;
    time.textContent = VZ.clock(el.currentTime) + ' / ' + VZ.clock(d);
  };
  // A source already here is set right away, so play() runs inside the tap (iPhone Safari blocks it later).
  const now = M.srcNow(item);
  if (now) { url = now.url; revoke = now.revoke; el.src = url; range.disabled = false; ready = Promise.resolve(); }
  const load = () => ready ||= M.src(item).then(r => { if (dead) { if (r.revoke) URL.revokeObjectURL(r.url); return; } url = r.url; revoke = r.revoke; el.src = url; range.disabled = false; })
    .catch(e => { msg.textContent = '재생할 수 없어요: ' + e.message; ready = null; throw e; });
  const api = {
    el, item,
    /* iOS Safari only allows play() inside the tap. When the source is ready, call it
     * synchronously; otherwise fetch it first and ask for one more tap if blocked. */
    play() {
      M.stopAll(api);
      const run = () => el.play().then(() => { msg.textContent = ''; }).catch(e => {
        if (e?.name === 'NotAllowedError') msg.textContent = '재생 버튼을 한 번 더 눌러 주세요.';
        else if (e?.name !== 'AbortError' && !msg.textContent) msg.textContent = '재생할 수 없어요. 이 브라우저가 지원하지 않는 형식일 수 있어요.';
      });
      if (url) return run();
      msg.textContent = item.cloud && !blobOf(item) ? '클라우드에서 불러오는 중…' : '';
      return load().then(() => { if (!dead) return run(); }, () => {});
    },
    pause() { el.pause(); },
    seek(t) { el.currentTime = Math.max(0, Math.min(t, duration() || t)); paint(); },
    setRate(r) { el.playbackRate = r; const b = root.querySelector('[data-speed]'); if (b) b.textContent = '속도 ' + r.toFixed(2).replace(/0$/, '') + '×'; },
    load,
    destroy() { dead = true; el.pause(); el.removeAttribute('src'); el.load?.(); if (url && revoke) URL.revokeObjectURL(url); players.delete(api); }
  };
  players.add(api);
  btn.onclick = () => el.paused ? api.play() : api.pause();
  el.onplay = () => { btn.innerHTML = '<i class="ph-fill ph-pause"></i>'; btn.setAttribute('aria-label', '일시정지'); };
  el.onpause = el.onended = () => { btn.innerHTML = '<i class="ph-fill ph-play"></i>'; btn.setAttribute('aria-label', '재생'); };
  el.ontimeupdate = () => { if (loopA != null && loopB != null && el.currentTime >= loopB) el.currentTime = loopA; paint(); };
  el.onloadedmetadata = el.ondurationchange = paint;
  el.onerror = () => { const t = typeOf(item); msg.textContent = /webm|ogg/.test(t) && /iP(hone|ad)|Safari/.test(navigator.userAgent) && !/Chrome|Android/.test(navigator.userAgent) ? '이 기기의 Safari는 ' + t.split('/')[1].toUpperCase() + ' 형식을 재생하지 못할 수 있어요. 파일을 내려받아 다른 앱에서 열어 주세요.' : '재생할 수 없어요. 형식을 지원하지 않거나 파일이 손상됐을 수 있어요.'; };
  range.oninput = () => { const d = duration(); if (d) el.currentTime = range.value / 1000 * d; paint(); };
  if (opts.tools) {
    const speeds = [1, 1.25, 0.5, 0.75];
    if (root.querySelector('[data-speed]')) root.querySelector('[data-speed]').onclick = () => api.setRate(speeds[(speeds.indexOf(el.playbackRate) + 1) % speeds.length] || 1);
    const a = root.querySelector('[data-a]'), b = root.querySelector('[data-b]'), clear = root.querySelector('[data-clear]');
    a.onclick = () => { loopA = el.currentTime; loopB = null; a.textContent = 'A ' + VZ.clock(loopA); a.setAttribute('aria-pressed', 'true'); b.disabled = false; b.textContent = 'B 지점'; clear.hidden = false; };
    b.onclick = () => { if (el.currentTime <= loopA) { msg.textContent = 'B 지점은 A 지점보다 뒤여야 해요.'; return; } loopB = el.currentTime; b.textContent = 'B ' + VZ.clock(loopB); b.setAttribute('aria-pressed', 'true'); msg.textContent = '구간 반복 중'; el.currentTime = loopA; };
    clear.onclick = () => { loopA = loopB = null; a.textContent = 'A 지점'; b.textContent = 'B 지점'; b.disabled = true; clear.hidden = true; a.removeAttribute('aria-pressed'); b.removeAttribute('aria-pressed'); msg.textContent = ''; };
  }
  // Prefetch so a later tap can start playback synchronously (needed on iOS).
  if (video || opts.prefetch !== false) load().catch(() => {});
  return api;
};

/* ---------- recorder engine ---------- */
const pickMime = video => {
  const list = video ? ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return list.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
};
M.canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
/** Creates a capture session. Callbacks: onLevel(0..1), onTick(seconds). */
M.capture = async ({onLevel, onTick}) => {
  const video = false; // Camera capture was removed in v5.8 (audio-only product decision).
  if (!M.canRecord()) throw Object.assign(Error('이 브라우저는 녹음을 지원하지 않아요. 최신 Safari 또는 Chrome을 사용해 주세요.'), {code:'unsupported'});
  let stream;
  try {
    const md = navigator.mediaDevices;
    try { stream = await md.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}}); }
    catch (first) {
      // Some engines reject raw-voice constraints ("Invalid constraint"); fall back to defaults.
      if (first.name !== 'OverconstrainedError' && first.name !== 'TypeError' && !/constraint/i.test(first.message || '')) throw first;
      stream = await md.getUserMedia({audio:true});
    }
  } catch (e) {
    const denied = e.name === 'NotAllowedError' || e.name === 'SecurityError';
    throw Object.assign(Error(denied ? (video ? '카메라·마이크' : '마이크') + ' 권한이 거부됐어요. 브라우저 설정에서 권한을 허용한 뒤 다시 시도해 주세요.' : e.name === 'NotFoundError' ? '사용할 수 있는 ' + (video ? '카메라' : '마이크') + '가 없어요.' : '녹음을 시작하지 못했어요: ' + e.message), {code:denied ? 'denied' : 'device'});
  }
  const mime = pickMime(video);
  let recorder;
  try { recorder = new MediaRecorder(stream, mime ? {mimeType:mime} : undefined); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); throw Error('녹음 형식을 준비하지 못했어요: ' + e.message); }
  const chunks = [], peaks = [];
  let ctx, analyser, raf, timer, elapsed = 0, startedAt = 0, frame = 0;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
  } catch { analyser = null; }
  const data = analyser ? new Uint8Array(analyser.fftSize) : null;
  const sample = () => {
    if (analyser) {
      analyser.getByteTimeDomainData(data);
      let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      onLevel?.(peak); if (++frame % 6 === 0) peaks.push(+peak.toFixed(3));
    }
    raf = requestAnimationFrame(sample);
  };
  const seconds = () => elapsed + (startedAt ? (performance.now() - startedAt) / 1000 : 0);
  recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
  const release = () => { cancelAnimationFrame(raf); clearInterval(timer); stream.getTracks().forEach(t => t.stop()); ctx?.close().catch(() => {}); };
  const session = {
    stream, mime:recorder.mimeType || mime,
    start() { recorder.start(1000); startedAt = performance.now(); sample(); timer = setInterval(() => onTick?.(seconds()), 200); },
    pause() { if (recorder.state !== 'recording') return; recorder.pause(); elapsed = seconds(); startedAt = 0; },
    resume() { if (recorder.state !== 'paused') return; recorder.resume(); startedAt = performance.now(); },
    get state() { return recorder.state; },
    seconds,
    stop() {
      return new Promise((resolve, reject) => {
        const total = seconds();
        recorder.onstop = () => {
          release();
          const type = (recorder.mimeType || mime || (video ? 'video/webm' : 'audio/webm')).split(';')[0];
          const blob = new Blob(chunks, {type});
          if (!blob.size) { reject(Error('녹음된 데이터가 없어요. 다시 시도해 주세요.')); return; }
          // Downsample peaks to ≤512 values for the waveform summary.
          const step = Math.max(1, Math.ceil(peaks.length / 512)), wave = [];
          for (let i = 0; i < peaks.length; i += step) wave.push(Math.max(...peaks.slice(i, i + step)));
          resolve({blob, type, durationSeconds:Math.round(total * 10) / 10, waveform:wave});
        };
        try { recorder.state === 'inactive' ? recorder.onstop() : recorder.stop(); } catch (e) { release(); reject(e); }
      });
    },
    cancel() { try { recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); } catch {} release(); }
  };
  return session;
};
M.drawWave = (canvas, values, color = '#7552d9') => {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.fillStyle = color;
  const bars = Math.floor(w / 4), slice = values.slice(-bars);
  slice.forEach((v, i) => { const bh = Math.max(2, Math.min(1, v * 1.6) * h); g.fillRect(w - (slice.length - i) * 4, (h - bh) / 2, 2.5, bh); });
};
})();
