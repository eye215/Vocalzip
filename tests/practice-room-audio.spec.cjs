const {test,expect}=require('@playwright/test');

test('practice room restores playback after recording and the captured voice plays',async({page,browserName})=>{
 test.skip(browserName==='webkit','Synthetic microphone capture is exercised in Chromium');
 await page.goto('/practice-room/index.html');
 await page.evaluate(()=>{
  const states=[];
  Object.defineProperty(navigator,'audioSession',{configurable:true,value:{set type(value){states.push(value);},get type(){return states.at(-1);}}});
  window.__audioStates=states;
 });
 await page.locator('[data-task="tone"]').click();
 await page.locator('#play-reference').click();
 await expect(page.locator('#play-reference')).toHaveText('재생 정지');
 await expect.poll(()=>page.evaluate(()=>navigator.audioSession.type)).toBe('playback');
 await page.locator('[data-action="record"]').click();
 await expect.poll(()=>page.evaluate(()=>navigator.audioSession.type)).toBe('play-and-record');
 await expect(page.locator('#rec-time')).toBeVisible();
 await page.waitForTimeout(800);
 await page.locator('[data-action="record"]').click();
 const player=page.locator('audio[data-audio="0"]');
 await expect(player).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>navigator.audioSession.type)).toBe('playback');
 const audio=await player.evaluate(async el=>{
  const blob=await (await fetch(el.src)).blob();
  const data=await (new AudioContext()).decodeAudioData(await blob.arrayBuffer());
  const samples=data.getChannelData(0);let peak=0;
  for(let i=0;i<samples.length;i+=32)peak=Math.max(peak,Math.abs(samples[i]));
  return {duration:data.duration,peak,src:el.src};
 });
 expect(audio.duration).toBeGreaterThan(.2);
 expect(audio.peak).toBeGreaterThan(.001);
 expect(audio.src).toMatch(/^blob:/);
 await player.evaluate(el=>el.play());
 await expect.poll(()=>player.evaluate(el=>el.currentTime)).toBeGreaterThan(.1);
});
