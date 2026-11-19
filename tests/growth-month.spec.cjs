// 성장 개편 안 B, phase 2 — 성장 › 이번 달 (app/growth-month.js) in the real app, with the invented data set of
// tests/growth-characterization.fixture.cjs (Friday 2026-11-13, Korea) plus a homework and a 레슨 지적 체크:
//   ⓐ 한 것 · ⓑ 달라진 것 (전체 · 곡별, 연습 녹음 포함, 지표 자세히) · ⓒ 다음 연습 · ⓓ 지난 흐름 보기, the period switch
//   (주간 · 월별 · 전체, kept on the device), the old addresses leading into the new tabs, 뒤로, phone and iPad widths.
// The switch OFF must show 결과 리포트's numbers: 지표 자세히 (월별) is compared with the pinned snapshot
// (tests/growth-characterization.snapshot.json), and 지표 자세히 (전체) with 지난 흐름 › 전체 분석 on the same data.
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const SHOTS = process.env.GROWTH_MONTH_SHOTS || '';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const {NOW, MEDIA, DB} = require('./growth-characterization.fixture.cjs');
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, 'growth-characterization.snapshot.json'), 'utf8'))['Asia/Seoul'];
const SEED = {...DB,
  assignments:[{id:'hw1', title:'후렴 호흡 자리 표시하고 부르기', songId:'s1', status:'active', startDate:'2026-11-10', dueDate:'2026-11-16'}],
  scoreAnnotations:[
    {id:'point:p1', kind:'score-point', songId:'s2', measures:{from:12, to:13}, text:'첫 음 미리 준비', created:1},
    {id:'point-run:r1', kind:'score-point-run', songId:'s2', date:'2026-11-05', at:2, results:{'point:p1':'kept'}},
    {id:'point-run:r2', kind:'score-point-run', songId:'s2', date:'2026-11-12', at:3, results:{'point:p1':'missed'}}
  ]};
/** Every text fragment under the element, as tests/growth-characterization.spec.cjs reads a screen. */
const texts = () => (root => { const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.parentElement.closest('script,style,[data-range-flow],[data-precision-entry],[data-precision-report-entry],[data-growth-changes]')) continue; const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) out.push(t); } return out; });
async function boot(page, {hash = '#/vocal-growth', seed = SEED} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  // The media list comes straight from the fixture (no files), on every load.
  await page.addInitScript(rows => { window.__rows = rows; }, MEDIA);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => window.__rows.map(r => ({...r})); VZ.media.invalidate(); });
  if (hash) { await page.evaluate(h => { location.hash = h; }, hash); }
}
/** After a reload: the fixture list again (the device store of the test browser is empty). */
async function reload(page) {
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(() => { window.vzipReadMedia = async () => window.__rows.map(r => ({...r})); VZ.media.invalidate(); const h = location.hash; location.hash = '#/home'; location.hash = h; });
}
const section = (page, key) => page.locator('[data-gm-section="' + key + '"]');
const tile = (page, key) => page.locator('[data-gm-tile="' + key + '"] strong');
const lines = page => page.locator('[data-growth-changes] [data-gc-song]').evaluateAll(els => els.map(e => e.dataset.gcSong));
const overflow = page => page.evaluate(() => ({wide:document.documentElement.scrollWidth > innerWidth + 1,
  over:[...document.querySelectorAll('#view *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.growth-chart,.growth-jumps'); }).length}));
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('ⓐ–ⓓ for 월별 (the default): what was done, what changed, what to practise next, and 지난 흐름 — each says what it compares', async ({page}) => {
  await boot(page);
  await expect(page.locator('.growth-top-tabs a')).toHaveText(['이번 달', '곡', '연구소']);
  await expect(page.locator('[data-gm-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 11월');
  // ⓐ 한 것: entered minutes only (30+20+15+8+12+3×0.5), days with entered time, recordings of November.
  await expect(section(page, 'done').locator('h2')).toHaveText('이번 달에 한 것');
  await expect(page.locator('[data-gm-basis="done"]')).toHaveText('이번 달 기록 · 지난달과 비교: 연습 0분 · 0일');
  await expect(tile(page, 'minutes')).toHaveText('1시간 27분');
  await expect(tile(page, 'days')).toHaveText('7일');
  await expect(tile(page, 'recordings')).toHaveText('24개');
  await expect(tile(page, 'voice-check')).toHaveText('3일');
  await expect(tile(page, 'lessons')).toHaveText('0번');
  await expect(tile(page, 'points')).toHaveText('2번');
  await expect(page.locator('[data-gm-tile="points"] small')).toHaveText('지켰어요 1 · 놓쳤어요 1');
  // ⓑ 달라진 것: last month's latest take vs this month's, same song, method and version.
  await expect(page.locator('[data-gm-basis="changes"]')).toHaveText('지난달과 비교 · 같은 곡을 같은 방법·같은 분석 버전으로 잰 녹음끼리');
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  expect(await lines(page)).toEqual(['s2', 's5', 's3']);
  await expect(page.locator('[data-growth-changes] [data-gc-song="s2"] .gc-basis')).toContainText('지난 기간 마지막 녹음과 이번 기간');
  await expect(page.locator('[data-growth-changes] .gc-head')).toHaveCount(0);       // the section has its own heading
  const s2 = page.locator('[data-growth-changes] [data-gc-song="s2"]');
  await expect(s2.locator('[data-gc-play]')).toHaveCount(2);                          // listen to both
  await expect(s2.locator('[data-listen-open]')).toHaveText('들어 보고 평가');
  await expect(s2.locator('[data-gc-between] summary')).toContainText('그 사이에 한 것');
  // ⓒ 다음 연습: homework first, then the missed lesson point, the measured ones and the plans; top five and 더 보기.
  await expect(page.locator('[data-gm-basis="next"]')).toContainText('오늘 기준');
  const items = section(page, 'next').locator(':scope > .gm-next > .gm-next-item');
  await expect(items).toHaveCount(5);
  await expect(items.nth(0).locator('[data-gm-chip]').first()).toHaveText('숙제');
  await expect(items.nth(0)).toContainText('후렴 호흡 자리 표시하고 부르기');
  await expect(items.nth(0).locator('a.gm-act')).toHaveAttribute('href', '#/homework');
  await expect(items.nth(1).locator('[data-gm-chip]').first()).toHaveText('레슨 지적');
  await expect(items.nth(1)).toContainText('12–13마디 · 첫 음 미리 준비');
  await expect(items.nth(1).locator('a.gm-act')).toHaveAttribute('href', '#/song/s2');
  await expect(items.nth(2).locator('[data-gm-chip]').first()).toHaveText('측정');
  await expect(section(page, 'next').locator('[data-gm-more] summary')).toHaveText(/^더 보기 \(\d+\)$/);
  await section(page, 'next').locator('[data-gm-more] summary').click();
  await expect(section(page, 'next').locator('[data-gm-more] [data-gm-chip="계획"]').first()).toBeVisible();
  // 목표에 담기 (a measured item): today's goal, the same one 전체 분석's 목표 담기 makes; pressed twice, still one.
  const add = items.nth(2).locator('[data-gm-goal]');
  await expect(add).toHaveText('목표에 담기');
  await add.click();
  await expect(items.nth(2).locator('[data-gm-goal]')).toHaveText('담았어요');
  await expect(items.nth(2).locator('[data-gm-goal]')).toBeDisabled();
  const goals = await page.evaluate(() => VZ.db.dailyGoals.filter(g => g.date === VZ.today() && g.sourceId === 'overall-growth').map(g => g.id));
  expect(goals).toHaveLength(1);
  expect(goals[0]).toMatch(/^overall-growth:2026-11-13:/);
  // ⓓ 지난 흐름 → the former 월별 분석 with its AI coach; 뒤로 returns to 이번 달.
  await expect(page.locator('[data-gm-basis="flow"]')).toHaveText('달마다의 흐름 · 지난달과 같은 곡끼리 비교');
  await expect(page.locator('[data-gm-week-ai]')).toHaveCount(0);
  await page.locator('[data-gm-flow]').click();
  await expect(page).toHaveURL(/#\/growth-flow\?period=month$/);
  await expect(page.locator('#top h1')).toHaveText('지난 흐름');
  await expect(page.locator('[data-growth-select]')).toHaveValue('2026-11');
  await expect(page.locator('[data-monthly-ai]')).toBeVisible();
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(section(page, 'done')).toBeVisible();
});

test('period switch: 주간 · 월별 · 전체 change every block and are kept on the device; 주간 has no AI coach', async ({page}) => {
  await boot(page);
  await expect(section(page, 'next')).toBeVisible();
  await page.locator('[data-gm-period="week"]').click();
  await expect(page.locator('[data-gm-period="week"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#\/vocal-growth$/);                    // the period is not an address
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 11월 9일 – 15일');
  await expect(section(page, 'done').locator('h2')).toHaveText('이번 주에 한 것');
  // The same numbers as 주간 요약 of that week (pinned in the snapshot: 연습 시간 52분, 연습한 날 4).
  const week = SNAPSHOT.weekly['2026-11-09'];
  expect(week.slice(week.indexOf('연습 시간'), week.indexOf('연습 시간') + 2)).toEqual(['연습 시간', '52분']);
  await expect(tile(page, 'minutes')).toHaveText('52분');
  await expect(tile(page, 'days')).toHaveText(week[week.indexOf('연습한 날') + 1] + '일');
  await expect(page.locator('[data-gm-basis="done"]')).toHaveText('이번 주 기록 · 지난주와 비교: 연습 35분 · 3일');
  await expect(page.locator('[data-gm-basis="changes"]')).toHaveText(/^지난주와 비교 · /);
  await expect(page.locator('[data-gm-week-ai]')).toHaveText('주간 AI 코치는 아직 없어요. AI 코치는 월별·전체에서 쓸 수 있어요.');
  await expect(page.locator('[data-gm-flow]')).toHaveAttribute('href', '#/growth-flow?period=week');
  await page.locator('[data-gm-detail] > summary').click();
  await expect(page.locator('[data-gm-detail] [data-ws-section="growth"]')).toBeVisible();   // 주간 요약's 성장 card
  await page.locator('[data-gm-period="all"]').click();
  await expect(section(page, 'done').locator('h2')).toHaveText('지금까지 한 것');
  await expect(page.locator('[data-gm-basis="changes"]')).toHaveText(/^처음과 최근 비교 · /);
  await expect(page.locator('[data-gm-flow]')).toHaveAttribute('href', '#/growth-flow?period=all');
  // 전체 compares 처음·최근 (no period): the same song lines as 지난 흐름 › 전체 분석's 무엇이 달라졌나.
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  const allLines = await lines(page);
  await reload(page);
  await expect(page.locator('[data-gm-period="all"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-gm-flow]').click();
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  expect(await lines(page)).toEqual(allLines);
  // 지난 흐름 › 주간: no AI coach, said in one line.
  await page.locator('.growth-weekly-tab').click();
  await expect(page.locator('[data-flow-week-ai]')).toContainText('주간 AI 코치는 아직 없어요');
  await expect(page.locator('[data-monthly-ai], [data-overall-ai]')).toHaveCount(0);
});

test('연습 녹음 포함: off by default (결과 리포트 numbers, as pinned), on adds 연습실 · 트레이닝 takes, and is kept', async ({page}) => {
  await boot(page);
  const toggle = page.locator('[data-gm-practice]');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('[data-gm-practice-note]')).toHaveText('곡 녹음만 견줘요. 노래 연습실·트레이닝 연습 녹음은 빼요.');
  // 지표 자세히 (월별), switch off: exactly what 월별 분석 says for November in the pinned snapshot.
  const pinned = SNAPSHOT.monthly['2026-11'], from = pinned.indexOf('이달의 변화'), to = pinned.indexOf('AI 월간 종합 코치');
  expect(from).toBeGreaterThan(0);
  const detail = page.locator('[data-gm-detail] .gm-detail-body');
  await page.locator('[data-gm-detail] > summary').click();
  expect(await detail.evaluate(texts())).toEqual(pinned.slice(from, to));
  const offLines = await lines(page);
  await toggle.check();
  await expect(page.locator('[data-gm-practice-note]')).toContainText('노래 연습실·트레이닝 연습 녹음도 넣어 견줘요');
  // Home (s5) gets its 연습실 (er) and 트레이닝 (et) takes of November: this month's 음정 정확도 is not the pinned one.
  await page.locator('[data-gm-detail] > summary').click();
  const on = await page.locator('[data-gm-detail] .gm-detail-body').evaluate(texts());
  expect(on).not.toEqual(pinned.slice(from, to));
  expect(await page.evaluate(() => localStorage.getItem('vzip:growth-practice'))).toBe('1');
  await reload(page);
  await expect(page.locator('[data-gm-practice]')).toBeChecked();
  await page.locator('[data-gm-practice]').uncheck();
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  expect(await lines(page)).toEqual(offLines);
  await page.locator('[data-gm-detail] > summary').click();
  expect(await page.locator('[data-gm-detail] .gm-detail-body').evaluate(texts())).toEqual(pinned.slice(from, to));
  // 지표 자세히 (전체), switch off: the six cards of 지난 흐름 › 전체 분석, word for word.
  await page.locator('[data-gm-period="all"]').click();
  await page.locator('[data-gm-detail] > summary').click();
  const mine = await page.locator('[data-gm-detail] .growth-metrics').evaluate(texts());
  await page.locator('[data-gm-flow]').click();
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  expect(await page.locator('[data-overall-body] .growth-stats-grid').evaluate(texts())).toEqual(mine);
});

test('전체 · 곡별 ▾ narrows 달라진 것 and 지표 자세히 to one song, is kept, and is shared with 지난 흐름 › 월별', async ({page}) => {
  await boot(page);
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  await expect(page.locator('[data-gm-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-gm-scope="song"]').click();
  const choices = page.locator('.sheet [data-gm-song-state]');
  await expect(choices.first()).toBeVisible();
  await expect(page.locator('.sheet [data-mbs-song="s5"]')).toContainText('지난달 녹음과 견줄 수 있어요');
  await page.locator('.sheet [data-mbs-song="s5"]').click();
  await expect(page.locator('[data-gm-scope="song"]')).toHaveText('Home');
  await expect(page.locator('[data-gm-scope="song"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-growth-changes] [data-gc-song]')).toHaveCount(1);
  expect(await lines(page)).toEqual(['s5']);
  await expect(page.locator('[data-growth-changes] [data-gc-group="tasks"]')).toHaveCount(0);   // not per song
  await page.locator('[data-gm-detail] > summary').click();
  await expect(page.locator('[data-gm-detail] .growth-section h2')).toHaveText('이달의 변화 · Home');
  await reload(page);
  await expect(page.locator('[data-gm-scope="song"]')).toHaveText('Home');
  // The same choice in 지난 흐름 › 월별 분석 (claude/monthly-by-song).
  await page.locator('[data-gm-flow]').click();
  await expect(page.locator('[data-mbs-scope="song"]')).toHaveText('Home');
  await page.locator('[data-back]').click();
  await page.locator('[data-gm-scope="all"]').click();
  await expect(page.locator('[data-gm-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-growth-changes] [data-gc-song]')).toHaveCount(3);
  // A song without a take in the period: 전체 with a note, the choice kept.
  await page.evaluate(() => localStorage.setItem('vzip:monthly-growth-song', 's3'));
  await page.locator('[data-gm-period="week"]').click();
  await expect(page.locator('[data-gm-song-fallback]')).toHaveText('Memory 녹음이 이 기간에는 없어 전체를 보여 드려요.');
});

test('older addresses lead into the new tabs, and 뒤로 is what it was', async ({page}) => {
  await boot(page, {hash:''});
  for (const [from, to] of [['#/vocal-growth?mode=monthly', /#\/growth-flow\?period=month$/], ['#/weekly-summary?week=2026-11-02', /#\/growth-flow\?period=week&week=2026-11-02$/],
    ['#/weekly-summary', /#\/growth-flow\?period=week$/], ['#/growth', /#\/vocal-growth$/], ['#/vocal-training', /#\/growth-lab$/], ['#/vocal-growth/training', /#\/growth-lab$/],
    ['#/vocal-growth/analysis', /#\/vocal-analysis$/], ['#/vocal-growth?gc=s2', /#\/growth-flow\?period=all$/]]) {
    await page.goto('/#/home');
    await page.evaluate(h => { location.hash = h; }, from);
    await expect(page, from).toHaveURL(to);
    await page.goBack();                                              // replaced: 뒤로 does not bounce back into it
    await expect(page, from).toHaveURL(/#\/home$/);
  }
  await page.goto('/#/home'); await page.evaluate(() => { location.hash = '#/weekly-summary?week=2026-11-02'; });
  await expect(page.locator('[data-weekly-summary] [data-ws-range]')).toHaveText('2026년 11월 2일 – 8일');
  await page.goto('/#/home'); await page.evaluate(() => { location.hash = '#/vocal-growth?gc=s2'; });
  try { await expect(page.locator('[data-gc-song="s2"]').first()).toBeInViewport({timeout:15000}); }
  catch (e) { // say what the screen showed instead (CI artifacts cannot be read)
    const seen = await page.evaluate(() => ({hash:location.hash, songs:[...document.querySelectorAll('[data-gc-song]')].map(x => x.dataset.gcSong), top:scrollY, main:(document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 700)}));
    throw Error('gc line not in view: ' + JSON.stringify(seen) + ' · page errors: ' + JSON.stringify(page.__errors || []));
  }
  // #/lab-reports keeps its screen (리포트 보관함) and is listed in 연구소.
  await page.goto('/#/home'); await page.evaluate(() => { location.hash = '#/growth-lab'; });
  await page.locator('[data-lab-tool="reports"]').click();
  await expect(page.locator('#top h1')).toHaveText('리포트 보관함');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/growth-lab$/);
  // The old practice-time page is still there for anyone who kept its address.
  await page.goto('/#/home'); await page.evaluate(() => { location.hash = '#/practice-stats'; });
  await expect(page.locator('[data-pd="week"]')).toBeVisible();
  // Tabs replace the address; 이번 달 → 지난 흐름 → 뒤로 → 이번 달 → 뒤로 leaves 성장.
  await page.goto('/#/home'); await page.evaluate(() => { location.hash = '#/vocal-growth'; });
  await page.locator('.growth-top-tabs a').nth(1).click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await page.locator('.growth-top-tabs a').nth(0).click();
  await page.locator('[data-gm-flow]').click();
  await expect(page).toHaveURL(/#\/growth-flow\?period=/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
});

test('phone 390 × 844: one column, 44px targets, nothing wider than the screen', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-mobile', 'phone size');
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  for (const period of ['week', 'month', 'all']) {
    await page.locator('[data-gm-period="' + period + '"]').click();
    await expect(section(page, 'next')).toBeVisible();
    expect(await overflow(page), period).toEqual({wide:false, over:0});
    const col = await page.evaluate(() => [...document.querySelectorAll('[data-gm-section]')].map(e => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(col).size, period).toBe(1);
  }
  await page.locator('[data-gm-period="month"]').click();
  for (const sel of ['[data-gm-period]', '[data-gm-scope]', '.gm-switch', '.gm-next-actions > *', '[data-gm-flow]', '.growth-top-tabs a']) {
    for (const el of await page.locator(sel).all()) { const b = await el.boundingBox(); if (b && b.height) expect(b.height, sel).toBeGreaterThanOrEqual(44); }
  }
  if (SHOTS) await page.screenshot({path:path.join(SHOTS, 'growth-month-390x844.png'), fullPage:false});
  if (SHOTS) await page.screenshot({path:path.join(SHOTS, 'growth-month-390x844-full.png'), fullPage:true});
});

test('iPad 820 × 1180: 한 것 across, 달라진 것 left, 다음 연습 and 지난 흐름 right', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width:820, height:1180});
  await boot(page);
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  const box = await page.evaluate(() => Object.fromEntries(['done', 'changes', 'next', 'flow'].map(k => [k, document.querySelector('[data-gm-section="' + k + '"]').getBoundingClientRect().toJSON()])));
  expect(box.next.left).toBeGreaterThan(box.changes.right);
  expect(box.done.right - box.done.left).toBeGreaterThan(box.next.right - box.changes.left - 2);
  expect(box.flow.top).toBeGreaterThan(box.next.bottom);
  expect(await overflow(page)).toEqual({wide:false, over:0});
  if (SHOTS) await page.screenshot({path:path.join(SHOTS, 'growth-month-820x1180.png'), fullPage:false});
});
