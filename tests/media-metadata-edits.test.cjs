const {test}=require('node:test'),assert=require('node:assert/strict');
const Model=require('../media-metadata-edits.js');
const owner='alice',sid='session-a',version='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nonce='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const row=()=>({metadata:{id:'voice',storageProvider:'r2',r2Key:'u/alice/voice/'+version+'/original.wav',size:3,type:'audio/wav',r2Etag:'"same"',name:'old',review:'keep',recordedDate:'2026-11-10'},updated_at:'2026-11-10T09:00:00.123456+09:00'});
function fixture(){
 const memory=new Map(),state={identity:{owner,session:sid},mode:'revision',count:0,applied:0},hooks={},locks=new Map();
 const storage={get length(){return memory.size},key:i=>[...memory.keys()][i]??null,getItem:k=>memory.get(k)??null,
  setItem:(k,v)=>{if(hooks.full)throw Error('quota');memory.set(k,v);},removeItem:k=>{if(hooks.removeFail)throw Error('remove failed');memory.delete(k);}};
 const lock=async(name,fn)=>{const prev=locks.get(name)||Promise.resolve();let release;const gate=new Promise(r=>release=r);locks.set(name,prev.then(()=>gate));await prev;try{return await fn()}finally{release();}};
 let saved=row(),receipt=null;
 const send=async request=>{
  state.count++;await hooks.beforeSend?.(request);
  if(hooks.conflict)throw Object.assign(Error('conflict'),{status:409});
  if(hooks.fail)throw Error('network');
  if(!receipt){state.applied++;saved={metadata:{...saved.metadata,...request.patch},updated_at:'2026-11-10T00:00:00.123457Z'};
   receipt={version:1,user_id:owner,session_id:sid,request_id:request.requestId,id:'voice',object_key:request.key,
    metadata:saved.metadata,updated_at:saved.updated_at,applied_updated_at:saved.updated_at,replayed:false,superseded:false};}
  const out={...receipt,replayed:state.count>1};if(hooks.lostOnce){hooks.lostOnce=false;throw Error('reply lost');}
  return hooks.result?hooks.result(out):out;
 };
 const options={storage,identity:()=>state.identity,mode:async()=>state.mode,send,lock,uuid:()=>nonce};
 const api=Model.create(options),job=()=>({id:'voice',intent:{name:'new'},load:async()=>row(),mutate:m=>({...m,name:'new'})});
 return {memory,storage,state,hooks,api,options,job};
}
test('server timestamps retain all six fractional digits across offsets and reject invalid dates',()=>{
 assert.equal(Model.stamp('2026-11-10T09:00:00.123456+09:00'),'2026-11-10T00:00:00.123456Z');
 assert.equal(Model.stamp('2026-11-10T00:00:00Z'),'2026-11-10T00:00:00.000000Z');
 assert.equal(Model.stamp('2026-11-10T00:00:00.12Z'),'2026-11-10T00:00:00.120000Z');
 for(const v of [null,'2026-02-30T00:00:00Z','2026-11-10','2026-11-10T00:00:00.1234567Z'])assert.throws(()=>Model.stamp(v),{code:'version'});
});
test('patch preserves originals, pairs song/title state, and refuses unsupported deletion/type changes',()=>{
 const before=row().metadata;
 assert.deepEqual(Model.patch(before,{...before,name:'new',nameMode:'manual',autoName:null}),{name:'new',nameMode:'manual',autoName:null});
 assert.deepEqual(Model.patch(before,{...before,songId:'song'}),{songId:'song',song:''});
 for(const after of [{...before,r2Key:'other'},{...before,type:'audio/flac'},{...before,review:undefined}])assert.throws(()=>Model.patch(before,after),{code:'unsupported'});
 assert.deepEqual(Model.patch(before,{...before}),{});
});
test('one edit is durable before POST, uses its original microsecond version and removes only its own receipt',async()=>{
 const f=fixture();f.hooks.beforeSend=request=>{assert.equal(f.api.list().length,1);assert.equal(request.updatedAt,'2026-11-10T00:00:00.123456Z');};
 const saved=await f.api.run(f.job());assert.equal(saved.metadata.name,'new');assert.equal(saved.metadata.review,'keep');
 assert.equal(f.memory.size,0);assert.equal(f.state.applied,1);
});
test('response loss survives reload and the same Save confirms the original request without loading/reapplying',async()=>{
 const f=fixture();f.hooks.lostOnce=true;await assert.rejects(f.api.run(f.job()),/reply lost/);
 const recreated=Model.create(f.options),j=f.job();j.load=()=>{throw Error('must not read a newer base');};j.mutate=()=>{throw Error('must not recompute');};
 const saved=await recreated.run(j);assert.equal(saved.replayed,true);assert.equal(f.state.applied,1);assert.equal(f.state.count,2);assert.equal(f.memory.size,0);
});
test('newer conflicting edits are never retried/rebased; drafts require explicit matching confirmation to discard',async()=>{
 const f=fixture();f.hooks.conflict=true;await assert.rejects(f.api.run(f.job()),e=>e.status===409);
 assert.equal(f.api.list()[0].state,'conflict');f.hooks.conflict=false;
 await assert.rejects(f.api.run(f.job()),{code:'conflict'});assert.equal(f.state.count,1);
 await assert.rejects(f.api.discard('voice',{requestId:nonce}),{code:'confirmation'});
 await assert.rejects(f.api.discard('voice',{confirmed:true,requestId:version}),{code:'pending'});
 assert.equal(await f.api.discard('voice',{confirmed:true,requestId:nonce}),true);
});
test('superseded acknowledgement preserves input and never replaces the form with later metadata',async()=>{
 const f=fixture();f.hooks.result=r=>({...r,replayed:true,superseded:true,updated_at:'2026-11-10T00:00:00.123458Z',metadata:{...r.metadata,name:'other device'}});
 await assert.rejects(f.api.run(f.job()),{code:'superseded'});assert.equal(f.api.list()[0].request.patch.name,'new');
 await assert.rejects(f.api.retry('voice'),{code:'superseded'});assert.equal(f.state.count,1);
});
test('another Save cannot replace an ambiguous pending request; explicit retry uses its original ID',async()=>{
 const f=fixture();f.hooks.fail=true;await assert.rejects(f.api.run(f.job()));
 await assert.rejects(f.api.run({...f.job(),intent:{name:'another'}}),{code:'pending'});
 await assert.rejects(f.api.discard('voice',{confirmed:true,requestId:nonce}),{code:'pending'});
 f.hooks.fail=false;await f.api.retry('voice');assert.equal(f.state.applied,1);
});
test('confirmed legacy alone can use its old path, while paused and a mode downgrade with pending input fail closed',async()=>{
 const f=fixture();f.state.mode='legacy';assert.equal(await f.api.run(f.job()),null);assert.equal(f.state.count,0);
 f.state.mode='paused';await assert.rejects(f.api.run(f.job()),{code:'mode'});
 f.state.mode='revision';f.hooks.fail=true;await assert.rejects(f.api.run(f.job()));
 f.state.mode='legacy';await assert.rejects(f.api.run(f.job()),{code:'pending'});
});
test('quota failure never sends, and a failed receipt removal confirms the already-applied operation on retry',async()=>{
 const f=fixture();f.hooks.full=true;await assert.rejects(f.api.run(f.job()),/quota/);assert.equal(f.state.count,0);
 f.hooks.full=false;f.hooks.removeFail=true;await assert.rejects(f.api.run(f.job()),/remove failed/);
 f.hooks.removeFail=false;await f.api.run(f.job());assert.equal(f.state.applied,1);
});
test('logout/session change preserves old pending data and another login never auto-resubmits it',async()=>{
 const f=fixture();f.hooks.beforeSend=()=>{f.state.identity={owner,session:'session-b'};};
 await assert.rejects(f.api.run(f.job()),{code:'identity'});assert.equal(f.memory.size,1);
 const next=Model.create(f.options);await assert.rejects(next.run(f.job()),{code:'previous_session'});
 assert.equal(f.state.count,1);
 f.state.identity={owner:'bob',session:'b'};
 const other=Model.create(f.options);assert.equal(other.list().length,0);
});
test('malformed journal data remains intact and blocks a new write',async()=>{
 const f=fixture(),key=Model.PREFIX+'alice:voice';f.memory.set(key,'broken');
 await assert.rejects(f.api.run(f.job()),{code:'corrupt'});assert.equal(f.memory.get(key),'broken');assert.equal(f.state.count,0);
});
test('missing shared lock refuses revision writes and leaves legacy behavior available',async()=>{
 const f=fixture(),api=Model.create({...f.options,lock:null});
 await assert.rejects(api.run(f.job()),{code:'lock'});assert.equal(f.state.count,0);
 f.state.mode='legacy';assert.equal(await api.run(f.job()),null);
});
test('two tabs share one pending operation and account leave remains guarded while either request is active',async()=>{
 const f=fixture(),other=Model.create(f.options);f.hooks.lostOnce=true;
 const results=await Promise.allSettled([f.api.run(f.job()),other.run(f.job())]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state.applied,1);assert.equal(f.state.count,2);
 assert.equal(f.api.busy(),false);assert.equal(other.busy(),false);
});
test('reordered input keys still confirm the same request and a stale journal change never gets overwritten',async()=>{
 const f=fixture(),j=f.job();j.intent={name:'new',review:'same'};f.hooks.lostOnce=true;await assert.rejects(f.api.run(j));
 const reordered={...j,intent:{review:'same',name:'new'}};await f.api.run(reordered);assert.equal(f.state.applied,1);
 const next=fixture();next.hooks.beforeSend=()=>{const [key]=next.memory.keys();next.memory.set(key,next.memory.get(key)+' ');};
 await assert.rejects(next.api.run(next.job()),{code:'pending'});assert.equal(next.memory.size,1);
});
test('a malformed or different-original response remains ambiguous without success or journal loss',async()=>{
 for(const patch of [{user_id:'bob'},{session_id:'other'},{request_id:version},{object_key:'other'},{superseded:true}]){
  const f=fixture();f.hooks.result=r=>({...r,...patch});await assert.rejects(f.api.run(f.job()),{code:'response'});assert.equal(f.memory.size,1);
 }
});
test('a non-immutable or legacy original never reaches POST',async()=>{
 for(const extra of [{r2Key:'u/alice/voice/original.wav'},{path:'legacy/file'},{storageProvider:'supabase'}]){
  const f=fixture(),j=f.job();j.load=async()=>({metadata:{...row().metadata,...extra},updated_at:row().updated_at});
  await assert.rejects(f.api.run(j),{code:'adoption'});assert.equal(f.state.count,0);assert.equal(f.memory.size,0);
 }
});

test('scoped bulk key enumeration avoids repeated namespace scans while retaining owner isolation',async()=>{
 const f=fixture();f.storage.key=()=>{throw Error('must use bulk keys');};
 const listKeys=()=>[...f.memory.keys()],api=Model.create({...f.options,listKeys});f.hooks.fail=true;
 await assert.rejects(api.run(f.job()),/network/);assert.equal(api.list().length,1);
 assert.equal(Model.hasPending(f.storage,owner,listKeys),true);assert.equal(Model.hasPending(f.storage,'bob',listKeys),false);
});
