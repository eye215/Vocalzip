// Synthetic takes for the 소리 길 흔적 specs: a sung-like phrase as 16-bit mono WAV, made in the page (or in Node).
// take('worse'): slow irregular wobble, three 80 ms dropouts and three 100 ms octave flips, a little noise.
// take('better'): the same notes with a 5.5 Hz vibrato and nothing else. take('bass'): the better voice over a bass line.
// `seconds` repeats the phrase up to that length; `rate` is the WAV's sample rate (8000 keeps a long take small).
// Kept as source text so a spec can run it inside the browser: page.evaluate(`(${source})()`) defines window.vpTake.
const source = `() => {
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  // kind: 'worse' | 'better' | 'bass' (the better voice with a bass line; bassDb = its level against the voice, default +4 dB)
  const samples = (kind, seconds = 34, SR = 16000, bassDb = 4) => {
    const worse = kind === 'worse', out = new Float32Array(Math.round(seconds * SR));
    let seed = worse ? 7 : 11; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const bend = worse ? t => 22 * Math.sin(2 * Math.PI * 1.4 * t) + 15 * Math.sin(2 * Math.PI * 2.3 * t) : t => 30 * Math.sin(2 * Math.PI * 5.5 * t) + 4 * Math.sin(2 * Math.PI * 0.7 * t);
    const tone = (at, dur, midi, {b = bend, attack = 0.03, release = 0.05} = {}) => {
      const a = Math.round(at * SR), n = Math.round(dur * SR); let phase = 0;
      for (let i = 0; i < n && a + i < out.length; i++) {
        const t = i / SR, f = hz(midi) * Math.pow(2, b(t) / 1200);
        phase += 2 * Math.PI * f / SR;
        let s = 0; for (let h = 1; h <= 16 && h * f < SR / 2.2; h++) s += (h === 1 ? 0.6 : 1) / h * Math.sin(h * phase);
        out[a + i] += 0.2 * s * Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
      }
    };
    const notes = [57, 60, 64, 67, 69, 64, 60, 62, 57];
    for (let k = 0, at = 0.5; at + 3.2 < seconds; k++, at += 3.6) {
      const midi = notes[k % notes.length];
      if (worse && k % 3 === 0) { tone(at, 1.4, midi, {release:0.005}); tone(at + 1.48, 1.6, midi, {b:t => (t > 0.5 && t < 0.6 ? 1200 : 0) + bend(t), attack:0.005}); }
      else tone(at, 3.08, midi);
    }
    if (worse) for (let i = 0; i < out.length; i++) out[i] += 0.02 * (rand() * 2 - 1);
    if (kind === 'bass') {
      // A plucked bass line under everything (E2 A2 D2 G2, a note every 0.9 s), set to bassDb against the voice.
      let pv = 0; for (let i = 0; i < out.length; i++) pv += out[i] * out[i];
      const bass = new Float32Array(out.length), line = [40, 45, 38, 43];
      for (let k = 0; k * 0.9 < seconds; k++) { const f = hz(line[k % line.length]), a = Math.round(k * 0.9 * SR); for (let i = 0; i < 0.9 * SR && a + i < bass.length; i++) { const t = i / SR; let s = 0; for (let h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * h * f * t) / h; bass[a + i] += s * Math.min(1, t / 0.01) * Math.exp(-t * 1.2); } }
      let pb = 0; for (let i = 0; i < bass.length; i++) pb += bass[i] * bass[i];
      const g = Math.sqrt(pv / pb) * Math.pow(10, bassDb / 20);
      for (let i = 0; i < out.length; i++) out[i] += g * bass[i];
    }
    return out;
  };
  const wav = (x, SR = 16000) => {
    let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    const g = peak > 0.98 ? 0.98 / peak : 1;
    const n = x.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i] * g)) * 32767, true);
    return buf;
  };
  const api = {SR:16000, samples, wav, take:(kind, seconds, rate, bassDb) => wav(samples(kind, seconds, rate || 16000, bassDb), rate || 16000)};
  if (typeof window !== 'undefined') window.vpTake = api;
  return api;
}`;
module.exports = {source, make:() => (0, eval)('(' + source + ')')()};
