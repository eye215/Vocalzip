const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const calls=[];const storage={getItem:()=>null,setItem(){},removeItem(){}};
 const window={localStorage:storage,VZIP_R2_ENDPOINT:'https://fake.invalid',vzipCloudAccessToken:async()=>'fake-test-token',addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('r2-storage.js','utf8'),{window,Blob,DOMException,URL,setTimeout,clearTimeout,fetch:async(url,init)=>{
  calls.push({url,init});return {ok:true,status:200,json:async()=>({url:'https://fake.invalid/audio-'+calls.length,expires:Math.floor(Date.now()/1000)+10800})};
 }});return {R:window.VzipR2,calls};
}
test('a retry renews a cached signed URL and passes through the analysis abort signal',async()=>{
 const {R,calls}=setup(),ctl=new AbortController();
 const first=await R.url('fake/mr');assert.equal(await R.url('fake/mr'),first);assert.equal(calls.length,1);
 const next=await R.url('fake/mr',{signal:ctl.signal,refresh:true});
 assert.notEqual(next,first);assert.equal(calls.length,2);assert.equal(calls[1].init.signal,ctl.signal);
});
test('an already cancelled analysis never starts signing',async()=>{
 const {R,calls}=setup(),ctl=new AbortController();ctl.abort();
 await assert.rejects(R.url('fake/mr',{signal:ctl.signal}),e=>e.name==='AbortError');assert.equal(calls.length,0);
});
