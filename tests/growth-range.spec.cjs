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
const v2 = (low, high, {main = [low, high], stable = high, conf = .95, db = 12} = {}) => ({v:2, at:kst('2026-11-12'), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:14, within20:70, notes:40}, stability:{wobbleCents:10, notes:15},
  range:{low, high, lowCents:midi(low) * 100, highCents:midi(high) * 100, validHigh:{note:high, cents:midi(high) * 100}, stableHigh:{note:stable, cents:midi(stable) * 100},
    instantaneous:{note:'C8', cents:10800, t:3}, main:{low:main[0], high:main[1], lowCents:midi(main[0]) * 100, highCents:midi(main[1]) * 100, percentiles:[10, 90]}},
  breath:{phrases:5, medianPhrase:3.4}}, confidence:{pitchConfidence:conf, voiceOverMrDb:db}});
const v1 = () => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:30, notes:20}, range:{low:'C3', high:'A5', lowCents:4800, highCents:8100}}, confidence:{voiceOverMrDb:12}});
let seq = 0;
const rec = (date, analysis, extra = {}) => ({id:'m' + (++seq), name:'녹음 ' + seq, songId:'s1', song:'', recordedDate:date, dateSource:'metadata', created:kst(date), type:'audio/mp4', source:'practice', durationSeconds:120, ...(analysis ? {analysis} : {}), ...extra});
const lesson = {songId:'', source:'lesson', recordingCategory:'lesson'}, training = {songId:'', recordingCategory:'training'};
const check = {songId:'', origin:'voice-check', recordingCategory:'training', durationSeconds:30, voiceCheck:{v:1, protocol:'vc1', refNote:'A3', highNote:'E4'}};
const three = (ym, low, high, extra = {}) => ['02', '06', '10'].map(d => rec(ym + '-' + d, v2(low, high, {main:['C4', 'F4'], stable:'G4'}), extra));
/* Twelve months to 2026-11: a month with one recording, an empty month, a month whose only recording is unreliable,
 * a month with a lone C6, a recording whose main range is an octave and a half under the usual one (July), one whose
 * highest note sits an octave above its own main range (September; the lessons' C3 is an octave below theirs), and every
 * kind of recording in the last two months. */
const FULL = [
  ...three('2025-12', 'G3', 'G4'), rec('2026-01-15', v2('A3', 'G4', {main:['C4', 'E4'], stable:'F4'})),
  /* 2026-02: nothing */ ...three('2026-03', 'G3', 'A4', {songId:'s2'}),
  ...three('2026-04', 'G3', 'A4'), rec('2026-04-25', v2('F3', 'A4', {main:['B3', 'F4'], stable:'G4'})),
  rec('2026-05-09', v2('C3', 'C6', {conf:.3})),                                             // unreliable: May stays empty
  ...three('2026-06', 'G3', 'A#4'), rec('2026-07-04', v2('G3', 'A4')), rec('2026-07-18', v2('A3', 'A#4')),
  rec('2026-07-11', v2('E2', 'E4', {main:['F2', 'C4'], stable:'D4'})),                       // main range far under the usual one: left out entirely
  ...three('2026-08', 'G3', 'A#4'), rec('2026-08-27', v2('G3', 'C6', {main:['C4', 'G4'], stable:'A4'})),   // one recording alone at C6
  ...three('2026-09', 'G3', 'A4'), rec('2026-09-28', v1()),
  rec('2026-09-20', v2('G3', 'G5', {main:['C4', 'F4'], stable:'G4'})),                       // G5: an octave above its own main range — that end only
  ...three('2026-10', 'F#3', 'A#4').slice(0, 2), rec('2026-10-08', v2('A3', 'E4', {main:['A3', 'D4'], stable:'E4'}), check), rec('2026-10-22', v2('A3', 'E4', {main:['A3', 'D4'], stable:'E4'}), check),
  rec('2026-10-28', v2('C3', 'B4', {main:['C4', 'G4'], stable:'A4'}), lesson),
  ...three('2026-11', 'F#3', 'B4', {songId:'s2'}), rec('2026-11-05', v2('A3', 'E4', {main:['A3', 'D4'], stable:'E4'}), check),
  rec('2026-11-07', v2('E3', 'A4', {main:['G3', 'E4'], stable:'G4'}), training), rec('2026-11-11', v2('C3', 'C5', {main:['C4', 'G4'], stable:'A4'}), lesson),
  rec('2026-11-04', v2('D#2', 'C6', {db:5})),                                               // sung over a loud MR: passes the verdict rule, not the range rule
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
  await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; });
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
    // What the data set is: 12 months, one empty, one with a take on the detector's ceiling, the last two with every kind.
    expect(m.months.map(x => [x.month, x.n])).toEqual([['2025-12', 3], ['2026-01', 1], ['2026-02', 0], ['2026-03', 3], ['2026-04', 4], ['2026-05', 0], ['2026-06', 3], ['2026-07', 2], ['2026-08', 4], ['2026-09', 4], ['2026-10', 5], ['2026-11', 6]]);
    expect([m.all.low.note, m.all.high.note, m.all.stable.note, m.all.n, m.all.high.k, m.all.low.k]).toEqual(['G3', 'A#4', 'G4', 35, 9, 9]);   // what a quarter of the recordings reach (9 of the 33 that kept that end)
    await expect(section.locator('h2')).toHaveText('전체 음역 흐름');
    // The lead says what "자주" means; the labels are 자주 닿은 최저음 · 최고음.
    await expect(section.locator('[data-range-lead]')).toHaveText('녹음에서 실제로 잡힌 음을 달마다 모았어요. ‘자주 닿은’ 음은 그 달 녹음 넷 중 하나 이상이 닿은 음이에요. 관측한 값이고 실력 판정이 아니에요.');
    await expect(section.locator('.range-stats span')).toHaveText(['자주 닿은 최저음 ~ 최고음', '주로 부른 음역', '안정 최고음']);
    await expect(section.locator('.range-legend')).toContainText('자주 닿은 음역');
    await expect(section.locator('[data-range-all="observed"]')).toHaveText(span(m.all.low, m.all.high));
    await expect(section.locator('[data-range-all="main"]')).toHaveText(span(m.all.main.low, m.all.main.high));
    await expect(section.locator('[data-range-all="stable"]')).toHaveText(m.all.stable.note);
    await expect(section.locator('[data-range-period]')).toHaveText('2025.12.02 ~ 2026.11.11 · 녹음 35개 · 10개월');
    // Chips: every kind on, with its count.
    expect(await section.locator('[data-range-group]').evaluateAll(els => els.map(e => [e.dataset.rangeGroup, e.getAttribute('aria-pressed'), e.querySelector('b').textContent])))
      .toEqual(m.groups.map(g => [g.id, 'true', String(g.counted)]));
    expect(m.groups.map(g => g.counted)).toEqual([29, 3, 1, 2]);
    // Chart: one column per month of the model; the phone shows the last six.
    const cols = await section.locator('[data-range-col]').evaluateAll(els => els.map(e => ({month:e.dataset.rangeCol, n:Number(e.dataset.rangeN), high:e.dataset.rangeHigh || null, low:e.dataset.rangeLow || null,
      hi:e.querySelector('.range-hi')?.textContent || null, lo:e.querySelector('.range-lo')?.textContent || null, count:e.querySelector('.range-count').textContent, shown:e.offsetParent !== null,
      small:e.classList.contains('is-small'), empty:e.classList.contains('is-empty')})));
    expect(cols.map(c => c.month)).toEqual(m.shown.map(x => x.month));
    for (const [i, x] of m.shown.entries()) expect(cols[i], x.month).toMatchObject({n:x.n, high:x.high?.note || null, low:x.low?.note || null, hi:x.high?.note || null, lo:x.low?.note || null,
      count:x.n ? x.n + '개' : '없음', small:!!x.n && !x.enough, empty:!x.n});
    expect(cols.filter(c => c.shown).map(c => c.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    // August's take at C6 (the detector's ceiling) does not move the band: it stops at A#4, and nothing marks C6. An empty month has no band.
    expect(cols.find(c => c.month === '2026-08')).toMatchObject({high:'A#4', low:'G3'});
    await expect(section.locator('[data-range-lone], .range-lone')).toHaveCount(0);
    // What the numbers were made from.
    await expect(section.locator('[data-range-used]')).toHaveText('신뢰도 높은 녹음 35개로 계산했어요 (전체 40개 중)');
    expect(m.used).toEqual({counted:35, total:40});
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
    expect(line).toBe('최근 3개월(9월 → 11월) 자주 닿은 최고음 A4 → B4 (+2반음) · 자주 닿은 최저음 G3 → F#3 (−1반음)');
    await expect(section.locator('[data-range-change]')).toHaveText(line); await expect(section.locator('[data-range-change]')).toHaveAttribute('data-state', 'ok');
    await shot(page, 'phone-375-data.png');
    // 달별 값 보기: every month, newest first, in words.
    await section.locator('[data-range-months] summary').click();
    const rows = await section.locator('[data-range-row]').evaluateAll(els => els.map(e => [e.dataset.rangeRow, e.querySelector('[data-range-values]').textContent, e.querySelector('[data-range-sample]')?.textContent || '', e.querySelector('[data-range-left]')?.textContent || '', e.querySelector('[data-range-dropped-month]')?.textContent || '', e.querySelector('[data-range-octave-month]')?.textContent || '']));
    const expected = await page.evaluate(months => months.slice().reverse().map(x => [x.month, VzipGrowthRange.valuesText(x) || '셀 수 있는 녹음이 없어요', VzipGrowthRange.sampleText(x), VzipGrowthRange.leftText(x.left), VzipGrowthRange.droppedText(x.dropped), VzipGrowthRange.octaveText(x.octave)]), m.months);
    expect(rows).toEqual(expected);
    expect(rows[0]).toEqual(['2026-11', '자주 닿은 음 F#3 ~ B4 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 G4', '녹음 6개 (곡 녹음 3 · 보이스 체크 1 · 트레이닝 1 · 레슨 1) · 1곡 · 목소리 6분 · 최고음 3개 · 최저음 3개 이상의 녹음이 닿은 음', '뺀 녹음 2개: 분석 전 1 · 반주 구분 약함 1', '',
      '한 옥타브쯤 떨어져 잠깐 잡힌 음이라 뺀 끝: 최저음 1']);   // the lesson's C3, an octave under its own main range
    expect(rows.find(r => r[0] === '2026-08').slice(1)).toEqual(['자주 닿은 음 G3 ~ A#4 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 G4', '녹음 4개 (곡 녹음 4) · 1곡 · 목소리 4분 · 최고음 3개 · 최저음 3개 이상의 녹음이 닿은 음', '', '검출 한계에 걸려 뺀 끝: 최고음 1', '']);
    expect(rows.find(r => r[0] === '2026-05')).toEqual(['2026-05', '셀 수 있는 녹음이 없어요', '', '뺀 녹음 1개: 신뢰도 낮음 1', '', '']);
    // July: the recording whose main range is far under the usual one is left out whole; September: the G5 an octave above — that end only.
    expect(rows.find(r => r[0] === '2026-07').slice(1)).toEqual(['자주 닿은 음 G3 ~ A#4 · 주로 부른 음역 G#3 ~ A#4 · 안정 최고음 A#4', '녹음 2개 (곡 녹음 2) · 1곡 · 목소리 2분 · 표본 적음', '뺀 녹음 1개: 평소와 다른 음역 1', '', '']);
    expect(rows.find(r => r[0] === '2026-09').slice(1)).toEqual(['자주 닿은 음 G3 ~ A4 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 G4', '녹음 4개 (곡 녹음 4) · 1곡 · 목소리 4분 · 최고음 3개 · 최저음 3개 이상의 녹음이 닿은 음', '뺀 녹음 1개: 이전 분석(v1) 1', '', '한 옥타브쯤 떨어져 잠깐 잡힌 음이라 뺀 끝: 최고음 1']);
    // 무엇을 셌나요: the kinds with their counts, what was left out and what is never counted.
    await section.locator('[data-range-what] summary').click();
    await expect(section.locator('[data-range-counted] li')).toHaveText(['곡 녹음 29개', '보이스 체크 3개', '트레이닝 1개', '레슨 2개']);
    await expect(section.locator('[data-range-left-all] li')).toHaveText(['아직 분석하지 않은 녹음 1개', '측정 신뢰도가 낮은 녹음 (목소리가 짧거나 반주가 커요) 1개', '이전 분석(v1) 녹음 · 음역을 재는 방식이 달라요. 다시 분석하면 들어가요 1개',
      '반주와 목소리 구분이 약한 녹음 (목소리가 반주보다 10dB 이상 크지 않아요) 1개', '주로 부른 음역이 평소와 크게 다른 녹음 — 다른 목소리이거나 옥타브가 통째로 잘못 잡혔을 수 있어요 1개']);
    await expect(section.locator('[data-range-octave] li')).toHaveText(['한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최저음만 뺌 2개', '한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최고음만 뺌 1개']);
    await expect(section.locator('[data-range-dropped] li')).toHaveText(['최고음이 검출 한계(C6 이상)에 걸린 녹음 · 최고음과 안정 최고음만 뺌 1개']);
    await expect(section.locator('.range-method')).toContainText('75~1100Hz'); await expect(section.locator('.range-method')).toContainText('적어도 K개가 닿은');
    for (const words of ['그 달 녹음 넷 중 하나 이상이 닿은 음을 써요', '주로 부른 음역보다 6반음 넘게 벗어난 끝', '평소(C4 ~ F4, 고른 종류 녹음들의 가운데 값)보다 9반음 넘게', '녹음이 20개보다 적으면', '그 끝이 남은 녹음의 25%']) await expect(section.locator('.range-method')).toContainText(words);
    // 진단 파일: numbers only — one row per recording of the four kinds, nothing that names a recording.
    const save = section.locator('[data-range-diagnosis]');
    expect((await save.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
    expect(download.suggestedFilename()).toBe('vocalzip-range-diagnosis.json');
    const raw = fs.readFileSync(await download.path(), 'utf8'), diag = JSON.parse(raw);
    expect([diag.kind, diag.version, diag.rows.length, diag.counts.counted, diag.counts.reasons, diag.detector.minHz, diag.detector.maxHz, diag.generatedMonth]).toEqual(['vocalzip-range-diagnosis', 2, 40, 35, {'no-analysis':1, unreliable:1, v1:1, 'weak-separation':1, 'unusual-range':1}, 75, 1100, '2026-11']);
    // Version 2: the new rule constants, and per row whether an end was octave-like and whether the recording was unusual.
    expect(diag.rules).toMatchObject({share:.25, octaveGapSemitones:6, unusualSemitones:9, unusualMinRecordings:20, usualMainLowCents:6000, usualMainHighCents:6500});
    expect([diag.counts.octaveLow, diag.counts.octaveHigh, diag.counts.octaveStable]).toEqual([2, 1, 0]);
    expect(diag.rows.filter(r => r.unusual).map(r => [r.month, r.counted, r.reason, r.mainLowCents, r.mainHighCents])).toEqual([['2026-07', false, 'unusual-range', 4100, 6000]]);
    expect(diag.rows.filter(r => r.octaveHigh).map(r => [r.month, r.counted, r.highCents, r.mainHighCents, r.octaveLow])).toEqual([['2026-09', true, 7900, 6500, false]]);
    expect(diag.counts.counted).toBe(m.used.counted);                                    // the file and the screen count the same recordings
    expect(diag.rows.find(r => r.reason === 'weak-separation')).toMatchObject({month:'2026-11', group:'song', voiceOverMrDb:5, lowCents:3900, highCents:8400, counted:false});
    expect(raw).not.toMatch(/녹음 \d|Defying|On My Own|"m\d+"|\d{4}-\d{2}-\d{2}|songId|"id"|"name"/);
    await expect(page.locator('.toast, [role="status"]').filter({hasText:'진단 파일을 저장했어요'}).first()).toBeVisible();
    await expect(section.locator('[data-range-excluded] li')).toHaveText(['곡·레슨·트레이닝·보이스 체크 어디에도 속하지 않는 파일 1개']);
    // No verdict words, and never the 10 ms peak (C8), the uncounted file's E6, the octave-away G5 and C3 or the unusual recording's E2.
    const text = await section.innerText();
    expect(text).not.toMatch(/성장|향상|확정|좋아졌|나빠졌|C8|E6|G5|C3|E2|F2|관측 최/); expect(text).toContain('실력 판정이 아니에요');
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
    expect([m.all.n, m.all.octave]).toEqual([33, {low:0, high:1, stable:0}]);             // the two lesson recordings and their octave-low ends are gone
    await expect(section().locator('[data-range-all="observed"]')).toHaveText(span(m.all.low, m.all.high));
    await expect(section().locator('[data-range-col="2026-11"]')).toHaveAttribute('data-range-high', 'B4');
    await expect(section().locator('[data-range-col="2026-11"]')).toHaveAttribute('data-range-n', '5');
    await expect(section().locator('[data-range-col="2026-10"]')).toHaveAttribute('data-range-high', 'E4');   // October without the lesson's B4: A#4 is no longer reached by three
    await expect(section().locator('[data-range-octave] li')).toHaveText(['한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최고음만 뺌 1개']);
    await expect(section().locator('[data-range-what]')).toHaveAttribute('open', '');     // the open list stays open
    await expect(section().locator('[data-range-counted-group="lesson"]')).toHaveText('레슨 뺌 (2개)');
    await expect(section().locator('[data-range-change]')).toHaveText(await page.evaluate(c => VzipGrowthRange.changeText(c), m.change));
    // Songs only.
    for (const id of ['voice-check', 'training']) await section().locator('[data-range-group="' + id + '"]').click();
    const songs = await modelOf(page);
    expect(songs.all.n).toBe(29);
    await expect(section().locator('[data-range-period]')).toContainText('녹음 29개');
    await expect(section().locator('[data-range-col="2026-11"]')).toHaveAttribute('data-range-low', 'F#3');
    // Everything off: no chart, a plain note; back on with one tap.
    await section().locator('[data-range-group="song"]').click();
    await expect(section().locator('[data-range-empty="none"]')).toContainText('고른 종류가 없어요');
    await expect(section().locator('[data-range-chart]')).toHaveCount(0);
    await section().locator('[data-range-group="lesson"]').click();
    // Lessons only: both lowest notes were an octave under their own main range, so there is a highest note and no lowest.
    await expect(section().locator('[data-range-all="observed"]')).toHaveText('C5');
    await expect(section().locator('.range-stats span').first()).toHaveText('자주 닿은 최고음');
    await expect(section().locator('[data-range-period]')).toContainText('녹음 2개');
    // A kind that is off shows what it would add: the songs without the one far from the usual range.
    await expect(section().locator('[data-range-group="song"] b')).toHaveText('29');
    // The choice is for this visit only: the records are untouched and a reload starts with every kind on.
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.length, KEY)).toBe(2);
    await page.reload();
    await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
    await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); location.hash = '#/home'; }, FULL);
    await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; });
    await expect(page.locator('[data-range-section] [data-range-group][aria-pressed="true"]')).toHaveCount(4);
    expect(page.__errors).toEqual([]);
  });

  test('a real-like library (half of the clean recordings carry an octave-like end): the chart shows about G3 ~ C5…D5 and says what it left out', async ({page}) => {
    const REAL = require('./growth-range-reallike.fixture.cjs');
    await boot(page, REAL.MEDIA);
    const m = await modelOf(page), section = page.locator('[data-range-section]');
    expect(m.months.map(x => [x.month, x.n, x.low.note, x.high.note, x.stable.note])).toEqual([['2026-09', 133, 'G3', 'C5', 'B4'], ['2026-10', 133, 'G3', 'C#5', 'C5'], ['2026-11', 133, 'G3', 'D5', 'C#5']]);
    await expect(section.locator('[data-range-all="observed"]')).toHaveText('G3 ~ D5');
    await expect(section.locator('[data-range-all="main"]')).toHaveText('C4 ~ A#4');
    await expect(section.locator('[data-range-all="stable"]')).toHaveText('C5');
    await expect(section.locator('[data-range-used]')).toHaveText('신뢰도 높은 녹음 399개로 계산했어요 (전체 450개 중)');
    expect(await section.locator('[data-range-col]').evaluateAll(els => els.map(e => [e.dataset.rangeCol, e.dataset.rangeLow, e.dataset.rangeHigh, e.querySelector('.range-count').textContent])))
      .toEqual([['2026-09', 'G3', 'C5', '133개'], ['2026-10', 'G3', 'C#5', '133개'], ['2026-11', 'G3', 'D5', '133개']]);
    await expect(section.locator('[data-range-change]')).toHaveText('최근 3개월(9월 → 11월) 자주 닿은 최고음 C5 → D5 (+2반음) · 자주 닿은 최저음 G3 → G3 (같음)');
    // Neither the accompaniment's extremes nor the octave-away notes (A5 · A#5 above, A#2 · B2 below) nor the unusual recordings' E2 are on the screen.
    expect(await section.innerText()).not.toMatch(/D#2|C6(?! 이상)|C#6|A#?5|A#2|B2|E2|F2/);
    await shot(page, 'octave-375.png');
    await section.locator('[data-range-months] summary').click();
    await expect(section.locator('[data-range-row="2026-11"] [data-range-octave-month]')).toHaveText('한 옥타브쯤 떨어져 잠깐 잡힌 음이라 뺀 끝: 최저음 41 · 최고음 40 · 안정 최고음 13');
    await expect(section.locator('[data-range-row="2026-11"] [data-range-left]')).toHaveText('뺀 녹음 17개: 반주 구분 약함 15 · 평소와 다른 음역 2');
    await expect(section.locator('[data-range-row="2026-11"] [data-range-sample]')).toContainText('최고음 23개 · 최저음 23개 이상의 녹음이 닿은 음');
    await section.locator('[data-range-months] summary').click();
    await section.locator('[data-range-what] summary').click();
    await expect(section.locator('[data-range-left-all] li')).toHaveText(['반주와 목소리 구분이 약한 녹음 (목소리가 반주보다 10dB 이상 크지 않아요) 45개', '주로 부른 음역이 평소와 크게 다른 녹음 — 다른 목소리이거나 옥타브가 통째로 잘못 잡혔을 수 있어요 6개']);
    await expect(section.locator('[data-range-octave] li')).toHaveText(['한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최저음만 뺌 123개', '한 옥타브쯤 떨어져 잠깐 잡힌 음 · 최고음만 뺌 120개', '한 옥타브쯤 떨어져 잠깐 잡힌 음 · 안정 최고음만 뺌 39개']);
    await expect(section.locator('[data-range-dropped] li')).toHaveCount(2);
    await noOverflow(page); await inside(page, '[data-range-section] *');
    await shot(page, 'octave-375-what.png');
    await section.locator('[data-range-what] summary').click();
    // 처음·지금 follows the same rules over its own recordings (30 a side is one month here).
    await section.locator('[data-range-view="compare"]').click();
    expect(await section.locator('[data-range-compare-row]').evaluateAll(els => els.map(e => [...e.children].map(x => x.textContent))))
      .toEqual([['주로 부른 음역 아래', 'C4', 'C4', '같음'], ['주로 부른 음역 위', 'A#4', 'A#4', '같음'], ['자주 닿은 최저음', 'G3', 'G3', '같음'], ['자주 닿은 최고음', 'C5', 'D5', '+2반음'], ['안정 최고음', 'B4', 'C#5', '+2반음']]);
    await section.locator('[data-range-view="flow"]').click();
    await noOverflow(page); await inside(page, '[data-range-section] *');
    expect(page.__errors).toEqual([]);
  });

  test('처음·지금: the switch shows the earliest and the latest window side by side with a table, and is remembered', async ({page}) => {
    await boot(page, FULL);
    const section = () => page.locator('[data-range-section]');
    // 달별 흐름 is the default; the switch is two 44px buttons.
    await expect(section()).toHaveAttribute('data-range-view-now', 'flow');
    expect(await section().locator('[data-range-view]').evaluateAll(els => els.map(e => [e.dataset.rangeView, e.textContent, e.getAttribute('aria-pressed'), e.getBoundingClientRect().height >= 44])))
      .toEqual([['flow', '달별 흐름', 'true', true], ['compare', '처음·지금', 'false', true]]);
    await section().locator('[data-range-view="compare"]').click();
    await expect(section()).toHaveAttribute('data-range-view-now', 'compare');
    await expect(section().locator('[data-range-view="compare"]')).toBeFocused(); await expect(section().locator('[data-range-view="compare"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(section().locator('[data-range-chart], [data-range-change], [data-range-months]')).toHaveCount(0);   // the month chart and its list belong to the other view
    const c = (await modelOf(page)).compare;
    expect([c.state, c.first.period, c.first.n, c.now.period, c.now.n]).toEqual(['ok', '2025.12–2026.03', 7, '2026.09–11', 15]);
    // Two columns on one note axis, each with its period and how many recordings it used.
    expect(await section().locator('[data-range-side]').evaluateAll(els => els.map(e => [e.dataset.rangeSide, e.querySelector('.range-month').textContent, e.querySelector('[data-range-side-period]').textContent, e.querySelector('[data-range-side-n]').textContent,
      e.dataset.rangeLow, e.dataset.rangeHigh, e.querySelector('.range-hi').textContent, e.querySelector('.range-lo').textContent, !!e.querySelector('.range-main'), !!e.querySelector('.range-stable')])))
      .toEqual([['first', '처음', '2025.12–2026.03', '녹음 7개', 'G3', 'A4', 'A4', 'G3', true, true], ['now', '지금', '2026.09–11', '녹음 15개', 'F#3', 'B4', 'B4', 'F#3', true, true]]);
    const tops = await section().locator('[data-range-side] .range-hi').evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
    expect(tops[1]).toBeLessThan(tops[0]);                                               // B4 is drawn above A4: the same axis
    expect(await section().locator('[data-range-compare-chart]').getAttribute('aria-label')).toContain('처음과 지금의 자주 닿은 음역. 처음 2025.12–2026.03 G3 ~ A4, 녹음 7개. 지금 2026.09–11 F#3 ~ B4, 녹음 15개');
    // The line about the two windows, and the table: 처음 · 지금 · 차이.
    await expect(section().locator('[data-range-compare-line]')).toHaveText('처음(2025.12–2026.03) → 지금(2026.09–11) 주로 부른 음역 C4–F4 → C4–F4');
    await expect(section().locator('[data-range-compare-line]')).toHaveText(await page.evaluate(x => VzipGrowthRange.compareText(x), c));
    const table = await section().locator('[data-range-compare-row]').evaluateAll(els => els.map(e => [e.dataset.rangeCompareRow, ...[...e.children].map(x => x.textContent)]));
    expect(table).toEqual(c.rows.map(r => [r.key, r.label, r.first || '—', r.now || '—', r.delta == null ? '—' : r.delta === 0 ? '같음' : (r.delta > 0 ? '+' : '−') + Math.abs(r.delta) + '반음']));
    expect(table).toEqual([['mainLow', '주로 부른 음역 아래', 'C4', 'C4', '같음'], ['mainHigh', '주로 부른 음역 위', 'F4', 'F4', '같음'], ['low', '자주 닿은 최저음', 'G3', 'F#3', '−1반음'], ['high', '자주 닿은 최고음', 'A4', 'B4', '+2반음'], ['stable', '안정 최고음', 'G4', 'G4', '같음']]);
    await expect(section().locator('[data-range-compare-table] thead th')).toHaveText(['', '처음', '지금', '차이']);
    await expect(section().locator('[data-range-used]')).toHaveText('신뢰도 높은 녹음 가운데 처음 7개, 지금 15개로 계산했어요 (전체 40개 중 35개가 신뢰도 높은 녹음)');
    const text = await section().innerText();
    expect(text).not.toMatch(/성장|향상|확정|좋아졌|나빠졌/); expect(text).toContain('실력 변화로 판정하지 않아요'); expect(text).toContain('두 기간에 부른 곡이 달라서');
    await noOverflow(page); await inside(page, '[data-range-section] *');
    await shot(page, 'first-now-375.png');
    // The kind chips apply to this view too: without lessons 지금 is made of 13 recordings; its top is still B4, its bottom F#3.
    await section().locator('[data-range-group="lesson"]').click();
    await expect(section()).toHaveAttribute('data-range-view-now', 'compare');
    await expect(section().locator('[data-range-side="now"] [data-range-side-n]')).toHaveText('녹음 13개');
    await expect(section().locator('[data-range-compare-row="low"] td').nth(1)).toHaveText((await modelOf(page)).compare.rows[2].now);
    await expect(section().locator('[data-range-compare-row="low"] td').nth(1)).toHaveText('F#3');
    await section().locator('[data-range-group="lesson"]').click();
    // 무엇을 셌나요 and the all-time values are in both views.
    await expect(section().locator('[data-range-what], .range-stats')).toHaveCount(2);
    // Remembered on this device: a reload opens the same view; switching back is remembered too.
    await page.reload();
    await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
    await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); location.hash = '#/home'; }, FULL);
    await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; });
    await expect(section()).toHaveAttribute('data-range-view-now', 'compare');
    await expect(section().locator('[data-range-compare-table]')).toBeVisible();
    await section().locator('[data-range-view="flow"]').click();
    await expect(section().locator('[data-range-chart]')).toBeVisible(); await expect(section().locator('[data-range-compare-table]')).toHaveCount(0);
    expect(await page.evaluate(() => (window.VzipAccountScope?.storage || localStorage).getItem('vzip_range_view'))).toBe('flow');
    expect(page.__errors).toEqual([]);
  });

  test('처음·지금: too short a record says so with what is missing; a missing value is a dash, not a guess', async ({page}) => {
    await boot(page, FEW);
    const section = () => page.locator('[data-range-section]');
    await section().locator('[data-range-view="compare"]').click();
    await expect(section().locator('[data-range-compare-short] strong')).toHaveText('아직 비교할 만큼 기간이 쌓이지 않았어요');
    await expect(section().locator('[data-range-compare-short]')).toContainText('처음(2026.09–11)과 지금(2026.09–11) 기간이 겹쳐요 · 녹음이 있는 달이 더 쌓이면 비교할 수 있어요 (지금 2개월)');
    await expect(section().locator('[data-range-compare-short]')).toContainText('녹음이 있는 달을 3개(또는 녹음 30개가 찰 때)까지 묶고');
    await expect(section().locator('[data-range-compare-table], [data-range-compare-chart]')).toHaveCount(0);
    await noOverflow(page);
    // 처음 has no highest note that enough recordings share (all on the detector's ceiling): "—" with the reason.
    const day = i => String(1 + i % 28).padStart(2, '0');
    const month = (ym, low, high) => Array.from({length:30}, (_, i) => rec(ym + '-' + day(i), v2(low, high, {main:['C4', 'A4'], stable:'C5'})));
    await boot(page, [...month('2026-01', 'G3', 'C6'), ...month('2026-11', 'A3', 'D5')]);
    await expect(section()).toHaveAttribute('data-range-view-now', 'compare');           // still the view chosen above
    const rows = await section().locator('[data-range-compare-row]').evaluateAll(els => els.map(e => [...e.children].map(x => x.textContent)));
    expect(rows).toEqual([['주로 부른 음역 아래', 'C4', 'C4', '같음'], ['주로 부른 음역 위', 'A4', 'A4', '같음'], ['자주 닿은 최저음', 'G3', 'A3', '+2반음'], ['자주 닿은 최고음', '—', 'D5', '—'], ['안정 최고음', '—', 'C5', '—']]);
    await expect(section().locator('[data-range-compare-row="high"] .range-dash').first()).toHaveAttribute('title', '처음 기간에 여러 녹음에 함께 나온 값이 없어요');
    await expect(section().locator('[data-range-compare-missing]')).toContainText('한두 녹음의 값으로 채우지 않아요');
    await expect(section().locator('[data-range-side="first"] .range-hi')).toHaveCount(0);
    expect(page.__errors).toEqual([]);
  });

  test('too few recordings: values are shown as they are, the comparison says what is missing', async ({page}) => {
    await boot(page, FEW);
    const m = await modelOf(page), section = page.locator('[data-range-section]');
    expect(m.months.map(x => [x.month, x.n, x.enough])).toEqual([['2026-09', 1, false], ['2026-10', 0, false], ['2026-11', 2, false]]);
    await expect(section.locator('[data-range-change]')).toHaveAttribute('data-state', 'short');
    await expect(section.locator('[data-range-change]')).toHaveText('표본이 부족해요 · 9월 녹음 1개, 11월 녹음 2개 · 한 달에 3개부터 비교해요');
    await expect(section.locator('[data-range-all="observed"]')).toHaveText('A3 ~ A4');   // what all three recordings reach
    await expect(section.locator('[data-range-used]')).toHaveText('신뢰도 높은 녹음 3개로 계산했어요 (전체 3개 중)');
    await expect(section.locator('[data-range-col="2026-11"]')).toHaveAttribute('data-range-high', 'B4');   // a month with 2: as it is, drawn as a small sample
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
    await page.locator('[data-gm-period="month"]').click();
    const row = page.locator('[data-range-month]');
    await expect(row).toHaveAttribute('data-range-month', '2026-11');
    const m = await modelOf(page, {all:true});
    const nov = m.months.find(x => x.month === '2026-11');
    await expect(row.locator('h2')).toHaveText('이 달의 음역');
    await expect(row.locator('[data-range-values]')).toHaveText(await page.evaluate(x => VzipGrowthRange.valuesText(x), nov));
    await expect(row.locator('[data-range-values]')).toHaveText('자주 닿은 음 F#3 ~ B4 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 G4');
    await expect(row.locator('[data-range-sample]')).toHaveText('녹음 6개 (곡 녹음 3 · 보이스 체크 1 · 트레이닝 1 · 레슨 1) · 1곡 · 목소리 6분 · 최고음 3개 · 최저음 3개 이상의 녹음이 닿은 음');
    await expect(row.locator('[data-range-octave-month]')).toHaveText('한 옥타브쯤 떨어져 잠깐 잡힌 음이라 뺀 끝: 최저음 1');
    await expect(row.locator('[data-range-left]')).toHaveText('뺀 녹음 2개: 분석 전 1 · 반주 구분 약함 1');
    await page.evaluate(h => { location.hash = h; }, '#/vocal-growth?period=month&month=2026-05');   // ‹ › of 나 (큰 정리 3번)
    await expect(row).toHaveAttribute('data-range-month', '2026-05');
    await expect(row.locator('[data-range-values]')).toHaveText('셀 수 있는 녹음이 없어요');
    await expect(row.locator('[data-range-left]')).toHaveText('뺀 녹음 1개: 신뢰도 낮음 1');
    await page.evaluate(h => { location.hash = h; }, '#/vocal-growth?period=month&month=2026-08');   // ‹ › of 나 (큰 정리 3번)
    await expect(row.locator('[data-range-values]')).toHaveText('자주 닿은 음 G3 ~ A#4 · 주로 부른 음역 C4 ~ F4 · 안정 최고음 G4');
    await expect(row.locator('[data-range-dropped-month]')).toHaveText('검출 한계에 걸려 뺀 끝: 최고음 1');
    await page.evaluate(h => { location.hash = h; }, '#/vocal-growth?period=month&month=2026-07');   // ‹ › of 나 (큰 정리 3번)
    await expect(row.locator('[data-range-left]')).toHaveText('뺀 녹음 1개: 평소와 다른 음역 1');   // the recording far from the usual main range
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
    // 처음·지금 at 320px: the switch, the two columns and the table all fit.
    await section.locator('[data-range-view="compare"]').click();
    await expect(page.locator('[data-range-compare-table]')).toBeVisible();
    expect(await page.locator('[data-range-view]').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 44))).toBe(true);
    await noOverflow(page); await inside(page, '[data-range-section] *');
    await page.locator('[data-range-view="flow"]').click();
    await page.locator('[data-gm-period="month"]').click();
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
