// Score viewer audio bar (app/score-audio.js): 재생 · 녹음 · 재생+녹음 under the score. While playing/recording it
// shrinks to a floating chip; ⏸/■ pause/stop the MR and the take together and bring the bar back.
// Isolated page with a stand-in VZ; recording and R2 are replaced, so this is not iPhone or cloud verification.
const {test, expect} = require('@playwright/test');
const path = require('node:path');

// 0.4 s silent WAV used as the MR file, so "MR ended" happens quickly; a 6 s one for pause/stop flows.
const wav = seconds => {
  const sr = 8000, n = Math.round(sr * seconds), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return 'data:audio/wav;base64,' + b.toString('base64');
};

async function open(page, {tracks = [], canRecord = true, mrSeconds = 0.4, url = ''} = {}) {
  await page.goto('about:blank');
  await page.setContent('<main class="score-ink-editor" style="position:relative;display:flex;flex-direction:column;width:358px;height:600px"><div class="score-ink-stage" id="stage" style="flex:1">score</div></main>');
  await page.evaluate(({tracks, canRecord, wav}) => {
    window.__log = []; window.__saved = [];
    navigator.audioSession = {type:'auto'};
    window.VzipAccountScope = {owner:'owner-1', beforeLeave:() => () => {}};
    window.VzipR2 = {url:async key => { window.__log.push('sign:' + key); return wav; }};
    const song = {id:'s1', title:'Defying Gravity', show:'Wicked', mrTracks:tracks};
    // Stand-in for the shared player (M.player): an <audio> with load/play/pause/seek/destroy.
    const player = (host, item) => {
      host.innerHTML = '<div class="player"><button type="button" class="player-btn" data-play aria-label="재생">▶</button></div>';
      const el = new Audio(); let ready = null; window.__lastSrc = () => el.src;
      const api = {el, item,
        load:() => ready ||= (item.blob ? Promise.resolve(URL.createObjectURL(item.blob)) : window.VzipR2.url(item.r2Key)).then(u => { el.src = u; }),
        play:() => api.load().then(() => { window.__log.push('play:' + item.id); return el.play(); }),
        pause:() => { if (!el.paused) window.__log.push('pause:' + item.id); el.pause(); },
        seek:t => { el.currentTime = t; }, destroy:() => { el.pause(); window.__log.push('destroy:' + item.id); }};
      window.__log.push('player:' + item.id);
      return api;
    };
    window.VZ = {
      esc:x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])),
      song:id => id === 's1' ? song : null, songTitle:id => id === 's1' ? song.title : '', songLabel:s => s ? s.title + ' — ' + s.show : '',
      today:() => '2026-11-11', uid:() => 'id-' + Math.random().toString(36).slice(2), clock:s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'),
      toast:m => window.__log.push('toast:' + m), confirm:async () => true,
      media:{
        canRecord:() => canRecord, player,
        saveBlob:async item => { window.__saved.push({...item, blob:item.blob.size}); return item; },
        capture:async () => {
          window.__log.push('capture-open:' + navigator.audioSession.type);
          let state = 'inactive';
          return {start(){ state = 'recording'; window.__log.push('capture-start'); },
            pause(){ state = 'paused'; window.__log.push('capture-pause'); }, resume(){ state = 'recording'; window.__log.push('capture-resume'); },
            seconds:() => 2.5, get state(){ return state; },
            async stop(){ window.__log.push('capture-stop'); return {blob:new Blob(['take'], {type:'audio/mp4'}), type:'audio/mp4', durationSeconds:3.2, waveform:[.1, .2], accountOwner:'owner-1', releaseProtection:() => window.__log.push('released')}; },
            cancel(){ window.__log.push('capture-cancel'); }};
        }
      }
    };
  }, {tracks, canRecord, wav:url || wav(mrSeconds)});
  await page.addStyleTag({path:path.join(__dirname, '..', 'app', 'score-ink.css')});
  await page.addScriptTag({path:path.join(__dirname, '..', 'app', 'score-audio.js')});
  await page.evaluate(() => { window.__bar = window.VzipScoreAudio.mount(document.getElementById('stage'), {songId:'s1'}); });
  return page.locator('[data-score-audio]');
}
const log = page => page.evaluate(() => window.__log);
const FILE = {id:'mr-file', kind:'file', title:'Gravity MR', r2Key:'u/owner-1/mr-file/original.m4a', type:'audio/mp4'};
const TUBE = {id:'mr-tube', kind:'youtube', title:'유튜브 반주', videoId:'abcdefghijk', url:'https://www.youtube.com/watch?v=abcdefghijk'};
const button = (bar, name) => bar.getByRole('button', {name, exact:true});

test('one row under the score: 재생, 녹음 and 재생+녹음, each a 44px tap', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  expect(await page.evaluate(() => document.getElementById('stage').nextElementSibling?.hasAttribute('data-score-audio'))).toBe(true);
  await expect(bar.getByRole('button')).toHaveText(['재생', '녹음', '재생+녹음']);
  expect((await bar.boundingBox()).height).toBeLessThanOrEqual(46);   // a thin band: the score keeps its room
  for (const b of await bar.getByRole('button').all()) expect(Math.round((await b.boundingBox()).height)).toBeGreaterThanOrEqual(44);
});

test('재생 shrinks to a floating chip with the time; ⏸ brings the bar back and ■ stops', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], mrSeconds:6});
  const before = await page.locator('#stage').boundingBox();
  await button(bar, '재생').click();
  await expect(bar).toHaveClass(/is-live/);
  await expect(bar.getByRole('timer')).toBeVisible();
  // One thin strip under the score: it never lies over the page, and its controls are still 44px boxes.
  const live = await bar.boundingBox(), stage = await page.locator('#stage').boundingBox();
  expect(live.height).toBeLessThanOrEqual(46);
  expect(live.y).toBeGreaterThanOrEqual(stage.y + stage.height - .5);
  expect(stage.height).toBeGreaterThanOrEqual(before.height - .5);
  for (const b of await bar.getByRole('button').all()) expect(Math.round((await b.boundingBox()).height)).toBeGreaterThanOrEqual(44);
  expect(await log(page)).toContain('play:mr-file');
  await button(bar, '일시정지').click();
  await expect(button(bar, '계속')).toBeVisible();
  expect(await log(page)).toContain('pause:mr-file');
  await expect(bar).not.toHaveClass(/is-live/);
  await button(bar, '계속').click();
  await expect(bar).toHaveClass(/is-live/);
  await button(bar, '정지').click();
  await expect(button(bar, '재생')).toBeVisible();
});

test('녹음 records, pauses and stops as one, then saves a recording of the song only when 저장 is pressed', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  await button(bar, '녹음').click();
  await expect(bar.getByRole('group', {name:'녹음 중'})).toBeVisible();
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('play-and-record');
  await button(bar, '일시정지').click();
  await expect(bar).toContainText('녹음 일시정지');
  expect(await log(page)).toContain('capture-pause');
  await button(bar, '계속').click();
  expect(await log(page)).toContain('capture-resume');
  await button(bar, '정지').click();
  await expect(button(bar, '저장')).toBeVisible();
  expect(await page.evaluate(() => window.__saved.length)).toBe(0);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('auto');
  await button(bar, '저장').click();
  await expect(button(bar, '녹음')).toBeVisible();
  const [item] = await page.evaluate(() => window.__saved);
  expect(item).toMatchObject({songId:'s1', song:'Defying Gravity — Wicked', recordingCategory:'song', source:'practice', origin:'score', type:'audio/mp4', durationSeconds:3.2, accountOwner:'owner-1'});
  expect(item.name).toMatch(/^Defying Gravity 녹음 /);
  expect(item.withMr).toBeUndefined();
});

test('재생+녹음: ⏸ pauses the MR and the take together, and the take ends with the MR', async ({page}) => {
  let bar = await open(page, {tracks:[FILE], mrSeconds:6});
  await button(bar, '재생+녹음').click();
  await expect(bar).toHaveClass(/is-live/);
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('이어폰');
  await expect.poll(() => log(page)).toContain('play:mr-file');
  await button(bar, '일시정지').click();
  let l = await log(page);
  expect(l).toContain('capture-pause'); expect(l).toContain('pause:mr-file');
  await button(bar, '정지').click();
  await expect(button(bar, '저장')).toBeVisible();

  bar = await open(page, {tracks:[FILE]});
  await button(bar, '재생+녹음').click();
  await expect(button(bar, '저장')).toBeVisible({timeout:5000}); // the 0.4 s MR ended
  l = await log(page);
  expect(l).toContain('capture-open:play-and-record');
  expect(l.indexOf('capture-start')).toBeLessThan(l.indexOf('play:mr-file'));
  expect(l.indexOf('play:mr-file')).toBeLessThan(l.indexOf('capture-stop'));
  await button(bar, '저장').click();
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
  expect((await page.evaluate(() => window.__saved))[0].withMr).toEqual({id:'mr-file', title:'Gravity MR'});
});

test('a YouTube MR opens in place but cannot be recorded with; no MR leaves only 녹음', async ({page}) => {
  let bar = await open(page, {tracks:[TUBE]});
  await expect(button(bar, '재생+녹음')).toBeDisabled();
  await button(bar, '재생').click();
  await expect(bar.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/abcdefghijk/);
  await button(bar, '재생').click();
  await expect(bar.locator('iframe')).toHaveCount(0);
  bar = await open(page, {tracks:[]});
  await expect(button(bar, '재생')).toBeDisabled();
  await expect(button(bar, '재생+녹음')).toBeDisabled();
  await expect(button(bar, '녹음')).toBeEnabled();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('레퍼런스 탭');
});

test('several MRs: a file MR is picked first and the choice switches the MR', async ({page}) => {
  const bar = await open(page, {tracks:[TUBE, FILE]});
  await expect(bar.getByLabel('MR 선택')).toHaveValue('mr-file');
  await bar.getByLabel('MR 선택').selectOption('mr-tube');
  await expect(button(bar, '재생+녹음')).toBeDisabled();
});

test('closing the score keeps a take that was still recording or not yet saved', async ({page}) => {
  let bar = await open(page, {tracks:[FILE]});
  await button(bar, '녹음').click();
  await expect(button(bar, '정지')).toBeVisible();
  await page.evaluate(() => window.__bar.destroy());
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
  expect((await page.evaluate(() => window.__saved))[0]).toMatchObject({songId:'s1', origin:'score'});
  await expect(page.locator('[data-score-audio]')).toHaveCount(0);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('auto');

  bar = await open(page, {tracks:[FILE]});
  await button(bar, '녹음').click();
  await button(bar, '정지').click();
  await expect(button(bar, '저장')).toBeVisible();
  await page.evaluate(() => window.__bar.destroy());
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
});

test('a browser without recording keeps MR playback and explains why recording is off', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], canRecord:false});
  await expect(button(bar, '녹음')).toBeDisabled();
  await expect(button(bar, '재생+녹음')).toBeDisabled();
  await expect(button(bar, '재생')).toBeEnabled();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('녹음을 지원하지 않아요');
});

// iPhone Safari starts sound only inside the tap. These tests stand in for a browser that refuses to start the MR
// (play() settles but the element stays paused, as the shared player reports a blocked start).
const blockPlay = page => page.evaluate(() => {
  const real = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__log.push(this.muted ? 'el-play:muted' : 'el-play:blocked'); return this.muted ? real.call(this) : Promise.resolve(); };
});
test('the MR address is fetched before any tap, and the file is unlocked inside the 재생+녹음 tap', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], mrSeconds:6});
  await expect.poll(() => log(page)).toContain('sign:' + FILE.r2Key);   // ready ahead of the tap
  await page.evaluate(() => { const real = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__log.push(this.muted ? 'el-play:muted' : 'el-play'); return real.call(this); }; });
  await button(bar, '재생+녹음').click();
  await expect.poll(() => log(page)).toContain('play:mr-file');
  const l = await log(page);
  expect(l.indexOf('el-play:muted')).toBeGreaterThan(-1);
  expect(l.indexOf('el-play:muted')).toBeLessThan(l.indexOf('capture-open:play-and-record'));   // before the microphone opens
  await button(bar, '정지').click();
});
test('재생 that the browser refused goes back to the bar and says so instead of pretending to play', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], mrSeconds:6});
  await expect.poll(() => log(page)).toContain('sign:' + FILE.r2Key);
  await blockPlay(page);
  await button(bar, '재생').click();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('MR 소리가 시작되지 않았어요');
  await expect(bar.locator('[data-score-audio-hint]')).toHaveAttribute('data-error', 'true');
  await expect(bar).not.toHaveClass(/is-live/);
  await expect(button(bar, '재생')).toBeEnabled();
});
test('a loop (이 구간 반복) that the browser refused goes back to the bar and says so', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], mrSeconds:6});
  await expect.poll(() => log(page)).toContain('sign:' + FILE.r2Key);
  await blockPlay(page);
  await page.evaluate(() => window.__bar.loop({label:'6–7마디', start:2, end:4, lead:1, occurrence:0, occurrences:1, next:null}, 'mr-file'));
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('MR 소리가 시작되지 않았어요');
  await expect(bar).not.toHaveClass(/is-live/); await expect(button(bar, '재생')).toBeEnabled();
});
test('재생+녹음 never records on without the MR: the empty take is thrown away and the reason shown', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], mrSeconds:6});
  await expect.poll(() => log(page)).toContain('sign:' + FILE.r2Key);
  await blockPlay(page);
  await button(bar, '재생+녹음').click();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('MR 소리가 시작되지 않아 녹음을 멈췄어요');
  const l = await log(page);
  expect(l).toContain('capture-start'); expect(l).toContain('capture-cancel'); expect(l).not.toContain('capture-stop');
  await expect(bar).not.toHaveClass(/is-live/);
  await expect(button(bar, '재생+녹음')).toBeEnabled();
  expect(await page.evaluate(() => [navigator.audioSession.type, window.__saved.length])).toEqual(['auto', 0]);
});
test('an ordinary-size file MR is fetched whole while the score is open and then plays from memory', async ({page}) => {
  const bytes = Buffer.from(wav(6).split(',')[1], 'base64');
  let hits = 0;
  await page.route('https://mr.test/**', route => { hits++; route.fulfill({status:200, contentType:'audio/wav', headers:{'access-control-allow-origin':'*'}, body:bytes}); });
  const bar = await open(page, {tracks:[{...FILE, size:bytes.length}], mrSeconds:6, url:'https://mr.test/mr.wav'});
  await expect.poll(() => page.evaluate(() => window.__lastSrc?.() || '')).toMatch(/^blob:/);
  expect(hits).toBeGreaterThan(0);
  await button(bar, '재생').click();
  await expect(bar).toHaveClass(/is-live/);
  await expect.poll(() => page.evaluate(() => window.__lastSrc())).toMatch(/^blob:/);   // still the copy in memory
  await button(bar, '정지').click();
  // A file without a known size, or a large one, keeps streaming.
  const big = await open(page, {tracks:[{...FILE, size:31 * 1024 * 1024}], mrSeconds:6, url:'https://mr.test/mr.wav'});
  await expect.poll(() => log(page)).toContain('sign:' + FILE.r2Key);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__lastSrc())).toBe('https://mr.test/mr.wav');
  await expect(button(big, '재생')).toBeEnabled();
});

// 표기의 기능 (app/score-sync.js hands the bar a plan through setPlan; rules in app/score-mark-model.js).
const withPlan = async (page, plan) => {
  await page.addScriptTag({path:path.join(__dirname, '..', 'app', 'score-mark-model.js')});
  await page.addStyleTag({path:path.join(__dirname, '..', 'app', 'score-sync.css')});
  await page.evaluate(plan => { window.__asked = []; window.__bar.setPlan({...plan, explain:() => window.__asked.push('explain'), open:() => window.__asked.push('open')}); }, plan);
};

test('재생 옵션: one more button in the same row, only for the MR file the plan is for', async ({page}) => {
  const bar = await open(page, {tracks:[FILE, TUBE], mrSeconds:6});
  const opts = bar.locator('[data-score-audio-opts]');
  const plan = {trackId:'mr-file', need:false, start:{label:'시작점 3마디에서', short:'3마디부터', time:2}, cuts:{on:true, note:'5마디 건너뜀', skips:[{start:3, end:4.5, label:'5마디'}]}};
  await withPlan(page, plan);
  await expect(bar.locator('.score-audio-row').getByRole('button')).toHaveText(['재생', '녹음', '재생+녹음', /^(3마디부터)?$/]);
  await expect(opts).toHaveAttribute('aria-label', '재생 옵션: 시작점 3마디에서, 컷 건너뛰기 켜짐'); await expect(opts).toHaveAttribute('data-lit', 'true');
  for (const b of await bar.locator('.score-audio-btn').all()) { const r = await b.boundingBox(); expect(Math.round(r.height)).toBeGreaterThanOrEqual(44); expect(Math.round(r.width)).toBeGreaterThanOrEqual(44); }
  expect(await bar.locator('.score-audio-btn').evaluateAll(list => list.every(b => b.scrollWidth <= b.clientWidth + 1))).toBe(true);
  expect(new Set(await bar.locator('.score-audio-btn').evaluateAll(list => list.map(b => Math.round(b.getBoundingClientRect().top)))).size).toBe(1); // still one row
  await opts.click();
  expect(await page.evaluate(() => window.__asked)).toEqual(['open']);
  // The same plan again changes nothing; a YouTube MR chosen: no button; a plan for another MR: no button.
  await page.evaluate(plan => window.__bar.setPlan(plan), plan);
  await bar.getByLabel('MR 선택').selectOption('mr-tube'); await expect(opts).toHaveCount(0);
  await bar.getByLabel('MR 선택').selectOption('mr-file'); await expect(opts).toHaveCount(1);
  await page.evaluate(plan => window.__bar.setPlan({...plan, trackId:'another'}), plan); await expect(opts).toHaveCount(0);
  // 처음부터 with 컷 건너뛰기 off: not lit.
  await withPlan(page, {...plan, start:{label:'처음부터', short:'', time:null}, cuts:{...plan.cuts, on:false, note:'꺼짐'}});
  await expect(opts).toHaveAttribute('aria-label', '재생 옵션: 처음부터, 컷 건너뛰기 꺼짐'); await expect(opts).toHaveAttribute('data-lit', 'false'); await expect(opts).toHaveText('');
  // Not matched yet: the button only explains, and 재생 does what it always did.
  await withPlan(page, {trackId:'mr-file', need:true, start:{label:'시작점'}, cuts:{on:false, note:''}});
  await expect(opts).toHaveAttribute('data-need', ''); await expect(opts).toHaveAttribute('aria-label', '재생 옵션');
  await opts.click();
  expect(await page.evaluate(() => window.__asked)).toEqual(['explain']);
  await page.evaluate(() => window.__bar.setPlan(null)); await expect(opts).toHaveCount(0);
  await expect(bar.getByRole('button')).toHaveText(['재생', '녹음', '재생+녹음']);
});

test('재생+녹음 with a 시작점 and a cut: the take notes where the MR began and what it jumped over', async ({page, browserName}) => {
  test.skip(browserName === 'webkit', 'plays the MR: real audio playback and seeking are checked in Chromium');
  const bar = await open(page, {tracks:[FILE], mrSeconds:6});
  await withPlan(page, {trackId:'mr-file', need:false, start:{label:'시작점 3마디에서', time:2}, cuts:{on:true, note:'5마디 건너뜀', skips:[{start:3, end:4.5, label:'5마디'}]}});
  const started = Date.now();
  await button(bar, '재생+녹음').click();
  await expect(bar).toHaveClass(/is-live/);
  await expect(bar.locator('[data-score-audio-hint]')).toHaveText('이어폰을 끼면 MR이 녹음에 섞이지 않아요. 컷 5마디 건너뜀.');
  // 2 → 3 s, the jump to 4.5 s, then to the end at 6 s: about 2.5 s instead of 4.
  await expect(button(bar, '저장')).toBeVisible({timeout:8000});
  const took = (Date.now() - started) / 1000; expect(took).toBeGreaterThan(2); expect(took).toBeLessThan(3.9);
  await button(bar, '저장').click();
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
  const {withMr} = (await page.evaluate(() => window.__saved))[0];
  expect(withMr).toMatchObject({id:'mr-file', title:'Gravity MR', from:2});
  expect(withMr.skipped).toHaveLength(1);
  expect(withMr.skipped[0][0]).toBeGreaterThan(2.9); expect(withMr.skipped[0][0]).toBeLessThan(3.2); expect(withMr.skipped[0][1]).toBe(4.5);
  // 컷 건너뛰기 off and 처음부터: the take is noted as before (the MR ran from its beginning).
  await withPlan(page, {trackId:'mr-file', need:false, start:{label:'처음부터', time:null}, cuts:{on:false, note:'꺼짐', skips:[{start:3, end:4.5, label:'5마디'}]}});
  await button(bar, '재생+녹음').click();
  await expect(bar.locator('[data-score-audio-hint]')).toHaveText('이어폰을 끼면 MR이 녹음에 섞이지 않아요.');
  await button(bar, '정지').click(); await expect(button(bar, '저장')).toBeVisible();
  await button(bar, '저장').click();
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(2);
  expect((await page.evaluate(() => window.__saved))[1].withMr).toEqual({id:'mr-file', title:'Gravity MR'});
});
