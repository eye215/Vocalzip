// 필기를 지적으로 가져오기 (app/score-ink-points-bulk-model.js): handwriting grouped into notes by place and time,
// tiny marks / highlighter / 악보 표기 / memos left out, the order fixed; the review helpers (words or not, checked by
// default, duplicates of points already there), marks gathered into candidates, and the two-at-a-time pool.
const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../app/score-ink-points-bulk-model.js');
const P = require('../app/score-points-model.js');

const A = 1.4; // page height / width
let n = 0;
/** A pen stroke from (x, y) to (x + w, y + h) in page fractions, drawn at `at` ms. */
const line = (x, y, w, h, at, extra = {}) => ({id:'s' + String(++n).padStart(3, '0'), page:1, tool:'pen', color:'#d92d20', width:.003, createdAt:at,
  points:[[x, y, .5], [x + w / 2, y + h / 2, .5], [x + w, y + h, .5]], ...extra});
/** A short word: three letter strokes side by side, 2 s apart. */
const word = (x, y, at, extra = {}) => [0, 1, 2].map(i => line(x + i * .012, y, .01, .012, at + i * 2000, extra));

test('strokes close in place and time are one note; far apart or drawn much later are separate', () => {
  const a = word(.1, .2, 1000), b = word(.15, .2, 9000); // b starts .014 to the right of a: one phrase
  const far = word(.6, .2, 12000); // same line, far to the right
  const lower = word(.1, .5, 15000); // another staff
  const later = word(.19, .2, 10 * 60000); // next to b but written ten minutes later (the next lesson)
  const out = B.clusters([...later, ...lower, ...far, ...b, ...a], A);
  assert.deepEqual(out.map(c => c.ids.length), [6, 3, 3, 3]);
  assert.deepEqual(out[0].ids, [...a, ...b].map(s => s.id));
  assert.deepEqual(out[1].ids, later.map(s => s.id));
  assert.deepEqual(out[2].ids, far.map(s => s.id));
  assert.deepEqual(out[3].ids, lower.map(s => s.id));
  // Box in page fractions, y back from width units.
  assert.ok(Math.abs(out[0].box.x - .1) < 1e-9 && Math.abs(out[0].box.y - .2) < 1e-9);
  assert.ok(Math.abs(out[0].box.h - .012) < 1e-9);
});

test('imported handwriting (createdAt ms apart) is grouped by place alone', () => {
  const rows = [...word(.1, .3, 5), ...word(.5, .3, 9)].map((s, i) => ({...s, id:'gn-x-' + i, createdAt:1700000000000 + i}));
  assert.deepEqual(B.clusters(rows, A).map(c => c.ids.length), [3, 3]);
});

test('tiny marks, highlighter, 악보 표기, memos and strokes on memos are left out', () => {
  const keep = word(.1, .2, 1000);
  const rows = [
    ...keep,
    line(.5, .5, .001, .001, 1000), line(.5, .52, 0, 0, 1000), // specks: alone they are nothing
    ...word(.3, .6, 1000, {tool:'highlighter'}),
    ...word(.3, .7, 1000, {mark:'breath'}), line(.6, .7, .03, .03, 1000, {glyph:'f', size:.04}),
    ...word(.3, .8, 1000, {group:'g1', mark:'mine'}), ...word(.6, .8, 1000, {measures:[1, 2, 12]}),
    {id:'memo', page:1, tool:'note', color:'#fbe88c', rect:[.6, .1, .2, .2], mode:'pen', createdAt:1000},
    ...word(.62, .12, 1000, {note:'memo'})
  ];
  const out = B.clusters(rows, A);
  assert.deepEqual(out.map(c => c.ids), [keep.map(s => s.id)]);
  assert.equal(B.handwriting({tool:'pen', points:[[0, 0, .5]]}), true);
  assert.equal(B.handwriting({tool:'highlighter', points:[[0, 0, .5]]}), false);
});

test('what does not look like writing: a lone line or circle, too small, too wide, too tall', () => {
  const circle = {...line(0, 0, 0, 0, 1000), points:Array.from({length:25}, (_, i) => [.5 + .03 * Math.cos(i / 24 * 2 * Math.PI), .4 + .03 / A * Math.sin(i / 24 * 2 * Math.PI), .5])};
  const cursive = {...line(0, 0, 0, 0, 1000), points:Array.from({length:40}, (_, i) => [.1 + i * .002, .7 + (i % 2 ? .012 : 0), .5])};
  const rows = [
    line(.1, .1, .2, 0, 1000), // a lone straight line (a slur)
    circle, // a lone circle
    line(.3, .9, .004, .004, 1000), line(.305, .9, .004, .004, 1000), // two strokes, together under MIN_EXTENT
    ...Array.from({length:30}, (_, i) => line(.05 + i * .03, .3, .02, .005, 1000 + i)), // a line of dashes across the page
    ...Array.from({length:20}, (_, i) => line(.8, .35 + i * .008, .02, .008, 1000 + i)), // a column down the page
    cursive,
    line(.5, .55, .1, 0, 5000), line(.58, .54, .02, .01, 5100) // an arrow: two strokes, kept (recognition tells)
  ];
  const out = B.clusters(rows, A);
  assert.deepEqual(out.map(c => c.rows.length), [2, 1]);
  assert.equal(out[1].ids[0], cursive.id);
});

test('order: page, top, left, first id — the same whatever order the strokes come in', () => {
  const p2 = word(.1, .1, 1000).map(s => ({...s, page:2}));
  const top = word(.5, .1, 2000), left = word(.1, .4, 3000), right = word(.6, .4, 4000);
  const rows = [...right, ...p2, ...left, ...top];
  const first = B.clusters(rows, p => p === 2 ? 1 : A).map(c => c.ids.join());
  const again = B.clusters([...rows].reverse(), p => p === 2 ? 1 : A).map(c => c.ids.join());
  assert.deepEqual(first, again);
  assert.deepEqual(first, [top, left, right, p2].map(w => w.map(s => s.id).join()));
  // A page without a known size is skipped rather than guessed.
  assert.equal(B.clusters(rows, p => p === 2 ? undefined : A).length, 3);
});

test('review: words or not, checked by default, measures from the boxes, duplicates', () => {
  assert.equal(B.looksLikeText('끝까지 부르기'), true);
  assert.equal(B.looksLikeText('→'), false);
  assert.equal(B.looksLikeText(' ○ ↗ 12 '), false);
  assert.equal(B.looksLikeText('f'), true);
  assert.equal(B.preselect({text:'호흡 미리', confidence:'high'}), true);
  assert.equal(B.preselect({text:'호흡 미리', confidence:'low'}), false);
  assert.equal(B.preselect({text:'', confidence:'high'}), false);
  assert.equal(B.preselect({text:'호흡', confidence:'medium', duplicate:true}), false);
  assert.deepEqual(B.measuresOf([{number:'5'}, {number:'6'}]), {from:5, to:6});
  assert.deepEqual(B.measuresOf([{number:'9', last:'12'}]), {from:9, to:12});
  assert.equal(B.measuresOf([]), null);
  const have = [P.point({songId:'s1', measures:{from:5, to:6}, text:'호흡  미리'}, {uid:'a'})];
  assert.equal(B.duplicate(have, ' 호흡 미리', {from:5, to:6}), true);
  assert.equal(B.duplicate(have, '호흡 미리', {from:5, to:5}), false);
  assert.equal(B.duplicate(have, '호흡 미리', null), false);
});

test('marks: one candidate per mark, identical marks on adjacent measures as one, text from the name', () => {
  const items = [
    {page:1, kind:'mark', label:'숨표', from:'2', to:'2', count:1},
    {page:1, kind:'mark', label:'반복', role:'repeat', from:'5', to:'5', count:1},
    {page:1, kind:'mark', label:'반복', role:'repeat', from:'6', to:'6', count:1},
    {page:1, kind:'mark', label:'숨표', from:'8', to:'8', count:2},
    {page:2, kind:'mark', label:'크게 f', from:'9', to:'9', count:1},
    {page:2, kind:'mark', label:'??', from:'x', to:'x', count:1}
  ];
  assert.deepEqual(B.marks(items).map(m => [m.page, m.text, m.measures.from, m.measures.to, m.count]),
    [[1, '숨표', 2, 2, 1], [1, '반복 (5–6마디)', 5, 6, 2], [1, '숨표', 8, 8, 2], [2, '크게 f', 9, 9, 1]]);
});

test('pool: at most two at once, in order, and stops starting new ones', async () => {
  let now = 0, most = 0; const started = [];
  await B.pool([1, 2, 3, 4, 5], 2, async x => { started.push(x); most = Math.max(most, ++now); await new Promise(r => setTimeout(r, 5)); now--; });
  assert.deepEqual(started, [1, 2, 3, 4, 5]); assert.equal(most, 2);
  const seen = []; let stop = false;
  await B.pool([1, 2, 3, 4, 5], 2, async x => { seen.push(x); if (x === 2) stop = true; await new Promise(r => setTimeout(r, 1)); }, () => stop);
  assert.deepEqual(seen, [1, 2]);
});
