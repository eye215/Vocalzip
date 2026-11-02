const {test, expect} = require('@playwright/test');
const cloudStub = `window.__cloudUploads=[];window.__cloudMetadata=[];window.__cloudUpdates=[];window.supabase={createClient:()=>({
 auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'ui-test'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/fixture-audio.wav'},error:null}),upload:async(path,blob,options)=>{window.__cloudUploads.push({path,size:blob.size,type:blob.type,options});return {error:null}}})},
 from:table=>{const chain={};for(const method of ['select','eq','order','upsert','update','delete','maybeSingle'])
 chain[method]=(...args)=>{if(method==='upsert')window.__cloudMetadata.push({table,payload:args[0]});if(method==='update')window.__cloudUpdates.push({table,payload:args[0]});return chain;};chain.then=resolve=>resolve({data:table==='vocal_media'?(window.__cloudRows||[]):[],error:null});return chain;}
})};`;
test.beforeEach(async ({page}) => {
  page.__vzipErrors=[];page.on('pageerror',error=>page.__vzipErrors.push(error.message));
  await page.route('**/supabase.min.js', route => route.fulfill({contentType:'application/javascript',body:cloudStub}));
  await page.route('**/tus.min.js', route => route.fulfill({contentType:'application/javascript',body:'window.tus={};'}));
  await page.route('**/*.supabase.co/**', route => route.abort());
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/');
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
});
test.afterEach(async ({page}) => { expect(page.__vzipErrors).toEqual([]); });
test('Navigation preserves the form, keeps recorder inside it, and fits the viewport', async ({page}, testInfo) => {
  const errors=[];page.on('pageerror', error=>errors.push(error.message));
  await testInfo.attach('home',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  await page.locator('.hero [data-go-tab="practice"]').click();
  await expect(page.locator('#practice-form')).toBeVisible();
  await expect(page.locator('#practice-form #vzip-practice-capture')).toBeVisible();
  await expect(page.locator('#practice-form [name="rating"]')).toBeVisible();
  await page.locator('#practice-form [name="memo"]').fill('이동 후에도 유지할 연습 메모');
  await page.locator('.nav [data-tab="media"]').click();
  await expect(page.locator('#vzip-media-hub')).toBeVisible();
  await page.locator('.nav [data-tab="practice"]').click();
  await expect(page.locator('#practice-form [name="memo"]')).toHaveValue('이동 후에도 유지할 연습 메모');
  await expect(page.locator('#lessons')).toBeHidden();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  expect(overflow).toBe(false);
  await testInfo.attach('practice-form',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  expect(errors).toEqual([]);
});
test('Settings panels can be revisited without losing controls', async ({page}) => {
  await page.locator('#vzip-open-settings').click();
  await page.locator('#manage [data-ia-open="songs"]').click();
  await expect(page.locator('#song-form')).toBeVisible();
  await page.locator('#song-form [name="title"]').fill('설정 왕복 확인 곡');
  await page.locator('.vzip-ia-detail .back').click();
  await page.locator('#manage [data-ia-open="account"]').click();
  await expect(page.locator('#vzip-cloud-root')).toBeVisible();
  await expect(page.locator('#song-form')).toBeHidden();
  await page.locator('.vzip-ia-detail .back').click();
  await page.locator('#manage [data-ia-open="songs"]').click();
  await expect(page.locator('#song-form [name="title"]')).toHaveValue('설정 왕복 확인 곡');
});
function wav() {
  const samples=8000,buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
  buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);
  buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);
  buffer.writeUInt32LE(samples*2,40);
  for(let n=0;n<samples;n++)buffer.writeInt16LE(Math.round(Math.sin(n/8000*2*Math.PI*440)*3000),44+n*2);
  return buffer;
}
test('Imported audio links to saved practice, decodes after reload, and appears in library', async ({page},testInfo) => {
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-form [data-mode="song"]').click();
  await page.locator('#practice-form [name="minutes"]').fill('1');
  await page.locator('#practice-form [name="memo"]').fill('파일 연결과 재접속 확인');
  await page.locator('#practice-attachments').setInputFiles({name:'vocal-ui-test.wav',mimeType:'audio/wav',buffer:wav()});
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  const save=page.locator('#practice-form>button:not([type])');
  await expect(save).toBeEnabled();await save.click();
  await expect(page.locator('#practice-list')).toContainText('파일 연결과 재접속 확인');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices[0]);
  expect(stored.mediaIds).toHaveLength(1);expect(stored.mediaSeconds).toBeGreaterThan(0);
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.locator('.nav [data-tab="practice"]').click();
  await page.locator('.vzip-practice-files summary').click();
  const audio=page.locator('.vzip-practice-files audio');
  await expect(audio).toBeVisible();
  await expect.poll(()=>audio.evaluate(element=>element.readyState)).toBeGreaterThanOrEqual(1);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('[data-origin="practice"]').click();
  await expect(page.locator('#vzip-hub-list')).toContainText('vocal-ui-test.wav');
  await page.locator('#vzip-hub-list [data-action="play"]').click();
  await expect(page.locator('#vzip-hub-list audio')).toBeVisible();
  await testInfo.attach('library',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
test('Lesson wizard keeps fields in form and stores homework', async ({page}) => {
  await page.locator('.hero [data-go-tab="lessons"]').click();
  await expect(page.locator('#lesson-form')).toBeVisible();
  await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
  await expect(page.locator('#lesson-form #vzip-recorder')).toBeVisible();
  await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
  await page.locator('#lesson-form [name="feedback"]').fill('호흡을 길게 연결하기');
  await page.locator('#lesson-form [name="homework"]').fill('후렴 프레이즈 연습');
  await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
  await page.getByRole('button',{name:'레슨 및 숙제 저장',exact:true}).click();
  await expect(page.locator('#lesson-list')).toContainText('호흡을 길게 연결하기');
  await expect(page.locator('#assignment-history')).toContainText('후렴 프레이즈 연습');
});
test('Chromium fake-device capture waits for storage and links media', async ({page,browserName}) => {
  test.skip(browserName!=='chromium','Requires Chromium fake capture devices; not an iPhone microphone test.');
  await page.locator('.hero [data-go-tab="practice"]').click();
  const save=page.locator('#practice-form>button:not([type])');
  await page.locator('#vzip-capture-start').click();
  await expect(page.locator('#vzip-capture-stop')).toBeEnabled();
  await expect(save).toBeDisabled();
  await page.waitForTimeout(1100);
  await page.locator('#vzip-capture-stop').click();
  await expect(page.locator('#vzip-capture-status')).toContainText('저장 완료');
  await expect(save).toBeEnabled();
  await save.click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices[0]);
  expect(stored.mediaIds).toHaveLength(1);expect(stored.mediaSeconds).toBeGreaterThan(0);
});

test('Camera capture saves playable video and releases preview tracks',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Uses Chromium virtual camera; not real iPhone hardware.');
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#vzip-practice-capture [data-kind="video"]').click();
  await page.locator('#vzip-capture-start').click();
  await expect(page.locator('#vzip-capture-preview')).toBeVisible();
  await expect(page.locator('#vzip-capture-stop')).toBeEnabled();
  await page.waitForTimeout(1200);await page.locator('#vzip-capture-stop').click();
  await expect(page.locator('#vzip-capture-status')).toContainText('저장 완료');
  expect(await page.locator('#vzip-capture-preview').evaluate(el=>el.srcObject===null)).toBe(true);
  await page.locator('#practice-form>button:not([type])').click();
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.locator('.nav [data-tab="practice"]').click();
  await page.locator('.vzip-practice-files summary').click();
  const video=page.locator('.vzip-practice-files video');await expect(video).toBeVisible();
  await expect.poll(()=>video.evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
});
test('Denied or unavailable capture preserves controls and practice input',async({page})=>{
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-form [name="memo"]').fill('권한 거부 후 입력 유지');
  const supported=await page.evaluate(()=>!!window.MediaRecorder);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')}});
  await page.locator('#vzip-capture-start').click();
  await expect(page.locator('#vzip-capture-status')).toContainText(supported?'권한':'지원하지');
  await expect(page.locator('#vzip-capture-start')).toBeEnabled();
  await expect(page.locator('#practice-form>button:not([type])')).toBeEnabled();
  await expect(page.locator('#practice-form [name="memo"]')).toHaveValue('권한 거부 후 입력 유지');
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds||'[]'))).toEqual([]);
});
test('Failed capture stays recoverable and retries with one attachment',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Requires virtual microphone.');
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.evaluate(()=>{
    const original=window.vzipStorePracticeMedia;let failed=false;
    window.vzipStorePracticeMedia=async item=>{if(!failed){failed=true;throw new DOMException('disk full','QuotaExceededError')}return original(item)};
  });
  await page.locator('#vzip-capture-start').click();
  await expect(page.locator('#vzip-capture-stop')).toBeEnabled();await page.waitForTimeout(1100);
  await page.locator('#vzip-capture-stop').click();
  await expect(page.locator('#vzip-capture-status')).toContainText('기기 저장 실패');
  await expect(page.locator('#practice-form>button:not([type])')).toBeDisabled();
  await expect(page.locator('#vzip-capture-recovery a[download]')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds||'[]'))).toEqual([]);
  await page.locator('#vzip-capture-retry').click();
  await expect(page.locator('#vzip-capture-status')).toContainText('저장 완료');
  await page.locator('#practice-form>button:not([type])').click();
  const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices);
  expect(records).toHaveLength(1);expect(records[0].mediaIds).toHaveLength(1);
});
test('Record storage failure keeps the form and rolls back the new record',async({page})=>{
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-form [name="memo"]').fill('저장 실패 후 복구할 메모');
  await page.evaluate(()=>{
    window.__originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='vocal-zip_mvp_v1')throw new DOMException('full','QuotaExceededError');return window.__originalSet.call(this,key,value)};
  });
  await page.locator('#practice-form>button:not([type])').click();
  await expect(page.locator('#practice-form')).toBeVisible();
  await expect(page.locator('#practice-form [name="memo"]')).toHaveValue('저장 실패 후 복구할 메모');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__originalSet});
  await page.locator('#practice-form>button:not([type])').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices.length)).toBe(1);
});
test('Pending file storage blocks keyboard submission until attachment is durable',async({page})=>{
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.evaluate(()=>{
    const original=window.vzipStorePracticeMedia;
    window.vzipStorePracticeMedia=item=>new Promise((resolve,reject)=>{
      window.__finishImport=()=>original(item).then(resolve,reject);
    });
  });
  await page.locator('#practice-attachments').setInputFiles({name:'pending.wav',mimeType:'audio/wav',buffer:wav()});
  await expect.poll(()=>page.evaluate(()=>typeof window.__finishImport)).toBe('function');
  await expect(page.locator('#practice-form>button:not([type])')).toBeDisabled();
  await page.evaluate(()=>document.querySelector('#practice-form').requestSubmit());
  expect(await page.evaluate(()=>(JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}').practices||[]).length)).toBe(0);
  await page.evaluate(()=>window.__finishImport());
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  await page.locator('#practice-form>button:not([type])').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices[0].mediaIds.length)).toBe(1);
});
test('Legacy ArrayBuffer audio decodes after reload and backup preserves its metadata',async({page})=>{
  const bytes=[...wav()];
  await page.evaluate(async bytes=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('vocalzip_media_v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('recordings',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('recordings','readwrite');
      tx.objectStore('recordings').put({id:'legacy-a',name:'기존 녹음.wav',type:'audio/wav',source:'practice',
        created:Date.now(),durationSeconds:1,bytes:new Uint8Array(bytes).buffer});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },bytes);
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('vzip:media-saved',{detail:{id:'legacy-a',source:'practice',attachToPractice:true,durationSeconds:1}})));
  await page.locator('#practice-form>button:not([type])').click();
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.locator('.nav [data-tab="practice"]').click();
  await page.locator('.vzip-practice-files summary').click();
  await expect.poll(()=>page.locator('.vzip-practice-files audio').evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
  await page.locator('#vzip-open-settings').click();
  await page.locator('#manage [data-ia-open="account"]').click();
  await page.locator('#cloud-media-upload').click();
  await expect(page.locator('#cloud-status')).toContainText('백업 1개 성공');
  const uploaded=await page.evaluate(()=>({files:window.__cloudUploads,meta:window.__cloudMetadata}));
  expect(uploaded.files[0].size).toBe(bytes.length);expect(uploaded.files[0].path).toBe('ui-test-user/legacy-a.wav');
  const metadata=uploaded.meta.find(row=>row.table==='vocal_media').payload.metadata;
  expect(metadata.source).toBe('practice');expect(metadata.durationSeconds).toBe(1);
  await page.evaluate(()=>{window.__cloudRows=[{id:'legacy-a',metadata:{id:'legacy-a',path:'ui-test-user/legacy-a.webm'}}]});
  await page.locator('#cloud-media-upload').click();
  await expect.poll(()=>page.evaluate(()=>window.__cloudUploads.length)).toBe(2);
  expect(await page.evaluate(()=>window.__cloudUploads[1].path)).toBe('ui-test-user/legacy-a.webm');
});

async function cloudFiles(page, rows) {
  await page.route('**/fixture-audio.wav',route=>route.fulfill({contentType:'audio/wav',body:wav()}));
  await page.addInitScript(rows=>{window.__cloudRows=rows},rows);
  await page.evaluate(rows=>{window.__cloudRows=rows;window.dispatchEvent(new Event('vzip:cloud-media-changed'))},rows);
}
function cloudRow(id,name,durationSeconds=1) {
  return {id,metadata:{id,name,type:'audio/wav',source:'practice',created:Date.now(),durationSeconds,path:'ui-test-user/'+id+'.wav'}};
}
test('Cloud-only media links once beside its local duplicate and plays after reload',async({page})=>{
  await page.evaluate(async bytes=>window.vzipStorePracticeMedia({
    id:'shared',name:'기기와 클라우드 공통',type:'audio/wav',created:Date.now(),
    source:'practice',durationSeconds:1,blob:new Blob([new Uint8Array(bytes)],{type:'audio/wav'})
  }),[...wav()]);
  await cloudFiles(page,[cloudRow('shared','기기와 클라우드 공통'),cloudRow('remote-only','클라우드 전용 녹음',61)]);
  await page.locator('.hero [data-go-tab="practice"]').click();
  await expect(page.locator('#practice-saved-media input')).toHaveCount(2);
  await page.locator('#practice-saved-media input[value="remote-only"]').check();
  await expect.poll(()=>page.locator('#practice-form').getAttribute('data-media-seconds')).toBe('61');
  await page.locator('#practice-form>button:not([type])').click();
  const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices[0]);
  expect(record.mediaIds).toEqual(['remote-only']);
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.locator('.nav [data-tab="practice"]').click();
  await page.locator('.vzip-practice-files summary').click();
  await expect.poll(()=>page.locator('.vzip-practice-files audio').evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
});
test('Library media controls do not open comparison and filters stop playback with an empty state',async({page})=>{
  await cloudFiles(page,[cloudRow('controls','재생 조작 확인')]);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('[data-id="controls"] [data-action="play"]').click();
  const audio=page.locator('[data-id="controls"] audio');
  await expect.poll(()=>audio.evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
  await page.evaluate(()=>{
    window.__compareCount=0;window.addEventListener('vzip:compare-open',()=>window.__compareCount++);
    window.__previousAudio=document.querySelector('#vzip-hub-list audio');
    window.__previousAudio.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  expect(await page.evaluate(()=>window.__compareCount)).toBe(0);
  await page.locator('#vzip-media-hub [data-filter="video"]').click();
  await expect(page.locator('#vzip-hub-list')).toContainText('선택한 조건에 맞는 파일이 없어요');
  await expect(page.locator('[data-filter="video"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>({paused:window.__previousAudio.paused,src:window.__previousAudio.getAttribute('src')})))
    .toEqual({paused:true,src:null});
});
test('Late signed playback URLs cannot replace newer playback or survive leaving the library',async({page})=>{
  await cloudFiles(page,[cloudRow('older','첫 파일'),cloudRow('newer','두 번째 파일')]);
  await page.locator('.nav [data-tab="media"]').click();
  await expect(page.locator('#vzip-hub-list [data-action="play"]')).toHaveCount(2);
  await page.evaluate(()=>{
    window.__pendingPlay={};
    window.vzipCloudMediaUrl=item=>new Promise(resolve=>{window.__pendingPlay[item.id]=()=>resolve('/fixture-audio.wav')});
  });
  await page.locator('[data-id="older"] [data-action="play"]').click();
  await expect.poll(()=>page.evaluate(()=>typeof window.__pendingPlay.older)).toBe('function');
  await page.locator('[data-id="newer"] [data-action="play"]').click();
  await expect.poll(()=>page.evaluate(()=>typeof window.__pendingPlay.newer)).toBe('function');
  await page.evaluate(()=>window.__pendingPlay.newer());
  await expect(page.locator('[data-id="newer"] audio')).toHaveCount(1);
  await page.evaluate(()=>window.__pendingPlay.older());
  await expect(page.locator('#vzip-hub-list audio')).toHaveCount(1);
  await expect(page.locator('[data-id="older"] audio')).toHaveCount(0);
  await page.locator('[data-id="older"] [data-action="play"]').click();
  await page.locator('.nav [data-tab="home"]').click();
  await page.evaluate(()=>window.__pendingPlay.older());
  await expect(page.locator('#vzip-hub-list audio')).toHaveCount(0);
});
test('Media edit is keyboard accessible and never sends local binary data as cloud metadata',async({page})=>{
  await cloudFiles(page,[cloudRow('metadata','정보 수정 파일')]);
  await page.locator('.nav [data-tab="media"]').click();
  const edit=page.locator('[data-id="metadata"] [data-action="edit"]');
  await edit.click();
  const name=page.locator('.vzip-media-edit-sheet [name="name"]');
  await expect(name).toBeFocused();
  await name.press('Shift+Tab');
  await expect(page.locator('.vzip-media-edit-sheet [data-save]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.vzip-media-edit-sheet')).toHaveCount(0);
  await expect(edit).toBeFocused();
  await page.evaluate(async()=>{
    await window.vzipCloudMediaUpdate({id:'metadata',path:'ui-test-user/metadata.wav',name:'원본',
      type:'audio/wav',source:'practice',durationSeconds:12,local:true,cloud:true,
      bytes:new Uint8Array([1,2]).buffer,blob:new Blob(['binary'])},{name:'수정 제목'});
  });
  const metadata=await page.evaluate(()=>window.__cloudUpdates.at(-1).payload.metadata);
  expect(metadata.name).toBe('수정 제목');expect(metadata.durationSeconds).toBe(12);
  for(const key of ['local','cloud','blob','bytes'])expect(metadata).not.toHaveProperty(key);
});
test('Cloud import infers an empty MIME from m4a without pretending to test real m4a decoding',async({page})=>{
  await page.evaluate(async()=>{
    window.tus={Upload:class {constructor(file,options){this.options=options;window.__tusMetadata=options.metadata}
      start(){this.options.onSuccess()}}};
    window.__importedMetadata=await window.vzipCloudImport(new File(['fixture'],'empty-type.m4a',{type:''}),{name:'빈 MIME'});
  });
  const result=await page.evaluate(()=>({upload:window.__tusMetadata,item:window.__importedMetadata}));
  expect(result.upload.contentType).toBe('audio/mp4');
  expect(result.item.type).toBe('audio/mp4');
});
test('Deleting a practice keeps its recording available in the library',async({page})=>{
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-attachments').setInputFiles({name:'keep-after-delete.wav',mimeType:'audio/wav',buffer:wav()});
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  await page.locator('#practice-form>button:not([type])').click();
  await page.locator('#practice-list [data-delete="practice"]').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices.length)).toBe(0);
  await page.locator('.nav [data-tab="media"]').click();
  await expect(page.locator('#vzip-hub-list')).toContainText('keep-after-delete.wav');
  await page.locator('#vzip-hub-list [data-action="play"]').click();
  await expect.poll(()=>page.locator('#vzip-hub-list audio').evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
});

test('Growth periods aggregate stored totals without double-counting media or classifying legacy records',async({page},testInfo)=>{
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00Z'));
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}');
    state.songs=[{id:'song-one',title:'성장 확인 곡'}];
    state.practices=[
      {id:'training',date:'2026-11-02',practiceMode:'training',minutes:15,manualMinutes:10,mediaSeconds:300,
        rating:4,technique:[{name:'립트릴',minutes:10}],completed:['a','a']},
      {id:'song',date:'2026-11-01',practiceMode:'song',songId:'song-one',minutes:20,rating:2,completed:['a','b']},
      {id:'legacy',date:'2026-10-26',songId:'song-one',minutes:7},
      {id:'older',date:'2026-10-01',practiceMode:'song',minutes:100,rating:5},
      {id:'future',date:'2026-11-03',practiceMode:'song',minutes:999,rating:5},
      {id:'invalid-values',date:'2026-11-02',minutes:-10,rating:99}
    ];
    localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(state));
  });
  await page.locator('.nav [data-tab="archive"]').click();
  await expect(page.locator('[data-metric="minutes"] strong')).toHaveText('42분');
  await expect(page.locator('[data-metric="rating"] strong')).toHaveText('3 / 5');
  await expect(page.locator('[data-metric="homework"] strong')).toHaveText('3회');
  await expect(page.locator('[data-metric="homework"] small')).toHaveText('2개 숙제에 수행 기록');
  await expect(page.locator('#vzip-growth-modes')).toContainText('보컬 트레이닝15분');
  await expect(page.locator('#vzip-growth-modes')).toContainText('곡 연습20분');
  await expect(page.locator('#vzip-growth-modes')).toContainText('미분류 · 이전 기록7분');
  await expect(page.locator('#vzip-growth-techniques')).toContainText('립트릴10분');
  await expect(page.locator('#vzip-growth-songs')).toContainText('성장 확인 곡27분');
  await expect(page.locator('#vzip-growth-weeks tr').filter({hasText:'2026-10-26'})).toContainText('27분');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await testInfo.attach('growth-insights',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  await page.locator('#vzip-growth-period').selectOption('week');
  await expect(page.locator('[data-metric="minutes"] strong')).toHaveText('15분');
  await expect(page.locator('[data-metric="rating"] strong')).toHaveText('4 / 5');
  await page.locator('#vzip-growth-period').selectOption('all');
  await expect(page.locator('[data-metric="minutes"] strong')).toHaveText('142분');
  await expect(page.locator('[data-metric="rating"] strong')).toHaveText('3.7 / 5');
});
test('Growth empty state has no invented score and updates when a practice is saved',async({page})=>{
  await page.locator('.nav [data-tab="archive"]').click();
  await expect(page.locator('#vzip-growth-empty')).toBeVisible();
  await expect(page.locator('[data-metric="rating"] strong')).toHaveText('—');
  await page.locator('.nav [data-tab="home"]').click();
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('[data-mode="song"]').click();
  await page.locator('#practice-form [name="minutes"]').fill('10');
  await page.locator('#practice-form [name="rating"]').selectOption('5');
  await page.locator('#practice-form>button:not([type])').click();
  await page.locator('.nav [data-tab="archive"]').click();
  await expect(page.locator('#vzip-growth-empty')).toBeHidden();
  await expect(page.locator('[data-metric="minutes"] strong')).toHaveText('10분');
  await expect(page.locator('[data-metric="rating"] strong')).toHaveText('5 / 5');
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.locator('.nav [data-tab="archive"]').click();
  await expect(page.locator('[data-metric="minutes"] strong')).toHaveText('10분');
});
