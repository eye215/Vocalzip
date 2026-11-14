// 성장 데이터 구조 정리 (step 1) — characterization: every number and verdict text the growth screens show for one
// rich, fake data set, pinned in tests/growth-characterization.snapshot.json. The snapshot was taken on main BEFORE
// app/growth-dataset.js existed; the refactor has to leave every value as it was. Screens covered: 전체 분석 (model
// and screen), 월별 분석 (every month, plans and plan outcomes, the archived month reports), 주간 요약 (six weeks and
// the 홈 row), 보컬 분석 탭, 보컬 트레이닝 탭, 곡별 "보컬 측정 변화" 카드.
// Two time zones: Korea (the owner's) and UTC. Step 2 (part B) changed two rules on purpose, and only the values
// below moved in the snapshot:
//  - a recording whose id is in the deleted list (g1) is counted by no growth screen (before: only 주간 요약 left it out);
//  - a recording without a recorded date (b4) has its Korea day on every screen (before: the device's day everywhere
//    but 주간 요약), so the UTC run now shows what the Korea run shows.
// To take the snapshot again on purpose: UPDATE_GROWTH_SNAPSHOT=1 npx playwright test tests/growth-characterization.spec.cjs --project=chromium-mobile --workers=1
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1', FILE = path.join(__dirname, 'growth-characterization.snapshot.json');
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const {NOW, MEDIA, DB} = require('./growth-characterization.fixture.cjs');
/** Every text fragment under root, in document order (hidden details included): what the screen says. */
const texts = () => (root => { const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.parentElement.closest('script,style')) continue; const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) out.push(t); } return out; });
async function boot(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(DB)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  // The media list comes straight from the fixture (no files): what the device store would hand to VZ.media.list().
  await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, MEDIA);
}
const go = async (page, hash, mark) => { await page.evaluate(h => { location.hash = h; }, hash); await expect(page.locator(mark).first()).toBeVisible(); };
async function collect(page) {
  const out = {};
  await boot(page);
  // 전체 분석: the screen, and the model the 보컬 분석 tab shares.
  await go(page, '#/vocal-growth', '[data-overall-body]');
  out.overallScreen = await page.locator('[data-growth]').evaluate(texts());
  out.overallModel = await page.evaluate(async () => JSON.parse(JSON.stringify(VZ.growthModel(await VZ.media.list()).overall)));
  out.songTakeIds = await page.evaluate(async () => VZ.growthModel(await VZ.media.list()).songItems.map(m => m.id));
  // 월별 분석: each month it offers, with the plans and their outcome previews.
  await page.locator('[data-growth-mode="monthly"]').click();
  await expect(page.locator('[data-growth-select]')).toBeVisible();
  out.monthly = {};
  for (const month of await page.locator('[data-growth-select] option').evaluateAll(els => els.map(e => e.value))) {
    await page.locator('[data-growth-select]').selectOption(month);
    await expect(page.locator('[data-growth-select]')).toHaveValue(month);
    out.monthly[month] = await page.locator('[data-growth]').evaluate(texts());
  }
  out.monthlyArchive = await page.evaluate(() => (VZ.db.monthlyGrowthReports || []).map(r => ({...r, created:undefined, updatedAt:undefined})).sort((a, b) => a.month.localeCompare(b.month)));
  // 계획 결과: the report the app would save for every plan that has ended, from the takes the month view passes on.
  out.planOutcomes = await page.evaluate(async () => {
    const items = VZ.growthModel(await VZ.media.list()).songItems, valid = m => [1, 2].includes(m.analysis?.v) && VZ.analysisReliable(m.analysis);
    return VZ.db.practicePlans.filter(p => p.kind === 'monthly-vocal').map(plan => { try { return window.VzipPlanOutcome.report({plan, goals:VZ.db.dailyGoals, recordings:items, dateOf:VZ.growthDataset.dateOf, valid, asOf:VZ.today()}); } catch (e) { return {planId:plan.id, error:e.message}; } });
  });
  // 주간 요약: six weeks, and the 홈 row.
  out.weekly = {};
  for (const week of ['2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19', '2026-09-28', '2026-08-10']) {
    await go(page, '#/weekly-summary?week=' + week, '[data-weekly-summary] .ws-week');
    await expect(page.locator('[data-weekly-summary]')).toHaveAttribute('data-week', week);
    out.weekly[week] = await page.locator('[data-weekly-summary]').evaluate(texts());
  }
  out.weeklyHomeRow = await page.evaluate(() => { const r = VZ.weeklySummaryHomeRow?.(); return r ? {label:r.label, value:r.value, aria:r.aria} : null; });
  // 보컬 분석 · 보컬 트레이닝 tabs.
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  out.analysisTab = await page.locator('[data-growth-analysis]').evaluate(texts());
  out.analysisRows = await page.locator('[data-hub-song]').evaluateAll(els => els.map(e => [e.dataset.hubSong, e.dataset.hubState, e.querySelector('.item-sub').textContent]));
  out.analysisRecent = await page.locator('[data-hub-take]').evaluateAll(els => els.map(e => e.dataset.hubTake));
  await go(page, '#/vocal-training', '[data-hub-training-take]');
  out.trainingTab = await page.locator('[data-growth-training]').evaluate(texts());
  // 곡별 "보컬 측정 변화" card, for every song (and the deleted one), from that song's recordings.
  out.songCards = {};
  for (const id of ['s1', 's2', 's3', 's4', 's5', 's6']) {
    out.songCards[id] = await page.evaluate(async ([id, read]) => {
      const host = document.createElement('div'); document.querySelector('#view').append(host);
      VZ.songVocalGrowth(host, VZ.song(id) || {id, title:'삭제된 곡'}, (await VZ.media.list()).filter(m => m.songId === id));
      const out = new Function('return ' + read)()(host); host.remove(); return out;
    }, [id, texts().toString()]);
  }
  expect(page.__errors).toEqual([]);
  return out;
}
const leaves = v => v == null || typeof v !== 'object' ? 1 : Object.values(v).reduce((n, x) => n + leaves(x), 0);
for (const [zone, label] of [['Asia/Seoul', 'Korea time'], ['UTC', 'UTC']]) test.describe(label, () => {
  test.use({timezoneId:zone, locale:'ko-KR', viewport:{width:390, height:844}});
  test('every growth number and verdict text is what it was before the data-structure cleanup', async ({page}) => {
    test.setTimeout(120000);
    const got = JSON.parse(JSON.stringify(await collect(page)));   // as the snapshot file stores it
    const stored = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
    if (process.env.UPDATE_GROWTH_SNAPSHOT) {
      stored[zone] = got;
      fs.writeFileSync(FILE, JSON.stringify(stored, null, 1) + '\n');
      console.log('snapshot written for ' + zone + ': ' + leaves(got) + ' values');
      return;
    }
    expect(stored[zone], 'snapshot for ' + zone).toBeTruthy();
    // Section by section, so a difference names the screen it is on.
    for (const key of Object.keys(stored[zone])) expect(got[key], key).toEqual(stored[zone][key]);
    expect(Object.keys(got).sort()).toEqual(Object.keys(stored[zone]).sort());
  });
});
