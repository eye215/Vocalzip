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
const goals = page => page.locator('.vz-goal-list input[type=checkbox]');
// v4 home: one "지금 할 것" card (.vz-event), Home summary rows (.vz-summary-row) and recent-song pills.
const weekRow = page => page.locator('.vz-summary-row[data-row=week]');
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
/** The phone layout (below 768px): home shows the one-line 이번 주 summary row instead of the 주간 연습 card. */
const phoneWidth=async page=>{const v=page.viewportSize();if(v&&v.width>=768)await page.setViewportSize({width:390,height:844});};
test.afterEach(async({page})=>expect(page.__homeErrors||[]).toEqual([]));
test('literal floating HTML and app screenshots at 320/390/430',async({page},testInfo)=>{
 await boot(page);
 for(const width of widths){
  await page.setViewportSize({width,height:940});await noOverflow(page);
  for(const selector of ['.vz-summary','.vz-goals']){const card=await page.locator(selector).boundingBox();expect(card.x).toBeGreaterThanOrEqual(12);expect(card.x).toBeLessThanOrEqual(20);expect(Math.abs(card.width-(width-2*card.x))).toBeLessThanOrEqual(1);}
  await expect(page.locator('.vz-summary')).toHaveCSS('padding-left','16px');await expect(page.locator('.vz-goals')).toHaveCSS('padding-top','16px');
  const dock=await page.locator('.vz-nav-space').boundingBox();expect(Math.abs(dock.x-16)).toBeLessThanOrEqual(1);expect(Math.abs(dock.width-(width-32))).toBeLessThanOrEqual(1);
  const before=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(Math.abs(width-before.x-before.width-16)).toBeLessThanOrEqual(1);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const after=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(Math.abs(before.y-after.y)).toBeLessThanOrEqual(1);
  // Recent-song pills are the last home block; they must clear the floating record button.
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
  return {styles:JSON.stringify(actual)===JSON.stringify(expected),count:actual.length,fab:shadow.querySelector('.vz-floating-record i')?.dataset.glyph==='\ue326',nav:[...shadow.querySelectorAll('.vz-nav-item')].map(e=>e.querySelector('i')?.dataset.glyph).join(',')==='\ue2c2,\ue340,\ue10a,\ue150',scripts:shadow.querySelectorAll('script,#vz-record-dialog,#vz-toast').length};
 });
 expect(result).toEqual({styles:true,count:10,fab:true,nav:true,scripts:0});
 await expect(page.locator('.vz-nav-item')).toHaveCount(4);
 await page.evaluate(()=>document.fonts.ready);
 const fonts=await page.evaluate(()=>[...document.fonts].filter(f=>f.family.replace(/[\"']/g,'')==='Pretendard').map(f=>({weight:f.weight,status:f.status})));
 expect(fonts.sort((a,b)=>Number(a.weight)-Number(b.weight))).toEqual([{weight:'400',status:'loaded'},{weight:'600',status:'loaded'},{weight:'700',status:'loaded'}]);
});
test('reading home preserves source records; checked goal persists after refresh',async({page})=>{
 await boot(page);const before=await db(page);
 await page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true}).check();
 await expect(page.locator('.vz-count')).toHaveText('2 / 3 완료');
 await page.reload();await ready(page);
 await expect(page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true})).toBeChecked();
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','performances','practicePlans'])expect(after[key]).toEqual(before[key]);
 expect(after.dailyGoals.find(g=>g.id==='g1').completed).toBe(true);
});
test('persistence failure restores the checkbox and retry succeeds',async({page})=>{
 await boot(page);const before=await db(page);
 await page.evaluate(()=>{window.__homeSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='vocal-zip_mvp_v1')throw new Error('fixture quota failure');return window.__homeSetItem.call(this,key,value);};});
 const box=page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true});await box.click();await expect(box).not.toBeChecked();await expect(page.locator('.vz-save-error')).toContainText('다시 체크');
 expect((await db(page)).dailyGoals).toEqual(before.dailyGoals);
 await page.evaluate(()=>{Storage.prototype.setItem=window.__homeSetItem;});await box.check();await expect(box).toBeChecked();
});
test('900 goals preserve order and inner scroll after checking a visible row',async({page})=>{
 const value=seed();value.dailyGoals=Array.from({length:900},(_,i)=>({id:'many-'+i,date:TODAY,title:'연습 목표 '+String(i).padStart(3,'0'),source:'personal',completed:false,order:i}));
 await boot(page,value);const list=page.locator('.vz-goal-list');await expect(goals(page)).toHaveCount(900);
 // Home shows four goals first; the rest open in place and keep the inner scroll.
 await expect(page.locator('.vz-goal-more')).toHaveText('목표 896개 더 보기');await page.locator('.vz-goal-more').click();await expect(goals(page).nth(899)).toBeAttached();await expect(page.locator('.vz-goal-list>label').nth(899)).not.toHaveAttribute('hidden','');
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await list.evaluate(e=>{e.scrollTop=450;});const before=await list.evaluate(e=>e.scrollTop);
 const index=await list.evaluate(e=>{const r=e.getBoundingClientRect();return [...e.children].findIndex(n=>{const b=n.getBoundingClientRect();return b.top>=r.top+4&&b.bottom<=r.bottom-4;});});
 await goals(page).nth(index).click();await expect(goals(page).nth(index)).toBeChecked();expect(Math.abs(await list.evaluate(e=>e.scrollTop)-before)).toBeLessThanOrEqual(1);
 expect((await db(page)).dailyGoals.map(g=>g.id)).toEqual(value.dailyGoals.map(g=>g.id));await expect(page.locator('.vz-count')).toHaveText('1 / 900 완료');
 // Keep this stress test focused on persistence and scroll; visual captures are covered by layout tests.
});
test('empty state removes all sample data and connects songs and goal setup',async({page})=>{
 const value={categories:[],songs:[],lessons:[],assignments:[],practices:[],performances:[],comparisonReports:[]};await boot(page,value);
 await noSample(page);
 await expect(goals(page)).toHaveCount(0);await expect(page.locator('.vz-count')).toHaveText('0 / 0 완료');
 // Nothing scheduled or practised: 지금 할 것 suggests one practice (the empty goal list below offers goal setup, so
 // "오늘의 목표 정하기" is not shown twice); the summary only has this week, no recent songs.
 await expect(page.locator('.vz-event')).toHaveAttribute('data-kind','recommend');await expect(page.locator('.vz-event h2')).toHaveText('호흡과 발성 연습하기');
 await expect(page.locator('.vz-summary-row')).toHaveCount(1);await expect(weekRow(page).locator('.vz-summary-value')).toHaveText('0분 / 3시간 30분');
 await expect(page.locator('.vz-recent')).toBeHidden();await expect(page.locator('.vz-recent-pill')).toHaveCount(0);await expect(page.locator('.vz-today-streak')).toHaveCount(0);
 await page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'내 곡',exact:true}).click();await expect(page).toHaveURL(/#\/songs$/);
 // Only the empty goal list opens the goal sheet; the suggestion opens 노래 연습실.
 const setup=page.getByRole('button',{name:'오늘의 목표 정하기',exact:true});
 await page.goto('/#/home');await ready(page);await expect(setup).toHaveCount(1);await setup.click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await expect(sheet).toBeVisible();await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0);
 await page.getByRole('button',{name:'추천 연습 호흡과 발성 연습하기',exact:true}).click();await expect(page).toHaveURL(/#\/practice-room$/);await expect(page.locator('#top h1')).toHaveText('노래 연습실');
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','performances'])expect(after[key]).toEqual([]);
 expect(after.dailyGoals||[]).toEqual([]);expect(after.practicePlans||[]).toEqual([]);
});
test('지금 할 것 homework opens guided practice and the final step saves practice and goal automatically',async({page})=>{
 await boot(page);
 // The open homework is also today's goal, so home shows it as the 지금 할 것 card rather than repeating it as a recommendation.
 const now=page.locator('.vz-event');
 await expect(now).toHaveAttribute('data-kind','homework');await expect(now).toHaveAccessibleName('숙제 호흡을 길게 유지하기 보기');
 await expect(page.getByRole('button',{name:'호흡을 길게 유지하기 따라 하기',exact:true})).toHaveCount(0);
 await now.click();await expect(page).toHaveURL(/#\/homework$/);
 await page.getByRole('link',{name:'호흡을 길게 유지하기 따라 하기',exact:true}).click();
 await expect(page).toHaveURL(/#\/guided-practice\/homework%3Aa1$/);
 await page.evaluate(()=>{const epoch=Date.now();Date.now=()=>epoch+performance.now();});
 await page.getByRole('button',{name:'연습 시작',exact:true}).click();
 await page.waitForTimeout(3800);
 await page.getByRole('button',{name:'연습 종료',exact:true}).click();
 await page.getByRole('button',{name:'연습 끝내기',exact:true}).click();
 await expect(page.getByRole('button',{name:'연습 기록 보기',exact:true})).toBeVisible();
 const value=await db(page);
 expect(value.practices.filter(p=>p.guidedExerciseKey==='homework:a1')).toHaveLength(1);
 expect(value.practices.at(-1).guidedSeconds).toBeGreaterThanOrEqual(3);
 const category=value.categories.find(c=>c.id===value.practices.at(-1).categoryId);
 expect(category.name).toBe('호흡');
 expect(category.items).toContain('호흡을 길게 유지하기');
 expect(value.assignments.find(t=>t.id==='a1').status).toBe('done');
 expect(value.dailyGoals.find(g=>g.id==='g1').completed).toBe(true);
 await page.getByRole('button',{name:'연습 기록 보기',exact:true}).click();
 await expect(page).toHaveURL(/#\/practices$/);
});
test('home shows one recommendation that repeats neither a goal nor the 지금 할 것 card, and starts it',async({page})=>{
 const value=seed();
 value.assignments.push({id:'a2',title:'립트릴로 고음 연결하기',status:'active',startDate:'2026-11-01',dueDate:'2026-11-07'},{id:'a3',title:'모음 고르게 읽기',status:'active',startDate:'2026-11-01',dueDate:'2026-11-09'});
 await boot(page,value);const before=await db(page);
 await expect(page.locator('.vz-event h2')).toHaveText('호흡을 길게 유지하기');
 const recs=page.locator('.vz-guided-item');
 await expect(recs).toHaveCount(1);await expect(recs).toContainText('립트릴로 고음 연결하기');
 await expect(page.locator('.vz-guided-recs')).not.toContainText('추천 연습');await expect(page.locator('.vz-guided-heading')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'호흡을 길게 유지하기 따라 하기',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'모음 고르게 읽기 따라 하기',exact:true})).toHaveCount(0);
 const start=page.getByRole('button',{name:'립트릴로 고음 연결하기 따라 하기',exact:true});
 expect((await start.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await start.click();await expect(page).toHaveURL(/#\/guided-practice\/homework%3Aa2$/);
 const after=await db(page);for(const key of ['assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('active homework card directly opens guided practice',async({page})=>{
 await boot(page);
 await page.goto('/#/homework');
 await page.getByRole('link',{name:'호흡을 길게 유지하기 따라 하기',exact:true}).click();
 await expect(page).toHaveURL(/#\/guided-practice\/homework%3Aa1$/);
});
test('daily time comes from onboarding/settings; tomorrow offers goals once without time input',async({page})=>{
 await phoneWidth(page); // the one-line 이번 주 row is the phone layout; tablets show the full 주간 연습 card
 const value=seed();value.practicePlans=[];
 await boot(page,value);
 await expect(page.getByRole('dialog',{name:'오늘의 목표',exact:true})).toHaveCount(0);
 // No explicit plans: the week target is seven days of the 30-minute onboarding/settings default.
 await expect(weekRow(page)).toHaveAccessibleName('이번 주 연습 30분, 목표 3시간 30분, 달성률 14%, 기록 보기');
 await page.evaluate(()=>{VZ.today=()=> '2026-11-05';VZ.render();});await ready(page);
 const automatic=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await expect(automatic).toBeVisible();
 await expect(automatic.locator('[name=dayMinutes],[name=weekMinutes]')).toHaveCount(0);
 await automatic.getByRole('button',{name:'나중에 설정할래요'}).click();
 await page.evaluate(()=>VZ.render());await ready(page);await expect(automatic).toHaveCount(0);
 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await sheet.getByRole('button',{name:'목표 저장'}).click();
 await expect(sheet.locator('[data-plan-error]')).toContainText('목표를 직접 입력해 주세요');await expect(sheet).toBeVisible();
 await sheet.locator('.vz-plan-option').last().click();await sheet.getByRole('button',{name:'목표 저장'}).click();
 expect((await db(page)).dailyGoals.some(g=>g.date==='2026-11-05'&&g.source==='recommendation')).toBe(true);
 expect((await db(page)).practicePlans).toEqual([]);
});
test('settings changes the default daily target on home',async({page})=>{
 await phoneWidth(page); // the one-line 이번 주 row is the phone layout; tablets show the full 주간 연습 card
 const value=seed();value.practicePlans=[];
 await boot(page,value);
 await page.getByRole('button',{name:'프로필',exact:true}).click();
 await page.locator('[data-daily-target]').click();
 const sheet=page.getByRole('dialog',{name:'하루 연습 목표 시간'});await sheet.locator('input[name=minutes]').fill('45');
 await sheet.getByRole('button',{name:'저장'}).click();
 await page.goto('/#/home');await ready(page);
 // Seven days of the new 45-minute default.
 await expect(weekRow(page)).toHaveAccessibleName('이번 주 연습 30분, 목표 5시간 15분, 달성률 10%, 기록 보기');
 expect((await db(page)).settings.dailyTargetMinutes).toBe(45);
});
test('week summary row shows only this week\'s actual practice time against the target',async({page})=>{
 await phoneWidth(page); // the one-line 이번 주 row is the phone layout; tablets show the full 주간 연습 card
 await boot(page);const row=weekRow(page);
 for(const [minutes,value,badge,done]of [[0,'0분 / 3시간','0%',false],[99,'1시간 39분 / 3시간','55%',false],[180,'3시간 / 3시간','100%',true],[240,'4시간 / 3시간','133%',true]]){
  // Manual minutes win over stored minutes and recording length; tomorrow and last week never count.
  await page.evaluate(({minutes,date})=>VZ.change(d=>{d.practices=[{id:'boundary',date,manualMinutes:minutes,minutes:999,mediaSeconds:9999,songId:'s1'},{id:'tomorrow',date:'2026-11-05',manualMinutes:60,songId:'s1'},{id:'last-week',date:'2026-11-01',manualMinutes:45,songId:'s1'}];}),{minutes,date:TODAY});
  await expect(row.locator('.vz-summary-value')).toHaveText(value);await expect(row.locator('.vz-summary-badge')).toHaveText(badge);
  if(done)await expect(row).toHaveAttribute('data-tone','done');else await expect(row).not.toHaveAttribute('data-tone','done');
  await expect(row).toHaveAccessibleName('이번 주 연습 '+value.split(' / ')[0]+', 목표 3시간, 달성률 '+badge+', 기록 보기');
 }
 await page.evaluate(()=>VZ.change(d=>{d.practicePlans=[];}));
 await expect(row.locator('.vz-summary-value')).toHaveText('4시간 / 3시간 30분');await expect(row.locator('.vz-summary-badge')).toHaveText('114%');
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
 await phoneWidth(page); // the one-line 이번 주 row is the phone layout; tablets show the full 주간 연습 card
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
 await expect(weekRow(page).locator('.vz-summary-value')).toHaveText('4분 / 3시간');
 await expect(weekRow(page)).toHaveAccessibleName('이번 주 연습 4분, 목표 3시간, 달성률 2%, 기록 보기');
 expect((await db(page)).practices[0].manualMinutes).toBe(4);
});

test('week row follows the current week across Monday and opens today in the calendar',async({page})=>{
 await phoneWidth(page); // the one-line 이번 주 row is the phone layout; tablets show the full 주간 연습 card
 const value=seed();value.practices=[{id:'sunday',date:'2026-11-08',minutes:14}];
 await boot(page,value);
 const row=weekRow(page),later=()=>page.getByRole('dialog',{name:'오늘의 목표',exact:true}).getByRole('button',{name:'나중에 설정할래요'}).click();
 // A future-dated practice is not counted yet.
 await expect(row.locator('.vz-summary-value')).toHaveText('0분 / 3시간');
 await page.evaluate(()=>{VZ.today=()=> '2026-11-08';VZ.render();});await ready(page);await later();
 await expect(row.locator('.vz-summary-value')).toHaveText('14분 / 3시간');await expect(row.locator('.vz-summary-badge')).toHaveText('8%');
 await expect(page.locator('.vz-today-streak')).toContainText('1일 연속');
 // Monday starts a new week: Sunday's minutes stay in last week and the target falls back to the daily default.
 await page.evaluate(()=>{VZ.today=()=> '2026-11-09';VZ.render();});await ready(page);await later();
 await expect(row.locator('.vz-summary-value')).toHaveText('0분 / 3시간 30분');await expect(page.locator('.vz-today-streak')).toHaveCount(0);
 await row.click();
 await expect(page).toHaveURL(/#\/calendar\?date=2026-11-09$/);
 await expect(page.locator('[data-grid] [data-d="2026-11-09"]')).toHaveAttribute('aria-pressed','true');
 expect((await db(page)).practices).toEqual(value.practices);
});
test('지금 할 것, summary rows, recent songs and profile retain their real destinations',async({page})=>{
 await phoneWidth(page); // the one-line 이번 주 row is the phone layout; tablets show the full 주간 연습 card
 await boot(page);const before=await db(page);
 await expect(page.locator('.vz-summary-row')).toHaveCount(3);
 for(const [i,key] of ['lesson','stage','week'].entries())await expect(page.locator('.vz-summary-row').nth(i)).toHaveAttribute('data-row',key);
 for(const [name,route]of [['숙제 호흡을 길게 유지하기 보기','homework'],['다음 레슨, 11.6 (금) 18:30, D-2','lesson/l1'],[/^(공연|오디션|무대), 가을 뮤지컬 오디션, D-4$/,'show/stage1'],['이번 주 연습 30분, 목표 3시간, 달성률 17%, 기록 보기','calendar?date='+TODAY],['This Is the Moment 연습하기','record?song=s1'],['프로필','settings']]){
  await page.goto('/#/home');await ready(page);await page.getByRole('button',{name,exact:typeof name==='string'}).click();await expect.poll(()=>new URL(page.url()).hash).toBe('#/'+route);
 }
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','performances','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('지금 할 것 follows today\'s lesson, homework, latest song, upcoming lesson, then a suggested practice',async({page})=>{
 await boot(page);const before=await db(page);
 const now=page.locator('.vz-event'),title=now.locator('h2'),badge=now.locator('.vz-dday'),line=now.locator('.vz-event-content>p'),lessonRow=page.locator('.vz-summary-row[data-row=lesson]');
 await page.evaluate(date=>VZ.change(d=>{d.lessons[0].date=date;}),TODAY);
 await expect(now).toHaveAttribute('data-kind','lesson');await expect(title).toHaveText('오늘 보컬 레슨');await expect(badge).toHaveText('18:30');await expect(line).toHaveText('연습실 · 김선생');
 await expect(lessonRow).toHaveCount(0);
 await now.click();await expect.poll(()=>new URL(page.url()).hash).toBe('#/lesson/l1');await page.goto('/#/home');await ready(page);
 await page.evaluate(()=>VZ.change(d=>{d.lessons[0].date='2026-11-06';}));
 await expect(now).toHaveAttribute('data-kind','homework');await expect(title).toHaveText('호흡을 길게 유지하기');await expect(badge).toHaveText('숙제');await expect(lessonRow).toHaveCount(1);
 await page.evaluate(()=>VZ.change(d=>{d.assignments[0].status='done';}));
 await expect(now).toHaveAttribute('data-kind','practice');await expect(title).toHaveText('이어서 연습하기');await expect(badge).toBeHidden();await expect(line).toHaveText('This Is the Moment');
 await expect(now).toHaveAccessibleName('This Is the Moment 이어서 연습하기');
 await now.click();await expect(page).toHaveURL(/#\/record\?song=s1$/);await expect(page.locator('[data-song-name]')).toHaveText('This Is the Moment');await page.goto('/#/home');await ready(page);
 await page.evaluate(()=>VZ.change(d=>{d.practices=[];}));
 await expect(now).toHaveAttribute('data-kind','lesson');await expect(title).toHaveText('보컬 레슨');await expect(badge).toHaveText('D-2');await expect(line).toHaveText('11.6 (금) 18:30');await expect(lessonRow).toHaveCount(0);
 await page.evaluate(()=>VZ.change(d=>{d.lessons=[];}));
 await expect(now).toHaveAttribute('data-kind','recommend');await expect(title).toHaveText('호흡과 발성 연습하기');await expect(badge).toHaveText('추천');
 await now.click();await expect(page).toHaveURL(/#\/practice-room$/);await page.goto('/#/home');await ready(page);
 // The same suggestion already in today's goals is not repeated: the card then just offers to record.
 const goalsBefore=(await db(page)).dailyGoals;
 await page.evaluate(day=>VZ.change(d=>{d.dailyGoals=[...(d.dailyGoals||[]),{id:'g-basic',date:day,title:'호흡과 발성 연습하기',source:'recommendation',sourceId:'basic:breathing',completed:false,order:9}];}),TODAY);
 await expect(now).toHaveAttribute('data-kind','record');await expect(title).toHaveText('지금 녹음하기');await expect(badge).toBeHidden();
 await page.evaluate(goals=>VZ.change(d=>{d.dailyGoals=goals;}),goalsBefore);
 const after=await db(page);for(const key of ['songs','performances','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('needs-attention summary row appears only when server analysis needs a check',async({page})=>{
 await boot(page);const before=await db(page);
 const rows=page.locator('.vz-summary-row'),attention=page.locator('.vz-summary-row[data-row=attention]');
 await expect(rows).toHaveCount(3);await expect(attention).toHaveCount(0);
 const counts=(review,songFail,vocalFail)=>({vocal:{done:0,wait:0,fail:vocalFail,total:vocalFail},song:{auto:0,review,wait:0,fail:songFail,total:review+songFail}});
 for(const [value,text,route]of [[counts(2,1,0),'곡 확인 2건','song-suggest'],[counts(0,1,1),'분석 실패 2건','processing-log']]){
  await page.evaluate(c=>{VZ.serverAnalysisCounts=()=>c;VZ.render();},value);await ready(page);
  await expect(rows).toHaveCount(4);await expect(rows.nth(2)).toHaveAttribute('data-row','attention');
  await expect(attention).toHaveAttribute('data-tone','attention');await expect(attention.locator('strong')).toHaveText('확인 필요');await expect(attention.locator('.vz-summary-value')).toHaveText(text);
  await attention.click();await expect.poll(()=>new URL(page.url()).hash).toBe('#/'+route);
  await page.goto('/#/home');await ready(page);
 }
 await page.evaluate(c=>{VZ.serverAnalysisCounts=()=>c;VZ.render();},counts(0,0,0));await ready(page);
 await expect(attention).toHaveCount(0);await expect(rows).toHaveCount(3);
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});
test('recent songs show at most three pills, latest practice first, each opening that song',async({page})=>{
 const value=seed();
 value.songs.push(...['s2','s3','s4','s5'].map((id,i)=>({id,title:'최근 곡 '+(i+2)})));
 value.practices.push(...[['s2','2026-11-03'],['s3','2026-11-02'],['s4','2026-11-01'],['s5','2026-10-30']].map(([songId,date])=>({id:'p-'+songId,date,manualMinutes:10,songId,practiceMode:'song'})));
 await boot(page,value);const before=await db(page);
 const pills=page.locator('.vz-recent-pill');
 await expect(page.locator('.vz-recent-heading')).toHaveText('최근 곡');
 await expect(pills).toHaveCount(3);await expect(pills.locator('span')).toHaveText(['This Is the Moment','최근 곡 2','최근 곡 3']);
 for(const pill of await pills.all())expect((await pill.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.locator('.vz-student-home').evaluate(host=>host.updateRecent([1,2,3,4,5].map(n=>({id:'s'+n,title:'곡 '+n}))));
 await expect(pills).toHaveCount(3);
 await page.evaluate(()=>VZ.render());await ready(page);await expect(pills.locator('span')).toHaveText(['This Is the Moment','최근 곡 2','최근 곡 3']);
 await page.getByRole('button',{name:'최근 곡 2 연습하기',exact:true}).click();await expect(page).toHaveURL(/#\/record\?song=s2$/);
 await expect(page.locator('[data-song-name]')).toHaveText('최근 곡 2');
 const after=await db(page);for(const key of ['songs','practices','dailyGoals'])expect(after[key]).toEqual(before[key]);
});
test('goal editor saves only user entered plans and personal goals',async({page})=>{
 await boot(page);await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 expect((await sheet.getByRole('button',{name:'목표 저장',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(52);
 await sheet.getByLabel('오늘 목표 시간(분)',{exact:true}).fill('45');await sheet.getByLabel('이번 주 목표 시간(분)',{exact:true}).fill('210');await sheet.getByLabel('개인 목표',{exact:true}).fill('새 개인 목표');await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 const value=await db(page);expect(value.practicePlans.find(p=>p.id==='day:'+TODAY).targetMinutes).toBe(45);expect(value.practicePlans.find(p=>p.id==='week:'+WEEK).targetMinutes).toBe(210);expect(value.dailyGoals.some(g=>g.title==='새 개인 목표')).toBe(true);expect(value.practices).toEqual(seed().practices);expect(value.assignments).toEqual(seed().assignments);
});
test('goal editor saves goals without pinning the default daily time',async({page})=>{
 const value=seed();value.practicePlans=[];
 await boot(page,value);await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await expect(sheet.getByLabel('오늘 목표 시간(분)',{exact:true})).toHaveValue('');await expect(sheet.getByLabel('오늘 목표 시간(분)',{exact:true})).toHaveAttribute('placeholder','기본 30분');
 await sheet.getByLabel('개인 목표',{exact:true}).fill('새 개인 목표');await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 await expect(sheet).toHaveCount(0);
 const after=await db(page);expect(after.practicePlans).toEqual([]);expect(after.dailyGoals.some(g=>g.title==='새 개인 목표')).toBe(true);
});
test('daily routine repeats a personal goal, records optional real minutes once, and ends from today on',async({page})=>{
 await boot(page);await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
 let sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 await sheet.getByLabel('개인 목표',{exact:true}).fill('립트릴 10분');
 await sheet.getByText('매일 반복',{exact:true}).click();
 await sheet.getByLabel('반복 일수',{exact:true}).fill('3');
 await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 let value=await db(page);const routine=value.practicePlans.find(p=>p.kind==='routine');
 expect(routine).toMatchObject({title:'립트릴 10분',days:3,startDate:TODAY,endDate:'2026-11-06',archived:false});
 expect(value.dailyGoals.filter(g=>g.sourceId===routine.id).map(g=>g.date)).toEqual([TODAY,'2026-11-05','2026-11-06']);
 expect(value.dailyGoals.filter(g=>['g1','g2','g3'].includes(g.id)).map(g=>[g.id,g.title,g.completed])).toEqual(seed().dailyGoals.map(g=>[g.id,g.title,g.completed]));
 await page.getByRole('checkbox',{name:'립트릴 10분',exact:true}).check();
 await page.getByRole('button',{name:'연습 시간·녹음 남기기',exact:true}).click();
 const record=page.getByRole('dialog',{name:'수행 기록',exact:true});
 await record.getByLabel('실제로 연습한 시간(분)',{exact:true}).fill('12');
 await record.getByRole('button',{name:'기록 저장',exact:true}).click();
 await expect(record).toHaveCount(0);
 value=await db(page);const goalId=routine.id+':'+TODAY;
 expect(value.practices.find(p=>p.id==='p1')).toEqual(seed().practices[0]);
 expect(value.practices.filter(p=>p.goalId===goalId)).toEqual([expect.objectContaining({id:'goal:'+goalId,date:TODAY,manualMinutes:12,practiceTimeSource:'goal',goalSource:'personal'})]);
 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
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
 const row=page.locator('.vz-goal-list label').filter({hasText:'허밍 5분'});
 await expect(row.locator('small')).toHaveText('반복 1/5');
 await expect(row.getByRole('button',{name:'허밍 5분 수행 기록'})).toBeHidden();
 await page.getByRole('checkbox',{name:'허밍 5분',exact:true}).check();
 await expect(row.locator('small')).toHaveText('반복 2/5');
 await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='routine:old:'+TODAY).completed).toBe(true);
 // Later (after the 6-second offer), the completed row still opens 수행 기록.
 await page.locator('.vz-perform-offer').evaluate(el=>el.remove()).catch(()=>{});
 await row.getByRole('button',{name:'허밍 5분 수행 기록',exact:true}).click();
 const record=page.getByRole('dialog',{name:'수행 기록',exact:true});
 await record.getByLabel('실제로 연습한 시간(분)',{exact:true}).fill('7');
 await record.getByRole('button',{name:'기록 저장',exact:true}).click();
 await expect(record).toHaveCount(0);
 await expect.poll(async()=>(await db(page)).practices.find(p=>p.id==='goal:routine:old:'+TODAY)?.manualMinutes).toBe(7);
 await expect(page.getByRole('checkbox',{name:'허밍 5분',exact:true})).toBeChecked();

 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
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
 await expect(page.locator('.vz-goal-list label').filter({hasText:'호흡을 길게 유지하기'}).locator('small')).toHaveText('숙제 반복 0/5');
 await noOverflow(page);
});
test('goal planning separates long selectable rows and keeps save visible on small screens',async({page},testInfo)=>{
 const value=seed();value.dailyGoals[0].title='악보에 너무 맞추려 하지 않고 반주치면서 박자와 리듬을 가지고 노는 것처럼 연습하기 · 18마디 참고';
 await boot(page,value);
 for(const width of widths){
  await page.setViewportSize({width,height:744});
  await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
  await sheet.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished));});
  const rows=sheet.locator('.vz-plan-option'),save=sheet.getByRole('button',{name:'목표 저장',exact:true});
  await expect(rows).toHaveCount(4);await expect(sheet.locator('[data-plan-count]')).toHaveText('3개 선택');
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
 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
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
 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
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
 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
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
  for(const row of await page.locator('.vz-summary-row').all()){const b=await row.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.x+b.width).toBeLessThanOrEqual(width);}
  expect((await page.locator('.vz-event').boundingBox()).height).toBeGreaterThanOrEqual(44);
  const full=await page.locator('.vz-goal-list label>span').first().evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));expect(full.scroll).toBeLessThanOrEqual(full.height+1);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const end=await page.locator('.vz-recent').boundingBox(),fab=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(end.y+end.height+12).toBeLessThanOrEqual(fab.y);
  await screenshot(page,testInfo,'student-home-large-text-bottom-'+width+'.png');
 }
 await page.getByRole('checkbox',{name:title,exact:true}).check();await expect(page.getByRole('checkbox',{name:title,exact:true})).toBeChecked();
});
test('six real schedule combinations never restore sample events',async({page},testInfo)=>{
 const value=seed();value.assignments=[];value.dailyGoals=[];value.practices=[];
 await boot(page,value);
 const lesson=date=>({id:'l1',date,startTime:'18:30',endTime:'19:30',status:'scheduled',songId:'s1',songIds:['s1'],teacher:'김선생',place:'연습실'}),stage=seed().performances;
 for(const [name,data,kind,heading,rows]of [
  ['both',{lessons:[lesson('2026-11-06')],performances:stage},'lesson','보컬 레슨',['stage','week']],
  ['stages',{lessons:[],performances:stage},'recommend','호흡과 발성 연습하기',['stage','week']],
  ['lesson',{lessons:[lesson('2026-11-06')],performances:[]},'lesson','보컬 레슨',['week']],
  ['none',{lessons:[],performances:[]},'recommend','호흡과 발성 연습하기',['week']],
  ['today',{lessons:[lesson(TODAY)],performances:stage},'lesson','오늘 보컬 레슨',['stage','week']],
  ['practice',{lessons:[lesson('2026-11-06')],performances:stage,practices:seed().practices},'practice','이어서 연습하기',['lesson','stage','week']]]){
  await page.setViewportSize({width:390,height:940});
  await page.evaluate(data=>VZ.change(d=>{d.lessons=data.lessons;d.performances=data.performances;d.practices=data.practices||[];}),data);
  await expect(page.locator('.vz-event')).toHaveAttribute('data-kind',kind);await expect(page.locator('.vz-event h2')).toHaveText(heading);
  await expect(page.locator('.vz-summary-row')).toHaveCount(rows.length);
  for(const [i,key] of rows.entries())await expect(page.locator('.vz-summary-row').nth(i)).toHaveAttribute('data-row',key);
  await noSample(page);
  for(const row of await page.locator('.vz-summary-row').all())expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
  for(const width of widths){await page.setViewportSize({width,height:940});await noOverflow(page);}
  await page.setViewportSize({width:390,height:940});await screenshot(page,testInfo,'student-home-upcoming-'+name+'-390.png');
 }
 await page.locator('.vz-event').click();await expect(page).toHaveURL(/#\/record\?song=s1$/);
 expect((await db(page)).songs).toEqual(value.songs);
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




test('home shows four goals first and expands the rest in order without changing records',async({page})=>{
 const value=seed();value.dailyGoals=Array.from({length:6},(_,i)=>({id:'goal-'+i,date:TODAY,title:'목표 '+(i+1),source:'personal',completed:i===5,order:i}));
 await boot(page,value);
 const more=page.locator('.vz-goal-more');
 await expect(goals(page)).toHaveCount(6);
 for(let i=0;i<6;i++)await (i<4?expect(goals(page).nth(i)).toBeVisible():expect(goals(page).nth(i)).toBeHidden());
 await expect(page.locator('.vz-count')).toHaveText('1 / 6 완료');
 await expect(more).toHaveText('목표 2개 더 보기');await expect(more).toHaveAttribute('aria-expanded','false');expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await more.click();await expect(more).toHaveText('접기');await expect(more).toHaveAttribute('aria-expanded','true');
 for(let i=0;i<6;i++)await expect(goals(page).nth(i)).toBeVisible();
 await expect(goals(page).nth(5)).toBeChecked();
 await page.getByRole('checkbox',{name:'목표 5',exact:true}).check();await expect(page.locator('.vz-count')).toHaveText('2 / 6 완료');
 await expect.poll(async()=>(await db(page)).dailyGoals.find(g=>g.id==='goal-4').completed).toBe(true);
 await more.click();await expect(goals(page).nth(4)).toBeHidden();await expect(more).toHaveText('목표 2개 더 보기');await expect(more).toHaveAttribute('aria-expanded','false');
 expect((await db(page)).dailyGoals.map(g=>g.id)).toEqual(value.dailyGoals.map(g=>g.id));
 await page.evaluate(()=>VZ.change(d=>{d.dailyGoals=d.dailyGoals.slice(0,4);}));
 await expect(goals(page)).toHaveCount(4);await expect(more).toHaveCount(0);
});

test('My Songs and Library share the current home outer spacing and fixed navigation',async({page})=>{
 await boot(page);
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:940});await page.evaluate(()=>VZ.nav('#/home'));await ready(page);
  const header=await page.locator('.vz-header').boundingBox(),nav=await page.locator('.vz-nav-space').boundingBox(),fab=await page.locator('.vz-floating-record').boundingBox();
  for(const route of ['songs','library']){
   await page.evaluate(route=>VZ.nav('#/'+route),route);await expect(page.locator('#view')).toHaveAttribute('data-collection',route);
   const otherHeader=await page.locator('#top').boundingBox(),otherNav=await page.locator('.v-nav').boundingBox(),otherFab=await page.locator('.vz-collection-record').boundingBox();
   for(const key of ['x','y','width','height'])expect(Math.abs(otherHeader[key]-header[key])).toBeLessThanOrEqual(1);
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
    cardRadius:css(document.querySelector('.card,.list,.empty,.vz-review-link')).borderRadius};
  });
  expect(shell.accent).toBe('#7A32F5');
  expect(shell.background).toBe('rgb(248, 246, 253)');
  expect(shell.heading).toContain('Pretendard');
  expect(shell.navItems).toBe(4);
  expect(shell.navHeight).toBe(70);
  expect(shell.fab).toBe('grid');
  expect(shell.cardRadius).toBe('20px');
  await noOverflow(page);
 }
});

test('today line keeps its height and colors the streak only from two days',async({page})=>{
 await boot(page);
 const line=page.locator('.vz-today-line'),streak=line.locator('.vz-today-streak');
 await expect(line.locator('span').first()).toHaveText('11월 4일 (수)');
 await expect(streak).toContainText('1일 연속');await expect(streak).toHaveAttribute('data-active','false');await expect(streak).toHaveCSS('color','rgb(102, 112, 133)');
 const height=(await line.boundingBox()).height;
 await page.evaluate(()=>VZ.change(d=>{d.practices.push({id:'yesterday',date:'2026-11-03',manualMinutes:20,songId:'s1'});}));
 await expect(streak).toContainText('2일 연속');await expect(streak).toHaveAttribute('data-active','true');
 expect(await streak.evaluate(e=>getComputedStyle(e).color)).not.toBe('rgb(102, 112, 133)');
 expect(Math.abs((await line.boundingBox()).height-height)).toBeLessThanOrEqual(1);
 const host=page.locator('.vz-student-home'),base=await page.evaluate(()=>VzipStudentHomeModel.build(VZ.db,{today:VZ.today()}).week);
 await host.evaluate((el,week)=>el.updateWeek(week),{...base,streak:0});
 await expect(streak).toHaveCount(0);await expect(line).toHaveText('11월 4일 (수)');
 expect(Math.abs((await line.boundingBox()).height-height)).toBeLessThanOrEqual(1);
});



test('Goal integrity rejects stale editor while retaining draft and latest check',async({page})=>{
 await boot(page);
 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
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


for(const [label,text,hash] of [['AI로 오늘 할 일 추천받기','AI 오늘 추천','#/practice-review?mode=today'],['주간 돌아보기 · 다음 목표 추천','주간 돌아보기','#/practice-review']]){
 test('home visibly renders and opens '+label,async({page})=>{
  await boot(page);const button=page.getByRole('button',{name:label,exact:true});
  await expect(button).toBeVisible();await expect(button).toHaveText(text);
  // Both AI actions share one row of pills.
  const [a,b]=await page.locator('.vz-ai-plan-actions>button').all();expect(Math.abs((await a.boundingBox()).y-(await b.boundingBox()).y)).toBeLessThanOrEqual(1);
  expect(await button.evaluate(el=>el.getRootNode() instanceof ShadowRoot)).toBe(true);
  await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
  await button.click();await expect(page).toHaveURL(new RegExp(hash.replace(/[?]/g,'\\?')+'$'));
  await expect(page.locator('[data-review]')).toBeVisible();
 });
}
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
test('tablets (768px+) put 지금 할 것 + goals beside the summary and recent songs, in landscape and portrait; narrower screens keep one column',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 const box=()=>page.evaluate(()=>{const r=document.querySelector('.vz-student-home').shadowRoot;const b=s=>{const q=r.querySelector(s).getBoundingClientRect();return {x:q.x,y:q.y,w:q.width,bottom:q.bottom};};return {phone:b('.vz-phone'),now:b('.vz-schedule'),goals:b('.vz-goals'),summary:b('.vz-summary'),recent:b('.vz-recent')};});
 await page.setViewportSize({width:1180,height:820});await boot(page);
 let b=await box();
 expect(b.phone.w).toBeGreaterThan(900);
 expect(b.summary.x).toBeGreaterThan(b.now.x+b.now.w);expect(Math.abs(b.summary.y-b.now.y)).toBeLessThan(1);
 expect(b.goals.y).toBeGreaterThan(b.now.y);expect(b.recent.y).toBeGreaterThan(b.summary.y);
 await noOverflow(page);
 await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(200); // iPad portrait: still two columns
 b=await box();
 expect(b.summary.x).toBeGreaterThan(b.now.x+b.now.w);expect(Math.abs(b.summary.y-b.now.y)).toBeLessThan(1);await noOverflow(page);
 await page.setViewportSize({width:744,height:1133});await page.waitForTimeout(200); // iPad mini portrait: one column
 b=await box();
 expect(b.phone.w).toBeLessThanOrEqual(560);
 expect(b.summary.y).toBeGreaterThan(b.goals.bottom-1);expect(Math.abs(b.summary.x-b.goals.x)).toBeLessThan(1); // one column, as on phones
});
test('tablets show the full 주간 연습 card beside the summary (rings, arrows, title to the calendar); phones show the one-line row',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 const value=seed();value.practices.push({id:'last-week',date:'2026-10-28',minutes:20});
 await page.setViewportSize({width:820,height:1180});await boot(page,value);const before=await db(page);
 const card=page.locator('.vz-col-side .vz-week'),row=page.locator('.vz-summary-row[data-row=week]');
 await expect(card).toBeVisible();await expect(row).toBeHidden();
 await expect(card.locator('.vz-days>div')).toHaveCount(7);await expect(card.locator('.vz-time b')).toHaveText('30');
 await expect(card.locator('.vz-days>div[data-today=true]')).toHaveAttribute('data-date',TODAY);
 const order=await page.evaluate(()=>[...document.querySelector('.vz-student-home').shadowRoot.querySelector('.vz-col-side').children].map(e=>e.className.split(' ').find(c=>/vz-(summary|week|recent)$/.test(c))));
 expect(order).toEqual(['vz-summary','vz-week','vz-recent']);
 await card.getByRole('button',{name:'이전 주',exact:true}).click();
 await expect(card).toHaveAttribute('data-week-start','2026-10-26');await expect(card.locator('.vz-time b')).toHaveText('20');
 await expect(page.locator('.vz-today-line')).toContainText('1일 연속'); // the streak stays this week's
 await page.getByRole('button',{name:'오늘 일정 보기',exact:true}).click();await expect(page).toHaveURL(/#\/calendar/);
 expect(await db(page)).toEqual(before);
 await page.setViewportSize({width:390,height:844});await page.goto('/#/home');await ready(page);
 await expect(card).toBeHidden();await expect(row).toBeVisible();
});
