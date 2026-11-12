// iPhone greys out .m4a (voice memos) in the Files picker unless the extension is listed next to audio/*.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2} = require('./helpers/r2-fixture.cjs');
test('전체 녹음 + picker lists audio extensions so iPhone can pick m4a voice memos', async ({page}) => {
  await fakeR2(page); await boot(page);
  await page.goto('/#/library');
  const accept = await page.locator('[data-imp-native]').getAttribute('accept');
  for (const ext of ['audio/*', 'video/*', '.m4a', '.mp3', '.wav', '.aac', '.caf', '.mov', '.mp4']) expect(accept.split(',')).toContain(ext);
});
