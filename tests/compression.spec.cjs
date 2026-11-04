const {test,expect}=require('@playwright/test');
const path=require('node:path');
test.beforeEach(async({page,browserName})=>{
 test.skip(browserName!=='chromium','Native Safari hardware compression requires a real iPhone; Chromium exercises the codec pipeline.');
 page.__errors=[];page.on('pageerror',error=>page.__errors.push(error.message));
 await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({})}})}'}));
 await page.route('**/tus.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.goto('/');
});
test.afterEach(async({page})=>{if(page.__errors)expect(page.__errors).toEqual([])});
async function selectFile(page,name='compress-source.mp4'){
 await page.locator('#vzip-hub-upload').setInputFiles(path.resolve('tests/fixtures/'+name));
 // Selection opens the song dialog behind the signed-out screen. Direct compression tests use the File itself.
}
async function workerCompression(page,name='compress-source.mp4'){
 await selectFile(page,name);
 return page.evaluate(async()=>{
  const file=document.querySelector('#vzip-hub-upload').files[0];
  const value=await window.vzipCompressVideo(file);
  window.__compressed=value;
  const video=document.createElement('video');video.id='compression-result';video.preload='metadata';video.src=URL.createObjectURL(value.file);video.controls=true;document.body.append(video);
  return {proof:value.proof,bytes:value.file.size,type:value.file.type};
 });
}
test('Video-only compression verifies exact AAC packets, reduces bytes and produces playable video',async({page})=>{
 test.setTimeout(120000);
 const result=await workerCompression(page);
 expect(result.proof.audioPacketCopyVerified).toBe(true);expect(result.proof.audioPackets).toBeGreaterThan(10);expect(result.proof.audioBytes).toBeGreaterThan(0);
 expect(result.bytes).toBeLessThan(result.proof.originalBytes);
 expect(result.proof.width).toBe(1280);expect(result.proof.height).toBe(720);
 const video=page.locator('#compression-result');
 await expect.poll(()=>video.evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
 const dimensions=await video.evaluate(el=>({width:el.videoWidth,height:el.videoHeight,duration:el.duration}));
 expect(dimensions.width).toBe(1280);expect(dimensions.height).toBe(720);expect(dimensions.duration).toBeGreaterThan(2.8);expect(dimensions.duration).toBeLessThan(3.2);
 await page.evaluate(async()=>{await window.__compressed.dispose()});
});
test('201MiB source is never read into a whole-file ArrayBuffer',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chromium-desktop','Run the large real byte fixture once.');
 test.setTimeout(120000);
 await page.evaluate(()=>{
  const original=Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer=function(){if(this.size>25*1024*1024)throw Error('whole source read');return original.call(this)};
 });
 const result=await workerCompression(page,'compress-201MiB.mp4');
 expect(result.proof.originalBytes).toBe(201*1024*1024);expect(result.proof.maximumInputRead).toBeLessThanOrEqual(8*1024*1024);
 expect(result.proof.audioPacketCopyVerified).toBe(true);expect(result.bytes).toBeLessThan(10*1024*1024);
 await page.evaluate(async()=>{await window.__compressed.dispose()});
});
test('Compression cancel releases its temporary file and permits retry',async({page})=>{
 test.setTimeout(120000);await selectFile(page);
 const result=await page.evaluate(async()=>{
  const file=document.querySelector('#vzip-hub-upload').files[0],controller=new AbortController();let error;
  try{await window.vzipCompressVideo(file,{signal:controller.signal,onProgress:()=>controller.abort()})}catch(e){error=e.name}
  const retry=await window.vzipCompressVideo(file);await retry.dispose();
  const directory=await (await navigator.storage.getDirectory()).getDirectoryHandle('vzip-video-temp-v1');
  const files=[];for await(const name of directory.keys())files.push(name);
  return {error,files};
 });
 expect(result.error).toBe('AbortError');expect(result.files).toEqual([]);
});
test('Opt-in compression is verified before the upload queue sends the result',async({page})=>{
 test.setTimeout(120000);
 await page.evaluate(()=>{
  document.querySelector('#vzip-auth-screen').remove();document.body.classList.remove('vzip-auth-locked');
  window.vzipCloudSignedIn=()=>true;
  window.vzipCloudImport=async(file,info)=>{window.__actualUpload={size:file.size,info};return {id:info.id}};
 });
 await page.locator('.nav [data-tab=media]').click();
 await selectFile(page);
 await page.locator('[role=dialog] .vzip-compression-option input').check();
 await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
 await expect(page.locator('#vzip-hub-upload-queue')).toContainText('음성 원본 확인',{timeout:120000});
 const sent=await page.evaluate(()=>window.__actualUpload);
 expect(sent.info.compression.audioPacketCopyVerified).toBe(true);expect(sent.size).toBe(sent.info.compression.outputBytes);
 expect(sent.size).toBeLessThan(sent.info.compression.originalBytes);
});
test('Compression failure exposes original upload and does not silently alter audio',async({page})=>{
 await page.evaluate(()=>{
  document.querySelector('#vzip-auth-screen').remove();document.body.classList.remove('vzip-auth-locked');
  window.vzipCloudSignedIn=()=>true;
  window.vzipCompressVideo=async()=>{throw Error('원본 음성 복사 불가')};
  window.vzipCloudImport=async(file,info)=>{window.__originalUpload={size:file.size,info};return {id:info.id}};
 });
 await page.locator('.nav [data-tab=media]').click();await selectFile(page);
 await page.locator('[role=dialog] .vzip-compression-option input').check();
 await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
 await expect(page.locator('#vzip-hub-upload-queue')).toContainText('원본 음성 복사 불가');
 expect(await page.evaluate(()=>window.__originalUpload)).toBeUndefined();
 await page.getByRole('button',{name:'압축 없이 원본 업로드',exact:true}).click();
 await expect(page.locator('#vzip-hub-upload-queue')).toContainText('보관함 저장 완료');
 expect((await page.evaluate(()=>window.__originalUpload)).info.compression).toBeUndefined();
});
