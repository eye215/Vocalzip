// 표기의 기능 (app/score-mark-model.js): what a placed mark does, which measures it stands on, how cut marks become
// stretches of MR time to jump over, and what plays when cuts meet loops and 여기서 재생.
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../app/score-mark-model.js');
const M = require('../app/score-measure-model.js');
const S = require('../app/score-sync-model.js');
const Ink = require('../app/score-ink-model.js');
const Settings = require('../app/score-ink-settings.js');

/** A page of two lines of four measures: 0–3 at y .2–.25, 4–7 at y .5–.55, each a quarter of x .1–.9. */
const line = (si, top) => ({top, bottom:top + .05, left:.1, right:.9, staves:[[top, top + .05]],
  measures:[0, 1, 2, 3].map(i => ({index:si * 4 + i, number:String(si * 4 + i + 1), x0:.1 + i * .2, x1:.3 + i * .2}))});
const PAGE = {page:1, systems:[line(0, .2), line(1, .5)], staff:.0125, approximate:false, snapped:true};
const P = (x, y) => [x, y, .5];
const stroke = (points, extra = {}) => ({page:1, tool:'pen', width:.006, color:'#7a32f5', points, ...extra});
const bracket = (ax, ay, ex, ey) => Ink.markStroke({form:'bracket', color:'#7a32f5', width:.006, type:'pen'}, P(ax, ay), P(ex, ey), 1.4);
const idx = hits => hits.map(h => h.index);
const seqOf = n => Array.from({length:n}, (_, i) => ({ord:i, index:i, number:String(i + 1), beats:4, page:1, system:0, first:i === 0}));
/** One measure a second from 10 s: measure m sounds at 10 + m. */
const even = n => S.build(seqOf(n), [{t:10, m:0}, {t:10 + n - 1, m:n - 1}]);

test('what a mark does: built-in marks by what they are, user marks by their role, everything else nothing', () => {
  assert.equal(K.roleOf({mark:'start'}), 'start'); assert.equal(K.roleOf({mark:'repeat'}), 'repeat'); assert.equal(K.roleOf({mark:'cut'}), 'cut');
  assert.equal(K.roleOf({mark:'breath'}), '');
  assert.equal(K.roleOf({mark:'breath', role:'cut'}), ''); assert.equal(K.roleOf({mark:'start', role:'cut'}), 'start'); // fixed
  assert.equal(K.roleOf({mark:'m-1', role:'repeat'}), 'repeat'); assert.equal(K.roleOf({mark:'m-1'}), '');
  assert.equal(K.roleOf({mark:'m-1', role:'tempo'}), ''); // a role from a newer version
  assert.equal(K.roleOf({tool:'pen'}), ''); assert.equal(K.roleOf({role:'cut'}), ''); // a mark from before 2026-11-14, a stray role
  assert.equal(K.roleOf(null), '');
  // The names the editor offers are the roles the model knows, and the built-in presets agree with the marks.
  assert.deepEqual(Settings.MARK_ROLES.map(r => r[0]).filter(Boolean), K.ROLES); assert.deepEqual(Ink.MARK_ROLES, K.ROLES);
  for (const m of Settings.MARKERS) assert.equal(Settings.markerRole({...m, builtin:true}), K.roleOf({mark:m.id}));
  assert.equal(Settings.markerRole({id:'m-1', role:'cut'}), 'cut'); assert.equal(Settings.markerRole({id:'m-1'}), '');
});

test('a stored mark may carry a role; old clients see an ordinary stroke', () => {
  const base = {version:1, id:'a', ownerId:'u1', songId:'s', scoreId:'sc', r2Key:'u/u1/sc/original.pdf', pdfHash:'a'.repeat(64), page:1, tool:'pen', color:'#7a32f5', width:.006, points:[P(.2, .2), P(.4, .2)], createdAt:1, mark:'m-1'};
  assert.equal(Ink.valid(base), true);
  for (const role of ['start', 'repeat', 'cut', 'later-role']) assert.equal(Ink.valid({...base, role}), true, role);
  for (const role of ['', 'Cut', 'a b', 5, null, 'x'.repeat(25)]) assert.equal(Ink.valid({...base, role}), false, String(role));
  assert.equal(Ink.same({...base, role:'cut'}, {...base, role:'cut'}), true);
  assert.equal(Ink.same({...base, role:'cut'}, base), false); assert.equal(Ink.same({...base, role:'cut'}, {...base, role:'start'}), false);
});

test('a preset keeps its 기능; a built-in one cannot be given another', () => {
  const store = new Map(), storage = {getItem:k => store.has(k) ? store.get(k) : null, setItem:(k, v) => store.set(k, v)};
  const prefs = Settings.create({storage, identity:() => ({owner:'u1', session:'s1'})});
  const look = {name:'건너뛸 곳', color:'#b42318', width:.04, type:'highlighter', form:'cover'};
  let data = prefs.write('marker', {id:'m-1', ...look, role:'cut'});
  assert.equal(data.markers.find(m => m.id === 'm-1').role, 'cut');
  assert.equal(JSON.parse(store.get(prefs.key)).markers.user[0].role, 'cut');
  assert.equal(prefs.read().markers.find(m => m.id === 'm-1').role, 'cut');
  data = prefs.write('marker', {id:'m-1', name:'건너뛸 곳 2'});                      // another field: the role stays
  assert.equal(data.markers.find(m => m.id === 'm-1').role, 'cut');
  data = prefs.write('marker', {id:'m-1', role:'start'}); assert.equal(data.markers.find(m => m.id === 'm-1').role, 'start');
  data = prefs.write('marker', {id:'m-1', role:''}); assert.equal('role' in data.markers.find(m => m.id === 'm-1'), false); // 없음
  assert.equal('role' in JSON.parse(store.get(prefs.key)).markers.user[0], false);
  data = prefs.write('marker', {id:'breath', role:'cut', width:.01});
  assert.equal('role' in data.markers.find(m => m.id === 'breath'), false); assert.equal(data.markers.find(m => m.id === 'breath').width, .01);
  assert.equal('role' in prefs.read().markers.find(m => m.id === 'breath'), false);
  // A role this version does not know: the preset is kept and only draws.
  store.set(prefs.key, JSON.stringify({version:1, owner:'u1', markers:{user:[{id:'m-9', ...look, role:'tempo'}]}}));
  const kept = prefs.read().markers.find(m => m.id === 'm-9'); assert.equal(kept.name, '건너뛸 곳'); assert.equal('role' in kept, false);
  assert.throws(() => Settings.marker({...look, name:''}));
});

test('the measures a mark stands on: one for a 기호, every one a long mark overlaps, whole measures only', () => {
  const dot = stroke([P(.35, .22)]);
  assert.deepEqual(idx(K.span(PAGE, dot, 'start')), [1]); assert.deepEqual(idx(K.span(PAGE, dot, 'cut')), [1]);
  // A cut drawn inside measure 2 (index 1): that whole measure.
  assert.deepEqual(idx(K.span(PAGE, stroke([P(.36, .225), P(.46, .225)]), 'cut')), [1]);
  // A bracket from measure 2 to measure 3: both taps' measures.
  assert.deepEqual(idx(K.span(PAGE, bracket(.32, .225, .68, .225), 'repeat')), [1, 2]);
  // Drawn from barline to barline with the taps a little over them: the slivers do not count.
  assert.deepEqual(idx(K.span(PAGE, bracket(.29, .225, .71, .225), 'repeat')), [1, 2]);
  // 시작점 is one place: of a long mark the first measure.
  assert.deepEqual(idx(K.span(PAGE, stroke([P(.32, .225), P(.68, .225)]), 'start')), [1]);
  assert.deepEqual(K.span(PAGE, stroke([]), 'cut'), []); assert.deepEqual(K.span(null, dot, 'cut'), []);
});

test('a mark that reaches into the next line runs from the measure at one end to the measure at the other', () => {
  // First tap in measure 3 (line 1), second in measure 6 (line 2): 3, 4, 5, 6 — not the measures above and below.
  assert.deepEqual(idx(K.span(PAGE, bracket(.55, .225, .45, .525), 'repeat')), [2, 3, 4, 5]);
  assert.deepEqual(idx(K.span(PAGE, bracket(.45, .525, .55, .225), 'repeat')), [2, 3, 4, 5]); // tapped end first
  // Ends just over a barline: the measure before the first tap's barline and after the last tap's are left out.
  assert.deepEqual(idx(K.span(PAGE, bracket(.49, .225, .51, .525), 'repeat')), [2, 3, 4, 5]);
  assert.deepEqual(idx(K.span(PAGE, bracket(.485, .225, .515, .525), 'repeat')), [2, 3, 4, 5]);
  assert.deepEqual(idx(K.span(PAGE, stroke([P(.75, .225), P(.2, .525)], {tool:'highlighter', width:.04}), 'cut')), [3, 4]);
  // A box has no ends: over both lines it keeps the measures it lies over.
  const box = Ink.markStroke({form:'box', color:'#7a32f5', width:.006, type:'pen'}, P(.55, .19), P(.45, .56), 1.4);
  assert.deepEqual(idx(K.span(PAGE, box, 'cut')), [1, 2, 5, 6]);
});

test('the 표시한 마디 rows carry the function and its measures; other marks are listed as before', () => {
  const rows = [
    {...stroke([P(.35, .22)]), mark:'start'},
    {...bracket(.55, .225, .45, .525), page:1, mark:'repeat'},
    {...stroke([P(.36, .525), P(.46, .525)], {tool:'highlighter', width:.04}), mark:'cut'},
    {...stroke([P(.75, .22)]), mark:'breath'},
    {...stroke([P(.72, .525), P(.88, .525)]), mark:'m-1', role:'cut'},
    {...stroke([P(.72, .225), P(.88, .225)]), mark:'m-2'},
    stroke([P(.12, .525), P(.28, .525)])]; // a mark from before 2026-11-14: a pen line
  const name = (id, s) => ({start:'시작점', repeat:'반복', cut:'컷', breath:'숨표', 'm-2':'강세'}[id] || K.ROLE_NAMES[K.roleOf(s)] || '');
  const withRoles = M.summary(() => PAGE, rows, {markName:name, roleOf:K.roleOf, spanOf:K.span}).items;
  assert.deepEqual(withRoles.map(i => [i.label, i.where, i.role || '', i.kind]), [
    ['시작점', '2마디', 'start', 'mark'], ['반복', '3–6마디', 'repeat', 'mark'], ['강세', '4마디', '', 'mark'], ['숨표', '4마디', '', 'mark'],
    ['펜 필기', '5마디', '', 'pen'], ['컷', '6마디', 'cut', 'mark'], ['건너뛰기', '8마디', 'cut', 'mark']]);
  // Without the hooks nothing changes: the same rows as before this feature (the bracket by its box).
  const plain = M.summary(() => PAGE, rows, {markName:name}).items;
  assert.equal(plain.some(i => 'role' in i), false);
  assert.deepEqual(plain.find(i => i.label === '시작점').measures, [1]);
  // Two cut marks over the same measure are one row, but a cut and a plain mark of the same name are not.
  const twice = M.summary(() => PAGE, [rows[2], {...rows[2]}], {markName:name, roleOf:K.roleOf, spanOf:K.span}).items;
  assert.deepEqual(twice.map(i => [i.where, i.count, i.role]), [['6마디', 2, 'cut']]);

  const ordOf = new Map([0, 1, 2, 3, 4, 5, 6, 7].map(i => [i, i + 10])); // this page starts at measure 10 of the score
  assert.deepEqual(K.collect(withRoles, ordOf), {starts:[{ord:11, page:1}], repeats:[{from:12, to:15, page:1}], cuts:[15, 17]});
  assert.deepEqual(K.collect(plain, ordOf), {starts:[], repeats:[], cuts:[]});
  assert.deepEqual(K.collect(null, ordOf), {starts:[], repeats:[], cuts:[]});
});

test('cut marks that touch or overlap are one stretch; each stretch is jumped from its first barline to its last', () => {
  const m = even(12);
  assert.deepEqual(K.runs([5, 3, 4, 9, 4]), [{from:3, to:5}, {from:9, to:9}]); assert.deepEqual(K.runs([]), []);
  // Marks over 3–4 and 4–5 and one on 9.
  const cuts = K.collect([{role:'cut', page:1, measures:[3, 4]}, {role:'cut', page:1, measures:[4, 5]}, {role:'cut', page:2, measures:[9]}], new Map(seqOf(12).map(x => [x.index, x.ord]))).cuts;
  assert.deepEqual(cuts, [3, 4, 5, 9]);
  assert.deepEqual(K.skips(m.spans, cuts), [{start:13, end:16, from:3, to:5}, {start:19, end:20, from:9, to:9}]);
  assert.deepEqual(K.skips(m.spans, new Set([3])), [{start:13, end:14, from:3, to:3}]);
  assert.deepEqual(K.skips(m.spans, []), []); assert.deepEqual(K.skips(null, [1]), []);
  assert.equal(K.text(['4–6마디', '10마디']), '4–6마디, 10마디'); assert.equal(K.text(['1마디', '3마디', '5마디', '7마디']), '1마디, 3마디 외 2곳');
});

test('a cut measure is skipped every time it sounds, and not where the sync has no time for it', () => {
  // 0–3, back to 2 (a repeat), on to 5; measure 6 was never tapped.
  const m = S.build(seqOf(8), [{t:0, m:0}, {t:1, m:1}, {t:2, m:2}, {t:3, m:3}, {t:4, m:2}, {t:5, m:3}, {t:6, m:4}, {t:7, m:5}]);
  assert.deepEqual(K.skips(m.spans, [2, 6]).map(k => [k.start, k.end]), [[2, 3], [4, 5]]);
  // Measures 3 then 2 again are next to each other in time: one stretch across the repeat.
  assert.deepEqual(K.skips(m.spans, [2, 3]).map(k => [k.start, k.end, k.from, k.to]), [[2, 6, 2, 3]]);
});

/** Plays from `from` in 40 ms steps as the bar does and returns the measures heard, in order. */
function play(model, list, {from = 0, until = 40, loop = null, rounds = 2} = {}) {
  const heard = [];
  let t = from, wraps = 0;
  for (let i = 0; i < 5000 && t < until; i++) {
    if (loop && t >= loop.end - .01) { if (++wraps >= rounds) break; t = loop.from; heard.push('|'); }
    const to = K.jump(list, t, loop); if (to != null) { t = to; if (loop && Math.abs(t - loop.from) < 1e-9) { if (++wraps >= rounds) break; heard.push('|'); } }
    const s = model.measureAt(t + .001); if (s && heard.at(-1) !== s.m) heard.push(s.m);
    t += .04;
  }
  return heard;
}

test('재생 jumps over the cut stretches and plays everything else', () => {
  const m = even(8), all = K.skips(m.spans, [2, 3, 6]);
  assert.deepEqual(play(m, K.skipsFor(all, {}), {from:9}), [0, 1, 4, 5, 7]);
  assert.deepEqual(play(m, [], {from:9}), [0, 1, 2, 3, 4, 5, 6, 7]); // 컷 건너뛰기 off
  // The jump is made at the barline: at most 20 ms before it, never after the cut has ended.
  assert.equal(K.jump(all, 11.97), null); assert.equal(K.jump(all, 11.985), 14); assert.equal(K.jump(all, 13.5), 14);
  assert.equal(K.jump(all, 13.995), null); assert.equal(K.jump(all, 14), null); assert.equal(K.jump([], 12.5), null); assert.equal(K.jump(null, 12.5), null);
});

test('여기서 재생 and a 시작점 on a cut measure play the rest of that cut; later cuts are skipped', () => {
  const m = even(8), all = K.skips(m.spans, [2, 3, 6]);
  const from = m.timeOf(3);
  assert.deepEqual(K.skipsFor(all, {from}).map(k => k.start), [16]);
  assert.deepEqual(play(m, K.skipsFor(all, {from}), {from}), [3, 4, 5, 7]);
  // Started just after a cut, or before one: nothing is exempt.
  assert.deepEqual(play(m, K.skipsFor(all, {from:m.timeOf(4)}), {from:m.timeOf(4)}), [4, 5, 7]);
  assert.deepEqual(play(m, K.skipsFor(all, {from:m.timeOf(1)}), {from:m.timeOf(1)}), [1, 4, 5, 7]);
});

test('loops and cuts: a loop inside a cut plays it anyway, a cut inside a loop is jumped over on every round', () => {
  const m = even(10), all = K.skips(m.spans, [3, 4, 5]);
  const loopOf = (a, z, lead = true) => { const r = m.rangeOf(a, z); return {range:{start:r.start, end:r.end}, round:{from:S.loopStart(r, lead), end:r.end}}; };
  // Inside the cut (measure 4 alone, measures 3–5): played, lead-in included.
  let L = loopOf(4, 4);
  assert.deepEqual(K.skipsFor(all, {loop:L.range}), []);
  assert.deepEqual(play(m, K.skipsFor(all, {loop:L.range}), {from:L.round.from, loop:L.round}), [3, 4, '|', 3, 4]);
  L = loopOf(3, 5); assert.deepEqual(play(m, K.skipsFor(all, {loop:L.range}), {from:L.round.from, loop:L.round}), [2, 3, 4, 5, '|', 2, 3, 4, 5]);
  // The cut inside the loop 1–7: jumped over on every round.
  L = loopOf(1, 7); assert.equal(K.skipsFor(all, {loop:L.range}).length, 1);
  assert.deepEqual(play(m, K.skipsFor(all, {loop:L.range}), {from:L.round.from, loop:L.round}), [0, 1, 2, 6, 7, '|', 0, 1, 2, 6, 7]);
  // The cut runs past the loop's end (loop 1–4): the round ends at the cut.
  L = loopOf(1, 4); assert.deepEqual(play(m, K.skipsFor(all, {loop:L.range}), {from:L.round.from, loop:L.round}), [0, 1, 2, '|', 0, 1, 2]);
  // The loop starts in the cut (loop 5–7): it starts after it; without the lead-in the same.
  L = loopOf(5, 7); assert.deepEqual(play(m, K.skipsFor(all, {loop:L.range}), {from:L.round.from, loop:L.round}), [6, 7, '|', 6, 7]);
  // Only the lead-in is cut (loop 6–7, measure 5 before it): the lead-in is left out.
  L = loopOf(6, 7); assert.deepEqual(play(m, K.skipsFor(all, {loop:L.range}), {from:L.round.from, loop:L.round}), [6, 7, '|', 6, 7]);
  // 컷 건너뛰기 off: the loop plays everything.
  L = loopOf(1, 7); assert.deepEqual(play(m, [], {from:L.round.from, loop:L.round, rounds:1}), [0, 1, 2, 3, 4, 5, 6, 7]);
  // A skip can never trap the loop: it always comes out below the round's end or at its start.
  for (let t = L.round.from; t < L.round.end; t += .013) { const to = K.jump(all, t, L.round); assert.ok(to == null || to >= L.round.from - 1e-9 && to < L.round.end, String(t)); }
});

test('시작점 for the chooser: the page in view first, then by page and measure', () => {
  const starts = [{ord:2, page:1}, {ord:9, page:2}, {ord:14, page:2}, {ord:30, page:4}];
  assert.deepEqual(K.orderStarts(starts, 2).map(s => s.ord), [9, 14, 2, 30]);
  assert.deepEqual(K.orderStarts(starts, 3).map(s => s.ord), [2, 9, 14, 30]);
  assert.deepEqual(K.orderStarts(null, 1), []); assert.deepEqual(starts.map(s => s.ord), [2, 9, 14, 30]);
});

test('per score on this device: the start last chosen and 컷 건너뛰기, on until turned off', () => {
  assert.deepEqual(K.prefs(null, 'a'), {start:null, cut:true}); assert.deepEqual(K.prefs('not json', 'a'), {start:null, cut:true}); assert.deepEqual(K.prefs('[1]', 'a'), {start:null, cut:true});
  let text = K.withPrefs(null, 'a', {start:12}, 100);
  assert.deepEqual(K.prefs(text, 'a'), {start:12, cut:true}); assert.deepEqual(K.prefs(text, 'b'), {start:null, cut:true});
  text = K.withPrefs(text, 'a', {cut:false}, 200); assert.deepEqual(K.prefs(text, 'a'), {start:12, cut:false}); // the start is kept
  text = K.withPrefs(text, 'b', {cut:false}, 300);
  text = K.withPrefs(text, 'a', {start:null}, 400); assert.deepEqual(K.prefs(text, 'a'), {start:null, cut:false}); // 처음부터
  text = K.withPrefs(text, 'a', {cut:true}, 500); assert.deepEqual(JSON.parse(text).a, {at:500});
  assert.deepEqual(K.prefs(text, 'b'), {start:null, cut:false});
  // Only the scores used most recently are kept.
  for (let i = 0; i < K.MAX_SCORES + 5; i++) text = K.withPrefs(text, 'n' + i, {start:i}, 1000 + i);
  const all = JSON.parse(text);
  assert.equal(Object.keys(all).length, K.MAX_SCORES); assert.equal('a' in all, false); assert.equal('n0' in all, false); assert.deepEqual(K.prefs(text, 'n' + (K.MAX_SCORES + 4)).start, K.MAX_SCORES + 4);
});
