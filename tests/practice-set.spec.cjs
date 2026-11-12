// 오늘 연습 세트: home entry → editable set → timed steps on a fake clock → summary → records and goals.
// Fixture-only: no live Supabase, media or account writes.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const NOW = '2026-11-04T12:00:00.000Z';
const TODAY = '2026-11-04';
const seed = () => ({
  categories:[{id:'c-voice',name:'발성',items:['립트릴']}],
  songs:[{id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드'}],
  lessons:[],
  assignments:[{id:'a1', title:'호흡을 길게 유지하기', status:'active', startDate:'2026-11-01', dueDate:'2026-11-08'}],
  practices:[{id:'p1', date:TODAY, minutes:30, manualMinutes:30, mediaSeconds:3600, mediaIds:['file1'], songId:'s1', practiceMode:'song', memo:'원본 연습 보존'}],
  performances:[], comparisonReports:[],
  dailyGoals:[
    {id:'g1', date:TODAY, title:'호흡을 길게 유지하기', source:'homework', sourceId:'a1', completed:false, order:0},
    {id:'g2', date:TODAY, title:'곡의 가사를 천천히 읽기', source:'personal', completed:true, order:1},
    {id:'g3', date:TODAY, title:'후렴 연결 연습하기', source:'personal', completed:false, order:2}
  ],
  practicePlans:[{id:'day:'+TODAY, period:'day', date:TODAY, targetMinutes:30}]
});
function installSDK() {
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const row = () => JSON.parse(sessionStorage.getItem('pset-server-row') || 'null');
  const client = {
    auth:{
      getUser:async () => ({data:{user:{id:'home-qa-user',email:'home@example.invalid',user_metadata:{name:'김유리'}}},error:null}),
      getSession:async () => ({data:{session:{access_token:'fixture-token'}}}),
      onAuthStateChange:() => ({data:{subscription:{unsubscribe(){}}}})
    },
    storage:{from:() => ({createSignedUrl:async () => ({data:{signedUrl:'/fixture.wav'},error:null})})},
    async rpc(){return {data:null,error:null};},
    from(table) {
      const q = {method:'read',filters:{},single:false}, chain = {};
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
        if (q.method === 'update' && (!current || q.filters.updated_at !== current.updated_at)) return {data:[],error:null};
        if ((q.method === 'upsert' || q.method === 'insert') && current && q.options?.ignoreDuplicates) return {data:[],error:null};
        sessionStorage.setItem('pset-server-row',JSON.stringify({payload:q.body.payload,updated_at:q.body.updated_at}));
        return {data:[{user_id:'home-qa-user'}],error:null};
      }).then(resolve,reject);
      return chain;
    }
  };
  window.supabase = {createClient:() => client};
}
async function boot(page, value = seed()) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.clock.install({time:new Date(NOW)});
  await page.addInitScript(({key,value}) => {
    if (!sessionStorage.getItem('pset-seeded')) {
      localStorage.setItem(key,JSON.stringify(value));
      sessionStorage.setItem('pset-server-row',JSON.stringify({payload:value,updated_at:'2026-11-04T11:00:00.000Z'}));
      sessionStorage.setItem('pset-seeded','1');
    }
  }, {key:KEY,value});
  await page.route('**/supabase.min.js', route => route.fulfill({contentType:'application/javascript',body:'('+installSDK.toString()+')();'}));
  await page.route('**/r2-config.js*', route => route.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', route => route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('/#/home');
  await ready(page);
}
async function ready(page) {
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && typeof window.VZ?.change === 'function')).toBe(true);
  await expect(page.locator('.vz-student-home')).toBeVisible();
}
const db = page => page.evaluate(() => JSON.parse(JSON.stringify(VZ.db)));
const entry = page => page.locator('.vz-pset-entry');
const rows = page => page.locator('.pset-plan .pset-row');
async function noOverflow(page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth,document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
}
async function targets(page, selector) {
  for (const el of await page.locator(selector).all()) {
    if (!await el.isVisible()) continue;
    const b = await el.boundingBox();
    expect(b.height, selector).toBeGreaterThanOrEqual(44);expect(b.width, selector).toBeGreaterThanOrEqual(44);
  }
}
/** Advance the fake clock second by second so the step timer ticks like on a phone. */
const elapse = (page, seconds) => page.clock.runFor(seconds * 1000);
test.afterEach(async({page}) => expect(page.__errors || []).toEqual([]));

test('one tap from home opens today\'s set; edit, run steps on a clock, save records and goals', async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  const before = await db(page);
  await expect(entry(page)).toBeVisible();
  await expect(entry(page)).toContainText('오늘 연습 시작');
  await expect(entry(page)).toContainText('5단계');
  expect((await entry(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  // Reading home writes nothing.
  expect((await db(page)).practicePlans).toEqual(before.practicePlans);
  await entry(page).click();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).locator('strong')).toHaveText(['립트릴','호흡을 길게 유지하기','후렴 연결 연습하기','This Is the Moment','This Is the Moment']);
  await expect(rows(page).locator('small')).toHaveText(['웜업','숙제','개인','곡 구간','녹음 · 선택']);
  await targets(page, '.pset-plan button, .pset-min input');
  for (const width of [320, 390, 430]) {await page.setViewportSize({width,height:844});await noOverflow(page);}
  // Edit: shorter warm-up, no recording this time, reorder the two goals, remember as 기본 세트.
  await page.getByLabel('웜업 · 립트릴 시간(분)').fill('2');await page.getByLabel('웜업 · 립트릴 시간(분)').blur();
  await page.getByRole('button',{name:'녹음 · This Is the Moment 빼기'}).click();
  await page.getByRole('button',{name:'순서 바꾸기'}).click();
  await page.getByRole('button',{name:'후렴 연결 연습하기 위로'}).click();
  await page.getByRole('button',{name:'순서 완료'}).click();
  await expect(rows(page).locator('strong')).toHaveText(['립트릴','후렴 연결 연습하기','호흡을 길게 유지하기','This Is the Moment']);
  await expect(page.getByRole('radio',{name:'기본 세트'})).toBeChecked(); // nothing saved yet: the 기본 세트 is remembered
  await page.getByRole('radio',{name:'수요일 세트'}).check();await page.getByRole('radio',{name:'기본 세트'}).check();
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  const run = page.locator('[data-pset-run]');
  await expect(run.locator('#pset-step-title')).toHaveText('립트릴');
  await expect(run.locator('[data-clock]')).toHaveText('2:00');
  await targets(page, '[data-pset-run] button');
  await noOverflow(page);
  await elapse(page, 150); // 2:30 on a 2-minute step: overtime is shown and still counted
  await expect(run.locator('[data-clock]')).toHaveText('+0:30');
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await expect(run.locator('#pset-step-title')).toHaveText('후렴 연결 연습하기');
  await elapse(page, 60);
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await elapse(page, 180);
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await expect(run.locator('#pset-step-title')).toHaveText('This Is the Moment');await expect(run.locator('.pset-kicker')).toHaveText('곡 구간');
  await elapse(page, 120);
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await elapse(page, 300); // paused: not counted
  await page.getByRole('button',{name:'계속',exact:true}).click();
  await elapse(page, 180);
  await page.getByRole('button',{name:'마치기',exact:true}).click();
  // Summary: minutes from real running time only; the singer can edit them.
  const summary = page.locator('.pset-summary');
  expect(await summary.locator('[data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['3','1','3','5']);
  await page.getByLabel('후렴 연결 연습하기 연습한 시간(분)').fill('2');
  await expect(summary.locator('[data-sum]')).toHaveText('13분');
  await noOverflow(page);
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.getByRole('heading',{name:'오늘 연습을 기록했어요'})).toBeVisible();
  await expect(page.locator('.pset-done')).toContainText('연습 13분 · 목표 2개 체크');
  const after = await db(page);
  const set = after.practices.filter(p => p.practiceSetId);
  expect(set.map(p => [p.id.replace(/practice-set:[^:]+:/,'set:'),p.minutes]).sort()).toEqual([['goal:g1',3],['goal:g3',2],['set:song-s1',5],['set:warmup',3]]);
  const warm = after.practices.find(p => p.id.endsWith(':warmup'));
  expect(warm).toEqual(expect.objectContaining({practiceMode:'training',categoryId:'c-voice',practiceTimeSource:'practice-set',manualMinutes:3}));
  expect(after.practices.find(p => p.id.endsWith(':song-s1'))).toEqual(expect.objectContaining({practiceMode:'song',songId:'s1'}));
  expect(after.practices.find(p => p.id === 'goal:g1')).toEqual(expect.objectContaining({completed:['a1'],assignmentReps:{a1:1},practiceTimeSource:'goal'}));
  expect(after.dailyGoals.filter(g => g.completed).map(g => g.id).sort()).toEqual(['g1','g2','g3']);
  expect(after.assignments.find(t => t.id === 'a1').status).toBe('active'); // homework linked, never completed
  expect(after.practices.find(p => p.id === 'p1')).toEqual(before.practices.find(p => p.id === 'p1'));
  const template = after.practicePlans.find(p => p.id === 'practice-set-template:default');
  expect(template).toEqual(expect.objectContaining({kind:'practice-set-template',removed:['record']}));
  expect(template.order).toEqual(['warmup','goal','song']);
  // Home: actual time includes the set once; the entry offers the remembered set for what is left today.
  await page.clock.resume();
  await page.getByRole('link',{name:'홈으로'}).click();await ready(page);
  await expect(entry(page)).toContainText('2단계');
  await page.locator('.vz-summary-row[data-row=week]').waitFor();
  await expect(page.locator('.vz-summary-row[data-row=week]')).toContainText('43분');
});

test('a running set survives a reload paused, without counting the time away, and the recorder trip keeps its clock', async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 90);
  await page.reload();
  await page.clock.resume();
  // The reloaded set screen shows the step paused; home offers to resume it.
  await expect(page.getByRole('button',{name:'계속',exact:true})).toBeVisible();
  await page.goto('/#/home');
  await ready(page);
  await expect(entry(page)).toContainText('연습 세트 이어서 하기');
  await expect(entry(page)).toContainText('1/5');
  await page.clock.pauseAt(new Date('2026-11-04T12:30:00.000Z')); // the app was reloaded and left idle: not practice time
  await entry(page).click();
  const run = page.locator('[data-pset-run]');
  await expect(page.getByRole('button',{name:'계속',exact:true})).toBeVisible();
  await expect(run.locator('[data-clock]')).toHaveText('3:30');
  await page.getByRole('button',{name:'계속',exact:true}).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button',{name:'다음',exact:true}).click();
  await expect(run.locator('.pset-kicker')).toHaveText('녹음 · 선택');
  await expect(page.getByText('녹음 길이는 연습 시간에 더하지 않아요.')).toBeVisible();
  await page.getByRole('button',{name:'녹음하기'}).click();
  await expect(page).toHaveURL(/#\/record\?song=s1$/);
  await expect(page.locator('[data-song-name]')).toHaveText('This Is the Moment');
  await elapse(page, 60);
  await page.goBack();
  await expect(run.locator('.pset-kicker')).toHaveText('녹음 · 선택');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'마치기',exact:true}).click();
  const values = await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value));
  expect(values).toEqual(['2','0','0','0','1']);
  // Leaving the summary keeps it; discarding writes nothing.
  const before = await db(page);
  await page.getByRole('button',{name:'저장하지 않고 끝내기'}).click();
  await page.getByRole('button',{name:'끝내기',exact:true}).click();
  await ready(page);
  await expect(entry(page)).toContainText('오늘 연습 시작');
  const after = await db(page);
  for (const key of ['practices','dailyGoals','assignments','practicePlans']) expect(after[key]).toEqual(before[key]);
});

test('a song section added before starting is remembered for the weekday and comes back next time', async({page}) => {
  await page.setViewportSize({width:320,height:700});
  await boot(page);
  await entry(page).click();
  await page.getByRole('button',{name:'항목 추가'}).click();
  const sheet = page.locator('.pset-song-form');
  await sheet.getByLabel('구간 시작 (분:초)').fill('1:10');
  await sheet.getByLabel('구간 끝 (분:초)').fill('0:30');
  await page.getByRole('button',{name:'곡 구간 넣기'}).click();
  await expect(sheet.locator('[data-song-error]')).toContainText('끝이 시작보다 뒤');
  await sheet.getByLabel('구간 시작 (분:초)').fill('0:30');
  await sheet.getByLabel('구간 끝 (분:초)').fill('1:10');
  await sheet.getByLabel('곡 구간 시간(분)').fill('4');
  await noOverflow(page);
  await page.getByRole('button',{name:'곡 구간 넣기'}).click();
  await expect(rows(page)).toHaveCount(6);
  await expect(rows(page).nth(4)).toContainText('This Is the Moment 0:30–1:10');
  await expect(rows(page).nth(4)).toContainText('구간 0:30–1:10');
  await expect(rows(page).nth(5)).toContainText('녹음');
  await page.getByRole('radio',{name:'수요일 세트'}).check();
  await page.getByRole('button',{name:'시작하기'}).click();
  const template = (await db(page)).practicePlans.find(p => p.id === 'practice-set-template:w3');
  expect(template.added).toEqual([{songId:'s1',minutes:4,segmentStart:30,segmentEnd:70}]);
  // Discard this run; the remembered Wednesday set offers the section again.
  await page.getByRole('button',{name:'여기까지 하고 기록하기'}).click();
  await page.getByRole('button',{name:'저장하지 않고 끝내기'}).click();
  await page.getByRole('button',{name:'끝내기',exact:true}).click();
  await ready(page);
  await expect(entry(page)).toContainText('6단계');
  await entry(page).click();
  await expect(rows(page).nth(4)).toContainText('구간 0:30–1:10');
  await expect(page.getByRole('radio',{name:'수요일 세트'})).toBeChecked();
});
