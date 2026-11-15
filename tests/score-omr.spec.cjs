// 음표로 변환 (OMR PoC, app/score-omr.js): nothing is sent until the owner asks; waiting/failed/done states;
// the converted MusicXML is previewed with OpenSheetMusicDisplay and offered as a download. The PDF is never changed.
const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
require('./legacy-session-mode.cjs')(test);
const {boot, fakeR2, R2} = require('./helpers/r2-fixture.cjs');
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const PDF = 'u/ui-test-user/score-1/original.pdf', MXL = 'u/ui-test-user/score-1/omr.mxl';
const OSMD = process.env.VZ_OSMD || '/tmp/vzip-osmd/package/build/opensheetmusicdisplay.min.js';
async function osmd(page) {
  const local = OSMD;
  if (fs.existsSync(local)) await page.context().route('**/opensheetmusicdisplay@2.2.1/build/opensheetmusicdisplay.min.js', r => r.fulfill({path:local, contentType:'text/javascript'}));
}
// A small compressed MusicXML (.mxl = zip of META-INF/container.xml + the score), built here because
// tests/fixtures/ is not committed. Stored (uncompressed) zip entries are enough for MusicXML readers.
const ONE_BAR = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
  ['C', 'D', 'E', 'F'].map(step => '<note><pitch><step>' + step + '</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>').join('') + '</measure></part></score-partwise>';
// Two parts (voice + piano), eight wide measures (sixteen sixteenth notes each). `breaks` maps a measure index to the
// <print> attribute that starts a printed line there, the way Audiveris exports it; {} = a file without line breaks.
const BREAKS = {3:'new-system', 5:'new-page'}, LINES = [3, 2, 3];
function wideScore(breaks = BREAKS) {
  const bar = (i, clef) => '<measure number="' + (i + 1) + '">' + (breaks[i] ? '<print ' + breaks[i] + '="yes"/>' : '') +
    (i ? '' : '<attributes><divisions>4</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>' + clef + '</sign><line>' + (clef === 'G' ? 2 : 4) + '</line></clef></attributes>') +
    Array.from({length:16}, (_, n) => '<note><pitch><step>' + 'CDEFGAB'[(i + n) % 7] + '</step><octave>' + (clef === 'G' ? 4 : 3) + '</octave></pitch><duration>1</duration><type>16th</type></note>').join('') + '</measure>';
  const part = (id, clef) => '<part id="' + id + '">' + Array.from({length:8}, (_, i) => bar(i, clef)).join('') + '</part>';
  return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list>' +
    part('P1', 'G') + part('P2', 'F') + '</score-partwise>';
}
function mxl(score = ONE_BAR) {
  const crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
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

// ── Preview layout: the file's own line breaks by default, the library's breaks as the other choice ──
// Counted from the drawn SVG in one step: the library draws one g.staffline per staff and line, so the lines are the
// groups of the first staff, and the measures of a line are the distinct g.vf-measure ids inside it (id -1 is the
// library's extra key/time warning at a line end, not a measure of the file).
const drawn = page => page.evaluate(() => {
  const svg = document.querySelector('[data-omr-preview] svg'), first = svg?.querySelector('g.staffline')?.id;
  return first ? [...svg.querySelectorAll('g.staffline')].filter(g => g.id === first).map(g => new Set([...g.querySelectorAll('g.vf-measure')].map(m => m.id).filter(id => +id >= 0)).size) : null;
});
const box = page => page.evaluate(() => {
  const p = document.querySelector('[data-omr-preview]'), svg = p.querySelector('svg'), r = p.getBoundingClientRect();
  return {width:p.clientWidth, scroll:p.scrollWidth, right:Math.round(r.right), svg:Math.round(svg.getBoundingClientRect().width), svgs:p.querySelectorAll('svg').length, canvases:p.querySelectorAll('canvas').length,
    pageOverflow:document.documentElement.scrollWidth - innerWidth, view:innerWidth};
});
async function openDone(page, score, size = {width:375, height:812}) {
  await page.setViewportSize(size);
  const fake = await fakeR2(page); const omr = await fakeOmr(page, fake); await osmd(page);
  await boot(page); await seed(page, fake);
  omr.job = {id:'c'.repeat(24), scoreId:'score-1', status:'done', created:Date.now(), error:null, resultKey:MXL, resultSize:500, movements:1};
  fake.store.set(MXL, {bytes:mxl(score), type:'application/vnd.recordare.musicxml'});
  return openSheet(page);
}
async function openSheet(page) {
  await page.evaluate(() => VZ.scoreOmrSheet(VZ.song('song-omr'), VZ.song('song-omr').scores[0]));
  const sheet = page.getByRole('dialog', {name:'음표로 변환'});
  await expect(sheet.locator('[data-omr-preview] svg').first()).toBeVisible({timeout:15000});
  return sheet;
}
test.describe('Converted score preview layout', () => {
  test.skip(!fs.existsSync(OSMD), 'needs the OpenSheetMusicDisplay 2.2.1 bundle (ui-checks.yml unpacks it to /tmp/vzip-osmd)');
  test('On a phone the preview keeps the measures per line of the printed score, fitted to the box without page overflow', async ({page}) => {
    const sheet = await openDone(page, wideScore());
    await expect(sheet.getByRole('button', {name:'악보 줄바꿈대로'})).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', {name:'화면에 맞게 크게'})).toHaveAttribute('aria-pressed', 'false');
    expect(await drawn(page)).toEqual(LINES);
    const b = await box(page);
    expect(b.svg).toBeLessThanOrEqual(b.width); expect(b.scroll).toBeLessThanOrEqual(b.width);   // the whole line is visible, nothing to scroll sideways
    expect(b.right).toBeLessThanOrEqual(b.view); expect(b.pageOverflow).toBeLessThanOrEqual(0);
    expect([b.svgs, b.canvases]).toEqual([1, 0]);   // vector drawing: stays sharp at any size
    for (const name of ['악보 줄바꿈대로', '화면에 맞게 크게', '작게 보기', '크게 보기', '화면 맞춤']) {
      const r = await sheet.getByRole('button', {name}).boundingBox();
      expect(Math.min(r.width, r.height), name).toBeGreaterThanOrEqual(44);
    }
    await expect(sheet.getByRole('link', {name:'MusicXML 받기'})).toBeVisible();
  });
  test('화면에 맞게 크게 lets the library break the lines for the screen, and the choice is remembered on this device', async ({page}) => {
    const sheet = await openDone(page, wideScore());
    expect(await drawn(page)).toEqual(LINES);
    await sheet.getByRole('button', {name:'화면에 맞게 크게'}).click();
    await expect(sheet.getByRole('button', {name:'화면에 맞게 크게'})).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await drawn(page))?.length).toBeGreaterThan(LINES.length);   // fewer measures per line at readable size
    const b = await box(page);
    expect(b.svg).toBeLessThanOrEqual(b.width); expect(b.pageOverflow).toBeLessThanOrEqual(0); expect(b.svgs).toBe(1);
    await page.reload();
    await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!window.vzipCloudSignedIn?.() && !!VZ.song('song-omr'))).toBe(true);
    const again = await openSheet(page);
    await expect(again.getByRole('button', {name:'화면에 맞게 크게'})).toHaveAttribute('aria-pressed', 'true');
    expect((await drawn(page)).length).toBeGreaterThan(LINES.length);
    await again.getByRole('button', {name:'악보 줄바꿈대로'}).click();
    await expect.poll(() => drawn(page)).toEqual(LINES);
    expect(await page.evaluate(() => localStorage.getItem('vzip_omr_layout_v1'))).toBe('score');
  });
  test('＋ and − resize the drawing inside the preview only; 화면 맞춤 returns to the fitted size; turning the phone redraws once', async ({page}) => {
    const sheet = await openDone(page, wideScore());
    const fit = await box(page), out = sheet.getByRole('button', {name:'작게 보기'}), into = sheet.getByRole('button', {name:'크게 보기'});
    await expect(out).toBeDisabled();
    await into.click(); await into.click();
    await expect(sheet.locator('[data-omr-scale]')).toHaveText('2배');
    const big = await box(page);
    expect(big.svg).toBe(fit.svg * 2); expect(big.scroll).toBeGreaterThan(big.width);   // scrolls sideways inside the preview…
    expect([big.width, big.right]).toEqual([fit.width, fit.right]); expect(big.pageOverflow).toBeLessThanOrEqual(0);   // …while the page itself stays put
    expect(await drawn(page)).toEqual(LINES);   // zooming never moves a measure to another line
    const [sideways, touch] = await sheet.locator('[data-omr-preview]').evaluate(p => { p.scrollLeft = 99999; p.scrollTop = 99999; return [p.scrollLeft > 0, getComputedStyle(p).touchAction]; });
    expect(sideways).toBe(true); expect(['auto', 'manipulation', 'pan-x pan-y pinch-zoom']).toContain(touch);   // panning and pinch are not blocked
    await out.click();
    await expect(sheet.locator('[data-omr-scale]')).toHaveText('1.5배');
    await sheet.getByRole('button', {name:'화면 맞춤'}).click();
    await expect(sheet.locator('[data-omr-scale]')).toHaveText('1배');
    expect((await box(page)).svg).toBe(fit.svg);
    while (await into.isEnabled()) await into.click();   // the largest step is bounded
    expect((await box(page)).svg).toBeLessThanOrEqual(fit.svg * 8);
    await sheet.getByRole('button', {name:'화면 맞춤'}).click();
    await page.setViewportSize({width:812, height:375});
    await expect.poll(async () => (await box(page)).svg).toBeGreaterThan(fit.svg);
    const turned = await box(page);
    expect(turned.svg).toBeLessThanOrEqual(turned.width); expect(turned.svgs).toBe(1); expect(turned.pageOverflow).toBeLessThanOrEqual(0);
    expect(await drawn(page)).toEqual(LINES);
  });
  test('A file without line breaks is drawn the way the library lays it out, with no switch', async ({page}) => {
    const sheet = await openDone(page, wideScore({}));
    await expect(sheet.locator('[data-omr-mode]')).toBeHidden();
    await expect(sheet.getByRole('button', {name:'크게 보기'})).toBeVisible();
    const lines = await drawn(page);
    expect(lines.reduce((a, n) => a + n, 0)).toBe(8); expect(lines.length).toBeGreaterThan(LINES.length);
    const b = await box(page);
    expect(b.svg).toBeLessThanOrEqual(b.width); expect(b.pageOverflow).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => localStorage.getItem('vzip_omr_layout_v1'))).toBe(null);   // the saved choice is left alone
  });
  test('Tablet 1024×768: the printed lines are kept and fill the preview', async ({page}, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
    const sheet = await openDone(page, wideScore(), {width:1024, height:768});
    expect(await drawn(page)).toEqual(LINES);
    const b = await box(page);
    expect(b.svg).toBeLessThanOrEqual(b.width); expect(b.svg).toBeGreaterThan(b.width - 40); expect(b.scroll).toBeLessThanOrEqual(b.width); expect(b.pageOverflow).toBeLessThanOrEqual(0);
    await sheet.getByRole('button', {name:'화면에 맞게 크게'}).click();
    await expect.poll(async () => (await drawn(page))?.length).not.toBe(LINES.length);
    await page.setViewportSize({width:768, height:1024});
    await sheet.getByRole('button', {name:'악보 줄바꿈대로'}).click();
    await expect.poll(() => drawn(page)).toEqual(LINES);
    expect((await box(page)).svgs).toBe(1);
  });
});
