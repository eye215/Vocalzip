const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),P=require('../audio-packet-proof.js');
const packets=()=>Array.from({length:7},(_,i)=>({data:new Uint8Array(Array.from({length:19+i},(_,j)=>(i*31+j)%256)),timestamp:i*0.02,duration:0.02}));
async function proof(items,options={blockSize:32}){const p=P.create(options);for(const x of items)await p.add(x);return p.finish();}
test('bounded streaming hashes match independent Node SHA-256 across packet and block boundaries',async()=>{
 const items=packets(),out=await proof(items),bytes=Buffer.concat(items.map(p=>Buffer.from(p.data)));
 assert.equal(out.bytes,bytes.length);assert.equal(out.packets,items.length);
 const expected=[];for(let i=0;i<bytes.length;i+=32)expected.push(createHash('sha256').update(bytes.subarray(i,i+32)).digest('hex'));
 assert.deepEqual(out.hashes,expected);assert.ok(P.same(out,await proof(items),48000));
});
test('any changed byte, missing or reordered packet fails verification',async()=>{
 const items=packets(),original=await proof(items);
 const changed=structuredClone(items);changed[3].data[4]^=1;
 assert.equal(P.same(original,await proof(changed),48000),false);
 assert.equal(P.same(original,await proof(items.slice(1)),48000),false);
 const reordered=items.slice();[reordered[2],reordered[3]]=[reordered[3],reordered[2]];
 assert.equal(P.same(original,await proof(reordered),48000),false);
});
test('packet boundaries and timestamps are checked even when all concatenated bytes match',async()=>{
 const items=packets(),original=await proof(items),changed=structuredClone(items);
 const bytes=new Uint8Array([...changed[0].data,...changed[1].data]);changed[0].data=bytes.slice(0,20);changed[1].data=bytes.slice(20);
 const split=await proof(changed);assert.deepEqual(split.hashes,original.hashes);assert.equal(P.same(original,split,48000),false);
 const timed=structuredClone(items);timed[2].timestamp+=0.005;assert.equal(P.same(original,await proof(timed),48000),false);
 const muxed=structuredClone(items);muxed[2].timestamp+=1/48000;muxed[2].duration+=1/48000;
 assert.equal(P.same(original,await proof(muxed),48000),true);
});
test('proof budget exhaustion returns null for the required exact-packet fallback',async()=>{
 const p=P.create({maxPackets:2,blockSize:32});for(const item of packets())await p.add(item);
 assert.equal(await p.finish(),null);
 assert.equal(P.same(null,await proof(packets()),48000),false);
});
test('unavailable hashing returns null rather than claiming verification',async()=>{
 const p=P.create({blockSize:32,hash:async()=>{throw Error('crypto unavailable');}});
 for(const item of packets())await p.add(item);assert.equal(await p.finish(),null);
});
test('final partial block failures also require fallback and sealed proofs reject new data',async()=>{
 const p=P.create({blockSize:1024,hash:async()=> 'invalid'});
 await p.add(packets()[0]);assert.equal(await p.finish(),null);await assert.rejects(p.add(packets()[0]),/sealed/);
 assert.throws(()=>P.create({maxPackets:65537}),/limits/);assert.throws(()=>P.create({blockSize:1048577}),/limits/);
});
test('zero payloads, invalid rates and corrupted digest lists can never authorize saving',async()=>{
 const empty=await proof([]),valid=await proof(packets());assert.equal(P.same(empty,empty,48000),false);
 assert.equal(P.same(valid,valid,0),false);assert.equal(P.same(valid,{...valid,hashes:[]},48000),false);
});
