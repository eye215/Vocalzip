// 기본기 단계 · 호흡 / 리듬 / 비브라토 measured in 오늘의 연습: “스~” 길게, “타” 따라 하기 and 롱톤 비브라토 on the dark
// doing screen — in the set when their group is on, the mic asked once, a word first while doing, a result screen, the
// measure kept in the ONE run row, the 단계 tiles following, a step after 3 different days. The numbers themselves are
// checked on generated signals in tests/daily-measure-model.test.cjs.
// Fake data, a fake clock and a fake mic that "hears" generated sound (a hiss, short “타” bursts, a sung tone with
// vibrato): no live account, media, person or network.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const path = require('path');
const D = require('../app/daily-set-model.js'), M = require('../app/daily-measure-model.js'), L = require('../app/levels-model.js');
const KEY = 'vocal-zip_mvp_v1', TODAY = '2026-11-20', NOW = '2026-11-20T03:00:00.000Z';
const day = n => new Date(Date.UTC(2026, 10, n)).toISOString().slice(0, 10);
const SHOTS = process.env.MEASURE_SHOTS || '';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
/** 고르기 with one measuring exercise only (the others rest), so the set is that one step. */
const ONLY = {
  hiss:{off:{'breath-s':true, 'breath-pulse':true}, groupsOff:{loosen:true, voice:true, ear:true, rhythm:true, song:true}},
  rhythm:{off:{}, groupsOff:{loosen:true, breath:true, voice:true, ear:true, song:true}},
  vibrato:{off:{'voice-liptrill5':true, 'voice-hum':true, 'voice-mum':true, 'voice-high':true}, groupsOff:{loosen:true, breath:true, ear:true, rhythm:true, song:true}},
  scale:{off:{'ear-follow':true}, groupsOff:{loosen:true, breath:true, voice:true, rhythm:true, song:true}},
  high:{off:{'voice-liptrill5':true, 'voice-hum':true, 'voice-mum':true, 'voice-vibrato':true}, groupsOff:{loosen:true, breath:true, ear:true, rhythm:true, song:true}},
  siren:{off:{'loosen-neck':true, 'loosen-liptrill':true, 'loosen-hum':true}, groupsOff:{breath:true, voice:true, ear:true, rhythm:true, song:true}}
};
const prefs = mode => ({id:'daily-set-prefs', kind:'daily-set-prefs', v:1, replace:{}, ...ONLY[mode]});
const seed = (extra = {}) => ({categories:[], songs:[{id:'s1', title:'This Is the Moment'}], lessons:[], assignments:[], practices:[], performances:[], comparisonReports:[], dailyGoals:[],
  practicePlans:[], scoreAnnotations:[], settings:{voiceCheck:{voiceType:'alto', refNote:60, highNote:69, tones:true}}, ...extra});
/** A finished set of an earlier day with one measure (as the runner writes it). */
const runRow = (date, exercise, measures, id = date) => ({id:'practice-set:' + id, date, minutes:2.5, manualMinutes:2.5, practiceTimeSource:'practice-set', practiceMode:'training', songId:'', categoryLabel:'오늘의 연습', detail:'오늘의 연습',
  technique:[], memo:'[오늘의 연습] 1개 중 1개', mediaIds:[], completed:[], assignmentReps:{}, assignmentNotes:{}, practiceSetId:id,
  dailySet:{v:1, minutes:2.5, items:[{id:'ex-' + exercise, kind:'exercise', exercise, group:D.exercise(exercise).group, title:D.exercise(exercise).title, state:'done', seconds:150, minutes:2.5, mode:D.exercise(exercise).mode, mic:true, measures}]},
  created:Date.parse(date + 'T10:00:00Z')});

/**
 * A fake mic that hears what the test puts in: window.__floor (the room), window.__hiss [{from, to, amp}] (s on the audio
 * clock), window.__bursts [{at, amp}] (a “타”: a sharp start that dies away in 0.1 s), window.__voice {from, until, f0,
 * cue, rate, ext} (a sung tone, vibrato after `cue`). Every AudioContext shares one clock that follows the page clock;
 * every sound the app schedules is kept in window.__osc [{f, at, type}].
 */
function installAudio() {
  window.__mic = {opened:0, stopped:0}; window.__osc = []; window.__floor = .0008; window.__hiss = []; window.__bursts = []; window.__voice = null; window.__sing = 0;
  const base = performance.now(), clock = () => (performance.now() - base) / 1000;
  const fakeMic = async () => { window.__mic.opened++; return {getTracks:() => [{stop() { window.__mic.stopped++; }}]}; };
  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {value:fakeMic, configurable:true, writable:true});
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:fakeMic, configurable:true, writable:true});
  const pitchAt = t => {
    // window.__melody [{from, to, f0, f1}]: a pitch gliding from f0 to f1 over [from, to) on the audio clock (스케일 · 사이렌).
    for (const m of window.__melody || []) if (t >= m.from && t < m.to) return m.f0 * (m.f1 / m.f0) ** ((t - m.from) / (m.to - m.from));
    const v = window.__voice; if (!v || t < v.from || t > v.until) return 0; const s = t - v.from; return v.f0 * 2 ** ((s >= v.cue ? v.ext * Math.sin(2 * Math.PI * v.rate * (s - v.cue)) : 0) / 1200); };
  window.AudioContext = window.webkitAudioContext = class {
    sampleRate = 48000; destination = {}; state = 'running';
    get currentTime() { return clock(); }
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    createMediaStreamSource() { return {connect() {}, disconnect() {}}; }
    createAnalyser() {
      return {fftSize:4096, connect() {}, disconnect() {}, getFloatTimeDomainData(data) {
        const sr = 48000, N = data.length, end = clock(), from = end - N / sr, f = pitchAt(end - 1024 / sr) || window.__sing;
        if (f) { for (let i = 0; i < N; i++) data[i] = .2 * Math.sin(2 * Math.PI * f * i / sr); return; }
        const segs = window.__hiss.filter(s => s.to > from && s.from < end), bursts = window.__bursts.filter(b => b.at < end && b.at + .1 > from);
        for (let i = 0; i < N; i++) {
          const t = from + (i + 1) / sr; let a = window.__floor;
          for (const s of segs) if (t > s.from && t <= s.to) a = Math.max(a, s.amp);
          for (const b of bursts) if (t > b.at && t <= b.at + .1) a = Math.max(a, b.amp * Math.exp(-(t - b.at) / .05));
          data[i] = a * Math.SQRT2 * Math.sin(Math.round(t * sr) * 2.1);
        }
      }};
    }
    createGain() { return {gain:{setValueAtTime() {}, linearRampToValueAtTime() {}}, connect(x) { return x; }, disconnect() {}}; }
    createOscillator() { const o = {type:'sine', frequency:{value:0}, connect(g) { return g; }, start(at) { window.__osc.push({f:o.frequency.value, at:at ?? 0, type:o.type}); }, stop() {}, disconnect() {}}; return o; }
  };
  try { Object.defineProperty(navigator, 'wakeLock', {configurable:true, value:{request:async () => ({release:async () => {}, addEventListener() {}})}}); } catch {}
}
async function boot(page, value, {hash = '#/home'} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.install({time:new Date(NOW)});
  await page.addInitScript(installAudio);
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('msr-seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('msr-seeded', '1'); } }, [KEY, JSON.stringify(value)]);
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.goto('/' + hash);
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && typeof window.VZ?.change === 'function' && !!window.VZ.dailySet && !!window.VZ.levels && !!window.VzipDailyMeasure)).toBe(true);
}
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));
const to = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const db = page => page.evaluate(() => JSON.parse(JSON.stringify(VZ.db)));
const card = page => page.locator('.vz-student-home [data-home-practice] [data-row="practice-set"]');
const run = page => page.locator('[data-pset-run]');
const primary = page => run(page).locator('[data-run-primary]');
const word = page => run(page).locator('[data-run-word]');
const host = page => page.locator('[data-lv-host]');
const tile = (page, area) => host(page).locator('.lv-tile[data-area="' + area + '"]');
const elapse = (page, seconds) => page.clock.runFor(Math.round(seconds * 1000));
const audioNow = page => page.evaluate(() => new AudioContext().currentTime);
async function noOverflow(page) {
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#view *')];
    return {wide:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, over:all.filter(e => { const b = e.getBoundingClientRect(); return b.width && b.right > innerWidth + 1; }).map(e => e.className || e.tagName).slice(0, 5)};
  });
  expect(r.wide, 'page wider than the screen by ' + r.wide + 'px').toBeLessThanOrEqual(1); expect(r.over).toEqual([]);
}
async function shot(page, name) { if (SHOTS) await page.screenshot({path:path.join(SHOTS, name + '.png')}); }
/** Start today's set from the card with the clock held, then 시작하기 → 마이크 켜기 (asked once). */
async function startWithMic(page, mode) {
  await expect(card(page)).toBeVisible();
  await page.clock.pauseAt(new Date(new Date(await page.evaluate(() => Date.now())).getTime() + 60000));
  await card(page).locator('[data-set-go]').click();
  await expect(run(page)).toHaveAttribute('data-mode', mode);
  await expect(run(page).locator('[data-run-name] .dset-badge').first()).toContainText('마이크');
  await primary(page).click();
  await expect(primary(page)).toHaveText('마이크 켜기');
  await expect(run(page).locator('[data-run-ask="mic"]')).toContainText('녹음하거나 저장하지 않아요');
  await primary(page).click();
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
}
/** 기록 저장 on the summary, and the popup after it. */
async function saveSet(page) {
  // With 목 풀기 · 호흡 · 발성 all resting, the set's own warm-up step follows: stop there.
  if (await run(page).count()) await run(page).locator('[data-run-stop]').click();
  await expect(page.locator('.pset-summary')).toBeVisible();
  await page.getByRole('button', {name:'기록 저장'}).click();
  const ok = page.locator('.vz-today-popup [data-ok]');
  await expect(page.getByRole('heading', {name:'오늘 연습을 기록했어요'}).or(ok).first()).toBeVisible();
  if (await ok.count()) await ok.click();
  await expect(page.getByRole('heading', {name:'오늘 연습을 기록했어요'})).toBeVisible();
}
const todayItem = async (page, exercise) => (await db(page)).practices.find(p => p.dailySet && p.date === TODAY).dailySet.items.find(x => x.exercise === exercise);

test('오늘의 연습: the measuring exercises are in the set when 호흡 · 리듬 are on, and leave when their group rests', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  // Everything on: 리듬 is a group of its own; 호흡 and 발성 take “스~” 길게 / 롱톤 비브라토 in their turn.
  const all = D.build(seed(), {today:TODAY});
  expect(all.steps.filter(s => s.kind === 'exercise').map(s => s.group)).toEqual(['loosen', 'breath', 'voice', 'ear', 'rhythm']);
  expect(all.steps.find(s => s.group === 'rhythm').exercise).toBe('rhythm-ta');
  const days = Array.from({length:12}, (_, i) => day(i + 1)), seen = new Set(days.flatMap(d => D.build(seed(), {today:d}).steps.map(s => s.exercise)));
  for (const id of ['breath-hiss', 'voice-vibrato', 'rhythm-ta']) expect(seen.has(id), id).toBe(true);
  // On the card: 호흡 with only “스~” 길게 on, and 리듬.
  await boot(page, seed({practicePlans:[{id:'daily-set-prefs', kind:'daily-set-prefs', v:1, off:{'breath-s':true, 'breath-pulse':true}, groupsOff:{song:true}, replace:{}}]}));
  const names = card(page).locator('[data-set-line] li .vz-set-item span'), labels = card(page).locator('[data-set-line] li .vz-set-item b');
  await expect(labels).toHaveText(['목 풀기', '호흡 · 추천', '발성', '음감', '리듬']);
  await expect(names.nth(1)).toHaveText('“스~” 길게');
  await expect(names.nth(4)).toHaveText('“타” 따라 하기');
  // 편집 opens today's list; the 리듬 row's sheet lists its exercises, and 리듬 쉬기 takes it out of the set.
  await card(page).locator('[data-set-pick]').click();
  await expect(page.locator('.pset-plan')).toBeVisible();
  await page.locator('.pset-row[data-step="ex-rhythm-ta"] [data-edit]').click();
  const sheet = page.locator('[data-group-sheet="rhythm"]');
  await expect(sheet.locator('.dset-opt')).toContainText('“타” 따라 하기');
  await sheet.locator('[data-rest]').click();
  await expect(page.locator('.pset-row[data-step="ex-rhythm-ta"]')).toHaveCount(0);
  await to(page, '#/home');
  await expect(labels).toHaveText(['목 풀기', '호흡 · 추천', '발성', '음감']);
});

test('“스~” 길게: the mic times one continuous hiss (a 0.1 s dip does not end it), the result screen says it, the run row keeps it, 단계 starts counting', async ({page}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practicePlans:[prefs('hiss')]}));
  await startWithMic(page, 'hiss');
  // A quiet half second (the floor), 3 s in, then a 22-second hiss with a 100 ms dip, starting 4 s in.
  const t0 = await audioNow(page);
  await page.evaluate(t => { window.__hiss = [{from:t + 4, to:t + 14, amp:.03}, {from:t + 14.1, to:t + 26, amp:.03}]; }, t0);
  await elapse(page, .3);
  await expect(word(page)).toHaveText('잠깐 조용히 해 주세요');
  await elapse(page, 1);
  await expect(word(page)).toHaveText('크게 들이쉬어요');
  await elapse(page, 13);
  await expect(run(page)).toHaveAttribute('data-phase', 'hiss');
  await expect(word(page)).toHaveText('기준을 넘었어요, 계속!');          // past 10 s (the next step's criterion)
  const live = Number(await run(page).locator('[data-run-count]').innerText());
  expect(live).toBeGreaterThan(9.5); expect(live).toBeLessThan(10.5);
  await noOverflow(page);
  await shot(page, '1-hiss-doing-390');
  // The dip did not end it; the hiss ends at 26 s: “22.0초 이었어요”, then the second try (nothing heard) and the result.
  await elapse(page, 13);
  await expect(word(page)).toHaveText(/^2[12]\.\d초 이었어요$/);
  await elapse(page, 2.5 + .6 + 3 + 8.2 + 2.5);
  await expect(run(page)).toHaveAttribute('data-state', 'result');
  await expect(primary(page)).toHaveText('다음으로');
  await expect(word(page)).toHaveText('다음 단계 기준을 채웠어요');
  const big = Number((await run(page).locator('[data-result-big]').innerText()).replace(/[^\d.]/g, ''));
  expect(Math.abs(big - 22)).toBeLessThanOrEqual(.15);
  await expect(run(page).locator('[data-result-lines] li').nth(1)).toHaveText('2번째 · 들리지 않았어요');
  await expect(run(page).locator('[data-result-note]')).toContainText('0.25초 넘게 끊기면');
  expect(await page.evaluate(() => window.__mic.stopped)).toBeGreaterThan(0);   // the mic is off on the result screen
  await noOverflow(page);
  await shot(page, '2-hiss-result-390');
  // Practice time is the exercise's own clock (about 40 s of doing), never a recording.
  await primary(page).click();
  await expect(page.locator('.pset-summary [data-step="ex-breath-hiss"] em')).toHaveText(/^가장 긴 스 2[12](\.\d)?초$/);
  await saveSet(page);
  const item = await todayItem(page, 'breath-hiss');
  expect(item).toEqual(expect.objectContaining({state:'done', mode:'hiss', mic:true}));
  expect(item.seconds).toBeGreaterThan(35); expect(item.seconds).toBeLessThan(50);
  expect(item.measures).toHaveLength(1);
  expect(item.measures[0]).toEqual(expect.objectContaining({area:'breath', kind:'hiss', unit:'초', tries:2, even:expect.any(Number)}));
  expect(Math.abs(item.measures[0].value - 22)).toBeLessThanOrEqual(.15);
  const all = await db(page);
  expect(Object.keys(all).filter(k => /measure|level|skill|breath/i.test(k))).toEqual([]);  // no new list
  expect(JSON.stringify(all)).not.toMatch(/blob|audio\/|\.wav|\.m4a/);                   // no audio kept
  // 단계: 호흡 is measured now — 기준 맞추는 중, day 1, the draft table gives step 2.
  await page.clock.resume();
  await to(page, '#/levels');
  await expect(tile(page, 'breath')).toHaveAttribute('data-state', 'calibrating');
  await expect(tile(page, 'breath').locator('[data-tile-sub]')).toHaveText('1일째 · 지금은 2단계쯤');
  await tile(page, 'breath').click();
  await expect(host(page).locator('[data-lv-recent] li').first()).toContainText('가장 긴 스 2');
});

test('“타” 따라 하기: listen a bar, say it back; onsets ±20 ms around the person\'s own lag pass — earphones rule said on screen', async ({page}) => {
  test.setTimeout(180000);
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practicePlans:[prefs('rhythm')]}));
  await startWithMic(page, 'rhythm');
  const plan = M.rhythmPlan(0), lag = .15;
  for (let r = 0; r < plan.length; r++) {
    // The round starts: its first click tells where its bars are; the person says “타” on every beat to say back, late by
    // the device lag and ±20 ms.
    if (r) await elapse(page, 1.6);                                            // the pause between rounds
    await expect.poll(async () => { await elapse(page, .1); return page.evaluate(() => window.__osc.filter(o => o.f === 1760).length); }, {timeout:20000}).toBeGreaterThanOrEqual((r + 1) * 9);
    const first = await page.evaluate(r => window.__osc.filter(o => o.f === 1760)[r * 9].at, r), tl = M.roundTimeline(plan[r]), base = first - tl.countIn[0];
    await page.evaluate(b => { window.__bursts.push(...b); }, tl.expect.map((t, i) => ({at:base + t + lag + (i % 3 - 1) * .02, amp:.15})));
    if (r === 0) {
      await elapse(page, tl.bars[2].from + 1.2 - (await audioNow(page) - base));    // inside the first say-it-back bar
      await expect(run(page)).toHaveAttribute('data-bar', 'say');
      await expect(run(page).locator('[data-run-bar]')).toHaveText('따라 해요');
      await expect(run(page).locator('[data-run-grid] .dset-note')).toHaveCount(M.PATTERNS[1][0].length);
      await noOverflow(page);
      await shot(page, '3-rhythm-doing-390');
      await elapse(page, tl.bar);
      await expect(word(page)).toHaveText(/^(딱 맞아요|잘 맞아요)$/);          // the word after the bar
      await expect(run(page).locator('[data-run-sub]')).toHaveText(/^박자와 \d+ ms · 4 \/ 4개$/);
    }
    await elapse(page, tl.end + .5 - (await audioNow(page) - base));
  }
  await elapse(page, 1.8);
  await expect(run(page)).toHaveAttribute('data-state', 'result');
  await expect(word(page)).toHaveText('박자에 맞췄어요');
  await expect(run(page).locator('[data-result-lines] li')).toHaveCount(4);   // three rounds and the next step
  await expect(run(page).locator('[data-result-lines] li').first()).toHaveText(/^4분음표 · 80박 · 박자와 \d+ ms · 16 \/ 16개$/);
  await expect(run(page).locator('[data-result-note]')).toContainText('내 “타”의 평균 위치');
  await noOverflow(page);
  await shot(page, '4-rhythm-result-390');
  await primary(page).click();
  await saveSet(page);
  const item = await todayItem(page, 'rhythm-ta');
  expect(item.measures.map(m => [m.area, m.kind, m.level, m.bpm, m.hit, m.method])).toEqual([['rhythm', 'rhythm', 1, 80, 100, 'median'], ['rhythm', 'rhythm', 2, 80, 100, 'median'], ['rhythm', 'rhythm', 3, 80, 100, 'median']]);
  for (const m of item.measures) { expect(m.value).toBeLessThanOrEqual(25); expect(Math.abs(m.offset - lag * 1000)).toBeLessThanOrEqual(20); }
  await page.clock.resume();
  await to(page, '#/levels');
  await expect(tile(page, 'rhythm')).toHaveAttribute('data-state', 'calibrating');
  await expect(tile(page, 'rhythm').locator('[data-tile-sub]')).toHaveText('1일째 · 지금은 3단계쯤');
});

test('롱톤 비브라토: straight for 4 s, vibrato on the cue at two pitches — the rate and width are read live and kept', async ({page}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practicePlans:[prefs('vibrato')]}));
  await startWithMic(page, 'vibrato');
  const notes = D.notesFor(D.exercise('voice-vibrato'), D.comfort({voiceCheck:{refNote:60, highNote:69}}), TODAY);
  expect(notes).toHaveLength(2);
  for (let i = 0; i < 2; i++) {
    await expect(run(page).locator('[data-run-note]')).toHaveText(D.noteName(notes[i]));
    const at = await audioNow(page);
    // After the note is heard (1.2 s): 8.3 s of the note, ±30 cent at 5.5 Hz from 4 s on (6 Hz ±25 on the second).
    await page.evaluate(v => { window.__voice = v; }, {from:at + 1.4, until:at + 1.4 + 8.4, f0:440 * 2 ** ((notes[i] - 69) / 12), cue:4, rate:i ? 6 : 5.5, ext:i ? 25 : 30});
    await elapse(page, 3.5);
    await expect(word(page)).toHaveText('곧게 잘 잇고 있어요');
    await elapse(page, 3.5);
    await expect(word(page)).toHaveText('떨림이 보여요');
    if (!i) { await noOverflow(page); await shot(page, '5-vibrato-doing-390'); }
    await elapse(page, 2.6);
    await expect(word(page)).toHaveText('신호에 맞춰 떨었어요');
    await elapse(page, 1.9);
  }
  await expect(run(page)).toHaveAttribute('data-state', 'result');
  await expect(word(page)).toHaveText('두 높이 모두 신호에 맞췄어요');
  await expect(run(page).locator('[data-result-lines] li').first()).toHaveText(new RegExp('^' + D.noteName(notes[0]) + ' · 비브라토 \\d(\\.\\d)?초 · 1초에 5\\.5번 · 폭 (2[89]|3[01]) cent · 신호에 맞춤$'));
  await noOverflow(page);
  await shot(page, '6-vibrato-result-390');
  await primary(page).click();
  await saveSet(page);
  const [m] = (await todayItem(page, 'voice-vibrato')).measures;
  expect(m).toEqual(expect.objectContaining({area:'vibrato', kind:'vibrato', unit:'초', regular:1, tail:1, straight:1, cued:1, variants:2, of:2, hold:8}));
  expect(m.value).toBeGreaterThanOrEqual(3.5); expect(m.rate).toBeGreaterThanOrEqual(5.4); expect(m.rate).toBeLessThanOrEqual(6.1);
  await page.clock.resume();
  await to(page, '#/levels');
  await expect(tile(page, 'vibrato')).toHaveAttribute('data-state', 'calibrating');
  await expect(tile(page, 'vibrato').locator('[data-tile-sub]')).toHaveText('1일째 · 지금은 4단계쯤');
});

test('3 different days: today\'s hiss is the third day of 호흡 1단계 — kept and told once after saving; two runs on one day count once', async ({page}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:390, height:844});
  // 호흡 measured since the 1st (기준 맞추는 중 is over): 12 s on the 1st, and twice on the 3rd — two different days.
  const hiss = s => [{area:'breath', kind:'hiss', value:s, unit:'초', tries:2}];
  await boot(page, seed({practicePlans:[prefs('hiss')], practices:[runRow(day(1), 'breath-hiss', hiss(12)), runRow(day(3), 'breath-hiss', hiss(11), 'a'), runRow(day(3), 'breath-hiss', hiss(13), 'b')]}));
  expect(L.skill(await db(page), 'breath', {today:TODAY}).next).toEqual(expect.objectContaining({step:1, count:2, due:false}));
  await startWithMic(page, 'hiss');
  const t0 = await audioNow(page);
  await page.evaluate(t => { window.__hiss = [{from:t + 4, to:t + 16, amp:.03}]; }, t0);
  await elapse(page, 17.5);
  await expect(word(page)).toHaveText(/^1[12]\.\d초 이었어요$/);
  await expect(page.locator('[data-level-news]')).toHaveCount(0);          // nothing is told in the middle of practice
  await elapse(page, 2.5 + .6 + 3 + 8.2 + 2.5);
  await expect(run(page)).toHaveAttribute('data-state', 'result');
  await primary(page).click();
  await saveSet(page);
  const news = page.locator('.pset-done [data-level-news]');
  await expect(news.locator('[data-news="step"]')).toHaveText(['호흡 1단계 · 기준을 서로 다른 3일에 채웠어요']);
  const steps = (await db(page)).practicePlans.filter(p => p.kind === 'skill-step');
  expect(steps).toEqual([expect.objectContaining({id:'skill-step:breath:1', area:'breath', step:1, earned:TODAY})]);
  expect(steps[0].days.map(d => d.date)).toEqual([day(1), day(3), TODAY]);
  await page.clock.resume();
  await to(page, '#/levels');
  await expect(tile(page, 'breath').locator('strong')).toHaveText('1 / 5단계');
  await expect(tile(page, 'breath')).toHaveAttribute('data-keeping', '');
  // The next criterion, in plain words, with the count of different days.
  await tile(page, 'breath').click();
  await expect(host(page).locator('[data-lv-next] [data-lv-say]')).toHaveText('“스~”를 한 번에 20초 넘게 이어요');
  await expect(host(page).locator('[data-lv-next] [data-lv-progress]')).toHaveText('3번 중 0번 했어요');
});

test('without the mic: “스~” 길게 runs on a timer, says it, and measures nothing', async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practicePlans:[prefs('hiss')]}));
  await page.clock.pauseAt(new Date(new Date(await page.evaluate(() => Date.now())).getTime() + 60000));
  await card(page).locator('[data-set-go]').click();
  await primary(page).click();
  await run(page).locator('[data-mic-off]').click();
  await expect(run(page)).toHaveAttribute('data-state', 'doing');
  await expect(run(page).locator('[data-run-notice]')).toHaveText('마이크 없이 타이머로 진행해요. 이번에는 재지 않아요.');
  await elapse(page, 4);
  await expect(run(page).locator('[data-run-sub]')).toContainText('마이크 없이 타이머로 해요');
  await elapse(page, 2 * (3 + 20 + 2.3));
  await expect(page.locator('.pset-summary')).toBeVisible();
  await expect(page.locator('.pset-summary [data-step="ex-breath-hiss"] em')).toHaveText('타이머로 했어요');
  await saveSet(page);
  const item = await todayItem(page, 'breath-hiss');
  expect([item.state, item.timer, item.measures]).toEqual(['done', true, undefined]);
  expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
});

test('단계: 호흡 · 비브라토 · 리듬 show their real state, the area page says the exercise and the next criterion; no sideways scroll at 390 and 820', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  // 호흡 measured for 3 days from the 1st (1단계 kept), 리듬 since the 15th (기준 맞추는 중), 비브라토 not yet.
  const hiss = s => [{area:'breath', kind:'hiss', value:s, unit:'초', even:2.6, evenSeconds:s, tries:2}];
  const rhythm = v => [{area:'rhythm', kind:'rhythm', value:v, unit:'ms', level:1, bpm:80, hit:94, extra:0, offset:140, method:'median'}, {area:'rhythm', kind:'rhythm', value:v + 12, unit:'ms', level:2, bpm:80, hit:85, extra:1, offset:150, method:'median'}];
  const value = seed({practices:[runRow(day(1), 'breath-hiss', hiss(14)), runRow(day(2), 'breath-hiss', hiss(15)), runRow(day(4), 'breath-hiss', hiss(17)), runRow(day(18), 'breath-hiss', hiss(19)),
    runRow(day(15), 'rhythm-ta', rhythm(52), 'r15'), runRow(day(19), 'rhythm-ta', rhythm(47), 'r19')],
    practicePlans:[{id:'skill-step:breath:1', kind:'skill-step', v:1, area:'breath', step:1, earned:day(15), days:[{date:day(1), value:14, unit:'초'}, {date:day(2), value:15, unit:'초'}, {date:day(4), value:17, unit:'초'}], created:1}]});
  await boot(page, value, {hash:'#/levels'});
  expect(await host(page).locator('.lv-tile').evaluateAll(els => els.map(e => [e.dataset.area, e.dataset.state]))).toEqual(
    [['breath', 'step'], ['pitch', 'ready'], ['sustain', 'ready'], ['path', 'ready'], ['range', 'ready'], ['high', 'ready'], ['vibrato', 'ready'], ['rhythm', 'calibrating']]);
  await expect(tile(page, 'breath').locator('strong')).toHaveText('1 / 5단계');
  await expect(tile(page, 'breath').locator('[data-tile-sub]')).toHaveText('요즘도 유지 중');
  await expect(tile(page, 'rhythm').locator('strong')).toHaveText('기준 맞추는 중');
  await expect(tile(page, 'rhythm').locator('[data-tile-sub]')).toHaveText('6일째 · 지금은 1단계쯤');
  await expect(tile(page, 'vibrato').locator('strong')).toHaveText('아직 안 쟀어요');
  await expect(tile(page, 'vibrato').locator('[data-tile-sub]')).toHaveText('오늘의 연습에서 재요');
  for (const area of ['breath', 'pitch', 'sustain', 'path', 'range', 'high', 'vibrato', 'rhythm']) await expect(tile(page, area).locator('strong')).not.toHaveText('준비 중');
  await noOverflow(page);
  await host(page).locator('[data-lv-skills]').evaluate(e => e.scrollIntoView({block:'start'}));
  await shot(page, '7-levels-390');
  await page.setViewportSize({width:820, height:1180});
  await noOverflow(page);
  await page.evaluate(() => scrollTo(0, 0));
  await shot(page, '8-levels-820');
  await page.setViewportSize({width:390, height:844});
  // Each area page: what the exercise is, the next criterion in plain words, and the recent numbers.
  const pages = [
    ['breath', '“스~” 길게', '“스~” 길게: 크게 들이쉰 뒤', '“스~”를 한 번에 20초 넘게 이어요', '가장 긴 스 19초 · 세기 흔들림 2.6 dB'],
    ['rhythm', '“타” 따라 하기', '“타” 따라 하기: 박자 소리를 들으며', '4분음표를 “타”로, 박자와 0.08초 안으로 맞춰요', '8분음표·쉼표 80박 · 박자와 59 ms · 85% 맞춤'],
    ['vibrato', '롱톤 비브라토', '롱톤 비브라토: 들은 음을 8초 동안', '롱톤 끝 2초 안에 비브라토가 나타나요 (1초에 4~8번, 폭 15 cent 넘게)', null]];
  for (const [area, exercise, how, next, recent] of pages) {
    await to(page, '#/levels/' + area);
    await expect(host(page).locator('[data-lv-area="' + area + '"]')).toBeVisible();
    await expect(host(page).locator('[data-lv-exercise] li strong')).toHaveText([exercise]);
    await expect(host(page).locator('[data-lv-how-to]')).toContainText(how);
    await expect(host(page).locator('[data-lv-next] [data-lv-say]')).toHaveText(next);
    await expect(host(page).locator('[data-lv-next] [data-lv-soon]')).toHaveCount(0);
    if (recent) await expect(host(page).locator('[data-lv-recent] li').first()).toContainText(recent);
    for (const [width, height] of [[390, 844], [820, 1180]]) { await page.setViewportSize({width, height}); await noOverflow(page); }
    await page.setViewportSize({width:390, height:844});
  }
  // 비브라토 5단계 (모음) is measured too now (from 4단계 the second round is “오~”): nothing is 준비 중.
  expect(await host(page).locator('[data-lv-steps] li').evaluateAll(els => els.map(e => /재는 연습 준비 중/.test(e.textContent)))).toEqual([false, false, false, false, false]);
});

const hzOf = midi => 440 * 2 ** ((midi - 69) / 12);
/** Step the paused clock until the doing screen is in `phase` (a tick is 40 ms). */
async function until(page, phase, most = 15) {
  for (let t = 0; t < most; t += .04) { if (await run(page).getAttribute('data-phase') === phase) return; await elapse(page, .04); }
  throw Error('never reached ' + phase);
}
test('스케일 따라 부르기: hear it, sing it back to the beat; the key rises a round at a time; 여기까지 할게요 ends it; 음정 % and the comfortable tops kept', async ({page}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practicePlans:[prefs('scale')]}));
  await startWithMic(page, 'scale');
  const comfort = D.comfort({voiceCheck:{refNote:60, highNote:69}}), keys = M.scaleKeys('scale5', comfort);
  expect(keys[0]).toBe(59);
  await expect(run(page).locator('[data-run-scale] li')).toHaveCount(9);
  for (let k = 0; k < 3; k++) {
    await expect(run(page).locator('[data-run-note]')).toHaveText(D.noteName(keys[k]) + ' 스케일');
    await until(page, 'sing');
    const at = await audioNow(page), plan = M.scalePlan('scale5', keys[k]);
    // Every note in tune, 0.1 s late (the top held for its whole 2.8 s); the second round's 미 30 cent sharp (still right).
    await page.evaluate(m => { window.__melody = m; }, plan.map((n, i) => ({from:at + n.at + .1, to:at + n.at + n.dur + .1, f0:hzOf(n.midi + (k === 1 && i === 2 ? .3 : 0)), f1:hzOf(n.midi + (k === 1 && i === 2 ? .3 : 0))})));
    await elapse(page, 1.3);
    await expect(run(page).locator('[data-run-scale] li.is-now')).toHaveCount(1);
    if (!k) { await noOverflow(page); await shot(page, '9-scale-doing-390'); }
    await until(page, 'review');
    await expect(word(page)).toHaveText('모두 맞았어요');
    await expect(run(page).locator('[data-run-sub]')).toHaveText('맨 위 ' + D.noteName(keys[k] + 7) + '을 편하게 2초 넘게 이었어요');
    await until(page, 'listen');
  }
  // The fourth key: rather not today.
  await run(page).locator('[data-run-enough]').click();
  await expect(run(page)).toHaveAttribute('data-state', 'result');
  await expect(word(page)).toHaveText('아주 정확해요');
  await expect(run(page).locator('[data-result-big]')).toHaveText('100%');
  await expect(run(page).locator('[data-result-lines] li')).toHaveText(['맞은 음 27 / 27 · 3개 조', '편하게 2초 넘게 이은 맨 위 음 · F#4–G#4', '여기까지 하기로 했어요', /^다음 3단계 · 5음 스케일을 80% 넘게/]);
  await noOverflow(page);
  await shot(page, '10-scale-result-390');
  await primary(page).click();
  await saveSet(page);
  const ms = (await todayItem(page, 'ear-scale')).measures;
  expect(ms).toEqual([{area:'pitch', kind:'scale5', value:100, unit:'%', right:27, of:27, rounds:3},
    {area:'range', kind:'comfortable', value:2, unit:'반음', low:66, high:68, seconds:2, count:3, from:'scale'}]);
  await page.clock.resume();
  await to(page, '#/levels/pitch');
  await expect(host(page).locator('[data-lv-recent] li').first()).toContainText('5음 스케일 100% 맞춤 · 27음');
});

test('사이렌: hear the bottom and the top, glide up and back on “우~”; a break is said; the best glide is kept for 소리 길', async ({page}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practicePlans:[prefs('siren')]}));
  await startWithMic(page, 'siren');
  await expect(run(page).locator('.dset-glide-low')).toHaveText('B3');
  await expect(run(page).locator('.dset-glide-top')).toHaveText('G#4');
  const glide = (at, gap) => gap ? [{from:at, to:at + 1.5, f0:hzOf(52), f1:hzOf(58)}, {from:at + 1.8, to:at + 3, f0:hzOf(58), f1:hzOf(64)}, {from:at + 3, to:at + 6, f0:hzOf(64), f1:hzOf(52)}]
    : [{from:at, to:at + 3, f0:hzOf(52), f1:hzOf(64)}, {from:at + 3, to:at + 6, f0:hzOf(64), f1:hzOf(52)}];
  for (const [i, gap] of [[0, false], [1, true]]) {
    await until(page, 'wait');
    const at = await audioNow(page);
    await page.evaluate(m => { window.__melody = m; }, glide(at + .2, gap));
    await elapse(page, 1.6);
    await expect(word(page)).toHaveText('올라가요');
    if (!i) { await expect(run(page).locator('[data-run-glide]')).toHaveAttribute('data-on', '1'); await noOverflow(page); await shot(page, '11-siren-doing-390'); }
    await until(page, 'review');
    await expect(word(page)).toHaveText(gap ? '중간에 끊겼어요' : '끊김 없이 이었어요');
    await expect(run(page).locator('[data-run-sub]')).toHaveText(new RegExp('^' + (i + 1) + '번째 · 1[12](\\.\\d)?반음 · ' + (gap ? '끊김 1번' : '끊김 없이') + ' · 올라갔다 내려옴$'));
  }
  // The third: silence until it gives up.
  await page.evaluate(() => { window.__melody = []; });
  await until(page, 'wait');
  await elapse(page, 6.2);
  await expect(word(page)).toHaveText('소리가 들리지 않았어요');
  await until(page, 'nothing', 3).catch(() => {});
  await expect(run(page)).toHaveAttribute('data-state', 'result');
  await expect(word(page)).toHaveText('끊김 없이 올라갔다 내려왔어요');
  await expect(run(page).locator('[data-result-lines] li').nth(2)).toHaveText('3번째 · 소리가 들리지 않았어요');
  await noOverflow(page);
  await shot(page, '12-siren-result-390');
  await primary(page).click();
  await saveSet(page);
  const [m] = (await todayItem(page, 'loosen-siren')).measures;
  expect(m).toEqual(expect.objectContaining({area:'path', kind:'siren', unit:'반음', breaks:0, flips:0, both:1, tries:3}));
  expect(m.value).toBeGreaterThanOrEqual(11); expect(m.value).toBeLessThanOrEqual(12.1);
  await page.clock.resume();
  await to(page, '#/levels');
  await expect(tile(page, 'path')).toHaveAttribute('data-state', 'calibrating');
  await expect(tile(page, 'path').locator('[data-tile-sub]')).toHaveText(/^1일째 · 지금은 [23]단계쯤$/); // 11.x–12 semitones: 2 under an octave, 3 at one
});

test('맨 위 음 유지: the top of the comfortable range and just under it, 2 s each, the top on 아 · 에 · 이 — kept for 고음 (in the octave played)', async ({page}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:390, height:844});
  await boot(page, seed({practicePlans:[prefs('high')]}));
  await startWithMic(page, 'hold');
  const comfort = D.comfort({voiceCheck:{refNote:60, highNote:69}}), e = D.exercise('voice-high'), notes = D.notesFor(e, comfort, TODAY);
  expect(notes).toEqual([66, 68, 69, 69, 69]);
  for (let i = 0; i < notes.length; i++) {
    await expect(run(page).locator('[data-run-note]')).toHaveText(D.noteName(notes[i]));
    await expect(run(page).locator('[data-run-sub]')).toContainText('“' + e.vowels[i] + '”');
    await page.evaluate(f => { window.__sing = f; }, hzOf(notes[i]));
    for (let t = 0; t < 12 && await word(page).textContent() !== '좋아요!'; t += .2) await elapse(page, .2);
    await expect(word(page)).toHaveText('좋아요!');
    await page.evaluate(() => { window.__sing = 0; });
    if (i < notes.length - 1) for (let t = 0; t < 4 && await run(page).locator('[data-run-note]').textContent() === D.noteName(notes[i]) && notes[i + 1] !== notes[i]; t += .2) await elapse(page, .2);
    else await elapse(page, 2);
    if (notes[i + 1] === notes[i]) await expect(run(page).locator('[data-run-sub]')).toContainText('“' + e.vowels[i + 1] + '”', {timeout:8000}).catch(async () => { await elapse(page, 2); });
  }
  await saveSet(page);
  const ms = (await todayItem(page, 'voice-high')).measures;
  expect(ms.find(m => m.area === 'high')).toEqual({area:'high', kind:'top', fromTop:0, value:0, vowels:3, unit:'cent', seconds:2, of:5});
  expect(ms.find(m => m.area === 'range')).toEqual(expect.objectContaining({low:66, high:69, count:3}));
});
