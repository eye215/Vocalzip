/* VOCAL.zip 알고 있는 MR 빼기 (시험판): a recording sung over one of the song's own MR files → the voice alone.
 * The MR the singer heard is known (songs[].mrTracks), so instead of guessing what is voice (AI source separation)
 * the MR itself is lined up with the recording and subtracted:
 *  1. coarse alignment: onset envelopes (log spectral flux, 100 per second) of both, cross-correlated over every lag
 *     (the take may start anywhere in the MR, or before it). If those candidates do not verify, waveform anchors
 *     search the whole MR independently; an onset miss alone is not proof that the reference differs.
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
  minRemoved:3,                    // use one shared response for a quiet, globally verified MR
  verifiedWindows:4, verifiedPeak:0.2, verifiedError:4, // independent waveform matches; samples of fit error at 8 kHz
  anchorWin:16384, anchorSearch:0.5, anchorCount:9,
  anchorPeak:0.1, anchorError:40, anchorWindows:5,
  localStep:4000, localSearch:240, localPeak:0.1, localOutlier:8,
  localCoverage:0.85, transferRadius:16, // ~50 s of neighbouring context; current block is held out
  fineWin:4096, fineSearch:0.05,   // GCC-PHAT windows (0.5 s) and ± search around the coarse lag (s)
  fineCount:7,
  searchFactor:16, searchSeconds:128, searchAnchorSeconds:2, searchAnchors:5,
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
    // Require ten seconds of actual overlap, including the envelope window's edges. The old
    // 80%-of-piece bounds excluded the correct lag when playback started late in a short take.
    const overlap = Math.min(piece, Math.floor((RULES.minOverlap * SR - RULES.envWin) / RULES.envHop) + 1);
    if (b.length < overlap) continue;
    for (let lag = overlap - piece; lag <= b.length - overlap; lag++) cands.push([lag, c(lag)]);
    cands.sort((x, y) => y[1] - x[1]);
    const scored = cands.slice(0, 120).map(([lag]) => ({lag, ...corrAt(a, b, lag)})).sort((x, y) => y.r - x.r), mine = [];
    topScore = Math.max(topScore, scored[0]?.r || 0);
    for (const s of scored) { if (s.r < RULES.minScore) break; if (mine.every(m => Math.abs(m.lag - s.lag) > 50)) mine.push(s); if (mine.length >= RULES.candidates / 2) break; }
    for (const m of mine) { const lag = (m.lag - p0) * RULES.envHop; if (picked.every(q => Math.abs(q.lag - lag) > 0.3 * SR)) picked.push({lag, score:m.r}); }
  }
  picked.sort((x, y) => y.score - x.score);
  return {ok:picked.length > 0, reason:picked.length ? '' : 'no-match', score:topScore, candidates:picked.slice(0, RULES.candidates)};
}

/** Independent start-position proposals, not acceptance evidence. Search the entire MR
 * with short, low-pass 500 Hz waveform anchors. Reuse a bounded FFT workspace even for
 * long files; all proposals still require the original 8 kHz verification below. */
function waveformCandidates(rec, mr, onProgress = () => {}) {
  const factor = RULES.searchFactor, rate = SR / factor, taps = 65, filter = new Float64Array(taps), cutoff = .4 / factor;
  let sum = 0;
  for (let j = 0; j < taps; j++) { const t = j - (taps - 1) / 2; filter[j] = (t ? Math.sin(2*Math.PI*cutoff*t)/(Math.PI*t) : 2*cutoff) * (.5-.5*Math.cos(2*Math.PI*j/(taps-1))); sum += filter[j]; }
  for (let j = 0; j < taps; j++) filter[j] /= sum;
  const low = input => Float32Array.from({length:Math.ceil(input.length/factor)}, (_,i) => {
    let v = 0; for (let j = 0; j < taps; j++) v += (input[i*factor+j-(taps-1)/2] || 0) * filter[j]; return v;
  });
  const a = low(rec), b = low(mr), length = Math.min(a.length,Math.round(RULES.searchAnchorSeconds*rate));
  if (length < rate || b.length < length) return [];
  const block = Math.round(RULES.searchSeconds*rate), step = block-length+1, size = pow2(Math.min(block,b.length)+length), window = hann(length);
  const ar = new Float64Array(size), ai = new Float64Array(size), br = new Float64Array(size), bi = new Float64Array(size), found = [];
  const starts = [...new Set(Array.from({length:RULES.searchAnchors},(_,i)=>Math.round((a.length-length)*i/(RULES.searchAnchors-1))))];
  const blocks = Math.ceil(Math.max(1,b.length-length+1)/step), overlap = Math.min(rec.length,mr.length,RULES.minOverlap*SR);
  for (let base = 0, part = 0; base+length <= b.length; base += step,part++) {
    const count = Math.min(block,b.length-base);br.fill(0);bi.fill(0);br.set(b.subarray(base,base+count));fft(br,bi);
    for (const [index,start] of starts.entries()) {
      ar.fill(0);ai.fill(0);let energy = 0;
      for (let i = 0; i < length; i++) { ar[i] = a[start+i]*window[i]; energy += ar[i]*ar[i]; }
      if (energy > 1e-10) {
        fft(ar,ai);
        for (let k = 0; k < size; k++) { const re=ar[k]*br[k]+ai[k]*bi[k],im=ar[k]*bi[k]-ai[k]*br[k],mag=Math.hypot(re,im)||1;ar[k]=re/mag;ai[k]=im/mag; }
        fft(ar,ai,true);
        const peaks = [];
        for (let pick = 0; pick < 2; pick++) {
          let best = -1, peak = 0;
          for (let j = 0; j <= count-length; j++) if (ar[j]>peak && peaks.every(p=>Math.abs(p-j)>.5*rate)) { best=j;peak=ar[j]; }
          if (best < 0 || peak < 1e-5) break;
          peaks.push(best);const lag=(base+best-start)*factor;
          if (Math.min(rec.length,mr.length-lag)-Math.max(0,-lag)<overlap) continue;
          const near = found.find(p=>Math.abs(p.lag-lag)<.25*SR);
          if (near) { near.votes++;if(peak>near.score){near.lag=lag;near.score=peak;} }
          else found.push({lag,score:peak,votes:1,search:'waveform'});
        }
      }
      onProgress((part+(index+1)/starts.length)/blocks);
    }
  }
  onProgress(1);
  return found.sort((x,y)=>y.votes-x.votes||y.score-x.score).slice(0,RULES.candidates);
}

/* ---------- 2. fine alignment ---------- */
/** GCC-PHAT lag (samples, sub-sample) between rec[start…] and mr[start + guess…], searched within ±range. */
function lagReader(N) {
  const size = pow2(2 * N), w = hann(N);
  const xr = new Float64Array(size), xi = new Float64Array(size), yr = new Float64Array(size), yi = new Float64Array(size);
  return (rec, mr, start, guess, range) => {
  xr.fill(0); xi.fill(0); yr.fill(0); yi.fill(0);
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
  };
}
const gccLag = (rec, mr, start, guess, range) => lagReader(RULES.fineWin)(rec, mr, start, guess, range);
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
    if (g.peak > 0.05) pts.push([start, g.lag, g.peak]);
  }
  if (!pts.length) return {lag:coarseLag, ratio:1, points:0};
  // Drop windows off the line by > 10 ms (a window of silence or of solo voice); the line itself may slope (speed).
  let line = fit(pts), good = pts;
  for (let pass = 0; pass < 2 && good.length > 2; pass++) {
    const kept = good.filter(([x, y]) => Math.abs(line.lag + (line.ratio - 1) * x - y) < 0.01 * SR);
    if (kept.length < 2 || kept.length === good.length) break;
    good = kept; line = fit(good);
  }
  return {...line, points:good.length,
    phasePeak:good.reduce((s, p) => s + p[2], 0) / good.length,
    errorSamples:Math.sqrt(good.reduce((s, [x,y]) => s + (line.lag + (line.ratio - 1) * x - y) ** 2, 0) / good.length)};
}
function fit(pts) {
  if (pts.length < 2) return {lag:pts[0][1], ratio:1};
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return {lag:my - b * mx, ratio:1 + b};
}

/* A long-window fallback retrieves a waveform match when the onset peak is displaced, then
 * follows local clock/codec drift. It must establish evidence across the take before subtraction.
 * A relaxed global line alone is insufficient: the reference is warped, uncertain stretches
 * are left as recorded, and the transfer is estimated without the block being subtracted. */
function robustLine(points) {
  let best = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const line = fit([points[i], points[j]]);
    if (Math.abs(line.ratio - 1) > 0.02) continue;
    const kept = points.filter(([x,y]) => Math.abs(y - line.lag - (line.ratio - 1) * x) < 80);
    if (kept.length > best.length) best = kept;
  }
  if (best.length < RULES.anchorWindows) return null;
  const line = fit(best);
  return {...line, points:best.length, phasePeak:best.reduce((s,p) => s + p[2], 0) / best.length,
    errorSamples:Math.sqrt(best.reduce((s,[x,y]) => s + (y - line.lag - (line.ratio - 1) * x) ** 2, 0) / best.length),
    span:best.at(-1)[0] - best[0][0]};
}
function findAnchors(rec, mr, candidates, onProgress) {
  const N = RULES.anchorWin, read = lagReader(N), found = [];
  for (const [index,candidate] of candidates.entries()) {
    const lag = candidate.lag, from = Math.max(0, -lag), to = Math.min(rec.length, mr.length - lag) - N;
    if (to - from < N) continue;
    const points = [];
    for (let k = 0; k < RULES.anchorCount; k++) {
      const start = Math.round(from + (to - from) * (k + 0.5) / RULES.anchorCount);
      const g = read(rec, mr, start, lag, Math.round(RULES.anchorSearch * SR));
      if (g.peak >= 0.07) points.push([start + N / 2, g.lag, g.peak]);
    }
    const line = robustLine(points);
    // Whole-file search has no independent onset agreement. Require strong correspondence
    // in nearly every anchor; a different arrangement can share several exact chord passages.
    const required = candidate.search ? Math.ceil(RULES.anchorCount*.85) : RULES.anchorWindows;
    const peak = candidate.search ? RULES.verifiedPeak : RULES.anchorPeak;
    if (line && line.points >= required && line.phasePeak >= peak && line.errorSamples <= RULES.anchorError && line.span >= (to - from) * 0.4)
      found.push({...line, score:candidate.score, ...(candidate.search ? {search:candidate.search} : {})});
    onProgress((index + 1) / candidates.length);
  }
  return found.sort((a,b) => b.phasePeak - a.phasePeak);
}
const median = values => values.sort((a,b) => a - b)[Math.floor(values.length / 2)];
/** Confidence-weighted local quadratic fit. Downweight ambiguous peaks; a straight blur
 * biases a changing delay enough to leave audible high-frequency MR in the result. */
function smoothTrack(points) {
  return points.map((point,index) => {
    const near = points.slice(Math.max(0,index - 3),index + 4).filter(p => Math.abs(p[0] - point[0]) <= 2 * SR);
    const a = Array.from({length:3}, () => [0,0,0,0]);
    for (const [x,y,peak] of near) {
      const t = (x - point[0]) / SR, weight = peak ** 4, powers = [1,t,t*t,t*t*t,t*t*t*t];
      for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) a[i][j] += weight * powers[i+j]; a[i][3] += weight * (y - point[1]) * powers[i]; }
    }
    for (let col = 0; col < 3; col++) {
      let pivot = col;
      for (let row = col + 1; row < 3; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      [a[col],a[pivot]] = [a[pivot],a[col]];
      const d = a[col][col]; if (Math.abs(d) < 1e-10) return [...point,0];
      for (let j = col; j < 4; j++) a[col][j] /= d;
      for (let i = 0; i < 3; i++) { if (i === col) continue; const f = a[i][col]; for (let j = col; j < 4; j++) a[i][j] -= f * a[col][j]; }
    }
    return [point[0],point[1] + a[0][3],point[2],a[1][3] / SR];
  });
}
function localTrack(rec, mr, line, onProgress = () => {}) {
  const N = RULES.fineWin, read = lagReader(N), points = [];
  const from = Math.max(0, Math.ceil(-line.lag / line.ratio)), to = Math.min(rec.length, Math.floor((mr.length - line.lag) / line.ratio)) - N;
  for (let start = from; start <= to; start += RULES.localStep) {
    const g = read(rec, mr, start, line.lag + (line.ratio - 1) * (start + N / 2), RULES.localSearch);
    points.push([start + N / 2,g.lag,g.peak]);
    onProgress((start - from + RULES.localStep) / Math.max(RULES.localStep,to - from + RULES.localStep));
  }
  const selected = points.filter(([x,y,peak],i) => {
    const radius = Math.min(3,i,points.length - 1 - i);
    return peak >= RULES.localPeak && Math.abs(y - median(points.slice(i - radius,i + radius + 1).map(p => p[1]))) <= RULES.localOutlier;
  });
  if (selected.length < RULES.anchorWindows) return null;
  // A low-confidence gap must not be bridged with an arbitrary delay. Large jumps also split
  // the trusted stretches; no reference is subtracted in their unsupported middle.
  const good = smoothTrack(selected), heard = new Float32Array(rec.length);
  let index = 0, covered = 0;
  function at(n) {
    while (index + 1 < good.length && good[index + 1][0] < n) index++;
    const a = good[index], b = good[Math.min(index + 1,good.length - 1)], h = b[0] - a[0];
    const u = h ? Math.max(0,Math.min(1,(n - a[0]) / h)) : 0;
    const distance = Math.min(Math.abs(n - a[0]),Math.abs(n - b[0]));
    const supported = h <= 4 * SR && Math.abs(b[1] - a[1]) <= Math.max(8,h * 0.005) && n >= a[0] && n <= b[0];
    const jump = h > 0 && Math.abs(b[1] - a[1]) > Math.max(8,h * 0.005) && n > a[0] && n < b[0];
    const weight = jump ? 0 : supported ? 1 : Math.max(0,Math.min(1,(1.5 * SR - distance) / (0.5 * SR)));
    const nearest = Math.abs(n - a[0]) <= Math.abs(n - b[0]) ? a : b;
    const lag = supported ? (2*u*u*u - 3*u*u + 1)*a[1] + (u*u*u - 2*u*u + u)*h*a[3] + (-2*u*u*u + 3*u*u)*b[1] + (u*u*u - u*u)*h*b[3]
      : nearest[1] + (n - nearest[0]) * Math.max(-0.005,Math.min(0.005,nearest[3]));
    return {lag,weight};
  }
  for (let n = 0; n < rec.length; n++) {
    const {lag,weight} = at(n), p = n + lag, i = Math.floor(p), f = p - i;
    if (weight > 0 && i >= 0 && i + 1 < mr.length) { heard[n] = (mr[i]*(1-f) + mr[i+1]*f) * weight; covered++; }
  }
  const coverage = covered / rec.length;
  if (coverage < RULES.localCoverage) return null;
  return {heard, coverage, points:good.length, blend(voice) {
    index = 0;
    for (let n = 0; n < rec.length; n++) { const {weight} = at(n); voice[n] = rec[n] + weight * (voice[n] - rec[n]); }
  }};
}
function cancelLocally(rec, mr, candidates, onProgress) {
  const seen = new Set(), lines = findAnchors(rec,mr,candidates,p => onProgress(0.5 + 0.15*p)).filter(line => {
    // Identical integer search windows produce identical local tracks. Do not reprocess
    // the same match proposed independently by the onset and waveform searches.
    const from = Math.max(0,Math.ceil(-line.lag/line.ratio)), to = Math.min(rec.length,Math.floor((mr.length-line.lag)/line.ratio))-RULES.fineWin;
    let key = from+':'+to;
    for(let start=from;start<=to;start+=RULES.localStep)key+=','+Math.round(line.lag+(line.ratio-1)*(start+RULES.fineWin/2));
    if(seen.has(key))return false;seen.add(key);return true;
  });
  let before = 0, best = null, bestReduction = -Infinity;
  for (let n = 0; n < rec.length; n++) before += rec[n] ** 2;
  onProgress(0.65);
  for(const [index,line] of lines.entries()){
    const begin=.65+.35*index/lines.length, finish=.65+.35*(index+1)/lines.length;
    const progress = p => onProgress(Math.min(finish,begin+(finish-begin)*p));
    const track = localTrack(rec,mr,line,p => progress(.4*p));
    if(!track){onProgress(finish);continue;}
    const result = subtract(rec,track.heard,p => progress(.4+.6*p),{transferRadius:RULES.transferRadius,excludeCurrent:true,residual:0});
    track.blend(result.voice);
    let after = 0;for(let n=0;n<rec.length;n++)after+=result.voice[n]**2;
    // Compare every independently validated match by held-out whole-take prediction,
    // not its short anchor peak. Keep only the best residual, never all candidate audio.
    const reduction = before > 0 && after > 0 ? 10*Math.log10(before/after) : 0;
    if(reduction>=.05 && reduction>bestReduction){bestReduction=reduction;
      best={ok:true,voice:result.voice,report:{offsetSeconds:round(line.lag/SR,3),speed:round(line.ratio,5),score:round(line.score,3),
    windows:line.points,tried:candidates.length,removedDb:round(reduction,1),alignmentVerified:true,
    method:'local',localWindows:track.points,coverage:round(track.coverage,3),phasePeak:round(line.phasePeak,3),...(line.search ? {search:line.search} : {})}};
    }
    onProgress(finish);
  }
  return best;
}

/* ---------- 3. subtraction ---------- */
/** The MR as heard at each sample of the take (linear interpolation; silence outside the file). */
function alignedMr(mr, length, lag, ratio) {
  const out = new Float32Array(length);
  for (let n = 0; n < length; n++) { const p = lag + n * ratio, i = Math.floor(p), f = p - i; if (i >= 0 && i + 1 < mr.length) out[n] = mr[i] * (1 - f) + mr[i + 1] * f; }
  return out;
}
function stft(x, frames, start = 0, reuse) {
  const N = RULES.win, hop = RULES.hop, w = hann(N), half = N / 2 + 1;
  const re = reuse?.re || Array.from({length:RULES.block}, () => new Float64Array(half)), im = reuse?.im || Array.from({length:RULES.block}, () => new Float64Array(half));
  const br = new Float64Array(N), bi = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { const j = (start + f) * hop + i; br[i] = (j < x.length ? x[j] : 0) * w[i]; bi[i] = 0; }
    fft(br, bi);
    re[f].set(br.subarray(0, half)); im[f].set(bi.subarray(0, half));
  }
  return {re, im};
}
/** Subtract the lined-up MR. Returns the voice estimate and how much MR was removed. */
function subtract(rec, mrAligned, onProgress = () => {}, {sharedTransfer = false, transferRadius = 0, excludeCurrent = false, residual = RULES.residual} = {}) {
  const N = RULES.win, hop = RULES.hop, half = N / 2 + 1, frames = Math.ceil(Math.max(0, rec.length - N) / hop) + 1;
  const B = RULES.block;
  const out = new Float64Array(N), voice = new Float32Array(rec.length), mask = N - 1;
  const norm = 1.5 * (RULES.hop * 4 / N); // Σ hann² over a 75 % overlap
  const w = hann(N), br = new Float64Array(N), bi = new Float64Array(N);
  let before = 0, after = 0, mrPow = 0;
  const blocks = Math.ceil(frames / B), pending = new Map();
  let spare = null;
  // Complex gain per block and bin, least squares: H = Σ X·conj(R) / Σ |R|², smoothed over neighbouring blocks.
  // Keep only the current and next block's spectra. Whole-take STFTs used hundreds of MB on long phone takes.
  function block(b) {
    if (pending.has(b)) return pending.get(b);
    const count = Math.min(B, frames - b * B), X = stft(rec, count, b * B, spare?.X), R = stft(mrAligned, count, b * B, spare?.R);
    spare = null;
    const a = new Float64Array(half), c = new Float64Array(half), d = new Float64Array(half);
    for (let f = 0; f < count; f++) for (let k = 0; k < half; k++) {
      const xr = X.re[f][k], xi = X.im[f][k], rr = R.re[f][k], ri = R.im[f][k];
      a[k] += xr * rr + xi * ri; c[k] += xi * rr - xr * ri; d[k] += rr * rr + ri * ri;
    }
    const value = {X, R, a, c, d, count}; pending.set(b, value); return value;
  }
  // With a quieter MR, fitting a different gain in each short block can fit away the singer.
  // Estimate one room response over the take instead. Reuse the same bounded spectra; neither
  // this extra pass nor the subtraction allocates a whole-take spectrogram.
  let shared = null;
  if (sharedTransfer && !transferRadius) {
    shared = {a:new Float64Array(half), c:new Float64Array(half), d:new Float64Array(half)};
    for (let b = 0; b < blocks; b++) {
      const s = block(b);
      for (let k = 0; k < half; k++) { shared.a[k] += s.a[k]; shared.c[k] += s.c[k]; shared.d[k] += s.d[k]; }
      spare = {X:s.X, R:s.R}; pending.delete(b);
      onProgress(0.25 * (b + 1) / blocks);
    }
  }
  const statistics = [];
  if (transferRadius) {
    for (let b = 0; b < blocks; b++) {
      const s = block(b); statistics.push({a:s.a,c:s.c,d:s.d});
      spare = {X:s.X,R:s.R}; pending.delete(b);
      onProgress(0.25 * (b + 1) / blocks);
    }
  }
  for (let b = 0; b < blocks; b++) {
    const current = block(b), {X, R, count} = current;
    if (b + 1 < blocks) block(b + 1);
    const hr = new Float64Array(half), hi = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      let a = 0, c = 0, d = 0;
      for (let j = Math.max(0, b - 1); j <= Math.min(blocks - 1, b + 1); j++) { const wgt = j === b ? 2 : 1, s = pending.get(j); a += wgt * s.a[k]; c += wgt * s.c[k]; d += wgt * s.d[k]; }
      if (shared) { a = shared.a[k]; c = shared.c[k]; d = shared.d[k]; }
      if (transferRadius) {
        a = c = d = 0;
        for (let j = Math.max(0,b - transferRadius); j <= Math.min(blocks - 1,b + transferRadius); j++) {
          if (excludeCurrent && j === b) continue;
          const s = statistics[j]; a += s.a[k]; c += s.c[k]; d += s.d[k];
        }
      }
      if (d > 1e-9) { hr[k] = a / d; hi[k] = c / d; }
    }
    for (let f = 0; f < count; f++) {
      for (let k = 0; k < half; k++) {
        const xr = X.re[f][k], xi = X.im[f][k], rr = R.re[f][k], ri = R.im[f][k];
        const mr = hr[k] * rr - hi[k] * ri, mi = hr[k] * ri + hi[k] * rr; // H·R: the MR as the microphone heard it
        let er = xr - mr, ei = xi - mi;
        const pe = er * er + ei * ei, pm = mr * mr + mi * mi;
        const g = pe > 0 ? Math.max(RULES.floor, Math.sqrt(Math.max(0, 1 - residual * pm / pe))) : 0;
        er *= g; ei *= g;
        before += xr * xr + xi * xi; after += er * er + ei * ei; mrPow += pm;
        br[k] = er; bi[k] = ei; if (k && k < half - 1) { br[N - k] = er; bi[N - k] = -ei; }
      }
      fft(br, bi, true);
      const start = (b * B + f) * hop;
      for (let i = 0; i < N; i++) out[(start + i) & mask] += br[i] * w[i];
      // Future windows start at start + hop. These samples are complete; recycle the overlap-add ring.
      for (let i = start; i < Math.min(rec.length, start + hop); i++) { voice[i] = out[i & mask] / norm; out[i & mask] = 0; }
    }
    spare = {X, R};
    current.X = current.R = null; // retain neighbouring statistics, recycle spectra for the next block
    pending.delete(b - 1);
    const extraPass = shared || transferRadius;
    onProgress((extraPass ? 0.25 : 0) + (extraPass ? 0.75 : 1) * (b + 1) / blocks);
  }
  for (let i = frames * hop; i < rec.length; i++) voice[i] = out[i & mask] / norm;
  return {voice, removedDb:after > 0 ? Math.round(10 * Math.log10(before / after) * 10) / 10 : null, mrShareDb:mrPow > 0 && after > 0 ? Math.round(10 * Math.log10(mrPow / after) * 10) / 10 : null};
}

/** Whole pipeline. rec and mr are 8 kHz mono Float32Arrays. {ok:false, reason} when the MR is not in the take. */
function cancel(rec, mr, {onProgress = () => {}} = {}) {
  onProgress(0);
  if (rec.length < SR * 3 || mr.length < SR * 3) return {ok:false, reason:'short'};
  const c = coarse(rec, mr);
  onProgress(0.05);
  const alignment = (stage, f) => ({stage, score:round(f?.score ?? c.score, 3),
    offsetSeconds:f ? round(f.lag / SR, 3) : null, speed:f ? round(f.ratio, 5) : null,
    windows:f?.points || 0, phasePeak:round(f?.phasePeak, 3), errorSamples:round(f?.errorSamples, 3)});
  // Try each candidate on the same excerpt of the take; the true position removes the most level.
  const tries = [];
  const examine = (candidates,begin,finish) => {for (const [index, cand] of candidates.entries()) {
    onProgress(begin + (finish-begin) * index / candidates.length);
    const f = fine(rec, mr, cand.lag);
    if (!f.points || Math.abs(f.ratio - 1) > 0.02) continue;
    const from = Math.max(0, Math.ceil(-f.lag / f.ratio)), to = Math.min(rec.length, Math.floor((mr.length - f.lag) / f.ratio));
    const len = Math.min(to - from, RULES.trySeconds * SR), start = from + Math.max(0, Math.floor((to - from - len) / 2));
    if (len < SR * 2) continue;
    const part = rec.subarray(start, start + len), heard = alignedMr(mr, len, f.lag + start * f.ratio, f.ratio);
    const required = cand.search ? Math.ceil(RULES.fineCount*.85) : RULES.verifiedWindows;
    const verified = f.points >= required && f.phasePeak >= RULES.verifiedPeak && f.errorSamples <= RULES.verifiedError;
    tries.push({...f, verified, score:cand.score, removed:subtract(part, heard).removedDb || 0,...(cand.search ? {search:cand.search} : {})});
  }};
  examine(c.candidates,0.05,0.35);
  let extra = [];
  if (!tries.some(t=>t.verified)) {
    extra=waveformCandidates(rec,mr,p=>onProgress(0.35+.1*p));
    examine(extra,0.45,0.5);
  }
  // Prefer consistent waveform alignment to a loudness drop: a wrong repeated phrase can also
  // lose energy in a fitted filter. A quieter but verified MR is not a different source file.
  tries.sort((x, y) => Number(y.verified) - Number(x.verified) || (x.verified ? y.phasePeak - x.phasePeak : y.removed - x.removed));
  const best = tries[0];
  if (!best || !best.verified) {
    const local = cancelLocally(rec,mr,[...c.candidates,...extra],onProgress);
    if (local) return local;
    return {ok:false, reason:'no-match', score:round(c.score, 3), removedDb:best ? round(best.removed, 1) : null, alignment:alignment(best ? 'validation' : c.ok ? 'fine' : 'coarse', best)};
  }
  const s = subtract(rec, alignedMr(mr, rec.length, best.lag, best.ratio), p => onProgress(0.5 + p * 0.5), {sharedTransfer:best.removed < RULES.minRemoved});
  return {ok:true, voice:s.voice, report:{offsetSeconds:round(best.lag / SR, 3), speed:round(best.ratio, 5), score:round(best.score, 3), windows:best.points, tried:tries.length, removedDb:s.removedDb, alignmentVerified:best.verified,...(best.search ? {search:best.search} : {})}};
}
const round = (x, d = 0) => Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null;

const api = {SR, RULES, cancel, coarse, fine, subtract, alignedMr, envelope, fft, localTrack, waveformCandidates};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.VzipMrCancel = api;
})(typeof self !== 'undefined' ? self : globalThis);
