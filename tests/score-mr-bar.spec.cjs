// Score + MR bar (app/score-mr-bar.js): play the song's MR, record, or both while the PDF score is open; save the take into the song.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2} = require('./helpers/r2-fixture.cjs');
const fs = require('node:fs'), path = require('node:path');
const PDFROOT = process.env.VZ_PDFJS_ROOT || '/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
const pdf = () => { // one blank page
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>'];
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const at = Buffer.byteLength(out);
  out += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + at + '\n%%EOF';
  return Buffer.from(out);
};
const wav = seconds => { const sr = 8000, n = sr * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 6) * 4000), 44 + i * 2); return b; };
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
test('With the score open, the song MR plays, a take is recorded with the MR, and saving puts it into the song', async ({page, browserName}) => {
  test.skip(!fs.existsSync(PDFROOT), 'PDF.js fixture not installed');
  const r2 = await fakeR2(page);
  r2.store.set('u/ui-test-user/score-mr/original.pdf', {bytes:pdf(), type:'application/pdf', etag:'"pdf"'});
  r2.store.set('u/ui-test-user/mr-1/original.wav', {bytes:wav(20), type:'audio/wav', etag:'"mr"'});
  await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**', route => {
    const suffix = new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1], file = path.join(PDFROOT, suffix);
    if (!suffix || suffix.includes('..') || !fs.existsSync(file)) return route.abort();
    return route.fulfill({path:file, contentType:file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream', headers:{'access-control-allow-origin':'*'}});
  });
  await boot(page);
  await page.evaluate(() => window.VZ.change(d => {
    d.songs[0].scores = [{id:'score-mr', songId:'s1', title:'MR 악보', r2Key:'u/ui-test-user/score-mr/original.pdf', size:400, uploadedAt:Date.now()}];
    d.songs[0].mrTracks = [{id:'mr-1', kind:'file', title:'반주 원키', fileName:'mr.wav', type:'audio/wav', r2Key:'u/ui-test-user/mr-1/original.wav', size:320044, created:Date.now()}];
  }));
  await page.goto('/#/song/s1'); await page.getByRole('tab', {name:'악보', exact:true}).click();
  await page.getByRole('button', {name:'MR 악보 열기', exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'악보 개인 필기'}), bar = dialog.getByRole('region', {name:'MR 재생·녹음'});
  await expect(bar).toContainText('반주 원키');
  // MR alone
  await bar.getByRole('button', {name:'재생'}).click();
  await expect(bar.locator('[data-mr-note]')).toHaveText('MR 재생 중');
  await bar.getByRole('button', {name:'정지'}).click();
  await expect(bar.getByRole('button', {name:'MR 틀고 녹음'})).toBeVisible();
  // MR + voice: the fake microphone of the test browser stands in for the singer.
  test.skip(browserName !== 'chromium', 'fake microphone is a Chromium launch option');
  await bar.getByRole('button', {name:'MR 틀고 녹음'}).click();
  await expect(bar.locator('[data-mr-note]')).toHaveText('MR과 함께 녹음 중');
  await page.waitForTimeout(1500);
  await bar.getByRole('button', {name:'정지'}).click();
  await expect(bar.locator('[data-mr-review]')).toBeVisible();
  await bar.getByRole('button', {name:'저장', exact:true}).click();
  await expect(bar.locator('.score-mr-saved')).toContainText('저장했어요');
  const saved = await page.evaluate(async () => (await window.vzipReadMedia()).find(m => m.mrTrackId === 'mr-1'));
  expect(saved).toMatchObject({songId:'s1', occasion:'practice', review:'MR: 반주 원키'});
  expect(saved.durationSeconds).toBeGreaterThan(0.5);
});
