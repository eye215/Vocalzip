// 곡 점검 (app/song-check.js, model app/song-check-model.js): a take far from its song's other takes is pointed at on
// 성장 › 곡 (one line) and on 곡 하나, with the song it sits with; 옮기기 · 곡 바꾸기 · 맞아요. Fake analyses, fake saves.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const seed = {categories:[], songs:[{id:'river', title:'The River'}, {id:'home', title:'Home'}], lessons:[], assignments:[], practices:[], performances:[], comparisonReports:[], dailyGoals:[], practicePlans:[]};
const a = (low, high) => ({v:2, confidence:{aiSeparated:true}, metrics:{voicedSeconds:60, range:{lowCents:(low - 2) * 100, highCents:(high + 2) * 100, main:{lowCents:low * 100, highCents:high * 100}}}});
const row = (id, songId, low, high, date) => ({id, name:id, songId, recordedDate:date, created:Date.parse(date + 'T12:00:00'), type:'audio/wav', source:'practice', recordingCategory:'song', durationSeconds:60, analysis:a(low, high)});
const MEDIA = [row('r1', 'river', 60, 72, '2026-10-01'), row('r2', 'river', 61, 72, '2026-10-08'), row('r3', 'river', 60, 71, '2026-10-15'), row('r4', 'river', 60, 72, '2026-10-22'),
  row('x', 'river', 52, 64, '2026-11-10'), row('h1', 'home', 52, 64, '2026-10-02'), row('h2', 'home', 53, 64, '2026-10-09'), row('h3', 'home', 52, 63, '2026-10-16')];
async function boot(page) {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(rows => {
    window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate();
    window.__moved = []; VZ.saveRecordingSong = async (m, v) => { window.__moved.push([m.id, v]); };
  }, MEDIA);
}
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('성장 › 곡 says how many; 곡 점검 lists the take with the song it sits with; 옮기기 moves it after a yes', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  const notice = page.locator('[data-sc-notice-link]');
  await expect(notice).toHaveText(/곡 확인이 필요해 보이는 녹음 1개/);
  await notice.click();
  await expect(page).toHaveURL(/#\/song-mismatch$/);
  const r = page.locator('[data-sc-row="x"]');
  await expect(r).toContainText('주로 부른 음역이 8반음 낮아요');
  await expect(r).toContainText('‘Home’ 녹음들과 비슷해요');
  await r.locator('[data-sc-move="home"]').click();
  await page.locator('.sheet-alert [data-ok]').click();
  await expect(page.locator('[data-sc-empty]')).toBeVisible();
  expect(await page.evaluate(() => window.__moved)).toEqual([['x', 'home']]);
});

test('맞아요 keeps it from being asked again (one synced plan row); 곡 하나 shows the song’s own', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/growth-song/river'; });
  const box = page.locator('[data-gsp-check]');
  await expect(box).toContainText('곡 확인이 필요해 보이는 녹음');
  await box.locator('[data-sc-row="x"] [data-sc-ok]').click();
  await expect(page.locator('[data-gsp-check]')).toHaveCount(0);
  expect(await page.evaluate(() => VZ.db.practicePlans.filter(p => p.kind === 'song-check-ok').map(p => p.ids))).toEqual([['x']]);
  await page.evaluate(() => { location.hash = '#/growth-song/home'; });
  await expect(page.locator('[data-gsp-hero]')).toBeVisible();
  await expect(page.locator('[data-gsp-check]')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await page.waitForTimeout(800);
  await expect(page.locator('[data-sc-notice-link]')).toHaveCount(0);
});
