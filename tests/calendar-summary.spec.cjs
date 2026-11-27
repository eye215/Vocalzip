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
// 기록 (rec1, 2026-11-27): the month summary is folded behind the header's chart button; the calendar opens as a week.
const openSummary=async page=>{const chart=page.locator('#top [data-cal-chart]');await chart.click();await expect(chart).toHaveAttribute('aria-expanded','true');};
const openMonth=async page=>{await page.locator('[data-cal-view]').click();await expect(page.locator('.rt-cal')).toHaveAttribute('data-view','month');};
test('one-line month totals and a clean song strip rotate the top five',async({page})=>{
 await boot(page);const card=page.locator('.calendar-summary');
 await expect(card).toHaveCount(0);await openSummary(page);
 // 곡 녹음 → 연습 시간: 'four' (song D, 1 minute, no time entered for D that day) counts as practice; 'free' does not (A has 30 minutes entered).
 await page.evaluate(()=>VZ.recordingTime?.run());
 await expect.poll(()=>page.evaluate(()=>VZ.db.practices.filter(p=>p.practiceTimeSource==='recording').map(p=>[p.songId,p.minutes]))).toEqual([['d',1]]);
 await expect(card.locator('[data-month-minutes]')).toHaveText('46분');
 // 'free' (song A) belongs to A's record that day (2026-11-23): shown under it, no 회 of its own — 6, not 7.
 await expect(card.locator('[data-month-count]')).toHaveText('6회');
 await expect(card.locator('.cs-heading')).toHaveCSS('flex-wrap','nowrap');
 await expect(card.locator('.cs-spotlight')).toHaveAttribute('data-cs-song','a');
 await expect(card.locator('.cs-spotlight')).toHaveCSS('background-color','rgb(241, 237, 248)');
 await expect(page.locator('.rt-cal-foot [data-cal-view]')).toHaveText('한 달 보기');
 await openMonth(page);
 await expect(page.locator('.rt-cal-foot [data-cal-view]')).toHaveText('한 주 보기');
 await page.locator('.rt-dayb[data-d="'+day+'"]').click();
 await expect(page.locator('.rt-cal-foot [data-today]')).toHaveText('오늘');
 // The day's lesson: a gradient mark, its time (시간 미정) and its feedback state.
 await expect(page.locator('.rt-item[data-kind=lesson] .rt-badge').first()).toHaveCSS('background-image',/linear-gradient/);
 await expect(page.locator('.rt-item[data-kind=lesson] .rt-sub').first()).toContainText('시간 미정');
 await expect(page.locator('.rt-item[data-kind=lesson] .rt-note').first()).toContainText('피드백 미작성');
 await expect(page.locator('.rt-item[data-kind=practice] .rt-node').first()).toBeVisible();
 // 'free' (a song A take with no record of its own) is shown under A's record, not as a loose card.
 const recA = page.locator('.rt-item[data-kind=practice]').filter({has:page.locator('[data-practice="p1"]')});
 await expect(recA.locator('[data-media="free"]')).toHaveCount(1);
 await expect(recA.locator('[data-media="linked"]')).toHaveCount(1);
 await expect(page.locator('.rt-item[data-kind=loose][data-media="free"]')).toHaveCount(0);
 await expect(page.locator('.rt-item[data-kind=stage]')).toHaveCount(0);
 expect((await card.boundingBox()).height).toBeLessThan(230);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.evaluate(date=>VZ.change(d=>{d.songs.push({id:'e',title:'노래 E'});d.practices.push({id:'e1',date,songId:'e',minutes:2});}),day);
 await expect(card.locator('[data-month-minutes]')).toHaveText('48분');
 await expect(card.locator('[data-cs-position], [data-cs-metric], .cs-ranking-head')).toHaveCount(0);
 await expect(card.locator('.cs-spotlight')).toHaveAttribute('data-cs-song','a');
 await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());
 await expect.poll(()=>card.locator('.cs-spotlight').getAttribute('data-cs-song'),{timeout:6000}).not.toBe('a');
 await page.getByRole('button',{name:'이전 달',exact:true}).click();
 await expect(card.locator('[data-month-minutes]')).toHaveText('2시간');
 await expect(card.locator('[data-month-count]')).toHaveText('1회');
 await page.getByRole('button',{name:'다음 달',exact:true}).click();await page.getByRole('button',{name:'다음 달',exact:true}).click();
 await expect(card).toContainText('이 달의 노래 연습 기록이 없어요.');
 await page.getByRole('button',{name:'오늘',exact:true}).click();
 await page.evaluate(date=>VZ.change(d=>d.practices.push({id:'added',date,songId:'b',minutes:13})),day);
 await expect(page.locator('[data-month-minutes]')).toHaveText('1시간 1분');
 // The chart button folds it away again.
 await page.locator('#top [data-cal-chart]').click();await expect(page.locator('[data-calendar-summary]')).toBeHidden();
});
test('today number stays white on the selected purple circle, and purple when unselected',async({page})=>{
 await boot(page);const today=page.locator('.rt-dayb.today'),num=today.locator('.rt-circle b');
 await today.click();await expect(today).toHaveAttribute('aria-pressed','true');
 await expect(num).toHaveCSS('color','rgb(255, 255, 255)');
 await expect(today.locator('.rt-circle')).toHaveCSS('background-image',/linear-gradient/);
 await page.locator('.rt-dayb:not(.today):not(.out)').first().click();
 await expect(num).toHaveCSS('color','rgb(91, 31, 194)');
 await expect(today.locator('.rt-circle')).toHaveCSS('background-image','none');
 await today.click();
 await expect(num).toHaveCSS('color','rgb(255, 255, 255)');
});
test('calendar uses the same circular recording entry and opens a focused dark recorder',async({page})=>{
 await boot(page);
 const fab=page.getByRole('link',{name:'녹음 시작',exact:true}),box=await fab.boundingBox();
 expect(Math.round(box.width)).toBe(56);expect(Math.round(box.height)).toBe(56);
 await expect(page.locator('.v-nav a')).toHaveCount(4); // v4 IA: 오늘 · 내 곡 · 기록 · 성장
 await expect(page.locator('.v-nav [data-nav=record]')).toHaveCount(0);
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

test('Actual practice time keeps calendar counts while using only entered minutes',async({page})=>{
 await boot(page);
 // 'four' (song D, 1 minute) gets its automatic row (곡 녹음 → 연습 시간) a moment after the list is read; let it land
 // first so the totals below do not race it (opening the summary is one more tap than before).
 await page.evaluate(()=>VZ.recordingTime?.run());
 await expect.poll(()=>page.evaluate(()=>VZ.db.practices.some(p=>p.practiceTimeSource==='recording'))).toBe(true);
 await openSummary(page);
 await expect(page.locator('[data-month-minutes]')).toHaveText('46분');
 await expect(page.locator('[data-month-count]')).toHaveText('6회');
 await page.evaluate(()=>VZ.change(d=>{d.practices.find(p=>p.id==='p1').manualMinutes=12;}));
 await expect(page.locator('[data-month-minutes]')).toHaveText('28분');
 await expect(page.locator('[data-month-count]')).toHaveText('6회');
 expect(await page.evaluate(()=>VZ.db.practices.find(p=>p.id==='p1').minutes)).toBe(30);
});
