// 듣고 고르기 (app/listen-session.js): one audio element plays the session and moves on by itself; A·B of a song's
// 예전 vs 요즘, blind; a choice is a 들어 본 평가 row; a pair that went by unanswered waits; 그냥 이어 듣기; the lock
// screen's title; the small bar on other screens. Fake recordings (short silent WAVs) and no live account or cloud.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const seed = {categories:[], songs:[{id:'river', title:'The River'}, {id:'home', title:'Home'}, {id:'one', title:'혼자'}], lessons:[], assignments:[], practices:[], performances:[], comparisonReports:[], dailyGoals:[], practicePlans:[]};
const TAKES = [['r1', 'river', '2026-08-01'], ['r2', 'river', '2026-09-10'], ['r3', 'river', '2026-11-20'], ['h1', 'home', '2026-10-01'], ['h2', 'home', '2026-11-19'], ['o1', 'one', '2026-11-02']];
async function boot(page) {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('ls-seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('ls-seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async takes => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (const [id, songId, date] of takes) await window.vzipStorePracticeMedia({id, name:VZ.songTitle(songId) + ' ' + date, created:Date.parse(date + 'T12:00:00'), recordedDate:date, type:'audio/wav', source:'practice', recordingCategory:'song', songId, blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:2});
    VZ.media.invalidate();
    // The test moves the session on itself ('ended' below): the takes never really play to their end (WebKit plays
    // the 2-second files for real and would move on by itself as well).
    VZ.listenSession.audio.play = () => Promise.resolve();
  }, TAKES);
}
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const now = page => page.locator('[data-ls-now]');
const verdicts = page => page.evaluate(() => (VZ.db.comparisonReports || []).filter(x => x.kind === 'listen-verdict').map(x => ({songId:x.songId, firstId:x.firstId, secondId:x.secondId, overall:x.overall, blind:x.blind, judge:x.judge, firstRange:x.firstRange})));
/** What is in the audio element now: the take id (its object URL's take is found through the session). */
const playing = page => page.evaluate(() => { const s = VZ.listenSession.state(), x = s && (s.extra || s.steps[s.index]); return x ? [x.side || '', x.take.id] : null; });
const end = page => page.evaluate(() => VZ.listenSession.audio.dispatchEvent(new Event('ended')));

test('듣고 고르기: A then B then the next song by itself; a choice is a blind 들어 본 평가; unanswered pairs wait', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await page.locator('[data-listen-entry]').click();
  await expect(page).toHaveURL(/#\/listen$/);
  // River: r3 against r1 and r2 (both two weeks back or more); Home: h2 against h1; 혼자 (one take) makes none.
  await expect(page.locator('[data-ls-count]')).toHaveText('비교 3개');
  if (process.env.LS_SHOTS) await page.screenshot({path:process.env.LS_SHOTS + '/1-setup.png'});
  await page.locator('[data-ls-start]').click();
  await expect(now(page).locator('[data-ls-side]')).toHaveText('A');
  await expect(now(page)).toContainText('비교 1 / 3');
  await expect(now(page)).toContainText('The River');
  await expect.poll(() => page.evaluate(() => /^blob:/.test(VZ.listenSession.audio.src))).toBe(true);
  const [, a1] = await playing(page);
  expect(['r1', 'r3']).toContain(a1);
  // The lock screen's line (where the browser has Media Session).
  expect(await page.evaluate(() => window.MediaMetadata && navigator.mediaSession ? navigator.mediaSession.metadata?.title : 'A · The River')).toBe('A · The River');
  // The take ends: B comes on by itself.
  await end(page);
  await expect(now(page).locator('[data-ls-side]')).toHaveText('B');
  const [, b1] = await playing(page);
  expect(new Set([a1, b1])).toEqual(new Set(['r1', 'r3']));
  // A가 나아: saved blind, and the days are shown; on to the next pair (Home comes next: songs take turns).
  await now(page).locator('[data-ls-pick="A"]').click();
  await expect(now(page)).toContainText('비교 2 / 3');
  await expect(now(page)).toContainText('Home');
  const v = await verdicts(page);
  expect(v).toEqual([{songId:'river', firstId:'r1', secondId:'r3', overall:a1 === 'r1' ? 'first' : 'second', blind:true, judge:'me', firstRange:null}]);
  // Home goes by without a choice: it waits in 답 안 한 비교.
  await end(page); await end(page);
  await expect(now(page)).toContainText('비교 3 / 3');
  await expect(page.locator('[data-ls-missed]')).toContainText('답 안 한 비교 1');
  await expect(page.locator('[data-ls-missed]')).toContainText('Home');
  if (process.env.LS_SHOTS) await page.screenshot({path:process.env.LS_SHOTS + '/2-play.png', fullPage:true});
  // Hear its B again: the session waits; then choose 비슷해 from the list.
  await page.locator('[data-ls-row] [data-ls-hear="B"]').click();
  await expect(now(page)).toContainText('다시 듣기');
  await page.locator('[data-ls-row] [data-ls-pick="same"]').click();
  await expect(page.locator('[data-ls-missed]')).toHaveCount(0);
  expect((await verdicts(page)).find(x => x.songId === 'home')).toEqual(expect.objectContaining({firstId:'h1', secondId:'h2', overall:'same'}));
  await page.locator('[data-ls-resume]').click();
  await expect(now(page)).toContainText('비교 3 / 3');
  // Another screen: the small bar plays on; back to the session from it.
  await page.evaluate(() => { location.hash = '#/home'; });
  await expect(page.locator('[data-listen-bar]')).toBeVisible();
  await expect(page.locator('[data-listen-bar]')).toContainText('The River');
  if (process.env.LS_SHOTS) await page.screenshot({path:process.env.LS_SHOTS + '/3-bar.png'});
  await page.locator('[data-listen-bar] a').click();
  await expect(page).toHaveURL(/#\/listen$/);
  await expect(page.locator('[data-listen-bar]')).toHaveCount(0);
  // The last pair ends: done. A pair already judged is not offered again.
  await end(page); await end(page);
  await expect(page.locator('[data-ls-done]')).toContainText('다 들었어요');
  await page.locator('[data-ls-stop]').click();
  await expect(page.locator('[data-ls-count]')).toHaveText(/비교 [12]개/);
  await expect.poll(() => page.evaluate(() => VZ.listenSession.audio.paused)).toBe(true);
});

test('그냥 이어 듣기 · 앞 1분: every take newest first, on by itself; a choice of length is kept with a verdict', async ({page, browserName}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/listen'; });
  await page.locator('[data-ls-mode="play"]').click();
  await expect(page.locator('[data-ls-count]')).toHaveText('녹음 6개');
  await page.locator('[data-ls-song]').selectOption('river');
  await expect(page.locator('[data-ls-count]')).toHaveText('녹음 3개');
  await page.locator('[data-ls-start]').click();
  expect(await playing(page)).toEqual(['', 'r3']);
  await end(page); expect(await playing(page)).toEqual(['', 'r2']);
  // 이전 · 다음 (the buttons call these; the taps themselves are covered on Chromium below).
  const tap = async name => { if (browserName === 'webkit') await page.evaluate(n => VZ.listenSession[n](), name); else await page.locator('[data-ls-' + name + ']').click(); };
  await tap('prev'); expect(await playing(page)).toEqual(['', 'r3']);
  await tap('next'); await tap('next');
  expect(await playing(page)).toEqual(['', 'r1']);
  expect(await page.evaluate(() => window.MediaMetadata && navigator.mediaSession ? navigator.mediaSession.metadata?.title : 'The River')).toBe('The River');
  await end(page);
  await expect(page.locator('[data-ls-done]')).toContainText('녹음 3개');
});

test('#/listen?song=<id> opens with that song chosen', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/listen?song=home'; });
  await expect(page.locator('[data-ls-song]')).toHaveValue('home');
  await expect(page.locator('[data-ls-count]')).toHaveText('비교 1개');
});

test('320px: the setup and the player fit, every control at least 44px', async ({page}) => {
  await page.setViewportSize({width:320, height:640});
  await boot(page);
  await page.evaluate(() => { location.hash = '#/listen'; });
  await page.locator('[data-ls-start]').click();
  await expect(now(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const b of await page.locator('[data-listen] button').all()) if (await b.isVisible()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
});
