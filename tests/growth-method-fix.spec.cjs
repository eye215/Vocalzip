// A pair left out of 무엇이 달라졌나 / 귀와 숫자 because its two takes were measured differently (녹음 그대로 vs MR 빼고,
// AI 분리 후 vs MR 빼고) offers 이 녹음도 MR 빼고 재기: the song's MR re-analysis (app/mr-reanalyze.js) with only the take
// that is not MR 빼고 picked. Without an MR file on the song it says so, with a link to the song's MR files. After a
// (stubbed) re-analysis the pair is compared: a take trusted as recorded keeps its result and gets the measurement
// with the MR removed next to it (analysis.mrAlt). Set-up of tests/growth-ear.spec.cjs and tests/mr-reanalyze.spec.cjs.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {v2} = require('./growth-characterization.fixture.cjs');
const KEY = 'vocal-zip_mvp_v1', NOW = '2026-11-18T03:00:00.000Z';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const TRACK = {id:'mr-1', kind:'file', title:'연습 MR', fileName:'mr.m4a', r2Key:'u/test/mr-1.m4a', type:'audio/mp4', created:5000};
// s1 (as growth-ear): 8월 as recorded, 9월 and 11월 MR 빼고; the verdict 8월 vs 11월 is the owner's mixed pair.
// s2 (as growth-listen): 8월 as recorded, 11월 MR 빼고 → left out of 같은 곡 같은 방법.
// s4: 8월 AI 분리 후, 11월 MR 빼고 → the other way round.
const TAKES = [
  {id:'s1-aug', songId:'s1', name:'작년 8월 연습', date:'2025-08-14', analysis:v2({into:30, wob:20})},
  {id:'s1-sep', songId:'s1', name:'9월 MR 연습', date:'2026-09-05', analysis:v2({into:26, wob:20, mr:true})},
  {id:'s1-nov', songId:'s1', name:'11월 레슨 녹음', date:'2026-11-10', analysis:v2({into:12, wob:20, mr:true})},
  {id:'s2-aug', songId:'s2', name:'On My Own 8월', date:'2025-08-20', analysis:v2({into:20})},
  {id:'s2-nov', songId:'s2', name:'On My Own 11월', date:'2026-11-12', analysis:v2({into:10, mr:true})},
  {id:'s4-aug', songId:'s4', name:'Memory 8월', date:'2025-08-02', analysis:v2({into:30, ai:true})},
  {id:'s4-nov', songId:'s4', name:'Memory 11월', date:'2026-11-16', analysis:v2({into:12, mr:true})}
];
const DAY = id => TAKES.find(t => t.id === id).date;
const verdict = (id, songId, firstId, secondId) => ({id, kind:'listen-verdict', v:1, songId, firstId, secondId, firstDate:DAY(firstId), secondDate:DAY(secondId),
  firstRange:null, secondRange:null, overall:'second', tags:{}, memo:'', judge:'me', teacher:'', lessonId:'', blind:true, judgedDate:'2026-11-17', created:1});
const MIXED = verdict('listen:mixed', 's1', 's1-aug', 's1-nov'), AI = verdict('listen:ai', 's4', 's4-aug', 's4-nov');
const seed = mr => ({categories:[], assignments:[], comparisonReports:[MIXED, AI], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:1, ...(mr ? {mrTracks:[TRACK]} : {})}, {id:'s2', title:'On My Own', created:2, ...(mr ? {mrTracks:[TRACK]} : {})},
    {id:'s4', title:'Memory', created:4, ...(mr ? {mrTracks:[TRACK]} : {})}], lessons:[], deleted:{}});
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR', viewport:{width:375, height:812}});

async function boot(page, {mr = true} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed(mr))]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async ([takes, after]) => {
    window.vzipCloudSignedIn = () => false;
    // The song's MR is an uploaded file (storage stubbed, as tests/mr-reanalyze.spec.cjs).
    window.VzipR2 = {enabled:() => true, prefetch:async () => {}, url:async () => '/__mrfile.wav', upload:async (file, o) => ({key:'u/test/' + o.mediaId + '/original.wav'}), remove:async () => {}};
    const wav = (seconds, hz) => { const sr = 8000, n = sr * seconds, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * hz * i / sr) * 3000), true); return new Blob([b], {type:'audio/wav'}); };
    for (const [i, t] of takes.entries()) await window.vzipStorePracticeMedia({id:t.id, name:t.name, created:new Date(t.date + 'T10:00:00+09:00').getTime(), type:'audio/wav', source:'practice', songId:t.songId, song:'', blob:wav(2, 220 + i * 20), durationSeconds:2});
    VZ.media.invalidate();
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {recordedDate:t.date, analysis:t.analysis}, {quiet:true}); }
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {name:t.name}, {quiet:true}); }
    await VZ.media.list(true);
    // The single analysis, stubbed (the current analyzer's shape): trusted as recorded; with alsoMr, a trusted
    // measurement with the MR removed attached as mrAlt (none when window.__noAlt).
    window.__calls = [];
    VZ.analyzeRecording = async (item, o = {}) => {
      window.__calls.push([item.id, !!o.alsoMr]);
      o.onStage?.('목소리 찾는 중… (반주와 구분)');
      const raw = {version:2, seconds:120, fps:20, curve:[], notes:[], metrics:item.analysis.metrics, confidence:{pitchConfidence:.95, voiceOverMrDb:12}};
      if (!o.alsoMr) return raw;
      o.onStage?.('곡 MR 불러오는 중… (반주를 빼고 다시 분석)'); o.onStage?.('반주(MR) 빼는 중…');
      return window.__noAlt ? raw : {...raw, mrAlt:{version:2, seconds:120, fps:20, curve:[], notes:[], metrics:after.metrics, confidence:{pitchConfidence:.95, mrRemoved:{trackId:'mr-1', offsetSeconds:2, removedDb:14}}}};
    };
  }, [TAKES, v2({into:24, wob:20})]);
}
const report = async page => { await page.evaluate(() => { location.hash = '#/vocal-growth'; }); await expect(page.locator('[data-growth-changes-card]')).toBeVisible(); };
const sheet = page => page.getByRole('dialog', {name:'MR로 다시 분석', exact:true});
const stored = (page, id) => page.evaluate(async id => (await window.vzipReadMedia()).find(x => x.id === id).analysis, id);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('무엇이 달라졌나: the mixed pair offers 이 녹음도 MR 빼고 재기 for its as-recorded take only; after it the pair is compared', async ({page}) => {
  await boot(page);
  await report(page);
  const card = page.locator('[data-growth-changes-card]');
  await expect(card.locator('[data-gc-song="s2"]')).toHaveCount(0);
  await card.locator('[data-gc-excluded] summary').click();
  const s2 = card.locator('[data-gc-excluded-item="song:s2"]');
  await expect(s2).toHaveAttribute('data-reason', 'method-mixed');
  const button = s2.locator('[data-gc-remr]');
  await expect(button).toHaveText('이 녹음도 MR 빼고 재기');
  await expect(button).toHaveAttribute('data-gc-remr', 's2-aug');
  await expect(s2.locator('.gc-remr-note')).toContainText('2025년 8월 녹음 하나만');
  await expect(s2.locator('[data-gc-remr-help]')).toHaveCount(0);   // 녹음 그대로 vs MR 빼고: no method glossary
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await button.click();
  // The existing confirm page, 고른 녹음만 with exactly this one take.
  const s = sheet(page);
  await expect(s.locator('[data-remr-view="confirm"]')).toBeVisible();
  await expect(s.locator('[name="vz-remr-scope"][value="picked"]')).toBeChecked();
  await expect(s.locator('[data-remr-count]')).toHaveText('1개');
  await expect(s.locator('[data-remr-start]')).toHaveText('1개 다시 분석 시작');
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-done]')).toHaveText('1개 중 1개를 마쳤어요');
  await expect(s.locator('[data-remr-row="s2-aug"]')).toContainText('MR 빼고 잰 결과를 따로 저장했어요 · 원래 결과는 그대로예요');
  expect(await page.evaluate(() => window.__calls)).toEqual([['s2-aug', true]]);
  // The saved result exactly as it was, plus the second measurement next to it (no history entry).
  const before = TAKES.find(t => t.id === 's2-aug').analysis, saved = await stored(page, 's2-aug');
  const {mrAlt, ...rest} = saved;
  expect(rest).toEqual(before);
  expect([mrAlt.v, mrAlt.confidence.mrRemoved.trackId, mrAlt.metrics.intonation.meanAbsCents]).toEqual([2, 'mr-1', 27]);
  await s.locator('[data-remr-close]').click();
  await expect(s).toHaveCount(0);
  // Back on the card (redrawn on the saved result): s2 is compared as MR 빼고, no longer left out.
  const line = card.locator('[data-gc-song="s2"]');
  await expect(line).toHaveAttribute('data-gc-method', 'mrRemoved');
  await expect(line.locator('.gc-basis')).toHaveText('같은 곡 On My Own · MR 빼고 잰 녹음 2개 (MR 빼고 따로 잰 결과로 견줌) · 2025년 8월 → 2026년 11월');
  await expect(page.locator('[data-gc-excluded-item="song:s2"]')).toHaveCount(0);
});

test('귀와 숫자 and 이 평가와 숫자: the owner\'s 8월 vs 11월 pair, the AI 분리 case explained, compared after the re-analysis', async ({page}) => {
  await boot(page);
  await report(page);
  // 이 평가와 숫자 under the 8월 vs 11월 verdict.
  const mixed = page.locator('[data-gc-verdict="listen:mixed"] [data-gc-ear-verdict]');
  await mixed.locator('summary').click();
  await expect(mixed.locator('[data-gc-ear-why]')).toHaveText(/^2025년 8월 녹음은 녹음 그대로, 2026년 11월 녹음은 MR 빼고 잰 것이라 견주지 않아요/);
  await expect(mixed.locator('[data-gc-remr]')).toHaveAttribute('data-gc-remr', 's1-aug');
  // The other way round (AI 분리 후 vs MR 빼고): both methods explained, the button for the AI-separated take.
  const ai = page.locator('[data-gc-verdict="listen:ai"] [data-gc-ear-verdict]');
  await ai.locator('summary').click();
  await expect(ai.locator('[data-gc-remr-help]')).toHaveText(/AI 분리 후: AI가 목소리만 따로 떼어 낸 뒤 잰 것\s*MR 빼고: 곡에 올린 MR 파일로 반주를 빼고 잰 것/);
  await expect(ai.locator('[data-gc-remr]')).toHaveAttribute('data-gc-remr', 's4-aug');
  // 귀와 숫자's own list of left-out verdicts carries the same button.
  const ear = page.locator('[data-growth-ear]');
  await ear.locator('[data-gc-ear] > summary').click();
  await ear.locator('[data-gc-ear-excluded] summary').click();
  await expect(ear.locator('[data-gc-ear-excluded-item="listen:mixed"] [data-gc-remr]')).toHaveAttribute('data-gc-remr', 's1-aug');
  await expect(ear.locator('[data-gc-ear-excluded-item="listen:ai"] [data-gc-remr]')).toHaveAttribute('data-gc-remr', 's4-aug');
  // Measure the 8월 take with the MR removed, from the verdict.
  await mixed.locator('[data-gc-remr]').click();
  const s = sheet(page);
  await expect(s.locator('[name="vz-remr-scope"][value="picked"]')).toBeChecked();
  await expect(s.locator('[data-remr-count]')).toHaveText('1개');
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-done]')).toHaveText('1개 중 1개를 마쳤어요');
  await s.locator('[data-remr-close]').click();
  expect(await page.evaluate(() => window.__calls)).toEqual([['s1-aug', true]]);
  expect((await stored(page, 's1-aug')).confidence.mrRemoved).toBeUndefined();   // still measured as recorded
  // Redrawn: the verdict is compared now, both MR 빼고.
  const after = page.locator('[data-gc-verdict="listen:mixed"] [data-gc-ear-verdict]');
  await expect(after.locator('summary')).toHaveText(/이 평가와 숫자\s*같은 쪽 \d+ · 반대 \d+ · 차이 없음 \d+/);
  await after.locator('summary').click();
  await expect(after.locator('.gc-ear-basis')).toHaveText('MR 빼고 잰 두 녹음 (MR 빼고 따로 잰 결과로 견줌) · 분석 v2');
  await expect(page.locator('[data-gc-ear-excluded-item="listen:mixed"]')).toHaveCount(0);
  await expect(page.locator('[data-gc-ear-excluded-item="listen:ai"]')).toHaveCount(1);
});

test('no MR file on the song: says so and links to the song\'s MR files', async ({page}) => {
  await boot(page, {mr:false});
  await report(page);
  const card = page.locator('[data-growth-changes-card]');
  await card.locator('[data-gc-excluded] summary').click();
  const s2 = card.locator('[data-gc-excluded-item="song:s2"]');
  await expect(s2.locator('[data-gc-remr]')).toHaveCount(0);
  await expect(s2.locator('[data-gc-remr-none]')).toHaveText('이 곡에 MR 파일을 올리면 같은 방법으로 견줄 수 있어요');
  const link = s2.locator('[data-gc-remr-link]');
  await expect(link).toHaveAttribute('href', '#/song/s2?tab=ar');
  expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const mixed = page.locator('[data-gc-verdict="listen:mixed"] [data-gc-ear-verdict]');
  await mixed.locator('summary').click();
  await expect(mixed.locator('[data-gc-remr-none]')).toBeVisible();
  // The link opens the song on 레퍼런스 (its MR files), once: the address goes back to the plain song page.
  await link.click();
  await expect(page.locator('[data-tab=ar]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-song-mr] [data-mr-add]')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('#/song/s2');
  await page.setViewportSize({width:320, height:640});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('alsoMr without a trusted measurement with the MR removed: said, nothing saved; decide keeps every other outcome', async ({page}) => {
  await boot(page);
  await report(page);
  await page.evaluate(() => { window.__noAlt = true; });
  const card = page.locator('[data-growth-changes-card]');
  await card.locator('[data-gc-excluded] summary').click();
  const before = await stored(page, 's2-aug');
  await card.locator('[data-gc-excluded-item="song:s2"] [data-gc-remr]').click();
  const s = sheet(page);
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-row="s2-aug"]')).toContainText('MR을 빼고 재도 믿을 만큼 읽히지 않아 견줄 수 없어요 · 원래 결과는 그대로예요');
  await expect(s.locator('[data-remr-total="again"]')).toHaveText('0개');
  expect(await stored(page, 's2-aug')).toEqual(before);
  await s.locator('[data-remr-close]').click();
  await expect(page.locator('[data-gc-excluded-item="song:s2"]')).toHaveCount(1);
  // decide(), directly: 'alt' / 'noalt' only when the run asked for it and the saved result is trusted as recorded.
  const out = await page.evaluate(() => {
    const d = VZ.mrReanalyze.decide, conf = {pitchConfidence:.95, voiceOverMrDb:12}, metrics = {voicedSeconds:60};
    const good = {v:2, at:1, metrics, confidence:conf}, ai = {v:2, at:1, metrics, confidence:{...conf, aiSeparated:true}};
    const raw = {version:2, seconds:20, metrics, confidence:conf}, alt = {...raw, mrAlt:{version:2, seconds:20, metrics, confidence:{pitchConfidence:.9, mrRemoved:{trackId:'mr-1'}}}};
    const pick = r => [r.kind, r.save, r.alt ? r.alt.v + ':' + !!r.alt.confidence.mrRemoved : ''];
    return [pick(d(good, alt, {also:true})), pick(d(good, raw, {also:true})), pick(d(good, alt, {})), pick(d(ai, alt, {also:true})), pick(d(null, alt, {also:true}))];
  });
  expect(out).toEqual([['alt', true, '2:true'], ['noalt', false, ''], ['fine', false, ''], ['fine', false, ''], ['plain', true, '']]);
});
