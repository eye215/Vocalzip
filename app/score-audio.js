/* Score viewer audio bar: one compact row under the score page — the song's MR in the shared inline player
 * (M.player, same as the library), plus 녹음 and MR+녹음.
 * MR sources are the song's accompaniment entries (songs[].mrTracks, app/song-mr.js): private R2 files and
 * YouTube links. YouTube cannot be started/stopped by the app, so MR+녹음 uses uploaded MR files only.
 * A take is saved like any recording of the song (M.saveBlob → library + backup) only when 저장 is pressed;
 * a take left unsaved when the viewer closes is kept as a recording of the song instead of being thrown away. */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const esc = VZ.esc;
const tracksOf = songId => (VZ.song(songId)?.mrTracks || []).filter(t => !t.deleted && (t.kind === 'youtube' ? t.videoId || t.url : t.r2Key));
const youtubeId = t => t.videoId || (/[?&]v=([\w-]{11})/.exec(t.url || '') || [])[1] || '';
const audioSession = type => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch {} };
const pad = n => String(n).padStart(2, '0');
const mrItem = t => ({id:t.id, name:t.title || 'MR', type:t.type || 'audio/mp4', cloud:true, storageProvider:'r2', r2Key:t.r2Key});

/** Mounts the bar after `anchor` (the score stage). Returns {el, destroy}. */
function mount(anchor, {songId, scoreTitle = ''} = {}) {
  const M = VZ.media;
  const bar = document.createElement('section');
  bar.className = 'score-audio';
  bar.dataset.scoreAudio = '';
  bar.setAttribute('aria-label', 'MR 재생과 녹음');
  anchor.after(bar);
  const s = {mode:'idle', trackId:'', mr:null, mrFor:'', take:null, preview:null, capture:null, withMr:null, closed:false, busy:false};
  const tracks = () => tracksOf(songId);
  const track = () => tracks().find(t => t.id === s.trackId) || null;
  const pill = (name, icon, label, extra = '') => '<button type="button" class="score-audio-btn" data-score-audio-' + name + ' aria-label="' + label + '"' + extra + '><i class="ph ph-' + icon + '" aria-hidden="true"></i><span>' + label + '</span></button>';

  function dropMr() { s.mr?.destroy?.(); s.mr = null; s.mrFor = ''; }
  function dropPreview() { s.preview?.destroy?.(); s.preview = null; }

  function paint() {
    if (s.closed) return;
    const list = tracks();
    if (!list.some(t => t.id === s.trackId)) s.trackId = (list.find(t => t.kind !== 'youtube') || list[0])?.id || '';
    const t = track(), file = t && t.kind !== 'youtube', canRecord = !!M?.canRecord?.(), recording = s.mode === 'rec' || s.mode === 'mr-rec';
    bar.dataset.mode = s.mode;
    let row;
    if (recording) {
      row = '<span class="score-audio-live" role="timer" data-score-audio-time>● 0:00</span><span class="score-audio-label">' + (s.withMr ? esc(s.withMr.title) + ' + 녹음' : '녹음 중') + '</span>' +
        pill('stop', 'stop', '정지', s.busy ? ' disabled' : '');
    } else if (s.mode === 'review') {
      row = '<div class="score-audio-player" data-score-audio-preview></div>' + pill('save', 'check', '저장') + pill('discard', 'trash', '버리기');
    } else {
      const mrSlot = !t ? '<span class="score-audio-label">MR 없음 · 곡의 레퍼런스 탭에서 추가</span>'
        : t.kind === 'youtube' ? pill('youtube', 'youtube-logo', '유튜브 MR', ' aria-expanded="' + !!bar.querySelector('iframe') + '"')
        : '<div class="score-audio-player" data-score-audio-mr></div>';
      row = mrSlot + pill('rec', 'microphone', '녹음', canRecord && !s.busy ? '' : ' disabled') +
        pill('mrrec', 'microphone-stage', 'MR+녹음', canRecord && file && !s.busy ? '' : ' disabled');
    }
    const select = list.length > 1 && s.mode === 'idle'
      ? '<select class="score-audio-select" data-score-audio-track aria-label="MR 선택">' + list.map(x => '<option value="' + esc(x.id) + '"' + (x.id === s.trackId ? ' selected' : '') + '>' + esc(x.title || 'MR') + (x.kind === 'youtube' ? ' (유튜브)' : '') + '</option>').join('') + '</select>' : '';
    const keepYoutube = s.mode === 'idle' && t?.kind === 'youtube' ? bar.querySelector('[data-score-audio-frame]') : null;
    bar.innerHTML = select + '<div class="score-audio-row">' + row + '</div><p class="score-audio-hint" data-score-audio-hint role="status"></p>';
    if (keepYoutube?.firstChild) bar.append(keepYoutube);
    wire(t);
  }
  function wire(t) {
    const on = (name, fn) => { const b = bar.querySelector('[data-score-audio-' + name + ']'); if (b) b.onclick = () => Promise.resolve().then(fn).catch(fail); };
    bar.querySelector('[data-score-audio-track]')?.addEventListener('change', e => { s.trackId = e.target.value; dropMr(); bar.querySelector('[data-score-audio-frame]')?.remove(); paint(); });
    const mrHost = bar.querySelector('[data-score-audio-mr]');
    if (mrHost && t) {
      // Re-mounting the shared player keeps the MR element; it is only recreated when the track changes.
      if (s.mr && s.mrFor === t.id) mrHost.replaceWith(s.mr.root);
      else { dropMr(); s.mr = M.player(mrHost, mrItem(t), {}); s.mr.root = mrHost; s.mrFor = t.id; }
    }
    const preview = bar.querySelector('[data-score-audio-preview]');
    if (preview && s.take) { dropPreview(); s.preview = M.player(preview, {id:'score-take', name:'방금 녹음', type:s.take.res.type, blob:s.take.res.blob, durationSeconds:s.take.res.durationSeconds}, {}); }
    on('youtube', () => toggleYoutube(t));
    on('rec', () => startRecording(false));
    on('mrrec', () => startRecording(true));
    on('stop', stopRecording);
    on('save', save);
    on('discard', discard);
    if (s.mode === 'mr-rec') hint('이어폰을 끼면 MR이 녹음에 섞이지 않아요.');
    else if (s.mode === 'idle' && t?.kind === 'youtube') hint('유튜브 MR은 재생만 돼요. MR+녹음은 업로드한 MR 파일로 할 수 있어요.');
    else if (s.mode === 'idle' && !M?.canRecord?.()) hint('이 브라우저는 녹음을 지원하지 않아요.');
  }
  function hint(text, error = false) { const h = bar.querySelector('[data-score-audio-hint]'); if (h) { h.textContent = text; h.dataset.error = String(error); } }
  function fail(e) {
    if (s.closed) return;
    s.busy = false; s.capture?.cancel?.(); s.capture = null; s.mr?.pause?.(); audioSession('auto');
    if (s.mode !== 'review') s.mode = 'idle';
    paint(); hint(e?.message || '실행하지 못했어요.', true);
  }

  function toggleYoutube(t) {
    const open = bar.querySelector('[data-score-audio-frame]');
    if (open) { open.remove(); paint(); return; }
    const id = youtubeId(t);
    if (!id) throw Error('유튜브 링크를 확인해 주세요.');
    const box = document.createElement('div');
    box.className = 'score-audio-youtube'; box.dataset.scoreAudioFrame = '';
    box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?autoplay=1&playsinline=1" title="' + esc(t.title || 'MR') + '" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    bar.append(box); paint();
  }

  async function startRecording(withMr) {
    if (s.mode !== 'idle' || s.busy) return;
    const t = withMr ? track() : null;
    if (withMr && (!t || t.kind === 'youtube' || !s.mr)) throw Error('MR+녹음은 업로드한 MR 파일로만 할 수 있어요.');
    s.busy = true; s.mr?.pause?.(); paint(); hint(withMr ? 'MR과 마이크를 준비하는 중…' : '마이크를 준비하는 중…');
    // iOS Safari needs play-and-record before the microphone opens, or MR playback and capture fight over the route.
    audioSession('play-and-record');
    if (withMr) await s.mr.load();
    const capture = await M.capture({onTick:sec => { const el = bar.querySelector('[data-score-audio-time]'); if (el) el.textContent = '● ' + VZ.clock(sec); }});
    if (s.closed) { capture.cancel(); return; }
    s.capture = capture; s.withMr = t ? {id:t.id, title:t.title || 'MR'} : null; s.busy = false;
    s.mode = withMr ? 'mr-rec' : 'rec'; paint();
    capture.start();
    if (withMr) {
      const mr = s.mr, ended = () => { mr.el.removeEventListener('ended', ended); if (s.capture === capture) stopRecording().catch(fail); };
      // The take ends with the MR, so a full run needs no second tap.
      mr.el.addEventListener('ended', ended);
      mr.seek(0);
      await mr.play();
    }
  }
  async function stopRecording() {
    if (!s.capture) return;
    const capture = s.capture;
    s.capture = null; s.busy = true; s.mr?.pause?.(); paint();
    const res = await capture.stop();
    audioSession('auto');
    s.busy = false;
    const take = {res, withMr:s.withMr, id:VZ.uid()};
    if (s.closed) { await keep(take); return; }
    s.take = take; s.mode = 'review'; paint();
  }

  function itemFor(take) {
    const {res, withMr} = take, d = new Date();
    const name = (VZ.songTitle?.(songId) || scoreTitle || '악보') + (withMr ? ' MR 녹음 ' : ' 녹음 ') + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return {id:take.id, ...(window.VzipAccountScope && res.accountOwner ? {accountOwner:res.accountOwner} : {}),
      name, created:Date.now(), recordedDate:VZ.today(), dateSource:'recorded', type:res.type,
      source:'practice', recordingCategory:'song', songId, song:VZ.songLabel ? VZ.songLabel(VZ.song(songId)) : (VZ.songTitle?.(songId) || ''),
      blob:res.blob, durationSeconds:res.durationSeconds, waveform:res.waveform, origin:'score', ...(withMr ? {withMr} : {})};
  }
  /** Viewer closed with an unsaved take: keep it as a recording of the song rather than losing it. */
  async function keep(take) {
    try { await M.saveBlob(itemFor(take)); take.res.releaseProtection?.(); VZ.toast('저장하지 않은 악보 녹음을 이 곡의 녹음으로 보관했어요.'); }
    catch (e) { VZ.toast('악보 녹음을 보관하지 못했어요: ' + e.message, 'error'); }
  }
  async function save() {
    const take = s.take;
    if (!take || s.busy) return;
    s.busy = true; const button = bar.querySelector('[data-score-audio-save]'); if (button) button.disabled = true;
    try {
      await M.saveBlob(itemFor(take), p => hint('클라우드 저장 ' + p + '%'));
      take.res.releaseProtection?.(); dropPreview(); s.take = null; s.mode = 'idle'; s.busy = false;
      paint(); hint('저장했어요 · 이 곡의 녹음 탭과 보관함에서 볼 수 있어요.');
      VZ.toast('악보 녹음을 저장했어요.');
    } catch (e) { s.busy = false; if (button) button.disabled = false; hint('저장 실패: ' + e.message + ' · 녹음은 이 화면에 그대로 있어요.', true); }
  }
  async function discard() {
    if (!s.take || !await VZ.confirm('녹음 버리기', '이번 녹음을 저장하지 않고 버릴까요?', {ok:'버리기', danger:true})) return;
    s.take.res.releaseProtection?.(); dropPreview(); s.take = null; s.mode = 'idle'; paint();
  }

  const onData = () => { if (!s.closed && s.mode === 'idle' && !s.busy && !s.mr?.el && !bar.querySelector('iframe')) paint(); };
  window.addEventListener('vzip:data-changed', onData);
  paint();
  return {
    el:bar,
    async destroy() {
      if (s.closed) return;
      s.closed = true;
      window.removeEventListener('vzip:data-changed', onData);
      const capture = s.capture, take = s.take;
      s.capture = null; s.take = null; dropMr(); dropPreview();
      try {
        if (capture) await keep({res:await capture.stop(), withMr:s.withMr, id:VZ.uid()});
        else if (take) await keep(take);
      } finally { audioSession('auto'); bar.remove(); }
    }
  };
}
window.VzipScoreAudio = {mount, tracksOf};
})();
