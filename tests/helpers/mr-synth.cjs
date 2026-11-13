// Synthetic song-like MR, a sung melody and a phone recording of both (8 kHz mono, deterministic) for mr-cancel tests.
// No real recordings are used.
const SR = 8000;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const midiHz = m => 440 * 2 ** ((m - 69) / 12);
function mr(seconds, seed = 1) {
  const n = Math.round(seconds * SR), x = new Float32Array(n), r = rng(seed);
  const pool = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59], [40, 47, 55], [50, 57, 65]];
  // A song-like progression: a verse/chorus pattern that repeats, with variations (not an exact loop).
  const prog = Array.from({length:Math.ceil(seconds / 2) + 1}, (_, k) => pool[(k % 8 < 4 ? [0, 1, 2, 3] : [4, 5, 2, 3])[k % 4] + (r() < 0.25 ? 1 : 0)] || pool[0]);
  for (let i = 0; i < n; i++) {
    const t = i / SR, c = prog[Math.floor(t / 2)];
    let v = 0;
    for (const m of c) { const f = midiHz(m); for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t + h) * 0.12 / h; }
    v += Math.sin(2 * Math.PI * midiHz(c[0] - 12) * t) * 0.25 * Math.exp(-((t % 0.5) * 6));
    x[i] = v;
  }
  // drums: noise bursts every 0.5 s (snare on the off beat), decaying
  for (let b = 0; b * 0.25 < seconds; b++) { if (b % 2 && r() < 0.3) continue; const start = Math.round(b * 0.25 * SR), amp = (b % 2 ? 0.5 : 0.3) * (0.6 + 0.8 * r()); for (let i = 0; i < 1200 && start + i < n; i++) x[start + i] += (r() * 2 - 1) * amp * Math.exp(-i / 250); }
  return x;
}
/** Vocal: notes 0.8 s with vibrato, phrase gaps; returns samples and the true pitch (MIDI×100) per 10 ms or null. */
function vocal(seconds, seed = 7) {
  const n = Math.round(seconds * SR), x = new Float32Array(n), truth = [];
  const melody = [60, 62, 64, 65, 67, 65, 64, 62, 64, 67, 69, 67, 65, 64, 62, 60];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, slot = Math.floor(t / 0.8), inPhrase = (slot % 5) !== 4, m = melody[slot % melody.length];
    const local = t - slot * 0.8, env = inPhrase ? Math.min(1, local / 0.05) * Math.min(1, (0.8 - local) / 0.05) : 0;
    const cents = m * 100 + 30 * Math.sin(2 * Math.PI * 5.5 * t), f = 440 * 2 ** ((cents - 6900) / 1200);
    phase += 2 * Math.PI * f / SR;
    let v = 0; for (let h = 1; h <= 8; h++) v += Math.sin(phase * h) * 0.25 / h ** 1.2;
    x[i] = v * env;
    if (i % 80 === 0) truth.push(env > 0.9 ? cents : null);
  }
  return {x, truth};
}
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
/** Recording: vocal + room-filtered MR from offset (s), MR played at speed (1 = same), MR louder by db. */
function record(v, m, {offset = 12.345, speed = 1, db = 6, noise = 0.003, seed = 3} = {}) {
  const n = v.length, heard = new Float32Array(n), r = rng(seed);
  for (let i = 0; i < n; i++) { const p = offset * SR + i * speed, k = Math.floor(p), f = p - k; heard[i] = k + 1 < m.length ? m[k] * (1 - f) + m[k + 1] * f : 0; }
  const taps = [[0, 1], [40, 0.35], [100, 0.15], [230, 0.08]], room = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (const [d, g] of taps) if (i - d >= 0) s += heard[i - d] * g; room[i] = s; }
  const gain = rms(v) / rms(room) * 10 ** (db / 20), out = new Float32Array(n), mrPart = new Float32Array(n);
  for (let i = 0; i < n; i++) { mrPart[i] = room[i] * gain; out[i] = v[i] + mrPart[i] + (r() * 2 - 1) * noise; }
  return {x:out, mrPart};
}
module.exports = {SR, mr, vocal, record, rms};
