// A synthetic original recording (AR) of the test song (tests/helpers/score-song.cjs) for 원곡(AR) 음정 비교:
// the original singer (vibrato, rubato, a tuning offset, a few of their own "style" notes that differ from the score,
// an ad-lib in a rest) over a full band (piano chords, bass, hi-hat from tests/synth-vocal.cjs, a sustained pad), a
// backing harmony a third below in the chorus and a short instrumental fill. Returns the audio and, per sung note,
// which score note it is (null for the ad-lib) — the truth the tests compare the extracted reference with.
'use strict';
const {render} = require('../synth-vocal.cjs');
const S = require('./score-song.cjs');
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const thirdBelow = m => { for (let d = 3; d <= 4; d++) if (SCALE.includes(((m - d) % 12 + 12) % 12)) return m - d; return m - 3; };
const hz = c => 440 * 2 ** ((c - 6900) / 1200);

function ar(song, {tuning = 20, bandDb = -6, padDb = -12, harmony = true, harmonyDb = -9, adlib = true, fill = true, style = {70:2, 101:-1}, tempo = 104, seed = 11, from = 1, to = song.measures.length} = {}) {
  const lead = S.sing(song, {from, to, tempo, rubato:0.05, jitter:0.02, detune:10, wrong:style, mrDb:null, seed, lead:4});
  const notes = lead.sung.map(([on, d, m, det, v]) => [on, d, m, det + tuning, v]);
  const truth = lead.truth.map(x => ({i:x.i, mi:x.mi, t:x.t, dur:x.dur, style:style[x.i] || 0}));
  // Ad-lib in the rest after the second section's last note: a short high run, not in the score.
  if (adlib) {
    const k = lead.truth.findIndex((x, j) => x.mi === 15 && lead.truth[j + 1]?.mi === 16);
    if (k >= 0) { const end = lead.sung[k][0] + lead.sung[k][1] + 0.08; [76, 74, 72].forEach((m, j) => { notes.push([end + j * 0.18, 0.16, m, tuning, false]); truth.push({i:null, t:end + j * 0.18, dur:0.16, adlib:true}); }); }
  }
  const dur = Math.max(...notes.map(n => n[0] + n[1])) + 3;
  const voice = render({notes, dur, sr:16000, mrDb:null, vibrato:{rate:5.8, cents:40}, seed});
  const band = render({notes:[], dur, sr:16000, mrDb:bandDb, mrShift:tuning / 100, seed:seed + 1});
  const out = voice.samples;
  for (let i = 0; i < out.length; i++) out[i] += band.samples[i];
  if (harmony) { // chorus (measures 17–24): a quieter second voice a third below
    const h = lead.sung.filter((_, j) => lead.truth[j].mi >= 16 && lead.truth[j].mi < 24).map(([on, d, m, det, v]) => [on + 0.01, d, thirdBelow(m), det + tuning, v]);
    const hv = render({notes:h, dur, sr:16000, voiceDb:harmonyDb, mrDb:null, vibrato:{rate:5.2, cents:30}, seed:seed + 2});
    for (let i = 0; i < out.length; i++) out[i] += hv.samples[i];
  }
  // Pad: sustained chord tones (strings/synth) under everything.
  const pg = 10 ** (padDb / 20), chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
  for (let k = 0; k * 4 < dur; k++) for (const m of chords[k % 4]) {
    const f = hz((m + tuning / 100) * 100), a = Math.floor(k * 4 * 16000);
    for (let i = 0; i < 4 * 16000 && a + i < out.length; i++) { const t = i / 16000, env = Math.min(1, t / 0.4, (4 - t) / 0.4); out[a + i] += pg * 0.12 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)); }
  }
  // Instrumental fill (a guitar-like line with vibrato) in the intro: melodic, not the singer.
  if (fill) {
    const fn = [[0.6, 0.5, 79, tuning, false], [1.15, 0.5, 81, tuning, false], [1.7, 1.2, 76, tuning, true]];
    const fv = render({notes:fn, dur, sr:16000, voiceDb:-6, mrDb:null, vibrato:{rate:6.5, cents:25}, seed:seed + 3});
    for (let i = 0; i < out.length; i++) out[i] += fv.samples[i];
  }
  return {samples:out, sr:16000, truth, notes, tuning};
}
/** Which score note an extracted reference note is (largest overlap with the AR truth), null when none. */
function scoreNoteOf(refNote, truth) {
  let best = null, ov = 0;
  for (const x of truth) { const o = Math.min(refNote.t + refNote.dur, x.t + x.dur) - Math.max(refNote.t, x.t); if (o > ov) { ov = o; best = x; } }
  return ov > 0.05 ? best : null;
}
module.exports = {ar, scoreNoteOf, thirdBelow};
