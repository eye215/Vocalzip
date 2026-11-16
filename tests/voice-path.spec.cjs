// 소리 길 흔적 (시험판, app/voice-path.js): two takes of a song side by side, measured on this device from generated
// WAV recordings (tests/helpers/voice-path-audio.cjs) seeded the way the other lab specs seed theirs.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const AUDIO = require('./helpers/voice-path-audio.cjs');
const KEY = 'vocal-zip_mvp_v1';
const NOTE = '소리의 길은 선생님 귀로 판단해요. 이 화면은 다시 들어볼 곳을 찾는 참고예요.';
const stub = `window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};let writing=false;for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert'){window.__up.push(a[0]);writing=true}return c};c.then=r=>r({data:writing?[{user_id:'ui-test-user'}]:[],error:null});return c}})};`;
const seed = () => ({categories:[], songs:[{id:'s1', title:'지금 이 순간', show:'지킬 앤 하이드'}, {id:'s2', title:'On My Own', show:''}], lessons:[], assignments:[], practices:[], comparisonReports:[]});
const stored = confidence => ({v:2, at:1763000000000, seconds:34, metrics:{voicedSeconds:28, stability:{wobbleCents:20, notes:9}, intonation:{meanAbsCents:18, notes:9}, phrases:[]}, confidence:{pitchConfidence:0.95, voicedShare:82, ...confidence}, scope:{kind:'whole-recording', cut:false}});
// Oldest → newest. m-raw (the newest) has no analysis, so it is not the default 비교; m-mid was sung over an MR.
const TAKES = [
  {id:'m-old', name:'작년 8월 연습 SECRETNAME', kind:'worse', date:'2025-08-14', analysis:stored({voiceOverMrDb:null})},
  {id:'m-mid', name:'3월 MR 연습', kind:'better', date:'2026-03-02', analysis:stored({voiceOverMrDb:8})},
  {id:'m-new', name:'올해 11월 연습', kind:'better', date:'2026-11-09', analysis:stored({voiceOverMrDb:null})},
  {id:'m-raw', name:'분석 전 녹음', kind:'better', date:'2026-11-12', analysis:null}
];
async function boot(page, {takes = TAKES, seconds = 34} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed())]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  // A signed-out-of-cloud device, so the files stay in IndexedDB (as the other media specs do).
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
  await page.evaluate('(' + AUDIO.source + ')()');
  await page.evaluate(async ([takes, seconds]) => {
    for (const t of takes) await window.vzipStorePracticeMedia({id:t.id, name:t.name, created:new Date(t.date + 'T10:00:00').getTime(), type:'audio/wav', source:'practice', songId:'s1', song:'지금 이 순간',
      blob:new Blob([window.vpTake.take(t.kind, t.seconds || seconds)], {type:'audio/wav'}), durationSeconds:t.seconds || seconds});
    window.dispatchEvent(new Event('vzip:media-updated'));
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {recordedDate:t.date, ...(t.analysis ? {analysis:t.analysis} : {})}, {quiet:true}); }
    // A name typed by the person (set after the date, which names an untouched recording by itself).
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {name:t.name}, {quiet:true}); }
    await VZ.media.list(true);                                                       // the list the screens read now has the dates and analyses
  }, [takes, seconds]);
  await page.waitForTimeout(400);
}
const data = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const open = async (page, query = '') => { await page.evaluate(q => { location.hash = '#/voice-path/s1' + q; }, query); await expect(page.locator('[data-vp-picker]')).toBeVisible(); };
const measure = async page => { await page.locator('[data-vp-run]').click(); await expect(page.locator('[data-vp-results]')).toBeVisible({timeout:30000}); };
const row = (page, id) => page.locator('[data-vp-row="' + id + '"]');
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
const BANNED = /좋아졌|나빠졌|좋아진|나빠진|나아졌|향상|악화|개선|길이 맞|길을 찾았|잘했어요|못했어요/;

test('성장 › 보컬 분석 opens it; the default pair is the earliest and the latest reliable take', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  const entry = page.locator('[data-hub-voice-path]');
  await expect(entry).toContainText('소리 길 흔적 · 시험판');
  await entry.click();
  await expect(page.locator('[data-vp-note]')).toHaveText(NOTE);
  // Only songs that have recordings are offered.
  await expect(page.locator('[data-vp-song]')).toHaveCount(1);
  await page.locator('[data-vp-song="s1"]').click();
  await expect(page).toHaveURL(/#\/voice-path\/s1$/);
  await expect(page.locator('[data-vp-note]')).toHaveText(NOTE);
  await expect(page.locator('[data-vp-pick="a"]')).toHaveValue('m-old');
  await expect(page.locator('[data-vp-pick="b"]')).toHaveValue('m-new');          // not m-raw: it has no reliable analysis
  await expect(page.locator('[data-vp-default]')).toHaveText('분석 신뢰도가 충분한 녹음 가운데 가장 이른 것과 가장 최근 것을 골랐어요.');
  await expect(page.locator('[data-vp-slot="a"] [data-vp-meta]')).toContainText('2025.08.14');
  // Nothing is measured until asked; the same take cannot be chosen on both sides.
  await expect(page.locator('[data-vp-results]')).toHaveCount(0);
  await expect(page.locator('[data-vp-pick="b"] option[value="m-old"]')).toHaveAttribute('disabled', '');
  await expect(page.locator('[data-vp-pick="a"] option[value="m-old"]')).toContainText('SECRETNAME');
  expect(page.__errors).toEqual([]);
});

test('a recording in 보컬 연구소 links to it with that recording as 비교', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-lab/s1?a=m-old&b=m-mid'; });
  const link = page.locator('[data-voice-path-link]');
  await expect(link).toContainText('소리 길 흔적 · 시험판');
  await expect(link).toHaveAttribute('href', '#/voice-path/s1?b=m-mid');
  await link.click();
  await expect(page.locator('[data-vp-pick="b"]')).toHaveValue('m-mid');
  await expect(page.locator('[data-vp-pick="a"]')).toHaveValue('m-old');
  expect(page.__errors).toEqual([]);
});

test('measuring shows progress, can be stopped, and then gives rows in neutral words', async ({page}) => {
  await boot(page);
  await open(page);
  // Hold the pitch step so the progress is there to see and stop (it ends only when told to stop).
  await page.evaluate(() => { window.__real = VZ.analyzeSamples; VZ.analyzeSamples = (s, r, onProgress, o) => new Promise((resolve, reject) => { onProgress(0.4); o.signal.addEventListener('abort', () => reject(new DOMException('stop', 'AbortError'))); }); });
  await page.locator('[data-vp-run]').click();
  await expect(page.locator('[data-vp-stage]')).toContainText('기준 녹음 (1/2) · 음높이 찾는 중');
  const bar = page.locator('.vp-bar');
  await expect(bar).toHaveAttribute('role', 'progressbar');
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await expect(page.locator('[data-vp-pick="a"]')).toBeDisabled();
  await page.locator('[data-vp-cancel]').click();
  await expect(page.locator('[data-vp-status]')).toHaveText('그만뒀어요. 다시 재려면 흔적 재기를 눌러 주세요.');
  await expect(page.locator('[data-vp-results]')).toHaveCount(0);
  await expect(page.locator('[data-vp-pick="a"]')).toBeEnabled();
  // Now for real.
  await page.evaluate(() => { VZ.analyzeSamples = window.__real; });
  await measure(page);
  await expect(page.locator('[data-vp-status]')).toHaveText('다 쟀어요.');
  await expect(page.locator('[data-vp-note]')).toHaveText(NOTE);
  await expect(page.locator('[data-vp-row]')).toHaveCount(10);
  await expect(page.locator('[data-vp-group]')).toHaveCount(5);
  // The older take has three dropouts and three flips; the newer one has none.
  await expect(row(page, 'breaks')).toHaveAttribute('data-state', 'different');
  await expect(row(page, 'breaks').locator('.vp-mark')).toHaveText('다름');
  await expect(row(page, 'breaks').locator('[data-vp-line]')).toHaveText('끊김이 줄었어요');
  await expect(row(page, 'breaks').locator('.vp-vals dd').first()).toContainText('(3곳)');
  await expect(row(page, 'breaks').locator('.vp-vals dd').last()).toContainText('(0곳)');
  await expect(row(page, 'flips').locator('[data-vp-line]')).toHaveText('뒤집힘이 줄었어요');
  await expect(row(page, 'pitchSd').locator('[data-vp-line]')).toHaveText('긴 음의 음높이 흔들림이 줄었어요');
  await expect(row(page, 'vibrato').locator('[data-vp-line]')).toHaveText('비브라토가 들어간 긴 음이 늘었어요');
  await expect(row(page, 'breath').locator('[data-vp-line]')).toHaveText('목소리에 섞인 숨·잡음이 줄었어요');
  for (const mark of await page.locator('.vp-row .vp-mark').allTextContents()) expect(['비슷함', '다름', '표본 부족', '잴 수 없음']).toContain(mark);
  // Both takes are voice only: nothing is withheld for an accompaniment.
  await expect(page.locator('[data-vp-unclean-all]')).toHaveCount(0);
  await expect(row(page, 'brightness')).not.toHaveAttribute('data-state', 'hold');
  // Never a verdict, never "the 길 was found".
  expect(await page.locator('[data-vp]').innerText()).not.toMatch(BANNED);
  // Zones: the take's own thirds, thin ones named.
  await page.locator('[data-vp-zone-card] summary').click();
  await expect(page.locator('[data-vp-zones]')).toHaveCount(2);
  await expect(page.locator('[data-vp-zone]')).toHaveCount(6);
  // No stored analysis was touched.
  const after = await page.evaluate(async () => (await VZ.media.list(true)).map(m => [m.id, m.analysis?.at ?? null]));
  expect(Object.fromEntries(after)).toEqual({'m-old':1763000000000, 'm-mid':1763000000000, 'm-new':1763000000000, 'm-raw':null});
  // Going away and back in the same session shows the result again without measuring.
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  await open(page);
  await expect(page.locator('[data-vp-results]')).toBeVisible();
  await expect(page.locator('[data-vp-run]')).toHaveText('다시 재기');
  expect(page.__errors).toEqual([]);
});

test('tapping a break plays that moment of that take', async ({page, browserName}) => {
  test.skip(browserName === 'webkit', 'real audio playback and seeking are checked in Chromium');
  await boot(page);
  await open(page);
  await measure(page);
  const chips = row(page, 'breaks').locator('[data-vp-play="a"]');
  await expect(chips).toHaveCount(3);
  await expect(row(page, 'breaks').locator('[data-vp-play="b"]')).toHaveCount(0);
  const chip = chips.nth(1), t = Number(await chip.getAttribute('data-t'));
  expect(t).toBeGreaterThan(12); expect(t).toBeLessThan(13.5);                    // the second dropout, at about 12.7 s
  await expect(chip).toHaveAccessibleName(/기준 녹음 0:1[23] 끊김 부분 듣기/);
  await chip.click();
  const player = page.locator('[data-vp-player="a"]');
  await expect.poll(() => player.evaluate(el => !el._player.el.paused)).toBe(true);
  const at = await player.evaluate(el => el._player.el.currentTime);
  expect(at).toBeGreaterThanOrEqual(t - 1.05); expect(at).toBeLessThan(t + 1.5);   // from one second before it
  await expect(page.locator('[data-vp-playing="a"]')).toContainText('부터 들려 드려요');
  await expect(chip).toHaveAttribute('aria-current', 'true');
  // The other take's player stays quiet.
  expect(await page.locator('[data-vp-player="b"]').evaluate(el => el._player.el.paused)).toBe(true);
  await player.evaluate(el => el._player.pause());
  expect(page.__errors).toEqual([]);
});

test('기준 녹음 is stored on the song record and is the default 기준 after a reload', async ({page}) => {
  await boot(page);
  await open(page);
  await page.locator('[data-vp-pick="a"]').selectOption('m-mid');
  const mark = page.locator('[data-vp-base="a"]');
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  await mark.click();
  await expect(page.locator('[data-vp-base="a"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-vp-base="a"]')).toHaveText('이 곡의 기준 녹음이에요');
  const song = (await data(page)).songs.find(s => s.id === 's1');
  expect(song.voicePathBaseIds).toEqual(['m-mid']);
  expect(song.updatedAt).toBeGreaterThan(0);                                       // stamped like any other song edit, so it syncs
  expect((await data(page)).songs.find(s => s.id === 's2').voicePathBaseIds).toBeUndefined();
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await expect(page.locator('[data-vp-pick="a"]')).toHaveValue('m-mid');
  await expect(page.locator('[data-vp-default]')).toHaveText('기준 녹음으로 표시한 녹음을 기준으로 골랐어요.');
  await expect(page.locator('[data-vp-pick="a"] option[value="m-mid"]')).toContainText('기준 녹음');
  // Taking the mark off removes the field again.
  await page.locator('[data-vp-base="a"]').click();
  expect((await data(page)).songs.find(s => s.id === 's1').voicePathBaseIds).toBeUndefined();
  expect(page.__errors).toEqual([]);
});

test('a take with an accompaniment shows only the pitch-based rows until it is ticked as voice only', async ({page}) => {
  await boot(page);
  await open(page, '?a=m-old&b=m-mid');
  await expect(page.locator('[data-vp-clean="a"]')).toBeChecked();                 // stored analysis: no accompaniment heard
  await expect(page.locator('[data-vp-clean="b"]')).not.toBeChecked();             // stored analysis: an accompaniment was heard
  await expect(page.locator('[data-vp-slot="b"] [data-vp-why]')).toContainText('반주가 섞여 있어 울림·숨소리는 잴 수 없어요');
  await measure(page);
  await expect(page.locator('[data-vp-unclean-all]')).toContainText('반주가 섞여 있어 울림·숨소리는 잴 수 없어요');
  for (const id of ['zoneSpread', 'brightness', 'breath', 'onsets']) {
    await expect(row(page, id).locator('.vp-mark')).toHaveText('잴 수 없음');
    await expect(row(page, id).locator('[data-vp-line]')).toHaveText('반주가 섞여 있어 울림·숨소리는 잴 수 없어요');
  }
  await expect(row(page, 'breaks').locator('.vp-mark')).toHaveText('다름');        // pitch-based rows are still there
  // The person says this take is voice only: measured without measuring again, and remembered on this device.
  await page.locator('[data-vp-clean="b"]').check();
  await expect(page.locator('[data-vp-unclean-all]')).toHaveCount(0);
  await expect(row(page, 'breath').locator('.vp-mark')).not.toHaveText('잴 수 없음');
  await expect(page.locator('[data-vp-slot="b"] [data-vp-why]')).toHaveText('목소리만 들어 있다고 직접 표시했어요');
  expect(await page.evaluate(() => JSON.parse((window.VzipAccountScope?.storage || localStorage).getItem('vzip_voice_path_clean_v1')))).toEqual({'m-mid':true});
  expect(JSON.stringify(await data(page))).not.toContain('vzip_voice_path_clean');  // not in the synced records
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await expect(page.locator('[data-vp-clean="b"]')).toBeChecked();
  // And the other way: a take the analysis called clean can be marked as having an accompaniment.
  await page.locator('[data-vp-clean="a"]').uncheck();
  await expect(page.locator('[data-vp-slot="a"] [data-vp-why]')).toContainText('반주가 있다고 직접 표시했어요');
  expect(page.__errors).toEqual([]);
});

test('진단 파일: numbers and months only, nothing that names the recordings', async ({page}) => {
  await boot(page);
  await open(page, '?a=m-old&b=m-mid');
  await measure(page);
  await page.evaluate(() => { navigator.canShare = undefined; });                  // the download path (the share sheet has no test surface)
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-vp-diagnosis]').click()]);
  expect(download.suggestedFilename()).toBe('vocalzip-voice-path-diagnosis.json');
  const text = require('node:fs').readFileSync(await download.path(), 'utf8'), d = JSON.parse(text);
  expect(d.kind).toBe('vocalzip-voice-path-diagnosis');
  expect(d.takes.map(t => [t.role, t.month])).toEqual([['base', '2025-08'], ['comp', '2026-03']]);
  for (const hidden of ['m-old', 'm-mid', 's1', 'SECRETNAME', '작년 8월', 'MR 연습', '지금 이 순간', '지킬', '2025-08-14', '2026-03-02', '.wav', 'blob:']) expect(text).not.toContain(hidden);
  const keys = new Set(); JSON.stringify(d, (k, v) => { keys.add(k); return v; });
  for (const key of ['id', 'name', 'title', 'song', 'songId', 'file', 'fileName', 'recordedDate', 'created', 'date', 'history', 'trackId', 'samples', 'curve']) expect(keys.has(key), key).toBe(false);
  // What it does hold.
  expect(d.takes[0].clean).toBe(true); expect(d.takes[0].cleanWhy).toBe('no-accompaniment-heard');
  expect(d.takes[1].clean).toBe(false); expect(d.takes[1].cleanWhy).toBe('accompaniment-heard');
  expect(d.takes[1].resonance).toBeNull(); expect(d.takes[0].resonance.ratioDb).toEqual(expect.any(Number));
  expect(d.takes[0].storedAnalysis).toMatchObject({version:2, reliable:true, pitchConfidence:0.95, voiceOverMrDb:null});
  expect(d.takes[1].storedAnalysis.voiceOverMrDb).toBe(8);
  expect(d.takes[0].guideAnalysis.pitchConfidence).toEqual(expect.any(Number));
  expect(d.takes[0].durationSeconds).toBeCloseTo(34, 0);
  expect(d.takes[0].transitions.breakCount).toBe(3);
  expect(d.takes[0].zones.low).toHaveProperty('seconds'); expect(d.takes[0].coverage.mid).toHaveProperty('enough');
  expect(d.takes[0].semitoneBands.length).toBeGreaterThan(4);
  expect(d.takes[0].semitoneBands[0]).toMatchObject({midi:expect.any(Number), seconds:expect.any(Number)});
  expect(d.thresholds.BREAK_MAX_MS).toBe(150); expect(d.modelVersion).toBe('vp-0.1');
  expect(d.comparison).toHaveLength(10);
  expect(page.__errors).toEqual([]);
});

test('320px: nothing runs off the screen and every control is at least 44px', async ({page}) => {
  await page.setViewportSize({width:320, height:700});
  await boot(page);
  await open(page);
  await noOverflow(page);
  await measure(page);
  await page.locator('[data-vp-zone-card] summary').click();
  await noOverflow(page);
  for (const sel of ['[data-vp-pick]', '.vp-check', '[data-vp-base]', '[data-vp-run]', '[data-vp-play]', '[data-vp-diagnosis]', '[data-vp-zone-card] summary', '[data-vp-player] .player-btn']) {
    for (const box of await page.locator(sel).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return {w:r.width, h:r.height, right:r.right}; }))) {
      expect(box.h, sel).toBeGreaterThanOrEqual(44); expect(box.w, sel).toBeGreaterThanOrEqual(44); expect(box.right, sel).toBeLessThanOrEqual(320.5);
    }
  }
  expect(page.__errors).toEqual([]);
});

test('tablet: the picker sits beside the results in the 성장 column', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width:1024, height:768});
  await boot(page);
  await open(page);
  await measure(page);
  await noOverflow(page);
  const picker = await page.locator('[data-vp-picker]').boundingBox(), results = await page.locator('[data-vp-results]').boundingBox();
  expect(results.x).toBeGreaterThan(picker.x + picker.width);                      // side by side
  expect(Math.abs(results.y - picker.y)).toBeLessThan(4);
  const takes = await page.locator('[data-vp-take]').evaluateAll(els => els.map(el => el.getBoundingClientRect().top));
  expect(Math.abs(takes[0] - takes[1])).toBeLessThan(2);                           // 기준 and 비교 next to each other
  await page.setViewportSize({width:768, height:1024});
  await noOverflow(page);
  expect(page.__errors).toEqual([]);
});

test('a 3-minute take is measured in a time a phone can live with', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'timed once, on desktop Chromium');
  test.setTimeout(120000);
  await boot(page, {takes:[{...TAKES[0], seconds:180}, {...TAKES[2], seconds:180}]});
  await open(page);
  await page.locator('[data-vp-run]').click();
  await expect(page.locator('[data-vp-results]')).toBeVisible({timeout:90000});
  const d = await page.evaluate(() => VZ.voicePathDiagnosis());
  const ms = d.takes.map(t => t.computeMs);
  console.log('voice-path compute time for 3-minute takes (decode + pitch guide + model), ms: ' + ms.join(', '));
  info.annotations.push({type:'compute-ms', description:ms.join(', ')});
  expect(d.takes[0].durationSeconds).toBeCloseTo(180, 0);
  for (const t of ms) expect(t).toBeLessThan(30000);
  expect(page.__errors).toEqual([]);
});
