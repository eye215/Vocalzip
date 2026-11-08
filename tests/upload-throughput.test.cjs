const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const source=fs.readFileSync('r2-storage.js','utf8');
function environment(code,{delay=80,failPart=0,reverse=false}={}){
 const calls=[],progress=[],state={active:0,peak:0,bytes:0,peakBytes:0,completed:false,aborted:false};
 const storage={getItem:()=>null,setItem(){},removeItem(){}};
 const window={localStorage:storage,VZIP_R2_ENDPOINT:'https://r2.test',vzipCloudSignedIn:()=>true,vzipCloudAccessToken:async()=>'test-token',addEventListener(){}};
 const context={window,Blob,URL,DOMException,AbortController,AbortSignal,setTimeout,clearTimeout,location:{href:'https://app.test'},fetch:async(url,init)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==='/v1/uploads')return Response.json({key:'u/test/test/original.wav',uploadId:'up',partSize:8*1024*1024});
  const match=path.match(/\/parts\/(\d+)$/);
  if(match){
   const n=Number(match[1]),size=init.body.byteLength;state.active++;state.bytes+=size;state.peak=Math.max(state.peak,state.active);state.peakBytes=Math.max(state.peakBytes,state.bytes);
   try{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,delay*(reverse?(5-n):1));init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('cancel','AbortError'));},{once:true});});if(n===failPart)return Response.json({error:'login ended'},{status:401});return Response.json({partNumber:n,etag:'part-'+n});}
   finally{state.active--;state.bytes-=size;}
  }
  if(path.endsWith('/complete')){const parts=JSON.parse(init.body).parts;assert.deepEqual(parts.map(p=>p.partNumber),[1,2,3,4]);assert.equal(state.active,0);state.completed=true;return Response.json({key:'u/test/test/original.wav',size:32*1024*1024,etag:'"complete"'});}
  if(init.method==='DELETE'){assert.equal(state.active,0);state.aborted=true;return Response.json({ok:true});}
  throw Error('unexpected request '+path);
 }};
 vm.runInNewContext(code,context);
 return {api:window.VzipR2,calls,progress,state,run:opts=>window.VzipR2.upload(new File([new Uint8Array(32*1024*1024)],'test.wav',{type:'audio/wav'}),{mediaId:'test',onProgress:value=>progress.push(value),...opts})};
}
test('at most two 8MiB parts are sent concurrently; completion waits and progress is monotonic',async()=>{
 const f=environment(source);await f.run();assert.equal(f.state.peak,2);assert.ok(f.state.peakBytes<=16*1024*1024);assert.equal(f.state.completed,true);
 assert.equal(f.progress.at(-1),100);assert.ok(f.progress.every((n,i)=>i===0||n>=f.progress[i-1]));
});
test('out-of-order replies still produce the correct ordered multipart manifest',async()=>{
 const f=environment(source,{delay:20,reverse:true});await f.run();assert.equal(f.state.completed,true);
});
test('an authentication failure cancels the other sender and never completes the upload',async()=>{
 const f=environment(source,{failPart:1});await assert.rejects(f.run(),error=>error.status===401);
 await new Promise(r=>setTimeout(r,0));assert.equal(f.state.completed,false);assert.equal(f.state.active,0);assert.equal(f.state.aborted,true);
});
test('user cancellation aborts all active requests before multipart cleanup',async()=>{
 const controller=new AbortController(),f=environment(source,{delay:200});setTimeout(()=>controller.abort(),60);
 await assert.rejects(f.run({signal:controller.signal}),{name:'AbortError'});await new Promise(r=>setTimeout(r,0));
 assert.equal(f.state.active,0);assert.equal(f.state.completed,false);assert.equal(f.state.aborted,true);
});
test('progress observers cannot prevent a successfully uploaded file from being saved',async()=>{
 const f=environment(source);await f.run({onProgress:()=>{throw Error('screen changed');}});assert.equal(f.state.completed,true);
});
test('compare unchanged serial baseline with bounded parallel transfer under identical network latency',async t=>{
 const base=process.env.VZIP_BENCH_BASE;if(!base){t.skip('baseline commit not requested');return;}assert.match(base,/^[0-9a-f]{40}$/);
 const baseline=execFileSync('git',['show',base+':r2-storage.js'],{encoding:'utf8'});
 const old=environment(baseline),fresh=environment(source);
 const start=performance.now();await old.run();const serialMs=performance.now()-start;
 const now=performance.now();await fresh.run();const parallelMs=performance.now()-now;
 assert.equal(old.state.peak,1);assert.equal(fresh.state.peak,2);
 console.log(JSON.stringify({benchmark:'4x8MiB,80ms per request; simulated network',serialMs:Math.round(serialMs),parallelMs:Math.round(parallelMs)}));
});
