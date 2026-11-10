const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../app/practice-room-model.js');
const Merge=require('../data-merge.js');
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
test('reflection and R2 media references survive a second device snapshot merge',()=>{
 const id='reflection-session-1',db={songs:[],lessons:[],assignments:[],categories:[],practices:[]};
 const room={date:'2026-11-10T09:00:00.000Z',analysis:{status:'reflection',summary:'회고'},recommendation:'reflection',summary:'회고',draft:{difficulty:'조금 도전적',comfort:'편안해',memo:'후렴 집중',answers:['The River']},audioIds:[{id:id+'-0',name:'한 구절.wav',duration:12,cloud:false}]};
 const input={id,task:'reflection',seconds:0,demo:false,room};
 assert.equal(M.record(db,input,'2026-11-10'),true);
 assert.equal(db.practices[0].manualMinutes,0);
 assert.equal(db.practices[0].practiceRoom.draft.memo,'후렴 집중');
 assert.equal(M.record(db,{...input,room:{...room,audioIds:[{...room.audioIds[0],cloud:true}]}},'2026-11-10'),true);
 assert.deepEqual(db.practices[0].mediaIds,[id+'-0']);
 const removed=structuredClone(db);Merge.deleteMedia(removed,id+'-0');
 assert.deepEqual(removed.practices[0].practiceRoom.audioIds,[]);
 assert.equal(removed.practices[0].practiceRoom.draft.memo,'후렴 집중');
 const other={songs:[],lessons:[],assignments:[],categories:[],practices:[]};
 assert.deepEqual(Merge.merge(other,db).data.practices[0].practiceRoom.audioIds[0].cloud,true);
 assert.equal(M.record(db,{...input,room:{...room,audioIds:[{...room.audioIds[0],cloud:true}]}},'2026-11-10'),false);
});
