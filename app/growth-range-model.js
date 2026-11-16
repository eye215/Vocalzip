/* VOCAL.zip 전체 음역 흐름 (성장 2단계, docs/audit/2026-11-13-growth-unification.md §3.1 · phase C) — pure month model.
 * Read-only, no DOM, no storage (also loaded by the Node tests). Input: VzipGrowthDataset.build(...).forRange() —
 * the reliable, dated takes of 곡 녹음 · 매일 보이스 체크 · 트레이닝 · 레슨 녹음, each with its group.
 *
 *   const model = VzipGrowthRange.build(ds.forRange(), {today:'2026-11-13', groups:['song', 'lesson']})
 *   model.months   every month from the first recording to today's month; a month without a sample is there, empty
 *   model.shown    the last 12 of them (the chart)        model.all     the same summary over every counted take
 *   model.change   the first and the last month of the latest 3-month window, or what is missing to compare them
 *   model.groups   [{id, label, on, counted}]             model.left / model.excluded   what was not counted, and why
 *   model.compare  처음·지금: the earliest and the latest window of months side by side (same rules), or what is missing
 *   model.usual    the usual main range of the chosen kinds (median, end by end) the unusual recordings were held against, or null
 *
 * WHAT AN ANALYSIS REALLY HOLDS (audited in app/vocal-analysis.js rangeOf, v2), and so what is shown:
 *   자주 닿은 최고음 · 최저음   range.validHigh.cents / range.lowCents — the highest and lowest note held ≥ 0.2 s as one
 *                              confident, continuous stretch (유효 최고음 · 유효 최저음). Never range.instantaneous.
 *   주로 부른 음역              range.main (10th–90th percentile of the confident voiced time of ONE recording). A
 *                              month's band is the median of its recordings' low ends and of their high ends.
 *   안정 최고음                 range.stableHigh.cents (≥ 0.5 s, small wobble).
 *   NOT there, so not shown: a stable LOWEST note (the analysis has none), and how long each pitch was sung.
 *   v1 analyses hold only range.low/high = the lowest/highest detected note with no hold or confidence rule: another
 *   measurement. They are left out (reason 'v1'), never mixed in; analysing again brings them in.
 *
 * WHICH RECORDINGS COUNT FOR RANGE — stricter than the verdict rule (`ok`: voice ≥ 10 s, voice ≥ 3 dB over the MR,
 * pitch confidence ≥ 0.8). That rule is fine for averages like intonation; a range is made of EXTREMES, and over a loud
 * accompaniment the detector reads the bass and the top of the band as held notes (a real library showed D#2 ~ C6
 * every month). So, on top of `ok`:
 *   1. Separation (RULES.separationDb): the voice must be clearly apart from the accompaniment — voiceOverMrDb is null
 *      (no accompaniment was found on its own) or ≥ 10 dB (what the analysis screen itself calls good), or the analysis
 *      was made on the AI-separated voice (confidence.aiSeparated, set by worker/separation-worker.mjs). A take measured
 *      after subtracting the MR file (confidence.mrRemoved) follows the dB rule on what was left. Otherwise the
 *      recording is left out, reason 'weak-separation'.
 *   2. Detector limits (DETECTOR): the pitch search runs from 75 Hz to 1100 Hz (FMIN/FMAX in app/vocal-analysis.js:
 *      D2+37 cent … C#6−14 cent). A lowest note at D#2 or below, or a highest / stable highest note at C6 or above
 *      (the bound's note and its neighbour) is the edge of the search, not a sung note: that END of that recording is
 *      dropped and the other end kept (counted in `dropped`).
 *   3. Octave-like end (RULES.octaveGapSemitones): the pitch reader sometimes locks an octave away (or onto the
 *      accompaniment) for a moment. In the owner's library (2,246 recordings, 16 months) the distance of a recording's
 *      highest note above the top of ITS OWN main range is bimodal — 1–4 semitones, a valley at 5–6, then 7–14 peaking
 *      at 11–12 — and so is the lowest note below it. An end more than 6 semitones outside the recording's own main
 *      range is that second mode: only that end is dropped (`octave`), the rest of the recording counts.
 *   4. Unusual recording (RULES.unusualSemitones): a recording whose main range sits far from the usual one (main low
 *      more than 9 semitones under the median main low of the counted recordings of the chosen kinds, or main high
 *      more than 9 over the median main high) is another voice or a wholly octave-shifted reading: left out, reason
 *      'unusual-range'. Applied only when at least RULES.unusualMinRecordings recordings give the median.
 *   5. A note many recordings reach, not a few (RULES.share): a period's 자주 닿은 최고음 is the note that at least a
 *      quarter of its kept highest notes reach or exceed — K = max(3, ceil(25 % of the recordings that kept that end)) —
 *      자주 닿은 최저음 likewise from the low side, 안정 최고음 likewise from the kept stable notes. With fewer than 3
 *      counted recordings nothing can be told apart: the extreme is used as it is and the period is a small sample
 *      (`enough:false`). When fewer than K recordings have that end at all, the value is missing (null), never taken
 *      from fewer. 안정 최고음 is shown only with 자주 닿은 최고음 and never above it.
 *   The all-time summary and 처음·지금 follow the same rules over their own recordings. There is no fallback to the
 *   weaker rule: a month whose recordings all fail is empty.
 *
 * Nothing is estimated: a month without a counted recording has no values (null), and no month is filled in from
 * its neighbours. A change of range is an observation (관측), never a verdict about skill. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./growth-metrics-model.js') : root.VzipGrowthMetrics);
  if (node) module.exports = api; else root.VzipGrowthRange = api;
})(typeof self !== 'undefined' ? self : globalThis, G => {
'use strict';
const VERSION = 3;
const GROUPS = [['song', '곡 녹음'], ['voice-check', '보이스 체크'], ['training', '트레이닝'], ['lesson', '레슨']];
const RULES = {
  minSamples:3,     // counted recordings a month needs before it is compared with another month; also the least K
  // The three numbers below were calibrated on the owner's real numbers-only diagnosis (2026-11: 2,246 recordings over
  // 16 months, 1,979 counted). With them the months read steadily: usual top C5 (2025-08…12) → D#5–E5 (2026-08…11).
  share:.25,        // K = max(minSamples, ceil(share × recordings that kept that end)): the note a quarter of them reach.
                    // From this data: with 5 % the top was still B5 (the octave-away readings alone were > 5 %).
  octaveGapSemitones:6,   // an end more than this far outside the recording's OWN main range is an octave-like reading.
                    // From this data: highest − main high is bimodal, valley at 5–6 semitones, second mode 7–14 (peak 11–12);
                    // lowest below main low likewise (second mode 12–18). About half of the recordings carry one.
  unusualSemitones:9,     // main low this far under / main high this far over the median of the counted recordings:
                    // another voice or a wholly octave-shifted reading. From this data: e.g. main low F2 in 2026-07.
  unusualMinRecordings:20, // fewer recordings than this give no usual range to compare with: the rule is skipped
  separationDb:10,  // voice over accompaniment (dB) from which the voice is clearly apart (null = none found: counts)
  boundSemitones:1, // an end within this many semitones of the detector's bound note is the search edge, not a note
  months:12,        // months on the chart
  window:3,         // the plain-words line compares the first and last month of the latest 3 months
  // 처음·지금: each side takes whole months with recordings from its end until it has this many months or this many
  // counted recordings, whichever comes first — enough for K to mean something, short enough to still be "then"/"now".
  compareMonths:3, compareRecordings:30
};
/* The pitch detector's search range. app/vocal-analysis.js keeps FMIN/FMAX to itself, so they are written here and
 * tests/growth-range.test.cjs reads that file and fails when they differ. Cents are MIDI × 100, as in the analysis. */
const centsOfHz = hz => 1200 * Math.log2(hz / 440) + 6900;
const DETECTOR = (() => { const minHz = 75, maxHz = 1100, floorCents = Math.round(centsOfHz(minHz)), ceilingCents = Math.round(centsOfHz(maxHz));
  const floorMidi = Math.round(floorCents / 100), ceilingMidi = Math.round(ceilingCents / 100);
  // lowDropMidi: a lowest note at or below it is dropped; highDropMidi: a highest (stable) note at or above it is.
  return {minHz, maxHz, floorCents, ceilingCents, floorMidi, ceilingMidi, lowDropMidi:floorMidi + RULES.boundSemitones, highDropMidi:ceilingMidi - RULES.boundSemitones}; })();
/* Why a recording of a chosen group is not counted, in the words of the screen (long) and of a month row (short). */
const LEFT = {
  'no-analysis':['아직 분석하지 않은 녹음', '분석 전'],
  unreliable:['측정 신뢰도가 낮은 녹음 (목소리가 짧거나 반주가 커요)', '신뢰도 낮음'],
  'no-date':['날짜가 없는 녹음', '날짜 없음'],
  v1:['이전 분석(v1) 녹음 · 음역을 재는 방식이 달라요. 다시 분석하면 들어가요', '이전 분석(v1)'],
  'weak-separation':['반주와 목소리 구분이 약한 녹음 (목소리가 반주보다 10dB 이상 크지 않아요)', '반주 구분 약함'],
  'unusual-range':['주로 부른 음역이 평소와 크게 다른 녹음 — 다른 목소리이거나 옥타브가 통째로 잘못 잡혔을 수 있어요', '평소와 다른 음역'],
  'no-range':['또렷하게 이어 부른 음을 찾지 못한 녹음', '이어 부른 음 없음']
};
/* An end of a counted recording that sits on the detector's limit: only that end is dropped. */
const DROPPED = {low:'최저음이 검출 한계(D#2 이하)에 걸린 녹음 · 최저음만 뺌', high:'최고음이 검출 한계(C6 이상)에 걸린 녹음 · 최고음과 안정 최고음만 뺌', stable:'안정 최고음만 검출 한계에 걸린 녹음 · 안정 최고음만 뺌'};
/* An end of a counted recording more than RULES.octaveGapSemitones outside its own main range: only that end is dropped. */
const OCTAVE = {low:'한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최저음만 뺌', high:'한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최고음만 뺌', stable:'한 옥타브쯤 떨어져 잠깐 잡힌 음 · 안정 최고음만 뺌'};
/* Recordings that belong to none of the four groups (never counted, whatever is chosen). */
const EXCLUDED = {
  unassigned:'곡·레슨·트레이닝·보이스 체크 어디에도 속하지 않는 파일',
  'practice-room':'노래 연습실 제출 녹음',
  'song-missing':'곡이 삭제된 녹음',
  deleted:'삭제한 녹음'
};
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const name = midi => G.noteName(midi);
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const monthOf = day => /^\d{4}-\d{2}-\d{2}/.test(String(day || '')) ? String(day).slice(0, 7) : '';
const shiftMonth = (key, n) => { const [y, m] = key.split('-').map(Number), i = y * 12 + (m - 1) + n; return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'); };

/** Clearly apart from the accompaniment: none found on its own, loud enough over it, or measured on the AI-separated voice. */
const separated = a => { const db = a?.confidence?.voiceOverMrDb; return !!a?.confidence?.aiSeparated || db == null || (typeof db === 'number' && db >= RULES.separationDb); };
/** What one take's analysis says about range (MIDI numbers), or why it cannot be counted. An end on the detector's
 * limit is null and named in `dropped`; an end an octave or so outside the take's own main range is null and named in
 * `octave` (the detector's limit comes first: an end is counted under one reason only). */
function read(a) {
  if (!a?.metrics) return {why:'no-analysis'};
  if (!(a.v >= 2)) return {why:'v1'};
  if (!separated(a)) return {why:'weak-separation'};
  const g = a.metrics.range, topCents = num(g?.validHigh?.cents ?? g?.highCents), top = G.midiOf(topCents);
  if (top == null) return {why:'no-range'};
  const bottom = G.midiOf(g.lowCents), held = G.midiOf(g.stableHigh?.cents), mainLow = G.midiOf(g.main?.lowCents), mainHigh = G.midiOf(g.main?.highCents);
  const main = mainLow != null && mainHigh != null && mainLow <= mainHigh, gap = RULES.octaveGapSemitones * 100;
  const mainLowCents = main ? num(g.main.lowCents) : null, mainHighCents = main ? num(g.main.highCents) : null;
  const topBound = top >= DETECTOR.highDropMidi, lowThere = bottom != null && bottom <= top, lowBound = lowThere && bottom <= DETECTOR.lowDropMidi;
  // The stable note goes with the highest note as measured: never above it, and on the limit with it.
  const heldThere = held != null && !topBound, heldOk = heldThere && held <= top && held < DETECTOR.highDropMidi;
  const octave = {high:!topBound && main && topCents - mainHighCents > gap, low:lowThere && !lowBound && main && mainLowCents - num(g.lowCents) > gap,
    stable:heldOk && main && num(g.stableHigh.cents) - mainHighCents > gap};
  return {high:topBound || octave.high ? null : top, low:lowThere && !lowBound && !octave.low ? bottom : null, stable:heldOk && !octave.stable ? held : null,
    mainLow:main ? mainLow : null, mainHigh:main ? mainHigh : null, mainLowCents, mainHighCents,
    dropped:{high:topBound, low:lowBound, stable:heldThere && !heldOk}, octave,
    voiced:num(a.metrics.voicedSeconds) || 0, mrRemoved:!!a.confidence?.mrRemoved, aiSeparated:!!a.confidence?.aiSeparated};
}
/** The usual main range of these recordings — the median main low and main high (cents) — or null when fewer than
 * RULES.unusualMinRecordings of them have a main range (then nothing is called unusual). */
function usualOf(rows) {
  const mains = rows.filter(r => r.mainLowCents != null);
  return mains.length >= RULES.unusualMinRecordings ? {lowCents:median(mains.map(r => r.mainLowCents)), highCents:median(mains.map(r => r.mainHighCents)), samples:mains.length} : null;
}
/** Main range far from the usual one: main low too far under it, or main high too far over it. */
const unusual = (r, usual) => !!usual && r.mainLowCents != null && (usual.lowCents - r.mainLowCents > RULES.unusualSemitones * 100 || r.mainHighCents - usual.highCents > RULES.unusualSemitones * 100);
/** K of one end of a period: how many of the `kept` recordings that have that end must reach a note for it to count.
 * n: the period's counted recordings (default: all kept) — under RULES.minSamples the extreme is used as it is. */
const needOf = (kept, n = kept) => n < RULES.minSamples ? 1 : Math.max(RULES.minSamples, Math.ceil(kept * RULES.share));
/** The top (dir 1) or bottom (dir −1) that at least k of the values reach: the k-th from that end. null when fewer than
 * k recordings have the value at all. `beyond`: how many recordings went further (and were not enough to count). */
function edge(values, dir, k) {
  const s = values.filter(v => v != null).sort((x, y) => dir * (y - x));
  if (s.length < k) return null;
  const midi = s[k - 1];
  return {midi, note:name(midi), samples:s.length, k, beyond:s.filter(v => dir * (v - midi) > 0).length};
}
/** One end of a period: K from the recordings that kept that end. */
const endOf = (rows, key, dir) => { const kept = rows.map(r => r[key]).filter(v => v != null); return edge(kept, dir, needOf(kept.length, rows.length)); };
/** One period (a month, or everything): its counted recordings → the values shown. */
function summarize(rows) {
  const byGroup = Object.fromEntries(GROUPS.map(([id]) => [id, 0]));
  for (const r of rows) byGroup[r.group]++;
  const mains = rows.filter(r => r.mainLow != null), high = endOf(rows, 'high', 1), held = endOf(rows, 'stable', 1);
  // 안정 최고음 only with 자주 닿은 최고음, and never above it (its K comes from other recordings than the high's).
  const stable = !high || !held ? null : held.midi > high.midi ? {...held, midi:high.midi, note:name(high.midi), capped:true} : held;
  // k: K when every recording keeps its ends; each value carries the K it was really made with.
  return {n:rows.length, k:needOf(rows.length), byGroup, songs:new Set(rows.filter(r => r.songId).map(r => r.songId)).size,
    voicedSeconds:Math.round(rows.reduce((s, r) => s + r.voiced, 0)),
    high, low:endOf(rows, 'low', -1), stable,
    // 주로 부른 음역: the median recording, end by end — unusual recordings do not move it.
    main:mains.length ? {low:{midi:Math.round(median(mains.map(r => r.mainLow))), note:''}, high:{midi:Math.round(median(mains.map(r => r.mainHigh))), note:''}, samples:mains.length} : null,
    dropped:{low:rows.filter(r => r.dropped.low).length, high:rows.filter(r => r.dropped.high).length, stable:rows.filter(r => r.dropped.stable).length},
    octave:{low:rows.filter(r => r.octave.low).length, high:rows.filter(r => r.octave.high).length, stable:rows.filter(r => r.octave.stable).length},
    mrRemoved:rows.filter(r => r.mrRemoved).length, aiSeparated:rows.filter(r => r.aiSeparated).length,
    enough:rows.length >= RULES.minSamples};
}
const named = s => { if (s.main) { s.main.low.note = name(s.main.low.midi); s.main.high.note = name(s.main.high.midi); } return s; };
const tally = list => { const out = {}; for (const x of list) out[x.why] = (out[x.why] || 0) + 1; return out; };

/** The note axis of a chart of these months: a little room around every value, ticks on round notes. */
function axisOf(months) {
  const vals = [];
  for (const m of months) for (const x of [m.high, m.low, m.stable, m.main?.low, m.main?.high]) if (x) vals.push(x.midi);
  if (!vals.length) return null;
  const min = Math.min(...vals) - 1, max = Math.max(...vals) + 1;
  const step = [1, 2, 3, 4, 6, 12].find(s => (max - min) / s <= 6) || 12, ticks = [];
  for (let midi = Math.ceil(min / step) * step; midi <= max; midi += step) ticks.push({midi, note:name(midi)});
  return {min, max, step, ticks};
}

/**
 * range: ds.forRange() — {takes:[{id, songId, a, date, group}], excluded:{why:n}, left:[{id, group, date, why, a}]}.
 * options.groups: the groups to count (default: all four). options.today: 'YYYY-MM-DD' (Korea day) — the series runs
 * to that month even when it has no recording yet.
 */
function build(range, {groups, today} = {}) {
  const on = new Set(Array.isArray(groups) ? groups : GROUPS.map(([id]) => id));
  const counted = [], left = [];
  for (const t of range?.takes || []) {
    const r = read(t.a), month = monthOf(t.date);
    if (r.why || !month) left.push({id:t.id, group:t.group, date:t.date || '', why:r.why || 'no-date'});
    else counted.push({...r, id:t.id, group:t.group, songId:t.songId || '', date:t.date, month});
  }
  for (const x of range?.left || []) left.push({id:x.id, group:x.group, date:x.date || '', why:x.why});
  // Rule 4: the usual main range of the chosen kinds; a recording far from it is left out entirely.
  const chosen = counted.filter(r => on.has(r.group)), usual = usualOf(chosen), odd = new Set(chosen.filter(r => unusual(r, usual)));
  for (const r of odd) left.push({id:r.id, group:r.group, date:r.date, why:'unusual-range'});
  const mine = chosen.filter(r => !odd.has(r)), mineLeft = left.filter(x => on.has(x.group));
  // How many recordings a kind that is off would bring in: the usual range is then that of the chosen kinds and this one.
  const addedBy = id => { const own = counted.filter(r => r.group === id), u = usualOf([...chosen, ...own]); return own.filter(r => !unusual(r, u)).length; };
  // The months: first recording of a chosen group (counted or not) → the latest one, or today's month.
  const keys = [...mine.map(r => r.month), ...mineLeft.map(x => monthOf(x.date))].filter(Boolean).sort();
  const months = [];
  if (keys.length) {
    const end = [keys.at(-1), monthOf(today)].sort().at(-1);
    for (let key = keys[0]; key <= end; key = shiftMonth(key, 1)) {
      const s = named(summarize(mine.filter(r => r.month === key)));
      months.push({month:key, ...s, empty:!s.n, left:tally(mineLeft.filter(x => monthOf(x.date) === key))});
    }
  }
  const shown = months.slice(-RULES.months);
  const all = named(summarize(mine));
  const dates = mine.map(r => r.date).sort();
  return {
    // A kind that is on shows what is really counted (without the unusual recordings); one that is off, what it would add.
    groups:GROUPS.map(([id, label]) => ({id, label, on:on.has(id), counted:on.has(id) ? mine.filter(r => r.group === id).length : addedBy(id)})),
    months, shown, axis:axisOf(shown),
    all:{...all, firstDate:dates[0] || '', lastDate:dates.at(-1) || '', months:months.filter(m => m.n).length},
    change:changeOf(months, today),
    compare:compareOf(mine),
    usual:usual ? {low:{midi:Math.round(usual.lowCents / 100), note:name(Math.round(usual.lowCents / 100))}, high:{midi:Math.round(usual.highCents / 100), note:name(Math.round(usual.highCents / 100))}, samples:usual.samples} : null,
    left:tally(mineLeft),                                   // recordings of the chosen groups that are not counted
    used:{counted:mine.length, total:mine.length + mineLeft.length},   // "신뢰도 높은 녹음 N개 (전체 M개 중)"
    excluded:Object.fromEntries(Object.keys(EXCLUDED).filter(k => range?.excluded?.[k]).map(k => [k, range.excluded[k]])),
    empty:!mine.length, none:!on.size
  };
}
/** First vs last month of the latest 3-month window that ends at the newest month with a recording. Compared only
 * when both months have enough recordings; otherwise what is missing. */
function changeOf(months, today) {
  const withData = months.filter(m => m.n);
  if (!withData.length) return {state:'none'};
  const to = withData.at(-1), fromKey = shiftMonth(to.month, -(RULES.window - 1));
  const from = months.find(m => m.month === fromKey) || {month:fromKey, n:0};
  const recent = !monthOf(today) || to.month >= shiftMonth(monthOf(today), -1);
  const base = {from:from.month, to:to.month, recent, samples:[from.n, to.n], need:RULES.minSamples};
  const missing = [from, to].filter(m => m.n < RULES.minSamples).map(m => ({month:m.month, n:m.n}));
  if (missing.length) return {...base, state:'short', missing};
  const pair = (a, b) => a && b ? {from:a.note, to:b.note, delta:b.midi - a.midi} : null;
  const high = pair(from.high, to.high), low = pair(from.low, to.low);
  // Enough recordings, but no note that enough of them share at either end: nothing to compare.
  return high || low ? {...base, state:'ok', high, low} : {...base, state:'short', missing:[], unshared:true};
}

/* ---------- 처음 · 지금 ---------- */
const COMPARE_ROWS = [['mainLow', '주로 부른 음역 아래', s => s.main?.low], ['mainHigh', '주로 부른 음역 위', s => s.main?.high],
  ['low', '자주 닿은 최저음', s => s.low], ['high', '자주 닿은 최고음', s => s.high], ['stable', '안정 최고음', s => s.stable]];
/** "2025.08–10", "2025.11–2026.01", "2026.11". */
const periodLabel = (from, to) => { const a = from.replace('-', '.'), b = to.replace('-', '.'); return from === to ? a : from.slice(0, 4) === to.slice(0, 4) ? a + '–' + b.slice(5) : a + '–' + b; };
/**
 * The earliest window against the latest one, each summarized by the same rules as a month (K over the window).
 * A window is whole months that have counted recordings, taken from its end of the record until it holds
 * RULES.compareMonths such months or RULES.compareRecordings recordings, whichever comes first. The two must not share
 * a month (a window always holds at least RULES.minSamples recordings then); otherwise nothing is compared and the
 * result says what is short.
 * rows: the counted recordings of the chosen kinds (each with .month).
 */
function compareOf(rows) {
  const byMonth = new Map();
  for (const r of rows) { const list = byMonth.get(r.month) || []; list.push(r); byMonth.set(r.month, list); }
  const keys = [...byMonth.keys()].sort();
  const take = list => { const out = []; let n = 0; for (const key of list) { if (out.length >= RULES.compareMonths || n >= RULES.compareRecordings) break; out.push(key); n += byMonth.get(key).length; } return out.sort(); };
  const need = {months:RULES.compareMonths, recordings:RULES.compareRecordings};
  if (!keys.length) return {state:'none', dataMonths:0, need};
  const first = take(keys), now = take(keys.slice().reverse());
  const side = months => { const s = named(summarize(months.flatMap(key => byMonth.get(key)))); return {...s, from:months[0], to:months.at(-1), months, period:periodLabel(months[0], months.at(-1))}; };
  const a = side(first), b = side(now);
  // Sharing a month means the record is too short for a "then" and a "now" (fewer than 3 + 3 months, or 30 + 30 recordings).
  if (first.at(-1) >= now[0]) return {state:'short', dataMonths:keys.length, first:{from:a.from, to:a.to, period:a.period, n:a.n}, now:{from:b.from, to:b.to, period:b.period, n:b.n}, need};
  const table = COMPARE_ROWS.map(([key, label, get]) => { const x = get(a) || null, y = get(b) || null;
    return {key, label, first:x?.note || null, now:y?.note || null, delta:x && y ? y.midi - x.midi : null, missing:x && y ? '' : !x && !y ? 'both' : x ? 'now' : 'first'}; });
  return {state:'ok', dataMonths:keys.length, first:a, now:b, rows:table, axis:axisOf([a, b]), need};
}
/** "처음(2025.08–10) → 지금(2026.09–11) 주로 부른 음역 C4–A#4 → C#4–A#4", or what is missing. */
function compareText(c) {
  if (!c || c.state === 'none') return '아직 음역을 셀 수 있는 녹음이 없어요.';
  if (c.state === 'short') return '아직 비교할 만큼 기간이 쌓이지 않았어요 · ' + (c.dataMonths < 2 ? '녹음이 있는 달이 ' + c.dataMonths + '개뿐이에요'
    : '처음(' + c.first.period + ')과 지금(' + c.now.period + ') 기간이 겹쳐요 · 녹음이 있는 달이 더 쌓이면 비교할 수 있어요 (지금 ' + c.dataMonths + '개월)');
  const dash = x => x.low.note === x.high.note ? x.low.note : x.low.note + '–' + x.high.note, head = '처음(' + c.first.period + ') → 지금(' + c.now.period + ') ';
  if (c.first.main && c.now.main) return head + '주로 부른 음역 ' + dash(c.first.main) + ' → ' + dash(c.now.main);
  const both = (a, b) => a.low && a.high && b.low && b.high;
  return both(c.first, c.now) ? head + '자주 닿은 음역 ' + dash(c.first) + ' → ' + dash(c.now) : head + '두 기간에 함께 잴 수 있는 음역이 아직 없어요';
}
/** The 차이 cell of the table: "같음", "+2반음", or "—". */
const deltaText = row => row.delta == null ? '—' : signed(row.delta);
/** Why a cell of the table is empty. */
const missingText = row => row.missing ? (row.missing === 'both' ? '두 기간 모두' : row.missing === 'first' ? '처음 기간에' : '지금 기간에') + ' 여러 녹음에 함께 나온 값이 없어요' : '';

/* ---------- wording (plain 해요체; 관측, never a verdict) ---------- */
const monthLabel = (key, withYear = false) => (withYear ? key.slice(0, 4) + '년 ' : '') + Number(key.slice(5, 7)) + '월';
const signed = n => n === 0 ? '같음' : (n > 0 ? '+' : '−') + Math.abs(n) + '반음';
const spanText = (a, b) => a.note === b.note ? a.note : a.note + ' ~ ' + b.note;
/** "최근 3개월(9월 → 11월) 자주 닿은 최고음 A4 → B4 (+2반음) · 자주 닿은 최저음 G3 → G3 (같음)" or what is missing. */
function changeText(c) {
  if (!c || c.state === 'none') return '아직 음역을 셀 수 있는 녹음이 없어요.';
  const year = c.from.slice(0, 4) !== c.to.slice(0, 4);
  if (c.state === 'short' && c.unshared) return '표본이 부족해요 · 두 달 모두에서 여러 녹음에 함께 나온 최고음·최저음이 아직 없어요';
  if (c.state === 'short') return '표본이 부족해요 · ' + c.missing.map(m => monthLabel(m.month, year) + (m.n ? ' 녹음 ' + m.n + '개' : ' 녹음 없음')).join(', ') + ' · 한 달에 ' + c.need + '개부터 비교해요';
  const part = (label, x) => x ? label + ' ' + x.from + ' → ' + x.to + ' (' + signed(x.delta) + ')' : '';
  return (c.recent ? '최근 3개월' : '마지막 기록 3개월') + '(' + monthLabel(c.from, year) + ' → ' + monthLabel(c.to, year) + ') ' +
    [part('자주 닿은 최고음', c.high), part('자주 닿은 최저음', c.low)].filter(Boolean).join(' · ');
}
/** The values of one period in one line: "자주 닿은 음 G3 ~ B4 · 주로 부른 음역 C4 ~ D5 · 안정 최고음 F5". '' when it has none. */
function valuesText(s) {
  if (!s?.n) return '';
  return [s.low && s.high ? '자주 닿은 음 ' + spanText(s.low, s.high) : s.high ? '자주 닿은 최고음 ' + s.high.note : s.low ? '자주 닿은 최저음 ' + s.low.note : '',
    s.main ? '주로 부른 음역 ' + spanText(s.main.low, s.main.high) : '',
    s.stable ? '안정 최고음 ' + s.stable.note : ''].filter(Boolean).join(' · ') || '여러 녹음에 함께 나온 음이 아직 없어요';
}
const voicedText = sec => sec >= 60 ? Math.round(sec / 60) + '분' : sec + '초';
/** What a period was made of: "녹음 5개 (곡 녹음 3 · 보이스 체크 2) · 2곡 · 목소리 4분 · 최고음 3개 · 최저음 3개 이상의 녹음이 닿은 음".
 * The numbers are each end's K (a quarter of the recordings that kept that end, 3 at least). */
function sampleText(s) {
  if (!s?.n) return '';
  const by = GROUPS.filter(([id]) => s.byGroup[id]).map(([id, label]) => label + ' ' + s.byGroup[id]).join(' · ');
  return ['녹음 ' + s.n + '개 (' + by + ')', s.songs ? s.songs + '곡' : '', '목소리 ' + voicedText(s.voicedSeconds),
    s.mrRemoved ? '반주를 뺀 뒤 잰 녹음 ' + s.mrRemoved + '개' : '', s.aiSeparated ? 'AI 분리 후 잰 녹음 ' + s.aiSeparated + '개' : '',
    !s.enough ? '표본 적음' : s.high || s.low ? [s.high ? '최고음 ' + s.high.k + '개' : '', s.low ? '최저음 ' + s.low.k + '개' : ''].filter(Boolean).join(' · ') + ' 이상의 녹음이 닿은 음' : ''].filter(Boolean).join(' · ');
}
/** "뺀 녹음 2개: 신뢰도 낮음 1 · 분석 전 1" — '' when nothing was left out. */
function leftText(left) {
  const keys = Object.keys(LEFT).filter(k => left?.[k]);
  return keys.length ? '뺀 녹음 ' + keys.reduce((n, k) => n + left[k], 0) + '개: ' + keys.map(k => LEFT[k][1] + ' ' + left[k]).join(' · ') : '';
}
/** "검출 한계에 걸려 뺀 끝: 최저음 3 · 최고음 2" — '' when none. */
function droppedText(d) {
  const parts = [d?.low ? '최저음 ' + d.low : '', d?.high ? '최고음 ' + d.high : '', d?.stable ? '안정 최고음 ' + d.stable : ''].filter(Boolean);
  return parts.length ? '검출 한계에 걸려 뺀 끝: ' + parts.join(' · ') : '';
}

/** "한 옥타브쯤 떨어져 잠깐 잡힌 음이라 뺀 끝: 최저음 9 · 최고음 12" — '' when none. */
function octaveText(d) {
  const parts = [d?.low ? '최저음 ' + d.low : '', d?.high ? '최고음 ' + d.high : '', d?.stable ? '안정 최고음 ' + d.stable : ''].filter(Boolean);
  return parts.length ? '한 옥타브쯤 떨어져 잠깐 잡힌 음이라 뺀 끝: ' + parts.join(' · ') : '';
}

/* ---------- 진단 파일 (numbers only) ---------- */
/** One row per recording of the four groups — numbers and the decision only: no id, no title, no song, no file name,
 * no date finer than the month. For calibrating the rules on a real library. generatedMonth: 'YYYY-MM'. */
function diagnosis(range, {generatedMonth = ''} = {}) {
  const centsOf = v => typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
  // The usual main range of every kind together (the export has no chips), from the recordings counted so far.
  const reads = new Map((range?.takes || []).map(t => [t, read(t.a)]));
  const usual = usualOf([...reads].filter(([t, r]) => !r.why && monthOf(t.date)).map(([, r]) => r));
  const row = (group, date, a, why, r = a ? read(a) : {why:'no-analysis'}) => {
    const g = a?.metrics?.range, c = a?.confidence;
    const reason = why || r.why || (monthOf(date) ? unusual(r, usual) ? 'unusual-range' : '' : 'no-date');
    return {month:monthOf(date), group, version:a?.v ?? null, voicedSeconds:centsOf(a?.metrics?.voicedSeconds), pitchConfidence:num(c?.pitchConfidence), voiceOverMrDb:num(c?.voiceOverMrDb),
      aiSeparated:!!c?.aiSeparated, mrRemoved:!!c?.mrRemoved,
      lowCents:centsOf(g?.lowCents), highCents:centsOf(g?.validHigh?.cents ?? g?.highCents), stableHighCents:centsOf(g?.stableHigh?.cents), mainLowCents:centsOf(g?.main?.lowCents), mainHighCents:centsOf(g?.main?.highCents),
      counted:!reason, reason, droppedLow:!reason && !!r.dropped?.low, droppedHigh:!reason && !!r.dropped?.high, droppedStable:!reason && !!r.dropped?.stable,
      // The octave flags are also set on a recording left out as unusual (they describe its numbers); `unusual` is the main-range rule.
      octaveLow:!!r.octave?.low, octaveHigh:!!r.octave?.high, octaveStable:!!r.octave?.stable, unusual:reason === 'unusual-range'};
  };
  const rows = [...(range?.takes || []).map(t => row(t.group, t.date, t.a, '', reads.get(t))), ...(range?.left || []).map(x => row(x.group, x.date, x.a || null, x.why))]
    // Month, kind, then the numbers: the order says nothing about days or files.
    .sort((x, y) => x.month.localeCompare(y.month) || x.group.localeCompare(y.group) || (x.highCents ?? 0) - (y.highCents ?? 0) || (x.lowCents ?? 0) - (y.lowCents ?? 0) || (x.voicedSeconds ?? 0) - (y.voicedSeconds ?? 0));
  const reasons = {}; for (const r of rows) if (r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  const kept = key => rows.filter(r => r.counted && r[key]).length;
  return {kind:'vocalzip-range-diagnosis', version:2, modelVersion:VERSION, generatedMonth:monthOf(generatedMonth + '-01'),
    detector:{minHz:DETECTOR.minHz, maxHz:DETECTOR.maxHz, floorCents:DETECTOR.floorCents, ceilingCents:DETECTOR.ceilingCents, lowDroppedAtOrBelow:name(DETECTOR.lowDropMidi), highDroppedAtOrAbove:name(DETECTOR.highDropMidi)},
    rules:{reliable:'voicedSeconds >= 10, voiceOverMrDb null or >= 3, pitchConfidence >= 0.8 (v2)', separationDb:RULES.separationDb, separation:'voiceOverMrDb null or >= separationDb, or aiSeparated',
      boundSemitones:RULES.boundSemitones, minSamples:RULES.minSamples, share:RULES.share, k:'max(minSamples, ceil(share * recordings that kept that end))', mainRange:'median of the recordings, end by end',
      octaveGapSemitones:RULES.octaveGapSemitones, octave:'an end more than octaveGapSemitones outside the recording\'s own main range is dropped (that end only)',
      unusualSemitones:RULES.unusualSemitones, unusualMinRecordings:RULES.unusualMinRecordings, unusual:'main low more than unusualSemitones under the median main low, or main high more than that over the median main high: left out',
      usualMainLowCents:usual ? Math.round(usual.lowCents) : null, usualMainHighCents:usual ? Math.round(usual.highCents) : null},
    counts:{rows:rows.length, counted:rows.filter(r => r.counted).length, reasons, droppedLow:rows.filter(r => r.droppedLow).length, droppedHigh:rows.filter(r => r.droppedHigh).length, droppedStable:rows.filter(r => r.droppedStable).length,
      octaveLow:kept('octaveLow'), octaveHigh:kept('octaveHigh'), octaveStable:kept('octaveStable'),
      neverCounted:Object.fromEntries(Object.keys(EXCLUDED).filter(k => range?.excluded?.[k]).map(k => [k, range.excluded[k]]))},
    rows};
}
return {VERSION, GROUPS, RULES, DETECTOR, LEFT, DROPPED, OCTAVE, EXCLUDED, read, separated, usualOf, unusual, needOf, edge, summarize, axisOf, build, changeOf, shiftMonth, monthLabel, changeText, valuesText, sampleText, leftText, droppedText, octaveText, diagnosis,
  compareOf, compareText, deltaText, missingText, periodLabel};
});
