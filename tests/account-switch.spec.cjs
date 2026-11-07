// Account switch on one device (shared iPad, family phone): one account's device records and recordings never go
// into another account's cloud unless the person chooses to merge them (device-accounts.js, cloud-sync.js hold screen).
const {test, expect} = require('@playwright/test');
const KEY = 'vocal-zip_mvp_v1';

// Supabase stand-in with several accounts. The server copy lives in a test-only localStorage key so it survives
// reloads; '__who' is the signed-in account. Every write is logged in __srv.writes.
const stub = `(()=>{
const load=()=>JSON.parse(localStorage.getItem('__srv')||'{"users":{},"writes":[]}');
const save=s=>localStorage.setItem('__srv',JSON.stringify(s));
const who=()=>localStorage.getItem('__who');
const userOf=id=>id?{id,email:id+'@example.invalid'}:null;
const cbs=[];const emit=(ev)=>{const u=userOf(who());cbs.forEach(cb=>cb(ev,u?{user:u}:null))};
window.__srvRead=load;
window.supabase={createClient:()=>({
 auth:{getUser:async()=>({data:{user:userOf(who())}}),getSession:async()=>({data:{session:who()?{access_token:'t'}:null}}),
  onAuthStateChange:cb=>{cbs.push(cb);return {data:{subscription:{unsubscribe(){}}}}},
  signInWithPassword:async({email})=>{localStorage.setItem('__who',email.split('@')[0]);setTimeout(()=>emit('SIGNED_IN'));return {error:null}},
  signOut:async()=>{localStorage.removeItem('__who');setTimeout(()=>emit('SIGNED_OUT'));return {error:null}},
  signUp:async()=>({data:{},error:null}),resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null})},
 storage:{from:()=>({upload:async(path)=>{const s=load();s.writes.push({table:'storage',path});save(s);return {error:null}},createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),remove:async()=>({error:null})})},
 rpc:async()=>({data:null,error:null}),
 from:table=>{const c={q:{}};let single=false,upd=null,ups=null;
  for(const m of ['select','order','range','delete','limit','in','neq','gt','lt','not','or','filter','match'])c[m]=()=>c;
  c.eq=(k,v)=>{c.q[k]=v;return c};c.is=c.eq;c.maybeSingle=()=>{single=true;return c};c.single=c.maybeSingle;
  c.update=row=>{upd=row;return c};c.upsert=row=>{ups=row;return c};
  c.then=(res,rej)=>{const s=load();
   if(table==='vocal_data'){const uid=c.q.user_id||ups?.user_id;
    if(ups){s.users[ups.user_id]={payload:ups.payload,updated_at:ups.updated_at};s.writes.push({table,uid:ups.user_id,payload:ups.payload});save(s);return Promise.resolve({data:null,error:null}).then(res,rej)}
    if(upd){const cur=s.users[uid];if(!cur||cur.updated_at!==c.q.updated_at)return Promise.resolve({data:[],error:null}).then(res,rej);
     s.users[uid]={payload:upd.payload,updated_at:upd.updated_at};s.writes.push({table,uid,payload:upd.payload});save(s);return Promise.resolve({data:[{user_id:uid}],error:null}).then(res,rej)}
    return Promise.resolve({data:single?(s.users[uid]?JSON.parse(JSON.stringify(s.users[uid])):null):[],error:null}).then(res,rej)}
   if(ups||upd){s.writes.push({table,row:ups||upd});save(s)}
   return Promise.resolve({data:single?null:[],error:null}).then(res,rej)};
  return c}})};
})();`;

const aliceData = () => ({categories:[{id:'c1', name:'발성', items:['립트릴']}],
  songs:[{id:'alice-song', title:'Alice song'}], lessons:[{id:'alice-lesson', date:'2026-10-01', teacher:'김선생', status:'done', recordings:[]}],
  assignments:[{id:'alice-hw', lessonId:'alice-lesson', lessonIds:['alice-lesson'], title:'립트릴 5분', status:'active'}],
  practices:[{id:'alice-practice', date:'2026-10-02', minutes:20, mediaIds:[], practiceMode:'song', songId:'alice-song', rating:4, memo:'alice memo'}],
  comparisonReports:[]});
const ALICE_IDS = ['alice-song', 'alice-lesson', 'alice-hw', 'alice-practice', 'alice-media', 'alice-lost'];

async function open(page, {who = 'alice', server = {users:{}, writes:[]}, local = aliceData(), init = {}} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  // Uploads are only counted (no network): a device file of one account must never be sent for another.
  await page.addInitScript(() => {
    window.__imports = [];
    let real;
    Object.defineProperty(window, 'vzipCloudImport', {configurable:true, get:() => real && (async (file, info) => { window.__imports.push({id:info.id, who:localStorage.getItem('__who')}); return {...info, path:'x'}; }), set:v => { real = v; }});
  });
  await page.addInitScript(([k, s, w, srv, extra]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (s) localStorage.setItem(k, s);
    if (w) localStorage.setItem('__who', w);
    localStorage.setItem('__srv', srv);
    for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
  }, [KEY, local && JSON.stringify(local), who, JSON.stringify(server), init]);
  await page.goto('/#/home');
}
const local = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const writesFor = (page, uid) => page.evaluate(u => window.__srvRead().writes.filter(w => w.table === 'vocal_data' && w.uid === u).map(w => w.payload), uid);
const ids = data => !data ? [] : ['songs', 'lessons', 'assignments', 'practices'].flatMap(k => (data[k] || []).map(x => x.id));
const listIds = page => page.evaluate(async () => (await window.VZ.media.list(true)).map(m => m.id));
async function storeMedia(page, id) {
  await page.evaluate(async id => {
    const sr = 8000, buf = new ArrayBuffer(44 + sr * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + sr * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, sr * 2, true);
    await window.vzipStorePracticeMedia({id, name:id, created:Date.now(), type:'audio/wav', source:'practice', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:1});
  }, id);
}
async function logout(page) { await page.evaluate(() => document.querySelector('#cloud-logout').click()); await expect(page.locator('#vzip-auth-screen')).toBeVisible(); }
async function login(page, who) {
  await page.locator('#cloud-email').fill(who + '@example.invalid');
  await page.locator('#cloud-password').fill('password-123');
  await page.locator('#cloud-login').click();
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
}
/** Signed in as alice, her device records synced, her recording kept on this device only. */
async function aliceDevice(page, opts = {}) {
  await open(page, opts);
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vzip_cloud_linked_user'))).toBe('alice');
  // Upload stays off while alice's recording is stored, so it is a device-only file (as when offline).
  await page.evaluate(() => { window.__realSignedIn = window.vzipCloudSignedIn; window.vzipCloudSignedIn = () => false; });
  await storeMedia(page, 'alice-media');
  await page.evaluate(() => { window.vzipCloudSignedIn = window.__realSignedIn; });
}

test('Another account logging in on this device gets nothing of the previous account until a choice is made', async ({page}) => {
  const bob = {payload:{categories:[], songs:[{id:'bob-song', title:'Bob song'}], lessons:[], assignments:[], practices:[]}, updated_at:'2026-11-01T00:00:00.000Z'};
  // An old snapshot of alice's records (kept before an earlier cloud merge): song recovery may bring it back for
  // alice (the device's first owner), never for bob.
  const old = JSON.stringify({...aliceData(), songs:[{id:'alice-lost', title:'Alice lost song'}]});
  await aliceDevice(page, {server:{users:{bob}, writes:[]}, init:{['vzip_before_cloud_' + (Date.now() - 864e5)]:old}});
  expect(ids(await local(page))).toContain('alice-song');
  await page.evaluate(() => { window.__imports.length = 0; });

  await logout(page);
  // Logging out erases nothing.
  expect(ids(await local(page))).toContain('alice-lesson');
  await login(page, 'bob');
  const hold = page.locator('#vzip-account-hold');
  await expect(hold).toBeVisible();
  await expect(hold).toContainText('다른 계정(al***@example.invalid)');
  await expect(hold).toContainText('녹음 1개');
  // Held: no merge, no upload, no device file listed, no song recovery from alice's snapshot (background timers included).
  await page.waitForTimeout(5500);
  expect(await writesFor(page, 'bob')).toEqual([]);
  expect(await page.evaluate(() => window.__imports)).toEqual([]);
  expect(await listIds(page)).not.toContain('alice-media');

  await page.locator('#vzip-hold-keep').click();
  await expect(hold).toBeHidden();
  await expect.poll(async () => ids(await local(page))).toEqual(['bob-song']);
  await page.waitForTimeout(5500);
  for (const payload of await writesFor(page, 'bob')) expect(ids(payload).filter(id => ALICE_IDS.includes(id))).toEqual([]);
  expect(await page.evaluate(() => window.__imports.map(x => x.id))).not.toContain('alice-media');
  expect(await listIds(page)).not.toContain('alice-media');
  expect(ids(await local(page))).not.toContain('alice-lost');
  // Still apart after a reload.
  await page.reload();
  await expect(page.locator('#vzip-account-hold')).toHaveCount(0);
  await expect.poll(async () => ids(await local(page))).toEqual(['bob-song']);
  expect(await listIds(page)).not.toContain('alice-media');

  // Alice comes back: her device records and recording return; bob's are kept for bob.
  await logout(page);
  await login(page, 'alice');
  await expect(hold).toBeVisible();
  await expect(hold).toContainText('보관해 두었어요');
  await page.locator('#vzip-hold-keep').click();
  await expect(hold).toBeHidden();
  await expect.poll(async () => ids(await local(page)).sort()).toEqual(['alice-hw', 'alice-lesson', 'alice-lost', 'alice-practice', 'alice-song']);
  expect(await listIds(page)).toContain('alice-media');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vzip_device_owner_v1')).id)).toBe('alice');
  for (const payload of await writesFor(page, 'alice')) expect(ids(payload)).not.toContain('bob-song');
  expect(page.__errors).toEqual([]);
});

test('Merging the device records into the new account happens only when chosen', async ({page}) => {
  await aliceDevice(page);
  await logout(page);
  await login(page, 'bob');
  await expect(page.locator('#vzip-account-hold')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await writesFor(page, 'bob')).toEqual([]);
  await page.locator('#vzip-hold-merge').click(); // the confirm dialog is accepted
  await expect(page.locator('#vzip-account-hold')).toBeHidden();
  await expect.poll(async () => ids((await writesFor(page, 'bob')).at(-1))).toContain('alice-lesson');
  await expect.poll(() => page.evaluate(() => window.__imports.filter(x => x.who === 'bob').map(x => x.id)), {timeout:10000}).toContain('alice-media');
});

test('The same account logging in again, an empty device, and log out from the hold screen are not held', async ({page}) => {
  await aliceDevice(page);
  await logout(page);
  await login(page, 'alice');
  await expect(page.locator('#vzip-account-hold')).toHaveCount(0);
  expect(ids(await local(page))).toContain('alice-song');

  // Log out from the hold screen: still nothing sent for bob.
  await logout(page);
  await login(page, 'bob');
  await expect(page.locator('#vzip-account-hold')).toBeVisible();
  await page.locator('#vzip-hold-logout').click();
  await expect(page.locator('#vzip-auth-screen')).toBeVisible();
  expect(await writesFor(page, 'bob')).toEqual([]);
  expect(ids(await local(page))).toContain('alice-song');
});

test('A device that holds nothing of the previous account simply changes hands', async ({page}) => {
  await open(page, {who:'bob', local:null, init:{vzip_device_owner_v1:JSON.stringify({id:'alice', email:'al***@example.invalid', since:1})}});
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('vzip_device_owner_v1')).id)).toBe('bob');
  await expect(page.locator('#vzip-account-hold')).toBeHidden();
});

test('A device from before this protection (only the last linked account known) is held too', async ({page}) => {
  // Older versions removed the link at logout, but a device whose session simply changed still has it.
  await open(page, {who:'bob', init:{vzip_cloud_linked_user:'alice'}});
  await expect(page.locator('#vzip-account-hold')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await writesFor(page, 'bob')).toEqual([]);
  expect(ids(await local(page))).toContain('alice-lesson');
});
