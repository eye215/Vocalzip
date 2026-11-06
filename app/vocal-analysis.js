/* VOCAL.zip vocal analysis (v1): follows the singing voice over an accompaniment (MR) and measures it.
 * Runs on the device: nothing is uploaded and no paid API is used.
 *
 * 1. Predominant pitch: each 10 ms frame's spectral peaks vote for the fundamentals they could be
 *    harmonics of (harmonic summation, 10-cent bins, 75–1100 Hz). A Viterbi pass picks the smoothest
 *    loud path, and each chosen pitch is refined from its matched harmonics.
 * 2. Voice vs accompaniment: the phone is next to the singer, so the voice is the loudest melodic
 *    line. Pitch contours are split into a loud (voice) and a quiet (MR-only) group; very flat
 *    contours (instrument-like) are left out. The level gap is reported as a confidence hint.
 * 3. Measurements on the voice only: intonation (cents from the nearest semitone, against the MR's
 *    own tuning when it can be heard), sustained-note wobble, vibrato rate/extent/regularity,
 *    range, and phrase/breath lengths.
 * Pure functions (Node tests use them directly); inside a Web Worker it answers {samples, sampleRate}. */
(function (root) {
'use strict';
const VERSION = 1;
const SR = 16000, WIN = 1024, NFFT = 2048, HOP = 160, FPS = SR / HOP;   // 64 ms window, 10 ms hop
const FMIN = 75, FMAX = 1100, PER_SEMI = 10;
const NB = Math.ceil(12 * PER_SEMI * Math.log2(FMAX / FMIN)) + 1;
const H = 10, ALPHA = 0.8, PEAKS = 30, K = 6;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const binOf = f => 12 * PER_SEMI * Math.log2(f / FMIN);
const centsOf = f => 1200 * Math.log2(f / 440) + 6900;           // MIDI × 100
const noteName = c => { const m = Math.round(c / 100); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
const wrap = c => ((c % 100) + 150) % 100 - 50;                    // −50…50
const median = a => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
const quantile = (a, q) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const round = (x, d = 0) => Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null;

/* ---------- signal ---------- */
/** Linear resample to 16 kHz (input is already mono). */
function resample(x, rate) {
  if (rate === SR) return x;
  const n = Math.floor(x.length * SR / rate), out = new Float32Array(n), r = rate / SR;
  // Averaging over the source span keeps it from aliasing when coming down from 44.1/48 kHz.
  for (let i = 0; i < n; i++) {
    const a = i * r, b = a + r; let s = 0, c = 0;
    for (let j = Math.floor(a); j < Math.min(x.length, Math.ceil(b)); j++) { s += x[j]; c++; }
    out[i] = c ? s / c : 0;
  }
  return out;
}
/** 2nd-order high-pass (100 Hz): takes most of the kick drum and bass out of the vote. */
function highpass(x, fc = 100) {
  const w = 2 * Math.PI * fc / SR, cw = Math.cos(w), al = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + al, b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function fftSetup(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
  return {n, rev, cos, sin};
}
function fft(re, im, t) {
  const {n, rev, cos, sin} = t;
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let v = re[i]; re[i] = re[j]; re[j] = v; v = im[i]; im[i] = im[j]; im[j] = v; } }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let s = 0; s < n; s += size) for (let k = 0; k < half; k++) {
      const c = cos[k * step], si = sin[k * step], a = s + k, b = a + half;
      const tr = re[b] * c - im[b] * si, ti = re[b] * si + im[b] * c;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}

/* ---------- predominant pitch ---------- */
function track(x, onProgress) {
  const frames = Math.max(0, Math.floor((x.length - WIN) / HOP) + 1);
  const t = fftSetup(NFFT), hann = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1));
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), mag = new Float64Array(NFFT / 2 + 1);
  const sal = new Float64Array(NB), weight = [];
  for (let d = -PER_SEMI; d <= PER_SEMI; d++) weight.push(Math.cos(Math.PI / 2 * d / PER_SEMI) ** 2);
  const cand = new Array(frames), peaksOf = new Array(frames), energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0); let e = 0;
    for (let i = 0; i < WIN; i++) { const v = x[f * HOP + i]; e += v * v; re[i] = v * hann[i]; }
    energy[f] = e / WIN;
    fft(re, im, t);
    let max = 0;
    for (let k = 0; k <= NFFT / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); if (mag[k] > max) max = mag[k]; }
    // Spectral peaks within 40 dB of the frame's loudest, with quadratic (log) interpolation.
    const peaks = [], floor = max * 0.01;
    for (let k = 2; k < NFFT / 2 - 1; k++) {
      const m = mag[k]; if (m < floor || m < mag[k - 1] || m <= mag[k + 1]) continue;
      const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m + 1e-12), c = Math.log(mag[k + 1] + 1e-12), den = a - 2 * b + c;
      const d = den ? 0.5 * (a - c) / den : 0;
      const hz = (k + d) * SR / NFFT; if (hz < FMIN || hz > 5000) continue;
      peaks.push({hz, amp:Math.exp(b - 0.25 * (a - c) * d)});
    }
    peaks.sort((p, q) => q.amp - p.amp); peaks.length = Math.min(peaks.length, PEAKS);
    const packed = new Float32Array(peaks.length * 2); peaks.forEach((p, i) => { packed[2 * i] = p.hz; packed[2 * i + 1] = p.amp; });
    peaksOf[f] = packed; // typed: a 5-minute song keeps ~7 MB of peaks instead of a million objects
    sal.fill(0);
    for (const p of peaks) for (let h = 1; h <= H; h++) {
      const f0 = p.hz / h; if (f0 < FMIN) break; if (f0 > FMAX) continue;
      const b = Math.round(binOf(f0)), w = ALPHA ** (h - 1) * p.amp;
      for (let d = -PER_SEMI; d <= PER_SEMI; d++) { const j = b + d; if (j >= 0 && j < NB) sal[j] += w * weight[d + PER_SEMI]; }
    }
    // Keep the strongest few local maxima as this frame's candidates.
    const c = [];
    for (let j = 1; j < NB - 1; j++) if (sal[j] > 0 && sal[j] >= sal[j - 1] && sal[j] > sal[j + 1]) c.push([j, sal[j]]);
    c.sort((p, q) => q[1] - p[1]); c.length = Math.min(c.length, K);
    cand[f] = c;
    if (onProgress && f % 500 === 0) onProgress(0.1 + 0.7 * f / frames);
  }
  // Viterbi over the candidates: loud, and without big jumps (a semitone costs 0.25, capped at 2.5).
  const score = cand.map(c => new Float64Array(c.length)), from = cand.map(c => new Int32Array(c.length).fill(-1));
  for (let f = 0; f < frames; f++) {
    const c = cand[f], top = c.length ? c[0][1] : 1;
    for (let i = 0; i < c.length; i++) {
      const emit = Math.log(c[i][1] / top + 1e-9);
      if (!f || !cand[f - 1].length) { score[f][i] = emit; continue; }
      let best = -Infinity, arg = -1;
      for (let j = 0; j < cand[f - 1].length; j++) {
        const jump = Math.abs(c[i][0] - cand[f - 1][j][0]) / PER_SEMI, s = score[f - 1][j] - Math.min(2.5, 0.25 * jump);
        if (s > best) { best = s; arg = j; }
      }
      score[f][i] = best + emit; from[f][i] = arg;
    }
  }
  const path = new Int32Array(frames).fill(-1);
  for (let f = frames - 1; f >= 0; f--) {
    if (!cand[f].length) continue;
    if (path[f] < 0) { let b = 0; for (let i = 1; i < score[f].length; i++) if (score[f][i] > score[f][b]) b = i; path[f] = b; }
    if (f && from[f][path[f]] >= 0) path[f - 1] = from[f][path[f]];
  }
  // Refine each chosen pitch from the harmonics that support it (amplitude-weighted).
  const hz = new Float64Array(frames), level = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    if (path[f] < 0) continue;
    const [bin, s] = cand[f][path[f]], f0 = FMIN * 2 ** (bin / (12 * PER_SEMI));
    let sw = 0, sf = 0;
    const pk = peaksOf[f];
    for (let i = 0; i < pk.length; i += 2) {
      const ph = pk[i], h = Math.round(ph / f0); if (h < 1 || h > H) continue;
      if (Math.abs(1200 * Math.log2(ph / (h * f0))) > 40) continue;
      const w = pk[i + 1] * ALPHA ** (h - 1); sw += w; sf += w * ph / h;
    }
    hz[f] = sw ? sf / sw : f0; level[f] = s;
  }
  return {frames, hz, level, energy};
}

/* ---------- voice vs accompaniment ---------- */
/** Contours: runs of frames whose pitch moves less than 80 cents from one frame to the next. */
function contours(tr) {
  const out = []; let cur = null;
  for (let f = 0; f < tr.frames; f++) {
    const ok = tr.hz[f] > 0 && tr.energy[f] > 1e-7;
    if (ok && cur && Math.abs(centsOf(tr.hz[f]) - centsOf(tr.hz[f - 1])) < 80) { cur.end = f + 1; continue; }
    if (cur && cur.end - cur.start >= 10) out.push(cur);
    cur = ok ? {start:f, end:f + 1} : null;
  }
  if (cur && cur.end - cur.start >= 10) out.push(cur);
  for (const c of out) {
    const lv = [], cs = [];
    for (let f = c.start; f < c.end; f++) { lv.push(tr.level[f]); cs.push(centsOf(tr.hz[f])); }
    // Instrument-like: dead flat, or dying away like a struck string (piano, guitar, bass) with
    // little pitch movement. A sung note holds its level and keeps moving a little.
    const n = lv.length, tm = (n - 1) / 2, lm = mean(lv.map(Math.log)); let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - tm) * (Math.log(lv[i]) - lm); den += (i - tm) ** 2; }
    const decayDbPerS = den ? num / den * FPS * 20 / Math.LN10 : 0, jitter = std(cs);
    c.level = Math.log(median(lv));
    c.flat = (jitter < 3 && n > 40) || (decayDbPerS <= -8 && jitter < 8 && n >= 40);
  }
  return out;
}
/** Split contour levels in two (Otsu, duration-weighted). Returns the threshold and the gap in dB. */
function splitLevels(cs) {
  const v = cs.map(c => [c.level, c.end - c.start]).sort((a, b) => a[0] - b[0]);
  const total = v.reduce((s, x) => s + x[1], 0);
  let best = -1, cut = 0, wl = 0, sl = 0; const st = v.reduce((s, x) => s + x[0] * x[1], 0);
  for (let i = 0; i < v.length - 1; i++) {
    wl += v[i][1]; sl += v[i][0] * v[i][1];
    const wh = total - wl, ml = sl / wl, mh = (st - sl) / wh, between = wl * wh * (ml - mh) ** 2;
    if (between > best) { best = between; cut = i; }
  }
  if (v.length < 2) return {threshold:-Infinity, gapDb:null};
  const lo = v.slice(0, cut + 1), hi = v.slice(cut + 1);
  const avg = a => a.reduce((s, x) => s + x[0] * x[1], 0) / a.reduce((s, x) => s + x[1], 0);
  const gapDb = 20 / Math.LN10 * (avg(hi) - avg(lo));
  return {threshold:(v[cut][0] + v[cut + 1][0]) / 2, gapDb};
}

/* ---------- measurements ---------- */
const MA = 17; // 170 ms moving average: removes vibrato (≈5–7 Hz), keeps slower drift
function smooth(a) { const out = new Float64Array(a.length), h = MA >> 1; for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) { s += a[j]; n++; } out[i] = s / n; } return out; }
function notesOf(segment) {
  // segment: cents per frame of one voiced contour. A new note starts when the smoothed pitch
  // stays more than 70 cents away from the current note for 50 ms.
  const m = smooth(segment), notes = []; let start = 0, away = 0;
  const close = end => { if (end - start >= 30) notes.push({start, end}); };
  for (let i = 1; i < m.length; i++) {
    const center = median(Array.from(m.subarray(start, i)));
    if (Math.abs(m[i] - center) > 70) { if (++away >= 5) { close(i - 4); start = i - 4; away = 0; } } else away = 0;
  }
  close(m.length);
  return notes.map(n => {
    const s = n.start + 5, e = n.end - 5; // onset/offset glides left out
    return {start:s, end:e, raw:Array.from(segment.subarray(s, e)), sm:Array.from(m.subarray(s, e))};
  });
}
function vibratoOf(raw, sm) {
  const r = raw.map((v, i) => v - sm[i]), n = r.length, mr = mean(r), z = r.map(v => v - mr);
  const var0 = z.reduce((s, v) => s + v * v, 0); if (!var0) return null;
  let best = 0, lag = 0;
  const ac = l => { let s = 0; for (let i = 0; i + l < n; i++) s += z[i] * z[i + l]; return s / var0 * n / (n - l); };
  const vals = []; for (let l = 9; l <= 30; l++) vals[l] = ac(l);
  for (let l = 10; l <= 29; l++) if (vals[l] > vals[l - 1] && vals[l] >= vals[l + 1] && vals[l] > best) { best = vals[l]; lag = l; }
  if (!lag) return null;
  const a = vals[lag - 1], b = vals[lag], c = vals[lag + 1], d = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
  const rate = FPS / (lag + d), x = Math.PI * rate * MA / FPS, keep = Math.abs(1 - Math.sin(x) / x) || 1;
  // The 64 ms analysis window also smooths the wobble a little (Hann response at the vibrato rate).
  const ft = rate * WIN / SR, win = Math.abs(Math.sin(Math.PI * ft) / (Math.PI * ft) / (1 - ft * ft)) || 1;
  return {rate, extent:Math.SQRT2 * std(r) / keep / win, regularity:best};
}
function measure(tr, voiced, refTuning) {
  const cents = new Float64Array(tr.frames).fill(NaN);
  for (let f = 0; f < tr.frames; f++) if (voiced[f]) cents[f] = centsOf(tr.hz[f]);
  // Voiced runs (gaps under 50 ms bridged by the contour split already).
  const runs = []; let s = -1;
  for (let f = 0; f <= tr.frames; f++) { const v = f < tr.frames && voiced[f]; if (v && s < 0) s = f; if (!v && s >= 0) { runs.push([s, f]); s = -1; } }
  const notes = [];
  for (const [a, b] of runs) for (const n of notesOf(cents.subarray(a, b))) notes.push({...n, start:n.start + a, end:n.end + a});
  // Tuning: the MR's own tuning when it was heard long enough, else A4 = 440 Hz.
  const tuning = refTuning ?? 0;
  const noteRows = notes.map(n => {
    const center = median(n.sm), dur = (n.end - n.start) / FPS;
    const wobble = std(n.sm.map(v => v - center));
    const vib = dur >= 0.6 ? vibratoOf(n.raw, n.sm) : null;
    const hasVib = !!vib && vib.regularity >= 0.45 && vib.extent >= 15 && vib.rate >= 4 && vib.rate <= 8.5;
    return {t:round(n.start / FPS, 2), dur:round(dur, 2), center, dev:wrap(center - tuning), wobble, vib:hasVib ? vib : null};
  });
  const weighted = (rows, f) => { const w = rows.reduce((s, r) => s + r.dur, 0); return w ? rows.reduce((s, r) => s + f(r) * r.dur, 0) / w : NaN; };
  const sustained = noteRows.filter(r => r.dur >= 0.5), long = noteRows.filter(r => r.dur >= 0.6);
  const vibNotes = long.filter(r => r.vib);
  const all = []; for (let f = 0; f < tr.frames; f++) if (voiced[f]) all.push(cents[f]);
  // Phrases: voice with gaps under 200 ms merged; breath = the gaps between phrases (under 5 s).
  const phrases = []; for (const [a, b] of runs) { const last = phrases[phrases.length - 1]; if (last && a - last[1] < 20) last[1] = b; else phrases.push([a, b]); }
  const kept = phrases.filter(([a, b]) => b - a >= 50), lens = kept.map(([a, b]) => (b - a) / FPS);
  const gaps = []; for (let i = 1; i < kept.length; i++) { const g = (kept[i][0] - kept[i - 1][1]) / FPS; if (g < 5) gaps.push(g); }
  const centers = noteRows.map(r => r.center);
  return {
    notes:noteRows,
    metrics:{
      voicedSeconds:round(all.length / FPS, 1),
      intonation:noteRows.length ? {meanAbsCents:round(weighted(noteRows, r => Math.abs(r.dev)), 1), within20:round(weighted(noteRows, r => Math.abs(r.dev) <= 20 ? 1 : 0) * 100), tuningCents:round(tuning, 1), notes:noteRows.length} : null,
      stability:sustained.length ? {wobbleCents:round(median(sustained.map(r => r.wobble)), 1), notes:sustained.length} : null,
      vibrato:long.length ? {share:round(vibNotes.length / long.length * 100), rateHz:vibNotes.length ? round(median(vibNotes.map(r => r.vib.rate)), 1) : null, extentCents:vibNotes.length ? round(median(vibNotes.map(r => r.vib.extent))) : null, regularity:vibNotes.length ? round(median(vibNotes.map(r => r.vib.regularity)), 2) : null, notes:long.length} : null,
      range:all.length ? {low:noteName(Math.min(...centers.length ? centers : [quantile(all, 0.03)])), high:noteName(Math.max(...centers.length ? centers : [quantile(all, 0.97)])), lowCents:round(centers.length ? Math.min(...centers) : quantile(all, 0.03)), highCents:round(centers.length ? Math.max(...centers) : quantile(all, 0.97)), peak:noteName(quantile(all, 0.99))} : null,
      breath:kept.length ? {phrases:kept.length, medianPhrase:round(median(lens), 1), longestPhrase:round(Math.max(...lens), 1), medianGap:gaps.length ? round(median(gaps), 2) : null} : null
    }
  };
}

/** Analyze mono samples. Returns {version, metrics, confidence, notes, curve} (curve: 20 points/s, cents or null). */
function analyze(samples, sampleRate, {onProgress} = {}) {
  onProgress?.(0.02);
  const x = highpass(resample(samples, sampleRate));
  const tr = track(x, onProgress);
  onProgress?.(0.85);
  const cs = contours(tr), melodic = cs.filter(c => !c.flat), split = splitLevels(melodic);
  // A real gap between loud and quiet melodic contours (≥ 6 dB) means voice over a quieter MR: keep
  // the loud group. Otherwise everything melodic counts as voice except contours 12 dB under the median.
  const useSplit = split.gapDb != null && split.gapDb >= 6;
  const cut = useSplit ? split.threshold : (melodic.length ? median(melodic.map(c => c.level)) - 12 / 20 * Math.LN10 : Infinity);
  const voiced = new Uint8Array(tr.frames), mr = [], voiceLv = [], mrLv = [];
  for (const c of cs) {
    const isVoice = !c.flat && c.level >= cut;
    (isVoice ? voiceLv : mrLv).push(c.level);
    for (let f = c.start; f < c.end; f++) if (isVoice) voiced[f] = 1; else mr.push(centsOf(tr.hz[f]));
  }
  // Under 2 s of "voice" in a whole recording is a stray instrument note, not singing.
  let voicedFrames = 0; for (let f = 0; f < tr.frames; f++) voicedFrames += voiced[f];
  if (voicedFrames < 2 * FPS) { voiced.fill(0); mr.length = 0; voiceLv.length = 0; }
  // How much louder the voice is than the accompaniment heard on its own (confidence hint).
  const gapDb = voiceLv.length && mrLv.length ? 20 / Math.LN10 * (median(voiceLv) - median(mrLv)) : null;
  // The MR's tuning, from the accompaniment heard on its own (needs ≥ 3 s of it).
  let ref = null;
  if (mr.length >= 3 * FPS) { let sx = 0, sy = 0; for (const c of mr) { const a = 2 * Math.PI * wrap(c) / 100; sx += Math.cos(a); sy += Math.sin(a); } if (Math.hypot(sx, sy) / mr.length > 0.5) ref = Math.atan2(sy, sx) * 100 / (2 * Math.PI); }
  const out = measure(tr, voiced, ref);
  const step = FPS / 20, curve = [];
  for (let f = 0; f < tr.frames; f += step) {
    const v = []; for (let g = f; g < Math.min(tr.frames, f + step); g++) if (voiced[g]) v.push(centsOf(tr.hz[g]));
    curve.push(v.length >= step / 2 ? round(median(v)) : null);
  }
  onProgress?.(1);
  const seconds = round(samples.length / sampleRate, 1);
  return {
    version:VERSION, seconds,
    confidence:{voiceOverMrDb:round(gapDb, 1), separated:gapDb != null && gapDb >= 6, tuningFrom:ref == null ? 'a440' : 'mr', voicedShare:round(out.metrics.voicedSeconds / (seconds || 1) * 100)},
    metrics:out.metrics, notes:out.notes.map(n => ({t:n.t, dur:n.dur, cents:round(n.center), dev:round(n.dev), vib:!!n.vib})), curve, fps:20
  };
}

const api = {VERSION, analyze, noteName, centsOf, resample, _internal:{track, contours, highpass}};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.VzipVocalAnalysis = api;
// As a Web Worker: {samples, sampleRate} in, {progress} … {result} or {error} out.
if (typeof window === 'undefined' && typeof self === 'object' && typeof importScripts === 'function') {
  self.onmessage = e => {
    try { const {samples, sampleRate} = e.data; self.postMessage({result:analyze(samples, sampleRate, {onProgress:p => self.postMessage({progress:p})})}); }
    catch (err) { self.postMessage({error:err.message || String(err)}); }
  };
}
})(typeof self !== 'undefined' ? self : this);
