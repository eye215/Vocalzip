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
const VERSION = 'vp-0.2';

/* ---------- thresholds (first guesses; all exported with the diagnosis file) ---------- */
const T = Object.freeze({
  SR:16000,                    // Hz the model works at; other rates are resampled
  HOP:320,                     // samples between pitch frames = 20 ms: a 40 ms dropout is 2 frames
  LEVEL_BIN:160,               // samples per level reading = 10 ms (onset attack times, gap levels)
  WIN:640,                     // samples correlated per frame = 40 ms: ≥ 3 periods down to 75 Hz
  FFT:512,                     // spectrum of a voiced frame: 32 ms Hann window, 31 Hz bins
  COARSE_DECIMATE:4,           // the period is first searched on a 4 kHz copy (below 1.6 kHz), then read again at 16 kHz
  COARSE_STRENGTH_SLACK:0.1,   // a period this much below VOICED_MIN_STRENGTH on the 4 kHz copy is not looked at again
  REFINE_PERIODS:3,            // periods correlated when a candidate is read again at 16 kHz …
  REFINE_MIN_SAMPLES:160,      // … at least 10 ms, at most WIN
  CANDIDATES:3,                // periods kept per frame until the take's main band is known
  ABSOLUTE_FLOOR_DB:-75,       // a frame below this (re full scale) is digital silence: nothing is computed
  F0_MIN_HZ:70,                // lowest pitch looked for (about C#2)
  F0_MAX_HZ:1050,              // highest pitch looked for (about C6)
  VOICED_MIN_STRENGTH:0.5,     // normalised autocorrelation at the period; below this a frame is not voiced
  LEVEL_GATE_DB:35,            // a frame quieter than (95th percentile level − this) is silence
  OCTAVE_COST:0.06,            // per octave of period: the shorter period wins unless the longer one is this much more periodic over the
                               // whole band (a bass an octave below, 12 dB under the voice, adds about that much to the longer period)
  COARSE_OCTAVE_COST:0.02,     // the same idea when the candidates are first collected on the 4 kHz copy
  GUIDE_PULL_SEMITONES:3.5,    // a candidate this close to the guide pitch counts as "the voice"
  GUIDE_KEEP_RATIO:0.85,       // …and is kept when at least this strong relative to the strongest candidate
  GUIDE_FRACTION_SLACK:0.04,   // "a whole fraction of the guide's period": within 4% of ½, ⅓, ¼ …
  GUIDE_FRACTION_MARGIN:0.05,  // …and at most this much less periodic than the guide's own period
  MIN_VOICED_RUN_MS:40,        // shorter voiced islands are dropped (clicks, consonant bursts)
  REFERENCE_MS:60,             // "the pitch just before / after": median over this long
  BAND_PERCENTILES:[10, 90],   // the take's main band: this share of the pitch of its louder half …
  BAND_MARGIN_SEMITONES:9,     // … and a period further than this BELOW it is not the voice (a bass line): unvoiced
  BAND_MARGIN_ABOVE:14,        // above it the margin is an octave and a tone, so an octave flip from the top of the band is still seen
  BAND_MIN_SECONDS:2,          // sound needed before a main band is trusted
  OUTSIDE_LOUD_DB:10,          // sound outside the band is held against the take when no more than this below the singing's level
  GLITCH_SEMITONES:3,          // a single frame this far from both equal neighbours is a tracker glitch, smoothed out
  // 전환 · 끊김
  BREAK_MIN_MS:40,             // shortest dropout counted as a break
  BREAK_MAX_MS:150,            // longest; longer is a breath or a rest
  BREAK_PITCH_SEMITONES:2,     // pitch before and after must be this close ("inside a phrase")
  BREAK_SIDE_MS:80,            // voiced sound needed on each side
  BREAK_NOISY_ZCR:0.25,        // zero crossings per sample in the gap above this = noise-like (probably a consonant)
  // 전환 · 뒤집힘
  FLIP_MIN_SEMITONES:5,        // jump size
  FLIP_MIN_MS:40,              // two frames; a single frame is a tracker glitch
  FLIP_MAX_MS:120,             // a jump that lasts longer is melody, unless it is an octave (below)
  FLIP_RETURN_SEMITONES:2,     // "comes back" = within this of the pitch before the jump
  OCTAVE_FLIP_LOW:10.5,        // an octave jump is 10.5–13.5 semitones …
  OCTAVE_FLIP_HIGH:13.5,
  OCTAVE_FLIP_MAX_MS:500,      // … that returns within this time
  OCTAVE_FLIP_MARGIN:0.15,     // …and counts only when the octave above is this much less periodic on the lower-pitched side
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
  // a take with an accompaniment is measured only when the voice is clearly on top in this reading of this audio
  MIXED_MIN_STRENGTH:0.88,     // mean periodicity of its voiced frames (a second source 9 dB under the voice already costs 0.11)
  MIXED_MAX_GLITCH_SHARE:0.02, // single-frame tracker glitches per voiced frame
  MIXED_MAX_OUTSIDE_SHARE:0.10,// share of the first reading that sat outside the main band ± BAND_MARGIN
  MIXED_FLAT_NOTE_CENTS:4,     // a held note steadier than this (raw pitch SD) is an instrument, not a voice …
  MIXED_MAX_FLAT_NOTE_SHARE:0.5,// … and a take whose held notes are mostly like that is the accompaniment being read
  MIXED_MAX_JUMPS_PER_MIN:15,  // flips + octave hesitations + glitches per minute of singing: more is a tracker hopping between voice and accompaniment
  MR_MIN_REMOVED_DB:3,         // fallback level-drop gate when waveform alignment is not independently verified
  SIMILAR_RELATIVE:0.2,        // within 20% of the larger value = 비슷함 …
  SIMILAR:{                    // … or within these absolute amounts, whichever is wider
    breaksPerMin:1, flipsPerMin:0.5, pitchSdCents:3, driftCentsPerS:5, loudSdDb:0.5, vibratoShare:15,
    zoneSpreadDb:2, ratioDb:2, hnrDb:2, hardShare:15
  }
});
// Plain constants for the hot loops (a property of the frozen table is a slow lookup inside them).
const SR = T.SR, HOP = T.HOP, WIN = T.WIN, NFFT = T.FFT, BIN = T.LEVEL_BIN, DEC = T.COARSE_DECIMATE;
const FPS = SR / HOP, MS = 1000 / FPS, BIN_MS = 1000 * BIN / SR, BINS_PER_FRAME = HOP / BIN;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = midi => { const m = Math.round(midi); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
const round = (v, d = 1) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const sd = a => { if (a.length < 2) return a.length ? 0 : null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const quantile = (a, q) => { if (!a.length) return null; const s = Array.from(a).sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); };
const median = a => quantile(a, 0.5);
const db = e => e > 1e-12 ? 10 * Math.log10(e) : -120;

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
const HANN = (() => { const w = new Float64Array(NFFT); for (let i = 0; i < NFFT; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / NFFT); return w; })();
const LAG_MIN = SR / T.F0_MAX_HZ, LAG_MAX = SR / T.F0_MIN_HZ;                     // period in samples at 16 kHz (15.2 … 228.6)
const CSR = SR / DEC, CWIN = WIN / DEC, CLAG_MIN = Math.floor(CSR / T.F0_MAX_HZ), CLAG_MAX = Math.ceil(CSR / T.F0_MIN_HZ);   // the same at 4 kHz: lags 3 … 58
/** Low-pass for the 4 kHz copy the period is first searched on (windowed sinc, cut-off 1.6 kHz, 33 taps). */
const FIR_HALF = 16, FIR = (() => {
  const h = new Float64Array(FIR_HALF * 2 + 1), fc = 1600 / SR; let sum = 0;
  for (let k = 0; k < h.length; k++) { const d = k - FIR_HALF; h[k] = (d ? Math.sin(2 * Math.PI * fc * d) / (Math.PI * d) : 2 * fc) * (0.54 + 0.46 * Math.cos(Math.PI * d / FIR_HALF)); sum += h[k]; }
  for (let k = 0; k < h.length; k++) h[k] /= sum;
  return h;
})();
/* The autocorrelation of wide-band sound has peaks about one sample wide, so reading it at whole lags misses their
 * height (and with it the period and the harmonics-to-noise ratio). Around the whole-lag peak it is read between
 * samples with a windowed sinc, on a grid of 1/8 sample. */
const SINC_DEPTH = 6, SINC_STEPS = 8, REFINE = 3;      // REFINE: whole lags searched on each side of the 4 kHz estimate
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
// Samples kept before a frame's centre and needed after it (filter history, the 40 ms window plus the longest lag).
const PRE = 2 * HOP, POST = 2 * HOP;

/* ---------- one recording, fed in pieces ---------- */
/**
 * The recording is pushed in blocks (any length; the app sends 30 s at a time) so the samples never have to be held
 * whole: only the current block, a short tail and one small number per frame are kept. finish() returns the result.
 * @param {{guide?:{curve:(number|null)[], fps:number}|null, limitHz?:number}} [options] limitHz: the highest
 *   frequency the sound really holds when it came from a lower sample rate (the voice left after taking the MR out is
 *   8 kHz sound): the centroid, the 2–4 kHz band and the tilt then stop there.
 */
function createStream({guide = null, limitHz = 0} = {}) {
  let w = new Float32Array(PRE), g0 = -PRE;           // working samples; w[0] is sample g0 of the recording (zeros before 0)
  let total = 0, next = 0;                            // samples pushed; next frame to measure (its centre is next × HOP)
  // Per frame: up to K period candidates (semitone, strength over the whole band, strength below 1.6 kHz, the same
  // for the period half as long, score) — which one is the voice is decided at the end, when the take's main range is known.
  const cSt = [], cR = [], cLow = [], cHalf = [], cScore = [], cNear = [];
  const centroid = [], ratio = [], octaves = [];      // spectrum of frames with any candidate: centroid, 2–4 kHz ratio, octave-band levels
  const binE = [], binZ = [];                         // per 10 ms: mean energy, zero crossings
  let accE = 0, accZ = 0, accN = 0, last = 0;
  const gFps = guide && Array.isArray(guide.curve) && guide.fps > 0 ? guide.fps : 0, gCurve = gFps ? guide.curve : null;
  const guideAt = f => {   // semitones where the guide heard the voice (one guide step of slack on each side), else null
    if (!gCurve) return undefined;
    const i = Math.floor(f / FPS * gFps), v = gCurve[i] ?? gCurve[i - 1] ?? gCurve[i + 1];
    return v == null ? null : v / 100;
  };
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), power = new Float64Array(NFFT / 2 + 1);
  const cap = hz => limitHz ? Math.min(hz, limitHz) : hz;
  const cLo = bin(T.CENTROID_HZ[0]), cHi = bin(cap(T.CENTROID_HZ[1])), lowA = bin(T.BAND_LOW_HZ[0]), lowB = bin(T.BAND_LOW_HZ[1]), highB = bin(cap(T.BAND_HIGH_HZ[1]));
  const tiltBins = T.TILT_BANDS_HZ.map(bin), coarse = new Float64Array(CLAG_MAX + SINC_DEPTH + 2), fineR = new Float64Array(2 * (REFINE + SINC_DEPTH) + 3);
  const K = T.CANDIDATES, OCT = T.TILT_BANDS_HZ.length - 1;
  const floorE = 10 ** (T.ABSOLUTE_FLOOR_DB / 10), preStrength = T.VOICED_MIN_STRENGTH - T.COARSE_STRENGTH_SLACK;

  function frames(final) {
    const len = w.length, dec = new Float32Array(len >> 2), sq = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) sq[i + 1] = sq[i] + w[i] * w[i];
    for (let j = Math.ceil(FIR_HALF / DEC), end = Math.floor((len - FIR_HALF - 1) / DEC); j <= end; j++) { let s = 0; const a = j * DEC - FIR_HALF; for (let k = 0; k <= 2 * FIR_HALF; k++) s += FIR[k] * w[a + k]; dec[j] = s; }
    for (; final ? next * HOP < total : next * HOP + POST <= total; next++) {
      const f = next, c = f * HOP - g0;                // the frame's centre in w
      for (let q = 0; q < K; q++) { cSt.push(NaN); cR.push(0); cLow.push(0); cHalf.push(0); cScore.push(-9); cNear.push(0); }
      centroid.push(0); ratio.push(0); for (let q = 0; q < OCT; q++) octaves.push(-120);
      const s = c - WIN / 2;
      if ((sq[s + WIN] - sq[s]) / WIN < floorE) continue;            // digital silence
      const g = guideAt(f);
      if (g === null) continue;                        // the guide heard no voice here
      // 1. Periods on the 4 kHz copy: normalised cross-correlation at every lag (cheap: 160 samples × 58 lags).
      const s4 = s / DEC; let e0 = 0; for (let i = 0; i < CWIN; i++) e0 += dec[s4 + i] * dec[s4 + i];
      if (!(e0 > 0)) continue;
      let eLag = e0;
      for (let lag = 0; lag <= CLAG_MAX + SINC_DEPTH; lag++) {
        let x = 0; for (let i = 0; i < CWIN; i++) x += dec[s4 + i] * dec[s4 + lag + i];
        coarse[lag] = eLag > 0 ? x / Math.sqrt(e0 * eLag) : 0;
        const out = dec[s4 + lag], inn = dec[s4 + lag + CWIN]; eLag += inn * inn - out * out;
      }
      const cands = [];
      for (let lag = CLAG_MIN; lag <= CLAG_MAX; lag++) {
        const prev = coarse[lag - 1], cur = coarse[lag], nxt = coarse[lag + 1];
        if (cur >= preStrength - 0.1 && cur >= prev && cur > nxt) {
          // The peak between whole lags (windowed sinc, 1/8 lag, then a parabola): at whole lags a narrow peak reads low
          // and the period twice as long would win by mistake.
          const fine4 = j => { if (!j) return cur; const base = j < 0 ? lag - 1 : lag, row = SINC[j < 0 ? j + SINC_STEPS : j]; let v = 0; for (let t = 0; t < SINC_DEPTH * 2; t++) { const i = base - SINC_DEPTH + 1 + t; v += (i < 0 ? coarse[-i] : coarse[i]) * row[t]; } return v; };
          let bj = 0, bv = cur; const half = SINC_STEPS / 2;
          for (let j = -half; j <= half; j++) { if (!j) continue; const v = fine4(j); if (v > bv) { bv = v; bj = j; } }
          const p0 = bj > -half ? fine4(bj - 1) : bv, p1 = bj < half ? fine4(bj + 1) : bv, d = p0 - 2 * bv + p1, off = d < 0 ? 0.5 * (p0 - p1) / d : 0, at = lag + (bj + off) / SINC_STEPS, peak = Math.min(1, bv - 0.25 * (p0 - p1) * off);
          if (peak < preStrength) continue;
          cands.push({lag:at, low:peak, score:peak - T.COARSE_OCTAVE_COST * Math.log2(at / CLAG_MIN), near:g != null && Math.abs(semitone(CSR / at) - g) <= T.GUIDE_PULL_SEMITONES ? 1 : 0});
        }
      }
      if (!cands.length) continue;                     // not periodic even below 1.6 kHz: no need to look closer
      cands.sort((p, q) => q.score - p.score);
      // With a guide, the most periodic candidate near it is always kept among the K.
      const guided = cands.filter(p => p.near).sort((p, q) => q.low - p.low)[0], kept = cands.slice(0, K);
      if (guided && !kept.includes(guided)) kept[K - 1] = guided;
      // 2. Each kept period again at 16 kHz, over the whole band: this is the strength the harmonics-to-noise ratio is read from.
      // Read over about three periods around the centre (not the whole 40 ms): a pitch that is moving (vibrato) would
      // otherwise look less periodic than it is.
      let any = false;
      for (let q = 0; q < kept.length; q++) {
        const cand = kept[q], mid = Math.max(REFINE + SINC_DEPTH + 1, Math.round(cand.lag * DEC)), lo = mid - REFINE - SINC_DEPTH;
        const wr = Math.min(WIN, Math.max(T.REFINE_MIN_SAMPLES, Math.round(T.REFINE_PERIODS * mid))), sr = c - ((wr + mid) >> 1), e16 = sq[sr + wr] - sq[sr];
        const nccf = lag => { let x = 0; const b = sr + lag; for (let i = 0; i < wr; i++) x += w[sr + i] * w[b + i]; const e = sq[b + wr] - sq[b]; return e > 0 && e16 > 0 ? x / Math.sqrt(e16 * e) : 0; };
        fineR.fill(NaN);
        const at16 = lag => { const i = lag - lo; return fineR[i] === fineR[i] ? fineR[i] : (fineR[i] = nccf(lag)); };
        let top = mid, tv = at16(mid); for (let lag = mid - REFINE; lag <= mid + REFINE; lag++) { const v = at16(lag); if (v > tv) { tv = v; top = lag; } }
        const fine = j => {                            // value at top + j/8: windowed sinc over the whole-lag values
          if (!j) return at16(top);
          const base = j < 0 ? top - 1 : top, row = SINC[j < 0 ? j + SINC_STEPS : j];
          let v = 0; for (let t = 0; t < SINC_DEPTH * 2; t++) v += at16(base - SINC_DEPTH + 1 + t) * row[t];
          return v;
        };
        let bj = 0, bv = tv; const half = SINC_STEPS / 2;
        for (let j = -half; j <= half; j++) { if (!j) continue; const v = fine(j); if (v > bv) { bv = v; bj = j; } }
        const p0 = bj > -half ? fine(bj - 1) : bv, p1 = bj < half ? fine(bj + 1) : bv, d = p0 - 2 * bv + p1, off = d < 0 ? 0.5 * (p0 - p1) / d : 0;
        const r = Math.min(0.9999, bv - 0.25 * (p0 - p1) * off), lag = top + (bj + off) / SINC_STEPS;
        if (r < T.VOICED_MIN_STRENGTH || lag < LAG_MIN || lag > LAG_MAX) continue;
        const h = cand.lag / 2, hi = Math.floor(h), i = f * K + q;
        // Which candidate is the voice is scored on the whole band (a bass line lives below 1 kHz; the voice does not).
        cSt[i] = semitone(SR / lag); cR[i] = r; cLow[i] = cand.low; cScore[i] = r - T.OCTAVE_COST * Math.log2(lag / LAG_MIN); cNear[i] = cand.near;
        cHalf[i] = hi >= CLAG_MIN - 1 ? coarse[hi] + (coarse[hi + 1] - coarse[hi]) * (h - hi) : 0;
        any = true;
      }
      if (!any) continue;
      // 3. Spectrum of a frame that has a voiced candidate (32 ms Hann window around the centre).
      const a = c - NFFT / 2; let dc = 0; for (let i = 0; i < NFFT; i++) dc += w[a + i]; dc /= NFFT;
      for (let i = 0; i < NFFT; i++) { re[i] = (w[a + i] - dc) * HANN[i]; im[i] = 0; }
      fft(re, im);
      for (let q = 0; q <= NFFT / 2; q++) power[q] = re[q] * re[q] + im[q] * im[q];
      let num = 0, den = 0; for (let q = cLo; q <= cHi; q++) { const m = Math.sqrt(power[q]); num += m * q; den += m; }
      centroid[f] = den > 0 ? num / den * BIN_HZ : 0;
      let eLow = 0, eHigh = 0; for (let q = lowA; q < lowB; q++) eLow += power[q]; for (let q = lowB; q < highB; q++) eHigh += power[q];
      ratio[f] = 10 * Math.log10((eHigh + 1e-12) / (eLow + 1e-12));
      for (let b = 0; b < OCT; b++) { let e = 0; for (let q = tiltBins[b]; q < tiltBins[b + 1]; q++) e += power[q]; octaves[f * OCT + b] = 10 * Math.log10(e + 1e-12); }
    }
    // Keep only the tail the next frame needs.
    const keep = Math.max(g0, next * HOP - PRE);
    if (keep > g0) { w = w.slice(keep - g0); g0 = keep; }
  }
  /** Mono samples at 16 kHz (Float32Array). */
  function push(block) {
    for (let i = 0; i < block.length; i++) {
      const v = block[i]; accE += v * v; if ((v >= 0) !== (last >= 0)) accZ++; last = v;
      if (++accN === BIN) { binE.push(accE / BIN); binZ.push(accZ); accE = 0; accZ = 0; accN = 0; }
    }
    const joined = new Float32Array(w.length + block.length); joined.set(w); joined.set(block, w.length); w = joined; total += block.length;
    frames(false);
  }
  function finish() {
    if (accN) { binE.push(accE / accN); binZ.push(accZ); accN = 0; }
    const padded = new Float32Array(w.length + POST); padded.set(w); w = padded;   // zeros after the end
    frames(true);
    w = null;
    return summarize({frames:next, cSt, cR, cLow, cHalf, cScore, cNear, centroid, ratio, octaves, binE, binZ, total, guided:!!gCurve, limitHz});
  }
  return {push, finish, get seconds() { return total / SR; }};
}

/** 16 kHz → 8 kHz in pieces (low-pass at 3.6 kHz, then every second sample): the rate app/mr-cancel.js works at. */
function createHalver() {
  const H = 15, h = new Float64Array(2 * H + 1), fc = 3600 / SR; let sum = 0;
  for (let k = 0; k < h.length; k++) { const d = k - H; h[k] = (d ? Math.sin(2 * Math.PI * fc * d) / (Math.PI * d) : 2 * fc) * (0.54 + 0.46 * Math.cos(Math.PI * d / H)); sum += h[k]; }
  for (let k = 0; k < h.length; k++) h[k] /= sum;
  let tail = new Float32Array(H), start = -H;        // tail[0] is sample `start` of the input (zeros before 0)
  const run = (x, final) => {
    const joined = new Float32Array(tail.length + x.length + (final ? H : 0)); joined.set(tail); joined.set(x, tail.length);
    const end = start + joined.length, first = Math.max(0, start + H + ((start + H) & 1)), out = new Float32Array(Math.max(0, Math.ceil((end - H - first) / 2)));
    for (let g = first, o = 0; g + H < end; g += 2, o++) { let v = 0; const a = g - H - start; for (let k = 0; k <= 2 * H; k++) v += h[k] * joined[a + k]; out[o] = v; }
    const next = first + out.length * 2, keep = Math.max(0, next - H - start);
    tail = joined.slice(keep); start += keep;
    return out;
  };
  return {push:x => run(x, false), finish:() => run(new Float32Array(0), true)};
}

/** Whole samples at once (tests, small files): the same stream, fed 30 s at a time. */
function analyze(input, sampleRate, {guide = null, onProgress = null, limitHz = 0} = {}) {
  const x = resample(input, sampleRate, SR), stream = createStream({guide, limitHz:limitHz || (sampleRate < SR ? Math.round(sampleRate * 0.45) : 0)}), step = 30 * SR;
  for (let a = 0; a < x.length; a += step) { stream.push(x.subarray(a, Math.min(x.length, a + step))); onProgress?.(Math.min(1, (a + step) / x.length) * 0.95); }
  const out = stream.finish(); onProgress?.(1);
  return out;
}

/** Everything after the frames: which candidate is the voice, gate, runs, 전환 · 이어짐 · 시작, zones, summaries. */
function summarize({frames, cSt, cR, cLow, cHalf, cScore, cNear, centroid, ratio, octaves, binE, binZ, total, guided, limitHz}) {
  const K = T.CANDIDATES, OCT = T.TILT_BANDS_HZ.length - 1, n = total, seconds = n / SR, bins = binE.length;
  const spanDb = (a, b) => { let e = 0, c = 0; for (let k = Math.max(0, a); k < Math.min(bins, b); k++) { e += binE[k]; c++; } return c ? db(e / c) : -120; };
  // Levels of a frame: 20 ms around its centre (fast) and 40 ms (level).
  const fast = new Float32Array(frames), level = new Float32Array(frames), heard = [];
  for (let f = 0; f < frames; f++) { const k = f * BINS_PER_FRAME; fast[f] = spanDb(k - 1, k + 1); level[f] = spanDb(k - 2, k + 2); if (fast[f] > -100) heard.push(fast[f]); }
  const loud = heard.length ? quantile(heard, 0.95) : -120, floor = loud - T.LEVEL_GATE_DB;   // quieter than floor = silence
  /** The candidate of frame f that is the voice, among those inside [lo, hi] semitones (−1: none). Highest score
   * (periodic, the shorter period preferred); with a guide, the guide's pitch when it is nearly as periodic — unless
   * the best one is a whole fraction of that period and just as periodic (sound that repeats every T/2 also repeats
   * every T, so the shorter period is the real one: the voice flipped up; a guide may fold such moments back down). */
  const choose = (f, lo, hi) => {
    let best = -1, near = -1;
    for (let q = 0; q < K; q++) { const i = f * K + q, s = cSt[i]; if (s !== s || s < lo || s > hi) continue; if (best < 0 || cScore[i] > cScore[best]) best = i; if (cNear[i] && (near < 0 || cR[i] > cR[near])) near = i; }
    if (best < 0 || near < 0 || near === best) return best;
    const k = 2 ** ((cSt[best] - cSt[near]) / 12), upper = k > 1.5 && Math.abs(k - Math.round(k)) <= T.GUIDE_FRACTION_SLACK * Math.round(k) && cR[best] >= cR[near] - T.GUIDE_FRACTION_MARGIN;
    return !upper && cR[near] >= cR[best] * T.GUIDE_KEEP_RATIO ? near : best;
  };
  // First pass: any pitch. The take's main band is then read from the louder half of what was found (the voice is
  // on top where it sings), and the second pass keeps only candidates from BAND_MARGIN below that band to
  // BAND_MARGIN_ABOVE over it — a bass line or anything else far outside the voice is not followed; such frames
  // count as unvoiced.
  const pick = new Int32Array(frames).fill(-1); let voiced1 = 0;
  for (let f = 0; f < frames; f++) if (fast[f] >= floor) { pick[f] = choose(f, -Infinity, Infinity); if (pick[f] >= 0) voiced1++; }
  let band = null, outside = 0;
  if (voiced1 >= T.BAND_MIN_SECONDS * FPS) {
    const lv = []; for (let f = 0; f < frames; f++) if (pick[f] >= 0) lv.push(level[f]);
    const cut = median(lv), strong = []; for (let f = 0; f < frames; f++) if (pick[f] >= 0 && level[f] >= cut) strong.push(cSt[pick[f]]);
    const lo = quantile(strong, T.BAND_PERCENTILES[0] / 100), hi = quantile(strong, T.BAND_PERCENTILES[1] / 100);
    band = {low:lo, high:hi};
    // Sound outside the band counts against the take only when it is about as loud as the singing: an accompaniment
    // heard on its own, well under the voice (an intro, the gaps between phrases), is simply not read.
    const inLevel = []; for (let f = 0; f < frames; f++) if (pick[f] >= 0) { const s = cSt[pick[f]]; if (s >= lo - T.BAND_MARGIN_SEMITONES && s <= hi + T.BAND_MARGIN_ABOVE) inLevel.push(level[f]); }
    const near = (inLevel.length ? median(inLevel) : cut) - T.OUTSIDE_LOUD_DB;
    for (let f = 0; f < frames; f++) if (pick[f] >= 0) { const s = cSt[pick[f]]; if (s < lo - T.BAND_MARGIN_SEMITONES || s > hi + T.BAND_MARGIN_ABOVE) { if (level[f] >= near) outside++; pick[f] = choose(f, lo - T.BAND_MARGIN_SEMITONES, hi + T.BAND_MARGIN_ABOVE); } }
  }
  const st = new Float32Array(frames).fill(NaN), strength = new Float32Array(frames), margin = new Float32Array(frames), tilt = new Float32Array(frames).fill(NaN);
  const top = limitHz ? T.TILT_BANDS_HZ.findIndex(hz => hz > limitHz * 1.12) - 1 : OCT, lastBand = top < 0 ? OCT : Math.min(OCT, top);   // octave bands that hold sound
  for (let f = 0; f < frames; f++) {
    const i = pick[f]; if (i < 0) continue;
    st[f] = cSt[i]; strength[f] = cR[i]; margin[f] = cLow[i] - cHalf[i];   // margin: how much less periodic the octave above is (below 1.6 kHz)
    // Spectral tilt: level of the octave bands from the one holding the fundamental upward, dB per octave.
    const hz = 440 * 2 ** ((st[f] - 69) / 12); let first = 0; while (first < lastBand - 3 && T.TILT_BANDS_HZ[first + 1] <= hz) first++;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let b = first; b < lastBand; b++) { const y = octaves[f * OCT + b]; sx += b; sy += y; sxx += b * b; sxy += b * y; m++; }
    const dd = m * sxx - sx * sx; tilt[f] = dd ? (m * sxy - sx * sy) / dd : NaN;
  }
  let glitches = 0;
  // Single-frame glitches (one frame far from two agreeing neighbours) are tracker errors, not flips.
  for (let f = 1; f < frames - 1; f++) {
    const a = st[f - 1], b = st[f], c = st[f + 1];
    if (a === a && b === b && c === c && Math.abs(b - a) > T.GLITCH_SEMITONES && Math.abs(b - c) > T.GLITCH_SEMITONES && Math.abs(a - c) < 1) { st[f] = (a + c) / 2; margin[f] = (margin[f - 1] + margin[f + 1]) / 2; glitches++; }
  }
  // Voiced runs; very short islands are dropped.
  const runs = [], minRun = Math.max(1, Math.round(T.MIN_VOICED_RUN_MS / MS)), REF = Math.max(1, Math.round(T.REFERENCE_MS / MS));
  for (let f = 0; f < frames;) {
    if (st[f] !== st[f]) { f++; continue; }
    const s = f; while (f < frames && st[f] === st[f]) f++;
    if (f - s >= minRun) runs.push([s, f]); else for (let k = s; k < f; k++) st[k] = NaN;
  }
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
    const before = edge(Math.max(a0, a1 - REF), a1), after = edge(c0, Math.min(c1, c0 + REF));
    if (Math.abs(before - after) > T.BREAK_PITCH_SEMITONES) continue;
    const k0 = a1 * BINS_PER_FRAME, k1 = Math.min(bins, c0 * BINS_PER_FRAME); let zc = 0; for (let k = k0; k < k1; k++) zc += binZ[k];
    const gapLevel = spanDb(k0, k1), noisy = zc / Math.max(1, (k1 - k0) * BIN) >= T.BREAK_NOISY_ZCR && gapLevel >= loud - T.LEVEL_GATE_DB - 10;
    breaks.push({t:round(a1 / FPS, 2), ms:Math.round(gapMs), kind:noisy ? 'noisy' : 'quiet', semitone:round(before, 1), dropDb:round((level[a1 - 1] + level[c0]) / 2 - gapLevel, 1)});
    zones[zoneOf(before)].breaks++; bandOf(before).breaks++;
  }
  /* 전환 · 뒤집힘: a jump away from the pitch just before it that comes back */
  const flips = [], flipMin = Math.round(T.FLIP_MIN_MS / MS), flipMax = Math.round(T.FLIP_MAX_MS / MS), octMax = Math.round(T.OCTAVE_FLIP_MAX_MS / MS);
  const inFlip = new Uint8Array(frames); let ambiguous = 0;
  for (const [a, b] of runs) {
    for (let f = a + 2; f < b;) {
      const ref = [], refAt = []; for (let k = f - 1; k >= a && ref.length < REF; k--) if (!inFlip[k]) { ref.push(st[k]); refAt.push(k); }   // the pitch just before, not counting an earlier flip
      const pre = ref.length ? median(ref) : st[f];
      if (Math.abs(st[f] - pre) <= T.FLIP_MIN_SEMITONES) { f++; continue; }
      let j = f; while (j < b && j - f <= octMax && Math.abs(st[j] - pre) > T.FLIP_RETURN_SEMITONES) j++;
      const len = j - f, back = j < b && Math.abs(st[j] - pre) <= T.FLIP_RETURN_SEMITONES;
      const away = []; for (let k = f; k < j; k++) away.push(st[k] - pre);
      const size = median(away), octave = Math.abs(size) >= T.OCTAVE_FLIP_LOW && Math.abs(size) <= T.OCTAVE_FLIP_HIGH;
      if (back && len >= flipMin && (len <= flipMax || octave)) {
        // An octave apart, the two readings are the same sound when the octave above is nearly as periodic as the one
        // below: then the tracker merely hesitated. A real flip shows the upper octave clearly LESS periodic on the
        // lower-pitched side (before and after an upward flip; inside a downward one).
        let real = true;
        if (octave) {
          const lower = []; if (size > 0) { for (const k of refAt) lower.push(margin[k]); for (let k = j; k < Math.min(b, j + REF); k++) lower.push(margin[k]); } else for (let k = f; k < j; k++) lower.push(margin[k]);
          real = median(lower) >= T.OCTAVE_FLIP_MARGIN;
        }
        if (real) { flips.push({t:round(f / FPS, 2), ms:Math.round(len * MS), kind:len <= flipMax ? 'short' : 'octave', semitones:round(size, 1), semitone:round(pre, 1)}); zones[zoneOf(pre)].flips++; bandOf(pre).flips++; }
        else ambiguous++;
        for (let k = f; k < j; k++) inFlip[k] = 1;
        f = j;
      } else f += REF;                                // a leap that stayed: melody. Skip past it.
    }
  }

  /* 이어짐: sustained notes */
  const notes = [], half = Math.round(T.SUSTAIN_SMOOTH_MS / MS / 2), minNote = Math.round(T.SUSTAIN_MIN_S * FPS), trim = Math.round(T.SUSTAIN_TRIM_MS / MS), bandWidth = T.SUSTAIN_BAND_CENTS * 2 / 100;
  for (const [a, b] of runs) {
    if (b - a < minNote) continue;
    const sm = new Float32Array(b - a);
    for (let f = a; f < b; f++) { let s = 0, c = 0; for (let k = Math.max(a, f - half); k <= Math.min(b - 1, f + half); k++) { s += st[k]; c++; } sm[f - a] = s / c; }
    // The longest stretch from s whose smoothed pitch stays inside the band; too short → try from the next frame.
    for (let s = 0; s < sm.length;) {
      let e = s + 1, mn = sm[s], mx = sm[s];
      for (; e < sm.length; e++) { const v = sm[e], lo2 = Math.min(mn, v), hi2 = Math.max(mx, v); if (hi2 - lo2 > bandWidth) break; mn = lo2; mx = hi2; }
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

  /* 시작: phrase onsets (levels read every 10 ms, pitch every 20 ms) */
  const onsets = [], B = BINS_PER_FRAME, quiet = Math.round(T.ONSET_SILENCE_MS / MS), need = Math.round(T.ONSET_MIN_RUN_MS / MS), set0 = Math.round(T.ONSET_SETTLE_MS[0] / MS), set1 = Math.round(T.ONSET_SETTLE_MS[1] / MS), look = Math.round(T.ONSET_LOOKBACK_MS / BIN_MS), over = Math.round(T.ONSET_OVERSHOOT_MS / MS);
  const binDb = k => k >= 0 && k < bins ? db(binE[k]) : -120;
  for (let i = 0; i < runs.length; i++) {
    const [a, b] = runs[i], prevEnd = i ? runs[i - 1][1] : -quiet;
    if (a - prevEnd < quiet || b - a < need) continue;
    const lv = [], ps = []; for (let f = a + set0; f < Math.min(b, a + set1); f++) { lv.push(binDb(f * B), binDb(f * B + 1)); ps.push(st[f]); }
    const settled = median(lv), pitch = median(ps), from = Math.max(0, prevEnd * B + 1, a * B - look), to = (a + set0) * B;
    let up = to; for (let k = from; k <= to; k++) if (binDb(k) >= settled - T.ONSET_RISE_DB[1]) { up = k; break; }
    let down = -1; for (let k = up; k >= from; k--) if (binDb(k) <= settled - T.ONSET_RISE_DB[0]) { down = k; break; }
    if (down < 0) continue;                           // never quiet enough before it: the attack cannot be timed
    let peak = -Infinity; for (let f = a; f < Math.min(b, a + over); f++) peak = Math.max(peak, (st[f] - pitch) * 100);
    const attackMs = (up - down) * BIN_MS;
    onsets.push({t:round(a / FPS, 2), attackMs:Math.round(attackMs), overshootCents:Math.round(peak), hard:attackMs <= T.HARD_ATTACK_MS && peak >= T.HARD_OVERSHOOT_CENTS, semitone:round(pitch, 1)});
  }

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
    confidence:{pitchSource:guided ? 'guide+autocorrelation' : 'autocorrelation', meanStrength:round(mean(strengths), 3), voicedShare:seconds ? Math.round(voicedSeconds / seconds * 100) : 0,
      glitchFramesSmoothed:glitches, glitchShare:voicedFrames ? round(glitches / voicedFrames, 4) : null, outsideBandShare:voiced1 ? round(outside / voiced1, 4) : null,
      mainBand:band ? {low:round(band.low, 1), high:round(band.high, 1)} : null, octaveHesitations:ambiguous, jumpsPerMin:minutes > 0 ? round((flips.length + ambiguous + glitches) / minutes, 1) : null,
      flatNoteShare:notes.length ? round(notes.filter(x => x.pitchSdRawCents < T.MIXED_FLAT_NOTE_CENTS).length / notes.length, 2) : null, levelGateDb:round(floor, 1), bandwidthHz:limitHz || SR / 2},
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

/* ---------- can this take be measured at all? ---------- */
/**
 * A take whose sound is voice only (clean) is always measured. A take with an accompaniment is measured only when
 * THIS reading of THIS audio shows the voice clearly on top: periodic enough, few tracker glitches, few sudden
 * pitch jumps, held notes that move like a voice (not dead flat like an instrument), and little loud sound far
 * outside the take's main band (a bass line read as voice). Otherwise nothing is shown for it.
 * @returns {{ok:boolean, why:string}}
 */
function measurable(result, clean) {
  if (!result?.voicedSeconds) return {ok:false, why:'no-voice'};
  if (clean) return {ok:true, why:'voice-only'};
  const c = result.confidence;
  if ((c.outsideBandShare ?? 0) > T.MIXED_MAX_OUTSIDE_SHARE) return {ok:false, why:'follows-accompaniment'};
  if ((c.meanStrength ?? 0) < T.MIXED_MIN_STRENGTH) return {ok:false, why:'weak-pitch'};
  if ((c.glitchShare ?? 0) > T.MIXED_MAX_GLITCH_SHARE) return {ok:false, why:'many-glitches'};
  if ((c.jumpsPerMin ?? 0) > T.MIXED_MAX_JUMPS_PER_MIN) return {ok:false, why:'pitch-jumps'};
  if ((c.flatNoteShare ?? 0) > T.MIXED_MAX_FLAT_NOTE_SHARE) return {ok:false, why:'instrument-like'};
  return {ok:true, why:'mixed-voice-on-top'};
}
const REFUSED_NOTE = '반주가 목소리만큼 크게 들어가 있어 이 녹음은 잴 수 없어요. 이어폰을 끼고 녹음한 것(목소리만 들어간 것)으로 비교해 주세요.';

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
  if (!base || !comp) return [];
  const rows = [];
  const voiced = base.voicedSeconds >= T.MIN_VOICED_SECONDS && comp.voicedSeconds >= T.MIN_VOICED_SECONDS;
  const add = (id, group, title, {a, b, aText, bText, ok, okWhy = '표본 부족', tol, down, up, same, measurable = true, band = true}) => {
    const row = {id, group, title, base:aText, comp:bText, baseValue:a ?? null, compValue:b ?? null};
    if (!measurable) Object.assign(row, {state:'hold', marker:'잴 수 없음', line:UNCLEAN_NOTE});
    else if (!band) Object.assign(row, {state:'hold', marker:'잴 수 없음', line:BAND_NOTE});
    else if (!ok || a == null || b == null) Object.assign(row, {state:'hold', marker:okWhy, line:okWhy === '표본 부족' ? '비교할 만큼 소리가 모이지 않았어요' : okWhy});
    else if (Math.abs(b - a) <= Math.max(tol, T.SIMILAR_RELATIVE * Math.max(Math.abs(a), Math.abs(b)))) Object.assign(row, {state:'similar', marker:'비슷함', line:same});
    else Object.assign(row, {state:'different', marker:'다름', line:b < a ? down : up});
    rows.push(row);
  };
  const S = T.SIMILAR, tr = x => x.transitions, su = x => x.sustain;
  const clean = !!base.resonance && !!comp.resonance;   // gate() takes resonance out of a take that is not voice only
  // 울림 is read up to 8 kHz in a take as recorded and up to 3.6 kHz in a voice left after taking the MR out: not the same thing.
  const sameBand = base.confidence?.bandwidthHz === comp.confidence?.bandwidthHz;
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
  add('zoneSpread', '울림', '음역에 따라 울림이 달라지는 정도', {a:base.resonance?.change.ratioDb.spread, b:comp.resonance?.change.ratioDb.spread, measurable:clean, band:sameBand, tol:S.zoneSpreadDb,
    ok:clean && base.resonance.change.ratioDb.spread != null && comp.resonance.change.ratioDb.spread != null, aText:spreadText(base), bText:spreadText(comp),
    down:'음역에 따라 울림이 달라지는 정도가 줄었어요', up:'음역에 따라 울림이 달라지는 정도가 커졌어요', same:'음역에 따라 울림이 달라지는 정도가 비슷해요'});
  const brightText = x => !x.resonance ? '—' : num(x.resonance.ratioDb) + ' dB · 중심 ' + num(x.resonance.centroidHz, 0) + ' Hz · 기울기 ' + num(x.resonance.tiltDbPerOct) + ' dB/옥타브';
  add('brightness', '울림', '2–4 kHz 쪽 소리의 크기', {a:base.resonance?.ratioDb, b:comp.resonance?.ratioDb, measurable:clean, band:sameBand, ok:clean && voiced, tol:S.ratioDb, aText:brightText(base), bText:brightText(comp),
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
const BAND_NOTE = '한쪽만 곡 MR을 빼고 재서 울림은 나란히 볼 수 없어요';
/** One take's own values in the same rows, with nothing said about the other side (it is still being measured, or
 * cannot be measured): no 비슷함 / 다름 and no direction. side: 'base' | 'comp'. */
function alone(result, side, {marker, line, other}) {
  return compare(result, result).map(r => ({id:r.id, group:r.group, title:r.title, base:side === 'base' ? r.base : other, comp:side === 'comp' ? r.comp : other,
    baseValue:side === 'base' ? r.baseValue : null, compValue:side === 'comp' ? r.compValue : null, state:'alone', marker, line}));
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
 * takes: [{role:'base'|'comp', date, result (the reading that is shown, un-gated), clean:{clean, why},
 *   source:'mr-removed'|'clean'|'mixed', measurable:{ok, why}, stored, reliable,
 *   mr:{removedDb, offsetSeconds, speed, score}|null, mrTries:[{ok, reason, removedDb}], mixed (the reading of the
 *   file as recorded, when the shown one is the voice left after the MR), stagesMs, fromDeviceCache,
 *   mrMode:'auto'|'chosen'|'none'|null (this take's own MR choice; null when the song has no MR file)}]
 * Holds no id (recording, song or MR track), title, song or file name, no day of the month and no audio.
 */
function diagnosis(takes, {generatedMonth = null, fileLoads = []} = {}) {
  const n = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const load = d => ({code:['network','http','resolve-timeout','idle-timeout','total-timeout','size','processing-timeout','recovered'].includes(d.code)?d.code:'unknown',
    stage:['source','headers','body','decode','mr-mono'].includes(d.stage)?d.stage:'unknown',
    attempt:d.attempt===1||d.attempt===2?d.attempt:null,status:Number.isInteger(d.status)&&d.status>=100&&d.status<=599?d.status:null,bytes:n(d.bytes)});
  const alignment = d => ({stage:['coarse','fine','validation'].includes(d.stage)?d.stage:'unknown', score:n(d.score),
    offsetSeconds:n(d.offsetSeconds),speed:n(d.speed),windows:n(d.windows),phasePeak:n(d.phasePeak),errorSamples:n(d.errorSamples)});
  const shown = t => gate(t.result, t.clean.clean);
  const out = takes.map(t => {
    const r = shown(t);
    return {role:t.role, month:monthOf(t.date), source:t.source, clean:t.clean.clean, cleanWhy:t.clean.why, measurable:!!t.measurable?.ok, measurableWhy:t.measurable?.why ?? null,
      storedAnalysis:storedNumbers(t.stored, t.reliable),
      mrMode:['auto', 'chosen', 'none'].includes(t.mrMode) ? t.mrMode : null,
      mrRemoval:t.mr ? {removedDb:n(t.mr.removedDb), offsetSeconds:n(t.mr.offsetSeconds), speed:n(t.mr.speed), score:n(t.mr.score),
        ...(t.mr.method === 'local' ? {method:'local',coverage:n(t.mr.coverage),localWindows:n(t.mr.localWindows),phasePeak:n(t.mr.phasePeak)} : {})} : null,
      mrTries:(t.mrTries || []).map(x => ({ok:!!x.ok, reason:x.ok ? null : String(x.reason || ''), removedDb:n(x.removedDb),...(x.loadFailure?{loadFailure:load(x.loadFailure)}:{}),...(x.alignment?{alignment:alignment(x.alignment)}:{})})),
      asRecorded:t.mixed ? {voicedSeconds:t.mixed.voicedSeconds, confidence:t.mixed.confidence, breaksPerMin:t.mixed.transitions.breaksPerMin, flipsPerMin:t.mixed.transitions.flipsPerMin} : null,
      stagesMs:t.stagesMs ? Object.fromEntries(Object.entries(t.stagesMs).map(([k, v]) => [k, n(v)])) : null, fromDeviceCache:!!t.fromDeviceCache,
      modelVersion:r.version, durationSeconds:r.seconds, voicedSeconds:r.voicedSeconds, confidence:r.confidence, range:r.range,
      transitions:r.transitions, sustain:r.sustain, resonance:r.resonance, breath:r.breath, onsets:r.onsets,
      coverage:Object.fromEntries(Object.entries(r.zones).map(([k, z]) => [k, {seconds:z.seconds, enough:z.enough}])), zones:r.zones, semitoneBands:r.bands};
  });
  // No comparison unless both takes can be measured.
  const both = out.length === 2 && takes.every(t => t.measurable?.ok);
  const pair = both ? compare(shown(takes[0]), shown(takes[1])).map(({id, state, baseValue, compValue}) => ({trace:id, state, base:baseValue, comp:compValue})) : null;
  return {kind:'vocalzip-voice-path-diagnosis', format:2, modelVersion:VERSION, generatedMonth, note:'numbers only: no ids, titles, song names, file names, days or audio', thresholds:T, takes:out, comparison:pair,
    ...(fileLoads.length?{fileLoads:fileLoads.slice(-24).map(d=>({role:['base','comp'].includes(d.role)?d.role:null,kind:['mr','recording'].includes(d.kind)?d.kind:null,...load(d)}))}:{})};
}

const api = {VERSION, THRESHOLDS:T, analyze, createStream, createHalver, measurable, REFUSED_NOTE, BAND_NOTE, alone, resample, cleanOf, CLEAN_TEXT, UNCLEAN_NOTE, gate, compare, diagnosis, monthOf, noteName, ZONE_LABEL};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.VzipVoicePath = api;
})(typeof self !== 'undefined' ? self : this);
