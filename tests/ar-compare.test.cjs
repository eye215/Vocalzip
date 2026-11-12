// 원곡(AR) 음정 비교: the original singer's melody extracted from a synthetic original recording (tests/helpers/ar-song.cjs:
// singer with vibrato, rubato, a tuning offset and a few "style" notes of their own, an ad-lib, a full band, a backing
// harmony in the chorus, an instrumental fill) by the real analyzer (app/vocal-analysis.js) and app/ar-melody-model.js,
// then takes rendered by tests/helpers/score-song.cjs aligned against it with app/score-align-model.js.
// The truth for each take note is the score note it sings; the reference's own style notes shift what "right" means
// (the comparison is with the original, not with the score).
const test = require('node:test'), assert = require('node:assert/strict');
const VA = require('../app/vocal-analysis.js'), A = require('../app/score-align-model.js'), M = require('../app/ar-melody-model.js'), G = require('../app/growth-metrics-model.js');
const S = require('./helpers/score-song.cjs'), H = require('./helpers/ar-song.cjs');

const song = S.song();
const AR = {}; // config → {a, res, ref, mel}
function original(name, opts = {}) {
  if (!AR[name]) { const a = H.ar(song, opts), res = VA.analyze(a.samples, a.sr), ref = M.extract(res); AR[name] = {a, res, ref, mel:M.toMelody(ref)}; }
  return AR[name];
}
function take(o, opts, arName = 'typical') {
  const {a, ref, mel} = original(arName), t = S.sing(song, opts), res = VA.analyze(t.samples, t.sr);
  const r = M.refine(A.align(mel, M.sungAgainst(A.framesOf(res), ref, res.confidence.tuningFrom === 'mr'), {reliable:true, rules:M.ALIGN_RULES}), mel);
  const err = new Map(t.truth.map(x => [x.i, x])), first = new Map();
  for (const row of r.rows) if (!first.has(row.i)) first.set(row.i, row);
  const T = {rows:0, agree:0, wrong:0, wrongHit:0, falseAlarm:0, unsure:0, adlibJudged:0, refWrong:0};
  // Score notes the reference holds correctly (the original singer's note): only these can be checked.
  const good = new Set(ref.notes.map(n => [n, H.scoreNoteOf(n, a.truth)]).filter(([n, x]) => x && !x.adlib && n.midi === song.notes[x.i].midi + x.style).map(([, x]) => x.i));
  for (const [j, row] of first) {
    const n = ref.notes[j], x = H.scoreNoteOf(n, a.truth);
    if (!x || x.adlib) { if (['ok', 'high', 'low'].includes(row.status)) T.adlibJudged++; continue; }
    const sung = err.get(x.i); if (!sung) continue;
    if (n.midi !== song.notes[x.i].midi + x.style) { T.refWrong++; continue; }
    T.rows++;
    const want = sung.err - x.style, w = want === 0 ? 'ok' : want > 0 ? 'high' : 'low';
    if (row.status === 'unsure' || row.status === 'missed') { T.unsure++; continue; }
    if (row.status === w) T.agree++;
    if (sung.err) { if (row.status === w) T.wrongHit++; } else if (row.status !== 'ok' && !x.style) T.falseAlarm++;
  }
  T.wrong = Object.keys(opts.wrong || {}).map(Number).filter(i => err.has(i) && good.has(i)).length;
  return {r, T, ref, mel};
}
const report = [];
const line = (name, x) => report.push(name.padEnd(14) + ' ' + x.r.state.padEnd(4) + ' ' + (x.r.state === 'ok' ? '맞은 음 ' + String(x.r.pct).padStart(3) + '%' : '(' + x.r.reason + ')').padEnd(10) + ' shift ' + String(x.r.shift).padStart(3) + ' · notes ' + x.T.agree + '/' + x.T.rows + ' right · wrong found ' + x.T.wrongHit + '/' + x.T.wrong + ' · false ' + x.T.falseAlarm + ' · unsure ' + x.T.unsure + ' · ref-wrong rows ' + x.T.refWrong + ' · ad-lib judged ' + x.T.adlibJudged);
test.after(() => console.log('\n' + report.join('\n')));

test('reference from the AR: the original singer\'s notes (style notes included), ad-lib and fill not mistaken for score notes', () => {
  const {a, ref, res} = original('typical');
  assert.equal(ref.state, 'ok');
  assert.ok(Math.abs(ref.tuning - 20) <= 6, 'AR tuning heard: ' + ref.tuning);
  let right = 0, wrong = 0; const covered = new Set();
  for (const n of ref.notes) { const x = H.scoreNoteOf(n, a.truth); if (!x || x.adlib) continue; if (n.midi === song.notes[x.i].midi + x.style) { right++; covered.add(x.i); } else wrong++; }
  report.push('reference typical: ' + ref.notes.length + ' notes · ' + right + ' right, ' + wrong + ' wrong · ' + covered.size + '/' + song.notes.length + ' score notes · tuning ' + ref.tuning + ' · voice/band ' + res.confidence.voiceOverMrDb + ' dB');
  assert.ok(covered.size >= 110, 'most notes extracted: ' + covered.size);
  assert.ok(wrong <= 3, 'few wrong reference notes: ' + wrong);
  // The style notes are the singer's, not the score's.
  for (const i of [70, 101]) { const n = ref.notes.find(r => H.scoreNoteOf(r, a.truth)?.i === i); if (n) assert.equal(n.midi, song.notes[i].midi + {70:2, 101:-1}[i]); }
  // Compact on the song, round trip.
  const packed = M.pack(ref, {file:'ar-1', hash:'abc', analyzer:'2/x', at:5});
  assert.ok(JSON.stringify(packed).length < 2500, JSON.stringify(packed).length + ' bytes');
  const back = M.unpack(packed);
  assert.equal(back.notes.length, ref.notes.length);
  back.notes.forEach((n, k) => { assert.equal(n.midi, ref.notes[k].midi); assert.ok(Math.abs(n.t - ref.notes[k].t) < 0.03 && Math.abs(n.dur - ref.notes[k].dur) < 0.03); });
  assert.ok(M.current(packed, {id:'ar-1', sha256:'abc'}));
  assert.ok(!M.current(packed, {id:'ar-1', sha256:'other'}), 'another file content');
  assert.ok(!M.current(packed, {id:'ar-2', sha256:'abc'}));
  assert.ok(!M.current({...packed, v:M.MODEL + 1}, {id:'ar-1', sha256:'abc'}), 'another extraction model');
});

test('take in the original key with wrong notes: found where sung, nothing else flagged', () => {
  const x = take('clean', {wrong:{10:1, 25:-2, 40:2, 61:-1, 80:1, 120:-1}}); line('clean', x);
  assert.equal(x.r.state, 'ok'); assert.equal(x.r.shift, 0);
  assert.ok(x.T.wrongHit >= x.T.wrong - 1, JSON.stringify(x.T));
  assert.equal(x.T.falseAlarm, 0); assert.equal(x.T.adlibJudged, 0);
  assert.ok(x.T.agree / x.T.rows >= 0.9);
  // The singer's own style notes (score 70 +2, 101 −1): a take singing the score is "different from the original" there.
  const style = x.r.rows.filter(r => { const n = x.ref.notes[r.i]; const s = H.scoreNoteOf(n, AR.typical.a.truth); return s && s.style; });
  assert.ok(style.some(r => r.status === 'low' || r.status === 'high'));
});

test('sung 3 semitones lower / an octave lower than the original: shift reported, compared in that key', () => {
  const k = take('key −3', {shift:-3, wrong:{30:2, 90:-1}}); line('key −3', k);
  assert.equal(k.r.state, 'ok'); assert.equal(k.r.shift, -3); assert.equal(k.T.falseAlarm, 0); assert.equal(k.T.wrongHit, k.T.wrong);
  assert.equal(M.shiftText(-3), '원곡보다 3반음 낮게');
  const o = take('octave −12', {shift:-12, mrShift:0, wrong:{15:-2, 100:1}}); line('octave −12', o);
  assert.equal(o.r.state, 'ok'); assert.equal(o.r.shift, -12); assert.ok(o.T.falseAlarm <= 1);
  assert.equal(M.shiftText(-12), '원곡보다 한 옥타브 낮게');
  assert.equal(M.shiftText(14), '원곡보다 14반음 높게(1옥타브 + 2반음)'); assert.equal(M.shiftText(0), '');
});

test('partial take, rubato take, a cappella', () => {
  const p = take('partial 9–20', {from:9, to:20, wrong:{50:-2, 70:1}}); line('partial 9–20', p);
  assert.equal(p.r.state, 'ok'); assert.ok(p.T.falseAlarm <= 1);
  assert.ok(p.r.rows.every(r => { const s = H.scoreNoteOf(p.ref.notes[r.i], AR.typical.a.truth); return !s || s.i == null || s.mi >= 7 && s.mi <= 20; }), 'only the sung part');
  const r = take('rubato', {rubato:0.2, tempo:96, jitter:0.05, hold:[19, 52], wrong:{44:1}}); line('rubato', r);
  assert.equal(r.r.state, 'ok'); assert.ok(r.T.falseAlarm <= 2, JSON.stringify(r.T));
  const c = take('a cappella', {mrDb:null, wrong:{10:1, 61:-1}}); line('a cappella', c);
  assert.equal(c.r.state, 'ok'); assert.equal(c.T.falseAlarm, 0);
});

test('dense mix (band as loud as the voice, louder harmony): compared with more 불확실, or withheld — no run of false verdicts', () => {
  const {ref} = original('dense', {bandDb:0, harmonyDb:-5, padDb:-6});
  report.push('reference dense: ' + ref.state + ' · ' + ref.notes.length + ' notes · pitch confidence ' + ref.stats.pitchConfidence + ' · voice/band ' + ref.stats.voiceOverBandDb + ' dB');
  const x = take('dense clean', {wrong:{10:1, 25:-2, 40:2, 61:-1, 80:1, 120:-1}}, 'dense'); line('dense: clean', x);
  assert.ok(x.T.falseAlarm <= 2, JSON.stringify(x.T));
  if (x.r.state === 'ok') assert.ok(x.T.wrongHit >= 3);
});

test('band drowning the voice: the reference itself is withheld (원곡 멜로디 판정 보류)', () => {
  const {ref} = original('drowned', {bandDb:4, harmonyDb:-3, padDb:-2});
  report.push('reference drowned: ' + ref.state + ' (' + (ref.reason || '') + ') · pitch confidence ' + ref.stats.pitchConfidence + ' · voice/band ' + ref.stats.voiceOverBandDb + ' dB');
  assert.equal(ref.state, 'hold'); assert.ok(M.HOLD_REF[ref.reason]);
});

test('another song is not forced onto the original: 판정 보류', () => {
  const {ref, mel} = original('typical'), other = S.song({seed:99});
  for (const shift of [0, 2]) {
    const t = S.sing(other, {shift}), res = VA.analyze(t.samples, t.sr), r = A.align(mel, M.sungAgainst(A.framesOf(res), ref, false), {rules:M.ALIGN_RULES});
    report.push(('other song +' + shift).padEnd(14) + ' ' + r.state + ' (' + r.reason + ')');
    assert.equal(r.state, 'hold'); assert.ok(['not-found', 'weak-match'].includes(r.reason), r.reason);
  }
});

test('extract: withheld without enough singing; slips folded; legato reference notes', () => {
  assert.equal(M.extract({curve:new Array(400).fill(null), fps:20}).reason, 'no-voice');
  // Synthetic curve: 40 notes of 0.4 s on a scale, one octave slip in the middle, a glide (off-grid) left out.
  const curve = [], notes = [];
  for (let k = 0; k < 40; k++) { const m = 60 + [0, 2, 4, 5, 7, 5, 4, 2][k % 8]; notes.push(m); for (let j = 0; j < 8; j++) curve.push(m * 100 + (k === 16 ? -1200 : 0) + (j % 2 ? 6 : -6)); curve.push(null); }
  for (let j = 0; j < 6; j++) curve.push(6045); // 45 cents off the grid: a bend, not a note
  const r = M.extract({curve, fps:20, seconds:curve.length / 20, confidence:{pitchConfidence:0.9, voiceOverMrDb:10}});
  assert.equal(r.state, 'ok'); assert.equal(r.notes.length, 40);
  assert.deepEqual(r.notes.map(n => n.midi), notes, 'the octave slip is folded back');
  assert.equal(r.stats.folded, 1);
  const mel = M.toMelody(r);
  assert.equal(mel.notes[0].beats, Math.round((r.notes[1].t - r.notes[0].t) * 100) / 100, 'a note lasts until the next one across a short gap');
  assert.equal(mel.measures, 1);
  assert.equal(M.extract({...{curve, fps:20}, confidence:{pitchConfidence:0.5}}).reason, 'confidence');
});

test('refine: a 높음/낮음 that matches the neighbouring reference note is 불확실, summary recounted', () => {
  const mel = {notes:[{midi:60, beat:0, beats:0.3, mi:0}, {midi:62, beat:0.3, beats:0.3, mi:0}, {midi:64, beat:0.6, beats:1, mi:0}]};
  const r = {state:'ok', shift:0, tuning:0, rows:[{i:0, status:'ok', sung:6000, mi:0}, {i:1, status:'high', sung:6400, dev:200, mi:0}, {i:2, status:'low', sung:6200, dev:-200, mi:0}], ok:1, high:1, low:1, judged:3, pct:33, worst:[]};
  const x = M.refine(r, mel);
  assert.equal(x.rows[1].status, 'unsure'); assert.equal(x.rows[2].status, 'low', 'a long note keeps its verdict');
  assert.equal(x.judged, 2); assert.equal(x.pct, 50); assert.equal(r.rows[1].status, 'high', 'input untouched');
});

test('growth: 원곡 기준 basis only for saved results of the same AR file and extraction; the score wins when both exist', () => {
  const rec = (s, extra = {}) => ({v:1, at:1, score:'ar:ar-1', ver:'abc:1:2/x', part:'ar', shift:0, state:'ok', from:0, s, src:'ar', ...extra});
  const a = rec('ohoolooooooo'), b = rec('oooooooooooo');
  const t = (id, date, cents) => ({id, date, ok:true, a:{v:2, metrics:{voicedSeconds:30, intonation:{meanAbsCents:cents, notes:20}}, confidence:{pitchConfidence:.95}}});
  const takes = [t('m1', '2026-11-01', 20), t('m2', '2026-11-10', 12)];
  const ar = G.songReport(takes, {arNotes:{m1:a, m2:b}});
  assert.deepEqual(ar.intonation.score, {before:83, after:100, notes:12, shift:0, source:'ar'});
  assert.match(G.basisText(ar.intonation), /^원곡 기준 맞은 음 비율 83% → 100% \(같은 원곡 멜로디\(자동 추출\) 음 12개/);
  assert.equal(ar.intonation.state, G.songReport(takes).intonation.state, 'the verdict is unchanged');
  assert.equal(G.songReport(takes, {arNotes:{m1:a, m2:rec(b.s, {ver:'def:1:2/x'})}}).intonation.score, undefined, 'another AR file content');
  const sc = {m1:{...a, score:'sc1', ver:'job1', part:'P1', src:undefined}, m2:{...b, s:'oooooooooooh', score:'sc1', ver:'job1', part:'P1', src:undefined}};
  const both = G.songReport(takes, {scoreNotes:sc, arNotes:{m1:a, m2:b}});
  assert.equal(both.intonation.score.source, undefined); assert.match(G.basisText(both.intonation), /^악보 기준/);
  // The compact record of an AR comparison carries the AR key.
  const key = M.compareKey({file:'ar-1', hash:'abcdef0123456789ffff', v:1, analyzer:'2/x'});
  assert.deepEqual(key, {scoreId:'ar:ar-1', version:'abcdef0123456789:1:2/x', partId:'ar'});
});
