// 듣고 고르기 (app/listen-session-model.js): which pairs a listening session plays, and the 그냥 이어 듣기 order.
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../app/listen-session-model.js');
const take = (id, songId, date, created = 0, seconds = 180) => ({id, songId, date, created, seconds});
const takes = [
  take('r1', 'river', '2026-08-01'), take('r2', 'river', '2026-09-10'), take('r3', 'river', '2026-10-05'),
  take('r4', 'river', '2026-11-10'), take('r5', 'river', '2026-11-20'),
  take('h1', 'home', '2026-11-01'), take('h2', 'home', '2026-11-19'),
  take('solo', 'one', '2026-11-02'),
  {id:'nodate', songId:'river', date:''}];
const fixed = () => 0.25;   // A is the older take

test('예전 vs 요즘: the latest against older takes at least two weeks earlier, spread; songs take turns', () => {
  const p = S.pairs(takes, {random:fixed});
  assert.deepEqual(p.map(x => [x.songId, x.a.id, x.b.id]), [
    ['river', 'r1', 'r5'], ['home', 'h1', 'h2'],
    ['river', 'r2', 'r5'], ['river', 'r3', 'r5']]);
  // r4 (10 days before r5) is not "예전"; one take alone (solo) makes no pair; a take without a day is left out.
  assert.ok(p.every(x => x.a.id !== 'r4' && x.b.id !== 'r4' && x.songId !== 'one' && x.a.id !== 'nodate'));
  assert.ok(p.every(x => x.aIsFirst));
});

test('blind order: A and B swap with the random draw; aIsFirst says which one is older', () => {
  const p = S.pairs(takes, {songId:'home', random:() => 0.9});
  assert.equal(p.length, 1);
  assert.equal(p[0].a.id, 'h2'); assert.equal(p[0].b.id, 'h1'); assert.equal(p[0].aIsFirst, false);
});

test('a pair already judged is not played again; when the latest has been judged against all, the one before stands in', () => {
  const judged = ['r1', 'r2', 'r3'].map(id => ({firstId:id, secondId:'r5'}));
  const p = S.pairs(takes, {songId:'river', verdicts:judged, random:fixed});
  // r4 is "요즘" now; r1..r3 are at least two weeks before it.
  assert.deepEqual(p.map(x => [x.a.id, x.b.id]), [['r1', 'r4'], ['r2', 'r4'], ['r3', 'r4']]);
  assert.equal(S.pairs(takes, {songId:'home', verdicts:[{firstId:'h1', secondId:'h2'}]}).length, 0);
});

test('no older take two weeks back: the older ones that there are', () => {
  const p = S.pairs([take('a', 's', '2026-11-10'), take('b', 's', '2026-11-12'), take('c', 's', '2026-11-13')], {random:fixed, perSong:5});
  assert.deepEqual(p.map(x => [x.a.id, x.b.id]), [['a', 'c'], ['b', 'c']]);
});

test('그냥 이어 듣기: newest first, every take with a day once; one song when asked', () => {
  assert.deepEqual(S.queue(takes).map(x => x.take.id), ['r5', 'h2', 'r4', 'solo', 'h1', 'r3', 'r2', 'r1']);
  assert.deepEqual(S.queue(takes, {songId:'home'}).map(x => x.take.id), ['h2', 'h1']);
});

test('앞 1분: the first minute of a longer take, the whole of a short one', () => {
  assert.deepEqual(S.section(take('x', 's', '2026-11-01', 0, 200), true), {start:0, end:60});
  assert.deepEqual(S.section(take('x', 's', '2026-11-01', 0, 50), true), {start:0, end:null});
  assert.deepEqual(S.section(take('x', 's', '2026-11-01', 0, 200), false), {start:0, end:null});
});
