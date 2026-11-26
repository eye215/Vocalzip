// iPhone greys out .m4a (voice memos) in the Files picker unless the extension is listed next to audio/*.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2} = require('./helpers/r2-fixture.cjs');
// 전체 녹음 + opens 가져오기 (화면 지도 정리, 2026-11-26): the files are picked there, from iCloud Drive (파일 앱).
test('전체 녹음 + → 가져오기 › iCloud Drive picker lists audio extensions so iPhone can pick m4a voice memos', async ({page}) => {
  await fakeR2(page); await boot(page);
  await page.goto('/#/library');
  await page.locator('[data-imp]').click();
  await expect(page).toHaveURL(/#\/import-hub$/);
  await page.getByRole('button', {name:/iCloud Drive/}).click();
  const accept = await page.locator('[data-files]').getAttribute('accept');
  for (const ext of ['audio/*', 'video/*', '.m4a', '.mp3', '.wav', '.aac', '.caf', '.mov', '.mp4']) expect(accept.split(',')).toContain(ext);
});
