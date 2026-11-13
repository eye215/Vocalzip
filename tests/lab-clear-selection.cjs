// The vocal lab opens with the newest analysed takes already selected (it used to open empty).
// Tests that build a selection one date at a time start from "nothing selected" with this.
module.exports = async page => {
  await page.locator('.vl-dates button').first().waitFor();
  const pressed = page.locator('.vl-dates button[aria-pressed="true"]');
  while (await pressed.count()) await pressed.first().click();
};
