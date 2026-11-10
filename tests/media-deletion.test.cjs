const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../sync/snapshot-transport.js');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',T='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',G='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clone=x=>structuredClone(x);
function fixture(){
 const rows=new Map(),store={fail:false,getItem:k=>rows.get(k)??null,setItem(k,v){if(this.fail)throw Error('quota');rows.set(k,v);},removeItem:k=>rows.delete(k),key:i=>[...rows.keys()][i]??null,get length(){return rows.size;}};
 const who={owner:U,session:S},server={row:{metadata:{id:'chosen',r2Key:'u/'+U+'/chosen/original.wav',review:'private newest memo'},updated_at:'2026-11-10T00:00:00Z'},root:{categories:[],songs:[],lessons:[{id:'lesson',memo:'keep lesson',recordings:[{id:'chosen'},{id:'other'}]}],practices:[{id:'practice',manualMinutes:12,mediaIds:['chosen','other']}],assignments:[]},bytes:new Set(['chosen','other']),events:[],reads:0,writes:0,physical:0};
 let locked=false;
 const options={storage:store,identity:()=>who,lock:async work=>{if(locked)throw Error('busy');locked=true;try{return await work()}finally{locked=false;}},
  read:async()=>{server.reads++;await server.onRead?.();return clone(server.row);},
  prepare:async({id})=>{
   assert.ok(P.hasMediaDeletes(store,U));server.events.push('root');server.writes++;
   if(server.reject)throw Error('conflict');
   server.root.deleted={media:[id]};server.root.lessons[0].recordings=[{id:'other'}];server.root.practices[0].mediaIds=['other'];
   await server.afterPrepare?.();
   if(server.lost){server.lost=false;throw Error('response lost');}
   return {payload:clone(server.root),revision:'2',generation:G};
  },
  cleanup:async(row,guard,id)=>{
   assert.ok(server.root.deleted.media.includes(id));server.events.push('cleanup');guard();
   if(row){server.physical++;server.bytes.delete(id);}
   if(server.cleanupFailure){server.cleanupFailure=false;throw Error('metadata response lost');}
   server.row=null;await server.afterCleanup?.();guard();
  }};
 const create=extra=>P.createMediaDeletion({...options,...extra});return {store,rows,who,server,create,client:create()};
}
test('root confirmation precedes byte cleanup; local acknowledgement clears the intent',async()=>{
 const f=fixture();await f.client.run('chosen');
 assert.deepEqual(f.server.events,['root','cleanup']);assert.deepEqual([...f.server.bytes],['other']);
 assert.equal(f.client.list()[0].phase,'cloud-complete');assert.equal(f.server.root.lessons[0].memo,'keep lesson');assert.equal(f.server.root.practices[0].manualMinutes,12);
 assert.ok(!JSON.stringify([...f.rows]).includes('private newest memo'));
 await f.client.acknowledge('chosen');assert.deepEqual(f.client.list(),[]);assert.equal(P.hasMediaDeletes(f.store,U),false);
});
test('intent storage failure precedes snapshot write and object deletion',async()=>{
 const f=fixture();f.store.fail=true;await assert.rejects(f.client.run('chosen'),e=>e.code==='storage');
 assert.equal(f.server.writes,0);assert.equal(f.server.physical,0);assert.deepEqual([...f.server.bytes],['chosen','other']);
});
test('snapshot conflict retains intent and both file objects',async()=>{
 const f=fixture();f.server.reject=true;await assert.rejects(f.client.run('chosen'),/conflict/);
 assert.equal(f.client.list()[0].phase,'prepared');assert.equal(f.server.physical,0);assert.ok(f.server.bytes.has('other'));
 await assert.rejects(f.client.acknowledge('chosen'),e=>e.code==='pending');
});
test('lost root reply cannot delete bytes; same session can retry',async()=>{
 const f=fixture();f.server.lost=true;await assert.rejects(f.client.run('chosen'),/response lost/);
 assert.equal(f.server.physical,0);assert.equal(f.client.list()[0].phase,'prepared');
 await f.create().run('chosen');assert.equal(f.server.physical,1);assert.ok(f.server.bytes.has('other'));
});
test('metadata changed during root confirmation prevents destructive cleanup',async()=>{
 const f=fixture();f.server.afterPrepare=()=>{f.server.row.metadata.review='new device memo';};
 await assert.rejects(f.client.run('chosen'),e=>e.code==='mediaChanged');
 assert.equal(f.server.physical,0);assert.equal(f.server.row.metadata.review,'new device memo');assert.equal(f.client.list()[0].phase,'root-confirmed');
});
test('failed cleanup cannot later select a changed file',async()=>{
 const f=fixture();f.server.cleanupFailure=true;await assert.rejects(f.client.run('chosen'),/metadata response/);
 f.server.row.metadata.r2Key='u/'+U+'/chosen/new-original.wav';const attempts=f.server.physical;
 await assert.rejects(f.create().run('chosen'),e=>e.code==='mediaChanged');assert.equal(f.server.physical,attempts);assert.ok(f.server.bytes.has('other'));
});
test('failed local acknowledgement is resumable with missing cloud metadata',async()=>{
 const f=fixture();await f.client.run('chosen');f.store.removeItem=()=>{throw Error('disk failure');};
 await assert.rejects(f.client.acknowledge('chosen'),e=>e.code==='storage');assert.equal(f.client.list()[0].phase,'cloud-complete');
 f.store.removeItem=k=>f.rows.delete(k);await f.create().run('chosen');await f.client.acknowledge('chosen');assert.equal(f.server.physical,1);assert.deepEqual(f.client.list(),[]);
});
test('new login cannot resume or acknowledge an old session intent',async()=>{
 const f=fixture();f.server.reject=true;await assert.rejects(f.client.run('chosen'));f.who.session=T;const reads=f.server.reads,other=f.create();
 assert.equal(other.list()[0].session,S);await assert.rejects(other.run('chosen'),e=>e.code==='session');await assert.rejects(other.acknowledge('chosen'),e=>e.code==='session');
 assert.equal(f.server.reads,reads);assert.equal(f.server.physical,0);
});
test('account change after read stops before root mutation and byte deletion',async()=>{
 const f=fixture();f.server.onRead=()=>{f.who.owner=V;};await assert.rejects(f.client.run('chosen'),e=>e.code==='identity');assert.equal(f.server.writes,0);assert.equal(f.server.physical,0);
});
test('root reply without the selected tombstone cannot authorize deletion',async()=>{
 const f=fixture(),m=f.create({prepare:async()=>({payload:{deleted:{media:[]}},revision:'2',generation:G})});
 await assert.rejects(m.run('chosen'),e=>e.code==='response');assert.equal(f.server.physical,0);assert.equal(m.list()[0].phase,'prepared');
});
test('foreign intent is invisible and corrupt own intent fails before reading server',async()=>{
 const f=fixture();f.rows.set('vzip_media_delete_v1:'+V+':chosen','broken');assert.deepEqual(f.client.list(),[]);
 f.rows.set('vzip_media_delete_v1:'+U+':chosen','broken');await assert.rejects(f.client.run('chosen'),e=>e.code==='corrupt');assert.equal(f.server.reads,0);
});
test('metadata digest binds content/version and ignores JSON property order',async()=>{
 const a={metadata:{name:'voice',size:12},updated_at:'2026-11-10T00:00:00Z'},b={updated_at:a.updated_at,metadata:{size:12,name:'voice'}};
 assert.equal(await P.mediaStamp(a),await P.mediaStamp(b));b.metadata.size=13;assert.notEqual(await P.mediaStamp(a),await P.mediaStamp(b));
 await assert.rejects(P.mediaStamp({metadata:{},updated_at:'invalid'}),e=>e.code==='response');assert.equal(await P.mediaStamp(null),null);
});
