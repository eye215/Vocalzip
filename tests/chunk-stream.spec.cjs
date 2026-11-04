const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'allow'});
function wav(){
 const samples=16000,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);return b;
}
test('Real service worker serves private cross-part ranges, reloads and native playback',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','Playwright intercepts worker network requests on Chromium; pure stream contracts run separately for all byte paths.');
 let bytes=wav(),cut=16000;const requests=[],diagnostics=[];
 const cdp=await context.newCDPSession(page);await cdp.send('ServiceWorker.enable');cdp.on('ServiceWorker.workerErrorReported',error=>diagnostics.push(error));
 context.on('requestfailed',request=>diagnostics.push({url:request.url(),failure:request.failure()}));
 context.on('console',message=>diagnostics.push(message.text()));
 await context.route('https://chxnbtiyuyhiywzeshis.supabase.co/storage/v1/object/sign/vocal-recordings/**',async route=>{
  const request=route.request();
  diagnostics.push({method:request.method(),headers:await request.allHeaders()});
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,HEAD,OPTIONS','Access-Control-Allow-Headers':request.headers()['access-control-request-headers']||'range,cache-control,pragma'}});return}
  const part=request.url().includes('part-0')?bytes.subarray(0,cut):bytes.subarray(cut);
  const m=/bytes=(\d+)-(\d+)/.exec(request.headers().range||'');const start=m?+m[1]:0,end=m?+m[2]:part.length-1;
  requests.push({start,end});
  await route.fulfill({status:206,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range','Content-Range':'bytes '+start+'-'+end+'/'+part.length,'Content-Type':'application/octet-stream'},body:part.subarray(start,end+1)});
 });
 await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({})}})}'}));
 await page.route('**/tus.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.goto('/');
 await page.evaluate(()=>{window.__streamErrors=[];navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='vzip-stream-error')window.__streamErrors.push(event.data.message)})});
 const src=await page.evaluate(async({size,cut})=>{
  const item={storageVersion:2,type:'audio/wav',size,parts:[{path:'owner/part-0',size:cut},{path:'owner/part-1',size:size-cut}]};
  return window.vzipChunkMediaURL(item,async path=>'https://chxnbtiyuyhiywzeshis.supabase.co/storage/v1/object/sign/vocal-recordings/'+path+'?token=test');
 },{size:bytes.length,cut});
 const slice=await page.evaluate(async src=>{
  const response=await fetch(src,{headers:{Range:'bytes=15998-16002'}});
  return {status:response.status,range:response.headers.get('content-range'),bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};
 },src).catch(async error=>{await page.waitForTimeout(100);throw Error(JSON.stringify({error:error.message,requests,diagnostics,worker:await page.evaluate(()=>window.__streamErrors)}))});
 expect(slice).toEqual({status:206,range:'bytes 15998-16002/'+bytes.length,bytes:[...bytes.subarray(15998,16003)]});
 await page.reload();
 await page.evaluate(src=>{const media=document.createElement('audio');media.id='stream-fixture';media.controls=true;media.src=src;document.body.append(media)},src);
 const media=page.locator('#stream-fixture');
 await expect.poll(()=>media.evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
 expect(await media.evaluate(el=>el.duration)).toBeCloseTo(2,1);
 await media.evaluate(async el=>{el.currentTime=1;await el.play()});
 await expect.poll(()=>media.evaluate(el=>el.currentTime)).toBeGreaterThan(1);
 await media.evaluate(el=>{el.pause();el.removeAttribute('src');el.load();el.remove()});
 // Generate a real short video with virtual hardware, then play its original bytes through two objects.
 const videoBytes=await page.evaluate(async()=>{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
  try{
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
   const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start(100);
   await new Promise(resolve=>setTimeout(resolve,1200));recorder.stop();await stopped;
   return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  }finally{stream.getTracks().forEach(track=>track.stop())}
 });
 bytes=Buffer.from(videoBytes);cut=Math.floor(bytes.length/2);
 const videoSrc=await page.evaluate(async({size,cut})=>{
  const item={storageVersion:2,type:'video/webm',size,parts:[{path:'owner/part-0',size:cut},{path:'owner/part-1',size:size-cut}]};
  return window.vzipChunkMediaURL(item,async path=>'https://chxnbtiyuyhiywzeshis.supabase.co/storage/v1/object/sign/vocal-recordings/'+path+'?token=video');
 },{size:bytes.length,cut});
 await page.evaluate(src=>{const video=document.createElement('video');video.id='video-stream-fixture';video.playsInline=true;video.controls=true;video.src=src;document.body.append(video)},videoSrc);
 const video=page.locator('#video-stream-fixture');
 await expect.poll(()=>video.evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(1);
 await video.evaluate(el=>el.play());
 await expect.poll(()=>video.evaluate(el=>el.currentTime)).toBeGreaterThan(0);
 await video.evaluate(el=>{el.pause();el.currentTime=.3});
 await expect.poll(()=>video.evaluate(el=>el.currentTime)).toBeCloseTo(.3,1);
 await page.evaluate(()=>window.vzipRevokeChunkMedia());
 await expect.poll(()=>page.evaluate(async src=>(await fetch(src)).status,src)).toBe(410);
 expect(requests.length).toBeGreaterThanOrEqual(2);
});
