// Ground truth: generated recordings whose sung pitch is known at every 50 ms (tests/pitch-truth.cjs).
// Reproduce the before/after table with tools/pitch-bench.cjs. Synthetic only: not a real-recording claim.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const A = require('../app/vocal-analysis.js'), {scenarios, score} = require('./pitch-truth.cjs');
const hz = m => 440 * 2 ** ((m - 69) / 12);
const cases = scenarios();

for (const [name, rec, expected] of cases) test('ground truth: ' + name, () => {
  const r = A.analyze(rec.samples, rec.sr), s = score(rec, r), g = r.metrics.range;
  assert.ok(s.accuracy >= 95, name + ' accuracy ' + JSON.stringify(s));
  assert.equal(s.octaveErrors, 0, name + ' octave errors ' + JSON.stringify(s));
  assert.ok(!s.falseAlarm, name + ' voice invented in silence/noise ' + JSON.stringify(s));
  assert.equal(g.validHigh.note, expected, name + ' valid high');
  assert.equal(g.stableHigh?.note, expected, name + ' stable high');
  // Evidence the owner can listen to: where the highest notes happened.
  for (const p of [g.instantaneous, g.validHigh]) assert.ok(p.t >= 0 && p.t < rec.samples.length / rec.sr, name + ' time ' + JSON.stringify(p));
  assert.ok(g.validHigh.times.length >= 1 && g.validHigh.times[0].t === g.validHigh.t);
  assert.equal(r.version, 2);
});

test('reported times point at the held highest note and the instant peak', () => {
  const [, rec] = cases.find(c => c[0].startsWith('C5→C6')); // C5 0.3–1.3 s, C6 1.3–2.3 s
  const g = A.analyze(rec.samples, rec.sr).metrics.range;
  assert.ok(g.validHigh.t >= 1.2 && g.validHigh.t <= 1.45, JSON.stringify(g.validHigh));
  assert.ok(g.validHigh.duration >= 0.8);
  assert.ok(g.instantaneous.t >= 1.2 && g.instantaneous.t <= 2.3, JSON.stringify(g.instantaneous));
});

test('same song, three takes with different timbre, vibrato, detune and a squeak: same valid/stable high, comparable, 0 semitones', () => {
  const takes = cases.filter(c => c[0].startsWith('same song')).map(([, rec]) => A.analyze(rec.samples, rec.sr));
  const notes = takes.map(r => [r.metrics.range.validHigh.note, r.metrics.range.stableHigh.note]);
  assert.deepEqual(notes, [['C5', 'C5'], ['C5', 'C5'], ['C5', 'C5']]);
  const VZ = {media:{}, route:() => {}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/analysis.js'), 'utf8'), {window:{VZ}});
  // Twenty seconds of singing are needed before a summary may be compared; stretch the short takes' voiced time.
  const sum = r => ({...VZ.analysisSummary(r), metrics:{...r.metrics, voicedSeconds:20}});
  const [a, , c] = takes.map(sum);
  assert.equal(VZ.analysisComparable(a, c), true);
  assert.equal(Math.round(c.metrics.range.validHigh.cents / 100) - Math.round(a.metrics.range.validHigh.cents / 100), 0);
});

/* ---------- continuity on a hand-made pitch track (frame level, 10 ms) ---------- */
const trackOf = midis => ({frames:midis.length, hz:Float64Array.from(midis, m => m ? hz(m) : 0), confidence:new Float64Array(midis.length).fill(0.95)});
const fill = (m, n) => new Array(n).fill(m);
test('continuity: a short octave flip inside a held note is folded back', () => {
  for (const len of [5, 10, 15]) {
    const tr = trackOf([...fill(72, 50), ...fill(84, len), ...fill(72, 50)]), out = A._internal.clean(tr);
    assert.equal(out.octaveFolded, len);
    assert.ok(Array.from(tr.hz).every(v => Math.abs(A.centsOf(v) - 7200) < 1));
  }
  // …also an octave-down flip, and one at a note's start.
  let tr = trackOf([...fill(72, 50), ...fill(60, 8), ...fill(72, 50)]); A._internal.clean(tr);
  assert.ok(Array.from(tr.hz).every(v => Math.abs(A.centsOf(v) - 7200) < 1));
  tr = trackOf([0, 0, ...fill(84, 5), ...fill(72, 60)]); A._internal.clean(tr);
  assert.ok(Array.from(tr.hz).filter(v => v).every(v => Math.abs(A.centsOf(v) - 7200) < 1));
});
test('continuity: a sung octave leap that is held (C4→C5→C4, C5→C6) is kept', () => {
  for (const seq of [[...fill(60, 50), ...fill(72, 20), ...fill(60, 50)], [...fill(72, 80), ...fill(84, 80)], [...fill(60, 40), ...fill(72, 40)]]) {
    const tr = trackOf(seq), before = Array.from(tr.hz), out = A._internal.clean(tr);
    assert.equal(out.octaveFolded, 0); assert.deepEqual(Array.from(tr.hz), before);
  }
});
test('continuity: momentary non-octave spikes are removed, a held neighbour note is not', () => {
  let tr = trackOf([...fill(72, 50), ...fill(79, 4), ...fill(72, 50)]), out = A._internal.clean(tr);
  assert.equal(out.spikesRemoved, 4); assert.equal(Array.from(tr.hz).filter(v => !v).length, 4);
  tr = trackOf([...fill(72, 50), ...fill(74, 30), ...fill(72, 50)]); out = A._internal.clean(tr);
  assert.equal(out.spikesRemoved + out.octaveFolded, 0);
});
test('continuity: low-confidence frames are dropped', () => {
  const tr = trackOf(fill(72, 40)); tr.confidence.fill(0.2, 10, 20);
  assert.equal(A._internal.clean(tr).lowConfidence, 10);
  assert.equal(Array.from(tr.hz).filter(v => !v).length, 10);
});
test('octave rule: odd harmonics decide, a lone fundamental an octave below does not', () => {
  const ev = amps => ({amps:Float64Array.from([0, ...amps, ...new Array(8 - amps.length).fill(0)]), coverage:.95, periodicity:.95});
  // Sung C5 with weak fundamental: C5 has 1st/3rd/5th harmonics that C6 cannot explain.
  assert.equal(A._internal.octaveChoice(ev([.05, 1, .2, .3, .1]), ev([1, .3]), 1), 'low');
  // C6 voice over a 5 % C5 tone: C5 "explains" only one weak fundamental.
  assert.equal(A._internal.octaveChoice(ev([.05, 1, 0, .5, 0, .3]), ev([1, .5, .3]), 1), 'high');
  // A chord tone on the lower candidate's 3rd harmonic alone is not enough.
  assert.equal(A._internal.octaveChoice({...ev([.09, 1, .8, .6, 0, .9]), coverage:.76}, {...ev([1, .6, .9, .5, .4]), coverage:.67}, 1), null);
});
