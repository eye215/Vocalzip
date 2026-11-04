// VOCAL.zip v6 UI: main user flows, data compatibility with v5 records, and mobile layout.
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','order','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert')window.__up.push(a[0]);return c};c.then=r=>r({data:[],error:null});return c}})};`;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const legacy = () => ({
  categories:[{id:'c1', name:'발성', items:['립트릴', '허밍']}],
  songs:[{id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드'}, {id:'s2', title:'On My Own', show:''}],
  lessons:[{id:'l1', date:day(-7), songId:'s1', categoryId:'c1', categoryLabel:'발성', detail:'립트릴', feedback:'호흡 길게', memo:'m', recordings:[{id:'m1', note:'시범'}]},
    {id:'l-over', date:day(-2), startTime:'10:00', songIds:['s2'], songId:'s2', status:'scheduled', feedback:'', memo:'', recordings:[]}],
  assignments:[{id:'a1', lessonId:'l1', lessonIds:['l1'], title:'립트릴 5분', status:'active'}, {id:'a2', lessonId:'l1', lessonIds:['l1', 'l-over'], title:'2절 녹음', status:'active'}],
  practices:[{id:'p1', date:day(-1), minutes:30, manualMinutes:25, mediaSeconds:300, mediaIds:['m1'], practiceMode:'song', technique:[], songId:'s1', categoryId:'', categoryLabel:'', detail:'', rating:4, memo:'고음', completed:['a1'], assignmentNotes:{a1:'3회 반복'}}],
  comparisonReports:[]
});
async function boot(page, {seed = legacy(), media = true} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  // Sandboxes without CDN access can point the pinned Mediabunny bundle at a local copy.
  if (process.env.VZ_MEDIABUNNY) await page.context().route('**/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs', r => r.fulfill({path:process.env.VZ_MEDIABUNNY, contentType:'text/javascript'}));
  page.on('dialog', d => d.accept());
  if (seed) await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  // Media tests run as a signed-out-of-cloud device so files stay in IndexedDB.
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
  if (media) await page.evaluate(async () => {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 6000, true);
    window.__wav = buf;
    // Legacy ArrayBuffer record (v5 recorder format) and a Blob record.
    await window.vzipStorePracticeMedia({id:'m1', name:'레슨 시범', created:Date.now() - 7 * 864e5, type:'audio/wav', source:'lesson', songId:'s1', song:'This Is the Moment', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:1});
    await window.vzipStorePracticeMedia({id:'m2', name:'연습 녹음', created:Date.now() - 864e5, type:'audio/wav', source:'practice', songId:'s1', song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:1});
    window.dispatchEvent(new Event('vzip:media-updated'));
  });
}
const data = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const media = page => page.evaluate(() => window.vzipReadMedia());
const sheet = page => page.locator('.sheet');
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('Bottom navigation reaches the five main screens without horizontal overflow', async ({page}) => {
  await boot(page);
  const nav = page.locator('.v-nav');
  for (const [label, heading] of [['내 곡', '내 곡'], ['녹음', '녹음'], ['캘린더', '캘린더'], ['성장', '성장'], ['홈', null]]) {
    await nav.getByRole('link', {name:label, exact:true}).click();
    if (heading) await expect(page.locator('#top h1')).toHaveText(heading);
    await expect(nav.getByRole('link', {name:label, exact:true})).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  // Home: quick actions first, then next lesson / homework / recent songs.
  await expect(page.locator('.quick').getByText('녹음')).toBeVisible();
  await expect(page.getByText('예정된 레슨이 없어요')).toBeVisible();
  await expect(page.getByText('립트릴 5분')).toBeVisible();
  await expect(page.locator('[data-recent]').getByText('This Is the Moment')).toBeVisible();
  // Touch targets in nav are at least 44px.
  const box = await nav.getByRole('link', {name:'내 곡'}).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('Lesson schedule: add, edit, complete with per-song feedback, cancel, never auto-complete', async ({page}) => {
  await boot(page);
  await page.locator('.quick [data-add-lesson]').click();
  const s = sheet(page);
  await s.locator('[name=date]').fill(day(3));
  await s.locator('[name=start]').fill('19:00');
  await s.locator('[name=end]').fill('20:00');
  await s.locator('[name=place]').fill('강남 연습실');
  await s.locator('[name=teacher]').fill('김선생');
  await s.getByRole('button', {name:'This Is the Moment'}).click();
  await s.getByRole('button', {name:'On My Own'}).click();
  await s.locator('[name=prep]').fill('고음 질문');
  await page.locator('.sheet-foot').getByRole('button', {name:'일정 추가'}).click();
  await expect(page.locator('#top h1')).toHaveText('레슨');
  let d = await data(page);
  const created = d.lessons.find(l => l.place === '강남 연습실');
  expect(created).toMatchObject({date:day(3), startTime:'19:00', endTime:'20:00', teacher:'김선생', status:'scheduled', songIds:['s1', 's2'], prepMemo:'고음 질문'});
  // Home shows it as the next lesson with D-day.
  await page.goto('/#/home');
  await expect(page.locator('.lesson-hero')).toContainText('19:00 – 20:00');
  await expect(page.locator('.lesson-hero')).toContainText('D-3');
  // Edit time.
  await page.locator('.lesson-hero').click();
  await page.locator('[data-edit-lesson]').click();
  await sheet(page).locator('[name=start]').fill('18:30');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect(page.locator('.card').first()).toContainText('18:30');
  // Complete and write feedback per song.
  await page.getByRole('button', {name:'레슨 완료'}).click();
  await expect(page.locator('.badge').first()).toHaveText('완료');
  await page.locator('[data-fb2]').click();
  await sheet(page).locator('[name=feedback]').fill('전체적으로 좋아짐');
  await sheet(page).locator('[name=song_s1]').fill('2절 턱 힘 빼기');
  await sheet(page).getByRole('button', {name:'피드백 저장'}).click();
  await expect(page.getByText('2절 턱 힘 빼기')).toBeVisible();
  d = await data(page);
  expect(d.lessons.find(l => l.id === created.id)).toMatchObject({status:'done', feedback:'전체적으로 좋아짐', songFeedback:{s1:'2절 턱 힘 빼기'}});
  // Past scheduled lesson stays scheduled and is flagged.
  await page.goto('/#/lessons');
  await expect(page.getByText('날짜가 지난 예정 레슨 1개')).toBeVisible();
  expect((await data(page)).lessons.find(l => l.id === 'l-over').status).toBe('scheduled');
  // Cancel it.
  await page.locator('a[href="#/lesson/l-over"]').click();
  await page.getByRole('button', {name:'레슨 취소'}).click();
  expect((await data(page)).lessons.find(l => l.id === 'l-over').status).toBe('cancelled');
  // Legacy lesson without status shows as completed and keeps legacy fields after edit.
  await page.goto('/#/lesson/l1');
  await expect(page.locator('.badge').first()).toHaveText('완료');
  await page.locator('[data-edit-lesson]').click();
  await sheet(page).locator('[name=place]').fill('홍대');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  expect((await data(page)).lessons.find(l => l.id === 'l1')).toMatchObject({categoryId:'c1', detail:'립트릴', feedback:'호흡 길게', recordings:[{id:'m1', note:'시범'}], place:'홍대'});
});

test('Lesson delete keeps homework and practice history; legacy page still reads v6 data', async ({page}) => {
  await boot(page);
  await page.goto('/#/lesson/l1');
  await page.getByRole('button', {name:'레슨 삭제'}).click();
  await sheet(page).getByRole('button', {name:'삭제'}).click();
  const d = await data(page);
  expect(d.lessons.some(l => l.id === 'l1')).toBe(false);
  expect(d.assignments.find(a => a.id === 'a1')).toMatchObject({title:'립트릴 5분', lessonIds:[]});
  expect(d.assignments.find(a => a.id === 'a2').lessonIds).toEqual(['l-over']);
  expect(d.practices[0]).toMatchObject({completed:['a1'], assignmentNotes:{a1:'3회 반복'}, manualMinutes:25, mediaSeconds:300});
  await page.goto('/legacy.html');
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).assignments.length, KEY)).toBe(2);
  page.__errors = page.__errors.filter(e => !/supabase|tus/i.test(e));
});

test('Homework: add with song, complete from home, practice log records it separately', async ({page}) => {
  await boot(page);
  await page.goto('/#/homework');
  await page.locator('[data-add-task]').click();
  await sheet(page).locator('[name=title]').fill('On My Own 브릿지 10번');
  await sheet(page).locator('[name=song]').selectOption('s2');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect(page.getByText('On My Own 브릿지 10번')).toBeVisible();
  // Practice log marks homework practiced but not completed.
  await page.goto('/#/home');
  await page.locator('[data-log]').click();
  const s = sheet(page);
  await s.locator('[name=song]').selectOption('s2');
  await s.locator('[name=minutes]').fill('15');
  await s.getByRole('button', {name:'만족도 4'}).click();
  await s.locator('label.item').filter({hasText:'On My Own 브릿지 10번'}).locator('input').check();
  await page.getByRole('button', {name:'연습 기록 저장'}).click();
  let d = await data(page);
  const task = d.assignments.find(a => a.title === 'On My Own 브릿지 10번');
  expect(task).toMatchObject({status:'active', songId:'s2'});
  expect(d.practices.at(-1)).toMatchObject({minutes:15, songId:'s2', practiceMode:'song', rating:4, completed:[task.id], date:day(0)});
  // Complete from home checklist.
  await page.getByRole('checkbox', {name:'On My Own 브릿지 10번 완료'}).click();
  d = await data(page);
  expect(d.assignments.find(a => a.id === task.id).status).toBe('done');
  expect(d.assignments.find(a => a.id === task.id).doneAt).toBeGreaterThan(0);
  await page.goto('/#/homework');
  await page.getByRole('button', {name:/완료 1/}).click();
  await expect(page.getByText('On My Own 브릿지 10번')).toBeVisible();
});

test('Songs: add, search, detail tabs, delete keeps records', async ({page}) => {
  await boot(page);
  await page.goto('/#/songs');
  await page.locator('[data-add-song]').click();
  await sheet(page).locator('[name=title]').fill('Defying Gravity');
  await sheet(page).locator('[name=show]').fill('위키드');
  await sheet(page).getByRole('button', {name:'곡 추가'}).click();
  await expect(page.locator('#top h1')).toHaveText('Defying Gravity');
  await page.goto('/#/songs');
  await page.getByLabel('곡 검색').fill('moment');
  await expect(page.locator('.list .item')).toHaveCount(1);
  // A background media refresh keeps the search.
  await page.getByLabel('곡 검색').blur();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'m1'}})));
  await page.waitForTimeout(700);
  await expect(page.getByLabel('곡 검색')).toHaveValue('moment');
  await expect(page.locator('.list .item')).toHaveCount(1);
  await page.locator('.list .item').click();
  await expect(page.locator('[data-summary]')).toContainText('녹음 2개');
  await page.getByRole('tab', {name:'녹음'}).click();
  await expect(page.locator('[data-media]')).toHaveCount(2);
  await page.getByRole('tab', {name:'레슨·숙제'}).click();
  await expect(page.getByText('호흡 길게')).toBeVisible();
  await page.locator('[data-song-menu]').click();
  await page.getByRole('button', {name:'곡 삭제'}).click();
  await sheet(page).getByRole('button', {name:'삭제'}).click();
  await expect(page.locator('#top h1')).toHaveText('내 곡');
  const d = await data(page);
  expect(d.songs.some(s => s.id === 's1')).toBe(false);
  expect(d.practices[0].songId).toBe('s1');
  expect((await media(page)).length).toBe(2);
});

test('One-touch recording: record, preview, save with song; failure keeps original for retry', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'Fake capture devices are Chromium-only.');
  await boot(page);
  await page.goto('/#/record?song=s2');
  await expect(page.locator('[data-song-name]')).toHaveText('On My Own');
  await expect(page.getByRole('button', {name:/영상/})).toHaveCount(0); // audio-only recording
  // First save fails once.
  await page.evaluate(() => { const real = window.vzipStorePracticeMedia; let fail = true; window.vzipStorePracticeMedia = async item => { if (fail) { fail = false; throw Error('테스트 저장 실패'); } return real(item); }; });
  await page.getByRole('button', {name:'녹음 시작'}).click();
  await expect(page.getByRole('button', {name:'녹음 종료'})).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', {name:'일시정지'}).click();
  await expect(page.locator('[data-status]')).toHaveText('일시정지됨');
  await page.getByRole('button', {name:'계속'}).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', {name:'녹음 종료'}).click();
  await expect(page.locator('[data-review] [data-p] .player')).toBeVisible();
  await page.locator('[data-review] [name=memo]').fill('브릿지 숨 부족');
  await page.locator('[data-review] [data-save]').click();
  await expect(page.getByText('저장 실패: 테스트 저장 실패')).toBeVisible();
  await expect(page.getByRole('button', {name:'기기로 내려받기'})).toBeVisible();
  await page.getByRole('button', {name:'다시 저장'}).click();
  await expect(page.getByText('저장했어요', {exact:true})).toBeVisible();
  const items = (await media(page)).filter(m => m.source === 'practice' && m.songId === 's2');
  expect(items).toHaveLength(1);
  expect(items[0].durationSeconds).toBeGreaterThan(1.5);
  expect(items[0].review).toBe('브릿지 숨 부족');
  expect(items[0].waveform.length).toBeGreaterThan(0);
  // Recording alone does not create a practice session (no double-count).
  expect((await data(page)).practices).toHaveLength(1);
  await page.getByRole('link', {name:'On My Own 곡 보기'}).click();
  await page.getByRole('tab', {name:'녹음'}).click();
  await expect(page.locator('[data-media]')).toHaveCount(1);
});

test('Recording from a lesson links the file to that lesson', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'Fake capture devices are Chromium-only.');
  await boot(page);
  await page.goto('/#/lesson/l-over');
  await page.getByRole('link', {name:'+ 녹음'}).click();
  await page.getByRole('button', {name:'녹음 시작'}).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', {name:'녹음 종료'}).click();
  await page.locator('[data-review] [data-save]').click();
  await page.getByRole('link', {name:'레슨으로'}).click();
  await expect(page.locator('[data-recs] [data-media]')).toHaveCount(1);
  const lesson = (await data(page)).lessons.find(l => l.id === 'l-over');
  expect(lesson.recordings).toHaveLength(1);
  expect((await media(page)).find(m => m.id === lesson.recordings[0].id).source).toBe('lesson');
});

test('Denied microphone explains the problem and keeps the recorder usable', async ({page}) => {
  await boot(page);
  await page.evaluate(() => {
    const deny = async () => { throw Object.assign(new Error('denied'), {name:'NotAllowedError'}); };
    if (window.MediaDevices) MediaDevices.prototype.getUserMedia = deny;
    Object.defineProperty(navigator, 'mediaDevices', {configurable:true, value:{getUserMedia:deny}});
    window.MediaRecorder ||= function () {};
  });
  await page.goto('/#/record');
  await page.getByRole('button', {name:'녹음 시작'}).click();
  await expect(page.locator('[data-status]')).toContainText('마이크 권한이 거부됐어요');
  // A background media refresh must not wipe the explanation.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'m1'}})));
  await page.waitForTimeout(700);
  await expect(page.locator('[data-status]')).toContainText('마이크 권한이 거부됐어요');
  await expect(page.getByRole('button', {name:'녹음 시작'})).toBeEnabled();
});

test('Import: multiple files, bulk and per-file song, date edit, invalid skipped, failed file retried alone', async ({page}) => {
  await boot(page);
  await page.goto('/#/library');
  await page.locator('[data-imp]').click();
  await page.evaluate(() => { const real = window.vzipStorePracticeMedia; window.__calls = 0; window.vzipStorePracticeMedia = async item => { window.__calls++; if (item.name === 'b' && !window.__failedOnce) { window.__failedOnce = true; throw Error('네트워크 오류'); } return real(item); }; });
  const wav = await page.evaluate(() => [...new Uint8Array(window.__wav)]);
  const buffer = Buffer.from(wav);
  await sheet(page).locator('[data-file]').setInputFiles([
    {name:'a.wav', mimeType:'audio/wav', buffer}, {name:'b.m4a', mimeType:'', buffer}, {name:'notes.txt', mimeType:'text/plain', buffer:Buffer.from('x')}]);
  await expect(sheet(page).getByText('지원하지 않는 형식이에요. (건너뜀)')).toBeVisible();
  await sheet(page).locator('[data-bulk]').selectOption('s2');
  await sheet(page).getByLabel('a.wav 곡').selectOption('s1');
  await sheet(page).getByLabel('b.m4a 날짜').fill('2026-01-15');
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).getByText('실패: 네트워크 오류')).toBeVisible();
  await expect(sheet(page).locator('[data-summary]')).toContainText('저장 1개');
  await sheet(page).getByRole('button', {name:'다시 시도'}).click();
  await expect(sheet(page).locator('.up-row.done')).toHaveCount(2);
  const items = (await media(page)).filter(m => m.source === 'import');
  expect(items).toHaveLength(2);
  expect(items.find(m => m.name === 'a').songId).toBe('s1');
  const b = items.find(m => m.name === 'b');
  expect(b.songId).toBe('s2');
  expect(b.type).toBe('audio/mp4');
  expect(b).toMatchObject({recordedDate:'2026-01-15', dateSource:'manual'});
  expect(items.find(m => m.name === 'a').dateSource).not.toBe('manual');
  expect(new Date(b.created).getFullYear() + '-' + (new Date(b.created).getMonth() + 1) + '-' + new Date(b.created).getDate()).toBe('2026-1-15');
  expect(await page.evaluate(() => window.__calls)).toBe(3);
  await page.goto('/#/calendar');
  await page.getByRole('button', {name:'다음 달'}).click();
  for (let i = 0; i < 24 && !(await page.locator('[data-d="2026-01-15"]').count()); i++) await page.getByRole('button', {name:'이전 달'}).click();
  await page.locator('[data-d="2026-01-15"]').click();
  await expect(page.locator('[data-day] [data-media]')).toHaveCount(1);
});

test('Library filters, edit and play; compare A/B with memo saved in v5 report schema', async ({page}) => {
  await boot(page);
  await page.goto('/#/library');
  await expect(page.locator('[data-media]')).toHaveCount(2);
  await page.getByRole('button', {name:'레슨', exact:true}).click();
  await expect(page.locator('[data-media]')).toHaveCount(1);
  await page.locator('[data-media] [data-toggle]').click();
  await expect(page.locator('.media-open .player')).toBeVisible();
  await page.getByRole('button', {name:/정보 수정/}).click();
  await sheet(page).getByRole('button', {name:'만족도 5'}).click();
  await sheet(page).locator('[name=review]').fill('선생님 시범 좋음');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect.poll(async () => (await media(page)).find(m => m.id === 'm1').rating).toBe(5);
  await page.goto('/#/compare?song=s1');
  await expect(page.locator('[data-side="A"]')).toContainText('레슨 시범');
  await expect(page.locator('[data-side="B"]')).toContainText('연습 녹음');
  await page.getByRole('button', {name:'0.75×'}).click();
  await page.locator('[data-side="A"] [data-play]').click();
  await page.getByRole('button', {name:/A\/B 전환/}).click();
  await page.locator('#cmp-form [name=notes]').fill('호흡이 길어졌다');
  // A background media refresh must not wipe what the user is typing.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'m1'}})));
  await page.waitForTimeout(700);
  await expect(page.locator('#cmp-form [name=notes]')).toHaveValue('호흡이 길어졌다');
  await page.getByRole('button', {name:'메모 저장'}).click();
  const r = (await data(page)).comparisonReports[0];
  expect(r).toMatchObject({firstId:'m1', secondId:'m2', notes:'호흡이 길어졌다', songId:'s1'});
});

test('Calendar shows lessons, practice and recordings per day and adds lessons for the chosen date', async ({page}) => {
  await boot(page);
  await page.goto('/#/calendar');
  if (day(-1).slice(0, 7) !== day(0).slice(0, 7)) await page.getByRole('button', {name:'이전 달'}).click();
  await page.locator('[data-d="' + day(-1) + '"]').click();
  await expect(page.locator('[data-day]')).toContainText('30분');
  await expect(page.locator('[data-day] [data-media]')).toHaveCount(1);
  if (day(-7).slice(0, 7) !== day(-1).slice(0, 7)) await page.getByRole('button', {name:'이전 달'}).click();
  await page.locator('[data-d="' + day(-7) + '"]').click();
  await expect(page.locator('[data-day]')).toContainText('완료');
  await page.getByRole('button', {name:'레슨 일정'}).click();
  await expect(sheet(page).locator('[name=date]')).toHaveValue(day(-7));
  await sheet(page).getByRole('button', {name:'닫기'}).click();
  await page.getByRole('button', {name:'다음 달'}).click();
  await page.getByRole('button', {name:'오늘'}).click();
  await expect(page.locator('[data-d="' + day(0) + '"]')).toHaveAttribute('aria-pressed', 'true');
});

test('Growth counts practice time once and shows empty state without invented scores', async ({page}) => {
  await boot(page, {seed:{categories:[], songs:[], lessons:[], assignments:[], practices:[]}, media:false});
  await page.goto('/#/growth');
  await expect(page.getByText('이번 주 연습 기록이 없어요.')).toBeVisible();
  await expect(page.locator('.stat').filter({hasText:'평균 만족도'})).toContainText('–');
  await page.getByRole('button', {name:'전체'}).click();
  await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.practices.push({id:'x', date:new Date().toISOString().slice(0, 10), minutes:40, mediaSeconds:600, mediaIds:['z'], practiceMode:'song', songId:'', rating:5}); localStorage.setItem(k, JSON.stringify(d)); window.dispatchEvent(new Event('vzip:data-changed')); }, KEY);
  await expect(page.locator('.stat').filter({hasText:'전체 연습 시간'})).toContainText('40분');
  await expect(page.getByText('음정·호흡·발성은 평가하지 않아요')).toBeVisible();
});

test('Settings keeps the cloud account panel across re-renders and exports a backup', async ({page}) => {
  await boot(page, {media:false});
  await page.goto('/#/settings');
  await expect(page.locator('#cloud-user')).toContainText('test@example.invalid');
  await page.goto('/#/home');
  await page.goto('/#/settings');
  await expect(page.locator('#cloud-logout')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name:/기록 백업/}).click();
  expect((await download).suggestedFilename()).toMatch(/^vocalzip-backup-/);
});

test('Sheets fit the iPhone width and inputs do not overflow', async ({page}) => {
  await boot(page, {media:false});
  await page.locator('.quick [data-add-lesson]').click();
  const width = await page.evaluate(() => innerWidth);
  for (const sel of ['[name=date]', '[name=start]', '[name=end]', '[name=place]']) {
    const b = await sheet(page).locator(sel).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(width + 0.5);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  expect(await sheet(page).evaluate(el => getComputedStyle(el.querySelector('input')).fontSize)).toBe('16px');
});

test('Video import keeps only the original audio and files it under the capture date', async ({page}) => {
  const fixture = path.resolve('tests/fixtures/dated-video.mp4');
  test.skip(!fs.existsSync(fixture), 'Run node tests/make-audio-fixtures.cjs (needs ffmpeg).');
  test.setTimeout(90000);
  await boot(page, {media:false});
  await page.goto('/#/library');
  await page.locator('[data-imp]').click();
  await sheet(page).locator('[data-file]').setInputFiles(fixture);
  await expect(sheet(page).getByText('영상 → 음성만 저장')).toBeVisible();
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).locator('.up-row.done')).toHaveCount(1, {timeout:60000});
  await expect(sheet(page).locator('.up-row.done')).toContainText('(파일 속 날짜)');
  const [item] = await media(page);
  expect(item.type).toBe('audio/mp4');
  expect(item).toMatchObject({recordedDate:'2024-03-01', dateSource:'metadata', source:'import'});
  expect(item.audioExtraction.audioPacketCopyVerified).toBe(true);
});

test('Billing is only linked, and editing a legacy lesson never stamps a status on it', async ({page}) => {
  await boot(page, {media:false});
  await page.goto('/#/settings');
  await expect(page.getByRole('link', {name:'레슨비 정산'})).toHaveAttribute('href', 'billing/');
  await page.goto('/#/lessons');
  await expect(page.getByRole('link', {name:'레슨비 정산'})).toHaveAttribute('href', 'billing/');
  await page.goto('/#/lesson/l1');
  await page.locator('[data-edit-lesson]').click();
  await sheet(page).locator('[name=teacher]').fill('박선생');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  const l1 = (await data(page)).lessons.find(l => l.id === 'l1');
  expect(l1.teacher).toBe('박선생');
  expect('status' in l1).toBe(false);
  expect(l1.date).toBe(day(-7));
  // An explicit user choice is recorded.
  await page.getByRole('button', {name:'예정으로 되돌리기'}).click();
  expect((await data(page)).lessons.find(l => l.id === 'l1').status).toBe('scheduled');
});

test('Library actually plays device and cloud-only audio (time advances)', async ({page}) => {
  await boot(page);
  await page.route('**/cloud-audio.wav', async r => r.fulfill({contentType:'audio/wav', body:Buffer.from(await page.evaluate(() => [...new Uint8Array(window.__wav)]))}));
  await page.evaluate(() => {
    window.vzipCloudSignedIn = () => true;
    window.vzipCloudMediaList = async () => [{id:'c1', name:'클라우드 음원', type:'audio/wav', path:'ui-test-user/c1.wav', created:Date.now(), songId:'', cloud:true}];
    window.vzipCloudMediaUrl = async () => { await new Promise(r => setTimeout(r, 300)); return '/cloud-audio.wav'; };
    window.dispatchEvent(new Event('vzip:auth-changed'));
  });
  await page.goto('/#/library');
  for (const id of ['m2', 'c1']) {
    const row = page.locator('[data-media="' + id + '"]');
    await row.locator('[data-toggle]').click();
    await expect(row.locator('.time')).not.toHaveText(/^0:00 \//, {timeout:5000});
    await expect(row.locator('[data-msg]')).toHaveText('');
  }
  // After the 1s clip ends, one tap on the already-loaded source plays it again.
  const row = page.locator('[data-media="c1"]');
  await expect(row.getByRole('button', {name:'재생', exact:true})).toBeVisible({timeout:5000});
  await row.getByRole('button', {name:'재생', exact:true}).click();
  await expect(row.getByRole('button', {name:'일시정지'})).toBeVisible();
  await expect(row.locator('[data-msg]')).toHaveText('');
});
