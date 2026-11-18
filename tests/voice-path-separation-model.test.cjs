const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../app/voice-path-separation-model.js');
const meta=()=>({id:'fake-take',storageProvider:'r2',r2Key:'u/fake-owner/fake-take',size:128,analysis:{version:2,at:17,metrics:{voicedSeconds:9}},review:'keep'});
test('only a cloud source with a stable identity can request the versioned fallback',()=>{
 for(const x of[{}, {...meta(),r2Key:''},{...meta(),size:0},{...meta(),size:300*1024*1024},{...meta(),durationSeconds:901}])assert.equal(S.source(x),null);
 const m=meta(),copy=structuredClone(m),q=S.request(m,'fake-request',100);assert.equal(q.state,'queued');assert.deepEqual(q.source,S.source(m));assert.deepEqual(m,copy);
});
test('queued, running, completed and failed work is not automatically repeated',()=>{
 for(const state of['queued','running','done','failed','withheld']){const m=meta();m.voicePathSeparation={...S.request(m,'fake-request',100),state};assert.equal(S.request(m,'another-request',200),null);}
 const m=meta();m.voicePathSeparation={...S.request(m,'first',100),state:'failed'};assert.equal(S.request(m,'retry',200,{retry:true}).requestId,'retry');
});
test('a replaced source invalidates the old result and request without deleting either',()=>{
 const m=meta(),q=S.request(m,'first',100);m.voicePathSeparation={...q,state:'done',result:{version:'vp-0.2',voicedSeconds:12}};assert.ok(S.current(m));m.r2Key='u/fake-owner/replaced';assert.equal(S.current(m),null);assert.ok(S.request(m,'second',200));assert.equal(m.voicePathSeparation.result.voicedSeconds,12);
});
test('the request and resulting measurements must match the current contract version',()=>{
 const m=meta();m.voicePathSeparation={...S.request(m,'a',100),version:'old',state:'done'};assert.equal(S.current(m),null);assert.ok(S.request(m,'b',200));
});
test('isolated pitch uses existing periodicity/error limits and retains the raw mixture gate unchanged',()=>{
 const P=require('../app/voice-path-model.js'),r={version:P.VERSION,voicedSeconds:20,confidence:{meanStrength:.95,glitchShare:.01,outsideBandShare:.01,jumpsPerMin:90,flatNoteShare:0}};
 assert.equal(P.measurable(r,false).ok,false);assert.equal(S.quality(r).ok,true);
 for(const patch of[{meanStrength:.7},{glitchShare:.1},{outsideBandShare:.4},{meanStrength:null}])assert.equal(S.quality({...r,confidence:{...r.confidence,...patch}}).ok,false);
 assert.equal(S.quality({...r,voicedSeconds:1}).ok,false);assert.equal(S.quality({...r,version:'old'}).ok,false);
});
