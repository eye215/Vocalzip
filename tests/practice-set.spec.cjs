// 오늘의 연습 — the part that was 오늘 연습 세트 and still works: the set list (#/practice-set) with the person's own steps
// edited as before under today's built-in ones, own steps timed on the wall clock (other apps, reload, long gaps), the
// summary → records and goals, and the small timer on other screens. The built-in exercises, 고르기, the home card and
// the 30-second takes are in tests/daily-set.spec.cjs. Fixture-only: no live Supabase, media or account writes.
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
// The 오늘의 연습 card of 오늘 › 연습하기 (it was the 오늘 연습 세트 row) and its one button.
const entry = page => page.locator('.vz-student-home [data-home-practice] [data-row="practice-set"]');
const goButton = page => entry(page).locator('[data-set-go]');
// 오늘의 연습 on home (design-system/practice-card-html.js): the large tile is the button; the bar's aria-label starts with the set's line.
const goText = page => goButton(page).locator('.vz-pc-title');
const barSays = page => entry(page).locator('[data-set-bar]');
const rows = page => page.locator('.pset-plan .pset-row');
// WebKit reloads on goto() to the URL it is already on: addresses change in the page.
const to = (page, hash) => page.evaluate(h => {location.hash = h;}, hash);
/** The set list before starting (the old 연습 세트 address). */
async function openList(page) {await to(page, '#/practice-set');await expect(page.locator('.pset-plan')).toBeVisible();}
const run = page => page.locator('[data-pset-run]');
const primary = page => run(page).locator('[data-run-primary]');
/** 고르기 with one exercise per group, so the built-in steps are the same on any date. */
const PINNED = {id:'daily-set-prefs',kind:'daily-set-prefs',v:1,off:{'loosen-liptrill':true,'loosen-hum':true,'breath-pulse':true,'breath-hiss':true,'voice-liptrill5':true,'voice-mum':true,'voice-vibrato':true,'voice-high':true,'loosen-siren':true,'ear-scale':true},groupsOff:{rhythm:true,'voice-check':true},replace:{}};
/** Only the person's own steps: every built-in exercise group resting — 숙제 goal, warm-up, personal goal, 곡에 적용하기,
 * recording (five steps, as 오늘 연습 세트 had). */
const ownSeed = () => {
  const value = seed();
  value.practicePlans.push({id:'daily-set-prefs',kind:'daily-set-prefs',v:1,off:{},groupsOff:{loosen:true,breath:true,voice:true,ear:true,rhythm:true,'voice-check':true},replace:{}});
  return value;
};
const pinnedSeed = () => {const value = seed();value.practicePlans.push(PINNED);return value;};
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

test('the set list keeps the person\'s own steps under today\'s built-in ones; edit them, run on the clock, save records and goals', async({page}) => {
  test.setTimeout(60000);
  await page.setViewportSize({width:390,height:844});
  await boot(page, pinnedSeed());
  const before = await db(page);
  await expect(entry(page)).toBeVisible();
  await expect(entry(page)).toContainText('오늘의 연습');await expect(barSays(page)).toHaveAttribute('aria-label',/^8개 · /);
  // Reading home writes nothing.
  expect((await db(page)).practicePlans).toEqual(before.practicePlans);
  await openList(page);
  await expect(page.locator('#top h1')).toHaveText('오늘의 연습');
  await expect(rows(page)).toHaveCount(8);
  // 숙제 first, the built-in groups, the person's goal, then — as 오늘 연습 세트 ended — the song and an optional recording.
  await expect(rows(page).locator('strong')).toHaveText(['호흡을 길게 유지하기','목·어깨 풀기','“스~” 길게 내쉬기','허밍 롱톤','음 따라 부르기','후렴 연결 연습하기','곡에 적용하기 · This Is the Moment','This Is the Moment']);
  // 음 따라 부르기 is today's 기본기 추천 (음정, not measured yet; 호흡's “스~” 길게 rests in this 고르기): marked, with why.
  await expect(rows(page).locator('small')).toHaveText(['숙제','목 풀기','호흡','발성','음감추천','개인','곡','녹음 · 선택']);
  await expect(rows(page).nth(4).locator('[data-focus-why]')).toHaveText('음정을 아직 재지 않았어요');
  // Every row is one button showing its minutes; nothing to type on the list itself.
  await expect(rows(page).locator('input')).toHaveCount(0);
  await expect(rows(page).nth(1).locator('.pset-fixed')).toHaveText('3분');
  await expect(rows(page).nth(3).locator('.pset-fixed')).toContainText('마이크 사용');
  await expect(rows(page).nth(0).locator('.pset-fixed b')).toHaveText('5분');
  await expect(rows(page).nth(6).locator('.pset-fixed b')).toHaveText('10분');
  await targets(page, '.pset-plan button');
  for (const width of [320, 390, 430]) {await page.setViewportSize({width,height:844});await noOverflow(page);}
  await page.setViewportSize({width:390,height:844});
  // Own steps, each from its own sheet: a shorter goal, no recording this time, a warm-up added, moved up, taken out again.
  const own = name => rows(page).filter({hasText:name}).locator('[data-edit]');
  await own('후렴 연결 연습하기').click();
  const sheet = page.locator('[data-own-sheet]');
  await targets(page, '[data-own-sheet] button');
  await sheet.getByLabel('시간(분)').fill('3');await sheet.getByRole('button',{name:'1분 줄이기'}).click();
  await page.getByRole('button',{name:'저장'}).click();
  await expect(rows(page).nth(5).locator('.pset-fixed b')).toHaveText('2분');
  await own('녹음').click();await sheet.locator('[data-remove]').click();
  await page.getByRole('button',{name:'연습 추가'}).click();
  await page.locator('.pset-add-option').filter({hasText:'웜업'}).click();
  await expect(rows(page).locator('strong')).toHaveText(['호흡을 길게 유지하기','목·어깨 풀기','“스~” 길게 내쉬기','허밍 롱톤','음 따라 부르기','후렴 연결 연습하기','곡에 적용하기 · This Is the Moment','립트릴']);
  await own('립트릴').click();
  await expect(sheet.locator('[data-down]')).toBeDisabled();
  await sheet.locator('[data-up]').click();
  await expect(rows(page).locator('strong')).toHaveText(['호흡을 길게 유지하기','목·어깨 풀기','“스~” 길게 내쉬기','허밍 롱톤','음 따라 부르기','후렴 연결 연습하기','립트릴','곡에 적용하기 · This Is the Moment']);
  await own('립트릴').click();await sheet.locator('[data-remove]').click();
  await expect(rows(page)).toHaveCount(7);
  await expect(page.locator('[data-pset-total]')).toHaveText('7개 · 약 29분');
  // Kept at once: the set for the days to come (기본 — there is no 기억하기 choice any more).
  expect((await db(page)).practicePlans.find(p => p.id === 'practice-set-template:default')).toEqual(expect.objectContaining({removed:expect.arrayContaining(['record'])}));
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  // The tap that starts the set starts its first step: the homework, on the clock.
  await expect(run(page).locator('#pset-step-title')).toHaveText('호흡을 길게 유지하기');
  await expect(run(page).locator('[data-run-name] b')).toHaveText('숙제');
  await expect(run(page).locator('[data-clock]')).toHaveText('5:00');
  await expect(primary(page)).toHaveText('다 했어요');
  await targets(page, '[data-pset-run] button');
  await noOverflow(page);
  await elapse(page, 150);
  await expect(run(page).locator('[data-clock]')).toHaveText('2:30');
  await primary(page).click();
  // Built-in steps: skipped here (their own flows are in tests/daily-set.spec.cjs).
  await expect(run(page).locator('[data-run-last]')).toHaveText('호흡을 길게 유지하기 · 끝');
  for (let i = 0; i < 4; i++) await run(page).locator('[data-run-skip]').click();
  await expect(run(page).locator('#pset-step-title')).toHaveText('후렴 연결 연습하기');
  await expect(primary(page)).toHaveText('시작하기');
  await elapse(page, 30); // waiting for 시작하기: not counted
  await primary(page).click();
  await elapse(page, 150); // 2:30 on a 2-minute step: overtime is shown and still counted
  await expect(run(page).locator('[data-clock]')).toHaveText('+0:30');
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await elapse(page, 300); // paused: not counted
  // With the page clock stopped on a paused set, WebKit sometimes never delivers the animation frames Playwright's
  // click waits for ("visible, enabled and stable" hangs; Chromium is fine). The button is checked to be there and
  // enabled, then pressed without that wait.
  await expect(primary(page)).toHaveText('계속하기');await expect(primary(page)).toBeEnabled();
  await primary(page).dispatchEvent('click');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
  await elapse(page, 30);
  await primary(page).click();
  // 곡에 적용하기 says its 가사·표현 task (app/daily-set-model.js applyTask); the song stays in the name line.
  await expect(run(page).locator('#pset-step-title')).toHaveText(require('../app/daily-set-model.js').applyTask({},TODAY).name);await expect(run(page).locator('[data-run-name] b')).toHaveText('곡');
  await expect(run(page).locator('[data-run-name] span').first()).toHaveText('곡에 적용하기 · This Is the Moment');
  await expect(run(page).locator('[data-song-open]')).toHaveAttribute('href','#/song/s1');
  await primary(page).click();
  await elapse(page, 120);
  await primary(page).click();
  // Summary: minutes from real running time only; the person's own steps can be edited, built-in ones are as measured.
  const summary = page.locator('.pset-summary');
  expect(await summary.locator('[data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['3','3','2']);
  await expect(summary.locator('.pset-row[data-measured]')).toHaveCount(4);
  await expect(summary.locator('.pset-row .pset-state')).toHaveText(['완료','건너뜀','건너뜀','건너뜀','건너뜀','완료','완료']);
  await page.getByLabel('후렴 연결 연습하기 연습한 시간(분)').fill('4');
  await expect(summary.locator('[data-sum]')).toHaveText('9분');
  await noOverflow(page);
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.getByRole('heading',{name:'오늘 연습을 기록했어요'})).toBeVisible();
  await expect(page.locator('.pset-done')).toContainText('연습 9분 · 7개 중 3개 · 목표 2개 체크');
  const after = await db(page);
  const set = after.practices.filter(p => p.practiceSetId);
  expect(set.map(p => [p.id.replace(/practice-set:[^:]+/,'set'),p.minutes]).sort()).toEqual([['goal:g1',3],['goal:g3',4],['set',0],['set:song-s1',2]]);
  expect(after.practices.find(p => p.id.endsWith(':song-s1'))).toEqual(expect.objectContaining({practiceMode:'song',songId:'s1',practiceTimeSource:'practice-set',manualMinutes:2}));
  expect(after.practices.find(p => p.id === 'goal:g1')).toEqual(expect.objectContaining({completed:['a1'],assignmentReps:{a1:1},practiceTimeSource:'goal'}));
  expect(after.dailyGoals.filter(g => g.completed).map(g => g.id).sort()).toEqual(['g1','g2','g3']);
  expect(after.assignments.find(t => t.id === 'a1').status).toBe('active'); // homework linked, never completed
  expect(after.practices.find(p => p.id === 'p1')).toEqual(before.practices.find(p => p.id === 'p1'));
  const template = after.practicePlans.find(p => p.id === 'practice-set-template:default');
  expect(template).toEqual(expect.objectContaining({kind:'practice-set-template',added:[],order:['goal','song']}));
  expect(template.removed.sort()).toEqual(['record','warmup']); // the recording taken out; the warm-up is the built-in groups' now
  // Home: actual time includes the set once; the card says today's set is done.
  await page.clock.resume();
  await page.getByRole('link',{name:'홈으로'}).click();await ready(page);
  await expect(entry(page)).toContainText('오늘 연습 끝 · 9분');
  // Today's ring and the week's days (the 오늘 · 이번 주 row before, 2026-11-27) count it once too.
  await page.locator('.vz-student-home [data-home-ring]').waitFor();
  await expect(page.locator('.vz-student-home [data-home-ring]')).toHaveAttribute('aria-label', /^오늘 연습 39분, /);
  await expect(page.locator('.vz-student-home [data-home-week]')).toHaveAttribute('aria-label', /, 이번 주 연습 39분, /);
});

test('an own step follows the clock: another app and a reload count the real time once, pause stops it, the trip to the recorder keeps it', async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await boot(page, ownSeed());
  const before = await db(page);
  await openList(page);
  await expect(rows(page).locator('strong')).toHaveText(['호흡을 길게 유지하기','립트릴','후렴 연결 연습하기','곡에 적용하기 · This Is the Moment','This Is the Moment']);
  await expect(rows(page).locator('small')).toHaveText(['숙제','웜업','개인','곡','녹음 · 선택']);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 60);
  await expect(run(page).locator('[data-clock]')).toHaveText('4:00');
  // Another app (or a locked phone) for 90 seconds: the page gets no timer ticks, the time still counts on return.
  await away(page, 90);
  await expect(run(page).locator('[data-clock]')).toHaveText('2:30');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible(); // leaving never pauses an own step
  await expect(run(page).locator('[data-over-note]')).toHaveCount(0);
  // The pause button stops it, also while away.
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await elapse(page, 120);
  await away(page, 180);
  await expect(run(page).locator('[data-clock]')).toHaveText('2:30');
  await primary(page).click(); // 계속하기, 12:17:30
  // Reload while running: still running, and the time since is counted once.
  await page.reload();
  await page.clock.resume();
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-04T12:22:30.000Z')); // 60 + 90 + 300 s on a five-minute step
  await expect(run(page).locator('[data-clock]')).toHaveText('+2:30');
  await expect(run(page).locator('[data-clock-sub]')).toHaveText('목표 5분 지남 · 연습 7:30');
  await page.goto('/#/home');
  await ready(page);
  await expect(goText(page)).toHaveText('호흡을 길게 유지하기');await expect(goButton(page)).toHaveAccessibleName(/, 이어서 하기$/);
  await expect(barSays(page)).toHaveAttribute('aria-label',/^0 \/ 5 · /);
  await goButton(page).click();
  await expect(run(page).locator('[data-clock]')).toHaveText('+2:30'); // the visit to home neither paused nor double counted
  // The planned time runs out while away: said plainly, the step stays, nothing is saved by itself.
  await primary(page).click(); // 다 했어요
  await expect(run(page).locator('#pset-step-title')).toHaveText('립트릴');
  await primary(page).click(); // 시작하기
  await away(page, 360);
  await expect(run(page).locator('[data-over-note]')).toContainText('다른 곳에 있는 동안 계획한 5분이 지났어요');
  await expect(run(page).locator('[data-clock]')).toHaveText('+1:00');
  await expect(run(page).locator('[data-run-count-all]')).toHaveText('2 / 5');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
  for (const key of ['practices','dailyGoals','assignments']) expect((await db(page))[key]).toEqual(before[key]);
  await primary(page).click();
  await expect(run(page).locator('[data-over-note]')).toHaveCount(0);
  for (let i = 0; i < 2; i++) await run(page).locator('[data-run-skip]').click();
  await expect(run(page).locator('[data-run-name]')).toContainText('녹음');await expect(run(page).locator('[data-run-name]')).toContainText('선택');
  await expect(page.getByText('녹음 길이는 연습 시간에 더하지 않아요.')).toBeVisible();
  await primary(page).click(); // 시작하기: the clock of the recording step
  await page.getByRole('button',{name:'녹음하기'}).click();
  await expect(page).toHaveURL(/#\/record\?song=s1$/);
  await expect(page.locator('[data-song-name]')).toHaveText('This Is the Moment');
  await elapse(page, 60);
  await page.goBack();
  await expect(run(page).locator('[data-run-name]')).toContainText('녹음');
  await expect(page.getByRole('button',{name:'일시정지',exact:true})).toBeVisible();
  await primary(page).click();
  // Wall-clock time minus the pause: 450 s, 360 s and the minute at the recorder.
  const values = await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value));
  expect(values).toEqual(['8','6','0','0','1']);
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.locator('.pset-done')).toContainText('연습 15분 · 5개 중 3개 · 목표 1개 체크');
  const total = list => list.filter(p => p.practiceSetId).reduce((n,p) => n + p.minutes,0);
  expect(total((await db(page)).practices)).toBe(15);
  // Saved once: a reload brings back neither the set nor more minutes.
  await page.clock.resume();
  await page.getByRole('link',{name:'홈으로'}).click();
  await ready(page);
  await page.reload();
  await ready(page);
  await expect(entry(page)).toContainText('오늘 연습 끝 · 15분');await expect(goText(page)).toHaveText('한 번 더 하기');
  await expect(pill(page)).toBeHidden();
  expect(total((await db(page)).practices)).toBe(15);
});

test('leaving the summary keeps it; discarding writes nothing', async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await boot(page, ownSeed());
  await openList(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 90);
  await page.getByRole('button',{name:'여기까지 하고 마치기'}).click();
  await expect(page.locator('.pset-summary .pset-row .pset-state').first()).toHaveText('안 함'); // stopping does not call the step done
  await page.clock.resume();
  await page.goto('/#/home');
  await ready(page);
  await expect(goText(page)).toHaveText('기록 저장하기');await expect(goButton(page)).toHaveAccessibleName('오늘의 연습 기록 저장하기');
  await expect(pill(page)).toBeHidden(); // the set has ended: no small timer
  await goButton(page).click();
  await expect(page.locator('.pset-summary [data-min]').first()).toHaveValue('2');
  const before = await db(page);
  await page.getByRole('button',{name:'저장하지 않고 끝내기'}).click();
  await page.getByRole('button',{name:'끝내기',exact:true}).click();
  await ready(page);
  await expect(entry(page)).toHaveAttribute('data-state','new');await expect(goButton(page).locator('.vz-pc-meta')).toHaveText(/ · 눌러서 시작$/);
  await expect(pill(page)).toBeHidden();
  const after = await db(page);
  for (const key of ['practices','dailyGoals','assignments','practicePlans']) expect(after[key]).toEqual(before[key]);
});

test('away for more than three hours on an own step: the set asks how to count it, and counts nothing by itself', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, ownSeed());
  const before = await db(page);
  await openList(page);
  await page.clock.pauseAt(new Date('2026-11-04T13:00:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 120);
  await away(page, 4 * 3600 + 600);
  const ask = page.locator('[data-pset-away]');
  await expect(ask.getByRole('heading',{name:'오래 자리를 비웠어요'})).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/vz-set-run/); // a question to read: light
  await expect(ask).toContainText('‘호흡을 길게 유지하기’ 타이머를 켜 둔 채 4시간 10분이 지났어요');
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
  await expect(run(page).locator('[data-clock]')).toHaveText('0:00');
  await expect(primary(page)).toHaveText('계속하기'); // stopped until the singer goes on
  await elapse(page, 30);
  await expect(run(page).locator('[data-clock]')).toHaveText('0:00');
  await primary(page).click();
  await elapse(page, 60);
  await page.getByRole('button',{name:'여기까지 하고 마치기'}).click();
  expect(await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['6','0','0','0','0']);
  for (const key of ['practices','dailyGoals']) expect((await db(page))[key]).toEqual(before[key]);
});

test('a set that comes back on another day is closed under its own day', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, ownSeed());
  await openList(page);
  await page.clock.pauseAt(new Date('2026-11-04T23:30:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 60);
  await to(page, '#/songs');
  await expect(pill(page)).toBeVisible();
  await away(page, 45 * 60); // back at 00:16 the next day
  await expect(pill(page)).toBeHidden();
  await to(page, '#/practice-set');
  await expect(page.locator('.pset-summary .pset-help')).toContainText('연습이에요');
  expect(await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['46','0','0','0','0']);
  expect((await db(page)).practices.some(p => p.practiceSetId)).toBe(false);
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.locator('.pset-done')).toContainText('연습 46분');
  expect((await db(page)).practices.filter(p => p.practiceSetId).map(p => [p.date,p.minutes])).toEqual([[TODAY,46]]);
});

test('a set paused on another day shows no small timer and is closed when it is opened', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, ownSeed());
  await openList(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 120);
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await to(page, '#/songs');
  await expect(pill(page)).toBeVisible();
  await expect(pill(page).locator('[data-toggle]')).toHaveAccessibleName('오늘의 연습 계속');
  await page.clock.pauseAt(new Date('2026-11-06T09:00:00.000Z'));
  await to(page, '#/library');
  await expect(page.locator('body')).toHaveAttribute('data-vz-route','library');
  await expect(pill(page)).toBeHidden();
  await to(page, '#/practice-set');
  await expect(page.locator('.pset-summary .pset-help')).toContainText('연습이에요');
  expect(await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['2','0','0','0','0']);
  expect((await db(page)).practices.some(p => p.practiceSetId)).toBe(false);
});

for (const [width,height] of [[375,812],[320,640]]) test('small timer on other screens at ' + width + 'px: shows the own step and time, pauses and resumes, returns to the set, stays clear of the nav and the mic', async({page}) => {
  await page.setViewportSize({width,height});
  await boot(page, ownSeed());
  await openList(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await expect(pill(page)).toBeHidden(); // never on the set's own screen
  await elapse(page, 30);
  const go = async hash => {await to(page, hash);await expect(page).toHaveURL(new RegExp(hash.replace(/[/?]/g,'\\$&') + '$'));};
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
  // The recorder opened while an own step runs: the set is not paused.
  await go('#/record');
  await expect(time).toHaveText('4:30');
  await elapse(page, 3);
  await expect(time).toHaveText('4:27');
  // Home: leaving the set did not pause it.
  await go('#/home');await ready(page);
  await expect(pill(page)).toBeVisible();
  await expect(pill(page).locator('[data-step]')).toHaveText('1/5');
  await expect(pill(page).locator('[data-name]')).toHaveText('호흡을 길게 유지하기');
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
  await expect(toggle).toHaveAccessibleName('오늘의 연습 계속');
  await elapse(page, 60);
  await expect(time).toHaveText('4:25');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('오늘의 연습 일시정지');
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
  await expect(run(page).locator('[data-clock]')).toHaveText('2:00');
  // The doing screen has no menu and no floating mic under its one button.
  await expect(page.locator('.v-nav')).toBeHidden();
  // The next own step shows on the pill once it is started; ending the set removes it.
  await primary(page).click();
  await expect(run(page).locator('#pset-step-title')).toHaveText('립트릴');
  await go('#/songs');
  await expect(pill(page)).toBeHidden(); // not started yet: nothing is being timed
  await go('#/practice-set');
  await primary(page).click();
  await go('#/songs');
  await expect(pill(page).locator('[data-step]')).toHaveText('2/5');
  await expect(pill(page).locator('[data-name]')).toHaveText('립트릴');
  await elapse(page, 301);
  await expect(time).toHaveText('+0:01');
  await expect(pill(page)).toHaveClass(/is-over/);
  await clear('.v-nav', '.vz-collection-record');
  await go('#/practice-set');
  await expect(run(page).locator('[data-over-note]')).toContainText('다른 곳에 있는 동안 계획한 5분이 지났어요'); // it ran out on another screen
  await expect(run(page).locator('[data-run-count-all]')).toHaveText('2 / 5');
  await page.getByRole('button',{name:'여기까지 하고 마치기'}).click();
  await go('#/songs');
  await expect(pill(page)).toBeHidden();
});

// No result popup any more (오늘 연습 on home always shows today against the target): the done screen says it.
for (const [name, target] of [['under the target', 100], ['over the target', 30], ['no target', null], ['helper not loaded', undefined]])
  test('today against the target on the summary and after saving: ' + name, async({page}) => {
    await page.setViewportSize({width:375,height:812});
    await boot(page, ownSeed());
    // Stubs with the shapes of app/today-practice.js (VZ.todayPractice, VZ.todayPracticeText).
    // The real file is loaded by the app, so each case replaces or removes its functions.
    await page.evaluate(({target}) => {
      if (target === undefined) { VZ.todayPractice = VZ.todayPracticeText = undefined; return; }
      VZ.todayPractice = (date = VZ.today()) => {
        const minutes = (VZ.db.practices || []).filter(p => p.date === date).reduce((n,p) => n + (Number(p.minutes) || 0),0);
        return {minutes,targetMinutes:target,percent:target ? Math.round(minutes / target * 100) : null};
      };
      VZ.todayPracticeText = x => x.targetMinutes ? '오늘 ' + x.minutes + '분 / 목표 ' + x.targetMinutes + '분 · ' + x.percent + '%' : '오늘 ' + x.minutes + '분 · 목표 없음';
    }, {target});
    await openList(page);
    await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
    await page.getByRole('button',{name:'시작하기'}).click();
    const line = page.locator('[data-sum-today]'), done = page.locator('[data-done-today]');
    await elapse(page, 180);
    await page.getByRole('button',{name:'여기까지 하고 마치기'}).click();
    if (target === undefined) await expect(line).toBeHidden();
    else await expect(line).toHaveText('이 연습 3분을 저장하면 ' + (target === 100 ? '오늘 33분 / 목표 100분 · 33%' : target === 30 ? '오늘 33분 / 목표 30분 · 110%' : '오늘 33분 · 목표 없음'));
    if (target === 100) { // edited minutes move the line
      await page.getByLabel('호흡을 길게 유지하기 연습한 시간(분)').fill('10');
      await expect(line).toHaveText('이 연습 10분을 저장하면 오늘 40분 / 목표 100분 · 40%');
    }
    await noOverflow(page);
    await page.getByRole('button',{name:'기록 저장'}).click();
    await expect(page.getByRole('heading',{name:'오늘 연습을 기록했어요'})).toBeVisible();
    await expect(page.locator('.sheet-back')).toHaveCount(0);
    if (target === undefined) await expect(done).toHaveCount(0);
    else if (target === 100) {
      await expect(done.locator('p')).toHaveText('오늘 40분 / 목표 100분 · 40%');
      await expect(done.getByRole('progressbar')).toHaveAttribute('aria-valuenow','40');
      await expect(done).not.toContainText('목표를 채웠어요');
    } else if (target) {
      await expect(done.locator('p')).toHaveText('오늘 33분 / 목표 30분 · 110%');
      await expect(done.getByRole('progressbar')).toHaveAttribute('aria-valuenow','100');
      await expect(done).toContainText('오늘 목표를 채웠어요');
    } else {
      await expect(done.locator('p')).toHaveText('오늘 33분 · 목표 없음');
      await expect(done.getByRole('progressbar')).toHaveCount(0);
      await expect(done).not.toContainText('목표를 채웠어요');
    }
    await noOverflow(page);
  });

test('with the real today helper: the summary shows today against the target and the done screen says it after saving, with no popup', async({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, ownSeed());
  expect(await page.evaluate(() => [typeof VZ.todayPractice, typeof VZ.todayPracticeText, typeof VZ.todayPracticePopup])).toEqual(['function','function','undefined']);
  const before = await page.evaluate(() => VZ.todayPractice());
  await openList(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await page.getByRole('button',{name:'시작하기'}).click();
  await elapse(page, 180);
  await page.getByRole('button',{name:'여기까지 하고 마치기'}).click();
  await expect(page.locator('[data-sum-today]')).toContainText('이 연습 3분을 저장하면 오늘 ');
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.getByRole('heading',{name:'오늘 연습을 기록했어요'})).toBeVisible();
  await expect(page.locator('.sheet-back')).toHaveCount(0);
  const after = await page.evaluate(() => VZ.todayPractice());
  expect(after.minutes).toBe(before.minutes + 3);
  await expect(page.locator('[data-done-today] p')).toHaveText(await page.evaluate(() => VZ.todayPracticeText(VZ.todayPractice())));
  await expect(page.locator('.pset-done .pset-help')).toContainText('연습 3분');
});

test('a song section added on the list is kept at once for the sets to come and comes back next time', async({page}) => {
  await page.setViewportSize({width:320,height:700});
  await boot(page, pinnedSeed());
  await openList(page);
  await page.getByRole('button',{name:'연습 추가'}).click();
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
  await expect(rows(page)).toHaveCount(9);
  await expect(rows(page).nth(7)).toContainText('This Is the Moment 0:30–1:10');
  await expect(rows(page).nth(7)).toContainText('구간 0:30–1:10');
  await expect(rows(page).nth(8)).toContainText('녹음'); // a new section goes before the closing recording
  await noOverflow(page);
  // Kept at once, with no 기억하기 choice: the set (기본) for the days to come.
  const template = (await db(page)).practicePlans.find(p => p.id === 'practice-set-template:default');
  expect(template.added).toEqual([{songId:'s1',minutes:4,segmentStart:30,segmentEnd:70}]);
  await expect(page.locator('[name=pset-remember]')).toHaveCount(0);
  // The home card shows it now; a week later the set offers the section again.
  await to(page, '#/home'); await ready(page);
  await expect(barSays(page)).toHaveAttribute('aria-label',/^9개 · /);
  await expect(entry(page).locator('.vz-pc-tile').nth(7)).toContainText('This Is the Moment 0:30–1:10');
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00.000Z'));
  await page.reload(); await ready(page);
  await openList(page);
  await expect(rows(page).filter({hasText:'구간 0:30–1:10'})).toHaveCount(1);
});
