// 마디 ↔ MR 맞추기 (app/score-sync-model.js): anchors tapped along the MR → the time of every measure.
// Interpolation by measure length, repeats (a measure sounds more than once), time-signature changes, how far the
// model dares to go past the taps, the stored form, and what a saved sync means once the MR or the conversion changed.
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../app/score-sync-model.js');
const M = require('../app/score-measure-model.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);
/** A score of `beats.length` measures; lines: how many measures per line. */
const seqOf = (beats, perLine = 4) => beats.map((b, i) => ({ord:i, index:i, number:String(i + 1), beats:b, page:1 + Math.floor(i / (perLine * 2)), system:Math.floor(i / perLine) % 2, first:i % perLine === 0}));
const four = n => seqOf(Array(n).fill(4));
const A = list => list.map(([t, m]) => ({t, m}));
const FILE = {id:'mr-1', kind:'file', r2Key:'u/x/mr-1/original.m4a'};

test('measures between two anchors share the time evenly', () => {
  const m = S.build(four(8), A([[10, 0], [18, 4]]));
  assert.deepEqual(m.spans.map(s => [s.m, s.t0, s.t1]), [[0, 10, 12], [1, 12, 14], [2, 14, 16], [3, 16, 18], [4, 18, 20]]);
  near(m.timeOf(2), 14); assert.equal(m.timeOf(6), null); assert.equal(m.occurrences(2), 1); assert.equal(m.occurrences(6), 0);
  assert.equal(m.measureAt(15.99).m, 2); assert.equal(m.measureAt(16).m, 3);
  assert.deepEqual(m.rangeOf(1, 3), {start:12, end:18, lead:2, from:1, to:3, complete:true, occurrence:0, occurrences:1});
  assert.equal(m.rangeOf(6), null);
});

test('one tap per measure keeps every tapped time exactly', () => {
  const taps = A([[1.2, 0], [3.31, 1], [5.5, 2], [7.48, 3]]), m = S.build(four(4), taps);
  taps.slice(0, 3).forEach((a, i) => { near(m.timeOf(a.m), a.t); near(m.spans[i].t1, taps[i + 1].t); });
  // The last measure is as long as the pace just before it says (7.48 − 5.5 for four quarters).
  near(m.spans.at(-1).t1, 7.48 + 1.98); assert.equal(m.spans.at(-1).soft, true);
});

test('a time-signature change: time is shared by the length of each measure in quarter notes', () => {
  // 4/4, 4/4, 2/4, 3/4, 4/4 — tapped only at the first and the last: 13 quarters in 13 s.
  const m = S.build(seqOf([4, 4, 2, 3, 4]), A([[2, 0], [15, 4]]));
  assert.deepEqual(m.spans.map(s => [s.m, s.t0, s.t1]), [[0, 2, 6], [1, 6, 10], [2, 10, 12], [3, 12, 15], [4, 15, 19]]);
});

test('before the first and after the last anchor: one measure only, the rest is unknown', () => {
  const m = S.build(four(10), A([[20, 3], [22, 4], [24, 5]]));
  assert.deepEqual(m.spans.map(s => [s.m, s.t0, s.t1, !!s.soft]), [[2, 18, 20, true], [3, 20, 22, false], [4, 22, 24, false], [5, 24, 26, true]]);
  for (const t of [0, 17.99, 26, 26.5, 300, NaN, -1]) assert.equal(m.measureAt(t), null);
  assert.equal(m.timeOf(1), null); assert.equal(m.timeOf(6), null);
  assert.equal(m.rangeOf(1, 3), null);
  // A range that runs past what is known stops there and says so.
  assert.deepEqual([m.rangeOf(4, 8).to, m.rangeOf(4, 8).end, m.rangeOf(4, 8).complete], [5, 26, false]);
  // The measure before the first anchor is left out when the MR would have to start before 0.
  assert.deepEqual(S.build(four(4), A([[.3, 1], [2.3, 2]])).spans.map(s => s.m), [1, 2]);
  assert.deepEqual(S.build(four(4), A([[1.8, 1], [3.8, 2]])).spans.map(s => [s.m, s.t0]), [[0, 0], [1, 1.8], [2, 3.8]]);
  // One anchor alone has no pace: its start is known, nothing else.
  const one = S.build(four(4), A([[5, 2]]));
  assert.equal(one.timeOf(2), 5); assert.equal(one.measureAt(5.1), null); assert.equal(one.rangeOf(2), null);
});

test('a repeat: the measure sounds twice, in play order', () => {
  // 1 2 3 4 | back to 2 | 2 3 4 5
  const m = S.build(four(6), A([[0, 0], [2, 1], [4, 2], [6, 3], [8, 1], [10, 2], [12, 3], [14, 4]]));
  assert.equal(m.occurrences(1), 2); assert.equal(m.occurrences(0), 1); assert.equal(m.occurrences(4), 1);
  assert.equal(m.timeOf(1), 2); assert.equal(m.timeOf(1, 1), 8); assert.equal(m.timeOf(1, 2), null);
  assert.deepEqual([m.measureAt(7).m, m.measureAt(7).occurrence], [3, 0]);
  assert.deepEqual([m.measureAt(9).m, m.measureAt(9).occurrence], [1, 1]);
  const firstTime = m.rangeOf(1, 3), again = m.rangeOf(1, 3, 1);
  assert.deepEqual([firstTime.start, firstTime.end, firstTime.lead, firstTime.occurrences], [2, 8, 2, 2]);
  assert.deepEqual([again.start, again.end, again.lead, again.occurrence], [8, 14, 2, 1]);
  // A range across the jump stops at the jump: 3–5 the first time is only 3–4.
  assert.deepEqual([m.rangeOf(2, 4).to, m.rangeOf(2, 4).end, m.rangeOf(2, 4).complete], [3, 8, false]);
  assert.deepEqual([m.rangeOf(2, 4, 1).to, m.rangeOf(2, 4, 1).complete], [4, true]);
});

test('a jump back after taps at line starts only: the tapped measure gets one measure, the rest is unknown', () => {
  // Lines of four. Tapped: line 1 (m0), line 2 (m4), then a jump back to m1 after the whole second line was played.
  const m = S.build(four(8), A([[0, 0], [8, 4], [16, 1], [18, 2]]));
  assert.deepEqual(m.spans.slice(0, 5).map(s => [s.m, s.t0, s.t1]), [[0, 0, 2], [1, 2, 4], [2, 4, 6], [3, 6, 8], [4, 8, 10]]);
  assert.equal(m.spans[4].soft, true);
  assert.equal(m.measureAt(12), null); // measures 6–8 were played here, but nothing says when
  assert.deepEqual([m.measureAt(16.5).m, m.measureAt(16.5).occurrence], [1, 1]);
  assert.equal(m.rangeOf(1, 2, 1).lead, null); // nothing known just before the jump target → 2 s lead-in
  assert.equal(S.loopStart(m.rangeOf(1, 2, 1)), 14); assert.equal(S.loopStart(m.rangeOf(1, 2, 1), false), 16);
  assert.equal(S.loopStart(m.rangeOf(1, 2)), 0); // one measure (2 s) before 2 s
  assert.equal(S.loopStart({start:1, end:3, lead:null}), 0); // never before the start of the MR
});

test('a far skip ahead played much faster than the rest is a jump (coda), not twenty short measures', () => {
  const m = S.build(four(40), A([[0, 0], [2, 1], [4, 2], [6, 3], [8, 30], [10, 31], [12, 32]]));
  assert.equal(m.timeOf(10), null); assert.equal(m.timeOf(30), 8);
  assert.deepEqual([m.spans[3].m, m.spans[3].t0, m.spans[3].t1], [3, 6, 8]);
  // A slow section is not a jump: twice as slow, still music.
  const slow = S.build(four(12), A([[0, 0], [8, 4], [24, 8], [32, 12 - 1]]));
  near(slow.timeOf(6), 16);
});

test('전체 앞당기기/늦추기 moves every time by the same amount', () => {
  const taps = A([[10, 0], [12, 1], [14, 2]]);
  assert.deepEqual(S.build(four(3), taps, {offset:-.15}).spans.map(s => s.t0).map(t => Math.round(t * 100) / 100), [9.85, 11.85, 13.85]);
  assert.equal(S.build(four(3), taps, {offset:.05}).measureAt(12.02).m, 0);
});

test('invalid input is refused', () => {
  const seq = four(4);
  assert.equal(S.check(A([[1, 0], [2, 1]]), 4), '');
  assert.equal(S.check([], 4), 'empty'); assert.equal(S.check(null, 4), 'empty');
  assert.equal(S.check(A([[2, 0], [2, 1]]), 4), 'time');      // not later
  assert.equal(S.check(A([[2, 0], [1, 1]]), 4), 'time');      // earlier
  assert.equal(S.check(A([[-1, 0]]), 4), 'time'); assert.equal(S.check(A([[NaN, 0]]), 4), 'time'); assert.equal(S.check([{t:'1', m:0}], 4), 'time');
  assert.equal(S.check(A([[1, 4]]), 4), 'measure'); assert.equal(S.check(A([[1, -1]]), 4), 'measure'); assert.equal(S.check(A([[1, 1.5]]), 4), 'measure');
  assert.equal(S.check([null], 4), 'shape');
  assert.equal(S.check(A([[1, 0], [200, 1]]), 4, {duration:180}), 'long'); assert.equal(S.check(A([[1, 0], [180.2, 1]]), 4, {duration:180}), '');
  assert.equal(S.check(Array.from({length:S.MAX_ANCHORS + 1}, (_, i) => ({t:i, m:0})), 4), 'many');
  assert.equal(S.build(seq, A([[2, 0], [1, 1]])), null); assert.equal(S.build(seq, A([[1, 9]])), null);
  assert.equal(S.build([], A([[1, 0]])), null); assert.equal(S.build(null, A([[1, 0]])), null); assert.equal(S.build(seq, []), null);
});

test('the stored form is a short list of whole numbers and reads back the same', () => {
  const taps = A([[2.5, 0], [4.5, 1], [6.6, 2], [9, 5], [11.25, 6], [13, 1], [15.04, 2]]);
  const packed = S.pack(taps);
  assert.deepEqual(packed, [-1, 250, 200, 210, -6, 240, 225, -2, 175, 204]);
  assert.deepEqual(S.unpack(packed), taps);
  assert.deepEqual(S.pack(A([[0, 3]])), [-4, 0]); assert.deepEqual(S.unpack([-4, 0]), A([[0, 3]]));
  assert.equal(S.pack(A([[1, 0], [1.004, 1]])), null); // the same hundredth
  for (const bad of [null, [], [5], [-1], [-1, -2, 5], [-1, 5, 0], [-1, 5, 1.5], [-1, 5, 'x'], Array(S.MAX_ANCHORS * 2 + 2).fill(1)]) assert.equal(S.unpack(bad), null);
  // 600 measures tapped one by one stay small.
  const many = Array.from({length:600}, (_, i) => ({t:3 + i * 1.87, m:i}));
  assert.ok(JSON.stringify(S.pack(many)).length < 3000);

  const stored = S.entry({anchors:taps, count:8, duration:180.337, offset:-.1, now:1234});
  assert.deepEqual(stored, {v:1, n:8, d:18034, a:packed, o:-10, at:1234});
  assert.deepEqual(S.read(stored), {anchors:taps, count:8, duration:180.34, offset:-.1, at:1234});
  assert.equal('o' in S.entry({anchors:taps, count:8, duration:180}), false);
  assert.equal(S.entry({anchors:taps, count:6, duration:180}), null);  // measure 7 does not exist in a score of 6
  assert.equal(S.entry({anchors:taps, count:8, duration:10}), null);   // taps after the end of the MR
  assert.equal(S.entry({anchors:taps, count:8, duration:0}), null);
  assert.equal(S.entry({anchors:taps, count:8, duration:180, offset:99}).o, S.MAX_OFFSET * 100);
  for (const bad of [null, {}, {...stored, v:2}, {...stored, n:0}, {...stored, a:[5]}, {...stored, n:3}, {...stored, d:0}]) assert.equal(S.read(bad), null);
});

test('a saved sync is used only for the MR and the conversion it was made for', () => {
  const stored = S.entry({anchors:A([[1, 0], [3, 1], [5, 2]]), count:8, duration:180, now:5});
  const tracks = [FILE, {id:'mr-2', kind:'file', r2Key:'k2'}, {id:'yt', kind:'youtube', videoId:'abcdefghijk'}];
  const ok = S.status({'mr-1':stored}, FILE, {count:8, tracks});
  assert.equal(ok.state, 'ok'); assert.equal(ok.data.anchors.length, 3);
  assert.deepEqual(S.status({'mr-1':stored}, FILE, {count:9, tracks}), {state:'stale', why:'measures'});      // converted again
  assert.deepEqual(S.status({'mr-1':stored}, FILE, {count:8, tracks, duration:170}), {state:'stale', why:'length'});
  assert.equal(S.status({'mr-1':stored}, FILE, {count:8, tracks, duration:181.5}).state, 'ok'); // browsers differ a little
  assert.deepEqual(S.status({'mr-1':{...stored, a:[1]}}, FILE, {count:8, tracks}), {state:'stale', why:'broken'});
  // The MR was deleted: the other MR of the song says 다시 맞춰야 해요 instead of quietly having nothing.
  const gone = [{...FILE, deleted:true}, tracks[1]];
  assert.deepEqual(S.status({'mr-1':stored}, tracks[1], {count:8, tracks:gone}), {state:'stale', why:'mr'});
  assert.deepEqual(S.status({'mr-1':stored}, null, {count:8, tracks:[]}), {state:'stale', why:'mr'});
  // Another MR that still exists has one: this MR simply has none yet.
  assert.deepEqual(S.status({'mr-1':stored}, tracks[1], {count:8, tracks}), {state:'none', other:true});
  assert.deepEqual(S.status(null, FILE, {count:8, tracks}), {state:'none', other:false});
  assert.deepEqual(S.status({}, tracks[2], {count:8, tracks}), {state:'none', other:false});
});

test('saving keeps the syncs of MRs that still exist, up to the cap', () => {
  const e = at => ({v:1, n:4, d:1000, a:[-1, 100, 100], at});
  const tracks = ['a', 'b', 'c', 'd', 'e'].map(id => ({id, kind:'file', r2Key:'k' + id}));
  let out = S.withEntry({a:e(1), gone:e(2)}, 'b', e(3), tracks);
  assert.deepEqual([Object.keys(out.map), out.over], [['a', 'b'], '']); // the sync of a deleted MR is dropped
  out = S.withEntry({a:e(4), b:e(1), c:e(2), d:e(3)}, 'e', e(9), tracks);
  assert.equal(out.over, 'b'); assert.equal(Object.keys(out.map).length, 5); // the caller asks before dropping the oldest
  out = S.withEntry({a:e(4), b:e(1), c:e(2), d:e(3)}, 'a', e(9), tracks);
  assert.deepEqual([out.over, out.map.a.at, Object.keys(out.map).length], ['', 9, 4]); // saving again replaces its own
  assert.deepEqual(Object.keys(S.withEntry(null, 'a', e(1), tracks).map), ['a']);
});

test('the next tap: the next measure, or the first measure of the next line', () => {
  const seq = four(10); // lines of four: 0–3, 4–7, 8–9
  assert.equal(S.nextTarget(seq, -1), 0); assert.equal(S.nextTarget(seq, 0), 1); assert.equal(S.nextTarget(seq, 9), null);
  assert.equal(S.nextTarget(seq, -1, true), 0); assert.equal(S.nextTarget(seq, 0, true), 4); assert.equal(S.nextTarget(seq, 5, true), 8); assert.equal(S.nextTarget(seq, 8, true), null);
  assert.equal(S.label(seq, 2), '3마디'); assert.equal(S.label(seq, 2, 4), '3–5마디');
  assert.equal(S.label([{number:'2', last:'4'}], 0), '2–4마디'); assert.equal(S.label(seq, 99), '');
});

// ---- the measure lengths come from the conversion (app/score-measure-model.js) ----
function parseXml(src) {
  const root = {children:[], parts:[]}, stack = [root];
  const node = (name, attrs) => ({tagName:name, localName:name.replace(/^.*:/, ''), attrs, children:[], parts:[],
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    get textContent() { return this.parts.map(p => typeof p === 'string' ? p : p.textContent).join(''); }});
  const re = /<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(src));) {
    const top = stack.at(-1);
    if (m[1]) stack.pop();
    else if (m[2]) { const attrs = {}; for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2]; const el = node(m[2], attrs); top.children.push(el); top.parts.push(el); if (!m[4]) stack.push(el); }
    else if (m[5] != null) top.parts.push(m[5]);
  }
  return {documentElement:root.children[0]};
}
test('sequence(): every measure box in file order with its length, page, line and line start', () => {
  const time = (b, t) => '<time><beats>' + b + '</beats><beat-type>' + t + '</beat-type></time>';
  const sys = (attrs, top) => '<print' + attrs + '><system-layout><system-margins><left-margin>0</left-margin><right-margin>0</right-margin></system-margins>' + top + '</system-layout></print>';
  const note = d => '<note><pitch><step>C</step><octave>4</octave></pitch><duration>' + d + '</duration></note>';
  const xml = '<?xml version="1.0"?><score-partwise><defaults><page-layout><page-height>2000</page-height><page-width>1500</page-width></page-layout></defaults><part-list><score-part id="P1"/></part-list><part id="P1">' +
    '<measure number="0" implicit="yes" width="100">' + sys('', '<top-system-distance>100</top-system-distance>') + '<attributes><divisions>2</divisions>' + time(4, 4) + '</attributes>' + note(2) + '</measure>' + // a one-quarter pickup
    '<measure number="1" width="300">' + note(8) + '</measure>' +
    '<measure number="2" width="200"><attributes>' + time(6, 8) + '</attributes>' + note(6) + '</measure>' +
    '<measure number="3" width="300">' + sys(' new-system="yes"', '<system-distance>120</system-distance>') + '<attributes><measure-style><multiple-rest>3</multiple-rest></measure-style></attributes>' + note(6) + '</measure>' +
    '<measure number="6" width="300"><attributes>' + time('3+2', 8) + '</attributes>' + note(5) + '</measure>' +
    '<measure number="7" width="300">' + sys(' new-page="yes"', '<top-system-distance>100</top-system-distance>') + '<attributes>' + time(2, 2) + '</attributes>' + note(8) + '</measure>' +
    '</part></score-partwise>';
  const seq = M.sequence(M.read(xml, parseXml));
  assert.deepEqual(seq.map(m => [m.ord, m.number, m.last, m.beats, m.page, m.system, m.first]), [
    [0, '0', undefined, 1, 1, 0, true], [1, '1', undefined, 4, 1, 0, false], [2, '2', undefined, 3, 1, 0, false],
    [3, '3', '5', 9, 1, 1, true], [4, '6', undefined, 2.5, 1, 1, false], [5, '7', undefined, 4, 2, 0, true]]);
  assert.deepEqual(M.sequence(null), []);
  // Tapped at the pickup and at the last measure: 19.5 quarters in 39 s → the 6/8 bar is 6 s, the three-bar rest 18 s.
  const m = S.build(seq, A([[1, 0], [40, 5]]));
  assert.deepEqual(m.spans.map(s => [s.m, s.t0, s.t1]), [[0, 1, 3], [1, 3, 11], [2, 11, 17], [3, 17, 35], [4, 35, 40], [5, 40, 48]]);
  assert.equal(S.label(seq, 3), '3–5마디');
});
