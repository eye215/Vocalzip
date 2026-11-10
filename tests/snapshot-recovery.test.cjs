// Disposable in-memory accounts only. Complete transport, no copied implementation snippets.
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../sync/snapshot-transport.js'),Merge=require('../data-merge.js');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',T='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',G='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const copy=x=>x==null?x:structuredClone(x);
const base=()=>({categories:[],songs:[{id:'song',title:'original'}],lessons:[],assignments:[],practices:[]});
function fixture(){
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size}};
 const who={owner:U,session:S};let local=base(),locked=false;
 const server={row:{payload:base(),revision:'1',generation:G,updated_at:'2026-11-10T00:00:00Z'},calls:[],receipts:new Map(),commits:0};
 const send=async q=>{
  server.calls.push({session:who.session,body:copy(q)});await server.before?.(q);
  const prior=server.receipts.get(q.p_request_id);
  if(prior){assert.equal(prior.session,who.session,'never replay an old session receipt');assert.deepEqual(prior.body,q);return copy(prior.response);}
  const current=P.version(server.row);
  if(q.p_expected_revision!==current.revision||q.p_expected_generation!==current.generation)return {status:'conflict',...current};
  server.commits++;
  server.row={payload:copy(q.p_payload),revision:String(BigInt(current.revision)+1n),generation:current.generation||G,updated_at:'2026-11-10T00:00:01Z'};
  const response={status:'saved',...P.version(server.row)};
  server.receipts.set(q.p_request_id,{session:who.session,body:copy(q),response});
  await server.after?.(q);
  if(server.lost){server.lost=false;throw Error('lost response');}
  return response;
 };
 const options={storage,identity:()=>who,read:async()=>{const row=copy(server.row);await server.readHook?.();return row;},send,
  lock:async fn=>{if(locked)throw Error('locked');locked=true;try{return await fn();}finally{locked=false;}},
  same:Merge.same,valid:Merge.valid,getLocal:()=>local,
  deletedIds:()=>local.deleted?.lessons||[],deletedMediaIds:()=>local.deleted?.media||[],
  redact:(data,ids)=>{ids.forEach(id=>Merge.deleteLesson(data,id));return data;},
  redactMedia:(data,ids)=>{ids.forEach(id=>Merge.deleteMedia(data,id));return data;},
  onAck:(row,payload,meta)=>{if(meta?.recovery)local=copy(row.payload);}
 };
 const create=extra=>P.create({...options,...extra});
 return {storage,map,who,server,options,create,client:create(),get local(){return local},set local(x){local=x}};
}
const confirm={confirmed:true};
const merged=r=>[r.device,r.pending?.payload,r.cloud?.payload,...r.recoveries.flatMap(x=>[x.device,x.cloud?.payload,x.pending?.payload])].filter(Boolean).reduce((a,b)=>Merge.merge(a,b).data);
async function pending(f,{committed=true}={}){
 await f.client.observe(f.server.row,f.local);
 const p=copy(f.local);p.lessons.push({id:'offline',memo:'unconfirmed lesson'});
 if(committed)f.server.lost=true;
 else f.server.before=async()=>{throw Error('offline');};
 await assert.rejects(f.client.write(f.server.row,p));f.server.before=null;
 return f.client.state().pending.id;
}
test('review performs no server write, local replacement or journal discard and returns independent copies',async()=>{
 const f=fixture();await pending(f);f.local.practices.push({id:'later',manualMinutes:8});
 const journal=[...f.map.values()][0],local=copy(f.local),calls=f.server.calls.length;
 const r=await f.client.reviewRecovery();
 assert.equal(r.pending.payload.lessons[0].id,'offline');assert.equal(r.device.practices[0].id,'later');
 r.device.songs[0].title='tampered returned view';r.pending.id=T;
 assert.deepEqual(f.local,local);assert.equal([...f.map.values()][0],journal);assert.equal(f.server.calls.length,calls);
 const fresh=await f.client.reviewRecovery();assert.equal(fresh.device.songs[0].title,'original');
});
test('previous-login lost ACK uses a fresh current-session request and preserves all unique records',async()=>{
 const f=fixture(),old=await pending(f);f.local.practices.push({id:'later',manualMinutes:12});f.who.session=T;
 const fresh=f.create(),r=await fresh.reviewRecovery();assert.equal(r.reason,'session');
 const saved=await fresh.resolveRecovery(r.reviewId,merged(r),confirm);
 assert.equal(saved.revision,'3');assert.equal(f.server.commits,2);
 assert.notEqual(f.server.calls[1].body.p_request_id,old);assert.equal(f.server.calls[1].session,T);
 assert.equal(fresh.state().pending,null);assert.equal(f.local.lessons[0].id,'offline');assert.equal(f.local.practices[0].manualMinutes,12);
 const archive=fresh.state().recoveries[0];assert.equal(archive.pending.session,S);assert.equal(archive.pending.id,old);
 assert.equal(archive.cloud.revision,'2');assert.equal(archive.device.practices[0].id,'later');
 assert.deepEqual(Object.keys(f.server.calls[1].body).sort(),['p_expected_generation','p_expected_revision','p_payload','p_request_id']);
});
test('even choosing unchanged cloud content writes a CAS fence and never silently clears an old pending',async()=>{
 const f=fixture();await pending(f,{committed:false});f.who.session=T;
 // The same-record value is explicitly selected from cloud; the unique pending lesson is retained.
 const c=f.create(),r=await c.reviewRecovery(),candidate=merged(r);candidate.songs=copy(r.cloud.payload.songs);
 await c.resolveRecovery(r.reviewId,candidate,confirm);
 assert.equal(f.server.commits,1);assert.equal(f.server.calls.at(-1).body.p_expected_revision,'1');
 assert.equal(f.server.row.payload.lessons[0].id,'offline');
 assert.equal(c.state().recoveries[0].pending.payload.lessons[0].memo,'unconfirmed lesson');
});
test('missing confirmation and missing unique records cannot discard either side',async()=>{
 const f=fixture();await pending(f,{committed:false});const r=await f.client.reviewRecovery(),calls=f.server.calls.length;
 await assert.rejects(f.client.resolveRecovery(r.reviewId,merged(r)),e=>e.code==='review');
 await assert.rejects(f.client.resolveRecovery(r.reviewId,r.cloud.payload,confirm),e=>e.code==='incomplete');
 const forged=merged(r);forged.deleted={lessons:['offline']};forged.lessons=[];
 await assert.rejects(f.client.resolveRecovery(r.reviewId,forged,confirm),e=>e.code==='incomplete');
 assert.equal(f.server.calls.length,calls);assert.ok(f.client.state().pending);
});
for(const change of ['device','server','journal','session','owner']){
 test('stale review refuses transmission after '+change+' changes',async()=>{
  const f=fixture();await pending(f);const r=await f.client.reviewRecovery(),calls=f.server.calls.length;
  if(change==='device')f.local.songs[0].title='new input';
  if(change==='server'){f.server.row.revision='3';f.server.row.payload.songs[0].title='tablet';}
  if(change==='journal'){const [k]=f.map.keys(),s=JSON.parse(f.map.get(k));s.conflict={revision:'2',generation:G,kind:'conflict'};f.map.set(k,JSON.stringify(s));}
  if(change==='session')f.who.session=T;if(change==='owner')f.who.owner=V;
  await assert.rejects(f.client.resolveRecovery(r.reviewId,merged(r),confirm),e=>['review','identity'].includes(e.code));
  assert.equal(f.server.calls.length,calls);
 });
}
test('server movement after revalidation returns CAS conflict while keeping all reviewed sources',async()=>{
 const f=fixture();await pending(f);const r=await f.client.reviewRecovery();
 f.server.before=async()=>{f.server.row.revision='3';f.server.row.payload.songs.push({id:'tablet',title:'keep tablet'});};
 await assert.rejects(f.client.resolveRecovery(r.reviewId,merged(r),confirm),e=>e.code==='conflict');
 const s=f.client.state();assert.equal(s.recoveries.length,1);assert.ok(s.pending);assert.equal(s.conflict.kind,'conflict');
 assert.ok(f.server.row.payload.songs.some(x=>x.id==='tablet'));assert.equal(f.server.commits,1);
});
test('a delayed old request wins first: selected cloud content is never blindly retried',async()=>{
 const f=fixture();await pending(f,{committed:false});const old=copy(f.client.state().pending);f.who.session=T;
 const c=f.create(),r=await c.reviewRecovery();
 f.server.before=async()=>{f.server.row={...f.server.row,revision:'2',payload:copy(old.payload)};};
 await assert.rejects(c.resolveRecovery(r.reviewId,merged(r),confirm),e=>e.code==='conflict');
 assert.equal(c.state().recoveries[0].pending.id,old.id);assert.equal(f.server.commits,0);
});
test('lost resolution response replays only the exact fresh request and applies only once',async()=>{
 const f=fixture();await pending(f);const r=await f.client.reviewRecovery();f.server.lost=true;
 await assert.rejects(f.client.resolveRecovery(r.reviewId,merged(r),confirm),/lost/);
 const saved=f.client.state().pending;assert.ok(saved.recoveryId);assert.equal(f.server.commits,2);
 const c=f.create();await c.recover();assert.equal(c.state().pending,null);assert.equal(f.server.commits,2);
 assert.deepEqual(f.server.calls.at(-1),f.server.calls.at(-2));
});
test('new local input during recovery stays intact and requires a new review including the prior choice',async()=>{
 const f=fixture();await pending(f);const r=await f.client.reviewRecovery();
 f.server.after=async()=>{f.local.practices.push({id:'during-save',manualMinutes:17});};
 await assert.rejects(f.client.resolveRecovery(r.reviewId,merged(r),confirm),e=>e.code==='localChanged');
 assert.equal(f.local.practices[0].manualMinutes,17);assert.ok(f.client.state().pending);assert.equal(f.client.state().recoveries.length,1);
 f.server.after=null;const again=await f.client.reviewRecovery();await f.client.resolveRecovery(again.reviewId,merged(again),confirm);
 assert.equal(f.local.lessons[0].id,'offline');assert.equal(f.local.practices[0].manualMinutes,17);assert.equal(f.client.state().recoveries.length,2);
});
test('an ACK apply failure retains the recovery request and sources for exact replay',async()=>{
 const f=fixture();await pending(f);const c=f.create({onAck:()=>{throw Error('local storage unavailable');}}),r=await c.reviewRecovery();
 await assert.rejects(c.resolveRecovery(r.reviewId,merged(r),confirm),/local storage/);assert.ok(c.state().pending);
 await f.create().recover();assert.equal(f.server.commits,2);assert.equal(f.client.state().pending,null);
});
test('quota failure before recovery persistence sends nothing and retains the old journal',async()=>{
 const f=fixture();await pending(f);const c=f.create({maxBytes:1500}),r=await c.reviewRecovery(),before=[...f.map.values()][0],calls=f.server.calls.length;
 await assert.rejects(c.resolveRecovery(r.reviewId,merged(r),confirm),e=>e.code==='storage');
 assert.equal([...f.map.values()][0],before);assert.equal(f.server.calls.length,calls);
});
test('snapshot generation replacement is not authorized by an ordinary recovery confirmation',async()=>{
 const f=fixture();await pending(f);f.server.row.generation=T;
 const r=await f.client.reviewRecovery(),calls=f.server.calls.length;
 await assert.rejects(f.client.resolveRecovery(r.reviewId,merged(r),confirm),e=>e.code==='generation');assert.equal(f.server.calls.length,calls);
});
test('media-delete pending and sidecar intent require their own recovery proof',async()=>{
 for(const kind of ['pending','sidecar']){
  const f=fixture();await f.client.observe(f.server.row,f.local);f.server.lost=true;
  await assert.rejects(f.client.write(f.server.row,f.local,kind==='pending'?{kind:'media-delete',id:'file',stamp:null}:null));
  if(kind==='sidecar')f.storage.setItem('vzip_media_delete_v1:'+U+':file','{}');
  const r=await f.client.reviewRecovery(),calls=f.server.calls.length;
  await assert.rejects(f.client.resolveRecovery(r.reviewId,merged(r),confirm),e=>e.code==='pending');assert.equal(f.server.calls.length,calls);
 }
});
test('deletion tombstones redact displayed, archived and selected lesson/file references',async()=>{
 const f=fixture();f.local.lessons=[{id:'gone',memo:'private deleted text',recordings:[{id:'file'}]},{id:'keep',memo:'keep notes',recordings:[{id:'file'},{id:'other'}]}];f.local.practices=[{id:'p',mediaIds:['file','other'],manualMinutes:9}];
 f.server.row.payload=copy(f.local);await pending(f);
 Merge.deleteLesson(f.local,'gone');Merge.deleteMedia(f.local,'file');
 const r=await f.client.reviewRecovery();assert.ok(!JSON.stringify(r).includes('private deleted text'));
 await f.client.resolveRecovery(r.reviewId,merged(r),confirm);
 assert.ok(!JSON.stringify(f.client.state()).includes('private deleted text'));
 assert.deepEqual(f.server.row.payload.lessons.find(x=>x.id==='keep').recordings,[{id:'other'}]);assert.equal(f.server.row.payload.practices[0].manualMinutes,9);
 // Direct deletion must also scrub every saved recovery source after the pending has cleared.
 await f.client.redactLessons(['keep'],()=>Merge.deleteLesson(f.local,'keep'));
 await f.client.redactMedia(['other'],()=>Merge.deleteMedia(f.local,'other'));
 assert.ok(!JSON.stringify(f.client.state().recoveries).includes('keep notes'));
 assert.ok(f.client.state().recoveries.every(a=>a.device.practices[0].mediaIds.length===0));
});
test('future id-based collections and explicit song tombstones are preserved',async()=>{
 const f=fixture();f.local.performances=[{id:'show',title:'archive'}];f.server.row.payload={...base(),deleted:{songs:['song']}};
 const r=await f.client.reviewRecovery(),p=merged(r);delete p.performances;
 await assert.rejects(f.client.resolveRecovery(r.reviewId,p,confirm),e=>e.code==='incomplete');
 await f.client.resolveRecovery(r.reviewId,merged(r),confirm);
 assert.equal(f.local.performances[0].id,'show');assert.equal(f.local.songs.length,0);assert.deepEqual(f.local.deleted.songs,['song']);
});
test('corrupt recovery sources stop before network send and reviews do not survive recreation',async()=>{
 const f=fixture();await pending(f);const r=await f.client.reviewRecovery();
 await assert.rejects(f.create().resolveRecovery(r.reviewId,merged(r),confirm),e=>e.code==='review');
 await f.client.resolveRecovery(r.reviewId,merged(r),confirm);
 const [key]=f.map.keys(),s=JSON.parse(f.map.get(key));s.recoveries[0].owner=V;f.map.set(key,JSON.stringify(s));
 assert.throws(()=>f.client.state(),e=>e.code==='corrupt');
});
test('recovery request ids cannot reuse a reviewed id or previous session request id',async()=>{
 const f=fixture(),old=await pending(f);
 const c=f.create({makeId:()=>old});await assert.rejects(c.reviewRecovery(),e=>e.code==='response');
 const r=await f.client.reviewRecovery();
 const bad=f.create({makeId:()=>r.reviewId});const review=await bad.reviewRecovery();
 await assert.rejects(bad.resolveRecovery(review.reviewId,merged(review),confirm),e=>e.code==='response');
});

test('duplicate selected ids are rejected rather than leaving an ambiguous replacement',async()=>{
 const f=fixture(),r=await f.client.reviewRecovery(),p=merged(r);p.songs.push(copy(p.songs[0]));
 await assert.rejects(f.client.resolveRecovery(r.reviewId,p,confirm),e=>e.code==='incomplete');assert.equal(f.server.calls.length,0);
});
test('current session may be revoked during send: the approved input remains durable and not acknowledged',async()=>{
 const f=fixture(),r=await f.client.reviewRecovery();
 const c=f.create({send:async()=>{throw Object.assign(Error('revoked'),{code:'auth'});}}),view=await c.reviewRecovery();
 await assert.rejects(c.resolveRecovery(view.reviewId,merged(view),confirm),e=>e.code==='auth');
 assert.ok(c.state().pending);assert.equal(c.state().recoveries.length,1);assert.deepEqual(f.local,base());
});
