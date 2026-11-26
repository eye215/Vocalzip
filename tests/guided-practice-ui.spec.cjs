// 따라 하기 is one step of 오늘의 연습 (2026-11-26): every '따라 하기' opens the set runner with a set of ONE step, the old
// #/guided-practice/<key> address redirects there, the hand-reviewed video is a tool of that step (mic off while it plays,
// time only while it plays, 80 % watched or 타이머로 하기 to finish), then 혼자 해 보기 with the tuner where the exercise
// has one. The set saves one run row that also counts the homework once ('N회') and checks the goal — no second row,
// no minutes twice. Fixture-only: a fake YouTube player, a fake mic, no network.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const KEY = 'vocal-zip_mvp_v1';
const NOW = '2026-11-04T12:00:00.000Z';
const TODAY = '2026-11-04';
const seed = () => ({
  categories:[{id:'c-voice',name:'발성',items:['립트릴']}],
  songs:[{id:'s1', title:'This Is the Moment'}],
  lessons:[],
  assignments:[
    {id:'a1', title:'롱톤 5초 유지하기', status:'active', startDate:'2026-11-01', dueDate:'2026-11-08'},
    {id:'a2', title:'호흡을 편하게 유지하기', status:'active', startDate:'2026-11-01', dueDate:'2026-11-09'},
    {id:'a3', title:'안정적인 음역(D#3~A#5) 안에서 아 소리 유지', status:'active', startDate:'2026-11-01', dueDate:'2026-11-10'}
  ],
  practices:[{id:'p1', date:TODAY, minutes:30, manualMinutes:30, practiceTimeSource:'manual', mediaIds:[], songId:'s1', practiceMode:'song', memo:'원본 연습 보존'}],
  performances:[], comparisonReports:[],
  dailyGoals:[{id:'g1', date:TODAY, title:'롱톤 5초 유지하기', source:'homework', sourceId:'a1', completed:false, order:0}],
  practicePlans:[{id:'day:'+TODAY, period:'day', date:TODAY, targetMinutes:30}]
});
function installSDK() {
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const row = () => JSON.parse(sessionStorage.getItem('gp-server-row') || 'null');
  const client = {
    auth:{
      getUser:async () => ({data:{user:{id:'gp-user',email:'gp@example.invalid',user_metadata:{name:'테스트'}}},error:null}),
      getSession:async () => ({data:{session:{access_token:'fixture-token'}}}),
      onAuthStateChange:() => ({data:{subscription:{unsubscribe(){}}}})
    },
    storage:{from:() => ({createSignedUrl:async () => ({data:{signedUrl:'/fixture.wav'},error:null})})},
    async rpc(){return {data:null,error:null};},
    from(table) {
      const q = {method:'read',filters:{},single:false}, chain = {};
      chain.select = columns => {q.columns=columns;return chain;};
      chain.eq = chain.is = (key,value) => {q.filters[key]=value;return chain;};
      for (const method of ['order','range','limit','in']) chain[method] = () => chain;
      chain.maybeSingle = () => {q.single=true;return chain;};
      for (const method of ['upsert','insert','update','delete']) chain[method] = (body,options) => {Object.assign(q,{method,body,options});return chain;};
      chain.then = (resolve,reject) => Promise.resolve().then(() => {
        if (table !== 'vocal_data') return {data:q.single?null:[],error:null};
        const current = row();
        if (q.method === 'read') {
          const value = q.columns?.startsWith('ids:') ? (current ? {ids:current.payload?.deleted?.media || []}:null) : current;
          return {data:q.single?clone(value):(value?[clone(value)]:[]),error:null};
        }
        if (q.method === 'update' && (!current || q.filters.updated_at !== current.updated_at)) return {data:[],error:null};
        if ((q.method === 'upsert' || q.method === 'insert') && current && q.options?.ignoreDuplicates) return {data:[],error:null};
        sessionStorage.setItem('gp-server-row',JSON.stringify({payload:q.body.payload,updated_at:q.body.updated_at}));
        return {data:[{user_id:'gp-user'}],error:null};
      }).then(resolve,reject);
      return chain;
    }
  };
  window.supabase = {createClient:() => client};
}
/** A YouTube player that plays one second of video per second of the page's clock; seekTo jumps. */
function fakeYouTube(duration) {
  window.__yt = {created:0, vars:null};
  window.YT = {PlayerState:{ENDED:0, PLAYING:1, PAUSED:2, BUFFERING:3}, Player:function(id, config) {
    const iframe = document.createElement('iframe');document.getElementById(id).replaceWith(iframe);
    let state = 5, time = 0, timer = 0;
    const fire = s => {state = s;config.events.onStateChange({data:s, target:player});};
    const player = {getIframe:() => iframe, getDuration:() => duration, getCurrentTime:() => time, getPlayerState:() => state,
      playVideo() {if (state === 1) return;clearInterval(timer);fire(1);timer = setInterval(() => {time = Math.min(duration, time + 1);if (time >= duration) {clearInterval(timer);fire(0);}}, 1000);},
      pauseVideo() {if (state !== 1) return;clearInterval(timer);fire(2);},
      seekTo(n) {time = n;}, destroy() {clearInterval(timer);iframe.remove();}};
    window.__yt.created++;window.__yt.vars = config.playerVars;window.__yt.player = player;
    setTimeout(() => config.events.onReady({target:player}), 0);
    return player;
  }};
}
/** A mic that hears a steady note (Hz), and every getUserMedia call counted. Tones played are kept (Hz). */
function fakeMic(hz) {
  window.__gum = 0;window.__micStopped = 0;window.__tones = [];
  const fake = async () => {window.__gum++;return {getTracks:() => [{stop() {window.__micStopped++;}}]};};
  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {value:fake, configurable:true, writable:true});
  if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:fake, configurable:true, writable:true});
  window.AudioContext = class {
    sampleRate = 48000;get currentTime() {return performance.now() / 1000;}destination = {};state = 'running';resume() {return Promise.resolve();}close() {return Promise.resolve();}
    createMediaStreamSource() {return {connect() {}, disconnect() {}};}
    createAnalyser() {return {fftSize:4096, connect() {}, disconnect() {}, getFloatTimeDomainData(data) {for (let i = 0; i < data.length; i++) data[i] = .2 * Math.sin(2 * Math.PI * hz * i / 48000);}};}
    createGain() {return {gain:{setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {return {connect() {}};}, disconnect() {}};}
    createOscillator() {const o = {type:'', frequency:{value:0}, connect(g) {return g;}, start() {window.__tones.push(o.frequency.value);}, stop() {}, disconnect() {}};return o;}
  };
}
async function boot(page, {value = seed(), video = 0, hz = 233.08188} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.install({time:new Date(NOW)});
  await page.addInitScript(({key, value}) => {
    if (!sessionStorage.getItem('gp-seeded')) {
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem('gp-server-row', JSON.stringify({payload:value, updated_at:'2026-11-04T11:00:00.000Z'}));
      sessionStorage.setItem('gp-seeded', '1');
    }
  }, {key:KEY, value});
  if (video) await page.addInitScript(fakeYouTube, video);
  await page.addInitScript(fakeMic, hz);
  await page.route('**/supabase.min.js', route => route.fulfill({contentType:'application/javascript', body:'(' + installSDK.toString() + ')();'}));
  await page.route('**/r2-config.js*', route => route.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', route => route.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/www.youtube.com/**', route => route.abort());
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && typeof window.VZ?.change === 'function')).toBe(true);
  await expect(page.locator('.vz-student-home')).toBeVisible();
  // From here the page's time moves only with elapse(): every second below is one the test gave.
  await page.clock.pauseAt(new Date(Date.parse(NOW) + 10 * 60 * 1000));
}
const db = page => page.evaluate(() => JSON.parse(JSON.stringify(VZ.db)));
const to = (page, hash) => page.evaluate(h => {location.hash = h;}, hash);
const run = page => page.locator('[data-pset-run]');
const primary = page => run(page).locator('[data-run-primary]');
const time = page => run(page).locator('[data-guide-time]');
const elapse = (page, seconds) => page.clock.runFor(seconds * 1000);
const hide = (page, hidden) => page.evaluate(hidden => {
  Object.defineProperty(document, 'hidden', {configurable:true, get:() => hidden});
  Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => hidden ? 'hidden' : 'visible'});
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
/** Seconds counted on the one step of the set in hand (this device's running session), null without one. */
const seconds = page => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith('vzip_practice_set_live:'));
  const s = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
  if (!s) return null;
  // A running session is stored with the moment it was last counted: the time is that plus the clock since.
  return Math.round((s.steps[s.index].elapsed + (s.running ? (Date.now() - s.lastAt) / 1000 : 0)) * 1000) / 1000;
});
test.afterEach(async({page}) => expect(page.__errors || []).toEqual([]));

test('the homework row\'s 따라 하기 opens a set of one step; while the video plays the mic stays off and only playing time counts; 80 % finishes it', async({page}) => {
  test.setTimeout(60000);
  await boot(page, {video:10});
  await to(page, '#/homework');
  const link = page.getByRole('link', {name:'롱톤 5초 유지하기 따라 하기', exact:true});
  await expect(link).toHaveAttribute('href', '#/practice-set?guide=homework%3Aa1');
  await link.click();
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(run(page).locator('[data-run-count-all]')).toHaveText('1 / 1');
  await expect(run(page).locator('[data-run-say]')).toHaveText('롱톤 5초 유지하기');
  await expect(run(page).locator('[data-run-name] b')).toHaveText('숙제');
  await expect(run(page).getByRole('button', {name:'영상 보며 하기'})).toHaveAttribute('aria-pressed', 'true');
  await expect(run(page).getByRole('button', {name:'타이머로 하기'})).toHaveAttribute('aria-pressed', 'false');
  await expect(run(page).locator('[data-guide-mic-off]')).toContainText('마이크 꺼짐');
  await expect(run(page).locator('.dset-guide-time span')).toHaveText('영상이 재생되는 동안만 세요');
  await expect(run(page).getByText('이 영상이 이 연습에 맞았나요?')).toBeVisible();
  // The player is the app's: no controls, no keyboard, no seeking by hand.
  await elapse(page, .1);
  expect(await page.evaluate(() => window.__yt.vars)).toMatchObject({controls:0, disablekb:1, fs:0, playsinline:1});
  await expect(run(page).locator('.dset-video iframe')).toHaveCSS('pointer-events', 'none');
  await expect(primary(page)).toHaveText('영상 재생');await expect(primary(page)).toBeEnabled();
  // Nothing counts before the video plays.
  await elapse(page, 5);
  await expect(time(page)).toHaveText('연습 시간 0:00');
  await primary(page).click();
  await elapse(page, 3);
  await expect(time(page)).toHaveText('연습 시간 0:03');
  // Under 80 % the big button pauses; it cannot finish yet.
  await expect(primary(page)).toHaveText('잠깐 멈춤');
  await expect(run(page).locator('[data-run-sub]')).toContainText('80%');
  await primary(page).click();
  await elapse(page, 6);
  await expect(time(page)).toHaveText('연습 시간 0:03');
  await expect(primary(page)).toHaveText('영상 이어 보기');
  // Back to it; a hidden page stops the video and the clock.
  await primary(page).click();
  await elapse(page, 2);
  await hide(page, true);
  expect(await page.evaluate(() => window.__yt.player.getPlayerState())).toBe(2);
  await elapse(page, 8);
  await hide(page, false);
  await expect(time(page)).toHaveText('연습 시간 0:05');
  // A jump forward is not watched: 0–4 and 8–9 seen (7 of 10 seconds), then the end — not enough to finish.
  await primary(page).click();
  await page.evaluate(() => window.__yt.player.seekTo(8));
  await elapse(page, 3);
  await expect(primary(page)).toHaveText('영상 이어 보기');
  await expect(run(page).locator('[data-guide-watch]')).toHaveText('영상 0:07 / 0:10');
  await expect(run(page).getByRole('button', {name:'다 했어요'})).toBeHidden();
  await expect(time(page)).toHaveText('연습 시간 0:07');
  // Watched again from the start: at 80 % (seconds 5 and 6 seen) it can be finished while it plays.
  await primary(page).click();
  await elapse(page, 4);
  await expect(primary(page)).toHaveText('잠깐 멈춤');
  await elapse(page, 3);
  await expect(primary(page)).toHaveText('다 했어요');
  await expect(run(page).getByRole('button', {name:'일시정지'})).toBeVisible();
  const counted = await seconds(page);
  expect(counted).toBeGreaterThanOrEqual(13.5);expect(counted).toBeLessThanOrEqual(14.5);   // 3 + 2 + 2 + 7 seconds played
  // Not one mic request while the video played.
  expect(await page.evaluate(() => window.__gum)).toBe(0);
  await primary(page).click();
  // The set's summary: one line with its real seconds, then saved as any set.
  const summary = page.locator('.pset-summary');
  await expect(summary.locator('.pset-sum-list .pset-row')).toHaveCount(1);
  await expect(summary.locator('[data-state="done"] strong')).toHaveText('롱톤 5초 유지하기');
  const before = await db(page);
  await summary.locator('[data-save]').click();
  await expect(page.locator('.pset-done')).toBeVisible();
  await expect(page.locator('.pset-done .pset-help')).toContainText('목표 1개 체크');
  const after = await db(page);
  const runs = after.practices.filter(p => p.dailySet);
  expect(runs).toHaveLength(1);
  const row = runs[0];
  // One practice of the homework ('N회' +1); the homework itself is not marked done.
  expect(row).toMatchObject({date:TODAY, completed:['a1'], assignmentReps:{a1:1}, practiceTimeSource:'practice-set'});
  expect(row.dailySet.items).toHaveLength(1);
  expect(row.dailySet.items[0]).toMatchObject({id:'guide:homework:a1', kind:'next', source:'homework', assignmentId:'a1', state:'done', mode:'guide'});
  expect(after.assignments.find(t => t.id === 'a1')).toEqual(before.assignments.find(t => t.id === 'a1'));
  // The goal is checked, with no row of its own: the minutes are in the run row only.
  expect(after.dailyGoals.find(g => g.id === 'g1').completed).toBe(true);
  expect(after.practices.some(p => p.id === 'goal:g1')).toBe(false);
  expect(after.practices).toHaveLength(before.practices.length + 1);
  expect(row.minutes).toBeCloseTo(counted / 60, 3);
  const total = list => list.filter(p => p.date === TODAY).reduce((n, p) => n + Number(p.minutes || 0), 0);
  expect(total(after.practices)).toBeCloseTo(total(before.practices) + row.minutes, 6);
  // The homework row says it was practised once.
  await to(page, '#/homework');
  await expect(page.locator('.item', {hasText:'롱톤 5초 유지하기'}).first()).toContainText('1회 했어요');
  expect(await page.evaluate(() => window.__gum)).toBe(0);
});

test('타이머로 하기 finishes without the video; 맞지 않아요 is kept as before and that video is not offered for it again', async({page}) => {
  test.setTimeout(60000);
  await boot(page, {video:240});
  await to(page, '#/practice-set?guide=' + encodeURIComponent('homework:a1'));
  await expect(page).toHaveURL(/#\/practice-set$/);
  await elapse(page, .1);
  // A set of ONE step: no ① 보이스 체크 though none is saved today (the full set would start with it).
  await expect(run(page).locator('[data-run-count-all]')).toHaveText('1 / 1');
  expect(await page.evaluate(() => VZ.voiceCheck.doneToday())).toBe(false);
  await run(page).getByRole('button', {name:'영상이 재생되지 않나요? 타이머로 연습하기'}).click();
  await expect(run(page).getByRole('button', {name:'타이머로 하기'})).toHaveAttribute('aria-pressed', 'true');
  await expect(run(page).locator('.dset-video')).toHaveCount(0);
  await expect(primary(page)).toHaveText('시작하기');
  await primary(page).click();
  await elapse(page, 4);
  await expect(time(page)).toHaveText('연습 시간 0:04');
  await expect(primary(page)).toHaveText('다 했어요');
  // The second row pauses: the clock stops.
  await run(page).getByRole('button', {name:'일시정지'}).click();
  await elapse(page, 5);
  await expect(time(page)).toHaveText('연습 시간 0:04');
  // Back to the video and rate it: 맞지 않아요 saves the same row as before and the step goes on with the timer.
  await run(page).getByRole('button', {name:'영상 보며 하기'}).click();
  await elapse(page, .1);
  await run(page).getByRole('button', {name:'맞지 않아요'}).click();
  await expect(run(page).locator('.dset-video')).toHaveCount(0);
  await expect(run(page).locator('[data-guide-part]')).toHaveCount(0);
  const feedback = (await db(page)).videoFeedback;
  expect(feedback).toHaveLength(1);
  expect(feedback[0]).toMatchObject({id:'homework:a1:Kl85hKuMP5Y', exerciseKey:'homework:a1', videoId:'Kl85hKuMP5Y', verdict:'bad'});
  await primary(page).click();
  await elapse(page, 2);
  await primary(page).click();
  await page.locator('.pset-summary [data-save]').click();
  await expect(page.locator('.pset-done')).toBeVisible();
  const row = (await db(page)).practices.find(p => p.dailySet);
  expect(row.dailySet.items[0]).toMatchObject({state:'done', mode:'guide', timer:true});
  expect(row.minutes).toBeCloseTo(6 / 60, 2);
  // Another 따라 하기 of the same exercise: no video now.
  await to(page, '#/guided-practice/' + encodeURIComponent('homework:a1'));
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(run(page).locator('[data-run-count-all]')).toHaveText('1 / 1');
  await expect(run(page).locator('.dset-video')).toHaveCount(0);
  await expect(run(page).locator('[data-guide-part]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__gum)).toBe(0);
});

test('the old #/guided-practice/<key> address redirects; ✕ before anything counted goes back and keeps no set; one set or clock at a time', async({page}) => {
  test.setTimeout(60000);
  await boot(page);
  await to(page, '#/next-practice');
  await expect(page.locator('[data-next-practice]')).toBeVisible();
  await to(page, '#/guided-practice/' + encodeURIComponent('homework:a2'));
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(run(page).locator('[data-run-say]')).toHaveText('호흡을 편하게 유지하기');
  await expect(run(page).locator('.dset-video')).toHaveCount(0);
  await run(page).locator('[data-run-exit]').click();
  await expect(page).toHaveURL(/#\/next-practice$/);
  expect(await seconds(page)).toBeNull();
  // A set in hand is carried on instead of being replaced.
  await to(page, '#/practice-set?guide=' + encodeURIComponent('homework:a2'));
  await expect(primary(page)).toHaveText('시작하기');
  await primary(page).click();
  await elapse(page, 3);
  await to(page, '#/practice-set?guide=' + encodeURIComponent('homework:a3'));
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(run(page).locator('[data-run-say]')).toHaveText('호흡을 편하게 유지하기');
  await expect(page.locator('.toast')).toContainText('하던 오늘의 연습이 있어요');
  // Leaving stops its clock (it is not the wall clock of one's own step).
  await to(page, '#/home');
  const held = await seconds(page);
  expect(held).toBeGreaterThanOrEqual(3);
  await elapse(page, 5);
  expect(await seconds(page)).toBe(held);
  await to(page, '#/practice-set');
  await run(page).locator('[data-run-stop]').click();
  await page.locator('.pset-summary [data-discard]').click();
  await page.locator('[data-ok]').filter({hasText:'끝내기'}).click();
  await expect(page).toHaveURL(/#\/home$/);
  // The free timer runs: 따라 하기 does not start a second clock.
  await page.evaluate(() => VZ.freeTimer.start());
  await to(page, '#/practice-set?guide=' + encodeURIComponent('homework:a2'));
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator('.toast')).toContainText('타이머가 돌아가는 중이에요');
  expect(await seconds(page)).toBeNull();
  expect((await db(page)).practices.filter(p => p.dailySet)).toHaveLength(0);
});

test('음정 정확도: the video with the mic off, then 혼자 해 보기 opens the tuner on the chosen note; 음계 듣기 plays the scale; the mic closes when the page hides', async({page}) => {
  test.setTimeout(60000);
  await boot(page, {video:5});
  await page.evaluate(() => {
    VZ.practiceTips = () => ({tips:[{key:'into', name:'음정 정확도 연습', frequency:8, metric:'음정 오차', value:'±19.2 cent', minutes:10, range:'A#2~A5',
      steps:['기준음 듣고 따라 부르기', '5음계 상행·하행 (도레미파솔파미레도)', '고른 목표음을 4초 유지하며 튜너가 가운데에 오는지 확인해요']}]});
  });
  await to(page, '#/guided-practice/' + encodeURIComponent('analysis:into'));
  await expect(page).toHaveURL(/#\/practice-set$/);
  await expect(run(page).locator('[data-run-name] b')).toHaveText('다음 연습');
  await expect(run(page).locator('.dset-guide-next')).toHaveText('다음: 혼자 해 보기 · 음정 바늘 켜짐');
  await elapse(page, .1);
  await primary(page).click();
  await elapse(page, 6);
  expect(await page.evaluate(() => window.__gum)).toBe(0);
  // The video ended (100 % watched): the same step goes on as 혼자 해 보기.
  await expect(primary(page)).toHaveText('혼자 해 보기');
  await expect(run(page).locator('[data-guide-part="solo"]')).toHaveText('혼자 해 보기');
  await expect(run(page).locator('[data-guide-part="solo"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(run(page).getByRole('button', {name:'다 했어요'})).toBeVisible();
  await expect(run(page).locator('.dset-guide-lines li')).toHaveCount(3);
  const note = run(page).getByRole('combobox', {name:'기준음 높이'});
  await expect(note).toHaveValue('58');await expect(note.locator('option')).toHaveCount(3);
  const before = await seconds(page);
  await run(page).getByRole('button', {name:'음계 듣기'}).click();
  expect(await page.evaluate(() => window.__tones.length)).toBe(9);
  await run(page).getByRole('button', {name:'기준음 듣기'}).click();
  expect(await page.evaluate(() => window.__tones.at(-1))).toBeCloseTo(233.08, 1); // A#3
  await elapse(page, 3);
  expect(await seconds(page)).toBe(before);   // listening is not practice time
  await primary(page).click();
  await expect.poll(() => page.evaluate(() => window.__gum)).toBe(1);
  await elapse(page, 5);
  await expect(run(page).locator('[data-run-word]')).toHaveText('딱 맞아요');
  await expect(run(page).locator('[data-guide-tuner]')).toHaveClass(/is-on/);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate(() => window.__micStopped)).toBe(1);
  await expect(primary(page)).toHaveText('계속하기');
  // Finished and saved: the recommendation counts as done today in 다음 연습.
  await run(page).getByRole('button', {name:'다 했어요'}).click();
  await page.locator('.pset-summary [data-save]').click();
  await expect(page.locator('.pset-done')).toBeVisible();
  const row = (await db(page)).practices.find(p => p.dailySet);
  expect(row.dailySet.items[0]).toMatchObject({id:'guide:analysis:into', source:'practice-tip', state:'done', mode:'guide', mic:true});
  expect(row.completed).toEqual([]);
});

test('a range written in the homework offers 기준음 듣기 (no timer for listening); AI rhythm opens a 75 BPM metronome that stops on hiding and leaving', async({page}) => {
  test.setTimeout(60000);
  await boot(page);
  await page.evaluate(() => {
    window.__metro = [];const Base = window.AudioContext;
    window.AudioContext = class extends Base {createOscillator() {const o = super.createOscillator(), start = o.start.bind(o);o.start = t => {window.__metro.push(o.frequency.value);start(t);};return o;}};
  });
  await to(page, '#/practice-set?guide=' + encodeURIComponent('homework:a3'));
  const note = run(page).getByRole('combobox', {name:'기준음 높이'});
  await expect(note).toHaveValue('63');
  await run(page).getByRole('button', {name:'기준음 듣기'}).click();
  expect(await page.evaluate(() => window.__tones.at(-1))).toBeCloseTo(311.127, 2); // D#4
  await expect(time(page)).toHaveText('연습 시간 0:00');
  await run(page).locator('[data-run-exit]').click();
  expect(await seconds(page)).toBeNull();
  await page.evaluate(() => VZ.change(d => {d.practicePlans.push({id:'rhythm-test', period:'ai-exercise', songId:'s1', tip:{name:'두 구절 리듬 연결 연습', reason:'리듬을 따로 확인해요.', steps:['메트로놈 70~80 BPM에 맞춰 박수 치기', '두 구절 연결하기'], minutes:5}});}, {silent:true}));
  await to(page, '#/guided-practice/ai:rhythm-test?song=s1');
  await expect(page).toHaveURL(/#\/practice-set$/);
  const panel = run(page).getByRole('region', {name:'메트로놈'});
  await expect(panel).toBeVisible();
  await expect(run(page).getByRole('spinbutton', {name:'메트로놈 BPM'})).toHaveValue('75');
  await run(page).getByRole('button', {name:'BPM 5 높이기'}).click();await expect(run(page).locator('[data-bpm]')).toHaveValue('80');
  await run(page).getByRole('button', {name:'BPM 5 낮추기'}).click();
  const sounds = () => page.evaluate(() => window.__metro.length);
  await page.evaluate(() => {window.__metro.length = 0;});
  await elapse(page, 1);
  expect(await sounds()).toBe(0);
  await run(page).getByRole('button', {name:'메트로놈 켜기'}).click();
  await expect(run(page).locator('[data-metronome]')).toHaveAttribute('aria-pressed', 'true');
  await elapse(page, 1);
  expect(await sounds()).toBeGreaterThanOrEqual(2);
  await expect(time(page)).toHaveText('연습 시간 0:00');   // the metronome alone is not practice time
  await run(page).locator('[data-meter]').selectOption('3');await expect(run(page).locator('[data-beat]')).toHaveCount(3);
  await hide(page, true);
  await expect(run(page).locator('[data-metronome]')).toHaveAttribute('aria-pressed', 'false');
  let n = await sounds();await elapse(page, 1);expect(await sounds()).toBe(n);
  await hide(page, false);
  await run(page).getByRole('button', {name:'메트로놈 켜기'}).click();
  await primary(page).click();
  await elapse(page, 3);
  await expect(time(page)).toHaveText('연습 시간 0:03');
  await to(page, '#/home');
  n = await sounds();await elapse(page, 1);expect(await sounds()).toBe(n);
});
