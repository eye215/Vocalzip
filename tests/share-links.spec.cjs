// 개별 녹음 공유 링크 (app/share-links.js, share.html): make with a period, copy/send, list, stop; the public page plays and downloads, and shows when a link was stopped or expired.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2, R2} = require('./helpers/r2-fixture.cjs');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
async function fakeShares(page) {
  const shares = [], made = [];
  await page.route(R2 + '/v1/shares**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData()); made.push(body);
      const s = {id:'a'.repeat(23) + shares.length, token:'T' + String(shares.length).padStart(42, 'x'), title:body.title, key:body.key, created:Date.now(), expires:body.expiresIn == null ? null : Date.now() + body.expiresIn * 1000};
      shares.push(s); return route.fulfill({json:{id:s.id, token:s.token, expires:s.expires, title:s.title}});
    }
    if (req.method() === 'DELETE') { const id = url.pathname.split('/').pop(), i = shares.findIndex(s => s.id === id); if (i >= 0) shares.splice(i, 1); return route.fulfill({json:{ok:i >= 0}}); }
    return route.fulfill({json:{shares:shares.map(s => ({...s, expired:false}))}});
  });
  return {shares, made};
}
test('A recording link is made for the chosen period, copied, listed and stopped from settings', async ({page, context, browserName}) => {
  // WebKit has no clipboard permissions to grant: there the copied text is read from the clipboard call itself.
  const realClipboard = browserName === 'chromium';
  if (realClipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fakeR2(page); const fake = await fakeShares(page);
  await boot(page);
  await page.evaluate(() => window.VZ.shareSheet({id:'m-share', name:'레슨 녹음 11.11', r2Key:'u/ui-test-user/m-share/original.m4a'}));
  const sheet = page.getByRole('dialog', {name:'공유 링크'});
  await expect(sheet.getByRole('radio', {name:'7일'})).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('radio', {name:'직접 입력'}).click();
  await sheet.getByLabel('며칠 동안').fill('45');
  await page.getByRole('button', {name:'링크 만들기'}).click();
  await expect(sheet).toContainText('링크를 만들었어요');
  expect(fake.made[0]).toEqual({key:'u/ui-test-user/m-share/original.m4a', mediaId:'m-share', title:'레슨 녹음 11.11', expiresIn:45 * 86400});
  const link = await sheet.getByLabel('공유 링크').inputValue();
  expect(link).toMatch(/\/share\.html#Tx+0$/);
  if (!realClipboard) await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.__copied = text; }; });
  await sheet.getByRole('button', {name:'복사'}).click();
  await expect(page.locator('.toast').last()).toContainText('링크를 복사했어요');
  expect(await page.evaluate(real => real ? navigator.clipboard.readText() : window.__copied, realClipboard)).toBe(link);
  await sheet.getByRole('button', {name:'돌아가기'}).click();
  // "계속": no expiry is sent
  await page.evaluate(() => window.VZ.shareSheet({id:'m2', name:'공연 녹음', r2Key:'u/ui-test-user/m2/original.m4a'}));
  await page.getByRole('dialog', {name:'공유 링크'}).getByRole('radio', {name:'계속'}).click();
  await page.getByRole('button', {name:'링크 만들기'}).click();
  await expect(page.getByRole('dialog', {name:'공유 링크'})).toContainText('끊을 때까지');
  expect(fake.made[1].expiresIn).toBeNull();
  await page.getByRole('dialog', {name:'공유 링크'}).getByRole('button', {name:'돌아가기'}).click();
  // Settings → 공유 중인 링크 → stop one
  await page.goto('/#/settings'); await page.getByRole('link', {name:/공유 중인 링크/}).click();
  await expect(page.locator('.share-row')).toHaveCount(2);
  await page.getByRole('button', {name:'공연 녹음 링크 끊기'}).click();
  await page.getByRole('dialog', {name:'링크 끊기'}).getByRole('button', {name:'링크 끊기'}).click();
  await expect(page.locator('.share-row')).toHaveCount(1);
  expect(fake.shares.map(s => s.title)).toEqual(['레슨 녹음 11.11']);
});
test('The public page plays and offers the download; a stopped or expired link says so', async ({page}) => {
  const token = 'Q'.repeat(43);
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:'window.VZIP_R2_ENDPOINT=' + JSON.stringify(R2) + ';'}));
  let state = 'ok';
  await page.route(R2 + '/v1/share/**', route => {
    if (route.request().url().endsWith('/meta')) return state === 'ok' ? route.fulfill({json:{title:'레슨 녹음 11.11', type:'audio/mp4', size:2097152, expires:Date.now() + 86400e3}}) : route.fulfill({status:state === 'gone' ? 404 : 410, json:{error:'x'}});
    return route.fulfill({status:200, contentType:'audio/mp4', body:Buffer.alloc(16)});
  });
  await page.goto('/share.html#' + token);
  await expect(page.locator('h1')).toHaveText('레슨 녹음 11.11');
  await expect(page.locator('audio')).toHaveAttribute('src', R2 + '/v1/share/' + token + '/media');
  await expect(page.getByRole('link', {name:'파일 내려받기'})).toHaveAttribute('href', R2 + '/v1/share/' + token + '/media?download=' + encodeURIComponent('레슨 녹음 11.11.m4a'));
  state = 'gone'; await page.reload(); await expect(page.locator('#box')).toContainText('공유가 끊겼거나');
  state = 'expired'; await page.reload(); await expect(page.locator('#box')).toContainText('기간이 끝난');
  await page.goto('/share.html#short'); await expect(page.locator('#box')).toContainText('링크가 올바르지');
});
test('MR files get a revocable link; YouTube MR and references send their own link; recordings share from the 더보기 menu', async ({page}) => {
  await fakeR2(page); const fake = await fakeShares(page);
  await boot(page);
  await page.evaluate(() => { window.__sent = []; navigator.share = async data => { window.__sent.push(data); }; });
  await page.evaluate(() => window.VZ.change(d => {
    d.songs[0].mrTracks = [{id:'mr-f', kind:'file', title:'반주 원키', fileName:'mr.m4a', r2Key:'u/ui-test-user/mr-f/original.m4a', created:1}, {id:'mr-y', kind:'youtube', title:'유튜브 반주', url:'https://www.youtube.com/watch?v=abcdefghijk', videoId:'abcdefghijk', created:2}];
    d.songs[0].arLinks = [{label:'뮤지컬 실황', url:'https://www.youtube.com/watch?v=zyxwvutsrqp'}];
  }));
  const songId = await page.evaluate(() => window.VZ.db.songs[0].id), songTitle = await page.evaluate(() => window.VZ.db.songs[0].title);
  await page.goto('/#/song/' + songId);
  await page.getByRole('tab', {name:'레퍼런스'}).click();
  await page.getByRole('button', {name:'반주 원키 MR 공유'}).click();
  const sheet = page.getByRole('dialog', {name:'공유 링크'});
  await expect(sheet).toContainText(songTitle + ' · 반주 원키');
  await page.getByRole('button', {name:'링크 만들기'}).click();
  await expect(sheet).toContainText('링크를 만들었어요');
  expect(fake.made.at(-1)).toMatchObject({key:'u/ui-test-user/mr-f/original.m4a', mediaId:'mr-f', title:songTitle + ' · 반주 원키'});
  await sheet.getByRole('button', {name:'돌아가기'}).click();
  await page.getByRole('button', {name:'유튜브 반주 MR 공유'}).click();
  await page.getByRole('button', {name:'뮤지컬 실황 링크 보내기'}).click();
  expect(await page.evaluate(() => window.__sent.map(x => x.url))).toEqual(['https://www.youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/watch?v=zyxwvutsrqp']);
  expect(fake.made.length).toBe(1); // links are sent as they are, nothing is created on the server
  // A cloud recording: 더보기 → 공유 링크 opens the same sheet.
  await page.evaluate(() => window.VZ.shareSheet && window.vzipStorePracticeMedia({id:'rec-s', name:'클라우드 녹음', type:'audio/mp4', blob:new Blob([new Uint8Array(64)], {type:'audio/mp4'}), created:Date.now(), source:'practice', r2Key:'u/ui-test-user/rec-s/original.m4a'}));
  await page.evaluate(() => window.VZ.media.invalidate?.());
  await page.goto('/#/recording/rec-s');
  await page.locator('[data-media-more]').first().click();
  await page.getByRole('button', {name:'공유 링크'}).click();
  await expect(page.getByRole('dialog', {name:'공유 링크'})).toContainText('클라우드 녹음');
});
