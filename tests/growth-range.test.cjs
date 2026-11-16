// app/growth-range-model.js — 전체 음역 흐름: the month series of 자주 닿은 최저음 · 최고음, 주로 부른 음역 and 안정 최고음
// from the dataset's range selection (app/growth-dataset.js forRange). Node only (pure modules).
// The rules for range are stricter than the verdict rule: clear separation from the accompaniment, no ends on the
// detector's limits, no end an octave or so outside the recording's own main range, no recording whose main range is
// far from the usual one, and a note counts only when a quarter of the period's recordings reach it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const D = require('../app/growth-dataset.js');
const R = require('../app/growth-range-model.js');
const FIX = require('./growth-characterization.fixture.cjs');
const REAL = require('./growth-range-reallike.fixture.cjs');
// The analyser's own check, as the app passes it (app/analysis.js VZ.analysisReliable).
const reliable = a => !!a?.metrics?.voicedSeconds && a.metrics.voicedSeconds >= 10 && (a.confidence?.voiceOverMrDb == null || a.confidence.voiceOverMrDb >= 3) && (a.v < 2 || Number(a.confidence?.pitchConfidence) >= .8);
const {v2, v1, midi, kst} = REAL;
let seq = 0;
const rec = (date, analysis, extra = {}) => ({id:'r' + (++seq), songId:'s1', recordedDate:date, created:date ? kst(date) : 0, type:'audio/mp4', ...(analysis ? {analysis} : {}), ...extra});
const DB = {songs:[{id:'s1', title:'곡 하나'}, {id:'s2', title:'곡 둘'}], lessons:[], practices:[], deleted:{}};
const range = (media, db = DB) => D.build(media, db, {reliable}).forRange();
const model = (media, options = {}, db = DB) => R.build(range(media, db), options);
const month = (m, key) => m.months.find(x => x.month === key);
const day = i => String(1 + i % 28).padStart(2, '0');

test('a month shows what its recordings share: the note enough of them reach, 주로 부른 음역 (median), 안정 최고음, its sample', () => {
  const m = model([
    rec('2026-11-02', v2('G3', 'A4', {main:['B3', 'F4'], stable:'G4', voiced:50})),
    rec('2026-11-09', v2('A3', 'B4', {main:['C4', 'G4'], stable:'A4', voiced:70}), {songId:'s2'}),
    rec('2026-11-12', v2('G#3', 'A#4', {main:['D4', 'A4'], stable:'A4', voiced:65}))
  ], {today:'2026-11-13'});
  const nov = month(m, '2026-11');
  // K = 3 with three recordings: the highest note all three reach is A4, the lowest all three reach is A3.
  assert.deepEqual([nov.k, nov.high.k, nov.low.k, nov.stable.k, nov.low.note, nov.high.note, nov.stable.note], [3, 3, 3, 3, 'A3', 'A4', 'G4']);
  assert.deepEqual([nov.high.beyond, nov.low.beyond], [2, 2]);                           // two recordings went further each way
  assert.deepEqual([nov.main.low.note, nov.main.high.note, nov.main.samples], ['C4', 'G4', 3]);       // the median recording, end by end
  assert.deepEqual({n:nov.n, songs:nov.songs, voicedSeconds:nov.voicedSeconds, enough:nov.enough, empty:nov.empty, byGroup:nov.byGroup},
    {n:3, songs:2, voicedSeconds:185, enough:true, empty:false, byGroup:{song:3, 'voice-check':0, training:0, lesson:0}});
  // Notes are named from the measured cents (rounded to the semitone), never from the 10 ms peak (C8 here).
  assert.equal(R.valuesText(nov), '자주 닿은 음 A3 ~ A4 · 주로 부른 음역 C4 ~ G4 · 안정 최고음 G4');
  assert.equal(R.sampleText(nov), '녹음 3개 (곡 녹음 3) · 2곡 · 목소리 3분 · 최고음 3개 · 최저음 3개 이상의 녹음이 닿은 음');
  assert.equal(JSON.stringify(m).includes('C8'), false);
  // The all-time summary is the same reading over every counted take.
  assert.deepEqual([m.all.low.note, m.all.high.note, m.all.n, m.all.k, m.all.months, m.all.firstDate, m.all.lastDate], ['A3', 'A4', 3, 3, 1, '2026-11-02', '2026-11-12']);
  assert.deepEqual(m.used, {counted:3, total:3});
});

test('rule 1 — separation: a recording counts for range only when the voice is clearly apart from the accompaniment', () => {
  const db = (value, extra = {}) => ({...v2('D#2', 'C6'), confidence:{pitchConfidence:.95, voiceOverMrDb:value, ...extra}});
  // The verdict rule (≥ 3 dB) lets 3–9 dB through; range does not.
  for (const value of [3, 5, 9, 9.9]) { assert.equal(reliable(db(value)), true); assert.deepEqual(R.read(db(value)), {why:'weak-separation'}, String(value)); assert.equal(R.separated(db(value)), false); }
  for (const value of [10, 12, 25, null, undefined]) assert.equal(R.separated(db(value)), true, String(value));   // good, or no accompaniment found on its own
  // Measured on the AI-separated voice (confidence.aiSeparated, worker/separation-worker.mjs): counts whatever the gap says.
  assert.equal(R.separated(db(4, {aiSeparated:{model:'htdemucs'}})), true);
  // Measured after subtracting the MR file: the dB rule on what was left; the loudness flag `separated` is not AI separation.
  assert.equal(R.separated(db(6, {mrRemoved:{trackId:'t', removedDb:9}})), false); assert.equal(R.separated(db(null, {mrRemoved:{trackId:'t', removedDb:9}})), true);
  assert.equal(R.separated(db(7, {separated:true})), false);
  assert.equal(R.RULES.separationDb, 10);
  const weak = extra => rec('2026-11-0' + (1 + seq % 9), {...v2('D#2', 'C6'), confidence:{pitchConfidence:.95, voiceOverMrDb:6, ...extra}});
  const m = model([weak(), weak(), weak(), weak(), rec('2026-11-05', v2('G3', 'D5')), rec('2026-11-06', v2('G3', 'D5')), rec('2026-11-07', v2('A3', 'C5')), weak({aiSeparated:{model:'x'}})]);
  const nov = month(m, '2026-11');
  assert.deepEqual([nov.n, nov.left], [4, {'weak-separation':4}]);
  assert.deepEqual(m.used, {counted:4, total:8});
  assert.equal(R.leftText(nov.left), '뺀 녹음 4개: 반주 구분 약함 4');
  assert.equal(R.LEFT['weak-separation'][0], '반주와 목소리 구분이 약한 녹음 (목소리가 반주보다 10dB 이상 크지 않아요)');
  assert.deepEqual([nov.low.note, nov.high.note], ['A3', 'C5']);                         // the D#2 ~ C6 of the weak ones never shows
  // Only weak recordings: the month is empty — there is no fallback to the weaker rule.
  const none = model([weak(), weak(), weak()]);
  assert.deepEqual([none.empty, none.all.n, none.all.high, none.left, none.used], [true, 0, null, {'weak-separation':3}, {counted:0, total:3}]);
  assert.deepEqual(none.months.map(x => [x.n, x.empty, x.high, x.low, x.main]), [[0, true, null, null, null]]);
});

test('rule 2 — detector limits: an end on the search bound is not a sung note; only that end of that recording is dropped', () => {
  // The bounds are the detector's own: this fails when app/vocal-analysis.js changes them.
  const source = fs.readFileSync(path.join(__dirname, '../app/vocal-analysis.js'), 'utf8');
  const found = /const FMIN = (\d+), FMAX = (\d+)/.exec(source);
  assert.deepEqual([Number(found[1]), Number(found[2])], [R.DETECTOR.minHz, R.DETECTOR.maxHz]);
  assert.deepEqual(R.DETECTOR, {minHz:75, maxHz:1100, floorCents:3837, ceilingCents:8486, floorMidi:38, ceilingMidi:85, lowDropMidi:39, highDropMidi:84});
  const VA = require('../app/vocal-analysis.js');
  assert.equal(Math.round(VA.centsOf(75)), R.DETECTOR.floorCents); assert.equal(Math.round(VA.centsOf(1100)), R.DETECTOR.ceilingCents);
  assert.deepEqual([VA.noteName(R.DETECTOR.lowDropMidi * 100), VA.noteName(R.DETECTOR.highDropMidi * 100)], ['D#2', 'C6']);
  // Low end on the floor: dropped, the high end stays. High end on the ceiling: dropped with its stable note, the low stays.
  const ends = (low, high, stable) => { const r = R.read(v2(low, high, {stable})); return [r.low, r.high, r.stable, r.dropped]; };
  assert.deepEqual(ends('D#2', 'D5', 'C5'), [null, midi('D5'), midi('C5'), {high:false, low:true, stable:false}]);
  assert.deepEqual(ends('D2', 'D5', 'C5')[0], null); assert.deepEqual(ends('E2', 'D5', 'C5')[0], midi('E2'));   // one semitone above the bound's note is kept
  assert.deepEqual(ends('G3', 'C6', 'A5'), [midi('G3'), null, null, {high:true, low:false, stable:false}]);
  assert.deepEqual(ends('G3', 'C#6', 'C#6')[1], null); assert.deepEqual(ends('G3', 'B5', 'B5').slice(0, 3), [midi('G3'), midi('B5'), midi('B5')]);
  assert.deepEqual(ends('D#2', 'C6', 'C6'), [null, null, null, {high:true, low:true, stable:false}]);        // both ends gone: only its main range is used
  // A month: the pinned ends are counted under their own reason and the other ends are used.
  const m = model([rec('2026-11-01', v2('D#2', 'D5')), rec('2026-11-02', v2('D#2', 'D5')), rec('2026-11-03', v2('G3', 'C6')), rec('2026-11-04', v2('A3', 'D5')), rec('2026-11-05', v2('A3', 'D5')), rec('2026-11-06', v2('G3', 'C5'))]);
  const nov = month(m, '2026-11');
  assert.deepEqual([nov.n, nov.dropped, nov.low.note, nov.high.note, nov.low.samples, nov.high.samples], [6, {low:2, high:1, stable:0}, 'A3', 'D5', 4, 5]);
  assert.equal(R.droppedText(nov.dropped), '검출 한계에 걸려 뺀 끝: 최저음 2 · 최고음 1'); assert.equal(R.droppedText({low:0, high:0, stable:0}), '');
  assert.deepEqual(m.all.dropped, nov.dropped);
  // Every high pinned: the month has a lowest note and no highest; nothing is made up for it.
  const top = month(model([1, 2, 3].map(i => rec('2026-11-0' + i, v2('G3', 'C6')))), '2026-11');
  assert.deepEqual([top.high, top.stable, top.low.note, top.n], [null, null, 'G3', 3]);
  assert.equal(R.valuesText(top), '자주 닿은 최저음 G3 · 주로 부른 음역 G3 ~ C6');
});

test('rule 3 — octave-like end: an end more than 6 semitones outside the recording\'s OWN main range is dropped, that end only', () => {
  assert.equal(R.RULES.octaveGapSemitones, 6);
  const up = n => ['A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5'][n], down = n => ['C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3', 'B2', 'A#2'][n];
  const main = ['C4', 'A4'];
  // Every distance from 0 to 14 semitones, each side: up to 6 the end is kept, from 7 it is dropped — and only that end.
  for (let n = 0; n <= 14; n++) {
    const high = R.read(v2('A3', up(n), {main, stable:'A4'})), low = R.read(v2(down(n), 'C5', {main, stable:'A4'})), stable = R.read(v2('A3', 'D5', {main, stable:up(Math.min(n, 5))}));
    assert.deepEqual([high.high, high.low, high.stable, high.octave], [n > 6 ? null : midi(up(n)), midi('A3'), midi('A4'), {high:n > 6, low:false, stable:false}], 'high +' + n);
    assert.deepEqual([low.low, low.high, low.stable, low.octave], [n > 6 ? null : midi(down(n)), midi('C5'), midi('A4'), {high:false, low:n > 6, stable:false}], 'low −' + n);
    assert.equal(stable.stable, midi(up(Math.min(n, 5))));
    for (const r of [high, low]) assert.deepEqual(r.dropped, {high:false, low:false, stable:false});                // not the detector's limit: another reason
  }
  // The stable note on its own: kept while the highest note above it is dropped, dropped with it when it is up there too.
  assert.deepEqual([R.read(v2('A3', 'A5', {main, stable:'C5'})).stable, R.read(v2('A3', 'A5', {main, stable:'C5'})).high], [midi('C5'), null]);
  const both = R.read(v2('A3', 'A5', {main, stable:'G#5'}));
  assert.deepEqual([both.high, both.stable, both.octave], [null, null, {high:true, low:false, stable:true}]);
  // The limit is in cents, "more than 6 semitones": exactly 600 cents is kept, 601 is not.
  const cents = (high, low) => { const a = v2('A3', 'D5', {main, stable:'A4'}); a.metrics.range.highCents = a.metrics.range.validHigh.cents = high; a.metrics.range.lowCents = low; return R.read(a); };
  assert.deepEqual([cents(7500, 5400).octave, cents(7501, 5399).octave], [{high:false, low:false, stable:false}, {high:true, low:true, stable:false}]);
  // The detector's limit comes first (one reason per end); a recording without a main range has nothing to be far from.
  const onLimit = R.read(v2('D#2', 'C6', {main, stable:'B5'}));
  assert.deepEqual([onLimit.dropped, onLimit.octave], [{high:true, low:true, stable:false}, {high:false, low:false, stable:false}]);
  const bare = {v:2, metrics:{voicedSeconds:30, range:{validHigh:{note:'A5', cents:8100}, lowCents:4500, stableHigh:{cents:8100}}}, confidence:{pitchConfidence:.9}};
  assert.deepEqual([R.read(bare).high, R.read(bare).low, R.read(bare).stable, R.read(bare).octave], [81, 45, 81, {high:false, low:false, stable:false}]);
  // A month with the two modes of the real library: 1–5 semitones outside the main range, or an octave or so.
  // 16 of the 40 recordings carry A5 and 12 carry B2 — far more than a quarter, so the 25 % rule alone would show them.
  const bimodal = Array.from({length:40}, (_, i) => rec('2026-11-' + day(i), v2(i % 10 < 3 ? 'B2' : i % 2 ? 'G3' : 'A3', i % 5 < 2 ? 'A5' : i % 3 ? 'D5' : 'C5', {main, stable:i % 5 < 1 ? 'A5' : 'C5'})));
  const nov = month(model(bimodal), '2026-11');
  assert.deepEqual([nov.n, nov.octave, nov.dropped], [40, {low:12, high:16, stable:8}, {low:0, high:0, stable:0}]);
  assert.deepEqual([nov.low.note, nov.high.note, nov.stable.note, nov.low.samples, nov.high.samples, nov.stable.samples], ['G3', 'D5', 'C5', 28, 24, 32]);
  // K comes from the recordings that KEPT that end (24 highs → 6), not from all 40.
  assert.deepEqual([nov.k, nov.high.k, nov.low.k, nov.stable.k], [10, 6, 7, 8]);
  assert.deepEqual([R.edge(bimodal.map(x => midi(x.analysis.metrics.range.high)), 1, 10).note, R.edge(bimodal.map(x => midi(x.analysis.metrics.range.low)), -1, 10).note], ['A5', 'B2']);
  assert.equal(R.octaveText(nov.octave), '한 옥타브쯤 떨어져 잠깐 잡힌 음이라 뺀 끝: 최저음 12 · 최고음 16 · 안정 최고음 8'); assert.equal(R.octaveText({low:0, high:0, stable:0}), '');
  assert.deepEqual(R.OCTAVE, {low:'한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최저음만 뺌', high:'한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최고음만 뺌', stable:'한 옥타브쯤 떨어져 잠깐 잡힌 음 · 안정 최고음만 뺌'});
  assert.equal(JSON.stringify([nov.low, nov.high, nov.stable]).includes('A5'), false);
  // Every recording of a month octave-like at the top: no 최고음 (and no 안정 최고음 without it), the low end stays.
  const top = month(model([1, 2, 3].map(i => rec('2026-11-0' + i, v2('A3', 'A5', {main, stable:'C5'})))), '2026-11');
  assert.deepEqual([top.high, top.stable, top.low.note, top.n, top.octave], [null, null, 'A3', 3, {low:0, high:3, stable:0}]);
});

test('rule 4 — unusual recording: a main range far from the usual one is left out entirely, only with 20+ recordings to tell', () => {
  assert.deepEqual([R.RULES.unusualSemitones, R.RULES.unusualMinRecordings], [9, 20]);
  const usual = n => Array.from({length:n}, (_, i) => rec('2026-11-' + day(i), v2('G3', 'D5', {main:i % 2 ? ['C4', 'A4'] : ['C4', 'A#4'], stable:'C5'})));
  const odd = rec('2026-11-20', v2('E2', 'E4', {main:['F2', 'C4'], stable:'D4'}));          // an octave and a half under: another voice, or shifted
  // 19 recordings (18 + the odd one): too few to know what is usual — the rule is skipped and the odd one counts.
  const few = model([...usual(18), odd]);
  assert.deepEqual([few.usual, few.used, few.left, few.all.n], [null, {counted:19, total:19}, {}, 19]);
  assert.equal(R.usualOf(usual(19).map(x => R.read(x.analysis))), null);
  // 20: the usual main range is the median, end by end, and the odd recording is left out with its reason.
  const m = model([...usual(19), odd]), nov = month(m, '2026-11');
  assert.deepEqual([m.usual.low.note, m.usual.high.note, m.usual.samples], ['C4', 'A#4', 20]);
  assert.deepEqual([m.used, m.left, nov.left, nov.n, m.all.n], [{counted:19, total:20}, {'unusual-range':1}, {'unusual-range':1}, 19, 19]);
  assert.deepEqual([nov.low.note, nov.high.note, nov.main.low.note, nov.main.high.note], ['G3', 'D5', 'C4', 'A#4']);
  assert.equal(m.groups[0].counted, 19);                                                 // the chip says what is really counted
  assert.equal(R.leftText(nov.left), '뺀 녹음 1개: 평소와 다른 음역 1');
  assert.equal(R.LEFT['unusual-range'][0], '주로 부른 음역이 평소와 크게 다른 녹음 — 다른 목소리이거나 옥타브가 통째로 잘못 잡혔을 수 있어요');
  // The limit, in cents from the median (C4 / A4 here): 9 semitones is kept, more is not; low side under, high side over.
  const u = {lowCents:6000, highCents:6900, samples:20}, r = (lowCents, highCents) => ({mainLowCents:lowCents, mainHighCents:highCents});
  assert.deepEqual([R.unusual(r(5100, 6900), u), R.unusual(r(5099, 6900), u), R.unusual(r(6000, 7800), u), R.unusual(r(6000, 7801), u)], [false, true, false, true]);
  assert.deepEqual([R.unusual(r(7500, 6900), u), R.unusual(r(6000, 5000), u), R.unusual(r(null, null), u), R.unusual(r(4000, 9000), null)], [false, false, false, false]);   // a narrow or missing main range is not "far"
  // A high voice is as unusual as a low one.
  const high = model([...usual(25), rec('2026-11-21', v2('A4', 'B5', {main:['C5', 'G#5'], stable:'A5'}))]);
  assert.deepEqual([high.left, high.all.high.note], [{'unusual-range':1}, 'D5']);
  // The usual range is that of the CHOSEN kinds: five lesson recordings of a lower voice are unusual next to 30 songs,
  // and are simply the lesson recordings (too few for the rule) when only lessons are chosen.
  const lessons = Array.from({length:5}, (_, i) => rec('2026-11-0' + (i + 1), v2('E2', 'E4', {main:['F2', 'C4'], stable:'D4'}), {songId:'', source:'lesson', recordingCategory:'lesson'}));
  const mixed = model([...usual(30), ...lessons]);
  assert.deepEqual([mixed.left, mixed.used, mixed.groups.map(g => g.counted), mixed.all.low.note], [{'unusual-range':5}, {counted:30, total:35}, [30, 0, 0, 0], 'G3']);
  const only = model([...usual(30), ...lessons], {groups:['lesson']});
  assert.deepEqual([only.left, only.used, only.usual, only.all.low.note, only.all.high.note, only.groups.map(g => g.counted)], [{}, {counted:5, total:5}, null, 'E2', 'E4', [30, 0, 0, 5]]);
  // Without the rule the odd recordings would be in: the lowest note of the month stays where the usual voice is.
  const july = [...usual(20).map(x => ({...x, recordedDate:'2026-07-' + x.recordedDate.slice(8)})), ...Array.from({length:12}, (_, i) => rec('2026-07-' + day(i), v2('E2', 'E4', {main:['F2', 'C4'], stable:'D4'})))];
  assert.deepEqual([month(model(july), '2026-07').n, month(model(july), '2026-07').low.note, month(model(july), '2026-07').left], [20, 'G3', {'unusual-range':12}]);
});

test('rule 5 — a note many recordings reach, not a few: K = max(3, a quarter of the recordings that kept that end)', () => {
  assert.equal(R.RULES.share, .25);
  assert.deepEqual([0, 1, 2, 3, 12, 13, 20, 60, 100, 2147].map(n => R.needOf(n)), [1, 1, 1, 3, 3, 4, 5, 15, 25, 537]);
  // K of an end: from the recordings that kept it; under 3 counted recordings the extreme is used as it is.
  assert.deepEqual([R.needOf(8, 100), R.needOf(40, 100), R.needOf(2, 10), R.needOf(1, 1), R.needOf(2, 2), R.needOf(0, 5)], [3, 10, 3, 1, 1, 3]);
  // 100 recordings; `wide` of them reach further both ways (E3 ~ E5, inside the first mode of their own main range).
  const hundred = wide => Array.from({length:100}, (_, i) => rec('2026-11-' + day(i), i < wide ? v2('E3', 'E5', {main:['A3', 'A#4'], stable:'D5'}) : v2(i % 2 ? 'G3' : 'A3', i % 3 ? 'D5' : 'C5', {main:['C4', 'A4'], stable:'C5'})));
  const some = month(model(hundred(24)), '2026-11');
  assert.deepEqual([some.n, some.k, some.high.k, some.low.k, some.high.note, some.low.note, some.high.beyond, some.low.beyond], [100, 25, 25, 25, 'D5', 'G3', 24, 24]);   // 24 of 100 are not a quarter
  assert.deepEqual([some.octave, some.left], [{low:0, high:0, stable:0}, {}]);
  // A quarter of them do reach it. (The 5 % rule this replaces moved from the fifth such recording on.)
  assert.deepEqual([month(model(hundred(25)), '2026-11').high.note, month(model(hundred(25)), '2026-11').low.note], ['E5', 'E3']);
  assert.deepEqual([month(model(hundred(5)), '2026-11').high.note, month(model(hundred(5)), '2026-11').low.note], ['D5', 'G3']);
  assert.deepEqual([month(model(hundred(0)), '2026-11').high.note, month(model(hundred(0)), '2026-11').high.beyond], ['D5', 0]);
  // R.edge on its own: the k-th from the end, ties, too few values.
  assert.deepEqual(R.edge([60, 62, 64, 65, 72], 1, 3), {midi:64, note:'E4', samples:5, k:3, beyond:2});
  assert.deepEqual(R.edge([60, 62, 64, 65, 72], -1, 3), {midi:64, note:'E4', samples:5, k:3, beyond:2});
  assert.deepEqual(R.edge([60, 60, 60, null], 1, 3), {midi:60, note:'C4', samples:3, k:3, beyond:0});
  assert.equal(R.edge([60, 62, null, null], 1, 3), null); assert.equal(R.edge([], 1, 1), null);
  // Fewer than K recordings have that end (the others were on the limit): missing, never taken from fewer.
  const few = month(model([rec('2026-11-01', v2('G3', 'D5')), rec('2026-11-02', v2('G3', 'D5')), rec('2026-11-03', v2('G3', 'C6')), rec('2026-11-04', v2('G3', 'C6'))]), '2026-11');
  assert.deepEqual([few.n, few.k, few.high, few.low.note], [4, 3, null, 'G3']);
  // The all-time summary: the same rule over every counted recording.
  const all = model([...hundred(24), ...Array.from({length:60}, (_, i) => rec('2026-10-' + day(i), v2('G3', 'D5')))]).all;
  assert.deepEqual([all.n, all.k, all.high.k, all.high.note, all.low.note], [160, 40, 40, 'D5', 'G3']);
  // Small samples keep their extremes: with one or two recordings nothing can be told apart.
  const two = month(model([rec('2026-11-01', v2('G3', 'A4')), rec('2026-11-02', v2('E3', 'C5'))]), '2026-11');
  assert.deepEqual([two.k, two.high.k, two.high.note, two.low.note, two.enough], [1, 1, 'C5', 'E3', false]);
});

test('안정 최고음 follows the same rule, is shown only with 자주 닿은 최고음 and is never above it', () => {
  // A recording's stable note counts only with its own highest note, and never above it.
  assert.equal(R.read(v2('G3', 'C5', {stable:'D5'})).stable, null);                     // "stable" above the highest held note: not used
  assert.equal(R.read(v2('G3', 'C6', {stable:'A5'})).stable, null);                     // its highest note was on the limit
  assert.equal(R.read(v2('G3', 'D5', {stable:null})).stable, null);
  const sets = [
    [['G3', 'D5', 'D5'], ['G3', 'C5', 'C5'], ['G3', 'D5', 'A4'], ['A3', 'E5', 'E5'], ['A3', 'C6', 'B5'], ['A3', 'C6', 'B5'], ['A3', 'C6', 'B5']],
    [['G3', 'A4', 'A4'], ['G3', 'A4', 'A4'], ['G3', 'A4', 'A4']],
    [['G3', 'F5', 'C5'], ['G3', 'E5', 'E5'], ['G3', 'D5', 'D5'], ['G3', 'C5', 'C5'], ['G3', 'C5', 'B4']]
  ];
  const monthOf = set => month(model(set.map(([low, high, stable], j) => rec('2026-11-0' + (j + 1), v2(low, high, {stable})))), '2026-11');
  for (const [i, set] of sets.entries()) {
    const m = monthOf(set);
    assert.ok(m.stable && m.high, 'set ' + i); assert.ok(m.stable.midi <= m.high.midi, 'set ' + i + ': ' + m.stable.note + ' ≤ ' + m.high.note);
  }
  const first = monthOf(sets[0]);
  assert.deepEqual([first.high.note, first.stable.note, first.dropped.high], ['D5', 'C5', 3]);   // the three B5 "stable" notes went with their C6
  // Fewer than K recordings hold a note stably: no value (the screen leaves the row out), never one above the observed high.
  const none = monthOf([['G3', 'D5', 'D5'], ['G3', 'D5', null], ['G3', 'D5', null]]);
  assert.deepEqual([none.high.note, none.stable], ['D5', null]);
  // Small samples (1–2 recordings) keep their extremes, and the stable note still cannot be above the highest.
  const two = monthOf([['G3', 'A4', 'G4'], ['C3', 'B5', 'A5']]);
  assert.deepEqual([two.k, two.high.note, two.low.note, two.stable.note, two.enough], [1, 'B5', 'C3', 'A5', false]);
  assert.match(R.sampleText(two), /표본 적음$/);
  // Its K comes from the recordings that kept a stable note — not the ones that kept the highest note. Here the four
  // highest notes that are left say C5 while four stable notes of the other recordings say D5: capped, never above.
  const main = ['C4', 'A4'], capped = month(model([...[1, 2, 3, 4].map(i => rec('2026-11-0' + i, v2('A3', 'A5', {main, stable:'D5'}))), ...[5, 6, 7, 8].map(i => rec('2026-11-0' + i, v2('A3', 'C5', {main, stable:'B4'})))]), '2026-11');
  assert.deepEqual([capped.high.note, capped.high.samples, capped.stable.note, capped.stable.samples, capped.stable.capped, capped.octave], ['C5', 4, 'C5', 8, true, {low:0, high:4, stable:0}]);
});

test('gaps: a month without a counted recording is there, empty — never filled in from its neighbours', () => {
  const m = model([rec('2026-08-20', v2('G3', 'A4')), rec('2026-10-03', null), rec('2026-11-09', v2('A3', 'C5'))], {today:'2026-12-02'});
  assert.deepEqual(m.months.map(x => x.month), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);   // to today's month
  for (const key of ['2026-09', '2026-10', '2026-12']) {
    const x = month(m, key);
    assert.deepEqual([x.n, x.empty, x.high, x.low, x.main, x.stable, x.enough], [0, true, null, null, null, null, false], key);
    assert.equal(R.valuesText(x), ''); assert.equal(R.sampleText(x), '');
  }
  assert.deepEqual(month(m, '2026-10').left, {'no-analysis':1});                         // what October left out, and why
  assert.equal(R.leftText(month(m, '2026-10').left), '뺀 녹음 1개: 분석 전 1');
  assert.deepEqual(month(m, '2026-09').left, {});
  // Without today the series ends at the last recording; at most 12 months are on the chart, all of them in months.
  assert.deepEqual(model([rec('2026-08-20', v2('G3', 'A4'))]).months.map(x => x.month), ['2026-08']);
  const long = model([rec('2025-06-01', v2('G3', 'A4')), rec('2026-11-01', v2('G3', 'A4'))]);
  assert.equal(long.months.length, 18); assert.equal(long.shown.length, 12); assert.equal(long.shown[0].month, '2025-12'); assert.equal(long.shown.at(-1).month, '2026-11');
  assert.equal(R.shiftMonth('2026-01', -1), '2025-12'); assert.equal(R.shiftMonth('2026-12', 1), '2027-01');
});

test('groups: 곡 녹음 · 보이스 체크 · 트레이닝 · 레슨, all on by default; turning one off recounts everything', () => {
  const media = [
    rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-03', v2('G3', 'A4')),
    rec('2026-11-04', v2('A3', 'E4', {db:null}), {songId:'', origin:'voice-check', recordingCategory:'training'}),   // sung alone: no accompaniment found
    rec('2026-11-05', v2('F3', 'B4'), {songId:'', recordingCategory:'training'}),
    rec('2026-11-06', v2('E3', 'C5'), {songId:'', source:'lesson', recordingCategory:'lesson'}),
    rec('2026-11-07', v2('C3', 'E5'), {songId:'', source:'import'}),                                    // belongs nowhere
    rec('2026-11-08', v2('C3', 'E5'), {source:'practice-room', recordingCategory:'room'})               // 연습실 submission
  ];
  const all = model(media);
  assert.deepEqual(all.groups, [{id:'song', label:'곡 녹음', on:true, counted:2}, {id:'voice-check', label:'보이스 체크', on:true, counted:1},
    {id:'training', label:'트레이닝', on:true, counted:1}, {id:'lesson', label:'레슨', on:true, counted:1}]);
  const nov = month(all, '2026-11');
  assert.deepEqual([nov.n, nov.k, nov.low.note, nov.high.note], [5, 3, 'G3', 'A4']);     // what three of the five reach
  assert.deepEqual(nov.byGroup, {song:2, 'voice-check':1, training:1, lesson:1});
  assert.equal(R.sampleText(nov), '녹음 5개 (곡 녹음 2 · 보이스 체크 1 · 트레이닝 1 · 레슨 1) · 1곡 · 목소리 5분 · 최고음 3개 · 최저음 3개 이상의 녹음이 닿은 음');
  assert.deepEqual(all.excluded, {unassigned:1, 'practice-room':1});                    // never counted, whatever is chosen
  for (const why of Object.keys(all.excluded)) assert.ok(R.EXCLUDED[why], why);
  // Voice checks off: four recordings are left, and the chips still say how many each kind has.
  const noCheck = model(media, {groups:['song', 'training', 'lesson']});
  assert.deepEqual([month(noCheck, '2026-11').n, month(noCheck, '2026-11').low.note, month(noCheck, '2026-11').high.note], [4, 'G3', 'A4']);
  assert.deepEqual(noCheck.groups.map(g => [g.id, g.on, g.counted]), [['song', true, 2], ['voice-check', false, 1], ['training', true, 1], ['lesson', true, 1]]);
  assert.deepEqual(noCheck.used, {counted:4, total:4});
  const songs = model(media, {groups:['song']});
  assert.deepEqual([songs.all.n, songs.all.low.note, songs.all.high.note, songs.all.enough], [2, 'G3', 'A4', false]);   // two recordings: a small sample, as it is
  // Nothing chosen: no months, no values, and the model says so.
  const none = model(media, {groups:[]});
  assert.deepEqual([none.months.length, none.empty, none.none, none.all.n, none.all.high, none.axis, none.change.state], [0, true, true, 0, null, null, 'none']);
});

test('unreliable and unanalysed recordings are left out with the reason and the month; v1 measures range another way', () => {
  const m = model([
    rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-03', v2('C3', 'B5', {conf:.3})),                    // low pitch confidence
    rec('2026-11-04', v2('C3', 'B5', {voiced:4})),                                                       // 4 s of voice
    rec('2026-11-05', v2('C3', 'B5', {db:1})),                                                           // the MR drowns the voice (verdict rule)
    rec('2026-11-06', null), rec('2026-11-09', v1('C3', 'A5')),
    rec('2026-11-07', v2('G3', 'A4', {extra:{mrRemoved:true}})), rec('2026-11-08', v2('G3', 'A4', {extra:{aiSeparated:true}}))
  ]);
  const nov = month(m, '2026-11');
  assert.deepEqual([nov.n, nov.low.note, nov.high.note], [3, 'G3', 'A4']);              // the C3–B5 of the unreliable ones never shows
  assert.deepEqual(nov.left, {unreliable:3, 'no-analysis':1, v1:1}); assert.deepEqual(m.left, nov.left);
  assert.equal(R.leftText(nov.left), '뺀 녹음 5개: 분석 전 1 · 신뢰도 낮음 3 · 이전 분석(v1) 1');
  assert.deepEqual(m.used, {counted:3, total:8});
  assert.deepEqual([nov.mrRemoved, nov.aiSeparated], [1, 1]);
  assert.match(R.sampleText(nov), /반주를 뺀 뒤 잰 녹음 1개 · AI 분리 후 잰 녹음 1개/);
  for (const why of Object.keys(m.left)) assert.ok(R.LEFT[why], why);
  assert.deepEqual(R.read(v1('C3', 'A5')), {why:'v1'}); assert.deepEqual(R.read(null), {why:'no-analysis'});
  // A reliable v2 analysis in which no note was held long enough has no range to show.
  const bare = {v:2, metrics:{voicedSeconds:30, range:{low:null, high:null, lowCents:null, highCents:null, validHigh:null, stableHigh:null, main:{low:'C4', high:'D4', lowCents:6000, highCents:6200}}}, confidence:{pitchConfidence:.9, voiceOverMrDb:12}};
  assert.deepEqual(R.read(bare), {why:'no-range'});
  // What a v2 analysis is read for: valid low/high, main range, stable high — and nothing when a part is missing.
  assert.deepEqual(R.read(v2('G3', 'A4', {main:['B3', 'F4'], stable:'G4', voiced:50})), {high:69, low:55, stable:67, mainLow:59, mainHigh:65, mainLowCents:5900, mainHighCents:6500, dropped:{high:false, low:false, stable:false}, octave:{high:false, low:false, stable:false}, voiced:50, mrRemoved:false, aiSeparated:false});
  const onlyHigh = {v:2, metrics:{voicedSeconds:30, range:{validHigh:{note:'G5', cents:7900}}}, confidence:{pitchConfidence:.9}};
  assert.deepEqual(R.read(onlyHigh), {high:79, low:null, stable:null, mainLow:null, mainHigh:null, mainLowCents:null, mainHighCents:null, dropped:{high:false, low:false, stable:false}, octave:{high:false, low:false, stable:false}, voiced:30, mrRemoved:false, aiSeparated:false});
  const noLow = month(model([rec('2026-11-02', onlyHigh)]), '2026-11');                  // no lowest note measured: none is made up
  assert.deepEqual([noLow.high.note, noLow.low, noLow.main, noLow.stable], ['G5', null, null, null]);
  assert.equal(R.valuesText(noLow), '자주 닿은 최고음 G5');
});

test('dates: the recorded date, else the Korea day the recording was made; a month ends at midnight in Korea', () => {
  const made = iso => ({recordedDate:'', created:Date.parse(iso)});
  const media = [
    rec('', v2('G3', 'A4'), made('2026-10-31T14:59:59Z')),              // 10/31 23:59 in Korea
    rec('', v2('A3', 'B4'), made('2026-10-31T15:00:00Z')),              // 11/01 00:00 in Korea (still October in UTC and in the US)
    rec('2026-10-05', v2('F3', 'G4'), {created:Date.parse('2026-11-20T03:00:00Z')}),   // the recorded date wins over the save time
    rec('', v2('C3', 'B5'), {created:0})                                // no date at all: in no month, and said
  ];
  const tz = process.env.TZ;
  try {
    for (const zone of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      const m = model(media);
      assert.deepEqual(m.months.map(x => [x.month, x.n]), [['2026-10', 2], ['2026-11', 1]], zone);
      assert.deepEqual([month(m, '2026-10').low.note, month(m, '2026-10').high.note, month(m, '2026-11').high.note], ['F3', 'A4', 'B4'], zone);
      assert.deepEqual(m.left, {'no-date':1}, zone); assert.equal(m.all.n, 3, zone);
    }
  } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
});

test('the plain-words line: first vs last month of the latest 3 months, only when both have 3+ recordings', () => {
  const three = (ym, low, high) => [1, 2, 3].map(d => rec(ym + '-0' + d, v2(low, high)));
  const ok = model([...three('2026-09', 'G3', 'A4'), rec('2026-10-10', v2('C3', 'C5')), ...three('2026-11', 'G3', 'B4')], {today:'2026-11-13'});
  assert.deepEqual(ok.change, {from:'2026-09', to:'2026-11', recent:true, samples:[3, 3], need:3, state:'ok', high:{from:'A4', to:'B4', delta:2}, low:{from:'G3', to:'G3', delta:0}});
  assert.equal(R.changeText(ok.change), '최근 3개월(9월 → 11월) 자주 닿은 최고음 A4 → B4 (+2반음) · 자주 닿은 최저음 G3 → G3 (같음)');
  assert.doesNotMatch(R.changeText(ok.change), /성장|향상|확정|좋아|나빠/);                 // an observation, never a verdict
  // One end short: no comparison, and what is missing.
  const short = model([rec('2026-09-01', v2('G3', 'A4')), ...three('2026-11', 'G3', 'B4')], {today:'2026-11-13'});
  assert.deepEqual([short.change.state, short.change.missing], ['short', [{month:'2026-09', n:1}]]);
  assert.equal(R.changeText(short.change), '표본이 부족해요 · 9월 녹음 1개 · 한 달에 3개부터 비교해요');
  const fresh = model([...three('2026-11', 'G3', 'B4').slice(0, 2)], {today:'2026-11-13'});
  assert.deepEqual(fresh.change.missing, [{month:'2026-09', n:0}, {month:'2026-11', n:2}]);
  assert.equal(R.changeText(fresh.change), '표본이 부족해요 · 9월 녹음 없음, 11월 녹음 2개 · 한 달에 3개부터 비교해요');
  assert.equal(R.changeText(model([]).change), '아직 음역을 셀 수 있는 녹음이 없어요.'); assert.equal(model([]).change.state, 'none');
  // The window ends at the newest month WITH a recording; when that is long ago it is not called "최근".
  const old = model([...three('2025-12', 'G3', 'A4'), ...three('2026-02', 'A3', 'G4')], {today:'2026-11-13'});
  assert.equal(R.changeText(old.change), '마지막 기록 3개월(2025년 12월 → 2026년 2월) 자주 닿은 최고음 A4 → G4 (−2반음) · 자주 닿은 최저음 G3 → A3 (+2반음)');
  // No highest note at one end (all on the limit): only the lowest is compared; neither end shared → said, not guessed.
  const partial = model([...three('2026-09', 'G3', 'C6'), ...three('2026-11', 'A3', 'B4')], {today:'2026-11-13'});
  assert.equal(R.changeText(partial.change), '최근 3개월(9월 → 11월) 자주 닿은 최저음 G3 → A3 (+2반음)');
  const unshared = model([...three('2026-09', 'D#2', 'C6'), ...three('2026-11', 'A3', 'B4')], {today:'2026-11-13'});
  assert.deepEqual([unshared.change.state, unshared.change.unshared], ['short', true]);
  assert.equal(R.changeText(unshared.change), '표본이 부족해요 · 두 달 모두에서 여러 녹음에 함께 나온 최고음·최저음이 아직 없어요');
});

test('the note axis covers every value on the chart with a few round ticks', () => {
  const m = model([rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-05', v2('G3', 'A#4')), rec('2026-11-09', v2('G3', 'B5'))]);
  assert.deepEqual([m.axis.min, m.axis.max], [54, 71]);                                  // G3 − 1 … A#4 (main range) + 1: the single B5 is not on the chart
  assert.deepEqual(m.axis.ticks.map(t => t.note), ['F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4']);
  assert.ok(m.axis.ticks.length <= 7);
  assert.equal(model([]).axis, null);
});

test('진단 파일 (version 2): one row per recording of the four kinds — numbers and the decision only, nothing that identifies a recording', () => {
  const media = [
    rec('2026-11-02', v2('G3', 'D5', {main:['C4', 'A4'], stable:'C5', voiced:61.4}), {name:'비밀 제목.m4a', song:'곡 이름'}),
    rec('2026-11-03', v2('D#2', 'C6', {db:5})), rec('2026-11-04', v2('D#2', 'C6', {db:12})), rec('2026-11-05', v2('C3', 'B5', {conf:.3})),
    rec('2026-11-06', null), rec('2026-10-09', v1('C3', 'A5')), rec('', v2('G3', 'D5'), {created:0}),
    rec('2026-11-07', v2('A3', 'E4', {db:null}), {songId:'', origin:'voice-check', recordingCategory:'training', name:'보이스 체크 2026-11-07'}),
    rec('2026-11-08', v2('C3', 'E5'), {songId:'', source:'import', name:'어디에도 없는 파일'}),
    rec('2026-11-09', v2('B2', 'A5', {main:['C4', 'A4'], stable:'G#5', voiced:33}))                     // both ends and the stable note an octave or so away
  ];
  const d = R.diagnosis(range(media), {generatedMonth:'2026-11'});
  assert.deepEqual([d.kind, d.version, d.modelVersion, d.generatedMonth], ['vocalzip-range-diagnosis', 2, R.VERSION, '2026-11']);
  assert.deepEqual(d.detector, {minHz:75, maxHz:1100, floorCents:3837, ceilingCents:8486, lowDroppedAtOrBelow:'D#2', highDroppedAtOrAbove:'C6'});
  // The constants of every rule travel with the file (the new ones: a quarter, the octave gap, the unusual main range).
  assert.deepEqual([d.rules.separationDb, d.rules.minSamples, d.rules.share, d.rules.boundSemitones, d.rules.octaveGapSemitones, d.rules.unusualSemitones, d.rules.unusualMinRecordings, d.rules.usualMainLowCents, d.rules.usualMainHighCents], [10, 3, .25, 1, 6, 9, 20, null, null]);
  assert.equal(d.rows.length, 9);                                                        // the file that belongs nowhere is not a row
  assert.deepEqual(d.counts, {rows:9, counted:4, reasons:{'no-date':1, v1:1, 'no-analysis':1, unreliable:1, 'weak-separation':1}, droppedLow:1, droppedHigh:1, droppedStable:0, octaveLow:1, octaveHigh:1, octaveStable:1, neverCounted:{unassigned:1}});
  const KEYS = ['month', 'group', 'version', 'voicedSeconds', 'pitchConfidence', 'voiceOverMrDb', 'aiSeparated', 'mrRemoved', 'lowCents', 'highCents', 'stableHighCents', 'mainLowCents', 'mainHighCents', 'counted', 'reason', 'droppedLow', 'droppedHigh', 'droppedStable',
    'octaveLow', 'octaveHigh', 'octaveStable', 'unusual'];
  for (const row of d.rows) { assert.deepEqual(Object.keys(row), KEYS); assert.match(row.month, /^(\d{4}-\d{2})?$/); assert.ok(['song', 'voice-check', 'training', 'lesson'].includes(row.group)); }
  assert.deepEqual(d.rows.find(r => r.voicedSeconds === 61), {month:'2026-11', group:'song', version:2, voicedSeconds:61, pitchConfidence:.95, voiceOverMrDb:12, aiSeparated:false, mrRemoved:false,
    lowCents:5507, highCents:7388, stableHighCents:7200, mainLowCents:6000, mainHighCents:6900, counted:true, reason:'', droppedLow:false, droppedHigh:false, droppedStable:false, octaveLow:false, octaveHigh:false, octaveStable:false, unusual:false});
  assert.deepEqual(d.rows.find(r => r.voicedSeconds === 33), {month:'2026-11', group:'song', version:2, voicedSeconds:33, pitchConfidence:.95, voiceOverMrDb:12, aiSeparated:false, mrRemoved:false,
    lowCents:4707, highCents:8088, stableHighCents:8000, mainLowCents:6000, mainHighCents:6900, counted:true, reason:'', droppedLow:false, droppedHigh:false, droppedStable:false, octaveLow:true, octaveHigh:true, octaveStable:true, unusual:false});
  assert.deepEqual(d.rows.filter(r => r.reason === 'weak-separation').map(r => [r.voiceOverMrDb, r.lowCents, r.highCents, r.counted]), [[5, 3907, 8388, false]]);   // the numbers are there to calibrate on
  assert.deepEqual(d.rows.filter(r => r.droppedLow).map(r => [r.counted, r.droppedHigh, r.voiceOverMrDb, r.octaveHigh]), [[true, true, 12, false]]);
  assert.deepEqual(d.rows.find(r => r.reason === 'no-analysis'), {month:'2026-11', group:'song', version:null, voicedSeconds:null, pitchConfidence:null, voiceOverMrDb:null, aiSeparated:false, mrRemoved:false,
    lowCents:null, highCents:null, stableHighCents:null, mainLowCents:null, mainHighCents:null, counted:false, reason:'no-analysis', droppedLow:false, droppedHigh:false, droppedStable:false, octaveLow:false, octaveHigh:false, octaveStable:false, unusual:false});
  assert.equal(d.rows.find(r => r.reason === 'unreliable').pitchConfidence, .3);
  // Nothing that identifies a recording: no id, name, song, date (only months), and the order is not the order of days.
  const text = JSON.stringify(d);
  for (const m of media) { assert.equal(text.includes('"' + m.id + '"'), false, m.id); if (m.recordedDate) assert.equal(text.includes(m.recordedDate), false, m.recordedDate); }
  for (const word of ['비밀 제목', '곡 이름', '보이스 체크 2026', '어디에도 없는', 'songId', 'name', 'created', 'recordedDate', '"id"', '"at"']) assert.equal(text.includes(word), false, word);
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(text), false);
  assert.deepEqual(d.rows.map(r => r.month), d.rows.map(r => r.month).slice().sort());
  // With 20+ recordings the unusual one is marked, not counted, and the usual main range it was held against is in the file.
  const many = [...Array.from({length:24}, (_, i) => rec('2026-11-' + day(i), v2('G3', 'D5', {main:['C4', 'A4'], stable:'C5'}))), rec('2026-11-20', v2('E2', 'E4', {main:['F2', 'C4'], stable:'D4', voiced:44}))];
  const big = R.diagnosis(range(many), {generatedMonth:'2026-11'});
  assert.deepEqual([big.counts.rows, big.counts.counted, big.counts.reasons, big.rules.usualMainLowCents, big.rules.usualMainHighCents], [25, 24, {'unusual-range':1}, 6000, 6900]);
  assert.deepEqual(big.rows.filter(r => r.unusual).map(r => [r.voicedSeconds, r.counted, r.reason, r.mainLowCents, r.mainHighCents]), [[44, false, 'unusual-range', 4100, 6000]]);
  // The file and the screen agree on what is counted.
  assert.equal(big.counts.counted, model(many).used.counted);
});

test('a real-like library: half of the clean recordings carry an octave-like end — the chart still shows about G3 ~ C5…D5', () => {
  const ds = D.build(REAL.MEDIA, REAL.DB, {reliable}).forRange(), m = R.build(ds, {today:'2026-11-13'});
  assert.equal(REAL.MEDIA.length, 450);
  // The usual top rises a semitone a month; the octave-away A5 / A#5 and A#2 / B2 are nowhere.
  assert.deepEqual(m.months.map(x => [x.month, x.n, x.low.note, x.high.note, x.stable.note, x.main.low.note + '~' + x.main.high.note]),
    [['2026-09', 133, 'G3', 'C5', 'B4', 'C4~A#4'], ['2026-10', 133, 'G3', 'C#5', 'C5', 'C4~A#4'], ['2026-11', 133, 'G3', 'D5', 'C#5', 'C4~A#4']]);
  assert.deepEqual(m.months.map(x => [x.high.k, x.low.k, x.stable.k, x.high.samples, x.low.samples, x.stable.samples]), Array(3).fill([23, 23, 30, 92, 91, 119]));
  assert.deepEqual([m.all.n, m.all.low.note, m.all.high.note, m.all.stable.note, m.all.high.k], [399, 'G3', 'D5', 'C5', 69]);
  assert.deepEqual(m.used, {counted:399, total:450}); assert.deepEqual(m.left, {'weak-separation':45, 'unusual-range':6});
  assert.deepEqual([m.all.dropped, m.all.octave], [{low:3, high:3, stable:0}, {low:123, high:120, stable:39}]);   // an end only, the rest of the recording counts
  assert.deepEqual([m.usual.low.note, m.usual.high.note, m.usual.samples], ['B3', 'A4', 405]);
  for (const x of [...m.months, m.all]) assert.ok(x.stable.midi <= x.high.midi);
  assert.equal(R.changeText(m.change), '최근 3개월(9월 → 11월) 자주 닿은 최고음 C5 → D5 (+2반음) · 자주 닿은 최저음 G3 → G3 (같음)');
  // The shape the rules were made for: the distance of the highest note above the take's own main range has two
  // modes with nothing between 6 and 11 semitones, and so has the lowest note below it.
  const clean = ds.takes.map(t => t.a).filter(a => R.separated(a) && a.metrics.range.main.low !== 'F2'), gaps = key => { const out = {}; for (const a of clean) { const g = a.metrics.range, n = Math.round((key === 'high' ? g.highCents - g.main.highCents : g.main.lowCents - g.lowCents) / 100); out[n] = (out[n] || 0) + 1; } return out; };
  assert.deepEqual(gaps('high'), {2:73, 3:92, 4:92, 5:19, 12:120, 14:3}); assert.deepEqual(gaps('low'), {2:45, 3:51, 4:72, 5:105, 13:123, 21:3});
  // Every one of the 450 passes the verdict rule (`ok`). Counting the notes that a quarter of the clean recordings
  // reach WITHOUT the octave rule gives A5 at the top (30 % carry A5 or A#5) and B2 at the bottom.
  assert.equal(ds.takes.length, 450);
  const nov = ds.takes.filter(t => t.date.startsWith('2026-11')).map(t => R.read(t.a)).filter(r => !r.why), raw = REAL.MEDIA.filter(x => x.recordedDate.startsWith('2026-11') && R.separated(x.analysis)).map(x => x.analysis.metrics.range);
  assert.deepEqual([R.edge(raw.map(g => midi(g.high)), 1, R.needOf(nov.length)).note, R.edge(raw.map(g => midi(g.low)), -1, R.needOf(nov.length)).note], ['A5', 'B2']);
});

test('처음·지금: the earliest and the latest window — 3 months with recordings or 30 recordings, whichever comes first', () => {
  const many = (ym, n, low, high, extra = {}) => Array.from({length:n}, (_, i) => rec(ym + '-' + day(i), v2(low, high, {main:['C4', 'A#4'], stable:'A4', ...extra})));
  // Uneven counts over 16 months (two of them empty): 처음 needs three months to get anywhere, 지금 has 35 in its last month alone.
  const media = [...many('2025-08', 2, 'A3', 'A4'), ...many('2025-09', 5, 'A3', 'A4'), /* 2025-10: none */ ...many('2025-11', 40, 'A3', 'B4'), ...many('2025-12', 4, 'C3', 'E5'),
    ...many('2026-03', 6, 'C3', 'E5'), ...many('2026-09', 10, 'G3', 'C5'), ...many('2026-10', 12, 'G3', 'C5'), ...many('2026-11', 35, 'G3', 'D5', {main:['C#4', 'A#4'], stable:'C5'})];
  const c = model(media, {today:'2026-11-13'}).compare;
  assert.deepEqual([c.state, c.dataMonths, c.first.months, c.first.n, c.first.period, c.now.months, c.now.n, c.now.period], ['ok', 8, ['2025-08', '2025-09', '2025-11'], 47, '2025.08–11', ['2026-11'], 35, '2026.11']);
  // Each window by the same rules as a month: K over the window (47 → 12, 35 → 9).
  assert.deepEqual([c.first.k, c.now.k, c.first.low.note, c.first.high.note, c.first.stable.note, c.now.low.note, c.now.high.note, c.now.stable.note], [12, 9, 'A3', 'B4', 'A4', 'G3', 'D5', 'C5']);
  assert.deepEqual(c.rows, [
    {key:'mainLow', label:'주로 부른 음역 아래', first:'C4', now:'C#4', delta:1, missing:''}, {key:'mainHigh', label:'주로 부른 음역 위', first:'A#4', now:'A#4', delta:0, missing:''},
    {key:'low', label:'자주 닿은 최저음', first:'A3', now:'G3', delta:-2, missing:''}, {key:'high', label:'자주 닿은 최고음', first:'B4', now:'D5', delta:3, missing:''},
    {key:'stable', label:'안정 최고음', first:'A4', now:'C5', delta:3, missing:''}]);
  assert.deepEqual(c.rows.map(R.deltaText), ['+1반음', '같음', '−2반음', '+3반음', '+3반음']);
  assert.equal(R.compareText(c), '처음(2025.08–11) → 지금(2026.11) 주로 부른 음역 C4–A#4 → C#4–A#4');
  assert.doesNotMatch(R.compareText(c), /성장|향상|확정|좋아|나빠/);
  assert.deepEqual([c.axis.min, c.axis.max], [54, 75]);                                  // one note axis for both columns: G3 − 1 … D5 + 1
  // The months in between are not part of either side, and nothing is filled in.
  assert.equal([...c.first.months, ...c.now.months].includes('2026-03'), false);
  // 30 recordings come first: with 30+ a month each side is one month, so two months are enough.
  const two = model([...many('2026-10', 31, 'G3', 'C5'), ...many('2026-11', 30, 'G3', 'D5')]).compare;
  assert.deepEqual([two.state, two.first.period, two.now.period, two.first.n, two.now.n], ['ok', '2026.10', '2026.11', 31, 30]);
  // Three months each: six months with recordings, however few.
  const six = model(['2026-01', '2026-02', '2026-04', '2026-08', '2026-10', '2026-11'].flatMap(ym => many(ym, 1, 'G3', 'C5'))).compare;
  assert.deepEqual([six.state, six.first.period, six.first.n, six.now.period, six.now.n, six.first.enough], ['ok', '2026.01–04', 3, '2026.08–11', 3, true]);
  assert.deepEqual([R.periodLabel('2025-11', '2026-01'), R.periodLabel('2026-09', '2026-11'), R.periodLabel('2026-11', '2026-11')], ['2025.11–2026.01', '2026.09–11', '2026.11']);
});

test('처음·지금: windows that would share a month are not compared, and it says what is missing', () => {
  const few = (ym, n = 3) => Array.from({length:n}, (_, i) => rec(ym + '-0' + (i + 1), v2('G3', 'C5')));
  // Four months of three recordings: 처음 = months 1–3, 지금 = months 2–4.
  const four = model(['2026-08', '2026-09', '2026-10', '2026-11'].flatMap(ym => few(ym))).compare;
  assert.deepEqual([four.state, four.dataMonths, four.first.period, four.now.period, four.rows, four.axis], ['short', 4, '2026.08–10', '2026.09–11', undefined, undefined]);
  assert.equal(R.compareText(four), '아직 비교할 만큼 기간이 쌓이지 않았어요 · 처음(2026.08–10)과 지금(2026.09–11) 기간이 겹쳐요 · 녹음이 있는 달이 더 쌓이면 비교할 수 있어요 (지금 4개월)');
  assert.deepEqual(four.need, {months:3, recordings:30});
  // One month, or none.
  const one = model(few('2026-11', 12)).compare;
  assert.deepEqual([one.state, one.dataMonths], ['short', 1]);
  assert.equal(R.compareText(one), '아직 비교할 만큼 기간이 쌓이지 않았어요 · 녹음이 있는 달이 1개뿐이에요');
  assert.deepEqual(model([]).compare, {state:'none', dataMonths:0, need:{months:3, recordings:30}});
  assert.equal(R.compareText(model([]).compare), '아직 음역을 셀 수 있는 녹음이 없어요.');
  // Months whose recordings all fail the range rules are not months with recordings.
  const weak = model([...few('2026-06'), ...['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].flatMap(ym => few(ym).map(m => ({...m, analysis:v2('D#2', 'C6', {db:5})})))]).compare;
  assert.deepEqual([weak.state, weak.dataMonths], ['short', 1]);
});

test('처음·지금: a value one side does not have is "—" with the reason, never taken from fewer recordings; the kinds chosen apply', () => {
  const many = (ym, n, low, high, extra = {}, more = {}) => Array.from({length:n}, (_, i) => rec(ym + '-' + day(i), v2(low, high, extra), more));
  // 처음: every highest note on the detector's ceiling → no 관측 최고음 and no 안정 최고음 there.
  const media = [...many('2026-01', 30, 'G3', 'C6', {main:['C4', 'A4']}), ...many('2026-11', 30, 'A3', 'D5', {main:['C4', 'A4'], stable:'C5'}),
    ...many('2026-11', 30, 'E3', 'C5', {main:['A3', 'G4'], stable:'C5'}, {songId:'', source:'lesson', recordingCategory:'lesson'})];
  const c = model(media, {groups:['song']}).compare;
  assert.deepEqual(c.rows.map(r => [r.key, r.first, r.now, r.delta, r.missing]), [['mainLow', 'C4', 'C4', 0, ''], ['mainHigh', 'A4', 'A4', 0, ''], ['low', 'G3', 'A3', 2, ''], ['high', null, 'D5', null, 'first'], ['stable', null, 'C5', null, 'first']]);
  assert.deepEqual(c.rows.map(R.deltaText), ['같음', '같음', '+2반음', '—', '—']);
  assert.equal(R.missingText(c.rows[3]), '처음 기간에 여러 녹음에 함께 나온 값이 없어요'); assert.equal(R.missingText(c.rows[0]), '');
  assert.equal(R.missingText({missing:'both'}), '두 기간 모두 여러 녹음에 함께 나온 값이 없어요'); assert.equal(R.missingText({missing:'now'}), '지금 기간에 여러 녹음에 함께 나온 값이 없어요');
  assert.equal(R.compareText(c), '처음(2026.01) → 지금(2026.11) 주로 부른 음역 C4–A4 → C4–A4');
  // With the lesson recordings counted too, 지금 is made of 60 recordings and its values move.
  const all = model(media).compare;
  assert.deepEqual([all.now.n, all.now.k, all.now.low.note, all.now.high.note, all.first.n], [60, 15, 'E3', 'D5', 30]);   // a quarter of the 60 reach E3; the top stays D5
  // No main range on one side: the line falls back to the observed range, or says there is nothing to put side by side.
  const bare = (ym, high) => Array.from({length:30}, (_, i) => rec(ym + '-' + day(i), {v:2, metrics:{voicedSeconds:30, range:{validHigh:{note:high, cents:midi(high) * 100}, lowCents:midi('G3') * 100}}, confidence:{pitchConfidence:.9}}));
  assert.equal(R.compareText(model([...bare('2026-01', 'C5'), ...bare('2026-11', 'D5')]).compare), '처음(2026.01) → 지금(2026.11) 자주 닿은 음역 G3–C5 → G3–D5');
  assert.equal(R.compareText(model([...bare('2026-01', 'C6'), ...bare('2026-11', 'D5')]).compare), '처음(2026.01) → 지금(2026.11) 두 기간에 함께 잴 수 있는 음역이 아직 없어요');
});

test('on the characterization data set: what is counted, what is left out, and nothing is changed', () => {
  const media = JSON.parse(JSON.stringify(FIX.MEDIA)), db = JSON.parse(JSON.stringify(FIX.DB)), before = JSON.stringify([media, db]);
  const m = R.build(D.build(media, db, {reliable}).forRange(), {today:'2026-11-13'});
  assert.equal(JSON.stringify([media, db]), before);                                      // pure
  // 26 takes reach the model; the 3 v1 takes (a0, c1, c2) measure range another way. The fixture's voice is 12 dB over the MR.
  assert.deepEqual(m.groups.map(g => [g.id, g.counted]), [['song', 14], ['voice-check', 3], ['training', 4], ['lesson', 2]]);
  assert.equal(m.all.n, 23);
  assert.deepEqual(m.left, {'no-analysis':2, unreliable:2, 'no-date':1, v1:3});
  assert.deepEqual(m.excluded, {unassigned:1, 'practice-room':2, 'song-missing':2, deleted:1});
  assert.equal(m.all.n + Object.values(m.left).reduce((a, b) => a + b, 0) + Object.values(m.excluded).reduce((a, b) => a + b, 0), 37);   // every recording is accounted for
  assert.deepEqual(m.months.map(x => [x.month, x.n]), [['2026-08', 0], ['2026-09', 2], ['2026-10', 6], ['2026-11', 15]]);
  assert.deepEqual(month(m, '2026-08').left, {v1:1});
  // The fixture's analyses have a valid highest note (G5) and a main range, but no lowest note: none is shown.
  const nov = month(m, '2026-11');
  assert.deepEqual([nov.high.note, nov.low, nov.main.low.note, nov.main.high.note, nov.stable.note], ['G5', null, 'C4', 'D5', 'F5']);
  assert.equal(R.valuesText(nov), '자주 닿은 최고음 G5 · 주로 부른 음역 C4 ~ D5 · 안정 최고음 F5');
  assert.equal(m.change.state, 'short'); assert.deepEqual(m.change.missing, [{month:'2026-09', n:2}]);
});
