// 성장 › 곡 하나 (#/growth-song/<id>, app/growth-song-page.js; 성장 v2 R4): one song on one short screen — the word and
// line of the shared verdict, the recordings by day, 처음 vs 최근 measure by measure, 들어 본 평가, 약한 곳, 레슨 지적
// 체크, and every tool of the full 곡 분석 screen one tap away. Fixture data (tests/growth-characterization.fixture.cjs).
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const {NOW, MEDIA, DB} = require('./growth-characterization.fixture.cjs');
async function boot(page) {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(DB)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, MEDIA);
}
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const open = async (page, id) => { await page.evaluate(h => { location.hash = h; }, '#/vocal-analysis'); await page.locator('[data-hub-song="' + id + '"]').click(); await expect(page).toHaveURL(new RegExp('#/growth-song/' + id + '$')); await expect(page.locator('[data-gsp-hero]')).toBeVisible(); };

test('곡 하나: the same word as the list, the takes by day, 처음 vs 최근 by measure, 들어 본 평가, 약한 곳, the full screen', async ({page}) => {
  await boot(page);
  await open(page, 's2');
  const hero = page.locator('[data-gsp-hero]');
  await expect(hero.locator('h2')).toHaveText('On My Own');
  // The word and line are the shared verdict's (the list says the same).
  const v = await page.evaluate(async () => { const n = VZ.growthSong.of(await VZ.media.list(), 's2', VZ.growthSong.practice()).now; return {word:n.word, text:n.text, rows:n.rows.length}; });
  await expect(hero.locator('.gsp-chip')).toHaveText(v.word);
  await expect(hero.locator('[data-gsp-line]')).toHaveText(v.text);
  await expect(hero.locator('[data-gsp-play]')).toHaveCount(2);
  // 듣고 고르기 opens with this song chosen.
  await expect(hero.locator('[data-gsp-listen]')).toHaveAttribute('href', '#/listen?song=s2');
  // The takes by day: every recording of the song, analysed ones filled; 처음 and 최근 marked.
  const dots = page.locator('[data-gsp-take]');
  const n = await page.evaluate(async () => VZ.growthDataset(await VZ.media.list()).pick('songList').filter(r => r.songId === 's2' && !r.deleted).length);
  await expect(dots).toHaveCount(n);
  await expect(page.locator('[data-gsp-take][data-pair="처음"]')).toHaveCount(1);
  await expect(page.locator('[data-gsp-take][data-pair="최근"]')).toHaveCount(1);
  // Tap a day: it plays under the title (one player).
  await dots.first().click();
  await expect(page.locator('[data-gsp-player] audio, [data-gsp-player] .player')).toHaveCount(1);
  await expect(dots.first()).toHaveAttribute('data-active', '');
  // 처음 vs 최근: the five measures.
  await expect(page.locator('[data-gsp-rows] li')).toHaveCount(v.rows);
  // 들어 본 평가: none yet; 두 녹음 비교하기 opens the listening sheet for this song.
  await expect(page.locator('[data-gsp-heard]')).toContainText('아직 없어요');
  await page.locator('[data-gsp-heard] [data-listen-open]').click();
  await expect(page.locator('.sheet-back')).toHaveCount(1);
  await page.locator('.sheet-back [data-close]').first().click();
  // 약한 곳 → the full screen at 약한 곳.
  await expect(page.locator('[data-gsp-weak]')).toBeVisible();
  await page.locator('[data-gsp-weak-more]').click();
  await expect(page).toHaveURL(/#\/vocal-lab\/s2\?jump=weak$/);
  // In view (at the top on a phone; on a wide screen as far as the page scrolls).
  await expect.poll(() => page.locator('[data-song-section="weak"]').evaluate(el => el.getBoundingClientRect().top < innerHeight * 0.6)).toBe(true);
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/growth-song\/s2$/);
  // 레슨 지적 체크 is here; 모든 분석 도구 opens the full screen.
  await expect(page.locator('[data-gsp-points] [data-pts-card]')).toBeVisible();
  await expect(page.locator('[data-gsp-all]')).toHaveAttribute('href', '#/vocal-lab/s2');
});

test('a verdict saved from 두 녹음 비교 shows on the screen at once', async ({page}) => {
  await boot(page);
  await open(page, 's5');
  await page.evaluate(() => {
    const L = window.VzipListenVerdict, rec = L.make({songId:'s5', takes:[{id:'e1', date:'2026-10-05'}, {id:'e2', date:'2026-11-09'}], overall:'second', judge:'me'}, {today:'2026-11-12'});
    VZ.change(db => { db.comparisonReports.push(rec); }, {silent:true});
    window.dispatchEvent(new CustomEvent('vzip:listen-verdicts'));
  });
  await expect(page.locator('[data-gsp-heard]')).toContainText('1개');
  await expect(page.locator('[data-gsp-heard] li')).toHaveCount(1);
});

test('320px: nothing runs off the screen; the buttons are at least 44px', async ({page}) => {
  await page.setViewportSize({width:320, height:640});
  await boot(page);
  await open(page, 's2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const b of await page.locator('[data-gsp] button, [data-gsp] a').all()) if (await b.isVisible()) expect((await b.boundingBox()).height, await b.textContent()).toBeGreaterThanOrEqual(44);
});
