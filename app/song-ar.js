/* 원곡 파일 (음정 비교용): one original recording (AR) per song, uploaded by the owner to R2 as is (original bytes, no
 * re-encode) through the same upload path as MR files. Stored on the song as `arFile` (never in the recording library,
 * so it is never counted as the owner's own take). YouTube/streaming AR links cannot be analysed (no download).
 *
 * The original singer's melody is extracted from it on this device, once (app/ar-melody-model.js): the file is fetched,
 * decoded, analysed by the same voice-over-accompaniment analyzer as the recordings (in its worker), cut into confident
 * sung notes and kept small on the song as `arReference` (packed notes + model/analyzer version + the file's SHA-256).
 * It is reused until the file changes or the owner taps 다시 추출. The AR file itself is never changed.
 *   VZ.renderSongAr(host, song)                      — 레퍼런스 tab section (upload, play, extraction state)
 *   VZ.arFile(songId) / VZ.arReference(songId)       — the current file / its current reference (packed) or null
 *   VZ.arReferenceEnsure(song, {force, onStage})     — extract once (shared while running), returns the packed reference */
(() => {
'use strict';
const V = window.VZ, AM = window.VzipArMelody;
if (!V || !AM) return;
const esc = V.esc, MAX = 100 * 1024 * 1024, MAX_SECONDS = 15 * 60;
const identity = () => [window.vzipCloudUserId?.() || 'device', window.vzipCloudSessionId?.() || '', window.VzipAccountScope?.owner || ''].join(':');
const fileOf = id => { const f = V.song(id)?.arFile; return f && f.r2Key && f.id ? f : null; };
const refOf = id => { const s = V.song(id), f = fileOf(id); return f && AM.current(s?.arReference, f) ? s.arReference : null; };
V.arFile = fileOf;
V.arReference = refOf;

async function sha256(bytes) {
  if (window.crypto?.subtle) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); return Array.from(d, b => b.toString(16).padStart(2, '0')).join(''); }
  // No WebCrypto (insecure context): FNV-1a 64 over the bytes, marked as such.
  const u = new Uint8Array(bytes); let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 16777619) >>> 0; h2 = Math.imul(h2 ^ u[i], 2246822519) >>> 0; }
  return 'fnv-' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
/** Mono samples at a low rate (the analyzer works at 8 kHz), decoded by the browser. */
async function decode(bytes) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw Error('이 브라우저는 오디오 분석을 지원하지 않아요.');
  let ctx = null; for (const rate of [8000, 16000, 44100]) { try { ctx = new Ctx(1, rate, rate); break; } catch {} }
  if (!ctx) throw Error('이 브라우저는 오디오 분석을 지원하지 않아요.');
  const buf = await new Promise((resolve, reject) => { const p = ctx.decodeAudioData(bytes, resolve, reject); if (p?.then) p.then(resolve, reject); });
  const n = Math.min(buf.length, Math.floor(MAX_SECONDS * buf.sampleRate)), mono = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  return {samples:mono, sampleRate:buf.sampleRate};
}

/* ---------- extraction (once per file) ---------- */
const running = new Map(); // song id → {promise, stage, listeners}
const listeners = new Set();
const notify = () => listeners.forEach(f => { try { f(); } catch {} });
V.arReferenceStage = id => running.get(id)?.stage || '';
V.arReferenceEnsure = (songArg, {force = false, onStage = () => {}} = {}) => {
  const id = songArg?.id, have = refOf(id);
  if (have && !force) return Promise.resolve(have);
  const now = running.get(id);
  if (now) { now.listeners.add(onStage); onStage(now.stage); return now.promise; }
  const job = {stage:'', listeners:new Set([onStage])};
  const stage = text => { job.stage = text; job.listeners.forEach(f => { try { f(text); } catch {} }); notify(); };
  job.promise = (async () => {
    const file = fileOf(id), account = identity();
    if (!file) throw Error('이 곡에 올린 원곡 파일이 없어요.');
    if (!window.VzipR2?.enabled?.()) throw Error('로그인하고 클라우드에 올린 원곡 파일에서 쓸 수 있어요.');
    stage('원곡 파일 받는 중…');
    const res = await fetch(await window.VzipR2.url(file.r2Key), {cache:'no-store'});
    if (!res.ok) throw Error('원곡 파일을 받지 못했어요 (' + res.status + ').');
    const bytes = await res.arrayBuffer(), hash = await sha256(bytes);
    if (file.sha256 && hash !== file.sha256) throw Error('받은 원곡 파일이 올린 파일과 달라요. 다시 시도해 주세요.');
    stage('원곡 소리 꺼내는 중…');
    const {samples, sampleRate} = await decode(bytes);
    stage('원곡에서 노래 멜로디 찾는 중… (반주와 구분)');
    const result = await V.analyzeSamples(samples, sampleRate, p => stage('원곡에서 노래 멜로디 찾는 중… ' + Math.round(p * 100) + '%'));
    if (identity() !== account || window.VzipAccountScope?.leaving) throw Error('계정이 바뀌어 중단했어요.');
    const ref = AM.extract(result);
    const packed = AM.pack(ref, {file:file.id, hash:file.sha256 || hash, analyzer:result.version + '/' + (result.confidence?.pitchMethod || '')});
    const ok = V.change(db => {
      const s = db.songs.find(x => x.id === id);
      if (!s) throw Error('곡을 찾을 수 없어요.');
      if (s.arFile?.id !== file.id) throw Error('원곡 파일이 그 사이 바뀌었어요.');
      s.arReference = packed; // derived data only; the file and its metadata stay as uploaded
    }, {silent:true});
    if (!ok) throw Error('원곡 멜로디를 저장하지 못했어요.');
    return packed;
  })();
  running.set(id, job);
  const done = () => { if (running.get(id) === job) running.delete(id); notify(); };
  job.promise.then(done, done);
  return job.promise;
};

/* ---------- 레퍼런스 tab ---------- */
const clockOf = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function refLine(song) {
  const id = song.id, f = fileOf(id), saved = V.song(id)?.arReference, ref = refOf(id), stage = V.arReferenceStage(id);
  if (!f) return '';
  if (stage) return '<p class="vz-arfile-state" role="status" data-ar-ref-state="running">' + esc(stage) + '</p>';
  if (!ref) return '<p class="vz-arfile-state" data-ar-ref-state="none">원곡 멜로디: 아직 뽑지 않았어요' + (saved ? ' (파일이 바뀌어 다시 뽑아야 해요)' : '') + '. <button type="button" class="vz-arfile-btn" data-ar-extract>멜로디 추출</button></p>';
  const st = ref.stats || {}, range = st.low != null ? ' · ' + AM_NAME(st.low) + '–' + AM_NAME(st.high) : '';
  const when = ref.at ? ' · ' + esc(V.dateLabel?.(V.ymd(new Date(ref.at))) || '') : '';
  return ref.state === 'ok'
    ? '<p class="vz-arfile-state" data-ar-ref-state="ok">원곡 가수의 멜로디(자동 추출): 음 ' + (st.notes || 0) + '개' + range + when + ' <button type="button" class="vz-arfile-btn" data-ar-extract>다시 추출</button></p>'
    : '<p class="vz-arfile-state hold" data-ar-ref-state="hold">원곡 멜로디 판정 보류: ' + esc(AM.holdRefText(ref.reason)) + '. 이 파일로는 비교하지 않아요. <button type="button" class="vz-arfile-btn" data-ar-extract>다시 추출</button></p>';
}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const AM_NAME = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

function add(song, redraw) {
  const account = identity(), controller = new AbortController(); let closed = false, busy = false;
  const abort = () => controller.abort(), release = window.VzipAccountScope?.beforeLeave?.(abort);
  window.addEventListener('vzip:auth-changed', abort);
  const guard = () => { if (closed || controller.signal.aborted || identity() !== account || window.VzipAccountScope?.leaving) throw Error('화면 또는 계정이 바뀌어 중단했어요.'); };
  V.sheet({title:'원곡 파일 올리기', body:'<form id="song-ar-add"><p class="small muted">원곡 가수가 부른 음원(보컬 포함)을 올리면, 이 기기에서 원곡 멜로디를 한 번 뽑아 내 녹음과 음 단위로 비교할 수 있어요. 파일은 그대로(재인코딩 없이) 클라우드에 비공개로 보관돼요.</p><label class="field"><span>이름 (선택)</span><input type="text" name="title" maxlength="120" placeholder="예: 원곡 음원"></label><label class="field"><span>원곡 오디오 파일</span><input type="file" name="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.webm,.caf" aria-label="원곡 오디오 파일" required></label><p class="small muted" data-ar-filename>MP3·M4A·WAV 등 오디오 파일, 최대 100MB</p><p class="small muted" data-ar-status role="status"></p></form>',
    foot:'<button type="submit" form="song-ar-add" class="btn block" data-ar-save disabled>올리기</button>',
    onClose:() => { closed = true; controller.abort(); window.removeEventListener('vzip:auth-changed', abort); release?.(); },
    onMount:(el, close) => {
      const form = el.querySelector('form'), input = form.elements.namedItem('file'), status = el.querySelector('[data-ar-status]'), go = el.querySelector('[data-ar-save]');
      input.onchange = () => { el.querySelector('[data-ar-filename]').textContent = input.files[0]?.name || '오디오 파일, 최대 100MB'; go.disabled = busy || !input.files[0]; };
      form.onsubmit = async e => {
        e.preventDefault(); if (busy) return;
        const file = input.files[0], title = form.elements.namedItem('title').value.trim();
        try { guard(); } catch (error) { status.textContent = error.message; return; }
        if (!file || !file.size) { status.textContent = '오디오 파일을 골라 주세요.'; return; }
        if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|aac|flac|ogg|webm|caf)$/i.test(file.name)) { status.textContent = '오디오 파일만 올릴 수 있어요.'; return; }
        if (file.size > MAX) { status.textContent = '100MB 이하 파일을 골라 주세요.'; return; }
        if (!window.vzipCloudSignedIn?.() || !window.VzipR2?.enabled?.()) { status.textContent = '파일 업로드는 로그인과 클라우드 연결이 필요해요.'; return; }
        busy = true; go.disabled = true; for (const c of form.elements) c.disabled = true;
        try {
          status.textContent = '파일 확인 중…';
          const hash = await sha256(await file.arrayBuffer());
          guard();
          const id = 'ar-' + V.uid(), type = V.media.typeOf(file);
          const receipt = await window.VzipR2.upload(file, {mediaId:id, type, signal:controller.signal, onProgress:p => { if (!closed) status.textContent = '올리는 중 ' + Math.round(p) + '%'; }});
          guard(); if (!receipt?.key) throw Error('업로드 결과를 확인하지 못했어요.');
          const entry = {id, title:title || file.name.replace(/\.[^.]+$/, ''), fileName:file.name, type, r2Key:receipt.key, size:file.size, sha256:hash, created:Date.now()};
          if (!V.change(db => { const s = db.songs.find(x => x.id === song.id); if (!s) throw Error('곡을 찾을 수 없어요.'); if (s.arFile?.r2Key) throw Error('이미 원곡 파일이 있어요.'); s.arFile = entry; delete s.arReference; })) throw Error('원곡 파일을 저장하지 못했어요. 다시 시도해 주세요.');
          close(); V.toast('원곡 파일을 올렸어요.'); redraw();
        } catch (error) { if (!closed) status.textContent = error.message || '올리지 못했어요.'; }
        finally { busy = false; if (!closed) { for (const c of form.elements) c.disabled = false; go.disabled = !input.files[0]; } }
      };
    }});
}
V.renderSongAr = (host, songArg) => {
  if (!host) return;
  const id = songArg.id;
  const draw = () => {
    if (!host.isConnected) { listeners.delete(draw); return; }
    const song = V.song(id) || songArg, f = fileOf(id), account = identity();
    const player = host.querySelector('[data-arfile-player]'), keepPlayer = player && !player.hidden && player.firstChild ? player : null;
    host.innerHTML = '<div class="vz-ar-links vz-arfile" role="group" aria-label="원곡 파일"><div class="vz-ar-heading"><strong>원곡 파일 <span>음정 비교용</span></strong>' + (f ? '' : '<button type="button" data-ar-file-add aria-label="원곡 파일 올리기"><i class="ph ph-plus" aria-hidden="true"></i></button>') + '</div>' +
      (f ? '<div class="vz-mr-list"><div class="vz-mr-row" data-arfile="' + esc(f.id) + '"><div class="vz-mr-row-head"><button type="button" data-arfile-open aria-expanded="false"><i class="ph ph-vinyl-record" aria-hidden="true"></i><span><strong>' + esc(f.title) + '</strong><small>' + esc(f.fileName || '오디오 파일') + '</small></span><i class="ph ph-play-circle" aria-hidden="true"></i></button><button type="button" class="icon-btn" data-arfile-remove aria-label="' + esc(f.title) + ' 원곡 파일 삭제"><i class="ph ph-trash" aria-hidden="true"></i></button></div><div data-arfile-player hidden></div>' +
          refLine(song) + '<p class="vz-arfile-note">원곡 가수의 멜로디를 자동으로 뽑아 내 녹음과 비교하는 데만 써요. 애드리브·화음·창법 차이와 추출 오류가 섞일 수 있어 정답 악보가 아니에요. 비교는 보컬 연구소의 구간 분석에서 해요.</p></div></div>'
        : '<p>원곡 음원 파일을 올리면 보컬 연구소에서 내 녹음과 원곡 멜로디를 음 단위로 비교할 수 있어요. 유튜브 같은 링크는 분석할 수 없어요.</p>') + '</div>';
    host.querySelector('[data-ar-file-add]')?.addEventListener('click', () => add(song, draw));
    if (!f) return;
    const row = host.querySelector('[data-arfile]'), slot = row.querySelector('[data-arfile-player]'), open = row.querySelector('[data-arfile-open]');
    if (keepPlayer) { slot.replaceWith(keepPlayer); open.setAttribute('aria-expanded', 'true'); }
    open.onclick = async () => {
      const p = row.querySelector('[data-arfile-player]');
      if (!p.hidden) { p.replaceChildren(); p.hidden = true; open.setAttribute('aria-expanded', 'false'); return; }
      p.hidden = false; open.setAttribute('aria-expanded', 'true'); p.textContent = '원곡을 불러오는 중…';
      try {
        const url = await window.VzipR2.url(f.r2Key);
        if (!p.isConnected || p.hidden || identity() !== account) return;
        const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = url; audio.setAttribute('aria-label', f.title + ' 원곡 재생'); p.replaceChildren(audio);
      } catch (error) { if (p.isConnected && !p.hidden) p.textContent = '재생하지 못했어요: ' + error.message; }
    };
    row.querySelector('[data-ar-extract]')?.addEventListener('click', () => {
      V.arReferenceEnsure(song, {force:true}).then(ref => V.toast(ref.state === 'ok' ? '원곡 멜로디를 뽑았어요.' : '원곡 멜로디 판정 보류: ' + AM.holdRefText(ref.reason)), e => V.toast(e.message || String(e), 'error'));
      draw();
    });
    row.querySelector('[data-arfile-remove]').onclick = async () => {
      if (!await V.confirm('원곡 파일 삭제', '이 곡의 원곡 파일과 뽑아 둔 원곡 멜로디를 삭제할까요? 저장한 비교 결과는 남아요.', {ok:'삭제', danger:true})) return;
      try {
        if (identity() !== account || window.VzipAccountScope?.leaving) throw Error('계정이 바뀌어 중단했어요.');
        await window.VzipR2.remove(f.r2Key);
        if (V.change(db => { const s = db.songs.find(x => x.id === id); if (s && s.arFile?.id === f.id) { delete s.arFile; delete s.arReference; } })) { V.toast('원곡 파일을 삭제했어요.'); draw(); }
      } catch (error) { V.toast(error.message, 'error'); }
    };
  };
  listeners.add(draw);
  draw();
};
V.arClock = clockOf;
})();
