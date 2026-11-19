// 지표 목표: on 결과 리포트's 월별 측정 흐름 a person can set a target for a trend measure (음정 정확도 / 음정 안정성).
// It is kept in settings.growthTargets, drawn as a dashed reference line, and the latest month's distance to it is
// shown. It changes no measurement or verdict. Uses the growth characterization fixture.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const {NOW, MEDIA, DB} = require('./growth-characterization.fixture.cjs');
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
async function boot(page) {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(DB)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, MEDIA);
  await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; });
  await expect(page.locator('[data-overall-trend]')).toBeVisible();
}
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).settings?.growthTargets || {}, KEY);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('set a target: suggested from the latest month, drawn as a line, distance shown; clearing removes it', async ({page}) => {
  await boot(page);
  const trend = page.locator('[data-overall-trend]');
  const row = trend.locator('[data-growth-target-row]');
  await expect(row).toContainText('목표를 정하면');
  await expect(trend.locator('[data-growth-target-line]')).toHaveCount(0);
  const latest = await page.evaluate(async () => VZ.growthModel(await VZ.media.list()).overall.metrics.find(m => m.id === 'intonation').trend.at(-1).value);
  await row.locator('[data-growth-target]').click();
  const input = page.locator('#growth-target-form [name=value]');
  await expect(input).toHaveValue(String(Math.round(latest * .9 * 10) / 10));   // 10% better (lower) than the latest month
  await input.fill(String(Math.round((latest - 2) * 10) / 10));
  await page.locator('button[form=growth-target-form]').click();
  await expect(trend.locator('[data-growth-target-line]')).toHaveCount(1);
  await expect(page.locator('[data-overall-trend] [data-growth-target-row]')).toContainText('2 cent 남았어요');
  expect((await stored(page)).intonation.value).toBe(Math.round((latest - 2) * 10) / 10);
  if (process.env.VZ_SHOTS) { await page.locator('[data-overall-trend]').scrollIntoViewIfNeeded(); await page.screenshot({path:process.env.VZ_SHOTS + '/growth-target.png'}); }
  // A target the latest month already meets says so.
  await page.locator('[data-overall-trend] [data-growth-target]').click();
  await page.locator('#growth-target-form [name=value]').fill(String(Math.ceil(latest + 5)));
  await page.locator('button[form=growth-target-form]').click();
  await expect(page.locator('[data-overall-trend] [data-growth-target-row]')).toContainText('목표에 닿았어요');
  // Clear.
  await page.locator('[data-overall-trend] [data-growth-target]').click();
  await page.locator('[data-target-clear]').click();
  await expect(page.locator('[data-overall-trend] [data-growth-target-row]')).toContainText('목표를 정하면');
  expect((await stored(page)).intonation).toBeUndefined();
});

test('each trend measure keeps its own target; a reload keeps it', async ({page}) => {
  await boot(page);
  await page.locator('[data-overall-metric="stability"]').click();
  await page.locator('[data-overall-trend] [data-growth-target]').click();
  await page.locator('#growth-target-form [name=value]').fill('9');
  await page.locator('button[form=growth-target-form]').click();
  await expect(page.locator('[data-overall-trend] [data-growth-target-row]')).toContainText('목표 ±9');
  await page.locator('[data-overall-metric="intonation"]').click();
  await expect(page.locator('[data-overall-trend] [data-growth-target-row]')).toContainText('목표를 정하면');
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); location.hash = '#/home'; }, MEDIA);
  await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; });
  await page.locator('[data-overall-metric="stability"]').click();
  await expect(page.locator('[data-overall-trend] [data-growth-target-row]')).toContainText('목표 ±9');
});
