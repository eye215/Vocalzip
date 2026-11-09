const {test,expect}=require('@playwright/test'),path=require('node:path');
require('./legacy-session-mode.cjs')(test);
test.beforeEach(async({page})=>{
 page.__errors=[];page.on('pageerror',error=>page.__errors.push(error.message));
 await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({})}})}'}));
 await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"})); // R2 is covered by r2.spec.cjs
 await page.route('**/tus.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 if(process.env.VZ_MEDIABUNNY)await page.context().route('**/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs',route=>route.fulfill({path:process.env.VZ_MEDIABUNNY,contentType:'text/javascript'}));
 await page.goto('/legacy.html');
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
test('iPhone spatial-audio MOV keeps the copyable AAC mix and skips the extra track',async({page})=>{
 test.setTimeout(90000);await selected(page,'spatial-audio.mov');
 const result=await page.evaluate(async()=>{const prepared=await vzipPrepareMedia(document.querySelector('#vzip-hub-upload').files[0]);try{return {type:prepared.file.type,metadata:prepared.metadata}}finally{await prepared.dispose()}});
 expect(result.type).toBe('audio/mp4');
 expect(result.metadata.audioExtraction).toMatchObject({audioPacketCopyVerified:true,audioTracks:1});
 expect(result.metadata.audioExtraction.skippedAudioTracks).toHaveLength(1);
 expect(result.metadata.recordedDate).toBe('2026-11-02');
});

test('Inspected AAC reuses its original bytes, metadata and duration without a second worker',async({page})=>{
 test.setTimeout(90000);await selected(page,'dated-video.mp4');
 const value=await page.evaluate(async()=>{
  const source=await vzipPrepareMedia(document.querySelector('#vzip-hub-upload').files[0]);
  try{
   const file=new File([source.file],'audio.m4a',{type:'audio/mp4',lastModified:source.file.lastModified});
   const Original=Worker;let workers=0;
   window.Worker=class extends Original{constructor(...args){super(...args);workers++;}};
   try{
    const inspection=await vzipInspectMedia(file);inspection.metadata.recordedDate='1999-01-01';
    const prepared=await vzipPrepareMedia(file);
    const original=new Uint8Array(await source.file.arrayBuffer()),actual=new Uint8Array(await prepared.file.arrayBuffer());
    const same=prepared.file===file&&actual.length===original.length&&actual.every((n,i)=>n===original[i]);
    return {workers,same,metadata:prepared.metadata,duration:inspection.duration};
   }finally{window.Worker=Original;}
  }finally{await source.dispose();}
 });
 expect(value.workers).toBe(1);expect(value.same).toBe(true);
 expect(value.metadata.recordedDate).toBe('2024-03-01');expect(value.metadata.durationSeconds).toBeCloseTo(value.duration,1);
});
test('Video disguised as audio never bypasses original-packet extraction after inspection',async({page})=>{
 test.setTimeout(90000);await selected(page,'dated-video.mp4');
 const result=await page.evaluate(async()=>{
  const source=document.querySelector('#vzip-hub-upload').files[0],file=new File([source],'disguised.m4a',{type:'audio/mp4'});
  const inspected=await vzipInspectMedia(file),prepared=await vzipPrepareMedia(file);
  try{return {video:inspected.hasVideo,reused:prepared.file===file,proof:prepared.metadata.audioExtraction}}finally{await prepared.dispose()}
 });
 expect(result.video).toBe(true);expect(result.reused).toBe(false);expect(result.proof.audioPacketCopyVerified).toBe(true);
});
test('Inspected PCM retains verified FLAC conversion on Chromium and original WAV on WebKit',async({page,browserName})=>{
 test.setTimeout(90000);
 const result=await page.evaluate(async bytes=>{
  const file=new File([new Uint8Array(bytes)],'pcm.wav',{type:'audio/wav'});
  await vzipInspectMedia(file);const prepared=await vzipPrepareMedia(file);
  try{return {type:prepared.file.type,proof:prepared.metadata.losslessFlac,same:prepared.file===file}}finally{await prepared.dispose()}
 },[...require('./helpers/r2-fixture.cjs').wav(3)]);
 if(browserName==='webkit'){expect(result.type).toBe('audio/wav');expect(result.same).toBe(true);}
 else{expect(result.type).toBe('audio/flac');expect(result.proof.samplesVerified).toBe(true);}
});
