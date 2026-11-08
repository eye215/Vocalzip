const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../media-upload-recovery.js');
const BASE={id:'take-1',name:'원래 이름',songId:'song-7',song:'원래 곡',recordedDate:'2026-10-05',dateSource:'metadata',durationSeconds:42,type:'audio/wav',size:4,storageProvider:'r2',r2Key:'u/alice/take-1/original.wav'};
const RECEIPT={key:BASE.r2Key,size:4,etag:'"original-etag"'};
function fixture(){
 const memory=new Map(),rows=new Map(),calls={loads:0,inserts:0,stats:0};
 let account={owner:'alice',session:'session-a'};
 const hooks={};
 const storage={get length(){return memory.size;},key:i=>[...memory.keys()][i]??null,getItem:k=>memory.get(k)??null,
  setItem:(k,v)=>{hooks.set?.(k,v);memory.set(k,v);},removeItem:k=>{hooks.remove?.(k);memory.delete(k);}};
 const options={storage,identity:()=>account,
  loadRow:async id=>{calls.loads++;await hooks.load?.(id);return rows.get(id)||null;},
  stat:async key=>{calls.stats++;return hooks.stat?hooks.stat(key):{size:4,etag:RECEIPT.etag};},
  deletedIds:async()=>hooks.deleted?hooks.deleted():[],
  insertRow:async(id,meta)=>{calls.inserts++;await hooks.insert?.(id,meta);if(!rows.has(id))rows.set(id,meta);await hooks.inserted?.(id,meta);}
 };
 const queue=create(options);
 return {memory,rows,calls,hooks,storage,options,queue,identity:value=>{account=value;},remember:()=>queue.remember(BASE,RECEIPT)};
}
test('a new instance recovers full metadata after reload without any file bytes',async()=>{
 const f=fixture();f.remember();
 const second=create(f.options),saved=await second.recover(BASE.id);
 assert.deepEqual(saved,{...BASE,r2Etag:RECEIPT.etag});
 assert.deepEqual(f.calls,{loads:2,inserts:1,stats:1});assert.equal(second.pending().length,0);
 assert.equal([...f.memory.values()].some(x=>x.includes('access_token')),false);
});
test('an already committed row keeps newer name, song, date and review',async()=>{
 const f=fixture();f.remember();const latest={...BASE,name:'다른 기기 이름',songId:'new-song',recordedDate:'2026-10-06',review:'새 메모'};
 f.rows.set(BASE.id,latest);
 assert.deepEqual(await f.queue.recover(BASE.id),latest);assert.equal(f.calls.inserts,0);
});
test('a racing insert wins; recovery never overwrites its edits',async()=>{
 const f=fixture();f.remember();
 f.hooks.insert=(id,meta)=>f.rows.set(id,{...meta,review:'동시에 저장한 메모'});
 const row=await f.queue.recover(BASE.id);assert.equal(row.review,'동시에 저장한 메모');assert.equal(f.queue.pending().length,0);
});
test('a racing different object is retained, with the receipt left pending',async()=>{
 const f=fixture();f.remember();
 f.hooks.insert=id=>f.rows.set(id,{...BASE,r2Key:'u/alice/other/original.wav'});
 await assert.rejects(f.queue.recover(BASE.id),{code:'conflict'});
 assert.equal(f.rows.get(BASE.id).r2Key,'u/alice/other/original.wav');assert.equal(f.queue.pending().length,1);
});
test('lost insert reply is confirmed by rereading and does not duplicate a row',async()=>{
 const f=fixture();f.remember();f.hooks.inserted=()=>{throw Error('reply lost');};
 const row=await f.queue.recover(BASE.id);assert.equal(row.id,BASE.id);assert.equal(f.rows.size,1);assert.equal(f.queue.pending().length,0);
});
test('failed confirmation keeps the receipt and next retry reads the existing row',async()=>{
 const f=fixture();f.remember();let reads=0;
 f.hooks.load=()=>{if(++reads===2)throw Error('offline during verification');};
 await assert.rejects(f.queue.recover(BASE.id),/offline/);assert.equal(f.queue.pending().length,1);assert.equal(f.rows.size,1);
 delete f.hooks.load;await f.queue.recover(BASE.id);assert.equal(f.calls.inserts,1);assert.equal(f.queue.pending().length,0);
});
test('failed library insert keeps metadata and receipt unchanged',async()=>{
 const f=fixture();f.remember();const raw=[...f.memory.values()][0];
 f.hooks.insert=()=>{throw Error('write unavailable');};
 await assert.rejects(f.queue.recover(BASE.id),/write unavailable/);
 assert.equal([...f.memory.values()][0],raw);assert.equal(f.rows.size,0);
});
for(const [name,head]of [['missing',null],['wrong size',{size:5,etag:RECEIPT.etag}],['same size but different bytes',{size:4,etag:'"replacement"'}]]){
 test(name+' object cannot be relinked',async()=>{
  const f=fixture();f.remember();f.hooks.stat=()=>head;
  await assert.rejects(f.queue.recover(BASE.id),{code:'object_changed'});assert.equal(f.calls.inserts,0);assert.equal(f.queue.pending().length,1);
 });
}
test('server deletion tombstone prevents recovery even when a matching row remains',async()=>{
 const f=fixture();f.remember();f.rows.set(BASE.id,BASE);f.hooks.deleted=()=>[BASE.id];
 await assert.rejects(f.queue.recover(BASE.id),{code:'deleted'});assert.equal(f.calls.loads,0);assert.equal(f.calls.inserts,0);assert.equal(f.queue.pending().length,1);
});
test('a deletion discovered after object check stops the insert',async()=>{
 const f=fixture();f.remember();let n=0;f.hooks.deleted=()=>++n>=2?[BASE.id]:[];
 await assert.rejects(f.queue.recover(BASE.id),{code:'deleted'});assert.equal(f.calls.inserts,0);assert.equal(f.queue.pending().length,1);
});
test('unreadable deletion list fails closed without inserting',async()=>{
 const f=fixture();f.remember();f.hooks.deleted=()=>null;
 await assert.rejects(f.queue.recover(BASE.id),{code:'deleted_unavailable'});assert.equal(f.calls.inserts,0);
});
test('an account switch while the library request waits blocks subsequent work',async()=>{
 const f=fixture();f.remember();const before=[...f.memory.values()][0];
 f.hooks.load=()=>f.identity({owner:'bob',session:'session-b'});
 await assert.rejects(f.queue.recover(BASE.id),{code:'identity'});assert.equal(f.calls.stats,0);assert.equal(f.calls.inserts,0);assert.equal([...f.memory.values()][0],before);
});
test('same account new login session during object check cannot finish the old recovery',async()=>{
 const f=fixture();f.remember();
 f.hooks.stat=()=>{f.identity({owner:'alice',session:'different-session'});return {size:4,etag:RECEIPT.etag};};
 await assert.rejects(f.queue.recover(BASE.id),{code:'identity'});assert.equal(f.calls.inserts,0);assert.equal(f.memory.size,1);
});
test('another account never sees or adopts the old account receipt',()=>{
 const f=fixture();f.remember();f.identity({owner:'bob',session:'session-b'});
 assert.deepEqual(create(f.options).pending(),[]);assert.equal(f.memory.size,1);
 assert.throws(()=>f.queue.pending(),{code:'identity'});
});
test('foreign owner keys and mismatched media IDs cannot create receipts',()=>{
 const f=fixture();
 for(const [meta,receipt]of [
  [{...BASE,r2Key:'u/bob/take-1/original.wav'},{...RECEIPT,key:'u/bob/take-1/original.wav'}],
  [{...BASE,r2Key:'u/alice/another/original.wav'},{...RECEIPT,key:'u/alice/another/original.wav'}]
 ])assert.throws(()=>f.queue.remember(meta,receipt),{code:'receipt'});
 assert.equal(f.memory.size,0);
});
for(const value of ['not-json',JSON.stringify({version:2}),JSON.stringify({version:1,owner:'bob'})]){
 test('corrupt or future receipt is preserved: '+value,()=>{
  const f=fixture(),key=f.queue.key+':bad';f.memory.set(key,value);
  assert.throws(()=>f.remember(),{code:'corrupt'});assert.equal(f.memory.get(key),value);assert.equal(f.memory.size,1);
 });
}
test('quota failure cannot discard an existing receipt',()=>{
 const f=fixture();f.remember();const old=[...f.memory.values()][0];
 f.hooks.set=()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});};
 const meta={...BASE,id:'take-2',r2Key:'u/alice/take-2/original.wav'};
 assert.throws(()=>f.queue.remember(meta,{...RECEIPT,key:meta.r2Key}),{name:'QuotaExceededError'});
 assert.equal(f.memory.size,1);assert.equal([...f.memory.values()][0],old);assert.equal(f.calls.inserts,0);
});
test('cleanup failure after confirmation still returns the row and keeps a retryable receipt',async()=>{
 const f=fixture();f.remember();f.hooks.remove=()=>{throw Error('storage blocked');};
 assert.equal((await f.queue.recover(BASE.id)).id,BASE.id);assert.equal(f.queue.pending().length,1);
 delete f.hooks.remove;await f.queue.recover(BASE.id);assert.equal(f.calls.inserts,1);assert.equal(f.queue.pending().length,0);
});
test('a second receipt with the same ID never replaces the first original',()=>{
 const f=fixture();f.remember();const raw=[...f.memory.values()][0];
 assert.throws(()=>f.queue.remember(BASE,{...RECEIPT,etag:'"different"'}),{code:'conflict'});
 assert.equal([...f.memory.values()][0],raw);
});
test('different media IDs use independent keys and acknowledgements preserve the other receipt',()=>{
 const f=fixture();f.remember();
 const meta={...BASE,id:'take-2',r2Key:'u/alice/take-2/original.wav'};
 f.queue.remember(meta,{...RECEIPT,key:meta.r2Key});assert.equal(f.memory.size,2);
 f.queue.acknowledge(BASE.id,{...BASE,r2Etag:RECEIPT.etag});
 assert.deepEqual(f.queue.pending().map(x=>x.id),['take-2']);
});
test('receipt byte capacity rejects oversized new metadata without pruning',()=>{
 const f=fixture();f.remember();const old=[...f.memory.values()][0];
 const meta={...BASE,id:'take-2',r2Key:'u/alice/take-2/original.wav',name:'x'.repeat(2*1024*1024)};
 assert.throws(()=>f.queue.remember(meta,{...RECEIPT,key:meta.r2Key}),{code:'capacity'});
 assert.equal(f.memory.size,1);assert.equal([...f.memory.values()][0],old);
});
test('invalid weak etags, unsafe sizes, traversal and metadata mismatch fail closed',()=>{
 const f=fixture();
 for(const receipt of [{...RECEIPT,etag:'W/"weak"'},{...RECEIPT,etag:'bad\r\n'},{...RECEIPT,size:Infinity},{...RECEIPT,size:5},{...RECEIPT,key:'u/alice/take-1/../other'}]){
  assert.throws(()=>f.queue.remember(BASE,receipt),{code:'receipt'});
 }
 assert.equal(f.memory.size,0);
});
test('missing receipt is a no-op and acknowledgement requires the matching original',async()=>{
 const f=fixture();assert.equal(await f.queue.recover('unknown'),null);assert.equal(f.calls.inserts,0);
 f.remember();assert.throws(()=>f.queue.acknowledge(BASE.id,{...BASE,r2Key:'u/alice/other/original.wav'}),{code:'conflict'});assert.equal(f.queue.pending().length,1);
});
