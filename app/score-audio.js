/* Score viewer audio bar under the score page: 재생 (the song's MR), 녹음, 재생+녹음.
 * While something plays or records, the bar shrinks to a small floating chip (blinking dot, time, ⏸, ■) so the
 * score gets the room; ⏸ pauses the MR and the recording together and ■ stops both, and the full bar comes back.
 * MR sources are the song's accompaniment entries (songs[].mrTracks, app/song-mr.js): private R2 files, played
 * through the shared player (M.player), and YouTube links, which only open in place (the app cannot start or stop
 * them, so 재생+녹음 uses uploaded MR files). A take is saved like any recording of the song (M.saveBlob → library +
 * backup) only when 저장 is pressed; a take left unsaved when the viewer closes is kept instead of being thrown away. */
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
const LIVE = ['mr', 'rec', 'mrrec'];

/** Mounts the bar after `anchor` (the score stage). Returns {el, destroy}. */
function mount(anchor, {songId, scoreTitle = ''} = {}) {
  const M = VZ.media;
  const bar = document.createElement('section');
  bar.className = 'score-audio';
  bar.dataset.scoreAudio = '';
  bar.setAttribute('aria-label', 'MR 재생과 녹음');
  anchor.after(bar);
  // The shared player runs the MR off screen; the bar only shows buttons and time.
  const engine = document.createElement('div');
  engine.hidden = true;
  const s = {mode:'idle', was:'', trackId:'', mr:null, mrFor:'', take:null, preview:null, capture:null, withMr:null, timer:0, closed:false, busy:false};
  const tracks = () => tracksOf(songId);
  const track = () => tracks().find(t => t.id === s.trackId) || null;
  const pill = (name, icon, label, extra = '') => '<button type="button" class="score-audio-btn" data-score-audio-' + name + ' aria-label="' + label + '"' + extra + '><i class="ph ph-' + icon + '" aria-hidden="true"></i><span>' + label + '</span></button>';
  const icon = (name, glyph, label) => '<button type="button" class="score-audio-icon" data-score-audio-' + name + ' aria-label="' + label + '"><i class="ph-fill ph-' + glyph + '" aria-hidden="true"></i></button>';

  function mrPlayer(t) {
    if (s.mr && s.mrFor === t.id) return s.mr;
    s.mr?.destroy?.(); s.mr = M.player(engine, mrItem(t), {}); s.mrFor = t.id;
    return s.mr;
  }
  const seconds = () => s.capture ? s.capture.seconds?.() || 0 : s.mr?.el?.currentTime || 0;
  function tick() { const el = bar.querySelector('[data-score-audio-time]'); if (el) el.textContent = VZ.clock(seconds()); }

  function paint() {
    if (s.closed) return;
    const list = tracks();
    if (!list.some(t => t.id === s.trackId)) { s.trackId = (list.find(t => t.kind !== 'youtube') || list[0])?.id || ''; }
    const t = track(), file = t && t.kind !== 'youtube', canRecord = !!M?.canRecord?.(), live = LIVE.includes(s.mode);
    bar.dataset.mode = s.mode;
    bar.classList.toggle('is-live', live);
    clearInterval(s.timer);
    if (live) place(); else { bar.style.removeProperty('bottom'); }
    let html;
    if (live) {
      html = '<div class="score-audio-chip" role="group" aria-label="' + (s.mode === 'mr' ? 'MR 재생 중' : '녹음 중') + '">' +
        '<span class="score-audio-dot' + (s.mode === 'mr' ? ' is-play' : '') + '" aria-hidden="true"></span>' +
        '<span class="score-audio-time" role="timer" data-score-audio-time>' + VZ.clock(seconds()) + '</span>' +
        icon('pause', 'pause', '일시정지') + icon('stop', 'stop', '정지') + '</div>';
    } else if (s.mode === 'paused') {
      html = '<div class="score-audio-row"><span class="score-audio-label"><span class="score-audio-time" data-score-audio-time>' + VZ.clock(seconds()) + '</span> ' + (s.was === 'mr' ? 'MR 일시정지' : '녹음 일시정지') + '</span>' +
        pill('resume', 'play', '계속') + pill('stop', 'stop', '정지') + '</div>';
    } else if (s.mode === 'review') {
      html = '<div class="score-audio-row"><div class="score-audio-player" data-score-audio-preview></div>' + pill('save', 'check', '저장') + pill('discard', 'trash', '버리기') + '</div>';
    } else {
      const select = list.length > 1 ? '<select class="score-audio-select" data-score-audio-track aria-label="MR 선택">' + list.map(x => '<option value="' + esc(x.id) + '"' + (x.id === s.trackId ? ' selected' : '') + '>' + esc(x.title || 'MR') + (x.kind === 'youtube' ? ' (유튜브)' : '') + '</option>').join('') + '</select>' : '';
      html = select + '<div class="score-audio-row">' +
        pill('play', t?.kind === 'youtube' ? 'youtube-logo' : 'play', '재생', t && !s.busy ? '' : ' disabled') +
        pill('rec', 'microphone', '녹음', canRecord && !s.busy ? '' : ' disabled') +
        pill('mrrec', 'microphone-stage', '재생+녹음', canRecord && file && !s.busy ? '' : ' disabled') + '</div>';
    }
    const frame = s.mode === 'idle' ? bar.querySelector('[data-score-audio-frame]') : null;
    bar.innerHTML = html + '<p class="score-audio-hint" data-score-audio-hint role="status"></p>';
    if (frame) bar.append(frame);
    wire(t);
    if (live || s.mode === 'paused') s.timer = setInterval(tick, 250);
  }
  /** The live chip floats over the bottom-left of the score (above the page row) so the score takes the bar's room. */
  function place() {
    const editor = bar.parentElement, rect = editor?.getBoundingClientRect(), stage = anchor.getBoundingClientRect();
    if (!rect) return;
    bar.style.bottom = Math.max(8, rect.bottom - stage.bottom + 10) + 'px';
  }
  function wire(t) {
    const on = (name, fn) => { const b = bar.querySelector('[data-score-audio-' + name + ']'); if (b) b.onclick = () => Promise.resolve().then(fn).catch(fail); };
    bar.querySelector('[data-score-audio-track]')?.addEventListener('change', e => { s.trackId = e.target.value; s.mr?.destroy?.(); s.mr = null; s.mrFor = ''; bar.querySelector('[data-score-audio-frame]')?.remove(); paint(); });
    const preview = bar.querySelector('[data-score-audio-preview]');
    if (preview && s.take) { s.preview?.destroy?.(); s.preview = M.player(preview, {id:'score-take', name:'방금 녹음', type:s.take.res.type, blob:s.take.res.blob, durationSeconds:s.take.res.durationSeconds}, {}); }
    on('play', () => t?.kind === 'youtube' ? toggleYoutube(t) : playMr(t));
    on('rec', () => startRecording(false));
    on('mrrec', () => startRecording(true));
    on('pause', pause);
    on('resume', resume);
    on('stop', stop);
    on('save', save);
    on('discard', discard);
    if (s.mode === 'mrrec') hint('이어폰을 끼면 MR이 녹음에 섞이지 않아요.');
    else if (s.mode === 'idle' && t?.kind === 'youtube') hint('유튜브 MR은 재생만 돼요. 재생+녹음은 업로드한 MR 파일로 할 수 있어요.');
    else if (s.mode === 'idle' && !t) hint('MR은 곡의 레퍼런스 탭에서 추가할 수 있어요.');
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
    if (open) { open.remove(); return; }
    const id = youtubeId(t);
    if (!id) throw Error('유튜브 링크를 확인해 주세요.');
    const box = document.createElement('div');
    box.className = 'score-audio-youtube'; box.dataset.scoreAudioFrame = '';
    box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?autoplay=1&playsinline=1" title="' + esc(t.title || 'MR') + '" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    bar.append(box);
  }
  async function playMr(t) {
    if (!t || s.mode !== 'idle') return;
    audioSession('playback');
    const mr = mrPlayer(t);
    mr.el.addEventListener('ended', () => { if (s.mode === 'mr' || s.mode === 'paused' && s.was === 'mr') { s.mode = 'idle'; paint(); } }, {once:true});
    s.mode = 'mr'; paint();
    await mr.play();
  }

  async function startRecording(withMr) {
    if (s.mode !== 'idle' || s.busy) return;
    const t = withMr ? track() : null;
    if (withMr && (!t || t.kind === 'youtube')) throw Error('재생+녹음은 업로드한 MR 파일로만 할 수 있어요.');
    s.busy = true; paint(); hint(withMr ? 'MR과 마이크를 준비하는 중…' : '마이크를 준비하는 중…');
    // iOS Safari needs play-and-record before the microphone opens, or MR playback and capture fight over the route.
    audioSession('play-and-record');
    const mr = withMr ? mrPlayer(t) : null;
    if (mr) await mr.load();
    const capture = await M.capture({onTick:() => tick()});
    if (s.closed) { capture.cancel(); return; }
    s.capture = capture; s.withMr = t ? {id:t.id, title:t.title || 'MR'} : null; s.busy = false;
    s.mode = withMr ? 'mrrec' : 'rec'; paint();
    capture.start();
    if (mr) {
      // The take ends with the MR, so a full run needs no second tap.
      mr.el.addEventListener('ended', () => { if (s.capture === capture) stop().catch(fail); }, {once:true});
      mr.seek(0);
      await mr.play();
    }
  }
  /** ⏸ pauses everything that runs (MR and recording together) and brings the full bar back. */
  function pause() {
    if (!LIVE.includes(s.mode)) return;
    s.capture?.pause?.(); s.mr?.pause?.();
    s.was = s.mode; s.mode = 'paused'; paint();
  }
  async function resume() {
    if (s.mode !== 'paused') return;
    s.mode = s.was; paint();
    s.capture?.resume?.();
    if (s.was !== 'rec' && s.mr) await s.mr.play();
  }
  /** ■ stops everything together: an MR alone returns to the bar, a take goes to 저장 / 버리기. */
  async function stop() {
    const capture = s.capture;
    s.mr?.pause?.();
    if (!capture) { s.mode = 'idle'; paint(); return; }
    s.capture = null; s.busy = true; s.mode = 'idle'; paint();
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
      take.res.releaseProtection?.(); s.preview?.destroy?.(); s.preview = null; s.take = null; s.mode = 'idle'; s.busy = false;
      paint(); hint('저장했어요 · 이 곡의 녹음 탭과 전체 녹음에서 볼 수 있어요.');
      VZ.toast('악보 녹음을 저장했어요.');
    } catch (e) { s.busy = false; if (button) button.disabled = false; hint('저장 실패: ' + e.message + ' · 녹음은 이 화면에 그대로 있어요.', true); }
  }
  async function discard() {
    if (!s.take || !await VZ.confirm('녹음 버리기', '이번 녹음을 저장하지 않고 버릴까요?', {ok:'버리기', danger:true})) return;
    s.take.res.releaseProtection?.(); s.preview?.destroy?.(); s.preview = null; s.take = null; s.mode = 'idle'; paint();
  }

  const onData = () => { if (!s.closed && s.mode === 'idle' && !s.busy && !bar.querySelector('iframe')) paint(); };
  window.addEventListener('vzip:data-changed', onData);
  paint();
  return {
    el:bar,
    async destroy() {
      if (s.closed) return;
      s.closed = true;
      clearInterval(s.timer);
      window.removeEventListener('vzip:data-changed', onData);
      const capture = s.capture, take = s.take;
      s.capture = null; s.take = null; s.mr?.destroy?.(); s.mr = null; s.preview?.destroy?.();
      try {
        if (capture) await keep({res:await capture.stop(), withMr:s.withMr, id:VZ.uid()});
        else if (take) await keep(take);
      } finally { audioSession('auto'); bar.remove(); }
    }
  };
}
window.VzipScoreAudio = {mount, tracksOf};
})();
