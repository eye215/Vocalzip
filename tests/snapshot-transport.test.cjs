const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../sync/snapshot-transport.js');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',T='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',G='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const payload=()=>({categories:[],songs:[{id:'song',title:'keep'}],lessons:[],assignments:[],practices:[]});
const clone=v=>v==null?v:structuredClone(v),valid=v=>!!v&&['categories','songs','lessons','assignments','practices'].every(k=>Array.isArray(v[k])),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),keys:()=>[...m.keys()]};}
function fixture(){
 const store=storage(),who={owner:U,session:S},server={row:{payload:payload(),revision:'1',generation:G,updated_at:'2026-11-10T00:00:00.000001Z'},receipts:new Map(),calls:[],commits:0,lost:false};
 let active=false;
 const lock=async work=>{if(active)throw Error('locked');active=true;try{return await work()}finally{active=false}};
 const options={storage:store,identity:()=>who,lock,valid,same,read:async()=>clone(server.row),send:async q=>{
  server.calls.push(clone(q));if(server.wait)await server.wait;
  let result=server.receipts.get(q.p_request_id);
  if(!result){
   const current=P.version(server.row);
   if(current.revision!==q.p_expected_revision||current.generation!==q.p_expected_generation)return {status:'conflict',...current};
   server.commits++;server.row={payload:clone(q.p_payload),revision:String(BigInt(current.revision)+1n),generation:current.generation||G,updated_at:'2026-11-10T00:00:01.000001Z'};
   result={status:'saved',...P.version(server.row),updated_at:server.row.updated_at};server.receipts.set(q.p_request_id,result);
   if(server.lost){server.lost=false;throw Error('lost response');}
  }
  return clone(result);
 }};
 const create=extra=>P.create({...options,...extra}),client=create();return {store,who,server,options,create,client};
}
test('durable request replay after a lost response commits once and retains exact original bytes',async()=>{
 const f=fixture();await f.client.observe(f.server.row,f.server.row.payload);
 const edited=payload();edited.songs.push({id:'new'});f.server.lost=true;
 await assert.rejects(f.client.write(f.server.row,edited),/lost/);const pending=f.client.state().pending;
 edited.songs[1].id='later local edit';
 const restored=f.create();await restored.recover();
 assert.equal(f.server.commits,1);assert.equal(f.server.calls.length,2);assert.deepEqual(f.server.calls[0],f.server.calls[1]);
 assert.equal(f.server.row.payload.songs[1].id,'new');assert.equal(restored.state().pending,null);assert.equal(pending.payload.songs[1].id,'new');
});
test('quota failure before journal persistence performs no server write',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());f.store.setItem=()=>{throw Error('quota');};
 await assert.rejects(f.client.write(f.server.row,payload()),e=>e.code==='storage');assert.equal(f.server.commits,0);assert.equal(f.server.calls.length,0);
});
test('CAS conflict preserves the request and remote content without a second unconditional write',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());const old=clone(f.server.row);
 f.server.row.payload.songs.push({id:'tablet'});f.server.row.revision='2';
 await assert.rejects(f.client.write(old,payload()),e=>e.code==='conflict');
 assert.equal(f.client.state().pending.payload.songs.length,1);assert.equal(f.server.row.payload.songs[1].id,'tablet');assert.equal(f.server.commits,0);
});
test('new login cannot replay or discard the previous session request',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());f.server.lost=true;
 await assert.rejects(f.client.write(f.server.row,payload()));const before=f.store.getItem(f.store.keys()[0]);f.who.session=T;
 const fresh=f.create();await assert.rejects(fresh.recover(),e=>e.code==='session');assert.equal(f.store.getItem(f.store.keys()[0]),before);assert.equal(f.server.calls.length,1);
});
test('identity change after server commit never writes an acknowledgement to the next account',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());const send=f.options.send;
 const c=f.create({send:async q=>{const r=await send(q);f.who.owner=V;return r;}});
 await assert.rejects(c.write(f.server.row,payload()),e=>e.code==='identity');f.who.owner=U;assert.ok(f.client.state().pending);assert.equal(f.server.commits,1);
});
test('malformed acknowledgement and a later server generation retain the pending request',async()=>{
 for(const mode of ['invalid','advanced']){
  const f=fixture();await f.client.observe(f.server.row,payload());const send=f.options.send;
  const c=f.create({send:async q=>{const r=await send(q);if(mode==='invalid')return {status:'saved',revision:'rounded',generation:G};f.server.row.generation=T;return r;}});
  await assert.rejects(c.write(f.server.row,payload()));assert.ok(c.state().pending);
 }
});
test('dirty bootstrap and changed baselines never apply a merge or erase local input',async()=>{
 const f=fixture(),local=payload();local.songs.push({id:'offline'});
 let applied=false;await assert.rejects(f.client.prepare(f.server.row,()=>({payload:local,dirty:true}),()=>{applied=true;}),e=>e.code==='bootstrap');
 assert.equal(applied,false);assert.equal(local.songs[1].id,'offline');assert.equal(P.hasState(f.store,U),false);
 const c=f.create();await c.observe(f.server.row,f.server.row.payload);
 f.server.row.generation=T;
 await assert.rejects(c.prepare(f.server.row,()=>({payload:local,dirty:true}),()=>{applied=true;}),e=>e.code==='conflict');assert.equal(applied,false);
});
test('prepare reads live local state under the lock and only advances a baseline after local apply',async()=>{
 const f=fixture();let local=payload(),apply=0;
 const c=f.create({lock:async work=>{local.songs.push({id:'latest'});return work();}});
 await c.prepare(null,()=>({payload:local,dirty:true}),v=>{apply++;assert.equal(v.songs[1].id,'latest');});
 assert.equal(apply,1);assert.equal(c.state().baseline.revision,'0');
 const g=fixture();await assert.rejects(g.client.prepare(g.server.row,()=>({payload:payload(),dirty:false}),()=>{throw Error('local write failed');}));
 assert.equal(g.client.state().baseline,null);
});
test('a failed local acknowledgement retains the same request for receipt recovery',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());
 const c=f.create({onAck:()=>{throw Error('local quota');}});
 await assert.rejects(c.write(f.server.row,payload()),/local quota/);assert.ok(c.state().pending);assert.equal(f.server.commits,1);
 await f.client.recover();assert.equal(f.server.commits,1);assert.equal(f.client.state().pending,null);
});
test('interleaved tabs never replace an in-flight durable request',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());let release;f.server.wait=new Promise(r=>release=r);
 const first=f.client.write(f.server.row,payload());await new Promise(r=>setTimeout(r,0));const pending=f.client.state().pending;
 await assert.rejects(f.create().write(f.server.row,payload()),/locked/);assert.equal(f.client.state().pending.id,pending.id);release();await first;
});
test('bigint versions remain text and unsafe numeric versions are rejected',()=>{
 assert.equal(P.version({revision:'9007199254740993',generation:G}).revision,'9007199254740993');
 assert.throws(()=>P.version({revision:9007199254740993,generation:G}));assert.throws(()=>P.version({revision:'9223372036854775808',generation:G}));
});
test('corrupt receipts and oversized journals do not send or delete any record',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());f.store.setItem(f.store.keys()[0],'broken');
 await assert.rejects(f.client.recover(),e=>e.code==='corrupt');assert.equal(f.server.calls.length,0);
 const g=fixture();await g.client.observe(g.server.row,payload());const c=g.create({maxBytes:100});
 await assert.rejects(c.write(g.server.row,payload()),e=>e.code==='storage');assert.equal(g.server.commits,0);
});
const token=(owner=U,session=S,role='authenticated')=>'test.'+Buffer.from(JSON.stringify({sub:owner,session_id:session,role})).toString('base64url')+'.signature';
function wire(overrides={}){
 let owner=U,session=S;const calls=[];
 const transport=P.createTransport({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',getOwner:()=>owner,getSessionId:()=>session,getCredentials:async()=>token(owner,session),
 fetch:async(url,init)=>{calls.push({url,init});return Response.json(url.includes('/rpc/')?{status:'saved',revision:'2',generation:G}:[{user_id:U,payload:payload(),revision:'9007199254740993',generation:G,updated_at:'2026-11-10T00:00:00Z'}]);},...overrides});
 return {...transport,calls,change:(u,s)=>{owner=u;session=s;}};
}
test('transport uses registered-session headers, exact bigint projection and no owner parameter in RPC',async()=>{
 const w=wire(),row=await w.read();assert.equal(row.revision,'9007199254740993');
 assert.ok(new URL(w.calls[0].url).searchParams.get('select').includes('revision:revision::text'));
 await w.send({p_expected_revision:row.revision,p_expected_generation:G,p_payload:payload(),p_request_id:crypto.randomUUID()});
 assert.equal(w.calls[1].init.headers['X-Client-Info'],'vocalzip-device-session-v2');assert.equal(w.calls[1].init.credentials,'omit');
 const body=JSON.parse(w.calls[1].init.body);assert.equal(body.p_expected_revision,'9007199254740993');assert.equal(Object.keys(body).length,4);
});
test('foreign JWT or row, privileged keys and extra RPC parameters are rejected',async()=>{
 for(const jwt of [token(V),token(U,T),token(U,S,'service_role')]){
  const w=wire({getCredentials:async()=>jwt});await assert.rejects(w.read());assert.equal(w.calls.length,0);
 }
 await assert.rejects(wire({fetch:async()=>Response.json([{user_id:V}])}).read(),e=>e.code==='response');
 await assert.rejects(wire().send({p_owner:U}),e=>e.code==='response');
 assert.throws(()=>wire({publishableKey:'sb_secret_private'}));assert.throws(()=>wire({projectUrl:'http://example.test'}));
});
test('identity change while acquiring credentials sends nothing and HTTP failure stays explicit',async()=>{
 let w;w=wire({getCredentials:async()=>{w.change(V,T);return token();}});
 await assert.rejects(w.read(),e=>e.code==='identity');assert.equal(w.calls.length,0);
 await assert.rejects(wire({fetch:async()=>Response.json({},{status:403})}).read(),e=>e.code==='auth');
 await assert.rejects(wire({fetch:async()=>Response.json({},{status:404})}).read(),e=>e.code==='unavailable');
});

test('explicit lesson deletion scrubs pending text, rotates the request ID and keeps unrelated edits',async()=>{
 const Merge=require('../data-merge.js'),f=fixture();
 const c=f.create({redact:(data,ids)=>{for(const id of ids)Merge.deleteLesson(data,id);return data;}});
 await c.observe(f.server.row,payload());const edited=payload();edited.lessons.push({id:'private',feedback:'erase this private text'});
 edited.practices.push({id:'keep',manualMinutes:12});f.server.lost=true;
 await assert.rejects(c.write(f.server.row,edited));const original=c.state().pending.id;
 let applied=false;await c.redactLessons(['private'],()=>{applied=true;});
 const s=c.state();assert.equal(applied,true);assert.notEqual(s.pending.id,original);assert.equal(s.pending.retiredRequestId,original);
 assert.ok(!JSON.stringify(s).includes('erase this private text'));assert.equal(s.pending.payload.practices[0].manualMinutes,12);
 assert.ok(s.pending.payload.deleted.lessons.includes('private'));
 const calls=f.server.calls.length;await assert.rejects(c.recover(),e=>e.code==='deleted');assert.equal(f.server.calls.length,calls);
});
test('a stale prepared payload is sanitized under the write lock before it can enter a journal',async()=>{
 const Merge=require('../data-merge.js'),f=fixture(),c=f.create({deletedIds:()=>['gone'],redact:(data,ids)=>{for(const id of ids)Merge.deleteLesson(data,id);return data;}});
 await c.observe(f.server.row,payload());const value=payload();value.lessons=[{id:'gone',memo:'never keep this'}];
 await assert.rejects(c.write(f.server.row,value),e=>e.code==='deleted');assert.equal(f.server.calls.length,0);
 assert.ok(!JSON.stringify(c.state()).includes('never keep this'));assert.equal(c.state().pending.payload.lessons.length,0);
});

test('pending media links are scrubbed without removing notes, practice time or unselected files',async()=>{
 const Merge=require('../data-merge.js'),f=fixture(),client=f.create({deletedMediaIds:()=>[],redactMedia:(data,ids)=>{ids.forEach(id=>Merge.deleteMedia(data,id));return data;}});
 await client.observe(f.server.row,payload());const value=payload();value.lessons=[{id:'lesson',memo:'keep unsent notes',recordings:[{id:'chosen'},{id:'other'}]}];value.practices=[{id:'practice',manualMinutes:12,mediaIds:['chosen','other']}];f.server.lost=true;
 await assert.rejects(client.write(f.server.row,value));const before=client.state().pending.id;await client.redactMedia(['chosen']);
 const state=client.state();assert.notEqual(state.pending.id,before);assert.equal(state.pending.retiredRequestId,before);assert.equal(state.pending.payload.lessons[0].memo,'keep unsent notes');
 assert.deepEqual(state.pending.payload.lessons[0].recordings,[{id:'other'}]);assert.equal(state.pending.payload.practices[0].manualMinutes,12);assert.deepEqual(state.pending.payload.practices[0].mediaIds,['other']);
 const calls=f.server.calls.length;await assert.rejects(client.recover(),e=>e.code==='deleted');assert.equal(f.server.calls.length,calls);
});
test('media-delete purpose is durable but never added to the snapshot RPC arguments',async()=>{
 const f=fixture();await f.client.observe(f.server.row,payload());const context={kind:'media-delete',id:'chosen',stamp:'a'.repeat(64)};f.server.lost=true;
 await assert.rejects(f.client.write(f.server.row,payload(),context));context.id='other';assert.equal(f.client.state().pending.context.id,'chosen');
 await f.create().recover();assert.deepEqual(Object.keys(f.server.calls[0]).sort(),['p_expected_generation','p_expected_revision','p_payload','p_request_id']);assert.deepEqual(f.server.calls[0],f.server.calls[1]);
});
