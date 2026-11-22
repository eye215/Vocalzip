// 성장 개편 안 B, phase 4 — the things you DO moved from 성장 to 오늘: ONE 연습하기 section on home (오늘의 연습 card · 매일
// 보이스 체크 · 노래 연습실 · 보컬 트레이닝, each with its state), their screens belong to the 오늘 tab (오늘 lit, 뒤로
// returns there), the former 보컬 트레이닝 addresses land on that section, and each thing has one name ("다음 연습",
// "녹음 분석", "곡 분석"). 연구소 itself (rows, states, sub-pages) is in tests/growth-tabs.spec.cjs; 발성 정밀 측정's row in
// tests/precision-session.spec.cjs; the 보이스 체크 flow in tests/voice-check.spec.cjs. Fake data only.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test, {approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const pad = n => String(n).padStart(2, '0');
const ago = days => { const d = new Date(Date.now() - days * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const v2 = ({into, wob = 10, conf = .95}) => ({v:2, at:Date.now(), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:into + 3, within20:70, notes:40}, stability:{wobbleCents:wob + 1, notes:15}, vibrato:{share:20, notes:10, rateHz:5.5, extentCents:40, regularity:.9},
  range:{validHigh:{note:'G5', cents:7900}, stableHigh:{note:'F5', cents:7700}, instantaneous:{note:'C7', cents:9600, t:30}, main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
  breath:{phrases:5, medianPhrase:3.4},
  phrases:{v:1, rows:[[10, 3, 64, into, wob], [15, 2.5, 67, into, wob], [20, 3.5, 69, into, wob], [26, 4, 72, into, wob], [32, 2, 71, into, wob]]},
  pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [67, 4, .6, 1, 3, 6], [74, 3, .8, 1.1, 3, 12]]}},
  confidence:{pitchConfidence:conf, voiceOverMrDb:12}});
const TAKES = [['a1', 's1', ago(60), v2({into:30})], ['a2', 's1', ago(40), v2({into:26})], ['a3', 's1', ago(20), v2({into:18})], ['a6', 's1', ago(1), v2({into:11})],
  ['b1', 's2', ago(50), v2({into:12})], ['b2', 's2', ago(2), v2({into:24})], ['d1', 's3', ago(8), null]];
// A 보이스 체크 record n days ago (app/voice-check-model.js reads practices carrying `voiceCheck`).
const check = n => ({id:'voice-check:t' + n, date:ago(n), minutes:.5, manualMinutes:.5, practiceMode:'training', songId:'', practiceTimeSource:'voice-check', mediaIds:['t' + n], created:Date.now() - n * 864e5,
  voiceCheck:{v:1, protocol:'vc30-v1', refNote:57, highNote:66, mediaId:'t' + n, at:Date.now() - n * 864e5, selfRating:4, tags:[], metrics:{reliable:true, sustainWobble:5, scaleCents:6, highHold:6, highWobble:5, voicedPct:90, scaleBias:-2}}});
const room = (id, n, title) => ({id:'practice-room:' + id, date:ago(n), minutes:8, songId:'s1', created:2, practiceRoom:{id, task:'tone', title, songId:'s1', date:new Date(Date.now() - n * 864e5).toISOString(), demo:false}});
const seed = () => ({categories:[], lessons:[], assignments:[{id:'hw1', title:'립트릴로 고음 연결하기', status:'active', startDate:ago(3), dueDate:ago(-4)}],
  practices:[check(1), check(2), check(3), room('roomaaaa1111', 1, '기준음 따라 부르기'), room('roombbbb2222', 6, '표현을 담은 한 구절 제출')],
  comparisonReports:[{id:'r1', kind:'vocal-lab', songId:'s1', song:'Defying Gravity', created:Date.now(), mediaIds:['a3', 'a6'], snapshots:[]}],
  songs:[{id:'s1', title:'Defying Gravity'}, {id:'s2', title:'On My Own'}, {id:'s3', title:'새 곡'}]});
async function boot(page, db = seed()) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(db)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async takes => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (const [id, songId, date] of takes) await window.vzipStorePracticeMedia({id, name:'연습 ' + date, created:new Date(date + 'T20:00:00').getTime(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId, song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:120});
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x[0] === m.id); if (t?.[3]) await VZ.media.update(m, {analysis:t[3]}, {quiet:true}); }
    VZ.media.invalidate();
    window.dispatchEvent(new Event('vzip:media-updated'));
  }, TAKES);
  await expect(page.locator('.vz-student-home [data-home-practice]')).toBeVisible();
  await page.waitForTimeout(300);
}
// WebKit reloads on goto() to the URL it is already on and the in-page fixtures would be gone: addresses change in the page.
const to = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const section = page => page.locator('.vz-student-home [data-home-practice]');
const row = (page, key) => section(page).locator('[data-row="' + key + '"]');
const homeLit = page => expect(page.locator('.v-nav a[data-nav="home"]')).toHaveAttribute('aria-current', 'page');
const overflow = page => page.evaluate(() => {
  const all = [...document.querySelectorAll('#view *'), ...(document.querySelector('.vz-student-home')?.shadowRoot?.querySelectorAll('main *') || [])];
  return {wide:document.documentElement.scrollWidth > innerWidth + 1, over:all.filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.vz-recent-pills,.growth-chart,.growth-jumps'); }).length};
});
test.use({viewport:{width:390, height:844}});
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('오늘 › 연습하기: one section with the three things you do — the 오늘의 연습 card, then a row each with its state — and nothing twice', async ({page}) => {
  await boot(page);
  await expect(section(page).locator('h2')).toHaveText('연습하기');
  expect(await section(page).locator('[data-row]').evaluateAll(els => els.map(e => e.dataset.row))).toEqual(['practice-set', 'voice-check', 'roadmap']);
  // 내 로드맵 took the place of 노래 연습실 (its fixed 9 steps) and 보컬 트레이닝.
  await expect(section(page).locator('[data-row] strong')).toHaveText(['오늘의 연습', '매일 보이스 체크', '내 로드맵']);
  // 오늘의 연습 is a card now (timeline · progress · one button: tests/daily-set.spec.cjs); the others are rows.
  // States are what is kept: three checks on the last three days (none today); 내 로드맵 says what it works on.
  await expect(row(page, 'practice-set').locator('small')).toHaveText(/^\d+개 · 약 \d+분$/);
  await expect(row(page, 'voice-check').locator('small')).toHaveText('오늘 아직 · 30초 · 연속 3일');
  await expect(row(page, 'roadmap').locator('small')).toHaveText(/^(손볼 곳|기본기) · \S/);
  await expect(row(page, 'voice-check')).toHaveAccessibleName('매일 보이스 체크, 오늘 아직 · 30초 · 연속 3일, 30초 체크 시작하기');
  // Compact, 44px targets, an icon each, inside the screen.
  // Read in one go: home may be drawn again when the recordings arrive, and a row read one by one could be gone in between.
  for (const b of await section(page).locator('[data-row]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return {h:r.height, l:r.left, r:r.right, icon:e.querySelector('.vz-ui-icon').textContent.length}; }))) {
    expect(b.h).toBeGreaterThanOrEqual(44); expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(390); expect(b.icon).toBe(1);
  }
  // Two rows of 48px under the card; the card itself is a line per step and its button.
  // Measured in one read and retried: home may be drawn again in between, and a box read from a replaced node is null.
  await expect.poll(() => section(page).evaluate(s => { const c = s.querySelector('[data-row="practice-set"]'); return c ? s.getBoundingClientRect().height - c.getBoundingClientRect().height : null; })).toBeLessThanOrEqual(210);
  expect(await overflow(page)).toEqual({wide:false, over:0});
  // Under 지금 할 것, above 오늘의 목표.
  const y = await page.evaluate(() => { const r = document.querySelector('.vz-student-home').shadowRoot, t = s => r.querySelector(s).getBoundingClientRect(); return {now:t('.vz-event').bottom, top:t('[data-home-practice]').top, bottom:t('[data-home-practice]').bottom, goals:t('.vz-goals').top}; });
  expect(y.top).toBeGreaterThanOrEqual(y.now); expect(y.goals).toBeGreaterThanOrEqual(y.bottom);
  // Nothing is shown twice: the single 연습 세트 row and the separate 보이스 체크 card are gone; each name appears once on home.
  await expect(page.locator('.vz-student-home .vz-pset-entry')).toHaveCount(0);
  await expect(page.locator('.vz-student-home [data-voice-check-card]')).toHaveCount(0);
  const names = await page.evaluate(() => { const text = document.querySelector('.vz-student-home').shadowRoot.querySelector('main').innerText; return ['오늘의 연습', '연습 세트', '보이스 체크', '노래 연습실', '보컬 트레이닝', '내 로드맵'].map(n => text.split(n).length - 1); });
  expect(names).toEqual([1, 0, 1, 0, 0, 1]);
  // The existing 따라 하기 suggestion and the AI buttons stay where they were, in 오늘의 목표 (not copied into the section).
  await expect(page.locator('.vz-student-home .vz-goals .vz-guided-item')).toHaveCount(1);
  await expect(page.locator('.vz-student-home .vz-goals .vz-ai-plan-actions>button')).toHaveCount(2);
  await expect(section(page).locator('.vz-guided-item, .vz-ai-plan-actions')).toHaveCount(0);
  // A submission or a check saved while home is open: the state follows and the row is the same element (never replaced under a finger).
  await row(page, 'voice-check').evaluate(e => { e.__same = true; });
  await page.evaluate(([r, c]) => VZ.change(d => { d.practices.push(r, c); }, {silent:true}), [room('roomcccc3333', 0, '짧은 선율 따라 부르기'), check(0)]);
  await expect(row(page, 'voice-check').locator('small')).toHaveText('오늘 완료 · 연속 4일');
  await expect(row(page, 'voice-check')).toHaveAttribute('data-tone', 'done');
  expect(await row(page, 'voice-check').evaluate(e => e.__same === true)).toBe(true);
  // Reading home wrote nothing of its own.
  const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  expect(stored.practices.map(p => p.id).sort()).toEqual(['practice-room:roomaaaa1111', 'practice-room:roombbbb2222', 'practice-room:roomcccc3333', 'voice-check:t0', 'voice-check:t1', 'voice-check:t2', 'voice-check:t3']);
});

test('the practice screens belong to 오늘: opened from 연습하기 the 오늘 tab stays lit and 뒤로 returns to 오늘', async ({page}) => {
  await boot(page);
  const back = async () => { await page.locator('[data-back]').click(); await expect(page).toHaveURL(/#\/home$/); await expect(section(page)).toBeVisible(); };
  // 오늘의 연습: its list (the address 오늘 연습 세트 had). The card's button goes straight to the doing screen instead.
  await to(page, '#/practice-set');
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(page.locator('#top h1')).toHaveText('오늘의 연습');
  await homeLit(page);
  await back();
  // 매일 보이스 체크, not done today: straight into the 30-second check; its intro leads to the earlier results.
  await row(page, 'voice-check').click();
  await expect(page).toHaveURL(/#\/voice-check\/run$/);
  await expect(page.locator('#top h1')).toHaveText('보이스 체크 · 30초');
  await homeLit(page);
  await expect(page.locator('[data-vc-records]')).toHaveText('지난 기록 보기');
  expect((await page.locator('[data-vc-records]').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('[data-vc-records]').click();
  await expect(page).toHaveURL(/#\/voice-check$/);
  await expect(page.locator('#top h1')).toHaveText('보이스 체크');
  await expect(page.locator('.vc-stats')).toContainText('연속');
  await homeLit(page);
  await to(page, '#/home');
  await expect(section(page)).toBeVisible();
  // …done today: the page with today's result and the last 30 days.
  await page.evaluate(c => VZ.change(d => { d.practices.push(c); }, {silent:true}), check(0));
  await expect(row(page, 'voice-check').locator('small')).toHaveText('오늘 완료 · 연속 4일');
  await row(page, 'voice-check').click();
  await expect(page).toHaveURL(/#\/voice-check$/);
  await expect(page.locator('.vc-today-state')).toHaveText('완료');
  await homeLit(page);
  await back();
  // 내 로드맵 (it took the place of 노래 연습실 and 보컬 트레이닝).
  await row(page, 'roadmap').click();
  await expect(page).toHaveURL(/#\/roadmap$/);
  await expect(page.locator('#top h1')).toHaveText('내 로드맵');
  await expect(page.locator('[data-roadmap]')).toBeVisible();
  await homeLit(page);
  await back();
  // 연습 따라 하기 is still there for 오늘의 목표's suggestion.
  await to(page, '#/guided-practice/' + encodeURIComponent('analysis:maintain'));
  await expect(page.locator('#top h1')).toHaveText('연습 따라 하기');
  await homeLit(page);
  await back();
});

test('내 로드맵 from the analysed recordings: what to fix with its exercise (first in 오늘의 연습), all eight areas, the old 노래 연습실 submissions kept', async ({page}) => {
  await boot(page);
  await row(page, 'roadmap').click();
  const road = page.locator('[data-roadmap]');
  await expect(road.locator('[data-rm-basis]')).toContainText('최근 분석된 녹음 6개');
  const focus = road.locator('[data-rm-focus]').first(), area = await focus.getAttribute('data-rm-focus');
  await expect(focus.locator('.rm-from')).toHaveText('녹음에서');
  await expect(focus.locator('[data-rm-why]')).toContainText('최근 녹음에서');
  await expect(road.locator('[data-rm-area="' + area + '"]')).toHaveAttribute('data-state', 'fix');
  await expect(road.locator('[data-rm-area]')).toHaveCount(8);
  expect(await road.locator('[data-rm-area]').evaluateAll(els => els.map(e => e.dataset.rmArea))).toEqual(['breath', 'pitch', 'sustain', 'path', 'range', 'high', 'vibrato', 'rhythm']);
  // Nothing of 노래 연습실 is lost: its two submissions are one tap away.
  await expect(road.locator('[data-rm-room]')).toHaveText(/지난 노래 연습실 제출 2개 보기/);
  expect(await overflow(page)).toEqual({wide:false, over:0});
  for (const b of await road.locator('a').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) expect(b).toBeGreaterThanOrEqual(44);
  // Its exercises are the ones 오늘의 연습 marks 추천 (one per focus), with the recordings' reason.
  const n = await road.locator('[data-rm-focus]').count();
  expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(2);
  await focus.getByRole('link', {name:'오늘의 연습 하기'}).click();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(page.locator('.pset-row .pset-focus-tag')).toHaveCount(n);
  await expect(page.locator('.pset-row [data-focus-why]').first()).toContainText('최근 녹음에서');
});

test('old addresses: #/vocal-training and #/vocal-growth/training land on 오늘 with 연습하기 in view; so do 성장\'s two links', async ({page}) => {
  await page.setViewportSize({width:390, height:560});                // short, so the section is below the fold
  await boot(page);
  const shown = async () => {
    await expect(page).toHaveURL(/#\/home$/);
    // The section can be taller than this short screen (the daily set grows as areas are added): its top is what counts.
    await expect(section(page)).toBeInViewport();
    // Brought to the top of the screen (it starts below 지금 할 것), not merely somewhere on it.
    await expect.poll(() => section(page).evaluate(e => Math.round(e.getBoundingClientRect().top))).toBeLessThanOrEqual(40);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await homeLit(page);
  };
  for (const old of ['#/vocal-training', '#/vocal-growth/training']) {
    await to(page, '#/vocal-growth');
    await expect(page.locator('[data-gm-section="next"]')).toBeVisible();
    await to(page, old);
    await shown();
    await page.goBack();                                              // replaced: 뒤로 does not bounce back into the old address
    await expect(page).toHaveURL(/#\/vocal-growth$/);
  }
  // 이번 달 › 다음 연습: one line where the practice entries used to be reached from 성장.
  const line = page.locator('[data-gm-section="next"] [data-gm-today]');
  await expect(line).toHaveText('연습은 오늘 탭에서 해요');
  expect((await line.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await line.click();
  await shown();
  expect(await page.evaluate(() => document.querySelector('.vz-student-home').shadowRoot.activeElement?.id)).toBe('vz-practice-title');
  // 연구소's lead says the same.
  await to(page, '#/growth-lab');
  await page.locator('[data-lab-lead] a').click();
  await shown();
  // An ordinary visit to 오늘 afterwards starts at the top: the ask is used once.
  await to(page, '#/songs');
  await expect(page.locator('#top h1')).toHaveText('내 곡');
  await to(page, '#/home');
  await expect(section(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // Every other old address keeps working (tests/growth-month.spec.cjs and tests/growth-unify.spec.cjs follow each one).
  for (const [from, url] of [['#/growth', /#\/vocal-growth$/], ['#/vocal-growth/analysis', /#\/vocal-analysis$/], ['#/weekly-summary', /#\/growth-flow\?period=week$/], ['#/vocal-growth?mode=monthly', /#\/growth-flow\?period=month$/]]) {
    await to(page, '#/songs'); await to(page, from);
    await expect(page, from).toHaveURL(url);
  }
});

test('one name per thing: 다음 연습 · 녹음 분석 · 곡 분석 — the old names are gone from the 성장, 오늘 and 연구소 screens', async ({page}) => {
  test.setTimeout(90000);
  await boot(page);
  const OLD = /추천 연습|다음 연습 추천|다음에 연습할 것|추천·계획|보컬 연구소|보컬 분석/;
  // Everything a screen says: its text and the names of its controls (the home's shadow root and open sheets too).
  const said = () => page.evaluate(() => {
    const roots = [document.getElementById('top'), document.getElementById('view'), document.querySelector('.vz-student-home')?.shadowRoot, ...document.querySelectorAll('.sheet')].filter(Boolean);
    return roots.map(r => (r.innerText ?? r.querySelector('main')?.innerText ?? '') + ' ' + [...r.querySelectorAll('[aria-label],[title],[placeholder]')].map(e => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('placeholder')].filter(Boolean).join(' ')).join(' ')).join(' ');
  });
  const check = async (name, mark) => { await expect(page.locator(mark).first(), name).toBeVisible(); await page.waitForTimeout(250); const text = await said(); expect(text.match(OLD)?.[0] || '', name).toBe(''); return text; };
  await check('오늘', '.vz-student-home [data-home-practice]');
  await row(page, 'roadmap').click();
  await check('내 로드맵', '[data-roadmap]');
  await to(page, '#/vocal-growth');
  expect(await check('이번 달', '[data-gm-section="next"]')).toContain('다음 연습');
  await to(page, '#/growth-flow?period=all');
  const overall = await check('지난 흐름 전체', '[data-overall-body]');
  expect(overall).toContain('다음 연습');
  expect(overall).not.toContain('매일 보이스 체크');                     // the entry row at the top of 결과 리포트 is gone
  await expect(page.locator('.vc-entry')).toHaveCount(0);
  await expect(page.locator('[data-growth-anchor="practice"] h2')).toHaveText('다음 연습');
  await to(page, '#/growth-flow?period=month');
  expect(await check('지난 흐름 월별', '[data-growth-select]')).toContain('다음 연습');
  await expect(page.locator('[data-monthly-jump="practice"]')).toHaveText('다음 연습');
  await expect(page.locator('.vc-entry')).toHaveCount(0);
  await to(page, '#/growth-flow?period=week');
  await check('지난 흐름 주간', '[data-weekly-summary] .ws-week');
  await to(page, '#/vocal-analysis');
  await check('곡', '[data-hub-song]');
  await to(page, '#/vocal-lab/s1');
  await check('곡 분석', '[data-song-section="changes"]');
  await expect(page.locator('#top h1')).toHaveText('곡 분석');
  await to(page, '#/growth-lab');
  await check('연구소', '[data-lab-tool="reports"]');
  await to(page, '#/growth-ear');
  await check('귀와 숫자', '[data-growth-lab-page] [data-lab-rule]');
  await to(page, '#/growth-basis');
  await check('분석 기준·뺀 것', '[data-lab-basis]');
  await to(page, '#/lab-reports');
  await check('리포트 보관함', '.vl-reports');
  await to(page, '#/practice-review');
  await check('다음 연습 (AI)', '[data-review]');
  await expect(page.locator('#top h1')).toHaveText('다음 연습'); // one name per thing (성장 개편 안 B 4단계, owner-approved)
  await to(page, '#/analysis/a6');
  await check('녹음 분석', '[data-ana]');
  await expect(page.locator('#top h1')).toHaveText('녹음 분석');
  await to(page, '#/practice-stats');
  await check('연습 시간', '.growth-shell');
  await expect(page.locator('#top h1')).toHaveText('연습 시간');
});

for (const [width, height] of [[820, 1180], [1180, 820]]) test('iPad ' + width + ' × ' + height + ': 연습하기 sits in the main column of 오늘; 연구소 shows its two groups side by side', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');   // same rule as the other tablet tests (phone projects emulate a phone)
  await page.setViewportSize({width, height});
  await boot(page);
  const home = await page.evaluate(() => { const r = document.querySelector('.vz-student-home').shadowRoot, t = s => { const b = r.querySelector(s).getBoundingClientRect(); return {l:b.left, r:b.right, t:b.top, b:b.bottom}; };
    return {now:t('.vz-event'), practice:t('[data-home-practice]'), goals:t('.vz-goals'), side:t('.vz-col-side'), inMain:!!r.querySelector('.vz-col-main > [data-home-practice]')}; });
  expect(home.inMain).toBe(true);
  expect(home.practice.t).toBeGreaterThanOrEqual(home.now.b); expect(home.goals.t).toBeGreaterThanOrEqual(home.practice.b);
  expect(home.side.l).toBeGreaterThanOrEqual(home.practice.r);       // the summary column is beside it
  await expect.poll(() => section(page).locator('[data-row]').evaluateAll(els => els.length ? Math.min(...els.map(e => e.getBoundingClientRect().height)) : 0)).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toEqual({wide:false, over:0});
  await to(page, '#/growth-lab');
  await expect(page.locator('[data-lab-tool="reports"]')).toBeVisible();
  const lab = await page.evaluate(() => [...document.querySelectorAll('[data-lab-group]')].map(e => { const b = e.getBoundingClientRect(); return {l:b.left, r:b.right, t:b.top}; }));
  expect(lab[1].l).toBeGreaterThan(lab[0].r); expect(Math.abs(lab[0].t - lab[1].t)).toBeLessThan(2);
  expect(Math.min(...await page.locator('[data-lab-tool]').evaluateAll(els => els.map(e => e.getBoundingClientRect().height)))).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toEqual({wide:false, over:0});
  for (const hash of ['#/growth-ear', '#/growth-basis']) { await to(page, hash); await expect(page.locator('[data-lab-rule]')).toBeVisible(); expect(await overflow(page), hash).toEqual({wide:false, over:0}); }
});
