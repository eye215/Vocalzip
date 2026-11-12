// 음표로 변환 (OMR PoC, app/score-omr.js): nothing is sent until the owner asks; waiting/failed/done states;
// the converted MusicXML is previewed with OpenSheetMusicDisplay and offered as a download. The PDF is never changed.
const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2, R2} = require('./helpers/r2-fixture.cjs');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const PDF = 'u/ui-test-user/score-1/original.pdf', MXL = 'u/ui-test-user/score-1/omr.mxl';
async function osmd(page) {
  const local = process.env.VZ_OSMD || '/tmp/vzip-osmd/package/build/opensheetmusicdisplay.min.js';
  if (fs.existsSync(local)) await page.context().route('**/opensheetmusicdisplay@2.2.1/build/opensheetmusicdisplay.min.js', r => r.fulfill({path:local, contentType:'text/javascript'}));
}
// A small compressed MusicXML (.mxl = zip of META-INF/container.xml + the score), built here because
// tests/fixtures/ is not committed. Stored (uncompressed) zip entries are enough for MusicXML readers.
function mxl() {
  const crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const score = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>' +
    '<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
    ['C', 'D', 'E', 'F'].map(step => '<note><pitch><step>' + step + '</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>').join('') + '</measure></part></score-partwise>';
  const container = '<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
  const files = [['META-INF/container.xml', container], ['score.xml', score]].map(([name, text]) => ({name:Buffer.from(name), data:Buffer.from(text)}));
  const local = [], central = []; let offset = 0;
  for (const f of files) {
    const crc = crc32(f.data), head = Buffer.alloc(30), dir = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt32LE(crc, 14); head.writeUInt32LE(f.data.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(f.name.length, 26);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(f.data.length, 20); dir.writeUInt32LE(f.data.length, 24); dir.writeUInt16LE(f.name.length, 28); dir.writeUInt32LE(offset, 42);
    local.push(head, f.name, f.data); central.push(dir, f.name); offset += 30 + f.name.length + f.data.length;
  }
  const dirBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dirBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dirBytes, end]);
}
async function fakeOmr(page, fake) {
  const state = {job:null, posts:[]};
  await page.route(R2 + '/v1/omr**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      state.posts.push(JSON.parse(req.postData()));
      state.job = {id:'a'.repeat(24), scoreId:'score-1', status:'queued', created:Date.now(), error:null, resultKey:null, movements:null};
      return route.fulfill({status:201, json:{job:state.job}});
    }
    expect(new URL(req.url()).searchParams.get('score')).toBe('score-1');
    return route.fulfill({json:{job:state.job}});
  });
  return state;
}
async function seed(page, fake) {
  fake.store.set(PDF, {bytes:Buffer.from('%PDF-1.4 score'), type:'application/pdf'});
  await page.evaluate(pdf => VZ.change(db => { db.songs.push({id:'song-omr', title:'Defying Gravity', scores:[{id:'score-1', songId:'song-omr', title:'Defying Gravity 보컬 악보', fileName:'dg.pdf', r2Key:pdf, size:14, uploadedAt:Date.now()}]}); }), PDF);
}
test('Score row offers 음표로 변환; nothing is requested until the owner asks, then waiting, done with preview and download', async ({page}) => {
  const fake = await fakeR2(page); const omr = await fakeOmr(page, fake); await osmd(page);
  await boot(page); await seed(page, fake);
  await page.evaluate(() => { const host = document.createElement('div'); host.id = 'omr-host'; document.querySelector('#view').append(host); VZ.renderScores(host, VZ.song('song-omr')); });
  await page.getByRole('button', {name:'Defying Gravity 보컬 악보 음표로 변환'}).click();
  const sheet = page.getByRole('dialog', {name:'음표로 변환'});
  await expect(sheet).toContainText('GitHub 실행 환경');
  expect(omr.posts).toEqual([]);
  await sheet.getByRole('button', {name:'변환 요청'}).click();
  await expect(sheet).toContainText('변환 차례를 기다리는 중이에요');
  expect(omr.posts).toEqual([{key:PDF}]);
  omr.job = {...omr.job, status:'done', resultKey:MXL, resultSize:500, movements:1};
  fake.store.set(MXL, {bytes:mxl(), type:'application/vnd.recordare.musicxml'});
  await sheet.getByRole('button', {name:'상태 새로고침'}).click();
  await expect(sheet).toContainText('자동 인식 결과예요');
  const download = sheet.getByRole('link', {name:'MusicXML 받기'});
  await expect(download).toHaveAttribute('href', new RegExp('/v1/media/' + MXL.replace(/\//g, '\\/') + '\\?.*download=Defying%20Gravity%20%EB%B3%B4%EC%BB%AC%20%EC%95%85%EB%B3%B4\\.mxl'));
  if (fs.existsSync(process.env.VZ_OSMD || '/tmp/vzip-osmd/package/build/opensheetmusicdisplay.min.js'))
    await expect(sheet.locator('[data-omr-preview] svg').first()).toBeVisible({timeout:15000});
  expect(fake.store.get(PDF).bytes.toString()).toBe('%PDF-1.4 score');
});
test('A failed conversion explains why and can be requested again; deleting the score also removes its result', async ({page}) => {
  const fake = await fakeR2(page); const omr = await fakeOmr(page, fake);
  await boot(page); await seed(page, fake);
  omr.job = {id:'b'.repeat(24), scoreId:'score-1', status:'failed', error:'no-music', resultKey:null};
  await page.evaluate(() => VZ.scoreOmrSheet(VZ.song('song-omr'), VZ.song('song-omr').scores[0]));
  const sheet = page.getByRole('dialog', {name:'음표로 변환'});
  await expect(sheet).toContainText('음표를 찾지 못했어요');
  await sheet.getByRole('button', {name:'다시 변환하기'}).click();
  await expect(sheet).toContainText('기다리는 중');
  await sheet.getByRole('button', {name:'돌아가기'}).click();
  await expect(sheet).toHaveCount(0);
  fake.store.set(MXL, {bytes:Buffer.from('PK..'), type:'application/vnd.recordare.musicxml'});
  await page.evaluate(() => { const host = document.createElement('div'); document.querySelector('#view').append(host); VZ.renderScores(host, VZ.song('song-omr')); });
  await page.locator('[data-score="score-1"] [data-del]').click();
  await page.getByRole('dialog', {name:'악보 삭제'}).getByRole('button', {name:'삭제'}).click();
  await expect.poll(() => [fake.store.has(PDF), fake.store.has(MXL)]).toEqual([false, false]);
});
