/* VOCAL.zip 전체 음역 흐름 (성장 2단계, docs/audit/2026-11-13-growth-unification.md §3.1 · phase C) — pure month model.
 * Read-only, no DOM, no storage (also loaded by the Node tests). Input: VzipGrowthDataset.build(...).forRange() —
 * the reliable, dated takes of 곡 녹음 · 매일 보이스 체크 · 트레이닝 · 레슨 녹음, each with its group.
 *
 *   const model = VzipGrowthRange.build(ds.forRange(), {today:'2026-11-13', groups:['song', 'lesson']})
 *   model.months   every month from the first recording to today's month; a month without a sample is there, empty
 *   model.shown    the last 12 of them (the chart)        model.all     the same summary over every counted take
 *   model.change   the first and the last month of the latest 3-month window, or what is missing to compare them
 *   model.groups   [{id, label, on, counted}]             model.left / model.excluded   what was not counted, and why
 *
 * WHAT AN ANALYSIS REALLY HOLDS (audited in app/vocal-analysis.js rangeOf, v2), and so what is shown:
 *   관측 최고음 · 관측 최저음   range.validHigh.cents / range.lowCents — the highest and lowest note held ≥ 0.2 s as one
 *                              confident, continuous stretch (유효 최고음 · 유효 최저음). Never range.instantaneous.
 *   주로 부른 음역              range.main (10th–90th percentile of the confident voiced time of ONE recording). A
 *                              month's band is the median of its recordings' low ends and of their high ends.
 *   안정 최고음                 range.stableHigh.cents (≥ 0.5 s, small wobble).
 *   NOT there, so not shown: a stable LOWEST note (the analysis has none), and how long each pitch was sung.
 *   v1 analyses hold only range.low/high = the lowest/highest detected note with no hold or confidence rule: another
 *   measurement. They are left out (reason 'v1'), never mixed in; analysing again brings them in.
 *
 * THE OUTLIER RULE (RULES.loneGap, RULES.minSamples): a month with 3 or more counted recordings does not let ONE
 * recording set its top (or bottom) alone — when the highest (lowest) recording is 3 or more semitones beyond the
 * next one, the next one is the month's 관측 최고음 (최저음) and the lone note is kept beside it (`lone`), shown as its
 * own mark, never dropped silently. With 1 or 2 recordings nothing can be told apart: the extreme is used as it is
 * and the month is marked as a small sample (`enough:false`). The same rule gives the all-time summary.
 *
 * Nothing is estimated: a month without a counted recording has no values (null), and no month is filled in from
 * its neighbours. A change of range is an observation (관측), never a verdict about skill. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./growth-metrics-model.js') : root.VzipGrowthMetrics);
  if (node) module.exports = api; else root.VzipGrowthRange = api;
})(typeof self !== 'undefined' ? self : globalThis, G => {
'use strict';
const GROUPS = [['song', '곡 녹음'], ['voice-check', '보이스 체크'], ['training', '트레이닝'], ['lesson', '레슨']];
const RULES = {
  minSamples:3,   // counted recordings a month needs before it is compared with another month
  loneGap:3,      // semitones: one recording this far beyond the next does not set the month's top/bottom alone
  months:12,      // months on the chart
  window:3        // the plain-words line compares the first and last month of the latest 3 months
};
/* Why a recording of a chosen group is not counted, in the words of the screen (long) and of a month row (short). */
const LEFT = {
  'no-analysis':['아직 분석하지 않은 녹음', '분석 전'],
  unreliable:['측정 신뢰도가 낮은 녹음 (목소리가 짧거나 반주가 커요)', '신뢰도 낮음'],
  'no-date':['날짜가 없는 녹음', '날짜 없음'],
  v1:['이전 분석(v1) 녹음 · 음역을 재는 방식이 달라요. 다시 분석하면 들어가요', '이전 분석(v1)'],
  'no-range':['또렷하게 이어 부른 음을 찾지 못한 녹음', '이어 부른 음 없음']
};
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

/** What one take's analysis says about range (MIDI numbers), or why it cannot be counted. */
function read(a) {
  if (!a?.metrics) return {why:'no-analysis'};
  if (!(a.v >= 2)) return {why:'v1'};
  const g = a.metrics.range, high = G.midiOf(g?.validHigh?.cents ?? g?.highCents);
  if (high == null) return {why:'no-range'};
  const low = G.midiOf(g.lowCents), mainLow = G.midiOf(g.main?.lowCents), mainHigh = G.midiOf(g.main?.highCents), stable = G.midiOf(g.stableHigh?.cents);
  return {high, low:low != null && low <= high ? low : null, stable,
    mainLow:mainLow != null && mainHigh != null && mainLow <= mainHigh ? mainLow : null, mainHigh:mainLow != null && mainHigh != null && mainLow <= mainHigh ? mainHigh : null,
    voiced:num(a.metrics.voicedSeconds) || 0, mrRemoved:!!a.confidence?.mrRemoved, aiSeparated:!!a.confidence?.aiSeparated};
}
/** The top (dir 1) or bottom (dir −1) of a set of recordings by the outlier rule above. points: [{v, id}]. */
function edge(points, dir) {
  const s = points.filter(p => p.v != null).sort((x, y) => dir * (y.v - x.v) || String(x.id).localeCompare(String(y.id)));
  if (!s.length) return null;
  const lone = s.length >= RULES.minSamples && Math.abs(s[0].v - s[1].v) >= RULES.loneGap;
  const pick = lone ? s[1] : s[0];
  return {midi:pick.v, note:name(pick.v), samples:s.length, lone:lone ? {midi:s[0].v, note:name(s[0].v), id:s[0].id} : null};
}
/** One period (a month, or everything): its counted recordings → the values shown. */
function summarize(rows) {
  const byGroup = Object.fromEntries(GROUPS.map(([id]) => [id, 0]));
  for (const r of rows) byGroup[r.group]++;
  const pts = key => rows.map(r => ({v:r[key], id:r.id}));
  const mains = rows.filter(r => r.mainLow != null);
  return {n:rows.length, byGroup, songs:new Set(rows.filter(r => r.songId).map(r => r.songId)).size,
    voicedSeconds:Math.round(rows.reduce((s, r) => s + r.voiced, 0)),
    high:edge(pts('high'), 1), low:edge(pts('low'), -1), stable:edge(pts('stable'), 1),
    // 주로 부른 음역: the median recording, end by end — one unusual recording does not move it.
    main:mains.length ? {low:{midi:Math.round(median(mains.map(r => r.mainLow))), note:''}, high:{midi:Math.round(median(mains.map(r => r.mainHigh))), note:''}, samples:mains.length} : null,
    mrRemoved:rows.filter(r => r.mrRemoved).length, aiSeparated:rows.filter(r => r.aiSeparated).length,
    enough:rows.length >= RULES.minSamples};
}
const named = s => { if (s.main) { s.main.low.note = name(s.main.low.midi); s.main.high.note = name(s.main.high.midi); } return s; };
const tally = list => { const out = {}; for (const x of list) out[x.why] = (out[x.why] || 0) + 1; return out; };

/** The note axis of a chart of these months: a little room around every value, ticks on round notes. */
function axisOf(months) {
  const vals = [];
  for (const m of months) for (const x of [m.high, m.low, m.stable, m.main?.low, m.main?.high]) if (x) { vals.push(x.midi); if (x.lone) vals.push(x.lone.midi); }
  if (!vals.length) return null;
  const min = Math.min(...vals) - 1, max = Math.max(...vals) + 1;
  const step = [1, 2, 3, 4, 6, 12].find(s => (max - min) / s <= 6) || 12, ticks = [];
  for (let midi = Math.ceil(min / step) * step; midi <= max; midi += step) ticks.push({midi, note:name(midi)});
  return {min, max, step, ticks};
}

/**
 * range: ds.forRange() — {takes:[{id, songId, a, date, group}], excluded:{why:n}, left:[{id, group, date, why}]}.
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
  const mine = counted.filter(r => on.has(r.group)), mineLeft = left.filter(x => on.has(x.group));
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
    groups:GROUPS.map(([id, label]) => ({id, label, on:on.has(id), counted:counted.filter(r => r.group === id).length})),
    months, shown, axis:axisOf(shown),
    all:{...all, firstDate:dates[0] || '', lastDate:dates.at(-1) || '', months:months.filter(m => m.n).length},
    change:changeOf(months, today),
    left:tally(mineLeft),                                   // recordings of the chosen groups that are not counted
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
  return {...base, state:'ok', high:pair(from.high, to.high), low:pair(from.low, to.low)};
}

/* ---------- wording (plain 해요체; 관측, never a verdict) ---------- */
const monthLabel = (key, withYear = false) => (withYear ? key.slice(0, 4) + '년 ' : '') + Number(key.slice(5, 7)) + '월';
const signed = n => n === 0 ? '같음' : (n > 0 ? '+' : '−') + Math.abs(n) + '반음';
const spanText = (a, b) => a.note === b.note ? a.note : a.note + ' ~ ' + b.note;
/** "최근 3개월(9월 → 11월) 관측 최고음 A4 → B4 (+2반음) · 관측 최저음 G3 → G3 (같음)" or what is missing. */
function changeText(c) {
  if (!c || c.state === 'none') return '아직 음역을 셀 수 있는 녹음이 없어요.';
  const year = c.from.slice(0, 4) !== c.to.slice(0, 4);
  if (c.state === 'short') return '표본이 부족해요 · ' + c.missing.map(m => monthLabel(m.month, year) + (m.n ? ' 녹음 ' + m.n + '개' : ' 녹음 없음')).join(', ') + ' · 한 달에 ' + c.need + '개부터 비교해요';
  const part = (label, x) => x ? label + ' ' + x.from + ' → ' + x.to + ' (' + signed(x.delta) + ')' : '';
  return (c.recent ? '최근 3개월' : '마지막 기록 3개월') + '(' + monthLabel(c.from, year) + ' → ' + monthLabel(c.to, year) + ') ' +
    [part('관측 최고음', c.high), part('관측 최저음', c.low)].filter(Boolean).join(' · ');
}
/** The values of one period in one line: "관측 G3 ~ B4 · 주로 부른 음역 C4 ~ D5 · 안정 최고음 F5". '' when it has none. */
function valuesText(s) {
  if (!s?.n || !s.high) return '';
  const lone = [s.high.lone, s.low?.lone].filter(Boolean).map(x => x.note);
  return [s.low ? '관측 ' + spanText(s.low, s.high) : '관측 최고음 ' + s.high.note,
    s.main ? '주로 부른 음역 ' + spanText(s.main.low, s.main.high) : '',
    s.stable ? '안정 최고음 ' + s.stable.note : '',
    lone.length ? '한 녹음에서만 나온 음 ' + lone.join('·') + ' 따로 표시' : ''].filter(Boolean).join(' · ');
}
const voicedText = sec => sec >= 60 ? Math.round(sec / 60) + '분' : sec + '초';
/** What a period was made of: "녹음 5개 (곡 녹음 3 · 보이스 체크 2) · 2곡 · 목소리 4분". */
function sampleText(s) {
  if (!s?.n) return '';
  const by = GROUPS.filter(([id]) => s.byGroup[id]).map(([id, label]) => label + ' ' + s.byGroup[id]).join(' · ');
  return ['녹음 ' + s.n + '개 (' + by + ')', s.songs ? s.songs + '곡' : '', '목소리 ' + voicedText(s.voicedSeconds),
    s.mrRemoved ? '반주를 뺀 뒤 잰 녹음 ' + s.mrRemoved + '개' : '', s.aiSeparated ? 'AI 분리 후 잰 녹음 ' + s.aiSeparated + '개' : '',
    s.enough ? '' : '표본 적음'].filter(Boolean).join(' · ');
}
/** "뺀 녹음 2개: 신뢰도 낮음 1 · 분석 전 1" — '' when nothing was left out. */
function leftText(left) {
  const keys = Object.keys(LEFT).filter(k => left?.[k]);
  return keys.length ? '뺀 녹음 ' + keys.reduce((n, k) => n + left[k], 0) + '개: ' + keys.map(k => LEFT[k][1] + ' ' + left[k]).join(' · ') : '';
}
return {VERSION:1, GROUPS, RULES, LEFT, EXCLUDED, read, edge, summarize, axisOf, build, changeOf, shiftMonth, monthLabel, changeText, valuesText, sampleText, leftText};
});
