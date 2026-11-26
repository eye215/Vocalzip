// 곡 녹음 → 연습 시간 (app/recording-time-model.js): per song and day, entered time wins; otherwise the recordings'
// length counts — imported rows (시간 미입력) count their own, the rest make one automatic row. Node only; invented data.
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../app/recording-time-model.js'), Time = require('../app/practice-time-model.js');
const D = '2026-11-20', rec = (id, songId, seconds, date = D) => ({id, songId, date, seconds});
const db = (practices = [], deleted = []) => ({practices, deleted:{practices:deleted}});
const run = (d, recs) => { const p = T.plan(d, recs, {now:5}); T.apply(d, p); return p; };
const total = d => Time.entries(d.practices).reduce((n, e) => n + e.minutes, 0);

test('no time entered: one automatic row per song and day with its recordings\' length (rounded up)', () => {
  const d = db();
  run(d, [rec('a', 's1', 130), rec('b', 's1', 50), rec('c', 's2', 20), rec('d', 's1', 60, '2026-11-19')]);
  assert.deepEqual(d.practices.map(p => [p.id, p.minutes, p.mediaIds.join(), p.practiceTimeSource, p.practiceMode]).sort(), [
    ['rec-time:2026-11-19:s1', 1, 'd', 'recording', 'song'], ['rec-time:2026-11-20:s1', 3, 'a,b', 'recording', 'song'], ['rec-time:2026-11-20:s2', 1, 'c', 'recording', 'song']]);
  assert.equal(total(d), 5);
  // Again with nothing new: nothing to write.
  assert.deepEqual(T.plan(d, [rec('a', 's1', 130), rec('b', 's1', 50), rec('c', 's2', 20), rec('d', 's1', 60, '2026-11-19')]), {rows:[], remove:[]});
  // A recording deleted: its row follows; all of a day's gone: the row goes.
  run(d, [rec('a', 's1', 130), rec('c', 's2', 20), rec('d', 's1', 60, '2026-11-19')]);
  assert.equal(d.practices.find(p => p.id === 'rec-time:2026-11-20:s1').minutes, 3);
  run(d, [rec('a', 's1', 130)]);
  assert.deepEqual(d.practices.map(p => p.id), ['rec-time:2026-11-20:s1']);
});

test('time entered for the song that day wins: no automatic row (one made before goes); other songs still count', () => {
  const d = db([{id:'m1', date:D, songId:'s1', minutes:20, manualMinutes:20, practiceTimeSource:'manual', practiceMode:'song'}]);
  run(d, [rec('a', 's1', 600), rec('c', 's2', 120)]);
  assert.deepEqual(d.practices.map(p => p.id).sort(), ['m1', 'rec-time:2026-11-20:s2']);
  assert.equal(total(d), 22);
  // Entered after the automatic row was made: the automatic row goes, nothing is counted twice.
  const e = db();run(e, [rec('a', 's1', 600)]);
  e.practices.push({id:'set:1', date:D, songId:'s1', minutes:7, practiceTimeSource:'practice-set', practiceMode:'song'});
  run(e, [rec('a', 's1', 600)]);
  assert.deepEqual(e.practices.map(p => p.id), ['set:1']);
  // 트레이닝 rows are not time for the song.
  const t = db([{id:'tr', date:D, songId:'s1', minutes:9, practiceTimeSource:'manual', practiceMode:'training'}]);
  run(t, [rec('a', 's1', 90)]);
  assert.ok(t.practices.some(p => p.id === 'rec-time:2026-11-20:s1'));
});

test('an imported row (시간 미입력) counts its own recordings; entered time later puts it back to 시간 미입력', () => {
  const d = db([{id:'imp', date:D, songId:'s1', minutes:0, manualMinutes:0, mediaSeconds:200, practiceTimeSource:'unconfirmed', mediaIds:['a'], practiceMode:'song', importedFrom:'a'}]);
  run(d, [rec('a', 's1', 200), rec('b', 's1', 30)]);
  const imp = d.practices.find(p => p.id === 'imp');
  assert.deepEqual([imp.practiceTimeSource, imp.minutes, imp.fromUnconfirmed, imp.importedFrom], ['recording', 4, true, 'a']);
  assert.equal(d.practices.find(p => p.id === 'rec-time:2026-11-20:s1').minutes, 1, 'the other recording only');
  d.practices.push({id:'m', date:D, songId:'s1', minutes:15, manualMinutes:15, practiceTimeSource:'manual', practiceMode:'song'});
  run(d, [rec('a', 's1', 200), rec('b', 's1', 30)]);
  const back = d.practices.find(p => p.id === 'imp');
  assert.deepEqual([back.practiceTimeSource, back.minutes, 'fromUnconfirmed' in back], ['unconfirmed', 0, false]);
  assert.equal(d.practices.some(p => p.id === 'rec-time:2026-11-20:s1'), false);
  assert.equal(total(d), 15);
});

test('the person\'s own: an edited automatic row is never touched again; a deleted one is not made again', () => {
  const d = db();run(d, [rec('a', 's1', 600)]);
  Object.assign(d.practices[0], {minutes:30, manualMinutes:30, practiceTimeSource:'manual'});
  assert.deepEqual(T.plan(d, [rec('a', 's1', 600), rec('b', 's1', 60)]), {rows:[], remove:[]});
  assert.deepEqual(T.plan(d, []), {rows:[], remove:[]});
  const gone = db([{id:'rec-time:2026-11-20:s1', date:D, songId:'s1', minutes:10, practiceTimeSource:'recording'}], ['rec-time:2026-11-20:s1']);
  assert.deepEqual(T.plan(gone, [rec('a', 's1', 600)]), {rows:[], remove:[]});
  // Bad input is left out.
  assert.deepEqual(T.plan(db(), [{id:'x', songId:'', date:D, seconds:9}, {id:'y', songId:'s', date:'', seconds:9}, {id:'z', songId:'s', date:D, seconds:0}, null]), {rows:[], remove:[]});
});

test('a recording that time entered on its day lists (트레이닝 or another song) is counted there only, not again', () => {
  // 녹음 길이로 채우기 in a 트레이닝 record: its 3 minutes are the recording's; the automatic row of it goes.
  const d = db();run(d, [rec('a', 's1', 170), rec('b', 's1', 60)]);
  assert.equal(d.practices.find(p => p.id === 'rec-time:2026-11-20:s1').minutes, 4);
  d.practices.push({id:'tr', date:D, songId:'', minutes:3, manualMinutes:3, practiceTimeSource:'manual', practiceMode:'training', mediaIds:['a']});
  run(d, [rec('a', 's1', 170), rec('b', 's1', 60)]);
  assert.deepEqual(d.practices.find(p => p.id === 'rec-time:2026-11-20:s1').mediaIds, ['b'], 'only the recording no entered time lists');
  assert.equal(total(d), 4);
  // A 목표 수행 기록 with its time, listing the rest: nothing is added for the song that day.
  d.practices.push({id:'goal:g1', date:D, songId:'', minutes:10, manualMinutes:10, practiceTimeSource:'goal', practiceMode:'training', mediaIds:['b']});
  run(d, [rec('a', 's1', 170), rec('b', 's1', 60)]);
  assert.equal(d.practices.some(p => p.id === 'rec-time:2026-11-20:s1'), false);
  assert.equal(total(d), 13);
  // Listed by a record without time (a 목표 with no minutes) or on another day: still counted from the recording.
  const e = db([{id:'goal:g2', date:D, songId:'', minutes:0, manualMinutes:0, practiceTimeSource:'goal', practiceMode:'training', mediaIds:['a']},
    {id:'old', date:'2026-11-19', songId:'s1', minutes:5, manualMinutes:5, practiceTimeSource:'manual', practiceMode:'song', mediaIds:['a']}]);
  run(e, [rec('a', 's1', 170)]);
  assert.equal(e.practices.find(p => p.id === 'rec-time:2026-11-20:s1').minutes, 3);
  // An imported row it counted goes back to 시간 미입력 once entered time that day lists its recording.
  const i = db([{id:'imp', date:D, songId:'s1', minutes:0, manualMinutes:0, practiceTimeSource:'unconfirmed', mediaIds:['a'], practiceMode:'song'}]);
  run(i, [rec('a', 's1', 200)]);
  assert.equal(i.practices.find(p => p.id === 'imp').minutes, 4);
  i.practices.push({id:'tr', date:D, songId:'', minutes:4, manualMinutes:4, practiceTimeSource:'manual', practiceMode:'training', mediaIds:['a']});
  run(i, [rec('a', 's1', 200)]);
  assert.deepEqual([i.practices.find(p => p.id === 'imp').practiceTimeSource, total(i)], ['unconfirmed', 4]);
});
