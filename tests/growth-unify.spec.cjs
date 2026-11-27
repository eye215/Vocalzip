// 성장 통합 (#385, docs/audit/2026-11-13-growth-unification.md PR B) — the shell and its navigation in the real app:
// three tabs with their own addresses that share ONE place in the history — since 성장 개편 안 B phase 2: 이번 달 · 곡 ·
// 연구소 (큰 정리 3번: the former 결과 리포트 — 전체 · 월별 · 주간 — is 나's report of its period; #/growth-flow leads there) — the period
// controls, 뒤로 from the screens a tab opens, every older deep link, the 곡 / 연구소 contents, empty states,
// phone widths without sideways scroll and the two-column tablet layout. Fake data only. No tap(): runs on the
// touch (chromium-mobile) and the mouse (chromium-desktop) project alike.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {period, move, openFold, openReport} = require('./growth-me-helpers.cjs');
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
// The former 결과 리포트 screens, at their 지난 흐름 address.
const REPORT_ALL = '#/growth-flow?period=all';
const to = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const overflow = page => page.evaluate(() => ({wide:document.documentElement.scrollWidth > innerWidth + 1,
  over:[...document.querySelectorAll('#view *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.growth-chart,.growth-jumps'); }).length}));
test.use({viewport:{width:375, height:812}});
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('three tabs with their own addresses; switching never piles up history and 성장 stays lit', async ({page}) => {
  await boot(page);
  await dock(page).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(tabs(page)).toHaveText(['나', '곡', '기록']);
  await expect(current(page)).toHaveText('나');
  await expect(page.locator('[data-gm-section="word"]')).toBeVisible();
  const entered = await depth(page);
  for (const [i, url, label, mark] of [[1, /#\/vocal-analysis$/, '곡', '[data-hub-song]'], [2, /#\/growth-lab$/, '기록', '[data-lab-tool="reports"]'],
    [0, /#\/vocal-growth$/, '나', '[data-gm-section="word"]'], [2, /#\/growth-lab$/, '기록', '[data-lab-tool="reports"]'], [1, /#\/vocal-analysis$/, '곡', '[data-hub-song]']]) {
    await tabs(page).nth(i).click();
    await expect(page).toHaveURL(url);
    await expect(current(page)).toHaveText(label);
    await expect(page.locator(mark).first()).toBeVisible();
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#top h1')).toHaveText('성장');
  }
  // The bottom 성장 item pressed inside 성장 is a tab switch as well; the period of 나 replaces the address (큰 정리 3번).
  await dock(page).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await period(page, 'week');
  await period(page, 'all');
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all$/);
  await expect(page.locator('#top h1')).toHaveText('성장');
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  expect(await depth(page)).toBe(entered);                           // eight switches, not one new history entry
  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);                          // one 뒤로 leaves 성장
  await page.goForward();
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all$/);     // …and 앞으로 comes back to where it was
  await expect(current(page)).toHaveText('나');
  await expect(page.locator('[data-gm-period="all"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a reload stays on the same tab and period; the /analysis and /training spellings land on their tabs', async ({page}) => {
  await boot(page);
  for (const [hash, label, mark] of [['#/vocal-growth', '나', '[data-gm-section="word"]'], ['#/vocal-analysis', '곡', '[data-hub-song]'], ['#/growth-lab', '기록', '[data-lab-tool="reports"]']]) {
    await page.goto('/' + hash);
    await expect(page.locator(mark).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(hash.replace('/', '\\/') + '$'));
    await expect(current(page)).toHaveText(label);
    await expect(page.locator(mark).first()).toBeVisible();
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  }
  // 이번 달's period is kept on the device: 주간 survives a reload.
  await page.goto('/#/vocal-growth');
  await period(page, 'week');
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('[data-gm-period="week"]')).toHaveAttribute('aria-pressed', 'true');
  // The period and the month follow the address: 월 · ‹ survives a reload, without a new history entry.
  await page.goto('/' + REPORT_ALL);
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all&changes=1$/);
  const before = await depth(page);
  await period(page, 'month');
  await move(page, -1);
  await expect(page).toHaveURL(/#\/vocal-growth\?period=month&month=\d{4}-\d{2}$/);
  expect(await depth(page)).toBe(before);
  const label = await page.locator('[data-gm-label]').textContent();
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('[data-gm-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gm-label]')).toHaveText(label);
  await expect(page.locator('[data-gm-report="month"] [data-month-section="results"]')).toBeVisible();
  await period(page, 'all');
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all$/);
  await expect(page.locator('[data-gm-report="all"] [data-overall-body]')).toBeVisible();
  await page.goto('/#/home'); await page.goto('/#/weekly-summary?week=' + ago(7));
  await expect(page).toHaveURL(/#\/vocal-growth\?period=week&week=/);
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('[data-gm-report="week"] .ws-hero, [data-gm-report="week"] [data-ws-empty]').first()).toBeVisible();
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  // Other spellings of the two tab addresses: replaced, so 뒤로 does not bounce back into them.
  await page.goto('/#/home');
  await page.evaluate(() => { location.hash = '#/vocal-growth/analysis'; });
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await expect(current(page)).toHaveText('곡');
  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  // The former 보컬 트레이닝 spelling: practice is on 오늘 now (tests/growth-b4-lab.spec.cjs follows it into 연습하기).
  await page.evaluate(() => { location.hash = '#/vocal-growth'; });
  await page.evaluate(() => { location.hash = '#/vocal-growth/training'; });
  await expect(page).toHaveURL(/#\/home$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
});

test('뒤로 from the screens a tab opens returns to that tab, with 성장 lit on the way', async ({page}) => {
  await boot(page, {extra:{...REPORT, practices:ROOM}});
  await dock(page).click();
  await tabs(page).nth(1).click();
  const back = async url => { await page.locator('[data-back]').click(); await expect(page).toHaveURL(url); };
  // 곡 → 곡 하나 (the ONE song screen with 곡 분석 in it, 큰 정리 2번: dark, as 곡 분석 was) → 뒤로
  await page.locator('[data-hub-song="s1"]').click();
  await expect(page).toHaveURL(/#\/growth-song\/s1$/);
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#top h1')).toHaveText('곡');
  expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme)).toContain('dark');
  await back(/#\/vocal-analysis$/);
  await expect(current(page)).toHaveText('곡');
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
  await expect(page).toHaveURL(/#\/growth-song\/s1\?report=r1$/);
  await back(/#\/lab-reports$/);
  await back(/#\/vocal-analysis$/);
  await expect(page.locator('[data-hub-song]').first()).toBeVisible();
  // 연구소 → a deep tool (리포트 보관함, 귀와 숫자, 분석 기준) → 뒤로
  await tabs(page).nth(2).click();
  for (const [key, url] of [['reports', /#\/lab-reports$/], ['ear', /#\/growth-ear$/], ['basis', /#\/growth-basis$/]]) {
    await page.locator('[data-lab-tool="' + key + '"]').click();
    await expect(page).toHaveURL(url);
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
    await back(/#\/growth-lab$/);
    await expect(current(page)).toHaveText('기록');
  }
  // 나 (월, the default period) → its month report → 다음 연습 전체 보기 → 뒤로 keeps the month view (큰 정리 3번).
  await tabs(page).nth(0).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(page.locator('[data-gm-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await openReport(page);
  await page.locator('#view [data-gm-report="month"] [data-month-section="practice"] [data-np-all]').click();
  await expect(page).toHaveURL(/#\/next-practice$/);
  await expect(page.locator('.v-nav a[data-nav="home"]')).toHaveAttribute('aria-current', 'page');   // a practice screen: 오늘's (phase 4)
  await back(/#\/vocal-growth$/);
  await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-gm-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(current(page)).toHaveText('나');
  // 오늘 → 노래 연습실 keeps 오늘 lit.
  await page.goto('/#/home'); await page.evaluate(() => { location.hash = '#/practice-room'; });
  await expect(page.locator('iframe.vzip-practice-room-frame')).toBeVisible();
  await expect(page.locator('.v-nav a[data-nav="home"]')).toHaveAttribute('aria-current', 'page');
});

test('a 성장 screen opened with nothing behind it: 뒤로 goes to its 성장 tab, not 오늘', async ({page}) => {
  await routes(page);
  await seedDb(page, {categories:[], lessons:[], assignments:[], practices:[], songs:SONGS, ...REPORT});
  // A pasted link or a freshly opened app has one history entry. Playwright's first page keeps its blank start
  // page behind it, so the length is pinned to 1 here, as it is on the phone.
  await page.addInitScript(() => Object.defineProperty(History.prototype, 'length', {configurable:true, get:() => 1}));
  await page.goto('/#/lab-reports');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#top h1')).toHaveText('리포트 보관함');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/growth-lab$/);                   // 리포트 보관함 belongs to 연구소
  await expect(current(page)).toHaveText('기록');
  await page.evaluate(() => { location.hash = '#/vocal-lab/s1'; });
  await expect(page.locator('#top h1')).toHaveText('곡');
  await expect(page).toHaveURL(/#\/growth-song\/s1$/);
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);               // a song's 연구소 belongs to 곡
  // The old 지난 흐름 address is 나 itself now (replaced): a tab, with no 뒤로 of its own.
  await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; });
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all&changes=1$/);
  await expect(current(page)).toHaveText('나');
  // Screens of the other menus keep their own fallback (오늘).
  await page.evaluate(() => { location.hash = '#/lessons'; });
  await expect(page.locator('#top h1')).toHaveText('레슨 목록');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/home$/);
});

test('older deep links land where they did', async ({page}) => {
  await boot(page, {extra:REPORT});
  // #/compare → the lab's comparison of the two takes.
  await page.goto('/#/compare?a=a5&b=a6');
  await expect(page).toHaveURL(/#\/growth-song\/s1\?a=a5&b=a6&compare=1$/);
  await expect(page.locator('#top h1')).toHaveText('곡');
  // #/vocal-lab?selection=1 → the chosen recordings.
  await page.evaluate(() => sessionStorage.setItem('vocalzip-vocal-lab-selected-media-v1', JSON.stringify(['a5', 'b2'])));
  await page.goto('/#/home'); await page.goto('/#/vocal-lab?selection=1');
  await expect(page).toHaveURL(/#\/vocal-lab\?selection=1$/);
  await expect(page.locator('[data-lab]')).toContainText('선택한 녹음 2개');
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s1?selection=1');
  await expect(page.locator('.vl-dates button[aria-pressed="true"]')).toHaveCount(1);
  // #/lab-reports, #/practice-room (also with a result), #/vocal-growth and its ?mode=monthly / ?gc=, #/weekly-summary,
  // #/growth and #/vocal-training: the last ones lead into the new places (replaced, not added to the history).
  await page.goto('/#/home'); await page.goto('/#/lab-reports');
  await expect(page.locator('#top h1')).toHaveText('리포트 보관함');
  await expect(page.locator('.vl-reports .vl-report')).toHaveCount(1);
  await expect(page.locator('.growth-top-tabs')).toHaveCount(0);
  await page.goto('/#/home'); await page.goto('/#/practice-room?result=roomaaaa1111');
  await expect(page.locator('iframe.vzip-practice-room-frame')).toHaveAttribute('src', /result=roomaaaa1111/);
  await page.goto('/#/home'); await page.goto('/#/vocal-growth');
  await expect(current(page)).toHaveText('나');
  await expect(page.locator('[data-gm-section="word"]')).toBeVisible();
  await page.goto('/#/home'); await page.goto('/#/vocal-growth?mode=monthly');
  await expect(page).toHaveURL(/#\/vocal-growth\?period=month$/);
  await expect(page.locator('[data-gm-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/home'); await page.goto('/#/vocal-growth?gc=s1');
  await expect(page.locator('[data-gc-song="s1"]').first()).toBeInViewport();
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all$/);
  await page.goto('/#/home'); await page.goto('/#/weekly-summary');
  await expect(page).toHaveURL(/#\/vocal-growth\?period=week$/);
  await expect(page.locator('[data-gm-report="week"]')).toBeVisible();
  await page.goto('/#/home'); await page.goto('/#/growth');
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(current(page)).toHaveText('나');
  // The former 보컬 트레이닝 address: practice is on 오늘 now. Replaced, so 뒤로 returns to where it was typed.
  await page.goto('/#/home'); await page.goto('/#/vocal-growth'); await page.evaluate(() => { location.hash = '#/vocal-training'; });
  await expect(page).toHaveURL(/#\/home$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
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

test('나: 주 · 월 · 전체 as a period control smaller than the tabs, with ‹ ›; each period is its report right under it', async ({page}) => {
  await boot(page, {extra:{practices:ROOM}});
  await page.goto('/#/vocal-growth');
  // 새 디자인: the period pill beside the tabs opens it.
  await page.locator('[data-gm-period-open]').click();
  const own = page.locator('[data-growth-month] .growth-view-tabs');
  await expect(own).toHaveAttribute('aria-label', '성장 기간');
  await expect(own.locator('button')).toHaveText(['주', '월', '전체']);
  const shape = await page.evaluate(() => {
    const box = e => e.getBoundingClientRect(), tab = document.querySelector('.growth-top-tabs'), row = document.querySelector('.growth-view-tabs');
    return {below:box(tab).bottom <= box(row).top, narrower:box(row).width < box(document.querySelector('.growth-tabbar')).width - 40,
      font:[parseFloat(getComputedStyle(tab.querySelector('a')).fontSize), parseFloat(getComputedStyle(row.querySelector('button')).fontSize)],
      targets:[...tab.querySelectorAll('a'), ...row.querySelectorAll('button,a'), ...document.querySelectorAll('[data-gm-move]')].map(e => Math.round(box(e).height))};
  });
  expect(shape.below).toBe(true);
  expect(shape.narrower).toBe(true);                                 // not a second row of equal, full-width tabs
  expect(shape.font[1]).toBeLessThan(shape.font[0]);
  for (const h of shape.targets) expect(h).toBeGreaterThanOrEqual(44);
  // 전체: the lifetime report. 월: the month's cards. 주: the weekly summary. No second period control inside them.
  await period(page, 'all');
  await expect(page.locator('[data-gm-report="all"] [data-overall-body] .growth-stats-grid [data-growth-metric]')).toHaveCount(6);
  await period(page, 'month');
  await expect(page.locator('[data-gm-report="month"] .growth-metrics [data-growth-metric]')).toHaveCount(6);
  await period(page, 'week');
  await openReport(page);
  await expect(page.locator('[data-gm-report="week"] [data-ws-minutes]')).toBeVisible();
  await expect(page.locator('[data-growth-mode], [data-growth-select], [data-ws-tab], .growth-weekly-tab, .ws-week')).toHaveCount(0);
  await expect(page.locator('.growth-view-tabs')).toHaveCount(1);
});

test('곡: songs with their one word from the shared verdict (one list read, one model pass), recent takes, 보관함', async ({page}) => {
  await boot(page, {extra:REPORT});
  await page.evaluate(() => {
    window.__reads = 0; window.__passes = 0;
    const read = window.vzipReadMedia; window.vzipReadMedia = (...a) => { window.__reads++; return read(...a); };
    const calc = window.VzipOverallGrowth.calculate; window.VzipOverallGrowth.calculate = (...a) => { window.__passes++; return calc(...a); };
    VZ.media.invalidate();
  });
  await page.evaluate(() => { location.hash = '#/vocal-growth'; });
  await expect(page.locator('[data-gm-section="word"]')).toBeVisible();
  await tabs(page).nth(1).click();
  const rows = page.locator('[data-hub-song]');
  await expect(rows).toHaveCount(4);                                 // s3 has no recording
  // 성장 개편 phase 3: the word is the song's verdict as 이번 달 says it (처음·최근, same method and version) —
  // before: 비교 가능 / 판정 보류 / 분석 전 from the 결과 리포트 model. Analysed songs first; s4 (no analysis) is folded.
  expect(await rows.evaluateAll(els => els.map(e => [e.dataset.hubSong, e.dataset.hubState]))).toEqual([['s1', 'better'], ['s2', 'worse'], ['s5', 'one'], ['s4', 'none']]);
  await expect(rows.nth(0)).toContainText('Defying Gravity');
  await expect(rows.nth(0).locator('.growth-hub-chip')).toHaveText('좋아진 방향');
  await expect(rows.nth(0)).toContainText('분석한 녹음 6개 · 최근 ');
  await expect(rows.nth(1).locator('.growth-hub-chip')).toHaveText('아쉬운 방향');
  await expect(rows.nth(2).locator('.growth-hub-chip')).toHaveText('녹음 하나');
  await expect(rows.nth(3).locator('.growth-hub-chip')).toHaveText('분석 전');   // said, never scored
  await expect(rows.nth(3).locator('.item-sub')).toHaveText(/^녹음 2개 · 최근 /);
  await expect(page.locator('[data-hub-waiting] summary')).toHaveText('아직 분석 전인 곡 1');
  await expect(rows.nth(0)).toHaveAttribute('href', '#/growth-song/s1');
  // 최근 분석한 녹음: the five newest recordings that have an analysis.
  const takes = page.locator('[data-hub-take]');
  expect(await takes.evaluateAll(els => els.map(e => [e.dataset.hubTake, e.getAttribute('href')]))).toEqual(
    ['a6', 'b2', 'e1', 'a5', 'a4'].map(id => [id, '#/analysis/' + id]));
  await expect(takes.nth(1)).toContainText('On My Own');
  await expect(page.locator('[data-hub-reports]')).toHaveAttribute('href', '#/lab-reports');
  await expect(page.locator('[data-hub-reports]')).toContainText('저장한 리포트 1개');
  await expect(page.locator('.growth-hub-more:not([data-hub-waiting]) summary')).toHaveText('녹음이 없는 곡 1');
  // Back and forth between the tabs: still the one read and the one pass (이번 달's 다음 연습 reads the same model).
  await tabs(page).nth(0).click(); await openReport(page); await expect(page.locator('[data-gm-report="month"] [data-month-section="results"]')).toBeVisible();
  await tabs(page).nth(1).click(); await expect(rows).toHaveCount(4);
  expect(await page.evaluate(() => [window.__reads, window.__passes])).toEqual([1, 1]);
  // A new analysis arrives while the tab is open: the row follows.
  await page.evaluate(async a => { const m = (await VZ.media.list()).find(x => x.id === 'd2'); await VZ.media.update(m, {analysis:a}); }, v2({into:20}));
  await expect(page.locator('[data-hub-song="s4"] .growth-hub-chip')).toHaveText('녹음 하나');
  await expect(page.locator('[data-hub-song="s4"] .item-sub')).toContainText('분석한 녹음 1개 · 분석 전 1개');
  await expect(page.locator('[data-hub-waiting]')).toHaveCount(0);
});

test('recordings added or analysed after the first open show up without a reload, on 지난 흐름 and 곡', async ({page}) => {
  await boot(page);
  const kpi = () => page.locator('.growth-hero .growth-kpi-grid strong').allTextContents();   // 곡 녹음 · 분석 완료 · 분석한 곡 · 분석한 월
  const row = id => page.locator('[data-hub-song="' + id + '"]');
  await page.goto('/' + REPORT_ALL);
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['11', '9', '3']);
  await to(page, '#/vocal-analysis');
  await expect(row('s4').locator('.growth-hub-chip')).toHaveText('분석 전');
  // 1) An analysis lands on a take while the list in memory stays the very same array and no event is sent:
  //    the model must notice from the take itself.
  await page.evaluate(async a => { window.__list = await VZ.media.list(); window.__list.find(m => m.id === 'd2').analysis = a; }, v2({into:20}));
  await to(page, REPORT_ALL);
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['11', '10', '4']);
  await to(page, '#/vocal-analysis');
  await expect(row('s4').locator('.growth-hub-chip')).toHaveText('녹음 하나');
  await expect(row('s4').locator('.item-sub')).toContainText('분석한 녹음 1개 · 분석 전 1개');
  // 2) A song added to the records without a change event, and an analysed take moved to it in place.
  await page.evaluate(() => { VZ.db.songs.push({id:'s9', title:'나중에 추가한 곡', created:Date.now()}); window.__list.find(m => m.id === 'a5').songId = 's9'; });
  await to(page, REPORT_ALL);
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['11', '10', '5']);
  await to(page, '#/vocal-analysis');
  await expect(row('s9')).toContainText('나중에 추가한 곡');
  await expect(row('s9').locator('.item-sub')).toContainText('분석한 녹음 1개');
  await expect(row('s1').locator('.item-sub')).toContainText('분석한 녹음 5개');
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
  await expect(row('s4').locator('.item-sub')).toContainText('분석한 녹음 1개 · 분석 전 2개');
  await expect(row('s4').locator('.growth-hub-chip')).toHaveText('녹음 하나');
  await expect(row('s1').locator('.item-sub')).toContainText('분석한 녹음 6개');
  await expect(row('s9')).toHaveCount(0);
  await expect(page.locator('[data-hub-take]').first()).toHaveAttribute('data-hub-take', 'new1');
  await to(page, REPORT_ALL);
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect((await kpi()).slice(0, 3)).toEqual(['12', '10', '4']);
  // 연구소 counts what is there now for its state words as well (nothing kept from an earlier draw).
  await to(page, '#/growth-lab');
  const analysed = await page.evaluate(async () => VZ.growthDataset(await VZ.media.list()).rows.filter(r => !r.deleted && r.analysed).length);
  await expect(page.locator('[data-lab-state="take"]')).toHaveText('분석한 녹음 ' + analysed + '개');
});

test('연구소 holds no practice entries; the practice screens open from 성장 with 오늘 lit and 뒤로 returns', async ({page}) => {
  await boot(page, {extra:{practices:ROOM}});
  await page.goto('/#/growth-lab');
  await expect(page.locator('[data-lab-tool="reports"]')).toBeVisible();
  for (const sel of ['[data-hub-room]', '[data-hub-check]', '[data-hub-set]', '[data-hub-review]', '[data-hub-tip]', '[data-hub-training-take]', '[data-hub-result]', '[data-precision-entry]'])
    await expect(page.locator(sel)).toHaveCount(0);
  await expect(page.locator('#view iframe')).toHaveCount(0);         // nothing embedded
  // 나 (주) › 다음 연습 keeps starting a measured exercise where it is practised (연습 따라 하기) — a screen of 오늘 now.
  await tabs(page).nth(0).click();
  await period(page, 'week');
  await expect(page.locator('[data-gm-today]')).toHaveText('연습은 오늘 탭에서 해요');
  await expect(page.locator('[data-gm-today]')).toHaveAttribute('href', '#/home');
  const key = await page.evaluate(async () => VZ.practiceTips(await VZ.media.list()).tips[0].key);
  // Its old address opens 오늘의 연습 with a set of that one step; ✕ before starting goes back and keeps no set.
  await to(page, '#/guided-practice/' + encodeURIComponent('analysis:' + key));
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(page.locator('#top h1')).toHaveText('오늘의 연습');
  await expect(page.locator('[data-pset-run]')).toBeVisible();
  await expect(page.locator('#view')).not.toContainText('연습을 찾을 수 없어요');
  await expect(page.locator('.v-nav a[data-nav="home"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-pset-run] [data-run-exit]').click();
  await expect(page).toHaveURL(/#\/vocal-growth\?period=week$/);
  for (const [hash, title] of [['#/practice-set', '오늘의 연습'], ['#/voice-check', '보이스 체크'], ['#/practice-room', '노래 연습실']]) {
    await to(page, hash);
    await expect(page.locator('#top h1')).toHaveText(title);
    await expect(page.locator('.v-nav a[data-nav="home"]')).toHaveAttribute('aria-current', 'page');
    await page.locator('[data-back]').click();
    await expect(page).toHaveURL(/#\/vocal-growth\?period=week$/);
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  }
});

test('empty states say what is missing and offer one way forward', async ({page}) => {
  // No song at all.
  await boot(page, {songs:[], takes:[]});
  await page.goto('/#/vocal-analysis');
  await expect(page.locator('[data-growth-analysis] .empty')).toContainText('먼저 곡을 추가해 주세요.');
  await expect(page.locator('[data-growth-analysis] .empty a.btn')).toHaveAttribute('href', '#/songs');
  await expect(page.locator('[data-hub-reports]')).toContainText('저장한 리포트가 아직 없어요');
  await tabs(page).nth(2).click();
  for (const key of ['take', 'reports', 'ear']) await expect(page.locator('[data-lab-state="' + key + '"]')).toHaveText('아직 없음');
  await expect(page.locator('[data-lab-state][data-state="ok"]')).toHaveCount(0);                 // nothing made up
  await tabs(page).nth(0).click();
  await expect(page.locator('[data-gm-tile="recordings"] strong')).toHaveText('0개');
  await expect(page.locator('[data-gm-section="next"] [data-gm-chip="숙제"]')).toHaveCount(0);   // nothing made up
  await to(page, REPORT_ALL);
  await expect(page.locator('[data-overall-body]')).toContainText('아직 측정된 곡 녹음이 없어요');
  // Songs, but nothing recorded for them yet: one action.
  await page.evaluate(() => VZ.change(d => { d.songs.push({id:'n1', title:'첫 곡', created:Date.now()}); }, {silent:true}));
  await to(page, '#/vocal-analysis');
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
  for (const [hash, mark] of [['#/vocal-growth', '[data-gm-section="word"]'], [REPORT_ALL, '[data-overall-body]'], ['#/vocal-growth?period=month', '[data-gm-report="month"] [data-month-section="results"]'], ['#/vocal-growth?period=week', '[data-gm-report="week"] .ws-card'], ['#/vocal-analysis', '[data-hub-song]'], ['#/growth-lab', '[data-lab-tool="reports"]']]) {
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
  // 곡: its two columns. 연구소: its two groups (소리 깊이 보기 | 기록·기준).
  for (const [hash, mark, cols] of [['#/vocal-analysis', '[data-hub-song]', '.growth-hub-col'], ['#/growth-lab', '[data-lab-tool="reports"]', '.growth-lab-group']]) {
    await page.goto('/#/home'); await page.goto('/' + hash);
    await expect(page.locator(mark).first()).toBeVisible();
    const box = await page.evaluate(sel => { const [a, b] = [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect()); return {a:{l:a.left, r:a.right, t:a.top}, b:{l:b.left, r:b.right, t:b.top}, view:document.getElementById('view').getBoundingClientRect().width}; }, cols);
    expect(Math.round(box.view), hash).toBe(column);
    expect(box.b.l, hash).toBeGreaterThan(box.a.r);                  // side by side…
    expect(Math.abs(box.a.t - box.b.t), hash).toBeLessThan(2);       // …from the same line
    expect(box.b.r - box.b.l, hash).toBeGreaterThan(280);
    expect(await overflow(page), hash).toEqual({wide:false, over:0});
    await expect(dock(page)).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.locator('.growth-hub-hint')).toHaveCount(0);     // the hint belongs to 곡
  await tabs(page).nth(1).click();
  await expect(page.locator('.growth-hub-hint')).toBeVisible();
  // 나: 단계 in one row (the 기본기 tiles are on 단계); the one line, 다음 연습 and 한 것 below, nothing wider than the screen.
  await tabs(page).nth(0).click();
  await period(page, 'week');
  await openFold(page, 'next');                                         // 다음 연습: a row of 나
  await expect(page.locator('[data-gm-section="next"]')).toBeVisible();
  const me = await page.evaluate(() => {
    const box = s => document.querySelector(s).getBoundingClientRect();
    return {lv:box('[data-gme-lv]'), tiles:document.querySelectorAll('[data-gme-tile]').length, line:box('[data-gm-section="line"]'), next:box('[data-gm-section="next"]'), tabs:box('.growth-top-tabs').width, view:box('#view').width};
  });
  expect(me.tiles).toBe(0);
  expect(me.lv.height).toBeLessThan(80);
  expect(me.next.top).toBeGreaterThan(me.lv.top);
  expect(me.tabs).toBeLessThan(me.view);                       // the tab box keeps a phone-like width
  expect(await overflow(page)).toEqual({wide:false, over:0});
  // 지난 흐름 › 전체 분석: the six measures three across, AI 코치 beside 다음 연습; the cards themselves are unchanged.
  await to(page, REPORT_ALL);
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  const report = await page.evaluate(() => {
    const box = s => document.querySelector(s).getBoundingClientRect(), cards = [...document.querySelectorAll('.growth-stats-grid [data-growth-metric]')].map(e => Math.round(e.getBoundingClientRect().top));
    return {rows:new Set(cards).size, coach:box('[data-growth-anchor="coach"]'), practice:box('[data-growth-anchor="practice"]')};
  });
  expect(report.rows).toBe(2);
  expect(report.practice.left).toBeGreaterThan(report.coach.right);
  expect(Math.abs(report.practice.top - report.coach.top)).toBeLessThan(2);
  expect(await overflow(page)).toEqual({wide:false, over:0});
  // 주간 요약: cards in two columns. The fixture's practice is yesterday, which is last week on a Monday: open the
  // week that holds it (a fixed week, not "this week", so the test does not fail every Monday).
  const week = (d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); })(ago(1));
  await page.goto('/#/weekly-summary?week=' + week);
  await expect(page.locator('[data-gm-report="week"]')).toHaveAttribute('data-week', week);
  await expect(page.locator('[data-weekly-summary] .ws-empty-card')).toHaveCount(0);
  const lefts = await page.locator('[data-weekly-summary] .ws-card').evaluateAll(els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().left)))]);
  expect(lefts.length).toBe(2);
  expect(await overflow(page)).toEqual({wide:false, over:0});
});
