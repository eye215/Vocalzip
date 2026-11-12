// 성장 리포트 v2 (app/growth-metrics-model.js): separated measures, exact semitones, same-phrase comparison and
// 판정 보류 rules. Synthetic summaries only; one test runs the real analyzer on a synthetic song.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/growth-metrics-model.js');

// A v2 summary with the growth-report detail (phrases + pitch bands).
const v2 = ({into = 12, wob = 8, phrases, bands, stable = 7700, valid = 7900, main = [6000, 7400], pitchConfidence = .95} = {}) => ({
  v:2, at:1, metrics:{voicedSeconds:40,
    intonation:{meanAbsCents:into, within20:80, notes:30}, stability:{wobbleCents:wob, notes:12},
    range:{stableHigh:stable == null ? null : {note:G.noteName(Math.round(stable / 100)), cents:stable}, validHigh:{note:G.noteName(Math.round(valid / 100)), cents:valid},
      instantaneous:{note:'C7', cents:9600}, main:{low:G.noteName(Math.round(main[0] / 100)), high:G.noteName(Math.round(main[1] / 100)), lowCents:main[0], highCents:main[1]}},
    breath:{phrases:5, medianPhrase:3},
    ...(phrases === null ? {} : {phrases:{v:1, rows:phrases || PHRASES({into, wob})}}),
    ...(bands === null ? {} : {pitchBands:{v:1, rows:bands || BANDS()}})},
  confidence:{pitchConfidence, voiceOverMrDb:12}
});
// [start, dur, midi, intonation, wobble]
const PHRASES = ({shift = 0, stretch = 1, longer = 0, into = 12, wob = 8} = {}) => [
  [10, 3, 64, into, wob], [15, 2.5, 67, into, wob], [20, 3.5, 69, into, wob], [26, 4, 72, into, wob], [32, 2, 71, into, wob]
].map(([t, d, m, i, w]) => [Math.round((shift + 10 + (t - 10) * stretch) * 10) / 10, Math.round((d * stretch + longer) * 10) / 10, m, i, w]);
// [midi, notes ≥0.2 s, mean held, longest, notes ≥0.5 s, mean wobble]
const BANDS = ({highWob = 10, highHeld = .8} = {}) => [
  [60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [65, 3, .5, .8, 2, 18], [67, 4, .6, 1, 3, 6],
  [72, 3, highHeld, highHeld + .4, 3, highWob], [74, 2, highHeld, highHeld + .2, 2, highWob]
];
const take = (id, date, a, ok = true) => ({id, date, a, ok});

test('semitone math is exact and uses the named notes', () => {
  assert.equal(G.semitones(8200, 7800), -4);  // A#5 → F#5 = 4 semitones, never "4.5"
  assert.equal(G.semitones(8149, 7851), -2);  // A#5(−51 c) is A5 → G5 (+51 c) is G5
  assert.equal(G.semitones(7700, 7700), 0);
  assert.equal(G.noteName(G.midiOf(8200)), 'A#5');
  assert.equal(G.semitones(null, 7700), null);
});

test('accuracy and stability stay separate and prefer the same phrases', () => {
  const a = v2({into:20, wob:12, phrases:PHRASES({into:20, wob:12})});
  const b = v2({into:30, wob:6, phrases:PHRASES({shift:4, into:11, wob:12})}); // whole-song accuracy worse, same phrases better
  const r = G.comparePair(take('a', '2026-09-01', a), take('b', '2026-11-01', b));
  assert.equal(r.intonation.basis, 'phrases');
  assert.equal(r.intonation.matched, 5);
  assert.equal(r.intonation.before, 20);
  assert.equal(r.intonation.after, 11);
  assert.equal(r.intonation.state, 'better');
  assert.equal(r.stability.state, 'similar'); // 12 → 12 on the same phrases (not the whole-song 12 → 6)
  assert.match(G.basisText(r.intonation), /같은 프레이즈 5개/);
});

test('without matching phrases accuracy falls back to the whole recording (labelled) and breath is withheld', () => {
  const a = v2({into:20}), b = v2({into:12, phrases:[[5, 3, 50, 10, 5], [40, 3, 52, 10, 5], [80, 3, 54, 10, 5]]});
  const r = G.comparePair(take('a', '2026-09-01', a), take('b', '2026-11-01', b));
  assert.equal(r.intonation.basis, 'whole');
  assert.equal(r.intonation.state, 'better');
  assert.equal(r.phrase.state, 'hold');
  assert.equal(r.phrase.reason, 'few-phrases');
  assert.match(G.basisText(r.intonation), /곡 전체/);
});

test('breath compares the same phrases with the tempo corrected, and withholds on a big tempo change', () => {
  const a = v2(), longer = v2({phrases:PHRASES({longer:.6})}), slower = v2({phrases:PHRASES({stretch:1.1})}), dragged = v2({phrases:PHRASES({stretch:1.3})});
  const x = G.compareMetric('phrase', take('a', '2026-09-01', a), take('b', '2026-11-01', longer));
  assert.equal(x.state, 'better'); assert.equal(x.delta, .6); assert.equal(x.matched, 5);
  // Everything 10 % slower: phrases are longer only because of the tempo → similar, not "better breath".
  const y = G.compareMetric('phrase', take('a', '2026-09-01', a), take('b', '2026-11-01', slower));
  assert.equal(y.state, 'similar'); assert.equal(y.tempo, 1.1);
  const z = G.compareMetric('phrase', take('a', '2026-09-01', a), take('b', '2026-11-01', dragged));
  assert.equal(z.state, 'hold'); assert.equal(z.reason, 'tempo');
});

test('a partial take (starts later in the song) still finds the same phrases', () => {
  const full = PHRASES(), part = full.slice(1).map(r => [r[0] - 15 + 2, r[1], r[2], r[3], r[4]]);
  assert.equal(G.matchPhrases(full, part).length, 4);
});

test('range: neutral change in exact semitones from the stable high, never the instant max', () => {
  const a = v2({stable:7700}), b = v2({stable:8100}); // F5 → A5, instant C7 in both
  const r = G.compareMetric('range', take('a', '2026-09-01', a), take('b', '2026-11-01', b), {reference:{high:'G5', highMidi:79}});
  assert.equal(r.state, 'changed');
  assert.equal(r.delta, 4);
  assert.deepEqual(r.vsScore, {scoreHigh:'G5', before:-2, after:2});
  assert.doesNotMatch(G.changeText(r), /C7|좋아|나빠/);
  assert.match(G.changeText(r), /F5 → A5 \(\+4반음\).*실력 판정 아님/);
  const agg = G.aggregate([{songId:'s', report:{range:r}}]).find(x => x.id === 'range');
  assert.equal(agg.better + agg.worse, 0);
  assert.equal(agg.state, 'changed');
  // No stable high → 판정 보류, even with a valid/instant note.
  assert.equal(G.compareMetric('range', take('a', '2026-09-01', a), take('b', '2026-11-01', v2({stable:null}))).reason, 'no-stable');
});

test('a whole-range shift (another key) withholds range and high-note judgements', () => {
  const a = v2({main:[6000, 7400]}), b = v2({main:[6300, 7700], stable:8000});
  assert.equal(G.compareMetric('range', take('a', '2026-09-01', a), take('b', '2026-11-01', b)).reason, 'key-shift');
  assert.equal(G.compareMetric('high', take('a', '2026-09-01', a), take('b', '2026-11-01', b)).reason, 'key-shift');
});

test('high-note stability uses the same zone in both takes, wobble and hold time together', () => {
  const a = v2({bands:BANDS({highWob:14, highHeld:.6})}), b = v2({bands:BANDS({highWob:9, highHeld:.9})});
  const r = G.compareMetric('high', take('a', '2026-09-01', a), take('b', '2026-11-01', b));
  assert.equal(r.state, 'better'); assert.equal(r.zone, 'D5'); assert.equal(r.before, 14); assert.equal(r.after, 9);
  // Steadier but shorter → mixed, never "better".
  const c = v2({bands:BANDS({highWob:9, highHeld:.3})});
  assert.equal(G.compareMetric('high', take('a', '2026-09-01', a), take('c', '2026-11-01', c)).state, 'mixed');
  // A confirmed score range sets the zone (top 3 semitones of the vocal line).
  const s = G.compareMetric('high', take('a', '2026-09-01', a), take('b', '2026-11-01', b), {reference:{high:'D5', highMidi:74}});
  assert.equal(s.zone, 'C5–D5'); assert.equal(s.fromScore, true);
  // Too few held high notes → 판정 보류.
  const thin = v2({bands:[[60, 4, .6, 1, 3, 6], [74, 1, .5, .5, 1, 9]]});
  assert.equal(G.compareMetric('high', take('a', '2026-09-01', thin), take('b', '2026-11-01', thin)).reason, 'few-high');
});

test('passaggio is reference only, with the explicit teacher note', () => {
  const p = G.passaggioOf(v2());
  assert.equal(p.state, 'reference'); assert.equal(p.found, true); assert.equal(p.from, 'F4'); assert.equal(p.wobble, 18);
  assert.match(G.passaggioText(p), /F4 부근/);
  assert.equal(G.PASSAGGIO_NOTE, '음정 데이터만으로 판별 불가, 선생님 판단 참고');
  const r = G.songReport([take('a', '2026-09-01', v2()), take('b', '2026-11-01', v2())]);
  assert.equal(r.passaggio.state, 'reference');
  const agg = G.aggregate([{songId:'s', report:r}]).find(x => x.id === 'passaggio');
  assert.equal(agg.state, 'reference'); assert.equal(agg.better + agg.worse + agg.compared, 0);
  assert.equal(G.passaggioOf(v2({bands:[[60, 2, .5, .6, 2, 5]]})).reason, 'few-bands');
});

test('withheld: low confidence, same day, single take', () => {
  const a = v2({into:30}), b = v2({into:10});
  assert.equal(G.compareMetric('intonation', take('a', '2026-09-01', a), take('b', '2026-11-01', b, false)).reason, 'confidence');
  assert.equal(G.songReport([take('a', '2026-11-01', a), take('b', '2026-11-01', b)]).intonation.reason, 'same-day');
  assert.equal(G.songReport([take('b', '2026-11-01', b)]).intonation.reason, 'no-pair');
  const few = v2(); few.metrics.intonation.notes = 2;
  assert.equal(G.songReport([take('a', '2026-09-01', few), take('b', '2026-11-01', few)]).intonation.reason, 'few-notes');
});

test('v1 stays readable: v1 pairs compare accuracy/stability, v2-only measures skip v1, mixed v1/v2 is withheld', () => {
  const old = {v:1, metrics:{voicedSeconds:30, intonation:{meanAbsCents:27, notes:10}, stability:{wobbleCents:34, notes:4}, range:{highCents:8100, high:'A5'}, breath:{medianPhrase:2.4}}, confidence:{voiceOverMrDb:12}};
  const old2 = {...old, metrics:{...old.metrics, intonation:{meanAbsCents:18, notes:10}, stability:{wobbleCents:23, notes:4}}};
  const r = G.songReport([take('a', '2026-09-01', old), take('b', '2026-11-01', old2)]);
  assert.equal(r.intonation.state, 'better'); assert.equal(r.stability.state, 'better'); assert.equal(r.stability.after, 23);
  assert.equal(r.range.reason, 'v1'); assert.equal(r.phrase.reason, 'v1'); assert.equal(r.high.reason, 'v1');
  assert.equal(G.single(old).range.reason, 'v1');
  // v1 before, v2 after: no before/after across versions.
  const mixed = G.songReport([take('a', '2026-09-01', old), take('b', '2026-11-01', v2({into:5}))]);
  assert.equal(mixed.intonation.state, 'hold'); assert.equal(mixed.intonation.reason, 'version-mixed');
  assert.match(G.holdText('version-mixed'), /분석 버전/);
  // …but an earlier v2 take of the same song is used instead of the v1 one.
  const later = G.songReport([take('a', '2026-08-01', old), take('b', '2026-09-01', v2({into:20})), take('c', '2026-11-01', v2({into:10}))]);
  assert.equal(later.intonation.firstId, 'b'); assert.equal(later.intonation.state, 'better');
  // A v2 summary saved before this update (no phrase/pitch detail) asks for re-analysis for the detail measures.
  const bare = v2({phrases:null, bands:null});
  const re = G.songReport([take('a', '2026-09-01', bare), take('b', '2026-11-01', bare)]);
  assert.equal(re.phrase.reason, 'reanalyze'); assert.equal(re.high.reason, 'reanalyze'); assert.equal(re.intonation.basis, 'whole');
  assert.equal(re.range.state, 'similar'); // range needs only the v2 stable high
});

test('the AI input carries only the allowed keys, withheld measures as unknown, never range/high notes', () => {
  const r = G.songReport([take('a', '2026-09-01', v2({into:20})), take('b', '2026-11-01', v2({into:10, stable:8100}))]);
  const ai = G.aiMetrics(G.aggregate([{songId:'s', report:r}]));
  assert.deepEqual(ai.map(x => x.key), ['intonation', 'stability', 'phrase']);
  assert.ok(ai.every(x => x.title.length <= 32));
  assert.equal(ai[0].state, 'better'); assert.equal(ai[0].improvedSongs, 1);
  const held = G.aiMetrics(G.aggregate([{songId:'s', report:G.songReport([take('a', '2026-11-01', v2())])}]));
  assert.ok(held.every(x => x.state === 'unknown' && x.sharedSongs === 0));
  assert.doesNotMatch(JSON.stringify(ai), /A5|C7|최고음/);
});

test('overall aggregation counts songs, not takes, and keeps holds with their reasons', () => {
  const s1 = G.songReport([take('a', '2026-09-01', v2({into:20})), take('b', '2026-10-01', v2({into:15})), take('c', '2026-11-01', v2({into:10}))]);
  const s2 = G.songReport([take('d', '2026-11-01', v2({into:40}))]);
  const agg = G.aggregate([{songId:'s1', report:s1}, {songId:'s2', report:s2}]).find(x => x.id === 'intonation');
  assert.equal(agg.compared, 1); assert.equal(agg.better, 1); assert.equal(agg.withheld, 1); assert.deepEqual(agg.holds, {'no-pair':1});
  assert.equal(agg.before, 20); assert.equal(agg.after, 10); assert.equal(agg.state, 'better');
});

test('the real analyzer output feeds the model (same synthetic song twice → same phrases found)', () => {
  const A = require('../app/vocal-analysis.js'), {synth} = require('./synth-vocal.cjs');
  const run = detune => { const x = synth({sr:16000, detune}); const r = A.analyze(x.samples || x, 16000); return {v:r.version, metrics:r.metrics, confidence:r.confidence}; };
  const a = run(25), b = run(5);
  assert.ok(G.hasDetail(a) && G.hasDetail(b));
  const r = G.comparePair(take('a', '2026-09-01', a), take('b', '2026-11-01', b));
  assert.equal(r.intonation.basis, 'phrases');
  assert.ok(r.intonation.matched >= 3);
  assert.equal(r.intonation.state, 'better');
  assert.equal(r.phrase.state, 'similar');
  assert.equal(r.range.delta, 0);
});
