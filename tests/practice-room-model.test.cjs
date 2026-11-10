const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../app/practice-room-model.js');
const session={id:'test-session-1234',task:'tone',seconds:31,demo:false};
test('records actual seconds once and preserves existing data',()=>{
 const original={id:'existing',manualMinutes:20,memo:'keep'};const db={practices:[original],dailyGoals:[]};
 assert.equal(M.record(db,session,'2026-11-10'),true);assert.equal(M.record(db,session,'2026-11-10'),false);
 assert.equal(db.practices.length,2);assert.deepEqual(db.practices[0],original);assert.equal(db.practices[1].manualMinutes,31/60);
});
test('demo submissions never become actual practice or goals',()=>{
 const db={};assert.equal(M.record(db,{...session,demo:true},'2026-11-10'),false);
 assert.equal(M.goal(db,{...session,demo:true,nextTask:'melody'},'2026-11-10'),false);assert.deepEqual(db,{});
});
test('next goal is explicit, idempotent and does not check existing goals',()=>{
 const db={dailyGoals:[{id:'old',completed:false}]};const input={...session,nextTask:'melody',short:true};
 assert.equal(M.goal(db,input,'2026-11-10'),true);assert.equal(M.goal(db,input,'2026-11-10'),false);
 assert.equal(db.dailyGoals.length,2);assert.equal(db.dailyGoals[0].completed,false);assert.equal(db.dailyGoals[1].completed,false);assert.match(db.dailyGoals[1].title,/짧은 구간/);
});
test('invalid task, ids and durations cannot mutate records',()=>{
 for(const input of [{...session,task:'arbitrary'},{...session,id:'../bad'},{...session,seconds:NaN},{...session,seconds:-1},{...session,seconds:21601}]){
  const db={};assert.throws(()=>M.record(db,input,'2026-11-10'));assert.deepEqual(db,{});
 }
 assert.throws(()=>M.goal({}, {...session,nextTask:'unknown'},'2026-11-10'));
});
