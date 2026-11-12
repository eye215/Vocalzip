/* 악보 기준 음역 (score-based pitch range): pure helpers, also loaded by the Node tests.
 * - unzip(): the converted score is a compressed MusicXML (.mxl = zip). A tiny zip reader with the browser's own
 *   DecompressionStream('deflate-raw') — no library. A plain MusicXML file is passed through.
 * - parts(doc): every part of a parsed MusicXML document (DOMParser in the app) with its sounding range, and which
 *   one is most likely the sung part. Piano/grand-staff and chord parts are never chosen automatically.
 * - compare(ref, analysis): the score's highest note vs the recording's measured highest notes. Measured values are
 *   never changed to fit the score; low confidence or old (v1) results are 판정 보류.
 * Pitch math is exact semitones (MIDI numbers); note names use sharps like the pitch analysis (C#5, not Db5). */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipScoreRange = api; })(globalThis, () => {
'use strict';
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STEP = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
const noteName = midi => NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
const MAX_BYTES = 30 * 1024 * 1024;

// ---------- .mxl (zip) ----------
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw Error('이 브라우저는 압축된 악보를 풀 수 없어요. 최신 브라우저에서 다시 시도해 주세요.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}
/** Text of the MusicXML score inside a .mxl (or the text itself when the file is not zipped). */
async function unzip(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.length > MAX_BYTES) throw Error('악보 파일이 너무 커요.');
  if (!(u8[0] === 0x50 && u8[1] === 0x4b)) return decodeText(u8);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let end = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('압축된 악보 파일을 읽지 못했어요.');
  const count = dv.getUint16(end + 10, true), entries = [];
  let p = dv.getUint32(end + 16, true);
  for (let n = 0; n < count && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50; n++) {
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    entries.push({method:dv.getUint16(p + 10, true), size:dv.getUint32(p + 20, true), full:dv.getUint32(p + 24, true), offset:dv.getUint32(p + 42, true),
      name:new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen))});
    p += 46 + nameLen + extra + comment;
  }
  const read = async e => {
    if (e.full > MAX_BYTES) throw Error('악보 파일이 너무 커요.');
    if (dv.getUint32(e.offset, true) !== 0x04034b50) throw Error('압축된 악보 파일이 손상됐어요.');
    const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true), data = u8.subarray(start, start + e.size);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data);
    throw Error('지원하지 않는 압축 방식이에요.');
  };
  const container = entries.find(e => e.name === 'META-INF/container.xml');
  let target = null;
  if (container) {
    const path = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/.exec(decodeText(await read(container)))?.[1];
    target = entries.find(e => e.name === path);
  }
  target ||= entries.find(e => !e.name.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(e.name));
  if (!target) throw Error('압축 파일 안에서 MusicXML 악보를 찾지 못했어요.');
  return decodeText(await read(target));
}

// ---------- MusicXML parts ----------
// Works on DOMParser elements and on any tree with the same small surface (children, localName/tagName,
// textContent, getAttribute) so the Node tests can use a tiny parser.
const local = el => String(el.localName || el.tagName || '').replace(/^.*:/, '');
const kids = (el, name) => el ? [...el.children].filter(c => !name || local(c) === name) : [];
const first = (el, name) => kids(el, name)[0] || null;
const text = (el, name) => { const x = name ? first(el, name) : el; return x ? String(x.textContent || '').trim() : ''; };

const VOCAL = /voice|vocal|vox|soprano|mezzo|alto|contralto|tenor|baritone|singer|melody|lead\s*(voice|vocal)|chorus|choir|보컬|노래|멜로디|소프라노|메조|알토|테너|바리톤|목소리|가창|솔로|solo/i;
const INSTRUMENT = /piano|pno|pf\.|klavier|keyboard|keys|organ|synth|harp|guitar|gtr|ukulele|banjo|mandolin|violin|viola|cello|contrabass|double\s*bass|bass\s*guitar|e\.?\s*bass|electric\s*bass|string|drum|percussion|perc\.|timpani|marimba|xylophone|vibraphone|glockenspiel|bells|flute|piccolo|clarinet|oboe|bassoon|sax|trumpet|horn|trombone|tuba|accordion|harmonica|피아노|건반|키보드|오르간|신스|기타|베이스\s*기타|드럼|반주|바이올린|첼로|플루트|색소폰|트럼펫|하모니카/i;

function partInfo(scorePart) {
  const instrument = kids(scorePart, 'score-instrument');
  const programs = kids(scorePart, 'midi-instrument').map(m => Number(text(m, 'midi-program'))).filter(Number.isFinite);
  return {
    id:scorePart.getAttribute('id') || '',
    name:text(scorePart, 'part-name') || text(first(scorePart, 'part-name-display'), 'display-text'),
    abbr:text(scorePart, 'part-abbreviation'),
    instrument:instrument.map(i => text(i, 'instrument-name')).filter(Boolean).join(', '),
    sound:instrument.map(i => text(i, 'instrument-sound')).filter(Boolean).join(','),
    programs
  };
}
function transposeOf(el) { // semitones from written to sounding pitch
  return (Number(text(el, 'chromatic')) || 0) + 12 * (Number(text(el, 'octave-change')) || 0);
}
/** Every part with its sounding range and a guess of which one is sung. */
function parts(doc) {
  const root = doc?.documentElement || doc;
  const kind = root && local(root);
  if (!root || doc.querySelector?.('parsererror') || !['score-partwise', 'score-timewise'].includes(kind)) throw Error('MusicXML 악보 형식이 아니에요.');
  const concert = !!first(first(root, 'defaults'), 'concert-score'); // MusicXML 4 concert scores are already sounding pitch
  const info = kids(first(root, 'part-list'), 'score-part').map(partInfo);
  // part id → the measure contents of that part, in order (partwise: part>measure, timewise: measure>part)
  const streams = new Map(info.map(p => [p.id, []]));
  if (kind === 'score-partwise') for (const part of kids(root, 'part')) { const id = part.getAttribute('id') || ''; if (!streams.has(id)) streams.set(id, []); for (const m of kids(part, 'measure')) streams.get(id).push({el:m, number:m.getAttribute('number')}); }
  else for (const m of kids(root, 'measure')) for (const part of kids(m, 'part')) { const id = part.getAttribute('id') || ''; if (!streams.has(id)) streams.set(id, []); streams.get(id).push({el:part, number:m.getAttribute('number')}); }
  const out = [];
  for (const [id, measures] of streams) {
    const meta = info.find(p => p.id === id) || {id, name:'', abbr:'', instrument:'', sound:'', programs:[]};
    let staves = 1, notes = 0, chords = 0, lyrics = 0, low = null, high = null, transposition = 0;
    const shift = {}; // staff number ('' = all staves) → semitones
    for (const {el, number} of measures) {
      for (const node of kids(el)) {
        const name = local(node);
        if (name === 'attributes') {
          const s = Number(text(node, 'staves')); if (s > staves) staves = s;
          if (!concert) for (const t of kids(node, 'transpose')) { shift[t.getAttribute('number') || ''] = transposeOf(t); if (transposeOf(t)) transposition = transposeOf(t); }
          continue;
        }
        if (name !== 'note') continue;
        if (first(node, 'rest') || first(node, 'grace') || first(node, 'cue') || node.getAttribute('print-object') === 'no') continue;
        const pitch = first(node, 'pitch');
        if (!pitch) continue; // unpitched (percussion) notes
        const step = STEP[text(pitch, 'step').toUpperCase()], octave = Number(text(pitch, 'octave'));
        if (step == null || !Number.isFinite(octave)) continue;
        const staff = text(node, 'staff');
        const midi = (octave + 1) * 12 + step + Math.round(Number(text(pitch, 'alter')) || 0) + (shift[staff] ?? shift[''] ?? 0);
        notes++;
        if (first(node, 'chord')) chords++;
        if (kids(node, 'lyric').some(l => text(l, 'text'))) lyrics++;
        if (!low || midi < low.midi) low = {midi, measure:number};
        if (!high || midi > high.midi) high = {midi, measure:number};
      }
    }
    const label = [meta.name, meta.abbr, meta.instrument].join(' ');
    const keyboard = staves >= 2 || /^keyboard\./.test(meta.sound) || meta.programs.some(p => p >= 1 && p <= 24);
    const voiceSound = /^voice\./.test(meta.sound);
    const vocalName = VOCAL.test(label) || voiceSound;
    const chordShare = notes ? chords / notes : 0;
    let type;
    if (!notes) type = 'empty';
    else if (keyboard && !voiceSound) type = 'piano';
    else if (chordShare >= 0.5) type = 'chords';
    else if (lyrics || voiceSound || (vocalName && !INSTRUMENT.test(label))) type = 'vocal';
    else if (INSTRUMENT.test(label)) type = 'instrument'; // a plain "Bass" without lyrics stays unknown
    else type = 'unknown';
    out.push({id, name:meta.name || meta.instrument || meta.abbr || id, instrument:meta.instrument, staves, notes, lyrics,
      chordShare:Math.round(chordShare * 100) / 100, transposition, type,
      lowMidi:low?.midi ?? null, highMidi:high?.midi ?? null, low:low ? noteName(low.midi) : null, high:high ? noteName(high.midi) : null,
      lowMeasure:low?.measure ?? null, highMeasure:high?.measure ?? null});
  }
  return out;
}
/** Which part to preselect. Only an unambiguous vocal part (or the single plain melody line) is picked;
 * otherwise the owner chooses. The owner confirms in every case before anything is saved. */
function choose(list) {
  const vocal = list.filter(p => p.type === 'vocal');
  if (vocal.length === 1) return {pick:vocal[0].id, ambiguous:false, guess:false};
  if (vocal.length > 1) {
    const sung = vocal.filter(p => p.lyrics);
    if (sung.length === 1 && vocal.every(p => p === sung[0] || !VOCAL.test(p.name))) return {pick:sung[0].id, ambiguous:false, guess:false};
    return {pick:null, ambiguous:true, guess:false};
  }
  const plain = list.filter(p => p.type === 'unknown');
  if (plain.length === 1) return {pick:plain[0].id, ambiguous:false, guess:true};
  return {pick:null, ambiguous:true, guess:false};
}
/** Parse helper for the app (DOMParser) — the tests pass their own parser. */
function read(xml, parse = s => new DOMParser().parseFromString(s, 'application/xml')) {
  const list = parts(parse(xml)), choice = choose(list);
  return {parts:list, ...choice};
}

// ---------- comparison ----------
const midiOf = p => p && Number.isFinite(Number(p.cents)) ? Math.round(Number(p.cents) / 100) : null;
const MATCH = 1, RECHECK = 3;
/** Exact semitone wording of a difference to the score's highest note. */
function diffText(d) {
  if (d == null) return '';
  if (d === 0) return '악보와 같은 음';
  return Math.abs(d) + '반음 ' + (d > 0 ? '높음' : '낮음');
}
/** ref: song.vocalRange; a: a saved analysis summary; reliable: VZ.analysisReliable(a). */
function compare(ref, a, {reliable = false} = {}) {
  if (!ref || !Number.isFinite(ref.highMidi)) return {state:'no-reference'};
  if (!a?.metrics) return {state:'no-analysis', ref};
  const g = a.metrics.range || null;
  if (!(a.v >= 2)) return {state:'hold', reason:'version', ref, rows:[]};
  const row = (key, label, point) => { const midi = midiOf(point); return midi == null ? null : {key, label, note:point.note || noteName(midi), midi, diff:midi - ref.highMidi, point}; };
  const rows = [row('valid', '유효 최고음', g?.validHigh), row('stable', '안정 최고음', g?.stableHigh), row('instant', '순간 최고음', g?.instantaneous)].filter(Boolean);
  const valid = rows.find(r => r.key === 'valid'), instant = rows.find(r => r.key === 'instant');
  if (!reliable) return {state:'hold', reason:'confidence', ref, rows};
  if (!valid) return {state:'hold', reason:'no-valid', ref, rows};
  const d = valid.diff, verdict = Math.abs(d) <= MATCH ? 'match' : d > 0 ? 'above' : 'below';
  const recheck = !!instant && instant.diff >= RECHECK && d <= MATCH;
  return {state:'ok', verdict, diff:d, recheck, ref, rows};
}
function verdictText(c) {
  if (c.state === 'hold') return '판정 보류';
  if (c.state !== 'ok') return '';
  return c.verdict === 'match' ? '일치' : '악보보다 ' + diffText(c.diff);
}
/** The record saved on the song (song.vocalRange). */
function reference({low, high, source, scoreId = '', part = '', partId = '', transposition = 0, now = Date.now()}) {
  const lo = Math.round(Number(low)), hi = Math.round(Number(high));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw Error('최저음이 최고음보다 높아요.');
  return {version:1, low:noteName(lo), high:noteName(hi), lowMidi:lo, highMidi:hi, source:source === 'score' ? 'score' : 'manual',
    ...(source === 'score' ? {scoreId, part, partId, transposition} : {}), confirmedByUser:true, updatedAt:now};
}
return {NAMES, noteName, unzip, parts, choose, read, compare, diffText, verdictText, reference, midiOf, RULES:{MATCH, RECHECK}};
});
