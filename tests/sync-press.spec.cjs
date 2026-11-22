// About 0.9 s after a save, cloud-sync.js reads the server copy, merges and — when the merged copy differs from the
// device copy — stores it and announces vzip:data-changed ('cloud-merge'), which redraws the screen. A redraw replaces
// the buttons: a press that began before it and ends after it was dropped ("I tapped and nothing happened" right after
// saving, on a phone). So:
//  - a merge that brings nothing new (the usual case after this device's own save) is not stored or announced;
//  - a merge that does change the device copy waits while a pointer is down, until the click after its release;
//  - a change from another device still shows — after the release, a cancelled touch, or at the latest after the limit.
// The server is a stub that keeps one vocal_data row with the same conditional writes as PostgREST. Fake data only.
const {test, expect} = require('@playwright/test');
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.__remote={row:null,reads:0,writes:0};
const copy=x=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>({
 auth:{getUser:async()=>({data:{user:{id:'A',email:'a@test.invalid'}}}),getSession:async()=>({data:{session:{access_token:'test-token'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 rpc:async name=>({data:name==='vzip_register_session'||name==='vzip_list_sessions'?{status:'active',current_session:'here',sessions:[{session_id:'here',label:'test'}],revision:1,limit:2}:true,error:null}),
 from:table=>{
  const q={},filters={};let write=null;
  for(const m of ['select','order','range','in','maybeSingle'])q[m]=()=>q;
  for(const m of ['eq','is'])q[m]=(k,v)=>{filters[k]=v;return q;};
  for(const m of ['upsert','insert','update','delete'])q[m]=body=>{write={method:m,body};return q;};
  q.then=resolve=>{
   const R=window.__remote;
   if(table!=='vocal_data')return resolve({data:[],error:null});
   if(!write){R.reads++;return resolve({data:R.row?copy(R.row):null,error:null});}
   if(write.method==='upsert'){if(R.row)return resolve({data:[],error:null});R.row=copy({payload:write.body.payload,updated_at:write.body.updated_at});R.writes++;return resolve({data:[{user_id:'A'}],error:null});}
   if(write.method==='update'){if(!R.row||filters.updated_at!==R.row.updated_at)return resolve({data:[],error:null});R.row=copy(write.body);R.writes++;return resolve({data:[{user_id:'A'}],error:null});}
   return resolve({data:[],error:null});
  };
  return q;
 },
 storage:{from:()=>({})}
})};`;
const SEED = {categories:[{id:'c1', name:'발성', items:['립트릴']}], songs:[{id:'s1', title:'On My Own', show:'레 미제라블', updatedAt:100}], lessons:[], assignments:[], practices:[], comparisonReports:[]};

/** Signed in, first sync done, on the song list. `scoped` is the released setup (one account per browser storage). */
async function boot(page, scoped) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([key, seed, scoped]) => {
    window.VZIP_DEVICE_SESSIONS_ENABLED = scoped; window.VZIP_APPROVED_HOME_ENABLED = false;
    window.__merges = 0;
    window.addEventListener('vzip:data-changed', e => { if (e.detail?.source === 'cloud-merge') window.__merges++; });
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (scoped) { localStorage.setItem('vzip_account_scope_owner_v1', 'A'); localStorage.setItem('vzip_account_v1:A:' + key, seed); localStorage.setItem('vzip_account_v1:A:vzip_account_dirty', '1'); }
    else { localStorage.setItem(key, seed); localStorage.setItem('vzip_cloud_linked_user', 'A'); }
  }, [KEY, JSON.stringify(SEED), scoped]);
  await page.goto('/#/songs');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('[data-l] a')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__remote.writes)).toBe(1);   // the first sync stored the seed
  await expect(page.locator('#cloud-status')).toContainText('합쳐 저장했어요');
  await page.evaluate(() => {
    window.__draws = 0; const render = VZ.render; VZ.render = function () { window.__draws++; return render.apply(this, arguments); };
    window.__clicks = 0; document.addEventListener('click', e => { if (e.target.closest?.('[data-l] a')) window.__clicks++; }, true);
  });
  // Whatever start-up still redraws (lists that arrive late) is over before a test counts redraws: half a second without one.
  await expect.poll(async () => { const n = await page.evaluate(() => window.__draws); await page.waitForTimeout(500); return await page.evaluate(() => window.__draws) - n; }, {timeout:10000}).toBe(0);
}
const state = page => page.evaluate(() => ({merges:window.__merges, draws:window.__draws, reads:window.__remote.reads, writes:window.__remote.writes,
  songs:VZ.db.songs.map(s => s.id), server:(window.__remote.row?.payload.songs || []).map(s => s.id)}));
/** A save through the app's store, as every screen saves (VZ.change): returns once the text is stored. */
const save = (page, id = 'mine') => page.evaluate(id => { VZ.change(d => { d.songs.push({id, title:'내가 추가한 곡'}); }, {silent:true}); }, id);
/** Another device saved a song: it is on the server only. */
const remoteSong = (page, id = 'theirs') => page.evaluate(id => {
  const row = window.__remote.row; row.payload.songs.push({id, title:'다른 기기에서 추가한 곡', updatedAt:Date.now()});
  row.updated_at = new Date(Date.parse(row.updated_at) + 1000).toISOString();
}, id);
/** The sync that follows a save has read the server copy and had time to act on it. */
async function syncRead(page, reads) {
  await expect.poll(() => page.evaluate(() => window.__remote.reads), {timeout:8000}).toBeGreaterThan(reads);
  await page.waitForTimeout(400);
}
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

for (const scoped of [true, false]) test.describe(scoped ? '계정별 저장소' : '이전 저장 방식', () => {
  test('저장 뒤의 동기화는 달라진 것이 없으면 화면을 다시 그리지 않아요', async ({page}) => {
    await boot(page, scoped);
    // The first save after signing in is the one whose merge used to differ in text only (an empty `deleted` added).
    for (const id of ['mine-1', 'mine-2']) {
      const row = await page.locator('[data-l] a').first().elementHandle(), before = await state(page);
      await save(page, id);
      await expect.poll(async () => (await state(page)).writes, {timeout:8000}).toBe(before.writes + 1);
      await page.waitForTimeout(300);
      const after = await state(page);
      expect(after.server).toContain(id);                                   // the save reached the server
      expect({merges:after.merges - before.merges, draws:after.draws - before.draws}).toEqual({merges:0, draws:0});
      expect(await row.evaluate(el => el.isConnected)).toBe(true);          // the row under a finger is still the same row
    }
    // Nothing was stored again either: no copy "before the cloud merge" was spent on it, and the store is what the app saved.
    expect(await page.evaluate(([k, scoped]) => {
      const prefix = scoped ? 'vzip_account_v1:A:' : '';
      return {copies:Object.keys(localStorage).filter(x => x.startsWith(prefix + 'vzip_before_cloud_')).length, same:localStorage.getItem(prefix + k) === JSON.stringify(VZ.db)};
    }, [KEY, scoped])).toEqual({copies:0, same:true});
  });

  test('저장 직후 누르고 있는 동안 동기화가 끝나도, 손을 떼면 누른 것이 한 번 실행돼요', async ({page}) => {
    await boot(page, scoped);
    await remoteSong(page);                                   // so this sync has something to redraw
    const row = page.locator('[data-l] a').first(), handle = await row.elementHandle(), box = await row.boundingBox();
    const before = await state(page);
    await save(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await syncRead(page, before.reads);
    // Held: the merged copy is not stored yet, nothing was redrawn, the row is the one that was pressed.
    const held = await state(page);
    expect({merges:held.merges, draws:held.draws, songs:held.songs}).toEqual({merges:before.merges, draws:before.draws, songs:['s1', 'mine']});
    expect(await handle.evaluate(el => el.isConnected)).toBe(true);
    await page.mouse.up();
    // The press counted once: the song opened.
    await expect(page).toHaveURL(/#\/song\/s1$/);
    expect(await page.evaluate(() => window.__clicks)).toBe(1);
    // And the other device's song was not lost by waiting: it is merged in, stored and on the server with ours.
    await expect.poll(async () => (await state(page)).songs, {timeout:8000}).toEqual(['s1', 'mine', 'theirs']);
    await expect.poll(async () => (await state(page)).server, {timeout:8000}).toEqual(['s1', 'mine', 'theirs']);
    await page.goBack();
    await expect(page.locator('[data-l]')).toContainText('다른 기기에서 추가한 곡');
    expect(await page.evaluate(() => window.__clicks)).toBe(1);
  });

  test('다른 기기에서 바뀐 것은 그대로 화면에 나타나요', async ({page}) => {
    await boot(page, scoped);
    await remoteSong(page);
    const before = await state(page);
    await save(page);
    await expect(page.locator('[data-l]')).toContainText('다른 기기에서 추가한 곡', {timeout:8000});
    await expect(page.locator('[data-l] a')).toHaveCount(3);
    const after = await state(page);
    expect(after.merges).toBe(before.merges + 1);
    expect(after.songs).toEqual(['s1', 'mine', 'theirs']);
    await expect.poll(async () => (await state(page)).server).toEqual(['s1', 'mine', 'theirs']);
    // The device copy from before the merge is kept, as before.
    expect(await page.evaluate(scoped => Object.keys(localStorage).filter(x => x.startsWith((scoped ? 'vzip_account_v1:A:' : '') + 'vzip_before_cloud_')).length, scoped)).toBe(1);
  });
});

// A touch that turns into a scroll ends with pointercancel and no click; a release can also go unreported. Neither may
// hold a change from another device back for good. Touches are sent as the pointer events the page would receive.
const pointer = (page, type, id = 7) => page.evaluate(([type, id]) => { document.body.dispatchEvent(new PointerEvent(type, {pointerId:id, pointerType:'touch', isPrimary:true, bubbles:true})); }, [type, id]);
test('스크롤로 바뀐 터치(pointercancel)는 기다리게 하지 않아요', async ({page}) => {
  await boot(page, true);
  await remoteSong(page);
  const before = await state(page);
  await save(page);
  await pointer(page, 'pointerdown');
  await syncRead(page, before.reads);
  expect((await state(page)).merges).toBe(before.merges);
  await pointer(page, 'pointercancel');
  await expect(page.locator('[data-l]')).toContainText('다른 기기에서 추가한 곡', {timeout:2000});
});
test('손을 뗀 것이 전해지지 않아도 다른 기기의 변경은 몇 초 뒤에 나타나요', async ({page}) => {
  await boot(page, true);
  await remoteSong(page);
  const before = await state(page);
  await save(page);
  await pointer(page, 'pointerdown');
  await syncRead(page, before.reads);
  expect((await state(page)).merges).toBe(before.merges);
  await expect(page.locator('[data-l]')).toContainText('다른 기기에서 추가한 곡', {timeout:9000});   // the wait is limited to 5 s
  await expect.poll(async () => (await state(page)).server, {timeout:8000}).toEqual(['s1', 'mine', 'theirs']);
});
test('손을 떼고 클릭이 오지 않아도(끌다가 놓음) 잠시 뒤에 나타나요', async ({page}) => {
  await boot(page, true);
  await remoteSong(page);
  const before = await state(page);
  await save(page);
  await pointer(page, 'pointerdown');
  await syncRead(page, before.reads);
  await pointer(page, 'pointerup');
  await expect(page.locator('[data-l]')).toContainText('다른 기기에서 추가한 곡', {timeout:2000});
});
