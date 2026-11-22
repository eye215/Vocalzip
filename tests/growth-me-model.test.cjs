// 성장 › 나 (app/growth-me-model.js): the Lv card, the eight 기본기 tiles with their last days' values, and ONE sentence
// of what changed. Node only; invented data.
const test = require('node:test'), assert = require('node:assert/strict');
const G = require('../app/growth-me-model.js'), L = require('../app/levels-model.js');
const day = n => L.shift('2026-11-01', n - 1), TODAY = day(20);
const run = (date, measures, id = date) => ({id:'practice-set:' + id, date, created:Date.parse(date + 'T10:00:00Z'), dailySet:{v:1, items:[{exercise:'breath-hiss', state:'done', measures}]}});
const hiss = s => ({area:'breath', kind:'hiss', value:s, unit:'초'});

test('tiles: every area in the table\'s order, its state in words, the last days\' values (one a day, the day\'s last)', () => {
  const db = {practices:[run(day(1), [hiss(12)]), run(day(2), [hiss(14)], 'a'), run(day(2), [hiss(15)], 'b'), run(day(5), [hiss(16)])], practicePlans:[], deleted:{}};
  const t = G.tiles(db, TODAY);
  assert.deepEqual(t.map(x => x.id), ['breath', 'pitch', 'sustain', 'path', 'range', 'high', 'vibrato', 'rhythm']);
  const b = t[0];
  assert.ok(['calibrating', 'step'].includes(b.state)); assert.match(b.label, /^(기준 맞추는 중|\d \/ 5단계)$/);
  assert.deepEqual(b.spark.map(x => x.value), [12, 15, 16]);
  assert.deepEqual(t[1].label, '아직');
  assert.equal(t.find(x => x.id === 'sustain').lower, true, 'a smaller wobble is better: the line reads the other way');
  // Ten measured days: the last eight.
  const many = {practices:Array.from({length:10}, (_, i) => run(day(i + 1), [hiss(10 + i)])), practicePlans:[], deleted:{}};
  assert.deepEqual(G.tiles(many, TODAY)[0].spark.map(x => x.value), [12, 13, 14, 15, 16, 17, 18, 19]);
});

test('lv: level, name, % to the next, today\'s points', () => {
  const x = G.lv({practices:[], practicePlans:[], dailyGoals:[], deleted:{}}, TODAY);
  assert.deepEqual([x.level, x.name, x.percent, x.today], [1, L.LEVELS[0].name, 0, 0]);
});

test('changeLine: the latest song pair with a real change, else a listening verdict, else 음역; null with nothing', () => {
  const song = (title, changes) => ({kind:'song', songId:title, title, firstId:'f', lastId:'l', changes});
  const c = {songs:[song('A', [{text:'흔들림이 비슷해요', similar:true}]), song('B', [{text:'비슷해요', similar:true}, {text:'흔들림이 줄었어요', numbers:'±9 → ±6 cent', similar:false}])], verdicts:[{title:'C', overall:'좋아졌어요', songId:'C', firstId:'1', secondId:'2'}]};
  assert.deepEqual(G.changeLine(c, 'month'), {text:'B · 흔들림이 줄었어요', basis:'지난달과 비교 · 같은 곡 · ±9 → ±6 cent', songId:'B', firstId:'f', lastId:'l'});
  assert.equal(G.changeLine({songs:[song('A', [{text:'비슷해요', similar:true}])], verdicts:c.verdicts}, 'week').text, 'C · 들어 본 평가: 좋아졌어요');
  assert.equal(G.changeLine({songs:[song('A', [{text:'흔들림이 비슷해요', similar:true}])]}, 'all').basis, '처음과 비교 · 같은 곡');
  assert.equal(G.changeLine({songs:[], range:{text:'안정 최고음 G4 → A4', basis:'음역 처음·지금'}}).text, '안정 최고음 G4 → A4');
  assert.equal(G.changeLine({songs:[]}), null);
  assert.equal(G.changeLine(null), null);
});
