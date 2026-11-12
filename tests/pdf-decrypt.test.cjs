// Encrypted-but-openable PDFs (owner password only, as many bought scores are) are opened for page copying by
// app/pdf-decrypt.js. Fixtures were encrypted by an independent writer (qpdf via pikepdf, see encrypted-pdf/make.py).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const D = require('../app/pdf-decrypt.js');
const PDFROOT = process.env.VZ_PDFJS_ROOT || '/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
const lib = require(path.join(PDFROOT, '../pdf-lib/dist/pdf-lib.min.js')); // the same build the app loads
const dir = path.join(__dirname, 'encrypted-pdf');
const read = name => new Uint8Array(fs.readFileSync(path.join(dir, name + '.pdf')));
const OPENABLE = ['rc4-40', 'rc4-128', 'aes-128', 'aes-128-classic', 'rc4-128-r4-plain-metadata', 'aes-256'];

/** Text drawn on each page, read back with pdf.js from a PDF that pdf-lib built by copying pages. */
async function textOf(bytes) {
  const pdfjs = await import(path.join(PDFROOT, 'legacy/build/pdf.mjs'));
  const doc = await pdfjs.getDocument({data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false}).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map(t => t.str).join(''));
  await doc.destroy();
  return out;
}

test('pdf-lib alone refuses these files (the failure seen with a real notebook)', async () => {
  for (const name of OPENABLE) await assert.rejects(lib.PDFDocument.load(read(name)), e => D.isEncrypted(e), name);
});

for (const name of OPENABLE) {
  test('an owner-password-only PDF (' + name + ') opens, and its pages copy out readable with their strings', async () => {
    const source = await D.load(lib, read(name), {updateMetadata: false});
    assert.equal(source.getPageCount(), 3);
    assert.equal(source.isEncrypted, false);
    assert.equal(source.getTitle(), 'Synthetic encrypted score');
    const notes = source.getPages().map(p => p.node.lookup(lib.PDFName.of('Annots')).lookup(0).lookup(lib.PDFName.of('Contents')).decodeText());
    assert.deepEqual(notes, ['note on page 1', 'note on page 2', 'note on page 3']);
    const out = await lib.PDFDocument.create();
    for (const page of await out.copyPages(source, [2, 0])) out.addPage(page);
    const bytes = await out.save();
    assert.equal(Buffer.from(bytes).includes(Buffer.from('/Encrypt')), false);
    assert.deepEqual(await textOf(bytes), ['Original page 3', 'Original page 1']);
  });
}

test('a PDF that needs a password to open is refused with a plain reason, not opened as garbage', async () => {
  for (const name of ['rc4-128-user-password', 'aes-256-user-password'])
    await assert.rejects(D.load(lib, read(name)), {code: 'password', message: /비밀번호가 있어야 열리는 PDF/}, name);
});

test('an ordinary PDF opens exactly as pdf-lib opens it', async () => {
  const plain = await lib.PDFDocument.create();
  for (let i = 0; i < 2; i++) plain.addPage([300, 400]).drawText('Plain page ' + (i + 1), {x: 20, y: 360, size: 18});
  plain.setTitle('Plain');
  const bytes = await plain.save({useObjectStreams: true});
  const doc = await D.load(lib, bytes, {updateMetadata: false});
  assert.equal(doc.getPageCount(), 2);
  assert.equal(doc.getTitle(), 'Plain');
  const out = await lib.PDFDocument.create();
  out.addPage((await out.copyPages(doc, [1]))[0]);
  assert.deepEqual(await textOf(await out.save()), ['Plain page 2']);
});

test('MD5 matches the reference for every length around the block edges', () => {
  for (let n = 0; n < 200; n++) {
    const data = crypto.randomBytes(n);
    assert.equal(Buffer.from(D._internal.md5(new Uint8Array(data))).toString('hex'), crypto.createHash('md5').update(data).digest('hex'), 'length ' + n);
  }
});
