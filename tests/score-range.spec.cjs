// 악보 기준 음정 비교 (app/score-range.js): the reference range comes from the vocal part of the converted score
// (owner confirms) or is entered by hand; the vocal lab compares a recording's measured highest notes with it.
const {test, expect} = require('@playwright/test');
const zlib = require('node:zlib');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2, R2, KEY, stub} = require('./helpers/r2-fixture.cjs');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const PDF = 'u/ui-test-user/score-1/original.pdf', MXL = 'u/ui-test-user/score-1/omr.mxl';

// A deflated .mxl (zip) built here: tests/fixtures is not committed.
function mxl(files) {
  const crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const local = [], central = []; let offset = 0;
  for (const [n, text] of files) {
    const name = Buffer.from(n), raw = Buffer.from(text), data = zlib.deflateRawSync(raw), head = Buffer.alloc(30), dir = Buffer.alloc(46), crc = crc32(raw);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(8, 8); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(name.length, 26);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    local.push(head, name, data); central.push(dir, name); offset += 30 + name.length + data.length;
  }
  const d = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(d.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, d, end]);
}
const note = (step, octave, extra = '') => '<note><pitch><step>' + step + '</step>' + '<octave>' + octave + '</octave></pitch><duration>4</duration>' + extra + '</note>';
const lyric = '<lyric><text>la</text></lyric>';
const SCORE = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">' +
  '<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes>' + note('G', 3, lyric) + note('B', 4, lyric) + '<note><rest/><duration>4</duration></note></measure>' +
  '<measure number="2">' + note('D', 5, lyric) + '<note><grace/><pitch><step>A</step><octave>5</octave></pitch></note>' + note('C', 4, lyric) + '</measure></part>' +
  '<part id="P2"><measure number="1"><attributes><divisions>4</divisions><staves>2</staves></attributes>' + note('C', 6, '<staff>1</staff>') + note('C', 2, '<staff>2</staff>') + '</measure><measure number="2">' + note('E', 6, '<staff>1</staff>') + '</measure></part></score-partwise>';
const CONTAINER = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>';

async function cloudSong(page, vocalRange) {
  const fake = await fakeR2(page);
  await page.route(R2 + '/v1/omr**', route => route.fulfill({json:{job:{id:'c'.repeat(24), scoreId:'score-1', status:'done', resultKey:MXL, movements:1}}}));
  await boot(page);
  fake.store.set(PDF, {bytes:Buffer.from('%PDF-1.4 score'), type:'application/pdf'});
  fake.store.set(MXL, {bytes:mxl([['META-INF/container.xml', CONTAINER], ['score.xml', SCORE]]), type:'application/vnd.recordare.musicxml'});
  await page.evaluate(([pdf, vocalRange]) => VZ.change(db => { db.songs.push({id:'song-r', title:'Defying Gravity', ...(vocalRange ? {vocalRange} : {}), scores:[{id:'score-1', songId:'song-r', title:'DG 보컬 악보', fileName:'dg.pdf', r2Key:pdf, size:14, uploadedAt:Date.now()}]}); }), [PDF, vocalRange]);
  await page.goto('/#/song/song-r');
  await page.locator('[data-tab="scores"]').click();
  return fake;
}
const song = (page, id) => page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).songs.find(s => s.id === id), [KEY, id]);

test('score range: the vocal part is preselected (piano excluded), nothing is saved until the owner confirms', async ({page}) => {
  const fake = await cloudSong(page);
  const card = page.getByRole('region', {name:'악보 기준 음역'});
  await expect(card).toContainText('보컬 연구소에서 녹음 최고음과 비교');
  await card.getByRole('button', {name:'악보 기준 음역 설정'}).click();
  const sheet = page.getByRole('dialog', {name:'악보 기준 음역'});
  await sheet.getByRole('button', {name:'DG 보컬 악보'}).click();
  await expect(sheet).toContainText('자동 인식(OMR) 결과라 틀린 음표가 있을 수 있어요');
  const voice = sheet.getByRole('radio', {name:/Voice/}), piano = sheet.getByRole('radio', {name:/Piano/});
  await expect(voice).toBeChecked();
  await expect(sheet.locator('.vrange-part').filter({hasText:'Voice'})).toContainText('G3 – D5 · 최고음 2마디 · 가사 있음 · 보컬로 보여요');
  await expect(sheet.locator('.vrange-part').filter({hasText:'Piano'})).toContainText('피아노·건반으로 보여요');
  await expect(piano).not.toBeChecked();
  expect((await song(page, 'song-r')).vocalRange).toBeUndefined();
  await sheet.getByRole('button', {name:'이 음역으로 저장'}).click();
  await expect(sheet).toHaveCount(0);
  expect((await song(page, 'song-r')).vocalRange).toMatchObject({low:'G3', high:'D5', lowMidi:55, highMidi:74, source:'score', scoreId:'score-1', part:'Voice', partId:'P1', confirmedByUser:true});
  await expect(card).toContainText('G3 – D5');
  await expect(card).toContainText('악보 "DG 보컬 악보" · Voice 파트 · 내가 확인함');
  expect(fake.store.get(PDF).bytes.toString()).toBe('%PDF-1.4 score');
});

test('a hand-entered range is kept unless the owner agrees to replace it; manual entry saves exact notes', async ({page}) => {
  const manual = {version:1, low:'A3', high:'C5', lowMidi:57, highMidi:72, source:'manual', confirmedByUser:true, updatedAt:1};
  await cloudSong(page, manual);
  const card = page.getByRole('region', {name:'악보 기준 음역'});
  await expect(card).toContainText('A3 – C5');
  await expect(card).toContainText('직접 입력');
  await card.getByRole('button', {name:'악보 기준 음역 설정'}).click();
  const sheet = page.getByRole('dialog', {name:'악보 기준 음역'});
  await sheet.getByRole('button', {name:'DG 보컬 악보'}).click();
  await sheet.getByRole('button', {name:'이 음역으로 저장'}).click();
  const ask = page.getByRole('dialog', {name:'직접 입력한 음역 바꾸기'});
  await expect(ask).toContainText('직접 입력한 음역(A3 – C5)을 악보 음역(G3 – D5)으로 바꿀까요?');
  await ask.getByRole('button', {name:'취소'}).click();
  expect((await song(page, 'song-r')).vocalRange).toEqual(manual);
  // Manual entry: two note pickers.
  await sheet.getByRole('button', {name:'이전'}).click();
  await sheet.getByRole('button', {name:'최저음·최고음 고르기'}).click();
  await sheet.getByRole('combobox', {name:'최저음'}).selectOption({label:'F#3'});
  await sheet.getByRole('combobox', {name:'최고음'}).selectOption({label:'C3'});
  await sheet.getByRole('button', {name:'직접 입력한 음역 저장'}).click();
  await expect(sheet.getByRole('alert')).toContainText('최저음이 최고음보다 높아요');
  expect((await song(page, 'song-r')).vocalRange).toEqual(manual);
  await sheet.getByRole('combobox', {name:'최고음'}).selectOption({label:'A#5'});
  await sheet.getByRole('button', {name:'직접 입력한 음역 저장'}).click();
  await expect(sheet).toHaveCount(0);
  expect((await song(page, 'song-r')).vocalRange).toMatchObject({low:'F#3', high:'A#5', lowMidi:54, highMidi:82, source:'manual', confirmedByUser:true});
  await expect(card).toContainText('F#3 – A#5');
});

// ---- vocal lab (local device, no cloud) ----
async function localBoot(page, vocalRange) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  const seed = {categories:[], songs:[{id:'s1', title:'This Is the Moment', ...(vocalRange ? {vocalRange} : {})}], lessons:[], assignments:[], practices:[], comparisonReports:[]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async () => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr * 20, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 6000, true);
    await window.vzipStorePracticeMedia({id:'m1', name:'연습 녹음', created:Date.now() - 864e5, type:'audio/wav', source:'practice', songId:'s1', song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:20});
    window.dispatchEvent(new Event('vzip:media-updated'));
  });
  await page.waitForTimeout(400);
}
const v2 = ({valid, instant, stable, pitchConfidence = .95}) => ({v:2, at:Date.now(), metrics:{voicedSeconds:14, stability:{wobbleCents:20, notes:4}, intonation:{meanAbsCents:15, notes:8},
  range:{validHigh:valid && {note:valid[0], cents:valid[1], t:4.2, duration:.4, confidence:.9, times:[{t:4.2, duration:.4}]}, stableHigh:stable && {note:stable[0], cents:stable[1], t:5, times:[{t:5}]},
    instantaneous:instant && {note:instant[0], cents:instant[1], t:12.3, confidence:.6}, main:{low:'A3', high:'B4'}}, breath:{medianPhrase:3}}, confidence:{pitchConfidence, voiceOverMrDb:12}});
async function lab(page, analysis) {
  await page.evaluate(async a => { const m = (await VZ.media.list(true)).find(x => x.id === 'm1'); await VZ.media.update(m, {analysis:a}, {quiet:true}); VZ.media.invalidate(); }, analysis);
  await page.goto('/#/home');
  await page.goto('/#/vocal-lab/s1');
  await page.locator('.vl-dates button').first().click();
  const box = page.locator('[data-vrange]');
  await expect(box).toBeVisible();
  return box;
}
const REF = {version:1, low:'A3', high:'C5', lowMidi:57, highMidi:72, source:'score', scoreId:'gone', part:'Voice', confirmedByUser:true, updatedAt:1};

test('vocal lab verdicts: 일치 with 순간 최고음 재확인 (tap to listen), exact semitones above, 판정 보류, and v1 still renders', async ({page}) => {
  await localBoot(page, REF);
  // Valid C5 = score high → 일치; instant F5 is 5 semitones over the score → re-check with a listen button at 12.3 s.
  let box = await lab(page, v2({valid:['C5', 7204], stable:['B4', 7100], instant:['F5', 7690]}));
  await expect(box).toContainText('악보 A3 – C5 · 악보에서 가져옴');
  await expect(box.locator('[data-vrange-verdict]')).toHaveText('일치');
  await expect(box.locator('[data-vrange-row="valid"]')).toContainText('유효 최고음 C5 악보와 같은 음');
  await expect(box.locator('[data-vrange-row="stable"]')).toContainText('안정 최고음 B4 1반음 낮음');
  await expect(box.locator('[data-vrange-row="instant"]')).toContainText('순간 최고음 F5 5반음 높음');
  await expect(box.locator('[data-vrange-recheck]')).toHaveText(/순간 최고음은 재확인 필요 \(배음·잡음 가능성\)/);
  const listen = box.getByRole('button', {name:/순간 최고음 .* 부분 듣기/});
  await expect(listen).toHaveAttribute('data-seek-at', '12.3');
  // The existing tap-to-listen (VZ.analysisPlayAt: 1 s before, play() inside the tap) is reused.
  await page.evaluate(() => { window.__seek = []; const play = VZ.analysisPlayAt; VZ.analysisPlayAt = (player, t) => { window.__seek.push(Number(t)); return play(player, t); }; });
  await listen.click();
  expect(await page.evaluate(() => window.__seek)).toEqual([12.3]);
  await expect(box).toContainText('음역 차이만으로 실력을 판단하지 않아요');
  // Valid E5 is 4 semitones above the score: the measured note is shown as measured, not corrected.
  box = await lab(page, v2({valid:['E5', 7600], instant:['E5', 7610]}));
  await expect(box.locator('[data-vrange-verdict]')).toHaveText('악보보다 4반음 높음');
  await expect(box.locator('[data-vrange-row="valid"]')).toContainText('E5');
  await expect(box.locator('[data-vrange-recheck]')).toHaveCount(0);
  box = await lab(page, v2({valid:['G4', 6700]}));
  await expect(box.locator('[data-vrange-verdict]')).toHaveText('악보보다 5반음 낮음');
  // Low confidence → 판정 보류 (values stay visible).
  box = await lab(page, v2({valid:['E5', 7600], instant:['G5', 7900], pitchConfidence:.5}));
  await expect(box.locator('[data-vrange-verdict]')).toHaveText('판정 보류');
  await expect(box).toContainText('분석 신뢰도가 낮아');
  await expect(box.locator('[data-vrange-recheck]')).toHaveCount(0);
  // An old v1 result still renders and is not compared.
  box = await lab(page, {v:1, metrics:{voicedSeconds:30, stability:{wobbleCents:30, notes:4}, intonation:{meanAbsCents:20, notes:10}, range:{highCents:8100, high:'A5'}, breath:{medianPhrase:2.4}}, confidence:{voiceOverMrDb:12}});
  await expect(page.locator('#view')).toContainText('이전 v1 결과를 보존하고 있어요');
  await expect(page.locator('.vl-single')).toContainText('음정 안정성');
  await expect(page.locator('.vl-single')).toContainText('이전 분석(v1) 결과라 이 지표는 계산하지 않아요'); // v2-only measures skip v1
  await expect(box.locator('[data-vrange-verdict]')).toHaveText('판정 보류');
  await expect(box).toContainText('이전(v1) 분석이라 비교하지 않아요');
  await page.setViewportSize({width:320, height:700});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('vocal lab without a reference offers 설정; a manual range entered there is compared right away', async ({page}) => {
  await localBoot(page);
  const box = await lab(page, v2({valid:['D5', 7400], instant:['D5', 7400]}));
  await expect(box).toContainText('기준 음역 없음');
  await box.getByRole('button', {name:'악보 기준 음역 설정'}).click();
  const sheet = page.getByRole('dialog', {name:'악보 기준 음역'});
  await expect(sheet).toContainText('이 곡에 올린 악보가 없어요');
  await sheet.getByRole('button', {name:'최저음·최고음 고르기'}).click();
  await sheet.getByRole('combobox', {name:'최고음'}).selectOption({label:'C#5'});
  await sheet.getByRole('button', {name:'직접 입력한 음역 저장'}).click();
  await expect(sheet).toHaveCount(0);
  const again = page.locator('[data-vrange]');
  await expect(again).toContainText('직접 입력');
  await expect(again.locator('[data-vrange-verdict]')).toHaveText('일치');
  await expect(again.locator('[data-vrange-row="valid"]')).toContainText('D5 1반음 높음');
});
