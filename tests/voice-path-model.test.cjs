// app/voice-path-model.js — 소리 길 흔적 (시험판): traces measured from synthetic signals made here (no fixtures, no audio
// files). The thresholds are first guesses; these tests fix the ORDER and the presence of each trace, not calibrated values.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/voice-path-model.js');
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
    {role:'base', date:'2025-08-14', result:a, clean:P.cleanOf({analysis:stored}), stored, reliable:true, guide:{version:2, confidence:{pitchConfidence:0.9, voiceOverMrDb:7, voicedShare:68}}},
    {role:'comp', date:'2026-11-09', result:b, clean:P.cleanOf({analysis:null, ticked:true}), stored:null, reliable:false, guide:null}
  ], {generatedMonth:'2026-11'});
  const text = JSON.stringify(d);
  assert.equal(d.kind, 'vocalzip-voice-path-diagnosis');
  assert.deepEqual(d.takes.map(t => t.month), ['2025-08', '2026-11']);
  assert.ok(!/2025-08-14|2026-11-09|SECRET|OLD|trackId|"id"|"name"|"title"|"song"|"songId"|"file"|"history"/.test(text), 'no identifying field');
  assert.equal(d.takes[0].clean, false); assert.equal(d.takes[0].cleanWhy, 'mr-removed-numbers-only');
  assert.equal(d.takes[0].resonance, null, 'voice-only numbers are left out of a take that is not clean');
  assert.equal(d.takes[0].storedAnalysis.mrRemoved, true); assert.equal(d.takes[0].storedAnalysis.mrRemovedDb, 8.4); assert.equal(d.takes[0].storedAnalysis.pitchConfidence, 0.91);
  assert.equal(d.takes[1].clean, true); assert.equal(d.takes[1].storedAnalysis, null);
  assert.ok(d.takes[1].resonance.centroidHz > 0); assert.ok(d.takes[1].semitoneBands.length >= 5); assert.ok(d.takes[1].zones.low.seconds > 0);
  assert.ok(d.takes[1].coverage.high.seconds >= 0 && typeof d.takes[1].coverage.high.enough === 'boolean');
  assert.equal(d.thresholds.BREAK_MIN_MS, 40); assert.equal(d.thresholds.SIMILAR.hnrDb, 2);
  assert.equal(d.modelVersion, P.VERSION);
  assert.equal(d.comparison.length, 10); assert.ok(d.comparison.every(r => ['similar', 'different', 'hold'].includes(r.state)));
  assert.equal(P.monthOf('2026-11-09'), '2026-11'); assert.equal(P.monthOf(''), null);
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
