// Score picker regression checks: real app and R2 transport, mocked cloud HTTP only.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1', R2 = 'https://r2.vocalzip.test';
const stub = `window.__vdStub=()=>{const c={q:{}};let upd=null,ins=null;for(const m of ['select','order','range','delete'])c[m]=()=>c;c.eq=(k,v)=>{c.q[k]=v;return c};c.is=c.eq;c.maybeSingle=()=>c;c.single=()=>c;c.update=r=>{upd=r;return c};c.insert=r=>{ins=r;return c};c.upsert=r=>{window.__vdRow={payload:r.payload,updated_at:r.updated_at};return c};c.then=r=>{const row=window.__vdRow||null;if(ins){if(row)return r({data:null,error:{code:'23505',message:'duplicate'}});window.__vdRow={payload:ins.payload,updated_at:ins.updated_at};return r({data:null,error:null})}if(upd){if(!row||('updated_at' in c.q&&c.q.updated_at!==row.updated_at))return r({data:[],error:null});window.__vdRow={payload:upd.payload,updated_at:upd.updated_at};return r({data:[{user_id:'ui-test-user'}],error:null})}return r({data:row?JSON.parse(JSON.stringify(row)):null,error:null})};return c};window.__up=[];window.__removed=[];window.__rows=window.__rows||{};window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'tok'}}})},
 storage:{from:()=>({createSignedUrl:async p=>({data:{signedUrl:'/legacy/'+p},error:null}),upload:async()=>({error:null}),remove:async p=>{window.__removed.push(...p);return {error:null}}})},
 from:t=>{if(t==='vocal_data')return window.__vdStub();const c={q:{}};for(const m of ['order'])c[m]=()=>c;c.delete=()=>{c.del=true;return c};c.range=(a,b)=>{c.r=[a,b];return c};c.select=cols=>{c.cols=cols||'*';return c};c.in=(k,v)=>{c.ins=v;return c};window.__upd=window.__upd||{};c.eq=(k,v)=>{c.q[k]=v;return c};c.is=(k,v)=>{c.q[k]=v;return c};
  c.upsert=row=>{window.__up.push(row);if(window.__failUpsert){c.err={message:'insert denied'};return c}const r=Array.isArray(row)?row:[row];for(const x of r)if(x&&x.metadata){window.__rows[x.id]=x.metadata;window.__upd[x.id]=x.updated_at||new Date().toISOString()}return c};
  c.update=row=>{c.pendingUpdate=row;return c};
  c.maybeSingle=()=>c;c.single=()=>c;
  c.then=r=>{if(c.err)return r({data:null,error:c.err});if(c.del&&c.q.id){const now=window.__upd[c.q.id]||null;if('updated_at' in c.q&&c.q.updated_at!==now)return r({data:[],error:null});const had=c.q.id in window.__rows;delete window.__rows[c.q.id];return r({data:had?[{id:c.q.id}]:[],error:null})}if(c.pendingUpdate&&c.q.id){window.__beforeWrite?.(c.q.id);const now=window.__upd[c.q.id]||null;if('updated_at' in c.q&&c.q.updated_at!==now){(window.__conflicts||=[]).push(c.q.id);return r({data:[],error:null})}window.__rows[c.q.id]=c.pendingUpdate.metadata;window.__upd[c.q.id]=c.pendingUpdate.updated_at;(window.__writes||=[]).push({id:c.q.id,metadata:c.pendingUpdate.metadata});return r({data:[{id:c.q.id}],error:null})}
   if(c.q.id)return r({data:window.__rows[c.q.id]?{metadata:window.__rows[c.q.id],updated_at:window.__upd[c.q.id]||null}:null,error:null});
   // Like the server: at most 1,000 rows per request, pages by range.
   let all=Object.entries(window.__rows).map(([id,metadata])=>({id,metadata,updated_at:window.__upd[id]||'2026-11-05T09:00:00Z'}));
   if(c.ins)all=all.filter(x=>c.ins.includes(x.id));
   (window.__sel||=[]).push(String(c.cols||'*')+(c.ins?' in:'+c.ins.length:''));
   if(c.cols&&!/metadata/.test(c.cols))all=all.map(x=>({id:x.id,updated_at:x.updated_at}));
   const [a,b]=c.r||[0,999];return r({data:all.slice(a,Math.min(b+1,a+1000)),error:null})};return c}})};`;

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
      if (reject.beforeComplete) await reject.beforeComplete();
      const u = uploads.get(m[1]), bytes = Buffer.concat([...u.parts.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]));
      store.set(u.key, {bytes, type:u.type}); return json({key:u.key, size:bytes.length, etag:'"x"'});
    }
    if (p === '/v1/sign') { const b = req.postDataJSON(), exp = Math.floor(Date.now() / 1000) + 3 * 3600;
      if (Array.isArray(b.keys)) { calls.push('BATCH ' + b.keys.length); return json({urls:Object.fromEntries(b.keys.map(k => [k, R2 + '/v1/media/' + k + '?exp=' + exp + '&sig=s'])), expires:exp}); }
      return json({url:R2 + '/v1/media/' + b.key + '?exp=' + exp + '&sig=s', expires:exp}); }
    if (p.startsWith('/v1/media/')) {
      const key = decodeURIComponent(p.slice(10)), o = store.get(key);
      if (method === 'DELETE') { store.delete(key); return json({ok:true}); }
      if (!o) return json({error:'file not found'}, 404);
      const range = (req.headers().range || '').match(/^bytes=(\d+)-(\d+)$/);
      if (range) return route.fulfill({status:206, contentType:o.type, headers:{'access-control-allow-origin':'*', 'access-control-expose-headers':'content-range, content-length', 'content-range':'bytes ' + range[1] + '-' + range[2] + '/' + o.bytes.length}, body:o.bytes.subarray(Number(range[1]), Number(range[2]) + 1)});
      return route.fulfill({status:200, contentType:o.type, headers:{'access-control-allow-origin':'*', 'accept-ranges':'bytes'}, body:o.bytes});
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
const PDF = {name:'뮤지컬 악보.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF')};
async function openUploader(page) {
  await page.goto('/#/song/s1');
  await page.getByRole('tab', {name:'악보', exact:true}).click();
  await page.getByRole('button', {name:'PDF 올리기', exact:true}).click();
  const sheet = page.getByRole('dialog', {name:'악보 올리기', exact:true});
  await expect(sheet).toBeVisible();
  return sheet;
}
async function choosePDF(page, sheet, file = PDF) {
  const chooserEvent = page.waitForEvent('filechooser');
  await sheet.getByLabel('PDF 파일', {exact:true}).click();
  const chooser = await chooserEvent;
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles(file);
  await expect(sheet.locator('[data-file-name]')).toHaveText(file.name);
}
async function savedScores(page) { return page.evaluate(() => window.VZ.song('s1').scores || []); }

test('Native PDF chooser opens, uploads through R2, and survives refresh without changing existing records', async ({page}) => {
  const r2 = await fakeR2(page); await boot(page);
  await page.evaluate(() => window.VZ.change(d => {
    d.songs[0].memo = '기존 곡 메모';
    d.practices.push({id:'practice-existing', songId:'s1', date:'2026-11-01', note:'기존 연습'});
    d.lessons.push({id:'lesson-existing', date:'2026-11-02', note:'기존 레슨'});
  }));
  const before = await page.evaluate(() => ({practices:window.VZ.db.practices, lessons:window.VZ.db.lessons}));
  const sheet = await openUploader(page);
  await choosePDF(page, sheet);
  await sheet.getByLabel('제목', {exact:true}).fill('공연용 악보');
  await sheet.getByLabel('원키', {exact:true}).selectOption('C');
  await sheet.getByLabel('연습 키', {exact:true}).selectOption('D');
  await sheet.getByRole('button', {name:'올리기', exact:true}).click();
  await expect(sheet).toHaveCount(0);
  const scores = await savedScores(page);
  expect(scores).toHaveLength(1);
  expect(scores[0]).toMatchObject({songId:'s1', title:'공연용 악보', fileName:PDF.name, originalKey:'C', practiceKey:'D', size:PDF.buffer.length});
  expect(scores[0].r2Key).toMatch(/^u\/ui-test-user\/score-[^/]+\/original\.pdf$/);
  expect(r2.store.get(scores[0].r2Key)).toEqual({bytes:PDF.buffer, type:'application/pdf'});
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.goto('/#/song/s1');
  await page.getByRole('tab', {name:'악보', exact:true}).click();
  await expect(page.locator('[data-score] .item-title')).toHaveText('공연용 악보');
  await expect(page.getByRole('button', {name:'공연용 악보 열기'})).toBeVisible();
  await expect(page.locator('[data-open]')).toHaveCount(0);
  expect(await savedScores(page)).toEqual(scores);
  expect(await page.evaluate(() => ({practices:window.VZ.db.practices, lessons:window.VZ.db.lessons}))).toEqual(before);
  expect(await page.evaluate(() => window.VZ.song('s1').memo)).toBe('기존 곡 메모');
});

test('Cloud unavailable still opens uploader and native chooser but blocks transfer', async ({page}) => {
  const r2 = await fakeR2(page); await boot(page, {endpoint:''});
  const sheet = await openUploader(page);
  await choosePDF(page, sheet);
  await sheet.getByRole('button', {name:'올리기', exact:true}).click();
  await expect(sheet.locator('[data-msg]')).toContainText('로그인과 클라우드 연결');
  expect(await savedScores(page)).toEqual([]);
  expect(r2.calls.filter(c => c.startsWith('POST /v1/uploads'))).toEqual([]);
});

test('Signed-out upload keeps selected file and does not create cloud objects', async ({page}) => {
  const r2 = await fakeR2(page); await boot(page);
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
  const sheet = await openUploader(page);
  await choosePDF(page, sheet);
  await sheet.getByRole('button', {name:'올리기', exact:true}).click();
  await expect(sheet.locator('[data-msg]')).toContainText('로그인과 클라우드');
  expect(await savedScores(page)).toEqual([]);
  expect(r2.calls.filter(c => c.startsWith('POST /v1/uploads'))).toEqual([]);
});

test('Rejected upload keeps file and title, then retries successfully', async ({page}) => {
  const r2 = await fakeR2(page); await boot(page);
  const sheet = await openUploader(page);
  await choosePDF(page, sheet);
  await sheet.getByLabel('제목', {exact:true}).fill('재시도 악보');
  r2.reject.auth = true;
  await sheet.getByRole('button', {name:'올리기', exact:true}).click();
  await expect(sheet.getByRole('button', {name:'다시 시도'})).toBeEnabled();
  await expect(sheet.locator('[data-file-name]')).toHaveText(PDF.name);
  await expect(sheet.getByLabel('제목', {exact:true})).toHaveValue('재시도 악보');
  expect(await savedScores(page)).toEqual([]);
  r2.reject.auth = false;
  await sheet.getByRole('button', {name:'다시 시도'}).click();
  await expect(sheet).toHaveCount(0);
  expect(await savedScores(page)).toHaveLength(1);
  expect(r2.store.size).toBe(1);
});

test('Metadata failure retries without uploading a duplicate PDF', async ({page}) => {
  const r2 = await fakeR2(page); await boot(page);
  const sheet = await openUploader(page); await choosePDF(page, sheet);
  await page.evaluate(() => {
    const change = window.VZ.change;
    let fail = true;
    window.VZ.change = (...args) => { if (fail) { fail = false; return false; } return change(...args); };
  });
  await sheet.getByRole('button', {name:'올리기', exact:true}).click();
  await expect(sheet.getByRole('button', {name:'다시 시도'})).toBeEnabled();
  expect(await savedScores(page)).toEqual([]);
  expect(r2.store.size).toBe(1);
  await sheet.getByRole('button', {name:'다시 시도'}).click();
  await expect(sheet).toHaveCount(0);
  expect(await savedScores(page)).toHaveLength(1);
  expect(r2.calls.filter(c => c === 'POST /v1/uploads')).toHaveLength(1);
  expect(r2.store.size).toBe(1);
});

test('Account change during transfer never attaches PDF to the new account', async ({page}) => {
  const r2 = await fakeR2(page); await boot(page);
  const sheet = await openUploader(page); await choosePDF(page, sheet);
  r2.reject.beforeComplete = () => page.evaluate(() => { window.vzipCloudUserId = () => 'another-user'; });
  await sheet.getByRole('button', {name:'올리기', exact:true}).click();
  await expect(sheet.locator('[data-msg]')).toContainText('로그인 계정이 바뀌었어요');
  expect(await savedScores(page)).toEqual([]);
  await sheet.getByRole('button', {name:'다시 시도'}).click();
  await expect(sheet.locator('[data-msg]')).toContainText('창을 닫고 다시 열어 주세요');
  expect(r2.calls.filter(c => c === 'POST /v1/uploads')).toHaveLength(1);
});

test('Non-PDF selection is rejected without an upload', async ({page}) => {
  const r2 = await fakeR2(page); await boot(page);
  const sheet = await openUploader(page);
  await choosePDF(page, sheet, {name:'photo.png', mimeType:'image/png', buffer:Buffer.from('not-pdf')});
  await sheet.getByRole('button', {name:'올리기', exact:true}).click();
  await expect(sheet.locator('[data-msg]')).toHaveText('PDF 파일만 올릴 수 있어요.');
  expect(r2.calls.filter(c => c === 'POST /v1/uploads')).toEqual([]);
  expect(await savedScores(page)).toEqual([]);
});
