// 주간 요약: fixture-only browser QA. No live Supabase, media, or account writes.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const NOW = '2026-11-16T03:00:00.000Z'; // Monday 12:00 in Korea: last week (11/9–11/15) has just ended
test.use({timezoneId:'Asia/Seoul',locale:'ko-KR'});
const kst = (date,time) => Date.parse(date+'T'+time+'+09:00');
const v2 = into => ({v:2,at:kst('2026-11-12','21:00'),metrics:{voicedSeconds:40,intonation:{meanAbsCents:into,within20:80,notes:30},stability:{wobbleCents:8,notes:12},
  range:{stableHigh:{note:'A5',cents:8100},instantaneous:{note:'C7',cents:9600},main:{lowCents:6000,highCents:7400}},breath:{phrases:5,medianPhrase:3}},confidence:{pitchConfidence:.95,voiceOverMrDb:12}});
const seed = () => ({
  categories:[],comparisonReports:[],performances:[],
  songs:[{id:'s1',title:'This Is the Moment',created:kst('2026-10-01','10:00')},{id:'s2',title:'새로 받은 곡',created:kst('2026-11-11','20:00')}],
  lessons:[{id:'l1',date:'2026-11-11',startTime:'19:00',status:'done',songIds:['s1'],feedback:'턱 힘을 빼고 후렴 첫 음을 미리 준비하기'}],
  assignments:[{id:'a1',lessonIds:['l1'],lessonId:'l1',title:'후렴 호흡 5회',status:'active',created:kst('2026-11-11','21:00')}],
  practices:[
    {id:'p1',date:'2026-11-09',songId:'s1',minutes:30,mediaSeconds:5400},
    {id:'p2',date:'2026-11-10',songId:'s1',manualMinutes:20,minutes:90,completed:['a1'],assignmentReps:{a1:3}},
    {id:'p3',date:'2026-11-12',practiceMode:'training',minutes:10},
    {id:'p4',date:'2026-11-03',songId:'s1',minutes:15}
  ],
  dailyGoals:[{id:'g1',date:'2026-11-10',title:'후렴 연결',source:'personal',completed:true,order:0},{id:'g2',date:'2026-11-11',title:'가사 읽기',source:'personal',completed:false,order:0}],
  practicePlans:[{id:'week:2026-11-09',period:'week',date:'2026-11-09',targetMinutes:120}]
});
const recordings = [
  {id:'r1',name:'take 1',songId:'s1',recordingCategory:'song',created:kst('2026-11-01','20:00'),durationSeconds:200,analysis:v2(20)},
  {id:'r2',name:'take 2',songId:'s1',recordingCategory:'song',created:kst('2026-11-12','20:00'),durationSeconds:200,analysis:v2(10)},
  {id:'r3',name:'lesson',recordingCategory:'lesson',created:kst('2026-11-11','19:30'),durationSeconds:3000},
  {id:'r4',name:'sunday night',recordingCategory:'training',created:kst('2026-11-15','23:40'),durationSeconds:60},
  {id:'r5',name:'monday',recordingCategory:'song',created:kst('2026-11-16','00:20'),durationSeconds:60}
];

function installSDK() {
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  window.__serverWrites = [];
  const row = () => JSON.parse(sessionStorage.getItem('ws-server-row') || 'null');
  const client = {
    auth:{
      getUser:async () => ({data:{user:{id:'ws-qa-user',email:'ws@example.invalid',user_metadata:{}}},error:null}),
      getSession:async () => ({data:{session:{access_token:'fixture-token'}}}),
      onAuthStateChange:() => ({data:{subscription:{unsubscribe(){}}}})
    },
    storage:{from:() => ({createSignedUrl:async () => ({data:{signedUrl:'/fixture.wav'},error:null})})},
    async rpc(){return {data:null,error:null};},
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
        window.__serverWrites.push(clone(q));
        if (q.method === 'update' && (!current || q.filters.updated_at !== current.updated_at)) return {data:[],error:null};
        sessionStorage.setItem('ws-server-row',JSON.stringify({payload:q.body.payload,updated_at:q.body.updated_at}));
        return {data:[{user_id:'ws-qa-user'}],error:null};
      }).then(resolve,reject);
      return chain;
    }
  };
  window.supabase = {createClient:() => client};
}
async function boot(page,{value=seed(),media=recordings,hash='#/home'}={}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.addInitScript(({key,value,now}) => {
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) {super(...(args.length ? args : [now]));}
      static now() {return new NativeDate(now).getTime();}
    };
    if (!sessionStorage.getItem('ws-seeded')) {
      localStorage.setItem(key,JSON.stringify(value));
      sessionStorage.setItem('ws-server-row',JSON.stringify({payload:value,updated_at:'2026-11-16T02:00:00.000Z'}));
      sessionStorage.setItem('ws-seeded','1');
    }
  }, {key:KEY,value,now:NOW});
  await page.route('**/supabase.min.js', route => route.fulfill({contentType:'application/javascript',body:'('+installSDK.toString()+')();'}));
  await page.route('**/r2-config.js*', route => route.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', route => route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('/#/songs');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('vzip_cloud_linked_user'))).toBe('ws-qa-user');
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && !!window.VzipWeeklySummary)).toBe(true);
  // Synthetic recordings stand in for the library (IndexedDB/cloud are covered by their own suites).
  await page.evaluate(media => {const M=VZ.media;M.list=async()=>media;M.cached=()=>media;}, media);
  await page.evaluate(h => {location.hash=h;}, hash);
}
const summary = page => page.locator('[data-weekly-summary]');
async function noOverflow(page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth,document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('home shows 지난주 요약 on Monday and opens the seeded week; reading it writes nothing',async({page})=>{
  await boot(page);
  const row = page.locator('.vz-summary-row[data-row=weekly]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('지난주 요약');
  await expect(row).toContainText('연습 1시간 · 3일');
  const before = await page.evaluate(() => ({db:JSON.stringify(VZ.db),writes:window.__serverWrites.length}));
  await row.click();
  await expect(page).toHaveURL(/#\/weekly-summary\?week=2026-11-09/);
  const s = summary(page);
  await expect(s.locator('[data-ws-range]')).toHaveText('2026년 11월 9일 – 15일');
  await expect(s.locator('.ws-week-label small')).toHaveText('지난주');
  await expect(s.locator('[data-ws-minutes]')).toHaveText('1시간');               // 30 + 20 + 10: never recording length
  await expect(s.locator('[data-ws-days]')).toContainText('3');
  await expect(s.locator('.ws-compare')).toContainText('지난주보다 +45분');
  await expect(s.locator('.ws-compare')).toContainText('주간 목표 2시간의 50%');
  await expect(s.locator('.ws-top li').first()).toContainText('This Is the Moment');
  await expect(s.locator('[data-ws-section=goals]')).toContainText('1/2개 완료');
  await expect(s.locator('[data-ws-section=goals]')).toContainText('후렴 호흡 5회');
  const rec = s.locator('[data-ws-section=recordings]');
  await expect(rec.locator('.ws-chips li')).toHaveText(['곡1','레슨1','트레이닝1','연습실0']);   // Sunday 23:40 KST in, Monday 00:20 out
  await expect(rec).toContainText('새로 받은 곡');
  const growth = s.locator('[data-ws-section=growth]');
  await expect(growth.locator('.ws-growth')).toHaveCount(1);
  await expect(growth).toContainText('음정 정확도 · 좋아진 방향');
  await expect(growth).not.toContainText('최고음 A5');
  await expect(s.locator('[data-ws-section=lessons]')).toContainText('턱 힘을 빼고');
  await expect(s.locator('[data-ws-section=lessons]')).toContainText('후렴 호흡 5회');
  await expect(s.locator('[data-ws-section=voice-check]')).toHaveCount(0);
  await expect(s.locator('[data-ws-section=practice-set]')).toHaveCount(0);
  const after = await page.evaluate(() => ({db:JSON.stringify(VZ.db),writes:window.__serverWrites.length}));
  expect(after).toEqual(before);
  // Opened once: the home row steps aside.
  await page.evaluate(() => {location.hash='#/home';});
  await expect(page.locator('.vz-summary')).toBeVisible();
  await expect(page.locator('.vz-summary-row[data-row=weekly]')).toHaveCount(0);
});

test('previous / next week, empty week and the 성장 tab entry',async({page})=>{
  await boot(page,{hash:'#/vocal-growth'});
  await page.locator('.growth-weekly-tab').click();
  const s = summary(page);
  await expect(s.locator('[data-ws-range]')).toHaveText('2026년 11월 16일 – 22일');
  await expect(s.locator('.ws-week-label small')).toHaveText('이번 주');
  await expect(s.locator('[data-ws-move="1"]')).toBeDisabled();
  await s.locator('[data-ws-move="-1"]').click();
  await expect(s.locator('[data-ws-range]')).toHaveText('2026년 11월 9일 – 15일');
  await expect(page).toHaveURL(/week=2026-11-09/);
  await s.locator('[data-ws-move="-1"]').click();
  await expect(s.locator('[data-ws-range]')).toHaveText('2026년 11월 2일 – 8일');
  await expect(s.locator('[data-ws-minutes]')).toHaveText('15분');
  await s.locator('[data-ws-move="-1"]').click();
  await expect(s.locator('[data-ws-range]')).toHaveText('2026년 10월 26일 – 11월 1일');
  await expect(s.locator('[data-ws-move="-1"]')).toBeDisabled();       // first week with a record
  await s.locator('[data-ws-move="1"]').click();
  await s.locator('[data-ws-move="1"]').click();
  await s.locator('[data-ws-move="1"]').click();
  await expect(s.locator('[data-ws-range]')).toHaveText('2026년 11월 16일 – 22일');
  // The current week has one Monday recording only → not empty; a week with nothing is shown as empty.
  await page.evaluate(() => {location.hash='#/weekly-summary?week=2026-10-26';});
  await expect(s.locator('[data-ws-range]')).toHaveText('2026년 10월 26일 – 11월 1일');
  await expect(s.locator('[data-ws-section=recordings] .ws-chips li').first()).toHaveText('곡1');
  await page.locator('.ws-tabs [data-ws-tab="#/vocal-growth?mode=monthly"]').click();
  await expect(page.locator('[data-growth-mode=monthly]')).toHaveAttribute('aria-pressed','true');
});

test('empty account week renders an empty state without errors',async({page})=>{
  await boot(page,{value:{...seed(),practices:[],dailyGoals:[],lessons:[],assignments:[],songs:[{id:'s1',title:'A',created:kst('2026-01-01','10:00')}]},media:[],hash:'#/weekly-summary'});
  const s = summary(page);
  await expect(s.locator('[data-ws-empty]')).toBeVisible();
  await expect(s.locator('[data-ws-move="-1"]')).toBeDisabled();
  await expect(s.locator('[data-ws-image]')).toHaveCount(0);
});

test('320px: no horizontal overflow and 44px controls',async({page})=>{
  await page.setViewportSize({width:320,height:740});
  await boot(page,{hash:'#/weekly-summary?week=2026-11-09'});
  await expect(summary(page).locator('[data-ws-minutes]')).toHaveText('1시간');
  await noOverflow(page);
  for (const selector of ['[data-ws-move="-1"]','[data-ws-move="1"]','[data-ws-image]','[data-ws-copy]','.ws-tabs button']) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box.height, selector).toBeGreaterThanOrEqual(44);
    expect(box.width, selector).toBeGreaterThanOrEqual(44);
  }
  for (const card of await page.locator('.ws-card').all()) {
    const box = await card.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
  }
});

test('image and text export work offline and make no network request',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','clipboard permission is Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await boot(page,{hash:'#/weekly-summary?week=2026-11-09'});
  const s = summary(page);
  await expect(s.locator('[data-ws-minutes]')).toHaveText('1시간');
  const requests = [];
  page.on('request', r => { if (!r.url().startsWith('blob:') && !r.url().startsWith('data:')) requests.push(r.method()+' '+r.url()); });
  const writes = await page.evaluate(() => window.__serverWrites.length);
  await context.setOffline(true);
  const [download] = await Promise.all([page.waitForEvent('download'), s.locator('[data-ws-image]').click()]);
  expect(download.suggestedFilename()).toBe('vocalzip-weekly-2026-11-09.png');
  const file = await download.path();
  const bytes = require('node:fs').readFileSync(file);
  expect(bytes.subarray(1,4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(5000);
  await expect(s.locator('[data-ws-share-state]')).toHaveText('이미지를 저장했어요.');
  await s.locator('[data-ws-copy]').click();
  await expect(s.locator('[data-ws-share-state]')).toHaveText('요약을 복사했어요.');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('VOCAL.zip 주간 요약');
  expect(text).toContain('연습 시간 1시간 · 연습한 날 3/7일');
  expect(text).toContain('[성장]');
  expect(text).toContain('This Is the Moment: 음정 정확도 좋아진 방향');
  await context.setOffline(false);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => window.__serverWrites.length)).toBe(writes);
});

test('optional voice check and practice-set sections appear only with their data',async({page})=>{
  const value = seed();
  value.practices.push({id:'p5',date:'2026-11-13',songId:'s1',minutes:12,practiceSet:{sessionId:'set-1'}});
  const media = recordings.concat([{id:'vc1',name:'check',recordingCategory:'training',voiceCheck:true,created:kst('2026-11-13','08:00'),durationSeconds:30}]);
  await boot(page,{value,media,hash:'#/songs'});
  await page.evaluate(() => {VZ.voiceCheck={weeklyLines:items=>['체크 '+items.length+'번 · 측정 참고값']};location.hash='#/weekly-summary?week=2026-11-09';});
  const s = summary(page);
  await expect(s.locator('[data-ws-section=voice-check]')).toContainText('1일 · 1번');
  await expect(s.locator('[data-ws-section=voice-check]')).toContainText('체크 1번 · 측정 참고값');
  await expect(s.locator('[data-ws-section=practice-set]')).toContainText('1세트 · 1일');
  await expect(s.locator('[data-ws-minutes]')).toHaveText('1시간 12분');   // set minutes counted once
});
