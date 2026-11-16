// 이 곡 녹음을 MR로 다시 분석 (app/mr-reanalyze.js): a song's recordings measured again, one at a time, through the single
// analysis (VZ.analyzeRecording) after an MR file was added. Seeded states: held back · not analysed yet · trusted ·
// AI-separated · already measured with this MR · no file · a video kept on the device only.
// The analyser is stubbed per recording (as the lab specs do); the last test runs the real analyser with a real MR
// subtraction (synthetic audio only, as tests/v6.spec.cjs does).
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const fs = require('node:fs');
const KEY = 'vocal-zip_mvp_v1', SHOTS = process.env.VZ_SHOTS || '';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const wav = (x, rate = 8000) => { const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(x[i] / (peak || 1) * 0.9 * 32767), 44 + i * 2); return b; };
const TONE = wav(Float32Array.from({length:8000}, (_, i) => Math.sin(i / 8)));
const TRACK = {id:'mr-1', kind:'file', title:'연습 MR', fileName:'mr.m4a', r2Key:'u/test/mr-1.m4a', type:'audio/mp4', created:5000};
const detail = {voicedSeconds:15, intonation:{meanAbsCents:9, within20:90, notes:9}, stability:{wobbleCents:12, notes:5}, phrases:{v:1, rows:[[1, 3, 64, 9, 5]]}, pitchBands:{v:1, rows:[[64, 4, .6, 1, 3, 6]]}};
const scope = {kind:'whole-recording', cut:false};
// Saved results (current analyzer version with the detail rows).
const HELD = {v:2, at:111, seconds:20, metrics:detail, confidence:{pitchConfidence:.42, voiceOverMrDb:.5}, scope};
const GOOD = {v:2, at:222, by:'server', seconds:20, metrics:detail, confidence:{pitchConfidence:.95, voiceOverMrDb:12}, scope};
const AISEP = {v:2, at:333, by:'server', seconds:20, metrics:detail, confidence:{pitchConfidence:.93, aiSeparated:{model:'htdemucs'}}, scope};
const DONE = {v:2, at:9000, seconds:20, metrics:detail, confidence:{pitchConfidence:.9, mrRemoved:{trackId:'mr-1', offsetSeconds:3, removedDb:12}}, scope};
// What the (stubbed) single analysis returns now, per recording.
const withMr = c => ({version:2, seconds:20, fps:20, curve:[], notes:[], metrics:detail, confidence:{pitchConfidence:c, mrRemoved:{trackId:'mr-1', offsetSeconds:2, removedDb:14}}});
const plain = (c, db) => ({version:2, seconds:20, fps:20, curve:[], notes:[], metrics:detail, confidence:{pitchConfidence:c, voiceOverMrDb:db}});
const RECORDINGS = [
  // id, name, recorded date, saved analysis, what the analysis does now
  ['held', '보류된 녹음', '2026-10-01', HELD, {mr:true, result:withMr(.9)}],            // MR removed, trusted → replaces
  ['held2', '다른 반주 녹음', '2026-10-02', {...HELD, at:112}, {mr:true, result:plain(.4, .5)}], // the MR is not in the take
  ['bad', '깨진 녹음', '2026-10-03', {...HELD, at:113}, {error:'파일을 받지 못했어요 (404).'}],
  ['none', '분석 전 녹음', '2026-10-04', null, {mr:true, result:withMr(.5)}],             // MR removed, still held → kept as the first result
  ['good', '잘 잰 녹음', '2026-10-05', GOOD, {result:plain(.96, 12)}],                    // trusted as recorded: MR not needed
  ['good2', '서버가 잰 녹음', '2026-10-06', {...GOOD, at:223}, {mr:true, result:withMr(.5)}], // unreliable now: never replaces a trusted one
  ['ai', 'AI 분리된 녹음', '2026-10-07', AISEP, {mr:true, result:withMr(.92)}],
  ['done', '이미 MR로 잰 녹음', '2026-10-08', DONE, {result:plain(.9, 12)}],
  ['nofile', '파일 없는 녹음', '2026-10-09', {...HELD, at:114}, {result:plain(.9, 12)}],
  ['vid', '기기에만 있는 영상', '2026-10-10', null, {result:plain(.9, 12)}],
];

/** bytes: the device store refuses Blobs, as Playwright's WebKit does, so the app keeps every recording as raw bytes
 * (VZ_BYTES=1 runs the whole file that way on any engine). */
async function boot(page, {tracks = [TRACK], recordings = RECORDINGS, delay = 0, real = false, bytes = !!process.env.VZ_BYTES} = {}) {
  page.__errors = [];
  if (bytes) await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...rest) {
      if (value?.blob instanceof Blob) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'DataCloneError');
      return put.call(this, value, ...rest);
    };
  });
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/__tone.wav', r => r.fulfill({contentType:'audio/wav', body:TONE}));
  const seed = {categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[], songs:[{id:'s1', title:'This Is Me', ...(tracks.length ? {mrTracks:tracks} : {})}]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async ([list, delay, real]) => {
    window.vzipCloudSignedIn = () => false;
    // The song's MR is an uploaded file (storage is stubbed: these tests are about the re-analysis, not the storage).
    window.VzipR2 = {enabled:() => true, prefetch:async () => {}, url:async () => '/__mrfile.wav', upload:async (file, o) => ({key:'u/test/' + o.mediaId + '/original.wav'}), remove:async () => {}};
    const blob = await (await fetch('/__tone.wav')).blob();
    for (const [id, name, date, analysis] of list)
      await window.vzipStorePracticeMedia({id, name, created:Date.parse(date + 'T03:00:00Z'), recordedDate:date, type:id === 'vid' ? 'video/mp4' : 'audio/wav', source:'practice', songId:'s1', blob, durationSeconds:200, ...(analysis ? {analysis} : {})});
    // No file in either form the device store keeps one (a Blob, or raw bytes where Blobs cannot be stored: WebKit).
    for (const m of await VZ.media.list(true)) if (m.id === 'nofile') await VZ.media.update(m, {blob:null, bytes:null}, {quiet:true});
    VZ.media.invalidate();
    window.__calls = []; window.__saves = []; window.__awake = [];
    window.addEventListener('vzip:analysis-saved', e => window.__saves.push(e.detail.id));
    const awake = VZ.media.keepAwake; VZ.media.keepAwake = on => { window.__awake.push(on); return awake(on); };
    if (real) return;
    // The single analysis, stubbed: the stages it reports, a result per recording, stopped by its signal.
    const plans = Object.fromEntries(list.map(row => [row[0], row[4]]));
    const wait = (ms, signal) => new Promise((resolve, reject) => { const t = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('분석 중단', 'AbortError')); }, {once:true}); });
    VZ.analyzeRecording = async (item, options = {}) => {
      const plan = plans[item.id], call = {id:item.id, save:options.save, aborted:false, running:true}; window.__calls.push(call);
      if (window.__calls.filter(c => c.running).length > 1) window.__parallel = true;
      try {
        options.onStage?.('파일 불러오는 중…'); await wait(delay, options.signal);
        if (plan.error) throw Error(plan.error);
        options.onStage?.('목소리 찾는 중… (반주와 구분)'); options.onProgress?.(.5); await wait(delay, options.signal);
        if (plan.mr) { options.onStage?.('곡 MR 불러오는 중… (반주를 빼고 다시 분석)'); await wait(delay, options.signal); options.onStage?.('반주(MR) 빼는 중…'); await wait(delay, options.signal); }
        return JSON.parse(JSON.stringify(plan.result));
      } catch (e) { if (e.name === 'AbortError') call.aborted = true; throw e; }
      finally { call.running = false; }
    };
  }, [recordings, delay, real]);
}
const stored = (page, id) => page.evaluate(async id => (await window.vzipReadMedia()).find(x => x.id === id).analysis ?? null, id);
const sheet = page => page.getByRole('dialog', {name:'MR로 다시 분석', exact:true});
const openFromSong = async page => { await page.goto('/#/song/s1'); await page.locator('[data-tab=ar]').click(); await page.locator('[data-remr-open]').click(); await expect(sheet(page).locator('[data-remr-view="confirm"]')).toBeVisible(); };
const noOverflow = async page => expect(await page.evaluate(() => { const s = document.querySelector('.sheet-page .sheet-body'); return [document.documentElement.scrollWidth <= innerWidth, s.scrollWidth <= s.clientWidth]; })).toEqual([true, true]);
/** Waits for the progress line ("2 / 4 · 반주(MR) 빼는 중…"), looked at on every frame: a stage can be shorter than an expect poll. */
const progress = (page, pattern) => page.waitForFunction(source => new RegExp(source).test(document.querySelector('[data-remr-progress]')?.textContent || ''), pattern.source);
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive:true}); await page.screenshot({path:SHOTS + '/' + name + '.png'}); } };
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('곡 › 레퍼런스 › MR: one line and the button; the confirm page says what it will do before anything starts', async ({page}) => {
  await boot(page);
  await page.goto('/#/song/s1'); await page.locator('[data-tab=ar]').click();
  const prompt = page.locator('[data-remr-prompt]');
  await expect(prompt).toContainText('MR을 올리거나 바꿔도 이미 있는 녹음은 자동으로 다시 재지 않아요.');
  await expect(prompt.locator('[data-remr-ask]')).toHaveCount(0);   // asks only right after an MR was added
  const button = prompt.locator('[data-remr-open]');
  await expect(button).toHaveText('MR로 다시 분석');
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await shot(page, 'mr-section-line');
  await button.click();
  const s = sheet(page);
  await expect(s.locator('[data-remr-view="confirm"]')).toBeVisible();
  // Default scope: 판정 보류인 녹음만 (held · held2 · bad · none).
  await expect(s.locator('[name="vz-remr-scope"][value="held"]')).toBeChecked();
  await expect(s.locator('[data-remr-count]')).toHaveText('4개');
  await expect(s.locator('[data-remr-track]')).toHaveText('연습 MR');
  await expect(s.locator('[data-remr-eta]')).toHaveText(/^(1분 안쪽|약 \d+(~\d+)?분)$/);
  await expect(s.locator('[data-remr-eta-note]')).toContainText('이 기기에서 방금 짧게 재 본 속도');
  await expect(s.locator('.vz-remr-scope label')).toHaveText([/판정 보류인 녹음만 · 4개.*아직 분석하지 않은 녹음 1개 포함/, /모든 녹음 · 7개/]);   // nothing ticked: no 고른 녹음만
  await expect(s.locator('.vz-remr-facts')).toContainText('이 기기에서 분석해요');
  await expect(s.locator('.vz-remr-facts')).toContainText('끝날 때까지 이 화면을 켜 두세요');
  await expect(s.locator('.vz-remr-facts')).toContainText('언제든 멈출 수 있고');
  await expect(s.locator('[data-remr-ai]')).toHaveCount(0);   // no AI-separated result among the held ones
  // Skipped, each with its reason.
  const skipped = s.locator('[data-remr-skipped]');
  await expect(skipped.locator('summary')).toHaveText('건너뛰는 녹음 3개');
  await skipped.locator('summary').click();
  await expect(skipped.locator('[data-remr-row="done"]')).toContainText('이미 이 MR로 쟀어요');
  await expect(skipped.locator('[data-remr-row="nofile"]')).toContainText('파일이 없어요');
  await expect(skipped.locator('[data-remr-row="vid"]')).toContainText('이 기기에만 있는 영상은 분석이 읽지 못해요');
  // 모든 녹음: the AI-separated result is named.
  await s.locator('[name="vz-remr-scope"][value="all"]').check();
  await expect(s.locator('[data-remr-count]')).toHaveText('7개');
  await expect(s.locator('[data-remr-ai]')).toHaveText('AI 분리로 잰 결과도 이 MR로 잰 결과로 바뀌어요. 이전 결과는 이력에 남아요.');
  await expect(s.locator('[data-remr-start]')).toHaveText('7개 다시 분석 시작');
  expect((await s.locator('[data-remr-start]').boundingBox()).height).toBeGreaterThanOrEqual(44);
  // Nothing was measured or saved by looking.
  expect(await page.evaluate(() => [window.__calls.length, window.__saves.length])).toEqual([0, 0]);
  await s.locator('[data-close]').click();
  await expect(s).toHaveCount(0);
  expect(await page.evaluate(() => [window.__calls.length, window.__awake.length])).toEqual([0, 0]);
});

test('판정 보류인 녹음만: one at a time through the single analysis; replaced, left alone and failed are each said', async ({page}) => {
  await boot(page, {delay:250});
  await openFromSong(page);
  const s = sheet(page);
  await expect(s.locator('[data-remr-eta]')).toHaveText(/^(1분 안쪽|약 \d+(~\d+)?분)$/);
  await shot(page, 'confirm');
  await s.locator('[data-remr-start]').click();
  await progress(page, /^1 \/ 4 · /);
  await progress(page, /^1 \/ 4 · 반주\(MR\) 빼는 중…$/);
  await expect(s.locator('[data-remr-stop]')).toBeVisible();
  expect(await s.locator('[data-remr-bar]').evaluate(el => parseInt(el.style.getPropertyValue('--p'), 10))).toBeGreaterThan(10);
  // The second recording: what happened to the first is listed, with the time left.
  await progress(page, /^2 \/ 4 · (곡 MR 불러오는 중…|반주\(MR\) 빼는 중…)$/);   // the stage as the single analysis names it, without its aside
  await expect(s.locator('[data-remr-results] [data-remr-row="held"]')).toContainText('MR을 빼고 다시 쟀어요');
  await expect(s.locator('[data-remr-now]')).toHaveText(/^다른 반주 녹음 · 남은 시간 (1분 안쪽|약 \d+분)$/);
  await shot(page, 'running');
  await expect(s.locator('[data-remr-done]')).toHaveText('4개 중 4개를 마쳤어요');
  await expect(s.locator('[data-remr-total="again"]')).toHaveText('2개');
  await expect(s.locator('[data-remr-total="nomatch"]')).toHaveText('1개');
  await expect(s.locator('[data-remr-total="failed"]')).toHaveText('1개');
  await expect(s.locator('[data-remr-total="kept"]')).toHaveCount(0);
  const row = id => s.locator('[data-remr-results] [data-remr-row="' + id + '"]');
  await expect(row('held')).toContainText('MR을 빼고 다시 쟀어요 · 판정 보류였던 결과를 바꿨어요');
  await expect(row('held2')).toContainText('MR과 맞지 않아요 · 저장된 결과 그대로');
  await expect(row('bad')).toContainText('파일을 받지 못했어요 (404).');
  await expect(row('none')).toContainText('MR을 빼도 판정 보류예요 · 처음 잰 결과로 저장했어요 (판정 보류)');
  expect(await s.locator('[data-remr-results] li').evaluateAll(list => list.map(li => li.dataset.tone || ''))).toEqual(['ok', '', 'bad', '']);
  await shot(page, 'summary');
  // The same calls the analysis screen makes: measure without saving, one at a time, oldest first.
  expect(await page.evaluate(() => window.__calls.map(c => [c.id, c.save]))).toEqual([['held', false], ['held2', false], ['bad', false], ['none', false]]);
  expect(await page.evaluate(() => !!window.__parallel)).toBe(false);
  expect(await page.evaluate(() => window.__saves)).toEqual(['held', 'none']);
  expect(await page.evaluate(() => window.__awake)).toEqual([true, false]);   // screen kept on while it ran
  // Replaced: the new result, the previous one in history (as the single path keeps it).
  const held = await stored(page, 'held');
  expect(held.confidence.mrRemoved).toMatchObject({trackId:'mr-1'});
  expect(held.at).toBeGreaterThan(HELD.at);
  expect(held.history).toEqual([HELD]);
  expect(held.scope).toEqual({kind:'whole-recording', cut:false});
  // Left exactly as they were.
  expect(await stored(page, 'held2')).toEqual({...HELD, at:112});
  expect(await stored(page, 'bad')).toEqual({...HELD, at:113});
  for (const [id, saved] of [['good', GOOD], ['good2', {...GOOD, at:223}], ['ai', AISEP], ['done', DONE], ['nofile', {...HELD, at:114}]]) expect(await stored(page, id)).toEqual(saved);
  // Nothing was saved before: the first measurement is kept although it is held back.
  const none = await stored(page, 'none');
  expect(none.confidence.pitchConfidence).toBe(.5); expect(none.history).toBeUndefined();
  await s.locator('[data-remr-close]').click();
  await expect(s).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('MR로 다시 분석 · 4개 중 4개를 마쳤어요');
  // Asked again: held2 · bad are still to do; held and none were measured with this MR and are skipped now.
  await page.locator('[data-remr-open]').click();
  await expect(sheet(page).locator('[data-remr-count]')).toHaveText('2개');
  await sheet(page).locator('[data-remr-skipped] summary').click();
  for (const id of ['held', 'none', 'done']) await expect(sheet(page).locator('[data-remr-skipped] [data-remr-row="' + id + '"]')).toContainText('이미 이 MR로 쟀어요');
});

test('모든 녹음: an AI-separated result is replaced by a trusted MR result; an unreliable new result never replaces a trusted one', async ({page}) => {
  await boot(page);
  await openFromSong(page);
  const s = sheet(page);
  await s.locator('[name="vz-remr-scope"][value="all"]').check();
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-done]')).toHaveText('7개 중 7개를 마쳤어요');
  await expect(s.locator('[data-remr-total="again"]')).toHaveText('3개');    // held · none · ai
  await expect(s.locator('[data-remr-total="nomatch"]')).toHaveText('1개');  // held2
  await expect(s.locator('[data-remr-total="kept"]')).toHaveText('2개');     // good · good2
  await expect(s.locator('[data-remr-total="failed"]')).toHaveText('1개');   // bad
  const row = id => s.locator('[data-remr-results] [data-remr-row="' + id + '"]');
  await expect(row('ai')).toContainText('MR을 빼고 다시 쟀어요 · AI 분리 결과를 바꿨어요');
  await expect(row('good')).toContainText('녹음 그대로도 믿을 수 있게 재져서 MR을 빼지 않았어요 · 저장된 결과 그대로');
  await expect(row('good2')).toContainText('MR을 빼도 판정 보류예요 · 저장된 결과 그대로');
  const ai = await stored(page, 'ai');
  expect(ai.confidence.aiSeparated).toBeUndefined();
  expect(ai.confidence.mrRemoved).toMatchObject({trackId:'mr-1'});
  expect(ai.history).toEqual([AISEP]);   // the AI-separated result stays in history
  expect(await stored(page, 'good')).toEqual(GOOD);
  expect(await stored(page, 'good2')).toEqual({...GOOD, at:223});
  expect(await page.evaluate(() => window.__saves)).toEqual(['held', 'none', 'ai']);
});

test('멈춤 stops at once and says how many were done; leaving the screen stops it too', async ({page}) => {
  await boot(page, {delay:150});
  await openFromSong(page);
  const s = sheet(page);
  await s.locator('[data-remr-start]').click();
  await progress(page, /^2 \/ 4 · /);
  const stop = s.locator('[data-remr-stop]');
  expect((await stop.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await stop.click();
  await expect(s.locator('[data-remr-done]')).toHaveText('멈췄어요 · 4개 중 1개를 마쳤어요');
  await expect(s.locator('[data-remr-view="summary"]')).toContainText('남은 녹음은 MR로 다시 분석을 다시 누르면 이어서 잴 수 있어요');
  expect(await page.evaluate(() => window.__calls.map(c => [c.id, c.aborted]))).toEqual([['held', false], ['held2', true]]);
  expect(await page.evaluate(() => [window.__saves, window.__awake])).toEqual([['held'], [true, false]]);
  expect(await stored(page, 'held2')).toEqual({...HELD, at:112});
  await s.locator('[data-remr-close]').click();
  // Again (held2 · bad · none), then away to another screen in the middle of the third recording.
  await page.locator('[data-remr-open]').click();
  await expect(sheet(page).locator('[data-remr-count]')).toHaveText('3개');
  await sheet(page).locator('[data-remr-start]').click();
  await progress(page, /^3 \/ 3 · /);
  await page.evaluate(() => { location.hash = '#/home'; });
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('MR로 다시 분석 · 멈췄어요 · 3개 중 2개를 마쳤어요');
  await page.waitForTimeout(800);
  const calls = await page.evaluate(() => window.__calls.map(c => [c.id, c.aborted, c.running]));
  expect(calls.slice(2)).toEqual([['held2', false, false], ['bad', false, false], ['none', true, false]]);   // nothing went on after leaving
  expect(await page.evaluate(() => [window.__saves, window.__awake])).toEqual([['held'], [true, false, true, false]]);
  expect(await stored(page, 'none')).toBe(null);
});

test('보컬 연구소: the row, 고른 녹음만 for the ticked dates, and the measuring method of each take', async ({page}) => {
  await boot(page);
  await page.goto('/#/vocal-lab/s1');
  const row = page.locator('[data-lab-remr]');
  await expect(row).toContainText('MR로 다시 분석');
  await expect(row).toContainText('판정 보류·분석 전 4개');
  expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await shot(page, 'lab-row');
  // The lab opens with the newest analysed takes ticked; show the one already measured with the MR.
  await page.locator('.vl-dates [data-date="done"]').click(); await page.locator('.vl-dates [data-date="done"]').click();
  await expect(page.locator('[data-lab-method]')).toHaveText('측정 방식 · MR 빼고 (연습 MR)');
  const ticked = await page.locator('.vl-dates [aria-pressed="true"]').evaluateAll(list => list.map(b => b.dataset.date));
  expect(ticked).toEqual(['good', 'good2', 'ai', 'done', 'nofile']);
  await row.click();
  const s = sheet(page);
  await expect(s.locator('.vz-remr-scope label')).toHaveText([/판정 보류인 녹음만 · 4개/, /모든 녹음 · 7개/, /고른 녹음만 · 3개.*고른 녹음 중 2개는 건너뛰어요/]);
  await s.locator('[name="vz-remr-scope"][value="picked"]').check();
  await expect(s.locator('[data-remr-count]')).toHaveText('3개');
  await expect(s.locator('[data-remr-ai]')).toBeVisible();
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-done]')).toHaveText('3개 중 3개를 마쳤어요');
  expect(await page.evaluate(() => window.__calls.map(c => c.id))).toEqual(['good', 'good2', 'ai']);
  await s.locator('[data-remr-close]').click();
  // The lab is drawn again from the new results: the AI-separated take now says MR 빼고.
  await page.locator('.vl-dates [data-date="ai"]').click(); await page.locator('.vl-dates [data-date="ai"]').click();
  await expect(page.locator('[data-lab-method]')).toHaveText('측정 방식 · MR 빼고 (연습 MR)');
  await page.locator('.vl-dates [data-date="good"]').click(); await page.locator('.vl-dates [data-date="good"]').click();
  await expect(page.locator('[data-lab-method]')).toHaveText('측정 방식 · 녹음 그대로');
  // The same action from the lab's menu.
  await page.locator('[data-lab-more]').click();
  await page.locator('[data-lab-remr-menu]').click();
  await expect(sheet(page).locator('[data-remr-view="confirm"]')).toBeVisible();
});

test('after an MR file is added the MR section asks; without an MR file there is no line and no lab row', async ({page}) => {
  await boot(page, {tracks:[]});
  await page.goto('/#/vocal-lab/s1');
  await expect(page.locator('.vl-dates')).toBeVisible();
  await expect(page.locator('[data-lab-remr]')).toHaveCount(0);
  await page.goto('/#/song/s1'); await page.locator('[data-tab=ar]').click();
  await expect(page.locator('[data-mr-add]')).toBeVisible();
  await expect(page.locator('[data-remr-prompt]')).toHaveCount(0);
  await page.evaluate(() => { window.vzipCloudUserId = () => 'mr-owner'; window.vzipCloudSignedIn = () => true; });
  await page.locator('[data-mr-add]').click();
  const add = page.getByRole('dialog', {name:'MR 추가', exact:true});
  await add.locator('[name=file]').setInputFiles({name:'새 반주.wav', mimeType:'audio/wav', buffer:Buffer.from('fixture audio')});
  await add.locator('[data-mr-save]').click();
  await expect(add).toHaveCount(0);
  const prompt = page.locator('[data-remr-prompt]');
  // 'done' was measured with another MR file (mr-1, gone): it counts again. Held ones: held · held2 · bad · none.
  await expect(prompt.locator('[data-remr-ask]')).toHaveText('이 곡 녹음 4개를 이 MR로 다시 분석할까요?');
  await expect(prompt).toContainText('자동으로 다시 재지 않아요');
  await prompt.scrollIntoViewIfNeeded();
  await shot(page, 'mr-section-prompt');
  await prompt.locator('[data-remr-open]').click();
  const s = sheet(page);
  await expect(s.locator('[data-remr-count]')).toHaveText('4개');
  await expect(s.locator('[data-remr-track]')).toHaveText('새 반주');
  await expect(s.locator('.vz-remr-scope label').nth(1)).toHaveText(/모든 녹음 · 8개/);
  await expect(s.locator('[data-remr-skipped] summary')).toHaveText('건너뛰는 녹음 2개');
});

test('recordings the device keeps as raw bytes (WebKit) are files like any other: same counts, same run', async ({page}) => {
  await boot(page, {bytes:true});
  expect(await page.evaluate(async () => (await window.vzipReadMedia()).map(m => [m.id, m.blob instanceof Blob, !!m.bytes]).filter(x => x[0] === 'held' || x[0] === 'nofile'))).toEqual([['held', false, true], ['nofile', false, false]]);
  await openFromSong(page);
  const s = sheet(page);
  await expect(s.locator('[data-remr-count]')).toHaveText('4개');
  await expect(s.locator('.vz-remr-scope label').nth(1)).toHaveText(/모든 녹음 · 7개/);
  await s.locator('[data-remr-skipped] summary').click();
  await expect(s.locator('[data-remr-skipped] [data-remr-row]')).toHaveCount(3);
  await expect(s.locator('[data-remr-skipped] [data-remr-row="nofile"]')).toContainText('파일이 없어요');
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-done]')).toHaveText('4개 중 4개를 마쳤어요');
  const held = await stored(page, 'held');
  expect(held.confidence.mrRemoved).toMatchObject({trackId:'mr-1'}); expect(held.history).toEqual([HELD]);
  // The recording itself is still there, as it was kept.
  expect(await page.evaluate(async () => { const m = (await window.vzipReadMedia()).find(x => x.id === 'held'); return [m.blob instanceof Blob, (m.bytes?.byteLength ?? m.bytes?.length) > 44]; })).toEqual([false, true]);
});

test('several MR files: the page says the best-fitting one is chosen per recording; an MR added after a result is not "already measured"', async ({page}) => {
  const later = {id:'mr-2', kind:'file', title:'반키 올린 MR', r2Key:'u/test/mr-2.m4a', type:'audio/mp4', created:9500};
  await boot(page, {tracks:[TRACK, later, {id:'mr-y', kind:'youtube', videoId:'dQw4w9WgXcQ', url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title:'유튜브 반주', created:1}]});
  await openFromSong(page);
  const s = sheet(page);
  await expect(s.locator('[data-remr-track]')).toHaveText('MR 파일 2개 중 하나');   // the YouTube MR has no file
  await shot(page, 'confirm-several');
  await expect(s.locator('[data-remr-tracks]')).toHaveText('연습 MR · 반키 올린 MR 중에서 녹음마다 반주가 가장 많이 빠지는 것을 골라요.');
  // 'done' was measured with mr-1 at 9000, before mr-2 was added (9500): it is measured again.
  await expect(s.locator('.vz-remr-scope label').nth(1)).toHaveText(/모든 녹음 · 8개/);
  await expect(s.locator('[data-remr-skipped] summary')).toHaveText('건너뛰는 녹음 2개');
});

test('320px: the confirm, running and summary pages fit', async ({page}) => {
  await page.setViewportSize({width:320, height:640});
  await boot(page, {delay:120});
  await openFromSong(page);
  const s = sheet(page);
  await s.locator('[name="vz-remr-scope"][value="all"]').check();
  await noOverflow(page);
  await shot(page, 'confirm-320');
  for (const label of await s.locator('.vz-remr-scope label').all()) expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect((await s.locator('[data-remr-skipped] summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await s.locator('[data-remr-start]').click();
  await progress(page, /^2 \/ 7 · /);
  await noOverflow(page);
  await expect(s.locator('[data-remr-done]')).toBeVisible();
  await noOverflow(page);
  const box = await s.locator('[data-remr-close]').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x + box.width).toBeLessThanOrEqual(320);
});

test('tablet: the page keeps the 560px column', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width:820, height:1180});
  await boot(page);
  await openFromSong(page);
  const s = sheet(page);
  await noOverflow(page);
  const box = await s.boundingBox();
  expect(box.width).toBeLessThanOrEqual(560);
  expect(Math.abs(box.x + box.width / 2 - 410)).toBeLessThanOrEqual(1);
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-done]')).toHaveText('4개 중 4개를 마쳤어요');
  await noOverflow(page);
});

test('the real analyser: a held take is measured with the song\'s MR file subtracted and replaces the saved result', async ({page}) => {
  test.setTimeout(120000);
  const Y = require('./helpers/mr-synth.cjs');
  // Synthetic only: a song-like MR file and a phone take of a melody sung over it, the MR 8 dB louder than the voice.
  // A second take is sung over a different backing track: the song's MR is not in it.
  const mr = Y.mr(60), take = Y.record(Y.vocal(20).x, mr, {offset:6, db:8}).x, other = Y.record(Y.vocal(20, 11).x, Y.mr(60, 5), {offset:6, db:8}).x;
  await page.route('**/__mrfile.wav', r => r.fulfill({contentType:'audio/wav', body:wav(mr)}));
  await page.route('**/__heldtake.wav', r => r.fulfill({contentType:'audio/wav', body:wav(take)}));
  await page.route('**/__othertake.wav', r => r.fulfill({contentType:'audio/wav', body:wav(other)}));
  await boot(page, {recordings:[], real:true});
  await page.evaluate(async held => {
    await window.vzipStorePracticeMedia({id:'mixed', name:'MR 크게 들어간 녹음', created:Date.now(), recordedDate:'2026-10-01', type:'audio/wav', source:'practice', songId:'s1',
      blob:await (await fetch('/__heldtake.wav')).blob(), durationSeconds:20, analysis:held});
    await window.vzipStorePracticeMedia({id:'other', name:'다른 반주로 부른 녹음', created:Date.now(), recordedDate:'2026-10-02', type:'audio/wav', source:'practice', songId:'s1',
      blob:await (await fetch('/__othertake.wav')).blob(), durationSeconds:20, analysis:{...held, at:112}});
    VZ.media.invalidate();
  }, HELD);
  await openFromSong(page);
  const s = sheet(page);
  await expect(s.locator('[data-remr-count]')).toHaveText('2개');
  await s.locator('[data-remr-start]').click();
  await expect(s.locator('[data-remr-done]')).toHaveText('2개 중 2개를 마쳤어요', {timeout:90000});
  await expect(s.locator('[data-remr-results] [data-remr-row="mixed"]')).toContainText('MR을 빼고 다시 쟀어요 · 판정 보류였던 결과를 바꿨어요');
  const saved = await stored(page, 'mixed');
  expect(saved.confidence.mrRemoved).toMatchObject({trackId:'mr-1'});
  expect(Math.abs(saved.confidence.mrRemoved.offsetSeconds - 6)).toBeLessThan(0.05);
  expect(saved.confidence.pitchConfidence).toBeGreaterThanOrEqual(0.8);
  expect(saved.history).toEqual([HELD]);
  expect(saved).not.toHaveProperty('voice'); expect(saved).not.toHaveProperty('curve');
  // The song's MR is not in the other take: said so, and its saved result is as it was.
  await expect(s.locator('[data-remr-results] [data-remr-row="other"]')).toContainText('MR과 맞지 않아요 · 저장된 결과 그대로');
  await expect(s.locator('[data-remr-total="nomatch"]')).toHaveText('1개');
  expect(await stored(page, 'other')).toEqual({...HELD, at:112});
});
