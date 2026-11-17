const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/mr-cancel.js'),Y=require('./helpers/mr-synth.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// A stationary, coloured instrumental bed has no shared drum attacks. The vocal's
// phrase attacks can win onset matching even though the exact reference is present.
function bed(seconds,seed=23){let slow=0;return Float32Array.from({length:seconds*Y.SR},()=>{seed=(seed*1664525+1013904223)>>>0;slow=.8*slow+.2*(seed/4294967296*2-1);return slow;});}
test('automatically locates the same MR across the whole file when onset candidates miss its start',()=>{
 const mr=bed(75),voice=Y.vocal(24).x,rec=Y.record(voice,mr,{offset:23.456,db:-12}),original=mr.slice(),before=rec.x.slice(),progress=[];
 assert.equal(C.coarse(rec.x,mr).candidates.some(c=>Math.abs(c.lag/Y.SR-23.456)<.5),false,'the old onset-only candidate search misses this source');
 const out=C.cancel(rec.x,mr,{onProgress:p=>progress.push(p)});
 assert.equal(out.ok,true,JSON.stringify(out));assert.ok(Math.abs(out.report.offsetSeconds-23.456)<.005,JSON.stringify(out.report));
 let error=0,mrEnergy=0;for(let i=0;i<voice.length;i++){error+=(out.voice[i]-voice[i])**2;mrEnergy+=rec.mrPart[i]**2;}
 assert.ok(10*Math.log10(mrEnergy/error)>10,'known-reference suppression must improve the signal');
 assert.deepEqual(rec.x,before);assert.deepEqual(mr,original);assert.equal(out.voice.length,rec.x.length);
 assert.equal(progress[0],0);assert.equal(progress.at(-1),1);assert.ok(progress.every((p,i)=>p>=0&&p<=1&&(!i||p>=progress[i-1])));
});
test('global start search covers later MR blocks and keeps FFT memory bounded',()=>{
 let largest=0,allocated=0;class Counted extends Float64Array{static get [Symbol.species](){return Float64Array;}constructor(n){super(n);largest=Math.max(largest,this.length);allocated+=this.byteLength;}}
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../app/mr-cancel.js'),'utf8'),{module,Float64Array:Counted});
 const mr=bed(210),rec=Y.record(Y.vocal(24).x,mr,{offset:165.432,db:-12});
 const proposed=module.exports.waveformCandidates(rec.x,mr);
 assert.ok(proposed.some(c=>Math.abs(c.lag/Y.SR-165.432)<.01),'search must include the MR beyond its first two minutes');
 assert.ok(largest<=65536,'bounded FFT window: '+largest);assert.ok(allocated<3*1024*1024,'reuse FFT buffers across MR blocks: '+allocated);
});
test('global proposals cannot turn a different reference, a solo voice, or silence into a subtraction',()=>{
 const mr=bed(75),voice=Y.vocal(24).x,rec=Y.record(voice,mr,{offset:23.456,db:-12});
 for(const [record,reference] of [[rec.x,bed(75,99)],[voice,mr],[new Float32Array(voice.length),mr]]){
  const before=record.slice(),original=reference.slice(),out=C.cancel(record,reference);
  assert.equal(out.ok,false);assert.equal(out.voice,undefined);assert.deepEqual(record,before);assert.deepEqual(reference,original);
 }
});
test('shared rhythm and chord passages in a different arrangement are not enough to identify the MR',()=>{
 const original=Y.mr(70),other=Y.mr(70,99),rec=Y.record(Y.vocal(40).x,original,{offset:3.2,db:3});
 const out=C.cancel(rec.x,other);assert.equal(out.ok,false,JSON.stringify(out.report));assert.equal(out.voice,undefined);
});
test('a recording that begins before the MR keeps its original duration and locates a negative start offset',()=>{
 const mr=bed(75),voice=Y.vocal(40).x,padded=new Float32Array(mr.length+15*Y.SR);padded.set(mr,15*Y.SR);
 const rec=Y.record(voice,padded,{offset:0,db:-12}),before=rec.x.slice(),out=C.cancel(rec.x,mr);
 assert.equal(out.ok,true,JSON.stringify(out));assert.ok(Math.abs(out.report.offsetSeconds+15)<.005);assert.equal(out.voice.length,rec.x.length);assert.deepEqual(rec.x,before);
});
test('the actual comparison worker uses automatic waveform start search without asking for an interval',()=>{
 const messages=[],context=vm.createContext({performance,Float32Array,Float64Array,Int16Array,Int32Array,Uint8Array,Uint32Array,Math,Date});
 context.self=context;context.postMessage=m=>messages.push(m);
 context.importScripts=(...urls)=>{for(const url of urls)vm.runInContext(fs.readFileSync(path.join(__dirname,'../app',url.split('?')[0]),'utf8'),context);};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/voice-path-worker.js'),'utf8'),context);
 const mr=bed(75),rec=Y.record(Y.vocal(24).x,mr,{offset:23.456,db:-12});
 context.onmessage({data:{start:{rate:Y.SR,keep8k:true}}});context.onmessage({data:{block:[rec.x]}});context.onmessage({data:{end:{mrs:[{key:'synthetic-reference',samples:mr.slice()}]}}});
 const done=messages.find(m=>m.done)?.done;assert.ok(done,JSON.stringify(messages.filter(m=>m.error)));assert.equal(done.tries[0].ok,true);assert.ok(done.removed);assert.ok(Math.abs(done.removed.report.offsetSeconds-23.456)<.01);
});
