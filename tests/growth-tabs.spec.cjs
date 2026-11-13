// 성장 통합 탭 (#385, docs/audit/2026-11-13-growth-unification.md PR B) in the real app: one 성장 menu with
// 결과 리포트 · 보컬 분석 · 보컬 트레이닝, the period row kept apart under 결과 리포트, every older link still opening
// its own screen, counts shown as they are (분석 전 is said, never a made-up result). Fake data only.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const pad = n => String(n).padStart(2, '0');
const ago = days => { const d = new Date(Date.now() - days * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
// A v2 summary with the growth-report detail. phrases: [start, dur, midi, intonation, wobble]; bands: [midi, n, held, longest, nw, wobble].
// The whole-recording accuracy (into + 3) differs from the same-phrase one (into) on purpose.
const v2 = ({into, wob = 10, longer = 0, held = .8, highWob = 12, conf = .95}) => ({v:2, at:Date.now(), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:into + 3, within20:70, notes:40}, stability:{wobbleCents:wob + 1, notes:15}, vibrato:{share:20, notes:10, rateHz:5.5, extentCents:40, regularity:.9},
  range:{validHigh:{note:'G5', cents:7900}, stableHigh:{note:'F5', cents:7700}, instantaneous:{note:'C7', cents:9600, t:30}, main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
  breath:{phrases:5, medianPhrase:3.4 + longer},
  phrases:{v:1, rows:[[10, 3 + longer, 64, into, wob], [15, 2.5 + longer, 67, into, wob], [20, 3.5 + longer, 69, into, wob], [26, 4 + longer, 72, into, wob], [32, 2 + longer, 71, into, wob]]},
  pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [67, 4, .6, 1, 3, 6], [74, 3, held, held + .3, 3, highWob]]}},
  confidence:{pitchConfidence:conf, voiceOverMrDb:12}});
const v1 = into => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:into, notes:20}, stability:{wobbleCents:15, notes:6}, range:{high:'A5', highCents:8100}, breath:{medianPhrase:2.5}}, confidence:{voiceOverMrDb:12}});
const TAKES = [
  // s1: an old v1 take, then six v2 takes getting more in tune; the last one holds the high note longer (wobble unchanged)
  // and sings phrases 0.8 s longer than the take before.
  ['a0', 's1', ago(90), v1(60)],
  ['a1', 's1', ago(60), v2({into:30})], ['a2', 's1', ago(40), v2({into:26})], ['a3', 's1', ago(30), v2({into:22})],
  ['a4', 's1', ago(20), v2({into:18})], ['a5', 's1', ago(10), v2({into:14})], ['a6', 's1', ago(1), v2({into:11, longer:.8, held:1.2})],
  // s2: accuracy got worse. s3: accuracy got better. → 음정 정확도 is better in 2 of 3 songs and worse in 1.
  ['b1', 's2', ago(50), v2({into:12})], ['b2', 's2', ago(2), v2({into:24})],
  ['c1', 's3', ago(45), v2({into:25})], ['c2', 's3', ago(3), v2({into:12})],
  // s4: recordings without an analysis. s5: one low-confidence take and one good one.
  ['d1', 's4', ago(8), null], ['d2', 's4', ago(4), null],
  ['e1', 's5', ago(30), v2({into:20, conf:.3})], ['e2', 's5', ago(5), v2({into:15})]
];
async function boot(page, extra = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  const seed = {categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[], ...extra,
    songs:[{id:'s1', title:'Defying Gravity'}, {id:'s2', title:'On My Own'}, {id:'s3', title:'Memory'}, {id:'s4', title:'새 곡'}, {id:'s5', title:'Home'}]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async takes => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (const [id, songId, date] of takes) await window.vzipStorePracticeMedia({id, name:'연습 ' + date, created:new Date(date + 'T20:00:00').getTime(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId, song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:120});
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x[0] === m.id); if (t?.[3]) await VZ.media.update(m, {analysis:t[3]}, {quiet:true}); }
    VZ.media.invalidate();
    window.dispatchEvent(new Event('vzip:media-updated'));
  }, TAKES);
  await page.waitForTimeout(400);
}
const ROOM = [
  {id:'practice-room:roomaaaa1111', date:ago(1), minutes:8, songId:'s1', created:2, practiceRoom:{id:'roomaaaa1111', task:'tone', title:'기준음 따라 부르기', songId:'s1', date:new Date(Date.now() - 864e5).toISOString(), demo:false}},
  {id:'practice-room:roombbbb2222', date:ago(6), minutes:10, created:1, practiceRoom:{id:'roombbbb2222', task:'expressive', title:'표현을 담은 한 구절 제출', songId:'', date:new Date(Date.now() - 6 * 864e5).toISOString(), demo:false}},
  {id:'plain-practice', date:ago(2), minutes:30, songId:'s2'}
];
const tabs = page => page.locator('.growth-top-tabs a');
const current = page => page.locator('.growth-top-tabs a[aria-current="page"]');
const overflow = page => page.evaluate(() => ({wide:document.documentElement.scrollWidth > innerWidth + 1,
  over:[...document.querySelectorAll('#view *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1; }).length}));

test('성장 opens on 결과 리포트 with three tabs; the period row stays a separate control', async ({page}) => {
  await page.setViewportSize({width:375, height:812});
  await boot(page);
  await page.locator('.v-nav a[data-nav="growth"]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(page.locator('#top h1')).toHaveText('성장');
  await expect(tabs(page)).toHaveText(['결과 리포트', '보컬 분석', '보컬 트레이닝']);
  await expect(current(page)).toHaveText('결과 리포트');
  // The existing report is all still there, under the tabs.
  await expect(page.locator('[data-growth-mode="overall"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  await page.locator('[data-growth-mode="monthly"]').click();
  await expect(page.locator('[data-growth-select]')).toBeVisible();
  await expect(current(page)).toHaveText('결과 리포트');           // changing the period redraws the report, not the tabs
  expect(await page.evaluate(() => { const t = document.querySelector('.growth-top-tabs').getBoundingClientRect(), p = document.querySelector('.growth-view-tabs').getBoundingClientRect(); return t.bottom <= p.top; })).toBe(true);
  for (const a of await tabs(page).all()) expect((await a.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // 주간 요약 is part of 결과 리포트.
  await page.locator('.growth-weekly-tab').click();
  await expect(page).toHaveURL(/#\/weekly-summary/);
  await expect(current(page)).toHaveText('결과 리포트');
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  expect(page.__errors).toEqual([]);
});

test('보컬 분석: songs with recordings and their real counts, then the existing 보컬 연구소; 뒤로 returns to the tab', async ({page}) => {
  await page.setViewportSize({width:375, height:812});
  await boot(page, {comparisonReports:[{id:'r1', kind:'vocal-lab', songId:'s1', song:'Defying Gravity', created:Date.now(), mediaIds:['a5', 'a6'], snapshots:[]}]});
  await page.goto('/#/vocal-growth');
  await tabs(page).nth(1).click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await expect(current(page)).toHaveText('보컬 분석');
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.v-nav')).toBeVisible();
  const rows = page.locator('[data-hub-song]');
  await expect(rows).toHaveCount(5);
  // Most recently recorded first: s1 (yesterday), s2 (2 days), s3 (3), s4 (4), s5 (5).
  expect(await rows.evaluateAll(els => els.map(e => e.dataset.hubSong))).toEqual(['s1', 's2', 's3', 's4', 's5']);
  await expect(rows.nth(0)).toContainText('Defying Gravity');
  await expect(rows.nth(0)).toContainText('녹음 7개 · 분석 7개');
  await expect(rows.nth(3)).toContainText('녹음 2개 · 분석 전');      // unanalysed takes are said, not scored
  await expect(page.locator('[data-hub-reports]')).toContainText('저장한 리포트 1개');
  await expect(page.locator('[data-hub-reports]')).toHaveAttribute('href', '#/lab-reports');
  expect(await overflow(page)).toEqual({wide:false, over:0});
  await rows.nth(0).click();
  await expect(page).toHaveURL(/#\/vocal-lab\/s1$/);
  await expect(page.locator('[data-lab] .vl-song, [data-lab] .vl-player, [data-lab]').first()).toBeVisible();
  await expect(page.locator('#top h1')).toHaveText('보컬 연구소');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await expect(rows).toHaveCount(5);
  expect(page.__errors).toEqual([]);
});

test('older links keep their screens; a bare #/vocal-lab lands on 보컬 분석 without trapping 뒤로', async ({page}) => {
  await boot(page, {comparisonReports:[{id:'r1', kind:'vocal-lab', songId:'s1', song:'Defying Gravity', created:Date.now(), mediaIds:['a5', 'a6'], snapshots:[]}]});
  await page.goto('/#/vocal-growth');
  await expect(current(page)).toHaveText('결과 리포트');
  await page.evaluate(() => { location.hash = '#/vocal-lab'; });
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await expect(page.locator('[data-hub-song]').first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/vocal-growth$/);                  // not back into #/vocal-lab and forward again
  await page.goto('/#/lab-reports');
  await expect(page.locator('#top h1')).toHaveText('리포트 보관함');
  await expect(page.locator('.vl-reports .vl-report')).toHaveCount(1);
  await expect(page.locator('.growth-top-tabs')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('vocalzip-vocal-lab-selected-media-v1', JSON.stringify(['a5', 'b2'])));
  await page.goto('/#/home'); await page.goto('/#/vocal-lab?selection=1');
  await expect(page).toHaveURL(/#\/vocal-lab\?selection=1$/);
  await expect(page.locator('[data-lab]')).toContainText('선택한 녹음 2개');
  await page.goto('/#/home'); await page.goto('/#/compare?a=a5&b=a6');
  await expect(page).toHaveURL(/#\/vocal-lab\/s1\?a=a5&b=a6&compare=1$/);
  await page.goto('/#/home'); await page.goto('/#/practice-room');
  await expect(page.locator('iframe.vzip-practice-room-frame')).toBeVisible();
  expect(page.__errors).toEqual([]);
});

test('보컬 트레이닝: the existing 연습실 · 보이스 체크 · 추천 entries and recent 연습실 records; fits 320px', async ({page}) => {
  await page.setViewportSize({width:320, height:640});
  await boot(page, {practices:ROOM});
  await page.goto('/#/vocal-training');
  await expect(current(page)).toHaveText('보컬 트레이닝');
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-hub-room]')).toHaveAttribute('href', '#/practice-room');
  await expect(page.locator('[data-hub-room]')).toContainText('제출 2개');
  await expect(page.locator('[data-hub-check]')).toHaveAttribute('href', '#/voice-check');
  await expect(page.locator('[data-hub-review]')).toHaveAttribute('href', '#/practice-review');
  const results = page.locator('[data-hub-result]');
  await expect(results).toHaveCount(2);                              // 연습실 submissions only, not the plain practice
  await expect(results.nth(0)).toContainText('기준음 따라 부르기');
  await expect(results.nth(0)).toContainText('Defying Gravity');
  await expect(results.nth(0)).toHaveAttribute('href', '#/practice-room?result=roomaaaa1111');
  await expect(results.nth(1)).toContainText('표현을 담은 한 구절 제출');
  await expect(page.locator('.growth-hub-all')).toHaveAttribute('href', '#/practices');
  expect(await overflow(page)).toEqual({wide:false, over:0});
  for (const a of await tabs(page).all()) { const b = await a.boundingBox(); expect(b.height).toBeGreaterThanOrEqual(44); expect(b.x + b.width).toBeLessThanOrEqual(320); }
  expect(await tabs(page).evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth))).toBe(true);   // no clipped label
  // A record that arrives while the tab is open shows up; one that is removed goes away.
  await page.evaluate(() => VZ.change(d => { d.practices.push({id:'practice-room:roomcccc3333', date:VZ.today(), minutes:5, created:9, practiceRoom:{id:'roomcccc3333', task:'melody', title:'짧은 선율 따라 부르기', songId:'', date:new Date().toISOString(), demo:false}}); }, {silent:true}));
  await expect(results).toHaveCount(3);
  await expect(results.nth(0)).toContainText('짧은 선율 따라 부르기');
  await expect(page.locator('[data-hub-room]')).toContainText('제출 3개');
  await results.nth(1).click();
  await expect(page).toHaveURL(/#\/practice-room\?result=roomaaaa1111$/);
  await expect(page.locator('iframe.vzip-practice-room-frame')).toHaveAttribute('src', /result=roomaaaa1111/);
  expect(page.__errors).toEqual([]);
});

test('empty account: each tab says what is missing instead of showing numbers', async ({page}) => {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify({categories:[], songs:[], lessons:[], assignments:[], practices:[], comparisonReports:[]})]);
  await page.goto('/#/vocal-analysis');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('[data-growth-analysis]')).toContainText('먼저 곡을 추가해 주세요.');
  await expect(page.locator('[data-hub-reports]')).toContainText('저장한 리포트가 아직 없어요');
  await tabs(page).nth(2).click();
  await expect(page.locator('[data-hub-room]')).toContainText('아직 제출 전');
  await expect(page.locator('[data-growth-training]')).toContainText('아직 제출한 과제가 없어요');
  await tabs(page).nth(0).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(current(page)).toHaveText('결과 리포트');
  expect(page.__errors).toEqual([]);
});
