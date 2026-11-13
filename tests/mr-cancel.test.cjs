// 알고 있는 MR 빼기 (app/mr-cancel.js): line the song's own MR up with a take and subtract it, so the voice can be
// measured. Synthetic signals only (tests/helpers/mr-synth.cjs): a song-like MR, a melody with vibrato and phrase gaps,
// and a phone recording of both through a small room, the MR louder than the voice.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/mr-cancel.js'), A = require('../app/vocal-analysis.js'), Y = require('./helpers/mr-synth.cjs');
const MR = Y.mr(60), V = Y.vocal(20);
/** How far the MR part of the recording is pushed down in the result (true voice known). */
const suppression = (out, v, rec) => { let r = 0; for (let i = 0; i < v.length; i++) { const d = out[i] - v[i]; r += d * d; } return 20 * Math.log10(Y.rms(rec.mrPart) / Math.sqrt(r / v.length)); };
const analyze = x => A.analyze(Float32Array.from(x), Y.SR);

test('finds where the take sits in the MR and removes the MR, so a held-back take becomes measurable', () => {
  const rec = Y.record(V.x, MR, {offset:12.345, db:6}), before = Float32Array.from(rec.x), mrBefore = Float32Array.from(MR);
  const out = C.cancel(rec.x, MR);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(Math.abs(out.report.offsetSeconds - 12.345) <= 0.002, 'offset ' + out.report.offsetSeconds);
  assert.ok(Math.abs(out.report.speed - 1) < 1e-4);
  assert.ok(suppression(out.voice, V.x, rec) >= 15, 'MR pushed down by ' + suppression(out.voice, V.x, rec).toFixed(1) + ' dB');
  assert.deepEqual(rec.x, before, 'the recording is not changed'); assert.deepEqual(MR, mrBefore, 'the MR is not changed');
  const clean = analyze(V.x), mixed = analyze(rec.x), cleaned = analyze(out.voice);
  // The mixed take fails the 0.8 pitch-confidence rule (판정 보류); after removing the MR it passes and finds the notes.
  assert.ok(mixed.confidence.pitchConfidence < 0.8, 'mixed ' + mixed.confidence.pitchConfidence);
  assert.ok(cleaned.confidence.pitchConfidence >= 0.9, 'cleaned ' + cleaned.confidence.pitchConfidence);
  assert.ok(cleaned.metrics.intonation.notes >= clean.metrics.intonation.notes - 2, 'notes ' + cleaned.metrics.intonation.notes + ' / ' + clean.metrics.intonation.notes);
  assert.ok(Math.abs(cleaned.metrics.intonation.meanAbsCents - clean.metrics.intonation.meanAbsCents) <= 3);
});

test('a much louder MR (12 dB over the voice) is still removed', () => {
  const rec = Y.record(V.x, MR, {db:12}), out = C.cancel(rec.x, MR);
  assert.equal(out.ok, true);
  assert.ok(suppression(out.voice, V.x, rec) >= 15);
  assert.ok(analyze(out.voice).confidence.pitchConfidence >= 0.9);
});

test('a copy of the MR playing slightly faster or slower (±0.5 %) is followed', () => {
  for (const speed of [0.995, 1.003, 1.005]) {
    const rec = Y.record(V.x, MR, {speed, offset:5}), out = C.cancel(rec.x, MR);
    assert.equal(out.ok, true, 'speed ' + speed);
    assert.ok(Math.abs(out.report.speed - speed) < 2e-4, speed + ' → ' + out.report.speed);
    assert.ok(suppression(out.voice, V.x, rec) >= 15, 'speed ' + speed);
  }
});

test('a take that starts before the MR (singing or silence first) lines up with a negative offset', () => {
  const lead = new Float32Array(3 * Y.SR + MR.length); lead.set(MR, 3 * Y.SR);
  const v = Y.vocal(25), rec = Y.record(v.x, lead, {offset:0}), out = C.cancel(rec.x, MR);
  assert.equal(out.ok, true);
  assert.ok(Math.abs(out.report.offsetSeconds + 3) <= 0.002, 'offset ' + out.report.offsetSeconds);
  assert.ok(suppression(out.voice, v.x, rec) >= 15);
});

test('a different MR is not subtracted: the take is left alone and the reason is given', () => {
  const rec = Y.record(V.x, MR), other = Y.mr(60, 5).map((_, i, a) => a[(i * 7) % a.length]);
  const out = C.cancel(rec.x, other);
  assert.equal(out.ok, false); assert.equal(out.reason, 'no-match'); assert.equal(out.voice, undefined);
  assert.equal(C.cancel(rec.x.subarray(0, Y.SR), MR).reason, 'short');
});

test('the analysis worker path measures the voice with the MR taken out, and names the MR it used', () => {
  const rec = Y.record(V.x, MR, {offset:8, db:8}), other = Y.mr(60, 5).map((_, i, a) => a[(i * 7) % a.length]);
  const out = A.analyzeWithoutMr(Float32Array.from(rec.x), Y.SR, [{id:'wrong', samples:other, sampleRate:Y.SR}, {id:'mr-1', samples:MR, sampleRate:Y.SR}]);
  assert.ok(out.result, JSON.stringify(out.reasons));
  assert.deepEqual(out.reasons, ['no-match']); // the other file was tried and left out
  assert.equal(out.result.confidence.mrRemoved.trackId, 'mr-1');
  assert.ok(Math.abs(out.result.confidence.mrRemoved.offsetSeconds - 8) <= 0.002);
  assert.ok(out.result.confidence.pitchConfidence >= 0.9);
  assert.equal(out.result.voice.length, rec.x.length); assert.equal(out.result.voiceRate, 8000);
  assert.equal(A.analyzeWithoutMr(Float32Array.from(rec.x), Y.SR, [{id:'wrong', samples:other, sampleRate:Y.SR}]).result, null);
});

test('wobble-type changes of a take measured with its MR removed are shown as observed, not judged', () => {
  const G = require('../app/growth-metrics-model.js');
  const take = (id, date, wobble, mr) => ({id, date, ok:true, a:{v:2, metrics:{stability:{wobbleCents:wobble, notes:20}, intonation:{meanAbsCents:10, notes:20}}, confidence:{pitchConfidence:0.95, ...(mr ? {mrRemoved:{trackId:'mr-1', removedDb:9}} : {})}}});
  const plain = G.compareMetric('stability', take('a', '2026-10-01', 12, false), take('b', '2026-11-01', 6, false));
  assert.equal(plain.state, 'better');
  const cleaned = G.compareMetric('stability', take('a', '2026-10-01', 12, false), take('b', '2026-11-01', 6, true));
  assert.equal(cleaned.state, 'changed'); assert.equal(cleaned.note, 'mr-removed'); assert.equal(cleaned.judged, 'better');
  assert.equal(cleaned.before, 12); assert.equal(cleaned.after, 6); // the measured values are still shown
  // Pitch accuracy is still judged on the cleaned take.
  assert.notEqual(G.compareMetric('intonation', take('a', '2026-10-01', 12, false), take('b', '2026-11-01', 6, true)).state, 'changed');
  assert.match(G.MR_REMOVED_NOTE, /참고/);
});

test('a take measured after AI separation is judged as usual and labelled AI 분리 후 측정(참고)', () => {
  const G = require('../app/growth-metrics-model.js');
  const take = (id, date, wobble, ai) => ({id, date, ok:true, a:{v:2, metrics:{stability:{wobbleCents:wobble, notes:20}, intonation:{meanAbsCents:wobble, notes:20}}, confidence:{pitchConfidence:0.95, ...(ai ? {aiSeparated:{model:'htdemucs'}} : {})}}});
  for (const id of ['stability', 'intonation']) {
    const x = G.compareMetric(id, take('a', '2026-10-01', 14, false), take('b', '2026-11-01', 6, true));
    assert.equal(x.state, 'better', id); assert.equal(x.note, 'ai-separated', id);
  }
  assert.equal(G.compareMetric('stability', take('a', '2026-10-01', 14, false), take('b', '2026-11-01', 6, false)).note, undefined);
  assert.equal(G.AI_SEPARATED_NOTE, 'AI 분리 후 측정(참고)');
});
