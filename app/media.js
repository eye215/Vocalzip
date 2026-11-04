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
let cache = null, loading = null, cloudError = '';
M.cloudError = () => cloudError;
M.invalidate = () => { cache = null; };
/** Local + cloud items merged by id, newest first. */
M.list = async (force) => {
  if (cache && !force) return cache;
  if (loading) return loading;
  loading = (async () => {
    const map = new Map();
    try { (await window.vzipReadMedia()).forEach(x => map.set(x.id, {...x, local:true})); } catch (e) { console.error(e); }
    cloudError = '';
    if (window.vzipCloudSignedIn?.()) {
      try { (await window.vzipCloudMediaList()).forEach(x => map.set(x.id, {...x, ...(map.get(x.id) || {}), cloud:true, path:x.path, parts:x.parts, storageVersion:x.storageVersion})); }
      catch (e) { cloudError = '클라우드 목록을 불러오지 못했어요: ' + e.message; }
    }
    cache = [...map.values()].sort((a, b) => (b.created || 0) - (a.created || 0));
    return cache;
  })();
  try { return await loading; } finally { loading = null; }
};
M.cached = () => cache || [];
/** Calendar day of a recording: explicit recordedDate (metadata or manual) wins over the timestamp. */
M.dateOf = item => /^\d{4}-\d{2}-\d{2}$/.test(item?.recordedDate || '') ? item.recordedDate : Number(item?.created) > 0 ? VZ.ymd(new Date(Number(item.created))) : '';
M.isVideo = item => typeOf(item).startsWith('video/');
M.label = item => item.name || '이름 없는 녹음';
M.sourceLabel = s => ({practice:'녹음', record:'녹음', lesson:'레슨', import:'가져옴'})[s] || '녹음';
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
    if (choice.date) {
      const d = VZ.parseYmd(choice.date), keep = new Date(meta.created || file.lastModified || Date.now());
      Object.assign(meta, {created:new Date(d.getFullYear(), d.getMonth(), d.getDate(), keep.getHours(), keep.getMinutes()).getTime(), recordedDate:choice.date, dateSource:'manual'});
    }
    const info = {...meta, id:choice.id, name:(choice.name || file.name).replace(/\.[^.]+$/, ''), type:out.type || typeOf(out), songId:choice.songId || '', song:choice.song || '', source:'import'};
    let saved;
    if (window.vzipCloudSignedIn?.()) {
      saved = await window.vzipCloudImport(out, info, p => onProgress?.(p), {signal});
    } else {
      if (out.size > LOCAL_LIMIT) throw Error('25MB 초과 음원은 로그인 후 가져올 수 있어요.');
      if (signal?.aborted) throw new DOMException('취소', 'AbortError');
      saved = {...info, blob:out, importedAt:Date.now()};
      await window.vzipStorePracticeMedia(saved);
      window.dispatchEvent(new CustomEvent('vzip:media-saved', {detail:{id:saved.id, source:'import'}}));
    }
    window.dispatchEvent(new CustomEvent('vzip:media-imported', {detail:{id:info.id, date:info.recordedDate}}));
    onProgress?.(100);
    return {...saved, originalSize:file.size, savedSize:out.size, extracted:!!meta.audioExtraction};
  } finally { await prepared.dispose(); }
};
M.update = async (item, changes) => {
  if (item.cloud) await window.vzipCloudMediaUpdate(item, changes);
  if (item.local) {
    const stored = (await window.vzipReadMedia()).find(x => x.id === item.id);
    if (stored) await tx('readwrite', s => s.put({...stored, ...changes}));
  }
  window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:item.id}}));
};
M.remove = async item => {
  if (item.cloud) await window.vzipCloudMediaDelete(item);
  if (item.local) await tx('readwrite', s => s.delete(item.id));
  changed();
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
