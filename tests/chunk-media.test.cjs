const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const core=require('../chunk-media-core.js');
const MiB=1024*1024;
function item(size=201*MiB){
 return {storageVersion:2,size,type:'video/mp4',parts:Array.from({length:Math.ceil(size/core.PART_SIZE)},(_,i)=>({path:'owner/id/'+i,size:Math.min(core.PART_SIZE,size-i*core.PART_SIZE)}))};
}
function origin(part,start,end,signal){
 const offset=Number(part.path.split('/').at(-1))*core.PART_SIZE;
 let next=start;
 return new Response(new ReadableStream({
  pull(controller){if(signal.aborted){controller.error(Error('aborted'));return}
   if(next>end){controller.close();return}
   const count=Math.min(64*1024,end-next+1);
   // Reproducible original bytes, changing at 64KiB boundaries.
   const bytes=new Uint8Array(count).fill(Math.floor((offset+next)/(64*1024))%251);next+=count;controller.enqueue(bytes);
  }
 }),{status:206,headers:{'Content-Range':'bytes '+start+'-'+end+'/'+part.size}});
}
test('201MiB streams byte-for-byte with bounded output and no assembled original',async()=>{
 const data=item(),response=core.response(data,new Request('https://test/file'),async(...args)=>origin(...args));
 assert.equal(response.status,200);assert.equal(+response.headers.get('content-length'),data.size);
 const hash=createHash('sha256'),expected=createHash('sha256');let total=0;
 for await(const bytes of response.body){assert.ok(bytes.length<=65536);total+=bytes.length;hash.update(bytes)}
 for(let offset=0;offset<data.size;offset+=65536)expected.update(Buffer.alloc(Math.min(65536,data.size-offset),Math.floor(offset/65536)%251));
 assert.equal(total,data.size);assert.equal(hash.digest('hex'),expected.digest('hex'));
});
test('cross-object seek, suffix, HEAD, invalid/multiple and open-ended ranges',async()=>{
 const data=item();const requested=[];
 const fetch=async(part,start,end,signal)=>{requested.push([part.path,start,end]);return origin(part,start,end,signal)};
 const start=core.PART_SIZE-2,end=core.PART_SIZE+2;
 const response=core.response(data,new Request('https://test/file',{headers:{range:'bytes='+start+'-'+end}}),fetch);
 assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes '+start+'-'+end+'/'+data.size);
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[132,132,133,133,133]);
 assert.equal(requested.length,2);
 assert.deepEqual(core.range('bytes=-3',data.size),{start:data.size-3,end:data.size-1,status:206});
 assert.equal(core.range('bytes=2-',data.size).end,data.size-1);
 for(const value of ['bytes=2-1','bytes=9999999999-','bytes=-0','bytes=1-2,4-5','garbage'])assert.equal(core.range(value,data.size),null);
 requested.length=0;
 const head=core.response(data,new Request('https://test/file',{method:'HEAD',headers:{range:'bytes=0-1'}}),fetch);
 assert.equal(head.status,206);assert.equal(head.body,null);assert.equal(requested.length,0);
 const bad=core.response(data,new Request('https://test/file',{headers:{range:'bytes=9999999999-'}}),fetch);
 assert.equal(bad.status,416);assert.equal(bad.headers.get('content-range'),'bytes */'+data.size);
});
test('cancellation aborts upstream and missing, truncated or wrong ranges fail',async()=>{
 const data=item();let signal;
 const response=core.response(data,new Request('https://test/file'),async(part,start,end,s)=>{signal=s;return origin(part,start,end,s)});
 const reader=response.body.getReader();await reader.read();await reader.cancel();assert.ok(signal.aborted);
 for(const responseFactory of [
  ()=>new Response(null,{status:404}),
  ()=>new Response(new Uint8Array(1),{status:200}),
  ()=>new Response(new Uint8Array(10),{status:206,headers:{'Content-Range':'bytes 5-14/100'}})
 ]){
  const result=core.response(data,new Request('https://test/file'),async()=>responseFactory());
  await assert.rejects(async()=>{for await(const bytes of result.body){}});
 }
});
test('range-ignoring storage still streams the requested slice and rejects malformed manifests',async()=>{
 const data=item(10);
 const result=core.response(data,new Request('https://test/file',{headers:{range:'bytes=3-6'}}),async()=>new Response(new Uint8Array([0,1,2,3,4,5,6,7,8,9])));
 assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[3,4,5,6]);
 assert.throws(()=>core.validate({...data,size:11}));
 assert.throws(()=>core.validate({...data,parts:[{path:'x',size:core.PART_SIZE+1}]}));
});
