const {test}=require('node:test'),assert=require('node:assert/strict'),{access,writeFile}=require('node:fs/promises'),{join}=require('node:path');
const api=()=>import('../worker/voice-path-separation-diagnosis.mjs');
test('dual mono materializes both channels and clamps PCM without mutating the source',async()=>{
 const {dualMonoWav}=await api(),x=new Float32Array([0,.5,2,-2]),copy=x.slice(),b=dualMonoWav(x,44100);assert.deepEqual(x,copy);assert.equal(b.readUInt16LE(22),2);assert.equal(b.length,60);for(let i=0;i<x.length;i++)assert.equal(b.readInt16LE(44+i*4),b.readInt16LE(46+i*4));assert.equal(b.readInt16LE(52),32767);assert.equal(b.readInt16LE(56),-32768);
});
test('private temporary signals are removed on success and on failure',async()=>{
 const {inTemporaryDirectory}=await api();let directory;
 assert.equal(await inTemporaryDirectory(async dir=>{directory=dir;await writeFile(join(dir,'private.wav'),'fake');return 7;}),7);await assert.rejects(access(directory));
 await assert.rejects(inTemporaryDirectory(async dir=>{directory=dir;await writeFile(join(dir,'private.wav'),'fake');throw Error('fake failure');}));await assert.rejects(access(directory));
});
test('observation returns numeric measurements only and never stores or returns audio',async()=>{
 const {observe}=await api(),SR=16000,x=Float32Array.from({length:SR*3},(_,i)=>.2*Math.sin(2*Math.PI*220*i/SR)),bytes=Buffer.from('fake source'),copy=Buffer.from(bytes);let input;
 const result=await observe(bytes,{decoder:async()=>x,separator:async path=>{input=path;await access(path);return Buffer.from('fake separated signal');}});
 assert.deepEqual(bytes,copy);assert.equal(result.status,'complete');assert.equal(result.originalBytes,11);assert.equal(result.seconds,3);assert.ok(result.confidence.meanStrength>.95);assert.ok(!JSON.stringify(result).includes('fake'));assert.ok(!JSON.stringify(result).includes('curve'));await assert.rejects(access(input));
});
