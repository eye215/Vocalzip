// 성장 개편 안 B, phase 2 — 성장 › 이번 달's pure part (app/growth-month-model.js): the period (주간 · 월별 · 전체) and
// "한 것" for any span, with 주간 요약's rules (app/weekly-summary-model.js). Node only; invented data
// (tests/growth-characterization.fixture.cjs and a few rows added here).
const test = require('node:test');
const assert = require('node:assert/strict');
const GM = require('../app/growth-month-model.js');
const W = require('../app/weekly-summary-model.js');
const {MEDIA, DB} = require('./growth-characterization.fixture.cjs');
const TODAY = '2026-11-13';   // the fixture's Friday

test('periods: Monday–Sunday weeks, calendar months (월별 is the default), and 전체 without bounds', () => {
  assert.deepEqual(GM.period('week', TODAY), {kind:'week', from:'2026-11-09', to:'2026-11-15', prev:{from:'2026-11-02', to:'2026-11-08'}, label:'2026년 11월 9일 – 15일', compare:'이번 주 기록'});
  assert.deepEqual(GM.period('month', TODAY), {kind:'month', from:'2026-11-01', to:'2026-11-30', prev:{from:'2026-10-01', to:'2026-10-31'}, label:'2026년 11월', compare:'이번 달 기록'});
  assert.equal(GM.period(undefined, TODAY).kind, 'month');
  assert.equal(GM.period('year', TODAY).kind, 'month');
  assert.deepEqual(GM.period('month', '2026-01-31').prev, {from:'2025-12-01', to:'2025-12-31'});
  assert.equal(GM.period('month', '2028-02-10').to, '2028-02-29');
  assert.deepEqual(GM.period('week', '2026-11-16'), {...GM.period('week', '2026-11-22')});   // Monday and Sunday: one week
  const all = GM.period('all', TODAY);
  assert.deepEqual([all.from, all.to, all.prev], ['', '', null]);
  assert.throws(() => GM.period('month', '11/13'));
});

test('한 것 for a week is what 주간 요약 counts for that week (minutes entered, never recording length)', () => {
  const p = GM.period('week', TODAY), d = GM.done(DB, MEDIA, {...p, today:TODAY});
  const w = W.build(DB, MEDIA, {today:TODAY, weekStart:p.from, growth:false});
  assert.equal(d.minutes, w.practice.minutes);
  assert.equal(W.minutesLabel(d.minutes), '52분');                // as the pinned 주간 요약 of that week says
  assert.equal(d.days, w.practice.days);
  assert.equal(d.recordings, w.recordings.total);
  assert.equal(d.voiceCheckDays, w.voiceCheck.days);
  assert.equal(d.lessons, w.lessons.list.length);
  assert.deepEqual(d.previous, {minutes:w.practice.previous.minutes, days:w.practice.previous.days});
  assert.equal(GM.compareText(p, d), '이번 주 기록 · 지난주와 비교: 연습 35분 · 3일');
});

test('한 것 for a month and for everything; deleted, cancelled and later rows are not counted', () => {
  const db = structuredClone(DB);
  db.lessons.push({id:'l-nov', date:'2026-11-05', status:'done'}, {id:'l-cancel', date:'2026-11-06', status:'cancelled'},
    {id:'l-later', date:'2026-11-20', status:'done'}, {id:'l-gone', date:'2026-11-07', status:'done'});
  db.practices.push({id:'p-gone', date:'2026-11-11', minutes:60}, {id:'p-later', date:'2026-11-20', minutes:40},
    {id:'p-unconfirmed', date:'2026-11-12', minutes:30, practiceTimeSource:'unconfirmed'});
  db.deleted = {...db.deleted, lessons:['l-gone'], practices:['p-gone'], scoreAnnotations:['point-run:gone']};
  db.scoreAnnotations = [
    {id:'point:a', kind:'score-point', songId:'s1', measures:{from:3, to:4}, text:'숨 미리'},
    {id:'point-run:1', kind:'score-point-run', songId:'s1', date:'2026-11-04', at:1, results:{'point:a':'missed'}},
    {id:'point-run:2', kind:'score-point-run', songId:'s1', date:'2026-11-12', at:2, results:{'point:a':'kept', 'point:b':'kept'}},
    {id:'point-run:old', kind:'score-point-run', songId:'s1', date:'2026-10-20', at:0, results:{'point:a':'missed'}},
    {id:'point-run:gone', kind:'score-point-run', songId:'s1', date:'2026-11-10', at:3, results:{'point:a':'missed'}}
  ];
  const nov = GM.done(db, MEDIA, {...GM.period('month', TODAY), today:TODAY});
  assert.equal(nov.lessons, 1);                                    // l-nov only (cancelled, later and deleted left out)
  assert.deepEqual(nov.points, {runs:2, kept:2, missed:1});
  // Entered minutes of November up to today: 30+20+15 (song) + 8 (연습실) + 12 (트레이닝) + 3×0.5 (보이스 체크).
  assert.equal(nov.minutes, 86.5);
  assert.equal(nov.voiceCheckDays, 3);
  // Recordings of November, the deleted g1 and the undated a8 (no day) left out.
  const novIds = MEDIA.filter(m => m.id !== 'g1' && W.mediaDate(m) >= '2026-11-01' && W.mediaDate(m) <= TODAY).length;
  assert.equal(nov.recordings, novIds);
  assert.deepEqual(nov.previous, {minutes:0, days:0});
  const all = GM.done(db, MEDIA, {...GM.period('all', TODAY), today:TODAY});
  assert.equal(all.lessons, 2);                                    // l1 (October) and l-nov
  assert.deepEqual(all.points, {runs:3, kept:2, missed:2});
  assert.equal(all.previous, null);
  assert.equal(GM.compareText(GM.period('all', TODAY), all), '지금까지의 기록 전부 · 연습 시간은 직접 적은 시간만 더해요');
  assert.equal(GM.compareText(GM.period('month', TODAY), nov), '이번 달 기록 · 지난달과 비교: 연습 0분 · 0일');
  // Read-only.
  assert.deepEqual(db.lessons.length, DB.lessons.length + 4);
});
