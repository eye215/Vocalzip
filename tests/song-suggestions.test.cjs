const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function edge(env={},user='alice'){
 let handler,calls=0;
 const code=fs.readFileSync('supabase/functions/vzip-song-stt/index.ts','utf8').replace(/^import .*;$/m,'');
 const context={Request,Response,Blob,File,FormData,Uint8Array,AbortSignal,console:{error(){}},
  Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},
  createClient:()=>({auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:null})}}),
  fetch:async()=>{calls++;return Response.json({text:''})}};
 vm.runInNewContext(stripTypeScriptTypes(code),context);
 return {call:handler,calls:()=>calls};
}
const enabled={STT_ENABLED:'true',OPENAI_API_KEY:'fake-test-key',STT_ALLOWED_USER_IDS:'alice'};
const request=(method='GET',body,headers={})=>new Request('https://example.test',{method,headers:{Authorization:'Bearer fake',...headers},body});
test('disabled, missing key, invalid user and missing allowlist never reach a paid API',async()=>{
 for(const [env,user,status] of [[{},'alice',503],[{...enabled,OPENAI_API_KEY:''},'alice',503],[enabled,null,401],[{...enabled,STT_ALLOWED_USER_IDS:''},'alice',403],[enabled,'bob',403]]){
  const e=edge(env,user);assert.equal((await e.call(request())).status,status);assert.equal(e.calls(),0);
 }
});
test('authorized readiness check is free; forbidden origin is rejected',async()=>{
 const e=edge(enabled);assert.equal((await e.call(request())).status,200);
 assert.equal((await e.call(request('GET',undefined,{Origin:'https://evil.test'}))).status,403);assert.equal(e.calls(),0);
});
test('body size is enforced without Content-Length before multipart parsing or API calls',async()=>{
 const e=edge(enabled);assert.equal((await e.call(request('POST',new Uint8Array(7*1024*1024+1)))).status,413);assert.equal(e.calls(),0);
});
test('null catalog entries do not discard valid songs',async()=>{
 const e=edge(enabled),form=new FormData();form.set('file',new File([new Uint8Array(512)],'clip.wav',{type:'audio/wav'}));
 form.set('songs',JSON.stringify([null,{id:'s1',title:'Song'}]));
 assert.equal((await e.call(request('POST',form))).status,200);assert.equal(e.calls(),1);
});

function browser(){
 let owner='alice',paid=0,excerpts=0;const events={},storage=new Map();
 const window={VZ:{media:{},route(){},db:{songs:[]},toast(){}},vzipCloudUserId:()=>owner,
  vzipCloudSignedIn:()=>true,vzipCloudAccessToken:async()=> 'fake',
  VzipR2:{clip:async()=>{excerpts++;throw Error('unexpected extraction')}},dispatchEvent(){},addEventListener:(n,f)=>events[n]=f};
 const element=()=>({style:{},setAttribute(){},append(){},add(){},replaceChildren(){},querySelector:()=>element(),querySelectorAll:()=>[]});
 const context={window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  AbortController,DOMException,FormData,File,Blob,Event,setTimeout,document:{createElement:element},Option:function(){},
  fetch:async()=>{paid++;return Response.json({error:'STT_DISABLED'},{status:503})}};
 const code=fs.readFileSync('app/song-suggestions.js','utf8').replace(/\}\)\(\);\s*$/,
  'window.test={stt,exclusive,state,cacheKey,analyze,setResult,readCache,apply,undo};})();');
 vm.runInNewContext(code,context);
 return {api:window.test,window,storage,localStorage:context.localStorage,main:{...element(),isConnected:true},counts:()=>({paid,excerpts}),switchOwner:()=>{owner='bob';events['vzip:auth-changed']()}};
}
test('disabled STT is checked before any R2 extraction',async()=>{
 const b=browser();await assert.rejects(b.api.stt({storageProvider:'r2',r2Key:'test'},new AbortController().signal),/STT_DISABLED/);
 assert.deepEqual(b.counts(),{paid:1,excerpts:0});
});
test('operation lock covers pending confirmation and blocks competing writes',async()=>{
 const b=browser();let release,calls=0;const pending=new Promise(r=>release=r),main={isConnected:true};
 const first=b.api.exclusive(main,async()=>{calls++;await pending});
 await b.api.exclusive(main,async()=>calls++);assert.equal(calls,1);release();await first;
 await b.api.exclusive(main,async()=>calls++);assert.equal(calls,2);
});
test('account changes invalidate a pending operation and clear in-memory suggestions',async()=>{
 const b=browser();let release,writes=0;const pending=new Promise(r=>release=r);
 b.api.state.results.set('media',{transcript:'private'});
 const op=b.api.exclusive({isConnected:true},async(main,check)=>{await pending;check();writes++});
 b.switchOwner();release();await op;assert.equal(writes,0);assert.equal(b.api.state.results.size,0);
});
test('retry of manually unassigned cached result still requests paid consent',async()=>{
 const b=browser(),item={id:'m'};let confirmations=0;
 b.api.state.items=[item];b.api.state.chosen.add('m');b.api.setResult(item,{candidate:null,status:'미분류'});
 b.window.VZ.confirm=async()=>{confirmations++;return false};
 await b.api.analyze({querySelector:()=>({})});assert.equal(confirmations,1);assert.equal(b.counts().paid,0);
});
function assignment(){
 const b=browser(),item={id:'m',name:'audio',songId:'',song:'',review:'keep this'},writes=[];
 b.window.VZ.db.songs=[{id:'s1',title:'Song one'},{id:'s2',title:'Song two'}];
 b.window.VZ.songLabel=s=>s.title;b.window.VZ.confirm=async()=>true;
 Object.assign(b.window.VZ.media,{label:m=>m.name,dateOf:()=>'',isVideo:()=>false,invalidate(){},list:async()=>[item],
  update:async(m,patch)=>{writes.push({...patch});Object.assign(m,patch)}});
 b.api.state.items=[item];b.api.state.chosen.add(item.id);
 b.api.setResult(item,{candidate:{id:'s1',title:'Song one'}});
 return {...b,item,writes};
}
test('apply snapshots approved choices, backs up before write and undo restores only song fields',async()=>{
 const b=assignment();
 b.window.VZ.confirm=async()=>{b.api.setResult(b.item,{candidate:{id:'s2',title:'Song two'}});return true};
 const update=b.window.VZ.media.update;
 b.window.VZ.media.update=async(m,p)=>{assert.ok([...b.storage.keys()].some(k=>k.startsWith('vzip_song_assignment_backup:')));await update(m,p)};
 await b.api.apply(b.main);assert.deepEqual(b.writes,[{songId:'s1',song:'Song one'}]);assert.equal(b.item.review,'keep this');
 await b.api.undo(b.main);assert.deepEqual(b.writes[1],{songId:'',song:''});assert.equal(b.item.review,'keep this');
});
test('backup failure stops assignment; a newly classified recording is skipped',async()=>{
 const b=assignment();b.localStorage.setItem=()=>{throw Error('quota')};
 await assert.rejects(b.api.apply(b.main),/백업/);assert.equal(b.writes.length,0);
 const c=assignment();c.item.songId='other';await c.api.apply(c.main);assert.equal(c.writes.length,0);
});
