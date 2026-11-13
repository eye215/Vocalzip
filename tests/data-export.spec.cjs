// 설정 › 관리 › 내 데이터 내보내기: records JSON/CSV and original files as STORE ZIP parts, read-only, against the fake R2.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib'), {spawnSync} = require('node:child_process');
const {KEY, R2, boot, fakeR2, wav} = require('./helpers/r2-fixture.cjs');
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

const U = 'u/ui-test-user/';
const bytes = (n, seed) => { const b = Buffer.alloc(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; } return b; };
const FILES = {
  pdf: Buffer.concat([Buffer.from('%PDF-1.4\n'), bytes(30000, 1)]), mxl: Buffer.concat([Buffer.from('PK'), bytes(5000, 2)]), mp3: bytes(42000, 3),
  r1: bytes(120000, 4), r2: bytes(80000, 5), r3: bytes(64000, 6), d1: wav(1)
};
const day = (y, m, d) => new Date(y, m - 1, d, 20, 0, 0).getTime();
async function seed(page, r2) {
  const put = (key, buf, type) => r2.store.set(key, {bytes:buf, type, etag:'"e' + key.length + '"'});
  put(U + 'sc1/original.pdf', FILES.pdf, 'application/pdf'); put(U + 'sc1/omr.mxl', FILES.mxl, 'application/vnd.recordare.musicxml');
  put(U + 'sc2/original.pdf', FILES.pdf, 'application/pdf'); // no omr.mxl for this one: optional, recorded as absent
  put(U + 'mr1/original.mp3', FILES.mp3, 'audio/mpeg');
  put(U + 'r1/original.m4a', FILES.r1, 'audio/mp4'); put(U + 'r2/original.m4a', FILES.r2, 'audio/mp4'); put(U + 'r3/original.m4a', FILES.r3, 'audio/mp4');
  await page.addInitScript(([k, scores]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem(k, JSON.stringify({categories:[], lessons:[], assignments:[], practices:[{id:'p1', date:'2026-10-03', minutes:20, songId:'s1', mediaIds:['r1']}], comparisonReports:[], settings:{dailyTargetMinutes:40},
      songs:[{id:'s1', title:'Defying Gravity', scores, mrTracks:[{id:'mr1', kind:'file', title:'MR 반주', fileName:'mr.mp3', type:'audio/mpeg', r2Key:'u/ui-test-user/mr1/original.mp3', size:42000, created:Date.UTC(2026, 9, 2, 3)},
        {id:'yt1', kind:'youtube', title:'유튜브 MR', url:'https://www.youtube.com/watch?v=abcdefghijk'}]}]}));
    sessionStorage.setItem('seeded', '1');
  }, [KEY, [
    {id:'sc1', songId:'s1', title:'위키드 악보', fileName:'wicked.pdf', r2Key:U + 'sc1/original.pdf', size:FILES.pdf.length, uploadedAt:Date.UTC(2026, 9, 1, 3)},
    {id:'sc2', songId:'s1', title:'위키드 악보', fileName:'wicked2.pdf', r2Key:U + 'sc2/original.pdf', size:FILES.pdf.length, uploadedAt:Date.UTC(2026, 9, 1, 4)},
    {id:'gone', songId:'s1', title:'지운 악보', r2Key:U + 'gone/original.pdf', size:10, uploadedAt:1, deleted:true}]]);
  await boot(page);
  await page.evaluate(async ([rows, d1]) => {
    VZ.media.holdBackup(true); // keep the app's own device→cloud backup out of this test (it is not part of the export)
    for (const r of rows) window.__rows[r.id] = r;
    await window.vzipStorePracticeMedia({id:'d1', name:'기기 녹음', type:'audio/wav', created:d1.created, recordedDate:'2026-11-05', dateSource:'manual', source:'practice', blob:new Blob([new Uint8Array(d1.bytes)], {type:'audio/wav'})});
    VZ.media.invalidate();
  }, [[
    {id:'r1', name:'Defying Gravity 2026.10.03', songId:'s1', type:'audio/mp4', storageProvider:'r2', r2Key:U + 'r1/original.m4a', size:FILES.r1.length, created:day(2026, 10, 3), recordedDate:'2026-10-03', dateSource:'metadata', source:'import',
      analysis:{v:2, at:1, seconds:60, metrics:{voicedSeconds:41.5, intonation:{meanAbsCents:12.3}, range:{low:'A3', high:'E5'}}}},
    {id:'r2', name:'Defying Gravity 2026.10.03', songId:'s1', type:'audio/mp4', storageProvider:'r2', r2Key:U + 'r2/original.m4a', size:FILES.r2.length, created:day(2026, 10, 3) + 1000, recordedDate:'2026-10-03', dateSource:'filename', source:'import'},
    {id:'r3', name:'레슨: 고음/호흡?', type:'audio/mp4', storageProvider:'r2', r2Key:U + 'r3/original.m4a', size:FILES.r3.length, created:day(2026, 11, 2), recordedDate:'2026-11-02', dateSource:'metadata', source:'lesson'}
  ], {created:day(2026, 11, 5), bytes:[...FILES.d1]}]);
}
/** Central-directory reader (STORE only), independent of the app's writer. */
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), count = buf.readUInt16LE(eocd + 10), out = {};
  for (let i = 0, p = buf.readUInt32LE(eocd + 16); i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 24), nameLen = buf.readUInt16LE(p + 28), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'), start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    expect(method).toBe(0);
    out[name] = buf.subarray(start, start + size);
    expect(zlib.crc32(out[name])).toBe(crc);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}
function externalCheck(file) {
  if (!spawnSync('unzip', ['-v'], {stdio:'ignore'}).error) { const r = spawnSync('unzip', ['-t', file], {encoding:'utf8'}); expect(r.status, r.stdout + r.stderr).toBe(0); }
  if (!spawnSync('python3', ['--version'], {stdio:'ignore'}).error) { const r = spawnSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert all(i.compress_type==0 for i in z.infolist())', file], {encoding:'utf8'}); expect(r.status, r.stderr).toBe(0); }
}
async function saved(download) { const file = path.join(os.tmpdir(), 'vzexp-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.zip'); await download.saveAs(file); return file; }
/** Every request that could change something on a server, from now on. */
function watchWrites(page) {
  const writes = [];
  page.on('request', req => { const m = req.method(), u = new URL(req.url()); if (!['GET', 'HEAD', 'OPTIONS'].includes(m) && !(m === 'POST' && u.origin === R2 && u.pathname === '/v1/sign')) writes.push(m + ' ' + u.pathname); });
  return writes;
}
const stubState = page => page.evaluate(() => JSON.stringify({up:window.__up.length, writes:(window.__writes || []).length, removed:window.__removed.length, rows:Object.keys(window.__rows).sort(), vd:window.__vdRow?.updated_at || null}));
function checkParts(one, two) {
  const a = unzip(one), b = unzip(two);
  expect(Object.keys(a).sort()).toEqual(['MR/Defying Gravity/MR 반주.mp3', 'manifest.json', '기록/recordings.csv', '기록/vocalzip-records.json',
    '악보/Defying Gravity/2026-10-01 위키드 악보 (2).pdf', '악보/Defying Gravity/2026-10-01 위키드 악보.mxl', '악보/Defying Gravity/2026-10-01 위키드 악보.pdf'].sort());
  expect(a['악보/Defying Gravity/2026-10-01 위키드 악보.pdf'].equals(FILES.pdf)).toBe(true);
  expect(a['악보/Defying Gravity/2026-10-01 위키드 악보.mxl'].equals(FILES.mxl)).toBe(true);
  expect(a['MR/Defying Gravity/MR 반주.mp3'].equals(FILES.mp3)).toBe(true);
  const m1 = JSON.parse(a['manifest.json']);
  expect(m1.part).toMatchObject({number:1, total:2, label:'악보·MR·공연 자료'});
  expect(m1.files.map(f => [f.path.split('/').pop(), f.kind, f.id, f.status])).toEqual([
    ['2026-10-01 위키드 악보.pdf', 'score', 'sc1', 'ok'], ['2026-10-01 위키드 악보.mxl', 'omr', 'sc1', 'ok'],
    ['2026-10-01 위키드 악보 (2).pdf', 'score', 'sc2', 'ok'], ['2026-10-01 위키드 악보 (2).mxl', 'omr', 'sc2', 'absent'], ['MR 반주.mp3', 'mr', 'mr1', 'ok']]);
  expect(Object.keys(b).sort()).toEqual(['manifest.json', '녹음/2026-10/2026-10-03 Defying Gravity (2).m4a', '녹음/2026-10/2026-10-03 Defying Gravity.m4a', '녹음/2026-11/2026-11-02 레슨_ 고음_호흡_.m4a', '녹음/2026-11/2026-11-05 기기 녹음.wav'].sort());
  expect(b['녹음/2026-10/2026-10-03 Defying Gravity.m4a'].equals(FILES.r1)).toBe(true);
  expect(b['녹음/2026-10/2026-10-03 Defying Gravity (2).m4a'].equals(FILES.r2)).toBe(true);
  expect(b['녹음/2026-11/2026-11-02 레슨_ 고음_호흡_.m4a'].equals(FILES.r3)).toBe(true);
  expect(b['녹음/2026-11/2026-11-05 기기 녹음.wav'].equals(FILES.d1)).toBe(true);
  const m2 = JSON.parse(b['manifest.json']);
  expect(m2.files.map(f => [f.id, f.source, f.status, f.crc32])).toEqual([['r1', 'cloud', 'ok', zlib.crc32(FILES.r1).toString(16).padStart(8, '0')], ['r2', 'cloud', 'ok', expect.any(String)], ['r3', 'cloud', 'ok', expect.any(String)], ['d1', 'device', 'ok', expect.any(String)]]);
  const records = JSON.parse(a['기록/vocalzip-records.json']);
  expect(records.files.recordings.map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'd1']);
}

test('설정 › 관리 opens 내 데이터 내보내기; 기록 JSON and 녹음 CSV hold the app record and every file’s metadata', async ({page}) => {
  test.setTimeout(60000);
  const r2 = await fakeR2(page);
  await seed(page, r2);
  await page.goto('/#/settings');
  const row = page.getByRole('link', {name:/내 데이터 내보내기/});
  await expect(row).toBeVisible();
  expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await row.click();
  await expect(page).toHaveURL(/#\/data-export$/);
  await expect(page.locator('.vz-export-stats')).toContainText('녹음4개');
  await expect(page.locator('.vz-export-total')).toContainText(/KB|MB/);
  const writes = watchWrites(page), before = await stubState(page);
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'기록 JSON'}).click()]);
  expect(json.suggestedFilename()).toMatch(/^vocalzip-records-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(fs.readFileSync(await json.path(), 'utf8'));
  expect(data).toMatchObject({format:'vocalzip-records-export', version:1, account:{id:'ui-test-user'}, counts:{songs:1, recordings:4, scores:2, mrFiles:1}});
  expect(data.records.songs[0]).toMatchObject({id:'s1', title:'Defying Gravity'});
  expect(data.records.settings).toEqual({dailyTargetMinutes:40});
  expect(data.records.practices[0].mediaIds).toEqual(['r1']);
  const rec = Object.fromEntries(data.files.recordings.map(r => [r.id, r]));
  expect(rec.r1).toMatchObject({name:'Defying Gravity 2026.10.03', date:'2026-10-03', dateSource:'metadata', songId:'s1', songTitle:'Defying Gravity', practiceId:'p1', r2Key:U + 'r1/original.m4a', size:FILES.r1.length,
    storage:'r2', exportPath:'녹음/2026-10/2026-10-03 Defying Gravity.m4a', analysis:{v:2, metrics:{voicedSeconds:41.5}}});
  expect(rec.r2).toMatchObject({dateSource:'filename', exportPath:'녹음/2026-10/2026-10-03 Defying Gravity (2).m4a'});
  expect(rec.d1).toMatchObject({onDevice:true, inCloud:false, storage:'device', dateSource:'manual', exportPath:'녹음/2026-11/2026-11-05 기기 녹음.wav'});
  expect(data.files.library.map(f => [f.kind, f.id, f.exportPath])).toEqual([
    ['score', 'sc1', '악보/Defying Gravity/2026-10-01 위키드 악보.pdf'], ['omr', 'sc1', '악보/Defying Gravity/2026-10-01 위키드 악보.mxl'],
    ['score', 'sc2', '악보/Defying Gravity/2026-10-01 위키드 악보 (2).pdf'], ['omr', 'sc2', '악보/Defying Gravity/2026-10-01 위키드 악보 (2).mxl'], ['mr', 'mr1', 'MR/Defying Gravity/MR 반주.mp3']]);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'녹음 목록 CSV'}).click()]);
  const text = fs.readFileSync(await csv.path(), 'utf8');
  expect(text.startsWith('﻿날짜,날짜 근거,제목,곡,분류,구분,')).toBe(true);
  const lines = text.trim().split('\r\n');
  expect(lines).toHaveLength(5);
  expect(lines[1]).toContain('2026-10-03,파일 정보,Defying Gravity 2026.10.03,Defying Gravity,곡 녹음,연습');
  expect(lines[1]).toContain(',v2,12.3,A3~E5,41.5,');
  expect(lines[4]).toContain('기기 녹음');
  expect(writes).toEqual([]);
  expect(await stubState(page)).toBe(before);
});

test('원본 파일: two ZIP parts with the original bytes, a retry after a failed download, and no write request', async ({page}) => {
  test.setTimeout(90000);
  const r2 = await fakeR2(page);
  let failR1 = true, r1Hits = 0;
  // Registered after the fake Worker, so it answers first for this one file.
  await page.route(R2 + '/v1/media/' + U + 'r1/original.m4a*', route => { if (route.request().method() === 'GET') r1Hits++; return failR1 ? route.fulfill({status:503, headers:{'access-control-allow-origin':'*'}, body:'busy'}) : route.fallback(); });
  await seed(page, r2);
  await page.goto('/#/data-export');
  await expect(page.locator('.vz-export-stats')).toBeVisible();
  const perPart = page.getByText('파트마다 다운로드'); // the folder choice exists only where the File System Access API does
  if (await perPart.count()) await perPart.click();
  await expect(page.locator('.vz-export-parts li')).toHaveCount(2);
  await expect(page.locator('.vz-export-parts li').first()).toContainText('악보·MR·공연 자료');
  await expect(page.locator('.vz-export-parts li').nth(1)).toContainText('2026.10–2026.11');
  const writes = watchWrites(page), before = await stubState(page), downloads = [];
  page.on('download', d => downloads.push(d));
  await page.getByRole('button', {name:'원본 파일 내보내기 시작'}).click();
  await expect.poll(() => downloads.length).toBe(1);
  expect(downloads[0].suggestedFilename()).toMatch(/^vocalzip-files-\d{4}-\d{2}-\d{2}-01of02\.zip$/);
  // r1 keeps failing: three tries, then the export stops on that file and offers a retry (nothing half-written).
  await expect(page.locator('.vz-export-fail')).toContainText('2026-10-03 Defying Gravity.m4a', {timeout:20000});
  await expect(page.locator('.vz-export-fail')).toContainText('503');
  expect(r1Hits).toBe(3);
  await expect(page.locator('[data-part="1"]')).toHaveAttribute('data-status', 'failed');
  failR1 = false;
  await page.getByRole('button', {name:'다시 시도'}).click();
  await expect.poll(() => downloads.length).toBe(2);
  await expect(page.getByRole('status').filter({hasText:'모든 파트를'})).toBeVisible();
  const [one, two] = await Promise.all(downloads.map(saved));
  checkParts(fs.readFileSync(one), fs.readFileSync(two));
  externalCheck(one); externalCheck(two);
  // Read-only: only signing (POST /v1/sign) and GETs went out; no row, upload or delete changed.
  expect(writes).toEqual([]);
  expect(r2.calls.filter(c => /^(PUT|DELETE|PATCH)|^POST \/v1\/(uploads|media)|^POST \/v2/.test(c))).toEqual([]);
  expect(await stubState(page)).toBe(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vzip_data_export_v1') || 'null')?.saved?.length)).toBe(2);
  // Closing and opening it again: both parts are remembered as saved.
  await page.getByRole('button', {name:'닫기'}).click();
  await page.goto('/#/settings'); await page.goto('/#/data-export');
  await expect(page.locator('.vz-export-ok')).toContainText('모든 파트를 저장했어요');
  await expect(page.getByRole('button', {name:'처음부터 다시 받기'})).toBeVisible();
  for (const f of [one, two]) fs.rmSync(f, {force:true});
});

test('iPhone: one part in memory at a time — the next part is built after a tap; pause and resume keep the part', async ({browser}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', viewport:{width:390, height:844}, isMobile:true, hasTouch:true, acceptDownloads:true});
  await context.addInitScript(() => { window.VZIP_DEVICE_SESSIONS_ENABLED = false; window.VZIP_APPROVED_HOME_ENABLED = false; });
  const page = await context.newPage();
  const r2 = await fakeR2(page);
  let hold = null;
  await page.route(R2 + '/v1/media/' + U + 'r2/original.m4a*', async route => { if (hold) await hold; try { await route.fallback(); } catch {} });
  await seed(page, r2);
  await page.goto('/#/data-export');
  await expect(page.locator('.vz-export-stats')).toBeVisible();
  await expect(page.locator('.vz-export-dest')).toHaveCount(0); // no folder picker on iPhone Safari
  await expect(page.locator('[data-limit="250"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('iPhone에서는 파트 하나를 저장할 때마다')).toBeVisible();
  const awake = () => page.evaluate(() => !!document.querySelector('[data-pause]'));
  const downloads = []; page.on('download', d => downloads.push(d));
  await page.getByRole('button', {name:'원본 파일 내보내기 시작'}).click();
  await expect.poll(() => downloads.length).toBe(1);
  const next = page.getByRole('button', {name:/다음 파트 만들기 \(2\/2\)/});
  await expect(next).toBeVisible();
  await page.waitForTimeout(500);
  expect(downloads).toHaveLength(1);
  await expect(page.getByRole('button', {name:'방금 파트 다시 저장'})).toBeVisible();
  let release; hold = new Promise(r => { release = r; });
  await next.click();
  await expect.poll(awake).toBe(true);
  await page.getByRole('button', {name:'잠시 멈추기'}).click();
  await expect(page.getByRole('button', {name:'이어서 받기'})).toBeVisible();
  await expect(page.locator('[data-part="1"]')).toHaveAttribute('data-status', 'paused');
  hold = null; release();
  await page.getByRole('button', {name:'이어서 받기'}).click();
  await expect.poll(() => downloads.length).toBe(2);
  const [one, two] = await Promise.all(downloads.map(saved));
  checkParts(fs.readFileSync(one), fs.readFileSync(two));
  for (const f of [one, two]) fs.rmSync(f, {force:true});
  expect(page.__errors || []).toEqual([]);
  await context.close();
});

test('Export buttons stay on the export screen: same-named buttons on the recorder and the practice set never reach the export', async ({page}) => {
  test.setTimeout(60000);
  const r2 = await fakeR2(page);
  await seed(page, r2);
  const downloads = []; page.on('download', d => downloads.push(d));
  const originals = () => r2.calls.filter(c => /^GET \/v1\/media\//.test(c)).length;
  // Twice, as the screen is often opened more than once: every visit used to add another handler to #view.
  await page.goto('/#/data-export'); await expect(page.locator('.vz-export-stats')).toBeVisible();
  await page.goto('/#/settings'); await page.goto('/#/data-export'); await expect(page.locator('.vz-export-stats')).toBeVisible();
  await expect(page.getByRole('button', {name:'원본 파일 내보내기 시작'})).toBeVisible();
  const fetched = originals(), before = await page.evaluate(() => localStorage.getItem('vzip_data_export_v1'));
  // Recorder: 취소 (data-cancel) asks only about the recording.
  await page.goto('/#/record');
  await page.getByRole('button', {name:'녹음 시작'}).click();
  const cancel = page.locator('.rec-controls [data-cancel]');
  await expect(cancel).toBeEnabled();
  await cancel.click();
  await expect(page.getByRole('dialog', {name:'녹음 취소'})).toBeVisible();
  await expect(page.getByRole('dialog', {name:'내보내기 그만두기'})).toHaveCount(0);
  await expect(page.locator('.sheet-back')).toHaveCount(1);
  await page.locator('.sheet-back [data-ok]').click();
  await expect(page.locator('.sheet-back')).toHaveCount(0);
  // Practice set: 시작하기 (data-start) starts the set, not a download of every original; data-next / data-resume / data-reset do nothing to the export.
  await page.goto('/#/practice-set');
  const start = page.locator('#view [data-start]');
  if (await page.locator('#view [data-add]').count() && await start.isDisabled()) await page.evaluate(() => document.querySelector('#view [data-start]').removeAttribute('disabled'));
  await start.click();
  await page.evaluate(() => {
    const view = document.getElementById('view');
    for (const name of ['start', 'next', 'resume', 'retry', 'skip', 'again', 'reset', 'cancel', 'pause', 'reload']) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-' + name, ''); b.hidden = true; view.append(b); b.click(); b.remove();
    }
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'vz-export-mode'; radio.value = 'download'; radio.hidden = true; view.append(radio);
    radio.checked = true; radio.dispatchEvent(new Event('change', {bubbles:true})); radio.remove();
  });
  await page.waitForTimeout(700);
  await expect(page.getByRole('dialog', {name:'내보내기 그만두기'})).toHaveCount(0);
  await expect(page.getByRole('dialog', {name:'원본 파일 내보내기'})).toHaveCount(0);
  expect(downloads).toHaveLength(0);
  expect(originals()).toBe(fetched);
  expect(await page.evaluate(() => localStorage.getItem('vzip_data_export_v1'))).toBe(before);
  // Back on the export screen nothing was started and its own buttons still work.
  await page.goto('/#/data-export');
  await expect(page.getByRole('button', {name:'원본 파일 내보내기 시작'})).toBeVisible();
  await expect(page.locator('[data-pause],[data-resume],[data-next]')).toHaveCount(0);
  await page.locator('[data-limit="250"]').click();
  await expect(page.locator('[data-limit="250"]')).toHaveAttribute('aria-pressed', 'true');
});

test('Leaving a running export stops it, even between two files; coming back offers to continue', async ({page}, info) => {
  test.skip(info.project.name.startsWith('webkit'), 'Chromium-only API (folder mode keeps the part on disk while it is written)');
  test.setTimeout(60000);
  const r2 = await fakeR2(page);
  await page.addInitScript(() => {
    window.__folder = {}; window.__writes = 0;
    window.showDirectoryPicker = async () => ({getFileHandle:async name => ({createWritable:async () => {
      const chunks = []; return {write:async c => { window.__writes++; if (window.__holdWrite) await window.__holdWrite; chunks.push(c instanceof Blob ? new Uint8Array(await c.arrayBuffer()) : new Uint8Array(c)); }, close:async () => { window.__folder[name] = new Blob(chunks); }, abort:async () => {}};
    }})});
  });
  await seed(page, r2);
  await page.goto('/#/data-export');
  await expect(page.locator('.vz-export-stats')).toBeVisible();
  await expect(page.getByLabel(/폴더에 바로 저장/)).toBeChecked();
  const originals = () => r2.calls.filter(c => /^GET \/v1\/media\//.test(c)).length;
  // The first file is being written into the ZIP (no download is in flight) when the user leaves.
  await page.evaluate(() => { window.__holdWrite = new Promise(r => { window.__releaseWrite = r; }); });
  await page.getByRole('button', {name:'원본 파일 내보내기 시작'}).click();
  await expect.poll(() => page.evaluate(() => window.__writes)).toBeGreaterThan(0);
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.getByRole('dialog', {name:'나가기'}).getByRole('button', {name:'나가기'}).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('body')).toHaveAttribute('data-vz-route', 'settings');
  const fetched = originals();
  await page.evaluate(() => { window.__holdWrite = null; window.__releaseWrite(); });
  await page.waitForTimeout(1500);
  expect(originals()).toBe(fetched);
  expect(await page.evaluate(() => Object.keys(window.__folder))).toEqual([]);
  // Back on the screen: paused, nothing lost; 이어서 받기 finishes both parts.
  await page.goto('/#/data-export');
  await expect(page.getByRole('button', {name:'이어서 받기'})).toBeVisible();
  await page.getByRole('button', {name:'이어서 받기'}).click();
  await expect(page.getByRole('status').filter({hasText:'폴더에 저장했어요'})).toBeVisible({timeout:20000});
  const files = await page.evaluate(async () => Object.fromEntries(await Promise.all(Object.entries(window.__folder).map(async ([k, b]) =>
    [k, await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); })]))));
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(2);
  checkParts(Buffer.from(files[names[0]], 'base64'), Buffer.from(files[names[1]], 'base64'));
});

test('Folder mode streams each part into the chosen folder (File System Access API)', async ({page}, info) => {
  test.skip(info.project.name.startsWith('webkit'), 'Chromium-only API; the download path is covered above');
  test.setTimeout(60000);
  const r2 = await fakeR2(page);
  await page.addInitScript(() => {
    window.__folder = {};
    window.showDirectoryPicker = async () => ({getFileHandle:async name => ({createWritable:async () => {
      const chunks = []; return {write:async c => { chunks.push(c instanceof Blob ? new Uint8Array(await c.arrayBuffer()) : new Uint8Array(c)); }, close:async () => { window.__folder[name] = new Blob(chunks); }, abort:async () => {}};
    }})});
  });
  await seed(page, r2);
  await page.goto('/#/data-export');
  await expect(page.locator('.vz-export-stats')).toBeVisible();
  await expect(page.getByLabel(/폴더에 바로 저장/)).toBeChecked();
  const writes = watchWrites(page);
  await page.getByRole('button', {name:'원본 파일 내보내기 시작'}).click();
  await expect(page.getByRole('status').filter({hasText:'폴더에 저장했어요'})).toBeVisible({timeout:20000});
  const files = await page.evaluate(async () => Object.fromEntries(await Promise.all(Object.entries(window.__folder).map(async ([k, b]) =>
    [k, await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); })]))));
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(2);
  checkParts(Buffer.from(files[names[0]], 'base64'), Buffer.from(files[names[1]], 'base64'));
  expect(writes).toEqual([]);
});
