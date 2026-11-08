const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,createTransport}=require('../sync/field-draft-outbox.js');
const U='owner-a',V='owner-b',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const E='10000000-0000-4000-8000-000000000001',E2='10000000-0000-4000-8000-000000000002',D='20000000-0000-4000-8000-000000000001';
const S={entityId:'legacy-lesson',field:'memo'};
let ids=0;const uid=()=> '30000000-0000-4000-8000-'+String(++ids).padStart(12,'0');
class Store {
 constructor(){this.rows=new Map();this.writes=0;this.failNext=false;}
 getItem(k){return this.rows.get(k)??null;}
 setItem(k,v){if(this.failNext){this.failNext=false;throw Error('quota failure');}this.rows.set(k,v);this.writes++;}
 key(i){return [...this.rows.keys()][i]??null;}
 get length(){return this.rows.size;}
}
const lease=(text='base',revision='0',epoch='1',editor=E,draft=D)=>({text,revision,epoch,editor_instance:editor,draft_id:draft,is_editor:true});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};
function backend(){
 let rev=0n,text='base',commits=0;const calls=[],receipts=new Map();
 return {calls,get commits(){return commits;},get text(){return text;},send:async q=>{
  calls.push({...q});
  if(receipts.has(q.p_request_id))return {...receipts.get(q.p_request_id),replayed:true};
  if(BigInt(q.p_expected_revision)!==rev)return {status:'conflict',draft_id:D,revision:String(rev),epoch:'1',preserved:false,conflict_id:null,reason:'revision_changed'};
  rev++;text=q.p_text;commits++;
  const r={status:'saved',draft_id:q.p_draft_id,revision:String(rev),epoch:q.p_expected_epoch};
  receipts.set(q.p_request_id,r);return r;
 }};
}
function fixture(options={}){
 const storage=options.storage||new Store(),server=options.server||backend();
 const identity={owner:U,session:A};
 const config={owner:U,editorId:E,sessionId:A,storage,send:server.send,getOwner:()=>identity.owner,getSessionId:()=>identity.session,makeId:uid,now:()=>1,...options};
 return {model:create(config),storage,server,identity,config};
}
function ready(f,value='typed'){f.model.start(S,'base');f.model.edit(S,value);f.model.attachLease(S,lease());}
test('local text survives a model reload without network access',()=>{
 const f=fixture();f.model.start(S,'base');f.model.edit(S,'offline Korean 가사');
 const next=create(f.config);assert.equal(next.read(S).text,'offline Korean 가사');assert.equal(next.read(S).status,'local');assert.equal(f.server.calls.length,0);
});
test('the pending operation is durable before send and excludes account credentials',async()=>{
 let f;f=fixture({send:async q=>{
  const r=f.model.read(S);assert.equal(r.pending.id,q.p_request_id);assert.equal(r.pending.text,'typed');assert.equal(r.status,'syncing');
  for(const k of ['user_id','session_id','owner','access_token'])assert.equal(k in q,false);
  return f.server.send(q);
 }});ready(f);await f.model.sync(S);assert.equal(f.model.read(S).status,'server_draft');
});
for(const stage of ['before_commit','after_commit']){
 test('network failure '+stage+' preserves the same request for replay',async()=>{
  let first=true,f;f=fixture({send:async q=>{
   if(first&&stage==='before_commit'){first=false;throw Error('offline');}
   const r=await f.server.send(q);if(first){first=false;throw Error('response lost');}return r;
  }});ready(f);assert.equal((await f.model.sync(S)).status,'retryable');const pending=f.model.read(S).pending;
  assert.equal(pending.text,'typed');const next=create(f.config);
  assert.equal((await next.sync(S)).status,'server_draft');assert.equal(next.read(S).pending,null);
  assert.equal(f.server.commits,1);assert.equal(f.server.calls.at(-1).p_request_id,pending.id);
 });
}
test('a successful old save never erases text typed during its request',async()=>{
 const gate=deferred();let f;f=fixture({send:async q=>{await gate.promise;return f.server.send(q);}});ready(f,'first');
 const saving=f.model.sync(S);f.model.edit(S,'second');gate.resolve();await saving;
 const r=f.model.read(S);assert.equal(r.text,'second');assert.equal(r.baseText,'first');assert.equal(r.status,'local');
 await f.model.sync(S);assert.equal(f.server.text,'second');assert.equal(f.server.commits,2);assert.equal(f.model.read(S).status,'server_draft');
});
test('concurrent sync calls share one request promise',async()=>{
 const gate=deferred();let f;f=fixture({send:async q=>{await gate.promise;return f.server.send(q);}});ready(f);
 const a=f.model.sync(S),b=f.model.sync(S);assert.equal(a,b);gate.resolve();await a;assert.equal(f.server.calls.length,1);
});
test('owner changes block reads and acknowledgement writes into the next account',async()=>{
 const gate=deferred();let f;f=fixture({send:async q=>{await gate.promise;return f.server.send(q);}});ready(f,'A private');
 const p=f.model.sync(S),writes=f.storage.writes;f.identity.owner=V;
 assert.throws(()=>f.model.read(S),e=>e.code==='owner_changed');gate.resolve();assert.deepEqual(await p,{status:'identity_changed'});assert.equal(f.storage.writes,writes);
 const b=create({...f.config,owner:V,editorId:E2});assert.equal(b.read(S),null);
 f.identity.owner=U;assert.equal(f.model.read(S).pending.text,'A private');
});
test('session changes preserve the original pending operation and refuse replay under a new session',async()=>{
 const gate=deferred();let f;f=fixture({send:async q=>{await gate.promise;return f.server.send(q);}});ready(f);
 const p=f.model.sync(S);f.identity.session=B;gate.resolve();assert.equal((await p).status,'identity_changed');
 const next=create({...f.config,sessionId:B});assert.equal((await next.sync(S)).status,'session_changed');assert.ok(next.read(S).pending);assert.equal(f.server.calls.length,1);
});
test('storage failure before send leaves the prior text and makes zero network calls',async()=>{
 const f=fixture();ready(f);const before=f.model.exportRaw(S);f.storage.failNext=true;
 await assert.rejects(f.model.sync(S),/quota/);assert.equal(f.server.calls.length,0);assert.equal(f.model.exportRaw(S),before);
});
test('storage failure after server acknowledgement retains a replayable receipt key',async()=>{
 let fail=true,f;f=fixture({send:async q=>{const r=await f.server.send(q);if(fail){fail=false;f.storage.failNext=true;}return r;}});ready(f);
 await assert.rejects(f.model.sync(S),/quota/);const pending=f.model.read(S).pending;assert.ok(pending);
 await f.model.sync(S);assert.equal(f.server.commits,1);assert.equal(f.server.calls[1].p_request_id,pending.id);assert.equal(f.model.read(S).status,'server_draft');
});
test('conflicts preserve pending and newer local text until an explicit choice',async()=>{
 const gate=deferred();const f=fixture({send:async()=>{await gate.promise;return {status:'conflict',preserved:false,conflict_id:null,reason:'lease_changed'};}});ready(f,'sent');
 const p=f.model.sync(S);f.model.edit(S,'newest local');gate.resolve();await p;
 const r=f.model.read(S);assert.equal(r.status,'conflict');assert.equal(r.text,'newest local');assert.equal(r.conflicts[0].text,'sent');assert.equal(r.conflicts[0].serverPreserved,false);
 assert.equal((await f.model.sync(S)).status,'conflict');
 assert.throws(()=>f.model.resolve(S,lease('server','2','3')),e=>e.code==='explicit_choice_required');
 const resolved=f.model.resolve(S,lease('server','2','3'),'keep_local');assert.equal(resolved.text,'newest local');assert.equal(resolved.baseText,'server');assert.equal(resolved.status,'local');
});
test('choosing server text preserves the discarded local text as a separate local copy',()=>{
 const f=fixture();ready(f,'precious local');const r=f.model.resolve(S,lease('server text','4','8'),'use_server');
 assert.equal(r.text,'server text');assert.equal(r.status,'server_draft');assert.ok(r.conflicts.some(c=>c.text==='precious local'));
});
test('remote changes conflict with dirty input and never silently replace it',()=>{
 const f=fixture();f.model.start(S,'base');f.model.edit(S,'dirty');
 const r=f.model.attachLease(S,lease('remote changed','3','2'));assert.equal(r.text,'dirty');assert.equal(r.status,'conflict');assert.equal(r.candidate.text,'remote changed');
 const clean=fixture();clean.model.start(S,'base');assert.equal(clean.model.attachLease(S,lease('remote changed','3','2')).text,'remote changed');
});
test('malformed acknowledgements do not clear a durable pending operation',async()=>{
 for(const response of [{status:'saved'}, {status:'saved',draft_id:D,revision:'9',epoch:'1'},{status:'conflict',preserved:true,conflict_id:null}]){
  const f=fixture({send:async()=>response});ready(f);await assert.rejects(f.model.sync(S));assert.equal(f.model.read(S).pending.text,'typed');
 }
});
test('remote revisions above JavaScript integer precision remain exact strings',async()=>{
 const f=fixture({send:async q=>({status:'saved',draft_id:D,epoch:q.p_expected_epoch,revision:String(BigInt(q.p_expected_revision)+1n)})});
 f.model.start(S,'base');f.model.edit(S,'text');f.model.attachLease(S,lease('base','9007199254740993','1'));await f.model.sync(S);
 assert.equal(f.model.read(S).remote.revision,'9007199254740994');
});
test('corrupt and future-format records are never overwritten and known foreign-owner data is not exported',()=>{
 const f=fixture();f.model.start(S,'base');const key=f.storage.key(0);
 for(const raw of ['{broken',JSON.stringify({schema:2,owner:U})]){
  f.storage.rows.set(key,raw);assert.throws(()=>f.model.start(S,'replace'));assert.equal(f.storage.getItem(key),raw);assert.equal(f.model.exportRaw(S),raw);
 }
 f.storage.rows.set(key,JSON.stringify({schema:1,owner:V}));assert.throws(()=>f.model.read(S));assert.throws(()=>f.model.exportRaw(S),e=>e.code==='owner_mismatch');
});
test('oversize UTF-8 input is rejected without truncating the last safe local copy',()=>{
 const f=fixture();f.model.start(S,'base');f.model.edit(S,'safe');const before=f.model.exportRaw(S);
 assert.throws(()=>f.model.edit(S,'가'.repeat(21846)),e=>e.code==='invalid_text');assert.equal(f.model.exportRaw(S),before);
});
test('different tabs keep separate local copies and list only their owner namespace',()=>{
 const f=fixture();f.model.start(S,'tab one');const other=create({...f.config,editorId:E2});other.start(S,'tab two');
 assert.equal(f.model.read(S).text,'tab one');assert.equal(other.read(S).text,'tab two');
 const list=f.model.list();assert.equal(list.records.length,2);assert.equal(list.corrupt.length,0);
 f.identity.owner=V;const b=create({...f.config,owner:V});b.start(S,'owner B');assert.equal(b.list().records.length,1);f.identity.owner=U;assert.equal(f.model.list().records.length,2);
});
test('an acknowledgement from an explicitly superseded operation cannot clear a newer local choice',async()=>{
 const gate=deferred();let f;f=fixture({send:async q=>{await gate.promise;return f.server.send(q);}});ready(f,'old pending');
 const p=f.model.sync(S);f.model.edit(S,'latest choice');f.model.resolve(S,lease('base','0','1'),'keep_local');gate.resolve();
 assert.equal((await p).status,'stale_ack');assert.equal(f.model.read(S).text,'latest choice');assert.equal(f.model.read(S).status,'local');assert.ok(f.model.read(S).conflicts.some(c=>c.text==='old pending'));
});
test('authentication errors preserve text and queue until re-authenticated conflict resolution',async()=>{
 const f=fixture({send:async()=>{throw Object.assign(Error('denied'),{status:403});}});ready(f);
 assert.equal((await f.model.sync(S)).status,'blocked');assert.equal(f.model.read(S).text,'typed');assert.ok(f.model.read(S).pending);
 assert.equal((await f.model.sync(S)).status,'blocked');
});

const jwt=(sub=U,session_id=A)=>'test.'+Buffer.from(JSON.stringify({sub,session_id})).toString('base64url')+'.signature-for-unit-test';
test('transport captures the intended JWT and immutable operation bytes',async()=>{
 const gate=deferred(),calls=[];let owner=U,session=A;
 const transport=createTransport({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',
  getCredentials:async()=>{await gate.promise;return jwt();},getOwner:()=>owner,getSessionId:()=>session,
  fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({status:'saved'})};}});
 const payload={p_operation:'save',p_text:'exact original'};const promise=transport(payload);payload.p_text='later edit';gate.resolve();await promise;
 assert.equal(calls[0].url,'https://example.supabase.co/rest/v1/rpc/vzip_field_draft');
 assert.equal(JSON.parse(calls[0].options.body).p_text,'exact original');assert.equal(calls[0].options.headers.Authorization,'Bearer '+jwt());
 assert.equal(calls[0].options.headers['X-Client-Info'],'vocalzip-device-session-v2');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');
});
test('transport aborts before network if identity changes while retrieving credentials',async()=>{
 const gate=deferred();let owner=U,calls=0;
 const transport=createTransport({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',
  getCredentials:async()=>{await gate.promise;return jwt();},getOwner:()=>owner,getSessionId:()=>A,
  fetch:async()=>{calls++;throw Error('should not run');}});
 const promise=transport({p_operation:'load'});owner=V;gate.resolve();await assert.rejects(promise,e=>e.code==='identity_changed');assert.equal(calls,0);
});
test('transport rejects another account or session token and rejects caller-supplied ownership',async()=>{
 for(const token of [jwt(V,A),jwt(U,B)]){
  let calls=0;const transport=createTransport({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',
   getCredentials:async()=>token,getOwner:()=>U,getSessionId:()=>A,fetch:async()=>{calls++;}});
  await assert.rejects(transport({p_operation:'load'}),e=>e.code==='credential_mismatch');assert.equal(calls,0);
  await assert.rejects(transport({p_operation:'load',user_id:V}),e=>e.code==='invalid_request');
 }
});
test('transport rejects insecure origins and server-only keys; RPC errors have no legacy write fallback',async()=>{
 const config={projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',getCredentials:async()=>jwt(),getOwner:()=>U,getSessionId:()=>A,fetch:async()=>({ok:false,status:404})};
 assert.throws(()=>createTransport({...config,projectUrl:'http://example.supabase.co'}),e=>e.code==='invalid_transport');
 assert.throws(()=>createTransport({...config,publishableKey:'sb_secret_test'}),e=>e.code==='invalid_transport');
 const serviceKey='test.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
 assert.throws(()=>createTransport({...config,publishableKey:serviceKey}),e=>e.code==='publishable_key_required');
 await assert.rejects(createTransport(config)({p_operation:'save'}),e=>e.code==='rpc_failed'&&e.status===404);
});

test('a server rollout pause preserves the pending packet and blocks automatic resends',async()=>{
 const f=fixture({send:async()=>({status:'disabled',reason:'feature_disabled',preserved:false})});ready(f);
 assert.equal((await f.model.sync(S)).status,'blocked');const r=f.model.read(S);assert.equal(r.blockedReason,'feature_disabled');assert.equal(r.pending.text,'typed');
 assert.equal((await f.model.sync(S)).status,'blocked');
});
