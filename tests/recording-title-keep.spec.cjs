// Audit P0: a title the user typed for a recording is never replaced by an automatic one, from any path.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const seed = () => ({categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[],
  songs:[{id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드', aliases:['모먼트'], arLinks:[{id:'a1', label:'원곡', url:'https://example.com/original'}]}, {id:'s2', title:'On My Own', show:''}]});
const CREATED = new Date(2026, 10, 8, 21, 30).getTime();
const takes = [
  // Typed in the recorder's 제목 field before titles were marked: no nameMode.
  {id:'typed', name:'1절 고음 good', source:'practice', songId:'s1', song:'This Is the Moment — 지킬 앤 하이드', review:'호흡 확인'},
  {id:'manual', name:'오디션 제출용', nameMode:'manual', autoName:null, source:'import', originalFilename:'SODA_1.wav', songId:'s1', song:'This Is the Moment — 지킬 앤 하이드', review:''},
  {id:'auto', name:'This Is the Moment 2026.11.08', nameMode:'auto', autoName:'This Is the Moment 2026.11.08', source:'import', originalFilename:'SODA_2.wav', songId:'s1', song:'This Is the Moment — 지킬 앤 하이드', review:'메모'},
  {id:'file', name:'SODA_3', nameMode:'auto', autoName:'SODA_3', source:'import', originalFilename:'SODA_3.wav', songId:'', song:'', review:''}
];
async function boot(page, {media = true} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed())]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
  if (!media) return;
  await page.evaluate(async ([rows, created]) => {
    for (const row of rows) await window.vzipStorePracticeMedia({...row, created, recordedDate:'2026-11-08', dateSource:'recorded', type:'audio/wav', blob:new Blob([new Uint8Array(44)], {type:'audio/wav'}), durationSeconds:1});
    window.dispatchEvent(new Event('vzip:media-updated'));
  }, [takes, CREATED]);
  await page.waitForTimeout(500);
}
const stored = (page, id) => page.evaluate(async id => { const {blob, ...rest} = (await window.vzipReadMedia()).find(m => m.id === id); return rest; }, id);
const sheet = page => page.locator('.sheet');
const edit = (page, id) => page.evaluate(async id => VZ.editMedia((await VZ.media.list(true)).find(m => m.id === id)), id);
const save = async page => { await sheet(page).getByRole('button', {name:'저장', exact:true}).click(); await expect(sheet(page)).toHaveCount(0); };

test.describe('녹음 정보 수정', () => {
  for (const id of ['typed', 'manual']) test('별점만 저장해도 직접 쓴 제목과 메모는 그대로예요 (' + id + ')', async ({page}) => {
    await boot(page);
    const before = await stored(page, id);
    await edit(page, id);
    await expect(sheet(page).locator('[name=name]')).toHaveValue(before.name);
    await sheet(page).locator('[data-star="4"]').click();
    await save(page);
    const after = await stored(page, id);
    expect(after).toEqual({...before, rating:4});
    expect(page.__errors).toEqual([]);
  });
  test('메모·날짜만 고쳐도 직접 쓴 제목은 그대로이고, 고친 값만 저장돼요', async ({page}) => {
    await boot(page);
    const before = await stored(page, 'typed');
    await edit(page, 'typed');
    await sheet(page).locator('[name=review]').fill('호흡 확인\n후렴 다시');
    await sheet(page).locator('[name=date]').fill('2026-11-09');
    await sheet(page).locator('[name=date]').dispatchEvent('change');
    await expect(sheet(page).locator('[name=name]')).toHaveValue('1절 고음 good');
    await save(page);
    expect(await stored(page, 'typed')).toEqual({...before, review:'호흡 확인\n후렴 다시', recordedDate:'2026-11-09', dateSource:'manual', created:new Date(2026, 10, 9, 21, 30).getTime()});
  });
  test('곡을 바꿔도 직접 쓴 제목은 그대로예요', async ({page}) => {
    await boot(page);
    for (const id of ['typed', 'manual']) {
      const before = await stored(page, id);
      await edit(page, id);
      await sheet(page).locator('[name=song]').selectOption('s2');
      await expect(sheet(page).locator('[name=name]')).toHaveValue(before.name);
      await save(page);
      expect(await stored(page, id)).toEqual({...before, songId:'s2', song:'On My Own', songSource:'user'});
    }
  });
  test('아무것도 바꾸지 않고 저장하면 자동 제목도 그대로예요', async ({page}) => {
    await boot(page);
    // An automatic title whose song was renamed later: only a song or date change moves it.
    await page.evaluate(() => VZ.change(d => { d.songs.find(s => s.id === 's1').title = 'This Is The Moment (KR)'; }, {silent:true}));
    const before = await stored(page, 'auto');
    await edit(page, 'auto');
    await expect(sheet(page).locator('[name=name]')).toHaveValue(before.name);
    await sheet(page).locator('[data-star="5"]').click();
    await save(page);
    expect(await stored(page, 'auto')).toEqual({...before, rating:5});
  });
  test('자동 제목은 곡·날짜를 바꾸면 전처럼 따라 바뀌고 이전 제목이 메모에 남아요', async ({page}) => {
    await boot(page);
    await edit(page, 'auto');
    await sheet(page).locator('[name=song]').selectOption('s2');
    await expect(sheet(page).locator('[name=name]')).toHaveValue('On My Own 2026.11.08');
    await save(page);
    expect(await stored(page, 'auto')).toMatchObject({name:'On My Own 2026.11.08', nameMode:'auto', autoName:'On My Own 2026.11.08', songId:'s2', review:'메모\n이전 제목: This Is the Moment 2026.11.08'});
    await edit(page, 'file');
    await sheet(page).locator('[name=song]').selectOption('s1');
    await expect(sheet(page).locator('[name=name]')).toHaveValue('This Is the Moment 2026.11.08');
    await save(page);
    expect(await stored(page, 'file')).toMatchObject({name:'This Is the Moment 2026.11.08', nameMode:'auto', songId:'s1', review:'이전 제목: SODA_3'});
  });
});

test('일괄 곡 지정·곡 확인 적용은 직접 쓴 제목을 바꾸지 않고, 자동 제목만 바꿔요', async ({page}) => {
  await boot(page);
  const before = {typed:await stored(page, 'typed'), manual:await stored(page, 'manual')};
  await page.evaluate(async () => {
    // The call 일괄 곡 지정 (library-select.js) and 곡 확인 적용 (song-suggestions.js) both make.
    for (const m of await VZ.media.list(true)) await VZ.media.assignSongSafe(m, {songId:'s2', song:'On My Own'}, {expectedSongId:m.songId || '', expectedSong:m.song || ''});
  });
  expect(await stored(page, 'typed')).toEqual({...before.typed, songId:'s2', song:'On My Own'});
  expect(await stored(page, 'manual')).toEqual({...before.manual, songId:'s2', song:'On My Own'});
  expect(await stored(page, 'auto')).toMatchObject({name:'On My Own 2026.11.08', review:'메모\n이전 제목: This Is the Moment 2026.11.08'});
  expect(await stored(page, 'file')).toMatchObject({name:'On My Own 2026.11.08', review:'이전 제목: SODA_3'});
});

test('녹음 화면에서 직접 쓴 제목은 직접 쓴 제목으로 저장돼요', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'Fake capture devices are Chromium-only.');
  await boot(page, {media:false});
  const record = async title => {
    await page.goto('/#/home');
    await page.goto('/#/record?song=s2');
    await page.getByRole('button', {name:'녹음 시작'}).click();
    await expect(page.getByRole('button', {name:'녹음 종료'})).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole('button', {name:'녹음 종료'}).click();
    await expect(page.locator('[data-review] [data-p] .player')).toBeVisible();
    if (title) await page.locator('[data-review] [name=name]').fill(title);
    await page.locator('[data-review] [data-save]').click();
    await expect(page.getByText('저장했어요', {exact:true})).toBeVisible();
  };
  await record('2절 브릿지 연습');
  const typed = (await page.evaluate(() => window.vzipReadMedia())).find(m => m.name === '2절 브릿지 연습');
  expect(typed).toMatchObject({nameMode:'manual', songId:'s2'});
  await page.evaluate(async id => { const m = (await VZ.media.list(true)).find(x => x.id === id); await VZ.media.assignSongSafe(m, {songId:'s1', song:'This Is the Moment'}, {expectedSongId:'s2', expectedSong:m.song || ''}); }, typed.id);
  expect((await page.evaluate(() => window.vzipReadMedia())).find(m => m.id === typed.id)).toMatchObject({name:'2절 브릿지 연습', songId:'s1'});
  // The suggested song-and-day title stays an automatic one.
  await record('');
  const auto = (await page.evaluate(() => window.vzipReadMedia())).find(m => m.id !== typed.id);
  expect(auto.name).toMatch(/^On My Own \d{4}\.\d{2}\.\d{2}$/);
  expect(auto.nameMode).not.toBe('manual');
});
