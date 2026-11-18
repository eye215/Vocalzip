// 들어 보고 남기는 평가 (app/listen-verdict.js) and 무엇이 달라졌나 (app/growth-changes-ui.js) on seeded songs, takes and
// analyses (the analysis shape of tests/growth-characterization.fixture.cjs; the takes are short generated WAV files so
// the players really load). Screenshots: LISTEN_SHOTS=<dir> (2×).
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const {v2} = require('./growth-characterization.fixture.cjs');
const KEY = 'vocal-zip_mvp_v1', NOW = '2026-11-18T03:00:00.000Z';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
// s1: one take as recorded (2025-08), two measured with the MR removed (9월, 11월) → compared as MR 빼고.
// s2: 2025-08 as recorded, 2026-11 MR 빼고 → a mixed pair, left out with its reason.
const TAKES = [
  {id:'s1-aug', songId:'s1', name:'작년 8월 연습', date:'2025-08-14', analysis:v2({into:30, wob:20})},
  {id:'s1-sep', songId:'s1', name:'9월 MR 연습', date:'2026-09-05', analysis:v2({into:26, wob:20, mr:true})},
  {id:'s1-nov', songId:'s1', name:'11월 레슨 녹음', date:'2026-11-10', analysis:v2({into:12, wob:20, mr:true})},
  {id:'s2-aug', songId:'s2', name:'On My Own 8월', date:'2025-08-20', analysis:v2({into:20})},
  {id:'s2-nov', songId:'s2', name:'On My Own 11월', date:'2026-11-12', analysis:v2({into:10, mr:true})}
];
const seed = (extra = {}) => ({categories:[], assignments:[], comparisonReports:[], performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:1}, {id:'s2', title:'On My Own', created:2}],
  lessons:[{id:'l1', date:'2026-11-10', startTime:'19:00', status:'done', teacher:'김지은', songIds:['s1'], songId:'s1', feedback:'', memo:'', recordings:[{id:'s1-nov', note:''}], created:1}],
  deleted:{}, ...extra});
const VERDICT = {id:'listen:seeded', kind:'listen-verdict', v:1, songId:'s1', firstId:'s1-aug', secondId:'s1-nov', firstDate:'2025-08-14', secondDate:'2026-11-10', firstRange:null, secondRange:null,
  overall:'second', tags:{path:'second'}, memo:'첫 소리가 편해졌어요', judge:'me', teacher:'', lessonId:'', blind:true, judgedDate:'2026-11-17', created:1};
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});

async function boot(page, db = seed(), takes = TAKES) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(db)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async takes => {
    window.vzipCloudSignedIn = () => false;
    // 20 s of a quiet tone, 8 kHz mono 16-bit WAV: enough for the players to load and seek.
    const wav = (seconds, hz) => { const sr = 8000, n = sr * seconds, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * hz * i / sr) * 3000), true); return new Blob([b], {type:'audio/wav'}); };
    for (const [i, t] of takes.entries()) await window.vzipStorePracticeMedia({id:t.id, name:t.name, created:new Date(t.date + 'T10:00:00+09:00').getTime(), type:'audio/wav', source:'practice', songId:t.songId, song:'', blob:wav(t.seconds || 20, 220 + i * 20), durationSeconds:t.seconds || 20});
    VZ.media.invalidate();
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {recordedDate:t.date, analysis:t.analysis}, {quiet:true}); }
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {name:t.name}, {quiet:true}); }
    await VZ.media.list(true);
  }, takes);
}
const report = async page => { await page.evaluate(() => { location.hash = '#/vocal-growth'; }); await expect(page.locator('[data-growth-changes-card]')).toBeVisible(); };
const data = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const verdicts = async page => (await data(page)).comparisonReports.filter(x => x.kind === 'listen-verdict');
const sheet = page => page.locator('.sheet-page [data-lc]');
const save = page => page.locator('.sheet-page .sheet-foot button[type=submit]');
const choose = (page, name, value) => page.locator('.sheet-page input[name="' + name + '"][value="' + value + '"]').locator('xpath=..');
/** Both players have read their file (duration known), so seeking works. */
const ready = page => expect.poll(() => page.evaluate(() => ['A', 'B'].every(k => document.querySelector('[data-lc-player="' + k + '"]')?.lcPlayer?.el.readyState >= 1))).toBe(true);
const position = (page, k) => page.evaluate(k => document.querySelector('[data-lc-player="' + k + '"]').lcPlayer.el.currentTime, k);
// Names what runs off the screen (the deepest elements past the right edge), so a failure on an engine that cannot be
// run locally still says where to look.
const noOverflow = async page => expect(await page.evaluate(() => {
  const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
  // The report's quick-jump row is a sideways-scrolling strip by design (design guide §26): what is inside it may pass the edge.
  const strip = el => !!el.closest('.growth-jumps,.growth-view-tabs');
  const sheets = [...document.querySelectorAll('.sheet-body')].filter(b => b.scrollWidth - b.clientWidth > 1);
  const bad = [...sheets, ...[...document.body.querySelectorAll('*')].filter(el => { if (strip(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).overflowX === 'visible' && r.left + el.scrollWidth > w + 1)); })];
  if (over <= 1 && !bad.length) return [];
  return ['overflow ' + over + 'px'].concat(bad.filter(el => !bad.some(o => o !== el && el.contains(o))).slice(0, 8).map(el => { const r = el.getBoundingClientRect();
    return el.tagName.toLowerCase() + '.' + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().replace(/\s+/g, '.') + [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => '[' + a.name + ']').join('') + ' left ' + Math.round(r.left) + ' right ' + Math.round(r.right); }));
})).toEqual([]);
// A card taller than the screen is shot without the dock and the floating mic over it (they are fixed to the screen).
const shot = async (target, name) => { const dir = process.env.LISTEN_SHOTS; if (!dir) return; fs.mkdirSync(dir, {recursive:true});
  await target.page().evaluate(() => document.querySelectorAll('body>*:not(.sheet-back)').forEach(el => { if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden'; }));
  await target.screenshot({path:path.join(dir, name), scale:'device'});
  await target.page().evaluate(() => document.querySelectorAll('body>*').forEach(el => { el.style.visibility = ''; })); };
const BANNED = /실력이|향상|악화|개선|좋아졌|나빠졌/;

test.describe('phone 375', () => {
  test.use({viewport:{width:375, height:812}, deviceScaleFactor:2});

  test('blind flow: A/B in random order, flip at the same relative position, dates only after saving; saved and shown in the summary', async ({page}) => {
    await boot(page);
    await report(page);
    await page.evaluate(() => { VZ.listenCompare.random = () => 0.1; });   // A = 녹음 2 (the later take)
    const line = page.locator('[data-gc-song="s1"]');
    await line.locator('[data-listen-open]').click();
    await expect(sheet(page)).toBeVisible();
    // The song line hands over its pair: 9월 and 11월, both MR 빼고.
    await expect(page.locator('[data-lc-take="x"]')).toHaveValue('s1-sep');
    await expect(page.locator('[data-lc-take="y"]')).toHaveValue('s1-nov');
    await expect(page.locator('[data-lc-blind]')).toBeChecked();
    await expect(page.locator('[data-lc-label="A"]')).toHaveText('어느 녹음인지 가려 뒀어요');
    await expect(page.locator('[data-lc-label="B"]')).toHaveText('어느 녹음인지 가려 뒀어요');
    await expect(page.locator('[data-lc-listen]')).not.toContainText('2026');
    // Sections: 녹음 1 2–12 s, 녹음 2 4–8 s (prefilled with the whole take).
    await expect(page.locator('input[name="xEnd"]')).toHaveValue('0:20');
    await page.locator('.lc-ranges summary').click();
    await page.locator('input[name="xStart"]').fill('0:02'); await page.locator('input[name="xEnd"]').fill('12'); await page.locator('input[name="xEnd"]').dispatchEvent('change');
    await page.locator('input[name="yStart"]').fill('4'); await page.locator('input[name="yEnd"]').fill('0:08'); await page.locator('input[name="yEnd"]').dispatchEvent('change');
    await expect(page.locator('[data-lc-range-error]')).toBeEmpty();
    await ready(page);
    // A is 녹음 2 (4–8 s): halfway is 6 s; flipping puts B (녹음 1, 2–12 s) halfway too, at 7 s.
    await page.evaluate(() => { document.querySelector('[data-lc-player="A"]').lcPlayer.seek(6); });
    await expect(page.locator('[data-lc-flip]')).toHaveText('같은 위치에서 B 듣기');
    await page.locator('[data-lc-flip]').click();
    expect(Math.abs(await position(page, 'B') - 7)).toBeLessThan(.05);
    await expect(page.locator('[data-lc-side="B"]')).toHaveAttribute('data-active', '');
    await expect(page.locator('[data-lc-flip]')).toHaveText('같은 위치에서 A 듣기');
    expect((await page.locator('[data-lc-flip]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.locator('.lc-ranges summary').click();
    await page.locator('.sheet-page .sheet-body').evaluate(b => { b.scrollTop = 0; });
    await shot(page.locator('.sheet-page .sheet'), 'phone-375-pick-blind.png');
    // Nothing is saved before 평가 저장, and it needs the overall choice.
    await expect(save(page)).toBeDisabled();
    await choose(page, 'overall', 'A').click();
    await choose(page, 'tag-path', 'A').click();
    await choose(page, 'tag-pitch', 'same').click();
    // A tag pressed again is cleared.
    await choose(page, 'tag-breath', 'B').click(); await choose(page, 'tag-breath', 'B').click();
    await expect(page.locator('input[name="tag-breath"]:checked')).toHaveCount(0);
    await page.locator('textarea[name="memo"]').fill('A의 첫 소리가 더 편해요');
    await expect(page.locator('[data-lc-teacher-field]')).toBeHidden();
    expect(await verdicts(page)).toEqual([]);
    await page.locator('[data-lc-verdict]').scrollIntoViewIfNeeded();
    await shot(page.locator('.sheet-page .sheet'), 'phone-375-verdict.png');
    await noOverflow(page);
    await save(page).click();
    // The dates come after the verdict.
    await expect(page.locator('[data-lc-reveal]')).toBeVisible();
    await expect(page.locator('[data-lc-reveal-side="A"]')).toHaveText('2026.11.10 · 11월 레슨 녹음');
    await expect(page.locator('[data-lc-reveal-side="B"]')).toHaveText('2026.09.05 · 9월 MR 연습');
    await expect(page.locator('[data-lc-reveal]')).toContainText('나: 11월 녹음이 9월 녹음보다 낫다고 들었어요 · 소리 길은 11월이 나아요 · 음정은 비슷해요');
    if (process.env.LISTEN_SHOTS) await page.waitForTimeout(500);              // the dialog has faded in
    await shot(page.locator('.sheet-alert .sheet'), 'phone-375-reveal.png');
    await page.locator('.sheet-alert [data-close]').last().click();
    const [v] = await verdicts(page);
    expect({...v, id:undefined, created:undefined, updatedAt:undefined}).toEqual({id:undefined, created:undefined, updatedAt:undefined, kind:'listen-verdict', v:1, songId:'s1',
      firstId:'s1-sep', secondId:'s1-nov', firstDate:'2026-09-05', secondDate:'2026-11-10', firstRange:{start:2, end:12}, secondRange:{start:4, end:8},
      overall:'second', tags:{path:'second', pitch:'same'}, memo:'A의 첫 소리가 더 편해요', judge:'me', teacher:'', lessonId:'', blind:true, judgedDate:'2026-11-18'});
    expect(v.id).toMatch(/^listen:/);
    expect(v.updatedAt).toBeGreaterThan(0);                                          // stamped by VZ.change: synced like every record
    // 무엇이 달라졌나 quotes it, with both takes playable.
    const quoted = page.locator('[data-gc-verdict="' + v.id + '"]');
    await expect(quoted.locator('.gc-quote')).toHaveText('나11월 녹음이 9월 녹음보다 낫다고 들었어요');
    await expect(quoted.locator('.gc-tags')).toHaveText('소리 길은 11월이 나아요 · 음정은 비슷해요');
    await expect(quoted.locator('.gc-basis')).toHaveText('같은 곡 Defying Gravity · 들어 본 평가 · 9월 → 11월 · 가리고 들음 · 구간 0:02–0:12 / 0:04–0:08');
    await quoted.locator('[data-gc-play="s1-nov"]').click();
    await expect(quoted.locator('[data-gc-player] .player')).toBeVisible();
    expect(page.__errors).toEqual([]);
  });

  test('the summary card: same-method song line, the mixed pair left out with its reason, precision invitation, 320px without overflow', async ({page}) => {
    await boot(page, seed({comparisonReports:[VERDICT]}));
    await report(page);
    const card = page.locator('[data-growth-changes-card]');
    // The card sits above the existing report.
    expect(await page.evaluate(() => { const c = document.querySelector('[data-growth-changes]'), b = document.querySelector('[data-overall-body]'); return !!(c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
    await expect(card.locator('[data-gc-group]')).toHaveCount(3);
    await expect(card.locator('[data-gc-verdict="listen:seeded"] .gc-quote')).toHaveText('나2026년 11월 녹음이 2025년 8월 녹음보다 낫다고 들었어요');
    // Same song, same method: s1 by its two MR 빼고 takes; the 2025 take measured as recorded is not paired with them.
    const s1 = card.locator('[data-gc-song="s1"]');
    await expect(s1).toHaveAttribute('data-gc-method', 'mrRemoved');
    await expect(s1.locator('.gc-basis')).toHaveText('같은 곡 Defying Gravity · MR 빼고 잰 녹음 2개 · 9월 → 11월');
    await expect(s1.locator('[data-gc-obs="intonation"] span')).toHaveText('가까운 반음과의 차이가 줄었어요');
    await expect(s1.locator('[data-gc-play]')).toHaveCount(2);
    // s2 mixes 녹음 그대로 (8월) and MR 빼고 (11월): left out, with why.
    await expect(card.locator('[data-gc-song="s2"]')).toHaveCount(0);
    await expect(card.locator('[data-gc-excluded] summary')).toHaveText(/^비교할 수 없어 뺀 것 \d+개 · 왜$/);
    const s2 = card.locator('[data-gc-excluded-item="song:s2"]');
    await expect(s2).toHaveAttribute('data-reason', 'method-mixed');
    await expect(s2).toContainText('최근 녹음은 MR 빼고, 그 전 녹음은 녹음 그대로 잰 것이라 비교하지 않아요');
    // No 발성 정밀 측정 yet: one line inviting to record the standard tasks.
    await expect(card.locator('[data-gc-invite]')).toBeVisible();
    await expect(card.locator('[data-gc-precision-entry]')).toHaveAttribute('href', '#/precision-measurement');
    await expect(card.locator('[data-gc-task]')).toHaveCount(0);
    // Observations only: no verdict words on numbers.
    expect(await card.locator('[data-gc-group="songs"]').innerText()).not.toMatch(BANNED);
    for (const b of await card.locator('.gc-chip:visible').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.setViewportSize({width:320, height:640});
    await noOverflow(page);
    await page.setViewportSize({width:375, height:812});
    expect(page.__errors).toEqual([]);
  });

  test('같은 과제: comparable 발성 정밀 측정 sessions give one line per task', async ({page}) => {
    await boot(page);
    await page.evaluate(async () => {
      const owner = window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
      const result = (date, stability) => ({engineVersion:'e1', recordedDate:date, analyzedAt:date + 'T10:00:00Z', source:{id:'p-' + date, revision:'1'},
        context:{owner, task:'sustain', vowel:'a', environment:'방', loudness:'normal', source:'clean'}, parameters:{w:1}, scope:{start:0, end:5},
        metrics:{f0:{value:220, unit:'Hz', confidence:'high'}, rms:{value:-20, unit:'dB', confidence:'high'}, stability:{value:stability, unit:'cent', confidence:'high'}}});
      await window.VzipPrecisionStore.append({id:'p1', owner, key:'k1', result:result('2026-09-01', 6.2)});
      await window.VzipPrecisionStore.append({id:'p2', owner, key:'k2', result:result('2026-11-15', 4.1)});
    });
    await report(page);
    const task = page.locator('[data-gc-task="sustain|a|normal"]');
    await expect(task.locator('.gc-basis')).toHaveText('같은 과제 편안한 아 · 같은 모음·음량·환경 · 9월 → 11월');
    await expect(task.locator('li')).toHaveText('음정 안정성 6.2 → 4.1 cent');
    await expect(page.locator('[data-gc-invite]')).toHaveCount(0);
    await page.locator('[data-gc-group="tasks"]').scrollIntoViewIfNeeded();
    await shot(page.locator('[data-growth-changes-card]'), 'phone-375-card.png');
    expect(page.__errors).toEqual([]);
  });

  test('all four kinds at once: a verdict, same song same method, same task and 음역 처음·지금', async ({page}) => {
    // 음역 needs two windows of months that do not touch: Memory, sung as recorded in 2025.08–10 and 2026.09–11.
    const memory = ['2025-08-02', '2025-09-02', '2025-10-02', '2026-09-20', '2026-10-20', '2026-11-16'].map((date, i) => ({id:'s3-' + i, songId:'s3', name:'Memory ' + date, date, seconds:2, analysis:v2({into:24 - i * 2})}));
    await boot(page, seed({comparisonReports:[VERDICT], songs:[...seed().songs, {id:'s3', title:'Memory', created:3}]}), [...TAKES, ...memory]);
    await page.evaluate(async () => {
      const owner = window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
      const result = (date, stability) => ({engineVersion:'e1', recordedDate:date, analyzedAt:date + 'T10:00:00Z', source:{id:'p-' + date, revision:'1'},
        context:{owner, task:'sustain', vowel:'a', environment:'방', loudness:'normal', source:'clean'}, parameters:{w:1}, scope:{start:0, end:5},
        metrics:{f0:{value:220, unit:'Hz', confidence:'high'}, rms:{value:-20, unit:'dB', confidence:'high'}, stability:{value:stability, unit:'cent', confidence:'high'}}});
      await window.VzipPrecisionStore.append({id:'p1', owner, key:'k1', result:result('2026-09-01', 6.2)});
      await window.VzipPrecisionStore.append({id:'p2', owner, key:'k2', result:result('2026-11-15', 4.1)});
    });
    await report(page);
    const card = page.locator('[data-growth-changes-card]');
    await expect(card.locator('[data-gc-group]')).toHaveCount(4);
    await expect(card.locator('[data-gc-verdict]')).toHaveCount(1);
    await expect(card.locator('[data-gc-song]')).toHaveCount(2);
    await expect(card.locator('[data-gc-song="s3"] .gc-basis')).toHaveText('같은 곡 Memory · 녹음 그대로 잰 녹음 6개 중 처음·최근 · 2025년 8월 → 2026년 11월');
    await expect(card.locator('[data-gc-task]')).toHaveCount(1);
    await expect(card.locator('[data-gc-range] .gc-basis')).toHaveText(/^음역 처음·지금 · 처음 2025\.08–10 녹음 \d+개 · 지금 2026\.09–11 녹음 \d+개$/);
    await expect(card.locator('[data-gc-range] li')).toContainText('처음(2025.08–10) → 지금(2026.09–11)');
    expect(await card.innerText()).not.toMatch(BANNED);
    await noOverflow(page);
    await shot(card, 'phone-375-card-all-four.png');
    expect(page.__errors).toEqual([]);
  });

  test('editing and deleting a verdict', async ({page}) => {
    await boot(page, seed({comparisonReports:[VERDICT]}));
    await report(page);
    await page.locator('[data-gc-verdict="listen:seeded"] [data-listen-edit]').click();
    await expect(sheet(page)).toBeVisible();
    // The judged pair stays; dates are shown (already revealed); the saved choices are on their sides.
    await expect(page.locator('[data-lc-fixed]')).toContainText('2025.08.14 · 작년 8월 연습');
    await expect(page.locator('[data-lc-take]')).toHaveCount(0);
    await expect(page.locator('[data-lc-label="B"]')).toHaveText('2026.11.10 · 11월 레슨 녹음');
    await expect(page.locator('input[name="overall"][value="B"]')).toBeChecked();
    await expect(page.locator('input[name="tag-path"][value="B"]')).toBeChecked();
    await expect(page.locator('textarea[name="memo"]')).toHaveValue('첫 소리가 편해졌어요');
    await choose(page, 'overall', 'same').click();
    await save(page).click();
    await expect(page.locator('.sheet-page')).toHaveCount(0);
    await expect(page.locator('[data-lc-reveal]')).toHaveCount(0);           // nothing to reveal when editing
    let [v] = await verdicts(page);
    expect([v.id, v.overall, v.tags, v.firstId, v.created, v.judgedDate]).toEqual(['listen:seeded', 'same', {path:'second'}, 's1-aug', 1, '2026-11-17']);
    await expect(page.locator('[data-gc-verdict="listen:seeded"] .gc-quote')).toContainText('2025년 8월 녹음과 2026년 11월 녹음이 비슷하다고 들었어요');
    // Deleting asks first, then removes it for good (a tombstone, so another device does not bring it back).
    await page.locator('[data-gc-verdict="listen:seeded"] [data-listen-edit]').click();
    await page.locator('[data-lc-delete]').click();
    await page.locator('.sheet-alert [data-ok]').click();
    await expect(page.locator('.sheet-page')).toHaveCount(0);
    expect(await verdicts(page)).toEqual([]);
    expect((await data(page)).deleted.comparisonReports).toContain('listen:seeded');
    await expect(page.locator('[data-gc-empty="verdicts"]')).toBeVisible();
    expect(page.__errors).toEqual([]);
  });

  test('a teacher verdict from a lesson\'s recordings', async ({page}) => {
    await boot(page);
    await page.evaluate(() => { location.hash = '#/lesson/l1'; VZ.listenCompare.random = () => 0.9; });   // A = 녹음 1
    const open = page.locator('.lc-lesson-open');
    await expect(open).toHaveText('선생님 평가 남기기 · Defying Gravity');
    await open.click();
    await expect(sheet(page)).toBeVisible();
    // The lesson take and the song's earliest take; 선생님 with the lesson's teacher name.
    await expect(page.locator('[data-lc-take="x"]')).toHaveValue('s1-aug');
    await expect(page.locator('[data-lc-take="y"]')).toHaveValue('s1-nov');
    await expect(page.locator('input[name="judge"][value="teacher"]')).toBeChecked();
    await expect(page.locator('input[name="teacher"]')).toHaveValue('김지은');
    await choose(page, 'overall', 'B').click();
    await choose(page, 'tag-path', 'B').click();
    await save(page).click();
    await page.locator('.sheet-alert [data-close]').last().click();
    const [v] = await verdicts(page);
    expect([v.judge, v.teacher, v.lessonId, v.overall, v.firstId, v.secondId]).toEqual(['teacher', '김지은', 'l1', 'second', 's1-aug', 's1-nov']);
    await expect(page.locator('[data-lc-lesson-verdict] p')).toHaveText('Defying Gravity · 선생님 김지은: 2026년 11월 녹음이 2025년 8월 녹음보다 낫다고 들었어요 · 소리 길은 2026년 11월이 나아요');
    await report(page);
    await expect(page.locator('[data-gc-verdict] .gc-who')).toHaveText('선생님 김지은');
    expect(page.__errors).toEqual([]);
  });

  test('보컬 연구소 opens the same sheet with the earliest and the latest take; nothing is saved when closed', async ({page}) => {
    await boot(page);
    await page.evaluate(() => { location.hash = '#/vocal-lab/s1'; });
    const entry = page.locator('.lc-lab-entry');
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page.locator('[data-lc-take="x"]')).toHaveValue('s1-aug');
    await expect(page.locator('[data-lc-take="y"]')).toHaveValue('s1-nov');
    // Changing a take reshuffles A/B and clears a choice made for the old pair.
    await choose(page, 'overall', 'A').click();
    await page.locator('[data-lc-take="x"]').selectOption('s1-sep');
    await expect(page.locator('input[name="overall"]:checked')).toHaveCount(0);
    // Unblinded: A is 녹음 1 with its date.
    await page.locator('[data-lc-blind]').uncheck();
    await expect(page.locator('[data-lc-label="A"]')).toHaveText('2026.09.05 · 9월 MR 연습');
    await page.locator('.sheet-page [data-close]').first().click();
    await page.locator('.sheet-alert [data-ok]').click();                       // 닫으면 입력한 내용이 저장되지 않아요
    await expect(page.locator('.sheet-page')).toHaveCount(0);
    expect(await verdicts(page)).toEqual([]);
    expect(page.__errors).toEqual([]);
  });
});

test.describe('tablet', () => {
test.use({deviceScaleFactor:2});
test('tablet 1024: the card lays its groups in two columns without overflow', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width:1024, height:1366});
  await boot(page, seed({comparisonReports:[VERDICT]}));
  await report(page);
  const card = page.locator('[data-growth-changes-card]');
  await expect(card.locator('[data-gc-invite]')).toBeVisible();                // the 발성 정밀 측정 store has been read
  const [a, b] = await Promise.all(['songs', 'tasks'].map(k => card.locator('[data-gc-group="' + k + '"]').boundingBox()));
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  await noOverflow(page);
  await shot(card, 'tablet-1024-card.png');
  expect(page.__errors).toEqual([]);
});
});
