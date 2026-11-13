// 전체 녹음 audit (2026-11-13): background events keep the list where it is, 처리 내역 does not re-download the list
// per event, files picked during an import are kept, ticked unknown-length files are imported, lookups stay fast
// with thousands of recordings, and the header leaves room for the list on small phones.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, boot, fakeR2} = require('./helpers/r2-fixture.cjs');

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
/** n cloud recordings, newest first by index: rec-0001 / rec-0003 are 트레이닝 (linked practice), rec-0005 a lesson
 * recording, rec-0007 연습실; the rest are plain 곡 녹음 without a song. */
function seed(n) {
  const rows = {}, base = new Date(2026, 10, 10, 12).getTime();
  for (let i = 0; i < n; i++) {
    const id = 'rec-' + String(i).padStart(4, '0'), created = base - i * 86400000;
    rows[id] = {id, name:'녹음 ' + i, created, type:'audio/mp4', source:'practice', songId:'', song:'', durationSeconds:60 + i, storageProvider:'r2', r2Key:'u/ui-test-user/' + id + '/original.m4a', size:200000,
      ...(i === 7 ? {recordingCategory:'room'} : {})};
  }
  const day = i => ymd(new Date(base - i * 86400000));
  const db = {categories:[], songs:[{id:'s1', title:'Defying Gravity'}, {id:'s2', title:'On My Own'}],
    lessons:[{id:'l1', date:day(5), startTime:'19:00', songIds:[], songId:'', status:'done', feedback:'', memo:'', recordings:[{id:'rec-0005', note:''}]}],
    assignments:[], comparisonReports:[],
    practices:[1, 3].map(i => ({id:'p' + i, date:day(i), minutes:10, mediaIds:['rec-000' + i], practiceMode:'training', songId:'', technique:[], rating:3, memo:'', completed:[]}))};
  return {db, rows};
}
async function open(page, n = 150) {
  const s = seed(n);
  await page.addInitScript(([k, db, rows]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, db); sessionStorage.setItem('seeded', '1'); }
    window.__rows = JSON.parse(rows); window.__upd = Object.fromEntries(Object.keys(window.__rows).map(id => [id, '2026-11-05T09:00:00Z']));
  }, [KEY, JSON.stringify(s.db), JSON.stringify(s.rows)]);
  await fakeR2(page);
  await boot(page);
}
const library = async page => { await page.goto('/#/library'); await expect(page.locator('.lib-record').first()).toBeVisible(); await expect(page.locator('[data-count]')).toContainText('개'); };
const rowCount = page => page.locator('.lib-record').count();
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('A media event or backup progress updates 전체 녹음 in place: scroll, drawn rows and ticked rows stay', async ({page}) => {
  await open(page);
  await library(page);
  // Draw more than the first 60 rows, then stop in the middle of the list and tick two rows.
  await expect.poll(async () => { await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); return rowCount(page); }).toBeGreaterThan(60);
  await page.locator('[data-select-mode]').click();
  await page.evaluate(() => scrollTo(0, 2400));
  const picked = await page.evaluate(() => [...document.querySelectorAll('.lib-record')].slice(36, 38).map(row => { row.querySelector('[data-lib-pick]').click(); return row.dataset.media; }));
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('2개 선택');
  const before = {rows:await rowCount(page), y:await page.evaluate(() => scrollY)};
  expect(before.y).toBeGreaterThan(2000);
  await page.evaluate(() => { window.__renders = 0; const render = VZ.render; VZ.render = (...a) => { window.__renders++; return render(...a); }; window.__redraws = 0; new MutationObserver(() => window.__redraws++).observe(document.querySelector('[data-l]'), {childList:true}); });
  const state = async () => ({rows:await rowCount(page), y:await page.evaluate(() => scrollY), renders:await page.evaluate(() => window.__renders), selected:await page.locator('[data-lib-selected-count]').innerText(),
    ticked:await page.evaluate(() => [...document.querySelectorAll('.lib-record [data-lib-pick][aria-pressed=true]')].map(b => b.closest('[data-media]').dataset.media))});

  // Nothing shown has changed: no redraw at all.
  for (let i = 0; i < 2; i++) { await page.evaluate(() => window.dispatchEvent(new Event('vzip:cloud-media-changed'))); await page.waitForTimeout(700); }
  await page.evaluate(() => window.dispatchEvent(new Event('vzip:v6-backup')));
  await page.waitForTimeout(300);
  expect(await state()).toEqual({...before, renders:0, selected:'2개 선택', ticked:picked});
  expect(await page.evaluate(() => window.__redraws)).toBe(0);

  // A recording renamed on another device: its row changes, everything else stays where it was.
  await page.evaluate(() => { window.__rows['rec-0040'] = {...window.__rows['rec-0040'], name:'다른 기기에서 바꾼 이름'}; window.__upd['rec-0040'] = new Date().toISOString(); window.dispatchEvent(new Event('vzip:cloud-media-changed')); });
  await expect(page.locator('[data-media="rec-0040"]')).toContainText('다른 기기에서 바꾼 이름');
  expect(await state()).toEqual({...before, renders:0, selected:'2개 선택', ticked:picked});
  await expect(page.locator('.lib-selection-left')).toBeVisible();
});

test('처리 내역 asks the server for the list once on open and on 새로고침, not per journal line, and fits 320px', async ({page}) => {
  await page.setViewportSize({width:320, height:640});
  await open(page, 40);
  await page.evaluate(() => { window.__lists = []; const list = VZ.media.list; VZ.media.list = (...a) => { window.__lists.push(!!a[0]); return list(...a); }; });
  await page.goto('/#/processing-log');
  await expect(page.getByText('파일별 처리 내역')).toBeVisible();
  const longName = '엘리자벳 - 내 삶의 주인은 나야 연습 녹음 아주 긴 파일 이름 2023.08.13_take_final_final.m4a';
  await page.evaluate(name => { for (let i = 0; i < 5; i++) VZ.processingLog.record('x' + i, {state:'uploading', originalName:name}); for (let i = 0; i < 3; i++) window.dispatchEvent(new CustomEvent('vzip:media-saved', {detail:{}})); }, longName);
  // Journal lines are drawn from what is already here.
  await expect(page.locator('[data-processing-log] article').filter({hasText:'take_final_final'})).toHaveCount(5);
  expect(await page.evaluate(() => window.__lists)).toEqual([true]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  // Media events reload together, a few seconds later, with the kept list (never a forced download).
  await expect.poll(() => page.evaluate(() => window.__lists), {timeout:9000}).toEqual([true, false]);
  await page.locator('[data-retry-all]').click();
  await expect(page.getByText('최신 상태를 확인했어요.')).toBeVisible();
  expect(await page.evaluate(() => window.__lists.filter(Boolean).length)).toBe(2);
});

const hubStubs = async (page, {inspect = "({readable:true, duration:40, hasVideo:false, hasAudio:true, metadata:{recordedDate:'2026-11-09', dateSource:'metadata'}})"} = {}) => page.evaluate(inspect => {
  window.__sent = []; window.__lists = 0; window.__gate = {};
  VZ.media.list = async () => { window.__lists++; return []; };
  window.vzipInspectMedia = async () => new Function('return ' + inspect)();
  window.__file = (name, bytes) => new File([new Uint8Array(bytes)], name, {type:'audio/mp4'});
  window.__saved = (file, choice) => ({id:choice.id, name:file.name, cloud:true, size:file.size, durationSeconds:40, recordedDate:'2026-11-09'});
}, inspect);

test('Files picked with + while an import is running are kept: reviewed after it, or added to a bulk upload', async ({page}) => {
  await open(page, 5);
  await hubStubs(page);
  await page.evaluate(() => {
    VZ.media.importFile = async (file, choice) => { window.__sent.push(file.name); if (file.name === 'a.m4a') await new Promise(r => { window.__gate.release = r; }); return window.__saved(file, choice); };
    VZ.openImportHub({files:[window.__file('a.m4a', [1, 2])]});
  });
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['a.m4a']);
  // + in 전체 녹음 (review) and a second bulk pick (no review) while a.m4a is still uploading.
  await page.evaluate(() => { VZ.openImportHub({files:[window.__file('c.m4a', [5, 6, 7])], review:true}); VZ.openImportHub({files:[window.__file('d.m4a', [8, 9, 10, 11])]}); });
  await expect(page.locator('[data-later-note]')).toContainText('추가로 고른 파일 1개');
  await page.evaluate(() => window.__gate.release());
  // The bulk upload goes on with d.m4a; c.m4a waits for its review.
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['a.m4a', 'd.m4a']);
  await expect(page.locator('[data-result]')).toContainText('저장 2개');
  // Leaving and coming back does not lose the waiting file.
  await page.goto('/#/library'); await page.goto('/#/import-hub');
  await page.getByRole('button', {name:'추가로 고른 파일 1개 확인하기'}).click();
  await expect(page.locator('.hub-row')).toContainText('c.m4a');
  await page.getByRole('button', {name:'선택한 1개 가져오기'}).click();
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['a.m4a', 'd.m4a', 'c.m4a']);
});

test('A file whose length cannot be read is left unticked, and imported when the user ticks it', async ({page}) => {
  await open(page, 5);
  await hubStubs(page, {inspect:"({readable:false, duration:null, metadata:{recordedDate:'2026-11-09', dateSource:'metadata'}})"});
  await page.evaluate(() => {
    VZ.media.measure = async () => null;
    VZ.media.importFile = async (file, choice) => { window.__sent.push(file.name); return window.__saved(file, choice); };
    VZ.openImportHub({files:[window.__file('memo.m4a', [1, 2, 3]), window.__file('memo2.m4a', [4, 5, 6, 7])], review:true});
  });
  const row = name => page.locator('.hub-row').filter({hasText:name});
  await expect(row('memo.m4a')).toContainText('길이 확인 불가');
  await expect(row('memo.m4a').locator('[data-sel]')).toBeEnabled();
  await expect(row('memo.m4a').locator('[data-sel]')).not.toBeChecked();
  await expect(page.getByRole('button', {name:'선택한 0개 가져오기'})).toBeDisabled();
  await row('memo.m4a').locator('[data-sel]').check();
  await page.getByRole('button', {name:'선택한 1개 가져오기'}).click();
  await expect(page.locator('[data-result]')).toContainText('저장 1개');
  // Only the ticked one went up.
  expect(await page.evaluate(() => window.__sent)).toEqual(['memo.m4a']);
});

test('An import waiting for the upload slot does not download the list again until the slot is free', async ({page}) => {
  test.setTimeout(60000);
  await open(page, 5);
  await hubStubs(page);
  await page.evaluate(() => {
    window.__held = true;
    navigator.locks.request('vzip-cloud-media-upload', () => new Promise(r => { window.__gate.release = r; }));
    VZ.media.importFile = async (file, choice) => { if (window.__held) throw Error('다른 파일을 업로드하고 있어요. 완료하거나 취소한 뒤 다시 선택해 주세요.'); window.__sent.push(file.name); return window.__saved(file, choice); };
    VZ.openImportHub({files:[window.__file('a.m4a', [1, 2])]});
  });
  await expect(page.getByText('다른 업로드가 끝나길 기다리는 중', {exact:false}).first()).toBeVisible();
  const atStart = await page.evaluate(() => window.__lists);
  await page.waitForTimeout(11500); // two more 5-second waits
  expect(await page.evaluate(() => window.__lists)).toBe(atStart);
  await page.evaluate(() => { window.__held = false; window.__gate.release(); });
  await expect.poll(() => page.evaluate(() => window.__sent), {timeout:15000}).toEqual(['a.m4a']);
  // Exactly one fresh check right before the upload that went through.
  expect(await page.evaluate(() => window.__lists)).toBe(atStart + 1);
});

test('Recording type and the selection menu do not rescan lessons or the whole list per recording', async ({page}) => {
  await open(page, 700);
  await library(page);
  const owner = await page.evaluate(async () => {
    const M = VZ.media, list = await M.list(), db = VZ.db;
    const slow = m => { const lesson = db.lessons.find(l => (l.recordings || []).some(r => r.id === m.id)), practice = db.practices.find(p => (p.mediaIds || []).includes(m.id)); return [lesson ? 'lesson' : practice ? 'practice' : m.source === 'lesson' ? 'lesson' : 'practice', lesson?.id || '', practice?.id || ''].join(':'); };
    const fast = m => { const o = M.owner(m); return [o.kind, o.lesson?.id || '', o.practice?.id || ''].join(':'); };
    const expected = list.map(slow);
    let scans = 0; const find = db.lessons.find; db.lessons.find = function (...a) { scans++; return find.apply(this, a); };
    const same = list.every((m, i) => fast(m) === expected[i]), kinds = list.map(m => M.recordingCategory(m));
    delete db.lessons.find;
    // A change is seen at once (VZ.change) and, for a direct edit, from the next task.
    const free = list.find(m => m.id === 'rec-0010'), before = M.recordingCategory(free);
    VZ.change(d => { d.lessons[0].recordings.push({id:free.id, note:''}); }, {silent:true});
    const linked = M.recordingCategory(free);
    VZ.db.lessons[0].recordings.pop();
    await new Promise(r => setTimeout(r));
    return {same, scans, counts:['song', 'lesson', 'training', 'room'].map(k => kinds.filter(x => x === k).length), before, linked, unlinked:M.recordingCategory(free)};
  });
  expect(owner).toEqual({same:true, scans:0, counts:[696, 1, 2, 1], before:'song', linked:'lesson', unlinked:'song'});

  await page.locator('[data-select-mode]').click();
  await page.locator('[data-lib-select-all]').click();
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('700개 선택');
  // Opening the ⋯ menu looks ticked rows up by id; it never walks the 700-row list once per ticked row.
  const walks = await page.evaluate(() => {
    let n = 0; const some = Array.prototype.some;
    Array.prototype.some = function (...a) { if (this.length >= 700) n++; return some.apply(this, a); };
    try { document.querySelector('[data-lib-bulk-more]').click(); } finally { Array.prototype.some = some; }
    return n;
  });
  await expect(page.locator('.sheet')).toContainText('선택한 녹음 700개');
  expect(walks).toBeLessThan(20);
});

for (const [width, height, rows] of [[320, 640, 2], [375, 812, 4]]) test('전체 녹음 at ' + width + '×' + height + ' shows ' + rows + ' full rows and every type tab without scrolling', async ({page}) => {
  await page.setViewportSize({width, height});
  await open(page, 80);
  await library(page);
  const view = await page.evaluate(() => {
    const nav = document.querySelector('.v-nav').getBoundingClientRect().top;
    return {full:[...document.querySelectorAll('.lib-record')].filter(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= nav; }).length,
      tabs:[...document.querySelectorAll('[data-f=category]')].map(b => { const r = b.getBoundingClientRect(); return {text:b.textContent, inside:r.left >= 0 && r.right <= innerWidth, height:Math.round(r.height)}; }),
      targets:['[data-select-mode]', '[data-library-filter]', '[data-library-search]', '.vz-review-fallback'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().height)),
      wide:document.documentElement.scrollWidth};
  });
  expect(view.full).toBeGreaterThanOrEqual(rows);
  expect(view.tabs.map(t => t.text)).toEqual(['전체', '곡 녹음', '레슨 녹음', '트레이닝', '연습실']);
  expect(view.tabs.filter(t => !t.inside || t.height < 44)).toEqual([]);
  expect(Math.min(...view.targets)).toBeGreaterThanOrEqual(44);
  expect(view.wide).toBeLessThanOrEqual(width);
});

test('A search does not drop ticked rows, and 곡 지정 stays in the menu for the 곡·레슨 녹음 among them', async ({page}) => {
  await open(page, 30);
  await library(page);
  await page.locator('[data-select-mode]').click();
  for (const id of ['rec-0000', 'rec-0001', 'rec-0002']) await page.locator('[data-media="' + id + '"] [data-lib-pick]').click();
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('3개 선택');
  const search = text => page.evaluate(text => { const q = document.querySelector('[data-q]'); q.value = text; q.dispatchEvent(new Event('input')); }, text);
  await search('녹음 29');
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('0개 선택');
  await expect(page.locator('[data-lib-bulk-more]')).toBeDisabled();
  await search('');
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('3개 선택');
  await expect(page.locator('[data-media="rec-0001"] [data-lib-pick]')).toHaveAttribute('aria-pressed', 'true');

  // rec-0001 is 트레이닝: 곡 지정 applies to the other two only.
  await page.locator('[data-lib-bulk-more]').click();
  await expect(page.locator('.sheet [data-song]')).toContainText('곡·레슨 녹음 2개만');
  await page.locator('.sheet [data-song]').click();
  await page.locator('.sheet').getByText('Defying Gravity').click();
  await expect(page.locator('.sheet').last()).toContainText('2개 녹음의 곡을');
  await page.getByRole('button', {name:'바꾸기'}).click();
  await expect.poll(() => page.evaluate(() => ['rec-0000', 'rec-0001', 'rec-0002'].map(id => window.__rows[id].songId))).toEqual(['s1', '', 's1']);

  // Only 트레이닝 files ticked: a short reason instead of a missing row.
  await page.locator('[data-f=category][data-v=training]').click();
  await page.locator('[data-media="rec-0003"] [data-lib-pick]').click();
  await page.locator('[data-lib-bulk-more]').click();
  await expect(page.locator('.sheet [data-song]')).toHaveCount(0);
  await expect(page.locator('.sheet [data-song-note]')).toContainText('트레이닝·연습실 녹음에는 곡을 지정하지 않아요');
});
