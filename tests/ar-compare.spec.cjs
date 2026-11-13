// 원곡(AR) 음정 비교 in the app: the owner uploads the original recording in the song's 레퍼런스 tab (R2 stubbed, the
// original bytes and their SHA-256 kept), the original singer's melody is extracted once on this device from that file
// (real decoding and the real analyzer worker on a synthetic AR, tests/helpers/ar-song.cjs) and cached on the song, then
// a take (its pitch curve stubbed, as in score-note-compare.spec.cjs) is compared in the vocal lab: key shift, wrong
// notes with ▶ (the take) and ▶ 원곡 (the AR at the matching place), withheld cases, saving, 320 px.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const labClear = require('./lab-clear-selection.cjs');
const crypto = require('node:crypto');
const {KEY, stub} = require('./helpers/r2-fixture.cjs');
const S = require('./helpers/score-song.cjs'), H = require('./helpers/ar-song.cjs'), M = require('../app/ar-melody-model.js');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

const song = S.song(), TO = 16;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], name = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const clock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
let AR = null;
function original() {
  if (AR) return AR;
  const a = H.ar(song, {to:TO, harmony:false}), n = a.samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(a.sr, 24); b.writeUInt32LE(a.sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let peak = 0; for (const v of a.samples) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(a.samples[i] / peak * 26000), 44 + i * 2);
  // The original singer's notes as an extracted reference would hold them (for the lab tests that skip extraction).
  const ref = {state:'ok', tuning:a.tuning, fps:20, notes:a.notes.map(([on, d, m]) => ({t:on + 0.05, dur:Math.max(0.15, d - 0.05), midi:m})).sort((x, y) => x.t - y.t), stats:{notes:a.notes.length, low:50, high:76}};
  AR = {wav:b, sha:crypto.createHash('sha256').update(b).digest('hex'), truth:a.truth, ref};
  return AR;
}
/** A take's pitch curve (20 points/s), what VZ.analyzeRecording returns, without decoding audio. */
function curveOf(opts) {
  const t = S.sing(song, {detune:0, to:TO, ...opts, mrDb:null}), fps = 20, end = t.sung.at(-1)[0] + t.sung.at(-1)[1] + 1, curve = new Array(Math.ceil(end * fps)).fill(null);
  // Sung along with the original's tuning (+20 cent), as a singer following it would be.
  for (const [on, dur, midi, det] of t.sung) for (let j = Math.ceil((on + 0.04) * fps); j < (on + dur) * fps; j++) curve[j] = midi * 100 + det + 20;
  return {curve, truth:t.truth};
}
/** The AR time of a score note (the reference note made from it). */
const arTimeOf = i => original().truth.find(x => x.i === i).t + 0.05;

async function boot(page, {arFile = null, arReference = null} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  page.__arFetches = 0;
  await page.route('**/__ar/original.wav*', r => { if (r.request().resourceType() === 'fetch') page.__arFetches++; return r.fulfill({contentType:'audio/wav', body:original().wav}); });
  const seed = {categories:[], songs:[{id:'s1', title:'Practice Song', arLinks:[{id:'l1', label:'원곡 유튜브', url:'https://example.com/ar'}], ...(arFile ? {arFile} : {}), ...(arReference ? {arReference} : {})}], lessons:[], assignments:[], practices:[], comparisonReports:[]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async () => {
    const sr = 8000, n = sr * 20, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 6000, true);
    await window.vzipStorePracticeMedia({id:'m1', name:'연습 녹음', created:Date.now() - 864e5, type:'audio/wav', source:'practice', songId:'s1', song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:20});
    const m = (await VZ.media.list(true)).find(x => x.id === 'm1');
    await VZ.media.update(m, {analysis:{v:2, at:1, metrics:{voicedSeconds:60, stability:{wobbleCents:20, notes:4}, intonation:{meanAbsCents:15, notes:80}, range:{main:{low:'E3', high:'A4'}}, breath:{medianPhrase:3}}, confidence:{pitchConfidence:.95, voiceOverMrDb:12}}}, {quiet:true});
    VZ.media.invalidate();
    window.dispatchEvent(new Event('vzip:media-updated'));
  });
  await page.waitForTimeout(300);
}
/** Signed in; R2 answers with the synthetic AR; the on-device analysis of the take answers with this curve. */
async function cloud(page, take, {reliable = true} = {}) {
  await page.evaluate(([take, reliable]) => {
    window.__analyze = []; window.__uploads = []; window.__removed = []; window.__samples = 0; window.__n = (window.__n || 0);
    window.vzipCloudSignedIn = () => true;
    VzipR2.enabled = () => true;
    VzipR2.upload = async (file, o) => { window.__uploads.push({name:file.name, size:file.size, mediaId:o.mediaId, type:o.type}); o.onProgress?.(100); return {key:'u/x/' + o.mediaId + '/original.wav'}; };
    VzipR2.url = async key => '/__ar/original.wav?n=' + (++window.__n);
    VzipR2.remove = async key => { window.__removed.push(key); };
    const samples = VZ.analyzeSamples; VZ.analyzeSamples = (...a) => { window.__samples++; return samples(...a); };
    if (take) VZ.analyzeRecording = async (item, options) => { window.__analyze.push({id:item.id, save:options.save}); options.onStage?.('목소리 찾는 중…');
      return {version:2, seconds:take.curve.length / 20, curve:take.curve, fps:20, notes:[], metrics:{voicedSeconds:60, intonation:{tuningCents:0}}, confidence:{tuningFrom:'a440', pitchConfidence:reliable ? .95 : .5, voiceOverMrDb:12},
        summary:{v:2, metrics:{voicedSeconds:60}, confidence:{pitchConfidence:reliable ? .95 : .5, voiceOverMrDb:12}}}; };
  }, [take, reliable]);
}
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.find(s => s.id === 's1'), KEY);
async function lab(page) {
  await page.goto('/#/vocal-lab/s1');
  await labClear(page); await page.locator('.vl-dates button').first().click();
  const box = page.locator('[data-ar-cmp]');
  await expect(box).toBeVisible();
  return box;
}

test('upload the original in 레퍼런스, extract its melody once (cached on the song), compare a take in the vocal lab', async ({page}) => {
  test.setTimeout(150000);
  await boot(page);
  // No AR file yet: no block in the lab.
  await page.goto('/#/vocal-lab/s1'); await labClear(page); await page.locator('.vl-dates button').first().click();
  await expect(page.locator('[data-note-cmp], [data-ar-cmp]')).toHaveCount(0);
  await page.goto('/#/song/s1'); await page.locator('[data-tab=ar]').click();
  const sec = page.getByRole('group', {name:'원곡 파일'});
  await expect(sec).toContainText('유튜브 같은 링크는 분석할 수 없어요');
  await cloud(page, curveOf({wrong:{10:1, 25:-2, 50:1}}));
  await sec.getByRole('button', {name:'원곡 파일 올리기'}).click();
  const dlg = page.getByRole('dialog', {name:'원곡 파일 올리기'});
  await dlg.locator('input[type=file]').setInputFiles({name:'original.wav', mimeType:'audio/wav', buffer:original().wav});
  await dlg.locator('[name=title]').fill('원곡 음원');
  await dlg.getByRole('button', {name:'올리기'}).click();
  await expect(dlg).toHaveCount(0);
  await expect(sec).toContainText('원곡 음원');
  await expect(sec.locator('[data-ar-ref-state]')).toHaveAttribute('data-ar-ref-state', 'none');
  await expect(sec).toContainText('정답 악보가 아니에요');
  const up = await page.evaluate(() => window.__uploads);
  expect(up).toHaveLength(1); expect(up[0]).toMatchObject({name:'original.wav', size:original().wav.length, type:'audio/wav'});
  const file = (await stored(page)).arFile;
  expect(file).toMatchObject({title:'원곡 음원', fileName:'original.wav', size:original().wav.length, sha256:original().sha, r2Key:'u/x/' + up[0].mediaId + '/original.wav'});
  expect(page.__arFetches).toBe(0);

  // The lab extracts on the first comparison (real decode + analyzer worker), then compares.
  const box = await lab(page);
  await expect(box).toContainText('원곡 기준 비교');
  await expect(box).toContainText('처음 비교할 때 원곡 "원곡 음원"에서 멜로디를 한 번 뽑아요');
  await box.getByRole('button', {name:'비교하기'}).click();
  await expect(box.locator('[data-ar-summary]')).toContainText('원곡 기준 맞은 음', {timeout:120000});
  expect(page.__arFetches).toBe(1);
  expect(await page.evaluate(() => window.__samples)).toBe(1);
  expect(await page.evaluate(() => window.__analyze)).toEqual([{id:'m1', save:false}]);
  const ref = (await stored(page)).arReference;
  expect(ref).toMatchObject({v:M.MODEL, file:file.id, hash:original().sha, state:'ok'});
  expect(ref.stats.notes).toBeGreaterThan(40);
  expect(JSON.stringify(ref).length).toBeLessThan(2000);
  expect((await stored(page)).arFile).toEqual(file); // the file record is unchanged
  await expect(box.locator('[data-ar-disclaimer]')).toContainText('원곡 가수의 멜로디(자동 추출)');
  // The deliberate wrong notes are listed (against the original singer's notes).
  const off = box.locator('[data-ar-off]');
  for (const [i, err] of [[10, 1], [25, -2], [50, 1]]) await expect(off).toContainText('원곡 ' + name(song.notes[i].midi) + ' → 부른 음 ' + name(song.notes[i].midi + err));

  // Again: the cached reference is used — no download, no extraction.
  await box.getByRole('button', {name:'다시 비교'}).click();
  await expect(box.locator('[data-ar-summary]')).toContainText('원곡 기준 맞은 음');
  expect(page.__arFetches).toBe(1); expect(await page.evaluate(() => window.__samples)).toBe(1);
  // 레퍼런스 tab shows the cached reference; 다시 추출 recomputes on request.
  await page.goto('/#/song/s1'); await page.locator('[data-tab=ar]').click();
  await expect(page.locator('[data-ar-ref-state]')).toHaveAttribute('data-ar-ref-state', 'ok');
  await expect(page.locator('[data-ar-ref-state]')).toContainText('원곡 가수의 멜로디(자동 추출): 음 ' + ref.stats.notes + '개');
  await page.setViewportSize({width:320, height:700});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (process.env.AR_REF_SHOT) await page.getByRole('group', {name:'원곡 파일'}).screenshot({path:process.env.AR_REF_SHOT});
  await page.getByRole('button', {name:'다시 추출'}).click();
  await expect(page.locator('[data-ar-ref-state]')).toHaveAttribute('data-ar-ref-state', 'ok', {timeout:120000});
  await expect.poll(() => page.evaluate(() => window.__samples), {timeout:120000}).toBe(2);
  expect(page.__arFetches).toBe(2);
  // Deleting the file removes it from R2 and the song; saved comparisons are not touched.
  await page.getByRole('button', {name:'원곡 음원 원곡 파일 삭제'}).click();
  await page.locator('[data-ok]').click();
  await expect(page.getByRole('group', {name:'원곡 파일'})).toContainText('원곡 음원 파일을 올리면');
  expect(await page.evaluate(() => window.__removed)).toEqual([file.r2Key]);
  const after = await stored(page);
  expect(after.arFile).toBeUndefined(); expect(after.arReference).toBeUndefined();
});

const FILE = {id:'ar-1', title:'원곡', fileName:'o.wav', type:'audio/wav', r2Key:'u/x/ar-1/original.wav', size:10, sha256:'h1', created:1};
const packed = (over = {}) => ({...M.pack({...original().ref, ...over}, {file:'ar-1', hash:'h1', analyzer:'2/test', at:1}), ...(over.state === 'hold' ? {state:'hold', reason:over.reason} : {})});

test('compare against a cached reference: wrong notes with ▶ take and ▶ 원곡, sung lower than the original, saved only on 결과 저장', async ({page}) => {
  await boot(page, {arFile:FILE, arReference:packed()});
  const box = await lab(page);
  await expect(box).toContainText('원곡 멜로디는 이미 뽑아 두었어요');
  const take = curveOf({shift:-2, wrong:{10:1, 25:-2}});
  await cloud(page, take);
  await box.getByRole('button', {name:'비교하기'}).click();
  await expect(box.locator('[data-ar-summary]')).toContainText('원곡 기준 맞은 음');
  await expect(box.locator('[data-ar-summary] strong')).toContainText('· 원곡보다 2반음 낮게');
  await expect(box.locator('[data-ar-key]')).toHaveText('원곡보다 2반음 낮게 부른 것으로 보고, 그 키로 옮긴 원곡 멜로디와 비교했어요.');
  expect(await page.evaluate(() => window.__samples)).toBe(0); // no extraction
  const off = box.locator('[data-ar-off] [data-ar-row]');
  await expect(off).toHaveCount(2);
  const n10 = song.notes[10];
  await expect(box.locator('[data-ar-off]')).toContainText('원곡 ' + name(n10.midi) + '(부른 키 ' + name(n10.midi - 2) + ') → 부른 음 ' + name(n10.midi - 1) + ' (+1반음)');
  // ▶ the take at the sung time; ▶ 원곡 the AR at the matching time.
  await page.evaluate(() => { window.__seek = []; const play = VZ.analysisPlayAt; VZ.analysisPlayAt = (player, t) => { window.__seek.push({t:Number(t), ar:!!player && 'file' in player, src:String(player?.el?.src || '')}); return play(player, t); }; });
  const at10 = arTimeOf(10);
  await box.getByRole('button', {name:new RegExp('^원곡 ' + clock(at10) + ' ' + name(n10.midi) + ' · 내 녹음')}).click();
  await expect.poll(() => page.evaluate(() => window.__seek.length)).toBe(1);
  await box.getByRole('button', {name:new RegExp('^원곡 ' + clock(at10) + ' ' + name(n10.midi) + ' · 원곡에서 듣기')}).click();
  await expect.poll(() => page.evaluate(() => window.__seek.length)).toBe(2);
  const seek = await page.evaluate(() => window.__seek);
  expect(Math.abs(seek[0].t - take.truth.find(x => x.i === 10).t)).toBeLessThan(0.35);
  expect(Math.abs(seek[1].t - at10)).toBeLessThan(0.1);
  expect(seek[0].ar).toBe(false); expect(seek[1].ar).toBe(true); expect(seek[1].src).toContain('/__ar/original.wav'); // the AR plays in its own audio element
  // Nothing stored until 결과 저장; then a compact AR-keyed record, separate from the score comparison.
  expect((await stored(page)).arCompare).toBeUndefined();
  await box.getByRole('button', {name:'결과 저장'}).click();
  await expect(box.getByRole('button', {name:'저장됨'})).toBeDisabled();
  const s = await stored(page);
  expect(s.arCompare.takes.m1).toMatchObject({src:'ar', score:'ar:ar-1', part:'ar', shift:-2, state:'ok'});
  expect(s.arCompare.takes.m1.ver.startsWith('h1:' + M.MODEL + ':2/test')).toBe(true);
  expect(s.noteCompare).toBeUndefined();
  expect(JSON.stringify(s.arCompare).length).toBeLessThan(600);
  const analysis = await page.evaluate(async () => (await VZ.media.list(true)).find(x => x.id === 'm1').analysis);
  expect(analysis.metrics.intonation.meanAbsCents).toBe(15);
  await page.setViewportSize({width:320, height:700});
  await box.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (process.env.AR_SHOT) await box.screenshot({path:process.env.AR_SHOT});
});

test('withheld: a reference that could not be extracted reliably, another song, a low-confidence take', async ({page}) => {
  await boot(page, {arFile:FILE, arReference:packed({state:'hold', reason:'band'})});
  const box = await lab(page);
  await expect(box).toContainText('원곡 멜로디 판정 보류: 원곡에서 목소리가 반주에 묻혀 있어요');
  await cloud(page, curveOf({}));
  await box.getByRole('button', {name:'비교하기'}).click();
  await expect(box.locator('[data-ar-verdict]')).toHaveText('판정 보류');
  await expect(box.locator('[data-ar-reason]')).toContainText('믿을 만한 기준이 아니라서 비교하지 않았어요');
  expect(await page.evaluate(() => window.__analyze)).toEqual([]); // the take is not even analysed
  await expect(box.getByRole('button', {name:'결과 저장'})).toHaveCount(0);
  // A good reference, another song sung.
  await page.evaluate(([k, ref]) => { const d = JSON.parse(localStorage.getItem(k)); d.songs[0].arReference = ref; localStorage.setItem(k, JSON.stringify(d)); }, [KEY, packed()]);
  await page.reload();
  const box2 = await lab(page);
  const other = S.song({seed:99}), t = S.sing(other, {mrDb:null, to:TO}), curve = new Array(Math.ceil((t.sung.at(-1)[0] + 3) * 20)).fill(null);
  for (const [on, dur, midi, det] of t.sung) for (let j = Math.ceil((on + 0.04) * 20); j < (on + dur) * 20; j++) curve[j] = midi * 100 + det;
  await cloud(page, {curve});
  await box2.getByRole('button', {name:'비교하기'}).click();
  await expect(box2.locator('[data-ar-verdict]')).toHaveText('판정 보류');
  await expect(box2.locator('[data-ar-reason]')).toContainText('녹음과 원곡 멜로디가 맞는 곳을 찾지 못했어요');
  // The right song, but the take's analysis is unreliable.
  await page.reload();
  const box3 = await lab(page);
  await cloud(page, curveOf({}), {reliable:false});
  await box3.getByRole('button', {name:'비교하기'}).click();
  await expect(box3.locator('[data-ar-reason]')).toContainText('이 녹음의 분석 신뢰도가 낮아요');
});
