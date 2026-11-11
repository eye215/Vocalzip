const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../app/vocal-analysis.js');
const hz=m=>440*2**((m-69)/12);
function tone(notes,{harmonics=[1],sr=8000,noise=0}={}){
 const seconds=Math.max(...notes.map(n=>n[0]+n[1]))+.1,x=new Float32Array(Math.ceil(seconds*sr));let seed=7;
 for(const [start,duration,midi]of notes)for(let i=0;i<duration*sr;i++){
  const t=i/sr,env=Math.min(1,t/.005,(duration-t)/.005);
  for(let j=0;j<harmonics.length;j++)if(hz(midi)*(j+1)<sr/2)
   x[Math.floor(start*sr)+i]+=.2*env*harmonics[j]*Math.sin(2*Math.PI*hz(midi)*(j+1)*t);
 }
 if(noise)for(let i=0;i<x.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;x[i]+=noise*(seed/4294967296*2-1);}
 return {samples:x,sr};
}
const run=(notes,opts)=>{const {samples,sr}=tone(notes,opts);return A.analyze(samples,sr)};
test('C5 reference: sustained fundamental, strong second harmonic and missing fundamental',()=>{
 for(const harmonics of [[1],[.05,1],[0,1,.5],[.1,1,.3]]){
  const r=run([[0,1,72]],{harmonics});
  assert.equal(r.version,2);assert.equal(r.metrics.range.validHigh.note,'C5');
  assert.equal(r.metrics.range.stableHigh.note,'C5');
  assert.ok(Math.abs(r.metrics.range.highCents-7200)<15);
 }
});
test('real C4 to C5 and C5 to C6 octave jumps are preserved',()=>{
 for(const midi of [60,72]){
  const r=run([[0,1,midi],[1.2,1,midi+12]],{harmonics:[.2,1,.4]});
  assert.equal(r.metrics.range.low,A.noteName(midi*100));
  assert.equal(r.metrics.range.high,A.noteName((midi+12)*100));
 }
});
test('short high sound does not replace sustained C5 as the valid or stable high',()=>{
 const r=run([[0,1,72],[1.3,.07,78],[1.6,1,72]]);
 assert.equal(r.metrics.range.validHigh.note,'C5');
 assert.equal(r.metrics.range.stableHigh.note,'C5');
 assert.ok(r.metrics.range.instantaneous.cents>7600);
});
test('200ms is consecutive evidence, not sum of disconnected fragments',()=>{
 const frames=100,tr={frames,hz:new Float64Array(frames).fill(hz(72)),confidence:new Float64Array(frames).fill(.99)};
 const mask=new Uint8Array(frames);
 for(let f=0;f<frames;f++)mask[f]=f%20<10?1:0;
 let r=A._internal.rangeOf(tr,mask);assert.equal(r.validHigh,null);assert.equal(r.stableHigh,null);
 mask.fill(0);mask.fill(1,0,20);r=A._internal.rangeOf(tr,mask);assert.equal(r.validHigh.note,'C5');assert.equal(r.validHigh.duration,.2);
 tr.confidence.fill(.79);assert.equal(A._internal.rangeOf(tr,mask).validHigh,null);
});
test('low confidence and single-frame octave errors cannot become a valid high',()=>{
 const frames=120,tr={frames,hz:new Float64Array(frames).fill(hz(72)),confidence:new Float64Array(frames).fill(.99)},mask=new Uint8Array(frames).fill(1);
 tr.hz[50]=hz(84);const r=A._internal.rangeOf(tr,mask);
 assert.equal(r.instantaneous.note,'C6');assert.equal(r.validHigh.note,'C5');
 tr.confidence.fill(.4);assert.equal(A._internal.rangeOf(tr,mask),null);
});
test('silence and deterministic noise have no valid singing range',()=>{
 assert.equal(A.analyze(new Float32Array(16000),8000).metrics.range,null);
 let seed=1;const noise=Float32Array.from({length:16000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return .2*(seed/4294967296*2-1)});
 assert.equal(A.analyze(noise,8000).metrics.range,null);
});
test('same melody with a changed harmonic balance retains the same high',()=>{
 const notes=[[0,1,60],[1.2,1,64],[2.4,1,72]];
 const first=run(notes),last=run(notes,{harmonics:[.05,1]});
 assert.equal(first.metrics.range.high,last.metrics.range.high);
 assert.equal(Math.round(last.metrics.range.highCents/100)-Math.round(first.metrics.range.highCents/100),0);
});
test('note-name differences: A#5 to F#5 is four semitones, not raw cents rounding',()=>{
 assert.equal(A.noteName(8200),'A#5');assert.equal(A.noteName(7800),'F#5');
 assert.equal(Math.round(7800/100)-Math.round(8200/100),-4);
});
module.exports={tone};
