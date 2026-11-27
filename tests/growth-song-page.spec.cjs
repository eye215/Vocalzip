// 성장 › 곡 하나 (#/growth-song/<id>) — the ONE song screen (큰 정리 2번): 기간 (전체 · 이번 달 · 지난달) → 한마디 ▶처음 ▶최근
// → 처음 vs 최근 → 녹음 타임라인 (a date plays and opens 이 녹음 자세히) → 약한 곳 → 이 곡 다음 연습 → 들어 본 평가 · 두 녹음
// 비교 → 깊이 보기 (folded). 곡 분석 (#/vocal-lab/<id>) leads here, keeping ?a=. Fixture data
// (tests/growth-characterization.fixture.cjs).
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
const open = async (page, id) => { await page.evaluate(h => { location.hash = h; }, '#/vocal-analysis'); await page.locator('[data-hub-song="' + id + '"]').click(); await expect(page).toHaveURL(new RegExp('#/growth-song/' + id + '$')); await expect(page.locator('[data-gsp-hero]')).toBeVisible(); await expect(page.locator('[data-song-section="takes"] .vl-dates').first()).toBeVisible(); };

test('곡 하나: the sections in order, the same word as the list, a date plays and opens 이 녹음 자세히', async ({page}) => {
  await boot(page);
  await open(page, 's2');
  // In order: 기간 · 한마디 · 처음 vs 최근 · 녹음 타임라인 · 약한 곳 · 이 곡 다음 연습 · 들어 본 평가와 두 녹음 비교 · 깊이 보기.
  const marks = ['[data-gsp-periods]', '[data-gsp-hero]', '[data-song-section="changes"]', '[data-song-section="takes"]', '[data-song-section="weak"]', '[data-song-section="next"]', '[data-song-section="compare"] [data-gsp-heard]', '[data-song-section="compare"] [data-compare-a]', '[data-song-section="deep"]'];
  expect(await page.evaluate(marks => { const els = marks.map(m => document.querySelector('[data-lab] ' + m));
    return els.map((el, i) => !el ? 'missing ' + marks[i] : i && !(els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'out of order ' + marks[i] : 'ok'); }, marks)).toEqual(Array(marks.length).fill('ok'));
  expect(await page.locator('[data-lab] [data-song-section]').evaluateAll(els => els.map(e => e.dataset.songSection + ':' + e.querySelector('h2').textContent))).toEqual(
    ['changes:처음 vs 최근', 'takes:녹음 타임라인', 'weak:약한 곳', 'next:이 곡 다음 연습', 'compare:들어 본 평가 · 두 녹음 비교', 'deep:깊이 보기']);
  await expect(page.locator('[data-gsp-period]')).toHaveText(['전체', '이번 달', '지난달']);
  await expect(page.locator('[data-gsp-period="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-song-section="deep"]')).not.toHaveAttribute('open', '');
  const hero = page.locator('[data-gsp-hero]');
  await expect(hero.locator('h2')).toHaveText('On My Own');
  // The word and line are the shared verdict's (the list says the same).
  const v = await page.evaluate(async () => { const n = VZ.growthSong.of(await VZ.media.list(), 's2', VZ.growthSong.practice()).now; return {word:n.word, text:n.text, rows:n.rows.length}; });
  await expect(hero.locator('.gsp-chip')).toHaveText(v.word);
  await expect(hero.locator('[data-gsp-line]')).toHaveText(v.text);
  await expect(hero.locator('[data-gsp-play]')).toHaveCount(2);
  // 듣고 고르기 opens with this song chosen.
  await expect(hero.locator('[data-gsp-listen]')).toHaveAttribute('href', '#/listen?song=s2');
  // ▶처음: it plays under the title.
  await hero.locator('[data-gsp-play]').first().click();
  await expect(page.locator('[data-gsp-player] audio, [data-gsp-player] .player')).toHaveCount(1);
  // 처음 vs 최근: the five measures of that pair.
  await expect(page.locator('[data-song-section="changes"] [data-growth-report] [data-growth-row]')).toHaveCount(v.rows);
  // The timeline: every recording of the song, 처음 and 최근 marked; a date plays and opens 이 녹음 자세히.
  const dates = page.locator('[data-song-section="takes"] .vl-dates [data-date]');
  const n = await page.evaluate(async () => VZ.growthDataset(await VZ.media.list()).pick('songList').filter(r => r.songId === 's2' && !r.deleted).length);
  await expect(dates).toHaveCount(n);
  await expect(page.locator('.vl-dates [data-date][data-pair="처음"]')).toHaveCount(1);
  await expect(page.locator('.vl-dates [data-date][data-pair="최근"]')).toHaveCount(1);
  await expect(page.locator('[data-song-fold="take"]')).not.toHaveAttribute('open', '');
  const first = await dates.first().getAttribute('data-date');
  await dates.first().click();
  await expect(page.locator('[data-song-fold="take"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-song-fold="take"] .vl-segment')).toBeVisible();
  await expect(page.locator('.vl-player-title strong')).toHaveText(await page.evaluate(async id => VZ.media.label((await VZ.media.list()).find(m => m.id === id)), first));
  await expect(page.locator('[data-gsp-player] audio, [data-gsp-player] .player')).toHaveCount(0);   // one player at a time
  // 들어 본 평가: none yet; 가리고 듣고 평가하기 (두 녹음 비교) opens the listening sheet for this song.
  await expect(page.locator('[data-gsp-heard]')).toContainText('아직 없어요');
  await page.locator('[data-song-section="compare"] [data-listen-open]').click();
  await expect(page.locator('.sheet-back')).toHaveCount(1);
  await page.locator('.sheet-back [data-close]').first().click();
  // 약한 곳 and 레슨 지적 체크 are on the screen.
  await expect(page.locator('[data-song-section="weak"] [data-growth-row="passaggio"]')).toBeVisible();
  await expect(page.locator('[data-song-section="weak"] [data-pts-card]')).toBeVisible();
});

test('곡 분석 (#/vocal-lab/<id>) leads to the song screen; ?a= opens that take on the timeline', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await expect(page.locator('[data-hub-song]').first()).toBeVisible();
  const before = await page.evaluate(() => history.length);
  await page.evaluate(() => { location.hash = '#/vocal-lab/s2?a=b1'; });
  await expect(page).toHaveURL(/#\/growth-song\/s2\?a=b1$/);
  await expect(page.locator('[data-gsp-hero]')).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before + 1);                 // replaced: one entry, not two
  await expect(page.locator('.vl-dates [data-date="b1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-song-fold="take"]')).toHaveAttribute('open', '');
  await expect(page.locator('.vl-player-title strong')).toHaveText(await page.evaluate(async () => VZ.media.label((await VZ.media.list()).find(m => m.id === 'b1'))));
  await expect.poll(() => page.locator('[data-song-section="takes"]').evaluate(el => el.getBoundingClientRect().top < innerHeight * 0.6)).toBe(true);
  // 뒤로 leaves it in one step.
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
});

test('기간 chips: 이번 달 and 지난달 say that month against the take before it, with the 월별 리포트 measures of this song', async ({page}) => {
  await boot(page);
  await open(page, 's5');
  await page.locator('[data-gsp-period="month"]').click();
  await expect(page.locator('[data-gsp-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  const m = await page.evaluate(async () => VZ.growthSong.month(await VZ.media.list(), 's5', false));
  await expect(page.locator('[data-gsp-hero] .gsp-chip')).toHaveText(m.word);
  await expect(page.locator('[data-gsp-hero] [data-gsp-line]')).toHaveText(m.text);
  await expect(page.locator('[data-gsp-hero] .gsp-kicker')).toHaveText('한마디 · 2026년 11월');
  // The same numbers as 월별 리포트 for this song this month (V.monthlyGrowthDetail).
  const detail = page.locator('[data-song-month-detail="2026-11"]');
  await expect(detail).toContainText('이달의 변화 · Home');
  await expect(detail.locator('.growth-metric')).toHaveCount(6);
  expect(await detail.evaluate(el => el.textContent.replace(/\s+/g, ''))).toBe(await page.evaluate(async () => { const d = document.createElement('div'); d.innerHTML = VZ.monthlyGrowthDetail(await VZ.media.list(), {month:'2026-11', songId:'s5', practice:false}).html; return d.textContent.replace(/\s+/g, ''); }));
  await expect(page.locator('[data-song-section="changes"] [data-gc-song="s5"] .gc-basis')).toContainText('지난 기간 마지막 녹음과 이번 기간');
  // 지난달: October, said as such (no pair → 판정 보류 with the reason).
  await page.locator('[data-gsp-period="last"]').click();
  await expect(page.locator('[data-gsp-hero] .gsp-kicker')).toHaveText('한마디 · 2026년 10월');
  // Back to 전체: the song's verdict again.
  await page.locator('[data-gsp-period="all"]').click();
  await expect(page.locator('[data-song-verdict]')).toHaveText('좋아진 방향');
  // A link with ?month= opens on that chip.
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await page.evaluate(() => { location.hash = '#/growth-song/s5?month=2026-11'; });
  await expect(page.locator('[data-gsp-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-song-month-detail="2026-11"]')).toBeVisible();
});

test('곡 상세: the growth of the song is ONE line — its 한마디 · 곡 분석 › — leading to the song screen', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/song/s2'; });
  const link = page.locator('[data-song-hero-growth]');
  const word = await page.evaluate(async () => VZ.growthSong.of(await VZ.media.list(), 's2').now.word);
  await expect(link).toHaveText(word + ' · 곡 분석');
  await expect(link).toHaveAttribute('href', '#/growth-song/s2');
  const box = await link.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeLessThan(56);                                                // one line
  expect(box.x + box.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  // No measurement card of its own on the song page: the numbers are on the song screen.
  await expect(page.locator('#view .vg, #view [data-song-vocal]')).toHaveCount(0);
  await link.click();
  await expect(page).toHaveURL(/#\/growth-song\/s2$/);
  await expect(page.locator('[data-gsp-hero] [data-song-verdict]')).toHaveText(word);
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
  // 모아 보기: how the ear leans over the song's verdicts, counted; the measured direction is set beside it only when
  // there is one to compare with (좋아진 방향 · 아쉬운 방향 · 비슷함).
  const ear = page.locator('[data-gsp-ear]');
  await expect(ear).toHaveAttribute('data-gsp-ear', 'better');
  await expect(ear).toContainText('들어 보면 요즘 녹음이 낫다는 쪽이 많아요');
  await expect(ear.locator('[data-gsp-ear-count]')).toHaveText('요즘 쪽 1');
  const state = await page.locator('[data-gsp-heard]').getAttribute('data-state');
  if (['better', 'worse', 'similar'].includes(state)) await expect(ear.locator('[data-gsp-agree]')).toHaveText(state === 'better' ? '측정 숫자도 같은 쪽이에요' : /귀와 숫자가 달라요/);
  else await expect(ear.locator('[data-gsp-agree]')).toHaveCount(0);
});

test('320px: nothing runs off the screen; the buttons are at least 44px', async ({page}) => {
  await page.setViewportSize({width:320, height:640});
  await boot(page);
  await open(page, 's2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const b of await page.locator('[data-gsp] button, [data-gsp] a').all()) if (await b.isVisible()) expect((await b.boundingBox()).height, await b.textContent()).toBeGreaterThanOrEqual(44);
});
