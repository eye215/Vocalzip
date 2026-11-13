// Verify tablet clipping, touch targets and phone regressions on the remaining screens.
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
// Compare the rendered phone geometry before and after removing only the tablet override.
for(const [route,marker] of [['song/song1','.vz-song-detail-hero'],['lessons','.lesson-tabs'],['lesson/lesson1','[data-del-lesson]'],['growth','.growth-shell'],['settings','.vz-settings']]){
 test(route+' phone layout is unchanged by tablet rules',async({page})=>{
  await page.setViewportSize({width:390,height:844});await boot(page);await page.goto('/#/'+route);await expect(page.locator(marker)).toBeVisible();
  const snapshot=()=>page.evaluate(()=>[...document.querySelectorAll('#top, #view, #view *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility==='visible'&&!e.closest('details:not([open])')}).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return [e.tagName,e.className.toString(),...['x','y','width','height'].map(k=>Math.round(r[k]*10)/10),s.display,s.fontSize,s.lineHeight,s.padding,s.gridTemplateColumns]}));
  const before=await snapshot();await page.evaluate(()=>{const sheet=[...document.styleSheets].find(s=>s.href?.includes('wide-lists.css'));for(let i=sheet.cssRules.length-1;i>=0;i--)if(sheet.cssRules[i].cssText.includes('data-vz-route="lessons"'))sheet.deleteRule(i)});expect(await snapshot()).toEqual(before);
 });
}
test('long lesson feedback remains inside its card on tablets',async({page})=>{
 const seed=initial();seed.lessons[0].feedback='호흡 '.repeat(12)+'averylongunbrokenfeedbackword'.repeat(8);await page.setViewportSize({width:820,height:1180});await boot(page,{seed});await page.goto('/#/lesson/lesson1');
 const feedback=page.locator('#view>.card').nth(1);await expect(feedback).toContainText('averylong');
 for(const width of [768,820,1040,1180]){await page.setViewportSize({width,height:900});expect(await feedback.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
});

test('screen content and alternate tabs stay within tablet and phone viewports',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await boot(page);
 const check=async()=>{
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const clipped=await page.locator('#view h2,#view button,#view .item-title,#view .item-sub,#view .vz-song-detail-title').evaluateAll(els=>els.filter(e=>{
   const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(!r.width||!r.height||s.visibility==='hidden'||e.closest('details:not([open])'))return false;
   if(e.closest('.growth-chart-scroll')||s.textOverflow==='ellipsis')return false;
   return r.left < -1||r.right > innerWidth+1||(s.overflowX!=='visible'&&e.scrollWidth>e.clientWidth+1)||(s.overflowY==='hidden'&&e.scrollHeight>e.clientHeight+1);
  }).map(e=>e.outerHTML.slice(0,160)));
  expect(clipped).toEqual([]);
  if(page.viewportSize().width>=768){
   const controls=await page.locator('#top button,#top a,#view button,#view a.btn').evaluateAll(els=>els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility==='visible'&&!e.closest('details:not([open])')}).map(e=>{const r=e.getBoundingClientRect(),p=getComputedStyle(e,'::before');return {name:e.getAttribute('aria-label')||e.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height,touchW:Math.max(r.width,p.content!=='none'?parseFloat(p.width)||0:0),touchH:Math.max(r.height,p.content!=='none'?parseFloat(p.height)||0:0)}}));
   expect(controls.filter(r=>r.touchW<43.5||r.touchH<43.5)).toEqual([]);
   const overlaps=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1)overlaps.push([a.name,b.name])}expect(overlaps).toEqual([]);
  }
 };
 for(const width of [390,768,820,1040,1180]){
  await page.setViewportSize({width,height:900});
  await page.goto('/#/song/song1');await expect(page.locator('.song-tabs')).toBeVisible();
  for(const tab of ['media','lyrics','scores','timeline','ar']){await page.locator('[data-tab="'+tab+'"]').click();await check()}
  await page.goto('/#/lessons');for(const tab of ['upcoming','past','cancelled']){await page.locator('[data-lt="'+tab+'"]').click();await check()}
  await page.goto('/#/lesson/lesson1');await expect(page.locator('[data-del-lesson]')).toBeVisible();await check();
  await page.goto('/#/growth');for(const period of ['week','28','month','all']){await page.locator('[data-pd="'+period+'"]').click();await check()}
  await page.goto('/#/settings');await expect(page.locator('.vz-settings')).toBeVisible();await check();
 }
});
