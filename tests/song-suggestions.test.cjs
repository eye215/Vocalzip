const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function edge(env={},user='alice',quota={data:true,error:null},apiText='',owner={data:true,error:null}){
 let handler,calls=0;
 const code=fs.readFileSync('supabase/functions/vzip-song-stt/index.ts','utf8').replace(/^import .*;$/m,'');
 const context={Request,Response,Blob,File,FormData,Uint8Array,AbortSignal,console:{error(){}},
  Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},
  createClient:()=>({auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:null})},rpc:async name=>name==='vzip_ai_owner_allowed'?owner:quota}),
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

test('only the database-configured owner may check readiness or submit paid audio',async()=>{
 for(const method of ['GET','POST']){
  for(const [policy,status]of[[{data:false,error:null},403],[{data:null,error:{message:'owner policy missing'}},503]]){
   const e=edge({...enabled,STT_ALLOWED_USER_IDS:'alice,bob'},'bob',{data:true,error:null},'',policy);
   const response=await e.call(request(method,method==='POST'?'not even valid multipart':undefined));
   assert.equal(response.status,status);assert.equal(e.calls(),0);
  }
 }
});
test('a metadata or body owner claim never bypasses the server owner policy',async()=>{
 const e=edge(enabled,'alice',{data:true,error:null},'',{data:false,error:null});
 const response=await e.call(request('POST',JSON.stringify({owner:true,role:'owner',email:'owner@example.invalid'}),{'Content-Type':'application/json'}));
 assert.equal(response.status,403);assert.equal(e.calls(),0);
});

function browser({mockStt=false}={}){
 let owner='alice',paid=0,excerpts=0;const events={},storage=new Map(),routes={};
 const window={VZ:{media:{isVideo:()=>false,label:m=>m.name||m.id,dateOf:()=>'',list:async()=>[],recordingCategory:m=>m?.recordingCategory||'song',songSearchEligible(m){return ['song','lesson'].includes(this.recordingCategory(m))}},route(name,def){routes[name]=def},db:{songs:[]},toast(){},songLabel:s=>s.title||s.id,
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),clock:n=>`${Math.floor((n||0)/60)}:${String((n||0)%60).padStart(2,'0')}`,dateLabel:s=>s||'날짜 없음'},vzipCloudUserId:()=>owner,
  vzipCloudSignedIn:()=>true,vzipCloudAccessToken:async()=> 'fake',
  VzipR2:{clip:async()=>{excerpts++;throw Error('unexpected extraction')}},dispatchEvent(){},addEventListener:(n,f)=>events[n]=f};
 const element=()=>{const children=new Map();return {style:{},setAttribute(){},append(){},remove(){},add(){},replaceChildren(){},querySelector:key=>{if(!children.has(key))children.set(key,element());return children.get(key)},querySelectorAll:()=>[]}};
 const context={window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  AbortController,DOMException,FormData,File,Blob,Event,setTimeout,document:{createElement:element,createTextNode:text=>({nodeType:3,textContent:String(text)})},Option:function(){},
  fetch:async()=>{paid++;return mockStt?Response.json({enabled:true}):Response.json({error:'STT_DISABLED'},{status:503})}};
 let code=fs.readFileSync('app/song-suggestions.js','utf8').replace(/\}\)\(\);\s*$/,
  'window.test={stt,exclusive,showBusyPopup,showAnalysisPopup,state,cacheKey,analyze,setResult,readCache,apply,undo,loadCloudTexts,references,saveReference,removeReference,singingStart,draw,candidateMatches,destroyPlayers,resultFor,loadSpend,spend,scanWindows,setPipeline:(audio,transcribe)=>{audioWindow=audio;transcribeClip=transcribe}};})();');
 if(mockStt)code=code.replaceAll("await import('../song-text-match.mjs?v=2')",'window.testMatchModule')
  .replaceAll("await import('../stt-clip-browser.mjs?v=3')",'window.testClipModule');
 vm.runInNewContext(code,context);
 window.test.state.cloudReady=true;
 return {api:window.test,window,routes,document:context.document,storage,localStorage:context.localStorage,main:{...element(),isConnected:true},counts:()=>({paid,excerpts}),switchOwner:()=>{owner='bob';events['vzip:auth-changed']()}};
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
test('reopening song check during an operation shows progress and returns to the list when idle',async()=>{
 const b=browser();let release,rendered=0,overlay;
 const main={isConnected:true,dataset:{collection:'song-suggest'},append:el=>overlay=el};
 b.window.VZ.render=()=>rendered++;
 const operation=b.api.exclusive(main,async()=>new Promise(resolve=>release=resolve));
 b.api.showBusyPopup(main);
 assert.equal(overlay.className,'vz-sc-busy');
 assert.equal(overlay.querySelector('strong').textContent,'작업을 처리하고 있어요');
 assert.equal(rendered,0);
 release();await operation;
 assert.equal(rendered,1);
});
test('analysis progress appears in a dialog with count, file name and a stop action',()=>{
 const b=browser();let overlay,removed=false,aborted=false;
 b.window.VZ.media.label=m=>m.name;
 b.document.createElement=()=>{
  const fields=new Map();return {setAttribute(k,v){this[k]=v},remove(){removed=true},querySelector(key){if(!fields.has(key))fields.set(key,{style:{}});return fields.get(key)}};
 };
 b.api.state.controller={abort(){aborted=true}};
 const popup=b.api.showAnalysisPopup({append:el=>overlay=el},95);
 assert.equal(overlay.role,'dialog');assert.equal(overlay.querySelector('[data-analysis-count]').textContent,'0 / 95개 완료');
 popup.update(10,{name:'녹음 10'});
 assert.equal(overlay.querySelector('[data-analysis-count]').textContent,'10 / 95개 진행');
 assert.equal(overlay.querySelector('[data-analysis-file]').textContent,'녹음 10');
 assert.equal(overlay.querySelector('[data-analysis-fill]').style.width,'11%');
 overlay.querySelector('[data-analysis-stop]').onclick();assert.equal(aborted,true);assert.equal(b.api.state.cancel,true);
 popup.close();assert.equal(removed,true);
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
test('no per-run cap on paid analysis: 150 recordings go straight to the cost confirmation',async()=>{
 const b=browser(),errors=[];let asked='';
 b.api.state.referenceRows=[{songId:'s1',transcript:'첫 기준 가사 열다섯 글자 이상의 내용입니다'}];
 b.window.VZ.toast=message=>errors.push(message);b.window.VZ.confirm=async(title,text)=>{asked=text;return false};
 b.api.state.items=Array.from({length:150},(_,i)=>({id:'m'+i}));for(const m of b.api.state.items)b.api.state.chosen.add(m.id);
 await b.api.analyze({querySelector:()=>({})});
 assert.equal(errors.filter(e=>/까지/.test(e)).length,0);assert.match(asked,/150개/);assert.match(asked,/최대 3600구간/);assert.match(asked,/\$5\.400/);assert.equal(b.counts().paid,0);
});
test('식별 불가일 때만 다음 구간을 전사하고 곡이 맞으면 즉시 멈춘다',async()=>{
 const b=browser({mockStt:true}),calls=[],saved=[];let decodes=0;
 b.window.VZ.db.songs=[{id:'s1',title:'Song'}];
 b.api.state.referenceRows=[{songId:'s1',transcript:'matching lyric text for this song'}];
 b.window.vzipCloudSongTextSave=async row=>saved.push(row);
 b.window.testMatchModule={matchTranscripts:text=>text==='song'?{candidate:'s1',reason:'match',matches:[{songId:'s1',score:0.8}]}:{candidate:null,reason:'no match',matches:[]}};
 b.window.testClipModule={clipFromPcm:()=>new File(['audio'],'clip.wav')};
 b.api.setPipeline(async(_item,_signal,{time})=>{decodes++;return {pcm:new Int16Array(16000*90),rate:16000,duration:90,start:time}},async()=>{calls.push('paid');return calls.length===1?'chat':'song'});
 const result=await b.api.stt({id:'m1',durationSeconds:90},new AbortController().signal);
 assert.equal(result.candidate.id,'s1');assert.equal(result.strongMatch,true);
 assert.equal(calls.length,2);assert.equal(decodes,1,'reuse the first decoded window for additional transcription');assert.deepEqual(saved.map(x=>x.recordId),['m1','m1@0']);
});
test('목소리가 없는 첫 구간과 후속 구간은 유료 전사 요청 없이 건너뛴다',async()=>{
 const b=browser({mockStt:true});let paid=0;
 b.window.VZ.db.songs=[{id:'s1',title:'Song'}];
 b.api.state.referenceRows=[{songId:'s1',transcript:'matching lyric text for this song'}];
 b.window.VZ.analyzeSamples=async()=>({curve:Array(600).fill(null),fps:20});
 b.window.testMatchModule={matchTranscripts:()=>({candidate:null,reason:'no match',matches:[]})};
 b.window.testClipModule={clipFromPcm:()=>new File(['audio'],'clip.wav')};
 b.api.setPipeline(async()=>({pcm:new Int16Array(16000*120),rate:16000,duration:45}),async()=>{paid++;return 'unexpected'});
 const result=await b.api.stt({id:'silent',durationSeconds:45},new AbortController().signal);
 assert.equal(result.status,'식별 불가');assert.equal(paid,0);
});
test('전사 확인은 구간별 내용을 순서대로 보이고 원본 문구를 HTML로 해석하지 않는다',async()=>{
 const b=browser(),item={id:'m1',name:'내 녹음',durationSeconds:90},host={isConnected:true,innerHTML:''};
 b.window.VZ.media.list=async()=>[item];
 b.window.vzipCloudSongTextList=async()=>[
  {kind:'recognition',record_id:'m1@54',transcript:'마지막 가사'},
  {kind:'recognition',record_id:'m1',transcript:'<잡담>'},
  {kind:'recognition',record_id:'m1@0',transcript:'첫 가사'}];
 await b.routes['song-transcript'].mount({querySelector:()=>host},{params:['m1']});
 assert.match(host.innerHTML,/&lt;잡담&gt;/);
 assert.ok(host.innerHTML.indexOf('첫 가사')<host.innerHTML.indexOf('마지막 가사'));
 b.switchOwner();assert.equal(host.textContent,'계정이 변경되어 전사 내용을 닫았어요.');
 b.routes['song-transcript'].leave();
});
test('what has been spent so far is shown from the server count',async()=>{
 const b=browser(),line={hidden:true,textContent:''};
 b.window.vzipSttUsage=async()=>({total:200,today:3});
 await b.api.loadSpend({querySelector:x=>x==='[data-spend]'?line:null});
 assert.equal(line.hidden,false);
 assert.equal(line.textContent,'사용 금액 약 $0.300');
 assert.match(line.title,/음성 분석 200회 · 오늘 3회/);
 b.window.vzipSttUsage=async()=>null; b.api.spend.total=null;
 await b.api.loadSpend({querySelector:x=>x==='[data-spend]'?line:null});
 assert.equal(line.hidden,true); // signed out or the usage function not installed yet: nothing invented
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
function songView(b){
 function node(tag='div'){
  const element={tag,children:[],style:{},hidden:false,disabled:false,attributes:{},dataset:{},
   setAttribute(k,v){this.attributes[k]=v},append(...xs){this.children.push(...xs)},
   replaceChildren(...xs){this.children=[...xs]},add(x){this.children.push(x)},querySelectorAll(){return []}};
  Object.defineProperty(element,'innerHTML',{set(html){this.html=html;this.fields={};for(const selector of ['input','.vz-sc-play-trigger','.vz-sc-player-host','.vz-sc-player-placeholder','.vz-sc-recommend','.vz-sc-menu'])this.fields[selector]=node()},get(){return this.html}});
  element.querySelector=selector=>element.fields?.[selector]||null;
  return element;
 }
 b.document.createElement=node;
 const listing=node(),widgets=new Map();
 for(const key of ['[data-suggest-list]','[data-more]','[data-counter]','[data-select-all]','[data-analyze]','[data-apply]','[data-undo]','[data-stop]','[data-page-count]','[data-review-count]','[data-auto-count]','[data-wait-count]','[data-vocal-count]'])widgets.set(key,key==='[data-suggest-list]'?listing:node());
 const root=node();root.querySelector=key=>widgets.get(key)||null;
 const main={isConnected:true,querySelector:key=>key==='[data-suggest]'?root:null};
 return {node,listing,widgets,main};
}
test('record cards render safe names and playback is loaded only after a tap',()=>{
 const b=browser(),v=songView(b),item={id:'media-1',name:'Take <1>.m4a',durationSeconds:76};
 const made=[],destroyed=[];
 b.window.VZ.media.player=(host,row,options)=>{made.push({host,row,options});return {play(){},destroy(){destroyed.push(row.id)}}};
 b.api.state.items=[item];b.api.state.chosen.add(item.id);
 b.api.setResult(item,{status:'후보',candidate:{id:'a',title:'The River'},matches:[]});
 b.api.draw(v.main);
 const card=v.listing.children[0];
 assert.match(card.innerHTML,/Take &lt;1&gt;.m4a/);
 assert.match(card.innerHTML,/vz-sc-recommend/);
 assert.equal(made.length,0);
 card.querySelector('.vz-sc-play-trigger').onclick();
 assert.equal(made.length,1);
 assert.equal(made[0].options.prefetch,false);
 assert.equal(card.querySelector('.vz-sc-player-host').hidden,false);
 b.api.draw(v.main);assert.deepEqual(destroyed,['media-1']);
});
test('more appends batches of 30 and keeps selections',()=>{
 const b=browser(),v=songView(b);
 b.api.state.items=Array.from({length:75},(_,i)=>({id:'m'+i,name:'Take '+i+'.m4a'}));
 b.api.draw(v.main);assert.equal(v.listing.children.length,30);
 assert.equal(v.widgets.get('[data-more]').hidden,false);
 const checkbox=v.listing.children[0].querySelector('input');checkbox.checked=true;checkbox.onchange({target:checkbox});
 assert.equal(b.api.state.chosen.has('m0'),true);
 b.api.state.page=1;b.api.draw(v.main);assert.equal(v.listing.children.length,60);
 assert.equal(b.api.state.chosen.has('m0'),true);
 b.api.state.page=2;b.api.draw(v.main);assert.equal(v.listing.children.length,75);
 assert.equal(v.widgets.get('[data-more]').hidden,true);
});
test('selection has no cap beyond 100 recordings',()=>{
 const b=browser(),v=songView(b);
 b.api.state.items=Array.from({length:230},(_,i)=>({id:'file-'+i,name:'Audio '+i}));
 b.api.state.chosen=new Set(b.api.state.items.slice(0,100).map(x=>x.id));
 b.api.state.page=4;b.api.draw(v.main);
 const checkbox=v.listing.children[120].querySelector('input');checkbox.checked=true;checkbox.onchange({target:checkbox});
 assert.equal(b.api.state.chosen.size,101);
});

test('rank one is preselected, manual override and explicit unassigned are preserved',()=>{
 const b=browser(),item={id:'top',name:'take'};
 b.window.VZ.db.songs=[{id:'a',title:'A'},{id:'b',title:'B'}];
 b.api.setResult(item,{candidate:null,matches:[{songId:'a',score:0.3},{songId:'b',score:0.2}]});
 assert.equal(b.api.resultFor(item).candidate.id,'a');
 b.api.setResult(item,{userSelected:true,candidate:{id:'b'},matches:[{songId:'a',score:0.9}]});
 assert.equal(b.api.resultFor(item).candidate.id,'b');
 b.api.setResult(item,{userSelected:true,candidate:null,matches:[{songId:'a',score:0.9}]});
 assert.equal(b.api.resultFor(item).candidate,null);
 b.api.setResult(item,{candidate:null,matches:[]});assert.equal(b.api.resultFor(item).candidate,null);
});
test('top-1 is picked by default only when the lyrics are actually similar; noise is never auto-picked', () => {
 const b = browser();
 b.window.VZ.db.songs = [{id:'s1', title:'A'}, {id:'s2', title:'B'}];
 b.api.state.results.set('weak', {status:'식별 불가', candidate:null, method:'stt', matches:[{songId:'s1', score:0.05}, {songId:'s2', score:0.04}]});
 b.api.state.results.set('close', {status:'식별 불가', candidate:null, method:'stt', matches:[{songId:'s2', score:0.2}, {songId:'s1', score:0.18}]});
 b.api.state.results.set('mine', {status:'미분류', candidate:null, userSelected:true, method:'stt', matches:[{songId:'s1', score:0.9}]});
 assert.equal(b.api.resultFor({id:'weak'}).candidate, null);
 const close = b.api.resultFor({id:'close'}).candidate;
 assert.equal(close.id, 's2'); assert.match(close.reason, /20%/); assert.equal(close.level, '확인 필요');
 assert.equal(b.api.resultFor({id:'mine'}).candidate, null); // the user's own "no song" choice stays
});


test('title search requests voice detection without full note measurements',async()=>{
 const b=browser();let requested;
 b.window.VZ.analyzeSamples=async(samples,rate,onProgress,options)=>{requested=options;return {curve:Array(600).fill(6900),fps:20}};
 await b.api.singingStart(new Float32Array(16000*30),16000,new AbortController().signal);
 assert.equal(requested.voiceOnly,true);
});


test('first title match decodes only 30 seconds and stops before further excerpts',async()=>{
 const b=browser({mockStt:true}),requests=[];let paid=0;
 b.window.VZ.db.songs=[{id:'s1',title:'Song'}];
 b.api.state.referenceRows=[{songId:'s1',transcript:'matching lyric text for this song'}];
 b.window.vzipCloudSongTextSave=async()=>{};
 b.window.testMatchModule={matchTranscripts:()=>({candidate:'s1',matches:[{songId:'s1',score:.9}]})};
 b.window.testClipModule={clipFromPcm:()=>new File(['audio'],'clip.wav')};
 b.api.setPipeline(async(_item,_signal,options)=>{requests.push(options);return {pcm:new Int16Array(16000*30),rate:16000,duration:300,start:0}},async()=>{paid++;return 'matching lyric'});
 const result=await b.api.stt({id:'m1',durationSeconds:300},new AbortController().signal);
 assert.equal(requests.length,1);assert.equal(requests[0].seconds,30);assert.equal(paid,1);assert.equal(result.candidate.id,'s1');
});
test('returning during title analysis shows live progress and preserves the completed result',async()=>{
 const b=browser({mockStt:true});let enter,release,overlay,rendered=0;
 const entered=new Promise(r=>enter=r),pending=new Promise(r=>release=r);
 b.window.VZ.db.songs=[{id:'s1',title:'Song'}];
 b.window.VZ.media.recordingCategory=()=> 'song';b.window.VZ.confirm=async()=>true;
 b.window.VZ.render=()=>rendered++;
 b.window.vzipCloudSongTextSave=async()=>{};
 b.api.state.referenceRows=[{songId:'s1',transcript:'matching lyric text for this song'}];
 b.api.state.items=[{id:'m1',name:'진행 중인 녹음',durationSeconds:300}];b.api.state.chosen.add('m1');
 b.window.testMatchModule={matchTranscripts:()=>({candidate:'s1',matches:[{songId:'s1',score:.9}]})};
 b.window.testClipModule={clipFromPcm:()=>new File(['audio'],'clip.wav')};
 b.api.setPipeline(async()=>({pcm:new Int16Array(16000*30),rate:16000,duration:300,start:0}),async()=>{enter();await pending;return 'matching lyric'});
 const running=b.api.exclusive(b.main,b.api.analyze);
 await entered;b.main.isConnected=false;
 b.api.showBusyPopup({isConnected:true,dataset:{collection:'song-suggest'},append:el=>overlay=el});
 assert.match(overlay.className,/vz-sc-analysis/);
 assert.match(overlay.querySelector('[data-analysis-file]').textContent,/진행 중인 녹음.*가사 인식/);
 release();await running;
 assert.equal(b.api.state.results.get('m1').candidate.id,'s1');assert.equal(rendered,1);
});

test('the Korean translation is a matching reference too, next to the original lyrics',()=>{
 const b=browser();
 b.window.VZ.db.songs=[{id:'moment',title:'지금 이 순간',lyrics:'This is the moment this is the day',translation:'지금 이 순간 지금 여기 간절히 바라고 원했던'},
  {id:'ko',title:'번역만',translation:'번역 가사만 입력한 곡의 한국어 가사'},{id:'short',title:'짧음',translation:'짧다'}];
 const refs=Array.from(b.api.references(),r=>r.songId+':'+r.source);
 assert.deepEqual(refs,['moment:lyrics','moment:translation','ko:translation']);
});
