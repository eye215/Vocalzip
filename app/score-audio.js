/* Score viewer audio bar under the score page: 재생 (the song's MR), 녹음, 재생+녹음.
 * While something plays or records, the bar shrinks to a small floating chip (blinking dot, time, ⏸, ■) so the
 * score gets the room; ⏸ pauses the MR and the recording together and ■ stops both, and the full bar comes back.
 * MR sources are the song's accompaniment entries (songs[].mrTracks, app/song-mr.js): private R2 files, played
 * through the shared player (M.player), and YouTube links, which only open in place (the app cannot start or stop
 * them, so 재생+녹음 uses uploaded MR files). A take is saved like any recording of the song (M.saveBlob → library +
 * backup) only when 저장 is pressed; a take left unsaved when the viewer closes is kept instead of being thrown away.
 * 마디 반복 (app/score-sync.js): a file MR can also loop over a range of seconds (playback only, never while a take
 * runs). The loop bar floats like the chip: "12–14마디 반복 중 · 멈춤", 속도 1×/0.75×, 앞 마디 포함, 다음 등장.
 * 표기의 기능 (app/score-sync.js → setPlan, rules in app/score-mark-model.js): when the score has 시작점 or 컷 marks
 * and a file MR, one more button in the row (재생 옵션) opens a menu with where 재생 and 재생+녹음 start (처음부터 /
 * 시작점 N마디에서) and 컷 건너뛰기 — the bar stays one row. While the MR runs, a cut stretch is jumped over (looked
 * at every 40 ms).
 * 재생+녹음 with cuts: the take is the microphone in real time, so it holds exactly what was played and sung — the
 * jump is in the MR, not in the take. Where the MR started and what it jumped over is noted on the saved take
 * (withMr.from, withMr.skipped: MR seconds), so the take can still be laid against the MR later. */
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
/** Modes in which the MR runs, so its time says where the music is (재생 위치 따라가기). */
const RUNS = ['mr', 'mrrec', 'loop'];
const SLOW = .75, LEAD = 2;
/** Largest MR fetched whole ahead of the tap (ordinary MR files are 3–15 MB). */
const AHEAD_MAX = 30 * 1024 * 1024;
/** Seeks once the file knows its length (iPhone Safari drops a time set before that). */
const seekTo = (mr, time) => { const el = mr.el, go = () => { try { el.currentTime = Math.max(0, time); } catch {} }; if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, {once:true}); };

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
  const s = {mode:'idle', was:'', trackId:'', mr:null, mrFor:'', take:null, preview:null, capture:null, withMr:null, timer:0, closed:false, busy:false,
    loop:null, slow:false, lead:true, watch:0,
    // 표기의 기능: what the sync offers (plan), the second this playback was started at on purpose (from), the cut
    // stretches in force (run), and for a take with the MR where the MR began and what it jumped over.
    plan:null, planKey:'', from:null, run:[], began:0, skipped:[]};
  const ticks = new Set(), changes = new Set();
  const tracks = () => tracksOf(songId);
  const track = () => tracks().find(t => t.id === s.trackId) || null;
  const pill = (name, icon, label, extra = '') => '<button type="button" class="score-audio-btn" data-score-audio-' + name + ' aria-label="' + label + '"' + extra + '><i class="ph ph-' + icon + '" aria-hidden="true"></i><span>' + label + '</span></button>';
  const icon = (name, glyph, label) => '<button type="button" class="score-audio-icon" data-score-audio-' + name + ' aria-label="' + label + '"><i class="ph-fill ph-' + glyph + '" aria-hidden="true"></i></button>';

  function mrPlayer(t) {
    if (s.mr && s.mrFor === t.id) return s.mr;
    s.mr?.destroy?.(); s.mr = M.player(engine, mrItem(t), {}); s.mrFor = t.id;
    return s.mr;
  }
  /** iPhone Safari starts sound only inside the tap, and a file whose address is still being fetched misses it.
   * So the chosen file MR is made ready as soon as the bar shows it (address only; the audio loads on play). */
  function warm() {
    const t = track();
    if (s.closed || s.mode !== 'idle' || !t || t.kind === 'youtube') return;
    try { const mr = mrPlayer(t); mr.load?.()?.then?.(() => ahead(mr, t), () => {}); } catch {}
  }
  /** iPhone Safari loads no audio before the tap, so a streamed MR starts seconds late. A file of ordinary size is
   * therefore fetched whole while the score is open and played from memory: it starts at once and seeks at once
   * (마디 반복). A larger file, or one already playing, keeps streaming. Nothing is stored on the device. */
  function ahead(mr, t) {
    if (mr.ahead || !(Number(t.size) > 0 && Number(t.size) <= AHEAD_MAX) || typeof fetch !== 'function' || !mr.el.src || /^(blob|data):/.test(mr.el.src)) return;
    const ctl = new AbortController(), a = mr.ahead = {url:''}, destroy = mr.destroy;
    mr.destroy = () => { ctl.abort(); destroy.call(mr); if (a.url) URL.revokeObjectURL(a.url); };
    fetch(mr.el.src, {signal:ctl.signal}).then(r => r.ok ? r.blob() : Promise.reject(Error('fetch'))).then(blob => {
      // In use by now (playing, paused part-way, a take running): leave the stream alone.
      if (s.closed || s.mr !== mr || s.mode !== 'idle' || !mr.el.paused || mr.el.currentTime > 0) return;
      a.url = URL.createObjectURL(blob.type ? blob : new Blob([blob], {type:t.type || 'audio/mp4'}));
      mr.el.src = a.url;
    }).catch(() => {});
  }
  /** Lets this file start later without a tap (재생+녹음 starts the MR after the microphone opened): a muted
   * play inside the tap is what iPhone Safari accepts as the user's go-ahead for this audio element. */
  function unlock(mr) {
    const el = mr.el;
    if (!el.src || !el.paused) return Promise.resolve();
    el.muted = true;
    let p; try { p = el.play(); } catch { p = null; }
    const done = () => { try { el.pause(); el.currentTime = 0; } catch {} el.muted = false; };
    return p?.then ? p.then(done, done) : (done(), Promise.resolve());
  }
  /** The MR did not start although play was asked (blocked by the browser, or the file cannot be played). */
  const silent = mr => !mr || mr.el.paused || !!mr.el.error;
  const seconds = () => s.capture ? s.capture.seconds?.() || 0 : s.mr?.el?.currentTime || 0;
  /** The sync's plan, when it is for the MR file the bar plays. */
  const planNow = () => { const t = track(); return s.plan && t && t.kind !== 'youtube' && s.plan.trackId === t.id ? s.plan : null; };
  /** Where the bar's own 재생 / 재생+녹음 starts: the 시작점 chosen, the beginning when 처음부터 is, or null (as before). */
  const startNow = () => { const p = planNow(); return p && !p.need && p.start ? {time:p.start.time ?? 0, marked:p.start.time != null} : null; };
  /** Sets the cut stretches in force for what runs now (app/score-mark-model.js: what was started on purpose is played). */
  function arm() {
    const p = planNow(), K = window.VzipScoreMarks;
    s.run = K && p && !p.need && p.cuts?.on && RUNS.includes(s.mode) ? K.skipsFor(p.cuts.skips, {from:s.from, loop:s.mode === 'loop' && s.loop ? {start:s.loop.start, end:s.loop.end} : null}) : [];
  }
  const cutNote = list => list.length ? '컷 ' + (window.VzipScoreMarks?.text(list.map(k => k.label)) || '') + ' 건너뜀' : '';
  /** The MR was asked to play but no sound has come yet (the file is still arriving): say so instead of 0:00. */
  const arriving = () => (s.mode === 'mr' || s.mode === 'loop') && !!s.mr && !s.mr.el.paused && s.mr.el.currentTime === 0 && s.mr.el.readyState < 3;
  const timeText = () => arriving() ? '불러오는 중…' : VZ.clock(seconds());
  function tick() { const el = bar.querySelector('[data-score-audio-time]'); if (el) el.textContent = timeText(); }

  function paint() {
    if (s.closed) return;
    const list = tracks();
    if (!list.some(t => t.id === s.trackId)) { s.trackId = (list.find(t => t.kind !== 'youtube') || list[0])?.id || ''; }
    const t = track(), file = t && t.kind !== 'youtube', canRecord = !!M?.canRecord?.(), live = LIVE.includes(s.mode) || s.mode === 'loop';
    if (!RUNS.includes(s.mode) && s.mode !== 'paused') { s.run = []; s.from = null; }
    bar.dataset.mode = s.mode;
    bar.classList.toggle('is-live', live);
    clearInterval(s.timer);
    if (live) place(); else { bar.style.removeProperty('bottom'); }
    let html, opts = '';
    if (s.mode === 'loop') {
      const L = s.loop;
      // Cut stretches a round of this loop meets are jumped over (a loop inside a cut plays it): named for the sync, which says so.
      html = '<div class="score-audio-loop" role="group" aria-label="마디 반복 재생" data-score-audio-loop-cuts="' + esc(inLoop().map(k => k.label).join(', ')) + '"><div class="score-audio-loop-head"><span class="score-audio-dot is-play" aria-hidden="true"></span>' +
        '<strong class="score-audio-loop-label" data-score-audio-loop-label>' + esc(L.label) + ' 반복 중</strong><span class="score-audio-time" role="timer" data-score-audio-time>' + VZ.clock(seconds()) + '</span>' +
        '<button type="button" class="score-audio-loop-stop" data-score-audio-stop aria-label="반복 멈춤"><i class="ph-fill ph-stop" aria-hidden="true"></i><span>멈춤</span></button></div>' +
        '<div class="score-audio-loop-tools"><button type="button" data-score-audio-loop-rate aria-pressed="' + s.slow + '" aria-label="느리게 듣기 0.75배">속도 ' + (s.slow ? SLOW + '×' : '1×') + '</button>' +
        '<button type="button" data-score-audio-loop-lead aria-pressed="' + s.lead + '">앞 마디 포함</button>' +
        (L.next ? '<button type="button" data-score-audio-loop-next aria-label="이 마디가 다음에 나오는 곳">다음 등장 <small>' + (L.occurrence + 1) + '/' + L.occurrences + '</small></button>' : '') + '</div></div>';
    } else if (live) {
      html = '<div class="score-audio-chip" role="group" aria-label="' + (s.mode === 'mr' ? 'MR 재생 중' : '녹음 중') + '">' +
        '<span class="score-audio-dot' + (s.mode === 'mr' ? ' is-play' : '') + '" aria-hidden="true"></span>' +
        '<span class="score-audio-time" role="timer" data-score-audio-time>' + timeText() + '</span>' +
        icon('pause', 'pause', '일시정지') + icon('stop', 'stop', '정지') + '</div>';
    } else if (s.mode === 'paused') {
      html = '<div class="score-audio-row"><span class="score-audio-label"><span class="score-audio-time" data-score-audio-time>' + VZ.clock(seconds()) + '</span> ' + (s.was === 'mr' ? 'MR 일시정지' : '녹음 일시정지') + '</span>' +
        pill('resume', 'play', '계속') + pill('stop', 'stop', '정지') + '</div>';
    } else if (s.mode === 'review') {
      html = '<div class="score-audio-row"><div class="score-audio-player" data-score-audio-preview></div>' + pill('save', 'check', '저장') + pill('discard', 'trash', '버리기') + '</div>';
    } else {
      const select = list.length > 1 ? '<select class="score-audio-select" data-score-audio-track aria-label="MR 선택">' + list.map(x => '<option value="' + esc(x.id) + '"' + (x.id === s.trackId ? ' selected' : '') + '>' + esc(x.title || 'MR') + (x.kind === 'youtube' ? ' (유튜브)' : '') + '</option>').join('') + '</select>' : '';
      // 표기의 기능: one button that opens 재생 옵션 (where playback starts, 컷 건너뛰기) — only for a score with such
      // marks and a file MR. It shows the 시작점 chosen and is lit while a 시작점 or 컷 건너뛰기 is in force.
      const p = planNow(), lit = !!p && !p.need && (p.start?.time != null || !!p.cuts?.on && p.cuts.skips?.length > 0);
      const says = p ? [p.need ? '' : p.start?.label, p.cuts && !p.need ? '컷 건너뛰기 ' + (p.cuts.on ? '켜짐' : '꺼짐') : ''].filter(Boolean).join(', ') : '';
      opts = p && (p.start || p.cuts) ? '<button type="button" class="score-audio-btn score-audio-opts" data-score-audio-opts aria-haspopup="dialog" aria-label="재생 옵션' + (says ? ': ' + esc(says) : '') + '" title="재생 옵션"' + (p.need ? ' data-need' : '') + ' data-lit="' + lit + '">' +
        '<i class="ph ph-sliders-horizontal" aria-hidden="true"></i>' + (!p.need && p.start?.short ? '<span>' + esc(p.start.short) + '</span>' : '') + '</button>' : '';
      html = select + '<div class="score-audio-row' + (opts ? ' has-opts' : '') + '">' +
        pill('play', t?.kind === 'youtube' ? 'youtube-logo' : 'play', '재생', t && !s.busy ? '' : ' disabled') +
        pill('rec', 'microphone', '녹음', canRecord && !s.busy ? '' : ' disabled') +
        pill('mrrec', 'microphone-stage', '재생+녹음', canRecord && file && !s.busy ? '' : ' disabled') + opts + '</div>';
    }
    const frame = s.mode === 'idle' ? bar.querySelector('[data-score-audio-frame]') : null;
    bar.innerHTML = html + '<p class="score-audio-hint" data-score-audio-hint role="status"></p>';
    if (frame) bar.append(frame);
    wire(t);
    if (s.mode === 'idle' && s.warmed !== s.trackId) { s.warmed = s.trackId; warm(); }
    if (live || s.mode === 'paused') s.timer = setInterval(tick, 250);
    watch();
    for (const fn of changes) try { fn(s.mode); } catch {}
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
    on('loop-rate', () => { s.slow = !s.slow; if (s.mr?.el) s.mr.el.playbackRate = s.slow ? SLOW : 1; paint(); });
    on('loop-lead', () => { s.lead = !s.lead; paint(); });
    on('loop-next', () => s.loop?.next?.());
    // Before a sync exists the button only says what matching gives.
    on('opts', () => { const p = planNow(), b = bar.querySelector('[data-score-audio-opts]'); if (p?.need) p.explain?.(b); else p?.open?.(b); });
    if (s.mode === 'mrrec' || s.mode === 'mr') liveHint();
    else if (s.mode === 'idle' && t?.kind === 'youtube') hint('유튜브 MR은 재생만 돼요. 재생+녹음은 업로드한 MR 파일로 할 수 있어요.');
    else if (s.mode === 'idle' && !t) hint('MR은 곡의 레퍼런스 탭에서 추가할 수 있어요.');
    else if (s.mode === 'idle' && !M?.canRecord?.()) hint('이 브라우저는 녹음을 지원하지 않아요.');
  }
  /** While the MR runs: what a take needs to know, and which cut stretches are being jumped over. */
  function liveHint() {
    if (s.mode === 'mrrec') hint('이어폰을 끼면 MR이 녹음에 섞이지 않아요.' + (s.run.length ? ' ' + cutNote(s.run) + '.' : ''));
    else if (s.mode === 'mr') hint(cutNote(s.run));
  }
  function hint(text, error = false) { const h = bar.querySelector('[data-score-audio-hint]'); if (h) { h.textContent = text; h.dataset.error = String(error); } }
  function fail(e) {
    if (s.closed) return;
    s.busy = false; s.capture?.cancel?.(); s.capture = null; s.mr?.pause?.(); endLoop(); audioSession('auto');
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
  /** from: the second it was sent to on purpose (여기서 재생); left out for the bar's own 재생, which starts at the
   * 시작점 chosen (or at the beginning when the score has 시작점 marks and 처음부터 is chosen). */
  async function playMr(t, from) {
    if (!t || s.mode !== 'idle') return;
    audioSession('playback');
    const mr = mrPlayer(t), start = from === undefined ? startNow() : null;
    if (start) seekTo(mr, start.time);
    mr.el.addEventListener('ended', () => { if (s.mode === 'mr' || s.mode === 'paused' && s.was === 'mr') { s.mode = 'idle'; paint(); } }, {once:true});
    s.mode = 'mr'; s.from = from !== undefined ? from : start?.marked ? start.time : null; arm(); paint();
    await mr.play();
    if (s.closed || s.mode !== 'mr') return;
    if (silent(mr)) { s.mode = 'idle'; paint(); hint(mr.el.error ? '이 MR 파일을 재생할 수 없어요. 파일 형식을 확인해 주세요.' : 'MR 소리가 시작되지 않았어요. 재생을 한 번 더 눌러 주세요.', true); }
  }

  async function startRecording(withMr) {
    if (s.mode !== 'idle' || s.busy) return;
    const t = withMr ? track() : null;
    if (withMr && (!t || t.kind === 'youtube')) throw Error('재생+녹음은 업로드한 MR 파일로만 할 수 있어요.');
    s.busy = true; paint(); hint(withMr ? 'MR과 마이크를 준비하는 중…' : '마이크를 준비하는 중…');
    // iOS Safari needs play-and-record before the microphone opens, or MR playback and capture fight over the route.
    audioSession('play-and-record');
    const mr = withMr ? mrPlayer(t) : null;
    const go = mr ? unlock(mr) : null;   // inside the tap, before anything is awaited
    if (mr) { await go; await mr.load(); }
    const capture = await M.capture({onTick:() => tick()});
    if (s.closed) { capture.cancel(); return; }
    const start = mr ? startNow() : null;
    s.capture = capture; s.withMr = t ? {id:t.id, title:t.title || 'MR'} : null; s.busy = false;
    s.began = start?.time || 0; s.skipped = [];
    s.mode = withMr ? 'mrrec' : 'rec'; s.from = start?.marked ? start.time : null; arm(); paint();
    capture.start();
    if (mr) {
      // The take ends with the MR, so a full run needs no second tap.
      mr.el.addEventListener('ended', () => { if (s.capture === capture) stop().catch(fail); }, {once:true});
      if (s.began > 0) seekTo(mr, s.began); else mr.seek(0);
      await mr.play();
      if (s.capture === capture && silent(mr)) {
        // Recording on without the MR would look like it worked: stop, throw the empty take away and say why.
        capture.cancel(); s.capture = null; s.withMr = null; s.mode = 'idle'; audioSession('auto'); paint();
        hint(mr.el.error ? '이 MR 파일을 재생할 수 없어 녹음을 시작하지 않았어요.' : 'MR 소리가 시작되지 않아 녹음을 멈췄어요. 재생+녹음을 한 번 더 눌러 주세요.', true);
      }
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
    s.mode = s.was; arm(); paint();
    s.capture?.resume?.();
    if (s.was !== 'rec' && s.mr) await s.mr.play();
  }
  /** What is kept about the MR of a take: which one, and — only when it did not simply run from its beginning — the
   * MR second it began at and the stretches it jumped over ([from, to] in MR seconds). */
  const takeMr = () => s.withMr ? {...s.withMr, ...(s.began > 0 ? {from:Math.round(s.began * 100) / 100} : {}), ...(s.skipped.length ? {skipped:s.skipped.slice()} : {})} : null;
  /** ■ stops everything together: an MR alone returns to the bar, a take goes to 저장 / 버리기. */
  async function stop() {
    const capture = s.capture;
    s.mr?.pause?.(); endLoop();
    if (!capture) { s.mode = 'idle'; paint(); return; }
    s.capture = null; s.busy = true; s.mode = 'idle'; paint();
    const withMr = takeMr(), res = await capture.stop();
    audioSession('auto');
    s.busy = false;
    const take = {res, withMr, id:VZ.uid()};
    if (s.closed) { await keep(take); return; }
    s.take = take; s.mode = 'review'; paint();
  }

  // ---- 마디 반복 · 여기서 재생 (app/score-sync.js): playback of a file MR only ----
  /** A take is being made or waits for 저장 / 버리기: nothing else may start. */
  const taking = () => !!(s.capture || s.busy || s.take) || ['rec', 'mrrec', 'review'].includes(s.mode) || s.mode === 'paused' && s.was !== 'mr';
  function endLoop() { if (!s.loop) return; s.loop = null; try { if (s.mr?.el) s.mr.el.playbackRate = 1; } catch {} }
  const loopFrom = () => s.lead ? Math.max(0, s.loop.start - (s.loop.lead > 0 ? s.loop.lead : LEAD)) : s.loop.start;
  /** The cut stretches in force that a round of the loop meets. */
  const inLoop = () => s.mode === 'loop' && s.loop ? s.run.filter(k => k.end > loopFrom() + .01 && k.start < s.loop.end - .01) : [];
  /** Runs while the MR does: wraps a loop at its end, jumps over a cut stretch and tells the listeners the time
   * (40 ms: a measure is far longer). */
  function step() {
    const el = s.mr?.el;
    if (!el || s.closed) return;
    if (s.mode === 'loop' && s.loop && (el.ended || el.currentTime >= s.loop.end - .01)) { try { el.currentTime = loopFrom(); } catch {} if (el.paused) el.play().catch(() => {}); }
    if (s.run.length && RUNS.includes(s.mode) && !el.ended) {
      const at = el.currentTime, to = window.VzipScoreMarks?.jump(s.run, at, s.mode === 'loop' && s.loop ? {from:loopFrom(), end:s.loop.end} : null);
      if (to != null) {
        try { el.currentTime = to; } catch {}
        if (s.capture && s.mode === 'mrrec') s.skipped.push([Math.round(at * 100) / 100, Math.round(to * 100) / 100]);
      }
    }
    if (RUNS.includes(s.mode)) for (const fn of ticks) try { fn(el.currentTime, s.mode); } catch {}
  }
  function watch() {
    const on = !s.closed && (s.mode === 'loop' || RUNS.includes(s.mode) && (ticks.size > 0 || s.run.length > 0));
    if (!on) { clearInterval(s.watch); s.watch = 0; } else s.watch ||= setInterval(step, 40);
  }
  /** The file MR to play: `id` when given (it becomes the bar's choice), else the bar's choice. */
  function fileFor(id) {
    if (id && id !== s.trackId && tracks().some(x => x.id === id)) { s.trackId = id; s.mr?.destroy?.(); s.mr = null; s.mrFor = ''; bar.querySelector('[data-score-audio-frame]')?.remove(); }
    const t = track();
    if (!t || t.kind === 'youtube') throw Error('업로드한 MR 파일로만 할 수 있어요.');
    if (taking()) throw Error('녹음을 끝낸 뒤에 들을 수 있어요.');
    return t;
  }
  /** Stops MR playback (not a take). False while a take is being made, so the caller leaves it alone. */
  function quiet() {
    if (taking()) return false;
    if (s.mode !== 'idle') { s.mr?.pause?.(); endLoop(); s.mode = 'idle'; paint(); }
    return true;
  }
  /** 여기서 재생: the MR from `time` on, as 재생 does. */
  async function playFrom(time, id) {
    const t = fileFor(id);
    if (s.mode !== 'idle') { s.mr?.pause?.(); endLoop(); s.mode = 'idle'; }
    seekTo(mrPlayer(t), time);
    await playMr(t, time);
  }
  /** 이 마디 반복: plays start → end again and again until 멈춤. spec: {label, start, end, lead (seconds of the measure
   * before, or null), occurrence, occurrences, next (starts the next occurrence, or null)}. */
  async function loop(spec, id) {
    if (!(spec?.end > spec?.start)) throw Error('이 마디의 위치를 알 수 없어요.');
    const t = fileFor(id);
    if (s.mode !== 'idle') { s.mr?.pause?.(); endLoop(); }
    audioSession('playback');
    const mr = mrPlayer(t);
    s.loop = {...spec}; s.mode = 'loop'; s.from = null; arm(); paint();
    mr.el.playbackRate = s.slow ? SLOW : 1;
    seekTo(mr, loopFrom());
    await mr.play();
    if (s.closed || s.mode !== 'loop' || s.mr !== mr) return;
    // The browser did not start the MR: back to the bar with the reason, instead of a loop bar that plays nothing.
    if (silent(mr)) { endLoop(); s.mode = 'idle'; paint(); hint(mr.el.error ? '이 MR 파일을 재생할 수 없어요. 파일 형식을 확인해 주세요.' : 'MR 소리가 시작되지 않았어요. 한 번 더 눌러 주세요.', true); }
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
    // For app/score-sync.js. onTick(fn(time, mode)) runs while the MR plays; onChange(fn(mode)) after every repaint.
    track, mode:() => s.mode, quiet, playFrom, loop,
    /** The cut stretches the loop now running jumps over on every round (their names), for the sync to say. */
    loopCuts:() => inLoop().map(k => k.label),
    /** 표기의 기능: what the bar offers for this score's 시작점 and 컷 marks, or null for nothing. plan: {trackId (the
     * file MR it is for), need (not matched yet: the button only explains → explain(anchor)), start: {label, short,
     * time (MR second, null = 처음부터)} | null, cuts: {on, note, skips:[{start, end, label}]} | null, open(anchor)
     * (the 재생 옵션 menu)}. */
    setPlan(plan) {
      if (s.closed) return;
      const key = plan ? JSON.stringify([plan.trackId, !!plan.need, plan.start, plan.cuts]) : '';
      s.plan = plan || null;
      if (key === s.planKey) return;
      s.planKey = key; arm();
      if (s.mode === 'idle' && !s.busy && !bar.querySelector('iframe')) paint(); else if (s.mode === 'loop') paint(); else { watch(); liveHint(); }
    },
    duration:() => { const d = s.mr?.el?.duration; return Number.isFinite(d) && d > 0 ? d : null; },
    /** Gets the file MR ready, so a later tap can start it at once (iPhone Safari plays only inside the tap). */
    prepare(id) { try { if (id && id !== s.trackId || s.mode !== 'idle') return; mrPlayer(fileFor()).load?.()?.catch?.(() => {}); } catch {} },
    onTick(fn) { ticks.add(fn); watch(); return () => { ticks.delete(fn); watch(); }; },
    onChange(fn) { changes.add(fn); return () => changes.delete(fn); },
    async destroy() {
      if (s.closed) return;
      s.closed = true;
      clearInterval(s.timer); clearInterval(s.watch); ticks.clear(); changes.clear(); endLoop();
      window.removeEventListener('vzip:data-changed', onData);
      const capture = s.capture, take = s.take;
      s.capture = null; s.take = null; s.mr?.destroy?.(); s.mr = null; s.preview?.destroy?.();
      try {
        if (capture) { const withMr = takeMr(); await keep({res:await capture.stop(), withMr, id:VZ.uid()}); }
        else if (take) await keep(take);
      } finally { audioSession('auto'); bar.remove(); }
    }
  };
}
window.VzipScoreAudio = {mount, tracksOf, mrItem};
})();
