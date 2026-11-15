// 같은 날 녹음 — 보컬 분석(보컬 연구소)의 녹음별 변화 그래프와 성장 리포트에서 한 곡을 같은 날 여러 번 부른 녹음을
// 어떻게 셀지 고른다: 모두(기본, 지금까지와 같음) · 하루 평균 · 신뢰도 높은 것 · 가장 좋은 것. 값은 모델
// (app/growth-metrics-model.js, tests/growth-same-day.test.cjs)이 낸다. Screenshots: SAME_DAY_SHOTS=<dir> (2×).
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const FIX = require('./growth-characterization.fixture.cjs');
const KEY = 'vocal-zip_mvp_v1', NOW = '2026-11-14T03:00:00.000Z';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const kst = (date, time) => Date.parse(date + 'T' + time + ':00+09:00');
const rec = (id, date, time, {wob, into = 20, conf = .95}) => ({id, name:'녹음 ' + id, songId:'s1', song:'', recordedDate:date, dateSource:'metadata', created:kst(date, time), type:'audio/mp4', source:'practice', durationSeconds:120,
  analysis:FIX.v2({into, wob, conf})});
/* One song: three takes on 10/01, one on 11/10, eight on 11/13 (the last of them unreliable).
 * 음정 안정성 (±cent, lower is better; the value is wob + 1):
 *   10/01  21 · 25 (most reliable) · 29      → 평균 25 · 신뢰도 25 · 가장 좋은 21
 *   11/10  17
 *   11/13  11 · 13 · 15 (most reliable) · 17 · 19 · 21 · 9 · [7 unreliable]  → 평균 15 · 신뢰도 15 · 가장 좋은 9 */
const MEDIA = [
  rec('a1', '2026-10-01', '09:00', {wob:20, conf:.9}), rec('a2', '2026-10-01', '10:00', {wob:24, conf:.96}), rec('a3', '2026-10-01', '11:00', {wob:28, conf:.85}),
  rec('b1', '2026-11-10', '20:00', {wob:16}),
  ...[[10, .85], [12, .86], [14, .99], [16, .88], [18, .9], [20, .91], [8, .87], [6, .3]].map(([wob, conf], i) => rec('c' + (i + 1), '2026-11-13', String(9 + i).padStart(2, '0') + ':00', {wob, conf}))
];
const DB = {categories:[], assignments:[], comparisonReports:[], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], lessons:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:kst('2026-09-01', '09:00')}], deleted:{}};
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});
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
  await openLab(page);
}
/** 보컬 연구소 with every recording of the song chosen (as 전체 녹음 › 선택 › 분석 does). */
async function openLab(page) {
  await page.evaluate(async rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); VZ.openAnalysisSelection(await VZ.media.list()); }, MEDIA);
  await expect(page.locator('.vl-trend .vl-plot-dates button').first()).toBeVisible();
}
const labels = page => page.locator('.vl-trend .vl-plot-dates button').allTextContents();
const arias = page => page.locator('.vl-trend .vl-plot-dates button').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
const choose = async (page, mode) => { await page.locator('[data-same-day]').selectOption(mode); await expect(page.locator('[data-same-day]')).toHaveValue(mode); };
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const shot = async (page, name) => { const dir = process.env.SAME_DAY_SHOTS; if (!dir) return; fs.mkdirSync(dir, {recursive:true});
  await page.locator('.vl-trend').scrollIntoViewIfNeeded(); await page.locator('.vl-trend').screenshot({path:path.join(dir, name), scale:'device'}); };

test.describe('phone 375', () => {
  test.use({viewport:{width:375, height:812}, deviceScaleFactor:2});
  test('모두 is the default and is what the screen always showed; each choice gives a day one point, with the count on the label', async ({page}) => {
    await boot(page);
    // 모두: twelve points, the day written once per take, the report counts recordings.
    await expect(page.locator('[data-same-day]')).toHaveValue('all');
    expect(await page.locator('[data-same-day] option').allTextContents()).toEqual(['모두', '하루 평균', '신뢰도 높은 것', '가장 좋은 것']);
    expect(await labels(page)).toEqual(['10.01', '10.01', '10.01', '11.10', '11.13', '11.13', '11.13', '11.13', '11.13', '11.13', '11.13', '11.13']);
    await expect(page.locator('[data-same-day-note]')).toHaveCount(0);
    await expect(page.locator('[data-growth-count]')).toHaveText('11개 중 처음·최근 비교');
    await expect(page.locator('.vl-trend [data-day]')).toHaveCount(0);
    expect((await page.locator('[data-same-day]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await shot(page, 'phone-375-all.png');
    // 하루 평균: three points; a day sung several times says how many; the value is the mean of the reliable takes.
    await choose(page, 'average');
    expect(await labels(page)).toEqual(['10.01 · 3개', '11.10', '11.13 · 8개']);
    expect(await arias(page)).toEqual(['10.01 · 3개 음정 안정성 ±25 cent · 그날 녹음 보기', '11.10 음정 안정성 ±17 cent 상세 보기', '11.13 · 8개 음정 안정성 ±15 cent · 그날 녹음 보기']);
    await expect(page.locator('.vl-trend .vl-plot circle.vl-dot')).toHaveCount(3);
    await expect(page.locator('[data-same-day-note]')).toContainText('하루 평균은 그날 신뢰도 높은 녹음만으로 내요');
    await expect(page.locator('[data-same-day-note]')).toContainText('결과 리포트·월별·주간 요약은 지금처럼 모든 녹음으로 계산해요');
    await expect(page.locator('[data-same-day]')).toBeFocused();
    // The values on the screen are the model's.
    const model = await page.evaluate(rows => { const G = VzipGrowthMetrics, takes = rows.map(m => ({id:m.id, a:m.analysis, date:m.recordedDate, created:m.created, ok:VZ.analysisReliable(m.analysis)}));
      return Object.fromEntries(['average', 'reliable', 'best'].map(mode => [mode, G.days(takes).map(d => G.dayValue(d, mode, {get:t => t.a.metrics.stability.wobbleCents, better:-1}).value)])); }, MEDIA);
    expect(model).toEqual({average:[25, 17, 15], reliable:[25, 17, 15], best:[21, 17, 9]});
    // 처음↔최근: days are counted, and the comparison says it is between day means.
    await expect(page.locator('[data-growth-count]')).toHaveText('3일 중 처음·최근 비교');
    await expect(page.locator('[data-growth-row="stability"] p')).toHaveText('±25 cent → ±15 cent');
    await expect(page.locator('[data-growth-row="stability"] small')).toHaveText('하루 평균끼리 비교 · 녹음 전체 값 (녹음 3개 → 7개)');
    await expect(page.locator('.vl-growth-intro')).toContainText('처음과 최근 날을 6가지 지표로 나눠 비교했어요 (같은 날 녹음: 하루 평균)');
    await shot(page, 'phone-375-average.png');
    // 신뢰도 높은 것: the take with the highest pitch confidence of each day.
    await choose(page, 'reliable');
    expect(await arias(page)).toEqual(['10.01 · 3개 음정 안정성 ±25 cent · 그날 녹음 보기', '11.10 음정 안정성 ±17 cent 상세 보기', '11.13 · 8개 음정 안정성 ±15 cent · 그날 녹음 보기']);
    expect(await page.locator('.vl-trend .vl-plot-dates button').evaluateAll(els => els.map(e => e.dataset.point))).toEqual(['a2', 'b1', 'c3']);
    await expect(page.locator('[data-same-day-note]')).toContainText('음높이 인식 신뢰도가 가장 높은 녹음 하나로 봐요');
    await expect(page.locator('[data-growth-count]')).toHaveText('3일 중 처음·최근 비교');
    await shot(page, 'phone-375-reliable.png');
    // 가장 좋은 것: the lowest wobble of each day (never the unreliable ±7), with the honesty note.
    await choose(page, 'best');
    expect(await arias(page)).toEqual(['10.01 · 3개 음정 안정성 ±21 cent · 그날 녹음 보기', '11.10 음정 안정성 ±17 cent 상세 보기', '11.13 · 8개 음정 안정성 ±9 cent · 그날 녹음 보기']);
    expect(await page.locator('.vl-trend .vl-plot-dates button').evaluateAll(els => els.map(e => e.dataset.point))).toEqual(['a1', 'b1', 'c7']);
    await expect(page.locator('[data-same-day-note] strong')).toHaveText('하루에 여러 번 부를수록 가장 좋은 값은 좋아지기 쉬워요. 날끼리 공평하게 보려면 하루 평균이 좋아요.');
    await shot(page, 'phone-375-best.png');
    await noOverflow(page);
    // Remembered on this device: the lab opens with the same choice after a reload; 모두 brings the old chart back.
    await page.reload();
    await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
    await openLab(page);
    await expect(page.locator('[data-same-day]')).toHaveValue('best');
    expect(await labels(page)).toEqual(['10.01 · 3개', '11.10', '11.13 · 8개']);
    await choose(page, 'all');
    expect((await labels(page)).length).toBe(12);
    await expect(page.locator('[data-growth-count]')).toHaveText('11개 중 처음·최근 비교');
    expect(page.__errors).toEqual([]);
  });

  test('a day sung several times opens that day\'s takes (which one was used, or that it is an average); a single take opens its own popup', async ({page}) => {
    await boot(page);
    await choose(page, 'best');
    await page.locator('.vl-trend .vl-plot-dates button', {hasText:'11.13 · 8개'}).click();
    const list = page.locator('[data-day-list]');
    await expect(list).toBeVisible();
    await expect(page.locator('.sheet h2')).toHaveText('11.13 녹음 8개');
    await expect(list.locator('.vl-day-head span')).toHaveText('음정 안정성 · 가장 좋은 것'); await expect(list.locator('[data-day-value]')).toHaveText('±9 cent');
    expect(await list.locator('[data-day-take]').evaluateAll(els => els.map(e => [e.dataset.dayTake, e.querySelector('b').textContent, e.querySelector('small').textContent, e.classList.contains('used')])))
      .toEqual([['c1', '±11 cent', '', false], ['c2', '±13 cent', '', false], ['c3', '±15 cent', '', false], ['c4', '±17 cent', '', false], ['c5', '±19 cent', '', false], ['c6', '±21 cent', '', false],
        ['c7', '±9 cent', '이 녹음의 값을 썼어요', true], ['c8', '±7 cent', '신뢰도 낮음 · 날 값에서 제외', false]]);
    expect(await list.locator('[data-day-take]').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 44))).toBe(true);
    // A take of the list opens the existing single-take popup.
    await list.locator('[data-day-take="c7"]').click();
    await expect(page.locator('.vl-observation-card')).toBeVisible();
    await expect(page.locator('.vl-observation-value')).toHaveText('±9 cent');
    await page.locator('[data-close-observe]').click();
    await expect(page.locator('.vl-observation-card')).toHaveCount(0);
    // An average: every reliable take is marked as part of it.
    await choose(page, 'average');
    await page.locator('.vl-trend .vl-plot-dates button', {hasText:'11.13 · 8개'}).click();
    await expect(page.locator('[data-day-list] .vl-day-head')).toContainText('음정 안정성 · 하루 평균'); await expect(page.locator('[data-day-list] .vl-day-head')).toContainText('신뢰도 높은 녹음 7개의 평균이에요.');
    await expect(page.locator('[data-day-list] [data-day-value]')).toHaveText('±15 cent');
    expect(await page.locator('[data-day-list] [data-day-take] small').allTextContents()).toEqual([...Array(7).fill('평균에 포함'), '신뢰도 낮음 · 날 값에서 제외']);
    await page.locator('.sheet [data-close]').click();
    await expect(page.locator('[data-day-list]')).toHaveCount(0);
    // A day with one take: straight to that take's popup, as before.
    await page.locator('.vl-trend .vl-plot-dates button', {hasText:/^11\.10$/}).click();
    await expect(page.locator('.vl-observation-card')).toBeVisible(); await expect(page.locator('[data-day-list]')).toHaveCount(0);
    await page.locator('[data-close-observe]').click();
    // 안정 최고음 (a note): the average of a day is the median note, and says so.
    await page.locator('[data-metric="stable"]').click();
    expect((await arias(page))[2]).toBe('11.13 · 8개 안정 최고음 F5 (중앙값) · 그날 녹음 보기');
    expect(page.__errors).toEqual([]);
  });
});

test.describe('phone 320', () => {
  test.use({viewport:{width:320, height:640}, deviceScaleFactor:2});
  test('320px: the choice, its note and the day list fit', async ({page}) => {
    await boot(page);
    for (const mode of ['best', 'average']) { await choose(page, mode); await noOverflow(page); }
    const box = await page.locator('.vl-sameday').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
    await page.locator('.vl-trend .vl-plot-dates button', {hasText:'10.01 · 3개'}).click();
    await expect(page.locator('[data-day-list]')).toBeVisible();
    expect(await page.locator('[data-day-take]').evaluateAll(els => els.every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }))).toBe(true);
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });
});

test.describe('tablet', () => {
  test('1024: the same choice and day labels', async ({page}, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
    await page.setViewportSize({width:1024, height:768});
    await boot(page);
    await choose(page, 'average');
    expect(await labels(page)).toEqual(['10.01 · 3개', '11.10', '11.13 · 8개']);
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });
});
