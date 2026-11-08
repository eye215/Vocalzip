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
async function screenshot(page, testInfo, name) {
  await page.evaluate(() => document.fonts.ready);
  // Hide the fixed dock only in long content captures; viewport captures keep the real dock.
  await page.screenshot({path:testInfo.outputPath(name),fullPage:true,animations:'disabled',style:'.v-nav, .vz-approved-dock { visibility:hidden !important; }'});
  if(/-\d{3}\.png$/.test(name))await page.screenshot({path:testInfo.outputPath(name.replace('.png','-viewport.png')),fullPage:false,animations:'disabled'});
}
test.afterEach(async ({page}) => {expect(page.__homeErrors || []).toEqual([]);});

test('fixed preview and actual home screenshots at 320/390/430', async ({page}, testInfo) => {
  await boot(page);
  for (const width of widths) {
    await page.setViewportSize({width,height:844});
    await noOverflow(page);
    const cards=await page.locator('section.vz-home-stage, section.vz-home-goals, section.vz-home-week, .vz-home-bottom-grid').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {top:b.top,bottom:b.bottom};}));
    expect(cards).toHaveLength(4);
    for(let i=1;i<cards.length;i++) expect(cards[i-1].bottom).toBeLessThanOrEqual(cards[i].top+1);
    const song = await page.locator('.vz-song-tile').boundingBox();
    const quick = await page.locator('.vz-quick-actions').boundingBox();
    expect(song).not.toBeNull();
    expect(quick).not.toBeNull();
    // PR #136: square recent-song tile plus a two-row quick-action group.
    if(width>=390)expect(Math.abs(song.height-song.width)).toBeLessThanOrEqual(1);
    else expect(song.height).toBeGreaterThanOrEqual(song.width-1);
    expect(Math.abs(song.height-quick.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(song.y-quick.y)).toBeLessThanOrEqual(1);
    expect(song.x+song.width+8).toBeLessThanOrEqual(quick.x);
    const rows = await page.locator('.vz-goal-row').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
    expect(rows.every(height => Math.round(height) >= 48)).toBe(true);
    await screenshot(page,testInfo,'student-home-after-'+width+'.png');
  }
  await page.goto('/design-system/student-home-preview.html');
  await expect(page.locator('.vz-student-home')).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({width,height:844});
    await noOverflow(page);
    await screenshot(page,testInfo,'student-home-preview-'+width+'.png');
    if(width===390){
      const geometry=await page.evaluate(()=>{
        const box=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),s=getComputedStyle(el);return{x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,weight:s.fontWeight,color:s.color};};
        return{stage:box('.vz-home-stage'),goals:box('.vz-home-goals'),week:box('.vz-home-week'),recent:box('.vz-home-song'),recentTitle:box('.vz-home-song-copy strong'),recentArtist:box('.vz-home-song-copy>span'),dock:box('.vz-approved-dock'),heading:box('.vz-home-heading'),greeting:box('.vz-home-greeting'),icon:box('.vz-home-heading .vz-home-icon')};
      });
      console.log('HOME_DESIGN_GEOMETRY '+JSON.stringify(geometry));
      // Content can scroll; actual titles must remain inside the expanding square tile.
      expect(geometry.recentArtist.y+geometry.recentArtist.height+5).toBeLessThanOrEqual(geometry.recent.y+geometry.recent.height);
      expect(geometry.recentTitle.y+geometry.recentTitle.height).toBeLessThanOrEqual(geometry.recentArtist.y+1);
    }
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const bottom=await page.locator('.vz-home-stack> :last-child').boundingBox();
    const dock=await page.locator('.vz-approved-dock').boundingBox();
    expect(bottom.y+bottom.height+6).toBeLessThanOrEqual(dock.y);
    await page.evaluate(()=>scrollTo(0,0));
  }
});

test('same fixture baseline screenshots from the pinned pre-change source', async ({page}, testInfo) => {
  test.skip(!process.env.VZ_HOME_BASELINE_URL,'Baseline server is supplied by student-home-check workflow.');
  await prepare(page);
  await page.goto(process.env.VZ_HOME_BASELINE_URL+'/#/home');
  await ready(page,false);
  await expect(page.locator('#view')).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({width,height:844});
    await screenshot(page,testInfo,'student-home-before-'+width+'.png');
  }
});

test('reading real home preserves source records; checked goal persists across refresh', async ({page}) => {
  const original = seed();
  await boot(page,original);
  const initial = await db(page);
  for (const key of ['lessons','assignments','practices','performances','dailyGoals','practicePlans']) expect(initial[key]).toEqual(original[key]);
  await expect(goals(page)).toHaveCount(3);
  const checkbox = page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true});
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect.poll(async () => (await db(page)).dailyGoals.find(g => g.id==='g1').completed).toBe(true);
  const changed = await db(page);
  for (const key of ['lessons','assignments','practices','performances','practicePlans']) expect(changed[key]).toEqual(original[key]);
  // Wait for the real sync path so a stale fake server cannot undo a refresh.
  await expect.poll(() => page.evaluate(() => window.__homeServerRow()?.payload.dailyGoals.find(g => g.id==='g1')?.completed)).toBe(true);
  await page.reload();
  await ready(page);
  await expect(page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true})).toBeChecked();
  await expect(page.locator('.vz-home-gauge[role=img], .vz-home-gauge [role=img]')).toHaveAccessibleName(/2.*3.*67(?:%|퍼센트)|67(?:%|퍼센트).*2.*3/);
  await page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true}).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true})).not.toBeChecked();
});

test('actual persistence failure restores checkbox and db; retry succeeds', async ({page}) => {
  await boot(page);
  const original = await db(page);
  await page.evaluate(key => {
    const store = window.VzipAccountScope?.storage;
    window.__homePersistAttempts = 0;
    if (store) {
      const previous = store.setItem;
      store.setItem = function(k,v) {if (k===key) {window.__homePersistAttempts++;throw new DOMException('fixture quota','QuotaExceededError');}return previous.call(this,k,v);};
      window.__restoreHomeStorage = () => {store.setItem=previous;};
    } else {
      const previous = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) {if (k===key) {window.__homePersistAttempts++;throw new DOMException('fixture quota','QuotaExceededError');}return previous.call(this,k,v);};
      window.__restoreHomeStorage = () => {Storage.prototype.setItem=previous;};
    }
  },KEY);
  await page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.__homePersistAttempts)).toBeGreaterThan(0);
  await expect(page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true})).not.toBeChecked();
  expect(await db(page)).toEqual(original);
  await expect(page.getByText(/저장.*못|저장.*실패|다시.*시도/).first()).toBeVisible();
  await page.evaluate(() => window.__restoreHomeStorage());
  await page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'호흡을 길게 유지하기',exact:true})).toBeChecked();
});

test('900 goals keep one scroll list, order, and scroll position after a check', async ({page}, testInfo) => {
  const value = seed();
  value.dailyGoals = Array.from({length:900},(_,i) => ({id:'many-'+i,date:TODAY,title:'연습 목표 '+String(i).padStart(3,'0'),source:'personal',completed:false,order:i}));
  await boot(page,value);
  await expect(page.locator('.vz-goal-list')).toHaveCount(1);
  await expect(goals(page)).toHaveCount(900);
  const list = page.locator('.vz-goal-list');
  expect(await list.evaluate(el => el.scrollHeight>el.clientHeight && ['auto','scroll'].includes(getComputedStyle(el).overflowY))).toBe(true);
  await list.evaluate(el => {el.scrollTop=450;});
  const before = await list.evaluate(el => el.scrollTop);
  // Choose the input by its actual accessible name via the visible row's goal id/title.
  const visibleIndex = await list.evaluate(el => {
    const r=el.getBoundingClientRect();
    return [...el.querySelectorAll('.vz-goal-row')].findIndex(n => {const b=n.getBoundingClientRect();return b.top>=r.top+4&&b.bottom<=r.bottom-4;});
  });
  await goals(page).nth(visibleIndex).click();
  await expect(goals(page).nth(visibleIndex)).toBeChecked();
  expect(Math.abs(await list.evaluate(el=>el.scrollTop)-before)).toBeLessThanOrEqual(1);
  expect((await db(page)).dailyGoals.map(g=>g.id)).toEqual(value.dailyGoals.map(g=>g.id));
  await expect(page.locator('.vz-home-gauge[role=img], .vz-home-gauge [role=img]')).toHaveAccessibleName(/1.*900.*0(?:%|퍼센트)|0(?:%|퍼센트).*1.*900/);
  await screenshot(page,testInfo,'student-home-900-goals.png');
});

test('empty and missing optional data never save marketing examples', async ({page}) => {
  const value={categories:[],songs:[],lessons:[],assignments:[],practices:[],performances:[],comparisonReports:[]};
  await boot(page,value);
  await expect(page.locator('.vz-home-stage')).toHaveCount(0);
  await expect(page.locator('.vz-home-lesson')).toHaveCount(0);
  await expect(goals(page)).toHaveCount(0);
  await expect(page.locator('.vz-student-home')).toContainText(/목표.*없|목표.*설정/);
  expect((await db(page)).dailyGoals || []).toEqual([]);
  expect((await db(page)).practicePlans || []).toEqual([]);
  for (const key of ['songs','lessons','assignments','practices','performances']) expect((await db(page))[key]).toEqual([]);
  const writes=await page.evaluate(()=>window.__homeServerWrites);
  expect(writes.every(q=>['songs','lessons','assignments','practices','dailyGoals','practicePlans'].every(k=>!(q.body?.payload?.[k]||[]).length))).toBe(true);
});

test('today marker survives all practice percentage boundaries and future/unplanned states differ', async ({page}) => {
  await boot(page);
  const today=page.locator('.vz-week-day[data-date="'+TODAY+'"]');
  for (const [minutes,state] of [[0,'empty'],[99,'partial'],[100,'met'],[120,'met'],[121,'high']]) {
    await page.evaluate(({minutes,date}) => VZ.change(d => {
      d.practices=[{id:'boundary',date,minutes:999,manualMinutes:minutes,mediaSeconds:99999,mediaIds:['same-file'],songId:'s1'}];
      d.practicePlans=[{id:'day:'+date,period:'day',date,targetMinutes:100}];
    }),{minutes,date:TODAY});
    await expect(today).toHaveAttribute('data-state',state);
    await expect(today).toHaveAttribute('data-today','true');
    await expect(today).toContainText('오늘');
    await expect(today).toContainText(minutes+'분');
  }
  await expect(page.locator('.vz-week-day[data-date="2026-11-05"]')).toHaveAttribute('data-state','future');
  await page.evaluate(() => VZ.change(d => {d.practicePlans=[];}));
  await expect(today).toHaveAttribute('data-state','unplanned');
  await expect(today).toHaveAttribute('data-today','true');
  await expect(today).toHaveAttribute('aria-label',/목표 미설정/);
  await expect(today).toContainText('121분');
});

test('long Korean goals at twice the text size stay operable on every mobile width', async ({page},testInfo) => {
  const value=seed();
  const title='호흡과 발음의 연결을 느끼면서 긴 한국어 가사를 끝까지 천천히 읽고 다음 문장까지 자연스럽게 이어서 연습하기'.repeat(3);
  value.dailyGoals=[{id:'long',date:TODAY,title,source:'personal',completed:false,order:0}];
  await boot(page,value);
  // Increase actual rendered text rather than assuming the component uses rem units.
  await page.evaluate(() => {
    const nodes=[...document.querySelectorAll('.vz-student-home :is(p,span,strong,small,h1,h2,h3,label,a,button)')];
    const sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));
    nodes.forEach((node,i)=>{node.style.setProperty('font-size',sizes[i]*2+'px','important');});
  });
  for (const width of widths) {
    await page.setViewportSize({width,height:844});
    await noOverflow(page);
    const input=page.getByRole('checkbox',{name:title,exact:true});
    await expect(input).toBeEnabled();
    expect(Math.round((await page.locator('.vz-goal-row').boundingBox()).height)).toBeGreaterThanOrEqual(44);
    await screenshot(page,testInfo,'student-home-large-text-'+width+'.png');
  }
  await page.getByRole('checkbox',{name:title,exact:true}).check();
  await expect(page.getByRole('checkbox',{name:title,exact:true})).toBeChecked();
});

test('dock order, destinations, 44pt targets, and safe-area content clearance', async ({page}) => {
  await boot(page);
  const dock=page.locator('.v-nav.vz-home-dock');
  const links=dock.getByRole('link');
  await expect(links).toHaveText(['홈','내 곡','녹음','보관함','일정']);
  const routes=['home','songs','record','library','calendar'];
  for (let i=0;i<routes.length;i++) {
    await expect(links.nth(i)).toHaveAttribute('href','#/'+routes[i]);
    const box=await links.nth(i).boundingBox();
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => scrollTo(0,document.documentElement.scrollHeight));
  const clearance=await page.evaluate(() => {
    const content=document.querySelector('.vz-home-stack> :last-child').getBoundingClientRect();
    const dock=document.querySelector('.v-nav.vz-home-dock').getBoundingClientRect();
    return {contentBottom:content.bottom,dockTop:dock.top,padding:parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom)||0};
  });
  expect(clearance.contentBottom).toBeLessThanOrEqual(clearance.dockTop+1);
  for (const route of routes.slice(1)) {
    await page.goto('/#/home');await ready(page);
    await dock.locator('a[href="#/'+route+'"]').click();
    await expect(page).toHaveURL(new RegExp('#/'+route+'$'));
    await expect(page.locator('.vz-student-home')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/vz-home-mode/);
  }
});

test('actual stage, lesson, recent song and quick actions reach existing routes', async ({page}) => {
  await boot(page);
  await page.getByRole('button',{name:'무대 상세 보기',exact:true}).click();
  await expect(page).toHaveURL(/#\/show\/stage1$/);
  await page.goto('/#/home');await ready(page);
  await page.getByRole('button',{name:'다음 레슨 보기',exact:true}).click();
  await expect(page).toHaveURL(/#\/lesson\/l1$/);
  await page.goto('/#/home');await ready(page);
  await page.locator('.vz-home-song-detail').click();
  await expect(page).toHaveURL(/#\/song\/s1$/);
  await page.goto('/#/home');await ready(page);
  await page.locator('.vz-quick-actions').getByRole('button',{name:'레슨노트',exact:true}).click();
  await expect(page).toHaveURL(/#\/lessons$/);
  await page.goto('/#/home');await ready(page);
  await page.locator('.vz-quick-actions').getByRole('button',{name:'연습기록',exact:true}).click();
  await expect(page).toHaveURL(/#\/practices$/);
});

test('goal settings store only user entered plans and personal goals', async ({page}) => {
  await boot(page);
  await page.getByRole('button',{name:/오늘의 목표 설정 및 수정|목표.*설정/}).click();
  const sheet=page.getByRole('dialog',{name:'오늘의 목표',exact:true});
  await sheet.getByLabel('오늘 목표 시간(분)',{exact:true}).fill('45');
  await sheet.getByLabel('이번 주 목표 시간(분)',{exact:true}).fill('210');
  await sheet.getByLabel('개인 목표',{exact:true}).fill('새 개인 목표');
  await sheet.getByRole('button',{name:'목표 저장',exact:true}).click();
  const saved=await db(page);
  expect(saved.practicePlans.find(p=>p.id==='day:'+TODAY)?.targetMinutes).toBe(45);
  expect(saved.practicePlans.find(p=>p.id==='week:'+WEEK)?.targetMinutes).toBe(210);
  expect(saved.dailyGoals.some(g=>g.title==='새 개인 목표'&&g.source==='personal')).toBe(true);
  expect(saved.assignments).toEqual(seed().assignments);
  expect(saved.practices).toEqual(seed().practices);
});

test('recent recording uses the existing player and closing stops playback without changing practice time',async({page})=>{
 await boot(page);
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
 const before=await db(page);
 await page.getByRole('button',{name:'최근 곡 녹음 재생',exact:true}).click();
 await expect.poll(()=>page.locator('[data-home-player]').evaluate(host=>host._player?.el?.currentTime||0)).toBeGreaterThan(0);
 await page.evaluate(()=>{window.__homeAudio=document.querySelector('[data-home-player]')._player.el;});
 await page.getByRole('dialog',{name:'최근 연습 녹음',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();
 await expect(page.locator('[data-home-player]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__homeAudio.paused)).toBe(true);
 expect((await db(page)).practices).toEqual(before.practices);
});

test('record destination reaches the existing recorder and preserves plans and practice records',async({page})=>{
 await boot(page);
 const before=await db(page);
 await page.locator('.v-nav').getByRole('link',{name:'녹음',exact:true}).click();
 await expect(page).toHaveURL(/#\/record$/);
 await expect(page.locator('.vz-student-home')).toHaveCount(0);
 const after=await db(page);
 for(const key of ['dailyGoals','practicePlans','practices','lessons','assignments'])expect(after[key]).toEqual(before[key]);
});

test('compact summary uses actual practice time; long song and schedule names expand without hiding content',async({page},testInfo)=>{
 const value=seed(),songTitle='공백없는LongEnglishSongTitleAndKorean가사호흡프레이징을연결하는곡'.repeat(3);
 value.songs[0].title=songTitle;
 value.performances[0].title='뮤지컬 오디션 및 공연 리허설의 긴 제목을 모두 확인하는 일정 '.repeat(3);
 await boot(page,value);
 await expect(page.locator('.vz-home-week-metric strong')).toHaveText('30');
 await expect(page.locator('.vz-home-song-copy strong')).toHaveText(songTitle);
 await expect(page.locator('.vz-home-stage-title h3')).toHaveText(value.performances[0].title);
 for(const width of widths){
  await page.setViewportSize({width,height:844});await noOverflow(page);
  const contained=await page.locator('.vz-home-song').evaluate(card=>{
   const c=card.getBoundingClientRect(),name=card.querySelector('.vz-home-song-copy strong'),n=name.getBoundingClientRect();
   return {bottom:n.bottom,cardBottom:c.bottom,scroll:name.scrollHeight,height:name.clientHeight};
  });
  expect(contained.bottom+8).toBeLessThanOrEqual(contained.cardBottom);
  expect(contained.scroll).toBeLessThanOrEqual(contained.height+1);
  await screenshot(page,testInfo,'student-home-long-titles-'+width+'.png');
 }
});

test('large text keeps preview playback separate from full song details on all mobile widths',async({page},testInfo)=>{
 await page.goto('/design-system/student-home-preview.html');
 await expect(page.locator('.vz-student-home')).toBeVisible();
 await page.locator('.vz-home-song-copy strong').evaluate(el=>{el.textContent='긴 곡명과 LongEnglishTitle을 큰 글자로 확인하는 연습곡';});
 await page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('.vz-student-home :is(p,span,strong,small,h1,h2,h3,label,a,button)')];
  const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));
  nodes.forEach((n,i)=>n.style.setProperty('font-size',sizes[i]*2+'px','important'));
 });
 for(const width of widths){
  await page.setViewportSize({width,height:844});await noOverflow(page);
  const play=page.getByRole('button',{name:'최근 곡 녹음 재생',exact:true}),p=await play.boundingBox();
  const title=await page.locator('.vz-home-song-copy strong').boundingBox();
  expect(p.height).toBeGreaterThanOrEqual(44);expect(p.width).toBeGreaterThanOrEqual(44);
  expect(p.y+p.height).toBeLessThanOrEqual(title.y+1);
  await screenshot(page,testInfo,'student-home-preview-large-text-'+width+'.png');
 }
 await page.getByRole('button',{name:'최근 곡 녹음 재생',exact:true}).click();
 await expect(page.locator('.preview-status')).toContainText('재생');
});
