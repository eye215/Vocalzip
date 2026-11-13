// Audit P0: 곡 정보 수정 opens and saves the current song, never the copy the song screen was opened with.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const seed = () => ({categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[],
  songs:[{id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드', aliases:['모먼트'], arLinks:[{id:'a1', label:'원곡', url:'https://example.com/original'}]}, {id:'s2', title:'On My Own', show:''}]});
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
}
const sheet = page => page.locator('.sheet');

test.describe('곡 정보 수정', () => {
  // Another device's change arrives the way sync delivers it: new stored data, then vzip:data-changed.
  const synced = (page, change) => page.evaluate(([k, body]) => {
    const d = JSON.parse(localStorage.getItem(k)); new Function('d', body)(d);
    localStorage.setItem(k, JSON.stringify(d)); window.dispatchEvent(new Event('vzip:data-changed'));
  }, [KEY, change]);
  const fromOtherDevice = "const s=d.songs.find(x=>x.id==='s1');s.title='지금 이 순간';s.show='지킬 앤 하이드 (2026)';s.aliases=['모먼트','지금이순간'];s.arLinks.push({id:'a2',label:'새 AR',url:'https://example.com/new-ar'});";
  const openEdit = async page => {
    await page.locator('[data-song-menu]').click();
    await page.locator('.sheet [data-e]').click();
    await expect(sheet(page).locator('#song-form')).toBeVisible();
  };
  const song = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.find(s => s.id === 's1'), KEY);

  test('다른 기기에서 고친 곡이 들어오면 화면과 수정 창이 새 내용을 보여주고, 저장해도 지워지지 않아요', async ({page}) => {
    await boot(page);
    await page.goto('/#/song/s1');
    await expect(page.locator('.vz-song-detail-title')).toHaveText('This Is the Moment');
    await synced(page, fromOtherDevice);
    await expect(page.locator('.vz-song-detail-title')).toHaveText('지금 이 순간');
    await openEdit(page);
    await expect(sheet(page).locator('[name=title]')).toHaveValue('지금 이 순간');
    await expect(sheet(page).locator('[name=show]')).toHaveValue('지킬 앤 하이드 (2026)');
    await expect(sheet(page).locator('[name=aliases]')).toHaveValue('모먼트, 지금이순간');
    await expect(sheet(page).locator('[data-ar-url]')).toHaveCount(2);
    await sheet(page).locator('[name=title]').fill('지금 이 순간 (한국어)');
    await sheet(page).getByRole('button', {name:'저장', exact:true}).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await song(page)).toMatchObject({title:'지금 이 순간 (한국어)', show:'지킬 앤 하이드 (2026)', aliases:['모먼트', '지금이순간'],
      arLinks:[{id:'a1', label:'원곡', url:'https://example.com/original'}, {id:'a2', label:'새 AR', url:'https://example.com/new-ar'}]});
    // The screen shows what was just saved, and the new link under 레퍼런스.
    await expect(page.locator('.vz-song-detail-title')).toHaveText('지금 이 순간 (한국어)');
    await page.locator('[data-tab="ar"]').click();
    await expect(page.locator('.vz-ar-item')).toHaveCount(2);
    await synced(page, "d.songs.find(x=>x.id==='s1').arLinks.push({id:'a3',label:'세 번째',url:'https://example.com/third'});");
    await expect(page.locator('.vz-ar-item')).toHaveCount(3);
    expect(page.__errors).toEqual([]);
  });
  test('화면을 다시 그리지 못하는 동안 들어온 변경도 수정 창에 보이고, 저장해도 남아요', async ({page}) => {
    await boot(page);
    await page.goto('/#/song/s1');
    await expect(page.locator('.vz-song-detail-title')).toHaveText('This Is the Moment');
    // A background refresh waits while a menu is open (and during playback or selection): the screen keeps its old copy.
    await page.locator('[data-song-menu]').click();
    await expect(page.locator('.sheet [data-e]')).toBeVisible();
    await synced(page, fromOtherDevice);
    await page.locator('.sheet [data-e]').click();
    await expect(sheet(page).locator('#song-form')).toBeVisible();
    await expect(sheet(page).locator('[name=title]')).toHaveValue('지금 이 순간');
    await expect(sheet(page).locator('[data-ar-url]')).toHaveCount(2);
    await sheet(page).locator('[name=aliases]').fill('모먼트, 지금이순간, 순간');
    await sheet(page).getByRole('button', {name:'저장', exact:true}).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await song(page)).toMatchObject({title:'지금 이 순간', show:'지킬 앤 하이드 (2026)', aliases:['모먼트', '지금이순간', '순간']});
    expect((await song(page)).arLinks.map(l => l.id)).toEqual(['a1', 'a2']);
    await expect(page.locator('.vz-song-detail-title')).toHaveText('지금 이 순간');
  });
  test('다른 기기에서 삭제된 곡은 수정 창 대신 안내를 보여줘요', async ({page}) => {
    await boot(page);
    await page.goto('/#/song/s1');
    await page.locator('[data-song-menu]').click();
    await expect(page.locator('.sheet [data-e]')).toBeVisible();
    await synced(page, "d.songs=d.songs.filter(x=>x.id!=='s1');");
    await page.locator('.sheet [data-e]').click();
    await expect(page.locator('#song-form')).toHaveCount(0);
    await expect(page.locator('#view')).toContainText('곡을 찾을 수 없어요. 삭제됐을 수 있어요.');
    expect((await page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.map(s => s.id), KEY))).toEqual(['s2']);
  });
});
