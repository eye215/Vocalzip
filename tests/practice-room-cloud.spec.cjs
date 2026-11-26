const {test,expect}=require('@playwright/test');
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});

function sampleWav(){const rate=16000,frames=rate,bytes=44+frames*2,b=Buffer.alloc(bytes);b.write('RIFF',0);b.writeUInt32LE(bytes-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(7000*Math.sin(i*440*2*Math.PI/rate)),44+i*2);return b;}

// 내 로드맵 took the place of 노래 연습실 on 오늘 › 연습하기 (its fixed 9 steps are gone); the room's submissions stay and open
// from 내 로드맵; 설정 does not repeat it.
test('노래 연습실: no row on 오늘 any more — its submissions open from 내 로드맵, and 설정 does not repeat it',async({page})=>{
 await fakeR2(page);await boot(page);
 await expect(page.locator('.vz-room-entry')).toHaveCount(0);
 await page.evaluate(()=>{location.hash='#/settings';});
 await expect(page.locator('[data-settings-group="practice"]')).toBeVisible();
 await expect(page.locator('.vz-settings a[href="#/practice-room"]')).toHaveCount(0);
 await page.evaluate(()=>{location.hash='#/home';});
 await expect(page.locator('.vz-student-home [data-home-practice] [data-row="roadmap"]')).toBeVisible();
 await expect(page.locator('.vz-student-home [data-home-practice] [data-row="practice-room"]')).toHaveCount(0);
 await page.evaluate(()=>VZ.change(d=>{d.practices.push({id:'practice-room:r1',date:'2026-11-01',minutes:5,practiceMode:'training',categoryLabel:'노래 연습실',practiceRoom:{task:'melody',chapterId:'pitch-rhythm'},created:1});},{silent:true}));
 await page.evaluate(()=>{location.hash='#/roadmap';});
 await page.locator('[data-rm-room]').click();
 await expect(page).toHaveURL(/#\/practice-room$/);
 await expect(page.locator('iframe.vzip-practice-room-frame')).toBeVisible();
});

test('practice-room bridge stores reflection in synced practice data and verifies R2 recording',async({page})=>{
 await page.goto('/practice-room/index.html');
 await page.setContent('<div id="host"></div>');
 await page.addScriptTag({url:'/app/practice-room-model.js'});
 await page.evaluate(()=>{
  window.__db={categories:[],songs:[],lessons:[],assignments:[],practices:[]};
  window.VZ={db:window.__db,song:()=>null,songLabel:()=>'',today:()=> '2026-11-10',ymd:()=> '2026-11-10',change(fn){fn(window.__db);return true},route(key,config){window.__route=config},setGuard(){},timeEntries:()=>[]};
  window.vzipCloudSignedIn=()=>true;
  window.VzipR2={configured:()=>true,ready:async()=>true};
  window.vzipCloudImport=async(file,info,progress,options)=>{window.__uploaded={name:file.name,size:file.size,source:info.source,id:info.id,requireR2:options?.requireR2};return {id:info.id,storageProvider:'r2',r2Key:'u/user/'+info.id+'/original.wav'}};
  window.vzipCloudMediaList=async()=>[{id:'test-session-1234-0',storageProvider:'r2',r2Key:'u/user/test-session-1234-0/original.wav'}];
  window.vzipCloudMediaUrl=async()=>'/recording.wav';
 });
 await page.addScriptTag({url:'/app/practice-room.js'});
 const result=await page.evaluate(async()=>{
  const host=document.querySelector('#host');host.innerHTML=window.__route.render().replace('src="practice-room/','src="/practice-room/').replace('&amp;past=1','').replace('&past=1','');window.__route.mount(host);
  const frame=host.querySelector('iframe');await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  const input={id:'test-session-1234',task:'reflection',seconds:0,room:{date:'2026-11-10T00:00:00.000Z',draft:{memo:'후렴 집중',answers:['The River']},audioIds:[{id:'test-session-1234-0',name:'recording.wav',duration:2,cloud:false}]}};
  const before=window.VocalzipPracticeRoom.saveSubmission(input,frame.contentWindow);
  window.VzipR2.ready=async()=>false;let blocked=false;try{await window.VocalzipPracticeRoom.uploadAudio(input.room.audioIds[0],new Blob(['audio'],{type:'audio/wav'}),frame.contentWindow);}catch{blocked=true;}
  window.VzipR2.ready=async()=>true;
  const audio=await window.VocalzipPracticeRoom.uploadAudio(input.room.audioIds[0],new Blob(['audio'],{type:'audio/wav'}),frame.contentWindow);
  input.room.audioIds[0].cloud=audio.cloud;
  const after=window.VocalzipPracticeRoom.saveSubmission(input,frame.contentWindow);
  const url=await window.VocalzipPracticeRoom.audioUrl(audio.id,frame.contentWindow);
  return {before,after,audio,url,blocked,record:window.__db.practices[0],uploaded:window.__uploaded,history:window.VocalzipPracticeRoom.history(frame.contentWindow)};
 });
 expect(result.before.ok).toBe(true);
 expect(result.blocked).toBe(true);
 expect(result.after.changed).toBe(true);
 expect(result.record.practiceRoom.draft.memo).toBe('후렴 집중');
 expect(result.record.mediaIds).toEqual(['test-session-1234-0']);
 expect(result.uploaded.source).toBe('practice-room'); // room takes have their own library category (#279)
 expect(result.uploaded.requireR2).toBe(true);
 expect(result.audio.cloud).toBe(true);
 expect(result.url).toBe('/recording.wav');
 expect(result.history).toHaveLength(1);
 const room=page.frameLocator('#host iframe');
 await room.locator('[data-nav="roadmap"]').click();
 await room.locator('[data-task="reflection"]').click();
 await expect(room.locator('[data-learning="reflection"]')).toContainText('가사의 상대와 목적을 구체적으로');
 expect(await room.locator('[data-learning="reflection"]').evaluate(el=>el.compareDocumentPosition(document.querySelector('#answer-0'))&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
 await page.setViewportSize({width:320,height:700});
 expect(await room.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await room.locator('#answer-0').fill('The River 후렴');
 await room.locator('#answer-1').fill('친구에게');
 await room.locator('#answer-2').fill('다시 함께 노래하기');
 await room.locator('#memo').fill('첫 소절은 조용하게');
 await room.locator('#submit').click();
 await expect(room.locator('.result-heading')).toContainText('연습과 회고를 기록했어요');
 const saved=await page.evaluate(()=>window.__db.practices.find(p=>p.practiceRoom?.draft?.memo==='첫 소절은 조용하게'));
 expect(saved.practiceRoom.draft.answers).toContain('The River 후렴');
 expect(saved.practiceRoom.chapterId).toBe('interpretation');
 await room.locator('[data-nav="roadmap"]').click();
 await expect(room.locator('.chapter').nth(5).locator('.chapter-note')).toContainText('과제 기록 1/1');
 await expect(room.locator('.chapter').nth(3).locator('.chapter-note')).toContainText('과제 기록 0/1');
 await expect(room.locator('.chapter').nth(6).locator('.chapter-note')).toContainText('과제 기록 0/1');
 await expect(room.locator('.chapter').nth(3).locator('[data-task="delivery"]')).toHaveCount(1);
 await expect(room.locator('.chapter').nth(6).locator('[data-task="scene"]')).toHaveCount(1);
});

test('practice-room result appears while R2 upload is still pending',async({page})=>{
 await fakeR2(page);await boot(page);await page.goto('/#/practice-room');
 await page.evaluate(()=>{
  window.vzipCloudSignedIn=()=>true;
  window.VzipR2={configured:()=>true,ready:async()=>true};
  window.vzipCloudImport=()=>new Promise(()=>{});
  // #/practice-room only shows past submissions now (past=1); the old submission flow is checked without it.
  const f=document.querySelector('iframe.vzip-practice-room-frame');f.src=f.src.replace('&past=1','');
 });
 const room=page.frameLocator('iframe.vzip-practice-room-frame');
 // The tab buttons are static HTML: wait for the room script to render its first view before using them.
 await expect(room.locator('#main [data-task]').first()).toBeVisible();
 await room.locator('[data-nav="roadmap"]').click();
 await room.locator('[data-task="basics"]').click();
 await room.locator('[data-upload="0"]').setInputFiles({name:'test.wav',mimeType:'audio/wav',buffer:sampleWav()});
 await expect(room.locator('audio[data-audio="0"]')).toBeVisible();
 await room.locator('#memo').fill('오늘은 한 구절을 편하게 불렀어요.');
 await room.locator('#submit').click();
 // Either the result or the room's own error text, which the second check prints if it is there.
 await expect(room.locator('.result-heading').or(room.locator('#record-error:not(:empty)')).first()).toBeVisible({timeout:15000});
 expect(await room.locator('#record-error').textContent({timeout:1000}).catch(()=>'')||'').toBe('');
 await expect(room.locator('.result-heading')).toContainText('연습과 회고를 기록했어요',{timeout:5000});
 await expect(room.locator('.processing')).toHaveCount(0);
 await expect(room.locator('.feedback-block audio')).toBeVisible();
});

// 노래 연습실 → 오늘의 연습 (2026-11-26): #/practice-room keeps the past submissions and their AI comments; nothing there
// starts a new task — one line says where they come from now, with the way home. 전체 리포트 no longer links to it.
test('#/practice-room lists past submissions and their AI comments, starts nothing, and points to 오늘의 연습 › 곡에 적용하기',async({page})=>{
 await fakeR2(page);await boot(page);
 await page.evaluate(()=>VZ.change(d=>{d.practices.push({id:'practice-room:past-room-0001',date:'2026-11-01',minutes:8,manualMinutes:8,practiceRoomSeconds:480,practiceTimeSource:'manual',practiceMode:'training',songId:'',categoryLabel:'노래 연습실',detail:'가사를 말로 전하기',memo:'[노래 연습실] 가사를 말로 전하기',created:1,
  practiceRoom:{id:'past-room-0001',task:'delivery',chapterId:'lyric-delivery',title:'가사를 말로 전하기',songId:'',date:'2026-11-01T10:00:00.000Z',analysis:{status:'reflection',summary:'읽은 녹음과 회고를 남겼어요.'},recommendation:'reflection',mood:'편안해',summary:'읽은 녹음과 회고를 남겼어요.',
   aiCoach:'들리는 특징: 마지막 단어가 또렷해요.\n다음 시도: 첫 단어를 천천히 읽어요.',aiConditionCheck:false,aiNextTask:'',draft:{difficulty:'적당해',comfort:'편안해',symptoms:[],memo:'돌아와를 천천히',answers:[]},demo:false,audioIds:[{id:'past-room-0001-0',name:'가사를 말로 전한 녹음',duration:12,cloud:true}],seconds:480,variant:'normal'}});},{silent:true}));
 const before=await page.evaluate(()=>JSON.stringify(VZ.db.practices));
 await page.evaluate(()=>{location.hash='#/practice-room';});
 const room=page.frameLocator('iframe.vzip-practice-room-frame');
 await expect(room.locator('.record-history')).toHaveCount(1);
 await expect(room.locator('.record-history h3')).toHaveText('가사를 말로 전하기');
 await expect(room.locator('[data-room-moved]')).toContainText('새 과제는 이제 오늘의 연습 › 곡에 적용하기에서 나와요');
 await expect(room.locator('[data-task]')).toHaveCount(0);
 await expect(room.locator('[data-nav="home"]')).toBeHidden();await expect(room.locator('[data-nav="roadmap"]')).toBeHidden();
 await room.locator('[data-result-id="past-room-0001"]').click();
 await expect(room.locator('.coach-section')).toHaveCount(2);
 await expect(room.locator('.coach-section').first()).toContainText('마지막 단어가 또렷해요');
 await expect(room.locator('[data-action="save-next"],[data-action="start-next"],[data-action="retry"]')).toHaveCount(0);
 await expect(room.locator('[data-room-moved]')).toBeVisible();
 expect(await page.evaluate(()=>JSON.stringify(VZ.db.practices))).toBe(before); // viewing changes no record
 await room.locator('[data-room-moved] [data-action="home"]').click();
 await expect(page).toHaveURL(/#\/home$/);
 // 전체 리포트: no '연습실에서 시작하기' any more.
 await page.evaluate(()=>{location.hash='#/growth-flow?period=all';});
 await expect(page.locator('[data-overall-body]')).toBeVisible();
 await expect(page.getByText('연습실에서 시작하기')).toHaveCount(0);
 await expect(page.locator('a[href="#/practice-room"]')).toHaveCount(0);
});
