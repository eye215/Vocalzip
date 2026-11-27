// 오늘의 연습 — ONE card on home (home step 2, 2026-11-27): today's goals as 필수 미션 boxes, the set's steps as a bar and
// tiles, and the free timer in its head (design-system/practice-card-html.js, app/today-card.js, app/free-timer.js).
// What the former 오늘 연습 card also did on home — 오늘 기록 연결, 시간 적고 체크, + 직접 적기, the 추가 rows' 곡·분류·메모 and
// the 반복 계획 hint — is not on home any more (직접 적기 is in 기록); those tests went with it.
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
    {id:'g3', date:TODAY, title:'가사 1절 외우기', source:'personal', sourceId:'', songId:'s2', completed:false, order:2}
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
const box = (page, title) => card(page).getByRole('button', {name:new RegExp('^필수 미션 ' + title + ', ')});
const count = page => card(page).locator('[data-mission-count]');
const timerButton = page => card(page).locator('[data-timer-start]');
const sheets = page => page.locator('.sheet-back, .sheet, [role=dialog]');
const todayMinutes = page => page.evaluate(() => VZ.todayPractice().minutes);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

const to = (page, hash) => page.evaluate(h => {location.hash = h;}, hash);
const pill = page => page.locator('.pset-mini');
const KEYS = ['id','date','minutes','manualMinutes','practiceTimeSource','mediaSeconds','mediaIds','practiceMode','technique','songId','categoryId','categoryLabel','detail','detail2',
  'recommendationSource','recommendationSourceId','rating','memo','completed','assignmentReps','assignmentNotes'];

test('the card: 필수 미션 n/m with one box per goal of today, the set as a bar and tiles, + 미션 · 편집 · timer; the old rows are gone', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await expect(card(page).locator('h2')).toHaveText('오늘의 연습');
  await expect(count(page)).toHaveText('필수 미션 1/3');
  const boxes = card(page).locator('[data-mission]');
  await expect(boxes).toHaveCount(3);
  expect(await boxes.evaluateAll(list => list.map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]))).toEqual([
    ['필수 미션 2절 브릿지 호흡 위치, 완료', 'true'], ['필수 미션 허밍 롱톤 8초, 아직', 'false'], ['필수 미션 가사 1절 외우기, 아직', 'false']]);
  await expect(card(page).getByRole('button', {name:'필수 미션 넣기', exact:true})).toHaveText('+ 미션');
  await expect(card(page).getByRole('button', {name:'오늘의 연습 편집', exact:true})).toHaveText('편집');
  await expect(timerButton(page)).toHaveAccessibleName('타이머 켜기');
  await expect(card(page).locator('[data-set-bar] > i').first()).toBeVisible();
  await expect(card(page).locator('[data-set-go]')).toHaveCount(1);
  // Gone from home: goal rows, 추가 rows, + 계획 넣기 / + 직접 적기, 하루 목표 bars, 시작하기 / 타이머만 켜기 and the small rows.
  for (const gone of ['[data-plan]', '[data-extra]', '[data-today-goal]', '[data-today-days]', '.vz-practice-row', '[data-today-hint]', '[data-set-summary]', '[data-set-line]'])
    await expect(card(page).locator(gone), gone).toHaveCount(0);
  for (const words of ['+ 계획 넣기', '+ 직접 적기', '타이머만 켜기', '매일 보이스 체크', '내 로드맵', '주간 돌아보기'])
    await expect(card(page).getByText(words, {exact:true}), words).toHaveCount(0);
  await expect(page.locator('.vz-student-home .vz-event')).toHaveCount(0);
  await expect(page.locator('.vz-student-home [data-home-practice]')).toHaveCount(1);
  expect(await db(page)).toEqual(before);
});

test('a 필수 미션 box only checks: no time sheet, no popup, no record; the count follows', async ({page}) => {
  await boot(page);
  await box(page, '허밍 롱톤 8초').click();
  await expect(count(page)).toHaveText('필수 미션 2/3');
  await expect(box(page, '허밍 롱톤 8초')).toHaveAttribute('aria-pressed', 'true');
  await expect(box(page, '허밍 롱톤 8초')).toHaveAccessibleName('필수 미션 허밍 롱톤 8초, 완료');
  await page.waitForTimeout(300);
  await expect(sheets(page)).toHaveCount(0);
  expect((await db(page)).dailyGoals.find(g => g.id === 'g2').completed).toBe(true);
  expect((await db(page)).practices.length).toBe(2);
  await box(page, '허밍 롱톤 8초').click();
  await expect(count(page)).toHaveText('필수 미션 1/3');
  await expect(sheets(page)).toHaveCount(0);
  expect((await db(page)).dailyGoals.find(g => g.id === 'g2').completed).toBe(false);
});

test('the timer button: starts at once, the strip and the pill show the time and survive a reload; the set waits; 멈추기 saves one record of the real minutes', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await timerButton(page).click();
  await expect(card(page).locator('[data-today-timer]')).toContainText('연습 중');
  await expect(timerButton(page)).toHaveCount(0);
  await expect(sheets(page)).toHaveCount(0);
  await page.clock.runFor(3000);
  await expect(card(page).locator('[data-timer-text]')).toHaveText('0:03');
  await expect(pill(page)).toBeVisible();
  await expect(pill(page).locator('[data-name]')).toHaveText('연습 중');
  // One clock at a time: a tile does not start the set while the timer runs, and says why in the card.
  await card(page).locator('[data-set-go]').click();
  await expect(card(page).locator('[data-today-error]')).toContainText('타이머가 돌아가는 중이에요');
  await expect(page).toHaveURL(/#\/home$/);
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
  await expect(card(page).locator('[data-today-timer]')).toHaveCount(0);
  await expect(timerButton(page)).toBeVisible();
  expect(await todayMinutes(page)).toBe(42);
  // A reload after saving brings back neither the timer nor more minutes.
  await page.reload();
  await page.clock.resume();
  await expect(card(page)).toBeVisible();
  await expect(pill(page)).toBeHidden();
  expect((await db(page)).practices.length).toBe(after.practices.length);
});

test('the timer stopped in the card: one record and a short line; under a minute saves nothing and says so', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await timerButton(page).click();
  await page.clock.runFor(40 * 1000);
  await card(page).getByRole('button', {name:'멈추기', exact:true}).click();
  await expect(card(page).locator('[data-today-note]')).toHaveText(/^1분이 안 돼서 기록하지 않았어요/);
  await expect(timerButton(page)).toBeVisible();
  await expect(pill(page)).toBeHidden();
  await expect(sheets(page)).toHaveCount(0);
  expect((await db(page)).practices).toEqual(before.practices);
  await timerButton(page).click();
  await page.clock.runFor(5 * 60 * 1000);
  await card(page).getByRole('button', {name:'멈추기', exact:true}).click();
  await expect(card(page).locator('[data-today-note]')).toHaveText('연습 5분을 기록했어요.');
  const added = (await db(page)).practices.filter(p => !before.practices.some(q => q.id === p.id));
  expect(added.map(p => [p.manualMinutes, p.practiceTimeSource])).toEqual([[5, 'manual']]);
});

test('the timer cannot start while today\'s set is in hand: the button says so in the card and nothing starts', async ({page}) => {
  await boot(page);
  await card(page).locator('[data-set-go]').click();
  await expect(page.locator('[data-pset-run]')).toBeVisible();
  await to(page, '#/home');
  await expect(card(page).locator('[data-row="practice-set"]')).toHaveAttribute('data-state', 'live');
  await expect(timerButton(page)).toHaveAttribute('aria-disabled', 'true');
  await timerButton(page).click({force:true}); // aria-disabled: still pressable, it says why
  await expect(card(page).locator('[data-today-error]')).toHaveText('오늘의 연습이 진행 중이에요. 그 연습을 마치거나 저장한 뒤에 켤 수 있어요.');
  await expect(card(page).locator('[data-today-timer]')).toHaveCount(0);
  expect(await page.evaluate(() => VZ.freeTimer.state())).toBe(null);
});

test('the timer left on for more than three hours: nothing is counted by itself; the card asks how, in place, then saves', async ({page}) => {
  await boot(page);
  const before = await db(page);
  await page.clock.pauseAt(new Date('2026-11-04T12:10:00.000Z'));
  await timerButton(page).click();
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

test('the bar: one segment per step (by minutes); a flag under each step that is one of today\'s goals; a checked goal turns its flag, segment and tile done', async ({page}) => {
  await boot(page);
  const before = await db(page);
  const entry = await page.evaluate(() => VZ.practiceSetEntry());
  expect(entry.state).toBe('new');
  const goalSteps = entry.items.filter(x => ['g2', 'g3'].includes(x.goalId));
  expect(goalSteps.map(x => x.goalId).sort()).toEqual(['g2', 'g3']);   // today's open goals are steps of the set
  const segs = card(page).locator('[data-set-bar] > i');
  await expect(segs).toHaveCount(entry.items.length);
  expect(await segs.evaluateAll(els => els.map(e => [e.dataset.seg, e.style.flexGrow, !!e.dataset.goal]))).toEqual(entry.items.map(x => [x.id, String(Math.max(1, x.minutes)), ['g2', 'g3'].includes(x.goalId)]));
  // Nothing done yet: the first step is the one to do now, the rest wait.
  expect(await segs.evaluateAll(els => els.map(e => e.dataset.look))).toEqual(entry.items.map((x, i) => i ? 'rest' : 'next'));
  const flags = card(page).locator('[data-set-flags] > i[data-flag]');
  await expect(flags).toHaveCount(2);
  expect(await flags.evaluateAll(els => els.map(e => [e.dataset.flag, e.dataset.look]))).toEqual(goalSteps.map(x => [x.id, x === entry.items[0] ? 'next' : 'rest']));
  // The flags sit under their own segments (the same flex row), with no words under the bar.
  for (const x of goalSteps) {
    const seg = await card(page).locator('[data-set-bar] > i[data-seg="' + x.id + '"]').boundingBox(), flag = await card(page).locator('[data-flag="' + x.id + '"] svg').boundingBox();
    expect(Math.abs((seg.x + seg.width / 2) - (flag.x + flag.width / 2))).toBeLessThanOrEqual(1.5);
  }
  expect((await card(page).locator('[data-set-flags]').innerText()).trim()).toBe('');
  // Goal steps: a 2px purple border and a 필수 pill.
  const tile = card(page).locator('.vz-pc-tile[data-step="' + goalSteps[0].id + '"]');
  await expect(tile).toHaveAttribute('data-goal', 'true');await expect(tile).toContainText('필수');
  await expect(tile).toHaveCSS('border-top-width', '2px');
  // Before the set starts, a goal checked with its box is no step of today's set any more (a fresh set leaves done goals
  // out: app/practice-set-model.js), so its segment, flag and tile go.
  const goal = before.dailyGoals.find(g => g.id === goalSteps[0].goalId);
  await box(page, goal.title).click();
  await expect(card(page).locator('[data-set-bar] > i[data-seg="' + goalSteps[0].id + '"]')).toHaveCount(0);
  await expect(tile).toHaveCount(0);
  await expect(flags).toHaveCount(1);
  // With the set in hand the steps stay: the other goal checked turns its flag into a check, its segment done and its tile
  // light purple with 완료! — a done goal step stays in the row (other done steps leave it).
  await card(page).locator('[data-set-go]').click();
  await expect(page.locator('[data-pset-run]')).toBeVisible();
  await to(page, '#/home');
  await expect(card(page).locator('[data-row="practice-set"]')).toHaveAttribute('data-state', 'live');
  const other = goalSteps[1], otherGoal = before.dailyGoals.find(g => g.id === other.goalId);
  await box(page, otherGoal.title).click();
  await expect(card(page).locator('[data-flag="' + other.id + '"]')).toHaveAttribute('data-look', 'done');
  await expect(card(page).locator('[data-set-bar] > i[data-seg="' + other.id + '"]')).toHaveAttribute('data-look', 'done');
  const otherTile = card(page).locator('.vz-pc-tile[data-step="' + other.id + '"]');
  await expect(otherTile).toHaveAttribute('data-look', 'done');await expect(otherTile).toContainText('완료!');
  await expect(otherTile).toHaveCSS('background-color', 'rgb(241, 236, 255)');
  // Only the goal changed (the same write as the goal row's circle).
  const after = await db(page);
  expect(after.dailyGoals).toEqual(before.dailyGoals.map(g => [goal.id, otherGoal.id].includes(g.id) ? {...g, completed:true, updatedAt:expect.any(Number)} : g));
  expect(after.practices).toEqual(before.practices);
});

test('a tile starts the set; back on 오늘 the next step is the large tile, "이어서 하기", and a done step leaves the row', async ({page}) => {
  await boot(page);
  const first = (await page.evaluate(() => VZ.practiceSetEntry())).items[0];
  await card(page).locator('.vz-pc-tile').nth(2).click();
  await expect(page.locator('[data-pset-run]')).toBeVisible();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await page.locator('[data-pset-run] [data-run-skip]').click();
  await to(page, '#/home');
  await expect(card(page).locator('[data-row="practice-set"]')).toHaveAttribute('data-state', 'live');
  const live = await page.evaluate(() => VZ.practiceSetEntry());
  const now = live.items.find(x => x.state === 'next');
  await expect(card(page).locator('[data-set-go]')).toHaveAttribute('data-step', now.id);
  await expect(card(page).locator('[data-set-go] .vz-pc-meta')).toHaveText(/ · 이어서 하기$/);
  await expect(card(page).locator('[data-set-bar] > i[data-seg="' + first.id + '"]')).toHaveAttribute('data-state', 'skipped');
  if (!first.goalId) await expect(card(page).locator('.vz-pc-tile[data-step="' + first.id + '"]')).toHaveCount(0);   // passed: out of the row
  await card(page).locator('[data-set-go]').click();
  await expect(page.locator('[data-pset-run]')).toBeVisible();
  await expect(page.locator('[data-pset-run] [data-run-count-all]')).toHaveText('2 / ' + live.items.length);
});

test('the large tile twinkles softly; under reduced motion it does not move', async ({page}) => {
  await boot(page);
  const stars = card(page).locator('[data-set-go] .vz-tw');
  await expect(stars).toHaveCount(5);
  expect(await stars.first().evaluate(e => getComputedStyle(e).animationName)).toBe('vzTw');
  expect(await card(page).locator('[data-set-go] .vz-pc-dot').first().evaluate(e => getComputedStyle(e).animationName)).toBe('vzPcDot');
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await stars.evaluateAll(els => els.map(e => getComputedStyle(e).animationName))).toEqual(Array(5).fill('none'));
  expect(await card(page).locator('[data-set-go] .vz-pc-dot').evaluateAll(els => els.map(e => getComputedStyle(e).animationName))).toEqual(Array(5).fill('none'));
});

for (const width of [320, 390, 430]) test('the card at ' + width + 'px: inside the screen, no page overflow, 44px targets; the tiles scroll inside the card', async ({page}) => {
  await page.setViewportSize({width, height:844});
  await boot(page);
  const c = await card(page).boundingBox();
  expect(c.x).toBeGreaterThanOrEqual(12); expect(c.x + c.width).toBeLessThanOrEqual(width - 12);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  for (const b of await card(page).locator('.vz-pc-head button, [data-mission], .vz-pc-tile').all()) {
    const r = await b.boundingBox(); expect(r.height).toBeGreaterThanOrEqual(44); expect(r.width).toBeGreaterThanOrEqual(44);
  }
  // Everything but the tiles row stays inside the card; the tiles row scrolls (no scrollbar) from edge to edge of the card.
  const row = await card(page).locator('.vz-pc-tiles').evaluate(e => { const r = e.getBoundingClientRect(); return {l:r.left, r:r.right, scroll:e.scrollWidth > e.clientWidth, overflow:getComputedStyle(e).overflowX}; });
  expect(Math.abs(row.l - c.x)).toBeLessThanOrEqual(1); expect(Math.abs(row.r - (c.x + c.width))).toBeLessThanOrEqual(1);
  expect(row.overflow).toBe('auto');
  for (const sel of ['.vz-pc-head', '[data-missions]']) { const r = await card(page).locator(sel).boundingBox(); expect(r.x).toBeGreaterThanOrEqual(c.x); expect(r.x + r.width).toBeLessThanOrEqual(c.x + c.width + .5); }
});
