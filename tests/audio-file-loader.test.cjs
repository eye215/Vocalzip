const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../app/audio-file-loader.js');
const policy={resolveMs:25,idleMs:25,totalMs:500,attempts:2};
const source=async()=>({url:'https://fake.invalid/audio'});
test('a stalled response is aborted and retried once, with a newly resolved URL',async()=>{
 const events=[],urls=[];let calls=0,aborted=false;
 const bytes=await L.read({source:async o=>{urls.push(o.attempt);return source();},policy,onEvent:e=>events.push(e),fetch:async(_url,{signal})=>{
  if(++calls===1)return await new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));
  return new Response(new Uint8Array([1,2,3]));
 }});
 assert.equal(bytes.byteLength,3);assert.equal(aborted,true);assert.deepEqual(urls,[1,2]);
 assert.equal(events[0].code,'idle-timeout');assert.equal(events[0].stage,'headers');
});
test('continuous byte progress renews the idle deadline rather than timing out a slow healthy transfer',async()=>{
 let timer;
 const bytes=await L.read({source,policy:{...policy,idleMs:50},fetch:async()=>new Response(new ReadableStream({start(c){let n=0;timer=setInterval(()=>{c.enqueue(new Uint8Array([++n]));if(n===6){clearInterval(timer);c.close();}},15);},cancel(){clearInterval(timer);}}))});
 assert.equal(bytes.byteLength,6);
});
test('a body stalled midway is cancelled; the retry returns a whole file without duplicate partial bytes',async()=>{
 let calls=0,cancelled=false;
 const bytes=await L.read({source,policy,fetch:async()=>++calls===1?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([9,9]));},cancel(){cancelled=true;}})):new Response(new Uint8Array([1,2,3]))});
 assert.equal(cancelled,true);assert.deepEqual([...new Uint8Array(bytes)],[1,2,3]);
});
test('expired links are re-resolved once; missing files and oversized files are never retried',async()=>{
 let calls=0;await L.read({source,policy,fetch:async()=>new Response(new Uint8Array([1]),{status:++calls===1?403:200})});assert.equal(calls,2);
 for(const response of [new Response(null,{status:404}),new Response(new Uint8Array(4),{headers:{'content-length':'4'}})]){
  calls=0;await assert.rejects(L.read({source,policy,maxBytes:3,fetch:async()=>{calls++;return response;}}));assert.equal(calls,1);
 }
});
test('cancellation is immediate while signing or reading, even when the underlying promise ignores abort',async()=>{
 for(const signing of [true,false]){
  const ctl=new AbortController();let calls=0;
  const pending=L.read({source:signing?()=>new Promise(()=>{}):source,signal:ctl.signal,policy,fetch:()=>{calls++;return new Promise(()=>{});}});
  setTimeout(()=>ctl.abort(),5);
  await assert.rejects(pending,e=>e.name==='AbortError');assert.ok(calls<=1);
 }
});
test('permanent failure reports bounded safe diagnostics without URLs, keys or raw server messages',async()=>{
 await assert.rejects(L.read({source,policy,fetch:async()=>{throw Error('https://secret.invalid/?cap=SECRET');}}),e=>{
  assert.deepEqual(e.diagnostic,{code:'network',stage:'headers',attempt:2,status:null,bytes:0});
  assert.ok(!JSON.stringify(e.diagnostic).includes('SECRET'));return true;
 });
});
test('a source that never returns is bounded and does not begin a download later',async()=>{
 let calls=0;
 await assert.rejects(L.read({source:()=>new Promise(()=>{}),policy,fetch:()=>{calls++;}}),e=>e.diagnostic.code==='resolve-timeout');
 assert.equal(calls,0);
});
test('an unresponsive decoder or mono worker stops waiting and receives an abort',async()=>{
 let signal;
 await assert.rejects(L.task(s=>{signal=s;return new Promise(()=>{});},{ms:20,stage:'mr-mono'}),e=>e.diagnostic.code==='processing-timeout');
 assert.equal(signal.aborted,true);
});
test('the total deadline covers both attempts and cancels even a continuously streaming body',async()=>{
 let timer,cancelled=false;
 await assert.rejects(L.read({source,policy:{resolveMs:100,idleMs:100,totalMs:70,attempts:2},fetch:async()=>new Response(new ReadableStream({start(c){timer=setInterval(()=>c.enqueue(new Uint8Array([1])),10);},cancel(){cancelled=true;clearInterval(timer);}}))}),e=>e.diagnostic.code==='total-timeout');
 assert.equal(cancelled,true);
});
test('older Safari dropping abort(reason) still reports and retries a timeout rather than saying the person stopped',async()=>{
 const C=global.AbortController;global.AbortController=class extends C{abort(){super.abort();}};
 try{
  await assert.rejects(L.read({source:()=>new Promise(()=>{}),policy}),e=>e.diagnostic.code==='resolve-timeout'&&e.diagnostic.attempt===2);
  await assert.rejects(L.task(()=>new Promise(()=>{}),{ms:20}),e=>e.diagnostic.code==='processing-timeout');
 }finally{global.AbortController=C;}
});
test('recording retries bypass an old cached R2 link and renew it, while a device file always stays local',async()=>{
 const saved=global.VzipR2,seen=[];
 global.VzipR2={url:async(key,options)=>{seen.push(options);return 'fresh';}};
 try{
  const ctl=new AbortController(),media={srcNow:()=>({url:'cached',revoke:false}),src:()=>{throw Error('must renew the R2 URL');}};
  const source=L.recordingSource(media,{storageProvider:'r2',r2Key:'fake/test'});
  assert.equal((await source({attempt:1,signal:ctl.signal})).url,'cached');
  assert.equal((await source({attempt:2,signal:ctl.signal})).url,'fresh');assert.equal(seen[0].refresh,true);assert.equal(seen[0].signal,ctl.signal);
  media.srcNow=()=>({url:'blob:local',revoke:true});
  assert.equal((await source({attempt:2,signal:ctl.signal})).url,'blob:local');assert.equal(seen.length,1);
 }finally{global.VzipR2=saved;}
});
test('legacy chunk assembly is allowed to finish beyond the short URL-signing deadline',async()=>{
 let calls=0;
 const source=L.recordingSource({src:async()=>{calls++;await new Promise(r=>setTimeout(r,70));return {url:'assembled-file'};}},{storageVersion:2});
 const result=await L.read({source,policy,fetch:async()=>new Response(new Uint8Array([1]))});
 assert.equal(calls,1);assert.equal(result.byteLength,1);
});
