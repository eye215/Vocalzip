// 다음 연습 하나로 (2026-11-26): ONE 다음 연습 list (VZ.nextPractice, app/next-practice.js) — 홈's 지금 할 것 shows its
// first item once with "다음 연습 n개 더", #/next-practice shows the whole list (rank, every source, 담김, 오늘 한 것), and
// "AI에게 하나 더 받기" asks before anything is sent. Fake data only; the AI server is a stub.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const pad = n => String(n).padStart(2, '0');
const ago = days => { const d = new Date(Date.now() - days * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
// hwA: open, due soonest → 다음 연습 1번째. hwB: open and already today's goal → one row with 숙제 + 오늘 목표, 담김.
// hwC: done today in a practice record → under 오늘 한 것.
const seed = () => ({categories:[], lessons:[], comparisonReports:[],
  songs:[{id:'s1', title:'Defying Gravity'}, {id:'s2', title:'On My Own'}],
  assignments:[
    {id:'hwA', title:'립트릴로 고음 연결하기', status:'active', songId:'s2', startDate:ago(3), dueDate:ago(-2)},
    {id:'hwB', title:'호흡을 길게 유지하기', status:'active', startDate:ago(3), dueDate:ago(-5)},
    {id:'hwC', title:'모음 고르게 읽기', status:'active', startDate:ago(3), dueDate:ago(-6)}],
  dailyGoals:[{id:'gB', date:ago(0), title:'호흡을 길게 유지하기', source:'homework', sourceId:'hwB', completed:false, order:0}],
  practices:[{id:'p-old', date:ago(5), minutes:10, manualMinutes:10, practiceTimeSource:'manual', practiceMode:'song', songId:'s1', technique:[], mediaIds:[], completed:[]},
    {id:'p-hw', date:ago(0), minutes:10, manualMinutes:10, practiceTimeSource:'manual', practiceMode:'training', technique:[], mediaIds:[], completed:['hwC'], assignmentReps:{hwC:1}}]});
async function boot(page, db = seed(), hash = '#/home') {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(db)]);
  await page.goto('/' + hash);
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
}
const to = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const rows = page => page.locator('[data-next-practice] > .np-list > .np-item');
test.use({viewport:{width:390, height:844}});
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('#/next-practice: one ranked list — every source on one row, 담김, 목표에 담기 inline, 오늘 한 것 folded at the end', async ({page}) => {
  await boot(page, seed(), '#/next-practice');
  await expect(page.locator('#top h1')).toHaveText('다음 연습');
  await expect(page.locator('[data-back]')).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
  // Order: homework (due soonest first), then 기본기 and the rest — the same order the shared accessor gives.
  const ids = await page.evaluate(() => VZ.nextPractice().items.filter(x => !x.doneToday).map(x => x.id));
  expect(await rows(page).evaluateAll(els => els.map(e => e.dataset.npItem))).toEqual(ids);
  expect(ids.slice(0, 2)).toEqual(['homework:hwA', 'homework:hwB']);
  const [a, b] = [rows(page).nth(0), rows(page).nth(1)];
  await expect(a.locator('.np-num')).toHaveText('1');
  await expect(a.locator('.np-title')).toHaveText('립트릴로 고음 연결하기');
  await expect(a.locator('.np-why')).toContainText('On My Own');
  await expect(a.locator('[data-np-chip]')).toHaveText(['숙제']);
  await expect(a.locator('[data-np-go]')).toHaveText('따라 하기');
  await expect(a.locator('[data-np-go]')).toHaveAttribute('href', '#/practice-set?guide=homework%3AhwA');
  // The homework that is already today's goal: ONE row with both sources, shown as 담김.
  await expect(b.locator('[data-np-chip]')).toHaveText(['숙제', '오늘 목표']);
  await expect(b.locator('[data-np-added]')).toHaveText('목표에 담김 ✓');
  await expect(b.locator('[data-np-add]')).toHaveCount(0);
  await expect(rows(page).filter({hasText:'모음 고르게 읽기'})).toHaveCount(0);      // done today: not among the rows
  // 오늘 한 것: folded at the end, opened on demand.
  const done = page.locator('[data-np-done]');
  await expect(done.locator('summary')).toContainText('오늘 한 것 1개');
  await done.locator('summary').click();
  await expect(done.locator('.np-item')).toHaveCount(1);
  await expect(done.locator('.np-title')).toHaveText('모음 고르게 읽기');
  // 목표에 담기 → the same goal 다음 연습 (AI)'s "이 숙제를 오늘 목표에 담기" makes; the row says 담김, and once is once.
  const before = await page.evaluate(() => JSON.parse(JSON.stringify(VZ.db.dailyGoals)));
  await a.locator('[data-np-add]').click();
  await expect(rows(page).nth(0).locator('[data-np-added]')).toHaveText('목표에 담김 ✓');
  const goals = await page.evaluate(() => VZ.db.dailyGoals);
  expect(goals.slice(0, before.length)).toEqual(before);
  const added = goals.filter(g => g.sourceId === 'hwA');
  expect(added).toEqual([expect.objectContaining({date:await page.evaluate(() => VZ.today()), title:'립트릴로 고음 연결하기', songId:'s2', source:'homework', completed:false})]);
  expect(await page.evaluate(() => VZ.nextPractice.addGoal(VZ.nextPractice().items[0]))).toBe(false);
  expect((await page.evaluate(() => VZ.db.dailyGoals)).filter(g => g.sourceId === 'hwA')).toHaveLength(1);
  // 곡별: the songs in the list, picked inline (no sheet).
  await page.locator('[data-np-filter="song"]').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await page.locator('[data-np-song="s2"]').click();
  await expect(rows(page).locator('.np-title')).toHaveText(['립트릴로 고음 연결하기']);
  await page.locator('[data-np-filter="all"]').click();
  await expect(rows(page)).toHaveCount(ids.length);
  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('home shows 다음 연습 item #1 once — 지금 할 것 with "n개 더"; no 따라 하기 row, no 손볼 곳 panel, no AI 오늘 추천 on the goals card', async ({page}) => {
  await boot(page);
  const now = page.locator('.vz-student-home .vz-event');
  await expect(now).toHaveAttribute('data-kind', 'homework');
  const first = await page.evaluate(() => VZ.nextPractice().items[0]);
  expect(first.id).toBe('homework:hwA');
  await expect(now.locator('h2')).toHaveText(first.title);
  const more = page.locator('.vz-student-home [data-home-next-more]');
  const open = await page.evaluate(() => VZ.nextPractice().open);
  await expect(more.locator('span')).toHaveText('다음 연습 ' + (open - 1) + '개 더');
  await expect(more).toHaveAccessibleName('다음 연습 ' + (open - 1) + '개 더 보기');
  // Once as a recommendation on home. Not counted: the person's own goal list, 오늘의 연습 (the set's own steps, which
  // start with 다음 연습's homework by design) and 오늘 부를 곡 (a song's reason may name its homework).
  const count = await page.evaluate(title => {
    const main = document.querySelector('.vz-student-home').shadowRoot.querySelector('main').cloneNode(true);
    main.querySelectorAll('.vz-today-list,.vz-set-card,.vz-recent').forEach(n => n.remove());
    return main.textContent.split(title).length - 1;
  }, first.title);
  expect(count).toBe(1);
  await expect(page.locator('.vz-student-home .vz-guided-item, .vz-student-home .vz-guided-recs')).toHaveCount(0);
  // 내 로드맵 stays as a plain link, without what it says to fix (that is in 다음 연습 now).
  const road = page.locator('.vz-student-home [data-home-practice] [data-row="roadmap"]');
  await expect(road).toBeVisible();
  await expect(road).not.toContainText('손볼 곳');
  await expect(road).toHaveAccessibleName('내 로드맵 보기');
  // 오늘 연습 keeps 주간 돌아보기 and 계획 넣기; AI 오늘 추천 moved to the list.
  await expect(page.getByRole('button', {name:'AI로 오늘 할 일 추천받기'})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'주간 돌아보기 · 다음 목표 추천', exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'+ 계획 넣기', exact:true})).toBeVisible();
  expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(page).toHaveURL(/#\/next-practice$/);
  await expect(rows(page).first().locator('.np-title')).toHaveText(first.title);
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/#\/home$/);
});

test('오늘의 목표 sheet offers the top three of 다음 연습 not yet 담김, and saves them as the list would', async ({page}) => {
  await boot(page);
  await expect(page.locator('.vz-student-home .vz-event')).toBeVisible();
  const top = await page.evaluate(() => VZ.nextPractice().items.filter(x => !x.doneToday && !x.inGoals && x.canAdd).slice(0, 3).map(x => x.title));
  await page.getByRole('button', {name:'+ 계획 넣기', exact:true}).click();
  const sheet = page.getByRole('dialog', {name:'오늘의 목표', exact:true});
  await expect(sheet).toBeVisible();
  const offered = sheet.locator('.vz-plan-option:not(:has(input:checked)) .vz-plan-title');
  await expect(offered).toHaveText(top);
  await expect(sheet.locator('.vz-plan-option .vz-plan-title', {hasText:'호흡을 길게 유지하기'})).toHaveCount(1);   // its goal, not offered again
  await expect(sheet.locator('[data-plan-next-all]')).toBeVisible();
  await sheet.locator('.vz-plan-option', {hasText:'립트릴로 고음 연결하기'}).click();
  await sheet.getByRole('button', {name:'목표 저장'}).click();
  await expect(sheet).toHaveCount(0);
  const goals = await page.evaluate(() => VZ.db.dailyGoals.filter(g => g.date === VZ.today()));
  expect(goals.map(g => [g.source, g.sourceId])).toEqual([['homework', 'hwB'], ['homework', 'hwA']]);
  expect(await page.evaluate(() => VZ.nextPractice().items.find(x => x.id === 'homework:hwA').inGoals)).toBe(true);
});

test('AI에게 하나 더 받기 asks first: nothing reaches the AI server before 보내기, and the draft joins the list', async ({page}) => {
  await boot(page, seed(), '#/next-practice');
  let calls = 0, body = null;
  await page.route('**/fake-ai-coach', async r => { calls++; body = r.request().postDataJSON(); await r.fulfill({contentType:'application/json', body:JSON.stringify({note:'기록한 특징: 호흡이 짧아요\n다음 시도: 허밍으로 8초 길게 내기'})}); });
  // The app's AI call, pointed at a stub endpoint so every network call it makes is counted.
  await page.evaluate(() => { window.vzipCloudCoach = async input => (await fetch('/fake-ai-coach', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(input)})).json(); });
  const ask = page.locator('[data-np-ai]');
  await expect(ask).toHaveText('AI에게 하나 더 받기');
  await ask.click();
  const dialog = page.getByRole('dialog', {name:'AI에게 하나 더 받기'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('NVIDIA');
  await expect(dialog).toContainText('녹음 파일은 보내지 않아요');
  await page.waitForTimeout(300);
  expect(calls).toBe(0);
  await dialog.getByRole('button', {name:'취소'}).click();
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(calls).toBe(0);
  expect(await page.evaluate(() => (VZ.db.practicePlans || []).filter(p => p.period === 'ai-review').length)).toBe(0);
  await ask.click();
  await dialog.getByRole('button', {name:'보내기'}).click();
  await expect(page.locator('[data-np-ai-status]')).toContainText('초안이에요');
  expect(calls).toBe(1);
  expect(body.mode).toBe('text');
  const draft = page.locator('[data-next-practice] .np-item[data-draft]');
  await expect(draft.locator('.np-title')).toHaveText('허밍으로 8초 길게 내기');
  await expect(draft.locator('[data-np-chip]')).toHaveText(['AI 초안']);
  await expect(draft.locator('[data-np-go]')).toHaveAttribute('href', '#/practice-review?mode=today');
  await expect(draft.locator('[data-np-add]')).toHaveCount(0);
});

test('월별 · 전체 분석: 다음 연습 shows the first three of the shared list and "다음 연습 전체 보기"; 목표에 담기 works there', async ({page}) => {
  await boot(page, seed(), '#/home');
  // Fake analysed takes (no files): what the device store would hand to VZ.media.list(), so both reports render.
  await page.evaluate(() => {
    const day = n => { const d = new Date(Date.now() - n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const take = (id, n, into) => ({id, name:id, type:'audio/wav', source:'practice', songId:'s1', song:'Defying Gravity', created:Date.now() - n * 864e5, date:day(n), durationSeconds:60,
      analysis:{v:2, metrics:{voicedSeconds:30, stability:{wobbleCents:20, notes:4}, intonation:{meanAbsCents:into, notes:10}, range:{lowCents:6000, highCents:8000}, breath:{medianPhrase:2.5}}, confidence:{voiceOverMrDb:12}}});
    const rows = [take('t1', 40, 30), take('t2', 20, 28), take('t3', 2, 26)];
    window.vzipReadMedia = async () => rows.map(r => ({...r})); VZ.media.invalidate();
  });
  const top = async () => page.evaluate(() => VZ.nextPractice().items.filter(x => !x.doneToday).slice(0, 3).map(x => x.id));
  for (const [hash, section] of [['#/growth-flow?period=all', '[data-growth-anchor="practice"]'], ['#/growth-flow?period=month', '[data-month-section="practice"]']]) {
    await to(page, hash);
    const box = page.locator(section + ' [data-np-top]');
    await expect(box).toBeVisible();
    const shown = await box.locator('.np-item').evaluateAll(els => els.map(e => e.dataset.npItem));
    expect(shown.length, hash).toBeGreaterThan(0);
    expect(shown.length, hash).toBeLessThanOrEqual(3);
    expect(shown, hash).toEqual(await top());
    await expect(box.locator('[data-np-all]')).toHaveAttribute('href', '#/next-practice');
    await expect(box.locator('[data-np-all]')).toHaveText('다음 연습 전체 보기');
  }
  // 목표에 담기 on a report row: the list's own way, shown as 담김 in place.
  const add = page.locator('[data-month-section="practice"] [data-np-top] [data-np-add]').first();
  const id = await add.getAttribute('data-np-add');
  await add.click();
  await expect(page.locator('[data-month-section="practice"] [data-np-top] [data-np-item="' + id + '"] [data-np-added]')).toHaveText('목표에 담김 ✓');
  expect(await page.evaluate(i => VZ.nextPractice().items.find(x => x.id === i).inGoals, id)).toBe(true);
  await page.locator('[data-month-section="practice"] [data-np-all]').click();
  await expect(page).toHaveURL(/#\/next-practice$/);
});
