const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const workers=[];const VZ={media:{}};class Worker{constructor(){workers.push(this)}postMessage(){}terminate(){this.terminated=true}}
 const source=fs.readFileSync('app/analysis.js','utf8').split('/* ---------- drawing ---------- */')[0]+'})();';
 vm.runInNewContext(source,{window:{VZ},Worker,DOMException,Float32Array});return {VZ,workers};}
test('stopping title voice detection terminates the worker immediately',async()=>{
 const {VZ,workers}=setup(),controller=new AbortController();
 const pending=VZ.analyzeSamples(new Float32Array(100),8000,()=>{},{voiceOnly:true,signal:controller.signal});
 controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(workers[0].terminated,true);
});
test('already cancelled requests never create a worker',async()=>{
 const {VZ,workers}=setup(),controller=new AbortController();controller.abort();
 await assert.rejects(VZ.analyzeSamples(new Float32Array(100),8000,()=>{},{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(workers.length,0);
});

function mrSetup({fail=false,abortOnUrl,sampleLength=8000}={}) {
 const counts={mrFetch:0,decode:0,transfers:[]};
 const tracks=[{id:'mr',kind:'file',r2Key:'fake/mr'}];
 const window={VZ:{media:{src:async()=>({url:'take'})},song:()=>({mrTracks:tracks})},VzipR2:{enabled:()=>true,url:async()=>{abortOnUrl?.();return 'mr';}}};
 class OfflineAudioContext {decodeAudioData(bytes,ok){counts.decode++;ok({length:sampleLength,sampleRate:8000,numberOfChannels:1,getChannelData:()=>new Float32Array(sampleLength)});}}
 window.OfflineAudioContext=OfflineAudioContext;
 class Worker {postMessage(message,transfer){if(message.mrs){counts.transfers.push(message.mrs[0].samples.length);structuredClone(message,{transfer});}queueMicrotask(()=>this.onmessage({data:{result:{version:2,metrics:{voicedSeconds:0},confidence:{pitchConfidence:0}}}}));}terminate(){}}
 const source=fs.readFileSync('app/analysis.js','utf8').split('/* ---------- drawing ---------- */')[0]+'})();';
 vm.runInNewContext(source,{window,Worker,DOMException,Float32Array,fetch:async url=>{if(url==='mr')counts.mrFetch++;return {ok:!(fail&&url==='mr'),arrayBuffer:async()=>new ArrayBuffer(8)};}});
 return {VZ:window.VZ,counts,tracks};
}
test('a batch downloads and decodes each MR once; worker transfer does not detach the cached samples',async()=>{
 const {VZ,counts}=mrSetup(),mrCache=new Map();
 for(let i=0;i<2;i++)await VZ.analyzeRecording({id:String(i),songId:'song'},{save:false,mrCache});
 assert.equal(counts.mrFetch,1);assert.equal(counts.decode,3);assert.deepEqual(counts.transfers,[8000,8000]);
});
test('MR failures are not cached and replacement files get fresh samples',async()=>{
 const bad=mrSetup({fail:true}),mrCache=new Map();
 for(let i=0;i<2;i++)await bad.VZ.analyzeRecording({songId:'song'},{save:false,mrCache});
 assert.equal(bad.counts.mrFetch,2);assert.equal(mrCache.size,0);
 const good=mrSetup();await good.VZ.analyzeRecording({songId:'song'},{save:false,mrCache});
 good.tracks[0].r2Key='fake/replaced';await good.VZ.analyzeRecording({songId:'song'},{save:false,mrCache});
 assert.equal(good.counts.mrFetch,2);
});
test('stopping during MR URL lookup never downloads the MR or continues with more tracks',async()=>{
 const ctl=new AbortController(),{VZ,counts,tracks}=mrSetup({abortOnUrl:()=>ctl.abort()});
 tracks.push({id:'mr2',kind:'file',r2Key:'fake/mr2'});
 await assert.rejects(VZ.analyzeRecording({songId:'song'},{save:false,signal:ctl.signal}),e=>e.name==='AbortError');
 assert.equal(counts.mrFetch,0);
});
test('an MR error racing with cancellation stays aborted rather than returning a result to save',async()=>{
 const ctl=new AbortController(),{VZ}=mrSetup({abortOnUrl:()=>{ctl.abort();throw Error('URL lookup failed');}});
 await assert.rejects(VZ.analyzeRecording({songId:'song'},{save:false,signal:ctl.signal}),e=>e.name==='AbortError');
});
test('decoded MR reuse is bounded to 24 MiB, including several long MR files',async()=>{
 const {VZ,tracks}=mrSetup({sampleLength:2250000}),mrCache=new Map();
 tracks.push({id:'mr2',kind:'file',r2Key:'fake/mr2'},{id:'mr3',kind:'file',r2Key:'fake/mr3'});
 await VZ.analyzeRecording({songId:'song'},{save:false,mrCache});
 assert.equal(mrCache.size,2);assert.ok([...mrCache.values()].reduce((s,d)=>s+d.samples.byteLength,0)<=24*1024*1024);
});
