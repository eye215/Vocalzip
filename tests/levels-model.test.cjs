// 단계 (app/levels-model.js): 큰 단계 from consistency only (points derived from records, caps, thresholds, the reached
// level never dropping), 기본기 단계 from the measures of 오늘의 연습 (3 different days, never removed, 유지 중, 기준 맞추는
// 중, guardrails, measures of areas that have no exercise yet), 선생님 지적 배지 and the 기준표 text.
// Also what app/daily-set-model.js keeps for it: the wobble (sd) and the octave of a held note, `measures` in the run row.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../app/levels-model.js'), D = require('../app/daily-set-model.js');
const TODAY = '2026-11-20';
const day = n => L.shift('2026-11-01', n - 1); // the n-th of November 2026 (n may pass 30)
const pitch = value => ({area:'pitch', kind:'hold', value, of:5, unit:'개', hold:4, tolerance:25});
const sustain = (value, hold = 6) => ({area:'sustain', kind:'longtone', value, unit:'cent', hold, count:3, of:3});
const range = (low, high, extra = {}) => ({area:'range', kind:'comfortable', value:high - low, unit:'반음', low, high, seconds:2, count:3, ...extra});
/** A finished set row with the given measures on its listening item. */
const set = (date, measures = [], {state = 'done', left = false, id = date} = {}) => ({id:'practice-set:' + id, date, minutes:5, manualMinutes:5, practiceTimeSource:'practice-set', practiceSetId:id, created:Date.parse(date + 'T10:00:00Z'),
  dailySet:{v:1, minutes:5, items:[{id:'ex-loosen-neck', kind:'exercise', state, seconds:160, minutes:2.7}, {id:'ex-ear-follow', kind:'exercise', exercise:'ear-follow', state:left ? 'left' : state, seconds:40, minutes:.7, ...(measures.length ? {measures} : {})}]}});
const db = (practices = [], extra = {}) => ({practices, practicePlans:[], scoreAnnotations:[], songs:[{id:'s1', title:'곡 하나'}], deleted:{}, ...extra});
const env = (today = TODAY, extra = {}) => ({today, ...extra});

test('points per day: each source once, the kept bonus and the day are capped, minutes and lengths are never points', () => {
  const P = L.POINTS;
  assert.deepEqual([P.set, P.setStarted, P.record, P.voiceCheck, P.recording, P.pointRun, P.pointKept, P.pointKeptMax, P.dayCap], [30, 10, 10, 5, 5, 10, 2, 10, 60]);
  const one = (practices, extra = {}, e = {}) => L.level(db(practices, extra), env(TODAY, e)).today;
  assert.equal(one([]).points, 0);
  // 오늘의 연습: finished 30; stopped part-way with something done 10; nothing done 0. Two sets on a day count once (the best).
  assert.deepEqual(one([set(TODAY)]).parts, [{key:'set', text:'오늘의 연습을 끝까지 했어요', points:30}]);
  assert.deepEqual(one([set(TODAY, [], {left:true})]).parts.map(p => [p.key, p.points]), [['set-started', 10]]);
  assert.equal(one([set(TODAY, [], {state:'skipped'})]).points, 0);
  assert.equal(one([set(TODAY, [], {left:true, id:'a'}), set(TODAY, [], {id:'b'}), set(TODAY, [], {id:'c'})]).points, 30);
  // A record the person entered: 10 whatever its minutes (600 minutes is still 10); two records are still 10.
  const manual = (id, minutes, more = {}) => ({id, date:TODAY, minutes, manualMinutes:minutes, practiceTimeSource:'manual', ...more});
  assert.equal(one([manual('a', 5)]).points, 10);
  assert.equal(one([manual('a', 600)]).points, 10);
  assert.equal(one([manual('a', 30), manual('b', 40)]).points, 10);
  // Not records of their own: a row a set wrote for one of its steps (the set is counted), an import's unconfirmed row, an empty row.
  assert.equal(one([manual('b', 0), {id:'c', date:TODAY, minutes:0, mediaSeconds:900, practiceTimeSource:'unconfirmed'}]).points, 0);
  assert.equal(one([set(TODAY, [], {id:'x'}), manual('goal:g1', 20, {practiceSetId:'x'})]).points, 30);
  // A 연습 세트 from before 오늘의 연습 (step rows only, no run row) is a record of that day.
  assert.equal(one([manual('practice-set:old:1', 12, {practiceSetId:'old'}), manual('practice-set:old:2', 8, {practiceSetId:'old'})]).points, 10);
  // 보이스 체크 5 (not also a record).
  assert.deepEqual(one([{id:'voice-check:1', date:TODAY, minutes:.5, manualMinutes:.5, practiceTimeSource:'voice-check', voiceCheck:{v:1}}]).parts.map(p => [p.key, p.points]), [['voice-check', 5]]);
  // 곡 녹음 5, once, from the day alone (the model is never given a length).
  assert.equal(one([], {}, {recordingDates:[TODAY, TODAY, TODAY]}).points, 5);
  assert.equal(one([], {}, {recordingDates:[day(19)]}).points, 0);
  // 레슨 지적 체크: 10 + 2 for each 지켰어요, that bonus up to 10; a run with nothing marked is not a run.
  const run = (id, results, date = TODAY) => ({id:'point-run:' + id, kind:'score-point-run', songId:'s1', date, at:1, results});
  const kept = n => Object.fromEntries(Array.from({length:n}, (_, i) => ['point:' + i, 'kept']));
  assert.equal(one([], {scoreAnnotations:[run('a', {'point:1':'missed'})]}).points, 10);
  assert.equal(one([], {scoreAnnotations:[run('a', {...kept(3), 'point:x':'missed'})]}).points, 16);
  assert.equal(one([], {scoreAnnotations:[run('a', kept(9))]}).points, 20);
  assert.equal(one([], {scoreAnnotations:[run('a', kept(2)), run('b', kept(4))]}).points, 18); // the best run of the day, not a sum
  assert.equal(one([], {scoreAnnotations:[run('a', {})]}).points, 0);
  // Everything on one day is 70: the day gives 60.
  const all = one([set(TODAY), manual('a', 30), {id:'v', date:TODAY, voiceCheck:{v:1}}], {scoreAnnotations:[run('a', kept(5))]}, {recordingDates:[TODAY]});
  assert.equal(all.raw, 70); assert.equal(all.points, 60); assert.equal(all.capped, true);
  assert.deepEqual(all.parts.map(p => p.key), ['set', 'record', 'voice-check', 'recording', 'point-run', 'point-kept']);
  // Days add up; a day after today is not counted; a deleted row is not counted.
  const many = db([set(day(18)), set(day(19)), set(TODAY), set(day(21))]);
  assert.equal(L.level(many, env()).points, 90);
  many.deleted.practices = ['practice-set:' + day(19)];
  assert.equal(L.level(many, env()).points, 60);
});

test('levels: level n starts at 50·n·(n−1) points, ten levels with a name each', () => {
  assert.deepEqual(L.LEVELS.map(x => L.levelStart(x.n)), [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500]);
  assert.equal(L.LEVELS.length, 10);
  assert.equal(new Set(L.LEVELS.map(x => x.name)).size, 10);
  assert.ok(L.LEVELS.every((x, i) => x.n === i + 1 && typeof x.name === 'string' && x.name.length > 0));
  for (const [points, n] of [[0, 1], [99, 1], [100, 2], [299, 2], [300, 3], [599, 3], [600, 4], [4499, 9], [4500, 10], [99999, 10]]) assert.equal(L.levelOf(points), n, points + '점');
  // The bar: how far through the level shown.
  const days = n => Array.from({length:n}, (_, i) => set(L.shift(TODAY, -i)));
  const lv = L.level(db(days(5)), env()); // 150 points
  assert.deepEqual([lv.level, lv.name, lv.points, lv.next, lv.toNext, lv.percent, lv.nextName], [2, L.LEVELS[1].name, 150, 300, 150, 25, L.LEVELS[2].name]);
  const top = L.level(db(days(160)), env());
  assert.deepEqual([top.level, top.next, top.toNext, top.percent], [10, null, null, 100]);
});

test('the level shown never drops below the one reached; a deleted record lowers the points honestly', () => {
  const data = db(Array.from({length:10}, (_, i) => set(L.shift(TODAY, -i)))); // 300 points
  assert.equal(L.level(data, env()).level, 3);
  assert.equal(L.nextState(data, env()).raised, true);
  assert.equal(L.keep(data, env(), {now:5}), true);
  const row = data.practicePlans.find(p => p.id === 'level-state');
  assert.deepEqual({id:row.id, kind:row.kind, level:row.level, reached:row.reached, updated:row.updated}, {id:'level-state', kind:'level-state', level:3, reached:{2:TODAY, 3:TODAY}, updated:5});
  // Nothing new: nothing is written again.
  assert.equal(L.keep(data, env(), {now:9}), false);
  assert.equal(data.practicePlans.filter(p => p.id === 'level-state').length, 1);
  // Four records are deleted: the points go down by what they gave, the level stays, and it says so.
  data.deleted.practices = data.practices.slice(0, 4).map(p => p.id);
  const after = L.level(data, env());
  assert.deepEqual([after.points, after.derived, after.reached, after.level, after.held, after.percent, after.toNext], [180, 2, 3, 3, true, 0, 420]);
  assert.equal(L.nextState(data, env()).changed, false);
  // Without the kept row the same records give level 2: the row is what holds it.
  assert.equal(L.level({...data, practicePlans:[]}, env()).level, 2);
  // An empty record keeps nothing.
  const empty = db(); assert.equal(L.keep(empty, env()), false); assert.deepEqual(empty.practicePlans, []);
});

test('a step is earned only when its criterion is met on 3 DIFFERENT days, then kept as a row with those days', () => {
  // 음정 1단계 = 3 of 5 held. Day 1 twice, day 2 once: two different days.
  const data = db([set(day(1), [pitch(3)], {id:'a'}), set(day(1), [pitch(4)], {id:'b'}), set(day(2), [pitch(3)]), set(day(3), [pitch(2)])]);
  let a = L.skill(data, 'pitch', env());
  assert.deepEqual([a.state, a.step, a.next.step, a.next.count, a.next.need, a.next.due], ['step', 0, 1, 2, 3, false]);
  assert.deepEqual(a.next.days.map(d => d.date), [day(1), day(2)]);
  assert.deepEqual(L.awardable(data, env()), []);
  assert.deepEqual(L.award(data, env()), []);
  // A third day: earned, with the three days and their values; the day it was earned is the third day.
  data.practices.push(set(day(18), [pitch(5)]));
  a = L.skill(data, 'pitch', env());
  assert.deepEqual([a.next.count, a.next.due], [3, true]);
  const fresh = L.award(data, env(), {now:7});
  assert.deepEqual(fresh.map(x => [x.area, x.step, x.earned]), [['pitch', 1, day(18)]]);
  assert.deepEqual(data.practicePlans.filter(p => p.kind === 'skill-step'), [{id:'skill-step:pitch:1', kind:'skill-step', v:1, area:'pitch', step:1, earned:day(18),
    days:[{date:day(1), value:3, unit:'개'}, {date:day(2), value:3, unit:'개'}, {date:day(18), value:5, unit:'개'}], created:7}]);
  a = L.skill(data, 'pitch', env());
  assert.deepEqual([a.step, a.next.step, a.next.count, a.keeping], [1, 2, 1, true]);
  assert.deepEqual(a.steps.map(s => s.state), ['earned', 'next', 'later', 'later', 'later']);
  // Awarding again adds nothing.
  assert.deepEqual(L.award(data, env()), []);
  assert.equal(data.practicePlans.filter(p => p.kind === 'skill-step').length, 1);
  // Two steps at once when the higher criterion was met on three days too (in order: 1 before 2).
  const both = db([day(1), day(2), day(3)].map(d => set(d, [pitch(5)])));
  assert.deepEqual(L.award(both, env()).map(x => x.step), [1, 2]);
  // A step whose measure does not exist yet (5음 스케일) is not passed over.
  assert.equal(L.skill(both, 'pitch', env()).step, 2);
  assert.equal(L.skill(both, 'pitch', env()).next.soon, '스케일 실시간 음정 연습');
  // Only finished items count: a measure on a skipped or unfinished item is not a measure.
  const skipped = db([day(1), day(2), day(3)].map(d => set(d, [pitch(5)], {state:'skipped'})));
  assert.equal(L.skill(skipped, 'pitch', env()).state, 'ready');
});

test('an earned step is never removed; 요즘도 유지 중 is the last 14 days', () => {
  const data = db([day(1), day(2), day(3)].map(d => set(d, [pitch(4)])));
  L.award(data, env());
  assert.equal(L.skill(data, 'pitch', env()).step, 1);
  // Every record is deleted: the step stays (its row), there is just nothing recent.
  data.deleted.practices = data.practices.map(p => p.id);
  let a = L.skill(data, 'pitch', env());
  assert.deepEqual([a.step, a.keeping, a.state, a.earned.map(e => e.step)], [1, false, 'step', [1]]);
  // 유지 중: the criterion of the step held, met at least once in today−13 … today.
  const keep = (last, today = TODAY) => { const d = db([day(1), day(2), day(3), last].map(x => set(x, [pitch(4)]))); L.award(d, env(today)); return L.skill(d, 'pitch', env(today)).keeping; };
  assert.equal(keep(day(7)), true);            // 13 days before the 20th
  assert.equal(keep(day(6)), false);           // 14 days before: outside
  assert.equal(keep(day(20)), true);
  // A lower result lately does not take the step away, and is not "keeping" it either.
  const low = db([...[day(1), day(2), day(3)].map(x => set(x, [pitch(4)])), set(day(19), [pitch(1)])]);
  L.award(low, env()); a = L.skill(low, 'pitch', env());
  assert.deepEqual([a.step, a.keeping], [1, false]);
  assert.equal(L.skill(db(), 'pitch', env()).keeping, null); // no step: nothing to keep
});

test('기준 맞추는 중: no step for 14 days from the first measurement, the draft level is said, then awarding starts by itself', () => {
  const data = db([day(7), day(8), day(9), day(10)].map(d => set(d, [sustain(11, 6)])));
  // The 20th is the 14th day: still measuring.
  let a = L.skill(data, 'sustain', env(day(20)));
  assert.deepEqual([a.state, a.first, a.day, a.daysLeft, a.step, a.estimate, a.next.due], ['calibrating', day(7), 14, 1, 0, 2, false]);
  assert.deepEqual(L.awardable(data, env(day(20))), []);
  assert.deepEqual(L.award(data, env(day(20))), []);
  assert.deepEqual(data.practicePlans, []);
  // The draft level follows the table: 4초·20 cent is step 1, 6초·20 cent step 2, an 8-second hold would be step 3.
  const est = m => L.skill(db([day(7), day(8), day(9)].map(d => set(d, [m]))), 'sustain', env(day(12))).estimate;
  assert.deepEqual([est(sustain(25, 6)), est(sustain(20, 4)), est(sustain(20, 6)), est(sustain(18, 8)), est(sustain(12, 8))], [0, 1, 2, 3, 4]);
  // With fewer than three measured days the estimate uses the days there are.
  assert.equal(L.skill(db([set(day(7), [sustain(15, 6)])]), 'sustain', env(day(7))).estimate, 2);
  // The 21st is the 15th day: the same records now earn their steps — nothing else had to happen.
  a = L.skill(data, 'sustain', env(day(21)));
  assert.deepEqual([a.state, a.day, a.next.due], ['step', 15, true]);
  const fresh = L.award(data, env(day(21)));
  assert.deepEqual(fresh.map(x => [x.area, x.step, x.earned]), [['sustain', 1, day(21)], ['sustain', 2, day(21)]]); // earned when the window ended, not before
  assert.equal(L.skill(data, 'sustain', env(day(21))).step, 2);
  // Each area has its own window: 음정 first measured on the 15th is still in it on the 21st.
  data.practices.push(...[day(15), day(16), day(17)].map(d => set(d, [pitch(5)], {id:'p' + d})));
  assert.equal(L.skill(data, 'pitch', env(day(21))).state, 'calibrating');
  assert.deepEqual(L.award(data, env(day(21))), []);
  // The first-measured day is kept, so deleting the first record does not start the window again.
  const kept = db([day(1), day(2), day(3)].map(d => set(d, [pitch(4)])));
  L.keep(kept, env(day(3)));
  assert.equal(kept.practicePlans.find(p => p.id === 'level-state').first.pitch, day(1));
  kept.deleted.practices = ['practice-set:' + day(1)];
  assert.equal(L.skill(kept, 'pitch', env(day(16))).first, day(1));
  assert.equal(L.skill(kept, 'pitch', env(day(16))).state, 'step');
  assert.equal(L.skill({...kept, practicePlans:[]}, 'pitch', env(day(15))).state, 'calibrating'); // without the kept day it would
});

test('음역: only notes held comfortably count, the first week is the start, steps are semitones beyond it', () => {
  // First week (1st–7th): C4–G4 at the widest.
  const week = [set(day(1), [range(60, 65)]), set(day(3), [range(62, 67)]), set(day(6), [range(61, 66)])];
  let a = L.skill(db(week), 'range', env(day(6)));
  assert.deepEqual(a.base, {low:60, high:67, closed:false});
  assert.equal(a.recent[0].text, 'C#4–F#4 · 3개 음');
  // After the week: a day reaching A4 and B3 is 2 + 1 = 3 semitones beyond the start.
  const later = db([...week, set(day(9), [range(59, 69)]), set(day(10), [range(59, 69)]), set(day(11), [range(60, 68)]), set(day(12), [range(59, 69)])]);
  a = L.skill(later, 'range', env(day(16)));
  assert.deepEqual(a.base, {low:60, high:67, closed:true});
  assert.match(a.recent[0].text, /처음보다 \+3반음$/);
  assert.deepEqual(L.award(later, env(day(16))).map(x => x.step), [1, 2, 3]); // +3 on the 9th, 10th and 12th (the 11th is +1)
  // The baseline is kept with the state, so it does not move when the first week's records go.
  L.keep(later, env(day(16)));
  assert.deepEqual(later.practicePlans.find(p => p.id === 'level-state').rangeBase, {low:60, high:67, from:day(1), to:day(7)});
  later.deleted.practices = week.map(p => p.id);
  assert.deepEqual(L.skill(later, 'range', env(day(16))).base, {low:60, high:67, closed:true});
  // Guardrails: a single highest note (peak), a note not held for 2 seconds, or a reading without a hold length is not a measure.
  for (const bad of [range(60, 84, {peak:true}), range(60, 84, {seconds:1.2}), (() => { const m = range(60, 84); delete m.seconds; return m; })()]) {
    assert.equal(L.cleanMeasure(bad), null);
    assert.equal(L.skill(db([set(day(1), [bad])]), 'range', env(day(2))).state, 'ready');
  }
  assert.equal(L.cleanMeasure({area:'high', value:10, unit:'cent', fromTop:0}), null); // 고음 too: no hold length, no measure
  assert.ok(L.cleanMeasure({area:'high', value:10, unit:'cent', fromTop:0, seconds:2}));
});

test('no step for volume: loudness is never a measure and no criterion reads it', () => {
  assert.equal(L.tableIsSafe(), true);
  for (const m of [{area:'breath', value:80, unit:'dB'}, {area:'sustain', kind:'loudness', value:5, unit:'cent'}, {area:'high', kind:'peak', value:90, seconds:3}]) assert.equal(L.cleanMeasure(m), null);
  const fields = L.SKILLS.flatMap(a => a.steps.flatMap(s => s.conds.map(c => c.field)));
  assert.ok(!fields.some(f => /loud|volume|db|peak/i.test(f)), fields.join(','));
  // A loud breath reading does nothing for 호흡.
  const data = db([day(1), day(2), day(3)].map(d => set(d, [{area:'breath', value:99, unit:'dB'}])));
  assert.equal(L.skill(data, 'breath', env()).state, 'soon');
  // The table: 8 areas × 5 steps, every step with words and at least one condition.
  assert.deepEqual(L.SKILLS.map(a => a.id), ['breath', 'pitch', 'sustain', 'path', 'range', 'high', 'vibrato', 'rhythm']);
  assert.ok(L.SKILLS.every(a => a.steps.length === 5 && a.steps.every(s => s.say && s.conds.length)));
  // Bad values are not measures.
  for (const m of [null, 3, {area:'pitch'}, {area:'pitch', value:'4'}, {area:'', value:1}, {value:1}, {area:'pitch', value:NaN}]) assert.equal(L.cleanMeasure(m), null);
});

test('areas without an exercise are 준비 중, and take measures later with no change to the model', () => {
  const none = L.skills(db(), env());
  assert.deepEqual(none.map(a => [a.id, a.state]), [['breath', 'soon'], ['pitch', 'ready'], ['sustain', 'ready'], ['path', 'soon'], ['range', 'ready'], ['high', 'soon'], ['vibrato', 'soon'], ['rhythm', 'soon']]);
  assert.ok(none.filter(a => a.state === 'soon').every(a => a.soon && a.next.soon === a.soon && a.steps.every(s => s.soon)));
  // The day an exercise writes {area, value, unit, …}: the same rules apply — measured, calibrated, awarded.
  const future = [
    ['breath', {area:'breath', kind:'s-length', value:16, unit:'초', even:2}, 2],
    ['path', {area:'path', kind:'siren', value:12, unit:'반음', breaks:0, flips:1, both:1}, 3],
    ['high', {area:'high', kind:'top-hold', value:11, unit:'cent', fromTop:0, seconds:2, vowels:1}, 3],
    ['vibrato', {area:'vibrato', kind:'longtone', value:3.4, unit:'초', rate:5.5, extent:22, regular:1}, 2],
    ['rhythm', {area:'rhythm', kind:'ta', value:55, unit:'ms', level:2}, 3]
  ];
  for (const [id, m, steps] of future) {
    const data = db([day(1), day(2), day(3)].map(d => set(d, [m])));
    const early = L.skill(data, id, env(day(3)));
    assert.deepEqual([early.state, early.estimate, early.recent.length], ['calibrating', steps, 3], id);
    assert.deepEqual(L.award(data, env(day(14))), [], id);
    assert.deepEqual(L.award(data, env(day(15))).map(x => x.step), Array.from({length:steps}, (_, i) => i + 1), id);
    const a = L.skill(data, id, env(day(15)));
    assert.deepEqual([a.state, a.step, a.keeping, a.next.soon], ['step', steps, true, ''], id);
  }
  // An area nobody knows is carried in the row and simply not shown.
  assert.equal(L.measurements(db([set(day(1), [{area:'twang', value:1, unit:'x'}])]), env()).length, 1);
  assert.equal(L.skills(db([set(day(1), [{area:'twang', value:1, unit:'x'}])]), env()).length, 8);
});

test('오늘의 연습 keeps what 단계 reads: the wobble and octave of a held note, and measures in the run row', () => {
  // A hold that moves ±10 cent around the note: sd 10; a steady one: 0.
  let h = D.holdStart();
  for (let i = 0; i < 44; i++) D.holdTick(h, i % 2 ? 10 : -10, .1, {need:4});
  assert.deepEqual(D.holdResult(h), {ok:true, held:4.4, sung:4.4, accuracy:100, cents:0, sd:10});
  h = D.holdStart();
  for (let i = 0; i < 41; i++) D.holdTick(h, 6, .1, {need:4, octave:-1});
  assert.deepEqual(D.holdResult(h), {ok:true, held:4.1, sung:4.1, accuracy:100, cents:6, sd:0, octave:-1});
  // The wobble is of the longest hold: what was sung before a real break is not in it.
  h = D.holdStart();
  for (let i = 0; i < 10; i++) D.holdTick(h, i % 2 ? 24 : -24, .1, {need:4});
  for (let i = 0; i < 6; i++) D.holdTick(h, 80, .1, {need:4});       // out for 0.6 s: the hold starts again
  for (let i = 0; i < 30; i++) D.holdTick(h, 2, .1, {need:4});
  assert.equal(D.holdResult(h).sd, 0); assert.equal(D.holdResult(h).held, 3);
  // Never sung: no wobble to report.
  assert.deepEqual(D.holdResult(D.holdStart()), {ok:false, held:0, sung:0, accuracy:null, cents:null});
  // The exercises say what they measure.
  assert.deepEqual(['voice-hum', 'voice-mum', 'ear-follow'].map(id => D.exercise(id).measure), [['sustain', 'range'], ['sustain', 'range'], ['pitch', 'range']]);
  // From the notes of a step to measures: 음정 counts held notes; 지속음 the middle wobble of the held ones; 음역 the
  // notes held 2 s or more, in the octave they were sung.
  const notes = [{midi:60, ok:true, held:4, sd:6}, {midi:62, ok:true, held:4, sd:14}, {midi:64, ok:false, held:2.5, sd:21, octave:-1}, {midi:65, ok:false, held:1.1, sd:30}, {midi:67, ok:true, held:4, sd:9}];
  assert.deepEqual(L.fromHold(D.exercise('ear-follow'), notes), [{area:'pitch', kind:'hold', value:3, of:5, unit:'개', hold:4, tolerance:25},
    {area:'range', kind:'comfortable', value:15, unit:'반음', low:52, high:67, seconds:2, count:4}]);
  assert.deepEqual(L.fromHold(D.exercise('voice-mum'), notes)[0], {area:'sustain', kind:'longtone', value:9, unit:'cent', hold:6, count:3, of:5});
  // Without the mic (a timer) the notes carry no hold: nothing is measured. An exercise that measures nothing: nothing.
  assert.deepEqual(L.fromHold(D.exercise('ear-follow'), [{midi:60}, {midi:62}]), []);
  assert.deepEqual(L.fromHold(D.exercise('loosen-neck'), notes), []);
  // The run row keeps the measures of each item as they are (any area, any fields).
  const P = require('../app/practice-set-model.js');
  const s = P.start([{kind:'exercise', id:'ex-ear-follow', exercise:'ear-follow', group:'ear', title:'음 따라 부르기', minutes:3, mic:true}], {id:'sess', date:TODAY, now:1000});
  const measures = [...L.fromHold(D.exercise('ear-follow'), notes), {area:'rhythm', kind:'ta', value:48, unit:'ms', level:1}];
  P.play(s, 1000);
  D.finishItem(s, {state:'done', result:{mode:'hold', parts:5, notes, holdSeconds:14.5, accuracy:80, measures}, now:41000});
  const data = db();
  D.save(data, s, [], {now:42000});
  const row = data.practices.find(p => p.id === 'practice-set:sess');
  assert.deepEqual(row.dailySet.items[0].measures, measures);
  assert.equal(row.dailySet.items[0].notes[1].sd, 14);
  assert.deepEqual(L.measurements(data, env()).map(m => [m.area, m.value, m.date]), [['pitch', 3, TODAY], ['range', 15, TODAY], ['rhythm', 48, TODAY]]);
  assert.equal(L.level(data, env()).today.points, 30);
});

test('선생님 지적 배지 and the 기준표 text', () => {
  const data = db([day(1), day(2), day(3), day(19)].map(d => set(d, [pitch(4), sustain(13, 6)])), {scoreAnnotations:[
    {id:'point:a', kind:'score-point', songId:'s1', measures:{from:1, to:2}, text:'숨 미리 마시기', retired:new Date(2026, 10, 14, 9).getTime()},
    {id:'point:b', kind:'score-point', songId:'gone', measures:{from:3, to:3}, text:'턱 내리기', retired:new Date(2026, 10, 18, 9).getTime()},
    {id:'point:c', kind:'score-point', songId:'s1', measures:{from:5, to:6}, text:'아직 보는 중'},
    {id:'point:d', kind:'score-point', songId:'s1', measures:{from:7, to:8}, text:'지운 지적', retired:5}]});
  data.deleted.scoreAnnotations = ['point:d'];
  assert.deepEqual(L.badges(data), [{id:'point:b', text:'턱 내리기', songId:'gone', song:'', date:'2026-11-18'}, {id:'point:a', text:'숨 미리 마시기', songId:'s1', song:'곡 하나', date:'2026-11-14'}]);
  L.award(data, env());
  const text = L.sheetText(data, env());
  for (const part of ['큰 단계', 'Lv 2 · ' + L.LEVELS[1].name + ' · 120점', '하루 최대 60점', 'Lv10 4500', '[음정] 1단계 · 요즘도 유지 중', '[지속음] 2단계 · 요즘도 유지 중', '[호흡] 재는 연습을 준비 중',
    '[음역] 아직 재지 않았어요', '2단계: 들은 음 5개를 모두 ±25 cent 안에서 4초씩 유지해요', '다음 2단계: 3번 중 0번 했어요', '내 기록: 11.19 5개 중 4개 유지', '11.19 흔들림 13 cent · 6초', '서로 다른 3일', '선생님 지적 배지: 2개'])
    assert.ok(text.includes(part), part + '\n' + text);
  // Numbers only: no ids, song titles or badge words.
  for (const hidden of ['practice-set:', 'point:', 's1', '곡 하나', '턱 내리기', 'level-state', 'skill-step']) assert.ok(!text.includes(hidden), hidden);
  assert.equal(text.split('\n').filter(l => /^\[/.test(l)).length, 8);
});
