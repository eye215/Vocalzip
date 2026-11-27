/* 녹음 화면 (#/take/<id>; owner-approved design, 2026-11-27): what a recording row of 곡 상세 › 녹음 opens. One light page,
 * 뒤로 returns to the song's list at the same place (app/views-main.js keeps it). It only reads and calls existing actions:
 *   카드 1   녹음 유형 · 공연 · 연습/레슨 기록 연결됨 chips, the song title, "11월 10일 화요일 · 1:00 · 클라우드", the saved
 *            waveform (or a plain track) with the playing position, ▶ (M.player underneath: the same loading, iPhone tap rule
 *            and messages as every list), ‹ › the song's older / newer recording, 내 만족도 (the recording's own rating, else
 *            the linked practice's, read-only; tap → 정보 수정), 감상 메모.
 *   분석 결과 up to six values of this recording's saved analysis (음정 · 안정성 · 최고음 · 음역 · 호흡 · 고음, as
 *            VzipGrowthMetrics.single reads them), 처음 녹음과 비교 (곡 분석 › 두 녹음 비교 with the song's first take and this
 *            one) and 구간 자세히 (곡 분석 with this take open: 이 녹음 자세히). Not analysed: one line + 이 녹음 분석하기
 *            (VZ.openAnalysisSelection, the ⋯ menu's 보컬 분석).
 *   rows     연습 기록 (VZ.practiceDetail: edit / delete) or 레슨 기록 (#/lesson/<id>) when one holds this recording,
 *            곡 분석에서 보기 (#/growth-song/<songId>), 다른 곡으로 옮기기 (the ⋯ menu's 곡 지정 flow).
 *   ⋯        the shared recording menu (app/recording-menu.js): 재생 · 정보 수정 · 곡 지정 · 녹음 유형 · 공유 · 보컬 분석 ·
 *            다운로드 · 파일 삭제 (its own confirmation; then back to the list).
 * No data shape is new: every change goes through VZ.editMedia, VZ.recordingMenu, VZ.saveRecordingSong, M.remove. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const esc = VZ.esc;
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const BARS = 54;
let player = null, cleanup = [];
const stop = () => { player?.destroy(); player = null; cleanup.splice(0).forEach(fn => { try { fn(); } catch {} }); };

/** "11월 10일 화요일" */
const longDay = ymd => { const d = VZ.parseYmd(ymd); if (!d) return '날짜 미상'; return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()] + '요일'; };
/** The song's recordings in time order (oldest first), as 곡 상세 lists them the other way round. */
const order = (a, b) => String(M.dateOf(a) || '').localeCompare(String(M.dateOf(b) || '')) || (Number(a.created) || 0) - (Number(b.created) || 0) || String(a.id).localeCompare(String(b.id));
const songOf = item => item?.songId && VZ.song(item.songId) && !(VZ.db.deleted?.songs || []).map(String).includes(String(item.songId)) ? VZ.song(item.songId) : null;
/** The lesson or practice record that holds this recording, if any (the same rule as 곡 상세's chip). */
function linkedRecord(item) {
  const lesson = (VZ.db.lessons || []).find(l => (l.recordings || []).some(x => x.id === item.id));
  if (lesson) return {kind:'lesson', record:lesson};
  const practice = (VZ.db.practices || []).find(p => (p.mediaIds || []).includes(item.id));
  return practice ? {kind:'practice', record:practice} : null;
}
const canAnalyze = item => M.songSearchEligible(item) && !!songOf(item);
const analysisOf = item => item?.analysis?.metrics ? item.analysis : null;

/** Up to six measured values of one analysis: [label, value]. Nothing is made up; a value that is not there is left out. */
function tiles(a, song) {
  const m = a.metrics, out = [], G = window.VzipGrowthMetrics;
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const into = num(m.intonation?.meanAbsCents), wob = num(m.stability?.wobbleCents), phrase = num(m.breath?.medianPhrase);
  if (into != null) out.push(['음정', '±' + into + ' cent', 'intonation']);
  if (wob != null) out.push(['안정성', '±' + wob, 'stability']);
  const high = a.v >= 2 ? m.range?.stableHigh?.note : null;
  if (high) out.push(['최고음', high, 'high-note']);
  const main = m.range?.main, low = main?.low || m.range?.low, top = main?.high || m.range?.high;
  if (low && top) out.push(['음역', low + '–' + top, 'range']);
  if (phrase != null) out.push(['호흡', phrase + '초', 'phrase']);
  try {
    const ref = song?.vocalRange && Number.isFinite(song.vocalRange.highMidi) ? song.vocalRange : null;
    const h = G?.single?.(a, {reference:ref})?.high;
    if (h?.state === 'reference' && num(h.wobble) != null) out.push(['고음', '±' + h.wobble, 'high']);
  } catch {}
  return out.slice(0, 6);
}

VZ.route('take', {title:'녹음', tab:'songs', back:true, noAutoRefresh:true,
  actions:() => '<button type="button" class="icon-btn" data-recd-more aria-label="녹음 더보기"><i class="ph ph-dots-three-outline"></i></button>',
  render:() => '<div class="vz-recd" data-recd><p class="vz-recd-loading" role="status">녹음을 불러오는 중…</p></div>',
  leave() {
    stop();
    // Going anywhere but back to the song's list (or to its next recording): the list starts at the top next time.
    if (!/^#\/(song|take)\//.test(location.hash)) VZ.songListReturn?.clear();
  },
  async mount(main, r) {
    stop();
    const id = r.params[0], host = main.querySelector('[data-recd]');
    let list = await M.list().catch(() => M.cached());
    if (!host.isConnected) return;
    let item = list.find(m => String(m.id) === String(id));
    if (!item) { host.innerHTML = VZ.empty('waveform', '녹음을 찾을 수 없어요. 삭제됐을 수 있어요.', '<a class="btn sm" href="#/library">전체 녹음으로</a>'); document.querySelector('[data-recd-more]')?.remove(); return; }
    const wave = Array.isArray(item.waveform) ? item.waveform.filter(v => Number.isFinite(Number(v))) : [];
    const bars = [];
    if (wave.length) { const step = wave.length / BARS; for (let i = 0; i < BARS; i++) { const part = wave.slice(Math.floor(i * step), Math.max(Math.floor(i * step) + 1, Math.floor((i + 1) * step))).map(Number); bars.push(part.length ? Math.max(...part) : 0); } }
    const peak = Math.max(.01, ...bars);
    host.innerHTML =
      '<section class="vz-recd-card vz-recd-main" aria-labelledby="vz-recd-title">' +
        '<div class="vz-recd-chips" data-recd-chips></div>' +
        '<h2 class="vz-recd-title" id="vz-recd-title" data-recd-title></h2>' +
        '<p class="vz-recd-meta" data-recd-meta></p>' +
        '<div class="vz-recd-wave' + (bars.length ? '' : ' is-track') + '" data-recd-wave>' +
          (bars.length ? bars.map(v => '<span style="height:' + Math.max(14, Math.round(v / peak * 100)) + '%"></span>').join('') : '<span class="vz-recd-track"><span data-recd-fill></span></span>') +
          '<input type="range" min="0" max="1000" step="1" value="0" data-recd-seek aria-label="재생 위치">' +
        '</div>' +
        '<div class="vz-recd-times"><span data-recd-now>0:00</span><span data-recd-total>' + esc(VZ.clock(item.durationSeconds)) + '</span></div>' +
        '<div class="vz-recd-controls">' +
          '<button type="button" class="vz-recd-skip" data-recd-prev aria-label="이전 녹음"><i class="ph ph-caret-left" aria-hidden="true"></i></button>' +
          '<button type="button" class="vz-recd-play" data-recd-play aria-label="재생"><i class="ph-fill ph-play" aria-hidden="true"></i></button>' +
          '<button type="button" class="vz-recd-skip" data-recd-next aria-label="다음 녹음"><i class="ph ph-caret-right" aria-hidden="true"></i></button>' +
        '</div>' +
        '<div class="vz-recd-engine" data-recd-engine></div>' +
        '<button type="button" class="vz-recd-rating" data-recd-rating></button>' +
        '<p class="vz-recd-review" data-recd-review hidden></p>' +
      '</section>' +
      '<section class="vz-recd-card" data-recd-analysis aria-labelledby="vz-recd-analysis-title"></section>' +
      '<nav class="vz-recd-card vz-recd-rows" data-recd-rows aria-label="이 녹음과 연결된 곳"></nav>';
    const $ = s => host.querySelector(s);

    /* ----- player: M.player does the loading and playing; this card is its face ----- */
    player = M.player($('[data-recd-engine]'), item, {});
    const el = player.el, playBtn = $('[data-recd-play]'), seek = $('[data-recd-seek]');
    const duration = () => Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Number(item.durationSeconds) || 0;
    const paintTime = () => {
      const d = duration(), p = d ? Math.min(1, (el.currentTime || 0) / d) : 0;
      $('[data-recd-now]').textContent = VZ.clock(el.currentTime || 0);
      $('[data-recd-total]').textContent = VZ.clock(d);
      if (!seek.matches(':active')) seek.value = String(Math.round(p * 1000));
      seek.setAttribute('aria-valuetext', VZ.clock(el.currentTime || 0) + ' / ' + VZ.clock(d));
      const on = Math.round(p * BARS);
      host.querySelectorAll('[data-recd-wave] > span:not(.vz-recd-track)').forEach((b, i) => b.classList.toggle('on', i < on));
      const fill = $('[data-recd-fill]'); if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
    };
    const paintPlay = () => {
      const playing = !el.paused;
      playBtn.innerHTML = '<i class="ph-fill ph-' + (playing ? 'pause' : 'play') + '" aria-hidden="true"></i>';
      playBtn.setAttribute('aria-label', playing ? '일시정지' : '재생');
    };
    for (const [type, fn] of [['timeupdate', paintTime], ['loadedmetadata', paintTime], ['durationchange', paintTime], ['play', paintPlay], ['pause', paintPlay], ['ended', paintPlay]]) el.addEventListener(type, fn);
    playBtn.onclick = () => el.paused ? player.play() : player.pause();
    seek.oninput = () => { const d = duration(); if (d) player.seek(seek.value / 1000 * d); paintTime(); };

    /* ----- the parts that follow the data (redrawn after an edit, a move, an analysis) ----- */
    const neighbours = () => {
      const song = songOf(item); if (!song) return [null, null];
      const same = list.filter(m => m.songId === item.songId).sort(order), at = same.findIndex(m => String(m.id) === String(item.id));
      return [at > 0 ? same[at - 1] : null, at >= 0 && at < same.length - 1 ? same[at + 1] : null];
    };
    const go = other => { if (other) location.replace('#/take/' + encodeURIComponent(other.id)); };
    $('[data-recd-prev]').onclick = () => go(neighbours()[0]);
    $('[data-recd-next]').onclick = () => go(neighbours()[1]);

    const paintMain = () => {
      const song = songOf(item), link = linkedRecord(item), kind = M.recordingCategory(item);
      $('[data-recd-chips]').innerHTML = '<span class="vz-recd-chip is-kind">' + esc(M.recordingTypeName(kind)) + '</span>' +
        (M.isPerformance(item) ? '<span class="vz-recd-chip">공연</span>' : '') +
        (link ? '<span class="vz-recd-chip" data-recd-linked>' + (link.kind === 'lesson' ? '레슨 기록 연결됨' : '연습 기록 연결됨') + '</span>' : '');
      const title = $('[data-recd-title]');
      title.textContent = song ? song.title : M.label(item);
      title.title = M.label(item);
      $('[data-recd-meta]').textContent = [longDay(M.dateOf(item)), item.durationSeconds ? VZ.clock(item.durationSeconds) : '', item.cloud ? '클라우드' : '기기', song && M.label(item) !== song.title && !M.label(item).startsWith(song.title + ' ') ? M.label(item) : ''].filter(Boolean).join(' · ');
      const [prev, next] = neighbours();
      $('[data-recd-prev]').disabled = !prev; $('[data-recd-next]').disabled = !next;
      host.querySelector('.vz-recd-controls').classList.toggle('is-single', !prev && !next);
      // 내 만족도: the recording's own rating; without one, the linked practice's (read-only). Tap: 정보 수정, where it is set.
      const own = Number(item.rating) || 0, fromPractice = !own && link?.kind === 'practice' ? Number(link.record.rating) || 0 : 0, stars = own || fromPractice;
      const rating = $('[data-recd-rating]');
      rating.innerHTML = '<span class="vz-recd-rating-label">내 만족도' + (fromPractice ? ' <small>연습 기록</small>' : '') + '</span>' +
        (stars ? '<span class="vz-recd-stars" aria-hidden="true">' + '★'.repeat(stars) + '<span class="off">' + '★'.repeat(5 - stars) + '</span></span>' : '<span class="vz-recd-stars-empty">아직 없어요</span>');
      rating.setAttribute('aria-label', '내 만족도 ' + (stars ? stars + '점' + (fromPractice ? ' (연습 기록)' : '') : '없음') + ' · 정보 수정 열기');
      rating.dataset.stars = String(stars);
      const review = $('[data-recd-review]'), text = String(item.review || '').trim();
      review.hidden = !text; review.textContent = text;
    };
    const paintAnalysis = () => {
      const box = $('[data-recd-analysis]'), a = analysisOf(item), song = songOf(item), shown = a ? tiles(a, song) : [];
      const head = '<h2 class="vz-recd-h" id="vz-recd-analysis-title">분석 결과</h2>';
      if (!a || !shown.length) {
        const line = !a ? (canAnalyze(item) ? '아직 분석하지 않은 녹음이에요.' : song ? '곡 녹음 · 레슨 녹음만 분석할 수 있어요.' : '곡을 지정하면 분석할 수 있어요.') : '이 녹음에서 잰 값이 없어요. 목소리가 짧거나 반주가 컸을 수 있어요.';
        box.innerHTML = head + '<p class="vz-recd-line" data-recd-none>' + esc(line) + '</p>' + (canAnalyze(item) ? '<button type="button" class="vz-recd-soft is-block" data-recd-analyze>' + (a ? '다시 분석하기' : '이 녹음 분석하기') + '</button>' : '');
        box.querySelector('[data-recd-analyze]')?.addEventListener('click', analyze);
        return;
      }
      // 처음 녹음과 비교: the song's first analysed take before this one (곡 분석 › 두 녹음 비교, this take as the second).
      const same = song ? list.filter(m => m.songId === item.songId && String(m.id) !== String(item.id) && analysisOf(m) && order(m, item) < 0).sort(order) : [];
      const first = same[0];
      const reliable = VZ.analysisReliable ? VZ.analysisReliable(a) : true;
      box.innerHTML = head + '<div class="vz-recd-tiles" data-recd-tiles>' + shown.map(([k, v, key]) => '<div class="vz-recd-tile" data-tile="' + key + '"><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>').join('') + '</div>' +
        (reliable ? '' : '<p class="vz-recd-note">' + esc(window.VzipGrowthMetrics?.holdText?.('confidence') || '측정 신뢰도가 낮아요') + ' · 참고로만 봐 주세요.</p>') +
        '<div class="vz-recd-buttons">' +
          (first ? '<a class="vz-recd-soft" data-recd-compare href="#/growth-song/' + encodeURIComponent(item.songId) + '?a=' + encodeURIComponent(first.id) + '&b=' + encodeURIComponent(item.id) + '&compare=1">처음 녹음과 비교</a>' : '') +
          '<a class="vz-recd-soft" data-recd-detail href="' + (song ? '#/growth-song/' + encodeURIComponent(item.songId) + '?a=' + encodeURIComponent(item.id) : '#/analysis/' + encodeURIComponent(item.id)) + '">구간 자세히</a>' +
        '</div>';
    };
    const paintRows = () => {
      const song = songOf(item), link = linkedRecord(item), rows = [];
      const row = (attrs, title, sub) => '<' + (attrs.startsWith('href') ? 'a ' : 'button type="button" ') + attrs + ' class="vz-recd-row"><strong>' + esc(title) + '</strong>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '<i class="ph ph-caret-right" aria-hidden="true"></i></' + (attrs.startsWith('href') ? 'a' : 'button') + '>';
      if (link?.kind === 'practice') {
        const p = link.record, memo = VZ.practiceSource ? VZ.practiceSource(p).memo : p.memo;
        rows.push(row('data-recd-practice="' + esc(p.id) + '"', '연습 기록', [p.practiceTimeSource === 'unconfirmed' ? '시간 미입력' : VZ.minutes(VZ.practiceMinutes(p)), p.rating ? '★' + p.rating : '', String(memo || '').trim().replace(/\s+/g, ' ').slice(0, 40)].filter(Boolean).join(' · ')));
      } else if (link?.kind === 'lesson') {
        const l = link.record, fb = l.songFeedback?.[item.songId] || l.feedback || '';
        rows.push(row('href="#/lesson/' + esc(encodeURIComponent(l.id)) + '" data-recd-lesson', '레슨 기록', [VZ.dateLabel(l.date), String(fb).trim().replace(/\s+/g, ' ').slice(0, 30)].filter(Boolean).join(' · ')));
      }
      if (song) rows.push(row('href="#/growth-song/' + esc(encodeURIComponent(song.id)) + '" data-recd-growth', '곡 분석에서 보기', '이 곡의 흐름'));
      if (M.songSearchEligible(item)) rows.push(row('data-recd-move', song ? '다른 곡으로 옮기기' : '곡 지정하기', ''));
      const box = $('[data-recd-rows]');
      box.innerHTML = rows.join(''); box.hidden = !rows.length;
      box.querySelector('[data-recd-practice]')?.addEventListener('click', e => VZ.practiceDetail(e.currentTarget.dataset.recdPractice));
      box.querySelector('[data-recd-move]')?.addEventListener('click', move);
    };
    const paint = () => { if (!host.isConnected) return; paintMain(); paintAnalysis(); paintRows(); paintTime(); paintPlay(); };
    /** After an edit made here or elsewhere: read the recording again and redraw (the player keeps playing). */
    const reread = async () => {
      list = await M.list().catch(() => list);
      if (!host.isConnected) return;
      const fresh = list.find(m => String(m.id) === String(item.id));
      if (fresh) item = fresh; paint();
    };

    /* ----- actions (all existing) ----- */
    async function analyze() {
      if (!canAnalyze(item)) return;
      player?.pause();
      VZ.openAnalysisSelection?.([item]);
    }
    async function move() {
      const v = await VZ.pickRecordingSong([item]); if (v == null) return;
      try { await VZ.saveRecordingSong(item, v); M.invalidate?.(); VZ.toast('곡을 바꿨어요: 1개'); await reread(); }
      catch (e) { VZ.toast('곡을 바꾸지 못했어요: ' + e.message, 'error'); }
    }
    $('[data-recd-rating]').onclick = () => VZ.editMedia(item);
    const more = document.querySelector('[data-recd-more]');
    if (more) more.onclick = () => VZ.recordingMenu(item, {anchor:more, player:() => player, changed:reread,
      analyze:() => { player?.pause(); VZ.openAnalysisSelection([item]); },
      remove:async () => {
        try {
          if (!await M.confirmRemove(item)) return;
          await M.remove(item); VZ.toast('파일을 삭제했어요. 연습·레슨 기록은 남아 있어요.');
          if (host.isConnected) { if (history.length > 1) history.back(); else VZ.nav(item.songId ? '#/song/' + encodeURIComponent(item.songId) : '#/library'); }
        } catch (err) { VZ.toast('삭제를 완료하지 못했어요: ' + err.message, 'error'); }
      }});

    // Edits from 정보 수정 / the ⋯ menu / another device, a saved analysis, a practice record edited from here.
    const onMedia = e => { if (!host.isConnected) return; if (!e?.detail?.id || String(e.detail.id) === String(item.id)) setTimeout(reread, 60); };
    const onData = () => { if (host.isConnected) paint(); };
    window.addEventListener('vzip:media-updated', onMedia);
    window.addEventListener('vzip:v6-media', onMedia);
    window.addEventListener('vzip:analysis-saved', onMedia);
    window.addEventListener('vzip:data-changed', onData);
    cleanup.push(() => { window.removeEventListener('vzip:media-updated', onMedia); window.removeEventListener('vzip:v6-media', onMedia); window.removeEventListener('vzip:analysis-saved', onMedia); window.removeEventListener('vzip:data-changed', onData); });
    paint();
  }});
})();
