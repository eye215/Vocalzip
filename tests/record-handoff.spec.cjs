// 아이패드에서 곡을 틀고 아이폰으로 녹음 (app/record-handoff.js): the song page's 아이폰으로 녹음 keeps ONE request row
// and sends it to the account's other devices; a phone (another device id) shows 녹음 시작 at the top, which opens the
// recorder with that song; once used or closed it is not offered again there; after 10 minutes it is not offered.
// 곡 녹음 → 연습 시간 (app/recording-time.js): a song's practice recording counts as that day's practice time.
// Fake data and a fake device channel: no live account, cloud or person.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const seed = (extra = {}) => ({categories:[], songs:[{id:'s1', title:'This Is the Moment'}], lessons:[], assignments:[], practices:[], performances:[], comparisonReports:[], dailyGoals:[], practicePlans:[], ...extra});
async function boot(page, value, {ua = '', device = ''} = {}) {
  page.__errors = [];page.on('pageerror', e => page.__errors.push(e.message));
  await page.addInitScript(([key, value, device]) => {
    // A kept request's time is "a minute ago" (AT_MINUTE_AGO in the seed).
    if (!sessionStorage.getItem('rh-seeded')) { localStorage.setItem(key, value.replace(/"AT_MINUTE_AGO"/g, String(Date.now() - 60000))); if (device) localStorage.setItem('vzip_device_id', device); sessionStorage.setItem('rh-seeded', '1'); }
    // A stand-in for the account's device channel (cloud-sync.js's own is kept out): what is sent is kept; a test delivers.
    window.__sent = [];const listeners = [];
    const send = async p => { window.__sent.push(p); return true; }, listen = fn => { listeners.push(fn); return () => {}; };
    Object.defineProperty(window, 'vzipCloudDeviceSend', {configurable:true, get:() => send, set() {}});
    Object.defineProperty(window, 'vzipCloudDeviceListen', {configurable:true, get:() => listen, set() {}});
    window.__deliver = p => listeners.forEach(fn => fn(p));
  }, [KEY, JSON.stringify(value), device]);
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && !!window.VZ.recordHandoff)).toBe(true);
}
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const bar = page => page.locator('[data-record-handoff-bar]');

test.describe('아이패드', () => {
test.use({userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', viewport:{width:820, height:1180}});
test('아이폰으로 녹음 keeps one request and sends it; the same device is never offered its own', async ({page}) => {
  await boot(page, seed(), {device:'ipad-1'});
  await page.evaluate(() => { location.hash = '#/song/s1'; });
  const button = page.locator('#top [data-record-handoff="s1"]');
  await expect(button).toHaveAttribute('aria-label', '휴대폰으로 녹음');
  await button.click();
  await expect(page.locator('[data-rh-sheet]')).toContainText('휴대폰에 앱이 열려 있으면 지금 ‘녹음 시작’이 떠요.');
  const row = await page.evaluate(() => VZ.db.practicePlans.filter(p => p.kind === 'record-handoff'));
  expect(row).toEqual([expect.objectContaining({id:'record-handoff', songId:'s1', from:'ipad-1', fromName:'아이패드'})]);
  expect(await page.evaluate(() => window.__sent)).toEqual([{songId:'s1', at:row[0].at, from:'ipad-1', fromName:'아이패드'}]);
  await page.locator('[data-rh-sheet]').page().getByRole('button', {name:'확인'}).click();
  // Its own request is not offered back.
  await page.evaluate(() => VZ.recordHandoff.check());
  await expect(bar(page)).toHaveCount(0);
});
});

test.describe('아이폰', () => {
test.use({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', viewport:{width:390, height:844}});
test('the request shows 녹음 시작 at once (message) or when opened (kept row), opens the recorder with the song; not again, not after 10 minutes', async ({page}) => {
  await boot(page, seed({practicePlans:[{id:'record-handoff', kind:'record-handoff', v:1, songId:'s1', at:'AT_MINUTE_AGO', from:'ipad-1', fromName:'아이패드'}]}), {device:'phone-1'});
  // No button on the phone's song page: the phone is the one that records.
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toContainText('아이패드에서 고른 곡');
  await expect(bar(page)).toContainText('This Is the Moment');
  expect((await bar(page).locator('[data-rh-go]').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await bar(page).locator('[data-rh-go]').click();
  await expect(page).toHaveURL(/#\/record\?song=s1$/);
  await expect(bar(page)).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.evaluate(() => VZ.recordHandoff.check());
  await expect(bar(page)).toHaveCount(0);                        // used: not offered again
  // A new one by message, while the app is open; closed with ✕.
  await page.evaluate(() => window.__deliver({songId:'s1', at:Date.now(), from:'ipad-1', fromName:'아이패드'}));
  await expect(bar(page)).toBeVisible();
  await bar(page).locator('[data-rh-close]').click();
  await expect(bar(page)).toHaveCount(0);
  // Older than 10 minutes: not offered.
  await page.evaluate(() => window.__deliver({songId:'s1', at:Date.now() + 1 - 11 * 60000, from:'ipad-1', fromName:'아이패드'}));
  await expect(bar(page)).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/song/s1'; });
  await expect(page.locator('#top [data-record-handoff]')).toHaveCount(0);
});
});

test.describe('갤럭시', () => {
test.use({userAgent:'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', viewport:{width:384, height:832}});
test('an Android phone receives too (here from a 태블릿), with no send button of its own', async ({page}) => {
  await boot(page, seed({practicePlans:[{id:'record-handoff', kind:'record-handoff', v:1, songId:'s1', at:'AT_MINUTE_AGO', from:'tab-1', fromName:'태블릿'}]}), {device:'galaxy-1'});
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toContainText('태블릿에서 고른 곡');
  await page.evaluate(() => { location.hash = '#/song/s1'; });
  await expect(page.locator('#top [data-record-handoff]')).toHaveCount(0);
});
});

test('곡 녹음 → 연습 시간: a song\'s practice recording counts that day; entered time for the song wins', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed());
  // Two recordings of the song today (2:10 and 0:50), as the recorder saves them.
  await page.evaluate(() => {
    const list = [{id:'m1', songId:'s1', recordedDate:'2026-11-20', durationSeconds:130, occasion:'practice', recordingCategory:'song', created:1}, {id:'m2', songId:'s1', recordedDate:'2026-11-20', durationSeconds:50, occasion:'practice', recordingCategory:'song', created:2}];
    VZ.media.list = async () => list;VZ.media.cached = () => list;
  });
  await page.evaluate(() => VZ.recordingTime.run());
  await expect.poll(() => page.evaluate(() => VZ.db.practices.map(p => [p.id, p.minutes, p.practiceTimeSource]))).toEqual([['rec-time:2026-11-20:s1', 3, 'recording']]);
  // Its record says how it was counted.
  await page.evaluate(() => { location.hash = '#/practices'; });
  await expect(page.locator('[data-practice="rec-time:2026-11-20:s1"]')).toContainText('3분 · 녹음으로 셈');
  // Time entered for the song that day takes over: the automatic row goes, nothing counted twice.
  await page.evaluate(() => VZ.change(d => { d.practices.push({id:'m', date:'2026-11-20', songId:'s1', minutes:20, manualMinutes:20, practiceTimeSource:'manual', practiceMode:'song'}); }));
  await page.evaluate(() => VZ.recordingTime.run());
  await expect.poll(() => page.evaluate(() => VZ.db.practices.map(p => p.id))).toEqual(['m']);
});

// 녹음 저장 화면 › 오늘 이 곡 연습 (VZ.recPracticeBlock, owner 2026-11-23: "곡 녹음 연습 등록하는게 불편"): the saved song
// take shows that day's practice for the song (its length, counted at once), and one tap writes the time actually
// practised as the person's own row — the automatic one gives way; a second tap changes that same row.
test('녹음 저장 → 오늘 이 곡 연습: the take counts at once, one tap writes the real time, a second tap changes it', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'Fake capture devices are Chromium-only.');
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed());
  await page.evaluate(() => { location.hash = '#/record?song=s1'; });
  await page.getByRole('button', {name:'녹음 시작', exact:true}).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', {name:'녹음 종료', exact:true}).click();
  await page.locator('[data-review] [data-save]').click();
  const block = page.locator('[data-rec-practice]'), min = block.locator('[data-rec-practice-min]');
  await expect(min).toHaveText('1분', {timeout:15000});
  await expect(block).toContainText('녹음 길이로 넣었어요');
  const rows = () => page.evaluate(() => VZ.db.practices.filter(p => p.songId === 's1' && p.date === VZ.today()).map(p => ({id:p.id, minutes:p.minutes, source:p.practiceTimeSource, media:p.mediaIds.length})));
  expect(await rows()).toEqual([expect.objectContaining({id:expect.stringMatching(/^rec-time:/), minutes:1, source:'recording', media:1})]);
  for (const b of await block.locator('[data-rec-min]').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await block.locator('[data-rec-min="30"]').click();
  await expect(min).toHaveText('30분');
  await expect(block).toContainText('직접 적은 시간이에요');
  await expect(block.locator('[data-rec-min="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(rows).toEqual([expect.objectContaining({minutes:30, source:'manual', media:1})]);   // the automatic row went
  const id = (await rows())[0].id;
  await block.locator('[data-rec-min="20"]').click();
  await expect(min).toHaveText('20분');
  expect(await rows()).toEqual([expect.objectContaining({id, minutes:20, source:'manual'})]);           // the same row
  // 연습 기록 고치기 opens that row in the sheet.
  await block.locator('[data-log]').click();
  await expect(page.locator('#practice-log [name=minutes]')).toHaveValue('20');
});
