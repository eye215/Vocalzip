// 설정 › 관리 › 굿노트에서 가져온 악보 지우기: only scores the GoodNotes import made are deleted (PDF, converted
// result, entry); hand-uploaded PDFs, songs and everything else stay. Nothing is deleted before the confirmation.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2, KEY} = require('./helpers/r2-fixture.cjs');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const key = id => 'u/ui-test-user/' + id + '/original.pdf', mxl = id => 'u/ui-test-user/' + id + '/omr.mxl';
const songs = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.filter(s => s.id.startsWith('song-')).map(s => [s.id, (s.scores || []).filter(x => !x.deleted).map(x => x.id)]), KEY);
async function seed(page, fake) {
  for (const id of ['gn-1', 'gn-2', 'hand-1']) fake.store.set(key(id), {bytes:Buffer.from('%PDF-1.4 ' + id), type:'application/pdf'});
  fake.store.set(mxl('gn-1'), {bytes:Buffer.from('PK..'), type:'application/vnd.recordare.musicxml'});
  await page.evaluate(([a, b, h]) => VZ.change(db => {
    const score = (id, r2Key, extra = {}) => ({id, title:id, fileName:id + '.pdf', r2Key, size:14, uploadedAt:Date.now(), ...extra});
    db.songs.push({id:'song-a', title:'Defying Gravity', lyrics:'la', scores:[score('gn-1', a, {songId:'song-a', source:'goodnotes', importedStrokes:3}), score('hand-1', h, {songId:'song-a'})]},
      {id:'song-b', title:'Memory', scores:[score('gn-2', b, {songId:'song-b', source:'goodnotes'})]});
  }), [key('gn-1'), key('gn-2'), key('hand-1')]);
}
test('only GoodNotes-imported scores are deleted, after one confirmation; uploaded PDFs, songs and lyrics stay', async ({page}) => {
  const fake = await fakeR2(page);
  await boot(page); await seed(page, fake);
  await page.goto('/#/settings');
  const row = page.locator('[data-clear-goodnotes]');
  await expect(row).toContainText('굿노트에서 가져온 악보 지우기');
  await expect(row).toContainText('2개 · 직접 올린 PDF 악보는 그대로');
  // Cancelling deletes nothing.
  await row.click();
  const ask = page.getByRole('dialog', {name:'굿노트 악보 2개 삭제'});
  await expect(ask).toContainText('되돌릴 수 없어요');
  await ask.getByRole('button', {name:'취소'}).click();
  expect(await songs(page)).toEqual([['song-a', ['gn-1', 'hand-1']], ['song-b', ['gn-2']]]);
  expect([fake.store.has(key('gn-1')), fake.store.has(key('gn-2'))]).toEqual([true, true]);
  // Confirming deletes the two imported scores and the converted result of the first.
  await row.click();
  await page.getByRole('dialog', {name:'굿노트 악보 2개 삭제'}).getByRole('button', {name:'2개 삭제'}).click();
  await expect(page.locator('.toast').last()).toContainText('굿노트 악보 2개를 지웠어요');
  await expect.poll(() => [fake.store.has(key('gn-1')), fake.store.has(mxl('gn-1')), fake.store.has(key('gn-2')), fake.store.has(key('hand-1'))]).toEqual([false, false, false, true]);
  expect(await songs(page)).toEqual([['song-a', ['hand-1']], ['song-b', []]]);
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.find(s => s.id === 'song-a').lyrics, KEY)).toBe('la');
  await expect(page.locator('[data-clear-goodnotes]')).toHaveCount(0); // nothing left to delete: the row is gone
});
test('without imported scores the row is not shown', async ({page}) => {
  const fake = await fakeR2(page);
  await boot(page);
  fake.store.set(key('hand-1'), {bytes:Buffer.from('%PDF-1.4'), type:'application/pdf'});
  await page.evaluate(h => VZ.change(db => { db.songs.push({id:'song-a', title:'Home', scores:[{id:'hand-1', songId:'song-a', title:'h', fileName:'h.pdf', r2Key:h, size:8, uploadedAt:1}]}); }), key('hand-1'));
  await page.goto('/#/settings');
  await expect(page.locator('[data-cats]')).toBeVisible();
  await expect(page.locator('[data-clear-goodnotes]')).toHaveCount(0);
});
