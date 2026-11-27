// 단계 (app/levels.js, app/levels-model.js): the chips on 오늘 (Lv · 이름, then the eight 기본기) and the 단계 page they open — the
// 큰 단계 card with today's points, the 기본기 tiles in every state, an area's page with its progress, the 선생님 지적
// 배지, the 기준표 as text with 복사 — then a finished set that completes the third day of a step (the step is kept and
// told once, on the screen after saving), and the kept rows following the account through a sync (data-merge.js, as
// cloud-sync.js does). Fake data, a fake clock, a fake mic and a fake pitch: no live account, media or network.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const L = require('../app/levels-model.js'), D = require('../app/daily-set-model.js');
const {TODAY, day, ONLY_EAR, setRow, seed, rich, boot} = require('./helpers/levels-fixture.cjs');

test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
// WebKit reloads on goto() to the URL it is already on: addresses change in the page.
const to = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const db = page => page.evaluate(() => JSON.parse(JSON.stringify(VZ.db)));
const homeLine = page => page.locator('.vz-student-home .vz-level-row');
const chip = page => page.locator('.vz-student-home [data-home-level]');
const streak = page => page.locator('.vz-student-home [data-home-week] .vz-week-strip-text');
/** The chip's spoken name says how far the next level is (the thin bar under it is gone, 2026-11-27). */
const chipSays = async page => expect(chip(page)).toHaveAccessibleName(await page.evaluate(() => VZ.levels.home().label));
const host = page => page.locator('[data-lv-host]');
const tile = (page, area) => host(page).locator('.lv-tile[data-area="' + area + '"]');
const plans = async (page, kind) => (await db(page)).practicePlans.filter(p => p.kind === kind);
async function noOverflow(page) {
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#view *,.sheet *'), ...(document.querySelector('.vz-student-home')?.shadowRoot?.querySelectorAll('.vz-header,.vz-header *,.vz-week-strip,.vz-week-strip *,.vz-level-row') || [])];
    return {wide:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, over:all.filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > innerWidth + 1; }).map(e => e.className || e.tagName).slice(0, 5)};
  });
  expect(r.wide).toBeLessThanOrEqual(1); expect(r.over).toEqual([]);
}
async function targets(locator, min = 44) {
  for (const el of await locator.all()) {
    if (!await el.isVisible()) continue;
    const b = await el.boundingBox();
    expect(b.height, await el.evaluate(e => e.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(min - .1); expect(b.width).toBeGreaterThanOrEqual(min - .1);
  }
}
const SIZES = [[390, 844], [820, 1180], [1180, 820]];
const sync = (page, remote) => page.evaluate(remote => {
  const storage = window.VzipAccountScope?.storage || localStorage, merged = window.VzipDataMerge.merge(window.VZ.db, remote).data;
  storage.setItem('vocal-zip_mvp_v1', JSON.stringify(merged)); window.dispatchEvent(new CustomEvent('vzip:data-changed', {detail:{source:'cloud-merge'}}));
}, remote);

test('오늘: the "Lv · 이름" chip leads the 단계 chips and opens 단계; the level never drops when records are deleted', async ({page}) => {
  // Nothing yet: Lv 1, and reading home writes nothing.
  const empty = seed();
  await boot(page, empty);
  await expect(chip(page)).toBeVisible();
  await expect(chip(page)).toHaveText('Lv 1 · ' + L.LEVELS[0].name);
  await expect(chip(page)).toHaveAccessibleName('큰 단계 Lv 1, ' + L.LEVELS[0].name + ', 다음 단계까지 100점, 단계 보기');
  // The eight 기본기 follow it, in the order of 단계, none measured yet.
  await expect(homeLine(page).locator('[data-home-area]')).toHaveCount(8);
  await expect(homeLine(page).locator('[data-home-area]').first()).toHaveAccessibleName('호흡, 아직, 자세히 보기');
  expect((await db(page)).practicePlans).toEqual([]);
  // Five finished sets (150 points): Lv 2, a quarter of the way to Lv 3; the week's days above say five days in a row.
  await page.evaluate(rows => VZ.change(d => { d.practices.push(...rows); }), [16, 17, 18, 19, 20].map(n => setRow(day(n))));
  await expect(chip(page)).toHaveText('Lv 2 · ' + L.LEVELS[1].name);
  await chipSays(page);expect(await page.evaluate(() => VZ.levels.home().percent)).toBe(25);
  await expect(chip(page)).toHaveAttribute('data-level', '2');
  await expect(streak(page)).toHaveText('이번 주 연속 5일');
  for (const [width, height] of SIZES) {
    await page.setViewportSize({width, height});
    // A 44px target of its own, inside the row it sits in.
    const box = await chip(page).boundingBox(), line = await homeLine(page).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(43.9); expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeGreaterThanOrEqual(line.y - .5); expect(box.y + box.height).toBeLessThanOrEqual(line.y + line.height + .5);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // No two targets overlap: its box does not intersect the bell, the settings button, the week's days or any card of the home.
    const hits = await page.evaluate(() => { const root = document.querySelector('.vz-student-home').shadowRoot, c = root.querySelector('[data-home-level]').getBoundingClientRect();
      const others = [...root.querySelectorAll('[aria-label="알림"],[aria-label="설정"],.vz-week-strip,.vz-card,.vz-summary')].filter(e => e.getClientRects().length);
      return {checked:others.length, first:!!root.querySelector('[data-home-practice]')?.getClientRects().length,
        over:others.filter(e => { const r = e.getBoundingClientRect(); return r.left < c.right - .5 && r.right > c.left + .5 && r.top < c.bottom - .5 && r.bottom > c.top + .5; }).map(e => e.getAttribute('aria-label') || e.className)}; });
    expect(hits.checked).toBeGreaterThanOrEqual(4); expect(hits.first).toBe(true); expect(hits.over).toEqual([]);
    await noOverflow(page);
  }
  await page.setViewportSize({width:390, height:844});
  // The level passed is kept (one row), so deleting records lowers the points but not the level shown.
  await expect.poll(async () => (await plans(page, 'level-state')).map(p => [p.id, p.level])).toEqual([['level-state', 2]]);
  await page.evaluate(ids => VZ.change(d => { d.practices = d.practices.filter(p => !ids.includes(p.id)); }), [16, 17, 18].map(n => 'practice-set:' + day(n)));
  await expect(streak(page)).toHaveText('이번 주 연속 2일');
  await expect(chip(page)).toHaveText('Lv 2 · ' + L.LEVELS[1].name);
  await chipSays(page);expect(await page.evaluate(() => VZ.levels.home().percent)).toBe(0);
  expect(await page.evaluate(() => VZ.levels.now().points)).toBe(60);
  // Tap: the 단계 page, under the 오늘 tab.
  await chip(page).click();
  await expect(page).toHaveURL(/#\/levels$/);
  await expect(page.locator('#top h1')).toHaveText('단계');
  await expect(page.locator('.v-nav [data-nav="home"]')).toHaveAttribute('aria-current', 'page');
  await expect(host(page).locator('[data-lv-num]')).toHaveText('Lv 2');
  await expect(host(page).locator('[data-lv-points]')).toHaveText('60점 · 다음 Lv 3 ' + L.LEVELS[2].name + '까지 240점');
  await expect(host(page).locator('[data-lv-held]')).toHaveText('기록이 줄어 점수는 내려갔지만, 한 번 오른 단계는 그대로예요.');
  expect((await plans(page, 'level-state'))).toHaveLength(1);
});

test('단계: the level with today\'s points and how to earn them, 기본기 tiles in every state, 선생님 지적 배지', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  const value = rich();
  await boot(page, value, {hash:'#/levels'});
  await expect(host(page).locator('[data-lv-level]')).toBeVisible();
  // (a) 큰 단계: consistency only. 549 points: Lv 3, 83% of the way to Lv 4.
  const lv = L.level(value, {today:TODAY});
  expect([lv.level, lv.points, lv.percent, lv.today.points]).toEqual([3, 549, 83, 59]);
  await expect(host(page).locator('[data-lv-num]')).toHaveText('Lv 3');
  await expect(host(page).locator('[data-lv-name]')).toHaveText(L.LEVELS[2].name);
  await expect(host(page).locator('[data-lv-level] .lv-bar')).toHaveAttribute('aria-valuenow', '83');
  await expect(host(page).locator('[data-lv-points]')).toHaveText('549점 · 다음 Lv 4 ' + L.LEVELS[3].name + '까지 51점');
  await expect(host(page).locator('[data-lv-held]')).toHaveCount(0);
  // Today, with what gave the points.
  await expect(host(page).locator('[data-lv-today] h3')).toHaveText('오늘 받은 점수 59점');
  await expect(host(page).locator('[data-lv-today] li')).toHaveText(['오늘의 연습을 끝까지 했어요+30', '연습 기록을 남겼어요+10', '보이스 체크를 했어요+5', '레슨 지적을 체크했어요+10', '레슨 지적 2개를 지켰어요+4']);
  // How to earn: the table, and what is NOT points.
  await expect(host(page).locator('[data-lv-how] li')).toHaveCount(6);
  await expect(host(page).locator('[data-lv-how] li').first()).toHaveText('오늘의 연습 한 세트를 끝까지30점');
  await expect(host(page).locator('[data-lv-how] .lv-note')).toContainText('하루 최대 60점이에요. 연습 시간과 녹음 길이는 점수가 아니에요.');
  // (b) 기본기: eight tiles, each in its state.
  await expect(host(page).locator('.lv-tile')).toHaveCount(8);
  expect(await host(page).locator('.lv-tile').evaluateAll(els => els.map(e => [e.dataset.area, e.dataset.state]))).toEqual(
    [['breath', 'ready'], ['pitch', 'step'], ['sustain', 'calibrating'], ['path', 'ready'], ['range', 'ready'], ['high', 'ready'], ['vibrato', 'ready'], ['rhythm', 'ready']]);
  // 단계: step n / 5, the 유지 중 mark, and — the next criterion already met on three days — what the next set will do.
  await expect(tile(page, 'pitch').locator('strong')).toHaveText('1 / 5단계');
  await expect(tile(page, 'pitch')).toHaveAttribute('data-keeping', '');
  await expect(tile(page, 'pitch').locator('.lv-keep')).toBeVisible();
  await expect(tile(page, 'pitch').locator('[data-tile-sub]')).toHaveText('다음 연습을 마치면 2단계');
  await expect(tile(page, 'pitch')).toHaveAccessibleName('음정, 1단계, 요즘도 유지 중, 자세히 보기');
  expect(await tile(page, 'pitch').locator('.lv-pips i.is-on').count()).toBe(1);
  // 기준 맞추는 중: the day count and what the draft table gives; no step.
  await expect(tile(page, 'sustain').locator('strong')).toHaveText('기준 맞추는 중');
  await expect(tile(page, 'sustain').locator('[data-tile-sub]')).toHaveText('9일째 · 지금은 2단계쯤');
  expect(await tile(page, 'sustain').locator('.lv-pips i.is-on').count()).toBe(0);
  expect(await tile(page, 'sustain').locator('.lv-pips i.is-ghost').count()).toBe(2);
  // Can be measured, not yet: every area has its measuring exercise now (소리 길 · 고음 too), said so.
  for (const area of ['breath', 'path', 'range', 'high', 'vibrato', 'rhythm']) {
    await expect(tile(page, area).locator('strong')).toHaveText('아직');
    await expect(tile(page, area).locator('[data-tile-sub]')).toHaveText('');   // the card's line says where (UI 정리 2차)
    await expect(tile(page, area)).toHaveAttribute('aria-label', /아직 재지 않았어요/);
  }
  await expect(tile(page, 'path').locator('.lv-tile-name')).toHaveText('소리 길연결');
  // (c) 선생님 지적 배지: what was retired as 이제 됐어요, newest first, apart from the numbers.
  await expect(host(page).locator('[data-badge] strong')).toHaveText(['고음에서 턱 내리기', '12마디 숨 미리 마시기']);
  await expect(host(page).locator('[data-badge] small')).toHaveText(['지금 이 순간 · 11.18 (수) 몸에 붙었어요', 'This Is the Moment · 11.14 (토) 몸에 붙었어요']);
  // Light screen, 44px targets, nothing wider than the screen.
  expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme)).not.toBe('dark');
  await expect(page.locator('body')).not.toHaveClass(/vz-set-run/);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({width, height});
    await targets(host(page).locator('.lv-tile,button'));
    await noOverflow(page);
  }
  // Looking at 단계 awards nothing: steps are only earned when a set is saved.
  expect((await plans(page, 'skill-step')).map(p => p.id)).toEqual(['skill-step:pitch:1']);
  // A record with nothing in it: no badge yet, said plainly.
  await page.evaluate(() => VZ.change(d => { d.scoreAnnotations = []; }));
  await expect(host(page).locator('[data-lv-badges] .lv-empty')).toHaveText('아직 없어요. 곡 화면의 레슨 지적에서 “이제 됐어요”를 고르면 여기에 모여요.');
});

test('an area: the next step in plain words, "3번 중 n번 했어요", recent values, what measures it — in each state', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  const value = rich();
  // 음정 2단계 (5 of 5) met on two days only: the 16th and the 20th.
  for (const p of value.practices) for (const item of p.dailySet?.items || []) for (const m of item.measures || []) if (m.area === 'pitch' && ![day(16), day(20)].includes(p.date)) m.value = Math.min(4, m.value);
  await boot(page, value, {hash:'#/levels'});
  await tile(page, 'pitch').click();
  await expect(page).toHaveURL(/#\/levels\/pitch$/);
  await expect(page.locator('#top h1')).toHaveText('음정');
  const head = host(page).locator('[data-lv-area="pitch"]');
  await expect(head).toHaveAttribute('data-state', 'step');
  await expect(head.locator('[data-lv-state]')).toHaveText('1단계예요');
  await expect(head.locator('[data-lv-keeping]')).toHaveAttribute('data-lv-keeping', 'yes');
  await expect(head.locator('[data-lv-keeping]')).toContainText('요즘도 유지 중');
  // The next step: its criterion, the progress, the days.
  const next = host(page).locator('[data-lv-next]');
  await expect(next.locator('h3')).toHaveText('다음 · 2단계');
  await expect(next.locator('[data-lv-say]')).toHaveText('들은 음 5개를 모두 ±25 cent 안에서 4초씩 유지해요');
  await expect(next.locator('[data-lv-progress]')).toHaveText('3번 중 2번 했어요');
  expect(await next.locator('.lv-dots i.is-on').count()).toBe(2); expect(await next.locator('.lv-dots i').count()).toBe(3);
  await expect(next.locator('[data-lv-days]')).toHaveText('11.16 (월) · 11.20 (금)');
  // Recent values, newest first (observations, no verdict).
  await expect(host(page).locator('[data-lv-recent] li')).toHaveCount(5);
  await expect(host(page).locator('[data-lv-recent] li').first()).toHaveText('11.20 (금)5개 중 5개 유지');
  await expect(host(page).locator('[data-lv-recent] li').nth(1)).toHaveText('11.19 (목)5개 중 4개 유지');
  // The tiny line of the last measured days (it was on 성장 › 나's 기본기 tiles before they became one row).
  await expect(host(page).locator('[data-lv-recent] [data-lv-spark] svg polyline')).toHaveCount(1);
  expect(Number(await host(page).locator('[data-lv-spark]').getAttribute('data-lv-spark'))).toBeGreaterThanOrEqual(2);
  expect(await host(page).innerText()).not.toMatch(/잘해요|재능|못해요|부족/);
  // The five steps: done (with its day), next, later — every one measured by an exercise now.
  expect(await host(page).locator('[data-lv-steps] li').evaluateAll(els => els.map(e => e.dataset.state))).toEqual(['earned', 'next', 'later', 'later', 'later']);
  await expect(host(page).locator('[data-lv-steps] li').first().locator('strong')).toHaveText('1단계 · 했어요 (11.15 (일))');
  await expect(host(page).locator('[data-lv-steps] li').nth(2)).not.toContainText('재는 연습 준비 중');
  // What measures it, and the way into 오늘의 연습 고르기.
  await expect(host(page).locator('[data-lv-exercise] li')).toHaveText(['음 따라 부르기음감 · 마이크를 켜고 할 때만 재요', '스케일 따라 부르기음감 · 마이크를 켜고 할 때만 재요']);
  for (const [width, height] of SIZES) { await page.setViewportSize({width, height}); await targets(host(page).locator('button')); await noOverflow(page); }
  await page.setViewportSize({width:390, height:844});
  // 오늘의 연습 편집: today's list, where the set is changed.
  await host(page).getByRole('button', {name:'오늘의 연습 편집'}).click();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(page.locator('.pset-plan')).toContainText('음감');
  // 기준 맞추는 중: the day, the draft level, and that no step is given yet.
  await to(page, '#/levels/sustain');
  const cal = host(page).locator('[data-lv-area="sustain"]');
  await expect(cal).toHaveAttribute('data-state', 'calibrating');
  await expect(cal.locator('[data-lv-state]')).toHaveText('기준 맞추는 중 · 9일째');
  await expect(cal.locator('[data-lv-estimate]')).toHaveText('지금 기록으로는 2단계쯤이에요');
  await expect(cal).toContainText('처음 14일 동안은 재기만 하고 단계는 정하지 않아요. 6일 뒤부터 단계가 정해져요.');
  await expect(host(page).locator('[data-lv-next] [data-lv-progress]')).toHaveText('3번 중 3번 했어요');
  await expect(host(page).locator('[data-lv-next]')).toContainText('기준 맞추는 중에는 세기만 하고 단계는 올리지 않아요.');
  await expect(host(page).locator('[data-lv-recent] li').first()).toHaveText('11.20 (금)흔들림 11 cent · 6초');
  await expect(host(page).locator('[data-lv-exercise] li strong')).toHaveText(['허밍 롱톤', '“멈” 롱톤']);
  await expect(host(page).locator('[data-lv-limit]')).toHaveCount(0);
  // Not measured yet (음역), with its guardrail said.
  await to(page, '#/levels/range');
  await expect(host(page).locator('[data-lv-area="range"] [data-lv-state]')).toHaveText('아직 재지 않았어요');
  await expect(host(page).locator('[data-lv-next] [data-lv-progress]')).toHaveText('3번 중 0번 했어요');
  await expect(host(page).locator('[data-lv-guard]')).toContainText('가장 높이 낸 한 음이나 큰 소리는 세지 않아요. 편하게 2초 넘게 유지한 음만 세요.');
  // Growth beyond the start is measured by the 스케일 연습 now: no limit line, no step 준비 중.
  await expect(host(page).locator('[data-lv-limit]')).toHaveCount(0);
  expect(await host(page).locator('[data-lv-steps] li').evaluateAll(els => els.map(e => /재는 연습 준비 중/.test(e.textContent)))).toEqual([false, false, false, false, false]);
  await expect(host(page).locator('[data-lv-exercise] li strong')).toHaveText(['허밍 롱톤', '“멈” 롱톤', '맨 위 음 유지', '음 따라 부르기', '스케일 따라 부르기']);
  // 소리 길: measured by 사이렌 (목 풀기), with how it is measured.
  await to(page, '#/levels/path');
  const path = host(page).locator('[data-lv-area="path"]');
  await expect(path).toHaveAttribute('data-state', 'ready');
  await expect(path.locator('[data-lv-state]')).toHaveText('아직 재지 않았어요');
  await expect(host(page).locator('[data-lv-how-to]')).toContainText('사이렌: “우~”로 낮은 음에서 높은 음까지');
  await expect(host(page).locator('[data-lv-next] [data-lv-soon]')).toHaveCount(0);
  await expect(host(page).locator('[data-lv-next] [data-lv-progress]')).toHaveText('3번 중 0번 했어요');
  await expect(host(page).locator('[data-lv-steps] li')).toHaveCount(5);
  await expect(host(page).locator('[data-lv-exercise] li strong')).toHaveText(['사이렌']);
  await noOverflow(page);
  // 고음: skipping is fine, the highest note is not what counts.
  await to(page, '#/levels/high');
  await expect(host(page).locator('[data-lv-guard]')).toHaveText('가장 높은 음이나 큰 소리를 세는 것이 아니에요. 목이 불편한 날은 건너뛰어도 돼요.');
  expect((await plans(page, 'skill-step')).map(p => p.id)).toEqual(['skill-step:pitch:1']);
});

test('기준표 보기: the whole table and my numbers as plain text, 복사 copies it', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  const value = rich();
  await boot(page, value, {hash:'#/levels'});
  await page.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text => { window.__copied = text; }}}); });
  await host(page).getByRole('button', {name:'기준표 보기'}).click();
  const sheet = page.getByRole('dialog', {name:'기준표'});
  await expect(sheet).toBeVisible();
  const text = await sheet.locator('[data-lv-sheet-text]').innerText();
  expect(text).toBe(L.sheetText(value, {today:TODAY}));
  for (const part of ['큰 단계', '지금: Lv 3 · ' + L.LEVELS[2].name + ' · 549점 · 다음 단계까지 51점', '하루 최대 60점', '[음정] 1단계 · 요즘도 유지 중', '다음 2단계: 3번 중 3번 했어요',
    '[지속음] 기준 맞추는 중 · 9일째 · 지금 기록으로는 2단계쯤', '[호흡] 아직 재지 않았어요', '[리듬] 아직 재지 않았어요', '[소리 길(연결)] 아직 재지 않았어요', '5단계: 빠른 박자(1분에 104번)에서 셋잇단음과 당김음을 0.04초 안으로 맞춰요', '내 기록: 11.20 흔들림 11 cent · 6초'])
    expect(text).toContain(part);
  // Numbers only: no ids, no song titles, no badge words.
  for (const hidden of ['practice-set:', 'point:', 'This Is the Moment', '턱 내리기', 'ui-test-user', 'test@example']) expect(text).not.toContain(hidden);
  for (const [width, height] of SIZES) { await page.setViewportSize({width, height}); await noOverflow(page); }
  const copy = page.locator('.sheet-back [data-lv-copy]');
  expect((await copy.boundingBox()).height).toBeGreaterThanOrEqual(43.9);
  await copy.click();
  await expect(copy).toHaveText('복사했어요');
  await expect(page.locator('.toast')).toHaveText('기준표를 복사했어요.');
  expect(await page.evaluate(() => window.__copied)).toBe(text);
});

// The doing screen of 오늘의 연습 (tests/daily-set.spec.cjs has its details): only what this flow needs.
const run = page => page.locator('[data-pset-run]');
const primary = page => run(page).locator('[data-run-primary]');
const elapse = (page, seconds) => page.clock.runFor(Math.round(seconds * 1000));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiOf = name => NAMES.indexOf(name.replace(/-?\d+$/, '')) + 12 * (Number(name.match(/-?\d+$/)[0]) + 1);
async function sing(page, cents = 0) {
  if (cents == null) return page.evaluate(() => { window.__sing = 0; });
  const midi = midiOf(await run(page).locator('[data-run-note]').innerText());
  await page.evaluate(([m, c]) => { window.__sing = 440 * 2 ** ((m - 69) / 12) * 2 ** (c / 1200); }, [midi, cents]);
}
/** One note from its start: hear it, hold it for 4 seconds a little off (`cents`), the short cheer. */
async function holdNote(page, cents = 6) { await elapse(page, 1.3); await sing(page, cents); await elapse(page, 4.2); await sing(page, null); await elapse(page, 1); }
async function startSet(page) {
  await page.clock.pauseAt(new Date(new Date(await page.evaluate(() => Date.now())).getTime() + 60000));
  await page.locator('.vz-student-home [data-row="practice-set"] [data-set-go]').click();
  await expect(run(page)).toBeVisible();
}

test('a finished set that completes the third day of a step: the step is kept, the level too, and both are told once after saving', async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:390, height:844});
  // 음정 measured on the 1st and 2nd (4 of 5 held): two of the three days of step 1, and the 14 days of 기준 맞추는 중 are over.
  // 80 points so far (a finished set and a record on each day): today's set makes 110 — Lv 2.
  const value = seed({practicePlans:[{...ONLY_EAR}], practices:[1, 2].flatMap(n => [setRow(day(n), {pitch:4, sd:null, range:null}),
    {id:'m' + n, date:day(n), minutes:20, manualMinutes:20, practiceTimeSource:'manual', practiceMode:'song', songId:'s1', created:2}])});
  await boot(page, value);
  await expect(chip(page)).toHaveText('Lv 1 · ' + L.LEVELS[0].name);
  expect(L.skill(value, 'pitch', {today:TODAY}).next).toEqual(expect.objectContaining({step:1, count:2, due:false}));
  await startSet(page);
  // 1 / 2 목 풀기 is skipped; 2 / 2 음 따라 부르기 with the mic: five notes, each held for four seconds.
  await run(page).locator('[data-run-skip]').click();
  await expect(run(page)).toHaveAttribute('data-mode', 'hold');
  await primary(page).click();                                   // 시작하기 → 마이크를 켜도 될까요?
  await expect(primary(page)).toHaveText('마이크 켜기');
  await primary(page).click();
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  await expect(page.locator('[data-level-news]')).toHaveCount(0);  // nothing is announced in the middle of practice
  await holdNote(page, 6);
  // The second note is sung an octave under, moving ±8 cent: it counts as the note, with its wobble and octave kept.
  await elapse(page, 1.3);
  for (let i = 0; i < 21; i++) { await sing(page, -1200 + (i % 2 ? 8 : -8)); await elapse(page, .2); }
  await sing(page, null); await elapse(page, 1);
  for (let i = 2; i < 5; i++) await holdNote(page, 6);
  const summary = page.locator('.pset-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('음 5개 중 5개');
  await expect(page.locator('[data-level-news]')).toHaveCount(0);
  expect((await db(page)).practicePlans.map(p => p.kind)).toEqual(['daily-set-prefs']); // nothing is kept before 기록 저장
  await page.getByRole('button', {name:'기록 저장'}).click();
  await expect(page.getByRole('heading', {name:'오늘 연습을 기록했어요'})).toBeVisible();
  // The notice, once, on the screen after saving: the level and the step — what happened, not a verdict.
  const news = page.locator('.pset-done [data-level-news]');
  await expect(news).toBeVisible();
  await expect(news.locator('[data-news="level"]')).toHaveText('Lv 2 · ' + L.LEVELS[1].name + '이 됐어요');
  await expect(news.locator('[data-news="step"]')).toHaveText(['음정 1단계 · 기준을 서로 다른 3일에 채웠어요']);
  await expect(news.getByRole('link', {name:'단계 보기'})).toHaveAttribute('href', '#/levels');
  expect((await news.getByRole('link', {name:'단계 보기'}).boundingBox()).height).toBeGreaterThanOrEqual(43.9); // WebKit reports 43.99997 for a 44px box
  await noOverflow(page);
  // What was written: the run row with the measures of the step, the earned step with its three days, the kept state.
  const after = await db(page), row = after.practices.find(p => p.id.startsWith('practice-set:') && p.date === TODAY), item = row.dailySet.items.find(x => x.exercise === 'ear-follow');
  expect(item.state).toBe('done');
  expect(item.notes.map(n => n.ok)).toEqual([true, true, true, true, true]);
  expect(item.notes.every(n => typeof n.sd === 'number')).toBe(true);
  expect(item.notes[0].sd).toBeLessThan(1);
  expect(item.notes[1].sd).toBeGreaterThan(6); expect(item.notes[1].sd).toBeLessThan(10); expect(item.notes[1].octave).toBe(-1);
  expect(item.measures[0]).toEqual({area:'pitch', kind:'hold', value:5, of:5, unit:'개', hold:4, tolerance:25});
  // 음역: the notes as they were sung — the second one an octave under what was played.
  const sung = D.notesFor(D.exercise('ear-follow'), D.comfort({voiceCheck:{refNote:60, highNote:69}}), TODAY).map((n, i) => n - (i === 1 ? 12 : 0));
  expect(item.notes.map(n => n.midi + 12 * (n.octave || 0))).toEqual(sung);
  expect(item.measures[1]).toEqual({area:'range', kind:'comfortable', value:Math.max(...sung) - Math.min(...sung), unit:'반음', low:Math.min(...sung), high:Math.max(...sung), seconds:2, count:new Set(sung).size});
  expect(after.practicePlans.filter(p => p.kind === 'skill-step')).toEqual([expect.objectContaining({id:'skill-step:pitch:1', kind:'skill-step', area:'pitch', step:1, earned:TODAY,
    days:[{date:day(1), value:4, unit:'개'}, {date:day(2), value:4, unit:'개'}, {date:TODAY, value:5, unit:'개'}]})]);
  expect(after.practicePlans.filter(p => p.kind === 'level-state')).toEqual([expect.objectContaining({id:'level-state', level:2, reached:{2:TODAY}, first:{pitch:day(1), range:TODAY}})]);
  expect(Object.keys(after).filter(k => /level|skill/i.test(k))).toEqual([]); // no new list
  // 오늘 and 단계 follow.
  await page.clock.resume();
  await to(page, '#/home');
  await expect(chip(page)).toHaveText('Lv 2 · ' + L.LEVELS[1].name);
  // The 기본기 chips beside it say the same as the tiles: 음정 1단계 (one segment filled), 음역 기준 맞추는 중.
  const pitchChip = homeLine(page).locator('[data-home-area=pitch]');
  await expect(pitchChip).toHaveAttribute('data-state', 'earned'); await expect(pitchChip.locator('.vz-chip-seg i.is-on')).toHaveCount(1);
  await expect(pitchChip).toHaveAccessibleName('음정, 1단계, 자세히 보기');
  await expect(homeLine(page).locator('[data-home-area=range]')).toHaveAttribute('data-state', 'calibrating');
  await chip(page).click();
  await expect(tile(page, 'pitch').locator('strong')).toHaveText('1 / 5단계');
  await expect(tile(page, 'pitch').locator('[data-tile-sub]')).toHaveText('요즘도 유지 중');
  await expect(tile(page, 'range')).toHaveAttribute('data-state', 'calibrating');
  await expect(host(page).locator('[data-lv-today] li')).toHaveText(['오늘의 연습을 끝까지 했어요+30']);
  // Once: the screen after saving is gone when it is left, and a second set today has nothing new to tell.
  await to(page, '#/practice-set');
  await expect(page.locator('[data-pset-host]')).toBeVisible();
  await expect(page.locator('[data-level-news]')).toHaveCount(0);
  await to(page, '#/home');
  await startSet(page);
  await run(page).locator('[data-run-stop]').click();
  await page.getByRole('button', {name:'기록 저장'}).click();
  await expect(page.getByRole('heading', {name:'오늘 연습을 기록했어요'})).toBeVisible();
  await expect(page.locator('[data-level-news]')).toHaveCount(0);
  expect((await plans(page, 'skill-step'))).toHaveLength(1);
});

test('the kept level and the earned steps follow the account: a sync both ways, no row twice, nothing lost', async ({page, browser}, info) => {
  // The iPad: ten finished sets (300 points, Lv 3) and 음정 measured since the 1st; saving a set keeps the step and the level.
  const value = seed({practices:Array.from({length:10}, (_, i) => setRow(day(i + 1), {pitch:4, sd:null, range:null}))});
  await boot(page, value);
  await page.evaluate(() => VZ.change(d => { window.__news = VZ.levels.afterSave(d, VZ.levels.beforeSave()); }, {silent:true}));
  expect((await db(page)).practicePlans.map(p => [p.id, p.kind]).sort()).toEqual([['level-state', 'level-state'], ['skill-step:pitch:1', 'skill-step']]);
  // The phone starts empty and gets both rows through the merge.
  const u = info.project.use, context = await browser.newContext({viewport:u.viewport, isMobile:u.isMobile, hasTouch:u.hasTouch, deviceScaleFactor:u.deviceScaleFactor, userAgent:u.userAgent, baseURL:new URL(page.url()).origin});
  await context.addInitScript(() => { window.VZIP_DEVICE_SESSIONS_ENABLED = false; window.VZIP_APPROVED_HOME_ENABLED = true; });
  const phone = await context.newPage();
  await boot(phone, seed(), {hash:'#/levels'});
  await expect(host(phone).locator('[data-lv-num]')).toHaveText('Lv 1');
  await sync(phone, await db(page));
  await expect(host(phone).locator('[data-lv-num]')).toHaveText('Lv 3');
  await expect(tile(phone, 'pitch').locator('strong')).toHaveText('1 / 5단계');
  expect((await plans(phone, 'skill-step')).map(p => [p.id, p.earned, p.days.length])).toEqual([['skill-step:pitch:1', day(15), 3]]);
  expect((await plans(phone, 'level-state')).map(p => [p.level, p.first.pitch])).toEqual([[3, day(1)]]);
  // On the phone the practice records are deleted and a 지속음 step is earned (written as a set save writes it).
  await phone.evaluate(row => VZ.change(d => { d.practices = []; d.practicePlans.push(row); }), {id:'skill-step:sustain:1', kind:'skill-step', v:1, area:'sustain', step:1, earned:TODAY, days:[{date:day(4), value:12, unit:'cent'}, {date:day(5), value:14, unit:'cent'}, {date:day(6), value:11, unit:'cent'}], created:5});
  // The level stays (the kept row), the step earned from the deleted records too.
  await expect(host(phone).locator('[data-lv-num]')).toHaveText('Lv 3');
  await expect(host(phone).locator('[data-lv-points]')).toHaveText('0점 · 다음 Lv 4 ' + L.LEVELS[3].name + '까지 600점');
  await expect(tile(phone, 'pitch').locator('strong')).toHaveText('1 / 5단계');
  await expect(tile(phone, 'sustain').locator('strong')).toHaveText('1 / 5단계');
  // Back to the iPad, and once more each way: both steps and ONE state row on both, level 3 everywhere.
  await sync(page, await db(phone)); await sync(phone, await db(page)); await sync(page, await db(phone));
  for (const p of [page, phone]) {
    expect((await plans(p, 'skill-step')).map(x => x.id).sort()).toEqual(['skill-step:pitch:1', 'skill-step:sustain:1']);
    expect((await plans(p, 'level-state')).map(x => x.level)).toEqual([3]);
    expect(await p.evaluate(() => VZ.levels.now().level)).toBe(3);
  }
  await expect(chip(page)).toHaveText('Lv 3 · ' + L.LEVELS[2].name);
  expect(phone.__errors).toEqual([]);
  await context.close();
});
