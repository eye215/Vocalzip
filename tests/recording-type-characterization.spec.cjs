// 녹음 유형 characterization (2026-11-16): the type a stored recording shows — its 전체 녹음 tab — must not move when the
// 종류/유형 wording is unified. The snapshot was taken from the code before that change (origin/main 729b6bb8); it covers
// every combination of recordingCategory × occasion × lesson/practice link × source × practice-room id shape.
// UPDATE_RECORDING_TYPE_SNAPSHOT=1 rewrites it — only for a deliberate, owner-approved change of the mapping.
const fs = require('fs'), path = require('path');
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, boot, fakeR2} = require('./helpers/r2-fixture.cjs');
const fixture = require('./recording-type.fixture.cjs');

const FILE = path.join(__dirname, 'recording-type-characterization.snapshot.json');
const TABS = [['all', '전체'], ['song', '곡 녹음'], ['lesson', '레슨 녹음'], ['training', '트레이닝'], ['room', '연습실']];

async function open(page) {
  const list = fixture.combos();
  await page.addInitScript(([k, db, rows]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, db); sessionStorage.setItem('seeded', '1'); }
    window.__rows = JSON.parse(rows); window.__upd = Object.fromEntries(Object.keys(window.__rows).map(id => [id, '2026-11-09T09:00:00Z']));
  }, [KEY, JSON.stringify(fixture.db(list)), JSON.stringify(fixture.rows())]);
  await fakeR2(page);
  await boot(page);
  return list;
}
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('Every stored combination keeps its 녹음 유형, and every recording stays in the same 전체 녹음 tab', async ({page}) => {
  test.skip(test.info().project.name !== 'chromium-mobile', 'one project is enough: the mapping does not depend on the screen');
  const list = await open(page);
  // The model: one letter per combination (s 곡 녹음 · l 레슨 녹음 · t 트레이닝 · r 연습실), in fixture order.
  const model = await page.evaluate(items => {
    const M = VZ.media;
    return {category:items.map(m => ({song:'s', lesson:'l', training:'t', room:'r'})[M.recordingCategory(m)] || '?').join(''),
      songSearch:items.map(m => M.songSearchEligible(m) ? '1' : '0').join('')};
  }, list.map(c => c.item));
  expect(model.category).toHaveLength(list.length);
  expect(model.category).not.toContain('?');

  // The screen: which recordings each 전체 녹음 tab lists.
  await page.goto('/#/library');
  await expect(page.locator('.lib-record').first()).toBeVisible();
  const tabs = {};
  for (const [key, label] of TABS) {
    await page.locator('[data-f=category][data-v=' + key + ']').click();
    await expect(page.locator('[data-f=category][data-v=' + key + ']')).toHaveAttribute('aria-pressed', 'true');
    tabs[label] = (await page.locator('.lib-record').evaluateAll(rows => rows.map(r => r.dataset.media))).sort();
  }
  const now = {order:'recordingCategory / occasion / link / source / id shape — tests/recording-type.fixture.cjs', count:list.length, ...model, tabs};
  if (process.env.UPDATE_RECORDING_TYPE_SNAPSHOT) { fs.writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n'); return; }
  const before = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  // A readable failure first: the combinations whose type moved.
  const moved = [...before.category].map((c, i) => c === now.category[i] ? null : list[i].key + ': ' + c + ' → ' + now.category[i]).filter(Boolean);
  expect(moved).toEqual([]);
  expect(now).toEqual(before);
  // Every tab is covered by the seed, and 전체 is the sum of the four types.
  for (const [, label] of TABS) expect(tabs[label].length).toBeGreaterThan(0);
  expect(tabs['전체']).toEqual([...tabs['곡 녹음'], ...tabs['레슨 녹음'], ...tabs['트레이닝'], ...tabs['연습실']].sort());
});
