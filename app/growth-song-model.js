/* 곡 하나의 판정 — the ONE verdict of a song, for 성장 › 곡 (the song list and the song screen, app/growth-hub.js and
 * app/vocal-lab.js). Pure (no DOM, no storage; also loaded by the Node tests).
 *
 * It decides nothing new: the pair is the one 무엇이 달라졌나 picks without a period (app/growth-changes-model.js
 * songChange — the first and the latest reliable take measured the same way, with the same analysis version, on
 * different days; a second measurement with the MR removed stands in when that is what makes them comparable) and the
 * measures are compared by the 결과 리포트 rules (app/growth-metrics-model.js comparePair). Which takes are handed in is
 * the caller's take filter — VzipGrowthDataset.verdictRule({practice}) with the 연습 녹음 포함 switch — so the song list,
 * the song screen and 이번 달 say the same thing about the same song.
 *
 *   verdict({songId, title, takes, reference}) → {state, word, text, takes, item | excluded, report, rows, firstId, lastId}
 *     state  better · worse · mixed · similar (a pair was compared) · hold (판정 보류) · one (녹음 하나) · none (분석 전)
 *     word   the one word shown for it (WORD); text: one line saying why
 *     rows   the five measures of that pair, each {id, title, state, text, note} (판정 보류 with its reason included)
 *   month({…, period:{from, to}}) → the same song against the previous period (지난달 대비): {state, word, text, basis}
 *                                    or null when the song has no pair for the period
 *   effect(off, on, practice)     → '' or the one line saying what the 연습 녹음 포함 switch changes for this song */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./growth-metrics-model.js') : root.VzipGrowthMetrics, node ? require('./growth-changes-model.js') : root.VzipGrowthChanges);
  if (node) module.exports = api; else root.VzipGrowthSong = api;
})(typeof self !== 'undefined' ? self : globalThis, (G, C) => {
'use strict';
const WORD = {better:'좋아진 방향', worse:'아쉬운 방향', mixed:'엇갈림', similar:'비슷함', hold:'판정 보류', one:'녹음 하나', none:'분석 전'};
/** The measures a direction is read from (음역 확장 has none: it is shown, never judged). */
const JUDGED = ['intonation', 'stability', 'phrase', 'high'];
const titleOf = id => G.METRICS.find(d => d.id === id)?.title || id;
/** The two takes songChange compared, the second measurement (MR 빼고) in place where it used one. */
function pairOf(takes, item) {
  let first = takes.find(t => t.id === item.firstId), last = takes.find(t => t.id === item.lastId);
  if (!first || !last) return null;
  if (item.viaAlt === 'first' && first.alt) first = {...first, a:first.alt};
  if (item.viaAlt === 'second' && last.alt) last = {...last, a:last.alt};
  return [first, last];
}
function stateOf(report) {
  const states = JUDGED.map(id => report[id]?.state);
  const better = states.filter(s => s === 'better').length, worse = states.filter(s => s === 'worse').length;
  return better && worse ? 'mixed' : better ? 'better' : worse ? 'worse' : states.includes('mixed') ? 'mixed' : 'similar';
}
const names = (report, state) => JUDGED.filter(id => report[id]?.state === state).map(titleOf).join('·');
function textOf(state, report) {
  const better = names(report, 'better'), worse = names(report, 'worse');
  if (state === 'better') return '좋아진 지표: ' + better;
  if (state === 'worse') return '아쉬운 지표: ' + worse;
  if (state === 'mixed') return better && worse ? '좋아진 지표: ' + better + ' · 아쉬운 지표: ' + worse : '구간마다 다르게 변했어요';
  return '처음과 최근이 비슷해요';
}
function rowsOf(report) {
  return G.METRICS.filter(d => !d.reference).map(d => {
    const x = report[d.id] || {id:d.id, state:'hold', reason:'no-data'};
    return {id:d.id, title:d.title, state:x.state, text:x.state === 'hold' ? G.holdText(x.reason) : G.changeText(x), note:G.basisText(x) || (x.state === 'hold' ? '' : d.method)};
  });
}
function compared(args, period) {
  const takes = args.takes || [];
  const r = C.songChange({songId:args.songId, title:args.title || '', takes, reference:args.reference || null, ...(period ? {period} : {})});
  if (!r) return null;
  if (r.excluded) return {excluded:r.excluded};
  const pair = pairOf(takes, r.item);
  if (!pair) return {excluded:{kind:'song', songId:args.songId, reason:'held', text:G.holdText('no-data')}};
  const report = G.comparePair(pair[0], pair[1], {reference:args.reference || null});
  return {item:r.item, report};
}
function verdict(args = {}) {
  const analysed = (args.takes || []).filter(t => t?.a?.metrics).length;
  const base = {songId:args.songId || '', takes:analysed};
  if (!analysed) return {...base, state:'none', word:WORD.none, text:'분석한 녹음이 아직 없어요', rows:[]};
  const c = compared(args, null);
  if (!c || c.excluded) {
    const ex = c?.excluded || {reason:'no-data', text:G.holdText('no-data')};
    const state = ex.reason === 'no-pair' && analysed === 1 ? 'one' : 'hold';
    return {...base, state, word:WORD[state], reason:ex.reason, text:state === 'one' ? '다른 날 한 번 더 녹음하면 처음과 견줄 수 있어요' : ex.text, excluded:ex, rows:[]};
  }
  const state = stateOf(c.report);
  return {...base, state, word:WORD[state], text:textOf(state, c.report), item:c.item, report:c.report, rows:rowsOf(c.report), firstId:c.item.firstId, lastId:c.item.lastId};
}
/** The same song for one period against the one before it (as 이번 달 › 달라진 것 compares it); null when there is no pair. */
function month(args = {}) {
  if (!C.periodOf(args.period)) return null;
  const c = compared(args, args.period);
  if (!c || !c.item) return null;
  const state = stateOf(c.report), moved = c.item.changes.filter(x => !x.similar).map(x => x.text);
  return {state, word:WORD[state], text:moved.length ? moved.join(' · ') : '비슷해요', basis:c.item.basis, firstId:c.item.firstId, lastId:c.item.lastId};
}
/** "(으)로" after a Korean word. */
const ro = word => { const c = String(word).charCodeAt(String(word).length - 1) - 0xAC00; if (c < 0 || c > 11171) return '(으)로'; const tail = c % 28; return tail === 0 || tail === 8 ? '로' : '으로'; };
/** What the 연습 녹음 포함 switch changes for this song: off / on are the verdicts without / with practice takes. */
function effect(off, on, practice) {
  if (!off || !on || off.state === on.state) return '';
  return practice ? '연습 녹음을 넣어서 ‘' + off.word + '’에서 ‘' + on.word + '’' + ro(on.word) + ' 바뀌었어요.' : '연습 녹음을 넣으면 ‘' + on.word + '’' + ro(on.word) + ' 바뀌어요.';
}
return {WORD, JUDGED, verdict, month, effect, stateOf, rowsOf};
});
