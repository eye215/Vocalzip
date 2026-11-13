// App shell / 기록 tab / 설정 audit regressions.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const stub="window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},\n storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},\n from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert')window.__up.push(a[0]);return c};c.then=r=>r({data:[],error:null});return c}})};";
const KEY='vocal-zip_mvp_v1';
const pad=n=>String(n).padStart(2,'0'),ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d)};
const seed=()=>({categories:[],songs:[{id:'s1',title:'지금 이 순간'}],lessons:[],assignments:[],practices:[],comparisonReports:[]});
async function boot(page,{hash='#/calendar',data=seed()}={}){
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(([k,s])=>{if(!sessionStorage.getItem('seed')){localStorage.setItem(k,JSON.stringify(s));sessionStorage.setItem('seed','1')}},[KEY,data]);
 await page.goto('/'+hash);await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
}
const db=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const shot=process.env.VZ_SHOT_DIR;

test('설정: 하루 연습 목표 시간을 저장하면 목록의 값도 바로 바뀌어요',async({page})=>{
 await boot(page,{hash:'#/settings'});
 const row=page.locator('[data-daily-target]');await expect(row).toContainText('현재 30분');
 await row.click();const sheet=page.getByRole('dialog',{name:'하루 연습 목표 시간'});
 await sheet.locator('input[name=minutes]').fill('45');await page.getByRole('button',{name:'저장',exact:true}).click();
 await expect(sheet).toHaveCount(0);expect((await db(page)).settings.dailyTargetMinutes).toBe(45);
 await expect(row).toContainText('현재 45분');
 // Opening it again starts from the saved value.
 await row.click();await expect(sheet.locator('input[name=minutes]')).toHaveValue('45');
});

test('기록 탭 첫 화면: 레슨·숙제·연습 기록·나의 공연으로 가는 한 줄 메뉴',async({page})=>{
 await boot(page);const links=page.locator('.vz-record-links a');
 await expect(links).toHaveText(['레슨','숙제','연습 기록','나의 공연']);
 expect(await links.evaluateAll(list=>list.map(a=>a.getAttribute('href')))).toEqual(['#/lessons','#/homework','#/practices','#/performances']);
 for(const width of [320,375]){
  await page.setViewportSize({width,height:812});
  const boxes=await links.evaluateAll(list=>list.map(a=>{const r=a.getBoundingClientRect();return {top:Math.round(r.top),h:r.height,right:r.right}}));
  expect(new Set(boxes.map(b=>b.top)).size).toBe(1);
  for(const b of boxes){expect(b.h).toBeGreaterThanOrEqual(44);expect(b.right).toBeLessThanOrEqual(width);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await links.nth(1).click();await expect(page.locator('#top h1')).toHaveText('숙제');
 await expect(page.locator('.v-nav a[data-nav=calendar]')).toHaveAttribute('aria-current','page');
 await page.goBack();await links.nth(3).click();await expect(page.locator('#top h1')).toHaveText('나의 공연');
});
