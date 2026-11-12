/* 음표 단위 악보 비교 (note-level score vs recording, 시험판): pure functions, also loaded by the Node tests.
 * Input: the confirmed vocal part as a note sequence (VzipScoreRange.melody) and one recording's pitch curve
 * (VZ.analyzeRecording → curve, 20 points/s, cents = MIDI × 100, null = no voice). Nothing here changes measured values:
 * a key the singer moved is detected and the comparison is made relative to it, never by moving the measurements.
 *
 * 1. Key: pitch-class histograms (score vs voice) propose shifts; each is tried by a quick alignment at 10 frames/s and
 *    the best one is kept. Two different keys scoring alike → 판정 보류.
 * 2. Alignment (subsequence DTW / Viterbi): every frame is either outside the score (gain 0) or on one score note.
 *    A frame near the note's pitch gains, a far one loses; staying on a note or moving to the next is free, skipping
 *    notes costs a little, starting or jumping elsewhere in the score (partial takes, repeats) costs more. So the take may
 *    cover any part of the song, sung at any tempo with rubato.
 * 3. Timing: well-matched note starts/ends become anchors (beat ↔ seconds). Anchors that disagree with their
 *    neighbours (Theil–Sen line through the nearest ones) are dropped, and every note's place in the recording is read
 *    from the remaining anchors (piecewise linear). This keeps a wrong note at its own place instead of letting the
 *    neighbour note with the same pitch swallow it.
 * 4. Each note: median sung pitch inside its window (onset glide left out) vs the score note in the sung key.
 *    맞음 within ±50 cent, 높음/낮음 beyond, 놓침 when there is (almost) no voice, 불확실 when too short/unsteady/far
 *    from any anchor. Poor coverage, poor agreement or an ambiguous key → the whole result is 판정 보류. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipScoreAlign = api; })(typeof self !== 'undefined' ? self : globalThis, () => {
'use strict';
const VERSION = 1;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = midi => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
const nameOfCents = c => noteName(Math.round(c / 100));
const median = a => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const mod12 = k => ((k % 12) + 12) % 12;

const RULES = {
  okCents:50,                 // 맞음 within ±50 cent of the score note (in the sung key)
  skip:4, skipCost:1.5, stepCost:0.02, jumpSeconds:1, // alignment: notes skipped per frame, per skipped note, per note; start/jump costs 1 s of good match
  gainCap:2.5,                // a frame further than this (semitones) from the note costs the most
  anchorCents:60,             // a note matched this well (median) can anchor the timing
  minAnchors:6, minCovered:8, minMatchedShare:0.4, minAgreement:0.5, keyMargin:0.92,
  anchorSeconds:3,            // a note further than this from every anchor is 불확실
  maxDevCents:600,            // further than this from the score note: alignment or octave error → 불확실, not 높음/낮음
  minVoicedShare:0.34,
  minTakeShare:0.6, minAlignedSeconds:30, // the aligned part explains most of the singing, or at least 30 s of it
  tempoRange:1.8              // local tempo within ×/÷ 1.8 of the take's overall tempo (rubato, fermatas)
};

/* ---------- input ---------- */
/** The voice curve of a full analysis result: cents per frame (NaN = no voice), frames/s, and the reference tuning
 * (the MR's own tuning when the analyzer heard it, else A4 = 440 Hz). */
function framesOf(result) {
  const curve = Array.isArray(result?.curve) ? result.curve : [], fps = Number(result?.fps) || 20;
  const cents = new Float32Array(curve.length);
  for (let i = 0; i < curve.length; i++) cents[i] = curve[i] == null || !Number.isFinite(Number(curve[i])) ? NaN : Number(curve[i]);
  const tuning = result?.confidence?.tuningFrom === 'mr' ? Number(result?.metrics?.intonation?.tuningCents) || 0 : 0;
  return {cents, fps, tuning};
}
function downsample(cents, factor) {
  const m = Math.floor(cents.length / factor), out = new Float32Array(m);
  for (let j = 0; j < m; j++) { let s = 0, c = 0; for (let k = 0; k < factor; k++) { const v = cents[j * factor + k]; if (v === v) { s += v; c++; } } out[j] = c ? s / c : NaN; }
  return out;
}

/* ---------- key ---------- */
/** Shifts (semitones, sung − score) worth trying: the best pitch-class matches, in the octave(s) near the sung median. */
function shiftCandidates(notes, cents, tuning) {
  const hs = new Float64Array(12), hv = new Float64Array(12), voiced = [];
  for (const n of notes) hs[mod12(n.midi)] += n.beats;
  for (const c of cents) if (c === c) { hv[mod12(Math.round((c - tuning) / 100))]++; voiced.push(c); }
  if (!voiced.length) return [0];
  const corr = Array.from({length:12}, (_, k) => { let s = 0; for (let p = 0; p < 12; p++) s += hs[p] * hv[(p + k) % 12]; return [k, s]; }).sort((a, b) => b[1] - a[1]);
  const w = notes.map(n => [n.midi, n.beats]).sort((a, b) => a[0] - b[0]), half = w.reduce((s, x) => s + x[1], 0) / 2;
  let acc = 0, scoreMid = w[0][0]; for (const [m, b] of w) { acc += b; if (acc >= half) { scoreMid = m; break; } }
  const d = (median(voiced) - tuning) / 100 - scoreMid, out = new Set([0]);
  for (const [k] of corr.slice(0, 3)) for (let o = -3; o <= 3; o++) { const s = k + 12 * o; if (Math.abs(s - d) <= 9 && Math.abs(s) <= 24) out.add(s); }
  return [...out];
}

/* ---------- alignment ---------- */
/** Viterbi over [outside, note 0 … note n−1] for every frame. Returns the total gain and the state per frame (−1 = outside). */
function viterbi(notes, cents, shift, tuning, fps = 20) {
  const n = notes.length, m = cents.length, K = RULES.skip, cap = RULES.gainCap;
  const expect = Float64Array.from(notes, x => (x.midi + shift) * 100 + tuning);
  const V = new Float64Array(n).fill(-Infinity), back = new Uint8Array(n * m), from = new Int32Array(m);
  const jumpCost = RULES.jumpSeconds * fps;
  let B = 0;
  for (let j = 0; j < m; j++) {
    let best = B, bi = -1;
    for (let i = 0; i < n; i++) if (V[i] > best) { best = V[i]; bi = i; }
    from[j] = bi;
    const c = cents[j], voiced = c === c, base = j * n, jump = best - jumpCost;
    for (let i = n - 1; i >= 0; i--) {
      let v = V[i], code = 0;
      for (let k = 1; k <= K && k <= i; k++) { const x = V[i - k] - RULES.stepCost - RULES.skipCost * (k - 1); if (x > v) { v = x; code = k; } }
      if (jump > v) { v = jump; code = K + 1; }
      let gain = 0;
      if (voiced) { let d = Math.abs(c - expect[i]) / 100; const o = Math.abs(d - 12) + 1; if (o < d) d = o; d *= 1.5; gain = 1 - (d < cap ? d : cap); }
      V[i] = v + gain; back[base + i] = code;
    }
    B = best;
  }
  let total = B, s = -1;
  for (let i = 0; i < n; i++) if (V[i] > total) { total = V[i]; s = i; }
  const path = new Int32Array(m);
  for (let j = m - 1; j >= 0; j--) {
    path[j] = s;
    if (s < 0) { s = from[j]; continue; }
    const code = back[j * n + s];
    s = code === 0 ? s : code <= K ? s - code : from[j];
  }
  return {total, path};
}

/* ---------- timing ---------- */
/** Theil–Sen line through points [[beat, t]] → {slope, at(beat)}. */
function theilSen(pts) {
  const slopes = [];
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) { const db = pts[b][0] - pts[a][0]; if (db > 1e-6) slopes.push((pts[b][1] - pts[a][1]) / db); }
  const slope = slopes.length ? Math.min(3, Math.max(0.12, median(slopes))) : 0.5;
  const icpt = median(pts.map(p => p[1] - slope * p[0]));
  return {slope, at:b => icpt + slope * b};
}
const nearest = (pts, beat, k) => pts.map(p => [Math.abs(p[0] - beat), p]).sort((a, b) => a[0] - b[0]).slice(0, k).map(x => x[1]);
/** Anchors consistent with their neighbours → beat → seconds (piecewise linear, local slope beyond the ends). */
function timeMap(anchors) {
  let pts = anchors.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let pass = 0; pass < 2 && pts.length >= 3; pass++) {
    const keep = pts.filter(p => {
      const near = nearest(pts.filter(q => q !== p), p[0], 6), fit = theilSen(near);
      return Math.abs(fit.at(p[0]) - p[1]) <= Math.max(0.12, 0.25 * fit.slope);
    });
    if (keep.length < 2 || keep.length === pts.length) { if (keep.length >= 2) pts = keep; break; }
    pts = keep;
  }
  // Monotone: a later beat never maps earlier.
  const mono = []; for (const p of pts) { const last = mono[mono.length - 1]; if (!last || (p[0] > last[0] + 1e-6 && p[1] > last[1])) mono.push(p); }
  const edge = (side) => theilSen(side === 'start' ? mono.slice(0, 6) : mono.slice(-6));
  const head = edge('start'), tail = edge('end');
  const at = beat => {
    if (!mono.length) return NaN;
    if (beat <= mono[0][0]) return mono[0][1] - (mono[0][0] - beat) * head.slope;
    const last = mono[mono.length - 1];
    if (beat >= last[0]) return last[1] + (beat - last[0]) * tail.slope;
    let lo = 0, hi = mono.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (mono[mid][0] <= beat) lo = mid; else hi = mid; }
    const a = mono[lo], b = mono[hi];
    return a[1] + (b[1] - a[1]) * (beat - a[0]) / (b[0] - a[0]);
  };
  return {at, anchors:mono, distance:t => mono.reduce((d, p) => Math.min(d, Math.abs(p[1] - t)), Infinity)};
}

/* ---------- one segment of the path ---------- */
function visitsOf(path) {
  const out = []; let s = -2, a = 0;
  for (let j = 0; j <= path.length; j++) {
    const x = j < path.length ? path[j] : -2;
    if (x !== s) { if (s >= 0) out.push({i:s, a, b:j}); s = x; a = j; }
  }
  return out;
}
/** Contiguous runs of visits moving forward through the score (a jump back or far ahead starts a new segment;
 * a step back of a few notes is alignment noise and is left out). */
function segmentsOf(visits) {
  const out = []; let cur = [];
  for (const v of visits) {
    const last = cur[cur.length - 1];
    if (last && v.i <= last.i && last.i - v.i <= 3) continue;
    if (last && (v.i <= last.i || v.i - last.i > 8)) { out.push(cur); cur = []; }
    cur.push(v);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Align one take with the melody. melody: VzipScoreRange.melody(); sung: framesOf(result).
 * Options: reliable (the analysis itself is trustworthy, VZ.analysisReliable), shifts (force candidates, tests). */
function align(melody, sung, {reliable = true, shifts = null} = {}) {
  const t0 = Date.now();
  const notes = (melody?.notes || []).filter(n => Number.isFinite(n.midi) && n.beats > 0);
  const {cents, fps, tuning} = sung;
  const base = {version:VERSION, fps, tuning, notesTotal:notes.length, measuresTotal:new Set(notes.map(n => n.mi)).size, rows:[], segments:[]};
  if (notes.length < RULES.minCovered) return {...base, state:'hold', reason:'no-melody'};
  let voicedFrames = 0; for (const c of cents) if (c === c) voicedFrames++;
  if (voicedFrames < 5 * fps) return {...base, state:'hold', reason:'no-voice'};
  // 1. Key: quick alignment at half the frame rate for each candidate shift.
  const candidates = shifts || shiftCandidates(notes, cents, tuning), coarse = fps >= 20 ? downsample(cents, 2) : cents;
  const tried = candidates.map(s => ({shift:s, total:viterbi(notes, coarse, s, tuning, fps >= 20 ? fps / 2 : fps).total})).sort((a, b) => b.total - a.total);
  const best = tried[0], rival = tried.find(x => mod12(x.shift) !== mod12(best.shift));
  const keyAmbiguous = !!rival && best.total > 0 && rival.total >= RULES.keyMargin * best.total;
  const shift = best.shift;
  // 2. Full-rate alignment in that key (memory: frames × notes bytes; long takes use the coarse frames).
  const fine = notes.length * cents.length <= 24e6, frames = fine ? cents : coarse, rate = fine ? fps : fps / 2;
  const {path} = viterbi(notes, frames, shift, tuning, rate);
  const expect = n => (n.midi + shift) * 100 + tuning;
  const voicedIn = (a, b) => { const v = []; for (let j = Math.max(0, a); j < Math.min(frames.length, b); j++) if (frames[j] === frames[j]) v.push(frames[j]); return v; };
  // 3. Per segment: anchors → time map. Anchors carry their note: [beat, seconds, note index].
  const raw = [];
  for (const seg of segmentsOf(visitsOf(path))) {
    const anchors = [];
    for (const v of seg) {
      const n = notes[v.i];
      // The note's sung span = its frames near the score pitch (a wrong neighbour assigned here does not move it).
      const e = expect(n); let first = -1, last = -1;
      for (let j = v.a; j < v.b; j++) if (frames[j] === frames[j] && Math.abs(frames[j] - e) <= 100) { if (first < 0) first = j; last = j; }
      if (first < 0) continue;
      const vals = voicedIn(first, last + 1), med = median(vals);
      if (vals.length < 2 || Math.abs(med - e) > RULES.anchorCents) continue;
      const prev = notes[v.i - 1], next = notes[v.i + 1];
      const restBefore = !prev || prev.beat + prev.beats < n.beat - 1e-3, restAfter = !next || n.beat + n.beats < next.beat - 1e-3;
      if (restBefore || prev.midi !== n.midi) anchors.push([n.beat, first / rate, v.i]);
      if (!restAfter && next.midi !== n.midi) anchors.push([n.beat + n.beats, (last + 1) / rate, v.i]);
    }
    if (anchors.length >= 2) raw.push({all:anchors, list:timeMap(anchors).anchors});
  }
  // The take's overall tempo (seconds per beat): a stretch aligned much faster or slower than the rest is the alignment
  // racing through the score on chance pitch matches (many wrong notes, another song) — its anchors are dropped.
  const slopes = [];
  for (const {list} of raw) for (let k = 1; k < list.length; k++) { const db = list[k][0] - list[k - 1][0]; if (db >= 0.5) slopes.push((list[k][1] - list[k - 1][1]) / db); }
  const tempo = slopes.length ? median(slopes) : NaN;
  const rows = [], seen = new Map(); let matched = 0, covered = 0, agree = 0, voicedTotal = 0, anchorsTotal = 0;
  const segments = [];
  for (const {all, list} of raw) {
    const kept = Number.isFinite(tempo) ? list.filter(p => { const s = theilSen(nearest(list, p[0], 7)).slope; return s >= tempo / RULES.tempoRange && s <= tempo * RULES.tempoRange; }) : list;
    if (kept.length < 3) continue;
    const map = timeMap(kept);
    if (map.anchors.length < 3) continue;
    const good = [...new Set(map.anchors.map(p => p[2]))], firstBeat = map.anchors[0][0], lastBeat = map.anchors[map.anchors.length - 1][0];
    // Edge notes whose own anchor fell out of the tempo check stay in when they are right next to the kept ones.
    const near = all.filter(p => p[0] >= firstBeat - 4 && p[0] <= lastBeat + 4).map(p => p[2]);
    const i0 = Math.min(...good, ...near), i1 = Math.max(...good, ...near);
    segments.push({from:i0, to:i1, anchors:map.anchors.length, start:Math.round(map.at(notes[i0].beat) * 100) / 100, end:Math.round(map.at(notes[i1].beat + notes[i1].beats) * 100) / 100});
    anchorsTotal += map.anchors.length; matched += good.length;
    for (let i = i0; i <= i1; i++) {
      const n = notes[i], on = map.at(n.beat), off = Math.max(on + 0.05, map.at(n.beat + n.beats)), d = off - on;
      const a = on + Math.min(0.2 * d, 0.1), b = off - Math.min(0.1 * d, 0.06);
      let ja = Math.ceil(a * rate), jb = Math.floor(b * rate);
      if (jb < ja) ja = jb = Math.round((a + b) / 2 * rate);
      const total = Math.max(0, Math.min(frames.length - 1, jb) - Math.max(0, ja) + 1), vals = voicedIn(ja, jb + 1), e = expect(n);
      const visit = (seen.get(i) || 0) + 1; seen.set(i, visit);
      const row = {i, measure:n.measure, mi:n.mi, midi:n.midi, expected:Math.round(e), t:Math.round(Math.max(0, on) * 100) / 100, dur:Math.round(d * 100) / 100, visit, ...(n.lyric ? {lyric:n.lyric} : {})};
      covered++;
      if (!total || !vals.length || vals.length / total < RULES.minVoicedShare) { rows.push({...row, sung:null, dev:null, status:d >= 0.12 && total ? 'missed' : 'unsure'}); continue; }
      const med = median(vals), dev = med - e;
      voicedTotal += vals.length; for (const v of vals) if (Math.abs(v - e) <= 100) agree++;
      const spread = vals.length >= 4 ? quantile(vals, 0.75) - quantile(vals, 0.25) : 0;
      let status = Math.abs(dev) <= RULES.okCents ? 'ok' : dev > 0 ? 'high' : 'low';
      if (Math.abs(dev) > RULES.maxDevCents || vals.length < 2 || spread > 150 || map.distance(on) > RULES.anchorSeconds) status = 'unsure';
      rows.push({...row, sung:Math.round(med), dev:Math.round(dev), status});
    }
  }
  // 4. Summary and the reasons to withhold it.
  const count = s => rows.filter(r => r.status === s).length;
  const ok = count('ok'), high = count('high'), low = count('low'), judged = ok + high + low;
  const coveredMeasures = new Set(rows.map(r => r.mi)).size;
  const agreement = voicedTotal ? agree / voicedTotal : 0, matchedShare = covered ? matched / covered : 0;
  const repeat = repeatOf(notes, segments);
  // How much of the singing in the take the aligned stretches explain (another song only matches here and there).
  let inside = 0;
  for (const g of segments) for (let j = Math.max(0, Math.floor(g.start * rate)); j < Math.min(frames.length, Math.ceil(g.end * rate)); j++) if (frames[j] === frames[j]) inside++;
  let voicedAll = 0; for (const c of frames) if (c === c) voicedAll++;
  const takeShare = voicedAll ? inside / voicedAll : 0, alignedSeconds = inside / rate;
  let reason = '';
  if (!segments.length || anchorsTotal < RULES.minAnchors) reason = 'not-found';
  else if (takeShare < RULES.minTakeShare && alignedSeconds < RULES.minAlignedSeconds) reason = 'not-found';
  else if (covered < RULES.minCovered || judged < RULES.minCovered / 2) reason = 'short';
  else if (matchedShare < RULES.minMatchedShare || agreement < RULES.minAgreement) reason = 'weak-match';
  else if (keyAmbiguous) reason = 'key';
  else if (!reliable) reason = 'confidence';
  const byMeasure = new Map();
  for (const r of rows) { const g = byMeasure.get(r.mi) || {measure:r.measure, mi:r.mi, off:0, dev:[], n:0}; g.n++; if (['high', 'low', 'missed'].includes(r.status)) g.off++; if (r.dev != null && r.status !== 'unsure') g.dev.push(Math.abs(r.dev)); byMeasure.set(r.mi, g); }
  const worst = [...byMeasure.values()].filter(g => g.off).map(g => ({measure:g.measure, mi:g.mi, off:g.off, notes:g.n, meanAbs:g.dev.length ? Math.round(g.dev.reduce((s, x) => s + x, 0) / g.dev.length) : null}))
    .sort((a, b) => b.off / b.notes - a.off / a.notes || b.off - a.off || (b.meanAbs || 0) - (a.meanAbs || 0) || a.mi - b.mi).slice(0, 3);
  return {...base, state:reason ? 'hold' : 'ok', ...(reason ? {reason} : {}), shift, keyAmbiguous, tried:tried.map(x => ({shift:x.shift, total:Math.round(x.total)})),
    rows, segments, ok, high, low, missed:count('missed'), unsure:count('unsure'), judged, pct:judged ? Math.round(ok / judged * 100) : null,
    coveredMeasures, coveredNotes:covered, takeShare:Math.round(takeShare * 100) / 100, alignedSeconds:Math.round(alignedSeconds), agreement:Math.round(agreement * 100) / 100, matchedShare:Math.round(matchedShare * 100) / 100, anchors:anchorsTotal,
    worst, repeat, ms:Date.now() - t0};
}
/** The same melody elsewhere in the score (a repeated verse/chorus): the measure numbers may belong to the other copy. */
function repeatOf(notes, segments) {
  const out = [];
  for (const s of segments) {
    const span = s.to - s.from + 1; if (span < 6) continue;
    for (let d = -s.from; s.to + d < notes.length; d++) {
      if (!d) continue;
      let same = 0; for (let i = s.from; i <= s.to; i++) if (notes[i + d].midi === notes[i].midi && Math.abs(notes[i + d].beats - notes[i].beats) < 1e-3) same++;
      if (same / span >= 0.9) { out.push({measure:notes[s.from].measure, other:notes[s.from + d].measure}); break; }
    }
  }
  return out;
}

/* ---------- wording ---------- */
const HOLD = {
  'no-melody':'악보에서 보컬 음표를 충분히 찾지 못했어요',
  'no-voice':'녹음에서 노래한 부분을 충분히 찾지 못했어요',
  'not-found':'녹음과 악보가 맞는 곳을 찾지 못했어요. 다른 곡이거나 악보 인식이 많이 틀렸을 수 있어요',
  short:'맞춰 본 음이 너무 적어요',
  'weak-match':'녹음과 악보가 잘 맞지 않아 틀린 비교가 될 수 있어요',
  key:'어느 키로 불렀는지 확실하지 않아요',
  confidence:'분석 신뢰도가 낮아요 (목소리가 짧거나 반주가 큼)'
};
const holdText = r => HOLD[r] || '판정 보류';
const STATUS = {ok:'맞음', high:'높음', low:'낮음', missed:'놓침', unsure:'불확실'};
/** How the take was sung relative to the written key, to go before "부른 것으로": "악보보다 2반음 낮은 키로",
 * "한 옥타브 낮게", "악보보다 14반음 낮게(1옥타브 + 2반음)"; '' for the written key. */
function shiftText(shift) {
  if (!shift) return '';
  const a = Math.abs(shift), dir = shift < 0 ? '낮' : '높';
  if (a % 12 === 0) return (a === 12 ? '한 옥타브 ' : a / 12 + '옥타브 ') + dir + '게';
  if (a > 12) return '악보보다 ' + a + '반음 ' + dir + '게(' + Math.floor(a / 12) + '옥타브 + ' + (a % 12) + '반음)';
  return '악보보다 ' + a + '반음 ' + dir + '은 키로';
}
/** Deviation from the score note: "−1반음" (a semitone or more), "+30 cent" (less). */
function devText(dev) {
  if (dev == null || !Number.isFinite(dev)) return '';
  const sign = dev > 0 ? '+' : dev < 0 ? '−' : '±';
  return Math.abs(dev) >= 100 ? sign + Math.round(Math.abs(dev) / 100) + '반음' : sign + Math.round(Math.abs(dev)) + ' cent';
}

/* ---------- saved form ---------- */
const CODE = {ok:'o', high:'h', low:'l', missed:'m', unsure:'u'};
/** Small record kept on the song (song.noteCompare.takes[recordingId]): no curve, no rows — one status letter per score
 * note (first time sung; '.' = not compared), plus the summary. Enough to compare two takes note by note later. */
function compact(r, {scoreId = '', version = '', partId = '', at = Date.now()} = {}) {
  const first = new Map(); for (const x of r.rows || []) if (!first.has(x.i)) first.set(x.i, x.status);
  const idx = [...first.keys()], from = idx.length ? Math.min(...idx) : 0, to = idx.length ? Math.max(...idx) : -1;
  let s = ''; for (let i = from; i <= to; i++) s += first.has(i) ? CODE[first.get(i)] : '.';
  return {v:VERSION, at, score:scoreId, ver:String(version || ''), part:partId, shift:r.shift ?? 0, state:r.state, ...(r.reason ? {reason:r.reason} : {}),
    pct:r.pct ?? null, judged:r.judged || 0, ok:r.ok || 0, missed:r.missed || 0, cover:[r.coveredMeasures || 0, r.measuresTotal || 0],
    worst:(r.worst || []).map(w => String(w.measure)), from, s};
}
const api = {VERSION, RULES, HOLD, STATUS, noteName, nameOfCents, framesOf, shiftCandidates, viterbi, timeMap, align, compact, holdText, shiftText, devText, _internal:{downsample, theilSen, visitsOf, segmentsOf, repeatOf}};
// As a Web Worker (the phone stays responsive on long takes): {melody, sung:{cents, fps, tuning}, options} in, {result} or {error} out.
if (typeof window === 'undefined' && typeof self === 'object' && typeof importScripts === 'function' && typeof module !== 'object') {
  self.onmessage = e => {
    try { const {melody, sung, options} = e.data; self.postMessage({result:align(melody, {...sung, cents:Float32Array.from(sung.cents, v => v == null ? NaN : v)}, options || {})}); }
    catch (err) { self.postMessage({error:err.message || String(err)}); }
  };
}
return api;
});
