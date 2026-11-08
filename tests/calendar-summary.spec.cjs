const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const stub="window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},\n storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},\n from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert')window.__up.push(a[0]);return c};c.then=r=>r({data:[],error:null});return c}})};";
const now=new Date(),month=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'),day=month+'-01';
const prev=new Date(now.getFullYear(),now.getMonth()-1,1),prevDay=prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0')+'-01';
const seed={categories:[],songs:[{id:'a',title:'아주 긴 노래 제목 '.repeat(12)},{id:'b',title:'노래 B'},{id:'c',title:'노래 C'},{id:'d',title:'노래 D'}],lessons:[{id:'l',date:day,recordings:[{id:'lesson'}]}],assignments:[],comparisonReports:[],practices:[
{id:'p1',date:day,songId:'a',minutes:30,mediaIds:['linked']},
...[1,2,3].map(n=>({id:'b'+n,date:day,songId:'b',minutes:5})),
{id:'train',date:day,practiceMode:'training',minutes:100},
{id:'prev',date:prevDay,songId:'a',minutes:120}]};
async function boot(page){
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(s=>{if(!sessionStorage.getItem('seed')){localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(s));sessionStorage.setItem('seed','1')}},seed);
 await page.goto('/#/calendar');await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await page.evaluate(date=>{
 const files=[{id:'linked',durationSeconds:1800,songId:'a'},{id:'lesson',durationSeconds:600,songId:'a'},{id:'free',durationSeconds:60,songId:'a'},{id:'unknown',songId:'c'},{id:'four',durationSeconds:60,songId:'d'}].map(m=>({...m,recordedDate:date}));
 VZ.media.cached=()=>files;VZ.media.list=async()=>files;VZ.media.cloudError=()=>'';VZ.render();
 },day);
}
test('compact calendar summary follows month, sorting, expansion and data updates',async({page})=>{
 await boot(page);const card=page.locator('.calendar-summary');
 await expect(card.locator('[data-month-minutes]')).toHaveText('47分'.replace('分','분'));
 await expect(card.locator('[data-month-count]')).toHaveText('7회');
 await expect(card.locator('li')).toHaveCount(3);
 expect((await card.boundingBox()).height).toBeLessThan(300); // compact, with 44pt tap rows (v0.6)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await card.getByRole('button',{name:'횟수순'}).click();await expect(card.locator('li').first()).toHaveAttribute('data-cs-song','b');
 await card.getByRole('button',{name:'TOP 5 더 보기'}).click();await expect(card.locator('li')).toHaveCount(4);
 await card.getByRole('button',{name:'접기',exact:true}).click();await expect(card.locator('li')).toHaveCount(3);
 await page.getByRole('button',{name:'이전 달',exact:true}).click();
 await expect(card.locator('[data-month-minutes]')).toHaveText('2시간');
 await expect(card.locator('[data-month-count]')).toHaveText('1회');
 await page.getByRole('button',{name:'다음 달',exact:true}).click();await page.getByRole('button',{name:'다음 달',exact:true}).click();
 await expect(card).toContainText('이 달의 노래 연습 기록이 없어요.');
 await page.getByRole('button',{name:'오늘',exact:true}).click();
 await page.evaluate(date=>VZ.change(d=>d.practices.push({id:'added',date,songId:'b',minutes:13})),day);
 await expect(page.locator('[data-month-minutes]')).toHaveText('1시간');
});
test('today number stays white on selected purple, and purple when unselected',async({page})=>{
 await boot(page);const today=page.locator('.cal-day.today');
 const accent=await page.evaluate(()=>{const probe=document.createElement('span');probe.style.color='var(--accent)';document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;});
 await today.click();await expect(today).toHaveAttribute('aria-pressed','true');
 expect(await today.locator('span').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(255, 255, 255)');
 const bg=await today.evaluate(n=>getComputedStyle(n).backgroundColor);
 expect(bg).not.toBe('rgb(255, 255, 255)');
 await page.locator('.cal-day:not(.today):not(.out)').first().click();
 expect(await today.locator('span').first().evaluate(n=>getComputedStyle(n).color)).toBe(accent);
 await today.click();
 expect(await today.locator('span').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(255, 255, 255)');
});
