// 성장 통합 탭 (#385, docs/audit/2026-11-13-growth-unification.md PR B) in the real app: one 성장 menu with three tabs —
// since 성장 개편 안 B: 이번 달 · 곡 · 연구소 (곡 is the former 보컬 분석; 연구소 is the second-tier tools since phase 4 —
// the former 보컬 트레이닝 practice screens are on 오늘 › 연습하기, tests/growth-b4-lab.spec.cjs), the period control inside
// 이번 달 and inside its sub-page 지난 흐름 (the former 결과 리포트), every older link
// still opening its own screen or leading into the new tabs, counts shown as they are (분석 전 is said, never a made-up
// result). Fake data only.
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

test('성장 opens on 이번 달 with three tabs; the period control stays a separate control inside it', async ({page}) => {
  await page.setViewportSize({width:375, height:812});
  await boot(page);
  await page.locator('.v-nav a[data-nav="growth"]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(page.locator('#top h1')).toHaveText('성장');
  await expect(tabs(page)).toHaveText(['나', '곡', '기록']);
  await expect(current(page)).toHaveText('나');
  await expect(page.locator('[data-gm-period="month"]')).toHaveAttribute('aria-pressed', 'true');   // 월별 by default
  await page.locator('[data-gm-period="week"]').click();
  await expect(page.locator('[data-gm-section="done"] h2')).toHaveText('이번 주에 한 것');
  await expect(current(page)).toHaveText('나');           // changing the period redraws the content, not the tabs
  expect(await page.evaluate(() => { const t = document.querySelector('.growth-top-tabs').getBoundingClientRect(), p = document.querySelector('.growth-view-tabs').getBoundingClientRect(); return t.bottom <= p.top; })).toBe(true);
  for (const a of await tabs(page).all()) expect((await a.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // The former 결과 리포트 (전체 · 월별 · 주간) is 지난 흐름, a sub-page of 이번 달.
  await page.locator('[data-gm-flow]').click();
  await expect(page).toHaveURL(/#\/growth-flow\?period=week$/);
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-ws-tab="#/growth-flow?period=all"]').click();
  await expect(page.locator('[data-overall-body]')).toBeVisible();
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(page.locator('[data-gm-period="week"]')).toHaveAttribute('aria-pressed', 'false');   // 지난 흐름's last period is kept
  await expect(page.locator('[data-gm-period="all"]')).toHaveAttribute('aria-pressed', 'true');
  expect(page.__errors).toEqual([]);
});

test('곡: songs with an analysed take and their real counts (the rest folded as 분석 전), then 곡 하나; 뒤로 returns to the tab', async ({page}) => {
  await page.setViewportSize({width:375, height:812});
  await boot(page, {comparisonReports:[{id:'r1', kind:'vocal-lab', songId:'s1', song:'Defying Gravity', created:Date.now(), mediaIds:['a5', 'a6'], snapshots:[]}]});
  await page.goto('/#/vocal-growth');
  await tabs(page).nth(1).click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await expect(current(page)).toHaveText('곡');
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.v-nav')).toBeVisible();
  const rows = page.locator('[data-hub-song]');
  await expect(rows).toHaveCount(5);
  // Songs with an analysed take, the most recently sung first: s1 (yesterday), s2 (2 days), s3 (3), s5 (5). s4 has
  // recordings but no analysis: it waits in its own fold (성장 개편 phase 3).
  expect(await page.locator('[data-hub-songs] [data-hub-song]').evaluateAll(els => els.map(e => e.dataset.hubSong))).toEqual(['s1', 's2', 's3', 's5']);
  expect(await rows.evaluateAll(els => els.map(e => e.dataset.hubSong))).toEqual(['s1', 's2', 's3', 's5', 's4']);
  await expect(rows.nth(0)).toContainText('Defying Gravity');
  await expect(rows.nth(0)).toContainText('분석한 녹음 7개 · 최근 ');
  // Unanalysed takes are said (the 분석 전 chip), not scored; the count line then has no analysis part.
  await expect(page.locator('[data-hub-waiting] summary')).toHaveText('아직 분석 전인 곡 1');
  await expect(rows.nth(4).locator('.growth-hub-chip')).toHaveText('분석 전');
  await expect(rows.nth(4).locator('.item-sub')).toHaveText(/^녹음 2개 · 최근 /);
  await expect(page.locator('[data-hub-reports]')).toContainText('저장한 리포트 1개');
  await expect(page.locator('[data-hub-reports]')).toHaveAttribute('href', '#/lab-reports');
  expect(await overflow(page)).toEqual({wide:false, over:0});
  // 곡 하나: the ONE song screen (큰 정리 2번) with every tool of 곡 분석 on it.
  await rows.nth(0).click();
  await expect(page).toHaveURL(/#\/growth-song\/s1$/);
  await expect(page.locator('[data-gsp-hero]')).toContainText('Defying Gravity');
  await expect(page.locator('#top h1')).toHaveText('곡');
  await expect(page.locator('[data-song-section="changes"]')).toBeVisible();
  await expect(page.locator('[data-gsp-all]')).toHaveCount(0);
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/vocal-analysis$/);
  await expect(rows).toHaveCount(5);
  expect(page.__errors).toEqual([]);
});

test('older links keep their screens; a bare #/vocal-lab lands on 곡 without trapping 뒤로', async ({page}) => {
  await boot(page, {comparisonReports:[{id:'r1', kind:'vocal-lab', songId:'s1', song:'Defying Gravity', created:Date.now(), mediaIds:['a5', 'a6'], snapshots:[]}]});
  await page.goto('/#/vocal-growth');
  await expect(current(page)).toHaveText('나');
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
  await expect(page).toHaveURL(/#\/growth-song\/s1\?a=a5&b=a6&compare=1$/);
  await page.goto('/#/home'); await page.goto('/#/practice-room');
  await expect(page.locator('iframe.vzip-practice-room-frame')).toBeVisible();
  expect(page.__errors).toEqual([]);
});

test('연구소: two small groups of tools, each with what it answers and its state; no practice screens; fits 320px', async ({page}) => {
  await page.setViewportSize({width:320, height:640});
  await boot(page, {practices:ROOM, comparisonReports:[{id:'r1', kind:'vocal-lab', songId:'s1', song:'Defying Gravity', created:Date.now(), mediaIds:['a5', 'a6'], snapshots:[]}]});
  await page.evaluate(() => { location.hash = '#/growth-lab'; });
  await expect(page).toHaveURL(/#\/growth-lab$/);
  await expect(current(page)).toHaveText('기록');
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  // 소리 깊이 보기 · 기록·기준, in this order (성장 개편 안 B, phase 4).
  await expect(page.locator('[data-lab-group] h2')).toHaveText(['흐름·리포트', '소리 깊이 보기', '기록·기준']);
  expect(await page.locator('[data-lab-group="deep"] [data-lab-tool]').evaluateAll(els => els.map(e => e.dataset.labTool))).toEqual(['voice-path', 'precision', 'precision-report', 'mr', 'take']);
  expect(await page.locator('[data-lab-group="records"] [data-lab-tool]').evaluateAll(els => els.map(e => e.dataset.labTool))).toEqual(['reports', 'ear', 'basis']);
  await expect(page.locator('[data-lab-tool] .item-title')).toHaveText(['달라진 것 자세히', '월별 리포트 · AI 월간 코치', '전체 리포트 · AI 전체 코치', '주간 요약', '소리 길 흔적 · 시험판', '발성 정밀 측정', '발성 정밀 리포트', 'MR로 다시 분석', '녹음 하나 분석', '리포트 보관함', '귀와 숫자 표 전체', '분석 기준·뺀 것 목록']);
  for (const row of await page.locator('[data-lab-tool]').all()) {
    expect((await row.locator('.item-sub').innerText()).trim().length).toBeGreaterThan(8);   // one line of what it answers
    expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  for (const [key, href] of [['voice-path', '#/voice-path'], ['precision', '#/precision-measurement'], ['precision-report', '#/precision-report'], ['reports', '#/lab-reports'], ['ear', '#/growth-ear'], ['basis', '#/growth-basis']])
    await expect(page.locator('[data-lab-tool="' + key + '"]')).toHaveAttribute('href', href);
  // States are what is really there: counted, or said to be nothing yet — never a made-up number.
  const state = key => page.locator('[data-lab-state="' + key + '"]');
  await expect(state('reports')).toHaveText('저장 1개');
  await expect(state('take')).toHaveText('분석한 녹음 13개');            // 15 recordings, d1 and d2 not analysed
  await expect(state('precision')).toHaveText('아직 없음');
  await expect(state('precision-report')).toHaveText('아직 없음');
  await expect(state('voice-path')).toHaveText('아직 없음');
  await expect(state('mr')).toHaveText('MR 올린 곡 없음');
  await expect(state('ear')).toHaveText('아직 없음');
  await expect(state('reports')).toHaveAttribute('data-state', 'ok');
  await expect(state('ear')).toHaveAttribute('data-state', 'none');
  // No practice screens here any more: they are on 오늘 › 연습하기, and the lead says so.
  for (const sel of ['[data-hub-room]', '[data-hub-check]', '[data-hub-set]', '[data-hub-review]', '[data-hub-result]', '[data-hub-training]', '[data-precision-entry]', '[data-lab-note]', '[data-lab-tool="flow"]'])
    await expect(page.locator(sel)).toHaveCount(0);
  await expect(page.locator('#view')).not.toContainText(/노래 연습실|보이스 체크|연습 세트|보컬 트레이닝|추천 연습/);
  await expect(page.locator('[data-lab-lead]')).toContainText('연습은 오늘 탭에서 해요');
  expect(await overflow(page)).toEqual({wide:false, over:0});
  for (const a of await tabs(page).all()) { const b = await a.boundingBox(); expect(b.height).toBeGreaterThanOrEqual(44); expect(b.x + b.width).toBeLessThanOrEqual(320); }
  expect(await tabs(page).evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth))).toBe(true);   // no clipped label
  // A report saved while the tab is open: the state word follows, the rows stay where they are.
  await page.evaluate(() => VZ.change(d => { d.comparisonReports.push({id:'r2', kind:'vocal-lab', songId:'s2', song:'On My Own', created:Date.now(), mediaIds:['b1', 'b2'], snapshots:[]}); }, {silent:true}));
  await expect(state('reports')).toHaveText('저장 2개');
  await page.locator('[data-lab-tool="reports"]').click();
  await expect(page).toHaveURL(/#\/lab-reports$/);
  await expect(page.locator('.vl-reports .vl-report')).toHaveCount(2);
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/growth-lab$/);
  expect(page.__errors).toEqual([]);
});

test('연구소 › 녹음 하나 분석 picks a recording; MR로 다시 분석 says what is missing or asks which song', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await page.evaluate(() => { location.hash = '#/growth-lab'; });
  await page.locator('[data-lab-tool="take"]').click();
  const pick = page.getByRole('dialog', {name:'녹음 하나 분석'});
  await expect(pick.locator('[data-lab-take]')).toHaveCount(15);
  await expect(pick.locator('[data-lab-take]').first()).toContainText('Defying Gravity');     // newest first: a6, yesterday
  await expect(pick.locator('[data-lab-take="d1"] .growth-hub-chip')).toHaveText('분석 전');
  await expect(pick.locator('[data-lab-take="a6"] .growth-hub-chip')).toHaveText('분석함');
  await pick.locator('[data-lab-take-q]').fill('memory');
  await expect(pick.locator('[data-lab-take]:visible')).toHaveCount(2);
  await pick.locator('[data-lab-take-q]').fill('없는 이름');
  await expect(pick.locator('[data-lab-take-none]')).toBeVisible();
  await pick.locator('[data-lab-take-q]').fill('on my own');
  for (const a of await pick.locator('[data-lab-take]:visible').all()) expect((await a.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await pick.locator('[data-lab-take="b2"]').click();
  await expect(page).toHaveURL(/#\/analysis\/b2$/);
  await expect(page.locator('#top h1')).toHaveText('녹음 분석');      // not 보컬 분석: that was a tab's name too
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/growth-lab$/);
  // No song has an MR file: the row says so and the sheet says where to add one.
  await page.locator('[data-lab-tool="mr"]').click();
  await expect(page.locator('[data-lab-mr-empty]')).toContainText('MR 파일을 올린 곡이 아직 없어요');
  await expect(page.locator('[data-lab-mr-songs]')).toHaveAttribute('href', '#/songs');
  await page.getByRole('dialog', {name:'MR로 다시 분석'}).getByRole('button', {name:'돌아가기'}).click();
  // With an MR file on a song: which song, then the same sheet 곡 분석 opens.
  await page.evaluate(() => { const has = VZ.mrReanalyze.has; VZ.mrReanalyze.has = song => song?.id === 's2' || has(song); window.dispatchEvent(new Event('vzip:data-changed')); });
  await expect(page.locator('[data-lab-state="mr"]')).toHaveText('MR 있는 곡 1개');
  await page.locator('[data-lab-tool="mr"]').click();
  await expect(page.locator('[data-lab-mr-song]')).toHaveText(/On My Own/);
  await page.locator('[data-lab-mr-song="s2"]').click();
  await expect(page.getByRole('dialog', {name:'MR로 다시 분석'}).locator('[data-remr]')).toBeVisible();
  expect(page.__errors).toEqual([]);
});

test('연구소 › 귀와 숫자 표 전체 and 분석 기준·뺀 것 목록 open the folded parts of 달라진 것 on their own pages', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await page.evaluate(() => { location.hash = '#/growth-lab'; });
  await expect(page.locator('[data-lab-state="basis"]')).toHaveText(/^뺀 것 \d+개$/);
  const excluded = Number((await page.locator('[data-lab-state="basis"]').innerText()).match(/\d+/)[0]);
  await page.locator('[data-lab-tool="basis"]').click();
  await expect(page).toHaveURL(/#\/growth-basis$/);
  await expect(page.locator('#top h1')).toHaveText('분석 기준·뺀 것');
  await expect(page.locator('.growth-top-tabs')).toHaveCount(0);
  await expect(page.locator('.v-nav a[data-nav="growth"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-lab-basis]')).toContainText('분석 기준');
  await expect(page.locator('[data-lab-basis]')).toContainText('누적 곡 녹음 15개');
  await expect(page.locator('[data-lab-basis]')).toContainText('이전 분석(v1) 1개');
  await expect(page.locator('[data-lab-rule]')).toContainText('곡 녹음만 셌어요');
  await expect(page.locator('[data-gc-excluded-page] [data-gc-excluded-item]')).toHaveCount(excluded);   // the same list 달라진 것 folds away
  await expect(page.locator('[data-gc-excluded-page] [data-gc-excluded-item]').first().locator('span')).not.toBeEmpty();   // each with its reason
  expect(await overflow(page)).toEqual({wide:false, over:0});
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/growth-lab$/);
  // 귀와 숫자: nothing made up without a verdict; the page says how to leave one.
  await page.locator('[data-lab-tool="ear"]').click();
  await expect(page).toHaveURL(/#\/growth-ear$/);
  await expect(page.locator('#top h1')).toHaveText('귀와 숫자');
  await expect(page.locator('[data-gc-ear-none]')).toBeVisible();
  await expect(page.locator('[data-gc-ear-table]')).toHaveCount(0);
  await expect(page.locator('[data-lab-ear-songs]')).toHaveAttribute('href', '#/vocal-analysis');
  expect(await overflow(page)).toEqual({wide:false, over:0});
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
  await expect(page).toHaveURL(/#\/growth-lab$/);
  for (const key of ['voice-path', 'precision', 'precision-report', 'take', 'reports', 'ear']) await expect(page.locator('[data-lab-state="' + key + '"]')).toHaveText('아직 없음');
  await expect(page.locator('[data-lab-state="mr"]')).toHaveText('MR 올린 곡 없음');
  await expect(page.locator('[data-lab-state="basis"]')).toHaveText('뺀 것 없음');
  await expect(page.locator('[data-lab-state][data-state="ok"]')).toHaveCount(0);
  await tabs(page).nth(0).click();
  await expect(page).toHaveURL(/#\/vocal-growth$/);
  await expect(current(page)).toHaveText('나');
  await expect(page.locator('[data-gm-tile="minutes"] strong')).toHaveText('0분');
  await expect(page.locator('[data-gm-section="next"] [data-gm-chip="숙제"]')).toHaveCount(0);   // nothing made up
  // 나 says there is nothing to compare yet; 달라진 것 자세히 says which part is missing.
  await expect(page.locator('[data-gme-line-empty]')).toBeVisible();
  await page.locator('[data-gme-changes]').click();
  await expect(page.locator('[data-growth-changes] [data-gc-empty="songs"]')).toBeVisible();
  expect(page.__errors).toEqual([]);
});
