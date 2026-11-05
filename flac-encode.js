/* Lossless FLAC encoder for PCM WAV (16/24-bit, 1–8 channels), plain JavaScript.
 * Fixed linear predictors (order 0–4) with partitioned Rice coding; CRC-8/CRC-16 per frame.
 * The caller verifies the result by decoding it and comparing every sample with the WAV. */
((root) => {
'use strict';
const BLOCK = 4096;
const CRC8 = new Uint8Array(256), CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; CRC8[i] = c;
  let d = i << 8; for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; CRC16[i] = d;
}
class Bits {
  constructor(size = 1 << 16) { this.buf = new Uint8Array(size); this.pos = 0; this.acc = 0; this.n = 0; }
  grow(extra) { if (this.pos + extra <= this.buf.length) return; const next = new Uint8Array(Math.max(this.buf.length * 2, this.pos + extra + 1024)); next.set(this.buf.subarray(0, this.pos)); this.buf = next; }
  // value: non-negative, bits <= 24 per call (callers split wider writes)
  put(value, bits) {
    this.acc = (this.acc * (1 << bits)) + value; this.n += bits;
    if (this.n >= 8) { this.grow(4); while (this.n >= 8) { this.n -= 8; const shift = 2 ** this.n; this.buf[this.pos++] = Math.floor(this.acc / shift) & 0xff; this.acc %= shift; } }
  }
  wide(value, bits) { if (bits > 24) { this.put(Math.floor(value / 2 ** 24), bits - 24); this.put(value % 2 ** 24, 24); } else this.put(value, bits); }
  signed(v, bits) { this.wide(v < 0 ? v + 2 ** bits : v, bits); }
  unary(q) { while (q >= 24) { this.put(0, 24); q -= 24; } this.put(1, q + 1); }
  align() { if (this.n) this.put(0, 8 - this.n); }
  bytes() { return this.buf.subarray(0, this.pos); }
}
const RATES = {88200:1, 176400:2, 192000:3, 8000:4, 16000:5, 22050:6, 24000:7, 32000:8, 44100:9, 48000:10, 96000:11};
function utf8(n) { // FLAC "UTF-8" coded frame number (up to 36 bits)
  if (n < 0x80) return [n];
  const out = []; let len = n < 0x800 ? 2 : n < 0x10000 ? 3 : n < 0x200000 ? 4 : n < 0x4000000 ? 5 : n < 0x80000000 ? 6 : 7;
  for (let i = len - 1; i > 0; i--) { out.unshift(0x80 | (n % 64)); n = Math.floor(n / 64); }
  out.unshift(((0xff00 >> len) & 0xff) | n); return out;
}
// Residuals of the fixed predictor of a given order (first `order` samples are warm-up).
function residual(x, n, order, out) {
  switch (order) {
    case 0: for (let i = 0; i < n; i++) out[i] = x[i]; break;
    case 1: for (let i = 1; i < n; i++) out[i - 1] = x[i] - x[i - 1]; break;
    case 2: for (let i = 2; i < n; i++) out[i - 2] = x[i] - 2 * x[i - 1] + x[i - 2]; break;
    case 3: for (let i = 3; i < n; i++) out[i - 3] = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3]; break;
    default: for (let i = 4; i < n; i++) out[i - 4] = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
  }
  return n - order;
}
const fold = r => r >= 0 ? r * 2 : -r * 2 - 1;
// Best Rice parameter and bit cost for a run of folded residuals.
function riceCost(u, start, end) {
  let sum = 0; for (let i = start; i < end; i++) sum += u[i];
  const count = end - start; if (!count) return {k:0, bits:0};
  let k = 0; while (k < 30 && count * 2 ** (k + 1) < sum) k++;
  let best = null;
  for (let kk = Math.max(0, k - 1); kk <= Math.min(30, k + 1); kk++) {
    let bits = count * (kk + 1); const d = 2 ** kk; for (let i = start; i < end; i++) bits += Math.floor(u[i] / d);
    if (!best || bits < best.bits) best = {k:kk, bits};
  }
  return best;
}
function encodeSubframe(w, x, n, bps, scratch, folded) {
  // Constant block
  let constant = true; for (let i = 1; i < n && constant; i++) if (x[i] !== x[0]) constant = false;
  if (constant) { w.put(0, 8); w.signed(x[0], bps); return; }
  let best = null;
  for (let order = 0; order <= Math.min(4, n - 1); order++) {
    const m = residual(x, n, order, scratch);
    for (let i = 0; i < m; i++) folded[i] = fold(scratch[i]);
    for (let p = 0; p <= 6; p++) {
      if (n % (1 << p) || (n >> p) <= order) break;
      const parts = [], size = n >> p; let bits = 2 + 4, pos = 0;
      for (let j = 0; j < (1 << p); j++) { const len = j ? size : size - order, c = riceCost(folded, pos, pos + len); parts.push(c.k); bits += 5 + c.bits; pos += len; }
      bits += order * bps;
      if (!best || bits < best.bits) best = {order, p, parts, bits};
    }
  }
  if (!best || best.bits >= n * bps) { w.put(1 << 1, 8); for (let i = 0; i < n; i++) w.signed(x[i], bps); return; } // VERBATIM
  const {order, p, parts} = best, m = residual(x, n, order, scratch);
  for (let i = 0; i < m; i++) folded[i] = fold(scratch[i]);
  w.put((8 | order) << 1, 8); // FIXED, no wasted bits
  for (let i = 0; i < order; i++) w.signed(x[i], bps);
  w.put(1, 2); w.put(p, 4); // RICE2 (5-bit parameters)
  const size = n >> p; let pos = 0;
  for (let j = 0; j < (1 << p); j++) {
    const len = j ? size : size - order, k = parts[j], d = 2 ** k; w.put(k, 5);
    for (let i = pos; i < pos + len; i++) { const u = folded[i]; w.unary(Math.floor(u / d)); if (k) w.wide(u % d, k); }
    pos += len;
  }
}
/** Read the PCM layout of a WAV file (first 64 KB is enough for the header). */
async function wavInfo(file) {
  const head = new DataView(await file.slice(0, 65536).arrayBuffer());
  const tag = o => String.fromCharCode(head.getUint8(o), head.getUint8(o + 1), head.getUint8(o + 2), head.getUint8(o + 3));
  if (head.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let o = 12, fmt = null;
  while (o + 8 <= head.byteLength) {
    const id = tag(o), size = head.getUint32(o + 4, true);
    if (id === 'fmt ') {
      let format = head.getUint16(o + 8, true);
      if (format === 0xfffe && size >= 40) format = head.getUint16(o + 32, true);
      fmt = {format, channels:head.getUint16(o + 10, true), rate:head.getUint32(o + 12, true), bits:head.getUint16(o + 22, true), align:head.getUint16(o + 20, true)};
    } else if (id === 'data') {
      if (!fmt || fmt.format !== 1 || ![16, 24].includes(fmt.bits) || fmt.channels < 1 || fmt.channels > 8 || fmt.align !== fmt.channels * fmt.bits / 8) return null;
      const length = Math.min(size, file.size - (o + 8));
      return {...fmt, offset:o + 8, frames:Math.floor(length / fmt.align)};
    }
    o += 8 + size + (size & 1);
  }
  return null;
}
/** Encode a PCM WAV File to FLAC. Returns {blob, info} or null when the WAV is not PCM 16/24-bit. */
async function encodeWav(file, {onProgress, check, date} = {}) {
  const info = await wavInfo(file); if (!info) return null;
  const {channels:ch, rate, bits:bps, frames, offset} = info, bytesPer = bps / 8;
  const chunks = [];
  // STREAMINFO (+ optional VORBIS_COMMENT with the recording date)
  const meta = new Bits(128);
  meta.put(0x664c, 16); meta.put(0x6143, 16); // "fLaC"
  const comment = date ? new TextEncoder().encode('DATE=' + date) : null, vendor = new TextEncoder().encode('VOCAL.zip');
  meta.put(comment ? 0 : 1, 1); meta.put(0, 7); meta.put(34, 24);
  meta.put(BLOCK, 16); meta.put(BLOCK, 16); meta.put(0, 24); meta.put(0, 24);
  meta.put(rate, 20); meta.put(ch - 1, 3); meta.put(bps - 1, 5); meta.wide(frames, 36);
  for (let i = 0; i < 16; i++) meta.put(0, 8); // MD5 unknown (allowed)
  if (comment) {
    const le = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
    const body = [...le(vendor.length), ...vendor, ...le(1), ...le(comment.length), ...comment];
    meta.put(1, 1); meta.put(4, 7); meta.put(body.length, 24); for (const b of body) meta.put(b, 8);
  }
  chunks.push(meta.bytes().slice());
  const planes = Array.from({length:ch}, () => new Int32Array(BLOCK)), scratch = new Int32Array(BLOCK), folded = new Float64Array(BLOCK);
  const READ = 1 << 20; // ~1 MB reads, whole frames
  const framesPerRead = Math.max(BLOCK, Math.floor(READ / info.align / BLOCK) * BLOCK);
  let frameNo = 0, done = 0;
  for (let start = 0; start < frames; start += framesPerRead) {
    check?.();
    const count = Math.min(framesPerRead, frames - start);
    const view = new DataView(await file.slice(offset + start * info.align, offset + (start + count) * info.align).arrayBuffer());
    for (let b = 0; b < count; b += BLOCK) {
      const n = Math.min(BLOCK, count - b);
      for (let i = 0; i < n; i++) {
        const base = (b + i) * info.align;
        for (let c = 0; c < ch; c++) {
          const at = base + c * bytesPer;
          planes[c][i] = bps === 16 ? view.getInt16(at, true) : ((view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)));
        }
      }
      const w = new Bits(n * ch * bytesPer + 64);
      w.put(0xfff8, 16); w.put(7, 4); w.put(RATES[rate] || 0, 4); w.put(ch - 1, 4); w.put(bps === 16 ? 4 : 6, 3); w.put(0, 1);
      for (const byte of utf8(frameNo)) w.put(byte, 8);
      w.put(n - 1, 16);
      if (!RATES[rate]) { /* rate comes from STREAMINFO */ }
      let crc = 0; const headBytes = w.bytes(); for (let i = 0; i < headBytes.length; i++) crc = CRC8[crc ^ headBytes[i]];
      w.put(crc, 8);
      for (let c = 0; c < ch; c++) encodeSubframe(w, planes[c], n, bps, scratch, folded);
      w.align();
      const frame = w.bytes(); let c16 = 0; for (let i = 0; i < frame.length; i++) c16 = ((c16 << 8) & 0xffff) ^ CRC16[(c16 >> 8) ^ frame[i]];
      const out = new Uint8Array(frame.length + 2); out.set(frame); out[frame.length] = c16 >> 8; out[frame.length + 1] = c16 & 255;
      chunks.push(out); frameNo++;
    }
    done += count; onProgress?.(done / frames);
    await new Promise(r => setTimeout(r, 0));
  }
  return {blob:new Blob(chunks, {type:'audio/flac'}), info};
}
/** Original samples straight from the WAV bytes, as interleaved integers, in chunks. */
async function* pcmChunks(file, info, frames = 1 << 16) {
  const bytesPer = info.bits / 8;
  for (let start = 0; start < info.frames; start += frames) {
    const count = Math.min(frames, info.frames - start), view = new DataView(await file.slice(info.offset + start * info.align, info.offset + (start + count) * info.align).arrayBuffer());
    const out = new Int32Array(count * info.channels);
    for (let i = 0; i < out.length; i++) { const at = i * bytesPer; out[i] = info.bits === 16 ? view.getInt16(at, true) : (view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)); }
    yield out;
  }
}
/* ---------- decoder for the frames this encoder writes (used to verify before keeping a FLAC) ---------- */
class Reader {
  constructor(bytes) { this.b = bytes; this.pos = 0; this.bit = 0; }
  read(n) { // n <= 32
    let v = 0;
    while (n > 0) {
      if (this.pos >= this.b.length) throw Error('FLAC ends early');
      const avail = 8 - this.bit, take = Math.min(avail, n), byte = this.b[this.pos];
      v = v * (1 << take) + ((byte >> (avail - take)) & ((1 << take) - 1));
      this.bit += take; n -= take; if (this.bit === 8) { this.bit = 0; this.pos++; }
    }
    return v;
  }
  signed(n) { const v = this.read(n); return v >= 2 ** (n - 1) ? v - 2 ** n : v; }
  unary() { let q = 0; while (this.read(1) === 0) { if (++q > 1 << 26) throw Error('bad unary'); } return q; }
  align() { if (this.bit) { this.bit = 0; this.pos++; } }
}
/** Decode `flac` (a Blob written by encodeWav) and compare every sample with the WAV's own integers. */
async function verify(flac, file, info, {check} = {}) {
  const bytes = new Uint8Array(await flac.arrayBuffer()), r = new Reader(bytes);
  if (r.read(32) !== 0x664c6143) throw Error('not FLAC');
  let last = 0, bps = 0, ch = 0, total = 0;
  while (!last) {
    last = r.read(1); const type = r.read(7), len = r.read(24), start = r.pos;
    if (type === 0) { r.read(16); r.read(16); r.read(24); r.read(24); r.read(20); ch = r.read(3) + 1; bps = r.read(5) + 1; total = r.read(4) * 2 ** 32 + r.read(32); }
    r.pos = start + len; r.bit = 0;
  }
  if (bps !== info.bits || ch !== info.channels || total !== info.frames) throw Error('FLAC header differs');
  const source = pcmChunks(file, info); let A = null, ai = 0, frames = 0, frameNo = 0;
  const x = Array.from({length:ch}, () => new Int32Array(BLOCK)), res = new Int32Array(BLOCK);
  while (frames < total) {
    check?.();
    const frameStart = r.pos;
    if (r.read(16) !== 0xfff8) throw Error('lost frame sync');
    const bsCode = r.read(4); r.read(4); if (r.read(4) !== ch - 1) throw Error('channel layout'); r.read(3); r.read(1);
    let fn = r.read(8); if (fn >= 0x80) { let extra = 0; for (let m = 0x40; fn & m; m >>= 1) extra++; fn &= (0x3f >> extra); for (let i = 0; i < extra; i++) fn = fn * 64 + (r.read(8) & 0x3f); }
    if (fn !== frameNo) throw Error('frame number');
    if (bsCode !== 7) throw Error('block size code');
    const n = r.read(16) + 1;
    let crc = 0; for (let i = frameStart; i < r.pos; i++) crc = CRC8[crc ^ bytes[i]];
    if (r.read(8) !== crc) throw Error('frame header CRC');
    for (let c = 0; c < ch; c++) {
      if (r.read(1)) throw Error('subframe pad'); const type = r.read(6); if (r.read(1)) throw Error('wasted bits'); const out = x[c];
      if (type === 0) { const v = r.signed(bps); out.fill(v, 0, n); }
      else if (type === 1) { for (let i = 0; i < n; i++) out[i] = r.signed(bps); }
      else if (type >= 8 && type <= 12) {
        const order = type - 8; for (let i = 0; i < order; i++) out[i] = r.signed(bps);
        const method = r.read(2), pbits = method ? 5 : 4, esc = method ? 31 : 15, p = r.read(4), size = n >> p; let k = 0;
        for (let j = 0; j < (1 << p); j++) {
          const len = j ? size : size - order, param = r.read(pbits);
          if (param === esc) { const raw = r.read(5); for (let i = 0; i < len; i++) res[k++] = raw ? r.signed(raw) : 0; }
          else { const d = 2 ** param; for (let i = 0; i < len; i++) { const u = r.unary() * d + (param ? r.read(param) : 0); res[k++] = u % 2 ? -(u + 1) / 2 : u / 2; } }
        }
        for (let i = order; i < n; i++) {
          const e = res[i - order];
          out[i] = order === 0 ? e : order === 1 ? e + out[i - 1] : order === 2 ? e + 2 * out[i - 1] - out[i - 2] : order === 3 ? e + 3 * out[i - 1] - 3 * out[i - 2] + out[i - 3] : e + 4 * out[i - 1] - 6 * out[i - 2] + 4 * out[i - 3] - out[i - 4];
        }
      } else throw Error('subframe type');
    }
    r.align();
    let c16 = 0; for (let i = frameStart; i < r.pos; i++) c16 = ((c16 << 8) & 0xffff) ^ CRC16[(c16 >> 8) ^ bytes[i]];
    if (r.read(16) !== c16) throw Error('frame CRC');
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      if (!A || ai >= A.length) { const next = await source.next(); if (next.done) throw Error('FLAC longer than WAV'); A = next.value; ai = 0; }
      if (A[ai++] !== x[c][i]) throw Error('sample differs');
    }
    frames += n; frameNo++;
    if (frameNo % 64 === 0) await new Promise(res => setTimeout(res, 0));
  }
  if ((A && ai < A.length) || !(await source.next()).done) throw Error('FLAC shorter than WAV');
  return {frames};
}
const api = {encodeWav, wavInfo, pcmChunks, verify};
root.VzipFlac = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
