// 녹음 찾기 (recover.html): lists every VOCAL.zip recording store on this device, read-only, and saves a file.
const {test, expect} = require('@playwright/test');
test('Recover page lists legacy, unclaimed and account stores, marks today, and saves a file without changing any store', async ({page}) => {
  await page.goto('/recover.html?seed=0');
  await page.evaluate(async () => {
    // WebKit (Playwright's ephemeral context) cannot keep Blobs in IndexedDB; like the app, such rows fall back to raw bytes.
    const bytesOf = async x => { if (!(x.blob instanceof Blob)) return x; const y = {...x, bytes:await x.blob.arrayBuffer(), type:x.blob.type}; delete y.blob; return y; };
    const write = (name, rows) => new Promise((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore('recordings', {keyPath:'id'}); r.onerror = () => rej(r.error);
      r.onsuccess = () => { try { const t = r.result.transaction('recordings', 'readwrite'); rows.forEach(x => t.objectStore('recordings').put(x)); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = t.onabort = () => { r.result.close(); rej(t.error || Error('aborted')); }; } catch (e) { r.result.close(); rej(e); } }; });
    const put = async (name, rows) => { try { await write(name, rows); } catch { await write(name, await Promise.all(rows.map(bytesOf))); } };
    const wav = new Blob([new Uint8Array(2048)], {type:'audio/wav'});
    await put('vocalzip_media_v1', [{id:'old1', name:'예전 녹음', created:Date.now() - 864e5 * 3, blob:wav}]);
    await put('vocalzip_media_v1_account_unclaimed', [{id:'u1', name:'난 예술가의 아내라', created:Date.now() - 3600e3, bytes:new Uint8Array(4096).buffer, type:'audio/mp4'}]);
    await put('vocalzip_media_v1_account_user-a', [{id:'a1', name:'If I ain’t got you', created:Date.now() - 7200e3, blob:wav}]);
  });
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(3);
  await expect(page.locator('.card', {hasText:'로그인 확인 전 저장소'})).toContainText('난 예술가의 아내라');
  await expect(page.locator('.row.today')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.locator('.card', {hasText:'unclaimed'}).getByRole('button', {name:'파일 저장'}).click();
  const file = await download; // the whole recording comes out (headless Chromium may not keep a Korean file name)
  expect(require('node:fs').statSync(await file.path()).size).toBe(4096);
  const counts = await page.evaluate(async () => Promise.all(['vocalzip_media_v1', 'vocalzip_media_v1_account_unclaimed', 'vocalzip_media_v1_account_user-a'].map(n => new Promise(res => {
    const r = indexedDB.open(n); r.onsuccess = () => { const q = r.result.transaction('recordings').objectStore('recordings').count(); q.onsuccess = () => { r.result.close(); res(q.result); }; }; }))));
  expect(counts).toEqual([1, 1, 1]); // nothing removed or added
});
