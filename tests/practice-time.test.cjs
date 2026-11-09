const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../app/practice-time-model.js');
test('actual minutes prefer explicit manual values, including zero',()=>{
 assert.equal(T.actualMinutes({minutes:30,manualMinutes:25,mediaSeconds:300}),25);
 assert.equal(T.actualMinutes({minutes:30,manualMinutes:0}),0);
 assert.equal(T.actualMinutes({minutes:30,manualMinutes:'12.5'}),12.5);
});
test('legacy minutes remain readable and are never rewritten or subtracted',()=>{
 const record={minutes:40,mediaSeconds:600},before=JSON.stringify(record);
 assert.equal(T.actualMinutes(record),40);assert.equal(JSON.stringify(record),before);
});
test('unconfirmed imported recording time is never counted as actual time',()=>{
 assert.equal(T.actualMinutes({practiceTimeSource:'unconfirmed',minutes:600,manualMinutes:600,mediaSeconds:36000}),0);
 assert.equal(T.actualMinutes({practiceTimeSource:'manual',minutes:12,manualMinutes:12,mediaSeconds:36000}),12);
});
test('invalid and non-finite values cannot create fake practice time',()=>{
 for(const value of [null,undefined,true,false,[],{},'', ' ',NaN,Infinity,-1,'Infinity'])assert.equal(T.actualMinutes({manualMinutes:value,minutes:value}),0);
 assert.equal(T.actualMinutes({manualMinutes:'bad',minutes:8}),8);
});
test('media length and repeated links do not change manually recorded time',()=>{
 for(const duration of [1,60,3600,999999]){
  const records=[{id:'a',date:'2026-11-09',manualMinutes:10,minutes:10,mediaIds:['file'],mediaSeconds:duration},
   {id:'b',date:'2026-11-09',manualMinutes:15,minutes:15,mediaIds:['file'],durationSeconds:duration}];
  assert.equal(T.entries(records).reduce((n,e)=>n+e.minutes,0),25);
 }
});
test('newer duplicate record IDs count once while distinct practice sessions remain distinct',()=>{
 const a={id:'a',date:'2026-11-09',minutes:8,updatedAt:1},b={...a,minutes:12,updatedAt:2},c={...b,id:'b'};
 const rows=T.entries([a,b,c]);assert.equal(rows.length,2);assert.equal(rows.reduce((n,e)=>n+e.minutes,0),24);
});
test('training time does not get assigned to a stale song ID',()=>{
 const [entry]=T.entries([{id:'t',date:'2026-11-09',practiceMode:'training',songId:'old',minutes:9}]);
 assert.equal(entry.training,true);assert.equal(entry.songId,'');assert.equal(entry.minutes,9);
});
test('empty, malformed and zero-minute records do not create activity days',()=>{
 assert.deepEqual(T.entries([null,[],{id:'zero',minutes:0},{id:'pending',minutes:99,practiceTimeSource:'unconfirmed'}]),[]);
 assert.deepEqual(T.entries(null),[]);
});
test('selectors preserve original records and linked metadata',()=>{
 const input=[{id:'p',date:'2026-11-09',minutes:99,manualMinutes:4,mediaSeconds:600,mediaIds:['m'],memo:'keep'}],before=JSON.stringify(input);
 assert.equal(T.entries(input)[0].minutes,4);assert.equal(JSON.stringify(input),before);assert.equal(T.entries(input)[0].ref,input[0]);
});
