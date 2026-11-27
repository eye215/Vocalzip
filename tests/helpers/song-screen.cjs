// 곡 분석 (app/vocal-lab.js, the former 보컬 연구소): the tabs 흐름 · 녹음별 · 약한 곳 · 다음 연습 (songTab opens one;
// under two analysed takes the tabs show once a way in is tapped). In 녹음별 the per-take detail (이 녹음 자세히), the
// per-take chart (깊이 보기 › 녹음별 변화) and 깊이 보기 are folded until opened; which are open is remembered on the device
// (vzip_song_folds_v1). Specs about what is inside a fold start with them open, as on a device where they were opened once.
const KEY = 'vzip_song_folds_v1';
/** Call on a loaded app page, before (or after) the song screen is drawn: the next draw has the folds open. */
async function openFolds(page, keys = ['take', 'trend', 'deep']) {
  await page.evaluate(([key, keys]) => {
    const store = window.VzipAccountScope?.storage || localStorage;
    let now = {}; try { now = JSON.parse(store.getItem(key)) || {}; } catch {}
    store.setItem(key, JSON.stringify({...now, ...Object.fromEntries(keys.map(k => [k, true]))}));
    // Already on the screen: open what is drawn now too.
    for (const k of keys) { const d = document.querySelector(k === 'deep' ? '[data-song-section="deep"]' : '[data-song-fold="' + k + '"]'); if (d) d.open = true; }
  }, [KEY, keys]);
}
/** Shows one tab of the song screen: flow · takes · weak · next. */
async function songTab(page, k) {
  await page.locator('[data-sa-tabs]').waitFor({state:'attached'});
  const tab = page.locator('[data-sa-tab="' + k + '"]');
  if (!await tab.isVisible()) { const go = page.locator('[data-sa-go="' + k + '"]'); if (await go.count()) await go.click(); }
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await page.locator('[data-sa-panel="' + k + '"]').waitFor();
}
module.exports = {openFolds, songTab, KEY};
