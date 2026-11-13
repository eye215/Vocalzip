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
