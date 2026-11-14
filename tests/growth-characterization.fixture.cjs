// The fake data set of tests/growth-characterization.spec.cjs (and of tests/growth-dataset.test.cjs, which counts how
// many of these recordings each screen's rule treats differently). 37 recordings, 5 songs and a deleted one.
// Changing anything here changes the snapshot: do it only on purpose.
'use strict';
const NOW = '2026-11-13T03:00:00.000Z';           // Friday 12:00 in Korea
const kst = (date, time = '20:00') => Date.parse(date + 'T' + time + ':00+09:00');
// v2 summary with the growth-report detail. phrases: [start, dur, midi, intonation, wobble]; bands: [midi, n, held, longest, nw, wobble].
const v2 = ({into, wob = 10, longer = 0, held = .8, highWob = 12, conf = .95, mr = false, ai = false}) => ({v:2, at:kst('2026-11-12'), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:into + 3, within20:70, notes:40}, stability:{wobbleCents:wob + 1, notes:15}, vibrato:{share:20, notes:10, rateHz:5.5, extentCents:40, regularity:.9},
  range:{validHigh:{note:'G5', cents:7900}, stableHigh:{note:'F5', cents:7700}, instantaneous:{note:'C7', cents:9600, t:30}, main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
  breath:{phrases:5, medianPhrase:3.4 + longer},
  phrases:{v:1, rows:[[10, 3 + longer, 64, into, wob], [15, 2.5 + longer, 67, into, wob], [20, 3.5 + longer, 69, into, wob], [26, 4 + longer, 72, into, wob], [32, 2 + longer, 71, into, wob]]},
  pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [67, 4, .6, 1, 3, 6], [74, 3, held, held + .3, 3, highWob]]}},
  confidence:{pitchConfidence:conf, voiceOverMrDb:12, ...(mr ? {mrRemoved:true} : {}), ...(ai ? {aiSeparated:true} : {})}});
const v1 = into => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:into, notes:20}, stability:{wobbleCents:15, notes:6}, range:{high:'A5', highCents:8100}, breath:{medianPhrase:2.5}}, confidence:{voiceOverMrDb:12}});
const v3 = into => ({...v2({into}), v:3});         // a later analysis version: measured, but not one the growth rules read
const rec = (id, songId, date, analysis, extra = {}) => ({id, name:'녹음 ' + id, songId, song:'', recordedDate:date, dateSource:'metadata', created:kst(date), type:'audio/mp4', source:'practice', durationSeconds:120, ...(analysis ? {analysis} : {}), ...extra});
const MEDIA = [
  // s1: an old v1 take, v2 takes getting more in tune, two on one day, an unreliable one, one measured after removing
  // the MR, one after AI separation, one without any date, and a lesson recording of the song.
  rec('a0', 's1', '2026-08-10', v1(60)), rec('a1', 's1', '2026-09-05', v2({into:30})),
  rec('a2', 's1', '2026-10-02', v2({into:26}), {created:kst('2026-10-02', '10:00')}), rec('a3', 's1', '2026-10-02', v2({into:24}), {created:kst('2026-10-02', '18:00')}),
  rec('a4', 's1', '2026-10-20', v2({into:20, conf:.3})), rec('a5', 's1', '2026-11-03', v2({into:16, mr:true})),
  rec('a6', 's1', '2026-11-10', v2({into:11, longer:.8, held:1.2})), rec('a7', 's1', '2026-11-12', v2({into:12, ai:true})),
  rec('a8', 's1', '', v2({into:18}), {created:0, dateSource:''}),
  rec('la', 's1', '2026-10-28', v2({into:22}), {source:'lesson', recordingCategory:'lesson'}),
  // s2: got worse; one recording dated only by its save time (Monday 01:30 in Korea = Sunday in UTC), one v3, one
  // whose id is in the deleted list but is still in the media list.
  rec('b1', 's2', '2026-09-20', v2({into:12})), rec('b2', 's2', '2026-10-25', v2({into:18})), rec('b3', 's2', '2026-11-11', v2({into:24})),
  rec('b4', 's2', '', v2({into:20}), {created:Date.parse('2026-11-08T16:30:00Z'), dateSource:''}),
  rec('b5', 's2', '2026-11-05', v3(15)), rec('g1', 's2', '2026-11-09', v2({into:9})),
  // s3: v1 only.
  rec('c1', 's3', '2026-09-10', v1(40)), rec('c2', 's3', '2026-11-04', v1(30)),
  // s4: not analysed, plus a video on the device and a video in the cloud, both analysed.
  rec('d1', 's4', '2026-11-02', null), rec('d2', 's4', '2026-11-09', null),
  rec('dv', 's4', '2026-11-06', v2({into:21}), {type:'video/mp4'}), rec('dc', 's4', '2026-11-07', v2({into:19}), {type:'video/mp4', cloud:true}),
  // s5: ordinary takes, a 연습실 submission, a recording of a 트레이닝 practice, and two tagged 트레이닝 / 연습실
  // by hand without such a practice.
  rec('e1', 's5', '2026-10-05', v2({into:20})), rec('e2', 's5', '2026-11-09', v2({into:15})),
  rec('er', 's5', '2026-11-08', v2({into:30}), {source:'practice-room', recordingCategory:'room'}),
  rec('et', 's5', '2026-11-07', v2({into:28})),
  rec('ex', 's5', '2026-11-06', v2({into:26}), {recordingCategory:'training'}), rec('ey', 's5', '2026-11-05', v2({into:25}), {recordingCategory:'room'}),
  // s6: the song was deleted, its recordings are still there.
  rec('f1', 's6', '2026-11-01', v2({into:14})), rec('f2', 's6', '2026-11-09', v2({into:10})),
  // No song: an imported file, 트레이닝 recordings, a lesson recording, 매일 보이스 체크 recordings.
  rec('u1', '', '2026-11-10', v2({into:17}), {source:'import'}),
  rec('t1', '', '2026-11-09', v2({into:19}), {recordingCategory:'training'}), rec('t2', '', '2026-10-15', v2({into:21}), {recordingCategory:'training'}),
  rec('l2', '', '2026-11-11', v2({into:23}), {source:'lesson', recordingCategory:'lesson'}),
  ...['2026-11-10', '2026-11-11', '2026-11-12'].map((d, i) => rec('vc' + (i + 1), '', d, v2({into:9 + i}), {name:'보이스 체크 ' + d, dateSource:'recorded', origin:'voice-check', recordingCategory:'training', durationSeconds:30, voiceCheck:{v:1, protocol:'vc1', refNote:'A3', highNote:'E4'}}))
];
const goals = (plan, start, done) => done.map((completed, i) => { const date = new Date(Date.parse(start + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10); return {id:plan + ':' + date, date, title:'계획 연습', source:'personal', sourceId:plan, completed, order:0, created:1}; });
const DB = {
  categories:[], assignments:[], comparisonReports:[], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[],
  songs:[{id:'s1', title:'Defying Gravity', created:kst('2026-08-01'), vocalRange:{lowMidi:55, highMidi:74, confirmed:true}}, {id:'s2', title:'On My Own', created:kst('2026-09-01')},
    {id:'s3', title:'Memory', created:kst('2026-09-05')}, {id:'s4', title:'새 곡', created:kst('2026-11-01')}, {id:'s5', title:'Home', created:kst('2026-10-01')}],
  deleted:{media:['g1'], songs:['s6']},
  lessons:[{id:'l1', date:'2026-10-28', startTime:'19:00', status:'done', songIds:['s1'], feedback:'후렴 첫 음 준비', recordings:[{id:'la'}]}],
  practices:[
    {id:'p1', date:'2026-11-09', songId:'s1', minutes:30}, {id:'p2', date:'2026-11-10', songId:'s2', minutes:20}, {id:'p3', date:'2026-11-03', songId:'s1', minutes:15},
    {id:'practice-room:rm1', date:'2026-11-08', minutes:8, songId:'s5', mediaIds:['er'], created:2, practiceRoom:{id:'rm1', task:'tone', title:'기준음 따라 부르기', songId:'s5', date:'2026-11-08T11:00:00.000Z', demo:false}},
    {id:'ptr', date:'2026-11-07', minutes:12, songId:'s5', practiceMode:'training', mediaIds:['et'], created:3},
    ...[1, 2, 3].map(i => ({id:'voice-check:vc' + i, date:'2026-11-1' + (i - 1), minutes:.5, manualMinutes:.5, practiceTimeSource:'voice-check', practiceMode:'training', songId:'', mediaIds:['vc' + i], memo:'[보이스 체크]', completed:[], created:10 + i,
      voiceCheck:{v:1, protocol:'vc1', refNote:'A3', highNote:'E4', mediaId:'vc' + i, at:kst('2026-11-1' + (i - 1))}}))
  ],
  practicePlans:[
    {id:'pl1', kind:'monthly-vocal', sourceMonth:'2026-11', songId:'s1', metric:'intonation', segmentStart:0, segmentEnd:20, minutes:10, days:7, startDate:'2026-11-01', created:1, archived:false},
    {id:'pl2', kind:'monthly-vocal', sourceMonth:'2026-11', songId:'s2', metric:'stability', segmentStart:0, segmentEnd:20, minutes:10, days:7, startDate:'2026-11-10', created:2, archived:false},
    {id:'pl3', kind:'monthly-vocal', sourceMonth:'2026-11', songId:'s5', metric:'phrase', segmentStart:0, segmentEnd:20, minutes:10, days:3, startDate:'2026-11-06', created:3, archived:false},
    {id:'pl4', kind:'monthly-vocal', sourceMonth:'2026-10', songId:'s1', metric:'vibrato', segmentStart:0, segmentEnd:20, minutes:10, days:5, startDate:'2026-10-10', created:4, archived:false}
  ],
  dailyGoals:[...goals('pl1', '2026-11-01', [true, true, false, true, true, false, true]), ...goals('pl3', '2026-11-06', [true, false, true]), ...goals('pl4', '2026-10-10', [true, true, true, false, false])]
};
module.exports = {NOW, MEDIA, DB, v1, v2, v3, kst};
