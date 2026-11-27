// 곡 분석 (#/growth-song/<id>) — the ONE song screen, light: 머리 (작품 · 제목 · 한마디 · 녹음 n · 분석 n, ▶ 처음 vs 최근 듣기 ·
// 듣고 고르기), then the tabs 흐름 (기간 · 처음 vs 최근 · 지표 흐름 · 들어 본 평가 · 자세히 보기) · 녹음별 (날짜 · 플레이어 ·
// 이 녹음 분석 · 두 녹음 비교 · 깊이 보기) · 약한 곳 (약한 곳 · 음높이 확인 구간 · 레슨 지적 · 구간 A/B) · 다음 연습. Under two
// analysed takes: one card instead of the tabs. 곡 분석 (#/vocal-lab/<id>) leads here, keeping ?a=. Fixture data
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
const open = async (page, id) => { await page.evaluate(h => { location.hash = h; }, '#/vocal-analysis'); await page.locator('[data-hub-song="' + id + '"]').click(); await expect(page).toHaveURL(new RegExp('#/growth-song/' + id + '$')); await expect(page.locator('[data-gsp-hero]')).toBeVisible(); await expect(page.locator('[data-song-section="changes"] [data-growth-report]')).toBeAttached(); };
const tab = async (page, k) => { await page.locator('[data-sa-tab="' + k + '"]').click(); await expect(page.locator('[data-sa-tab="' + k + '"]')).toHaveAttribute('aria-selected', 'true'); };

test('곡 분석: 머리 · 탭 네 개 · 흐름, the same word as the list, ▶ 처음 vs 최근 듣기, a date plays and opens 이 녹음 자세히', async ({page}) => {
  await boot(page);
  await open(page, 's2');
  await expect(page.locator('#top h1')).toHaveText('곡 분석');
  // The tabs: only the chosen one is a pill; 흐름 first.
  await expect(page.locator('[data-sa-tab]')).toHaveText(['흐름', '녹음별', '약한 곳', '다음 연습']);
  await expect(page.locator('[data-sa-tab="flow"]')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('[data-sa-tab]').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor))).toEqual(['rgb(239, 232, 252)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  // 흐름, in order: 기간 · 처음 vs 최근 · 지표 흐름 · 들어 본 평가 · 자세히 보기 (folded). The other tabs are hidden.
  const marks = ['[data-gsp-hero]', '[data-sa-tabs]', '[data-gsp-periods]', '[data-song-section="changes"]', '[data-sa-metrics]', '[data-gsp-heard]', '[data-song-fold="detail"]'];
  expect(await page.evaluate(marks => { const els = marks.map(m => document.querySelector('[data-lab] ' + m));
    return els.map((el, i) => !el ? 'missing ' + marks[i] : i && !(els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'out of order ' + marks[i] : 'ok'); }, marks)).toEqual(Array(marks.length).fill('ok'));
  for (const k of ['takes', 'weak', 'next']) await expect(page.locator('[data-sa-panel="' + k + '"]')).toBeHidden();
  await expect(page.locator('[data-gsp-period]')).toHaveText(['전체', '이번 달', '지난달']);
  await expect(page.locator('[data-gsp-period="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-song-fold="detail"]')).not.toHaveAttribute('open', '');
  const hero = page.locator('[data-gsp-hero]');
  await expect(hero.locator('h2')).toHaveText('On My Own');
  await expect(hero.locator('[data-gsp-stats]')).toHaveText(/^녹음 \d+ · 분석 \d+ · .+ → .+$/);
  // The word and line are the shared verdict's (the list says the same).
  const v = await page.evaluate(async () => { const n = VZ.growthSong.of(await VZ.media.list(), 's2', VZ.growthSong.practice()).now; return {word:n.word, text:n.text, rows:n.rows.length}; });
  await expect(hero.locator('.gsp-chip')).toHaveText(v.word);
  await expect(hero.locator('[data-gsp-line]')).toHaveText(v.text);
  // 듣고 고르기 opens with this song chosen.
  await expect(hero.locator('[data-gsp-listen]')).toHaveAttribute('href', '#/listen?song=s2');
  // 처음 vs 최근: the two takes to play and the five measures of that pair, each 처음 → 최근 · a word.
  const pair = page.locator('[data-song-section="changes"]');
  await expect(pair.locator('[data-gsp-play]')).toHaveCount(2);
  await expect(pair.locator('[data-growth-report] [data-growth-row]')).toHaveCount(v.rows);
  await expect(pair.locator('[data-growth-row="intonation"] .sa-pair-state')).toHaveText(/^아쉬움 ↘$/);
  // ▶ 처음 vs 최근 듣기: 처음 plays under the two takes, then 최근.
  await hero.locator('[data-gsp-pair]').click();
  await expect(pair.locator('[data-gsp-player] audio, [data-gsp-player] .player')).toHaveCount(1);
  await expect(pair.locator('.sa-take.is-first')).toHaveAttribute('data-playing', '');
  // 지표 흐름: six tiles, the chosen one's line and its numbers.
  const flow = page.locator('[data-sa-metrics]');
  await expect(flow.locator('[data-sa-metric]')).toHaveText([/^음정 정확도/, /^음정 안정성/, /^호흡 유지/, /^고음 안정성/, /^음역/, /^파사지오참고$/]);
  await expect(flow.locator('[data-sa-metric="intonation"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.locator('[data-sa-flow-graph="intonation"]')).toBeVisible();
  await expect(flow.locator('[data-sa-flow-stats]')).toContainText(/처음 .+평균 .+최고 .+녹음 \d+개/);
  await flow.locator('[data-sa-metric="phrase"]').click();
  await expect(flow.locator('[data-sa-metric="phrase"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.locator('[data-sa-flow-head]')).toContainText('호흡 유지');
  // 녹음별: every recording of the song, 처음 and 최근 marked; a date plays and opens 이 녹음 자세히.
  await tab(page, 'takes');
  await expect(page).toHaveURL(/#\/growth-song\/s2\?tab=takes$/);
  await expect(page.locator('[data-sa-panel="flow"]')).toBeHidden();
  const dates = page.locator('[data-song-section="takes"] .vl-dates [data-date]');
  const n = await page.evaluate(async () => VZ.growthDataset(await VZ.media.list()).pick('songList').filter(r => r.songId === 's2' && !r.deleted).length);
  await expect(dates).toHaveCount(n);
  await expect(page.locator('.vl-dates [data-date][data-pair="처음"]')).toHaveCount(1);
  await expect(page.locator('.vl-dates [data-date][data-pair="최근"]')).toHaveCount(1);
  await expect(page.locator('[data-sa-take-pos]')).toHaveText(/^(\d+)개 중 \1번째$/);   // the newest of the open takes
  await expect(page.locator('[data-sa-analysis] [data-sa-take-metric]')).toHaveCount(6);
  await expect(page.locator('[data-song-fold="take"]')).not.toHaveAttribute('open', '');
  const first = await dates.first().getAttribute('data-date');
  await dates.first().click();
  await expect(dates.first()).toHaveAttribute('data-active', '');
  await expect(page.locator('[data-song-fold="take"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-sa-take-detail]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-song-fold="take"] .vl-segment')).toBeVisible();
  await expect(page.locator('.vl-player-title strong')).toHaveText(await page.evaluate(async id => VZ.media.label((await VZ.media.list()).find(m => m.id === id)), first));
  await expect(page.locator('[data-gsp-player] audio, [data-gsp-player] .player')).toHaveCount(0);   // one player at a time
  // 구간 자세히 closes and opens it again.
  await page.locator('[data-sa-take-detail]').click();
  await expect(page.locator('[data-song-fold="take"]')).not.toHaveAttribute('open', '');
  // 두 녹음 비교: 가리고 듣고 평가하기 opens the listening sheet for this song.
  await page.locator('[data-song-section="compare"] [data-listen-open]').click();
  await expect(page.locator('.sheet-back')).toHaveCount(1);
  await page.locator('.sheet-back [data-close]').first().click();
  // 들어 본 평가 (흐름): none yet.
  await expect(page.locator('[data-gsp-heard]')).toContainText('아직 없어요');
  // 약한 곳: 파사지오 참고 and 레슨 지적 with 체크 시작 · + 지적 추가.
  await tab(page, 'weak');
  await expect(page.locator('[data-song-section="weak"] [data-growth-row="passaggio"]')).toBeVisible();
  await expect(page.locator('[data-song-section="weak"] [data-weak="points"] [data-pts-add]')).toHaveText('+ 지적 추가');
  // The chosen tab is remembered while the app is open.
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await page.locator('[data-hub-song="s2"]').click();
  await expect(page.locator('[data-sa-tab="weak"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sa-panel="weak"]')).toBeVisible();
});

test('?tab= opens that tab; ← → move between the tabs', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/growth-song/s5?tab=next'; });
  await expect(page.locator('[data-sa-tab="next"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-song-section="next"] [data-sa-next-card]')).toBeVisible();
  await expect(page.locator('[data-song-section="next"] [data-vl-next-all]')).toHaveAttribute('href', '#/next-practice');
  await page.locator('[data-sa-tab="next"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-sa-tab="weak"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sa-tab="weak"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-sa-tab="flow"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/growth-song\/s5$/);
});

test('곡 분석 (#/vocal-lab/<id>) leads to the song screen; ?a= opens that take in 녹음별', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await expect(page.locator('[data-hub-song]').first()).toBeVisible();
  const before = await page.evaluate(() => history.length);
  await page.evaluate(() => { location.hash = '#/vocal-lab/s2?a=b1'; });
  await expect(page).toHaveURL(/#\/growth-song\/s2\?a=b1$/);
  await expect(page.locator('[data-gsp-hero]')).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before + 1);                 // replaced: one entry, not two
  await expect(page.locator('[data-sa-tab="takes"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.vl-dates [data-date="b1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.vl-dates [data-date="b1"]')).toHaveAttribute('data-active', '');
  await expect(page.locator('[data-song-fold="take"]')).toHaveAttribute('open', '');
  await expect(page.locator('.vl-player-title strong')).toHaveText(await page.evaluate(async () => VZ.media.label((await VZ.media.list()).find(m => m.id === 'b1'))));
  await expect.poll(() => page.locator('[data-song-section="takes"]').evaluate(el => el.getBoundingClientRect().top < innerHeight * 0.6)).toBe(true);
  // 뒤로 leaves it in one step.
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
});

test('기간 chips (흐름): 이번 달 and 지난달 say that month against the take before it, with the 월별 리포트 measures of this song', async ({page}) => {
  await boot(page);
  await open(page, 's5');
  await page.locator('[data-gsp-period="month"]').click();
  await expect(page.locator('[data-gsp-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  const m = await page.evaluate(async () => VZ.growthSong.month(await VZ.media.list(), 's5', false));
  await expect(page.locator('[data-gsp-hero] .gsp-chip')).toHaveText(m.word);
  await expect(page.locator('[data-gsp-hero] [data-gsp-line]')).toHaveText(m.text);
  await expect(page.locator('[data-gsp-hero] [data-gsp-period-label]')).toHaveText('2026년 11월');
  // The same numbers as 월별 리포트 for this song this month (V.monthlyGrowthDetail).
  const detail = page.locator('[data-song-month-detail="2026-11"]');
  await expect(detail).toContainText('이달의 변화 · Home');
  await expect(detail.locator('.growth-metric')).toHaveCount(6);
  expect(await detail.evaluate(el => el.textContent.replace(/\s+/g, ''))).toBe(await page.evaluate(async () => { const d = document.createElement('div'); d.innerHTML = VZ.monthlyGrowthDetail(await VZ.media.list(), {month:'2026-11', songId:'s5', practice:false}).html; return d.textContent.replace(/\s+/g, ''); }));
  await page.locator('[data-song-fold="detail"] > summary').click();
  await expect(page.locator('[data-song-fold="detail"] [data-gc-song="s5"] .gc-basis')).toContainText('지난 기간 마지막 녹음과 이번 기간');
  // 지난달: October, said as such (no pair → 판정 보류 with the reason).
  await page.locator('[data-gsp-period="last"]').click();
  await expect(page.locator('[data-gsp-hero] [data-gsp-period-label]')).toHaveText('2026년 10월');
  // Back to 전체: the song's verdict again.
  await page.locator('[data-gsp-period="all"]').click();
  await expect(page.locator('[data-song-verdict]')).toHaveText('좋아진 방향');
  await expect(page.locator('[data-gsp-period-label]')).toHaveCount(0);
  // A link with ?month= opens on that chip.
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await page.evaluate(() => { location.hash = '#/growth-song/s5?month=2026-11'; });
  await expect(page.locator('[data-gsp-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-song-month-detail="2026-11"]')).toBeVisible();
});

test('분석한 녹음이 둘 미만: 머리가 말하고, 카드 하나와 줄 셋 — 탭의 빈 상자는 없다', async ({page}) => {
  await boot(page);
  // 새 곡 (s4) without its two analysed videos: two recordings, none analysed.
  await page.evaluate(rows => { window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, MEDIA.filter(m => !['dv', 'dc'].includes(m.id)));
  await page.evaluate(() => { location.hash = '#/growth-song/s4'; });
  const hero = page.locator('[data-gsp-hero]');
  await expect(hero.locator('[data-song-verdict]')).toHaveText('분석한 녹음이 아직 없어요');
  await expect(hero.locator('[data-song-verdict]')).toHaveAttribute('data-song-verdict', 'none');
  await expect(hero.locator('[data-gsp-stats]')).toHaveText(/^녹음 2 · 분석 0/);
  await expect(hero.locator('[data-sa-analyse]')).toHaveText('녹음 분석하기');
  await expect(page.locator('[data-sa-tabs]')).toBeHidden();
  const card = page.locator('[data-sa-empty]');
  await expect(card).toContainText('녹음을 분석하면 여기 보여요');
  await expect(card.locator('[data-sa-analyse]')).toHaveText('녹음 2개 분석하기');
  await expect(page.locator('[data-song-section="changes"]')).toBeHidden();
  expect(await page.locator('[data-lab]').evaluate(el => (el.innerText.match(/아직 없어요/g) || []).length)).toBe(1);
  await expect(page.locator('.sa-rows .sa-row')).toHaveText([/녹음 2개\s*들어 보기/, /듣고 고르기/, /레슨 지적\s*이 곡 지적 0개/]);
  // 녹음 분석하기: the existing on-device analysis of each take, saved; then the screen is the whole one.
  await page.evaluate(() => { VZ.analyzeRecording = async m => { const a = (await VZ.media.list()).find(x => x.id === 'e1').analysis; await VZ.media.update(m, {analysis:a}, {quiet:true}); return {summary:a}; }; });
  // 녹음 2개 · 들어 보기 opens 녹음별 with the tabs.
  await page.locator('[data-sa-go="takes"]').click();
  await expect(page.locator('[data-sa-tabs]')).toBeVisible();
  await expect(page.locator('[data-sa-tab="takes"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.vl-dates [data-date]')).toHaveCount(2);
  await page.locator('[data-sa-tab="flow"]').click();
  await page.locator('[data-sa-empty] [data-sa-analyse]').click();
  await expect(page.locator('[data-sa-empty]')).toHaveCount(0);
  await expect(page.locator('[data-song-section="changes"]')).toBeVisible();
  await expect(hero.locator('[data-gsp-stats]')).toHaveText(/^녹음 2 · 분석 2/);
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

for (const w of [320, 390, 430]) test(w + 'px: no tab runs off the screen; the buttons are at least 44px; light, no dark background', async ({page}) => {
  await page.setViewportSize({width:w, height:800});
  await boot(page);
  await open(page, 's5');
  for (const k of ['flow', 'takes', 'weak', 'next']) {
    await tab(page, k);
    if (k === 'flow') await page.locator('[data-song-fold="detail"] > summary').click();
    if (k === 'takes') { await page.locator('[data-sa-take-detail]').click(); await page.locator('[data-song-section="deep"] > summary').click(); await page.locator('[data-compare-panel] > summary').click(); }
    if (k === 'weak') await page.locator('[data-song-fold="ab"] > summary').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), k).toBeLessThanOrEqual(w);
    const outside = await page.evaluate(() => [...document.querySelectorAll('[data-lab] *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.vl-dates,.vl-metrics,.vl-plot-scroll,.sa-tabs'); }).map(e => e.tagName + '.' + e.className).slice(0, 5));
    expect(outside, k).toEqual([]);
    for (const b of await page.locator('[data-lab] [data-sa-panel="' + k + '"] button, [data-lab] [data-sa-panel="' + k + '"] a, [data-lab] [data-gsp] button, [data-lab] [data-gsp] a, [data-sa-tab]').all())
      if (await b.isVisible() && !(await b.evaluate(el => el.closest('.vl-plot-dates,.np-list,.growth-ab-panel,.gc-host,.sheet,.info-btn')))) expect((await b.boundingBox()).height, k + ' ' + await b.evaluate(el => el.outerHTML.slice(0, 200))).toBeGreaterThanOrEqual(44);
    // Light everywhere: no dark card or page background on this screen.
    const dark = await page.evaluate(() => [document.body, ...document.querySelectorAll('[data-lab] *')].filter(el => { const c = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g); if (!c || (c[3] != null && +c[3] < .5)) return false; return el.offsetParent !== null && (+c[0] + +c[1] + +c[2]) / 3 < 90; }).map(e => e.tagName + '.' + e.className).slice(0, 5));
    expect(dark, k).toEqual([]);
  }
  // The shared bottom menu and record button are there.
  await expect(page.locator('.v-nav')).toBeVisible();
});

test('움직임 줄이기: no twinkling stars on the hero or the graph', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await boot(page);
  await open(page, 's5');
  await expect(page.locator('[data-gsp-hero] .gsp-stars')).toBeHidden();
  await expect(page.locator('[data-sa-metrics] .gsp-stars')).toBeHidden();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('[data-gsp-hero] .gsp-stars')).toBeAttached();
  expect(await page.locator('[data-gsp-hero] .gsp-stars i').evaluateAll(els => els.map(e => getComputedStyle(e).animationName))).toEqual(['gspTw', 'gspTw', 'gspTw']);
});
