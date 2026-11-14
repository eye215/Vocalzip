// 성장 통합 (#385, docs/audit/2026-11-13-growth-unification.md PR B) — the shell and its navigation in the real app:
// three tabs with their own addresses that share ONE place in the history, the period control under 결과 리포트,
// 뒤로 from the screens a tab opens, every older deep link, the 보컬 분석 / 보컬 트레이닝 contents, empty states,
// phone widths without sideways scroll and the two-column tablet layout. Fake data only. No tap(): runs on the
// touch (chromium-mobile) and the mouse (chromium-desktop) project alike.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const pad = n => String(n).padStart(2, '0');
const ago = days => { const d = new Date(Date.now() - days * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
// A v2 summary with the growth-report detail (same shape as tests/growth-tabs.spec.cjs).
const v2 = ({into, wob = 10, conf = .95}) => ({v:2, at:Date.now(), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:into + 3, within20:70, notes:40}, stability:{wobbleCents:wob + 1, notes:15}, vibrato:{share:20, notes:10, rateHz:5.5, extentCents:40, regularity:.9},
  range:{validHigh:{note:'G5', cents:7900}, stableHigh:{note:'F5', cents:7700}, instantaneous:{note:'C7', cents:9600, t:30}, main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
  breath:{phrases:5, medianPhrase:3.4},
  phrases:{v:1, rows:[[10, 3, 64, into, wob], [15, 2.5, 67, into, wob], [20, 3.5, 69, into, wob], [26, 4, 72, into, wob], [32, 2, 71, into, wob]]},
  pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [67, 4, .6, 1, 3, 6], [74, 3, .8, 1.1, 3, 12]]}},
  confidence:{pitchConfidence:conf, voiceOverMrDb:12}});
// [id, songId, date, analysis, recording kind]
const TAKES = [
  // s1: six analysed takes on different days → 비교 가능. s2: two → 비교 가능.
  ['a1', 's1', ago(60), v2({into:30})], ['a2', 's1', ago(40), v2({into:26})], ['a3', 's1', ago(30), v2({into:22})],
  ['a4', 's1', ago(20), v2({into:18})], ['a5', 's1', ago(10), v2({into:14})], ['a6', 's1', ago(1), v2({into:11})],
  ['b1', 's2', ago(50), v2({into:12})], ['b2', 's2', ago(2), v2({into:24})],
  // s4: recordings without an analysis → 분석 전. s5: one analysed take only → 판정 보류 (nothing to compare with).
  ['d1', 's4', ago(8), null], ['d2', 's4', ago(4), null],
  ['e1', 's5', ago(5), v2({into:15})],
  // 트레이닝 recordings (no song): six, so only the newest five are listed.
  ...[3, 6, 9, 12, 15, 18].map((d, i) => ['t' + (i + 1), '', ago(d), null, 'training'])
];
const SONGS = [{id:'s1', title:'Defying Gravity'}, {id:'s2', title:'On My Own'}, {id:'s3', title:'Memory'}, {id:'s4', title:'새 곡'}, {id:'s5', title:'Home'}];
const ROOM = [{id:'practice-room:roomaaaa1111', date:ago(1), minutes:8, songId:'s1', created:2, practiceRoom:{id:'roomaaaa1111', task:'tone', title:'기준음 따라 부르기', songId:'s1', date:new Date(Date.now() - 864e5).toISOString(), demo:false}}];
async function routes(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/*youtube*/**', r => r.abort());
}
const seedDb = (page, data) => page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(data)]);
async function boot(page, {songs = SONGS, takes = TAKES, extra = {}} = {}) {
  await routes(page);
  await seedDb(page, {categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[], ...extra, songs});
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async takes => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (const [id, songId, date, , kind] of takes) await window.vzipStorePracticeMedia({id, name:(kind ? '발성 연습 ' : '연습 ') + date, created:new Date(date + 'T20:00:00').getTime(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId, song:'', ...(kind ? {recordingCategory:kind} : {}), blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:120});
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x[0] === m.id); if (t?.[3]) await VZ.media.update(m, {analysis:t[3]}, {quiet:true}); }
    VZ.media.invalidate();
    window.dispatchEvent(new Event('vzip:media-updated'));
  }, takes);
  await page.waitForTimeout(400);
}
const REPORT = {comparisonReports:[{id:'r1', kind:'vocal-lab', songId:'s1', song:'Defying Gravity', created:Date.now(), mediaIds:['a5', 'a6'], snapshots:[]}]};
const tabs = page => page.locator('.growth-top-tabs a');
const current = page => page.locator('.growth-top-tabs a[aria-current="page"]');
const dock = page => page.locator('.v-nav a[data-nav="growth"]');
const depth = page => page.evaluate(() => history.length);
const overflow = page => page.evaluate(() => ({wide:document.documentElement.scrollWidth > innerWidth + 1,
  over:[...document.querySelectorAll('#view *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.growth-chart,.growth-jumps'); }).length}));
test.use({viewport:{width:375, height:812}});
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('three tabs with their own addresses; switching never piles up history and 성장 stays lit', async ({page}) => {
  await boot(page);
  await dock(page).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(tabs(page)).toHaveText(['결과 리포트', '보컬 분석', '보컬 트레이닝']);
  await expect(current(page)).toHaveText('결과 리포트');
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  const entered = await depth(page);
  for (const [i, url, label, mark] of [[1, /#\/vocal-analysis$/, '보컬 분석', '[data-hub-song]'], [2, /#\/vocal-training$/, '보컬 트레이닝', '[data-hub-room]'],
    [0, /#\/vocal-growth$/, '결과 리포트', '[data-overall-body]'], [2, /#\/vocal-training$/, '보컬 트레이닝', '[data-hub-room]'], [1, /#\/vocal-analysis$/, '보컬 분석', '[data-hub-song]']]) {
    await tabs(page).nth(i).click();
    await expect(page).toHaveURL(url);
    await expect(current(page)).toHaveText(label);
    await expect(page.locator(mark).first()).toBeVisible();
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#top h1')).toHaveText('성장');
  }
  // The bottom 성장 item pressed inside 성장 is a tab switch as well, and the period is part of the same place.
  await dock(page).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await page.locator('[data-growth-mode="monthly"]').click();
  await page.locator('.growth-weekly-tab').click();
  await expect(page).toHaveURL(/#\/weekly-summary/);
  await expect(page.locator('#top h1')).toHaveText('성장');
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  expect(await depth(page)).toBe(entered);                           // ten switches, not one new history entry
  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);                          // one 뒤로 leaves 성장
  await page.goForward();
  await expect(page).toHaveURL(/#\/weekly-summary/);                 // …and 앞으로 comes back to where it was
  await expect(current(page)).toHaveText('결과 리포트');
});

test('a reload stays on the same tab and period; the /analysis and /training spellings land on their tabs', async ({page}) => {
  await boot(page);
  for (const [hash, label, mark] of [['#/vocal-growth', '결과 리포트', '[data-overall-body]'], ['#/vocal-analysis', '보컬 분석', '[data-hub-song]'], ['#/vocal-training', '보컬 트레이닝', '[data-hub-room]']]) {
    await page.goto('/' + hash);
    await expect(page.locator(mark).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(hash.replace('/', '\\/') + '$'));
    await expect(current(page)).toHaveText(label);
    await expect(page.locator(mark).first()).toBeVisible();
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  }
  // The period follows the address: 월별 survives a reload, 전체 is the plain address again.
  await page.goto('/#/vocal-growth');
  const before = await depth(page);
  await page.locator('[data-growth-mode="monthly"]').click();
  await expect(page).toHaveURL(/#\/vocal-growth\?mode=monthly$/);
  expect(await depth(page)).toBe(before);
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('[data-growth-mode="monthly"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-growth-select]')).toBeVisible();
  await page.locator('[data-growth-mode="overall"]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  await page.goto('/#/home'); await page.goto('/#/weekly-summary?week=' + ago(7));
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('[data-weekly-summary] .ws-week')).toBeVisible();
  await expect(current(page)).toHaveText('결과 리포트');
  // Other spellings of the two tab addresses: replaced, so 뒤로 does not bounce back into them.
  await page.goto('/#/home');
  await page.evaluate(() => { location.hash = '#/vocal-growth/analysis'; });
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await expect(current(page)).toHaveText('보컬 분석');
  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await page.evaluate(() => { location.hash = '#/vocal-growth/training'; });
  await expect(page).toHaveURL(/#\/vocal-training$/);
  await expect(current(page)).toHaveText('보컬 트레이닝');
});

test('뒤로 from the screens a tab opens returns to that tab, with 성장 lit on the way', async ({page}) => {
  await boot(page, {extra:{...REPORT, practices:ROOM}});
  await dock(page).click();
  await tabs(page).nth(1).click();
  const back = async url => { await page.locator('[data-back]').click(); await expect(page).toHaveURL(url); };
  // 보컬 분석 → 보컬 연구소 (dark, as before) → 뒤로
  await page.locator('[data-hub-song="s1"]').click();
  await expect(page).toHaveURL(/#\/vocal-lab\/s1$/);
  await expect(page.locator('#top h1')).toHaveText('보컬 연구소');
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme)).toContain('dark');
  await back(/#\/vocal-analysis$/);
  await expect(current(page)).toHaveText('보컬 분석');
  // → one analysed recording → 뒤로
  await page.locator('[data-hub-take="a6"]').click();
  await expect(page).toHaveURL(/#\/analysis\/a6$/);
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  await back(/#\/vocal-analysis$/);
  // → 리포트 보관함 → a saved report → 뒤로 twice
  await page.locator('[data-hub-reports]').click();
  await expect(page).toHaveURL(/#\/lab-reports$/);
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  await page.locator('.vl-reports .vl-report').first().click();
  await expect(page).toHaveURL(/#\/vocal-lab\/s1\?report=r1$/);
  await back(/#\/lab-reports$/);
  await back(/#\/vocal-analysis$/);
  await expect(page.locator('[data-hub-song]').first()).toBeVisible();
  // 보컬 트레이닝 → 노래 연습실 (its own guard untouched) → 뒤로
  await tabs(page).nth(2).click();
  await page.locator('[data-hub-room]').click();
  await expect(page).toHaveURL(/#\/practice-room$/);
  await expect(page.locator('iframe.vzip-practice-room-frame')).toBeVisible();
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  await back(/#\/vocal-training$/);
  await expect(current(page)).toHaveText('보컬 트레이닝');
  await page.locator('[data-hub-check]').click();
  await expect(page).toHaveURL(/#\/voice-check$/);
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  await back(/#\/vocal-training$/);
  // 결과 리포트 › 월별 → 연습실 → 뒤로 keeps the month view.
  await tabs(page).nth(0).click();
  await page.locator('[data-growth-mode="monthly"]').click();
  await page.locator('#view a[href="#/practice-room"]').first().click();
  await expect(page).toHaveURL(/#\/practice-room$/);
  await back(/#\/vocal-growth\?mode=monthly$/);
  await expect(page.locator('[data-growth-mode="monthly"]')).toHaveAttribute('aria-pressed', 'true');
  // 오늘 → 노래 연습실 keeps 오늘 lit, as before.
  await page.goto('/#/home'); await page.evaluate(() => { location.hash = '#/practice-room'; });
  await expect(page.locator('iframe.vzip-practice-room-frame')).toBeVisible();
  await expect(page.locator('.v-nav a[data-nav="home"]')).toHaveAttribute('aria-current', 'page');
});

test('a 성장 screen opened with nothing behind it: 뒤로 goes to 결과 리포트, not 오늘', async ({page}) => {
  await routes(page);
  await seedDb(page, {categories:[], lessons:[], assignments:[], practices:[], songs:SONGS, ...REPORT});
  // A pasted link or a freshly opened app has one history entry. Playwright's first page keeps its blank start
  // page behind it, so the length is pinned to 1 here, as it is on the phone.
  await page.addInitScript(() => Object.defineProperty(History.prototype, 'length', {configurable:true, get:() => 1}));
  await page.goto('/#/lab-reports');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#top h1')).toHaveText('리포트 보관함');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(current(page)).toHaveText('결과 리포트');
  await page.evaluate(() => { location.hash = '#/vocal-lab/s1'; });
  await expect(page.locator('#top h1')).toHaveText('보컬 연구소');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  // Screens of the other menus keep their own fallback (오늘).
  await page.evaluate(() => { location.hash = '#/lessons'; });
  await expect(page.locator('#top h1')).toHaveText('레슨');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/home$/);
});

test('older deep links land where they did', async ({page}) => {
  await boot(page, {extra:REPORT});
  // #/compare → the lab's comparison of the two takes.
  await page.goto('/#/compare?a=a5&b=a6');
  await expect(page).toHaveURL(/#\/vocal-lab\/s1\?a=a5&b=a6&compare=1$/);
  await expect(page.locator('#top h1')).toHaveText('보컬 연구소');
  // #/vocal-lab?selection=1 → the chosen recordings.
  await page.evaluate(() => sessionStorage.setItem('vocalzip-vocal-lab-selected-media-v1', JSON.stringify(['a5', 'b2'])));
  await page.goto('/#/home'); await page.goto('/#/vocal-lab?selection=1');
  await expect(page).toHaveURL(/#\/vocal-lab\?selection=1$/);
  await expect(page.locator('[data-lab]')).toContainText('선택한 녹음 2개');
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s1?selection=1');
  await expect(page.locator('.vl-dates button[aria-pressed="true"]')).toHaveCount(1);
  // #/lab-reports, #/practice-room (also with a result), #/vocal-growth and its ?mode=monthly, #/weekly-summary.
  await page.goto('/#/home'); await page.goto('/#/lab-reports');
  await expect(page.locator('#top h1')).toHaveText('리포트 보관함');
  await expect(page.locator('.vl-reports .vl-report')).toHaveCount(1);
  await expect(page.locator('.growth-top-tabs')).toHaveCount(0);
  await page.goto('/#/home'); await page.goto('/#/practice-room?result=roomaaaa1111');
  await expect(page.locator('iframe.vzip-practice-room-frame')).toHaveAttribute('src', /result=roomaaaa1111/);
  await page.goto('/#/home'); await page.goto('/#/vocal-growth');
  await expect(page.locator('[data-growth-mode="overall"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/home'); await page.goto('/#/vocal-growth?mode=monthly');
  await expect(page.locator('[data-growth-mode="monthly"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/home'); await page.goto('/#/weekly-summary');
  await expect(page.locator('[data-weekly-summary] .ws-week')).toBeVisible();
  // 곡 상세의 "분석과 비교 보기" (#/vocal-lab/<곡>): the newest analysed takes, and 뒤로 returns to the song.
  await page.goto('/#/home'); await page.goto('/#/song/s1');
  await page.evaluate(() => { location.hash = '#/vocal-lab/s1'; });
  await expect(page.locator('.vl-dates button[aria-pressed="true"]')).toHaveCount(5);
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/song\/s1$/);
  // A bare #/vocal-lab is the 보컬 분석 tab.
  await page.evaluate(() => { location.hash = '#/vocal-lab'; });
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
});

test('결과 리포트: 전체 · 월별 · 주간 stay, as a period control that is smaller than the tabs', async ({page}) => {
  await boot(page, {extra:{practices:ROOM}});
  await page.goto('/#/vocal-growth');
  const control = page.locator('[data-growth] .growth-view-tabs');
  await expect(control).toHaveAttribute('aria-label', '성장 분석 범위');
  await expect(control.locator('button, a')).toHaveText(['전체 분석', '월별 분석', '주간 요약']);
  // 전체: the lifetime report. 월별: the month picker and its cards. 주간: the weekly summary.
  await expect(page.locator('[data-overall-body] .growth-stats-grid [data-growth-metric]')).toHaveCount(6);
  await page.locator('[data-growth-mode="monthly"]').click();
  await expect(page.locator('[data-growth-select]')).toBeVisible();
  await expect(page.locator('.growth-metrics [data-growth-metric]')).toHaveCount(6);
  await expect(current(page)).toHaveText('결과 리포트');
  const shape = await page.evaluate(() => {
    const box = e => e.getBoundingClientRect(), tab = document.querySelector('.growth-top-tabs'), row = document.querySelector('.growth-view-tabs');
    return {below:box(tab).bottom <= box(row).top, narrower:box(row).width < box(tab).width - 40,
      font:[parseFloat(getComputedStyle(tab.querySelector('a')).fontSize), parseFloat(getComputedStyle(row.querySelector('button')).fontSize)],
      targets:[...tab.querySelectorAll('a'), ...row.querySelectorAll('button,a')].map(e => Math.round(box(e).height))};
  });
  expect(shape.below).toBe(true);
  expect(shape.narrower).toBe(true);                                 // not a second row of equal, full-width tabs
  expect(shape.font[1]).toBeLessThan(shape.font[0]);
  for (const h of shape.targets) expect(h).toBeGreaterThanOrEqual(44);
  await page.locator('.growth-weekly-tab').click();
  await expect(page).toHaveURL(/#\/weekly-summary/);
  await expect(page.locator('[data-weekly-summary] [data-ws-range]')).toBeVisible();
  await expect(page.locator('[data-weekly-summary] .growth-view-tabs button.active')).toHaveText('주간 요약');
  await page.locator('[data-ws-tab="#/vocal-growth?mode=monthly"]').click();
  await expect(page.locator('[data-growth-mode="monthly"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.growth-weekly-tab').click();
  await page.locator('[data-ws-tab="#/vocal-growth"]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(page.locator('[data-overall-body]')).toBeVisible();
});

test('보컬 분석: songs with their state from the report model (one list read, one model pass), recent takes, 보관함', async ({page}) => {
  await boot(page, {extra:REPORT});
  await page.evaluate(() => {
    window.__reads = 0; window.__passes = 0;
    const read = window.vzipReadMedia; window.vzipReadMedia = (...a) => { window.__reads++; return read(...a); };
    const calc = window.VzipOverallGrowth.calculate; window.VzipOverallGrowth.calculate = (...a) => { window.__passes++; return calc(...a); };
    VZ.media.invalidate();
  });
  await page.evaluate(() => { location.hash = '#/vocal-growth'; });
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  await tabs(page).nth(1).click();
  const rows = page.locator('[data-hub-song]');
  await expect(rows).toHaveCount(4);                                 // s3 has no recording
  expect(await rows.evaluateAll(els => els.map(e => [e.dataset.hubSong, e.dataset.hubState]))).toEqual([['s1', 'ok'], ['s2', 'ok'], ['s4', 'none'], ['s5', 'hold']]);
  await expect(rows.nth(0)).toContainText('Defying Gravity');
  await expect(rows.nth(0).locator('.growth-hub-chip')).toHaveText('비교 가능');
  await expect(rows.nth(0)).toContainText('녹음 6개 · 분석 6개 · 최근 ');
  await expect(rows.nth(2).locator('.growth-hub-chip')).toHaveText('분석 전');   // said, never scored
  await expect(rows.nth(2).locator('.item-sub')).toHaveText(/^녹음 2개 · 최근 /);
  await expect(rows.nth(3).locator('.growth-hub-chip')).toHaveText('판정 보류');
  await expect(rows.nth(0)).toHaveAttribute('href', '#/vocal-lab/s1');
  // 최근 분석한 녹음: the five newest recordings that have an analysis.
  const takes = page.locator('[data-hub-take]');
  expect(await takes.evaluateAll(els => els.map(e => [e.dataset.hubTake, e.getAttribute('href')]))).toEqual(
    ['a6', 'b2', 'e1', 'a5', 'a4'].map(id => [id, '#/analysis/' + id]));
  await expect(takes.nth(1)).toContainText('On My Own');
  await expect(page.locator('[data-hub-reports]')).toHaveAttribute('href', '#/lab-reports');
  await expect(page.locator('[data-hub-reports]')).toContainText('저장한 리포트 1개');
  await expect(page.locator('.growth-hub-more summary')).toHaveText('녹음이 없는 곡 1');
  // Back and forth between the tabs: still the one read and the one pass made for 결과 리포트.
  await tabs(page).nth(0).click(); await expect(page.locator('[data-overall-body]')).toBeVisible();
  await tabs(page).nth(1).click(); await expect(rows).toHaveCount(4);
  expect(await page.evaluate(() => [window.__reads, window.__passes])).toEqual([1, 1]);
  // A new analysis arrives while the tab is open: the row follows.
  await page.evaluate(async a => { const m = (await VZ.media.list()).find(x => x.id === 'd2'); await VZ.media.update(m, {analysis:a}); }, v2({into:20}));
  await expect(page.locator('[data-hub-song="s4"] .growth-hub-chip')).toHaveText('판정 보류');
  await expect(page.locator('[data-hub-song="s4"] .item-sub')).toContainText('녹음 2개 · 분석 1개');
});

test('recordings added or analysed after the first open show up without a reload, on both tabs', async ({page}) => {
  await boot(page);
  const kpi = () => page.locator('.growth-hero .growth-kpi-grid strong').allTextContents();   // 곡 녹음 · 분석 완료 · 분석한 곡 · 분석한 월
  const row = id => page.locator('[data-hub-song="' + id + '"]');
  await page.goto('/#/vocal-growth');
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['11', '9', '3']);
  await tabs(page).nth(1).click();
  await expect(row('s4').locator('.growth-hub-chip')).toHaveText('분석 전');
  // 1) An analysis lands on a take while the list in memory stays the very same array and no event is sent:
  //    the model must notice from the take itself.
  await page.evaluate(async a => { window.__list = await VZ.media.list(); window.__list.find(m => m.id === 'd2').analysis = a; }, v2({into:20}));
  await tabs(page).nth(0).click();
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['11', '10', '4']);
  await tabs(page).nth(1).click();
  await expect(row('s4').locator('.growth-hub-chip')).toHaveText('판정 보류');
  await expect(row('s4').locator('.item-sub')).toContainText('녹음 2개 · 분석 1개');
  // 2) A song added to the records without a change event, and an analysed take moved to it in place.
  await page.evaluate(() => { VZ.db.songs.push({id:'s9', title:'나중에 추가한 곡', created:Date.now()}); window.__list.find(m => m.id === 'a5').songId = 's9'; });
  await tabs(page).nth(0).click();
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['11', '10', '5']);
  await tabs(page).nth(1).click();
  await expect(row('s9')).toContainText('나중에 추가한 곡');
  await expect(row('s9').locator('.item-sub')).toContainText('녹음 1개 · 분석 1개');
  await expect(row('s1').locator('.item-sub')).toContainText('녹음 5개 · 분석 5개');
  expect(await page.evaluate(async () => (await VZ.media.list()) === window.__list)).toBe(true);   // all of the above on one and the same list
  // 3) A new recording saved and analysed the ordinary way while 보컬 분석 is open: the open tab follows.
  await page.evaluate(async ([a, date]) => {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    await window.vzipStorePracticeMedia({id:'new1', name:'방금 녹음', created:Date.now(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId:'s4', song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:120});
    window.dispatchEvent(new CustomEvent('vzip:media-saved', {detail:{id:'new1'}}));
    const m = (await VZ.media.list()).find(x => x.id === 'new1');
    await VZ.media.update(m, {analysis:a});
  }, [v2({into:14}), ago(0)]);
  // The list was read again from storage, so only what was really saved counts: the unsaved edits of 1) and 2)
  // are gone (d2 has no analysis, a5 is back with its song) and the new take is there with its analysis.
  await expect(row('s4').locator('.item-sub')).toContainText('녹음 3개 · 분석 1개');
  await expect(row('s4').locator('.growth-hub-chip')).toHaveText('판정 보류');
  await expect(row('s1').locator('.item-sub')).toContainText('녹음 6개 · 분석 6개');
  await expect(row('s9')).toHaveCount(0);
  await expect(page.locator('[data-hub-take]').first()).toHaveAttribute('data-hub-take', 'new1');
  await tabs(page).nth(0).click();
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['12', '10', '4']);
  // 보컬 트레이닝 counts the new analyses for its 추천 연습 as well (nothing kept from an earlier draw).
  await tabs(page).nth(2).click();
  const expected = await page.evaluate(async () => VZ.practiceTips(await VZ.media.list()).tips.slice(0, 2).map(t => t.key));
  // Polled: the tab is drawn a moment after the press (read at once, the list was sometimes still empty).
  await expect.poll(() => page.locator('[data-hub-tip]').evaluateAll(els => els.map(e => e.dataset.hubTip))).toEqual(expected);
});

test('보컬 트레이닝: entries only — 연습실 · 보이스 체크 · 연습 세트 · 추천 연습 — and the newest five 트레이닝 recordings', async ({page}) => {
  await boot(page, {extra:{practices:ROOM}});
  await page.goto('/#/vocal-training');
  await expect(page.locator('[data-hub-room]')).toHaveAttribute('href', '#/practice-room');
  await expect(page.locator('[data-hub-check]')).toHaveAttribute('href', '#/voice-check');
  await expect(page.locator('[data-hub-set]')).toHaveAttribute('href', '#/practice-set');
  await expect(page.locator('[data-hub-review]')).toHaveAttribute('href', '#/practice-review');
  await expect(page.locator('#view iframe')).toHaveCount(0);         // nothing embedded
  // 추천 연습 from the saved measurements (app/practice-tips.js), opening where it is practised (연습 따라 하기).
  const expected = await page.evaluate(async () => VZ.practiceTips(await VZ.media.list()).tips.slice(0, 2).map(t => [t.key, t.name]));
  expect(expected.length).toBeGreaterThan(0);
  const tips = page.locator('[data-hub-tip]');
  expect(await tips.evaluateAll(els => els.map(e => [e.dataset.hubTip, e.querySelector('.item-title').textContent]))).toEqual(expected);
  await expect(tips.first()).toHaveAttribute('href', '#/guided-practice/' + encodeURIComponent('analysis:' + expected[0][0]));
  // 트레이닝 recordings: six exist, the newest five are listed with their dates.
  const takes = page.locator('[data-hub-training-take]');
  expect(await takes.evaluateAll(els => els.map(e => e.dataset.hubTrainingTake))).toEqual(['t1', 't2', 't3', 't4', 't5']);
  const day = await page.evaluate(d => VZ.dateLabel(d), ago(3));
  await expect(takes.first()).toContainText(day);
  await expect(takes.first()).toHaveAttribute('href', '#/recording/t1');
  await expect(page.locator('[data-hub-result]')).toHaveCount(1);
  await expect(page.locator('[data-hub-result]')).toHaveAttribute('href', '#/practice-room?result=roomaaaa1111');
  await tips.first().click();
  await expect(page.locator('#top h1')).toHaveText('연습 따라 하기');
  await expect(page.locator('#view')).not.toContainText('연습을 찾을 수 없어요');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-training$/);
  await page.locator('[data-hub-set]').click();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(page.locator('#top h1')).toHaveText('오늘 연습 세트');
});

test('empty states say what is missing and offer one way forward', async ({page}) => {
  // No song at all.
  await boot(page, {songs:[], takes:[]});
  await page.goto('/#/vocal-analysis');
  await expect(page.locator('[data-growth-analysis] .empty')).toContainText('먼저 곡을 추가해 주세요.');
  await expect(page.locator('[data-growth-analysis] .empty a.btn')).toHaveAttribute('href', '#/songs');
  await expect(page.locator('[data-hub-reports]')).toContainText('저장한 리포트가 아직 없어요');
  await tabs(page).nth(2).click();
  await expect(page.locator('[data-hub-room]')).toContainText('아직 제출 전');
  await expect(page.locator('[data-growth-training]')).toContainText('아직 트레이닝 녹음이 없어요');
  await expect(page.locator('[data-growth-training]')).toContainText('아직 제출한 과제가 없어요');
  await expect(page.locator('[data-hub-tips-empty]')).toContainText('지금 0개');
  await expect(page.locator('[data-hub-tip]')).toHaveCount(0);
  await tabs(page).nth(0).click();
  await expect(page.locator('[data-overall-body]')).toContainText('아직 측정된 곡 녹음이 없어요');
  // Songs, but nothing recorded for them yet: one action.
  await page.evaluate(() => VZ.change(d => { d.songs.push({id:'n1', title:'첫 곡', created:Date.now()}); }, {silent:true}));
  await tabs(page).nth(1).click();
  await expect(page.locator('[data-hub-song]')).toHaveCount(0);
  await expect(page.locator('[data-growth-analysis] .growth-hub-empty')).toContainText('아직 곡에 연결된 녹음이 없어요');
  const actions = page.locator('[data-growth-analysis] .growth-hub-empty a.btn');
  await expect(actions).toHaveCount(1);
  await expect(actions).toHaveText('곡 녹음하러 가기');
  await expect(actions).toHaveAttribute('href', '#/record');
  await expect(page.locator('[data-hub-take]')).toHaveCount(0);
});

for (const width of [320, 375]) test('phone ' + width + 'px: every tab fits without sideways scroll and keeps 44px tabs', async ({page}) => {
  await page.setViewportSize({width, height:width === 320 ? 640 : 812});
  await boot(page, {extra:{...REPORT, practices:ROOM}});
  for (const [hash, mark] of [['#/vocal-growth', '[data-overall-body]'], ['#/vocal-growth?mode=monthly', '[data-growth-select]'], ['#/weekly-summary', '.ws-week'], ['#/vocal-analysis', '[data-hub-song]'], ['#/vocal-training', '[data-hub-training-take]']]) {
    await page.goto('/#/home'); await page.goto('/' + hash);
    await expect(page.locator(mark).first()).toBeVisible();
    expect(await overflow(page), hash).toEqual({wide:false, over:0});
    for (const a of await tabs(page).all()) { const b = await a.boundingBox(); expect(b.height).toBeGreaterThanOrEqual(44); expect(b.x + b.width).toBeLessThanOrEqual(width); }
    expect(await tabs(page).evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth)), hash).toBe(true);   // no clipped label
    const period = page.locator('.growth-view-tabs');
    if (await period.count()) expect(await period.evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= innerWidth), hash).toBe(true);
    // One column: the two groups of a tab are stacked.
    if (await page.locator('.growth-hub-cols').count()) expect(await page.evaluate(() => { const [a, b] = [...document.querySelectorAll('.growth-hub-col')].map(e => e.getBoundingClientRect()); return b.top >= a.bottom && Math.abs(a.left - b.left) < 1; })).toBe(true);
  }
});

for (const [width, height] of [[820, 1180], [1180, 820]]) test('tablet ' + width + '×' + height + ': two columns, the wide column and no sideways scroll', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly'); // same rule as the other tablet tests (phone projects emulate a phone)
  await page.setViewportSize({width, height});
  await boot(page, {extra:{...REPORT, practices:ROOM}});
  const column = Math.min(width, 1040) - 48;
  for (const [hash, mark] of [['#/vocal-analysis', '[data-hub-song]'], ['#/vocal-training', '[data-hub-training-take]']]) {
    await page.goto('/#/home'); await page.goto('/' + hash);
    await expect(page.locator(mark).first()).toBeVisible();
    const box = await page.evaluate(() => { const [a, b] = [...document.querySelectorAll('.growth-hub-col')].map(e => e.getBoundingClientRect()); return {a:{l:a.left, r:a.right, t:a.top}, b:{l:b.left, r:b.right, t:b.top}, view:document.getElementById('view').getBoundingClientRect().width}; });
    expect(Math.round(box.view), hash).toBe(column);
    expect(box.b.l, hash).toBeGreaterThan(box.a.r);                  // side by side…
    expect(Math.abs(box.a.t - box.b.t), hash).toBeLessThan(2);       // …from the same line
    expect(box.b.r - box.b.l, hash).toBeGreaterThan(280);
    expect(await overflow(page), hash).toEqual({wide:false, over:0});
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.locator('.growth-hub-hint')).toHaveCount(0);     // the hint belongs to 보컬 분석
  await tabs(page).nth(1).click();
  await expect(page.locator('.growth-hub-hint')).toBeVisible();
  // 결과 리포트: the six measures three across, AI 코치 beside 다음 연습; the cards themselves are unchanged.
  await tabs(page).nth(0).click();
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  const report = await page.evaluate(() => {
    const box = s => document.querySelector(s).getBoundingClientRect(), cards = [...document.querySelectorAll('.growth-stats-grid [data-growth-metric]')].map(e => Math.round(e.getBoundingClientRect().top));
    return {rows:new Set(cards).size, coach:box('[data-growth-anchor="coach"]'), practice:box('[data-growth-anchor="practice"]'), tabs:box('.growth-top-tabs').width, view:box('#view').width};
  });
  expect(report.rows).toBe(2);
  expect(report.practice.left).toBeGreaterThan(report.coach.right);
  expect(Math.abs(report.practice.top - report.coach.top)).toBeLessThan(2);
  expect(report.tabs).toBeLessThan(report.view);                     // the tab box keeps a phone-like width
  expect(await overflow(page)).toEqual({wide:false, over:0});
  // 주간 요약: cards in two columns.
  await page.locator('.growth-weekly-tab').click();
  await expect(page.locator('.ws-week')).toBeVisible();
  const lefts = await page.locator('[data-weekly-summary] .ws-card').evaluateAll(els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().left)))]);
  expect(lefts.length).toBe(2);
  expect(await overflow(page)).toEqual({wide:false, over:0});
});
