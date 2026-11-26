// 녹음 정리 (app/library-tidy-model.js): what is suggested for a look — never ticked or removed by the model. Node only.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../app/library-tidy-model.js');
const rec = (id, extra = {}) => ({id, durationSeconds:60, created:Number(id.replace(/\D/g, '')) || 1, ...extra});

test('very short takes, takes with almost no voice, and days with four or more takes of one song', () => {
  const items = [rec('s1', {durationSeconds:3}), rec('s2', {durationSeconds:4.9, analysis:{metrics:{voicedSeconds:0}}}), rec('ok', {durationSeconds:5}),
    rec('q1', {analysis:{metrics:{voicedSeconds:1}}}), rec('v1', {analysis:{metrics:{voicedSeconds:30}}}), rec('n1', {durationSeconds:0}),
    ...[1, 2, 3, 4].map(i => rec('a' + i, {songId:'A', date:'2026-11-20'})), ...[1, 2, 3].map(i => rec('b' + i, {songId:'B', date:'2026-11-20'})),
    ...[1, 2, 3, 4, 5].map(i => rec('c' + i, {songId:'A', date:'2026-11-21'}))];
  const g = T.groups(items, {dateOf:m => m.date || ''});
  assert.deepEqual(g.short.map(m => m.id), ['s2', 's1']);            // under 5 s (newest first); 0 s means unknown
  assert.deepEqual(g.quiet.map(m => m.id), ['q1']);                  // a short take is listed once, as short
  assert.deepEqual(g.sameDay.map(x => [x.songId, x.date, x.items.length]), [['A', '2026-11-21', 5], ['A', '2026-11-20', 4]]);
  assert.deepEqual(g.sameDay[0].items.map(m => m.id), ['c5', 'c4', 'c3', 'c2', 'c1']);
});

test('recordings without a song are counted (sent to 곡 녹음 찾기), and nothing is changed', () => {
  const items = [rec('x1'), rec('x2', {songId:'A'}), rec('x3')];
  const before = JSON.stringify(items);
  assert.equal(T.groups(items, {songless:m => m.id !== 'x3'}).songless, 1);
  assert.equal(JSON.stringify(items), before);
  assert.deepEqual(T.groups(null), {short:[], quiet:[], sameDay:[], songless:0});
});
