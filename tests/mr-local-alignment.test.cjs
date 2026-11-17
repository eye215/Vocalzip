const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/mr-cancel.js'),Y=require('./helpers/mr-synth.cjs'),{driftRecording}=require('./helpers/mr-drift.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const mr=Y.mr(65),voice=Y.vocal(30).x;
const quality=(out,voice,mrPart)=>{
 let error=0,energy=0,cross=0,mrEnergy=0;
 for(let i=0;i<voice.length;i++){error+=(out[i]-voice[i])**2;energy+=voice[i]**2;cross+=out[i]*voice[i];mrEnergy+=mrPart?.[i]**2||0;}
 return {suppression:10*Math.log10(mrEnergy/error),voiceSER:10*Math.log10(energy/error),levelDb:20*Math.log10(cross/energy)};
};
test('nonlinear delay is followed rather than accepting a loose global line',()=>{
 for(const db of[6,-6]){
  const rec=driftRecording(voice,mr,{db}),before=rec.x.slice(),original=mr.slice(),progress=[];
  const out=C.cancel(rec.x,mr,{onProgress:p=>progress.push(p)});
  assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.report.method,'local');
  assert.ok(out.report.coverage>=.95);assert.ok(out.report.localWindows>=40);
  const q=quality(out.voice,voice,rec.mrPart);
  assert.ok(q.suppression>=(db>0?14:10),JSON.stringify(q));assert.ok(Math.abs(q.levelDb)<.2,JSON.stringify(q));
  assert.deepEqual(rec.x,before);assert.deepEqual(mr,original);
  assert.equal(progress[0],0);assert.equal(progress.at(-1),1);
  assert.ok(progress.every((p,i)=>p>=0&&p<=1&&(!i||p>=progress[i-1])));
 }
});
test('held-out transfer preserves an injected vocal independently of residual MR',()=>{
 const rec=driftRecording(voice,mr),track=C.localTrack(rec.x,mr,{lag:5*Y.SR,ratio:1});assert.ok(track);
 // With no nonlinear residual mask this operator is linear in the recording. Feeding only
 // the known voice isolates vocal alteration from any MR left in the mixed result.
 const out=C.subtract(voice,track.heard,()=>{},{transferRadius:C.RULES.transferRadius,excludeCurrent:true,residual:0});
 track.blend(out.voice);const q=quality(out.voice,voice);
 assert.ok(q.voiceSER>=18.5,JSON.stringify(q));assert.ok(Math.abs(q.levelDb)<.15,JSON.stringify(q));
});
test('a long unsupported voice-only stretch is left as recorded',()=>{
 const v=Y.vocal(40).x,rec=driftRecording(v,mr,{gap:[15,21]}),track=C.localTrack(rec.x,mr,{lag:5*Y.SR,ratio:1});
 assert.ok(track,'fixture retains enough reliable coverage to exercise the protected gap');
 const out=C.subtract(rec.x,track.heard,()=>{},{transferRadius:C.RULES.transferRadius,excludeCurrent:true,residual:0});
 track.blend(out.voice);
 assert.deepEqual(out.voice.subarray(17*Y.SR,19*Y.SR),rec.x.subarray(17*Y.SR,19*Y.SR));
});
test('same rhythm with a different waveform, solo voice, silence and short audio fail closed',()=>{
 const rec=driftRecording(voice,mr),other=Y.mr(65,5).map((_,i,a)=>a[i*7%a.length]);
 for(const [x,reference]of[[rec.x,other],[voice,mr],[new Float32Array(30*Y.SR),mr],[voice.subarray(0,Y.SR),mr]]){
  const before=x.slice(),original=reference.slice(),out=C.cancel(x,reference);
  assert.equal(out.ok,false);assert.equal(out.voice,undefined);assert.deepEqual(x,before);assert.deepEqual(reference,original);
 }
});
test('actual comparison worker passes a local quiet-MR result through to analysis',()=>{
 const messages=[],context=vm.createContext({performance,Float32Array,Float64Array,Int16Array,Int32Array,Uint8Array,Uint32Array,Math,Date});
 context.self=context;context.postMessage=m=>messages.push(m);
 context.importScripts=(...urls)=>{for(const url of urls)vm.runInContext(fs.readFileSync(path.join(__dirname,'../app',url.split('?')[0]),'utf8'),context);};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/voice-path-worker.js'),'utf8'),context);
 const rec=driftRecording(voice,mr);
 context.onmessage({data:{start:{rate:Y.SR,keep8k:true}}});context.onmessage({data:{block:[rec.x]}});
 context.onmessage({data:{end:{mrs:[{key:'synthetic',samples:mr.slice()}]}}});
 const done=messages.find(m=>m.done)?.done;assert.ok(done,JSON.stringify(messages.filter(m=>m.error)));
 assert.equal(done.tries[0].ok,true);assert.ok(done.removed);assert.ok(done.removed.report.removedDb<3);
});
test('three-minute held-out transfer keeps spectra bounded and reports monotonic progress',()=>{
 let max=0,bytes=0;class Counted extends Float64Array{static get [Symbol.species](){return Float64Array;}constructor(n){super(n);max=Math.max(max,this.length);bytes+=this.byteLength;}}
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../app/mr-cancel.js'),'utf8'),{module,Float64Array:Counted,Math});
 const n=180*Y.SR,reference=Float32Array.from({length:n},(_,i)=>Math.sin(i*.17)),rec=Float32Array.from(reference,x=>x*.5),progress=[];
 const out=module.exports.subtract(rec,reference,p=>progress.push(p),{transferRadius:16,excludeCurrent:true,residual:0});
 assert.equal(out.voice.length,n);assert.ok(max<=512,'no full-take Float64 spectra');assert.ok(bytes<14*1024*1024,'allocation budget '+bytes);
 assert.equal(progress.at(-1),1);assert.ok(progress.every((p,i)=>!i||p>=progress[i-1]));
});
