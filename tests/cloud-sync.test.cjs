// Exercise the complete shipped script through its public controls, with a deterministic
// PostgREST model. No source extraction, live credentials, DB writes or media objects.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('cloud-sync.js','utf8');
const mergeScript=fs.readFileSync('data-merge.js','utf8');
const KEY='vocal-zip_mvp_v1';
const base=(id)=>({categories:[],songs:id?[{id,title:id}]:[],lessons:[],assignments:[],practices:[]});
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
const storage=()=>{const m=new Map();return{
 getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),
 key:i=>[...m.keys()][i]??null,get length(){return m.size}
};};
const probes=[];
async function until(fn){for(let n=0;n<1000;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out waiting for sync: '+probes.slice(-2).map(probe=>probe()).join(' | '));}
class Server{
 constructor(row=null){this.owner='A';this.sid='s1';this.token='fake';this.row=copy(row);this.writes=[];this.reads=0;this.beforeWrite=null;this.afterRead=null;}
 client(){
  const server=this;
  return{
   auth:{getUser:async()=>({data:{user:{id:server.owner,email:'a@test.invalid'}}}),onAuthStateChange:()=>({}),getSession:async()=>({data:{session:{access_token:server.token}}})},
   rpc:async name=>({data:name==='vzip_register_session'?{status:'active',current_session:server.sid}:true,error:null}),
   from(table){
    const q={table,filters:{},method:'read',single:false},chain={};
    for(const m of ['select','order','range','in'])chain[m]=()=>chain;
    chain.eq=chain.is=(k,v)=>{q.filters[k]=v;return chain};
    chain.maybeSingle=()=>{q.single=true;return chain};
    for(const m of ['upsert','insert','update','delete'])chain[m]=(body,options)=>{Object.assign(q,{method:m,body,options});return chain};
    chain.then=(resolve,reject)=>server.run(q).then(resolve,reject);
    return chain;
   },storage:{from:()=>({})}
  };
 }
 async run(q){
  if(q.table!=='vocal_data')return{data:[],error:null};
  assert.equal(q.filters.user_id??q.body?.user_id,this.owner);
  if(q.method==='read'){
   this.reads++;const result=copy(this.row);
   await this.afterRead?.(result);
   return{data:result,error:null};
  }
  this.writes.push(copy(q));await this.beforeWrite?.(q);
  if(this.writeError)return{data:null,error:this.writeError};
  if(this.badResponse)return{data:null,error:null};
  if(q.method==='insert'||q.method==='upsert'){
   if(this.row&&q.options?.ignoreDuplicates)return{data:[],error:null};
   if(this.row&&q.method==='insert')return{data:null,error:{code:'23505',message:'duplicate'}};
   this.row=copy({payload:q.body.payload,updated_at:q.body.updated_at});
   return{data:[{user_id:'A'}],error:null};
  }
  if(q.method==='update'){
   if(!this.row||q.filters.updated_at!==this.row.updated_at)return{data:[],error:null};
   this.row=copy(q.body);return{data:[{user_id:'A'}],error:null};
  }
  throw Error('Unexpected operation '+q.method);
 }
}
function device(server,seed=base('local'),{clean=false,now=Date.now(),revision=false}={}){
 const listeners=new Map(),elements=new Map(),store=storage();
 const element=k=>{if(!elements.has(k))elements.set(k,{
  textContent:'',hidden:false,value:'',dataset:{},classList:{toggle(){},contains(){return false}},remove(){},appendChild(){},insertAdjacentHTML(){},
  querySelector:s=>element(s),querySelectorAll:()=>[]
 });return elements.get(k)};
 const on=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)};
 const window={localStorage:store,VZIP_DEVICE_SESSIONS_ENABLED:true,VZIP_SNAPSHOT_REVISION_ENABLED:revision,
  VzipAccountScope:{owner:server.owner,storage:store,mediaDb:()=> 'test-only',canImportLegacy:()=>false},
  supabase:{createClient:()=>server.client()},addEventListener:on,
  dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e)},
 };
 const document={querySelector:element,querySelectorAll:()=>[],getElementById:id=>element('#'+id),
  createElement:()=>({querySelector:element,querySelectorAll:()=>[],dataset:{},appendChild(){}}),
  head:{appendChild(){}},body:{appendChild(){},classList:{toggle(){}}},addEventListener:on};
 class FixedDate extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 if(seed)store.setItem(KEY,JSON.stringify(seed));
 if(!clean)store.setItem('vzip_account_dirty','1');
 const context=vm.createContext({...window,window,document,localStorage:store,Date:FixedDate,
  navigator:{userAgent:'test',maxTouchPoints:0,locks:{request:async(name,options,work)=>work({})}},matchMedia:()=>({matches:false}),location:{href:'https://test.invalid/',reload(){},origin:'https://test.invalid',pathname:'/'},
  URL,TextEncoder,AbortController,atob,fetch:server.fetch?server.fetch.bind(server):async()=>{throw Error('Unexpected REST transport');},structuredClone,crypto:require('node:crypto').webcrypto,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
  Event:class{constructor(type){this.type=type}},setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,10)),clearTimeout,setInterval(){},
 });
 vm.runInContext(mergeScript,context);window.VzipDataMerge=context.VzipDataMerge;
 vm.runInContext(fs.readFileSync('sync/snapshot-transport.js','utf8'),context);window.VzipSnapshotTransport=context.VzipSnapshotTransport;
 vm.runInContext(script,context);
 probes.push(()=>element('#cloud-status').textContent);
 return{store,window,status:()=>element('#cloud-status').textContent,
  sync:()=>element('#cloud-upload').onclick(),
  data:()=>JSON.parse(store.getItem(KEY)),
  saved:()=>store.getItem('vzip_cloud_linked_user')===server.owner&&!store.getItem('vzip_account_dirty')};
}
test('two empty-account first saves preserve both records and use DO NOTHING',async()=>{
 const s=new Server();let reads=0,release;const gate=new Promise(r=>release=r);
 s.afterRead=async row=>{if(row===null&&++reads<=2){if(reads===2)release();await gate}};
 const a=device(s,base('phone')),b=device(s,base('tablet'));
 await until(()=>a.saved()&&b.saved());
 assert.deepEqual(s.row.payload.songs.map(x=>x.id).sort(),['phone','tablet']);
 assert.ok(s.writes.filter(x=>x.method==='upsert').every(x=>x.options.ignoreDuplicates===true&&x.options.onConflict==='user_id'));
 assert.ok(s.writes.some(x=>x.method==='update'));
 // Pulling again also converges the device that won the first insert.
 await a.sync();await b.sync();
 assert.deepEqual(a.data().songs.map(x=>x.id).sort(),['phone','tablet']);
 assert.deepEqual(b.data().songs.map(x=>x.id).sort(),['phone','tablet']);
});
test('first-save conflict rereads and preserves a concurrent deletion tombstone',async()=>{
 const s=new Server();let once=true;
 s.beforeWrite=async()=>{if(once){once=false;s.row={payload:{...base('remote'),deleted:{songs:['local']}},updated_at:'2026-11-07T12:00:00Z'}}};
 const d=device(s);await until(()=>d.saved());
 assert.deepEqual(s.row.payload.songs.map(x=>x.id),['remote']);
 assert.deepEqual(s.row.payload.deleted.songs,['local']);
});
test('existing-row CAS retries and merges a concurrent different-record edit',async()=>{
 const s=new Server({payload:base('cloud'),updated_at:'2026-11-07T00:00:00Z'});let once=true;
 s.beforeWrite=async()=>{if(once){once=false;s.row={payload:{...s.row.payload,lessons:[{id:'other',memo:'keep'}]},updated_at:'2026-11-07T00:00:01Z'}}};
 const d=device(s);await until(()=>d.saved());
 assert.equal(s.row.payload.lessons[0].memo,'keep');
 assert.deepEqual(s.row.payload.songs.map(x=>x.id).sort(),['cloud','local']);
 assert.equal(s.writes.length,2);
});
for(const at of ['2099-01-01T00:00:00.000Z','2026-11-07T00:00:00.000Z',null]){
 test('CAS version advances beyond the read token with a stalled/behind clock: '+at,async()=>{
  const s=new Server({payload:base('remote'),updated_at:at});
  const d=device(s,base('local'),{now:Date.parse('2026-11-07T00:00:00.000Z')});await until(()=>d.saved());
  assert.ok(Date.parse(s.row.updated_at)> (Date.parse(at)||0));
  assert.notEqual(s.row.updated_at,at);
 });
}
test('a local edit during the write stays dirty and is sent by the next sync',async()=>{
 const s=new Server({payload:base('remote'),updated_at:'2026-11-01T00:00:00Z'});
 let release,started=false;const gate=new Promise(r=>release=r);
 s.beforeWrite=async()=>{started=true;await gate};
 const d=device(s);await until(()=>started);
 const local=d.data();local.lessons.push({id:'during-flight',memo:'keep pending'});
 d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');release();
 await until(()=>d.status().startsWith('✓'));
 assert.equal(d.store.getItem('vzip_account_dirty'),'1');
 assert.ok(!s.row.payload.lessons.length);
 s.beforeWrite=null;await d.sync();assert.ok(d.saved());assert.equal(s.row.payload.lessons[0].id,'during-flight');
});
test('retry exhaustion keeps local data, dirty status and does not claim saved',async()=>{
 const s=new Server({payload:base('remote'),updated_at:'2026-11-01T00:00:00Z'});
 let revision=0;s.beforeWrite=async()=>{s.row.updated_at='2099-01-01T00:00:0'+(++revision)+'Z'};
 const d=device(s);await until(()=>d.status().startsWith('동기화 실패'));
 assert.equal(s.writes.length,5);assert.equal(d.store.getItem('vzip_account_dirty'),'1');
 assert.equal(d.store.getItem('vzip_cloud_linked_user'),null);
 assert.ok(d.data().songs.some(x=>x.id==='local'));
});
test('retry exhaustion for competing creates never overwrites the winner',async()=>{
 const remote={payload:base('winner'),updated_at:'2026-11-07T00:00:00Z'},s=new Server();
 s.afterRead=async()=>{s.row=copy(remote)};
 // Simulate read visibility lag: each read reports no row but the unique constraint sees it.
 const run=s.run.bind(s);s.run=q=>q.method==='read'&&q.table==='vocal_data'?(s.row=copy(remote),Promise.resolve({data:null,error:null})):run(q);
 const d=device(s);await until(()=>d.status().startsWith('동기화 실패'));
 assert.equal(s.writes.length,5);assert.deepEqual(s.row,remote);
 assert.equal(d.store.getItem('vzip_account_dirty'),'1');
});
for(const payload of [null,{songs:[]},{...base(),lessons:'broken'}]){
 test('malformed remote payload fails closed before any local rewrite or write: '+JSON.stringify(payload),async()=>{
  const s=new Server({payload,updated_at:'2026-11-07T00:00:00Z'}),seed=base('original'),d=device(s,seed);
  await until(()=>d.status().startsWith('동기화 실패'));
  assert.deepEqual(d.data(),seed);assert.equal(s.writes.length,0);
  assert.equal(d.store.getItem('vzip_account_dirty'),'1');
 });
}
test('write denial retains pending local records',async()=>{
 const s=new Server();s.writeError={message:'session revoked',code:'42501'};
 const d=device(s);await until(()=>d.status().startsWith('동기화 실패'));
 assert.equal(d.data().songs[0].id,'local');assert.equal(d.store.getItem('vzip_account_dirty'),'1');
 assert.equal(s.row,null);
});
test('missing write representation is never reported as a successful save',async()=>{
 const s=new Server();s.badResponse=true;const d=device(s);
 await until(()=>d.status().startsWith('동기화 실패'));
 assert.equal(d.store.getItem('vzip_cloud_linked_user'),null);assert.equal(d.store.getItem('vzip_account_dirty'),'1');
});
test('a clean device adopts authoritative cloud data without sending stale local records',async()=>{
 const s=new Server({payload:base('remote'),updated_at:'2026-11-07T00:00:00Z'});
 const d=device(s,base('stale'),{clean:true});await until(()=>d.saved());
 assert.deepEqual(d.data(),base('remote'));assert.equal(s.writes.length,0);
 assert.ok([...Array(d.store.length)].map((_,i)=>d.store.key(i)).some(k=>k.startsWith('vzip_before_cloud_')));
});
test('an empty new device loads existing cloud records without writes',async()=>{
 const s=new Server({payload:base('remote'),updated_at:'2026-11-07T00:00:00Z'}),d=device(s,null,{clean:true});
 await until(()=>d.saved());assert.deepEqual(d.data(),base('remote'));assert.equal(s.writes.length,0);
});

const UID='11111111-1111-4111-8111-111111111111',SID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',GEN='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
class RevisionServer extends Server{
 constructor(payload=base('cloud')){
  super({payload,updated_at:'2026-11-10T00:00:00.000001Z',revision:'1',generation:GEN});
  this.owner=UID;this.sid=SID;this.token='test.'+Buffer.from(JSON.stringify({sub:UID,session_id:SID,role:'authenticated'})).toString('base64url')+'.signature';this.receipts=new Map();this.rpcCalls=[];this.commits=0;
 }
 async fetch(url,init){
  const parsed=new URL(url);assert.equal(init.headers['X-Client-Info'],'vocalzip-device-session-v2');
  if(init.method==='GET'){
   assert.equal(parsed.searchParams.get('user_id'),'eq.'+UID);assert.ok(parsed.searchParams.get('select').includes('revision:revision::text'));
   return Response.json(this.row?[{...copy(this.row),user_id:UID}]:[]);
  }
  assert.equal(parsed.pathname,'/rest/v1/rpc/vzip_save_snapshot');
  const q=JSON.parse(init.body);this.rpcCalls.push(copy(q));await this.beforeRpc?.(q);
  if(this.reject)return Response.json({},{status:403});
  let receipt=this.receipts.get(q.p_request_id);
  if(!receipt){
   if(q.p_expected_revision!==(this.row?.revision||'0')||q.p_expected_generation!==(this.row?.generation||null))
    return Response.json({status:'conflict',revision:this.row?.revision||'0',generation:this.row?.generation||null,exists:!!this.row});
   this.commits++;this.row={payload:copy(q.p_payload),updated_at:'2026-11-10T00:00:01.000001Z',revision:String(BigInt(this.row?.revision||'0')+1n),generation:this.row?.generation||GEN};
   if(this.normalize)this.row.payload=this.normalize(this.row.payload);
   receipt={status:'saved',revision:this.row.revision,generation:this.row.generation,updated_at:this.row.updated_at};this.receipts.set(q.p_request_id,receipt);
   await this.afterRpc?.();
   if(this.loseReply){this.loseReply=false;throw TypeError('response lost');}
  }
  return Response.json(receipt);
 }
}
test('revision bridge replays a lost reply through the shipped sync controls with no legacy write',async()=>{
 const s=new RevisionServer(),d=device(s,base('cloud'),{clean:true,revision:true});await until(()=>d.saved());
 const local=d.data();local.songs.push({id:'phone',title:'phone'});d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');s.loseReply=true;
 await d.sync();assert.match(d.status(),/실패/);const journal=()=>JSON.parse(d.store.getItem('vzip_snapshot_transport_v1:'+UID));
 assert.ok(journal().pending);assert.equal(s.commits,1);
 await d.sync();await until(()=>d.saved());assert.equal(s.commits,1);assert.equal(s.rpcCalls.length,2);assert.deepEqual(s.rpcCalls[0],s.rpcCalls[1]);assert.equal(journal().pending,null);assert.equal(s.writes.length,0);
});
test('revision bridge stops concurrent writes before merging away the local edit',async()=>{
 const s=new RevisionServer(),d=device(s,base('cloud'),{clean:true,revision:true});await until(()=>d.saved());
 const local=d.data();local.songs[0].title='private phone edit';d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');
 s.row.payload.songs[0].title='tablet edit';s.row.revision='2';
 await d.sync();assert.match(d.status(),/실패/);assert.equal(d.data().songs[0].title,'private phone edit');assert.equal(s.row.payload.songs[0].title,'tablet edit');assert.equal(s.commits,0);assert.equal(s.writes.length,0);
});
test('revision bridge retains edits made during acknowledgement for a later RPC',async()=>{
 const s=new RevisionServer(),d=device(s,base('cloud'),{clean:true,revision:true});await until(()=>d.saved());
 const local=d.data();local.songs.push({id:'first'});d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');
 let once=true;s.afterRpc=async()=>{if(once){once=false;const value=d.data();value.songs.push({id:'late'});d.store.setItem(KEY,JSON.stringify(value));d.store.setItem('vzip_account_dirty','1');}};
 await d.sync();await until(()=>d.saved()&&s.row.payload.songs.some(v=>v.id==='late'));
 assert.ok(s.row.payload.songs.some(v=>v.id==='first'));assert.equal(s.writes.length,0);assert.equal(s.commits,2);
});
test('a paused revision contract never downgrades its existing state to direct writes',async()=>{
 const s=new RevisionServer(),d=device(s,base('cloud'),{clean:true,revision:true});await until(()=>d.saved());
 d.window.VZIP_SNAPSHOT_REVISION_ENABLED=false;const local=d.data();local.songs.push({id:'offline'});d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');
 await d.sync();assert.match(d.status(),/일시 중지/);assert.equal(s.writes.length,0);assert.equal(s.commits,0);assert.ok(d.data().songs.some(x=>x.id==='offline'));
});

test('revision bridge compares the owner-scoped payload without resending excluded archive entries',async()=>{
 const seed={...base('cloud'),deleted:{}},s=new RevisionServer(seed),d=device(s,seed,{clean:true,revision:true});await until(()=>d.saved());
 d.window.VzipArchive={forOwner:(value,owner)=>{assert.equal(owner,UID);const own=copy(value);delete own.excludedArchive;return own;}};
 const local=d.data();local.excludedArchive=[{id:'other-owner-private-entry'}];d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');
 await d.sync();assert.ok(d.saved());assert.equal(s.commits,0);assert.equal(s.rpcCalls.length,0);assert.equal(s.writes.length,0);
 assert.equal(d.data().excludedArchive[0].id,'other-owner-private-entry');assert.equal(s.row.payload.excludedArchive,undefined);
});

const mediaSeed=()=>({...base('cloud'),deleted:{},lessons:[{id:'lesson',memo:'keep notes',recordings:[{id:'chosen'},{id:'other'}]}],practices:[{id:'practice',manualMinutes:12,mediaIds:['chosen','other']}]});
class MediaRevisionServer extends RevisionServer{
 constructor(){super(mediaSeed());this.media=new Map([['chosen',{metadata:{id:'chosen',storageProvider:'r2',r2Key:'u/'+UID+'/chosen/original.wav',review:'keep current review'},updated_at:'2026-11-10T00:00:00Z'}]]);this.events=[];this.objects=new Set(['chosen','other']);this.mediaReads=0;}
 async run(q){
  if(q.table==='vocal_media'){
   assert.equal(q.filters.user_id,UID);
   if(q.method==='read'){if(q.single){this.mediaReads++;await this.onMediaRead?.();return {data:copy(this.media.get(q.filters.id)||null),error:null};}return {data:[...this.media].map(([id,row])=>({id,...copy(row)})),error:null};}
   assert.equal(q.method,'delete');const row=this.media.get(q.filters.id);
   if(row&&q.filters.updated_at===row.updated_at){this.media.delete(q.filters.id);this.events.push('metadata');return {data:[{id:q.filters.id}],error:null};}
   return {data:[],error:null};
  }
  if(q.table==='vocal_song_texts'){this.events.push('texts');if(this.failText){this.failText=false;return {data:null,error:Error('text cleanup failed')};}return {data:[],error:null};}
  if(q.table==='vocal_data'&&q.method!=='read')this.events.push('legacy-root');
  return super.run(q);
 }
}
async function mediaDevice({revision=true}={}){
 const s=new MediaRevisionServer(),d=device(s,mediaSeed(),{clean:true,revision});await until(()=>d.saved());
 d.window.VzipR2={remove:async key=>{
  assert.equal(key,'u/'+UID+'/chosen/original.wav');
  if(revision)assert.ok(s.row.payload.deleted.media.includes('chosen'));
  s.events.push('bytes');s.objects.delete('chosen');await s.onBytes?.();
 }};
 return {s,d};
}
test('revision media delete confirms snapshot first and never uses direct root writes',async()=>{
 const {s,d}=await mediaDevice();await d.window.vzipCloudMediaDelete({id:'chosen'});
 assert.deepEqual(s.events,['bytes','texts','metadata']);assert.equal(s.writes.length,0);assert.equal(s.commits,1);
 assert.deepEqual(s.row.payload.lessons[0].recordings,[{id:'other'}]);assert.equal(s.row.payload.lessons[0].memo,'keep notes');assert.equal(s.row.payload.practices[0].manualMinutes,12);
 assert.ok(s.objects.has('other'));assert.equal(d.window.vzipPendingMediaDeletes()[0].phase,'cloud-complete');
 await d.window.vzipMediaDeleteAcknowledge('chosen');assert.deepEqual(copy(d.window.vzipPendingMediaDeletes()),[]);
});
test('lost snapshot delete acknowledgement preserves bytes and replays the exact request',async()=>{
 const {s,d}=await mediaDevice();s.loseReply=true;await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}));
 assert.ok(s.objects.has('chosen'));assert.equal(s.events.length,0);
 const before=copy(s.rpcCalls[0]),journal=JSON.parse(d.store.getItem('vzip_snapshot_transport_v1:'+UID));
 assert.equal(journal.pending.context.kind,'media-delete');assert.equal(journal.pending.context.id,'chosen');
 await d.window.vzipCloudMediaDelete({id:'chosen'});assert.equal(s.commits,1);assert.deepEqual(s.rpcCalls[1],before);assert.ok(s.objects.has('other'));
});
test('a concurrent root edit prevents bytes from being erased',async()=>{
 const {s,d}=await mediaDevice();const local=d.data();local.lessons[0].memo='phone unsent';d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');
 s.row.payload.lessons[0].memo='tablet saved';s.row.revision='2';
 await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}));assert.equal(s.events.length,0);assert.equal(s.commits,0);
 assert.equal(d.data().lessons[0].memo,'phone unsent');assert.equal(s.row.payload.lessons[0].memo,'tablet saved');
});
test('metadata changed during the root RPC keeps both the original and current file information',async()=>{
 const {s,d}=await mediaDevice();s.afterRpc=()=>{s.media.get('chosen').metadata.review='new device memo';s.media.get('chosen').updated_at='2026-11-10T00:00:01Z';};
 await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}),e=>e.code==='mediaChanged');assert.equal(s.events.length,0);
 assert.ok(s.objects.has('chosen'));assert.equal(s.media.get('chosen').metadata.review,'new device memo');
});
test('cleanup can resume after a file was erased but later metadata work failed',async()=>{
 const {s,d}=await mediaDevice();s.failText=true;await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}),/text cleanup/);
 assert.ok(s.media.has('chosen'));assert.equal(d.window.vzipPendingMediaDeletes()[0].phase,'root-confirmed');
 await d.window.vzipCloudMediaDelete({id:'chosen'});await d.window.vzipMediaDeleteAcknowledge('chosen');
 assert.equal(s.commits,1);assert.ok(!s.media.has('chosen'));assert.ok(s.objects.has('other'));assert.deepEqual(copy(d.window.vzipPendingMediaDeletes()),[]);
});
test('a generic unresolved snapshot is never mistaken for a media deletion receipt',async()=>{
 const {s,d}=await mediaDevice();const local=d.data();local.songs.push({id:'unsent'});d.store.setItem(KEY,JSON.stringify(local));d.store.setItem('vzip_account_dirty','1');s.reject=true;
 await d.sync();const pending=JSON.parse(d.store.getItem('vzip_snapshot_transport_v1:'+UID)).pending;
 await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}),/이전 저장 요청/);assert.equal(s.events.length,0);
 assert.equal(JSON.parse(d.store.getItem('vzip_snapshot_transport_v1:'+UID)).pending.id,pending.id);assert.ok(d.data().songs.some(x=>x.id==='unsent'));
});
test('new-session delete resume and paused configuration both stop before touching media',async()=>{
 const {s,d}=await mediaDevice();s.loseReply=true;await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}));const reads=s.mediaReads;
 d.window.vzipCloudSessionId=()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}),e=>e.code==='session');assert.equal(s.mediaReads,reads);assert.equal(s.events.length,0);
 d.window.VZIP_SNAPSHOT_REVISION_ENABLED=false;await assert.rejects(async()=>d.window.vzipCloudMediaDelete({id:'chosen'}),/일시 중지/);assert.equal(s.events.length,0);
});
test('intent storage failure and foreign storage paths fail before snapshot or file changes',async()=>{
 const a=await mediaDevice(),save=a.d.store.setItem;
 a.d.store.setItem=(k,v)=>{if(k.startsWith('vzip_media_delete_v1:'))throw Error('quota');return save(k,v);};
 await assert.rejects(a.d.window.vzipCloudMediaDelete({id:'chosen'}),e=>e.code==='storage');assert.equal(a.s.events.length,0);assert.equal(a.s.commits,0);
 const b=await mediaDevice();b.s.media.get('chosen').metadata.r2Key='u/22222222-2222-4222-8222-222222222222/foreign/original.wav';
 await assert.rejects(b.d.window.vzipCloudMediaDelete({id:'chosen'}),/다른 계정/);assert.equal(b.s.events.length,0);assert.equal(b.s.commits,0);
});
test('the default-off legacy deletion path keeps its existing behavior',async()=>{
 const {s,d}=await mediaDevice({revision:false});await d.window.vzipCloudMediaDelete({id:'chosen'});
 assert.equal(s.events[0],'bytes');assert.ok(s.events.includes('legacy-root'));assert.equal(s.rpcCalls.length,0);assert.equal(s.writes.length,1);
 assert.ok(s.row.payload.deleted.media.includes('chosen'));assert.ok(s.objects.has('other'));
});

for(const raw of ['{"broken":',JSON.stringify({songs:[],lessons:'unreadable local input'})]){
 test('media deletion preserves malformed local input instead of replacing it: '+raw,async()=>{
  const {s,d}=await mediaDevice();d.store.setItem(KEY,raw);
  await assert.rejects(d.window.vzipCloudMediaDelete({id:'chosen'}),/기기 기록 형식/);
  assert.equal(d.store.getItem(KEY),raw);assert.equal(s.events.length,0);assert.equal(s.commits,0);assert.ok(s.objects.has('other'));
 });
}
