// VOCAL.zip v6 UI: main user flows, data compatibility with v5 records, and mobile layout.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:info=>info.title==='Bottom navigation reaches the four main screens and the record button without horizontal overflow'});
const labClear = require('./lab-clear-selection.cjs');
const fs = require('node:fs'), path = require('node:path');
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};let writing=false;for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert'){window.__up.push(a[0]);writing=true}return c};c.then=r=>r({data:writing?[{user_id:'ui-test-user'}]:[],error:null});return c}})};`;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
// Imports leave out takes shorter than 25 seconds, so files picked for import are 26-second mono WAVs.
const longWav = (seconds = 26, sr = 8000) => { const n = sr * seconds, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 6000), 44 + i * 2); return b; };
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
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"})); // R2 is covered by r2.spec.cjs
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
  // Let the media refresh this seeding triggers finish before the test starts tapping.
  if (media) await page.waitForTimeout(600);
}
const data = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const media = page => page.evaluate(() => window.vzipReadMedia());
const sheet = page => page.locator('.sheet');
const openLibraryImport=async page=>{
 // Legacy import sheet remains testable for records created by older app versions.
 await page.evaluate(() => VZ.importSheet());
};
const pickLibraryImportFiles=(page,files)=>sheet(page).locator('[data-file]').last().setInputFiles(files);

test('전체 녹음에서 고른 파일은 새 확인 화면을 거쳐 업로드 중에만 상단 대시보드를 보인다', async ({page}) => {
  await boot(page, {media:false});
  // A 26-second take: imports shorter than 25 seconds are left out on purpose.
  const sr = 8000, n = sr * 26, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  await page.goto('/#/library');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-imp]').click();
  await (await chooser).setFiles({name:'2026-11-01_10-00-00.wav', mimeType:'audio/wav', buffer:b});
  await expect(page).toHaveURL(/#\/import-hub$/);
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('[data-hub] [data-import]')).toBeVisible({timeout:30000});
  await expect(page.locator('[data-dash]')).toHaveCount(0);
  await page.evaluate(() => {
    VZ.media.importFile = async (file, choice) => new Promise(resolve => {
      window.__finishImport = () => resolve({id:choice.id, cloud:true, name:file.name, recordedDate:choice.date || '2026-11-01'});
    });
  });
  await page.locator('[data-hub] [data-import]').click();
  await expect(page.locator('[data-hub] > [data-dash]')).toBeVisible();
  await page.evaluate(() => window.__finishImport());
  await expect(page.locator('[data-result]')).toBeVisible();
  await expect(page.locator('[data-dash]')).toHaveCount(0);
});

test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('Vocal lab stays a standalone screen and uses selected recordings for reports', async ({page}) => {
 await boot(page);
 await page.evaluate(async () => {
   const all=await VZ.media.list();
   for(const m of all.filter(x=>x.songId==='s1')) {
     const old=m.id==='m1';
     await VZ.media.update(m,{analysis:{v:1,metrics:{voicedSeconds:30,stability:{wobbleCents:old?34:23,notes:4},intonation:{meanAbsCents:old?27:18,notes:10},range:{highCents:8100,high:'A5'},breath:{medianPhrase:old?2.4:3.2}},confidence:{voiceOverMrDb:12}}},{quiet:true});
   }
   VZ.media.invalidate();
 });
 await page.goto('/#/vocal-lab/s1');
 await expect(page.locator('.vl-song strong')).toHaveText('This Is the Moment');
 await expect(page.locator('.vl-player-head')).toContainText('2 / 2'); // opens with the analysed takes selected
 await labClear(page);
 await expect(page.locator('.vl-player')).toHaveCount(0);
 await page.locator('.vl-dates button').first().click();
 await expect(page.locator('.vl-single')).toBeVisible();
 await expect(page.locator('.vl-recommend')).toContainText('3개 이상');
 await page.locator('.vl-dates button').nth(1).click();
 await expect(page.locator('.vl-trend')).toBeVisible();
 await expect(page.locator('.vl-recommend')).toContainText('3개 이상');
 await expect(page.locator('.vl-player-head')).toContainText('2 / 2');
 await page.locator('.vl-plot-dates button').first().click();
 await expect(page.locator('.sheet')).toContainText('소리의 음높이 흔들림');
 await page.locator('.sheet [data-close-observe]').click();
 await page.locator('[data-save-report]').click();
 await page.goto('/#/lab-reports');
 await expect(page.locator('.vl-report')).toHaveCount(1);
 await page.locator('.vl-report').click();
 await expect(page.locator('.vl-player-head')).toContainText('2 / 2');
 await page.goto('/#/song/s1');
 await expect(page.locator('#view [href^="#/vocal-lab/"]')).toHaveCount(0);
});

test('Vocal lab growth AI asks the server for a measured same-song report (overall mode)', async ({page}) => {
 await boot(page);
 await page.evaluate(async () => {
   for(const m of (await VZ.media.list()).filter(x=>x.songId==='s1')) {
     const old=m.id==='m1';
     await VZ.media.update(m,{analysis:{v:1,metrics:{voicedSeconds:30,stability:{wobbleCents:old?34:23,notes:4},intonation:{meanAbsCents:old?27:18,notes:10},range:{highCents:8100,high:'A5'},breath:{medianPhrase:old?2.4:3.2}},confidence:{voiceOverMrDb:12}}},{quiet:true});
   }
   VZ.media.invalidate();
   window.vzipCloudCoach=async input=>{window.__coach=input;return {mode:'overall',month:'all',note:'요약: 같은 곡 두 녹음을 비교했어요.\n좋아진 점: 지속음 흔들림이 줄었어요.\n보완할 점: 비교 녹음이 두 개뿐이에요.\n다음 연습: 같은 구간을 짧게 다시 녹음해요.'};};
 });
 await page.goto('/#/vocal-lab/s1');
 await labClear(page); await page.locator('.vl-dates button').first().click();
 await page.locator('.vl-dates button').nth(1).click();
 await page.locator('[data-growth-ai]').click();
 await expect(page.locator('.vl-growth-ai-text')).toContainText('다음 연습: 같은 구간을');
 const sent = await page.evaluate(() => window.__coach);
 expect(sent.mode).toBe('overall');
 expect(sent.analyzedSongs).toBe(1);
 expect(sent.metrics.map(m => m.key).sort()).toEqual(['intonation', 'phrase', 'stability']);
 expect(sent.metrics.find(m => m.key === 'stability')).toMatchObject({state:'better', improvedSongs:1, worsenedSongs:0, value:23});
 expect(sent.observations).toEqual([]);
 await page.reload();
 await labClear(page); await page.locator('.vl-dates button').first().click();
 await page.locator('.vl-dates button').nth(1).click();
 await expect(page.locator('.vl-growth-ai-text')).toContainText('좋아진 점: 지속음 흔들림이 줄었어요.');
});

test('Vocal lab growth report re-analyses older (v1) recordings in place so they become comparable', async ({page}) => {
 test.setTimeout(90000);
 await boot(page);
 await page.evaluate(async () => {
   for(const m of (await VZ.media.list()).filter(x=>x.songId==='s1')) {
     const old=m.id==='m1';
     await VZ.media.update(m,{analysis:{v:1,metrics:{voicedSeconds:30,stability:{wobbleCents:old?34:23,notes:4},intonation:{meanAbsCents:old?27:18,notes:10},range:{highCents:8100,high:'A5'},breath:{medianPhrase:old?2.4:3.2}},confidence:{voiceOverMrDb:12}}},{quiet:true});
   }
   VZ.media.invalidate();
   window.__reanalysed=[];
   VZ.analyzeRecording=async (item)=>{window.__reanalysed.push(item.id);const summary={v:2,at:Date.now(),seconds:30,metrics:{voicedSeconds:30,stability:{wobbleCents:20,notes:4},intonation:{meanAbsCents:15,notes:10},breath:{medianPhrase:3},phrases:{rows:[]},pitchBands:{rows:[]}},confidence:{voiceOverMrDb:12,pitch:0.95}};await VZ.media.update(item,{analysis:summary},{quiet:true});return {summary};};
 });
 await page.goto('/#/vocal-lab/s1');
 await labClear(page); await page.locator('.vl-dates button').first().click();
 await page.locator('.vl-dates button').nth(1).click();
 const redo=page.locator('[data-growth-reanalyze]');
 await expect(redo).toContainText('2개 다시 분석');
 await redo.click();
 await expect.poll(()=>page.evaluate(()=>window.__reanalysed.slice().sort())).toEqual(['m1','m2']);
 await expect(page.locator('[data-growth-reanalyze]')).toHaveCount(0);
 const versions=await page.evaluate(async()=>(await VZ.media.list()).filter(x=>x.songId==='s1').map(x=>x.analysis?.v));
 expect(versions.every(v=>v===2)).toBe(true);
});

test('Vocal lab shows a compact recommendation list and opens the chosen practice', async ({page}) => {
 await boot(page);
 await page.evaluate(async () => {
   await window.vzipStorePracticeMedia({id:'m3', name:'세 번째 녹음', created:Date.now(), type:'audio/wav', source:'practice', songId:'s1', song:'This Is the Moment', blob:new Blob([window.__wav], {type:'audio/wav'}), durationSeconds:1});
   VZ.media.invalidate();
   const all=await VZ.media.list();
   for(const m of all.filter(x=>x.songId==='s1')) {
     await VZ.media.update(m,{analysis:{v:1,metrics:{voicedSeconds:30,stability:{wobbleCents:18,notes:4},intonation:{meanAbsCents:28,notes:10},range:{lowCents:6000,highCents:8100},breath:{medianPhrase:2.4}},confidence:{voiceOverMrDb:12}}},{quiet:true});
   }
   VZ.media.invalidate();
 });
 await page.goto('/#/vocal-lab/s1');
 await labClear(page); await page.locator('.vl-dates button').first().click();
 await expect(page.locator('.vl-tip')).toHaveCount(2);
 const first=page.locator('.vl-tip').first();
 const name=await first.locator('summary strong').innerText();
 await first.locator('summary').click();
 await expect(first.locator('.vl-tip-detail')).toBeVisible();
 await first.locator('[data-practice-tip]').click();
 await expect(page.locator('.sheet textarea[name=memo]')).toHaveValue(new RegExp('\\[추천 연습\\] '+name));
});

test('Vocal lab keeps the viewport on date, metric, and satisfaction selection', async ({page}) => {
 await boot(page);
 await page.goto('/#/vocal-lab/s1');
 await labClear(page); await page.locator('.vl-dates button').first().click();
 await page.evaluate(() => window.scrollTo(0, 70));
 const beforeDate=await page.evaluate(() => window.scrollY);
 await page.locator('.vl-dates button').nth(1).click();
 expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(beforeDate, 0);
 await page.locator('[data-metric="into"]').scrollIntoViewIfNeeded();
 const beforeMetric=await page.evaluate(() => window.scrollY);
 await page.locator('[data-metric="into"]').click();
 expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(beforeMetric, 0);
 await page.locator('[data-rating="4"]').scrollIntoViewIfNeeded();
 const beforeRating=await page.evaluate(() => window.scrollY);
 await page.locator('[data-rating="4"]').click();
 await expect(page.locator('[data-rating="4"]')).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(beforeRating, 0);
});

test('Bottom navigation reaches the four main screens and the record button without horizontal overflow', async ({page}) => {
 await boot(page);
 for(const [label,route,heading]of [['내 곡','songs','내 곡'],['녹음 시작','record','녹음'],['기록','calendar','기록']]){
  await page.goto('/#/home');await expect(page.locator('.vz-student-home')).toBeVisible();
  await page.getByRole('button',{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp('#/'+route+'$'));
  await expect(page.locator('#top h1')).toHaveText(heading);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.goto('/#/home');await expect(page.locator('.vz-student-home')).toBeVisible();
 await expect(page.locator('.vz-nav-item')).toHaveCount(4);await expect(page.locator('.vz-goals')).toContainText('오늘의 목표 정하기');await expect(page.locator('.vz-recent-pill')).toContainText(['This Is the Moment']);
 const songsButton=page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'내 곡',exact:true});
 await expect(songsButton).toBeVisible();
 await expect.poll(async()=>Math.round((await songsButton.boundingBox())?.height||0)).toBeGreaterThanOrEqual(44);
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
  await s.getByRole('combobox', {name:'레슨 곡 추가'}).selectOption('s1');
  await s.getByRole('combobox', {name:'레슨 곡 추가'}).selectOption('s2');
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
  await expect(page.locator('[data-overdue]')).toContainText('지난 레슨 결과를 기록해 주세요');
  await expect(page.locator('a.item[href="#/lesson/l-over"] .badge')).toHaveText('결과 미기록');
  expect((await data(page)).lessons.find(l => l.id === 'l-over').status).toBe('scheduled');
  // Cancel it.
  await page.locator('a.item[href="#/lesson/l-over"]').click();
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

test('Vocal training has three levels and each can add a new entry that is offered next time', async ({page}) => {
  await boot(page, {media:false});
  // Training now starts from a recommendation picker; the three-level entry lives under 직접 입력.
  const open = async () => { await page.goto('/#/home'); await page.locator('[data-log]').click(); await sheet(page).locator('[data-mode="training"]').click(); await sheet(page).locator('select[name=recommendation]').selectOption('__custom'); };
  await open();
  const f = sheet(page);
  // Level 1: a new 분류 → its 세부 항목 starts empty, so add one there too, and a level-3 entry.
  await f.locator('select[name=category]').selectOption('__new');
  await expect(f.locator('[name=category__new]')).toBeVisible();
  await f.locator('[name=category__new]').fill('고음');
  await f.locator('select[name=detail]').selectOption('__new'); await f.locator('[name=detail__new]').fill('믹스보이스');
  await f.locator('select[name=detail2]').selectOption('__new'); await f.locator('[name=detail2__new]').fill('도 레 미');
  await f.locator('[name=minutes]').fill('15');
  await f.getByRole('button', {name:'연습 기록 저장'}).click();
  await expect(page.locator('.toast').last()).toContainText('연습 기록을 저장했어요');
  let d = await data(page);
  const cat = d.categories.find(c => c.name === '고음');
  expect(cat).toMatchObject({items:['믹스보이스'], sub:{'믹스보이스':['도 레 미']}});
  expect(d.practices.at(-1)).toMatchObject({practiceMode:'training', categoryId:cat.id, categoryLabel:'고음', detail:'믹스보이스', detail2:'도 레 미'});
  // Next time all three are choices; a level-3 entry added under an existing 세부 항목 is kept too.
  await open();
  await f.locator('select[name=category]').selectOption({label:'고음'});
  await expect(f.locator('select[name=detail] option', {hasText:'믹스보이스'})).toHaveCount(1);
  await f.locator('select[name=detail]').selectOption('믹스보이스');
  await expect(f.locator('select[name=detail2] option', {hasText:'도 레 미'})).toHaveCount(1);
  await f.locator('select[name=detail2]').selectOption('__new'); await f.locator('[name=detail2__new]').fill('솔 라 시');
  await f.locator('[name=minutes]').fill('10');
  await f.getByRole('button', {name:'연습 기록 저장'}).click();
  d = await data(page);
  expect(d.categories.find(c => c.name === '고음').sub['믹스보이스']).toEqual(['도 레 미', '솔 라 시']);
  // An empty new name is not saved.
  await open();
  await f.locator('select[name=category]').selectOption('__new'); await f.locator('[name=minutes]').fill('5');
  await f.getByRole('button', {name:'연습 기록 저장'}).click();
  await expect(page.locator('.toast').last()).toContainText('새 분류 이름을 입력해 주세요');
  expect((await data(page)).practices.length).toBe(d.practices.length);
});

test('Homework has a period; each practice in it asks whether it was done, how many times and how it went', async ({page}) => {
  await boot(page, {media:false, seed:{categories:[], songs:[{id:'s1', title:'곡'}], lessons:[], assignments:[], practices:[], comparisonReports:[]}});
  await page.goto('/#/homework');
  await page.locator('[data-add-task]').click();
  await sheet(page).locator('[name=title]').fill('립트릴 스케일');
  await sheet(page).locator('[name=startDate]').fill(day(-3));
  await sheet(page).locator('[name=dueDate]').fill(day(3));
  await sheet(page).getByRole('button', {name:'저장'}).click();
  const task = (await data(page)).assignments[0];
  expect(task).toMatchObject({title:'립트릴 스케일', startDate:day(-3), dueDate:day(3), status:'active'});
  // A practice inside the period asks about it.
  await page.goto('/#/home'); await page.locator('[data-log]').click();
  const ask = sheet(page).locator('.hw-ask');
  await expect(ask).toContainText('이번 연습에서 숙제 했나요?');
  await expect(ask).toContainText('립트릴 스케일');
  await ask.getByRole('button', {name:'했어요', exact:true}).click();
  await ask.getByRole('button', {name:'횟수 늘리기'}).click(); await ask.getByRole('button', {name:'횟수 늘리기'}).click();
  await ask.locator('[data-hw-note]').fill('세 번째에 고음이 편해짐');
  await sheet(page).locator('[name=minutes]').fill('20');
  await sheet(page).getByRole('button', {name:'연습 기록 저장'}).click();
  let p = (await data(page)).practices[0];
  expect(p).toMatchObject({completed:[task.id], assignmentReps:{[task.id]:3}, assignmentNotes:{[task.id]:'세 번째에 고음이 편해짐'}});
  // "안 했어요" records nothing; outside the period it is not asked.
  await page.locator('[data-log]').click();
  await ask.getByRole('button', {name:'안 했어요'}).click();
  await sheet(page).locator('[name=minutes]').fill('10');
  await sheet(page).getByRole('button', {name:'연습 기록 저장'}).click();
  expect((await data(page)).practices.at(-1).completed).toEqual([]);
  await page.locator('[data-log]').click();
  await sheet(page).locator('[name=date]').fill(day(10)); await sheet(page).locator('[name=date]').dispatchEvent('change');
  await expect(sheet(page).locator('.hw-ask')).toHaveCount(0);
  // The date was edited: closing asks first (sheet dirty guard).
  await page.locator('.sheet-page [data-close]').first().click();
  await page.getByRole('dialog', {name:'작성 중인 내용이 있어요'}).getByRole('button', {name:'닫기', exact:true}).click();
  // The homework shows the period, the total and each time with its memo.
  await page.goto('/#/homework');
  await expect(page.locator('[data-task="' + task.id + '"]')).toContainText('3회 했어요');
  await page.locator('[data-task="' + task.id + '"]').click();
  await expect(sheet(page)).toContainText('연습 1번 · 3회');
  await expect(sheet(page)).toContainText('세 번째에 고음이 편해짐');
});

test('Bulk upload: one file at a time, server-confirmed, duplicates left out, pauses on expired login, retries only failures, resumable', async ({page}) => {
  test.setTimeout(180000);
  await boot(page, {media:false});
  await page.evaluate(() => {
    window.__uploaded = []; window.__expireOnce = true; window.__badFails = true;
    // Already on the server from an earlier quick import: only its name (no extension) and size are known.
    const rows = [{id:'old-quick', name:'2026-11-01_10-00-05', size:208044, storageProvider:'r2', r2Key:'u/ui-test-user/old-quick/original.wav', created:Date.now()}];
    window.vzipCloudSignedIn = () => true; window.vzipCloudUserId = () => 'ui-test-user';
    window.vzipCloudMediaList = async () => rows.map(r => ({...r, cloud:true}));
    window.vzipCloudImport = async (file, info) => {
      if (/expire/.test(file.name + info.originalFilename) && window.__expireOnce) { window.__expireOnce = false; throw Error('로그인이 만료됐어요. 다시 로그인해 주세요.'); }
      if (/bad/.test(info.originalFilename) && window.__badFails) throw Error('지원하지 않는 형식이에요.');
      const meta = {...info, id:info.id, size:file.size, storageProvider:'r2', r2Key:'u/ui-test-user/' + info.id + '/original.wav'};
      rows.push(meta); window.__uploaded.push(info.originalFilename); return meta;
    };
  });
  // 26-second takes: imports shorter than 25 seconds are left out on purpose.
  const wav = tone => { const sr = 4000, n = sr * 26, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / (3 + tone)) * 4000), 44 + i * 2); return b; };
  const files = Array.from({length:21}, (_, i) => ({name:'2026-11-01_10-00-' + String(i).padStart(2, '0') + (i === 3 ? ' expire' : i === 7 ? ' bad' : '') + '.wav', mimeType:'audio/wav', buffer:wav(i)}));
  files.push({name:'2026-11-01_11-00-00 copy.wav', mimeType:'audio/wav', buffer:wav(0)}); // same content as the first file
  files.push({name:'메모.txt', mimeType:'text/plain', buffer:Buffer.from('not audio')}, {name:'cover.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF')}); // left out quietly
  // More than 20 files from 파일 가져오기 go to the bulk uploader, which checks and uploads them batch by batch by itself.
  await page.evaluate(() => { window.__vzipBatchSize = 10; });
  await page.goto('/#/library');
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,files);
  await expect(page.locator('.toast').last()).toContainText('22개 파일은 대량 업로드 화면에서');
  await expect(page.locator('.toast').last()).toContainText('음성·영상이 아닌 파일 2개는 뺐어요');
  const dash = page.locator('[data-dash]');
  await expect(dash).toContainText('전체 22개');
  // The expired login pauses the queue; nothing is counted as failed for it.
  await expect(dash).toContainText('로그인이 만료됐어요', {timeout:30000});
  await expect(dash.getByRole('button', {name:'이어서 올리기'})).toBeVisible();
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('vzip_upload_queue_v1')));
  expect(queued.items.length + queued.pendingCount).toBe(22); // the first batch is queued, the rest not checked yet
  expect(queued.total).toBe(22);
  expect(queued.items.every(i => i.hash && i.size)).toBe(true);
  await dash.getByRole('button', {name:'이어서 올리기'}).click();
  // A finished import shows its result card (done · duplicates — the copy picked twice and the file already up from a quick import — · failed).
  const result = page.locator('[data-result]');
  await expect(result).toContainText('저장 19개 · 중복 제외 2개 · 실패 1개', {timeout:60000});
  await expect(page.locator('[data-hub]')).toContainText('지원하지 않는 형식이에요');
  // Only the failure is retried, from 처리 내역 (the import keeps the failed file's original for it).
  await page.evaluate(() => { window.__badFails = false; });
  const before = await page.evaluate(() => window.__uploaded.length);
  await result.getByRole('link', {name:'처리 내역'}).click();
  await page.locator('[data-retry-all]').click();
  await expect(page.locator('[role=status]').filter({hasText:'업로드 1개 다시 시도'})).toBeVisible({timeout:30000});
  await page.goto('/#/import-hub');
  await expect(result).toContainText('저장 20개 · 중복 제외 2개');
  await expect(result).not.toContainText('실패');
  expect(await page.evaluate(() => window.__uploaded.some(x => /10-00-05/.test(x)))).toBe(false);
  expect(await page.evaluate(() => window.__uploaded.length)).toBe(before + 1);
  const names = await page.evaluate(() => window.__uploaded);
  expect(new Set(names).size).toBe(names.length); // nothing uploaded twice
  expect(names.some(x => /copy/.test(x))).toBe(false); // the duplicate never went up
  expect(await page.evaluate(async () => (await window.vzipReadMedia()).length)).toBe(0); // no device copies
  // Queue state survives a reload; a stopped queue is shown with what is left.
  await page.evaluate(() => { const q = JSON.parse(localStorage.getItem('vzip_upload_queue_v1')); q.items[0].state = 'waiting'; localStorage.setItem('vzip_upload_queue_v1', JSON.stringify(q)); });
  await page.reload(); await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.goto('/#/import-hub');
  await expect(page.locator('[data-stopped]')).toContainText('전체 22개 · 완료 19 · 남음 1');
  await expect(page.locator('[data-stopped]')).toContainText('원본 파일을 다시 선택');
});

test('A stopped upload resumes from its card: pick the same files again, finished ones are skipped and only the rest go up', async ({page}) => {
  test.setTimeout(120000);
  await boot(page, {media:false});
  const wav = tone => { const sr = 4000, n = sr * 26, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / (3 + tone)) * 4000), 44 + i * 2); return b; };
  const files = Array.from({length:5}, (_, i) => ({name:'11-5 #' + (i + 1) + '.m4a.wav', mimeType:'audio/wav', buffer:wav(i)}));
  await page.evaluate(sizes => {
    window.__uploaded = []; const rows = [];
    window.vzipCloudSignedIn = () => true; window.vzipCloudUserId = () => 'ui-test-user';
    window.vzipCloudMediaList = async () => rows.map(r => ({...r, cloud:true}));
    window.vzipCloudImport = async (file, info) => { const meta = {...info, id:info.id, size:file.size, storageProvider:'r2', r2Key:'u/ui-test-user/' + info.id + '/original.wav'}; rows.push(meta); window.__uploaded.push(info.originalFilename); return meta; };
    // Safari was closed after 3 of 5 files: the queue remembers them, but not the files themselves.
    localStorage.setItem('vzip_upload_queue_v1', JSON.stringify({total:5, pendingCount:0, updatedAt:Date.now(), items:sizes.map((size, i) => ({id:'q' + i, name:'11-5 #' + (i + 1) + '.m4a.wav', size, hash:'', state:i < 3 ? 'done' : 'waiting'}))}));
  }, files.map(f => f.buffer.length));
  await page.evaluate(() => { location.hash = '#/import-hub'; });
  const card = page.locator('[data-stopped]');
  await expect(card).toContainText('완료 3 · 남음 2');
  await card.locator('[data-q-resume]').setInputFiles([...files, {name:'메모.txt', mimeType:'text/plain', buffer:Buffer.from('x')}]);
  await expect(page.locator('.toast').last()).toContainText('음성·영상이 아닌 파일 1개는 건너뛰었어요');
  // The finished import's result card: the 3 files already up are left out as duplicates, nothing failed.
  await expect(page.locator('[data-result]')).toContainText('저장 2개 · 중복 제외 3개', {timeout:60000});
  await expect(page.locator('[data-result]')).not.toContainText('실패');
  expect((await page.evaluate(() => window.__uploaded)).sort()).toEqual(['11-5 #4.m4a.wav', '11-5 #5.m4a.wav']);
  await page.evaluate(() => { location.hash = '#/home'; }); await page.evaluate(() => { location.hash = '#/import-hub'; });
  await expect(page.locator('[data-stopped]')).toHaveCount(0); // nothing left: the card is gone
});

test('보컬 분석: a recording sung over an MR gets a pitch curve and measurements on the device, saved on the recording', async ({page}) => {
  test.setTimeout(120000);
  const {synth} = require('./synth-vocal.cjs');
  const wavOf = ({samples, sr}) => { const b = Buffer.alloc(44 + samples.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40); for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 20000))), 44 + i * 2); return b; };
  await page.route('**/__song.wav', r => r.fulfill({contentType:'audio/wav', body:wavOf(synth({sr:22050}))}));
  await page.route('**/__mr.wav', r => r.fulfill({contentType:'audio/wav', body:wavOf(synth({sr:22050, withVoice:false}))}));
  await boot(page, {media:false});
  await page.evaluate(async () => {
    for (const [id, url] of [['song', '/__song.wav'], ['mr', '/__mr.wav']]) await window.vzipStorePracticeMedia({id, name:id === 'song' ? '노래 + MR' : 'MR만', created:Date.now(), type:'audio/wav', source:'practice', songId:'s1', blob:await (await fetch(url)).blob(), durationSeconds:20});
    VZ.media.invalidate();
  });
  // Test the existing analysis route directly; navigation menus have their own coverage.
  await page.goto('/#/analysis/song');
  const out = page.locator('[data-out]');
  await expect(out.locator('.ana-grid')).toBeVisible({timeout:60000});
  await expect(out).toContainText('유효 최고 C5');
  await expect(out).toContainText('안정 최고 C5');
  await expect(out).toContainText('음정 정확도');
  await expect(out).toContainText('초당 5.5회');
  await expect(out).toContainText('보컬 분리가 확인되지는 않아요');
  await expect(out.locator('svg path.curve')).toHaveCount(1);
  await expect(out.locator('svg line.n')).toHaveCount(9);
  await expect(out.locator('[data-saved]')).toContainText('저장했어요');
  const saved = await page.evaluate(async () => (await window.vzipReadMedia()).find(x => x.id === 'song').analysis);
  expect(saved.v).toBe(2);
  expect(saved.metrics.range).toMatchObject({low:'A3', high:'C5'});
  expect(saved.metrics.intonation.meanAbsCents).toBeLessThan(12);
  expect(saved).not.toHaveProperty('curve'); // only the summary is kept with the recording
  // Tapping the curve moves playback there.
  const svg = out.locator('svg');
  const box = await svg.boundingBox();
  await page.locator('[data-scroll]').evaluate(el => { el.scrollLeft = 0; });
  await svg.click({position:{x:Math.min(box.width - 5, 10 * 36), y:100}});
  await expect.poll(() => out.locator('[data-head]').evaluate(l => +l.getAttribute('x1'))).toBeGreaterThan(9 * 36 * 0.9);
  // Accompaniment only: no voice is invented.
  await page.goto('/#/analysis/mr');
  await expect(page.locator('[data-out]')).toContainText('목소리를 찾지 못했어요', {timeout:60000});
});

test('보컬 분석: a take whose MR drowns the voice is measured again with the song\'s own MR file subtracted', async ({page}) => {
  test.setTimeout(120000);
  const Y = require('./helpers/mr-synth.cjs');
  const wav = x => { const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(x[i] / peak * 0.9 * 32767), 44 + i * 2); return b; };
  // Synthetic only: a song-like MR file and a phone take of a melody sung over it, the MR 8 dB louder than the voice.
  const mr = Y.mr(60), take = Y.record(Y.vocal(20).x, mr, {offset:9.5, db:8}).x;
  await page.route('**/__mixed.wav', r => r.fulfill({contentType:'audio/wav', body:wav(take)}));
  await page.route('**/__mrfile.wav', r => r.fulfill({contentType:'audio/wav', body:wav(mr)}));
  await boot(page, {media:false});
  await page.evaluate(async () => {
    // The song's MR is an uploaded file (R2 is stubbed: this test checks the subtraction, not the storage).
    window.VzipR2.enabled = () => true; window.VzipR2.url = async key => key === 'u/test/mr-1.m4a' ? '/__mrfile.wav' : '/missing';
    VZ.change(d => { d.songs[0].mrTracks = [{id:'mr-1', kind:'file', title:'연습 MR', r2Key:'u/test/mr-1.m4a', type:'audio/wav', created:Date.now()}]; });
    await window.vzipStorePracticeMedia({id:'mixed', name:'MR 크게 들어간 녹음', created:Date.now(), type:'audio/wav', source:'practice', songId:'s1', blob:await (await fetch('/__mixed.wav')).blob()});
    VZ.media.invalidate();
  });
  await page.goto('/#/analysis/mixed');
  const out = page.locator('[data-out]');
  await expect(out.locator('.ana-grid')).toBeVisible({timeout:90000});
  const note = out.locator('[data-mr-removed]');
  await expect(note).toContainText('반주(MR)를 빼고 목소리만 측정했어요');
  await expect(note).toContainText('연습 MR');
  await expect(note).toContainText(/MR 0:(09|10)부터/);
  await expect(note.locator('audio[data-voice-only]')).toHaveAttribute('src', /^blob:/);
  await expect(out).not.toContainText('피치 신뢰도가 낮아');
  if (process.env.VZ_MR_SHOT) await note.screenshot({path:process.env.VZ_MR_SHOT});
  await expect(out.locator('[data-saved]')).toContainText('저장했어요');
  const saved = await page.evaluate(async () => (await window.vzipReadMedia()).find(x => x.id === 'mixed').analysis);
  expect(saved.confidence.mrRemoved).toMatchObject({trackId:'mr-1'});
  expect(Math.abs(saved.confidence.mrRemoved.offsetSeconds - 9.5)).toBeLessThan(0.01);
  expect(saved.confidence.pitchConfidence).toBeGreaterThanOrEqual(0.8);
  expect(saved).not.toHaveProperty('voice'); // the cleaned voice is never kept
});

test('보컬 분석: a held-back saved result is replaced when the MR can now be removed; an AI-separated one is kept and labelled', async ({page}) => {
  test.setTimeout(120000);
  const Y = require('./helpers/mr-synth.cjs');
  const wav = x => { const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(x[i] / peak * 0.9 * 32767), 44 + i * 2); return b; };
  const mr = Y.mr(60), take = Y.record(Y.vocal(20).x, mr, {offset:6, db:8}).x;
  await page.route('**/__heldtake.wav', r => r.fulfill({contentType:'audio/wav', body:wav(take)}));
  await page.route('**/__mrfile.wav', r => r.fulfill({contentType:'audio/wav', body:wav(mr)}));
  await boot(page, {media:false});
  // Saved results (current analyzer version with detail rows): one held back (MR drowned the voice), one measured by
  // the server after AI separation.
  const detail = {voicedSeconds:15, phrases:{rows:[]}, pitchBands:{rows:[]}, intonation:{meanAbsCents:8, notes:12}};
  await page.evaluate(async ([detail]) => {
    window.VzipR2.enabled = () => true; window.VzipR2.url = async () => '/__mrfile.wav';
    VZ.change(d => { d.songs[0].mrTracks = [{id:'mr-1', kind:'file', title:'연습 MR', r2Key:'u/test/mr-1.m4a', type:'audio/wav', created:Date.now()}]; });
    const blob = await (await fetch('/__heldtake.wav')).blob();
    await window.vzipStorePracticeMedia({id:'held', name:'보류된 녹음', created:Date.now(), type:'audio/wav', source:'practice', songId:'s1', blob,
      analysis:{v:2, at:111, metrics:detail, confidence:{pitchConfidence:0.42, voiceOverMrDb:0.5}, scope:{kind:'whole-recording', separationWanted:true}}});
    await window.vzipStorePracticeMedia({id:'aisep', name:'AI 분리된 녹음', created:Date.now(), type:'audio/wav', source:'practice', songId:'', blob,
      analysis:{v:2, at:222, by:'server', metrics:detail, confidence:{pitchConfidence:0.93, aiSeparated:{model:'htdemucs'}}, scope:{kind:'whole-recording', separationTried:true}}});
    VZ.media.invalidate();
  }, [detail]);
  await page.goto('/#/analysis/held');
  const out = page.locator('[data-out]');
  await expect(out.locator('[data-mr-removed]')).toBeVisible({timeout:90000});
  await expect(out.locator('[data-saved]')).toContainText('저장했어요');
  const held = await page.evaluate(async () => (await window.vzipReadMedia()).find(x => x.id === 'held').analysis);
  expect(held.confidence.mrRemoved).toMatchObject({trackId:'mr-1'}); expect(held.history.at(-1).at).toBe(111);
  // The AI-separated result is not overwritten by the take as recorded (no MR file for it); it is labelled.
  await page.goto('/#/analysis/aisep');
  await expect(out.locator('[data-ai-separated]')).toContainText('AI 분리 후 측정(참고)', {timeout:90000});
  await expect(out.locator('[data-saved]')).toContainText('그대로 두었어요');
  const kept = await page.evaluate(async () => (await window.vzipReadMedia()).find(x => x.id === 'aisep').analysis);
  expect(kept.at).toBe(222); expect(kept.confidence.aiSeparated).toEqual({model:'htdemucs'});
});

test('곡별 보컬 측정 변화: the recordings of a song are analyzed on the device and charted by date; first vs latest is compared and saved', async ({page}) => {
  test.setTimeout(180000);
  const {synth} = require('./synth-vocal.cjs');
  const wavOf = ({samples, sr}) => { const b = Buffer.alloc(44 + samples.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40); for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 20000))), 44 + i * 2); return b; };
  // Three takes of one song, each more in tune (30 → 15 → 5 cents off), and one take where only the MR was caught.
  const takes = [['t1', '2026-08-01', -30], ['t2', '2026-09-15', -15], ['t3', '2026-11-01', -5]];
  for (const [id, , detune] of takes) await page.route('**/__' + id + '.wav', r => r.fulfill({contentType:'audio/wav', body:wavOf(synth({sr:22050, detune}))}));
  await page.route('**/__t0.wav', r => r.fulfill({contentType:'audio/wav', body:wavOf(synth({sr:22050, withVoice:false}))}));
  await boot(page, {media:false});
  await page.evaluate(async rows => {
    for (const [id, date] of rows) await window.vzipStorePracticeMedia({id, name:'연습 ' + date, created:new Date(date + 'T20:00:00').getTime(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId:'s1', song:'This Is the Moment', blob:await (await fetch('/__' + id + '.wav')).blob(), durationSeconds:20});
    VZ.media.invalidate();
  }, [['t0', '2026-07-01'], ...takes]);
  // The song page no longer places the 보컬 변화 card (growth moved to 보컬 연구소), but the card module still ships:
  // mount it for song s1 the way the song page did, so its on-device analysis, charts and saved comparison stay covered.
  const mount = () => page.evaluate(async () => { document.querySelector('#vg-host')?.remove(); const host = document.createElement('div'); host.id = 'vg-host'; host.dataset.songVocal = ''; document.querySelector('#view').append(host); VZ.songVocalGrowth(host, VZ.song('s1'), (await VZ.media.list()).filter(m => m.songId === 's1')); });
  await page.goto('/#/song/s1');
  await mount();
  const card = page.locator('[data-song-vocal]');
  await expect(card).toContainText('분석 0/4개');
  await card.getByRole('button', {name:/지금 4개 분석하기/}).click();
  await expect(card).toContainText('분석 4/4개', {timeout:120000});
  await expect(card.locator('.vg-chart')).toHaveCount(5);
  // 음정 정확도 (cents off the nearest semitone) goes 30 → 5: improved on the same phrases; the MR-only take is left out.
  const into = card.locator('.vg-chart').filter({hasText:'음정 정확도'});
  await expect(into).toContainText('좋아진 방향');
  await expect(into).toContainText('같은 프레이즈');
  // 성장 지표: range is a neutral observation, passaggio is reference only.
  await expect(card.locator('.vg-growth li').filter({hasText:'음역 확장'})).not.toContainText('좋아진');
  await expect(card.locator('.vg-growth li').filter({hasText:'파사지오'})).toContainText('선생님 판단 참고');
  await expect(into.locator('circle')).toHaveCount(3);
  await expect(card.locator('circle.weak')).toHaveCount(0); // the MR-only take has no measurements to plot
  await expect(card).toContainText('녹음 1개는 노래가 짧거나 반주가 커서 변화 계산에서 뺐어요.');
  await expect(card.locator('.vg-chart').filter({hasText:'유효 최고음'})).toContainText('비슷함'); // C5 each time, a few cents apart
  await card.getByText('처음 vs 최근 측정값 비교').click();
  const table = card.locator('.vg-table');
  await expect(table).toContainText('8월 1일');
  await expect(table).toContainText('11월 1일');
  await card.getByRole('button', {name:'이 비교 저장'}).click();
  const report = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).comparisonReports.find(r => r.firstId === 't1' && r.secondId === 't3'), KEY);
  expect(report.songId).toBe('s1');
  expect(report.measures.first.metrics.intonation.meanAbsCents).toBeGreaterThan(report.measures.second.metrics.intonation.meanAbsCents + 15);
  const saved = await page.evaluate(async () => (await window.vzipReadMedia()).filter(x => x.analysis).map(x => x.id).sort());
  expect(saved).toEqual(['t0', 't1', 't2', 't3']); // every take keeps its summary, so it is never analyzed twice
  // The 녹음 비교 page shows the same measurements for the two takes.
  await page.goto('/#/compare?song=s1&a=t1&b=t3');
  await expect(page.locator('.vg-table')).toContainText('음정 정확도');
  // A dot opens that take's pitch curve.
  await page.goto('/#/song/s1');
  await mount();
  await page.locator('[data-song-vocal] .vg-chart').first().locator('a').last().click();
  await expect(page).toHaveURL(/#\/analysis\/t3$/);
});

test('자동 보컬 분석: unmeasured recordings are analyzed in the background, never during a busy screen, and it can be switched off', async ({page}) => {
  test.setTimeout(180000);
  const {synth} = require('./synth-vocal.cjs');
  const wavOf = ({samples, sr}) => { const b = Buffer.alloc(44 + samples.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40); for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 20000))), 44 + i * 2); return b; };
  await page.route('**/__take.wav', r => r.fulfill({contentType:'audio/wav', body:wavOf(synth({sr:22050}))}));
  await page.addInitScript(() => { window.__vzipAutoAnalysis = true; window.__vzipAutoAnalysisDelay = 300; });
  await boot(page, {media:false});
  const store = (id, date) => page.evaluate(async ([id, date]) => {
    await window.vzipStorePracticeMedia({id, name:'연습 ' + id, created:new Date(date + 'T20:00:00').getTime(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId:'s1', blob:await (await fetch('/__take.wav')).blob(), durationSeconds:20});
    VZ.media.invalidate(); window.dispatchEvent(new Event('vzip:media-saved'));
  }, [id, date]);
  const measured = () => page.evaluate(async () => (await window.vzipReadMedia()).filter(x => x.analysis?.v).map(x => x.id).sort());
  await store('a1', '2026-10-01'); await store('a2', '2026-11-01');
  await page.goto('/#/settings');
  const row = page.locator('[data-auto-analysis]');
  await expect(row).toContainText('모든 녹음을 분석했어요', {timeout:60000});
  expect(await measured()).toEqual(['a1', 'a2']);
  // A busy screen (recording) holds it; leaving it lets it continue.
  await page.goto('/#/record');
  await store('a3', '2026-11-05');
  await page.waitForTimeout(2500);
  expect(await measured()).toEqual(['a1', 'a2']);
  await page.goto('/#/home');
  await expect.poll(measured, {timeout:60000}).toEqual(['a1', 'a2', 'a3']);
  // Switched off: nothing more is analyzed, and the choice is remembered.
  await page.goto('/#/settings');
  await row.locator('[data-auto-toggle]').click();
  await expect(row.locator('[data-auto-toggle]')).toHaveAttribute('aria-checked', 'false');
  await store('a4', '2026-11-06');
  await page.goto('/#/home'); await page.waitForTimeout(2500);
  expect(await measured()).toEqual(['a1', 'a2', 'a3']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vzip_auto_analysis_v1')).on)).toBe(false);
  // (The song page's 보컬 변화 card was removed; results live on the recordings, checked above.) After a reload it stays off.
  await page.reload(); await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.goto('/#/settings');
  await expect(row.locator('[data-auto-toggle]')).toHaveAttribute('aria-checked', 'false');
  await expect(row).toContainText('꺼져 있어요.');
});

test('서버 자동 분석: progress card, AI / needs-a-look labels, live refresh when the server saves, browser analysis stands down', async ({page}) => {
  await boot(page, {media:false});
  await page.evaluate(async () => {
    const wav = new Blob([new Uint8Array(64)], {type:'audio/wav'});
    await window.vzipStorePracticeMedia({id:'ai1', name:'자동 지정된 녹음', created:Date.now(), type:'audio/wav', source:'import', songId:'s1', song:'This Is the Moment — 지킬 앤 하이드', songSource:'ai', blob:wav});
    await window.vzipStorePracticeMedia({id:'rv1', name:'확인 필요한 녹음', created:Date.now() - 1000, type:'audio/wav', source:'import', blob:wav});
    window.__jobs = {rows:[
      {media_id:'ai1', kind:'vocal', status:'done'}, {media_id:'ai1', kind:'song', status:'done'},
      {media_id:'rv1', kind:'vocal', status:'running'}, {media_id:'rv1', kind:'song', status:'review'},
      {media_id:'x1', kind:'vocal', status:'failed'}],
      review:[{media_id:'rv1', result:{top3:[{songId:'s2', score:0.31, title:'On My Own'}], transcript:'on my own pretending he is beside me'}}]};
    window.vzipCloudUserId = () => 'ui-test-user';
    window.vzipAnalysisEnqueue = async () => 0;
    window.vzipAnalysisJobs = async () => JSON.parse(JSON.stringify(window.__jobs));
    window.vzipAnalysisLive = (onMedia, onJobs) => { window.__live = {onMedia, onJobs}; return () => {}; };
    VZ.media.invalidate();
    window.dispatchEvent(new Event('vzip:auth-changed'));
  });
  await expect.poll(() => page.evaluate(() => VZ.serverAnalysisOn())).toBe(true);
  await page.goto('/#/library');
  const card = page.locator('[data-server-analysis]');
  await expect(card).toContainText('곡 확인 필요');
  await expect(card).toContainText('대기·분석 중 1건');
  await expect(card).toContainText('분석 실패 1건');
  await expect(card.locator('a[href="#/song-suggest"]')).toContainText('1');
  await expect(page.locator('[data-media="ai1"]')).toContainText('AI 곡 지정');
  await expect(page.locator('[data-media="rv1"]')).toContainText('곡 확인 필요');
  // The server sorts rv1 while the app is open: the change arrives live and the library shows it.
  await page.evaluate(async () => {
    // Stand-in for the server's write (Safari stores file bytes differently, so go through the app's own update).
    const rec = (await VZ.media.list(true)).find(x => x.id === 'rv1');
    await VZ.media.update(rec, {songId:'s2', song:'On My Own', songSource:'ai'}, {quiet:true});
    window.__jobs.rows = window.__jobs.rows.map(j => j.media_id === 'rv1' ? {...j, status:'done'} : j); window.__jobs.review = [];
    window.__live.onJobs(); window.__live.onMedia();
  });
  await expect(page.locator('[data-media="rv1"]')).toContainText('On My Own', {timeout:5000});
  await expect(page.locator('[data-media="rv1"]')).not.toContainText('곡 확인 필요');
  await expect(card).toContainText('곡 확인 필요 0건');
  await expect(card).not.toContainText('대기·분석 중');
  // The browser's own background analysis leaves the work to the server.
  expect(await page.evaluate(() => { window.__vzipAutoAnalysis = true; return VZ.autoAnalysisStatus().enabled && VZ.serverAnalysisOn(); })).toBe(true);
});

test('맞춤 연습 추천: measured intonation drift leads to a pitch exercise; starting it pre-fills a practice record; too few takes gives a plain notice', async ({page}) => {
  await boot(page, {media:false});
  await page.goto('/#/home');
  await expect(page.locator('[data-tip]')).toContainText('3개 이상 모이면');   // nothing measured yet: no advice invented
  await page.evaluate(async () => {
    const wav = new Blob([new Uint8Array(64)], {type:'audio/wav'});
    for (let i = 0; i < 4; i++) await window.vzipStorePracticeMedia({id:'t' + i, name:'take ' + i, created:Date.now() - i * 864e5, recordedDate:VZ.ymd(new Date(Date.now() - i * 864e5)), type:'audio/wav', source:'practice', songId:'s1', blob:wav,
      analysis:{v:1, at:Date.now(), seconds:180, confidence:{voiceOverMrDb:18}, metrics:{voicedSeconds:90, intonation:{meanAbsCents:22 + i, within20:40, notes:20}, stability:{wobbleCents:5, notes:12},
        vibrato:{share:40, rateHz:5.6, extentCents:40, regularity:0.9, notes:10}, range:{lowCents:5700, highCents:7200, low:'A3', high:'C5', peak:'C5'}, breath:{phrases:10, medianPhrase:4.5, longestPhrase:7}}}});
    VZ.media.invalidate();
  });
  await page.goto('/#/songs'); await page.goto('/#/home');
  const tip = page.locator('[data-tip] .tip');
  await expect(tip).toContainText('음정 정확도 연습');
  await expect(tip).toContainText('±23.5 cent');                 // the median of the measured takes
  // The measured range travels with the tip (guided practice uses it); the card no longer prints it as a step.
  expect(await page.evaluate(async () => VZ.practiceTips(await VZ.media.list()).range)).toBe('A3~C5');
  await expect(page.locator('[data-tip]')).toContainText('통증이나 쉰 목소리가 있으면 쉬어 주세요');
  // Start (the song page no longer repeats the card) → the existing practice record, pre-filled; saving marks it done today.
  await tip.getByRole('button', {name:'연습 시작'}).click();
  await expect(page.locator('.sheet input[name=minutes]')).toHaveValue('10');
  await expect(page.locator('.sheet textarea[name=memo]')).toHaveValue(/\[추천 연습\] 음정 정확도 연습/);
  await page.locator('.sheet-foot .btn').last().click();
  await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k)).practices.some(p => String(p.memo).startsWith('[추천 연습] 음정 정확도 연습')), KEY)).toBe(true);
  await page.goto('/#/home');
  await expect(page.locator('[data-tip] .tip')).toContainText('오늘 했어요');
  // Homework is untouched by the advice.
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).assignments.map(a => a.id).sort(), KEY)).toEqual(['a1', 'a2']);
});

test('파일 가져오기 quietly leaves out files that are not audio or video', async ({page}) => {
  await boot(page, {media:false});
  const b = longWav();
  await page.goto('/#/library');
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,[{name:'take.wav', mimeType:'audio/wav', buffer:b}, {name:'가사.txt', mimeType:'text/plain', buffer:Buffer.from('가사')}, {name:'._take.wav', mimeType:'audio/wav', buffer:Buffer.from('x')}]);
  await expect(page.locator('.toast').last()).toContainText('음성·영상이 아닌 파일 2개는 뺐어요');
  await expect(sheet(page).locator('.up-row')).toHaveCount(1);
  await expect(sheet(page)).not.toContainText('가사.txt');
  // Only non-media picked: nothing to import.
  await sheet(page).getByRole('button', {name:'돌아가기'}).click();
  await expect(sheet(page)).toHaveCount(0);
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,{name:'메모.txt', mimeType:'text/plain', buffer:Buffer.from('x')});
  await expect(page.locator('.toast').last()).toContainText('고른 파일 중에 음성·영상 파일이 없어요');
});

test('Recordings named yyyy-MM-dd_HH-mm-ss land on that date and time; older imports can be moved in one tap', async ({page}) => {
  await boot(page, {media:false});
  const b = longWav();
  await page.goto('/#/library');
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,{name:'2025-08-08_22-09-00.wav', mimeType:'audio/wav', buffer:b});
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).locator('[data-done]')).toContainText('✓ 저장 완료 1개', {timeout:30000});
  const [saved] = await media(page);
  expect(saved).toMatchObject({recordedDate:'2025-08-08', dateSource:'filename'});
  expect(await page.evaluate(t => { const d = new Date(t); return [d.getHours(), d.getMinutes()]; }, saved.created)).toEqual([22, 9]);
  // "11-3 scale.m4a" style: month-day at the start, the most recent such day.
  const expected = require('../media-date.js').fromName('11-3 scale.wav').recordedDate;
  await page.keyboard.press('Escape'); await page.goto('/#/home'); await page.goto('/#/library');
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,{name:'11-3 scale.wav', mimeType:'audio/wav', buffer:b});
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).locator('[data-done]')).toContainText('✓ 저장 완료 1개', {timeout:30000});
  expect((await media(page)).find(m => m.id !== saved.id)).toMatchObject({recordedDate:expected, dateSource:'filename'});
  // A recording imported earlier on its download day is offered a one-tap move; a date set by hand is left alone.
  await page.evaluate(async () => {
    await window.vzipStorePracticeMedia({id:'old-dl', name:'2025-07-01_09-30-00', type:'audio/wav', blob:new Blob(['x'], {type:'audio/wav'}), created:Date.now(), recordedDate:'2026-11-01', dateSource:'file-modified', source:'import'});
    await window.vzipStorePracticeMedia({id:'by-hand', name:'2025-07-02_09-30-00', type:'audio/wav', blob:new Blob(['x'], {type:'audio/wav'}), created:Date.now(), recordedDate:'2026-11-02', dateSource:'manual', source:'import'});
  });
  await page.keyboard.press('Escape'); await page.goto('/#/home'); await page.goto('/#/library');
  const fix = page.locator('[data-name-dates]');
  await expect(fix).toContainText('1개'); // the two imports above are already on their days
  await fix.getByRole('button', {name:'이름대로 맞추기'}).click();
  await page.locator('.sheet [data-ok]').click();
  await expect(page.locator('.toast').last()).toContainText('1개 녹음을 파일 이름 날짜로 옮겼어요');
  const all = await media(page);
  expect(all.find(m => m.id === 'old-dl')).toMatchObject({recordedDate:'2025-07-01', dateSource:'filename'});
  expect(all.find(m => m.id === 'by-hand').recordedDate).toBe('2026-11-02');
  await expect(fix).toBeEmpty();
});

test('Saved comparisons show the two recording days (2026.08.12 → 2026.10.20)', async ({page}) => {
  await boot(page, {media:false});
  await page.evaluate(async () => {
    const mk = (id, day) => window.vzipStorePracticeMedia({id, name:'Rizzo ' + day, type:'audio/wav', blob:new Blob(['x'], {type:'audio/wav'}), created:Date.now(), recordedDate:day, dateSource:'manual', songId:'s1', source:'import'});
    await mk('cmp-a', '2026-08-12'); await mk('cmp-b', '2026-10-20');
    VZ.media.invalidate();
    VZ.change(d => { d.comparisonReports = [{id:'r1', firstId:'cmp-a', secondId:'cmp-b', firstName:'Rizzo 2026-08-12', secondName:'Rizzo 2026-10-20', firstDate:Date.now(), secondDate:Date.now(), song:'This Is the Moment', notes:'', created:Date.now()}]; }, {silent:true});
  });
  // Saved comparisons are listed in 리포트 보관함 and reopen the two recordings, labelled by their recording days.
  await page.goto('/#/lab-reports');
  const link = page.locator('a.vl-report[href*="a=cmp-a&b=cmp-b"]');
  await expect(link).toContainText('비교 메모');
  await link.click();
  await expect(page.locator('[data-compare-a]')).toHaveValue('cmp-a');
  await expect(page.locator('[data-compare-b]')).toHaveValue('cmp-b');
  await expect(page.locator('[data-compare-a] option:checked')).toContainText('08.12');
  await expect(page.locator('[data-compare-b] option:checked')).toContainText('10.20');
});

test('A past scheduled lesson can be recorded as done or cancelled from home in one tap', async ({page}) => {
  await boot(page, {media:false});
  const card = page.locator('[data-overdue]');
  await expect(card).toContainText('지난 레슨 결과를 기록해 주세요');
  await card.locator('[data-resolve="done"][data-id="l-over"]').click();
  await expect(page.locator('.toast').last()).toContainText('레슨을 완료로 기록했어요');
  await expect(card).toHaveCount(0);
  const l = (await data(page)).lessons.find(x => x.id === 'l-over');
  expect(l.status).toBe('done'); expect(l.completedAt).toBeGreaterThan(0);
});

test('Lesson delete keeps homework and practice history; legacy page still reads v6 data', async ({page}) => {
  await boot(page);
  await page.goto('/#/lesson/l1');
  await page.getByRole('button', {name:'레슨 삭제'}).click();
  await page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true}).getByRole('button',{name:'삭제 대상 확인'}).click();
  await page.getByRole('dialog',{name:'선택 항목 영구 삭제',exact:true}).getByRole('button',{name:'영구 삭제',exact:true}).click();
  await expect.poll(async()=>(await data(page)).lessons.some(l=>l.id==='l1')).toBe(false);
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
  await s.locator('[data-hw-id]').filter({hasText:'On My Own 브릿지 10번'}).getByRole('button', {name:'했어요', exact:true}).click();
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
  await expect(page.locator('.vz-song-detail-title')).toHaveText('Defying Gravity');
  await page.goto('/#/songs');
  await page.locator('[data-song-search]').click();
  const beforeSearch = await page.locator('.list .item').count();
  await page.getByRole('searchbox',{name:'곡 검색',exact:true}).fill('moment');
  await expect(page.locator('.list .item')).toHaveCount(beforeSearch);
  await page.getByRole('searchbox',{name:'곡 검색',exact:true}).press('Enter');
  await expect(page.locator('.list .item')).toHaveCount(1);
  await expect(page.locator('[data-song-search]')).toHaveAttribute('aria-pressed','true');
  // A background media refresh keeps the applied search.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'m1'}})));
  await page.waitForTimeout(700);
  await page.locator('[data-song-search]').click();
  await expect(page.getByRole('searchbox',{name:'곡 검색',exact:true})).toHaveValue('moment');
  await page.getByRole('searchbox',{name:'곡 검색',exact:true}).press('Enter');
  await expect(page.locator('.list .item')).toHaveCount(1);
  await page.locator('.list .item').click();
  await expect(page.locator('[data-summary]')).toContainText('녹음 2개');
  // Recordings share one tab; lesson and practice records remain in activity history.
  await expect(page.getByRole('tab', {name:'녹음'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-body] [data-media]')).toHaveCount(2);
  await page.getByRole('tab', {name:'활동 기록'}).click();
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
  await page.evaluate(() => { const real = window.vzipStorePracticeMedia; let fail = true; window.__recordRetryIds = []; window.vzipStorePracticeMedia = async item => { window.__recordRetryIds.push(item.id); if (fail) { fail = false; throw Error('테스트 저장 실패'); } return real(item); }; });
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
  expect(await page.evaluate(() => window.__recordRetryIds)).toEqual([items[0].id, items[0].id]);
  expect(items[0].durationSeconds).toBeGreaterThan(1.5);
  expect(items[0].review).toBe('브릿지 숨 부족');
  expect(items[0].waveform.length).toBeGreaterThan(0);
  // Recording alone does not create a practice session (no double-count).
  expect((await data(page)).practices).toHaveLength(1);
  await page.getByRole('link', {name:'On My Own 곡 보기'}).click();
  await expect(page.getByRole('tab', {name:'녹음'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-media]')).toHaveCount(1);
});

test('New recording after save gets a fresh ID and preserves both takes after reload', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'Real MediaRecorder with a fake microphone is Chromium-only; not an iPhone hardware test.');
  await boot(page, {media:false});
  const before = await data(page);
  await page.goto('/#/record?song=s2');
  const take = async name => {
    await page.getByRole('button', {name:'녹음 시작', exact:true}).click();
    await expect(page.getByRole('button', {name:'녹음 종료', exact:true})).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole('button', {name:'녹음 종료', exact:true}).click();
    await page.locator('[data-review] [name=name]').fill(name);
    await page.locator('[data-review] [data-save]').click();
    await expect(page.getByText('저장했어요', {exact:true})).toBeVisible();
  };
  const originals = () => page.evaluate(async () => {
    const rows = await window.vzipReadMedia();
    return Promise.all(rows.map(async row => {
      const blob = window.vzipMediaBlob(row);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
      return {id:row.id, name:row.name, songId:row.songId, durationSeconds:row.durationSeconds, size:blob.size, hash};
    })).then(rows => rows.sort((a, b) => a.id.localeCompare(b.id)));
  });
  await take('연속 녹음 첫 번째');
  const first = await originals();
  expect(first).toHaveLength(1);
  expect(first[0].size).toBeGreaterThan(0);
  await page.getByRole('button', {name:'새 녹음', exact:true}).click();
  await take('연속 녹음 두 번째');
  const all = await originals();
  expect(all).toHaveLength(2);
  expect(new Set(all.map(row => row.id)).size).toBe(2);
  expect(all.find(row => row.id === first[0].id)).toEqual(first[0]);
  expect(all.every(row => row.songId === 's2' && row.durationSeconds >= 0.8 && row.size > 0)).toBe(true);
  for (const key of ['songs','lessons','practices','assignments']) expect((await data(page))[key]).toEqual(before[key]);
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
  expect(await originals()).toEqual(all);
  await page.goto('/#/library');
  await expect(page.getByText('연속 녹음 첫 번째', {exact:true})).toBeVisible();
  await expect(page.getByText('연속 녹음 두 번째', {exact:true})).toBeVisible();
});

test('Lesson recording retry after a committed save keeps its ID; the next take gets a new ID', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'Real MediaRecorder with a fake microphone is Chromium-only; not an iPhone hardware test.');
  await boot(page, {media:false});
  await page.goto('/#/record?lesson=l-over&song=s1');
  await page.evaluate(() => {
    const store = window.vzipStorePracticeMedia;
    window.__recordSaveIds = [];
    window.vzipStorePracticeMedia = async item => {
      window.__recordSaveIds.push(item.id);
      await store(item);
      if (window.__recordSaveIds.length === 1) throw Error('저장 완료 응답 유실');
    };
  });
  const capture = async name => {
    await page.getByRole('button', {name:'녹음 시작', exact:true}).click();
    await expect(page.getByRole('button', {name:'녹음 종료', exact:true})).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole('button', {name:'녹음 종료', exact:true}).click();
    await page.locator('[data-review] [name=name]').fill(name);
  };
  await capture('레슨 첫 번째 녹음');
  await page.locator('[data-review] [data-save]').click();
  await expect(page.locator('[data-fail]')).toContainText('저장 완료 응답 유실');
  const first = await media(page);
  expect(first).toHaveLength(1);
  expect((await data(page)).lessons.find(l => l.id === 'l-over').recordings).toEqual([]);
  await page.getByRole('button', {name:'다시 저장', exact:true}).click();
  await expect(page.getByText('저장했어요', {exact:true})).toBeVisible();
  expect(await page.evaluate(() => window.__recordSaveIds)).toEqual([first[0].id, first[0].id]);
  expect(await media(page)).toHaveLength(1);
  await page.getByRole('button', {name:'새 녹음', exact:true}).click();
  await capture('레슨 두 번째 녹음');
  await page.locator('[data-review] [data-save]').click();
  await expect(page.getByText('저장했어요', {exact:true})).toBeVisible();
  const saved = await media(page), lesson = (await data(page)).lessons.find(l => l.id === 'l-over');
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map(row => row.id)).size).toBe(2);
  expect(lesson.recordings).toHaveLength(2);
  expect(new Set(lesson.recordings.map(row => row.id)).size).toBe(2);
  expect(lesson.recordings.map(row => row.id).sort()).toEqual(saved.map(row => row.id).sort());
  expect(saved.every(row => row.source === 'lesson' && row.songId === 's1')).toBe(true);
  await page.getByRole('link', {name:'레슨으로', exact:true}).click();
  await expect(page.locator('[data-recs] [data-media]')).toHaveCount(2);
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
  await openLibraryImport(page);
  await page.evaluate(() => { const real = window.vzipStorePracticeMedia; window.__calls = 0; window.vzipStorePracticeMedia = async item => { window.__calls++; if (item.songId === 's2' && !window.__failedOnce) { window.__failedOnce = true; throw Error('네트워크 오류'); } return real(item); }; });
  const buffer = longWav();
  await pickLibraryImportFiles(page,[
    {name:'a.wav', mimeType:'audio/wav', buffer}, {name:'b_talkv_dJMcaCaaATn_TFN3CMVq848GvO4AidPl6k_very_long_name_from_kakaotalk.m4a', mimeType:'', buffer}, {name:'notes.txt', mimeType:'text/plain', buffer:Buffer.from('x')}]);
  await expect(page.locator('.toast').last()).toContainText('음성·영상이 아닌 파일 1개는 뺐어요'); // left out, not listed
  await expect(sheet(page)).not.toContainText('notes.txt');
  await sheet(page).locator('[data-bulk]').selectOption('s2');
  await sheet(page).getByLabel('a.wav 곡').selectOption('s1');
  await sheet(page).getByLabel('b_talkv_dJMcaCaaATn_TFN3CMVq848GvO4AidPl6k_very_long_name_from_kakaotalk.m4a 날짜').fill('2026-01-15');
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).getByText('실패: 네트워크 오류')).toBeVisible();
  await expect(sheet(page).locator('[data-summary]')).toContainText('저장 1개');
  await sheet(page).getByRole('button', {name:'다시 시도'}).click();
  // Finished files leave the list; one line keeps the count.
  await expect(sheet(page).locator('[data-done]')).toContainText('✓ 저장 완료 2개');
  await expect(sheet(page).locator('.up-row:visible')).toHaveCount(0); // both saved; the .txt was never listed
  // Saved files are listed with a player right in the sheet.
  const saved = sheet(page).locator('[data-saved] [data-media]');
  await expect(saved).toHaveCount(2);
  await saved.first().locator('[data-toggle]').click();
  await expect(saved.first().locator('.time')).not.toHaveText(/^0:00 \//, {timeout:5000});
  // Nothing in the sheet is wider than the phone.
  expect(await sheet(page).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const items = (await media(page)).filter(m => m.source === 'import');
  expect(items).toHaveLength(2);
  // Files with a song are named "song + recording day".
  const a = items.find(m => m.songId === 's1'), b = items.find(m => m.songId === 's2');
  expect(a.name).toMatch(/^This Is the Moment \d{4}\.\d{2}\.\d{2}$/);
  expect(b.name).toBe('On My Own 2026.01.15');
  expect(b.songId).toBe('s2');
  // WAV content (whatever the extension) is stored as lossless FLAC when the encoder is available.
  expect(['audio/mp4', 'audio/flac']).toContain(b.type);
  expect(b).toMatchObject({recordedDate:'2026-01-15', dateSource:'manual'});
  expect(a.dateSource).not.toBe('manual');
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
  await page.getByRole('group', {name:'녹음 유형별 보기'}).getByRole('button', {name:'레슨 녹음', exact:true}).click();
  await expect(page.locator('[data-media]')).toHaveCount(1);
  await page.locator('[data-media] [data-toggle]').click();
  await expect(page.locator('.media-open .player')).toBeVisible();
  // 정보 수정 lives in the recording's 더보기 menu.
  await page.getByRole('button', {name:'레슨 시범 더보기'}).click();
  await page.getByRole('button', {name:/정보 수정/}).click();
  await sheet(page).getByRole('button', {name:'만족도 5'}).click();
  await sheet(page).locator('[name=review]').fill('선생님 시범 좋음');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect.poll(async () => (await media(page)).find(m => m.id === 'm1').rating).toBe(5);
  // 비교 now opens the 보컬 연구소 compare panel for the two recordings.
  await page.goto('/#/compare?a=m1&b=m2');
  await expect(page).toHaveURL(/#\/vocal-lab\/s1\?a=m1&b=m2&compare=1$/);
  const cmp = page.locator('[data-compare-panel]');
  await expect(cmp).toHaveAttribute('open', '');
  await expect(cmp.locator('[data-compare-a]')).toHaveValue('m1'); // 레슨 시범
  await expect(cmp.locator('[data-compare-b]')).toHaveValue('m2'); // 연습 녹음
  await cmp.locator('[data-compare-switch]').click();
  await cmp.locator('[name=notes]').fill('호흡이 길어졌다');
  // A background media refresh must not wipe what the user is typing.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'m1'}})));
  await page.waitForTimeout(700);
  await expect(cmp.locator('[name=notes]')).toHaveValue('호흡이 길어졌다');
  await cmp.locator('[data-compare-form] [type=submit]').click();
  await expect.poll(async () => (await data(page)).comparisonReports.length).toBe(1);
  const r = (await data(page)).comparisonReports[0];
  expect(r).toMatchObject({firstId:'m1', secondId:'m2', notes:'호흡이 길어졌다', songId:'s1'});
});

test('Calendar shows lessons, practice and recordings per day and adds lessons for the chosen date', async ({page}) => {
  await boot(page);
  await page.goto('/#/calendar');
  if (day(-1).slice(0, 7) !== day(0).slice(0, 7)) await page.getByRole('button', {name:'이전 달'}).click();
  await expect(async () => { await page.locator('[data-d="' + day(-1) + '"]').click(); await expect(page.locator('[data-d="' + day(-1) + '"]')).toHaveAttribute('aria-pressed', 'true', {timeout:1000}); }).toPass();
  await expect(page.locator('[data-day]')).toContainText('25분');
  // The practice shows its linked recording underneath; an unlinked recording appears as a practice recording.
  await expect(page.locator('[data-day] .cal-own').first().locator('[data-practice]')).toHaveCount(1);
  await expect(page.locator('[data-day] [data-media]')).toHaveCount(2);
  await page.locator('[data-day] .mini-row').first().click(); // a slim ▶ line opens the same player
  await expect(page.locator('[data-day] .media-open:not([hidden])')).toHaveCount(1);
  await page.locator('[data-day] .mini-row').first().click();
  await expect(page.locator('[data-day]')).toContainText('기록에 연결되지 않은 연습 녹음');
  if (day(-7).slice(0, 7) !== day(-1).slice(0, 7)) await page.getByRole('button', {name:'이전 달'}).click();
  await expect(async () => { await page.locator('[data-d="' + day(-7) + '"]').click(); await expect(page.locator('[data-d="' + day(-7) + '"]')).toHaveAttribute('aria-pressed', 'true', {timeout:1000}); }).toPass();
  await expect(page.locator('[data-day]')).toContainText('완료');
  await expect(page.locator('[data-day] .cal-own [data-media]')).toHaveCount(1); // the lesson's recording sits under the lesson
  await page.locator('[data-day] [data-add]').click();
  await sheet(page).getByRole('button', {name:'레슨 일정'}).click();
  await expect(sheet(page).locator('[name=date]')).toHaveValue(day(-7));
  await sheet(page).getByRole('button', {name:'돌아가기'}).click();
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
  await page.getByText('동기화·백업 도구').click();
  await expect(page.locator('#cloud-logout')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByText('기록 백업·복원').click();
  await page.getByRole('button', {name:'기록 내보내기'}).click();
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
  const fixture = path.resolve('tests/fixtures/dated-video-26s.mp4'); // imports leave out takes under 25 seconds
  test.skip(!fs.existsSync(fixture), 'Run node tests/make-audio-fixtures.cjs (needs ffmpeg).');
  test.setTimeout(90000);
  await boot(page, {media:false});
  await page.goto('/#/library');
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,fixture);
  await expect(sheet(page).getByText('영상 → 음성만 저장')).toBeVisible();
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).locator('[data-done]')).toContainText('✓ 저장 완료 1개', {timeout:60000});
  await expect(sheet(page).locator('[data-done]')).toContainText('(파일 속 날짜)');
  const [item] = await media(page);
  expect(item.type).toBe('audio/mp4');
  expect(item).toMatchObject({recordedDate:'2024-03-01', dateSource:'metadata', source:'import'});
  expect(item.audioExtraction.audioPacketCopyVerified).toBe(true);
});

test('Billing is only linked, and editing a legacy lesson never stamps a status on it', async ({page}) => {
  await boot(page, {media:false});
  // 레슨비 정산 is linked from the lesson list (the settings menu no longer lists it).
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
  // A 4s clip so a replay is still playing when checked (1s ended too fast in WebKit).
  const sr = 8000, n = sr * 4, wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i / 8) * 6000), 44 + i * 2);
  await page.route('**/cloud-audio.wav', r => r.fulfill({contentType:'audio/wav', body:wav}));
  await page.goto('/#/library');
  await page.evaluate(() => {
    window.vzipCloudSignedIn = () => true;
    window.vzipCloudMediaList = async () => [{id:'c1', name:'클라우드 음원', type:'audio/wav', path:'ui-test-user/c1.wav', created:Date.now(), songId:'', cloud:true}];
    window.vzipCloudMediaUrl = async () => { await new Promise(r => setTimeout(r, 300)); return '/cloud-audio.wav'; };
    window.dispatchEvent(new Event('vzip:auth-changed'));
    VZ.media.invalidate(); VZ.nav('#/library');
  });
  await expect(page.locator('[data-media="c1"]')).toBeVisible();
  for (const id of ['m2', 'c1']) {
    const row = page.locator('[data-media="' + id + '"]');
    await row.locator('[data-toggle]').click();
    await expect(page).toHaveURL(/#\/library$/);
    await expect(row.locator('.media-open')).toBeVisible();
    await expect(row.locator('.time')).not.toHaveText(/^0:00 \//, {timeout:5000});
    await expect(row.locator('[data-msg]')).toHaveText('');
  }
  // Pause, then one tap on the already-loaded source plays it again.
  const row = page.locator('[data-media="c1"]');
  await row.getByRole('button', {name:'일시정지'}).click();
  await expect(row.getByRole('button', {name:'재생', exact:true})).toBeVisible({timeout:5000});
  await row.getByRole('button', {name:'재생', exact:true}).click();
  await expect(row.getByRole('button', {name:'일시정지'})).toBeVisible();
  await expect(row.locator('[data-msg]')).toHaveText('');
});

test('Practice records can be edited, including unlinking files that no longer exist', async ({page}) => {
  await boot(page);
  await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.practices[0].mediaIds = ['m1', 'gone-1', 'gone-2']; d.practices[0].minutes = 19.95; d.practices[0].manualMinutes = 19.95; localStorage.setItem(k, JSON.stringify(d)); window.dispatchEvent(new Event('vzip:data-changed')); }, KEY);
  await page.goto('/#/song/s1');
  await page.getByRole('tab', {name:'활동 기록'}).click();
  await page.locator('[data-practice="p1"]').click();
  await expect(sheet(page)).toContainText('20분');
  await expect(sheet(page)).toContainText('찾을 수 없는 녹음 2개');
  await sheet(page).getByRole('button', {name:'연결 해제'}).click();
  await page.locator('.sheet').last().getByRole('button', {name:'연결 해제'}).click();
  let p = (await data(page)).practices[0];
  expect(p.mediaIds).toEqual(['m1']);
  // Edit time, rating and memo; unlink the remaining file from the edit sheet.
  await page.locator('[data-practice="p1"]').click();
  await page.locator('.sheet-foot').getByRole('button', {name:'수정'}).click();
  await sheet(page).locator('[name=minutes]').fill('45');
  await sheet(page).getByRole('button', {name:'만족도 5'}).click();
  await sheet(page).locator('[name=memo]').fill('고음 안정, 브릿지 호흡');
  await sheet(page).locator('label.item').filter({hasText:'레슨 시범'}).locator('input').uncheck();
  await page.getByRole('button', {name:'수정 저장'}).click();
  p = (await data(page)).practices[0];
  expect(p).toMatchObject({minutes:45, rating:5, memo:'고음 안정, 브릿지 호흡', mediaIds:[], completed:['a1'], assignmentNotes:{a1:'3회 반복'}});
  expect((await media(page)).some(m => m.id === 'm1')).toBe(true); // unlinking never deletes the file
});

test('Practice time excludes recording/import lengths while file metadata remains measured', async ({page}) => {
  await boot(page);
  await page.evaluate(async () => {
    const day = 864e5, read = async id => (await window.vzipReadMedia()).find(m => m.id === id);
    // m2: a 10-minute practice recording not linked to any record → duration metadata only.
    const m2 = await read('m2'); delete m2.bytes; await window.vzipStorePracticeMedia({...m2, blob:new Blob([window.__wav], {type:'audio/wav'}), durationSeconds:600}); // WebKit may have stored bytes
    // m3: an import saved before lengths were kept (no duration) → still measured, never added to actual time.
    await window.vzipStorePracticeMedia({id:'m3', name:'SODA_1', created:Date.now() - day, recordedDate:'', type:'audio/wav', source:'import', songId:'s2', blob:new Blob([window.__wav], {type:'audio/wav'})});
    window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'m3'}}));
  });
  await page.goto('/#/growth');
  await page.getByRole('button', {name:'전체'}).click();
  // Only the entered 25 minutes count; standalone files keep duration metadata separately.
  await expect(page.locator('.stat').filter({hasText:'전체 연습 시간'})).toContainText('25분');
  await expect(page.locator('[data-file-time]')).toHaveCount(0);
  await expect.poll(async () => Math.round((await page.evaluate(() => window.vzipReadMedia())).find(m => m.id === 'm3').durationSeconds)).toBe(1);
  await expect(page.locator('.bars')).toContainText('This Is the Moment');
  await expect(page.getByText('녹음 3개를 남겼어요. 녹음 길이는 연습 시간에 자동으로 더하지 않아요.')).toBeVisible();
  // Song list/detail use the same rule.
  await page.goto('/#/song/s1');
  await expect(page.locator('[data-summary]')).toContainText('연습 25분');
  // Linking m2 into a practice record does not change the entered time.
  await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.practices[0].mediaIds.push('m2'); localStorage.setItem(k, JSON.stringify(d)); window.dispatchEvent(new Event('vzip:data-changed')); }, KEY);
  await page.goto('/#/growth');
  await expect(page.locator('.stat').filter({hasText:'전체 연습 시간'})).toContainText('25분');
});

test('Changing a recording\'s song renames it to song + recording day, numbered on clashes', async ({page}) => {
  await boot(page);
  await page.evaluate(async()=>{
    for(const item of await window.vzipReadMedia())await VZ.media.update({...item,local:true},{nameMode:'auto',autoName:item.name},{quiet:true});
    VZ.media.invalidate();
  });
  await page.goto('/#/library');
  const open = async id => { await page.goto('/#/library'); await page.evaluate(async id => VZ.editMedia((await VZ.media.list(true)).find(m=>m.id===id)),id); };
  await open('m1');
  await sheet(page).locator('[name=date]').fill('2026-11-02');
  await sheet(page).locator('[name=song]').selectOption('s2');
  await expect(sheet(page).locator('[name=name]')).toHaveValue('On My Own 2026.11.02');
  // Changing the day follows while the name is still the automatic one.
  await sheet(page).locator('[name=date]').fill('2026-11-03');
  await sheet(page).locator('[name=date]').dispatchEvent('change');
  await expect(sheet(page).locator('[name=name]')).toHaveValue('On My Own 2026.11.03');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect.poll(async () => (await media(page)).find(m => m.id === 'm1').name).toBe('On My Own 2026.11.03');
  expect((await media(page)).find(m=>m.id==='m1').nameMode).toBe('auto');
  // Same song and day on another file gets a number.
  await page.locator('[data-media="m1"] [data-toggle]').click();
  await open('m2');
  await sheet(page).locator('[name=date]').fill('2026-11-03');
  await sheet(page).locator('[name=song]').selectOption('s2');
  await expect(sheet(page).locator('[name=name]')).toHaveValue('On My Own 2026.11.03 2');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect.poll(async()=>(await media(page)).find(m=>m.id==='m2').name).toBe('On My Own 2026.11.03 2');
  const second=(await media(page)).find(m=>m.id==='m2');
  expect(second.name).toBe('On My Own 2026.11.03 2');
  expect(second.review).toContain('이전 제목: 연습 녹음');
});

test('Import with song and date saves the generated title and appends the original filename to the memo', async ({page}) => {
  await boot(page, {media:false});
  const saved=await page.evaluate(async()=>{
    const file=new File([new Uint8Array(44)],'SODA_123.wav',{type:'audio/wav',lastModified:Date.now()});
    window.vzipPrepareMedia=async()=>({file,metadata:{created:Date.now(),durationSeconds:30},dispose:async()=>{}});
    await VZ.media.importFile(file,{id:'named-import',songId:'s2',song:'On My Own',date:'2026-11-09',extra:{review:'호흡 확인'},durationSeconds:30});
    return (await window.vzipReadMedia()).find(m=>m.id==='named-import');
  });
  expect(saved).toMatchObject({name:'On My Own 2026.11.09',songId:'s2',recordedDate:'2026-11-09',review:'호흡 확인\n이전 제목: SODA_123'});
});

test('Editing both song and date updates a saved title while retaining the old title in the memo', async ({page}) => {
  await boot(page);
  const saved=await page.evaluate(async()=>{
    const item=(await window.vzipReadMedia()).find(m=>m.id==='m1');
    await VZ.media.update({...item,local:true},{songId:'s2',song:'On My Own',recordedDate:'2026-11-09',dateSource:'manual',review:'호흡 확인',normalizeTitle:true});
    return (await window.vzipReadMedia()).find(m=>m.id==='m1');
  });
  expect(saved).toMatchObject({name:'On My Own 2026.11.09',songId:'s2',recordedDate:'2026-11-09',review:'호흡 확인\n이전 제목: 레슨 시범'});
});

test('Song pickers list the most recently registered song first', async ({page}) => {
  await boot(page);
  await page.goto('/#/songs');
  await page.locator('[data-add-song]').click();
  await sheet(page).locator('[name=title]').fill('Defying Gravity');
  await sheet(page).getByRole('button', {name:'곡 추가'}).click();
  expect((await data(page)).songs.at(-1).created).toBeGreaterThan(0);
  await page.goto('/#/library');
  await page.locator('[data-media="m1"] [data-toggle]').click();
  await page.getByRole('button', {name:'레슨 시범 더보기'}).click(); // 정보 수정 lives in the recording's 더보기 menu
  await page.getByRole('button', {name:/정보 수정/}).click();
  const options = await sheet(page).locator('[name=song] option').allTextContents();
  // Legacy songs have no created time: save order decides (s2 was added after s1).
  expect(options.slice(1, 4)).toEqual(['Defying Gravity', 'On My Own', 'This Is the Moment — 지킬 앤 하이드']);
  await sheet(page).getByRole('button', {name:'돌아가기'}).click();
  await page.goto('/#/library');
  expect((await page.locator('[data-song] option').allTextContents()).slice(2, 5)).toEqual(['Defying Gravity', 'On My Own', 'This Is the Moment']);
});

test('A list read that overlaps a login or file change is re-read, and a failed cloud read is retried', async ({page}) => {
  await boot(page);
  const reads = await page.evaluate(async () => {
    const real = window.vzipReadMedia; let calls = 0, release;
    const gate = new Promise(r => { release = r; });
    window.vzipReadMedia = async () => { calls++; if (calls === 1) await gate; return real(); };
    VZ.media.invalidate();
    const early = VZ.media.list();   // in flight…
    VZ.media.invalidate();           // …when a login/upload/edit happens
    release(); await early;
    await VZ.media.list();           // must read again, not reuse the overlapped result
    window.vzipReadMedia = real;
    return calls;
  });
  expect(reads).toBe(2);
  // A failed cloud read is shown as an error and retried next time instead of hiding cloud files.
  const retried = await page.evaluate(async () => {
    let calls = 0;
    window.vzipCloudSignedIn = () => true;
    window.vzipCloudMediaList = async () => { if (++calls === 1) throw Error('network'); return [{id:'cloud-b', name:'b', type:'audio/wav', path:'u/b.wav', created:Date.now(), cloud:true}]; };
    VZ.media.invalidate();
    const first = await VZ.media.list(), error = VZ.media.cloudError();
    const second = await VZ.media.list();
    return {first:first.some(m => m.id === 'cloud-b'), error, second:second.some(m => m.id === 'cloud-b')};
  });
  expect(retried).toMatchObject({first:false, second:true});
  expect(retried.error).toContain('클라우드 목록을 불러오지 못했어요');
});

test('Login merges device and cloud records instead of overwriting either side', async ({page}) => {
  const remote = {categories:[], songs:[{id:'s1', title:'This Is the Moment'}, {id:'cloud-song', title:'Cloud only song'}], lessons:[{id:'cloud-lesson', date:'2026-10-01', status:'done'}], assignments:[], practices:[]};
  const stub = `window.__upserts=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'t@e.x'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
    storage:{from:()=>({})},
    from:table=>{const c={};let single=false,updating=false;for(const m of ['select','eq','is','order','range','delete'])c[m]=()=>c;c.maybeSingle=()=>{single=true;return c};c.upsert=row=>{window.__upserts.push({table,row});return c};c.update=row=>{updating=true;window.__upserts.push({table,row});return c};c.then=r=>r({data:updating?[{user_id:'ui-test-user'}]:table==='vocal_data'&&single?{payload:${JSON.stringify(remote)},updated_at:'x'}:[],error:null});return c}})};`;
  page.on('pageerror', e => { throw e; });
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"})); // R2 is covered by r2.spec.cjs
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(legacy())]);
  await page.goto('/#/songs');
  await expect(page.getByText('Cloud only song')).toBeVisible({timeout:10000});
  const d = await data(page);
  expect(d.songs.map(s => s.id).sort()).toEqual(['cloud-song', 's1', 's2']);
  expect(d.lessons.map(l => l.id).sort()).toEqual(['cloud-lesson', 'l-over', 'l1']);
  const up = await page.evaluate(() => window.__upserts.filter(x => x.table === 'vocal_data').at(-1).row.payload);
  expect(up.songs.map(s => s.id).sort()).toEqual(['cloud-song', 's1', 's2']);
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('vzip_before_cloud_')))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('vzip_cloud_linked_user'))).toBe('ui-test-user');
});

test('Saving app records never drops a save another device made in between: the newer copy is merged again', async ({page}) => {
  const remote = {categories:[], songs:[{id:'s1', title:'This Is the Moment'}], lessons:[{id:'cloud-lesson', date:'2026-10-01', status:'done'}], assignments:[], practices:[]};
  const stub = `window.__server={payload:${JSON.stringify(remote)},updated_at:'2026-11-06T01:00:00.000Z'};window.__vd=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'t@e.x'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
    storage:{from:()=>({})},
    from:table=>{const c={q:{}};let single=false,upd=null;for(const m of ['select','order','range','delete','upsert'])c[m]=()=>c;c.eq=(k,v)=>{c.q[k]=v;return c};c.is=c.eq;c.maybeSingle=()=>{single=true;return c};c.update=row=>{upd=row;return c};
     c.then=r=>{if(table!=='vocal_data')return r({data:[],error:null});
      if(upd){if(window.__beforeWrite){const f=window.__beforeWrite;window.__beforeWrite=null;f()}
       if(c.q.updated_at!==window.__server.updated_at){window.__vd.push('conflict');return r({data:[],error:null})}
       window.__server={payload:upd.payload,updated_at:upd.updated_at};window.__vd.push('saved');return r({data:[{user_id:'ui-test-user'}],error:null})}
      return r({data:single?JSON.parse(JSON.stringify(window.__server)):[],error:null})};return c}})};
    window.__beforeWrite=()=>{const p=window.__server.payload;window.__server={payload:{...p,lessons:[...p.lessons,{id:'other-device-lesson',date:'2026-11-05',status:'done',updatedAt:Date.now()}]},updated_at:'2026-11-06T01:05:00.000Z'}};`;
  page.on('pageerror', e => { throw e; });
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, [KEY, legacy()]);
  await page.goto('/#/songs');
  await expect.poll(() => page.evaluate(() => window.__vd.includes('saved')), {timeout:10000}).toBe(true);
  expect(await page.evaluate(() => window.__vd.slice(0, 2))).toEqual(['conflict', 'saved']);
  const server = await page.evaluate(() => window.__server.payload);
  expect(server.lessons.map(l => l.id).sort()).toEqual(['cloud-lesson', 'l-over', 'l1', 'other-device-lesson']);
  await expect.poll(async () => (await data(page)).lessons.map(l => l.id).sort()).toEqual(['cloud-lesson', 'l-over', 'l1', 'other-device-lesson']);
});

test('Songs dropped by an old overwrite come back from snapshots and file names; deleted songs stay deleted', async ({page}) => {
  await boot(page);
  await page.evaluate(async k => {
    localStorage.setItem('vzip_before_cloud_1', JSON.stringify({songs:[{id:'old-1', title:'Every story is love story'}], lessons:[], practices:[], assignments:[], categories:[]}));
    await window.vzipStorePracticeMedia({id:'m9', name:'x', created:Date.now(), type:'audio/wav', source:'import', songId:'old-2', song:'Out here on my own — Fame', blob:new Blob([window.__wav], {type:'audio/wav'})});
    const d = JSON.parse(localStorage.getItem(k)); d.deleted = {songs:['old-3']}; localStorage.setItem(k, JSON.stringify(d));
    await window.vzipStorePracticeMedia({id:'m10', name:'y', created:Date.now(), type:'audio/wav', source:'import', songId:'old-3', song:'Deleted on purpose', blob:new Blob([window.__wav], {type:'audio/wav'})});
    window.dispatchEvent(new Event('vzip:data-changed'));
    VZ.media.invalidate();
    return VZ.recoverSongs(await VZ.media.list());
  }, KEY);
  const songs = (await data(page)).songs;
  expect(songs.find(s => s.id === 'old-1')).toMatchObject({title:'Every story is love story'});
  expect(songs.find(s => s.id === 'old-2')).toMatchObject({title:'Out here on my own', show:'Fame'});
  expect(songs.some(s => s.id === 'old-3')).toBe(false);
  // Deleting a song now leaves a tombstone so a sync or recovery never brings it back.
  await page.goto('/#/song/s2');
  await page.locator('[data-song-menu]').click();
  await page.getByRole('button', {name:'곡 삭제'}).click();
  await sheet(page).getByRole('button', {name:'삭제'}).click();
  expect((await data(page)).deleted.songs).toContain('s2');
});

test('Device-only files are backed up to the cloud automatically once signed in (additive, no duplicates)', async ({page}) => {
  await boot(page);
  await page.evaluate(async () => {
    const stored = new Map();
    window.__imports = []; window.__updates = [];
    window.vzipCloudImport = async (file, info) => { window.__imports.push({id:info.id, name:file.name, type:file.type, size:file.size, source:info.source, recordedDate:info.recordedDate}); const meta = {...info, path:'u/' + info.id, size:file.size}; stored.set(info.id, meta); return meta; };
    window.vzipCloudMediaUpdate = async (item, changes) => { window.__updates.push({id:item.id, ...changes}); stored.set(item.id, {...stored.get(item.id), ...changes}); };
    window.vzipCloudMediaList = async () => [...stored.values()].map(m => ({...m, cloud:true}));
    const m1 = (await window.vzipReadMedia()).find(m => m.id === 'm1'); delete m1.bytes;
    await window.vzipStorePracticeMedia({...m1, blob:new Blob([window.__wav], {type:'audio/wav'}), rating:4, review:'고음 괜찮음'});
    window.vzipCloudSignedIn = () => true;
  });
  await page.goto('/#/library');
  await expect(page.locator('[data-backup]')).toContainText('모두 클라우드에 백업됨', {timeout:15000});
  const first = await page.evaluate(() => ({imports:window.__imports, updates:window.__updates}));
  expect(first.imports.map(x => x.id).sort()).toEqual(['m1', 'm2']);
  expect(first.imports.every(x => x.type === 'audio/wav' && x.size > 0 && x.name.endsWith('.wav'))).toBe(true);
  expect(first.updates.find(x => x.id === 'm1')).toMatchObject({rating:4, review:'고음 괜찮음'});
  // Device copies stay; running again uploads nothing new.
  await page.evaluate(() => VZ.media.backupLocal());
  expect(await page.evaluate(() => window.__imports.length)).toBe(2);
  expect((await media(page)).map(m => m.id).sort()).toEqual(['m1', 'm2']);
});

test('A file imported while the device backup is running goes up next, before the older device files', async ({page}) => {
  await boot(page);
  await page.evaluate(async () => {
    const stored = new Map();
    window.__imports = []; window.__gate = [];
    // Each upload waits until the test lets it finish, so the order the backup picks is visible.
    window.vzipCloudImport = async (file, info) => { window.__imports.push(info.id); await new Promise(r => window.__gate.push(r)); const meta = {...info, path:'u/' + info.id, size:file.size}; stored.set(info.id, meta); return meta; };
    window.vzipCloudMediaUpdate = async () => {};
    window.vzipCloudMediaList = async () => [...stored.values()].map(m => ({...m, cloud:true}));
    for (let i = 1; i <= 4; i++) await window.vzipStorePracticeMedia({id:'old' + i, name:'예전 녹음 ' + i, created:Date.now() - i * 60000, type:'audio/wav', source:'practice', blob:new Blob([window.__wav], {type:'audio/wav'})});
    window.vzipCloudSignedIn = () => true;
    window.__run = VZ.media.backupLocal();
  });
  await expect.poll(() => page.evaluate(() => window.__imports.length)).toBe(1); // one older file is uploading
  const firstUp = await page.evaluate(() => window.__imports[0]);
  // Imported now (signed in, small file): kept on the device first, then uploaded by the backup — ahead of the rest.
  const imported = await page.evaluate(async () => (await VZ.media.importFile(new File([window.__wav], '새 가져오기.wav', {type:'audio/wav', lastModified:Date.now()}), {id:'imported-now', songId:'', song:''})).id);
  expect(imported).toBe('imported-now');
  const release = () => page.evaluate(() => { const r = window.__gate.shift(); r?.(); return !!r; });
  await release(); // the file already uploading is finished, never cut off
  await expect.poll(() => page.evaluate(() => window.__imports.length)).toBe(2);
  expect(await page.evaluate(() => window.__imports[1])).toBe('imported-now');
  // Let the rest finish one by one.
  await page.evaluate(async () => { let done = false; window.__run.then(() => { done = true; }); while (!done) { window.__gate.shift()?.(); await new Promise(r => setTimeout(r, 20)); } });
  const order = await page.evaluate(() => window.__imports);
  expect(order[0]).toBe(firstUp);
  expect(order[1]).toBe('imported-now');
  // Every device file once (the fixture's own m1/m2 included), nothing skipped or sent twice.
  expect(new Set(order).size).toBe(order.length);
  for (const id of ['imported-now', 'old1', 'old2', 'old3', 'old4']) expect(order).toContain(id);
  expect(await page.evaluate(() => VZ.media.backupStatus())).toMatchObject({running:false, done:order.length, failed:0, total:order.length});
});

test('Library lists recordings by their recording day, newest first', async ({page}) => {
  await boot(page);
  await page.evaluate(async () => {
    // Saved just now, but recorded long ago: must sort by its recording day, not its save time.
    await window.vzipStorePracticeMedia({id:'old', name:'예전 녹음', created:Date.now(), recordedDate:'2025-01-05', dateSource:'metadata', type:'audio/wav', source:'import', blob:new Blob([window.__wav], {type:'audio/wav'})});
    window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'old'}}));
  });
  await page.goto('/#/library');
  await expect(page.locator('[data-media]')).toHaveCount(3);
  expect(await page.locator('[data-media]').evaluateAll(rows => rows.map(r => r.dataset.media))).toEqual(['m2', 'm1', 'old']);
});


test('Growth month filters, file-count units and every-week horizontal chart remain readable', async ({page}) => {
  const now = new Date(), month = offset => { const d = new Date(now.getFullYear(), now.getMonth() + offset, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0'); };
  const previous = month(-1), current = month(0), old = month(-6), pd = previous + '-10';
  const seed = {categories:[], lessons:[], comparisonReports:[], songs:[{id:'s1',title:'아주 긴 곡 이름 '.repeat(20)},{id:'s2',title:'두 번째 곡'}],
    assignments:[{id:'done',title:'완료 숙제',status:'done',doneAt:new Date(pd+'T12:00:00').getTime()}],
    practices:[{id:'prev',date:pd,minutes:30,mediaIds:['gm1'],songId:'s1',rating:4},{id:'current',date:current+'-01',minutes:20,songId:'s2',rating:2},{id:'old',date:old+'-01',minutes:10,songId:'s1'}]};
  await boot(page,{seed,media:false});
  await page.evaluate(async ({pd,current}) => {
    for (const [id,songId,recordedDate,durationSeconds] of [['gm1','s1',pd,600],['gm2','s1',pd,120],['gm3','s2',pd,300],['gm4','s2',current+'-01',60]]) {
      await window.vzipStorePracticeMedia({id,name:id,songId,recordedDate,created:new Date(recordedDate+'T12:00:00').getTime(),durationSeconds,type:'audio/wav',source:'import',blob:new Blob(['test'],{type:'audio/wav'})});
    }
    window.VZ.media.invalidate();
    await window.VZ.media.list();
  },{pd,current});
  await page.goto('/#/growth');
  await page.getByRole('button',{name:'월별',exact:true}).click();
  await page.getByRole('combobox',{name:'조회 월'}).selectOption(previous);
  await expect(page.locator('.stat').filter({hasText:'연습 시간'}).first()).toContainText('30분');
  await expect(page.locator('.stat').filter({hasText:'평균 만족도'})).toContainText('4.0');
  await expect(page.locator('[data-song-stat="s1"]')).toContainText('30분');
  await page.getByRole('button',{name:'횟수(파일 수)',exact:true}).click();
  await expect(page.locator('[data-song-stat="s1"]')).toContainText('2회');
  await expect(page.locator('[data-song-stat="s2"]')).toContainText('1회');
  await page.getByRole('button',{name:'다음 달 통계',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'조회 월'})).toHaveValue(current);
  await expect(page.locator('[data-song-stat="s1"]')).toHaveCount(0);
  await expect(page.locator('[data-song-stat="s2"]')).toContainText('1회');
  await expect(page.getByRole('button',{name:'다음 달 통계',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'전체',exact:true}).click();
  await expect(page.locator('[data-song-stat="s1"]')).toContainText('2회'); // practice records aren't file counts
  await expect(page.locator('[data-growth-chart]>div')).not.toHaveCount(8);
  const chart = await page.locator('[data-chart-scroll]').evaluate(el => ({count:el.firstElementChild.children.length,scroll:el.scrollLeft,width:el.clientWidth,total:el.scrollWidth,bottoms:[...el.firstElementChild.children].map(x=>Math.round(x.getBoundingClientRect().bottom))}));
  expect(chart.count).toBeGreaterThan(20);
  expect(chart.total).toBeGreaterThan(chart.width);
  expect(chart.scroll).toBeGreaterThan(0);
  expect(Math.max(...chart.bottoms)-Math.min(...chart.bottoms)).toBeLessThanOrEqual(1);
  await page.getByRole('button',{name:'이전 주 보기',exact:true}).click();
  await expect.poll(()=>page.locator('[data-chart-scroll]').evaluate(el=>el.scrollLeft)).toBeLessThan(chart.scroll);
  for (const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.getByRole('button',{name:'분',exact:true}).click();
  await expect(page.locator('[data-song-stat="s1"]')).toContainText('40분');
  await page.getByRole('button',{name:'월별',exact:true}).click();
  await page.getByRole('button',{name:'이전 달 통계',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'조회 월'})).toHaveValue(previous);
  expect((await data(page)).practices).toEqual(seed.practices);
});

test('Large song library uses compact selects for lesson multi-selection and recorder selection', async ({page})=>{
  const seed=legacy();seed.songs.push(...Array.from({length:200},(_,i)=>({id:'extra'+i,title:'추가 곡 '+i+' 긴 이름'.repeat(5)})));
  await boot(page,{seed,media:false});
  await page.locator('.quick [data-add-lesson]').click();
  const s=sheet(page),select=s.getByRole('combobox',{name:'레슨 곡 추가'});
  await expect(select.locator('option')).toHaveCount(204); // 202 songs + prompt + new
  await expect(s.locator('[data-remove-song]')).toHaveCount(0);
  await select.selectOption('s1');await select.selectOption('extra199');
  await expect(s.locator('[data-remove-song]')).toHaveCount(2);
  await expect(select.locator('option[value=s1]')).toHaveCount(0);
  await s.getByRole('button',{name:'This Is the Moment 선택 해제',exact:true}).click();
  await expect(s.locator('[data-remove-song]')).toHaveCount(1);
  await select.selectOption('s1');
  await s.locator('[name=start]').fill('19:00');
  await s.getByRole('button',{name:'일정 추가',exact:true}).click();
  const lesson=(await data(page)).lessons.find(l=>l.songIds?.includes('extra199'));
  expect(lesson.songIds).toEqual(['extra199','s1']);
  await page.locator('[data-edit-lesson]').click();
  await expect(sheet(page).locator('[data-remove-song]')).toHaveCount(2);
  await sheet(page).getByRole('button',{name:'돌아가기',exact:true}).click();
  await page.goto('/#/record');
  await page.locator('[data-pick-song]').click();
  await expect(sheet(page).locator('select[name=song]')).toBeVisible();
  await sheet(page).locator('select[name=song]').selectOption('extra199');
  await sheet(page).getByRole('button',{name:'선택 완료',exact:true}).click();
  await expect(page.locator('[data-song-name]')).toContainText('추가 곡 199');
});

test('Import hub filters by date and length, flags duplicates and missing dates, and makes one practice per confirmed file', async ({page}) => {
  test.setTimeout(120000);
  const wav = (sec, tone = 8) => { const sr = 4000, n = Math.round(sr * sec), b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / tone) * 6000), 44 + i * 2); return b; };
  const seed = legacy(); seed.songs.push({id:'s3', title:'One Day More', show:'레미제라블', aliases:['원데이모어']});
  await boot(page, {seed, media:false});
  // 기존 자료 가져오기 opens from the home quick row's 가져오기 (no longer from settings). boot() leaves us on #/home;
  // goto() to the same URL would reload in WebKit and drop boot's signed-out-device setup.
  await expect(page).toHaveURL(/#\/home$/);
  await page.locator('[data-import]').click();
  await expect(page.locator('#top h1')).toHaveText('기존 자료 가져오기');
  await page.getByRole('button', {name:/음성 메모/}).click();
  // Voice memo defaults: 2025-07-24 → today, 0:25 – 8:00 (both ends included).
  await expect(page.locator('[data-c="start"]')).toHaveValue('2025-07-24');
  await expect(page.locator('[data-c="min"]')).toHaveValue('0:25');
  await expect(page.locator('[data-c="max"]')).toHaveValue('8:00');
  const first = wav(30);
  await page.locator('[data-files]').setInputFiles([
    {name:'This Is the Moment 2026-03-05.wav', mimeType:'audio/wav', buffer:first},          // exactly 0:30, date in name, song by title
    {name:'복사본 2026-03-05.wav', mimeType:'audio/wav', buffer:first},                        // same bytes → duplicate
    {name:'원데이모어 20260401.wav', mimeType:'audio/wav', buffer:wav(480, 9)},                 // exactly 8:00, song by alias
    {name:'the moment take.wav', mimeType:'audio/wav', buffer:wav(40, 10)},                  // no date → needs-date, weak suggestion
    {name:'너무 짧음 2026-02-01.wav', mimeType:'audio/wav', buffer:wav(24, 11)},              // 0:24 → out
    {name:'긴 녹음 2026-02-02.wav', mimeType:'audio/wav', buffer:wav(481, 12)},               // 8:01 → out
    {name:'옛날 2025-01-01.wav', mimeType:'audio/wav', buffer:wav(35, 13)},                   // before start → out
  ]);
  await expect(page.getByRole('button', {name:/^조건 충족 2/})).toBeVisible({timeout:60000});
  await expect(page.getByRole('button', {name:/^중복 의심 1/})).toBeVisible();
  await expect(page.getByRole('button', {name:/^날짜 확인 필요 1/})).toBeVisible();
  await expect(page.getByRole('button', {name:/^조건 밖 3/})).toBeVisible();
  const row = name => page.locator('.hub-row').filter({has:page.locator('.hub-name', {hasText:name})});
  await expect(row('너무 짧음')).toContainText('25초 미만 · 가져오지 않음');
  await expect(row('너무 짧음').locator('[data-sel]')).toBeDisabled();
  await expect(row('긴 녹음')).toContainText('길이 8:01');
  await expect(row('옛날')).toContainText('기간 밖');
  await expect(row('복사본')).toContainText('선택한 파일끼리 같아요');
  // Strong matches (title / alias) are prefilled; a weak one waits for approval.
  await expect(row('This Is the Moment').locator('[data-song]')).toHaveValue('s1');
  await expect(row('원데이모어').locator('[data-song]')).toHaveValue('s3');
  await expect(row('the moment take').locator('[data-song]')).toHaveValue('');
  await row('the moment take').getByRole('button', {name:/추천: This Is the Moment 승인/}).click();
  await expect(row('the moment take').locator('[data-song]')).toHaveValue('s1');
  // Only confirmed files are selected; an undated file must get a date first.
  await expect(page.getByRole('button', {name:'선택한 2개 가져오기'})).toBeVisible();
  await row('the moment take').locator('[data-sel]').check();
  await page.getByRole('button', {name:'선택한 3개 가져오기'}).click();
  await expect(page.locator('.toast').last()).toContainText('날짜를 확인하지 않은 파일 1개');
  await row('the moment take').locator('[data-date]').fill('2026-05-10');
  // Setting the date re-checks the row; it now meets the conditions and leaves the "needs date" filter.
  await expect(page.getByRole('button', {name:/^날짜 확인 필요/})).toHaveCount(0);
  await page.locator('[data-f="all"]').click();
  // A file marked 공연 is imported but makes no practice record.
  await row('원데이모어').locator('[data-occ-row]').selectOption('performance');
  await page.getByRole('button', {name:'선택한 3개 가져오기'}).click();
  // Checked on the whole hub so a failure shows each file's reason (failed rows are listed under the result card).
  await expect(page.locator('[data-hub]')).toContainText('저장 3개', {timeout:60000});
  await expect(page.locator('[data-result]')).toContainText('연습 기록 2개 생성');
  const items = (await media(page)).filter(m => m.source === 'import');
  expect(items).toHaveLength(3);
  const take = items.find(m => m.originalFilename === 'the moment take.wav');
  expect(take).toMatchObject({sourceType:'voice-memo', recordedDate:'2026-05-10', recordedAtSource:'user', songId:'s1'});
  expect(take.fileHash).toMatch(/^[0-9a-f]{32}$/);
  expect(items.find(m => m.originalFilename === '원데이모어 20260401.wav')).toMatchObject({recordedDate:'2026-04-01', recordedAtSource:'filename', songId:'s3'});
  const made = (await data(page)).practices.filter(p => p.importedFrom === 'voice-memo');
  expect(made).toHaveLength(2);
  for(const record of made){expect(record).toMatchObject({minutes:0,manualMinutes:0,practiceTimeSource:'unconfirmed'});expect(record.mediaSeconds).toBeGreaterThan(0);}
  const chosen=made.find(p=>p.mediaIds[0]===take.id);
  await page.evaluate(id=>VZ.practiceSheet({practice:VZ.db.practices.find(p=>p.id===id)}),chosen.id);
  await expect(sheet(page).locator('[name=minutes]')).toHaveValue('0');
  await sheet(page).locator('[name=minutes]').fill('12');
  await sheet(page).getByRole('button',{name:'수정 저장',exact:true}).click();
  expect((await data(page)).practices.find(p=>p.id===chosen.id)).toMatchObject({minutes:12,manualMinutes:12,practiceTimeSource:'manual',mediaSeconds:chosen.mediaSeconds});

  expect(items.find(m => m.originalFilename === '원데이모어 20260401.wav').occasion).toBe('performance');
  expect(made.find(p => p.mediaIds[0] === take.id)).toMatchObject({date:'2026-05-10', songId:'s1', confirmedSongId:'s1', suggestedSongId:'s1'});
  // Picking the same files again finds them in the library and makes no second practice record.
  await page.getByRole('button', {name:'다른 자료 가져오기'}).click();
  await page.getByRole('button', {name:/음성 메모/}).click();
  await page.locator('[data-files]').setInputFiles([{name:'This Is the Moment 2026-03-05.wav', mimeType:'audio/wav', buffer:first}]);
  await expect(row('This Is the Moment')).toContainText('전체 녹음에 이미 있어요', {timeout:30000});
  await expect(page.getByRole('button', {name:'선택한 0개 가져오기'})).toBeDisabled();
  expect((await data(page)).practices.filter(p => p.importedFrom === 'voice-memo')).toHaveLength(2);
});

test('Import waits while another upload holds the slot instead of failing after 3 tries', async ({page}) => {
  test.setTimeout(90000);
  await boot(page, {media:false});
  await page.evaluate(() => {
    window.vzipCloudSignedIn=()=>true;window.vzipCloudUserId=()=>'ui-test-user';
    window.__busy={left:5,sent:[]};
    VZ.media.list=async()=>[];
    window.vzipInspectMedia=async()=>({readable:true,duration:40,hasVideo:false,hasAudio:true,metadata:{recordedDate:'2026-11-09',dateSource:'metadata'}});
    VZ.media.importFile=async(file,choice)=>{
      if(file.name==='a.m4a'&&window.__busy.left>0){window.__busy.left--;throw Error('다른 파일을 업로드하고 있어요. 완료하거나 취소한 뒤 다시 선택해 주세요.');}
      window.__busy.sent.push(file.name);return {id:choice.id,cloud:true,size:file.size,durationSeconds:40,recordedDate:'2026-11-09'};
    };
    VZ.openImportHub({files:[new File([new Uint8Array([1,2])],'a.m4a',{type:'audio/mp4'}),new File([new Uint8Array([3,4])],'b.m4a',{type:'audio/mp4'})]});
  });
  await expect(page.getByText('다른 업로드가 끝나길 기다리는 중', {exact:false}).first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__busy.sent),{timeout:60000}).toEqual(['a.m4a','b.m4a']);
  await expect(page.getByText(/실패:/)).toHaveCount(0);
});

test('A file that waited for the upload slot is not sent again when another tab uploaded it meanwhile', async ({page}) => {
  test.setTimeout(90000);
  await boot(page, {media:false});
  await page.evaluate(() => {
    window.vzipCloudSignedIn=()=>true;window.vzipCloudUserId=()=>'ui-test-user';
    window.__dupe={left:2,sent:[],server:[]};
    VZ.media.list=async()=>window.__dupe.server.slice();
    window.vzipInspectMedia=async()=>({readable:true,duration:40,hasVideo:false,hasAudio:true,metadata:{recordedDate:'2026-11-09',dateSource:'metadata'}});
    VZ.media.importFile=async(file,choice)=>{
      if(file.name==='a.m4a'&&window.__dupe.left>0){
        window.__dupe.left--;
        // the other tab finishes the same file while this one waits
        if(!window.__dupe.left)window.__dupe.server.push({id:'other-tab',name:'a',originalFilename:'a.m4a',size:file.size,fileHash:choice.extra.fileHash});
        throw Error('다른 파일을 업로드하고 있어요. 완료하거나 취소한 뒤 다시 선택해 주세요.');
      }
      window.__dupe.sent.push(file.name);return {id:choice.id,cloud:true,size:file.size,durationSeconds:40,recordedDate:'2026-11-09'};
    };
    VZ.openImportHub({files:[new File([new Uint8Array([1,2])],'a.m4a',{type:'audio/mp4'}),new File([new Uint8Array([3,4])],'b.m4a',{type:'audio/mp4'})]});
  });
  await expect.poll(()=>page.evaluate(()=>window.__dupe.sent),{timeout:60000}).toEqual(['b.m4a']);
  await expect(page.getByText(/실패:/)).toHaveCount(0);
});

test('Library import skips 24 seconds and includes 25 seconds', async ({page}) => {
  await boot(page, {media:false});
  await page.evaluate(() => {
    window.vzipCloudSignedIn=()=>true;
    window.__importedNames=[];
    VZ.media.list=async()=>[];
    window.vzipInspectMedia=async file=>({readable:true,duration:file.name.startsWith('short')?24:25,metadata:{recordedDate:'2026-11-09',dateSource:'metadata'}});
    VZ.media.importFile=async(file,choice)=>{window.__importedNames.push(file.name);return {id:choice.id,name:file.name,cloud:true,durationSeconds:25,recordedDate:'2026-11-09'};};
    VZ.openImportHub({files:[new File(['short'],'short.wav',{type:'audio/wav'}),new File(['long'],'long.wav',{type:'audio/wav'})],review:true});
  });
  const short=page.locator('.hub-row').filter({hasText:'short.wav'});
  await expect(short.locator('[data-sel]')).toBeDisabled();
  await page.locator('[data-all]').click();
  await expect(page.getByRole('button',{name:'선택한 1개 가져오기'})).toBeVisible();
  await page.getByRole('button',{name:'선택한 1개 가져오기'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__importedNames)).toEqual(['long.wav']);
});

test('Song sheet keeps aliases used for import suggestions', async ({page}) => {
  await boot(page, {media:false});
  await page.evaluate(() => VZ.songSheet(VZ.song('s2')));
  await sheet(page).getByLabel('별칭 (쉼표로 구분)').fill('온마이오운, On my own , 온마이오운');
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect.poll(async () => (await data(page)).songs.find(s => s.id === 's2').aliases).toEqual(['온마이오운', 'On my own']);
  expect(await page.evaluate(() => VZ.suggestSongs('온마이오운_0412.m4a')[0])).toMatchObject({id:'s2'});
});

test('Library groups files by recording month with counts, and filters fit on a phone', async ({page}) => {
  await boot(page);
  await page.evaluate(async () => {
    await window.vzipStorePracticeMedia({id:'old', name:'예전 녹음', created:Date.now(), recordedDate:'2025-01-05', dateSource:'metadata', type:'audio/wav', source:'import', songId:'s1', blob:new Blob([window.__wav], {type:'audio/wav'}), durationSeconds:125});
    VZ.media.invalidate();
  });
  await page.goto('/#/library');
  await expect(page.locator('.lib-month')).toHaveCount(await page.evaluate(() => new Set([0, 1].map(n => { const d = new Date(Date.now() - (n ? 7 : 1) * 864e5); return d.getFullYear() * 100 + d.getMonth(); })).size + 1));
  await expect(page.locator('.lib-month').last()).toContainText('2025년 1월');
  await expect(page.locator('.lib-month').last()).toContainText('1개 · 2분');
  await expect(page.locator('[data-count]')).toContainText('3개');
  // The recording-kind segment stays separate from the format and song filter sheet.
  await page.getByRole('group', {name:'녹음 유형별 보기'}).getByRole('button', {name:'레슨 녹음', exact:true}).click();
  await expect(page.locator('[data-media]')).toHaveCount(1);
  await expect(page.locator('[data-count]')).toContainText('/ 전체 3개');
  await page.getByRole('button', {name:'전체', exact:true}).click();
  await page.locator('[data-library-filter]').click();
  await page.locator('[data-filter-month]').click();
  await page.locator('[data-choice=this]').click();
  await expect(page.locator('[data-media]')).toHaveCount(2);
  await page.locator('[data-select-mode]').click();
  await page.locator('[data-lib-select-all]').click();
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('2개 선택');
  await page.locator('[data-lib-select-all]').click();
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('0개 선택');
  await page.locator('[data-lib-select-cancel]').click();
  await page.locator('[data-library-filter]').click();
  await page.locator('[data-filter-reset]').click();
  await page.locator('[data-library-filter]').click();
  await page.locator('[data-filter-kind]').click();
  await page.locator('[data-choice=video]').click();
  await expect(page.getByText('조건에 맞는 파일이 없어요.')).toBeVisible();
  await page.getByRole('button', {name:'필터 초기화'}).click();
  await expect(page.locator('[data-media]')).toHaveCount(3);
  for (const width of [320, 390]) {
    await page.setViewportSize({width, height:844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('Growth leads with this period\'s time compared with the same days before, and song rows open the song', async ({page}) => {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const songs = Array.from({length:10}, (_, i) => ({id:'g' + i, title:'곡 ' + i}));
  const practices = [{id:'now', date:d(0), minutes:50, songId:'g0', rating:4}, {id:'lastweek', date:d(-7), minutes:20, songId:'g1', rating:2},
    ...songs.slice(1).map((s, i) => ({id:'p' + i, date:d(0), minutes:i + 1, songId:s.id}))];
  await boot(page, {seed:{categories:[], songs, lessons:[], assignments:[], practices, comparisonReports:[]}, media:false});
  await page.goto('/#/growth');
  await page.getByRole('button', {name:'최근 28일', exact:true}).click();
  const hero = page.locator('.stat-hero');
  await expect(hero).toContainText('최근 28일 연습 시간');
  await expect(hero).toContainText('1시간 55분'); // 50 + 20 + (1..9 = 45)
  await expect(hero.locator('.growth-delta')).toContainText('이전 28일 0분 · +1시간 55분');
  await page.getByRole('button', {name:'이번 주', exact:true}).click();
  await expect(hero.locator('.growth-delta')).toContainText('지난주 같은 요일까지');
  // Top 8 songs first; the rest behind a button. Rows link to the song.
  await expect(page.locator('.bars .bar:visible')).toHaveCount(8);
  await page.getByRole('button', {name:/나머지 \d+곡 더 보기/}).click();
  await expect(page.locator('.bars .bar:visible')).toHaveCount(await page.locator('.bars .bar').count());
  await page.locator('[data-song-stat="g0"]').click();
  await expect(page).toHaveURL(/#\/song\/g0$/);
});

test('Song detail shows real growth, recording selection and analysis handoff', async ({page}) => {
  await boot(page);
  await page.goto('/#/song/s1');
  // The growth charts moved to 보컬 연구소; the song header keeps the real totals (entered minutes, records, recordings).
  await expect(page.locator('[data-summary]')).toHaveText('연습 25분 · 기록 1회 · 녹음 2개 · 레슨 1회');
  await expect(page.getByRole('tab', {name:'녹음'})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('tab', {name:'레슨'})).toHaveCount(0);
  await expect(page.locator('.vz-song-media-list [data-media]')).toHaveCount(2);
  const all = page.getByRole('checkbox', {name:'녹음 전체선택'});
  await all.check();
  await expect(page.locator('[data-selected-count]')).toHaveText('선택 2개');
  const firstRow=page.locator('.vz-song-media-list [data-media]').first();
  const checkbox=firstRow.locator('.vz-media-select');
  const rowButton=firstRow.locator('[data-toggle]');
  await expect(rowButton).toHaveCSS('background-color','rgb(255, 255, 255)');
  await rowButton.click();
  await expect(rowButton).toHaveAttribute('aria-expanded','true');
  await expect(firstRow.locator('.media-open')).toBeVisible();
  await expect(checkbox).toHaveAttribute('aria-pressed','true');
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-pressed','false');
  await expect(all).not.toBeChecked();
  await expect(page.locator('[data-selected-count]')).toHaveText('선택 1개');
  await expect(rowButton).toHaveAttribute('aria-expanded','true');
  await expect(rowButton).toHaveCSS('background-color','rgb(255, 255, 255)');
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-pressed','true');
  await expect(rowButton).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('button', {name:'보컬 분석하기'})).toBeEnabled();
  await page.getByRole('button', {name:'보컬 분석하기'}).click();
  await expect(page).toHaveURL(/#\/vocal-lab\/s1\?selection=1$/);
  await expect(page.locator('.vl-dates button[aria-pressed="true"]')).toHaveCount(2);
  await expect(page.locator('.vl-player-head')).toContainText('2 / 2');
  expect((await page.evaluate(() => JSON.parse(sessionStorage.getItem('vocalzip-vocal-lab-selected-media-v1')))).sort()).toEqual(['m1','m2']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('Library bulk menu omits analysis when selected recordings span songs', async ({page}) => {
  await boot(page);
  await page.evaluate(async () => {
    await window.vzipStorePracticeMedia({id:'m3',name:'다른 곡 녹음',created:Date.now(),type:'audio/wav',source:'practice',songId:'s2',blob:new Blob([window.__wav],{type:'audio/wav'}),durationSeconds:1});
    VZ.media.invalidate();
  });
  await page.goto('/#/library');
  await expect(page.locator('[data-media]')).toHaveCount(3);
  await page.locator('[data-select-mode]').click();
  await page.locator('[data-lib-select-all]').click();
  await expect(page.locator('[data-lib-selected-count]')).toHaveText('3개 선택');
  await page.locator('[data-lib-bulk-more]').click();
  await expect(page.getByRole('dialog', {name:'선택한 녹음 3개'}).getByRole('button', {name:'보컬 분석'})).toHaveCount(0);
});

test('Settings shows one 파일 상태 line from this device and opens 처리 내역 from it', async ({page}) => {
  await boot(page, {seed:legacy()});
  await page.goto('/#/settings');
  const link = page.locator('[data-file-status-link]'), line = page.locator('[data-file-status]');
  await expect(link).toBeVisible();
  await expect(line).not.toHaveText('확인 중…');
  await expect(link).not.toHaveAttribute('data-state', 'error');
  // A failed import in this device's journal (fixture row only) turns the line into a call to check it.
  await page.evaluate(() => window.VZ.processingLog.record('fixture-failed', {state:'failed', originalName:'fixture.m4a', error:'fixture failure'}));
  await page.goto('/#/home'); await page.goto('/#/settings');
  await expect(line).toContainText('실패 1개 확인 필요');
  await expect(link).toHaveAttribute('data-state', 'error');
  await link.click();
  await expect(page).toHaveURL(/#\/processing-log$/);
  await expect(page.locator('[data-processing-log]')).toContainText('fixture.m4a');
});

test('Settings puts the account first, keeps manual cloud tools folded, and groups the menu', async ({page}) => {
  const seed = legacy();
  seed.performances = [{id:'show1',ownerId:'ui-test-user',title:'첫 무대',start:'2025-07-24',status:'completed',sessions:[]}];
  await boot(page, {seed});
  await page.goto('/#/settings');
  await expect(page.locator('[data-journey]')).toContainText('첫 기록 2025.07.24');
  await expect(page.locator('[data-journey]')).toContainText('녹음2');
  await expect(page.locator('.vz-journey')).toHaveCSS('font-family', /Pretendard/);
  await expect(page.locator('.vz-journey')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('[data-sync-summary]')).toBeVisible();
  const headings = await page.locator('.vz-settings-section h2').allTextContents();
  expect(headings.map(h => h.trim())).toEqual(['연습 목표', '분석', '관리']);
  await expect(page.locator('.vz-settings-account [data-cloud]')).toBeVisible();
  await expect(page.locator('#cloud-upload')).toBeHidden();
  await expect(page.locator('#cloud-logout')).toBeHidden();
  await expect(page.locator('#cloud-media-upload')).toBeHidden();
  await page.getByText('동기화·백업 도구').click();
  await expect(page.locator('#cloud-logout')).toBeVisible();
  await expect(page.locator('#cloud-upload')).toBeVisible();
  await expect(page.locator('#cloud-media-upload')).toBeVisible();
  await expect(page.locator('.vz-settings').getByRole('link', {name:'레슨비 정산'})).toHaveCount(0);
  await expect(page.locator('[data-storage-status]')).not.toHaveText('확인 중…');
  await expect(page.locator('[data-export]')).toBeHidden();
  await page.getByText('기록 백업·복원').click();
  await expect(page.locator('[data-export]')).toBeVisible();
  await expect(page.locator('[data-import-json]')).toHaveCount(1);
  await expect(page.getByRole('navigation', {name:'주요 메뉴'})).toBeVisible(); // ordinary screens keep the same bottom menu as Home (shared-nav.css)
  await page.setViewportSize({width:320,height:700});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  // Leaving and coming back doesn't wrap the tools twice.
  await page.goto('/#/home'); await page.goto('/#/settings');
  await expect(page.locator('.cloud-more')).toHaveCount(1);
});

test('Signed-in imports are kept on the device first and the cloud upload resumes after leaving the app', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, {media:false});
  await page.evaluate(() => {
    window.__imports = []; window.__failNext = true; const rows = new Map();
    window.vzipCloudSignedIn = () => true;
    // The first upload is cut off (as when iOS pauses the app); later ones go through.
    window.vzipCloudImport = async (file, info) => { if (window.__failNext) { window.__failNext = false; throw Error('네트워크 연결이 끊겼어요.'); } window.__imports.push({id:info.id, size:file.size}); rows.set(info.id, {...info, size:file.size}); return {...info, size:file.size}; };
    window.vzipCloudMediaList = async () => [...rows.values()].map(m => ({...m, cloud:true}));
    window.vzipCloudMediaUpdate = async () => {};
  });
  const b = longWav();
  await page.goto('/#/library');
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,{name:'take.wav', mimeType:'audio/wav', buffer:b});
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).locator('[data-done]')).toContainText('✓ 이 기기에 저장 1개', {timeout:30000});
  await expect(sheet(page).locator('[data-summary]')).toContainText('클라우드 업로드는 자동으로 이어져요');
  // Saved on the device right away, marked for upload.
  const [local] = await media(page);
  expect(local).toMatchObject({source:'import', pendingUpload:true});
  // The first background attempt fails; coming back to the app retries it without picking the file again.
  await expect.poll(() => page.evaluate(() => window.__failNext)).toBe(false);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.evaluate(() => window.__imports.map(x => x.id)), {timeout:15000}).toEqual([local.id]);
  expect((await page.evaluate(() => window.__imports))[0].size).toBe(await page.evaluate(async () => { const x = (await window.vzipReadMedia())[0]; return x.blob ? x.blob.size : x.bytes.byteLength; })); // the device copy (WAV or its FLAC) is what goes up
  await expect(page.locator('#vz-upload-pill')).toHaveCount(0);
});

test('Recordings can be marked 공연·레슨·연습; performances are filtered and not counted as practice time', async ({page}) => {
  await boot(page);
  await page.goto('/#/library');
  // m2 is an unlinked practice recording; its length never adds to actual practice time.
  await page.locator('[data-media="m2"] [data-toggle]').click();
  await page.locator('[data-media="m2"] [data-lib-row-more]').click();
  await sheet(page).getByRole('button', {name:/정보 수정/}).click();
  await expect(sheet(page).getByRole('radio', {name:'연습'})).toHaveAttribute('aria-checked', 'true');
  await sheet(page).getByRole('radio', {name:'공연'}).click();
  await sheet(page).getByRole('button', {name:'저장'}).click();
  await expect.poll(async () => (await media(page)).find(m => m.id === 'm2').occasion).toBe('performance');
  // The library tabs are recording kinds now; the row still says 공연, and the song's recording list marks it.
  await page.goto('/#/home'); await page.goto('/#/library'); // the open player keeps the list as it was until the screen is left
  await expect(page.locator('[data-media="m2"] .item-sub')).toContainText('공연');
  await page.goto('/#/song/s1');
  await expect(page.locator('.vz-song-media-list [data-media="m2"] .vz-song-kind.performance')).toHaveText('공연');
  const minutes = await page.evaluate(async () => VZ.timeEntries(await VZ.media.list()).filter(e => e.kind === 'recording').map(e => e.ref.id));
  expect(minutes).not.toContain('m2');  // The calendar shows performances as their own group and dot.
  const m2day = await page.evaluate(async () => VZ.media.dateOf((await VZ.media.list()).find(m => m.id === 'm2')));
  await page.goto('/#/calendar');
  await expect(page.locator('.legend')).toContainText('공연');
  for (let i = 0; i < 3 && !(await page.locator('[data-d="' + m2day + '"]').count()); i++) await page.getByRole('button', {name:'이전 달'}).click();
  await page.locator('[data-d="' + m2day + '"]').click();
  await expect(page.locator('[data-d="' + m2day + '"] .dots .s')).toHaveCount(1);
  await expect(page.locator('[data-day] .cal-group').first()).toHaveText('공연·오디션');
  await expect(page.locator('[data-day]')).toContainText('공연 녹음·영상');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('A recording is marked 레슨 녹음 or 트레이닝 from its menu; 레슨 offers to link that day\'s lesson', async ({page}) => {
  await boot(page);
  const day = await page.evaluate(async () => { const m = (await VZ.media.list()).find(x => x.id === 'm2'); const d = VZ.media.dateOf(m);
    VZ.change(db => db.lessons.push({id:'l-kind', date:d, startTime:'15:00', status:'scheduled', feedback:'', memo:'', recordings:[]})); return d; });
  await page.goto('/#/library');
  await page.locator('[data-media="m2"] [data-toggle]').click();
  await page.locator('[data-media="m2"] [data-lib-row-more]').click();
  await sheet(page).getByRole('button', {name:/트레이닝으로 지정/}).click();
  await expect.poll(async () => (await media(page)).find(m => m.id === 'm2').recordingCategory).toBe('training');
  await page.goto('/#/library');
  await page.locator('[data-media="m2"] [data-toggle]').click();
  await page.locator('[data-media="m2"] [data-lib-row-more]').click();
  await expect(sheet(page).getByRole('button', {name:/트레이닝으로 지정/})).toHaveCount(0);
  await sheet(page).getByRole('button', {name:/레슨 녹음으로 지정/}).click();
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', {name:'레슨에 연결'}));
  await expect(confirm).toContainText('15:00 레슨');
  await confirm.getByRole('button', {name:'연결'}).click();
  await expect.poll(async () => { const m = (await media(page)).find(x => x.id === 'm2'); return [m.recordingCategory, m.occasion]; }).toEqual(['lesson', 'lesson']);
  await expect.poll(() => page.evaluate(() => VZ.db.lessons.find(l => l.id === 'l-kind').recordings.map(r => r.id))).toEqual(['m2']);
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('WAV imports are stored as FLAC only after every sample is checked against the original', async ({page, browserName}) => {
  test.setTimeout(120000);
  await boot(page, {media:false});
  // 26 s of 16-bit stereo with noise so FLAC has real work to do (imports leave out takes under 25 seconds).
  const sr = 44100, frames = sr * 26, ch = 2, b = Buffer.alloc(44 + frames * ch * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + frames * ch * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * ch * 2, 40);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(Math.sin(i / (20 + c * 3)) * 9000 + (rnd() - 0.5) * 600))), 44 + (i * ch + c) * 2);
  await page.goto('/#/library');
  await openLibraryImport(page);
  await pickLibraryImportFiles(page,{name:'warmup.wav', mimeType:'audio/wav', buffer:b});
  await expect(sheet(page).getByText('WAV → FLAC 무손실 압축')).toBeVisible();
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(sheet(page).locator('[data-done]')).toContainText('✓ 저장 완료 1개', {timeout:90000});
  const [item] = await media(page);
  // Safari/WebKit (iPhone) keeps the WAV on purpose; other browsers must produce a verified FLAC.
  // On WebKit the inspected WAV is reused as is (see audio-import.spec "original WAV on WebKit"): the stored bytes are the original's.
  if (browserName === 'webkit') {
    expect(item.type).toBe('audio/wav'); expect(item.losslessFlac).toBeUndefined();
    expect(await page.evaluate(async original => { const stored = new Uint8Array(await window.vzipMediaBlob((await window.vzipReadMedia())[0]).arrayBuffer()), want = Uint8Array.from(atob(original), c => c.charCodeAt(0));
      return stored.length === want.length && stored.every((x, i) => x === want[i]); }, b.toString('base64'))).toBe(true);
    return;
  }
  expect(item.type).toBe('audio/flac');
  expect(item.losslessFlac).toMatchObject({samplesVerified:true, originalCodec:'pcm-s16', originalBytes:b.length, channels:2, sampleRate:44100, frames});
  expect(item.losslessFlac.outputBytes).toBeLessThan(b.length);
  expect(item.originalMedia).toMatchObject({name:'warmup.wav', size:b.length});
  // Decoding the stored FLAC gives exactly the original 16-bit samples.
  const same = await page.evaluate(async original => {
    const ctx = new OfflineAudioContext(2, 44100 * 26, 44100), stored = (await window.vzipReadMedia())[0];
    const audio = await ctx.decodeAudioData(await stored.blob.arrayBuffer()), view = new DataView(Uint8Array.from(atob(original), c => c.charCodeAt(0)).buffer);
    for (let c = 0; c < 2; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i += 997) if (Math.round(d[i] * 32768) !== view.getInt16(44 + (i * 2 + c) * 2, true)) return false; }
    return audio.length === 44100 * 26;
  }, b.toString('base64'));
  expect(same).toBe(true);
});

test('Import hub suggests linking a file to that day\'s lesson, and links only what was approved', async ({page}) => {
  test.setTimeout(90000);
  const wav = sec => { const sr = 4000, n = sr * sec, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / (7 + sec)) * 5000), 44 + i * 2); return b; };
  const seed = legacy(); seed.lessons.push({id:'lx', date:'2026-03-05', startTime:'19:00', songIds:['s2'], songId:'s2', status:'done', feedback:'', memo:'', recordings:[]});
  await boot(page, {seed, media:false});
  await page.goto('/#/import-hub');
  await page.getByRole('button', {name:/iCloud Drive/}).click();
  await page.locator('[data-files]').setInputFiles([{name:'class 2026-03-05.wav', mimeType:'audio/wav', buffer:wav(40)}, {name:'other 2026-03-06.wav', mimeType:'audio/wav', buffer:wav(41)}]);
  const row = name => page.locator('.hub-row').filter({has:page.locator('.hub-name', {hasText:name})});
  await expect(row('class').getByRole('button', {name:/이 날 레슨 \(On My Own\) 녹음으로 연결/})).toBeVisible({timeout:60000});
  await expect(row('other').locator('[data-lesson-on]')).toHaveCount(0);
  await row('class').getByRole('button', {name:/녹음으로 연결/}).click();
  await expect(row('class')).toContainText('레슨 녹음으로 연결');
  await expect(row('class').locator('[data-occ-row]')).toHaveValue('lesson');
  await expect(row('class').locator('[data-song]')).toHaveValue('s2'); // the lesson's only song
  await page.getByRole('button', {name:/선택한 2개 가져오기/}).click();
  await expect(page.locator('[data-result]')).toContainText('저장 2개', {timeout:60000});
  await expect(page.locator('[data-result]')).toContainText('레슨 녹음 1개 연결');
  const d = await data(page), items = await media(page);
  const linked = items.find(m => m.originalFilename === 'class 2026-03-05.wav');
  expect(d.lessons.find(l => l.id === 'lx').recordings.map(r => r.id)).toEqual([linked.id]);
  expect(linked.occasion).toBe('lesson');
  expect(d.practices.some(p => (p.mediaIds || []).includes(linked.id))).toBe(false);
});

test('Import hub takes a whole computer folder (subfolders too) and skips non-media files', async ({page, browserName}) => {
  test.skip(browserName === 'webkit', 'Folder picking is a desktop feature (iPhone/iPad Safari cannot pick folders).');
  test.setTimeout(90000);
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vzip-folder-')), sub = path.join(dir, '2026-03');
  fs.mkdirSync(sub);
  const sr = 4000, n = sr * 35, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(path.join(dir, 'top 2026-03-01.wav'), b); fs.writeFileSync(path.join(sub, 'nested 2026-03-02.wav'), b);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x'); fs.writeFileSync(path.join(sub, '.DS_Store'), 'x');
  await boot(page, {media:false});
  await page.goto('/#/import-hub');
  await page.getByRole('button', {name:/컴퓨터 폴더/}).click();
  await page.locator('[data-folder]').setInputFiles(dir);
  await expect(page.locator('.toast').last()).toContainText('음성·영상이 아닌 파일 2개는 건너뛰었어요.');
  await expect(page.locator('.hub-row')).toHaveCount(2, {timeout:60000});
  await expect(page.locator('.hub-name')).toHaveText(['nested 2026-03-02.wav', 'top 2026-03-01.wav']);
  fs.rmSync(dir, {recursive:true, force:true});
});

test('Billing attendance records go into 레슨 기록 and the calendar by themselves (00:00–01:00 / 00:00–02:00), once', async ({page}) => {
  await boot(page, {media:false});
  const l1 = (await data(page)).lessons.find(l => l.id === 'l1').date;
  await page.evaluate(async sameDay => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('vocalzip_billing_v1', 2); r.onupgradeneeded = () => { for (const n of ['documents', 'sync', 'recovery']) r.result.createObjectStore(n, {keyPath:'owner'}); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => { const t = db.transaction('documents', 'readwrite'); t.objectStore('documents').put({owner:'user:ui-test-user', schemaVersion:1, revision:3, passes:[{id:'p1', name:'10회권', teacher:'김쌤'}], payments:[], adjustments:[], imports:[], importRows:[], history:[],
      deductions:[{id:'d1', passId:'p1', date:'2026-10-01', status:'completed', units:100, memo:'호흡'}, {id:'d2', passId:'p1', date:'2026-10-04', status:'completed', units:200}, {id:'d3', passId:'p1', date:'2026-10-07', status:'noshow', units:100},
        {id:'d4', passId:'p1', date:sameDay, status:'completed', units:100}, {id:'d5', passId:'p1', date:'2026-10-09', status:'completed', units:100, voidedAt:'2026-11-01T00:00:00Z'}]}); t.oncomplete = res; t.onerror = () => rej(t.error); });
    db.close();
  }, l1);
  // Opening the lesson list (or just starting the app) brings them in; nothing to tap.
  await page.goto('/#/lessons');
  await expect(page.locator('.toast').last()).toContainText('레슨비 정산의 수강 3건을 레슨 기록·캘린더에 넣었어요');
  let d = await data(page);
  const added = d.lessons.filter(l => l.importedFrom === 'billing').sort((a, b) => a.date.localeCompare(b.date));
  expect(added.map(l => [l.id, l.date, l.startTime, l.endTime, l.status, l.billingDeductionId])).toEqual([
    ['bill-d1', '2026-10-01', '00:00', '01:00', 'done', 'd1'], ['bill-d2', '2026-10-04', '00:00', '02:00', 'done', 'd2'], ['bill-d3', '2026-10-07', '00:00', '01:00', 'cancelled', 'd3']]);
  expect(added[0]).toMatchObject({memo:'호흡', teacher:'김쌤'});
  expect(added[2].memo).toBe('당일 취소');
  // The lesson already on the same day is linked, not doubled; the deleted record (d5) stays out.
  expect(d.lessons.find(l => l.id === 'l1').billingDeductionId).toBe('d4');
  expect(d.lessons.filter(l => l.date === l1)).toHaveLength(1);
  expect(d.lessons.some(l => l.date === '2026-10-09')).toBe(false);
  // They are on the calendar.
  await page.goto('/#/calendar');
  for (let i = 0; i < 24 && !(await page.locator('.cal-day[data-d="2026-10-04"]').count()); i++) await page.locator('[data-mv="' + (new Date() > new Date(2026, 9, 31) ? -1 : 1) + '"]').click();
  await expect(page.locator('.cal-day[data-d="2026-10-04"] .dots i.l')).toHaveCount(1);
  await page.locator('.cal-day[data-d="2026-10-04"]').click();
  await expect(page.getByText('00:00 – 02:00').or(page.getByText('00:00–02:00')).first()).toBeVisible();
  // Nothing is added twice, and a lesson the user deletes does not come back.
  await page.evaluate(() => VZ.change(db => { db.lessons = db.lessons.filter(l => l.id !== 'bill-d2'); }));
  await page.goto('/#/home'); await page.goto('/#/lessons');
  await page.evaluate(() => VZ.billingImportLessons());
  d = await data(page);
  expect(d.lessons.filter(l => l.importedFrom === 'billing').map(l => l.id).sort()).toEqual(['bill-d1', 'bill-d3']);
  // The billing ledger itself is unchanged.
  const ledger = await page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('vocalzip_billing_v1'); q.onsuccess = () => r(q.result); }); const doc = await new Promise(r => { const q = db.transaction('documents').objectStore('documents').get('user:ui-test-user'); q.onsuccess = () => r(q.result); }); db.close(); return doc; });
  expect(ledger.revision).toBe(3);
});

test('Rebuilding 레슨비 정산 does not double the calendar: lessons made from old records re-link to the new ones', async ({page}) => {
  await boot(page, {media:false});
  const put = deductions => page.evaluate(async ds => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('vocalzip_billing_v1', 2); r.onupgradeneeded = () => { for (const n of ['documents', 'sync', 'recovery']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, {keyPath:'owner'}); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise(res => { const t = db.transaction('documents', 'readwrite'); t.objectStore('documents').put({owner:'user:ui-test-user', schemaVersion:1, revision:5, passes:[{id:'p1', name:'레슨권'}], payments:[], adjustments:[], imports:[], importRows:[], history:[], deductions:ds}); t.oncomplete = res; });
    db.close();
  }, deductions);
  await put([{id:'old1', passId:'p1', date:'2026-10-01', status:'completed', units:100}, {id:'old2', passId:'p1', date:'2026-10-04', status:'completed', units:200}]);
  await page.evaluate(() => VZ.billingImportLessons());
  expect((await data(page)).lessons.filter(l => l.importedFrom === 'billing').map(l => [l.id, l.billingDeductionId]).sort()).toEqual([['bill-old1', 'old1'], ['bill-old2', 'old2']]);
  // The ledger is cleared and imported again: same days, new record ids.
  await put([{id:'new1', passId:'p1', date:'2026-10-01', status:'completed', units:100}, {id:'new2', passId:'p1', date:'2026-10-04', status:'completed', units:200}, {id:'new3', passId:'p1', date:'2026-10-08', status:'completed', units:100}]);
  await page.evaluate(() => VZ.billingImportLessons());
  const lessons = (await data(page)).lessons.filter(l => l.importedFrom === 'billing');
  expect(lessons.map(l => [l.date, l.billingDeductionId]).sort()).toEqual([['2026-10-01', 'new1'], ['2026-10-04', 'new2'], ['2026-10-08', 'new3']]);
  expect(lessons.filter(l => l.date === '2026-10-01')).toHaveLength(1);
});

test('레슨비 정산 keeps one ledger when the login session drops, and offers to merge records saved apart on this device', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, {media:false});
  const AUTH = 'sb-chxnbtiyuyhiywzeshis-auth-token';
  // Records once saved while fully signed out went to the device-only ledger.
  await page.evaluate(k => { localStorage.removeItem(k); localStorage.removeItem('vzip_cloud_linked_user'); }, AUTH);
  await page.goto('/billing/');
  await expect(page.locator('#account-label')).toContainText('이 기기 전용');
  await page.locator('[data-panel="passes"]').click(); await page.locator('[data-open-form="pass"]').click();
  await page.locator('#pass-name').fill('기기에 남은 10회권'); await page.locator('#pass-totalUnits').fill('10'); await page.locator('#pass-amount').fill('300000');
  await page.locator('#pass-form [type=submit]').click(); await expect(page.locator('#message')).toContainText('저장했어요');
  // Signed in again: the account ledger offers to bring them in.
  await page.evaluate(k => { localStorage.setItem(k, JSON.stringify({user:{id:'ui-test-user', email:'test@example.invalid'}})); localStorage.setItem('vzip_cloud_linked_user', 'ui-test-user'); }, AUTH);
  await page.goto('/billing/');
  await expect(page.locator('#account-label')).toContainText('test@example.invalid');
  const box = page.locator('#other-ledgers');
  await expect(box).toContainText('이 기기 전용 저장소');
  await expect(box).toContainText('1건');
  await box.getByRole('button', {name:'합치기'}).click();
  await page.locator('.bd-sheet [data-ok]').click();
  await expect(page.locator('#message')).toContainText('합쳤어요');
  await expect(box).toHaveCount(0);
  await page.locator('[data-panel="passes"]').click();
  await expect(page.locator('#pass-list')).toContainText('기기에 남은 10회권');
  // The session expires but the app still knows the account: same ledger, nothing "disappears".
  await page.evaluate(k => localStorage.removeItem(k), AUTH);
  await page.goto('/billing/');
  await expect(page.locator('#account-label')).toContainText('로그인 계정');
  await page.locator('[data-panel="passes"]').click();
  await expect(page.locator('#pass-list')).toContainText('기기에 남은 10회권');
});

test('The first lesson completed after the update is deducted even if 레슨비 정산 was never opened since', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, {media:false});
  await page.evaluate(() => localStorage.setItem('sb-chxnbtiyuyhiywzeshis-auth-token', JSON.stringify({user:{id:'ui-test-user', email:'test@example.invalid'}})));
  await page.goto('/billing/');
  await expect(page.locator('#message')).toContainText('불러왔어요');
  await page.locator('[data-panel="passes"]').click();await page.locator('[data-open-form="pass"]').click();
  await page.locator('#pass-name').fill('10회권');await page.locator('#pass-totalUnits').fill('10');await page.locator('#pass-amount').fill('500000');
  await page.locator('#pass-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
  await page.goto('/#/lessons');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  // As on a device where billing was last opened before auto-deduction existed.
  await page.evaluate(() => localStorage.removeItem('vzip_billing_auto_deduct_v1'));
  await page.locator('[data-resolve="done"][data-id="l-over"]').click();
  await page.getByRole('dialog', {name:'레슨 완료'}).locator('[data-ok]').click(); // it says 1회 will be deducted and asks first
  await expect(page.locator('.toast').last()).toContainText('레슨비 정산에서 1회 차감했어요', {timeout:20000});
});

/* ---------- lesson fee is never deducted by accident (audit 2026-11-13) ---------- */
async function passOf10(page) {
  await page.evaluate(() => localStorage.setItem('sb-chxnbtiyuyhiywzeshis-auth-token', JSON.stringify({user:{id:'ui-test-user', email:'test@example.invalid'}})));
  await page.goto('/billing/');
  await expect(page.locator('#message')).toContainText('불러왔어요');
  await page.locator('[data-panel="passes"]').click(); await page.locator('[data-open-form="pass"]').click();
  await page.locator('#pass-name').fill('10회권'); await page.locator('#pass-totalUnits').fill('10'); await page.locator('#pass-amount').fill('500000');
  await page.locator('#pass-form [type=submit]').click(); await expect(page.locator('#message')).toContainText('저장했어요');
}
const billingRows = page => page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('vocalzip_billing_v1'); q.onsuccess = () => r(q.result); }); const doc = await new Promise(r => { const q = db.transaction('documents').objectStore('documents').get('user:ui-test-user'); q.onsuccess = () => r(q.result); }); db.close(); return (doc?.deductions || []).filter(d => !d.voidedAt).map(d => [d.lessonId, d.units]); });
/** Counts every background run of 레슨비 정산 (the hidden frame) from now on. */
const watchBillingRuns = page => page.evaluate(() => { window.__billingRuns = 0; new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.tagName === 'IFRAME' && /billing\//.test(n.src)) window.__billingRuns++; }).observe(document.body, {childList:true}); });

test('Lesson feedback: 레슨 완료로 표시 starts unticked, saving feedback alone neither completes nor deducts, and ticking it says what is deducted', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, {media:false});
  // No 레슨비 정산 yet: the box is unticked and there is nothing to warn about.
  await page.goto('/#/lesson/l-over');
  await page.locator('[data-fb],[data-fb2]').first().click();
  await expect(sheet(page).locator('[name=complete]')).not.toBeChecked();
  await sheet(page).locator('[name=complete]').check();
  await expect(sheet(page).locator('[data-complete-note]')).toBeHidden();
  await sheet(page).locator('[data-close]').click();
  await passOf10(page);
  await page.goto('/#/lesson/l-over');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await watchBillingRuns(page);
  await page.locator('[data-fb],[data-fb2]').first().click();
  const box = sheet(page).locator('[name=complete]'), note = sheet(page).locator('[data-complete-note]');
  await expect(box).not.toBeChecked();
  await expect(note).toBeHidden();
  await sheet(page).locator('[name=feedback]').fill('호흡이 좋아짐');
  await sheet(page).getByRole('button', {name:'피드백 저장'}).click();
  await expect(page.locator('.toast').last()).toContainText('피드백을 저장했어요');
  let l = (await data(page)).lessons.find(x => x.id === 'l-over');
  expect(l).toMatchObject({status:'scheduled', feedback:'호흡이 좋아짐'}); expect(l.completedAt).toBeUndefined();
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__billingRuns)).toBe(0);
  expect(await billingRows(page)).toEqual([]);
  // Ticking it tells what completing costs; saving then completes and deducts once.
  await page.locator('[data-fb],[data-fb2]').first().click();
  await expect(sheet(page).locator('[name=feedback]')).toHaveValue('호흡이 좋아짐');
  await box.check();
  await expect(note).toBeVisible();
  await expect(note).toContainText('1회');
  await box.uncheck(); await expect(note).toBeHidden(); await box.check();
  await sheet(page).getByRole('button', {name:'피드백 저장'}).click();
  await expect(page.locator('.toast').last()).toContainText('레슨비 정산에서 1회 차감했어요', {timeout:20000});
  l = (await data(page)).lessons.find(x => x.id === 'l-over');
  expect(l.status).toBe('done'); expect(l.completedAt).toBeGreaterThan(0);
  expect(await billingRows(page)).toEqual([['l-over', 100]]);
});

test('Overdue lesson card: 완료 asks first when it will deduct from the pass; 취소 keeps the lesson and the pass as they were', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, {media:false});
  await passOf10(page);
  await page.goto('/#/lessons');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await watchBillingRuns(page);
  const done = page.locator('[data-resolve="done"][data-id="l-over"]');
  await done.click();
  const ask = page.getByRole('dialog', {name:'레슨 완료'});
  await expect(ask).toContainText('1회');
  await expect(ask).toContainText('차감');
  await ask.getByRole('button', {name:'취소'}).click();
  await expect(ask).toHaveCount(0);
  expect((await data(page)).lessons.find(x => x.id === 'l-over').status).toBe('scheduled');
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__billingRuns)).toBe(0);
  expect(await billingRows(page)).toEqual([]);
  await done.click();
  await page.getByRole('dialog', {name:'레슨 완료'}).locator('[data-ok]').click();
  await expect(page.locator('.toast').last()).toContainText('레슨비 정산에서 1회 차감했어요', {timeout:20000});
  expect((await data(page)).lessons.find(x => x.id === 'l-over').status).toBe('done');
  expect(await billingRows(page)).toEqual([['l-over', 100]]);
});

test('A lesson completed on another device and merged in from the cloud is not deducted again on this device', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, {media:false});
  await passOf10(page);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await watchBillingRuns(page);
  // What cloud-sync does after a merge: the merged data is written and announced as 'cloud-merge'. The lesson was
  // completed seconds ago on the other device, which deducted it there (that ledger has not reached this device yet).
  await page.evaluate(k => {
    const d = JSON.parse(localStorage.getItem(k));
    d.lessons.push({id:'done-elsewhere', date:VZ.today(), startTime:'19:00', endTime:'20:00', status:'done', songIds:[], songId:'', feedback:'', memo:'', recordings:[], created:Date.now() - 60000, completedAt:Date.now() - 2000, updatedAt:Date.now() - 2000});
    localStorage.setItem(k, JSON.stringify(d));
    window.dispatchEvent(new CustomEvent('vzip:data-changed', {detail:{source:'cloud-merge'}}));
  }, KEY);
  expect((await page.evaluate(() => VZ.db.lessons.find(l => l.id === 'done-elsewhere')?.status))).toBe('done');
  // An unrelated edit on this device right after the merge must not pick that lesson up either.
  await page.evaluate(() => VZ.change(d => { d.songs[0].memo = '메모'; }));
  await page.waitForTimeout(4000);
  expect(await page.evaluate(() => window.__billingRuns)).toBe(0);
  expect(await billingRows(page)).toEqual([]);
  // A lesson completed on this device is still deducted, once, and only that one.
  await page.evaluate(() => VZ.change(d => { d.lessons.push({id:'done-here', date:VZ.today(), startTime:'10:00', endTime:'11:00', status:'done', songIds:[], songId:'', feedback:'', memo:'', recordings:[], created:Date.now()}); }));
  await expect.poll(() => page.evaluate(() => window.__billingRuns), {timeout:10000}).toBe(1);
});

test('Home shows lessons left the way 레슨비 정산 counts them (payments ÷ hourly rate)', async ({page}) => {
  await boot(page, {media:false});
  // Like a real ledger: a 1회 pass used as a container, 2,310,000원 paid at 30,000원/h, 71회 taken → 6회 left.
  await page.evaluate(() => new Promise(res => { const q = indexedDB.open('vocalzip_billing_v1', 2); q.onupgradeneeded = () => { for (const n of ['documents', 'sync', 'recovery']) q.result.createObjectStore(n, {keyPath:'owner'}); }; q.onsuccess = () => { const tx = q.result.transaction('documents', 'readwrite'); tx.objectStore('documents').put({owner:'user:ui-test-user', hourlyRate:30000, passes:[{id:'p', name:'기존', totalUnits:100, amount:30000}], payments:[{id:'pay', passId:'p', kind:'payment', amount:2310000, date:'2026-10-23'}], deductions:[{id:'d', passId:'p', units:7100, date:'2026-10-15', status:'completed'}], adjustments:[]}); tx.oncomplete = () => { q.result.close(); res(); }; }; }));
  await page.evaluate(() => VZ.change(d => { d.lessons.push({id:'next', date:'2099-01-01', startTime:'20:00', endTime:'21:00', status:'scheduled', songIds:[], songId:'', feedback:'', memo:'', recordings:[]}); }));
  await page.goto('/#/songs'); await page.goto('/#/home');
  await expect(page.locator('[data-billing-left]')).toHaveText(/남은 레슨 6회/);
});

test('Saving a lesson as completed deducts it in 레슨비 정산 in the background', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, {media:false});
  // The app is signed in as ui-test-user (stub); billing reads the same account from the Supabase session.
  await page.evaluate(() => localStorage.setItem('sb-chxnbtiyuyhiywzeshis-auth-token', JSON.stringify({user:{id:'ui-test-user', email:'test@example.invalid'}})));
  await page.goto('/billing/');
  await expect(page.locator('#message')).toContainText('불러왔어요');
  await page.locator('[data-panel="passes"]').click();await page.locator('[data-open-form="pass"]').click();
  await page.locator('#pass-name').fill('10회권');await page.locator('#pass-totalUnits').fill('10');await page.locator('#pass-amount').fill('500000');
  await page.locator('#pass-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(() => VZ.change(d => { d.lessons.push({id:'done-now', date:VZ.today(), startTime:'19:00', endTime:'20:00', status:'done', songIds:[], songId:'', feedback:'', memo:'', recordings:[], created:Date.now()}); }));
  await expect(page.locator('.toast').last()).toContainText('레슨비 정산에서 1회 차감했어요', {timeout:20000});
  await expect(page.locator('iframe')).toHaveCount(0);
  const ledger = () => page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('vocalzip_billing_v1'); q.onsuccess = () => r(q.result); }); const doc = await new Promise(r => { const q = db.transaction('documents').objectStore('documents').get('user:ui-test-user'); q.onsuccess = () => r(q.result); }); db.close(); return doc.deductions.map(d => [d.lessonId, d.units]); });
  expect(await ledger()).toEqual([['done-now', 100]]);
  // Saving the same lesson again does not deduct twice.
  await page.evaluate(() => VZ.change(d => { d.lessons.find(l => l.id === 'done-now').memo = '메모'; }));
  await page.waitForTimeout(4000);
  expect(await ledger()).toEqual([['done-now', 100]]);
  // The lesson list and the lesson page show it; cancelling and deducting again work from the lesson page.
  await page.goto('/#/lessons'); await page.locator('[data-lt="past"]').click();
  await expect(page.locator('a[href="#/lesson/done-now"] [data-billing-badge]')).toHaveText('정산 1회');
  await page.goto('/#/lesson/done-now');
  const card = page.locator('[data-billing-status]');
  await expect(card).toContainText('1회 차감됨10회권');
  await card.locator('[data-billing-do="void"]').click(); await page.locator('.sheet [data-ok]').click();
  await expect(page.locator('.toast').last()).toContainText('차감을 취소했어요 · 10회권 남은 10회', {timeout:20000});
  await expect(card).toContainText('아직 차감하지 않았어요');
  const active = () => page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('vocalzip_billing_v1'); q.onsuccess = () => r(q.result); }); const doc = await new Promise(r => { const q = db.transaction('documents').objectStore('documents').get('user:ui-test-user'); q.onsuccess = () => r(q.result); }); db.close(); return doc.deductions.filter(d => !d.voidedAt).map(d => [d.lessonId, d.units]); });
  expect(await active()).toEqual([]); // a deduction cancelled on purpose is not auto-deducted again
  await page.goto('/#/lessons');
  await expect(page.locator('a[href="#/lesson/done-now"] [data-billing-badge]')).toHaveText('정산 대기');
  await page.goto('/#/lesson/done-now');
  await card.locator('[data-billing-do="deduct"]').click(); await page.locator('.sheet [data-ok]').click();
  await expect(page.locator('.toast').last()).toContainText('1회 차감했어요 · 10회권 남은 9회', {timeout:20000});
  await expect(card).toContainText('1회 차감됨');
  expect(await active()).toEqual([['done-now', 100]]);
  await expect(page.locator('iframe')).toHaveCount(0);
});


test('File deletion cancels safely, deletes one file and preserves linked practice and lesson', async ({page}) => {
 await boot(page);
 await page.goto('/#/library');
 const row=page.locator('[data-media="m1"]').first();
 // 파일 삭제 sits under the recording's 더보기 → 기타 작업.
 const askDelete=async()=>{await row.locator('[data-lib-row-more]').click();await page.getByRole('dialog',{name:'녹음 더보기'}).getByText('기타 작업').click();await page.getByRole('dialog',{name:'녹음 더보기'}).getByRole('button',{name:'파일 삭제'}).click();};
 await row.locator('[data-toggle]').click();
 await askDelete();
 await expect(sheet(page)).toContainText('연습·레슨 기록, 메모와 연습 시간은 남아요');
 if(process.env.VZ_QA_OUTPUT) await page.screenshot({path:process.env.VZ_QA_OUTPUT+'/delete-confirmation.png'});
 await sheet(page).getByRole('button',{name:'취소',exact:true}).click();
 expect((await media(page)).map(x=>x.id)).toContain('m1');
 await askDelete();
 await sheet(page).getByRole('button',{name:'파일 영구 삭제',exact:true}).click();
 await expect.poll(async()=> (await media(page)).map(x=>x.id)).not.toContain('m1');
 const db=await data(page);
 expect(db.practices[0].mediaIds).toEqual([]);expect(db.practices[0].minutes).toBe(30);
 expect(db.lessons.find(x=>x.id==='l1').recordings).toEqual([]);
 expect(db.lessons.find(x=>x.id==='l1').memo).toBe('m');
 expect((await media(page)).map(x=>x.id)).toContain('m2');
 await page.reload();await expect(page.locator('[data-media="m1"]')).toHaveCount(0);
});

test('Song check selects recordings, keeps controls sticky and exposes individual deletion', async ({page}) => {
 await boot(page);
 await page.evaluate(async()=>{
  window.vzipCloudSignedIn=()=>true;
  window.vzipCloudSongTextList=async()=>[];window.vzipCloudSongTextSave=async()=>{};window.vzipCloudMediaDelete=async()=>{};
  await window.vzipStorePracticeMedia({id:'unassigned',name:'미분류 파일',created:Date.now(),type:'audio/wav',source:'import',blob:new Blob([window.__wav],{type:'audio/wav'})});
  VZ.media.invalidate();
 });
 await page.goto('/#/song-suggest');
 await expect(page.getByRole('heading',{name:'곡 확인'})).toBeVisible();
 await expect(page.locator('.vz-sc-record')).toHaveCount(1);
 if(process.env.VZ_QA_OUTPUT) await page.screenshot({path:process.env.VZ_QA_OUTPUT+'/song-check-top.png'});
 await expect(page.locator('.reference-options')).toBeHidden();
 const tip=page.locator('[data-song-help-tip]');
 await page.getByRole('button',{name:'곡 확인 도움말'}).click();
 await expect(tip).toBeVisible();
 await page.getByRole('button',{name:'곡 확인 도움말'}).click();
 await expect(tip).toBeHidden();
 await page.locator('.vz-sc-record input[type=checkbox]').check();
 await expect(page.locator('[data-counter]')).toHaveText('선택 1개');
 await page.locator('[data-select-all]').click();
 await expect(page.locator('[data-counter]')).toBeEmpty();
 // The advanced reference settings have no entry any more: their panel stays hidden and offers no manual reference fields.
 await expect(page.getByRole('button',{name:'곡 확인 설정'})).toHaveCount(0);
 await expect(page.locator('.reference-options')).toBeHidden();
 await expect(page.locator('[data-ref-song],[data-ref-text],[data-ref-manual]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'미분류 파일 더 보기',exact:true}).click();
 await page.getByRole('dialog',{name:'미분류 파일'}).getByRole('button',{name:'파일 삭제'}).click();
 await sheet(page).getByRole('button',{name:'파일 영구 삭제',exact:true}).click();
 await expect(page.getByRole('button',{name:'미분류 파일 더 보기',exact:true})).toHaveCount(0);
});

test('Song check keeps the selection controls and bottom actions visible at the last recording',async({page})=>{
 await page.setViewportSize({width:390,height:844}); // a phone layout check, also on the desktop project
 await boot(page);
 await page.evaluate(async()=>{
  window.vzipCloudSignedIn=()=>true;
  window.vzipCloudSongTextList=async()=>[];
  for(let i=0;i<8;i++)await window.vzipStorePracticeMedia({id:'sc-'+i,name:'녹음 '+i,created:Date.now()-i*1000,type:'audio/wav',source:'import',blob:new Blob([window.__wav],{type:'audio/wav'})});
  VZ.media.invalidate();
 });
 await page.goto('/#/song-suggest');
 await expect(page.locator('.vz-sc-record')).toHaveCount(8);
 await page.locator('.vz-sc-record').last().scrollIntoViewIfNeeded();
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
 const positions=await page.evaluate(()=>({
  title:document.querySelector('#top').getBoundingClientRect().bottom,
  sticky:document.querySelector('.vz-sc-sticky').getBoundingClientRect().top,
  selection:document.querySelector('.vz-sc-selection').getBoundingClientRect().bottom,
  last:document.querySelector('.vz-sc-record:last-child').getBoundingClientRect().bottom,
  footer:document.querySelector('.vz-sc-bottom').getBoundingClientRect().top,
  width:document.documentElement.scrollWidth
 }));
 expect(positions.title).toBeLessThan(0);
 expect(positions.sticky).toBeGreaterThanOrEqual(0);
 expect(positions.selection).toBeLessThan(positions.footer);
 expect(positions.last).toBeLessThanOrEqual(positions.footer);
 expect(positions.width).toBeLessThanOrEqual(390);
 for(const width of [320,430]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
 await page.setViewportSize({width:390,height:844});
 if(process.env.VZ_QA_OUTPUT) await page.screenshot({path:process.env.VZ_QA_OUTPUT+'/song-check-bottom.png'});
});



test('Video file deletion and a cloud failure retain the correct records',async({page})=>{
 await boot(page);
 await page.evaluate(async()=>{
  await window.vzipStorePracticeMedia({id:'video',name:'업로드 영상',type:'video/mp4',source:'import',blob:new Blob(['fixture'],{type:'video/mp4'})});
  await VZ.media.remove({id:'video',local:true});
 });
 expect((await media(page)).map(x=>x.id)).not.toContain('video');
 const failure=await page.evaluate(async()=>{
  window.vzipCloudSignedIn=()=>true;
  window.vzipCloudMediaDelete=async()=>{throw Error('연결 끊김')};
  try{await VZ.media.remove({id:'m1',local:true,cloud:true})}catch(e){return e.message}
 });
 expect(failure).toBe('연결 끊김');
 expect((await media(page)).map(x=>x.id)).toContain('m1');
 expect((await data(page)).practices[0].mediaIds).toContain('m1');
});

test('Library song filter stays selected and sheets preserve the underlying scroll', async ({page}) => {
  const seed = legacy(); seed.songs.push(...Array.from({length:30}, (_, i) => ({id:'x' + i, title:'추가 곡 ' + i, show:i % 3 ? '' : '레미제라블'})));
  await boot(page, {seed, media:false});
  await page.goto('/#/library');
  await page.locator('[data-library-filter]').click();
  await page.locator('[data-filter-song]').click();
  await page.locator('[data-choice=x3]').click();
  await expect(page.locator('[data-song]')).toHaveValue('x3');
  await page.locator('[data-select-mode]').click();
  await expect(page.locator('[data-song]')).toHaveValue('x3');
  await page.goto('/#/home'); await page.evaluate(() => scrollTo(0, 300)); const y = await page.evaluate(() => scrollY);
  await page.evaluate(() => { VZ.confirm('확인 창', '내용'); });
  await expect(page.locator('body')).toHaveClass(/sheet-lock/);
  await page.getByRole('dialog', {name:'확인 창'}).getByRole('button', {name:'취소'}).click();
  await expect(page.locator('body')).not.toHaveClass(/sheet-lock/);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  expect(page.__errors).toEqual([]);
});

test('Library selection scopes and bulk actions update selected recordings', async ({page}) => {
  await boot(page);
  await page.goto('/#/library');
  await expect(page.locator('[data-media]')).toHaveCount(2);
  const bar=page.locator('.lib-selection-tools');
  await expect(bar).toContainText('총 2개');
  await expect(bar).toHaveCSS('background-color', 'rgb(243, 236, 255)');
  await expect(bar.locator('[data-lib-select-all]')).toBeHidden();
  await expect(page.locator('[data-media="m1"] [data-lib-pick]')).toBeHidden();
  await page.locator('[data-select-mode]').click();
  await expect(bar.locator('[data-lib-select-all]')).toBeVisible();
  await expect(bar.locator('[data-lib-select-cancel]')).toBeVisible();
  await expect(bar).toHaveCSS('background-color', 'rgb(243, 236, 255)');
  await expect(bar).toContainText('0개 선택');
  await page.locator('[data-media="m1"] [data-lib-pick]').click();
  await expect(bar).toContainText('1개 선택');
  await bar.locator('[data-lib-select-all]').click();
  await expect(bar).toContainText('2개 선택');
  await expect(bar.locator('[data-lib-select-all]')).toHaveAttribute('aria-pressed','true');
  await bar.locator('[data-lib-bulk-more]').click();
  await page.getByRole('dialog',{name:'선택한 녹음 2개'}).getByRole('button',{name:/곡 지정/}).click();
  await page.getByRole('dialog',{name:'곡 지정'}).getByRole('option',{name:'On My Own'}).click();
  await page.getByRole('dialog',{name:'곡 지정'}).getByRole('button',{name:'바꾸기'}).click();
  await expect.poll(() => page.evaluate(async () => (await window.vzipReadMedia()).map(m => m.id + ':' + m.songId).sort().join(','))).toBe('m1:s2,m2:s2');
  await bar.locator('[data-lib-select-cancel]').click();
  await expect(bar).toContainText('총 2개');
  await expect(bar.locator('[data-lib-selected-count]')).toBeHidden();
  await expect(page.locator('[data-media="m1"] [data-lib-pick]')).toBeHidden();
  await page.goto('/#/home');
  expect(page.__errors).toEqual([]);
});

test('A measurement ⓘ opens what it measures and how to read it', async ({page}) => {
  await boot(page, {media:false});
  await page.evaluate(() => { document.querySelector('main').insertAdjacentHTML('afterbegin', '<p>음정 오차' + VZ.metricInfo('into', '음정 오차') + '</p>'); });
  await page.getByRole('button', {name:'음정 오차 설명'}).click();
  const sheet = page.getByRole('dialog', {name:'음정 정확도 (음정 오차)'});
  await expect(sheet).toContainText('반음 하나 = 100 cent');
  await expect(sheet).toContainText('판정하지 않아요');
  const box = await sheet.getByRole('button', {name:'돌아가기'}).boundingBox();
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44); // WebKit reports 43.99997
  expect(page.__errors).toEqual([]);
});

test('Offline notice, a change sent at once when the app goes to the background, and a song tab bar that stays on screen', async ({page, context}) => {
  const seed = legacy(); seed.practices.push(...Array.from({length:30}, (_, i) => ({id:'px' + i, date:day(-i - 2), minutes:20, songId:'s1', practiceMode:'song', technique:[], memo:'연습 ' + i})));
  await boot(page, {seed, media:false});
  await context.setOffline(true);
  await expect(page.locator('#vz-offline')).toContainText('오프라인');
  await context.setOffline(false);
  await expect(page.locator('#vz-offline')).toHaveCount(0);
  // A record changed right before the app is hidden is sent without waiting for the 0.9 s pause.
  await expect.poll(() => page.evaluate(() => window.__up.length)).toBeGreaterThan(0); // first sync after sign-in
  const before = await page.evaluate(() => window.__up.length);
  await page.evaluate(k => {
    const d = JSON.parse(localStorage.getItem(k)); d.songs.push({id:'s9', title:'방금 추가'}); localStorage.setItem(k, JSON.stringify(d));
    window.dispatchEvent(new Event('vzip:data-changed'));
    Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  }, KEY);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__up.length)).toBeGreaterThan(before);
  await page.evaluate(() => { delete document.visibilityState; });
  // Song page: the 전체·가사·악보… bar sticks; a tab chosen down the page starts right under it.
  await page.goto('/#/song/s1');
  const bar = page.locator('.song-tabs');
  // The song opens on 녹음 (none here); 활동 기록 holds the 30 practices, long enough to scroll.
  await bar.getByRole('tab', {name:'활동 기록'}).click();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => Math.round((await bar.boundingBox()).y)).toBeLessThan(40);
  await bar.getByRole('tab', {name:'가사'}).click();
  const gap = await page.evaluate(() => document.querySelector('[data-body]').getBoundingClientRect().top - document.querySelector('.song-tabs').getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(40);
  expect(page.__errors).toEqual([]);
});

test('Every control on the main screens answers a 44pt tap (iPhone)', async ({page}) => {
  test.setTimeout(120000);
  await boot(page);
  const routes = ['home', 'record', 'lessons', 'lesson/l1', 'calendar', 'homework', 'songs', 'song/s1', 'library', 'growth', 'analysis', 'settings', 'import-hub', 'storage', 'song-suggest', 'compare'];
  const bad = {};
  for (const r of routes) {
    await page.goto('/#/' + r); await page.waitForTimeout(500);
    const found = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('main a[href], main button, main select, main input, main [role=button], main summary, nav a, header button, header a')) {
        const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (!b.width || !b.height || cs.visibility === 'hidden') continue;
        if (el.matches('.pick-native,.sr-only,input[type=checkbox],input[type=radio],input[type=hidden]')) continue;
        if (el.tagName === 'A' && cs.display === 'inline') continue; // a link inside a sentence
        const hit = parseFloat(getComputedStyle(el, '::before').height) || 0; // a wider invisible tap area
        if (Math.round(Math.max(b.height, hit)) < 44) out.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 20) + ' ' + Math.round(b.height) + 'px');
      }
      return out;
    });
    if (found.length) bad[r] = found;
  }
  expect(bad).toEqual({});
});

test('A practice record made by an import follows its file: new day and song move it, 공연 asks to take it out of practice time', async ({page}) => {
  const seed = legacy();
  seed.practices.push({id:'auto-m2', date:day(-1), minutes:3, manualMinutes:3, mediaSeconds:0, mediaIds:['m2'], practiceMode:'song', technique:[], songId:'s1', rating:0, memo:'', completed:[], importedFrom:'files'});
  await boot(page, {seed});
  const practice = id => page.evaluate(i => VZ.db.practices.find(p => p.id === i) || null, id);
  await page.evaluate(async () => { const m = (await VZ.media.list()).find(x => x.id === 'm2'); VZ.editMedia(m); });
  const sheet = page.getByRole('dialog', {name:'녹음 정보'});
  await sheet.locator('input[name="date"]').fill('2026-01-24');
  await sheet.locator('select[name="song"]').selectOption('s2');
  await sheet.getByRole('radio', {name:'공연'}).click();
  await sheet.getByRole('button', {name:'저장'}).click();
  await expect.poll(async () => (await practice('auto-m2'))?.date).toBe('2026-01-24');
  expect((await practice('auto-m2')).songId).toBe('s2');
  const ask = page.getByRole('dialog', {name:'연습 기록도 정리할까요?'});
  await expect(ask).toContainText('녹음 1개');
  await ask.getByRole('button', {name:'연습 기록 지우기'}).click();
  await expect.poll(() => practice('auto-m2')).toBeNull();
  expect(await practice('p1')).not.toBeNull(); // a record the user made is never touched
  expect(page.__errors).toEqual([]);
});

test('Files edited before the follow rule existed are lined up once after start', async ({page}) => {
  const seed = legacy();
  seed.practices.push({id:'auto-old', date:'2026-11-07', minutes:3, mediaIds:['m2'], practiceMode:'song', technique:[], songId:'s1', rating:0, memo:'', completed:[], importedFrom:'hub'});
  await boot(page, {seed});
  await expect.poll(() => page.evaluate(() => VZ.db.practices.find(p => p.id === 'auto-old').date), {timeout:8000}).toBe(await page.evaluate(async () => VZ.media.dateOf((await VZ.media.list()).find(x => x.id === 'm2'))));
  expect(page.__errors).toEqual([]);
});




test('Actual practice time excludes recording length across growth, calendar and home',async({page})=>{
 await boot(page);
 await page.evaluate(async()=>{
  const m=(await window.vzipReadMedia()).find(x=>x.id==='m2');delete m.bytes;
  await window.vzipStorePracticeMedia({...m,blob:new Blob([window.__wav],{type:'audio/wav'}),durationSeconds:600});
  VZ.change(d=>{d.practices[0].date=VZ.today();});VZ.media.invalidate();
 });
 const values=await page.evaluate(async()=>{
  const entries=VZ.timeEntries(await VZ.media.list());
  return {total:VZ.sumMinutes(entries),home:VzipStudentHomeModel.build(VZ.db,{today:VZ.today(),timeEntries:entries}).week.actualMinutes};
 });
 expect(values).toEqual({total:25,home:25});
 await page.goto('/#/growth');await page.getByRole('button',{name:'전체',exact:true}).click();
 await expect(page.locator('.stat').filter({hasText:'전체 연습 시간'})).toContainText('25분');
 await expect(page.locator('[data-file-time]')).toHaveCount(0);
 await page.locator('[data-song-metric="files"]').click();
 await expect(page.locator('[data-song-stat="s1"]')).toContainText('2회');
 await page.goto('/#/song/s1');await expect(page.locator('[data-summary]')).toContainText('연습 25분');
 await page.goto('/#/calendar');await expect(page.locator('[data-month-minutes]')).toHaveText('25분');
 expect((await data(page)).practices[0]).toMatchObject({minutes:30,manualMinutes:25,mediaSeconds:300});
});

test('Actual practice time supports training recordings without changing the entered minutes',async({page})=>{
 const seed=legacy();seed.practices=[];await boot(page,{seed});
 await page.evaluate(()=>VZ.practiceSheet());await sheet(page).locator('[data-mode="training"]').click();
 // Training starts from the recommendation picker; 직접 입력 takes an existing 분류 and 세부 항목.
 await sheet(page).locator('select[name=recommendation]').selectOption('__custom');
 await sheet(page).locator('select[name=category]').selectOption('c1');
 await sheet(page).locator('select[name=detail]').selectOption('립트릴');
 await sheet(page).locator('[name=date]').fill(day(-1));
 await sheet(page).locator('[name=minutes]').fill('12');
 await sheet(page).locator('input[name=media][value="m2"]').check();
 await expect(sheet(page).locator('[name=minutes]')).toHaveValue('12');
 await sheet(page).getByRole('button',{name:'연습 기록 저장',exact:true}).click();
 const record=(await data(page)).practices[0];
 expect(record).toMatchObject({practiceMode:'training',minutes:12,manualMinutes:12,practiceTimeSource:'manual',mediaIds:['m2'],songId:''});
 expect(await page.evaluate(()=>VZ.sumMinutes(VZ.timeEntries()))).toBe(12);
 await page.reload();
 expect(await page.evaluate(()=>VZ.sumMinutes(VZ.timeEntries()))).toBe(12);
 expect((await media(page)).some(x=>x.id==='m2')).toBe(true);
});

async function deletionBillingFrame(page,seed=false){
 if(seed){
  const cloud=page.__deletionCloud={row:null};
  await page.route('**/rest/v1/vocal_billing_documents*',route=>route.fulfill({json:cloud.row?[cloud.row]:[]}));
  await page.route('**/rest/v1/rpc/vocal_billing_save',route=>{
   const body=route.request().postDataJSON();
   if((cloud.row?.revision||0)!==body.p_expected_revision)return route.fulfill({status:409,json:{code:'PT409'}});
   cloud.row={payload:body.p_payload,revision:(cloud.row?.revision||0)+1,last_request_id:body.p_request_id,updated_at:new Date().toISOString()};
   return route.fulfill({json:cloud.row});
  });
  await page.evaluate(()=>localStorage.setItem('sb-chxnbtiyuyhiywzeshis-auth-token',JSON.stringify({access_token:'fixture-token',expires_at:4102444800,user:{id:'ui-test-user',email:'fixture@example.invalid'}})));
 }
 const handle=await page.evaluateHandle(()=>{
  const frame=document.createElement('iframe');frame.hidden=true;frame.dataset.deletionFixture='';
  window.__deletionFixtureReady=new Promise(resolve=>{
   const listener=e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='vzip-billing-auto'){window.removeEventListener('message',listener);resolve();}};
   window.addEventListener('message',listener);
  });
  frame.src='/billing/?auto=1&do=fixture';document.body.append(frame);return frame;
 });
 const frame=await handle.asElement().contentFrame();
 await expect.poll(()=>frame.evaluate(()=>typeof window.VzipBillingStore?.load==='function').catch(()=>false)).toBe(true);
 await page.evaluate(()=>window.__deletionFixtureReady);
 if(seed)await frame.evaluate(async()=>{
  const S=VzipBillingStore;let s=await S.load(),run=async(type,payload)=>s=await S.save({type,payload},s.revision);
  const date=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).lessons.find(l=>l.id==='l1').date;
  await run('pass.save',{name:'보존할 10회권',amount:300000,totalUnits:1000});const passId=s.passes[0].id;
  await run('payment.save',{passId,date,kind:'payment',amount:300000});
  await run('payment.save',{passId,date,kind:'refund',amount:10000});
  await run('deduction.save',{passId,date,lessonId:'l1',status:'completed',units:100});
  await run('deduction.save',{passId,date,lessonId:'same-day-neighbour',status:'completed',units:100});
  await VzipBillingCloud.sync();
 });
 const value=await frame.evaluate(()=>VzipBillingStore.load());
 await handle.evaluate(el=>el.remove());return value;
}
async function confirmLessonDeletion(page,{files=[],billing=false}={}){
 await page.goto('/#/lesson/l1');await page.getByRole('button',{name:'레슨 삭제',exact:true}).click();
 const plan=page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true});
 await expect(plan).toBeVisible();
 for(const id of files)await plan.locator('[name=media][value="'+id+'"]').check();
 if(billing)await plan.locator('[name=billing]').check();
 await plan.getByRole('button',{name:'삭제 대상 확인',exact:true}).click();
 const final=page.getByRole('dialog',{name:'선택 항목 영구 삭제',exact:true});
 await expect(final).toContainText('복구할 수 없습니다');
 await final.getByRole('button',{name:'영구 삭제',exact:true}).click();
}
test('Lesson deletion preserves unselected billing and recordings and starts with all options off',async({page})=>{
 await boot(page);const before=await deletionBillingFrame(page,true);
 await page.goto('/#/lesson/l1');await page.getByRole('button',{name:'레슨 삭제',exact:true}).click();
 const plan=page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true});
 await expect(plan.locator('input:checked')).toHaveCount(0);
 await plan.getByRole('button',{name:'삭제 대상 확인',exact:true}).click();
 await page.getByRole('dialog',{name:'선택 항목 영구 삭제',exact:true}).getByRole('button',{name:'영구 삭제',exact:true}).click();
 await expect.poll(async()=>(await data(page)).lessons.some(l=>l.id==='l1')).toBe(false);
 const after=await deletionBillingFrame(page);
 expect(after).toEqual(before);expect((await media(page)).some(m=>m.id==='m1')).toBe(true);
 expect((await data(page)).practices[0].manualMinutes).toBe(25);
});
test('Lesson deletion cancels the exact charge once after a lost response and deletes only the chosen recording',async({page})=>{
 await boot(page);const before=await deletionBillingFrame(page,true);
 await page.evaluate(()=>{
  const cancel=VZ.billingCancelForDeletion;let first=true;
  VZ.billingCancelForDeletion=async job=>{const result=await cancel(job);if(first){first=false;throw Error('응답 중단 시험');}return result;};
 });
 await confirmLessonDeletion(page,{files:['m1'],billing:true});
 const progress=page.getByRole('dialog',{name:'레슨 삭제 진행',exact:true});
 await expect(progress.locator('[data-delete-error]')).toContainText('응답 중단 시험');
 expect((await data(page)).lessons.some(l=>l.id==='l1')).toBe(true);
 expect((await media(page)).some(m=>m.id==='m1')).toBe(true);
 await progress.getByRole('button',{name:'삭제 재시도',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>({
  exists:VZ.db.lessons.some(l=>l.id==='l1'),
  error:document.querySelector('[data-delete-error]')?.textContent||''
 })),{timeout:10000}).toEqual({exists:false,error:''});
 const after=await deletionBillingFrame(page);
 expect(after.payments).toEqual(before.payments);
 expect(after.deductions.find(d=>d.lessonId==='same-day-neighbour')).toEqual(before.deductions.find(d=>d.lessonId==='same-day-neighbour'));
 expect(after.deductions.find(d=>d.lessonId==='l1').voidedAt).toBeTruthy();
 expect(after.history.filter(h=>h.action==='deduction.cancelForDeletion')).toHaveLength(1);
 expect((await media(page)).map(m=>m.id)).toEqual(['m2']);
 const d=await data(page);expect(d.practices[0]).toMatchObject({mediaIds:[],manualMinutes:25,completed:['a1']});
 expect(d.assignments.find(a=>a.id==='a2').lessonIds).toEqual(['l-over']);
 expect(await page.evaluate(()=>VZ.lessonDeletion.jobs())).toEqual([]);
 const handle=await page.evaluateHandle(()=>{const f=document.createElement('iframe');f.hidden=true;f.src='/billing/?auto=1&do=fixture';document.body.append(f);return f;});
 const frame=await handle.asElement().contentFrame();
 await expect.poll(()=>frame.evaluate(()=>!!window.VzipBillingStore).catch(()=>false)).toBe(true);
 const guarded=await frame.evaluate(async old=>{
  const S=VzipBillingStore;let s=await S.load(),errors=[];
  try{await S.replace(old,s.revision);}catch(e){errors.push(e.message);}
  s=await S.clear(s.revision);
  try{await S.replace(old,s.revision);}catch(e){errors.push(e.message);}
  return errors;
 },before);
 expect(guarded).toHaveLength(2);expect(guarded.every(e=>e.includes('과거 백업'))).toBe(true);
 await handle.evaluate(el=>el.remove());
});
test('Lesson deletion resumes a partial file failure after refresh without restoring or deleting unselected data',async({page})=>{
 const seed=legacy();seed.lessons[0].recordings.push({id:'m2',note:'second'});await boot(page,{seed});
 await page.evaluate(()=>{
  const remove=VZ.media.remove;
  VZ.media.remove=async item=>{if(item.id==='m2')throw Error('두 번째 파일 실패 시험');return remove(item);};
 });
 await confirmLessonDeletion(page,{files:['m1','m2']});
 const progress=page.getByRole('dialog',{name:'레슨 삭제 진행',exact:true});
 await expect(progress.locator('[data-delete-error]')).toContainText('두 번째 파일 실패 시험');
 expect((await media(page)).map(m=>m.id)).toEqual(['m2']);
 expect((await data(page)).lessons.some(l=>l.id==='l1')).toBe(true);
 await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.evaluate(()=>{window.vzipCloudSignedIn=()=>false;});
 await page.goto('/#/lessons');
 await page.getByRole('button',{name:'미완료 레슨 삭제 1건 확인',exact:true}).click();
 await page.getByRole('dialog',{name:'미완료 레슨 삭제',exact:true}).locator('[data-job]').click();
 await expect.poll(async()=>(await data(page)).lessons.some(l=>l.id==='l1')).toBe(false);
 expect(await media(page)).toEqual([]);
 expect((await data(page)).practices[0].manualMinutes).toBe(25);
});
test('Lesson deletion detects changed lesson content before any irreversible step',async({page})=>{
 await boot(page);
 await page.goto('/#/lesson/l1');await page.getByRole('button',{name:'레슨 삭제',exact:true}).click();
 await page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true}).getByRole('button',{name:'삭제 대상 확인',exact:true}).click();
 const final=page.getByRole('dialog',{name:'선택 항목 영구 삭제',exact:true});await expect(final).toBeVisible();
 await page.evaluate(()=>VZ.change(d=>{d.lessons.find(l=>l.id==='l1').feedback='변경된 피드백';},{silent:true}));
 await final.getByRole('button',{name:'영구 삭제',exact:true}).click();
 await expect(page.locator('.toast').last()).toContainText('레슨 내용이 바뀌었어요');
 expect((await data(page)).lessons.find(l=>l.id==='l1').feedback).toBe('변경된 피드백');
 expect((await media(page)).some(m=>m.id==='m1')).toBe(true);
});

test('Lesson deletion can reselect changed content after partial failure while preserving already completed steps',async({page})=>{
 const seed=legacy();seed.lessons[0].recordings.push({id:'m2'});await boot(page,{seed});
 await page.evaluate(()=>{
  const remove=VZ.media.remove;VZ.media.remove=async m=>{if(m.id==='m2')throw Error('partial fixture');return remove(m);};
 });
 await confirmLessonDeletion(page,{files:['m1','m2']});
 let progress=page.getByRole('dialog',{name:'레슨 삭제 진행',exact:true});
 await expect(progress.locator('[data-delete-error]')).toContainText('partial fixture');
 await page.evaluate(()=>VZ.change(d=>{d.lessons.find(l=>l.id==='l1').feedback='새로 작성한 피드백';},{silent:true}));
 await progress.getByRole('button',{name:'삭제 재시도',exact:true}).click();
 await expect(progress.locator('[data-delete-error]')).toContainText('레슨 내용이 바뀌었어요');
 await progress.getByRole('button',{name:'대상 다시 선택',exact:true}).click();
 await page.getByRole('dialog',{name:'삭제 대상을 다시 선택할까요?',exact:true}).getByRole('button',{name:'다시 선택',exact:true}).click();
 const plan=page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true});
 await expect(plan.locator('input:checked')).toHaveCount(0);
 await plan.getByRole('button',{name:'삭제 대상 확인',exact:true}).click();
 await page.getByRole('dialog',{name:'선택 항목 영구 삭제',exact:true}).getByRole('button',{name:'영구 삭제',exact:true}).click();
 await expect.poll(async()=>(await data(page)).lessons.some(l=>l.id==='l1')).toBe(false);
 expect((await media(page)).map(m=>m.id)).toEqual(['m2']);
});

test('Lesson deletion from settlement verifies exact charge, preserves recordings and returns to billing',async({page})=>{
 await boot(page);const before=await deletionBillingFrame(page,true),row=before.deductions.find(d=>d.lessonId==='l1');
 await page.goto('/#/lesson/l1?settlementDelete='+encodeURIComponent(row.id)+'&version='+row.version);
 const plan=page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true});
 await expect(plan.locator('input[name=billing]')).toBeChecked();
 await expect(plan.locator('input[name=media]:checked')).toHaveCount(0);
 await expect(page).toHaveURL(/#\/lesson\/l1$/);
 await plan.getByRole('button',{name:'삭제 대상 확인',exact:true}).click();
 await page.getByRole('dialog',{name:'선택 항목 영구 삭제',exact:true}).getByRole('button',{name:'영구 삭제',exact:true}).click();
 await expect(page).toHaveURL(/\/billing\/$/);
 await page.waitForFunction(()=>window.VzipBillingStore); // the URL changes before the billing page has loaded its scripts
 const after=await page.evaluate(()=>VzipBillingStore.load());
 expect(after.payments).toEqual(before.payments);
 expect(after.deductions.find(d=>d.lessonId==='l1').deletionOperationId).toBeTruthy();
 expect(after.deductions.find(d=>d.lessonId==='same-day-neighbour')).toEqual(before.deductions.find(d=>d.lessonId==='same-day-neighbour'));
 await page.goto('/#/lessons');await page.evaluate(()=>{window.vzipCloudSignedIn=()=>false;});
 expect((await data(page)).lessons.some(l=>l.id==='l1')).toBe(false);
 expect((await media(page)).some(m=>m.id==='m1')).toBe(true);
});
test('Lesson deletion from stale settlement version stops without a dialog or destructive actions',async({page})=>{
 await boot(page);const before=await deletionBillingFrame(page,true),row=before.deductions.find(d=>d.lessonId==='l1');
 await page.goto('/#/lesson/l1?settlementDelete='+encodeURIComponent(row.id)+'&version=999');
 await expect(page.locator('.toast').last()).toContainText(' 연결 차감이 변경됐어요'.trim());
 await expect(page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true})).toHaveCount(0);
 expect((await data(page)).lessons.some(l=>l.id==='l1')).toBe(true);
 expect(await deletionBillingFrame(page)).toEqual(before);
});

test('Upload startup inspects only four files before sending and holds background backup through all windows',async({page})=>{
 await boot(page,{media:false});
 await page.evaluate(()=>{
  window.__startup={inspected:0,first:0,sent:0,holds:0,firstHolds:0};
  window.vzipCloudSignedIn=()=>true;window.vzipCloudUserId=()=> 'ui-test-user';
  VZ.media.list=async()=>[];
  const hold=VZ.media.holdBackup;
  VZ.media.holdBackup=on=>{window.__startup.holds+=on?1:-1;hold(on);};
  window.vzipInspectMedia=async()=>{window.__startup.inspected++;return {readable:true,duration:32,hasVideo:false,hasAudio:true,metadata:{recordedDate:'2026-11-09',dateSource:'metadata'}};};
  VZ.media.importFile=async(file,choice)=>{
   if(!window.__startup.sent){window.__startup.first=window.__startup.inspected;window.__startup.firstHolds=window.__startup.holds;}
   window.__startup.sent++;return {id:choice.id,cloud:true,size:file.size,durationSeconds:32,recordedDate:'2026-11-09'};
  };
  VZ.openImportHub({files:Array.from({length:9},(_,i)=>new File([new Uint8Array([i,1,2,3])],'part-'+i+'.m4a',{type:'audio/mp4'}))});
 });
 await expect.poll(()=>page.evaluate(()=>window.__startup.sent)).toBe(9);
 await expect.poll(()=>page.evaluate(()=>window.__startup.holds)).toBe(0);
 const result=await page.evaluate(()=>window.__startup);
 expect(result.first).toBe(4);expect(result.firstHolds).toBeGreaterThanOrEqual(2);
 expect(result.inspected).toBe(9);
});

test('AI exercise appears inline in the same card form and follow-along uses its saved steps',async({page})=>{
 await boot(page);
 await page.evaluate(async()=>{
  await window.vzipStorePracticeMedia({id:'m3',name:'세 번째 녹음',created:Date.now(),type:'audio/wav',source:'practice',songId:'s1',blob:new Blob([window.__wav],{type:'audio/wav'}),durationSeconds:1});VZ.media.invalidate();
  for(const m of (await VZ.media.list()).filter(x=>x.songId==='s1'))await VZ.media.update(m,{analysis:{v:1,metrics:{voicedSeconds:30,stability:{wobbleCents:18,notes:4},intonation:{meanAbsCents:28,notes:10},range:{lowCents:6000,highCents:8100},breath:{medianPhrase:2.4}},confidence:{voiceOverMrDb:12}}},{quiet:true});VZ.media.invalidate();
  window.vzipCloudCoach=async input=>{window.__aiInput=input;return {exercise:{family:'diction',name:'가사 자음 또렷하게 읽기',reason:'기존 두 연습과 다른 전달 연습이에요.',steps:['가사 한 줄을 읽어요.','핵심 단어를 적어요.'],goal:'전할 단어 하나 정하기',minutes:4}};};
 });
 await page.goto('/#/vocal-lab/s1');await labClear(page); await page.locator('.vl-dates button').first().click();await expect(page.locator('.vl-tip')).toHaveCount(2);
 const original=await page.locator('.vl-tip summary strong').allTextContents();
 await page.getByRole('button',{name:'다른 연습 하나 AI 추천받기'}).click();await expect(page.locator('.vl-tip')).toHaveCount(3);
 expect(await page.locator('.vl-tip summary strong').allTextContents()).toEqual([...original,'가사 자음 또렷하게 읽기']);
 const card=page.locator('[data-ai-tip] .vl-tip');await expect(card).toHaveAttribute('open','');await expect(card.locator('li')).toHaveCount(2);await expect(card.locator('.vl-tip-goal')).toContainText('권장 4분');
 await page.getByRole('button',{name:'다른 연습 하나 AI 추천받기'}).click();await expect(page.locator('.vl-tip')).toHaveCount(3);
 await page.evaluate(()=>window.vzipCloudCoach=async()=>{throw Error('요청 실패 테스트');});await page.getByRole('button',{name:'다른 연습 하나 AI 추천받기'}).click();await expect(page.locator('[data-ai-status]')).toHaveText('요청 실패 테스트');await expect(page.locator('.vl-tip')).toHaveCount(3);
 expect(await page.evaluate(()=>__aiInput.mode)).toBe('inline-exercise');expect(await page.evaluate(()=>__aiInput.excluded.length)).toBe(2);await expect(page).toHaveURL(/#\/vocal-lab\/s1$/);
 const before=await page.evaluate(()=>VZ.db.practices.length);
 await page.goto('/#/song/s1');await page.goto('/#/vocal-lab/s1');await labClear(page); await page.locator('.vl-dates button').first().click();await expect(page.locator('[data-ai-tip] summary strong')).toHaveText('가사 자음 또렷하게 읽기');
 await page.reload();await labClear(page); await page.locator('.vl-dates button').first().click();await expect(page.locator('[data-ai-tip] summary strong')).toHaveText('가사 자음 또렷하게 읽기');await expect(page.locator('[data-ai-status]')).toContainText('저장된 AI 추천');expect(await page.evaluate(()=>VZ.db.practices.length)).toBe(before);
 await page.evaluate(()=>VZ.practiceSheet=input=>window.__recordPreset=input);await card.getByRole('button',{name:'연습 기록에 담기'}).click();expect(await page.evaluate(()=>__recordPreset.preset.minutes)).toBe(4);
 await card.getByRole('link',{name:'따라 하기'}).click();await expect(page.locator('.gp-screen h2')).toHaveText('가사 자음 또렷하게 읽기');await expect(page.locator('.gp-instruction h3')).toHaveText('가사 한 줄을 읽어요.');
});

test('v4 IA: 보관함 survives as 내 곡 › 전체 녹음 with the old route and no data change', async ({page}) => {
 await boot(page);
 const nav=page.locator('.v-nav');
 await page.goto('/#/songs');await expect(nav.locator('a[data-nav="library"]')).toHaveCount(0);
 await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('data-nav','songs');
 const sw=page.getByRole('navigation',{name:'내 곡 보기'});
 await expect(sw.getByRole('link')).toHaveText(['곡별','전체 녹음']);await expect(sw.getByRole('link',{name:'곡별'})).toHaveAttribute('aria-current','page');
 const before=await page.evaluate(()=>localStorage.getItem('vocal-zip_mvp_v1'));
 await sw.getByRole('link',{name:'전체 녹음'}).click();await expect(page).toHaveURL(/#\/library$/);
 await expect(page.locator('#top h1')).toHaveText('내 곡');
 await expect(page.getByRole('navigation',{name:'내 곡 보기'}).getByRole('link',{name:'전체 녹음'})).toHaveAttribute('aria-current','page');
 await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('data-nav','songs');
 for(const [route,tab] of [['calendar','calendar'],['homework','calendar'],['performances','calendar'],['vocal-growth','growth']]){
  await page.goto('/#/'+route);await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('data-nav',tab);
 }
 expect(await page.evaluate(()=>localStorage.getItem('vocal-zip_mvp_v1'))).toBe(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
