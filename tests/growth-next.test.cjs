// 다음 연습 (app/growth-next-model.js) — one list from every place that recommends something, deduplicated and ranked
// 숙제 > 놓친 레슨 지적 > 측정 기반 > 계획·목표 > AI 초안, each item with its source chips. Node only; invented data
// (tests/growth-b1.fixture.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../app/growth-next-model.js');
const PS = require('../app/precision-session-model.js');
const {TODAY, DB, OVERALL, TIPS} = require('./growth-b1.fixture.cjs');

const all = (extra = {}) => N.build({db:DB, today:TODAY, overall:OVERALL, tips:TIPS, limit:50, ...extra});

test('homework ranks first, the one due soonest first; done, past-due and checked-off homework is not listed', () => {
  const m = all();
  assert.deepEqual(m.items.slice(0, 2).map(x => x.id), ['homework:hw-soon', 'homework:hw-late']);
  assert.equal(m.items[0].why, '숙제 · 내일까지');
  assert.equal(m.items[1].why, '숙제 · 11월 28일까지 (D-9)');
  assert.deepEqual(m.items[0].action, {kind:'homework', assignmentId:'hw-soon'});
  assert.equal(m.items[1].due, '2026-11-28');
  assert.equal(m.items.some(x => /hw-done|hw-past/.test(x.id)), false);
  const checked = {...DB, dailyGoals:DB.dailyGoals.map(g => g.id === 'g-hw' ? {...g, completed:true} : g)};
  assert.equal(N.fromHomework(checked, {today:TODAY}).some(x => x.id === 'homework:hw-soon'), false);
});

test('the order of the sources: 숙제 > 놓친 레슨 지적 > 측정 기반 > 정밀 측정 > 목표·계획 > AI 초안', () => {
  const m = all({precision:{results:[]}});
  const tiers = m.items.map(x => N.TIER[x.source]);
  assert.deepEqual(tiers, tiers.slice().sort((a, b) => a - b));
  assert.deepEqual([...new Set(m.items.map(x => x.source))], ['homework', 'lesson-point', 'measure', 'precision', 'goal', 'plan', 'ai']);
  for (const x of m.items) {
    assert.ok(N.LABEL[x.source], x.source);
    assert.ok(x.sources.every(s => N.SOURCES.includes(s)));
    assert.equal(x.sources[0], x.source);
    assert.ok(x.title && x.why && x.action?.kind, x.id);
  }
});

test('the same thing from two places is one item with both chips: AI draft + 반복 목표, homework + today\'s goal', () => {
  const m = all();
  const routine = m.items.filter(x => x.title === '후렴 첫 구절 롱톤으로 이어 부르기');
  assert.equal(routine.length, 1);
  assert.equal(routine[0].source, 'plan');                         // ranked where it ranks highest
  assert.deepEqual(routine[0].sources, ['plan', 'ai']);
  assert.deepEqual(routine[0].also, [{source:'ai', id:'ai:ai-review:2026-11-18:s1'}]);
  assert.equal(m.items.some(x => x.id === 'ai:ai-review:2026-11-18:s1'), false);
  // A goal made from a homework is linked by its id: one item, under 숙제.
  const lip = m.items.filter(x => x.title === '립트릴 5분');
  assert.equal(lip.length, 1);
  assert.deepEqual(lip[0].sources, ['homework', 'goal', 'ai']);    // and the AI 월간 코치 said the same words
  assert.equal(m.items.some(x => x.id === 'goal:g-hw'), false);
  // A measure from 전체 분석 and the same measure from 맞춤 연습 추천 (wob → stability): one item.
  const stab = m.items.filter(x => x.action.metric === 'stability');
  assert.equal(stab.length, 1);
  assert.equal(stab[0].title, '편안한 음에서 5초 지속음을 같은 조건으로 녹음하기');
  // Titles compare without spaces, punctuation or a "(N분)" tail.
  assert.equal(N.norm(' 편안한 음에서  5초 지속음을 같은 조건으로 녹음하기 (8분) '), N.norm('편안한 음에서 5초 지속음을, 같은 조건으로 녹음하기.'));
  // A goal saved from 전체 분석 "목표 담기" ("practice (N분)") is the same as that measure.
  const goal = {id:'overall-growth:2026-11-19:stability', date:TODAY, title:'편안한 음에서 5초 지속음을 같은 조건으로 녹음하기 (8분)', source:'personal', sourceId:'overall-growth', completed:false};
  const withGoal = N.build({db:{...DB, dailyGoals:[...DB.dailyGoals, goal]}, today:TODAY, overall:OVERALL, limit:50});
  assert.deepEqual(withGoal.items.find(x => x.action.metric === 'stability').sources, ['measure', 'goal']);
  // Different songs are different items, even with the same words.
  const two = N.merge([{source:'goal', id:'goal:1', title:'롱톤', songId:'s1', action:{kind:'goal'}}, {source:'ai', id:'ai:1', title:'롱톤', songId:'s2', action:{kind:'ai-draft'}}]);
  assert.equal(two.total, 2);
});

test('at most `limit` items (default 5) and how many more', () => {
  const m = N.build({db:DB, today:TODAY, overall:OVERALL, tips:TIPS});
  assert.equal(N.LIMIT, 5);
  assert.equal(m.items.length, 5);
  assert.equal(m.total, all().total);
  assert.equal(m.more, m.total - 5);
  assert.deepEqual(N.build({db:DB, today:TODAY, limit:2}).items.map(x => x.source), ['homework', 'homework']);
  assert.deepEqual(N.build({db:{}, today:TODAY}), {items:[], more:0, total:0});
  assert.throws(() => N.build({db:DB}), /오늘 날짜/);
});

test('놓친 레슨 지적: an active point whose latest marked run was 놓쳤어요, recently; kept or retired ones are not', () => {
  const x = N.fromLessonPoints(DB, {today:TODAY});
  assert.deepEqual(x.map(i => i.id), ['lesson-point:point:a']);
  assert.equal(x[0].title, '연습곡 하나 · 12–14마디 · 숨 미리 쉬기');
  assert.equal(x[0].why, '레슨 지적 · 최근 2번 중 0번 지켰어요 · 마지막 체크에서 놓쳤어요');
  assert.deepEqual(x[0].measures, {from:12, to:14});
  assert.deepEqual(x[0].action, {kind:'lesson-point', songId:'s1', pointId:'point:a', measures:{from:12, to:14}, href:'#/song/s1'});
  assert.deepEqual(N.fromLessonPoints(DB, {today:'2027-01-30'}), []);          // the last run is too long ago
});

test('측정 기반: 전체 분석 recommendations, a month\'s kept 추천 연습, and 맞춤 연습 추천 tips, one per measure', () => {
  const x = N.fromMeasures({overall:OVERALL, tips:TIPS, monthly:{month:'2026-10', recommendations:[{key:'phrase', title:'호흡 유지', practice:'한 프레이즈를 무리 없는 호흡으로 끝까지 연결해 부르기', minutes:8}]}});
  const m = N.merge(x, {limit:10});
  assert.deepEqual(m.items.map(i => i.action.metric), ['stability', 'phrase']);
  assert.equal(m.items[1].why, '측정 기반 · 호흡 유지 · 2026-10 추천 연습 · 권장 8분');
  assert.deepEqual(m.items[0].action, {kind:'add-goal', metric:'stability', title:'편안한 음에서 5초 지속음을 같은 조건으로 녹음하기', minutes:8});
  // Not enough measured takes for tips: no tip.
  assert.deepEqual(N.fromMeasures({tips:{enough:false, count:2, tips:[]}}), []);
  // A tip for one song carries the song and opens that tip.
  const one = N.fromMeasures({tips:TIPS, songId:'s1'});
  assert.deepEqual(one[0].action, {kind:'practice-tip', metric:'stability', title:'음정 안정성 (롱톤) 연습', minutes:8, tipKey:'wob', songId:'s1'});
});

test('정밀 측정: resume a half-done session, else invite, else measure a one-day task again', () => {
  const s = PS.create({id:'x', owner:'o', targetMidi:60});
  assert.deepEqual(N.fromPrecision({session:s}), []);                           // not started
  PS.capture(s, s.tasks[0].id, {mediaId:'m'}); PS.result(s, s.tasks[0].id, {ok:1});
  const resume = N.fromPrecision({session:s, results:[]});
  assert.equal(resume[0].id, 'precision:resume');
  assert.equal(resume[0].why, '정밀 측정 · 20개 과제 중 1개 했어요');
  assert.deepEqual(resume[0].action, {kind:'route', href:'#/precision-measurement'});
  assert.equal(N.fromPrecision({results:[]})[0].id, 'precision:start');
  const once = N.fromPrecision({results:[{}], changes:{excluded:[{kind:'task', reason:'one-day'}, {kind:'task', reason:'withheld'}]}});
  assert.equal(once[0].id, 'precision:again');
  assert.match(once[0].why, /1개 과제/);
  assert.deepEqual(N.fromPrecision({results:null}), []);
});

test('목표 · 계획: today\'s unfinished goals in 홈 order, the running monthly plan with its segment, running 반복 목표', () => {
  assert.deepEqual(N.fromGoals(DB, {today:TODAY}).map(x => x.id), ['goal:g-hw', 'goal:g-own']);
  const plans = N.fromPlans(DB, {today:TODAY});
  assert.deepEqual(plans.map(x => x.id), ['plan:monthly-plan:p1', 'plan:routine:r1']);
  assert.equal(plans[0].title, '연습곡 하나 · 음정 안정성 · 1:02–1:15');
  assert.equal(plans[0].why, '곡별 집중 연습 계획 · 7일 중 4일째');
  assert.deepEqual(plans[0].action, {kind:'plan', planId:'monthly-plan:p1', songId:'s1', segmentStart:62, segmentEnd:75});
  assert.deepEqual(N.fromPlans(DB, {today:'2026-12-30'}), []);                 // both ended
});

test('AI 초안: the 다음 연습 part of the coach notes and untaken drafts, newer than 30 days; never skipped ones', () => {
  assert.deepEqual(N.noteNext('요약: 좋아요\n다음 연습: 1. 롱톤 5초\n2) 립트릴\n- 세 번째\n보완할 점: 고음'), ['롱톤 5초', '립트릴']);
  assert.deepEqual(N.noteNext('다음 연습: 낮은 음 허밍'), ['낮은 음 허밍']);
  assert.deepEqual(N.noteNext('요약만 있어요'), []);
  const x = N.fromAi(DB, {today:TODAY});
  assert.deepEqual(x.map(i => i.id), ['ai:ai-review:2026-11-18:s1', 'ai:overall-ai:all:0', 'ai:lab-ai', 'ai:monthly-ai:2026-10:0', 'ai:monthly-ai:2026-10:1']);
  assert.equal(x.some(i => /건너뛴|오래된/.test(i.title)), false);
  assert.deepEqual(x[0].action, {kind:'ai-draft', ref:{kind:'ai-review', id:'ai-review:2026-11-18:s1'}, href:'#/practice-review?song=s1'});
  assert.equal(x[0].songId, 's1');
  assert.deepEqual(N.fromAi(DB, {today:TODAY, days:3}).map(i => i.id), ['ai:ai-review:2026-11-18:s1', 'ai:overall-ai:all:0']);
});

test('reads only: the records are not changed', () => {
  const before = JSON.stringify(DB);
  all({precision:{results:[]}});
  assert.equal(JSON.stringify(DB), before);
});
