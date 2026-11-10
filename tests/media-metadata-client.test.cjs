const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('r2-storage.js','utf8');
const owner='11111111-1111-4111-8111-111111111111',session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requestId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key='u/'+owner+'/voice/'+requestId+'/original.wav',at='2026-11-10T00:00:00.123456Z',next='2026-11-10T00:00:00.123457Z';
const target=()=>({requestId,mediaId:'voice',key,updatedAt:at,patch:{name:'수정한 제목',recordedDate:'2026-11-09'}});
function fixture(mode='revision'){
 const state={owner,session,mode},calls=[],hooks={},memory=new Map();
 const window={VZIP_R2_ENDPOINT:'https://media.test',vzipCloudSignedIn:()=>true,vzipCloudUserId:()=>state.owner,vzipCloudSessionId:()=>state.session,
  vzipCloudAccessToken:async()=>'fixture-token',addEventListener(){},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
 const context={window,URL,Blob,DOMException,AbortController,AbortSignal,Date,setTimeout,clearTimeout,location:{href:'https://app.test'},fetch:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body});
  if(path==='/v1/me'){await hooks.ready?.();if(hooks.failReady)throw Error('offline');return Response.json({user:state.owner,mediaMode:state.mode});}
  if(path==='/v2/media/edit'){
   await hooks.edit?.();if(hooks.status)return Response.json({error:'fixture rejection'},{status:hooks.status});
   const result={version:1,user_id:owner,session_id:session,request_id:body.requestId,id:body.mediaId,object_key:body.key,
    metadata:{id:body.mediaId,storageProvider:'r2',r2Key:body.key,size:3,type:'audio/wav',r2Etag:'"fixture"',...body.patch},
    updated_at:next,applied_updated_at:next,replayed:false,superseded:false};
   return Response.json(hooks.result?hooks.result(result):result);
  }
  throw Error('unexpected request '+path);
 }};
 vm.runInNewContext(code,context);return {api:window.VzipR2,window,state,calls,hooks};
}
test('edit transport preserves the exact microsecond version and caller request without uploading',async()=>{
 const f=fixture(),p=target(),result=await f.api.editLibrary(p);
 assert.equal(result.metadata.name,p.patch.name);assert.equal(result.applied_updated_at,next);
 assert.deepEqual(f.calls[1].body,p);assert.deepEqual(f.calls.map(c=>c.path),['/v1/me','/v2/media/edit']);
});
test('ambiguous edit replies reuse the same request; a conflict never silently retries or falls back',async()=>{
 const f=fixture(),p=target();f.hooks.status=503;await assert.rejects(f.api.editLibrary(p),e=>e.status===503);
 f.hooks.status=0;await f.api.editLibrary(p);
 assert.deepEqual(f.calls.filter(c=>c.path==='/v2/media/edit').map(c=>c.body.requestId),[p.requestId,p.requestId]);
 f.hooks.status=409;await assert.rejects(f.api.editLibrary(p),e=>e.status===409);
 assert.equal(f.calls.filter(c=>c.path==='/v2/media/edit').length,3);
});
test('superseded retries return authoritative current metadata with an explicit review flag',async()=>{
 const f=fixture();f.hooks.result=r=>({...r,replayed:true,superseded:true,updated_at:'2026-11-10T00:00:00.123458Z',metadata:{...r.metadata,name:'다른 기기에서 이후 수정'}});
 const result=await f.api.editLibrary(target());assert.equal(result.superseded,true);assert.equal(result.metadata.name,'다른 기기에서 이후 수정');
});
test('only confirmed legacy mode can retain its old path; paused, unavailable and unknown modes fail closed',async()=>{
 const legacy=fixture('legacy');assert.equal(await legacy.api.editLibrary(target()),null);assert.equal(legacy.calls.length,1);
 for(const scenario of ['paused','unknown','offline']){
  const f=fixture(scenario);if(scenario==='offline')f.hooks.failReady=true;
  await assert.rejects(f.api.editLibrary(target()));assert.equal(f.calls.filter(c=>c.path==='/v2/media/edit').length,0);
 }
});
test('different or fixed keys, missing precision, empty patches and storage changes are rejected before mutation',async()=>{
 for(const patch of [{key:key.replace(owner,session)},{key:'u/'+owner+'/voice/original.wav'},{updatedAt:'2026-11-10T00:00:00Z'},
 {requestId:'bad'},{patch:{}},{patch:{r2Key:'new-original'}}]){
  const f=fixture();await assert.rejects(f.api.editLibrary({...target(),...patch}));assert.equal(f.calls.length,1);
 }
});
test('owner or session handoff before/after the edit refuses its result',async()=>{
 for(const stage of ['ready','edit'])for(const field of ['owner','session']){
  const f=fixture();f.hooks[stage]=()=>{f.state[field]=requestId;};
  await assert.rejects(f.api.editLibrary(target()),/로그인/);
  assert.equal(f.calls.filter(c=>c.path==='/v2/media/edit').length,stage==='ready'?0:1);
 }
});
test('untrusted acknowledgements cannot claim a different original, request, owner or unapplied text',async()=>{
 for(const patch of [{user_id:session},{session_id:requestId},{request_id:session},{object_key:'other'},{id:'other'},
 {updated_at:null},{replayed:null},{superseded:true},{updated_at:at,applied_updated_at:at},
 {metadata:{id:'voice',storageProvider:'r2',r2Key:key,name:'not applied'}},{metadata:{id:'voice',storageProvider:'r2',r2Key:key,...target().patch}}]){
  const f=fixture();f.hooks.result=r=>({...r,...patch});await assert.rejects(f.api.editLibrary(target()),/확인/);
 }
});
test('edits snapshot input before waiting for readiness so a mutable form cannot change an in-flight request',async()=>{
 const f=fixture(),p=target();f.hooks.ready=()=>{p.patch.name='다음 입력';p.requestId=session;};
 const result=await f.api.editLibrary(p);assert.equal(result.metadata.name,'수정한 제목');assert.equal(f.calls[1].body.requestId,requestId);
});

test('mode lookup is fresh and refreshes a formerly legacy transport before its first revision edit',async()=>{
 const f=fixture('legacy');assert.equal(await f.api.metadataMode(),'legacy');
 f.state.mode='revision';assert.equal(await f.api.metadataMode(),'revision');
 await f.api.editLibrary(target());assert.deepEqual(f.calls.map(c=>c.path),['/v1/me','/v1/me','/v2/media/edit']);
});
test('mode lookup cannot authorize paused, unknown, failed or changed-account fallbacks',async()=>{
 for(const mode of ['paused','unknown']){
  const f=fixture(mode);await assert.rejects(f.api.metadataMode());assert.equal(f.calls.length,1);
 }
 const f=fixture();f.hooks.failReady=true;await assert.rejects(f.api.metadataMode(),/offline/);
 const changed=fixture();changed.hooks.ready=()=>{changed.state.owner=requestId;};await assert.rejects(changed.api.metadataMode(),/로그인/);
});
