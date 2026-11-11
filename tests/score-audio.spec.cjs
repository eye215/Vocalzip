// Score viewer audio bar (app/score-audio.js): MR 재생 · 녹음 · MR+녹음 under the score page.
// Isolated page with a stand-in VZ; recording and R2 are replaced, so this is not iPhone or cloud verification.
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
  await page.setContent('<main><div class="score-ink-stage" id="stage">score</div></main>');
  await page.evaluate(({tracks, canRecord, wav}) => {
    window.__log = []; window.__saved = []; window.__sessions = [];
    navigator.audioSession = {type:'auto'};
    window.VzipAccountScope = {owner:'owner-1', beforeLeave:() => () => {}};
    const song = {id:'s1', title:'Defying Gravity', show:'Wicked', mrTracks:tracks};
    window.VZ = {
      esc:x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])),
      song:id => id === 's1' ? song : null, songTitle:id => id === 's1' ? song.title : '', songLabel:s => s ? s.title + ' — ' + s.show : '',
      today:() => '2026-11-11', uid:() => 'id-' + Math.random().toString(36).slice(2), clock:s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'),
      toast:m => window.__log.push('toast:' + m), confirm:async () => true,
      media:{
        canRecord:() => canRecord,
        player:() => ({destroy(){}}),
        saveBlob:async item => { window.__saved.push({...item, blob:item.blob.size}); return item; },
        capture:async () => {
          window.__log.push('capture-open:' + navigator.audioSession.type);
          const session = {started:false, stopped:false, cancelled:false,
            start(){ this.started = true; window.__log.push('capture-start'); },
            async stop(){ this.stopped = true; window.__log.push('capture-stop'); return {blob:new Blob(['take'], {type:'audio/mp4'}), type:'audio/mp4', durationSeconds:3.2, waveform:[.1, .2], accountOwner:'owner-1', releaseProtection:() => window.__log.push('released')}; },
            cancel(){ this.cancelled = true; }};
          window.__sessions.push(session); return session;
        }
      }
    };
    window.VzipR2 = {url:async key => { window.__log.push('sign:' + key); return wav; }};
    const realPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(){ window.__log.push('mr-play'); return realPlay.call(this); };
  }, {tracks, canRecord, wav});
  await page.addStyleTag({path:path.join(__dirname, '..', 'app', 'score-ink.css')});
  await page.addScriptTag({path:path.join(__dirname, '..', 'app', 'score-audio.js')});
  await page.evaluate(() => { window.__bar = window.VzipScoreAudio.mount(document.getElementById('stage'), {songId:'s1'}); });
  return page.locator('[data-score-audio]');
}
const FILE = {id:'mr-file', kind:'file', title:'Gravity MR', r2Key:'u/owner-1/mr-file/original.m4a', type:'audio/mp4'};
const TUBE = {id:'mr-tube', kind:'youtube', title:'유튜브 반주', videoId:'abcdefghijk', url:'https://www.youtube.com/watch?v=abcdefghijk'};

test('the bar sits right under the score with MR 재생, 녹음 and MR+녹음', async ({page}) => {
  const bar = await open(page, {tracks:[FILE, TUBE]});
  expect(await page.evaluate(() => document.getElementById('stage').nextElementSibling?.hasAttribute('data-score-audio'))).toBe(true);
  await expect(bar.getByRole('button')).toHaveText(['MR 재생', '녹음', 'MR+녹음']);
  for (const b of await bar.getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // A file MR is chosen first because it can also be recorded with.
  await expect(bar.getByLabel('MR 선택')).toHaveValue('mr-file');
});

test('MR 재생 plays the song MR file and stops on a second tap', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  await bar.getByRole('button', {name:'MR 재생'}).click();
  await expect(bar.getByRole('button', {name:'MR 정지'})).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__log)).toEqual(expect.arrayContaining(['sign:' + FILE.r2Key, 'mr-play']));
  // Recording buttons wait while the MR plays alone.
  await expect(bar.getByRole('button', {name:'녹음',exact:true})).toBeDisabled();
  await bar.getByRole('button', {name:'MR 정지'}).click();
  await expect(bar.getByRole('button', {name:'MR 재생'})).toHaveAttribute('aria-pressed', 'false');
});

test('녹음 records, previews and saves a recording of the song only when saved', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  await bar.getByRole('button', {name:'녹음',exact:true}).click();
  await expect(bar.getByRole('button', {name:'녹음 정지'})).toBeVisible();
  await expect(bar.getByRole('timer')).toBeVisible();
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('play-and-record');
  await bar.getByRole('button', {name:'녹음 정지'}).click();
  await expect(bar.locator('[data-score-audio-review]')).toBeVisible();
  expect(await page.evaluate(() => window.__saved.length)).toBe(0);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('auto');
  await expect(bar.locator('[data-score-audio-name]')).toHaveValue(/^Defying Gravity 녹음 /);
  await bar.locator('[data-score-audio-name]').fill('2절 고음 연습');
  await bar.getByRole('button', {name:'저장'}).click();
  await expect(bar.locator('[data-score-audio-review]')).toBeHidden();
  const [item] = await page.evaluate(() => window.__saved);
  expect(item).toMatchObject({name:'2절 고음 연습', songId:'s1', song:'Defying Gravity — Wicked', recordingCategory:'song', source:'practice', origin:'score', type:'audio/mp4', durationSeconds:3.2, accountOwner:'owner-1'});
  expect(item.withMr).toBeUndefined();
  expect(await page.evaluate(() => window.__log)).toContain('released');
});

test('MR+녹음 opens the microphone first, starts the MR with the take, and stops when the MR ends', async ({page}) => {
  const bar = await open(page, {tracks:[FILE]});
  await bar.getByRole('button', {name:'MR+녹음'}).click();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('이어폰');
  // The 0.4 s MR ends by itself and the take is ready to review without a second tap.
  await expect(bar.locator('[data-score-audio-review]')).toBeVisible({timeout:5000});
  const log = await page.evaluate(() => window.__log);
  expect(log.indexOf('capture-open:play-and-record')).toBeGreaterThanOrEqual(0);
  expect(log.indexOf('capture-start')).toBeLessThan(log.indexOf('mr-play'));
  expect(log.indexOf('mr-play')).toBeLessThan(log.indexOf('capture-stop'));
  await expect(bar.locator('[data-score-audio-name]')).toHaveValue(/MR 녹음/);
  await bar.getByRole('button', {name:'저장'}).click();
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
  expect((await page.evaluate(() => window.__saved))[0].withMr).toEqual({id:'mr-file', title:'Gravity MR'});
});

test('a YouTube MR plays in place but cannot be recorded with; no MR disables the MR buttons', async ({page}) => {
  let bar = await open(page, {tracks:[TUBE]});
  await expect(bar.getByRole('button', {name:'MR+녹음'})).toBeDisabled();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('업로드한 MR 파일');
  await bar.getByRole('button', {name:'MR 재생'}).click();
  await expect(bar.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/abcdefghijk/);
  await expect(bar.getByRole('button', {name:'녹음',exact:true})).toBeDisabled();
  bar = await open(page, {tracks:[]});
  await expect(bar).toContainText('MR 없음');
  await expect(bar.getByRole('button', {name:'MR 재생'})).toBeDisabled();
  await expect(bar.getByRole('button', {name:'MR+녹음'})).toBeDisabled();
  await expect(bar.getByRole('button', {name:'녹음',exact:true})).toBeEnabled();
});

test('closing the score keeps a take that was still recording or not yet saved', async ({page}) => {
  let bar = await open(page, {tracks:[FILE]});
  await bar.getByRole('button', {name:'녹음',exact:true}).click();
  await expect(bar.getByRole('button', {name:'녹음 정지'})).toBeVisible();
  await page.evaluate(() => window.__bar.destroy());
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
  expect((await page.evaluate(() => window.__saved))[0]).toMatchObject({songId:'s1', origin:'score'});
  await expect(page.locator('[data-score-audio]')).toHaveCount(0);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('auto');

  bar = await open(page, {tracks:[FILE]});
  await bar.getByRole('button', {name:'녹음',exact:true}).click();
  await bar.getByRole('button', {name:'녹음 정지'}).click();
  await expect(bar.locator('[data-score-audio-review]')).toBeVisible();
  await page.evaluate(() => window.__bar.destroy());
  await expect.poll(() => page.evaluate(() => window.__saved.length)).toBe(1);
});

test('a browser without recording keeps MR playback and explains why recording is off', async ({page}) => {
  const bar = await open(page, {tracks:[FILE], canRecord:false});
  await expect(bar.getByRole('button', {name:'녹음',exact:true})).toBeDisabled();
  await expect(bar.getByRole('button', {name:'MR+녹음'})).toBeDisabled();
  await expect(bar.getByRole('button', {name:'MR 재생'})).toBeEnabled();
  await expect(bar.locator('[data-score-audio-hint]')).toContainText('녹음을 지원하지 않아요');
});
