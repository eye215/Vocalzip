// Routes the home module registers late (연습 기록) must draw on reload / deep link; its 오늘의 목표 sheet keeps its own close question.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const stub="window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},\n storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},\n from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert')window.__up.push(a[0]);return c};c.then=r=>r({data:[],error:null});return c}})};";
const pad=n=>String(n).padStart(2,'0'),d=new Date(),today=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const seed={categories:[],songs:[{id:'s1',title:'지금 이 순간'}],lessons:[],assignments:[],practices:[{id:'p1',date:today,songId:'s1',minutes:30,practiceMode:'song'}],comparisonReports:[]};
async function boot(page,hash){
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(s=>{if(!sessionStorage.getItem('seed')){localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(s));sessionStorage.setItem('seed','1')}},seed);
 await page.goto('/'+hash);await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
}
test('#/practices 로 바로 열거나 새로고침해도 연습 기록 화면이 보여요',async({page})=>{
 await boot(page,'#/practices');
 await expect(page.locator('#top h1')).toHaveText('연습 기록');
 await expect(page.locator('#view [data-practice="p1"]')).toBeVisible();
 await expect(page.locator('.v-nav a[data-nav=calendar]')).toHaveAttribute('aria-current','page');
 await page.reload();await expect(page.locator('#top h1')).toHaveText('연습 기록');await expect(page.locator('#view [data-practice="p1"]')).toBeVisible();
});
test('오늘의 목표 시트는 스스로 한 번만 물어봐요 (앱 공통 질문과 겹치지 않음)',async({page})=>{
 await boot(page,'#/home');await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await sheet.locator('textarea[name=personal]').fill('후렴 고음에서 힘 빼기');
 let asked=0;page.on('dialog',dlg=>{asked++;dlg.accept()});
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 await expect(sheet).toHaveCount(0);expect(asked).toBe(1);
 await expect(page.getByRole('dialog',{name:'작성 중인 내용이 있어요'})).toHaveCount(0);
});
