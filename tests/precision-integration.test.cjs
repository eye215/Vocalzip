// These actual PCM-to-result checks run when PR1–3 are present. Independently, absence is explicit, never mocked.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const available=fs.existsSync(path.join(__dirname,'../app/precision-acoustics.js'))&&fs.existsSync(path.join(__dirname,'../app/precision-transitions.js'));
const A=available?require('../app/precision-acoustics.js'):null,T=available?require('../app/precision-transitions.js'):null;
const context={source:'clean',task:'siren-up',vowel:'a'},sr=16000;
function synth(variant){let phase=0,seed=13;const n=sr*6;return Float32Array.from({length:n},(_,i)=>{
 const hz=variant==='vibrato'?200*2**(30*Math.sin(2*Math.PI*5.5*i/sr)/1200):180*2**(i/n),changed=variant==='change'&&i>n/2,amp=variant==='level'&&i>n/2?.5:.2,weights=changed?[.5,1,.5,.3]:[1,.3,.2,.1];
 phase+=2*Math.PI*hz/sr;seed=(seed*1664525+1013904223)>>>0;return amp*weights.reduce((s,a,j)=>s+a*Math.sin(phase*(j+1)),0)/Math.sqrt(weights.reduce((s,a)=>s+a*a,0))+(variant==='noise'?.5:changed?.035:.003)*(seed/2**32*2-1);
 });}
test('combined actual PCM: continuous glide, simple amplitude change and noisy source do not produce register candidates',{skip:!available},()=>{
 for(const variant of ['glide','level','noise']){const r=A.analyze(synth(variant),sr,{context});assert.equal(T.detect(r.frames,{context}).candidates.length,0,variant);}
});
test('combined actual PCM: coincident harmonic/noise change yields a candidate near its known time, supplied vowel change withholds it',{skip:!available},()=>{
 const r=A.analyze(synth('change'),sr,{context}),out=T.detect(r.frames,{context});assert.ok(out.candidates.some(c=>Math.abs(c.t-3)<.3));
 const labeled=r.frames.map(f=>({...f,vowel:f.t>=3?'i':'a'}));assert.equal(T.detect(labeled,{context}).candidates.length,0);
});
test('combined actual PCM: vibrato is retained by legacy engine and never treated as cycle perturbation',{skip:!available},()=>{
 const r=A.analyze(synth('vibrato'),sr,{context:{...context,task:'sustain'}});assert.ok(r.legacy.metrics.vibrato);assert.equal(r.metrics.jitter.value,null);assert.equal(r.metrics.shimmer.value,null);
});
