// R2 storage in the app, against an in-page fake of r2-worker's API (the Worker itself is tested
// with Miniflare in r2-worker/test). Signed-in cloud (Supabase stub) + R2 endpoint configured.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1', R2 = 'https://r2.vocalzip.test';
const stub = `window.__vdStub=()=>{const c={q:{}};let upd=null,ins=null;for(const m of ['select','order','range','delete'])c[m]=()=>c;c.select=cols=>{c.cols=cols;return c};c.eq=(k,v)=>{c.q[k]=v;return c};c.is=c.eq;c.maybeSingle=()=>c;c.single=()=>c;c.update=r=>{upd=r;return c};c.insert=r=>{ins=r;return c};c.upsert=r=>{window.__vdRow={payload:r.payload,updated_at:r.updated_at};return c};c.then=r=>{const row=window.__vdRow||null;if(c.cols==='ids:payload->deleted->media')return r({data:row?{ids:row.payload?.deleted?.media??null}:null,error:null});if(ins){if(row)return r({data:null,error:{code:'23505',message:'duplicate'}});window.__vdRow={payload:ins.payload,updated_at:ins.updated_at};return r({data:null,error:null})}if(upd){if(!row||('updated_at' in c.q&&c.q.updated_at!==row.updated_at))return r({data:[],error:null});window.__vdRow={payload:upd.payload,updated_at:upd.updated_at};return r({data:[{user_id:'ui-test-user'}],error:null})}return r({data:row?JSON.parse(JSON.stringify(row)):null,error:null})};return c};window.__up=[];window.__removed=[];window.__rows=window.__rows||{};window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:fn=>{(window.__authHandlers||=[]).push(fn);return {data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session:{access_token:'tok'}}})},
 storage:{from:()=>({createSignedUrl:async p=>({data:{signedUrl:'/legacy/'+p},error:null}),upload:async()=>({error:null}),remove:async p=>{window.__removed.push(...p);return {error:null}}})},
 from:t=>{if(t==='vocal_data')return window.__vdStub();const c={q:{}};for(const m of ['order'])c[m]=()=>c;c.delete=()=>{c.del=true;return c};c.range=(a,b)=>{c.r=[a,b];return c};c.select=cols=>{c.cols=cols||'*';return c};c.in=(k,v)=>{c.ins=v;return c};window.__upd=window.__upd||{};c.eq=(k,v)=>{c.q[k]=v;return c};c.is=(k,v)=>{c.q[k]=v;return c};
  c.upsert=(row,options)=>{window.__up.push(row);window.__beforeInsert?.(row);if(window.__failUpsert){c.err={message:'insert denied'};return c}const r=Array.isArray(row)?row:[row];for(const x of r)if(x&&x.metadata&&(!options?.ignoreDuplicates||!window.__rows[x.id])){window.__rows[x.id]=x.metadata;window.__upd[x.id]=x.updated_at||new Date().toISOString()}return c};
  c.update=row=>{c.pendingUpdate=row;return c};
  c.maybeSingle=()=>c;c.single=()=>c;
  c.then=r=>{if(c.err)return r({data:null,error:c.err});if(c.del&&c.q.id){const now=window.__upd[c.q.id]||null;if('updated_at' in c.q&&c.q.updated_at!==now)return r({data:[],error:null});const had=c.q.id in window.__rows;delete window.__rows[c.q.id];return r({data:had?[{id:c.q.id}]:[],error:null})}if(c.pendingUpdate&&c.q.id){window.__beforeWrite?.(c.q.id);const now=window.__upd[c.q.id]||null;if('updated_at' in c.q&&c.q.updated_at!==now){(window.__conflicts||=[]).push(c.q.id);return r({data:[],error:null})}window.__rows[c.q.id]=c.pendingUpdate.metadata;window.__upd[c.q.id]=c.pendingUpdate.updated_at;(window.__writes||=[]).push({id:c.q.id,metadata:c.pendingUpdate.metadata});return r({data:[{id:c.q.id}],error:null})}
   if(c.q.id&&window.__failReadAfterInsert&&window.__rows[c.q.id])return r({data:null,error:{message:'verification offline'}});
   if(c.q.id)return r({data:window.__rows[c.q.id]?{metadata:window.__rows[c.q.id],updated_at:window.__upd[c.q.id]||null}:null,error:null});
   // Like the server: at most 1,000 rows per request, pages by range.
   let all=Object.entries(window.__rows).map(([id,metadata])=>({id,metadata,updated_at:window.__upd[id]||'2026-11-05T09:00:00Z'}));
   if(c.ins)all=all.filter(x=>c.ins.includes(x.id));
   (window.__sel||=[]).push(String(c.cols||'*')+(c.ins?' in:'+c.ins.length:''));
   if(c.cols&&!/metadata/.test(c.cols))all=all.map(x=>({id:x.id,updated_at:x.updated_at}));
   const [a,b]=c.r||[0,999];return r({data:all.slice(a,Math.min(b+1,a+1000)),error:null})};return c}})};`;

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
      const etag='"'+require('node:crypto').createHash('sha256').update(bytes).digest('hex')+'"';
      store.set(u.key, {bytes, type:u.type, etag}); return json({key:u.key, size:bytes.length, etag});
    }
    if (p === '/v1/sign') { const b = req.postDataJSON(), exp = Math.floor(Date.now() / 1000) + 3 * 3600;
      if (Array.isArray(b.keys)) { calls.push('BATCH ' + b.keys.length); return json({urls:Object.fromEntries(b.keys.map(k => [k, R2 + '/v1/media/' + k + '?exp=' + exp + '&sig=s'])), expires:exp}); }
      return json({url:R2 + '/v1/media/' + b.key + '?exp=' + exp + '&sig=s', expires:exp}); }
    if (p.startsWith('/v1/media/')) {
      if(method==='GET')await reject.beforeRead?.(req);
      if(reject.requireProtocol&&req.headers()['x-client-info']!=='vocalzip-device-session-v2')return json({error:'protocol required'},401);
      const key = decodeURIComponent(p.slice(10)), o = store.get(key);
      if (method === 'DELETE') { store.delete(key); return json({ok:true}); }
      if (!o) return json({error:'file not found'}, 404);
      const range = (req.headers().range || '').match(/^bytes=(\d+)-(\d+)$/);
      if (range) return route.fulfill({status:206, contentType:o.type, headers:{'access-control-allow-origin':'*', 'access-control-expose-headers':'content-range, content-length, etag', etag:o.etag, 'content-range':'bytes ' + range[1] + '-' + range[2] + '/' + o.bytes.length}, body:o.bytes.subarray(Number(range[1]), Number(range[2]) + 1)});
      return route.fulfill({status:200, contentType:o.type, headers:{'access-control-allow-origin':'*', 'accept-ranges':'bytes', etag:o.etag}, body:o.bytes});
    }
    if (p === '/v1/usage') return json({objects:store.size, bytes:[...store.values()].reduce((s, o) => s + o.bytes.length, 0)});
    if (p === '/v1/objects' && !reject.list) return json({objects:[...store.entries()].map(([key, o]) => ({key, size:o.bytes.length, uploaded:'2026-11-05T10:00:00.000Z', mediaId:key.split('/')[2]})), cursor:null});
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
  await expect(page.locator('.sheet [data-done]')).toContainText('✓ 이 기기에 저장 1개', {timeout:30000});
  // Saved on the device first; the upload to R2 follows from that copy.
  await expect.poll(() => page.evaluate(() => Object.keys(window.__rows).length), {timeout:20000}).toBe(1);
  const meta = await page.evaluate(() => Object.values(window.__rows)[0]);
  expect(meta).toMatchObject({storageProvider:'r2', source:'import'});
  // A WAV may be stored as its lossless FLAC; the object in R2 is exactly the file the app kept.
  expect(meta.r2Key).toMatch(new RegExp('^u/ui-test-user/' + meta.id + '/original\\.(wav|flac)$'));
  expect(meta.path).toBeUndefined();
  expect(r2.store.get(meta.r2Key).bytes.length).toBe(meta.size);
  const kept = (await page.evaluate(async () => { const x = (await window.vzipReadMedia())[0]; return [...new Uint8Array(x.blob ? await x.blob.arrayBuffer() : x.bytes)]; }));
  expect(r2.store.get(meta.r2Key).bytes.equals(Buffer.from(kept))).toBe(true);
  // Playback asks the Worker for a signed link.
  const url = await page.evaluate(m => window.vzipCloudMediaUrl(m), meta);
  expect(url).toContain(R2 + '/v1/media/' + meta.r2Key);
  expect(r2.calls).toContain('POST /v1/sign');
  // Deleting removes the R2 object.
  await page.evaluate(m => window.vzipCloudMediaDelete(m), meta);
  expect(r2.store.has(meta.r2Key)).toBe(false);
  expect(await page.evaluate(() => window.__vdRow.payload.deleted.media)).toContain(meta.id); // other devices unlink it too
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
  // Asked in the app's own popup; nothing is removed before 삭제.
  const ask = page.getByRole('dialog', {name:'예전 사본 삭제'});
  await expect(ask).toContainText('되돌릴 수 없어요');
  expect(await page.evaluate(() => window.__removed)).toEqual([]);
  await ask.getByRole('button', {name:'삭제'}).click();
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

test('A file stored in R2 whose library row cannot be written is kept (not deleted), noted, and found by the upload check', async ({page}) => {
  test.setTimeout(90000);
  const r2 = await fakeR2(page);
  await boot(page);
  await page.evaluate(() => { window.__failUpsert = true; });
  // Bulk path: straight from the picked file (no device copy), done only when the server confirms the row.
  const id = await page.evaluate(async b => {
    const file = new File([new Uint8Array(b)], 'take.wav', {type:'audio/wav'});
    try { await VZ.media.importFile(file, {id:'bulk-1', direct:true, extra:{fileHash:'abc'}}); return 'saved'; } catch (e) { return e.message; }
  }, [...wav()]);
  expect(id).toContain('보관함 연결을 확인하지 못했어요');
  expect(id).toContain('올린 파일은 지우지 않았어요');
  const key = 'u/ui-test-user/bulk-1/original.' + [...r2.store.keys()][0].split('.').pop();
  expect(r2.store.has(key)).toBe(true); // kept in R2
  expect(r2.calls.some(c => c.startsWith('DELETE'))).toBe(false); // nothing deleted
  expect(await page.evaluate(() => window.vzipR2Orphans().map(o => [o.id, o.key, o.fileHash]))).toEqual([['bulk-1', key, 'abc']]);
  expect(await page.evaluate(async () => (await window.vzipReadMedia()).length)).toBe(0); // no device copy
  // The read-only check sees it: in R2, no library row, details kept → recoverable.
  await page.goto('/#/storage');
  await page.getByRole('link', {name:/업로드 상태 진단/}).click();
  await page.getByRole('button', {name:'진단 시작'}).click();
  const uc = page.locator('.uc');
  await expect(uc).toContainText('진단 결과');
  await expect(uc.locator('.uc-row', {hasText:'R2 파일'}).first()).toContainText('1 ·');
  await expect(uc.locator('.uc-row', {hasText:'R2에는 있는데 보관함 기록이 없는 파일'})).toContainText('1');
  await expect(uc.locator('.uc-row', {hasText:'복구 가능'})).toContainText('1');
  expect(r2.calls).toContain('GET /v1/objects');
  // A successful upload with the row confirmed is "done" and also leaves no device copy.
  await page.evaluate(() => { window.__failUpsert = false; });
  const ok = await page.evaluate(async b => { const s = await VZ.media.importFile(new File([new Uint8Array(b)], 'take2.wav', {type:'audio/wav'}), {id:'bulk-2', direct:true}); return [s.cloud, s.storageProvider]; }, [...wav(1)]);
  expect(ok).toEqual([true, 'r2']);
  expect(await page.evaluate(() => window.__rows['bulk-2']?.storageProvider)).toBe('r2');
  expect(await page.evaluate(async () => (await window.vzipReadMedia()).length)).toBe(0);
});

test('The library reads every row even past the server\'s 1,000-row page limit', async ({page}) => {
  await fakeR2(page);
  await boot(page);
  const count = await page.evaluate(async () => {
    for (let i = 0; i < 1234; i++) window.__rows['row-' + i] = {id:'row-' + i, name:'녹음 ' + i, storageProvider:'r2', r2Key:'u/ui-test-user/row-' + i + '/original.m4a', created:Date.now(), recordedDate:'2026-11-01'};
    VZ.media.invalidate(); return (await VZ.media.list(true)).filter(m => m.cloud).length;
  });
  expect(count).toBe(1234);
  // The library draws 60 rows at first and the rest as it scrolls; all are reachable.
  await page.goto('/#/library');
  await expect(page.locator('[data-count]')).toContainText('1234개');
  await expect(page.locator('[data-l] [data-media]')).toHaveCount(60);
  for (let i = 0; i < 60 && await page.locator('[data-l] [data-media]').count() < 1234; i++) { await page.locator('[data-l] [data-media]').last().scrollIntoViewIfNeeded(); await page.waitForTimeout(50); }
  await expect(page.locator('[data-l] [data-media]')).toHaveCount(1234);
});

test('The library list is kept on the device: later reads fetch only ids/times and the rows that changed', async ({page}) => {
  await fakeR2(page);
  await boot(page);
  await page.evaluate(async () => {
    for (const i of [1, 2, 3]) window.__rows['k' + i] = {id:'k' + i, name:'녹음 ' + i, storageProvider:'r2', r2Key:'u/ui-test-user/k' + i + '/original.m4a', created:Date.now(), recordedDate:'2026-11-0' + i};
    VZ.media.invalidate(); await VZ.media.list(true);
  });
  const names = await page.evaluate(async () => {
    window.__sel = [];
    window.__rows.k2 = {...window.__rows.k2, name:'바뀐 이름'}; window.__upd.k2 = '2026-11-06T00:00:00Z'; delete window.__rows.k3;
    VZ.media.invalidate(); return (await VZ.media.list(true)).filter(m => m.cloud).map(m => m.name).sort();
  });
  expect(names).toEqual(['녹음 1', '바뀐 이름']); // changed row refreshed, deleted row gone
  const sel = await page.evaluate(() => window.__sel);
  expect(sel.filter(x => x.startsWith('id,updated_at')).length).toBeGreaterThan(0);
  expect(sel.filter(x => / in:/.test(x))).toEqual(['id,metadata,updated_at in:1']); // only the changed row in full
});

test('Playback links are signed ahead in one request for the rows shown, kept across reloads, and a tap needs no extra request', async ({page}) => {
  const r2 = await fakeR2(page);
  await boot(page);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__rows['p' + i] = {id:'p' + i, name:'재생 ' + i, type:'audio/wav', storageProvider:'r2', r2Key:'u/ui-test-user/p' + i + '/original.wav', created:Date.now(), recordedDate:'2026-11-05', durationSeconds:2}; VZ.media.invalidate(); });
  await page.goto('/#/library');
  await expect(page.locator('[data-l] [data-media]')).toHaveCount(5);
  await expect.poll(() => r2.calls.filter(c => c === 'BATCH 5').length).toBe(1);
  expect(await page.evaluate(() => !!window.VzipR2.cachedUrl('u/ui-test-user/p2/original.wav'))).toBe(true);
  const signs = () => r2.calls.filter(c => c === 'POST /v1/sign').length, before = signs();
  await page.locator('[data-l] [data-media="p2"] [data-toggle]').click();
  await expect(page.locator('[data-l] [data-media="p2"] .media-open')).toBeVisible();
  expect(signs()).toBe(before); // the tap used the link already here
  await page.reload(); await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  expect(await page.evaluate(() => !!window.VzipR2.cachedUrl('u/ui-test-user/p2/original.wav'))).toBe(true); // kept across reloads
});

test('Editing a recording saves only the changed fields onto the newest cloud copy: other devices\' edits stay', async ({page}) => {
  await fakeR2(page);
  await boot(page);
  const row = await page.evaluate(async () => {
    window.__rows.c1 = {id:'c1', name:'녹음', storageProvider:'r2', r2Key:'u/ui-test-user/c1/original.m4a', created:Date.now(), song:'', review:''};
    window.__upd.c1 = '2026-11-06T01:00:00.000Z';
    VZ.media.invalidate(); const item = (await VZ.media.list(true)).find(m => m.id === 'c1');
    // Another device saves a memo and rating after this device loaded its list.
    window.__rows.c1 = {...window.__rows.c1, review:'다른 기기 메모', rating:5}; window.__upd.c1 = '2026-11-06T01:05:00.000Z';
    await VZ.media.update(item, {song:'Defying Gravity', songId:'s1'});
    return window.__rows.c1;
  });
  expect(row).toMatchObject({song:'Defying Gravity', songId:'s1', review:'다른 기기 메모', rating:5, r2Key:'u/ui-test-user/c1/original.m4a'});
});

test('When another device saves between reading and writing, the write is refused, re-read and applied again', async ({page}) => {
  await fakeR2(page);
  await boot(page);
  const out = await page.evaluate(async () => {
    window.__rows.c2 = {id:'c2', name:'녹음 2', storageProvider:'r2', r2Key:'u/ui-test-user/c2/original.m4a', created:Date.now(), review:''};
    window.__upd.c2 = '2026-11-06T01:00:00.000Z';
    VZ.media.invalidate(); const item = (await VZ.media.list(true)).find(m => m.id === 'c2');
    let once = false;
    window.__beforeWrite = id => { if (once || id !== 'c2') return; once = true; window.__rows.c2 = {...window.__rows.c2, review:'동시에 저장한 메모'}; window.__upd.c2 = '2026-11-06T02:00:00.000Z'; };
    window.__conflicts = [];
    await VZ.media.update(item, {rating:3});
    window.__beforeWrite = null;
    return {row:window.__rows.c2, conflicts:window.__conflicts};
  });
  expect(out.conflicts).toEqual(['c2']);
  expect(out.row).toMatchObject({rating:3, review:'동시에 저장한 메모'});
});

test('A device file edit sends only what changed: older device values never overwrite the cloud copy', async ({page}) => {
  await fakeR2(page);
  await boot(page);
  const rows = await page.evaluate(async () => {
    VZ.media.holdBackup(true);
    window.__rows.d1 = {id:'d1', name:'기기 녹음', storageProvider:'r2', r2Key:'u/ui-test-user/d1/original.wav', created:Date.now(), type:'audio/wav', review:'새 메모 (다른 기기)', rating:5};
    window.__upd.d1 = '2026-11-06T01:00:00.000Z';
    await window.vzipStorePracticeMedia({id:'d1', name:'기기 녹음', created:Date.now(), type:'audio/wav', source:'import', review:'옛 메모', rating:1, blob:new Blob([new Uint8Array(64)], {type:'audio/wav'})});
    VZ.media.invalidate(); const item = (await VZ.media.list(true)).find(m => m.id === 'd1');
    await VZ.media.update(item, {song:'Defying Gravity', songId:'s1'});
    await new Promise(r => setTimeout(r, 300));
    const afterApp = {...window.__rows.d1};
    // An older screen that announces only an id + changed fields.
    window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:'d1', changes:{name:'새 이름'}}}));
    await new Promise(r => setTimeout(r, 300));
    VZ.media.holdBackup(false);
    return {afterApp, afterEvent:window.__rows.d1, local:(await window.vzipReadMedia()).find(x => x.id === 'd1')};
  });
  expect(rows.afterApp).toMatchObject({song:'Defying Gravity', review:'새 메모 (다른 기기)', rating:5});
  expect(rows.afterEvent).toMatchObject({name:'새 이름', song:'Defying Gravity', review:'새 메모 (다른 기기)', rating:5});
  expect(rows.local).toMatchObject({song:'Defying Gravity'});
});

test('A song picked by the AI suggestion for a file on this device changes only the song: other devices\' edits stay, and undo still works', async ({page}) => {
  await fakeR2(page);
  await boot(page);
  const out = await page.evaluate(async () => {
    VZ.media.holdBackup(true);
    window.__rows.s9 = {id:'s9', name:'미분류 녹음', storageProvider:'r2', r2Key:'u/ui-test-user/s9/original.wav', created:Date.now(), type:'audio/wav', review:'다른 기기 메모', rating:5, recordedDate:'2026-10-01', song:'', songId:''};
    window.__upd.s9 = '2026-11-06T01:00:00.000Z';
    await window.vzipStorePracticeMedia({id:'s9', name:'미분류 녹음', created:Date.now(), type:'audio/wav', source:'import', review:'옛 메모', rating:1, recordedDate:'2026-09-01', blob:new Blob([new Uint8Array(64)], {type:'audio/wav'})});
    VZ.media.invalidate(); const item = (await VZ.media.list(true)).find(m => m.id === 's9');
    const written = await VZ.media.assignSongSafe(item, {songId:'s1', song:'Defying Gravity'}, {expectedSongId:'', expectedSong:''});
    await new Promise(r => setTimeout(r, 400)); // let any sync listener run
    const afterAssign = {...window.__rows.s9}, versionAfter = window.__upd.s9;
    // Undo (as the suggestion screen does) must still find the version it wrote.
    VZ.media.invalidate(); const again = (await VZ.media.list(true)).find(m => m.id === 's9');
    let undoError = null;
    try { await VZ.media.assignSongSafe(again, {songId:'', song:''}, {expectedSongId:'s1', expectedSong:'Defying Gravity', expectedUpdatedAt:written.updatedAt}); } catch (e) { undoError = e.message; }
    await new Promise(r => setTimeout(r, 400));
    VZ.media.holdBackup(false);
    return {afterAssign, sameVersion:versionAfter === written.updatedAt, undoError, afterUndo:window.__rows.s9};
  });
  expect(out.afterAssign).toMatchObject({songId:'s1', song:'Defying Gravity', review:'다른 기기 메모', rating:5, recordedDate:'2026-10-01'});
  expect(out.sameVersion).toBe(true);
  expect(out.undoError).toBeNull();
  expect(out.afterUndo).toMatchObject({songId:'', song:'', review:'다른 기기 메모', rating:5});
});

test('악보: a PDF is uploaded to R2 under the song, opens from a signed link, can be renamed, survives a reload, and deletes its file', async ({page}) => {
  const r2 = await fakeR2(page);
  await boot(page);
  await page.goto('/#/song/s1');
  await page.getByRole('tab', {name:'악보'}).click();
  await page.getByRole('button', {name:/PDF 올리기/}).click();
  const sheet = page.locator('.sheet');
  await sheet.locator('input[name=file]').setInputFiles({name:'Defying Gravity vocal.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4\n% test score\n%%EOF')});
  await sheet.locator('select[name=originalKey]').selectOption('C#/Db');
  await sheet.locator('select[name=practiceKey]').selectOption('C');
  await page.locator('.sheet-foot [data-go]').click();
  const row = page.locator('[data-score]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Defying Gravity vocal');
  await expect(row).toContainText('원키 C#/Db · 연습 C');
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs.find(s => s.id === 's1').scores, KEY);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({songId:'s1', fileName:'Defying Gravity vocal.pdf', originalKey:'C#/Db', practiceKey:'C'});
  expect(saved[0].r2Key).toMatch(/^u\/ui-test-user\/score-[0-9a-f-]+\/original\.pdf$/);
  expect(r2.store.get(saved[0].r2Key).bytes.toString()).toContain('%PDF');
  // A signed link is ready before the tap (iOS opens it directly).
  await expect(row.locator('[data-open]')).toHaveAttribute('href', new RegExp('/v1/media/' + saved[0].r2Key.replace(/[/.]/g, '\\$&')));
  // Rename in a sheet.
  await row.locator('[data-edit]').click();
  await page.locator('.sheet input[name=title]').fill('Defying Gravity (2막)');
  await page.locator('.sheet-foot .btn').click();
  await expect(row).toContainText('Defying Gravity (2막)');
  await page.reload(); await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.goto('/#/song/s1'); await page.getByRole('tab', {name:'악보'}).click();
  await expect(page.locator('[data-score]')).toContainText('Defying Gravity (2막)');
  // Delete: confirmation, the R2 file goes too.
  await page.locator('[data-score] [data-del]').click();
  await page.locator('.sheet [data-ok], .sheet-foot [data-ok]').first().click();
  await expect(page.locator('[data-score]')).toHaveCount(0);
  expect(r2.store.has(saved[0].r2Key)).toBe(false);
});

async function failLibraryAttachment(page,id='receipt-retry'){
 return page.evaluate(async({bytes,id})=>{
  window.__failUpsert=true;
  const file=new File([new Uint8Array(bytes)],'original.wav',{type:'audio/wav',lastModified:1780000000000});
  try{await window.vzipCloudImport(file,{id,name:'원래 녹음',songId:'s1',song:'Defying Gravity',recordedDate:'2026-10-05',dateSource:'metadata',durationSeconds:42,source:'record'});return 'unexpected success';}
  catch(error){return error.message;}
 },{bytes:[...wav(1)],id});
}
test('A metadata retry reuses the completed upload and original metadata, even if another file is selected',async({page})=>{
 const r2=await fakeR2(page);await boot(page);
 expect(await failLibraryAttachment(page)).toContain('보관함 연결을 확인하지 못했어요');
 const result=await page.evaluate(async()=>{
  window.__failUpsert=false;
  return window.vzipCloudImport(new File([new Uint8Array([8,8])],'different.wav',{type:'audio/wav'}),{id:'receipt-retry',name:'다른 이름',songId:'different-song'});
 });
 expect(result).toMatchObject({id:'receipt-retry',name:'원래 녹음',songId:'s1',recordedDate:'2026-10-05',durationSeconds:42,size:wav(1).length,source:'record'});
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);
 expect(r2.calls.filter(x=>x.includes('/complete'))).toHaveLength(1);
 expect([...r2.store.values()][0].bytes.equals(wav(1))).toBe(true);
 expect(r2.calls.some(x=>x.startsWith('DELETE'))).toBe(false);
});
test('Reload automatically reconnects a completed upload without selecting the original file again',async({page})=>{
 const r2=await fakeR2(page);await boot(page);
 expect(await failLibraryAttachment(page,'receipt-reload')).toContain('보관함 연결을 확인하지 못했어요');
 await page.reload();await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.__rows['receipt-reload']?.name)).toBe('원래 녹음');
 expect(await page.evaluate(()=>window.__rows['receipt-reload'])).toMatchObject({songId:'s1',recordedDate:'2026-10-05',source:'record',durationSeconds:42});
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);
 expect(r2.calls.some(x=>x.startsWith('DELETE'))).toBe(false);
});
test('A deletion tombstone keeps the receipt pending and prevents automatic relinking',async({page})=>{
 const r2=await fakeR2(page);await boot(page);await failLibraryAttachment(page,'receipt-deleted');
 const result=await page.evaluate(async()=>{
  window.__failUpsert=false;
  const db=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1'));db.deleted={...(db.deleted||{}),media:['receipt-deleted']};localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(db));
  return window.vzipRecoverMediaUploads('receipt-deleted');
 });
 expect(result).toEqual([{id:'receipt-deleted',status:'pending',code:'deleted'}]);
 expect(await page.evaluate(()=>window.__rows['receipt-deleted']||null)).toBeNull();
 expect(r2.store.size).toBe(1);expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);
});
test('Same-sized R2 replacement is not accepted as the completed original',async({page})=>{
 const r2=await fakeR2(page);await boot(page);await failLibraryAttachment(page,'receipt-replaced');
 const object=[...r2.store.values()][0];object.bytes=Buffer.from(object.bytes);object.bytes[object.bytes.length-1]^=255;object.etag='"different-object"';
 const result=await page.evaluate(async()=>{window.__failUpsert=false;return window.vzipRecoverMediaUploads('receipt-replaced');});
 expect(result).toEqual([{id:'receipt-replaced',status:'pending',code:'object_changed'}]);
 expect(await page.evaluate(()=>window.__rows['receipt-replaced']||null)).toBeNull();
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);expect(r2.store.size).toBe(1);
});
test('A concurrent library insert keeps its latest edits during fresh-upload confirmation',async({page})=>{
 const r2=await fakeR2(page);await boot(page);
 const result=await page.evaluate(async bytes=>{
  window.__beforeInsert=row=>{if(row.id==='receipt-race')window.__rows[row.id]={...row.metadata,name:'다른 기기에서 저장한 이름',review:'새 메모',rating:5};};
  return window.vzipCloudImport(new File([new Uint8Array(bytes)],'race.wav',{type:'audio/wav'}),{id:'receipt-race',name:'이 기기 이름'});
 },[...wav(1)]);
 expect(result).toMatchObject({name:'다른 기기에서 저장한 이름',review:'새 메모',rating:5});
 expect(await page.evaluate(()=>window.__rows['receipt-race'].review)).toBe('새 메모');
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);
});
test('Lost metadata verification preserves the receipt and recovers the existing row without another upload',async({page})=>{
 const r2=await fakeR2(page);await boot(page);
 const failed=await page.evaluate(async bytes=>{
  window.__failReadAfterInsert=true;
  try{await window.vzipCloudImport(new File([new Uint8Array(bytes)],'lost.wav',{type:'audio/wav'}),{id:'receipt-lost',name:'원래 이름'});return 'unexpected success';}
  catch(error){return error.message;}
 },[...wav(1)]);
 expect(failed).toContain('보관함 연결을 확인하지 못했어요');
 const result=await page.evaluate(async()=>{
  window.__failReadAfterInsert=false;window.__rows['receipt-lost'].review='그 사이 다른 기기 메모';
  return window.vzipRecoverMediaUploads('receipt-lost');
 });
 expect(result[0]).toMatchObject({status:'restored',metadata:{review:'그 사이 다른 기기 메모'}});
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);
});
test('R2 object verification carries the registered-session protocol header',async({page})=>{
 const r2=await fakeR2(page);await boot(page);
 const key='u/ui-test-user/header-test/original.wav';r2.store.set(key,{bytes:Buffer.from([1,2,3]),type:'audio/wav',etag:'"header-etag"'});r2.reject.requireProtocol=true;
 const result=await page.evaluate(async key=>{
  const original=window.VzipAccountScope,access=window.vzipCloudAccessToken;
  try{window.VzipAccountScope={owner:'ui-test-user'};window.vzipCloudAccessToken=async()=>'tok';return await window.VzipR2.stat(key);}
  finally{window.VzipAccountScope=original;window.vzipCloudAccessToken=access;}
 },key);
 expect(result).toEqual({size:3,etag:'"header-etag"'});
});
test('Logout while object verification waits blocks relinking and preserves the old account receipt',async({page})=>{
 const r2=await fakeR2(page);await boot(page);await failLibraryAttachment(page,'receipt-logout');
 let start,release;const started=new Promise(r=>{start=r;}),gate=new Promise(r=>{release=r;});
 r2.reject.beforeRead=async()=>{start();await gate;};
 await page.evaluate(()=>{window.__failUpsert=false;window.__recoveryResult=window.vzipRecoverMediaUploads('receipt-logout').catch(error=>({code:error.code}));});
 await started;
 await page.evaluate(()=>{for(const fn of window.__authHandlers||[])fn('SIGNED_OUT',null);});
 release();
 expect(await page.evaluate(()=>window.__recoveryResult)).toEqual({code:'identity'});
 expect(await page.evaluate(()=>window.__rows['receipt-logout']||null)).toBeNull();
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('vzip_r2_library_receipts_v1:ui-test-user:receipt-logout')))).toBe(true);
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);
});

test('Malformed server deletion metadata blocks recovery without relinking or reuploading',async({page})=>{
 const r2=await fakeR2(page);await boot(page);await failLibraryAttachment(page,'receipt-bad-delete');
 const result=await page.evaluate(async()=>{
  window.__failUpsert=false;
  const db=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1'));
  window.__vdRow={payload:{...db,deleted:{...(db.deleted||{}),media:'invalid-array'}},updated_at:new Date().toISOString()};
  return window.vzipRecoverMediaUploads('receipt-bad-delete');
 });
 expect(result).toEqual([{id:'receipt-bad-delete',status:'pending',code:'deleted_unavailable'}]);
 expect(await page.evaluate(()=>window.__rows['receipt-bad-delete']||null)).toBeNull();
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);expect(r2.store.size).toBe(1);
});

test('Baseline reproduces song/date changes leaving the recording title unchanged',async({page})=>{
 test.skip(!process.env.VZIP_BENCH_BASE,'baseline audit runs in the focused throughput workflow');
 const {execFileSync}=require('node:child_process'),base=process.env.VZIP_BENCH_BASE;
 for(const path of ['app/media.js','cloud-sync.js']){
  const body=execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
  await page.route('**/'+path+'*',route=>route.fulfill({contentType:'application/javascript',body}));
 }
 await fakeR2(page);await boot(page);
 const out=await page.evaluate(async()=>{
  const id='baseline-auto-title';window.__rows[id]={id,name:'original',source:'import',originalFilename:'original.wav',type:'audio/wav',recordedDate:'2026-11-08',songId:'',song:''};window.__upd[id]='2026-11-08T01:00:00.000Z';
  const item={...window.__rows[id],cloud:true};
  await VZ.media.assignSongSafe(item,{songId:'s1',song:'Defying Gravity'},{expectedSongId:'',expectedSong:''});
  await VZ.media.update({...window.__rows[id],cloud:true},{recordedDate:'2026-11-09'});
  return window.__rows[id];
 });
 expect(out).toMatchObject({songId:'s1',recordedDate:'2026-11-09',name:'original'});
 console.log('BASELINE_TITLE_BUG_REPRODUCED');
});
test('An imported automatic title follows song assignment and date edits and survives reload',async({page})=>{
 const r2=await fakeR2(page);await boot(page);
 const out=await page.evaluate(async bytes=>{
  const saved=await VZ.media.importFile(new File([new Uint8Array(bytes)],'original.wav',{type:'audio/wav'}),{id:'automatic-title',date:'2026-11-08',direct:true});
  const item={...saved,cloud:true};await VZ.media.assignSongSafe(item,{songId:'s1',song:'Defying Gravity'},{expectedSongId:'',expectedSong:''});
  const assigned={...window.__rows[item.id]};
  await VZ.media.update({...assigned,cloud:true},{recordedDate:'2026-11-09',dateSource:'manual',name:assigned.name});
  return {assigned,current:window.__rows[item.id]};
 },[...wav(1)]);
 expect(out.assigned).toMatchObject({name:'Defying Gravity 2026.11.08',nameMode:'auto',originalFilename:'original.wav'});
 expect(out.current).toMatchObject({name:'Defying Gravity 2026.11.09',recordedDate:'2026-11-09',songId:'s1'});
 const rows=await page.evaluate(()=>window.__rows);
 await page.addInitScript(rows=>{window.__rows=rows;},rows);await page.reload();await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__rows['automatic-title'].name)).toBe('Defying Gravity 2026.11.09');
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(1);
});
test('Manual recording titles stay unchanged when song and date are edited',async({page})=>{
 const r2=await fakeR2(page);await boot(page);
 const out=await page.evaluate(async()=>{
  const id='manual-title';window.__rows[id]={id,name:'old take',nameMode:'auto',autoName:'old take',originalFilename:'old take.wav',songId:'',song:'',recordedDate:'2026-11-08',type:'audio/wav'};window.__upd[id]='2026-11-08T01:00:00.000Z';
  await VZ.media.update({...window.__rows[id],cloud:true},{name:'오디션 제출용 최종 테이크'});
  await VZ.media.assignSongSafe({...window.__rows[id],cloud:true},{songId:'s1',song:'Defying Gravity'},{expectedSongId:'',expectedSong:''});
  await VZ.media.update({...window.__rows[id],cloud:true},{recordedDate:'2026-11-09'});
  return window.__rows[id];
 });
 expect(out).toMatchObject({name:'오디션 제출용 최종 테이크',nameMode:'manual',songId:'s1',recordedDate:'2026-11-09'});
 expect(r2.calls.filter(x=>x==='POST /v1/uploads')).toHaveLength(0);
});
test('A newer title from another device wins over a stale automatic title snapshot',async({page})=>{
 await fakeR2(page);await boot(page);
 const result=await page.evaluate(async()=>{
  const id='newer-title',stale={id,name:'old take',nameMode:'auto',autoName:'old take',originalFilename:'old take.wav',songId:'',song:'',recordedDate:'2026-11-08',type:'audio/wav',cloud:true};
  window.__rows[id]={...stale,name:'다른 기기에서 정한 제목',review:'다른 기기 메모'};window.__upd[id]='2026-11-08T01:00:00.000Z';
  await VZ.media.assignSongSafe(stale,{songId:'s1',song:'Defying Gravity'},{expectedSongId:'',expectedSong:''});
  return window.__rows[id];
 });
 expect(result).toMatchObject({name:'다른 기기에서 정한 제목',review:'다른 기기 메모',songId:'s1'});
});
test('Device-only imports also update automatic titles when assigned a song',async({page})=>{
 await fakeR2(page);await boot(page);
 const result=await page.evaluate(async()=>{
  VZ.media.holdBackup(true);const id='local-auto-title';
  await window.vzipStorePracticeMedia({id,name:'original',nameMode:'auto',autoName:'original',originalFilename:'original.wav',recordedDate:'2026-11-08',type:'audio/wav',blob:new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'}),songId:'',song:''});
  const item={...(await window.vzipReadMedia()).find(x=>x.id===id),local:true,cloud:false};
  await VZ.media.assignSongSafe(item,{songId:'s1',song:'Defying Gravity'},{expectedSongId:'',expectedSong:''});
  return (await window.vzipReadMedia()).find(x=>x.id===id);
 });
 expect(result).toMatchObject({name:'Defying Gravity 2026.11.08',songId:'s1',nameMode:'auto'});
});
test('Profile native WAV preparation separately from cloud transfer and metadata commit',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','one reference profile; physical iPhone timing remains separate');
 test.setTimeout(90000);await fakeR2(page);await boot(page);
 const result=await page.evaluate(async()=>{
  const count=60*48000,buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer),bytes=new Uint8Array(buffer),set=(offset,text)=>bytes.set(new TextEncoder().encode(text),offset);
  set(0,'RIFF');view.setUint32(4,36+count*2,true);set(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,48000,true);view.setUint32(28,96000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);set(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.round(Math.sin(i/7)*5000),true);
  const profile={sourceBytes:buffer.byteLength,prepareMs:0,cloudMs:0};
  const prepare=window.vzipPrepareMedia,cloud=window.vzipCloudImport;
  window.vzipPrepareMedia=async(...args)=>{const at=performance.now(),out=await prepare(...args);profile.prepareMs+=performance.now()-at;profile.samplesVerified=!!out.metadata.losslessFlac?.samplesVerified;return out;};
  window.vzipCloudImport=async(...args)=>{const at=performance.now();try{return await cloud(...args);}finally{profile.cloudMs+=performance.now()-at;}};
  const at=performance.now();
  const saved=await VZ.media.importFile(new File([buffer],'profile.wav',{type:'audio/wav'}),{id:'profile-upload',direct:true});
  profile.totalMs=performance.now()-at;profile.storedBytes=saved.size;profile.storedType=saved.type;
  window.vzipPrepareMedia=prepare;window.vzipCloudImport=cloud;
  return profile;
 });
 expect(result.sourceBytes).toBe(5760044);expect(result.storedBytes).toBeGreaterThan(0);
 if(result.storedType==='audio/flac')expect(result.samplesVerified).toBe(true);
 console.log('UPLOAD_PHASE_PROFILE '+JSON.stringify(result));
});
