// 결과 리포트 › 전체: 월별 측정 흐름을 꺾은선으로 (값이 없는 달은 끊김), 파사지오는 여러 녹음에서 되풀이되는 구간만.
// Numbers are the model's (app/overall-growth-model.js trend, app/growth-metrics-model.js passaggioRecurring —
// tests/growth-passaggio.test.cjs). Screenshots: TREND_SHOTS=<dir> (2×).
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const FIX = require('./growth-characterization.fixture.cjs');
const KEY = 'vocal-zip_mvp_v1', NOW = '2026-11-14T03:00:00.000Z';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const kst = date => Date.parse(date + 'T20:00:00+09:00');
let seq = 0;
/** A take: 음정 정확도 = into + 3 cent; sustained-note wobble jumps at `zone` (MIDI; baseline ±6, the zone ±14). */
const rec = (songId, date, into, zone) => { const analysis = FIX.v2({into});
  analysis.metrics.pitchBands.rows = [[55, 4, .6, 1, 3, 6], [57, 4, .6, 1, 3, 6], [59, 5, .7, 1.2, 4, 6], [72, 4, .6, 1, 3, 6], [76, 4, .6, 1, 3, 6], ...zone.map(midi => [midi, 3, .8, 1.1, 3, 14])].sort((x, y) => x[0] - y[0]);
  const id = 'r' + (++seq); return {id, name:'녹음 ' + id, songId, song:'', recordedDate:date, dateSource:'metadata', created:kst(date), type:'audio/mp4', source:'practice', durationSeconds:120, analysis}; };
/* 음정 정확도, month means (each song counts once): 06 → (33 + 23) / 2 = 28 · 07 → 29 (one song) · 08 → nothing ·
 * 09 → (25 + 23 + 13) / 3 = 20.3 · 10 → 19.7 · 11 → (17 + 23) / 2 = 20.
 * 파사지오: Defying Gravity 8 takes all at E4–F4 (recurs) · On My Own 5 takes, a different place each time (scattered)
 * · Memory 2 takes with no such place (too few to say). All 15 together: 8 at E4–F4. */
const E = [64, 65];
const MEDIA = [
  rec('s1', '2026-06-03', 30, E), rec('s1', '2026-06-20', 30, E), rec('s1', '2026-07-08', 26, E), rec('s1', '2026-09-02', 22, E), rec('s1', '2026-09-21', 22, E), rec('s1', '2026-10-12', 20, E), rec('s1', '2026-11-03', 14, E), rec('s1', '2026-11-10', 14, E),
  rec('s2', '2026-06-11', 20, [60]), rec('s2', '2026-09-09', 20, [62]), rec('s2', '2026-10-06', 20, [67]), rec('s2', '2026-11-02', 20, [70]), rec('s2', '2026-11-09', 20, [74]),
  rec('s3', '2026-09-15', 10, []), rec('s3', '2026-10-20', 10, [])
];
const DB = {categories:[], assignments:[], comparisonReports:[], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], lessons:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:kst('2026-05-01')}, {id:'s2', title:'On My Own', created:kst('2026-05-01')}, {id:'s3', title:'Memory', created:kst('2026-05-01')}], deleted:{}};
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});
async function boot(page, hash = '#/vocal-growth', mark = '[data-overall-trend]') {
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
  await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, MEDIA);
  if (hash) { await page.evaluate(h => { location.hash = h; }, hash); await expect(page.locator(mark).first()).toBeVisible(); }
}
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const shot = async (page, sel, name) => { const dir = process.env.TREND_SHOTS; if (!dir) return; fs.mkdirSync(dir, {recursive:true});
  const hide = await page.addStyleTag({content:'.v-nav,.vz-collection-record{visibility:hidden!important}'});
  await page.locator(sel).first().screenshot({path:path.join(dir, name), scale:'device'}); await hide.evaluate(el => el.remove()); };
/** Where the chart draws: each point's dot centre, and the line's vertices mapped to the screen. */
const geometry = page => page.locator('[data-overall-line]').evaluate(el => {
  const svg = el.querySelector('.growth-line-svg').getBoundingClientRect();
  const dots = [...el.querySelectorAll('.growth-chart-point')].map(b => { const r = b.querySelector('.growth-line-dot').getBoundingClientRect(); return {month:b.dataset.overallMonth, x:r.left + r.width / 2, y:r.top + r.height / 2}; });
  const lines = [...el.querySelectorAll('.growth-line-svg polyline')].map(p => p.getAttribute('points').split(' ').map(s => { const [x, y] = s.split(',').map(Number); return {x:svg.left + x / 100 * svg.width, y:svg.top + y / 100 * svg.height}; }));
  return {dots, lines};
});

test.describe('phone 375', () => {
  test.use({viewport:{width:375, height:812}, deviceScaleFactor:2});
  test('월별 측정 흐름 is a line: one point a month, a gap where a month has no value, the same numbers and the same tap', async ({page}) => {
    await boot(page);
    const trend = page.locator('[data-overall-trend]');
    // The numbers are the model's monthly means, as before.
    const model = await page.evaluate(async () => VZ.growthModel(await VZ.media.list()).overall.metrics.find(m => m.id === 'intonation').trend.map(p => [p.month, Math.round(p.value * 10) / 10, p.songs]));
    expect(model).toEqual([['2026-06', 28, 2], ['2026-07', 29, 1], ['2026-09', 20.3, 3], ['2026-10', 19.7, 3], ['2026-11', 20, 2]]);
    // One point per month with a value (a button, as the bars were), and an empty place for August.
    expect(await trend.locator('.growth-chart-point').evaluateAll(els => els.map(e => [e.dataset.overallMonth, e.dataset.overallValue, e.dataset.overallCount, e.getAttribute('aria-label'), e.classList.contains('is-small')])))
      .toEqual([['2026-06', '±28 cent', '2', '2026-06 ±28 cent 2곡', false], ['2026-07', '±29 cent', '1', '2026-07 ±29 cent 1곡', true], ['2026-09', '±20.3 cent', '3', '2026-09 ±20.3 cent 3곡', false],
        ['2026-10', '±19.7 cent', '3', '2026-10 ±19.7 cent 3곡', false], ['2026-11', '±20 cent', '2', '2026-11 ±20 cent 2곡', false]]);
    expect(await trend.locator('[data-overall-line] > :not(svg)').evaluateAll(els => els.map(e => e.dataset.overallMonth || 'gap:' + e.dataset.overallGap))).toEqual(['2026-06', '2026-07', 'gap:2026-08', '2026-09', '2026-10', '2026-11']);
    await expect(trend.locator('[data-overall-gap="2026-08"]')).toHaveAttribute('aria-label', '2026-08 값 없음');
    // The line: two pieces (June–July, September–November) — nothing is drawn across the month without a value.
    const g = await geometry(page);
    expect(g.lines.map(l => l.length)).toEqual([2, 3]);
    const vertices = g.lines.flat();
    expect(vertices.length).toBe(g.dots.length);
    for (const [i, dot] of g.dots.entries()) { expect(Math.abs(dot.x - vertices[i].x), dot.month + ' x').toBeLessThanOrEqual(1.5); expect(Math.abs(dot.y - vertices[i].y), dot.month + ' y').toBeLessThanOrEqual(1.5); }
    // A higher value is higher on the chart; equal spacing by month, the gap keeping its place.
    const y = Object.fromEntries(g.dots.map(d => [d.month, d.y])), x = g.dots.map(d => d.x);
    expect(y['2026-07']).toBeLessThan(y['2026-06']); expect(y['2026-06']).toBeLessThan(y['2026-11']); expect(y['2026-11']).toBeLessThan(y['2026-10']);
    expect(Math.abs((x[2] - x[1]) - 2 * (x[1] - x[0]))).toBeLessThanOrEqual(1.5);
    // The good direction is said; the hollow point and the gap are explained; the latest value is still in the head.
    await expect(trend.locator('[data-overall-direction]')).toHaveText('낮을수록 좋아요');
    await expect(trend.locator('.growth-line-legend')).toContainText('속이 빈 점은 한 곡만으로 낸 달'); await expect(trend.locator('.growth-line-legend')).toContainText('값이 없는 달은 선을 잇지 않아요');
    await expect(trend.locator('.growth-chart-current strong')).toHaveText('±20 cent');
    // Tapping a point: that month's value and the number of songs, as the bars did.
    await trend.locator('[data-overall-month="2026-09"]').click();
    await expect(page.locator('.growth-chart-dialog')).toContainText('±20.3 cent'); await expect(page.locator('.growth-chart-dialog')).toContainText('분석된 곡 3곡의 월별 평균값이에요.');
    await page.locator('.sheet [data-close]').click();
    // 달별 값 보기: the same values as a table, the empty month included.
    await trend.locator('[data-overall-trend-table] summary').click();
    expect(await trend.locator('[data-overall-trend-table] tbody tr').evaluateAll(rows => rows.map(r => [...r.children].map(c => c.textContent))))
      .toEqual([['2026-06', '±28 cent', '2곡'], ['2026-07', '±29 cent', '1곡'], ['2026-08', '값 없음'], ['2026-09', '±20.3 cent', '3곡'], ['2026-10', '±19.7 cent', '3곡'], ['2026-11', '±20 cent', '2곡']]);
    expect((await trend.locator('[data-overall-trend-table] summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await trend.locator('[data-overall-trend-table] summary').click();
    // The other measure draws the same way.
    await page.locator('[data-overall-metric="stability"]').click();
    await expect(page.locator('[data-overall-trend] .growth-chart-point')).toHaveCount(5);
    await expect(page.locator('[data-overall-trend] .growth-line-svg polyline')).toHaveCount(2);
    await page.locator('[data-overall-metric="intonation"]').click();
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
    await shot(page, '[data-overall-trend]', 'phone-375-line.png');
  });

  test('파사지오: a zone is shown only when it recurs over a song\'s recordings; otherwise 판정 보류 with the counts', async ({page}) => {
    await boot(page);
    const card = page.locator('[data-growth-metric="passaggio"]');
    await expect(card.locator('.growth-stat-number')).toHaveText('참고용');
    await expect(card.locator('.growth-stat-sub').first()).toHaveText('여러 녹음에서 같은 음역대가 되풀이된 곡 1곡');
    await expect(card.locator('[data-passaggio-overall]')).toHaveText('전체 녹음 · 최근 15개 중 8개에서 E4~F4 근처 · 지속음 흔들림 ±14 cent, 평소 ±6 cent');
    await expect(card.locator('.growth-ref-note')).toHaveText('음정 데이터만으로 판별 불가, 선생님 판단 참고');
    await card.locator('summary').click();
    const rows = await card.locator('.growth-song-rows li').evaluateAll(els => els.map(e => [e.querySelector('strong').textContent, e.querySelector('.growth-state').textContent, e.querySelector('p').textContent]));
    expect(rows).toEqual([
      ['Defying Gravity', '참고', '최근 8개 중 8개에서 E4~F4 근처 · 지속음 흔들림 ±14 cent, 평소 ±6 cent'],
      ['On My Own', '판정 보류', '녹음마다 다르게 나와요 (최근 5개 중 가장 많이 겹친 곳도 1개)'],
      ['Memory', '판정 보류', '세부 측정이 있는 믿을 만한 녹음이 5개는 있어야 해요 (지금 2개)']]);
    // The screen says what the model says.
    const model = await page.evaluate(async () => { const o = VZ.growthModel(await VZ.media.list()).overall, G = VzipGrowthMetrics;
      return {all:G.passaggioRecurringText(o.metrics.find(m => m.id === 'passaggio').recurring), songs:o.reports.map(r => G.passaggioReportText(r.report.passaggio))}; });
    expect(model.all).toBe('최근 15개 중 8개에서 E4~F4 근처 · 지속음 흔들림 ±14 cent, 평소 ±6 cent');
    expect(model.songs).toEqual(rows.map(r => (r[1] === '판정 보류' ? '판정 보류 · ' : '') + r[2]));
    expect(await card.innerText()).not.toMatch(/좋아진|아쉬운|성장|향상/);
    await noOverflow(page);
    await shot(page, '[data-growth-metric="passaggio"]', 'phone-375-passaggio-recurring-and-hold.png');
    // 월별 분석: the month shown — one or two takes of a song in a month are too few, and it says so.
    await page.locator('[data-growth-mode="monthly"]').click();
    const month = page.locator('[data-growth-metric="passaggio"]');
    await month.locator('summary').click();
    await expect(month.locator('.growth-song-rows li p').first()).toHaveText('세부 측정이 있는 믿을 만한 녹음이 5개는 있어야 해요 (지금 2개)');
    expect(page.__errors).toEqual([]);
  });

  test('보컬 연구소: several recordings → what recurs; one recording → its own value, labelled 이 녹음에서만 본 참고값', async ({page}) => {
    await boot(page, '');
    // Every take of Defying Gravity chosen: the report line is the recurring zone.
    await page.evaluate(async () => { VZ.openAnalysisSelection((await VZ.media.list()).filter(m => m.songId === 's1')); });
    await expect(page.locator('[data-growth-row="passaggio"] p')).toHaveText('최근 8개 중 8개에서 E4~F4 근처 · 지속음 흔들림 ±14 cent, 평소 ±6 cent');
    await expect(page.locator('[data-growth-row="passaggio"] small')).toHaveText('음정 데이터만으로 판별 불가, 선생님 판단 참고');
    // On My Own: a different place every time.
    await page.evaluate(async () => { VZ.openAnalysisSelection((await VZ.media.list()).filter(m => m.songId === 's2')); });
    await expect(page.locator('[data-growth-row="passaggio"] p')).toHaveText('판정 보류 · 녹음마다 다르게 나와요 (최근 5개 중 가장 많이 겹친 곳도 1개)');
    await shot(page, '[data-growth-report]', 'phone-375-lab-passaggio-hold.png');
    // One recording on its own: the value of that recording, and that it is only that.
    await page.evaluate(async () => { VZ.openAnalysisSelection((await VZ.media.list()).filter(m => m.songId === 's2').slice(0, 1)); });
    await expect(page.locator('[data-single-passaggio] span')).toHaveText(/부근에서 지속음 흔들림이 커요 \(±14 cent, 평소 ±6 cent\)$/);
    await expect(page.locator('[data-single-passaggio] small')).toHaveText('이 녹음에서만 본 참고값 · 음정 데이터만으로 판별 불가, 선생님 판단 참고');
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });
});

test.describe('phone 320 and 430', () => {
  for (const width of [320, 430]) test(width + 'px: the line chart and the table fit', async ({page}) => {
    await page.setViewportSize({width, height:760});
    await boot(page);
    const trend = page.locator('[data-overall-trend]');
    await noOverflow(page);
    const box = await trend.boundingBox(), chart = await trend.locator('[data-overall-line]').boundingBox();
    expect(chart.x).toBeGreaterThanOrEqual(box.x - .5); expect(chart.x + chart.width).toBeLessThanOrEqual(box.x + box.width + .5);
    const g = await geometry(page);
    expect(g.dots.every(d => d.x > chart.x && d.x < chart.x + chart.width && d.y > chart.y && d.y < chart.y + chart.height)).toBe(true);
    await trend.locator('[data-overall-trend-table] summary').click();
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });
});

test.describe('tablet', () => {
  test('1024 and 768: the line chart spans the panel, points on the line', async ({page}, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
    for (const [width, height] of [[1024, 768], [768, 1024]]) {
      await page.setViewportSize({width, height});
      await boot(page);
      const g = await geometry(page), vertices = g.lines.flat();
      expect(g.lines.map(l => l.length)).toEqual([2, 3]);
      for (const [i, dot] of g.dots.entries()) { expect(Math.abs(dot.x - vertices[i].x)).toBeLessThanOrEqual(1.5); expect(Math.abs(dot.y - vertices[i].y)).toBeLessThanOrEqual(1.5); }
      await noOverflow(page);
      expect(page.__errors).toEqual([]);
    }
  });
});
