// 마디 위치 (app/score-measure-model.js): the converted score's printed layout as page fractions, which measure a
// point or a box belongs to, staves seen in a rendered page, and the list of what the user put where.
// Fixtures are written here (tests/fixtures is not committed). Node has no DOMParser, so a tiny XML parser exposes
// the small element surface the model uses (children, localName, textContent, getAttribute).
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../app/score-measure-model.js');

function parseXml(src) {
  const root = {children:[], parts:[]}, stack = [root];
  const node = (name, attrs) => ({tagName:name, localName:name.replace(/^.*:/, ''), attrs, children:[], parts:[],
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    get textContent() { return this.parts.map(p => typeof p === 'string' ? p : p.textContent).join(''); }});
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(src));) {
    const top = stack.at(-1);
    if (m[1]) { assert.equal(top.tagName, m[1], 'well-formed fixture'); stack.pop(); }
    else if (m[2]) {
      const attrs = {}; for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
      const el = node(m[2], attrs); top.children.push(el); top.parts.push(el);
      if (!m[4]) stack.push(el);
    } else if (m[5] != null) top.parts.push(m[5]);
  }
  return {documentElement:root.children[0]};
}
const read = xml => M.read(xml, parseXml);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);

// ---- fixture builders ----
const sysLayout = ({lm = 100, rm = 100, top, dist}) => '<system-layout><system-margins><left-margin>' + lm + '</left-margin><right-margin>' + rm + '</right-margin></system-margins>' +
  (top != null ? '<top-system-distance>' + top + '</top-system-distance>' : '') + (dist != null ? '<system-distance>' + dist + '</system-distance>' : '') + '</system-layout>';
const staffLayout = (number, d) => '<staff-layout number="' + number + '"><staff-distance>' + d + '</staff-distance></staff-layout>';
/** One measure. opts: number, width, print (inner XML of <print>), newSystem, newPage, hidden, staves, extra, implicit. */
const measure = ({number, width, print = '', newSystem, newPage, hidden, staves, extra = '', implicit}) =>
  '<measure number="' + number + '"' + (width ? ' width="' + width + '"' : '') + (implicit ? ' implicit="yes"' : '') + '>' +
  (print || newSystem || newPage ? '<print' + (newPage ? ' new-page="yes"' : newSystem ? ' new-system="yes"' : '') + '>' + print + '</print>' : '') +
  (hidden || staves || extra ? '<attributes>' + (staves ? '<staves>' + staves + '</staves>' : '') + (hidden ? '<staff-details print-object="no"></staff-details>' : '') + extra + '</attributes>' : '') +
  '<note><rest measure="yes"/><duration>4</duration></note></measure>';
const doc = (parts, {software = 'Audiveris 5.11.0', page = '<page-layout><page-height>2160</page-height><page-width>1660</page-width><page-margins type="both"><left-margin>80</left-margin><right-margin>80</right-margin><top-margin>80</top-margin><bottom-margin>80</bottom-margin></page-margins></page-layout>', sheets = ''} = {}) =>
  '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">' +
  '<score-partwise version="4.0"><identification><encoding><software>' + software + '</software></encoding>' + (sheets ? '<miscellaneous>' + sheets + '</miscellaneous>' : '') + '</identification>' +
  '<defaults>' + page + '</defaults><part-list>' + parts.map((_, i) => '<score-part id="P' + (i + 1) + '"><part-name>P</part-name></score-part>').join('') + '</part-list>' +
  parts.map((p, i) => '<part id="P' + (i + 1) + '">' + p.join('') + '</part>').join('') + '</score-partwise>';
const sheet = n => '<miscellaneous-field name="source-sheet-' + n + '">1 2</miscellaneous-field>';

/* A voice over a piano, read the way Audiveris writes it. The inner page (the picture it read) is 1500 × 2000.
 * Page 1: system 1 = measures 1–3 with the voice hidden (piano only), system 2 = measures 4–5 with both.
 * Page 2 (its own unit: 1800 wide): system 3 = measures 6–7. */
function voiceAndPiano() {
  const voice = [
    measure({number:1, hidden:true}), measure({number:2}), measure({number:3}),
    measure({number:4, width:700, newSystem:true, print:sysLayout({dist:120})}), measure({number:5, width:600}),
    measure({number:6, width:800, newPage:true, print:sysLayout({lm:150, rm:150, top:300})}), measure({number:7, width:700})
  ];
  const piano = [
    measure({number:1, width:300, staves:2, print:sysLayout({top:200}) + staffLayout(2, 90)}), measure({number:2, width:500}), measure({number:3, width:500}),
    measure({number:4, width:700, newSystem:true, print:staffLayout(1, 100) + staffLayout(2, 90)}), measure({number:5, width:600}),
    measure({number:6, width:800, newPage:true, print:staffLayout(1, 110) + staffLayout(2, 80)}), measure({number:7, width:700})
  ];
  return doc([voice, piano], {sheets:sheet(1) + sheet(2)});
}

test('Audiveris layout: the PDF page is the area inside the fixed margins; a hidden part gives no staff and no width', () => {
  const lay = read(voiceAndPiano());
  assert.equal(lay.audiveris, true); assert.equal(lay.pages.length, 2); assert.equal(lay.measures, 7);
  assert.equal(M.fits(lay, 2), true); assert.equal(M.fits(lay, 3), false);
  const p1 = M.page(lay, 1, 2000 / 1500);
  assert.equal(p1.systems.length, 2); assert.equal(p1.approximate, false); assert.equal(p1.snapped, false);
  const [a, b] = p1.systems;
  // System 1: piano only (two staves), from the top of the picture — the 80 margin is not added.
  assert.equal(a.staves.length, 2);
  near(a.top, 200 / 2000); near(a.bottom, (200 + 40 + 90 + 40) / 2000);
  near(a.left, 100 / 1500); near(a.right, 1400 / 1500);
  assert.deepEqual(a.measures.map(m => m.number), ['1', '2', '3']);
  near(a.measures[0].x0, 100 / 1500); near(a.measures[0].x1, 400 / 1500); near(a.measures[1].x1, 900 / 1500); near(a.measures[2].x1, 1400 / 1500);
  // System 2: voice + piano (three staves), 120 under the last staff of system 1.
  assert.equal(b.staves.length, 3);
  near(b.top, (370 + 120) / 2000); near(b.bottom, (490 + 40 + 100 + 40 + 90 + 40) / 2000);
  assert.deepEqual(b.measures.map(m => [m.index, m.number]), [[3, '4'], [4, '5']]);
  near(b.measures[0].x1, (100 + 700) / 1500);
  near(p1.staff, 40 / 2000);
});

test('Audiveris later pages have their own unit: the page is as wide as its systems add up to, as tall as the PDF page', () => {
  const lay = read(voiceAndPiano());
  const p2 = M.page(lay, 2, 1.25); // 150 + 1500 + 150 = 1800 wide → 2250 high
  assert.equal(p2.systems.length, 1);
  const s = p2.systems[0];
  near(s.left, 150 / 1800); near(s.right, 1650 / 1800); near(s.top, 300 / 2250); near(s.bottom, (300 + 40 + 110 + 40 + 80 + 40) / 2250);
  near(s.measures[0].x1, 950 / 1800);
  // Without the PDF's page size the declared shape is used.
  near(M.page(lay, 2).systems[0].top, 300 / (1800 * 2000 / 1500));
  const g = M.geometry(lay, [2000 / 1500, 1.25]);
  assert.equal(g.pages.length, 2); assert.equal(g.approximate, false); assert.equal(g.measures, 7);
});

test('measure widths that do not quite fill the system are stretched to it', () => {
  const part = [measure({number:1, width:600, print:sysLayout({top:100})}), measure({number:2, width:300}), measure({number:3, width:270})]; // 1170 of 1300
  const s = M.page(read(doc([part])), 1, 4 / 3).systems[0];
  near(s.measures[0].x1, (100 + 600 * 1300 / 1170) / 1500); near(s.measures[2].x1, 1400 / 1500);
});

test('other MusicXML is read the standard way: whole page, positions after the page margins', () => {
  const part = [measure({number:1, width:700, print:sysLayout({lm:50, rm:30, top:120})}), measure({number:2, width:720}),
    measure({number:3, width:1420, newSystem:true, print:sysLayout({lm:50, rm:30, dist:150})})];
  const lay = read(doc([part], {software:'MuseScore 4.2'}));
  assert.equal(lay.audiveris, false);
  const p = M.page(lay, 1, 1.3);
  near(p.systems[0].left, (80 + 50) / 1660); near(p.systems[0].right, (1660 - 80 - 30) / 1660);
  near(p.systems[0].top, (80 + 120) / 2160); near(p.systems[1].top, (200 + 40 + 150) / 2160);
  near(p.systems[0].measures[0].x1, (130 + 700) / 1660);
});

test('missing widths: the measures share the system equally and the page is flagged approximate', () => {
  const part = [measure({number:1, print:sysLayout({top:100})}), measure({number:2}), measure({number:3}), measure({number:4}),
    measure({number:5, width:400, newSystem:true, print:sysLayout({dist:100})}), measure({number:6})]; // one width missing counts as missing
  const p = M.page(read(doc([part])), 1, 4 / 3);
  assert.equal(p.approximate, true); assert.equal(p.systems[0].approximate, true); assert.equal(p.systems[1].approximate, true);
  const xs = p.systems[0].measures.map(m => m.x1);
  [425, 750, 1075, 1400].forEach((x, i) => near(xs[i], x / 1500));
  near(p.systems[1].measures[0].x1, 750 / 1500);
});

test('missing distances fall back to the last known or a usual value, flagged approximate; staves carry over', () => {
  const part = [measure({number:1, width:1300, staves:2, print:sysLayout({top:100}) + staffLayout(2, 70)}),
    measure({number:2, width:1300, newSystem:true}), // no layout at all in this system
    measure({number:3, width:1300, newSystem:true, print:sysLayout({dist:90})}),
    measure({number:4, width:1300, newSystem:true})];
  const p = M.page(read(doc([part])), 1, 4 / 3);
  assert.deepEqual(p.systems.map(s => s.staves.length), [2, 2, 2, 2]);
  near(p.systems[0].bottom, 250 / 2000);
  near(p.systems[1].top, (250 + 100) / 2000); assert.equal(p.systems[1].approximate, true); // guessed gap
  near(p.systems[1].bottom, (350 + 150) / 2000); // staff distance carried over
  near(p.systems[2].top, (500 + 90) / 2000); assert.equal(p.systems[2].approximate, false);
  near(p.systems[3].top, (740 + 90) / 2000); assert.equal(p.systems[3].approximate, false); // last known distance
  near(p.systems[3].left, 100 / 1500);
});

test('pickup and multi-measure rests keep the numbers of the file', () => {
  const rest = n => '<measure-style><multiple-rest>' + n + '</multiple-rest></measure-style>';
  // 0 (pickup), 1, then a 3-bar rest written as one measure (the file goes on at 5), then 5.
  const a = [measure({number:0, width:200, implicit:true, print:sysLayout({top:100})}), measure({number:1, width:400}), measure({number:2, width:300, extra:rest(3)}), measure({number:5, width:400})];
  const sa = M.page(read(doc([a])), 1, 4 / 3).systems[0];
  assert.deepEqual(sa.measures.map(m => [m.number, m.last]), [['0', undefined], ['1', undefined], ['2', '4'], ['5', undefined]]);
  // The same rest written with its measures listed (no width of their own): they are part of the one box.
  const b = [measure({number:1, width:400, print:sysLayout({top:100})}), measure({number:2, width:500, extra:rest(3)}), measure({number:3}), measure({number:4}), measure({number:5, width:400})];
  const sb = M.page(read(doc([b])), 1, 4 / 3);
  assert.deepEqual(sb.systems[0].measures.map(m => [m.index, m.number, m.last]), [[0, '1', undefined], [1, '2', '4'], [4, '5', undefined]]);
  assert.equal(sb.approximate, false);
  near(sb.systems[0].measures[1].x1, 1000 / 1500);
  assert.deepEqual(M.measureAt(sb, .5, .06), {page:1, system:0, measure:1, index:1, number:'2', last:'4'});
});

test('no layout: null, so the feature stays hidden', () => {
  assert.equal(read(doc([[measure({number:1, width:300}), measure({number:2, width:300})]])), null); // a page size but no system layout
  assert.equal(read(doc([[measure({number:1, width:300, print:sysLayout({top:100})})]], {page:''})), null); // no page size
  assert.equal(read('<score-partwise version="4.0"><part-list/></score-partwise>'), null);
  assert.equal(read('<html><body/></html>'), null);
  assert.equal(M.fits(null, 1), false);
  assert.equal(M.page(read(voiceAndPiano()), 3, 1.4), null);
});

test('fits: the same number of pages and no page skipped by the conversion', () => {
  const part = [measure({number:1, width:1300, print:sysLayout({top:100})}), measure({number:2, width:1300, newPage:true, print:sysLayout({top:100})})];
  assert.equal(M.fits(read(doc([part])), 2), true);
  assert.equal(M.fits(read(doc([part])), 1), false);
  assert.equal(M.fits(read(doc([part], {sheets:sheet(1) + sheet(2)})), 2), true);
  assert.equal(M.fits(read(doc([part], {sheets:sheet(2) + sheet(3)})), 2), false); // PDF page 1 was skipped
});

test('measureAt: bands halfway between systems; outside a system counts as its first or last measure', () => {
  const p1 = M.page(read(voiceAndPiano()), 1, 2000 / 1500);
  const [a, b] = p1.systems, mid = (a.bottom + b.top) / 2;
  assert.deepEqual(M.bands(p1), [[0, mid], [mid, 1]]);
  assert.equal(M.measureAt(p1, .3, a.top + .01).number, '2');
  assert.equal(M.measureAt(p1, .3, .01).number, '2'); // above the first system
  assert.equal(M.measureAt(p1, .3, mid - .001).number, '2'); assert.equal(M.measureAt(p1, .3, mid + .001).number, '4');
  assert.equal(M.measureAt(p1, .01, a.top).number, '1'); assert.equal(M.measureAt(p1, .99, a.top).number, '3');
  assert.equal(M.measureAt(p1, .99, .99).number, '5');
  assert.deepEqual(M.measureAt(p1, .7, b.top), {page:1, system:1, measure:1, index:4, number:'5'});
  assert.equal(M.measureAt({page:1, systems:[]}, .5, .5), null);
});

test('measuresIn: every measure a box overlaps, without slivers past a barline or into the next band', () => {
  const p1 = M.page(read(voiceAndPiano()), 1, 2000 / 1500);
  const [a] = p1.systems, y = a.top, bar12 = a.measures[0].x1, bar23 = a.measures[1].x1;
  const numbers = box => M.measuresIn(p1, box).map(m => m.number);
  assert.deepEqual(numbers({x:bar12 + .02, y, w:.1, h:.02}), ['2']);
  assert.deepEqual(numbers({x:bar12 - .05, y, w:bar23 - bar12 + .1, h:.02}), ['1', '2', '3']);
  assert.deepEqual(numbers({x:bar12 + .01, y, w:bar23 - bar12 + .004, h:.02}), ['2']); // 0.4% past the barline
  assert.deepEqual(numbers({x:.1, y:a.top, w:.7, h:.6}), ['1', '2', '3', '4', '5']); // across both systems
  assert.deepEqual(numbers({x:.5, y:a.top, w:0, h:.05}), ['2']); // a vertical line
  const mid = M.bands(p1)[0][1];
  assert.deepEqual(numbers({x:.5, y:mid - .09, w:.02, h:.1}), ['2']); // 10% into the next band
  assert.deepEqual(numbers({x:.5, y:a.top - .2, w:.02, h:.26}), ['2']);
});

// ---- staves in a rendered page ----
/** A white RGBA picture with five-line staves: each {top, x0, x1} in pixels, lines `step` apart. */
function picture(W, H, staves, step = 6, extra = () => {}) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x, y, v = 0) => { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; };
  for (const s of staves) for (let l = 0; l < 5; l++) for (let x = s.x0; x <= s.x1; x++) ink(x, s.top + l * step);
  extra(ink);
  return {data, width:W, height:H};
}

test('findStaves: five evenly spaced long lines are a staff; beams, text and short rules are not', () => {
  const W = 600, H = 800, img = picture(W, H, [{top:100, x0:60, x1:540}, {top:160, x0:60, x1:540}, {top:400, x0:90, x1:540}], 6, ink => {
    for (let x = 100; x < 330; x++) for (let y = 109; y < 112; y++) ink(x, y);   // a thick beam between two lines (under 70% of a staff line)
    for (let x = 0; x < W; x++) ink(x, 300);                                      // one lone rule across the page
    for (let x = 200; x < 260; x++) for (let l = 0; l < 5; l++) ink(x, 600 + l * 6); // five short lines
    for (let y = 100; y <= 184; y++) ink(60, y);                                  // a barline joining two staves
    for (let x = 60; x <= 540; x += 2) ink(x, 401, 150);                          // grey antialiasing next to a line
  });
  const found = M.findStaves(img);
  assert.equal(found.length, 3);
  near(found[0].top, 100 / H); near(found[0].bottom, 124 / H); near(found[0].x0, 60 / W); near(found[0].x1, 541 / W);
  near(found[1].top, 160 / H); near(found[2].x0, 90 / W);
  near(found[2].top, 400 / H); near(found[2].bottom, 424 / H); // the grey row is not a line of its own
  assert.deepEqual(M.findStaves(picture(30, 30, [])), []); assert.deepEqual(M.findStaves(null), []);
  assert.deepEqual(M.findStaves(picture(600, 800, [{top:100, x0:60, x1:540}], 1)), []); // lines too close to tell apart
});

test('snap: the page follows the staves seen in the picture (scale and shift), systems take the seen lines', () => {
  const p1 = M.page(read(voiceAndPiano()), 1, 2000 / 1500);
  // The same page shown smaller inside a bigger sheet: 8% narrower and lower, as when the PDF was refitted.
  const seen = p1.systems.flatMap(s => s.staves.map(st => ({top:st[0] * .92 + .05, bottom:st[1] * .92 + .05, x0:s.left * .92 + .04, x1:s.right * .92 + .04})));
  const out = M.snap(p1, [...seen, {top:.9, bottom:.92, x0:.1, x1:.9}]); // one more staff the file does not know
  assert.equal(out.snapped, true);
  out.systems.forEach((s, i) => {
    near(s.top, p1.systems[i].top * .92 + .05); near(s.bottom, p1.systems[i].bottom * .92 + .05);
    near(s.left, p1.systems[i].left * .92 + .04); near(s.right, p1.systems[i].right * .92 + .04);
    s.measures.forEach((m, k) => { near(m.x0, p1.systems[i].measures[k].x0 * .92 + .04); near(m.x1, p1.systems[i].measures[k].x1 * .92 + .04); assert.equal(m.number, p1.systems[i].measures[k].number); });
  });
  near(out.staff, p1.staff * .92, 1e-4);
  assert.equal(p1.snapped, false); near(p1.systems[0].top, .1); // the input is left as it was
});

test('snap: a staff that was not seen follows the others; too few matches leave the page as it was', () => {
  const p1 = M.page(read(voiceAndPiano()), 1, 2000 / 1500);
  const all = p1.systems.flatMap(s => s.staves.map(st => ({top:st[0] + .03, bottom:st[1] + .03 + .002, x0:s.left, x1:s.right})));
  const partly = M.snap(p1, all.slice(0, 4)); // the last of five staves is missing
  assert.equal(partly.snapped, true);
  near(partly.systems[1].top, p1.systems[1].top + .03);
  near(partly.systems[1].bottom, p1.systems[1].bottom + .03, .004);
  assert.equal(M.snap(p1, all.slice(0, 2)), p1);
  assert.equal(M.snap(p1, []), p1); assert.equal(M.snap(p1, null), p1);
  assert.equal(M.snap(p1, all.map(f => ({...f, top:f.top + .4, bottom:f.bottom + .4}))), p1); // far from where the file says
});

// ---- what the user put where ----
const stroke = (page, tool, points, more = {}) => ({id:'s' + Math.random(), page, tool, color:'#101828', width:.004, points:points.map(p => [p[0], p[1], .5]), ...more});
const memo = (page, rect, more = {}) => ({id:'m' + Math.random(), page, tool:'note', color:'#fbe88c', rect, mode:'text', ...more});

test('summary: marks by name, memos with their text, highlighter and pen writing grouped, by page and measure', () => {
  const lay = read(voiceAndPiano()), pages = [M.page(lay, 1, 2000 / 1500), M.page(lay, 2, 1.25)], pageOf = n => pages[n - 1] || null;
  const [a, b] = pages[0].systems, x = (s, i, t = .5) => s.measures[i].x0 + (s.measures[i].x1 - s.measures[i].x0) * t;
  const rows = [
    stroke(1, 'pen', [[x(a, 1) - .01, a.top - .02], [x(a, 1), a.top - .01], [x(a, 1) + .01, a.top - .02]], {mark:'breath'}),      // 숨표 over measure 2
    stroke(1, 'pen', [[x(a, 1, .3) - .01, a.top - .02], [x(a, 1, .3) + .01, a.top - .02]], {mark:'breath'}),                       // a second one in measure 2
    stroke(1, 'pen', [[x(a, 0, .5), a.bottom + .01], [x(a, 2, .5), a.bottom + .01]], {mark:'user-1'}),                              // a long mark of a preset that is gone
    stroke(1, 'pen', [[x(b, 0), b.top]], {glyph:'Ⅴ', size:.04}),                                                                   // a glyph placed before marks said what they are
    stroke(1, 'highlighter', [[x(b, 0, .2), b.top + .02], [x(b, 1, .8), b.top + .02]]),                                             // 형광펜 over 4–5
    stroke(1, 'pen', [[x(a, 2, .4), a.top + .01], [x(a, 2, .45), a.top + .02]]), stroke(1, 'pen', [[x(a, 2, .46), a.top + .01], [x(a, 2, .5), a.top + .02]]), // two strokes of one word
    memo(1, [x(b, 1, .3), b.top + .03, .2, .05], {text:'\n  숨 크게\n다음 줄'}),
    stroke(1, 'pen', [[x(b, 1, .35), b.top + .04], [x(b, 1, .4), b.top + .05]], {note:'key-1'}),                                    // not on a memo (its memo is gone): ordinary writing
    memo(2, [.3, pages[1].systems[0].top, .2, .05], {mode:'pen', id:'memo-pen'}),
    stroke(2, 'pen', [[.35, pages[1].systems[0].top + .01], [.4, pages[1].systems[0].top + .02]], {note:'memo-pen'}),                // written on that memo: part of it
    stroke(3, 'pen', [[.5, .5], [.6, .5]])                                                                                          // a page the conversion does not have
  ];
  const out = M.summary(pageOf, rows, {markName:id => ({breath:'숨표'})[id] || ''});
  assert.deepEqual(out.items.map(i => [i.page, i.where, i.kind, i.label, i.count, i.detail]), [
    [1, '1–3마디', 'mark', '표기', 1, ''],
    [1, '2마디', 'mark', '숨표', 2, ''],
    [1, '3마디', 'pen', '펜 필기', 1, ''],
    [1, '4마디', 'mark', '표기', 1, ''],
    [1, '4–5마디', 'highlighter', '형광펜', 1, ''],
    [1, '5마디', 'memo', '스티커 메모', 1, '숨 크게'],
    [1, '5마디', 'pen', '펜 필기', 1, ''],
    [2, '6마디', 'memo', '스티커 메모', 1, '손글씨']
  ]);
  assert.deepEqual(out.items[0].measures, [0, 1, 2]); assert.deepEqual(out.items[4].measures, [3, 4]);
  assert.deepEqual([out.items[0].from, out.items[0].to], ['1', '3']);
  assert.equal(out.measures, 6); // measures 1–6 carry something
  assert.deepEqual(M.summary(pageOf, []), {items:[], measures:0});
  assert.deepEqual(M.summary(() => null, rows), {items:[], measures:0});
});

test('summary: a long memo text is cut, an empty text memo says so, a wide span is worded first–last', () => {
  const lay = read(voiceAndPiano()), pg = M.page(lay, 1, 2000 / 1500), [a, b] = pg.systems;
  const out = M.summary(() => pg, [
    memo(1, [.1, a.top, .2, .05], {text:'가'.repeat(60)}), memo(1, [.5, a.top, .2, .05], {text:'  '}),
    stroke(1, 'highlighter', [[.1, a.top], [.9, a.top], [.9, b.top + .04], [.1, b.top + .04]])
  ]);
  assert.equal(out.items[0].detail, '가'.repeat(40) + '…'); assert.equal(out.items[2].detail, '빈 메모');
  assert.deepEqual([out.items[1].kind, out.items[1].where], ['highlighter', '1–5마디']);
});
