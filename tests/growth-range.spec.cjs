// 전체 음역 흐름 (성장 2단계): the section of 결과 리포트 › 전체 and the month row of 월별 분석.
// Every value on the screen is compared with the model (app/growth-range-model.js, tested in Node by
// tests/growth-range.test.cjs) for the same fake recordings. Screenshots: RANGE_SHOTS=<dir> (2×).
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1', NOW = '2026-11-13T03:00:00.000Z';   // Friday 12:00 in Korea
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const NOTE = {C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11};
const midi = n => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return NOTE[m[1]] + (Number(m[2]) + 1) * 12; };
const kst = (date, time = '20:00') => Date.parse(date + 'T' + time + ':00+09:00');
/** A v2 analysis as the app saves it (app/vocal-analysis.js rangeOf): lowest/highest held note, main range, stable high. */
const v2 = (low, high, {main = [low, high], stable = high, conf = .95} = {}) => ({v:2, at:kst('2026-11-12'), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:14, within20:70, notes:40}, stability:{wobbleCents:10, notes:15},
  range:{low, high, lowCents:midi(low) * 100, highCents:midi(high) * 100, validHigh:{note:high, cents:midi(high) * 100}, stableHigh:{note:stable, cents:midi(stable) * 100},
    instantaneous:{note:'C8', cents:10800, t:3}, main:{low:main[0], high:main[1], lowCents:midi(main[0]) * 100, highCents:midi(main[1]) * 100, percentiles:[10, 90]}},
  breath:{phrases:5, medianPhrase:3.4}}, confidence:{pitchConfidence:conf, voiceOverMrDb:12}});
const v1 = () => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:30, notes:20}, range:{low:'C3', high:'A5', lowCents:4800, highCents:8100}}, confidence:{voiceOverMrDb:12}});
let seq = 0;
const rec = (date, analysis, extra = {}) => ({id:'m' + (++seq), name:'녹음 ' + seq, songId:'s1', song:'', recordedDate:date, dateSource:'metadata', created:kst(date), type:'audio/mp4', source:'practice', durationSeconds:120, ...(analysis ? {analysis} : {}), ...extra});
const lesson = {songId:'', source:'lesson', recordingCategory:'lesson'}, training = {songId:'', recordingCategory:'training'};
const check = {songId:'', origin:'voice-check', recordingCategory:'training', durationSeconds:30, voiceCheck:{v:1, protocol:'vc1', refNote:'A3', highNote:'E4'}};
const three = (ym, low, high, extra = {}) => ['02', '06', '10'].map(d => rec(ym + '-' + d, v2(low, high, {main:['C4', 'F4'], stable:'G4'}), extra));
/* Twelve months to 2026-11: a month with one recording, an empty month, a month whose only recording is unreliable,
 * a month with a lone C6, and every kind of recording in the last two months. */
const FULL = [
  ...three('2025-12', 'G3', 'G4'), rec('2026-01-15', v2('A3', 'G4', {main:['C4', 'E4'], stable:'F4'})),
  /* 2026-02: nothing */ ...three('2026-03', 'G3', 'A4', {songId:'s2'}),
  ...three('2026-04', 'G3', 'A4'), rec('2026-04-25', v2('F3', 'A4', {main:['B3', 'F4'], stable:'G4'})),
  rec('2026-05-09', v2('C3', 'C6', {conf:.3})),                                             // unreliable: May stays empty
  ...three('2026-06', 'G3', 'A#4'), rec('2026-07-04', v2('G3', 'A4')), rec('2026-07-18', v2('A3', 'A#4')),
  ...three('2026-08', 'G3', 'A#4'), rec('2026-08-27', v2('G3', 'C6', {main:['C4', 'G4'], stable:'A4'})),   // one recording alone at C6
  ...three('2026-09', 'G3', 'A4'), rec('2026-09-28', v1()),
  ...three('2026-10', 'F#3', 'A#4').slice(0, 2), rec('2026-10-08', v2('A3', 'E4', {main:['A3', 'D4'], stable:'E4'}), check), rec('2026-10-22', v2('A3', 'E4', {main:['A3', 'D4'], stable:'E4'}), check),
  rec('2026-10-28', v2('F3', 'B4', {main:['C4', 'G4'], stable:'A4'}), lesson),
  ...three('2026-11', 'F#3', 'B4', {songId:'s2'}), rec('2026-11-05', v2('A3', 'E4', {main:['A3', 'D4'], stable:'E4'}), check),
  rec('2026-11-07', v2('E3', 'A4', {main:['G3', 'E4'], stable:'G4'}), training), rec('2026-11-11', v2('F3', 'C5', {main:['C4', 'G4'], stable:'A4'}), lesson),
  rec('2026-11-12', v2('C3', 'E6'), {songId:'', source:'import'}),                          // belongs nowhere: never counted
  rec('2026-11-09', null)                                                                   // not analysed
];
/* Too few to compare: one recording in September, two in November. */
const FEW = [rec('2026-09-12', v2('G3', 'A4')), rec('2026-11-03', v2('G3', 'A4')), rec('2026-11-10', v2('A3', 'B4', {main:['C4', 'F4'], stable:'G4'}))];
const DB = {categories:[], assignments:[], comparisonReports:[], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], lessons:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:kst('2025-12-01')}, {id:'s2', title:'On My Own', created:kst('2026-03-01')}], deleted:{}};
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});
async function boot(page, media, {width, height} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  if (width) await page.setViewportSize({width, height});
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(DB)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, media);
  await page.evaluate(() => { location.hash = '#/vocal-growth'; });
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  await expect(page.locator('[data-range-section]')).toBeVisible();
}
/** The model the screen was drawn from, as the page builds it. */
const modelOf = (page, options) => page.evaluate(async o => JSON.parse(JSON.stringify(VzipGrowthRangeUI.model(await VZ.media.list(), o))), options || {});
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const inside = async (page, sel) => expect(await page.locator(sel).evaluateAll(els => { const box = document.querySelector('[data-range-section]').getBoundingClientRect();
  return els.filter(el => el.offsetParent !== null).filter(el => { const r = el.getBoundingClientRect(); return r.left < box.left - .5 || r.right > box.right + .5; }).length; }), sel + ' stays inside the section').toBe(0);
const shot = async (page, name) => { const dir = process.env.RANGE_SHOTS; if (!dir) return; fs.mkdirSync(dir, {recursive:true});
  // The section on its own (the fixed dock and record button are hidden for this picture only), then the whole page.
  const hide = await page.addStyleTag({content:'.v-nav,.vz-collection-record{visibility:hidden!important}'});
  await page.locator('[data-range-section]').screenshot({path:path.join(dir, name), scale:'device'});
  await hide.evaluate(el => el.remove());
  await page.screenshot({path:path.join(dir, name.replace('.png', '-page.png')), fullPage:true, scale:'device'}); };
const span = (a, b) => a.note === b.note ? a.note : a.note + ' ~ ' + b.note;

test.describe('phone 375', () => {
  test.use({viewport:{width:375, height:812}, deviceScaleFactor:2});
  test('전체: the stats, the chart, the plain-words line and the month list say what the model says', async ({page}) => {
    await boot(page, FULL);
    const m = await modelOf(page), section = page.locator('[data-range-section]');
    // What the data set is: 12 months, one empty, one with a lone note, the last two with every kind.
    expect(m.months.map(x => [x.month, x.n])).toEqual([['2025-12', 3], ['2026-01', 1], ['2026-02', 0], ['2026-03', 3], ['2026-04', 4], ['2026-05', 0], ['2026-06', 3], ['2026-07', 2], ['2026-08', 4], ['2026-09', 3], ['2026-10', 5], ['2026-11', 6]]);
    expect([m.all.low.note, m.all.high.note, m.all.n]).toEqual(['E3', 'C5', 34]);
    await expect(section.locator('h2')).toHaveText('전체 음역 흐름');
    await expect(section.locator('[data-range-all="observed"]')).toHaveText(span(m.all.low, m.all.high));
    await expect(section.locator('[data-range-all="main"]')).toHaveText(span(m.all.main.low, m.all.main.high));
    await expect(section.locator('[data-range-all="stable"]')).toHaveText(m.all.stable.note);
    await expect(section.locator('[data-range-period]')).toHaveText('2025.12.02 ~ 2026.11.11 · 녹음 34개 · 10개월');
    // Chips: every kind on, with its count.
    expect(await section.locator('[data-range-group]').evaluateAll(els => els.map(e => [e.dataset.rangeGroup, e.getAttribute('aria-pressed'), e.querySelector('b').textContent])))
      .toEqual(m.groups.map(g => [g.id, 'true', String(g.counted)]));
    expect(m.groups.map(g => g.counted)).toEqual([28, 3, 1, 2]);
    // Chart: one column per month of the model; the phone shows the last six.
    const cols = await section.locator('[data-range-col]').evaluateAll(els => els.map(e => ({month:e.dataset.rangeCol, n:Number(e.dataset.rangeN), high:e.dataset.rangeHigh || null, low:e.dataset.rangeLow || null,
      hi:e.querySelector('.range-hi')?.textContent || null, lo:e.querySelector('.range-lo')?.textContent || null, count:e.querySelector('.range-count').textContent, shown:e.offsetParent !== null,
      small:e.classList.contains('is-small'), empty:e.classList.contains('is-empty'), lone:[...e.querySelectorAll('[data-range-lone]')].map(x => x.dataset.rangeLone)})));
    expect(cols.map(c => c.month)).toEqual(m.shown.map(x => x.month));
    for (const [i, x] of m.shown.entries()) expect(cols[i], x.month).toMatchObject({n:x.n, high:x.high?.note || null, low:x.low?.note || null, hi:x.high?.note || null, lo:x.low?.note || null,
      count:x.n ? x.n + '개' : '없음', small:!!x.n && !x.enough, empty:!x.n, lone:[x.high?.lone, x.low?.lone].filter(Boolean).map(l => l.note)});
    expect(cols.filter(c => c.shown).map(c => c.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    // The outlier rule on the screen: August's lone C6 is a ring, the band stops at A#4. An empty month has no band.
    expect(cols.find(c => c.month === '2026-08')).toMatchObject({high:'A#4', lone:['C6']});
    await expect(section.locator('[data-range-col="2026-05"] .range-band')).toHaveCount(0);
    expect(cols.find(c => c.month === '2026-07')).toMatchObject({small:true, count:'2개'});
    // The band is drawn where the notes are: higher notes are higher on the screen, inside the plot.
    const tops = await section.locator('[data-range-col="2026-11"]').evaluate(el => { const r = s => el.querySelector(s).getBoundingClientRect(), t = el.querySelector('.range-track').getBoundingClientRect();
      return {band:[r('.range-band').top, r('.range-band').bottom], main:[r('.range-main').top, r('.range-main').bottom], track:[t.top, t.bottom], hi:r('.range-hi').top, lo:r('.range-lo').bottom}; });
    expect(tops.band[0]).toBeLessThan(tops.main[0] + .5); expect(tops.main[1]).toBeLessThan(tops.band[1] + .5);
    expect(tops.hi).toBeGreaterThanOrEqual(tops.track[0]); expect(tops.lo).toBeLessThanOrEqual(tops.track[1]);
    // Accessible: the chart is one image with the values in its label; the same values are in the list below.
    const label = await section.locator('[data-range-chart]').getAttribute('aria-label');
    expect(label).toContain('11월 ' + span(m.shown.at(-1).low, m.shown.at(-1).high) + ', 녹음 6개'); expect(label).toContain('5월 셀 수 있는 녹음 없음');
    // The plain-words line: September and November both have 3+ recordings.
    const line = await page.evaluate(c => VzipGrowthRange.changeText(c), m.change);
    expect(line).toBe('최근 3개월(9월 → 11월) 관측 최고음 A4 → C5 (+3반음) · 관측 최저음 G3 → E3 (−3반음)');
    await expect(section.locator('[data-range-change]')).toHaveText(line); await expect(section.locator('[data-range-change]')).toHaveAttribute('data-state', 'ok');
    await shot(page, 'phone-375-data.png');
    // 달별 값 보기: every month, newest first, in words.
    await section.locator('[data-range-months] summary').click();
    const rows = await section.locator('[data-range-row]').evaluateAll(els => els.map(e => [e.dataset.rangeRow, e.querySelector('[data-range-values]').textContent, e.querySelector('[data-range-sample]')?.textContent || '', e.querySelector('[data-range-left]')?.textContent || '']));
    const expected = await page.evaluate(months => months.slice().reverse().map(x => [x.month, VzipGrowthRange.valuesText(x) || '셀 수 있는 녹음이 없어요', VzipGrowthRange.sampleText(x), VzipGrowthRange.leftText(x.left)]), m.months);
    expect(rows).toEqual(expected);
    expect(rows[0]).toEqual(['2026-11', '관측 E3 ~ C5 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 A4', '녹음 6개 (곡 녹음 3 · 보이스 체크 1 · 트레이닝 1 · 레슨 1) · 1곡 · 목소리 6분', '뺀 녹음 1개: 분석 전 1']);
    expect(rows.find(r => r[0] === '2026-08')[1]).toBe('관측 G3 ~ A#4 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 A4 · 한 녹음에서만 나온 음 C6 따로 표시');
    expect(rows.find(r => r[0] === '2026-05')).toEqual(['2026-05', '셀 수 있는 녹음이 없어요', '', '뺀 녹음 1개: 신뢰도 낮음 1']);
    expect(rows.find(r => r[0] === '2026-09')[3]).toBe('뺀 녹음 1개: 이전 분석(v1) 1');
    // 무엇을 셌나요: the kinds with their counts, what was left out and what is never counted.
    await section.locator('[data-range-what] summary').click();
    await expect(section.locator('[data-range-counted] li')).toHaveText(['곡 녹음 28개', '보이스 체크 3개', '트레이닝 1개', '레슨 2개']);
    await expect(section.locator('[data-range-left-all] li')).toHaveText(['아직 분석하지 않은 녹음 1개', '측정 신뢰도가 낮은 녹음 (목소리가 짧거나 반주가 커요) 1개', '이전 분석(v1) 녹음 · 음역을 재는 방식이 달라요. 다시 분석하면 들어가요 1개']);
    await expect(section.locator('[data-range-excluded] li')).toHaveText(['곡·레슨·트레이닝·보이스 체크 어디에도 속하지 않는 파일 1개']);
    // No verdict words, and never the 10 ms peak (C8) or the uncounted file's E6.
    const text = await section.innerText();
    expect(text).not.toMatch(/성장|향상|확정|좋아졌|나빠졌|C8|E6/); expect(text).toContain('실력 판정이 아니에요');
    // The 음역 jump button brings the section into view.
    await page.locator('[data-growth-jump="range"]').click();
    await expect(section).toBeInViewport();
    await noOverflow(page); await inside(page, '[data-range-section] *');
    expect(page.__errors).toEqual([]);
    await shot(page, 'phone-375-data-lists-open.png');
  });

  test('chips: turning a kind off recounts the section; all off says so; nothing is stored', async ({page}) => {
    await boot(page, FULL);
    const section = () => page.locator('[data-range-section]');
    await section().locator('[data-range-what] summary').click();
    const lessonChip = () => section().locator('[data-range-group="lesson"]');
    await lessonChip().click();
    await expect(lessonChip()).toHaveAttribute('aria-pressed', 'false'); await expect(lessonChip()).toBeFocused();
    await expect(lessonChip()).toHaveAttribute('aria-label', '레슨 2개, 빼는 중');
    const m = await modelOf(page);
    expect(m.groups.find(g => g.id === 'lesson')).toMatchObject({on:false, counted:2});
    expect([m.all.n, m.all.high.note]).toEqual([32, 'B4']);                              // the lesson's C5 is gone
    await expect(section().locator('[data-range-all="observed"]')).toHaveText(span(m.all.low, m.all.high));
    await expect(section().locator('[data-range-col="2026-11"]')).toHaveAttribute('data-range-high', 'B4');
    await expect(section().locator('[data-range-col="2026-11"]')).toHaveAttribute('data-range-n', '5');
    await expect(section().locator('[data-range-what]')).toHaveAttribute('open', '');     // the open list stays open
    await expect(section().locator('[data-range-counted-group="lesson"]')).toHaveText('레슨 뺌 (2개)');
    await expect(section().locator('[data-range-change]')).toHaveText(await page.evaluate(c => VzipGrowthRange.changeText(c), m.change));
    // Songs only.
    for (const id of ['voice-check', 'training']) await section().locator('[data-range-group="' + id + '"]').click();
    const songs = await modelOf(page);
    expect(songs.all.n).toBe(28);
    await expect(section().locator('[data-range-period]')).toContainText('녹음 28개');
    await expect(section().locator('[data-range-col="2026-11"]')).toHaveAttribute('data-range-low', 'F#3');
    // Everything off: no chart, a plain note; back on with one tap.
    await section().locator('[data-range-group="song"]').click();
    await expect(section().locator('[data-range-empty="none"]')).toContainText('고른 종류가 없어요');
    await expect(section().locator('[data-range-chart]')).toHaveCount(0);
    await section().locator('[data-range-group="lesson"]').click();
    await expect(section().locator('[data-range-all="observed"]')).toHaveText('F3 ~ C5');
    await expect(section().locator('[data-range-period]')).toContainText('녹음 2개');
    // The choice is for this visit only: the records are untouched and a reload starts with every kind on.
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.length, KEY)).toBe(2);
    await page.reload();
    await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
    await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); location.hash = '#/home'; }, FULL);
    await page.evaluate(() => { location.hash = '#/vocal-growth'; });
    await expect(page.locator('[data-range-section] [data-range-group][aria-pressed="true"]')).toHaveCount(4);
    expect(page.__errors).toEqual([]);
  });

  test('too few recordings: values are shown as they are, the comparison says what is missing', async ({page}) => {
    await boot(page, FEW);
    const m = await modelOf(page), section = page.locator('[data-range-section]');
    expect(m.months.map(x => [x.month, x.n, x.enough])).toEqual([['2026-09', 1, false], ['2026-10', 0, false], ['2026-11', 2, false]]);
    await expect(section.locator('[data-range-change]')).toHaveAttribute('data-state', 'short');
    await expect(section.locator('[data-range-change]')).toHaveText('표본이 부족해요 · 9월 녹음 1개, 11월 녹음 2개 · 한 달에 3개부터 비교해요');
    await expect(section.locator('[data-range-all="observed"]')).toHaveText('G3 ~ B4');
    await expect(section.locator('[data-range-col].is-small')).toHaveCount(2); await expect(section.locator('[data-range-col].is-empty')).toHaveCount(1);
    await expect(section.locator('.range-legend')).toContainText('녹음 3개 미만');
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
    await shot(page, 'phone-375-few-samples.png');
  });

  test('empty: no recording to count — no numbers, the reason, and the same section', async ({page}) => {
    await boot(page, [rec('2026-11-02', null), rec('2026-11-03', v1())]);
    const section = page.locator('[data-range-section]');
    await expect(section.locator('[data-range-empty="empty"]')).toContainText('아직 음역을 셀 수 있는 녹음이 없어요');
    await expect(section.locator('[data-range-empty="empty"]')).toContainText('뺀 녹음 2개: 분석 전 1 · 이전 분석(v1) 1');
    await expect(section.locator('[data-range-chart], .range-stats, [data-range-change]')).toHaveCount(0);
    await expect(section.locator('[data-range-group]')).toHaveCount(4);
    // Nothing at all: the section is still there, with nothing invented.
    await boot(page, []);
    await expect(page.locator('[data-range-section] [data-range-empty="empty"]')).toBeVisible();
    await expect(page.locator('[data-range-section] [data-range-chart]')).toHaveCount(0);
    expect(await page.locator('[data-range-section]').innerText()).not.toMatch(/[A-G]#?\d/);
    expect(page.__errors).toEqual([]);
  });

  test('월별 분석: the chosen month shows its own row (every kind counted), an empty month says so', async ({page}) => {
    await boot(page, FULL);
    await page.locator('[data-range-group="lesson"]').click();                           // the chips of 전체 do not change the month row
    await page.locator('[data-growth-mode="monthly"]').click();
    const row = page.locator('[data-range-month]');
    await expect(row).toHaveAttribute('data-range-month', '2026-11');
    const m = await modelOf(page, {all:true});
    const nov = m.months.find(x => x.month === '2026-11');
    await expect(row.locator('h2')).toHaveText('이 달의 음역');
    await expect(row.locator('[data-range-values]')).toHaveText(await page.evaluate(x => VzipGrowthRange.valuesText(x), nov));
    await expect(row.locator('[data-range-values]')).toHaveText('관측 E3 ~ C5 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 A4');
    await expect(row.locator('[data-range-sample]')).toHaveText('녹음 6개 (곡 녹음 3 · 보이스 체크 1 · 트레이닝 1 · 레슨 1) · 1곡 · 목소리 6분');
    await page.locator('[data-growth-select]').selectOption('2026-05');
    await expect(row).toHaveAttribute('data-range-month', '2026-05');
    await expect(row.locator('[data-range-values]')).toHaveText('셀 수 있는 녹음이 없어요');
    await expect(row.locator('[data-range-left]')).toHaveText('뺀 녹음 1개: 신뢰도 낮음 1');
    await page.locator('[data-growth-select]').selectOption('2026-08');
    await expect(row.locator('[data-range-values]')).toContainText('한 녹음에서만 나온 음 C6 따로 표시');
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });
});

test.describe('phone 320', () => {
  test.use({viewport:{width:320, height:640}, deviceScaleFactor:2});
  test('320px: nothing runs off the screen, chips are 44px targets, six months fit', async ({page}) => {
    await boot(page, FULL);
    const section = page.locator('[data-range-section]');
    await noOverflow(page); await inside(page, '[data-range-section] *');
    expect(await section.locator('[data-range-group]').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 44))).toBe(true);
    expect(await section.locator('[data-range-col]').evaluateAll(els => els.filter(e => e.offsetParent !== null).length)).toBe(6);
    // The six columns share the whole plot (no empty half), and the first one on a phone carries the year.
    const plot = await section.locator('.range-cols').boundingBox(), last = await section.locator('[data-range-col="2026-11"]').boundingBox(), first = await section.locator('[data-range-col="2026-06"]').boundingBox();
    expect(Math.abs(first.x - plot.x)).toBeLessThanOrEqual(1); expect(Math.abs(last.x + last.width - plot.x - plot.width)).toBeLessThanOrEqual(1);
    await expect(section.locator('[data-range-col="2026-06"] .range-month small')).toHaveText('2026'); await expect(section.locator('[data-range-col="2026-06"] .range-month small')).toBeVisible();
    // Note labels of neighbouring months do not run into each other.
    expect(await section.locator('[data-range-col]').evaluateAll(els => { const shown = els.filter(e => e.offsetParent !== null).map(e => e.querySelector('.range-hi')).filter(Boolean).map(e => e.getBoundingClientRect());
      return shown.every((r, i) => !i || r.left >= shown[i - 1].right - .5 || r.bottom <= shown[i - 1].top || r.top >= shown[i - 1].bottom); })).toBe(true);
    for (const sel of ['[data-range-months] summary', '[data-range-what] summary']) { await section.locator(sel).click(); expect((await section.locator(sel).boundingBox()).height).toBeGreaterThanOrEqual(44); }
    await noOverflow(page); await inside(page, '[data-range-section] *');
    await page.locator('[data-growth-mode="monthly"]').click();
    await expect(page.locator('[data-range-month]')).toBeVisible();
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });
});

test.describe('tablet', () => {
  test.use({deviceScaleFactor:2});
  test('1024 and 768: twelve months on the chart, the section spans the column, no overflow', async ({page}, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
    for (const [width, height] of [[1024, 768], [768, 1024]]) {
      await boot(page, FULL, {width, height});
      const section = page.locator('[data-range-section]');
      expect(await section.locator('[data-range-col]').evaluateAll(els => els.filter(e => e.offsetParent !== null).map(e => e.dataset.rangeCol))).toEqual((await modelOf(page)).shown.map(x => x.month));
      expect(await section.locator('[data-range-col]').count()).toBe(12);
      const box = await section.boundingBox(), body = await page.locator('[data-overall-body]').boundingBox();
      expect(Math.abs(box.width - body.width)).toBeLessThanOrEqual(1);
      await expect(section.locator('[data-range-col="2025-12"] .range-month small')).toHaveText('2025');   // the year where it starts and at January
      await expect(section.locator('[data-range-col="2026-01"] .range-month small')).toHaveText('2026');
      await expect(section.locator('[data-range-col="2026-06"] .range-month small')).toBeHidden();          // the phone's year mark is not needed here
      await noOverflow(page); await inside(page, '[data-range-section] *');
      expect(page.__errors).toEqual([]);
      if (width === 1024) await shot(page, 'tablet-1024-data.png');
    }
  });
});
