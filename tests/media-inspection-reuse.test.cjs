const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup({video=false,reusable=true,readable=true}={}){
 const state={workers:0,inspections:0,prepares:0};
 const metadata={created:1709251200000,recordedDate:'2024-03-01',dateSource:'metadata'};
 const window={addEventListener(){}};
 class Worker{
  constructor(){state.workers++;}
  postMessage(message){
   if(message.type!=='prepare')return;
   if(message.inspect)state.inspections++;else state.prepares++;
   queueMicrotask(()=>this.onmessage?.({data:{type:'done',metadata:structuredClone(metadata),inspect:{readable,hasAudio:true,hasVideo:video,reusableAudio:reusable,duration:31.2}}}));
  }
  terminate(){}
 }
 vm.runInNewContext(fs.readFileSync('media-import.js','utf8'),{window,Worker,WeakMap,structuredClone,URL,File,Blob,DOMException,crypto,setTimeout,clearTimeout,queueMicrotask,navigator:{},location:{href:'https://example.test/'},VzipMediaDates:{pick:()=>({recordedDate:'2020-01-01'})}});
 return {window,state,file:()=>new File(['original bytes'],'audio.m4a',{type:'audio/mp4',lastModified:1709251200000})};
}
test('confirmed audio reuses one inspection and the exact original File without another worker',async()=>{
 const f=setup(),file=f.file(),inspection=await f.window.vzipInspectMedia(file);
 inspection.metadata.recordedDate='1999-01-01';inspection.duration=999;
 const prepared=await f.window.vzipPrepareMedia(file);
 assert.equal(prepared.file,file);assert.equal(prepared.metadata.recordedDate,'2024-03-01');assert.equal(prepared.metadata.durationSeconds,31.2);
 assert.equal(f.state.workers,1);assert.equal(f.state.inspections,1);assert.equal(f.state.prepares,0);
 assert.equal(await prepared.file.text(),'original bytes');await prepared.dispose();
 const again=await f.window.vzipInspectMedia(file);assert.equal(again.duration,31.2);assert.equal(f.state.workers,1);
});
test('a different File with identical name and size never borrows another file inspection',async()=>{
 const f=setup();await f.window.vzipInspectMedia(f.file());await f.window.vzipPrepareMedia(f.file());
 assert.equal(f.state.workers,2);assert.equal(f.state.prepares,1);
});
test('video, unreadable input and eligible lossless compression always keep the full preparation path',async()=>{
 for(const config of [{video:true},{readable:false},{reusable:false}]){
  const f=setup(config),file=f.file();await f.window.vzipInspectMedia(file);await f.window.vzipPrepareMedia(file);
  assert.equal(f.state.prepares,1);
 }
});
test('pre-aborted inspection and preparation never start a worker, including a cached file',async()=>{
 const f=setup(),file=f.file(),signal=AbortSignal.abort();
 await assert.rejects(f.window.vzipInspectMedia(file,{signal}),{name:'AbortError'});assert.equal(f.state.workers,0);
 await f.window.vzipInspectMedia(file);
 await assert.rejects(f.window.vzipPrepareMedia(file,{signal}),{name:'AbortError'});assert.equal(f.state.workers,1);
});

test('audio in a video-labelled container still normalizes its output type through preparation',async()=>{
 const f=setup(),file=new File(['original bytes'],'container.mp4',{type:'video/mp4'});
 await f.window.vzipInspectMedia(file);await f.window.vzipPrepareMedia(file);
 assert.equal(f.state.prepares,1);
});
