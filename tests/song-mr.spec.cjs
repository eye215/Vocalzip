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
