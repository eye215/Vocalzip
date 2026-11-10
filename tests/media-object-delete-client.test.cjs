const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const model=require('../media-metadata-edits.js'),code=fs.readFileSync('r2-storage.js','utf8');
const U='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',Q='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',V='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const key='u/'+U+'/voice/'+V+'/original.wav',at='2026-11-10T00:00:00.123456Z';
const target=()=>({requestId:Q,mediaId:'voice',key,updatedAt:at,size:3,type:'audio/wav',etag:'"original"'});
function fixture(){
 const state={owner:U,session:S,mode:'revision'},calls=[],hooks={},memory=new Map(),window={
  VZIP_R2_ENDPOINT:'https://media.test',VzipMediaMetadataEdits:model,vzipCloudSignedIn:()=>true,vzipCloudUserId:()=>state.owner,vzipCloudSessionId:()=>state.session,
  vzipCloudAccessToken:async()=>'fixture-token',addEventListener(){},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
 vm.runInNewContext(code,{window,URL,Blob,DOMException,AbortController,AbortSignal,Date,setTimeout,clearTimeout,location:{href:'https://app.test'},fetch:async(url,opts)=>{
  const path=new URL(url).pathname,body=opts.body?JSON.parse(opts.body):null;calls.push({path,body,signal:opts.signal});
  if(path==='/v1/me'){await hooks.ready?.();return Response.json({user:state.owner,mediaMode:state.mode});}
  if(path.endsWith('/prepare')){
   await hooks.prepare?.();if(hooks.prepareStatus)return Response.json({error:'rejected'},{status:hooks.prepareStatus});
   const value={state:hooks.deleted?'deleted':'reserved',ticket:{descriptor:{version:1,user_id:U,session_id:S,request_id:body.requestId,media_id:body.mediaId,object_key:body.key,object_version:V,expected_updated_at:body.updatedAt,size:body.size,content_type:'audio/wav',content_root:'a'.repeat(64),etag:'"original"'},signature:'b'.repeat(64)}};
   return Response.json(hooks.ticket?hooks.ticket(value):value);
  }
  if(path.endsWith('/commit')){
   await hooks.commit?.();if(hooks.lose){hooks.lose=false;throw Error('lost response');}
   const value={ok:true,state:'deleted',key,requestId:Q};return Response.json(hooks.result?hooks.result(value):value);
  }
  throw Error('unexpected request '+path);
 }});
 return {api:window.VzipR2,state,calls,hooks};
}
test('deletion target retains precise time and immutable identity without copying notes',()=>{
 const f=fixture(),t=f.api.deletionTarget({metadata:{id:'voice',storageProvider:'r2',r2Key:key,size:3,type:'audio/wav',r2Etag:'"original"',review:'private note'},updated_at:'2026-11-10T09:00:00.123456+09:00'},{id:'voice',requestId:Q});
 assert.deepEqual(JSON.parse(JSON.stringify(t)),target());assert.ok(!JSON.stringify(t).includes('private note'));
 for(const patch of [{legacyStorage:null},{path:'old'},{storageProvider:'supabase'},{r2Key:'u/'+S+'/voice/'+V+'/original.wav'},{size:0},{type:'video/mp4'}]){
  assert.throws(()=>f.api.deletionTarget({metadata:{id:'voice',storageProvider:'r2',r2Key:key,size:3,type:'audio/wav',r2Etag:'"original"',...patch},updated_at:at},{id:'voice',requestId:Q}));
 }
});
test('immutable deletion uses only fresh mode, signed prepare and commit with the same abort signal',async()=>{
 const f=fixture(),controller=new AbortController(),out=await f.api.deleteLibrary(target(),{signal:controller.signal});
 assert.equal(out.ok,true);assert.deepEqual(f.calls.map(c=>c.path),['/v1/me','/v2/media/delete/prepare','/v2/media/delete/commit']);
 assert.deepEqual(f.calls[1].body,{requestId:Q,mediaId:'voice',key,updatedAt:at,size:3});assert.ok(f.calls.every(c=>c.signal===controller.signal));
});
test('a lost completion is retried with the exact request, never a raw DELETE or metadata write',async()=>{
 const f=fixture(),t=target();f.hooks.lose=true;await assert.rejects(f.api.deleteLibrary(t),/lost/);f.hooks.deleted=true;
 await f.api.deleteLibrary(t);assert.deepEqual(f.calls.filter(c=>c.path.endsWith('/prepare')).map(c=>c.body.requestId),[Q,Q]);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/commit')).length,2);
});
test('legacy, paused or unknown mode cannot authorize immutable deletion',async()=>{
 for(const mode of ['legacy','paused','unknown']){const f=fixture();f.state.mode=mode;await assert.rejects(f.api.deleteLibrary(target()));assert.equal(f.calls.length,1);}
});
test('prepare rejection is never retried with another version or routed to raw delete',async()=>{
 for(const status of [403,409,503]){const f=fixture();f.hooks.prepareStatus=status;await assert.rejects(f.api.deleteLibrary(target()),e=>e.status===status);assert.equal(f.calls.length,2);}
});
test('a mismatched ticket including a submillisecond version prevents commit',async()=>{
 const patches=[{user_id:S},{session_id:Q},{request_id:S},{media_id:'other'},{object_key:'other'},{object_version:S},{expected_updated_at:'2026-11-10T00:00:00.123457Z'},{size:4},{content_type:'audio/mp4'},{etag:'"new"'},{content_root:'bad'},{extra:true}];
 for(const patch of patches){const f=fixture();f.hooks.ticket=v=>({...v,ticket:{...v.ticket,descriptor:{...v.ticket.descriptor,...patch}}});await assert.rejects(f.api.deleteLibrary(target()));assert.equal(f.calls.length,2);}
 for(const change of [v=>({...v,state:'other'}),v=>({...v,ticket:{...v.ticket,signature:'bad'}})]){const f=fixture();f.hooks.ticket=change;await assert.rejects(f.api.deleteLibrary(target()));assert.equal(f.calls.length,2);}
});
test('foreign or changed completion cannot acknowledge deletion',async()=>{
 for(const patch of [{ok:false},{state:'reserved'},{key:'other'},{requestId:S}]){const f=fixture();f.hooks.result=v=>({...v,...patch});await assert.rejects(f.api.deleteLibrary(target()),/확인/);}
});
test('account or session handoff at each await boundary refuses the result',async()=>{
 for(const stage of ['ready','prepare','commit'])for(const field of ['owner','session']){
  const f=fixture();f.hooks[stage]=()=>{f.state[field]=Q;};await assert.rejects(f.api.deleteLibrary(target()),/로그인/);
  assert.equal(f.calls.length,{ready:1,prepare:2,commit:3}[stage]);
 }
});
test('caller changes cannot mutate a deletion after its first await',async()=>{
 const f=fixture(),t=target();f.hooks.ready=()=>{t.key='foreign';t.requestId=S;};
 await f.api.deleteLibrary(t);assert.equal(f.calls[1].body.key,key);assert.equal(f.calls[1].body.requestId,Q);
});
test('invalid target fails before network or physical operations',async()=>{
 for(const patch of [{requestId:'bad'},{key:key.replace(U,S)},{updatedAt:'2026-11-10T00:00:00Z'},{size:0},{type:'video/mp4'},{etag:''},{extra:true}]){
  const f=fixture();await assert.rejects(f.api.deleteLibrary({...target(),...patch}));assert.equal(f.calls.length,0);
 }
});
