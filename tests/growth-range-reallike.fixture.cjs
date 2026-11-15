// A library shaped like the owner's real one, for 전체 음역 흐름 (tests/growth-range.test.cjs, tests/growth-range.spec.cjs):
// 300 song recordings a month for three months. 80 % were sung over a loud MR (voice only 3–9 dB over it): the
// detector read the bass and the top of the band as held notes, so they carry D#2 and C6 — and every one of them
// passes the verdict rule (`ok`). 20 % are clean (12–20 dB, or no accompaniment found): G3/A3 … C5/D5; a few of those
// carry one wrong end too (an end on the detector's limit, or a single stray A5), as real clean takes do.
'use strict';
const NOTE = {C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11};
const midi = n => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return NOTE[m[1]] + (Number(m[2]) + 1) * 12; };
const kst = (date, time = '20:00') => Date.parse(date + 'T' + time + ':00+09:00');
/** A v2 analysis as app/vocal-analysis.js rangeOf saves it: low/high = the lowest/highest note held ≥ 0.2 s.
 * db: voiceOverMrDb (null = no accompaniment found on its own). */
const v2 = (low, high, {main = [low, high], stable = high, voiced = 60, conf = .95, db = 12, extra = {}} = {}) => ({v:2, at:1, seconds:120, metrics:{voicedSeconds:voiced,
  intonation:{meanAbsCents:14, within20:70, notes:40}, stability:{wobbleCents:10, notes:15},
  range:{low, high, lowCents:midi(low) * 100 + 7, highCents:midi(high) * 100 - 12, validHigh:{note:high, cents:midi(high) * 100 - 12}, stableHigh:stable ? {note:stable, cents:midi(stable) * 100} : null,
    instantaneous:{note:'C8', cents:10800}, main:{low:main[0], high:main[1], lowCents:midi(main[0]) * 100, highCents:midi(main[1]) * 100, percentiles:[10, 90]}},
  breath:{phrases:5, medianPhrase:3.4}}, confidence:{pitchConfidence:conf, voiceOverMrDb:db, ...extra}});
const v1 = (low, high) => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:30, notes:20}, range:{low, high, lowCents:midi(low) * 100, highCents:midi(high) * 100}}, confidence:{voiceOverMrDb:12}});
const exact = a => { const g = a.metrics.range; g.lowCents = midi(g.low) * 100; g.highCents = midi(g.high) * 100; g.validHigh.cents = g.highCents; return a; };
const MEDIA = [];
for (const ym of ['2026-09', '2026-10', '2026-11']) for (let i = 0; i < 300; i++) {
  const date = ym + '-' + String(1 + i % 28).padStart(2, '0');
  let analysis;
  if (i % 5) analysis = exact(v2('D#2', 'C6', {main:['C4', 'A#4'], stable:i % 2 ? 'C6' : 'B5', db:3 + i % 7}));        // over a loud MR
  else {
    const j = i / 5;                                                                                               // 60 clean takes a month
    analysis = j === 7 || j === 31 ? v2('D#2', 'C6', {main:['C4', 'A4'], stable:'B5', db:14})                         // both ends on the limit
      : j === 19 ? v2('G3', 'A5', {main:['C4', 'A4'], stable:'C5', db:16})                                           // one stray top
      : v2(j % 3 ? 'G3' : 'A3', j % 4 ? 'D5' : 'C5', {main:['C4', 'A4'], stable:j % 2 ? 'C5' : 'B4', db:j % 6 ? 12 + j % 9 : null});
  }
  MEDIA.push({id:ym + ':' + i, name:'녹음 ' + i, songId:i % 2 ? 's1' : 's2', song:'', recordedDate:date, dateSource:'metadata', created:kst(date) + i * 1000, type:'audio/mp4', source:'practice', durationSeconds:120, analysis});
}
const DB = {categories:[], assignments:[], comparisonReports:[], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], lessons:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:kst('2026-08-01')}, {id:'s2', title:'On My Own', created:kst('2026-08-01')}], deleted:{}};
module.exports = {MEDIA, DB, v2, v1, midi, kst};
