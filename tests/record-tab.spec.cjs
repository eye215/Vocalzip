// 기록 탭 (rec1, 2026-11-27): week strip, the day's one card, and every action of the old screen.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const stub="window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},\n storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},\n from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert')window.__up.push(a[0]);return c};c.then=r=>r({data:[],error:null});return c}})};";
const pad=n=>String(n).padStart(2,'0'),ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d)};
const T=day(0),Y=day(-1);
const seed={categories:[],songs:[{id:'s1',title:'This Is the Moment'},{id:'s2',title:'On My Own'}],
 lessons:[{id:'l1',date:Y,startTime:'18:30',endTime:'19:30',teacher:'김선생',place:'연습실',songIds:['s1'],feedback:'숨을 미리 채우고, 고음은 턱을 내려서',status:'done',recordings:[{id:'lrec'}]}],
 assignments:[{id:'a1',title:'립트릴 5분',lessonId:'l1',status:'todo'},{id:'a2',title:'고음 연습',lessonId:'l1',status:'todo'}],comparisonReports:[],
 dailyGoals:[{id:'g1',date:T,title:'곡의 가사를 천천히 읽기',source:'personal',completed:true}],
 practices:[
 {id:'vc',date:T,minutes:0.5,manualMinutes:0.5,practiceTimeSource:'voice-check',practiceMode:'training',categoryLabel:'음정',detail:'보이스 체크',memo:'[보이스 체크]',mediaIds:[],voiceCheck:{v:1,selfRating:4,tags:['tired']}},
 {id:'t1',date:T,minutes:7,practiceMode:'training',categoryLabel:'발성',detail:'립트릴',memo:'[오늘의 연습] 립트릴'},
 {id:'p1',date:T,minutes:14,practiceMode:'song',songId:'s1',mediaIds:['m1'],memo:'',dailySet:{items:[{title:'녹음',aiCoach:'좋아요'}]}},
 {id:'yt',date:Y,minutes:12,practiceMode:'training',categoryLabel:'발성',detail:'허밍 롱톤'},
 {id:'yp',date:Y,minutes:28,practiceMode:'song',songId:'s1',mediaIds:['m2'],memo:'레슨 전 곡 연습'},
 {id:'old',date:day(-3),minutes:30,practiceMode:'song',songId:'s2'},{id:'old2',date:day(-4),minutes:10,practiceMode:'song',songId:'s2'}]};
async function boot(page,hash){
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(s=>{if(!sessionStorage.getItem('seed')){localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(s));sessionStorage.setItem('seed','1')}},seed);
 await page.goto('/'+hash);await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await page.evaluate(([T,Y])=>{
  const files=[{id:'m1',durationSeconds:48,songId:'s1',recordedDate:T,source:'practice'},{id:'m2',durationSeconds:72,songId:'s1',recordedDate:Y,source:'practice'},{id:'lrec',durationSeconds:3000,songId:'s1',recordedDate:Y,source:'lesson',occasion:'lesson'},
   {id:'f1',durationSeconds:52,songId:'s2',recordedDate:T,source:'practice',recordingCategory:'training',name:'On My Own'},{id:'f2',durationSeconds:35,songId:'',recordedDate:T,source:'practice',created:Date.now()}];
  VZ.media.cached=()=>files;VZ.media.list=async()=>files;VZ.media.cloudError=()=>'';VZ.render();
 },[T,Y]);
}

const KEY='vocal-zip_mvp_v1';
const dialog=page=>page.locator('[role=dialog]').last();
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);

test('기록 opens on this week: header pills, rings and dots, the chosen day with one card of sections',async({page})=>{
 await boot(page,'#/calendar');
 await expect(page.locator('#top h1')).toHaveText('기록');
 await expect(page.locator('#top [data-cal-chart]')).toHaveAttribute('aria-label','이번 달 연습 요약');
 await expect(page.locator('#top [data-add]')).toHaveText('직접 적기');
 await expect(page.locator('.vz-record-links a')).toHaveText(['레슨','숙제','연습 기록','나의 공연']);
 const cal=page.locator('.rt-cal');await expect(cal).toHaveAttribute('data-view','week');
 await expect(cal.locator('[data-title]')).toHaveText(/^(\d{4}년 )?\d+월 (첫째|둘째|셋째|넷째|다섯째) 주$/);
 await expect(cal.locator('.rt-dows span')).toHaveText(['일','월','화','수','목','금','토']);
 await expect(cal.locator('.rt-dayb')).toHaveCount(7);
 const today=cal.locator('[data-d="'+T+'"]');
 await expect(today).toHaveAttribute('aria-pressed','true');await expect(today).toHaveAttribute('aria-current','date');
 await expect(today.locator('.rt-circle')).toHaveCSS('background-image',/linear-gradient/);
 await expect(today.locator('.rt-tw')).toHaveCount(3);
 // Yesterday: a lesson (dot) and 40 minutes of practice — a full ring against the 30-minute target.
 const y=cal.locator('[data-d="'+Y+'"]');
 if(await y.count()){
  await expect(y).toHaveAttribute('data-has','lesson practice');await expect(y.locator('.rt-dot.on')).toHaveCount(1);
  await expect(y.locator('.rt-ring-bar')).toHaveAttribute('stroke-dashoffset','0.0');
  await expect(y).toHaveAttribute('aria-label',/레슨, 연습 40분/);
 }
 await expect(page.locator('[data-cal-view]')).toHaveText('한 달 보기');
 await expect(page.locator('[data-today]')).toBeHidden();
 // The day: title, one gray line, sections in order with their totals.
 await expect(page.locator('.rt-day-head h2')).toHaveText(/^\d+월 \d+일 [일월화수목금토]요일$/);
 await expect(page.locator('[data-day-summary]')).toHaveText('보이스 체크 완료 · 연습 21분 · 녹음 3');
 await expect(page.locator('.rt-card')).toHaveCount(1);
 await expect(page.locator('.rt-sec-head > span:first-child')).toHaveText(['연습','따로 남긴 녹음']);
 await expect(page.locator('.rt-sec-total')).toHaveText(['21분','2']);
 const practice=page.locator('[data-section=practice] .rt-item');
 await expect(practice.locator('.rt-title')).toHaveText(['보이스 체크','발성 · 립트릴','This Is the Moment','곡의 가사를 천천히 읽기']);
 await expect(practice.locator('.rt-right')).toHaveText(['30초','7분','14분','완료']);
 await expect(practice.first().locator('.rt-sub')).toHaveText('목 상태 4 · 피곤');
 await expect(practice.nth(2).locator('.rt-chip')).toHaveText(['녹음 0:48','AI 코멘트']);
 await expect(practice.nth(3)).toHaveClass(/is-plan/);
 const loose=page.locator('[data-section=loose] .rt-item');
 await expect(loose.locator('.rt-right')).toHaveText(['0:52','0:35']);
 await expect(loose.first().locator('.rt-sub')).toHaveText('트레이닝 · 연습 기록에 아직 안 묶임');
 await expect(loose.first().locator('.rt-chip')).toHaveText(['듣기','연습에 묶기']);
 await expect(loose.nth(1).locator('.rt-sub')).toHaveText(/^\d\d:\d\d에 남김$/);
 await expect(loose.nth(1).locator('.rt-chip')).toHaveText(['듣기','곡 고르기']);
 // No tick buttons in this card (the design has none); 보컬 분석 stays in each player's ⋯ menu.
 await expect(page.locator('.rt-card .vz-media-select')).toHaveCount(0);
 await expect(page.locator('#top a[aria-label="설정"]')).toHaveCount(0);
});

test('a lesson day: 레슨 before 연습, gradient mark, length, time · song, feedback and its chips',async({page})=>{
 await boot(page,'#/calendar?date='+Y);
 await expect(page.locator('[data-d="'+Y+'"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-day-summary]')).toHaveText('레슨 1 · 연습 40분 · 녹음 2');
 await expect(page.locator('.rt-sec-head > span:first-child')).toHaveText(['레슨','연습']);
 const lesson=page.locator('.rt-item[data-kind=lesson]');
 await expect(lesson.locator('.rt-title')).toHaveText('김선생 · 연습실');await expect(lesson.locator('.rt-right')).toHaveText('1시간');
 await expect(lesson.locator('.rt-sub')).toHaveText('18:30 · This Is the Moment');
 await expect(lesson.locator('.rt-note')).toHaveText('숨을 미리 채우고, 고음은 턱을 내려서');
 await expect(lesson.locator('.rt-badge')).toHaveCSS('background-image',/linear-gradient/);
 await expect(lesson.locator('.rt-chip')).toHaveText(['레슨 녹음','숙제 2']);
 await expect(lesson.locator('a.rt-chip')).toHaveAttribute('href','#/homework');
 await lesson.locator('.rt-main').click();await expect(page).toHaveURL(/#\/lesson\/l1$/);
});

test('every action of the day is still there: play, open a record, AI comment, link to a practice, choose a song, add',async({page})=>{
 await boot(page,'#/calendar');
 const before=await page.evaluate(k=>localStorage.getItem(k),KEY);
 const rec=page.locator('[data-section=practice] [data-media="m1"] [data-toggle]');
 await rec.click();await expect(rec).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('[data-media="m1"] .media-open')).toBeVisible();
 await expect(page.locator('[data-media="m1"] [data-media-more]')).toHaveCount(1);
 await rec.click();await expect(page.locator('[data-media="m1"] .media-open')).toBeHidden();
 // The record itself opens its detail (수정 · 삭제 there); AI 코멘트 opens the same detail at the comment.
 await page.locator('.rt-main[data-practice="t1"]').click();
 await expect(dialog(page)).toContainText('연습');await expect(dialog(page).getByRole('button',{name:'수정'})).toBeVisible();await expect(dialog(page).getByRole('button',{name:'삭제'})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('[role=dialog]')).toHaveCount(0);
 await page.locator('.rt-chip[data-practice="p1"]').click();await expect(dialog(page).locator('[data-practice-coach]')).toContainText('좋아요');
 await page.keyboard.press('Escape');await expect(page.locator('[role=dialog]')).toHaveCount(0);
 // 연습에 묶기 → the practice sheet with this day, song and recording.
 await page.locator('[data-media="f1"] [data-rt-practice]').click();
 await expect(dialog(page).locator('[name=date]')).toHaveValue(T);await expect(dialog(page)).toContainText('연습 기록 저장');
 await page.keyboard.press('Escape');await expect(page.locator('[role=dialog]')).toHaveCount(0);
 // 곡 고르기 → the 곡 지정 picker.
 await page.locator('[data-media="f2"] [data-rt-song]').click();await expect(dialog(page)).toContainText('곡 미지정');
 await page.getByRole('option',{name:'On My Own'}).click();await expect(dialog(page)).toContainText('곡을 "On My Own"');
 await dialog(page).getByRole('button',{name:'취소'}).click();await expect(page.locator('[role=dialog]')).toHaveCount(0);
 // + 직접 적기 → the same 기록 추가 menu.
 await page.locator('#top [data-add]').click();
 expect(await page.locator('[data-calendar-add]').evaluateAll(b=>b.map(x=>x.dataset.calendarAdd))).toEqual(['stage','lesson','practice','homework']);
 await page.keyboard.press('Escape');
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(before); // looking writes nothing
});

test('‹ › move by week; 한 달 보기 opens the month and back; 오늘 returns',async({page})=>{
 await boot(page,'#/calendar');
 const title=page.locator('.rt-cal [data-title]'),first=await title.textContent();
 await page.getByRole('button',{name:'이전 주',exact:true}).click();
 const prev=await page.evaluate(t=>{const d=new Date(t+'T12:00');d.setDate(d.getDate()-7);return VzipRecordWeek.ymd(d)},T);
 await expect(page.locator('[data-d="'+prev+'"]')).toHaveAttribute('aria-pressed','true');
 await expect(title).not.toHaveText(first);
 await expect(page.getByRole('button',{name:'오늘',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'다음 주',exact:true}).click();
 await expect(page.locator('[data-d="'+T+'"]')).toHaveAttribute('aria-pressed','true'); // the week with today lands on today
 const view=page.locator('[data-cal-view]');await view.click();
 await expect(view).toHaveAttribute('aria-expanded','true');await expect(view).toHaveText('한 주 보기');
 await expect(page.locator('.rt-cal')).toHaveAttribute('data-view','month');
 expect(await page.locator('.rt-dayb:not(.out)').count()).toBeGreaterThanOrEqual(28);
 await expect(title).toHaveText(/^\d{4}년 \d+월$/);
 await page.getByRole('button',{name:'다음 달',exact:true}).click();
 await expect(page.locator('.rt-dayb[aria-pressed=true]')).toHaveCount(1);
 await page.getByRole('button',{name:'오늘',exact:true}).click();await expect(page.locator('[data-d="'+T+'"]')).toHaveAttribute('aria-pressed','true');
 await view.click();await expect(page.locator('.rt-cal')).toHaveAttribute('data-view','week');await expect(page.locator('.rt-dayb')).toHaveCount(7);
});

test('no sideways page scroll at 320, 390 and 430 (week and month); 44px targets',async({page})=>{
 await boot(page,'#/calendar');
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  for(const v of ['week','month']){
   if(await page.locator('.rt-cal').getAttribute('data-view')!==v)await page.locator('[data-cal-view]').click();
   expect(await noOverflow(page),width+' '+v).toBe(true);
   const r=await page.locator('.rt-card').boundingBox();expect(r.x+r.width).toBeLessThanOrEqual(width);
  }
  for(const [name,h] of await page.locator('#top [data-cal-chart], #top [data-add], .rt-cal-mv, [data-cal-view], .rt-dayb').evaluateAll(l=>l.map(n=>[n.className+' '+(n.dataset.d||''),n.getBoundingClientRect().height])))expect(h,name).toBeGreaterThanOrEqual(44);
 }
});

test.describe('reduced motion',()=>{
 test('the chosen day keeps still stars',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await boot(page,'#/calendar');
  const star=page.locator('.rt-dayb[aria-pressed=true] .rt-tw').first();
  await expect(star).toHaveCSS('animation-name','none');await expect(star).toHaveCSS('opacity','0.4');
 });
});
