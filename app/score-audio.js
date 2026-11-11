/* Score viewer audio bar: under the score page, play the song's MR, record, or record while the MR plays.
 * MR sources are the song's own accompaniment entries (songs[].mrTracks, app/song-mr.js): private R2 audio files
 * and YouTube links. A recording is saved like any other recording of the song (M.saveBlob → library + backup).
 * YouTube cannot be started/stopped by the app, so "MR + 녹음" uses uploaded MR files only.
 * Nothing is uploaded or saved without the person pressing save; a take left unsaved when the viewer closes is
 * kept as a recording of the song instead of being thrown away. */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const esc = VZ.esc;
const tracksOf = songId => (VZ.song(songId)?.mrTracks || []).filter(t => !t.deleted && (t.kind === 'youtube' ? t.videoId || t.url : t.r2Key));
const youtubeId = t => t.videoId || (/[?&]v=([\w-]{11})/.exec(t.url || '') || [])[1] || '';
const audioSession = type => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch {} };
const pad = n => String(n).padStart(2, '0');
const clock = s => VZ.clock ? VZ.clock(s) : Math.floor(s / 60) + ':' + pad(Math.floor(s % 60));

/** Mounts the bar after `anchor` (the score stage). Returns {el, destroy}. */
function mount(anchor, {songId, scoreTitle = ''} = {}) {
  const M = VZ.media;
  const bar = document.createElement('section');
  bar.className = 'score-audio';
  bar.dataset.scoreAudio = '';
  bar.setAttribute('aria-label', 'MR 재생과 녹음');
  anchor.after(bar);
  const s = {mode:'idle', trackId:'', audio:null, url:'', capture:null, take:null, player:null, timer:0, closed:false, busy:false};

  const track = () => tracksOf(songId).find(t => t.id === s.trackId) || null;
  const tracks = () => tracksOf(songId);
  const fileTrack = () => { const t = track(); return t && t.kind !== 'youtube' ? t : null; };

  function stopMr() {
    if (s.audio) { s.audio.onended = null; s.audio.pause(); s.audio.removeAttribute('src'); s.audio.load?.(); s.audio = null; }
    bar.querySelector('[data-score-audio-youtube]')?.replaceChildren();
  }
  async function mrAudio(t) {
    const url = await window.VzipR2.url(t.r2Key);
    if (s.closed) throw Error('닫힘');
    const audio = new Audio();
    audio.preload = 'auto'; audio.src = url; audio.setAttribute('aria-hidden', 'true');
    return audio;
  }

  function paint() {
    if (s.closed) return;
    const list = tracks();
    if (!list.some(t => t.id === s.trackId)) s.trackId = (list.find(t => t.kind !== 'youtube') || list[0])?.id || '';
    const t = track(), file = !!fileTrack(), canRecord = !!M?.canRecord?.();
    const playing = s.mode === 'mr', recording = s.mode === 'rec' || s.mode === 'mr-rec';
    const lock = recording || s.mode === 'review' || s.busy;
    const select = list.length > 1
      ? '<select data-score-audio-track aria-label="MR 선택"' + (lock || playing ? ' disabled' : '') + '>' + list.map(x => '<option value="' + esc(x.id) + '"' + (x.id === s.trackId ? ' selected' : '') + '>' + esc(x.title || 'MR') + (x.kind === 'youtube' ? ' (유튜브)' : '') + '</option>').join('') + '</select>'
      : '<span class="score-audio-track">' + (t ? esc(t.title || 'MR') + (t.kind === 'youtube' ? ' · 유튜브' : '') : 'MR 없음 · 곡의 레퍼런스 탭에서 추가') + '</span>';
    const btn = (name, icon, label, {on = false, disabled = false} = {}) => '<button type="button" class="score-audio-btn' + (on ? ' is-on' : '') + '" data-score-audio-' + name + (disabled ? ' disabled' : '') + ' aria-pressed="' + on + '"><i class="ph ph-' + icon + '" aria-hidden="true"></i><span>' + label + '</span></button>';
    let hint = '';
    if (s.mode === 'mr-rec') hint = '이어폰을 끼면 MR이 녹음에 섞이지 않아요.';
    else if (t && t.kind === 'youtube' && !recording) hint = '유튜브 MR은 재생만 돼요. MR+녹음은 업로드한 MR 파일로 할 수 있어요.';
    else if (!canRecord) hint = '이 브라우저는 녹음을 지원하지 않아요.';
    bar.innerHTML =
      '<div class="score-audio-row">' + select +
      (recording ? '<span class="score-audio-time" data-score-audio-time role="timer" aria-live="off">0:00</span>' : '') + '</div>' +
      '<div class="score-audio-actions">' +
      btn('mr', playing ? 'stop' : 'play', playing ? 'MR 정지' : 'MR 재생', {on:playing, disabled:!t || lock}) +
      btn('rec', s.mode === 'rec' ? 'stop' : 'microphone', s.mode === 'rec' ? '녹음 정지' : '녹음', {on:s.mode === 'rec', disabled:!canRecord || playing || s.mode === 'mr-rec' || s.mode === 'review' || s.busy}) +
      btn('mrrec', s.mode === 'mr-rec' ? 'stop' : 'microphone-stage', s.mode === 'mr-rec' ? '정지' : 'MR+녹음', {on:s.mode === 'mr-rec', disabled:!canRecord || !file || playing || s.mode === 'rec' || s.mode === 'review' || s.busy}) +
      '</div>' +
      '<p class="score-audio-hint" data-score-audio-hint role="status">' + esc(hint) + '</p>' +
      '<div class="score-audio-youtube" data-score-audio-youtube></div>' +
      '<div class="score-audio-review" data-score-audio-review hidden></div>';
    bar.querySelector('[data-score-audio-track]')?.addEventListener('change', e => { s.trackId = e.target.value; paint(); });
    bar.querySelector('[data-score-audio-mr]').onclick = () => toggleMr().catch(fail);
    bar.querySelector('[data-score-audio-rec]').onclick = () => (s.mode === 'rec' ? stopRecording() : startRecording(false)).catch(fail);
    bar.querySelector('[data-score-audio-mrrec]').onclick = () => (s.mode === 'mr-rec' ? stopRecording() : startRecording(true)).catch(fail);
    if (s.mode === 'review') review();
  }
  function say(text, error = false) { const h = bar.querySelector('[data-score-audio-hint]'); if (h) { h.textContent = text; h.dataset.error = String(error); } }
  function fail(e) {
    if (s.closed || e?.message === '닫힘') return;
    s.busy = false; stopMr(); s.capture?.cancel?.(); s.capture = null; clearInterval(s.timer); audioSession('auto');
    if (s.mode !== 'review') s.mode = 'idle';
    paint(); say(e?.message || '실행하지 못했어요.', true);
  }

  async function toggleMr() {
    const t = track();
    if (!t) return;
    if (s.mode === 'mr') { stopMr(); s.mode = 'idle'; paint(); return; }
    if (t.kind === 'youtube') {
      const id = youtubeId(t);
      if (!id) throw Error('유튜브 링크를 확인해 주세요.');
      s.mode = 'mr'; paint();
      bar.querySelector('[data-score-audio-youtube]').innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?autoplay=1&playsinline=1" title="' + esc(t.title || 'MR') + '" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      return;
    }
    s.busy = true; paint(); say('MR을 불러오는 중…');
    audioSession('playback');
    const audio = await mrAudio(t);
    s.busy = false; s.audio = audio; s.mode = 'mr';
    audio.onended = () => { if (s.audio === audio) { stopMr(); s.mode = 'idle'; paint(); } };
    paint();
    await audio.play();
  }

  async function startRecording(withMr) {
    if (s.mode !== 'idle' || s.busy) return;
    const t = withMr ? fileTrack() : null;
    if (withMr && !t) throw Error('MR+녹음은 업로드한 MR 파일로만 할 수 있어요.');
    s.busy = true; paint(); say(withMr ? 'MR과 마이크를 준비하는 중…' : '마이크를 준비하는 중…');
    // iOS Safari needs play-and-record before the microphone opens, or MR playback and capture fight over the route.
    audioSession('play-and-record');
    const audio = withMr ? await mrAudio(t) : null;
    const capture = await M.capture({onTick:sec => { const el = bar.querySelector('[data-score-audio-time]'); if (el) el.textContent = clock(sec); }});
    if (s.closed) { capture.cancel(); return; }
    s.capture = capture; s.withMr = t ? {id:t.id, title:t.title || 'MR'} : null; s.busy = false;
    s.mode = withMr ? 'mr-rec' : 'rec'; paint();
    if (audio) {
      s.audio = audio;
      // The take ends with the MR, so a full run needs no second tap.
      audio.onended = () => { if (s.audio === audio && s.mode === 'mr-rec') stopRecording().catch(fail); };
      capture.start();
      await audio.play();
    } else capture.start();
  }

  async function stopRecording() {
    if (!s.capture) return;
    const capture = s.capture;
    s.capture = null; s.busy = true; stopMr(); paint(); say('녹음을 정리하는 중…');
    const res = await capture.stop();
    audioSession('auto');
    s.busy = false;
    if (s.closed) { await keep(res); return; }
    s.take = {res, withMr:s.withMr, id:VZ.uid()};
    s.mode = 'review'; paint();
  }

  const defaultName = () => {
    const d = new Date(), song = VZ.songTitle?.(songId) || scoreTitle || '악보';
    return song + ' ' + (s.take?.withMr ? 'MR 녹음 ' : '녹음 ') + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  function itemFor(take, name) {
    const {res, withMr} = take;
    return {id:take.id, ...(window.VzipAccountScope && res.accountOwner ? {accountOwner:res.accountOwner} : {}),
      name:name || defaultName(), created:Date.now(), recordedDate:VZ.today(), dateSource:'recorded', type:res.type,
      source:'practice', recordingCategory:'song', songId, song:VZ.songLabel ? VZ.songLabel(VZ.song(songId)) : (VZ.songTitle?.(songId) || ''),
      blob:res.blob, durationSeconds:res.durationSeconds, waveform:res.waveform, origin:'score', ...(withMr ? {withMr} : {})};
  }
  /** Viewer closed with an unsaved take: keep it as a recording of the song rather than losing it. */
  async function keep(res, take = {res, withMr:s.withMr, id:VZ.uid()}) {
    try { await M.saveBlob(itemFor(take, '')); res.releaseProtection?.(); VZ.toast('저장하지 않은 악보 녹음을 이 곡의 녹음으로 보관했어요.'); }
    catch (e) { VZ.toast('악보 녹음을 보관하지 못했어요: ' + e.message, 'error'); }
  }

  function review() {
    const box = bar.querySelector('[data-score-audio-review]'), take = s.take;
    if (!box || !take) return;
    box.hidden = false;
    box.innerHTML = '<div data-score-audio-preview></div>' +
      '<label class="score-audio-name"><span>제목</span><input type="text" data-score-audio-name maxlength="150" value="' + esc(take.name || defaultName()) + '"></label>' +
      '<div class="score-audio-review-actions"><button type="button" class="btn ghost" data-score-audio-discard>버리기</button><button type="button" class="btn" data-score-audio-save>저장</button></div>';
    s.player?.destroy?.();
    s.player = M.player ? M.player(box.querySelector('[data-score-audio-preview]'), {id:'score-preview', name:'미리 듣기', type:take.res.type, blob:take.res.blob, durationSeconds:take.res.durationSeconds}, {}) : null;
    box.querySelector('[data-score-audio-name]').oninput = e => { take.name = e.target.value; };
    box.querySelector('[data-score-audio-discard]').onclick = async () => {
      if (!await VZ.confirm('녹음 버리기', '이번 녹음을 저장하지 않고 버릴까요?', {ok:'버리기', danger:true})) return;
      take.res.releaseProtection?.(); s.player?.destroy?.(); s.player = null; s.take = null; s.mode = 'idle'; paint();
    };
    box.querySelector('[data-score-audio-save]').onclick = async e => {
      const button = e.currentTarget; button.disabled = true; button.textContent = '저장 중…';
      try {
        await M.saveBlob(itemFor(take, (take.name || '').trim()), p => { button.textContent = '클라우드 저장 ' + p + '%'; });
        take.res.releaseProtection?.(); s.player?.destroy?.(); s.player = null; s.take = null; s.mode = 'idle';
        paint(); say('저장했어요 · 이 곡의 녹음 탭과 보관함에서 볼 수 있어요.');
        VZ.toast('악보 녹음을 저장했어요.');
      } catch (error) { button.disabled = false; button.textContent = '다시 저장'; say('저장 실패: ' + error.message + ' · 녹음은 이 화면에 그대로 있어요.', true); }
    };
  }

  const onData = () => { if (!s.closed && s.mode === 'idle' && !s.busy) paint(); };
  window.addEventListener('vzip:data-changed', onData);
  paint();
  return {
    el:bar,
    async destroy() {
      if (s.closed) return;
      s.closed = true;
      window.removeEventListener('vzip:data-changed', onData);
      stopMr(); clearInterval(s.timer);
      const capture = s.capture, take = s.take;
      s.capture = null; s.take = null; s.player?.destroy?.();
      try {
        if (capture) await keep(await capture.stop());
        else if (take) await keep(take.res, take);
      } finally { audioSession('auto'); bar.remove(); }
    }
  };
}
window.VzipScoreAudio = {mount, tracksOf};
})();
