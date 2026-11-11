// Score viewer audio bar (app/score-audio.js): one compact row under the score — MR in the shared inline player,
// 녹음 and MR+녹음. Isolated page with a stand-in VZ; recording and R2 are replaced, so this is not iPhone or cloud
// verification.
const {test, expect} = require('@playwright/test');
const path = require('node:path');

// 0.4 s silent WAV used as the MR file, so "MR ended" happens quickly.
const wav = (() => {
  const sr = 8000, n = Math.round(sr * 0.4), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return 'data:audio/wav;base64,' + b.toString('base64');
})();

async function open(page, {tracks = [], canRecord = true} = {}) {
  await page.goto('about:blank');
  await page.setContent('<main style="width:358px"><div class="score-ink-stage" id="stage">score</div></main>');
  await page.evaluate(({tracks, canRecord, wav}) => {
    window.__log = []; window.__saved = [];
    navigator.audioSession = {type:'auto'};
    window.VzipAccountScope = {owner:'owner-1', beforeLeave:() => () => {}};
    window.VzipR2 = {url:async key => { window.__log.push('sign:' + key); return wav; }};
    const song = {id:'s1', title:'Defying Gravity', show:'Wicked', mrTracks:tracks};
    // Stand-in for the shared inline player (M.player): play button, <audio>, load/play/pause/seek/destroy.
    const player = (host, item) => {
      host.innerHTML = '<div class="player"><div class="player-row"><button type="button" class="player-btn" data-play aria-label="재생">▶</button><span class="time">0:00</span></div></div>';
      const el = new Audio(); let ready = null;
      const api = {el, item,
        load:() => ready ||= (item.blob ? Promise.resolve(URL.createObjectURL(item.blob)) : window.VzipR2.url(item.r2Key)).then(u => { el.src = u; }),
        play:() => api.load().then(() => { window.__log.push('play:' + item.id); return el.play(); }),
        pause:() => { if (!el.paused) window.__log.push('pause:' + item.id); el.pause(); },
        seek:t => { el.currentTime = t; }, destroy:() => { el.pause(); window.__log.push('destroy:' + item.id); }};
      host.querySelector('[data-play]').onclick = () => el.paused ? api.play() : api.pause();
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
          return {start(){ window.__log.push('capture-start'); },
            async stop(){ window.__log.push('capture-stop'); return {blob:new Blob(['take'], {type:'audio/mp4'}), type:'audio/mp4', durationSeconds:3.2, waveform:[.1, .2], accountOwner:'owner-1', releaseProtection:() => window.__log.push('released')}; },
            cancel(){ window.__log.push('capture-cancel'); }};
        }
      }
    };
  }, {tracks, canRecord, wav});
  await page.addStyleTag({path:path.join(__dirname, '..', 'app', 'score-ink.css')});
  await page.addScriptTag({path:path.join(__dirname, '..', 'app', 'score-audio.js')});
  await page.evaluate(() => { window.__bar = window.VzipScoreAudio.mount(document.getElementById('stage'), {songId:'s1'}); });
  return page.locator('[data-score-audio]');
}
const log = page => page.evaluate(() => window.__log);
const FILE = {id:'mr-file', kind:'file', title:'Gravity MR', r2Key:'u/owner-1/mr-file/original.m4a', type:'audio/mp4'};
const TUBE = {id:'mr-tube', kind:'youtube', title:'유튜브 반주', videoId:'abcdefghijk', url:'https://www.youtube.com/watch?v=abcdefghijk'};
const button = (bar, name) => bar.getByRole('button', {name, exact:true});

test('one compact row under the score: the MR in the shared player, 녹음 and MR+녹음', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  expect(await page.evaluate(() => document.getElementById('stage').nextElementSibling?.hasAttribute('data-score-audio'))).toBe(true);
  await expect(bar.getByRole('button')).toHaveText(['▶', '녹음', 'MR+녹음']);
  expect(await log(page)).toContain('player:mr-file');
  expect((await bar.boundingBox()).height).toBeLessThanOrEqual(60);
  for (const b of await bar.locator('.score-audio-btn').all()) expect(Math.round((await b.boundingBox()).height)).toBeGreaterThanOrEqual(44);
});

test('녹음 records and saves a recording of the song only when 저장 is pressed', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  await button(bar, '녹음').click();
  await expect(bar.getByRole('timer')).toBeVisible();
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('play-and-record');
  await button(bar, '정지').click();
  await expect(button(bar, '저장')).toBeVisible();
  await expect(button(bar, '버리기')).toBeVisible();
  expect(await page.evaluate(() => window.__saved.length)).toBe(0);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('auto');
  await button(bar, '저장').click();
  await expect(button(bar, '녹음')).toBeVisible();
  const [item] = await page.evaluate(() => window.__saved);
  expect(item).toMatchObject({songId:'s1', song:'Defying Gravity — Wicked', recordingCategory:'song', source:'practice', origin:'score', type:'audio/mp4', durationSeconds:3.2, accountOwner:'owner-1'});
  expect(item.name).toMatch(/^Defying Gravity 녹음 /);
  expect(item.withMr).toBeUndefined();
  expect(await log(page)).toContain('released');
});

test('버리기 drops the take without saving', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  await button(bar, '녹음').click();
  await button(bar, '정지').click();
  await button(bar, '버리기').click();
  await expect(button(bar, '녹음')).toBeVisible();
  expect(await page.evaluate(() => window.__saved.length)).toBe(0);
});

test('MR+녹음 opens the microphone first, starts the MR from the top with the take, and stops when the MR ends', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  await button(bar, 'MR+녹음').click();
  await expect(bar).toContainText('Gravity MR + 녹음');
  // The 0.4 s MR ends by itself and the take is ready without a second tap.
  await expect(button(bar, '저장')).toBeVisible({timeout:5000});
  const l = await log(page);
  expect(l).toContain('capture-open:play-and-record');
  expect(l.indexOf('capture-start')).toBeLessThan(l.indexOf('play:mr-file'));
  expect(l.indexOf('play:mr-file')).toBeLessThan(l.indexOf('capture-stop'));
  await button(bar, '저장').click();
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
  const [item] = await page.evaluate(() => window.__saved);
  expect(item.withMr).toEqual({id:'mr-file', title:'Gravity MR'});
  expect(item.name).toMatch(/MR 녹음/);
});

test('a YouTube MR opens in place but cannot be recorded with; no MR leaves only 녹음', async ({page}) => {
  let bar = await open(page, {tracks:[TUBE]});
  await expect(button(bar, 'MR+녹음')).toBeDisabled();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('업로드한 MR 파일');
  await button(bar, '유튜브 MR').click();
  await expect(bar.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/abcdefghijk/);
  await button(bar, '유튜브 MR').click();
  await expect(bar.locator('iframe')).toHaveCount(0);
  bar = await open(page, {tracks:[]});
  await expect(bar).toContainText('MR 없음');
  await expect(button(bar, 'MR+녹음')).toBeDisabled();
  await expect(button(bar, '녹음')).toBeEnabled();
});

test('several MRs: a file MR is picked first and the choice switches the player', async ({page}) => {
  const bar = await open(page, {tracks:[TUBE, FILE]});
  await expect(bar.getByLabel('MR 선택')).toHaveValue('mr-file');
  await bar.getByLabel('MR 선택').selectOption('mr-tube');
  await expect(button(bar, '유튜브 MR')).toBeVisible();
  expect(await log(page)).toContain('destroy:mr-file');
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
  await expect(button(bar, 'MR+녹음')).toBeDisabled();
  await expect(bar.locator('[data-play]')).toBeEnabled();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('녹음을 지원하지 않아요');
});
