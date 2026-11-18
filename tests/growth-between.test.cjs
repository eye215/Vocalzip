// 그 사이에 한 것 (app/growth-between-model.js): what was recorded between the two takes of a pair — the window's edges,
// this song vs other practice, minutes only from what the person entered, deleted rows ignored, the empty case.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../app/growth-between-model.js');

const base = () => ({lessons:[], practices:[], dailyGoals:[], assignments:[], deleted:{}});
const run = (db, extra = {}) => B.between(db, {songId:'s1', from:'2026-09-05', to:'2026-11-10', ...extra});

test('the window: after the earlier day, up to and including the later day; no window for one day or a missing date', () => {
  const db = base();
  db.lessons.push({id:'l-start', date:'2026-09-05'}, {id:'l-in', date:'2026-09-06'}, {id:'l-end', date:'2026-11-10'}, {id:'l-after', date:'2026-11-11'});
  db.practices.push({id:'p-start', date:'2026-09-05', songId:'s1', manualMinutes:30}, {id:'p-end', date:'2026-11-10', songId:'s1', manualMinutes:20},
    {id:'p-after', date:'2026-11-11', songId:'s1', manualMinutes:50});
  const r = run(db);
  assert.deepEqual(r.lessons.map(l => l.id), ['l-in', 'l-end']);
  assert.equal(r.practice.days, 1);
  assert.equal(r.practice.minutes, 20);
  // Either order of the two days gives the same window.
  assert.deepEqual(run(db, {from:'2026-11-10', to:'2026-09-05'}).lessons.map(l => l.id), ['l-in', 'l-end']);
  assert.equal(run(db, {from:'2026-11-10', to:'2026-11-10'}), null);
  assert.equal(run(db, {from:''}), null);
  assert.equal(B.lines(null), null);
});

test('practice: days and entered minutes, split into this song and other practice (training is other)', () => {
  const db = base();
  db.practices.push(
    {id:'a', date:'2026-10-01', songId:'s1', practiceMode:'song', manualMinutes:25},
    {id:'b', date:'2026-10-01', songId:'s1', practiceMode:'song', minutes:'15'},
    {id:'c', date:'2026-10-03', songId:'s2', practiceMode:'song', manualMinutes:40},
    {id:'d', date:'2026-10-04', songId:'s1', practiceMode:'training', manualMinutes:10},
    {id:'e', date:'2026-10-05', practiceMode:'training', categoryLabel:'발성', manualMinutes:5});
  const r = run(db);
  assert.deepEqual(r.practice, {days:4, minutes:95, song:{days:1, minutes:40}, other:{days:3, minutes:55}});
  const t = B.lines(r);
  assert.equal(t.rows.find(x => x.key === 'practice').text, '연습 기록 4일 · 적은 시간 1시간 35분 (이 곡 1일 · 40분, 다른 연습 3일 · 55분)');
  assert.equal(t.summary, '연습 4일');
});

test('minutes come only from what the person entered: an unconfirmed or recording-made row counts as a day with no minutes', () => {
  const db = base();
  db.practices.push(
    // Made on import from a recording: its length is mediaSeconds, never practice time.
    {id:'imp', date:'2026-10-02', songId:'s1', minutes:0, manualMinutes:0, mediaSeconds:600, practiceTimeSource:'unconfirmed', mediaIds:['r1']},
    {id:'unc', date:'2026-10-03', songId:'s1', minutes:30, practiceTimeSource:'unconfirmed', mediaSeconds:1800},
    {id:'room', date:'2026-10-04', songId:'s1', practiceRoomSeconds:900, manualMinutes:0});
  const r = run(db);
  assert.equal(r.practice.days, 3);
  assert.equal(r.practice.minutes, 0);
  assert.equal(B.lines(r).rows.find(x => x.key === 'practice').text, '연습 기록 3일 · 적은 시간 없음 (이 곡 3일)');
});

test('deleted rows (db.deleted) and cancelled lessons are ignored; a row kept twice counts once (the newer)', () => {
  const db = base();
  db.lessons.push({id:'l1', date:'2026-10-01'}, {id:'l2', date:'2026-10-02'}, {id:'l3', date:'2026-10-03', status:'cancelled'});
  db.practices.push({id:'p1', date:'2026-10-01', songId:'s1', manualMinutes:30}, {id:'p2', date:'2026-10-02', songId:'s1', manualMinutes:45},
    {id:'p1', date:'2026-10-01', songId:'s1', manualMinutes:50, updatedAt:9}, {id:'demo', date:'2026-10-06', songId:'s1', manualMinutes:9, practiceRoom:{demo:true}});
  db.dailyGoals.push({id:'g1', date:'2026-10-01', title:'롱톤', completed:true}, {id:'g2', date:'2026-10-02', title:'롱톤', completed:true});
  db.deleted = {lessons:['l2'], practices:['p2'], dailyGoals:['g2'], media:['r2']};
  const recordings = [{id:'r1', songId:'s1', date:'2026-10-01'}, {id:'r2', songId:'s1', date:'2026-10-02'}];
  const r = run(db, {recordings});
  assert.deepEqual(r.lessons.map(l => l.id), ['l1']);
  assert.deepEqual(r.practice, {days:1, minutes:50, song:{days:1, minutes:50}, other:{days:0, minutes:0}});
  assert.deepEqual(r.done, {count:1, top:[{title:'롱톤', count:1}], more:0});
  assert.equal(r.recordings, 1);
});

test('lessons: their days and short words (the tag, else a short feedback line); this song marked', () => {
  const db = base();
  db.lessons.push(
    {id:'l1', date:'2026-10-08', categoryLabel:'호흡', detail:'롱톤', songIds:['s1']},
    {id:'l2', date:'2026-09-20', feedback:'\n  턱 힘 빼기\n오늘은 둘째 줄이 길었어요', songIds:['s2']},
    {id:'l3', date:'2026-10-20', feedback:'아주 긴 피드백이라 여기에는 옮겨 적지 않고 날짜만 보여 줘요 정말로 길게', songFeedback:{s1:'후렴 숨 자리'}, songId:'s1'},
    {id:'l4', date:'2026-10-30', feedback:'아주 긴 피드백이라 여기에는 옮겨 적지 않고 날짜만 보여 줘요 정말로 길게'});
  const r = run(db);
  assert.deepEqual(r.lessons.map(l => [l.id, l.label, l.thisSong]), [['l2', '턱 힘 빼기', false], ['l1', '호흡 · 롱톤', true], ['l3', '후렴 숨 자리', true], ['l4', '', false]]);
  assert.equal(B.lines(r).rows[0].text, '레슨 4번 · 9월 20일 (턱 힘 빼기), 10월 8일 (호흡 · 롱톤), 10월 20일 (후렴 숨 자리), 10월 30일');
});

test('숙제·목표: completed goals and homework sessions by title, top 3; a goal\'s own practice row is not counted twice', () => {
  const db = base();
  db.assignments.push({id:'t1', title:'립트릴 5분'}, {id:'t-gone', title:'지운 숙제'});
  db.deleted.assignments = ['t-gone'];
  const goal = (id, date, title, completed = true) => ({id, date, title, completed});
  db.dailyGoals.push(goal('g1', '2026-10-01', '롱톤'), goal('g2', '2026-10-02', '롱톤'), goal('g3', '2026-10-03', '롱톤'), goal('g4', '2026-10-01', '스케일'),
    goal('g5', '2026-10-02', '스케일'), goal('g6', '2026-10-04', '가사 읽기'), goal('g7', '2026-10-05', '안 한 목표', false), goal('g8', '2026-09-05', '창 밖'),
    {id:'g9', date:'2026-10-06', title:'립트릴 5분', source:'homework', sourceId:'t1', completed:true});
  db.practices.push({id:'s1', date:'2026-10-07', songId:'', practiceMode:'training', completed:['t1'], manualMinutes:5},
    {id:'s2', date:'2026-10-08', practiceMode:'training', completed:['t1', 't-gone'], manualMinutes:5},
    // The practice row of goal g9 (app/goal-routines.js perform): the goal is already counted.
    {id:'goal:g9', date:'2026-10-06', practiceMode:'training', goalId:'g9', completed:['t1'], manualMinutes:5});
  const r = run(db);
  assert.equal(r.done.count, 9);
  assert.deepEqual(r.done.top, [{title:'롱톤', count:3}, {title:'립트릴 5분', count:3}, {title:'스케일', count:2}]);
  assert.equal(r.done.more, 1);
  assert.equal(B.lines(r).rows.find(x => x.key === 'done').text, '한 숙제·목표 9번 · 롱톤 3번, 립트릴 5분 3번, 스케일 2번 외 1가지');
});

test('recordings: the song\'s in the window, the pair\'s two takes and other songs left out', () => {
  const recordings = [{id:'first', songId:'s1', date:'2026-09-05'}, {id:'x', songId:'s1', date:'2026-10-01'}, {id:'x', songId:'s1', date:'2026-10-01'},
    {id:'y', songId:'s1', date:'2026-11-10'}, {id:'last', songId:'s1', date:'2026-11-10'}, {id:'z', songId:'s2', date:'2026-10-01'}];
  const r = run(base(), {recordings, exclude:['first', 'last']});
  assert.equal(r.recordings, 2);
  assert.equal(r.empty, false);
  const t = B.lines(r);
  // Only recordings: the line still says there were no lessons or practice.
  assert.deepEqual(t.rows.map(x => x.text), ['이 사이에 기록된 레슨·연습이 없어요', '이 곡 녹음 2개 (비교한 두 녹음 빼고)']);
  assert.equal(t.summary, '녹음 2개');
});

test('nothing recorded: one plain line; the range across years; the words never claim a cause', () => {
  const r = B.between(base(), {songId:'s1', from:'2025-08-14', to:'2026-11-10'});
  assert.equal(r.empty, true);
  const t = B.lines(r);
  assert.equal(t.empty, '이 사이에 기록된 레슨·연습이 없어요');
  assert.equal(t.range, '2025년 8월 14일 다음 날부터 2026년 11월 10일까지');
  assert.equal(B.HEAD, '이 사이에 기록된 것 · 무엇 때문에 달라졌는지는 알 수 없어요');
  assert.doesNotMatch(JSON.stringify(t) + B.HEAD, /덕분|때문에 좋아|효과|향상|개선/);
  assert.equal(B.minutesText(0), '0분');
  assert.equal(B.minutesText(59.6), '1시간');
  assert.equal(B.minutesText(125), '2시간 5분');
});

test('a malformed db reads as nothing, never throws', () => {
  const r = B.between({lessons:null, practices:'x', dailyGoals:[null, 3], deleted:{lessons:'l1'}}, {songId:'s1', from:'2026-09-05', to:'2026-11-10'});
  assert.equal(r.empty, true);
});
