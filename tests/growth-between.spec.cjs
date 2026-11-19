// 그 사이에 한 것 (app/growth-between-model.js, drawn by app/growth-changes-ui.js) under a song pair and under a
// verdict of 무엇이 달라졌나, on fake data — the set-up of tests/growth-ear.spec.cjs (short generated WAV takes).
// Closed by default, 44px, no horizontal overflow at 320 px, read-only. Screenshot: LISTEN_SHOTS=<dir>.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const fs = require('node:fs'), path = require('node:path');
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
const M12 = verdict('listen:m12', 's3', 'm1', 'm2', 'second', '2026-11-10');
const M23 = verdict('listen:m23', 's3', 'm2', 'm3', 'second', '2026-11-12');
const seed = verdicts => ({categories:[], assignments:[], comparisonReports:verdicts, performances:[], vocalPlanReports:[], monthlyGrowthReports:[], monthlyAiReports:[], overallAiReports:[], practices:[], practicePlans:[], dailyGoals:[],
  songs:[{id:'s1', title:'Defying Gravity', created:1}, {id:'s3', title:'Memory', created:3}], lessons:[], deleted:{}});
test.use({timezoneId:'Asia/Seoul', locale:'ko-KR'});

async function boot(page, db, takes = TAKES) {
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

// Between Memory 2025-08-02 (m1) and 2026-11-16 (m3), and inside the verdict m2 (2026-03-02) → m3: two lessons, three
// practice days (one made from an imported recording, without minutes), three goals done. Deleted and cancelled rows
// and an unfinished goal are left out. Nothing between m1 and m2 (the verdict listen:m12).
function between() {
  const db = seed([M12, M23]);
  db.lessons = [
    {id:'L1', date:'2026-04-10', status:'done', categoryLabel:'호흡', detail:'롱톤', songIds:['s3'], feedback:'', memo:'', recordings:[], created:1},
    {id:'L2', date:'2026-11-16', status:'done', feedback:'턱 힘 빼기', songIds:[], memo:'', recordings:[], created:2},
    {id:'L-del', date:'2026-05-01', status:'done', categoryLabel:'지운 레슨', songIds:['s3'], feedback:'', memo:'', recordings:[], created:3},
    {id:'L-off', date:'2026-05-02', status:'cancelled', categoryLabel:'취소한 레슨', songIds:['s3'], feedback:'', memo:'', recordings:[], created:4}];
  db.practices = [
    {id:'P1', date:'2026-04-11', songId:'s3', practiceMode:'song', minutes:30, manualMinutes:30, practiceTimeSource:'manual', created:1},
    {id:'P2', date:'2026-04-12', songId:'', practiceMode:'training', categoryLabel:'발성', minutes:15, manualMinutes:15, practiceTimeSource:'manual', created:2},
    {id:'P3', date:'2026-06-01', songId:'s3', practiceMode:'song', minutes:0, manualMinutes:0, mediaSeconds:600, practiceTimeSource:'unconfirmed', mediaIds:['m2'], created:3},
    {id:'P-del', date:'2026-04-13', songId:'s3', practiceMode:'song', minutes:100, manualMinutes:100, practiceTimeSource:'manual', created:4}];
  db.dailyGoals = [
    {id:'g1', date:'2026-04-11', title:'롱톤 5분', source:'personal', completed:true, created:1},
    {id:'g2', date:'2026-04-12', title:'롱톤 5분', source:'personal', completed:true, created:2},
    {id:'g3', date:'2026-04-12', title:'립트릴', source:'personal', completed:true, created:3},
    {id:'g4', date:'2026-04-13', title:'안 한 목표', source:'personal', completed:false, created:4}];
  db.deleted = {lessons:['L-del'], practices:['P-del']};
  return db;
}
const BANNED = /덕분|때문에 좋아|효과|향상|악화|개선|좋아졌|나빠졌/;

test('그 사이에 한 것: under a song pair and a verdict, closed; what was recorded between the two takes, or that nothing was', async ({page}) => {
  await boot(page, between());
  // The lists it reads (결과 리포트 itself keeps its monthly summaries; those are not this line's).
  const read = async () => { const d = await data(page); return JSON.stringify(['lessons', 'practices', 'dailyGoals', 'assignments', 'deleted', 'comparisonReports'].map(k => d[k])); };
  const stored = await read();
  await report(page);
  // Under the song pair Memory 2025-08-02 → 2026-11-16.
  const song = page.locator('[data-gc-song="s3"] [data-gc-between="song:s3"]');
  await expect(song).toHaveCount(1);
  await expect(song).not.toHaveAttribute('open', '');
  await expect(song.locator('summary')).toHaveText(/그 사이에 한 것\s*레슨 2번 · 연습 3일 · 숙제·목표 3번 · 녹음 1개/);
  expect((await song.locator('summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(song.locator('[data-gc-between-row]').first()).toBeHidden();
  await song.locator('summary').click();
  await expect(song.locator('.gc-between-head')).toHaveText('이 사이에 기록된 것 · 무엇 때문에 달라졌는지는 알 수 없어요');
  await expect(song.locator('.gc-between-range')).toHaveText('2025년 8월 2일 다음 날부터 2026년 11월 16일까지');
  expect(await song.locator('[data-gc-between-row]').allInnerTexts()).toEqual([
    '레슨 2번 · 4월 10일 (호흡 · 롱톤), 11월 16일 (턱 힘 빼기)',
    '연습 기록 3일 · 적은 시간 45분 (이 곡 2일 · 30분, 다른 연습 1일 · 15분)',
    '한 숙제·목표 3번 · 롱톤 5분 2번, 립트릴 1번',
    '이 곡 녹음 1개 (비교한 두 녹음 빼고)']);
  // Under the verdict m2 (2026-03-02) → m3: the same records; the pair's own takes are not counted.
  const verdict = page.locator('[data-gc-verdict="listen:m23"] [data-gc-between="verdict:listen:m23"]');
  await expect(verdict.locator('summary')).toHaveText(/그 사이에 한 것\s*레슨 2번 · 연습 3일 · 숙제·목표 3번$/);
  await verdict.locator('summary').click();
  await expect(verdict.locator('.gc-between-range')).toHaveText('3월 2일 다음 날부터 11월 16일까지');
  await expect(verdict.locator('[data-gc-between-row="recordings"]')).toHaveCount(0);
  await expect(verdict.locator('[data-gc-between-row="practice"]')).toHaveText('연습 기록 3일 · 적은 시간 45분 (이 곡 2일 · 30분, 다른 연습 1일 · 15분)');
  // Under the verdict m1 → m2 nothing was recorded.
  const none = page.locator('[data-gc-verdict="listen:m12"] [data-gc-between="verdict:listen:m12"]');
  await expect(none).toHaveAttribute('data-empty', '');
  await expect(none.locator('summary small')).toHaveText('기록 없음');
  await none.locator('summary').click();
  await expect(none.locator('[data-gc-between-empty]')).toHaveText('이 사이에 기록된 레슨·연습이 없어요');
  if (process.env.LISTEN_SHOTS) { fs.mkdirSync(process.env.LISTEN_SHOTS, {recursive:true}); await song.locator('xpath=..').screenshot({path:path.join(process.env.LISTEN_SHOTS, 'between-' + test.info().project.name + '.png')}); }
  // Deleted and cancelled rows never show.
  const card = page.locator('[data-growth-changes-card]');
  expect(await card.innerText()).not.toMatch(/지운 레슨|취소한 레슨|안 한 목표|1시간/);
  expect(await card.locator('.gc-between').allInnerTexts()).not.toContainEqual(expect.stringMatching(BANNED));
  // Read-only: nothing it reads was changed.
  expect(await read()).toBe(stored);
  await page.setViewportSize({width:320, height:640});
  await noOverflow(page);
  for (const s of await card.locator('.gc-between > summary').all()) if (await s.isVisible()) expect((await s.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(page.__errors).toEqual([]);
});
