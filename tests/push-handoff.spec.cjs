// 휴대폰으로 녹음 알림 (app/push-handoff.js, share-worker.js, cloud-sync.js vzipCloudPush): the 설정 switch appears only
// when the server is set up; turning it on asks for permission, subscribes and registers THIS device; off unregisters;
// an iPhone outside the home-screen app is told where to turn it on; 휴대폰으로 녹음 also asks for a notification.
// Fake server, fake push service and fake permission: no live account, key or notification.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const seed = {categories:[], songs:[{id:'s1', title:'This Is the Moment'}], lessons:[], assignments:[], practices:[], performances:[], comparisonReports:[], dailyGoals:[], practicePlans:[]};
async function boot(page, {available = true, ready = true} = {}) {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.addInitScript(([key, value, available, ready]) => {
    if (!sessionStorage.getItem('ph-seeded')) { localStorage.setItem(key, value); localStorage.setItem('vzip_device_id', 'pad-1'); sessionStorage.setItem('ph-seeded', '1'); }
    // The browser's side: permission and the push service.
    window.__calls = [];
    const sub = {endpoint:'https://push.example/abc', toJSON:() => ({endpoint:'https://push.example/abc', keys:{p256dh:'p'.repeat(40), auth:'a'.repeat(16)}}), unsubscribe:async () => { window.__calls.push(['unsubscribe']); return true; }};
    let current = null;
    const pushManager = {getSubscription:async () => current, subscribe:async opts => { window.__calls.push(['subscribe', opts.userVisibleOnly, opts.applicationServerKey?.length]); current = sub; return sub; }};
    window.PushManager ||= function PushManager() {};
    window.Notification = {permission:'default', requestPermission:async () => { window.__calls.push(['permission']); window.Notification.permission = 'granted'; return 'granted'; }};
    Object.defineProperty(navigator, 'serviceWorker', {configurable:true, value:{ready:Promise.resolve({pushManager}), register:async () => ({}), addEventListener() {}}});
    // The server's side (cloud-sync.js would call the edge function and the two database functions).
    const fake = {status:async () => available ? {available:true, publicKey:'BElpZ' + 'A'.repeat(82)} : {available:false},
      register:async (json, id, name) => { window.__calls.push(['register', json.endpoint, id, name]); return true; },
      unregister:async endpoint => { window.__calls.push(['unregister', endpoint]); return true; },
      send:async payload => { window.__calls.push(['send', payload.songId, payload.title, payload.from]); return {sent:1, devices:1}; }};
    Object.defineProperty(window, 'vzipCloudPush', {configurable:true, get:() => fake, set() {}});
    window.vzipCloudDeviceSend = async () => false;
    window.VZIP_PUSH_READY = ready;   // the server is set up (push-handoff.js SERVER_READY)
  }, [KEY, JSON.stringify(seed), available, ready]);
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
}
const calls = page => page.evaluate(() => window.__calls);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('설정 › 알림: on asks permission, subscribes and registers this device; off unregisters it', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/settings'; });
  const row = page.locator('[data-push-row]');
  await expect(row).toBeVisible();
  await expect(page.locator('[data-settings-group="notify"] h2')).toHaveText('알림');
  await expect(row).toContainText('꺼짐');
  await row.locator('[data-push-toggle]').click();
  await expect(row.locator('[data-push-toggle]')).toHaveAttribute('aria-checked', 'true');
  await expect(row).toContainText('켜짐');
  expect(await calls(page)).toEqual([['permission'], ['subscribe', true, 65], ['register', 'https://push.example/abc', 'pad-1', expect.any(String)]]);
  expect(await page.evaluate(() => localStorage.getItem('vzip_push_handoff_on'))).toBe('1');
  await row.locator('[data-push-toggle]').click();
  await expect(row.locator('[data-push-toggle]')).toHaveAttribute('aria-checked', 'false');
  expect((await calls(page)).slice(-2)).toEqual([['unregister', 'https://push.example/abc'], ['unsubscribe']]);
  expect(await page.evaluate(() => localStorage.getItem('vzip_push_handoff_on'))).toBe(null);
});

test('the 알림 section is always in 설정: when the server does not answer with its key, one line says why (no switch)', async ({page}) => {
  await boot(page, {available:false});
  await page.evaluate(() => { location.hash = '#/settings'; });
  const row = page.locator('[data-settings-group="notify"] [data-push-row]');
  await expect(row).toContainText('알림 서버에 연결하지 못했어요');
  await expect(row.locator('[data-push-toggle]')).toHaveCount(0);
  // It sits just before 공유·점검, once.
  expect(await page.evaluate(() => document.querySelector('[data-settings-group="notify"]').nextElementSibling?.dataset.settingsGroup)).toBe('more');
  await page.evaluate(() => { location.hash = '#/home'; }); await page.evaluate(() => { location.hash = '#/settings'; });
  await expect(page.locator('[data-settings-group="notify"]')).toHaveCount(1);
});

test('signed out: 로그인하면 켤 수 있어요', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { window.vzipCloudPush.status = async () => ({available:false, why:'signed-out'}); location.hash = '#/settings'; });
  await expect(page.locator('[data-push-row]')).toContainText('로그인하면 켤 수 있어요', {timeout:6000});
});

test('설정 opened straight from its address (app start on #/settings) still gets the section', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.reload();
  await expect(page.locator('[data-push-toggle]')).toBeVisible();
});

test('before the server is set up (SERVER_READY off): no row, no request, and 휴대폰으로 녹음 asks for no notification', async ({page}) => {
  await boot(page, {ready:false});
  await page.evaluate(() => { location.hash = '#/settings'; });
  await expect(page.locator('[data-settings-group="more"]')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('[data-push-row]')).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});

test.describe('iPhone in Safari (not the home-screen app)', () => {
  test.use({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', viewport:{width:390, height:844}});
  test('says to turn it on in the app added to the home screen; no switch', async ({page}) => {
    await boot(page);
    await page.evaluate(() => { location.hash = '#/settings'; });
    await expect(page.locator('[data-push-row]')).toContainText('홈 화면에 추가한 VOCAL.zip 앱에서 켤 수 있어요');
    await expect(page.locator('[data-push-toggle]')).toHaveCount(0);
  });
});

test.describe('iPad', () => {
  test.use({userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', viewport:{width:820, height:1180}});
  test('휴대폰으로 녹음 also asks the server to notify the other devices, and says so', async ({page}) => {
    await boot(page);
    await page.evaluate(() => { location.hash = '#/song/s1'; });
    await page.locator('#top [data-record-handoff="s1"]').click();
    await expect(page.locator('[data-rh-sheet]')).toContainText('휴대폰에 알림을 보냈어요');
    expect((await calls(page)).filter(c => c[0] === 'send')).toEqual([['send', 's1', 'This Is the Moment', 'pad-1']]);
  });
});
