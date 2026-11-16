const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../app/precision-acoustics.js');
const sr=16000;
function signal({seconds=2,hz=200,partials=[1,.5,.25,.125],noise=0,gain=.25}={}){
 let seed=17;return Float32Array.from({length:seconds*sr},(_,i)=>{
  seed=(seed*1664525+1013904223)>>>0;
  return gain*partials.reduce((s,a,h)=>s+a*Math.sin(2*Math.PI*hz*(h+1)*i/sr),0)+noise*(seed/2**32*2-1);
 });
}
const opts={sourceId:'synthetic',sourceRevision:'sha256:fixture',context:{source:'clean',task:'sustain',vowel:'a',owner:'fake',environment:'fixture'}};
test('reuses legacy F0/intonation/vibrato/range, never mutates PCM or legacy result',()=>{
 const pcm=signal(),copy=pcm.slice(),legacy=require('../app/vocal-analysis.js').analyze(pcm,sr),before=JSON.stringify(legacy);
 const r=A.analyze(pcm,sr,{...opts,baseAnalysis:legacy});assert.deepEqual(pcm,copy);assert.equal(JSON.stringify(legacy),before);assert.deepEqual(r.legacy.metrics,legacy.metrics);
 assert.ok(Math.abs(r.metrics.f0.value-200)<3);assert.equal(r.engineVersion,A.VERSION);assert.ok(r.frames.length>30);
});
test('known harmonic amplitudes yield uncorrected H1-H2 near 6.02 dB and nonzero periodicity',()=>{
 const r=A.analyze(signal(),sr,opts);assert.ok(Math.abs(r.metrics.h1h2.value-6.0206)<1,r.metrics.h1h2.value);
 assert.equal(r.metrics.h1h2.unit,'dB (uncorrected)');assert.ok(r.metrics.hnr.value>15);assert.ok(r.metrics.cpp.value>0);
 assert.equal(r.metrics.cpp.unit,'log-amplitude cepstral units');
});
test('pure sine has no second harmonic: H1-H2 withheld instead of a floor-generated ratio',()=>{
 const r=A.analyze(signal({partials:[1]}),sr,opts);assert.equal(r.metrics.h1h2.value,null);assert.equal(r.metrics.h1h2.confidence,'withheld');
});
for(const source of ['mixed','unknown','separated'])test(source+' audio never becomes a clean contact/resonance measurement',()=>{
 const r=A.analyze(signal({noise:.05}),sr,{...opts,context:{...opts.context,source}});
 for(const k of ['h1h2','hnr','cpp','jitter','shimmer'])assert.equal(r.metrics[k].value,null,k);
 assert.ok(r.limitations.includes('source-not-clean'));assert.ok(r.metrics.rms.value<0);
});
test('silence and short clips provide null values and explicit reasons, no NaN/Infinity',()=>{
 for(const pcm of [new Float32Array(sr),signal({seconds:.1})]){
  const r=A.analyze(pcm,sr,opts);assert.equal(r.metrics.hnr.value,null);assert.equal(r.metrics.jitter.value,null);
  assert.ok(!JSON.stringify(r).includes('NaN'));assert.equal(r.quality.state,'withheld');
 }
});
test('clipping is measured on original samples and withholds phonation measures',()=>{
 const x=signal();for(let i=0;i<x.length;i+=8)x[i]=1;
 const r=A.analyze(x,sr,opts);assert.ok(r.quality.clippedShare>.1);assert.equal(r.metrics.hnr.value,null);assert.ok(r.quality.reasons.includes('clipping'));
});
test('noise degrades harmonic evidence and clean confidence cannot be inferred from a task label',()=>{
 const r=A.analyze(signal({noise:.8}),sr,opts);assert.notEqual(r.quality.state,'high');
 const missing=A.analyze(signal(),sr,{...opts,context:{task:'sustain'}});assert.equal(missing.metrics.cpp.value,null);
});
test('jitter and shimmer require stable isolated sustained cycles, never general singing or vibrato',()=>{
 const r=A.analyze(signal(),sr,opts);assert.ok(r.metrics.jitter.value<.2);assert.ok(r.metrics.shimmer.value<.2);
 const song=A.analyze(signal(),sr,{...opts,context:{...opts.context,task:'song'}});assert.equal(song.metrics.jitter.value,null);
});
test('invalid input, excessive duration and cancellation fail before creating results',()=>{
 assert.throws(()=>A.analyze(new Float32Array([NaN]),sr,opts),/PCM/);
 assert.throws(()=>A.analyze(signal(),100,opts),/sample rate/);
 assert.throws(()=>A.analyze(signal(),sr,{...opts,maxSeconds:1}),/duration/);
 assert.throws(()=>A.analyze(signal(),sr,{...opts,aborted:()=>true}),/cancel/i);
});
test('cache key varies by original revision, engine, context and thresholds; metadata holds algorithms and parameters',()=>{
 const a=A.cacheKey({...opts,sampleRate:sr}),b=A.cacheKey({...opts,sampleRate:sr,sourceRevision:'different'});
 assert.notEqual(a,b);assert.notEqual(a,A.cacheKey({...opts,sampleRate:sr,rules:{minConfidence:.9}}));
 const r=A.analyze(signal(),sr,opts);assert.equal(r.source.revision,opts.sourceRevision);assert.ok(r.algorithms.cpp);assert.ok(r.parameters.hopSeconds);assert.ok(r.analyzedAt);
});
module.exports={signal,sr,opts};
