const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{getEventListeners}=require('node:events');
function setup({seconds=292,channels=1}={}){
 const data=new Float32Array(seconds*16000);for(let i=0;i<data.length;i++)data[i]=(i%997)/997;
 const state={reads:0,decoded:0,saved:[],messages:[],signals:[]},Store={cached:async()=>null,append:async r=>state.saved.push(r)};
 const V={media:{src:async()=>({url:'fake'}),dateOf:()=> '2026-11-01'},db:{original:'kept'}};
 const L={recordingSource:()=>async()=>({url:'fake'}),read:async()=>{state.reads++;return new ArrayBuffer(8);}};
 class Context{decodeAudioData(){state.decoded++;return Promise.resolve({duration:seconds,sampleRate:16000,numberOfChannels:channels,length:data.length,getChannelData:()=>data});}}
 class Controller extends AbortController{constructor(){super();state.signals.push(this.signal);}}
 class Worker{postMessage(m){state.listenersAtWorker=getEventListeners(state.signals[0],'abort').length;state.messages.push(m);queueMicrotask(()=>this.onmessage({data:{result:{frames:[],metrics:{},scope:m.options.scope}}}));}terminate(){}}
 const window={VZ:V,VzipPrecisionStore:Store,VzipAudioFile:L,OfflineAudioContext:Context,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('app/precision-analysis.js','utf8'),{window,crypto:webcrypto,Worker,TextEncoder,DOMException,AbortController:Controller,setTimeout,clearTimeout,fetch:async()=>({ok:true,headers:{get:()=>0},arrayBuffer:async()=>new ArrayBuffer(8)})});
 return {V,state,data};
}
test('a five-minute recording sends only the selected two seconds to precision analysis and preserves original metadata',async()=>{
 const {V,state,data}=setup(),item={id:'synthetic-long',durationSeconds:292,analysis:{v:2,history:[{v:1}]}};
 const before=JSON.stringify(item),sample=data[120*16000];
 const result=await V.precisionAnalyze(item,{start:120,end:122});
 assert.equal(state.messages[0].samples.length,32000);assert.equal(state.messages[0].samples[0],sample);
 assert.equal(result.scope.start,120);assert.equal(result.scope.end,122);assert.equal(state.saved.length,1);
 assert.equal(JSON.stringify(item),before);assert.equal(data[120*16000],sample);
});
test('a long recording requires an explicit short interval before any download',async()=>{
 const {V,state}=setup();await assert.rejects(V.precisionAnalyze({id:'long',durationSeconds:292}),/60초/);assert.equal(state.reads,0);
});
test('large metadata and invalid intervals fail without reading or saving',async()=>{
 for(const options of [{durationSeconds:601,start:0,end:2},{durationSeconds:292,start:0,end:61},{durationSeconds:292,start:NaN,end:2}]){
  const {V,state}=setup();await assert.rejects(V.precisionAnalyze({id:'bad',durationSeconds:options.durationSeconds},options));
  assert.equal(state.reads,0);assert.equal(state.saved.length,0);
 }
});
test('actual source duration and channel bounds are checked even when metadata is incorrect',async()=>{
 for(const options of [{seconds:601},{seconds:20,channels:6}]){
  const {V,state}=setup(options);await assert.rejects(V.precisionAnalyze({id:'bad',durationSeconds:20},{start:0,end:2}));
  assert.equal(state.messages.length,0);assert.equal(state.saved.length,0);
 }
});

test('completed file and decoder waits release abort listeners before worker computation',async()=>{
 const {V,state}=setup();await V.precisionAnalyze({id:'long',durationSeconds:292},{start:120,end:122});
 assert.equal(state.listenersAtWorker,1,'only the active worker should retain its abort listener');
 assert.equal(getEventListeners(state.signals[0],'abort').length,0);
});
