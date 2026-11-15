// 같은 날 녹음 — how several takes of ONE song on ONE day count (app/growth-metrics-model.js: days, dayValue, dayTakes,
// songReport {sameDay}). 모두 (default) is every take as before; 하루 평균 · 신뢰도 높은 것 · 가장 좋은 것 give a day one
// value per measure from its reliable takes only. Node only (pure module).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/growth-metrics-model.js');
const FIX = require('./growth-characterization.fixture.cjs');
const kst = (date, time) => Date.parse(date + 'T' + time + ':00+09:00');
/** A take of the song: into (음정 정확도 cent), wob, stable (안정 최고음), conf (pitch confidence), voiced seconds. */
let seq = 0;
const take = (date, time, {into = 20, wob = 10, stable = 'F5', conf = .95, voiced = 60, longer = 0, ok = true} = {}) => {
  const a = FIX.v2({into, wob, conf, longer}), midi = {C5:72, D5:74, E5:76, F5:77, G5:79, A5:81}[stable];
  a.metrics.voicedSeconds = voiced; a.metrics.range.stableHigh = {note:stable, cents:midi * 100};
  return {id:'t' + (++seq), songId:'s1', a, date, created:kst(date, time), ok};
};
const get = {into:t => t.a.metrics.intonation.meanAbsCents, stable:t => t.a.metrics.range.stableHigh.cents};

test('모드: 모두 · 하루 평균 · 신뢰도 높은 것 · 가장 좋은 것, 모르는 값은 모두', () => {
  assert.deepEqual(G.SAME_DAY, [['all', '모두'], ['average', '하루 평균'], ['reliable', '신뢰도 높은 것'], ['best', '가장 좋은 것']]);
  assert.deepEqual(['all', 'average', 'reliable', 'best', 'x', undefined, null].map(G.sameDayMode), ['all', 'average', 'reliable', 'best', 'all', 'all', 'all']);
  assert.equal(G.SAME_DAY_NOTE.best, '하루에 여러 번 부를수록 가장 좋은 값은 좋아지기 쉬워요. 날끼리 공평하게 보려면 하루 평균이 좋아요.');
});

test('days: the takes of a song by day, oldest first; reliable ones apart; a take without a date is its own day', () => {
  const a = take('2026-11-13', '10:00'), b = take('2026-11-13', '09:00', {ok:false}), c = take('2026-11-10', '20:00'), d = take('', '00:00'), e = take('', '00:00');
  const list = G.days([a, b, c, d, e]);
  assert.deepEqual(list.map(x => [x.date, x.takes.map(t => t.id), x.reliable.map(t => t.id)]), [['', [d.id], [d.id]], ['', [e.id], [e.id]], ['2026-11-10', [c.id], [c.id]], ['2026-11-13', [b.id, a.id], [a.id]]]);
  assert.deepEqual(G.days([]), []);
});

test('dayValue (chart): each mode on a day of four takes; unreliable takes never enter a day value', () => {
  const t = [take('2026-11-13', '09:00', {into:30, stable:'D5', conf:.82}), take('2026-11-13', '10:00', {into:18, stable:'G5', conf:.97}),
    take('2026-11-13', '11:00', {into:12, stable:'E5', conf:.9}), take('2026-11-13', '12:00', {into:5, stable:'A5', conf:.99, ok:false})];   // the last one is unreliable
  const day = G.days(t)[0], v = (mode, opt) => { const r = G.dayValue(day, mode, opt); return [r.value, r.basis, r.used?.id || null, r.n, r.count]; };
  // 음정 정확도 (lower is better): mean of the three reliable takes (33, 21, 15 → 23); the unreliable 8 is nowhere.
  assert.deepEqual(v('average', {get:get.into, better:-1}), [23, 'mean', null, 4, 3]);
  assert.deepEqual(v('reliable', {get:get.into, better:-1}), [21, 'reliable', t[1].id, 4, 3]);        // pitch confidence .97
  assert.deepEqual(v('best', {get:get.into, better:-1}), [15, 'best', t[2].id, 4, 3]);
  // 안정 최고음 (a note): 하루 평균 is the median note (D5, E5, G5 → E5), 가장 좋은 것 the highest reliable one (G5, not the unreliable A5).
  assert.deepEqual(v('average', {get:get.stable, better:1, note:true}), [7600, 'median', null, 4, 3]);
  assert.deepEqual(v('best', {get:get.stable, better:1, note:true}), [7900, 'best', t[1].id, 4, 3]);
  assert.deepEqual(v('reliable', {get:get.stable, better:1, note:true}), [7900, 'reliable', t[1].id, 4, 3]);
  // An even number of notes: the median is between the two middle ones (rounded to a cent).
  assert.equal(G.dayValue(G.days(t.slice(0, 2))[0], 'average', {get:get.stable, note:true}).value, 7650);
  // 내 만족도 is not a measurement: every take counts (all:true).
  const rated = t.map((x, i) => ({...x, rating:[3, 5, null, 4][i]}));
  assert.deepEqual(G.dayValue(G.days(rated)[0], 'average', {get:x => x.rating ?? null, all:true}).value, 4);
  assert.deepEqual(G.dayValue(G.days(rated)[0], 'best', {get:x => x.rating ?? null, all:true}).value, 5);
});

test('dayValue: ties, single-take days, and days with no reliable take', () => {
  // Ties in pitch confidence → more voiced seconds; still tied → the later take.
  const tie = [take('2026-11-13', '09:00', {into:30, conf:.9, voiced:40}), take('2026-11-13', '10:00', {into:20, conf:.9, voiced:80}), take('2026-11-13', '11:00', {into:10, conf:.9, voiced:80})];
  assert.equal(G.mostReliable(tie).id, tie[2].id); assert.equal(G.mostReliable(tie.slice(0, 2)).id, tie[1].id);
  assert.equal(G.dayValue(G.days(tie)[0], 'reliable', {get:get.into, better:-1}).used.id, tie[2].id);
  // Two takes with the same best value: the more reliable one is named.
  const same = [take('2026-11-13', '09:00', {into:10, conf:.99}), take('2026-11-13', '10:00', {into:10, conf:.85})];
  assert.equal(G.dayValue(G.days(same)[0], 'best', {get:get.into, better:-1}).used.id, same[0].id);
  // One reliable take: that take, whatever the mode.
  const one = [take('2026-11-13', '09:00', {into:30}), take('2026-11-13', '10:00', {into:5, ok:false})];
  for (const mode of ['average', 'reliable', 'best']) assert.deepEqual([G.dayValue(G.days(one)[0], mode, {get:get.into, better:-1}).value, G.dayValue(G.days(one)[0], mode, {get:get.into}).basis], [33, 'take'], mode);
  // No reliable take: the latest take as it is, marked — it is not a day value. No value at all: none.
  const none = [take('2026-11-13', '09:00', {into:30, ok:false}), take('2026-11-13', '10:00', {into:5, ok:false})];
  const r = G.dayValue(G.days(none)[0], 'average', {get:get.into, better:-1});
  assert.deepEqual([r.value, r.basis, r.used.id, r.count], [8, 'unreliable', none[1].id, 0]);
  assert.deepEqual(G.dayValue(G.days(none)[0], 'best', {get:() => null}), {value:null, basis:'none', used:null, n:2, count:0});
});

test('dayTakes (reports): one take per day for a measure; 모두 is the list itself; nothing is changed', () => {
  const t = [take('2026-11-01', '20:00', {into:40}),
    take('2026-11-13', '09:00', {into:30, wob:8, stable:'D5', conf:.82, longer:.9}), take('2026-11-13', '10:00', {into:18, wob:14, stable:'G5', conf:.97}), take('2026-11-13', '11:00', {into:12, wob:11, stable:'E5', conf:.9}),
    take('2026-11-13', '12:00', {into:5, stable:'A5', conf:.99, ok:false}),
    take('2026-11-14', '09:00', {into:9, ok:false}), take('2026-11-14', '10:00', {into:7, ok:false})];
  const before = JSON.stringify(t);
  assert.equal(G.dayTakes(t, 'all', 'intonation'), t); assert.equal(G.dayTakes(t, 'nonsense', 'intonation'), t);
  const ids = (mode, id) => G.dayTakes(t, mode, id).map(x => [x.id, x.day.basis, x.ok]);
  // 신뢰도 높은 것: the same take for every measure. The single-take day is that take; the day with no reliable take stays unreliable.
  for (const id of ['intonation', 'stability', 'range', 'phrase', 'high', 'passaggio']) assert.deepEqual(ids('reliable', id), [[t[0].id, 'take', true], [t[2].id, 'reliable', true], [t[6].id, 'unreliable', false]], id);
  // 가장 좋은 것: per measure — lowest 음정 오차, lowest 흔들림, highest 안정 최고음, longest 프레이즈 (never the unreliable take).
  assert.deepEqual([ids('best', 'intonation')[1], ids('best', 'stability')[1], ids('best', 'range')[1], ids('best', 'phrase')[1]],
    [[t[3].id, 'best', true], [t[1].id, 'best', true], [t[2].id, 'best', true], [t[1].id, 'best', true]]);
  assert.deepEqual(ids('best', 'passaggio')[1], [t[2].id, 'reliable', true]);            // no single number to be best at: the most reliable take
  // 하루 평균: a day take whose values are the day's means (최고음: median); measures that cannot be averaged use the most reliable take.
  const avg = G.dayTakes(t, 'average', 'intonation')[1];
  assert.deepEqual([avg.id, avg.date, avg.ok, avg.day, avg.created], ['day:2026-11-13', '2026-11-13', true, {n:4, reliable:3, basis:'mean', ids:[t[1].id, t[2].id, t[3].id]}, t[3].created]);
  assert.deepEqual([avg.a.v, avg.a.metrics.intonation.meanAbsCents, avg.a.metrics.intonation.notes, avg.a.metrics.stability.wobbleCents, avg.a.metrics.range.stableHigh, avg.a.dayAverage, avg.a.confidence.pitchConfidence],
    [2, 23, 120, 12, {note:'E5', cents:7600}, {n:3}, .897]);
  assert.equal(G.hasDetail(avg.a), false);                                               // no phrase rows: never matched phrase by phrase
  assert.deepEqual(ids('average', 'phrase')[1], [t[2].id, 'reliable', true]); assert.deepEqual(ids('average', 'high')[1], [t[2].id, 'reliable', true]);
  assert.deepEqual(ids('average', 'range')[1].slice(0, 2), ['day:2026-11-13', 'mean']);
  assert.equal(JSON.stringify(t), before);
});

test('songReport {sameDay}: the default is 모두 (unchanged); each mode compares first and latest DAY', () => {
  const t = [take('2026-10-01', '09:00', {into:40, conf:.85}), take('2026-10-01', '10:00', {into:30, conf:.95}), take('2026-10-01', '11:00', {into:20, conf:.9}),
    take('2026-11-13', '09:00', {into:26, conf:.82}), take('2026-11-13', '10:00', {into:8, conf:.9}), take('2026-11-13', '11:00', {into:14, conf:.97}), take('2026-11-13', '12:00', {into:2, ok:false})];
  assert.deepEqual(G.songReport(t), G.songReport(t, {sameDay:'all'}));
  // 모두: the first take of the first day against the last RELIABLE take of the last day (same phrases compared).
  const all = G.songReport(t).intonation;
  assert.deepEqual([all.firstId, all.lastId, all.basis, all.whole], [t[0].id, t[5].id, 'phrases', {before:43, after:17}]);
  // 신뢰도 높은 것: the most reliable take of each day.
  const rel = G.songReport(t, {sameDay:'reliable'}).intonation;
  assert.deepEqual([rel.firstId, rel.lastId, rel.whole, rel.state], [t[1].id, t[5].id, {before:33, after:17}, 'better']);
  // 가장 좋은 것: the best take of each day for that measure.
  const best = G.songReport(t, {sameDay:'best'}).intonation;
  assert.deepEqual([best.firstId, best.lastId, best.whole], [t[2].id, t[4].id, {before:23, after:11}]);
  // 하루 평균: the days' means (33 → 19), said as its basis with the number of takes behind each side.
  const avg = G.songReport(t, {sameDay:'average'});
  assert.deepEqual([avg.intonation.before, avg.intonation.after, avg.intonation.basis, avg.intonation.dayCounts, avg.intonation.state, avg.intonation.firstId, avg.intonation.lastId],
    [33, 19, 'day-mean', [3, 3], 'better', 'day:2026-10-01', 'day:2026-11-13']);
  assert.equal(G.basisText(avg.intonation), '하루 평균끼리 비교 · 녹음 전체 값 (녹음 3개 → 3개)');
  assert.equal(G.changeText(avg.intonation), '±33 cent → ±19 cent');
  assert.equal(avg.range.basis, 'day-mean'); assert.equal(G.basisText(avg.range), '그날 녹음의 중앙값끼리 비교 (녹음 3개 → 3개)');
  // …and what cannot be averaged (같은 프레이즈 호흡 · 고음 구간) is compared on each day's most reliable take, phrase by phrase.
  assert.deepEqual([avg.phrase.firstId, avg.phrase.lastId, avg.phrase.basis], [t[1].id, t[5].id, 'phrases']);
  // The unreliable 2-cent take is in none of them.
  for (const mode of ['average', 'reliable', 'best']) assert.equal(JSON.stringify(G.songReport(t, {sameDay:mode})).includes(t[6].id), false, mode);
  // A day with one take is the same in every mode; a day with no reliable take keeps the comparison on hold, as now.
  const single = [take('2026-10-01', '09:00', {into:40}), take('2026-11-13', '09:00', {into:20})];
  for (const mode of ['average', 'reliable', 'best']) assert.deepEqual(G.songReport(single, {sameDay:mode}), G.songReport(single), mode);
  const held = [take('2026-10-01', '09:00', {into:40}), take('2026-11-13', '09:00', {into:20, ok:false}), take('2026-11-13', '10:00', {into:10, ok:false})];
  for (const mode of ['all', 'average', 'reliable', 'best']) assert.deepEqual([G.songReport(held, {sameDay:mode}).intonation.state, G.songReport(held, {sameDay:mode}).intonation.reason], ['hold', 'no-pair'], mode);
});
