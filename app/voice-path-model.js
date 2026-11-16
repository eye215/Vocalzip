/* VOCAL.zip 소리 길 흔적 (시험판) — model. Pure: no DOM, no storage, no network; runs in Node, a page or a worker.
 *
 * What this is: audible TRACES of vocal production measured from one recording, so two takes of a song can be put
 * side by side. It never says whether the "길" was found — that is the teacher's ear. It only points at places and
 * numbers worth listening to again.
 *
 *   전환   breaks inside a phrase (short voicing dropouts between voiced sound of similar pitch) and flips (a short
 *          jump of several semitones that comes back, or an octave jump and return), each with its time.
 *   이어짐 on sustained notes: pitch SD, slow drift, loudness SD; vibrato rate / extent / regularity when present.
 *   울림   spectral centroid, energy of 2–4 kHz against 0.1–2 kHz, spectral tilt — per pitch zone, and how much they
 *          change between zones.
 *   숨소리 harmonics-to-noise ratio from the autocorrelation at the pitch period, per zone.
 *   시작   share of hard onsets (very fast attack with a pitch overshoot) among measured phrase onsets.
 *   Coverage: seconds of voiced sound per zone; a thin zone is "표본 부족" and is never compared.
 *
 * Input: mono PCM (Float32Array) + sample rate, and optionally a pitch guide {curve:[cents|null…], fps} from the
 * app's own analysis (cents = MIDI × 100). With a guide, sound is only read where the guide heard the voice and the
 * pitch candidate near the guide is preferred (so an accompaniment is not followed). Without one the pitch is found
 * here by autocorrelation (Boersma's window-normalised method) on every frame that is loud and periodic enough.
 *
 * EVERY threshold below is a first guess to be calibrated against takes the singer calls better or worse. Nothing
 * here has been checked against what a teacher hears. */
((root) => {
'use strict';
const VERSION = 'vp-0.1';

/* ---------- thresholds (first guesses; all exported with the diagnosis file) ---------- */
const T = Object.freeze({
  SR:16000,                    // Hz the model works at; other rates are resampled
  HOP:160,                     // samples between frames = 10 ms: a 40 ms dropout is 4 frames
  WIN:640,                     // samples per frame = 40 ms: ≥ 3 periods down to 75 Hz, short enough to see a 60 ms flip
  FFT:1024,                    // zero-padded size: autocorrelation is free of wrap-around up to lag 384
  F0_MIN_HZ:70,                // lowest pitch looked for (about C#2)
  F0_MAX_HZ:1050,              // highest pitch looked for (about C6)
  VOICED_MIN_STRENGTH:0.5,     // normalised autocorrelation at the period; below this a frame is not voiced
  LEVEL_GATE_DB:35,            // a frame quieter than (95th percentile level − this) is silence
  OCTAVE_COST:0.02,            // per octave of lag: prefers the higher pitch among equally periodic candidates
  GUIDE_PULL_SEMITONES:3.5,    // a candidate this close to the guide pitch counts as "the voice"
  GUIDE_KEEP_RATIO:0.85,       // …and is kept when at least this strong relative to the strongest candidate
  GUIDE_FRACTION_SLACK:0.04,   // "a whole fraction of the guide's period": within 4% of ½, ⅓, ¼ …
  GUIDE_FRACTION_MARGIN:0.05,  // …and at most this much less periodic than the guide's own period
  MIN_VOICED_RUN_MS:40,        // shorter voiced islands are dropped (clicks, consonant bursts)
  GLITCH_SEMITONES:3,          // a single frame this far from both equal neighbours is a tracker glitch, smoothed out
  // 전환 · 끊김
  BREAK_MIN_MS:40,             // shortest dropout counted as a break
  BREAK_MAX_MS:150,            // longest; longer is a breath or a rest
  BREAK_PITCH_SEMITONES:2,     // pitch before and after must be this close ("inside a phrase")
  BREAK_SIDE_MS:80,            // voiced sound needed on each side
  BREAK_NOISY_ZCR:0.25,        // zero crossings per sample in the gap above this = noise-like (probably a consonant)
  // 전환 · 뒤집힘
  FLIP_MIN_SEMITONES:5,        // jump size
  FLIP_MIN_MS:20,              // shorter than this is a single-frame glitch
  FLIP_MAX_MS:120,             // a jump that lasts longer is melody, unless it is an octave (below)
  FLIP_RETURN_SEMITONES:2,     // "comes back" = within this of the pitch before the jump
  OCTAVE_FLIP_LOW:10.5,        // an octave jump is 10.5–13.5 semitones …
  OCTAVE_FLIP_HIGH:13.5,
  OCTAVE_FLIP_MAX_MS:500,      // … that returns within this time
  // 이어짐
  SUSTAIN_MIN_S:0.6,           // a sustained note lasts at least this long
  SUSTAIN_BAND_CENTS:60,       // …with its smoothed pitch inside ± this
  SUSTAIN_SMOOTH_MS:210,       // moving average that takes the vibrato out before the band test
  SUSTAIN_TRIM_MS:50,          // cut from each end before measuring (onset scoop, release)
  VIBRATO_MIN_HZ:4, VIBRATO_MAX_HZ:8,      // modulation rates counted as vibrato
  VIBRATO_SCAN_HZ:[3, 9],      // the strongest modulation in this wider band must fall inside 4–8 Hz
  VIBRATO_MIN_EXTENT_CENTS:15, // half of peak-to-peak
  VIBRATO_MIN_REGULARITY:0.4,  // share of the note's pitch variance at the vibrato rate
  // 울림
  BAND_LOW_HZ:[100, 2000], BAND_HIGH_HZ:[2000, 4000],   // energy ratio high/low in dB
  CENTROID_HZ:[80, 8000],      // magnitude-weighted mean frequency inside this band
  TILT_BANDS_HZ:[125, 250, 500, 1000, 2000, 4000, 8000], // octave bands; slope of their level in dB per octave
  // 시작
  ONSET_SILENCE_MS:200,        // unvoiced time before a phrase onset
  ONSET_MIN_RUN_MS:300,        // voiced time after it, needed to know where the note settled
  ONSET_SETTLE_MS:[100, 250],  // where the settled level and pitch are read
  ONSET_RISE_DB:[20, 3],       // attack time = from 20 dB below the settled level to 3 dB below
  ONSET_LOOKBACK_MS:250,       // how far before the onset the rise is searched
  HARD_ATTACK_MS:30,           // "very fast attack"
  HARD_OVERSHOOT_CENTS:40,     // …with the pitch this far above where it settles, in the first 80 ms
  ONSET_OVERSHOOT_MS:80,
  // zones and coverage
  ZONE_PERCENTILES:[2, 98],    // the take's own range, cut into equal thirds in semitones
  ZONE_MIN_SPAN_SEMITONES:3,   // a narrower take is one zone (가운데)
  MIN_ZONE_SECONDS:3,          // less voiced sound than this in a zone = 표본 부족, never compared
  MIN_BAND_SECONDS:0.5,        // same idea for one semitone band in the diagnosis file
  // comparing two takes
  MIN_VOICED_SECONDS:10,       // a take with less singing than this is not compared
  MIN_SUSTAIN_NOTES:3,         // sustained notes needed on each side
  MIN_ONSETS:5,                // measured onsets needed on each side
  SIMILAR_RELATIVE:0.2,        // within 20% of the larger value = 비슷함 …
  SIMILAR:{                    // … or within these absolute amounts, whichever is wider
    breaksPerMin:1, flipsPerMin:0.5, pitchSdCents:3, driftCentsPerS:5, loudSdDb:0.5, vibratoShare:15,
    zoneSpreadDb:2, ratioDb:2, hnrDb:2, hardShare:15
  }
});
// Plain constants for the hot loops (a property of the frozen table is a slow lookup inside them).
const SR = T.SR, HOP = T.HOP, WIN = T.WIN, NFFT = T.FFT;
const FPS = SR / HOP, MS = 1000 / FPS;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = midi => { const m = Math.round(midi); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
const round = (v, d = 1) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const sd = a => { if (a.length < 2) return a.length ? 0 : null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const quantile = (a, q) => { if (!a.length) return null; const s = Array.from(a).sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); };
const median = a => quantile(a, 0.5);

/* ---------- signal helpers ---------- */
/** Mono samples at another rate: box average when going down (a crude low-pass), then linear interpolation. */
function resample(x, from, to) {
  if (from === to) return x;
  const ratio = from / to, n = Math.floor(x.length / ratio), out = new Float32Array(n), w = Math.max(1, Math.round(ratio));
  for (let i = 0; i < n; i++) {
    const p = i * ratio, a = Math.floor(p);
    if (w > 1) { let s = 0, c = 0; for (let j = a; j < a + w && j < x.length; j++) { s += x[j]; c++; } out[i] = c ? s / c : 0; }
    else { const b = Math.min(x.length - 1, a + 1); out[i] = x[a] + (x[b] - x[a]) * (p - a); }
  }
  return out;
}
/** In-place radix-2 FFT for one size (tables made once). */
function makeFft(n) {
  const bits = Math.round(Math.log2(n)), rev = new Uint16Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; }
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) for (let j = i, k = 0; j < i + half; j++, k += step) {
        const tr = re[j + half] * cos[k] - im[j + half] * sin[k], ti = re[j + half] * sin[k] + im[j + half] * cos[k];
        re[j + half] = re[j] - tr; im[j + half] = im[j] - ti; re[j] += tr; im[j] += ti;
      }
    }
  };
}
const fft = makeFft(NFFT);
const HANN = (() => { const w = new Float64Array(WIN); for (let i = 0; i < WIN; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / WIN); return w; })();
const LAG_MIN = Math.floor(SR / T.F0_MAX_HZ), LAG_MAX = Math.ceil(SR / T.F0_MIN_HZ);
/** Autocorrelation of the window itself (lag 0 = 1): dividing by it undoes the window's taper (Boersma 1993). */
const WINDOW_ACF = (() => {
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  for (let i = 0; i < WIN; i++) re[i] = HANN[i];
  fft(re, im);
  for (let i = 0; i < NFFT; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fft(re, im);
  const out = new Float64Array(LAG_MAX + 3); for (let i = 0; i < out.length; i++) out[i] = re[i] / re[0];
  return out;
})();
/* The autocorrelation of wide-band sound has peaks about one sample wide, so reading it at whole lags misses their
 * height (and with it the period and the harmonics-to-noise ratio). It is read between samples with a windowed sinc
 * (exact for band-limited data), on a grid of 1/8 sample around each whole-lag peak. */
const SINC_DEPTH = 8, SINC_STEPS = 8;
const SINC = (() => {
  const rows = [];
  for (let j = 0; j < SINC_STEPS; j++) {
    const frac = j / SINC_STEPS, row = new Float64Array(SINC_DEPTH * 2);
    for (let k = 0; k < SINC_DEPTH * 2; k++) {
      const d = frac - (k - SINC_DEPTH + 1);        // distance from tap k (at floor − DEPTH + 1 + k) to the wanted lag
      row[k] = (d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d)) * (0.5 + 0.5 * Math.cos(Math.PI * d / SINC_DEPTH));
    }
    rows.push(row);
  }
  return rows;
})();
const BIN_HZ = SR / NFFT, bin = hz => Math.max(1, Math.min(NFFT / 2, Math.round(hz / BIN_HZ)));
const semitone = hz => 69 + 12 * Math.log2(hz / 440);

/* ---------- one recording ---------- */
/**
 * @param {Float32Array} input mono samples
 * @param {number} sampleRate
 * @param {{guide?:{curve:(number|null)[], fps:number}|null, onProgress?:(p:number)=>void}} [options]
 */
function analyze(input, sampleRate, {guide = null, onProgress = null} = {}) {
  const x = resample(input, sampleRate, SR), n = x.length, frames = Math.floor(n / HOP);
  const seconds = n / SR;
  // Running energy: the level of any stretch in O(1).
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + x[i] * x[i];
  const levelDb = (a, b) => { a = Math.max(0, a); b = Math.min(n, b); if (b <= a) return -120; const e = (cum[b] - cum[a]) / (b - a); return e > 1e-12 ? 10 * Math.log10(e) : -120; };
  const level = new Float32Array(frames), fast = new Float32Array(frames);   // 40 ms and 10 ms levels (dB)
  const heard = [];
  for (let f = 0; f < frames; f++) { const c = f * HOP; level[f] = levelDb(c - WIN / 2, c + WIN / 2); fast[f] = levelDb(c - HOP / 2, c + HOP / 2); if (fast[f] > -100) heard.push(fast[f]); }
  const loud = heard.length ? quantile(heard, 0.95) : -120, floor = loud - T.LEVEL_GATE_DB;   // quieter than floor = silence

  const gFps = guide && Array.isArray(guide.curve) && guide.fps > 0 ? guide.fps : 0, gCurve = gFps ? guide.curve : null;
  const guideAt = f => {   // semitones where the guide heard the voice (one guide step of slack on each side), else null
    if (!gCurve) return undefined;
    const i = Math.floor(f / FPS * gFps), v = gCurve[i] ?? gCurve[i - 1] ?? gCurve[i + 1];
    return v == null ? null : v / 100;
  };

  const st = new Float32Array(frames).fill(NaN), strength = new Float32Array(frames);
  const centroid = new Float32Array(frames), ratio = new Float32Array(frames), tilt = new Float32Array(frames).fill(NaN);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), power = new Float64Array(NFFT / 2 + 1);
  const cLo = bin(T.CENTROID_HZ[0]), cHi = bin(T.CENTROID_HZ[1]), lowA = bin(T.BAND_LOW_HZ[0]), lowB = bin(T.BAND_LOW_HZ[1]), highB = bin(T.BAND_HIGH_HZ[1]);
  const tiltBins = T.TILT_BANDS_HZ.map(bin);
  let glitches = 0;
  for (let f = 0; f < frames; f++) {
    if (onProgress && f % 500 === 0) onProgress(f / frames * 0.9);
    if (fast[f] < floor) continue;
    const g = guideAt(f);
    if (g === null) continue;                       // the guide heard no voice here
    const a = f * HOP - WIN / 2;
    let dc = 0; for (let i = 0; i < WIN; i++) { const j = a + i; dc += j >= 0 && j < n ? x[j] : 0; } dc /= WIN;
    for (let i = 0; i < WIN; i++) { const j = a + i; re[i] = ((j >= 0 && j < n ? x[j] : 0) - dc) * HANN[i]; im[i] = 0; }
    for (let i = WIN; i < NFFT; i++) { re[i] = 0; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= NFFT / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    // Spectrum features.
    let num = 0, den = 0; for (let k = cLo; k <= cHi; k++) { const m = Math.sqrt(power[k]); num += m * k; den += m; }
    centroid[f] = den > 0 ? num / den * BIN_HZ : 0;
    let eLow = 0, eHigh = 0; for (let k = lowA; k < lowB; k++) eLow += power[k]; for (let k = lowB; k < highB; k++) eHigh += power[k];
    ratio[f] = 10 * Math.log10((eHigh + 1e-12) / (eLow + 1e-12));
    // Autocorrelation = transform of the power spectrum (real, even).
    for (let k = 0; k < NFFT; k++) { const p = k <= NFFT / 2 ? power[k] : power[NFFT - k]; re[k] = p; im[k] = 0; }
    fft(re, im);
    const r0 = re[0]; if (!(r0 > 0)) continue;
    const r = lag => re[lag] / r0 / WINDOW_ACF[lag];
    // Value at whole lag + j/8 (j may be negative): windowed-sinc read of the raw autocorrelation, window undone.
    const fine = (lag, j) => {
      const base = j < 0 ? lag - 1 : lag, row = SINC[j < 0 ? j + SINC_STEPS : j], frac = (j < 0 ? j + SINC_STEPS : j) / SINC_STEPS;
      let v = 0; for (let k = 0; k < SINC_DEPTH * 2; k++) v += re[base - SINC_DEPTH + 1 + k] * row[k];
      return v / r0 / (WINDOW_ACF[base] + (WINDOW_ACF[base + 1] - WINDOW_ACF[base]) * frac);
    };
    let best = null, near = null, prev = r(LAG_MIN - 1), cur = r(LAG_MIN);
    for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
      const next = r(lag + 1);
      if (cur > 0.2 && cur >= prev && cur > next) {
        let top = 0, tv = cur; const half = SINC_STEPS / 2;
        for (let j = -half; j <= half; j++) { if (!j) continue; const v = fine(lag, j); if (v > tv) { tv = v; top = j; } }
        const p0 = top > -half ? (top - 1 ? fine(lag, top - 1) : cur) : tv, p1 = top < half ? (top + 1 ? fine(lag, top + 1) : cur) : tv;
        const d = p0 - 2 * tv + p1, off = d < 0 ? 0.5 * (p0 - p1) / d : 0, peak = Math.min(0.9999, tv - 0.25 * (p0 - p1) * off), at = lag + (top + off) / SINC_STEPS;
        const cand = {lag:at, r:peak, score:peak - T.OCTAVE_COST * Math.log2(at / LAG_MIN)};
        if (!best || cand.score > best.score) best = cand;
        if (g != null) { const dist = Math.abs(semitone(SR / at) - g); if (dist <= T.GUIDE_PULL_SEMITONES && (!near || cand.r > near.r)) near = cand; }
      }
      prev = cur; cur = next;
    }
    if (!best) continue;
    // The guide's pitch is kept when it is nearly as periodic as the strongest candidate — unless the strongest one is
    // a whole fraction of that period and just as periodic: sound that repeats every T/2 also repeats every T, so the
    // shorter period is the real one (the voice flipped up an octave; the guide folds such moments back down).
    const k = near && near !== best ? near.lag / best.lag : 0, upper = k > 1.5 && Math.abs(k - Math.round(k)) <= T.GUIDE_FRACTION_SLACK * Math.round(k) && best.r >= near.r - T.GUIDE_FRACTION_MARGIN;
    const pick = near && !upper && near.r >= best.r * T.GUIDE_KEEP_RATIO ? near : best;
    strength[f] = pick.r;
    if (pick.r < T.VOICED_MIN_STRENGTH) continue;
    const hz = SR / pick.lag;
    st[f] = semitone(hz);
    // Spectral tilt: level of the octave bands from the one holding the fundamental upward, dB per octave.
    let first = 0; while (first < T.TILT_BANDS_HZ.length - 4 && T.TILT_BANDS_HZ[first + 1] <= hz) first++;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let b = first; b < tiltBins.length - 1; b++) { let e = 0; for (let k = tiltBins[b]; k < tiltBins[b + 1]; k++) e += power[k]; const y = 10 * Math.log10(e + 1e-12); sx += b; sy += y; sxx += b * b; sxy += b * y; m++; }
    const dd = m * sxx - sx * sx; tilt[f] = dd ? (m * sxy - sx * sy) / dd : NaN;
  }
  // Single-frame glitches (one frame far from two agreeing neighbours) are tracker errors, not flips.
  for (let f = 1; f < frames - 1; f++) {
    const a = st[f - 1], b = st[f], c = st[f + 1];
    if (a === a && b === b && c === c && Math.abs(b - a) > T.GLITCH_SEMITONES && Math.abs(b - c) > T.GLITCH_SEMITONES && Math.abs(a - c) < 1) { st[f] = (a + c) / 2; glitches++; }
  }
  // Voiced runs; very short islands are dropped.
  const runs = [], minRun = Math.round(T.MIN_VOICED_RUN_MS / MS);
  for (let f = 0; f < frames;) {
    if (st[f] !== st[f]) { f++; continue; }
    const s = f; while (f < frames && st[f] === st[f]) f++;
    if (f - s >= minRun) runs.push([s, f]); else for (let k = s; k < f; k++) st[k] = NaN;
  }
  onProgress?.(0.92);
  const voicedFrames = runs.reduce((s, [a, b]) => s + b - a, 0), voicedSeconds = voicedFrames / FPS;
  const voicedSt = []; for (const [a, b] of runs) for (let f = a; f < b; f++) voicedSt.push(st[f]);

  /* zones: the take's own low / middle / high thirds */
  const lo = voicedSt.length ? quantile(voicedSt, T.ZONE_PERCENTILES[0] / 100) : null, hi = voicedSt.length ? quantile(voicedSt, T.ZONE_PERCENTILES[1] / 100) : null;
  const split = lo != null && hi - lo >= T.ZONE_MIN_SPAN_SEMITONES, b1 = split ? lo + (hi - lo) / 3 : -Infinity, b2 = split ? lo + (hi - lo) * 2 / 3 : Infinity;
  const zoneOf = s => s < b1 ? 'low' : s < b2 ? 'mid' : 'high';
  const ZONES = ['low', 'mid', 'high'];
  const acc = () => ({frames:0, hnr:[], centroid:[], ratio:[], tilt:[], level:[], breaks:0, flips:0, notes:[]});
  const zones = {low:acc(), mid:acc(), high:acc()}, bands = new Map();
  const bandOf = s => { const k = Math.round(s); if (!bands.has(k)) bands.set(k, {...acc(), midi:k}); return bands.get(k); };
  const hnrOf = r => { const c = Math.min(0.9999, Math.max(1e-4, r)); return 10 * Math.log10(c / (1 - c)); };
  for (const [a, b] of runs) for (let f = a; f < b; f++) {
    const h = hnrOf(strength[f]);
    for (const t of [zones[zoneOf(st[f])], bandOf(st[f])]) {
      t.frames++; t.hnr.push(h); t.centroid.push(centroid[f]); t.ratio.push(ratio[f]); t.level.push(level[f]);
      if (tilt[f] === tilt[f]) t.tilt.push(tilt[f]);
    }
  }

  /* 전환 · 끊김: a short unvoiced gap between two voiced stretches of similar pitch */
  const breaks = [], side = Math.round(T.BREAK_SIDE_MS / MS);
  const edge = (from, to) => { const v = []; for (let f = from; f < to; f++) v.push(st[f]); return median(v); };
  for (let i = 1; i < runs.length; i++) {
    const [a0, a1] = runs[i - 1], [c0, c1] = runs[i], gapMs = (c0 - a1) * MS;
    if (gapMs < T.BREAK_MIN_MS || gapMs > T.BREAK_MAX_MS || a1 - a0 < side || c1 - c0 < side) continue;
    const before = edge(Math.max(a0, a1 - 5), a1), after = edge(c0, Math.min(c1, c0 + 5));
    if (Math.abs(before - after) > T.BREAK_PITCH_SEMITONES) continue;
    const s0 = a1 * HOP, s1 = Math.min(n, c0 * HOP); let zc = 0; for (let j = s0 + 1; j < s1; j++) if ((x[j] >= 0) !== (x[j - 1] >= 0)) zc++;
    const gapLevel = levelDb(s0, s1), noisy = zc / Math.max(1, s1 - s0) >= T.BREAK_NOISY_ZCR && gapLevel >= loud - T.LEVEL_GATE_DB - 10;
    breaks.push({t:round(a1 / FPS, 2), ms:Math.round(gapMs), kind:noisy ? 'noisy' : 'quiet', semitone:round(before, 1), dropDb:round((level[a1 - 1] + level[c0]) / 2 - gapLevel, 1)});
    zones[zoneOf(before)].breaks++; bandOf(before).breaks++;
  }
  /* 전환 · 뒤집힘: a jump away from the pitch just before it that comes back */
  const flips = [], flipMin = Math.round(T.FLIP_MIN_MS / MS), flipMax = Math.round(T.FLIP_MAX_MS / MS), octMax = Math.round(T.OCTAVE_FLIP_MAX_MS / MS);
  const inFlip = new Uint8Array(frames);
  for (const [a, b] of runs) {
    for (let f = a + 2; f < b;) {
      const ref = []; for (let k = f - 1; k >= a && ref.length < 5; k--) if (!inFlip[k]) ref.push(st[k]);   // the pitch just before, not counting an earlier flip
      const pre = ref.length ? median(ref) : st[f];
      if (Math.abs(st[f] - pre) <= T.FLIP_MIN_SEMITONES) { f++; continue; }
      let j = f; while (j < b && j - f <= octMax && Math.abs(st[j] - pre) > T.FLIP_RETURN_SEMITONES) j++;
      const len = j - f, back = j < b && Math.abs(st[j] - pre) <= T.FLIP_RETURN_SEMITONES;
      const away = []; for (let k = f; k < j; k++) away.push(st[k] - pre);
      const size = median(away), octave = Math.abs(size) >= T.OCTAVE_FLIP_LOW && Math.abs(size) <= T.OCTAVE_FLIP_HIGH;
      if (back && len >= flipMin && (len <= flipMax || octave)) {
        flips.push({t:round(f / FPS, 2), ms:Math.round(len * MS), kind:len <= flipMax ? 'short' : 'octave', semitones:round(size, 1), semitone:round(pre, 1)});
        zones[zoneOf(pre)].flips++; bandOf(pre).flips++;
        for (let k = f; k < j; k++) inFlip[k] = 1;
        f = j;
      } else f += 5;                                  // a leap that stayed: melody. Skip past it.
    }
  }

  /* 이어짐: sustained notes */
  const notes = [], half = Math.round(T.SUSTAIN_SMOOTH_MS / MS / 2), minNote = Math.round(T.SUSTAIN_MIN_S * FPS), trim = Math.round(T.SUSTAIN_TRIM_MS / MS), band = T.SUSTAIN_BAND_CENTS * 2 / 100;
  for (const [a, b] of runs) {
    if (b - a < minNote) continue;
    const sm = new Float32Array(b - a);
    for (let f = a; f < b; f++) { let s = 0, c = 0; for (let k = Math.max(a, f - half); k <= Math.min(b - 1, f + half); k++) { s += st[k]; c++; } sm[f - a] = s / c; }
    // The longest stretch from s whose smoothed pitch stays inside the band; too short → try from the next frame.
    for (let s = 0; s < sm.length;) {
      let e = s + 1, mn = sm[s], mx = sm[s];
      for (; e < sm.length; e++) { const v = sm[e], lo2 = Math.min(mn, v), hi2 = Math.max(mx, v); if (hi2 - lo2 > band) break; mn = lo2; mx = hi2; }
      if (e - s >= minNote) { notes.push(measureNote(a + s + trim, a + e - trim)); s = e; } else s++;
    }
  }
  function measureNote(from, to) {
    const N = to - from, cents = new Float64Array(N), lv = [];
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < N; i++) { const c = st[from + i] * 100, t = i / FPS; cents[i] = c; lv.push(level[from + i]); sx += t; sy += c; sxx += t * t; sxy += t * c; }
    const d = N * sxx - sx * sx, slope = d ? (N * sxy - sx * sy) / d : 0, icpt = (sy - slope * sx) / N;
    const res = new Float64Array(N); let v = 0; for (let i = 0; i < N; i++) { res[i] = cents[i] - (icpt + slope * i / FPS); v += res[i] * res[i]; } v /= N;
    // The strongest pitch modulation between 3 and 9 Hz; vibrato when it sits at 4–8 Hz, is wide and regular enough.
    let bestHz = 0, bestAmp = 0, ba = 0, bb = 0;
    for (let hz = T.VIBRATO_SCAN_HZ[0]; hz <= T.VIBRATO_SCAN_HZ[1] + 1e-9; hz += 0.1) {
      let ca = 0, sb = 0; const w = 2 * Math.PI * hz / FPS;
      for (let i = 0; i < N; i++) { ca += res[i] * Math.cos(w * i); sb += res[i] * Math.sin(w * i); }
      ca *= 2 / N; sb *= 2 / N; const amp = Math.hypot(ca, sb);
      if (amp > bestAmp) { bestAmp = amp; bestHz = hz; ba = ca; bb = sb; }
    }
    const regularity = v > 0 ? Math.min(1, bestAmp * bestAmp / 2 / v) : 0;
    const vib = bestHz >= T.VIBRATO_MIN_HZ - 1e-9 && bestHz <= T.VIBRATO_MAX_HZ + 1e-9 && bestAmp >= T.VIBRATO_MIN_EXTENT_CENTS && regularity >= T.VIBRATO_MIN_REGULARITY;
    let rest = v;
    if (vib) { const w = 2 * Math.PI * bestHz / FPS; rest = 0; for (let i = 0; i < N; i++) { const e = res[i] - ba * Math.cos(w * i) - bb * Math.sin(w * i); rest += e * e; } rest /= N; }
    const center = median(Array.from(cents)) / 100;
    const note = {t:round(from / FPS, 2), dur:round(N / FPS, 2), semitone:round(center, 2), pitchSdCents:round(Math.sqrt(rest), 1), pitchSdRawCents:round(Math.sqrt(v), 1),
      driftCentsPerS:round(slope, 1), loudSdDb:round(sd(lv), 2), vibrato:vib ? {rateHz:round(bestHz, 1), extentCents:round(bestAmp, 1), regularity:round(regularity, 2)} : null};
    zones[zoneOf(center)].notes.push(note); bandOf(center).notes.push(note);
    return note;
  }

  /* 시작: phrase onsets */
  const onsets = [], quiet = Math.round(T.ONSET_SILENCE_MS / MS), need = Math.round(T.ONSET_MIN_RUN_MS / MS), set0 = Math.round(T.ONSET_SETTLE_MS[0] / MS), set1 = Math.round(T.ONSET_SETTLE_MS[1] / MS), look = Math.round(T.ONSET_LOOKBACK_MS / MS), over = Math.round(T.ONSET_OVERSHOOT_MS / MS);
  for (let i = 0; i < runs.length; i++) {
    const [a, b] = runs[i], prevEnd = i ? runs[i - 1][1] : -quiet;
    if (a - prevEnd < quiet || b - a < need) continue;
    const lv = [], ps = []; for (let f = a + set0; f < Math.min(b, a + set1); f++) { lv.push(fast[f]); ps.push(st[f]); }
    const settled = median(lv), pitch = median(ps);
    const from = Math.max(0, prevEnd + 1, a - look);
    let up = a + set0; for (let f = from; f <= a + set0; f++) if (fast[f] >= settled - T.ONSET_RISE_DB[1]) { up = f; break; }
    let down = -1; for (let f = up; f >= from; f--) if (fast[f] <= settled - T.ONSET_RISE_DB[0]) { down = f; break; }
    if (down < 0) continue;                           // never quiet enough before it: the attack cannot be timed
    let top = -Infinity; for (let f = a; f < Math.min(b, a + over); f++) top = Math.max(top, (st[f] - pitch) * 100);
    const attackMs = (up - down) * MS;
    onsets.push({t:round(a / FPS, 2), attackMs:Math.round(attackMs), overshootCents:Math.round(top), hard:attackMs <= T.HARD_ATTACK_MS && top >= T.HARD_OVERSHOOT_CENTS, semitone:round(pitch, 1)});
  }
  onProgress?.(1);

  /* summaries */
  const sustainOf = list => {
    const vib = list.filter(x => x.vibrato);
    return {notes:list.length, seconds:round(list.reduce((s, x) => s + x.dur, 0), 1),
      pitchSdCents:round(median(list.map(x => x.pitchSdCents)), 1), driftCentsPerS:round(median(list.map(x => Math.abs(x.driftCentsPerS))), 1), loudSdDb:round(median(list.map(x => x.loudSdDb)), 2),
      vibrato:{notes:vib.length, share:list.length ? Math.round(vib.length / list.length * 100) : null, rateHz:round(median(vib.map(x => x.vibrato.rateHz)), 1), extentCents:round(median(vib.map(x => x.vibrato.extentCents)), 1), regularity:round(median(vib.map(x => x.vibrato.regularity)), 2)}};
  };
  const timbreOf = (t, avg) => ({hnrDb:round(avg(t.hnr), 1), centroidHz:round(avg(t.centroid), 0), ratioDb:round(avg(t.ratio), 1), tiltDbPerOct:round(avg(t.tilt), 1), levelDb:round(avg(t.level), 1)});
  const zoneOut = {};
  for (const z of ZONES) {
    const t = zones[z], sec = t.frames / FPS;
    zoneOut[z] = {seconds:round(sec, 1), enough:sec >= T.MIN_ZONE_SECONDS, ...timbreOf(t, median), breaks:t.breaks, flips:t.flips, sustain:sustainOf(t.notes)};
  }
  const bandOut = [...bands.values()].sort((p, q) => p.midi - q.midi).map(t => {
    const sec = t.frames / FPS;
    return {midi:t.midi, note:noteName(t.midi), seconds:round(sec, 2), enough:sec >= T.MIN_BAND_SECONDS, ...timbreOf(t, mean), breaks:t.breaks, flips:t.flips,
      sustainNotes:t.notes.length, pitchSdCents:round(mean(t.notes.map(x => x.pitchSdCents)), 1), driftCentsPerS:round(mean(t.notes.map(x => Math.abs(x.driftCentsPerS))), 1), loudSdDb:round(mean(t.notes.map(x => x.loudSdDb)), 2), vibratoNotes:t.notes.filter(x => x.vibrato).length};
  });
  const all = {frames:voicedFrames, hnr:[], centroid:[], ratio:[], tilt:[], level:[]};
  for (const z of ZONES) for (const k of ['hnr', 'centroid', 'ratio', 'tilt', 'level']) for (const v of zones[z][k]) all[k].push(v);
  const overall = timbreOf(all, median);
  /** How much a timbre value moves between the zones that have enough sound (max − min), and high − low. */
  const changeOf = key => {
    const ok = ZONES.filter(z => zoneOut[z].enough && zoneOut[z][key] != null);
    if (ok.length < 2) return {spread:null, highMinusLow:null, zones:ok};
    const v = ok.map(z => zoneOut[z][key]);
    return {spread:round(Math.max(...v) - Math.min(...v), 1), highMinusLow:zoneOut.low.enough && zoneOut.high.enough ? round(zoneOut.high[key] - zoneOut.low[key], 1) : null, zones:ok};
  };
  const minutes = voicedSeconds / 60, hard = onsets.filter(o => o.hard).length;
  const strengths = []; for (const [a, b] of runs) for (let f = a; f < b; f++) strengths.push(strength[f]);
  return {
    version:VERSION, seconds:round(seconds, 1), voicedSeconds:round(voicedSeconds, 1),
    confidence:{pitchSource:gCurve ? 'guide+autocorrelation' : 'autocorrelation', meanStrength:round(mean(strengths), 3), voicedShare:seconds ? Math.round(voicedSeconds / seconds * 100) : 0, glitchFramesSmoothed:glitches, levelGateDb:round(floor, 1)},
    range:lo == null ? null : {low:round(lo, 1), high:round(hi, 1), lowNote:noteName(lo), highNote:noteName(hi), split, bounds:split ? [round(b1, 1), round(b2, 1)] : null},
    transitions:{breaks, flips, breakCount:breaks.length, quietBreaks:breaks.filter(k => k.kind === 'quiet').length, noisyBreaks:breaks.filter(k => k.kind === 'noisy').length, flipCount:flips.length, octaveFlips:flips.filter(k => k.kind === 'octave').length,
      breaksPerMin:minutes > 0 ? round(breaks.length / minutes, 1) : null, flipsPerMin:minutes > 0 ? round(flips.length / minutes, 1) : null},
    sustain:{...sustainOf(notes), list:notes},
    resonance:{centroidHz:overall.centroidHz, ratioDb:overall.ratioDb, tiltDbPerOct:overall.tiltDbPerOct, change:{centroidHz:changeOf('centroidHz'), ratioDb:changeOf('ratioDb'), tiltDbPerOct:changeOf('tiltDbPerOct')}},
    breath:{hnrDb:overall.hnrDb, change:changeOf('hnrDb')},
    onsets:{count:onsets.length, hard, hardShare:onsets.length ? Math.round(hard / onsets.length * 100) : null, attackMs:round(median(onsets.map(o => o.attackMs)), 0), overshootCents:round(median(onsets.map(o => o.overshootCents)), 0), list:onsets},
    zones:zoneOut, bands:bandOut
  };
}

/* ---------- cleanliness ---------- */
/**
 * Whether the AUDIO of a take can be read as voice only (울림 · 숨소리 · 시작 need that).
 *   ticked true/false: the person said so on this device — it decides.
 *   otherwise the stored analysis (app/vocal-analysis.js confidence):
 *     voiceOverMrDb == null   no accompaniment was heard on its own → clean
 *     mrRemoved / aiSeparated the NUMBERS were measured after taking the accompaniment out, but the stored file is
 *                             the take as recorded: the sound read here still has the accompaniment → not clean
 *     voiceOverMrDb a number  an accompaniment was heard → not clean
 *   no stored analysis: unknown → not clean.
 */
function cleanOf({analysis = null, ticked = null} = {}) {
  if (ticked === true) return {clean:true, why:'user-said-voice-only'};
  if (ticked === false) return {clean:false, why:'user-said-accompaniment'};
  const c = analysis?.confidence;
  if (!analysis?.metrics || !c) return {clean:false, why:'not-analysed'};
  if (c.aiSeparated) return {clean:false, why:'ai-separated-numbers-only'};
  if (c.mrRemoved) return {clean:false, why:'mr-removed-numbers-only'};
  if (c.voiceOverMrDb == null) return {clean:true, why:'no-accompaniment-heard'};
  return {clean:false, why:'accompaniment-heard'};
}
const CLEAN_TEXT = {
  'user-said-voice-only':'목소리만 들어 있다고 직접 표시했어요',
  'user-said-accompaniment':'반주가 있다고 직접 표시했어요',
  'not-analysed':'아직 분석하지 않아 반주가 있는지 몰라요',
  'ai-separated-numbers-only':'저장된 분석은 AI로 목소리를 나눠 쟀지만, 녹음 파일에는 반주가 그대로 있어요',
  'mr-removed-numbers-only':'저장된 분석은 반주(MR)를 빼고 쟀지만, 녹음 파일에는 반주가 그대로 있어요',
  'no-accompaniment-heard':'저장된 분석에서 반주가 따로 잡히지 않았어요',
  'accompaniment-heard':'저장된 분석에서 반주가 잡혔어요'
};
const UNCLEAN_NOTE = '반주가 섞여 있어 울림·숨소리는 잴 수 없어요';
/** The result with everything that needs voice-only sound taken out (null), when the take is not clean. */
function gate(result, clean) {
  if (!result || clean) return result;
  const strip = z => ({...z, hnrDb:null, centroidHz:null, ratioDb:null, tiltDbPerOct:null, levelDb:null});
  return {...result, resonance:null, breath:null, onsets:null,
    transitions:{...result.transitions, breaks:result.transitions.breaks.map(({dropDb, kind, ...b}) => b), quietBreaks:null, noisyBreaks:null},
    sustain:{...result.sustain, loudSdDb:null, list:result.sustain.list.map(x => ({...x, loudSdDb:null}))},
    zones:Object.fromEntries(Object.entries(result.zones).map(([k, z]) => [k, {...strip(z), sustain:{...z.sustain, loudSdDb:null}}])),
    bands:result.bands.map(b => ({...strip(b), loudSdDb:null}))};
}

/* ---------- two takes side by side ---------- */
const ZONE_LABEL = {low:'낮은 음', mid:'가운데 음', high:'높은 음'};
const num = (v, d = 1) => v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.0+$/, '');
/**
 * Rows for the screen. base / comp: analyze() results already passed through gate().
 * Each row: {id, group, title, base, comp (plain text), state: 'similar' | 'different' | 'hold', marker, line}.
 * marker is 비슷함 / 다름 (or 표본 부족 / 잴 수 없음); line says the direction in words. Never a verdict.
 */
function compare(base, comp) {
  const rows = [];
  const voiced = base.voicedSeconds >= T.MIN_VOICED_SECONDS && comp.voicedSeconds >= T.MIN_VOICED_SECONDS;
  const add = (id, group, title, {a, b, aText, bText, ok, okWhy = '표본 부족', tol, down, up, same, measurable = true}) => {
    const row = {id, group, title, base:aText, comp:bText, baseValue:a ?? null, compValue:b ?? null};
    if (!measurable) Object.assign(row, {state:'hold', marker:'잴 수 없음', line:UNCLEAN_NOTE});
    else if (!ok || a == null || b == null) Object.assign(row, {state:'hold', marker:okWhy, line:okWhy === '표본 부족' ? '비교할 만큼 소리가 모이지 않았어요' : okWhy});
    else if (Math.abs(b - a) <= Math.max(tol, T.SIMILAR_RELATIVE * Math.max(Math.abs(a), Math.abs(b)))) Object.assign(row, {state:'similar', marker:'비슷함', line:same});
    else Object.assign(row, {state:'different', marker:'다름', line:b < a ? down : up});
    rows.push(row);
  };
  const S = T.SIMILAR, tr = x => x.transitions, su = x => x.sustain;
  const clean = !!base.resonance && !!comp.resonance;   // gate() takes resonance out of a take that is not voice only
  add('breaks', '전환', '끊김', {a:tr(base).breaksPerMin, b:tr(comp).breaksPerMin, ok:voiced, tol:S.breaksPerMin,
    aText:'분당 ' + num(tr(base).breaksPerMin) + '회 (' + tr(base).breakCount + '곳)', bText:'분당 ' + num(tr(comp).breaksPerMin) + '회 (' + tr(comp).breakCount + '곳)',
    down:'끊김이 줄었어요', up:'끊김이 늘었어요', same:'끊김 횟수가 비슷해요'});
  add('flips', '전환', '뒤집힘', {a:tr(base).flipsPerMin, b:tr(comp).flipsPerMin, ok:voiced, tol:S.flipsPerMin,
    aText:'분당 ' + num(tr(base).flipsPerMin) + '회 (' + tr(base).flipCount + '곳)', bText:'분당 ' + num(tr(comp).flipsPerMin) + '회 (' + tr(comp).flipCount + '곳)',
    down:'뒤집힘이 줄었어요', up:'뒤집힘이 늘었어요', same:'뒤집힘 횟수가 비슷해요'});
  const notesOk = su(base).notes >= T.MIN_SUSTAIN_NOTES && su(comp).notes >= T.MIN_SUSTAIN_NOTES;
  add('pitchSd', '이어짐', '긴 음의 음높이 흔들림', {a:su(base).pitchSdCents, b:su(comp).pitchSdCents, ok:notesOk, tol:S.pitchSdCents,
    aText:'±' + num(su(base).pitchSdCents) + ' cent (긴 음 ' + su(base).notes + '개)', bText:'±' + num(su(comp).pitchSdCents) + ' cent (긴 음 ' + su(comp).notes + '개)',
    down:'긴 음의 음높이 흔들림이 줄었어요', up:'긴 음의 음높이 흔들림이 커졌어요', same:'긴 음의 음높이 흔들림이 비슷해요'});
  add('drift', '이어짐', '긴 음이 밀리는 정도', {a:su(base).driftCentsPerS, b:su(comp).driftCentsPerS, ok:notesOk, tol:S.driftCentsPerS,
    aText:'초당 ' + num(su(base).driftCentsPerS) + ' cent', bText:'초당 ' + num(su(comp).driftCentsPerS) + ' cent',
    down:'긴 음이 한쪽으로 밀리는 정도가 줄었어요', up:'긴 음이 한쪽으로 밀리는 정도가 커졌어요', same:'긴 음이 밀리는 정도가 비슷해요'});
  add('loudSd', '이어짐', '긴 음의 소리 크기 흔들림', {a:su(base).loudSdDb, b:su(comp).loudSdDb, ok:notesOk, tol:S.loudSdDb, measurable:clean,
    aText:su(base).loudSdDb == null ? '—' : '±' + num(su(base).loudSdDb, 2) + ' dB', bText:su(comp).loudSdDb == null ? '—' : '±' + num(su(comp).loudSdDb, 2) + ' dB',
    down:'긴 음의 소리 크기 흔들림이 줄었어요', up:'긴 음의 소리 크기 흔들림이 커졌어요', same:'긴 음의 소리 크기 흔들림이 비슷해요'});
  const vibText = x => { const v = su(x).vibrato; return v.share == null ? '—' : '긴 음의 ' + v.share + '%' + (v.notes ? ' · 초당 ' + num(v.rateHz) + '회 · 폭 ±' + num(v.extentCents, 0) + ' cent · 규칙성 ' + Math.round(v.regularity * 100) + '%' : ''); };
  add('vibrato', '이어짐', '비브라토', {a:su(base).vibrato.share, b:su(comp).vibrato.share, ok:notesOk, tol:S.vibratoShare, aText:vibText(base), bText:vibText(comp),
    down:'비브라토가 들어간 긴 음이 줄었어요', up:'비브라토가 들어간 긴 음이 늘었어요', same:'비브라토가 들어간 긴 음의 비율이 비슷해요'});
  const spreadText = x => { const c = x.resonance?.change.ratioDb; return !x.resonance ? '—' : c.spread == null ? '표본 부족' : num(c.spread) + ' dB (' + c.zones.map(z => ZONE_LABEL[z]).join('·') + ')'; };
  add('zoneSpread', '울림', '음역에 따라 울림이 달라지는 정도', {a:base.resonance?.change.ratioDb.spread, b:comp.resonance?.change.ratioDb.spread, measurable:clean, tol:S.zoneSpreadDb,
    ok:clean && base.resonance.change.ratioDb.spread != null && comp.resonance.change.ratioDb.spread != null, aText:spreadText(base), bText:spreadText(comp),
    down:'음역에 따라 울림이 달라지는 정도가 줄었어요', up:'음역에 따라 울림이 달라지는 정도가 커졌어요', same:'음역에 따라 울림이 달라지는 정도가 비슷해요'});
  const brightText = x => !x.resonance ? '—' : num(x.resonance.ratioDb) + ' dB · 중심 ' + num(x.resonance.centroidHz, 0) + ' Hz · 기울기 ' + num(x.resonance.tiltDbPerOct) + ' dB/옥타브';
  add('brightness', '울림', '2–4 kHz 쪽 소리의 크기', {a:base.resonance?.ratioDb, b:comp.resonance?.ratioDb, measurable:clean, ok:clean && voiced, tol:S.ratioDb, aText:brightText(base), bText:brightText(comp),
    down:'2–4 kHz 쪽 소리가 작아졌어요', up:'2–4 kHz 쪽 소리가 커졌어요', same:'2–4 kHz 쪽 소리의 크기가 비슷해요'});
  add('breath', '숨소리', '목소리에 섞인 숨·잡음', {a:base.breath?.hnrDb, b:comp.breath?.hnrDb, measurable:clean, ok:clean && voiced, tol:S.hnrDb,
    aText:!base.breath ? '—' : '배음 대 잡음 ' + num(base.breath.hnrDb) + ' dB', bText:!comp.breath ? '—' : '배음 대 잡음 ' + num(comp.breath.hnrDb) + ' dB',
    down:'목소리에 섞인 숨·잡음이 늘었어요', up:'목소리에 섞인 숨·잡음이 줄었어요', same:'목소리에 섞인 숨·잡음이 비슷해요'});
  const onText = x => !x.onsets ? '—' : x.onsets.count ? '구절 시작 ' + x.onsets.count + '번 중 ' + x.onsets.hardShare + '% · 소리 켜짐 ' + num(x.onsets.attackMs, 0) + 'ms' : '잰 시작 없음';
  add('onsets', '시작', '세게 시작한 구절', {a:base.onsets?.hardShare, b:comp.onsets?.hardShare, measurable:clean, tol:S.hardShare,
    ok:clean && base.onsets.count >= T.MIN_ONSETS && comp.onsets.count >= T.MIN_ONSETS, aText:onText(base), bText:onText(comp),
    down:'세게 시작한 구절이 줄었어요', up:'세게 시작한 구절이 늘었어요', same:'세게 시작한 구절의 비율이 비슷해요'});
  return rows;
}

/* ---------- diagnosis file (numbers only) ---------- */
/** YYYY-MM of a date string; never the day. */
const monthOf = date => /^\d{4}-\d{2}/.test(String(date || '')) ? String(date).slice(0, 7) : null;
/** Only numbers and flags of a stored analysis: no track ids, no history. */
function storedNumbers(a, reliable) {
  if (!a?.metrics) return null;
  const c = a.confidence || {}, n = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  return {version:n(a.v), reliable:!!reliable, voicedSeconds:n(a.metrics.voicedSeconds), seconds:n(a.seconds), cut:!!a.scope?.cut,
    pitchConfidence:n(c.pitchConfidence), voiceOverMrDb:n(c.voiceOverMrDb), voicedShare:n(c.voicedShare), separated:typeof c.separated === 'boolean' ? c.separated : null,
    octaveFoldedFrames:n(c.octaveFoldedFrames), spikeFramesRemoved:n(c.spikeFramesRemoved), lowConfidenceFrames:n(c.lowConfidenceFrames),
    mrRemoved:!!c.mrRemoved, mrRemovedDb:n(c.mrRemoved?.removedDb), aiSeparated:!!c.aiSeparated,
    wobbleCents:n(a.metrics.stability?.wobbleCents), meanAbsCents:n(a.metrics.intonation?.meanAbsCents)};
}
/**
 * takes: [{role:'base'|'comp', date, result (un-gated analyze() result), clean:{clean, why}, stored, reliable, guide}]
 * Holds no id, title, song or file name, no day of the month and no audio.
 */
function diagnosis(takes, {generatedMonth = null} = {}) {
  const guideNumbers = g => g ? {version:g.version ?? null, pitchConfidence:g.confidence?.pitchConfidence ?? null, voiceOverMrDb:g.confidence?.voiceOverMrDb ?? null, voicedShare:g.confidence?.voicedShare ?? null, voicedSeconds:g.voicedSeconds ?? null} : null;
  const out = takes.map(t => {
    const r = gate(t.result, t.clean.clean);
    return {role:t.role, month:monthOf(t.date), clean:t.clean.clean, cleanWhy:t.clean.why, storedAnalysis:storedNumbers(t.stored, t.reliable), guideAnalysis:guideNumbers(t.guide),
      modelVersion:r.version, durationSeconds:r.seconds, voicedSeconds:r.voicedSeconds, confidence:r.confidence, range:r.range,
      transitions:r.transitions, sustain:r.sustain, resonance:r.resonance, breath:r.breath, onsets:r.onsets,
      coverage:Object.fromEntries(Object.entries(r.zones).map(([k, z]) => [k, {seconds:z.seconds, enough:z.enough}])), zones:r.zones, semitoneBands:r.bands};
  });
  const pair = out.length === 2 ? compare(gate(takes[0].result, takes[0].clean.clean), gate(takes[1].result, takes[1].clean.clean)).map(({id, state, baseValue, compValue}) => ({trace:id, state, base:baseValue, comp:compValue})) : null;
  return {kind:'vocalzip-voice-path-diagnosis', format:1, modelVersion:VERSION, generatedMonth, note:'numbers only: no ids, titles, song names, file names, days or audio', thresholds:T, takes:out, comparison:pair};
}

const api = {VERSION, THRESHOLDS:T, analyze, resample, cleanOf, CLEAN_TEXT, UNCLEAN_NOTE, gate, compare, diagnosis, monthOf, noteName, ZONE_LABEL};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.VzipVoicePath = api;
})(typeof self !== 'undefined' ? self : this);
