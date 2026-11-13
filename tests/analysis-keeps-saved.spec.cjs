// 보컬 분석 화면 (#/analysis/:id): opening it never replaces a current saved result (the server's included). The
// screen analyses on the device for display only; saving happens when no current result exists or when the person
// presses 다시 분석해서 저장. Leaving the screen stops the on-device analysis worker.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {synth} = require('./synth-vocal.cjs');
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const wavOf = ({samples, sr}) => { const b = Buffer.alloc(44 + samples.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40); samples.forEach((s, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2)); return b; };
const SONG = wavOf(synth({sr:22050}));
// A current server result (v2 with the detail rows) that already replaced an older v1 result.
const SERVER = {v:2, at:1111, by:'server', seconds:20, metrics:{voicedSeconds:15, intonation:{meanAbsCents:9, within20:90, notes:9},
  phrases:{v:1, rows:[[1, 3, 64, 9, 5]]}, pitchBands:{v:1, rows:[[64, 4, .6, 1, 3, 6]]}}, confidence:{pitchConfidence:.95, voiceOverMrDb:12},
  history:[{v:1, at:5, metrics:{voicedSeconds:15}}], scope:{kind:'whole-recording', cut:false}};
// v2 saved before the detail rows existed: not current, analysed and saved again like before.
const STALE = {v:2, at:2222, by:'server', seconds:20, metrics:{voicedSeconds:15, intonation:{meanAbsCents:9, within20:90, notes:9}}, confidence:{pitchConfidence:.95}};

async function boot(page, analyses) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/__song.wav', r => r.fulfill({contentType:'audio/wav', body:SONG}));
  // Count the analysis workers and whether they were stopped.
  await page.addInitScript(() => {
    const Real = window.Worker; window.__workers = [];
    window.Worker = class extends Real {
      constructor(url, ...rest) { super(url, ...rest); this.__row = {url:String(url), stopped:false}; window.__workers.push(this.__row); }
      terminate() { this.__row.stopped = true; super.terminate(); }
    };
  });
  const seed = {categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[], songs:[{id:'s1', title:'This Is Me'}]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async list => {
    window.vzipCloudSignedIn = () => false;
    const blob = await (await fetch('/__song.wav')).blob();
    for (const [id] of list) await window.vzipStorePracticeMedia({id, name:'녹음 ' + id, created:Date.now(), type:'audio/wav', source:'practice', songId:'s1', blob, durationSeconds:20});
    for (const m of await VZ.media.list(true)) { const a = list.find(x => x[0] === m.id)?.[1]; if (a) await VZ.media.update(m, {analysis:a}, {quiet:true}); }
    VZ.media.invalidate();
  }, analyses);
}
const stored = (page, id) => page.evaluate(async id => (await window.vzipReadMedia()).find(x => x.id === id).analysis, id);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('opening the analysis screen shows the curve but leaves a current saved (server) result untouched', async ({page}) => {
  test.setTimeout(120000);
  await boot(page, [['kept', SERVER]]);
  let saves = 0;
  await page.evaluate(() => window.addEventListener('vzip:analysis-saved', () => { window.__saves = (window.__saves || 0) + 1; }));
  await page.goto('/#/analysis/kept');
  const out = page.locator('[data-out]');
  await expect(out.locator('.ana-grid')).toBeVisible({timeout:60000});
  // The screen keeps its content: curve, notes and the measurement cards computed on this device.
  await expect(out.locator('svg path.curve')).toHaveCount(1);
  await expect(out).toContainText('음정 정확도');
  await expect(out.locator('[data-saved]')).toContainText('그대로 두었어요');
  await expect(out.locator('[data-ana-reanalyze]')).toBeVisible();
  if (process.env.VZ_SHOTS) { await out.locator('[data-ana-reanalyze]').scrollIntoViewIfNeeded(); await page.screenshot({path:process.env.VZ_SHOTS + '/analysis-kept.png'}); }
  await page.waitForTimeout(500);
  expect(await stored(page, 'kept')).toEqual(SERVER); // same at, by:'server', same history
  saves = await page.evaluate(() => window.__saves || 0);
  expect(saves).toBe(0);
  // Opening it again still writes nothing.
  await page.goto('/#/home'); await page.goto('/#/analysis/kept');
  await expect(page.locator('[data-out] .ana-grid')).toBeVisible({timeout:60000});
  await page.waitForTimeout(300);
  expect(await stored(page, 'kept')).toEqual(SERVER);

  // The explicit action saves the device result once and keeps the previous one in history.
  const button = page.locator('[data-out] [data-ana-reanalyze]');
  const box = await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect(page.locator('[data-out] [data-saved]')).toContainText('저장했어요');
  await expect(page.locator('[data-out] [data-ana-reanalyze]')).toHaveCount(0);
  const after = await stored(page, 'kept');
  expect(after.by).toBeUndefined();
  expect(after.at).toBeGreaterThan(SERVER.at);
  expect(after.metrics.phrases.rows.length).toBeGreaterThan(0);
  expect(after.history.map(h => [h.v, h.at, h.by])).toEqual([[1, 5, undefined], [2, 1111, 'server']]);
  expect(await page.evaluate(() => window.__saves)).toBe(1);
});

test('a recording without a current result is still analysed and saved on opening', async ({page}) => {
  test.setTimeout(120000);
  await boot(page, [['none', null], ['stale', STALE]]);
  await page.goto('/#/analysis/none');
  await expect(page.locator('[data-out] [data-saved]')).toContainText('저장했어요', {timeout:60000});
  await expect(page.locator('[data-out] [data-ana-reanalyze]')).toHaveCount(0);
  const fresh = await stored(page, 'none');
  expect(fresh.v).toBe(2); expect(fresh.metrics.phrases.rows.length).toBeGreaterThan(0); expect(fresh.history).toBeUndefined();
  await page.goto('/#/home'); await page.goto('/#/analysis/stale');
  await expect(page.locator('[data-out] [data-saved]')).toContainText('저장했어요', {timeout:60000});
  const redone = await stored(page, 'stale');
  expect(redone.at).toBeGreaterThan(STALE.at);
  expect(redone.metrics.phrases.rows.length).toBeGreaterThan(0);
  expect(redone.history.map(h => h.at)).toEqual([2222]); // the detail-less result is kept in history
});

test('leaving the analysis screen stops the on-device analysis worker', async ({page}) => {
  // A worker that reports progress and never finishes: only leaving the screen can stop it.
  await page.route('**/app/vocal-analysis.js*', r => r.fulfill({contentType:'application/javascript', body:'onmessage=()=>{postMessage({progress:.1})};'}));
  await boot(page, [['slow', null]]);
  await page.goto('/#/analysis/slow');
  const mine = () => page.evaluate(() => window.__workers.filter(w => w.url.includes('vocal-analysis')));
  await expect.poll(async () => (await mine()).length, {timeout:20000}).toBe(1);
  expect((await mine())[0].stopped).toBe(false);
  await page.goto('/#/home');
  await expect.poll(async () => (await mine())[0].stopped).toBe(true);
  expect(await stored(page, 'slow')).toBeFalsy(); // nothing was saved
});
