// 성장 › 나 (app/growth-month.js) in the real app — the report of one period (큰 정리 3번) — with the invented data set of
// tests/growth-characterization.fixture.cjs (Friday 2026-11-13, Korea) plus a homework and a 레슨 지적 체크:
//   ⓐ 한 것 · ⓑ 달라진 것 (one line; 곡마다 자세히 folded: 전체 · 곡별, 연습 녹음 포함) · the period's report (주: 다음 연습 and
//   주간 요약 · 월: 월별 리포트 · 전체: 전체 리포트), the period switch (주 · 월 · 전체, kept on the device) with ‹ ›, the old
//   addresses (#/growth-flow, #/growth-changes, #/weekly-summary …) leading into 나 at their period, 뒤로, phone and iPad.
// The switch OFF must show 결과 리포트's numbers: the 월 report is compared with the pinned snapshot
// (tests/growth-characterization.snapshot.json).
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const {period, move, openFold, openReport} = require('./growth-me-helpers.cjs');
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

test('나 for 월 (the default): 단계 in one row, what was done, one line of change with 곡마다 자세히, then the month report', async ({page}) => {
  await boot(page);
  await expect(page.locator('.growth-top-tabs a')).toHaveText(['나', '곡', '기록']);
  await expect(page.locator('[data-gm-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 11월 이번 달');
  await expect(page.locator('[data-gm-move="1"]')).toBeDisabled();            // nothing after this month
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
  // 나 (새 디자인): 단계 is the first row of the list — Lv · 이름 · 다음 단계까지 · 기본기 n/8 — opening 단계, where the level
  // card and the eight 기본기 areas are. No card, no tiles here.
  await expect(page.locator('[data-gme-lv]')).toHaveCount(1);
  await expect(page.locator('[data-gme-lv]')).toHaveAttribute('href', '#/levels');
  const lvNow = await page.evaluate(() => { const x = VZ.levels.now(); return {level:x.level, name:x.name, toNext:x.toNext}; });
  await expect(page.locator('[data-gme-lv-text]')).toHaveText(new RegExp('^Lv ' + lvNow.level + ' · ' + lvNow.name + ' · ' + (lvNow.toNext == null ? '가장 높은 단계예요' : '다음 단계까지 ' + lvNow.toNext + '점') + ' · 기본기 [0-8]/8$'));
  await expect(page.locator('[data-gme-tile]')).toHaveCount(0);
  await expect(section(page, 'rows').locator('[data-gme-lv]')).toHaveCount(1);
  await page.locator('[data-gme-lv]').click();
  await expect(page).toHaveURL(/#\/levels$/);
  await expect(page.locator('[data-lv-level]')).toBeVisible();
  await expect(page.locator('.lv-tile')).toHaveCount(8);
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  // ONE line of what changed (지난달과 비교, same song) heads 곡마다 자세히, with the two takes one tap away; the row opens it here.
  await expect(page.locator('[data-gme-line]')).toHaveText(/^\S.* · \S/);
  await expect(page.locator('[data-gme-listen]')).toHaveAttribute('href', /^#\/growth-song\//);
  await expect(page.locator('[data-gm-changes-fold]')).not.toHaveAttribute('open', '');
  await page.locator('[data-gme-changes]').click();
  await expect(page.locator('[data-gm-changes-fold]')).toHaveAttribute('open', '');
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  // 달라진 것 자세히: last month's latest take vs this month's, same song, method and version.
  await expect(page.locator('[data-gm-basis="changes"]')).toHaveText('지난달과 비교 · 같은 곡을 같은 방법·같은 분석 버전으로 잰 녹음끼리');
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  expect(await lines(page)).toEqual(['s2', 's5', 's3']);
  await expect(page.locator('[data-growth-changes] [data-gc-song="s2"] .gc-basis')).toContainText('지난 기간 마지막 녹음과 이번 기간');
  await expect(page.locator('[data-growth-changes] .gc-head')).toHaveCount(0);       // the section has its own heading
  const s2 = page.locator('[data-growth-changes] [data-gc-song="s2"]');
  await expect(s2.locator('[data-gc-play]')).toHaveCount(2);                          // listen to both
  await expect(s2.locator('[data-listen-open]')).toHaveText('들어 보고 평가');
  await expect(s2.locator('[data-gc-between] summary')).toContainText('그 사이에 한 것');
  await expect(page.locator('[data-gm-detail]')).toHaveCount(0);            // switch off: the report below has the measures
  // The month report under it: 월별 리포트 as it was (이달의 변화 · 6가지 지표 · AI 월간 종합 · 다음 연습 · 지난 기록).
  const report = page.locator('[data-gm-report="month"]');
  await expect(report.locator('[data-month-section="results"] .growth-metric')).toHaveCount(6);
  await openReport(page);                                                   // the period's report is its own row
  await expect(report.locator('[data-monthly-ai]')).toBeVisible();
  await expect(report.locator('[data-month-section="practice"] h2').first()).toHaveText('다음 연습');
  await expect(report.locator('[data-month-section="practice"] [data-np-all]')).toHaveAttribute('href', '#/next-practice');
  await expect(page.locator('[data-gm-flow], [data-growth-select], .growth-page-header')).toHaveCount(0);
  // 다음 연습 of 나 itself (주: the month and 전체 reports carry their own): homework first, then the missed lesson point, 기본기, the measured ones and the plans; top three and 더 보기.
  await period(page, 'week');
  await expect(page.locator('[data-gm-basis="next"]')).toContainText('오늘 기준');
  const items = section(page, 'next').locator(':scope > .gm-next > .gm-next-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator('[data-gm-chip]').first()).toHaveText('숙제');
  await expect(items.nth(0)).toContainText('후렴 호흡 자리 표시하고 부르기');
  await expect(items.nth(0).locator('a.gm-act')).toHaveAttribute('href', '#/homework');
  await expect(items.nth(1).locator('[data-gm-chip]').first()).toHaveText('레슨 지적');
  await expect(items.nth(1)).toContainText('12–13마디 · 첫 음 미리 준비');
  await expect(items.nth(1).locator('a.gm-act')).toHaveAttribute('href', '#/song/s2');
  // 기본기: today's focus area, done in 오늘의 연습.
  await expect(items.nth(2).locator('[data-gm-chip]').first()).toHaveText('기본기');
  await expect(items.nth(2)).toContainText('기본기 · ');
  await expect(items.nth(2).locator('a.gm-act')).toHaveAttribute('href', '#/practice-set');
  await expect(items.nth(2).locator('a.gm-act')).toHaveText('오늘의 연습에서 하기');
  // 내 로드맵's focus from the recordings (one or two) comes as 기본기; then the measured ones (under 더 보기 here).
  await expect(section(page, 'next').locator('[data-gm-more] summary')).toHaveText(/^더 보기 \(\d+\)$/);
  await openFold(page, 'next');
  await section(page, 'next').locator('[data-gm-more] summary').click();
  const measured = section(page, 'next').locator('.gm-next-item').filter({has:page.locator('[data-gm-chip]:first-child', {hasText:'측정'})}).first();
  await expect(measured).toBeVisible();
  await expect(section(page, 'next').locator('[data-gm-more] [data-gm-chip="계획"]').first()).toBeVisible();
  // 목표에 담기 (a measured item): today's goal, the same one 전체 분석's 목표 담기 makes; pressed twice, still one.
  const add = measured.locator('[data-gm-goal]');
  await expect(add).toHaveText('목표에 담기');
  await add.click();
  await expect(measured.locator('[data-gm-goal]')).toHaveText('담았어요');
  await expect(measured.locator('[data-gm-goal]')).toBeDisabled();
  const goals = await page.evaluate(() => VZ.db.dailyGoals.filter(g => g.date === VZ.today() && g.sourceId === 'overall-growth').map(g => g.id));
  expect(goals).toHaveLength(1);
  expect(goals[0]).toMatch(/^overall-growth:2026-11-13:/);
  // 주 has no AI 종합 (the coach server takes a month or the whole record), said in one line.
  await expect(page.locator('[data-gm-week-ai]')).toContainText('주간 AI 종합은 아직 없어요');
  await expect(page.locator('[data-monthly-ai], [data-overall-ai]')).toHaveCount(0);
});

test('period switch 주 · 월 · 전체 and ‹ ›: each period shows its own report, the address says it, and it is kept', async ({page}) => {
  await boot(page);
  await expect(page.locator('[data-gm-period]')).toHaveText(['주', '월', '전체']);
  // 주: this week, then the week before with ‹ — 주간 요약 of that week, under 한 것 and 달라진 것.
  await period(page, 'week');
  await expect(page.locator('[data-gm-period="week"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#\/vocal-growth\?period=week$/);       // replaced, not added to the history
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 11월 9일 – 15일 이번 주');
  await expect(section(page, 'done').locator('h2')).toHaveText('이번 주에 한 것');
  // The same numbers as 주간 요약 of that week (pinned in the snapshot: 연습 시간 52분, 연습한 날 4).
  const week = SNAPSHOT.weekly['2026-11-09'];
  expect(week.slice(week.indexOf('연습 시간'), week.indexOf('연습 시간') + 2)).toEqual(['연습 시간', '52분']);
  await expect(tile(page, 'minutes')).toHaveText('52분');
  await expect(tile(page, 'days')).toHaveText(week[week.indexOf('연습한 날') + 1] + '일');
  await expect(page.locator('[data-gm-basis="done"]')).toHaveText('이번 주 기록 · 지난주와 비교: 연습 35분 · 3일');
  const weekly = page.locator('[data-gm-report="week"]');
  await expect(weekly).toHaveAttribute('data-week', '2026-11-09');
  await expect(weekly.locator('[data-ws-minutes]')).toHaveText('52분');
  await expect(weekly.locator('.ws-week, [data-ws-tab]')).toHaveCount(0);      // 나's switch and ‹ › are its controls
  await expect(page.locator('[data-gm-move="1"]')).toBeDisabled();
  await move(page, -1);
  await expect(page).toHaveURL(/#\/vocal-growth\?period=week&week=2026-11-02$/);
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 11월 2일 – 8일');
  await expect(section(page, 'done').locator('h2')).toHaveText('그 주에 한 것');
  await expect(page.locator('[data-gm-basis="done"]')).toHaveText(/^그 주 기록 · 지난주와 비교: /);
  await expect(weekly).toHaveAttribute('data-week', '2026-11-02');
  const before = SNAPSHOT.weekly['2026-11-02'];
  await expect(weekly.locator('[data-ws-minutes]')).toHaveText(before[before.indexOf('연습 시간') + 1]);
  await expect(page.locator('[data-gm-move="1"]')).toBeEnabled();
  // 곡마다 자세히 follows the period.
  await page.locator('[data-gme-changes]').click();
  await expect(page.locator('[data-gm-basis="changes"]')).toHaveText(/^지난주와 비교 · /);
  await move(page, 1);
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 11월 9일 – 15일 이번 주');
  // 월: November, then October with ‹ — 월별 리포트 of that month, the same numbers as pinned.
  await period(page, 'month');
  await expect(page).toHaveURL(/#\/vocal-growth\?period=month$/);
  await expect(page.locator('[data-gm-basis="changes"]')).toHaveText(/^지난달과 비교 · /);
  await move(page, -1);
  await expect(page).toHaveURL(/#\/vocal-growth\?period=month&month=2026-10$/);
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 10월');
  await expect(section(page, 'done').locator('h2')).toHaveText('그 달에 한 것');
  const pinned = SNAPSHOT.monthly['2026-10'], from = pinned.indexOf('이달의 변화'), to = pinned.indexOf('AI 월간 종합 코치');
  const results = page.locator('[data-gm-report="month"] [data-month-section="results"]');
  await openReport(page);
  await expect(results).toBeVisible();
  expect(await results.evaluate(texts())).toEqual(pinned.slice(from, to));
  // 전체: no arrows; 전체 리포트.
  await period(page, 'all');
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all$/);
  await expect(page.locator('[data-gm-move]')).toHaveCount(0);
  await expect(page.locator('[data-gm-label]')).toHaveText('지금까지 전체');
  await expect(section(page, 'done').locator('h2')).toHaveText('지금까지 한 것');
  await expect(page.locator('[data-gm-basis="changes"]')).toHaveText(/^처음과 최근 비교 · /);
  await expect(page.locator('[data-gm-report="all"] [data-overall-body] .growth-stats-grid .growth-stat')).toHaveCount(6);
  await expect(page.locator('[data-gm-report="all"] [data-overall-ai]')).toBeVisible();
  await expect(page.locator('[data-gm-week-ai]')).toHaveCount(0);
  // Kept on the device: a reload opens 전체 again.
  await reload(page);
  await expect(page.locator('[data-gm-period="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gm-report="all"] [data-overall-body]')).toBeVisible();
});

test('연습 녹음 포함: off by default (the report shows 결과 리포트 numbers, as pinned), on adds 연습실 · 트레이닝 takes, and is kept', async ({page}) => {
  await boot(page, {hash:'#/growth-changes'});   // the old 달라진 것 자세히 → 나 with 곡마다 자세히 open
  await expect(page).toHaveURL(/#\/vocal-growth\?period=month&changes=1$/);
  await expect(page.locator('[data-gm-changes-fold]')).toHaveAttribute('open', '');
  const toggle = page.locator('[data-gm-practice]');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('[data-gm-practice-note]')).toHaveText('곡 녹음만 견줘요. 노래 연습실·트레이닝 연습 녹음은 빼요.');
  // The month report, switch off: exactly what 월별 분석 says for November in the pinned snapshot; no 지표 자세히 twice.
  const pinned = SNAPSHOT.monthly['2026-11'], from = pinned.indexOf('이달의 변화'), to = pinned.indexOf('AI 월간 종합 코치');
  expect(from).toBeGreaterThan(0);
  const results = page.locator('[data-gm-report="month"] [data-month-section="results"]');
  await expect(results).toBeVisible();
  expect(await results.evaluate(texts())).toEqual(pinned.slice(from, to));
  await expect(page.locator('[data-gm-detail]')).toHaveCount(0);
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  const offLines = await lines(page);
  await toggle.check();
  await expect(page.locator('[data-gm-practice-note]')).toContainText('노래 연습실·트레이닝 연습 녹음도 넣어 견줘요');
  // Home (s5) gets its 연습실 (er) and 트레이닝 (et) takes of November: 지표 자세히 · 연습 녹음 포함 says the month with them;
  // the report under it stays 결과 리포트's.
  await page.locator('[data-gm-detail] > summary').click();
  const on = await page.locator('[data-gm-detail] .gm-detail-body').evaluate(texts());
  expect(on).not.toEqual(pinned.slice(from, to));
  expect(await results.evaluate(texts())).toEqual(pinned.slice(from, to));
  expect(await page.evaluate(() => localStorage.getItem('vzip:growth-practice'))).toBe('1');
  await reload(page);
  await expect(page.locator('[data-gm-practice]')).toBeChecked();
  await page.locator('[data-gm-practice]').uncheck();
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  expect(await lines(page)).toEqual(offLines);
  await expect(page.locator('[data-gm-detail]')).toHaveCount(0);
});

test('전체 · 곡별 ▾ opens the chosen song on its own screen, at this month for 월별', async ({page}) => {
  await boot(page, {hash:'#/vocal-growth?period=month&changes=1'});   // 나 › 곡마다 자세히
  await expect(page.locator('[data-growth-changes] [data-gc-song]').first()).toBeVisible();
  await expect(page.locator('[data-gm-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-gm-scope="song"]').click();
  const choices = page.locator('.sheet [data-gm-song-state]');
  await expect(choices.first()).toBeVisible();
  await expect(page.locator('.sheet [data-mbs-song="s5"]')).toContainText('지난달 녹음과 견줄 수 있어요');
  await page.locator('.sheet [data-mbs-song="s5"]').click();
  // 곡 하나 (큰 정리 2번): the song's own screen at this month's chip, with that month's line for the song.
  await expect(page).toHaveURL(/#\/growth-song\/s5\?month=2026-11$/);
  await expect(page.locator('[data-gsp-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-song-section="changes"] [data-growth-changes] [data-gc-song]')).toHaveCount(1);
  await expect(page.locator('[data-song-month-detail] .growth-section h2')).toHaveText('이달의 변화 · Home');
  // 뒤로: 나 at the month, 곡마다 자세히 open, every song again.
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth\?period=month&changes=1$/);
  await expect(page.locator('[data-gm-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-growth-changes] [data-gc-song]')).toHaveCount(3);
});

test('AI 종합 (월 · 전체) asks first and says what is sent: no request before 보내기, none after 취소', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { window.__calls = []; window.vzipCloudSignedIn = () => true; window.vzipCloudUserId = () => 'u'; window.vzipCloudSessionId = () => 's';
    window.vzipCloudCoach = async input => { window.__calls.push(input.mode + ':' + input.month); return {mode:input.mode, month:input.month, note:'요약: ' + input.mode + ' 결과예요.\n좋아진 점: 음정\n보완할 점: 호흡\n다음 연습: 롱톤'}; }; });
  const calls = () => page.evaluate(() => window.__calls.slice());
  const sheet = page.locator('.sheet');
  // 이 달 한마디's AI 종합 is the report's own button: it asks first too, and 취소 sends nothing.
  await expect(page.locator('[data-gm-report="month"] [data-monthly-ai-run]')).toBeAttached();
  await page.locator('[data-gm-ai]').click();
  await expect(sheet).toContainText('AI 월간 종합 받기');
  await expect(page.locator('[data-gm-fold="report"]')).toHaveAttribute('open', '');   // its card opens under it
  await sheet.locator('[data-close]').first().click();
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await calls()).toEqual([]);
  // 월: 취소 sends nothing.
  const month = page.locator('[data-gm-report="month"] [data-monthly-ai-run]');
  await month.click();
  await expect(sheet).toContainText('AI 월간 종합 받기');
  await expect(sheet).toContainText('2026년 11월 측정 요약 — 곡 녹음 14개, 분석 가능 11개');
  await expect(sheet).toContainText('저장된 AI 청취 코멘트');
  await expect(sheet).toContainText('원본 음원은 보내지 않으며');
  expect(await calls()).toEqual([]);
  await sheet.locator('[data-close]').first().click();
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await calls()).toEqual([]);
  // …보내기 sends it once; the saved result shows.
  await month.click();
  await sheet.locator('[data-ok]').click();
  await expect.poll(calls).toEqual(['monthly:2026-11']);
  await expect(page.locator('[data-gm-report="month"] [data-monthly-ai]')).toContainText('monthly 결과예요');
  // 전체: the same.
  await period(page, 'all');
  const all = page.locator('[data-gm-report="all"] [data-overall-ai-run]');
  await all.click();
  await expect(sheet).toContainText('AI 전체 종합 받기');
  await expect(sheet).toContainText('음역·최고음·고음·파사지오 값은 보내지 않아요');
  await expect(sheet).toContainText('기존 AI 청취 코멘트');
  await sheet.locator('[data-close]').first().click();
  await page.waitForTimeout(300);
  expect(await calls()).toEqual(['monthly:2026-11']);
  await all.click();
  await sheet.locator('[data-ok]').click();
  await expect.poll(calls).toEqual(['monthly:2026-11', 'overall:all']);
  await expect(page.locator('[data-gm-report="all"] [data-overall-ai]')).toContainText('overall 결과예요');
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
});

/** To 오늘 without a document load: WebKit reloads on goto() to the URL it is already on, and the in-page fixtures would be gone. */
const toHome = async page => { await page.evaluate(() => { if (location.hash !== '#/home') location.hash = '#/home'; }); await expect(page).toHaveURL(/#\/home$/); };
test('older addresses lead into the new tabs, and 뒤로 is what it was', async ({page}) => {
  await boot(page, {hash:''});
  // 큰 정리 3번: 지난 흐름 (#/growth-flow), 달라진 것 자세히 (#/growth-changes) and 주간 요약 are 나 at that period now; the
  // older addresses that led to them lead there in turn.
  for (const [from, to] of [['#/vocal-growth?mode=monthly', /#\/vocal-growth\?period=month$/], ['#/weekly-summary?week=2026-11-02', /#\/vocal-growth\?period=week&week=2026-11-02$/],
    ['#/weekly-summary', /#\/vocal-growth\?period=week$/], ['#/growth', /#\/vocal-growth$/], ['#/vocal-training', /#\/home$/], ['#/vocal-growth/training', /#\/home$/],   // practice is on 오늘 › 연습하기 (phase 4)
    ['#/growth-flow?period=week&week=2026-11-02', /#\/vocal-growth\?period=week&week=2026-11-02$/], ['#/growth-flow?period=month', /#\/vocal-growth\?period=month$/],
    ['#/growth-flow?period=month&month=2026-10', /#\/vocal-growth\?period=month&month=2026-10$/], ['#/growth-flow?period=all', /#\/vocal-growth\?period=all&changes=1$/],
    ['#/growth-flow', /#\/vocal-growth\?period=all&changes=1$/], ['#/growth-changes', /#\/vocal-growth\?period=\w+&changes=1$/],
    ['#/vocal-growth/analysis', /#\/vocal-analysis$/], ['#/vocal-growth?gc=s2', /#\/vocal-growth\?period=all(&gc=s2)?$/]]) {
    await toHome(page);
    await page.evaluate(h => { location.hash = h; }, from);
    await expect(page, from).toHaveURL(to);
    await page.goBack();                                              // replaced: 뒤로 does not bounce back into it
    await expect(page, from).toHaveURL(/#\/home$/);
  }
  // Each lands on its period: the week, the month, 전체.
  await toHome(page); await page.evaluate(() => { location.hash = '#/weekly-summary?week=2026-11-02'; });
  await expect(page.locator('[data-gm-period="week"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 11월 2일 – 8일');
  await expect(page.locator('[data-gm-report="week"]')).toHaveAttribute('data-week', '2026-11-02');
  await toHome(page); await page.evaluate(() => { location.hash = '#/growth-flow?period=month&month=2026-10'; });
  await expect(page.locator('[data-gm-label]')).toHaveText('2026년 10월');
  await expect(page.locator('[data-gm-report="month"] [data-month-section="results"]')).toBeVisible();
  await toHome(page); await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; });
  await expect(page.locator('[data-gm-period="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gm-report="all"] [data-overall-body]')).toBeVisible();
  await toHome(page); await page.evaluate(() => { location.hash = '#/vocal-growth?gc=s2'; });
  try { await expect(page.locator('[data-gc-song="s2"]').first()).toBeInViewport({timeout:15000}); }
  catch (e) { // say what the screen showed instead (CI artifacts cannot be read)
    const seen = await page.evaluate(() => ({hash:location.hash, songs:[...document.querySelectorAll('[data-gc-song]')].map(x => x.dataset.gcSong), top:scrollY, main:(document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 700)}));
    throw Error('gc line not in view: ' + JSON.stringify(seen) + ' · page errors: ' + JSON.stringify(page.__errors || []));
  }
  // #/lab-reports keeps its screen (리포트 보관함) and is listed in 연구소.
  await toHome(page); await page.evaluate(() => { location.hash = '#/growth-lab'; });
  await page.locator('[data-lab-tool="reports"]').click();
  await expect(page.locator('#top h1')).toHaveText('리포트 보관함');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/growth-lab$/);
  // The old practice-time page is 연습 시간 자세히 now: under 나 › 한 것, and the 연습량 tile opens it; 성장 lit, 뒤로 returns.
  await toHome(page); await page.evaluate(() => { location.hash = '#/vocal-growth'; });
  await openFold(page, 'done');
  await expect(page.locator('[data-gm-practice-stats]')).toHaveText('연습 시간 자세히');
  expect((await page.locator('[data-gm-practice-stats]').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('[data-gm-tile2="practice"]')).toHaveAttribute('href', '#/practice-stats');
  await page.locator('[data-gm-tile2="practice"]').click();
  await expect(page).toHaveURL(/#\/practice-stats$/);
  await expect(page.locator('#top h1')).toHaveText('연습 시간');
  await expect(page.locator('[data-pd="week"]')).toBeVisible();
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  // Tabs and periods replace the address; 나 → 주 → ‹ → 곡 → 나 → 뒤로 leaves 성장 in one step.
  await toHome(page); await page.evaluate(() => { location.hash = '#/vocal-growth'; });
  await period(page, 'week');
  await move(page, -1);
  await expect(page).toHaveURL(/#\/vocal-growth\?period=week&week=2026-11-02$/);
  await page.locator('.growth-top-tabs a').nth(1).click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await page.locator('.growth-top-tabs a').nth(0).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
});

test('phone 390 × 844: one column, 44px targets, nothing wider than the screen', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-mobile', 'phone size');
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await expect(section(page, 'word')).toBeVisible();
  await openReport(page);
  for (const kind of ['week', 'month', 'all']) {
    await period(page, kind);
    await expect(page.locator('[data-gm-report="' + kind + '"] > *').first()).toBeVisible();
    expect(await overflow(page), kind).toEqual({wide:false, over:0});
    const col = await page.evaluate(() => [...document.querySelectorAll('.gm > :is([data-gm-section], .gm-report-fold, .gm-period-panel)')].filter(e => e.getBoundingClientRect().width).map(e => Math.round(e.getBoundingClientRect().left)));
    expect(col.length, kind).toBeGreaterThan(4);
    expect(new Set(col).size, kind).toBe(1);
  }
  await period(page, 'month');
  for (const sel of ['[data-gm-period-open]', '[data-gm-period]', '[data-gm-move]', '[data-gm-suggest]', '[data-gm-ai]', '[data-gm-tile2]', '[data-gm-metric]', '.gm-row', '[data-gme-lv]', '[data-gme-listen]', '[data-gme-changes]', '.gm-next-actions > *', '.growth-top-tabs a', '[data-growth-archive]']) {
    for (const el of await page.locator(sel).all()) { const b = await el.boundingBox(); if (b && b.height) expect(b.height, sel).toBeGreaterThanOrEqual(44); }
  }
  if (SHOTS) await page.screenshot({path:path.join(SHOTS, 'growth-month-390x844.png'), fullPage:false});
  if (SHOTS) await page.screenshot({path:path.join(SHOTS, 'growth-month-390x844-full.png'), fullPage:true});
});

test('iPad 820 × 1180: 단계 as one row across the column, nothing wider than the screen', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width:820, height:1180});
  await boot(page);
  await expect(section(page, 'word')).toBeVisible();
  const box = await page.evaluate(() => ({lv:document.querySelector('[data-gme-lv]').getBoundingClientRect().toJSON(), tiles:document.querySelectorAll('[data-gme-tile]').length}));
  expect(box.tiles).toBe(0);
  expect(box.lv.height).toBeLessThan(80);
  expect(box.lv.height).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toEqual({wide:false, over:0});
  if (SHOTS) await page.screenshot({path:path.join(SHOTS, 'growth-month-820x1180.png'), fullPage:false});
});

test('나 (새 디자인): 보관함 in the header, tab pills, the period pill, 한마디, 연습량 · 목 상태, 지표 6가지 with its flow, 연습 구성, the rows', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-mobile', 'phone layout');
  await boot(page);
  // Header: 성장 with 보관함 (리포트 보관함) and the gear.
  await expect(page.locator('#top h1')).toHaveText('성장');
  await expect(page.locator('#top [data-growth-archive]')).toHaveAttribute('href', '#/lab-reports');
  await expect(page.locator('#top a[aria-label="설정"]')).toBeVisible();
  // Tabs: only the chosen one is a pill (no track behind them).
  const pills = await page.locator('.growth-top-tabs a').evaluateAll(els => els.map(a => getComputedStyle(a, '::before').backgroundColor + '|' + getComputedStyle(a, '::before').content));
  expect(pills[0]).toBe('rgb(239, 232, 252)|""');
  expect(pills.slice(1).every(x => x.endsWith('|none'))).toBe(true);
  expect(await page.locator('.growth-top-tabs').evaluate(n => getComputedStyle(n).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // The period pill on the right of the tabs opens 주 · 월 · 전체 and ‹ ›, and closes again.
  const pill = page.locator('[data-gm-period-open]');
  await expect(pill).toHaveText('이번 달 · 11월');
  await expect(pill.locator('svg')).toHaveCount(1);
  await expect(page.locator('[data-gm-period-panel]')).toBeHidden();
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-gm-period-panel] [data-gm-period]')).toHaveText(['주', '월', '전체']);
  await pill.click();
  await expect(page.locator('[data-gm-period-panel]')).toBeHidden();
  // 이 달 한마디: the page's only background gradient, a sentence, 측정값 기반 참고, 목표에 담기 (white pill) and AI 종합.
  const word = page.locator('[data-gm-section="word"]');
  await expect(word.locator('h2')).toHaveText('이 달 한마디');
  await expect(page.locator('[data-gm-word]')).toHaveText(/\S.*요\.$/);
  await expect(word).toContainText('측정값 기반 참고');
  expect(await word.evaluate(n => getComputedStyle(n).backgroundImage)).toMatch(/^linear-gradient/);
  const suggest = page.locator('[data-gm-suggest]');
  await expect(suggest).toContainText('목표에 담기');
  expect(await suggest.evaluate(n => getComputedStyle(n).backgroundColor)).toBe('rgb(255, 255, 255)');
  await expect(page.locator('[data-gm-ai]')).toHaveText('AI 종합');
  await suggest.click();
  await expect(page.locator('[data-gm-suggest]')).toBeDisabled();
  await expect(page.locator('[data-gm-suggest]')).toContainText('담았어요');
  expect(await page.evaluate(() => VZ.db.dailyGoals.filter(g => g.date === VZ.today() && g.sourceId === 'overall-growth').length)).toBe(1);
  // 연습량 (entered minutes a day, against last month) · 목 상태 (one dot a day of November; 보이스 체크 on 10–12, no rating yet).
  const prac = page.locator('[data-gm-tile2="practice"]');
  await expect(prac.locator('.gm-tile2-num')).toHaveText(/^\d+ 분\/일$/);
  await expect(prac.locator('.gm-tile2-foot')).toHaveText(/^(늘었어요↗ 지난달보다 \+\d+|줄었어요↘ 지난달보다 −\d+|비슷해요→ 지난달과 같아요)$/);
  await expect(prac.locator('polyline')).toHaveCount(1);
  const cond = page.locator('[data-gm-tile2="condition"]');
  await expect(cond).toHaveAttribute('href', '#/voice-check');
  await expect(cond.locator('.gm-dots i')).toHaveCount(30);
  await expect(cond.locator('[data-dot="later"]')).toHaveCount(17);
  await expect(cond.locator('[data-dot="checked"]')).toHaveCount(3);
  await expect(cond.locator('.gm-tile2-foot')).toHaveText('점수 없음기록 3일');
  // A rating given meanwhile shows without leaving (the record changed: the tiles are drawn again in place).
  await page.evaluate(() => VZ.change(db => { db.practices.find(p => p.id === 'voice-check:vc3').voiceCheck.selfRating = 4; }));
  await expect(cond.locator('.gm-tile2-num')).toHaveText('4.0 /5 평균');
  await expect(cond.locator('.gm-tile2-foot')).toHaveText('좋음기록 3일');
  await expect(cond.locator('[data-dot="4"]')).toHaveCount(1);
  // 지표 6가지: the month report's numbers; the chosen tile's flow with the month line, the glow and a few stars.
  const tiles = page.locator('[data-gm-metric]');
  await expect(tiles.locator('span')).toHaveText(['음정 정확도', '음정 안정성', '호흡 유지', '고음 안정성', '음역', '파사지오']);
  await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gm-report="month"] [data-growth-metric="intonation"] .growth-stat-number')).toBeAttached();
  const card = (await page.locator('[data-gm-report="month"] [data-growth-metric="intonation"] .growth-stat-number').textContent()).trim();
  expect((await tiles.first().locator('b').textContent()).replace(/\s*[↗↘→↕]$/, '').trim()).toBe(card);
  const flow = page.locator('[data-gm-mx-flow]');
  await expect(flow.locator('.gm-mx-name')).toHaveText('음정 정확도');
  await expect(flow.locator('.gm-mx-big')).toHaveText(card);
  await expect(flow.locator('[data-gm-mx-graph="intonation"] polyline')).toHaveCount(1);
  await expect(flow.locator('[data-gm-mx-divider]')).toHaveCount(1);
  await expect(flow.locator('svg text').filter({hasText:'11월'})).toHaveCount(1);
  await expect(flow.locator('[data-gm-mx-glow]')).toHaveCount(1);
  await expect(flow.locator('.gm-stars i')).toHaveCount(3);
  await expect(flow.locator('[data-gm-mx-stats]')).toHaveText(/^처음 .+평균 .+최고 .+녹음 \d+개$/);
  await tiles.nth(2).click();
  await expect(tiles.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(tiles.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-gm-mx-flow] .gm-mx-name')).toHaveText('호흡 유지');
  await expect(page.locator('[data-gm-mx-graph="phrase"]')).toHaveCount(1);
  await tiles.nth(5).click();
  await expect(page.locator('[data-gm-mx-flow]')).toContainText('파사지오는 참고로만 봐요');
  await expect(page.locator('[data-gm-mx-flow] svg')).toHaveCount(0);
  // 이 달 연습 구성: 곡 · 기본기 · 녹음, said as what each is.
  const mix = page.locator('[data-gm-section="mix"]');
  await expect(mix.locator('h2')).toHaveText('이 달 연습 구성');
  await expect(mix.locator('[data-gm-mix] .gm-mix-bar span')).toHaveText([/^곡 · \d+%$/, /^기본기 · \d+%$/, /^녹음 · \d+%$/]);
  await expect(mix.locator('[data-gm-mix-total]')).toHaveText(/^합계 /);
  await expect(mix).toContainText('녹음은 녹음한 길이예요');
  // The rows: 단계 · 다음 연습 · 주간 요약 · 곡마다 자세히 · 한 것, then this month's report as its own row.
  await expect(page.locator('.gm-rows .gm-row strong')).toHaveText(['단계', '다음 연습', '주간 요약', '곡마다 자세히', '이번 달에 한 것']);
  await expect(page.locator('[data-gm-fold="report"] > summary strong')).toHaveText('이 달 리포트');
  await expect(page.locator('[data-gm-fold="report"]')).not.toHaveAttribute('open', '');
  // 주간 요약 leads to last week's 주간 요약 (the week period, its report open).
  await page.locator('[data-gm-week-jump]').click();
  await expect(page).toHaveURL(/#\/vocal-growth\?period=week&week=2026-11-02$/);
  await expect(page.locator('[data-gm-period-open]')).toHaveText('11월 2일 주');
  await expect(page.locator('[data-gm-fold="report"] > summary strong')).toHaveText('주간 요약');
  await expect(page.locator('[data-gm-report="week"]')).toBeVisible();
  await expect(page.locator('[data-gm-report="week"]')).toHaveAttribute('data-week', '2026-11-02');
  await expect(page.locator('[data-gm-ai]')).toHaveCount(0);                 // no 주간 AI 종합 (said in the report row)
});

for (const width of [320, 390, 430]) test('나 at ' + width + 'px: nothing wider than the screen, every fold open', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-mobile', 'phone sizes');
  await page.setViewportSize({width, height:844});
  await boot(page);
  await expect(section(page, 'word')).toBeVisible();
  await page.locator('[data-gm-period-open]').click();
  for (const key of ['next', 'changes', 'done', 'report']) await openFold(page, key);
  await expect(page.locator('[data-gm-report="month"] [data-month-section="results"]')).toBeVisible();
  expect(await overflow(page)).toEqual({wide:false, over:0});
  for (const id of ['stability', 'phrase', 'high', 'range']) { await page.locator('[data-gm-metric="' + id + '"]').click(); expect(await overflow(page), id).toEqual({wide:false, over:0}); }
});

test('the stars by the latest point twinkle softly, and rest with reduced motion', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-mobile', 'phone layout');
  await boot(page);
  const stars = page.locator('[data-gm-mx-flow] .gm-stars');
  await expect(stars).toBeAttached();
  const anim = await stars.locator('i').evaluateAll(els => els.map(i => [getComputedStyle(i).animationName, getComputedStyle(i).animationDuration]));
  expect(anim.map(a => a[0])).toEqual(['gmTwinkle', 'gmTwinkle', 'gmTwinkle']);
  expect(new Set(anim.map(a => a[1])).size).toBe(3);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(stars).toBeHidden();
});
