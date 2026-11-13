// Two takes recorded on the same day: every growth screen (성장 tab 전체/월별, 보컬 연구소, 곡 카드) reads the one
// recorded later that day as the latest take — by the recording time, never by the (random) id.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const pad = n => String(n).padStart(2, '0');
const now = new Date(), thisMonth = now.getFullYear() + '-' + pad(now.getMonth() + 1);
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1), prevMonth = prev.getFullYear() + '-' + pad(prev.getMonth() + 1);
const older = new Date(now.getFullYear(), now.getMonth() - 3, 1), olderMonth = older.getFullYear() + '-' + pad(older.getMonth() + 1);
const note = c => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][Math.round(c / 100) % 12] + (Math.floor(Math.round(c / 100) / 12) - 1);
// A v2 summary with the growth-report detail. phrases: [start, dur, midi, intonation, wobble]; bands: [midi, n, held, longest, nw, wobble].
const v2 = ({into, wob, longer = 0, highWob = 12, stable = 7700}) => ({v:2, at:Date.now(), seconds:120, metrics:{voicedSeconds:60,
  intonation:{meanAbsCents:into + 3, within20:70, notes:40}, stability:{wobbleCents:wob + 1, notes:15}, vibrato:{share:20, notes:10},
  range:{validHigh:{note:note(stable + 200), cents:stable + 200}, stableHigh:{note:note(stable), cents:stable}, instantaneous:{note:'C7', cents:9600, t:30},
    main:{low:'C4', high:'D5', lowCents:6000, highCents:7400}},
  breath:{phrases:5, medianPhrase:3 + longer},
  phrases:{v:1, rows:[[10, 3 + longer, 64, into, wob], [15, 2.5 + longer, 67, into, wob], [20, 3.5 + longer, 69, into, wob], [26, 4 + longer, 72, into, wob], [32, 2 + longer, 71, into, wob]]},
  pitchBands:{v:1, rows:[[60, 4, .6, 1, 3, 6], [62, 4, .6, 1, 3, 6], [64, 5, .7, 1.2, 4, 7], [65, 3, .5, .8, 2, 19], [67, 4, .6, 1, 3, 6], [72, 3, .8, 1.2, 3, highWob], [74, 2, .8, 1, 2, highWob]]}},
  confidence:{pitchConfidence:.95, voiceOverMrDb:12}});
const v1 = into => ({v:1, at:1, metrics:{voicedSeconds:40, intonation:{meanAbsCents:into, notes:20}, stability:{wobbleCents:15, notes:6}, range:{high:'A5', highCents:8100}, breath:{medianPhrase:2.5}}, confidence:{voiceOverMrDb:12}});
// The ids sort against the recording time on both days: 'a-…' was recorded last.
const TAKES = [
  ['y-first', 's1', prevMonth + '-10', v2({into:20, wob:10}), '09:00'],
  ['b-second', 's1', prevMonth + '-10', v2({into:26, wob:10}), '20:00'],
  ['z-morning', 's1', thisMonth + '-01', v2({into:32, wob:10}), '09:00'],
  ['a-evening', 's1', thisMonth + '-01', v2({into:11, wob:10}), '21:00']
];
async function boot(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  const seed = {categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[],
    songs:[{id:'s1', title:'Defying Gravity', vocalRange:{version:1, low:'A3', high:'D5', lowMidi:57, highMidi:74, source:'manual', confirmedByUser:true, updatedAt:1}}, {id:'s2', title:'On My Own (아주 긴 곡 제목이 들어가도 줄바꿈되는지 확인)'}]};
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(async takes => {
    window.vzipCloudSignedIn = () => false;
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (const [id, songId, date, , time] of takes) await window.vzipStorePracticeMedia({id, name:'연습 ' + date, created:new Date(date + 'T' + time + ':00').getTime(), recordedDate:date, dateSource:'metadata', type:'audio/wav', source:'practice', songId, song:'', blob:new Blob([buf], {type:'audio/wav'}), durationSeconds:120});
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x[0] === m.id); if (t) await VZ.media.update(m, {analysis:t[3]}, {quiet:true}); }
    VZ.media.invalidate();
    window.dispatchEvent(new Event('vzip:media-updated'));
  }, TAKES);
  await page.waitForTimeout(400);
}
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('성장 tab: the evening take is the latest one in 전체 분석 and 월별 분석', async ({page}) => {
  await boot(page);
  await page.goto('/#/vocal-growth');
  const into = page.locator('[data-growth-metric="intonation"]');
  await expect(into.locator('.growth-state').first()).toHaveText('좋아진 방향'); // ±20 (first take) → ±11 (evening), not → ±32
  const overall = await page.evaluate(async () => { const items = await VZ.media.list(); return window.VzipOverallGrowth.calculate(items, {getDate:VZ.media.dateOf, valid:m => VZ.analysisReliable(m.analysis)}).metrics.find(m => m.id === 'intonation').pairs[0]; });
  expect(overall).toMatchObject({firstId:'y-first', lastId:'a-evening', before:20, after:11});
  await page.locator('[data-growth-mode="monthly"]').click();
  await expect(page.locator('[data-growth-select]')).toHaveValue(thisMonth);
  // Last month's latest (evening, ±26) vs this month's latest (evening, ±11).
  await expect(page.locator('[data-month-section="results"] [data-growth-metric="intonation"] .growth-state').first()).toHaveText('좋아진 방향');
  await expect(page.locator('[data-month-section="results"] [data-growth-metric="intonation"]')).toContainText('±26');
  await expect(page.locator('[data-month-section="results"] [data-growth-metric="intonation"]')).toContainText('±11');
});

test('보컬 연구소 and the song card compare the same first and latest takes', async ({page}) => {
  await boot(page);
  await page.goto('/#/vocal-lab/s1');
  // Date tabs: oldest on the left, newest on the right, by recording time.
  await expect(page.locator('.vl-dates button').first()).toBeVisible();
  for (const b of await page.locator('.vl-dates button').all()) if (await b.getAttribute('aria-pressed') !== 'true') await b.click();
  const row = page.locator('[data-growth-report] [data-growth-row="intonation"]');
  await expect(row).toContainText('±20 cent → ±11 cent');
  await expect(row).toHaveClass(/good/);
  await page.goto('/#/song/s1');
  await page.evaluate(async () => { const host = document.createElement('div'); host.id = 'vg-host'; host.dataset.songVocal = ''; document.querySelector('#view').append(host); VZ.songVocalGrowth(host, VZ.song('s1'), (await VZ.media.list()).filter(m => m.songId === 's1')); });
  const line = page.locator('#vg-host .vg-growth li').filter({hasText:'음정 정확도'});
  await expect(line).toContainText('좋아진');
  await expect(line).toContainText('9 cent');
});
