// VOCAL.zip v6 UI: main user flows, data compatibility with v5 records, and mobile layout.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:info=>info.title==='Bottom navigation reaches the five main screens without horizontal overflow'});
const fs = require('node:fs'), path = require('node:path');
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};let writing=false;for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert'){window.__up.push(a[0]);writing=true}return c};c.then=r=>r({data:writing?[{user_id:'ui-test-user'}]:[],error:null});return c}})};`;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
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



async function openReferences(page){await page.goto('/#/song/s1');await page.locator('[data-tab=ar]').click();await expect(page.locator('[data-mr-add]')).toBeVisible();}
const mrDialog=page=>page.getByRole('dialog',{name:'MR 추가',exact:true});
test('MR YouTube links save above AR, survive reload, and open inline only after a tap',async({page})=>{
 const seed=legacy();seed.songs[0].arLinks=[{id:'ar1',label:'기존 AR',url:'https://example.com/ar'}];
 await boot(page,{seed,media:false});await openReferences(page);
 expect(await page.locator('[data-body] section[aria-label]').evaluateAll(els=>els.map(x=>x.getAttribute('aria-label')))).toEqual(['MR 반주','AR 레퍼런스']);
 await page.locator('[data-mr-add]').click();
 await mrDialog(page).locator('[name=kind]').selectOption('youtube');
 await mrDialog(page).locator('[name=title]').fill('공연 반주');
 await mrDialog(page).locator('[name=url]').fill('https://youtube.com.evil.invalid/watch?v=dQw4w9WgXcQ');
 await expect(mrDialog(page).locator('[data-mr-save]')).toBeDisabled();
 await mrDialog(page).locator('[name=url]').fill('https://youtu.be/dQw4w9WgXcQ?t=10');
 await mrDialog(page).locator('[data-mr-save]').click();await expect(mrDialog(page)).toHaveCount(0);
 await expect(page.locator('[data-mr-open]')).toContainText('공연 반주');
 await expect(page.locator('.vz-mr-links iframe')).toHaveCount(0);
 await page.reload();await page.locator('[data-tab=ar]').click();
 await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<p>video fixture</p>'}));
 await page.locator('[data-mr-open]').click();
 await expect(page.locator('.vz-mr-links iframe')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 await expect(page.locator('.vz-ar-list')).toContainText('기존 AR');
 await page.locator('[data-mr-open]').click();await expect(page.locator('.vz-mr-links iframe')).toHaveCount(0);
 const saved=await data(page);expect(saved.songs[0].mrTracks[0].kind).toBe('youtube');expect(saved.songs[0].arLinks).toEqual(seed.songs[0].arLinks);
});
test('MR file uses private upload and retries metadata save without duplicating a file or practice',async({page})=>{
 await boot(page);await openReferences(page);
 const original=await data(page),mediaCount=(await media(page)).length;
 await page.evaluate(()=>{
  window.vzipCloudUserId=()=> 'mr-owner';window.vzipCloudSignedIn=()=>true;window.__mrUploads=[];window.__mrRemoved=[];
  window.VzipR2={enabled:()=>true,prefetch:async()=>{},url:async()=>'/mr-test.wav',upload:async(file,options)=>{window.__mrUploads.push({name:file.name,id:options.mediaId,type:options.type});return {key:'u/mr-owner/'+options.mediaId+'/original.wav'}},remove:async key=>window.__mrRemoved.push(key)};
  const change=VZ.change;window.__failMRsave=true;VZ.change=(...args)=>{if(window.__failMRsave){window.__failMRsave=false;return false}return change(...args)};
 });
 await page.locator('[data-mr-add]').click();
 await mrDialog(page).locator('[name=file]').setInputFiles({name:'반주.wav',mimeType:'audio/wav',buffer:Buffer.from('fixture audio')});
 await mrDialog(page).locator('[name=title]').fill('연습 MR');
 await mrDialog(page).locator('[data-mr-save]').click();
 await expect(mrDialog(page).locator('[data-mr-status]')).toContainText('목록을 저장하지 못했어요');
 await mrDialog(page).locator('[data-mr-save]').click();await expect(mrDialog(page)).toHaveCount(0);
 expect(await page.evaluate(()=>window.__mrUploads.length)).toBe(1);
 await page.locator('[data-mr-open]').click();await expect(page.locator('.vz-mr-links audio')).toHaveAttribute('src','/mr-test.wav');
 expect((await data(page)).practices).toEqual(original.practices);expect((await media(page)).length).toBe(mediaCount);
 await page.locator('[data-mr-remove]').click();
 await page.getByRole('dialog',{name:'MR 삭제',exact:true}).getByRole('button',{name:'삭제',exact:true}).click();
 await expect(page.locator('[data-mr-open]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__mrRemoved.length)).toBe(1);
});

/* MR 키 바꿔 재생 (app/mr-key-shift.js). The pinned shifter library comes from jsDelivr; CI packs the same version
 * locally (ui-checks.yml) and sandboxes without CDN access can point VZ_SIGNALSMITH at a copy. */
const STRETCH = process.env.VZ_SIGNALSMITH || '/tmp/vzip-signalsmith/package/SignalsmithStretch.mjs';
async function stretchLib(page) {
 if (fs.existsSync(STRETCH)) await page.context().route('**/signalsmith-stretch@1.3.2/SignalsmithStretch.mjs', r => r.fulfill({path:STRETCH, contentType:'text/javascript', headers:{'access-control-allow-origin':'*'}}));
}
function wav(seconds = 3, sr = 44100) {
 const n = seconds * sr, b = Buffer.alloc(44 + n * 2);
 b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
 for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 8000), 44 + i * 2);
 return b;
}
test('MR key shifter moves A4 by semitones without changing its length', async ({page}) => {
 await stretchLib(page); await boot(page, {media:false});
 const results = await page.evaluate(async () => {
  const sr = 48000, out = [];
  for (const semitones of [2, -3]) {
   const ctx = new OfflineAudioContext(2, sr * 4, sr), buf = ctx.createBuffer(2, sr * 3, sr);
   for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = t >= 0.5 && t < 2.5 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0; } }
   const src = ctx.createBufferSource(); src.buffer = buf;
   const node = await VZ.mrKey.createShifter(ctx);
   src.connect(node); node.connect(ctx.destination);
   await node.schedule({active:true, semitones}); src.start(0);
   const d = (await ctx.startRendering()).getChannelData(0);
   let first = -1, last = -1; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.05) { if (first < 0) first = i; last = i; }
   const mid = Math.round((first + last) / 2), zc = [];
   for (let i = mid - sr / 2; i < mid + sr / 2; i++) if (d[i - 1] < 0 && d[i] >= 0) zc.push(i - 1 + -d[i - 1] / (d[i] - d[i - 1]));
   const hz = sr * (zc.length - 1) / (zc.at(-1) - zc[0]), target = 440 * 2 ** (semitones / 12);
   out.push({semitones, hz, cents:1200 * Math.log2(hz / target), length:(last - first) / sr});
  }
  return out;
 });
 for (const r of results) {
  expect(Math.abs(r.cents), JSON.stringify(r)).toBeLessThan(10);
  expect(Math.abs(r.length / 2 - 1), JSON.stringify(r)).toBeLessThan(0.01);
 }
});
test('File MR key capsule shifts playback, is remembered per song, and never touches the stored file', async ({page}) => {
 const seed = legacy(), track = {id:'mr1', kind:'file', title:'연습 MR', fileName:'반주.wav', type:'audio/wav', r2Key:'u/mr-owner/mr1/original.wav', size:264644, created:1};
 seed.songs[0].mrTracks = [track]; seed.songs[0].repertoire = {originalKey:'D', practiceKey:'F'};
 const body = wav(), mediaRequests = [];
 await stretchLib(page);
 await page.route('**/mr-test.wav', r => { mediaRequests.push(r.request().method()); return r.fulfill({body, contentType:'audio/wav', headers:{'accept-ranges':'none'}}); });
 await boot(page, {seed, media:false});
 const stubR2 = () => {
  window.vzipCloudUserId = () => 'mr-owner'; window.vzipCloudSignedIn = () => true; window.__mrUploads ??= 0; window.__mrRemoved ??= 0;
  window.VzipR2 = {enabled:() => true, prefetch:async () => {}, url:async () => '/mr-test.wav', upload:async () => { window.__mrUploads++; return {key:'x'}; }, remove:async () => { window.__mrRemoved++; }};
 };
 await page.evaluate(stubR2);
 await openReferences(page);
 const key = page.locator('[data-mr-key]'), value = key.locator('[data-mr-key-value]'), audio = page.locator('.vz-mr-links audio');
 await page.locator('[data-mr-open]').click();
 await expect(key).toBeVisible(); await expect(value).toHaveText('원키');
 await expect(audio).toHaveAttribute('src', '/mr-test.wav'); await expect(audio).toHaveAttribute('crossorigin', 'anonymous');
 // Original key plays natively: no audio graph until a shift is chosen.
 expect(await audio.getAttribute('data-mr-key-route')).toBeNull();
 for (const b of await key.locator('button').all()) { const box = await b.boundingBox(); if (await b.isVisible()) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44); }
 await expect(key.locator('[data-mr-key-practice]')).toContainText('연습 키 F');
 await expect(key.locator('[data-mr-key-practice]')).toContainText('MR +3으로 맞추기');
 await key.locator('[data-mr-key-up]').click(); await key.locator('[data-mr-key-up]').click();
 await expect(value).toHaveText('+2');
 await expect(audio).toHaveAttribute('data-mr-key-route', 'shifted');
 await expect.poll(async () => (await data(page)).songs[0].mrKeyShift).toBe(2);
 await audio.evaluate(el => el.play());
 await expect.poll(() => audio.evaluate(el => el.currentTime)).toBeGreaterThan(0.3);
 expect(await page.evaluate(() => VZ.mrKey.context().state)).toBe('running');
 await key.locator('[data-mr-key-practice]').click();
 await expect(value).toHaveText('+3'); await expect(key.locator('[data-mr-key-practice]')).toContainText('MR 맞춤');
 await expect.poll(async () => (await data(page)).songs[0].mrKeyShift).toBe(3);
 for (let i = 0; i < 12; i++) if (await key.locator('[data-mr-key-up]').isEnabled()) await key.locator('[data-mr-key-up]').click();
 await expect(value).toHaveText('+6'); await expect(key.locator('[data-mr-key-up]')).toBeDisabled();
 for (let i = 0; i < 9; i++) await key.locator('[data-mr-key-down]').click();
 await expect(value).toHaveText('−3');
 await expect.poll(async () => (await data(page)).songs[0].mrKeyShift).toBe(-3);
 // Remembered per song: a fresh page opens the MR in the same key and the row says so before opening.
 await page.reload(); await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await page.evaluate(stubR2);
 await page.locator('[data-tab=ar]').click();
 await expect(page.locator('[data-mr-open] small')).toContainText('키 −3');
 await page.locator('[data-mr-open]').click();
 await expect(value).toHaveText('−3'); await expect(audio).toHaveAttribute('data-mr-key-route', 'shifted');
 await value.click(); await expect(value).toHaveText('원키'); await expect(audio).toHaveAttribute('data-mr-key-route', 'direct');
 await expect.poll(async () => (await data(page)).songs[0].mrKeyShift).toBe(0);
 // Closing the player tears the graph down.
 await page.locator('[data-mr-open]').click(); await expect(key).toHaveCount(0);
 // The stored MR is untouched: same entry, no upload/delete, and the file was only ever read.
 const saved = await data(page);
 expect(saved.songs[0].mrTracks).toEqual([track]);
 expect(await page.evaluate(() => [window.__mrUploads, window.__mrRemoved])).toEqual([0, 0]);
 expect(mediaRequests.length).toBeGreaterThan(0); expect(mediaRequests.every(m => m === 'GET')).toBe(true);
 expect(page.__errors).toEqual([]);
});
test('YouTube MR hides the key capsule and says why', async ({page}) => {
 const seed = legacy(); seed.songs[0].mrKeyShift = 2;
 seed.songs[0].mrTracks = [{id:'mr-y', kind:'youtube', videoId:'dQw4w9WgXcQ', url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title:'유튜브 반주', created:1}];
 await boot(page, {seed, media:false});
 await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({contentType:'text/html', body:'<p>video fixture</p>'}));
 await openReferences(page);
 await expect(page.locator('[data-mr-open] small')).toHaveText('유튜브 영상');
 await page.locator('[data-mr-open]').click();
 await expect(page.locator('.vz-mr-links iframe')).toBeVisible();
 await expect(page.locator('[data-mr-key]')).toHaveCount(0);
 await expect(page.locator('[data-mr-key-off]')).toContainText('유튜브 MR은 키를 바꿀 수 없어요');
});
