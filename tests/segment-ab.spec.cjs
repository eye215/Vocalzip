const test=require('node:test');
const assert=require('node:assert/strict');
const {measure,compare}=require('../app/segment-ab-model.js');
const sample={notes:[
 {t:5,dur:1,dev:30},{t:7,dur:1,dev:-40},
 {t:25,dur:1,dev:4},{t:27,dur:1,dev:5}
 ]};
test('calculates deviation only for measured notes inside selected segment',()=>{
 const result=measure(sample,4,10);
 assert.equal(result.meanAbsCents,35);
 assert.equal(result.notes,2);
});
test('compares selected excerpts without falsely aligning song phrases',()=>{
 const before={notes:[{t:2,dur:1,dev:35},{t:4,dur:1,dev:45}]};
 const after={notes:[{t:12,dur:1,dev:15},{t:14,dur:1,dev:25}]};
 const r=compare(before,after,1,6,11,16);
 assert.deepEqual({status:r.status,delta:r.delta,trend:r.trend},{status:'ok',delta:-20,trend:'lower'});
});
test('refuses to classify missing or poorly populated sections',()=>{
 assert.equal(compare(sample,{notes:[]},4,10,4,10).status,'insufficient');
 assert.equal(measure(sample,0,6),null);
 assert.equal(measure(sample,10,9),null);
});
test('rejects boundary-crossing notes and non-finite deviation',()=>{
 const r=measure({notes:[{t:1,dur:1,dev:25},{t:3,dur:1,dev:NaN},{t:5,dur:1,dev:30}]},0,5.5);
 assert.equal(r,null);
});
