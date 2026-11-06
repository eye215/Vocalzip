// Vocal analysis against synthetic "singing over an MR" recordings with known answers.
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../app/vocal-analysis.js'), {synth} = require('./synth-vocal.cjs');
const run = opt => { const s = synth(opt); return A.analyze(s.samples, s.sr); };

test('Finds every sung note over the MR, with range, intonation, vibrato and phrases', () => {
  const r = run({}), m = r.metrics;
  assert.deepEqual(r.notes.map(n => A.noteName(n.cents)), ['A3', 'C4', 'E4', 'D4', 'E4', 'G4', 'A4', 'C5', 'B4']);
  assert.deepEqual([m.range.low, m.range.high], ['A3', 'C5']);
  assert.ok(Math.abs(m.intonation.meanAbsCents - 8) < 2.5, 'sung 8 cents sharp: ' + m.intonation.meanAbsCents);
  assert.equal(m.intonation.within20, 100);
  assert.equal(r.confidence.tuningFrom, 'mr'); // tuned against the MR heard on its own
  assert.ok(Math.abs(m.vibrato.rateHz - 5.5) <= 0.3);
  assert.ok(m.vibrato.extentCents >= 30 && m.vibrato.extentCents <= 45, 'vibrato ±40 (ramped in): ' + m.vibrato.extentCents);
  assert.equal(m.vibrato.share, 33); // 3 of the 9 notes
  assert.ok(m.stability.wobbleCents < 8);
  assert.equal(m.breath.phrases, 4);
  assert.ok(r.confidence.separated && r.confidence.voiceOverMrDb > 10);
});
test('Measures a flat singer as flat, and works for low, high and wide-vibrato voices', () => {
  assert.ok(Math.abs(run({detune:-25}).metrics.intonation.meanAbsCents - 25) < 3);
  assert.deepEqual(['low', 'high'].map(k => run({transpose:-12}).metrics.range[k]), ['A2', 'C4']);
  assert.deepEqual(['low', 'high'].map(k => run({transpose:12}).metrics.range[k]), ['A4', 'C6']);
  const v = run({vibrato:{rate:6.5, cents:80}}).metrics.vibrato;
  assert.ok(Math.abs(v.rateHz - 6.5) <= 0.3 && v.extentCents >= 60 && v.extentCents <= 90, JSON.stringify(v));
});
test('A loud MR (as loud as the voice) still leaves the sung notes', () => {
  const r = run({mrDb:0});
  assert.equal(r.metrics.intonation.notes, 9);
  assert.deepEqual([r.metrics.range.low, r.metrics.range.high], ['A3', 'C5']);
});
test('Accompaniment only: no voice is invented', () => {
  for (const sr of [22050, 44100]) {
    const r = run({withVoice:false, sr});
    assert.equal(r.metrics.voicedSeconds, 0); assert.equal(r.metrics.range, null);
  }
});
test('The curve has 20 points a second and silence stays empty', () => {
  const r = run({});
  assert.equal(r.fps, 20); assert.ok(Math.abs(r.curve.length - 400) <= 1); // 20 s × 20
  assert.ok(r.curve.slice(0, 50).every(v => v == null)); // MR intro
  assert.ok(r.curve.slice(100, 120).every(v => v != null)); // singing
});
