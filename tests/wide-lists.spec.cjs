// Tablet widths (768px+): 내 곡, 전체 녹음 and 기록 use the 1040px column (app/wide-lists.css); phones keep one column.
// Fixture data only: a mocked Supabase client, made-up songs, and silent fake recordings in IndexedDB.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY='vocal-zip_mvp_v1';
const titles=['This Is the Moment','On My Own','Defying Gravity','Think of Me','Seasons of Love','나는 나만의 것','황금별','레베카'];
const day=d=>'2026-11-'+String(d).padStart(2,'0');
const initial=()=>({categories:[],songs:titles.map((title,i)=>({id:'song'+(i+1),title,show:'작품 '+(i+1)})),
 lessons:[{id:'lesson1',date:day(3),songId:'song1',feedback:'호흡 길게'}],
 practices:[1,2,3,4,5].map(d=>({id:'p'+d,date:day(d),songId:'song'+d,minutes:20+d,memo:'연습 '+d})),assignments:[],comparisonReports:[]});
const sdk="window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'archive-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'test-token'}}})},from:table=>{const c={};let method='select';for(const k of ['select','eq','is','order','range','limit','in','upsert','update','delete','maybeSingle'])c[k]=()=>c;for(const k of ['upsert','update'])c[k]=v=>{method=k;if(table==='vocal_data'){(window.__archiveWrites||=[]).push(v.payload);window.__archiveRemote=v.payload}return c};c.then=r=>r({data:table==='vocal_data'&&method==='select'&&window.__archiveRemote?{payload:window.__archiveRemote,updated_at:null}:['update','upsert'].includes(method)?[{user_id:'archive-user'}]:[],error:null});return c},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/file.wav'}})})}})};";
async function boot(page,{seed=initial(),remote=null}={}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page._archiveErrors=errors;
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:sdk}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(([key,data,remote])=>{window.__archiveRemote=remote;if(!sessionStorage.getItem('archiveSeed')){localStorage.setItem(key,JSON.stringify(data));sessionStorage.setItem('archiveSeed','1')}},[KEY,seed,remote]);
 await page.goto('/#/songs');await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await expect(page.getByRole('link',{name:'나의 공연',exact:true})).toBeVisible();
}
async function seedRecordings(page){
 await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vocalzip_media_v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('recordings',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  await new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readwrite');
   for(let i=0;i<5;i++)tx.objectStore('recordings').put({id:'rec'+i,name:'테스트 녹음 '+(i+1)+'.m4a',type:'audio/mp4',source:'practice',songId:'song'+(i+1),created:Date.UTC(2026,10,10-i,9),durationSeconds:60,bytes:new Uint8Array(8).buffer});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  db.close();
 });
 await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
}
const box=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom),w:Math.round(r.width)}});
/** How many cards share the first row's top edge. */
const firstRow=async items=>{const boxes=await items.evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().top)));return boxes.filter(t=>t===boxes[0]).length};

test('내 곡 song cards fill a tablet in a grid and stay one column on a phone',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await boot(page);
 const items=page.locator('.vz-song-list>.item');await expect(items).toHaveCount(8);
 expect(await firstRow(items)).toBe(2);
 const app=await box(page.locator('.v-app'));expect(app.w).toBeGreaterThan(760);
 await page.setViewportSize({width:1180,height:820});
 await expect.poll(()=>firstRow(items)).toBe(3);
 expect((await box(page.locator('.v-app'))).w).toBe(1040);
 // The record button follows the wider column's right edge instead of the phone column's.
 const fab=await box(page.locator('.vz-collection-record'));const wide=await box(page.locator('.v-app'));
 expect(fab.r).toBeLessThanOrEqual(wide.r);expect(fab.r).toBeGreaterThan(wide.r-60);
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>firstRow(items)).toBe(1);
});

test('전체 녹음 lists a month in two columns on a tablet and opens a row in place',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await boot(page);await page.goto('/#/library');await seedRecordings(page);
 const rows=page.locator('.lib-month .list>[data-media]');await expect(rows).toHaveCount(5);
 expect(await firstRow(rows)).toBe(2);
 await rows.nth(2).locator('[data-toggle]').click();
 await expect(rows.nth(2).locator('.media-open')).toBeVisible();
 const opened=await box(rows.nth(2).locator('.media-open'));const card=await box(page.locator('.lib-month .list'));
 expect(opened.w).toBeLessThan(card.w/2+8);
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>firstRow(rows)).toBe(1);
});

test('기록 shows the chosen day beside the calendar on a tablet and below it on a phone',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await boot(page);await page.goto('/#/calendar');
 const calendar=page.locator('.vz-calendar-month'),dayList=page.locator('[data-day]'),summary=page.locator('[data-calendar-summary]');
 await expect(calendar).toBeVisible();await page.locator('.cal-day[data-d="'+day(3)+'"]').click();
 await expect(dayList).toContainText('11월 3일');
 const c=await box(calendar),d=await box(dayList),s=await box(summary);
 expect(d.x).toBeGreaterThanOrEqual(c.r);expect(Math.abs(d.y-s.y)).toBeLessThan(4);
 expect(c.y).toBeLessThan(s.b+20); // no gap opened between the summary and the calendar
 await page.setViewportSize({width:390,height:844});
 await expect.poll(async()=>(await box(dayList)).y>(await box(calendar)).b-1).toBe(true);
});
