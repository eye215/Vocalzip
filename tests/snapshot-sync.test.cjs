'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create,PREFIX}=require('../app/snapshot-sync.js');
const {valid}=require('../data-merge.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const payload=label=>({lessons:[{id:'lesson',note:label}],practices:[],assignments:[],categories:[],songs:[]});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const stamp='2026-11-07T00:00:00.000Z';
function memory(){
 const values=new Map();
 return {values,get length(){return values.size;},key:i=>[...values.keys()][i]??null,
  getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
// Stateful protocol model: successful requests have durable receipts even if their response is lost.
// Independent writes change the current row without changing historical receipts.
function server(){
 let row=null,commits=0;
 const receipts=new Map(),calls=[];
 return {
  calls,receipts,get commits(){return commits;},
  write(revision,data){row={revision,payload:copy(data),updated_at:stamp};},
  async rpc(name,args){
   calls.push({name,args:copy(args)});
   if(name==='vzip_load_snapshot')return {data:row?{exists:true,...copy(row)}:{exists:false,revision:'0',payload:null,updated_at:null},error:null};
   assert.equal(name,'vzip_save_snapshot');
   const signature=JSON.stringify([args.p_expected_revision,args.p_payload]);
   const receipt=receipts.get(args.p_request_id);
   if(receipt){
    if(receipt.signature!==signature)return {data:null,error:{message:'request ID reused'}};
    return {data:{...copy(receipt.result),replayed:true},error:null};
   }
   if(args.p_expected_revision!==(row?.revision??'0'))
    return {data:{status:'conflict',exists:!!row,revision:row?.revision??'0'},error:null};
   row={revision:String(BigInt(row?.revision??'0')+1n),payload:copy(args.p_payload),updated_at:stamp};
   commits++;
   const result={status:'saved',revision:row.revision,updated_at:row.updated_at,replayed:false};
   receipts.set(args.p_request_id,{signature,result:copy(result)});
   return {data:result,error:null};
  }
 };
}
function fixture(options={}){
 const remote=options.remote||server(),storage=options.storage||memory();
 const auth=options.auth||{owner:'account-A',session:'session-A'};
 let serial=options.start||1;
 const api=create({rpc:options.rpc||remote.rpc.bind(remote),storage,owner:options.owner||'account-A',session:options.session||'session-A',
  isCurrent:()=>auth.owner===(options.owner||'account-A')&&auth.session===(options.session||'session-A'),valid,uuid:options.uuid||(()=>id(serial++))});
 return {api,remote,storage,auth};
}
async function uncertain(f,data=payload('draft'),base='0'){
 const before=new Set(f.api.pending().map(entry=>entry.requestId));
 await assert.rejects(f.api.save(base,data),/offline/);
 return f.api.pending().find(entry=>!before.has(entry.requestId)).requestId;
}
function offline(){throw Error('offline');}

test('commit with lost acknowledgement survives reload, replays once, then load returns the latest row',async()=>{
 const remote=server(),storage=memory();
 const first=fixture({remote,storage,rpc:async(...args)=>{await remote.rpc(...args);throw Error('offline: response lost');}});
 const request=await uncertain(first);
 assert.equal(remote.commits,1);
 const original=copy(first.api.pending()[0]);
 remote.write('2',payload('newer independent edit'));
 const reloaded=fixture({remote,storage});
 await reloaded.api.resume();
 assert.equal(remote.commits,1);
 assert.equal(reloaded.api.pending().length,0);
 const replayCall=remote.calls.filter(c=>c.name==='vzip_save_snapshot')[1];
 assert.equal(replayCall.args.p_request_id,request);
 assert.equal(replayCall.args.p_expected_revision,original.expectedRevision);
 assert.deepEqual(replayCall.args.p_payload,original.payload);
 assert.equal(remote.receipts.get(request).result.revision,'1');
 assert.equal((await reloaded.api.load()).revision,'2');
 assert.equal((await reloaded.api.load()).payload.lessons[0].note,'newer independent edit');
});

test('retry exposes replayed acknowledgement without representing it as current snapshot',async()=>{
 const remote=server();
 const f=fixture({remote,rpc:async(...args)=>{await remote.rpc(...args);throw Error('offline');}});
 const request=await uncertain(f);
 remote.write('3',payload('latest'));
 const retry=fixture({remote,storage:f.storage});
 const result=await retry.api.retry(request);
 assert.equal(result.replayed,true);
 assert.equal(result.revision,'1');
 assert.equal(result.payload,undefined);
 assert.equal((await retry.api.load()).revision,'3');
});

test('bigint revisions above 2^53 remain exact strings through load, save, receipt and conflict',async()=>{
 const f=fixture();
 f.remote.write('9007199254740993',payload('before'));
 const loaded=await f.api.load();
 assert.equal(loaded.revision,'9007199254740993');
 const result=await f.api.save(loaded.revision,payload('after'));
 assert.equal(result.revision,'9007199254740994');
 await assert.rejects(f.api.save(loaded.revision,payload('conflict')),{name:'VzipSnapshotConflict'});
 assert.equal(f.api.pending()[0].remoteRevision,'9007199254740994');
});

test('snapshot input is deeply copied before RPC and retry uses the same immutable request',async()=>{
 const gate=deferred(),remote=server(),source=payload('original');
 let sent;
 const f=fixture({remote,rpc:async(name,args)=>{sent=args;await gate.promise;throw Error('offline');}});
 const saving=f.api.save('0',source);
 source.lessons[0].note='changed by UI';
 source.lessons.push({id:'later'});
 assert.equal(f.api.pending()[0].payload.lessons[0].note,'original');
 assert.equal(sent.p_payload.lessons.length,1);
 sent.p_payload.lessons[0].note='changed by RPC adapter';
 gate.resolve();await assert.rejects(saving,/offline/);
 const entry=f.api.pending()[0];
 assert.equal(entry.payload.lessons[0].note,'original');
 const reloaded=fixture({remote,storage:f.storage});
 await reloaded.api.retry(entry.requestId);
 assert.equal((await reloaded.api.load()).payload.lessons[0].note,'original');
});

test('every new save gets a new UUID, while retry retains the original UUID',async()=>{
 const f=fixture({rpc:offline});
 const a=await uncertain(f),b=await uncertain(f,payload('second'));
 assert.notEqual(a,b);
 await assert.rejects(f.api.retry(a),/offline/);
 assert.equal(f.api.pending().length,2);
});

test('acknowledged UUID cannot be reused after a new instance or casing change',async()=>{
 const f=fixture({uuid:()=>id(10)});
 await f.api.save('0',payload('one'));
 const again=fixture({remote:f.remote,storage:f.storage,uuid:()=>id(10).toUpperCase()});
 await assert.rejects(again.api.save('1',payload('two')),/번호/);
 assert.equal(f.remote.commits,1);
});

for(const failAt of [1,2]){
 test('quota failure at durable write '+failAt+' prevents all RPC calls',async()=>{
  const storage=memory(),set=storage.setItem;let writes=0;
  storage.setItem=(...args)=>{if(++writes===failAt)throw Error('quota');return set(...args);};
  const f=fixture({storage});
  await assert.rejects(f.api.save('0',payload('quota')),/quota/);
  assert.equal(f.remote.calls.length,0);
 });
}

const malformedSaved=[
 null,{}, {status:'saved',revision:1,updated_at:stamp,replayed:false},
 {status:'saved',revision:'0',updated_at:stamp,replayed:false},
 {status:'saved',revision:'01',updated_at:stamp,replayed:false},
 {status:'saved',revision:'1',updated_at:'bad',replayed:false},
 {status:'saved',revision:'1',updated_at:stamp,replayed:'false'},
 {status:'conflict',revision:'1',exists:false},
 {status:'conflict',revision:1,exists:true}
];
malformedSaved.forEach((response,index)=>{
 test('malformed save response '+index+' never acknowledges the journal',async()=>{
  const f=fixture({rpc:async()=>({data:response,error:null})});
  await assert.rejects(f.api.save('0',payload('draft')),{name:'VzipSnapshotInvalidResponse'});
  assert.equal(f.api.pending().length,1);
  assert.equal(f.api.pending()[0].status,'pending');
 });
});

test('RPC error objects and rejected promises preserve their journal',async()=>{
 for(const rpc of [async()=>({data:{status:'saved',revision:'1',updated_at:stamp,replayed:false},error:{message:'offline'}}),offline]){
  const f=fixture({rpc});await uncertain(f);assert.equal(f.api.pending().length,1);
 }
});

const malformedLoads=[
 {exists:false,revision:'0',payload:null,updated_at:stamp},
 {exists:false,revision:'1',payload:null,updated_at:null},
 {exists:true,revision:'0',payload:payload('bad'),updated_at:stamp},
 {exists:true,revision:9007199254740992,payload:payload('bad'),updated_at:stamp},
 {exists:true,revision:'1',payload:{},updated_at:stamp},
 {exists:true,revision:'1',payload:payload('bad'),updated_at:'bad'}
];
malformedLoads.forEach((response,index)=>{
 test('malformed load response '+index+' fails closed',async()=>{
  const f=fixture({rpc:async()=>({data:response,error:null})});
  await assert.rejects(f.api.load(),{name:'VzipSnapshotInvalidResponse'});
 });
});

test('empty load is null and existing load is detached from RPC-owned data',async()=>{
 const f=fixture();assert.equal(await f.api.load(),null);
 const data={exists:true,revision:'1',payload:payload('remote'),updated_at:stamp};
 const detached=fixture({rpc:async()=>({data,error:null})});
 const result=await detached.api.load();result.payload.lessons[0].note='local edit';
 assert.equal(data.payload.lessons[0].note,'remote');
});

for(const operation of ['save','retry','load','resume']){
 for(const changed of ['owner','session']){
  test(operation+' rechecks '+changed+' after its RPC await and preserves the journal',async()=>{
   const remote=server(),storage=memory(),auth={owner:'account-A',session:'session-A'};
   const seed=fixture({remote,storage,auth,rpc:offline});
   const request=await uncertain(seed);
   const gate=deferred(),started=deferred();
   const f=fixture({remote,storage,auth,start:2,rpc:async(...args)=>{const response=await remote.rpc(...args);started.resolve();await gate.promise;return response;}});
   const work=operation==='save'?f.api.save('0',payload('new')):operation==='retry'?f.api.retry(request):f.api[operation]();
   await started.promise;auth[changed]='changed';gate.resolve();
   await assert.rejects(work,{name:'VzipSnapshotSessionChanged'});
   assert.ok(storage.getItem(PREFIX+request));
   if(operation==='save')assert.ok(storage.getItem(PREFIX+id(2)));
  });
 }
}

test('rejected network await also rechecks session',async()=>{
 const auth={owner:'account-A',session:'session-A'},gate=deferred();
 const f=fixture({auth,rpc:async()=>{await gate.promise;throw Error('offline');}});
 const work=f.api.save('0',payload('draft'));
 auth.session='new-session';gate.resolve();
 await assert.rejects(work,{name:'VzipSnapshotSessionChanged'});
 assert.ok(f.storage.getItem(PREFIX+id(1)));
});

test('prior auth session is visible for recovery but is never resent automatically',async()=>{
 const f=fixture({rpc:offline});const request=await uncertain(f);
 const next=fixture({remote:f.remote,storage:f.storage,session:'session-B',auth:{owner:'account-A',session:'session-B'}});
 assert.equal(next.api.pending()[0].requestId,request);
 await assert.rejects(next.api.retry(request),{name:'VzipSnapshotRecoveryRequired'});
 await assert.rejects(next.api.resume(),{name:'VzipSnapshotRecoveryRequired'});
 assert.equal(f.remote.calls.length,0);
 assert.ok(f.storage.getItem(PREFIX+request));
});

test('foreign-owner entries cannot be returned, retried or resumed',async()=>{
 const f=fixture({rpc:offline});const request=await uncertain(f);
 const foreign=fixture({remote:f.remote,storage:f.storage,owner:'account-B',session:'session-B',auth:{owner:'account-B',session:'session-B'}});
 assert.throws(()=>foreign.api.pending(),{name:'VzipSnapshotForeignOwner'});
 await assert.rejects(foreign.api.retry(request),{name:'VzipSnapshotForeignOwner'});
 await assert.rejects(foreign.api.resume(),{name:'VzipSnapshotForeignOwner'});
 assert.ok(f.storage.getItem(PREFIX+request));
});

for(const field of ['json','session','createdAt','requestId','expectedRevision','payload','status','remoteRevision']){
 test('corrupt journal field '+field+' fails closed and is retained',async()=>{
  const f=fixture({rpc:offline});const request=await uncertain(f),entry=f.api.pending()[0];
  if(field==='json')f.storage.setItem(PREFIX+request,'{');
  else{
   const invalid={session:'',createdAt:'yesterday',requestId:id(99),expectedRevision:1,payload:{},status:'done',remoteRevision:'invalid'};
   if(field==='remoteRevision')entry.status='conflict';
   entry[field]=invalid[field];f.storage.setItem(PREFIX+request,JSON.stringify(entry));
  }
  const raw=f.storage.getItem(PREFIX+request);
  assert.throws(()=>f.api.pending(),{name:'VzipSnapshotInvalidJournal'});
  await assert.rejects(f.api.retry(request),{name:'VzipSnapshotInvalidJournal'});
  assert.equal(f.storage.getItem(PREFIX+request),raw);
 });
}

test('conflicts preserve exact local payload and base; retry and resume never overwrite remote',async()=>{
 const f=fixture();f.remote.write('4',payload('server'));
 const draft=payload('local draft');
 await assert.rejects(f.api.save('0',draft),{name:'VzipSnapshotConflict'});
 const entry=f.api.pending()[0],calls=f.remote.calls.length;
 assert.deepEqual(entry.payload,draft);assert.equal(entry.expectedRevision,'0');
 await assert.rejects(f.api.retry(entry.requestId),{name:'VzipSnapshotConflict'});
 await assert.rejects(f.api.resume(),{name:'VzipSnapshotConflict'});
 assert.equal(f.remote.calls.length,calls);
 assert.equal(f.remote.commits,0);
 assert.equal((await f.api.load()).payload.lessons[0].note,'server');
});

test('two tabs retry one request: receipt gives one commit and an error cannot recreate an acknowledged journal',async()=>{
 const remote=server(),storage=memory(),seed=fixture({remote,storage,rpc:offline});
 const request=await uncertain(seed),gate=deferred(),started=deferred();
 const loser=fixture({remote,storage,rpc:async(...args)=>{await remote.rpc(...args);started.resolve();await gate.promise;throw Error('offline after commit');}});
 const work=loser.api.retry(request);await started.promise;
 const winner=fixture({remote,storage});
 const receipt=await winner.api.retry(request);
 assert.equal(receipt.replayed,true);assert.equal(remote.commits,1);
 assert.equal(storage.getItem(PREFIX+request),null);
 gate.resolve();await assert.rejects(work,/offline/);
 assert.equal(storage.getItem(PREFIX+request),null);
});

test('two successful tabs can acknowledge one receipt without recreating or failing a removed journal',async()=>{
 const remote=server(),storage=memory(),seed=fixture({remote,storage,rpc:offline});
 const request=await uncertain(seed),gate=deferred(),started=deferred();
 const delayed=fixture({remote,storage,rpc:async(...args)=>{const response=await remote.rpc(...args);started.resolve();await gate.promise;return response;}});
 const work=delayed.api.retry(request);await started.promise;
 await fixture({remote,storage}).api.retry(request);gate.resolve();
 assert.equal((await work).replayed,false);
 assert.equal(remote.commits,1);assert.equal(storage.getItem(PREFIX+request),null);
});

test('resume skips only a request removed by another tab after enumeration',async()=>{
 const remote=server(),storage=memory(),seed=fixture({remote,storage,rpc:offline});
 const first=await uncertain(seed),second=await uncertain(seed,payload('second'),'1');
 const gate=deferred(),started=deferred();
 const active=fixture({remote,storage,rpc:async(...args)=>{const response=await remote.rpc(...args);started.resolve();await gate.promise;return response;}});
 const work=active.api.resume();await started.promise;
 await fixture({remote,storage}).api.retry(first);
 await fixture({remote,storage}).api.retry(second);
 gate.resolve();await work;
 assert.equal(active.api.pending().length,0);assert.equal(remote.commits,2);
 await assert.rejects(active.api.retry(second),{name:'VzipSnapshotRequestMissing',requestId:second});
});

test('resume propagates real network failures even if another tab removed the journal',async()=>{
 const remote=server(),storage=memory(),seed=fixture({remote,storage,rpc:offline});
 const request=await uncertain(seed),gate=deferred(),started=deferred();
 const failing=fixture({remote,storage,rpc:async(...args)=>{await remote.rpc(...args);started.resolve();await gate.promise;throw Error('offline');}});
 const work=failing.api.resume();await started.promise;
 await fixture({remote,storage}).api.retry(request);
 gate.resolve();await assert.rejects(work,/offline/);
 assert.equal(storage.getItem(PREFIX+request),null);
});

test('ack does not remove an entry replaced with a different session while RPC is in flight',async()=>{
 const gate=deferred(),started=deferred(),remote=server();
 const f=fixture({remote,rpc:async(...args)=>{const response=await remote.rpc(...args);started.resolve();await gate.promise;return response;}});
 const work=f.api.save('0',payload('draft'));await started.promise;
 const entry=f.api.pending()[0];entry.session='session-B';
 f.storage.setItem(PREFIX+entry.requestId,JSON.stringify(entry));gate.resolve();
 await assert.rejects(work,{name:'VzipSnapshotJournalChanged'});
 assert.equal(JSON.parse(f.storage.getItem(PREFIX+entry.requestId)).session,'session-B');
});

test('ack does not remove a request whose payload changed while RPC was in flight',async()=>{
 const gate=deferred(),started=deferred(),remote=server();
 const f=fixture({remote,rpc:async(...args)=>{const response=await remote.rpc(...args);started.resolve();await gate.promise;return response;}});
 const work=f.api.save('0',payload('draft'));await started.promise;
 const entry=f.api.pending()[0];entry.payload.lessons[0].note='replacement';
 f.storage.setItem(PREFIX+entry.requestId,JSON.stringify(entry));gate.resolve();
 await assert.rejects(work,{name:'VzipSnapshotJournalChanged'});
 assert.equal(f.api.pending()[0].payload.lessons[0].note,'replacement');
});

test('resume does not mask a network error merely named like a missing journal',async()=>{
 const remote=server(),storage=memory(),seed=fixture({remote,storage,rpc:offline});
 const request=await uncertain(seed);
 const f=fixture({remote,storage,rpc:async()=>{throw Object.assign(Error('offline'),{name:'VzipSnapshotRequestMissing',requestId:request});}});
 await assert.rejects(f.api.resume(),/offline/);
 assert.ok(storage.getItem(PREFIX+request));
});
