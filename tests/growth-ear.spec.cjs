// 귀와 숫자 (app/ear-agreement-model.js, drawn by app/growth-changes-ui.js) on seeded verdicts and analyses — the
// set-up of tests/growth-listen.spec.cjs (the analysis shape of tests/growth-characterization.fixture.cjs, short
// generated WAV takes). Screenshots: LISTEN_SHOTS=<dir> (2×).
const {test, expect} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
require('./legacy-session-mode.cjs')(test);
const {v2} = require('./growth-characterization.fixture.cjs');
const KEY = 'vocal-zip_mvp_v1', NOW = '2026-11-18T03:00:00.000Z';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
// s1 (as in growth-listen): 8월 as recorded, 9월 and 11월 with the MR removed.
// s3 Memory, all as recorded: steadier and more in tune each time, the last with longer phrases.
const TAKES = [
  {id:'s1-aug', songId:'s1', name:'작년 8월 연습', date:'2025-08-14', analysis:v2({into:30, wob:20})},
  {id:'s1-sep', songId:'s1', name:'9월 MR 연습', date:'2026-09-05', analysis:v2({into:26, wob:20, mr:true})},
  {id:'s1-nov', songId:'s1', name:'11월 레슨 녹음', date:'2026-11-10', analysis:v2({into:12, wob:20, mr:true})},
  {id:'m1', songId:'s3', name:'Memory 8월', date:'2025-08-02', analysis:v2({into:30, wob:20})},
  {id:'m2', songId:'s3', name:'Memory 3월', date:'2026-03-02', analysis:v2({into:20, wob:14})},
  {id:'m3', songId:'s3', name:'Memory 11월', date:'2026-11-16', analysis:v2({into:12, wob:8, longer:1})}
].map(t => ({...t, seconds:2}));
const DAY = id => TAKES.find(t => t.id === id).date;
const verdict = (id, songId, firstId, secondId, overall, judgedDate, tags = {}) => ({id, kind:'listen-verdict', v:1, songId, firstId, secondId, firstDate:DAY(firstId), secondDate:DAY(secondId),
  firstRange:null, secondRange:null, overall, tags, memo:'', judge:'me', teacher:'', lessonId:'', blind:true, judgedDate, created:1});
// The verdict of growth-listen: 8월 (as recorded) vs 11월 (MR 빼고) — a method mismatch, never compared.
const MIXED = verdict('listen:mixed', 's1', 's1-aug', 's1-nov', 'second', '2026-11-17', {path:'second'});
const M12 = verdict('listen:m12', 's3', 'm1', 'm2', 'second', '2026-11-10');
const M23 = verdict('listen:m23', 's3', 'm2', 'm3', 'second', '2026-11-12');
const M13 = verdict('listen:m13', 's3', 'm1', 'm3', 'second', '2026-11-16', {pitch:'second', breath:'same'});
// 9월 → 11월 got more in tune, but 9월 was heard as better: intonation against the ear once.
const SEP = verdict('listen:sep', 's1', 's1-sep', 's1-nov', 'first', '2026-11-15');
const seed = verdicts => ({categories:[], assignments:[], comparisonReports:verdicts, performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:1}, {id:'s3', title:'Memory', created:3}], lessons:[], deleted:{}});
const ALL = [MIXED, M12, M23, M13, SEP];
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});

async function boot(page, db = seed(ALL), takes = TAKES) {
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
const report = async page => { await page.evaluate(() => { location.hash = '#/growth-flow?period=all'; }); await expect(page.locator('[data-growth-changes-card]')).toBeVisible(); };
const data = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
// Names what runs off the screen (the deepest elements past the right edge), so a failure on an engine that cannot be
// run locally still says where to look.
const noOverflow = async page => expect(await page.evaluate(() => {
  const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
  const strip = el => !!el.closest('.growth-jumps,.growth-view-tabs');
  const bad = [...document.body.querySelectorAll('*')].filter(el => { if (strip(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).overflowX === 'visible' && r.left + el.scrollWidth > w + 1)); });
  if (over <= 1 && !bad.length) return [];
  return ['overflow ' + over + 'px'].concat(bad.filter(el => !bad.some(o => o !== el && el.contains(o))).slice(0, 8).map(el => { const r = el.getBoundingClientRect();
    return el.tagName.toLowerCase() + '.' + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().replace(/\s+/g, '.') + [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => '[' + a.name + ']').join('') + ' left ' + Math.round(r.left) + ' right ' + Math.round(r.right); }));
})).toEqual([]);
const shot = async (target, name) => { const dir = process.env.LISTEN_SHOTS; if (!dir) return; fs.mkdirSync(dir, {recursive:true});
  await target.page().evaluate(() => document.querySelectorAll('body>*:not(.sheet-back)').forEach(el => { if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden'; }));
  await target.screenshot({path:path.join(dir, name), scale:'device'});
  await target.page().evaluate(() => document.querySelectorAll('body>*').forEach(el => { el.style.visibility = ''; })); };
// A measure is never called right or wrong, nor a take better.
const BANNED = /실력|향상|악화|개선|좋아졌|나빠졌|정확해요|틀렸어요|맞았어요|믿을 수 있/;
const cells = row => row.locator('td').allInnerTexts();

test.describe('phone 375', () => {
  test.use({viewport:{width:375, height:812}, deviceScaleFactor:2});

  test('귀와 숫자: one closed line under 무엇이 달라졌나, the table when opened, what was left out and why', async ({page}) => {
    await boot(page);
    const stored = JSON.stringify((await data(page)).comparisonReports);
    await report(page);
    const ear = page.locator('[data-growth-ear]');
    // Under the card, closed by default, one summary line.
    expect(await page.evaluate(() => { const c = document.querySelector('[data-growth-changes-card]'), x = document.querySelector('[data-growth-ear]'); return !!(c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
    await expect(ear.locator('[data-gc-ear]')).not.toHaveAttribute('open', '');
    await expect(ear.locator('[data-gc-ear-summary]')).toHaveText('평가 4개와 견줘 봤어요 · 이 곡들에서는 지속음 흔들림 숫자가 귀와 가장 자주 같은 쪽으로 움직였어요 (3번 중 3번)');
    await expect(ear.locator('[data-gc-ear-table]')).toBeHidden();
    expect((await ear.locator('[data-gc-ear] > summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await ear.scrollIntoViewIfNeeded();
    await shot(ear, 'phone-375-ear-closed.png');
    await ear.locator('[data-gc-ear] > summary').click();
    await expect(ear.locator('[data-gc-ear-table]')).toBeVisible();
    // Per measure: 같은 쪽 / 반대 / 차이 없음, with the plain status.
    const row = id => ear.locator('[data-gc-ear-measure="' + id + '"]');
    expect(await cells(row('stability'))).toEqual(['3', '0', '1']);
    await expect(row('stability').locator('small')).toHaveText('귀와 같은 쪽으로 움직였어요 3번 중 3번 · 차이 없음 1번');
    await expect(row('stability')).toHaveAttribute('data-often', '');
    expect(await cells(row('intonation'))).toEqual(['3', '1', '0']);
    await expect(row('intonation').locator('small')).toHaveText('귀와 같은 쪽으로 움직였어요 4번 중 3번');
    await expect(row('intonation')).not.toHaveAttribute('data-often', '');
    expect(await cells(row('phrase'))).toEqual(['2', '0', '2']);
    // The tags given are held against their measures (음정 ↔ the intonation measures, 호흡 ↔ phrase length).
    await expect(ear.locator('[data-gc-ear-tag="intonation"]')).toHaveText(/음정 ↔ 가까운 반음과의 차이\s*귀와 같은 쪽으로 움직였어요 1번 중 1번/);
    await expect(ear.locator('[data-gc-ear-tag="phrase"]')).toHaveText(/호흡 ↔ 같은 프레이즈 길이\s*귀와 견줄 만큼 움직인 적이 아직 없어요 · 차이 없음 1번/);
    await expect(ear.locator('.gc-ear-note').first()).toContainText('처음 정해 본 것이에요');
    // The method mismatch is left out, with why.
    await ear.locator('[data-gc-ear-excluded] summary').click();
    await expect(ear.locator('[data-gc-ear-excluded] summary')).toHaveText('견줄 수 없어 뺀 평가 1개 · 왜');
    const mixed = ear.locator('[data-gc-ear-excluded-item="listen:mixed"]');
    await expect(mixed).toHaveAttribute('data-reason', 'method-mixed');
    await expect(mixed).toContainText('Defying Gravity · 2025년 8월 → 2026년 11월');
    await expect(mixed).toContainText('2025년 8월 녹음은 녹음 그대로, 2026년 11월 녹음은 MR 빼고 잰 것이라 견주지 않아요');
    expect(await ear.innerText()).not.toMatch(BANNED);
    await shot(ear, 'phone-375-ear-open.png');
    // Opened, it stays open when the card is drawn again (a verdict saved elsewhere).
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vzip:listen-verdicts')));
    await expect(ear.locator('[data-gc-ear-table]')).toBeVisible();
    // Derived on the fly: nothing stored changed.
    expect(JSON.stringify((await data(page)).comparisonReports)).toBe(stored);
    await page.setViewportSize({width:320, height:640});
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });

  test('연구소 › 귀와 숫자 표 전체: the same table, open on its own page, with what was left out', async ({page}) => {
    await boot(page);
    await report(page);
    await page.locator('[data-growth-ear] [data-gc-ear] > summary').click();
    const folded = {summary:await page.locator('[data-growth-ear] [data-gc-ear-summary]').innerText(), rows:await page.locator('[data-growth-ear] [data-gc-ear-measure]').allInnerTexts(),
      excluded:await page.locator('[data-growth-ear] [data-gc-ear-excluded-item]').count()};
    await page.evaluate(() => { location.hash = '#/growth-lab'; });
    await expect(page.locator('[data-lab-state="ear"]')).toHaveText('평가 ' + (await data(page)).comparisonReports.filter(r => r.kind === 'listen-verdict').length + '개');
    await page.locator('[data-lab-tool="ear"]').click();
    await expect(page).toHaveURL(/#\/growth-ear$/);
    const full = page.locator('[data-growth-ear-page]');
    await expect(full.locator('[data-gc-ear-table]')).toBeVisible();                           // open, nothing to unfold
    expect(await full.locator('[data-gc-ear-summary]').innerText()).toBe(folded.summary);
    expect(await full.locator('[data-gc-ear-measure]').allInnerTexts()).toEqual(folded.rows);   // the same counts as under 달라진 것
    await expect(full.locator('[data-gc-ear-excluded-item]')).toHaveCount(folded.excluded);
    await expect(full).not.toContainText(BANNED);
    await noOverflow(page);
    await page.locator('[data-back]').click();
    await expect(page).toHaveURL(/#\/growth-lab$/);
  });

  test('이 평가와 숫자: each measure next to the verdict, and why a pair is not compared', async ({page}) => {
    await boot(page);
    await report(page);
    const detail = page.locator('[data-gc-verdict="listen:m13"] [data-gc-ear-verdict]');
    await expect(detail).not.toHaveAttribute('open', '');
    await expect(detail.locator('summary')).toHaveText(/이 평가와 숫자\s*같은 쪽 3 · 반대 0 · 차이 없음 3/);
    await detail.locator('summary').click();
    await expect(detail.locator('.gc-ear-basis')).toHaveText('녹음 그대로 잰 두 녹음 · 분석 v2');
    const row = id => detail.locator('[data-gc-ear-row="' + id + '"]');
    await expect(row('stability')).toHaveAttribute('data-result', 'agree');
    await expect(row('stability').locator('.gc-ear-badge')).toHaveText('같은 쪽');
    await expect(row('stability').locator('.gc-ear-move')).toHaveText('2026년 11월 녹음에서 지속음 흔들림이 더 작아요');
    await expect(row('stability').locator('.gc-ear-tag')).toHaveText('음정 평가와는 같은 쪽');
    await expect(row('phrase').locator('.gc-ear-tag')).toHaveText('호흡 평가와는 차이 없음');
    await expect(row('range').locator('.gc-ear-badge')).toHaveText('차이 없음');
    await expect(row('range').locator('.gc-ear-move')).toHaveText('안정 최고음은 같아요');
    // 9월 heard as better while 9월 → 11월 got more in tune: 반대, said as it is.
    const sep = page.locator('[data-gc-verdict="listen:sep"] [data-gc-ear-verdict]');
    await sep.locator('summary').click();
    await expect(sep.locator('[data-gc-ear-row="intonation"] .gc-ear-badge')).toHaveText('반대');
    await expect(sep.locator('[data-gc-ear-row="intonation"] .gc-ear-move')).toHaveText('11월 녹음에서 가까운 반음과의 차이가 더 작아요');
    await expect(sep.locator('.gc-ear-basis')).toHaveText('MR 빼고 잰 두 녹음 · 분석 v2');
    // The mixed pair: which takes, and why.
    const mixed = page.locator('[data-gc-verdict="listen:mixed"] [data-gc-ear-verdict]');
    await expect(mixed.locator('summary')).toHaveText(/이 평가와 숫자\s*견줄 수 없어요/);
    await mixed.locator('summary').click();
    await expect(mixed.locator('[data-gc-ear-why]')).toHaveAttribute('data-gc-ear-why', 'method-mixed');
    await expect(mixed.locator('[data-gc-ear-why]')).toHaveText('2025년 8월 녹음은 녹음 그대로, 2026년 11월 녹음은 MR 빼고 잰 것이라 견주지 않아요 · 같은 방법으로 잰 녹음끼리만 견줘요');
    expect((await detail.locator('summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('[data-gc-group="verdicts"]').innerText()).not.toMatch(BANNED);
    await detail.scrollIntoViewIfNeeded();
    await shot(page.locator('[data-gc-verdict="listen:m13"]'), 'phone-375-verdict-detail.png');
    await page.setViewportSize({width:320, height:640});
    await noOverflow(page);
    expect(page.__errors).toEqual([]);
  });

  test('the "귀와 자주 같아요" mark appears only with 3 agreements and none against; fewer than 3 verdicts: only the count', async ({page}) => {
    // Two usable verdicts (the mixed pair does not count): nothing summed up, no mark, no table.
    await boot(page, seed([MIXED, M23, M13]));
    await report(page);
    const ear = page.locator('[data-growth-ear]');
    await expect(ear.locator('[data-gc-ear-summary]')).toHaveText('평가가 3개 이상 모이면 보여 드려요 (지금 2개)');
    await ear.locator('[data-gc-ear] > summary').click();
    await expect(ear.locator('[data-gc-ear-table]')).toHaveCount(0);
    await expect(ear.locator('[data-gc-ear-excluded-item="listen:mixed"]')).toHaveCount(1);
    await expect(page.locator('[data-gc-ear-mark]')).toHaveCount(0);
    // Each verdict's own comparison is still there.
    await expect(page.locator('[data-gc-verdict="listen:m13"] [data-gc-ear-verdict] summary')).toContainText('같은 쪽 3');
    expect(page.__errors).toEqual([]);
  });

  test('…and with the third agreeing verdict the mark shows on that measure\'s same-song line only', async ({page}) => {
    await boot(page);
    await report(page);
    const marks = page.locator('[data-gc-ear-mark]');
    await expect(marks).toHaveCount(1);
    await expect(page.locator('[data-gc-song="s3"] [data-gc-obs="stability"] [data-gc-ear-mark]')).toHaveText('귀와 자주 같아요');
    // 가까운 반음과의 차이 went with the ear 3 times and against it once: no mark, and its line is still shown.
    await expect(page.locator('[data-gc-song="s3"] [data-gc-obs="intonation"]')).toBeVisible();
    await expect(page.locator('[data-gc-song="s3"] [data-gc-obs="intonation"] [data-gc-ear-mark]')).toHaveCount(0);
    await expect(page.locator('[data-gc-song="s1"] [data-gc-obs="intonation"]')).toBeVisible();
    await page.locator('[data-gc-song="s3"]').scrollIntoViewIfNeeded();
    await shot(page.locator('[data-gc-song="s3"]'), 'phone-375-song-mark.png');
    expect(page.__errors).toEqual([]);
  });
});

test.describe('tablet', () => {
test.use({deviceScaleFactor:2});
test('tablet 1024: 귀와 숫자 spans the width under the card, opened without overflow', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width:1024, height:1366});
  await boot(page);
  await report(page);
  const card = page.locator('[data-growth-changes-card]'), ear = page.locator('[data-growth-ear]');
  await ear.locator('[data-gc-ear] > summary').click();
  await expect(ear.locator('[data-gc-ear-table]')).toBeVisible();
  const [c, x] = await Promise.all([card.boundingBox(), ear.boundingBox()]);
  expect(Math.abs(c.x - x.x)).toBeLessThan(2);
  expect(Math.abs(c.width - x.width)).toBeLessThan(2);
  expect(x.y).toBeGreaterThan(c.y + c.height);
  await page.locator('[data-gc-verdict="listen:m13"] [data-gc-ear-verdict] summary').click();
  await noOverflow(page);
  await page.evaluate(() => document.querySelector('[data-growth-changes]').scrollIntoView());
  await shot(page.locator('[data-growth-changes]'), 'tablet-1024-ear.png');
  expect(page.__errors).toEqual([]);
});
});
