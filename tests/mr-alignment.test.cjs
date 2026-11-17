// Same source MR, different recording start/level. Synthetic audio only; no user media.
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/mr-cancel.js'),Y=require('./helpers/mr-synth.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const mr=Y.mr(60);
const suppression=(out,voice,record)=>{
 let error=0;for(let i=0;i<voice.length;i++)error+=(out[i]-voice[i])**2;
 return 20*Math.log10(Y.rms(record.mrPart)/Math.sqrt(error/voice.length));
};

test('the same MR is aligned when recording begins ten seconds before playback',()=>{
 const voice=Y.vocal(20).x,delayed=new Float32Array(mr.length+10*Y.SR);delayed.set(mr,10*Y.SR);
 const record=Y.record(voice,delayed,{offset:0,db:6}),before=record.x.slice(),original=mr.slice();
 const out=C.cancel(record.x,mr);
 assert.equal(out.ok,true,JSON.stringify(out));
 assert.ok(Math.abs(out.report.offsetSeconds+10)<=.002,JSON.stringify(out.report));
 assert.ok(suppression(out.voice,voice,record)>=15,'MR suppression '+suppression(out.voice,voice,record));
 assert.deepEqual(record.x,before);assert.deepEqual(mr,original);
});

test('a correctly aligned MR below the singer is removed without requiring a 3 dB drop of the whole mix',()=>{
 const voice=Y.vocal(30).x,record=Y.record(voice,mr,{offset:17.234,db:-6}),out=C.cancel(record.x,mr);
 assert.equal(out.ok,true,JSON.stringify(out));
 assert.ok(Math.abs(out.report.offsetSeconds-17.234)<=.002,JSON.stringify(out.report));
 assert.ok(out.report.removedDb<3,'the MR is quieter than the singer');
 assert.ok(suppression(out.voice,voice,record)>=12,'MR suppression '+suppression(out.voice,voice,record));
});

test('the real voice-path worker keeps a verified quiet-MR removal rather than discarding it at 3 dB',()=>{
 const messages=[],context=vm.createContext({performance,Float32Array,Float64Array,Int16Array,Int32Array,Uint8Array,Uint32Array,Math,Date});
 context.self=context;context.postMessage=m=>messages.push(m);
 context.importScripts=(...urls)=>{for(const url of urls)vm.runInContext(fs.readFileSync(path.join(__dirname,'../app',url.split('?')[0]),'utf8'),context);};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/voice-path-worker.js'),'utf8'),context);
 const record=Y.record(Y.vocal(30).x,mr,{offset:17.234,db:-6});
 context.onmessage({data:{start:{rate:Y.SR,keep8k:true}}});
 context.onmessage({data:{block:[record.x]}});
 context.onmessage({data:{end:{mrs:[{key:'fake-mr',samples:mr.slice()}]}}});
 const result=messages.find(m=>m.done)?.done;
 assert.ok(result,'worker completed without error: '+JSON.stringify(messages.filter(m=>m.error)));
 assert.ok(result.removed,'verified subtraction must reach the actual comparison screen');
 assert.equal(result.tries[0].ok,true);assert.ok(result.removed.report.removedDb<3);
});

test('a matching rhythm without matching waveform, an unrelated file and voice alone are not subtracted',()=>{
 const voice=Y.vocal(30).x,record=Y.record(voice,mr,{offset:17.234,db:-6}),other=Y.mr(60,5);
 for(const [samples,reference] of [[record.x,other],[record.x,other.map((_,i,a)=>a[i*7%a.length])],[voice,mr],[new Float32Array(30*Y.SR),mr]]){
  const before=samples.slice(),ref=reference.slice(),out=C.cancel(samples,reference);
  assert.equal(out.ok,false);assert.equal(out.voice,undefined);
  assert.deepEqual(samples,before);assert.deepEqual(reference,ref);
 }
});

test('quiet-MR subtraction preserves the singer and reports monotonic progress',()=>{
 const voice=Y.vocal(30).x,record=Y.record(voice,mr,{offset:17.234,db:-9}),progress=[];
 const out=C.cancel(record.x,mr,{onProgress:p=>progress.push(p)});
 assert.equal(out.ok,true);assert.equal(out.report.alignmentVerified,true);
 let error=0,energy=0,cross=0;
 for(let i=0;i<voice.length;i++){error+=(out.voice[i]-voice[i])**2;energy+=voice[i]**2;cross+=out.voice[i]*voice[i];}
 assert.ok(10*Math.log10(energy/error)>=20,'vocal signal-to-error ratio must be at least 20 dB');
 assert.ok(Math.abs(20*Math.log10(cross/energy))<.5,'the singer must not be fitted away with the MR');
 assert.equal(progress.at(-1),1);assert.ok(progress.every((p,i)=>p>=0&&p<=1&&(!i||p>=progress[i-1])));
});

test('the shared room-response pass keeps three-minute work buffers bounded',()=>{
 let bytes=0,max=0;
 class Counted extends Float64Array{
  static get [Symbol.species](){return Float64Array;}
  constructor(n){super(n);bytes+=this.byteLength;max=Math.max(max,this.length);}
 }
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../app/mr-cancel.js'),'utf8'),{module,Float64Array:Counted});
 const n=180*Y.SR,reference=Float32Array.from({length:n},(_,i)=>(i%137)/137-.5),record=Float32Array.from(reference,x=>x*.5);
 const out=module.exports.subtract(record,reference,()=>{},{sharedTransfer:true});
 assert.equal(out.voice.length,n);assert.ok(max<=512,'no full-take Float64 spectrum');
 assert.ok(bytes<12*1024*1024,'bounded allocation budget: '+bytes);
});

test('failed MR alignment retains the candidate timing and verification numbers for diagnosis',()=>{
 const recording=Y.record(Y.vocal(30).x,mr,{offset:17.234,db:-6});
 const out=C.cancel(recording.x,Y.mr(60,5));
 assert.equal(out.ok,false);assert.ok(out.alignment,'a failed attempt must not lose all timing evidence');
 assert.equal(typeof out.alignment.score,'number');assert.equal(typeof out.alignment.windows,'number');
 for(const field of ['offsetSeconds','speed','phasePeak','errorSamples'])assert.ok(Object.hasOwn(out.alignment,field),field);
});

test('exported failed-alignment diagnostics whitelist numbers and fixed stages without identifiers',()=>{
 const P=require('../app/voice-path-model.js'),result=P.analyze(Y.vocal(12).x,Y.SR);
 const row={role:'base',result,clean:{clean:false,why:'accompaniment-heard'},source:'mixed',mrTries:[{
  ok:false,reason:'no-match',removedDb:.5,alignment:{stage:'validation',score:.8,offsetSeconds:2.5,speed:1,windows:5,phasePeak:.1,errorSamples:12,key:'SECRET',url:'SECRET',audio:'SECRET'}
 }]};
 const d=P.diagnosis([row]);
 assert.deepEqual(d.takes[0].mrTries[0].alignment,{stage:'validation',score:.8,offsetSeconds:2.5,speed:1,windows:5,phasePeak:.1,errorSamples:12});
 assert.ok(!JSON.stringify(d).includes('SECRET'));
 row.mrTries[0].alignment={stage:'SECRET',score:'SECRET',offsetSeconds:'SECRET'};
 const invalid=P.diagnosis([row]).takes[0].mrTries[0].alignment;
 assert.equal(invalid.stage,'unknown');assert.equal(invalid.score,null);assert.equal(invalid.offsetSeconds,null);
});
