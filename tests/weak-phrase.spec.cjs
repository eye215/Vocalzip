const test=require('node:test');
const assert=require('node:assert/strict');
const {candidates}=require('../app/weak-phrase.js');
test('only measured sustained semitone-distance review candidates are included',()=>{
 const data={seconds:70,notes:[
  {t:5,dur:1,dev:39},{t:6,dur:.2,dev:49},{t:20,dur:.8,dev:-31},
  {t:35,dur:1,dev:9},{t:50,dur:2,dev:45}
 ]};
 const got=candidates(data);
 assert.equal(got.length,3);
 assert.deepEqual(got.map(x=>x.time),[5,20,50]);
 assert.ok(got.every(x=>x.start>=0&&x.end<=70));
});
test('overlapping notes are deduplicated and ranked by note duration and deviation',()=>{
 const got=candidates({seconds:40,notes:[
  {t:10,dur:.5,dev:40},{t:11,dur:2,dev:39},{t:29,dur:1,dev:35}
 ]});
 assert.equal(got.length,2);
 assert.equal(got[0].time,11);
});
test('invalid or insufficient pitch data produces no review candidates',()=>{
 assert.deepEqual(candidates({seconds:30,notes:[{t:3,dur:.1,dev:50},{t:10,dur:1,dev:10}]}),[]);
 assert.deepEqual(candidates({seconds:30,notes:[{t:NaN,dur:1,dev:50},{t:29,dur:4,dev:40}]}),[]);
 assert.deepEqual(candidates({seconds:0,notes:[{t:1,dur:1,dev:45}]}),[]);
});
test('maximum returned count is bounded and ordered chronologically',()=>{
 const notes=Array.from({length:15},(_,i)=>({t:i*10,dur:1,dev:35}));
 const out=candidates({seconds:160,notes},50);
 assert.equal(out.length,8);
 assert.deepEqual(out.map(x=>x.time).slice(0,3),[0,10,20]);
});
