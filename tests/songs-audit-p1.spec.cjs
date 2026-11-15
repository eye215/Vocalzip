// 곡 목록 · 곡 상세 audit (2026-11-13): a long AR address stays inside the page, the tabs are on the first screen and
// nothing is ticked for analysis by itself, a song's keys live in one place and are understood however they are written,
// AR links have their own sheet and menu, the 레퍼토리 memo can be edited where it is shown, and a song with more than a
// thousand recordings draws 50 rows at a time, once.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, R2, boot, fakeR2, wav} = require('./helpers/r2-fixture.cjs');

const LONG = 'https://www.youtube.com/watch?v=abcdefghijk&list=PL' + 'x'.repeat(70) + '&index=12&pp=' + 'a'.repeat(70);
const BASE = new Date(2026, 10, 10, 12).getTime();
const rec = (id, songId, name, i, extra = {}) => ({id, name, created:BASE - i * 3600000, type:'audio/mp4', source:'practice', songId, song:'', durationSeconds:60 + i, storageProvider:'r2', r2Key:'u/ui-test-user/' + id + '/original.m4a', size:200000, ...extra});
const mr = (id, title) => ({id, kind:'file', title, fileName:title + '.wav', type:'audio/wav', r2Key:'u/ui-test-user/' + id + '/original.wav', size:32044, created:1});
const score = (id, extra = {}) => ({id, songId:'k1', title:'보컬 악보', fileName:'vocal.pdf', r2Key:'u/ui-test-user/' + id + '/original.pdf', size:120000, uploadedAt:BASE, updatedAt:BASE, ...extra});
/** s1: a song with everything filled in · s2: nothing · k1: keys only on an older score · k2: two MRs · big: `big` recordings. */
function seed({big = 0} = {}) {
  const rows = {};
  for (let i = 0; i < big; i++) { const id = 'rec-' + String(i).padStart(4, '0'); rows[id] = rec(id, 'big', 'Big Song ' + i, i); }
  rows.m0 = rec('m0', 's1', 'This Is the Moment 2026-11-10', 0);
  rows.m1 = rec('m1', 's1', 'This Is the Moment 2026-11-09 2', 30);
  rows.m2 = rec('m2', 's1', '갈라 리허설', 60, {occasion:'performance'});
  rows.m3 = rec('m3', 's1', 'This Is the Moment', 90);
  const db = {categories:[], lessons:[], assignments:[], comparisonReports:[],
    practices:[{id:'p1', date:'2026-11-10', minutes:20, mediaIds:['m0'], practiceMode:'song', songId:'s1', technique:[], rating:4, memo:'2절 고음 연습', completed:[]}],
    performances:[{id:'show1', ownerId:'ui-test-user', title:'갈라 콘서트', start:'2026-11-20', end:'', status:'preparing', venue:'', company:'', role:'', casting:'', team:'', memo:'', sessions:[], songLinks:[], assets:[]}],
    songs:[
      {id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드', arLinks:[{label:'원곡', url:LONG}],
        repertoire:{ownerId:'ui-test-user', status:'practicing', skills:{lyrics:4, melody:3}, originalKey:'E', practiceKey:'D', stageKey:'Eb', transposeNote:'', memo:'2막 피날레. 고음 전 호흡 길게.', takeId:'gone-take'}},
      {id:'s2', title:'On My Own', show:''},
      {id:'k1', title:'Bring Him Home', show:'레미제라블', scores:[score('sc-old', {originalKey:'D', practiceKey:'F'})], mrTracks:[mr('mr-k1', '원키 반주')]},
      {id:'k2', title:'Stars', show:'레미제라블', mrKeyShift:-1, repertoire:{ownerId:'ui-test-user', originalKey:'D', practiceKey:'F'}, mrTracks:[mr('mr-a', '원키 반주'), mr('mr-b', '낮춘 반주')]},
      {id:'big', title:'Big Song', show:'Wicked'}]};
  return {db, rows};
}
async function open(page, options) {
  const s = seed(options);
  await page.addInitScript(([k, db, rows]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, db); sessionStorage.setItem('seeded', '1'); }
    window.__rows = JSON.parse(rows); window.__upd = Object.fromEntries(Object.keys(window.__rows).map(id => [id, '2026-11-05T09:00:00Z']));
  }, [KEY, JSON.stringify(s.db), JSON.stringify(s.rows)]);
  // The MR key library comes from a CDN: a stand-in keeps these tests about keys and storage, not about audio.
  await page.context().route('**/signalsmith-stretch@1.3.2/SignalsmithStretch.mjs', r => r.fulfill({contentType:'text/javascript', headers:{'access-control-allow-origin':'*'}, body:'export default async ctx => { const node = ctx.createGain(); node.schedule = () => {}; return node; };'}));
  const fake = await fakeR2(page);
  for (const id of ['mr-k1', 'mr-a', 'mr-b']) fake.store.set('u/ui-test-user/' + id + '/original.wav', {bytes:wav(1), type:'audio/wav', etag:'"' + id + '"'});
  await boot(page);
  return fake;
}
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const song = async (page, id) => (await stored(page)).songs.find(s => s.id === id);
const pageWidth = page => page.evaluate(() => document.documentElement.scrollWidth);
const rows = page => page.locator('[data-song-media] > [data-media]');
const dialog = page => page.locator('.archive-sheet');
const saveDialog = async page => { await dialog(page).getByRole('button', {name:'저장', exact:true}).click(); await expect(dialog(page)).toHaveCount(0); };
/** Opens a song on a phone-sized screen and waits for its recordings (when it has any). */
async function openSong(page, id, {width = 375, height = 812, media = true} = {}) {
  await page.setViewportSize({width, height});
  await page.goto('/#/song/' + id);
  await expect(page.locator('.song-tabs')).toBeVisible();
  if (media) await expect(rows(page).first()).toBeVisible();
}
/** Smallest side of each visible element: touch targets are 44px (0.5px tolerance for sub-pixel layout). */
async function expectTargets(locator) {
  for (const el of await locator.all()) { if (!await el.isVisible()) continue; const box = await el.boundingBox(); expect(Math.min(box.width, box.height), await el.getAttribute('aria-label') || '').toBeGreaterThanOrEqual(43.5); }
}
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('A long AR address is cut with …; the page never scrolls sideways (375 and 320)', async ({page}) => {
  await open(page);
  for (const width of [375, 320]) {
    await openSong(page, 's1', {width, media:false});
    await page.locator('[data-tab=ar]').click();
    const item = page.locator('.vz-ar-item').first();
    await expect(item).toBeVisible();
    expect(await pageWidth(page), width + 'px page width').toBeLessThanOrEqual(width + 1);
    const box = await item.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // One line ending in …; the link itself is still the whole address.
    expect(await item.locator('small').evaluate(el => ({cut:el.scrollWidth > el.clientWidth, style:getComputedStyle(el).textOverflow, lines:Math.round(el.getBoundingClientRect().height)}))).toMatchObject({cut:true, style:'ellipsis'});
    await expect(item.locator('a')).toHaveAttribute('href', LONG);
    await expectTargets(item.locator('button'));
  }
});

test('First screen of a song on a phone: tabs are visible, 레퍼토리 is one compact card, nothing is ticked for analysis', async ({page}) => {
  await open(page);
  await openSong(page, 's1');
  await page.waitForTimeout(500); // the list has settled (loading used to tick every row again)
  const tabs = await page.locator('.song-tabs').boundingBox();
  expect(tabs.y + tabs.height, 'tabs end in the upper half of an 812px screen').toBeLessThan(406);
  // 나의 레퍼토리: a summary of at most two lines; its rows are closed until asked for.
  const summary = page.locator('[data-rep-toggle]');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(summary).toContainText('연습 중 · 숙련도 3.5/5');
  await expect(summary).toContainText('원키 E · 연습키 D · 공연키 Eb');
  expect((await summary.boundingBox()).height).toBeLessThanOrEqual(76);
  await expect(page.locator('[data-rep-detail]')).toBeHidden();
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-rep=status]')).toBeVisible();
  await summary.click();
  await expect(page.locator('[data-rep-detail]')).toBeHidden();
  // Nothing is chosen for analysis by itself: no 보컬 분석하기 bar, 선택 0개, and the lab link is always there.
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('[data-selected-count]')).toHaveText('선택 0개');
  await expect(page.getByRole('checkbox', {name:'녹음 전체선택'})).not.toBeChecked();
  await expect(page.locator('.vz-media-selection')).toHaveCount(0);
  await expect(rows(page).locator('.vz-media-select[aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('.vz-song-lab')).toHaveAttribute('href', '#/vocal-lab/s1');
  await expectTargets(page.locator('.vz-song-lab'));
  // Choosing a recording brings 보컬 분석하기.
  await rows(page).first().locator('.vz-media-select').click();
  await expect(page.locator('[data-selected-count]')).toHaveText('선택 1개');
  await expect(page.getByRole('button', {name:'보컬 분석하기'})).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(376);
});

test('레퍼토리 메모 is edited where it is shown; an unreadable 대표 테이크 says its choice is kept', async ({page}) => {
  await open(page);
  await openSong(page, 's1');
  const before = (await song(page, 's1')).repertoire;
  await page.locator('[data-rep-toggle]').click();
  await expect(page.locator('[data-repertoire]')).not.toContainText('원본 연결은 유지됩니다');
  await expect(page.locator('.archive-song-take')).toContainText('지금은 녹음을 불러올 수 없어요. 지정은 그대로예요.');
  const memo = page.locator('[data-rep=memo]');
  await expect(memo).toContainText('2막 피날레. 고음 전 호흡 길게.');
  await memo.click();
  await expect(page.getByRole('dialog', {name:'레퍼토리 메모'})).toBeVisible();
  await expect(dialog(page).locator('[name=memo]')).toHaveValue('2막 피날레. 고음 전 호흡 길게.');
  await dialog(page).locator('[name=memo]').fill('브리지부터 다시\n둘째 줄');
  await saveDialog(page);
  // Shown at once in the open panel and in the summary; everything else about the repertoire is as it was.
  await expect(memo).toContainText('브리지부터 다시');
  await expect(page.locator('[data-rep-toggle]')).toContainText('브리지부터 다시 둘째 줄');
  await expect(page.locator('[data-rep-detail]')).toBeVisible();
  expect((await song(page, 's1')).repertoire).toMatchObject({...before, memo:'브리지부터 다시\n둘째 줄'});
  // The song menu reaches the same editor; an emptied memo shows the way back in.
  await page.locator('[data-song-menu]').click();
  await page.locator('.sheet [data-rep-menu]').click();
  await page.locator('.sheet [data-rep=memo]').click();
  await dialog(page).locator('[name=memo]').fill('');
  await saveDialog(page);
  await expect(memo).toContainText('메모 적기');
  expect((await song(page, 's1')).repertoire.takeId).toBe('gone-take');
});

test('AR links have their own sheet: add with a checked address, edit, delete after a confirmation', async ({page}) => {
  await open(page);
  await openSong(page, 's1');
  await page.locator('[data-tab=ar]').click();
  const items = page.locator('.vz-ar-item'), form = page.locator('#song-ar-link'), status = form.locator('[data-ar-status]'), save = page.locator('.sheet [data-ar-save]');
  await expect(items).toHaveCount(1);
  // + opens the small sheet, not 곡 수정.
  await page.locator('[data-add-song-ar]').click();
  await expect(page.getByRole('dialog', {name:'AR 링크 추가'})).toBeVisible();
  await expect(page.locator('#song-form')).toHaveCount(0);
  await save.click();
  await expect(status).toHaveText('링크 주소를 입력해 주세요.');
  await form.locator('[name=url]').fill('ftp://example.com/file');
  await expect(status).toHaveText('');
  await save.click();
  await expect(status).toHaveText('http:// 또는 https://로 시작하는 주소를 입력해 주세요.');
  expect((await song(page, 's1')).arLinks).toHaveLength(1); // nothing was saved
  await form.getByLabel('이름 (선택)').fill('연습 영상');
  await form.locator('[name=url]').fill('https://example.com/practice');
  await save.click();
  await expect(form).toHaveCount(0);
  await expect(items).toHaveCount(2);
  await expect(items.nth(1).locator('a')).toHaveAttribute('href', 'https://example.com/practice');
  await expect(items.nth(1).locator('a')).toHaveAttribute('target', '_blank');
  let links = (await song(page, 's1')).arLinks;
  expect(links[1]).toMatchObject({label:'연습 영상', url:'https://example.com/practice'});
  expect(links[1].id).toBeTruthy();
  expect(links[0]).toEqual({label:'원곡', url:LONG}); // the older link is untouched
  await expectTargets(items.nth(1).locator('button'));
  // ⋯ › 수정: the older link (it has no id yet) keeps its address and gets the new name.
  await items.first().locator('[data-ar-more]').click();
  await page.locator('.sheet [data-ar-edit]').click();
  await expect(page.getByRole('dialog', {name:'AR 링크 수정'})).toBeVisible();
  await expect(form.locator('[name=url]')).toHaveValue(LONG);
  await form.getByLabel('이름 (선택)').fill('원곡 영상');
  await save.click();
  await expect(form).toHaveCount(0);
  await expect(items.first()).toContainText('원곡 영상');
  links = (await song(page, 's1')).arLinks;
  expect(links.map(l => [l.label, l.url])).toEqual([['원곡 영상', LONG], ['연습 영상', 'https://example.com/practice']]);
  // ⋯ › 삭제 asks first: 취소 keeps the link, 삭제 removes only that one.
  const remove = async () => { await items.nth(1).locator('[data-ar-more]').click(); await page.locator('.sheet [data-ar-delete]').click(); await expect(page.getByRole('dialog', {name:'AR 링크 삭제'})).toContainText('"연습 영상" 링크를 이 곡에서 삭제할까요?'); };
  await remove();
  await page.locator('.sheet-alert .sheet-foot [data-close]').click();
  await expect(items).toHaveCount(2);
  await remove();
  await page.locator('.sheet-alert [data-ok]').click();
  await expect(items).toHaveCount(1);
  expect((await song(page, 's1')).arLinks.map(l => l.label)).toEqual(['원곡 영상']);
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.locator('[data-tab=ar]').click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('원곡 영상');
});

test("A song's keys live in one place: 키 정보, the score sheet and the MR suggestion read and write the same values", async ({page}) => {
  await open(page);
  await openSong(page, 'k1', {media:false});
  const summary = page.locator('[data-rep-toggle]'), scoreRow = page.locator('[data-score="sc-old"]');
  const mrHint = async text => { await page.locator('[data-tab=ar]').click(); await page.locator('[data-mr-open]').first().click(); await expect(page.locator('[data-mr-key-practice]')).toContainText(text); };
  // Older data: the keys were typed on a score. They show everywhere as the song's keys.
  await expect(summary).toContainText('원키 D · 연습키 F');
  await page.locator('[data-tab=scores]').click();
  await expect(scoreRow).toContainText('원키 D · 연습 F');
  await mrHint('MR +3으로 맞추기');
  await expect(page.locator('[data-mr-key-practice]')).toContainText('연습 키 F');
  // 키 정보 starts from those keys; keys are free text, and a key the app cannot read says so and is kept as typed.
  await summary.click();
  await page.locator('[data-rep=keys]').click();
  const field = name => dialog(page).getByLabel(name, {exact:true}), note = name => dialog(page).locator('[data-key-note="' + name + '"]');
  await expect(field('원키')).toHaveValue('D');
  await expect(field('연습키')).toHaveValue('F');
  await field('원키').fill('Eb major');
  await expect(note('originalKey')).toBeHidden();
  await field('연습키').fill('여자 키');
  await expect(note('practiceKey')).toHaveText('이 표기는 MR 키 맞추기에 쓸 수 없어요. 적은 그대로 메모처럼 보관해요.');
  await field('공연키').fill('D');
  await saveDialog(page);
  let saved = await song(page, 'k1');
  expect(saved.repertoire).toMatchObject({originalKey:'Eb major', practiceKey:'여자 키', stageKey:'D'});
  expect(saved.repertoire.keysAt).toBeGreaterThan(0);
  expect(saved.scores[0]).toMatchObject({originalKey:'D', practiceKey:'F'}); // what was typed on the score is not rewritten
  await expect(summary).toContainText('원키 Eb major · 연습키 여자 키 · 공연키 D');
  await mrHint('키 표기를 알아볼 수 없어 직접 맞춰 주세요');
  await expect(page.locator('[data-mr-key-practice]')).toBeDisabled();
  // The score sheet shows the same keys as typed. Saving without touching them changes nothing.
  await page.locator('[data-tab=scores]').click();
  await expect(scoreRow).toContainText('원키 Eb major · 연습 여자 키');
  const sheet = page.getByRole('dialog', {name:'악보 정보'});
  await scoreRow.locator('[data-edit]').click();
  await expect(sheet.locator('[name=originalKey]')).toHaveValue('Eb major');
  await expect(sheet.locator('[name=practiceKey]')).toHaveValue('여자 키');
  await sheet.getByRole('button', {name:'저장'}).click();
  await expect(sheet).toHaveCount(0);
  expect((await song(page, 'k1')).repertoire).toEqual(saved.repertoire);
  // Choosing a key there saves it on the song; the other key stays exactly as typed.
  await scoreRow.locator('[data-edit]').click();
  await sheet.locator('[name=practiceKey]').selectOption('A');
  await sheet.getByRole('button', {name:'저장'}).click();
  await expect(sheet).toHaveCount(0);
  saved = await song(page, 'k1');
  expect(saved.repertoire).toMatchObject({originalKey:'Eb major', practiceKey:'A', stageKey:'D'});
  expect(saved.scores[0]).toMatchObject({originalKey:'D', practiceKey:'F'});
  await expect(scoreRow).toContainText('원키 Eb major · 연습 A');
  await expect(summary).toContainText('원키 Eb major · 연습키 A');
  await mrHint('MR +6으로 맞추기'); // "Eb major" → A
  // A key cleared in 키 정보 stays cleared: the older score value does not come back.
  await page.locator('[data-rep=keys]').click();
  await field('원키').fill('');
  await saveDialog(page);
  await expect(summary).not.toContainText('원키');
  await page.locator('[data-tab=scores]').click();
  await expect(scoreRow).not.toContainText('원키');
  await expect(scoreRow).toContainText('연습 A');
  await mrHint('원키를 적으면 맞춰 드려요');
});

test('Each MR remembers its own key shift; an MR without one keeps the shift the song had', async ({page}) => {
  await open(page);
  await openSong(page, 'k2', {media:false});
  await page.locator('[data-tab=ar]').click();
  const row = id => page.locator('[data-mr="' + id + '"]'), value = page.locator('[data-mr-key-value]');
  await expect(row('mr-a').locator('[data-mr-open] small')).toContainText('키 −1');
  await expect(row('mr-b').locator('[data-mr-open] small')).toContainText('키 −1');
  await row('mr-a').locator('[data-mr-open]').click();
  await expect(value).toHaveText('−1');
  await expect(page.locator('[data-mr-key-practice]')).toContainText('MR +3으로 맞추기');
  for (let i = 0; i < 3; i++) await page.locator('[data-mr-key-up]').click();
  await expect(value).toHaveText('+2');
  await expect.poll(async () => (await song(page, 'k2')).mrTracks[0].keyShift).toBe(2);
  // Only this MR changed.
  const saved = await song(page, 'k2');
  expect(saved.mrKeyShift).toBe(-1);
  expect(saved.mrTracks[1].keyShift).toBeUndefined();
  await expect(row('mr-a').locator('[data-mr-open] small')).toContainText('키 +2');
  await expect(row('mr-b').locator('[data-mr-open] small')).toContainText('키 −1');
  await row('mr-b').locator('[data-mr-open]').click();
  await expect(value).toHaveText('−1');
  await value.click(); // back to the original key for this MR only
  await expect(value).toHaveText('원키');
  await expect.poll(async () => (await song(page, 'k2')).mrTracks[1].keyShift).toBe(0);
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.locator('[data-tab=ar]').click();
  await expect(row('mr-a').locator('[data-mr-open] small')).toContainText('키 +2');
  await expect(row('mr-b').locator('[data-mr-open] small')).not.toContainText('키');
});

test('공연곡 연결: 공연 당시 키 starts from the song key until something is typed', async ({page}) => {
  await open(page);
  await page.goto('/#/show/show1');
  await page.locator('[data-link-songs]').click();
  const key = dialog(page).getByLabel('공연 당시 키', {exact:true}), pick = dialog(page).getByLabel('연결할 기존 곡', {exact:true});
  await pick.selectOption('s1');
  await expect(key).toHaveValue('Eb'); // 공연키
  await pick.selectOption('k2');
  await expect(key).toHaveValue('F');  // no 공연키: 연습키
  await pick.selectOption('s2');
  await expect(key).toHaveValue('');
  await key.fill('G');
  await pick.selectOption('s1');
  await expect(key).toHaveValue('G');  // typed: kept
  await saveDialog(page);
  expect((await stored(page)).performances[0].songLinks[0]).toMatchObject({songId:'s1', key:'G'});
});

test('A song with 1,223 recordings draws 50 rows once, adds 50 at a time and keeps scroll, ticks and rows', async ({page}) => {
  test.setTimeout(90000);
  await open(page, {big:1223});
  await page.setViewportSize({width:375, height:812});
  await page.goto('/#/songs');
  await expect(page.locator('.vz-song-list')).toBeVisible();
  await page.waitForTimeout(600); // the recording list is loaded and kept, as on a second visit
  // Count how often the list is put on the page while the song opens and its list is read again.
  await page.evaluate(() => {
    window.__builds = 0;
    new MutationObserver(list => { for (const m of list) if (m.target.matches?.('[data-body]')) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches('[data-song-media]')) window.__builds++; }).observe(document.body, {childList:true, subtree:true});
    location.hash = '#/song/big';
  });
  await expect(rows(page).first()).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(rows(page)).toHaveCount(50);
  expect(await page.evaluate(() => window.__builds), 'the list is built once').toBe(1);
  expect(await page.evaluate(() => document.querySelectorAll('*').length), 'elements on the page').toBeLessThan(2500);
  await expect(page.locator('.vz-song-section h2').first()).toHaveText('녹음 1223');
  await expect(page.locator('[data-summary]')).toContainText('녹음 1223개');
  const more = page.locator('[data-more-rows]'), all = page.locator('[data-all]'), count = page.locator('[data-selected-count]');
  await expect(more).toHaveText('더 보기 (1,173개 남음)');
  await expect(page.locator('[data-all-label]')).toHaveText('보이는 50개 선택');
  // A change that does not touch what is shown (another song renamed on another device) leaves the rows alone.
  await page.evaluate(() => { document.querySelector('[data-song-media] > [data-media]').__kept = true; });
  await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.songs.find(s => s.id === 's2').title = 'On My Own (다른 기기)'; localStorage.setItem(k, JSON.stringify(d)); window.dispatchEvent(new Event('vzip:data-changed')); }, KEY);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => [window.__builds, document.querySelector('[data-song-media] > [data-media]').__kept === true])).toEqual([1, true]);
  // Tick two rows in the middle of the list, then ask for more: rows are added below, nothing else moves.
  await page.evaluate(() => scrollTo(0, 2000));
  const picked = await page.evaluate(() => [...document.querySelectorAll('[data-song-media] > [data-media]')].slice(20, 22).map(row => { row.querySelector('.vz-media-select').click(); return row.dataset.media; }));
  await expect(count).toHaveText('선택 2개');
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(1500);
  await more.evaluate(el => el.click());
  await expect(rows(page)).toHaveCount(100);
  await expect(more).toHaveText('더 보기 (1,123개 남음)');
  expect(Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThanOrEqual(2);
  await expect(count).toHaveText('선택 2개');
  expect(await page.evaluate(() => [...document.querySelectorAll('[data-song-media] .vz-media-select[aria-pressed=true]')].map(b => b.closest('[data-media]').dataset.media))).toEqual(picked);
  expect(await page.evaluate(() => [window.__builds, document.querySelector('[data-song-media] > [data-media]').__kept === true])).toEqual([1, true]);
  expect(await all.evaluate(el => [el.checked, el.indeterminate])).toEqual([false, true]);
  // Reaching the end of the list brings the next rows by itself.
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(rows(page)).toHaveCount(150);
  await expect(count).toHaveText('선택 2개');
  // 전체선택 ticks the rows that are drawn and says how many that is.
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('[data-all-label]')).toHaveText('보이는 150개 선택');
  await all.check();
  await expect(count).toHaveText('선택 150개');
  // A new row added later is not ticked behind the user's back.
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(rows(page)).toHaveCount(200);
  await expect(count).toHaveText('선택 150개');
  // Leaving the tab and coming back starts from 50 rows again.
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-tab=lyrics]').click();
  await page.locator('[data-tab=media]').click();
  await expect(rows(page)).toHaveCount(50);
  await expect(count).toHaveText('선택 0개');
});

test('곡별 목록: 최근 연습곡 opens the song, an unset status is quiet, no emoji, and the sort is kept on return', async ({page}) => {
  await open(page);
  await page.setViewportSize({width:375, height:812});
  await page.goto('/#/songs');
  const list = page.locator('.vz-song-list a'), titles = () => list.locator('.item-title').allInnerTexts();
  await expect(page.locator('.vz-recent-song')).toHaveAttribute('href', '#/song/s1');
  await expect(page.locator('.vz-recent-song')).toContainText('연습 중 · 숙련도 3.5/5');
  const status = id => page.locator('.vz-song-list a[href="#/song/' + id + '"] .vz-song-status');
  await expect(status('s1')).toHaveText('연습 중'); // words only
  await expect(status('s2')).toHaveText('상태 미지정');
  await expect(status('s2')).toHaveClass(/is-empty/);
  expect(await status('s2').evaluate(el => getComputedStyle(el).color)).not.toBe(await status('s1').evaluate(el => getComputedStyle(el).color));
  // Sort by name, open a song, come back: still by name.
  await page.locator('[data-song-filter]').click();
  await page.locator('[data-filter-sort]').click();
  await page.locator('[data-choice=name]').click();
  const byName = await titles();
  expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, 'ko')));
  await list.first().click();
  await expect(page.locator('.song-tabs')).toBeVisible();
  await page.locator('#top [data-back]').click();
  await expect(page.locator('.vz-song-list')).toBeVisible();
  expect(await titles()).toEqual(byName);
  await expect(page.locator('[data-song-filter]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-song-filter]').click();
  await expect(page.locator('[data-filter-sort]')).toContainText('이름순');
});

test('곡 상세: 작품 in the header card, recording rows without the repeated title, a chip says 기록 only when a record is linked', async ({page}) => {
  await open(page);
  await openSong(page, 's1');
  // 곡 상세 is said once (the page title); the card shows the title and 작품 / 아티스트.
  await expect(page.getByText('곡 상세', {exact:true})).toHaveCount(1);
  await expect(page.locator('.vz-song-detail-hero')).toContainText('지킬 앤 하이드');
  const row = id => page.locator('[data-song-media] > [data-media="' + id + '"]');
  await expect(row('m0').locator('.vz-record-name')).toHaveText('2026-11-10');
  await expect(row('m1').locator('.vz-record-name')).toHaveText('2026-11-09 2');
  await expect(row('m2').locator('.vz-record-name')).toHaveText('갈라 리허설');       // its own name
  await expect(row('m3').locator('.vz-record-name')).toHaveText('This Is the Moment'); // nothing else to show
  // m0 belongs to a practice record: "연습 기록", and the chip opens it. m1 and m3 are plain recordings: the chip only
  // says the kind (연습) and is not a button. m2 is 공연.
  const chip = row('m0').locator('.vz-song-kind');
  await expect(chip).toHaveText('연습 기록');
  await expect(chip).toHaveAttribute('role', 'button');
  for (const id of ['m1', 'm3']) { await expect(row(id).locator('.vz-song-kind')).toHaveText('연습'); await expect(row(id).locator('.vz-song-kind')).not.toHaveAttribute('role', 'button'); }
  await expect(row('m2').locator('.vz-song-kind.performance')).toHaveText('공연');
  await expect(row('m2').locator('.vz-song-kind')).not.toHaveAttribute('role', 'button');
  // The chip is small to look at, 44px to touch.
  expect(await chip.evaluate(el => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; return [-20, 0, 20].map(d => !!document.elementFromPoint(x, y + d)?.closest('[data-linked-record]')); })).toEqual([true, true, true]);
  await chip.click();
  await expect(page.getByRole('dialog', {name:'연습 기록'})).toContainText('2절 고음 연습');
  await page.locator('.sheet [data-close]').click();
  // A song without 작품 shows no empty line.
  await openSong(page, 's2', {media:false});
  await expect(page.locator('[data-song-show]')).toBeHidden();
});

test('320px: all five tabs fit, and score tools go under the title instead of squeezing it', async ({page}) => {
  await open(page);
  await openSong(page, 'k1', {width:320, height:640, media:false});
  const bar = page.locator('.song-tabs');
  expect(await bar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  for (const tab of await bar.locator('[data-tab]').all()) { const box = await tab.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320); expect(box.height).toBeGreaterThanOrEqual(43.5); }
  await expect(bar.locator('[data-tab=media]')).toBeVisible();
  await page.locator('[data-tab=scores]').click();
  const scoreRow = page.locator('[data-score="sc-old"]'), title = scoreRow.locator('.item-title');
  await expect(title).toHaveText('보컬 악보');
  expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth), 'the title is not cut').toBe(true);
  expect((await scoreRow.locator('.score-actions').boundingBox()).y).toBeGreaterThan((await title.boundingBox()).y + 20);
  await expectTargets(scoreRow.locator('.score-actions button'));
  expect(await pageWidth(page)).toBeLessThanOrEqual(321);
});

test('악보 list shows the conversion state of each score', async ({page}) => {
  await open(page);
  let status = 'running';
  await page.route(R2 + '/v1/omr**', route => route.fulfill({json:{job:status ? {id:'j1', scoreId:'sc-old', status, resultKey:status === 'done' ? 'u/ui-test-user/sc-old/omr.mxl' : null} : null}, headers:{'access-control-allow-origin':'*'}}));
  await openSong(page, 'k1', {media:false});
  await page.locator('[data-tab=scores]').click();
  const scoreRow = page.locator('[data-score="sc-old"]');
  await expect(scoreRow.locator('[data-omr-state]')).toHaveText('변환 중 · ');
  await expect(scoreRow.locator('[data-omr]')).toHaveAttribute('aria-label', '보컬 악보 음표로 변환 (변환 중)');
  await expect(scoreRow).toContainText('원키 D · 연습 F'); // the rest of the line is still there
});

test('Renaming a song onto another song’s title and 작품 warns first', async ({page}) => {
  await open(page);
  await openSong(page, 'big', {media:false});
  const form = page.locator('#song-form'), warning = page.getByRole('dialog', {name:'같은 이름의 곡이 있어요'});
  await page.locator('[data-song-menu]').click();
  await page.locator('.sheet [data-e]').click();
  await form.locator('[name=title]').fill('on my own');
  await form.locator('[name=show]').fill('');
  await page.locator('.sheet [form="song-form"]').click();
  await expect(warning).toContainText('"On My Own" 곡이 이미 있어요');
  await page.locator('.sheet-alert .sheet-foot [data-close]').click();
  // 취소: nothing saved, the sheet and what was typed stay.
  await expect(form.locator('[name=title]')).toHaveValue('on my own');
  expect((await song(page, 'big')).title).toBe('Big Song');
  await page.locator('.sheet [form="song-form"]').click();
  await page.locator('.sheet-alert [data-ok]').click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.vz-song-detail-title')).toHaveText('on my own');
  const songs = (await stored(page)).songs;
  expect(songs.find(s => s.id === 'big')).toMatchObject({title:'on my own', show:''});
  expect(songs.find(s => s.id === 's2')).toMatchObject({title:'On My Own'}); // both songs remain
  // A name nobody else has saves without a question.
  await page.locator('[data-song-menu]').click();
  await page.locator('.sheet [data-e]').click();
  await form.locator('[name=title]').fill('Defying Gravity');
  await page.locator('.sheet [form="song-form"]').click();
  await expect(form).toHaveCount(0);
  await expect(warning).toHaveCount(0);
});
