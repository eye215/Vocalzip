// 성장 › 결과 리포트 › 월별 분석 › 전체 · 곡별: one song's month with the same rules as the whole month (same song,
// same analysis version, 판정 보류 shown as such), the song chooser with its statuses, the choice kept across months
// and reloads, the fallback to 전체 for a month without the song, and no sideways scroll at 390 px. Fake data only.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const pad = n => String(n).padStart(2, '0');
// Last month (P) and the month before (PP), from the Korea day the app uses.
const kst = new Date(Date.now() + 9 * 36e5);
const monthKey = back => { const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - back, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); };
const P = monthKey(1), PP = monthKey(2);
const v2 = ({into, wob = 10, conf = .95}) => ({v:2, at:Date.now(), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:into + 3, within20:70, notes:40}, stability:{wobbleCents:wob + 1, notes:15}, vibrato:{share:20, notes:10, rateHz:5.5, extentCents:40, regularity:.9},
  range:{validHigh:{note:'G5', cents:7900}, stableHigh:{note:'F5', cents:7700}, instantaneous:{note:'C7', cents:9600, t:30}, main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
  breath:{phrases:5, medianPhrase:3.4},
  phrases:{v:1, rows:[[10, 3, 64, into, wob], [15, 2.5, 67, into, wob], [20, 3.5, 69, into, wob], [26, 4, 72, into, wob], [32, 2, 71, into, wob]]},
  pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [67, 4, .6, 1, 3, 6], [74, 3, .8, 1.1, 3, 12]]}},
  confidence:{pitchConfidence:conf, voiceOverMrDb:12}});
// [id, songId, date, analysis]. A and B: both months (A has two takes last month). C: last month only.
// D: last month analysed, the month before without an analysis → 판정 보류.
const TAKES = [
  ['a0', 'sA', PP + '-06', v2({into:30})], ['a1', 'sA', P + '-05', v2({into:16})], ['a2', 'sA', P + '-12', v2({into:13})],
  ['b0', 'sB', PP + '-07', v2({into:12})], ['b1', 'sB', P + '-10', v2({into:40})],
  ['c1', 'sC', P + '-08', v2({into:20})],
  ['d0', 'sD', PP + '-05', null], ['d1', 'sD', P + '-09', v2({into:18})]
];
const SONGS = [{id:'sA', title:'Defying Gravity'}, {id:'sB', title:'On My Own'}, {id:'sC', title:'Memory'}, {id:'sD', title:'Home'}];
async function boot(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/*youtube*/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } },
    [KEY, JSON.stringify({categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[], songs:SONGS})]);
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
  await page.waitForTimeout(300);
  await page.goto('/#/growth-flow?period=month');   // 지난 흐름 › 월별 분석 (성장 개편 phase 2)
  await expect(page.locator('[data-growth-select]')).toBeVisible();
}
const month = (page, key) => page.locator('[data-growth-select]').selectOption(key);
const intonation = page => page.locator('[data-growth-metric="intonation"] .growth-stat-number');
const pick = async (page, title) => {
  await page.locator('[data-mbs-scope="song"]').click();
  await page.locator('.sheet [data-mbs-song]', {hasText:title}).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 ||
  [...document.querySelectorAll('#view *')].some(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.growth-chart,.growth-jumps'); }));
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('곡별 lists this month’s songs with their status and shows one song’s numbers only', async ({page}) => {
  await boot(page);
  await month(page, P);
  await expect(page.locator('[data-mbs-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.growth-month-overview strong').first()).toHaveText('5');
  const whole = (await intonation(page).textContent()).trim();
  await page.locator('[data-mbs-scope="song"]').click();
  const rows = page.locator('.sheet [data-mbs-song]');
  // Most takes first; status from last month's takes of the same song.
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Defying Gravity');
  await expect(rows.first()).toContainText('이번 달 2개');
  const status = async id => page.locator('.sheet [data-mbs-song="' + id + '"] [data-mbs-status]').textContent();
  expect(await status('sA')).toBe('지난달과 비교 가능');
  expect(await status('sB')).toBe('지난달과 비교 가능');
  expect(await status('sC')).toBe('이번 달만');
  expect(await status('sD')).toBe('판정 보류');
  for (const b of await rows.all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('.sheet [data-mbs-song="sA"]').click();
  // Only A: its own tiles, summary and numbers (A's latest take, not the mean with B).
  await expect(page.locator('[data-mbs-scope="song"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-mbs-scope="song"]')).toContainText('Defying Gravity');
  await expect(page.locator('[data-mbs-tiles] strong')).toHaveText(['2', '2', /\d/]);
  await expect(page.locator('[data-month-section="results"] h2')).toHaveText('이달의 변화 · Defying Gravity');
  await expect(page.locator('[data-mbs-basis]')).toHaveText(PP + ' 대비 · 이 곡의 녹음만 · 같은 분석 버전끼리 비교');
  const own = (await intonation(page).textContent()).trim();
  expect(own).not.toBe(whole);
  expect(own).toBe('±13 cent');
  await expect(page.locator('[data-growth-metric="intonation"]')).toContainText('같은 곡 1곡');
  // Whole-month parts are not shown for one song, and the page says so.
  await expect(page.locator('[data-mbs-only]')).toHaveText(/곡별 보기는 변화만 보여요/);
  await expect(page.locator('[data-monthly-jump], [data-monthly-ai-run], [data-month-section="history"]')).toHaveCount(0);
  await expect(page.locator('[data-mbs-link="lab"]')).toHaveAttribute('href', '#/vocal-lab/sA');
  for (const b of await page.locator('.growth-song-scope button, .growth-song-links a').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toBe(false);
  if (process.env.MBS_SHOT && test.info().project.name === 'chromium-mobile') await page.screenshot({path:process.env.MBS_SHOT, fullPage:true});

  // 판정 보류 stays 판정 보류 for a song whose earlier month has no analysis.
  await pick(page, 'Home');
  await expect(page.locator('[data-growth-metric="intonation"] .growth-state')).not.toHaveText(/좋아짐|아쉬움|비슷/);
  await expect(page.locator('[data-mbs-tiles] strong').nth(2)).toHaveText('0');

  // A song with this month only.
  await pick(page, 'Memory');
  await expect(page.locator('[data-mbs-basis]')).toHaveText(/지난달과 비교할 녹음이 없어요/);

  // 전체 brings the whole month back.
  await page.locator('[data-mbs-scope="all"]').click();
  await expect(page.locator('[data-mbs-tiles]')).toHaveCount(0);
  await expect(intonation(page)).toHaveText(whole);
  await expect(page.locator('[data-monthly-jump="ai"]')).toBeVisible();
});

test('the chosen song is kept across months and reloads; a month without it falls back to 전체 with a note', async ({page}) => {
  await boot(page);
  await month(page, P);
  await pick(page, 'Defying Gravity');
  await month(page, PP);
  // The month before: A has a take, nothing earlier to compare with.
  await expect(page.locator('[data-mbs-scope="song"]')).toContainText('Defying Gravity');
  await expect(page.locator('[data-mbs-tiles] strong').first()).toHaveText('1');
  await expect(page.locator('[data-mbs-basis]')).toHaveText(/지난달과 비교할 녹음이 없어요/);
  // This month: no take of A → 전체 with a short note.
  await month(page, monthKey(0));
  await expect(page.locator('[data-mbs-fallback]')).toHaveText('Defying Gravity 녹음이 이 달에는 없어 전체를 보여 드려요.');
  await expect(page.locator('[data-mbs-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-mbs-tiles]')).toHaveCount(0);
  // Back to a month with A: the choice comes back, also after a reload (per device).
  await month(page, P);
  await expect(page.locator('[data-mbs-scope="song"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('[data-growth-select]')).toBeVisible();
  await month(page, P);
  await expect(page.locator('[data-mbs-scope="song"]')).toContainText('Defying Gravity');
  await expect(intonation(page)).toHaveText('±13 cent');
  // 무엇이 달라졌나 for this song opens 전체 분석 at that song's line.
  const changes = page.locator('[data-mbs-link="changes"]');
  await expect(changes).toHaveAttribute('href', '#/growth-flow?period=all&gc=sA');
  await changes.click();
  await expect(page.locator('[data-gc-song="sA"]').first()).toBeInViewport();
  await expect(page).toHaveURL(/#\/growth-flow\?period=all$/);
});

test('label of a long song title stays inside 390 px', async ({page}) => {
  test.skip(test.info().project.name !== 'chromium-mobile', 'phone width');
  await boot(page);
  await page.evaluate(() => VZ.change(db => { db.songs.find(s => s.id === 'sA').title = '아주 아주 긴 곡 제목이 들어가도 화면 밖으로 밀려나지 않아야 해요 Defying Gravity'; }, {silent:true}));
  await page.reload();
  await expect(page.locator('[data-growth-select]')).toBeVisible();
  await month(page, P);
  await pick(page, '아주 아주 긴');
  await expect(page.locator('[data-mbs-tiles]')).toBeVisible();
  expect(await overflow(page)).toBe(false);
});
