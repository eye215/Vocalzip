/* 내 데이터 전체 내보내기 — pure parts (no DOM, no network), shared by the page (app/data-export.js) and node tests.
 *
 * - crc32(): incremental CRC-32 (zip polynomial).
 * - createZip(write): a streaming ZIP writer that only STOREs (no compression, so recordings keep their original bytes).
 *   Entries with a known CRC/size are written with full local headers; entries whose bytes arrive as a stream use a data
 *   descriptor (flag bit 3). Names are UTF-8 (flag bit 11). No ZIP64: a part or entry past 4 GiB, or more than 65,535
 *   entries, is refused (parts are kept far below that, ≤ 1 GB).
 * - safeName()/uniquePath(): file names that every OS accepts (NFC, no reserved characters/names, bounded length),
 *   unique case-insensitively across the whole export.
 * - planParts(): splits the files into download parts: score/MR/performance files first, then recordings by month
 *   (oldest first). Whole months stay together while they fit in the limit; a month larger than the limit is split.
 * - csv(): RFC 4180 CSV with a BOM so spreadsheet apps read Korean correctly. */
(root => {
'use strict';
const api = factory();
if (typeof module === 'object' && module.exports) module.exports = api;
else root.VzipDataExportModel = api;
function factory() {
const MAX32 = 0xFFFFFFFF, MAX_ENTRIES = 0xFFFF;

/* ---------- CRC-32 ---------- */
const TABLE = (() => {
  const t = new Uint32Array(256 * 4);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  for (let n = 0; n < 256; n++) for (let s = 1; s < 4; s++) t[s * 256 + n] = (t[(s - 1) * 256 + n] >>> 8) ^ t[t[(s - 1) * 256 + n] & 255];
  return t;
})();
/** Continue a CRC-32 over bytes (Uint8Array). Start with crc = 0. */
function crc32(bytes, crc = 0) {
  let c = (crc ^ MAX32) >>> 0, i = 0;
  const n = bytes.length, end4 = n - (n % 4);
  for (; i < end4; i += 4) {
    c ^= bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    c = TABLE[768 + (c & 255)] ^ TABLE[512 + ((c >>> 8) & 255)] ^ TABLE[256 + ((c >>> 16) & 255)] ^ TABLE[c >>> 24];
  }
  for (; i < n; i++) c = TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ MAX32) >>> 0;
}
const hex = n => (n >>> 0).toString(16).padStart(8, '0');

/* ---------- ZIP (STORE only) ---------- */
const utf8 = s => new TextEncoder().encode(s);
function dosTime(date) {
  const d = date instanceof Date && !isNaN(date) ? date : new Date();
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}
function zip64Error(what) { const e = Error('파트가 너무 커요 (' + what + '). 더 작은 파트 크기로 다시 시도해 주세요.'); e.code = 'zip64'; return e; }
function checkName(name) {
  const s = String(name || '');
  if (!s || s.startsWith('/') || s.split('/').some(x => x === '..' || x === '.' || x === '') || /[\\\0]/.test(s)) throw Error('잘못된 파일 경로: ' + s);
  return s;
}
const sizeOf = chunk => chunk == null ? 0 : typeof chunk.size === 'number' && typeof chunk.byteLength !== 'number' ? chunk.size : chunk.byteLength;

/** write(chunk) receives Uint8Array or Blob chunks in order and may return a promise (back-pressure). */
function createZip(write) {
  let offset = 0, finished = false;
  const entries = [], names = new Set();
  const put = async chunk => { const n = sizeOf(chunk); if (!n) return; await write(chunk); offset += n; };
  function local({name, flags, crc, size, time, date}) {
    const b = new Uint8Array(30 + name.length), v = new DataView(b.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, flags, true); v.setUint16(8, 0, true);
    v.setUint16(10, time, true); v.setUint16(12, date, true); v.setUint32(14, crc, true); v.setUint32(18, size, true); v.setUint32(22, size, true);
    v.setUint16(26, name.length, true); v.setUint16(28, 0, true); b.set(name, 30);
    return b;
  }
  function central(e) {
    const b = new Uint8Array(46 + e.name.length), v = new DataView(b.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 0x0314, true); v.setUint16(6, 20, true); v.setUint16(8, e.flags, true); v.setUint16(10, 0, true);
    v.setUint16(12, e.time, true); v.setUint16(14, e.date, true); v.setUint32(16, e.crc, true); v.setUint32(20, e.size, true); v.setUint32(24, e.size, true);
    v.setUint16(28, e.name.length, true); v.setUint16(30, 0, true); v.setUint16(32, 0, true); v.setUint16(34, 0, true); v.setUint16(36, 0, true);
    v.setUint32(38, (0o100644 << 16) >>> 0, true); v.setUint32(42, e.offset, true); b.set(e.name, 46);
    return b;
  }
  /** Add one file. source: Uint8Array | Blob | (async) iterable of Uint8Array.
   * With {crc, size} the header carries them; otherwise the CRC/size are computed while streaming and written after the data. */
  async function add(path, source, {date, crc, size, signal} = {}) {
    if (finished) throw Error('이미 끝난 ZIP이에요.');
    const label = checkName(path), name = utf8(label);
    if (names.has(label.toLowerCase())) throw Error('같은 이름의 파일이 이미 있어요: ' + label);
    if (entries.length >= MAX_ENTRIES) throw zip64Error('파일 수');
    const whole = source instanceof Uint8Array || (typeof Blob !== 'undefined' && source instanceof Blob);
    // Bytes already in hand: CRC first, so the header is complete and no data descriptor is needed.
    if (whole && !(Number.isInteger(crc) && Number.isInteger(size))) { size = sizeOf(source); crc = source instanceof Uint8Array ? crc32(source) : await crcOfBlob(source, signal); }
    const known = Number.isInteger(crc) && Number.isInteger(size);
    const {time, date: day} = dosTime(date);
    const e = {name, flags: 0x0800 | (known ? 0 : 0x0008), crc: known ? crc >>> 0 : 0, size: known ? size : 0, time, date: day, offset};
    if (known && offset + 30 + name.length + size > MAX32) throw zip64Error('4GB');
    names.add(label.toLowerCase());
    await put(local(e));
    let written = 0, sum = 0;
    if (whole) {
      written = sizeOf(source);
      await put(source);
    } else {
      for await (const chunk of source) {
        if (signal?.aborted) throw signal.reason || abortError();
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        if (!known) sum = crc32(bytes, sum);
        written += bytes.byteLength; await put(bytes);
      }
    }
    if (known && written !== size) throw Error('파일 크기가 달라요: ' + label + ' (' + written + ' ≠ ' + size + ')');
    if (!known) {
      e.crc = sum; e.size = written;
      if (offset + 16 > MAX32) throw zip64Error('4GB');
      const d = new Uint8Array(16), v = new DataView(d.buffer);
      v.setUint32(0, 0x08074b50, true); v.setUint32(4, sum, true); v.setUint32(8, written, true); v.setUint32(12, written, true);
      await put(d);
    }
    entries.push(e);
    return {path: label, crc: e.crc, size: e.size, offset: e.offset};
  }
  async function finish() {
    if (finished) throw Error('이미 끝난 ZIP이에요.');
    finished = true;
    const start = offset, parts = entries.map(central), cdSize = parts.reduce((s, b) => s + b.length, 0);
    if (start + cdSize + 22 > MAX32) throw zip64Error('4GB');
    for (const b of parts) await put(b);
    const end = new Uint8Array(22), v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, entries.length, true); v.setUint16(10, entries.length, true);
    v.setUint32(12, cdSize, true); v.setUint32(16, start, true); v.setUint16(20, 0, true);
    await put(end);
    return offset;
  }
  return {add, finish, get size() { return offset; }, get count() { return entries.length; }};
}
const abortError = () => { try { return new DOMException('멈췄어요.', 'AbortError'); } catch { const e = Error('멈췄어요.'); e.name = 'AbortError'; return e; } };
async function crcOfBlob(blob, signal) {
  let sum = 0;
  if (blob.stream) {
    const reader = blob.stream().getReader();
    try { for (;;) { if (signal?.aborted) throw signal.reason || abortError(); const {done, value} = await reader.read(); if (done) break; sum = crc32(value, sum); } }
    finally { reader.releaseLock?.(); }
    return sum;
  }
  for (let i = 0; i < blob.size; i += 4 << 20) sum = crc32(new Uint8Array(await blob.slice(i, i + (4 << 20)).arrayBuffer()), sum);
  return sum;
}

/* ---------- names ---------- */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
/** One path segment that macOS, Windows, iOS Files and Android accept. Keeps Korean; at most `max` characters. */
function safeName(value, {max = 80, fallback = '이름 없음'} = {}) {
  let s = String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[.\s]+|[.\s]+$/g, '');
  if ([...s].length > max) s = [...s].slice(0, max).join('').trim().replace(/[.\s]+$/, '');
  if (!s) s = fallback;
  if (RESERVED.test(s.split('.')[0])) s = '_' + s;
  return s;
}
/** A path not used yet (case-insensitive): "a.m4a", "a (2).m4a", "a (3).m4a" … Records it in `used`. */
function uniquePath(path, used) {
  const slash = path.lastIndexOf('/'), dir = path.slice(0, slash + 1), file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.'), stem = dot > 0 ? file.slice(0, dot) : file, ext = dot > 0 ? file.slice(dot) : '';
  let out = path, n = 2;
  while (used.has(out.toLowerCase())) out = dir + stem + ' (' + n++ + ')' + ext;
  used.add(out.toLowerCase());
  return out;
}
/** "2026-11-02 제목" — drops a trailing "2026.11.02" from the title when it repeats the same day. */
function datedTitle(ymd, title) {
  let t = String(title || '').trim();
  if (ymd) { const dotted = ymd.replace(/-/g, '.'); if (t.endsWith(' ' + dotted)) t = t.slice(0, -dotted.length - 1).trim(); else if (t === dotted || t === ymd) t = ''; }
  return [ymd, t].filter(Boolean).join(' ');
}

/* ---------- parts ---------- */
const GROUPS = ['library', 'recordings'];
/** files: [{size, group:'library'|'recordings', month:'YYYY-MM'|'' , ...}] already in export order.
 * Returns [{index, files, bytes, group, months:[first,last]}]. A file larger than the limit gets a part of its own. */
function planParts(files, {limit = 500 * 1024 * 1024} = {}) {
  const parts = [];
  let cur = null;
  const open = group => { cur = {index: parts.length, files: [], bytes: 0, group, months: []}; parts.push(cur); };
  const push = f => { cur.files.push(f); cur.bytes += Math.max(0, Number(f.size) || 0); if (f.month && !cur.months.includes(f.month)) cur.months.push(f.month); };
  for (const group of GROUPS) {
    const list = files.filter(f => (f.group || 'recordings') === group);
    if (!list.length) continue;
    cur = null;
    // Blocks of the same month stay together when they fit.
    const blocks = [];
    for (const f of list) { const last = blocks.at(-1); if (last && last.month === (f.month || '')) last.files.push(f); else blocks.push({month: f.month || '', files: [f]}); }
    for (const block of blocks) {
      const bytes = block.files.reduce((s, f) => s + Math.max(0, Number(f.size) || 0), 0);
      if (!cur || (cur.files.length && cur.bytes + bytes > limit)) open(group);
      if (cur.bytes + bytes <= limit || !cur.files.length && bytes <= limit) { block.files.forEach(push); continue; }
      for (const f of block.files) {
        const n = Math.max(0, Number(f.size) || 0);
        if (cur.files.length && cur.bytes + n > limit) open(group);
        push(f);
      }
    }
  }
  for (const p of parts) p.months.sort();
  return parts;
}

/* ---------- CSV ---------- */
const cell = v => {
  const s = v == null ? '' : String(v), formula = typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);
  return formula || /[",\r\n]/.test(s) ? '"' + (formula ? "'" : '') + s.replace(/"/g, '""') + '"' : s;
};
/** columns: [[header, row => value], …]. BOM + CRLF; cells starting with = + - @ are quoted with a leading ' so spreadsheets do not run them. */
function csv(rows, columns) {
  return '﻿' + [columns.map(c => cell(c[0])).join(','), ...rows.map(r => columns.map(c => cell(c[1](r))).join(','))].join('\r\n') + '\r\n';
}
const formatBytes = n => { n = Math.max(0, Number(n) || 0); return n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 1 : 2) + 'GB' : n >= 1024 ** 2 ? Math.round(n / 1024 ** 2) + 'MB' : Math.max(n ? 1 : 0, Math.round(n / 1024)) + 'KB'; };

return {crc32, hex, createZip, crcOfBlob, safeName, uniquePath, datedTitle, planParts, csv, formatBytes, dosTime, MAX32};
}
})(typeof window !== 'undefined' ? window : globalThis);
