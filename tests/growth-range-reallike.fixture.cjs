// A library shaped like the owner's real one, for 전체 음역 흐름 (tests/growth-range.test.cjs, tests/growth-range.spec.cjs).
// The shape comes from the owner's numbers-only diagnosis (2026-11: 2,246 recordings over 16 months) — only the shape:
// every number here is made up. 150 song recordings a month for three months:
//  · 1 in 10 was sung over a loud MR (voice only 3–9 dB over it) and carries D#2 ~ C6: it passes the verdict rule
//    (`ok`) and is left out by the separation rule. In the real library that rule removes little.
//  · The rest are clearly apart from the accompaniment (≥ 10 dB, none found, or AI-separated) — and half of THOSE still
//    carry an octave-like end: the highest note 12 semitones above the take's own main range (a fifth of them, half
//    with the stable note up there too), the lowest 13 below it (a fifth), or both (a tenth). The others stay in the
//    first mode: 1–5 semitones outside their main range. Nothing lies in the valley between.
//  · One clean take a month has its lowest note on the detector's limit and one its highest, and two have a main
//    range an octave and a half under the usual one (another voice, or a wholly octave-shifted reading).
// The usual top rises a semitone a month (C5 → C#5 → D5), as the real one drifts up over the year.
'use strict';
const NOTE = {C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11};
const NAMES = Object.keys(NOTE);
const midi = n => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return NOTE[m[1]] + (Number(m[2]) + 1) * 12; };
const noteOf = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
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
const MONTHS = ['2026-09', '2026-10', '2026-11'], PER_MONTH = 150;
const MEDIA = [];
MONTHS.forEach((ym, at) => { for (let i = 0; i < PER_MONTH; i++) {
  const date = ym + '-' + String(1 + i % 28).padStart(2, '0');
  let analysis;
  if (i % 10 === 9) analysis = exact(v2('D#2', 'C6', {main:['C4', 'A#4'], stable:i % 20 === 9 ? 'C6' : 'B5', db:3 + i % 7}));   // over a loud MR
  else {
    const j = i - Math.floor(i / 10);                                                       // 135 clean takes a month
    const main = j % 2 ? ['C4', 'A#4'] : ['B3', 'A4'];
    const top = midi('B4') + at, octaveHigh = j % 5 === 1 || j % 10 === 4, octaveLow = j % 5 === 3 || j % 10 === 4;
    const high = octaveHigh ? noteOf(midi(main[1]) + 12) : noteOf(j % 4 ? top + 1 : top);     // first mode: C5 (B4 one take in four) in September
    const low = octaveLow ? noteOf(midi(main[0]) - 13) : j % 3 ? 'G3' : 'A3';
    const stable = octaveHigh && j % 10 === 1 ? high : j % 2 ? noteOf(top) : 'A4';
    const sep = j % 9 === 0 ? {db:5, extra:{aiSeparated:{model:'htdemucs'}}} : {db:j % 6 ? 10 + j % 12 : null};   // AI-separated, clearly over the MR, or no MR found
    analysis = j === 7 ? v2('D#2', high, {main, stable, ...sep})                              // lowest note on the detector's limit
      : j === 31 ? v2(low, 'C6', {main, stable:'B5', ...sep})                                 // highest note on it
      : j === 50 || j === 52 ? v2('E2', 'E4', {main:['F2', 'C4'], stable:'D4', ...sep})        // main range far under the usual one
      : v2(low, high, {main, stable, ...sep});
  }
  MEDIA.push({id:ym + ':' + i, name:'녹음 ' + i, songId:i % 2 ? 's1' : 's2', song:'', recordedDate:date, dateSource:'metadata', created:kst(date) + i * 1000, type:'audio/mp4', source:'practice', durationSeconds:120, analysis});
} });
const DB = {categories:[], assignments:[], comparisonReports:[], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], lessons:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:kst('2026-08-01')}, {id:'s2', title:'On My Own', created:kst('2026-08-01')}], deleted:{}};
module.exports = {MEDIA, DB, MONTHS, PER_MONTH, v2, v1, midi, kst};
