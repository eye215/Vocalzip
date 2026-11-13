// 성장 audit (P1) in the real app at 375px: the vocal lab opens with a selection, each metric speaks in its own
// unit, one take has one whole-recording number (other bases are labelled), 추천 연습 keeps one analyzer version and
// skips what the report shows as improved, the 성장 hero does not contradict itself, 고음 안정성 shows the hold time,
// and 판정 보류 is said once with one reason.
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
/** Open the lab with exactly these takes (the way 전체 녹음 → 분석 does). */
async function openWith(page, song, ids) {
  await page.evaluate(ids => sessionStorage.setItem('vocalzip-vocal-lab-selected-media-v1', JSON.stringify(ids)), ids);
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/' + song + '?selection=1');
  await expect(page.locator('.vl-dates button[aria-pressed="true"]')).toHaveCount(ids.length);
}
const pressed = page => page.locator('.vl-dates button[aria-pressed="true"]');
const count = (text, word) => text.split(word).length - 1;
test.use({viewport:{width:375, height:812}});
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('vocal lab opens with the newest analysed takes selected; explicit selections still win', async ({page}) => {
  await boot(page);
  // 곡 상세의 "녹음 N개 · 분석과 비교 보기" link: no selection in the URL.
  await page.goto('/#/vocal-lab/s1');
  await expect(pressed(page)).toHaveCount(5);                       // 7 analysed → the newest 5
  expect(await pressed(page).evaluateAll(list => list.map(b => b.dataset.date))).toEqual(['a2', 'a3', 'a4', 'a5', 'a6']);
  await expect(page.locator('.vl-player-head')).toContainText('5 / 5');   // the newest take is the one shown
  await expect(page.locator('#view')).not.toContainText('날짜를 선택해 주세요');
  await expect(page.locator('[data-growth-report]')).toBeVisible();
  // Fewer than 5 analysed: what there is. None analysed: the newest recording, so the player is there.
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s2');
  await expect(pressed(page)).toHaveCount(2);
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s4');
  await expect(pressed(page)).toHaveCount(1);
  expect(await pressed(page).evaluateAll(list => list.map(b => b.dataset.date))).toEqual(['d2']);
  await expect(page.locator('.vl-player')).toBeVisible();
  // Explicit selections from other entry points are kept as they are.
  await openWith(page, 's1', ['a1', 'a6']);
  expect(await pressed(page).evaluateAll(list => list.map(b => b.dataset.date))).toEqual(['a1', 'a6']);
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s1?a=a3&b=a4&compare=1');
  expect(await pressed(page).evaluateAll(list => list.map(b => b.dataset.date))).toEqual(['a3', 'a4']);
  // The person can still clear the selection by hand.
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s2');
  await pressed(page).first().click(); await pressed(page).first().click();
  await expect(page.locator('.vl-empty')).toContainText('날짜를 선택해 주세요');
});

test('녹음별 변화 speaks in each metric\'s unit, and its 판정 보류 reason comes from the growth model', async ({page}) => {
  await boot(page);
  await openWith(page, 's1', ['a5', 'a6']);
  await page.locator('[data-metric="phr"]').click();
  const change = page.locator('.vl-change');
  await expect(change).toHaveText('최근 변화 · 이전보다 0.8초 길어졌어요 · 좋고 나쁨은 판단하지 않아요');
  await expect(change).not.toContainText('cent');                   // was: "이전 대비 상승 0.8 cent"
  await page.locator('[data-metric="into"]').click();
  await expect(change).toHaveText('최근 변화 · 이전보다 감소 3.0 cent · 좋아진 방향');
  // v1 → v2 next to each other: the report's reason, said once.
  await openWith(page, 's1', ['a0', 'a1']);
  const reason = await page.evaluate(() => window.VzipGrowthMetrics.holdLine('version-mixed'));
  await expect(page.locator('.vl-change')).toHaveText('최근 변화 · ' + reason);
  expect(count(await page.locator('.vl-change').innerText(), '판정 보류')).toBe(1);
  // Low confidence: the same sentence as the report row.
  await openWith(page, 's5', ['e1', 'e2']);
  await expect(page.locator('.vl-change')).toHaveText('최근 변화 · ' + await page.evaluate(() => window.VzipGrowthMetrics.holdLine('confidence')));
  await expect(page.locator('[data-growth-row="intonation"] p')).toHaveText(await page.evaluate(() => window.VzipGrowthMetrics.holdText('confidence')));
  // No "판정 보류 … 판정 보류" in any one line of the screen.
  for (const line of (await page.locator('#view').innerText()).split('\n')) expect(count(line, '판정 보류'), line).toBeLessThan(2);
  await expect(page.locator('#view')).not.toContainText('신뢰도/분석 버전 확인');
});

test('one take, one whole-recording number: other bases are labelled; 추천 연습 keeps one version and skips what improved', async ({page}) => {
  await boot(page);
  await openWith(page, 's1', ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  // The latest take (a6) measured ±14 over the whole recording: the trend chart says so…
  await page.locator('[data-metric="into"]').click();
  await expect(page.locator('.vl-plot-dates button').last()).toHaveAttribute('aria-label', /음정 정확도 ±14 cent/);
  // …and the report, which compares the same phrases (±30 → ±11), names its basis and repeats the whole-recording value.
  const row = page.locator('[data-growth-row="intonation"]');
  await expect(row).toContainText('±30 cent → ±11 cent');
  await expect(row.locator('small')).toHaveText('같은 프레이즈 5개 비교 · 녹음 전체로는 ±33 cent → ±14 cent');
  await expect(page.locator('.vl-growth-count')).toHaveText('7개 중 처음·최근 비교');   // was "7개 분석 기준"
  // 추천 연습: v1 (±60) is not mixed into the median of the v2 takes, and the number says what it is.
  const tips = await page.evaluate(async () => VZ.practiceTips(await VZ.media.list(), {songId:'s1'}));
  expect(tips.version).toBe(2);
  expect(tips.count).toBe(6);
  expect(tips.tips.find(t => t.key === 'into')).toMatchObject({value:'±23 cent', basis:'최근 6개 중간값'});   // median of 33 29 25 21 17 14
  expect(tips.tips.find(t => t.key === 'into').reason).toContain('최근 녹음 6개의 중간값');
  // The report right above says 음정 정확도 improved → it is not recommended under it; the reason is said.
  const recommend = page.locator('.vl-recommend');
  await expect(row).toHaveClass(/good/);
  await expect(recommend.locator('.vl-tip summary strong')).not.toContainText(['음정 정확도 연습']);
  await expect(recommend.locator('[data-tip-skipped]')).toHaveText('위 성장 리포트에서 좋아진 방향인 항목(음정 정확도)은 추천에서 뺐어요.');
  // One take selected (no report on screen): the recommendation is there, with its basis.
  await openWith(page, 's1', ['a6']);
  await expect(page.locator('[data-growth-report]')).toHaveCount(0);
  await expect(page.locator('.vl-tip[data-tip="into"] summary small')).toHaveText('음정 오차 · 최근 6개 중간값 ±23 cent');
  await expect(page.locator('[data-tip-skipped]')).toHaveCount(0);
  // s2 got worse: the report says so and the recommendation stays.
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s2');
  await expect(page.locator('[data-growth-row="intonation"]')).toHaveClass(/bad/);
  await expect(page.locator('.vl-tip[data-tip="into"]')).toHaveCount(0);   // only 2 takes: no personal advice yet
  await expect(page.locator('.vl-recommend')).toContainText('3개 이상');
});

test('성장 tab: strength and priority never name the same measure; 고음 안정성 shows the hold time; 판정 보류 once', async ({page}) => {
  await boot(page);
  await page.goto('/#/vocal-growth');
  const hero = page.locator('.growth-hero');
  await expect(hero.locator('[data-growth-strength]')).toHaveAttribute('data-growth-strength', 'intonation');
  await expect(hero.locator('[data-growth-strength] strong')).toHaveText('음정 정확도');
  // 음정 정확도 improved in 2 of 3 songs: the other box names the one song that got worse, not the measure again.
  const watch = hero.locator('[data-growth-watch]');
  await expect(watch).toHaveAttribute('data-growth-watch', 'song');
  await expect(watch.locator('span')).toHaveText('우선 확인할 곡');
  await expect(watch.locator('strong')).toHaveText('On My Own');
  await expect(watch.locator('small')).toHaveText('음정 정확도 · 이 곡만 아쉬운 방향이에요');
  await expect(hero).not.toContainText('변화가 필요한 곡');
  // The big number is an average on the same-phrase basis: it says so.
  await expect(page.locator('[data-growth-metric="intonation"] .growth-stat-sub').first()).toHaveText('같은 프레이즈 기준 · 비교한 3곡의 최근 녹음 평균');
  // 고음 안정성: wobble unchanged, verdict from the hold time → the hold time is on the card.
  const high = page.locator('[data-growth-metric="high"]');
  await expect(high.locator('.growth-state').first()).toHaveText('좋아진 방향');
  await expect(high.locator('.growth-stat-comparison')).toContainText('±12 cent');
  await expect(high.locator('[data-growth-held]')).toContainText('유지 0.8초 → 0.93초 (평균)');
  await high.locator('summary').click();
  await expect(high.locator('.growth-song-rows li').filter({hasText:'Defying Gravity'})).toContainText('±12 cent → ±12 cent · 유지 0.8초 → 1.2초');
  // 판정 보류 is said once per line, with the model's reason (s5: low confidence, s1 has a v1 take that is skipped).
  await page.evaluate(() => document.querySelectorAll('details.growth-measure-help').forEach(d => { d.open = true; }));
  const text = await page.locator('#view').innerText();
  for (const line of text.split('\n')) expect(count(line, '판정 보류'), line).toBeLessThan(2);
  expect(text).toContain(await page.evaluate(() => window.VzipGrowthMetrics.holdText('confidence')));
  await expect(page.locator('[data-growth-metric="intonation"] .growth-stat-hold')).toHaveText('판정 보류 1곡 · ' + await page.evaluate(() => window.VzipGrowthMetrics.holdText('confidence')));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test('small things: AI label after an error, chart at the newest point, 44px taps, button spacing', async ({page}) => {
  await boot(page, {overallAiReports:[{id:'overall-ai:all', note:'요약: 저장된 결과예요.', created:1, createdDate:'2026-11-01', analysisCount:3}]});
  // A saved AI result stays on screen after a failed re-run: the button keeps the "again" label.
  await page.goto('/#/vocal-growth');
  await page.evaluate(() => { window.vzipCloudSignedIn = () => true; window.vzipCloudUserId = () => 'u'; window.vzipCloudSessionId = () => 's'; window.vzipCloudCoach = async () => { throw Error('서버 오류'); }; });
  const run = page.locator('[data-overall-ai-run]');
  await expect(run).toHaveText('전체 코치 다시 분석');
  await run.click();
  await expect(page.locator('[data-overall-ai-state]')).toHaveText('서버 오류');
  await expect(run).toHaveText('전체 코치 다시 분석');               // was reset to "AI 전체 종합 분석하기"
  await expect(page.locator('.growth-ai-note')).toContainText('저장된 결과예요');
  // ⓘ: the icon looks small, its hit area (.info-btn::before) is 44px.
  const info = page.locator('[data-growth-metric="intonation"] .info-btn');
  const hit = await info.evaluate(b => { b.scrollIntoView({block:'center'}); const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return [[-20, 0], [20, 0], [0, -20], [0, 20]].map(([dx, dy]) => b.contains(document.elementFromPoint(cx + dx, cy + dy))); });
  expect(hit).toEqual([true, true, true, true]);
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });

  await openWith(page, 's1', ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  // The trend chart is wider than the screen: it shows the newest (active) point, not the oldest.
  const scroll = page.locator('.vl-plot-scroll');
  expect(await scroll.evaluate(e => e.scrollWidth > e.clientWidth && e.scrollLeft > 0)).toBe(true);
  expect(await scroll.evaluate(e => { const b = e.querySelector('.vl-plot-dates [data-point]:last-child').getBoundingClientRect(), r = e.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right + 1; })).toBe(true);
  // …and stays there when the screen re-renders on a tap.
  await page.locator('[data-metric="into"]').click();
  expect(await scroll.evaluate(e => e.scrollLeft > 0)).toBe(true);
  // Peek arrows look 18px wide: a tap up to 44px from the card's edge moves to the neighbour take.
  const head = page.locator('.vl-player-head');
  await expect(head).toContainText('7 / 7');
  const carousel = page.locator('[data-carousel]'), box = await carousel.boundingBox(), top = (await page.locator('.vl-player').boundingBox()).y - box.y + 5;
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0); // the desktop project has no touch: a click there
  const press = position => touch ? carousel.tap({position}) : carousel.click({position});
  await press({x:40, y:top});                     // inside the card, 40px from the left edge
  await expect(head).toContainText('6 / 7');
  await press({x:box.width - 40, y:top});
  await expect(head).toContainText('7 / 7');
  await press({x:box.width / 2, y:top});          // the middle does nothing
  await page.waitForTimeout(200);
  await expect(head).toContainText('7 / 7');
  // The two buttons under 추천 연습 no longer touch.
  const [a, b] = await Promise.all([page.locator('[data-repeat-practice]').boundingBox(), page.locator('[data-ai-exercise]').boundingBox()]);
  expect(a.height).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.y >= a.y + a.height + 8 || b.x >= a.x + a.width + 8).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
