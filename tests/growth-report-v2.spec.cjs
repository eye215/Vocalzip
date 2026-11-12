// 성장 리포트 v2 in the real app on a phone: 성장 tab (전체/월별) and the vocal lab report show six separated
// measures, withhold judgements without evidence, never judge from the highest note, and fit a 320px screen.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const pad = n => String(n).padStart(2, '0');
const now = new Date(), thisMonth = now.getFullYear() + '-' + pad(now.getMonth() + 1);
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1), prevMonth = prev.getFullYear() + '-' + pad(prev.getMonth() + 1);
const older = new Date(now.getFullYear(), now.getMonth() - 3, 1), olderMonth = older.getFullYear() + '-' + pad(older.getMonth() + 1);
const note = c => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][Math.round(c / 100) % 12] + (Math.floor(Math.round(c / 100) / 12) - 1);
// A v2 summary with the growth-report detail. phrases: [start, dur, midi, intonation, wobble]; bands: [midi, n, held, longest, nw, wobble].
const v2 = ({into, wob, longer = 0, highWob = 12, stable = 7700}) => ({v:2, at:Date.now(), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:into + 3, within20:70, notes:40}, stability:{wobbleCents:wob + 1, notes:15}, vibrato:{share:20, notes:10},
  range:{validHigh:{note:note(stable + 200), cents:stable + 200}, stableHigh:{note:note(stable), cents:stable}, instantaneous:{note:'C7', cents:9600, t:30},
    main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
  breath:{phrases:5, medianPhrase:3 + longer},
  phrases:{v:1, rows:[[10, 3 + longer, 64, into, wob], [15, 2.5 + longer, 67, into, wob], [20, 3.5 + longer, 69, into, wob], [26, 4 + longer, 72, into, wob], [32, 2 + longer, 71, into, wob]]},
  pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [65, 3, .5, .8, 2, 19], [67, 4, .6, 1, 3, 6], [72, 3, .8, 1.2, 3, highWob], [74, 2, .8, 1, 2, highWob]]}},
  confidence:{pitchConfidence:.95, voiceOverMrDb:12}});
const v1 = into => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:into, notes:20}, stability:{wobbleCents:15, notes:6}, range:{high:'A5', highCents:8100}, breath:{medianPhrase:2.5}}, confidence:{voiceOverMrDb:12}});
const TAKES = [
  // Song 1 (score range confirmed, D5 top): same phrases more in tune, held longer; stable high F5 → A5 (never judged).
  ['a1', 's1', prevMonth + '-10', v2({into:20, wob:10, stable:7700, highWob:14})],
  ['a2', 's1', thisMonth + '-01', v2({into:11, wob:10, longer:.6, stable:8100, highWob:9})],
  // Song 2: an old v1 take and one v2 take → accuracy withheld (versions differ), not judged from either.
  ['b1', 's2', olderMonth + '-05', v1(40)],
  ['b2', 's2', thisMonth + '-01', v2({into:12, wob:9})]
];
async function boot(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  const seed = {categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[],
    songs:[{id:'s1', title:'Defying Gravity', vocalRange:{version:1, low:'A3', high:'D5', lowMidi:57, highMidi:74, source:'manual', confirmedByUser:true, updatedAt:1}}, {id:'s2', title:'On My Own (아주 긴 곡 제목이 들어가도 줄바꿈되는지 확인)'}]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async takes => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (const [id, songId, date] of takes) await window.vzipStorePracticeMedia({id, name:'연습 ' + date, created:new Date(date + 'T20:00:00').getTime(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId, song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:120});
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x[0] === m.id); if (t) await VZ.media.update(m, {analysis:t[3]}, {quiet:true}); }
    VZ.media.invalidate();
    window.dispatchEvent(new Event('vzip:media-updated'));
  }, TAKES);
  await page.waitForTimeout(400);
}
/** No horizontal page scroll and no visible element past the right edge. */
const fits = page => page.evaluate(() => ({width:innerWidth, scroll:document.documentElement.scrollWidth,
  over:[...document.querySelectorAll('#view *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.growth-chart,.vl-plot-scroll,.vl-dates,.vl-metrics,.growth-jumps,.growth-view-tabs,.growth-metric-picks,[data-chart-scroll]'); }).map(e => e.tagName + '.' + e.className + '<' + e.parentElement.className).slice(0, 5)}));
const shot = async (page, name) => { if (process.env.VZ_SHOTS) await page.screenshot({path:process.env.VZ_SHOTS + '/' + name + '.png', fullPage:true}); };
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('성장 tab · 전체 분석: six separated measures, same-phrase basis, holds with reasons, highest note never judged (320px)', async ({page}) => {
  await page.setViewportSize({width:320, height:740});
  await boot(page);
  await page.goto('/#/vocal-growth');
  const cards = page.locator('[data-growth-metric]');
  await expect(cards).toHaveCount(6);
  await expect(cards.locator('.growth-stat-top>span:first-child')).toHaveText(['음정 정확도', '음정 안정성', '음역 확장', '호흡 유지', '고음 안정성', '파사지오(전환 구간)']);
  const into = page.locator('[data-growth-metric="intonation"]');
  await expect(into.locator('.growth-state').first()).toHaveText('좋아진 방향');
  await expect(into).toContainText('판정 보류 1곡'); // s2: v1 → v2 is never a before/after
  await expect(into).toContainText('분석 버전(v1·v2)이 달라');
  await into.locator('summary').click();
  await expect(into.locator('.growth-song-rows')).toContainText('같은 프레이즈 5개 비교');
  await expect(into).toContainText('맞는 음을 불렀는지는 판단하지 않아요');
  await expect(page.locator('[data-growth-metric="stability"] .growth-state').first()).toHaveText('비슷함');
  await expect(page.locator('[data-growth-metric="phrase"] .growth-state').first()).toHaveText('좋아진 방향');
  const range = page.locator('[data-growth-metric="range"]');
  await expect(range.locator('.growth-state').first()).toHaveText('변화 관찰');
  await range.locator('summary').click();
  await expect(range).toContainText('F5 → A5 (+4반음)');
  await expect(range).toContainText('실력 판정 아님');
  await expect(range).toContainText('악보 최고음 D5 대비 +3반음 → +7반음');
  await expect(range).not.toContainText('C7'); // the instant max is never shown as growth
  await expect(page.locator('[data-growth-metric="high"] .growth-state').first()).toHaveText('좋아진 방향');
  const pass = page.locator('[data-growth-metric="passaggio"]');
  await expect(pass.locator('.growth-state').first()).toHaveText('참고');
  await expect(pass).toContainText('음정 데이터만으로 판별 불가, 선생님 판단 참고');
  await expect(page.locator('.growth-panel').last()).toContainText('이전 분석(v1) 1개');
  // 44px capsule targets for the view tabs.
  for (const b of await page.locator('.growth-view-tabs button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await fits(page)).toMatchObject({width:320, scroll:320, over:[]});
  await shot(page, 'growth-overall-320');
  // The AI input: only intonation/stability/phrase, with basis; nothing about highest notes.
  const input = await page.evaluate(() => window.VzipOverallGrowthUI.aiEvidence(window.VzipOverallGrowth.calculate([], {getDate:() => '', valid:() => false})));
  expect(input.metrics.map(m => m.key)).toEqual(['intonation', 'stability', 'phrase']);
});

test('성장 tab · 월별 분석 compares last month with this month per song and fits 320px', async ({page}) => {
  await page.setViewportSize({width:320, height:740});
  await boot(page);
  await page.goto('/#/vocal-growth');
  await page.locator('[data-growth-mode="monthly"]').click();
  await expect(page.locator('[data-growth-select]')).toHaveValue(thisMonth);
  const cards = page.locator('[data-month-section="results"] .growth-metric');
  await expect(cards).toHaveCount(6);
  await expect(page.locator('[data-month-section="results"] [data-growth-metric="intonation"] .growth-state').first()).toHaveText('좋아진 방향');
  await expect(page.locator('[data-month-section="results"] [data-growth-metric="intonation"]')).toContainText('지난달');
  await expect(page.locator('[data-month-section="results"] [data-growth-metric="range"]')).not.toContainText('좋아진');
  await expect(page.locator('[data-month-section="results"]')).toContainText('좋아진 항목: 음정 정확도, 호흡 유지, 고음 안정성');
  expect(await fits(page)).toMatchObject({width:320, scroll:320, over:[]});
  await shot(page, 'growth-monthly-320');
});

test('vocal lab 성장 리포트: groups by direction, withholds v1/v2 and the AI gets only separated, allowed measures (320px)', async ({page}) => {
  await page.setViewportSize({width:320, height:740});
  await boot(page);
  await page.evaluate(() => { window.vzipCloudCoach = async input => { window.__coach = input; return {mode:'overall', month:'all', note:'요약: 같은 프레이즈의 음정이 좋아졌어요.\n좋아진 점: 음정 정확도\n보완할 점: 음정 안정성 유지\n다음 연습: 같은 구간 다시 녹음'}; }; });
  await page.goto('/#/vocal-lab/s1');
  for (const b of await page.locator('.vl-dates button').all()) if (await b.getAttribute('aria-pressed') !== 'true') await b.click();
  const report = page.locator('[data-growth-report]');
  await expect(report.locator('h3.good')).toContainText('좋아진 부분');
  await expect(report.locator('[data-growth-row="intonation"]')).toContainText('±20 cent → ±11 cent');
  await expect(report.locator('[data-growth-row="intonation"]')).toContainText('같은 프레이즈 5개 비교');
  await expect(report.locator('[data-growth-row="range"]')).toHaveClass(/neutral/);
  await expect(report.locator('[data-growth-row="range"]')).toContainText('악보 최고음 D5 대비 +7반음');
  await expect(report.locator('[data-growth-row="passaggio"]')).toContainText('음정 데이터만으로 판별 불가, 선생님 판단 참고');
  expect(await fits(page)).toMatchObject({width:320, scroll:320, over:[]});
  await shot(page, 'vocal-lab-growth-320');
  await page.locator('[data-growth-ai]').click();
  await expect(page.locator('.vl-growth-ai-text')).toContainText('다음 연습');
  const sent = await page.evaluate(() => window.__coach);
  expect(sent.metrics.map(m => m.key)).toEqual(['intonation', 'stability', 'phrase']);
  expect(sent.metrics[0]).toMatchObject({state:'better', sharedSongs:1, improvedSongs:1});
  expect(sent.metrics[0].title).toContain('같은 프레이즈');
  expect(JSON.stringify(sent)).not.toMatch(/최고음|A5|C7|F5/);
  // Song 2: v1 then v2 → every judged measure is withheld, the v1 result is still readable.
  await page.goto('/#/vocal-lab/s2');
  for (const b of await page.locator('.vl-dates button').all()) if (await b.getAttribute('aria-pressed') !== 'true') await b.click();
  const other = page.locator('[data-growth-report]');
  await expect(other.locator('h3.good')).toHaveCount(0);
  await expect(other.locator('[data-growth-row="intonation"]')).toContainText('분석 버전(v1·v2)이 달라 판정 보류');
  await expect(other).toContainText('AI 해석을 요청할 수 있어요');
  await expect(page.locator('[data-growth-ai]')).toHaveCount(0);
  expect(await fits(page)).toMatchObject({width:320, scroll:320, over:[]});
});
