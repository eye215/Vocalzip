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

test('only a step with an explicit range offers a playable reference tone',async({page})=>{
 await page.addInitScript(()=>{
  window.__tone={starts:0,stops:0,frequency:0};
  window.AudioContext=class{
   state='running';currentTime=0;destination={};resume(){return Promise.resolve()}close(){return Promise.resolve()}
   createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}
   createOscillator(){const tone=window.__tone;return {type:'',frequency:{set value(v){tone.frequency=v}},connect(gain){return gain},start(){tone.starts++},stop(){tone.stops++},disconnect(){}}}
  };
 });
 await boot(page);
 await page.evaluate(()=>window.VZ.change(d=>d.assignments.push(
  {id:'range-test',title:'안정적인 음역(D#3~A#5) 안에서 아 소리 유지',status:'active'},
  {id:'plain-test',title:'호흡을 편하게 유지하기',status:'active'}
 ),{silent:true}));
 await page.evaluate(()=>window.VZ.nav('#/guided-practice/homework:range-test'));
 const note=page.getByRole('combobox',{name:'기준음 높이'});
 await expect(note).toBeVisible();await expect(note.locator('option')).toHaveCount(3);
 await expect(note).toHaveValue('63');
 await page.getByRole('button',{name:'기준음 듣기'}).click();
 const tone=await page.evaluate(()=>window.__tone);
 expect(tone.starts).toBe(1);expect(tone.frequency).toBeCloseTo(311.127,3); // D#4; engines differ in the last float digits
 await expect(page.locator('.gp-timer strong')).toHaveText('0:00');
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 expect(await page.evaluate(()=>window.__tone.stops)).toBeGreaterThan(0);
 await expect(page.getByRole('button',{name:'기준음 듣기'})).toBeVisible();
 await page.getByRole('button',{name:'연습 시작'}).click();
 await expect(page.getByRole('button',{name:'기준음 듣기'})).toBeDisabled();
 await page.evaluate(()=>window.VZ.nav('#/guided-practice/homework:plain-test'));
 await expect(page.locator('[data-gp-reference]')).toHaveCount(0);
 expect(page.__errors).toEqual([]);
});
test('analysis range is a note above three exercises, not a fourth timer step',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{
  window.VZ.practiceTips=()=>({tips:[{key:'into',name:'음정 정확도 연습',frequency:8,metric:'음정 오차',value:'±19.2 cent',minutes:10,range:'A#2~A5',
   steps:['기준음 듣고 따라 부르기','5음계 상행·하행 (도레미파솔파미레도)','고른 음을 4초 유지하고 처음과 비교']} ]});
  window.VZ.change(d=>{d.videoFeedback||=[];d.videoFeedback.push({exerciseKey:'analysis:into',videoId:'00vt7RAvG70',verdict:'bad'})},{silent:true});
  window.VZ.nav('#/guided-practice/analysis:into');
 });
 await expect(page.locator('.gp-progress span')).toHaveText('1 / 3 단계');
 await expect(page.locator('.gp-range-note')).toContainText('A#2~A5');
 await expect(page.getByRole('combobox',{name:'기준음 높이'})).toBeVisible();
 await expect(page.locator('.gp-steps span')).toHaveCount(3);
 expect(page.__errors).toEqual([]);
});
test('pitch exercise measures the selected note and releases the mic on backgrounding',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{
  window.__mic={stopped:0};window.__tones=[];
  // Defined on the prototype too: a plain assignment does not replace WebKit's getUserMedia.
  const fakeMic=async()=>({getTracks:()=>[{stop(){window.__mic.stopped++}}]});
  Object.defineProperty(MediaDevices.prototype,'getUserMedia',{value:fakeMic,configurable:true,writable:true});
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:fakeMic,configurable:true,writable:true});
  window.AudioContext=class{
   sampleRate=48000;currentTime=0;destination={};state='running';resume(){return Promise.resolve()}close(){return Promise.resolve()}
   createMediaStreamSource(){return {connect(){},disconnect(){}}}
   createAnalyser(){return {fftSize:4096,connect(){},disconnect(){},getFloatTimeDomainData(data){
    for(let i=0;i<data.length;i++)data[i]=.2*Math.sin(2*Math.PI*233.08188*i/48000);
   }}}
   createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}
   createOscillator(){const source={frequency:{value:0},connect(gain){return gain},start(){window.__tones.push(source.frequency.value)},stop(){},disconnect(){}};return source}
  };
  window.VZ.practiceTips=()=>({tips:[{key:'into',name:'음정 정확도 연습',frequency:8,metric:'음정 오차',value:'±19.2 cent',minutes:10,range:'A#2~A5',steps:['기준음 따라 부르기','5음계 상행·하행 (도레미파솔파미레도)','고른 목표음을 4초 유지하며 튜너가 가운데에 오는지 확인해요']} ]});
  window.VZ.change(d=>{d.videoFeedback||=[];d.videoFeedback.push({exerciseKey:'analysis:into',videoId:'00vt7RAvG70',verdict:'bad'})},{silent:true});
  window.VZ.nav('#/guided-practice/analysis:into');
 });
 for(let i=0;i<2;i++){
  if(i===1){await expect(page.getByRole('combobox',{name:'도 시작음'})).toHaveValue('58');
   await page.getByRole('button',{name:'음계 듣기'}).click();
   expect(await page.evaluate(()=>window.__tones.length)).toBe(9);
  }
  await page.getByRole('button',{name:'연습 시작'}).click();
  await page.waitForTimeout(3200);
  await page.getByRole('button',{name:'연습 종료'}).click();
  await page.getByRole('button',{name:'다음 단계'}).click();
 }
 await expect(page.locator('[data-gp-tuner]')).toBeVisible();
 await expect(page.getByRole('combobox',{name:'기준음 높이'})).toHaveValue('58');
 await page.getByRole('button',{name:'연습 시작'}).click();
 await expect(page.locator('[data-gp-tuner-status]')).toContainText('가운데에 가까워요');
 await expect(page.locator('[data-gp-tuner]')).toHaveClass(/on-pitch/,{timeout:7000});
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 expect(await page.evaluate(()=>window.__mic.stopped)).toBe(1);
 await expect(page.getByRole('button',{name:'다시 시작'})).toBeVisible();
 expect(page.__errors).toEqual([]);
});

test('AI rhythm follow-along opens a 75 BPM metronome with opt-in beats and stops on background or navigation',async({page})=>{
 await page.addInitScript(()=>{
  const Original=window.AudioContext||window.webkitAudioContext;window.__metroSounds=[];
  window.AudioContext=class extends Original{createOscillator(){const source=super.createOscillator(),start=source.start.bind(source);source.start=time=>{window.__metroSounds.push({time,frequency:source.frequency.value});start(time);};return source;}};
 });
 await boot(page);
 await page.evaluate(()=>VZ.change(d=>{d.practicePlans||=[];d.practicePlans.push({id:'rhythm-test',period:'ai-exercise',songId:'song-1',tip:{name:'두 구절 리듬 연결 연습',reason:'리듬을 따로 확인해요.',steps:['메트로놈 70~80 BPM에 맞춰 박수 치기','두 구절 연결하기'],minutes:5}});},{silent:true}));
 await page.goto('/#/guided-practice/ai:rhythm-test?song=song-1');
 const panel=page.getByRole('region',{name:'메트로놈'});await expect(panel).toBeVisible();await expect(page.getByRole('spinbutton',{name:'메트로놈 BPM'})).toHaveValue('75');
 await page.waitForTimeout(300);expect(await page.evaluate(()=>__metroSounds.length)).toBe(0);
 await page.getByRole('button',{name:'BPM 5 높이기'}).click();await expect(page.locator('[data-bpm]')).toHaveValue('80');await page.getByRole('button',{name:'BPM 5 낮추기'}).click();
 await page.getByRole('button',{name:'메트로놈 켜기'}).click();await expect(page.locator('[data-metronome]')).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>__metroSounds.length)).toBeGreaterThanOrEqual(2);const sounds=await page.evaluate(()=>__metroSounds.slice(0,2));expect(sounds[0].frequency).toBe(1200);expect(sounds[1].frequency).toBe(800);expect(sounds[1].time-sounds[0].time).toBeCloseTo(.8,2);
 await expect(page.locator('.gp-timer strong')).toHaveText('0:00');
 await page.locator('[data-meter]').selectOption('3');await expect(page.locator('[data-beat]')).toHaveCount(3);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('[data-metronome]')).toHaveAttribute('aria-pressed','false');
 await page.waitForTimeout(150);const stopped=await page.evaluate(()=>__metroSounds.length);await page.waitForTimeout(450);expect(await page.evaluate(()=>__metroSounds.length)).toBe(stopped);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.getByRole('button',{name:'메트로놈 켜기'})).toBeVisible();
 await page.getByRole('button',{name:'메트로놈 켜기'}).click();await page.getByRole('button',{name:'연습 시작',exact:true}).click();await page.waitForTimeout(3300);await page.getByRole('button',{name:'연습 종료',exact:true}).click();await expect(page.locator('[data-metronome]')).toHaveAttribute('aria-pressed','false');await page.getByRole('button',{name:'다음 단계',exact:true}).click();await expect(page.locator('.gp-instruction h3')).toHaveText('두 구절 연결하기');await expect(page.getByRole('button',{name:'메트로놈 켜기'})).toBeVisible();await page.getByRole('button',{name:'메트로놈 켜기'}).click();await page.goto('/#/home');await page.waitForTimeout(150);const left=await page.evaluate(()=>__metroSounds.length);await page.waitForTimeout(450);expect(await page.evaluate(()=>__metroSounds.length)).toBe(left);
});
