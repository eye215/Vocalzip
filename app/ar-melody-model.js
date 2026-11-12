/* 원곡(AR) 음정 비교: the original singer's melody, extracted automatically from an uploaded original recording (AR),
 * used as the reference note sequence for app/score-align-model.js (the same alignment as the score comparison).
 * Pure functions, also loaded by the Node tests.
 *
 * 1. extract(result): the analyzer's voice curve of the AR (VA.analyze → curve, 20 points/s, the voice over the band)
 *    is cut into notes. A note is a stretch that stays on one semitone (5-frame median, so vibrato does not split it)
 *    for at least 0.15 s, close to the semitone grid (±40 cent) and steady. Glides, ornaments, short octave slips and
 *    unsteady stretches are left out — only confident sung notes are kept. Same-pitch pieces split by a dip are merged.
 * 2. The reference is withheld (state 'hold') when the voice was not followed well enough over the band: too little
 *    singing, too few notes, most of the singing not explained by steady notes, or low pitch confidence.
 * 3. toMelody(ref): the note list in the shape the alignment reads (beats = seconds of the AR, phrases as "measures"),
 *    so a take is aligned exactly like against a score, key shift and partial takes included.
 * 4. pack/unpack: a compact form kept on the song (song.arReference), with the model and analyzer version and the
 *    AR file's hash, so it is computed once per file. Nothing here changes the AR file or any recording.
 * The extracted melody is NOT ground truth: ad-libs, harmonies, style and extraction errors stay in it — the screens
 * say so. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipArMelody = api; })(typeof self !== 'undefined' ? self : globalThis, () => {
'use strict';
const MODEL = 1;
const median = a => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const wrap = c => ((c % 100) + 150) % 100 - 50;

const RULES = {
  minFrames:3,        // a note lasts at least 3 frames (0.15 s)
  mergeFrames:2,      // same semitone again within 0.1 s → one note
  offGrid:40,         // median further than this from the semitone grid (glide, bend) → left out
  spread:120,         // inter-quartile spread above this (unsteady, two notes) → left out
  octaveSlip:10, octaveSlipFrames:8, // a short note this far from both neighbours is an octave/harmonic slip
  leap:8,             // a note this far from the melody around it is an octave slip (folded or left out)
  foldWithin:6,       // …folded back by an octave when that lands this close to it
  phraseGap:0.6,      // seconds of no kept note that start a new phrase
  legato:0.3,
  neighbourSeconds:0.45, // notes up to this long are checked for a window slipped onto the neighbour note         // a shorter gap to the next note is not a rest (consonant, glide left out)
  minVoicedSeconds:15, minNotes:24, minKeptShare:0.5, minPitchConfidence:0.7, minVoiceOverBandDb:-3
};

/** The AR's tuning (cents from A4 = 440 Hz): the band's own tuning when the analyzer heard it on its own (intro,
 * interludes), else the singer's circular mean on the voiced frames (when it is clear), else 0. */
function tuningOf(result) {
  if (result?.confidence?.tuningFrom === 'mr' && Number.isFinite(Number(result?.metrics?.intonation?.tuningCents))) return Number(result.metrics.intonation.tuningCents);
  let sx = 0, sy = 0, n = 0;
  for (const c of result?.curve || []) if (c != null && Number.isFinite(Number(c))) { const a = 2 * Math.PI * wrap(Number(c)) / 100; sx += Math.cos(a); sy += Math.sin(a); n++; }
  return n && Math.hypot(sx, sy) / n > 0.3 ? Math.round(Math.atan2(sy, sx) * 100 / (2 * Math.PI)) : 0;
}

/** Notes of one analysed AR. Returns {state, reason?, tuning, fps, notes:[{t, dur, midi, cents}], stats}. */
function extract(result) {
  const fps = Number(result?.fps) || 20, curve = Array.isArray(result?.curve) ? result.curve : [];
  const c = Float64Array.from(curve, v => v == null || !Number.isFinite(Number(v)) ? NaN : Number(v));
  const tuning = tuningOf(result);
  // A single missing frame between two close values is bridged (the 20 fps curve drops a frame on consonants).
  for (let j = 1; j < c.length - 1; j++) if (c[j] !== c[j] && c[j - 1] === c[j - 1] && c[j + 1] === c[j + 1] && Math.abs(c[j - 1] - c[j + 1]) < 80) c[j] = (c[j - 1] + c[j + 1]) / 2;
  let voiced = 0; for (const v of c) if (v === v) voiced++;
  const raw = [];
  for (let j = 0; j < c.length;) {
    if (c[j] !== c[j]) { j++; continue; }
    let e = j; while (e < c.length && c[e] === c[e]) e++;
    // Semitone per frame, 5-frame median inside the run.
    const q = []; for (let k = j; k < e; k++) q.push(Math.round((c[k] - tuning) / 100));
    const qf = q.map((_, k) => median(q.slice(Math.max(0, k - 2), Math.min(q.length, k + 3))));
    for (let a = 0; a < qf.length;) {
      let b = a; while (b < qf.length && qf[b] === qf[a]) b++;
      raw.push({a:j + a, b:j + b});
      a = b;
    }
    j = e;
  }
  const kept = [];
  let keptFrames = 0;
  for (const {a, b} of raw) {
    if (b - a < RULES.minFrames) continue;
    // The onset frame is usually still gliding in: left out when the note is long enough.
    const vals = Array.from(c.subarray(b - a >= 5 ? a + 1 : a, b)), med = median(vals), midi = Math.round((med - tuning) / 100);
    if (Math.abs(med - tuning - midi * 100) > RULES.offGrid) continue;
    if (vals.length >= 4 && quantile(vals, 0.75) - quantile(vals, 0.25) > RULES.spread) continue;
    const last = kept[kept.length - 1];
    if (last && last.midi === midi && a - last.b <= RULES.mergeFrames) { last.b = b; last.sum += med * (b - a); last.w += b - a; continue; }
    kept.push({a, b, midi, sum:med * (b - a), w:b - a});
  }
  // Short octave/harmonic slips: far from both neighbours (each within 1 s).
  const notes = kept.filter((n, k) => {
    if (n.b - n.a >= RULES.octaveSlipFrames) return true;
    const near = [kept[k - 1], kept[k + 1]].filter(o => o && Math.min(Math.abs(o.a - n.b), Math.abs(n.a - o.b)) <= fps);
    return !near.length || near.some(o => Math.abs(o.midi - n.midi) < RULES.octaveSlip);
  });
  // Octave slips of longer notes: far from the melody around it (median of the notes within ±3 s). Folded back by an
  // octave when that lands inside it; otherwise left out. (A real octave leap folded by mistake only makes the take's
  // note 불확실 later: deviations beyond 6 semitones are never judged.)
  let folded = 0;
  const local = notes.map((n, k) => { const around = []; for (let j = Math.max(0, k - 12); j < Math.min(notes.length, k + 13); j++) if (j !== k && Math.abs(notes[j].a - n.a) <= 3 * fps) around.push(notes[j].midi); return around.length >= 4 ? median(around) : NaN; });
  const steady = notes.filter((n, k) => {
    const m = local[k]; if (!(m === m) || Math.abs(n.midi - m) <= RULES.leap) return true;
    const o = n.midi + (n.midi < m ? 12 : -12);
    if (Math.abs(o - m) <= RULES.foldWithin) { n.sum += (o - n.midi) * 100 * n.w; n.midi = o; folded++; return true; }
    return false;
  });
  notes.length = 0; notes.push(...steady);
  for (const n of notes) keptFrames += n.b - n.a;
  const out = notes.map(n => ({t:Math.round(n.a / fps * 100) / 100, dur:Math.round((n.b - n.a) / fps * 100) / 100, midi:n.midi, cents:Math.round(n.sum / n.w)}));
  const conf = result?.confidence || {};
  const stats = {voicedSeconds:Math.round(voiced / fps * 10) / 10, notes:out.length, keptShare:voiced ? Math.round(keptFrames / voiced * 100) / 100 : 0,
    pitchConfidence:Number.isFinite(Number(conf.pitchConfidence)) ? Number(conf.pitchConfidence) : null, voiceOverBandDb:conf.voiceOverMrDb ?? null,
    low:out.length ? Math.min(...out.map(n => n.midi)) : null, high:out.length ? Math.max(...out.map(n => n.midi)) : null, folded, seconds:Number(result?.seconds) || Math.round(c.length / fps)};
  let reason = '';
  if (stats.voicedSeconds < RULES.minVoicedSeconds) reason = 'no-voice';
  else if (out.length < RULES.minNotes) reason = 'few-notes';
  else if (stats.pitchConfidence != null && stats.pitchConfidence < RULES.minPitchConfidence) reason = 'confidence';
  else if (stats.voiceOverBandDb != null && stats.voiceOverBandDb < RULES.minVoiceOverBandDb) reason = 'band';
  else if (stats.keptShare < RULES.minKeptShare) reason = 'unsteady';
  return {state:reason ? 'hold' : 'ok', ...(reason ? {reason} : {}), tuning, fps, notes:out, stats};
}

/* ---------- the alignment's melody ---------- */
/** {notes, measures, phrases:[start s]} for VzipScoreAlign.align: beat = seconds in the AR, mi = phrase index. */
function toMelody(ref) {
  const notes = [], phrases = [];
  let mi = -1, end = -Infinity;
  const list = ref?.notes || [];
  list.forEach((n, k) => {
    if (n.t - end >= RULES.phraseGap || mi < 0) { mi++; phrases.push(n.t); }
    // Like a written score: a note lasts until the next one when only a consonant or a glide was left out between
    // them (so the alignment's note-end and next-note-start timing anchors agree).
    const next = list[k + 1], gap = next ? next.t - (n.t + n.dur) : Infinity;
    notes.push({i:notes.length, midi:n.midi, beat:n.t, beats:gap > 0 && gap <= RULES.legato ? next.t - n.t : n.dur, mi, measure:String(mi + 1)});
    end = n.t + n.dur;
  });
  return {notes, measures:phrases.length, phrases, beats:end > 0 ? end : 0};
}
/** Withholding thresholds for the alignment against an extracted melody: its notes are shorter and more fragmented
 * than a score's (consonants and glides left out), so fewer of them become timing anchors for the same good match. The
 * other checks (agreement of the sung frames, how much of the take is explained, key margin) stay as for a score. */
const ALIGN_RULES = {minMatchedShare:0.3};
/** The take's frames with the AR's tuning as the reference when the take did not hear its own MR. */
function sungAgainst(frames, ref, heardMr = false) {
  return {...frames, tuning:heardMr ? frames.tuning : Number(ref?.tuning) || 0};
}

/** After the alignment: a 높음/낮음 on a short note that sounds exactly like the reference note just before or after it
 * is most likely the window slipping onto the neighbour (two performances' timings never match as well as a take and
 * its score) — 불확실, not a wrong note. The summary is recounted. Measured values are untouched. */
function refine(r, melody) {
  if (!r || !Array.isArray(r.rows) || !r.rows.length) return r;
  const notes = melody?.notes || [], shift = r.shift || 0, tuning = r.tuning || 0;
  const rows = r.rows.map(row => {
    if (row.status !== 'high' && row.status !== 'low' || row.sung == null) return row;
    const n = notes[row.i]; if (!n || n.beats > RULES.neighbourSeconds) return row;
    const near = [notes[row.i - 1], notes[row.i + 1]].some(o => o && o.mi === n.mi && Math.abs(row.sung - ((o.midi + shift) * 100 + tuning)) <= 50);
    return near ? {...row, status:'unsure', near:true} : row;
  });
  const count = s => rows.filter(x => x.status === s).length;
  const ok = count('ok'), high = count('high'), low = count('low'), judged = ok + high + low;
  const byPhrase = new Map();
  for (const x of rows) { const g = byPhrase.get(x.mi) || {measure:x.measure, mi:x.mi, off:0, n:0}; g.n++; if (x.status === 'high' || x.status === 'low') g.off++; byPhrase.set(x.mi, g); }
  const worst = [...byPhrase.values()].filter(g => g.off).map(g => ({measure:g.measure, mi:g.mi, off:g.off, notes:g.n})).sort((a, b) => b.off / b.notes - a.off / a.notes || b.off - a.off || a.mi - b.mi).slice(0, 3);
  return {...r, rows, ok, high, low, unsure:count('unsure'), missed:count('missed'), judged, pct:judged ? Math.round(ok / judged * 100) : null, worst,
    ...(r.state === 'ok' && judged < 4 ? {state:'hold', reason:'short'} : {})};
}

/* ---------- saved form (song.arReference) ---------- */
/** Small: notes as "gap.dur.midi" in frames (gap from the previous note's end), space separated. */
function pack(ref, {file = '', hash = '', analyzer = '', at = Date.now()} = {}) {
  const fps = ref.fps || 20; let prev = 0;
  const notes = (ref.notes || []).map(n => { const a = Math.round(n.t * fps), d = Math.max(1, Math.round(n.dur * fps)), s = a - prev + '.' + d + '.' + n.midi; prev = a + d; return s; }).join(' ');
  return {v:MODEL, analyzer:String(analyzer), file:String(file), hash:String(hash), at, state:ref.state, ...(ref.reason ? {reason:ref.reason} : {}), tuning:ref.tuning || 0, fps,
    stats:ref.stats || {}, notes};
}
function unpack(saved) {
  if (!saved || typeof saved.notes !== 'string') return null;
  const fps = Number(saved.fps) || 20, notes = []; let prev = 0;
  for (const part of saved.notes.split(' ')) {
    const [g, d, m] = part.split('.').map(Number);
    if (![g, d, m].every(Number.isFinite)) continue;
    const a = prev + g; notes.push({t:Math.round(a / fps * 100) / 100, dur:Math.round(d / fps * 100) / 100, midi:m}); prev = a + d;
  }
  return {state:saved.state, ...(saved.reason ? {reason:saved.reason} : {}), tuning:Number(saved.tuning) || 0, fps, notes, stats:saved.stats || {}};
}
/** Whether a saved reference still belongs to this AR file and this extraction. */
function current(saved, file, analyzer) {
  return !!saved && !!file && saved.v === MODEL && saved.file === file.id && (!file.sha256 || saved.hash === file.sha256) && (!analyzer || saved.analyzer === String(analyzer));
}
/** The comparison key: same AR file content, same extraction → results of two takes can be compared note by note. */
const compareKey = saved => ({scoreId:'ar:' + saved.file, version:String(saved.hash || '').slice(0, 16) + ':' + saved.v + ':' + saved.analyzer, partId:'ar'});

/* ---------- wording ---------- */
const HOLD_REF = {
  'no-voice':'원곡에서 노래한 부분을 충분히 찾지 못했어요',
  'few-notes':'원곡에서 또렷한 음을 충분히 뽑지 못했어요',
  confidence:'원곡의 음높이 신뢰도가 낮아요 (반주가 크거나 소리가 겹침)',
  band:'원곡에서 목소리가 반주에 묻혀 있어요',
  unsteady:'원곡 노래의 대부분이 흔들리거나 겹친 소리라 음을 뽑기 어려워요'
};
const HOLD_CMP = {
  'no-melody':'원곡에서 뽑은 음이 너무 적어요',
  'no-voice':'녹음에서 노래한 부분을 충분히 찾지 못했어요',
  'not-found':'녹음과 원곡 멜로디가 맞는 곳을 찾지 못했어요. 다른 곡이거나 원곡 멜로디 추출이 많이 틀렸을 수 있어요',
  short:'맞춰 본 음이 너무 적어요',
  'weak-match':'녹음과 원곡 멜로디가 잘 맞지 않아 틀린 비교가 될 수 있어요',
  key:'원곡과 비교해 어느 키로 불렀는지 확실하지 않아요',
  confidence:'이 녹음의 분석 신뢰도가 낮아요 (목소리가 짧거나 반주가 큼)'
};
const holdRefText = r => HOLD_REF[r] || '원곡 멜로디 판정 보류';
const holdText = r => HOLD_CMP[r] || '판정 보류';
/** "원곡보다 2반음 낮게", "원곡보다 한 옥타브 낮게", "원곡보다 14반음 낮게(1옥타브 + 2반음)"; '' for the original key. */
function shiftText(shift) {
  if (!shift) return '';
  const a = Math.abs(shift), dir = shift < 0 ? '낮' : '높';
  if (a % 12 === 0) return '원곡보다 ' + (a === 12 ? '한 옥타브 ' : a / 12 + '옥타브 ') + dir + '게';
  return '원곡보다 ' + a + '반음 ' + dir + '게' + (a > 12 ? '(' + Math.floor(a / 12) + '옥타브 + ' + (a % 12) + '반음)' : '');
}
return {MODEL, RULES, ALIGN_RULES, tuningOf, extract, toMelody, refine, sungAgainst, pack, unpack, current, compareKey, holdRefText, holdText, shiftText, HOLD_REF, HOLD_CMP};
});
