// Audit P0: 녹음 정보 수정 saves only what was changed in the sheet. A rating or memo edit never touches the title or the memo;
// a song or date change still renames the title to song + recording day and keeps the old title under the memo (PR #216/#236).
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
async function boot(page) {
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
  for (const id of ['typed', 'manual', 'auto']) test('별점만 저장하면 제목과 메모는 그대로예요 (' + id + ')', async ({page}) => {
    await boot(page);
    const before = await stored(page, id);
    await edit(page, id);
    await expect(sheet(page).locator('[name=name]')).toHaveValue(before.name);
    await sheet(page).locator('[data-star="4"]').click();
    await save(page);
    expect(await stored(page, id)).toEqual({...before, rating:4});
    expect(page.__errors).toEqual([]);
  });
  for (const id of ['typed', 'manual', 'auto']) test('메모만 고치면 제목은 그대로이고 메모에 이전 제목이 붙지 않아요 (' + id + ')', async ({page}) => {
    await boot(page);
    const before = await stored(page, id);
    await edit(page, id);
    await sheet(page).locator('[name=review]').fill('후렴 다시\n호흡 길게');
    await expect(sheet(page).locator('[name=name]')).toHaveValue(before.name);
    await save(page);
    expect(await stored(page, id)).toEqual({...before, review:'후렴 다시\n호흡 길게'});
  });
  test('아무것도 바꾸지 않거나 별점만 바꾸면, 곡 이름이 바뀐 뒤의 자동 제목도 그대로예요', async ({page}) => {
    await boot(page);
    await page.evaluate(() => VZ.change(d => { d.songs.find(s => s.id === 's1').title = 'This Is The Moment (KR)'; }, {silent:true}));
    const before = await stored(page, 'auto');
    await edit(page, 'auto');
    await expect(sheet(page).locator('[name=name]')).toHaveValue(before.name);
    await save(page);
    expect(await stored(page, 'auto')).toEqual(before);
    await edit(page, 'auto');
    await sheet(page).locator('[data-star="5"]').click();
    await save(page);
    expect(await stored(page, 'auto')).toEqual({...before, rating:5});
  });
  test('곡을 바꾸면 전처럼 제목이 곡 + 날짜로 바뀌고 이전 제목이 메모 아래에 남아요', async ({page}) => {
    await boot(page);
    for (const [id, review] of [['manual', '이전 제목: 오디션 제출용'], ['typed', '호흡 확인\n이전 제목: 1절 고음 good'], ['auto', '메모\n이전 제목: This Is the Moment 2026.11.08']]) {
      const before = await stored(page, id);
      await edit(page, id);
      await expect(sheet(page).locator('[name=name]')).toHaveValue(before.name);
      await sheet(page).locator('[name=song]').selectOption('s2');
      const name = await sheet(page).locator('[name=name]').inputValue();
      expect(name).toMatch(/^On My Own 2026\.11\.08( \d+)?$/);
      await save(page);
      expect(await stored(page, id)).toMatchObject({name, nameMode:'auto', autoName:name, songId:'s2', song:'On My Own', songSource:'user', review, created:before.created, recordedDate:'2026-11-08'});
    }
    await edit(page, 'file');
    await sheet(page).locator('[name=song]').selectOption('s1');
    await expect(sheet(page).locator('[name=name]')).toHaveValue('This Is the Moment 2026.11.08');
    await save(page);
    expect(await stored(page, 'file')).toMatchObject({name:'This Is the Moment 2026.11.08', nameMode:'auto', songId:'s1', review:'이전 제목: SODA_3'});
  });
  test('날짜를 바꾸면 전처럼 제목이 따라 바뀌고, 다른 값은 그대로예요', async ({page}) => {
    await boot(page);
    const before = await stored(page, 'manual');
    await edit(page, 'manual');
    await sheet(page).locator('[name=date]').fill('2026-11-09');
    await sheet(page).locator('[name=date]').dispatchEvent('change');
    await expect(sheet(page).locator('[name=name]')).toHaveValue('This Is the Moment 2026.11.09');
    await save(page);
    expect(await stored(page, 'manual')).toEqual({...before, name:'This Is the Moment 2026.11.09', nameMode:'auto', autoName:'This Is the Moment 2026.11.09', review:'이전 제목: 오디션 제출용',
      recordedDate:'2026-11-09', dateSource:'manual', created:new Date(2026, 10, 9, 21, 30).getTime()});
  });
});
