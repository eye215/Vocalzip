/* 성장 › 곡 하나 (#/growth-song/<songId>) — the ONE song screen (큰 정리 2번, 2026-11-27). The screen itself (its frame,
 * state and route) is app/vocal-lab.js: 곡 분석's sections are mounted there in the screen's order. This file draws the
 * parts it keeps from the 성장 v2 song screen (성장 v2 R4); nothing new is worked out or stored:
 *   한마디 · 한 줄        heroHtml: the word and line of the chosen period (VZ.growthSong, app/growth-hub.js →
 *                        app/growth-song-model.js verdict / month), ▶처음 ▶최근, 듣고 고르기
 *   들어 본 평가          heardHtml: the listening verdicts of the song (app/listen-verdict-model.js), 모아 보기
 *   곡 확인              checkHtml: 곡 확인이 필요해 보이는 녹음 of this song (app/song-check.js)
 * Words: what was measured and heard, never a verdict on the voice. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, L = window.VzipListenVerdict;
if (!V || !M || typeof document === 'undefined') return;
const e = V.esc;
const dayLabel = d => d ? V.dateLabel(d).replace(/ \(.*$/, '') : '날짜 미상';

/** h: {state, word, text, firstId, lastId, firstDate, lastDate, note, label, overall}; takes: [{m, date, analysed}] oldest
 * first. overall: the whole-song verdict (전체), whose chip and line carry data-song-verdict / data-song-basis. */
function heroHtml(song, h, takes) {
  const analysed = takes.filter(t => t.analysed).length, first = takes[0], last = takes.at(-1);
  const play = (id, label, date) => id ? '<button type="button" class="gsp-play" data-gsp-play="' + e(id) + '"><i class="ph-fill ph-play" aria-hidden="true"></i>' + label + (date ? ' · ' + e(dayLabel(date)) : '') + '</button>' : '';
  const span = first ? ' · ' + dayLabel(first.date) + (last && last !== first ? ' → ' + dayLabel(last.date) : '') : '';
  return '<section class="gsp-hero" data-gsp-hero data-state="' + e(h?.state || 'none') + '">' +
    '<p class="gsp-kicker">한마디 · ' + e(h?.label || '전체') + '</p><h2>' + e(song.title) + '</h2>' +
    (h ? '<p class="gsp-word"><span class="gsp-chip" data-state="' + e(h.state) + '"' + (h.overall ? ' data-song-verdict="' + e(h.state) + '"' : ' data-song-period-verdict="' + e(h.state) + '"') + '>' + e(h.word) + '</span>' +
      '<span data-gsp-line' + (h.overall ? ' data-song-basis' : '') + '>' + e(h.text || '') + '</span></p>' + (h.note ? '<p class="gsp-sub" data-gsp-note>' + e(h.note) + '</p>' : '') : '') +
    '<p class="gsp-sub">녹음 ' + takes.length + '개 · 분석 ' + analysed + '개' + e(span) + '</p>' +
    '<div class="gsp-actions">' + (h?.firstId && h?.lastId ? play(h.firstId, '처음', h.firstDate) + play(h.lastId, '최근', h.lastDate) : '') +
    (V.listenSession && takes.length >= 2 ? '<a class="gsp-play is-soft" href="#/listen?song=' + encodeURIComponent(song.id) + '" data-gsp-listen><i class="ph-fill ph-headphones" aria-hidden="true"></i>듣고 고르기</a>' : '') + '</div>' +
    '<div class="gsp-player" data-gsp-player></div></section>';
}
/** 들어 본 평가: how the ear leans over all of the song's verdicts (모아 보기, owner 2026-11-24), next to the measured
 * direction, and the last three. Leaving one is 두 녹음 비교, right under it. */
function heardHtml(song, state = '') {
  const list = L ? L.list(V.db, {songId:song.id}) : [];
  const t = L?.tally ? L.tally(list) : null, ear = t && L.earOf(t), agree = ear ? L.agreeText(t, state) : '';
  const sum = ear ? '<div class="gsp-ear" data-gsp-ear="' + ear + '"><p><strong>' + e(L.EAR_TEXT[ear]) + '</strong></p>' +
    '<div class="gsp-ear-bar" aria-hidden="true">' + ['later', 'same', 'earlier'].map(k => t[k] ? '<i data-k="' + k + '" style="flex:' + t[k] + '"></i>' : '').join('') + '</div>' +
    '<small data-gsp-ear-count>' + e(L.tallyText(t)) + '</small>' + (agree ? '<small data-gsp-agree>' + e(agree) + '</small>' : '') + '</div>' : '';
  return '<section class="gsp-card" data-gsp-heard data-state="' + e(state) + '"><h3>들어 본 평가 <small>' + (list.length ? list.length + '개' : '') + '</small></h3>' + sum +
    (list.length ? '<ul class="gsp-heard">' + list.slice(0, 3).map(x => '<li>' + e(L.line(x)) + '</li>').join('') + '</ul>' : '<p class="gsp-empty">아직 없어요. 아래에서 두 녹음을 골라 들어 보고 어느 쪽이 나은지 남겨 보세요.</p>') + '</section>';
}
/** 곡 확인이 필요해 보이는 녹음 of this song (app/song-check.js), when there is any. */
function checkHtml(song, items) {
  const list = V.songCheck ? V.songCheck.suspects(items).filter(s => s.songId === song.id) : [];
  return list.length ? '<section class="gsp-card" data-gsp-check><h3>곡 확인이 필요해 보이는 녹음 <small>' + list.length + '</small></h3>' + V.songCheck.listHtml(list, items) + '</section>' : '';
}
V.growthSongParts = {heroHtml, heardHtml, checkHtml, dayLabel};
// A verdict saved from the 두 녹음 비교 sheet over this screen shows at once.
window.addEventListener('vzip:listen-verdicts', () => {
  const box = document.querySelector('[data-gsp-heard]'), id = /^#\/growth-song\/([^?]+)/.exec(location.hash)?.[1];
  const song = id && V.song(decodeURIComponent(id));
  if (box && song) box.outerHTML = heardHtml(song, box.dataset.state);
});
})();
