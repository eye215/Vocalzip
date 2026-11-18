// 레슨 지적 체크 (app/score-points-model.js): points tied to printed measure numbers, runs of 지켰어요 / 놓쳤어요, the
// history over runs and the 그만 볼까요? suggestion, the windows along an MR matched to the score (a fake sync map built
// with app/score-sync-model.js), and how the rows behave next to strokes and through data-merge.js tombstones.
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../app/score-points-model.js');
const S = require('../app/score-sync-model.js');
const Ink = require('../app/score-ink-model.js');
const Merge = require('../data-merge.js');

const seqOf = n => Array.from({length:n}, (_, i) => ({ord:i, index:i, number:String(i + 1), beats:4, page:1, system:Math.floor(i / 4), first:i % 4 === 0}));
const A = list => list.map(([t, m]) => ({t, m}));
const mk = (over = {}) => P.point({songId:'s1', measures:{from:3, to:4}, text:' 여기서  숨 미리 ', ...over}, {now:1000, uid:'a'});
const runOf = (results, at, extra = {}) => P.run({songId:'s1', date:'2026-11-18', at, results, ...extra}, {uid:'r' + at});

test('a point is checked: measures, text, lesson, tag; an edit keeps fields it does not know', () => {
  const p = mk({lessonId:'l1', tag:'breath', scoreId:'score-1'});
  assert.deepEqual(p, {id:'point:a', kind:'score-point', songId:'s1', measures:{from:3, to:4}, text:'여기서 숨 미리', created:1000, updated:1000, scoreId:'score-1', lessonId:'l1', tag:'breath'});
  assert.deepEqual(P.measures({from:'7', to:''}), {from:7, to:7});
  assert.throws(() => P.measures({from:'', to:''}), /시작 마디/);
  assert.throws(() => P.measures({from:5, to:3}), /끝 마디는/);
  assert.throws(() => P.measures({from:2.5}), /시작 마디/);
  assert.throws(() => mk({text:'   '}), /지적 내용/);
  assert.throws(() => mk({text:'가'.repeat(P.TEXT_MAX + 1)}), /80자/);
  assert.throws(() => mk({tag:'volume'}), /분류/);
  const later = {...p, future:{x:1}};
  const e = P.edit(later, {text:'턱 내리기', tag:'', lessonId:null, measures:{from:5, to:6}}, {now:2000});
  assert.deepEqual(e, {id:'point:a', kind:'score-point', songId:'s1', measures:{from:5, to:6}, text:'턱 내리기', created:1000, updated:2000, scoreId:'score-1', future:{x:1}});
  // 이제 됐어요 and back.
  const retired = P.edit(e, {retired:3000}, {now:3000});
  assert.equal(retired.retired, 3000);
  assert.equal('retired' in P.edit(retired, {retired:null}, {now:4000}), false);
});

test('points read in measure order; retired ones are left out of a run; runs keep only real results', () => {
  const data = {scoreAnnotations:[
    {id:'stroke-1', version:1, ownerId:'u', songId:'s1', tool:'pen'},
    {id:'marker-preset:breath', kind:'marker-preset', ownerId:'u', preset:'breath', look:null},
    mk({measures:{from:9, to:9}, text:'c'}), {...mk({measures:{from:2, to:5}, text:'b'}), id:'point:b'}, {...mk({measures:{from:2, to:3}, text:'a'}), id:'point:c', retired:5},
    {...mk(), id:'point:other', songId:'s2'}, {kind:'score-point', id:'point:bad', songId:'s1', measures:{from:0, to:1}, text:'x'}
  ]};
  assert.deepEqual(P.points(data, 's1').map(p => p.text), ['a', 'b', 'c']);
  assert.deepEqual(P.active(P.points(data, 's1')).map(p => p.text), ['b', 'c']);
  const r = runOf({'point:a':'kept', 'point:b':'missed', 'point:c':'maybe', 'stroke-1':'kept'}, 10, {recordingId:'take-1', mode:'timed'});
  assert.deepEqual(r, {id:'point-run:r10', kind:'score-point-run', songId:'s1', date:'2026-11-18', at:10, results:{'point:a':'kept', 'point:b':'missed'}, mode:'timed', recordingId:'take-1'});
  assert.throws(() => P.run({songId:'s1', date:'11/18', results:{}}), /날짜/);
  const s = P.summary(P.active(P.points(data, 's1')), {'point:b':'kept'});
  assert.deepEqual(s, {kept:1, missed:0, skipped:1, total:2});
  assert.equal(P.summaryText(s), '지켰어요 1 · 놓쳤어요 0 · 안 고름 1');
  assert.equal(P.label({from:12, to:12}), '12마디'); assert.equal(P.label({from:12, to:14}), '12–14마디');
});

test('history: last five marked runs, 최근 5번 중 4번; five kept in a row suggest retiring, 계속 볼래요 starts over', () => {
  const p = mk();
  const seq = ['kept', 'missed', null, 'kept', 'kept', 'kept', 'kept'];
  const runs = seq.map((v, i) => runOf(v ? {[p.id]:v} : {}, 100 + i));
  assert.deepEqual(P.history(runs, p.id), ['missed', 'kept', 'kept', 'kept', 'kept']);
  const rec = P.record(runs, p.id);
  assert.equal(P.recordText(rec), '최근 5번 중 4번 지켰어요');
  assert.equal(P.recordText(P.record([], p.id)), '아직 체크한 적이 없어요');
  assert.equal(P.streak(runs, p), 4); assert.equal(P.suggestRetire(runs, p), false);
  const more = [...runs, runOf({}, 200), runOf({[p.id]:'kept'}, 201)];
  assert.equal(P.streak(more, p), 5); assert.equal(P.suggestRetire(more, p), true);
  assert.equal(P.suggestRetire(more, {...p, retired:1}), false);
  // 계속 볼래요 after run 201: the next five count again.
  const stayed = {...p, stay:201};
  assert.equal(P.streak(more, stayed), 0); assert.equal(P.suggestRetire(more, stayed), false);
});

test('measure ↔ time with a fake sync map: windows per sounding, a measure ahead, repeats, multi-rest numbers', () => {
  // 8 measures of 4/4, one a second from 1 s; measures 5–8 sound twice (back to 5 at 9 s), then 9.. not in the score.
  const seq = seqOf(8), built = S.build(seq, A([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7], [9, 4], [10, 5], [11, 6], [12, 7]]));
  const a = mk({measures:{from:2, to:3}}), b = {...mk({measures:{from:6, to:6}}), id:'point:b'}, gone = {...mk({measures:{from:30, to:31}}), id:'point:z'};
  const line = P.timeline([a, b, gone], seq, built);
  assert.deepEqual(line.map(e => [e.id, e.start, e.end, e.lead, e.occurrence]), [['point:a', 2, 4, 1, 0], ['point:b', 6, 7, 1, 0], ['point:b', 10, 11, 1, 1]]);
  // The first measure has no measure before it known: LEAD seconds of warning.
  assert.equal(P.timeline([mk({measures:{from:1, to:1}})], seq, built)[0].lead, P.LEAD);
  assert.deepEqual(P.timeline([a], seq, null), []);
  const at = t => { const c = P.cue(line, t); return {soon:c.soon.map(e => e.id), now:c.now.map(e => e.id), ask:c.ask.map(e => e.id), next:c.next?.start ?? null}; };
  assert.deepEqual(at(0.5), {soon:[], now:[], ask:[], next:2});
  assert.deepEqual(at(1.2), {soon:['point:a'], now:[], ask:[], next:2});
  assert.deepEqual(at(3.9), {soon:[], now:['point:a'], ask:[], next:6});
  assert.deepEqual(at(4.1), {soon:[], now:[], ask:['point:a'], next:6});
  assert.deepEqual(at(5.5), {soon:['point:b'], now:[], ask:['point:a'], next:6});
  assert.deepEqual(at(7.2), {soon:[], now:[], ask:['point:b', 'point:a'], next:10});
  // Answered points move behind those still waiting; while a point sounds again it is not asked about.
  assert.deepEqual(P.cue(line, 7.2, {'point:b':'kept'}).ask.map(e => e.id), ['point:a', 'point:b']);
  assert.deepEqual(at(10.5), {soon:[], now:['point:b'], ask:['point:a'], next:null});
  assert.deepEqual(at(4 + P.ASK + .1).ask, ['point:b']);
  // A multi-rest box (printed 3–6) answers for any number inside it.
  const rest = [{ord:0, number:'1'}, {ord:1, number:'2'}, {ord:2, number:'3', last:'6'}, {ord:3, number:'7'}];
  assert.equal(P.ordOf(rest, 5), 2); assert.equal(P.ordOf(rest, 7), 3); assert.equal(P.ordOf(rest, 8), -1); assert.equal(P.ordOf(rest, 2, 2), -1);
});

test('the latest lesson of the song that took place is offered first', () => {
  const lessons = [{id:'l1', date:'2026-11-01', songIds:['s1']}, {id:'l2', date:'2026-11-10', songId:'s1'}, {id:'l3', date:'2026-11-30', songIds:['s1']},
    {id:'l4', date:'2026-11-12', songIds:['s1'], status:'cancelled'}, {id:'l5', date:'2026-11-15', songIds:['s2']}];
  assert.equal(P.latestLesson(lessons, 's1', '2026-11-18').id, 'l2');
  assert.equal(P.latestLesson(lessons, 's1', '2026-10-01').id, 'l3');
  assert.equal(P.latestLesson(lessons, 's3', '2026-11-18'), null);
});

test('rows are not strokes, and a deleted point stays deleted when another device merges', () => {
  const p = {...mk(), updatedAt:1000}, r = {...runOf({[p.id]:'kept'}, 50), updatedAt:1000};
  assert.equal(Ink.valid(p), false); assert.equal(Ink.valid(r), false);
  // Device A deleted the point (core.js leaves the id in deleted + deletedAt); device B still has it and edited it before.
  const a = {songs:[], lessons:[], practices:[], assignments:[], categories:[], scoreAnnotations:[r], deleted:{scoreAnnotations:[p.id]}, deletedAt:{scoreAnnotations:{[p.id]:{at:2000, seen:1000}}}};
  const b = {songs:[], lessons:[], practices:[], assignments:[], categories:[], scoreAnnotations:[{...p, text:'고쳐 씀', updatedAt:1500}, r, {...mk({text:'새 지적'}), id:'point:new', updatedAt:1600}]};
  for (const [x, y] of [[a, b], [b, a]]) {
    const out = Merge.merge(x, y).data;
    assert.deepEqual(out.scoreAnnotations.map(row => row.id).sort(), ['point-run:r50', 'point:new']);
    assert.ok(out.deleted.scoreAnnotations.includes(p.id));
  }
  // Both sides changed the same point: the newer one wins.
  const c = Merge.merge({scoreAnnotations:[{...p, text:'A', updatedAt:3000}]}, {scoreAnnotations:[{...p, text:'B', updatedAt:4000}]}).data;
  assert.equal(c.scoreAnnotations[0].text, 'B');
});
