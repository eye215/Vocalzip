/* VOCAL.zip 성장 리포트 v2 — separated growth measures, never the instant highest note.
 * Pure functions (also loaded by the Node tests): every screen (성장 탭, 곡 카드, 보컬 연구소, AI 입력) asks this
 * module, so the rules below hold everywhere.
 *
 *   intonation (음정 정확도)  cents from the nearest semitone — NOT a right-note check. When both compared takes have a
 *                             saved note-level score comparison (음표 단위 악보 비교, app/score-align-model.js) for the same
 *                             score version, part and key, the share of the same score notes sung within ±50 cent is
 *                             shown as its basis ("악보 기준 맞은 음 비율 A% → B%"). The verdict itself is unchanged.
 *   stability  (음정 안정성)  wobble of sustained notes (≥ 0.5 s, vibrato removed). Kept separate from accuracy.
 *   range      (음역 확장)    안정 최고음 + 주 가창 음역 (v2). Exact semitones of the named notes. Shown as a neutral
 *                             change only: never "better/worse", never 순간 최고음.
 *   phrase     (호흡 유지)    durations of the SAME phrases in two takes of a song (matched by position + pitch,
 *                             tempo difference corrected). No match → 판정 보류.
 *   high       (고음 안정성)  wobble and hold time of sustained notes in the same high zone of both takes.
 *   passaggio  (파사지오)     where sustained-note wobble jumps by pitch. Reference only: pitch data alone cannot
 *                             identify a passaggio — the teacher decides.
 * Judgement is withheld (판정 보류) for low confidence, too little data, mixed v1/v2, same-day pairs, missing v2
 * detail, a different key or zone. v1 results stay readable; v2-only measures skip them. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipGrowthMetrics = api; })(typeof self !== 'undefined' ? self : globalThis, () => {
'use strict';
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = midi => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
/** MIDI number of a cents value (MIDI × 100) — the same rounding as the note names the analysis shows. */
const midiOf = cents => Number.isFinite(Number(cents)) && cents !== null && cents !== '' ? Math.round(Number(cents) / 100) : null;
/** Exact semitone difference of two named notes (A#5 → F#5 = −4), from cents or MIDI. */
const semitones = (fromCents, toCents) => { const a = midiOf(fromCents), b = midiOf(toCents); return a == null || b == null ? null : b - a; };
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const r1 = v => v == null ? null : Math.round(v * 10) / 10;
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const RULES = {
  minIntonationNotes:5, minStabilityNotes:3,
  // A change smaller than max(floor, rel × before) is "비슷함".
  intonation:{floor:3, rel:.10}, stability:{floor:2, rel:.10}, phrase:{floor:.3, rel:.10},
  highWobble:{floor:2, rel:.10}, highHeld:{floor:.15, rel:.15},
  match:{minPairs:3, startTol:2.5, startRel:.04, midiTol:1, minSeconds:.5, tempo:[.85, 1.15]},
  high:{belowScoreTop:2, minNotes:2},
  keyShift:2,
  scoreNotes:8,       // common score notes judged in both takes before 악보 기준 맞은 음 비율 is shown
  passaggio:{minBands:4, ratio:1.5, plus:4}
};

const METRICS = [
  {id:'intonation', title:'음정 정확도', unit:'cent', direction:-1, judged:true, help:'into',
    method:'가장 가까운 반음과의 평균 음정 오차(cent)로 재요. 이 값만으로는 맞는 음을 불렀는지는 판단하지 않아요. 두 녹음 모두 음표 단위 악보 비교를 저장했다면 악보 기준 맞은 음 비율을 근거로 함께 보여요.',
    practice:'기준음을 듣고 편안한 음역의 짧은 구간을 천천히 따라 부르기', minutes:10},
  {id:'stability', title:'음정 안정성', unit:'cent', direction:-1, judged:true, help:'wob',
    method:'0.5초 넘게 지속한 음에서 비브라토를 뺀 피치 흔들림이에요. 음정 정확도와 따로 봐요.',
    practice:'편안한 음에서 5초 지속음을 같은 조건으로 녹음하기', minutes:8},
  {id:'range', title:'음역 확장', unit:'반음', direction:0, judged:false, help:'range',
    method:'안정 최고음(0.5초 이상, 흔들림 작음)과 주 가창 음역(노래한 시간의 10~90%)의 변화예요. 순간 최고음은 쓰지 않고, 좋고 나쁨을 판정하지 않아요.',
    practice:'편안한 음역 끝에서 무리 없이 짧게 머무는 연습', minutes:5},
  {id:'phrase', title:'호흡 유지', unit:'초', direction:1, judged:true, help:'phr',
    method:'같은 곡의 같은(위치·음높이가 비슷한) 프레이즈끼리 지속시간을 비교하고 템포 차이는 보정해요. 같은 프레이즈를 찾지 못하면 판정을 보류해요.',
    practice:'한 프레이즈를 무리 없는 호흡으로 끝까지 연결해 부르기', minutes:8},
  {id:'high', title:'고음 안정성', unit:'cent', direction:-1, judged:true, help:'high',
    method:'두 녹음의 같은 고음 구간에서 지속음의 흔들림과 유지시간을 함께 비교해요.',
    practice:'곡의 고음 구간을 편한 세기로 짧게 유지하며 같은 조건으로 다시 녹음하기', minutes:6},
  {id:'passaggio', title:'파사지오(전환 구간)', unit:'cent', direction:0, judged:false, reference:true, help:'pass',
    method:'음높이별 지속음 흔들림에서 흔들림이 커지는 음역대를 찾아 보여 줘요. 음정 데이터만으로 판별 불가, 선생님 판단 참고.',
    practice:'', minutes:0}
];
const byId = Object.fromEntries(METRICS.map(m => [m.id, m]));

const HOLD = {
  'no-data':'측정값이 없어요',
  'no-pair':'같은 곡을 다른 날 다시 부른 녹음이 필요해요',
  'same-day':'같은 날 녹음끼리는 변화로 보지 않아요',
  'version-mixed':'분석 버전(v1·v2)이 달라 판정 보류 · 이전 녹음을 다시 분석하면 비교할 수 있어요',
  'v1':'이전 분석(v1) 결과라 이 지표는 계산하지 않아요 · 다시 분석하면 확인할 수 있어요',
  'reanalyze':'세부 측정(프레이즈·음높이별)이 없는 분석이에요 · 다시 분석하면 확인할 수 있어요',
  'confidence':'측정 신뢰도가 낮아 판정 보류',
  'few-notes':'측정한 음이 적어 판정 보류',
  'few-phrases':'같은 프레이즈를 3개 이상 찾지 못해 판정 보류',
  'tempo':'템포 차이가 커서 판정 보류',
  'key-shift':'주 가창 음역 전체가 옮겨져 키가 달랐을 수 있어 판정 보류',
  'no-stable':'안정 최고음이 없어 판정 보류',
  'few-high':'같은 고음 구간에서 지속한 음이 적어 판정 보류',
  'few-bands':'여러 음높이의 지속음이 부족해 판정 보류'
};
const holdText = reason => HOLD[reason] || '판정 보류';
const STATE = {better:'좋아진 방향', worse:'아쉬운 방향', similar:'비슷함', mixed:'변화 혼재', changed:'변화 관찰', hold:'판정 보류', reference:'참고'};

/* ---------- one analysis ---------- */
const metricsOf = a => a?.metrics || null;
const hasDetail = a => !!(a?.v >= 2 && Array.isArray(a.metrics?.phrases?.rows) && Array.isArray(a.metrics?.pitchBands?.rows));
const versionOf = a => a?.v ?? null;
function value(a, id) {
  const m = metricsOf(a); if (!m) return null;
  if (id === 'intonation') return num(m.intonation?.meanAbsCents);
  if (id === 'stability') return num(m.stability?.wobbleCents);
  if (id === 'phrase') return num(m.breath?.medianPhrase);
  if (id === 'range') return a.v >= 2 ? num(m.range?.stableHigh?.cents) : null;
  return null;
}
/** Whether one take can take part in a metric, and why not. */
function availability(a, id, reliable) {
  if (!a?.metrics) return 'no-data';
  if (!reliable) return 'confidence';
  const m = a.metrics;
  if (id === 'intonation') {
    if (num(m.intonation?.meanAbsCents) == null) return 'no-data';
    return num(m.intonation.notes) != null && m.intonation.notes < RULES.minIntonationNotes ? 'few-notes' : '';
  }
  if (id === 'stability') {
    if (num(m.stability?.wobbleCents) == null) return 'no-data';
    return num(m.stability.notes) != null && m.stability.notes < RULES.minStabilityNotes ? 'few-notes' : '';
  }
  if (!(a.v >= 2)) return 'v1';
  if (id === 'range') return m.range?.stableHigh && num(m.range.stableHigh.cents) != null ? '' : 'no-stable';
  if (!hasDetail(a)) return 'reanalyze';
  if (id === 'phrase') return m.phrases.rows.filter(r => r[2] != null && r[1] >= RULES.match.minSeconds).length >= RULES.match.minPairs ? '' : 'few-phrases';
  return ''; // high, passaggio: decided with the zone / bands
}
/** The high zone of one take: sustained notes from `from` (MIDI) up to `to`. */
function zoneStats(a, from, to = Infinity) {
  const rows = (a?.metrics?.pitchBands?.rows || []).filter(r => r[0] >= from && r[0] <= to);
  const n = rows.reduce((s, r) => s + r[1], 0), nw = rows.reduce((s, r) => s + (r[5] == null ? 0 : r[4]), 0);
  if (!n) return {n:0, nw:0, held:null, longest:null, wobble:null, from, to};
  return {n, nw, from, to:Math.min(to, Math.max(...rows.map(r => r[0]))),
    held:Math.round(rows.reduce((s, r) => s + r[1] * r[2], 0) / n * 100) / 100,
    longest:Math.max(...rows.map(r => r[3])), wobble:nw ? r1(rows.reduce((s, r) => s + (r[5] == null ? 0 : r[4] * r[5]), 0) / nw) : null};
}
const topBand = a => { const rows = (a?.metrics?.pitchBands?.rows || []).filter(r => r[1] > 0); return rows.length ? Math.max(...rows.map(r => r[0])) : null; };
const mainMidi = a => { const g = a?.metrics?.range?.main; return g ? {low:midiOf(g.lowCents), high:midiOf(g.highCents)} : null; };
/** Both ends of the main singing range moved the same way by ≥ 2 semitones: probably sung in another key. */
function keyShift(a, b) {
  const x = mainMidi(a), y = mainMidi(b);
  if (!x || !y || x.low == null || y.low == null || x.high == null || y.high == null) return false;
  const dl = y.low - x.low, dh = y.high - x.high;
  return Math.sign(dl) === Math.sign(dh) && dl !== 0 && Math.min(Math.abs(dl), Math.abs(dh)) >= RULES.keyShift;
}
/** Where sustained-note wobble jumps by pitch (reference only). */
function passaggioOf(a) {
  if (!(a?.v >= 2)) return {state:'hold', reason:a?.metrics ? 'v1' : 'no-data'};
  if (!hasDetail(a)) return {state:'hold', reason:'reanalyze'};
  const rows = a.metrics.pitchBands.rows.filter(r => r[4] >= 1 && r[5] != null);
  if (rows.length < RULES.passaggio.minBands) return {state:'hold', reason:'few-bands'};
  const base = median(rows.map(r => r[5])), cut = Math.max(base * RULES.passaggio.ratio, base + RULES.passaggio.plus);
  const flagged = rows.filter(r => r[5] >= cut);
  if (!flagged.length) return {state:'reference', found:false, baseline:r1(base), bands:rows.length};
  const groups = []; for (const r of flagged) { const g = groups.at(-1); if (g && r[0] - g.at(-1)[0] <= 2) g.push(r); else groups.push([r]); }
  const worst = groups.reduce((x, y) => Math.max(...y.map(r => r[5])) > Math.max(...x.map(r => r[5])) ? y : x);
  const lo = worst[0][0], hi = worst.at(-1)[0];
  return {state:'reference', found:true, from:noteName(lo), to:noteName(hi), fromMidi:lo, toMidi:hi, wobble:r1(Math.max(...worst.map(r => r[5]))), baseline:r1(base), bands:rows.length};
}
/** One take on its own (no comparison): what each measure shows. reference = song.vocalRange or null. */
function single(a, {reliable = false, reference = null} = {}) {
  const out = {};
  for (const d of METRICS) {
    if (d.id === 'passaggio') { out.passaggio = passaggioOf(a); continue; }
    const why = availability(a, d.id, true); // show measured values even when confidence is low; judge nothing
    if (d.id === 'range') {
      if (why) { out.range = {state:'hold', reason:why}; continue; }
      const g = a.metrics.range, stable = midiOf(g.stableHigh.cents), main = mainMidi(a);
      out.range = {state:'reference', stable:g.stableHigh.note || noteName(stable), stableMidi:stable, valid:g.validHigh?.note || null,
        main:g.main ? {low:g.main.low, high:g.main.high, lowMidi:main.low, highMidi:main.high} : null,
        vsScore:reference && Number.isFinite(reference.highMidi) ? {scoreHigh:reference.high, stable:stable - reference.highMidi, mainHigh:main?.high == null ? null : main.high - reference.highMidi} : null};
      continue;
    }
    if (d.id === 'high') {
      if (why) { out.high = {state:'hold', reason:why}; continue; }
      const from = reference && Number.isFinite(reference.highMidi) ? reference.highMidi - RULES.high.belowScoreTop : mainMidi(a)?.high;
      const z = from == null ? {n:0} : zoneStats(a, from);
      out.high = z.n >= RULES.high.minNotes && z.wobble != null ? {state:'reference', zone:noteName(z.from) + '↑', from:z.from, notes:z.n, wobble:z.wobble, held:z.held, longest:z.longest, fromScore:!!reference} : {state:'hold', reason:'few-high'};
      continue;
    }
    if (why && why !== 'confidence') { out[d.id] = {state:'hold', reason:why}; continue; }
    const v = d.id === 'phrase' ? num(a.metrics.breath?.medianPhrase) : value(a, d.id);
    out[d.id] = v == null ? {state:'hold', reason:'no-data'} : {state:'reference', value:v};
  }
  out.reliable = !!reliable;
  return out;
}

/* ---------- the same phrases in two takes ---------- */
/** Greedy, order-keeping match of phrase rows [start, dur, midi, …]: same relative position (± 2.5 s + 4 % drift)
 * and median pitch within a semitone, duration within ×2. Tries the first few phrases as anchors so a take that
 * starts later in the song (partial take) still lines up. */
function matchPhrases(rowsA, rowsB) {
  const ok = r => Array.isArray(r) && r[2] != null && r[1] >= RULES.match.minSeconds;
  const a = (rowsA || []).filter(ok), b = (rowsB || []).filter(ok);
  if (!a.length || !b.length) return [];
  const offsets = new Set();
  for (let i = 0; i < Math.min(6, a.length); i++) for (let j = 0; j < Math.min(6, b.length); j++) offsets.add(Math.round((b[j][0] - a[i][0]) * 10) / 10);
  let best = [];
  for (const off of offsets) {
    const pairs = []; let from = 0;
    for (const x of a) {
      const target = x[0] + off, tol = RULES.match.startTol + Math.abs(x[0] - a[0][0]) * RULES.match.startRel;
      for (let j = from; j < b.length; j++) {
        const y = b[j]; if (y[0] > target + tol) break;
        if (Math.abs(y[0] - target) <= tol && Math.abs(y[2] - x[2]) <= RULES.match.midiTol && y[1] / x[1] >= .5 && y[1] / x[1] <= 2) { pairs.push([x, y]); from = j + 1; break; }
      }
    }
    if (pairs.length > best.length) best = pairs;
  }
  return best;
}
/** Ratio of the second take's tempo span to the first's (phrase starts only: sustaining longer does not move it). */
function tempoRatio(pairs) {
  if (pairs.length < 2) return 1;
  const sa = pairs.at(-1)[0][0] - pairs[0][0][0], sb = pairs.at(-1)[1][0] - pairs[0][1][0];
  return sa >= 5 && sb > 0 ? sb / sa : 1;
}

/* ---------- two takes of the same song ---------- */
const threshold = (rule, before) => Math.max(rule.floor, Math.abs(before) * rule.rel);
function direction(d, delta, rule, before) {
  if (Math.abs(delta) < threshold(rule, before)) return 'similar';
  return Math.sign(delta) === d.direction ? 'better' : 'worse';
}
/** Compare one metric for two takes (first = earlier). Both are {a, date, ok}. */
function compareMetric(id, first, last, {reference = null, sameDay = false, scoreNotes = null} = {}) {
  const d = byId[id], a = first.a, b = last.a;
  if (d.reference) return {id, state:'reference', latest:passaggioOf(b), earlier:passaggioOf(a)};
  if (!sameDay && first.date && last.date && first.date === last.date) return {id, state:'hold', reason:'same-day'};
  if (!first.ok || !last.ok) return {id, state:'hold', reason:'confidence'};
  if (versionOf(a) !== versionOf(b)) return {id, state:'hold', reason:'version-mixed'};
  for (const x of [a, b]) { const why = availability(x, id, true); if (why) return {id, state:'hold', reason:why}; }
  const base = {id, firstId:first.id, lastId:last.id, from:first.date, to:last.date};
  if (id === 'intonation' || id === 'stability') {
    // Prefer the same phrases in both takes; otherwise the whole recording (labelled).
    let before = value(a, id), after = value(b, id), basis = 'whole', matched = 0;
    if (hasDetail(a) && hasDetail(b)) {
      const col = id === 'intonation' ? 3 : 4, pairs = matchPhrases(a.metrics.phrases.rows, b.metrics.phrases.rows).filter(([x, y]) => x[col] != null && y[col] != null);
      if (pairs.length >= RULES.match.minPairs) {
        const w = (k, side) => pairs.reduce((s, p) => s + p[side][col] * (k ? p[side][1] : 1), 0) / pairs.reduce((s, p) => s + (k ? p[side][1] : 1), 0);
        before = r1(w(id === 'intonation', 0)); after = r1(w(id === 'intonation', 1)); basis = 'phrases'; matched = pairs.length;
      }
    }
    const delta = r1(after - before);
    const score = id === 'intonation' && scoreNotes ? scoreNoteBasis(scoreNotes[first.id], scoreNotes[last.id]) : null;
    return {...base, state:direction(d, delta, RULES[id], before), before, after, delta, basis, matched, ...(score ? {score} : {})};
  }
  if (id === 'phrase') {
    const pairs = matchPhrases(a.metrics.phrases.rows, b.metrics.phrases.rows);
    if (pairs.length < RULES.match.minPairs) return {...base, state:'hold', reason:'few-phrases', matched:pairs.length};
    const tempo = tempoRatio(pairs);
    if (tempo < RULES.match.tempo[0] || tempo > RULES.match.tempo[1]) return {...base, state:'hold', reason:'tempo', matched:pairs.length, tempo:Math.round(tempo * 100) / 100};
    const before = r1(median(pairs.map(p => p[0][1]))), after = r1(median(pairs.map(p => p[1][1] / tempo)));
    const delta = r1(median(pairs.map(p => p[1][1] / tempo - p[0][1])));
    return {...base, state:direction(d, delta, RULES.phrase, before), before, after, delta, basis:'phrases', matched:pairs.length, tempo:Math.round(tempo * 100) / 100};
  }
  if (id === 'range') {
    if (keyShift(a, b)) return {...base, state:'hold', reason:'key-shift'};
    const ga = a.metrics.range, gb = b.metrics.range, s = semitones(ga.stableHigh.cents, gb.stableHigh.cents);
    const ma = mainMidi(a), mb = mainMidi(b);
    const vsScore = reference && Number.isFinite(reference.highMidi) ? {scoreHigh:reference.high, before:midiOf(ga.stableHigh.cents) - reference.highMidi, after:midiOf(gb.stableHigh.cents) - reference.highMidi} : null;
    return {...base, state:s === 0 ? 'similar' : 'changed', before:ga.stableHigh.note || noteName(midiOf(ga.stableHigh.cents)), after:gb.stableHigh.note || noteName(midiOf(gb.stableHigh.cents)), delta:s,
      main:ma && mb && ma.high != null && mb.high != null ? {before:ga.main.low + '–' + ga.main.high, after:gb.main.low + '–' + gb.main.high, highDelta:mb.high - ma.high, lowDelta:mb.low - ma.low} : null, vsScore};
  }
  if (id === 'high') {
    if (keyShift(a, b)) return {...base, state:'hold', reason:'key-shift'};
    const fromScore = reference && Number.isFinite(reference.highMidi);
    const ma = mainMidi(a)?.high, mb = mainMidi(b)?.high;
    const from = fromScore ? reference.highMidi - RULES.high.belowScoreTop : ma == null || mb == null ? null : Math.min(ma, mb);
    const ta = topBand(a), tb = topBand(b);
    if (from == null || ta == null || tb == null) return {...base, state:'hold', reason:'few-high'};
    const to = Math.min(ta, tb), za = zoneStats(a, from, to), zb = zoneStats(b, from, to);
    if (za.n < RULES.high.minNotes || zb.n < RULES.high.minNotes || za.wobble == null || zb.wobble == null) return {...base, state:'hold', reason:'few-high'};
    const dw = r1(zb.wobble - za.wobble), dh = Math.round((zb.held - za.held) * 100) / 100;
    const w = direction({direction:-1}, dw, RULES.highWobble, za.wobble), h = direction({direction:1}, dh, RULES.highHeld, za.held);
    const state = w === h ? w : w === 'similar' ? h : h === 'similar' ? w : 'mixed';
    return {...base, state, zone:noteName(from) + (to > from ? '–' + noteName(to) : ''), fromScore:!!fromScore,
      before:za.wobble, after:zb.wobble, delta:dw, heldBefore:za.held, heldAfter:zb.held, heldDelta:dh, wobbleState:w, heldState:h, notes:[za.n, zb.n]};
  }
  return {id, state:'hold', reason:'no-data'};
}

/** Note-level score basis for two takes: both saved results (song.noteCompare.takes[id]) usable, same score version,
 * part and key relation; the share of ±50-cent notes over the score notes judged in BOTH takes. null otherwise. */
function scoreNoteBasis(x, y) {
  if (!x || !y || x.state !== 'ok' || y.state !== 'ok' || typeof x.s !== 'string' || typeof y.s !== 'string') return null;
  if (!x.score || x.score !== y.score || String(x.ver || '') !== String(y.ver || '') || x.part !== y.part || (x.shift || 0) !== (y.shift || 0)) return null;
  let n = 0, okX = 0, okY = 0;
  const judged = c => c === 'o' || c === 'h' || c === 'l';
  const from = Math.max(x.from || 0, y.from || 0), to = Math.min((x.from || 0) + x.s.length, (y.from || 0) + y.s.length);
  for (let i = from; i < to; i++) {
    const a = x.s[i - (x.from || 0)], b = y.s[i - (y.from || 0)];
    if (!judged(a) || !judged(b)) continue;
    n++; if (a === 'o') okX++; if (b === 'o') okY++;
  }
  if (n < RULES.scoreNotes) return null;
  return {before:Math.round(okX / n * 100), after:Math.round(okY / n * 100), notes:n, shift:x.shift || 0};
}

/* ---------- picking the takes ---------- */
/** takes: [{id, a, date, ok}] of ONE song. Earliest and latest takes usable for the metric, same analysis version,
 * different days. When none qualifies, the reason it is withheld. */
function pickPair(takes, id) {
  const list = takes.filter(t => t.a?.metrics).slice().sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')) || String(x.id || '').localeCompare(String(y.id || '')));
  if (!list.length) return {reason:'no-data'};
  const usable = list.filter(t => !availability(t.a, id, t.ok));
  if (!usable.length) {
    const why = list.map(t => availability(t.a, id, t.ok));
    return {reason:['reanalyze', 'v1', 'confidence', 'few-notes', 'few-phrases', 'no-stable'].find(r => why.includes(r)) || 'no-data'};
  }
  const last = usable.at(-1), earlier = list.filter(t => t.date && last.date && t.date < last.date);
  const first = usable.find(t => t.date && last.date && t.date < last.date && versionOf(t.a) === versionOf(last.a));
  if (first) return {first, last};
  if (earlier.some(t => versionOf(t.a) !== versionOf(last.a))) return {reason:'version-mixed', last};
  if (earlier.length) { const why = earlier.map(t => availability(t.a, id, t.ok)); return {reason:['confidence', 'reanalyze', 'few-notes', 'few-phrases', 'no-stable'].find(r => why.includes(r)) || 'no-pair', last}; }
  if (list.some(t => t !== last && t.date === last.date)) return {reason:'same-day', last};
  return {reason:'no-pair', last};
}
/** All six measures for one song's takes. reference = song.vocalRange (confirmed) or null. */
function songReport(takes, {reference = null, scoreNotes = null} = {}) {
  const out = {};
  for (const d of METRICS) {
    if (d.reference) {
      const withData = takes.filter(t => t.a?.metrics).sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')));
      const latest = withData.slice().reverse().find(t => hasDetail(t.a)) || withData.at(-1);
      out[d.id] = latest ? {id:d.id, state:'reference', latest:passaggioOf(latest.a), lastId:latest.id, to:latest.date} : {id:d.id, state:'hold', reason:'no-data'};
      continue;
    }
    const p = pickPair(takes, d.id);
    out[d.id] = p.first ? compareMetric(d.id, p.first, p.last, {reference, scoreNotes}) : {id:d.id, state:'hold', reason:p.reason, lastId:p.last?.id};
    if (p.last) out[d.id].latest = d.id === 'range' || d.id === 'high' ? single(p.last.a, {reference})[d.id] : {value:d.id === 'phrase' ? num(p.last.a.metrics.breath?.medianPhrase) : value(p.last.a, d.id)};
  }
  return out;
}
/** One song across two periods (monthly view): the latest usable take of the earlier period vs the latest of the
 * later one, same analysis version. Songs missing from the earlier period are not compared. */
function periodReport(beforeTakes, afterTakes, {reference = null} = {}) {
  const sort = l => l.filter(t => t.a?.metrics).slice().sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')));
  const before = sort(beforeTakes), after = sort(afterTakes), out = {};
  const why = (list, id) => { const r = list.map(t => availability(t.a, id, t.ok)); return ['reanalyze', 'v1', 'confidence', 'few-notes', 'few-phrases', 'no-stable'].find(x => r.includes(x)) || 'no-data'; };
  for (const d of METRICS) {
    if (d.reference) { const last = after.filter(t => hasDetail(t.a)).at(-1) || after.at(-1); out[d.id] = last ? {id:d.id, state:'reference', latest:passaggioOf(last.a), lastId:last.id} : {id:d.id, state:'hold', reason:'no-data'}; continue; }
    if (!before.length) continue;
    const last = after.filter(t => !availability(t.a, d.id, t.ok)).at(-1);
    if (!last) { out[d.id] = {id:d.id, state:'hold', reason:why(after, d.id)}; continue; }
    const usable = before.filter(t => !availability(t.a, d.id, t.ok)), first = usable.filter(t => versionOf(t.a) === versionOf(last.a)).at(-1);
    out[d.id] = first ? compareMetric(d.id, first, last, {reference}) : {id:d.id, state:'hold', reason:usable.length ? 'version-mixed' : why(before, d.id), lastId:last.id};
    out[d.id].latest = d.id === 'range' || d.id === 'high' ? single(last.a, {reference})[d.id] : {value:d.id === 'phrase' ? num(last.a.metrics.breath?.medianPhrase) : value(last.a, d.id)};
  }
  return out;
}
/** Two takes chosen by the person (vocal lab A/B): the same rules, no pair picking. */
function comparePair(first, second, {reference = null, scoreNotes = null} = {}) {
  const [x, y] = [first, second].sort((p, q) => String(p.date || '').localeCompare(String(q.date || '')));
  // The person picked these two takes: the same-day rule (meant for automatic pairing) does not apply.
  return Object.fromEntries(METRICS.map(d => [d.id, compareMetric(d.id, x, y, {reference, sameDay:true, scoreNotes})]));
}

/* ---------- many songs ---------- */
/** reports: [{songId, title, report:songReport(...)}]. Per measure: how many songs moved which way, how many were
 * withheld and why, and the mean before/after of the compared songs (accuracy/stability/phrase/high only). */
function aggregate(reports) {
  return METRICS.map(d => {
    const rows = reports.map(r => ({songId:r.songId, title:r.title, ...r.report[d.id]})).filter(x => x.state);
    const compared = rows.filter(x => ['better', 'worse', 'similar', 'mixed', 'changed'].includes(x.state));
    const count = s => compared.filter(x => x.state === s).length;
    const holds = {}; for (const x of rows.filter(x => x.state === 'hold')) holds[x.reason] = (holds[x.reason] || 0) + 1;
    const numeric = d.judged && d.id !== 'range' ? compared.filter(x => Number.isFinite(x.before) && Number.isFinite(x.after)) : [];
    const mean = k => numeric.length ? r1(numeric.reduce((s, x) => s + x[k], 0) / numeric.length) : null;
    const better = count('better'), worse = count('worse'), similar = count('similar'), mixed = count('mixed'), changed = count('changed');
    let state = 'hold';
    if (d.reference) state = rows.some(x => x.latest?.state === 'reference') ? 'reference' : 'hold';
    else if (compared.length) state = !d.judged ? (changed ? 'changed' : 'similar') : better > worse ? 'better' : worse > better ? 'worse' : better || worse || mixed ? 'mixed' : 'similar';
    const latest = rows.map(x => num(x.latest?.value)).filter(v => v != null);
    return {...d, state, compared:compared.length, better, worse, similar, mixed, changed, holds,
      measured:latest.length, latestValue:latest.length ? r1(latest.reduce((s, v) => s + v, 0) / latest.length) : null,
      withheld:rows.filter(x => x.state === 'hold').length, before:mean('before'), after:mean('after'), rows};
  });
}
/** Main hold reason of an aggregate (the most frequent one). */
const mainHold = agg => Object.entries(agg.holds || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'no-pair';

/* ---------- wording ---------- */
function fmt(id, v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  if (id === 'phrase') return r1(v) + '초';
  if (id === 'intonation' || id === 'stability' || id === 'high' || id === 'passaggio') return '±' + r1(v) + ' cent';
  return String(v);
}
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
/** One line for a compared metric: "±12 → ±9.5 cent (−2.5)". */
function changeText(x) {
  if (!x || x.state === 'hold') return holdText(x?.reason);
  if (x.id === 'range') {
    let t = '안정 최고음 ' + x.before + ' → ' + x.after + (x.delta ? ' (' + signed(x.delta) + '반음)' : ' (같음)');
    if (x.main) t += ' · 주 가창 음역 ' + (x.main.before === x.main.after ? x.main.after + ' 그대로' : x.main.before + ' → ' + x.main.after);
    return t + ' · 실력 판정 아님';
  }
  if (x.id === 'high') return x.zone + ' 구간 흔들림 ' + fmt('high', x.before) + ' → ' + fmt('high', x.after) + ' · 유지 ' + x.heldBefore + '초 → ' + x.heldAfter + '초';
  if (x.id === 'passaggio') return passaggioText(x.latest);
  return fmt(x.id, x.before) + ' → ' + fmt(x.id, x.after);
}
function basisText(x) {
  if (!x || x.state === 'hold' || x.state === 'reference') return '';
  if (x.score) return '악보 기준 맞은 음 비율 ' + x.score.before + '% → ' + x.score.after + '% (같은 악보 음 ' + x.score.notes + '개 · ±50 cent) · cent 비교는 ' + (x.basis === 'phrases' ? '같은 프레이즈 ' + x.matched + '개' : '곡 전체');
  if (x.basis === 'phrases') return '같은 프레이즈 ' + x.matched + '개 비교' + (x.id === 'phrase' && x.tempo && x.tempo !== 1 ? ' · 템포 보정' : '');
  if (x.basis === 'whole') return '곡 전체 비교 (같은 프레이즈를 충분히 찾지 못함)';
  if (x.id === 'high') return x.fromScore ? '악보 최고음 기준 고음 구간' : '두 녹음 공통 고음 구간';
  return '';
}
function passaggioText(p) {
  if (!p || p.state === 'hold') return holdText(p?.reason);
  if (!p.found) return '음높이에 따라 흔들림이 크게 달라지는 구간이 보이지 않았어요 (평소 ±' + p.baseline + ' cent)';
  return (p.from === p.to ? p.from : p.from + '–' + p.to) + ' 부근에서 지속음 흔들림이 커요 (±' + p.wobble + ' cent, 평소 ±' + p.baseline + ' cent)';
}
const PASSAGGIO_NOTE = '음정 데이터만으로 판별 불가, 선생님 판단 참고';
function stateLabel(x) { return STATE[x?.state] || '판정 보류'; }
/** AI coach input (server "overall" mode accepts only intonation/stability/phrase/vibrato; range, high-note and
 * passaggio are never sent, so the model cannot judge from the highest note). Withheld → state unknown. */
function aiMetrics(aggs) {
  return aggs.filter(x => ['intonation', 'stability', 'phrase'].includes(x.id)).map(x => {
    const judged = x.compared > 0 && ['better', 'worse', 'similar'].includes(x.state);
    const basis = x.rows?.find(r => r.basis === 'phrases') ? '같은 프레이즈' : x.id === 'phrase' ? '같은 프레이즈' : '곡 전체';
    return {key:x.id, title:(x.title + (judged ? ' · ' + basis + ' 비교' : ' · 판정 보류')).slice(0, 32),
      value:x.after ?? x.latestValue ?? null, count:x.measured ?? x.compared,
      state:judged ? x.state : 'unknown', sharedSongs:judged ? x.compared : 0,
      improvedSongs:judged ? x.better : 0, worsenedSongs:judged ? x.worse : 0};
  });
}
return {VERSION:2, RULES, METRICS, HOLD, STATE, noteName, midiOf, semitones, hasDetail, availability, value, single, zoneStats, keyShift, passaggioOf,
  matchPhrases, tempoRatio, scoreNoteBasis, compareMetric, pickPair, songReport, periodReport, comparePair, aggregate, mainHold, fmt, changeText, basisText, passaggioText, PASSAGGIO_NOTE, stateLabel, holdText, aiMetrics};
});
