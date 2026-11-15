/* VOCAL.zip 성장 리포트 v2 — separated growth measures, never the instant highest note.
 * Pure functions (also loaded by the Node tests): every screen (성장 탭, 곡 카드, 보컬 연구소, AI 입력) asks this
 * module, so the rules below hold everywhere.
 *
 *   intonation (음정 정확도)  cents from the nearest semitone — NOT a right-note check. When both compared takes have a
 *                             saved note-level score comparison (음표 단위 악보 비교, app/score-align-model.js) for the same
 *                             score version, part and key, the share of the same score notes sung within ±50 cent is
 *                             shown as its basis ("악보 기준 맞은 음 비율 A% → B%"). Without a score, the same from a saved
 *                             comparison with the song's original recording (원곡(AR) 음정 비교, the same AR file and
 *                             extraction): "원곡 기준 맞은 음 비율 A% → B%". The verdict itself is unchanged.
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
  passaggio:{minBands:4, ratio:1.5, plus:4},
  // 파사지오 over many recordings: the zone must come back in at least `share` of at least `min` recordings (the
  // latest `cap`), a zone counting as the same within ± `tolerance` semitones.
  passaggioRecur:{cap:40, min:5, share:.5, tolerance:1}
};

const METRICS = [
  {id:'intonation', title:'음정 정확도', unit:'cent', direction:-1, judged:true, help:'into',
    method:'가장 가까운 반음과의 평균 음정 오차(cent)로 재요. 이 값만으로는 맞는 음을 불렀는지는 판단하지 않아요. 두 녹음 모두 음표 단위 악보 비교(또는 원곡 기준 비교)를 저장했다면 악보(원곡) 기준 맞은 음 비율을 근거로 함께 보여요.',
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
    method:'녹음마다 지속음 흔들림이 커지는 음역대를 찾고, 믿을 만한 녹음 5개 이상 가운데 절반 이상에서 되풀이되는 곳만 보여 줘요. 녹음마다 다르면 판정을 보류해요. 음정 데이터만으로 판별 불가, 선생님 판단 참고.',
    practice:'', minutes:0}
];
const byId = Object.fromEntries(METRICS.map(m => [m.id, m]));

/* Why a judgement is withheld. The ONE place for these words: every screen shows the label "판정 보류" once
 * (a chip, a heading, or holdLine) and the reason from here — the reasons themselves never repeat the label. */
const HOLD = {
  'no-data':'측정값이 없어요',
  'no-pair':'같은 곡을 다른 날 다시 부른 녹음이 필요해요',
  'no-earlier':'이번 주 전에 분석한 같은 곡 녹음이 없어요',
  'same-day':'같은 날 녹음끼리는 변화로 보지 않아요',
  'version-mixed':'분석 버전(v1·v2)이 달라요 · 이전 녹음을 다시 분석하면 비교할 수 있어요',
  'v1':'이전 분석(v1) 결과라 이 지표는 계산하지 않아요 · 다시 분석하면 확인할 수 있어요',
  'reanalyze':'세부 측정(프레이즈·음높이별)이 없는 분석이에요 · 다시 분석하면 확인할 수 있어요',
  'confidence':'측정 신뢰도가 낮아요 (목소리가 짧거나 반주가 커요)',
  'few-notes':'측정한 음이 적어요',
  'few-phrases':'같은 프레이즈를 3개 이상 찾지 못했어요',
  'tempo':'템포 차이가 커요',
  'key-shift':'주 가창 음역 전체가 옮겨져 키가 달랐을 수 있어요',
  'no-stable':'안정 최고음이 없어요',
  'few-high':'같은 고음 구간에서 지속한 음이 적어요',
  'few-bands':'여러 음높이의 지속음이 부족해요',
  'few-recordings':'세부 측정이 있는 믿을 만한 녹음이 5개는 있어야 해요',
  'scattered':'녹음마다 다르게 나와요'
};
const HOLD_LABEL = '판정 보류';
/** The reason only — for places that already show the 판정 보류 label (chip, heading). */
const holdText = reason => HOLD[reason] || '비교할 근거가 부족해요';
/** Label + reason in one line — for places with no separate label. */
const holdLine = reason => HOLD_LABEL + ' · ' + holdText(reason);
/** Why two takes picked by hand (녹음별 변화, A/B) are not compared: the same reasons as the report. */
const pairHold = (a, b, reliable = () => true) => !a?.metrics || !b?.metrics ? 'no-data' : (a.v ?? null) !== (b.v ?? null) ? 'version-mixed' : !reliable(a) || !reliable(b) ? 'confidence' : '';
const STATE = {better:'좋아진 방향', worse:'아쉬운 방향', similar:'비슷함', mixed:'변화 혼재', changed:'변화 관찰', hold:HOLD_LABEL, reference:'참고'};

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
/** 파사지오 over the recordings of a period (a song's takes, or every counted take): the zone that RECURS.
 * One recording's zone (passaggioOf) moves with the song and the day; this reads it over the reliable, detailed takes
 * (the latest RULES.passaggioRecur.cap) and reports the most frequent zone — zones within ± 1 semitone of each other
 * count as the same — only when it comes back in at least half of at least 5 recordings. Otherwise 판정 보류
 * ('few-recordings' | 'scattered'), with the counts. When most recordings show no zone at all, that is what recurs
 * (found:false). Reference only, never a verdict. takes: [{a, ok, date, created, id}]. */
function passaggioRecurring(takes) {
  const rule = RULES.passaggioRecur;
  const rows = (takes || []).filter(t => t.ok && hasDetail(t.a)).slice().sort(takeOrder).slice(-rule.cap).map(t => passaggioOf(t.a)).filter(p => p.state === 'reference');
  const of = rows.length;
  if (of < rule.min) return {state:'hold', reason:'few-recordings', of, need:rule.min};
  const found = rows.filter(p => p.found), none = of - found.length;
  let best = null;
  for (const c of found) {
    const hits = found.filter(p => p.fromMidi <= c.toMidi + rule.tolerance && p.toMidi >= c.fromMidi - rule.tolerance);
    if (!best || hits.length > best.hits.length || (hits.length === best.hits.length && (c.fromMidi - best.c.fromMidi || c.toMidi - best.c.toMidi) < 0)) best = {c, hits};
  }
  const top = best ? best.hits.length : 0;
  if (none >= top && none / of >= rule.share) return {state:'reference', found:false, count:none, of, baseline:r1(median(rows.filter(p => !p.found).map(p => p.baseline)))};
  if (top / of < rule.share) return {state:'hold', reason:'scattered', of, count:top};
  const from = Math.round(median(best.hits.map(p => p.fromMidi))), to = Math.max(from, Math.round(median(best.hits.map(p => p.toMidi))));
  const low = Math.min(...best.hits.map(p => p.fromMidi)), high = Math.max(...best.hits.map(p => p.toMidi));
  return {state:'reference', found:true, from:noteName(from), to:noteName(to), fromMidi:from, toMidi:to, count:top, of, share:Math.round(top / of * 100) / 100,
    spread:{from:noteName(low), to:noteName(high), fromMidi:low, toMidi:high}, wobble:r1(median(best.hits.map(p => p.wobble))), baseline:r1(median(best.hits.map(p => p.baseline)))};
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
/** A take measured after subtracting its MR (app/mr-cancel.js): wobble-type measures may carry the subtraction's
 * traces, so their change is shown as observed only (변화 관찰) until checked on real recordings. */
const MR_REMOVED_NOTE = '반주를 뺀 녹음이라 흔들림 변화는 참고로만 보여요';
const mrRemoved = t => !!t?.a?.confidence?.mrRemoved;
/** A take measured on the voice that the server's AI separation (Demucs) split from the accompaniment. */
const AI_SEPARATED_NOTE = 'AI 분리 후 측정(참고)';
const aiSeparated = t => !!t?.a?.confidence?.aiSeparated;
/** A comparison in which a side is a day's mean (같은 날 녹음: 하루 평균): said as its basis, with the takes behind each side. */
const dayMean = (first, last) => first.day?.basis === 'mean' || last.day?.basis === 'mean' ? {basis:'day-mean', dayCounts:[first.day?.basis === 'mean' ? first.day.reliable : 1, last.day?.basis === 'mean' ? last.day.reliable : 1]} : {};
/** Compare one metric for two takes (first = earlier). Both are {a, date, ok}. */
function compareMetric(id, first, last, options = {}) {
  const x = compareMetricRaw(id, first, last, options);
  if ((id === 'stability' || id === 'high') && ['better', 'worse', 'similar', 'mixed'].includes(x.state) && (mrRemoved(first) || mrRemoved(last))) return {...x, state:'changed', judged:x.state, note:'mr-removed'};
  // AI-separated takes are judged like any other; the change only carries the label.
  if (x.state !== 'hold' && (aiSeparated(first) || aiSeparated(last))) return {...x, note:'ai-separated'};
  return x;
}
function compareMetricRaw(id, first, last, {reference = null, sameDay = false, scoreNotes = null, arNotes = null} = {}) {
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
    const whole = {before, after}; // the whole-recording values every single-take screen shows
    if (hasDetail(a) && hasDetail(b)) {
      const col = id === 'intonation' ? 3 : 4, pairs = matchPhrases(a.metrics.phrases.rows, b.metrics.phrases.rows).filter(([x, y]) => x[col] != null && y[col] != null);
      if (pairs.length >= RULES.match.minPairs) {
        const w = (k, side) => pairs.reduce((s, p) => s + p[side][col] * (k ? p[side][1] : 1), 0) / pairs.reduce((s, p) => s + (k ? p[side][1] : 1), 0);
        before = r1(w(id === 'intonation', 0)); after = r1(w(id === 'intonation', 1)); basis = 'phrases'; matched = pairs.length;
      }
    }
    const delta = r1(after - before);
    // The score is preferred; else the original singer's extracted melody (원곡 기준), never the two mixed.
    let score = id === 'intonation' && scoreNotes ? scoreNoteBasis(scoreNotes[first.id], scoreNotes[last.id]) : null;
    if (!score && id === 'intonation' && arNotes) { const ar = scoreNoteBasis(arNotes[first.id], arNotes[last.id]); if (ar) score = {...ar, source:'ar'}; }
    return {...base, state:direction(d, delta, RULES[id], before), before, after, delta, basis, matched, ...(basis === 'phrases' ? {whole} : {}), ...(score ? {score} : {}), ...dayMean(first, last)};
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
    return {...base, ...dayMean(first, last), state:s === 0 ? 'similar' : 'changed', before:ga.stableHigh.note || noteName(midiOf(ga.stableHigh.cents)), after:gb.stableHigh.note || noteName(midiOf(gb.stableHigh.cents)), delta:s,
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
/** Oldest → newest: the recorded date, then the recording time (take.created = the recording's own `created`
 * timestamp; never the upload or analysis time), then the id so every screen gets the same order. */
const byDay = (x, y) => String(x.date || '').localeCompare(String(y.date || '')) || (Number(x.created) || 0) - (Number(y.created) || 0);
const takeOrder = (x, y) => byDay(x, y) || String(x.id || '').localeCompare(String(y.id || ''));
/** takes: [{id, a, date, created, ok}] of ONE song. Earliest and latest takes usable for the metric, same analysis version,
 * different days. When none qualifies, the reason it is withheld. */
function pickPair(takes, id) {
  const list = takes.filter(t => t.a?.metrics).slice().sort(takeOrder);
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
/* ---------- several takes of one song on one day (같은 날 녹음) ----------
 * How the takes of ONE song sung on ONE day count. 'all' (the default) is every take as before. The other three
 * give each day ONE value per measure, made from that day's RELIABLE takes only:
 *   average   하루 평균    the mean of the day's values; a note-valued measure (최고음) uses the median note (중앙값).
 *                         Same-phrase and high-zone comparisons cannot be averaged: they use the day's most reliable take.
 *   reliable  신뢰도 높은 것  the take with the highest pitch confidence; ties → more voiced seconds, then the later take.
 *   best      가장 좋은 것   per measure, the take with the best value in that measure's good direction (METRICS
 *                         direction; for the stable highest note, which has no direction, the higher note).
 * A day with no reliable take is represented by its latest take as it is (ok:false), so it stays 판정 보류. A day
 * with one reliable take is that take, whatever the mode. Nothing here changes a take. */
const SAME_DAY = [['all', '모두'], ['average', '하루 평균'], ['reliable', '신뢰도 높은 것'], ['best', '가장 좋은 것']];
const SAME_DAY_NOTE = {
  average:'하루 평균은 그날 신뢰도 높은 녹음만으로 내요. 음으로 나타내는 값(최고음)은 중앙값을 써요.',
  reliable:'그날 음높이 인식 신뢰도가 가장 높은 녹음 하나로 봐요. 같으면 목소리가 더 긴 녹음, 그다음 나중 녹음이에요.',
  best:'하루에 여러 번 부를수록 가장 좋은 값은 좋아지기 쉬워요. 날끼리 공평하게 보려면 하루 평균이 좋아요.'
};
const sameDayMode = mode => SAME_DAY.some(([id]) => id === mode) ? mode : 'all';
/** The days of one song's takes, oldest first: {date, takes (oldest first), reliable}. A take without a date is a day of its own. */
function days(takes) {
  const out = [], byDate = new Map();
  for (const t of takes.slice().sort(takeOrder)) {
    let d = t.date ? byDate.get(t.date) : null;
    if (!d) { d = {date:t.date || '', takes:[]}; if (t.date) byDate.set(t.date, d); out.push(d); }
    d.takes.push(t);
  }
  for (const d of out) d.reliable = d.takes.filter(t => t.ok && t.a?.metrics);
  return out;
}
/** Highest pitch confidence; ties → more voiced seconds, then the later take. */
function mostReliable(takes) {
  const conf = t => { const c = Number(t.a?.confidence?.pitchConfidence); return Number.isFinite(c) ? c : -1; }, voiced = t => num(t.a?.metrics?.voicedSeconds) || 0;
  return takes.reduce((best, t) => { const c = conf(t) - conf(best) || voiced(t) - voiced(best); return c > 0 || (c === 0 && takeOrder(t, best) > 0) ? t : best; });
}
/* The one number of a take that a day value of each measure is made from. */
const DAY_SCALAR = {
  intonation:a => num(a.metrics.intonation?.meanAbsCents), stability:a => num(a.metrics.stability?.wobbleCents),
  range:a => a.v >= 2 ? num(a.metrics.range?.stableHigh?.cents) : null, phrase:a => num(a.metrics.breath?.medianPhrase),
  high:(a, reference) => { const h = single(a, {reference}).high; return h?.state === 'reference' ? num(h.wobble) : null; }
};
const AVERAGED = ['intonation', 'stability', 'range'];   // the measures a day mean can stand for (whole-recording values)
/** The mean analysis of a day's reliable takes (newest version present only): whole-recording values, no phrase detail. */
function meanAnalysis(takes) {
  const v = takes.some(t => t.a.v >= 2) ? 2 : 1, list = takes.filter(t => (t.a.v >= 2 ? 2 : 1) === v).map(t => t.a);
  const vals = get => list.map(get).filter(x => x != null);
  const mean = get => { const xs = vals(get); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; };
  const mid = get => { const xs = vals(get); return xs.length ? Math.round(median(xs)) : null; };
  const sum = get => list.reduce((s, a) => s + (num(get(a)) || 0), 0);
  const point = cents => cents == null ? null : {note:noteName(midiOf(cents)), cents};
  const into = mean(a => num(a.metrics.intonation?.meanAbsCents)), wob = mean(a => num(a.metrics.stability?.wobbleCents)), phr = mean(a => num(a.metrics.breath?.medianPhrase));
  const lo = mid(a => num(a.metrics.range?.main?.lowCents)), hi = mid(a => num(a.metrics.range?.main?.highCents)), conf = mean(a => num(a.confidence?.pitchConfidence));
  const dbs = vals(a => num(a.confidence?.voiceOverMrDb));
  return {v:list[0].v, dayAverage:{n:list.length}, metrics:{voicedSeconds:r1(mean(a => num(a.metrics.voicedSeconds))),
      intonation:into == null ? null : {meanAbsCents:r1(into), notes:sum(a => a.metrics.intonation?.notes)}, stability:wob == null ? null : {wobbleCents:r1(wob), notes:sum(a => a.metrics.stability?.notes)},
      range:v >= 2 ? {validHigh:point(mid(a => num(a.metrics.range?.validHigh?.cents))), stableHigh:point(mid(a => num(a.metrics.range?.stableHigh?.cents))),
        main:lo != null && hi != null ? {low:noteName(midiOf(lo)), high:noteName(midiOf(hi)), lowCents:lo, highCents:hi} : null} : null,
      breath:phr == null ? null : {medianPhrase:r1(phr)}},
    confidence:{...(conf == null ? {} : {pitchConfidence:Math.round(conf * 1000) / 1000}), voiceOverMrDb:dbs.length ? Math.min(...dbs) : null}};
}
/** takes of ONE song → one take per day for measure `id` (see above). mode 'all': the takes themselves. Each returned
 * take carries `day`: {n (takes that day), reliable, basis: 'take' | 'mean' | 'reliable' | 'best' | 'unreliable', ids?}. */
function dayTakes(takes, mode, id, {reference = null} = {}) {
  mode = sameDayMode(mode);
  if (mode === 'all') return takes;
  return days(takes.filter(t => t.a?.metrics)).map(day => {
    const info = {n:day.takes.length, reliable:day.reliable.length};
    if (!day.reliable.length) return {...day.takes.at(-1), day:{...info, basis:'unreliable'}};
    if (day.reliable.length === 1) return {...day.reliable[0], day:{...info, basis:'take'}};
    if (mode === 'average' && AVERAGED.includes(id)) {
      const last = day.reliable.at(-1);
      return {id:'day:' + day.date, songId:last.songId || '', a:meanAnalysis(day.reliable), date:day.date, created:last.created, ok:true, day:{...info, basis:'mean', ids:day.reliable.map(t => t.id)}};
    }
    if (mode === 'best' && DAY_SCALAR[id]) {
      const dir = byId[id].direction || 1, rows = day.reliable.map(t => ({t, v:DAY_SCALAR[id](t.a, reference)})).filter(x => x.v != null);
      if (rows.length) { const top = rows.reduce((b, x) => (x.v - b.v) * dir > 0 ? x : b).v; return {...mostReliable(rows.filter(x => x.v === top).map(x => x.t)), day:{...info, basis:'best'}}; }
    }
    return {...mostReliable(day.reliable), day:{...info, basis:'reliable'}};
  });
}
/** One day's value of one measure for a chart. get(take) → number | null; better: −1 lower, 1 higher (가장 좋은 것);
 * note: a note-valued measure (cents) → 하루 평균 is the median; all: not a measurement (내 만족도) — every take counts.
 * → {value, basis: 'take' | 'mean' | 'median' | 'reliable' | 'best' | 'unreliable' | 'none', used (take or null), n, count}. */
function dayValue(day, mode, {get, better = 1, note = false, all = false} = {}) {
  const pool = all ? day.takes : day.reliable, rows = pool.map(t => ({t, v:get(t)})).filter(x => x.v != null), n = day.takes.length;
  if (!rows.length) { // no reliable take with a value: the day's latest take as it is — never a day value
    const last = all ? null : day.takes.slice().reverse().find(t => get(t) != null);
    return last ? {value:get(last), basis:'unreliable', used:last, n, count:0} : {value:null, basis:'none', used:null, n, count:0};
  }
  const count = rows.length, pickOf = list => mostReliable(list.map(x => x.t));
  if (count === 1) return {value:rows[0].v, basis:'take', used:rows[0].t, n, count};
  if (mode === 'average') return note ? {value:Math.round(median(rows.map(x => x.v))), basis:'median', used:null, n, count}
    : {value:r1(rows.reduce((s, x) => s + x.v, 0) / count), basis:'mean', used:null, n, count};
  if (mode === 'best') { const top = rows.reduce((b, x) => (x.v - b.v) * (better < 0 ? -1 : 1) > 0 ? x : b).v, used = pickOf(rows.filter(x => x.v === top)); return {value:top, basis:'best', used, n, count}; }
  const used = pickOf(rows); return {value:get(used), basis:'reliable', used, n, count};
}

/** All six measures for one song's takes. reference = song.vocalRange (confirmed) or null. sameDay: how several
 * takes of one day count ('all' — the default — is every take as before). */
function songReport(allTakes, {reference = null, scoreNotes = null, arNotes = null, sameDay = 'all'} = {}) {
  const out = {};
  for (const d of METRICS) {
    const takes = dayTakes(allTakes, sameDay, d.id, {reference});
    if (d.reference) {
      const withData = takes.filter(t => t.a?.metrics).sort(takeOrder);
      const latest = withData.slice().reverse().find(t => hasDetail(t.a)) || withData.at(-1);
      out[d.id] = latest ? {id:d.id, state:'reference', latest:passaggioOf(latest.a), lastId:latest.id, to:latest.date, recurring:passaggioRecurring(takes)} : {id:d.id, state:'hold', reason:'no-data'};
      continue;
    }
    const p = pickPair(takes, d.id);
    out[d.id] = p.first ? compareMetric(d.id, p.first, p.last, {reference, scoreNotes, arNotes}) : {id:d.id, state:'hold', reason:p.reason, lastId:p.last?.id};
    if (p.last) out[d.id].latest = d.id === 'range' || d.id === 'high' ? single(p.last.a, {reference})[d.id] : {value:d.id === 'phrase' ? num(p.last.a.metrics.breath?.medianPhrase) : value(p.last.a, d.id)};
  }
  return out;
}
/** One song across two periods (monthly view): the latest usable take of the earlier period vs the latest of the
 * later one, same analysis version. Songs missing from the earlier period are not compared. */
function periodReport(beforeTakes, afterTakes, {reference = null} = {}) {
  const sort = l => l.filter(t => t.a?.metrics).slice().sort(takeOrder);
  const before = sort(beforeTakes), after = sort(afterTakes), out = {};
  const why = (list, id) => { const r = list.map(t => availability(t.a, id, t.ok)); return ['reanalyze', 'v1', 'confidence', 'few-notes', 'few-phrases', 'no-stable'].find(x => r.includes(x)) || 'no-data'; };
  for (const d of METRICS) {
    if (d.reference) { const last = after.filter(t => hasDetail(t.a)).at(-1) || after.at(-1); out[d.id] = last ? {id:d.id, state:'reference', latest:passaggioOf(last.a), lastId:last.id, recurring:passaggioRecurring(after)} : {id:d.id, state:'hold', reason:'no-data'}; continue; }
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
function comparePair(first, second, {reference = null, scoreNotes = null, arNotes = null} = {}) {
  const [x, y] = [first, second].sort(byDay); // same day and no recording time: the order the person gave
  // The person picked these two takes: the same-day rule (meant for automatic pairing) does not apply.
  return Object.fromEntries(METRICS.map(d => [d.id, compareMetric(d.id, x, y, {reference, sameDay:true, scoreNotes, arNotes})]));
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
    // 고음 안정성 is judged from wobble AND hold time: the hold time of the compared songs goes with it.
    const held = d.id === 'high' ? numeric.filter(x => Number.isFinite(x.heldBefore) && Number.isFinite(x.heldAfter)) : [];
    const heldMean = k => held.length ? Math.round(held.reduce((s, x) => s + x[k], 0) / held.length * 100) / 100 : null;
    const better = count('better'), worse = count('worse'), similar = count('similar'), mixed = count('mixed'), changed = count('changed');
    let state = 'hold';
    if (d.reference) state = rows.some(x => x.latest?.state === 'reference') ? 'reference' : 'hold';
    else if (compared.length) state = !d.judged ? (changed ? 'changed' : 'similar') : better > worse ? 'better' : worse > better ? 'worse' : better || worse || mixed ? 'mixed' : 'similar';
    const latest = rows.map(x => num(x.latest?.value)).filter(v => v != null);
    return {...d, state, compared:compared.length, better, worse, similar, mixed, changed, holds,
      measured:latest.length, latestValue:latest.length ? r1(latest.reduce((s, v) => s + v, 0) / latest.length) : null,
      withheld:rows.filter(x => x.state === 'hold').length, before:mean('before'), after:mean('after'),
      ...(d.id === 'high' ? {heldBefore:heldMean('heldBefore'), heldAfter:heldMean('heldAfter')} : {}),
      basis:numeric.length ? (numeric.every(x => x.basis === 'phrases') ? 'phrases' : numeric.every(x => x.basis === 'whole') ? 'whole' : d.id === 'intonation' || d.id === 'stability' ? 'both' : '') : '', rows};
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
  if (!x || x.state === 'hold') return holdLine(x?.reason);
  if (x.id === 'range') {
    let t = '안정 최고음 ' + x.before + ' → ' + x.after + (x.delta ? ' (' + signed(x.delta) + '반음)' : ' (같음)');
    if (x.main) t += ' · 주 가창 음역 ' + (x.main.before === x.main.after ? x.main.after + ' 그대로' : x.main.before + ' → ' + x.main.after);
    return t + ' · 실력 판정 아님';
  }
  if (x.id === 'high') return x.zone + ' 구간 흔들림 ' + fmt('high', x.before) + ' → ' + fmt('high', x.after) + ' · ' + heldText(x.heldBefore, x.heldAfter);
  if (x.id === 'passaggio') return passaggioText(x.latest);
  return fmt(x.id, x.before) + ' → ' + fmt(x.id, x.after);
}
/** "유지 0.99초 → 1.2초": the hold time the 고음 안정성 verdict also depends on. */
const heldText = (before, after) => before == null || after == null ? '' : '유지 ' + before + '초 → ' + after + '초';
/** "녹음 전체로는 ±30 cent → ±9.5 cent": the whole-recording values (the ones the analysis screen shows for a take)
 * next to a same-phrase comparison, so one take never seems to have two different numbers. */
const wholeText = x => x?.whole && num(x.whole.before) != null && num(x.whole.after) != null ? '녹음 전체로는 ' + fmt(x.id, x.whole.before) + ' → ' + fmt(x.id, x.whole.after) : '';
function basisText(x) {
  if (!x || x.state === 'hold' || x.state === 'reference') return '';
  if (x.basis === 'day-mean') return (x.id === 'range' ? '그날 녹음의 중앙값끼리 비교' : '하루 평균끼리 비교 · 녹음 전체 값') + ' (녹음 ' + x.dayCounts[0] + '개 → ' + x.dayCounts[1] + '개)';
  const whole = wholeText(x) ? ' · ' + wholeText(x) : '';
  if (x.score) return (x.score.source === 'ar' ? '원곡 기준 맞은 음 비율 ' : '악보 기준 맞은 음 비율 ') + x.score.before + '% → ' + x.score.after + '% (' + (x.score.source === 'ar' ? '같은 원곡 멜로디(자동 추출) 음 ' : '같은 악보 음 ') + x.score.notes + '개 · ±50 cent) · cent 비교는 ' + (x.basis === 'phrases' ? '같은 프레이즈 ' + x.matched + '개' : '곡 전체') + whole;
  if (x.basis === 'phrases') return '같은 프레이즈 ' + x.matched + '개 비교' + (x.id === 'phrase' && x.tempo && x.tempo !== 1 ? ' · 템포 보정' : '') + whole;
  if (x.basis === 'whole') return '곡 전체 비교 (같은 프레이즈를 충분히 찾지 못함)';
  if (x.id === 'high') return x.fromScore ? '악보 최고음 기준 고음 구간' : '두 녹음 공통 고음 구간';
  return '';
}
function passaggioText(p) {
  if (!p || p.state === 'hold') return holdLine(p?.reason);
  if (!p.found) return '음높이에 따라 흔들림이 크게 달라지는 구간이 보이지 않았어요 (평소 ±' + p.baseline + ' cent)';
  return (p.from === p.to ? p.from : p.from + '–' + p.to) + ' 부근에서 지속음 흔들림이 커요 (±' + p.wobble + ' cent, 평소 ±' + p.baseline + ' cent)';
}
const PASSAGGIO_NOTE = '음정 데이터만으로 판별 불가, 선생님 판단 참고';
/** A value read from ONE recording (녹음 상세, 두 녹음 비교): it moves with the song and the day. */
const PASSAGGIO_SINGLE = '이 녹음에서만 본 참고값';
/** "최근 24개 중 15개에서 E4~F4 근처 …", or 판정 보류 with the counts. */
function passaggioRecurringText(r) {
  if (!r) return holdLine('no-data');
  if (r.state === 'hold') return holdLine(r.reason) + (r.reason === 'few-recordings' ? ' (지금 ' + r.of + '개)' : r.reason === 'scattered' ? ' (최근 ' + r.of + '개 중 가장 많이 겹친 곳도 ' + r.count + '개)' : '');
  const head = '최근 ' + r.of + '개 중 ' + r.count + '개에서 ';
  if (!r.found) return head + '흔들림이 크게 달라지는 구간이 보이지 않았어요 (평소 ±' + r.baseline + ' cent)';
  const zone = r.from === r.to ? r.from : r.from + '~' + r.to, wide = r.spread.fromMidi !== r.fromMidi || r.spread.toMidi !== r.toMidi;
  return head + zone + ' 근처' + (wide ? ' (나온 범위 ' + r.spread.from + '~' + r.spread.to + ')' : '') + ' · 지속음 흔들림 ±' + r.wobble + ' cent, 평소 ±' + r.baseline + ' cent';
}
/** The 파사지오 line of a report over several takes: what recurs (never one recording's value). */
const passaggioReportText = x => x?.state === 'hold' ? holdLine(x.reason)
  // Nothing to read at all (older analyses, no band detail): the reason the latest recording gives, as before.
  : x?.recurring?.state === 'hold' && !x.recurring.of && x.latest?.state === 'hold' ? holdLine(x.latest.reason) : passaggioRecurringText(x?.recurring);
function stateLabel(x) { return STATE[x?.state] || HOLD_LABEL; }
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
return {VERSION:2, RULES, METRICS, HOLD, STATE, MR_REMOVED_NOTE, AI_SEPARATED_NOTE, noteName, midiOf, semitones, hasDetail, availability, value, single, zoneStats, keyShift, passaggioOf,
  matchPhrases, tempoRatio, scoreNoteBasis, compareMetric, takeOrder, pickPair, songReport, SAME_DAY, SAME_DAY_NOTE, sameDayMode, days, mostReliable, dayTakes, dayValue, meanAnalysis, periodReport, comparePair, aggregate, mainHold, fmt, changeText, basisText, passaggioText, PASSAGGIO_NOTE, PASSAGGIO_SINGLE, passaggioRecurring, passaggioRecurringText, passaggioReportText, stateLabel, holdText, holdLine, pairHold, HOLD_LABEL, heldText, wholeText, aiMetrics};
});
