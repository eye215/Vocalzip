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
test('File MR key capsule shifts playback, is remembered per MR, and never touches the stored file', async ({page}) => {
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
 await expect.poll(async () => (await data(page)).songs[0].mrTracks[0].keyShift).toBe(2);
 await audio.evaluate(el => el.play());
 await expect.poll(() => audio.evaluate(el => el.currentTime)).toBeGreaterThan(0.3);
 expect(await page.evaluate(() => VZ.mrKey.context().state)).toBe('running');
 await key.locator('[data-mr-key-practice]').click();
 await expect(value).toHaveText('+3'); await expect(key.locator('[data-mr-key-practice]')).toContainText('MR 맞춤');
 await expect.poll(async () => (await data(page)).songs[0].mrTracks[0].keyShift).toBe(3);
 for (let i = 0; i < 12; i++) if (await key.locator('[data-mr-key-up]').isEnabled()) await key.locator('[data-mr-key-up]').click();
 await expect(value).toHaveText('+6'); await expect(key.locator('[data-mr-key-up]')).toBeDisabled();
 for (let i = 0; i < 9; i++) await key.locator('[data-mr-key-down]').click();
 await expect(value).toHaveText('−3');
 await expect.poll(async () => (await data(page)).songs[0].mrTracks[0].keyShift).toBe(-3);
 // Remembered per MR: a fresh page opens the MR in the same key and the row says so before opening.
 await page.reload(); await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await page.evaluate(stubR2);
 await page.locator('[data-tab=ar]').click();
 await expect(page.locator('[data-mr-open] small')).toContainText('키 −3');
 await page.locator('[data-mr-open]').click();
 await expect(value).toHaveText('−3'); await expect(audio).toHaveAttribute('data-mr-key-route', 'shifted');
 await value.click(); await expect(value).toHaveText('원키'); await expect(audio).toHaveAttribute('data-mr-key-route', 'direct');
 await expect.poll(async () => (await data(page)).songs[0].mrTracks[0].keyShift).toBe(0);
 // Closing the player tears the graph down.
 await page.locator('[data-mr-open]').click(); await expect(key).toHaveCount(0);
 // The stored MR is untouched: same entry (plus its remembered key), no upload/delete, and the file was only ever read.
 const saved = await data(page);
 expect(saved.songs[0].mrTracks).toEqual([{...track, keyShift:0}]); expect(saved.songs[0].mrKeyShift).toBeUndefined();
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

// Private downloads: fake audio only. A bare cross-origin audio URL plays in Safari;
// our mock storage only sends attachment when the existing download contract is requested.
const downloadHost='https://media-download.example.invalid';
async function privateDownloads(page,{tracks=true}={}){
 const seed=legacy();
 if(tracks)seed.songs[0].mrTracks=[
  {id:'mr-download',kind:'file',title:'테스트 MR',fileName:'테스트 원본.WAV',type:'audio/wav',r2Key:'u/test-owner/mr-download/original.wav',size:12345,keyShift:3},
  {id:'mr-video',kind:'youtube',title:'테스트 영상',url:'https://youtu.be/dQw4w9WgXcQ'}
 ];
 const bytes=wav(1),requests=[];
 await page.route(downloadHost+'/**',async route=>{
  const url=new URL(route.request().url());requests.push(url);
  const name=url.searchParams.get('download'),headers={'access-control-allow-origin':'*'};
  if(name)headers['content-disposition']="attachment; filename=\"fixture.wav\"; filename*=UTF-8''"+encodeURIComponent(name);
  await route.fulfill({contentType:'audio/wav',headers,body:bytes});
 });
 await boot(page,{seed,media:false});
 await page.evaluate(host=>{
  window.__downloadOwner='test-owner';window.__downloadSession='test-session';
  window.vzipCloudUserId=()=>window.__downloadOwner;window.vzipCloudSessionId=()=>window.__downloadSession;
  window.vzipCloudSignedIn=()=>true;window.__downloadSigns=[];
  window.VzipR2={prefetch:async()=>{},url:async key=>{window.__downloadSigns.push(key);if(window.__signError)throw Error('테스트 연결 실패');if(window.__holdSign)await new Promise(resolve=>window.__releaseSign=resolve);return host+'/original.wav?sig=fake';}};
  window.vzipCloudMediaUrl=item=>window.VzipR2.url(item.r2Key);
 },downloadHost);
 await openReferences(page);
 return {bytes,requests};
}
test('Uploaded MR downloads original bytes and filename, not its playback key shift',async({page})=>{
 const {bytes,requests}=await privateDownloads(page),before=await data(page);
 const downloadButton=page.getByRole('button',{name:'테스트 MR MR 다운로드',exact:true});
 await expect(downloadButton).toBeVisible();
 expect(await page.locator('[data-mr="mr-video"] [data-mr-download]').count()).toBe(0);
 const [download]=await Promise.all([page.waitForEvent('download'),downloadButton.click()]);
 expect(download.suggestedFilename()).toMatch(/^(테스트 원본\.WAV|download)$/);
 expect(fs.readFileSync(await download.path())).toEqual(bytes);
 expect(requests.at(-1).searchParams.get('download')).toBe('테스트 원본.WAV');
 expect(await data(page)).toEqual(before);
 expect(await media(page)).toEqual([]);
 await expect(page.locator('.vz-mr-links audio')).toHaveCount(0);
});
test('MR signing failure retries and repeated taps make only one pending download',async({page})=>{
 await privateDownloads(page);const button=page.locator('[data-mr-download]');
 await page.evaluate(()=>window.__signError=true);
 await button.click();await expect(page.locator('.toast').last()).toContainText('테스트 연결 실패');await expect(button).toBeEnabled();
 await page.evaluate(()=>{window.__signError=false;window.__holdSign=true;});
 await button.evaluate(el=>{el.click();el.click();});await expect(button).toBeDisabled();
 expect(await page.evaluate(()=>window.__downloadSigns.length)).toBe(2);
 const pending=page.waitForEvent('download');await page.evaluate(()=>window.__releaseSign());await pending;
 await expect(button).toBeEnabled();
});
for(const leave of ['account','session','logout','screen'])test('Pending MR download stops after '+leave+' changes',async({page})=>{
 await privateDownloads(page);const downloads=[];page.on('download',d=>downloads.push(d));
 await page.evaluate(()=>window.__holdSign=true);await page.locator('[data-mr-download]').click();
 await expect.poll(()=>page.evaluate(()=>!!window.__releaseSign)).toBe(true);
 if(leave==='screen'){await page.goto('/#/home');}else await page.evaluate(leave=>{
  if(leave==='session')window.__downloadSession='another-session';else window.__downloadOwner=leave==='logout'?'':'another-owner';
 },leave);
 await page.evaluate(()=>window.__releaseSign());
 await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-mr-download]')?.disabled||false)).toBe(false);
 expect(downloads).toHaveLength(0);
});
test('Legacy cloud recording with unknown size downloads instead of opening a Safari media page',async({page})=>{
 const {bytes,requests}=await privateDownloads(page,{tracks:false});
 const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>VZ.media.download({id:'test-recording',name:'테스트 녹음',type:'audio/wav',cloud:true,path:'test-owner/original.wav'}))]);
 expect(fs.readFileSync(await download.path())).toEqual(bytes);
 expect(requests.at(-1).searchParams.get('download')).toBe('테스트 녹음.wav');
 expect(new URL(page.url()).hash).toBe('#/song/s1');
});
test('Recording download strips stale bin and duplicate audio suffixes without changing metadata',async({page})=>{
 await boot(page,{media:false});
 const names=await page.evaluate(async()=>{
  const names=[],original=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){names.push(this.download)};
  try{
   for(const name of ['테스트 녹음.bin','테스트 녹음.bin.m4a','테스트 녹음.M4A','테스트 녹음.bin.bin'])await VZ.media.download({name,type:'audio/mp4',bytes:new Uint8Array([1,2,3])});
  }finally{HTMLAnchorElement.prototype.click=original;}
  return names;
 });
 expect(names).toEqual(Array(4).fill('테스트 녹음.m4a'));
});
test('Long recording download filename fits a filesystem component and retains the audio extension',async({page})=>{
 await boot(page,{media:false});
 const name=await page.evaluate(async()=>{
  let name;const original=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){name=this.download};
  try{await VZ.media.download({name:'테스트 녹음'.repeat(50)+'.bin',type:'audio/mp4',bytes:new Uint8Array([1,2,3])});}finally{HTMLAnchorElement.prototype.click=original;}
  return name;
 });
 expect(Buffer.byteLength(name,'utf8')).toBeLessThanOrEqual(180);
 expect(name.endsWith('.m4a')).toBe(true);expect(name).not.toContain('.bin');
});
test('MR download controls keep 44px targets and no overflow on narrow phones',async({page})=>{
 await privateDownloads(page);
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  const geometry=await page.locator('[data-mr="mr-download"] .vz-mr-row-head').evaluate(el=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   buttons:[...el.querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))
  }));
  expect(geometry.overflow).toBe(false);
  for(const button of geometry.buttons){expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);}
 }
 if(process.env.VZIP_DOWNLOAD_EVIDENCE){
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(process.env.VZIP_DOWNLOAD_EVIDENCE,'mr-download.png'),fullPage:true});
 }
});
test('Unavailable recording download keeps the app and data, and does not download an error page',async({page})=>{
 await privateDownloads(page,{tracks:false});const before=await data(page),downloads=[];page.on('download',d=>downloads.push(d));
 await page.route(downloadHost+'/**',r=>r.fulfill({status:404,headers:{'access-control-allow-origin':'*'},body:'fake missing file'}));
 const error=await page.evaluate(()=>VZ.media.download({id:'test-missing',name:'테스트 녹음',cloud:true,type:'audio/wav'}).then(()=>null,e=>e.message));
 expect(error).toContain('404');expect(downloads).toHaveLength(0);expect(await data(page)).toEqual(before);
 expect(new URL(page.url()).hash).toBe('#/song/s1');
});
test('Recording download refuses a different account before reading its bytes',async({page})=>{
 await privateDownloads(page,{tracks:false});
 const error=await page.evaluate(()=>VZ.media.download({id:'foreign',accountOwner:'different-owner',name:'테스트 녹음',type:'audio/wav',bytes:new Uint8Array([1,2,3])}).then(()=>null,e=>e.message));
 expect(error).toContain('계정');expect(await page.evaluate(()=>window.__downloadSigns)).toEqual([]);
});
test('Local recording downloads unchanged bytes with one m4a suffix',async({page})=>{
 await boot(page,{media:false});const before=await data(page);
 const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>VZ.media.download({id:'test-local',name:'테스트 녹음.bin.m4a',type:'audio/mp4',bytes:new Uint8Array([11,22,33,44])}))]);
 expect(download.suggestedFilename()).toMatch(/^(테스트 녹음\.m4a|download)$/);
 expect(fs.readFileSync(await download.path())).toEqual(Buffer.from([11,22,33,44]));
 expect(await data(page)).toEqual(before);
});
test('Recording download stops if account changes while audio bytes are arriving',async({page})=>{
 await privateDownloads(page,{tracks:false});let release,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 const downloads=[];page.on('download',d=>downloads.push(d));
 await page.route(downloadHost+'/**',async route=>{started();await gate;await route.fulfill({contentType:'audio/wav',headers:{'access-control-allow-origin':'*'},body:wav(1)});});
 await page.evaluate(()=>{window.__downloadJob=VZ.media.download({id:'test-inflight',name:'테스트 녹음',cloud:true,storageProvider:'r2',type:'audio/wav',r2Key:'u/test-owner/test-inflight/original.wav'}).then(()=>null,e=>e.message);});
 await ready;await page.evaluate(()=>window.__downloadOwner='another-owner');release();
 expect(await page.evaluate(()=>window.__downloadJob)).toContain('계정');expect(downloads).toHaveLength(0);
});
function fakeM4aHeader(brand='M4A '){
 const b=Buffer.alloc(64);b.writeUInt32BE(28,0);b.write('ftyp',4);b.write(brand,8);b.write('M4A isommp42',16);return b;
}
for(const source of ['local','cloud'])test('M4A bytes with missing format metadata download as m4a from '+source,async({page})=>{
 const bytes=fakeM4aHeader();await privateDownloads(page,{tracks:false});const before=await data(page);
 await page.route(downloadHost+'/**',r=>r.fulfill({contentType:'application/octet-stream',headers:{'access-control-allow-origin':'*'},body:bytes}));
 await page.evaluate(()=>{const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){window.__savedAudioName=this.download;window.__savedAudioMime=fetch(this.href).then(r=>r.blob()).then(b=>b.type);return click.call(this);};});
 const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(([source,bytes])=>VZ.media.download({id:'fake-unknown-m4a',name:'테스트 녹음.bin',type:'application/octet-stream',...(source==='local'?{bytes:new Uint8Array(bytes)}:{cloud:true,storageProvider:'r2',r2Key:'u/test-owner/fake-unknown-m4a/original.bin'})}),[source,[...bytes]])]);
 expect(await page.evaluate(()=>window.__savedAudioName)).toBe('테스트 녹음.m4a');
 expect(await page.evaluate(()=>window.__savedAudioMime)).toBe('audio/mp4');
 expect(fs.readFileSync(await download.path())).toEqual(bytes);expect(await data(page)).toEqual(before);
});
test('Unknown bytes and a generic MP4 brand are not mislabeled as audio M4A',async({page})=>{
 await boot(page,{media:false});
 const names=await page.evaluate(async examples=>{
  const names=[],original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){names.push(this.download)};
  try{for(const bytes of examples)await VZ.media.download({name:'테스트 파일.bin',type:'application/octet-stream',bytes:new Uint8Array(bytes)});}finally{HTMLAnchorElement.prototype.click=original;}
  return names;
 },[[1,2,3],[...fakeM4aHeader('isom')]]);
 expect(names).toEqual(['테스트 파일.bin','테스트 파일.bin']);
});
