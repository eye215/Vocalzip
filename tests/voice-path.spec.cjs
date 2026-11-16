// 소리 길 흔적 (시험판, app/voice-path.js): two takes of a song side by side, measured on this device from generated
// WAV recordings (tests/helpers/voice-path-audio.cjs, and tests/helpers/mr-synth.cjs for takes sung over an MR) seeded
// the way the other lab specs seed theirs. Timing is never asserted.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const AUDIO = require('./helpers/voice-path-audio.cjs');
const MR_SYNTH = require('node:fs').readFileSync(require('node:path').join(__dirname, 'helpers/mr-synth.cjs'), 'utf8').replace(/module\.exports[^\n]*/, 'window.mrSynth = {SR, mr, vocal, record, rms};');
const KEY = 'vocal-zip_mvp_v1';
const NOTE = '소리의 길은 선생님 귀로 판단해요. 이 화면은 다시 들어볼 곳을 찾는 참고예요.';
const stub = `window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};let writing=false;for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert'){window.__up.push(a[0]);writing=true}return c};c.then=r=>r({data:writing?[{user_id:'ui-test-user'}]:[],error:null});return c}})};`;
const seed = () => ({categories:[], songs:[{id:'s1', title:'지금 이 순간', show:'지킬 앤 하이드'}, {id:'s2', title:'On My Own', show:''}], lessons:[], assignments:[], practices:[], comparisonReports:[]});
const stored = confidence => ({v:2, at:1763000000000, seconds:34, metrics:{voicedSeconds:28, stability:{wobbleCents:20, notes:9}, intonation:{meanAbsCents:18, notes:9}, phrases:[]}, confidence:{pitchConfidence:0.95, voicedShare:82, ...confidence}, scope:{kind:'whole-recording', cut:false}});
// Oldest → newest. m-raw (the newest) has no analysis, so it is not the default 비교; m-mid was sung over an MR.
const TAKES = [
  {id:'m-old', name:'작년 8월 연습 SECRETNAME', kind:'worse', date:'2025-08-14', analysis:stored({voiceOverMrDb:null})},
  {id:'m-mid', name:'3월 MR 연습', kind:'better', date:'2026-03-02', analysis:stored({voiceOverMrDb:8})},
  {id:'m-new', name:'올해 11월 연습', kind:'better', date:'2026-11-09', analysis:stored({voiceOverMrDb:null})},
  {id:'m-raw', name:'분석 전 녹음', kind:'better', date:'2026-11-12', analysis:null}
];
async function boot(page, {takes = TAKES, seconds = 34, rate = 16000} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); }
    // Counters the tests read: decodes (how often a file was turned into sound) and this screen's workers.
    window.__decodes = 0; window.__workers = {made:0, ended:0};
    const C = window.OfflineAudioContext, decode = C.prototype.decodeAudioData;
    C.prototype.decodeAudioData = function (...a) { const n = ++window.__decodes, hold = window.__holdDecode?.(n); return hold ? hold.then(() => decode.apply(this, a)) : decode.apply(this, a); };
    const W = window.Worker;
    window.Worker = function (url, o) { const w = new W(url, o); if (String(url).includes('voice-path-worker')) { window.__workers.made++; const end = w.terminate.bind(w); w.terminate = () => { window.__workers.ended++; end(); }; } return w; };
    window.Worker.prototype = W.prototype;
  }, [KEY, JSON.stringify(seed())]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  // A signed-out-of-cloud device, so the files stay in IndexedDB (as the other media specs do).
  await page.evaluate(() => { window.vzipCloudSignedIn = () => false; });
  await page.evaluate('(' + AUDIO.source + ')()');
  await page.evaluate(async ([takes, seconds, rate]) => {
    for (const t of takes) await window.vzipStorePracticeMedia({id:t.id, name:t.name, created:new Date(t.date + 'T10:00:00').getTime(), type:'audio/wav', source:'practice', songId:'s1', song:'지금 이 순간',
      blob:new Blob([t.wav ? window[t.wav]() : window.vpTake.take(t.kind, t.seconds || seconds, rate)], {type:'audio/wav'}), durationSeconds:t.seconds || seconds});
    window.dispatchEvent(new Event('vzip:media-updated'));
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {recordedDate:t.date, ...(t.analysis ? {analysis:t.analysis} : {})}, {quiet:true}); }
    // A name typed by the person (set after the date, which names an untouched recording by itself).
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x.id === m.id); if (t) await VZ.media.update(m, {name:t.name}, {quiet:true}); }
    await VZ.media.list(true);                                                       // the list the screens read now has the dates and analyses
  }, [takes, seconds, rate]);
  await page.waitForTimeout(400);
}
const data = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const open = async (page, query = '') => {
  await page.evaluate(q => { location.hash = '#/voice-path/s1' + q; }, query);
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  // Every stage line the screen shows, in order ("a:재는 중 88% · 0:30 / 0:34").
  await page.evaluate(() => { window.__stages = []; window.__watch?.disconnect();
    window.__watch = new MutationObserver(() => document.querySelectorAll('[data-vp-stage]').forEach(el => { const t = el.closest('[data-vp-progress]').dataset.vpProgress + ':' + el.textContent; if (window.__stages.at(-1) !== t) window.__stages.push(t); }));
    window.__watch.observe(document.querySelector('[data-vp]'), {subtree:true, childList:true, characterData:true}); });
};
const done = page => expect(page.locator('[data-vp-results][data-vp-complete="true"]')).toBeVisible({timeout:60000});
const measure = async page => { await page.locator('[data-vp-run]').click(); await done(page); await expect(page.locator('[data-vp-status]')).toHaveText('다 쟀어요.'); };
const row = (page, id) => page.locator('[data-vp-row="' + id + '"]');
// Names what runs off the screen (the deepest elements past the right edge), so a failure on an engine that cannot be
// run locally still says where to look.
const noOverflow = async page => expect(await page.evaluate(() => {
  const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
  if (over <= 1) return [];
  // Past the right edge themselves, or holding content wider than they are (text that cannot wrap, a pseudo-element).
  const bad = [...document.body.querySelectorAll('*')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).overflowX === 'visible' && r.left + el.scrollWidth > w + 1)); });
  return ['overflow ' + over + 'px'].concat(bad.filter(el => !bad.some(o => o !== el && el.contains(o))).slice(0, 8).map(el => { const r = el.getBoundingClientRect();
    return el.tagName.toLowerCase() + '.' + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().replace(/\s+/g, '.') + [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => '[' + a.name + ']').join('') + ' left ' + Math.round(r.left) + ' width ' + Math.round(r.width) + ' scroll ' + el.scrollWidth + ' "' + (el.textContent || '').trim().slice(0, 24) + '"'; }));
})).toEqual([]);
const BANNED = /좋아졌|나빠졌|좋아진|나빠진|나아졌|향상|악화|개선|길이 맞|길을 찾았|잘했어요|못했어요/;
const DIRECTION = /늘었어요|줄었어요|커졌어요|작아졌어요/;
const REFUSED = '반주가 목소리만큼 크게 들어가 있어 이 녹음은 잴 수 없어요. 이어폰을 끼고 녹음한 것(목소리만 들어간 것)으로 비교해 주세요.';
/** The device store of this screen, read straight from IndexedDB. */
const kept = page => page.evaluate(async () => {
  const name = (await indexedDB.databases()).map(d => d.name).find(n => n.startsWith('vocalzip_voice_path_v1'));
  if (!name) return [];
  return await new Promise(resolve => { const o = indexedDB.open(name); o.onsuccess = () => { const q = o.result.transaction('takes').objectStore('takes').getAll(); q.onsuccess = () => { o.result.close(); resolve(q.result.map(r => ({id:r.id, model:r.model, at:r.at, mrSig:r.mrSig}))); }; }; });
});

test('성장 › 보컬 분석 opens it; the default pair is the earliest and the latest reliable take', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-analysis'; });
  const entry = page.locator('[data-hub-voice-path]');
  await expect(entry).toContainText('소리 길 흔적 · 시험판');
  await entry.click();
  await expect(page.locator('[data-vp-note]')).toHaveText(NOTE);
  // Only songs that have recordings are offered.
  await expect(page.locator('[data-vp-song]')).toHaveCount(1);
  await page.locator('[data-vp-song="s1"]').click();
  await expect(page).toHaveURL(/#\/voice-path\/s1$/);
  await expect(page.locator('[data-vp-note]')).toHaveText(NOTE);
  await expect(page.locator('[data-vp-pick="a"]')).toHaveValue('m-old');
  await expect(page.locator('[data-vp-pick="b"]')).toHaveValue('m-new');          // not m-raw: it has no reliable analysis
  await expect(page.locator('[data-vp-default]')).toHaveText('분석 신뢰도가 충분한 녹음 가운데 가장 이른 것과 가장 최근 것을 골랐어요.');
  await expect(page.locator('[data-vp-slot="a"] [data-vp-meta]')).toContainText('2025.08.14');
  // Nothing is measured until asked; the same take cannot be chosen on both sides.
  await expect(page.locator('[data-vp-results]')).toHaveCount(0);
  await expect(page.locator('[data-vp-pick="b"] option[value="m-old"]')).toHaveAttribute('disabled', '');
  await expect(page.locator('[data-vp-pick="a"] option[value="m-old"]')).toContainText('SECRETNAME');
  expect(page.__errors).toEqual([]);
});

test('a recording in 보컬 연구소 links to it with that recording as 비교', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { location.hash = '#/vocal-lab/s1?a=m-old&b=m-mid'; });
  const link = page.locator('[data-voice-path-link]');
  await expect(link).toContainText('소리 길 흔적 · 시험판');
  await expect(link).toHaveAttribute('href', '#/voice-path/s1?b=m-mid');
  await link.click();
  await expect(page.locator('[data-vp-pick="b"]')).toHaveValue('m-mid');
  await expect(page.locator('[data-vp-pick="a"]')).toHaveValue('m-old');
  expect(page.__errors).toEqual([]);
});

test('measuring shows each take\'s stage, can be stopped, and then gives rows in neutral words', async ({page}) => {
  await boot(page);
  await open(page);
  // Hold the reading of the sound, so the stages are there to see and stop.
  await page.evaluate(() => { window.__holdDecode = () => new Promise(() => {}); });
  await page.locator('[data-vp-run]').click();
  await expect(page.locator('[data-vp-progress="a"] [data-vp-stage]')).toHaveText('소리 읽는 중');
  await expect(page.locator('[data-vp-progress="b"] [data-vp-stage]')).toHaveText('차례를 기다리는 중');   // its file is already here
  const bar = page.locator('[data-vp-progress="a"] .vp-bar');
  await expect(bar).toHaveAttribute('role', 'progressbar');
  await expect(bar).toHaveAccessibleName('기준 녹음 재는 중');
  await expect(page.locator('[data-vp-pick="a"]')).toBeDisabled();
  await page.locator('[data-vp-cancel]').click();
  await expect(page.locator('[data-vp-status]')).toHaveText('그만뒀어요. 다시 재려면 흔적 재기를 눌러 주세요.');
  await expect(page.locator('[data-vp-results]')).toHaveCount(0);
  await expect(page.locator('[data-vp-progress]')).toHaveCount(0);
  await expect(page.locator('[data-vp-pick="a"]')).toBeEnabled();
  // Now for real.
  await page.evaluate(() => { window.__holdDecode = null; });
  await measure(page);
  const stages = await page.evaluate(() => window.__stages);
  expect(stages.some(t => /^a:재는 중 \d+% · 0:\d\d \/ 0:34$/.test(t)), stages.join(' | ')).toBe(true);   // by seconds measured
  expect(stages.some(t => /^b:재는 중 \d+%/.test(t)), stages.join(' | ')).toBe(true);
  expect(stages.some(t => /음높이|guide/.test(t))).toBe(false);                    // the app's pitch analysis is not run again
  await expect(page.locator('[data-vp-note]')).toHaveText(NOTE);
  await expect(page.locator('[data-vp-row]')).toHaveCount(10);
  await expect(page.locator('[data-vp-group]')).toHaveCount(5);
  // The older take has three dropouts and three flips; the newer one has none.
  await expect(row(page, 'breaks')).toHaveAttribute('data-state', 'different');
  await expect(row(page, 'breaks').locator('.vp-mark')).toHaveText('다름');
  await expect(row(page, 'breaks').locator('[data-vp-line]')).toHaveText('끊김이 줄었어요');
  await expect(row(page, 'breaks').locator('.vp-vals dd').first()).toContainText('(3곳)');
  await expect(row(page, 'breaks').locator('.vp-vals dd').last()).toContainText('(0곳)');
  await expect(row(page, 'flips').locator('[data-vp-line]')).toHaveText('뒤집힘이 줄었어요');
  await expect(row(page, 'pitchSd').locator('[data-vp-line]')).toHaveText('긴 음의 음높이 흔들림이 줄었어요');
  await expect(row(page, 'vibrato').locator('[data-vp-line]')).toHaveText('비브라토가 들어간 긴 음이 늘었어요');
  await expect(row(page, 'breath').locator('[data-vp-line]')).toHaveText('목소리에 섞인 숨·잡음이 줄었어요');
  for (const mark of await page.locator('.vp-row .vp-mark').allTextContents()) expect(['비슷함', '다름', '표본 부족', '잴 수 없음']).toContain(mark);
  // Both takes are voice only: nothing is withheld for an accompaniment, and the whole of each was measured.
  await expect(page.locator('[data-vp-unclean], [data-vp-refused]')).toHaveCount(0);
  await expect(row(page, 'brightness')).not.toHaveAttribute('data-state', 'hold');
  await expect(page.locator('[data-vp-take="a"] .vp-meta')).toContainText('녹음 0:34 전체를 쟀어요');
  await expect(page.locator('[data-vp-take="a"]')).toHaveAttribute('data-vp-source', 'clean');
  // Never a verdict, never "the 길 was found".
  expect(await page.locator('[data-vp]').innerText()).not.toMatch(BANNED);
  // Zones: the take's own thirds, thin ones named.
  await page.locator('[data-vp-zone-card] summary').click();
  await expect(page.locator('[data-vp-zones]')).toHaveCount(2);
  await expect(page.locator('[data-vp-zone]')).toHaveCount(6);
  // Every worker this screen started was ended, and no stored analysis was touched.
  expect(await page.evaluate(() => window.__workers)).toEqual({made:2, ended:2});
  const after = await page.evaluate(async () => (await VZ.media.list(true)).map(m => [m.id, m.analysis?.at ?? null]));
  expect(Object.fromEntries(after)).toEqual({'m-old':1763000000000, 'm-mid':1763000000000, 'm-new':1763000000000, 'm-raw':null});
  expect(page.__errors).toEqual([]);
});

test('the first take is shown as soon as it is measured, while the second is still being read', async ({page}) => {
  await boot(page);
  await open(page);
  await page.evaluate(() => { let n = 0; window.__holdDecode = () => ++n === 2 ? new Promise(resolve => { window.__release = resolve; }) : null; });
  await page.locator('[data-vp-run]').click();
  await expect(page.locator('[data-vp-results][data-vp-complete="false"]')).toBeVisible({timeout:30000});
  await expect(page.locator('[data-vp-take="a"] .vp-meta')).toContainText('전체를 쟀어요');
  await expect(page.locator('[data-vp-take="a"] [data-vp-player]')).toHaveCount(1);
  await expect(page.locator('[data-vp-take="b"] [data-vp-pending]')).toHaveText('재는 중이에요. 끝나는 대로 여기에 보여 드려요.');
  await expect(page.locator('[data-vp-progress="b"] [data-vp-stage]')).toHaveText('소리 읽는 중');
  await expect(page.locator('[data-vp-progress="a"]')).toHaveCount(0);
  await expect(page.locator('[data-vp-cancel]')).toBeVisible();
  // The measured take's own values, with nothing said about the other side yet.
  await expect(page.locator('[data-vp-row]')).toHaveCount(10);
  await expect(row(page, 'breaks')).toHaveAttribute('data-state', 'alone');
  await expect(row(page, 'breaks').locator('.vp-mark')).toHaveText('재는 중');
  await expect(row(page, 'breaks').locator('.vp-vals dd').first()).toContainText('(3곳)');
  await expect(row(page, 'breaks').locator('.vp-vals dd').last()).toHaveText('재는 중…');
  await expect(row(page, 'breaks').locator('[data-vp-line]')).toHaveText('다른 녹음을 다 재면 나란히 보여 드려요');
  await expect(row(page, 'breaks').locator('[data-vp-play="a"]')).toHaveCount(3);     // already there to listen to
  expect(await page.locator('[data-vp-results]').innerText()).not.toMatch(DIRECTION);
  await expect(page.locator('[data-vp-diagnosis]')).toHaveCount(0);
  await page.evaluate(() => window.__release());
  await done(page);
  await expect(row(page, 'breaks').locator('[data-vp-line]')).toHaveText('끊김이 줄었어요');
  expect(page.__errors).toEqual([]);
});

test('tapping a break plays that moment of that take', async ({page, browserName}) => {
  test.skip(browserName === 'webkit', 'real audio playback and seeking are checked in Chromium');
  await boot(page);
  await open(page);
  await measure(page);
  const chips = row(page, 'breaks').locator('[data-vp-play="a"]');
  await expect(chips).toHaveCount(3);
  await expect(row(page, 'breaks').locator('[data-vp-play="b"]')).toHaveCount(0);
  const chip = chips.nth(1), t = Number(await chip.getAttribute('data-t'));
  expect(t).toBeGreaterThan(12); expect(t).toBeLessThan(13.5);                    // the second dropout, at about 12.7 s
  await expect(chip).toHaveAccessibleName(/기준 녹음 0:1[23] 끊김 부분 듣기/);
  await chip.click();
  const player = page.locator('[data-vp-player="a"]');
  await expect.poll(() => player.evaluate(el => !el._player.el.paused)).toBe(true);
  const at = await player.evaluate(el => el._player.el.currentTime);
  expect(at).toBeGreaterThanOrEqual(t - 1.05); expect(at).toBeLessThan(t + 1.5);   // from one second before it
  await expect(page.locator('[data-vp-playing="a"]')).toContainText('부터 들려 드려요');
  await expect(chip).toHaveAttribute('aria-current', 'true');
  // The other take's player stays quiet.
  expect(await page.locator('[data-vp-player="b"]').evaluate(el => el._player.el.paused)).toBe(true);
  await player.evaluate(el => el._player.pause());
  expect(page.__errors).toEqual([]);
});

test('기준 녹음 is stored on the song record and is the default 기준 after a reload', async ({page}) => {
  await boot(page);
  await open(page);
  await page.locator('[data-vp-pick="a"]').selectOption('m-mid');
  const mark = page.locator('[data-vp-base="a"]');
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  await mark.click();
  await expect(page.locator('[data-vp-base="a"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-vp-base="a"]')).toHaveText('이 곡의 기준 녹음이에요');
  const song = (await data(page)).songs.find(s => s.id === 's1');
  expect(song.voicePathBaseIds).toEqual(['m-mid']);
  expect(song.updatedAt).toBeGreaterThan(0);                                       // stamped like any other song edit, so it syncs
  expect((await data(page)).songs.find(s => s.id === 's2').voicePathBaseIds).toBeUndefined();
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await expect(page.locator('[data-vp-pick="a"]')).toHaveValue('m-mid');
  await expect(page.locator('[data-vp-default]')).toHaveText('기준 녹음으로 표시한 녹음을 기준으로 골랐어요.');
  await expect(page.locator('[data-vp-pick="a"] option[value="m-mid"]')).toContainText('기준 녹음');
  // Taking the mark off removes the field again.
  await page.locator('[data-vp-base="a"]').click();
  expect((await data(page)).songs.find(s => s.id === 's1').voicePathBaseIds).toBeUndefined();
  expect(page.__errors).toEqual([]);
});

test('a measured take is kept on this device: opening again does not read the file again, 다시 재기 does', async ({page}) => {
  await boot(page);
  await open(page);
  const before = await page.evaluate(() => window.__decodes);
  await measure(page);
  expect(await page.evaluate(() => window.__decodes) - before).toBe(2);
  await expect.poll(async () => (await kept(page)).map(r => r.id).sort()).toEqual(['m-new', 'm-old']);
  expect((await kept(page)).every(r => r.model === 'vp-0.2' && r.mrSig === '')).toBe(true);
  expect(JSON.stringify(await data(page))).not.toContain('vp-0.2');                 // not in the synced records
  // A new session: the result is there at once, nothing is decoded.
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await done(page);
  expect(await page.evaluate(() => window.__decodes)).toBe(0);
  await expect(page.locator('[data-vp-kept]')).toHaveCount(2);
  await expect(page.locator('[data-vp-run]')).toHaveText('다시 재기');
  await expect(page.locator('[data-vp-status]')).toHaveText('이 기기에 남겨 둔 결과예요. 다시 재기를 누르면 처음부터 새로 재요.');
  await expect(row(page, 'breaks').locator('[data-vp-line]')).toHaveText('끊김이 줄었어요');
  // Another take against the same 기준: only the new one is read.
  await page.locator('[data-vp-pick="b"]').selectOption('m-raw');
  await expect(page.locator('[data-vp-results][data-vp-complete="false"]')).toBeVisible();
  await expect(page.locator('[data-vp-take="b"] [data-vp-pending]')).toHaveText('아직 재지 않았어요.');
  await expect(page.locator('[data-vp-run]')).toHaveText('흔적 재기');
  await measure(page);
  expect(await page.evaluate(() => window.__decodes)).toBe(1);
  // Back to the first pair: at once again. 다시 재기 reads both files afresh.
  await page.locator('[data-vp-pick="b"]').selectOption('m-new');
  await done(page);
  expect(await page.evaluate(() => window.__decodes)).toBe(1);
  const at = Object.fromEntries((await kept(page)).map(r => [r.id, r.at]));
  await page.locator('[data-vp-run]').click();
  await expect(page.locator('[data-vp-status]')).toHaveText('다 쟀어요.', {timeout:60000});
  expect(await page.evaluate(() => window.__decodes)).toBe(3);
  await expect.poll(async () => { const now = Object.fromEntries((await kept(page)).map(r => [r.id, r.at])); return now['m-old'] > at['m-old'] && now['m-new'] > at['m-new']; }).toBe(true);
  expect(page.__errors).toEqual([]);
});

test('the device store drops results of another model version and keeps at most 60 takes', async ({page}) => {
  await boot(page);
  await open(page);
  await measure(page);
  await expect.poll(async () => (await kept(page)).length).toBe(2);
  // A result written by an older model is not shown and is removed.
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).map(d => d.name).find(n => n.startsWith('vocalzip_voice_path_v1'));
    await new Promise(resolve => { const o = indexedDB.open(name); o.onsuccess = () => { const tx = o.result.transaction('takes', 'readwrite'), s = tx.objectStore('takes'), q = s.get('m-old'); q.onsuccess = () => s.put({...q.result, model:'vp-0.1'}); tx.oncomplete = () => { o.result.close(); resolve(); }; }; });
  });
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await expect(page.locator('[data-vp-results][data-vp-complete="false"]')).toBeVisible();
  await expect(page.locator('[data-vp-take="a"] [data-vp-pending]')).toHaveText('아직 재지 않았어요.');
  await expect(page.locator('[data-vp-run]')).toHaveText('흔적 재기');
  expect((await kept(page)).map(r => r.id)).toEqual(['m-new']);
  // The cap: the oldest go first.
  const ids = await page.evaluate(async () => { for (let i = 0; i < 65; i++) await VZ.voicePathCache.put({id:'old-' + String(i).padStart(2, '0'), model:'vp-0.2', at:1000 + i, mrSig:'', mixed:{}, removed:null, tries:[], stages:{}}); return (await VZ.voicePathCache.ids()).sort(); });
  expect(ids).toHaveLength(60);
  expect(await page.evaluate(() => VZ.voicePathCache.CAP)).toBe(60);
  expect(ids).toContain('m-new');                                                   // the newest
  expect(ids).not.toContain('old-05'); expect(ids).toContain('old-06'); expect(ids).toContain('old-64');
  expect(page.__errors).toEqual([]);
});

test('a take with an accompaniment shows only the pitch-based rows until it is ticked as voice only', async ({page}) => {
  await boot(page);
  await open(page, '?a=m-old&b=m-mid');
  await expect(page.locator('[data-vp-clean="a"]')).toBeChecked();                 // stored analysis: no accompaniment heard
  await expect(page.locator('[data-vp-clean="b"]')).not.toBeChecked();             // stored analysis: an accompaniment was heard
  await expect(page.locator('[data-vp-slot="b"] [data-vp-why]')).toContainText('반주가 섞여 있어 울림·숨소리는 잴 수 없어요');
  await measure(page);
  // In this reading the voice is clearly on top, so the take is measured — the pitch-based rows only.
  await expect(page.locator('[data-vp-take="b"]')).toHaveAttribute('data-vp-source', 'mixed');
  await expect(page.locator('[data-vp-take="b"] [data-vp-unclean]')).toContainText('반주가 섞여 있어 울림·숨소리는 잴 수 없어요');
  await expect(page.locator('[data-vp-refused]')).toHaveCount(0);
  for (const id of ['zoneSpread', 'brightness', 'breath', 'onsets']) {
    await expect(row(page, id).locator('.vp-mark')).toHaveText('잴 수 없음');
    await expect(row(page, id).locator('[data-vp-line]')).toHaveText('반주가 섞여 있어 울림·숨소리는 잴 수 없어요');
  }
  await expect(row(page, 'breaks').locator('.vp-mark')).toHaveText('다름');        // pitch-based rows are still there
  // The person says this take is voice only: shown without measuring again, and remembered on this device.
  const decodes = await page.evaluate(() => window.__decodes);
  await page.locator('[data-vp-clean="b"]').check();
  await expect(page.locator('[data-vp-take="b"]')).toHaveAttribute('data-vp-source', 'clean');
  await expect(page.locator('[data-vp-unclean]')).toHaveCount(0);
  await expect(row(page, 'breath').locator('.vp-mark')).not.toHaveText('잴 수 없음');
  expect(await page.evaluate(() => window.__decodes)).toBe(decodes);
  await expect(page.locator('[data-vp-slot="b"] [data-vp-why]')).toHaveText('목소리만 들어 있다고 직접 표시했어요');
  expect(await page.evaluate(() => JSON.parse((window.VzipAccountScope?.storage || localStorage).getItem('vzip_voice_path_clean_v1')))).toEqual({'m-mid':true});
  expect(JSON.stringify(await data(page))).not.toContain('vzip_voice_path_clean');  // not in the synced records
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await expect(page.locator('[data-vp-clean="b"]')).toBeChecked();
  // And the other way: a take the analysis called clean can be marked as having an accompaniment.
  await page.locator('[data-vp-clean="a"]').uncheck();
  await expect(page.locator('[data-vp-slot="a"] [data-vp-why]')).toContainText('반주가 있다고 직접 표시했어요');
  expect(page.__errors).toEqual([]);
});

test('a take where the accompaniment is as loud as the voice is refused: no numbers for it, no comparison, no direction words', async ({page}) => {
  // m-loud: the voice over a louder bass line. Its stored analysis was measured on a voice the server separated.
  await boot(page, {takes:[TAKES[0], {id:'m-loud', name:'MR 크게 들어간 녹음', kind:'bass', date:'2026-11-10', analysis:stored({voiceOverMrDb:28.4, pitchConfidence:0.919, aiSeparated:{model:'x'}})}]});
  await open(page);
  await expect(page.locator('[data-vp-pick="b"]')).toHaveValue('m-loud');
  await expect(page.locator('[data-vp-slot="b"] [data-vp-why]')).toContainText('저장된 분석은 AI로 목소리를 나눠 쟀지만, 녹음 파일에는 반주가 그대로 있어요');
  await measure(page);
  const take = page.locator('[data-vp-take="b"]');
  await expect(take.locator('[data-vp-refused]')).toHaveText(REFUSED);
  await expect(take.locator('[data-vp-stored-note]')).toHaveText('이 녹음에 저장된 분석 수치는 서버에서 AI로 목소리만 분리해 잰 값이에요. 이 화면은 반주가 섞인 원본 파일을 그대로 읽어요.');
  await expect(take.locator('.vp-meta')).not.toContainText('목소리');               // no number for it, not even the seconds of voice
  // The other take keeps its own values; nothing is compared.
  await expect(page.locator('[data-vp-row]')).toHaveCount(10);
  for (const r of await page.locator('[data-vp-row]').all()) {
    await expect(r).toHaveAttribute('data-state', 'alone');
    await expect(r.locator('.vp-mark')).toHaveText('잴 수 없음');
    await expect(r.locator('.vp-vals dd').last()).toHaveText('잴 수 없어요');
    await expect(r.locator('[data-vp-line]')).toHaveText('한쪽 녹음을 잴 수 없어 나란히 보지 않아요');
  }
  await expect(row(page, 'breaks').locator('.vp-vals dd').first()).toContainText('(3곳)');
  await expect(page.locator('[data-vp-play="b"]')).toHaveCount(0);
  expect(await page.locator('[data-vp]').innerText()).not.toMatch(DIRECTION);
  await page.locator('[data-vp-zone-card] summary').click();
  await expect(page.locator('[data-vp-zones]')).toHaveCount(1);
  // The file still holds the refused take's numbers (to set the gate), and says that nothing was compared.
  const d = await page.evaluate(() => VZ.voicePathDiagnosis());
  expect(d.comparison).toBeNull();
  expect(d.takes[1]).toMatchObject({source:'mixed', clean:false, cleanWhy:'ai-separated-numbers-only', measurable:false});
  expect(['weak-pitch', 'pitch-jumps', 'many-glitches', 'follows-accompaniment', 'instrument-like']).toContain(d.takes[1].measurableWhy);
  expect(d.takes[1].confidence.meanStrength).toEqual(expect.any(Number));
  expect(d.takes[1].storedAnalysis).toMatchObject({aiSeparated:true, pitchConfidence:0.919});
  // Ticking it as voice only is the person's call: then it is read like any clean take.
  await page.locator('[data-vp-clean="b"]').check();
  await expect(page.locator('[data-vp-refused]')).toHaveCount(0);
  expect(page.__errors).toEqual([]);
});

/* ---------- the song's own MR taken out ---------- */
/** Two takes of a melody sung over the song's MR (8 kHz WAVs from tests/helpers/mr-synth.cjs), and the MR files. */
async function bootMr(page, {third = false} = {}) {
  await boot(page, {takes:[]});
  await page.evaluate(MR_SYNTH);
  await page.evaluate(async ([stored, third]) => {
    const Y = window.mrSynth, wav = x => window.vpTake.wav(x, Y.SR), MR = Y.mr(70), other = Y.mr(70, 99), voice = Y.vocal(40).x;
    window.__mr = {'mr/own':URL.createObjectURL(new Blob([wav(MR)], {type:'audio/wav'})), 'mr/other':URL.createObjectURL(new Blob([wav(other)], {type:'audio/wav'}))};
    const takes = [['m-a', '작년 MR 녹음', '2025-08-14', 12.345, 6], ['m-b', '올해 MR 녹음', '2026-11-09', 3.2, 3], ...(third ? [['m-c', '이번 주 MR 녹음', '2026-11-12', 5.5, 3]] : [])];
    for (const [id, name, date, offset, db] of takes) await window.vzipStorePracticeMedia({id, name, created:new Date(date + 'T10:00:00').getTime(), type:'audio/wav', source:'practice', songId:'s1', song:'지금 이 순간',
      blob:new Blob([wav(Y.record(voice, MR, {offset, db}).x)], {type:'audio/wav'}), durationSeconds:40});
    window.dispatchEvent(new Event('vzip:media-updated'));
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x[0] === m.id); if (t) await VZ.media.update(m, {recordedDate:t[2], analysis:stored}, {quiet:true}); }
    for (const m of await VZ.media.list(true)) { const t = takes.find(x => x[0] === m.id); if (t) await VZ.media.update(m, {name:t[1]}, {quiet:true}); }
    await VZ.media.list(true);
    VZ.change(d => { d.songs.find(s => s.id === 's1').mrTracks = [{id:'t-own', kind:'file', title:'내 MR SECRETMR', fileName:'secret.wav', type:'audio/wav', r2Key:'mr/own', size:1111, created:1}]; }, {silent:true});
    // The song's MR files are read through the R2 helper, as the app's analysis does.
    window.VzipR2.enabled = () => true; window.VzipR2.url = async key => window.__mr[key];
  }, [stored({voiceOverMrDb:2, pitchConfidence:0.6}), third]);
}
/** The song gets a second MR file, of another arrangement (not in the takes), listed first. */
const addOtherMr = page => page.evaluate(() => VZ.change(d => { d.songs.find(s => s.id === 's1').mrTracks.unshift({id:'t-other', kind:'file', title:'다른 편곡 MR', r2Key:'mr/other', size:3333, created:2}); }, {silent:true}));
const mrChoices = page => page.evaluate(() => JSON.parse((window.VzipAccountScope?.storage || localStorage).getItem('vzip_voice_path_mr_v1') || 'null'));
test('MR loading retries an expired URL once and then measures both original takes without changing saved analysis',async({page})=>{
 await page.route('**/__expired-mr*',r=>r.fulfill({status:403,body:'expired'}));
 await bootMr(page);
 await page.evaluate(()=>{
  const url=VzipR2.url;window.__mrRequests=[];
  VzipR2.url=async(key,options)=>{window.__mrRequests.push({attempt:window.__mrRequests.length+1,refresh:!!options?.refresh});return window.__mrRequests.length===1?'/__expired-mr?cap=SECRET':url(key);};
 });
 await open(page);await measure(page);
 const d=await page.evaluate(()=>VZ.voicePathDiagnosis());
 expect(d.takes.map(t=>t.source)).toEqual(['mr-removed','mr-removed']);
 expect(d.fileLoads).toEqual(expect.arrayContaining([expect.objectContaining({kind:'mr',code:'http',status:403,attempt:1}),expect.objectContaining({kind:'mr',code:'recovered',attempt:2})]));
 expect(await page.evaluate(()=>window.__mrRequests)).toEqual([{attempt:1,refresh:false},{attempt:2,refresh:true}]);
 expect(JSON.stringify(d)).not.toContain('SECRET');
 expect(await page.evaluate(async()=> (await VZ.media.list()).map(m=>m.analysis.at))).toEqual([1763000000000,1763000000000]);
});

test('a missing MR is reported as a file-load failure with safe HTTP details, without a key/speed explanation',async({page})=>{
 await page.route('**/__missing-mr*',r=>r.fulfill({status:404,body:'missing SECRET'}));
 await bootMr(page);await page.evaluate(()=>{VzipR2.url=async()=>'/__missing-mr?cap=SECRET';});
 await open(page);await measure(page);
 await expect(page.locator('[data-vp-mr-failed]').first()).toContainText('파일 연결을 확인한 뒤 다시 재기를');
 await expect(page.locator('[data-vp-mr-failed]').first()).not.toContainText('키나 빠르기');
 const d=await page.evaluate(()=>VZ.voicePathDiagnosis());
 expect(d.takes[0].mrTries[0]).toMatchObject({reason:'load',loadFailure:{code:'http',stage:'headers',status:404,attempt:1}});
 expect(JSON.stringify(d)).not.toContain('SECRET');
});

test('a stalled recording URL stops waiting, exports the failure, and retry preserves the already measured take',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{
  const read=VzipAudioFile.read;VzipAudioFile.read=o=>read({...o,policy:{resolveMs:300,idleMs:300,totalMs:3000,attempts:2}});
  const src=VZ.media.src,now=VZ.media.srcNow;
  VZ.media.srcNow=m=>m.id==='m-new'?null:now(m);
  VZ.media.src=m=>m.id==='m-new'?new Promise(()=>{}):src(m);
  window.__restoreSource=()=>{VZ.media.src=src;VZ.media.srcNow=now;};
 });
 await open(page);await page.locator('[data-vp-run]').click();
 await expect(page.locator('[data-vp-status]')).toContainText('파일 주소를 받지 못했어요');
 expect(await page.locator('.vp-mark').allTextContents()).not.toContain('재는 중');
 const errorBox=await page.locator('[data-vp-status]').boundingBox(),retryBox=await page.locator('[data-vp-run]').boundingBox();
 expect(errorBox.y+errorBox.height).toBeLessThanOrEqual(retryBox.y);
 await expect(page.locator('[data-vp-take="a"] .vp-meta')).toContainText('전체를 쟀어요');
 await expect(page.locator('[data-vp-diagnosis]')).toBeVisible();
 const d=await page.evaluate(()=>VZ.voicePathDiagnosis());
 expect(d.fileLoads).toEqual([expect.objectContaining({role:'comp',kind:'recording',code:'resolve-timeout',attempt:1}),expect.objectContaining({role:'comp',kind:'recording',code:'resolve-timeout',attempt:2})]);
 expect(d.takes).toHaveLength(1);expect(d.comparison).toBeNull();
 if(process.env.VZ_FAILURE_SHOTS){
  const dir=process.env.VZ_FAILURE_SHOTS;require('node:fs').mkdirSync(dir,{recursive:true});
  for(const [width,height]of [[375,812],[320,640]]){
   await page.setViewportSize({width,height});await noOverflow(page);
   await page.screenshot({path:dir+'/load-failure-'+width+'.png',fullPage:true});
  }
 }
 const decodes=await page.evaluate(()=>window.__decodes);
 await page.evaluate(()=>window.__restoreSource());await measure(page);
 expect(await page.evaluate(()=>window.__decodes)).toBe(decodes+1);
 expect(page.__errors).toEqual([]);
});

test('stopping during a non-responsive MR URL lookup returns immediately without saving a new reading',async({page})=>{
 await bootMr(page);await page.evaluate(()=>{VzipR2.url=()=>new Promise(()=>{});});
 await open(page);await page.locator('[data-vp-run]').click();
 await expect(page.locator('[data-vp-stage]').first()).toHaveText('곡 MR 불러오는 중');
 await page.locator('[data-vp-cancel]').click();
 await expect(page.locator('[data-vp-status]')).toContainText('그만뒀어요',{timeout:2000});
 expect(await kept(page)).toEqual([]);expect(page.__errors).toEqual([]);
});

test('a song with an MR file: the MR is taken out of each take and all traces of the voice are shown', async ({page}) => {
  test.setTimeout(90000);
  await bootMr(page);
  await open(page);
  // Each take has its own choice (one MR file: 자동, that file, 빼지 않기); there is no shared one.
  for (const role of ['a', 'b']) {
    await expect(page.locator('[data-vp-slot="' + role + '"] [data-vp-mr="' + role + '"]')).toContainText('이 녹음에서 뺄 MR');
    await expect(page.locator('[data-vp-mr-pick="' + role + '"]')).toHaveValue('auto');
    await expect(page.locator('[data-vp-mr-pick="' + role + '"] option')).toHaveText(['자동 · 가장 많이 빠지는 MR', '내 MR SECRETMR', '빼지 않기']);
  }
  await expect(page.locator('[data-vp-mr-pick]')).toHaveCount(2);
  await expect(page.locator('[data-vp-picker] > [data-vp-mr]')).toHaveCount(0);
  await measure(page);
  const stages = await page.evaluate(() => window.__stages);
  for (const name of ['곡 MR 불러오는 중', '곡 MR 빼는 중', '목소리 재는 중']) expect(stages.some(t => t.startsWith('a:' + name)), name + ' in ' + stages.join(' | ')).toBe(true);
  expect(stages.some(t => /^a:곡 MR 빼는 중 [1-9]\d?%$/.test(t))).toBe(true);
  for (const role of ['a', 'b']) {
    const take = page.locator('[data-vp-take="' + role + '"]');
    await expect(take).toHaveAttribute('data-vp-source', 'mr-removed');
    await expect(take.locator('[data-vp-mr-note]')).toHaveText(/^깨끗함: 곡 MR을 빼고 잰 소리 · 곡 MR\(내 MR SECRETMR\)을 \d+(\.\d)? dB 빼고 쟀어요\. 반주가 조금 남아 있을 수 있어요\.$/);
  }
  await expect(page.locator('[data-vp-refused], [data-vp-unclean], [data-vp-mr-failed]')).toHaveCount(0);
  // Every trace applies (울림 · 숨소리 · 시작 too), although the stored analyses say an accompaniment was heard.
  await expect(page.locator('[data-vp-clean="a"]')).not.toBeChecked();
  for (const mark of await page.locator('.vp-row .vp-mark').allTextContents()) expect(['비슷함', '다름', '표본 부족']).toContain(mark);
  await expect(row(page, 'brightness').locator('.vp-vals dd').first()).toContainText('dB');
  await expect(row(page, 'breath').locator('.vp-vals dd').first()).toContainText('배음 대 잡음');
  // The MR file was read once for both takes; the device store remembers which MR each take was measured against.
  expect(await page.evaluate(() => window.__decodes)).toBe(3);
  await expect.poll(async () => (await kept(page)).map(r => r.mrSig)).toEqual(['t-own:mr/own:1111', 't-own:mr/own:1111']);
  // The file: how each take was read, the removal's numbers — and no MR id, title or file name.
  const d = await page.evaluate(() => VZ.voicePathDiagnosis()), text = JSON.stringify(d);
  expect(d.takes.map(t => t.source)).toEqual(['mr-removed', 'mr-removed']);
  expect(d.takes.map(t => t.mrMode)).toEqual(['auto', 'auto']);
  expect(d.takes[0].mrRemoval).toMatchObject({removedDb:expect.any(Number), offsetSeconds:expect.any(Number), speed:expect.any(Number)});
  expect(Math.abs(d.takes[0].mrRemoval.offsetSeconds - 12.345)).toBeLessThan(0.01);
  expect(d.takes[0].mrTries).toEqual([{ok:true, reason:null, removedDb:d.takes[0].mrRemoval.removedDb}]);
  expect(d.takes[0].asRecorded.confidence.meanStrength).toEqual(expect.any(Number));
  expect(d.takes[0].stagesMs).toMatchObject({fetch:expect.any(Number), decode:expect.any(Number), mrLoad:expect.any(Number), resample:expect.any(Number), model:expect.any(Number), cancel:expect.any(Number), voice:expect.any(Number), total:expect.any(Number)});
  expect(d.takes[0].confidence.bandwidthHz).toBe(3600);
  expect(d.comparison).toHaveLength(10);
  for (const hidden of ['t-own', 'mr/own', 'SECRETMR', 'secret.wav', 'm-a', 'MR 녹음']) expect(text).not.toContain(hidden);
  console.log('voice-path stages for a 40 s take over a 70 s MR (ms, unthrottled): ' + JSON.stringify(d.takes.map(t => t.stagesMs)));
  // A new session: shown at once. The MR file replaced (another size): measured again.
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await page.evaluate(() => { window.VzipR2.enabled = () => true; window.VzipR2.url = async key => window.__mr[key]; });
  await page.evaluate(() => VZ.render());
  await done(page);
  expect(await page.evaluate(() => window.__decodes)).toBe(0);
  await page.evaluate(() => { VZ.change(d => { d.songs.find(s => s.id === 's1').mrTracks[0].size = 2222; }, {silent:true}); VZ.render(); });
  await expect(page.locator('[data-vp-run]')).toHaveText('흔적 재기');
  await expect(page.locator('[data-vp-results]')).toHaveCount(0);
  expect(page.__errors).toEqual([]);
});

test('each take has its own MR: changing 비교\'s MR measures only 비교 again; a take that does not match is said so', async ({page}) => {
  test.setTimeout(90000);
  await bootMr(page);
  await addOtherMr(page);
  await open(page);
  // Two MR files: by default both are tried for each take and the one that removes the most is used.
  for (const role of ['a', 'b']) await expect(page.locator('[data-vp-mr-pick="' + role + '"] option')).toHaveText(['자동 · 가장 많이 빠지는 MR', '다른 편곡 MR', '내 MR SECRETMR', '빼지 않기']);
  await expect(page.locator('[data-vp-mr-help]')).toHaveCount(1);
  await measure(page);
  for (const role of ['a', 'b']) await expect(page.locator('[data-vp-take="' + role + '"] [data-vp-mr-note]')).toContainText('곡 MR(내 MR SECRETMR)을');
  await expect(page.locator('[data-vp-take="a"] [data-vp-mr-note]')).toContainText('자동으로 가장 많이 빠지는 MR을 골랐어요.');   // 자동 names the one that won
  await expect.poll(async () => (await kept(page)).length).toBe(2);
  const atA = (await kept(page)).find(r => r.id === 'm-a').at;
  // 비교 only: the MR that is not in it. 기준 keeps its result and is not read again.
  await page.evaluate(() => { window.__decodes = 0; window.__stages = []; });
  await page.locator('[data-vp-mr-pick="b"]').selectOption('t-other');
  await expect(page.locator('[data-vp-mr-pick="a"]')).toHaveValue('auto');
  await expect(page.locator('[data-vp-take="a"]')).toHaveAttribute('data-vp-source', 'mr-removed');
  await expect(page.locator('[data-vp-take="b"] [data-vp-pending]')).toHaveText('아직 재지 않았어요.');
  await expect(page.locator('[data-vp-run]')).toHaveText('흔적 재기');
  await measure(page);
  expect(await page.evaluate(() => window.__decodes)).toBe(1);                       // 비교 only (the MR file was already read)
  const stages = await page.evaluate(() => window.__stages);
  expect(stages.some(t => t.startsWith('a:')), stages.join(' | ')).toBe(false);
  expect(stages.some(t => t.startsWith('b:')), stages.join(' | ')).toBe(true);
  expect((await kept(page)).find(r => r.id === 'm-a').at).toBe(atA);
  await expect(page.locator('[data-vp-take="a"]')).toHaveAttribute('data-vp-source', 'mr-removed');
  const take = page.locator('[data-vp-take="b"]');
  await expect(take).toHaveAttribute('data-vp-source', 'mixed');
  // The reason, the usual cause, and the gate (refused).
  await expect(take.locator('[data-vp-mr-failed]')).toHaveText('곡 MR을 빼지 못했어요: MR과 맞지 않아요. 녹음할 때 MR의 키나 빠르기가 달랐다면 보통 이렇게 돼요. 녹음 파일을 그대로 읽었어요.');
  await expect(take.locator('[data-vp-refused]')).toHaveText(REFUSED);
  expect(await page.locator('[data-vp]').innerText()).not.toMatch(DIRECTION);
  let d = await page.evaluate(() => VZ.voicePathDiagnosis()), text = JSON.stringify(d);
  expect(d.takes.map(t => t.mrMode)).toEqual(['auto', 'chosen']);
  expect(d.takes[1]).toMatchObject({source:'mixed', measurable:false, mrRemoval:null});
  expect(d.takes[1].mrTries).toEqual([{ok:false, reason:'no-match', removedDb:expect.anything()}]);
  expect(d.comparison).toBeNull();
  for (const hidden of ['t-other', 'mr/other', '다른 편곡', 't-own', 'SECRETMR']) expect(text).not.toContain(hidden);
  // 빼지 않기 for 비교: the file as recorded, said so, the same gate; 기준 still not read again.
  await page.locator('[data-vp-mr-pick="b"]').selectOption('none');
  await measure(page);
  expect(await page.evaluate(() => window.__decodes)).toBe(2);
  await expect(take.locator('[data-vp-mr-none]')).toHaveText('MR을 빼지 않고 쟀어요.');
  await expect(take.locator('[data-vp-mr-failed], [data-vp-mr-note]')).toHaveCount(0);
  await expect(take.locator('[data-vp-refused]')).toHaveCount(1);
  await expect(page.locator('[data-vp-take="a"] [data-vp-mr-note]')).toHaveCount(1);
  await expect(page.locator('[data-vp-take="a"] [data-vp-mr-none]')).toHaveCount(0);
  d = await page.evaluate(() => VZ.voicePathDiagnosis());
  expect(d.takes.map(t => t.mrMode)).toEqual(['auto', 'none']);
  expect(d.takes[1].mrTries).toEqual([]);
  expect(page.__errors).toEqual([]);
});

test('a take\'s MR is remembered on this device: after a reload, paired with another take, and back to 자동 when its file is gone', async ({page}) => {
  await bootMr(page, {third:true});
  await addOtherMr(page);
  await open(page, '?a=m-a&b=m-b');
  await page.locator('[data-vp-mr-pick="b"]').selectOption('t-other');
  await page.locator('[data-vp-mr-pick="a"]').selectOption('none');
  expect(await mrChoices(page)).toEqual({'m-b':'t-other', 'm-a':'none'});
  expect(JSON.stringify(await data(page))).not.toContain('vzip_voice_path_mr');      // not in the synced records
  // 자동 is no entry.
  await page.locator('[data-vp-mr-pick="a"]').selectOption('auto');
  expect(await mrChoices(page)).toEqual({'m-b':'t-other'});
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await page.evaluate(() => { window.VzipR2.enabled = () => true; window.VzipR2.url = async key => window.__mr[key]; VZ.render(); });
  await expect(page.locator('[data-vp-mr-pick="b"]')).toHaveValue('t-other');
  await expect(page.locator('[data-vp-mr-pick="a"]')).toHaveValue('auto');
  // m-b as 기준 next to another take: it keeps its MR; the new 비교 has its own (자동).
  await page.locator('[data-vp-pick="b"]').selectOption('m-c');
  await page.locator('[data-vp-pick="a"]').selectOption('m-b');
  await expect(page.locator('[data-vp-mr-pick="a"]')).toHaveValue('t-other');
  await expect(page.locator('[data-vp-mr-pick="b"]')).toHaveValue('auto');
  await expect(page.locator('[data-vp-mr-gone]')).toHaveCount(0);
  // The chosen file is taken off the song: 자동 again, said once in that slot, and forgotten.
  await page.evaluate(() => VZ.change(d => { const s = d.songs.find(x => x.id === 's1'); s.mrTracks = s.mrTracks.filter(t => t.id !== 't-other'); }, {silent:true}));
  await open(page, '?a=m-b&b=m-c');
  await expect(page.locator('[data-vp-pick="a"]')).toHaveValue('m-b');
  await expect(page.locator('[data-vp-mr-pick="a"]')).toHaveValue('auto');
  await expect(page.locator('[data-vp-mr-pick="a"] option')).toHaveText(['자동 · 가장 많이 빠지는 MR', '내 MR SECRETMR', '빼지 않기']);
  await expect(page.locator('[data-vp-slot="a"] [data-vp-mr-gone]')).toHaveText('이 녹음에 골라 둔 MR 파일이 곡에 없어서 자동으로 바꿨어요.');
  await expect(page.locator('[data-vp-slot="b"] [data-vp-mr-gone]')).toHaveCount(0);
  expect(await mrChoices(page)).toEqual({});
  await page.reload();
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await page.evaluate(() => { window.VzipR2.enabled = () => true; window.VzipR2.url = async key => window.__mr[key]; VZ.render(); });
  await expect(page.locator('[data-vp-mr-pick="a"]')).toHaveCount(1);
  await expect(page.locator('[data-vp-mr-gone]')).toHaveCount(0);
  // A song without MR files: no choice at all, the explanation as before.
  await page.evaluate(() => { VZ.change(d => { delete d.songs.find(x => x.id === 's1').mrTracks; }, {silent:true}); VZ.render(); });
  await expect(page.locator('[data-vp-picker]')).toBeVisible();
  await expect(page.locator('[data-vp-mr-pick], [data-vp-mr], [data-vp-mr-help]')).toHaveCount(0);
  expect(page.__errors).toEqual([]);
});

test('a long take is measured to its end, in pieces, with progress by the seconds measured; stopping ends the worker', async ({page}) => {
  test.setTimeout(120000);
  // 8 minutes 5 seconds at 8 kHz (a small file): the worse take has a dropout every 10.8 s up to its last phrase.
  await boot(page, {takes:[{...TAKES[0], seconds:485}, {...TAKES[2], seconds:485}], rate:8000});
  await open(page);
  await measure(page);
  await expect(page.locator('[data-vp-take="a"] .vp-meta')).toContainText('녹음 8:05 전체를 쟀어요');
  const d = await page.evaluate(() => VZ.voicePathDiagnosis());
  for (const t of d.takes) expect(Math.abs(t.durationSeconds - 485)).toBeLessThan(0.2);
  const breaks = d.takes[0].transitions.breaks;
  expect(breaks.length).toBe(45);                                                    // every third phrase of 134
  expect(breaks.at(-1).t).toBeGreaterThan(470);                                      // the last one, 10 seconds before the end
  expect(d.takes[0].voicedSeconds).toBeGreaterThan(380);
  expect(d.takes[1].transitions.breakCount).toBe(0);
  const seen = (await page.evaluate(() => window.__stages)).filter(t => /^a:재는 중 \d+% · \d:\d\d \/ 8:05$/.test(t));
  expect(seen.length).toBeGreaterThanOrEqual(10);                                    // a step for every 30 s measured
  // 다시 재기, stopped in the middle of measuring: the worker is ended and nothing new is kept.
  await expect.poll(async () => (await kept(page)).length).toBe(2);
  const workers = await page.evaluate(() => window.__workers.made), at = (await kept(page)).map(r => r.at).sort();
  await page.locator('[data-vp-run]').click();
  await expect(page.locator('[data-vp-progress="a"] [data-vp-stage]')).toHaveText(/재는 중 [1-9]\d?%/);
  await page.locator('[data-vp-cancel]').click();
  await expect(page.locator('[data-vp-status]')).toHaveText('그만뒀어요. 다시 재려면 흔적 재기를 눌러 주세요.');
  expect(await page.evaluate(() => window.__workers)).toEqual({made:workers + 1, ended:workers + 1});
  await done(page);                                                                  // the earlier results are still there
  expect((await kept(page)).map(r => r.at).sort()).toEqual(at);
  expect(page.__errors).toEqual([]);
});

test('진단 파일: numbers and months only, nothing that names the recordings', async ({page}) => {
  await boot(page);
  await open(page, '?a=m-old&b=m-mid');
  await measure(page);
  await page.evaluate(() => { navigator.canShare = undefined; });                  // the download path (the share sheet has no test surface)
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-vp-diagnosis]').click()]);
  expect(download.suggestedFilename()).toBe('vocalzip-voice-path-diagnosis.json');
  const text = require('node:fs').readFileSync(await download.path(), 'utf8'), d = JSON.parse(text);
  expect(d.kind).toBe('vocalzip-voice-path-diagnosis');
  expect(d.takes.map(t => [t.role, t.month])).toEqual([['base', '2025-08'], ['comp', '2026-03']]);
  for (const hidden of ['m-old', 'm-mid', 's1', 'SECRETNAME', '작년 8월', 'MR 연습', '지금 이 순간', '지킬', '2025-08-14', '2026-03-02', '.wav', 'blob:']) expect(text).not.toContain(hidden);
  const keys = new Set(); JSON.stringify(d, (k, v) => { keys.add(k); return v; });
  for (const key of ['id', 'key', 'name', 'title', 'song', 'songId', 'file', 'fileName', 'recordedDate', 'created', 'date', 'history', 'trackId', 'samples', 'curve']) expect(keys.has(key), key).toBe(false);
  // What it does hold.
  expect(d.takes[0]).toMatchObject({source:'clean', clean:true, cleanWhy:'no-accompaniment-heard', measurable:true, fromDeviceCache:false});
  expect(d.takes[1]).toMatchObject({source:'mixed', clean:false, cleanWhy:'accompaniment-heard', measurable:true, measurableWhy:'mixed-voice-on-top', mrRemoval:null, mrTries:[]});
  expect(d.takes[1].resonance).toBeNull(); expect(d.takes[0].resonance.ratioDb).toEqual(expect.any(Number));
  expect(d.takes[0].storedAnalysis).toMatchObject({version:2, reliable:true, pitchConfidence:0.95, voiceOverMrDb:null});
  expect(d.takes[1].storedAnalysis.voiceOverMrDb).toBe(8);
  // How long each stage took, in ms (numbers only): the real phone's times come back in this file.
  for (const t of d.takes) { expect(Object.keys(t.stagesMs).sort()).toEqual(['cancel', 'decode', 'fetch', 'model', 'resample', 'total', 'voice']); for (const v of Object.values(t.stagesMs)) expect(v).toEqual(expect.any(Number)); }
  expect(d.takes[0].confidence).toMatchObject({pitchSource:'autocorrelation', bandwidthHz:8000, glitchShare:expect.any(Number), jumpsPerMin:expect.any(Number)});
  expect(d.takes[0].durationSeconds).toBeCloseTo(34, 0);
  expect(d.takes[0].transitions.breakCount).toBe(3);
  expect(d.takes[0].zones.low).toHaveProperty('seconds'); expect(d.takes[0].coverage.mid).toHaveProperty('enough');
  expect(d.takes[0].semitoneBands.length).toBeGreaterThan(4);
  expect(d.takes[0].semitoneBands[0]).toMatchObject({midi:expect.any(Number), seconds:expect.any(Number)});
  expect(d.thresholds.BREAK_MAX_MS).toBe(150); expect(d.thresholds.HOP).toBe(320); expect(d.modelVersion).toBe('vp-0.2');
  expect(d.comparison).toHaveLength(10);
  expect(page.__errors).toEqual([]);
});

test('320px: nothing runs off the screen and every control is at least 44px', async ({page}) => {
  await page.setViewportSize({width:320, height:700});
  await boot(page);
  await open(page);
  await noOverflow(page);
  await measure(page);
  await page.locator('[data-vp-zone-card] summary').click();
  await noOverflow(page);
  for (const sel of ['[data-vp-pick]', '.vp-check', '[data-vp-base]', '[data-vp-run]', '[data-vp-play]', '[data-vp-diagnosis]', '[data-vp-zone-card] summary', '[data-vp-player] .player-btn']) {
    for (const box of await page.locator(sel).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return {w:r.width, h:r.height, right:r.right}; }))) {
      expect(box.h, sel).toBeGreaterThanOrEqual(44); expect(box.w, sel).toBeGreaterThanOrEqual(44); expect(box.right, sel).toBeLessThanOrEqual(320.5);
    }
  }
  expect(page.__errors).toEqual([]);
});

test('320px with MR files: both takes\' MR selects fit and are at least 44px', async ({page}) => {
  await page.setViewportSize({width:320, height:700});
  await bootMr(page);
  await page.evaluate(() => VZ.change(d => { d.songs.find(s => s.id === 's1').mrTracks.unshift({id:'t-long', kind:'file', title:'아주 긴 이름의 다른 편곡 MR 파일 (반키 낮춤, 템포 느리게, 코러스 없는 버전)', r2Key:'mr/other', size:3333, created:2}); }, {silent:true}));
  await open(page);
  await page.locator('[data-vp-mr-pick="b"]').selectOption('t-long');
  await expect(page.locator('[data-vp-mr-pick]')).toHaveCount(2);
  await noOverflow(page);
  for (const box of await page.locator('[data-vp-mr-pick]').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return {w:r.width, h:r.height, right:r.right}; }))) {
    expect(box.h).toBeGreaterThanOrEqual(44); expect(box.w).toBeGreaterThanOrEqual(44); expect(box.right).toBeLessThanOrEqual(320.5);
  }
  expect(page.__errors).toEqual([]);
});

test.describe('screenshot', () => {
  test.use({deviceScaleFactor:2});
  test('375px: both takes\' MR selects (written only when VP_SHOT names a file)', async ({page}, info) => {
    test.skip(!process.env.VP_SHOT || info.project.name !== 'chromium-mobile', 'a picture for the owner, on request');
    await page.setViewportSize({width:375, height:812});
    await bootMr(page);
    await addOtherMr(page);
    await open(page);
    await page.locator('[data-vp-mr-pick="b"]').selectOption('t-other');
    await noOverflow(page);
    await page.locator('[data-vp-slot="a"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => { const r = document.querySelector('[data-vp-slot="a"]').getBoundingClientRect(); window.scrollBy(0, r.top - 70); });
    await page.screenshot({path:process.env.VP_SHOT});
  });
});

test('tablet: the picker sits beside the results in the 성장 column', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'sizes are set explicitly');
  await page.setViewportSize({width:1024, height:768});
  await boot(page);
  await open(page);
  await measure(page);
  await noOverflow(page);
  const picker = await page.locator('[data-vp-picker]').boundingBox(), results = await page.locator('[data-vp-results]').boundingBox();
  expect(results.x).toBeGreaterThan(picker.x + picker.width);                      // side by side
  expect(Math.abs(results.y - picker.y)).toBeLessThan(4);
  const takes = await page.locator('[data-vp-take]').evaluateAll(els => els.map(el => el.getBoundingClientRect().top));
  expect(Math.abs(takes[0] - takes[1])).toBeLessThan(2);                           // 기준 and 비교 next to each other
  await page.setViewportSize({width:768, height:1024});
  await noOverflow(page);
  expect(page.__errors).toEqual([]);
});

test('stage times for a 3.5-minute take with the main thread slowed six times (reported, not asserted)', async ({page}, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'timed once, on desktop Chromium');
  test.setTimeout(180000);
  await boot(page, {takes:[{...TAKES[0], seconds:5}, {...TAKES[2], seconds:5}]});
  // 210 s, 48 kHz stereo WAV (the 16 kHz synth held three samples long): what a phone recording decodes like.
  await page.evaluate(async () => {
    const big = kind => { const x = window.vpTake.samples(kind, 210), n = x.length * 3, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 48000, true); v.setUint32(28, 48000 * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, x[(i / 3) | 0])) * 32767; v.setInt16(44 + i * 4, s, true); v.setInt16(46 + i * 4, s, true); } return buf; };
    for (const [id, kind] of [['m-old', 'worse'], ['m-new', 'better']]) { const m = (await VZ.media.list(true)).find(x => x.id === id); await window.vzipStorePracticeMedia({...m, blob:new Blob([big(kind)], {type:'audio/wav'}), durationSeconds:210}); }
    await VZ.media.list(true);
    window.__long = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({entryTypes:['longtask']});
  });
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:6});                     // the page's thread only: Chromium does not slow workers
  const t0 = Date.now();
  await page.locator('[data-vp-run]').click();
  await done(page);
  const total = Date.now() - t0;
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:1});
  const d = await page.evaluate(() => VZ.voicePathDiagnosis()), long = await page.evaluate(() => window.__long);
  console.log('voice-path, 3.5-minute takes, main thread ×6: both takes ' + total + ' ms; stages ' + JSON.stringify(d.takes.map(t => t.stagesMs)) + '; main-thread tasks over 50 ms (ms, at ×6): ' + JSON.stringify(long));
  info.annotations.push({type:'stages-ms', description:JSON.stringify(d.takes.map(t => t.stagesMs))});
  expect(d.takes[0].durationSeconds).toBeCloseTo(210, 0);
  expect(page.__errors).toEqual([]);
});
