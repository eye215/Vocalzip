// 설정 › 녹음 중 블루투스 시험 (app/bt-route-test.js): a diagnostic screen. getUserMedia gives an oscillator stream,
// navigator.audioSession is a plain object that records each assignment, and <audio> play() is stubbed (no real sound).
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1', BT = 'vzip_bt_route_test_v1';
const supa = "window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};";
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

async function boot(page, {session = true, hash = '#/bt-test'} = {}) {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:supa}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  // No R2 worker in these tests (WebKit reports the cross-origin call to the real one as a page error).
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.addInitScript(([k, session]) => {
    if (!sessionStorage.getItem('seed')) { localStorage.setItem(k, JSON.stringify({categories:[], songs:[], lessons:[], assignments:[], practices:[], comparisonReports:[]})); sessionStorage.setItem('seed', '1'); }
    window.__ev = []; window.__tracks = []; window.__constraints = []; window.__silent = false;
    if (session) {
      const s = {current:'auto', sets:[]};
      Object.defineProperty(s, 'type', {enumerable:true, get() { return this.current; }, set(v) { this.sets.push(v); window.__ev.push('session:' + v); this.current = v; }});
      Object.defineProperty(navigator, 'audioSession', {configurable:true, value:s});
    } else Object.defineProperty(navigator, 'audioSession', {configurable:true, value:undefined});
    let md = navigator.mediaDevices;
    if (!md) { md = {}; Object.defineProperty(navigator, 'mediaDevices', {configurable:true, value:md}); }
    md.getUserMedia = async constraints => {
      window.__ev.push('mic'); window.__constraints.push(constraints);
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      let stream;
      if (ctx.createMediaStreamDestination) {
        const osc = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
        gain.gain.value = window.__silent ? 0 : 0.5; osc.connect(gain); gain.connect(dest); osc.start();
        stream = dest.stream;
      } else { // no MediaStream destination: a stand-in with stoppable tracks (the screen then has no level meter)
        const track = {kind:'audio', readyState:'live', muted:false, stop() { this.readyState = 'ended'; }};
        stream = {getTracks:() => [track], getAudioTracks:() => [track]};
      }
      ctx.resume?.()?.catch?.(() => {}); // never awaited: headless engines may leave it pending
      window.__tracks.push(...stream.getTracks()); return stream;
    };
    HTMLMediaElement.prototype.play = function () { window.__ev.push('play'); return Promise.resolve(); };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { window.__ev.push('webaudio'); return start.apply(this, a); };
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async t => { window.__copied = t; }}});
  }, [KEY, session]);
  await page.goto('/' + hash);
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  if (hash === '#/bt-test') await expect(page.locator('[data-bt-test] .vz-bt-methods')).toBeVisible();
}
const card = (page, id) => page.locator('[data-method="' + id + '"]');
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), BT);
const events = page => page.evaluate(() => window.__ev.slice());
// Returns whether the fake microphone's level reached the meter. Chromium always renders the oscillator; headless
// WebKit may not run audio at all, and then the screen must say the microphone did not move.
async function runAndAnswer(page, id, answer, {waitLevel = true} = {}) {
  await page.evaluate(() => { window.__ev.length = 0; });
  await card(page, id).getByRole('button', {name:/시험하기/}).click();
  const ask = card(page, id).locator('[data-ask]');
  await expect(ask).toBeVisible({timeout:12000});
  let live = false;
  if (waitLevel) {
    const level = () => card(page, id).locator('[role=meter]').getAttribute('aria-valuenow').then(Number).catch(() => 0);
    for (let i = 0; i < 30 && !live; i++) { live = await level() > 0; if (!live) await page.waitForTimeout(100); }
    if (!/webkit/.test(test.info().project.name)) expect(live).toBe(true);
  } else await page.waitForTimeout(500);
  await ask.getByRole('button', {name:answer, exact:true}).click();
  await expect(card(page, id).locator('.vz-bt-done')).toBeVisible();
  return live;
}

test('설정에서 열고, 마이크 없이 먼저 확인한 뒤 방법 1을 시험해요: 세션 순서·마이크 정리·답 저장', async ({page}) => {
  await boot(page, {hash:'#/settings'});
  await page.locator('[data-bt-test-link]').click();
  await expect(page).toHaveURL(/#\/bt-test$/);
  await expect(page.locator('#top h1')).toHaveText('녹음 중 블루투스 시험');
  await expect(page.getByText('블루투스 스피커를 연결하고 소리가 스피커로 나오는지 먼저 확인해요')).toBeVisible();
  // Step 1: a tone with no microphone.
  await page.getByRole('button', {name:'소리 들어 보기'}).click();
  await page.getByRole('button', {name:'스피커에서 들렸어요'}).click();
  expect(await events(page)).toEqual(['play']);
  expect((await saved(page)).baseline).toBe('bt');
  await expect(page.locator('[data-baseline-result]')).toContainText('스피커에서 들렸어요');
  // Method 1: play-and-record is set before the microphone opens, raw constraints, <audio> playback, then reset to auto.
  const live = await runAndAnswer(page, 'par-raw-audio', '블루투스 스피커');
  expect(await events(page)).toEqual(['session:play-and-record', 'mic', 'play', 'session:auto']);
  expect(await page.evaluate(() => window.__constraints[0])).toEqual({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
  expect(await page.evaluate(() => window.__tracks.length > 0 && window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('auto');
  const r = (await saved(page)).results['par-raw-audio'];
  expect(r).toMatchObject({heard:'bt', micMoved:live});
  if (live) expect(r.error).toBe('');
  expect(r.session).toEqual([['start', 'auto'], ['set', 'play-and-record'], ['mic', 'play-and-record'], ['play', 'play-and-record'], ['reset', 'auto']]);
  await expect(page.locator('[data-results] tbody tr').first()).toContainText('블루투스 스피커');
});

test('마이크 반응 감지와 다른 순서들: 웹 오디오, 소리 먼저, 마이크 뒤 재생 전용', async ({page}) => {
  await boot(page);
  // A silent microphone does not count as "moved".
  await page.evaluate(() => { window.__silent = true; });
  await runAndAnswer(page, 'auto-default-audio', '아이패드', {waitLevel:false});
  expect(await events(page)).toEqual(['session:auto', 'mic', 'play', 'session:auto']);
  expect(await page.evaluate(() => window.__constraints.at(-1))).toEqual({audio:true});
  expect((await saved(page)).results['auto-default-audio']).toMatchObject({heard:'ipad', micMoved:false});
  await page.evaluate(() => { window.__silent = false; });
  await runAndAnswer(page, 'par-raw-webaudio', '블루투스 스피커');
  expect(await events(page)).toEqual(['session:play-and-record', 'mic', 'webaudio', 'session:auto']);
  // Playback starts before the session is set and the microphone opens.
  await runAndAnswer(page, 'play-first-par', '아이패드');
  expect(await events(page)).toEqual(['play', 'session:play-and-record', 'mic', 'session:auto']);
  // 'playback' is set only after the microphone is open; the level after the switch is what counts.
  const live = await runAndAnswer(page, 'playback-after', '안 들렸어요');
  expect(await events(page)).toEqual(['mic', 'session:playback', 'play', 'session:auto']);
  const r = (await saved(page)).results['playback-after'];
  expect(r).toMatchObject({heard:'none', micMoved:live});
  expect(r.session.map(s => s[0])).toEqual(['start', 'mic', 'after', 'play', 'reset']);
  expect(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
});

test('오디오 세션을 지원하지 않으면 알려 주고 그 방법들은 건너뛰어요', async ({page}) => {
  await boot(page, {session:false});
  await expect(page.locator('[data-unsupported]')).toContainText('지원하지 않아요');
  for (const id of ['par-raw-audio', 'par-raw-webaudio', 'par-default-webaudio', 'play-first-par', 'playback-after']) {
    await expect(card(page, id).locator('.vz-bt-skip')).toBeVisible();
    await expect(card(page, id).locator('[data-run]')).toHaveCount(0);
  }
  const live = await runAndAnswer(page, 'auto-raw-audio', '아이패드');
  expect(await events(page)).toEqual(['mic', 'play']);
  expect((await saved(page)).results['auto-raw-audio'].session).toEqual([['start', null], ['mic', null], ['play', null], ['reset', null]]);
  await page.getByRole('button', {name:'결과 복사'}).click();
  const text = await page.evaluate(() => window.__copied);
  expect(text).toContain('오디오 세션 설정: 미지원');
  expect(text).toMatch(/1\. 녹음·재생 모드를 먼저 켜고 오디오로 재생 .* — 건너뜀\(오디오 세션 미지원\)/);
  expect(text).toMatch(new RegExp('3\\. 지금 앱 녹음과 같은 방식 .* — 들린 곳: 아이패드 · 마이크 반응: ' + (live ? '있음' : '없음')));
});

test('결과는 새로고침해도 남고, 복사한 글에는 방법별 줄이 있고 id는 없어요; 지우기', async ({page}) => {
  await boot(page);
  const live = await runAndAnswer(page, 'auto-raw-audio', '블루투스 스피커');
  await page.reload();
  await expect(page.locator('[data-bt-test] .vz-bt-methods')).toBeVisible();
  await expect(card(page, 'auto-raw-audio').locator('.vz-bt-done')).toContainText('블루투스 스피커');
  await expect(page.locator('[data-results] tbody tr').nth(2)).toContainText('블루투스 스피커');
  await page.getByRole('button', {name:'결과 복사'}).click();
  await expect(page.locator('.toast').last()).toContainText('복사했어요');
  const text = await page.evaluate(() => window.__copied), ua = await page.evaluate(() => navigator.userAgent);
  expect(text).toContain('기기: ' + ua);
  expect(text).toMatch(/홈 화면 앱: (예|아니오)/);
  expect(text).toContain('오디오 세션 설정: 지원');
  expect(text).toMatch(/3\. 지금 앱 녹음과 같은 방식 \[.*\] — 들린 곳: 블루투스 스피커 · 마이크 반응: (있음|없음) \(최대 [\d.]+\) · 마이크 상태: live · 세션: 시작 auto → 설정 후 auto → 마이크 후 auto → 재생 후 auto → 정리 후 auto · 오류: /);
  expect(text).toContain('마이크 반응: ' + (live ? '있음' : '없음'));
  expect(text).toContain('1. 녹음·재생 모드를 먼저 켜고 오디오로 재생');
  expect(text.split('\n').filter(l => /^\d\. /.test(l))).toHaveLength(8);
  expect(text).not.toMatch(/ui-test-user|test@example|par-raw|auto-raw|play-first|playback-after/);
  // 지우기 asks first, then removes only this screen's results.
  await page.getByRole('button', {name:'지우기'}).click();
  await page.getByRole('dialog', {name:'결과 지우기'}).getByRole('button', {name:'지우기'}).click();
  expect(await saved(page)).toBeNull();
  expect(await page.evaluate(k => !!localStorage.getItem(k), KEY)).toBe(true);
  await expect(card(page, 'auto-raw-audio').locator('.vz-bt-done')).toHaveCount(0);
});

test('시험 중에 화면을 떠나면 마이크를 끄고 세션을 auto로 되돌려요', async ({page}) => {
  await boot(page);
  await card(page, 'par-raw-audio').getByRole('button', {name:'시험하기'}).click();
  await expect(card(page, 'par-raw-audio').locator('[data-ask]')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/settings'; });
  await expect(page.locator('[data-bt-test-link]')).toBeVisible();
  expect(await page.evaluate(() => [window.__tracks.every(t => t.readyState === 'ended'), navigator.audioSession.type])).toEqual([true, 'auto']);
  expect(await saved(page)).toBeNull();
});

for (const width of [390, 820]) test('넓이 ' + width + 'px: 가로로 넘치지 않고 버튼은 44px 이상', async ({page}) => {
  await page.setViewportSize({width, height:900});
  await boot(page);
  await card(page, 'par-raw-audio').getByRole('button', {name:'시험하기'}).click();
  await expect(card(page, 'par-raw-audio').locator('[data-ask]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() => [...document.querySelectorAll('[data-bt-test] button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.textContent));
  expect(small).toEqual([]);
  await card(page, 'par-raw-audio').getByRole('button', {name:'블루투스 스피커'}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('재생이 끝나지 않거나 거부돼도 정한 시간 뒤에 질문이 나오고 오류를 남겨요', async ({page}) => {
  await boot(page);
  await page.evaluate(() => { HTMLMediaElement.prototype.play = function () { window.__ev.push('play'); return new Promise(() => {}); }; });
  await runAndAnswer(page, 'auto-raw-audio', '안 들렸어요');
  expect((await saved(page)).results['auto-raw-audio']).toMatchObject({heard:'none', error:'play:Timeout'});
  await page.evaluate(() => { HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('blocked', 'NotAllowedError')); }; });
  await runAndAnswer(page, 'auto-default-audio', '아이패드');
  expect((await saved(page)).results['auto-default-audio']).toMatchObject({heard:'ipad', error:'play:NotAllowedError'});
  expect(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
});
