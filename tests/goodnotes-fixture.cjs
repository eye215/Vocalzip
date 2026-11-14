// Builds a synthetic .goodnotes archive for tests (no real notebook, no personal data).
// Mirrors the layout app/goodnotes-parse.js reads: index.events.pb, index.*.pb, attachments/<id>, notes/<id>.
const zlib = require('node:zlib');

const varint = n => { const out = []; let v = BigInt(n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return Buffer.from(out); };
const key = (field, wire) => varint(field * 8 + wire);
const ld = (field, bytes) => Buffer.concat([key(field, 2), varint(bytes.length), Buffer.from(bytes)]);
const s = (field, text) => ld(field, Buffer.from(text, 'utf8'));
const num = (field, n) => Buffer.concat([key(field, 0), varint(n)]);
const f32 = (field, x) => { const b = Buffer.alloc(4); b.writeFloatLE(x); return Buffer.concat([key(field, 5), b]); };
const msg = (...parts) => Buffer.concat(parts);
const reg = (field, text) => ld(field, msg(s(1, text), ld(2, msg(num(1, 1), num(2, 7)))));
const stream = records => Buffer.concat(records.map(r => Buffer.concat([varint(r.length), r])));
const event = (id, kind, body) => msg(s(1, id), ld(kind, body));

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const fbits = x => { const b = Buffer.alloc(4); b.writeFloatLE(x); return b; };
/** kinds: 0 = move (one point), 1 = quadratic curve (control + end). */
function pathTuple({width = 3, kinds, moves, curves, schema = 'vuA(v)A(S(uu))A(S(uuuu))vA(f)'}) {
  const body = Buffer.concat([u16(2), fbits(width), u32(kinds.length), ...kinds.map(u16), u32(moves.length), ...moves.flatMap(p => p.map(fbits)),
    u32(curves.length), ...curves.flatMap(q => q.map(fbits)), u16(1), u32(0)]);
  const head = Buffer.concat([Buffer.from('tpl\0'), u32(0), Buffer.from(schema + '\0')]);
  const raw = Buffer.concat([head, body]); raw.writeUInt32LE(raw.length, 4);
  return raw;
}
/** Any "tpl" tuple: schema text + already encoded body. */
function tupleOf(schema, body) {
  const raw = Buffer.concat([Buffer.from('tpl\0'), u32(0), Buffer.from(schema + '\0'), body]); raw.writeUInt32LE(raw.length, 4);
  return raw;
}
const arr = (list, enc) => Buffer.concat([u32(list.length), ...list.map(enc)]);
/** Pressure pen (kinds 0/1, points x,y,half width) or freehand highlighter (kinds 4/5, points x,y,full width + 3 unused values per curve). */
function penTuple({start = [], curves = [], highlighter = false, empty = false}) {
  const kinds = empty ? [] : [highlighter ? 4 : 0, ...curves.map(() => highlighter ? 5 : 1)]; // an erased item keeps empty lists
  const seg = curves.flatMap(([cx, cy, cw, x, y, w]) => highlighter ? [cx, cy, cw, x, y, w, 0, 0, 0.1] : [cx, cy, cw, x, y, w]);
  const body = Buffer.concat([u16(2), arr(kinds, u16), arr(highlighter ? [...start, 0] : start, fbits), arr(seg, fbits), arr([], u16), arr([], u16), arr([], fbits), arr([], fbits), arr([], fbits), arr([], fbits), arr([], u16)]);
  return tupleOf('vA(v)A(u)A(u)A(v)A(v)A(u)A(u)A(u)A(u)A(v)', body);
}
/** Brush pen (schema 25): move (x,y,p,q,0), curves (flag, cx,cy,p,q,0, x,y,p,q,0). */
function brushTuple({width, start, curves}) {
  const five = p => Buffer.concat([...p, .5, 1, 0].slice(0, 5).map(fbits));
  const body = Buffer.concat([u16(1), fbits(width), arr([0, ...curves.map(() => 1)], u16), arr([start], five),
    arr(curves, ([cx, cy, x, y]) => Buffer.concat([0, cx, cy, .5, 1, 0, x, y, .5, 1, 0].map(fbits))), arr([], () => Buffer.alloc(0)), arr([], u16), arr([], () => Buffer.alloc(0)), arr([], () => Buffer.alloc(0)), arr([], u32)]);
  return tupleOf('vuA(v)A(S(uuuuu))A(S(uuuuuuuuuuu))A(S(uu))A(v)A(S(uu))A(S(uuuu))A(u)', body);
}
const stored = raw => Buffer.concat([Buffer.from('bv4-'), u32(raw.length), raw, Buffer.from('bv4$')]);
/** A valid LZ4 block made of literals only (what the encoder emits for incompressible data). */
function lz4Literals(raw) {
  const head = [raw.length >= 15 ? 0xf0 : raw.length << 4]; let rest = raw.length - 15;
  if (raw.length >= 15) { while (rest >= 255) { head.push(255); rest -= 255; } head.push(rest); }
  const block = Buffer.concat([Buffer.from(head), raw]);
  return Buffer.concat([Buffer.from('bv41'), u32(raw.length), u32(block.length), block, Buffer.from('bv4$')]);
}
/** One ink item: [header record, body record] as in notes/<id>. `memo`: the id of the sticker memo the stroke was
 *  written on — the header carries it as field 20 (a text). */
function inkItem(id, {color = [1, 0, 0, 1], deleted = false, payload, type = 0, shape = null, memo = ''}) {
  const colour = msg(...color.map((c, i) => c ? f32(i + 1, c) : Buffer.alloc(0)));
  // A shape keeps its corner points and width in field 9: {1:{1:{x,y}…} 15:width}.
  const geometry = shape ? [ld(9, msg(ld(1, msg(...shape.points.map(([x, y]) => ld(1, msg(f32(1, x), f32(2, y)))))), f32(15, shape.width)))] : [];
  return [msg(s(1, id), ld(2, msg(num(1, 2), num(2, 9))), ...(memo ? [s(20, memo)] : [])), msg(ld(7, msg(s(1, id), ld(2, payload), ...(type ? [num(3, type)] : []), ld(4, colour), num(5, 1), ...geometry, ...(deleted ? [num(14, 1)] : []), num(21, 24))))];
}
/** A sticker memo as in notes/<id>: [header record, {20: memo}]. x, y: top-left corner in page units; w, h: the size
 *  before `scale` (GoodNotes shows w·scale × h·scale); color: r, g, b, a floats; counter: the register clock (a later
 *  version of the same memo has a higher one); typed: the typed-text blob is not the 96 bytes of an empty memo. */
function stickerItem(id, {x, y, w = 256, h = 256, scale = 1, color = [0.98, 0.906, 0.471, 1], counter = 3, erased = false, typed = false, author = 'Fixture Author'}) {
  const clock = ld(3, msg(num(1, counter), num(2, 4255771838)));
  const body = msg(s(1, id), num(2, 35), clock,
    ld(20, msg(ld(1, msg(f32(1, x), f32(2, y))), f32(3, scale))), ld(21, msg(ld(2, msg(f32(1, w), f32(2, h))))),
    ld(30, msg(...color.map((c, i) => f32(i + 1, c)))), ld(31, msg(ld(1, msg(ld(2, Buffer.alloc(typed ? 140 : 96, 7)), num(4, 1))))),
    s(33, author), ...(erased ? [num(14, 1)] : []), num(40, 1), num(41, 1));
  return [msg(s(1, id), ld(2, msg(num(1, counter), num(2, 4255771838))), num(16, 35)), msg(ld(20, body))];
}

function zip(files) {
  const locals = [], central = []; let offset = 0;
  for (const [name, data, deflate] of files) {
    const body = deflate ? zlib.deflateRawSync(data) : Buffer.from(data), n = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 6); head.writeUInt16LE(deflate ? 8 : 0, 10);
    head.writeUInt32LE(body.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(n.length, 28); head.writeUInt32LE(offset, 42);
    locals.push(local, n, body); central.push(head, n); offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const uuid = n => '00000000-0000-4000-8000-' + n.toString(16).toUpperCase().padStart(12, '0');
/** The id of the k-th sticker memo on page i (both from 0) when the test gives none. */
const memoId = (i, k) => uuid(0x80000 + i * 256 + k);
/** A few bytes that start like a GoodNotes recording: an MP4 `ftyp` box (M4A), then filler that differs per seed. */
const m4a = (seed = 1, size = 96) => Buffer.concat([u32(0), Buffer.from('ftypM4A '), u32(0), Buffer.from('M4A mp42isom'), Buffer.from(Array.from({length:size}, (_, i) => (i * 31 + seed * 17) & 255))]).fill(Buffer.from([0, 0, 0, 28]), 0, 4);
const FLICKS = 705600000;
/**
 * pages: [{pdfPage, order, ink?: [inkItem…]}], outline: [{page: index, title, order}]
 * Page ids are even numbers so that "page id + 1" (the ink file id) never collides with another page.
 * recordings: [{title, seconds, deleted, bytes, renames?: [{title, counter}], missing?}] — audio recorded in the notebook:
 *   event 160 (created: recording id, attachment id, document id, length in flicks), 164 (title register), 163 (deleted),
 *   161 (a stroke tied to a moment; ignored by the reader), plus the attachment event/row/file. A deleted recording has
 *   no file; `missing` keeps the attachment row but leaves the file out of the archive.
 * pages[i].memos: [{x, y, w, h, scale, color, strokes: n, id?, versions?: [{…changed fields, counter}], erased?, typed?}] —
 *   sticker memos (see stickerItem). `strokes` adds n straight pen strokes across the memo as it is shown (page
 *   coordinates, like every stroke), each linked to the memo by its header; they come before the memo's own record,
 *   as in real files. `versions` are later records of the same memo.
 */
function notebook({title = '테스트 악보집', pdf = Buffer.from('%PDF-1.4\n% synthetic\n'), pages, outline = [], width = 600, height = 800, rename = '', recordings = []}) {
  const DOC = uuid(0xD0C), ATT = uuid(0xA77), FILE = uuid(0xF11E);
  const events = [event(DOC, 30, msg(s(1, DOC), reg(2, title), s(9, 'ko_KR'))),
    event(ATT, 6, msg(s(1, ATT), s(2, FILE), s(6, DOC)))];
  const notes = [], files = [];
  pages.forEach((p, i) => {
    const pageId = uuid(0x1000 + i * 2), bgId = uuid(0xB000 + i);
    events.push(event(bgId, 2, msg(s(1, DOC), s(2, bgId), s(4, ATT), num(5, p.pdfPage), ld(8, msg(f32(1, width), f32(2, height))))));
    events.push(event(pageId, 54, msg(s(1, DOC), s(2, pageId), ld(3, msg(s(1, bgId), ld(2, msg(num(1, 1), num(2, 3))))), ld(4, msg(s(1, p.order), ld(2, msg(num(1, 1), num(2, 4))))))));
    // A page moved in GoodNotes gets a new order key in its own event (kind 55) with a higher clock counter.
    for (const m of p.moves || []) events.push(event(pageId, 55, msg(s(1, DOC), s(2, pageId), ld(3, msg(s(1, m.order), ld(2, msg(num(1, m.counter ?? 2), num(2, 6))))))));
    // A page removed in GoodNotes keeps its page event and gets a "removed" register (kind 56).
    if (p.removed != null) events.push(event(pageId, 56, msg(s(1, DOC), s(2, pageId), ld(3, msg(num(1, p.removed ? 1 : 0), ld(2, msg(num(1, 1), num(2, 5))))), s(4, uuid(0x7000 + i)))));
    const memoRecords = (p.memos || []).flatMap((m, k) => {
      const id = m.id || memoId(i, k), sw = (m.w ?? 256) * (m.scale ?? 1), sh = (m.h ?? 256) * (m.scale ?? 1), n = m.strokes || 0;
      const lines = Array.from({length: n}, (_, j) => { const y = m.y + sh * (j + 1) / (n + 1), x0 = m.x + sw * 0.15, x1 = m.x + sw * 0.85;
        return inkItem(uuid(0x90000 + i * 4096 + k * 256 + j), {color: m.ink || [0.74, 0.1, 0.1, 1], memo: id,
          payload: stored(pathTuple({width: 3, kinds: [0, 1], moves: [[x0, y]], curves: [[(x0 + x1) / 2, y, x1, y]]}))}); });
      return [...lines, stickerItem(id, m), ...(m.versions || []).map(v => stickerItem(id, {...m, ...v}))];
    });
    if (p.ink || memoRecords.length) {
      const noteId = uuid(0x1000 + i * 2 + 1);
      notes.push(msg(s(1, noteId), s(2, 'notes/' + noteId)));
      files.push(['notes/' + noteId, stream([...(p.ink || []), ...memoRecords].flat()), true]);
    }
  });
  outline.forEach((o, i) => events.push(event(uuid(0x1000 + o.page * 2), 65, msg(s(1, uuid(0x1000 + o.page * 2)), s(2, uuid(0xE000 + i)), ld(4, msg(s(1, o.order || String(i)))), ld(5, msg(s(1, o.title)))))));
  if (rename) events.push(event(DOC, 31, msg(s(1, DOC), reg(2, rename))));
  const audio = [], audioFiles = [];
  recordings.forEach((r, i) => {
    const id = uuid(0x5000 + i), att = uuid(0x6000 + i), file = uuid(0x6100 + i);
    const name = (text, counter) => event(id, 164, msg(s(1, id), s(2, DOC), ld(3, msg(s(1, text), ld(2, msg(num(1, counter), num(2, 7)))))));
    events.push(event(att, 6, msg(s(1, att), s(2, file), s(6, DOC))));
    events.push(event(id, 160, msg(s(1, id), s(2, att), s(3, DOC), num(4, Math.round((r.seconds ?? 60) * FLICKS)))));
    if (r.title) events.push(name(r.title, 1));
    for (const n of r.renames || []) events.push(name(n.title, n.counter ?? 2));
    events.push(event(uuid(0x5800 + i), 161, msg(s(1, uuid(0x5800 + i)), s(2, id), s(3, DOC), num(4, FLICKS))));
    if (r.deleted) { events.push(event(id, 163, msg(s(1, id), s(2, DOC)))); return; }
    audio.push(msg(s(1, att), s(2, 'attachments/' + file)));
    if (!r.missing) audioFiles.push(['attachments/' + file, r.bytes || m4a(i + 1), false]);
  });
  // Event kinds the reader does not know must simply be counted.
  events.push(event(DOC, 99, msg(s(1, DOC))));
  return zip([['schema.pb', num(1, 26), false], ['index.events.pb', stream(events), true],
    ['index.attachments.pb', stream([msg(s(1, ATT), s(2, 'attachments/' + FILE)), ...audio]), false],
    ['index.notes.pb', stream(notes), false], ['attachments/' + FILE, pdf, false], ...audioFiles, ...files]);
}
module.exports = {notebook, inkItem, stickerItem, memoId, pathTuple, penTuple, brushTuple, stored, lz4Literals, zip, uuid, m4a};
