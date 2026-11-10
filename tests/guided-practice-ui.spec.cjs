const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot}=require('./helpers/r2-fixture.cjs');

test('guided YouTube playback survives background refresh and only practice buttons control it',async({page})=>{
 await page.addInitScript(()=>{
  window.YT={PlayerState:{ENDED:0,PLAYING:1,PAUSED:2},Player:function(id,config){
   const iframe=document.createElement('iframe');document.getElementById(id).replaceWith(iframe);
   let state=2,time=0,timer;
   const player={getIframe:()=>iframe,getDuration:()=>5,getCurrentTime:()=>time,getPlayerState:()=>state,
    playVideo:()=>{state=1;config.events.onStateChange({data:state,target:player});clearInterval(timer);timer=setInterval(()=>{time++;if(time>=5){clearInterval(timer);state=0;config.events.onStateChange({data:state,target:player})}},1000)},
    pauseVideo:()=>{clearInterval(timer);state=2;config.events.onStateChange({data:state,target:player})},
    seekTo:n=>{time=n},destroy:()=>{clearInterval(timer);iframe.remove()}};
   window.__guidedPlayer=player;window.__guidedVars=config.playerVars;
   setTimeout(()=>config.events.onReady({target:player}),0);
   return player;
  }};
 });
 await boot(page);
 await page.evaluate(()=>window.VZ.change(d=>d.assignments.push({id:'guided-test',title:'롱톤 5초',status:'active',songId:'s1'}),{silent:true}));
 await page.evaluate(()=>window.VZ.nav('#/guided-practice/homework:guided-test'));
 const start=page.getByRole('button',{name:'영상 재생'});
 await expect(start).toBeEnabled();
 expect(await page.evaluate(()=>window.__guidedVars)).toMatchObject({controls:0,disablekb:1,fs:0,playsinline:1});
 const iframe=page.locator('.gp-video iframe');
 await expect(iframe).toHaveCSS('pointer-events','none');
 await expect(iframe).toHaveAttribute('tabindex','-1');
 await expect(page.locator('.gp-actions')).toHaveCSS('position','fixed');
 await expect(page.getByRole('button',{name:'연습 끝내기'})).toBeHidden();
 await start.click();
 await expect(page.getByRole('button',{name:'영상 재생 중'})).toBeDisabled();
 expect(await page.evaluate(()=>window.__guidedPlayer.getPlayerState())).toBe(1);
 const oldFrame=await iframe.evaluate(node=>{node.dataset.testId='original';return node.dataset.testId});
 expect(oldFrame).toBe('original');
 await page.evaluate(()=>window.VZ.softRender());
 await expect(iframe).toHaveAttribute('data-test-id','original');
 await expect(page.getByRole('button',{name:'영상 재생 중'})).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;});
 await expect(page.getByRole('button',{name:'영상 이어 듣기'})).toBeEnabled();
 expect(await page.evaluate(()=>window.__guidedPlayer.getPlayerState())).toBe(2);
 await page.getByRole('button',{name:'영상 이어 듣기'}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await expect(page.getByRole('button',{name:'영상 이어 듣기'})).toBeEnabled();
 expect(await page.evaluate(()=>window.__guidedPlayer.getPlayerState())).toBe(2);
 const pausedTime=await page.evaluate(()=>window.__guidedPlayer.getCurrentTime());
 await page.waitForTimeout(1100);
 expect(await page.evaluate(()=>window.__guidedPlayer.getCurrentTime())).toBe(pausedTime);
 await page.getByRole('button',{name:'영상 이어 듣기'}).click();
 await expect(page.getByRole('button',{name:'연습 끝내기'})).toBeVisible({timeout:10000});
 await page.getByRole('button',{name:'연습 끝내기'}).click();
 await expect(page.getByText('모든 단계를 마쳤어요')).toBeVisible();
 expect(page.__errors).toEqual([]);
});

test('timer-only practice stops on backgrounding and leaving the page',async({page})=>{
 await boot(page);
 await page.evaluate(()=>window.VZ.change(d=>d.assignments.push({id:'timer-test',title:'호흡 연습',status:'active'}),{silent:true}));
 await page.evaluate(()=>window.VZ.nav('#/guided-practice/homework:timer-test'));
 await page.getByRole('button',{name:'연습 시작'}).click();
 await expect(page.getByRole('button',{name:'연습 종료'})).toBeVisible();
 await page.waitForTimeout(1150);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;});
 await expect(page.getByRole('button',{name:'다시 시작'})).toBeVisible();
 const stopped=await page.locator('.gp-timer strong').textContent();
 await page.waitForTimeout(1150);
 await expect(page.locator('.gp-timer strong')).toHaveText(stopped);
 await page.evaluate(()=>window.VZ.nav('#/home'));
 await expect(page.locator('.gp-screen')).toHaveCount(0);
 expect(page.__errors).toEqual([]);
});
