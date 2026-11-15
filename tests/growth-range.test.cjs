// app/growth-range-model.js — 전체 음역 흐름: the month series of 관측 최저음 · 최고음, 주로 부른 음역 and 안정 최고음 from
// the dataset's range selection (app/growth-dataset.js forRange). Node only (pure modules).
// The rules for range are stricter than the verdict rule: clear separation from the accompaniment, no ends on the
// detector's limits, and a note counts only when K recordings of the period reach it.
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

test('a month shows what its recordings share: the note 3 of them reach, 주로 부른 음역 (median), 안정 최고음, its sample', () => {
  const m = model([
    rec('2026-11-02', v2('G3', 'A4', {main:['B3', 'F4'], stable:'G4', voiced:50})),
    rec('2026-11-09', v2('A3', 'B4', {main:['C4', 'G4'], stable:'A4', voiced:70}), {songId:'s2'}),
    rec('2026-11-12', v2('F3', 'A#4', {main:['D4', 'A4'], stable:'A4', voiced:65}))
  ], {today:'2026-11-13'});
  const nov = month(m, '2026-11');
  // K = 3 with three recordings: the highest note all three reach is A4, the lowest all three reach is A3.
  assert.deepEqual([nov.k, nov.low.note, nov.high.note, nov.stable.note], [3, 'A3', 'A4', 'G4']);
  assert.deepEqual([nov.high.beyond, nov.low.beyond], [2, 2]);                           // two recordings went further each way
  assert.deepEqual([nov.main.low.note, nov.main.high.note, nov.main.samples], ['C4', 'G4', 3]);       // the median recording, end by end
  assert.deepEqual({n:nov.n, songs:nov.songs, voicedSeconds:nov.voicedSeconds, enough:nov.enough, empty:nov.empty, byGroup:nov.byGroup},
    {n:3, songs:2, voicedSeconds:185, enough:true, empty:false, byGroup:{song:3, 'voice-check':0, training:0, lesson:0}});
  // Notes are named from the measured cents (rounded to the semitone), never from the 10 ms peak (C8 here).
  assert.equal(R.valuesText(nov), '관측 A3 ~ A4 · 주로 부른 음역 C4 ~ G4 · 안정 최고음 G4');
  assert.equal(R.sampleText(nov), '녹음 3개 (곡 녹음 3) · 2곡 · 목소리 3분 · 3개 이상의 녹음에 나온 음 기준');
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
  assert.equal(R.valuesText(top), '관측 최저음 G3 · 주로 부른 음역 G3 ~ C6');
});

test('rule 3 — repeated, not once: 100 recordings where 4 carry a wrong top; K = max(3, 5 % of the counted recordings)', () => {
  assert.deepEqual([0, 1, 2, 3, 20, 60, 61, 100, 300, 2147].map(R.needOf), [1, 1, 1, 3, 3, 3, 4, 5, 15, 108]);
  const hundred = wrong => Array.from({length:100}, (_, i) => rec('2026-11-' + day(i), i < wrong ? v2('A2', 'A5', {main:['C4', 'A4']}) : v2(i % 2 ? 'G3' : 'A3', i % 3 ? 'D5' : 'C5', {main:['C4', 'A4'], stable:'C5'})));
  const four = month(model(hundred(4)), '2026-11');
  assert.deepEqual([four.n, four.k, four.high.note, four.low.note, four.high.beyond, four.low.beyond], [100, 5, 'D5', 'G3', 4, 4]);   // four recordings are not enough to move either end
  // Five such takes do reach K (the note is then "repeated"); the old one-recording rule kept A5 from the second take on.
  assert.deepEqual([month(model(hundred(5)), '2026-11').high.note, month(model(hundred(5)), '2026-11').low.note], ['A5', 'A2']);
  assert.deepEqual([month(model(hundred(0)), '2026-11').high.note, month(model(hundred(0)), '2026-11').high.beyond], ['D5', 0]);
  // R.edge on its own: the k-th from the end, ties, too few values.
  assert.deepEqual(R.edge([60, 62, 64, 65, 72], 1, 3), {midi:64, note:'E4', samples:5, beyond:2});
  assert.deepEqual(R.edge([60, 62, 64, 65, 72], -1, 3), {midi:64, note:'E4', samples:5, beyond:2});
  assert.deepEqual(R.edge([60, 60, 60, null], 1, 3), {midi:60, note:'C4', samples:3, beyond:0});
  assert.equal(R.edge([60, 62, null, null], 1, 3), null); assert.equal(R.edge([], 1, 1), null);
  // Fewer than K recordings have that end (the others were on the limit): missing, never taken from fewer.
  const few = month(model([rec('2026-11-01', v2('G3', 'D5')), rec('2026-11-02', v2('G3', 'D5')), rec('2026-11-03', v2('G3', 'C6')), rec('2026-11-04', v2('G3', 'C6'))]), '2026-11');
  assert.deepEqual([few.n, few.k, few.high, few.low.note], [4, 3, null, 'G3']);
  // The all-time summary: K over every counted recording.
  const all = model([...hundred(4), ...Array.from({length:60}, (_, i) => rec('2026-10-' + day(i), v2('G3', 'D5')))]).all;
  assert.deepEqual([all.n, all.k, all.high.note, all.low.note], [160, 8, 'D5', 'G3']);
});

test('안정 최고음 follows the same rule and is never above 관측 최고음', () => {
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
  assert.equal(R.sampleText(nov), '녹음 5개 (곡 녹음 2 · 보이스 체크 1 · 트레이닝 1 · 레슨 1) · 1곡 · 목소리 5분 · 3개 이상의 녹음에 나온 음 기준');
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
  assert.deepEqual(R.read(v2('G3', 'A4', {main:['B3', 'F4'], stable:'G4', voiced:50})), {high:69, low:55, stable:67, mainLow:59, mainHigh:65, dropped:{high:false, low:false, stable:false}, voiced:50, mrRemoved:false, aiSeparated:false});
  const onlyHigh = {v:2, metrics:{voicedSeconds:30, range:{validHigh:{note:'G5', cents:7900}}}, confidence:{pitchConfidence:.9}};
  assert.deepEqual(R.read(onlyHigh), {high:79, low:null, stable:null, mainLow:null, mainHigh:null, dropped:{high:false, low:false, stable:false}, voiced:30, mrRemoved:false, aiSeparated:false});
  const noLow = month(model([rec('2026-11-02', onlyHigh)]), '2026-11');                  // no lowest note measured: none is made up
  assert.deepEqual([noLow.high.note, noLow.low, noLow.main, noLow.stable], ['G5', null, null, null]);
  assert.equal(R.valuesText(noLow), '관측 최고음 G5');
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
  assert.equal(R.changeText(ok.change), '최근 3개월(9월 → 11월) 관측 최고음 A4 → B4 (+2반음) · 관측 최저음 G3 → G3 (같음)');
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
  assert.equal(R.changeText(old.change), '마지막 기록 3개월(2025년 12월 → 2026년 2월) 관측 최고음 A4 → G4 (−2반음) · 관측 최저음 G3 → A3 (+2반음)');
  // No highest note at one end (all on the limit): only the lowest is compared; neither end shared → said, not guessed.
  const partial = model([...three('2026-09', 'G3', 'C6'), ...three('2026-11', 'A3', 'B4')], {today:'2026-11-13'});
  assert.equal(R.changeText(partial.change), '최근 3개월(9월 → 11월) 관측 최저음 G3 → A3 (+2반음)');
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

test('진단 파일: one row per recording of the four kinds — numbers and the decision only, nothing that identifies a recording', () => {
  const media = [
    rec('2026-11-02', v2('G3', 'D5', {main:['C4', 'A4'], stable:'C5', voiced:61.4}), {name:'비밀 제목.m4a', song:'곡 이름'}),
    rec('2026-11-03', v2('D#2', 'C6', {db:5})), rec('2026-11-04', v2('D#2', 'C6', {db:12})), rec('2026-11-05', v2('C3', 'B5', {conf:.3})),
    rec('2026-11-06', null), rec('2026-10-09', v1('C3', 'A5')), rec('', v2('G3', 'D5'), {created:0}),
    rec('2026-11-07', v2('A3', 'E4', {db:null}), {songId:'', origin:'voice-check', recordingCategory:'training', name:'보이스 체크 2026-11-07'}),
    rec('2026-11-08', v2('C3', 'E5'), {songId:'', source:'import', name:'어디에도 없는 파일'})
  ];
  const d = R.diagnosis(range(media), {generatedMonth:'2026-11'});
  assert.deepEqual([d.kind, d.version, d.modelVersion, d.generatedMonth], ['vocalzip-range-diagnosis', 1, R.VERSION, '2026-11']);
  assert.deepEqual(d.detector, {minHz:75, maxHz:1100, floorCents:3837, ceilingCents:8486, lowDroppedAtOrBelow:'D#2', highDroppedAtOrAbove:'C6'});
  assert.deepEqual([d.rules.separationDb, d.rules.minSamples, d.rules.share, d.rules.boundSemitones], [10, 3, .05, 1]);
  assert.equal(d.rows.length, 8);                                                        // the file that belongs nowhere is not a row
  assert.deepEqual(d.counts, {rows:8, counted:3, reasons:{'no-date':1, v1:1, 'no-analysis':1, unreliable:1, 'weak-separation':1}, droppedLow:1, droppedHigh:1, droppedStable:0, neverCounted:{unassigned:1}});
  const KEYS = ['month', 'group', 'version', 'voicedSeconds', 'pitchConfidence', 'voiceOverMrDb', 'aiSeparated', 'mrRemoved', 'lowCents', 'highCents', 'stableHighCents', 'mainLowCents', 'mainHighCents', 'counted', 'reason', 'droppedLow', 'droppedHigh', 'droppedStable'];
  for (const row of d.rows) { assert.deepEqual(Object.keys(row), KEYS); assert.match(row.month, /^(\d{4}-\d{2})?$/); assert.ok(['song', 'voice-check', 'training', 'lesson'].includes(row.group)); }
  assert.deepEqual(d.rows.find(r => r.voicedSeconds === 61), {month:'2026-11', group:'song', version:2, voicedSeconds:61, pitchConfidence:.95, voiceOverMrDb:12, aiSeparated:false, mrRemoved:false,
    lowCents:5507, highCents:7388, stableHighCents:7200, mainLowCents:6000, mainHighCents:6900, counted:true, reason:'', droppedLow:false, droppedHigh:false, droppedStable:false});
  assert.deepEqual(d.rows.filter(r => r.reason === 'weak-separation').map(r => [r.voiceOverMrDb, r.lowCents, r.highCents, r.counted]), [[5, 3907, 8388, false]]);   // the numbers are there to calibrate on
  assert.deepEqual(d.rows.filter(r => r.droppedLow).map(r => [r.counted, r.droppedHigh, r.voiceOverMrDb]), [[true, true, 12]]);
  assert.deepEqual(d.rows.find(r => r.reason === 'no-analysis'), {month:'2026-11', group:'song', version:null, voicedSeconds:null, pitchConfidence:null, voiceOverMrDb:null, aiSeparated:false, mrRemoved:false,
    lowCents:null, highCents:null, stableHighCents:null, mainLowCents:null, mainHighCents:null, counted:false, reason:'no-analysis', droppedLow:false, droppedHigh:false, droppedStable:false});
  assert.equal(d.rows.find(r => r.reason === 'unreliable').pitchConfidence, .3);
  // Nothing that identifies a recording: no id, name, song, date (only months), and the order is not the order of days.
  const text = JSON.stringify(d);
  for (const m of media) { assert.equal(text.includes('"' + m.id + '"'), false, m.id); if (m.recordedDate) assert.equal(text.includes(m.recordedDate), false, m.recordedDate); }
  for (const word of ['비밀 제목', '곡 이름', '보이스 체크 2026', '어디에도 없는', 'songId', 'name', 'created', 'recordedDate', '"id"', '"at"']) assert.equal(text.includes(word), false, word);
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(text), false);
  assert.deepEqual(d.rows.map(r => r.month), d.rows.map(r => r.month).slice().sort());
});

test('a real-like library: 300 recordings a month, 80 % over a loud MR carrying D#2 / C6 — the chart shows about G3 ~ D5', () => {
  const m = R.build(D.build(REAL.MEDIA, REAL.DB, {reliable}).forRange(), {today:'2026-11-13'});
  assert.equal(REAL.MEDIA.length, 900);
  assert.deepEqual(m.months.map(x => [x.month, x.n, x.k, x.low.note, x.high.note, x.stable.note, x.main.low.note + '~' + x.main.high.note]),
    [['2026-09', 60, 3, 'G3', 'D5', 'C5', 'C4~A4'], ['2026-10', 60, 3, 'G3', 'D5', 'C5', 'C4~A4'], ['2026-11', 60, 3, 'G3', 'D5', 'C5', 'C4~A4']]);
  assert.deepEqual([m.all.n, m.all.k, m.all.low.note, m.all.high.note, m.all.stable.note], [180, 9, 'G3', 'D5', 'C5']);
  assert.deepEqual(m.used, {counted:180, total:900}); assert.deepEqual(m.left, {'weak-separation':720});
  assert.deepEqual(m.all.dropped, {low:6, high:6, stable:0});                            // clean takes with an end on the limit: that end only
  for (const x of [...m.months, m.all]) assert.ok(x.stable.midi <= x.high.midi);
  assert.equal(R.changeText(m.change), '최근 3개월(9월 → 11월) 관측 최고음 D5 → D5 (같음) · 관측 최저음 G3 → G3 (같음)');
  // Every one of the 900 passes the verdict rule (`ok`): that rule alone gave D#2 ~ C6 every month.
  assert.equal(D.build(REAL.MEDIA, REAL.DB, {reliable}).forRange().takes.length, 900);
  const naive = REAL.MEDIA.map(x => x.analysis.metrics.range);
  assert.deepEqual([Math.min(...naive.map(g => g.lowCents)), Math.max(...naive.map(g => g.highCents))], [3900, 8400]);
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
  assert.equal(R.valuesText(nov), '관측 최고음 G5 · 주로 부른 음역 C4 ~ D5 · 안정 최고음 F5');
  assert.equal(m.change.state, 'short'); assert.deepEqual(m.change.missing, [{month:'2026-09', n:2}]);
});
