const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,wav,R2}=require('./helpers/r2-fixture.cjs');
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type, x-client-info','access-control-allow-methods':'GET, POST, OPTIONS'};
async function publicationServer(page,options={}){
 const r2=await fakeR2(page,{resumable:true}),requests=[];
 await page.route(R2+'/v1/me',route=>route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify({user:'ui-test-user',uploadContract:'merkle-v2',mediaMode:'revision',mediaContract:'immutable-v1'})}));
 await page.route(R2+'/v2/media/publish',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const body=route.request().postDataJSON();requests.push(body);
  const m=body.metadata,object=r2.store.get(m.r2Key);
  if(!object||object.bytes.length!==m.size||object.etag!==m.r2Etag)return route.fulfill({headers:cors,status:409,contentType:'application/json',body:'{"error":"original changed"}'});
  if(options.failOnce){options.failOnce=false;return route.abort('failed');}
  const session=await page.evaluate(()=>window.vzipCloudSessionId?.()||'');
  const saved=options.newer?{...m,name:'다른 기기에서 바꾼 제목',songId:'newer-song'}:m;
  if(!options.wrongAck)await page.evaluate(meta=>{window.__rows[meta.id]=meta;},saved);
  return route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify({version:1,user_id:'ui-test-user',session_id:session,request_id:body.requestId,id:m.id,
   metadata:options.wrongAck?{...m,r2Key:'u/ui-test-user/other/original.wav'}:saved,updated_at:'2026-11-10T00:00:00.000001Z'})});
 });
 return {r2,requests};
}
test('completed upload is published through the server with no direct metadata upsert or second verification read',async({page})=>{
 const server=await publicationServer(page,{newer:true});await boot(page);
 const saved=await page.evaluate(async bytes=>window.vzipCloudImport(new File([new Uint8Array(bytes)],'original.wav',{type:'audio/wav'}),
  {id:'publish-browser',name:'원래 제목',songId:'s1',recordedDate:'2026-11-10'}),[...wav(1)]);
 expect(saved).toMatchObject({id:'publish-browser',name:'다른 기기에서 바꾼 제목',songId:'newer-song',recordedDate:'2026-11-10',storageProvider:'r2'});
 expect(server.requests).toHaveLength(1);expect(server.requests[0].requestId).toBe(saved.r2Key.split('/')[3]);
 expect(await page.evaluate(()=>window.__up.length)).toBe(0);
 expect(await page.evaluate(()=>window.VzipMediaUploadRecovery.create({storage:localStorage,identity:()=>({owner:'ui-test-user',session:'legacy'})}).pending().length)).toBe(0);
 expect([...server.r2.store.values()][0].bytes.equals(wav(1))).toBe(true);
 expect(server.r2.calls.some(x=>x.startsWith('DELETE'))).toBe(false);
});
test('R2-required practice audio never falls back to Supabase Storage when readiness changes',async({page})=>{
 const server=await publicationServer(page);await boot(page);
 const result=await page.evaluate(async bytes=>{
  window.VzipR2.ready=async()=>false;
  try{
   await window.vzipCloudImport(new File([new Uint8Array(bytes)],'practice.wav',{type:'audio/wav'}),{id:'practice-r2-only',source:'practice'},undefined,{requireR2:true});
   return 'unexpected success';
  }catch(error){return error.message;}
 },[...wav(1)]);
 expect(result).toContain('R2 저장소 연결');
 expect(await page.evaluate(()=>window.__up.length)).toBe(0);
 expect(await page.evaluate(()=>window.__rows['practice-r2-only'])).toBeUndefined();
 expect(server.requests).toHaveLength(0);
 expect(server.r2.store.size).toBe(0);
});
test('failed publication survives reload and retries without re-reading or re-uploading a source file',async({page})=>{
 const server=await publicationServer(page,{failOnce:true});await boot(page);
 const failed=await page.evaluate(async bytes=>{
  try{await window.vzipCloudImport(new File([new Uint8Array(bytes)],'original.wav',{type:'audio/wav'}),{id:'publish-retry',name:'복구할 제목',songId:'s1'});return false;}catch{return true;}
 },[...wav(1)]);
 expect(failed).toBe(true);expect(server.r2.store.size).toBe(1);
 await page.reload();await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.__rows['publish-retry']?.name)).toBe('복구할 제목');
 expect(server.requests).toHaveLength(2);expect(server.requests[1].requestId).toBe(server.requests[0].requestId);
 expect(server.r2.calls.filter(x=>x==='POST /v2/uploads')).toHaveLength(1);
 expect(server.r2.calls.filter(x=>x==='PUT /v2/uploads/parts/1')).toHaveLength(1);
 expect(server.r2.calls.some(x=>x.startsWith('DELETE'))).toBe(false);
});
test('different-original acknowledgement leaves the completed upload and recovery receipt intact',async({page})=>{
 const server=await publicationServer(page,{wrongAck:true});await boot(page);
 const failed=await page.evaluate(async bytes=>{
  try{await window.vzipCloudImport(new File([new Uint8Array(bytes)],'original.wav',{type:'audio/wav'}),{id:'publish-bad-ack',name:'원본 유지'});return false;}catch{return true;}
 },[...wav(1)]);
 expect(failed).toBe(true);expect(server.r2.store.size).toBe(1);
 expect(await page.evaluate(()=>window.__rows['publish-bad-ack'])).toBeUndefined();
 expect(await page.evaluate(()=>Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).some(k=>k?.includes('vzip_r2_library_receipts_v1:')&&k.endsWith(':publish-bad-ack')))).toBe(true);
 expect(server.r2.calls.some(x=>x.startsWith('DELETE'))).toBe(false);
});
