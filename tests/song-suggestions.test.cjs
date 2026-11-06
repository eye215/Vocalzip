const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function edge(env={},user='alice',quota={data:true,error:null},apiText=''){
 let handler,calls=0;
 const code=fs.readFileSync('supabase/functions/vzip-song-stt/index.ts','utf8').replace(/^import .*;$/m,'');
 const context={Request,Response,Blob,File,FormData,Uint8Array,AbortSignal,console:{error(){}},
  Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},
  createClient:()=>({auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:null})},rpc:async()=>quota}),
  fetch:async()=>{calls++;return Response.json({text:apiText})}};
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

test('transcript-only matches free local pipeline and NEVER calls GPT',async()=>{
 const e=edge(enabled,'alice',{data:true,error:null},'오늘 밤 저 별빛 아래서 너와 춤추고 싶어');
 const form=new FormData();
 form.set('file',new File([new Uint8Array(1024)],'clip.wav',{type:'audio/wav'}));
 form.set('mode','transcript-only');
 const response=await e.call(request('POST',form));
 assert.equal(response.status,200);
 const json=await response.json();
 assert.equal(json.mode,'transcript-only');
 assert.equal(json.transcript,'오늘 밤 저 별빛 아래서 너와 춤추고 싶어');
 assert.equal(e.calls(),1);
});
test('database quota exhaustion and failures never issue paid model requests',async()=>{
 for(const [quota,expectedStatus] of [
  [{data:false,error:null},429],
  [{data:null,error:{message:'quota migration missing'}},503]
 ]){
  const e=edge(enabled,'alice',quota),form=new FormData();
  form.set('file',new File([new Uint8Array(1024)],'clip.wav',{type:'audio/wav'}));
  form.set('songs',JSON.stringify([{id:'s1',title:'Song one'}]));
  const response=await e.call(request('POST',form));
  assert.equal(response.status,expectedStatus);
  assert.equal(e.calls(),0);
 }
});
function browser(){
 let owner='alice',paid=0,excerpts=0;const events={},storage=new Map();
 const window={VZ:{media:{isVideo:()=>false,label:m=>m.name||m.id,list:async()=>[]},route(){},db:{songs:[]},toast(){},songLabel:s=>s.title||s.id},vzipCloudUserId:()=>owner,
  vzipCloudSignedIn:()=>true,vzipCloudAccessToken:async()=> 'fake',
  VzipR2:{clip:async()=>{excerpts++;throw Error('unexpected extraction')}},dispatchEvent(){},addEventListener:(n,f)=>events[n]=f};
 const element=()=>({style:{},setAttribute(){},append(){},add(){},replaceChildren(){},querySelector:()=>element(),querySelectorAll:()=>[]});
 const context={window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  AbortController,DOMException,FormData,File,Blob,Event,setTimeout,document:{createElement:element},Option:function(){},
  fetch:async()=>{paid++;return Response.json({error:'STT_DISABLED'},{status:503})}};
 const code=fs.readFileSync('app/song-suggestions.js','utf8').replace(/\}\)\(\);\s*$/,
  'window.test={stt,exclusive,state,cacheKey,analyze,setResult,readCache,apply,undo,loadCloudTexts,references,saveReference,removeReference,singingStart,draw,candidateMatches,destroyPlayers};})();');
 vm.runInNewContext(code,context);
 window.test.state.cloudReady=true;
 return {api:window.test,window,document:context.document,storage,localStorage:context.localStorage,main:{...element(),isConnected:true},counts:()=>({paid,excerpts}),switchOwner:()=>{owner='bob';events['vzip:auth-changed']()}};
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
 b.api.state.referenceRows=[{songId:'s1',transcript:'첫 기준 가사 열다섯 글자 이상의 내용입니다'}];
 b.api.state.items=[item];b.api.state.chosen.add('m');b.api.setResult(item,{candidate:null,status:'미분류'});
 b.window.VZ.confirm=async()=>{confirmations++;return false};
 await b.api.analyze({querySelector:()=>({})});assert.equal(confirmations,1);assert.equal(b.counts().paid,0);
});
function assignment(){
 const b=browser(),item={id:'m',name:'audio',songId:'',song:'',review:'keep this'},writes=[];
 b.window.VZ.db.songs=[{id:'s1',title:'Song one'},{id:'s2',title:'Song two'}];
 b.window.VZ.songLabel=s=>s.title;b.window.VZ.confirm=async()=>true;
 Object.assign(b.window.VZ.media,{label:m=>m.name,dateOf:()=>'',isVideo:()=>false,invalidate(){},list:async()=>[item],
  assignSongSafe:async(m,patch,opts)=>{
    if((m.songId||'')!==(opts.expectedSongId||'')||(m.song||'')!==(opts.expectedSong||''))throw Error('song changed');
    writes.push({...patch});Object.assign(m,patch);
    return {updatedAt:'2026-11-06T01:00:00.000Z'};
  }});
 b.api.state.items=[item];b.api.state.chosen.add(item.id);
 b.api.setResult(item,{candidate:{id:'s1',title:'Song one'}});
 return {...b,item,writes};
}
test('apply snapshots approved choices, backs up before write and undo restores only song fields',async()=>{
 const b=assignment();
 b.window.VZ.confirm=async()=>{b.api.setResult(b.item,{candidate:{id:'s2',title:'Song two'}});return true};
 const update=b.window.VZ.media.assignSongSafe;
 b.window.VZ.media.assignSongSafe=async(m,p,opts)=>{
   assert.ok([...b.storage.keys()].some(k=>k.startsWith('vzip_song_assignment_backup:')));
   return update(m,p,opts);
 };
 await b.api.apply(b.main);assert.deepEqual(b.writes,[{songId:'s1',song:'Song one'}]);assert.equal(b.item.review,'keep this');
 await b.api.undo(b.main);assert.deepEqual(b.writes[1],{songId:'',song:''});assert.equal(b.item.review,'keep this');
});
test('backup failure stops assignment; a newly classified recording is skipped',async()=>{
 const b=assignment();b.localStorage.setItem=()=>{throw Error('quota')};
 await assert.rejects(b.api.apply(b.main),/백업/);assert.equal(b.writes.length,0);
 const c=assignment();c.item.songId='other';await c.api.apply(c.main);assert.equal(c.writes.length,0);
});

test('undo skips failed writes instead of modifying an unconfirmed assignment',async()=>{
 const b=assignment();
 b.window.VZ.media.assignSongSafe=async()=>{throw Error('write failed')};
 await b.api.apply(b.main);assert.equal(b.writes.length,0);
 await b.api.undo(b.main);assert.equal(b.writes.length,0);
});
test('one run of paid analysis is capped at 30 recordings (the server quota is the real limit)',async()=>{
 const b=browser(),errors=[];
 b.api.state.referenceRows=[{songId:'s1',transcript:'첫 기준 가사 열다섯 글자 이상의 내용입니다'}];
 b.window.VZ.toast=message=>errors.push(message);
 b.api.state.items=Array.from({length:31},(_,i)=>({id:'m'+i}));for(const m of b.api.state.items)b.api.state.chosen.add(m.id);
 await b.api.analyze({querySelector:()=>({})});
 assert.match(errors.join(' '),/30개/);assert.equal(b.counts().paid,0);
});
test('the 30 paid seconds are where the singing is, found on the device for free',async()=>{
 const b=browser(),fps=20,curve=new Array(120*fps).fill(null);
 for(let i=40*fps;i<80*fps;i++)curve[i]=6000; // MR intro, singing from 0:40 to 1:20
 let seen=null;b.window.VZ.analyzeSamples=async(samples,rate)=>{seen=[samples.length,rate];return {curve,fps}};
 const start=await b.api.singingStart(new Float32Array(16000*120),16000);
 assert.equal(start,39.5); // half a second of lead-in before the first sung frame
 assert.deepEqual(seen,[16000*120,16000]);
});
test('no singing found: nothing is sent and nothing is paid',async()=>{
 const b=browser();
 b.window.VZ.analyzeSamples=async()=>({curve:new Array(2400).fill(null),fps:20});
 await assert.rejects(b.api.singingStart(new Float32Array(16000*120),16000),/노래 구간을 찾지 못했어요/);
 assert.equal(b.counts().paid,0);
});
test('without the analyzer the old fixed 20-second start is kept',async()=>{
 const b=browser();
 assert.equal(await b.api.singingStart(new Float32Array(16000*100),16000),20);
 assert.equal(await b.api.singingStart(new Float32Array(16000*35),16000),5);
});

test('browser-only references safely migrate to cloud and hydrate on another device',async()=>{
 const rows=new Map(),writes=[];
 const a=browser();
 a.storage.set('vzip_song_stt_references_v1:alice',JSON.stringify([{songId:'song1',transcript:'이 기준 음성은 첫 번째 브라우저에서 저장한 가사 테스트입니다'}]));
 const endpoint={
  list:async()=>[...rows.values()],
  save:async row=>{writes.push(row);const key=row.kind+':'+row.recordId;if(!rows.has(key)||!row.onlyIfMissing)rows.set(key,{kind:row.kind,record_id:row.recordId,transcript:row.transcript})},
  remove:async(kind,id)=>{const key=kind+':'+id;rows.set(key,{...rows.get(key),deleted_at:'2026-11-06T00:00:00Z'})}
 };
 a.window.vzipCloudSongTextList=endpoint.list;
 a.window.vzipCloudSongTextSave=endpoint.save;
 a.window.vzipCloudSongTextDelete=endpoint.remove;
 await a.api.loadCloudTexts();
 assert.equal(a.api.references().length,1);
 assert.equal(a.storage.has('vzip_song_stt_references_v1:alice'),false);
 assert.equal(writes[0].onlyIfMissing,true);
 const b=browser();b.window.vzipCloudSongTextList=endpoint.list;b.window.vzipCloudSongTextSave=endpoint.save;b.window.vzipCloudSongTextDelete=endpoint.remove;
 await b.api.loadCloudTexts();
 assert.equal(b.api.references()[0].transcript,a.api.references()[0].transcript);
 await b.api.removeReference('song1');assert.equal(b.api.references().length,0);
 await a.api.loadCloudTexts();assert.equal(a.api.references().length,0);
 // A third device still holding a stale local reference must NOT resurrect a cloud tombstone.
 const c=browser();c.storage.set('vzip_song_stt_references_v1:alice',JSON.stringify([{songId:'song1',transcript:'오프라인 구형 기기의 오래된 가사입니다'}]));
 c.window.vzipCloudSongTextList=endpoint.list;c.window.vzipCloudSongTextSave=endpoint.save;
 const writesBefore=writes.length;await c.api.loadCloudTexts();
 assert.equal(writes.length,writesBefore);assert.equal(c.api.references().length,0);
});
test('remote reference is never overwritten by stale browser backup',async()=>{
 const b=browser();
 b.storage.set('vzip_song_stt_references_v1:alice',JSON.stringify([{songId:'song1',transcript:'오래된 브라우저 가사입니다 추가 텍스트입니다'}]));
 const rows=[{kind:'reference',record_id:'song1',transcript:'최신 클라우드 가사입니다 변경된 데이터가 있습니다'}];let writes=0;
 b.window.vzipCloudSongTextList=async()=>rows;
 b.window.vzipCloudSongTextSave=async()=>{writes++};
 await b.api.loadCloudTexts();
 assert.equal(writes,0);
 assert.equal(b.api.references()[0].transcript,rows[0].transcript);
});
test('failed cloud import never erases legacy browser text or allows paid STT',async()=>{
 const b=browser(),key='vzip_song_stt_references_v1:alice';
 b.storage.set(key,JSON.stringify([{songId:'s1',transcript:'브라우저에 남아 있는 데이터가 삭제되면 안 됩니다'}]));
 b.window.vzipCloudSongTextList=async()=>[];
 b.window.vzipCloudSongTextSave=async()=>{throw Error('offline')};
 await assert.rejects(b.api.loadCloudTexts(),/offline/);
 assert.equal(b.storage.has(key),true);assert.equal(b.api.state.cloudReady,false);
 await assert.rejects(b.api.stt({id:'m'},new AbortController().signal),/동기화/);
 assert.equal(b.counts().paid,0);
});
test('already-paid STT cache migrates without a second transcription',async()=>{
 const b=browser(),item={id:'media1',name:'take.m4a',size:100,r2Key:'x.m4a'};
 b.api.state.items=[item];
 b.api.setResult(item,{method:'stt',candidate:null,transcript:'이전에 유료 인식한 음성 텍스트를 재사용합니다',status:'식별 불가'});
 let calls=0;const rows=[];
 b.window.vzipCloudSongTextList=async()=>rows;
 b.window.vzipCloudSongTextSave=async(row)=>{rows.push({kind:row.kind,record_id:row.recordId,transcript:row.transcript});calls++};
 await b.api.loadCloudTexts();
 assert.equal(calls,1);
 assert.equal(b.api.state.recognitions.get(item.id),'이전에 유료 인식한 음성 텍스트를 재사용합니다');
 assert.equal(b.counts().paid,0);
});

test('song lyric sheet already synced by VZ cloud takes priority over STT reference',()=>{
 const b=browser();
 b.window.VZ.db.songs=[{id:'song-a',title:'Song A',lyrics:'곡 상세에 등록한 원문 가사가 우선하여 유지되는 테스트 가사입니다'}];
 b.api.state.referenceRows=[{songId:'song-a',transcript:'오래된 녹음으로 만들어진 기준 내용입니다'},{songId:'song-b',transcript:'다른 곡의 기준 가사 내용입니다'}];
 const refs=b.api.references();
 assert.equal(refs.length,2);
 assert.equal(refs.find(x=>x.songId==='song-a').source,'lyrics');
 assert.match(refs.find(x=>x.songId==='song-a').transcript,/곡 상세/);
});

test('TOP3 matcher displays sorted scores even if match is too ambiguous to auto-assign',()=>{
 const b=browser();
 const matches=b.api.candidateMatches({matches:[
  {songId:'a',score:0.86543},{songId:'b',score:0.58134},{songId:'c',score:0.32149},{songId:'d',score:0.12011}
 ]});
 assert.equal(matches.length,3);
 assert.equal(matches[0].songId,'a');
 assert.equal(matches[0].score,0.865);
 assert.equal(matches[2].songId,'c');
});
test('inline playback is lazy, same page shows TOP3 and redraw releases media',()=>{
 const b=browser(),item={id:'media-1',name:'Take 1.m4a',durationSeconds:76};
 const songs=[{id:'a',title:'Song A'},{id:'b',title:'Song B'},{id:'c',title:'Song C'}];
 b.window.VZ.db.songs=songs;
 b.window.VZ.media.dateOf=()=> '2026-11-06';
 const made=[],destroyed=[],paused=[];
 b.window.VZ.media.player=(host,row,options)=>{
  made.push({host,row,options});
  return {pause(){paused.push(row.id)},destroy(){destroyed.push(row.id)}};
 };
 function node(tag='div'){
  return {tag,children:[],style:{},attributes:{},hidden:false,
   setAttribute(name,value){this.attributes[name]=value},
   append(...children){this.children.push(...children)},
   replaceChildren(...children){this.children=[...children]},
   add(child){this.children.push(child)},
   querySelector(){return null},querySelectorAll(){return []}
  };
 }
 const listing=node(),widgets=new Map();
 for(const key of ['[data-suggest-list]','[data-more]','[data-counter]','[data-analyze]','[data-apply]','[data-undo]','[data-stop]'])
  widgets.set(key,key==='[data-suggest-list]'?listing:node());
 const root=node();root.querySelector=key=>widgets.get(key)||null;
 const main={isConnected:true,querySelector:key=>key==='[data-suggest]'?root:null};
 b.document.createElement=node;
 b.api.state.items=[item];b.api.state.chosen.add(item.id);
 b.api.setResult(item,{status:'식별 불가',method:'stt',transcript:'some text',candidate:null,
  matches:[{songId:'a',score:0.88},{songId:'b',score:0.65},{songId:'c',score:0.31}]});
 b.api.draw(main);
 assert.equal(made.length,0,'player must not fetch/decode media on drawing 40 items');
 const card=listing.children[0],playWrap=card.children.find(x=>x.children?.[0]?.textContent==='▶ 녹음 듣기');
 assert.ok(playWrap,'inline listen toggle should be present');
 const listen=playWrap.children[0],host=playWrap.children[1];
 assert.equal(host.hidden,true);
 listen.onclick();
 assert.equal(made.length,1);
 assert.equal(made[0].row.id,item.id);
 assert.equal(made[0].options.prefetch,false,'must avoid network prefetch for offscreen audio');
 assert.equal(made[0].options.tools,true,'player retains seek and speed controls');
 assert.equal(host.hidden,false);
 listen.onclick();assert.deepEqual(paused,['media-1']);assert.equal(host.hidden,true);
 const ranking=card.children.find(x=>x.children?.[0]?.textContent==='가사 유사도 TOP 3 · 참고 점수');
 assert.ok(ranking);
 assert.match(ranking.children[1].children[0].textContent,/88%/);
 assert.match(ranking.children[2].children[0].textContent,/65%/);
 assert.match(ranking.children[3].children[0].textContent,/31%/);
 assert.match(ranking.children[4].textContent,/확률은 아니에요/);
 ranking.children[2].children[1].onclick();
 assert.equal(b.api.readCache(item).candidate.id,'b','user can select 2nd candidate without applying song immediately');
 assert.deepEqual(destroyed,['media-1'],'redraw should close and revoke audio resources');
 assert.equal(made.length,1,'choosing another candidate never triggers audio replay or paid STT');
 assert.equal(b.counts().paid,0);
});

test('30-item pages do not accumulate and keep existing selections between pages',()=>{
 const b=browser();
 b.window.VZ.media.dateOf=()=> '2026-11-06';
 const doc=b.document;
 function node(tag='div'){
  return {tag,children:[],style:{},hidden:false,disabled:false,
   setAttribute(){},append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=[...xs]},
   add(child){this.children.push(child)},querySelector(){return null},querySelectorAll(){return []}
  };
 }
 doc.createElement=node;
 const listing=node(),nodes=new Map();
 for(const key of ['[data-suggest-list]','[data-more]','[data-prev]','[data-page-count]',
  '[data-counter]','[data-analyze]','[data-apply]','[data-undo]','[data-stop]'])
  nodes.set(key,key==='[data-suggest-list]'?listing:node());
 const root=node();root.querySelector=key=>nodes.get(key)||null;
 const main={isConnected:true,querySelector:key=>key==='[data-suggest]'?root:null};
 b.api.state.items=Array.from({length:75},(_,i)=>({id:'m'+i,name:'Take '+i+'.m4a'}));
 b.api.state.page=0;
 b.api.draw(main);
 assert.equal(listing.children.length,30);
 assert.match(nodes.get('[data-page-count]').textContent,/1–30 \/ 전체 75개/);
 assert.equal(nodes.get('[data-prev]').hidden,true);
 assert.equal(nodes.get('[data-more]').hidden,false);
 listing.children[0].children[0].children[0].checked=true;
 listing.children[0].children[0].children[0].onchange();
 assert.equal(b.api.state.chosen.has('m0'),true);
 b.api.state.page=1;b.api.draw(main);
 assert.equal(listing.children.length,30,'second page replaces first page');
 assert.match(nodes.get('[data-page-count]').textContent,/31–60 \/ 전체 75개/);
 assert.equal(b.api.state.chosen.has('m0'),true,'selection from page 1 is preserved');
 b.api.state.page=2;b.api.draw(main);
 assert.equal(listing.children.length,15);
 assert.equal(nodes.get('[data-more]').hidden,true);
 assert.match(nodes.get('[data-page-count]').textContent,/61–75 \/ 전체 75개/);
});
test('selection is limited to thirty across pages even when the list contains hundreds',()=>{
 const b=browser();b.window.VZ.media.dateOf=()=> '';
 function node(){
  return {children:[],style:{},hidden:false,disabled:false,setAttribute(){},append(...xs){this.children.push(...xs)},
   replaceChildren(...xs){this.children=[...xs]},add(x){this.children.push(x)},querySelectorAll(){return []}
  };
 }
 b.document.createElement=node;
 const listing=node(),root=node(),nodes=new Map();
 for(const key of ['[data-counter]','[data-analyze]','[data-apply]','[data-undo]','[data-stop]','[data-more]','[data-prev]','[data-page-count]'])
  nodes.set(key,node());
 nodes.set('[data-suggest-list]',listing);
 root.querySelector=x=>nodes.get(x);
 const main={isConnected:true,querySelector:x=>x==='[data-suggest]'?root:null};
 b.api.state.items=Array.from({length:62},(_,i)=>({id:'file-'+i,name:'Audio '+i}));
 b.api.state.chosen=new Set(b.api.state.items.slice(0,30).map(x=>x.id));
 b.api.state.page=1;
 b.api.draw(main);
 const checkbox=listing.children[0].children[0].children[0];
 checkbox.checked=true;checkbox.onchange();
 assert.equal(checkbox.checked,false,'cannot select 31st file');
 assert.equal(b.api.state.chosen.size,30);
});
