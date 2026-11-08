const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,wav}=require('./helpers/r2-fixture.cjs');
test.afterEach(async({page})=>{expect(page.__errors||[]).toEqual([]);});
test('completed v2 upload survives lost response and reload with no source file or second upload',async({page})=>{
 const r2=await fakeR2(page,{resumable:true,loseComplete:true});await boot(page);
 const failed=await page.evaluate(async bytes=>{
  try{await window.vzipCloudImport(new File([new Uint8Array(bytes)],'original.wav',{type:'audio/wav'}),{id:'v2-lost-complete',name:'원래 이름',songId:'s1',song:'Defying Gravity',recordedDate:'2026-11-08'});return 'unexpected success';}
  catch(error){return error.message;}
 },[...wav(1)]);
 expect(failed).not.toBe('unexpected success');expect(r2.store.size).toBe(1);
 await page.reload();await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.__rows['v2-lost-complete']?.name)).toBe('원래 이름');
 expect(await page.evaluate(()=>window.__rows['v2-lost-complete'])).toMatchObject({songId:'s1',recordedDate:'2026-11-08',storageProvider:'r2'});
 expect(r2.calls.filter(x=>x==='POST /v2/uploads')).toHaveLength(1);
 expect(r2.calls.filter(x=>x==='PUT /v2/uploads/parts/1')).toHaveLength(1);
 expect(r2.calls.some(x=>x.startsWith('DELETE'))).toBe(false);
 expect([...r2.store.values()][0].bytes.equals(wav(1))).toBe(true);
});
test('a retry sends only missing parts and preserves metadata from the original attempt',async({page})=>{
 const r2=await fakeR2(page,{resumable:true,failPart:2});await boot(page);
 const failed=await page.evaluate(async()=>{
  const bytes=new Uint8Array(8*1024*1024+23);for(let i=0;i<bytes.length;i++)bytes[i]=(i*31+9)%256;
  window.__resumeFile=new File([bytes],'resume.wav',{type:'audio/wav'});
  try{await window.vzipCloudImport(window.__resumeFile,{id:'v2-partial',name:'처음 제목',songId:'s1',song:'Defying Gravity',recordedDate:'2026-11-08'});return 'unexpected success';}
  catch(error){return error.message;}
 });
 expect(failed).not.toBe('unexpected success');expect(r2.store.size).toBe(0);
 const pending=await page.evaluate(()=>window.vzipRecoverMediaUploads('v2-partial'));expect(pending).toEqual([{status:'needs_file',id:'v2-partial'}]);
 r2.reject.failPart=0;
 const saved=await page.evaluate(()=>window.vzipCloudImport(window.__resumeFile,{id:'v2-partial',name:'다른 제목',songId:'different'}));
 expect(saved).toMatchObject({name:'처음 제목',songId:'s1',recordedDate:'2026-11-08',size:8*1024*1024+23});
 expect(r2.calls.filter(x=>x==='POST /v2/uploads')).toHaveLength(1);
 expect(r2.calls.filter(x=>x==='PUT /v2/uploads/parts/1')).toHaveLength(1);
 expect(r2.store.size).toBe(1);
});
test('same-size changed source cannot reuse the verified upload attempt',async({page})=>{
 const r2=await fakeR2(page,{resumable:true,failPart:2});await boot(page);
 await page.evaluate(async()=>{
  window.__bytes=new Uint8Array(8*1024*1024+23);window.__bytes.fill(7);
  try{await window.vzipCloudImport(new File([window.__bytes],'same.wav',{type:'audio/wav'}),{id:'v2-source-change',name:'원래 파일'});}catch{}
 });
 const before=r2.calls.filter(x=>x.startsWith('PUT /v2')).length;r2.reject.failPart=0;
 const failed=await page.evaluate(async()=>{
  window.__bytes[0]=99;
  try{await window.vzipCloudImport(new File([window.__bytes],'same.wav',{type:'audio/wav'}),{id:'v2-source-change'});return null;}catch(error){return error.code;}
 });
 expect(failed).toBe('source_changed');expect(r2.calls.filter(x=>x.startsWith('PUT /v2')).length).toBe(before);
 expect(r2.store.size).toBe(0);
});
test('another signed-in account cannot adopt the first account multipart journal',async({page})=>{
 const r2=await fakeR2(page,{resumable:true,loseComplete:true});await boot(page);
 await page.evaluate(async bytes=>{try{await window.vzipCloudImport(new File([new Uint8Array(bytes)],'owned.wav',{type:'audio/wav'}),{id:'v2-owner',name:'원래 계정 파일'});}catch{}},[...wav(1)]);
 const before=r2.calls.length;
 const result=await page.evaluate(async()=>{
  for(const fn of window.__authHandlers||[])fn('SIGNED_IN',{user:{id:'other-user',email:'other@example.invalid'}});
  return window.vzipRecoverMediaUploads();
 });
 expect(result).toEqual([]);expect(r2.calls.slice(before).some(x=>x.startsWith('POST /v2'))).toBe(false);
 expect(await page.evaluate(()=>window.__rows['v2-owner']||null)).toBeNull();expect(r2.store.size).toBe(1);
});

test('manual recovery shares background work and a cancellable retry waits for its lock',async({page})=>{
 const r2=await fakeR2(page,{resumable:true,failPart:2});await boot(page);
 await page.evaluate(async()=>{
  const bytes=new Uint8Array(8*1024*1024+23);bytes.fill(7);window.__retryFile=new File([bytes],'retry.wav',{type:'audio/wav'});
  try{await window.vzipCloudImport(window.__retryFile,{id:'v2-recovery-lock',name:'원래 제목',songId:'s1'});}catch{}
  await window.vzipRecoverMediaUploads();
 });
 r2.reject.failPart=0;
 let entered,release;const enteredGate=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let held=false;
 await page.route('**/v2/uploads/status',async route=>{
  if(!held){held=true;entered();await gate;}
  await route.fallback();
 });
 await page.evaluate(()=>{window.__background=window.vzipRecoverMediaUploads('v2-recovery-lock');});
 await enteredGate;
 const requests=await page.evaluate(()=>{
  window.__lockRequests=0;const request=navigator.locks.request.bind(navigator.locks);
  navigator.locks.request=(...args)=>{window.__lockRequests++;return request(...args);};
  const capture=p=>p.then(value=>({value}),error=>({error:{name:error.name,message:error.message}}));
  window.__manual=capture(window.vzipRecoverMediaUploads('v2-recovery-lock'));
  window.__otherRecovery=capture(window.vzipRecoverMediaUploads('another-file'));
  const controller=new AbortController();
  window.__cancelled=capture(window.vzipCloudImport(window.__retryFile,{id:'v2-recovery-lock'},undefined,{signal:controller.signal}));
  controller.abort();
  window.__foreground=capture(window.vzipCloudImport(window.__retryFile,{id:'v2-recovery-lock',name:'재선택한 제목'}));
  return window.__lockRequests;
 });
 release();
 expect(requests).toBe(0);
 const out=await page.evaluate(async()=>({manual:await window.__manual,other:await window.__otherRecovery,cancelled:await window.__cancelled,saved:await window.__foreground}));
 expect(out.manual).toEqual({value:[{status:'needs_file',id:'v2-recovery-lock'}]});
 expect(out.other.error.message).toContain('다른 파일을 복구');
 expect(out.cancelled.error.name).toBe('AbortError');
 expect(out.saved.value).toMatchObject({name:'원래 제목',songId:'s1',size:8*1024*1024+23});
 expect(r2.calls.filter(x=>x==='POST /v2/uploads')).toHaveLength(1);
 expect(r2.calls.filter(x=>x==='PUT /v2/uploads/parts/1')).toHaveLength(1);
 expect(r2.store.size).toBe(1);
});

test('an account change while a retry waits cannot upload the old file to the new account',async({page})=>{
 const r2=await fakeR2(page,{resumable:true,failPart:2});await boot(page);
 await page.evaluate(async()=>{
  const bytes=new Uint8Array(8*1024*1024+23);bytes.fill(5);window.__oldFile=new File([bytes],'old-account.wav',{type:'audio/wav'});
  try{await window.vzipCloudImport(window.__oldFile,{id:'v2-queued-owner',name:'이전 계정 파일'});}catch{}
  await window.vzipRecoverMediaUploads();
 });
 let entered,release;const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let held=false;
 await page.route('**/v2/uploads/status',async route=>{if(!held){held=true;entered();await gate;}await route.fallback();});
 await page.evaluate(()=>{window.__oldRecovery=window.vzipRecoverMediaUploads().catch(()=>[]);});
 await ready;
 const uploads=r2.calls.filter(x=>x==='POST /v2/uploads'||x.startsWith('PUT /v2')).length;
 await page.evaluate(()=>{
  window.__oldRetry=window.vzipCloudImport(window.__oldFile,{id:'v2-queued-owner'}).then(()=>null,error=>error.message);
  for(const fn of window.__authHandlers||[])fn('SIGNED_IN',{user:{id:'other-user',email:'other@example.invalid'}});
 });
 release();
 expect(await page.evaluate(()=>window.__oldRetry)).toContain('로그인이 변경');
 expect(r2.calls.filter(x=>x==='POST /v2/uploads'||x.startsWith('PUT /v2')).length).toBe(uploads);
 expect(await page.evaluate(()=>window.__rows['v2-queued-owner']||null)).toBeNull();
 expect(r2.store.size).toBe(0);
});
