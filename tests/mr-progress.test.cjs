const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/mr-cancel.js'),Y=require('./helpers/mr-synth.cjs');
const fs=require('node:fs'),vm=require('node:vm');

test('streamed subtraction keeps the former output at frame/block boundaries and the final padded tail',()=>{
 // Values captured from the whole-take implementation at main 0b96adb; synthetic noise, no audio files.
 for(const f of require('./helpers/mr-subtract-reference.json')){
  let seed=7;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296-.5;};
  const mr=Float32Array.from({length:f.n},next),rec=Float32Array.from(mr,v=>v*.7+next()*.15),r=C.subtract(rec,mr);
  assert.equal(r.voice.length,f.n);
  for(const key of ['removedDb','mrShareDb'])if(f[key]>100)assert.ok(r[key]>100);else assert.equal(r[key],f[key]);
  for(const [i,v]of f.samples)assert.ok(Math.abs(r.voice[i]-v)<1e-7,`length ${f.n}, sample ${i}`);
 }
});
test('a three-minute subtraction never allocates a full-take Float64 spectrum or overlap-add buffer',()=>{
 let bytes=0,max=0;
 class Counted extends Float64Array{static get [Symbol.species](){return Float64Array;}constructor(n){super(n);bytes+=this.byteLength;max=Math.max(max,this.length);}}
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../app/mr-cancel.js'),'utf8'),{module,Float64Array:Counted});
 const n=8000*180,mr=Float32Array.from({length:n},(_,i)=>(i%137)/137-.5),take=Float32Array.from(mr,v=>v*.8);
 const r=module.exports.subtract(take,mr);
 assert.equal(r.voice.length,n);assert.ok(max<=512,`largest Float64 array: ${max}`);
 assert.ok(bytes<8*1024*1024,`working allocations: ${bytes}`);
});
test('MR cancellation reports real monotonic progress during alignment and subtraction',()=>{
 const mr=Y.mr(45),take=Y.record(Y.vocal(20).x,mr,{offset:5,db:8}).x,progress=[];
 const result=C.cancel(take,mr,{onProgress:p=>progress.push(p)});
 assert.equal(result.ok,true);assert.ok(progress.length>10,'a long subtraction must not appear frozen');
 assert.equal(progress[0],0);assert.equal(progress.at(-1),1);
 assert.ok(progress.some(p=>p>0.5&&p<1));
 assert.ok(progress.every((p,i)=>p>=0&&p<=1&&(!i||p>=progress[i-1])));
});
