// 오늘 부를 곡 (app/song-pick-model.js): which of my songs to sing today, with the reason. Node only; invented data.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/song-pick-model.js');

const TODAY = '2026-11-25';
const song = (id, extra = {}) => ({id, title:'곡 ' + id, ...extra});
const base = () => ({songs:[], lessons:[], assignments:[], practices:[], performances:[], deleted:{}});
const sang = (songId, date, extra = {}) => ({id:'p-' + songId + date, date, songId, minutes:10, practiceMode:'song', ...extra});

test('공연 > 레슨 > 숙제 > 오래 안 부른 곡 > 아직 안 부른 곡, each with its reason', () => {
  const db = base();
  db.songs = ['a', 'b', 'c', 'd', 'e'].map(id => song(id));
  db.performances = [{id:'pf', status:'preparing', start:'2026-11-28', sessions:[], songLinks:[{songId:'a'}]}];
  db.lessons = [{id:'l1', status:'scheduled', date:'2026-11-27', songIds:['b']}];
  db.assignments = [{id:'t1', title:'2절 고음', songId:'c', status:'active', startDate:'2026-11-20', dueDate:'2026-12-01'}];
  db.practices = [sang('d', '2026-11-01')];
  const out = P.pick(db, {today:TODAY, limit:5});
  assert.deepEqual(out.map(x => [x.songId, x.reason]), [
    ['a', '공연 D-3'], ['b', '레슨 D-2'], ['c', '숙제 · 2절 고음'], ['d', '24일 동안 안 불렀어요'], ['e', '아직 안 불러 봤어요']]);
  assert.equal(P.pick(db, {today:TODAY}).length, 3);
});

test('a song sung today goes last and only shows when there is nothing else; a second reason is kept as extra', () => {
  const db = base();
  db.songs = [song('a'), song('b')];
  db.lessons = [{id:'l1', status:'scheduled', date:TODAY, songIds:['a']}];
  db.practices = [sang('a', TODAY), sang('b', '2026-11-20')];
  assert.deepEqual(P.pick(db, {today:TODAY}).map(x => [x.songId, x.reason]), [['b', '5일 전에 불렀어요']]);
  // Only songs sung today: shown, with what they are for and that they were sung.
  db.songs = [song('a')];
  const [a] = P.pick(db, {today:TODAY});
  assert.deepEqual([a.songId, a.reason, a.extra, a.doneToday], ['a', '오늘 레슨 곡', '오늘 불렀어요', true]);
  // Two reasons: the strongest leads, the next is the extra.
  db.songs = [song('c')];
  db.lessons.push({id:'l2', status:'scheduled', date:'2026-11-26', songId:'c'});
  db.practices.push(sang('c', '2026-10-01'));
  assert.deepEqual(P.pick(db, {today:TODAY}).map(x => [x.reason, x.extra]), [['내일 레슨 곡', '55일 동안 안 불렀어요']]);
});

test('recordings and finished lessons count as singing; training rows, deleted rows and future dates do not', () => {
  const db = base();
  db.songs = [song('a'), song('b'), song('c'), song('d')];
  db.lessons = [{id:'l0', status:'done', date:'2026-11-22', songIds:['b']}];
  db.practices = [sang('c', '2026-11-24', {practiceMode:'training'}), sang('d', '2026-11-24'), sang('a', '2026-11-30')];
  db.deleted = {practices:['p-d2026-11-24']};
  const out = P.pick(db, {today:TODAY, media:[{songId:'a', date:'2026-11-23'}], limit:4});
  assert.deepEqual(Object.fromEntries(out.map(x => [x.songId, x.reason])), {a:'2일 전에 불렀어요', b:'3일 전에 불렀어요', c:'아직 안 불러 봤어요', d:'아직 안 불러 봤어요'});
});

test('left out: 보류 and deleted songs, past or far lessons and shows, done or out-of-period homework; nothing is changed', () => {
  const db = base();
  db.songs = [song('a', {repertoire:{status:'paused'}}), song('b'), song('x')];
  db.deleted = {songs:['x']};
  db.practices = [sang('b', '2026-11-24')];
  db.lessons = [{id:'l1', status:'scheduled', date:'2026-12-20', songIds:['b']}, {id:'l2', status:'scheduled', date:'2026-11-20', songIds:['b']}];
  db.performances = [{id:'pf', status:'completed', start:'2026-11-26', songLinks:[{songId:'b'}]}, {id:'pf2', status:'preparing', start:'2027-03-01', songLinks:[{songId:'b'}]}];
  db.assignments = [{id:'t1', title:'끝난 숙제', songId:'b', status:'done'}, {id:'t2', title:'아직', songId:'b', status:'active', startDate:'2026-12-01'}];
  const before = JSON.stringify(db);
  assert.deepEqual(P.pick(db, {today:TODAY}).map(x => [x.songId, x.reason]), [['b', '어제 불렀어요']]);
  assert.equal(JSON.stringify(db), before);
  assert.deepEqual(P.pick(base(), {today:TODAY}), []);
  assert.deepEqual(P.pick(db, {today:'bad'}), []);
});

test('homework on a lesson finds the lesson song; a show session date counts', () => {
  const db = base();
  db.songs = [song('a'), song('b')];
  db.practices = [sang('a', '2026-11-24'), sang('b', '2026-11-24')];
  db.lessons = [{id:'l0', status:'done', date:'2026-11-18', songId:'a'}];
  db.assignments = [{id:'t1', title:'호흡', lessonIds:['l0'], status:'active'}];
  db.performances = [{id:'pf', status:'preparing', start:'2026-11-01', sessions:[{date:TODAY, status:'scheduled'}], songLinks:[{songId:'b'}]}];
  assert.deepEqual(P.pick(db, {today:TODAY}).map(x => [x.songId, x.reason]), [['b', '오늘 공연 곡'], ['a', '숙제 · 호흡']]);
});

test('랜덤: one of my songs, not one sung today when there is another; 보류·deleted never; none without songs', () => {
  const db = base();
  db.songs = [song('a'), song('b'), song('c', {repertoire:{status:'paused'}}), song('x')];
  db.deleted = {songs:['x']};
  db.practices = [sang('a', TODAY)];
  for (const r of [0, 0.5, 0.99]) assert.deepEqual(P.random(db, {today:TODAY, rand:() => r}), {songId:'b', title:'곡 b'});
  db.practices.push(sang('b', TODAY));
  assert.deepEqual([0, 0.99].map(r => P.random(db, {today:TODAY, rand:() => r}).songId), ['a', 'b']);
  assert.equal(P.random(base(), {today:TODAY}), null);
});
