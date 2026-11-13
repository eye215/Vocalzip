/* VOCAL.zip 알고 있는 MR 빼기 (시험판): a recording sung over one of the song's own MR files → the voice alone.
 * The MR the singer heard is known (songs[].mrTracks), so instead of guessing what is voice (AI source separation)
 * the MR itself is lined up with the recording and subtracted:
 *  1. coarse alignment: onset envelopes (log spectral flux, 100 per second) of both, cross-correlated over every lag
 *     (the take may start anywhere in the MR, or before it). A weak or ambiguous peak means "not this MR": stop.
 *  2. fine alignment: GCC-PHAT in a few windows spread over the overlap gives the lag to a fraction of a sample and
 *     the speed ratio (a YouTube copy and the uploaded file can differ by a few tenths of a percent).
 *  3. subtraction: per frequency bin, the way the MR reached the microphone (speaker, room, level) is estimated as a
 *     slowly changing complex gain H (least squares over ~1.5 s blocks) and H·MR is subtracted; what that misses
 *     (reverb tails) is reduced with a mild spectral-subtraction gain.
 * The result is only an analysis input: nothing is saved as a recording, the original and the MR file are untouched.
 * Pure functions (Node tests use them); 8 kHz mono in, the same rate out. */
(function (root) {
'use strict';
const SR = 8000;
const RULES = {
  envHop:80, envWin:256,           // onset envelope: 10 ms steps, 32 ms window
  minOverlap:10,                   // seconds of the take that must lie inside the MR
  minScore:0.2,                    // correlation of the onset envelopes at a candidate lag
  candidates:12,                   // best distinct lags tried by actually subtracting (repeated choruses look alike)
  trySeconds:8,                    // excerpt used to compare candidates
  minRemoved:3,                    // dB of level an excerpt must lose for the MR to count as found
  fineWin:4096, fineSearch:0.05,   // GCC-PHAT windows (0.5 s) and ± search around the coarse lag (s)
  fineCount:7,
  win:512, hop:128,                // STFT 64 ms / 16 ms
  block:96,                        // frames per transfer estimate (~1.5 s)
  residual:0.12, floor:0.08        // leftover MR power assumed after subtraction, and the lowest gain
};

/* ---------- small numerics ---------- */
const fftCache = new Map();
function fftTables(n) {
  if (fftCache.has(n)) return fftCache.get(n);
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1); rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
  const t = {rev, cos, sin}; fftCache.set(n, t); return t;
}
/** In-place complex FFT (inverse = true divides by n). n is a power of two. */
function fft(re, im, inverse = false) {
  const n = re.length, {rev, cos, sin} = fftTables(n);
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let start = 0; start < n; start += size) for (let k = 0; k < half; k++) {
      const wr = cos[k * step], wi = inverse ? -sin[k * step] : sin[k * step], a = start + k, b = a + half;
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const pow2 = n => 1 << Math.ceil(Math.log2(Math.max(2, n)));
const hann = n => Float64Array.from({length:n}, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));

/* ---------- 1. coarse alignment ---------- */
/** Onset strength per 10 ms: positive log-magnitude change summed over the spectrum, mean removed. */
function envelope(x) {
  const N = RULES.envWin, hop = RULES.envHop, w = hann(N), frames = Math.max(0, Math.floor((x.length - N) / hop) + 1);
  const out = new Float64Array(frames), re = new Float64Array(N), im = new Float64Array(N), half = N / 2;
  let prev = new Float64Array(half);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const cur = new Float64Array(half); let s = 0;
    for (let k = 1; k < half; k++) { cur[k] = Math.log(1e-6 + Math.hypot(re[k], im[k])); const d = cur[k] - prev[k]; if (d > 0) s += d; }
    out[f] = f ? s : 0; prev = cur;
  }
  let m = 0; for (const v of out) m += v; m /= out.length || 1;
  for (let i = 0; i < out.length; i++) out[i] -= m;
  return out;
}
/** Pearson correlation of a and b where b is shifted by lag frames (a[i] ↔ b[i + lag]). */
function corrAt(a, b, lag) {
  let sab = 0, saa = 0, sbb = 0, n = 0;
  const from = Math.max(0, -lag), to = Math.min(a.length, b.length - lag);
  for (let i = from; i < to; i++) { const x = a[i], y = b[i + lag]; sab += x * y; saa += x * x; sbb += y * y; n++; }
  return n && saa > 0 && sbb > 0 ? {r:sab / Math.sqrt(saa * sbb), n} : {r:0, n};
}
/** Light blur (±4 frames) so a small speed difference does not split an onset peak over a 15 s piece. */
function blur(e) { const out = new Float64Array(e.length); for (let i = 0; i < e.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - 4); j <= Math.min(e.length - 1, i + 4); j++) { const w = 5 - Math.abs(i - j); s += e[j] * w; n += w; } out[i] = s / n; } return out; }
/** Cross-correlation c[lag] = Σ a[i]·b[i + lag] for every lag, by FFT. */
function xcorr(a, b) {
  const size = pow2(a.length + b.length), ar = new Float64Array(size), ai = new Float64Array(size), br = new Float64Array(size), bi = new Float64Array(size);
  ar.set(a); br.set(b); fft(ar, ai); fft(br, bi);
  for (let k = 0; k < size; k++) { const r = ar[k] * br[k] + ai[k] * bi[k], i = ar[k] * bi[k] - ai[k] * br[k]; ar[k] = r; ai[k] = i; }
  fft(ar, ai, true);
  return lag => ar[(lag + size) % size];
}
/** Where the take (rec) may sit in the MR: candidate lags (samples) such that rec sample n ↔ MR sample n + lag.
 * Pieces of the take (≈15 s: start, middle, end) are matched on their own, so a speed difference that builds up over
 * a long take does not blur the match; each piece keeps its few best distinct lags. */
function coarse(rec, mr) {
  const ea = blur(envelope(rec)), b = blur(envelope(mr)), piece = Math.min(ea.length, 1500), picked = [];
  const starts = [...new Set([0, Math.floor((ea.length - piece) / 2), ea.length - piece].map(x => Math.max(0, x)))];
  let topScore = 0;
  for (const p0 of starts) {
    const a = ea.subarray(p0, p0 + piece), c = xcorr(a, b), cands = [];
    for (let lag = -Math.floor(piece * 0.2); lag <= b.length - piece * 0.8; lag++) cands.push([lag, c(lag)]);
    cands.sort((x, y) => y[1] - x[1]);
    const scored = cands.slice(0, 120).map(([lag]) => ({lag, ...corrAt(a, b, lag)})).sort((x, y) => y.r - x.r), mine = [];
    topScore = Math.max(topScore, scored[0]?.r || 0);
    for (const s of scored) { if (s.r < RULES.minScore) break; if (mine.every(m => Math.abs(m.lag - s.lag) > 50)) mine.push(s); if (mine.length >= RULES.candidates / 2) break; }
    for (const m of mine) { const lag = (m.lag - p0) * RULES.envHop; if (picked.every(q => Math.abs(q.lag - lag) > 0.3 * SR)) picked.push({lag, score:m.r}); }
  }
  picked.sort((x, y) => y.score - x.score);
  return {ok:picked.length > 0, reason:picked.length ? '' : 'no-match', score:topScore, candidates:picked.slice(0, RULES.candidates)};
}

/* ---------- 2. fine alignment ---------- */
/** GCC-PHAT lag (samples, sub-sample) between rec[start…] and mr[start + guess…], searched within ±range. */
function gccLag(rec, mr, start, guess, range) {
  const N = RULES.fineWin, size = pow2(2 * N), w = hann(N);
  const xr = new Float64Array(size), xi = new Float64Array(size), yr = new Float64Array(size), yi = new Float64Array(size);
  const g = Math.round(guess);
  for (let i = 0; i < N; i++) { xr[i] = (rec[start + i] || 0) * w[i]; const j = start + g + i; yr[i] = (j >= 0 && j < mr.length ? mr[j] : 0) * w[i]; }
  fft(xr, xi); fft(yr, yi);
  for (let k = 0; k < size; k++) {
    const r = xr[k] * yr[k] + xi[k] * yi[k], i = xr[k] * yi[k] - xi[k] * yr[k], m = Math.hypot(r, i) || 1;
    xr[k] = r / m; xi[k] = i / m;
  }
  fft(xr, xi, true);
  let best = 0, bestV = -Infinity;
  for (let d = -range; d <= range; d++) { const v = xr[(d + size) % size]; if (v > bestV) { bestV = v; best = d; } }
  const at = d => xr[(d + size) % size], l = at(best - 1), c = at(best), r = at(best + 1), den = l - 2 * c + r;
  const frac = den ? 0.5 * (l - r) / den : 0;
  return {lag:g + best + Math.max(-0.5, Math.min(0.5, frac)), peak:bestV};
}
/** Lag at the start of the take and the MR speed relative to the take (mr index ≈ lag + n·ratio). */
function fine(rec, mr, coarseLag) {
  const N = RULES.fineWin, range = Math.round(RULES.fineSearch * SR);
  const from = Math.max(0, -coarseLag), to = Math.min(rec.length, mr.length - coarseLag) - N;
  if (to - from < N) return {lag:coarseLag, ratio:1, points:0};
  const pts = [];
  // Windows from the start of the overlap onwards, so a speed difference is followed as it grows.
  for (let k = 0; k < RULES.fineCount; k++) {
    const start = Math.round(from + (to - from) * (k + 0.5) / RULES.fineCount);
    const est = pts.length >= 2 ? fit(pts).lag + (fit(pts).ratio - 1) * start : pts.length ? pts[0][1] : coarseLag;
    const g = gccLag(rec, mr, start, est, range);
    if (g.peak > 0.05) pts.push([start, g.lag]);
  }
  if (!pts.length) return {lag:coarseLag, ratio:1, points:0};
  // Drop windows off the line by > 10 ms (a window of silence or of solo voice); the line itself may slope (speed).
  let line = fit(pts), good = pts;
  for (let pass = 0; pass < 2 && good.length > 2; pass++) {
    const kept = good.filter(([x, y]) => Math.abs(line.lag + (line.ratio - 1) * x - y) < 0.01 * SR);
    if (kept.length < 2 || kept.length === good.length) break;
    good = kept; line = fit(good);
  }
  return {...line, points:good.length};
}
function fit(pts) {
  if (pts.length < 2) return {lag:pts[0][1], ratio:1};
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return {lag:my - b * mx, ratio:1 + b};
}

/* ---------- 3. subtraction ---------- */
/** The MR as heard at each sample of the take (linear interpolation; silence outside the file). */
function alignedMr(mr, length, lag, ratio) {
  const out = new Float32Array(length);
  for (let n = 0; n < length; n++) { const p = lag + n * ratio, i = Math.floor(p), f = p - i; if (i >= 0 && i + 1 < mr.length) out[n] = mr[i] * (1 - f) + mr[i + 1] * f; }
  return out;
}
function stft(x, frames) {
  const N = RULES.win, hop = RULES.hop, w = hann(N), half = N / 2 + 1;
  const re = Array.from({length:frames}, () => new Float64Array(half)), im = Array.from({length:frames}, () => new Float64Array(half));
  const br = new Float64Array(N), bi = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { const j = f * hop + i; br[i] = (j < x.length ? x[j] : 0) * w[i]; bi[i] = 0; }
    fft(br, bi);
    re[f].set(br.subarray(0, half)); im[f].set(bi.subarray(0, half));
  }
  return {re, im};
}
/** Subtract the lined-up MR. Returns the voice estimate and how much MR was removed. */
function subtract(rec, mrAligned) {
  const N = RULES.win, hop = RULES.hop, half = N / 2 + 1, frames = Math.ceil(Math.max(0, rec.length - N) / hop) + 1;
  const X = stft(rec, frames), R = stft(mrAligned, frames), B = RULES.block;
  const out = new Float64Array((frames - 1) * hop + N), w = hann(N), br = new Float64Array(N), bi = new Float64Array(N);
  let before = 0, after = 0, mrPow = 0;
  const blocks = Math.ceil(frames / B), Hr = [], Hi = [];
  // Complex gain per block and bin, least squares: H = Σ X·conj(R) / Σ |R|², smoothed over neighbouring blocks.
  const sxr = [], sxi = [], srr = [];
  for (let b = 0; b < blocks; b++) {
    const a = new Float64Array(half), c = new Float64Array(half), d = new Float64Array(half);
    for (let f = b * B; f < Math.min(frames, (b + 1) * B); f++) for (let k = 0; k < half; k++) {
      const xr = X.re[f][k], xi = X.im[f][k], rr = R.re[f][k], ri = R.im[f][k];
      a[k] += xr * rr + xi * ri; c[k] += xi * rr - xr * ri; d[k] += rr * rr + ri * ri;
    }
    sxr.push(a); sxi.push(c); srr.push(d);
  }
  for (let b = 0; b < blocks; b++) {
    const hr = new Float64Array(half), hi = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      let a = 0, c = 0, d = 0;
      for (let j = Math.max(0, b - 1); j <= Math.min(blocks - 1, b + 1); j++) { const wgt = j === b ? 2 : 1; a += wgt * sxr[j][k]; c += wgt * sxi[j][k]; d += wgt * srr[j][k]; }
      if (d > 1e-9) { hr[k] = a / d; hi[k] = c / d; }
    }
    Hr.push(hr); Hi.push(hi);
  }
  for (let f = 0; f < frames; f++) {
    const hr = Hr[Math.floor(f / B)], hi = Hi[Math.floor(f / B)];
    for (let k = 0; k < half; k++) {
      const xr = X.re[f][k], xi = X.im[f][k], rr = R.re[f][k], ri = R.im[f][k];
      const mr = hr[k] * rr - hi[k] * ri, mi = hr[k] * ri + hi[k] * rr; // H·R: the MR as the microphone heard it
      let er = xr - mr, ei = xi - mi;
      const pe = er * er + ei * ei, pm = mr * mr + mi * mi;
      const g = pe > 0 ? Math.max(RULES.floor, Math.sqrt(Math.max(0, 1 - RULES.residual * pm / pe))) : 0;
      er *= g; ei *= g;
      before += xr * xr + xi * xi; after += er * er + ei * ei; mrPow += pm;
      br[k] = er; bi[k] = ei; if (k && k < half - 1) { br[N - k] = er; bi[N - k] = -ei; }
    }
    fft(br, bi, true);
    for (let i = 0; i < N; i++) out[f * hop + i] += br[i] * w[i];
  }
  const norm = 1.5 * (RULES.hop * 4 / N); // Σ hann² over a 75 % overlap
  const voice = new Float32Array(rec.length);
  for (let i = 0; i < rec.length; i++) voice[i] = out[i] / norm;
  return {voice, removedDb:after > 0 ? Math.round(10 * Math.log10(before / after) * 10) / 10 : null, mrShareDb:mrPow > 0 && after > 0 ? Math.round(10 * Math.log10(mrPow / after) * 10) / 10 : null};
}

/** Whole pipeline. rec and mr are 8 kHz mono Float32Arrays. {ok:false, reason} when the MR is not in the take. */
function cancel(rec, mr) {
  if (rec.length < SR * 3 || mr.length < SR * 3) return {ok:false, reason:'short'};
  const c = coarse(rec, mr);
  if (!c.ok) return {ok:false, reason:c.reason, score:round(c.score, 3)};
  // Try each candidate on the same excerpt of the take; the true position removes the most level.
  const tries = [];
  for (const cand of c.candidates) {
    const f = fine(rec, mr, cand.lag);
    if (!f.points || Math.abs(f.ratio - 1) > 0.02) continue;
    const from = Math.max(0, Math.ceil(-f.lag / f.ratio)), to = Math.min(rec.length, Math.floor((mr.length - f.lag) / f.ratio));
    const len = Math.min(to - from, RULES.trySeconds * SR), start = from + Math.max(0, Math.floor((to - from - len) / 2));
    if (len < SR * 2) continue;
    const part = rec.subarray(start, start + len), heard = alignedMr(mr, len, f.lag + start * f.ratio, f.ratio);
    tries.push({...f, score:cand.score, removed:subtract(part, heard).removedDb || 0});
  }
  tries.sort((x, y) => y.removed - x.removed);
  const best = tries[0];
  if (!best || best.removed < RULES.minRemoved) return {ok:false, reason:'no-match', score:round(c.score, 3), removedDb:best ? round(best.removed, 1) : null};
  const s = subtract(rec, alignedMr(mr, rec.length, best.lag, best.ratio));
  return {ok:true, voice:s.voice, report:{offsetSeconds:round(best.lag / SR, 3), speed:round(best.ratio, 5), score:round(best.score, 3), windows:best.points, tried:tries.length, removedDb:s.removedDb}};
}
const round = (x, d = 0) => Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null;

const api = {SR, RULES, cancel, coarse, fine, subtract, alignedMr, envelope, fft};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.VzipMrCancel = api;
})(typeof self !== 'undefined' ? self : globalThis);
