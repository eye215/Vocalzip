const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const code=fs.readFileSync('r2-storage.js','utf8');
const owner='11111111-1111-4111-8111-111111111111',sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',attempt='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const metadata=()=>({id:'voice',name:'원래 제목',recordedDate:'2026-11-10',size:3,type:'audio/wav',storageProvider:'r2',r2Key:'u/'+owner+'/voice/'+attempt+'/original.wav',r2Etag:'"original"'});
function fixture(mode='revision'){
 const state={owner,session:sid,mode},calls=[],memory=new Map(),hooks={};
 const window={VZIP_R2_ENDPOINT:'https://media.test',vzipCloudSignedIn:()=>true,vzipCloudUserId:()=>state.owner,vzipCloudSessionId:()=>state.session,vzipCloudAccessToken:async()=>'test-token',addEventListener(){},
  localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};
 const context={window,URL,Blob,DOMException,AbortController,AbortSignal,Date,setTimeout,clearTimeout,location:{href:'https://app.test'},fetch:async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,body:options.body?JSON.parse(options.body):null});
  if(path==='/v1/me'){await hooks.ready?.();return Response.json({user:state.owner,mediaMode:state.mode,mediaContract:'immutable-v1'});}
  if(path==='/v2/media/publish'){
   const {requestId,metadata:m}=JSON.parse(options.body);await hooks.publish?.(m);
   return Response.json(hooks.result?hooks.result(m,requestId):{version:1,user_id:state.owner,session_id:state.session,request_id:requestId,id:m.id,metadata:{...m,name:'latest title'},updated_at:'2026-11-10T00:00:00.000001Z'});
  }
  throw Error('unexpected request '+path);
 }};
 vm.runInNewContext(code,context);return {api:window.VzipR2,state,calls,hooks};
}
test('publication uses a stable attempt request ID and returns authoritative newer metadata',async()=>{
 const f=fixture(),saved=await f.api.publishLibrary(metadata());assert.equal(saved.name,'latest title');
 assert.equal(f.calls[1].body.requestId,attempt);assert.equal(f.calls.filter(x=>x.path==='/v2/media/publish').length,1);
 assert.equal(f.calls.some(x=>x.path.includes('/v1/uploads')),false);
});
test('lost publication response retries the same request and original without uploading again',async()=>{
 const f=fixture();let n=0;f.hooks.publish=()=>{if(++n===1)throw Error('reply lost');};
 await assert.rejects(f.api.publishLibrary(metadata()),/reply lost/);await f.api.publishLibrary(metadata());
 assert.deepEqual(f.calls.filter(x=>x.path==='/v2/media/publish').map(x=>x.body.requestId),[attempt,attempt]);
});
test('legacy accounts keep their insert path; paused accounts never fall back',async()=>{
 const legacy=fixture('legacy');assert.equal(await legacy.api.publishLibrary(metadata()),null);assert.equal(legacy.calls.length,1);
 const paused=fixture('paused');await assert.rejects(paused.api.publishLibrary(metadata()),e=>e.status===423);assert.equal(paused.calls.length,1);
});
test('different owner, fixed legacy key or invalid attempt cannot be published',async()=>{
 for(const key of [metadata().r2Key.replace(owner,sid),'u/'+owner+'/voice/original.wav',metadata().r2Key.replace(attempt,'invalid')]){
  const f=fixture();await assert.rejects(f.api.publishLibrary({...metadata(),r2Key:key}));assert.equal(f.calls.length,1);
 }
});
test('account or session change before/after the publication request rejects its result',async()=>{
 for(const stage of ['ready','publish']){
  const f=fixture();f.hooks[stage]=()=>{f.state.session=attempt;};
  await assert.rejects(f.api.publishLibrary(metadata()),/로그인/);
  assert.equal(f.calls.filter(x=>x.path==='/v2/media/publish').length,stage==='ready'?0:1);
 }
});
test('a malformed or different-original server acknowledgement cannot confirm publication',async()=>{
 for(const patch of [{user_id:sid},{session_id:attempt},{request_id:sid},{updated_at:null},{metadata:{...metadata(),r2Key:'different'}},{metadata:{...metadata(),r2Etag:'"other"'}}]){
  const f=fixture();f.hooks.result=(m,requestId)=>({version:1,user_id:owner,session_id:sid,request_id:requestId,id:m.id,metadata:m,updated_at:'2026-11-10T00:00:00Z',...patch});
  await assert.rejects(f.api.publishLibrary(metadata()),/확인/);
 }
});
function preflight(source,{delay=30,deleted=false,change=false,fail=false,existing=true}={}){
 const start=source.indexOf('async function importMedia('),end=source.indexOf('/** Files that reached R2',start);
 assert.ok(start>0&&end>start);
 const state={active:0,peak:0,ready:0,writes:0},user={id:owner};
 const wait=async value=>{state.active++;state.peak=Math.max(state.peak,state.active);await new Promise(r=>setTimeout(r,delay));state.active--;if(change)user.id=sid;if(fail)throw Error('read unavailable');return value;};
 const query={select(){return this},eq(){return this},maybeSingle:()=>wait({data:existing?{metadata:{id:'voice',name:'existing'}}:null,error:null})};
 const window={vzipMediaType:f=>f.type,addEventListener(){},removeEventListener(){},VzipR2:{ready:()=>{state.ready++;return wait(true)},upload:async()=>{throw Object.assign(Error('transfer boundary'),{code:'transfer_boundary'});}},VzipAccountScope:null};
 const context={user,client:{from:()=>query},window,mediaImportActive:false,sessionVerified:true,VzipChunks:{MAX_SIZE:2*1024**3},crypto:require('node:crypto').webcrypto,
  AbortController,DOMException,console,cleanupPending:async()=>{},deletedMediaIds:()=>wait(deleted?['voice']:[]),
  mediaRecovery:()=>({pending:()=>[],remember(){state.writes++}})};
 vm.runInNewContext(source.slice(start,end)+'\nglobalThis.runImport=importMedia;',context);
 return {state,run:()=>context.runImport(new File([new Uint8Array([1,2,3])],'voice.wav',{type:'audio/wav'}),{id:'voice'})};
}
test('upload preflight starts independent reads together and never transfers an already saved file',async()=>{
 const f=preflight(fs.readFileSync('cloud-sync.js','utf8')),saved=await f.run();
 assert.equal(saved.name,'existing');assert.equal(f.state.peak,3);assert.equal(f.state.writes,0);
});
test('parallel preflight still blocks deleted files and account changes before publication',async()=>{
 for(const options of [{deleted:true},{change:true},{fail:true}]){
  const f=preflight(fs.readFileSync('cloud-sync.js','utf8'),options);await assert.rejects(f.run());assert.equal(f.state.writes,0);
 }
});
test('measure preflight with identical simulated 30ms read latency',async t=>{
 const base=process.env.VZIP_PUBLICATION_BASE;if(!base){t.skip('baseline not requested');return;}assert.match(base,/^[0-9a-f]{40}$/);
 const previous=execFileSync('git',['show',base+':cloud-sync.js'],{encoding:'utf8'});
 const old=preflight(previous,{existing:false}),fresh=preflight(fs.readFileSync('cloud-sync.js','utf8'),{existing:false});
 let start=performance.now();await assert.rejects(old.run(),{code:'transfer_boundary'});const before=performance.now()-start;
 start=performance.now();await assert.rejects(fresh.run(),{code:'transfer_boundary'});const after=performance.now()-start;
 // Both versions reach the same transfer boundary; only independent preflight scheduling differs.
 assert.equal(old.state.peak,1);assert.equal(fresh.state.peak,3);
 console.log(JSON.stringify({benchmark:'new-file preflight; simulated 30ms independent reads',beforeMs:Math.round(before),afterMs:Math.round(after),beforePeak:old.state.peak,afterPeak:fresh.state.peak}));
});
