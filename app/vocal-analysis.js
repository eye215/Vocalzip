/* VOCAL.zip vocal analysis (v2): follows the singing voice over an accompaniment (MR) and measures it.
 * Runs on the device: nothing is uploaded and no paid API is used.
 *
 * 1. Predominant pitch: each 10 ms frame's spectral peaks vote for the fundamentals they could be
 *    harmonics of (harmonic summation, 10-cent bins, 75–1100 Hz). A Viterbi pass picks the smoothest
 *    loud path, and each chosen pitch is refined from its matched harmonics. Each candidate is checked
 *    against the waveform (normalized autocorrelation) and its harmonics: an octave below only wins with
 *    odd harmonics the upper pitch cannot explain. Afterwards short octave flips/spikes between held
 *    notes are repaired and unreliable frames dropped (clean()).
 * 2. Voice vs accompaniment: the phone is next to the singer, so the voice is the loudest melodic
 *    line. Pitch contours are split into a loud (voice) and a quiet (MR-only) group; very flat
 *    contours (instrument-like) are left out. The level gap is reported as a confidence hint.
 * 3. Measurements on the voice only: intonation (cents from the nearest semitone, against the MR's
 *    own tuning when it can be heard), sustained-note wobble, vibrato rate/extent/regularity,
 *    range, and phrase/breath lengths.
 * Pure functions (Node tests use them directly); inside a Web Worker it answers {samples, sampleRate}. */
(function (root) {
'use strict';
const VERSION = 2;
// 8 kHz is plenty for the voice (fundamentals ≤ 1.1 kHz, harmonics used up to 3.8 kHz) and makes the
// analysis ~4× lighter than 16 kHz on a phone. Same 64 ms window and 10 ms steps.
const SR = 8000, WIN = 512, NFFT = 1024, HOP = 80, FPS = SR / HOP;
const FMIN = 75, FMAX = 1100, PER_SEMI = 10;
const NB = Math.ceil(12 * PER_SEMI * Math.log2(FMAX / FMIN)) + 1;
const H = 8, ALPHA = 0.8, PEAKS = 20, K = 6, SPREAD = 6; // harmonics, peaks and vote spread (bins) per frame
const LOGH = Array.from({length:H + 1}, (_, h) => h ? Math.log(h) : 0);
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
/** Downsample to 8 kHz (input is already mono). */
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


/* Tunable constants of the octave / continuity / range rules (see docs/pitch-accuracy-v2.md). */
const RULES = {
  oddShare:0.15,      // lower octave wins only if its odd harmonics (3rd, 5th, 7th) carry ≥ 15 % of what the upper explains
  subShare:0.10,      // a lower candidate whose odd partials (incl. fundamental) are < 10 % of the upper's is a sub-harmonic
  dropConfidence:0.3, // frames below this pitch confidence are dropped (treated as unpitched)
  instantConfidence:0.5, frameConfidence:0.75, // per-frame floors for the instant max and for held-note segments
  spikeMaxMs:150,     // an excursion this short that returns to the held note is a spike, not a sung note
  spikeJumpCents:300, // …when it jumps further than this from both sides (non-octave spikes are removed)
  effectiveSeconds:0.2, effectiveConfidence:0.8,                // 유효 최고음
  stableSeconds:0.5, stableConfidence:0.8, stableSpreadCents:60 // 안정 최고음 (spread of the vibrato-free pitch)
};

// Autocorrelation of the Hann window itself, to undo its taper (Boersma 1993, as in Praat).
const HANN_AC = (() => {
  const w = Float64Array.from({length:WIN}, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1))), ac = new Float64Array(WIN);
  for (let l = 0; l < WIN; l++) { let s = 0; for (let i = 0; i + l < WIN; i++) s += w[i] * w[i + l]; ac[l] = s; }
  return ac.map(v => v / ac[0]);
})();
/** Acoustic evidence for one candidate pitch: amplitude found at each harmonic (1…H), how much of
 * the frame's spectral power those harmonics explain, and the waveform's normalized autocorrelation
 * at exactly that (fractional) period, computed from the power spectrum, so high notes whose period
 * is only a few samples at 8 kHz are not penalised by interpolation. */
function evidence(power, hz, peaks) {
  const amps = new Float64Array(H + 1);
  let total = 0, matched = 0;
  for (const p of peaks) {
    const pw = p.amp * p.amp; total += pw;
    const h = Math.round(p.hz / hz);
    if (h < 1 || h > H || Math.abs(1200 * Math.log2(p.hz / (h * hz))) > 40) continue;
    matched += pw; if (p.amp > amps[h]) amps[h] = p.amp;
  }
  // r(τ) = Σ P_k cos(2πkτ/N) by the cosine recurrence (no trig calls in the loop).
  const lag = SR / hz, theta = 2 * Math.PI * lag / NFFT, c1 = Math.cos(theta), half = NFFT / 2;
  let r0 = power[0], r = power[0], prev = 1, cur = c1;
  for (let k = 1; k < half; k++) { r0 += 2 * power[k]; r += 2 * power[k] * cur; const next = 2 * c1 * cur - prev; prev = cur; cur = next; }
  r0 += power[half]; r += power[half] * cur;
  const l = Math.min(WIN - 2, lag), i = Math.floor(l), win = HANN_AC[i] + (HANN_AC[i + 1] - HANN_AC[i]) * (l - i);
  const periodicity = r0 > 0 ? Math.max(0, Math.min(1, r / (r0 * win))) : 0, coverage = matched / (total || 1);
  return {amps, periodicity, coverage, confidence:Math.sqrt(periodicity * coverage)};
}
/** Octave decision between a candidate and the one exactly an octave above it. Everything the upper
 * pitch explains is also an even harmonic of the lower one, so only the lower one's ODD harmonics are
 * independent evidence. A real sung C5 (523 Hz) has 1046 and 1569 Hz partials: 1569 is the 3rd
 * harmonic of C5 and no harmonic of C6, so C5 wins even with a weak fundamental. A quiet tone an
 * octave below (accompaniment doubling) adds a fundamental but no 3rd/5th/7th: the upper one stays.
 * Returns 'low' (the lower one is the fundamental), 'high' (the lower one is a sub-harmonic) or null. */
function octaveChoice(low, high, peakMax) {
  const lo = low.amps, hi = high.amps;
  let upper = 0; for (let h = 1; h <= H; h++) upper += hi[h];
  const odd = lo[3] + lo[5] + lo[7], present = [1, 3, 5, 7].filter(h => lo[h] >= 0.1 * peakMax).length;
  // Two separate odd partials (one chord tone landing on the 3rd harmonic is not enough), or a lower
  // pitch that explains the whole frame clearly better than the upper one.
  const explains = low.coverage >= 0.9 && low.coverage - high.coverage >= 0.02 && low.periodicity - high.periodicity >= 0.05;
  if (upper > 0 && odd >= RULES.oddShare * upper && (present >= 2 || odd >= 0.5 * upper || explains)) return 'low';
  if (odd + lo[1] < RULES.subShare * upper) return 'high';
  return null;
}

/* ---------- predominant pitch ---------- */
function track(x, onProgress) {
  const frames = Math.max(0, Math.floor((x.length - WIN) / HOP) + 1);
  const t = fftSetup(NFFT), hann = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1));
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), mag = new Float64Array(NFFT / 2 + 1), power = new Float64Array(NFFT / 2 + 1);
  const sal = new Float64Array(NB), weight = [], alphaPow = Array.from({length:H + 1}, (_, h) => ALPHA ** Math.max(0, h - 1)), LOGB = 12 * PER_SEMI / Math.LN2, LOGMIN = Math.log(FMIN);
  for (let d = -SPREAD; d <= SPREAD; d++) weight.push(Math.cos(Math.PI / 2 * d / SPREAD) ** 2);
  const cand = new Array(frames), peaksOf = new Array(frames), energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < WIN; i++) { const v = x[f * HOP + i]; e += v * v; }
    energy[f] = e / WIN;
    // Silence (gaps, breaths, fade-outs) has nothing to follow: no FFT, no vote.
    if (energy[f] < 1e-7) { peaksOf[f] = new Float32Array(0); cand[f] = []; continue; }
    re.fill(0); im.fill(0);
    for (let i = 0; i < WIN; i++) re[i] = x[f * HOP + i] * hann[i];
    fft(re, im, t);
    let max = 0;
    for (let k = 0; k <= NFFT / 2; k++) { const p = re[k] * re[k] + im[k] * im[k], m = Math.sqrt(p); power[k] = p; mag[k] = m; if (m > max) max = m; } // (Math.hypot is slow)
    // Spectral peaks within 40 dB of the frame's loudest, with quadratic (log) interpolation.
    const peaks = [], floor = max * 0.01;
    for (let k = 2; k < NFFT / 2 - 1; k++) {
      const m = mag[k]; if (m < floor || m < mag[k - 1] || m <= mag[k + 1]) continue;
      const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m + 1e-12), c = Math.log(mag[k + 1] + 1e-12), den = a - 2 * b + c;
      const d = den ? 0.5 * (a - c) / den : 0;
      const hz = (k + d) * SR / NFFT; if (hz < FMIN || hz > 3800) continue;
      peaks.push({hz, amp:Math.exp(b - 0.25 * (a - c) * d)});
    }
    peaks.sort((p, q) => q.amp - p.amp); peaks.length = Math.min(peaks.length, PEAKS);
    const packed = new Float32Array(peaks.length * 2); peaks.forEach((p, i) => { packed[2 * i] = p.hz; packed[2 * i + 1] = p.amp; });
    peaksOf[f] = packed; // typed: a 5-minute song keeps ~7 MB of peaks instead of a million objects
    sal.fill(0);
    for (const p of peaks) { const lp = Math.log(p.hz); for (let h = 1; h <= H; h++) {
      const f0 = p.hz / h; if (f0 < FMIN) break; if (f0 > FMAX) continue;
      const b = Math.round((lp - LOGH[h] - LOGMIN) * LOGB), w = alphaPow[h] * p.amp;
      for (let d = -SPREAD; d <= SPREAD; d++) { const j = b + d; if (j >= 0 && j < NB) sal[j] += w * weight[d + SPREAD]; }
    } }
    // Keep the strongest few local maxima as this frame's candidates.
    const c = [];
    for (let j = 1; j < NB - 1; j++) if (sal[j] > 0 && sal[j] >= sal[j - 1] && sal[j] > sal[j + 1]) c.push([j, sal[j]]);
    c.sort((p, q) => q[1] - p[1]); c.length = Math.min(c.length, K);
    // Acoustic evidence before continuity: confidence for every candidate, then the octave rule.
    // Real octave leaps stay possible: nothing here looks at the previous frame.
    for (const candidate of c) { const ev = evidence(power, FMIN * 2 ** (candidate[0] / (12 * PER_SEMI)), peaks); candidate.push(ev.confidence, ev); }
    const base = c.map(q => q[1]);
    for (let i = 0; i < c.length; i++) for (let j = 0; j < c.length; j++) {
      if (Math.abs(c[j][0] - c[i][0] - 12 * PER_SEMI) > 4) continue;
      const choice = octaveChoice(c[i][3], c[j][3], peaks[0].amp);
      // A clear acoustic decision is made decisive, so continuity cannot keep the path in the wrong octave.
      if (choice === 'low') { c[i][1] = Math.max(c[i][1], base[j]); c[j][1] = Math.min(c[j][1], base[j] * 0.3); }
      else if (choice === 'high') c[i][1] = Math.min(c[i][1], base[i] * 0.3);
    }
    for (const candidate of c) candidate.length = 3;
    c.sort((a, b) => b[1] - a[1]);
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
  const hz = new Float64Array(frames), level = new Float64Array(frames), confidence = new Float64Array(frames);
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
    hz[f] = sw ? sf / sw : f0; level[f] = s; confidence[f] = cand[f][path[f]][2];
  }
  return {frames, hz, level, energy, confidence};
}

/* ---------- continuity: spikes, octave flips, unreliable frames ---------- */
/** Cleans the tracked pitch in place. 1) Frames below RULES.dropConfidence become unpitched.
 * 2) An excursion of at most RULES.spikeMaxMs between two held notes that agree with each other
 *    (or at a note's start/end, at most 60 ms) is a tracking spike: frames an octave away are folded
 *    back onto the held note, other frames further than RULES.spikeJumpCents (≤ 60 ms) are removed.
 * A sung octave leap is held on the new note longer than that, so it is never folded. */
function clean(tr) {
  const {frames, hz, confidence} = tr, out = {lowConfidence:0, octaveFolded:0, spikesRemoved:0};
  for (let f = 0; f < frames; f++) if (hz[f] > 0 && confidence[f] < RULES.dropConfidence) { hz[f] = 0; out.lowConfidence++; }
  const runs = []; let cur = null;
  for (let f = 0; f < frames; f++) {
    if (!(hz[f] > 0)) { cur = null; continue; }
    const c = centsOf(hz[f]);
    if (cur && Math.abs(c - cur.last) < 80) { cur.end = f + 1; cur.values.push(c); cur.last = c; continue; }
    cur = {start:f, end:f + 1, values:[c], last:c}; runs.push(cur);
  }
  const maxLen = Math.round(RULES.spikeMaxMs / 10), held = r => r.end - r.start > maxLen, GAP = 3;
  for (const r of runs) r.center = median(r.values);
  let i = 0;
  while (i < runs.length) {
    if (held(runs[i])) { i++; continue; }
    // A stretch of short runs, each starting within GAP frames of the previous one.
    let j = i; while (j + 1 < runs.length && !held(runs[j + 1]) && runs[j + 1].start - runs[j].end <= GAP) j++;
    const a = runs[i].start, b = runs[j].end, len = b - a;
    const prev = i > 0 && held(runs[i - 1]) && a - runs[i - 1].end <= GAP ? runs[i - 1] : null;
    const next = j + 1 < runs.length && held(runs[j + 1]) && runs[j + 1].start - b <= GAP ? runs[j + 1] : null;
    let ref = null, both = false;
    if (prev && next && Math.abs(prev.center - next.center) <= 100 && len <= maxLen) { ref = (prev.center + next.center) / 2; both = true; }
    else if (len <= 6 && (prev || next) && !(prev && next)) ref = (prev || next).center;
    if (ref != null) for (let f = a; f < b; f++) {
      if (!(hz[f] > 0)) continue;
      const d = centsOf(hz[f]) - ref, k = Math.round(d / 1200);
      if (k && Math.abs(d - 1200 * k) <= 100) { hz[f] /= 2 ** k; confidence[f] *= 0.9; out.octaveFolded++; }
      else if (both && len <= 6 && Math.abs(d) > RULES.spikeJumpCents) { hz[f] = 0; confidence[f] = 0; out.spikesRemoved++; }
    }
    i = j + 1;
  }
  return out;
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
    // A steady, nearly periodic reference tone is measurable too. This does not identify
    // its source as human: source separation remains explicitly uncertain.
    c.pureTone = jitter < 3 && decayDbPerS > -5 && mean(Array.from(tr.confidence.subarray(c.start,c.end))) >= .94;
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
// Exact growing-prefix median: two heaps replace sorting the whole note every 10 ms.
function prefixMedian() {
  const low=[], high=[];
  const before=(a,b,max)=>max?a>b:a<b;
  const push=(heap,value,max)=>{
    let i=heap.length;heap.push(value);
    while(i){const parent=(i-1)>>1;if(!before(value,heap[parent],max))break;heap[i]=heap[parent];i=parent;}heap[i]=value;
  };
  const pop=(heap,max)=>{
    const first=heap[0],last=heap.pop();
    if(heap.length){let i=0;while(2*i+1<heap.length){let child=2*i+1;if(child+1<heap.length&&before(heap[child+1],heap[child],max))child++;if(!before(heap[child],last,max))break;heap[i]=heap[child];i=child;}heap[i]=last;}
    return first;
  };
  return {
    add(value){
      if(!low.length||value<=low[0])push(low,value,true);else push(high,value,false);
      if(low.length>high.length+1)push(high,pop(low,true),false);
      else if(high.length>low.length)push(low,pop(high,false),true);
    },
    value(){return low.length===high.length?(low[0]+high[0])/2:low[0];}
  };
}
function notesOf(segment) {
  // segment: cents per frame of one voiced contour. A new note starts when the smoothed pitch
  // stays more than 70 cents away from the current note for 50 ms.
  const m = smooth(segment), notes = []; let start = 0, away = 0, prefix = prefixMedian();
  if(m.length)prefix.add(m[0]);
  const close = end => { if (end - start >= 30) notes.push({start, end}); };
  for (let i = 1; i < m.length; i++) {
    const center = prefix.value();
    if (Math.abs(m[i] - center) > 70) { if (++away >= 5) { close(i - 4); start = i - 4; away = 0; prefix = prefixMedian();for(let j=start;j<i;j++)prefix.add(m[j]); } } else away = 0;
    prefix.add(m[i]);
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

/** Four separate "highest note" answers; never a single frame as the sung highest note.
 * - instantaneous (순간 최고음): highest single voiced frame. Can be a slide-through or a mis-read; shown for
 *   checking only, never used to judge skill or growth.
 * - validHigh (유효 최고음): highest note held ≥ RULES.effectiveSeconds as one continuous segment (no gaps,
 *   every frame confident, ≤ 80 cents frame to frame, ≤ 100 cents from the segment centre), mean
 *   confidence ≥ RULES.effectiveConfidence.
 * - stableHigh (안정 최고음): as valid, but held ≥ RULES.stableSeconds with the vibrato-free pitch moving
 *   ≤ RULES.stableSpreadCents (10th–90th percentile) and mean confidence ≥ RULES.stableConfidence.
 * - main (주 가창 음역): 10th–90th percentile of all confident voiced time: where the voice spends its time.
 * Every point keeps where it happened (t = seconds from the start of the recording, window start) so the
 * owner can listen to it. Duration is hop count, never inflated by the overlapping FFT window. */
function rangeOf(tr, voiced) {
  const all=[], segments=[]; let current=null, instant=null;
  const finish=()=>{if(current)segments.push(current);current=null;};
  for(let f=0;f<tr.frames;f++){
    if(voiced[f]&&tr.hz[f]>0&&tr.confidence[f]>=RULES.instantConfidence){const c=centsOf(tr.hz[f]);if(!instant||c>instant.cents)instant={cents:c,f};}
    if(!voiced[f]||!(tr.hz[f]>0)||tr.confidence[f]<RULES.frameConfidence){finish();continue;}
    const c=centsOf(tr.hz[f]); all.push(c);
    if(current&&(Math.abs(c-current.last)>80||Math.abs(c-current.sum/current.values.length)>100))finish();
    if(!current)current={start:f,values:[],quality:[],sum:0,last:c};
    current.values.push(c);current.sum+=c;current.quality.push(tr.confidence[f]);current.last=c;
  }
  finish();
  if(!all.length)return null;
  const rows=segments.map(s=>{const sm=smooth(Float64Array.from(s.values));return {t:s.start/FPS,dur:s.values.length/FPS,cents:median(s.values),
    confidence:mean(s.quality),spread:quantile(Array.from(sm),.9)-quantile(Array.from(sm),.1)};});
  const valid=rows.filter(s=>s.dur>=RULES.effectiveSeconds-1e-9&&s.confidence>=RULES.effectiveConfidence);
  const stable=valid.filter(s=>s.dur>=RULES.stableSeconds-1e-9&&s.confidence>=RULES.stableConfidence&&s.spread<=RULES.stableSpreadCents);
  const top=list=>list.length?list.reduce((a,b)=>a.cents>b.cents?a:b):null;
  // Every time the same note was reached under the same rule (up to 3), so it can be heard more than once.
  const point=(r,list)=>r?{note:noteName(r.cents),cents:round(r.cents),t:round(r.t,2),duration:round(r.dur,2),confidence:round(r.confidence,3),
    ...(r.spread!=null?{spreadCents:round(r.spread)}:{}),
    times:[r,...list.filter(x=>x!==r&&Math.round(x.cents/100)===Math.round(r.cents/100))].slice(0,3).map(x=>({t:round(x.t,2),duration:round(x.dur,2)}))}:null;
  const hi=top(valid),lo=valid.length?valid.reduce((a,b)=>a.cents<b.cents?a:b):null;
  const mainLow=quantile(all,.1),mainHigh=quantile(all,.9);
  return {low:lo?noteName(lo.cents):null,high:hi?noteName(hi.cents):null,
    lowCents:lo?round(lo.cents):null,highCents:hi?round(hi.cents):null,peak:instant?noteName(instant.cents):null,
    instantaneous:instant?{note:noteName(instant.cents),cents:round(instant.cents),t:round(instant.f/FPS,2),confidence:round(tr.confidence[instant.f],3),scope:'voiced-frames'}:null,
    validHigh:point(hi,valid),stableHigh:point(top(stable),stable),
    main:{low:noteName(mainLow),high:noteName(mainHigh),lowCents:round(mainLow),highCents:round(mainHigh),percentiles:[10,90]},
    criteria:{minimumSeconds:RULES.effectiveSeconds,stableSeconds:RULES.stableSeconds,minConfidence:RULES.effectiveConfidence,
      stableConfidence:RULES.stableConfidence,stableSpreadCents:RULES.stableSpreadCents,frameConfidence:RULES.frameConfidence}};
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
    return {start:n.start, t:round(n.start / FPS, 2), dur:round(dur, 2), center, dev:wrap(center - tuning), wobble, vib:hasVib ? vib : null};
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
  // Growth report v2: compact per-phrase rows (to compare the SAME phrase across takes of a song) and per-semitone
  // note statistics (high-note zone, transition zones). Small: one short array per phrase / sung semitone.
  // phrases.rows: [start s, duration s, median MIDI, intonation mean |cents| or null, sustained wobble cents or null]
  const phraseRows = kept.slice(0, 160).map(([a, b]) => {
    const inside = noteRows.filter(r => r.start >= a && r.start < b), held = inside.filter(r => r.dur >= 0.5);
    const voicedC = []; for (let f = a; f < b; f++) if (voiced[f]) voicedC.push(cents[f]);
    const into = inside.length ? weighted(inside, r => Math.abs(r.dev)) : NaN;
    return [round(a / FPS, 1), round((b - a) / FPS, 1), voicedC.length ? Math.round(median(voicedC) / 100) : null, round(into, 1), held.length ? round(mean(held.map(r => r.wobble)), 1) : null];
  });
  // pitchBands.rows: [MIDI, notes held ≥ 0.2 s, mean held s, longest held s, notes held ≥ 0.5 s, their mean wobble cents or null]
  const bandMap = new Map();
  for (const r of noteRows) {
    if (r.dur < RULES.effectiveSeconds - 1e-9) continue;
    const k = Math.round(r.center / 100), b = bandMap.get(k) || {n:0, dur:0, max:0, nw:0, wob:0};
    b.n++; b.dur += r.dur; b.max = Math.max(b.max, r.dur); if (r.dur >= 0.5) { b.nw++; b.wob += r.wobble; }
    bandMap.set(k, b);
  }
  const bandRows = [...bandMap].sort((x, y) => x[0] - y[0]).map(([k, b]) => [k, b.n, round(b.dur / b.n, 2), round(b.max, 2), b.nw, b.nw ? round(b.wob / b.nw, 1) : null]);
  return {
    notes:noteRows,
    metrics:{
      voicedSeconds:round(all.length / FPS, 1),
      intonation:noteRows.length ? {meanAbsCents:round(weighted(noteRows, r => Math.abs(r.dev)), 1), within20:round(weighted(noteRows, r => Math.abs(r.dev) <= 20 ? 1 : 0) * 100), tuningCents:round(tuning, 1), notes:noteRows.length} : null,
      stability:sustained.length ? {wobbleCents:round(median(sustained.map(r => r.wobble)), 1), notes:sustained.length} : null,
      vibrato:long.length ? {share:round(vibNotes.length / long.length * 100), rateHz:vibNotes.length ? round(median(vibNotes.map(r => r.vib.rate)), 1) : null, extentCents:vibNotes.length ? round(median(vibNotes.map(r => r.vib.extent))) : null, regularity:vibNotes.length ? round(median(vibNotes.map(r => r.vib.regularity)), 2) : null, notes:long.length} : null,
      range:rangeOf(tr, voiced),
      breath:kept.length ? {phrases:kept.length, medianPhrase:round(median(lens), 1), longestPhrase:round(Math.max(...lens), 1), medianGap:gaps.length ? round(median(gaps), 2) : null} : null,
      phrases:kept.length ? {v:1, rows:phraseRows} : null,
      pitchBands:bandRows.length ? {v:1, minSeconds:RULES.effectiveSeconds, wobbleSeconds:0.5, rows:bandRows} : null
    }
  };
}

/** Analyze mono samples. Returns {version, metrics, confidence, notes, curve} (curve: 20 points/s, cents or null). */
function analyze(samples, sampleRate, {onProgress, voiceOnly = false} = {}) {
  onProgress?.(0.02);
  const x = highpass(resample(samples, sampleRate));
  const tr = track(x, onProgress), fixes = clean(tr);
  onProgress?.(0.85);
  const cs = contours(tr), melodic = cs.filter(c => !c.flat || c.pureTone), split = splitLevels(melodic);
  // A real gap between loud and quiet melodic contours (≥ 6 dB) means voice over a quieter MR: keep
  // the loud group. Otherwise everything melodic counts as voice except contours 12 dB under the median.
  const useSplit = split.gapDb != null && split.gapDb >= 6;
  const cut = useSplit ? split.threshold : (melodic.length ? median(melodic.map(c => c.level)) - 12 / 20 * Math.LN10 : Infinity);
  const voiced = new Uint8Array(tr.frames), mr = [], voiceLv = [], mrLv = [];
  for (const c of cs) {
    const isVoice = (!c.flat || c.pureTone) && c.level >= cut;
    (isVoice ? voiceLv : mrLv).push(c.level);
    for (let f = c.start; f < c.end; f++) if (isVoice) voiced[f] = 1; else mr.push(centsOf(tr.hz[f]));
  }
  // Short clips require particularly strong pitch evidence; do not invent voice from brief MR notes.
  let voicedFrames = 0; for (let f = 0; f < tr.frames; f++) voicedFrames += voiced[f];
  if (voicedFrames < 20 || (voicedFrames < 2 * FPS && mean(Array.from(tr.confidence).filter((_,f)=>voiced[f])) < .9)) { voiced.fill(0); voicedFrames=0; mr.length = 0; voiceLv.length = 0; }
  // How much louder the voice is than the accompaniment heard on its own (confidence hint).
  const gapDb = voiceLv.length && mrLv.length ? 20 / Math.LN10 * (median(voiceLv) - median(mrLv)) : null;
  // The MR's tuning, from the accompaniment heard on its own (needs ≥ 3 s of it).
  let ref = null;
  if (mr.length >= 3 * FPS) { let sx = 0, sy = 0; for (const c of mr) { const a = 2 * Math.PI * wrap(c) / 100; sx += Math.cos(a); sy += Math.sin(a); } if (Math.hypot(sx, sy) / mr.length > 0.5) ref = Math.atan2(sy, sx) * 100 / (2 * Math.PI); }
  // Song identification needs the same voice mask, not note/vibrato measurements.
  const out = voiceOnly ? {metrics:{voicedSeconds:round(voicedFrames < 20 ? 0 : voicedFrames / FPS,1)},notes:[]} : measure(tr, voiced, ref);
  const step = FPS / 20, curve = [];
  for (let f = 0; f < tr.frames; f += step) {
    const v = []; for (let g = f; g < Math.min(tr.frames, f + step); g++) if (voiced[g]) v.push(centsOf(tr.hz[g]));
    curve.push(v.length >= step / 2 ? round(median(v)) : null);
  }
  onProgress?.(1);
  const seconds = round(samples.length / sampleRate, 1);
  return {
    version:VERSION, seconds,
    confidence:{pitchConfidence:round(mean(Array.from(tr.confidence).filter((_,f)=>voiced[f])),3), pitchMethod:'harmonic-octave-continuity-v2', sourceVerified:false, octaveFoldedFrames:fixes.octaveFolded, spikeFramesRemoved:fixes.spikesRemoved, lowConfidenceFrames:fixes.lowConfidence, voiceOverMrDb:round(gapDb, 1), separated:gapDb != null && gapDb >= 6, tuningFrom:ref == null ? 'a440' : 'mr', voicedShare:round(out.metrics.voicedSeconds / (seconds || 1) * 100)},
    metrics:out.metrics, notes:out.notes.map(n => ({t:n.t, dur:n.dur, cents:round(n.center), dev:round(n.dev), vib:!!n.vib})), curve, fps:20
  };
}

/** The same analysis on the voice alone: each of the song's own MR files (mrs: [{id, samples, sampleRate}]) is lined up
 * with the take and subtracted (app/mr-cancel.js); the one that removes the most is used. null with the reasons when
 * none of them is in the take. The cleaned voice is returned for listening only (never saved). */
function analyzeWithoutMr(samples, sampleRate, mrs, {onProgress} = {}) {
  const C = root.VzipMrCancel || (typeof require === 'function' ? require('./mr-cancel.js') : null);
  if (!C || !Array.isArray(mrs) || !mrs.length) return {result:null, reasons:['unavailable']};
  const rec = resample(samples, sampleRate), reasons = [];
  let best = null;
  for (const mr of mrs.slice(0, 3)) {
    const out = C.cancel(rec, resample(mr.samples, mr.sampleRate));
    if (!out.ok) { reasons.push(out.reason); continue; }
    if (!best || out.report.removedDb > best.report.removedDb) best = {...out, id:mr.id};
  }
  onProgress?.(0.15);
  if (!best) return {result:null, reasons};
  const result = analyze(best.voice, SR, {onProgress:p => onProgress?.(0.15 + p * 0.85)});
  result.confidence.mrRemoved = {trackId:String(best.id || ''), offsetSeconds:best.report.offsetSeconds, speed:best.report.speed, removedDb:best.report.removedDb};
  result.voice = best.voice; result.voiceRate = SR;
  return {result, reasons};
}
const api = {VERSION, analyze, analyzeWithoutMr, noteName, centsOf, resample, RULES, _internal:{track, clean, contours, highpass, notesOf, prefixMedian, rangeOf, evidence, octaveChoice}};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.VzipVocalAnalysis = api;
// As a Web Worker: {samples, sampleRate} in, {progress} … {result} or {error} out.
if (typeof window === 'undefined' && typeof self === 'object' && typeof importScripts === 'function') {
  self.onmessage = e => {
    try {
      const {samples, sampleRate, voiceOnly, mrs} = e.data, onProgress = p => self.postMessage({progress:p});
      if (Array.isArray(mrs)) {
        if (!self.VzipMrCancel) importScripts('mr-cancel.js?v=1');
        const out = analyzeWithoutMr(samples, sampleRate, mrs, {onProgress});
        self.postMessage({result:out.result, reasons:out.reasons}, out.result?.voice ? [out.result.voice.buffer] : []);
        return;
      }
      self.postMessage({result:analyze(samples, sampleRate, {voiceOnly:voiceOnly===true,onProgress})});
    }
    catch (err) { self.postMessage({error:err.message || String(err)}); }
  };
}
})(typeof self !== 'undefined' ? self : this);
