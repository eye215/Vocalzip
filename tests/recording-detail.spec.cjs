// 녹음 화면 (#/take/<id>, app/recording-detail.js; owner-approved design 2026-11-27) and the small 곡 상세 changes of the
// same step: a recording row of 곡 상세 › 녹음 opens ONE light recording screen — chips, title, date line, waveform with
// the playing position, ▶ with the song's older / newer recording, 내 만족도, 분석 결과 (or 이 녹음 분석하기), 연습 기록 ·
// 곡 분석에서 보기 · 다른 곡으로 옮기기, and the shared ⋯ menu — and 뒤로 returns to the list. 곡 상세: 곡 분석 links, 선택
// 모드, rows that say their kind, purple chips and icons, pill tabs, 해요체 empty text, a light PDF 올리기 pill.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, boot, fakeR2, wav} = require('./helpers/r2-fixture.cjs');

const BASE = new Date(2026, 10, 10, 12).getTime();
const A = {v:2, at:BASE, seconds:60, metrics:{voicedSeconds:40, intonation:{meanAbsCents:17, within20:70, notes:40}, stability:{wobbleCents:10, notes:15},
  range:{validHigh:{note:'G5', cents:7900}, stableHigh:{note:'F5', cents:7700}, main:{low:'A3', high:'F5', lowCents:5700, highCents:7700}},
  breath:{phrases:5, medianPhrase:3.2}, phrases:{rows:[[10, 3, 64, 30, 10], [15, 2.5, 67, 30, 10], [20, 3.5, 69, 30, 10], [26, 4, 72, 30, 10], [32, 2, 71, 30, 10]]},
  pitchBands:{rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [67, 4, .6, 1, 3, 6], [74, 3, .8, 1.1, 3, 12], [77, 3, .8, 1.1, 3, 12]]}},
  confidence:{pitchConfidence:.95, voiceOverMrDb:12}};
const WAVE = Array.from({length:200}, (_, i) => Math.abs(Math.sin(i / 5)) * .8 + .1);
const rec = (id, name, i, extra = {}) => ({id, name, created:BASE - i * 3600000, type:'audio/wav', source:'practice', songId:'s1', song:'', durationSeconds:2, storageProvider:'r2', r2Key:'u/ui-test-user/' + id + '/original.wav', size:32044, ...extra});
/** s1: m0 (newest, analysed, waveform, rating, in a practice record) · m1 (analysed) · m2 (공연, not analysed) · m3 (oldest). */
function seed() {
  const rows = {
    m0:rec('m0', 'This Is the Moment 2026-11-10', 0, {analysis:A, waveform:WAVE, rating:4, review:'고음 전에 숨을 길게'}),
    m1:rec('m1', 'This Is the Moment 2026-11-09 2', 30, {analysis:A}),
    m2:rec('m2', '갈라 리허설', 60, {occasion:'performance'}),
    m3:rec('m3', 'This Is the Moment', 90)};
  const db = {categories:[], lessons:[], assignments:[], comparisonReports:[], performances:[],
    practices:[{id:'p1', date:'2026-11-10', minutes:20, mediaIds:['m0'], practiceMode:'song', songId:'s1', technique:[], rating:4, memo:'2절 고음 연습', completed:[]}],
    songs:[{id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드', scores:[]}, {id:'s2', title:'On My Own', show:''}]};
  return {db, rows};
}
async function open(page) {
  const s = seed();
  await page.addInitScript(([k, db, rows]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, db); sessionStorage.setItem('seeded', '1'); }
    window.__rows = JSON.parse(rows); window.__upd = Object.fromEntries(Object.keys(window.__rows).map(id => [id, '2026-11-05T09:00:00Z']));
  }, [KEY, JSON.stringify(s.db), JSON.stringify(s.rows)]);
  const fake = await fakeR2(page);
  for (const id of Object.keys(s.rows)) fake.store.set('u/ui-test-user/' + id + '/original.wav', {bytes:wav(2), type:'audio/wav', etag:'"' + id + '"'});
  await boot(page);
  return fake;
}
const rows = page => page.locator('[data-song-media] > [data-media]');
async function openSong(page, {width = 390, height = 844} = {}) {
  await page.setViewportSize({width, height});
  await page.goto('/#/song/s1');
  await expect(rows(page).first()).toBeVisible();
}
async function openTake(page, id, size) {
  await openSong(page, size);
  await page.locator('[data-song-media] > [data-media="' + id + '"] [data-toggle]').click();
  await expect(page).toHaveURL(new RegExp('#/take/' + id + '$'));
  await expect(page.locator('[data-recd-title]')).toBeVisible();
}
const pageWidth = page => page.evaluate(() => document.documentElement.scrollWidth);
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('A recording row opens the 녹음 screen: chips, title, date line, waveform, ▶ that plays, 내 만족도, memo; 뒤로 returns', async ({page}) => {
  await open(page);
  await openTake(page, 'm0');
  // ‹ · 녹음 · ⋯
  await expect(page.locator('#top h1')).toHaveText('녹음');
  await expect(page.locator('#top [data-back]')).toBeVisible();
  await expect(page.locator('#top [data-recd-more]')).toBeVisible();
  await expect(page.locator('[data-recd-chips] .vz-recd-chip')).toHaveText(['곡 녹음', '연습 기록 연결됨']);
  await expect(page.locator('[data-recd-title]')).toHaveText('This Is the Moment');
  expect(await page.locator('[data-recd-title]').evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el).fontWeight])).toEqual(['20px', '900']);
  await expect(page.locator('[data-recd-meta]')).toHaveText('11월 10일 화요일 · 0:02 · 클라우드');
  // The saved waveform as bars; the played part is purple.
  await expect(page.locator('[data-recd-wave] > span')).toHaveCount(54);
  await expect(page.locator('[data-recd-wave] > span.on')).toHaveCount(0);
  // ▶ is a gradient circle and plays the file (the same player as every list underneath).
  const play = page.locator('[data-recd-play]');
  await expect(play).toHaveAttribute('aria-label', '재생');
  expect(await play.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  await play.click();
  await expect(play).toHaveAttribute('aria-label', '일시정지');
  await expect.poll(() => page.locator('[data-recd-now]').textContent(), {timeout:8000}).not.toBe('0:00');
  await expect(page.locator('[data-recd-wave] > span.on').first()).toBeVisible();
  await play.click();
  await expect(play).toHaveAttribute('aria-label', '재생');
  // The waveform is the seek bar.
  await page.locator('[data-recd-seek]').fill('0');
  await expect(page.locator('[data-recd-now]')).toHaveText('0:00');
  // 내 만족도: the recording's own rating; tapping it opens 정보 수정 (where it is set). The memo is shown.
  await expect(page.locator('[data-recd-rating]')).toHaveAttribute('data-stars', '4');
  await expect(page.locator('[data-recd-review]')).toHaveText('고음 전에 숨을 길게');
  await page.locator('[data-recd-rating]').click();
  await expect(page.getByRole('dialog', {name:'녹음 정보 수정'})).toBeVisible();
  await page.evaluate(() => VZ.closeSheets());
  // ‹ older recording (m1) — › there is none newer than m0. The address is replaced, so 뒤로 goes to the song.
  await expect(page.locator('[data-recd-next]')).toBeDisabled();
  await page.locator('[data-recd-prev]').click();
  await expect(page).toHaveURL(/#\/take\/m1$/);
  await expect(page.locator('[data-recd-next]')).toBeEnabled();
  await page.locator('#top [data-back]').click();
  await expect(page).toHaveURL(/#\/song\/s1$/);
  await expect(rows(page)).toHaveCount(4);
});

test('분석 결과: six values of the saved analysis, 처음 녹음과 비교 and 구간 자세히; not analysed: 이 녹음 분석하기', async ({page}) => {
  await open(page);
  await openTake(page, 'm0');
  const tiles = page.locator('[data-recd-tiles] .vz-recd-tile');
  await expect(tiles).toHaveCount(6);
  await expect(tiles.locator('span')).toHaveText(['음정', '안정성', '최고음', '음역', '호흡', '고음']);
  await expect(tiles.locator('strong')).toHaveText(['±17 cent', '±10', 'F5', 'A3–F5', '3.2초', '±12']);
  // 처음 녹음과 비교: 곡 분석's 두 녹음 비교 with the song's first analysed take (m1) and this one.
  await expect(page.locator('[data-recd-compare]')).toHaveText('처음 녹음과 비교');
  await expect(page.locator('[data-recd-compare]')).toHaveAttribute('href', '#/growth-song/s1?a=m1&b=m0&compare=1');
  // 구간 자세히: 곡 분석 with this take open (이 녹음 자세히).
  await expect(page.locator('[data-recd-detail]')).toHaveAttribute('href', '#/growth-song/s1?a=m0');
  for (const b of await page.locator('.vz-recd-soft').all()) expect(await b.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(239, 232, 252)');
  // The first analysed take has nothing earlier to compare with: 구간 자세히 only.
  await page.locator('[data-recd-prev]').click();
  await expect(page).toHaveURL(/#\/take\/m1$/);
  await expect(page.locator('[data-recd-tiles]')).toBeVisible();
  await expect(page.locator('[data-recd-compare]')).toHaveCount(0);
  await expect(page.locator('[data-recd-detail]')).toHaveAttribute('href', '#/growth-song/s1?a=m1');
  // Not analysed (m2, a 공연 take): one line and 이 녹음 분석하기 — the ⋯ menu's 보컬 분석 (곡 분석 with this take chosen).
  await page.locator('[data-recd-prev]').click();
  await expect(page).toHaveURL(/#\/take\/m2$/);
  await expect(page.locator('[data-recd-chips] .vz-recd-chip')).toHaveText(['곡 녹음', '공연']);
  await expect(page.locator('[data-recd-none]')).toHaveText('아직 분석하지 않은 녹음이에요.');
  await expect(page.locator('[data-recd-tiles]')).toHaveCount(0);
  // No practice record holds it: no 연습 기록 row, and no 내 만족도 yet.
  await expect(page.locator('[data-recd-practice]')).toHaveCount(0);
  await expect(page.locator('[data-recd-rating]')).toHaveAttribute('data-stars', '0');
  await page.locator('[data-recd-analyze]').click();
  await expect(page).toHaveURL(/#\/growth-song\/s1\?selection=1$/);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('vocalzip-vocal-lab-selected-media-v1')))).toEqual(['m2']);
});

test('The rows: 연습 기록 opens the practice record, 곡 분석에서 보기 the song screen, 다른 곡으로 옮기기 the song pick', async ({page}) => {
  await open(page);
  await openTake(page, 'm0');
  const practice = page.locator('[data-recd-practice]');
  await expect(practice).toContainText('연습 기록');
  await expect(practice).toContainText('20분 · ★4 · 2절 고음 연습');
  await practice.click();
  const sheet = page.getByRole('dialog', {name:/연습$/});
  await expect(sheet).toContainText('2절 고음 연습');
  await expect(sheet.getByRole('button', {name:'수정'})).toBeVisible();
  await expect(sheet.getByRole('button', {name:'삭제'})).toBeVisible();
  await page.evaluate(() => VZ.closeSheets());
  await expect(page.locator('[data-recd-growth]')).toHaveAttribute('href', '#/growth-song/s1');
  await expect(page.locator('[data-recd-growth]')).toContainText('곡 분석에서 보기');
  // 다른 곡으로 옮기기: the 곡 지정 flow (pick, confirm, saved); the screen follows the recording to its new song.
  await page.locator('[data-recd-move]').click();
  await page.locator('.sheet').last().getByText('On My Own').click();
  await expect(page.locator('.sheet').last()).toContainText('1개 녹음의 곡을 "On My Own"');
  await page.getByRole('button', {name:'바꾸기'}).click();
  await expect.poll(() => page.evaluate(() => window.__rows.m0?.songId)).toBe('s2');
  await expect(page.locator('[data-recd-title]')).toHaveText('On My Own');
  await expect(page.locator('[data-recd-growth]')).toHaveAttribute('href', '#/growth-song/s2');
  // Every row is a 44px+ target.
  for (const r of await page.locator('.vz-recd-row').all()) expect((await r.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('⋯ is the shared recording menu; 파일 삭제 asks first and then returns to the song without the row', async ({page}) => {
  await open(page);
  await openTake(page, 'm3');
  await page.locator('#top [data-recd-more]').click();
  const menu = page.locator('.sheet-back.sheet-menu .sheet').last();
  await expect(menu).toBeVisible();
  expect(await menu.locator('.vz-choice').evaluateAll(r => r.map(x => x.dataset.act))).toEqual(['play', 'edit', 'song', 'type', 'share', 'analyze', 'download', 'delete']);
  await menu.locator('[data-act=edit]').click();
  await expect(page.getByRole('dialog', {name:'녹음 정보 수정'})).toBeVisible();
  await page.evaluate(() => VZ.closeSheets());
  await page.locator('#top [data-recd-more]').click();
  await menu.locator('[data-act=delete]').click();
  const ask = page.getByRole('dialog', {name:'파일 영구 삭제'});
  await ask.getByRole('button', {name:'취소'}).click();
  await expect(page).toHaveURL(/#\/take\/m3$/);
  await page.locator('#top [data-recd-more]').click();
  await menu.locator('[data-act=delete]').click();
  await ask.getByRole('button', {name:'파일 영구 삭제'}).click();
  await expect(page).toHaveURL(/#\/song\/s1$/);
  await expect.poll(() => page.evaluate(() => window.__rows.m3 || null)).toBeNull();
  await expect(rows(page)).toHaveCount(3);
});

test('곡 상세: 곡 분석 links, pill tabs, purple chips and timer icons, 해요체 empty lyrics, a light PDF 올리기 pill', async ({page}) => {
  await open(page);
  await openSong(page);
  // The hero's link and the 녹음 tab's link: the same words, the same page.
  await expect(page.locator('[data-song-hero-growth]')).toContainText('곡 분석');
  await expect(page.locator('[data-song-hero-growth]')).not.toContainText('성장 보기');
  await expect(page.locator('[data-song-hero-growth]')).toHaveAttribute('href', '#/growth-song/s1');
  await expect(page.locator('.vz-song-lab')).toHaveText('곡 분석');
  await expect(page.locator('.vz-song-lab')).toHaveAttribute('href', '#/growth-song/s1');
  await expect(page.getByText('분석·비교 보기')).toHaveCount(0);
  // Pill tabs: the five tabs; only the chosen one has a background, and there is no bar or underline behind them.
  const tabs = page.locator('.song-tabs [data-tab]');
  await expect(tabs).toHaveText(['녹음', '가사', '악보', '활동 기록', '레퍼런스']);
  const look = () => tabs.evaluateAll(els => els.map(el => getComputedStyle(el.firstElementChild).backgroundColor));
  expect(await look()).toEqual(['rgb(239, 232, 252)', ...Array(4).fill('rgba(0, 0, 0, 0)')]);
  expect(await page.locator('.song-tabs').evaluate(el => [getComputedStyle(el).borderBottomWidth, getComputedStyle(el).backgroundColor === getComputedStyle(document.body).backgroundColor])).toEqual(['0px', true]);
  // 활동 기록: the practice rows' timer icons are purple.
  await page.locator('[data-tab=timeline]').click();
  expect(await look()).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgb(239, 232, 252)', 'rgba(0, 0, 0, 0)']);
  const icon = page.locator('[data-body] [data-practice] .avatar').first();
  await expect(icon).toBeVisible();
  expect(await icon.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor])).toEqual(['rgb(122, 50, 245)', 'rgb(239, 232, 252)']);
  // 가사: the empty text speaks 해요체.
  await page.locator('[data-tab=lyrics]').click();
  await expect(page.locator('[data-lyric=lyrics]')).toContainText('아직 적은 내용이 없어요');
  // 악보: PDF 올리기 is a light purple pill.
  await page.locator('[data-tab=scores]').click();
  const pdf = page.locator('[data-score-add]');
  await expect(pdf).toContainText('PDF 올리기');
  expect(await pdf.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color, parseFloat(getComputedStyle(el).borderRadius) >= 20])).toEqual(['rgb(239, 232, 252)', 'rgb(91, 31, 194)', true]);
});

for (const width of [320, 390, 430]) test('No sideways scroll at ' + width + 'px: 곡 상세 (and 선택 모드) and the 녹음 screen', async ({page}) => {
  test.skip(test.info().project.name !== 'chromium-mobile', 'phone sizes are set explicitly');
  await open(page);
  await openSong(page, {width, height:740});
  expect(await pageWidth(page)).toBeLessThanOrEqual(width);
  const bar = page.locator('.song-tabs');
  expect(await bar.evaluate(el => el.scrollWidth <= el.clientWidth), 'the five tabs fit').toBe(true);
  for (const tab of await bar.locator('[data-tab]').all()) expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('[data-select-mode]').click();
  await expect(page.locator('[data-select-row]')).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(width);
  // Row titles end in … instead of pushing the row wider.
  for (const r of await rows(page).all()) { const box = await r.boundingBox(); expect(box.x + box.width).toBeLessThanOrEqual(width); }
  await page.locator('[data-select-mode]').click();
  await page.locator('[data-song-media] > [data-media="m0"] [data-toggle]').click();
  await expect(page.locator('[data-recd-tiles]')).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(width);
  for (const sel of ['.vz-recd-card', '[data-recd-wave]', '.vz-recd-tile', '.vz-recd-soft', '.vz-recd-row']) {
    for (const el of await page.locator(sel).all()) { const box = await el.boundingBox(); expect(box.x, sel).toBeGreaterThanOrEqual(0); expect(box.x + box.width, sel).toBeLessThanOrEqual(width); }
  }
  // Tile values are not cut at this width.
  expect(await page.locator('.vz-recd-tile strong').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent))).toEqual([]);
  for (const sel of ['[data-recd-play]', '[data-recd-prev]', '[data-recd-next]', '#top [data-recd-more]', '#top [data-back]']) {
    const box = await page.locator(sel).boundingBox(); expect(Math.min(box.width, box.height), sel).toBeGreaterThanOrEqual(43.5);
  }
});

test('Tablet: the 녹음 screen is a centred column', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'tablet size is set explicitly');
  await open(page);
  await openTake(page, 'm0', {width:834, height:1112});
  const card = await page.locator('.vz-recd-card').first().boundingBox();
  expect(card.width).toBeLessThanOrEqual(620);
  expect(Math.abs(card.x + card.width / 2 - 417)).toBeLessThanOrEqual(12);
  expect(await pageWidth(page)).toBeLessThanOrEqual(834);
});
