// 오늘 연습 세트: home entry → editable set → timed steps on a fake clock → summary → records and goals;
// the wall-clock timer (other apps, reload, long gaps) and the small timer on other screens.
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
const pill = page => page.locator('.pset-mini');
/** Another app or a locked phone: the page is hidden and gets no timer ticks while the clock moves on, then comes back. */
async function away(page, seconds) {
  const show = hidden => page.evaluate(hidden => {
    Object.defineProperty(document,'hidden',{configurable:true,get:() => hidden});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:() => hidden ? 'hidden' : 'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await show(true);
  await page.clock.fastForward(seconds * 1000);
  await show(false);
}
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
  // With the page clock stopped on a paused set, WebKit sometimes never delivers the animation frames Playwright's
  // click waits for ("visible, enabled and stable" hangs; Chromium is fine, and a do-nothing timer did not help
  // reliably). The button is checked to be there and enabled, then pressed without that wait.
  const resume = page.getByRole('button',{name:'계속',exact:true});
  await expect(resume).toBeVisible();await expect(resume).toBeEnabled();
  await resume.dispatchEvent('click');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
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

test('the timer follows the clock: another app and a reload count the real time once, pause stops it, the trip to the recorder keeps it', async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  const before = await db(page);
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  const run = page.locator('[data-pset-run]');
  await elapse(page, 60);
  await expect(run.locator('[data-clock]')).toHaveText('4:00');
  // Another app (or a locked phone) for 90 seconds: the page gets no timer ticks, the time still counts on return.
  await away(page, 90);
  await expect(run.locator('[data-clock]')).toHaveText('2:30');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible(); // leaving never pauses
  await expect(run.locator('[data-over-note]')).toHaveCount(0);
  // The pause button stops it, also while away.
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await elapse(page, 120);
  await away(page, 180);
  await expect(run.locator('[data-clock]')).toHaveText('2:30');
  await page.getByRole('button',{name:'계속',exact:true}).click(); // 12:17:30
  // Reload while running: still running, and the time since is counted once.
  await page.reload();
  await page.clock.resume();
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-04T12:22:30.000Z')); // 60 + 90 + 300 s on a five-minute step
  await expect(run.locator('[data-clock]')).toHaveText('+2:30');
  await expect(run.locator('[data-clock-sub]')).toHaveText('목표 5분 지남 · 연습 7:30');
  await page.goto('/#/home');
  await ready(page);
  await expect(entry(page)).toContainText('연습 세트 이어서 하기');
  await expect(entry(page)).toContainText('1/5');
  await entry(page).click();
  await expect(run.locator('[data-clock]')).toHaveText('+2:30'); // the visit to home neither paused nor double counted
  // The planned time runs out while away: said plainly, the step stays, nothing is saved by itself.
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await expect(run.locator('#pset-step-title')).toHaveText('호흡을 길게 유지하기');
  await away(page, 360);
  await expect(run.locator('[data-over-note]')).toContainText('다른 곳에 있는 동안 계획한 5분이 지났어요');
  await expect(run.locator('[data-clock]')).toHaveText('+1:00');
  await expect(run.locator('.pset-progress span')).toHaveText('2 / 5');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
  for (const key of ['practices','dailyGoals','assignments']) expect((await db(page))[key]).toEqual(before[key]);
  for (let i = 0; i < 3; i++) await page.getByRole('button',{name:'다음',exact:true}).click();
  await expect(run.locator('[data-over-note]')).toHaveCount(0);
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
  // Wall-clock time minus the pause: 450 s, 360 s and the minute at the recorder.
  const values = await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value));
  expect(values).toEqual(['8','6','0','0','1']);
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.locator('.pset-done')).toContainText('연습 15분 · 목표 2개 체크');
  const total = list => list.filter(p => p.practiceSetId).reduce((n,p) => n + p.minutes,0);
  expect(total((await db(page)).practices)).toBe(15);
  // Saved once: a reload brings back neither the set nor more minutes.
  await page.clock.resume();
  await page.getByRole('link',{name:'홈으로'}).click();
  await ready(page);
  await page.reload();
  await ready(page);
  await expect(entry(page)).toContainText('오늘 연습 시작');
  await expect(pill(page)).toBeHidden();
  expect(total((await db(page)).practices)).toBe(15);
});

test('leaving the summary keeps it; discarding writes nothing', async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 90);
  await page.getByRole('button',{name:'여기까지 하고 기록하기'}).click();
  await page.clock.resume();
  await page.goto('/#/home');
  await ready(page);
  await expect(entry(page)).toContainText('연습 세트 기록 저장하기');
  await expect(pill(page)).toBeHidden(); // the set has ended: no small timer
  await entry(page).click();
  await expect(page.locator('.pset-summary [data-min]').first()).toHaveValue('2');
  const before = await db(page);
  await page.getByRole('button',{name:'저장하지 않고 끝내기'}).click();
  await page.getByRole('button',{name:'끝내기',exact:true}).click();
  await ready(page);
  await expect(entry(page)).toContainText('오늘 연습 시작');
  await expect(pill(page)).toBeHidden();
  const after = await db(page);
  for (const key of ['practices','dailyGoals','assignments','practicePlans']) expect(after[key]).toEqual(before[key]);
});

test('away for more than three hours: the set asks how to count it, and counts nothing by itself', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page);
  const before = await db(page);
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T13:00:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 120);
  await away(page, 4 * 3600 + 600);
  const ask = page.locator('[data-pset-away]');
  await expect(ask.getByRole('heading',{name:'오래 자리를 비웠어요'})).toBeVisible();
  await expect(ask).toContainText('‘립트릴’ 타이머를 켜 둔 채 4시간 10분이 지났어요');
  await expect(ask.locator('[data-away]')).toHaveText([/계획한 시간까지만 세기.*계획한 5분까지 3분만 더해요/,/지금까지 모두 세기.*4시간 10분을 모두 더해요/,/세지 않기/]);
  await targets(page, '[data-pset-away] button');
  await noOverflow(page);
  for (const key of ['practices','dailyGoals']) expect((await db(page))[key]).toEqual(before[key]);
  // The question waits: more time, a reload and other screens change nothing, and the small timer points back to it.
  await page.reload();
  await page.clock.resume();
  await expect(ask.locator('[data-away]')).toHaveCount(3);
  await page.goto('/#/home');
  await ready(page);
  await expect(pill(page)).toContainText('오래 자리를 비웠어요');
  await expect(pill(page).locator('[data-toggle]')).toBeHidden();
  await pill(page).locator('[data-open]').click();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await page.clock.pauseAt(new Date('2026-11-04T18:00:00.000Z'));
  await ask.locator('[data-away=planned]').click();
  const run = page.locator('[data-pset-run]');
  await expect(run.locator('[data-clock]')).toHaveText('0:00');
  await expect(page.getByRole('button',{name:'계속',exact:true})).toBeVisible(); // stopped until the singer goes on
  await elapse(page, 30);
  await expect(run.locator('[data-clock]')).toHaveText('0:00');
  await page.getByRole('button',{name:'계속',exact:true}).click();
  await elapse(page, 60);
  await page.getByRole('button',{name:'여기까지 하고 기록하기'}).click();
  expect(await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['6','0','0','0','0']);
  for (const key of ['practices','dailyGoals']) expect((await db(page))[key]).toEqual(before[key]);
});

test('a set that comes back on another day is closed under its own day', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page);
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T23:30:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 60);
  await page.evaluate(() => {location.hash = '#/songs';});
  await expect(pill(page)).toBeVisible();
  await away(page, 45 * 60); // back at 00:16 the next day
  await expect(pill(page)).toBeHidden();
  await page.evaluate(() => {location.hash = '#/practice-set';});
  await expect(page.locator('.pset-summary .pset-help')).toContainText('연습이에요');
  expect(await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['46','0','0','0','0']);
  expect((await db(page)).practices.some(p => p.practiceSetId)).toBe(false);
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.locator('.pset-done')).toContainText('연습 46분');
  expect((await db(page)).practices.filter(p => p.practiceSetId).map(p => [p.date,p.minutes])).toEqual([[TODAY,46]]);
});

test('a set paused on another day shows no small timer and is closed when it is opened', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page);
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 120);
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.evaluate(() => {location.hash = '#/songs';});
  await expect(pill(page)).toBeVisible();
  await expect(pill(page).locator('[data-toggle]')).toHaveAccessibleName('연습 세트 계속');
  await page.clock.pauseAt(new Date('2026-11-06T09:00:00.000Z'));
  await page.evaluate(() => {location.hash = '#/library';});
  await expect(page.locator('body')).toHaveAttribute('data-vz-route','library');
  await expect(pill(page)).toBeHidden();
  await page.evaluate(() => {location.hash = '#/practice-set';});
  await expect(page.locator('.pset-summary .pset-help')).toContainText('연습이에요');
  expect(await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['2','0','0','0','0']);
  expect((await db(page)).practices.some(p => p.practiceSetId)).toBe(false);
});

for (const [width,height] of [[375,812],[320,640]]) test('small timer on other screens at ' + width + 'px: shows the step and time, pauses and resumes, returns to the set, stays clear of the nav and the mic', async({page}) => {
  await page.setViewportSize({width,height});
  await boot(page);
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await expect(pill(page)).toBeHidden(); // never on the set's own screen
  await elapse(page, 30);
  const go = async hash => {await page.evaluate(h => {location.hash = h;}, hash);await expect(page).toHaveURL(new RegExp(hash.replace(/[/?]/g,'\\$&') + '$'));};
  const time = pill(page).locator('[data-time]'), toggle = pill(page).locator('[data-toggle]');
  const box = async locator => {const b = await locator.boundingBox();return {left:b.x,top:b.y,right:b.x + b.width,bottom:b.y + b.height,width:b.width,height:b.height};};
  const apart = (a,b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  const clear = async (nav, mic) => {
    const p = await box(pill(page)), viewTop = await page.locator('#view').evaluate(el => el.getBoundingClientRect().top + scrollY);
    expect(p.left).toBeGreaterThanOrEqual(0);expect(p.right).toBeLessThanOrEqual(width);expect(p.bottom).toBeLessThanOrEqual(height);
    expect(p.bottom, 'above the nav').toBeLessThanOrEqual((await box(page.locator(nav))).top);
    expect(apart(p, await box(page.locator(mic))), 'beside the mic').toBe(true);
    expect((await box(toggle)).width).toBeGreaterThanOrEqual(44);expect((await box(toggle)).height).toBeGreaterThanOrEqual(44);
    expect((await box(pill(page).locator('[data-open]'))).height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    // The pill floats: the page under it sits where it sits without the pill.
    await pill(page).evaluate(el => {el.style.display = 'none';});
    expect(await page.locator('#view').evaluate(el => el.getBoundingClientRect().top + scrollY)).toBe(viewTop);
    await pill(page).evaluate(el => {el.style.display = '';});
  };
  // The floating mic on the set screen opens the recorder without pausing the set.
  await page.locator('.vz-collection-record').click();
  await elapse(page, 1); // the opening animation
  await expect(page).toHaveURL(/#\/record/);
  await expect(time).toHaveText('4:29');
  await elapse(page, 2);
  await expect(time).toHaveText('4:27');
  // Home: leaving the set did not pause it.
  await go('#/home');await ready(page);
  await expect(pill(page)).toBeVisible();
  await expect(pill(page).locator('[data-step]')).toHaveText('1/5');
  await expect(pill(page).locator('[data-name]')).toHaveText('립트릴');
  await expect(time).toHaveText('4:27');
  await elapse(page, 2);
  await expect(time).toHaveText('4:25');
  await clear('.vz-nav-space', '.vz-floating-record');
  // 내 곡 and a song page.
  await go('#/songs');
  await expect(time).toHaveText('4:25');
  await clear('.v-nav', '.vz-collection-record');
  await go('#/song/s1');
  await expect(pill(page)).toBeVisible();
  await clear('.v-nav', '.vz-collection-record');
  // Pause and resume from the pill.
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('연습 세트 계속');
  await elapse(page, 60);
  await expect(time).toHaveText('4:25');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('연습 세트 일시정지');
  await elapse(page, 10);
  await expect(time).toHaveText('4:15');
  // Under sheets and menus, out of the way of the recording selection bar, and never on the login screen.
  for (const variant of ['menu','page']) {
    await page.evaluate(variant => {VZ.sheet({title:'확인',body:'<p>내용</p>',variant});}, variant);
    await expect(pill(page)).toBeHidden();
    await page.evaluate(() => VZ.closeSheets());
    await expect(pill(page)).toBeVisible();
  }
  for (const name of ['vz-media-selecting','vzip-auth-locked']) {
    await page.evaluate(name => document.body.classList.add(name), name);
    await expect(pill(page)).toBeHidden();
    await page.evaluate(name => document.body.classList.remove(name), name);
    await expect(pill(page)).toBeVisible();
  }
  expect(Number(await pill(page).evaluate(el => getComputedStyle(el).zIndex))).toBeLessThan(Number(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--vz-z-overlay'))));
  // Recorder: a chip in the header with the time, no pause button, clear of the recorder's controls.
  await go('#/record');
  await expect(pill(page)).toBeVisible();
  await expect(time).toHaveText('4:15');
  await elapse(page, 5);
  await expect(time).toHaveText('4:10');
  await expect(toggle).toBeHidden();
  const chip = await box(pill(page));
  expect(chip.height).toBeGreaterThanOrEqual(44);expect(chip.right).toBeLessThanOrEqual(width);
  for (const selector of ['.rec-controls','.rec-time','[data-pick-song]','#top [data-back]','#top h1']) expect(apart(chip, await box(page.locator(selector).first())), selector).toBe(true);
  await noOverflow(page);
  // A reload keeps it (still running), a tap goes back to the set.
  await page.reload();
  await page.clock.resume();
  await expect(pill(page)).toBeVisible();
  await expect(pill(page).locator('[data-step]')).toHaveText('1/5');
  await page.clock.pauseAt(new Date('2026-11-04T12:14:00.000Z')); // 35 s before the pause, then 145 s since resuming at 12:11:35
  await expect(time).toHaveText('2:00');
  await pill(page).locator('[data-open]').click();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(pill(page)).toBeHidden();
  await expect(page.locator('[data-pset-run] [data-clock]')).toHaveText('2:00');
  // Next step shows on the pill; ending the set removes it.
  await page.getByRole('button',{name:'다음',exact:true}).click();
  await go('#/songs');
  await expect(pill(page).locator('[data-step]')).toHaveText('2/5');
  await expect(pill(page).locator('[data-name]')).toHaveText('호흡을 길게 유지하기');
  await elapse(page, 301);
  await expect(time).toHaveText('+0:01');
  await expect(pill(page)).toHaveClass(/is-over/);
  await clear('.v-nav', '.vz-collection-record');
  await go('#/practice-set');
  await expect(page.locator('[data-pset-run] [data-over-note]')).toContainText('다른 곳에 있는 동안 계획한 5분이 지났어요'); // it ran out on another screen
  await expect(page.locator('[data-pset-run] .pset-progress span')).toHaveText('2 / 5');
  await page.getByRole('button',{name:'여기까지 하고 기록하기'}).click();
  await go('#/songs');
  await expect(pill(page)).toBeHidden();
});

for (const [name, target, popup] of [['under the target', 100, true], ['over the target', 30, false], ['no target', null, false], ['helper not loaded', undefined, false]])
  test('today against the target on the set screens: ' + name, async({page}) => {
    await page.setViewportSize({width:375,height:812});
    await boot(page);
    // Stubs with the shapes of app/today-practice.js (VZ.todayPractice, VZ.todayPracticeText, VZ.todayPracticePopup).
    // The real file is loaded by the app, so each case replaces or removes its functions.
    await page.evaluate(({target, popup}) => {
      window.__popups = [];
      if (target === undefined) { VZ.todayPractice = VZ.todayPracticeText = VZ.todayPracticePopup = undefined; return; }
      VZ.todayPractice = (date = VZ.today()) => {
        const minutes = (VZ.db.practices || []).filter(p => p.date === date).reduce((n,p) => n + (Number(p.minutes) || 0),0);
        return {minutes,targetMinutes:target,percent:target ? Math.round(minutes / target * 100) : null};
      };
      VZ.todayPracticeText = x => x.targetMinutes ? '오늘 ' + x.minutes + '분 / 목표 ' + x.targetMinutes + '분 · ' + x.percent + '%' : '오늘 ' + x.minutes + '분 · 목표 없음';
      VZ.todayPracticePopup = popup ? options => {window.__popups.push(options);} : undefined;
    }, {target, popup});
    await entry(page).click();
    await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
    await page.getByRole('button',{name:'시작하기'}).click();
    const quiet = page.locator('[data-pset-run] [data-pset-today]'), line = page.locator('[data-sum-today]'), done = page.locator('[data-done-today]');
    if (target === undefined) await expect(quiet).toHaveCount(0);
    else await expect(quiet).toHaveText(target ? '오늘 30분 / 목표 ' + target + '분 · 이 세트는 저장하면 더해져요' : '오늘 30분 · 이 세트는 저장하면 더해져요');
    await elapse(page, 180);
    await page.getByRole('button',{name:'여기까지 하고 기록하기'}).click();
    if (target === undefined) await expect(line).toBeHidden();
    else await expect(line).toHaveText('이 세트 3분을 저장하면 ' + (target === 100 ? '오늘 33분 / 목표 100분 · 33%' : target === 30 ? '오늘 33분 / 목표 30분 · 110%' : '오늘 33분 · 목표 없음'));
    if (target === 100) { // edited minutes move the line
      await page.getByLabel('웜업 · 립트릴 연습한 시간(분)').fill('10');
      await expect(line).toHaveText('이 세트 10분을 저장하면 오늘 40분 / 목표 100분 · 40%');
    }
    await noOverflow(page);
    await page.getByRole('button',{name:'기록 저장'}).click();
    await expect(page.getByRole('heading',{name:'오늘 연습을 기록했어요'})).toBeVisible();
    const popups = await page.evaluate(() => window.__popups);
    if (popup) { // the shared popup is called once with the saved minutes; no second copy on the screen
      expect(popups).toEqual([{addedMinutes:10,title:'오늘 연습 세트'}]);
      await expect(done).toHaveCount(0);
    } else {
      expect(popups).toEqual([]);
      if (target === undefined) await expect(done).toHaveCount(0);
      else if (target) {
        await expect(done.locator('p')).toHaveText('오늘 33분 / 목표 30분 · 110%');
        await expect(done.getByRole('progressbar')).toHaveAttribute('aria-valuenow','100');
        await expect(done).toContainText('오늘 목표를 채웠어요');
      } else {
        await expect(done.locator('p')).toHaveText('오늘 33분 · 목표 없음');
        await expect(done.getByRole('progressbar')).toHaveCount(0);
        await expect(done).not.toContainText('목표를 채웠어요');
      }
    }
    await noOverflow(page);
  });

test('with the real today helper: the set screens show today against the target and saving opens the completion popup once', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page);
  expect(await page.evaluate(() => [typeof VZ.todayPractice, typeof VZ.todayPracticeText, typeof VZ.todayPracticePopup])).toEqual(['function','function','function']);
  const before = await page.evaluate(() => VZ.todayPractice());
  await entry(page).click();
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await expect(page.locator('[data-pset-run] [data-pset-today]')).toContainText('이 세트는 저장하면 더해져요');
  await elapse(page, 180);
  await page.getByRole('button',{name:'여기까지 하고 기록하기'}).click();
  await expect(page.locator('[data-sum-today]')).toContainText('이 세트 3분을 저장하면 오늘 ');
  await page.getByRole('button',{name:'기록 저장'}).click();
  // The shared popup (not a second copy on the screen): today's total now includes the set's minutes.
  const popup = page.locator('.vz-today-result');
  await expect(popup).toHaveCount(1);
  await expect(popup.locator('[data-today-added]')).toHaveText('이번 기록 +3분');
  const after = await page.evaluate(() => VZ.todayPractice());
  expect(after.minutes).toBe(before.minutes + 3);
  await expect(popup.locator('[data-today-text]')).toHaveText(await page.evaluate(() => VZ.todayPracticeText(VZ.todayPractice())));
  await expect(page.locator('[data-done-today]')).toHaveCount(0);
  await page.locator('[data-ok]').click();
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'오늘 연습을 기록했어요'})).toBeVisible();
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
