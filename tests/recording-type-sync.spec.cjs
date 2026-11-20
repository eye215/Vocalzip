// 녹음 유형 동기화 (2026-11-20): a recording's 녹음 유형 (`recordingCategory`) and 공연 mark (`occasion`) are the same on two
// devices after sync. The real storage/sync layer runs here (app/media.js, cloud-sync.js, r2-storage.js) against the
// fixture server; "device B" is a second browser context that starts from the server rows device A left behind.
//  1. a type chosen on device A before the file is backed up goes up with the file (new-file metadata + backup extras);
//  2. an `occasion` edit made on a device copy reaches the cloud row (EDITABLE in cloud-sync.js);
//  3. one type change is one cloud write (`cloudDone` on the type event), so a later choice made on another device is
//     not overwritten by a second send;
//  4. nothing is backfilled: a file whose type was never chosen goes up without `recordingCategory`, and cloud rows
//     without the field are left as they are (their type stays derived — tests/recording-type-characterization.spec.cjs).
// No real account, file or server is used.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, boot, fakeR2, wav} = require('./helpers/r2-fixture.cjs');

const DAY = '2026-11-09', WAV = wav(1).toString('base64');
const DB = {categories:[], songs:[{id:'s1', title:'Defying Gravity'}], lessons:[], assignments:[], practices:[], comparisonReports:[]};
const cloudRow = (id, extra = {}) => ({id, name:'클라우드 ' + id, created:new Date(2026, 10, 9, 12).getTime(), recordedDate:DAY, type:'audio/mp4', durationSeconds:60, songId:'', song:'', source:'practice',
  storageProvider:'r2', r2Key:'u/ui-test-user/' + id + '/original.m4a', size:200000, ...extra});

/** One device: its own browser storage; the server starts with `server` (rows + their versions). */
async function device(page, server = {rows:{}, upd:{}}) {
  await page.addInitScript(([k, db, rows, upd]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, db); sessionStorage.setItem('seeded', '1'); }
    window.__rows = JSON.parse(rows); window.__upd = JSON.parse(upd);
  }, [KEY, JSON.stringify(DB), JSON.stringify(server.rows), JSON.stringify(server.upd)]);
  await fakeR2(page);
  await boot(page);
  // Nothing goes up until the test says so: "before backup" is a state the test controls.
  await page.evaluate(() => VZ.media.holdBackup(true));
}
/** What the server holds now — handed to the next device. */
const serverOf = page => page.evaluate(() => ({rows:JSON.parse(JSON.stringify(window.__rows)), upd:{...window.__upd}}));
/** A recording made on this device (not in the cloud yet). */
const record = (page, id, extra = {}) => page.evaluate(async ([id, b64, day, extra]) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await window.vzipStorePracticeMedia({id, name:'기기 녹음 ' + id, created:new Date(2026, 10, 9, 12).getTime(), recordedDate:day, dateSource:'recorded', type:'audio/wav', source:'practice', songId:'', song:'', durationSeconds:30,
    blob:new Blob([bytes], {type:'audio/wav'}), ...extra});
  VZ.media.invalidate();
}, [id, WAV, DAY, extra]);
const backup = page => page.evaluate(async () => { VZ.media.holdBackup(false); await VZ.media.backupLocal(); VZ.media.holdBackup(true); });
/** The type and 공연 mark a device shows for a recording, from its merged list. */
const shown = (page, id) => page.evaluate(async id => { const m = (await VZ.media.list(true)).find(x => x.id === id); return m ? [VZ.media.recordingCategory(m), VZ.media.isPerformance(m), VZ.media.recordingTypeText(m)] : null; }, id);
const listed = (page, id) => page.evaluate(async id => (await VZ.media.list(true)).find(x => x.id === id), id);
const tab = async (page, key) => {
  await page.locator('[data-f=category][data-v=' + key + ']').click();
  await expect(page.locator('[data-f=category][data-v=' + key + ']')).toHaveAttribute('aria-pressed', 'true');
  return page.locator('.lib-record').evaluateAll(rows => rows.map(r => r.dataset.media).sort());
};
async function second(browser, server, run) {
  const context = await browser.newContext({viewport:{width:390, height:844}, serviceWorkers:'block', baseURL:'http://127.0.0.1:4173'});
  await context.addInitScript(() => { window.VZIP_DEVICE_SESSIONS_ENABLED = false; window.VZIP_APPROVED_HOME_ENABLED = false; });
  const page = await context.newPage();
  try { await device(page, server); await run(page); expect(page.__errors).toEqual([]); }
  finally { await context.close(); }
}
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('A 녹음 유형 chosen on device A before the backup is on device B after sync; an unchosen type is not written', async ({page, browser}) => {
  await device(page);
  for (const id of ['a-training', 'a-lesson', 'a-stage', 'a-room', 'a-plain']) await record(page, id);
  // Chosen on device A while the files are still on this device only.
  await page.evaluate(async () => {
    const all = await VZ.media.list(true), of = id => [all.find(m => m.id === id)];
    await VZ.recordingType.set(of('a-training'), 'training');
    await VZ.recordingType.set(of('a-lesson'), 'lesson', {link:false});
    await VZ.recordingType.setPerformance(of('a-stage'), true);
    await VZ.recordingType.set(of('a-room'), 'room');
  });
  expect(await page.evaluate(() => Object.keys(window.__rows))).toEqual([]); // nothing is in the cloud yet
  const before = {};
  for (const id of ['a-training', 'a-lesson', 'a-stage', 'a-room', 'a-plain']) before[id] = await shown(page, id);
  expect(before).toEqual({'a-training':['training', false, '트레이닝'], 'a-lesson':['lesson', false, '레슨 녹음'], 'a-stage':['song', true, '곡 녹음 · 공연'], 'a-room':['room', false, '연습실'], 'a-plain':['song', false, '곡 녹음']});

  await backup(page);
  const server = await serverOf(page);
  expect(Object.keys(server.rows).sort()).toEqual(['a-lesson', 'a-plain', 'a-room', 'a-stage', 'a-training']);
  // The new rows carry the choice; the file whose type was never chosen carries none (it stays derived everywhere).
  expect(server.rows['a-training']).toMatchObject({recordingCategory:'training', storageProvider:'r2'});
  expect(server.rows['a-lesson']).toMatchObject({recordingCategory:'lesson', occasion:'lesson'});
  expect(server.rows['a-stage'].occasion).toBe('performance');
  expect(server.rows['a-room'].recordingCategory).toBe('room');
  for (const id of ['a-stage', 'a-plain']) expect(server.rows[id]).not.toHaveProperty('recordingCategory');
  expect(server.rows['a-plain']).not.toHaveProperty('occasion');
  // Device A still shows what it showed before the backup.
  for (const id of Object.keys(before)) expect(await shown(page, id)).toEqual(before[id]);

  await second(browser, server, async other => {
    for (const id of Object.keys(before)) expect(await shown(other, id), id).toEqual(before[id]);
    // …and on the screen: each recording is in the tab of its type.
    await other.goto('/#/library');
    await expect(other.locator('.lib-record').first()).toBeVisible();
    expect(await tab(other, 'training')).toEqual(['a-training']);
    expect(await tab(other, 'lesson')).toEqual(['a-lesson']);
    expect(await tab(other, 'room')).toEqual(['a-room']);
    expect(await tab(other, 'song')).toEqual(['a-plain', 'a-stage']);
    await expect(other.locator('.lib-record[data-media="a-stage"] .item-sub')).toContainText('곡 녹음 · 공연');
  });
});

test('The backup brings the chosen type to a row that was already in the cloud (an upload whose answer was lost)', async ({page}) => {
  // This device holds the file as a device-only file with a type. Its row turns up on the server (without a type) just
  // as the backup starts — the upload is then not repeated, and the fields that follow it must bring the type.
  await device(page);
  await record(page, 'lost', {recordingCategory:'training', occasion:'practice'});
  const item = await listed(page, 'lost');
  expect([item.local, !!item.cloud]).toEqual([true, false]);
  await page.evaluate(row => {
    const upload = window.vzipCloudImport;
    window.vzipCloudImport = async (...args) => { window.__rows.lost = row; window.__upd.lost = '2026-11-09T09:00:00Z'; return upload(...args); };
  }, cloudRow('lost', {name:'기기 녹음 lost', type:'audio/wav'}));
  await backup(page);
  expect(await page.evaluate(() => window.__up.length)).toBe(0); // no second row, no second upload
  const row = (await serverOf(page)).rows.lost;
  expect(row).toMatchObject({recordingCategory:'training', occasion:'practice', r2Key:'u/ui-test-user/lost/original.m4a'}); // the stored file is not replaced
});

test('An `occasion` edit made on a device copy travels: 공연 on, then off, shows on device B each time', async ({page, browser}) => {
  // The same recording on this device and in the cloud. The edit is made on the device copy (as a screen that was
  // drawn before the cloud list arrived does), so it reaches the cloud through the sync layer's device-edit path.
  await device(page, {rows:{both:cloudRow('both'), other:cloudRow('other', {occasion:'lesson'})}, upd:{both:'2026-11-09T09:00:00Z', other:'2026-11-09T09:00:00Z'}});
  await record(page, 'both', {name:'클라우드 both', type:'audio/mp4'});
  const deviceCopy = () => page.evaluate(async () => ({...(await window.vzipReadMedia()).find(m => m.id === 'both'), local:true}));
  const row = () => page.evaluate(() => window.__rows.both);

  await page.evaluate(m => VZ.recordingType.setPerformance([m], true), await deviceCopy());
  await expect.poll(async () => (await row()).occasion).toBe('performance');
  expect(await row()).not.toHaveProperty('recordingCategory'); // the type did not move, so it is still not written
  await second(browser, await serverOf(page), async other => {
    expect(await shown(other, 'both')).toEqual(['song', true, '곡 녹음 · 공연']);
    expect(await shown(other, 'other')).toEqual(['lesson', false, '레슨 녹음']); // an untouched row keeps its derived type
  });

  await page.evaluate(m => VZ.recordingType.setPerformance([m], false), await deviceCopy());
  await expect.poll(async () => (await row()).occasion).toBe('practice');
  // 레슨 녹음 chosen on the device copy: both fields of the type arrive.
  await page.evaluate(m => VZ.recordingType.set([m], 'lesson', {link:false}), await deviceCopy());
  await expect.poll(async () => { const r = await row(); return [r.recordingCategory, r.occasion]; }).toEqual(['lesson', 'lesson']);
  const server = await serverOf(page);
  expect(server.rows.other).toEqual(cloudRow('other', {occasion:'lesson'})); // no other row was rewritten
  expect(server.upd.other).toBe('2026-11-09T09:00:00Z');
  await second(browser, server, async other => { expect(await shown(other, 'both')).toEqual(['lesson', false, '레슨 녹음']); });
});

test('One type change is one cloud write: a later choice made on another device is not overwritten by a second send', async ({page, browser}) => {
  await device(page, {rows:{both:cloudRow('both'), plain:cloudRow('plain')}, upd:{both:'2026-11-09T09:00:00Z', plain:'2026-11-09T09:00:00Z'}});
  for (const id of ['both', 'plain']) await record(page, id, {name:'클라우드 ' + id, type:'audio/mp4'}); // also kept on this device
  const merged = await listed(page, 'both');
  expect([merged.local, merged.cloud]).toEqual([true, true]);
  const writes = id => page.evaluate(id => (window.__writes || []).filter(w => w.id === id).map(w => [w.metadata.recordingCategory ?? null, w.metadata.occasion ?? null]), id);

  // ⋯ › 녹음 유형 › 레슨 녹음 on a recording that is on this device and in the cloud.
  await page.evaluate(async () => VZ.recordingType.set([(await VZ.media.list(true)).find(m => m.id === 'plain')], 'lesson', {link:false}));
  await page.waitForTimeout(600); // a second send would have been made by now
  expect(await writes('plain')).toEqual([['lesson', 'lesson']]);
  expect(await page.evaluate(async () => { const m = (await window.vzipReadMedia()).find(x => x.id === 'plain'); return [m.recordingCategory, m.occasion]; })).toEqual(['lesson', 'lesson']); // the device copy follows

  // Device B chooses 연습실 right after device A's 트레이닝 landed. Device A must not send 트레이닝 again over it.
  await page.evaluate(() => {
    const update = window.vzipCloudMediaUpdate;
    window.vzipCloudMediaUpdate = async (...args) => {
      const saved = await update(...args);
      window.__rows.both = {...window.__rows.both, recordingCategory:'room'}; window.__upd.both = '2026-11-09T10:00:00.000Z';
      return saved;
    };
  });
  await page.evaluate(async () => VZ.recordingType.set([(await VZ.media.list(true)).find(m => m.id === 'both')], 'training'));
  await page.waitForTimeout(600);
  expect(await writes('both')).toEqual([['training', null]]);
  const server = await serverOf(page);
  expect(server.rows.both.recordingCategory).toBe('room');
  await second(browser, server, async other => {
    expect(await shown(other, 'both')).toEqual(['room', false, '연습실']);
    expect(await shown(other, 'plain')).toEqual(['lesson', false, '레슨 녹음']);
  });
});

test('Nothing is backfilled: opening the app, listing and backing up leave cloud rows without the field untouched', async ({page, browser}) => {
  const rows = {derived:cloudRow('derived'), lesson:cloudRow('lesson', {source:'lesson'}), imported:cloudRow('imported', {source:'import', occasion:'practice'}), chosen:cloudRow('chosen', {recordingCategory:'training', occasion:'practice'})};
  const upd = Object.fromEntries(Object.keys(rows).map(id => [id, '2026-11-09T09:00:00Z']));
  await device(page, {rows, upd});
  await record(page, 'derived', {name:'클라우드 derived', type:'audio/mp4'}); // a device copy of a row whose type was never chosen
  await page.goto('/#/library');
  await expect(page.locator('.lib-record').first()).toBeVisible();
  await backup(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'derived'}}))); // a change that names no field sends nothing
  await page.waitForTimeout(400);
  const server = await serverOf(page);
  expect(server).toEqual({rows, upd});
  expect(await page.evaluate(() => (window.__writes || []).length + window.__up.length)).toBe(0);
  await second(browser, server, async other => {
    expect([await shown(other, 'derived'), await shown(other, 'lesson'), await shown(other, 'imported'), await shown(other, 'chosen')])
      .toEqual([['song', false, '곡 녹음'], ['lesson', false, '레슨 녹음'], ['song', false, '곡 녹음'], ['training', false, '트레이닝']]);
  });
});
