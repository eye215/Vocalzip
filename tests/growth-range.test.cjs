// app/growth-range-model.js — 전체 음역 흐름 (성장 2단계): the month series of 관측 최저음 · 최고음, 주로 부른 음역 and
// 안정 최고음 from the dataset's range selection (app/growth-dataset.js forRange). Node only (pure modules).
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../app/growth-dataset.js');
const R = require('../app/growth-range-model.js');
const FIX = require('./growth-characterization.fixture.cjs');
// The analyser's own check, as the app passes it (app/analysis.js VZ.analysisReliable).
const reliable = a => !!a?.metrics?.voicedSeconds && a.metrics.voicedSeconds >= 10 && (a.confidence?.voiceOverMrDb == null || a.confidence.voiceOverMrDb >= 3) && (a.v < 2 || Number(a.confidence?.pitchConfidence) >= .8);
const NOTE = {C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11};
const midi = n => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return NOTE[m[1]] + (Number(m[2]) + 1) * 12; };
/** A v2 analysis as app/vocal-analysis.js rangeOf saves it: low/high = the lowest/highest note held ≥ 0.2 s. */
const v2 = (low, high, {main = [low, high], stable = high, voiced = 60, conf = .95, extra = {}} = {}) => ({v:2, at:1, metrics:{voicedSeconds:voiced,
  range:{low, high, lowCents:midi(low) * 100 + 7, highCents:midi(high) * 100 - 12, validHigh:{note:high, cents:midi(high) * 100 - 12}, ...(stable ? {stableHigh:{note:stable, cents:midi(stable) * 100}} : {stableHigh:null}),
    instantaneous:{note:'C8', cents:10800}, main:{low:main[0], high:main[1], lowCents:midi(main[0]) * 100, highCents:midi(main[1]) * 100, percentiles:[10, 90]}}},
  confidence:{pitchConfidence:conf, voiceOverMrDb:12, ...extra}});
const v1 = (low, high) => ({v:1, at:1, metrics:{voicedSeconds:40, range:{low, high, lowCents:midi(low) * 100, highCents:midi(high) * 100}}, confidence:{voiceOverMrDb:12}});
const kst = (date, time = '20:00') => Date.parse(date + 'T' + time + ':00+09:00');
let seq = 0;
const rec = (date, analysis, extra = {}) => ({id:'r' + (++seq), songId:'s1', recordedDate:date, created:date ? kst(date) : 0, type:'audio/mp4', ...(analysis ? {analysis} : {}), ...extra});
const DB = {songs:[{id:'s1', title:'곡 하나'}, {id:'s2', title:'곡 둘'}], lessons:[], practices:[], deleted:{}};
const range = (media, db = DB) => D.build(media, db, {reliable}).forRange();
const model = (media, options = {}, db = DB) => R.build(range(media, db), options);
const month = (m, key) => m.months.find(x => x.month === key);

test('a month shows what was sung: 관측 최저음 · 최고음, 주로 부른 음역 (median of the recordings), 안정 최고음, and its sample', () => {
  const m = model([
    rec('2026-11-02', v2('G3', 'A4', {main:['B3', 'F4'], stable:'G4', voiced:50})),
    rec('2026-11-09', v2('A3', 'B4', {main:['C4', 'G4'], stable:'A4', voiced:70}), {songId:'s2'}),
    rec('2026-11-12', v2('F3', 'A#4', {main:['D4', 'A4'], stable:'A4', voiced:65}))
  ], {today:'2026-11-13'});
  const nov = month(m, '2026-11');
  assert.deepEqual([nov.low.note, nov.high.note, nov.stable.note], ['F3', 'B4', 'A4']);
  assert.deepEqual([nov.main.low.note, nov.main.high.note, nov.main.samples], ['C4', 'G4', 3]);       // the median recording, end by end
  assert.deepEqual({n:nov.n, songs:nov.songs, voicedSeconds:nov.voicedSeconds, enough:nov.enough, empty:nov.empty, byGroup:nov.byGroup},
    {n:3, songs:2, voicedSeconds:185, enough:true, empty:false, byGroup:{song:3, 'voice-check':0, training:0, lesson:0}});
  assert.equal(nov.high.lone, null); assert.equal(nov.low.lone, null);
  // Notes are named from the measured cents (rounded to the semitone), never from the 10 ms peak (C8 here).
  assert.equal(R.valuesText(nov), '관측 F3 ~ B4 · 주로 부른 음역 C4 ~ G4 · 안정 최고음 A4');
  assert.equal(R.sampleText(nov), '녹음 3개 (곡 녹음 3) · 2곡 · 목소리 3분');
  assert.equal(JSON.stringify(m).includes('C8'), false);
  // The all-time summary is the same reading over every counted take.
  assert.deepEqual([m.all.low.note, m.all.high.note, m.all.n, m.all.months, m.all.firstDate, m.all.lastDate], ['F3', 'B4', 3, 1, '2026-11-02', '2026-11-12']);
});

test('outlier rule: with 3+ recordings one recording 3+ semitones beyond the next does not set the month alone', () => {
  const three = model([rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-05', v2('G3', 'A#4')), rec('2026-11-09', v2('C2', 'C6'))]);
  const nov = month(three, '2026-11');
  assert.deepEqual([nov.high.note, nov.high.lone.note, nov.high.lone.id], ['A#4', 'C6', three.months[0].high.lone.id]);
  assert.deepEqual([nov.low.note, nov.low.lone.note], ['G3', 'C2']);                    // the bottom by the same rule
  assert.match(R.valuesText(nov), /^관측 G3 ~ A#4 · .*한 녹음에서만 나온 음 C6·C2 따로 표시$/);
  // A second recording near it confirms the note: nothing is set aside.
  const confirmed = month(model([rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-05', v2('G3', 'B5')), rec('2026-11-09', v2('G3', 'C6'))]), '2026-11');
  assert.deepEqual([confirmed.high.note, confirmed.high.lone], ['C6', null]);
  // Two semitones beyond is not an outlier (RULES.loneGap = 3).
  const near = month(model([rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-05', v2('G3', 'A4')), rec('2026-11-09', v2('G3', 'B4'))]), '2026-11');
  assert.deepEqual([near.high.note, near.high.lone], ['B4', null]);
  assert.equal(R.RULES.loneGap, 3); assert.equal(R.RULES.minSamples, 3);
  // With 1 or 2 recordings nothing can be told apart: the extreme stays, and the month says its sample is small.
  const two = month(model([rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-09', v2('C2', 'C6'))]), '2026-11');
  assert.deepEqual([two.high.note, two.high.lone, two.low.note, two.enough], ['C6', null, 'C2', false]);
  assert.match(R.sampleText(two), /표본 적음$/);
  // The all-time summary follows the same rule.
  assert.deepEqual([three.all.high.note, three.all.high.lone.note], ['A#4', 'C6']);
  // R.edge on its own: ties and missing values.
  assert.equal(R.edge([{v:null, id:'a'}], 1), null);
  assert.deepEqual(R.edge([{v:60, id:'a'}, {v:60, id:'b'}, {v:60, id:'c'}], 1), {midi:60, note:'C4', samples:3, lone:null});
});

test('gaps: a month without a reliable sample is there, empty — never filled in from its neighbours', () => {
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
    rec('2026-11-04', v2('A3', 'E4'), {songId:'', origin:'voice-check', recordingCategory:'training'}),
    rec('2026-11-05', v2('F3', 'B4'), {songId:'', recordingCategory:'training'}),
    rec('2026-11-06', v2('E3', 'C5'), {songId:'', source:'lesson', recordingCategory:'lesson'}),
    rec('2026-11-07', v2('C3', 'E5'), {songId:'', source:'import'}),                                    // belongs nowhere
    rec('2026-11-08', v2('C3', 'E5'), {source:'practice-room', recordingCategory:'room'})               // 연습실 submission
  ];
  const all = model(media);
  assert.deepEqual(all.groups, [{id:'song', label:'곡 녹음', on:true, counted:2}, {id:'voice-check', label:'보이스 체크', on:true, counted:1},
    {id:'training', label:'트레이닝', on:true, counted:1}, {id:'lesson', label:'레슨', on:true, counted:1}]);
  const nov = month(all, '2026-11');
  assert.deepEqual([nov.n, nov.low.note, nov.high.note], [5, 'E3', 'C5']);
  assert.deepEqual(nov.byGroup, {song:2, 'voice-check':1, training:1, lesson:1});
  assert.equal(R.sampleText(nov), '녹음 5개 (곡 녹음 2 · 보이스 체크 1 · 트레이닝 1 · 레슨 1) · 1곡 · 목소리 5분');
  assert.deepEqual(all.excluded, {unassigned:1, 'practice-room':1});                    // never counted, whatever is chosen
  for (const why of Object.keys(all.excluded)) assert.ok(R.EXCLUDED[why], why);
  // Lessons off: the lesson recording's E3–C5 is gone; the chips still say how many each group has.
  const noLesson = model(media, {groups:['song', 'voice-check', 'training']});
  assert.deepEqual([month(noLesson, '2026-11').n, month(noLesson, '2026-11').low.note, month(noLesson, '2026-11').high.note], [4, 'F3', 'B4']);
  assert.deepEqual(noLesson.groups.map(g => [g.id, g.on, g.counted]), [['song', true, 2], ['voice-check', true, 1], ['training', true, 1], ['lesson', false, 1]]);
  const songs = model(media, {groups:['song']});
  assert.deepEqual([songs.all.n, songs.all.low.note, songs.all.high.note], [2, 'G3', 'A4']);
  // Nothing chosen: no months, no values, and the model says so.
  const none = model(media, {groups:[]});
  assert.deepEqual([none.months.length, none.empty, none.none, none.all.n, none.all.high, none.axis, none.change.state], [0, true, true, 0, null, null, 'none']);
});

test('unreliable and unanalysed recordings are left out, with the reason and the month', () => {
  const m = model([
    rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-03', v2('C3', 'C6', {conf:.3})),                    // low pitch confidence
    rec('2026-11-04', v2('C3', 'C6', {voiced:4})),                                                       // 4 s of voice
    rec('2026-11-05', {...v2('C3', 'C6'), confidence:{pitchConfidence:.95, voiceOverMrDb:1}}),           // the MR drowns the voice
    rec('2026-11-06', null),
    rec('2026-11-07', v2('G3', 'A4', {extra:{mrRemoved:true}})), rec('2026-11-08', v2('G3', 'A4', {extra:{aiSeparated:true}}))
  ]);
  const nov = month(m, '2026-11');
  assert.deepEqual([nov.n, nov.low.note, nov.high.note], [3, 'G3', 'A4']);              // the C3–C6 of the unreliable ones never shows
  assert.deepEqual(nov.left, {unreliable:3, 'no-analysis':1}); assert.deepEqual(m.left, nov.left);
  assert.equal(R.leftText(nov.left), '뺀 녹음 4개: 분석 전 1 · 신뢰도 낮음 3');
  // Measured after removing the MR / after AI separation: counted by the analysis's own reliability, and said.
  assert.deepEqual([nov.mrRemoved, nov.aiSeparated], [1, 1]);
  assert.match(R.sampleText(nov), /반주를 뺀 뒤 잰 녹음 1개 · AI 분리 후 잰 녹음 1개/);
  for (const why of Object.keys(m.left)) assert.ok(R.LEFT[why], why);
  // A reliable v2 analysis in which no note was held long enough has no range to show.
  const bare = {v:2, metrics:{voicedSeconds:30, range:{low:null, high:null, lowCents:null, highCents:null, validHigh:null, stableHigh:null, main:{low:'C4', high:'D4', lowCents:6000, highCents:6200}}}, confidence:{pitchConfidence:.9, voiceOverMrDb:12}};
  const none = model([rec('2026-11-02', bare)]);
  assert.deepEqual([none.empty, month(none, '2026-11').left], [true, {'no-range':1}]);
  assert.deepEqual(R.read(bare), {why:'no-range'}); assert.deepEqual(R.read(null), {why:'no-analysis'});
});

test('v1 analyses measure range another way: left out with the reason, never mixed with v2', () => {
  const m = model([rec('2026-09-10', v1('C3', 'A5')), rec('2026-09-20', v1('C3', 'A5')), rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-09', v1('C3', 'A5'))], {today:'2026-11-13'});
  assert.deepEqual([month(m, '2026-09').n, month(m, '2026-09').high, month(m, '2026-09').left], [0, null, {v1:2}]);   // a v1-only month is empty
  const nov = month(m, '2026-11');
  assert.deepEqual([nov.n, nov.low.note, nov.high.note, nov.left], [1, 'G3', 'A4', {v1:1}]);
  assert.deepEqual(m.left, {v1:3}); assert.equal(R.leftText(m.left), '뺀 녹음 3개: 이전 분석(v1) 3');
  assert.deepEqual(R.read(v1('C3', 'A5')), {why:'v1'});
  // What a v2 analysis is read for: valid low/high, main range, stable high — and nothing when a part is missing.
  assert.deepEqual(R.read(v2('G3', 'A4', {main:['B3', 'F4'], stable:'G4', voiced:50})), {high:69, low:55, stable:67, mainLow:59, mainHigh:65, voiced:50, mrRemoved:false, aiSeparated:false});
  const onlyHigh = {v:2, metrics:{voicedSeconds:30, range:{validHigh:{note:'G5', cents:7900}}}, confidence:{pitchConfidence:.9}};
  assert.deepEqual(R.read(onlyHigh), {high:79, low:null, stable:null, mainLow:null, mainHigh:null, voiced:30, mrRemoved:false, aiSeparated:false});
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
    rec('', v2('C3', 'C6'), {created:0})                                // no date at all: in no month, and said
  ];
  const tz = process.env.TZ;
  try {
    for (const zone of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      const m = model(media);
      assert.deepEqual(m.months.map(x => [x.month, x.n]), [['2026-10', 2], ['2026-11', 1]], zone);
      assert.deepEqual([month(m, '2026-10').low.note, month(m, '2026-10').high.note, month(m, '2026-11').high.note], ['F3', 'A4', 'B4'], zone);
      assert.deepEqual(m.left, {'no-date':1}, zone); assert.equal(m.all.n, 3, zone);
      assert.equal(m.all.high.note, 'B4', zone);                        // the undated C6 is nowhere
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
  // The first month of the window has nothing (the series starts later): said as "녹음 없음".
  const fresh = model([...three('2026-11', 'G3', 'B4').slice(0, 2)], {today:'2026-11-13'});
  assert.deepEqual(fresh.change.missing, [{month:'2026-09', n:0}, {month:'2026-11', n:2}]);
  assert.equal(R.changeText(fresh.change), '표본이 부족해요 · 9월 녹음 없음, 11월 녹음 2개 · 한 달에 3개부터 비교해요');
  // Nothing at all.
  assert.equal(R.changeText(model([]).change), '아직 음역을 셀 수 있는 녹음이 없어요.'); assert.equal(model([]).change.state, 'none');
  // The window ends at the newest month WITH a recording; when that is long ago it is not called "최근".
  const old = model([...three('2025-12', 'G3', 'A4'), ...three('2026-02', 'A3', 'G4')], {today:'2026-11-13'});
  assert.equal(R.changeText(old.change), '마지막 기록 3개월(2025년 12월 → 2026년 2월) 관측 최고음 A4 → G4 (−2반음) · 관측 최저음 G3 → A3 (+2반음)');
  // No lowest note at one end: only the highest is compared.
  const high = {v:2, metrics:{voicedSeconds:30, range:{validHigh:{note:'G5', cents:7900}}}, confidence:{pitchConfidence:.9}};
  const partial = model([...[1, 2, 3].map(d => rec('2026-09-0' + d, high)), ...three('2026-11', 'G3', 'B4')], {today:'2026-11-13'});
  assert.equal(R.changeText(partial.change), '최근 3개월(9월 → 11월) 관측 최고음 G5 → B4 (−8반음)');
});

test('the note axis covers every value on the chart (lone notes too) with a few round ticks', () => {
  const m = model([rec('2026-11-02', v2('G3', 'A4')), rec('2026-11-05', v2('G3', 'A#4')), rec('2026-11-09', v2('G3', 'C6'))]);
  assert.deepEqual([m.axis.min, m.axis.max], [54, 85]);                                  // G3 − 1 … C6 (lone) + 1
  assert.deepEqual(m.axis.ticks.map(t => t.note), ['F#3', 'C4', 'F#4', 'C5', 'F#5', 'C6']);
  assert.ok(m.axis.ticks.length <= 7);
  const narrow = model([rec('2026-11-02', v2('C4', 'E4'))]);
  assert.deepEqual(narrow.axis.ticks.map(t => t.note), ['B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4']);
  assert.equal(model([]).axis, null);
});

test('on the characterization data set: what is counted, what is left out, and nothing is changed', () => {
  const media = JSON.parse(JSON.stringify(FIX.MEDIA)), db = JSON.parse(JSON.stringify(FIX.DB)), before = JSON.stringify([media, db]);
  const m = R.build(D.build(media, db, {reliable}).forRange(), {today:'2026-11-13'});
  assert.equal(JSON.stringify([media, db]), before);                                      // pure
  // 26 takes reach the model; the 3 v1 takes (a0, c1, c2) measure range another way.
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
