// 성장 개편 안 B, phase 3 — the 곡 tab: 곡 목록 (#/vocal-analysis) and 곡 하나 (#/growth-song/<songId>; 큰 정리 2번 mounted the
// former 보컬 연구소 #/vocal-lab/<songId> there — that address leads to it).
//  - 곡 목록: the songs with an analysed take, most recently sung first, each with ONE word from the verdict every 성장
//    screen shares (app/growth-song-model.js through VZ.growthSong): 좋아진 방향 · 아쉬운 방향 · 비슷함 · 판정 보류 · 녹음 하나.
//  - 곡 하나: 처음 vs 최근 → 녹음 타임라인 → 약한 곳 → 이 곡 다음 연습 → 들어 본 평가 · 두 녹음 비교 → 깊이 보기, in that
//    order, under 기간 and 한마디 (tests/growth-song-page.spec.cjs). The verdict is 이번 달's for the same song,
//    with the same 연습 녹음 포함 switch (one device setting): flipped there, it is flipped here.
//  - 구간 A/B is reachable straight from the song (no 집중 연습 계획 needed); every deeper tool is a row of 깊이 보기.
//  - Older addresses (#/vocal-lab…, #/compare, #/vocal-growth/analysis) and entry points land on the same screen.
// The data set is the invented one of tests/growth-characterization.spec.cjs (er = 연습실 submission, et = 트레이닝 practice
// of the song Home, dv/dc = videos, g1 = in the deleted list). No real recording, lesson or person.
// WebKit: never page.goto() to the address the page is already on (it reloads and the in-page fixtures vanish) — the
// address is changed through location.hash (go()).
const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
require('./legacy-session-mode.cjs')(test);
const {NOW, MEDIA, DB} = require('./growth-characterization.fixture.cjs');
const KEY = 'vocal-zip_mvp_v1', SHOTS = process.env.GB3_SHOTS || '';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});
async function boot(page, {media = MEDIA, db = DB} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(db)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await setMedia(page, media);
}
/** The media list comes straight from the fixture (no files): what the device store would hand to VZ.media.list(). */
const setMedia = (page, media) => page.evaluate(rows => { window.vzipCloudSignedIn = () => false; window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate(); }, media);
const go = async (page, hash, mark) => { await page.evaluate(h => { location.hash = h; }, hash); await expect(page.locator(mark).first()).toBeVisible(); };
const song = async (page, id, query = '') => { await go(page, '#/vocal-lab/' + id + query, '[data-gsp-hero] [data-song-verdict]'); await expect(page).toHaveURL(new RegExp('#/growth-song/' + id)); await expect(page.locator('[data-song-section="changes"] [data-growth-changes-card]')).toBeVisible(); };
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const rows = page => page.locator('[data-hub-songs] [data-hub-song]').evaluateAll(els => els.map(e => [e.dataset.hubSong, e.dataset.hubState, e.querySelector('.growth-hub-chip').textContent]));
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive:true}); await page.screenshot({path:SHOTS + '/' + name + '.png', fullPage:true}); };
/** The text of one 처음·최근 line of 무엇이 달라졌나 for a song: its basis and what moved. */
const line = (page, scope, id) => page.locator(scope + ' [data-gc-song="' + id + '"]').evaluate(el => ({basis:el.querySelector('.gc-basis').textContent, obs:[...el.querySelectorAll('.gc-obs li')].map(li => li.textContent.replace(/\s+/g, ' ').trim())}));
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('곡 목록: 분석한 곡만, 최근에 부른 순으로, 곡마다 한마디 — 녹음 하나와 분석 전도 그대로 말한다', async ({page}) => {
  await boot(page);
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  await expect(page.locator('[data-growth-tab][aria-current="page"]')).toHaveText('곡');
  // The latest analysed take decides the order: a7 11.12, b3 11.11, e2 11.09, dc 11.07, c2 11.04.
  expect(await rows(page)).toEqual([['s1', 'hold', '판정 보류'], ['s2', 'worse', '아쉬운 방향'], ['s5', 'better', '좋아진 방향'], ['s4', 'similar', '비슷함'], ['s3', 'better', '좋아진 방향']]);
  await expect(page.locator('[data-hub-song="s5"] .item-title')).toHaveText('Home');
  await expect(page.locator('[data-hub-song="s5"] .item-sub')).toHaveText('분석한 녹음 4개 · 연습 2개는 빼고 봐요 · 최근 11월 9일');
  await expect(page.locator('[data-hub-song="s5"]')).toHaveAttribute('href', '#/growth-song/s5');   // 곡 하나 (성장 v2 R4)
  await expect(page.locator('[data-hub-rule-note]')).toContainText('이번 달과 같은 기준이에요');
  // The word is the model's, from the takes of the "늘었나" rule (switch off = 결과 리포트's takes).
  const words = await page.evaluate(async () => { const items = await VZ.media.list(), U = window.VzipGrowthChangesUI, S = window.VzipGrowthSong;
    return Object.fromEntries(U.songTakes(items, false).map(s => [s.songId, S.verdict(s).word])); });
  expect(words).toEqual({s1:'판정 보류', s2:'아쉬운 방향', s3:'좋아진 방향', s4:'비슷함', s5:'좋아진 방향'});
  expect(await page.evaluate(async () => { const ds = VZ.growthDataset(await VZ.media.list()); return ds.takes(VZ.growthDataset.verdictRule({practice:false}), 's5').map(t => t.id).sort(); })).toEqual(['e1', 'e2', 'ex', 'ey']);
  for (const a of await page.locator('[data-hub-songs] [data-hub-song]').all()) expect((await a.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // One analysed take: 녹음 하나. Recordings but no analysis: folded as 분석 전, still a way into the song.
  await setMedia(page, MEDIA.filter(m => !['c1', 'dv', 'dc'].includes(m.id)));
  await go(page, '#/growth-changes', '[data-gm-section="changes"]');
  await go(page, '#/vocal-analysis', '[data-hub-song="s3"][data-hub-state="one"]');
  expect((await rows(page)).filter(r => ['s3', 's4'].includes(r[0]))).toEqual([['s3', 'one', '녹음 하나']]);
  await expect(page.locator('[data-hub-waiting] summary')).toHaveText('아직 분석 전인 곡 1');
  const waiting = page.locator('[data-hub-waiting] [data-hub-song="s4"]');
  await expect(waiting).toHaveAttribute('data-hub-state', 'none');
  await expect(waiting.locator('.growth-hub-chip')).toHaveText('분석 전');
  await expect(waiting).toHaveAttribute('href', '#/growth-song/s4');
  // The song without an analysis still opens: its recordings to pick and analyse, and the word says 분석 전.
  await page.locator('[data-hub-waiting] summary').click();
  await waiting.click();
  await expect(page.locator('[data-song-verdict]')).toHaveText('분석 전');
  await expect(page.locator('.vl-dates [data-date]')).toHaveCount(2);
});

test('곡 목록이 길면 제목으로 찾는다', async ({page}) => {
  // Eight songs with an analysed take: the search field appears.
  const extra = ['가을 노래', '겨울 노래', '봄 노래'].map((title, i) => ({id:'x' + i, title}));
  const takes = extra.flatMap((s, i) => [{...MEDIA.find(m => m.id === 'c1'), id:s.id + 'a', songId:s.id, name:'녹음 ' + s.id + 'a'}, {...MEDIA.find(m => m.id === 'c2'), id:s.id + 'b', songId:s.id, name:'녹음 ' + s.id + 'b', recordedDate:'2026-10-2' + i}]);
  await boot(page, {media:[...MEDIA, ...takes], db:{...DB, songs:[...DB.songs, ...extra]}});
  await go(page, '#/vocal-analysis', '[data-hub-q]');
  await expect(page.locator('[data-hub-songs] [data-hub-song]')).toHaveCount(8);
  const q = page.locator('[data-hub-q]');
  expect((await q.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await q.fill('노래');
  expect(await page.locator('[data-hub-songs] [data-hub-song]:visible').evaluateAll(els => els.map(e => e.dataset.hubSong).sort())).toEqual(['x0', 'x1', 'x2']);
  await q.fill('home');                                               // capitals do not matter
  expect(await page.locator('[data-hub-songs] [data-hub-song]:visible').evaluateAll(els => els.map(e => e.dataset.hubSong))).toEqual(['s5']);
  await q.fill('없는 제목');
  await expect(page.locator('[data-hub-songs] [data-hub-song]:visible')).toHaveCount(0);
  await expect(page.locator('[data-hub-search-empty]')).toBeVisible();
  await q.fill('');
  await expect(page.locator('[data-hub-songs] [data-hub-song]:visible')).toHaveCount(8);
  await expect(page.locator('[data-hub-search-empty]')).toBeHidden();
  // Five songs: no field.
  await setMedia(page, MEDIA);
  await go(page, '#/growth-changes', '[data-gm-section="changes"]');
  await go(page, '#/vocal-analysis', '[data-hub-song="s5"]');
  await expect(page.locator('[data-hub-songs] [data-hub-song]')).toHaveCount(5);
  await expect(page.locator('[data-hub-q]')).toHaveCount(0);
});

test('곡 하나: 처음 vs 최근 → 녹음 타임라인 → 약한 곳 → 다음 연습 → 두 녹음 비교 → 깊이 보기, 안의 순서도 정해져 있다', async ({page}) => {
  await boot(page);
  await song(page, 's5');
  await expect(page.locator('#top h1')).toHaveText('곡');
  await expect(page.locator('[data-gsp-hero] h2')).toHaveText('Home');
  expect(await page.locator('[data-song-section]').evaluateAll(els => els.map(e => [e.dataset.songSection, e.querySelector('h2').textContent]))).toEqual(
    [['changes', '처음 vs 최근'], ['takes', '녹음 타임라인'], ['weak', '약한 곳'], ['next', '이 곡 다음 연습'], ['compare', '들어 본 평가 · 두 녹음 비교'], ['deep', '깊이 보기']]);
  // Inside 처음 vs 최근: the switch, the measures, 처음·최근 (무엇이 달라졌나 for this song), 지난달 대비; then the recordings.
  const order = await page.evaluate(() => { const marks = ['[data-song-section="changes"] [data-song-practice]', '[data-song-section="changes"] [data-growth-report]', '[data-song-section="changes"] [data-growth-changes-card] [data-gc-song="s5"]', '[data-song-section="changes"] [data-song-month]', '[data-song-section="takes"] .vl-dates', '[data-song-section="takes"] [data-carousel]', '[data-song-section="takes"] [data-song-fold="take"]', '[data-song-section="deep"] [data-song-fold="trend"]'];
    const els = marks.map(m => document.querySelector(m)); return els.map((el, i) => !el ? 'missing ' + marks[i] : i && !(els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'out of order ' + marks[i] : 'ok'); });
  expect(order).toEqual(Array(8).fill('ok'));
  await expect(page.locator('[data-song-verdict]')).toHaveText('좋아진 방향');
  await expect(page.locator('[data-song-verdict]')).toHaveAttribute('data-song-verdict', 'better');
  await expect(page.locator('[data-song-basis]')).toHaveText('좋아진 지표: 음정 정확도');
  await expect(page.locator('[data-song-rule]')).toContainText('이번 달과 같은 기준이에요');
  // The measures are the rows of that one pair (e1 10.05 → e2 11.09); the 연습 takes of 11.07 · 11.08 are not in it.
  await expect(page.locator('[data-growth-count]')).toHaveText('4개 중 처음·최근 비교');
  await expect(page.locator('.vl-growth-intro')).toContainText('처음(10.05)과 최근(11.09) 녹음을 지표마다 나눠 봤어요');
  expect(await page.locator('[data-growth-report] [data-growth-row]').evaluateAll(els => els.map(e => e.dataset.growthRow).sort())).toEqual(['high', 'intonation', 'phrase', 'range', 'stability']);
  await expect(page.locator('[data-growth-report] [data-growth-row="intonation"]')).toHaveClass(/good/);
  await expect(page.locator('[data-growth-report] [data-growth-row="intonation"] p')).toHaveText('±20 cent → ±15 cent');
  // The timeline: every take of the song with its mark (처음 · 최근 of the verdict), the newest analysed ones open, a
  // player for the active one.
  expect(await page.locator('.vl-dates [data-date]').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()))).toEqual(['10.05', '11.05', '11.06', '11.07 연습', '11.08 연습', '11.09']);
  expect(await page.locator('.vl-dates [data-pair]').evaluateAll(els => els.map(e => e.dataset.date + ':' + e.dataset.pair))).toEqual(['e1:처음', 'e2:최근']);
  await expect(page.locator('[data-carousel] .vl-play')).toBeVisible();
  // The per-take detail is folded; this screen's own per-take chart is in 깊이 보기, and says what it is.
  await expect(page.locator('[data-song-fold="take"]')).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-song-section="deep"]')).not.toHaveAttribute('open', '');
  await page.locator('[data-song-section="deep"] > summary').click();
  await expect(page.locator('[data-song-fold="trend"] summary')).toContainText('고른 녹음을 바로 앞 녹음과 견준 참고 그래프');
  await page.locator('[data-song-fold="trend"] summary').click();
  await expect(page.locator('[data-song-trend-basis]')).toContainText('위 ‘처음 vs 최근’과는 기준이 달라요');
  await expect(page.locator('.vl-trend .vl-plot-dates button').first()).toBeVisible();
  await page.locator('[data-song-fold="take"] summary').click();
  await expect(page.locator('.vl-segment')).toBeVisible();
  // A date tapped: that take plays, 이 녹음 자세히 stays open, and a redraw keeps the folds as they are.
  await page.locator('.vl-dates [data-date="e1"]').click();
  await expect(page.locator('.vl-dates [data-date="e1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.vl-player-title strong')).toHaveText('녹음 e1');
  await expect(page.locator('[data-song-fold="take"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-song-fold="trend"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-song-section="deep"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-song-deep="reports"]')).toBeVisible();
  // Tapped again while it plays: it leaves the chosen takes.
  await page.locator('.vl-dates [data-date="e1"]').click();
  await expect(page.locator('.vl-dates [data-date="e1"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('판정은 이번 달과 같다: 같은 곡의 처음·최근 줄과 지난달 대비, 목록의 한마디까지', async ({page}) => {
  await boot(page);
  // 달라진 것 자세히 › 전체 › 곡별 Home: the song screen, its 처음·최근 line.
  await page.evaluate(() => { localStorage.setItem('vzip:growth-period', 'all'); });
  await go(page, '#/growth-changes', '[data-gm-section="changes"] [data-gm-scope="song"]');
  await page.locator('[data-gm-scope="song"]').click();
  await page.locator('[data-mbs-song="s5"]').click();
  await expect(page).toHaveURL(/#\/growth-song\/s5$/);
  await expect(page.locator('[data-song-section="changes"] [data-gc-song="s5"]')).toBeVisible();
  const overall = await line(page, '[data-song-section="changes"]', 's5');
  expect(overall.basis).toBe('같은 곡 Home · 녹음 그대로 잰 녹음 4개 중 처음·최근 · 10월 → 11월');
  // 지난달 대비: this month against the latest take before it — the line 이번 달 shows for the song.
  const month = await page.evaluate(async () => VZ.growthSong.month(await VZ.media.list(), 's5', false));
  await expect(page.locator('[data-song-month] strong')).toHaveText('지난달 대비');
  await expect(page.locator('[data-song-month] span')).toHaveText(month.word + ' · ' + month.text);
  await expect(page.locator('[data-song-month] small')).toHaveText(month.basis);
  // 뒤로 returns to 나 › 곡마다 자세히 (the old 달라진 것 자세히 leads there), where it was opened from.
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth\?period=all&changes=1$/);
  // 월별 › 곡별 Home: the song screen at this month's chip, with that month's line (지난 기간 vs 이번 기간).
  await page.locator('[data-gm-period="month"]').click();
  await expect(page.locator('[data-gm-section="changes"] [data-gc-song="s5"] .gc-basis')).toContainText('지난 기간 마지막 녹음과 이번 기간');
  const monthLine = await line(page, '[data-gm-section="changes"]', 's5');
  await page.locator('[data-gm-scope="song"]').click();
  await page.locator('[data-mbs-song="s5"]').click();
  await expect(page).toHaveURL(/#\/growth-song\/s5\?month=2026-11$/);
  await expect(page.locator('[data-gsp-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-gsp-hero] .gsp-chip')).toHaveText(month.word);
  await expect(page.locator('[data-song-section="changes"] [data-gc-song="s5"]')).toBeVisible();
  expect(await line(page, '[data-song-section="changes"]', 's5')).toEqual(monthLine);
  // Every analysed song: the word of the list is the word of its screen; a song 이번 달 leaves out is 판정 보류 here too.
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  const list = await rows(page);
  for (const [id, state, word] of list) {
    await song(page, id);
    await expect(page.locator('[data-song-verdict]')).toHaveText(word);
    await expect(page.locator('[data-song-verdict]')).toHaveAttribute('data-song-verdict', state);
  }
  await song(page, 's1');
  await expect(page.locator('[data-song-basis]')).toHaveText('최근 녹음은 AI 분리 후, 그 전 녹음은 녹음 그대로 잰 것이라 비교하지 않아요 · 같은 방법으로 잰 녹음끼리만 비교해요');
  await expect(page.locator('[data-song-section="changes"] [data-gc-excluded-item="song:s1"]')).toHaveAttribute('data-reason', 'method-mixed');
  await expect(page.locator('[data-growth-report] [data-growth-row]')).toHaveCount(0);       // no pair, no measure rows
  await expect(page.locator('[data-song-month]')).toHaveCount(0);
});

test('연습 녹음 포함은 설정 하나: 이번 달에서 켜면 여기도 켜져 있고, 판정이 바뀌면 한 줄로 말한다', async ({page}) => {
  // Home with one song take (10.05) and the two 연습 takes (11.07 트레이닝, 11.08 연습실).
  await boot(page, {media:MEDIA.filter(m => !['e2', 'ex', 'ey'].includes(m.id))});
  const expected = await page.evaluate(async () => { const x = VZ.growthSong.of(await VZ.media.list(), 's5', false); return {off:x.off.word, on:x.on.word, onState:x.on.state, effect:x.effect}; });
  expect(expected.off).toBe('녹음 하나');
  expect(expected.on).not.toBe('녹음 하나');
  expect(expected.effect).toMatch(/^연습 녹음을 넣으면 ‘.+’(으)?로 바뀌어요\.$/);
  // Off (the default) here.
  await song(page, 's5');
  await expect(page.locator('[data-song-practice]')).not.toBeChecked();
  await expect(page.locator('[data-song-verdict]')).toHaveText('녹음 하나');
  await expect(page.locator('[data-song-practice-note]')).toHaveText('곡 녹음만 견줘요. 노래 연습실·트레이닝 연습 녹음은 빼요.');
  await expect(page.locator('[data-song-practice-effect]')).toHaveText(expected.effect);
  await expect(page.locator('[data-song-section="changes"] [data-gc-song="s5"]')).toHaveCount(0);
  // Flip it in 이번 달…
  await go(page, '#/growth-changes', '[data-gm-practice]');
  await page.locator('[data-gm-practice]').check();
  await expect(page.locator('[data-gm-practice-note]')).toContainText('노래 연습실·트레이닝 연습 녹음도 넣어 견줘요');
  // …and it is on here: the 연습 takes are counted, the word moved, and the line says so.
  await song(page, 's5');
  await expect(page.locator('[data-song-practice]')).toBeChecked();
  await expect(page.locator('[data-song-verdict]')).toHaveText(expected.on);
  await expect(page.locator('[data-song-practice-effect]')).toHaveText(new RegExp('^연습 녹음을 넣어서 ‘녹음 하나’에서 ‘' + expected.on + '’(으)?로 바뀌었어요\\.$'));
  await expect(page.locator('[data-song-section="changes"] [data-gc-song="s5"] .gc-basis')).toContainText('· 10월 → 11월');
  await expect(page.locator('[data-growth-count]')).toHaveText('3개 중 처음·최근 비교');
  // The list agrees.
  await go(page, '#/vocal-analysis', '[data-hub-song="s5"]');
  await expect(page.locator('[data-hub-practice]')).toBeChecked();
  await expect(page.locator('[data-hub-song="s5"] .growth-hub-chip')).toHaveText(expected.on);
  await expect(page.locator('[data-hub-song="s5"] .item-sub')).toContainText('분석한 녹음 3개 (연습 2개 포함)');
  // Off again from the song: 이번 달 follows.
  await song(page, 's5');
  await page.locator('[data-song-practice]').uncheck();
  await expect(page.locator('[data-song-verdict]')).toHaveText('녹음 하나');
  await expect(page.locator('[data-song-practice]')).toBeFocused();
  await go(page, '#/growth-changes', '[data-gm-practice]');
  await expect(page.locator('[data-gm-practice]')).not.toBeChecked();
  // A song the switch does not change says nothing about it.
  await song(page, 's2');
  await expect(page.locator('[data-song-practice-effect]')).toHaveCount(0);
});

test('약한 곳: 파사지오 참고, 음높이 확인 구간, 레슨 지적, 그리고 계획 없이 바로 여는 구간 A/B', async ({page}) => {
  const day = 86400000, at = Date.parse('2026-11-10T20:00:00+09:00');
  const points = [
    {id:'point:p1', kind:'score-point', songId:'s5', measures:{from:12, to:14}, text:'끝음을 끝까지 유지하기', created:at - 9 * day, updatedAt:at - 9 * day},
    {id:'point:p2', kind:'score-point', songId:'s5', measures:{from:20, to:20}, text:'숨을 미리 쉬기', created:at - 9 * day, updatedAt:at - 9 * day},
    {id:'point-run:r1', kind:'score-point-run', songId:'s5', date:'2026-11-08', at:at - 2 * day, results:{'point:p1':'missed', 'point:p2':'kept'}, updatedAt:at - 2 * day},
    {id:'point-run:r2', kind:'score-point-run', songId:'s5', date:'2026-11-10', at, results:{'point:p1':'missed', 'point:p2':'kept'}, updatedAt:at}
  ];
  // No 집중 연습 계획 at all: 구간 A/B used to need one.
  await boot(page, {db:{...DB, practicePlans:[], scoreAnnotations:points}});
  await song(page, 's5');
  const weak = page.locator('[data-song-section="weak"]');
  // 파사지오: a reference, never a row of the verdict.
  await expect(weak.locator('[data-growth-row="passaggio"]')).toContainText('참고');
  await expect(weak.locator('[data-growth-row="passaggio"] small')).toHaveText('음정 데이터만으로 판별 불가, 선생님 판단 참고');
  await expect(page.locator('[data-growth-report] [data-growth-row="passaggio"]')).toHaveCount(0);
  // 음높이 확인 구간: candidates from one recording (the analyser is stubbed: no audio in this data set).
  await page.evaluate(() => { VZ.analyzeRecording = async m => ({summary:m.analysis, seconds:120, fps:50, curve:[],
    notes:[{t:12, dur:1.2, dev:38, midi:64}, {t:40, dur:.9, dev:-31, midi:67}, {t:70, dur:1, dev:6, midi:65}]}); });
  await expect(weak.locator('[data-weak-take] option')).toHaveText([/^11\.09/, /^11\.08/, /^11\.07/, /^11\.06/, /^11\.05/, /^10\.05/]);
  expect((await weak.locator('[data-weak-find]').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await weak.locator('[data-weak-find]').click();
  await expect(weak.locator('[data-weak-results]')).toContainText('음높이 확인 후보 2개');
  await expect(weak.locator('[data-weak-play]')).toHaveText([/0:10–0:16/, /0:38–0:43/]);
  await expect(weak.locator('.vl-weak-item').first()).toContainText('가까운 반음과 +38 cent · 정답 판정 아님');
  // 레슨 지적: how many, how the last checks went (the most missed first), and 부르면서 체크.
  await expect(weak.locator('[data-weak-points-sum]')).toHaveText('지적 2개 · 최근 체크 4번 중 2번 지켰어요');
  expect(await weak.locator('[data-weak-point]').evaluateAll(els => els.map(e => e.textContent))).toEqual(['12–14마디끝음을 끝까지 유지하기최근 2번 중 0번 지켰어요', '20마디숨을 미리 쉬기최근 2번 중 2번 지켰어요']);
  const start = weak.locator('[data-pts-start]');
  await expect(start).toHaveText('부르면서 체크');
  expect((await start.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // 구간 A/B: the panel of 집중 연습 계획, here without a plan.
  expect(await page.evaluate(() => (VZ.db.practicePlans || []).length)).toBe(0);
  const ab = weak.locator('[data-song-fold="ab"]');
  expect((await ab.locator('summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await ab.locator('summary').click();
  await expect(ab.locator('.growth-ab-panel h4')).toHaveText('같은 곡 A/B 구간 비교');
  await expect(ab.locator('[data-ab-record="0"]')).toHaveValue('e1');
  await expect(ab.locator('[data-ab-record="1"]')).toHaveValue('e2');
  await expect(ab.locator('[data-ab-run]')).toBeVisible();
  // What is typed there survives a tap elsewhere on the screen (another take picked).
  await ab.locator('[data-ab-start="0"]').fill('15');
  await page.locator('.vl-dates [data-date="ex"]').click();
  await expect(ab.locator('[data-ab-start="0"]')).toHaveValue('15');
  await expect(weak.locator('[data-weak-results]')).toContainText('음높이 확인 후보 2개');
  // 이 구간 들어 보고 평가 남기기 hands both sections to the listening sheet.
  await ab.locator('[data-ab-listen]').click();
  await expect(page.locator('.sheet [data-lc]')).toBeVisible();
  await expect(page.locator('.sheet [data-lc-take="x"]')).toHaveValue('e1');
  await page.locator('.sheet [data-close]').click();
  await expect(page.locator('.sheet [data-lc]')).toHaveCount(0);
  await ab.locator('summary').click();
  await expect(ab.locator('.growth-ab-panel')).toHaveCount(0);
  // 부르면서 체크 opens the run of the song page.
  await start.click();
  await expect(page.locator('[data-pts-run]')).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('두 녹음 비교: 아무 두 녹음이나 골라 가리고 듣고 평가, 측정값 나란히 보기', async ({page}) => {
  await boot(page);
  await song(page, 's5');
  const cmp = page.locator('[data-song-section="compare"]');
  // Every recording of the song can be picked (연습 marked), not only the ones open above.
  await expect(cmp.locator('[data-compare-a] option')).toHaveCount(6);
  await expect(cmp.locator('[data-compare-a] option').nth(3)).toContainText('(연습)');
  await cmp.locator('[data-compare-a]').selectOption('e1');
  await cmp.locator('[data-compare-b]').selectOption('er');
  const entry = cmp.locator('[data-listen-open]');
  await expect(entry).toContainText('가리고 듣고 평가하기');
  await expect(entry).toHaveAttribute('data-a', 'e1');
  await expect(entry).toHaveAttribute('data-b', 'er');
  expect((await entry.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // A take picked here joins the chips above, so the player can switch to it.
  await expect(page.locator('.vl-dates [data-date="e1"]')).toHaveAttribute('aria-pressed', 'true');
  await entry.click();
  const sheet = page.locator('.sheet [data-lc]');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-lc-take="x"]')).toHaveValue('e1');
  await expect(sheet.locator('[data-lc-take="y"]')).toHaveValue('er');
  await expect(sheet.locator('[data-lc-blind]')).toBeChecked();                       // 가리고 듣기 by default
  await expect(sheet.locator('[data-lc-verdict]')).toContainText('들어 보니 어때요');
  await page.locator('.sheet [data-close]').click();
  await expect(sheet).toHaveCount(0);
  // 측정값 나란히 보기 · 메모: the table and the memo of that pair.
  await cmp.locator('[data-compare-panel] > summary').click();
  await expect(cmp.locator('[data-compare-switch]')).toBeVisible();
  await expect(cmp.locator('[data-compare-form] textarea[name="notes"]')).toBeVisible();
  await cmp.locator('[data-compare-first]').click();
  await expect(cmp.locator('[data-compare-a]')).toHaveValue('e1');
  await expect(cmp.locator('[data-compare-b]')).toHaveValue('e2');
  await expect(cmp.locator('[data-compare-panel]')).toHaveAttribute('open', '');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('깊이 보기: 소리 길 흔적, MR로 다시 분석, 정밀 리포트, 보관함, 리포트 저장, 같은 날 녹음 세기, 분석 기준', async ({page}) => {
  await boot(page);
  await song(page, 's5');
  const deep = page.locator('[data-song-section="deep"]');
  await expect(deep).not.toHaveAttribute('open', '');
  expect((await deep.locator('> summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await deep.locator('> summary').click();
  await expect(deep.locator('[data-voice-path-link]')).toHaveAttribute('href', '#/voice-path/s5?b=e2');
  await expect(deep.locator('[data-song-deep="mr-add"]')).toHaveAttribute('href', '#/song/s5?tab=ar');       // no MR file on this song yet
  await expect(deep.locator('[data-song-deep="mr-add"]')).toContainText('MR로 다시 분석');
  await expect(deep.locator('[data-song-deep="precision"]')).toHaveAttribute('href', '#/precision-report');
  await expect(deep.locator('[data-precision-lab-entry]')).toHaveCount(1);                                    // one link, not two
  await expect(deep.locator('[data-song-deep="reports"]')).toHaveAttribute('href', '#/lab-reports');
  await expect(deep.locator('[data-song-deep="basis"]')).toHaveAttribute('href', '#/growth-basis');
  await expect(deep.locator('[data-song-deep="library"]')).toHaveAttribute('href', '#/library');
  await expect(deep.locator('[data-song-deep="song"]')).toHaveAttribute('href', '#/song/s5');
  for (const a of await deep.locator('a.vl-report').all()) expect((await a.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // 같은 날 녹음 세기: chosen here, said to change the per-take chart only — the verdict stays.
  await expect(deep.locator('[data-same-day]')).toHaveValue('all');
  await expect(deep.locator('[data-same-day-scope]')).toContainText('‘처음 vs 최근’ 판정은 바뀌지 않아요');
  await deep.locator('[data-same-day]').selectOption('average');
  await expect(deep.locator('[data-same-day]')).toHaveValue('average');
  await expect(page.locator('[data-song-verdict]')).toHaveText('좋아진 방향');
  await expect(page.locator('[data-growth-count]')).toHaveText('4개 중 처음·최근 비교');
  await deep.locator('[data-same-day]').selectOption('all');
  // 리포트 저장 → 보관함, and back to this song from there.
  await deep.locator('[data-save-report]').click();
  await expect.poll(() => page.evaluate(() => (VZ.db.comparisonReports || []).filter(r => r.kind === 'vocal-lab' && r.songId === 's5').length)).toBe(1);
  await deep.locator('[data-song-deep="reports"]').click();
  await expect(page).toHaveURL(/#\/lab-reports$/);
  await page.locator('.vl-reports .vl-report').first().click();
  await expect(page).toHaveURL(/#\/growth-song\/s5\?report=/);
  await expect(page.locator('[data-song-verdict]')).toHaveText('좋아진 방향');
  // 깊이 보기 stays open on this device once opened; the ⋯ menu still has 보관함 and 곡 상세.
  await expect(page.locator('[data-song-section="deep"]')).toHaveAttribute('open', '');
  await page.locator('[data-lab-more]').click();
  await expect(page.locator('.vz-choice[href="#/lab-reports"]')).toBeVisible();
  await expect(page.locator('.vz-choice[href="#/song/s5"]')).toBeVisible();
});

test('옛 주소와 들어오는 곳: 모두 같은 화면에 닿는다', async ({page}) => {
  await boot(page);
  // A bare #/vocal-lab and the old tab address → 곡 목록.
  await go(page, '#/vocal-lab', '[data-hub-song]');
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await go(page, '#/vocal-growth/analysis', '[data-hub-song]');
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  // A pair in the address: those takes are open and 두 녹음 비교 has them, with 측정값 나란히 보기 open.
  await song(page, 's1', '?a=a2&b=a5&compare=1');
  expect(await page.locator('.vl-dates [aria-pressed="true"]').evaluateAll(els => els.map(e => e.dataset.date))).toEqual(['a2', 'a5']);
  await expect(page.locator('[data-compare-a]')).toHaveValue('a2');
  await expect(page.locator('[data-compare-b]')).toHaveValue('a5');
  await expect(page.locator('[data-compare-panel]')).toHaveAttribute('open', '');
  // #/compare?a=&b= (older comparison links) → the same.
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  await page.evaluate(() => { location.hash = '#/compare?a=a2&b=a5'; });
  await expect(page).toHaveURL(/#\/growth-song\/s1\?a=a2&b=a5&compare=1$/);
  await expect(page.locator('[data-song-section="compare"] [data-compare-a]')).toHaveValue('a2');
  // 전체 녹음 › 선택 › 분석 (VZ.openAnalysisSelection): the chosen takes are open and their chart is unfolded.
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  await page.evaluate(async () => { VZ.openAnalysisSelection((await VZ.media.list()).filter(m => ['e1', 'ey', 'e2'].includes(m.id))); });
  await expect(page).toHaveURL(/#\/growth-song\/s5\?selection=1$/);
  await expect(page.locator('[data-song-verdict]')).toHaveText('좋아진 방향');
  expect(await page.locator('.vl-dates [aria-pressed="true"]').evaluateAll(els => els.map(e => e.dataset.date))).toEqual(['e1', 'ey', 'e2']);
  await expect(page.locator('[data-song-fold="trend"]')).toHaveAttribute('open', '');
  await expect(page.locator('.vl-trend .vl-plot-dates button')).toHaveCount(3);
  // 뒤로 from the song goes back to where it was opened.
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  // The dark song screen, as before: no bottom menu on it.
  await song(page, 's5');
  await expect(page.locator('.v-nav')).toBeHidden();
});

for (const [w, h] of [[390, 844], [820, 1180], [1180, 820]]) test('화면 폭 ' + w + '×' + h + ': 가로로 넘치지 않고, 누르는 곳은 44px 이상', async ({page}) => {
  await page.setViewportSize({width:w, height:h});
  await boot(page);
  await go(page, '#/vocal-analysis', '[data-hub-song]');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect((await page.locator('.growth-hub-switch').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await shot(page, 'list-' + w + 'x' + h);
  await song(page, 's5');
  await shot(page, 'song-' + w + 'x' + h);
  // Everything unfolded: still inside the screen.
  for (const sel of ['[data-song-fold="take"] > summary', '[data-song-section="deep"] > summary', '[data-song-fold="trend"] > summary', '[data-song-fold="ab"] > summary', '[data-compare-panel] > summary']) await page.locator(sel).click();
  await expect(page.locator('.growth-ab-panel')).toBeVisible();
  await expect(page.locator('[data-song-deep="basis"]')).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const outside = await page.evaluate(() => [...document.querySelectorAll('[data-lab] *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.vl-dates,.vl-metrics,.vl-plot-scroll'); }).map(e => e.tagName + '.' + e.className).slice(0, 5));
  expect(outside).toEqual([]);
  for (const sel of ['[data-gsp-period]', '[data-gsp-play]', '.vl-switch', '.vl-fold > summary', '[data-song-section="deep"] > summary', '.vl-dates [data-date]', '[data-weak-find]', '[data-weak-take]', '[data-compare-a]', '[data-compare-first]', '[data-listen-open]', '[data-compare-panel] > summary', '[data-same-day]', '[data-save-report]', '[data-gc-play]'])
    for (const el of await page.locator('[data-lab] ' + sel).all()) { const box = await el.boundingBox(); expect(box && box.height, sel).toBeGreaterThanOrEqual(44); }
  // The light cards inside the dark screen keep dark text on white.
  expect(await page.locator('.vl-light .gc-basis').first().evaluate(el => [getComputedStyle(el).color, getComputedStyle(el.closest('.growth-panel')).backgroundColor])).toEqual(['rgb(102, 112, 133)', 'rgb(255, 255, 255)']);
  await shot(page, 'song-open-' + w + 'x' + h);
});
