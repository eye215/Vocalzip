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

async function open(page, {tracks = [], canRecord = true, mrSeconds = 0.4} = {}) {
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
      const el = new Audio(); let ready = null;
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
  }, {tracks, canRecord, wav:wav(mrSeconds)});
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
  expect((await bar.boundingBox()).height).toBeLessThanOrEqual(60);
  for (const b of await bar.getByRole('button').all()) expect(Math.round((await b.boundingBox()).height)).toBeGreaterThanOrEqual(44);
});

test('재생 shrinks to a floating chip with the time; ⏸ brings the bar back and ■ stops', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], mrSeconds:6});
  const before = await page.locator('#stage').boundingBox();
  await button(bar, '재생').click();
  await expect(bar).toHaveClass(/is-live/);
  await expect(bar.getByRole('timer')).toBeVisible();
  await expect(bar).toHaveCSS('position', 'absolute');
  // The score takes the bar's room while the chip floats over it.
  expect((await page.locator('#stage').boundingBox()).height).toBeGreaterThan(before.height + 30);
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
