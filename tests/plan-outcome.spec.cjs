const test=require('node:test');
const assert=require('node:assert/strict');
const {report,completeDate}=require('../app/plan-outcome-model.js');
const p={id:'plan-A',kind:'monthly-vocal',metric:'stability',songId:'song-1',startDate:'2026-11-01',days:5};
const audio=(id,date,wobble,songId='song-1')=>({id,recordedDate:date,songId,analysis:{metrics:{stability:{wobbleCents:wobble}}}});
const args={plan:p,dateOf:m=>m.recordedDate,valid:()=>true,asOf:'2026-11-07'};
test('outcome reports actual progress with planned days as denominator',()=>{
 const r=report({...args,goals:[{sourceId:p.id,date:'2026-11-01',completed:true},{sourceId:p.id,date:'2026-11-02',completed:true}]});
 assert.equal(r.completedDays,2);
 assert.equal(r.completionRate,40);
 assert.equal(r.scheduledDays,5);
 assert.equal(completeDate(p),'2026-11-05');
});
test('same-song reliable before/within-plan takes only',()=>{
 const r=report({...args,recordings:[audio('before','2026-10-29',27),audio('during','2026-11-03',19),
 audio('after','2026-11-06',1),audio('other','2026-11-04',1,'song-2')]});
 assert.equal(r.measurement.change,'better');
 assert.equal(r.measurement.before,27);
 assert.equal(r.measurement.after,19);
 assert.deepEqual(r.measurement.afterIds,['during']);
});
test('insufficient baseline does not claim improved',()=>{
 const r=report({...args,recordings:[audio('only','2026-11-03',12)]});
 assert.equal(r.measurement.change,'insufficient');
 assert.equal(r.recommendation,'collect');
});
test('cannot finalize plan before last scheduled day',()=>{
 assert.throws(()=>report({...args,asOf:'2026-11-04'}),/종료 후/);
});
test('vibrato and phrase apply domain-sensitive neutral threshold',()=>{
 const source={...p,metric:'vibrato'};
 const rows=[{id:'x',songId:'song-1',recordedDate:'2026-10-01',analysis:{metrics:{vibrato:{regularity:0.40}}}},
 {id:'y',songId:'song-1',recordedDate:'2026-11-03',analysis:{metrics:{vibrato:{regularity:0.55}}}}];
 const r=report({...args,plan:source,recordings:rows});
 assert.equal(r.measurement.change,'better');
});
