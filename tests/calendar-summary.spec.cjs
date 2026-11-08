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
test('one-line month totals and tinted top-five rotate by the chosen metric',async({page})=>{
 await boot(page);const card=page.locator('.calendar-summary');
 await expect(card.locator('[data-month-minutes]')).toHaveText('47분');
 await expect(card.locator('[data-month-count]')).toHaveText('7회');
 await expect(card.locator('.cs-heading')).toHaveCSS('flex-wrap','nowrap');
 await expect(card.locator('.cs-spotlight')).toHaveAttribute('data-cs-song','a');
 await expect(card.locator('.cs-spotlight')).toHaveCSS('background-color','rgb(243, 236, 255)');
 await expect(page.locator('.vz-calendar-month .legend')).toHaveText('레슨연습공연');
 await expect(page.locator('.vz-calendar-month [data-today]')).toBeVisible();
 await expect(page.locator('.cal-own[data-kind=lesson] .avatar')).toHaveCSS('color','rgb(122, 50, 245)');
 await expect(page.locator('.cal-own[data-kind=practice] .avatar')).toHaveCSS('color','rgb(167, 128, 216)');
 expect((await card.boundingBox()).height).toBeLessThan(230);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.evaluate(date=>VZ.change(d=>{d.songs.push({id:'e',title:'노래 E'});d.practices.push({id:'e1',date,songId:'e',minutes:2});}),day);
 await expect(card.locator('[data-month-minutes]')).toHaveText('49분');
 await expect(card.locator('[data-cs-position]')).toHaveText('1/5');
 await card.getByRole('button',{name:'횟수순'}).click();await expect(card.locator('.cs-spotlight')).toHaveAttribute('data-cs-song','b');
 await card.getByRole('button',{name:'다음 순위 보기'}).click();await expect(card.locator('.cs-spotlight')).toHaveAttribute('data-cs-song','a');
 await card.getByRole('button',{name:'시간순'}).click();await expect(card.locator('.cs-spotlight')).toHaveAttribute('data-cs-song','a');
 await page.locator('#top h1').click();
 await expect.poll(()=>card.locator('.cs-spotlight').getAttribute('data-cs-song'),{timeout:6000}).not.toBe('a');
 await page.getByRole('button',{name:'이전 달',exact:true}).click();
 await expect(card.locator('[data-month-minutes]')).toHaveText('2시간');
 await expect(card.locator('[data-month-count]')).toHaveText('1회');
 await page.getByRole('button',{name:'다음 달',exact:true}).click();await page.getByRole('button',{name:'다음 달',exact:true}).click();
 await expect(card).toContainText('이 달의 노래 연습 기록이 없어요.');
 await page.getByRole('button',{name:'오늘로 이동',exact:true}).click();
 await page.evaluate(date=>VZ.change(d=>d.practices.push({id:'added',date,songId:'b',minutes:13})),day);
 await expect(page.locator('[data-month-minutes]')).toHaveText('1시간 2분');
});
test('today number stays white on selected purple, and purple when unselected',async({page})=>{
 await boot(page);const today=page.locator('.cal-day.today');
 await today.click();await expect(today).toHaveAttribute('aria-pressed','true');
 expect(await today.locator('span').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(255, 255, 255)');
 const bg=await today.evaluate(n=>getComputedStyle(n).backgroundColor);
 expect(bg).not.toBe('rgb(255, 255, 255)');
 await page.locator('.cal-day:not(.today):not(.out)').first().click();
 expect(await today.locator('span').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(117, 82, 217)');
 await today.click();
 expect(await today.locator('span').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(255, 255, 255)');
});
test('calendar uses the same circular recording entry and opens a focused dark recorder',async({page})=>{
 await boot(page);
 const fab=page.getByRole('link',{name:'녹음 시작',exact:true}),box=await fab.boundingBox();
 expect(Math.round(box.width)).toBe(56);expect(Math.round(box.height)).toBe(56);
 await expect(page.locator('.v-nav a')).toHaveCount(5);
 await expect(page.locator('.v-nav li:has([data-nav=record])')).toBeHidden();
 await fab.click();
 await expect(page).toHaveURL(/#\/record$/);
 await expect(page.locator('body')).toHaveClass(/vz-record-mode/);
 await expect(page.locator('.v-nav')).toBeHidden();
 await expect(page.locator('.rec-heading')).toHaveText('녹음 준비');
 await expect(page.locator('[data-main]')).toHaveAttribute('aria-label','녹음 시작');
 await expect(page.locator('.vz-record-screen [data-import]')).toHaveCount(0);
 await page.getByRole('button',{name:'뒤로'}).click();
 await expect(page).toHaveURL(/#\/calendar$/);
 await expect(page.locator('body')).not.toHaveClass(/vz-record-mode/);
});
