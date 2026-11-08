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
test.afterEach(async({page})=>expect(page.__homeErrors||[]).toEqual([]));
test('literal floating HTML and app screenshots at 320/390/430',async({page},testInfo)=>{
 await boot(page);
 for(const width of widths){await page.setViewportSize({width,height:940});await noOverflow(page);const card=await page.locator('.vz-week').boundingBox();expect(card.x).toBeGreaterThanOrEqual(12);expect(card.x).toBeLessThanOrEqual(20);expect(Math.abs(card.width-(width-2*card.x))).toBeLessThanOrEqual(1);await expect(page.locator('.vz-week')).toHaveCSS('padding-left','16px');await expect(page.locator('.vz-goals')).toHaveCSS('padding-top','16px');const dock=await page.locator('.vz-nav-space').boundingBox();expect(Math.abs(dock.x-16)).toBeLessThanOrEqual(1);expect(Math.abs(dock.width-(width-32))).toBeLessThanOrEqual(1);const before=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(Math.abs(width-before.x-before.width-16)).toBeLessThanOrEqual(1);await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const after=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(Math.abs(before.y-after.y)).toBeLessThanOrEqual(1);const last=await page.locator('.vz-goals').boundingBox();expect(last.y+last.height+12).toBeLessThanOrEqual(after.y);await page.evaluate(()=>scrollTo(0,0));await screenshot(page,testInfo,'student-home-after-'+width+'.png');}
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
  return {styles:JSON.stringify(actual)===JSON.stringify(expected),count:actual.length,fab:shadow.querySelector('.vz-floating-record i')?.dataset.glyph==='\ue326',nav:[...shadow.querySelectorAll('.vz-nav-item')].map(e=>e.querySelector('i')?.dataset.glyph).join(',')==='\ue2c2,\ue340,\ue00e,\ue10a',scripts:shadow.querySelectorAll('script,#vz-record-dialog,#vz-toast').length};
 });
 expect(result).toEqual({styles:true,count:10,fab:true,nav:true,scripts:0});
 await expect(page.locator('.vz-nav-item')).toHaveCount(4);
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
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await list.evaluate(e=>{e.scrollTop=450;});const before=await list.evaluate(e=>e.scrollTop);
 const index=await list.evaluate(e=>{const r=e.getBoundingClientRect();return [...e.children].findIndex(n=>{const b=n.getBoundingClientRect();return b.top>=r.top+4&&b.bottom<=r.bottom-4;});});
 await goals(page).nth(index).click();await expect(goals(page).nth(index)).toBeChecked();expect(Math.abs(await list.evaluate(e=>e.scrollTop)-before)).toBeLessThanOrEqual(1);
 expect((await db(page)).dailyGoals.map(g=>g.id)).toEqual(value.dailyGoals.map(g=>g.id));await expect(page.locator('.vz-count')).toHaveText('1 / 900 완료');
 // Keep this stress test focused on persistence and scroll; visual captures are covered by layout tests.
});
test('empty state removes all sample data and connects song and goal setup',async({page})=>{
 const value={categories:[],songs:[],lessons:[],assignments:[],practices:[],performances:[],comparisonReports:[]};await boot(page,value);
 await expect(page.locator('.vz-schedule')).toHaveCount(0);await expect(goals(page)).toHaveCount(0);await expect(page.locator('.vz-count')).toHaveText('0 / 0 완료');
 await expect(page.locator('.vz-song')).not.toContainText('Defying Gravity');
 await page.getByRole('button',{name:'곡 추가 또는 선택',exact:true}).click();await expect(page).toHaveURL(/#\/songs$/);
 await page.goto('/#/home');await ready(page);await page.getByRole('button',{name:'주간 목표 설정',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});await expect(sheet).toBeVisible();await sheet.getByRole('button',{name:'닫기',exact:true}).click();
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','performances'])expect(after[key]).toEqual([]);
 expect(after.dailyGoals||[]).toEqual([]);expect(after.practicePlans||[]).toEqual([]);
});
test('weekday names, minutes, rings and percentage colors use actual records',async({page})=>{
 await boot(page);
 for(const [minutes,level,color]of [[0,'missed',null],[99,'partial','rgb(217, 197, 250)'],[100,'done','rgb(122, 50, 245)'],[120,'done','rgb(122, 50, 245)'],[121,'exceeded','rgb(76, 24, 142)']]){
  await page.evaluate(({minutes,date})=>VZ.change(d=>{d.practices=[{id:'boundary',date,manualMinutes:minutes,minutes:999,mediaSeconds:9999,songId:'s1'}];d.practicePlans=[{id:'day:'+date,period:'day',date,targetMinutes:100}];}),{minutes,date:TODAY});
  const day=page.locator('.vz-days>div[data-date="'+TODAY+'"]'),dot=day.locator('.vz-day-dot');await expect(day).toHaveAttribute('data-today','true');await expect(day.locator('span').first()).toHaveText('4');await expect(dot).toHaveClass(new RegExp(level));await expect(dot).toHaveClass(/today/);
  if(color)await expect(dot).toHaveCSS('background-color',color);await expect(day).toHaveAttribute('aria-label',new RegExp(minutes+'분 연습'));
  if(minutes)await expect(day.locator('.vz-day-minutes')).toHaveText(minutes+'분');
 }
 const future=page.locator('.vz-days>div[data-date="2026-11-05"]');await expect(future.locator('.vz-day-dot')).toHaveClass(/future/);await expect(future.locator('svg')).toHaveCount(0);await expect(future.locator('.vz-day-minutes')).toBeEmpty();
 await page.evaluate(()=>VZ.change(d=>{d.practicePlans=[];}));await expect(page.locator('.vz-days>div[data-date="'+TODAY+'"]')).toHaveAttribute('aria-label',/목표 미설정/);
});
test('four home navigation buttons and floating recording reach existing routes',async({page})=>{
 await boot(page);const before=await db(page);await expect(page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button')).toHaveText(['홈','내 곡','보관함','일정']);
 const dock=await page.evaluate(()=>{const root=document.querySelector('.vz-student-home').shadowRoot,nav=root.querySelector('.vz-nav');return {icons:[...nav.querySelectorAll('.vz-nav-item i')].map(i=>i.dataset.glyph),background:getComputedStyle(nav).backgroundColor,font:document.fonts.check('22px Phosphor')}});
 expect(dock.icons).toEqual(['\ue2c2','\ue340','\ue00e','\ue10a']);expect(dock.background).toBe('rgba(255, 255, 255, 0.68)');expect(dock.font).toBe(true);
 for(const [label,route]of [['내 곡','songs'],['보관함','library'],['일정','calendar'],['녹음 시작','record']]){
  await page.goto('/#/home');await ready(page);
   await page.getByRole('button',{name:label,exact:true}).click();
   if(route==='record')await expect(page.locator('.vz-record-expansion')).toBeVisible();
   await expect.poll(()=>new URL(page.url()).hash).toBe('#/'+route);await expect(page.locator('.vz-student-home')).toHaveCount(0);await expect(page.locator('body')).not.toHaveClass(/vz-home-mode/);
   if(route==='record'){await expect(page.locator('body')).toHaveClass(/vz-record-mode/);await expect(page.locator('.v-nav')).toBeHidden();}else await expect(page.locator('.v-nav')).toBeVisible();
   await noOverflow(page);
 }
 const after=await db(page);for(const key of ['songs','lessons','assignments','practices','dailyGoals','practicePlans'])expect(after[key]).toEqual(before[key]);
});

test('weekly home includes loose recordings once, but excludes lesson and performance media',async({page})=>{
 const value=seed();value.practices=[{id:'p',date:TODAY,minutes:999,manualMinutes:4,mediaIds:['linked']}];
 await boot(page,value);
 await page.evaluate(date=>{
  const files=[{id:'one',durationSeconds:225},{id:'two',durationSeconds:191},{id:'three',durationSeconds:232},
   {id:'linked',durationSeconds:900},{id:'lesson',source:'lesson',durationSeconds:900},
   {id:'stage',occasion:'performance',durationSeconds:900}].map(m=>({...m,recordedDate:date,type:'audio/mp4'}));
  VZ.media.list=async()=>files;
  window.dispatchEvent(new Event('vzip:cloud-media-changed'));
 },TODAY);
 await expect(page.locator('.vz-week .vz-time b')).toHaveText('15');
 await expect(page.locator('.vz-days>[data-date="'+TODAY+'"] .vz-day-minutes')).toHaveText('15분');
 await expect(page.locator('.vz-week-range')).toHaveText('11.2 – 11.8');
 await expect(page.locator('.vz-days>[data-date="'+TODAY+'"]>span:first-child')).toHaveText('4');
 expect((await db(page)).practices[0].manualMinutes).toBe(4);
});

test('week swipe and arrows preserve history across Monday, and title/day navigate to exact calendar dates',async({page})=>{
 const value=seed();value.practices=[{id:'sunday',date:'2026-11-08',minutes:14}];
 await boot(page,value);
 await page.evaluate(()=>{VZ.today=()=> '2026-11-09';VZ.render();});await ready(page);
 await expect(page.locator('.vz-week .vz-time b')).toHaveText('0');
 await expect(page.locator('.vz-week-range')).toHaveText('11.9 – 11.15');
 const card=page.locator('.vz-week');
 await card.dispatchEvent('pointerdown',{pointerId:7,button:0,pointerType:'touch',clientX:100,clientY:400});
 await card.dispatchEvent('pointerup',{pointerId:7,button:0,pointerType:'touch',clientX:230,clientY:403});
 await expect(page.locator('.vz-week .vz-time b')).toHaveText('14');
 await expect(page.locator('.vz-week-range')).toHaveText('11.2 – 11.8');
 // A vertical scroll gesture must leave the week alone.
 await card.dispatchEvent('pointerdown',{pointerId:8,button:0,clientX:100,clientY:400});
 await card.dispatchEvent('pointerup',{pointerId:8,button:0,clientX:103,clientY:550});
 await expect(card).toHaveAttribute('data-week-start','2026-11-02');
 // Wait out synthetic swipe click suppression before a deliberate next tap.
 await page.waitForTimeout(360);
 await page.getByRole('button',{name:'다음 주',exact:true}).click();
 await expect(card).toHaveAttribute('data-week-start','2026-11-09');
 await page.getByRole('button',{name:'이전 주',exact:true}).click();
 await page.locator('.vz-days>[data-date="2026-11-08"]').click();
 await expect(page).toHaveURL(/#\/calendar\?date=2026-11-08$/);
 await expect(page.locator('[data-grid] [data-d="2026-11-08"]')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>VZ.nav('#/home'));await ready(page);
 await page.getByRole('button',{name:'오늘 일정 보기',exact:true}).click();
 await expect(page).toHaveURL(/#\/calendar\?date=2026-11-09$/);
 await expect(page.locator('[data-grid] [data-d="2026-11-09"]')).toHaveAttribute('aria-pressed','true');
 expect((await db(page)).practices).toEqual(value.practices);
});
test('stage, lesson, song and quick actions retain their real destinations',async({page})=>{
 await boot(page);
 for(const [label,route]of [['다음 레슨 보기','lesson/l1'],['무대 상세 보기','show/stage1'],['최근 연습곡 This Is the Moment 열기','record?song=s1'],['레슨노트','lessons'],['연습기록','practices'],['프로필','settings']]){
  await page.goto('/#/home');await ready(page);await page.getByRole('button',{name:label,exact:true}).click();await expect.poll(()=>new URL(page.url()).hash).toBe('#/'+route);
 }
});
test('goal editor saves only user entered plans and personal goals',async({page})=>{
 await boot(page);await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
 expect((await sheet.getByRole('button',{name:'목표 저장',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(52);
 await sheet.getByLabel('오늘 목표 시간(분)',{exact:true}).fill('45');await sheet.getByLabel('이번 주 목표 시간(분)',{exact:true}).fill('210');await sheet.getByLabel('개인 목표',{exact:true}).fill('새 개인 목표');await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 const value=await db(page);expect(value.practicePlans.find(p=>p.id==='day:'+TODAY).targetMinutes).toBe(45);expect(value.practicePlans.find(p=>p.id==='week:'+WEEK).targetMinutes).toBe(210);expect(value.dailyGoals.some(g=>g.title==='새 개인 목표')).toBe(true);expect(value.practices).toEqual(seed().practices);expect(value.assignments).toEqual(seed().assignments);
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
  await expect(rows).toHaveCount(3);await expect(sheet.locator('[data-plan-count]')).toHaveText('3개 선택');
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
  await sheet.getByRole('button',{name:'닫기',exact:true}).click();
 }
});
test('goal selection remains keyboard accessible and leaves source homework unchanged',async({page})=>{
 await boot(page);const before=await db(page);
 await page.getByRole('button',{name:'오늘의 목표 설정',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true}),check=sheet.locator('input[name=goal]').first();
 await check.focus();await page.keyboard.press('Space');await expect(check).not.toBeChecked();
 await expect(sheet.locator('[data-plan-count]')).toHaveText('2개 선택');
 await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
 const after=await db(page);expect(after.dailyGoals.some(g=>g.id==='g1')).toBe(false);
 expect(after.assignments).toEqual(before.assignments);expect(after.practices).toEqual(before.practices);
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
  await page.getByRole('button',{name:/계속 연습하기$/}).click();
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
 const value=seed(),title='긴 한국어 가사와 LongEnglishWord를 끝까지 호흡하며 연결해서 연습하기 '.repeat(10);
 value.songs[0].title='LongEnglishSongTitleAnd한글곡명'.repeat(9);
 value.dailyGoals=[{id:'long',date:TODAY,title,source:'personal',completed:false,order:0}];
 await boot(page,value);
 await page.locator('.vz-student-home').evaluate(host=>{
  const nodes=[...host.shadowRoot.querySelector('main').querySelectorAll('p,span,strong,small,h2,h3,label,button')],sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));
  nodes.forEach((n,i)=>n.style.setProperty('font-size',sizes[i]*2+'px','important'));
 });
 for(const width of widths){
  await page.setViewportSize({width,height:940});await noOverflow(page);
  const button=page.getByRole('button',{name:/계속 연습하기$/}),bounds=await button.boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(44);
  const full=await page.locator('.vz-song h3').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));expect(full.scroll).toBeLessThanOrEqual(full.height+1);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const end=await page.locator('.vz-goals').boundingBox(),fab=await page.getByRole('button',{name:'녹음 시작',exact:true}).boundingBox();expect(end.y+end.height+12).toBeLessThanOrEqual(fab.y);
  await screenshot(page,testInfo,'student-home-large-text-bottom-'+width+'.png');
 }
 await page.getByRole('checkbox',{name:title,exact:true}).check();await expect(page.getByRole('checkbox',{name:title,exact:true})).toBeChecked();
});
test('six real schedule combinations never restore sample events',async({page},testInfo)=>{
 for(const [name,total,lessons]of [['both',2,1],['stages',2,0],['all',3,1],['lesson',1,1],['none',0,0],['soon',3,1]]){
  await page.setViewportSize({width:390,height:940});await page.goto('/design-system/student-home-preview.html?upcoming='+name);await expect(page.locator('.vz-phone')).toBeVisible();
  await expect(page.locator('.vz-event')).toHaveCount(lessons);await expect(page.locator('.vz-event-row')).toHaveCount(total-lessons);
  if(!total)await expect(page.locator('.vz-schedule')).toHaveCount(0);
  for(const row of await page.locator('.vz-event-row').all())expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
  for(const width of widths){await page.setViewportSize({width,height:940});await noOverflow(page);}
  await page.setViewportSize({width:390,height:940});await screenshot(page,testInfo,'student-home-upcoming-'+name+'-390.png');
 }
 await page.getByRole('button',{name:'보컬 레슨 확인',exact:true}).click();await expect(page.locator('.preview-status')).toContainText('레슨 확인');
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




test('week bounds disable arrows and also stop swipe beyond real recording and schedule weeks',async({page})=>{
 const value=seed();value.practices=[];value.lessons=[];value.performances=[];
 await boot(page,value);
 const previous=page.getByRole('button',{name:'이전 주',exact:true}),next=page.getByRole('button',{name:'다음 주',exact:true}),card=page.locator('.vz-week');
 await expect(previous).toBeDisabled();await expect(next).toBeDisabled();
 await card.dispatchEvent('wheel',{deltaX:80,deltaY:0});await expect(card).toHaveAttribute('data-week-start','2026-11-02');
 await page.evaluate(()=>{VZ.change(db=>{db.lessons.push({id:'old',date:'2026-10-28',status:'done'},{id:'future',date:'2026-11-18',status:'scheduled'})},{silent:true});VZ.render()});await ready(page);
 await expect(previous).toBeEnabled();await expect(next).toBeEnabled();
 await previous.click();await expect(card).toHaveAttribute('data-week-start','2026-10-26');await expect(previous).toBeDisabled();
 await card.dispatchEvent('pointerdown',{pointerId:9,button:0,clientX:100,clientY:300});await card.dispatchEvent('pointerup',{pointerId:9,button:0,clientX:200,clientY:300});await expect(card).toHaveAttribute('data-week-start','2026-10-26');
 await page.waitForTimeout(360);await next.click();await next.click();await next.click();await expect(card).toHaveAttribute('data-week-start','2026-11-16');await expect(next).toBeDisabled();
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

test('shared colors, type hierarchy, cards and four-item dock apply to regular screens',async({page})=>{
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
  expect(shell.fab).toBe('flex');
  expect(shell.cardRadius).toBe('20px');
  await noOverflow(page);
 }
});

test('weekly metadata keeps its height across weeks and colors streaks only from two days',async({page})=>{
 await boot(page);
 const host=page.locator('.vz-student-home'),card=page.locator('.vz-week');
 const base=await page.evaluate(()=>VzipStudentHomeModel.build(VZ.db,{today:VZ.today()}).week);
 let height;
 for(const [streak,current,target] of [[0,true,null],[1,false,210],[2,false,210]]){
  await host.evaluate((el,week)=>el.updateWeek(week),{...base,streak,current,targetMinutes:target});
  const next=(await card.boundingBox()).height;if(height!==undefined)expect(Math.abs(next-height)).toBeLessThanOrEqual(1);height=next;
  await expect(page.locator('.vz-streak')).toHaveCSS('color',streak>=2?'rgb(122, 50, 245)':'rgb(102, 112, 133)');
 }
});


