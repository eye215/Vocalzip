// app/voice-path-model.js — 소리 길 흔적 (시험판): traces measured from synthetic signals made here (no fixtures, no audio
// files). The thresholds are first guesses; these tests fix the ORDER and the presence of each trace, not calibrated values.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/voice-path-model.js');
const C = require('../app/mr-cancel.js'), Y = require('./helpers/mr-synth.cjs'), AUDIO = require('./helpers/voice-path-audio.cjs').make();
const SR = 16000, T = P.THRESHOLDS;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** A sung-like tone: harmonics with amplitudes amp(h), pitch in cents around `midi` given by bend(t), fade in / out. */
function tone(out, at, dur, midi, {bend = () => 0, amp = h => 1 / h, gain = 0.2, harmonics = 20, attack = 0.03, release = 0.05} = {}) {
  const a = Math.round(at * SR), n = Math.round(dur * SR); let phase = 0;
  for (let i = 0; i < n && a + i < out.length; i++) {
    const t = i / SR, f = hz(midi) * 2 ** (bend(t) / 1200);
    phase += 2 * Math.PI * f / SR;
    let s = 0; for (let h = 1; h <= harmonics && h * f < SR / 2.2; h++) s += amp(h) * Math.sin(h * phase);
    out[a + i] += gain * s * Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
  }
  return out;
}
const blank = seconds => new Float32Array(Math.round(seconds * SR));
const noise = (out, gain, seed = 7) => { const r = rng(seed); for (let i = 0; i < out.length; i++) out[i] += gain * (r() * 2 - 1); return out; };

test('steady tone vs wobbly tone: the wobble shows as a larger pitch SD on the sustained note', () => {
  const steady = P.analyze(tone(blank(3), 0.3, 2.4, 60), SR);
  // Slow, irregular wander (1.3 Hz and 2.1 Hz, ±25 cents): not a vibrato.
  const wobbly = P.analyze(tone(blank(3), 0.3, 2.4, 60, {bend:t => 25 * Math.sin(2 * Math.PI * 1.3 * t) + 18 * Math.sin(2 * Math.PI * 2.1 * t + 1)}), SR);
  assert.equal(steady.sustain.notes, 1); assert.equal(wobbly.sustain.notes, 1);
  assert.ok(steady.sustain.pitchSdCents < 3, 'steady: ' + steady.sustain.pitchSdCents);
  assert.ok(wobbly.sustain.pitchSdCents > 15, 'wobbly: ' + wobbly.sustain.pitchSdCents);
  assert.equal(wobbly.sustain.vibrato.notes, 0, 'a slow wander is not counted as vibrato');
  assert.ok(Math.abs(steady.sustain.list[0].semitone - 60) < 0.1, 'pitch found: ' + steady.sustain.list[0].semitone);
});

test('slow drift on a held note is reported in cents per second', () => {
  const r = P.analyze(tone(blank(3), 0.3, 2.2, 62, {bend:t => 20 * t}), SR);   // rises 20 cents every second
  assert.equal(r.sustain.notes, 1);
  assert.ok(Math.abs(r.sustain.list[0].driftCentsPerS - 20) < 3, 'drift ' + r.sustain.list[0].driftCentsPerS);
});

test('an 80 ms dropout inside a held note is one break, with its time; a 400 ms rest is not', () => {
  const x = blank(4);
  tone(x, 0.3, 1.0, 60, {release:0.005}); tone(x, 1.38, 1.0, 60, {attack:0.005});   // 80 ms of silence at 1.30 s
  tone(x, 2.8, 1.0, 60);                                                             // after a 420 ms rest
  const r = P.analyze(x, SR);
  assert.equal(r.transitions.breakCount, 1, JSON.stringify(r.transitions.breaks));
  const b = r.transitions.breaks[0];
  assert.ok(Math.abs(b.t - 1.3) < 0.03, 'time ' + b.t);
  assert.ok(b.ms >= T.BREAK_MIN_MS && b.ms <= 100, 'length ' + b.ms);
  assert.equal(b.kind, 'quiet');
  assert.ok(r.transitions.breaksPerMin > 0);
  assert.equal(r.transitions.flipCount, 0);
});

test('a dropout between two different notes (4 semitones apart) is not a break inside a phrase', () => {
  const x = blank(3);
  tone(x, 0.3, 1.0, 60, {release:0.005}); tone(x, 1.38, 1.0, 64, {attack:0.005});
  assert.equal(P.analyze(x, SR).transitions.breakCount, 0);
});

test('an octave flip of 100 ms is a short flip; an octave jump held 300 ms and back is an octave flip; a leap that stays is melody', () => {
  const up = (from, to) => t => t >= from && t < to ? 1200 : 0;
  const short = P.analyze(tone(blank(3), 0.3, 2.4, 57, {bend:up(1.0, 1.1)}), SR);
  assert.equal(short.transitions.flipCount, 1, JSON.stringify(short.transitions.flips));
  assert.equal(short.transitions.flips[0].kind, 'short');
  assert.ok(Math.abs(short.transitions.flips[0].t - 1.3) < 0.04, 'time ' + short.transitions.flips[0].t);
  assert.ok(Math.abs(short.transitions.flips[0].semitones - 12) < 1);
  const held = P.analyze(tone(blank(3), 0.3, 2.4, 57, {bend:up(1.0, 1.3)}), SR);
  assert.equal(held.transitions.flipCount, 1, JSON.stringify(held.transitions.flips));
  assert.equal(held.transitions.flips[0].kind, 'octave');
  assert.equal(held.transitions.octaveFlips, 1);
  const leap = P.analyze(tone(blank(3), 0.3, 2.4, 57, {bend:t => t >= 1.0 ? 700 : 0}), SR);   // up a fifth and stays
  assert.equal(leap.transitions.flipCount, 0, JSON.stringify(leap.transitions.flips));
  const fifth = P.analyze(tone(blank(3), 0.3, 2.4, 57, {bend:t => t >= 1.0 && t < 1.3 ? 700 : 0}), SR);   // a fifth for 300 ms: melody, not an octave
  assert.equal(fifth.transitions.flipCount, 0);
});

test('bright vs dark spectra: centroid, 2–4 kHz ratio and tilt keep the order', () => {
  const dark = P.analyze(tone(blank(3), 0.3, 2.4, 60, {amp:h => 1 / (h * h)}), SR);
  const bright = P.analyze(tone(blank(3), 0.3, 2.4, 60, {amp:h => (h >= 8 && h <= 13 ? 2 : 1) / Math.sqrt(h)}), SR);
  assert.ok(bright.resonance.centroidHz > dark.resonance.centroidHz + 300, bright.resonance.centroidHz + ' vs ' + dark.resonance.centroidHz);
  assert.ok(bright.resonance.ratioDb > dark.resonance.ratioDb + 10, bright.resonance.ratioDb + ' vs ' + dark.resonance.ratioDb);
  assert.ok(bright.resonance.tiltDbPerOct > dark.resonance.tiltDbPerOct + 3, bright.resonance.tiltDbPerOct + ' vs ' + dark.resonance.tiltDbPerOct);
});

test('added noise lowers the harmonics-to-noise ratio', () => {
  const clean = P.analyze(tone(blank(3), 0.3, 2.4, 60), SR);
  const breathy = P.analyze(noise(tone(blank(3), 0.3, 2.4, 60), 0.06), SR);
  const more = P.analyze(noise(tone(blank(3), 0.3, 2.4, 60), 0.15), SR);
  assert.ok(clean.breath.hnrDb > breathy.breath.hnrDb + 5, clean.breath.hnrDb + ' vs ' + breathy.breath.hnrDb);
  assert.ok(breathy.breath.hnrDb > more.breath.hnrDb + 2, breathy.breath.hnrDb + ' vs ' + more.breath.hnrDb);
});

test('a 5.5 Hz vibrato is detected with its rate, extent and regularity, and is not counted as wobble', () => {
  const r = P.analyze(tone(blank(3), 0.3, 2.4, 64, {bend:t => 40 * Math.sin(2 * Math.PI * 5.5 * t)}), SR);
  assert.equal(r.sustain.notes, 1);
  const v = r.sustain.list[0].vibrato;
  assert.ok(v, 'vibrato found');
  assert.ok(Math.abs(v.rateHz - 5.5) <= 0.2, 'rate ' + v.rateHz);
  assert.ok(Math.abs(v.extentCents - 40) <= 6, 'extent ' + v.extentCents);
  assert.ok(v.regularity > 0.8, 'regularity ' + v.regularity);
  assert.equal(r.sustain.vibrato.share, 100);
  assert.ok(r.sustain.pitchSdCents < 8, 'wobble without the vibrato: ' + r.sustain.pitchSdCents);
  assert.ok(r.sustain.list[0].pitchSdRawCents > 20, 'raw SD keeps it: ' + r.sustain.list[0].pitchSdRawCents);
  // 2.5 Hz is too slow, 11 Hz too fast: neither is vibrato.
  for (const rate of [2.5, 11]) assert.equal(P.analyze(tone(blank(3), 0.3, 2.4, 64, {bend:t => 40 * Math.sin(2 * Math.PI * rate * t)}), SR).sustain.vibrato.notes, 0, rate + ' Hz');
});

test('zones are the take\'s own thirds; a thin zone is 표본 부족 and its change is never reported', () => {
  // 8 s low (C4), 8 s middle (G4), 1 s high (D5): the high third has too little sound.
  const x = blank(20);
  tone(x, 0.3, 8, 60); tone(x, 8.8, 8, 67); tone(x, 17.3, 1, 74);
  const r = P.analyze(x, SR);
  assert.ok(r.zones.low.enough && r.zones.mid.enough, JSON.stringify([r.zones.low.seconds, r.zones.mid.seconds]));
  assert.ok(!r.zones.high.enough && r.zones.high.seconds < T.MIN_ZONE_SECONDS, 'high ' + r.zones.high.seconds);
  assert.ok(Math.abs(r.zones.low.seconds - 8) < 0.3 && Math.abs(r.zones.mid.seconds - 8) < 0.3);
  assert.deepEqual(r.resonance.change.ratioDb.zones, ['low', 'mid']);
  assert.equal(r.resonance.change.ratioDb.highMinusLow, null, 'high − low needs both zones');
  assert.ok(r.resonance.change.ratioDb.spread != null);
  // Semitone bands for the file: absolute notes with their seconds.
  const band = midi => r.bands.find(b => b.midi === midi);
  assert.equal(band(60).note, 'C4'); assert.ok(band(60).seconds > 7.5 && band(60).enough);
  assert.ok(band(74) && band(74).seconds < 1.2);
  // A take that stays inside 3 semitones is one zone.
  const narrow = P.analyze(tone(blank(5), 0.3, 4, 60), SR);
  assert.equal(narrow.range.split, false);
  assert.equal(narrow.zones.low.seconds, 0); assert.equal(narrow.zones.high.seconds, 0);
  assert.equal(narrow.resonance.change.ratioDb.spread, null);
});

test('onsets: a sudden start that overshoots the pitch is hard, a slow start is gentle', () => {
  const x = blank(8);
  // Hard: 5 ms attack, 120 cents above the note for the first 50 ms. Gentle: 150 ms attack, no overshoot.
  for (let i = 0; i < 3; i++) tone(x, 0.5 + i * 1.2, 0.8, 60, {attack:0.005, bend:t => t < 0.05 ? 120 : 0});
  for (let i = 0; i < 3; i++) tone(x, 4.2 + i * 1.2, 0.8, 60, {attack:0.15});
  const r = P.analyze(x, SR);
  assert.equal(r.onsets.count, 6, JSON.stringify(r.onsets.list));
  assert.equal(r.onsets.hard, 3, JSON.stringify(r.onsets.list));
  assert.equal(r.onsets.hardShare, 50);
  assert.ok(r.onsets.list.slice(0, 3).every(o => o.hard) && r.onsets.list.slice(3).every(o => !o.hard));
});

test('a pitch guide limits what is read to where the voice was heard and keeps to the voice', () => {
  const x = blank(6);
  tone(x, 0.3, 2.4, 60); tone(x, 3.3, 2.4, 48, {gain:0.25});      // "voice" C4, then a louder "instrument" C3 alone
  const curve = Array.from({length:120}, (_, i) => i / 20 >= 0.3 && i / 20 < 2.7 ? 6000 : null);
  const free = P.analyze(x, SR), guided = P.analyze(x, SR, {guide:{curve, fps:20}});
  assert.ok(free.voicedSeconds > 4.5, 'without a guide both are read: ' + free.voicedSeconds);
  assert.ok(Math.abs(guided.voicedSeconds - 2.4) < 0.2, 'with the guide only the voice: ' + guided.voicedSeconds);
  assert.equal(guided.confidence.pitchSource, 'guide+autocorrelation');
  assert.equal(free.confidence.pitchSource, 'autocorrelation');
});

test('with a guide that folded an octave flip back down, the flip is still found (the shorter period is the real one)', () => {
  const x = tone(blank(3), 0.3, 2.4, 57, {bend:t => (t >= 1.0 && t < 1.1 ? 1200 : 0) + 20 * Math.sin(2 * Math.PI * 1.3 * t)});
  const curve = Array.from({length:60}, (_, i) => i / 20 >= 0.3 && i / 20 < 2.7 ? 5700 : null);   // the guide says A3 throughout
  const r = P.analyze(x, SR, {guide:{curve, fps:20}});
  assert.equal(r.transitions.flipCount, 1, JSON.stringify(r.transitions.flips));
  assert.ok(Math.abs(r.transitions.flips[0].semitones - 12) < 1);
});

test('cleanliness: decided by the tick, else by the stored analysis; a take measured after MR removal or AI separation is NOT clean audio', () => {
  const stored = confidence => ({v:2, metrics:{voicedSeconds:40}, confidence});
  assert.deepEqual(P.cleanOf({analysis:stored({voiceOverMrDb:null, pitchConfidence:0.9})}), {clean:true, why:'no-accompaniment-heard'});
  assert.deepEqual(P.cleanOf({analysis:stored({voiceOverMrDb:12})}), {clean:false, why:'accompaniment-heard'});
  assert.deepEqual(P.cleanOf({analysis:stored({voiceOverMrDb:null, mrRemoved:{trackId:'t', removedDb:9}})}), {clean:false, why:'mr-removed-numbers-only'});
  assert.deepEqual(P.cleanOf({analysis:stored({voiceOverMrDb:null, aiSeparated:{model:'x'}})}), {clean:false, why:'ai-separated-numbers-only'});
  assert.deepEqual(P.cleanOf({analysis:null}), {clean:false, why:'not-analysed'});
  assert.deepEqual(P.cleanOf({analysis:stored({voiceOverMrDb:12}), ticked:true}), {clean:true, why:'user-said-voice-only'});
  assert.deepEqual(P.cleanOf({analysis:stored({voiceOverMrDb:null}), ticked:false}), {clean:false, why:'user-said-accompaniment'});
  for (const why of ['no-accompaniment-heard', 'accompaniment-heard', 'mr-removed-numbers-only', 'ai-separated-numbers-only', 'not-analysed', 'user-said-voice-only', 'user-said-accompaniment']) assert.ok(P.CLEAN_TEXT[why], why);
});

/** Two takes of the same little phrase; `worse` has dropouts, a flip, wobble and noise. */
function take({worse}) {
  const x = blank(40), bend = worse ? t => 22 * Math.sin(2 * Math.PI * 1.4 * t) + 15 * Math.sin(2 * Math.PI * 2.3 * t) : t => 30 * Math.sin(2 * Math.PI * 5.5 * t);
  let at = 0.5;
  for (let k = 0; k < 9; k++) {
    const midi = [57, 60, 64, 67, 69, 64, 60, 62, 57][k];
    if (worse && k % 3 === 0) { tone(x, at, 1.4, midi, {bend, release:0.005}); tone(x, at + 1.48, 1.6, midi, {bend:t => (t > 0.5 && t < 0.6 ? 1200 : 0) + bend(t), attack:0.005}); }
    else tone(x, at, 3.08, midi, {bend});
    at += 3.6;
  }
  return worse ? noise(x, 0.03) : x;
}
test('gating: a take that is not clean keeps the pitch-based traces and loses 울림 · 숨소리 · 시작', () => {
  const full = P.analyze(take({worse:false}), SR);
  assert.equal(P.gate(full, true), full, 'a clean take is untouched');
  const g = P.gate(full, false);
  assert.equal(g.resonance, null); assert.equal(g.breath, null); assert.equal(g.onsets, null);
  assert.equal(g.sustain.loudSdDb, null);
  assert.equal(g.sustain.pitchSdCents, full.sustain.pitchSdCents);
  assert.equal(g.transitions.breaksPerMin, full.transitions.breaksPerMin);
  for (const z of Object.values(g.zones)) { assert.equal(z.hnrDb, null); assert.equal(z.centroidHz, null); assert.equal(z.ratioDb, null); assert.equal(z.tiltDbPerOct, null); }
  for (const b of g.bands) { assert.equal(b.hnrDb, null); assert.equal(b.ratioDb, null); }
  assert.ok(full.resonance.centroidHz > 0, 'the original result is not changed');
});

test('comparison rows: 비슷함 / 다름 with the direction in words, never a verdict', () => {
  const worse = P.analyze(take({worse:true}), SR), better = P.analyze(take({worse:false}), SR);
  assert.equal(worse.transitions.breakCount, 3); assert.equal(worse.transitions.flipCount, 3);
  assert.equal(better.transitions.breakCount, 0); assert.equal(better.transitions.flipCount, 0);
  const rows = P.compare(P.gate(worse, true), P.gate(better, true)), by = id => rows.find(r => r.id === id);
  assert.deepEqual(rows.map(r => r.id), ['breaks', 'flips', 'pitchSd', 'drift', 'loudSd', 'vibrato', 'zoneSpread', 'brightness', 'breath', 'onsets']);
  assert.equal(by('breaks').state, 'different'); assert.equal(by('breaks').marker, '다름'); assert.equal(by('breaks').line, '끊김이 줄었어요');
  assert.equal(by('flips').line, '뒤집힘이 줄었어요');
  assert.equal(by('pitchSd').line, '긴 음의 음높이 흔들림이 줄었어요');
  assert.equal(by('vibrato').line, '비브라토가 들어간 긴 음이 늘었어요');
  assert.equal(by('breath').line, '목소리에 섞인 숨·잡음이 줄었어요');
  // The same take against itself: everything measurable is 비슷함.
  for (const r of P.compare(better, better)) assert.ok(r.state === 'similar' || r.state === 'hold', r.id + ' ' + r.state);
  assert.equal(P.compare(better, better).find(r => r.id === 'breaks').marker, '비슷함');
  // The other way round the direction turns; the words stay neutral.
  assert.equal(P.compare(better, worse).find(r => r.id === 'breaks').line, '끊김이 늘었어요');
  const banned = /좋아|나빠|나아|향상|악화|개선|길이 맞|길을 찾|잘했|못했/;
  for (const r of [...rows, ...P.compare(better, worse), ...P.compare(P.gate(worse, false), better)]) assert.ok(!banned.test([r.title, r.marker, r.line, r.base, r.comp].join(' ')), r.id + ': ' + r.line);
  // One take with an accompaniment: the voice-only rows are 잴 수 없음, the pitch-based ones are still compared.
  const mixed = P.compare(P.gate(worse, false), P.gate(better, true)), m = id => mixed.find(r => r.id === id);
  for (const id of ['zoneSpread', 'brightness', 'breath', 'onsets', 'loudSd']) { assert.equal(m(id).state, 'hold', id); assert.equal(m(id).marker, '잴 수 없음'); assert.equal(m(id).line, '반주가 섞여 있어 울림·숨소리는 잴 수 없어요'); }
  assert.equal(m('breaks').state, 'different'); assert.equal(m('pitchSd').state, 'different');
  // Too little singing on one side: 표본 부족, not a comparison.
  const tiny = P.analyze(tone(blank(3), 0.3, 2.4, 60), SR);
  assert.equal(P.compare(tiny, better).find(r => r.id === 'breaks').marker, '표본 부족');
  assert.equal(P.compare(tiny, better).find(r => r.id === 'pitchSd').marker, '표본 부족');
});

test('diagnosis file: numbers, flags and months only — no ids, titles, names, days or audio', () => {
  const a = P.analyze(take({worse:true}), SR), b = P.analyze(take({worse:false}), SR);
  const stored = {v:2, at:1731400000000, seconds:40, metrics:{voicedSeconds:28, stability:{wobbleCents:22}, intonation:{meanAbsCents:19}}, scope:{kind:'whole-recording', cut:false},
    confidence:{pitchConfidence:0.91, voiceOverMrDb:7.5, voicedShare:70, separated:true, mrRemoved:{trackId:'SECRET-TRACK-ID', offsetSeconds:1.2, removedDb:8.4}}, history:[{v:1, secret:'OLD'}]};
  const d = P.diagnosis([
    {role:'base', date:'2025-08-14', result:a, clean:P.cleanOf({analysis:stored}), source:'mixed', measurable:P.measurable(a, false), stored, reliable:true,
      mr:null, mrTries:[{key:'SECRET-TRACK-ID:mr/key:99', ok:false, reason:'no-match', removedDb:1.2}], mixed:null, stagesMs:{fetch:12, decode:340, resample:20, model:800, total:1200}, mrMode:'none'},
    {role:'comp', date:'2026-11-09', result:b, clean:{clean:true, why:'song-mr-removed'}, source:'mr-removed', measurable:{ok:true, why:'song-mr-removed'}, stored:null, reliable:false,
      mr:{removedDb:7.4, offsetSeconds:12.345, speed:1, score:0.97, key:'SECRET-TRACK-ID:mr/key:99'}, mrTries:[{key:'SECRET-TRACK-ID:mr/key:99', ok:true, reason:'', removedDb:7.4}], mixed:a, stagesMs:{fetch:1, decode:2, model:3, cancel:4, voice:5, total:15}, fromDeviceCache:true, mrMode:'SECRET-TRACK-ID'}
  ], {generatedMonth:'2026-11'});
  const text = JSON.stringify(d);
  assert.equal(d.kind, 'vocalzip-voice-path-diagnosis');
  assert.deepEqual(d.takes.map(t => t.month), ['2025-08', '2026-11']);
  assert.ok(!/2025-08-14|2026-11-09|SECRET|OLD|trackId|mr\/key|"id"|"key"|"name"|"title"|"song"|"songId"|"file"|"history"/.test(text), 'no identifying field');
  assert.deepEqual(d.takes.map(t => t.source), ['mixed', 'mr-removed']);
  assert.equal(d.takes[0].clean, false); assert.equal(d.takes[0].cleanWhy, 'mr-removed-numbers-only');
  assert.equal(d.takes[0].resonance, null, 'voice-only numbers are left out of a take that is not clean');
  assert.equal(d.takes[0].storedAnalysis.mrRemoved, true); assert.equal(d.takes[0].storedAnalysis.mrRemovedDb, 8.4); assert.equal(d.takes[0].storedAnalysis.pitchConfidence, 0.91);
  assert.deepEqual(d.takes[0].mrTries, [{ok:false, reason:'no-match', removedDb:1.2}]);
  assert.deepEqual(d.takes[0].stagesMs, {fetch:12, decode:340, resample:20, model:800, total:1200});
  assert.equal(d.takes[0].measurable, true); assert.equal(d.takes[0].measurableWhy, 'mixed-voice-on-top');
  // Each take's own MR choice, as a mode only: never the chosen file's id or title.
  assert.equal(d.takes[0].mrMode, 'none'); assert.equal(d.takes[1].mrMode, null);
  assert.equal(d.takes[1].clean, true); assert.equal(d.takes[1].storedAnalysis, null); assert.equal(d.takes[1].fromDeviceCache, true);
  assert.deepEqual(d.takes[1].mrRemoval, {removedDb:7.4, offsetSeconds:12.345, speed:1, score:0.97});
  assert.equal(d.takes[1].asRecorded.voicedSeconds, a.voicedSeconds); assert.ok(d.takes[1].asRecorded.confidence.meanStrength > 0);
  assert.ok(d.takes[1].resonance.centroidHz > 0); assert.ok(d.takes[1].semitoneBands.length >= 5); assert.ok(d.takes[1].zones.low.seconds > 0);
  assert.ok(d.takes[1].coverage.high.seconds >= 0 && typeof d.takes[1].coverage.high.enough === 'boolean');
  assert.equal(d.thresholds.BREAK_MIN_MS, 40); assert.equal(d.thresholds.SIMILAR.hnrDb, 2); assert.equal(d.thresholds.HOP, 320);
  assert.equal(d.modelVersion, P.VERSION);
  assert.equal(d.comparison.length, 10); assert.ok(d.comparison.every(r => ['similar', 'different', 'hold'].includes(r.state)));
  // A take that cannot be measured: its numbers are still in the file (to calibrate the gate), but no comparison is made.
  const refused = P.diagnosis([{role:'base', date:'2025-08', result:a, clean:{clean:false, why:'accompaniment-heard'}, source:'mixed', measurable:{ok:false, why:'weak-pitch'}, stored:null},
    {role:'comp', date:'2026-11', result:b, clean:{clean:true, why:'user-said-voice-only'}, source:'clean', measurable:{ok:true, why:'voice-only'}, stored:null}]);
  assert.equal(refused.takes[0].mrMode, null);
  assert.equal(refused.comparison, null); assert.equal(refused.takes[0].measurable, false); assert.equal(refused.takes[0].measurableWhy, 'weak-pitch');
  assert.ok(refused.takes[0].confidence.meanStrength > 0);
  assert.equal(P.monthOf('2026-11-09'), '2026-11'); assert.equal(P.monthOf(''), null);
});

/* ---------- fed in pieces ---------- */
test('a take fed in pieces of any size gives exactly what the whole take gives (nothing is cut, memory stays flat)', () => {
  const x = AUDIO.samples('worse', 70), whole = P.analyze(x, SR);
  const stream = P.createStream();
  for (let a = 0, k = 0; a < x.length; k++) { const n = [16000 * 7 + 13, 999, 16000 * 31, 320, 51234][k % 5]; stream.push(x.subarray(a, Math.min(x.length, a + n))); a += n; }
  assert.equal(stream.seconds, 70);
  assert.deepEqual(stream.finish(), whole);
  assert.equal(whole.seconds, 70);
  assert.ok(whole.transitions.breaks.at(-1).t > 60, 'the last dropout, near the end, is found: ' + whole.transitions.breaks.at(-1).t);
  assert.equal(whole.transitions.breakCount, 7); assert.equal(whole.transitions.flipCount, 7);
});

test('16 kHz → 8 kHz in pieces: the same as in one go, 1 kHz kept, 6 kHz gone', () => {
  const n = SR * 3, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * 1000 * i / SR) + Math.sin(2 * Math.PI * 6000 * i / SR);
  const one = P.createHalver(), whole = [...one.push(x), ...one.finish()];
  const two = P.createHalver(), parts = [];
  for (let a = 0; a < n; a += 7777) parts.push(...two.push(x.subarray(a, Math.min(n, a + 7777))));
  parts.push(...two.finish());
  assert.equal(whole.length, n / 2); assert.equal(parts.length, n / 2);
  assert.ok(whole.every((v, i) => Math.abs(v - parts[i]) < 1e-6));
  let e = 0; for (let i = 4000; i < 20000; i++) e += whole[i] * whole[i];
  assert.ok(Math.abs(Math.sqrt(e / 16000) - Math.SQRT1_2) < 0.02, 'only the 1 kHz tone is left: rms ' + Math.sqrt(e / 16000));
});

/* ---------- a take with an accompaniment ---------- */
test('voice with a louder bass line is refused; with the bass 15 dB below it is measured and the bass is not followed', () => {
  const voice = P.analyze(AUDIO.samples('better', 34), SR);
  const loud = P.analyze(AUDIO.samples('bass', 34, SR, 4), SR), under = P.analyze(AUDIO.samples('bass', 34, SR, -15), SR);
  assert.equal(P.measurable(loud, false).ok, false, JSON.stringify(loud.confidence));
  for (const db of [0, -6, -10]) assert.equal(P.measurable(P.analyze(AUDIO.samples('bass', 34, SR, db), SR), false).ok, false, 'bass at ' + db + ' dB');
  assert.deepEqual(P.measurable(under, false), {ok:true, why:'mixed-voice-on-top'}, JSON.stringify(under.confidence));
  // The bass (D2–A2) is nowhere in what was read: the range, the notes and the seconds are the voice's.
  assert.equal(under.range.lowNote, 'A3'); assert.equal(under.range.highNote, voice.range.highNote);
  assert.ok(under.bands.every(b => b.midi >= 56), JSON.stringify(under.bands.map(b => b.midi)));
  assert.ok(Math.abs(under.voicedSeconds - voice.voicedSeconds) < 1, under.voicedSeconds + ' vs ' + voice.voicedSeconds);
  assert.equal(under.sustain.notes, voice.sustain.notes); assert.equal(under.transitions.flipCount, 0); assert.equal(under.transitions.breakCount, 0);
  // The bass heard between the phrases is quiet: it is not read, and not held against the take.
  assert.ok(under.confidence.outsideBandShare < 0.05, 'outside ' + under.confidence.outsideBandShare);
  // A clean take is never refused, whatever it holds; a take with no voice is.
  assert.deepEqual(P.measurable(loud, true), {ok:true, why:'voice-only'});
  assert.deepEqual(P.measurable(P.analyze(blank(2), SR), true), {ok:false, why:'no-voice'});
});

test('the gate on numbers like the first real diagnosis: the take that followed the accompaniment is refused', () => {
  const reading = c => ({voicedSeconds:150, confidence:c});
  // 2026-11 take: weak periodicity, many glitches, a third of the sound far below the voice.
  assert.equal(P.measurable(reading({meanStrength:0.799, glitchShare:0.036, outsideBandShare:0.31, jumpsPerMin:330, flatNoteShare:0}), false).ok, false);
  for (const one of [{outsideBandShare:0.31}, {meanStrength:0.799}, {glitchShare:0.036}, {jumpsPerMin:112.6}, {flatNoteShare:0.8}])
    assert.equal(P.measurable(reading({meanStrength:0.95, glitchShare:0.002, outsideBandShare:0.01, jumpsPerMin:3, flatNoteShare:0, ...one}), false).ok, false, JSON.stringify(one));
  // 2025-08 take (strength 0.877, glitches 0.9 %, 3–4 % far below, 39.7 flips a minute): just under the strength
  // line and far over the jump line — refused as well.
  assert.deepEqual(P.measurable(reading({meanStrength:0.877, glitchShare:0.009, outsideBandShare:0.035, jumpsPerMin:39.7, flatNoteShare:0}), false), {ok:false, why:'weak-pitch'});
  assert.deepEqual(P.measurable(reading({meanStrength:0.93, glitchShare:0.009, outsideBandShare:0.035, jumpsPerMin:39.7, flatNoteShare:0}), false), {ok:false, why:'pitch-jumps'});
  assert.deepEqual(P.measurable(reading({meanStrength:0.93, glitchShare:0.009, outsideBandShare:0.035, jumpsPerMin:6, flatNoteShare:0.1}), false), {ok:true, why:'mixed-voice-on-top'});
  assert.match(P.REFUSED_NOTE, /^반주가 목소리만큼 크게 들어가 있어 이 녹음은 잴 수 없어요\. 이어폰을 끼고 녹음한 것\(목소리만 들어간 것\)으로 비교해 주세요\.$/);
});

test('an octave apart, a jump is a flip only when the upper octave is clearly less periodic on the lower side', () => {
  // Even harmonics dominate (the octave above is almost as periodic as the note itself); for 100 ms only they sound.
  const even = odd => h => (h % 2 ? odd : 1) / h, x = blank(3);
  tone(x, 0.3, 0.7, 57, {amp:even(0.1), release:0.001}); tone(x, 1.0, 0.1, 57, {amp:even(0), attack:0.001, release:0.001}); tone(x, 1.1, 1.6, 57, {amp:even(0.1), attack:0.001});
  const r = P.analyze(x, SR);
  assert.equal(r.transitions.flipCount, 0, JSON.stringify(r.transitions.flips));
  assert.equal(r.confidence.octaveHesitations, 1);
  assert.ok(r.confidence.jumpsPerMin > 0, 'it still counts as a jump for the gate');
});

test('one take alone: its own values, nothing said about the other side', () => {
  const r = P.analyze(take({worse:true}), SR);
  const rows = P.alone(r, 'base', {marker:'재는 중', line:'다른 녹음을 다 재면 나란히 보여 드려요', other:'재는 중…'});
  assert.equal(rows.length, 10);
  assert.ok(rows.every(x => x.state === 'alone' && x.marker === '재는 중' && x.comp === '재는 중…' && x.compValue === null));
  assert.equal(rows[0].base, '분당 ' + r.transitions.breaksPerMin + '회 (3곳)');
  assert.ok(!/늘었어요|줄었어요|커졌어요|작아졌어요|비슷해요/.test(JSON.stringify(rows)));
  assert.equal(P.alone(r, 'comp', {marker:'잴 수 없음', line:'x', other:'잴 수 없어요'})[0].base, '잴 수 없어요');
  assert.deepEqual(P.compare(r, null), []); assert.deepEqual(P.compare(null, r), []);
});

/* ---------- the song's MR taken out (the real app/mr-cancel.js) ---------- */
test('a take sung over the song\'s MR: the MR is taken out and every trace of the voice that is left is close to the voice alone', () => {
  const MR = Y.mr(70), V = Y.vocal(40), rec = Y.record(V.x, MR, {offset:12.345, db:6});
  const out = C.cancel(rec.x, MR);
  assert.equal(out.ok, true, JSON.stringify(out.reason));
  assert.ok(out.report.removedDb >= P.THRESHOLDS.MR_MIN_REMOVED_DB, 'removed ' + out.report.removedDb + ' dB');
  assert.equal(P.THRESHOLDS.MR_MIN_REMOVED_DB, C.RULES.minRemoved, 'the same line the cancel itself draws');
  const alone = P.analyze(V.x, Y.SR), mixed = P.analyze(rec.x, Y.SR), left = P.analyze(out.voice, Y.SR);
  // As recorded (MR 6 dB over the voice) the take cannot be measured.
  assert.equal(P.measurable(mixed, false).ok, false);
  // What is left after the MR is a voice again: 8 kHz sound, so 울림 is read up to 3.6 kHz.
  assert.equal(left.confidence.bandwidthHz, 3600); assert.equal(alone.confidence.bandwidthHz, 3600);
  assert.ok(left.confidence.meanStrength > 0.95, 'strength ' + left.confidence.meanStrength);
  assert.ok(Math.abs(left.sustain.notes - alone.sustain.notes) <= 4, left.sustain.notes + ' vs ' + alone.sustain.notes);
  assert.ok(Math.abs(left.sustain.pitchSdCents - alone.sustain.pitchSdCents) <= 2, left.sustain.pitchSdCents + ' vs ' + alone.sustain.pitchSdCents);
  assert.ok(Math.abs(left.sustain.vibrato.share - alone.sustain.vibrato.share) <= 10); assert.ok(Math.abs(left.sustain.vibrato.extentCents - alone.sustain.vibrato.extentCents) <= 3);
  assert.equal(left.transitions.flipCount, 0);
  assert.ok(Math.abs(left.resonance.ratioDb - alone.resonance.ratioDb) <= 2, left.resonance.ratioDb + ' vs ' + alone.resonance.ratioDb);
  assert.ok(Math.abs(left.resonance.centroidHz - alone.resonance.centroidHz) <= 100, left.resonance.centroidHz + ' vs ' + alone.resonance.centroidHz);
  assert.ok(Math.abs(left.resonance.tiltDbPerOct - alone.resonance.tiltDbPerOct) <= 1);
  assert.ok(left.breath.hnrDb > 15 && left.breath.hnrDb <= alone.breath.hnrDb + 1, 'a little of the MR is left: ' + left.breath.hnrDb + ' vs ' + alone.breath.hnrDb);
  assert.ok(left.onsets.count >= 5, 'onsets ' + left.onsets.count);
  assert.equal(left.range.lowNote, alone.range.lowNote); assert.equal(left.range.highNote, alone.range.highNote);
  // Two takes over the same MR are compared on every row; a cleaned take against a take read at full band is not compared on 울림.
  const other = P.analyze(C.cancel(Y.record(V.x, MR, {offset:3.2, db:3}).x, MR).voice, Y.SR);
  const rows = P.compare(left, other);
  assert.ok(rows.every(r => r.marker !== '잴 수 없음'), JSON.stringify(rows.map(r => [r.id, r.marker])));
  const cross = P.compare(left, P.analyze(AUDIO.samples('better', 34), SR)), by = id => cross.find(r => r.id === id);
  for (const id of ['zoneSpread', 'brightness']) { assert.equal(by(id).marker, '잴 수 없음'); assert.equal(by(id).line, '한쪽만 곡 MR을 빼고 재서 울림은 나란히 볼 수 없어요'); }
  assert.notEqual(by('breaks').marker, '잴 수 없음'); assert.notEqual(by('breath').marker, '잴 수 없음');
});

test('an MR that is not the one in the take does not come out: the reason is given and the take falls back to the gate', () => {
  const MR = Y.mr(70), V = Y.vocal(40), rec = Y.record(V.x, MR, {offset:12.345, db:6});
  const wrong = C.cancel(rec.x, Y.mr(70, 99));
  assert.equal(wrong.ok, false); assert.equal(wrong.reason, 'no-match');
  assert.equal(P.measurable(P.analyze(rec.x, Y.SR), false).ok, false, 'and as recorded it is refused');
});

test('silence and a wrong sample rate are handled', () => {
  const none = P.analyze(blank(2), SR);
  assert.equal(none.voicedSeconds, 0); assert.equal(none.range, null); assert.equal(none.transitions.breaksPerMin, null); assert.equal(none.sustain.notes, 0);
  // 44.1 kHz input is brought to 16 kHz inside the model.
  const x = new Float32Array(44100 * 2); let ph = 0;
  for (let i = 0; i < x.length; i++) { ph += 2 * Math.PI * 220 / 44100; let s = 0; for (let h = 1; h <= 8; h++) s += Math.sin(h * ph) / h; x[i] = 0.2 * s; }
  const r = P.analyze(x, 44100);
  assert.ok(Math.abs(r.sustain.list[0].semitone - 57) < 0.15, 'A3 found: ' + r.sustain.list[0]?.semitone);
});
