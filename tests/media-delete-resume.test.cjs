const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../sync/snapshot-transport.js'),Merge=require('../data-merge.js');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',T='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',G='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clone=x=>x==null?x:structuredClone(x);
const base=()=>({categories:[],songs:[{id:'song',title:'keep song',repertoire:{takeId:'chosen'}}],lessons:[{id:'lesson',memo:'keep lesson',recordings:[{id:'chosen'},{id:'other'}]}],assignments:[],practices:[{id:'practice',manualMinutes:12,mediaIds:['chosen','other']}]});
async function fixture({localStamp=false}={}){
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size}};
 const who={owner:U,session:T},server={row:{payload:base(),revision:'1',generation:G,updated_at:'2026-11-10T00:00:00Z'},metadata:{metadata:{id:'chosen',name:'chosen.wav',r2Key:'u/'+U+'/chosen/original.wav'},updated_at:'2026-11-10T00:00:00Z'},calls:[],receipts:new Map(),physical:0,localVersion:'first',events:[]};
 let local=base(),active=false;
 const k='vzip_media_delete_v1:'+U+':chosen';
 const stamp=await P.mediaStamp(server.metadata);storage.setItem(k,JSON.stringify({version:1,id:'chosen',owner:U,session:S,stamp,phase:'prepared',createdAt:1}));
 const snapOptions={storage,identity:()=>who,lock:async work=>work(),same:Merge.same,valid:Merge.valid,getLocal:()=>local,
  deletedIds:()=>local.deleted?.lessons||[],redact:(d,ids)=>{ids.forEach(id=>Merge.deleteLesson(d,id));return d;},deletedMediaIds:()=>local.deleted?.media||[],redactMedia:(d,ids)=>{ids.forEach(id=>Merge.deleteMedia(d,id));return d;},
  read:async()=>clone(server.row),send:async q=>{
   server.calls.push(clone(q));server.events.push('cas');await server.beforeSave?.(q);
   const found=server.receipts.get(q.p_request_id);if(found)return clone(found);
   const v=P.version(server.row);if(v.revision!==q.p_expected_revision||v.generation!==q.p_expected_generation)return {status:'conflict',...v};
   server.row={...server.row,payload:clone(q.p_payload),revision:String(BigInt(v.revision)+1n)};
   const result={status:'saved',...P.version(server.row)};server.receipts.set(q.p_request_id,result);
   if(server.lost){server.lost=false;throw Object.assign(Error('lost'),{code:'network'});}return result;
  },onAck:row=>{local=clone(row.payload);}};
 const snap=P.create(snapOptions);await snap.observe(server.row,local);
 const options={storage,identity:()=>who,lock:async work=>{if(active)throw Error('busy');active=true;try{return await work();}finally{active=false;}},
  read:async()=>{await server.beforeRead?.();return clone(server.metadata);},
  prepare:async()=>server.row,reviewRoot:context=>snap.reviewMediaRecovery(context),
  prepareResume:async({reviewId,payload,confirmed,retry})=>retry?snap.recover():snap.resolveRecovery(reviewId,payload,{confirmed}),
  cleanup:async(row,guard)=>{guard();assert.ok(server.row.payload.deleted.media.includes('chosen'));server.events.push('cleanup');if(row)server.physical++;await server.inCleanup?.();if(server.failCleanup)throw Error('cleanup failed');server.metadata=null;},
  ...(localStamp?{readLocalStamp:()=>P.localStamp(server.localVersion)}:{})};
 const create=extra=>P.createMediaDeletion({...options,...extra});
 return {who,server,storage,map,key:k,snap,create,client:create(),get local(){return local},set local(v){local=v},snapOptions};
}
const candidate=r=>[r.root.device,r.root.cloud?.payload,r.root.pending?.payload,...r.root.recoveries.flatMap(v=>[v.device,v.cloud?.payload,v.pending?.payload])].filter(Boolean).reduce((a,b)=>Merge.merge(a,b).data);
test('review is read-only and normal replay still refuses the previous login',async()=>{
 const f=await fixture(),raw=f.storage.getItem(f.key),before=clone(f.local);
 await assert.rejects(f.client.run('chosen'),e=>e.code==='session');const r=await f.client.review('chosen');
 assert.equal(f.storage.getItem(f.key),raw);assert.deepEqual(f.local,before);assert.equal(f.server.calls.length,0);assert.equal(f.server.physical,0);
 assert.equal(r.file.name,'chosen.wav');assert.ok(r.root.device.deleted.media.includes('chosen'));assert.equal(r.root.device.lessons[0].memo,'keep lesson');
});
test('explicit confirmation fences the old login then adopts only this file and clears links',async()=>{
 const f=await fixture(),r=await f.client.review('chosen');
 await assert.rejects(f.client.resume(r.reviewId,candidate(r)),e=>e.code==='review');assert.equal(f.server.calls.length,0);
 const result=await f.client.resume(r.reviewId,candidate(r),{confirmed:true});
 assert.deepEqual(f.server.events,['cas','cleanup']);assert.equal(f.server.physical,1);assert.equal(result.session,T);assert.equal(result.phase,'cloud-complete');
 assert.equal(f.snap.state().recoveries[0].mediaDelete.fromSession,S);assert.equal(result.proof.revision,'2');
 assert.equal(f.local.lessons[0].memo,'keep lesson');assert.deepEqual(f.local.lessons[0].recordings,[{id:'other'}]);assert.equal(f.local.practices[0].manualMinutes,12);assert.deepEqual(f.local.practices[0].mediaIds,['other']);
 await f.client.acknowledge('chosen');assert.equal(f.storage.getItem(f.key),null);
});
for(const change of ['cloud','intent','local','owner','session']){
 test('changed '+change+' after review prevents destructive cleanup',async()=>{
  const f=await fixture(),r=await f.client.review('chosen');
  if(change==='cloud')f.server.metadata.metadata.name='new upload';
  if(change==='intent'){const p=JSON.parse(f.storage.getItem(f.key));p.createdAt=2;f.storage.setItem(f.key,JSON.stringify(p));}
  if(change==='local')f.local.practices.push({id:'new local',manualMinutes:22});
  if(change==='owner')f.who.owner=V;if(change==='session')f.who.session=S;
  await assert.rejects(f.client.resume(r.reviewId,candidate(r),{confirmed:true}));assert.equal(f.server.physical,0);
 });
}
test('CAS conflict retains the old sidecar and both sets of notes',async()=>{
 const f=await fixture(),r=await f.client.review('chosen'),before=f.storage.getItem(f.key);
 f.server.beforeSave=()=>{f.server.row.revision='2';f.server.row.payload.lessons[0].memo='tablet note';};
 await assert.rejects(f.client.resume(r.reviewId,candidate(r),{confirmed:true}),e=>e.code==='conflict');
 assert.equal(f.storage.getItem(f.key),before);assert.equal(f.server.physical,0);assert.equal(f.server.row.payload.lessons[0].memo,'tablet note');
});
test('lost fresh ACK explicitly retries only the same current-session request before cleanup',async()=>{
 const f=await fixture(),r=await f.client.review('chosen');f.server.lost=true;
 await assert.rejects(f.client.resume(r.reviewId,candidate(r),{confirmed:true}),e=>e.code==='network');assert.equal(f.server.physical,0);assert.equal(JSON.parse(f.storage.getItem(f.key)).session,S);
 await f.client.resume(r.reviewId,candidate(r),{confirmed:true,retry:true});
 assert.equal(f.server.physical,1);assert.deepEqual(f.server.calls[0],f.server.calls[1]);assert.equal(f.server.receipts.size,1);
});
test('quota failure in root recovery leaves intent in the old login and sends nothing',async()=>{
 const f=await fixture(),r=await f.client.review('chosen'),old=f.storage.getItem(f.key);f.storage.setItem=()=>{throw Error('quota');};
 await assert.rejects(f.client.resume(r.reviewId,candidate(r),{confirmed:true}),e=>e.code==='storage');assert.equal(f.server.calls.length,0);assert.equal(f.server.physical,0);assert.equal(f.storage.getItem(f.key),old);
});
test('a local file version changed before or during the root CAS blocks physical cleanup',async()=>{
 for(const when of ['before','during']){
  const f=await fixture({localStamp:true}),r=await f.client.review('chosen');
  if(when==='before')f.server.localVersion='new bytes';else f.server.beforeSave=()=>{f.server.localVersion='new bytes';};
  await assert.rejects(f.client.resume(r.reviewId,candidate(r),{confirmed:true}),e=>e.code==='localChanged');assert.equal(f.server.physical,0);assert.equal(JSON.parse(f.storage.getItem(f.key)).session,S);
 }
});
test('a local version changed during cleanup remains pinned and cannot be deleted by automatic retry',async()=>{
 const f=await fixture({localStamp:true}),r=await f.client.review('chosen');f.server.inCleanup=()=>{f.server.localVersion='new bytes';};
 await f.client.resume(r.reviewId,candidate(r),{confirmed:true});assert.ok(f.client.list()[0].localStamp);
 const physical=f.server.physical;await assert.rejects(f.create().run('chosen'),e=>e.code==='localChanged');assert.equal(f.server.physical,physical);
});
test('completed cloud deletion cannot delete metadata which later reappeared',async()=>{
 const f=await fixture(),r=await f.client.review('chosen');await f.client.resume(r.reviewId,candidate(r),{confirmed:true});
 f.server.metadata={metadata:{id:'chosen',name:'restored.wav'},updated_at:'2026-11-10T00:00:00Z'};
 await assert.rejects(f.create().run('chosen'),e=>e.code==='mediaChanged');assert.equal(f.server.physical,1);
});
test('root recovery can preserve an unrelated ordinary pending while explicitly deleting this target',async()=>{
 const f=await fixture();const value=base();value.practices.push({id:'unsent',manualMinutes:21});f.server.lost=true;
 await assert.rejects(f.snap.write(f.server.row,value));f.who.session=S;
 // The pending belongs to a different login; a fresh bridge uses the current session.
 const current=P.create(f.snapOptions),client=f.create({reviewRoot:ctx=>current.reviewMediaRecovery(ctx),prepareResume:({reviewId,payload})=>current.resolveRecovery(reviewId,payload,{confirmed:true})});
 const r=await client.review('chosen');await client.resume(r.reviewId,candidate(r),{confirmed:true});
 assert.equal(f.server.row.payload.practices[1].manualMinutes,21);assert.equal(f.server.physical,1);
});
test('a pending deletion for another file is never appropriated by this recovery',async()=>{
 const f=await fixture(),value=base();f.server.lost=true;
 await assert.rejects(f.snap.write(f.server.row,value,{kind:'media-delete',id:'other',stamp:null}));
 await assert.rejects(f.client.review('chosen'),e=>e.code==='pending');assert.equal(f.server.physical,0);
});
