// 귀와 숫자 (app/ear-agreement-model.js): do the measured numbers move the way the listening verdicts heard?
// agree / disagree / no signal, method and version mismatches left out, the tag mapping, fewer than 3, ties.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../app/ear-agreement-model.js');
const {v2} = require('./growth-characterization.fixture.cjs');

const take = (id, date, a, ok = true) => ({id, songId:'s1', a, date, created:Date.parse(date + 'T20:00:00+09:00'), ok});
const verdict = (id, first, second, overall, tags = {}, extra = {}) => ({id, kind:'listen-verdict', v:1, songId:'s1', firstId:first.id, secondId:second.id,
  firstDate:first.date, secondDate:second.date, firstRange:null, secondRange:null, overall, tags, memo:'', judge:'me', teacher:'', lessonId:'', blind:true, judgedDate:'2026-11-18', created:1, ...extra});
const lookup = takes => id => takes.find(t => t.id === id) || null;
const row = (p, id) => p.rows.find(r => r.id === id);

// Earlier take: more wobble, less in tune, shorter phrases. Later take: steadier, more in tune, longer.
const OLD = take('old', '2025-08-14', v2({into:30, wob:20}));
const NEW = take('new', '2026-11-10', v2({into:12, wob:8, longer:1}));

test('agree, disagree and no signal against the overall choice', () => {
  const takes = [OLD, NEW];
  const later = E.pair(verdict('v1', OLD, NEW, 'second'), {takeOf:lookup(takes)});
  assert.equal(later.usable, true);
  assert.equal(later.method, 'asRecorded');
  assert.equal(later.version, 2);
  assert.deepEqual(['intonation', 'stability', 'phrase'].map(id => [row(later, id).move, row(later, id).overall]), [['second', 'agree'], ['second', 'agree'], ['second', 'agree']]);
  // The same high zone, the same stable highest note: no signal, not a disagreement.
  assert.deepEqual([row(later, 'high').overall, row(later, 'high').why, row(later, 'range').overall, row(later, 'mainHigh').overall], ['none', 'similar', 'none', 'none']);
  const earlier = E.pair(verdict('v2', OLD, NEW, 'first'), {takeOf:lookup(takes)});
  assert.deepEqual(['intonation', 'stability', 'phrase'].map(id => row(earlier, id).overall), ['disagree', 'disagree', 'disagree']);
  const same = E.pair(verdict('v3', OLD, NEW, 'same'), {takeOf:lookup(takes)});
  assert.deepEqual(same.rows.map(r => [r.overall, r.why]), same.rows.map(() => ['none', 'heard-same']));
  assert.equal(E.pairLine(later), '같은 쪽 3 · 반대 0 · 차이 없음 3');
  assert.equal(E.moveText(row(later, 'stability'), later.verdict), '2026년 11월 녹음에서 지속음 흔들림이 더 작아요');
  assert.equal(E.moveText(row(later, 'high'), later.verdict), '고음 구간 흔들림은 비슷해요');
  assert.equal(E.pairBasis(later), '녹음 그대로 잰 두 녹음 · 분석 v2');
});

test('a change inside the "similar" tolerance is no signal', () => {
  const a = take('a', '2026-09-01', v2({into:20, wob:10})), b = take('b', '2026-11-01', v2({into:19, wob:9}));
  const p = E.pair(verdict('v', a, b, 'second'), {takeOf:lookup([a, b])});
  assert.deepEqual([row(p, 'intonation').move, row(p, 'intonation').overall, row(p, 'stability').overall], ['similar', 'none', 'none']);
});

test('the stable highest note and the top of the main range: the higher note is the side (a first guess)', () => {
  const a = take('a', '2026-09-01', v2({into:20})), hi = v2({into:20});
  hi.metrics.range = {...hi.metrics.range, stableHigh:{note:'G5', cents:7900}};
  const b = take('b', '2026-11-01', hi);
  const p = E.pair(verdict('v', a, b, 'first', {path:'second'}), {takeOf:lookup([a, b])});
  assert.deepEqual([row(p, 'range').move, row(p, 'range').overall, row(p, 'range').tag], ['second', 'disagree', {key:'path', name:'소리 길', choice:'second', result:'agree', why:''}]);
  assert.equal(row(p, 'range').numbers, 'F5 → G5');
  assert.equal(row(p, 'mainHigh').move, 'similar');
});

test('different methods, different analysis versions, unreliable, missing or unanalysed takes are left out with why', () => {
  const mr = take('mr', '2026-11-10', v2({into:12, mr:true})), ai = take('ai', '2026-11-11', v2({into:12, ai:true}));
  const v3 = take('v3', '2026-11-12', {...v2({into:12}), v:1}), low = take('low', '2026-11-13', v2({into:12}), false), bare = take('bare', '2026-11-14', null);
  const takes = [OLD, mr, ai, v3, low, bare];
  const of = (second, id = 'v') => E.pair(verdict(id, OLD, second, 'second'), {takeOf:lookup(takes)});
  const mixed = of(mr);
  assert.deepEqual([mixed.usable, mixed.reason, mixed.methods], [false, 'method-mixed', ['asRecorded', 'mrRemoved']]);
  assert.equal(mixed.text, '2025년 8월 녹음은 녹음 그대로, 2026년 11월 녹음은 MR 빼고 잰 것이라 견주지 않아요 · 같은 방법으로 잰 녹음끼리만 견줘요');
  assert.equal(of(ai).reason, 'method-mixed');
  assert.equal(of(v3).reason, 'version-mixed');
  assert.deepEqual([of(low).reason, of(low).sides, of(low).text], ['unreliable', ['second'], '2026년 11월 녹음은 측정 신뢰도가 낮아요 (목소리가 짧거나 반주가 커요)']);
  assert.deepEqual([of(bare).reason, of(bare).text], ['no-analysis', '2026년 11월 녹음은 아직 분석하지 않았어요']);
  const gone = E.pair({...verdict('g', OLD, mr, 'second'), firstId:'', secondId:'nowhere'}, {takeOf:lookup(takes)});
  assert.deepEqual([gone.reason, gone.sides, gone.text], ['missing', ['first', 'second'], '2025년 8월·2026년 11월 녹음이 지워졌거나 이 기기에 없어요']);
  // Both MR 빼고: compared, the wobble-type measures by their observed direction (the report's 'changed').
  const mr2 = take('mr2', '2026-09-01', v2({into:20, wob:20, mr:true})), mr3 = take('mr3', '2026-11-01', v2({into:20, wob:8, mr:true}));
  const both = E.pair(verdict('m', mr2, mr3, 'second'), {takeOf:lookup([mr2, mr3])});
  assert.deepEqual([both.usable, both.method, row(both, 'stability').overall], [true, 'mrRemoved', 'agree']);
});

test('the tag mapping is a documented constant: 음정 ↔ intonation measures, 호흡 ↔ phrase length, 소리 길 ↔ high zone and stable high', () => {
  assert.deepEqual(E.TAG_OF, {intonation:'pitch', stability:'pitch', phrase:'breath', high:'path', range:'path', mainHigh:'path'});
  const p = E.pair(verdict('v', OLD, NEW, 'second', {pitch:'first', breath:'same', power:'second'}), {takeOf:lookup([OLD, NEW])});
  assert.deepEqual(row(p, 'intonation').tag, {key:'pitch', name:'음정', choice:'first', result:'disagree', why:''});
  assert.equal(row(p, 'stability').tag.result, 'disagree');
  assert.deepEqual([row(p, 'phrase').tag.result, row(p, 'phrase').tag.why], ['none', 'heard-same']);
  // 소리 크기·힘 has no measure; 소리 길 was not given: no tag on the high zone.
  assert.equal(row(p, 'high').tag, undefined);
});

test('fewer than 3 usable verdicts: nothing summed up, the count said; method mismatches do not count', () => {
  const mr = take('mr', '2026-11-10', v2({into:12, mr:true}));
  const takes = [OLD, NEW, mr];
  const vs = [verdict('a', OLD, NEW, 'second'), verdict('b', OLD, NEW, 'second'), verdict('c', OLD, mr, 'second')];
  const m = E.build({verdicts:vs, takeOf:lookup(takes)});
  assert.deepEqual([m.ready, m.usable, m.total, m.need], [false, 2, 3, 1]);
  assert.equal(m.summary, '평가가 3개 이상 모이면 보여 드려요 (지금 2개)');
  assert.equal(m.measures.some(x => x.often), false);
  assert.equal(m.excluded.length, 1);
  assert.equal(m.byVerdict.get('c').reason, 'method-mixed');
});

test('counts per measure, the plain status, the "귀와 자주 같아요" rule (≥ 3 agreements, none against) and ties', () => {
  const t = (i, date, a) => take('t' + i, date, a);
  // Four pairs where the later take is steadier (stability moves to "second"); intonation moves to "second" in two
  // and to "first" in two.
  const pairs = [
    [t(1, '2026-01-01', v2({into:30, wob:20})), t(2, '2026-02-01', v2({into:10, wob:8}))],
    [t(3, '2026-03-01', v2({into:30, wob:20})), t(4, '2026-04-01', v2({into:10, wob:8}))],
    [t(5, '2026-05-01', v2({into:10, wob:20})), t(6, '2026-06-01', v2({into:30, wob:8}))],
    [t(7, '2026-07-01', v2({into:10, wob:20})), t(8, '2026-08-01', v2({into:30, wob:8}))]
  ];
  const takes = pairs.flat();
  const vs = pairs.map(([a, b], i) => verdict('v' + i, a, b, 'second'));
  const m = E.build({verdicts:vs, takeOf:lookup(takes)});
  const get = id => m.measures.find(x => x.id === id);
  assert.equal(m.ready, true);
  assert.deepEqual(['agree', 'disagree', 'none', 'often'].map(k => get('stability')[k]), [4, 0, 0, true]);
  assert.equal(get('stability').text, '귀와 같은 쪽으로 움직였어요 4번 중 4번');
  // A tie (2 with, 2 against): counted as it is, never marked.
  assert.deepEqual(['agree', 'disagree', 'often'].map(k => get('intonation')[k]), [2, 2, false]);
  assert.equal(get('intonation').text, '귀와 같은 쪽으로 움직였어요 4번 중 2번');
  assert.equal(get('high').text, '귀와 견줄 만큼 움직인 적이 아직 없어요 · 차이 없음 4번');
  assert.equal(m.top.id, 'stability');
  assert.equal(m.summary, '평가 4개와 견줘 봤어요 · 이 곡들에서는 지속음 흔들림 숫자가 귀와 가장 자주 같은 쪽으로 움직였어요 (4번 중 4번)');
  // One disagreement takes the mark away; nothing is hidden.
  const against = E.build({verdicts:[...vs, verdict('x', pairs[0][0], pairs[0][1], 'first')], takeOf:lookup(takes)});
  assert.deepEqual(['agree', 'disagree', 'often'].map(k => against.measures.find(x => x.id === 'stability')[k]), [4, 1, false]);
  // Exactly 3 agreements are enough; 2 are not.
  assert.equal(E.build({verdicts:vs.slice(0, 3), takeOf:lookup(takes)}).measures.find(x => x.id === 'stability').often, true);
  const two = E.build({verdicts:[...vs.slice(0, 2), verdict('s', pairs[2][0], pairs[2][1], 'same')], takeOf:lookup(takes)});
  assert.deepEqual(['agree', 'none', 'often'].map(k => two.measures.find(x => x.id === 'stability')[k]), [2, 1, false]);
  // A tie between measures for the headline: fewer disagreements first, then the fixed order.
  const flat = E.build({verdicts:vs.slice(0, 2).concat(verdict('s2', pairs[1][0], pairs[1][1], 'same')), takeOf:lookup(takes)});
  assert.equal(flat.top.id, 'intonation');
  // Nothing moved with the ear more than against it: said plainly, no headline measure.
  const none = E.build({verdicts:vs.map(v => ({...v, overall:'same'})), takeOf:lookup(takes)});
  assert.equal(none.top, null);
  assert.equal(none.summary, '평가 4개와 견줘 봤어요 · 아직 귀와 꾸준히 같은 쪽으로 움직인 숫자는 없어요');
});

test('nothing is changed: verdicts and takes are read only', () => {
  const vs = [verdict('a', OLD, NEW, 'second', {pitch:'second'})];
  const before = JSON.stringify([vs, OLD, NEW]);
  E.build({verdicts:vs, takeOf:lookup([OLD, NEW])});
  assert.equal(JSON.stringify([vs, OLD, NEW]), before);
});
