// 녹음 화면 › 악보 보며 녹음: only for songs with a score, opens the score viewer (its own record bar), never mid-take.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2} = require('./helpers/r2-fixture.cjs');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
test('Recorder offers 악보 보며 녹음 only when the song has a score and opens that score', async ({page}) => {
  await fakeR2(page); await boot(page);
  await page.evaluate(() => {
    VZ.change(db => { db.songs.push({id:'with-score', title:'Kaleidoscope', scores:[{id:'sc1', title:'Kaleidoscope 보컬', r2Key:'u/ui-test-user/sc1/original.pdf'}]}, {id:'no-score', title:'No Score'}); });
    window.__opened = []; VZ.openScoreInk = (songId, scoreId) => window.__opened.push([songId, scoreId]);
  });
  await page.goto('/#/record?song=no-score');
  await expect(page.locator('[data-record-score]')).toBeHidden();
  await page.goto('/#/record?song=with-score');
  const button = page.getByRole('button', {name:/악보 보며 녹음/});
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__opened)).toEqual([['with-score', 'sc1']]);
});
