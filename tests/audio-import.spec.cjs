const {test,expect}=require('@playwright/test'),path=require('node:path');
test.beforeEach(async({page})=>{
 page.__errors=[];page.on('pageerror',error=>page.__errors.push(error.message));
 await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({})}})}'}));
 await page.route('**/tus.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.goto('/');
});
test.afterEach(async({page})=>expect(page.__errors).toEqual([]));
async function selected(page,name,queue=false){if(!queue)await page.evaluate(()=>document.querySelector('#vzip-hub-upload').onchange=null);await page.locator('#vzip-hub-upload').setInputFiles(path.resolve('tests/fixtures/'+name))}
test('Video import copies exact original AAC into audio-only output and keeps capture date',async({page})=>{
 test.setTimeout(90000);await selected(page,'dated-video.mp4');
 const result=await page.evaluate(async()=>{
  const prepared=await vzipPrepareMedia(document.querySelector('#vzip-hub-upload').files[0]);window.__prepared=prepared;
  const b=await import('https://cdn.jsdelivr.net/npm/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs');
  const input=new b.Input({source:new b.BlobSource(prepared.file),formats:b.ALL_FORMATS});
  try{const reimport=await vzipPrepareMedia(prepared.file);return {reimportDate:reimport.metadata.recordedDate,metadata:prepared.metadata,type:prepared.file.type,name:prepared.file.name,videoTracks:(await input.getVideoTracks()).length,audioTracks:(await input.getAudioTracks()).length,seconds:await input.computeDuration()}}finally{input.dispose()}
 });
 expect(result.type).toBe('audio/mp4');expect(result.name).toMatch(/\.m4a$/);expect(result.videoTracks).toBe(0);expect(result.audioTracks).toBe(1);
 expect(result.metadata.audioExtraction.audioPacketCopyVerified).toBe(true);expect(result.metadata.audioExtraction.audioPackets).toBeGreaterThan(10);
 expect(result.reimportDate).toBe('2024-03-01');expect(result.metadata.recordedDate).toBe('2024-03-01');expect(result.metadata.dateSource).toBe('metadata');expect(result.seconds).toBeGreaterThan(2.8);expect(result.seconds).toBeLessThan(3.2);
 await page.evaluate(()=>window.__prepared.dispose());
});
test('201MiB video extraction reads bounded sections and sends only the small audio',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chromium-desktop','Run the large real byte fixture once.');
 test.setTimeout(90000);await selected(page,'dated-201MiB.mp4');
 const result=await page.evaluate(async()=>{
  const value=await vzipPrepareMedia(document.querySelector('#vzip-hub-upload').files[0]);
  try{return {metadata:value.metadata,bytes:value.file.size}}finally{await value.dispose()}
 });
 expect(result.metadata.audioExtraction.originalBytes).toBe(201*1024*1024);expect(result.metadata.audioExtraction.maximumInputRead).toBeLessThanOrEqual(8*1024*1024);
 expect(result.bytes).toBeLessThan(1024*1024);expect(result.metadata.audioExtraction.audioPacketCopyVerified).toBe(true);
});
test('A video with no audio is rejected and never becomes a saved video',async({page})=>{
 await selected(page,'silent-video.mp4');
 const error=await page.evaluate(async()=>{try{await vzipPrepareMedia(document.querySelector('#vzip-hub-upload').files[0])}catch(error){return error.message}});
 expect(error).toContain('음성이 없는 영상');
});
test('Real queue extracts audio before cloud transport and stores capture metadata',async({page})=>{
 test.setTimeout(90000);
 await page.evaluate(()=>{
  document.querySelector('#vzip-auth-screen').remove();document.body.classList.remove('vzip-auth-locked');
  window.vzipCloudSignedIn=()=>true;window.vzipCloudImport=async(file,info)=>{window.__sent={type:file.type,size:file.size,info};return {id:info.id}};
 });
 await page.locator('.nav [data-tab=media]').click();await selected(page,'dated-video.mp4',true);
 await page.getByRole('button',{name:'이 파일 업로드',exact:true}).click();
 await expect(page.locator('#vzip-hub-upload-queue')).toContainText('보관함 저장 완료',{timeout:90000});
 const sent=await page.evaluate(()=>window.__sent);expect(sent.type).toBe('audio/mp4');expect(sent.size).toBeLessThan(1024*1024);
 expect(sent.info.recordedDate).toBe('2024-03-01');expect(sent.info.audioExtraction.audioPacketCopyVerified).toBe(true);
});
