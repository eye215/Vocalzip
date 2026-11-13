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
test('outline acts as a table of contents: each song ends immediately before the next start, and the last reaches EOF', async () => {
  const m = await G.read(new Uint8Array(F.notebook({
    title:'뮤지컬 악보 모음',
    pages:Array.from({length:8}, (_,i)=>({pdfPage:i+1,order:String.fromCharCode(97+i)})),
    outline:[
      {page:0,title:'The Winner Takes It All'},
      {page:3,title:'Out Here on My Own'},
      {page:5,title:'If I Ain\'t Got You'},
      {page:7,title:'The River'}
    ]
  })));
  assert.deepEqual(m.sections.map(s=>[s.title,s.from,s.to,s.pages]), [
    ['The Winner Takes It All',1,3,[0,1,2]],
    ['Out Here on My Own',4,5,[3,4]],
    ['If I Ain\'t Got You',6,7,[5,6]],
    ['The River',8,8,[7]]
  ]);
  assert.deepEqual(m.sections.flatMap(s=>s.pages),Array.from({length:8},(_,i)=>i),
    'each page belongs to exactly one song, with no gaps or overlap');
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

// ---- Found in a real multi-page export (schema 25, 2026-11): removed pages, pressure pen, freehand highlighter,
// brush pen and shape lines. Fixtures are synthetic; the real file is not in the repository. ----
test('a page removed in GoodNotes is left out with its ink; the pages after it keep their own PDF page; a restored page comes back', async () => {
  const mark = id => F.inkItem(F.uuid(id), {payload:F.stored(F.pathTuple({width:3, ...line(60, 80, 300, 400)}))});
  const pages = [{pdfPage:1, order:'a', ink:[mark(1)]}, {pdfPage:2, order:'b', removed:true, ink:[mark(2), mark(3)]}, {pdfPage:3, order:'c', ink:[mark(4)]}, {pdfPage:4, order:'d', removed:false}];
  const m = await G.read(new Uint8Array(F.notebook({pages, outline:[{page:0, title:'첫 곡'}, {page:2, title:'둘째 곡'}]})));
  assert.deepEqual(m.pages.map(p => p.pdf.page), [1, 3, 4]);          // not "the first three pages of the PDF"
  assert.deepEqual(m.pages.map(p => p.strokes.length), [1, 1, 0]);    // the removed page's two strokes do not land on another page
  assert.deepEqual([m.report.removedPages, m.report.unmatchedNotes, m.report.strokes], [1, 0, 2]);
  assert.deepEqual(m.sections.map(s => [s.title, s.from, s.to]), [['첫 곡', 1, 1], ['둘째 곡', 2, 3]]);
});
test('an outline entry on a removed page does not start a song; every page removed is refused plainly', async () => {
  const m = await G.read(new Uint8Array(F.notebook({pages:[{pdfPage:1, order:'a'}, {pdfPage:2, order:'b', removed:true}, {pdfPage:3, order:'c'}], outline:[{page:0, title:'곡'}, {page:1, title:'지운 쪽의 제목'}]})));
  assert.deepEqual(m.sections.map(s => [s.title, s.from, s.to]), [['곡', 1, 2]]);
  await assert.rejects(G.read(new Uint8Array(F.notebook({pages:[{pdfPage:1, order:'a', removed:true}]}))), {code:'empty'});
});
test('pressure pen, freehand highlighter, brush pen and shape line become editable strokes with their own widths', async () => {
  // Pen points carry half the stroke width (1.5 → 3 wide on a 600 wide page = 0.005).
  const pen = F.inkItem(F.uuid(1), {type:1, color:[.74, 0, 0, 1], payload:F.lz4Literals(F.penTuple({start:[60, 80, 1.5], curves:[[120, 160, 1.5, 180, 240, 1.6], [240, 320, 1.4, 300, 400, 1.5]]}))});
  // The freehand highlighter is stored solid (alpha 1) with the full width in its points; GoodNotes draws it see-through.
  const marker = F.inkItem(F.uuid(2), {type:1, color:[1, .37, .4, 1], payload:F.stored(F.penTuple({highlighter:true, start:[300, 400, 18], curves:[[420, 560, 18, 540, 720, 18]]}))});
  const brush = F.inkItem(F.uuid(3), {type:5, color:[.12, .11, .11, 1], payload:F.stored(F.brushTuple({width:1.5, start:[60, 720], curves:[[120, 640, 180, 560], [240, 480, 300, 400]]}))});
  const shape = F.inkItem(F.uuid(4), {color:[.42, .13, .13, 1], shape:{points:[[60, 400], [540, 400]], width:1.2}, payload:F.stored(F.pathTuple({width:1.2, kinds:[], moves:[], curves:[]}))});
  const erased = F.inkItem(F.uuid(5), {type:1, deleted:true, payload:F.stored(F.penTuple({empty:true}))});
  const m = await G.read(new Uint8Array(F.notebook({pages:[{pdfPage:1, order:'a', ink:[pen, marker, brush, shape, erased]}]})));
  const [a, b, c, d] = m.pages[0].strokes;
  assert.equal(m.pages[0].strokes.length, 4);
  assert.deepEqual([a.tool, a.color, a.opacity, a.width], ['pen', '#bd0000', 1, 0.005]);
  assert.deepEqual([a.points[0], a.points.at(-1)], [[0.1, 0.1, 0.5], [0.5, 0.5, 0.5]]);
  assert.deepEqual([b.tool, b.color, b.opacity, b.width], ['highlighter', '#ff5e66', 0.5, 0.03]);
  assert.deepEqual([b.points[0], b.points.at(-1)], [[0.5, 0.5, 0.5], [0.9, 0.9, 0.5]]);
  assert.deepEqual([c.tool, c.color, c.width], ['pen', '#1f1c1c', 0.0025]);
  assert.deepEqual([c.points[0], c.points.at(-1)], [[0.1, 0.9, 0.5], [0.5, 0.5, 0.5]]);
  assert.deepEqual([d.tool, d.color, d.width, d.points], ['pen', '#6b2121', 0.002, [[0.1, 0.5, 0.5], [0.9, 0.5, 0.5]]]);
  assert.deepEqual([m.report.strokes, m.report.unsupported], [4, 0]);
});
test('a pen item whose numbers do not add up is counted as not read instead of being drawn wrong', async () => {
  const broken = F.penTuple({start:[60, 80, 1.5], curves:[[120, 160, 1.5, 180, 240, 1.6]]});
  const odd = Buffer.from(broken); odd.writeUInt16LE(7, odd.indexOf(0, 8) + 1 + 2 + 4 + 2); // second kind is not a curve
  const m = await G.read(new Uint8Array(F.notebook({pages:[{pdfPage:1, order:'a', ink:[F.inkItem(F.uuid(1), {type:1, payload:F.stored(odd)})]}]})));
  assert.deepEqual([m.pages[0].strokes.length, m.report.unsupported], [0, 1]);
});

test('the structure export lists events and file ids without any PDF or ink bytes', async () => {
  const mark = F.inkItem(F.uuid(1), {payload:F.stored(F.pathTuple({width:3, ...line(60, 80, 300, 400)}))});
  const pdf = Buffer.from('%PDF-1.4\n% secret score bytes\n');
  const x = await G.structure(new Uint8Array(F.notebook({pdf, pages:[{pdfPage:1, order:'a', ink:[mark]}, {pdfPage:2, order:'b', removed:true}], outline:[{page:0, title:'곡'}]})));
  assert.equal(x.format, 'vocalzip-goodnotes-structure');
  const kinds = x.events.map(e => e.find(f => f[0] !== 1)?.[0]);
  for (const kind of [30, 6, 2, 54, 56, 65]) assert.ok(kinds.includes(kind), 'event ' + kind);
  assert.deepEqual([x.attachments.length, x.attachments[0][2], x.notes.length], [1, pdf.length, 1]);
  const text = JSON.stringify(x);
  assert.ok(!text.includes('secret score bytes') && !text.includes('tpl'));
  assert.ok(text.includes('곡')); // titles are part of the events
});
