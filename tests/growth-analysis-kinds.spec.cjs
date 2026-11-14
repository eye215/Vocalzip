// 성장 2단계 C — 보컬 분석이 세는 녹음을 결과 리포트와 나란히 읽을 수 있게:
//  1) 노래 연습실 제출·트레이닝 연습 녹음은 지금처럼 보컬 분석에는 있고 결과 리포트·주간 요약·계획 결과에는 없다.
//     보컬 분석(곡 행, 최근 분석한 녹음, 보컬 연구소의 녹음 날짜)에 `연습` 표시를 붙여 왜 리포트에 없는지 보이게 한다.
//  2) 영상 녹음은 결과 리포트처럼 보컬 분석에도 들어간다 (데이터셋 규칙 songList). `영상` 표시.
// The data set is the one of tests/growth-characterization.spec.cjs (er = 연습실 submission, et = 트레이닝 practice,
// dv/dc = videos, g1 = in the deleted list).
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {NOW, MEDIA, DB} = require('./growth-characterization.fixture.cjs');
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR', viewport:{width:390, height:844}});
async function boot(page, media = MEDIA) {
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
  await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, media);
}
const go = async (page, hash, mark) => { await page.evaluate(h => { location.hash = h; }, hash); await expect(page.locator(mark).first()).toBeVisible(); };
const sub = (page, id) => page.locator('[data-hub-song="' + id + '"] .item-sub');

test('보컬 분석 곡 행: 연습 녹음과 영상을 세고, 몇 개가 연습·영상인지 말한다 — 결과 리포트 숫자는 그대로', async ({page}) => {
  await boot(page);
  // 결과 리포트 first: what it counts does not change (24 song recordings, 20 reliable analyses).
  await go(page, '#/vocal-growth', '[data-overall-body]');
  const kpi = await page.locator('.growth-kpi-grid strong').allTextContents();
  expect(kpi).toEqual(['24', '20', '5', '4']);
  const overall = await page.evaluate(async () => { const m = VZ.growthModel(await VZ.media.list()); return {ids:m.songItems.map(x => x.id).sort(), recordings:m.overall.recordings}; });
  expect(overall.ids).not.toContain('er'); expect(overall.ids).not.toContain('et');     // 연습 recordings stay out of the report
  expect(overall.ids).toEqual(expect.arrayContaining(['dv', 'dc']));                    // videos were always in it
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  // Home: 4 takes + the 연습실 submission + the 트레이닝 practice recording. The count is what it was; now it says so.
  await expect(sub(page, 's5')).toHaveText('녹음 6개 (연습 2개 포함) · 분석 6개 · 최근 11월 9일');
  // 새 곡: two unanalysed recordings and two analysed videos — the videos are counted now, as 결과 리포트 counts them.
  await expect(sub(page, 's4')).toHaveText('녹음 4개 (영상 2개 포함) · 분석 2개 · 최근 11월 9일');
  await expect(page.locator('[data-hub-song="s4"]')).toHaveAttribute('data-hub-state', 'ok');
  // Songs without either read as before.
  await expect(sub(page, 's1')).toHaveText('녹음 10개 · 분석 10개 · 최근 11월 12일');
  await expect(sub(page, 's2')).toHaveText('녹음 5개 · 분석 5개 · 최근 11월 11일');
  await expect(page.locator('[data-hub-practice-note]')).toHaveText('연습은 노래 연습실·트레이닝 연습으로 남긴 녹음이에요. 여기서는 함께 보고, 결과 리포트·주간 요약·계획 결과에는 넣지 않아요.');
  // The row counts are the dataset's rule, the same list 보컬 연구소 shows.
  const counts = await page.evaluate(async () => { const ds = VZ.growthDataset(await VZ.media.list()); return Object.fromEntries([...ds.bySong('songList')].map(([id, rows]) => [id, rows.length])); });
  expect(counts).toEqual({s1:10, s2:5, s3:2, s4:4, s5:6});
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(page.__errors).toEqual([]);
});

test('최근 분석한 녹음: 곡의 연습 녹음에는 연습, 영상에는 영상 표시 — 곡이 없는 보이스 체크에는 붙이지 않는다', async ({page}) => {
  const pick = ['e2', 'er', 'et', 'dv', 'vc1', 'e1', 'd1'];
  await boot(page, MEDIA.filter(m => pick.includes(m.id)));
  await go(page, '#/vocal-analysis', '[data-hub-take]');
  const rows = await page.locator('[data-hub-take]').evaluateAll(els => els.map(e => [e.dataset.hubTake, [...e.querySelectorAll('[data-hub-kind]')].map(c => c.dataset.hubKind + ':' + c.textContent)]));
  expect(rows).toEqual([['vc1', []], ['e2', []], ['er', ['practice:연습']], ['et', ['practice:연습']], ['dv', ['video:영상']]]);
  await expect(page.locator('[data-hub-take="er"] [data-hub-kind]')).toHaveAttribute('title', '연습 녹음 · 결과 리포트에는 넣지 않아요');
  // The chip sits beside the name and nothing is pushed off the row at 320px either.
  await page.setViewportSize({width:320, height:640});
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.locator('[data-hub-take="er"]').evaluate(el => { const row = el.getBoundingClientRect(), chip = el.querySelector('[data-hub-kind]').getBoundingClientRect(); return chip.right <= row.right && chip.left >= row.left; })).toBe(true);
  // Without any 연습 recording the note is not shown.
  await boot(page, MEDIA.filter(m => ['e1', 'e2'].includes(m.id)));
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  await expect(page.locator('[data-hub-practice-note]')).toHaveCount(0);
  await expect(sub(page, 's5')).toHaveText('녹음 2개 · 분석 2개 · 최근 11월 9일');
  expect(page.__errors).toEqual([]);
});

test('보컬 연구소: 곡의 녹음 목록은 같은 규칙 — 영상도 있고, 연습·영상 표시가 붙고, 삭제 목록의 녹음은 없다', async ({page}) => {
  await boot(page);
  const dates = () => page.locator('.vl-dates [data-date]').evaluateAll(els => els.map(e => [e.dataset.date, e.textContent.replace(/\s+/g, ' ').trim()]));
  await go(page, '#/vocal-lab/s5', '.vl-dates [data-date]');
  expect(await dates()).toEqual([['e1', '10.05'], ['ey', '11.05'], ['ex', '11.06'], ['et', '11.07 연습'], ['er', '11.08 연습'], ['e2', '11.09']]);
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  await go(page, '#/vocal-lab/s4', '.vl-dates [data-date]');
  expect(await dates()).toEqual([['d1', '11.02'], ['dv', '11.06 영상'], ['dc', '11.07 영상'], ['d2', '11.09']]);
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  await go(page, '#/vocal-lab/s2', '.vl-dates [data-date]');
  expect((await dates()).map(d => d[0])).toEqual(['b1', 'b2', 'b5', 'b4', 'b3']);          // g1 is in the deleted list
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(page.__errors).toEqual([]);
});
