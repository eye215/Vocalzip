// 짧은 녹음 안내: a song take under 10 seconds is held by the growth analysis (it needs 10 s of singing), so the
// recording review says so before saving. Lesson / free recordings (no song) and longer takes get no note.
const {test, expect} = require('@playwright/test');
const path = require('node:path');
test('the short-take note appears only for song takes under 10 seconds', async ({page}) => {
  await page.goto('/practice-room/lessons.js'); await page.setContent('<main></main>');
  await page.evaluate(() => { window.VZ = {route() {}, esc:s => String(s), db:{songs:[]}}; });
  await page.addScriptTag({path:path.resolve('app/views-main.js')}).catch(() => {});
  const note = (s, song) => page.evaluate(([s, song]) => VZ.shortTakeNote(s, song), [s, song]);
  expect(await note(6.4, 's1')).toContain('6초 녹음이에요');
  expect(await note(6.4, 's1')).toContain('판정 보류');
  expect(await note(9.9, 's1')).not.toBe('');
  expect(await note(10, 's1')).toBe('');
  expect(await note(45, 's1')).toBe('');
  expect(await note(6, '')).toBe('');      // not a song take
  expect(await note(0, 's1')).toBe('');    // unknown length
  expect(await note(NaN, 's1')).toBe('');
});
