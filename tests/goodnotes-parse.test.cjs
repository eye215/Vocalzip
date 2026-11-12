// GoodNotes notebook reader (app/goodnotes-parse.js) against synthetic archives: pages in order, outline → sections,
// ink → editable strokes, and nothing guessed when the data is not recognised.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/goodnotes-parse.js');
const F = require('./goodnotes-fixture.cjs');

const line = (x0, y0, x1, y1, n = 4) => {
  const kinds = [0], curves = [];
  for (let i = 1; i <= n; i++) { const ax = x0 + (x1 - x0) * (i - 0.5) / n, ay = y0 + (y1 - y0) * (i - 0.5) / n; kinds.push(1); curves.push([ax, ay, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); }
  return {kinds, moves:[[x0, y0]], curves};
};

test('pages come out in notebook order and the outline cuts them into songs', async () => {
  const file = F.notebook({title:'옛 이름', rename:'내 악보집', pages:[
    {pdfPage:3, order:'c'}, {pdfPage:1, order:'a'}, {pdfPage:4, order:'d'}, {pdfPage:2, order:'b'}],
    outline:[{page:3, title:'Song A'}, {page:2, title:'Song B'}, {page:2, title:'같은 쪽의 둘째 항목'}]});
  const m = await G.read(new Uint8Array(file));
  assert.equal(m.title, '내 악보집');
  assert.deepEqual(m.pages.map(p => p.pdf.page), [1, 2, 3, 4]);
  assert.deepEqual(m.pages.map(p => [p.width, p.height]), Array(4).fill([600, 800]));
  assert.deepEqual(m.sections.map(x => [x.title, x.from, x.to, x.untitled]), [['내 악보집 (앞부분)', 1, 1, true], ['Song A', 2, 3, false], ['Song B', 4, 4, false]]);
  assert.deepEqual(m.outline, [{title:'Song A', page:2}, {title:'Song B', page:4}, {title:'같은 쪽의 둘째 항목', page:4}]);
  assert.deepEqual(m.report.unknownEvents, {99:1});
  assert.equal(m.report.schema, 26);
  assert.equal(Buffer.from(await m.readFile(m.pages[0].pdf.file)).toString().startsWith('%PDF-1.4'), true);
});
test('a notebook without an outline is one section named after the notebook', async () => {
  const m = await G.read(new Uint8Array(F.notebook({title:'The River', pages:[{pdfPage:1, order:'a'}, {pdfPage:2, order:'b'}]})));
  assert.deepEqual(m.sections.map(x => [x.title, x.from, x.to, x.untitled]), [['The River', 1, 2, true]]);
});
test('ink becomes editable strokes: colour, highlighter, width and page-normalised points; erased and unknown items are not imported', async () => {
  const pen = F.inkItem(F.uuid(1), {color:[1, 0, 0, 1], payload:F.stored(F.pathTuple({width:3, ...line(60, 80, 300, 400)}))});
  const marker = F.inkItem(F.uuid(2), {color:[0, 1, 1, 0.5], payload:F.lz4Literals(F.pathTuple({width:24, ...line(300, 400, 540, 720)}))});
  const erased = F.inkItem(F.uuid(3), {deleted:true, payload:F.stored(F.pathTuple({width:0, kinds:[], moves:[], curves:[]}))});
  const flagged = F.inkItem(F.uuid(4), {deleted:true, payload:F.stored(F.pathTuple({width:3, ...line(1, 1, 9, 9)}))});
  const unknown = F.inkItem(F.uuid(5), {payload:F.stored(F.pathTuple({schema:'vuA(v)A(S(uu))A(S(uuuu))vA(f)u', width:3, ...line(1, 1, 9, 9)}))});
  const m = await G.read(new Uint8Array(F.notebook({pages:[{pdfPage:1, order:'a'}, {pdfPage:2, order:'b', ink:[pen, marker, erased, flagged, unknown]}], outline:[{page:0, title:'곡'}]})));
  assert.equal(m.pages[0].strokes.length, 0);
  const [a, b] = m.pages[1].strokes;
  assert.equal(m.pages[1].strokes.length, 2);
  assert.deepEqual([a.tool, a.color, a.opacity, a.width], ['pen', '#ff0000', 1, 0.005]);
  assert.deepEqual([a.points[0], a.points.at(-1)], [[0.1, 0.1, 0.5], [0.5, 0.5, 0.5]]);
  assert.deepEqual([b.tool, b.color, b.opacity, b.width], ['highlighter', '#00ffff', 0.5, 0.04]);
  assert.deepEqual([b.points[0], b.points.at(-1)], [[0.5, 0.5, 0.5], [0.9, 0.9, 0.5]]);
  assert.deepEqual([m.report.strokes, m.report.deleted, m.report.unsupported, m.report.unmatchedNotes], [2, 1, 1, 0]);
  assert.equal(m.sections[0].strokes, 2);
});
test('a curved stroke keeps its bend, and a very long stroke is split so each part stays editable', async () => {
  const bend = F.inkItem(F.uuid(1), {payload:F.stored(F.pathTuple({width:3, kinds:[0, 1], moves:[[100, 100]], curves:[[300, 500, 500, 100]]}))});
  const kinds = [0], curves = [];
  for (let i = 1; i <= 2500; i++) { kinds.push(1); curves.push([i * 0.2 - 0.1, i % 2 ? 300 : 302, i * 0.2, i % 2 ? 300 : 302]); }
  const long = F.inkItem(F.uuid(2), {payload:F.stored(F.pathTuple({width:3, kinds, moves:[[0, 300]], curves}))});
  const m = await G.read(new Uint8Array(F.notebook({pages:[{pdfPage:1, order:'a', ink:[bend, long]}]})));
  const [curve, ...parts] = m.pages[0].strokes;
  assert.ok(curve.points.length >= 5, 'the bend is sampled');
  assert.ok(Math.max(...curve.points.map(p => p[1])) > 0.3, 'it really bows down toward the control point');
  assert.ok(parts.length >= 2 && parts.every(p => p.points.length <= 2048));
  assert.deepEqual(parts[1].points[0], parts[0].points.at(-1), 'parts join where the stroke was cut');
});
test('the LZ4 reader copies matches, and broken data is refused', () => {
  const {lz4} = G._internal;
  assert.equal(Buffer.from(lz4(Uint8Array.from([0x44, 97, 98, 99, 100, 4, 0, 0x10, 101]), 13)).toString(), 'abcdabcdabcde');
  assert.throws(() => lz4(Uint8Array.from([0x44, 97, 98, 99, 100, 9, 0]), 12), {code:'ink'}); // points before the start
  assert.throws(() => lz4(Uint8Array.from([0x40, 97, 98, 99, 100]), 9), {code:'ink'});           // shorter than declared
});
test('files that are not GoodNotes notebooks are refused with a plain reason', async () => {
  await assert.rejects(G.read(new Uint8Array(Buffer.from('%PDF-1.4 not a zip at all, just some bytes to pass the length check'))), {code:'format'});
  await assert.rejects(G.read(new Uint8Array(F.zip([['hello.txt', Buffer.from('hi'), false]]))), {code:'format'});
  await assert.rejects(G.read(new Uint8Array(F.notebook({pages:[]}))), {code:'empty'});
});
test('an entry that inflates past its declared size is rejected instead of filling memory', async () => {
  const file = F.notebook({pages:[{pdfPage:1, order:'a'}]});
  // Declare index.events.pb (deflated) 10 bytes shorter than it really is, in the central directory.
  let head = -1; for (let i = file.length - 22; i >= 0; i--) if (file.readUInt32LE(i) === 0x02014b50 && file.subarray(i + 46, i + 61).toString() === 'index.events.pb') { head = i; break; }
  assert.ok(head > 0);
  file.writeUInt32LE(file.readUInt32LE(head + 24) - 10, head + 24);
  await assert.rejects(G.read(new Uint8Array(file)), {code:'format'});
});
