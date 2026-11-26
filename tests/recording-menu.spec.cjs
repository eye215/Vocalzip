// 녹음 더보기 (2026-11-16): one ⋯ menu for a recording on every screen (app/recording-menu.js) — the same items in the
// same order where they apply, 파일 삭제 last in the danger colour behind the existing confirmation, and the popover
// at the button that was pressed (also when that button has no focus, as on iPhone Safari), inside the screen at 320px.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, boot, fakeR2} = require('./helpers/r2-fixture.cjs');
const fixture = require('./recording-type.fixture.cjs');

// The canonical order. A screen shows the ones that apply, never in another order.
const ORDER = ['play', 'edit', 'song', 'type', 'share', 'analyze', 'transcript', 'room', 'download', 'delete'];
async function open(page) {
  await page.addInitScript(([k, db, rows]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, db); sessionStorage.setItem('seeded', '1'); }
    window.__rows = JSON.parse(rows); window.__upd = Object.fromEntries(Object.keys(window.__rows).map(id => [id, '2026-11-09T09:00:00Z']));
  }, [KEY, JSON.stringify(fixture.db([])), JSON.stringify(fixture.rows())]);
  await fakeR2(page);
  await boot(page);
}
const menu = page => page.locator('.sheet-back.sheet-menu .sheet').last();
const acts = page => menu(page).locator('.vz-choice').evaluateAll(rows => rows.map(r => r.dataset.act));
const close = page => page.evaluate(() => VZ.closeSheets());
const stored = (page, id) => page.evaluate(id => window.__rows[id] || null, id);
/** Each screen's way to a recording's ⋯ button (from another screen, so the list is drawn fresh each time). */
const fresh = async (page, hash) => { await page.goto('/#/home'); await page.goto('/' + hash); };
const SCREENS = {
  '전체 녹음':async (page, id) => { await fresh(page, '#/library'); const row = page.locator('.lib-record[data-media="' + id + '"]'); await row.locator('[data-toggle]').click(); return row.locator('[data-lib-row-more]'); },
  '곡 상세 › 녹음':async (page, id) => { await fresh(page, '#/song/s1'); const row = page.locator('.vz-song-media-list [data-media="' + id + '"]'); await row.locator('[data-toggle]').click(); return row.locator('[data-media-more]'); },
  '녹음 재생':async (page, id) => { await fresh(page, '#/recording/' + id); return page.locator('[data-recording] [data-media-more]'); },
  '곡 확인':async (page, id) => { await fresh(page, '#/song-suggest'); return page.locator('.vz-sc-record').filter({hasText:'유형 ' + id}).locator('.vz-sc-menu'); }
};
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('The ⋯ menu has the same items in the same order on 전체 녹음, 곡 상세, 녹음 재생 and 곡 확인', async ({page}) => {
  await open(page);
  const seen = {};
  // 녹음 재생 (#/recording/<id>) is only for a recording without a song now: one with a song opens in 곡 분석 (test below).
  for (const [screen, id] of [['전체 녹음', 'row-song-s1'], ['곡 상세 › 녹음', 'row-song-s1'], ['전체 녹음', 'row-plain'], ['녹음 재생', 'row-plain'], ['곡 확인', 'row-plain'], ['전체 녹음', 'row-explicit-training']]) {
    const more = await SCREENS[screen](page, id);
    await more.click();
    await expect(menu(page)).toBeVisible();
    const list = seen[screen + ' · ' + id] = await acts(page);
    // Only known items, each once, in the canonical order; 파일 삭제 last and in the danger colour.
    expect(list.map(a => ORDER.indexOf(a))).toEqual([...list.map(a => ORDER.indexOf(a))].sort((a, b) => a - b));
    expect(list.every(a => ORDER.includes(a)) && new Set(list).size === list.length).toBe(true);
    expect(list.at(-1)).toBe('delete');
    const colors = await menu(page).locator('.vz-choice').evaluateAll(rows => rows.map(r => getComputedStyle(r).color));
    expect(colors.at(-1)).toBe('rgb(255, 214, 223)');
    expect(new Set(colors.slice(0, -1))).toEqual(new Set(['rgb(255, 255, 255)']));
    // No second level for delete, no title or divider: the dark popover of the design system.
    await expect(menu(page).locator('details, summary')).toHaveCount(0);
    await expect(menu(page).locator('[data-act=type]')).toContainText('녹음 유형');
    await close(page);
  }
  // A 곡 녹음 with a song in the cloud store: everything applies, identically on the screens that list it.
  const full = ['play', 'edit', 'song', 'type', 'share', 'analyze', 'download', 'delete'];
  expect(seen['전체 녹음 · row-song-s1']).toEqual(full);
  expect(seen['곡 상세 › 녹음 · row-song-s1']).toEqual(full);
  // No song yet: 보컬 분석 is left out (곡 지정 is right there); 곡 확인 adds its 전사 확인.
  const noSong = full.filter(a => a !== 'analyze');
  expect(seen['전체 녹음 · row-plain']).toEqual(noSong);
  expect(seen['녹음 재생 · row-plain']).toEqual(noSong);
  expect(seen['곡 확인 · row-plain']).toEqual(['play', 'edit', 'song', 'type', 'share', 'transcript', 'download', 'delete']);
  // 트레이닝: no song to assign or analyse.
  expect(seen['전체 녹음 · row-explicit-training']).toEqual(['play', 'edit', 'type', 'share', 'download', 'delete']);
  // The words are the same too.
  const more = await SCREENS['전체 녹음'](page, 'row-song-s1'); await more.click();
  await expect(menu(page).locator('.vz-choice')).toHaveText([/^\s*(재생|일시정지)\s*$/, /^\s*정보 수정\s*$/, /^\s*곡 지정\s*$/, /녹음 유형\s*곡 녹음/, /^\s*공유 링크\s*$/, /^\s*보컬 분석\s*$/, /^\s*음원 다운로드\s*$/, /^\s*파일 삭제\s*$/]);
});

test('Each item does what it did: 정보 수정, 곡 지정 (title follows the song), 공유, 보컬 분석, and 삭제 behind its confirmation', async ({page}) => {
  await open(page);
  let more = await SCREENS['전체 녹음'](page, 'row-plain');
  // 정보 수정 → the sheet; a rating alone keeps the title.
  await more.click(); await menu(page).locator('[data-act=edit]').click();
  await page.getByRole('button', {name:'만족도 5'}).click();
  await page.getByRole('button', {name:'저장'}).click();
  await expect.poll(async () => (await stored(page, 'row-plain')).rating).toBe(5);
  expect((await stored(page, 'row-plain')).name).toBe('유형 row-plain');
  // 곡 지정 → pick, confirm, saved; the owner's rule renames it to "곡명 YYYY.MM.DD" and keeps the old title in the memo.
  more = await SCREENS['전체 녹음'](page, 'row-plain');
  await more.click(); await menu(page).locator('[data-act=song]').click();
  await page.locator('.sheet').last().getByText('On My Own').click();
  await expect(page.locator('.sheet').last()).toContainText('1개 녹음의 곡을 "On My Own"');
  await page.getByRole('button', {name:'바꾸기'}).click();
  await expect.poll(async () => (await stored(page, 'row-plain')).songId).toBe('s2');
  const renamed = await stored(page, 'row-plain');
  expect(renamed.name).toBe('On My Own 2026.11.09');
  expect(renamed.review).toContain('유형 row-plain');
  expect(renamed.rating).toBe(5);
  // 공유 링크 and 보컬 분석 open what they opened before.
  more = await SCREENS['곡 상세 › 녹음'](page, 'row-song-s1');
  await more.click(); await menu(page).locator('[data-act=share]').click();
  await expect(page.getByRole('dialog', {name:'공유 링크'})).toBeVisible();
  await close(page);
  await more.click(); await menu(page).locator('[data-act=analyze]').click();
  await expect(page).toHaveURL(/#\/growth-song\/s1\?selection=1/);

  // 파일 삭제: the same confirmation as before; 취소 keeps the file, 파일 영구 삭제 removes it.
  more = await SCREENS['전체 녹음'](page, 'row-import');
  await more.click(); await menu(page).locator('[data-act=delete]').click();
  const ask = page.getByRole('dialog', {name:'파일 영구 삭제'});
  await expect(ask).toContainText('“유형 row-import” 파일을 삭제할까요?');
  await ask.getByRole('button', {name:'취소'}).click();
  expect(await stored(page, 'row-import')).not.toBeNull();
  await more.click(); await menu(page).locator('[data-act=delete]').click();
  await ask.getByRole('button', {name:'파일 영구 삭제'}).click();
  await expect(page.locator('.lib-record[data-media="row-import"]')).toHaveCount(0);
  await expect.poll(() => stored(page, 'row-import')).toBeNull();
});

/** Tap ⋯ the way iPhone Safari does: the button does not take focus. Returns the popover and button boxes. */
async function tapUnfocused(page, more) {
  await more.evaluate(button => { document.activeElement?.blur?.(); button.click(); });
  await expect(menu(page)).toBeVisible();
  return {box:await menu(page).boundingBox(), button:await more.boundingBox(), view:page.viewportSize()};
}
const inside = ({box, view}) => box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height;
/** Right under or right over the button; when the rows fit neither way, still touching the button. */
const atButton = ({box, button, view}) => {
  const under = Math.abs(box.y - (button.y + button.height + 8)) <= 2, over = Math.abs(box.y + box.height - (button.y - 8)) <= 2;
  const roomUnder = button.y + button.height + 8 + box.height <= view.height - 12, roomOver = button.y - 8 - box.height >= 12;
  return roomUnder ? under : roomOver ? over : box.y <= button.y + button.height + 10 && box.y + box.height >= button.y - 10;
};

for (const [width, height] of [[320, 568], [375, 812]]) test('The popover opens at its ⋯ button without focus and stays inside a ' + width + '×' + height + ' screen', async ({page}) => {
  test.skip(test.info().project.name !== 'chromium-mobile', 'phone sizes are set explicitly');
  await page.setViewportSize({width, height});
  await open(page);
  for (const [screen, id] of [['전체 녹음', 'row-song-s1'], ['곡 상세 › 녹음', 'row-song-s1'], ['녹음 재생', 'row-plain'], ['곡 확인', 'row-plain']]) {
    const more = await SCREENS[screen](page, id);
    // Once as it sits, once with the button low on the screen (where an unanchored popover used to open at the top).
    for (const low of [false, true]) {
      if (low) await more.evaluate((button, height) => scrollBy(0, button.getBoundingClientRect().bottom - (height - 150)), height);
      const placed = await tapUnfocused(page, more);
      expect(inside(placed), screen + ' inside the screen').toBe(true);
      expect(atButton(placed), screen + (low ? ' (button low)' : '') + ' at its button ' + JSON.stringify(placed)).toBe(true);
      expect(placed.box.width).toBeLessThanOrEqual(304);
      // Every row is a 44px+ target and none is cut off sideways.
      const rows = await menu(page).locator('.vz-choice').evaluateAll(rows => rows.map(r => { const b = r.getBoundingClientRect(); return {h:b.height, in:b.left >= 0 && b.right <= innerWidth, clipped:r.scrollWidth > r.clientWidth + 1}; }));
      expect(rows.filter(r => r.h < 44 || !r.in || r.clipped)).toEqual([]);
      await close(page);
    }
    // The 녹음 유형 choices open at the same button.
    await more.evaluate(button => { document.activeElement?.blur?.(); button.click(); });
    await menu(page).locator('[data-act=type]').click();
    await expect(menu(page).locator('[data-kind]').first()).toBeVisible();
    const choice = {box:await menu(page).boundingBox(), button:await more.boundingBox(), view:page.viewportSize()};
    expect(inside(choice) && atButton(choice), screen + ' 녹음 유형 choices ' + JSON.stringify(choice)).toBe(true);
    await close(page);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

for (const [width, height] of [[834, 1194], [1280, 900]]) test('Tablet ' + width + '×' + height + ': the popover is 304px wide, right under its ⋯ button, right edges together', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width, height});
  await open(page);
  for (const [screen, id] of [['전체 녹음', 'row-song-s1'], ['곡 상세 › 녹음', 'row-song-s1'], ['곡 확인', 'row-plain']]) {
    const more = await SCREENS[screen](page, id);
    const placed = await tapUnfocused(page, more);
    expect(inside(placed) && atButton(placed), screen + ' ' + JSON.stringify(placed)).toBe(true);
    expect(Math.round(placed.box.width)).toBe(304);
    expect(Math.abs(placed.box.x + placed.box.width - (placed.button.x + placed.button.width))).toBeLessThanOrEqual(2);
    await close(page);
  }
});

test('An old #/recording/<id> link of a recording with a song opens the song growth screen on that take; without a song it stays the playback page', async ({page}) => {
  await open(page);
  await fresh(page, '#/recording/row-song-s1');
  await expect(page).toHaveURL(/#\/growth-song\/s1\?a=row-song-s1$/);
  await expect(page.locator('.vl-player-title strong')).toHaveText('유형 row-song-s1');
  // A 트레이닝 practice take of the song (연습 녹음 포함 off): the same take opens, not the newest song take.
  expect(await page.evaluate(() => window.VZ.growthSong?.practice?.())).toBeFalsy();
  await page.evaluate(() => { window.__rows['row-practice-training'].songId = 's1'; window.__upd['row-practice-training'] = '2026-11-10T09:00:00Z'; window.VZ.media.invalidate(); });
  await fresh(page, '#/recording/row-practice-training');
  await expect(page).toHaveURL(/#\/growth-song\/s1\?a=row-practice-training$/);
  await expect(page.locator('.vl-player-title strong')).toHaveText('유형 row-practice-training');
  // 뒤로 does not come back to the old link (replace).
  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  // A song that is gone: the playback page as before.
  await page.evaluate(() => { window.__rows['row-plain'].songId = 'gone-song'; window.__upd['row-plain'] = '2026-11-10T09:00:00Z'; window.VZ.media.invalidate(); });
  await fresh(page, '#/recording/row-plain');
  await expect(page.locator('[data-recording] [data-media-more]')).toBeVisible();
  await expect(page).toHaveURL(/#\/recording\/row-plain$/);
});

test('A 연습실 recording has a way back: ⋯ › 연습실에서 보기 opens its submission in 노래 연습실', async ({page}) => {
  await open(page);
  // The recording of a submission that is still in the records opens that result.
  let more = await SCREENS['녹음 재생'](page, 'roomsubmit1-0');
  await more.click();
  expect(await acts(page)).toEqual(['play', 'edit', 'type', 'share', 'room', 'download', 'delete']);
  await expect(menu(page).locator('[data-act=room]')).toHaveText(/^\s*연습실에서 보기\s*$/);
  await menu(page).locator('[data-act=room]').click();
  await expect(page).toHaveURL(/#\/practice-room\?result=roomsubmit1$/);
  await expect(page.locator('iframe.vzip-practice-room-frame')).toHaveAttribute('src', /[?&]result=roomsubmit1(&|$)/);
  await expect(page.frameLocator('iframe.vzip-practice-room-frame').locator('body')).toContainText('편한 소리로 한 구절 남기기'); // that submission's result
  // 뒤로 returns to the recording.
  await page.goBack();
  await expect(page).toHaveURL(/#\/recording\/roomsubmit1-0$/);
  // A 연습실 recording without a matching submission opens 노래 연습실 itself; other types have no such row.
  more = await SCREENS['전체 녹음'](page, 'row-source-room');
  await more.click();
  await menu(page).locator('[data-act=room]').click();
  await expect(page).toHaveURL(/#\/practice-room$/);
  more = await SCREENS['전체 녹음'](page, 'row-plain');
  await more.click();
  await expect(menu(page).locator('[data-act=room]')).toHaveCount(0);
});
