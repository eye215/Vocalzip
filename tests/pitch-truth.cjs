// Synthetic recordings with a known sung pitch at every moment, and a scorer for the analyzer's curve.
// Used by tests/pitch-ground-truth.test.cjs and tools/pitch-bench.cjs (before/after comparisons).
// Everything is generated: these numbers say nothing about real recordings.
'use strict';
const hzOf = cents => 440 * 2 ** ((cents - 6900) / 1200);
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
// A singer's spectrum: weak-ish fundamental, strong 2nd, odd and even harmonics both present.
const VOICE = [0.35, 1, 0.7, 0.5, 0.4, 0.25, 0.18, 0.12, 0.08, 0.05];
const PIANO = Array.from({length:8}, (_, i) => 1 / (i + 1) ** 2);

/** notes: {t, d, midi, cents?, harm?, amp?, vib?:{rate,cents}, octaveSpikes?:[seconds…]} (voice);
 * layers: same shape, not sung (accompaniment, blips) — never part of the truth;
 * noise: [{t, d, amp}] white noise. */
function render({seconds, sr = 16000, notes = [], layers = [], noise = [], seed = 1}) {
  const n = Math.ceil(seconds * sr), x = new Float32Array(n), rand = rng(seed);
  const add = (note, voice) => {
    const harm = note.harm || VOICE, amp = note.amp ?? 0.25, a = Math.floor(note.t * sr), len = Math.floor(note.d * sr);
    const fade = note.fade ?? 0.02, decay = note.decay || 0;
    const phase = new Float64Array(harm.length);
    for (let i = 0; i < len && a + i < n; i++) {
      const t = i / sr, c = centsAt(note, t);
      const env = Math.min(1, t / fade, (note.d - t) / fade) * Math.exp(-decay * t);
      // Octave-error bait: for 50 ms the odd harmonics vanish, so the waveform really repeats an octave higher.
      const spike = voice && (note.octaveSpikes || []).some(s => t >= +s && t < +s + (note.spikeSeconds || 0.05));
      let s = 0;
      for (let h = 1; h <= harm.length; h++) {
        phase[h - 1] += 2 * Math.PI * h * hzOf(c) / sr;
        if (h * hzOf(c) >= sr / 2 || (spike && h % 2)) continue;
        s += harm[h - 1] * Math.sin(phase[h - 1]);
      }
      x[a + i] += amp * env * s;
    }
  };
  notes = notes.map(note => ({drift:true, ...note}));
  for (const note of notes) add(note, true);
  for (const layer of layers) add(layer, false);
  for (const z of noise) for (let i = Math.floor(z.t * sr); i < Math.min(n, Math.floor((z.t + z.d) * sr)); i++) x[i] += z.amp * (rand() * 2 - 1);
  return {samples:x, sr, notes, seconds};
}
function centsAt(note, t) {
  let c = note.midi * 100 + (note.cents || 0);
  // A held human note is never dead flat: slow drift of a few cents (instruments get none).
  if (note.drift) c += 8 * Math.sin(2 * Math.PI * 0.9 * t) + 4 * Math.sin(2 * Math.PI * 2.3 * t + 1) + 3 * Math.sin(2 * Math.PI * 5.1 * t + 2);
  if (note.vib && t > 0.3) c += note.vib.cents * Math.sin(2 * Math.PI * note.vib.rate * (t - 0.3)) * Math.min(1, (t - 0.3) / 0.3);
  return c;
}
/** Truth for one 50 ms curve point. The analyzer stamps a frame with its window start; the window is
 * 64 ms long, so point i covers ≈ [i·50 + 32, i·50 + 82] ms of audio. null = silence/MR only,
 * undefined = too close to a boundary to score. */
function truthAt(rec, i, margin = 0.07) {
  const a = i * 0.05 + 0.032, b = a + 0.05, mid = (a + b) / 2;
  for (const note of rec.notes) {
    if (b <= note.t - margin || a >= note.t + note.d + margin) continue;
    if (a >= note.t + margin && b <= note.t + note.d - margin) return centsAt(note, mid - note.t);
    return undefined;
  }
  return null;
}
/** Frame-level scores against the truth (50 ms points). */
function score(rec, result) {
  let voiced = 0, hit = 0, octave = 0, found = 0, silent = 0, alarms = 0, gross = 0;
  result.curve.forEach((v, i) => {
    const truth = truthAt(rec, i);
    if (truth === undefined) return;
    if (truth === null) { silent++; if (v != null) alarms++; return; }
    voiced++; if (v == null) return; found++;
    const e = v - truth;
    if (Math.abs(e) <= 50) hit++;
    else if (Math.abs(Math.abs(e) - 1200) <= 50) octave++;
    else gross++;
  });
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
  return {accuracy:pct(hit, voiced), octaveErrors:pct(octave, voiced), otherErrors:pct(gross, voiced), voicedRecall:pct(found, voiced), falseAlarm:pct(alarms, silent), points:voiced};
}
const C = (t, d, midi, more = {}) => ({t, d, midi, ...more});
const legato = (start, list, more = {}) => { let t = start; return list.map(([midi, d]) => { const n = C(t, d, midi, more); t += d; return n; }); };
const sub = (notes, k, amp, harm = [1]) => notes.map(n => ({t:n.t, d:n.d, midi:n.midi - 12 * k, amp, harm}));

/** The ground-truth scenarios: [name, recording, expected effective (valid) high or null]. */
function scenarios() {
  const melody = legato(0.3, [[72, 1], [76, 1], [79, 1], [84, 1]]); // C5 E5 G5 C6
  const take = (k, harm, more = {}, layers = []) => {
    const notes = [C(0.3, 0.6, 57), C(1.0, 0.6, 60), C(1.7, 0.8, 64), C(2.6, 0.6, 67), C(3.4, 0.9, 72, {vib:more.vib}), C(4.4, 0.7, 71)]
      .map(n => ({...n, harm, cents:more.detune || 0}));
    return render({seconds:5.4, notes, layers:[...layers, ...sub(notes, 1, 0.03, PIANO)], noise:[{t:0, d:5.4, amp:more.noise || 0.002}], seed:k});
  };
  return [
    ['C5 pure tone', render({seconds:2.8, notes:[C(0.3, 2.4, 72, {harm:[1]})]}), 'C5'],
    ['C5 strong harmonics (voice-like)', render({seconds:2.8, notes:[C(0.3, 2.4, 72)]}), 'C5'],
    ['C5 weak fundamental (.1,1,.3)', render({seconds:2.8, notes:[C(0.3, 2.4, 72, {harm:[.1, 1, .3]})]}), 'C5'],
    ['C5 very weak fundamental (.05,1,.2,.3,.1)', render({seconds:2.8, notes:[C(0.3, 2.4, 72, {harm:[.05, 1, .2, .3, .1]})]}), 'C5'],
    ['C5 missing fundamental (0,1,.5,.3)', render({seconds:2.8, notes:[C(0.3, 2.4, 72, {harm:[0, 1, .5, .3]})]}), 'C5'],
    ['C4→C5→C4 sung leaps (legato)', render({seconds:3.4, notes:legato(0.3, [[60, 1], [72, 1], [60, 1]])}), 'C5'],
    ['C5→C6 sung leap', render({seconds:2.4, notes:legato(0.3, [[72, 1], [84, 1]])}), 'C6'],
    ['held C5/G4 + 50 ms octave spikes, blip, noise burst', render({seconds:5, notes:[C(0.3, 2.6, 72, {octaveSpikes:[0.6, 1.4, 2.0]}), C(3.1, 1.6, 67, {octaveSpikes:[0.5, 1.0]})],
      layers:[C(2.0, 0.05, 88, {amp:0.5, harm:[1, .4], fade:0.005})], noise:[{t:2.6, d:0.05, amp:0.4}]}), 'C5'],
    ['held C5 + 100 ms octave flips', render({seconds:3.2, notes:[C(0.3, 2.6, 72, {octaveSpikes:[0.5, 1.1, 1.7], spikeSeconds:0.1, harm:[.15, 1, .35, .5, .2, .2]})]}), 'C5'],
    ['melody + 5% pure sub-octave tone', render({seconds:4.5, notes:melody, layers:sub(melody, 1, 0.05 * 0.25)}), 'C6'],
    ['pure-tone melody + 5% sub-octave tone', render({seconds:4.5, notes:melody.map(n => ({...n, harm:[1]})), layers:sub(melody, 1, 0.05 * 0.25)}), 'C6'],
    ['melody + piano octave-below doubling (−12 dB)', render({seconds:4.5, notes:melody, layers:sub(melody, 1, 0.25 * 0.25, PIANO)}), 'C6'],
    ['E5 melody + quiet A3–C#4–E4 triad', (() => { const notes = legato(0.3, [[76, 1.2], [73, 0.8], [76, 1.2], [69, 0.8]]);
      return render({seconds:4.5, notes, layers:[57, 61, 64].map(m => C(0.2, 4.2, m, {amp:0.05, harm:PIANO, fade:0.01}))}); })(), 'E5'],
    ['silence + noise segments between notes', render({seconds:6, notes:[C(0.3, 1, 69), C(2.3, 1, 74), C(4.3, 1, 77)],
      noise:[{t:1.5, d:0.6, amp:0.05}, {t:3.5, d:0.6, amp:0.2}, {t:5.5, d:0.4, amp:0.02}]}), 'F5'],
    ...[[VOICE, {}], [[.15, 1, .5, .3, .2], {detune:12, vib:{rate:5.5, cents:35}}], [[.6, 1, .4, .3, .2, .1], {detune:-10, noise:0.01}]]
      .map(([harm, more], k) => ['same song take ' + (k + 1), take(k + 1, harm, more, k === 2 ? [C(2.45, 0.05, 88, {amp:0.4, harm:[1], fade:0.005})] : []), 'C5'])
  ];
}
module.exports = {render, score, scenarios, truthAt, VOICE, PIANO, hzOf};
