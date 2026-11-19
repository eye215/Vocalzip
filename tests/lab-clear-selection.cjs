// 곡 하나 (the former vocal lab) opens with the newest analysed takes already selected (it used to open empty).
// Tests that build a selection one date at a time start from "nothing selected" with this. They read the per-take
// detail and chart next, so its folds are open (tests/helpers/song-screen.cjs).
const {openFolds} = require('./helpers/song-screen.cjs');
module.exports = async page => {
  await page.locator('.vl-dates button').first().waitFor();
  await openFolds(page);
  const pressed = page.locator('.vl-dates button[aria-pressed="true"]');
  while (await pressed.count()) await pressed.first().click();
};
