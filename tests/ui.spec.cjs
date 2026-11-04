const {test, expect} = require('@playwright/test');
const cloudStub = `window.__cloudUploads=[];window.__cloudMetadata=[];window.__cloudUpdates=[];window.supabase={createClient:()=>({
 auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),
 onAuthStateChange:callback=>{(window.__authCallbacks||=[]).push(callback);return {data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session:{access_token:'ui-test'}}})},
 storage:{from:()=>({remove:async paths=>{(window.__removedPaths||=[]).push(...paths);return {error:null}},createSignedUrl:async()=>({data:{signedUrl:'/fixture-audio.wav'},error:null}),upload:async(path,blob,options)=>{window.__cloudUploads.push({path,size:blob.size,type:blob.type,options});return {error:null}}})},
 from:table=>{const chain={};let selectedId,maybe=false;for(const method of ['select','eq','order','upsert','update','delete','maybeSingle'])
 chain[method]=(...args)=>{if(method==='eq'&&args[0]==='id')selectedId=args[1];if(method==='maybeSingle')maybe=true;if(method==='upsert'){window.__cloudMetadata.push({table,payload:args[0]});if(table==='vocal_media'&&window.__storeCloudMetadata)(window.__cloudRows||=[]).push({id:args[0].id,metadata:args[0].metadata});if(table==='vocal_media')window.__onMetadataWrite?.()}if(method==='update')window.__cloudUpdates.push({table,payload:args[0]});return chain;};chain.then=resolve=>resolve({data:table==='vocal_media'?(maybe?(window.__cloudRows||[]).find(row=>row.id===selectedId)||null:(window.__cloudRows||[])):[],error:table==='vocal_media'&&window.__failMetadata?{message:'metadata save failed'}:null});return chain;}
})};`;
test.beforeEach(async ({page}) => {
  page.__vzipErrors=[];page.on('pageerror',error=>page.__vzipErrors.push(error.message));
  await page.route('**/supabase.min.js', route => route.fulfill({contentType:'application/javascript',body:cloudStub}));
  await page.route('**/tus.min.js', route => route.fulfill({contentType:'application/javascript',body:'window.tus={};'}));
  await page.route('**/*.supabase.co/**', route => route.abort());
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/legacy.html');
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.evaluate(()=>{window.vzipPrepareMedia=async file=>({file,metadata:VzipMediaDates.pick({},file.lastModified),dispose:async()=>{}})});
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
  await expect(audio).toBeAttached();
  await expect.poll(()=>audio.evaluate(element=>element.readyState)).toBeGreaterThanOrEqual(1);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('[data-origin="practice"]').click();
  await expect(page.locator('#vzip-hub-list')).toContainText('vocal-ui-test.wav');
  await page.locator('#vzip-hub-list [data-action="play"]').click();
  await expect(page.locator('#vzip-hub-list .vzip-player-controls')).toBeVisible();
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

test('Practice and lesson recording never request camera access',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Uses a virtual microphone.');
 await page.evaluate(()=>{
  window.__constraints=[];const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=constraints=>{window.__constraints.push(constraints);return get(constraints)};
 });
 await page.locator('.hero [data-go-tab=practice]').click();
 await expect(page.locator('#vzip-practice-capture [data-kind=video]')).toHaveCount(0);
 await page.locator('#vzip-capture-start').click();await expect(page.locator('#vzip-capture-stop')).toBeEnabled();
 await page.waitForTimeout(500);await page.locator('#vzip-capture-stop').click();await expect(page.locator('#vzip-capture-status')).toContainText('저장 완료');
 await page.locator('.nav [data-tab=home]').click();await page.locator('.hero [data-go-tab=lessons]').click();
 await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
 await expect(page.locator('#vzip-lesson-capture [data-kind=video]')).toHaveCount(0);
 await page.locator('#vzip-lesson-capture-start').click();await expect(page.locator('#vzip-lesson-capture-stop')).toBeEnabled();
 await page.waitForTimeout(500);await page.locator('#vzip-lesson-capture-stop').click();await expect(page.locator('#vzip-lesson-capture-status')).toContainText('저장 완료');
 expect(await page.evaluate(()=>window.__constraints)).toEqual([{audio:true},{audio:true}]);
});
test('Denied or unavailable capture preserves controls and practice input',async({page})=>{
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-form [name="memo"]').fill('권한 거부 후 입력 유지');
  const supported=await page.evaluate(()=>!!window.MediaRecorder);
  await page.evaluate(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')}});
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
        created:Date.now(),durationSeconds:1,rating:4,review:'기존 감상 유지',bytes:new Uint8Array(bytes).buffer});
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
  expect(metadata.source).toBe('practice');expect(metadata.durationSeconds).toBe(1);expect(metadata.rating).toBe(4);expect(metadata.review).toBe('기존 감상 유지');
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
  await page.locator('#vzip-media-hub [data-origin="lesson"]').click();
  await expect(page.locator('#vzip-hub-list')).toContainText('선택한 조건에 맞는 파일이 없어요');
  await expect(page.locator('[data-origin="lesson"]')).toHaveAttribute('aria-pressed','true');
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

test('Large audio import sends original bytes via resumable cloud importer',async({page})=>{
  await page.locator('.nav [data-tab="media"]').click();
  await page.evaluate(()=>{
    window.__vzipOptimized=false;
    Object.defineProperty(File.prototype,'size',{configurable:true,get(){return this.name==='lesson.m4a'?40*1024*1024:1024}});
    window.vzipCloudSignedIn=()=>true;
    window.vzipOptimizeVideo=async(file,progress)=>{
      window.__vzipOptimized=true;progress(100);
      return new File([new Uint8Array(1024)],'optimized.webm',{type:'video/webm'});
    };
    window.vzipCloudImport=async(file,info,progress)=>{
      window.__vzipUpload={size:file.size,type:file.type,name:info.name};
      progress(100);return {id:'large-test'};
    };
  });
  await page.locator('#vzip-hub-upload').setInputFiles({
    name:'lesson.m4a',mimeType:'audio/mp4',buffer:Buffer.alloc(1024,1)
  });
  await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__vzipUpload?.size)).toBe(40*1024*1024);
  expect(await page.evaluate(()=>window.__vzipOptimized)).toBe(false);
  expect(await page.evaluate(()=>window.__vzipUpload.type)).toBe('audio/mp4');
  expect(page.__vzipErrors).toEqual([]);
});
test('Large audio import without cloud login explains required sign in',async({page})=>{
  await page.locator('.nav [data-tab="media"]').click();
  await page.evaluate(()=>{Object.defineProperty(File.prototype,'size',{configurable:true,get(){return this.name==='lesson.m4a'?40*1024*1024:1024}});window.vzipCloudSignedIn=()=>false;window.__vzipOptimized=false;window.vzipOptimizeVideo=async()=>{window.__vzipOptimized=true}});
  await page.locator('#vzip-hub-upload').setInputFiles({name:'lesson.m4a',mimeType:'audio/mp4',buffer:Buffer.alloc(1024,1)});
  await expect(page.locator('#vzip-hub-status')).toContainText('클라우드 로그인이 필요');
  expect(await page.evaluate(()=>window.__vzipOptimized)).toBe(false);
  expect(page.__vzipErrors).toEqual([]);
});

test('Each recording saves its own song, satisfaction and listening notes',async({page})=>{
  await cloudFiles(page,[cloudRow('take-a','첫 번째 테이크'),cloudRow('take-b','두 번째 테이크')]);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('[data-id="take-a"] [data-action="edit"]').click();
  await page.locator('.vzip-media-edit-sheet [name="customSong"]').fill('The Winner Takes It All');
  await page.locator('.vzip-media-edit-sheet [name="rating"]').selectOption('4');
  await page.locator('.vzip-media-edit-sheet [name="review"]').fill('저음 안정적, 후렴 호흡 아쉬움');
  await page.locator('.vzip-media-edit-sheet [data-save]').click();
  await expect.poll(()=>page.evaluate(()=>window.__cloudUpdates.length)).toBeGreaterThan(0);
  const updated=await page.evaluate(()=>window.__cloudUpdates.at(-1).payload.metadata);
  expect(updated.song).toBe('The Winner Takes It All');
  expect(updated.rating).toBe(4);
  expect(updated.review).toBe('저음 안정적, 후렴 호흡 아쉬움');
  expect(updated.id).toBe('take-a');
  await page.locator('[data-id="take-b"] [data-action="edit"]').click();
  await expect(page.locator('.vzip-media-edit-sheet [name="rating"]')).toHaveValue('');
  await expect(page.locator('.vzip-media-edit-sheet [name="review"]')).toHaveValue('');
});

test('Media date field stays within edit sheet at iPhone width',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await cloudFiles(page,[cloudRow('ios-date','아이폰 날짜 확인')]);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('[data-id="ios-date"] [data-action="edit"]').click();
  const date=page.locator('.vzip-media-edit-sheet input[type="date"]');
  await expect(date).toBeVisible();
  const bounds=await date.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.vzip-media-edit-sheet').getBoundingClientRect(),css=getComputedStyle(el);return {left:a.left,right:a.right,sheetLeft:b.left,sheetRight:b.right,height:a.height,font:parseFloat(css.fontSize)}});
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.sheetLeft);
  expect(bounds.right).toBeLessThanOrEqual(bounds.sheetRight+1);
  expect(bounds.height).toBeLessThanOrEqual(52);
  expect(bounds.font).toBe(16);
});

test('Practice date input itself stays within its card on iPhone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.locator('.hero [data-go-tab="practice"]').click();
 const date=page.locator('#practice-form input[type="date"]');
 await expect(date).toBeVisible();
 const m=await date.evaluate(el=>{const a=el.getBoundingClientRect(),p=el.closest('.card').getBoundingClientRect(),css=getComputedStyle(el);return {left:a.left,right:a.right,cardLeft:p.left,cardRight:p.right,width:a.width,height:a.height,box:css.boxSizing}});
 expect(m.left).toBeGreaterThanOrEqual(m.cardLeft);
 expect(m.right).toBeLessThanOrEqual(m.cardRight+1);
 expect(m.height).toBeLessThanOrEqual(52);
 expect(m.box).toBe('border-box');
});

test('iPhone practice date has isolated clipped full-width layout',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.locator('.hero [data-go-tab="practice"]').click();
 const frame=page.locator('#practice-form .vzip-practice-date-frame');
 const date=frame.locator('input[type="date"]');
 await expect(date).toBeVisible();
 const m=await date.evaluate(el=>{const a=el.getBoundingClientRect(),f=el.parentElement.getBoundingClientRect(),c=el.closest('.card').getBoundingClientRect(),n=document.querySelector('#practice-minutes').getBoundingClientRect();return {left:a.left,right:a.right,frameLeft:f.left,frameRight:f.right,cardRight:c.right,frameTop:f.top,frameBottom:f.bottom,minutesTop:n.top,overflow:getComputedStyle(el.parentElement).overflow}});
 expect(m.right).toBeLessThanOrEqual(m.frameRight+1);
 expect(m.frameRight).toBeLessThanOrEqual(m.cardRight+1);
 expect(m.overflow).toBe('hidden');
 await date.fill('2026-11-03');
 await expect(date).toHaveValue('2026-11-03');
});

async function seedHistory(page, patch) {
  await page.evaluate(patch=>{
    const state={categories:[{id:'c1',name:'발성',items:['립트릴']}],songs:[],lessons:[],assignments:[],practices:[],...JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}')};
    localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify({...state,...patch}));
  },patch);
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
}
async function failRecordWrites(page) {
  await page.evaluate(()=>{
    window.__restoreWrites=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key==='vocal-zip_mvp_v1')throw new DOMException('test quota failure','QuotaExceededError');
      return window.__restoreWrites.call(this,key,value);
    };
  });
}
async function restoreRecordWrites(page) {
  await page.evaluate(()=>{Storage.prototype.setItem=window.__restoreWrites});
}
async function addSimplePractice(page,memo) {
  await page.locator('.nav [data-tab="home"]').click();
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-form [name="memo"]').fill(memo);
  await page.locator('#practice-form>button:not([type])').click();
}
test('Deleting an originating lesson preserves carried homework and its practice history',async({page})=>{
  await seedHistory(page,{
    lessons:[{id:'first',date:'2026-10-01',feedback:'첫 레슨'},{id:'second',date:'2026-10-08',feedback:'이어간 레슨'}],
    assignments:[
      {id:'carried',lessonId:'first',lessonIds:['first','second'],title:'계속할 숙제',status:'active'},
      {id:'unpracticed',lessonId:'first',lessonIds:['first'],title:'아직 연습 안 한 숙제',status:'active'},
      {id:'practiced',lessonId:'first',lessonIds:['first'],title:'수행 이력 있는 숙제',status:'active'}
    ],
    practices:[{id:'history',date:'2026-10-02',minutes:10,rating:3,completed:['practiced'],assignmentNotes:{practiced:'남겨야 할 숙제 메모'}}]
  });
  await page.locator('.nav [data-tab="lessons"]').click();
  await page.locator('#lesson-list [data-id="first"]').click();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')));
  expect(state.lessons.map(item=>item.id)).toEqual(['second']);
  expect(state.assignments).toHaveLength(3);
  expect(state.assignments.find(item=>item.id==='carried').lessonIds).toEqual(['second']);
  expect(state.assignments.find(item=>item.id==='practiced').lessonIds).toEqual([]);
  expect(state.practices[0].assignmentNotes.practiced).toBe('남겨야 할 숙제 메모');
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.locator('.nav [data-tab="lessons"]').click();
  await expect(page.locator('#lesson-list')).toContainText('계속할 숙제');
  await expect(page.locator('#assignment-history')).toContainText('아직 연습 안 한 숙제');
  await expect(page.locator('#assignment-history')).toContainText('남겨야 할 숙제 메모');
});
test('Failed practice deletion cannot leak into a later successful save',async({page})=>{
  await addSimplePractice(page,'삭제 실패 때 남겨야 하는 연습');
  await failRecordWrites(page);
  await page.locator('#practice-list [data-delete="practice"]').click();
  await expect(page.locator('#practice-list')).toContainText('삭제 실패 때 남겨야 하는 연습');
  await restoreRecordWrites(page);
  await addSimplePractice(page,'다음 저장');
  const practices=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices);
  expect(practices).toHaveLength(2);
  expect(practices.some(item=>item.memo.includes('삭제 실패 때 남겨야 하는 연습'))).toBe(true);
});
test('Failed homework completion rolls back and successful completion survives reload',async({page})=>{
  await seedHistory(page,{assignments:[{id:'task',lessonId:'prior',lessonIds:['prior'],title:'숙제 상태 복구',status:'active'}]});
  await page.locator('.nav [data-tab="lessons"]').click();
  await failRecordWrites(page);
  await page.locator('[data-status="done"][data-id="task"]').click();
  await expect(page.locator('[data-status="done"][data-id="task"]')).toBeVisible();
  await restoreRecordWrites(page);
  await addSimplePractice(page,'다른 저장 후 숙제 상태 확인');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).assignments[0].status)).toBe('active');
  await page.locator('.nav [data-tab="lessons"]').click();
  await page.locator('[data-status="done"][data-id="task"]').click();
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  await page.locator('.nav [data-tab="lessons"]').click();
  await expect(page.locator('[data-status="active"][data-id="task"]')).toHaveText('다시 진행');
  await page.locator('.nav [data-tab="home"]').click();
  await page.locator('.hero [data-go-tab="practice"]').click();
  await expect(page.locator('#homework-checks input[value="task"]')).toHaveCount(0);
});
test('Failed lesson save preserves homework and retries without duplicate lessons or tasks',async({page})=>{
  await seedHistory(page,{lessons:[{id:'prior',date:'2026-10-01',feedback:'이전 레슨'}],
    assignments:[{id:'carry',lessonId:'prior',lessonIds:['prior'],title:'기존 숙제',status:'active'}]});
  await page.locator('.hero [data-go-tab="lessons"]').click();
  await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
  await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
  await page.locator('#lesson-form [name="feedback"]').fill('저장 실패 후 유지할 피드백');
  await page.locator('#lesson-form [name="homework"]').fill('추가 숙제');
  await page.locator('#carryover-checks input[value="carry"]').check();
  await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
  await failRecordWrites(page);
  await page.getByRole('button',{name:'레슨 및 숙제 저장',exact:true}).click();
  await expect(page.locator('#lesson-form')).toBeVisible();
  await expect(page.locator('.wizard-summary')).toContainText('저장 실패 후 유지할 피드백');
  await restoreRecordWrites(page);
  await page.getByRole('button',{name:'레슨 및 숙제 저장',exact:true}).click();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')));
  expect(state.lessons).toHaveLength(2);expect(state.assignments).toHaveLength(2);
  expect(state.assignments.find(item=>item.id==='carry').lessonIds).toHaveLength(2);
});
test('Song input survives quota failure and retry creates one catalog entry',async({page})=>{
  await page.locator('#vzip-open-settings').click();
  await page.locator('#manage [data-ia-open="songs"]').click();
  await page.locator('#song-form [name="title"]').fill('실패 후 다시 저장할 곡');
  await failRecordWrites(page);
  await page.locator('#song-form button').click();
  await expect(page.locator('#song-form [name="title"]')).toHaveValue('실패 후 다시 저장할 곡');
  await restoreRecordWrites(page);
  await page.locator('#song-form button').click();
  const songs=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).songs);
  expect(songs).toHaveLength(1);expect(songs[0].title).toBe('실패 후 다시 저장할 곡');
});

async function installUploadProbe(page, mode='hold') {
  await page.evaluate(mode=>{
    window.__uploadMode=mode;window.__uploadCalls=[];window.__uploadAborts=0;
    window.__fullFileReads=0;window.__largeFilePreviews=0;window.__localImportWrites=0;
    const originalSize=Object.getOwnPropertyDescriptor(Blob.prototype,'size').get;
    Object.defineProperty(File.prototype,'size',{configurable:true,get(){
      if(this.name==='large.m4a')return 26*1024*1024;
      if(this.name==='oversized.m4a')return 1024*1024*1024+1;
      return originalSize.call(this);
    }});
    const arrayBuffer=Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer=function(){
      if(this instanceof File&&this.size>25*1024*1024){window.__fullFileReads++;throw Error('large file read into memory')}
      return arrayBuffer.call(this);
    };
    const objectURL=URL.createObjectURL;
    URL.createObjectURL=function(blob){
      if(blob instanceof File&&blob.size>25*1024*1024){window.__largeFilePreviews++;throw Error('large audio decoded before upload')}
      return objectURL.call(URL,blob);
    };
    const store=window.vzipStorePracticeMedia;
    window.vzipStorePracticeMedia=item=>{window.__localImportWrites++;return store(item)};
    window.tus={Upload:class{
      constructor(file,options){
        this.options=options;window.__uploadOptions=options;
        window.__uploadCalls.push({name:file.name,size:file.size,chunkSize:options.chunkSize,
          creation:options.uploadDataDuringCreation,fingerprint:options.storeFingerprintForResuming});
      }
      start(){
        if(window.__uploadMode==='hold')return;
        this.timer=setTimeout(()=>{
          if(window.__uploadMode==='error')this.options.onError(Error('test network interruption'));
          else{this.options.onProgress(26,26);this.options.onSuccess()}
        },20);
      }
      abort(){window.__uploadAborts++;clearTimeout(this.timer);return Promise.resolve()}
    }};
  },mode);
}
const largeUpload=()=>({name:'large.m4a',mimeType:'audio/mp4',buffer:Buffer.alloc(32)});
test('Large practice import streams to cloud without local allocation or preview and links only after success',async({page})=>{
  await installUploadProbe(page,'success');
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('[data-mode="song"]').click();
  await page.locator('#practice-form [name="minutes"]').fill('7');
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  await page.locator('#practice-form>button:not([type])').click();
  const result=await page.evaluate(()=>({
    record:JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).practices[0],
    meta:window.__cloudMetadata.find(row=>row.table==='vocal_media').payload.metadata,
    reads:window.__fullFileReads,previews:window.__largeFilePreviews,local:window.__localImportWrites,calls:window.__uploadCalls
  }));
  expect(result.reads).toBe(0);expect(result.previews).toBe(0);expect(result.local).toBe(0);
  expect(result.record.mediaIds).toEqual([result.meta.id]);expect(result.record.minutes).toBe(7);
  expect(result.meta.source).toBe('practice');expect(result.meta.type).toBe('audio/mp4');
  expect(result.calls).toHaveLength(1);expect(result.calls[0].chunkSize).toBe(6*1024*1024);
  expect(result.calls[0].creation).toBe(false);expect(result.calls[0].fingerprint).toBe(false);
});
test('Cancelling a practice upload aborts transport, clears the input and permits a new upload',async({page})=>{
  await installUploadProbe(page);
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect.poll(()=>page.evaluate(()=>window.__uploadCalls.length)).toBe(1);
  await expect(page.locator('#practice-form>button:not([type])')).toBeDisabled();
  await page.locator('#vzip-practice-import-cancel').click();
  await expect(page.locator('#media-preview')).toContainText('취소');
  await expect(page.locator('#practice-attachments')).toBeEnabled();
  expect(await page.locator('#practice-attachments').inputValue()).toBe('');
  expect(await page.evaluate(()=>window.__uploadAborts)).toBe(1);
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds||'[]'))).toEqual([]);
  expect(await page.evaluate(()=>window.__cloudMetadata.filter(row=>row.table==='vocal_media').length)).toBe(0);
  await page.evaluate(()=>{window.__uploadMode='success'});
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds))).toHaveLength(1);
});
test('Failed cloud import never attaches a missing file and can be selected again',async({page})=>{
  await installUploadProbe(page,'error');
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('test network interruption');
  await expect(page.locator('#practice-attachments')).toBeEnabled();
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds||'[]'))).toEqual([]);
  await page.evaluate(()=>{window.__uploadMode='success'});
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  expect(await page.evaluate(()=>window.__uploadCalls.length)).toBe(2);
});
test('Library and practice cannot run concurrent large uploads and library cancel releases the lock',async({page})=>{
  await installUploadProbe(page);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('#vzip-hub-upload').setInputFiles(largeUpload());
  await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__uploadCalls.length)).toBe(1);
  await page.locator('.nav [data-tab="home"]').click();
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('다른 파일을 업로드');
  expect(await page.evaluate(()=>window.__uploadCalls.length)).toBe(1);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('#vzip-hub-upload-cancel').click();
  await expect(page.locator('#vzip-hub-status')).toContainText('취소');
  await expect(page.locator('#vzip-hub-upload')).toBeEnabled();
  expect(await page.locator('#vzip-hub-upload').inputValue()).toBe('');
  await page.evaluate(()=>{window.__uploadMode='success'});
  await page.locator('#vzip-hub-upload').setInputFiles(largeUpload());
  await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
  await expect(page.locator('#vzip-hub-status')).toContainText('보관함 저장 완료');
  expect(await page.evaluate(()=>window.__uploadCalls.length)).toBe(2);
});
test('Oversized files are rejected in both import forms before allocation or upload',async({page})=>{
  await installUploadProbe(page);
  await page.locator('.hero [data-go-tab="practice"]').click();
  await expect(page.locator('#practice-attachments')).toHaveAttribute('multiple','');
  await page.locator('#practice-attachments').setInputFiles({name:'oversized.m4a',mimeType:'audio/mp4',buffer:Buffer.alloc(32)});
  await expect(page.locator('#media-preview')).toContainText('1GB');
  await page.locator('.nav [data-tab="media"]').click();
  await expect(page.locator('#vzip-hub-upload')).toHaveAttribute('multiple','');
  await page.locator('#vzip-hub-upload').setInputFiles({name:'oversized.m4a',mimeType:'audio/mp4',buffer:Buffer.alloc(32)});
  await expect(page.locator('#vzip-hub-status')).toContainText('1GB');
  const result=await page.evaluate(()=>({calls:window.__uploadCalls.length,reads:window.__fullFileReads,
    previews:window.__largeFilePreviews,local:window.__localImportWrites}));
  expect(result).toEqual({calls:0,reads:0,previews:0,local:0});
});
test('Large practice import without login keeps the draft and explains cloud requirement',async({page})=>{
  await installUploadProbe(page);
  await page.evaluate(()=>{window.vzipCloudSignedIn=()=>false});
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-form [name="memo"]').fill('가져오기 실패 후 보존');
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('클라우드 로그인이 필요');
  await expect(page.locator('#practice-form [name="memo"]')).toHaveValue('가져오기 실패 후 보존');
  await expect(page.locator('#practice-form>button:not([type])')).toBeEnabled();
  expect(await page.evaluate(()=>window.__fullFileReads+window.__largeFilePreviews+window.__localImportWrites)).toBe(0);
});

test('Upload song choices persist independently and survive a later practice save',async({page})=>{
  await seedHistory(page,{songs:[{id:'s1',title:'같은 제목'},{id:'s2',title:'같은 제목'}]});
  await page.evaluate(()=>{window.vzipCloudSignedIn=()=>false});
  await page.locator('.nav [data-tab="media"]').click();
  const upload=()=>page.locator('#vzip-hub-upload').setInputFiles({name:'take.wav',mimeType:'audio/wav',buffer:wav()});
  await upload();await page.getByLabel('업로드할 곡').selectOption('s1');
  await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
  await expect(page.locator('.vzip-hub-item')).toHaveCount(1);
  await upload();await page.getByPlaceholder('목록에 없는 곡명 입력',{exact:true}).last().fill('새로 등록한 곡');
  await failRecordWrites(page);await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'업로드 곡 선택'})).toContainText('곡 저장 실패');
  await restoreRecordWrites(page);await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
  await expect(page.locator('.vzip-hub-item')).toHaveCount(2);
  await upload();await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
  await expect(page.locator('.vzip-hub-item')).toHaveCount(3);
  await upload();await page.getByRole('dialog',{name:'업로드 곡 선택'}).getByRole('button',{name:'취소',exact:true}).click();
  await expect(page.locator('#vzip-hub-upload')).toBeEnabled();
  await expect(page.locator('.vzip-hub-item')).toHaveCount(3);
  await expect(page.locator('#practice-song option')).toContainText(['곡 선택 안 함','같은 제목','같은 제목','새로 등록한 곡']);
  await addSimplePractice(page,'곡 등록 이후 저장');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).songs.map(x=>x.title))).toContain('새로 등록한 곡');
  await page.reload();await page.locator('.nav [data-tab="media"]').click();
  await expect(page.locator('.vzip-hub-item')).toHaveCount(3);
  await page.getByRole('button',{name:'♫ 곡별 묶어보기',exact:true}).click();
  await expect(page.locator('.vzip-song-group-title')).toHaveCount(3);
  await expect(page.locator('[data-song-key="unassigned"]')).toContainText('1개 녹음');
});

test('Song grouping uses stable ids and keeps legacy and unassigned recordings separate',async({page})=>{
  const rows=[['a','s1','같은 제목'],['b','s2','같은 제목'],['c','s1','이전 제목'],['d','',''],['e','','같은 제목']].map(([id,songId,song])=>{
    const row=cloudRow(id,id);Object.assign(row.metadata,{songId,song,rating:3,review:id+' 감상'});return row;
  });
  await cloudFiles(page,rows);await page.locator('.nav [data-tab="media"]').click();
  await expect(page.locator('.vzip-hub-item')).toHaveCount(5);
  await page.getByRole('button',{name:'♫ 곡별 묶어보기',exact:true}).click();
  await expect(page.locator('.vzip-song-group-title')).toHaveCount(4);
  await expect(page.locator('[data-song-key="id:s1"]')).toContainText('2개 녹음');
  await expect(page.locator('[data-song-key="id:s2"]')).toContainText('1개 녹음');
  await expect(page.locator('[data-id="a"]')).toContainText('a 감상');
  await page.getByRole('button',{name:'☷ 최신순으로 보기',exact:true}).click();
  await expect(page.locator('.vzip-song-group-title')).toHaveCount(0);
});

test('Comparison prioritizes song ids, preserves drafts on failure and reopens ratings and goals',async({page},testInfo)=>{
  await seedHistory(page,{songs:[{id:'s',title:'비교 곡'}]});
  const rows=[['older','s',2,'이전 감상',1000],['newer','s',4,'최근 감상',2000],['other','other',5,'다른 곡',3000]].map(([id,songId,rating,review,created])=>{const row=cloudRow(id,id);Object.assign(row.metadata,{songId,song:'비교 곡',rating,review,created});return row});
  await cloudFiles(page,rows);await page.locator('.nav [data-tab="media"]').click();
  await expect(page.locator('.vzip-hub-item')).toHaveCount(3);
  await page.locator('[data-id="newer"] [data-action="compare"]').click();
  expect(await page.locator('.vzip-choice').evaluateAll(nodes=>nodes.map(n=>n.dataset.id))).toEqual(['newer','older','other']);
  await page.locator('.vzip-choice[data-id="older"]').click();await page.locator('#vzip-compare-start').click();
  await expect(page.locator('#vzip-report-content')).toContainText('이전 감상');
  await expect(page.locator('#vzip-report-content')).toContainText('4/5');
  await page.locator('#vzip-rp-notes').fill('호흡 유지가 좋아짐');await page.locator('#vzip-rp-goal').fill('긴 프레이즈 연습');
  await page.screenshot({path:testInfo.outputPath('comparison.png'),fullPage:true});
  await failRecordWrites(page);await page.locator('#vzip-rp-save').click();
  await expect(page.locator('#vzip-rp-status')).toContainText('저장 실패');await expect(page.locator('#vzip-rp-goal')).toHaveValue('긴 프레이즈 연습');
  await restoreRecordWrites(page);await page.locator('#vzip-rp-save').click();
  await expect(page.locator('#vzip-rp-status')).toContainText('저장 완료');
  await addSimplePractice(page,'비교 저장 후 연습');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).comparisonReports)).toHaveLength(1);
  await page.reload();await page.locator('.nav [data-tab="archive"]').click();
  await page.getByRole('button',{name:'저장한 리포트',exact:true}).click();
  await page.locator('[data-report-action="view"]').click();await expect(page.locator('#vzip-rp-goal')).toHaveValue('긴 프레이즈 연습');
});

test('Song growth counts only linked records and shows real ratings, goals and empty states',async({page},testInfo)=>{
  await seedHistory(page,{songs:[{id:'s',title:'성장 곡'},{id:'empty',title:'빈 곡'}],practices:[{id:'p',date:'2026-11-01',songId:'s',minutes:15},{id:'q',date:'2026-11-02',songId:'s',minutes:5},{id:'x',date:'2026-11-01',songId:'other',minutes:99}],comparisonReports:[{id:'r',songId:'s',notes:'호흡 개선',goal:'프레이즈 연습'}]});
  const rows=[cloudRow('old','이전'),cloudRow('new','최근')];rows.forEach((r,i)=>Object.assign(r.metadata,{songId:'s',song:'성장 곡',created:1000+i*86400000,rating:i?4:2}));
  await cloudFiles(page,rows);await page.locator('.nav [data-tab="media"]').click();await expect(page.locator('.vzip-hub-item')).toHaveCount(2);
  await page.locator('.nav [data-tab="archive"]').click();await page.locator('#vzip-growth-song').selectOption('s');
  const body=page.locator('#vzip-song-growth-content');await expect(body).toContainText('연습 2회 · 누적 20분 · 녹음 2개');await expect(body).toContainText('2 / 5');await expect(body).toContainText('프레이즈 연습');
  await page.screenshot({path:testInfo.outputPath('song-growth.png'),fullPage:true});
  await body.getByRole('button').click();await expect(page.locator('#vzip-report-content')).toContainText('성장 곡');
  await page.locator('#vzip-report-back').click();await page.locator('#vzip-growth-song').selectOption('empty');await expect(body).toContainText('연습 시간 기록 없음');await expect(body).toContainText('아직 이 곡에 연결된 녹음이 없어요');
});

test('Lesson edit cancel and failed save preserve recordings, carried homework and practice notes',async({page},testInfo)=>{
  const lesson={id:'lesson-edit',date:'2026-11-01',songId:'s',feedback:'원본 피드백',memo:'원본 메모',recordings:['media-keep']};
  await seedHistory(page,{songs:[{id:'s',title:'원래 곡'},{id:'next',title:'다음 곡'}],lessons:[lesson],assignments:[{id:'task',title:'원본 숙제',lessonId:'lesson-edit',lessonIds:['lesson-edit','other'],status:'active'}],practices:[{id:'p',date:'2026-11-02',completed:['task'],assignmentNotes:{task:'수행 메모'},minutes:10}]});
  await page.locator('.nav [data-tab="lessons"]').click();await page.locator('[data-edit-lesson]').click();const dialog=page.getByRole('dialog',{name:'레슨 수정'});
  await dialog.locator('[name="memo"]').fill('취소 메모');await dialog.getByRole('button',{name:'취소',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).lessons[0])).toEqual(lesson);
  await page.locator('[data-edit-lesson]').click();await dialog.locator('[name="date"]').fill('2026-11-03');await dialog.locator('[name="song"]').selectOption('next');await dialog.locator('[name="feedback"]').fill('수정 피드백');await dialog.locator('[name="memo"]').fill('수정 메모');await dialog.getByLabel('숙제 내용').fill('수정 숙제');await dialog.getByLabel('숙제 상태').selectOption('done');
  await page.screenshot({path:testInfo.outputPath('lesson-edit.png'),fullPage:true});
  await failRecordWrites(page);await dialog.getByRole('button',{name:'수정 저장'}).click();await expect(dialog).toContainText('입력은 유지');await expect(dialog.locator('[name="memo"]')).toHaveValue('수정 메모');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).lessons[0])).toEqual(lesson);
  await restoreRecordWrites(page);await dialog.getByRole('button',{name:'수정 저장'}).click();await expect(dialog).toHaveCount(0);
  await page.reload();const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')));
  expect(state.lessons[0]).toMatchObject({date:'2026-11-03',songId:'next',memo:'수정 메모',feedback:'수정 피드백',recordings:['media-keep']});expect(state.assignments[0]).toMatchObject({id:'task',title:'수정 숙제',status:'done',lessonIds:['lesson-edit','other']});expect(state.practices[0].assignmentNotes.task).toBe('수행 메모');
});


test('Metadata failure after transport never attaches a missing recording and retry succeeds',async({page})=>{
  await installUploadProbe(page,'success');await page.evaluate(()=>{window.__failMetadata=true});
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('metadata save failed');
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds||'[]'))).toEqual([]);
  await page.evaluate(()=>{window.__failMetadata=false});
  await page.locator('#practice-attachments').setInputFiles(largeUpload());
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds))).toHaveLength(1);
});


test('Missing recording dates stay unknown in the library and comparison',async({page})=>{
 const a=cloudRow('missing','날짜 없는 녹음'),b=cloudRow('dated','날짜 있는 녹음');a.metadata.created=null;
 await cloudFiles(page,[a,b]);await page.locator('.nav [data-tab="media"]').click();
 await expect(page.locator('[data-id="missing"]')).toContainText('날짜 미상');
 await page.locator('[data-id="missing"] [data-action="compare"]').click();await page.locator('.vzip-choice[data-id="dated"]').click();await page.locator('#vzip-compare-start').click();
 await expect(page.locator('#vzip-report-content')).toContainText('날짜 기록 부족');
});


for(const location of ['practice','library'])test('Upload progress and synthetic pagehide cancellation ignore late callbacks: '+location,async({page})=>{
 await installUploadProbe(page);
 if(location==='practice')await page.locator('.hero [data-go-tab="practice"]').click();else await page.locator('.nav [data-tab="media"]').click();
 const input=page.locator(location==='practice'?'#practice-attachments':'#vzip-hub-upload');
 const status=page.locator(location==='practice'?'#media-preview':'#vzip-hub-status');
 await input.setInputFiles(largeUpload());if(location==='library')await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__uploadCalls.length)).toBe(1);
 await page.evaluate(()=>window.__uploadOptions.onProgress(13,26));await expect(status).toContainText('50%');
 await page.evaluate(()=>{window.__lateUpload=window.__uploadOptions;window.dispatchEvent(new Event('pagehide'))});
 await expect(status).toContainText('취소');await expect(input).toBeEnabled();
 await page.evaluate(()=>{window.__lateUpload.onProgress(26,26);window.__lateUpload.onSuccess();window.__lateUpload.onError(Error('late network callback'))});
 await expect(status).toContainText('취소');
 expect(await page.evaluate(()=>window.__cloudMetadata.filter(x=>x.table==='vocal_media'))).toHaveLength(0);
 expect(await page.evaluate(()=>window.__uploadAborts)).toBe(1);
 await page.evaluate(()=>{window.__uploadMode='success'});await input.setInputFiles(largeUpload());
 if(location==='library')await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
 await expect(status).toContainText('보관함 저장 완료');
});

test('Account change during metadata commit never attaches the previous account file',async({page})=>{
 await installUploadProbe(page,'success');await page.locator('.hero [data-go-tab="practice"]').click();
 await page.evaluate(()=>{window.__onMetadataWrite=()=>window.__authCallbacks.forEach(callback=>callback('SIGNED_IN',{user:{id:'other-user',email:'other@example.invalid'}}))});
 await page.locator('#practice-attachments').setInputFiles(largeUpload());
 await expect(page.locator('#media-preview')).toContainText('로그인이 변경');
 expect(await page.evaluate(()=>JSON.parse(document.querySelector('#practice-form').dataset.mediaIds||'[]'))).toEqual([]);
 expect(await page.evaluate(()=>window.__cloudMetadata.find(x=>x.table==='vocal_media').payload.user_id)).toBe('ui-test-user');
 await expect(page.locator('#practice-attachments')).toBeEnabled();
});

test('Cloud importer preserves the single-object 50MB boundary and rejects over 1GB before transport',async({page})=>{
 await installUploadProbe(page,'success');
 const result=await page.evaluate(async()=>{
  const file=new File(['test'],'boundary.m4a',{type:'audio/mp4'});Object.defineProperty(file,'size',{value:50*1024*1024});
  const item=await window.vzipCloudImport(file);const tooLarge=new File(['test'],'too-large.m4a',{type:'audio/mp4'});Object.defineProperty(tooLarge,'size',{value:1024*1024*1024+1});
  let error='';try{await window.vzipCloudImport(tooLarge)}catch(e){error=e.message}
  return {size:item.size,error,calls:window.__uploadCalls.length};
 });
 expect(result.size).toBe(50*1024*1024);expect(result.error).toContain('1GB');expect(result.calls).toBe(1);
});


test('Recorder pause excludes paused time and mark preserves memo', async ({page,browserName},testInfo) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium fake microphone, not a real iPhone.');
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-form [name=memo]').fill('기존 메모');
  await page.locator('#vzip-capture-start').click();
  await expect(page.locator('#vzip-capture-pause')).toBeVisible();
  await page.waitForTimeout(1100);
  await page.locator('#vzip-capture-mark').click();
  expect(await page.locator('#practice-form [name=memo]').inputValue()).toMatch(/기존 메모\n\[00:0[1-9]\] 다시 듣기/);
  await page.locator('#vzip-capture-pause').click();
  await page.waitForTimeout(600);
  await testInfo.attach('recorder-paused',{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  const frozen = await page.locator('#vzip-capture-clock').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#vzip-capture-clock')).toHaveText(frozen);
  await expect(page.locator('#vzip-capture-mark')).toBeDisabled();
  await page.locator('#vzip-capture-stop').click();
  await expect(page.locator('#vzip-capture-status')).toContainText('저장 완료');
  await expect(page.locator('#vzip-capture-start')).toBeVisible();
  const items = await page.evaluate(() => window.vzipReadMedia());
  expect(items[0].waveform.length).toBeGreaterThan(0);
  expect(items[0].waveform.length).toBeLessThanOrEqual(512);
  expect(items[0].durationSeconds).toBeGreaterThan(0);
  expect(items[0].durationSeconds).toBeLessThan(3);
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('#vzip-hub-list [data-action=play]').click();
  await expect(page.locator('.vzip-player-wave')).toBeVisible();
  await expect(page.locator('.vzip-player input[type=range]')).toBeEnabled();
  await page.locator('.vzip-player-wave').click();
  await expect(page.locator('.vzip-player-wave')).toBeVisible();
  await testInfo.attach('recorded-waveform-player',{body:await page.screenshot({fullPage:false}),contentType:'image/png'});

});

test('Player card seeks, toggles playback and exposes native fallback', async ({page,browserName},testInfo) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows WebKit WAV codec unavailable.');
  await page.locator('.hero [data-go-tab="practice"]').click();
  await page.locator('#practice-attachments').setInputFiles({name:'player-test.wav',mimeType:'audio/wav',buffer:wav()});
  await expect(page.locator('#media-preview')).toContainText('보관함 저장 완료');
  await page.locator('.nav [data-tab="media"]').click();
  await page.locator('#vzip-hub-list [data-action=play]').click();
  const card = page.locator('#vzip-hub-list .vzip-player'), media = card.locator('audio');
  await expect(card.locator('input[type=range]')).toBeEnabled();
  await media.evaluate(el => el.pause());
  await card.getByRole('slider').fill('0.5');
  expect(await media.evaluate(el => el.currentTime)).toBeCloseTo(.5, 1);
  await card.getByRole('button',{name:'재생',exact:true}).click();
  await expect.poll(() => media.evaluate(el => el.paused)).toBe(false);
  await card.locator('summary').click();
  await expect(media).toBeVisible();
  await card.locator('summary').click();
  await testInfo.attach('player-card',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});


test('Calendar respects leap days, month rollover and selection without changing data',async({page})=>{
  await page.locator('.nav [data-tab=practice]').click();
  const before=await page.evaluate(()=>localStorage.getItem('vocal-zip_mvp_v1'));
  const month=page.getByLabel('기록 월 선택');
  await month.fill('2024-02');
  await expect(page.locator('.vzip-calendar-day')).toHaveCount(29);
  await page.locator('[data-date="2024-02-29"]').click();
  await page.getByRole('button',{name:'다음 달',exact:true}).click();
  await expect(month).toHaveValue('2024-03');
  await expect(page.locator('.vzip-calendar-day[aria-pressed=true]')).toHaveAttribute('data-date','2024-03-29');
  await month.fill('2025-02');
  await expect(page.locator('.vzip-calendar-day')).toHaveCount(28);
  await expect(page.locator('.vzip-calendar-day[aria-pressed=true]')).toHaveAttribute('data-date','2025-02-28');
  await month.fill('2025-12');
  await page.getByRole('button',{name:'다음 달',exact:true}).click();
  await expect(month).toHaveValue('2026-01');
  expect(await page.evaluate(()=>localStorage.getItem('vocal-zip_mvp_v1'))).toBe(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Calendar combines same-day practice, lesson and performed homework with working record links',async({page})=>{
  await seedHistory(page,{songs:[{id:'s1',title:'같은 곡'}],assignments:[{id:'t1',title:'호흡 유지',status:'active',lessonId:'l1'}],
    lessons:[{id:'l1',date:'2024-02-29',songId:'s1',feedback:'프레이즈 연결',memo:'레슨 메모'}],
    practices:[{id:'p1',date:'2024-02-29',songId:'s1',minutes:12,rating:4,memo:'연습 메모',completed:['t1'],mediaIds:[]}]});
  await page.locator('.nav [data-tab=practice]').click();
  await page.getByLabel('기록 월 선택').fill('2024-02');
  await page.locator('[data-date="2024-02-29"]').click();
  const daily=page.locator('.vzip-calendar-records');
  await expect(daily).toContainText('같은 곡');await expect(daily).toContainText('12분');await expect(daily).toContainText('만족도 4/5');
  await expect(daily).toContainText('프레이즈 연결');await expect(daily).toContainText('호흡 유지');
  await daily.locator('[data-record-id=p1]').click();
  await expect(page.locator('#practice-list .item')).toBeFocused();
  await daily.locator('[data-record-id=l1]').click();
  await expect(page.locator('#lessons')).toBeVisible();await expect(page.locator('#lesson-list .item')).toBeFocused();
  await page.locator('.nav [data-tab=practice]').click();
  await expect(page.locator('[data-date="2024-02-29"]')).toHaveAttribute('aria-pressed','true');
});

test('Calendar empty and invalid-date records never invent activity',async({page})=>{
  await seedHistory(page,{lessons:[],practices:[{id:'legacy',date:'2024-02-31',minutes:1,memo:'기존 날짜 기록',completed:[]}]});
  await page.locator('.nav [data-tab=practice]').click();await page.getByLabel('기록 월 선택').fill('2024-02');
  await expect(page.locator('.vzip-calendar-day.has-records')).toHaveCount(0);
  await expect(page.locator('.vzip-calendar-records')).toContainText('이날 남긴 기록이 없어요');
  await expect(page.locator('#practice-list')).toContainText('기존 날짜 기록');
});

for(const target of ['library','practice'])test('Multiple files choose independent songs and retry only the failed file: '+target,async({page})=>{
 await seedHistory(page,{songs:[{id:'s1',title:'첫 곡'},{id:'s2',title:'둘째 곡'}]});
 await page.evaluate(()=>{
  window.__batchCalls=[];window.__batchFailed=false;
  window.vzipCloudImport=async(file,info,progress)=>{
   window.__batchCalls.push({fileName:file.name,...info});progress(55);
   if(file.name==='second.wav'&&!window.__batchFailed){window.__batchFailed=true;throw Error('일시적인 전송 오류')}
   return {id:'saved-'+file.name,durationSeconds:0};
  };
  if(location)Object.defineProperty(File.prototype,'size',{configurable:true,get(){return 30*1024*1024}});
 });
 if(target==='practice')await page.locator('.hero [data-go-tab=practice]').click();else await page.locator('.nav [data-tab=media]').click();
 const input=page.locator(target==='practice'?'#practice-attachments':'#vzip-hub-upload');
 await input.setInputFiles([{name:'first.wav',mimeType:'audio/wav',buffer:wav()},{name:'second.wav',mimeType:'audio/wav',buffer:wav()}]);
 const dialog=page.getByRole('dialog',{name:'파일별 곡 선택'});
 await dialog.getByLabel('first.wav 곡',{exact:true}).selectOption('s1');
 await dialog.getByLabel('second.wav 곡',{exact:true}).selectOption('s2');
 await dialog.getByRole('button',{name:'선택한 2개 업로드'}).click();
 const host=page.locator(target==='practice'?'#media-preview':'#vzip-hub-upload-queue');
 await expect(host).toContainText('일시적인 전송 오류');
 await host.getByRole('button',{name:'이 파일 다시 시도'}).click();
 // Finished files leave the list; only a count line remains.
 await expect(host.locator('article.vzip-upload-progress')).toHaveCount(0);
 await expect(host.locator('.vzip-upload-done')).toContainText('✓ 보관함 저장 완료 2개');
 const calls=await page.evaluate(()=>window.__batchCalls);
 expect(calls.map(x=>[x.fileName,x.songId])).toEqual([['first.wav','s1'],['second.wav','s2'],['second.wav','s2']]);
 if(target==='practice')expect(await page.locator('#practice-form').evaluate(f=>JSON.parse(f.dataset.mediaIds))).toEqual(['saved-first.wav','saved-second.wav']);
});
test('201MiB original is sliced into independent objects and committed once',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chromium-desktop','Large real byte fixture runs once; other projects cover queue UI and stream contracts.');
 const result=await page.evaluate(async()=>{
  const one=new Uint8Array(1024*1024).fill(1),last=new Uint8Array(1024*1024).fill(7);
  const file=new File([...Array(200).fill(one),last],'real-201MiB.m4a',{type:'audio/mp4'});
  file.arrayBuffer=()=>{throw Error('must not load full original')};
  const calls=[];let active=0,maxActive=0;
  window.tus={Upload:class{
   constructor(piece,options){this.piece=piece;this.options=options}
   start(){active++;maxActive=Math.max(maxActive,active);(async()=>{
    calls.push({size:this.piece.size,path:this.options.metadata.objectName,
     first:new Uint8Array(await this.piece.slice(0,1).arrayBuffer())[0],
     last:new Uint8Array(await this.piece.slice(-1).arrayBuffer())[0]});
    active--;this.options.onProgress(this.piece.size,this.piece.size);this.options.onSuccess();
   })().catch(this.options.onError)}
  }};
  const item=await window.vzipCloudImport(file,{songId:'s1',song:'큰 영상 곡'});
  return {item,calls,maxActive,commits:window.__cloudMetadata.filter(x=>x.table==='vocal_media').length};
 });
 expect(result.item).toMatchObject({storageVersion:2,size:201*1024*1024,songId:'s1'});
 expect(result.item.parts).toHaveLength(9);expect(result.commits).toBe(1);expect(result.maxActive).toBe(1);
 expect(result.calls.every(x=>x.size<=24*1024*1024)).toBe(true);
 expect(result.calls[0].first).toBe(1);expect(result.calls.at(-1).last).toBe(7);
 expect(new Set(result.calls.map(x=>x.path)).size).toBe(9);
});
test('Multipart metadata failure is recovered before retry and delete removes every object',async({page})=>{
 await page.evaluate(()=>{window.tus={Upload:class{constructor(piece,options){this.options=options}start(){this.options.onSuccess()}}}});
 const result=await page.evaluate(async()=>{
  const file=new File([new Uint8Array(51*1024*1024)],'parts.m4a',{type:'audio/mp4'});
  window.__failMetadata=true;try{await window.vzipCloudImport(file)}catch{}
  const pending=JSON.parse(localStorage.getItem('vzip_pending_media_parts_v1'));
  window.__failMetadata=false;
  const item=await window.vzipCloudImport(file);await window.vzipCloudMediaDelete(item);
  return {pending,remaining:JSON.parse(localStorage.getItem('vzip_pending_media_parts_v1')),removed:window.__removedPaths,item};
 });
 expect(result.pending).toHaveLength(1);expect(result.remaining).toHaveLength(0);
 for(const part of [...result.pending[0].paths,...result.item.parts.map(x=>x.path)])expect(result.removed).toContain(part);
});
test('Lesson uses the same capture controls, pauses, marks and saves its own recording association',async({page,browserName},testInfo)=>{
 test.skip(browserName!=='chromium','Fake hardware capture requires Chromium.');
 await page.locator('.hero [data-go-tab=lessons]').click();
 await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
 const box=page.locator('#vzip-lesson-capture');
 await expect(box.locator('[data-kind=video]')).toHaveCount(0);
 const styles=await page.evaluate(()=>{
  const style=id=>{const el=document.getElementById(id),s=getComputedStyle(el);return {width:s.width,height:s.height,background:s.backgroundColor,radius:s.borderRadius}};
  return {lesson:style('vzip-lesson-capture-start'),practice:style('vzip-capture-start'),host:getComputedStyle(document.getElementById('vzip-recorder')).backgroundColor};
 });
 expect(styles.lesson).toEqual(styles.practice);expect(styles.host).toBe('rgba(0, 0, 0, 0)');
 await page.locator('#vzip-lesson-capture-start').click();
 await expect(page.locator('#vzip-lesson-capture-stop')).toBeEnabled();
 await page.waitForTimeout(1100);
 await page.locator('#vzip-lesson-capture-mark').click();
 await page.locator('#vzip-lesson-capture-pause').click();
 await expect(page.locator('#vzip-lesson-capture-pause')).toContainText('계속 녹음');
 await testInfo.attach('lesson-recorder',{body:await page.screenshot(),contentType:'image/png'});
 await page.locator('#vzip-lesson-capture-stop').click();
 await expect(page.locator('#vzip-lesson-capture-status')).toContainText('저장 완료');
 await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
 await expect(page.locator('#vzip-lesson-media-items textarea')).toHaveCount(1);
 await page.locator('#vzip-lesson-media-items textarea').fill('레슨 녹음별 메모');
 await page.getByRole('button',{name:'다음 단계 →',exact:true}).click();
 await page.getByRole('button',{name:'레슨 및 숙제 저장',exact:true}).click();
 const result=await page.evaluate(async()=>({lesson:JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).lessons[0],media:await window.vzipReadMedia()}));
 expect(result.lesson.recordings).toHaveLength(1);
 expect(result.lesson.recordings[0]).toMatchObject({id:result.media[0].id,note:'레슨 녹음별 메모'});
 expect(result.media[0].source).toBe('lesson');expect(result.lesson.memo).toContain('다시 듣기');
});

test('Lost metadata response retries the same file ID without uploading a duplicate',async({page})=>{
 await installUploadProbe(page,'success');
 const result=await page.evaluate(async()=>{
  const file=new File(['original'],'lost-response.wav',{type:'audio/wav'}),info={id:'stable-retry-id'};
  window.__storeCloudMetadata=true;window.__failMetadata=true;
  try{await window.vzipCloudImport(file,info)}catch{}
  window.__failMetadata=false;
  const item=await window.vzipCloudImport(file,info);
  return {id:item.id,calls:window.__uploadCalls.length,rows:window.__cloudRows.length,pending:JSON.parse(localStorage.getItem('vzip_pending_media_parts_v1'))};
 });
 expect(result).toEqual({id:'stable-retry-id',calls:1,rows:1,pending:[]});
});

test('Another tab cannot clean up or overwrite an active upload',async({page,context})=>{
 test.skip(!await page.evaluate(()=>!!navigator.locks?.request),'Web Locks is unavailable in this browser.');
 await installUploadProbe(page);
 await page.evaluate(()=>{
  window.__heldController=new AbortController();
  window.__heldImport=window.vzipCloudImport(new File(['original'],'held.wav',{type:'audio/wav'}),{},undefined,{signal:window.__heldController.signal}).catch(e=>{window.__heldError=e.message});
 });
 await expect.poll(()=>page.evaluate(()=>window.__uploadCalls.length)).toBe(1);
 const other=await context.newPage();
 await other.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:cloudStub}));
 await other.route('**/tus.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await other.route('**/*.supabase.co/**',route=>route.abort());
 await other.goto('/legacy.html');await expect(other.locator('#vzip-auth-screen')).toBeHidden();
 await installUploadProbe(other,'success');
 const blocked=await other.evaluate(async()=>{try{await window.vzipCloudImport(new File(['other'],'other.wav',{type:'audio/wav'}))}catch(e){return {error:e.message,calls:window.__uploadCalls.length,removed:window.__removedPaths||[]}}});
 expect(blocked.error).toContain('다른 파일을 업로드');expect(blocked.calls).toBe(0);expect(blocked.removed).toEqual([]);
 await page.evaluate(()=>window.__heldController.abort());
 await expect.poll(()=>page.evaluate(()=>window.__heldError||'')).toContain('취소');
 await other.evaluate(()=>window.vzipCloudImport(new File(['other'],'other.wav',{type:'audio/wav'})));
 expect(await other.evaluate(()=>window.__uploadCalls.length)).toBe(1);
 await other.close();
});

test('Song timeline resolves versioned cloud recordings without a single-object path',async({page})=>{
 await seedHistory(page,{songs:[{id:'stream-song',title:'분할 파일 곡'}]});
 await page.evaluate(()=>{window.vzipChunkMediaURL=async item=>{window.__timelineStreamed=item.id;return '/fixture-audio.wav'}});
 const row=cloudRow('timeline-parts','분할 녹음');delete row.metadata.path;
 Object.assign(row.metadata,{songId:'stream-song',song:'분할 파일 곡',storageVersion:2,size:wav().length,parts:[{path:'ui-test-user/part-0',size:wav().length}]});
 await cloudFiles(page,[row]);
 await expect.poll(()=>page.locator('#archive-song option').count()).toBe(2);
 await page.locator('#archive-song').evaluate(el=>{el.value='stream-song';el.dispatchEvent(new Event('change'))});
 await expect(page.locator('#archive-player-a audio')).toBeAttached();
 expect(await page.evaluate(()=>window.__timelineStreamed)).toBe('timeline-parts');
});

test('Metadata-derived dates remain editable and move imported audio in the calendar after reload',async({page})=>{
 await page.evaluate(()=>{
  window.vzipCloudSignedIn=()=>false;
  window.vzipPrepareMedia=async file=>({file,metadata:{created:new Date('2024-02-29T12:00:00').getTime(),recordedDate:'2024-02-29',dateSource:'metadata'},dispose:async()=>{}});
 });
 await page.locator('.nav [data-tab=media]').click();
 await page.locator('#vzip-hub-upload').setInputFiles({name:'dated-recording.wav',mimeType:'audio/wav',buffer:wav()});
 await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
 await expect(page.locator('.vzip-hub-item')).toContainText('2024-02-29');
 await page.locator('.nav [data-tab=practice]').click();
 await expect(page.getByLabel('기록 월 선택')).toHaveValue('2024-02');
 await expect(page.locator('.vzip-calendar-records')).toContainText('dated-recording');
 await page.locator('.vzip-calendar-records [data-record-id]').click();
 await expect(page.locator('#media')).toBeVisible();
 await page.locator('.vzip-hub-item [data-action=edit]').click();
 const dialog=page.getByRole('dialog',{name:'🎧 이 녹음의 감상 기록'});
 await expect(dialog.locator('[name=date]')).toHaveValue('2024-02-29');
 await expect(dialog).toContainText('메타데이터');
 await dialog.locator('[name=date]').fill('2024-03-02');await dialog.locator('[data-save]').click();
 await expect(page.locator('.vzip-hub-item')).toContainText('2024-03-02');
 await page.reload();await page.evaluate(()=>window.vzipCloudSignedIn=()=>false);
 await page.locator('.nav [data-tab=practice]').click();await page.getByLabel('기록 월 선택').fill('2024-03');
 await page.locator('[data-date="2024-03-02"]').click();await expect(page.locator('.vzip-calendar-records')).toContainText('dated-recording');
 await page.getByLabel('기록 월 선택').fill('2024-02');await page.locator('[data-date="2024-02-29"]').click();await expect(page.locator('.vzip-calendar-records')).not.toContainText('dated-recording');
 const stored=await page.evaluate(()=>window.vzipReadMedia());expect(stored[0]).toMatchObject({recordedDate:'2024-03-02',dateSource:'manual'});
});
test('An explicitly selected practice date survives an imported metadata date',async({page})=>{
 await page.evaluate(()=>{window.vzipPrepareMedia=async file=>({file,metadata:{created:1709208000000,recordedDate:'2024-02-29',dateSource:'metadata'},dispose:async()=>{}})});
 await page.locator('.hero [data-go-tab=practice]').click();
 await page.locator('#practice-form [name=date]').fill('2026-10-20');
 await page.locator('#practice-attachments').setInputFiles({name:'old-recording.wav',mimeType:'audio/wav',buffer:wav()});
 await expect(page.locator('#media-preview')).toContainText('2024-02-29');
 await expect(page.locator('#practice-form [name=date]')).toHaveValue('2026-10-20');
});
