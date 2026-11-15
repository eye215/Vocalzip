// Result popup after a goal or a practice set was saved (app/today-practice.js): the ring sweeps from where today
// stood before the record to where it stands now, the last seven days are real, the celebration happens once.
// The motion runs on requestAnimationFrame, so the fake clock steps it; CSS transitions keep running on real time.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const {TODAY, day, seed, boot, openPopup} = require('./practice-popup-fixture.cjs');
const C = 2 * Math.PI * 50; // ring circumference in the SVG's own units
const popup = page => page.locator('.sheet.vz-today-popup');
const result = page => page.locator('.vz-today-result');
const part = (page, name) => result(page).locator('[data-today-' + name + ']');
const now = page => page.evaluate(() => VZ.todayPractice());
const pause = page => page.clock.pauseAt(new Date('2026-11-04T12:05:00.000Z'));
/** What the ring draws: the first lap and the lap past 100%, each as a share of the circle (0–1). */
const laps = page => result(page).evaluate((root, C) => ['arc','lap'].map(name => {
  const el = root.querySelector('[data-today-' + name + ']');
  return el ? Math.round((1 - Number(el.getAttribute('stroke-dashoffset')) / C) * 1000) / 1000 + 0 : null;
}), C);
/** The visible share of each bar's column, oldest day first. */
const bars = page => result(page).locator('.vz-tp-day').evaluateAll(list => list.map(el => ({
  date:el.dataset.date, minutes:Number(el.dataset.minutes), met:el.dataset.met === 'true', today:el.dataset.today === 'true',
  label:el.querySelector('.vz-tp-label').textContent, shown:Math.round((1 - parseFloat(el.querySelector('.vz-tp-bar').style.transform.replace('translateY(','')) / 100) * 1000) / 1000
})));
const finish = async page => { await page.clock.runFor(1500); await expect(result(page)).toHaveAttribute('data-phase','done'); };
const WEEK = [45,20,0,40,52,41]; // 목 금 토 일 월 화 against a 40-minute target: 화·월·일 reached it, 토 did not
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('the ring starts where today stood before the record and ends on VZ.todayPractice; texts are final from the start', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40, today:10, past:WEEK}));
  await pause(page);
  const stored = await page.evaluate(() => JSON.stringify(VZ.db.practices));
  await openPopup(page, 12);
  const x = await now(page);
  expect(x).toEqual({minutes:22, targetMinutes:40, percent:55});
  // First frame: before = now − added (10 of 40 minutes), while everything a screen reader gets is already final.
  await expect(result(page)).toHaveAttribute('data-phase','run');
  await expect(part(page,'percent')).toHaveText('25%');await expect(part(page,'total')).toHaveText('10분');
  expect(await laps(page)).toEqual([0.25, 0]);
  await expect(part(page,'summary')).toHaveText('오늘 22분, 목표 40분의 55%. 어제까지 3일 연속 목표 달성');
  await expect(part(page,'summary')).toHaveAttribute('aria-live','polite');
  await expect(part(page,'text')).toHaveText(await page.evaluate(() => VZ.todayPracticeText()));
  await expect(result(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow','55');
  await expect(result(page).getByRole('progressbar')).toHaveAttribute('aria-valuetext','55%');
  await expect(part(page,'added')).toHaveText('이번 기록 +12분');await expect(part(page,'plus')).toHaveText('+12분');
  await expect(part(page,'headline')).toHaveText('잘 쌓이고 있어요');await expect(part(page,'hint')).toHaveText('목표까지 18분 남았어요');
  for (const name of ['percent','total','plus']) expect(await part(page,name).evaluate(el => !!el.closest('[aria-hidden=true]'))).toBe(true); // the moving parts are decorative
  const height = await popup(page).evaluate(el => el.offsetHeight);
  // Halfway: somewhere between the two real values, never outside them.
  await page.clock.runFor(600);
  const mid = parseInt(await part(page,'percent').textContent(), 10);
  expect(mid).toBeGreaterThan(25);expect(mid).toBeLessThan(55);
  const [arc] = await laps(page);expect(arc).toBeGreaterThan(0.25);expect(arc).toBeLessThan(0.55);
  await expect(result(page)).toHaveAttribute('data-phase','run');
  // End: exactly today's numbers, within 1.2 seconds of the first frame.
  await page.clock.runFor(600);
  await expect(result(page)).toHaveAttribute('data-phase','done');
  await expect(part(page,'percent')).toHaveText(x.percent + '%');await expect(part(page,'total')).toHaveText('22분');
  expect(await laps(page)).toEqual([0.55, 0]);
  await expect(result(page)).toHaveAttribute('data-state','progress');await expect(result(page)).toHaveAttribute('data-celebrated','0');
  expect(await popup(page).evaluate(el => el.offsetHeight)).toBe(height); // numbers change, the layout does not
  expect(await part(page,'percent').evaluate(el => getComputedStyle(el).fontVariantNumeric)).toContain('tabular-nums');
  // Showing the popup writes nothing: the record was saved before it opened.
  expect(await page.evaluate(() => JSON.stringify(VZ.db.practices.filter(p => !p.id.startsWith('add'))))).toBe(stored);
  expect(await page.evaluate(() => VZ.db.practices.filter(p => p.id.startsWith('add')).length)).toBe(1);
});

test('each moment has its own headline: 시작, 진행 중, 거의 다, 목표 달성, 초과 달성, and the days without time or target', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40}));
  await pause(page);
  const expectMoment = async (add, state, headline, hint, summary) => {
    await openPopup(page, add);await finish(page);
    const x = await now(page);
    await expect(result(page)).toHaveAttribute('data-state', state);
    await expect(part(page,'headline')).toHaveText(headline);
    if (hint) await expect(part(page,'hint')).toHaveText(hint); else await expect(part(page,'hint')).toHaveCount(0);
    await expect(part(page,'summary')).toHaveText(summary);
    if (x.targetMinutes) await expect(part(page,'percent')).toHaveText(x.percent + '%');
    return x;
  };
  await expectMoment(0, 'empty', '아직 기록한 시간이 없어요', '연습 시간을 적으면 여기에 쌓여요', '오늘 0분, 목표 40분의 0%');
  await expect(part(page,'added')).toHaveCount(0);await expect(part(page,'plus')).toHaveCount(0);
  await expectMoment(6, 'start', '오늘 첫 연습이에요', '목표까지 34분 남았어요', '오늘 6분, 목표 40분의 15%');
  await expectMoment(10, 'progress', '잘 쌓이고 있어요', '목표까지 24분 남았어요', '오늘 16분, 목표 40분의 40%');
  await expectMoment(16, 'almost', '거의 다 왔어요', '목표까지 8분 남았어요', '오늘 32분, 목표 40분의 80%');
  await expect(result(page)).toHaveAttribute('data-celebrated','0');await expect(result(page)).toHaveAttribute('data-reached','false');
  await expectMoment(8, 'goal', '오늘 목표를 채웠어요', '목표 40분을 다 채웠어요', '오늘 40분, 목표 40분의 100%');
  await expect(result(page)).toHaveAttribute('data-celebrated','1');await expect(result(page)).toHaveAttribute('data-reached','true');
  await expectMoment(0, 'over', '오늘 목표를 채웠어요', '', '오늘 40분, 목표 40분의 100%'); // ticked again without new time: no second party
  await expect(result(page)).toHaveAttribute('data-celebrated','0');
  await expectMoment(12, 'over', '목표보다 더 연습했어요', '목표보다 12분 더 했어요', '오늘 52분, 목표 40분의 130%');
  await expect(result(page)).toHaveAttribute('data-celebrated','0');
  // No daily target: minutes only, no ring value, no percentage and no streak.
  await page.evaluate(() => VZ.change(d => { d.settings = {...d.settings, dailyTargetMinutes:0}; }, {silent:true}));
  expect(await now(page)).toEqual({minutes:52, targetMinutes:null, percent:null});
  await expectMoment(0, 'free', '오늘 연습을 기록했어요', '', '오늘 52분, 목표 없음');
  await expect(result(page).getByRole('progressbar')).toHaveCount(0);await expect(part(page,'percent')).toHaveCount(0);
  await expect(part(page,'total')).toHaveText('52분');await expect(part(page,'streak')).toHaveCount(0);await expect(part(page,'line')).toHaveCount(0);
  await expect(part(page,'text')).toHaveText('오늘 52분 · 목표 없음');
});

test('crossing 100% celebrates once with at most 40 pieces that are removed; already above the target it does not', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40, today:32, past:WEEK}));
  await pause(page);
  await openPopup(page, 11); // 32 → 43 minutes: 80% → 108%
  const pieces = popup(page).locator('.vz-tp-burst i');
  await expect(part(page,'percent')).toHaveText('80%');await expect(result(page)).toHaveAttribute('data-reached','false');
  await expect(result(page)).toHaveAttribute('data-celebrated','0');await expect(pieces).toHaveCount(0);
  await expect(part(page,'headline')).toHaveText('오늘 목표를 채웠어요'); // final words from the start
  let steps = 0;
  while (await result(page).getAttribute('data-celebrated') === '0' && steps++ < 60) await page.clock.runFor(20);
  // The moment the ring closes: pieces, the bounce and the reached marks, while the count is still on its way.
  await expect(result(page)).toHaveAttribute('data-celebrated','1');await expect(result(page)).toHaveAttribute('data-bounce','1');
  await expect(result(page)).toHaveAttribute('data-reached','true');await expect(result(page)).toHaveAttribute('data-phase','run');
  const count = await pieces.count();expect(count).toBeGreaterThan(0);expect(count).toBeLessThanOrEqual(40);
  expect(await pieces.evaluateAll(list => list.every(el => !!el.closest('[aria-hidden=true]')))).toBe(true);
  await finish(page);
  await expect(result(page)).toHaveAttribute('data-celebrated','1'); // once, not again on the way to 108%
  await expect(part(page,'percent')).toHaveText('108%');expect(await laps(page)).toEqual([1, 0.075]);
  await expect(pieces).toHaveCount(0); // gone when the burst ends
  await expect(result(page).locator('.vz-tp-day[data-today]')).toHaveAttribute('data-met','true');
  // More time on a day that already reached the target: no celebration.
  await openPopup(page, 5);await finish(page);
  await expect(result(page)).toHaveAttribute('data-state','over');await expect(result(page)).toHaveAttribute('data-celebrated','0');
  await expect(popup(page).locator('.vz-tp-burst i')).toHaveCount(0);
  await expect(part(page,'percent')).toHaveText((await now(page)).percent + '%');
});

test('over 100% the ring is full and a second lap shows the rest: 128%', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:25, today:20, past:[0,0,0,0,0,30]}));
  await pause(page);
  await openPopup(page, 12);
  await expect(part(page,'percent')).toHaveText('80%');expect(await laps(page)).toEqual([0.8, 0]);
  await finish(page);
  expect(await now(page)).toEqual({minutes:32, targetMinutes:25, percent:128});
  await expect(part(page,'percent')).toHaveText('128%');await expect(part(page,'total')).toHaveText('32분');
  expect(await laps(page)).toEqual([1, 0.28]);
  const bar = result(page).getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow','100');await expect(bar).toHaveAttribute('aria-valuetext','128%');
  await expect(part(page,'hint')).toHaveText('목표보다 7분 더 했어요');
  expect(await result(page).locator('[data-today-lap]').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await expect(part(page,'streak')).toHaveText('2일 연속 목표 달성'); // yesterday and today
});

test('the streak line appears only for a real run of two days or more', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40, today:30, past:WEEK}));
  await pause(page);
  await openPopup(page, 5);await finish(page); // 35 of 40: today is still open, the run ended yesterday (화·월·일)
  await expect(part(page,'streak')).toHaveText('어제까지 3일 연속 목표 달성');
  await openPopup(page, 5);await finish(page); // 40 of 40: today joins it
  await expect(part(page,'streak')).toHaveText('4일 연속 목표 달성');
  await expect(part(page,'summary')).toHaveText('오늘 40분, 목표 40분의 100%. 4일 연속 목표 달성');
  expect(await page.evaluate(() => VzipTodayPractice.streak(VZ.db,{date:VZ.today(),today:VZ.today(),defaultDailyTargetMinutes:VZ.dailyTargetMinutes(),timeEntries:VZ.timeEntries([])}))).toEqual({days:4,open:false});
  // One day is not a run: a day that missed the target yesterday hides the line, reached or not.
  await page.evaluate(yesterday => VZ.change(d => { d.practices = d.practices.filter(p => p.date !== yesterday); }, {silent:true}), day(-1));
  await openPopup(page, 0);await finish(page);
  await expect(result(page)).toHaveAttribute('data-reached','true');await expect(part(page,'streak')).toHaveCount(0);
  await expect(part(page,'summary')).toHaveText('오늘 40분, 목표 40분의 100%');
});

test('seven bars are the seeded days against the target line; today grows with the ring and reached days are marked', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40, today:10, past:WEEK}));
  await pause(page);
  await openPopup(page, 12);
  const top = 52 * 1.12, share = minutes => Math.round(minutes / top * 1000) / 1000; // the tallest day (52분) sets the scale
  let list = await bars(page);
  expect(list.map(b => b.date)).toEqual([-6,-5,-4,-3,-2,-1,0].map(day));
  expect(list.map(b => b.label)).toEqual(['목','금','토','일','월','화','오늘']);
  expect(list.map(b => b.minutes)).toEqual([...WEEK, 22]);
  expect(list.slice(0,6).map(b => b.met)).toEqual([true,false,false,true,true,true]);
  expect(list.slice(0,6).map(b => b.shown)).toEqual(WEEK.map(share));
  expect(list[6]).toMatchObject({date:TODAY, today:true, met:false, shown:share(10)}); // before this record
  await finish(page);
  list = await bars(page);
  expect(list[6]).toMatchObject({minutes:(await now(page)).minutes, met:false, shown:share(22)});
  expect(list.slice(0,6).map(b => b.shown)).toEqual(WEEK.map(share)); // past days never move
  // The line sits at the target on the same scale, and the chart reads as one sentence.
  expect(Number(await part(page,'line').evaluate(el => el.style.getPropertyValue('--at')))).toBeCloseTo(40 / top, 3);
  const chart = part(page,'chart');
  await expect(chart).toHaveAttribute('role','img');
  await expect(chart).toHaveAttribute('aria-label','최근 7일 연습 시간. 목요일 45분 목표 달성, 금요일 20분, 토요일 0분, 일요일 40분 목표 달성, 월요일 52분 목표 달성, 화요일 41분 목표 달성, 오늘 22분. 오늘 목표 40분');
  await expect(chart.locator('.vz-tp-key')).toHaveText('목표 40분');
  // The marks are drawn for the reached days only, and the bars equal the home week model's days.
  expect(await result(page).locator('.vz-tp-day').evaluateAll(days => days.map(d => getComputedStyle(d.querySelector('.vz-tp-mark')).opacity !== '0'))).toEqual([true,false,false,true,true,true,false]);
  const model = await page.evaluate(() => VzipTodayPractice.recent(VZ.db,{date:VZ.today(),today:VZ.today(),defaultDailyTargetMinutes:VZ.dailyTargetMinutes(),timeEntries:VZ.timeEntries([])}));
  expect(model.map(d => [d.date,d.minutes,d.met])).toEqual(list.map(b => [b.date,b.minutes,b.met]));
});

test('a tap on the ring plays the motion again from the real start', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40, today:32}));
  await pause(page);
  await openPopup(page, 11, {duration:600000});await finish(page);
  await expect(part(page,'percent')).toHaveText('108%');
  const ring = result(page).getByRole('button',{name:'달성률 움직임 다시 보기',exact:true});
  expect(await ring.evaluate(el => el.offsetWidth)).toBeGreaterThanOrEqual(136);
  await ring.click();
  await expect(result(page)).toHaveAttribute('data-phase','run');await expect(part(page,'percent')).toHaveText('80%');
  expect(await laps(page)).toEqual([0.8, 0]);await expect(result(page)).toHaveAttribute('data-reached','false');
  await finish(page);
  await expect(part(page,'percent')).toHaveText('108%');expect(await laps(page)).toEqual([1, 0.075]);
  await expect(result(page)).toHaveAttribute('data-celebrated','2'); // the replay shows the moment again, once
  await expect(popup(page)).toBeVisible();
});

test('it can be closed at any moment, also mid-motion, and onClose runs once each time', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40, today:10}));
  await pause(page);
  const closed = () => page.evaluate(() => window.__closed);
  // Escape while the ring is still moving.
  await openPopup(page, 5);await page.clock.runFor(300);
  await expect(result(page)).toHaveAttribute('data-phase','run');
  await page.keyboard.press('Escape');await expect(popup(page)).toHaveCount(0);expect(await closed()).toBe(1);
  // The ✕, before the first frame; 계속 is still on its way in then.
  await openPopup(page, 5);
  const ok = popup(page).getByRole('button',{name:'계속',exact:true}), x = popup(page).getByRole('button',{name:'닫기',exact:true});
  expect(await popup(page).locator('[data-ok]').evaluate(el => el.getAnimations().map(a => [a.animationName, a.effect.getTiming().delay]))).toEqual([['vz-tp-cta',1000]]);
  expect(await x.evaluate(el => [el.offsetWidth, el.offsetHeight])).toEqual([44,44]);
  await x.click();await expect(popup(page)).toHaveCount(0);expect(await closed()).toBe(2);
  // A tap outside the card, mid-motion.
  await openPopup(page, 5);await page.clock.runFor(500);
  await page.locator('.sheet-back.sheet-alert').click({position:{x:8,y:8}});
  await expect(popup(page)).toHaveCount(0);expect(await closed()).toBe(3);
  // 계속 shows after about a second (CSS, not the script clock) and closes it.
  await openPopup(page, 5);
  await expect(ok).toBeVisible();
  expect(await ok.evaluate(el => el.offsetHeight)).toBeGreaterThanOrEqual(44);
  await ok.click();await expect(popup(page)).toHaveCount(0);expect(await closed()).toBe(4);
  // A second popup replaces the first: the first's onClose runs once, nothing is left behind.
  await openPopup(page, 5);await openPopup(page, 0);
  await expect(popup(page)).toHaveCount(1);expect(await closed()).toBe(5);
  await page.keyboard.press('Escape');expect(await closed()).toBe(6);
  await expect(page.locator('.vz-tp-burst')).toHaveCount(0);
});

test('left alone it closes by itself; touched it stays until closed', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await boot(page, seed({target:40, today:10}));
  await pause(page);
  await openPopup(page, 5);
  await page.clock.runFor(5900);await expect(popup(page)).toHaveCount(1);
  await page.clock.runFor(200);await expect(popup(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__closed)).toBe(1);
  await openPopup(page, 5);await page.clock.runFor(1500);
  await popup(page).locator('[data-today-chart]').click(); // looking at the chart
  await page.clock.runFor(10000);await expect(popup(page)).toHaveCount(1);
  await page.keyboard.press('Escape');expect(await page.evaluate(() => window.__closed)).toBe(2);
});

test('reduced motion: the final state at once, no motion and no pieces', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.emulateMedia({reducedMotion:'reduce'});
  await boot(page, seed({target:40, today:32, past:WEEK}));
  await pause(page); // no frame ever runs: nothing may depend on one
  await openPopup(page, 11);
  const x = await now(page);
  await expect(result(page)).toHaveAttribute('data-phase','done');
  await expect(part(page,'percent')).toHaveText(x.percent + '%');await expect(part(page,'total')).toHaveText('43분');
  expect(await laps(page)).toEqual([1, 0.075]);
  await expect(result(page)).toHaveAttribute('data-state','goal');await expect(result(page)).toHaveAttribute('data-reached','true');
  await expect(result(page)).toHaveAttribute('data-celebrated','0');await expect(popup(page).locator('.vz-tp-burst i')).toHaveCount(0);
  expect((await bars(page))[6]).toMatchObject({minutes:43, met:true});
  expect(await popup(page).evaluate(el => el.getAnimations({subtree:true}).length)).toBe(0);
  await expect(popup(page).getByRole('button',{name:'계속',exact:true})).toBeVisible();
  await expect(part(page,'replay')).toBeHidden();
  expect(await part(page,'plus').evaluate(el => getComputedStyle(el).opacity)).toBe('0'); // the flying "+11분" stays out; the chip below says it
  await expect(part(page,'added')).toHaveText('이번 기록 +11분');
  await popup(page).getByRole('button',{name:'계속',exact:true}).click();await expect(popup(page)).toHaveCount(0);
});

for (const [width, height] of [[320,568],[375,812],[430,932]])
  test('fits a ' + width + 'px phone without sideways scroll, long times included', async ({page}) => {
    await page.setViewportSize({width,height});
    await boot(page, seed({target:90, today:65, past:[125,20,0,90,150,95]}));
    await openPopup(page, 60, {duration:600000}); // 125 of 90 minutes: 2시간 5분, 139%
    await expect(result(page)).toHaveAttribute('data-phase','done');
    await expect(part(page,'total')).toHaveText('2시간 5분');await expect(part(page,'percent')).toHaveText('139%');
    await expect(popup(page).getByRole('button',{name:'계속',exact:true})).toBeVisible();
    const card = await popup(page).boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(0);expect(card.x + card.width).toBeLessThanOrEqual(width);
    expect(card.y).toBeGreaterThanOrEqual(0);expect(card.y + card.height).toBeLessThanOrEqual(height);
    expect(Math.abs(card.x + card.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth,document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
    expect(await popup(page).evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    // Nothing inside is cut off sideways: every text block stays within the card.
    expect(await popup(page).evaluate(el => { const box = el.getBoundingClientRect();
      return [...el.querySelectorAll('h2,.vz-tp-center *,.vz-tp-headline,.vz-tp-hint,.vz-tp-chips p,.vz-tp-chart,.vz-tp-day,[data-ok]')].every(n => { const r = n.getBoundingClientRect();return r.left >= box.left - .5 && r.right <= box.right + .5; }); })).toBe(true);
    expect(await result(page).locator('.vz-tp-center').evaluate(el => [...el.children].every(n => n.scrollWidth <= el.clientWidth - 22))).toBe(true); // inside the ring's stroke
  });

test('tablet: a centred card, not a full-width sheet', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  for (const [width, height] of [[1024,768],[768,1024]]) {
    await page.setViewportSize({width,height});
    if (width === 1024) await boot(page, seed({target:40, today:30, past:WEEK}));
    await openPopup(page, 6, {duration:600000});
    await expect(result(page)).toHaveAttribute('data-phase','done');
    const card = await popup(page).boundingBox();
    expect(card.width).toBeLessThanOrEqual(400);expect(card.width).toBeGreaterThanOrEqual(340);
    expect(Math.abs(card.x + card.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(card.y + card.height / 2 - height / 2)).toBeLessThanOrEqual(1);
    expect((await result(page).locator('.vz-tp-stage').boundingBox()).width).toBe(196);
    await page.keyboard.press('Escape');await expect(popup(page)).toHaveCount(0);
  }
});
