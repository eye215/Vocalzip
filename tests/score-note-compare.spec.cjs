// 음표 단위 악보 비교 (app/score-note-compare.js) in the vocal lab: the confirmed vocal part of the converted score vs
// one recording's pitch curve. The converted score and the on-device analysis are stubbed here (the alignment itself is
// covered by tests/score-align.test.cjs with real synthetic audio); this checks what the owner sees and what is saved.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, stub} = require('./helpers/r2-fixture.cjs');
const S = require('./helpers/score-song.cjs');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

const song = S.song(), XML = S.xml(song);
const REF = {version:1, low:'E3', high:'A4', lowMidi:52, highMidi:69, source:'score', scoreId:'score-1', part:'Voice', partId:'P1', transposition:0, confirmedByUser:true, updatedAt:1};
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], name = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
/** A pitch curve (20 points/s) of a singer: what VZ.analyzeRecording returns, without decoding audio. */
function curveOf(opts) {
  const t = S.sing(song, {detune:0, ...opts, mrDb:null}), fps = 20, end = t.sung.at(-1)[0] + t.sung.at(-1)[1] + 1, curve = new Array(Math.ceil(end * fps)).fill(null);
  for (const [on, dur, midi, det] of t.sung) for (let j = Math.ceil((on + 0.04) * fps); j < (on + dur) * fps; j++) curve[j] = midi * 100 + det;
  return {curve, fps, truth:t.truth};
}

async function boot(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/__omr/score.mxl', r => r.fulfill({contentType:'application/vnd.recordare.musicxml', body:XML}));
  const seed = {categories:[], songs:[{id:'s1', title:'Practice Song', vocalRange:REF, scores:[{id:'score-1', songId:'s1', title:'보컬 악보', fileName:'v.pdf', r2Key:'u/x/score-1/original.pdf', size:10, uploadedAt:1}]}], lessons:[], assignments:[], practices:[], comparisonReports:[]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async () => {
    window.vzipCloudSignedIn = () => false;
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
  await page.goto('/#/vocal-lab/s1');
  await page.locator('.vl-dates button').first().click();
  const box = page.locator('[data-note-cmp]');
  await expect(box).toBeVisible();
  return box;
}
/** Signed in with a converted score, and the on-device analysis answering with this curve. */
async function cloud(page, curve, {reliable = true} = {}) {
  await page.evaluate(([curve, reliable]) => {
    window.__analyze = [];
    VzipR2.enabled = () => true;
    VzipR2.omr.status = async id => ({id:'job-' + id, scoreId:id, status:'done', resultKey:'u/x/' + id + '/omr.mxl', finished:5});
    VzipR2.url = async () => '/__omr/score.mxl';
    VZ.analyzeRecording = async (item, options) => { window.__analyze.push({id:item.id, save:options.save}); options.onStage?.('목소리 찾는 중…');
      return {version:2, seconds:curve.curve.length / 20, curve:curve.curve, fps:20, notes:[], metrics:{voicedSeconds:60, intonation:{tuningCents:0}}, confidence:{tuningFrom:'a440', pitchConfidence:reliable ? .95 : .5, voiceOverMrDb:12},
        summary:{v:2, metrics:{voicedSeconds:60}, confidence:{pitchConfidence:reliable ? .95 : .5, voiceOverMrDb:12}}}; };
  }, [curve, reliable]);
}
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.find(s => s.id === 's1'), KEY);

test('note-level comparison: wrong notes listed by measure with tap-to-listen, nothing saved until 결과 저장', async ({page}) => {
  const box = await boot(page);
  await expect(box).toContainText('음표 단위 비교');
  await expect(box).toContainText('시험판 · 자동 악보 인식과 정렬이라 틀릴 수 있어요');
  // Not signed in: the converted score cannot be read.
  await box.getByRole('button', {name:'비교하기'}).click();
  await expect(box.getByRole('alert')).toContainText('로그인하고 클라우드에 올라간 악보에서 쓸 수 있어요');

  const wrong = {10:1, 25:-2, 61:-1}, take = curveOf({wrong});
  await cloud(page, take);
  await box.getByRole('button', {name:'비교하기'}).click();
  await expect(box.locator('[data-note-summary]')).toContainText('맞은 음');
  expect(await page.evaluate(() => window.__analyze)).toEqual([{id:'m1', save:false}]); // the saved analysis is not touched
  await expect(box.locator('[data-note-summary]')).toContainText('32/32마디 비교');
  await expect(box.locator('[data-note-key]')).toHaveCount(0);
  const rows = box.locator('[data-note-off] [data-note-row]');
  await expect(rows).toHaveCount(3);
  for (const [i, err] of Object.entries(wrong)) {
    const n = song.notes[i], text = n.measure + '마디 · 악보 ' + name(n.midi) + ' → 부른 음 ' + name(n.midi + err) + ' (' + (err > 0 ? '+' : '−') + Math.abs(err) + '반음)';
    await expect(box.locator('[data-note-off]')).toContainText(text);
  }
  await expect(box.locator('[data-note-worst]')).toContainText('다시 들어 볼 마디');
  // Tap-to-listen reuses the lab's player helper (1 s pre-roll inside it).
  await page.evaluate(() => { window.__seek = []; const play = VZ.analysisPlayAt; VZ.analysisPlayAt = (player, t) => { window.__seek.push(Number(t)); return play(player, t); }; });
  const n10 = song.notes[10];
  await box.getByRole('button', {name:new RegExp('^' + n10.measure + '마디 ' + name(n10.midi) + ' .* 부분 듣기')}).click();
  const truth10 = take.truth.find(t => t.i === 10).t;
  const seek = await page.evaluate(() => window.__seek);
  expect(seek).toHaveLength(1); expect(Math.abs(seek[0] - truth10)).toBeLessThan(0.3);
  // Every note on demand.
  await box.getByText(/모든 음 보기/).click();
  await expect(box.locator('[data-note-all-list] [data-note-row]')).toHaveCount(song.notes.length);
  // Nothing stored yet; then the compact result is kept on the song.
  expect((await stored(page)).noteCompare).toBeUndefined();
  await box.getByRole('button', {name:'결과 저장'}).click();
  await expect(box.getByRole('button', {name:'저장됨'})).toBeDisabled();
  const saved = (await stored(page)).noteCompare.takes.m1;
  expect(saved).toMatchObject({v:1, score:'score-1', ver:'job-score-1', part:'P1', shift:0, state:'ok', cover:[32, 32], from:0});
  expect(saved.s).toHaveLength(song.notes.length);
  expect([...saved.s].filter(c => c !== 'o').join('')).toBe('hll');
  expect(JSON.stringify(saved).length).toBeLessThan(600);
  // The recording's own analysis is unchanged.
  const analysis = await page.evaluate(async () => (await VZ.media.list(true)).find(x => x.id === 'm1').analysis);
  expect(analysis.metrics.intonation.meanAbsCents).toBe(15);
  // The alignment runs in a worker (the same model file), so long takes do not freeze the phone.
  const viaWorker = await page.evaluate(() => new Promise(resolve => { const w = new Worker('app/score-align-model.js?v=1'); w.onmessage = e => { w.terminate(); resolve(e.data); }; w.postMessage({melody:{notes:[]}, sung:{cents:new Float32Array(10), fps:20, tuning:0}}); }));
  expect(viaWorker.result).toMatchObject({state:'hold', reason:'no-melody'});
  if (process.env.NOTE_SHOT) { await box.scrollIntoViewIfNeeded(); await box.screenshot({path:process.env.NOTE_SHOT}); }
  await page.setViewportSize({width:320, height:700});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('sung two semitones low: the key shift is said and notes are compared in that key', async ({page}) => {
  const box = await boot(page);
  await cloud(page, curveOf({shift:-2, wrong:{40:2}}));
  await box.getByRole('button', {name:'비교하기'}).click();
  await expect(box.locator('[data-note-key]')).toHaveText('악보보다 2반음 낮은 키로 부른 것으로 보고, 그 기준으로 비교했어요.');
  const n = song.notes[40];
  await expect(box.locator('[data-note-off]')).toContainText(n.measure + '마디 · 악보 ' + name(n.midi) + '(부른 키 ' + name(n.midi - 2) + ') → 부른 음 ' + name(n.midi) + ' (+2반음)');
  await box.getByRole('button', {name:'결과 저장'}).click();
  expect((await stored(page)).noteCompare.takes.m1.shift).toBe(-2);
});

test('another song is not forced onto the score, and a low-confidence analysis is withheld (판정 보류)', async ({page}) => {
  const box = await boot(page);
  const other = S.song({seed:99}), t = S.sing(other, {mrDb:null}), curve = new Array(Math.ceil((t.sung.at(-1)[0] + 3) * 20)).fill(null);
  for (const [on, dur, midi, det] of t.sung) for (let j = Math.ceil((on + 0.04) * 20); j < (on + dur) * 20; j++) curve[j] = midi * 100 + det;
  await cloud(page, {curve});
  await box.getByRole('button', {name:'비교하기'}).click();
  await expect(box.locator('[data-note-verdict]')).toHaveText('판정 보류');
  await expect(box.locator('[data-note-reason]')).toContainText('녹음과 악보가 맞는 곳을 찾지 못했어요');
  await expect(box.getByRole('button', {name:'결과 저장'})).toHaveCount(0);
  // The pitch curve of a recording is computed once per visit; a fresh lab visit with an unreliable analysis.
  await page.goto('/#/home'); await page.goto('/#/vocal-lab/s1'); await page.locator('.vl-dates button').first().click();
  await cloud(page, curveOf({}), {reliable:false});
  // The last result of this session stays on screen until compared again.
  await expect(page.locator('[data-note-verdict]')).toHaveText('판정 보류');
  await page.locator('[data-note-cmp]').getByRole('button', {name:'다시 비교'}).click();
  await expect(page.locator('[data-note-reason]')).toContainText('분석 신뢰도가 낮아요');
});
