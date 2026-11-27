// Student home: fixture-only browser QA; no live Supabase, media, or account writes.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const NOW = '2026-11-04T12:00:00.000Z';
const TODAY = '2026-11-04';
const WEEK = '2026-11-02';
const widths = [320, 390, 430];
const copy = value => JSON.parse(JSON.stringify(value));
const seed = () => ({
  categories:[],
  songs:[{id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드'}],
  lessons:[{id:'l1', date:'2026-11-06', startTime:'18:30', endTime:'19:30', status:'scheduled', songId:'s1', songIds:['s1'], teacher:'김선생', place:'연습실', feedback:'보존할 선생님 피드백'}],
  assignments:[{id:'a1', lessonId:'l1', title:'호흡을 길게 유지하기', status:'active', startDate:'2026-11-01', dueDate:'2026-11-08'}],
  practices:[{id:'p1', date:TODAY, minutes:99, manualMinutes:30, mediaSeconds:3600, mediaIds:['file1'], songId:'s1', practiceMode:'song', memo:'원본 연습 보존'}],
  performances:[{id:'stage1', ownerId:'home-qa-user', title:'가을 뮤지컬 오디션', start:'2026-11-08', status:'preparing', sessions:[{id:'session1',date:'2026-11-08',time:'14:00',appeared:false}],songLinks:[{songId:'s1'}],assets:[]}],
  comparisonReports:[],
  dailyGoals:[
    {id:'g1', date:TODAY, title:'호흡을 길게 유지하기', source:'homework', sourceId:'a1', completed:false, order:0},
    {id:'g2', date:TODAY, title:'곡의 가사를 천천히 읽기', source:'personal', completed:true, order:1},
    {id:'g3', date:TODAY, title:'후렴 연결 연습하기', source:'recommendation', completed:false, order:2}
  ],
  practicePlans:[
    {id:'day:'+TODAY, period:'day', date:TODAY, targetMinutes:30},
    {id:'week:'+WEEK, period:'week', date:WEEK, targetMinutes:180}
  ]
});

// Model the real read/conditional-write contract, including absent rows and CAS misses.
// Session enforcement is disabled by legacy-session-mode, not replaced with a fake active RPC.
function installSDK() {
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  window.__homeServerWrites = [];
  const row = () => JSON.parse(sessionStorage.getItem('home-server-row') || 'null');
  window.__homeServerRow = row;
  const client = {
    auth:{
      getUser:async () => ({data:{user:{id:'home-qa-user',email:'home@example.invalid',user_metadata:{name:'김유리'}}},error:null}),
      getSession:async () => ({data:{session:{access_token:'fixture-token'}}}),
      onAuthStateChange:() => ({data:{subscription:{unsubscribe(){}}}})
    },
    storage:{from:() => ({createSignedUrl:async () => ({data:{signedUrl:'/fixture.wav'},error:null})})},
    async rpc(name,args){
      if(name==='vzip_lesson_delete_capabilities')return window.__denyDeletionCapabilities?{data:null,error:{message:'fixture unavailable'}}:{data:{version:1,lesson_permanent:true,charge_guard:true},error:null};
      if(name==='vzip_delete_lesson'){
        const current=row();
        window.__lessonDeleteCalls||=[];window.__lessonDeleteCalls.push(clone(args));
        if(!current||current.updated_at!==args.p_expected_updated_at)return {data:null,error:{code:'PT409'}};
        const payload=window.VzipDataMerge.deleteLesson(clone(current.payload),args.p_lesson_id,args.p_billing_link);
        sessionStorage.setItem('home-server-row',JSON.stringify({payload,updated_at:new Date().toISOString()}));
        return {data:{ok:true,pending:false},error:null};
      }
      return {data:null,error:null};
    },
    from(table) {
      const q = {method:'read',filters:{},single:false};
      const chain = {};
      chain.select = columns => {q.columns=columns;return chain;};
      chain.eq = chain.is = (key,value) => {q.filters[key]=value;return chain;};
      for (const method of ['order','range','limit','in']) chain[method] = () => chain;
      chain.maybeSingle = () => {q.single=true;return chain;};
      for (const method of ['upsert','insert','update','delete']) chain[method] = (body,options) => {Object.assign(q,{method,body,options});return chain;};
      chain.then = (resolve,reject) => Promise.resolve().then(() => {
        if (table !== 'vocal_data') return {data:q.single?null:[],error:null};
        const current = row();
        if (q.method === 'read') {
          const value = q.columns?.startsWith('ids:') ? (current ? {ids:current.payload?.deleted?.media || []}:null) : current;
          return {data:q.single?clone(value):(value?[clone(value)]:[]),error:null};
        }
        window.__homeServerWrites.push(clone(q));
        const owner = q.filters.user_id ?? q.body?.user_id;
        if (owner !== 'home-qa-user') return {data:null,error:{message:'Unexpected fixture owner'}};
        if (q.method === 'update') {
          if (!current || q.filters.updated_at !== current.updated_at) return {data:[],error:null};
        } else if (q.method === 'upsert' || q.method === 'insert') {
          if (current && q.options?.ignoreDuplicates) return {data:[],error:null};
          if (current && q.method === 'insert') return {data:null,error:{code:'23505',message:'duplicate'}};
        } else {
          return {data:null,error:{message:'Unexpected fixture operation '+q.method}};
        }
        sessionStorage.setItem('home-server-row',JSON.stringify({payload:q.body.payload,updated_at:q.body.updated_at}));
        return {data:[{user_id:'home-qa-user'}],error:null};
      }).then(resolve,reject);
      return chain;
    }
  };
  window.supabase = {createClient:() => client};
}

async function prepare(page, value = seed()) {
  page.__homeErrors = [];
  page.on('pageerror', e => page.__homeErrors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(({key,value,now}) => {
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) {super(...(args.length ? args : [now]));}
      static now() {return new NativeDate(now).getTime();}
    };
    if (!sessionStorage.getItem('home-seeded')) {
      localStorage.setItem(key,JSON.stringify(value));
      sessionStorage.setItem('home-server-row',JSON.stringify({payload:value,updated_at:'2026-11-04T11:00:00.000Z'}));
      sessionStorage.setItem('home-seeded','1');
    }
  }, {key:KEY,value,now:NOW});
  await page.route('**/supabase.min.js', route => route.fulfill({contentType:'application/javascript',body:'('+installSDK.toString()+')();'}));
  await page.route('**/r2-config.js*', route => route.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', route => route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', route => route.abort());
}
async function ready(page, home = true) {
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('vzip_cloud_linked_user'))).toBe('home-qa-user');
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && typeof window.VZ?.change === 'function')).toBe(true);
  if (home) {
    // The ES module mount may follow cloud auth visibility by several microtasks.
    await expect(page.locator('.vz-student-home')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/vz-home-mode/);
    await page.evaluate(()=>document.fonts.ready);
  }
}
async function boot(page, value = seed()) {
  await prepare(page,value);
  await page.goto('/#/home');
  await ready(page);
}
const db = page => page.evaluate(() => JSON.parse(JSON.stringify(VZ.db)));
// 오늘의 연습 (design-system/practice-card-html.js, home step 2): today's goals are 필수 미션 boxes (buttons, aria-pressed),
// the set's steps a bar and tiles. The goal rows (계획 · 추가), the "지금 할 것" card and the small rows left home.
const goals = page => page.locator('[data-home-today] [data-mission]');
const todayCount = page => page.locator('[data-home-today] [data-mission-count]');
const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mission = (page, title) => page.locator('[data-home-today]').getByRole('button',{name:new RegExp('^필수 미션 '+reEsc(title)+', (완료|아직)$')});
const done = (locator, yes = true) => expect(locator).toHaveAttribute('aria-pressed', String(yes));
const addMission = page => page.getByRole('button',{name:'필수 미션 넣기',exact:true});
// v4 home: 다가오는 일 (date cards, home step 3) and 오늘 부를 곡 chips.
// 오늘 위쪽 (home top, 2026-11-27): today's minutes as a ring against the day target, and this week's days as one button to
// the week sheet. They replace the one-line 오늘 · 이번 주 summary row (and the date/streak/level line above the cards).
const ring = page => page.locator('[data-home-ring]');
const weekStrip = page => page.locator('[data-home-week]');
const ringSay = page => page.locator('.vz-header [data-home-say]');
const minutesOf = text => Number(text.match(/(\d+)시간/)?.[1]||0)*60+Number(text.match(/(\d+)분/)?.[1]||0);
/** What the former 오늘 · 이번 주 row said ("오늘 12분 / 30분 · 이번 주 12분 / 목표 3시간"), read from the ring and the week's days. */
async function expectTop(page, today, dayTarget, week, weekTarget) {
 await expect(ring(page)).toHaveAttribute('aria-label', new RegExp('^오늘 연습 '+today+(dayTarget?', 오늘 목표 '+dayTarget+', 달성률 \\d+%$':', 오늘 목표 없음$')));
 await expect(ring(page).locator('.vz-ring-num b')).toHaveText(String(minutesOf(today)));
 await expect(weekStrip(page)).toHaveAttribute('aria-label', new RegExp(', 이번 주 연습 '+week+', '+(weekTarget?'목표 '+weekTarget+', 달성률 \\d+%':'목표 없음')+', 자세히 보기$'));
}
// The 시간·녹음 sheet is the recorder's (a take made for a goal); on home the time is written inside the goal's row.
const timeSheet = page => page.getByRole('dialog',{name:'연습 시간·녹음',exact:true});
// Text that only exists in the approved HTML mock; real records must never bring it back.
const SAMPLE_TEXT = ['레미제라블','위키드','Defying Gravity','11월 10일','2절 고음 연습','가사 암기','6일 연속','최근 연습곡','계속 연습하기','레슨노트','연습기록'];
async function noSample(page){
 const text=await page.locator('.vz-student-home').evaluate(host=>{const main=host.shadowRoot.querySelector('main');return main.textContent+' '+[...main.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label')).join(' ');});
 for(const sample of SAMPLE_TEXT)expect(text,sample).not.toContain(sample);
}
async function noOverflow(page) {
  expect(await page.evaluate(() => ({
    viewport:innerWidth,
    doc:document.documentElement.scrollWidth,
    body:document.body.scrollWidth
  }))).toEqual(expect.objectContaining({viewport:expect.any(Number)}));
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth,document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
}

async function screenshot(page,testInfo,name){
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:testInfo.outputPath(name),fullPage:true,animations:'disabled',style:'.vz-nav-space,.vz-floating-record{visibility:hidden!important;}'});
 if(/-\d{3}\.png$/.test(name))await page.screenshot({path:testInfo.outputPath(name.replace('.png','-viewport.png')),fullPage:false,animations:'disabled'});
}
/** The phone layout (below 768px): one column, without the 주간 연습 card beside the summary. */
const phoneWidth=async page=>{const v=page.viewportSize();if(v&&v.width>=768)await page.setViewportSize({width:390,height:844});};
test.afterEach(async({page})=>expect(page.__homeErrors||[]).toEqual([]));
test('literal floating HTML and app screenshots at 320/390/430',async({page},testInfo)=>{
 await boot(page);
 for(const width of widths){
  await page.setViewportSize({width,height:940});await noOverflow(page);
  // 오늘의 연습, 다가오는 일 and 오늘 부를 곡 share one 16px gutter (home step 3: the old summary card sat at 12px).
  for(const selector of ['[data-home-today]','[data-home-upcoming]','.vz-recent']){const card=await page.locator(selector).boundingBox();expect(Math.abs(card.x-16),selector).toBeLessThanOrEqual(.5);expect(Math.abs(card.width-(width-32)),selector).toBeLessThanOrEqual(1);}
  await expect(page.locator('[data-home-today]')).toHaveCSS('padding-top','18px');
  const dock=await page.locator('.vz-nav-space').boundingBox();expect(Math.abs(dock.x-16)).toBeLessThanOrEqual(1);expect(Math.abs(dock.width-(width-32))).toBeLessThanOrEqual(1);
  const before=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(Math.abs(width-before.x-before.width-16)).toBeLessThanOrEqual(1);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const after=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(Math.abs(before.y-after.y)).toBeLessThanOrEqual(1);
  // 오늘 부를 곡 is the last home block; it must clear the floating record button.
  const last=await page.locator('.vz-recent').boundingBox();expect(last.y+last.height+12).toBeLessThanOrEqual(after.y);
  await page.evaluate(()=>scrollTo(0,0));await screenshot(page,testInfo,'student-home-after-'+width+'.png');
 }
 await page.goto('/design-system/student-home-preview.html?upcoming=all');await expect(page.locator('.vz-phone')).toBeVisible();
 for(const width of widths){
  await page.setViewportSize({width,height:940});await noOverflow(page);
  const nav=await page.locator('.vz-nav').boundingBox(),fab=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();
   expect(Math.round(fab.height)).toBe(56);expect(Math.round(fab.width)).toBe(56);expect(Math.abs(nav.y-fab.y-fab.height-12)).toBeLessThanOrEqual(1);
  for(const button of await page.locator('.vz-nav-item').all()){const b=await button.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}
  await screenshot(page,testInfo,'student-home-preview-'+width+'.png');
 }
});
test('uploaded HTML blob and all original stylesheet blocks are reused literally',async({page})=>{
 const response=await page.request.get('/design-system/Vocalzip_Floating_Record_Home.html');
 const bytes=await response.body(),hash=require('node:crypto').createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  expect(hash).toBe('4985592d5e93a09ba1300cf57ba4eee866db531b');
 await page.goto('/design-system/student-home-preview.html');await expect(page.locator('.vz-phone')).toBeVisible();
 const result=await page.locator('.vz-student-home').evaluate(async host=>{
  const original=new DOMParser().parseFromString(await(await fetch('/design-system/Vocalzip_Floating_Record_Home.html')).text(),'text/html');
  const expected=[...original.querySelectorAll('style')].map(e=>e.textContent.replace(/@import\s+url\([^;]*\);/g,''));
  const shadow=host.shadowRoot,actual=[...shadow.querySelectorAll('style[data-source-style]')].map(e=>e.textContent);
  const same=selector=>original.querySelector(selector).innerHTML===shadow.querySelector(selector).innerHTML;
  return {styles:JSON.stringify(actual)===JSON.stringify(expected),count:actual.length,fab:!!shadow.querySelector('.vz-floating-record svg.vz-mic-anim'),nav:[...shadow.querySelectorAll('.vz-nav-item')].map(e=>e.querySelector('i')?.dataset.glyph).join(',')==='\ue2c2,\ue340,\ue10a,\ue150',scripts:shadow.querySelectorAll('script,#vz-record-dialog,#vz-toast').length};
 });
 expect(result).toEqual({styles:true,count:10,fab:true,nav:true,scripts:0});
 await expect(page.locator('.vz-nav-item')).toHaveCount(4);
 await page.evaluate(()=>document.fonts.ready);
 const fonts=await page.evaluate(()=>[...document.fonts].filter(f=>f.family.replace(/[\"']/g,'')==='Pretendard').map(f=>({weight:f.weight,status:f.status})));
 expect(fonts.sort((a,b)=>Number(a.weight)-Number(b.weight))).toEqual([{weight:'400',status:'loaded'},{weight:'600',status:'loaded'},{weight:'700',status:'loaded'}]);
});
test('reading home preserves source records; a 필수 미션 box checks its goal exactly as the goal row did and it persists after refresh',async({page})=>{
 await boot(page);const before=await db(page);
 await expect(todayCount(page)).toHaveText('필수 미션 1/3');
 await mission(page,'호흡을 길게 유지하기').click();
 await expect(todayCount(page)).toHaveText('필수 미션 2/3');await done(mission(page,'호흡을 길게 유지하기'));
 await expect(mission(page,'호흡을 길게 유지하기')).toHaveAccessibleName('필수 미션 호흡을 길게 유지하기, 완료');
 await page.reload();await ready(page);
 await done(mission(page,'호흡을 길게 유지하기'));
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','performances','practicePlans'])expect(after[key]).toEqual(before[key]);
 // The same write as the old checkbox (M.setGoal through VZ.change, which stamps updatedAt): only g1's completed changed, nothing added.
 expect(after.dailyGoals).toEqual(before.dailyGoals.map(g=>g.id==='g1'?{...g,completed:true,updatedAt:expect.any(Number)}:g));
 expect(after.practices).toEqual(before.practices);
});
test('persistence failure restores the 필수 미션 box and retry succeeds',async({page})=>{
 await boot(page);const before=await db(page);
 await page.evaluate(()=>{window.__homeSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='vocal-zip_mvp_v1')throw new Error('fixture quota failure');return window.__homeSetItem.call(this,key,value);};});
 const box=mission(page,'호흡을 길게 유지하기');await box.click();await done(box,false);await expect(page.locator('.vz-save-error')).toContainText('다시 눌러');
 expect((await db(page)).dailyGoals).toEqual(before.dailyGoals);
 await page.evaluate(()=>{Storage.prototype.setItem=window.__homeSetItem;});await box.click();await done(box);
 expect((await db(page)).dailyGoals.find(g=>g.id==='g1').completed).toBe(true);
});
test('900 goals keep their order; five boxes show first and the rest open in place; a check keeps them open',async({page})=>{
 const value=seed();value.dailyGoals=Array.from({length:900},(_,i)=>({id:'many-'+i,date:TODAY,title:'연습 목표 '+String(i).padStart(3,'0'),source:'personal',completed:false,order:i}));
 await boot(page,value);await expect(goals(page)).toHaveCount(5);
 const more=page.locator('[data-home-today] [data-more]');
 await expect(more).toHaveText('+895');await expect(more).toHaveAccessibleName('필수 미션 895개 더 보기');await more.click();await expect(goals(page)).toHaveCount(900);await expect(goals(page).nth(899)).toBeVisible();await expect(more).toHaveText('접기');
 await goals(page).nth(600).click();await done(goals(page).nth(600));await expect(goals(page).nth(899)).toBeVisible();
 expect((await db(page)).dailyGoals.map(g=>g.id)).toEqual(value.dailyGoals.map(g=>g.id));await expect(todayCount(page)).toHaveText('필수 미션 1/900');
 expect((await db(page)).dailyGoals.filter(g=>g.completed).map(g=>g.id)).toEqual(['many-600']);
 await noOverflow(page);
});
test('empty state removes all sample data and connects songs and goal setup',async({page})=>{
 const value={categories:[],songs:[],lessons:[],assignments:[],practices:[],performances:[],comparisonReports:[]};await boot(page,value);
 await noSample(page);
 // No goals: the 필수 미션 box says so and opens the goal sheet. (The "지금 할 것" card with 첫 곡 추가하기 / 첫 녹음하기 left
 // home in step 2; adding a song is 내 곡.) No summary rows (today and this week are the ring and the days at the top), no recent songs.
 await expect(goals(page)).toHaveCount(0);await expect(page.locator('[data-home-today] [data-mission-empty]')).toHaveText('필수 미션 없음 · + 미션');
 await expect(page.locator('.vz-event')).toHaveCount(0);
 await expect(page.locator('.vz-up-card')).toHaveCount(0);await expect(page.locator('[data-home-upcoming]')).toBeHidden();await expect(page.locator('[data-home-weekly]')).toBeHidden();await expectTop(page,'0분','30분','0분','3시간 30분');
 await expect(ringSay(page)).toHaveText('30분만 더 하면 오늘 목표');
 await expect(page.locator('.vz-recent')).toBeHidden();await expect(page.locator('.vz-recent-pill')).toHaveCount(0);
 await expect(weekStrip(page).locator('.vz-week-strip-text')).toHaveText('이번 주 0일 연습');await expect(weekStrip(page)).toHaveAttribute('data-streak','0');
 await expect(weekStrip(page).locator('.vz-week-dots [data-practiced=true]')).toHaveCount(0);
 await page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'내 곡',exact:true}).click();await expect(page).toHaveURL(/#\/songs$/);
 // + 미션 and the empty 필수 미션 box both open the goal sheet.
 await page.goto('/#/home');await ready(page);
 for(const open of [addMission(page),page.locator('[data-home-today] [data-mission-empty]')]){
  await open.click();
  const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await expect(sheet).toBeVisible();await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0);
 }
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','performances'])expect(after[key]).toEqual([]);
 expect(after.dailyGoals||[]).toEqual([]);expect(after.practicePlans||[]).toEqual([]);
});
test('homework 따라 하기 (a set of one step): saving it counts one practice of the homework and checks the goal, which home shows as done',async({page})=>{
 await boot(page);
 // The open homework is today's goal g1: a 필수 미션 box on home; its 따라 하기 is on the homework page.
 await done(mission(page,'호흡을 길게 유지하기'),false);
 await page.evaluate(()=>{location.hash='#/homework';});await expect(page).toHaveURL(/#\/homework$/);
 await page.getByRole('link',{name:'호흡을 길게 유지하기 따라 하기',exact:true}).click();
 await expect(page).toHaveURL(/#\/practice-set$/);
 await expect(page.locator('[data-pset-run] [data-run-count-all]')).toHaveText('1 / 1');
 await page.evaluate(()=>{const epoch=Date.now();Date.now=()=>epoch+performance.now();});
 await page.getByRole('button',{name:'시작하기',exact:true}).click();
 await page.waitForTimeout(3800);
 await page.getByRole('button',{name:'다 했어요',exact:true}).click();
 await page.locator('.pset-summary [data-save]').click();
 await expect(page.getByRole('link',{name:'연습 기록 보기',exact:true})).toBeVisible();
 const value=await db(page);
 const runs=value.practices.filter(p=>p.dailySet);
 expect(runs).toHaveLength(1);
 expect(runs[0].dailySet.items.map(x=>x.id)).toEqual(['guide:homework:a1']);
 expect(runs[0].dailySet.items[0].seconds).toBeGreaterThanOrEqual(3);
 // The run counts one practice of the homework (like '숙제 했나요?'); only the homework's own check marks it done.
 expect(runs[0]).toMatchObject({completed:['a1'],assignmentReps:{a1:1}});
 expect(value.assignments.find(t=>t.id==='a1').status).toBe('active');
 // The goal is checked without a row of its own: the time is in the run row only.
 expect(value.dailyGoals.find(g=>g.id==='g1').completed).toBe(true);
 expect(value.practices.some(p=>p.id==='goal:g1')).toBe(false);
 await page.getByRole('link',{name:'연습 기록 보기',exact:true}).click();
 await expect(page).toHaveURL(/#\/practices$/);
 await page.goto('/#/home');await ready(page);await done(mission(page,'호흡을 길게 유지하기'));await expect(todayCount(page)).toHaveText('필수 미션 2/3');
});
test('다음 연습 (the homework due soonest first) is one tap from + 미션; home itself no longer has the "지금 할 것" card or "n개 더"',async({page})=>{
 const value=seed();
 value.assignments.push({id:'a2',title:'립트릴로 고음 연결하기',status:'active',startDate:'2026-11-01',dueDate:'2026-11-07'},{id:'a3',title:'모음 고르게 읽기',status:'active',startDate:'2026-11-01',dueDate:'2026-11-09'});
 await boot(page,value);const before=await db(page);
 await expect(page.locator('.vz-student-home .vz-event')).toHaveCount(0);await expect(page.locator('[data-home-next-more]')).toHaveCount(0);
 await expect(page.locator('.vz-guided-item,.vz-guided-recs')).toHaveCount(0);
 for(const t of ['호흡을 길게 유지하기','립트릴로 고음 연결하기','모음 고르게 읽기'])await expect(page.getByRole('button',{name:t+' 따라 하기',exact:true})).toHaveCount(0);
 await addMission(page).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await sheet.locator('[data-plan-next-all]').click();await expect(page).toHaveURL(/#\/next-practice$/);
 const rows=page.locator('[data-next-practice] > .np-list > .np-item');
 await expect(rows.locator('.np-title').first()).toHaveText('립트릴로 고음 연결하기');
 await expect(rows.nth(1).locator('.np-title')).toHaveText('호흡을 길게 유지하기');await expect(rows.nth(1).locator('[data-np-added]')).toHaveText('목표에 담김 ✓');
 await expect(rows.nth(2).locator('.np-title')).toHaveText('모음 고르게 읽기');
 await expect(rows.first().locator('[data-np-go]')).toHaveAttribute('href','#/practice-set?guide=homework%3Aa2');
 await rows.first().locator('[data-np-go]').click();await expect(page).toHaveURL(/#\/practice-set$/);
 await expect(page.locator('[data-pset-run] [data-run-say]')).toHaveText('립트릴로 고음 연결하기');
 const after=await db(page);for(const key of ['assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('active homework card directly opens 따라 하기 in 오늘의 연습',async({page})=>{
 await boot(page);
 await page.goto('/#/homework');
 await page.getByRole('link',{name:'호흡을 길게 유지하기 따라 하기',exact:true}).click();
 await expect(page).toHaveURL(/#\/practice-set$/);
 await expect(page.locator('[data-pset-run] [data-run-say]')).toHaveText('호흡을 길게 유지하기');
});
test('daily time comes from onboarding/settings; tomorrow offers goals once without time input',async({page})=>{
 const value=seed();value.practicePlans=[];
 await boot(page,value);
 await expect(page.getByRole('dialog',{name:'오늘의 목표',exact:true})).toHaveCount(0);
 // No explicit plans: the day target is the 30-minute onboarding/settings default and the week target seven days of it.
 await expect(ring(page)).toHaveAccessibleName('오늘 연습 30분, 오늘 목표 30분, 달성률 100%');await expect(ringSay(page)).toHaveText('오늘 목표 달성!');
 await expect(weekStrip(page)).toHaveAccessibleName('이번 주 연속 1일, 이번 주 연습 30분, 목표 3시간 30분, 달성률 14%, 자세히 보기');
 await page.evaluate(()=>{VZ.today=()=> '2026-11-05';VZ.render();});await ready(page);
 const automatic=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await expect(automatic).toBeVisible();
 await expect(automatic.locator('[name=dayMinutes],[name=weekMinutes]')).toHaveCount(0);
 await automatic.getByRole('button',{name:'나중에 설정할래요'}).click();
 await page.evaluate(()=>VZ.render());await ready(page);await expect(automatic).toHaveCount(0);
 await addMission(page).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await sheet.getByRole('button',{name:'목표 저장'}).click();
 await expect(sheet.locator('[data-plan-error]')).toContainText('목표를 직접 입력해 주세요');await expect(sheet).toBeVisible();
 await sheet.locator('.vz-plan-option').last().click();await sheet.getByRole('button',{name:'목표 저장'}).click();
 expect((await db(page)).dailyGoals.some(g=>g.date==='2026-11-05'&&g.source==='recommendation')).toBe(true);
 expect((await db(page)).practicePlans).toEqual([]);
});
test('settings changes the default daily target on home',async({page})=>{
 const value=seed();value.practicePlans=[];
 await boot(page,value);
 await page.getByRole('button',{name:'설정',exact:true}).click();
 await page.locator('[data-daily-target]').click();
 const sheet=page.getByRole('dialog',{name:'하루 연습 목표 시간'});await sheet.locator('input[name=minutes]').fill('45');
 await sheet.getByRole('button',{name:'저장'}).click();
 await page.goto('/#/home');await ready(page);
 // Seven days of the new 45-minute default.
 await expect(ring(page)).toHaveAccessibleName('오늘 연습 30분, 오늘 목표 45분, 달성률 67%');await expect(ringSay(page)).toHaveText('15분만 더 하면 오늘 목표');
 await expect(weekStrip(page)).toHaveAccessibleName('이번 주 연속 1일, 이번 주 연습 30분, 목표 5시간 15분, 달성률 10%, 자세히 보기');
 expect((await db(page)).settings.dailyTargetMinutes).toBe(45);
});
test('the ring and the week\'s days show only today\'s and this week\'s actual practice time against the targets',async({page})=>{
 await boot(page);
 // Today against the 30-minute day in the ring (its number, its line), this week against 3시간 in the days' spoken name.
 for(const [minutes,actual,week,percent,say]of [[0,'0분','0%','0%','30분만 더 하면 오늘 목표'],[99,'1시간 39분','55%','330%','오늘 목표 달성!'],[180,'3시간','100%','600%','오늘 목표 달성!'],[240,'4시간','133%','800%','오늘 목표 달성!']]){
  // Manual minutes win over stored minutes and recording length; tomorrow and last week never count.
  await page.evaluate(({minutes,date})=>VZ.change(d=>{d.practices=[{id:'boundary',date,manualMinutes:minutes,minutes:999,mediaSeconds:9999,songId:'s1'},{id:'tomorrow',date:'2026-11-05',manualMinutes:60,songId:'s1'},{id:'last-week',date:'2026-11-01',manualMinutes:45,songId:'s1'}];}),{minutes,date:TODAY});
  await expect(ring(page).locator('.vz-ring-num b')).toHaveText(String(minutes));await expect(ringSay(page)).toHaveText(say);
  await expect(ring(page)).toHaveAttribute('data-met',String(minutes>=30));
  await expect(ring(page)).toHaveAccessibleName('오늘 연습 '+actual+', 오늘 목표 30분, 달성률 '+percent);
  // The progress stroke: empty at 0, full from the target on.
  const offset=await ring(page).locator('.vz-ring-bar').evaluate(e=>({off:Number(e.getAttribute('stroke-dashoffset')),dash:Number(e.getAttribute('stroke-dasharray')),shown:getComputedStyle(e).opacity}));
  if(minutes)expect(offset).toEqual({off:0,dash:expect.any(Number),shown:'1'});else expect(offset.shown).toBe('0');
  await expect(weekStrip(page)).toHaveAccessibleName((minutes?'이번 주 연속 1일':'이번 주 0일 연습')+', 이번 주 연습 '+actual+', 목표 3시간, 달성률 '+week+', 자세히 보기');
 }
 await page.evaluate(()=>VZ.change(d=>{d.practicePlans=[];}));
 await expectTop(page,'4시간','30분','4시간','3시간 30분');await expect(ring(page)).toHaveAccessibleName('오늘 연습 4시간, 오늘 목표 30분, 달성률 800%');
 await expect(ring(page).locator('.vz-ring-num')).toHaveAttribute('data-digits','3');
 expect((await db(page)).practices.map(p=>[p.id,p.manualMinutes])).toEqual([['boundary',240],['tomorrow',60],['last-week',45]]);
});
test('four home navigation buttons (v4 IA) and floating recording reach existing routes',async({page})=>{
 await boot(page);const before=await db(page);await expect(page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button')).toHaveText(['오늘','내 곡','기록','성장']);
 const dock=await page.evaluate(()=>{const root=document.querySelector('.vz-student-home').shadowRoot,nav=root.querySelector('.vz-nav');return {icons:[...nav.querySelectorAll('.vz-nav-item i')].map(i=>i.dataset.glyph),background:getComputedStyle(nav).backgroundColor,font:document.fonts.check('22px Phosphor')}});
  expect(dock.icons).toEqual(['\ue2c2','\ue340','\ue10a','\ue150']);expect(dock.background).toBe('rgba(255, 255, 255, 0.58)');expect(dock.font).toBe(true);
 for(const [label,route]of [['내 곡','songs'],['기록','calendar'],['성장','vocal-growth'],['녹음 시작','record']]){
  await page.goto('/#/home');await ready(page);
   await page.getByRole('button',{name:label,exact:true}).click();
   if(route==='record')await expect(page.locator('.vz-record-expansion')).toBeVisible();
   await expect.poll(()=>new URL(page.url()).hash).toBe('#/'+route);await expect(page.locator('.vz-student-home')).toHaveCount(0);await expect(page.locator('body')).not.toHaveClass(/vz-home-mode/);
   if(route==='record'){await expect(page.locator('body')).toHaveClass(/vz-record-mode/);await expect(page.locator('.v-nav')).toBeHidden();}else await expect(page.locator('.v-nav')).toBeVisible();
   await noOverflow(page);
 }
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});

test('weekly home keeps actual practice time separate from every recording length',async({page})=>{
 const value=seed();value.practices=[{id:'p',date:TODAY,minutes:999,manualMinutes:4,mediaIds:['linked']}];
 await boot(page,value);
 await page.evaluate(date=>{
  const files=[{id:'one',durationSeconds:225},{id:'two',durationSeconds:191},{id:'three',durationSeconds:232},
   {id:'linked',durationSeconds:900},{id:'lesson',source:'lesson',durationSeconds:900},
   {id:'stage',occasion:'performance',durationSeconds:900}].map(m=>({...m,recordedDate:date,type:'audio/mp4'}));
  VZ.media.list=async()=>{window.__homeMediaListed=true;return files;};
  window.dispatchEvent(new Event('vzip:cloud-media-changed'));
 },TODAY);
 await expect.poll(()=>page.evaluate(()=>window.__homeMediaListed===true)).toBe(true);
 await page.evaluate(()=>new Promise(r=>setTimeout(r,100)));
 await expectTop(page,'4분','30분','4분','3시간');
 await expect(ring(page)).toHaveAccessibleName('오늘 연습 4분, 오늘 목표 30분, 달성률 13%');
 await expect(weekStrip(page)).toHaveAccessibleName('이번 주 연속 1일, 이번 주 연습 4분, 목표 3시간, 달성률 2%, 자세히 보기');
 expect((await db(page)).practices[0].manualMinutes).toBe(4);
});

test('the week\'s days follow the current week across Monday and reach today in the calendar through the week sheet',async({page})=>{
 const value=seed();value.practices=[{id:'sunday',date:'2026-11-08',minutes:14}];
 await boot(page,value);
 const row=weekStrip(page),dots=row.locator('.vz-week-dots>span'),later=()=>page.getByRole('dialog',{name:'오늘의 목표',exact:true}).getByRole('button',{name:'나중에 설정할래요'}).click();
 // A future-dated practice is not counted yet.
 await expectTop(page,'0분','30분','0분','3시간');await expect(dots.locator('small')).toHaveText(['월','화','수','목','금','토','일']);
 await expect(row.locator('[data-practiced=true]')).toHaveCount(0);await expect(row.locator('[data-today=true]')).toHaveAttribute('data-date',TODAY);
 await page.evaluate(()=>{VZ.today=()=> '2026-11-08';VZ.render();});await ready(page);await later();
 await expectTop(page,'14분','30분','14분','3시간');await expect(ring(page)).toHaveAccessibleName('오늘 연습 14분, 오늘 목표 30분, 달성률 47%');
 await expect(row.locator('.vz-week-strip-text')).toHaveText('이번 주 연속 1일');await expect(dots.last()).toHaveAttribute('data-practiced','true');await expect(dots.last()).toHaveAttribute('data-today','true');
 // Monday starts a new week: Sunday's minutes stay in last week and the target falls back to the daily default.
 await page.evaluate(()=>{VZ.today=()=> '2026-11-09';VZ.render();});await ready(page);await later();
 await expectTop(page,'0분','30분','0분','3시간 30분');await expect(row.locator('.vz-week-strip-text')).toHaveText('이번 주 0일 연습');
 await expect(row.locator('[data-practiced=true]')).toHaveCount(0);await expect(dots.first()).toHaveAttribute('data-today','true');
 await row.click();
 await page.getByRole('dialog',{name:'이번 주 연습',exact:true}).getByRole('button',{name:'기록에서 보기',exact:true}).click();
 await expect(page).toHaveURL(/#\/calendar\?date=2026-11-09$/);
 await expect(page.locator('[data-grid] [data-d="2026-11-09"]')).toHaveAttribute('aria-pressed','true');
 expect((await db(page)).practices).toEqual(value.practices);
});
test('다가오는 일, the top, 오늘 부를 곡 and profile retain their real destinations',async({page})=>{
 await boot(page);const before=await db(page);
 // 다가오는 일 (home step 3): the next lesson and the next stage as two date cards side by side, under 캘린더 ›.
 const cards=page.locator('[data-home-upcoming] .vz-up-card');
 await expect(page.locator('[data-home-upcoming] .vz-sec-title')).toHaveText('다가오는 일');
 await expect(cards).toHaveCount(2);
 for(const [i,key] of ['lesson','stage'].entries())await expect(cards.nth(i)).toHaveAttribute('data-row',key);
 await expect(cards.locator('.vz-up-date')).toHaveText(['금6','일8']);
 await expect(cards.locator('.vz-up-title>span')).toHaveText(['레슨','무대']);await expect(cards.locator('.vz-up-dday')).toHaveText(['D-2','D-4']);
 // The lesson's line: its time and the open homework to do by it; the stage's: its title.
 await expect(cards.locator('.vz-up-line')).toHaveText(['18:30 · 숙제 1개','가을 뮤지컬 오디션']);
 const [a,b]=[await cards.nth(0).boundingBox(),await cards.nth(1).boundingBox()];expect(Math.abs(a.width-b.width)).toBeLessThanOrEqual(1);expect(Math.abs(a.y-b.y)).toBeLessThanOrEqual(.5);expect(b.x-a.x-a.width).toBeCloseTo(10,0);
 for(const [name,route]of [['다음 레슨, 11.6 (금) 18:30, D-2, 숙제 1개','lesson/l1'],[/^(공연|오디션|무대), 가을 뮤지컬 오디션, 11\.8 \(일\) 14:00, D-4$/,'show/stage1'],['캘린더 보기','calendar?date='+TODAY],['이번 주 연속 1일, 이번 주 연습 30분, 목표 3시간, 달성률 17%, 자세히 보기','calendar?date='+TODAY],
  [/^큰 단계 Lv 1, 첫 소리, /,'levels'],['호흡, 아직, 자세히 보기','levels/breath'],['리듬, 아직, 자세히 보기','levels/rhythm'],['This Is the Moment 연습하기','record?song=s1'],['설정','settings']]){
  await page.goto('/#/home');await ready(page);await page.getByRole('button',{name,exact:typeof name==='string'}).click();
  // The week's days first show the numbers and where the target comes from; the calendar is one tap further.
  if(String(name).startsWith('이번 주'))await page.getByRole('dialog',{name:'이번 주 연습',exact:true}).getByRole('button',{name:'기록에서 보기',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).hash).toBe('#/'+route);
 }
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','performances','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('the next lesson stays a date card on the day of the lesson too (the "지금 할 것" card that took it left home)',async({page})=>{
 await boot(page);const before=await db(page);
 const lessonRow=page.locator('.vz-up-card[data-row=lesson]');
 await page.evaluate(date=>VZ.change(d=>{d.lessons[0].date=date;}),TODAY);
 await expect(lessonRow).toHaveCount(1);await expect(lessonRow).toHaveAccessibleName('다음 레슨, 11.4 (수) 18:30, D-day, 숙제 1개');
 await expect(lessonRow.locator('.vz-up-date')).toHaveText('수4');await expect(lessonRow.locator('.vz-up-dday')).toHaveText('D-day');
 await lessonRow.click();await expect.poll(()=>new URL(page.url()).hash).toBe('#/lesson/l1');await page.goto('/#/home');await ready(page);
 await page.evaluate(()=>VZ.change(d=>{d.lessons[0].date='2026-11-06';}));
 await expect(lessonRow).toHaveAccessibleName('다음 레슨, 11.6 (금) 18:30, D-2, 숙제 1개');
 // Without open homework the line says where (place, else teacher); without a time, only that.
 await page.evaluate(()=>VZ.change(d=>{d.assignments[0].status='done';}));
 await expect(lessonRow.locator('.vz-up-line')).toHaveText('18:30 · 연습실');await expect(lessonRow).toHaveAccessibleName('다음 레슨, 11.6 (금) 18:30, D-2');
 await page.evaluate(()=>VZ.change(d=>{d.lessons[0].startTime='';d.lessons[0].place='';}));
 await expect(lessonRow.locator('.vz-up-line')).toHaveText('김선생');
 await expect(page.locator('.vz-student-home .vz-event')).toHaveCount(0);
 const after=await db(page);for(const key of ['songs','performances','dailyGoals','practicePlans','practices'])expect(after[key]).toEqual(before[key]);
});
test('the bell holds only what needs a check (곡 확인 · 분석 실패), with a dot when there is something; 요약 no longer repeats it',async({page})=>{
 await boot(page);const before=await db(page);
 const rows=page.locator('[data-home-upcoming] .vz-up-card'),bell=page.locator('.vz-header-actions button').first(),dot=page.locator('.vz-bell-dot');
 const sheet=page.getByRole('dialog',{name:'확인할 것',exact:true});
 // Nothing to check: no dot, and the sheet says so (다음 레슨 · 무대 are in 요약 and 숙제 in 오늘의 연습, not here).
 await expect(rows).toHaveCount(2);await expect(dot).toBeHidden();await expect(bell).toHaveAttribute('aria-label','알림');
 await bell.click();await expect(sheet).toBeVisible();await expect(sheet).toContainText('확인할 게 없어요');
 await expect(sheet).not.toContainText('다음 레슨');await expect(sheet).not.toContainText('숙제');
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
 const counts=(review,songFail,vocalFail)=>({vocal:{done:0,wait:0,fail:vocalFail,total:vocalFail},song:{auto:0,review,wait:0,fail:songFail,total:review+songFail}});
 await page.evaluate(c=>{VZ.serverAnalysisCounts=()=>c;VZ.render();},counts(2,1,1));await ready(page);
 // The same counts the 확인 필요 summary row used: shown once, in the bell — 다가오는 일 keeps its two cards.
 await expect(rows).toHaveCount(2);await expect(page.locator('.vz-student-home [data-row=attention]')).toHaveCount(0);
 await expect(dot).toBeVisible();await expect(bell).toHaveAttribute('aria-label','알림, 확인할 것 4건');
 for(const [key,text,route] of [['review','곡 확인 2건','song-suggest'],['failed','분석 실패 2건','processing-log']]){
  await bell.click();await expect(sheet).toBeVisible();
  const item=sheet.locator('[data-attention='+key+']');await expect(item).toHaveText(text);
  await item.click();await expect.poll(()=>new URL(page.url()).hash).toBe('#/'+route);await expect(sheet).toHaveCount(0);
  await page.goto('/#/home');await ready(page);
 }
 // The counts arriving after home is drawn (the server queue loads later) put the dot on without drawing home again.
 await page.evaluate(c=>{VZ.serverAnalysisCounts=()=>c;VZ.render();},counts(0,0,0));await ready(page);await expect(dot).toBeHidden();
 await page.evaluate(c=>{VZ.serverAnalysisCounts=()=>c;window.dispatchEvent(new Event('vzip:server-analysis-updated'));},counts(1,0,0));
 await expect(dot).toBeVisible();await expect(bell).toHaveAttribute('aria-label','알림, 확인할 것 1건');
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('오늘 부를 곡: at most three of my songs with the reason for today, each opening that song to record',async({page})=>{
 // The 최근 곡 place now picks songs for today (app/song-pick-model.js, owner 2026-11-25: "부를 노래 골라 주는 것도").
 const value=seed();value.assignments=[];value.performances=[];
 value.lessons=[{...value.lessons[0],songId:'s2',songIds:['s2']}];
 value.songs.push(...['s2','s3','s4','s5'].map((id,i)=>({id,title:'곡 '+(i+2)})));
 value.practices=[['s1',TODAY],['s3','2026-10-01'],['s4','2026-11-02']].map(([songId,date])=>({id:'p-'+songId,date,manualMinutes:10,songId,practiceMode:'song'}));
 await boot(page,value);const before=await db(page);
 const pills=page.locator('.vz-recent-pill');
 await expect(page.locator('.vz-recent-heading')).toHaveText('오늘 부를 곡');
 // Lesson song first, then the one not sung for longest, then one never sung; the song sung today is left out.
 await expect(pills).toHaveCount(3);
 await expect(pills.locator('.vz-pick-words>span')).toHaveText(['곡 2','곡 3','곡 5']);
 await expect(pills.locator('.vz-pick-why')).toHaveText(['레슨 D-2 · 아직 안 불러 봤어요','34일 동안 안 불렀어요','아직 안 불러 봤어요']);
 for(const pill of await pills.all())expect((await pill.boundingBox()).height).toBeGreaterThanOrEqual(44);
 // Drawn again (e.g. after a recording): still at most three.
 await page.locator('.vz-student-home').evaluate(host=>host.updateRecent([1,2,3,4,5].map(n=>({id:'s'+n,title:'곡 '+n,reason:'이유 '+n}))));
 await expect(pills).toHaveCount(3);
 await page.evaluate(()=>VZ.render());await ready(page);await expect(pills.locator('.vz-pick-words>span')).toHaveText(['곡 2','곡 3','곡 5']);
 await page.getByRole('button',{name:'곡 3 연습하기',exact:true}).click();await expect(page).toHaveURL(/#\/record\?song=s3$/);
 await expect(page.locator('[data-song-name]')).toHaveText('곡 3');
 // Singing a song moves it out of today's picks (곡 2 sung today: 곡 4, sung 2 days ago, comes in).
 await page.goto('/#/home');await ready(page);
 await page.evaluate(day=>VZ.change(d=>{d.practices.push({id:'p-s2-today',date:day,manualMinutes:10,minutes:10,songId:'s2',practiceMode:'song'});}),TODAY);
 await expect(pills.locator('.vz-pick-words>span')).toHaveText(['곡 3','곡 5','곡 4']);
 await expect(pills.nth(2).locator('.vz-pick-why')).toHaveText('2일 전에 불렀어요');
 // 랜덤 (🎲 룰렛): titles spin and stop on one of my songs not sung today; 다시 돌리기 spins again; 이 곡 부르기 records it.
 await page.getByRole('button',{name:'아무 곡이나 랜덤으로 고르기',exact:true}).click();
 const wheel=page.getByRole('dialog',{name:'오늘 부를 곡 뽑기'});
 await expect(wheel.locator('[data-roulette-result]')).toHaveText(/^오늘은 곡 [345]!$/,{timeout:6000});
 await wheel.getByRole('button',{name:'다시 돌리기'}).click();
 await expect(wheel.getByRole('button',{name:'이 곡 부르기'})).toBeDisabled();
 await expect(wheel.locator('[data-roulette-result]')).toHaveText(/^오늘은 곡 [345]!$/,{timeout:6000});
 const landed=(await wheel.locator('[data-roulette-title]').textContent()).trim();
 await wheel.getByRole('button',{name:'이 곡 부르기'}).click();
 await expect(page).toHaveURL(/#\/record\?song=s[345]$/);await expect(page.locator('[data-song-name]')).toHaveText(landed);
 const after=await db(page);for(const key of ['songs','dailyGoals'])expect(after[key]).toEqual(before[key]);
});
test('goal editor saves only user entered plans and personal goals',async({page})=>{
 await boot(page);await addMission(page).click();const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 expect((await sheet.getByRole('button',{name:'목표 저장',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(52);
 await sheet.getByLabel('오늘 목표 시간(분)',{exact:true}).fill('45');await sheet.getByLabel('이번 주 목표 시간(분)',{exact:true}).fill('210');await sheet.getByLabel('개인 목표',{exact:true}).fill('새 개인 목표');await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 const value=await db(page);expect(value.practicePlans.find(p=>p.id==='day:'+TODAY).targetMinutes).toBe(45);expect(value.practicePlans.find(p=>p.id==='week:'+WEEK).targetMinutes).toBe(210);expect(value.dailyGoals.some(g=>g.title==='새 개인 목표')).toBe(true);expect(value.practices).toEqual(seed().practices);expect(value.assignments).toEqual(seed().assignments);
});
test('goal editor saves goals without pinning the default daily time',async({page})=>{
 const value=seed();value.practicePlans=[];
 await boot(page,value);await addMission(page).click();const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await expect(sheet.getByLabel('오늘 목표 시간(분)',{exact:true})).toHaveValue('');await expect(sheet.getByLabel('오늘 목표 시간(분)',{exact:true})).toHaveAttribute('placeholder','기본 30분');
 await sheet.getByLabel('개인 목표',{exact:true}).fill('새 개인 목표');await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 await expect(sheet).toHaveCount(0);
 const after=await db(page);expect(after.practicePlans).toEqual([]);expect(after.dailyGoals.some(g=>g.title==='새 개인 목표')).toBe(true);
});
test('daily routine repeats a personal goal, records optional real minutes once, and ends from today on',async({page})=>{
 await boot(page);await addMission(page).click();
 let sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await sheet.getByLabel('개인 목표',{exact:true}).fill('립트릴 10분');
 await sheet.getByText('매일 반복',{exact:true}).click();
 await sheet.getByLabel('반복 일수',{exact:true}).fill('3');
 await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 let value=await db(page);const routine=value.practicePlans.find(p=>p.kind==='routine');
 expect(routine).toMatchObject({title:'립트릴 10분',days:3,startDate:TODAY,endDate:'2026-11-06',archived:false});
 expect(value.dailyGoals.filter(g=>g.sourceId===routine.id).map(g=>g.date)).toEqual([TODAY,'2026-11-05','2026-11-06']);
 expect(value.dailyGoals.filter(g=>['g1','g2','g3'].includes(g.id)).map(g=>[g.id,g.title,g.completed])).toEqual(seed().dailyGoals.map(g=>[g.id,g.title,g.completed]));
 // The 필수 미션 box only checks. The time is written later in the recorder's 시간·녹음 sheet (home has no time rows any
 // more, home step 2), the goal's own minutes preselected.
 const goalId=routine.id+':'+TODAY;
 await mission(page,'립트릴 10분').click();await done(mission(page,'립트릴 10분'));
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(id=>{VZ.goalPerformanceSheet(id);},goalId);
 const record=timeSheet(page);
 await expect(record.getByRole('button',{name:'10분',exact:true})).toHaveAttribute('aria-pressed','true');
 await record.getByRole('button',{name:'직접 입력',exact:true}).click();await record.locator('[name=minutes]').fill('12');
 await record.getByRole('button',{name:'저장',exact:true}).click();
 await expect(record).toHaveCount(0);
 value=await db(page);
 expect(value.practices.find(p=>p.id==='p1')).toEqual(seed().practices[0]);
 expect(value.practices.filter(p=>p.goalId===goalId)).toEqual([expect.objectContaining({id:'goal:'+goalId,date:TODAY,manualMinutes:12,practiceTimeSource:'goal',goalSource:'personal'})]);
 await addMission(page).click();sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await expect(sheet.locator('[data-routine]')).toContainText('1/3일 완료');
 await sheet.getByRole('button',{name:'립트릴 10분 끝내기',exact:true}).click();
 await page.getByRole('dialog',{name:'반복 끝내기',exact:true}).getByRole('button',{name:'끝내기',exact:true}).click();
 await expect.poll(async()=>(await db(page)).practicePlans.find(p=>p.id===routine.id).archived).toBe(true);
 value=await db(page);
 expect(value.dailyGoals.filter(g=>g.sourceId===routine.id).map(g=>[g.date,g.completed])).toEqual([[TODAY,true]]);
 expect(value.practices.filter(p=>p.goalId===goalId)).toHaveLength(1);
 // The ended routine stays visible, collapsed, with its final count.
 await expect(page.getByRole('dialog',{name:'오늘의 목표',exact:true})).toBeVisible();
 sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await expect(sheet.locator('[data-routine]')).toHaveCount(0);
 const ended=sheet.locator('.vz-routines-ended');
 await expect(ended.locator('summary')).toContainText('끝난 반복 1');
 await ended.locator('summary').click();
 await expect(ended.locator('.vz-routine')).toContainText('최종 1/1일 완료');
});
test('routine progress on home, record later, adjust remaining days, missed days and homework repeated daily',async({page})=>{
 const value=seed();
 value.practicePlans.push({id:'routine:old',kind:'routine',title:'허밍 5분',days:5,startDate:'2026-11-02',endDate:'2026-11-06',archived:false,changes:[]},
  {id:'routine:past',kind:'routine',title:'지난 반복',days:2,startDate:'2026-10-30',endDate:'2026-10-31',archived:false,changes:[]});
 for(const [i,date] of ['2026-11-02','2026-11-03',TODAY,'2026-11-05','2026-11-06'].entries())
  value.dailyGoals.push({id:'routine:old:'+date,date,title:'허밍 5분',source:'personal',sourceId:'routine:old',routine:true,completed:i===0,order:3});
 value.dailyGoals.push({id:'routine:past:2026-10-30',date:'2026-10-30',title:'지난 반복',source:'personal',sourceId:'routine:past',routine:true,completed:true},
  {id:'routine:past:2026-10-31',date:'2026-10-31',title:'지난 반복',source:'personal',sourceId:'routine:past',routine:true,completed:false});
 await boot(page,value);
 // Home shows today's day of the routine as a 필수 미션 box (its 반복 n/m count is in the goal sheet below).
 const box=mission(page,'허밍 5분');
 await done(box,false);
 await box.click();await done(box);
 await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='routine:old:'+TODAY).completed).toBe(true);
 // Checked without time (no sheet); later the recorder's 시간·녹음 sheet writes it.
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(id=>{VZ.goalPerformanceSheet(id);},'routine:old:'+TODAY);
 const record=timeSheet(page);
 await record.getByRole('button',{name:'직접 입력',exact:true}).click();await record.locator('[name=minutes]').fill('7');
 await record.getByRole('button',{name:'저장',exact:true}).click();
 await expect(record).toHaveCount(0);
 await expect.poll(async()=>(await db(page)).practices.find(p=>p.id==='goal:routine:old:'+TODAY)?.manualMinutes).toBe(7);
 await done(box);

 await addMission(page).click();
 let sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await expect(sheet.locator('[data-routine="routine:old"]')).toContainText('2/5일 완료 · 1일 놓침 · 11.06까지');
 await expect(sheet.locator('.vz-routines-ended summary')).toContainText('끝난 반복 1');
 await expect(sheet.locator('.vz-routines-ended .vz-routine')).toContainText('최종 1/2일 완료');
 // 고치기: 남은 일수 3 → 6 (today included); the whole routine may not pass 60 days.
 await sheet.getByRole('button',{name:'허밍 5분 고치기',exact:true}).click();
 const left=sheet.getByLabel('남은 일수',{exact:true});
 await expect(left).toHaveValue('3');await expect(left).toHaveAttribute('max','58');
 await left.fill('6');
 await sheet.getByRole('button',{name:'저장',exact:true}).click();
 await expect.poll(async()=>(await db(page)).practicePlans.find(p=>p.id==='routine:old').endDate).toBe('2026-11-09');
 let data=await db(page);
 expect(data.dailyGoals.filter(g=>g.sourceId==='routine:old').map(g=>[g.date,g.completed])).toEqual([
  ['2026-11-02',true],['2026-11-03',false],[TODAY,true],['2026-11-05',false],['2026-11-06',false],['2026-11-07',false],['2026-11-08',false],['2026-11-09',false]]);
 expect(data.practicePlans.find(p=>p.id==='routine:old').days).toBe(8);

 // 숙제 → 매일 반복: today's planned homework joins the routine, days stay homework, the assignment stays open.
 sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await expect(sheet.locator('[data-routine="routine:old"]')).toContainText('2/8일 완료');
 await sheet.getByRole('button',{name:'호흡을 길게 유지하기 매일 반복으로',exact:true}).click();
 await expect(sheet.getByLabel('숙제 반복 일수',{exact:true})).toHaveValue('5');
 await sheet.getByRole('button',{name:'저장',exact:true}).click();
 await expect.poll(async()=>(await db(page)).practicePlans.some(p=>p.source==='homework'&&p.sourceId==='a1')).toBe(true);
 data=await db(page);
 const hw=data.practicePlans.find(p=>p.source==='homework');
 expect(hw).toMatchObject({kind:'routine',title:'호흡을 길게 유지하기',startDate:TODAY,endDate:'2026-11-08',days:5});
 const days=data.dailyGoals.filter(g=>g.sourceId==='a1');
 expect(days.map(g=>[g.id,g.date,g.source,g.routineId])).toEqual([['g1',TODAY,'homework',hw.id],
  ...['2026-11-05','2026-11-06','2026-11-07','2026-11-08'].map(d=>[hw.id+':'+d,d,'homework',hw.id])]);
 expect(data.assignments.find(t=>t.id==='a1').status).toBe('active');
 await expect(page.getByRole('dialog',{name:'오늘의 목표',exact:true}).getByRole('button',{name:'호흡을 길게 유지하기 매일 반복으로'})).toHaveCount(0);
 await page.getByRole('dialog',{name:'오늘의 목표',exact:true}).getByRole('button',{name:'돌아가기'}).click();
 await expect(mission(page,'호흡을 길게 유지하기')).toBeVisible();
 await noOverflow(page);
});
// ----- 필수 미션: a box only checks its goal. The goal's time is written in the recorder's 시간·녹음 sheet (the rows with
// 시간 적고 체크 / 시간 고치기 and their preselected minutes left home in step 2, 2026-11-27). -----
// Today 12 minutes (p1) against the 30-minute day plan; week plan 3 hours.
const timeSeed=()=>{const value=seed();value.practices=[{id:'p1',date:TODAY,manualMinutes:12,songId:'s1',practiceMode:'song'}];return value;};
test('the 필수 미션 box keeps a check without time: nothing opens on check or untick, and nothing is recorded',async({page})=>{
 await phoneWidth(page);await boot(page,timeSeed());
 const before=await db(page),box=mission(page,'호흡을 길게 유지하기');
 await box.click();await done(box);
 await page.evaluate(()=>new Promise(r=>setTimeout(r,300)));await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.sheet-back')).toHaveCount(0);
 let value=await db(page);
 expect(value.dailyGoals.find(g=>g.id==='g1').completed).toBe(true);expect(value.dailyGoals.find(g=>g.id==='g1').performance).toBeUndefined();
 expect(value.practices).toEqual(before.practices);
 await expectTop(page,'12분','30분','12분','3시간');
 await box.click();await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='g1').completed).toBe(false);await done(box,false);
 await page.evaluate(()=>new Promise(r=>setTimeout(r,300)));await expect(page.getByRole('dialog')).toHaveCount(0);
 value=await db(page);expect(value.practices).toEqual(before.practices);
 expect(value.dailyGoals.map(({updatedAt,...g})=>g)).toEqual(before.dailyGoals); // back as it was (VZ.change stamps updatedAt)
});
test('the recorder\'s time sheet keeps 오늘 녹음 연결 folded, always lists recordings already linked and never counts their length',async({page})=>{
 await phoneWidth(page);const value=timeSeed();
 value.dailyGoals[1].performance={minutes:null,mediaIds:['old-link'],at:1};
 await boot(page,value);
 await page.evaluate(date=>{
  const files=[{id:'old-link',name:'어제 녹음.m4a',recordedDate:'2026-11-03',durationSeconds:900},...Array.from({length:14},(_,i)=>({id:'m'+i,name:'오늘 녹음 '+i+'.m4a',recordedDate:date,durationSeconds:600}))].map(m=>({...m,type:'audio/mp4'}));
  VZ.media.list=async()=>files;
 },TODAY);
 // The sheet is the recorder's now (a take made for a goal); opened here directly for the completed goal.
 await page.evaluate(()=>{VZ.goalPerformanceSheet('g2');});
 const sheet=timeSheet(page),media=sheet.locator('.vz-time-media');
 await expect(media).toBeVisible();await expect(media).not.toHaveAttribute('open','');await expect(media.locator('summary')).toContainText('오늘 녹음 연결 1개 연결됨');
 await media.locator('summary').click();
 // The linked recording (another day) leads the list; today's are capped at twelve.
 await expect(media.locator('.vz-plan-option')).toHaveCount(13);
 await expect(media.locator('.vz-plan-option').first()).toContainText('어제 녹음');await expect(media.locator('input[value=old-link]')).toBeChecked();
 await media.locator('.vz-plan-option').filter({hasText:'오늘 녹음 0.m4a'}).click();await expect(media.locator('summary')).toContainText('2개 연결됨');
 await sheet.getByRole('button',{name:'20분',exact:true}).click();await sheet.getByRole('button',{name:'저장',exact:true}).click();
 await expect(sheet).toHaveCount(0);await expect(page.locator('.sheet.vz-today-popup')).toHaveCount(0);
 const data=await db(page),row=data.practices.find(p=>p.id==='goal:g2');
 expect(row).toMatchObject({manualMinutes:20,minutes:20,mediaIds:['old-link','m0']});expect(row.mediaSeconds).toBeUndefined();
 expect(data.dailyGoals.find(g=>g.id==='g2').performance).toMatchObject({minutes:20,mediaIds:['old-link','m0']});
 await expectTop(page,'32분','30분','32분','3시간');
});
for(const width of [320,375])test('the top at '+width+'px: ring, date, line and the week\'s days fit; the days open a sheet that says where the target comes from',async({page})=>{
 await page.setViewportSize({width,height:width===320?640:812});
 const value=timeSeed();value.practicePlans=[];value.practices.push({id:'p0',date:'2026-11-03',manualMinutes:50,songId:'s1',practiceMode:'song'});
 await boot(page,value);const row=weekStrip(page);
 await expectTop(page,'12분','30분','1시간 2분','3시간 30분');
 await expect(ring(page)).toHaveAccessibleName('오늘 연습 12분, 오늘 목표 30분, 달성률 40%');
 await expect(row).toHaveAccessibleName('이번 주 연속 2일, 이번 주 연습 1시간 2분, 목표 3시간 30분, 달성률 30%, 자세히 보기');
 await expect(page.locator('.vz-header .vz-top-date')).toHaveText('11월 4일 수요일');await expect(ringSay(page)).toHaveText('18분만 더 하면 오늘 목표');
 // Everything inside the screen, nothing clipped; the ring and the buttons do not overlap; the days row is a 44px target.
 const box=await page.locator('.vz-student-home').evaluate(host=>{
  const r=host.shadowRoot,rect=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height,width:b.width};};
  return {brand:rect(r.querySelector('.vz-brand')),ring:rect(r.querySelector('.vz-ring')),words:rect(r.querySelector('.vz-top-words')),actions:rect(r.querySelector('.vz-header-actions')),strip:rect(r.querySelector('.vz-week-strip')),
   text:rect(r.querySelector('.vz-week-strip-text')),dots:rect(r.querySelector('.vz-week-dots')),
   clipped:[...r.querySelectorAll('.vz-top-date,.vz-top-say,.vz-week-strip-text')].filter(e=>e.scrollWidth>e.clientWidth+1).length};
 });
 expect(box.ring.left).toBeGreaterThanOrEqual(12);expect(box.words.left).toBeGreaterThanOrEqual(box.ring.right);// The logo shares the first line with the bell and the gear; the ring and its words sit on the line below them.
 expect(box.brand.left).toBeGreaterThanOrEqual(12);expect(box.brand.right).toBeLessThanOrEqual(box.actions.left+1);expect(box.brand.height).toBeGreaterThanOrEqual(44);
 expect(box.ring.top).toBeGreaterThanOrEqual(box.actions.bottom-1);expect(box.words.right).toBeLessThanOrEqual(width);
 expect(box.actions.right).toBeLessThanOrEqual(width);expect(box.dots.right).toBeLessThanOrEqual(box.strip.right+1);expect(box.text.right).toBeLessThanOrEqual(box.dots.left);
 expect(box.strip.height).toBeGreaterThanOrEqual(44);expect(box.clipped).toBe(0);
 await noOverflow(page);
 // The days open a short sheet: the same numbers, and once, where 3시간 30분 comes from, with the way to change it.
 await row.click();
 const sheet=page.getByRole('dialog',{name:'이번 주 연습',exact:true});
 await expect(sheet.locator('[data-week-block=today]')).toContainText('오늘12분/ 목표 30분 · 40%');await expect(sheet.locator('[data-week-block=week]')).toContainText('이번 주1시간 2분/ 목표 3시간 30분 · 30%');
 await expect(sheet.locator('[data-week-source]')).toHaveText('하루 30분 × 7일 · 설정에서 바꿀 수 있어요');await expect(sheet.locator('[data-week-source]')).toHaveCount(1);
 const link=sheet.getByRole('button',{name:'설정에서 바꿀 수 있어요',exact:true});expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(43.9); // WebKit reports 43.99997 for a 44px box
 await noOverflow(page);
 await link.click();await expect(page).toHaveURL(/#\/settings$/);await expect(page.locator('[data-daily-target]')).toBeFocused();
 // No daily setting: no day or week target, said as 목표 없음; the ring is empty and its line offers to set a goal.
 await page.goto('/#/home');await ready(page);
 await page.evaluate(()=>VZ.change(d=>{d.settings={...d.settings,dailyTargetMinutes:0};}));
 await expectTop(page,'12분',null,'1시간 2분',null);await expect(ring(page)).toHaveAccessibleName('오늘 연습 12분, 오늘 목표 없음');
 expect(await ring(page).locator('.vz-ring-bar').evaluate(e=>getComputedStyle(e).opacity)).toBe('0');
 await expect(row).toHaveAccessibleName('이번 주 연속 2일, 이번 주 연습 1시간 2분, 목표 없음, 자세히 보기');
 expect(await page.evaluate(()=>VZ.todayPracticeText())).toBe('오늘 12분 · 목표 없음');
 const set=page.getByRole('button',{name:'오늘 목표를 정해 보세요',exact:true});expect((await set.boundingBox()).height).toBeGreaterThanOrEqual(43.9);
 await set.click();const goalsSheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await expect(goalsSheet).toBeVisible();
 await goalsSheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(goalsSheet).toHaveCount(0);
 // A week plan set by hand is named as such and leads to the goal sheet where it was set.
 await page.evaluate(week=>VZ.change(d=>{d.settings.dailyTargetMinutes=30;d.practicePlans=[{id:'week:'+week,period:'week',date:week,targetMinutes:120}];}),WEEK);
 await expectTop(page,'12분','30분','1시간 2분','2시간');
 await row.click();await expect(sheet.locator('[data-week-source]')).toHaveText('이번 주 목표로 직접 정한 시간이에요 · 오늘의 목표 설정에서 바꿀 수 있어요');
 await sheet.getByRole('button',{name:'오늘의 목표 설정에서 바꿀 수 있어요',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'오늘의 목표',exact:true}).getByLabel('이번 주 목표 시간(분)',{exact:true})).toHaveValue('120');
});
test('the 오늘의 연습 card at 320px: long goals and many steps stay inside; boxes and tiles are 44px targets',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 const value=timeSeed();
 value.dailyGoals.push({id:'g4',date:TODAY,title:'후렴 고음에서 힘 빼고 길게 끌기 연습을 세 번 반복하기',source:'homework',sourceId:'a1',completed:true,order:3,performance:{minutes:90,mediaIds:[],at:1}});
 value.practices.push({id:'goal:g4',date:TODAY,minutes:90,manualMinutes:90,practiceTimeSource:'goal',practiceMode:'training',goalId:'g4',mediaIds:[],completed:['a1']});
 await boot(page,value);
 await expect(goals(page)).toHaveCount(4);await expect(todayCount(page)).toHaveText('필수 미션 2/4');
 const card=await page.locator('[data-home-today]').boundingBox();
 for(const el of [...await goals(page).all(),...await page.locator('[data-home-today] .vz-pc-head button').all()]){const b=await el.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(40);expect(b.x).toBeGreaterThanOrEqual(card.x-1);expect(b.x+b.width).toBeLessThanOrEqual(card.x+card.width+1);}
 for(const el of await page.locator('[data-home-today] .vz-pc-tile').all()){const b=await el.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);}
 await noOverflow(page);
});
// ----- 목표에서 녹음 (2026-11-13): mic on a goal row → recorder with the goal → the same 시간·녹음 sheet -----
// The real recorder runs on the fake microphone; only the reported length is fixed so the preselected minutes are known.
const FAKE_MIC='the recorder needs the fake microphone, which only the Chromium projects have';
const takeLength=(page,seconds)=>page.evaluate(seconds=>{
 const real=VZ.media.capture;
 VZ.media.capture=async options=>{const session=await real(options),stop=session.stop.bind(session);session.stop=async()=>({...await stop(),durationSeconds:seconds});return session;};
},seconds);
const recordTake=async page=>{
 await page.getByRole('button',{name:'녹음 시작',exact:true}).click();await expect(page.getByRole('button',{name:'녹음 종료',exact:true})).toBeVisible();
 await page.waitForTimeout(700);await page.getByRole('button',{name:'녹음 종료',exact:true}).click();
 await expect(page.locator('[data-review] [data-p] .player')).toBeVisible();await page.locator('[data-review] [data-save]').click();
 await expect(page.getByText('저장했어요',{exact:true})).toBeVisible();
};
const takes=page=>page.evaluate(async()=>(await VZ.media.list()).filter(m=>m.source==='practice').map(m=>m.id));
const homeworkReps=page=>page.evaluate(()=>VzipPracticeTime.homeworkProgress(VZ.db,'a1').reps);
const pickGoal=page=>page.getByRole('dialog',{name:'어느 목표의 연습인가요?',exact:true});
test('the recorder opened for a goal shows the goal line; ✕ detaches; nothing overflows at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 const value=timeSeed();value.dailyGoals[0].songId='s1';
 value.dailyGoals.push({id:'g4',date:TODAY,title:'후렴 고음에서 힘 빼고 길게 끌기 연습을 세 번 반복하기',source:'personal',completed:false,order:3},{id:'old',date:'2026-11-03',title:'어제 목표',source:'personal',completed:false});
 await boot(page,value);const before=await db(page);
 // 오늘의 연습 has no mic per goal; the recorder still takes a goal by its address.
 await expect(page.locator('[data-home-today] .vz-goal-mic')).toHaveCount(0);
 await expect(mission(page,'후렴 고음에서 힘 빼고 길게 끌기 연습을 세 번 반복하기')).toBeVisible();
 await noOverflow(page);
 // Opening the recorder for a goal never ticks it; it carries the goal and the goal's song.
 await page.goto('/#/record?goal=g1&song=s1');
 const line=page.locator('[data-record-goal]');
 await expect(line).toHaveText('목표: 호흡을 길게 유지하기');await expect(page.locator('[data-song-name]')).toHaveText('This Is the Moment');
 expect(await db(page)).toEqual(before);
 await noOverflow(page);
 const detach=page.getByRole('button',{name:'목표 연결 빼기',exact:true});
 expect((await detach.boundingBox()).width).toBeGreaterThanOrEqual(44);expect((await detach.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await detach.click();await expect(line).toHaveCount(0);
 await expect.poll(()=>new URL(page.url()).hash).toBe('#/record?song=s1');await expect(page.locator('[data-song-name]')).toHaveText('This Is the Moment');
 // A long goal is cut with an ellipsis on one line inside the screen (the ✕ stays reachable).
 await page.goto('/#/home');await ready(page);await page.goto('/#/record?goal=g4');
 await expect(line).toHaveText('목표: 후렴 고음에서 힘 빼고 길게 끌기 연습을 세 번 반복하기');
 const fit=await line.evaluate(el=>{const r=el.getBoundingClientRect(),x=el.querySelector('[data-goal-detach]').getBoundingClientRect(),t=el.querySelector('.vz-record-goal-text');
  return {left:r.left,right:r.right,height:r.height,x:x.right,cut:t.scrollWidth>t.clientWidth,overflow:getComputedStyle(t).textOverflow};});
 expect(fit.left).toBeGreaterThanOrEqual(0);expect(fit.right).toBeLessThanOrEqual(320);expect(fit.x).toBeLessThanOrEqual(320);expect(fit.height).toBeLessThanOrEqual(48);
 expect(fit.cut).toBe(true);expect(fit.overflow).toBe('ellipsis');
 await noOverflow(page);
 // No line for an unknown goal, another day's goal, or a lesson recording.
 for(const hash of ['#/record?goal=nope','#/record?goal=old','#/record?lesson=l1&goal=g1']){
  await page.goto('/#/home');await ready(page);await page.goto('/'+hash);await expect(page.getByRole('button',{name:'녹음 시작',exact:true})).toBeVisible();await expect(line).toHaveCount(0);
 }
 expect(await db(page)).toEqual(before);
});
test('a take made for a goal: the sheet opens with it ticked and its length preselected; 저장 ticks the goal once with the time, the take and one homework repetition',async({page,browserName})=>{
 test.skip(browserName==='webkit',FAKE_MIC);
 await phoneWidth(page);await boot(page,timeSeed());
 expect(await homeworkReps(page)).toBe(0);
 await page.goto('/#/record?goal=g1');
 await expect(page.locator('[data-record-goal]')).toHaveText('목표: 호흡을 길게 유지하기');
 await takeLength(page,170); // 2:50 → 3 minutes, rounded up
 await recordTake(page);
 const [take]=await takes(page);expect(take).toBeTruthy();
 const sheet=timeSheet(page);await expect(sheet).toBeVisible();
 await expect(sheet.locator('.sheet-head h2')).toHaveText('호흡을 길게 유지하기');
 await expect(sheet.getByRole('button',{name:'직접 입력',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(sheet.getByLabel('연습 시간(분) 직접 입력',{exact:true})).toHaveValue('3');
 await expect(sheet.locator('[data-time-hint]')).toHaveText('녹음 길이 3분을 골라 뒀어요. 바꿀 수 있어요.');
 await expect(sheet.getByText('녹음 길이는 더하지 않아요')).toHaveCount(0);
 // The take is already linked and shown ticked; nothing else is written until 저장.
 const media=sheet.locator('.vz-time-media');await expect(media).toHaveAttribute('open','');await expect(media.locator('summary')).toContainText('1개 연결됨');
 await expect(media.locator('.vz-plan-option')).toHaveCount(1);await expect(media.locator('input[value="'+take+'"]')).toBeChecked();
 let value=await db(page);
 expect(value.dailyGoals.find(g=>g.id==='g1')).toMatchObject({completed:false,performance:{minutes:null,mediaIds:[take]}});
 expect(value.practices.map(p=>p.id)).toEqual(['p1']);expect(await page.evaluate(()=>VZ.todayPractice().minutes)).toBe(12);
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 // No result popup: a short line says what was kept (오늘 연습 on home shows today against the target).
 await expect(page.locator('.toast')).toHaveText('연습 3분을 기록했어요.');await expect(page.locator('.sheet.vz-today-popup')).toHaveCount(0);
 value=await db(page);
 expect(value.dailyGoals.find(g=>g.id==='g1')).toMatchObject({completed:true,performance:{minutes:3,mediaIds:[take]}});
 expect(value.practices.filter(p=>p.goalId==='g1')).toEqual([expect.objectContaining({id:'goal:g1',date:TODAY,manualMinutes:3,minutes:3,practiceTimeSource:'goal',mediaIds:[take],completed:['a1'],assignmentReps:{a1:1}})]);
 expect(value.practices).toHaveLength(2);expect(await homeworkReps(page)).toBe(1);
 expect(value.assignments.find(t=>t.id==='a1').status).toBe('active');
 // The recorder no longer offers a second 연습 기록 for this take; 오늘 shows the goal ticked with its time.
 await expect(page.locator('[data-review] [data-log]')).toHaveCount(0);
 await page.locator('[data-review]').getByRole('link',{name:'오늘로',exact:true}).click();await ready(page);
 const box=mission(page,'호흡을 길게 유지하기');
 await done(box); // (the goal's minutes were on its row; home shows the check, the ring counts the time)
 await expectTop(page,'15분','30분','15분','3시간');
 // Unticking and ticking again never counts the time or the homework a second time.
 await box.click();await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='g1').completed).toBe(false);await done(box,false);
 await box.click();await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='g1').completed).toBe(true);await expect(page.getByRole('dialog')).toHaveCount(0);
 value=await db(page);
 expect(value.practices.filter(p=>p.goalId==='g1').map(p=>[p.manualMinutes,p.mediaIds])).toEqual([[3,[take]]]);expect(await homeworkReps(page)).toBe(1);
 expect(await takes(page)).toEqual([take]);
});
test('건너뛰기 after a take made for a goal keeps the take linked, the goal unticked and no time',async({page,browserName})=>{
 test.skip(browserName==='webkit',FAKE_MIC);
 await phoneWidth(page);await boot(page,timeSeed());const before=await db(page);
 await page.goto('/#/record?goal=g3');
 await takeLength(page,45);await recordTake(page);
 const [take]=await takes(page),sheet=timeSheet(page);
 await expect(sheet.getByLabel('연습 시간(분) 직접 입력',{exact:true})).toHaveValue('1'); // under a minute: at least 1
 await sheet.getByRole('button',{name:'건너뛰기',exact:true}).click();await expect(sheet).toHaveCount(0);
 await expect(page.locator('.toast')).toHaveText('녹음만 목표에 연결했어요.');await expect(page.locator('.sheet.vz-today-popup')).toHaveCount(0);
 const value=await db(page);
 expect(value.dailyGoals.find(g=>g.id==='g3')).toMatchObject({completed:false,performance:{minutes:null,mediaIds:[take]}});
 expect(value.practices).toEqual(before.practices);expect(await page.evaluate(()=>VZ.todayPractice().minutes)).toBe(12);
 await expect(page.locator('[data-review] [data-log]')).toBeVisible();
 // Ticking the goal later on 오늘 only checks it (no sheet); the take stays linked.
 await page.goto('/#/home');await ready(page);
 await done(mission(page,'후렴 연결 연습하기'),false);
 await mission(page,'후렴 연결 연습하기').click();
 await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='g3').completed).toBe(true);await expect(page.getByRole('dialog')).toHaveCount(0);
 expect((await db(page)).dailyGoals.find(g=>g.id==='g3')).toMatchObject({completed:true,performance:{minutes:null,mediaIds:[take]}});
});
test('a plain take asks once which goal it was for: 목표 없이 저장 changes nothing, picking a goal completes it through the same sheet',async({page,browserName})=>{
 test.skip(browserName==='webkit',FAKE_MIC);
 await phoneWidth(page);const value=timeSeed();value.dailyGoals[2].songId='s1';
 for(let i=0;i<5;i++)value.dailyGoals.push({id:'more'+i,date:TODAY,title:'추가 목표 '+i,source:'personal',completed:false,order:3+i});
 await boot(page,value);const before=await db(page);
 await page.goto('/#/record?song=s1');await takeLength(page,61);await recordTake(page);
 const step=pickGoal(page);await expect(step).toBeVisible();
 // At most five unfinished goals, the one for this song first; completed goals are not offered.
 await expect(step.locator('.vz-goal-pick-row>span')).toHaveText(['후렴 연결 연습하기','호흡을 길게 유지하기','추가 목표 0','추가 목표 1','추가 목표 2']);
 for(const row of await step.locator('.vz-goal-pick-row').all())expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
 const none=step.getByRole('button',{name:'목표 없이 저장',exact:true});await expect(none).toBeFocused();
 await noOverflow(page);
 await none.click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await db(page)).toEqual(before);const [first]=await takes(page);expect(first).toBeTruthy();
 // A second take: pick the goal → the same sheet, the take ticked, 2 minutes (1:01 rounded up) preselected.
 await page.getByRole('button',{name:'새 녹음',exact:true}).click();await recordTake(page);
 const second=(await takes(page)).find(id=>id!==first);
 await step.locator('.vz-goal-pick-row').filter({hasText:'후렴 연결 연습하기'}).click();
 const sheet=timeSheet(page);await expect(sheet.locator('.sheet-head h2')).toHaveText('후렴 연결 연습하기');
 await expect(sheet.getByLabel('연습 시간(분) 직접 입력',{exact:true})).toHaveValue('2');await expect(sheet.locator('.vz-time-media input[value="'+second+'"]')).toBeChecked();
 await expect(sheet.locator('.vz-time-media .vz-plan-option')).toHaveCount(2); // the earlier take of today is listed, not ticked
 await expect(sheet.locator('.vz-time-media input[value="'+first+'"]')).not.toBeChecked();
 await sheet.getByRole('button',{name:'5분',exact:true}).click();await sheet.getByRole('button',{name:'저장',exact:true}).click();
 await expect(page.locator('.toast')).toHaveText('연습 5분을 기록했어요.');await expect(page.locator('.sheet.vz-today-popup')).toHaveCount(0);
 const after=await db(page);
 expect(after.dailyGoals.find(g=>g.id==='g3')).toMatchObject({completed:true,performance:{minutes:5,mediaIds:[second]}});
 expect(after.practices.filter(p=>p.goalId==='g3')).toEqual([expect.objectContaining({id:'goal:g3',manualMinutes:5,mediaIds:[second],songId:'s1',practiceMode:'song'})]);
 expect(after.dailyGoals.filter(g=>g.id!=='g3')).toEqual(before.dailyGoals.filter(g=>g.id!=='g3'));
});
const noDialog=async page=>{await page.evaluate(()=>new Promise(r=>setTimeout(r,400)));await expect(page.getByRole('dialog')).toHaveCount(0);};
test('no goal step after a take for a lesson recording or while the practice set runs',async({page,browserName})=>{
 test.skip(browserName==='webkit',FAKE_MIC);
 // A 보이스 체크 saved today: the set has no ① and starts on the homework goal.
 const seeded=timeSeed();seeded.practices.push({id:'voice-check:t',date:TODAY,minutes:.5,manualMinutes:.5,practiceTimeSource:'voice-check',practiceMode:'training',songId:'',voiceCheck:{v:1,selfRating:4,at:1}});
 await phoneWidth(page);await boot(page,seeded);
 // Lesson recording: it belongs to the lesson, the goals are not asked about (even with ?goal= in the address).
 await page.goto('/#/record?lesson=l1&goal=g1');await takeLength(page,30);await recordTake(page);await noDialog(page);
 // 오늘의 연습 is running one of the person's own steps (the homework goal, first): it links its own takes when the singer comes back.
 await page.goto('/#/home');await ready(page);await page.locator('[data-home-practice] [data-row="practice-set"] [data-set-go]').click();
 await expect.poll(()=>page.evaluate(()=>!!VZ.practiceSetClock.state())).toBe(true);
 await page.goto('/#/record');await takeLength(page,30);await recordTake(page);await noDialog(page);
 const value=await db(page);
 expect(value.dailyGoals).toEqual(seeded.dailyGoals);expect(value.practices).toEqual(seeded.practices);
 expect(await takes(page)).toHaveLength(1); // the lesson take is a lesson recording, not a practice take
});
test('no goal step after a take when every goal of today is done',async({page,browserName})=>{
 test.skip(browserName==='webkit',FAKE_MIC);
 await phoneWidth(page);const seeded=timeSeed();for(const g of seeded.dailyGoals)g.completed=true;
 seeded.dailyGoals.push({id:'tomorrow',date:'2026-11-05',title:'내일 목표',source:'personal',completed:false});
 await boot(page,seeded);
 await page.goto('/#/record');await takeLength(page,30);await recordTake(page);await noDialog(page);
 const value=await db(page);expect(value.dailyGoals).toEqual(seeded.dailyGoals);expect(value.practices).toEqual(seeded.practices);
 await expect(page.locator('[data-review] [data-log]')).toBeVisible();
});
test('goal planning separates long selectable rows and keeps save visible on small screens',async({page},testInfo)=>{
 const value=seed();value.dailyGoals[0].title='악보에 너무 맞추려 하지 않고 반주치면서 박자와 리듬을 가지고 노는 것처럼 연습하기 · 18마디 참고';
 await boot(page,value);
 for(const width of widths){
  await page.setViewportSize({width,height:744});
  await addMission(page).click();
  const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
  await sheet.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished));});
  const rows=sheet.locator('.vz-plan-option'),save=sheet.getByRole('button',{name:'목표 저장',exact:true});
  // Today's three goals and the top (at most three) of 다음 연습 not in them yet.
  const offered=await page.evaluate(()=>Math.min(3,VZ.nextPractice().items.filter(x=>!x.doneToday&&!x.inGoals&&x.canAdd).length));
  expect(offered).toBeGreaterThan(0);
  await expect(rows).toHaveCount(3+offered);await expect(sheet.locator('[data-plan-count]')).toHaveText('3개 선택');
  const first=await rows.nth(0).boundingBox(),second=await rows.nth(1).boundingBox();
  expect(second.y).toBeGreaterThanOrEqual(first.y+first.height+7);expect(first.height).toBeGreaterThanOrEqual(56);
  const text=await rows.nth(0).locator('.vz-plan-title').boundingBox(),badge=await rows.nth(0).locator('small').boundingBox();
  expect(text.x+text.width).toBeLessThanOrEqual(badge.x-11);
  await expect(rows.nth(0).locator('.vz-plan-check')).toHaveCSS('background-color','rgb(122, 50, 245)');
  const before=await save.boundingBox();expect(before.y+before.height).toBeLessThanOrEqual(744);
  await sheet.locator('.sheet-body').evaluate(el=>el.scrollTop=el.scrollHeight);
  const after=await save.boundingBox();expect(Math.abs(before.y-after.y)).toBeLessThanOrEqual(1);
  await noOverflow(page);expect(await sheet.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await sheet.locator('.sheet-body').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:testInfo.outputPath('student-home-plan-'+width+'.png'),animations:'disabled'});
  await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 }
});
test('goal selection remains keyboard accessible and leaves source homework unchanged',async({page})=>{
 await boot(page);const before=await db(page);
 await addMission(page).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true}),check=sheet.locator('input[name=goal]').first();
 await check.focus();await page.keyboard.press('Space');await expect(check).not.toBeChecked();
 await expect(sheet.locator('[data-plan-count]')).toHaveText('2개 선택');
 await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 await page.getByRole('dialog',{name:'목표 빼기',exact:true}).getByRole('button',{name:'빼기',exact:true}).click();
 await expect(sheet).toHaveCount(0);
 const after=await db(page);expect(after.dailyGoals.some(g=>g.id==='g1')).toBe(false);expect(after.dailyGoals.some(g=>g.id==='g2'&&g.completed===true)).toBe(true);
 expect(after.assignments).toEqual(before.assignments);expect(after.practices).toEqual(before.practices);
});
test('goal sheet locks completed and recorded goals and asks once before removing the others',async({page})=>{
 const value=seed();
 // g2: completed with a 수행 기록 (12 typed minutes). r:TODAY: today's completed day of a running routine.
 value.dailyGoals[1].performance={minutes:12,mediaIds:[],at:1};
 value.practices.push({id:'goal:g2',date:TODAY,minutes:12,manualMinutes:12,practiceTimeSource:'goal',practiceMode:'training',songId:'',mediaIds:[],memo:'[목표] 곡의 가사를 천천히 읽기',goalId:'g2',goalSource:'personal',completed:[],assignmentReps:{},assignmentNotes:{},technique:[],created:1,performedAt:1});
 value.practicePlans.push({id:'routine:r',kind:'routine',title:'립트릴',days:3,startDate:TODAY,endDate:'2026-11-06',created:1,archived:false,changes:[]});
 for(const [i,date] of [TODAY,'2026-11-05','2026-11-06'].entries())value.dailyGoals.push({id:'routine:r:'+date,date,title:'립트릴',source:'personal',sourceId:'routine:r',routineId:'routine:r',routine:true,completed:i===0,order:3,created:1});
 await boot(page,value);const before=await db(page);
 await addMission(page).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true}),save=sheet.getByRole('button',{name:'목표 저장',exact:true});
 const row=id=>sheet.locator('.vz-plan-option').filter({has:page.locator('input[value="existing:'+id+'"]')});
 // Completed goals read as done and cannot be unticked.
 for(const id of ['g2','routine:r:'+TODAY]){
  await expect(row(id).locator('input')).toBeChecked();await expect(row(id).locator('input')).toBeDisabled();
  await expect(row(id).locator('.vz-plan-source')).toContainText('완료');
  await row(id).click({force:true});await expect(row(id).locator('input')).toBeChecked();
 }
 await expect(row('g1').locator('input')).toBeEnabled();await expect(row('g1').locator('.vz-plan-source')).not.toContainText('완료');
 await row('g1').click();await row('g3').click();
 await expect(sheet.locator('[data-plan-count]')).toHaveText('2개 선택');
 // One question for both removals; 취소 changes nothing and keeps the sheet and the choices.
 await save.click();
 let ask=page.getByRole('dialog',{name:'목표 빼기',exact:true});
 await expect(ask).toContainText('목표 2개');await expect(ask).toContainText('호흡을 길게 유지하기');await expect(ask).toContainText('후렴 연결 연습하기');
 await ask.getByRole('button',{name:'취소',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'목표 빼기',exact:true})).toHaveCount(0);
 await expect(sheet).toBeVisible();await expect(save).toBeEnabled();await expect(row('g1').locator('input')).not.toBeChecked();
 expect((await db(page)).dailyGoals).toEqual(before.dailyGoals);
 await save.click();ask=page.getByRole('dialog',{name:'목표 빼기',exact:true});
 await ask.getByRole('button',{name:'빼기',exact:true}).click();
 await expect(sheet).toHaveCount(0);
 const after=await db(page),ids=after.dailyGoals.map(g=>g.id);
 expect(ids).not.toContain('g1');expect(ids).not.toContain('g3');
 // Completed goals, their record and practice row, and the routine's other days are untouched.
 for(const id of ['g2','routine:r:'+TODAY,'routine:r:2026-11-05','routine:r:2026-11-06'])expect(after.dailyGoals.find(g=>g.id===id)).toMatchObject(before.dailyGoals.find(g=>g.id===id));
 expect(after.practices).toEqual(before.practices);expect(after.assignments).toEqual(before.assignments);
 for(const p of after.practices.filter(p=>p.goalId))expect(ids).toContain(p.goalId);
 // Saving without removing anything does not ask.
 await addMission(page).click();
 await sheet.getByLabel('개인 목표',{exact:true}).fill('새 목표');await save.click();
 await expect(sheet).toHaveCount(0);await expect(page.getByRole('dialog',{name:'목표 빼기',exact:true})).toHaveCount(0);
 expect((await db(page)).dailyGoals.some(g=>g.title==='새 목표')).toBe(true);
});
test('continue practice preselects the recent song with and without a recording and preserves history',async({page})=>{
 await boot(page);
 for(const withRecording of [false,true]){
  if(withRecording){
 await page.evaluate(async date=>{
  window.vzipCloudSignedIn=()=>false;
  const rate=16000,frames=rate*3,bytes=new Uint8Array(44+frames*2),view=new DataView(bytes.buffer);
  const text=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
  text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,frames*2,true);
  for(let i=0;i<frames;i++)view.setInt16(44+i*2,Math.sin(i/rate*440*Math.PI*2)*4000,true);
  await window.vzipStorePracticeMedia({id:'file1',name:'최근 연습 녹음',songId:'s1',source:'practice',type:'audio/wav',recordedDate:date,dateSource:'manual',created:Date.now(),durationSeconds:3,blob:new Blob([bytes],{type:'audio/wav'})});
  VZ.media.invalidate();VZ.render();
 },TODAY);
  }
  const before=await db(page);
  await page.getByRole('button',{name:'This Is the Moment 연습하기',exact:true}).click();
  await expect(page).toHaveURL(/#\/record\?song=s1$/);
  await expect(page.locator('[data-song-name]')).toHaveText('This Is the Moment');
  // Headless WebKit may have no MediaRecorder; both supported and fallback views must stay idle.
  await expect(page.locator('.rec-time')).toHaveText('0:00');
  await expect(page.locator('.rec-dot')).toHaveCount(0);
  await expect(page.locator('[data-main]')).toHaveAttribute('aria-label','녹음 시작');
  await expect(page.locator('[data-home-player]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/home');await ready(page);
  const after=await db(page);
  for(const key of ['songs','lessons','assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
 }
});

test('large text and long user content remain operable and scroll above the floating button',async({page},testInfo)=>{
 const value=seed(),title='긴 한국어 가사와 LongEnglishWord를 끝까지 호흡하며 연결해서 연습하기 '.repeat(10),song='LongEnglishSongTitleAnd한글곡명'.repeat(9);
 value.songs[0].title=song;
 value.dailyGoals=[{id:'long',date:TODAY,title,source:'personal',completed:false,order:0}];
 await boot(page,value);
 // Double every text size once; rows repainted after a media refresh are enlarged on the next pass.
 const enlarge=()=>page.locator('.vz-student-home').evaluate(host=>{
  const nodes=[...host.shadowRoot.querySelector('main').querySelectorAll('p,span,strong,small,h2,h3,label,button,b')].filter(n=>!n.dataset.qaLarge),sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));
  nodes.forEach((n,i)=>{n.dataset.qaLarge='1';n.style.setProperty('font-size',sizes[i]*2+'px','important');});
 });
 for(const width of widths){
  await page.setViewportSize({width,height:940});await enlarge();await noOverflow(page);
  const pill=page.getByRole('button',{name:song+' 연습하기',exact:true}),bounds=await pill.boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
  for(const row of await page.locator('.vz-up-card,.vz-sec-link,.vz-pick-random').all()){const b=await row.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.x+b.width).toBeLessThanOrEqual(width);}
  for(const tile of await page.locator('[data-home-today] .vz-pc-tile').all())expect((await tile.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const box=await mission(page,title).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x+box.width).toBeLessThanOrEqual(width);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const end=await page.locator('.vz-recent').boundingBox(),fab=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(end.y+end.height+12).toBeLessThanOrEqual(fab.y);
  await screenshot(page,testInfo,'student-home-large-text-bottom-'+width+'.png');
 }
 await mission(page,title).click();await done(mission(page,title));
});
test('six real schedule combinations never restore sample events',async({page},testInfo)=>{
 const value=seed();value.assignments=[];value.dailyGoals=[];value.practices=[];
 await boot(page,value);
 const lesson=date=>({id:'l1',date,startTime:'18:30',endTime:'19:30',status:'scheduled',songId:'s1',songIds:['s1'],teacher:'김선생',place:'연습실'}),stage=seed().performances;
 for(const [name,data,rows]of [
  ['both',{lessons:[lesson('2026-11-06')],performances:stage},['lesson','stage']],
  ['stages',{lessons:[],performances:stage},['stage']],
  ['lesson',{lessons:[lesson('2026-11-06')],performances:[]},['lesson']],
  ['none',{lessons:[],performances:[]},[]],
  ['today',{lessons:[lesson(TODAY)],performances:stage},['lesson','stage']],
  ['practice',{lessons:[lesson('2026-11-06')],performances:stage,practices:seed().practices},['lesson','stage']]]){
  await page.setViewportSize({width:390,height:940});
  await page.evaluate(data=>VZ.change(d=>{d.lessons=data.lessons;d.performances=data.performances;d.practices=data.practices||[];}),data);
  await expect(page.locator('.vz-student-home .vz-event')).toHaveCount(0);
  const cards=page.locator('[data-home-upcoming] .vz-up-card');
  await expect(cards).toHaveCount(rows.length);if(!rows.length)await expect(page.locator('[data-home-upcoming]')).toBeHidden();else await expect(page.locator('[data-home-upcoming]')).toBeVisible();
  for(const [i,key] of rows.entries())await expect(cards.nth(i)).toHaveAttribute('data-row',key);
  await noSample(page);
  for(const row of await cards.all())expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // One card alone takes the whole row (its line gets the room); two share it.
  if(rows.length){const section=await page.locator('[data-home-upcoming]').boundingBox(),first=await cards.first().boundingBox();
   if(rows.length===1)expect(Math.abs(first.width-section.width)).toBeLessThanOrEqual(1);else expect(first.width).toBeLessThan(section.width/2);}
  for(const width of widths){await page.setViewportSize({width,height:940});await noOverflow(page);}
  await page.setViewportSize({width:390,height:940});await screenshot(page,testInfo,'student-home-upcoming-'+name+'-390.png');
 }
 expect((await db(page)).songs).toEqual(value.songs);
});
test('다가오는 일 · 오늘 부를 곡 at 320/390/430: long titles ellipsize inside their cards, no page overflow, 44px targets, the last block clears the record button',async({page})=>{
 await phoneWidth(page);
 const value=seed(),long='가을 정기 뮤지컬 갈라 콘서트 오디션 최종 라운드 LongEnglishStageTitle'.repeat(2),song='LongEnglishSongTitleAnd한글곡명'.repeat(4);
 value.performances[0].title=long;value.performances[0].kind='audition';value.songs[0].title=song;
 value.lessons[0].place='아주 긴 연습실 이름 '.repeat(4);
 value.assignments.push(...[2,3,4,5,6,7,8,9,10,11].map(n=>({id:'a'+n,lessonId:'l1',title:'숙제 '+n,status:'active',startDate:'2026-11-01'})));
 await boot(page,value);const before=await db(page);
 const cards=page.locator('[data-home-upcoming] .vz-up-card');
 await expect(cards.locator('.vz-up-line')).toHaveText(['18:30 · 숙제 11개',long]);
 await expect(cards.locator('.vz-up-title>span')).toHaveText(['레슨','오디션']);
 const cut=()=>page.locator('.vz-student-home').evaluate(h=>[...h.shadowRoot.querySelectorAll('.vz-up-card,.vz-up-line,.vz-up-title,.vz-recent-pill,.vz-pick-words>span,.vz-pick-why')].map(e=>{const r=e.getBoundingClientRect(),p=e.closest('.vz-up-card,.vz-recent-pill')?.getBoundingClientRect()||r;
  return {cls:e.className,cut:e.scrollWidth>e.clientWidth+1,ellipsis:getComputedStyle(e).textOverflow,inside:r.left>=p.left-.5&&r.right<=p.right+.5,right:r.right};}));
 for(const width of widths){
  await page.setViewportSize({width,height:844});await noOverflow(page);
  const list=await cut();
  // The stage's long title is cut with an ellipsis inside its card; nothing spills out of a card or off the page.
  expect(list.find(x=>x.cls==='vz-up-line'&&x.cut)).toBeTruthy();
  for(const x of list){expect(x.inside,x.cls).toBe(true);if(x.cut)expect(x.ellipsis,x.cls).toBe('ellipsis');}
  for(const x of list.filter(x=>/vz-up-card/.test(x.cls)))expect(x.right).toBeLessThanOrEqual(width-16+.5);
  // The D-day is never the part that is cut.
  for(const d of await cards.locator('.vz-up-dday').all()){const box=await d.boundingBox(),card=await d.locator('xpath=ancestor::button[1]').boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(card.x+card.width-8);}
  for(const t of await page.locator('.vz-up-card,.vz-sec-link,.vz-pick-random,.vz-recent-pill').all()){const b=await t.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);}
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const end=await page.locator('.vz-recent').boundingBox(),fab=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(end.y+end.height+12).toBeLessThanOrEqual(fab.y);
  await page.evaluate(()=>scrollTo(0,0));
 }
 // No songs for today: 다가오는 일 is the last block and still clears the button; one card alone spans the row.
 await page.evaluate(()=>VZ.change(d=>{d.songs=[];d.performances=[];}));
 await expect(page.locator('.vz-recent')).toBeHidden();await expect(cards).toHaveCount(1);
 for(const width of widths){
  await page.setViewportSize({width,height:844});await noOverflow(page);
  const section=await page.locator('[data-home-upcoming]').boundingBox(),one=await cards.first().boundingBox();expect(Math.abs(one.width-section.width)).toBeLessThanOrEqual(1);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const end=await page.locator('[data-home-upcoming]').boundingBox(),fab=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(end.y+end.height+12).toBeLessThanOrEqual(fab.y);
 }
 // Neither: the whole section leaves.
 await page.evaluate(()=>VZ.change(d=>{d.lessons=[];}));
 await expect(page.locator('[data-home-upcoming]')).toBeHidden();await expect(cards).toHaveCount(0);await noOverflow(page);
 const after=await db(page);for(const key of ['dailyGoals','practicePlans','practices','assignments'])expect(after[key]).toEqual(before[key]);
});
test('지난주 요약 stays on home as a slim row under the date cards (alone when there is no date card); 랜덤 is a light pill',async({page})=>{
 await phoneWidth(page);
 await prepare(page);
 // The row app/weekly-summary.js gives on Mon–Wed (its own spec covers when): stubbed here as a fixed row.
 await page.addInitScript(()=>{let v;Object.defineProperty(window,'VZ',{configurable:true,get(){return v;},set(x){v=x;if(x)Object.defineProperty(x,'weeklySummaryHomeRow',{configurable:true,get(){return ()=>({key:'weekly',label:'지난주 요약',value:'연습 1시간 · 3일',aria:'지난주 요약 보기, 연습 1시간, 3일',action:()=>x.nav('#/vocal-growth?period=week&week=2026-10-26')});},set(){}});}});});
 await page.goto('/#/home');await ready(page);const before=await db(page);
 const row=page.locator('[data-home-weekly] [data-row=weekly]');
 await expect(row).toBeVisible();await expect(row).toHaveAccessibleName('지난주 요약 보기, 연습 1시간, 3일');await expect(row).toContainText('지난주 요약연습 1시간 · 3일');
 const cards=await page.locator('[data-home-upcoming]').boundingBox(),line=await row.boundingBox();
 expect(Math.round(line.y-(cards.y+cards.height))).toBe(10);expect(Math.abs(line.x-cards.x)).toBeLessThanOrEqual(.5);expect(Math.abs(line.width-cards.width)).toBeLessThanOrEqual(1);expect(line.height).toBeGreaterThanOrEqual(44);
 // 랜덤: a light purple pill with the dice, its button a 44px target.
 const random=page.getByRole('button',{name:'아무 곡이나 랜덤으로 고르기',exact:true});
 await expect(random.locator('span')).toHaveCSS('background-color','rgb(239, 232, 252)');await expect(random.locator('span')).toHaveCSS('color','rgb(91, 31, 194)');await expect(random.locator('svg')).toHaveCount(1);
 expect((await random.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await expect(page.locator('.vz-recent-pill .vz-round-icon svg')).toHaveCount(1);
 for(const width of widths){await page.setViewportSize({width,height:844});await noOverflow(page);}
 await page.setViewportSize({width:390,height:844});
 // No lesson or stage: 지난주 요약 stands alone, a section gap below 오늘의 연습.
 await page.evaluate(()=>VZ.change(d=>{d.lessons=[];d.performances=[];}));
 await expect(page.locator('[data-home-upcoming]')).toBeHidden();await expect(row).toBeVisible();
 const pc=await page.locator('[data-home-today]').boundingBox(),alone=await row.boundingBox();expect(Math.round(alone.y-(pc.y+pc.height))).toBe(22);
 await row.click();await expect(page).toHaveURL(/#\/vocal-growth\?period=week&week=2026-10-26$/);
 const after=await db(page);for(const key of ['songs','assignments','dailyGoals','practicePlans','practices'])expect(after[key]).toEqual(before[key]);
});
test('HTML load failure shows a retry and does not change stored records',async({page})=>{
 await prepare(page);const pattern='**/design-system/Vocalzip_Floating_Record_Home.html?*';await page.route(pattern,r=>r.abort());await page.goto('/#/home');
 await expect(page.getByRole('alert')).toContainText('기록은 그대로');await expect(page.locator('.vz-student-home')).toHaveCount(0);const before=await db(page);
 await page.unroute(pattern);await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await ready(page);const after=await db(page);
 for(const key of ['songs','lessons','assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('source HTML and hydrated home comparison use the same supplied layout',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chromium-desktop','One side-by-side source capture is sufficient.');
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.setViewportSize({width:850,height:1100});await page.goto('/design-system/handoff-comparison.html');await expect(page.locator('iframe')).toHaveCount(2);
 const faces=[['Regular','400'],['SemiBold','600'],['Bold','700']].map(([n,w])=>'@font-face{font-family:Pretendard;src:url("/design-system/fonts/pretendard/Pretendard-'+n+'.woff2?v=1.3.9");font-weight:'+w+';font-style:normal;}').join('');
 await page.addStyleTag({content:faces});
 for(const frame of page.frames().filter(f=>f.parentFrame())){await frame.waitForSelector(frame.url().includes('student-home-preview')?'.vz-student-home':'.vz-phone');await frame.addStyleTag({content:faces});await frame.evaluate(()=>document.fonts.ready);}
 await page.screenshot({path:testInfo.outputPath('student-home-html-source-comparison.png'),fullPage:true,animations:'disabled'});
});




test('오늘의 연습 shows five 필수 미션 boxes first and opens the rest in place, in order, without changing records',async({page})=>{
 const value=seed();value.dailyGoals=Array.from({length:7},(_,i)=>({id:'goal-'+i,date:TODAY,title:'목표 '+(i+1),source:'personal',completed:i===6,order:i}));
 await boot(page,value);
 const more=page.locator('[data-home-today] [data-more]');
 await expect(goals(page)).toHaveCount(5);
 expect(await goals(page).evaluateAll(list=>list.map(b=>b.getAttribute('aria-label')))).toEqual([1,2,3,4,5].map(i=>'필수 미션 목표 '+i+', 아직'));
 await expect(todayCount(page)).toHaveText('필수 미션 1/7');
 await expect(more).toHaveText('+2');await expect(more).toHaveAttribute('aria-expanded','false');expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await more.click();await expect(more).toHaveText('접기');await expect(more).toHaveAttribute('aria-expanded','true');
 await expect(goals(page)).toHaveCount(7);
 await done(goals(page).nth(6));
 await mission(page,'목표 6').click();await expect(todayCount(page)).toHaveText('필수 미션 2/7');
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(goals(page)).toHaveCount(7); // still open after the check
 await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='goal-5').completed).toBe(true);
 await more.click();await expect(goals(page)).toHaveCount(5);await expect(more).toHaveText('+2');await expect(more).toHaveAttribute('aria-expanded','false');
 expect((await db(page)).dailyGoals.map(g=>g.id)).toEqual(value.dailyGoals.map(g=>g.id));
 await page.evaluate(()=>VZ.change(d=>{d.dailyGoals=d.dailyGoals.slice(0,5);}));
 await expect(goals(page)).toHaveCount(5);await expect(more).toHaveCount(0);
});

test('My Songs and Library share the current home outer spacing and fixed navigation',async({page})=>{
 await boot(page);
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:940});await page.evaluate(()=>VZ.nav('#/home'));await ready(page);
  const header=await page.locator('.vz-header').boundingBox(),nav=await page.locator('.vz-nav-space').boundingBox(),fab=await page.locator('.vz-floating-record').boundingBox();
  for(const route of ['songs','library']){
   await page.evaluate(route=>VZ.nav('#/'+route),route);await expect(page.locator('#view')).toHaveAttribute('data-collection',route);
   const otherHeader=await page.locator('#top').boundingBox(),otherNav=await page.locator('.v-nav').boundingBox(),otherFab=await page.locator('.vz-collection-record').boundingBox();
   // The home header starts and spans where the other pages' header does; it is taller (today's ring, 2026-11-27).
   for(const key of ['x','y','width'])expect(Math.abs(otherHeader[key]-header[key])).toBeLessThanOrEqual(1);
   expect(header.height).toBeGreaterThanOrEqual(otherHeader.height);
   for(const key of ['x','y','width','height'])expect(Math.abs(otherNav[key]-nav[key])).toBeLessThanOrEqual(1);
   expect(Math.abs(otherFab.x+otherFab.width-fab.x-fab.width)).toBeLessThanOrEqual(1);expect(Math.abs(otherFab.y-fab.y)).toBeLessThanOrEqual(1);
   await noOverflow(page);
  }
 }
});

test('shared colors, type hierarchy, cards and four-item dock (v4 IA) apply to regular screens',async({page})=>{
 await boot(page);
 for(const route of ['songs','library','calendar']){
  await page.evaluate(route=>VZ.nav('#/'+route),route);
  await expect(page.locator('#view')).toHaveAttribute('data-collection',route);
  const shell=await page.evaluate(()=>{
   const css=el=>getComputedStyle(el),nav=document.querySelector('.v-nav');
   return {accent:css(document.documentElement).getPropertyValue('--accent').trim(),
    background:css(document.body).backgroundColor,
    heading:css(document.querySelector('#top h1')).fontFamily,
    navItems:nav.querySelectorAll('a').length,
    navHeight:nav.getBoundingClientRect().height,
    fab:css(document.querySelector('.vz-collection-record')).display,
    // 내 곡 (new design, 2026-11-27) has its own 22px cards (the 전체 녹음 · 나의 공연 card is always there).
    cardRadius:css(document.querySelector('.vz-st-more,.card,.list,.empty,.vz-review-link')).borderRadius};
  });
  expect(shell.accent).toBe('#7A32F5');
  expect(shell.background).toBe('rgb(248, 246, 253)');
  expect(shell.heading).toContain('Pretendard');
  expect(shell.navItems).toBe(4);
  expect(shell.navHeight).toBe(70);
  expect(shell.fab).toBe('grid');
  expect(shell.cardRadius).toBe(route==='calendar'||route==='songs'?'22px':'20px'); // 기록 (rec1) · 내 곡 (songs1): the new 22px cards
  await noOverflow(page);
 }
});

test('the top: the week\'s days show practised days and today, say the streak plainly and keep their height',async({page})=>{
 await boot(page);
 const strip=weekStrip(page),text=strip.locator('.vz-week-strip-text'),dots=strip.locator('.vz-week-dots>span');
 await expect(page.locator('.vz-logo')).toHaveCount(0);// The old wordmark is gone; the new logo (연보라 동그라미 + Vocalzip) leads the header's first line.
 await expect(page.locator('.vz-header .vz-brand')).toHaveAccessibleName('Vocalzip');await expect(page.locator('.vz-header .vz-brand-word')).toHaveText('Vocalzip');
 await expect(page.locator('.vz-header .vz-top-date')).toHaveText('11월 4일 수요일');
 await expect(text).toHaveText('이번 주 연속 1일');await expect(text.locator('b')).toHaveText('연속 1일');await expect(text.locator('b')).toHaveCSS('color','rgb(91, 31, 194)');
 // Monday first, as the week model counts: 수 is today and practised (filled, ringed); the other days are pale.
 await expect(dots.locator('small')).toHaveText(['월','화','수','목','금','토','일']);
 await expect(dots.nth(2)).toHaveAttribute('data-today','true');await expect(dots.nth(2)).toHaveAttribute('data-practiced','true');
 const look=i=>dots.nth(i).evaluate(e=>{const dot=getComputedStyle(e.querySelector('i')),label=getComputedStyle(e.querySelector('small'));return {image:dot.backgroundImage!=='none',color:dot.backgroundColor,ring:dot.boxShadow,label:label.color,w:e.querySelector('i').getBoundingClientRect().width};});
 expect(await look(2)).toEqual({image:true,color:expect.any(String),ring:expect.stringContaining('rgb(201, 174, 251)'),label:'rgb(91, 31, 194)',w:9});
 expect(await look(1)).toEqual({image:false,color:'rgb(230, 221, 246)',ring:'none',label:'rgb(125, 133, 151)',w:9});
 const height=(await strip.boundingBox()).height;
 await page.evaluate(()=>VZ.change(d=>{d.practices.push({id:'yesterday',date:'2026-11-03',manualMinutes:20,songId:'s1'});}));
 await expect(text).toHaveText('이번 주 연속 2일');await expect(dots.nth(1)).toHaveAttribute('data-practiced','true');await expect(dots.nth(1)).toHaveAttribute('data-today','false');
 expect((await look(1)).image).toBe(true);expect((await look(1)).label).toBe('rgb(91, 31, 194)');
 expect(Math.abs((await strip.boundingBox()).height-height)).toBeLessThanOrEqual(1);
 // A streak that began last week is not called "이번 주".
 await page.evaluate(()=>VZ.change(d=>{d.practices.push({id:'sunday',date:'2026-11-01',manualMinutes:20,songId:'s1'},{id:'monday',date:'2026-11-02',manualMinutes:20,songId:'s1'});}));
 await expect(text).toHaveText('연속 4일');
 // Without a streak (another week drawn by the app): how many days of the week, said plainly — same height.
 const host=page.locator('.vz-student-home'),base=await page.evaluate(()=>VzipStudentHomeModel.build(VZ.db,{today:VZ.today()}).week);
 await host.evaluate((el,week)=>el.updateThisWeek(week),{...base,streak:0,days:base.days.map(d=>({...d,minutes:0}))});
 await expect(text).toHaveText('이번 주 0일 연습');await expect(strip.locator('[data-practiced=true]')).toHaveCount(0);
 expect(Math.abs((await strip.boundingBox()).height-height)).toBeLessThanOrEqual(1);
 await strip.click();await expect(page.getByRole('dialog',{name:'이번 주 연습',exact:true})).toBeVisible();
});
test('the top: 단계 chips — 큰 단계 first, then the eight 기본기 in their states, each to its page; one scrolling row, no page overflow',async({page})=>{
 const value=seed();
 // 음정 measured twice (기준 맞추는 중) and 리듬 with two kept steps, as 단계 reads them (app/levels-model.js). Fake rows only.
 value.practicePlans.push({id:'level-state',kind:'level-state',level:1,reached:{},first:{pitch:'2026-11-03',rhythm:'2026-10-01'}},
  {id:'skill-step:rhythm:1',kind:'skill-step',area:'rhythm',step:1,earned:'2026-10-10',days:[]},{id:'skill-step:rhythm:2',kind:'skill-step',area:'rhythm',step:2,earned:'2026-10-20',days:[]});
 await boot(page,value);
 const areas=await page.evaluate(()=>VZ.levels.areas());
 expect(areas.map(a=>a.id)).toEqual(['breath','pitch','sustain','path','range','high','vibrato','rhythm']);
 const row=page.locator('.vz-level-row'),chips=row.locator('.vz-chip'),said=a=>a.state==='step'?(a.step?a.step+'단계':'아직 1단계 전'):a.state==='calibrating'?'기준 맞추는 중':a.state==='soon'?'준비 중':'아직';
 await expect(chips).toHaveCount(9);
 await expect(chips.first()).toHaveAttribute('data-home-level','');await expect(chips.first()).toHaveText('Lv 1 · 첫 소리');
 await expect(chips.first().locator('.vz-chip-face')).toHaveCSS('color','rgb(255, 255, 255)');
 for(const [i,a] of areas.entries()){
  const chip=chips.nth(i+1),state=a.state==='step'&&a.step?'earned':a.state==='calibrating'?'calibrating':'none';
  await expect(chip).toHaveAttribute('data-home-area',a.id);await expect(chip).toHaveAttribute('data-state',state);
  await expect(chip).toHaveText(a.title);await expect(chip).toHaveAccessibleName(a.title+', '+said(a)+', 자세히 보기');
  await expect(chip.locator('.vz-chip-seg i')).toHaveCount(5);await expect(chip.locator('.vz-chip-seg i.is-on')).toHaveCount(state==='earned'?a.step:0);
 }
 // The fixture rows give each look at least once.
 const looks=async state=>row.locator('.vz-chip[data-state='+state+'] .vz-chip-face').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));
 expect(areas.find(a=>a.id==='pitch').state).toBe('calibrating');expect(areas.find(a=>a.id==='rhythm')).toMatchObject({state:'step',step:2});
 expect(await looks('none')).toEqual({bg:'rgb(255, 255, 255)',color:'rgb(102, 112, 133)'});
 expect(await looks('calibrating')).toEqual({bg:'rgb(246, 241, 254)',color:'rgb(91, 31, 194)'});
 expect(await looks('earned')).toEqual({bg:'rgb(239, 232, 252)',color:'rgb(91, 31, 194)'});
 expect(await row.locator('[data-home-area=rhythm] .vz-chip-seg i').evaluateAll(l=>l.map(e=>getComputedStyle(e).backgroundColor))).toEqual(['rgb(122, 50, 245)','rgb(122, 50, 245)','rgb(230, 221, 246)','rgb(230, 221, 246)','rgb(230, 221, 246)']);
 for(const width of widths){
  await page.setViewportSize({width,height:844});await noOverflow(page);
  const r=await row.evaluate(e=>({scroll:e.scrollWidth>e.clientWidth,overflow:getComputedStyle(e).overflowX,bar:getComputedStyle(e).scrollbarWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,first:e.querySelector('.vz-chip').getBoundingClientRect().left}));
  expect(r).toEqual({scroll:true,overflow:'auto',bar:'none',left:0,right:width,first:20});
  for(const chip of await chips.all()){const b=await chip.boundingBox();expect(b.height).toBeGreaterThanOrEqual(43.9);expect(b.width).toBeGreaterThanOrEqual(44);}
 }
 await page.setViewportSize({width:390,height:844});
 await chips.nth(2).click();await expect(page).toHaveURL(/#\/levels\/pitch$/);await expect(page.locator('[data-lv-area=pitch]')).toBeVisible();
 await page.goto('/#/home');await ready(page);await chips.first().click();await expect(page).toHaveURL(/#\/levels$/);
});
test('the top: the ring twinkles softly and stops under reduced motion',async({page})=>{
 await boot(page);
 const stars=page.locator('.vz-ring .vz-tw');
 await expect(stars).toHaveCount(5);
 const motion=()=>stars.evaluateAll(l=>l.map(e=>{const c=getComputedStyle(e);return {name:c.animationName,duration:parseFloat(c.animationDuration)};}));
 for(const m of await motion()){expect(m.name).toBe('vzTw');expect(m.duration).toBeGreaterThanOrEqual(2);expect(m.duration).toBeLessThanOrEqual(2.7);}
 expect(new Set((await stars.evaluateAll(l=>l.map(e=>getComputedStyle(e).animationDelay)))).size).toBe(5); // staggered
 const fills=await stars.evaluateAll(l=>l.map(e=>e.querySelector('path').getAttribute('fill')));for(const f of fills)expect(['#B892FF','#C9AEFB']).toContain(f);
 // The ring's colors: the pale track and the gradient stroke.
 expect(await page.locator('.vz-ring circle').first().getAttribute('stroke')).toBe('#E9E0FB');
 expect(await page.locator('.vz-ring-bar').getAttribute('stroke')).toMatch(/^url\(#vz-ring-grad-\w+\) #7A32F5$/);
 expect(await page.locator('.vz-ring stop').evaluateAll(l=>l.map(e=>e.getAttribute('stop-color')))).toEqual(['#B07CFF','#7A32F5','#4E17B0']);
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const m of await motion())expect(m.name).toBe('none');
 expect(await stars.first().evaluate(e=>Number(getComputedStyle(e).opacity))).toBeLessThanOrEqual(.55);
});
test('Goal integrity rejects stale editor while retaining draft and latest check',async({page})=>{
 await boot(page);
 await addMission(page).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await sheet.getByLabel('개인 목표',{exact:true}).fill('보존할 작성 중 목표');
 await page.evaluate(()=>VZ.change(d=>{
  d.dailyGoals.find(g=>g.id==='g1').completed=true;
  d.dailyGoals.push({id:'concurrent',date:'2026-11-04',title:'새로 받은 목표',source:'personal',completed:false});
 },{silent:true}));
 const before=await db(page);
 await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 await expect(sheet.locator('[data-plan-error]')).toContainText('변경됐어요');
 await expect(sheet.getByLabel('개인 목표',{exact:true})).toHaveValue('보존할 작성 중 목표');
 await expect(sheet.getByRole('button',{name:'목표 저장',exact:true})).toBeEnabled();
 expect(await db(page)).toEqual(before);
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 await page.reload();await ready(page);
 expect((await db(page)).dailyGoals.find(g=>g.id==='g1').completed).toBe(true);
 expect((await db(page)).dailyGoals.some(g=>g.id==='concurrent')).toBe(true);
});
test('Homework integrity counts unique sessions in tally and detail without changing records',async({page})=>{
 const value=seed();
 value.practices=[
  {id:'p1',date:TODAY,minutes:10,completed:['a1'],assignmentReps:{a1:2},updatedAt:1},
  {id:'p1',date:TODAY,minutes:10,completed:['a1'],assignmentReps:{a1:3},updatedAt:2},
  {id:'p2',date:TODAY,minutes:15,completed:['a1','a1'],assignmentReps:{a1:2}}
 ];
 await boot(page,value);
 // Simulate received duplicate versions after boot normalization as well.
 await page.evaluate(rows=>{VZ.db.practices=rows;},value.practices);
 const before=await db(page);
 expect(await page.evaluate(()=>VZ.taskTally(VZ.db.assignments[0]))).toEqual({sessions:2,reps:5,last:TODAY});
 await page.evaluate(()=>VZ.taskSheet({task:VZ.db.assignments[0]}));
 const sheet=page.getByRole('dialog',{name:'숙제',exact:true});
 await expect(sheet.locator('[data-practice]')).toHaveCount(2);
 await expect(sheet).toContainText('연습 2번 · 5회');
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 expect(await db(page)).toEqual(before);
 expect((await db(page)).assignments[0].status).toBe('active');
});

async function cloudLessonDeleteForm(page){
 await page.goto('/#/lesson/l1');
 await page.getByRole('button',{name:'레슨 삭제',exact:true}).click();
 await page.getByRole('dialog',{name:'레슨 삭제 대상',exact:true}).getByRole('button',{name:'삭제 대상 확인',exact:true}).click();
 return page.getByRole('dialog',{name:'선택 항목 영구 삭제',exact:true});
}
test('Cloud lesson deletion connects the real UI, owner, capability and CAS request',async({page})=>{
 await boot(page);const before=await db(page);
 const confirm=await cloudLessonDeleteForm(page);
 await confirm.getByRole('button',{name:'영구 삭제',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>VZ.db.lessons.some(l=>l.id==='l1'))).toBe(false);
 const after=await db(page);
 expect(after.practices).toEqual(before.practices);expect(after.songs).toEqual(before.songs);
 expect(after.assignments[0].title).toBe(before.assignments[0].title);
 expect(after.assignments[0].status).toBe('active');
 const calls=await page.evaluate(()=>window.__lessonDeleteCalls);
 expect(calls).toHaveLength(1);expect(calls[0].p_lesson_id).toBe('l1');expect(calls[0].p_operation_id).toBeTruthy();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('home-server-row')).payload.lessons.some(l=>l.id==='l1'))).toBe(false);
});
test('Cloud lesson deletion stops before irreversible work when server protection is unavailable',async({page})=>{
 await boot(page);const before=await db(page);
 await page.evaluate(()=>window.__denyDeletionCapabilities=true);
 const confirm=await cloudLessonDeleteForm(page);
 await confirm.getByRole('button',{name:'영구 삭제',exact:true}).click();
 await expect(page.locator('[data-delete-error]')).toContainText('서버 삭제 보호 설정');
 expect(await db(page)).toEqual(before);
 expect(await page.evaluate(()=>window.__lessonDeleteCalls||[])).toEqual([]);
});
test('Cloud lesson deletion refuses a server lesson that changed before prepare',async({page})=>{
 await boot(page);const before=await db(page);
 const confirm=await cloudLessonDeleteForm(page);
 await page.evaluate(()=>{const row=JSON.parse(sessionStorage.getItem('home-server-row'));row.payload.lessons[0].feedback='changed on another device';sessionStorage.setItem('home-server-row',JSON.stringify(row));});
 await confirm.getByRole('button',{name:'영구 삭제',exact:true}).click();
 await expect(page.locator('[data-delete-error]')).toContainText('최신 레슨을 먼저 동기화');
 expect(await db(page)).toEqual(before);
 expect(await page.evaluate(()=>window.__lessonDeleteCalls||[])).toEqual([]);
});


// 주간 돌아보기 · 내 로드맵 · 매일 보이스 체크 were small rows of the former 오늘 연습 card; they left home in step 2 (주간
// 돌아보기 and 내 로드맵 are in 성장; 매일 보이스 체크 is the first step of 오늘의 연습 when not done today).
test('home has no 주간 돌아보기 · 내 로드맵 · 매일 보이스 체크 rows and no AI 오늘 추천 button any more',async({page})=>{
 await boot(page);
 for(const name of ['주간 돌아보기 · 다음 목표 추천','내 로드맵 보기','AI로 오늘 할 일 추천받기'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await expect(page.locator('[data-home-today] [data-row=weekly-review],[data-home-today] [data-row=roadmap],[data-home-today] [data-row=voice-check]')).toHaveCount(0);
});
test('every page shows the very same bottom dock as Home at phone widths',async({page})=>{
 await boot(page);
 for(const width of [320,393,430]){
  await page.setViewportSize({width,height:852});await page.evaluate(()=>VZ.nav('#/home'));await ready(page);
  const home=await page.evaluate(()=>{const n=document.querySelector('.vz-student-home').shadowRoot.querySelector('.vz-nav'),r=n.getBoundingClientRect(),i=n.querySelector('.vz-nav-item').getBoundingClientRect();return [r.x,r.y,r.width,r.height,i.x,i.width,i.height].map(Math.round);});
  for(const route of ['songs','library','calendar','vocal-growth']){
   await page.evaluate(r=>VZ.nav('#/'+r),route);await expect(page.locator('.v-nav')).toBeVisible();
   const other=await page.evaluate(()=>{const u=document.querySelector('.v-nav>ul'),r=u.getBoundingClientRect(),i=u.querySelector('a').getBoundingClientRect();return [r.x,r.y,r.width,r.height,i.x,i.width,i.height].map(Math.round);});
   for(let k=0;k<home.length;k++)expect(Math.abs(other[k]-home[k]),route+' at '+width+'px, value '+k).toBeLessThanOrEqual(1);
  }
 }
});
test('tablets (768px+) put 오늘의 연습 beside 다가오는 일 and 오늘 부를 곡, in landscape and portrait; narrower screens keep one column',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 const box=()=>page.evaluate(()=>{const r=document.querySelector('.vz-student-home').shadowRoot;const b=s=>{const q=r.querySelector(s).getBoundingClientRect();return {x:q.x,y:q.y,w:q.width,bottom:q.bottom};};return {phone:b('.vz-phone'),goals:b('[data-home-today]'),summary:b('[data-home-upcoming]'),recent:b('.vz-recent'),inMain:!!r.querySelector('.vz-col-main > [data-home-today]')};});
 await page.setViewportSize({width:1180,height:820});await boot(page);
 let b=await box();
 expect(b.phone.w).toBeGreaterThan(900);expect(b.inMain).toBe(true);
 expect(b.summary.x).toBeGreaterThan(b.goals.x+b.goals.w);expect(Math.abs(b.summary.y-b.goals.y)).toBeLessThan(1);
 expect(b.recent.y).toBeGreaterThan(b.summary.y);
 await noOverflow(page);
 await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(200); // iPad portrait: still two columns
 b=await box();
 expect(b.summary.x).toBeGreaterThan(b.goals.x+b.goals.w);expect(Math.abs(b.summary.y-b.goals.y)).toBeLessThan(1);await noOverflow(page);
 await page.setViewportSize({width:744,height:1133});await page.waitForTimeout(200); // iPad mini portrait: one column
 b=await box();
 expect(b.phone.w).toBeLessThanOrEqual(560);
 expect(b.summary.y).toBeGreaterThan(b.goals.bottom-1);expect(Math.abs(b.summary.x-b.goals.x)).toBeLessThanOrEqual(4); // one column, as on phones (the card sits 4px further in, as designed)
});
test('tablets show the full 주간 연습 card under 다가오는 일 (rings, arrows, title to the calendar); phones do not; the top spans the width',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 const value=seed();value.practices.push({id:'last-week',date:'2026-10-28',minutes:20});
 await page.setViewportSize({width:820,height:1180});await boot(page,value);const before=await db(page);
 const card=page.locator('.vz-col-side .vz-week'),row=weekStrip(page);
 await expect(card).toBeVisible();await expect(row).toBeVisible();await expect(page.locator('.vz-student-home [data-row=week]')).toHaveCount(0);
 // The top (ring, the week's days, the 단계 chips) spans the page above both columns.
 const span=await page.locator('.vz-student-home').evaluate(h=>{const r=h.shadowRoot,b=s=>r.querySelector(s).getBoundingClientRect();return {strip:b('.vz-week-strip'),main:b('.vz-col-main'),side:b('.vz-col-side')};});
 expect(span.strip.left).toBeLessThanOrEqual(span.main.left+9);expect(span.strip.right).toBeGreaterThanOrEqual(span.side.right-9);expect(span.strip.bottom).toBeLessThanOrEqual(span.main.top);
 await expect(card.locator('.vz-days>div')).toHaveCount(7);await expect(card.locator('.vz-time b')).toHaveText('30');
 await expect(card.locator('.vz-days>div[data-today=true]')).toHaveAttribute('data-date',TODAY);
 const order=await page.evaluate(()=>[...document.querySelector('.vz-student-home').shadowRoot.querySelector('.vz-col-side').children].map(e=>e.className.split(' ').find(c=>/^vz-(upcoming|weekly-line|week|recent)$/.test(c))));
 expect(order).toEqual(['vz-upcoming','vz-weekly-line','vz-week','vz-recent']);
 // In the side column: 다가오는 일 at the top beside 오늘의 연습, its two cards side by side, 16px between the blocks.
 const side=await page.locator('.vz-student-home').evaluate(h=>{const r=h.shadowRoot,b=s=>r.querySelector(s).getBoundingClientRect();return {up:b('[data-home-upcoming]'),pc:b('[data-home-today]'),weekly:b('[data-home-weekly]'),week:b('.vz-col-side .vz-week'),cards:[...r.querySelectorAll('.vz-up-card')].map(e=>e.getBoundingClientRect().y)};});
 // (Wednesday with practice last week: the 지난주 요약 row is there, between 다가오는 일 and the 주간 연습 card.)
 expect(Math.abs(side.up.y-side.pc.y)).toBeLessThan(1);expect(Math.abs(side.cards[0]-side.cards[1])).toBeLessThan(1);
 expect(side.weekly.height).toBeGreaterThanOrEqual(44);expect(Math.round(side.weekly.y-side.up.bottom)).toBe(10);expect(Math.round(side.week.y-side.weekly.bottom)).toBe(16);
 await card.getByRole('button',{name:'이전 주',exact:true}).click();
 await expect(card).toHaveAttribute('data-week-start','2026-10-26');await expect(card.locator('.vz-time b')).toHaveText('20');
 await expect(row.locator('.vz-week-strip-text')).toHaveText('이번 주 연속 1일');await expect(row.locator('[data-today=true]')).toHaveAttribute('data-date',TODAY); // the days stay this week's
 await page.getByRole('button',{name:'오늘 일정 보기',exact:true}).click();await expect(page).toHaveURL(/#\/calendar/);
 expect(await db(page)).toEqual(before);
 await page.setViewportSize({width:390,height:844});await page.goto('/#/home');await ready(page);
 await expect(card).toBeHidden();await expect(row).toBeVisible();await noOverflow(page);
});
