// 성장 audit (P1): one place for 판정 보류 reasons, the whole-recording value next to a same-phrase comparison,
// the hold time 고음 안정성 is judged from, and a 성장 hero that never shows one measure as strength and priority.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/growth-metrics-model.js');
const {calculate} = require('../app/overall-growth-model.js');
const W = require('../app/weekly-summary-model.js');

// phrases: [start, dur, midi, intonation, wobble]; bands: [midi, notes, mean held, longest, notes ≥0.5 s, wobble].
const v2 = ({into = 12, whole = into + 3, wob = 8, held = .8, highWob = 10, pitchConfidence = .95} = {}) => ({
  v:2, at:1, metrics:{voicedSeconds:40,
    intonation:{meanAbsCents:whole, within20:80, notes:30}, stability:{wobbleCents:wob + 1, notes:12},
    range:{stableHigh:{note:'F5', cents:7700}, validHigh:{note:'G5', cents:7900}, instantaneous:{note:'C7', cents:9600}, main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
    breath:{phrases:5, medianPhrase:3},
    phrases:{v:1, rows:[[10, 3, 64, into, wob], [15, 2.5, 67, into, wob], [20, 3.5, 69, into, wob], [26, 4, 72, into, wob], [32, 2, 71, into, wob]]},
    pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [67, 4, .6, 1, 3, 6], [74, 3, held, held + .3, 3, highWob]]}},
  confidence:{pitchConfidence, voiceOverMrDb:12}});
const v1 = into => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:into, notes:20}, stability:{wobbleCents:15, notes:6}, breath:{medianPhrase:2.5}}, confidence:{voiceOverMrDb:12}});
const take = (id, date, a, ok = true) => ({id, date, a, ok});
const count = (text, word) => text.split(word).length - 1;

test('판정 보류 wording comes from one place: reasons never repeat the label, holdLine says it exactly once', () => {
  for (const [reason, text] of Object.entries(G.HOLD)) {
    assert.doesNotMatch(text, /판정 보류|보류/, reason + ' reason repeats the label');
    assert.equal(G.holdText(reason), text);
    assert.equal(G.holdLine(reason), '판정 보류 · ' + text);
    assert.equal(count(G.holdLine(reason), '판정 보류'), 1);
  }
  assert.equal(count(G.holdLine('unknown-reason'), '판정 보류'), 1);
  assert.equal(count(G.changeText({id:'intonation', state:'hold', reason:'confidence'}), '판정 보류'), 1);
  assert.equal(count(G.passaggioText({state:'hold', reason:'few-bands'}), '판정 보류'), 1);
  assert.equal(G.stateLabel({state:'hold'}), '판정 보류');
  // 녹음별 변화 (two takes picked by hand): the same reasons as the report, not its own variants.
  const reliable = a => a.confidence?.pitchConfidence !== .1;
  assert.equal(G.pairHold(v1(20), v2(), reliable), 'version-mixed');
  assert.equal(G.pairHold(v2({pitchConfidence:.1}), v2(), reliable), 'confidence');
  assert.equal(G.pairHold(null, v2(), reliable), 'no-data');
  assert.equal(G.pairHold(v2(), v2(), reliable), '');
});

test('a same-phrase comparison also carries the whole-recording values every single-take screen shows', () => {
  const first = take('a', '2026-09-01', v2({into:28, whole:30})), last = take('b', '2026-11-11', v2({into:9, whole:9.5}));
  const x = G.compareMetric('intonation', first, last);
  assert.equal(x.basis, 'phrases');
  assert.deepEqual([x.before, x.after], [28, 9]);                 // the same phrases
  assert.deepEqual(x.whole, {before:30, after:9.5});              // = metrics.intonation.meanAbsCents of each take
  assert.equal(x.whole.after, G.value(last.a, 'intonation'));
  assert.equal(G.basisText(x), '같은 프레이즈 5개 비교 · 녹음 전체로는 ±30 cent → ±9.5 cent');
  // Whole-recording comparison (no matching phrases): one basis, nothing to add.
  const loose = v2({into:9, whole:9.5}); loose.metrics.phrases.rows = [];
  const y = G.compareMetric('intonation', first, take('c', '2026-11-11', loose));
  assert.equal(y.basis, 'whole');
  assert.equal(y.whole, undefined);
  assert.deepEqual([y.before, y.after], [30, 9.5]);
  assert.doesNotMatch(G.basisText(y), /녹음 전체로는/);
});

test('고음 안정성: the hold time the verdict depends on is in the per-song line and in the aggregate', () => {
  const report = G.songReport([take('a', '2026-09-01', v2({held:.99, highWob:4.6})), take('b', '2026-11-11', v2({held:1.2, highWob:4.6}))]);
  assert.equal(report.high.state, 'better');                       // wobble unchanged, held longer
  assert.deepEqual([report.high.before, report.high.after], [4.6, 4.6]);
  assert.match(G.changeText(report.high), /유지 0\.99초 → 1\.2초/);
  assert.equal(G.heldText(.99, 1.2), '유지 0.99초 → 1.2초');
  assert.equal(G.heldText(null, 1.2), '');
  const agg = G.aggregate([{songId:'s1', title:'곡', report}]).find(m => m.id === 'high');
  assert.deepEqual([agg.heldBefore, agg.heldAfter], [.99, 1.2]);
  assert.equal(G.aggregate([{songId:'s1', title:'곡', report}]).find(m => m.id === 'intonation').heldBefore, undefined);
});

test('성장 hero: a measure shown as the strength is never also the priority item', () => {
  const rec = (id, songId, date, a) => ({id, songId, date, analysis:a});
  const items = [
    rec('a1', 's1', '2026-09-01', v2({into:28})), rec('a2', 's1', '2026-11-01', v2({into:9})),    // better
    rec('c1', 's3', '2026-09-02', v2({into:25})), rec('c2', 's3', '2026-11-02', v2({into:12})),   // better
    rec('b1', 's2', '2026-09-03', v2({into:12})), rec('b2', 's2', '2026-11-03', v2({into:24}))];  // worse
  const r = calculate(items, {getDate:m => m.date, valid:() => true, title:id => ({s1:'곡 하나', s2:'곡 둘', s3:'곡 셋'})[id]});
  assert.equal(r.topStrength.id, 'intonation');
  assert.equal(r.topWatch, null);                                   // was: intonation again ("변화가 필요한 곡 1곡")
  assert.deepEqual(r.watchSongs, {id:'intonation', title:'음정 정확도', songs:[{songId:'s2', title:'곡 둘'}]});
  // A measure that is worse overall is still the priority item — and then it is not the strength.
  const worse = calculate([...items.slice(4), rec('d1', 's4', '2026-09-04', v2({into:12, wob:8})), rec('d2', 's4', '2026-11-04', v2({into:24, wob:3}))],
    {getDate:m => m.date, valid:() => true});
  assert.equal(worse.topWatch.id, 'intonation');
  assert.equal(worse.watchSongs, null);
  assert.notEqual(worse.topStrength?.id, worse.topWatch.id);
});

test('weekly summary: each growth line says its basis, and the no-earlier-take reason comes from the model', () => {
  const kst = (date, time) => Date.parse(date + 'T' + time + '+09:00');
  const db = {songs:[{id:'s1', title:'곡 하나'}, {id:'s2', title:'곡 둘'}], practices:[], dailyGoals:[], practicePlans:[], lessons:[], assignments:[], deleted:{}};
  const media = [
    {id:'a', songId:'s1', songTake:true, ok:true, recordedDate:'2026-11-02', created:kst('2026-11-02', '20:00'), analysis:v2({into:13, whole:13.2})},
    {id:'b', songId:'s1', songTake:true, ok:true, recordedDate:'2026-11-11', created:kst('2026-11-11', '20:00'), analysis:v2({into:9.4, whole:9.5})},
    {id:'c', songId:'s2', songTake:true, ok:true, recordedDate:'2026-11-10', created:kst('2026-11-10', '20:00'), analysis:v2({into:10})}];
  const s = W.build(db, media, {today:'2026-11-13'});
  const one = s.growth.items.find(x => x.songId === 's1'), two = s.growth.items.find(x => x.songId === 's2');
  const into = one.lines.find(l => l.id === 'intonation');
  assert.equal(into.text, '±13 cent → ±9.4 cent');
  assert.equal(into.basis, '같은 프레이즈 5개 비교 · 녹음 전체로는 ±13.2 cent → ±9.5 cent');
  assert.equal(two.hold, 'no-earlier');
  assert.equal(two.holdText, G.holdText('no-earlier'));
  assert.equal(count(W.toText(s), '판정 보류'), 1);              // "곡 둘: 판정 보류 · reason" — once
});
