// 녹음 유형 (2026-11-16): one classification with the same words in the 전체 녹음 tabs, the rows, 정보 수정, 가져오기 and
// 곡 상세; 공연 is a tag. 정보 수정 shows the type the tab shows, an edit of something else never writes the type, and
// choosing 레슨 녹음 offers the lesson link (never linked unasked). The title rule is untouched.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {KEY, boot, fakeR2} = require('./helpers/r2-fixture.cjs');
const fixture = require('./recording-type.fixture.cjs');

const NAMES = {song:'곡 녹음', lesson:'레슨 녹음', training:'트레이닝', room:'연습실'};
async function open(page, {lessons = []} = {}) {
  const db = fixture.db([]);
  db.lessons.push(...lessons);
  await page.addInitScript(([k, db, rows]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, db); sessionStorage.setItem('seeded', '1'); }
    window.__rows = JSON.parse(rows); window.__upd = Object.fromEntries(Object.keys(window.__rows).map(id => [id, '2026-11-09T09:00:00Z']));
  }, [KEY, JSON.stringify(db), JSON.stringify(fixture.rows())]);
  await fakeR2(page);
  await boot(page);
}
const library = async page => { await page.goto('/#/library'); await expect(page.locator('.lib-record').first()).toBeVisible(); };
const edit = async (page, id) => { await page.evaluate(async id => VZ.editMedia((await VZ.media.list()).find(m => m.id === id)), id); await expect(page.locator('#media-edit')).toBeVisible(); return page.locator('.sheet-page').last(); };
const row = (page, id) => page.locator('.lib-record[data-media="' + id + '"]');
const stored = (page, id) => page.evaluate(id => window.__rows[id], id);
const kindOf = (page, id) => page.evaluate(async id => VZ.media.recordingCategory((await VZ.media.list(true)).find(m => m.id === id)), id);
const save = async page => { await page.getByRole('button', {name:'저장'}).click(); await expect(page.locator('#media-edit')).toHaveCount(0); };
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('녹음 유형 is written with the same words in the tabs, the rows, 정보 수정 and 곡 상세; 종류 is gone', async ({page}) => {
  await open(page);
  await library(page);
  await expect(page.locator('.vz-library-tabs [role=group]')).toHaveAttribute('aria-label', '녹음 유형별 보기');
  await expect(page.locator('[data-f=category]')).toHaveText(['전체', ...Object.values(NAMES)]);
  // Each row names its type with the tab's word; 공연 follows as a tag.
  for (const [id, text] of [['row-plain', '곡 녹음'], ['row-import', '곡 녹음·가져옴'], ['row-explicit-lesson', '레슨 녹음'], ['row-linked-lesson', '레슨 녹음'], ['row-practice-training', '트레이닝'], ['row-source-room', '연습실'],
    ['row-performance', '곡 녹음·가져옴 · 공연'], ['row-lesson-performance', '레슨 녹음 · 공연']]) await expect(row(page, id).locator('.item-sub')).toContainText(' · ' + text + ' · ');
  // On every row the kind (right after the date) is one of the four types — never the old 연습 / 레슨 / 공연.
  expect(await page.locator('.lib-record .item-sub').evaluateAll(subs => subs.map(s => s.textContent.split(' · ')[1]).filter(kind => !/^(곡 녹음|레슨 녹음|트레이닝|연습실)(·가져옴)?$/.test(kind)))).toEqual([]);

  // 정보 수정: one group called 녹음 유형 with the tab's words, the recording's own tab chosen.
  const types = await page.evaluate(async () => (await VZ.media.list()).map(m => [m.id, VZ.media.recordingCategory(m)]));
  expect(types.length).toBe(Object.keys(fixture.rows()).length);
  for (const [id, kind] of types) {
    const sheet = await edit(page, id);
    await expect(sheet).not.toContainText('종류');
    const group = sheet.getByRole('radiogroup', {name:'녹음 유형'});
    await expect(group.getByRole('radio')).toHaveText(kind === 'room' ? Object.values(NAMES) : ['곡 녹음', '레슨 녹음', '트레이닝']);
    await expect(group.locator('[aria-checked=true]')).toHaveText(NAMES[kind]);
    await expect(sheet.getByRole('checkbox', {name:/공연 녹음/})).toBeChecked({checked:/performance/.test(id)});
    await page.evaluate(() => VZ.closeSheets());
  }

  // 곡 상세 › 녹음: the chip says the type (or 공연), "기록" only when a record holds the recording.
  await page.goto('/#/song/s1');
  const chip = id => page.locator('.vz-song-media-list [data-media="' + id + '"] .vz-song-kind');
  await expect(chip('row-song-s1')).toHaveText('곡 녹음');
  await expect(chip('row-performance')).toHaveText('공연');
  await expect(chip('row-practice-song')).toHaveText('연습 기록');
});

test('정보 수정: a rating or memo edit writes neither the type nor the title, and the type is not locked afterwards', async ({page}) => {
  await open(page);
  // 레슨 녹음 because a lesson holds it (nothing stored on the recording itself).
  const before = await stored(page, 'row-linked-lesson');
  expect([before.recordingCategory, before.occasion]).toEqual([undefined, undefined]);
  const sheet = await edit(page, 'row-linked-lesson');
  await expect(sheet.getByRole('radiogroup', {name:'녹음 유형'}).locator('[aria-checked=true]')).toHaveText('레슨 녹음');
  await sheet.getByRole('button', {name:'만족도 4'}).click();
  await sheet.locator('textarea[name=review]').fill('고음이 편했다');
  await save(page);
  const after = await stored(page, 'row-linked-lesson');
  expect(after).toMatchObject({rating:4, review:'고음이 편했다', name:before.name});
  expect(Object.keys(after).filter(k => ['recordingCategory', 'occasion', 'nameMode', 'autoName', 'normalizeTitle'].includes(k))).toEqual([]);
  // Not locked: taking it out of the lesson makes it a 곡 녹음 again, linking it to a training practice a 트레이닝.
  await page.evaluate(() => VZ.change(d => { d.lessons[0].recordings = d.lessons[0].recordings.filter(r => r.id !== 'row-linked-lesson'); }, {silent:true}));
  expect(await kindOf(page, 'row-linked-lesson')).toBe('song');
  await page.evaluate(() => VZ.change(d => { d.practices.find(p => p.id === 'p-training').mediaIds.push('row-linked-lesson'); }, {silent:true}));
  expect(await kindOf(page, 'row-linked-lesson')).toBe('training');
});

test('정보 수정: choosing a type moves the recording to that tab; 레슨 녹음 asks before linking the lesson', async ({page}) => {
  await open(page);
  const name = (await stored(page, 'row-plain')).name;
  let sheet = await edit(page, 'row-plain');
  await sheet.getByRole('radio', {name:'레슨 녹음'}).click();
  await save(page);
  // The same question as in the ⋯ menu; declining links nothing.
  const ask = page.getByRole('alertdialog').or(page.getByRole('dialog', {name:'레슨에 연결'}));
  await expect(ask).toContainText('19:00 레슨');
  await ask.getByRole('button', {name:'취소'}).click();
  expect(await page.evaluate(() => VZ.db.lessons[0].recordings.some(r => r.id === 'row-plain'))).toBe(false);
  expect(await stored(page, 'row-plain')).toMatchObject({recordingCategory:'lesson', occasion:'lesson', name});
  await library(page);
  await page.locator('[data-f=category][data-v=lesson]').click();
  await expect(row(page, 'row-plain').locator('.item-sub')).toContainText('레슨 녹음');

  // 트레이닝 next: no question, the lesson label kept for the calendar goes back, the title stays.
  sheet = await edit(page, 'row-plain');
  await expect(sheet.getByRole('radiogroup', {name:'녹음 유형'}).locator('[aria-checked=true]')).toHaveText('레슨 녹음');
  await sheet.getByRole('radio', {name:'트레이닝'}).click();
  await save(page);
  await expect(page.getByRole('dialog', {name:'레슨에 연결'})).toHaveCount(0);
  expect(await stored(page, 'row-plain')).toMatchObject({recordingCategory:'training', occasion:'practice', name});
  await page.locator('[data-f=category][data-v=training]').click();
  await expect(row(page, 'row-plain')).toBeVisible();

  // Accepting the question links the recording to the one lesson of its day.
  sheet = await edit(page, 'row-song-s1');
  await sheet.getByRole('radio', {name:'레슨 녹음'}).click();
  await save(page);
  await ask.getByRole('button', {name:'연결'}).click();
  await expect.poll(() => page.evaluate(() => VZ.db.lessons[0].recordings.some(r => r.id === 'row-song-s1'))).toBe(true);
});

test('공연 is a tag: ticking it keeps the recording in its tab, unticking gives the type back its label', async ({page}) => {
  await open(page);
  // A recording that is 레슨 녹음 only through its lesson: the tag must not turn it into a 곡 녹음.
  let sheet = await edit(page, 'row-linked-lesson');
  await sheet.getByRole('checkbox', {name:/공연 녹음/}).check();
  await save(page);
  expect(await stored(page, 'row-linked-lesson')).toMatchObject({occasion:'performance', recordingCategory:'lesson'});
  expect(await kindOf(page, 'row-linked-lesson')).toBe('lesson');
  // A plain 곡 녹음: only the tag is stored, and it is listed with the song's performances as before.
  sheet = await edit(page, 'row-song-s1');
  await sheet.getByRole('checkbox', {name:/공연 녹음/}).check();
  await save(page);
  const tagged = await stored(page, 'row-song-s1');
  expect([tagged.occasion, tagged.recordingCategory]).toEqual(['performance', undefined]);
  await library(page);
  await expect(row(page, 'row-song-s1').locator('.item-sub')).toContainText('곡 녹음 · 공연');
  await page.locator('[data-f=category][data-v=lesson]').click();
  await expect(row(page, 'row-linked-lesson').locator('.item-sub')).toContainText('레슨 녹음 · 공연');

  sheet = await edit(page, 'row-linked-lesson');
  await sheet.getByRole('checkbox', {name:/공연 녹음/}).uncheck();
  await save(page);
  expect(await stored(page, 'row-linked-lesson')).toMatchObject({occasion:'lesson', recordingCategory:'lesson'});
  sheet = await edit(page, 'row-performance');
  await sheet.getByRole('checkbox', {name:/공연 녹음/}).uncheck();
  await save(page);
  expect((await stored(page, 'row-performance')).occasion).toBe('practice');
  expect(await kindOf(page, 'row-performance')).toBe('song');
});

test('가져오기 uses the same words: 곡 녹음 · 레슨 녹음, with 공연 as a tag on a 곡 녹음', async ({page}) => {
  await open(page);
  await page.evaluate(() => {
    VZ.media.list = async () => [];
    window.vzipInspectMedia = async () => ({readable:true, duration:40, hasVideo:false, hasAudio:true, metadata:{recordedDate:'2026-11-09', dateSource:'metadata'}});
    window.__sent = [];
    VZ.media.importFile = async (file, choice) => { window.__sent.push([file.name, choice.extra.occasion]); return {id:choice.id, name:file.name, cloud:true, size:file.size, durationSeconds:40, recordedDate:'2026-11-09'}; };
    const file = (name, bytes) => new File([new Uint8Array(bytes)], name, {type:'audio/mp4'});
    VZ.openImportHub({files:[file('a.m4a', [1, 2]), file('b.m4a', [3, 4, 5]), file('c.m4a', [6, 7, 8, 9])], review:true});
  });
  const hub = name => page.locator('.hub-row').filter({hasText:name});
  await expect(hub('a.m4a')).toBeVisible();
  await expect(page.locator('[data-hub], main').first()).not.toContainText('종류');
  const select = hub('a.m4a').getByRole('combobox', {name:'a.m4a 녹음 유형'});
  await expect(select.locator('option')).toHaveText(['곡 녹음', '레슨 녹음', '곡 녹음 · 공연']);
  await expect(select).toHaveValue('practice');
  await expect(page.getByLabel('선택한 파일의 녹음 유형 한 번에 지정').locator('option')).toHaveText(['선택…', '곡 녹음', '레슨 녹음', '곡 녹음 · 공연']);
  await hub('b.m4a').getByRole('combobox', {name:'b.m4a 녹음 유형'}).selectOption({label:'레슨 녹음'});
  await hub('c.m4a').getByRole('combobox', {name:'c.m4a 녹음 유형'}).selectOption({label:'곡 녹음 · 공연'});
  await page.getByRole('button', {name:'선택한 3개 가져오기'}).click();
  // Stored exactly as before (the field the file already carries): practice · lesson · performance.
  await expect.poll(() => page.evaluate(() => window.__sent.sort())).toEqual([['a.m4a', 'practice'], ['b.m4a', 'lesson'], ['c.m4a', 'performance']]);
});

test('⋯ › 녹음 유형 lists the same types (✓ on the current one) with the 공연 tag; a mixed selection says 여러 유형', async ({page}) => {
  await open(page);
  await library(page);
  await row(page, 'row-plain').locator('[data-toggle]').click();
  await row(page, 'row-plain').locator('[data-lib-row-more]').click();
  const menu = page.locator('.sheet-menu .sheet').last();
  await expect(menu.locator('[data-recording-type]')).toHaveText(/녹음 유형\s*곡 녹음/);
  await menu.locator('[data-recording-type]').click();
  await expect(menu.getByRole('button')).toHaveText([/^\s*곡 녹음\s*$/, /^\s*레슨 녹음\s*$/, /^\s*트레이닝\s*$/, /^\s*공연 녹음\s*$/]);
  await expect(menu.getByRole('button', {name:'곡 녹음'})).toHaveAttribute('aria-pressed', 'true');
  await expect(menu.getByRole('button', {name:'공연 녹음'})).toHaveAttribute('aria-pressed', 'false');
  await menu.getByRole('button', {name:'공연 녹음'}).click();
  await expect.poll(async () => (await stored(page, 'row-plain')).occasion).toBe('performance');
  expect((await stored(page, 'row-plain')).recordingCategory).toBeUndefined();
  expect(await kindOf(page, 'row-plain')).toBe('song');

  // Several ticked rows of different types: one row, no type named; choosing one applies to all of them.
  await library(page);
  await page.locator('[data-select-mode]').click();
  for (const id of ['row-import', 'row-explicit-training']) await row(page, id).locator('[data-lib-pick]').click();
  await page.locator('[data-lib-bulk-more]').click();
  await expect(menu.locator('[data-recording-type]')).toHaveText(/녹음 유형\s*여러 유형/);
  await menu.locator('[data-recording-type]').click();
  await expect(menu.locator('[data-kind][aria-pressed=true]')).toHaveCount(0);
  await menu.getByRole('button', {name:'트레이닝'}).click();
  await expect.poll(async () => [(await stored(page, 'row-import')).recordingCategory, (await stored(page, 'row-explicit-training')).recordingCategory]).toEqual(['training', 'training']);
});
