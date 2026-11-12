// 음표 단위 악보 비교: the score's sung line (VzipScoreRange.melody), the alignment with a recording
// (app/score-align-model.js) on synthetic singers rendered by tests/synth-vocal.cjs and analysed by the real analyzer,
// the saved form and the growth basis (app/growth-metrics-model.js). Fixtures are built here.
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../app/score-range-model.js'), A = require('../app/score-align-model.js'), VA = require('../app/vocal-analysis.js'), G = require('../app/growth-metrics-model.js');
const S = require('./helpers/score-song.cjs');

// ---------- melody() ----------
const hand = body => '<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list><part id="P1">' + body + '</part></score-partwise>';
const n = (step, oct, dur, extra = '', voice = 1) => '<note><pitch><step>' + step + '</step><octave>' + oct + '</octave></pitch><duration>' + dur + '</duration><voice>' + voice + '</voice>' + extra + '</note>';
const melodyOf = (xml, id = 'P1') => R.melody(S.parseXml(xml), id);

test('melody: ties merged, rests as gaps, chord top note, grace/cue skipped, main voice only, transposition, lyrics', () => {
  const xml = hand(
    '<measure number="1"><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time><transpose><chromatic>-12</chromatic></transpose></attributes>' +
      '<direction><sound tempo="84"/></direction>' +
      n('C', 5, 2, '<lyric><syllabic>begin</syllabic><text>Ma</text></lyric>') + '<note><grace/><pitch><step>B</step><octave>4</octave></pitch><voice>1</voice></note>' +
      n('E', 5, 2, '<tie type="start"/><lyric><syllabic>end</syllabic><text>ri</text></lyric>') + n('E', 5, 2, '<tie type="stop"/>') +
      '<backup><duration>6</duration></backup>' + n('A', 3, 6, '', 2) + '</measure>' +
    '<measure number="2"><note><rest/><duration>2</duration><voice>1</voice></note>' + n('G', 5, 2) + n('B', 4, 2, '', 1).replace('<note>', '<note><chord/>') +
      '<note><cue/><pitch><step>D</step><octave>6</octave></pitch><duration>2</duration><voice>1</voice></note>' + '</measure>' +
    '<measure number="3">' + n('D', 5, 6) + '</measure>' +
    '<measure number="1">' + n('F', 5, 6) + '</measure>'); // a second movement starts: not read
  const m = melodyOf(xml);
  assert.deepEqual(m.notes.map(x => [x.midi, x.beat, x.beats, x.measure]), [[60, 0, 1, '1'], [64, 1, 2, '1'], [67, 4, 1, '2'], [62, 6, 3, '3']]);
  assert.equal(m.notes[0].lyric, 'Ma-'); assert.equal(m.notes[1].lyric, 'ri');
  assert.equal(m.tempo, 84); assert.equal(m.transposition, -12); assert.equal(m.stoppedAtMovement, true); assert.equal(m.measures, 3);
  assert.equal(m.part, 'Soprano');
  assert.throws(() => melodyOf(xml, 'P9'), /파트를 찾지 못했어요/);
});

test('melody: the generated song (lyrics, tied halves, chord, piano part) reads back note for note', () => {
  const s = S.song(), m = melodyOf(S.xml(s));
  assert.equal(m.notes.length, s.notes.length);
  s.notes.forEach((x, i) => assert.deepEqual([m.notes[i].midi, m.notes[i].beat, m.notes[i].beats, m.notes[i].mi], [x.midi, x.beat, x.beats, x.mi]));
  assert.equal(m.measures, 32); assert.equal(m.beats, 128);
  const t = melodyOf(S.xml(s, {transpose:-12, name:'Tenor'})); // written an octave up, sounding as the song
  assert.deepEqual(t.notes.map(x => x.midi), s.notes.map(x => x.midi));
});

// ---------- alignment on synthetic singers ----------
const song = S.song(), mel = melodyOf(S.xml(song));
function take(opts) {
  const t = S.sing(song, opts), res = VA.analyze(t.samples, t.sr), r = A.align(mel, A.framesOf(res), {reliable:true});
  const truth = new Map(t.truth.map(x => [x.i, x])), first = new Map();
  for (const row of r.rows) if (!first.has(row.i)) first.set(row.i, row);
  const tally = {rows:0, agree:0, wrong:0, wrongHit:0, falseAlarm:0, unsure:0, outside:0};
  for (const [i, row] of first) {
    const tr = truth.get(i); if (!tr) { tally.outside++; continue; }
    tally.rows++;
    const want = tr.err ? (tr.err > 0 ? 'high' : 'low') : 'ok';
    if (row.status === 'unsure') { tally.unsure++; continue; }
    if (row.status === want) tally.agree++;
    if (tr.err) { tally.wrong++; if (row.status === want) tally.wrongHit++; } else if (row.status !== 'ok') tally.falseAlarm++;
  }
  tally.sung = truth.size;
  return {r, tally, res};
}
const report = [];
const note = (name, x) => report.push(name.padEnd(16) + ' ' + x.r.state.padEnd(4) + ' shift ' + String(x.r.shift).padStart(3) + ' · ' + x.r.coveredMeasures + '/32 mm · ' + x.tally.agree + '/' + x.tally.rows + ' notes right · wrong ' + x.tally.wrongHit + '/' + x.tally.wrong + ' · false ' + x.tally.falseAlarm + ' · unsure ' + x.tally.unsure + ' · ' + x.r.ms + ' ms');
test.after(() => console.log('\n' + report.join('\n')));

test('whole song in the written key with wrong notes: every wrong note found where it was sung, nothing else flagged', () => {
  const wrong = {10:1, 25:-2, 40:2, 61:-1, 80:1, 120:-1};
  const x = take({wrong}); note('clean', x);
  assert.equal(x.r.state, 'ok'); assert.equal(x.r.shift, 0);
  assert.equal(x.r.coveredMeasures, 32);
  assert.ok(x.tally.rows >= 134, 'nearly every note compared');
  assert.equal(x.tally.wrongHit, 6); assert.equal(x.tally.falseAlarm, 0);
  for (const [i, err] of Object.entries(wrong)) {
    const row = x.r.rows.find(r => r.i === Number(i));
    assert.equal(row.status, err > 0 ? 'high' : 'low');
    assert.ok(Math.abs(row.dev - err * 100) <= 40, 'deviation measured as sung: ' + row.dev);
    const truthT = S.sing(song, {wrong}).truth.find(t => t.i === Number(i)).t;
    assert.ok(Math.abs(row.t - truthT) < 0.25, 'tap-to-listen time near the sung note');
  }
  assert.ok(x.r.pct >= 94);
  assert.deepEqual(x.r.repeat, []);
  const w = x.r.worst.map(m => m.measure);
  assert.ok(w.every(m => ['3', '6', '10', '16', '19', '29'].includes(m)), 'worst measures hold the wrong notes: ' + w);
});

test('partial take (measures 9–20 only, starting mid-song): only those measures are compared', () => {
  const x = take({from:9, to:20, wrong:{50:-2, 70:1}}); note('partial', x);
  assert.equal(x.r.state, 'ok');
  assert.ok(x.r.coveredMeasures >= 11 && x.r.coveredMeasures <= 12);
  assert.ok(x.r.rows.every(r => r.mi >= 8 && r.mi <= 19));
  assert.equal(x.tally.wrongHit, 2); assert.equal(x.tally.falseAlarm, 0);
});

test('transposed: sung 3 semitones low with the MR → key shift −3 reported, notes compared in that key', () => {
  const x = take({shift:-3, wrong:{30:2, 90:-1}}); note('key −3', x);
  assert.equal(x.r.state, 'ok'); assert.equal(x.r.shift, -3); assert.equal(x.r.keyAmbiguous, false);
  assert.equal(x.tally.wrongHit, 2); assert.equal(x.tally.falseAlarm, 0);
  assert.equal(A.shiftText(-3), '악보보다 3반음 낮은 키로');
  const row = x.r.rows.find(r => r.i === 30);
  assert.equal(row.expected, Math.round((mel.notes[30].midi - 3) * 100 + x.r.tuning), 'expected pitch in the sung key (MR tuning); the measured value is untouched');
  assert.ok(Math.abs(x.r.tuning) < 10);
});

test('an octave lower (original MR): shift −12, not a row of "12 semitones low"', () => {
  const x = take({shift:-12, mrShift:0, wrong:{15:-2, 100:1}}); note('octave −12', x);
  assert.equal(x.r.state, 'ok'); assert.equal(x.r.shift, -12);
  assert.equal(A.shiftText(-12), '한 옥타브 낮게');
  assert.equal(x.tally.wrongHit, 2); assert.ok(x.tally.falseAlarm <= 2);
  assert.ok(x.r.rows.every(r => r.dev == null || Math.abs(r.dev) < 600));
});

test('rubato ±20 %, slower tempo, onset jitter, two held fermatas', () => {
  const x = take({rubato:0.2, tempo:96, jitter:0.05, hold:[19, 52], wrong:{44:1}}); note('rubato', x);
  assert.equal(x.r.state, 'ok');
  assert.equal(x.tally.wrongHit, 1);
  assert.ok(x.tally.falseAlarm <= 3 && x.tally.unsure <= 10, JSON.stringify(x.tally));
  assert.ok(x.tally.agree / x.tally.rows >= 0.9);
});

test('loud accompaniment and a cappella', () => {
  for (const [name, mrDb] of [['loud MR −4 dB', -4], ['a cappella', null]]) {
    const x = take({mrDb, wrong:{10:1, 61:-1}}); note(name, x);
    assert.equal(x.r.state, 'ok'); assert.equal(x.tally.wrongHit, 2); assert.ok(x.tally.falseAlarm <= 1);
  }
});

test('a quarter of the notes wrong: still found, or the rest withheld (불확실) — never a misplaced verdict run', () => {
  const wrong = {}; for (let i = 3; i < 136; i += 4) wrong[i] = (i % 8 === 3 ? 1 : -1) * (1 + (i % 3 === 0));
  const x = take({wrong}); note('25 % wrong', x);
  assert.ok(x.tally.agree / x.tally.rows >= 0.85, JSON.stringify(x.tally));
  assert.ok(x.tally.falseAlarm <= 3);
});

test('a repeated verse sung alone: compared, and the other place of the same melody is named', () => {
  const x = take({from:25, to:32}); note('repeat verse', x);
  report.push('  (repeat verse aligned to measures 1–8, its first copy: ' + x.r.ok + '/' + x.r.judged + ' right)');
  assert.equal(x.r.state, 'ok'); assert.ok(x.r.pct >= 95);
  assert.deepEqual(x.r.repeat, [{measure:'1', other:'25'}]);
});

test('another song is not forced onto the score: 판정 보류 (in the same key and moved)', () => {
  const other = S.song({seed:99});
  for (const shift of [0, 2]) {
    const t = S.sing(other, {shift}), r = A.align(mel, A.framesOf(VA.analyze(t.samples, t.sr)));
    report.push(('other song +' + shift).padEnd(16) + ' ' + r.state + ' (' + r.reason + ')');
    assert.equal(r.state, 'hold'); assert.ok(['not-found', 'weak-match'].includes(r.reason), r.reason);
  }
});

test('withheld: no voice, too few notes, low analysis confidence', () => {
  const silent = {curve:new Array(400).fill(null), fps:20};
  assert.equal(A.align(mel, A.framesOf(silent)).reason, 'no-voice');
  assert.equal(A.align({notes:mel.notes.slice(0, 4)}, A.framesOf(silent)).reason, 'no-melody');
  // Same notes as the clean take, but the analysis itself is unreliable → hold, rows kept for reference.
  const t = S.sing(song, {from:1, to:8}), r = A.align(mel, A.framesOf(VA.analyze(t.samples, t.sr)), {reliable:false});
  assert.equal(r.state, 'hold'); assert.equal(r.reason, 'confidence'); assert.ok(r.rows.length > 20);
});

test('MR tuning is the reference when the analyzer heard it', () => {
  const f = A.framesOf({curve:[6000, null, 6010], fps:20, confidence:{tuningFrom:'mr'}, metrics:{intonation:{tuningCents:-20}}});
  assert.equal(f.tuning, -20); assert.ok(Number.isNaN(f.cents[1])); assert.equal(f.cents[2], 6010);
  assert.equal(A.framesOf({curve:[], confidence:{tuningFrom:'a440'}, metrics:{intonation:{tuningCents:-20}}}).tuning, 0);
});

test('wording: deviations and key shifts', () => {
  assert.equal(A.devText(-100), '−1반음'); assert.equal(A.devText(212), '+2반음'); assert.equal(A.devText(-70), '−70 cent'); assert.equal(A.devText(30), '+30 cent');
  assert.equal(A.shiftText(0), ''); assert.equal(A.shiftText(2), '악보보다 2반음 높은 키로'); assert.equal(A.shiftText(-14), '악보보다 14반음 낮게(1옥타브 + 2반음)');
  assert.equal(A.nameOfCents(7149), 'B4');
});

test('5-minute take against a 544-note score aligns in well under the budget', () => {
  // Built from a real analysed take repeated four times (≈ 290 s, 5800 frames).
  const t = S.sing(song, {}), res = VA.analyze(t.samples, t.sr);
  const big = {notes:[]}; for (let k = 0; k < 4; k++) for (const x of mel.notes) big.notes.push({...x, i:big.notes.length, beat:x.beat + k * 128, mi:x.mi + 32 * k, measure:String(x.mi + 32 * k + 1)});
  const curve = []; for (let k = 0; k < 4; k++) curve.push(...res.curve);
  const t0 = Date.now(), r = A.align(big, A.framesOf({...res, curve})), ms = Date.now() - t0;
  report.push('5-min take'.padEnd(16) + ' ' + r.state + ' · ' + r.coveredMeasures + '/128 mm · ' + big.notes.length + ' notes × ' + curve.length + ' frames · ' + ms + ' ms');
  assert.equal(r.state, 'ok'); assert.equal(r.coveredMeasures, 128);
  assert.ok(ms < 4000, ms + ' ms');
});

// ---------- saved form + growth basis ----------
const fake = (statuses, extra = {}) => ({version:1, state:'ok', shift:0, measuresTotal:32, coveredMeasures:5, worst:[{measure:'3'}], ok:statuses.filter(s => s === 'ok').length,
  judged:statuses.filter(s => ['ok', 'high', 'low'].includes(s)).length, missed:statuses.filter(s => s === 'missed').length,
  rows:statuses.map((status, k) => ({i:10 + k, status})), ...extra});
test('compact: one status letter per score note (first time sung), summary, score version', () => {
  const r = fake(['ok', 'high', 'low', 'missed', 'unsure']);
  r.rows.push({i:30, status:'ok'}, {i:10, status:'low'}); // a second visit of note 10 does not overwrite the first
  const c = A.compact({...r, pct:40}, {scoreId:'sc1', version:'job1', partId:'P1', at:5});
  assert.deepEqual({...c, s:undefined}, {v:1, at:5, score:'sc1', ver:'job1', part:'P1', shift:0, state:'ok', pct:40, judged:3, ok:1, missed:1, cover:[5, 32], worst:['3'], from:10, s:undefined});
  assert.equal(c.s, 'ohlmu' + '.'.repeat(15) + 'o');
  assert.ok(JSON.stringify(c).length < 300);
});

test('growth: 악보 기준 맞은 음 비율 only for the same score version, part and key, over notes judged in both takes', () => {
  const rec = (s, extra = {}) => ({v:1, at:1, score:'sc1', ver:'job1', part:'P1', shift:0, state:'ok', from:0, s, ...extra});
  const a = rec('ohoolooooooo' + 'oo'), b = rec('oooooooooooo' + 'um');
  assert.deepEqual(G.scoreNoteBasis(a, b), {before:83, after:100, notes:12, shift:0});
  assert.equal(G.scoreNoteBasis(a, rec(b.s, {ver:'job2'})), null, 'another conversion of the score');
  assert.equal(G.scoreNoteBasis(a, rec(b.s, {shift:-12})), null, 'another key relation');
  assert.equal(G.scoreNoteBasis(a, rec(b.s, {state:'hold'})), null);
  assert.equal(G.scoreNoteBasis(a, rec('oooo')), null, 'too few common notes');
  // Through the intonation comparison: the verdict stays the cents rule; the basis text names the score share.
  const take = (id, date, cents) => ({id, date, ok:true, a:{v:2, metrics:{voicedSeconds:30, intonation:{meanAbsCents:cents, notes:20}}, confidence:{pitchConfidence:.95}}});
  const without = G.songReport([take('m1', '2026-11-01', 20), take('m2', '2026-11-10', 12)]);
  const withScore = G.songReport([take('m1', '2026-11-01', 20), take('m2', '2026-11-10', 12)], {scoreNotes:{m1:a, m2:b}});
  assert.equal(withScore.intonation.state, without.intonation.state);
  assert.equal(without.intonation.score, undefined);
  assert.deepEqual(withScore.intonation.score, {before:83, after:100, notes:12, shift:0});
  assert.match(G.basisText(withScore.intonation), /^악보 기준 맞은 음 비율 83% → 100% \(같은 악보 음 12개 · ±50 cent\)/);
  assert.equal(G.basisText(without.intonation), '곡 전체 비교 (같은 프레이즈를 충분히 찾지 못함)');
});
