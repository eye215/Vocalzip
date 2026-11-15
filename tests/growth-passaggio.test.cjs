// 파사지오(전환 구간) over many recordings — app/growth-metrics-model.js passaggioRecurring. One recording's zone
// (passaggioOf) moves with the song and the day; a report shows a zone only when it comes back in at least half of at
// least five reliable, detailed recordings. Reference only, never a verdict. Node only (pure module).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/growth-metrics-model.js');
const FIX = require('./growth-characterization.fixture.cjs');
let seq = 0;
/** A take whose sustained-note wobble jumps at `zone` (MIDI numbers; [] = nowhere). Baseline ±6 cent, the zone ±14. */
const take = (zone, {ok = true, date = '2026-11-' + String(1 + seq % 28).padStart(2, '0'), detail = true, wobble = 14} = {}) => {
  const a = FIX.v2({into:15});
  a.metrics.pitchBands.rows = [[55, 4, .6, 1, 3, 6], [57, 4, .6, 1, 3, 6], [59, 5, .7, 1.2, 4, 6], [72, 4, .6, 1, 3, 6], [76, 4, .6, 1, 3, 6], ...[].concat(zone).map(midi => [midi, 3, .8, 1.1, 3, wobble])].sort((x, y) => x[0] - y[0]);
  if (!detail) { delete a.metrics.pitchBands; delete a.metrics.phrases; }
  return {id:'p' + (++seq), songId:'s1', a, date, created:seq, ok};
};
const many = (n, zone, extra) => Array.from({length:n}, () => take(zone, extra));

test('one recording: the zone where sustained-note wobble jumps (as before)', () => {
  assert.deepEqual(G.passaggioOf(take([64, 65]).a), {state:'reference', found:true, from:'E4', to:'F4', fromMidi:64, toMidi:65, wobble:14, baseline:6, bands:7});
  assert.equal(G.passaggioOf(take([]).a).found, false);
  assert.equal(G.PASSAGGIO_SINGLE, '이 녹음에서만 본 참고값');
});

test('a zone that recurs in at least half of at least five recordings is reported, with how often and how widely', () => {
  const r = G.passaggioRecurring([...many(15, [64, 65]), ...many(4, [69]), ...many(5, [])]);
  assert.deepEqual(r, {state:'reference', found:true, from:'E4', to:'F4', fromMidi:64, toMidi:65, count:15, of:24, share:.63, spread:{from:'E4', to:'F4', fromMidi:64, toMidi:65}, wobble:14, baseline:6});
  assert.equal(G.passaggioRecurringText(r), '최근 24개 중 15개에서 E4~F4 근처 · 지속음 흔들림 ±14 cent, 평소 ±6 cent');
  // Exactly half of five is enough; one fewer is not.
  assert.equal(G.passaggioRecurring([...many(3, [64]), ...many(2, [70])]).found, true);
  assert.deepEqual(G.passaggioRecurring([...many(2, [64]), ...many(2, [70]), take([58])]), {state:'hold', reason:'scattered', of:5, count:2});
  assert.deepEqual(G.RULES.passaggioRecur, {cap:40, min:5, share:.5, tolerance:1});
});

test('tolerance: zones within a semitone of each other are the same zone; the reported band is the middle one', () => {
  // E4, F4 and F#4 on different days: F4 ± 1 semitone holds all six; E4 or F#4 alone would hold four.
  const r = G.passaggioRecurring([...many(2, [64]), ...many(2, [65]), ...many(2, [66]), ...many(2, [72 + 2])]);
  assert.deepEqual([r.found, r.from, r.to, r.count, r.of, r.spread.from, r.spread.to], [true, 'F4', 'F4', 6, 8, 'E4', 'F#4']);
  assert.equal(G.passaggioRecurringText(r), '최근 8개 중 6개에서 F4 근처 (나온 범위 E4~F#4) · 지속음 흔들림 ±14 cent, 평소 ±6 cent');
  // Two semitones apart is another zone.
  assert.deepEqual(G.passaggioRecurring([...many(2, [62]), ...many(2, [65]), ...many(2, [68])]), {state:'hold', reason:'scattered', of:6, count:2});
});

test('scattered zones and too few recordings are 판정 보류, with the counts — never a value', () => {
  const scattered = G.passaggioRecurring([take([57 + 3]), take([63]), take([66]), take([69]), take([73]), take([64]), take([])]);
  assert.deepEqual(scattered, {state:'hold', reason:'scattered', of:7, count:2});       // 63 and 64 are neighbours: the most that agree is two
  assert.equal(G.passaggioRecurringText(scattered), '판정 보류 · 녹음마다 다르게 나와요 (최근 7개 중 가장 많이 겹친 곳도 2개)');
  const few = G.passaggioRecurring(many(4, [64, 65]));
  assert.deepEqual(few, {state:'hold', reason:'few-recordings', of:4, need:5});
  assert.equal(G.passaggioRecurringText(few), '판정 보류 · 세부 측정이 있는 믿을 만한 녹음이 5개는 있어야 해요 (지금 4개)');
  assert.deepEqual(G.passaggioRecurring([]), {state:'hold', reason:'few-recordings', of:0, need:5}); assert.deepEqual(G.passaggioRecurring(null).of, 0);
  // When most recordings show no zone at all, that is what recurs.
  const none = G.passaggioRecurring([...many(6, []), ...many(2, [64])]);
  assert.deepEqual(none, {state:'reference', found:false, count:6, of:8, baseline:6});
  assert.equal(G.passaggioRecurringText(none), '최근 8개 중 6개에서 흔들림이 크게 달라지는 구간이 보이지 않았어요 (평소 ±6 cent)');
});

test('unreliable takes, takes without detail and takes beyond the latest 40 are not read', () => {
  // Five reliable takes at E4; ten unreliable ones at A4 and three without band detail do not count either way.
  const r = G.passaggioRecurring([...many(5, [64]), ...many(10, [69], {ok:false}), ...many(3, [69], {detail:false})]);
  assert.deepEqual([r.found, r.from, r.count, r.of], [true, 'E4', 5, 5]);
  assert.equal(G.passaggioRecurring([...many(4, [64]), ...many(10, [64], {ok:false})]).reason, 'few-recordings');
  // The latest 40 by date: 30 older takes at A4 are out of the window, the newest 40 are at E4.
  const old = many(30, [69], {date:'2025-01-10'}), recent = many(40, [64], {date:'2026-11-10'});
  const capped = G.passaggioRecurring([...recent, ...old]);
  assert.deepEqual([capped.of, capped.count, capped.from], [40, 40, 'E4']);
  // A take with too few sustained notes to look for a zone ('few-bands') is not one of the recordings counted.
  const thin = take([64]); thin.a.metrics.pitchBands.rows = thin.a.metrics.pitchBands.rows.slice(0, 2);
  assert.equal(G.passaggioRecurring([...many(5, [64]), thin]).of, 5);
});

test('reports carry what recurs: a song\'s takes, a month\'s takes; the line is never one recording\'s value', () => {
  const takes = [...many(6, [64, 65]), take([70])];
  const song = G.songReport(takes).passaggio;
  assert.deepEqual([song.state, song.recurring.found, song.recurring.count, song.recurring.of, song.latest.from], ['reference', true, 6, 7, 'A#4']);   // the latest take alone says A#4
  assert.equal(G.passaggioReportText(song), '최근 7개 중 6개에서 E4~F4 근처 · 지속음 흔들림 ±14 cent, 평소 ±6 cent');
  assert.equal(G.passaggioText(song.latest), 'A#4 부근에서 지속음 흔들림이 커요 (±14 cent, 평소 ±6 cent)');   // kept for the single-take screens
  const short = G.songReport(many(3, [64])).passaggio;
  assert.equal(G.passaggioReportText(short), '판정 보류 · 세부 측정이 있는 믿을 만한 녹음이 5개는 있어야 해요 (지금 3개)');
  assert.equal(G.passaggioReportText({id:'passaggio', state:'hold', reason:'no-data'}), '판정 보류 · 측정값이 없어요');
  // Only older (v1) analyses: nothing can be read, and the reason is the one a v1 recording always gave.
  const old = G.songReport([{id:'o1', a:FIX.v1(30), date:'2026-09-01', created:1, ok:true}]).passaggio;
  assert.deepEqual(old.recurring, {state:'hold', reason:'few-recordings', of:0, need:5});
  assert.equal(G.passaggioReportText(old), '판정 보류 · 이전 분석(v1) 결과라 이 지표는 계산하지 않아요 · 다시 분석하면 확인할 수 있어요');
  const month = G.periodReport(many(2, [64]), many(5, [64])).passaggio;
  assert.deepEqual([month.recurring.found, month.recurring.of], [true, 5]);             // the month shown, not the months before it
  for (const text of [G.passaggioReportText(song), G.passaggioReportText(short)]) assert.doesNotMatch(text, /좋아|나빠|성장|향상/);
  assert.equal(G.PASSAGGIO_NOTE, '음정 데이터만으로 판별 불가, 선생님 판단 참고');
});
