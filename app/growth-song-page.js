/* 곡 분석 (#/growth-song/<songId>) — the parts of the ONE song screen drawn here. The screen itself (its frame, tabs,
 * state and route) is app/vocal-lab.js. Nothing new is worked out or stored:
 *   머리 (hero)     heroHtml: 작품 · 곡 제목 · the 한마디 of the chosen period (VZ.growthSong, app/growth-hub.js →
 *                  app/growth-song-model.js verdict / month), 녹음 n · 분석 n · 첫 날 → 마지막 날, ▶ 처음 vs 최근 듣기 and
 *                  듣고 고르기 — or, under two analysed takes, 분석한 녹음이 아직 없어요 · 녹음 분석하기
 *   들어 본 평가     heardHtml: the listening verdicts of the song (app/listen-verdict-model.js), 모아 보기
 *   곡 확인         checkHtml: 곡 확인이 필요해 보이는 녹음 of this song (app/song-check.js)
 * Words: what was measured and heard, never a verdict on the voice. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, L = window.VzipListenVerdict;
if (!V || !M || typeof document === 'undefined') return;
const e = V.esc;
const dayLabel = d => d ? V.dateLabel(d).replace(/ \(.*$/, '') : '날짜 미상';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.5c.6 5.4 3.1 9.9 10.5 10.5-7.4.6-9.9 5.1-10.5 10.5C11.4 17.1 8.9 12.6 1.5 12 8.9 11.4 11.4 6.9 12 1.5z"/></svg>';
/** A few soft stars on a big purple area or by a graph's latest point (none with reduced motion: app/growth-song-page.css).
 * list: [x, y, size px, duration s, delay s]. */
const stars = (list, cls = '') => '<span class="gsp-stars' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + list.map(([x, y, s, d, w]) => '<i style="--x:' + x + ';--y:' + y + ';--s:' + s + 'px;--d:' + d + 's;--w:' + w + 's">' + STAR + '</i>').join('') + '</span>';

/** h: {state, word, text, firstId, lastId, firstDate, lastDate, note, label, overall}; takes: [{m, date, analysed}] oldest
 * first; o: {empty (fewer than two analysed takes), toAnalyse (takes that can be analysed here)}. overall: the whole-song
 * verdict (전체), whose word and line carry data-song-verdict / data-song-basis. */
function heroHtml(song, h, takes, o = {}) {
  const analysed = takes.filter(t => t.analysed).length, first = takes[0], last = takes.at(-1);
  const span = first ? ' · ' + dayLabel(first.date) + (last && last !== first ? ' → ' + dayLabel(last.date) : '') : '';
  const state = h?.state || 'none';
  const attr = h?.overall ? ' data-song-verdict="' + e(state) + '"' : ' data-song-period-verdict="' + e(state) + '"';
  const period = h && h.label && h.label !== '전체' ? '<span class="gsp-period-tag" data-gsp-period-label>' + e(h.label) + '</span>' : '';
  // 분석 전: the line says it once; otherwise the word, then why.
  const word = !h ? '' : state === 'none'
    ? '<p class="gsp-word">' + period + '<span data-gsp-line' + attr + (h.overall ? ' data-song-basis' : '') + '>' + e(h.text || '분석한 녹음이 아직 없어요') + '</span></p>'
    : '<p class="gsp-word">' + period + '<span class="gsp-chip" data-state="' + e(state) + '"' + attr + '>' + e(h.word) + '</span><span class="gsp-dot" aria-hidden="true">·</span>' +
      '<span data-gsp-line' + (h.overall ? ' data-song-basis' : '') + '>' + e(h.text || '') + '</span></p>';
  const actions = o.empty
    ? (o.toAnalyse ? '<button type="button" class="gsp-play" data-sa-analyse>녹음 분석하기</button>'
      : '<a class="gsp-play" href="#/record?song=' + encodeURIComponent(song.id) + '" data-gsp-record>녹음하러 가기</a>')
    : (h?.firstId && h?.lastId ? '<button type="button" class="gsp-play" data-gsp-pair data-first="' + e(h.firstId) + '" data-last="' + e(h.lastId) + '"><i class="ph-fill ph-play" aria-hidden="true"></i>처음 vs 최근 듣기</button>' : '') +
      (V.listenSession && takes.length >= 2 ? '<a class="gsp-play is-soft" href="#/listen?song=' + encodeURIComponent(song.id) + '" data-gsp-listen>듣고 고르기</a>' : '');
  return '<section class="gsp-hero" data-gsp-hero data-state="' + e(state) + '">' +
    stars([['56%', '14px', 8, 2.4, 0], ['76%', '58px', 6, 2.1, .8], ['88%', '22px', 5, 2.6, 1.5]]) +
    (song.show ? '<p class="gsp-kicker">' + e(song.show) + '</p>' : '') + '<h2>' + e(song.title) + '</h2>' + word +
    (h?.note && !o.empty ? '<p class="gsp-sub gsp-note" data-gsp-note>' + e(h.note) + '</p>' : '') +
    '<p class="gsp-sub" data-gsp-stats>녹음 ' + takes.length + ' · 분석 ' + analysed + e(span) + '</p>' +
    (actions ? '<div class="gsp-actions">' + actions + '</div>' : '') + '</section>';
}
/** 들어 본 평가: how the ear leans over all of the song's verdicts (모아 보기, owner 2026-11-24), next to the measured
 * direction, and the last three. Leaving one is 두 녹음 비교 (녹음별). */
function heardHtml(song, state = '') {
  const list = L ? L.list(V.db, {songId:song.id}) : [];
  const t = L?.tally ? L.tally(list) : null, ear = t && L.earOf(t), agree = ear ? L.agreeText(t, state) : '';
  const sum = ear ? '<div class="gsp-ear" data-gsp-ear="' + ear + '"><p><strong>' + e(L.EAR_TEXT[ear]) + '</strong></p>' +
    '<div class="gsp-ear-bar" aria-hidden="true">' + ['later', 'same', 'earlier'].map(k => t[k] ? '<i data-k="' + k + '" style="flex:' + t[k] + '"></i>' : '').join('') + '</div>' +
    '<small data-gsp-ear-count>' + e(L.tallyText(t)) + '</small>' + (agree ? '<small data-gsp-agree>' + e(agree) + '</small>' : '') + '</div>' : '';
  return '<section class="gsp-card sa-card" data-gsp-heard data-state="' + e(state) + '"><header class="sa-card-head"><h3>들어 본 평가</h3><small>' + (list.length ? list.length + '개' : '') + '</small></header>' + sum +
    (list.length ? '<ul class="gsp-heard">' + list.slice(0, 3).map(x => '<li>' + e(L.line(x)) + '</li>').join('') + '</ul>'
      : '<p class="gsp-empty">남긴 평가가 아직 없어요. 녹음별 › 두 녹음 비교에서 가리고 듣고 남겨요.</p>') + '</section>';
}
/** 곡 확인이 필요해 보이는 녹음 of this song (app/song-check.js), when there is any. */
function checkHtml(song, items) {
  const list = V.songCheck ? V.songCheck.suspects(items).filter(s => s.songId === song.id) : [];
  return list.length ? '<section class="gsp-card sa-card" data-gsp-check><header class="sa-card-head"><h3>곡 확인이 필요해 보이는 녹음</h3><small>' + list.length + '</small></header>' + V.songCheck.listHtml(list, items) + '</section>' : '';
}
V.growthSongParts = {heroHtml, heardHtml, checkHtml, dayLabel, stars};
// A verdict saved from the 두 녹음 비교 sheet over this screen shows at once.
window.addEventListener('vzip:listen-verdicts', () => {
  const box = document.querySelector('[data-gsp-heard]'), id = /^#\/growth-song\/([^?]+)/.exec(location.hash)?.[1];
  const song = id && V.song(decodeURIComponent(id));
  if (box && song) box.outerHTML = heardHtml(song, box.dataset.state);
});
})();
