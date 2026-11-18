// 들어 보고 남기는 평가 + 무엇이 달라졌나 — the pure parts: section alignment (app/segment-ab-model.js), the verdict record
// (app/listen-verdict-model.js) and the summary lines with their exclusion reasons (app/growth-changes-model.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../app/segment-ab-model.js');
const L = require('../app/listen-verdict-model.js');
const C = require('../app/growth-changes-model.js');
const P = require('../app/precision-report-model.js');
const PS = require('../app/precision-session-model.js');
const {v2} = require('./growth-characterization.fixture.cjs');

const take = (id, date, a, ok = true, created = Date.parse(date + 'T20:00:00+09:00')) => ({id, songId:'s1', a, date, created, ok});

test('a section is per take: typed start/end, the whole take when nothing is typed, never past the take', () => {
  assert.deepEqual(S.section(0, null, 120), {start:0, end:120});
  assert.deepEqual(S.section('', '', 120), {start:0, end:120});
  assert.deepEqual(S.section(30, 70.04, 120), {start:30, end:70});
  assert.deepEqual(S.section(0, null, null), {start:0, end:null});
  assert.equal(S.section(70, 30, 120), null);
  assert.equal(S.section(-1, 30, 120), null);
  assert.equal(S.section(10, 130, 120), null);        // more than a second past the end
  assert.deepEqual(S.section(10, 120.6, 120), {start:10, end:120});
  assert.equal(S.whole({start:0, end:120}, 120), true);
  assert.equal(S.whole({start:0, end:100}, 120), false);
});
test('flipping A↔B keeps the same relative position inside the two sections', () => {
  // 40% into A's 30–80 s → 40% into B's 10–30 s.
  assert.equal(S.mapPosition(50, {start:30, end:80}, {start:10, end:30}), 18);
  assert.equal(S.mapPosition(10, {start:30, end:80}, {start:10, end:30}), 10);   // before the section: its start
  assert.equal(S.mapPosition(99, {start:30, end:80}, {start:10, end:30}), 30);   // past it: its end
  // A section without a typed end uses the player's length.
  assert.equal(S.mapPosition(60, {start:0, end:null}, {start:0, end:null}, {fromLength:120, toLength:240}), 120);
});
test('the verdict is kept in recording order with only the given tags; A/B is only how it was shown', () => {
  const late = {id:'m2', date:'2026-11-10', created:2, range:{start:30, end:70}}, early = {id:'m1', date:'2025-08-14', created:1, range:null};
  // Shown blind with the later take as A: "A가 나아요" is the later (second) take.
  const aIsFirst = L.order(late, early) <= 0;
  assert.equal(aIsFirst, false);
  const v = L.make({songId:'s1', takes:[late, early], overall:L.choiceOf('A', aIsFirst), tags:{path:L.choiceOf('A', aIsFirst), pitch:L.choiceOf('same', aIsFirst), breath:''},
    memo:'  첫 소리가 편해요 ', judge:'teacher', teacher:'김지은', lessonId:'l1', blind:true}, {now:1000, today:'2026-11-18'});
  assert.equal(v.kind, 'listen-verdict');
  assert.deepEqual([v.firstId, v.secondId, v.firstDate, v.secondDate], ['m1', 'm2', '2025-08-14', '2026-11-10']);
  assert.deepEqual([v.firstRange, v.secondRange], [null, {start:30, end:70}]);
  assert.equal(v.overall, 'second');
  assert.deepEqual(v.tags, {path:'second', pitch:'same'});
  assert.deepEqual([v.memo, v.judge, v.teacher, v.lessonId, v.blind, v.judgedDate, v.created], ['첫 소리가 편해요', 'teacher', '김지은', 'l1', true, '2026-11-18', 1000]);
  assert.equal(L.sideOf(v.overall, aIsFirst), 'A');
  // 나 never keeps a teacher name.
  assert.equal(L.make({songId:'s1', takes:[early, late], overall:'same', judge:'me', teacher:'김지은'}).teacher, '');
  assert.throws(() => L.make({songId:'s1', takes:[early, late]}), /전체로 어느 쪽이 나은지/);
  assert.throws(() => L.make({songId:'s1', takes:[early, early], overall:'same'}), /서로 다른 녹음/);
  assert.throws(() => L.make({songId:'s1', takes:[early, late], overall:'same', memo:'x'.repeat(501)}), /500자/);
  assert.throws(() => L.make({songId:'s1', takes:[early, late], overall:'same', tags:{path:'better'}}), /자세히/);
});
test('verdict words quote the person and name the months; the list leaves out deleted and other kinds', () => {
  const v = {kind:'listen-verdict', id:'v1', songId:'s1', firstDate:'2025-08-14', secondDate:'2026-11-10', overall:'second', tags:{path:'second', breath:'second', pitch:'same'}, judge:'teacher', teacher:'김지은'};
  assert.equal(L.line(v), '선생님 김지은: 2026년 11월 녹음이 2025년 8월 녹음보다 낫다고 들었어요 · 소리 길·호흡은 2026년 11월이 나아요 · 음정은 비슷해요');
  assert.equal(L.overallText({...v, firstDate:'2026-08-14', overall:'first'}), '8월 녹음이 11월 녹음보다 낫다고 들었어요');
  assert.equal(L.overallText({...v, firstDate:'2026-11-03', overall:'same'}), '11월 3일 녹음과 11월 10일 녹음이 비슷하다고 들었어요');
  assert.deepEqual(L.dayLabels('2026-11-10', '2026-11-10'), ['11월 10일 처음', '11월 10일 나중']);
  assert.equal(L.who({judge:'me'}), '나');
  const db = {comparisonReports:[{id:'r1', firstId:'a', secondId:'b', notes:'메모'}, {...v, judgedDate:'2026-11-17'}, {...v, id:'v2', judgedDate:'2026-11-18'}, {...v, id:'v3'}], deleted:{comparisonReports:['v3']}};
  assert.deepEqual(L.list(db).map(x => x.id), ['v2', 'v1']);
  assert.deepEqual(L.list(db, {lessonId:'none'}), []);
  assert.deepEqual(L.defaultPair([take('b', '2026-10-01'), take('a', '2025-08-14'), take('c', '2026-11-10')]).map(t => t.id), ['a', 'c']);
});

test('같은 곡 같은 방법: the latest take\'s method decides; earlier takes measured another way are never paired', () => {
  const raw = v2({into:30, wob:20}), mr = o => v2({mr:true, ...o}), ai = o => v2({ai:true, ...o});
  // Both MR 빼고: compared, and the line says the method and the months.
  const same = C.songChange({songId:'s1', title:'Defying Gravity', takes:[take('a0', '2025-08-14', raw), take('a1', '2026-09-05', mr({into:30, wob:20})), take('a2', '2026-11-10', mr({into:12, wob:20}))]});
  assert.ok(same.item, JSON.stringify(same));
  assert.equal(same.item.method, 'mrRemoved');
  assert.deepEqual([same.item.firstId, same.item.lastId], ['a1', 'a2']);
  assert.equal(same.item.basis, '같은 곡 Defying Gravity · MR 빼고 잰 녹음 2개 · 9월 → 11월');
  const into = same.item.changes.find(c => c.id === 'intonation');
  assert.equal(into.text, '가까운 반음과의 차이가 줄었어요');
  assert.match(into.numbers, /cent → .* cent/);
  // No verdict words on numbers alone.
  for (const c of same.item.changes) assert.doesNotMatch(c.text, /좋아|나빠|향상|악화|개선|실력|늘었어요/);
  // A mixed pair (8월 녹음 그대로, 11월 MR 빼고) is left out with its reason.
  const mixed = C.songChange({songId:'s2', title:'On My Own', takes:[take('b1', '2025-08-20', raw), take('b2', '2026-11-12', mr({into:10}))]});
  assert.equal(mixed.item, undefined);
  assert.equal(mixed.excluded.reason, 'method-mixed');
  assert.equal(mixed.excluded.text, '최근 녹음은 MR 빼고, 그 전 녹음은 녹음 그대로 잰 것이라 비교하지 않아요 · 같은 방법으로 잰 녹음끼리만 비교해요');
  // AI 분리 latest with an AI 분리 earlier take: compared as AI 분리.
  const sep = C.songChange({songId:'s3', title:'Memory', takes:[take('c1', '2026-09-01', ai({into:20})), take('c2', '2026-10-01', raw), take('c3', '2026-11-01', ai({into:18}))]});
  assert.equal(sep.item.method, 'aiSeparated');
  assert.deepEqual([sep.item.firstId, sep.item.lastId], ['c1', 'c3']);
  assert.match(sep.item.basis, /AI 분리 후 잰 녹음 2개/);
  // One take, takes of one day, unreliable only, nothing measured.
  assert.equal(C.songChange({songId:'s4', takes:[take('d1', '2026-11-01', raw)]}).excluded.reason, 'no-pair');
  assert.equal(C.songChange({songId:'s4', takes:[take('d1', '2026-11-01', raw), take('d2', '2026-11-01', raw, true, 5)]}).excluded.reason, 'same-day');
  assert.equal(C.songChange({songId:'s4', takes:[take('d1', '2026-10-01', raw, false), take('d2', '2026-11-01', raw, false)]}).excluded.reason, 'confidence');
  assert.equal(C.songChange({songId:'s4', takes:[{id:'x', a:null}]}), null);
  // Three takes of the method: "N개 중 처음·최근".
  const three = C.songChange({songId:'s1', title:'X', takes:[take('e1', '2026-09-01', raw), take('e2', '2026-10-01', raw), take('e3', '2026-11-01', v2({into:20, wob:20}))]});
  assert.match(three.item.basis, /녹음 그대로 잰 녹음 3개 중 처음·최근 · 9월 → 11월/);
});

const presult = (date, {task = 'sustain', vowel = 'a', environment = '방', source = 'clean', stability = 5, f0 = 220, rms = -20, engine = 'e1', start = 0} = {}) => ({
  engineVersion:engine, recordedDate:date, analyzedAt:date + 'T10:00:00Z', source:{id:'m-' + date + task, revision:'1'},
  context:{owner:'u', task, vowel, environment, loudness:'normal', source}, parameters:{w:1}, scope:{start, end:start + 5},
  metrics:{f0:{value:f0, unit:'Hz', confidence:'high'}, rms:{value:rms, unit:'dB', confidence:'high'}, stability:{value:stability, unit:'cent', confidence:'high'}, sustainDuration:{value:4, unit:'s', confidence:'medium'}}});
test('같은 과제: the first comparable session of an earlier day per task, compared by the precision report rules', () => {
  const api = {compare:P.compare, labels:P.LABELS, groups:PS.GROUPS};
  const r = C.taskChanges([presult('2026-09-01', {stability:6}), presult('2026-11-01', {stability:4}), presult('2026-10-01', {task:'steady', source:'unknown'}), presult('2026-11-02', {task:'steady'}),
    presult('2026-11-03', {task:'vibrato'})], api);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].title, '편안한 아');
  assert.equal(r.items[0].basis, '같은 과제 편안한 아 · 같은 모음·음량·환경 · 9월 → 11월');
  assert.deepEqual(r.items[0].changes.map(c => c.text), ['음정 안정성 6 → 4 cent', '연속 유성음 길이 4 → 4 s']);
  assert.deepEqual(r.excluded.map(x => [x.title, x.reason]), [['일정 음높이 유지', 'withheld'], ['비브라토 지속음', 'one-day']]);
  assert.match(r.excluded[0].text, /반주 없는 목소리인지 확인되지 않았어요/);
  // None at all: build invites; not read (no store): nothing.
  assert.equal(C.build({precision:[], precisionApi:api}).invite, true);
  assert.equal(C.build({precision:null, precisionApi:api}).invite, false);
});
test('음역: one line only when both windows hold enough recordings; otherwise a reason', () => {
  const text = () => '처음(2025.08–10) → 지금(2026.09–11) 주로 부른 음역 C4–A4 → C4–B4';
  const ok = {state:'ok', first:{enough:true, period:'2025.08–10', n:12}, now:{enough:true, period:'2026.09–11', n:9}};
  assert.deepEqual(C.rangeChange(ok, text).item, {kind:'range', text:text(), basis:'음역 처음·지금 · 처음 2025.08–10 녹음 12개 · 지금 2026.09–11 녹음 9개'});
  assert.equal(C.rangeChange({...ok, now:{...ok.now, enough:false}}, text).excluded.reason, 'small');
  assert.equal(C.rangeChange({state:'short', dataMonths:1}, () => '아직 비교할 만큼 기간이 쌓이지 않았어요').excluded.text, '아직 비교할 만큼 기간이 쌓이지 않았어요');
  assert.deepEqual(C.rangeChange({state:'none'}), {item:null, excluded:null});
});
test('the card: verdicts first (newest), songs most recent first, every left-out item with its reason', () => {
  const raw = v2({into:30}), v = {kind:'listen-verdict', id:'v1', songId:'s1', firstId:'a', secondId:'b', firstDate:'2025-08-14', secondDate:'2026-11-10', overall:'second', tags:{}, judge:'me', memo:''};
  const m = C.build({verdicts:[v], titleOf:id => ({s1:'Defying Gravity'})[id], songs:[
    {songId:'s1', title:'Defying Gravity', takes:[take('a', '2026-09-01', raw), take('b', '2026-10-01', v2({into:20}))]},
    {songId:'s2', title:'On My Own', takes:[take('c', '2026-09-01', raw), take('d', '2026-11-01', v2({into:20}))]},
    {songId:'s3', title:'Memory', takes:[take('e', '2026-09-01', raw), take('f', '2026-11-01', v2({into:20, mr:true}))]}]});
  assert.deepEqual(m.verdicts.map(x => [x.who, x.overall]), [['나', '2026년 11월 녹음이 2025년 8월 녹음보다 낫다고 들었어요']]);
  assert.deepEqual(m.songs.map(s => s.songId), ['s2', 's1']);
  assert.deepEqual(m.excluded.map(x => [x.kind, x.songId, x.reason]), [['song', 's3', 'method-mixed']]);
});
