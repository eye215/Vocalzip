// Tablet widths (768px+): 내 곡, 전체 녹음 and 기록 use the 1040px column (app/wide-lists.css); phones keep one column.
// Fixture data only: a mocked Supabase client, made-up songs, and silent fake recordings in IndexedDB.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY='vocal-zip_mvp_v1';
const titles=['This Is the Moment','On My Own','Defying Gravity','Think of Me','Seasons of Love','나는 나만의 것','황금별','레베카'];
const day=d=>'2026-11-'+String(d).padStart(2,'0');
const initial=()=>({categories:[],songs:titles.map((title,i)=>({id:'song'+(i+1),title,show:'작품 '+(i+1)})),
 lessons:[{id:'lesson1',date:day(3),songId:'song1',feedback:'호흡 길게'},...['a','b','c'].map((id,i)=>({id:'future'+id,date:'2099-11-0'+(i+1),songId:'song1',status:'scheduled'}))],
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



for(const [route,marker] of [['song/song1','.vz-song-detail-hero'],['lessons','.lesson-tabs'],['lesson/lesson1','[data-del-lesson]'],['growth','.growth-shell'],['settings','.vz-settings']]){
 test(route+' responds without overflow and preserves phone width',async({page})=>{
  await page.setViewportSize({width:820,height:1180});await boot(page);await page.goto('/#/'+route);await expect(page.locator(marker)).toBeVisible();
  for(const width of [820,1040,1180,767,390]){
   await page.setViewportSize({width,height:900});
   const app=page.locator('.v-app');const actual=(await app.boundingBox()).width; if(width>=768){expect(actual).toBeGreaterThanOrEqual(Math.min(width-20,1020));expect(actual).toBeLessThanOrEqual(1040)}else{expect(actual).toBeLessThanOrEqual(640)}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   const bad=await page.locator('#top button,#top a,#view button:visible').evaluateAll(els=>els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.left < -1||r.right>innerWidth+1)}).map(e=>e.outerHTML.slice(0,100)));
   expect(bad).toEqual([]);
   if(width>=768){
    const controls=await page.locator('#top button,#top a,#view button').evaluateAll(els=>els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('details:not([open])')}).map(e=>{const r=e.getBoundingClientRect();const before=getComputedStyle(e,'::before');return {label:e.getAttribute('aria-label')||e.textContent.trim(),x:r.x,y:r.y,w:Math.max(r.width,parseFloat(before.width)||0),h:Math.max(r.height,parseFloat(before.height)||0)}}));
    expect(controls.filter(r=>r.w<43.5||r.h<43.5)).toEqual([]);
    const overlaps=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1)overlaps.push([a.label,b.label])}expect(overlaps).toEqual([]);
   }
  }
 });
}

test('tablet columns and controls return to phone layout',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await boot(page);
 await page.goto('/#/lessons');const rows=page.locator('#view>.list>.item');await expect(rows).toHaveCount(3);expect(await firstRow(rows)).toBe(2);await page.setViewportSize({width:390,height:844});expect(await firstRow(rows)).toBe(1);await page.setViewportSize({width:820,height:1180});
 await page.goto('/#/lesson/lesson1');await expect(page.locator('[data-del-lesson]')).toBeVisible();
 const info=page.locator('#view>.card').first(), feedback=page.locator('[data-fb]');
 expect((await feedback.boundingBox()).x).toBeGreaterThan((await info.boundingBox()).x+(await info.boundingBox()).width);
 for(const b of await page.locator('#view>.sec button,#view>.sec a').all()){const r=await b.boundingBox();expect(r.height).toBeGreaterThanOrEqual(44)}
 await page.setViewportSize({width:390,height:844});expect((await feedback.boundingBox()).y).toBeGreaterThan((await info.boundingBox()).y+(await info.boundingBox()).height-1);
 await page.goto('/#/settings');const account=page.locator('.vz-settings-account'),journey=page.locator('.vz-journey');
 expect((await journey.boundingBox()).y).toBeGreaterThan((await account.boundingBox()).y);
 await page.setViewportSize({width:820,height:1180});expect((await journey.boundingBox()).x).toBeGreaterThan((await account.boundingBox()).x);
});
