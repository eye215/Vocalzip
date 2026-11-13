// 악보 기준 음역 (app/score-range-model.js): vocal part detection, sounding range, .mxl unzip and the comparison
// verdicts. Fixtures are written here (tests/fixtures is not committed). Node has no DOMParser, so a tiny XML
// parser exposes the same small element surface the extractor uses (children, localName, textContent, getAttribute).
const test = require('node:test'), assert = require('node:assert/strict'), zlib = require('node:zlib');
const R = require('../app/score-range-model.js');

function parseXml(src) {
  const root = {children:[], parts:[]}, stack = [root];
  const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const node = (name, attrs) => ({tagName:name, localName:name.replace(/^.*:/, ''), attrs, children:[], parts:[],
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    get textContent() { return this.parts.map(p => typeof p === 'string' ? p : p.textContent).join(''); }});
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(src));) {
    const top = stack.at(-1);
    if (m[1] != null) top.parts.push(m[1]);
    else if (m[2]) { assert.equal(top.tagName, m[2], 'well-formed fixture'); stack.pop(); }
    else if (m[3]) {
      const attrs = {}; for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
      const el = node(m[3], attrs); top.children.push(el); top.parts.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] != null) top.parts.push(decode(m[6]));
  }
  return {documentElement:root.children[0]};
}
const read = xml => R.read(xml, parseXml);

// ---- fixture builders ----
const note = (step, octave, {alter, lyric, chord, grace, cue, rest, staff, hidden} = {}) => rest
  ? '<note><rest/><duration>4</duration></note>'
  : '<note' + (hidden ? ' print-object="no"' : '') + '>' + (grace ? '<grace/>' : '') + (cue ? '<cue/>' : '') + (chord ? '<chord/>' : '') + '<pitch><step>' + step + '</step>' + (alter != null ? '<alter>' + alter + '</alter>' : '') + '<octave>' + octave + '</octave></pitch>' +
    (grace ? '' : '<duration>4</duration>') + (staff ? '<staff>' + staff + '</staff>' : '') + (lyric ? '<lyric number="1"><syllabic>single</syllabic><text>' + lyric + '</text></lyric>' : '') + '</note>';
const part = (id, measures, attrs = '') => '<part id="' + id + '">' + measures.map((m, i) => '<measure number="' + (i + 1) + '">' + (i === 0 ? '<attributes><divisions>4</divisions>' + attrs + '</attributes>' : '') + m + '</measure>').join('') + '</part>';
const scorePart = (id, name, extra = '') => '<score-part id="' + id + '"><part-name>' + name + '</part-name>' + extra + '</score-part>';
const score = (list, body, defaults = '') => '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
  '<score-partwise version="3.1">' + defaults + '<part-list>' + list.join('') + '</part-list>' + body.join('') + '</score-partwise>';
const piano = id => part(id, [note('C', 2, {staff:2}) + note('E', 2, {staff:2, chord:true}) + note('C', 6, {staff:1}) + note('E', 6, {staff:1, chord:true})], '<staves>2</staves>');

test('voice + piano: the piano (grand staff) is excluded and the sung part is picked', () => {
  const xml = score([scorePart('P1', 'Voice'), scorePart('P2', 'Piano')], [
    part('P1', [note('A', 3, {lyric:'la'}) + note('C', 5, {lyric:'la'}), note('B', 4, {lyric:'la'}) + note('E', 4)]), piano('P2')]);
  const r = read(xml);
  assert.equal(r.pick, 'P1'); assert.equal(r.ambiguous, false);
  const v = r.parts.find(p => p.id === 'P1'), p = r.parts.find(p => p.id === 'P2');
  assert.deepEqual([v.low, v.high, v.lowMidi, v.highMidi, v.lyrics, v.type], ['A3', 'C5', 57, 72, 3, 'vocal']);
  assert.equal(v.highMeasure, '1');
  assert.equal(p.type, 'piano'); assert.equal(p.staves, 2); assert.equal(p.high, 'E6');
});

test('Korean and unnamed parts: lyrics decide, a piano named only by MIDI program stays out', () => {
  const xml = score([scorePart('P1', '보컬'), scorePart('P2', '', '<midi-instrument id="P2-I1"><midi-channel>2</midi-channel><midi-program>1</midi-program></midi-instrument>')],
    [part('P1', [note('D', 4) + note('F', 5, {alter:1})]), part('P2', [note('C', 3) + note('G', 6)])]);
  const r = read(xml);
  assert.equal(r.pick, 'P1'); assert.equal(r.parts[0].high, 'F#5');
  assert.equal(r.parts[1].type, 'piano');
});

test('transposing part: <transpose> gives the sounding pitch (written D5 for a part a tone low sounds C5)', () => {
  const xml = score([scorePart('P1', 'Tenor Voice')], [part('P1', [note('D', 5, {lyric:'a'}) + note('E', 4, {lyric:'a'})], '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>')]);
  const v = read(xml).parts[0];
  assert.deepEqual([v.low, v.high, v.transposition], ['D4', 'C5', -2]);
  const octave = score([scorePart('P1', 'Tenor')], [part('P1', [note('C', 5, {lyric:'a'})], '<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>')]);
  assert.equal(read(octave).parts[0].high, 'C4');
  // A MusicXML 4 concert score is already at sounding pitch: transpose elements are ignored there.
  const concert = score([scorePart('P1', 'Voice')], [part('P1', [note('C', 5)], '<transpose><chromatic>-2</chromatic></transpose>')], '<defaults><concert-score/></defaults>');
  assert.equal(read(concert).parts[0].high, 'C5');
});

test('alter / octave edges: Cb, B#, double sharp and double flat are exact semitones', () => {
  const xml = score([scorePart('P1', 'Soprano')], [part('P1', [note('C', 5, {alter:-1}) + note('B', 4, {alter:1}) + note('F', 5, {alter:2}) + note('E', 3, {alter:-2})])]);
  const v = read(xml).parts[0];
  // Cb5 = B4 (71), B#4 = C5 (72), F##5 = G5 (79), Ebb3 = D3 (50)
  assert.deepEqual([v.lowMidi, v.highMidi, v.low, v.high], [50, 79, 'D3', 'G5']);
  const low = score([scorePart('P1', 'Bass')], [part('P1', [note('C', 2, {alter:-1, lyric:'o'}) + note('C', 4, {lyric:'o'})])]);
  assert.deepEqual([read(low).parts[0].low, read(low).parts[0].lowMidi], ['B1', 35]);
});

test('rests, grace, cue and hidden notes are ignored; tied notes count once as the same pitch', () => {
  const tie = '<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/></note>';
  const xml = score([scorePart('P1', 'Alto')], [part('P1', [note('', 0, {rest:true}) + note('E', 6, {grace:true}) + note('C', 3, {cue:true}) + note('D', 6, {hidden:true}) + tie + note('A', 4)])]);
  const v = read(xml).parts[0];
  assert.deepEqual([v.low, v.high, v.notes], ['G4', 'A4', 3]);
});

test('ambiguous: two named vocal parts (duet / SATB) are left for the owner to choose', () => {
  const xml = score([scorePart('P1', 'Soprano'), scorePart('P2', 'Alto'), scorePart('P3', 'Piano')], [
    part('P1', [note('G', 5, {lyric:'a'})]), part('P2', [note('C', 4, {lyric:'a'})]), piano('P3')]);
  const r = read(xml);
  assert.equal(r.pick, null); assert.equal(r.ambiguous, true);
  assert.deepEqual(r.parts.filter(p => p.type === 'vocal').map(p => p.high), ['G5', 'C4']);
});

test('unnamed single-line part beside a piano is a guess; chord-only and instrument parts are not vocal', () => {
  const guess = read(score([scorePart('P1', ''), scorePart('P2', 'Piano')], [part('P1', [note('E', 4) + note('A', 4)]), piano('P2')]));
  assert.deepEqual([guess.pick, guess.guess, guess.ambiguous], ['P1', true, false]);
  const chords = read(score([scorePart('P1', 'Voice'), scorePart('P2', 'Strings Pad')], [
    part('P1', [note('C', 4, {lyric:'a'})]), part('P2', [note('C', 4) + note('E', 4, {chord:true}) + note('G', 4, {chord:true})])]));
  assert.equal(chords.parts[1].type, 'chords'); assert.equal(chords.pick, 'P1');
  const sax = read(score([scorePart('P1', 'Alto Sax'), scorePart('P2', 'Guitar')], [part('P1', [note('C', 5)]), part('P2', [note('C', 3)])]));
  assert.deepEqual(sax.parts.map(p => p.type), ['instrument', 'instrument']);
  assert.equal(sax.pick, null); assert.equal(sax.ambiguous, true);
  const empty = read(score([scorePart('P1', 'Voice'), scorePart('P2', 'Chords')], [part('P1', [note('C', 4)]), part('P2', ['<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>' + note('', 0, {rest:true})])]));
  assert.equal(empty.parts[1].type, 'empty'); assert.equal(empty.pick, 'P1');
});

test('score-timewise is read too; other documents are rejected', () => {
  const xml = '<score-timewise><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><measure number="1"><part id="P1">' + note('F', 4) + note('B', 4, {alter:-1}) + '</part></measure></score-timewise>';
  assert.equal(read(xml).parts[0].high, 'A#4');
  assert.throws(() => read('<html><body/></html>'), /MusicXML/);
});

// ---- .mxl ----
function zip(files, {deflate = true} = {}) {
  const crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const local = [], central = []; let offset = 0;
  for (const [n, text] of files) {
    const name = Buffer.from(n), raw = Buffer.from(text), data = deflate ? zlib.deflateRawSync(raw) : raw, crc = crc32(raw), head = Buffer.alloc(30), dir = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(deflate ? 8 : 0, 8); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(name.length, 26);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(deflate ? 8 : 0, 10); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    local.push(head, name, data); central.push(dir, name); offset += 30 + name.length + data.length;
  }
  const d = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(d.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, d, end]);
}
test('.mxl: container.xml points at the score; deflated and stored entries; plain MusicXML passes through', async () => {
  const xml = score([scorePart('P1', 'Voice')], [part('P1', [note('C', 5, {lyric:'가'})])]);
  const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="lg/score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
  const decoy = score([scorePart('P1', 'Voice')], [part('P1', [note('C', 7)])]);
  assert.equal(await R.unzip(zip([['META-INF/container.xml', container], ['a-decoy.xml', decoy], ['lg/score.musicxml', xml]])), xml);
  assert.equal(await R.unzip(zip([['META-INF/container.xml', container], ['lg/score.musicxml', xml]], {deflate:false})), xml);
  assert.equal(await R.unzip(zip([['score.xml', xml]])), xml); // no container: first MusicXML entry
  assert.equal(await R.unzip(Buffer.from(xml)), xml);
  assert.equal(read(await R.unzip(zip([['META-INF/container.xml', container], ['lg/score.musicxml', xml]]))).parts[0].high, 'C5');
  await assert.rejects(R.unzip(zip([['readme.txt', 'x']])), /MusicXML/);
});

// ---- comparison ----
const ref = R.reference({low:57, high:72, source:'score', scoreId:'s1', part:'Voice', partId:'P1', now:1}); // A3–C5
const v2 = (valid, instant, stable) => ({v:2, metrics:{range:{validHigh:valid == null ? null : {note:R.noteName(valid), cents:valid * 100 + 12, t:30.5, times:[{t:30.5}]},
  stableHigh:stable == null ? null : {note:R.noteName(stable), cents:stable * 100}, instantaneous:instant == null ? null : {note:R.noteName(instant), cents:instant * 100 - 20, t:61.2}}}});
test('reference record: names, MIDI numbers, source and confirmation; low above high is refused', () => {
  assert.deepEqual(ref, {version:1, low:'A3', high:'C5', lowMidi:57, highMidi:72, source:'score', scoreId:'s1', part:'Voice', partId:'P1', transposition:0, confirmedByUser:true, updatedAt:1});
  assert.deepEqual(R.reference({low:'48', high:'84', source:'manual', now:2}), {version:1, low:'C3', high:'C6', lowMidi:48, highMidi:84, source:'manual', confirmedByUser:true, updatedAt:2});
  assert.throws(() => R.reference({low:70, high:60, source:'manual'}), /최저음/);
});
test('verdicts: 일치 within ±1 semitone, otherwise exact semitones above / below', () => {
  const c = (valid, instant, stable) => R.compare(ref, v2(valid, instant, stable), {reliable:true});
  assert.deepEqual([c(72).verdict, R.verdictText(c(72)), c(72).diff], ['match', '일치', 0]);
  assert.equal(R.verdictText(c(73)), '일치'); assert.equal(R.verdictText(c(71)), '일치');
  assert.deepEqual([c(76).verdict, R.verdictText(c(76))], ['above', '악보보다 4반음 높음']);
  assert.deepEqual([c(69).verdict, R.verdictText(c(69))], ['below', '악보보다 3반음 낮음']);
  assert.deepEqual(c(72, 73, 70).rows.map(r => [r.key, r.note, R.diffText(r.diff)]), [['valid', 'C5', '악보와 같은 음'], ['stable', 'A#4', '2반음 낮음'], ['instant', 'C#5', '1반음 높음']]);
});
test('instant max ≥ 3 semitones over the score while the valid max fits → 재확인 필요; never when valid is above', () => {
  assert.equal(R.compare(ref, v2(72, 75), {reliable:true}).recheck, true);
  assert.equal(R.compare(ref, v2(73, 77), {reliable:true}).recheck, true);
  assert.equal(R.compare(ref, v2(72, 74), {reliable:true}).recheck, false);
  assert.equal(R.compare(ref, v2(75, 79), {reliable:true}).recheck, false);
  const c = R.compare(ref, v2(72, 76), {reliable:true});
  assert.equal(c.rows.find(r => r.key === 'instant').point.t, 61.2); // the timestamp for tap-to-listen is kept
  assert.equal(c.rows.find(r => r.key === 'valid').point.cents, 7212); // measured values are not altered
});
test('판정 보류: low confidence, no valid note, v1 result; nothing without a reference', () => {
  assert.deepEqual([R.compare(ref, v2(80, 82), {reliable:false}).state, R.compare(ref, v2(80, 82), {reliable:false}).reason], ['hold', 'confidence']);
  assert.equal(R.verdictText(R.compare(ref, v2(80), {reliable:false})), '판정 보류');
  assert.equal(R.compare(ref, v2(null, 80), {reliable:true}).reason, 'no-valid');
  const v1 = {v:1, metrics:{range:{high:'C5', highCents:7200, peak:'E5'}}};
  assert.deepEqual([R.compare(ref, v1, {reliable:true}).state, R.compare(ref, v1, {reliable:true}).reason], ['hold', 'version']);
  assert.equal(R.compare(ref, null).state, 'no-analysis');
  assert.equal(R.compare(null, v2(72)).state, 'no-reference');
});

// ---- 악보 조표로 키 제안 (keyOf) ----
const keyOf = xml => R.readKey(xml, parseXml);
test('key signature: two sharps is D or Bm; the notes decide which one is likely; no signature gives null', () => {
  const key = (fifths, mode = '') => '<key><fifths>' + fifths + '</fifths>' + (mode ? '<mode>' + mode + '</mode>' : '') + '</key>';
  // Melody resting on D and ending on D: D major.
  const major = score([scorePart('P1', 'Voice')], [part('P1', [note('D', 4) + note('F', 4, {alter:1}) + note('A', 4) + note('D', 5), note('E', 4) + note('D', 4) + note('D', 4)], key(2))]);
  assert.deepEqual(keyOf(major), {fifths:2, major:'D', minor:'Bm', likely:'major', changes:0});
  // The same signature with a melody on B, ending on B: B minor.
  const minor = score([scorePart('P1', 'Voice')], [part('P1', [note('B', 3) + note('D', 4) + note('F', 4, {alter:1}) + note('B', 4), note('C', 4, {alter:1}) + note('B', 3) + note('B', 3)], key(2))]);
  assert.equal(keyOf(minor).likely, 'minor');
  // The file's own <mode> wins over the notes.
  assert.equal(keyOf(minor.replace('</fifths>', '</fifths><mode>major</mode>')).likely, 'major');
  // Flats: three flats is Eb or Cm, named like the 원키 choices.
  const flats = keyOf(score([scorePart('P1', 'Voice')], [part('P1', [note('G', 4) + note('F', 4)], key(-3))]));
  assert.deepEqual([flats.major, flats.minor, flats.likely], ['D#/Eb', 'Cm', null]);
  // No key signature at all (some scans): nothing is suggested.
  assert.equal(keyOf(score([scorePart('P1', 'Voice')], [part('P1', [note('C', 4)])])), null);
});
test('key signature: a later different signature is counted as a key change; other parts repeating it are not', () => {
  const body = m => '<measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key></attributes>' + note('C', 4) + '</measure>' +
    (m ? '<measure number="2"><attributes><key><fifths>1</fifths></key></attributes>' + note('G', 4) + '</measure>' : '');
  const two = '<?xml version="1.0"?><score-partwise version="3.1"><part-list>' + scorePart('P1', 'Voice') + scorePart('P2', 'Piano') + '</part-list><part id="P1">' + body(true) + '</part><part id="P2">' + body(true) + '</part></score-partwise>';
  assert.deepEqual([keyOf(two).fifths, keyOf(two).major, keyOf(two).changes], [0, 'C', 1]);
});
