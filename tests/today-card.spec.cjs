// 오늘 연습 — ONE card on home for today's goals (계획) and today's practice records (추가), with 타이머만 켜기 and
// everything opening inside the card (design-system/today-card-html.js, app/today-card.js, app/free-timer.js).
// Fixture-only: no live Supabase, media or account writes.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const NOW = '2026-11-04T12:00:00.000Z';
const TODAY = '2026-11-04';
const day = n => { const d = new Date(2026, 10, 4 + n, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
const manual = (id, date, minutes, extra = {}) => ({id, date, minutes, manualMinutes:minutes, practiceTimeSource:'manual', mediaSeconds:0, mediaIds:[], practiceMode:'training', technique:[], songId:'',
  categoryId:'', categoryLabel:'', detail:'', detail2:'', recommendationSource:'', recommendationSourceId:'', rating:0, memo:'', completed:[], assignmentReps:{}, assignmentNotes:{}, created:new Date(2026,10,4,10,20).getTime(), ...extra});
const seed = () => ({
  categories:[{id:'c-breath',name:'호흡',items:[]}],
  songs:[{id:'s1', title:'On My Own', show:'레미제라블'},{id:'s2', title:'This Is the Moment', show:'지킬 앤 하이드'}],
  lessons:[],
  assignments:[{id:'a1', title:'2절 브릿지 호흡 위치', status:'active', startDate:'2026-11-01', dueDate:'2026-11-08'}],
  practices:[
    {id:'goal:g1', date:TODAY, minutes:12, manualMinutes:12, practiceTimeSource:'goal', practiceMode:'training', songId:'', goalId:'g1', goalSource:'homework', completed:['a1'], assignmentReps:{a1:1}, assignmentNotes:{}, technique:[], mediaIds:[], memo:'[목표] 2절 브릿지 호흡 위치'},
    manual('p1', TODAY, 15, {songId:'s1', practiceMode:'song', categoryId:'c-breath', categoryLabel:'호흡'})
  ],
  performances:[], comparisonReports:[],
  dailyGoals:[
    {id:'g1', date:TODAY, title:'2절 브릿지 호흡 위치', source:'homework', sourceId:'a1', completed:true, order:0},
    {id:'g2', date:TODAY, title:'허밍 롱톤 8초', source:'personal', sourceId:'', completed:false, order:1},
    {id:'g3', date:TODAY, title:'가사 1절 외우기', source:'personal', sourceId:'', completed:false, order:2}
  ],
  practicePlans:[{id:'day:'+TODAY, period:'day', date:TODAY, targetMinutes:30}]
});
function installSDK() {
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const row = () => JSON.parse(sessionStorage.getItem('today-server-row') || 'null');
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
        sessionStorage.setItem('today-server-row',JSON.stringify({payload:q.body.payload,updated_at:q.body.updated_at}));
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
    if (!sessionStorage.getItem('today-seeded')) {
      localStorage.setItem(key,JSON.stringify(value));
      sessionStorage.setItem('today-server-row',JSON.stringify({payload:value,updated_at:'2026-11-04T11:00:00.000Z'}));
      sessionStorage.setItem('today-seeded','1');
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
const card = page => page.locator('.vz-student-home [data-home-today]');
const planRow = (page, title) => card(page).locator('[data-plan]').filter({hasText:title});
const extraRow = (page, title) => card(page).locator('[data-extra]').filter({hasText:title});
const count = page => card(page).locator('[data-today-count]');
const sheets = page => page.locator('.sheet-back, .sheet, [role=dialog]');
const todayMinutes = page => page.evaluate(() => VZ.todayPractice().minutes);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

const to = (page, hash) => page.evaluate(h => {location.hash = h;}, hash);
const pill = page => page.locator('.pset-mini');
const KEYS = ['id','date','minutes','manualMinutes','practiceTimeSource','mediaSeconds','mediaIds','practiceMode','technique','songId','categoryId','categoryLabel','detail','detail2',
  'recommendationSource','recommendationSourceId','rating','memo','completed','assignmentReps','assignmentNotes'];

test('one list: 계획 rows (goals) and, under a divider, 추가 rows (records linked to no goal); "계획 n/m" counts only 계획', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await expect(card(page).locator('h2')).toHaveText('오늘 연습');
  await expect(count(page)).toHaveText('계획 1/3 · 추가 1 · 오늘 27분');
  await expect(card(page).locator('[data-today-target]')).toHaveText('하루 목표 30분 · 90%');
  await expect(card(page).locator('[data-today-days] .vz-today-day')).toHaveCount(7);
  await expect(card(page).locator('[data-today-days] .vz-today-day').last()).toHaveAttribute('data-minutes', '27');
  await expect(card(page).locator('[data-plan] .vz-today-title')).toHaveText(['2절 브릿지 호흡 위치','허밍 롱톤 8초','가사 1절 외우기']);
  await expect(card(page).locator('[data-plan] [data-tag]')).toHaveText(['숙제','계획','계획']);
  await expect(card(page).locator('[data-plan] .vz-today-min')).toHaveText(['12분','—','—']);
  expect(await card(page).locator('[data-plan] input[type=checkbox]').evaluateAll(list => list.map(i => i.checked))).toEqual([true,false,false]);
  await expect(card(page).locator('.vz-today-sep')).toHaveCount(1);
  await expect(card(page).locator('[data-extra]')).toHaveCount(1);
  await expect(extraRow(page, '호흡 · On My Own').locator('.vz-today-tag')).toHaveText('추가');
  await expect(extraRow(page, '호흡 · On My Own').locator('.vz-today-min')).toHaveText('15분');
  // The separate 오늘의 목표 and 연습하기 cards are gone; the set, 보이스 체크, 로드맵 and 주간 돌아보기 are in this card.
  await expect(page.locator('.vz-student-home .vz-goals')).toHaveCount(0);
  await expect(page.locator('.vz-student-home [data-home-practice]')).toHaveCount(1);
  await expect(card(page).locator('[data-set-go]')).toHaveText(/^시작하기 · 약 \d+분$/);
  await expect(card(page).locator('[data-set-summary]')).toHaveText(/^시작하면: /);
  await expect(card(page).locator('[data-set-line]')).toBeHidden();
  await card(page).locator('[data-set-summary]').click();
  await expect(card(page).locator('[data-set-line]')).toBeVisible();
  await expect(card(page).locator('[data-timer-start]')).toHaveText('타이머만 켜기');
  await expect(card(page).locator('.vz-practice-row strong')).toHaveText(['매일 보이스 체크','내 로드맵','주간 돌아보기']);
  await card(page).locator('.vz-practice-row[data-row=weekly-review]').click();
  await expect(page).toHaveURL(/#\/practice-review$/);
  expect(await db(page)).toEqual(before);
});

test('the circle only checks: no time sheet, no popup; the count follows', async ({page}) => {
  await boot(page);
  await planRow(page, '허밍 롱톤 8초').locator('input[type=checkbox]').click();
  await expect(count(page)).toHaveText('계획 2/3 · 추가 1 · 오늘 27분');
  await page.waitForTimeout(300);
  await expect(sheets(page)).toHaveCount(0);
  expect((await db(page)).dailyGoals.find(g => g.id === 'g2').completed).toBe(true);
  expect((await db(page)).practices.length).toBe(2);
  await planRow(page, '허밍 롱톤 8초').locator('input[type=checkbox]').click();
  await expect(count(page)).toHaveText('계획 1/3 · 추가 1 · 오늘 27분');
  await expect(sheets(page)).toHaveCount(0);
  expect((await db(page)).dailyGoals.find(g => g.id === 'g2').completed).toBe(false);
});

test('a 계획 row opens in place; 오늘 기록 연결 links today\'s record to it: the 추가 row joins the goal and no minute counts twice', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await planRow(page, '허밍 롱톤 8초').locator('.vz-today-main').click();
  await expect(planRow(page, '허밍 롱톤 8초').locator('.vz-today-main')).toHaveAttribute('aria-expanded', 'true');
  const chips = planRow(page, '허밍 롱톤 8초').locator('.vz-today-panel .vz-today-chip');
  await expect(chips).toHaveText(['오늘 기록 연결 · 호흡 · On My Own 15분','시간 적고 체크','세트로 하기']);
  await expect(sheets(page)).toHaveCount(0);
  await chips.first().click();
  await expect(card(page).locator('[data-extra]')).toHaveCount(0);
  await expect(card(page).locator('.vz-today-sep')).toHaveCount(0);
  await expect(planRow(page, '허밍 롱톤 8초').locator('.vz-today-min')).toHaveText('15분');
  await expect(planRow(page, '허밍 롱톤 8초').locator('input[type=checkbox]')).toBeChecked();
  await expect(count(page)).toHaveText('계획 2/3 · 추가 0 · 오늘 27분');
  await expect(sheets(page)).toHaveCount(0);
  const after = await db(page);
  expect(after.practices.length).toBe(before.practices.length);
  expect(after.practices.find(p => p.id === 'p1')).toEqual(expect.objectContaining({goalId:'g2', manualMinutes:15, minutes:15}));
  expect(await todayMinutes(page)).toBe(27);
  // The record is not offered to another goal any more.
  await planRow(page, '가사 1절 외우기').locator('.vz-today-main').click();
  await expect(planRow(page, '가사 1절 외우기').locator('.vz-today-panel .vz-today-chip')).toHaveText(['시간 적고 체크','세트로 하기']);
  // The goal picker keeps a goal with a linked record (unticking it there never leaves the record without its goal).
  expect(await page.evaluate(() => VzipStudentHomeModel.keptGoal({...VZ.db, dailyGoals:[]}, {...VZ.db.dailyGoals.find(g => g.id === 'g2'), completed:false}))).toBe('recorded');
});

test('시간 적고 체크: minutes in the row, then the goal is checked with its own record', async ({page}) => {
  await boot(page);
  await planRow(page, '가사 1절 외우기').locator('.vz-today-main').click();
  await planRow(page, '가사 1절 외우기').getByRole('button', {name:'시간 적고 체크', exact:true}).click();
  const form = planRow(page, '가사 1절 외우기').locator('[data-time-form]');
  await expect(form).toBeVisible();
  await form.getByRole('button', {name:'10분', exact:true}).click();
  await form.getByRole('button', {name:'5분 늘리기'}).click();
  await expect(form.locator('[name=minutes]')).toHaveValue('15');
  await form.getByRole('button', {name:'저장하고 체크', exact:true}).click();
  await expect(planRow(page, '가사 1절 외우기').locator('.vz-today-min')).toHaveText('15분');
  await expect(planRow(page, '가사 1절 외우기').locator('input[type=checkbox]')).toBeChecked();
  await expect(count(page)).toHaveText('계획 2/3 · 추가 1 · 오늘 42분');
  await expect(sheets(page)).toHaveCount(0);
  const goalRow = (await db(page)).practices.find(p => p.id === 'goal:g3');
  expect(goalRow).toEqual(expect.objectContaining({minutes:15, manualMinutes:15, practiceTimeSource:'goal', goalId:'g3'}));
});

test('+ 직접 적기: an inline form that saves one record as 연습 기록 시트 does; a chosen 계획 is linked, a homework gets one 회', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await card(page).getByRole('button', {name:'+ 직접 적기', exact:true}).click();
  const form = card(page).locator('[data-direct-form]');
  await expect(form).toBeVisible();
  await expect(sheets(page)).toHaveCount(0);
  await expect(form.locator('[name=date]')).toHaveValue(TODAY);
  await expect(form.locator('[data-what]')).toHaveText(['계획 · 허밍 롱톤 8초','계획 · 가사 1절 외우기','숙제였어요 · 2절 브릿지 호흡 위치']);
  await form.getByRole('button', {name:'20분', exact:true}).click();
  await form.getByRole('button', {name:'5분 줄이기'}).click();
  await form.locator('[name=song]').selectOption('s2');
  await form.getByRole('button', {name:'발성', exact:true}).click();
  await form.locator('[name=memo]').fill('고음 편하게');
  await form.getByRole('button', {name:'저장', exact:true}).click();
  await expect(form).toHaveCount(0);
  await expect(extraRow(page, '발성 · This Is the Moment').locator('.vz-today-min')).toHaveText('15분');
  await expect(count(page)).toHaveText('계획 1/3 · 추가 2 · 오늘 42분');
  await expect(page.locator('.sheet-back')).toHaveCount(0);
  const after = await db(page), added = after.practices.find(p => !before.practices.some(q => q.id === p.id));
  // The very shape the practice sheet writes (VZ.writePractice), plus when it was made.
  for (const key of KEYS) expect(Object.keys(added), key).toContain(key);
  expect(added).toEqual(expect.objectContaining({date:TODAY, minutes:15, manualMinutes:15, practiceTimeSource:'manual', practiceMode:'song', songId:'s2', categoryLabel:'발성', memo:'고음 편하게', completed:[]}));
  // 발성 did not exist yet: added to the 분류 list as the sheet adds a new one.
  expect(after.categories.map(c => c.name)).toEqual(['호흡','발성']);
  expect(added.categoryId).toBe(after.categories[1].id);
  // A chosen 계획: the new record is linked and the goal checked, once.
  await card(page).getByRole('button', {name:'+ 직접 적기', exact:true}).click();
  await form.getByRole('button', {name:'10분', exact:true}).click();
  await form.getByRole('button', {name:'계획 · 허밍 롱톤 8초', exact:true}).click();
  await form.getByRole('button', {name:'저장', exact:true}).click();
  await expect(planRow(page, '허밍 롱톤 8초').locator('.vz-today-min')).toHaveText('10분');
  await expect(planRow(page, '허밍 롱톤 8초').locator('input[type=checkbox]')).toBeChecked();
  await expect(count(page)).toHaveText('계획 2/3 · 추가 2 · 오늘 52분');
  // 숙제였어요: one 회 of that homework on the record, the homework itself stays open.
  await card(page).getByRole('button', {name:'+ 직접 적기', exact:true}).click();
  await form.getByRole('button', {name:'5분', exact:true}).click();
  await form.getByRole('button', {name:'숙제였어요 · 2절 브릿지 호흡 위치', exact:true}).click();
  await form.getByRole('button', {name:'저장', exact:true}).click();
  await expect(planRow(page, '2절 브릿지 호흡 위치').locator('.vz-today-min')).toHaveText('17분');
  const last = await db(page), hw = last.practices.find(p => p.manualMinutes === 5 && p.practiceTimeSource === 'manual');
  expect([hw.completed, hw.assignmentReps]).toEqual([['a1'], {a1:1}]);
  expect(last.assignments[0].status).toBe('active');
  await expect(sheets(page)).toHaveCount(0);
});

test('a 추가 row opens 곡 · 분류 · 메모 in place; nothing chosen leaves the record as it is', async ({page}) => {
  const value = seed();
  value.practices.push(manual('t1', TODAY, 12));
  await boot(page, value);
  const row = card(page).locator('[data-extra="t1"]');
  await expect(row.locator('.vz-today-title')).toHaveText('연습 · 10:20 · 아직 안 정함');
  await row.locator('.vz-today-main').click();
  const form = row.locator('[data-extra-form]');
  await expect(form).toBeVisible();
  await expect(sheets(page)).toHaveCount(0);
  const before = await db(page);
  await form.getByRole('button', {name:'저장', exact:true}).click();
  await expect(form).toHaveCount(0);
  expect(await db(page)).toEqual(before);
  await row.locator('.vz-today-main').click();
  await form.locator('[name=song]').selectOption('s1');
  await form.getByRole('button', {name:'리듬', exact:true}).click();
  await form.locator('[name=memo]').fill('박자 맞추기');
  await form.getByRole('button', {name:'저장', exact:true}).click();
  await expect(card(page).locator('[data-extra="t1"] .vz-today-title')).toHaveText('리듬 · On My Own');
  const t1 = (await db(page)).practices.find(p => p.id === 't1');
  expect(t1).toEqual(expect.objectContaining({minutes:12, manualMinutes:12, songId:'s1', practiceMode:'song', categoryLabel:'리듬', memo:'박자 맞추기'}));
  expect(await todayMinutes(page)).toBe(39);
  await expect(sheets(page)).toHaveCount(0);
});

test('타이머만 켜기: starts at once, the pill shows on other screens and survives a reload, 멈추기 saves one record of the real minutes', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await card(page).getByRole('button', {name:'타이머만 켜기', exact:true}).click();
  await expect(card(page).locator('[data-today-timer]')).toContainText('연습 중');
  await expect(card(page).locator('[data-set-go]')).toHaveCount(0);
  await expect(sheets(page)).toHaveCount(0);
  await page.clock.runFor(3000);
  await expect(card(page).locator('[data-timer-text]')).toHaveText('0:03');
  await expect(pill(page)).toBeVisible();
  await expect(pill(page).locator('[data-name]')).toHaveText('연습 중');
  await to(page, '#/songs');
  await expect(pill(page)).toBeVisible();
  await page.clock.runFor(60 * 1000);
  await expect(pill(page).locator('[data-time]')).toHaveText('1:03');
  // Nothing written while it runs.
  expect((await db(page)).practices).toEqual(before.practices);
  // A reload (or iOS reopening the page) keeps it running from the stored start.
  await page.reload();
  await page.clock.resume();
  await expect(pill(page)).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-04T12:24:40.000Z'));
  await expect(pill(page).locator('[data-time]')).toHaveText('14:40');
  // The set does not start while it runs (the same minutes would count twice).
  await expect.poll(() => page.evaluate(() => { try { VZ.dailySet.go(); return 'started'; } catch (e) { return e.message; } })).toContain('타이머');
  await pill(page).getByRole('button', {name:'멈추기', exact:true}).click();
  await expect(pill(page)).toBeHidden();
  await expect(page.locator('.toast')).toContainText('연습 15분을 기록했어요.');
  await expect(sheets(page)).toHaveCount(0);
  const after = await db(page), added = after.practices.filter(p => !before.practices.some(q => q.id === p.id));
  expect(added).toHaveLength(1);
  for (const key of KEYS) expect(Object.keys(added[0]), key).toContain(key);
  expect(added[0]).toEqual(expect.objectContaining({date:TODAY, minutes:15, manualMinutes:15, practiceTimeSource:'manual', songId:''}));
  await to(page, '#/home');
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('[data-extra="' + added[0].id + '"] .vz-today-title')).toHaveText(/^연습 · \d\d:\d\d · 아직 안 정함$/);
  await expect(card(page).locator('[data-extra="' + added[0].id + '"] .vz-today-min')).toHaveText('15분');
  await expect(count(page)).toHaveText('계획 1/3 · 추가 2 · 오늘 42분');
  // A reload after saving brings back neither the timer nor more minutes.
  await page.reload();
  await page.clock.resume();
  await expect(card(page)).toBeVisible();
  await expect(pill(page)).toBeHidden();
  expect((await db(page)).practices.length).toBe(after.practices.length);
});

test('타이머만 켜기 under a minute saves nothing and says so in the card', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await card(page).getByRole('button', {name:'타이머만 켜기', exact:true}).click();
  await page.clock.runFor(40 * 1000);
  await card(page).getByRole('button', {name:'멈추기', exact:true}).click();
  await expect(card(page).locator('[data-today-note]')).toHaveText(/^1분이 안 돼서 기록하지 않았어요/);
  await expect(card(page).locator('[data-timer-start]')).toBeVisible();
  await expect(pill(page)).toBeHidden();
  await expect(sheets(page)).toHaveCount(0);
  expect((await db(page)).practices).toEqual(before.practices);
});

test('the same unplanned song on three days of the last seven: one line offers a routine, made in place by the routine code', async ({page}) => {
  const value = seed();
  value.practices.push(manual('r1', day(-1), 10, {songId:'s2', practiceMode:'song'}), manual('r2', day(-4), 10, {songId:'s2', practiceMode:'song'}), manual('r3', TODAY, 5, {songId:'s2', practiceMode:'song'}));
  await boot(page, value);
  await expect(card(page).locator('[data-today-hint]')).toHaveCount(1);
  await expect(card(page).locator('[data-today-hint] span').first()).toHaveText('요즘 ‘This Is the Moment’을 자주 하네요');
  await card(page).getByRole('button', {name:'반복 계획으로 넣기', exact:true}).click();
  await expect(card(page).locator('[data-today-hint]')).toHaveCount(0);
  await expect(planRow(page, 'This Is the Moment 연습').locator('[data-tag]')).toHaveText('반복 0/7');
  await expect(count(page)).toHaveText('계획 1/4 · 추가 2 · 오늘 32분');
  await expect(sheets(page)).toHaveCount(0);
  const after = await db(page);
  expect(after.practicePlans.filter(p => p.kind === 'routine').map(p => [p.title, p.days])).toEqual([['This Is the Moment 연습', 7]]);
  expect(after.dailyGoals.filter(g => g.routine).length).toBe(7);
  // Unplanned records stay records: nothing was turned into a goal after the fact.
  expect(after.practices.filter(p => p.goalId).map(p => p.id)).toEqual(['goal:g1']);
});

test('타이머만 켜기 left on for more than three hours: nothing is counted by itself; the card asks how, in place, then saves', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await card(page).getByRole('button', {name:'타이머만 켜기', exact:true}).click();
  await page.clock.runFor(120 * 1000);
  // Another app (or a locked phone) for four hours.
  const show = hidden => page.evaluate(hidden => {
    Object.defineProperty(document, 'hidden', {configurable:true, get:() => hidden});
    Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => hidden ? 'hidden' : 'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await show(true);
  await page.clock.fastForward(4 * 3600 * 1000);
  await show(false);
  const away = card(page).locator('[data-today-away]');
  await expect(away).toBeVisible();
  await expect(away).toContainText('오래 자리를 비웠어요');
  await expect(pill(page).locator('[data-name]')).toHaveText('오래 자리를 비웠어요');
  await expect(sheets(page)).toHaveCount(0);
  expect((await db(page)).practices).toEqual(before.practices);
  await away.getByRole('button', {name:'비운 시간 빼고 저장', exact:true}).click();
  await expect(away).toHaveCount(0);
  await expect(pill(page)).toBeHidden();
  const added = (await db(page)).practices.filter(p => !before.practices.some(q => q.id === p.id));
  expect(added.map(p => p.manualMinutes)).toEqual([2]);
});
