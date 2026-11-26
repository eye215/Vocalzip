// 오늘의 연습 — one set a day on 오늘 › 연습하기: the card (timeline · progress · one button), the dark doing screen for
// every step (timer · paced breathing · reference note + stubbed pitch), 이어서 하기 after leaving, the mic refused →
// timer, 고르기 changing the next set, the 30-second takes around the set with 가리고 듣기, and the ONE practice row a
// finished set writes (이번 달 › 한 것 picks it up). The person's own steps and the wall clock: tests/practice-set.spec.cjs.
// Fake data, a fake clock, a fake mic and a fake pitch: no live account, media or network.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const D = require('../app/daily-set-model.js');
const KEY = 'vocal-zip_mvp_v1', TODAY = '2026-11-04', NOW = '2026-11-04T12:00:00.000Z';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
/** 고르기 with one exercise per group, so the set is the same on any date: 목·어깨 풀기 → “스~” → 허밍 롱톤 → 음 따라 부르기
 * (리듬 rests; the measuring exercises — 사이렌 · 맨 위 음 · 스케일 too — have their own spec, tests/daily-set-measure.spec.cjs). */
const PINNED = {id:'daily-set-prefs', kind:'daily-set-prefs', v:1, off:{'loosen-liptrill':true, 'loosen-hum':true, 'breath-pulse':true, 'breath-hiss':true, 'voice-liptrill5':true, 'voice-mum':true, 'voice-vibrato':true, 'voice-high':true, 'loosen-siren':true, 'ear-scale':true}, groupsOff:{rhythm:true}, replace:{}};
const seed = (extra = {}) => ({categories:[], songs:[{id:'s1', title:'This Is the Moment'}], lessons:[], assignments:[], practices:[], performances:[], comparisonReports:[], dailyGoals:[],
  practicePlans:[{...PINNED}], settings:{voiceCheck:{voiceType:'alto', refNote:60, highNote:69, tones:true}}, ...extra});
/** Fake mic (window.__mic: {opened, stopped, deny}), fake pitch (window.__sing Hz, 0 = silence), reference notes
 * counted in window.__tones, and a screen wake lock that counts (window.__wake). */
function installAudio() {
  window.__mic = {opened:0, stopped:0, deny:false}; window.__sing = 0; window.__tones = []; window.__wake = {asked:0, held:0};
  const fakeMic = async () => {
    if (window.__mic.deny) throw Object.assign(new Error('Permission denied'), {name:'NotAllowedError'});
    window.__mic.opened++;
    return {getTracks:() => [{stop() { window.__mic.stopped++; }}]};
  };
  // Defined on the prototype too: a plain assignment does not replace WebKit's getUserMedia.
  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {value:fakeMic, configurable:true, writable:true});
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:fakeMic, configurable:true, writable:true});
  window.AudioContext = window.webkitAudioContext = class {
    sampleRate = 48000; currentTime = 0; destination = {}; state = 'running';
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    createMediaStreamSource() { return {connect() {}, disconnect() {}}; }
    createAnalyser() { return {fftSize:4096, connect() {}, disconnect() {}, getFloatTimeDomainData(data) { const f = window.__sing; for (let i = 0; i < data.length; i++) data[i] = f ? (window.__amp ?? .2) * Math.sin(2 * Math.PI * f * i / 48000) : 0; }}; }
    createGain() { return {gain:{setValueAtTime() {}, linearRampToValueAtTime() {}}, connect() {}, disconnect() {}}; }
    createOscillator() { const o = {frequency:{value:0}, connect(g) { return g; }, start() { window.__tones.push(Math.round(o.frequency.value * 10) / 10); }, stop() {}, disconnect() {}}; return o; }
  };
  try { Object.defineProperty(navigator, 'wakeLock', {configurable:true, value:{request:async () => { window.__wake.asked++; window.__wake.held++; return {release:async () => { window.__wake.held--; }, addEventListener() {}}; }}}); } catch {}
}
async function boot(page, value = seed(), {time = NOW} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.install({time:new Date(time)});
  await page.addInitScript(installAudio);
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('dset-seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('dset-seeded', '1'); } }, [KEY, JSON.stringify(value)]);
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.goto('/#/home');
  await ready(page);
}
async function ready(page) {
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && typeof window.VZ?.change === 'function' && !!window.VZ.dailySet)).toBe(true);
  await expect(card(page)).toBeVisible();
}
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
// WebKit reloads on goto() to the URL it is already on: addresses change in the page.
const to = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const db = page => page.evaluate(() => JSON.parse(JSON.stringify(VZ.db)));
const section = page => page.locator('.vz-student-home [data-home-practice]');
const card = page => section(page).locator('[data-row="practice-set"]');
const goButton = page => card(page).locator('[data-set-go]');
const goText = page => goButton(page).locator('span'); // the words, without the icon glyph
const line = page => card(page).locator('[data-set-line] li');
const run = page => page.locator('[data-pset-run]');
const primary = page => run(page).locator('[data-run-primary]');
const word = page => run(page).locator('[data-run-word]');
const sub = page => run(page).locator('[data-run-sub]');
const say = page => run(page).locator('[data-run-say]');
const count = page => run(page).locator('[data-run-count-all]');
/** Advance the fake clock: the doing screen ticks ten times a second. */
const elapse = (page, seconds) => page.clock.runFor(Math.round(seconds * 1000));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiOf = name => NAMES.indexOf(name.replace(/-?\d+$/, '')) + 12 * (Number(name.match(/-?\d+$/)[0]) + 1);
/** Sing the note on screen, `cents` away from it (null = stop singing). */
async function sing(page, cents = 0) {
  if (cents == null) return page.evaluate(() => { window.__sing = 0; });
  const midi = midiOf(await run(page).locator('[data-run-note]').innerText());
  await page.evaluate(([m, c]) => { window.__sing = 440 * 2 ** ((m - 69) / 12) * 2 ** (c / 1200); }, [midi, cents]);
}
/** One note of a hold step from its start: hear it, hold it in tune for `hold` seconds, the short cheer. */
async function holdNote(page, hold = 4) {
  await elapse(page, 1.3);
  await sing(page, 6);
  await elapse(page, hold + .2);
  await sing(page, null);
  await elapse(page, 1);
}
async function noOverflow(page) {
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#view *'), ...(document.querySelector('.vz-student-home')?.shadowRoot?.querySelectorAll('[data-home-practice] *') || [])];
    return {wide:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, over:all.filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > innerWidth + 1; }).map(e => e.className || e.tagName).slice(0, 5)};
  });
  expect(r.wide).toBeLessThanOrEqual(1); expect(r.over).toEqual([]);
}
async function targets(locator, min = 44) {
  for (const el of await locator.all()) {
    if (!await el.isVisible()) continue;
    const b = await el.boundingBox();
    expect(b.height, await el.evaluate(e => e.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(min); expect(b.width).toBeGreaterThanOrEqual(44);
  }
}
/** Start today's set from the card with the clock held, so every second is the test's. */
async function start(page) {
  await page.clock.pauseAt(new Date(new Date(await page.evaluate(() => Date.now())).getTime() + 60000));
  await goButton(page).click();
  await expect(run(page)).toBeVisible();
}
/** Skip steps until the one of this mode is on screen. */
async function skipTo(page, mode) {
  for (let i = 0; i < 8 && await run(page).getAttribute('data-mode') !== mode; i++) await run(page).locator('[data-run-skip]').click();
  await expect(run(page)).toHaveAttribute('data-mode', mode);
}

test('오늘 › 오늘 연습: the 오늘의 연습 part shows its progress, "시작하면: …" with the steps unfolding as a timeline, and ONE button; the other rows stay below', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  const value = seed({assignments:[{id:'hw1', title:'립트릴로 고음 연결하기', status:'active', startDate:'2026-11-01', dueDate:'2026-11-08'}]});
  await boot(page, value);
  const before = await db(page);
  // What the model builds is what the card lists.
  const built = D.build(value, {today:TODAY});
  expect(built.steps.map(s => s.id)).toEqual(['next-hw-hw1', 'ex-loosen-neck', 'ex-breath-s', 'ex-voice-hum', 'ex-ear-follow']);
  await expect(card(page).locator('.vz-set-head strong')).toHaveText('오늘의 연습');
  await expect(card(page).locator('.vz-set-head small')).toHaveText('5개 · 약 ' + built.minutes + '분');
  await expect(line(page)).toHaveCount(5);
  await expect(line(page).locator('.vz-set-item b')).toHaveText(['숙제', '목 풀기', '호흡', '발성', '음감 · 추천']);
  await expect(line(page).locator('.vz-set-item span')).toHaveText(['립트릴로 고음 연결하기', '목·어깨 풀기', '“스~” 길게 내쉬기', '허밍 롱톤', '음 따라 부르기']);
  expect(await line(page).evaluateAll(els => els.map(e => e.dataset.state))).toEqual(['next', 'left', 'left', 'left', 'left']);
  await expect(line(page).locator('.vz-set-meta em')).toHaveText(['다음', '남음', '남음', '남음', '남음']);
  await expect(line(page).locator('.vz-set-meta > span:not(.vz-visually-hidden)')).toHaveText(['3분', '3분', '3분', '3분', '3분']);
  expect(await line(page).evaluateAll(els => els.map(e => !!e.querySelector('[data-mic]')))).toEqual([false, false, false, true, true]); // mic badge
  await expect(goText(page)).toHaveText('시작하기 · 약 ' + built.minutes + '분'); // 오늘 연습: the estimated time on the button
  await expect(goButton(page)).toHaveAccessibleName('오늘의 연습 시작하기, 5개 약 ' + built.minutes + '분, 처음 립트릴로 고음 연결하기');
  await expect(card(page).locator('[data-set-pick]')).toHaveAccessibleName('오늘의 연습 편집');
  await expect(card(page).locator('[data-set-pick]')).toContainText('편집');
  // "시작하면: …" says the steps shortly; the timeline unfolds under it (collapsed at first).
  await expect(card(page).locator('[data-set-summary]')).toHaveText('시작하면: 숙제 → 기본기 4개');
  await expect(card(page).locator('[data-set-line]')).toBeHidden();
  await card(page).locator('[data-set-summary]').click();await expect(card(page).locator('[data-set-line]')).toBeVisible();
  // One card, then the small rows; the old 연습 세트 row is not there a second time.
  expect(await section(page).locator('[data-row]').evaluateAll(els => els.map(e => [e.dataset.row, e.tagName]))).toEqual([['practice-set', 'DIV'], ['voice-check', 'BUTTON'], ['roadmap', 'BUTTON'], ['weekly-review', 'BUTTON']]);
  await expect(section(page).locator('.vz-practice-row strong')).toHaveText(['매일 보이스 체크', '내 로드맵', '주간 돌아보기']);
  expect(await page.evaluate(() => document.querySelector('.vz-student-home').shadowRoot.querySelector('main').innerText.split('연습 세트').length - 1)).toBe(0);
  expect((await goButton(page).boundingBox()).height).toBeGreaterThanOrEqual(56);
  await targets(card(page).locator('button'));
  for (const [width, height] of [[320, 640], [390, 844], [820, 1180], [1180, 820]]) { await page.setViewportSize({width, height}); await noOverflow(page); }
  // Reading home writes nothing.
  expect(await db(page)).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('practice_set_live')).length)).toBe(0);
});

test('a whole set on the doing screen: timer, paced breathing, held notes with word feedback, then ONE practice row that 이번 달 picks up', async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await start(page);
  // Doing is dark and alone on the screen: no header, no menu; the screen stays awake.
  await expect(page.locator('body')).toHaveClass(/vz-set-run/);
  await expect(page.locator('.v-nav')).toBeHidden(); await expect(page.locator('#top')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme)).toBe('dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0911');
  await expect.poll(() => page.evaluate(() => window.__wake.held)).toBe(1);
  // 1 / 4 목 풀기: the tap that started the set started it; one line to follow, one line of why, a countdown.
  await expect(count(page)).toHaveText('1 / 4');
  expect(await run(page).locator('.dset-bar li').evaluateAll(els => els.map(e => e.className))).toEqual(['is-next', 'is-left', 'is-left', 'is-left']);
  await expect(run(page).locator('[data-run-name]')).toContainText('목 풀기'); await expect(run(page).locator('[data-run-name]')).toContainText('목·어깨 풀기');
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  await expect(say(page)).toHaveText('어깨를 귀까지 올렸다가 툭 떨어뜨려요');
  await expect(run(page).locator('[data-run-why]')).toHaveText('목과 어깨 힘이 풀리면 소리가 훨씬 편하게 나와요');
  await expect(primary(page)).toHaveText('잠깐 멈춤');
  expect((await primary(page).boundingBox()).height).toBeGreaterThanOrEqual(56);
  await targets(run(page).locator('button'));
  await noOverflow(page);
  await elapse(page, 10);
  await expect(run(page).locator('[data-run-count]')).toHaveText('45');
  // 잠깐 멈춤 stops the countdown and the clock; 다시 starts the step over.
  await primary(page).click();
  await expect(primary(page)).toHaveText('계속하기');
  await elapse(page, 300);
  await expect(run(page).locator('[data-run-count]')).toHaveText('45');
  await primary(page).click();
  await elapse(page, 46.5);
  await expect(say(page)).toHaveText('고개를 천천히 좌우로 기울여요');
  await run(page).locator('[data-run-redo]').click();
  await expect(run(page)).toHaveAttribute('data-state', 'ready');
  await expect(say(page)).toHaveText('어깨를 귀까지 올렸다가 툭 떨어뜨려요');
  await primary(page).click();
  await elapse(page, 166);
  // 2 / 4 호흡: the next step waits for its own 시작하기 and says what the last one left.
  await expect(count(page)).toHaveText('2 / 4');
  await expect(run(page).locator('[data-run-last]')).toHaveText('목·어깨 풀기 · 끝');
  await expect(run(page)).toHaveAttribute('data-mode', 'breath'); await expect(run(page)).toHaveAttribute('data-state', 'ready');
  await expect(primary(page)).toHaveText('시작하기');
  await elapse(page, 120); // reading, not practising: never counted
  await primary(page).click();
  await expect(say(page)).toHaveText('코로 천천히 들이쉬어요'); await expect(word(page)).toHaveText('들이쉬기');
  await elapse(page, 4.3);
  await expect(say(page)).toHaveText('“스~” 고르게 내쉬어요'); await expect(word(page)).toHaveText('내쉬기');
  await expect(sub(page)).toHaveText('1 / 9번째 · 이번에는 8초 내쉬어요');
  expect(await run(page).locator('[data-run-orb]').evaluate(e => e.style.transform)).toMatch(/^scale\(/);
  await elapse(page, 153);
  // 3 / 4 발성: the mic is asked for once, in plain words, at the first step that listens.
  await expect(count(page)).toHaveText('3 / 4');
  await expect(run(page).locator('[data-run-name] .dset-badge').first()).toContainText('마이크');
  await primary(page).click();
  await expect(say(page)).toHaveText('마이크를 켜도 될까요?');
  await expect(run(page).locator('[data-run-ask="mic"]')).toContainText('이 화면에서만 듣고, 녹음하거나 저장하지 않아요');
  await expect(primary(page)).toHaveText('마이크 켜기');
  expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
  await primary(page).click();
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  expect(await page.evaluate(() => window.__mic.opened)).toBe(1);
  // The app plays the note itself; then a word first, the cents small.
  await expect(word(page)).toHaveText('들어 보세요');
  const first = await run(page).locator('[data-run-note]').innerText();
  expect(first).toBe(D.noteName(D.notesFor(D.exercise('voice-hum'), D.comfort({voiceCheck:{refNote:60, highNote:69}}), TODAY)[0]));
  expect(await page.evaluate(() => window.__tones.at(-1))).toBeCloseTo(440 * 2 ** ((midiOf(first) - 69) / 12), 0);
  await elapse(page, 1.3);
  await expect(word(page)).toHaveText('소리를 내 보세요');
  await sing(page, 40); await elapse(page, .5);
  await expect(word(page)).toHaveText('조금 높아요'); await expect(sub(page)).toHaveText(/^\+40 cent · 0\.0 \/ 4초$/);
  await sing(page, -60); await elapse(page, .5);
  await expect(word(page)).toHaveText('조금 낮아요');
  await sing(page, 20); await elapse(page, 1);
  await expect(word(page)).toHaveText('그대로 유지!'); await expect(sub(page)).toHaveText(/^\+20 cent · \d\.\d \/ 4초$/);
  await sing(page, 6); await elapse(page, 1);
  await expect(word(page)).toHaveText('딱 맞아요');
  await elapse(page, 2.3);
  await expect(word(page)).toHaveText('좋아요!'); // four seconds inside ±25 cent
  await sing(page, null); await elapse(page, 1);
  for (let i = 1; i < 5; i++) await holdNote(page);
  // 4 / 4 음감: no second question about the mic.
  await expect(count(page)).toHaveText('4 / 4');
  await expect(run(page).locator('[data-run-last]')).toHaveText('허밍 롱톤 · 음 5개 중 5개 맞췄어요');
  await expect(say(page)).toHaveText('들린 음을 “아~”로 4초 동안 이어요');
  await primary(page).click();
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  await expect(run(page).locator('[data-run-ask]')).toHaveCount(0);
  // The octave rule is said on the screen, and holds: the same note an octave lower counts.
  await expect(run(page).locator('[data-run-rule]')).toHaveText('한 옥타브 위나 아래로 불러도 맞은 것으로 쳐요');
  await elapse(page, 1.3);
  await sing(page, -1200 + 6); await elapse(page, 1);
  await expect(word(page)).toHaveText('딱 맞아요'); await expect(sub(page)).toHaveText(/^\+6 cent · /);
  await elapse(page, 3.2); await sing(page, null); await elapse(page, 1);
  for (let i = 1; i < 4; i++) await holdNote(page);
  await elapse(page, 1.3); await elapse(page, 21); // the last note is never matched: the set moves on by itself
  // Summary (light again): what was done, measured time only.
  const summary = page.locator('.pset-summary');
  await expect(summary).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/vz-set-run/);
  expect(await page.evaluate(() => window.__mic.opened - window.__mic.stopped)).toBe(0); // the mic is let go
  await expect.poll(() => page.evaluate(() => window.__wake.held)).toBe(0);
  await expect(summary.locator('.pset-row .pset-state')).toHaveText(['완료', '완료', '완료', '완료']);
  await expect(summary.locator('[data-min]')).toHaveCount(0); // nothing to type: these were measured
  await expect(summary.locator('.pset-row').nth(2)).toContainText(/음 5개 중 5개 · 맞은 시간 \d+%/);
  await expect(summary.locator('.pset-row').nth(3)).toContainText('음 5개 중 4개');
  await noOverflow(page);
  expect((await db(page)).practices).toEqual([]); // nothing is written before 기록 저장
  await page.getByRole('button', {name:'기록 저장'}).click();
  await expect(page.getByRole('heading', {name:'오늘 연습을 기록했어요'})).toBeVisible();
  const rows = (await db(page)).practices;
  expect(rows).toHaveLength(1); // ONE practice record
  const row = rows[0];
  expect(row).toEqual(expect.objectContaining({date:TODAY, practiceMode:'training', practiceTimeSource:'practice-set', categoryLabel:'오늘의 연습', memo:'[오늘의 연습] 4개 중 4개'}));
  expect(row.id).toBe('practice-set:' + row.practiceSetId);
  const items = row.dailySet.items;
  expect(items.map(x => [x.exercise, x.group, x.state])).toEqual([['loosen-neck', 'loosen', 'done'], ['breath-s', 'breath', 'done'], ['voice-hum', 'voice', 'done'], ['ear-follow', 'ear', 'done']]);
  // Real active time: 10 + 46.5 + 165 s of 목 풀기 (the pause and the wait are not in it), 156 s of breathing.
  expect(items[0].seconds).toBeGreaterThanOrEqual(221); expect(items[0].seconds).toBeLessThanOrEqual(223);
  expect(items[1].seconds).toBeGreaterThanOrEqual(156); expect(items[1].seconds).toBeLessThanOrEqual(158);
  expect(items[1]).toEqual(expect.objectContaining({mode:'breath', rounds:9, longestOut:16}));
  expect(items[2]).toEqual(expect.objectContaining({mode:'hold', parts:5, holdSeconds:20}));
  expect(items[2].accuracy).toBeGreaterThan(70); expect(items[2].notes.map(n => n.ok)).toEqual([true, true, true, true, true]);
  expect(items[3].notes.map(n => n.ok)).toEqual([true, true, true, true, false]); expect(items[3].holdSeconds).toBe(16);
  expect(row.minutes).toBeCloseTo(items.reduce((n, x) => n + x.seconds, 0) / 60, 1);
  expect(row.manualMinutes).toBe(row.minutes); expect(row.mediaIds).toEqual([]);
  const minutes = Math.round(row.minutes);
  await expect(page.locator('.pset-done')).toContainText('연습 ' + minutes + '분 · 4개 중 4개');
  // 오늘: the card says the set is done; 이번 달 › 한 것 counts the minutes once.
  await page.clock.resume();
  await to(page, '#/home'); await ready(page);
  await expect(card(page)).toHaveAttribute('data-state', 'done');
  await expect(card(page).locator('.vz-set-head small')).toHaveText('오늘 연습 끝 · ' + minutes + '분');
  expect(await line(page).evaluateAll(els => els.map(e => e.dataset.state))).toEqual(['done', 'done', 'done', 'done']);
  await expect(goText(page)).toHaveText('한 번 더 하기');
  await to(page, '#/growth');
  await expect(page.locator('[data-gm-section="done"] [data-gm-tile="minutes"] strong')).toHaveText(minutes + '분');
  expect(await page.evaluate(() => VZ.todayPractice().minutes)).toBeCloseTo(row.minutes, 1);
});

test('leaving in the middle keeps today\'s progress: 이어서 하기 comes back to the same step and nothing is counted while away', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await start(page);
  await elapse(page, 60);
  await run(page).locator('[data-run-exit]').click();
  await ready(page);
  await expect(page.locator('body')).not.toHaveClass(/vz-set-run/);
  await expect(card(page)).toHaveAttribute('data-state', 'live');
  await expect(card(page).locator('.vz-set-head small')).toHaveText('0 / 4 · 약 12분');
  await expect(goText(page)).toHaveText('이어서 하기 · 목·어깨 풀기');
  await expect(page.locator('.pset-mini')).toBeHidden(); // an exercise is never timed away from its screen
  await elapse(page, 900);
  await goButton(page).click();
  await expect(run(page)).toHaveAttribute('data-state', 'ready');
  await expect(count(page)).toHaveText('1 / 4');
  await primary(page).click();
  await elapse(page, 166);
  await expect(count(page)).toHaveText('2 / 4');
  // Another app in the middle of a step: it pauses by itself.
  await primary(page).click();
  await elapse(page, 20);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => true}); Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.fastForward(600000);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => false}); Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => 'visible'}); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(run(page)).toHaveAttribute('data-state', 'paused');
  await expect(primary(page)).toHaveText('계속하기');
  // A reload (iOS dropping the page): the same step, waiting, the first one still done.
  await page.reload();
  await page.clock.resume();
  await expect(count(page)).toHaveText('2 / 4');
  await expect(run(page)).toHaveAttribute('data-state', 'ready');
  await run(page).locator('[data-run-exit]').click();
  await ready(page);
  await expect(card(page).locator('.vz-set-head small')).toHaveText('1 / 4 · 약 12분');
  expect(await line(page).evaluateAll(els => els.map(e => e.dataset.state))).toEqual(['done', 'next', 'left', 'left']);
  await expect(line(page).locator('.vz-set-meta em')).toHaveText(['완료', '다음', '남음', '남음']);
  await expect(goText(page)).toHaveText('이어서 하기 · “스~” 길게 내쉬기');
  await goButton(page).click();
  await expect(count(page)).toHaveText('2 / 4');
  // Stop here: the summary has the real seconds — 60 + 166 of the first step, 20 of the second — and nothing else.
  await run(page).locator('[data-run-stop]').click();
  const secs = await page.locator('.pset-summary [data-sec]').evaluateAll(els => els.map(e => Number(e.dataset.sec)));
  expect(secs[0]).toBeGreaterThanOrEqual(225); expect(secs[0]).toBeLessThanOrEqual(227);
  expect(secs[1]).toBeGreaterThanOrEqual(20); expect(secs[1]).toBeLessThanOrEqual(21);
  expect(secs.slice(2)).toEqual([0, 0]);
  await expect(page.locator('.pset-summary .pset-row .pset-state')).toHaveText(['완료', '안 함', '안 함', '안 함']);
  await expect(page.getByRole('button', {name:'이어서 하기'})).toBeVisible();
  expect((await db(page)).practices).toEqual([]);
});

test('mic refused: the steps that listen fall back to a timer and say so, once', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await page.evaluate(() => { window.__mic.deny = true; });
  await start(page);
  await skipTo(page, 'hold');
  await primary(page).click();
  await expect(say(page)).toHaveText('마이크를 켜도 될까요?');
  await primary(page).click();
  await expect(run(page).locator('[data-run-notice]')).toHaveText('마이크를 쓸 수 없어서 타이머로 진행해요. 기기 설정에서 마이크를 허용하면 음정을 바로 알려 드려요.');
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  await elapse(page, 1.3);
  await expect(word(page)).toHaveText('“음~” 이어요');
  await expect(sub(page)).toContainText('마이크 없이 타이머로 해요');
  await expect(run(page).locator('[data-run-rule]')).toBeHidden(); // nothing is being matched
  await page.evaluate(() => { window.__sing = 300; }); // singing changes nothing: nobody is listening
  await elapse(page, 5 * (1.2 + 6 + .9) + 3);
  // The next listening step does not ask again.
  await expect(count(page)).toHaveText('4 / 4');
  await expect(run(page).locator('[data-run-last]')).toHaveText('허밍 롱톤 · 끝');
  await expect(sub(page)).toContainText('마이크 없이 타이머로 해요');
  await primary(page).click();
  await expect(run(page).locator('[data-run-ask]')).toHaveCount(0);
  await expect(run(page).locator('[data-run-notice]')).toHaveText('마이크 없이 타이머로 진행해요.');
  await elapse(page, 5 * (1.2 + 6 + .9) + 3);
  await expect(page.locator('.pset-summary .pset-row').nth(2)).toContainText('타이머로 했어요');
  await page.getByRole('button', {name:'기록 저장'}).click();
  const row = (await db(page)).practices[0];
  expect(row.dailySet.items.slice(2).map(x => [x.state, x.timer, x.accuracy, x.holdSeconds])).toEqual([['done', true, undefined, undefined], ['done', true, undefined, undefined]]);
  expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
  // "마이크 없이" chosen by hand works the same way.
  await page.evaluate(() => { window.__mic.deny = false; });
  await to(page, '#/home'); await ready(page);
  await goButton(page).click(); // 한 번 더 하기
  await skipTo(page, 'hold');
  await primary(page).click();
  await run(page).locator('[data-mic-off]').click();
  await expect(run(page).locator('[data-run-notice]')).toHaveText('마이크 없이 타이머로 진행해요.');
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
});

test('the comfortable range is asked once when nothing is known, and kept', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({settings:{}}));
  await start(page);
  await skipTo(page, 'hold');
  await expect(sub(page)).toHaveText('처음 한 번만, 편한 음 높이를 물어봐요');
  await primary(page).click();
  await expect(say(page)).toHaveText('편한 음 높이를 한 번만 알려 주세요');
  await expect(primary(page)).toBeDisabled();
  await targets(run(page).locator('[data-range]'));
  await run(page).locator('[data-range="57"]').click(); // 테너
  expect(await page.evaluate(() => window.__tones.at(-1))).toBeCloseTo(220, 0); // it plays what was picked
  await primary(page).click();
  await expect(say(page)).toHaveText('마이크를 켜도 될까요?');
  expect((await db(page)).practicePlans.find(p => p.id === 'daily-set-prefs').comfort).toEqual({low:55, high:64});
  await primary(page).click();
  const note = midiOf(await run(page).locator('[data-run-note]').innerText());
  expect(note).toBeGreaterThanOrEqual(55); expect(note).toBeLessThanOrEqual(64);
  // The next note step uses it without asking.
  await run(page).locator('[data-run-skip]').click();
  await primary(page).click();
  await expect(run(page).locator('[data-run-ask]')).toHaveCount(0);
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
});

test('편집: ONE screen — a built-in row says which exercises take turns or rests its group, 연습 추가 puts it back; kept as the one 고르기 row', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  // (A goal on the next day keeps that day's once-a-day goal prompt closed.)
  await boot(page, seed({practicePlans:[], dailyGoals:[{id:'gx', date:'2026-11-05', title:'가사 읽기', source:'personal', completed:true, order:0}]}));
  await card(page).locator('[data-set-pick]').click();
  const plan = page.locator('.pset-plan');
  await expect(plan).toBeVisible();
  // No 고르기 sheet, no 순서 · 기억하기 controls: rows and one 연습 추가.
  await expect(plan.locator('[data-pick],[data-reorder],[name=pset-remember]')).toHaveCount(0);
  await expect(plan.locator('[data-add]')).toHaveText('연습 추가');
  await targets(plan.locator('[data-edit],[data-add],[data-start]'));
  await noOverflow(page);
  // 목 풀기: the group's exercises, today's marked; at least one stays on.
  const loosen = plan.locator('.pset-row[data-kind="exercise"]').first();
  await loosen.locator('[data-edit]').click();
  const sheet = page.locator('[data-group-sheet="loosen"]');
  await expect(sheet.locator('.dset-opt')).toHaveCount(D.exercisesOf('loosen').length);
  await expect(sheet.locator('.dset-opt').filter({hasText:'· 오늘'})).toHaveCount(1);
  for (const e of D.exercisesOf('loosen')) await sheet.locator('.dset-opt').filter({has:page.locator('[value="' + e.id + '"]')}).click();
  await page.getByRole('button', {name:'저장'}).click();
  await expect(sheet.locator('[data-sheet-error]')).toHaveText('하나는 켜 두세요. 다 쉬려면 ‘목 풀기 쉬기’를 눌러요.');
  expect((await db(page)).practicePlans).toEqual([]);
  await sheet.locator('.dset-opt').filter({has:page.locator('[value="loosen-hum"]')}).click();
  await page.getByRole('button', {name:'저장'}).click();
  await expect(sheet).toHaveCount(0);
  await expect(plan.locator('.pset-row[data-step="ex-loosen-hum"]')).toHaveCount(1);
  // 음감 쉬기 takes the group out; 연습 추가 › 음감 · 다시 넣기 puts it back.
  await plan.locator('.pset-row[data-kind="exercise"]').filter({hasText:'음감'}).locator('[data-edit]').click();
  await page.locator('[data-group-sheet="ear"] [data-rest]').click();
  await expect(plan.locator('.pset-row[data-kind="exercise"]').filter({hasText:'음감'})).toHaveCount(0);
  let row = (await db(page)).practicePlans.filter(p => p.kind === 'daily-set-prefs');
  expect(row).toHaveLength(1);
  expect(row[0]).toEqual(expect.objectContaining({id:'daily-set-prefs', off:{'loosen-neck':true, 'loosen-liptrill':true, 'loosen-siren':true}, groupsOff:{ear:true}, recording:false}));
  await plan.locator('[data-add]').click();
  await page.locator('.pset-add-option[data-key="group:ear"]').click();
  await expect(plan.locator('.pset-row[data-kind="exercise"]').filter({hasText:'음감'})).toHaveCount(1);
  row = (await db(page)).practicePlans.filter(p => p.kind === 'daily-set-prefs');
  expect(row).toHaveLength(1); expect(row[0].groupsOff).toEqual({});
  // The card follows at once, and tomorrow's 목 풀기 is 허밍 again.
  await to(page, '#/home');
  await expect(line(page).first().locator('.vz-set-item span')).toHaveText('허밍');
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00.000Z'));
  await page.reload(); await ready(page);
  await expect(line(page).first().locator('.vz-set-item span')).toHaveText('허밍');
});

test('연습 전후 30초 녹음: turned on in 고르기, saved as practice recordings linked to the set, then 가리고 듣기 for the pair', async ({page}) => {
  test.setTimeout(60000);
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  // A fake recorder (the real VZ.media.capture needs a mic): a short real WAV, saved through the real VZ.media.saveBlob.
  await page.evaluate(() => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(8000 * Math.sin(2 * Math.PI * 220 * i / sr)), true);
    window.__captures = 0;
    VZ.media.capture = async ({onLevel} = {}) => {
      window.__captures++; let t0 = 0;
      return {start() { t0 = Date.now(); }, seconds:() => t0 ? (Date.now() - t0) / 1000 : 0, state:'recording',
        async stop() { onLevel?.(0); return {blob:new Blob([buf], {type:'audio/wav'}), type:'audio/wav', durationSeconds:Math.min(30, Math.round((Date.now() - t0) / 100) / 10), waveform:[.2, .4, .3], releaseProtection() {}}; },
        cancel() {}};
    };
  });
  await expect(line(page)).toHaveCount(4);
  // 편집 › 연습 추가 › 연습 전후 30초 녹음: a song to sing (and where), then 넣기.
  await card(page).locator('[data-set-pick]').click();
  await page.locator('.pset-plan [data-add]').click();
  await page.locator('.pset-add-option[data-key="takes"]').click();
  const sheet = page.locator('[data-rec-sheet]');
  await page.getByRole('button', {name:'넣기'}).click();
  await expect(sheet.locator('[data-sheet-error]')).toHaveText('녹음할 곡을 골라 주세요.');
  await sheet.getByLabel('부를 곡').selectOption('s1');
  await sheet.locator('[name=phrase]').fill('후렴 첫 두 줄');
  await page.getByRole('button', {name:'넣기'}).click();
  await expect(page.locator('.pset-plan .pset-row[data-kind="take"]')).toHaveCount(2);
  await to(page, '#/home');
  await expect(line(page)).toHaveCount(6);
  await expect(line(page).first()).toContainText('연습 전 30초 녹음'); await expect(line(page).last()).toContainText('연습 후 30초 녹음');
  await start(page);
  // Before the first step: a take, up to 30 seconds. It is not started by itself.
  await expect(count(page)).toHaveText('1 / 6');
  await expect(run(page)).toHaveAttribute('data-mode', 'take'); await expect(run(page)).toHaveAttribute('data-state', 'ready');
  await expect(say(page)).toHaveText('This Is the Moment 한 구절을 30초 안으로 불러요');
  await expect(sub(page)).toHaveText('부를 곳 · 후렴 첫 두 줄 · 녹음 길이는 연습 시간에 더하지 않아요');
  await expect(primary(page)).toHaveText('녹음 시작');
  await primary(page).click();
  await expect(primary(page)).toHaveText('녹음 끝내기');
  await elapse(page, 12);
  await expect(run(page).locator('[data-run-count]')).toHaveText('0:18');
  await primary(page).click();
  await expect(count(page)).toHaveText('2 / 6');
  await expect(run(page).locator('[data-run-last]')).toHaveText('연습 전 30초 녹음 · 저장했어요');
  // One real step, the rest skipped, then the take after the last step runs to its 30-second end by itself.
  await primary(page).click();
  await elapse(page, 166);
  await skipTo(page, 'take');
  await expect(count(page)).toHaveText('6 / 6');
  await expect(word(page)).toHaveText('처음과 같은 구절을 불러요');
  await primary(page).click();
  await elapse(page, 31);
  await expect(page.locator('.pset-summary')).toBeVisible();
  expect(await page.evaluate(() => window.__captures)).toBe(2);
  await expect(page.locator('.pset-summary .pset-row').first()).toContainText('녹음 1개 연결');
  await page.getByRole('button', {name:'기록 저장'}).click();
  // The takes are ordinary practice recordings of that song (트레이닝), linked to the set; their length adds no minutes.
  const data = await db(page), row = data.practices[0];
  expect(data.practices).toHaveLength(1);
  const media = await page.evaluate(async () => (await VZ.media.list(true)).map(m => ({id:m.id, name:m.name, source:m.source, origin:m.origin, category:m.recordingCategory, songId:m.songId, slot:m.dailySet?.slot, run:m.dailySet?.run, date:m.recordedDate, seconds:m.durationSeconds})));
  expect(media).toHaveLength(2);
  const before = media.find(m => m.slot === 'before'), after = media.find(m => m.slot === 'after');
  for (const m of [before, after]) expect(m).toEqual(expect.objectContaining({source:'practice', origin:'daily-set', category:'training', songId:'s1', run:row.practiceSetId, date:TODAY}));
  expect(before.name).toContain('연습 전'); expect(after.name).toContain('연습 후'); expect(after.seconds).toBe(30); expect(before.seconds).toBe(12);
  expect(row.mediaIds).toEqual([before.id, after.id]);
  expect(row.dailySet.recording).toEqual({songId:'s1', phrase:'후렴 첫 두 줄', beforeId:before.id, afterId:after.id});
  expect(row.minutes).toBeGreaterThan(2.7); expect(row.minutes).toBeLessThan(2.85); // the 166 s of the one step, no recording time
  expect(row.dailySet.items.filter(x => x.kind === 'take').map(x => [x.state, x.seconds])).toEqual([['done', 0], ['done', 0]]);
  // 가리고 듣기: the existing blind A/B, with this pair.
  const pair = page.locator('[data-pset-pair]');
  await expect(pair.getByRole('button', {name:'가리고 듣기 · 연습 전후 비교'})).toBeVisible();
  await page.clock.resume();
  await pair.getByRole('button').click();
  const lc = page.locator('[data-lc]');
  await expect(page.locator('.sheet-head h2').last()).toHaveText('두 녹음 들어 보고 비교');
  await expect(lc.locator('[data-lc-blind]')).toBeChecked();
  expect((await lc.locator('[data-lc-take]').evaluateAll(els => els.map(e => e.value))).sort()).toEqual([before.id, after.id].sort());
  await expect(lc.locator('[data-lc-label="A"]')).toHaveText('어느 녹음인지 가려 뒀어요');
});

test('곡: the set ends with 곡에 적용하기 and an optional 녹음, the doing screen opens the song and its 레슨 지적, 편집 can take it out', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practices:[{id:'p0', date:'2026-11-03', minutes:10, manualMinutes:10, songId:'s1', practiceMode:'song'}],
    scoreAnnotations:[{id:'point:pt1', kind:'score-point', songId:'s1', text:'호흡을 끊지 않기', measures:{from:3, to:4}, created:1}]}));
  // The latest practised song, as 오늘 연습 세트 ended (a running monthly plan's song comes first: tests/daily-set-model.test.cjs).
  await expect(line(page)).toHaveCount(6);
  await expect(line(page).locator('.vz-set-item b')).toHaveText(['목 풀기', '호흡', '발성', '음감 · 추천', '곡', '녹음']);
  await expect(line(page).locator('.vz-set-item span').nth(4)).toHaveText('곡에 적용하기 · This Is the Moment');
  await expect(line(page).nth(4).locator('.vz-set-meta > span:not(.vz-visually-hidden)')).toHaveText('10분');
  await expect(card(page).locator('.vz-set-head small')).toHaveText('6개 · 약 25분');
  await noOverflow(page);
  await start(page);
  for (let i = 0; i < 4; i++) await run(page).locator('[data-run-skip]').click();
  // A plain timer step of the person's own kind, with the way to the song.
  await expect(count(page)).toHaveText('5 / 6');
  await expect(run(page)).toHaveAttribute('data-mode', 'free');
  await expect(run(page).locator('[data-run-name] b')).toHaveText('곡');
  // Its 가사·표현 task (the former 노래 연습실's, by the date): the task's name big, its instruction, why it is today's.
  const task = D.applyTask({}, TODAY);
  await expect(run(page).locator('[data-run-name] span').first()).toHaveText('곡에 적용하기 · This Is the Moment');
  await expect(say(page)).toHaveText(task.name);
  await expect(run(page).locator('[data-run-why]')).toHaveText(task.text);
  await expect(run(page).locator('[data-run-task="' + task.key + '"]')).toHaveText('가사·표현 과제 5개가 돌아가며 나와요 · 원래 노래 연습실 과제');
  await expect(run(page).locator('[data-song-open]')).toHaveText('곡 열기');
  await expect(run(page).locator('[data-song-points]')).toHaveText('레슨 지적 1개 · 부르면서 체크');
  await targets(run(page).locator('.pset-links a'));
  await noOverflow(page);
  await primary(page).click();
  await elapse(page, 30);
  await expect(run(page).locator('[data-clock]')).toHaveText('9:30');
  // On the song's screen the step goes on (the small timer shows it); back, it is still running.
  await run(page).locator('[data-song-points]').click();
  await expect(page).toHaveURL(/#\/song\/s1$/);
  await elapse(page, 30);
  await expect(page.locator('.pset-mini [data-time]')).toHaveText('9:00');
  await expect(page.locator('.pset-mini [data-name]')).toHaveText('곡에 적용하기 · This Is the Moment');
  await page.locator('.pset-mini [data-open]').click();
  await expect(run(page).locator('[data-clock]')).toHaveText('9:00');
  await primary(page).click(); // 다 했어요
  await expect(count(page)).toHaveText('6 / 6');
  await expect(run(page).locator('[data-run-name]')).toContainText('녹음'); await expect(run(page).locator('[data-run-name]')).toContainText('선택');
  await run(page).locator('[data-run-skip]').click();
  // The song keeps its own practice row (a minute of song practice), next to the set's row.
  expect(await page.locator('.pset-summary [data-min]').evaluateAll(list => list.map(i => i.value))).toEqual(['1', '0']);
  await page.getByRole('button', {name:'기록 저장'}).click();
  const rows = (await db(page)).practices.filter(p => p.practiceSetId);
  expect(rows.map(p => [p.id.replace(/practice-set:[^:]+/, 'set'), p.minutes, p.practiceMode, p.songId]).sort()).toEqual([['set', 0, 'training', ''], ['set:song-s1', 1, 'song', 's1']]);
  expect(rows.find(p => p.dailySet).dailySet.items.at(-2)).toEqual(expect.objectContaining({kind:'song', apply:true, state:'done', row:rows.find(p => p.songId).id, roomTask:task.key}));
  expect((await db(page)).practices.some(p => p.practiceRoom || p.categoryLabel === '노래 연습실')).toBe(false); // nothing written as 노래 연습실
  // 편집 › 곡에 적용하기 › 빼기: its 녹음 goes with it, and the next sets end with the built-in groups (kept as the set).
  await page.clock.resume();
  await to(page, '#/home'); await ready(page);
  await card(page).locator('[data-set-pick]').click();
  await page.locator('.pset-plan .pset-row').filter({hasText:'곡에 적용하기'}).locator('[data-edit]').click();
  await page.locator('[data-own-sheet] [data-remove]').click();
  await expect(page.locator('.pset-plan .pset-row').filter({hasText:'곡에 적용하기'})).toHaveCount(0);
  await expect(page.locator('.pset-plan .pset-row[data-kind="record"]')).toHaveCount(0);
  expect((await db(page)).practicePlans.find(p => p.id === 'practice-set-template:default').removed).toEqual(expect.arrayContaining(['song', 'record']));
  await page.locator('.pset-plan [data-start]').click();
  await expect(count(page)).toHaveText('1 / 4');
});

test('the doing screen fits phones and tablets, keeps 44px targets and stays still with reduced motion', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390, height:844});
  await boot(page);
  await start(page);
  const fits = async () => {
    for (const [width, height] of [[320, 640], [390, 844], [820, 1180], [1180, 820]]) {
      await page.setViewportSize({width, height});
      await noOverflow(page);
      await targets(run(page).locator('button'));
      expect((await primary(page).boundingBox()).height, width + ' primary').toBeGreaterThanOrEqual(56);
      const b = await primary(page).boundingBox();
      expect(b.y + b.height, width + ' primary on screen').toBeLessThanOrEqual(Math.max(height, await page.evaluate(() => document.documentElement.scrollHeight)) + 1);
    }
    await page.setViewportSize({width:390, height:844});
  };
  await fits();
  await skipTo(page, 'breath');
  await primary(page).click();
  await elapse(page, 6.5);
  // Reduced motion: the circle does not grow and shrink; the count and the bar still tell the pace.
  expect(await run(page).locator('[data-run-orb]').evaluate(e => [e.style.transform, getComputedStyle(e).transform])).toEqual(['', 'none']);
  await expect(run(page).locator('[data-run-count]')).toHaveText('6');
  await fits();
  await skipTo(page, 'hold');
  await primary(page).click(); await primary(page).click();
  await elapse(page, 1.3); await sing(page, 6); await elapse(page, 1);
  await fits();
  // Words are whole sentences in 해요체; nothing on the screen is cut off.
  expect(await run(page).evaluate(el => [...el.querySelectorAll('.dset-say,.dset-why,.dset-word,.dset-sub')].filter(e => e.scrollWidth > e.clientWidth + 1).length)).toBe(0);
});

test('a finished set on 오늘: a step under a minute says its seconds, not "0분" (2026-11-25)', async ({page}) => {
  const value = seed(), date = NOW.slice(0, 10);
  const item = (id, title, seconds, state = 'done') => ({id, kind:'exercise', title, state, seconds, minutes:seconds / 60});
  value.practices = [...(value.practices || []), {id:'practice-set:s-short', date, minutes:2.5, manualMinutes:2.5, practiceTimeSource:'practice-set', practiceMode:'training', songId:'',
    memo:'[오늘의 연습] 3개 중 2개', mediaIds:[], completed:[], created:1,
    dailySet:{v:1, minutes:2.5, items:[item('a', '허밍 롱톤', 30), item('b', '립트릴', 120), item('c', '“스~” 길게', 0, 'skipped')]}}];
  await boot(page, value);
  await expect(card(page)).toHaveAttribute('data-state', 'done');
  await expect(line(page).locator('.vz-set-meta > span:not(.vz-visually-hidden)')).toHaveText(['30초', '2분', '0분']);
});

test('소리 안내: on a hold, 2 s with no note heard says why — nothing reaches the mic, too quiet, — and goes once a note is heard', async ({page}) => {
  await boot(page);
  await start(page);
  await skipTo(page, 'hold');
  await primary(page).click(); await primary(page).click();
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  await elapse(page, 1.3);               // the note is played; now it is the singer's turn
  await elapse(page, 1);
  await expect(sub(page)).not.toContainText('소리가');          // not after one second
  await elapse(page, 1.5);
  await expect(sub(page)).toHaveText('소리가 안 들려요 · 폰 아래쪽 마이크를 막지 않았는지 봐 주세요');
  // A voice under the floor (about −53 dBFS): too quiet.
  await page.evaluate(() => { window.__amp = .003; }); await sing(page, 0);
  await elapse(page, .5);
  await expect(sub(page)).toHaveText('소리가 작게 들려요 · 조금 더 크게 불러 보세요');
  // Heard: the usual reading comes back.
  await page.evaluate(() => { window.__amp = .2; });
  await elapse(page, .5);
  await expect(sub(page)).toContainText(' / 4초');
  await expect(sub(page)).not.toContainText('소리가');
});

test('곡에 적용하기: the set list names the task; a 보이스 체크 of 목 상태 1–2 done during the set turns it into the task without singing', async ({page}) => {
  await boot(page, seed({practices:[{id:'p0', date:'2026-11-03', minutes:10, manualMinutes:10, songId:'s1', practiceMode:'song'}],
    performances:[{id:'pf1', title:'정기 공연', status:'preparing', start:'2026-11-20', songLinks:[{songId:'s1'}]}]}));
  await card(page).locator('[data-set-pick]').click();
  // A performance within 30 days: 공연 연습 녹음과 회고, named on the row.
  await expect(page.locator('.pset-plan .pset-row').filter({hasText:'곡에 적용하기'}).locator('[data-room-task="performance"]')).toHaveText('공연 연습 녹음과 회고');
  await page.locator('.pset-plan [data-start]').click();
  await expect(run(page)).toBeVisible();
  // The 목 상태 of today's 보이스 체크 (1–2) is known before 곡에 적용하기 starts: rest comes first.
  await page.evaluate(d => VZ.change(db => { db.practices.push({id:'voice-check:t1', date:d, minutes:.5, practiceMode:'training', practiceTimeSource:'voice-check', voiceCheck:{v:1, selfRating:2, at:Date.now()}}); }, {silent:true}), TODAY);
  await skipTo(page, 'free');
  await expect(say(page)).toHaveText('가사의 상대와 목적 정하기');
  await expect(run(page).locator('[data-run-why]')).toHaveText('누구에게, 무엇을 전하고 싶은지 구체적으로 적어봐요.');
  await expect(run(page).locator('[data-run-task="reflection"]')).toHaveText('직접 남긴 불편함이나 목 상태를 우선했어요 · 소리 없이 해요');
});

/* AI 청취 코멘트 on the 녹음 step (2026-11-26): the 노래 연습실 request (window.vzipCloudCoach, stubbed and counted here),
 * only after a confirm; the comment is kept on the 녹음 step's item of the ONE run row. */
const songSeed = () => seed({practices:[{id:'p0', date:'2026-11-03', minutes:10, manualMinutes:10, songId:'s1', practiceMode:'song'}]});
const NOTE = '들리는 특징: 끝음이 또렷해요\n먼저 확인: 숨을 고르게\n다음 시도: 후렴을 한 번 더';
async function coachStub(page, pending = false) {
  await page.evaluate(([note, pending]) => {
    window.__coach = [];
    window.vzipCloudSignedIn = () => true;
    window.vzipCloudCoach = async input => { window.__coach.push(input); return pending ? new Promise(done => { window.__release = () => done({note}); }) : {note}; };
  }, [NOTE, pending]);
}
/** The 녹음 step: skip there, open the recorder, a recording of `bytes` saved for the song, back to the set. */
async function recordTake(page, bytes) {
  for (let i = 0; i < 10 && !await run(page).locator('[data-record]').count(); i++) await run(page).locator('[data-run-skip]').click();
  await run(page).locator('[data-record]').click();
  await expect(page).toHaveURL(/#\/record/);
  await page.evaluate(async bytes => {
    const id = 'take-' + bytes;
    await VZ.media.saveBlob({id, name:'녹음 ' + bytes, created:Date.now(), recordedDate:VZ.today(), dateSource:'recorded', type:'audio/wav', source:'practice', recordingCategory:'song', songId:'s1',
      blob:new Blob([new Uint8Array(bytes)], {type:'audio/wav'}), durationSeconds:2});
  }, bytes);
  await to(page, '#/practice-set');
  await expect(run(page).locator('[data-ai-coach]')).toBeVisible();
}
const calls = page => page.evaluate(() => window.__coach.length);

test('녹음 step › AI 청취 코멘트: nothing is sent over 5 MB or before 보내기 (nor after 취소); one request after it, kept on the 녹음 item, shown on the summary, the done screen and 연습 기록', async ({page}) => {
  test.setTimeout(60000);
  const value = songSeed(), task = D.applyTask(value, TODAY);
  await boot(page, value);
  await coachStub(page);
  await start(page);
  // Over 5 MB: said at once, nothing asked, nothing sent.
  await recordTake(page, 5 * 1024 * 1024 + 10);
  await run(page).locator('[data-ai-coach]').click();
  await expect(run(page).locator('[data-coach-state]')).toHaveText('AI 청취는 5MB 이하 녹음만 보낼 수 있어요. 짧게 다시 녹음해 주세요.');
  await expect(page.getByRole('button', {name:'보내기'})).toHaveCount(0);
  expect(await calls(page)).toBe(0);
  // A short take: the confirm says what is sent; 취소 sends nothing.
  await recordTake(page, 4000);
  await expect(run(page).locator('[data-linked]')).toContainText('녹음 2개');
  await run(page).locator('[data-ai-coach]').click();
  const dialog = page.locator('.sheet').filter({hasText:'AI 청취 코멘트 받기'});
  await expect(dialog).toContainText('이 단계의 마지막 녹음, 오늘 과제(“' + task.name + '” · ' + task.text + '), 곡 제목(“This Is the Moment”)을 보내요.');
  await expect(dialog).toContainText('가사나 메모, 다른 기록은 보내지 않아요.');
  expect(await calls(page)).toBe(0);
  await page.getByRole('button', {name:'취소'}).click();
  await expect(page.getByRole('button', {name:'보내기'})).toHaveCount(0);
  expect(await calls(page)).toBe(0);
  // 보내기: one request with the recording, the task and the song title only.
  await run(page).locator('[data-ai-coach]').click();
  await page.getByRole('button', {name:'보내기'}).click();
  await expect(run(page).locator('[data-coach-note]')).toContainText('끝음이 또렷해요');
  expect(await calls(page)).toBe(1);
  const input = await page.evaluate(() => { const x = window.__coach[0]; return {...x, audio:{mime:x.audio.mime, size:x.audio.data.length}}; });
  expect(input).toEqual(expect.objectContaining({mode:'audio', task:task.name, taskId:task.key, summary:task.text, song:'This Is the Moment', lyrics:'', translation:'', lyricNotes:'', memo:'', answers:[]}));
  expect(input.audio).toEqual({mime:'audio/wav', size:Math.ceil(4000 / 3) * 4});
  await expect(run(page).locator('[data-ai-coach]')).toHaveText('AI 청취 코멘트 다시 받기');
  // Finish: the summary shows it; saving keeps it on the 녹음 item only.
  await primary(page).click(); await primary(page).click();
  await expect(page.locator('.pset-summary [data-coach-note]')).toContainText('끝음이 또렷해요');
  await page.getByRole('button', {name:'기록 저장'}).click();
  await expect(page.locator('[data-done-coach]')).toContainText('후렴을 한 번 더');
  const data = await db(page), row = data.practices.find(p => p.dailySet);
  const withNote = row.dailySet.items.filter(x => 'aiCoach' in x);
  expect(withNote.map(x => [x.kind, x.aiCoach])).toEqual([['record', NOTE]]);
  expect(typeof withNote[0].aiCoachAt).toBe('number');
  expect(row.dailySet.items.filter(x => 'aiCoachAt' in x)).toHaveLength(1);
  expect(await calls(page)).toBe(1);
  // 연습 기록 › the run's detail.
  await page.getByRole('link', {name:'연습 기록 보기'}).click();
  await page.locator('[data-practice="' + row.id + '"]').click();
  await expect(page.locator('[data-practice-coach]')).toContainText('끝음이 또렷해요');
  await expect(page.locator('[data-practice-coach]')).toContainText('녹음 · This Is the Moment');
});

test('녹음 step › AI 청취 코멘트 that comes after the set is saved: put on the 녹음 item of the run row in place, shown on the done screen', async ({page}) => {
  test.setTimeout(60000);
  await boot(page, songSeed());
  await coachStub(page, true);
  await start(page);
  await recordTake(page, 3000);
  await run(page).locator('[data-ai-coach]').click();
  await page.getByRole('button', {name:'보내기'}).click();
  await expect(run(page).locator('[data-ai-coach]')).toHaveText('코멘트를 받는 중…');
  await expect(run(page).locator('[data-ai-coach]')).toBeDisabled();
  await primary(page).click(); await primary(page).click();
  await page.getByRole('button', {name:'기록 저장'}).click();
  await expect(page.locator('[data-coach-wait]')).toBeVisible();
  const before = await db(page), saved = before.practices.find(p => p.dailySet);
  expect(saved.dailySet.items.some(x => 'aiCoach' in x)).toBe(false);
  await page.evaluate(() => window.__release());
  await expect(page.locator('[data-done-coach] [data-coach-note]')).toContainText('끝음이 또렷해요');
  await expect(page.locator('[data-coach-wait]')).toHaveCount(0);
  const after = await db(page), row = after.practices.find(p => p.id === saved.id);
  expect(after.practices).toHaveLength(before.practices.length);
  const strip = r => ({...r, dailySet:{...r.dailySet, items:r.dailySet.items.map(({aiCoach, aiCoachAt, ...x}) => x)}});
  expect(strip(row)).toEqual(saved);
  expect(row.dailySet.items.find(x => x.kind === 'record').aiCoach).toBe(NOTE);
  expect(await calls(page)).toBe(1);
});
