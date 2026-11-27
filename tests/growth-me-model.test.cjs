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

/* ---------- the period overview of 나 (성장 새 디자인, 2026-11-27) ---------- */
const SPAN = {from:'2026-11-01', to:'2026-11-30', today:'2026-11-04'}, PREV = {from:'2026-10-01', to:'2026-10-31'};
test('practice: entered minutes a day over the elapsed days, a running average, against the previous span', () => {
  const db = {practices:[{id:'a', date:'2026-11-02', minutes:30}, {id:'b', date:'2026-11-03', manualMinutes:10, minutes:99}, {id:'c', date:'2026-11-05', minutes:60},
    {id:'d', date:'2026-10-10', minutes:62}, {id:'x', date:'2026-11-02', minutes:40, practiceTimeSource:'unconfirmed'}, {id:'g', date:'2026-11-03', minutes:20}], deleted:{practices:['g']}};
  const p = G.practice(db, SPAN, PREV);
  assert.equal(p.days, 4);                                   // 1–4 November: a later day does not count yet
  assert.equal(p.total, 40);                                 // manual minutes first; unconfirmed and deleted rows add nothing
  assert.equal(p.practised, 2);
  assert.deepEqual(p.line.map(x => x.avg), [0, 15, 40 / 3, 10]);
  assert.equal(p.before.avg, 2);
  assert.deepEqual([p.delta, p.trend], [8, 'up']);
  assert.equal(G.practice(db, SPAN, null).trend, null);    // 전체: nothing to hold it against
  assert.equal(G.practice({practices:[]}, SPAN, PREV).trend, 'same');
});

test('condition: one dot a day with the day\'s last 보이스 체크 rating; a check without a rating is a checked day', () => {
  const vc = (id, date, rating, created) => ({id, date, minutes:.5, practiceMode:'training', created, voiceCheck:{v:1, ...(rating ? {selfRating:rating} : {})}});
  const db = {practices:[vc('v1', '2026-11-01', 2, 1), vc('v2', '2026-11-01', 4, 2), vc('v3', '2026-11-03', 0, 3), vc('v4', '2026-11-09', 5, 4)]};
  const c = G.condition(db, [{date:'2026-11-02', voiceCheck:true}, {date:'2026-11-04', voiceCheck:false}], SPAN);
  assert.deepEqual(c.dots.map(d => [d.rating, d.checked]), [[4, true], [null, true], [null, true], [null, false]]);
  assert.deepEqual([c.avg, c.rated, c.checkedDays, c.word], [4, 1, 3, '좋음']);
  const none = G.condition({practices:[]}, [], SPAN);
  assert.deepEqual([none.avg, none.word, none.checkedDays], [null, '', 0]);
});

test('mix: 곡 and 기본기 from entered minutes, 녹음 from the recordings\' length, only inside the elapsed span', () => {
  const db = {practices:[{id:'a', date:'2026-11-02', minutes:30, songId:'s1'}, {id:'b', date:'2026-11-03', minutes:12, practiceMode:'training'}, {id:'c', date:'2026-10-30', minutes:50}]};
  const m = G.mix(db, [{date:'2026-11-02', seconds:120}, {date:'2026-11-03', seconds:'x'}, {date:'2026-11-20', seconds:600}], SPAN);
  assert.deepEqual(m, {song:30, basic:12, rec:2, total:44});
});

test('oneLine: the measures that changed and the practice change, in plain Korean; the change line when nothing moved', () => {
  assert.equal(G.oneLine({better:['음정 정확도'], worse:['고음 안정성'], practice:'up'}), '음정 정확도가 좋아지고 연습도 늘었어요. 고음 안정성은 다시 살펴봐요.');
  assert.equal(G.oneLine({better:['호흡 유지', '음정 안정성'], practice:'down', kind:'week'}), '호흡 유지·음정 안정성이 좋아졌어요. 연습은 줄었어요.');
  assert.equal(G.oneLine({practice:'up', kind:'week'}), '지난주보다 연습이 늘었어요.');
  assert.equal(G.oneLine({practice:'same', fallback:'Home · 흔들림이 줄었어요'}), 'Home · 흔들림이 줄었어요');
  assert.equal(G.oneLine({practice:'up', fallback:'Home · 흔들림이 줄었어요'}), 'Home · 흔들림이 줄었어요 지난달보다 연습이 늘었어요.');
  assert.equal(G.oneLine({practice:'same'}), '연습량은 지난달과 비슷해요.');
  assert.match(G.oneLine({kind:'all'}), /^아직 견줄 녹음이 부족해요/);
  assert.deepEqual([G.josa('음정 안정성', '은', '는'), G.josa('호흡 유지', '은', '는'), G.josa('F5', '이', '가')], ['은', '는', '가']);
});

test('stats: first, mean, the best in the measure\'s own direction, count', () => {
  assert.deepEqual(G.stats([30, 20, 25], -1), {count:3, first:30, last:25, avg:25, best:20});
  assert.equal(G.stats([3, 4.2, 3.4], 1).best, 4.2);
  assert.equal(G.stats([], 1).count, 0);
});
test('buckets: 주 → a point a day, 월 → a week from Monday, 전체 → a month (a quarter past 18 months), each the average', () => {
  const pts = [{date:'2026-11-03', value:20}, {date:'2026-11-03', value:30}, {date:'2026-11-04', value:10}, {date:'2026-11-10', value:40}, {date:'bad', value:1}, {date:'2026-11-11', value:NaN}];
  const week = G.buckets(pts, 'week');
  assert.deepEqual(week.map(b => [b.label, b.value, b.count]), [['11/3', 25, 2], ['11/4', 10, 1], ['11/10', 40, 1]]);
  const month = G.buckets(pts, 'month');   // 2026-11-02 is a Monday
  assert.deepEqual(month.map(b => [b.from, b.label, b.value, b.count]), [['2026-11-02', '11/2주', 20, 3], ['2026-11-09', '11/9주', 40, 1]]);
  const all = G.buckets([{date:'2026-08-09', value:2}, {date:'2026-08-30', value:4}, {date:'2026-11-28', value:6}], 'all');
  assert.deepEqual(all.map(b => [b.label, b.value, b.unit]), [['8월', 3, 'month'], ['11월', 6, 'month']]);
  const long = G.buckets([{date:'2024-01-03', value:1}, {date:'2024-02-03', value:3}, {date:'2026-05-03', value:5}], 'all');
  assert.deepEqual(long.map(b => [b.label, b.value, b.unit]), [['24년 1분기', 2, 'quarter'], ['26년 2분기', 5, 'quarter']]);
  assert.deepEqual(G.buckets([], 'all'), []);
});
