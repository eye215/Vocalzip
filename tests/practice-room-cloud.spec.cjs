const {test,expect}=require('@playwright/test');
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});

function sampleWav(){const rate=16000,frames=rate,bytes=44+frames*2,b=Buffer.alloc(bytes);b.write('RIFF',0);b.writeUInt32LE(bytes-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(7000*Math.sin(i*440*2*Math.PI/rate)),44+i*2);return b;}

test('practice room opens from settings management while home has no shortcut',async({page})=>{
 await fakeR2(page);await boot(page);
 await expect(page.locator('.vz-room-entry')).toHaveCount(0);
 await page.goto('/#/settings');
 const entry=page.locator('a.item[href="#/practice-room"]');
 await expect(entry).toBeVisible();
 await entry.click();
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
  const host=document.querySelector('#host');host.innerHTML=window.__route.render().replace('src="practice-room/','src="/practice-room/');window.__route.mount(host);
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
