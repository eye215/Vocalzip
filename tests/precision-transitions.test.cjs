const test=require('node:test'),assert=require('node:assert/strict'),T=require('../app/precision-transitions.js');
function frames({change=false,level=false,jump=false,vowel=false,down=false,invalid=false}={}){
 return Array.from({length:120},(_,i)=>({t:i*.05,f0:180*2**(((down?120-i:i)/120)*1.2)+(jump&&i>=60?200:0),rms:-20+(level&&i>=60?10:0),h1h2:8+(change&&i>=60?-7:0),tilt:-8+(change&&i>=60?5:0),hnr:25+(change&&i>=60?-8:0),cpp:.2+(change&&i>=60?-.08:0),centroid:1200+(change&&i>=60?800:0),trusted:!invalid,vowel:vowel&&i>=60?'i':'a'}));
}
const context={task:'siren-up',vowel:'a',source:'clean'};
test('smooth glide, pitch jump alone, and volume-only changes never establish a register candidate',()=>{
 for(const flags of [{},{jump:true},{level:true}])assert.equal(T.detect(frames(flags),{context}).candidates.length,0);
});
test('coincident periodicity and spectral changes produce timed acoustic candidates with measured pitch and evidence',()=>{
 const r=T.detect(frames({change:true}),{context});assert.ok(r.candidates.length>=1);
 const c=r.candidates[0];assert.ok(Math.abs(c.t-3)<.3);assert.equal(c.direction,'ascending');assert.ok(c.changes.some(m=>m.metric==='hnr'));assert.equal(c.confidence,'medium');assert.ok(c.pitchHz>180);assert.ok(c.range.lowHz<c.range.highHz);
 assert.equal(c.physiologicalClassification,null);
});
test('vowel and loudness confounds withhold candidates even when many acoustic metrics change',()=>{
 for(const flags of [{change:true,vowel:true},{change:true,level:true}])assert.equal(T.detect(frames(flags),{context}).candidates.length,0);
});
test('untrusted or unordered frames cannot generate measured events',()=>{
 assert.equal(T.detect(frames({change:true,invalid:true}),{context}).candidates.length,0);
 assert.throws(()=>T.detect(frames().reverse(),{context}),/ordered/);
});
test('descending is separate, unknown vowel is a lower-confidence acoustic sign',()=>{
 const down=T.detect(frames({change:true,down:true}),{context:{...context,task:'siren-down'}});assert.equal(down.candidates[0].direction,'descending');
 const loose=T.detect(frames({change:true}),{context:{source:'clean'}});assert.equal(loose.candidates[0].confidence,'low');assert.ok(loose.candidates[0].limitations.includes('vowel-not-controlled'));
});
test('three repeat trials count two matching observations against all three valid trials, separately by direction',()=>{
 const r=T.repeated([{id:'a',frames:frames({change:true}),context},{id:'b',frames:frames({change:true}),context},{id:'c',frames:frames(),context}]);
 const up=r.ascending[0];assert.equal(up.observed,2);assert.equal(up.measuredTrials,3);assert.equal(up.reproducible,true);assert.equal(r.descending.length,0);
});
test('mixed/separated source or missing periodic features cannot manufacture a transition',()=>{
 for(const source of ['mixed','unknown','separated'])assert.equal(T.detect(frames({change:true}),{context:{...context,source}}).candidates.length,0);
 const f=frames({change:true}).map(f=>({...f,hnr:null,cpp:null}));assert.equal(T.detect(f,{context}).candidates.length,0);
});
