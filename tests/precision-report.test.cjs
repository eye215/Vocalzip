const test=require('node:test'),assert=require('node:assert/strict'),R=require('../app/precision-report-model.js');
const take=(date,value=10,patch={})=>({id:'take-'+date,engineVersion:'pa-1.0.0',analyzedAt:date+'T12:00:00Z',source:{id:'fake-'+date,revision:'rev-'+date},context:{owner:'fake',source:'clean',task:'sustain',vowel:'a',environment:'mic-A',loudness:'normal',targetMidi:57},parameters:{hopSeconds:.05},scope:{start:0,end:5},metrics:{f0:{value:220,unit:'Hz',confidence:'medium'},rms:{value:-20,unit:'dBFS',confidence:'medium'},hnr:{value,unit:'dB',confidence:'medium'},stability:{value:12,unit:'cent',confidence:'medium'}},quality:{state:'high'},limitations:['synthetic-only'],...patch});
test('comparison preserves measured deltas, units and missing results without a good/bad score',()=>{
 const a=take('2026-01-01',10),b=take('2026-02-01',15),r=R.compare(a,b);assert.equal(r.state,'comparable');assert.equal(r.metrics.hnr.delta,5);assert.equal(r.judgement,null);
 b.metrics.hnr={value:null,unit:'dB',confidence:'withheld'};assert.equal(R.compare(a,b).metrics.hnr.delta,null);
});
test('microphone/vowel/owner/pitch/volume/version/parameters/scope mismatch and missing conditions withhold comparison',()=>{
 const a=take('2026-01-01'),b=take('2026-02-01');
 for(const patch of [{context:{...b.context,owner:'other'}},{context:{...b.context,vowel:'i'}},{context:{...b.context,environment:'mic-B'}},{context:{...b.context,environment:''}},{engineVersion:'older'},{parameters:{hopSeconds:.02}},{scope:{start:30,end:35}},{metrics:{...b.metrics,f0:{value:440,unit:'Hz',confidence:'medium'}}},{metrics:{...b.metrics,rms:{value:-5,unit:'dBFS',confidence:'medium'}}}])assert.equal(R.compare(a,{...b,...patch}).state,'withheld',JSON.stringify(patch));
});
test('longitudinal trends require repeated comparable dates, deduplicate original revisions and report neutral slopes',()=>{
 const a=take('2026-01-01',10),b=take('2026-02-01',12),c=take('2026-03-01',15),r=R.trend([a,b,c,c],'hnr');assert.equal(r.state,'measured');assert.equal(r.count,3);assert.ok(r.slopePerDay>0);assert.equal(r.judgement,null);
 assert.equal(R.trend([a,b],'hnr').state,'withheld');assert.equal(R.trend([a,{...b,context:{...b.context,vowel:'i'}},c],'hnr').state,'withheld');
});
test('AI evidence has only actual allowlisted measurements, limitations and comparison; no audio, owner, media ID or free text instructions',()=>{
 const a=take('2026-01-01'),b=take('2026-02-01',12),payload=R.evidence(b,a);
 assert.ok(payload.measurements.length);const text=JSON.stringify(payload);for(const bad of ['fake-','mic-A','owner','audio','take-'])assert.ok(!text.includes(bad),bad);
 assert.equal(payload.comparison.state,'comparable');assert.ok(payload.measurements.every(m=>typeof m.value==='number'&&m.unit&&m.confidence));
});
test('withheld evidence cannot be invented by AI, response cites measured keys and rejects physiology or fabricated numbers',()=>{
 const p=R.evidence(take('2026-01-01'));const out={sections:[{section:'overview',text:'측정한 소리의 특징을 확인해요.',evidence:['hnr']}]};assert.equal(R.validateAI(out,p).sections.length,1);
 for(const patch of [{...out,sections:[{section:'overview',text:'성대 접촉률 칠십 퍼센트',evidence:['hnr']}]},{...out,sections:[{section:'overview',text:'효율이 90%예요',evidence:['hnr']}]},{...out,sections:[{section:'overview',text:'측정한 특징이에요',evidence:['imaginary']}]}])assert.throws(()=>R.validateAI(patch,p),/unsafe|evidence/);
});
test('legacy results, missing measurement conditions and unrelated recordings never acquire precision metrics',()=>{
 assert.equal(R.compare({v:2,metrics:{}},take('2026-01-01')).state,'withheld');const p=R.evidence({metrics:{hnr:{value:null,unit:'dB',confidence:'withheld'}},limitations:[]});assert.equal(p.measurements.length,0);
});
test('weekly/monthly aggregates keep incompatible cohorts separate and use recorded dates rather than rerun dates',()=>{
 const a={...take('2026-01-01',10),recordedDate:'2026-01-01',songId:'s'},b={...take('2026-01-02',20),recordedDate:'2026-01-02',songId:'s'},c={...take('2026-02-01',30),recordedDate:'2026-02-01',songId:'other'};
 const out=R.periods([a,b,c],{today:'2026-03-01',songId:'s'});assert.equal(out.length,1);assert.equal(out[0].cohorts[0].metrics.hnr.mean,15);
 assert.equal(R.periods([a,b],{period:'week',today:'2026-03-01'})[0].period,'2025-12-29');
 assert.equal(R.periods([a,{...b,context:{...b.context,vowel:'i'}}])[0].cohorts.length,2);
});
