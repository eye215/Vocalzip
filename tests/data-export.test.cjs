// 내 데이터 전체 내보내기: streaming STORE zip writer, names, part plan, CSV (app/data-export-model.js).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {execFileSync, spawnSync} = require('node:child_process');
const zlib = require('node:zlib');
const X = require('../app/data-export-model.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vzip-export-'));
test.after(() => fs.rmSync(tmp, {recursive: true, force: true}));
const has = cmd => spawnSync(cmd, ['--version'], {stdio: 'ignore'}).status !== null && !spawnSync(cmd, ['--version'], {stdio: 'ignore'}).error;

async function build(entries) {
  const chunks = [];
  const zip = X.createZip(async chunk => { chunks.push(chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(await chunk.arrayBuffer())); });
  for (const e of entries) await zip.add(e.name, e.source(), e.opts || {});
  const total = await zip.finish();
  const out = Buffer.concat(chunks);
  assert.equal(out.length, total);
  return out;
}
/** Minimal reader from the central directory (independent of the writer's bookkeeping). */
function read(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'end of central directory');
  const count = buf.readUInt16LE(eocd + 10), cdOffset = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0, p = cdOffset; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    assert.equal(buf.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out.push({name, flags, method, crc, data: buf.subarray(start, start + size)});
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
const bytes = (n, seed = 1) => { const b = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; } return b; };

test('crc32 matches zlib for whole and chunked input', () => {
  const data = bytes(100003, 7);
  assert.equal(X.crc32(data), zlib.crc32(data));
  let c = 0; for (let i = 0; i < data.length; i += 4097) c = X.crc32(data.subarray(i, i + 4097), c);
  assert.equal(c, zlib.crc32(data));
  assert.equal(X.crc32(new Uint8Array()), 0);
  assert.equal(X.hex(X.crc32(Buffer.from('123456789'))), 'cbf43926');
});

test('the writer STOREs original bytes with UTF-8 names, streamed (data descriptor) or with a known CRC', async () => {
  const a = bytes(250000, 3), b = bytes(9, 5), c = bytes(70000, 9);
  async function* chunks(data, step) { for (let i = 0; i < data.length; i += step) yield data.subarray(i, i + step); }
  const buf = await build([
    {name: '녹음/2026-11/2026-11-02 Defying Gravity.m4a', source: () => chunks(a, 65536), opts: {date: new Date(2026, 10, 2, 13, 45, 10)}},
    {name: '악보/위키드/2026-10-01 악보 (2).pdf', source: () => b, opts: {crc: X.crc32(b), size: b.length, date: new Date(2026, 9, 1)}},
    {name: 'manifest.json', source: () => new Blob([c]), opts: {}},
    {name: '빈 파일.txt', source: () => chunks(new Uint8Array(), 1)}
  ]);
  const list = read(buf);
  assert.deepEqual(list.map(x => x.name), ['녹음/2026-11/2026-11-02 Defying Gravity.m4a', '악보/위키드/2026-10-01 악보 (2).pdf', 'manifest.json', '빈 파일.txt']);
  assert.ok(list.every(x => x.method === 0), 'STORE only');
  assert.ok(list.every(x => x.flags & 0x0800), 'UTF-8 flag');
  assert.equal(list[0].flags & 8, 8); assert.equal(list[1].flags & 8, 0); assert.equal(list[2].flags & 8, 0);
  assert.deepEqual([...list[0].data], [...a]); assert.deepEqual([...list[1].data], [...b]); assert.deepEqual([...list[2].data], [...c]);
  assert.ok(list.every(x => x.crc === zlib.crc32(x.data)));
  const file = path.join(tmp, 'mixed.zip'); fs.writeFileSync(file, buf);
  if (has('python3')) {
    const py = 'import sys,zipfile,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps([[i.filename,i.compress_type,i.file_size,i.date_time[:6]] for i in z.infolist()],ensure_ascii=False))';
    const info = JSON.parse(execFileSync('python3', ['-I', '-c', py, file], {encoding: 'utf8'}));
    assert.deepEqual(info.map(x => x[0]), list.map(x => x.name));
    assert.ok(info.every(x => x[1] === 0));
    assert.deepEqual(info[0].slice(2), [a.length, [2026, 11, 2, 13, 45, 10]]);
  }
  if (has('unzip')) {
    const r = spawnSync('unzip', ['-t', file], {encoding: 'utf8'});
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /No errors detected/);
    const dir = path.join(tmp, 'out'); fs.mkdirSync(dir);
    execFileSync('unzip', ['-q', file, '-d', dir]);
    assert.deepEqual([...fs.readFileSync(path.join(dir, '녹음/2026-11/2026-11-02 Defying Gravity.m4a'))], [...a]);
  }
});

test('the writer refuses duplicates, unsafe paths, wrong sizes and data past the 4 GiB ZIP32 limit (no ZIP64)', async () => {
  const zip = X.createZip(() => {});
  await zip.add('a.txt', new Uint8Array([1]));
  await assert.rejects(zip.add('A.TXT', new Uint8Array([1])), /같은 이름/);
  for (const bad of ['/abs', '../x', 'a//b', 'a\\b', '']) await assert.rejects(zip.add(bad, new Uint8Array()), /잘못된 파일 경로/);
  await assert.rejects(zip.add('b.txt', new Uint8Array([1, 2]), {crc: 0, size: 3}), /크기가 달라요/);
  await assert.rejects(zip.add('big.bin', new Uint8Array(), {crc: 0, size: X.MAX32}), e => e.code === 'zip64');
  await zip.finish();
  await assert.rejects(zip.add('late.txt', new Uint8Array()), /끝난/);
});

test('safeName keeps Korean, removes reserved characters/names and bounds the length; uniquePath numbers repeats', () => {
  assert.equal(X.safeName('  위키드: Defying/Gravity?*  '), '위키드_ Defying_Gravity_');
  assert.equal(X.safeName('a\u0000b\nc'), 'a_b_c');
  assert.equal(X.safeName('...'), '이름 없음');
  assert.equal(X.safeName('CON'), '_CON');
  assert.equal(X.safeName('nul.txt'), '_nul.txt');
  assert.equal(X.safeName('가'.repeat(200)).length, 80);
  assert.equal(X.safeName('한'), '한', 'NFC');
  const used = new Set();
  assert.equal(X.uniquePath('녹음/a.m4a', used), '녹음/a.m4a');
  assert.equal(X.uniquePath('녹음/A.m4a', used), '녹음/A (2).m4a');
  assert.equal(X.uniquePath('녹음/a.m4a', used), '녹음/a (3).m4a');
  assert.equal(X.uniquePath('다른/a.m4a', used), '다른/a.m4a');
  assert.equal(X.uniquePath('noext', used), 'noext');
  assert.equal(X.uniquePath('noext', used), 'noext (2)');
  assert.equal(X.datedTitle('2026-11-02', 'Defying Gravity 2026.11.02'), '2026-11-02 Defying Gravity');
  assert.equal(X.datedTitle('2026-11-02', '2026.11.02'), '2026-11-02');
  assert.equal(X.datedTitle('', '제목'), '제목');
});

test('parts: library files first, recordings by month (oldest first), whole months kept together, big months split', () => {
  const MB = 1024 * 1024;
  const f = (id, month, size, group = 'recordings') => ({id, month, size: size * MB, group});
  const files = [f('s1', '2026-01', 5, 'library'), f('m1', '', 3, 'library'),
    f('a', '2026-01', 100), f('b', '2026-01', 150), f('c', '2026-02', 200), f('d', '2026-03', 120),
    f('e', '2026-04', 300), f('g', '2026-04', 300), f('h', '2026-04', 50), f('i', '2026-05', 700)];
  const parts = X.planParts(files, {limit: 500 * MB});
  assert.deepEqual(parts.map(p => p.files.map(x => x.id).join('')), ['s1m1', 'abc', 'd', 'e', 'gh', 'i']);
  assert.deepEqual(parts.map(p => p.group), ['library', 'recordings', 'recordings', 'recordings', 'recordings', 'recordings']);
  assert.deepEqual(parts[1].months, ['2026-01', '2026-02']);
  assert.ok(parts.slice(0, -1).every(p => p.bytes <= 500 * MB), 'only a single oversized file may exceed the limit');
  assert.equal(parts.at(-1).bytes, 700 * MB);
  assert.deepEqual(parts.map(p => p.index), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(X.planParts([], {}), []);
  // every file exactly once, order kept
  assert.deepEqual(parts.flatMap(p => p.files.map(x => x.id)), files.map(x => x.id));
});

test('csv: BOM, CRLF, quoting and spreadsheet formula guard', () => {
  const out = X.csv([{a: '위키드, "Defying"', b: '=HYPERLINK("x")', c: -3}, {a: '줄\n바꿈', b: null, c: '-12.5'}], [['제목', r => r.a], ['메모', r => r.b], ['값', r => r.c]]);
  assert.ok(out.startsWith('﻿제목,메모,값\r\n'));
  assert.equal(out, '﻿제목,메모,값\r\n"위키드, ""Defying""","\'=HYPERLINK(""x"")",-3\r\n"줄\n바꿈",,-12.5\r\n');
  assert.equal(X.formatBytes(1536 * 1024 * 1024), '1.50GB');
  assert.equal(X.formatBytes(12 * 1024 * 1024), '12MB');
});
