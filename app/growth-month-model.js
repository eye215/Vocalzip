/* 성장 › 이번 달 — the period and "한 것" (what was done in it). Pure (no DOM, no storage; also loaded by the Node tests).
 * Read-only: nothing is written, moved or deleted. The screen is app/growth-month.js (성장 개편 안 B, phase 2).
 *
 *   VzipGrowthMonth.period(kind, today)  kind 'week' | 'month' | 'all' (anything else → 'month', the default)
 *     → {kind, from, to, prev:{from, to} | null, label, compare}
 *       week: Monday–Sunday (Korea), as 주간 요약 (app/weekly-summary-model.js monday); month: the calendar month;
 *       all: no bounds (from = to = '') and nothing before it.
 *   VzipGrowthMonth.done(db, media, {from, to, prev, today})
 *     → {minutes, days, recordings, voiceCheckDays, lessons, points:{runs, kept, missed}, previous:{minutes, days} | null}
 *
 * The rules are 주간 요약's (app/weekly-summary-model.js build), for any span:
 *   연습 시간   the minutes the person entered on practice records (app/practice-time-model.js entries: one row per id,
 *              manual minutes first, never a recording's length), days up to today only; 연습한 날 = days with minutes.
 *   녹음        recordings not in the deleted list, by their day (recorded date, else the Korea day they were made).
 *   보이스 체크  days with a 매일 보이스 체크 recording.
 *   레슨        lessons not cancelled, up to today ("한 것": a lesson booked for later is not counted yet).
 *   레슨 지적 체크  부르면서 체크 runs (app/score-points-model.js kind score-point-run) of the span: how many runs, and how
 *              many points were marked 지켰어요 / 놓쳤어요 in them. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./practice-time-model.js') : root.VzipPracticeTime,
    node ? require('./weekly-summary-model.js') : root.VzipWeeklySummary);
  if (node) module.exports = api; else root.VzipGrowthMonth = api;
})(typeof self !== 'undefined' ? self : globalThis, (Time, W) => {
'use strict';
const KINDS = ['week', 'month', 'all'];
const list = v => Array.isArray(v) ? v : [];
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const monthEnd = d => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const monthStart = d => d.slice(0, 8) + '01';
const md = d => Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8, 10)) + '일';
const kindOf = k => KINDS.includes(k) ? k : 'month';
/** The span of a period, its previous span and the words for it. */
function period(kind, today) {
  if (!isDay(today)) throw Error('오늘 날짜를 확인해 주세요.');
  const k = kindOf(kind);
  if (k === 'all') return {kind:k, from:'', to:'', prev:null, label:'지금까지 전체', compare:'지금까지의 기록 전부'};
  if (k === 'week') {
    const from = W.monday(today), to = shift(from, 6);
    return {kind:k, from, to, prev:{from:shift(from, -7), to:shift(from, -1)}, label:from.slice(0, 4) + '년 ' + W.rangeLabel({start:from, end:to}), compare:'이번 주 기록'};
  }
  const from = monthStart(today), prevTo = shift(from, -1);
  return {kind:k, from, to:monthEnd(today), prev:{from:monthStart(prevTo), to:prevTo}, label:from.slice(0, 4) + '년 ' + Number(from.slice(5, 7)) + '월', compare:'이번 달 기록'};
}
const live = (db, key) => { const gone = new Set(list(db?.deleted?.[key]).map(String)); return list(db?.[key]).filter(x => x && typeof x === 'object' && !gone.has(String(x.id))); };
const within = (d, from, to) => isDay(d) && (!from || d >= from) && (!to || d <= to);
function practice(db, from, to, today) {
  const rows = Time.entries(Time.records(live(db, 'practices'))).filter(e => isDay(e.date) && e.date <= today && within(e.date, from, to));
  const byDay = new Map();
  for (const e of rows) byDay.set(e.date, (byDay.get(e.date) || 0) + e.minutes);
  return {minutes:rows.reduce((n, e) => n + e.minutes, 0), days:[...byDay.values()].filter(n => n > 0).length};
}
/**
 * db: the app data. media: recordings {id, recordedDate, created, voiceCheck} (the screen passes every recording of
 * the list). from / to: the span ('' = open); prev: the span before it or null; today: 'YYYY-MM-DD'.
 */
function done(db = {}, media = [], {from = '', to = '', prev = null, today} = {}) {
  if (!isDay(today)) throw Error('오늘 날짜를 확인해 주세요.');
  const p = practice(db, from, to, today);
  const goneMedia = new Set(list(db?.deleted?.media).map(String));
  const items = list(media).filter(m => m && m.id != null && !goneMedia.has(String(m.id))).map(m => ({m, date:W.mediaDate(m)}))
    .filter(x => x.date <= today && within(x.date, from, to));
  const lessons = live(db, 'lessons').filter(l => l.status !== 'cancelled' && l.status !== 'canceled' && isDay(l.date) && l.date <= today && within(l.date, from, to)).length;
  const runs = live(db, 'scoreAnnotations').filter(r => r.kind === 'score-point-run' && r.results && typeof r.results === 'object' && isDay(r.date) && r.date <= today && within(r.date, from, to));
  const marks = runs.flatMap(r => Object.values(r.results));
  return {minutes:p.minutes, days:p.days, recordings:items.length, voiceCheckDays:new Set(items.filter(x => x.m.voiceCheck).map(x => x.date)).size, lessons,
    points:{runs:runs.length, kept:marks.filter(v => v === 'kept').length, missed:marks.filter(v => v === 'missed').length},
    previous:prev && isDay(prev.from) ? practice(db, prev.from, prev.to, today) : null};
}
/** "1시간 5분", "45분". */
const minutesText = n => W.minutesLabel(n);
/** The comparison line of 한 것: what is counted and what it is held against. */
function compareText(p, d) {
  if (p.kind === 'all') return '지금까지의 기록 전부 · 연습 시간은 직접 적은 시간만 더해요';
  const last = p.kind === 'week' ? '지난주와' : '지난달과';
  return p.compare + ' · ' + last + ' 비교: 연습 ' + (d.previous ? minutesText(d.previous.minutes) + ' · ' + d.previous.days + '일' : '기록 없음');
}
return {KINDS, period, done, compareText, minutesText, md};
});
