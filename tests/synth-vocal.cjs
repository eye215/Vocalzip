// Synthetic "singing over an MR" recording with known answers, for vocal-analysis tests.
// Voice: harmonic tone (weak fundamental, like a phone mic), onset glides, vibrato on long notes,
// a known detune per note, breaths between phrases. MR: piano-like chords, a bass line and noise
// hits, quieter than the voice (the phone is next to the singer), also playing alone (intro/interlude).
'use strict';
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hz = cents => 440 * 2 ** ((cents - 6900) / 1200);

// Voice: [start s, duration s, MIDI note, detune cents, vibrato?] rendered as a harmonic tone with an onset scoop.
function voice(out, notes, sr, vg, vibrato, withVoice = true) {
  if (withVoice) for (const [t0, d, midi, det, vib] of notes) {
    const a = Math.floor(t0 * sr), len = Math.floor(d * sr); let phase = 0;
    for (let i = 0; i < len && a + i < out.length; i++) {
      const t = i / sr;
      let c = midi * 100 + det;
      if (t < 0.06) c -= 80 * (1 - t / 0.06);                           // scoop into the note
      if (vib && t > 0.3) c += vibrato.cents * Math.sin(2 * Math.PI * vibrato.rate * (t - 0.3)) * Math.min(1, (t - 0.3) / 0.3);
      c += 3 * Math.sin(2 * Math.PI * 0.7 * t);                         // slow natural drift (±3 cents)
      phase += 2 * Math.PI * hz(c) / sr;
      const env = Math.min(1, t / 0.03) * Math.min(1, (d - t) / 0.05);
      let s = 0;
      for (let h = 1; h <= 12; h++) { const f = h * hz(c); if (f > sr / 2.2) break; const amp = (h === 1 ? 0.5 : 1) / h * (h >= 3 && h <= 5 ? 1.4 : 1); s += amp * Math.sin(h * phase); }
      out[a + i] += vg * 0.3 * env * s;
    }
  }
}
// MR: piano-like chords every 2 s (whole song), a bass note, hi-hat noise. shift moves the chords (a transposed MR).
function accompaniment(out, sr, dur, mg, rand, shift = 0) {
  const n = out.length;
  const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
  for (let k = 0; k * 2 < dur; k++) {
    const chord = chords[k % chords.length], a = Math.floor(k * 2 * sr);
    for (const m of [...chord.map(x => x + 12), chord[0] - 24]) {
      const f = hz((m + shift) * 100), bass = m < 40;
      for (let i = 0; i < 2 * sr && a + i < n; i++) {
        const t = i / sr, env = Math.exp(-t * (bass ? 0.8 : 1.6));
        let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * h * f * t) / (h * h);
        out[a + i] += mg * (bass ? 0.35 : 0.18) * env * s;
      }
    }
  }
  for (let b = 0; b < dur * 4; b++) { const a = Math.floor(b * 0.25 * sr); for (let i = 0; i < 0.03 * sr && a + i < n; i++) out[a + i] += mg * 0.08 * (rand() * 2 - 1) * Math.exp(-i / (0.008 * sr)); }
}
/** Any melody: notes as above, over the same kind of MR (mrDb null = a cappella). */
function render({notes, dur, sr = 16000, voiceDb = 0, mrDb = -12, mrShift = 0, vibrato = {rate:5.5, cents:35}, seed = 1}) {
  const rand = rng(seed), out = new Float32Array(Math.floor(dur * sr));
  voice(out, notes, sr, 10 ** (voiceDb / 20), vibrato);
  if (mrDb != null) accompaniment(out, sr, dur, 10 ** (mrDb / 20), rand, mrShift);
  return {samples:out, sr};
}

function synth({sr = 44100, voiceDb = 0, mrDb = -12, vibrato = {rate:5.5, cents:40}, seed = 1, withVoice = true, transpose = 0, detune = 8} = {}) {
  const rand = rng(seed);
  // [start s, duration s, MIDI note, detune cents, vibrato?]
  const notes = [
    [3.0, 0.8, 57, 8, false], [3.85, 0.8, 60, 8, false], [4.7, 1.6, 64, 8, true],          // phrase 1 (A3 C4 E4)
    [6.8, 0.7, 62, 8, false], [7.55, 0.7, 64, 8, false], [8.3, 1.8, 67, 8, true],          // phrase 2 (D4 E4 G4)
    [14.0, 0.9, 69, 8, false], [14.95, 2.0, 72, 8, true], [17.4, 1.2, 71, 8, false]         // after an MR interlude (A4 C5 B4)
  ].map(([t, d, m, , v]) => [t, d, m + transpose, detune, v]);
  const dur = 20, n = Math.floor(dur * sr), out = new Float32Array(n);
  const vg = 10 ** (voiceDb / 20), mg = 10 ** (mrDb / 20);
  voice(out, notes, sr, vg, vibrato, withVoice);
  accompaniment(out, sr, dur, mg, rand);
  return {samples:out, sr, notes, truth:{
    range:['A3', 'C5'], detune, vibratoRate:vibrato.rate, vibratoCents:vibrato.cents,
    phrases:[[3.0, 6.3], [6.8, 10.1], [14.0, 16.95], [17.4, 18.6]]
  }};
}
module.exports = {synth, render};
