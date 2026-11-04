// R2 storage in the app, against an in-page fake of r2-worker's API (the Worker itself is tested
// with Miniflare in r2-worker/test). Signed-in cloud (Supabase stub) + R2 endpoint configured.
const {test, expect} = require('@playwright/test');
const KEY = 'vocal-zip_mvp_v1', R2 = 'https://r2.vocalzip.test';
const stub = `window.__up=[];window.__removed=[];window.__rows=window.__rows||{};window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'tok'}}})},
 storage:{from:()=>({createSignedUrl:async p=>({data:{signedUrl:'/legacy/'+p},error:null}),upload:async()=>({error:null}),remove:async p=>{window.__removed.push(...p);return {error:null}}})},
 from:()=>{const c={q:{}};for(const m of ['select','order','delete'])c[m]=()=>c;c.eq=(k,v)=>{c.q[k]=v;return c};
  c.upsert=row=>{window.__up.push(row);const r=Array.isArray(row)?row:[row];for(const x of r)if(x&&x.metadata)window.__rows[x.id]=x.metadata;return c};
  c.update=row=>{c.pendingUpdate=row;return c};
  c.maybeSingle=()=>c;c.single=()=>c;
  c.then=r=>{if(c.pendingUpdate&&c.q.id){window.__rows[c.q.id]=c.pendingUpdate.metadata;return r({data:null,error:null})}
   if(c.q.id)return r({data:window.__rows[c.q.id]?{metadata:window.__rows[c.q.id]}:null,error:null});
   return r({data:[],error:null})};return c}})};`;

function wav(seconds = 2, sr = 8000) {
  const n = sr * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 7) * 5000), 44 + i * 2);
  return b;
}
async function fakeR2(page, reject = {}) {
  const store = new Map(), uploads = new Map(), calls = [];
  await page.route(R2 + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    calls.push(method + ' ' + p);
    const json = (body, status = 200) => route.fulfill({status, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(body)});
    if (method === 'OPTIONS') return route.fulfill({status:204, headers:{'access-control-allow-origin':'*', 'access-control-allow-headers':'authorization, content-type, range', 'access-control-allow-methods':'GET, HEAD, POST, PUT, DELETE'}});
    if (p === '/health') return json({ok:true, bucket:true});
    if ((reject.auth || req.headers().authorization !== 'Bearer tok') && !url.searchParams.has('sig')) return json({error:'sign in required'}, 401);
    if (p === '/v1/me') return json({user:'ui-test-user'});
    if (p === '/v1/uploads' && method === 'POST') {
      const b = req.postDataJSON(), key = 'u/ui-test-user/' + b.mediaId + '/original.' + b.ext, id = 'up' + uploads.size;
      uploads.set(id, {key, type:b.contentType, parts:new Map()});
      return json({key, uploadId:id, partSize:8 * 1024 * 1024});
    }
    let m;
    if ((m = p.match(/^\/v1\/uploads\/([^/]+)\/parts\/(\d+)$/))) { uploads.get(m[1]).parts.set(Number(m[2]), req.postDataBuffer()); return json({partNumber:Number(m[2]), etag:'e' + m[2]}); }
    if ((m = p.match(/^\/v1\/uploads\/([^/]+)\/complete$/))) {
      const u = uploads.get(m[1]), bytes = Buffer.concat([...u.parts.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]));
      store.set(u.key, {bytes, type:u.type}); return json({key:u.key, size:bytes.length, etag:'"x"'});
    }
    if (p === '/v1/sign') { const {key} = req.postDataJSON(); return json({url:R2 + '/v1/media/' + key + '?exp=9999999999&sig=s', expires:9999999999}); }
    if (p.startsWith('/v1/media/')) {
      const key = decodeURIComponent(p.slice(10)), o = store.get(key);
      if (method === 'DELETE') { store.delete(key); return json({ok:true}); }
      if (!o) return json({error:'file not found'}, 404);
      const range = (req.headers().range || '').match(/^bytes=(\d+)-(\d+)$/);
      if (range) return route.fulfill({status:206, contentType:o.type, headers:{'access-control-allow-origin':'*', 'access-control-expose-headers':'content-range, content-length', 'content-range':'bytes ' + range[1] + '-' + range[2] + '/' + o.bytes.length}, body:o.bytes.subarray(Number(range[1]), Number(range[2]) + 1)});
      return route.fulfill({status:200, contentType:o.type, headers:{'access-control-allow-origin':'*', 'accept-ranges':'bytes'}, body:o.bytes});
    }
    if (p === '/v1/usage') return json({objects:store.size, bytes:[...store.values()].reduce((s, o) => s + o.bytes.length, 0)});
    return json({error:'not found'}, 404);
  });
  return {store, calls, reject};
}
async function boot(page, {endpoint = R2} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:'window.VZIP_R2_ENDPOINT=' + JSON.stringify(endpoint) + ';'}));
  if (process.env.VZ_MEDIABUNNY) await page.context().route('**/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs', r => r.fulfill({path:process.env.VZ_MEDIABUNNY, contentType:'text/javascript'}));
  page.on('dialog', d => d.accept());
  await page.addInitScript(([k]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify({categories:[], songs:[{id:'s1', title:'Defying Gravity'}], lessons:[], assignments:[], practices:[], comparisonReports:[]})); sessionStorage.setItem('seeded', '1'); } }, [KEY]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.vzipCloudSignedIn?.())).toBe(true);
}
test.afterEach(async ({page}) => { expect(page.__errors || []).toEqual([]); });

test('Without an R2 address nothing changes: uploads keep using the existing storage', async ({page}) => {
  await boot(page, {endpoint:''});
  expect(await page.evaluate(() => [window.VzipR2.configured(), window.VzipR2.enabled()])).toEqual([false, false]);
  await page.goto('/#/storage');
  await expect(page.getByText('아직 R2가 설정되지 않았어요')).toBeVisible();
  await expect(page.getByRole('button', {name:/R2로 옮기기/})).toHaveCount(0);
});

test('With R2 set up, an import is stored in R2 under the same id and plays from a signed link', async ({page}) => {
  test.setTimeout(60000);
  const r2 = await fakeR2(page);
  await boot(page);
  expect(await page.evaluate(() => window.VzipR2.enabled())).toBe(true);
  await page.goto('/#/library');
  await page.locator('[data-imp]').click();
  await page.locator('.sheet [data-file]').setInputFiles({name:'take.wav', mimeType:'audio/wav', buffer:wav()});
  await page.getByRole('button', {name:'가져오기', exact:true}).click();
  await expect(page.locator('.sheet [data-done]')).toContainText('✓ 저장 완료 1개', {timeout:30000});
  const meta = await page.evaluate(() => Object.values(window.__rows)[0]);
  expect(meta).toMatchObject({storageProvider:'r2', size:wav().length, source:'import'});
  expect(meta.r2Key).toBe('u/ui-test-user/' + meta.id + '/original.wav');
  expect(meta.path).toBeUndefined();
  expect(r2.store.get(meta.r2Key).bytes.equals(wav())).toBe(true);
  // Playback asks the Worker for a signed link.
  const url = await page.evaluate(m => window.vzipCloudMediaUrl(m), meta);
  expect(url).toContain(R2 + '/v1/media/' + meta.r2Key);
  expect(r2.calls).toContain('POST /v1/sign');
  // Deleting removes the R2 object.
  await page.evaluate(m => window.vzipCloudMediaDelete(m), meta);
  expect(r2.store.has(meta.r2Key)).toBe(false);
});

test('Storage screen moves existing files to R2 only when asked, keeps ids, and removes old copies only after confirmation', async ({page}) => {
  test.setTimeout(60000);
  const r2 = await fakeR2(page), bytes = wav(1);
  await page.route('**/legacy/**', r => r.fulfill({contentType:'audio/wav', body:bytes}));
  await boot(page);
  // One file in the previous cloud storage, one only on this device.
  await page.evaluate(async b => {
    const legacy = {id:'old-1', name:'예전 녹음', type:'audio/wav', size:b.length, path:'ui-test-user/old-1.wav', created:Date.now(), source:'practice', songId:'s1'};
    window.__rows['old-1'] = legacy;
    window.vzipCloudMediaList = async () => Object.entries(window.__rows).map(([id, m]) => ({...m, id, cloud:true}));
    await window.vzipStorePracticeMedia({id:'dev-1', name:'기기 녹음', type:'audio/wav', created:Date.now(), source:'practice', blob:new Blob([new Uint8Array(b)], {type:'audio/wav'})});
    VZ.media.invalidate();
  }, [...bytes]);
  await page.goto('/#/storage');
  await expect(page.getByText('이 기기에만 있음')).toBeVisible();
  expect(r2.store.size).toBe(0); // nothing moves by itself
  await page.getByRole('button', {name:'남은 2개 파일 R2로 옮기기'}).click();
  await expect(page.getByText('✓ 모든 파일이 R2에 있어요.')).toBeVisible({timeout:30000});
  const rows = await page.evaluate(() => window.__rows);
  expect(rows['old-1']).toMatchObject({storageProvider:'r2', r2Key:'u/ui-test-user/old-1/original.wav', songId:'s1', legacyStorage:{path:'ui-test-user/old-1.wav'}});
  expect(rows['dev-1']).toMatchObject({storageProvider:'r2', r2Key:'u/ui-test-user/dev-1/original.wav'});
  expect(rows['dev-1'].legacyStorage).toBeUndefined();
  expect(r2.store.get('u/ui-test-user/old-1/original.wav').bytes.equals(bytes)).toBe(true);
  expect(await page.evaluate(() => window.__removed)).toEqual([]); // old copy kept until asked
  // The device copy stays too.
  expect(await page.evaluate(async () => (await window.vzipReadMedia()).map(x => x.id))).toEqual(['dev-1']);
  await page.getByRole('button', {name:'예전 클라우드 사본 정리…'}).click();
  await expect.poll(() => page.evaluate(() => window.__removed)).toEqual(['ui-test-user/old-1.wav']);
  expect(await page.evaluate(() => window.__rows['old-1'].legacyStorage)).toBeUndefined();
});

test('If the Worker does not accept the sign-in, R2 stays off and new files keep using the existing storage', async ({page}) => {
  const r2 = await fakeR2(page, {auth:true});
  await boot(page);
  expect(await page.evaluate(() => window.VzipR2.ready())).toBe(false);
  expect(await page.evaluate(() => window.VzipR2.lastCheck())).toEqual({ok:false, reason:'auth'});
  await page.goto('/#/storage');
  await expect(page.getByText(/이 로그인을 확인하지 못했어요/)).toBeVisible();
  await expect(page.getByRole('button', {name:/R2로 옮기기/})).toHaveCount(0);
  expect(r2.calls.filter(c => c.startsWith('POST /v1/uploads'))).toEqual([]);
});
