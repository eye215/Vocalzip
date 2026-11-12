const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../app/practice-room-model.js');
const base={id:'recommend-session-1234',task:'tone',date:'2026-11-11T01:00:00Z',songId:'song-1',seconds:20,analysis:{status:'review'},recommendation:'review',draft:{difficulty:'조금 도전적',comfort:'편안해'},audioIds:[],aiNextTask:'melody',aiCoach:'들리는 특징: 끝 음이 흔들려요.\n다음 시도: 짧은 선율을 나누어 확인해요.'};
test('same AI proposal survives a device snapshot with reason, action, time and song',()=>{
 const db={};M.record(db,{id:base.id,task:base.task,seconds:20,room:base},'2026-11-11');
 const other=JSON.parse(JSON.stringify(db));
 assert.deepEqual(M.recommendations(other,'2026-11-11'),[M.recommend(base)]);
 assert.equal(other.practices[0].practiceRoom.aiCoach,base.aiCoach);
 const c=M.recommend(base);assert.equal(c.task,'melody');assert.equal(c.source,'ai');assert.equal(c.minutes,8);assert.equal(c.songId,'song-1');assert.match(c.reason,/끝 음/);
 assert.deepEqual(M.recommendations(other,'2026-11-11','other-song'),[]);
 assert.deepEqual(other.dailyGoals,undefined);
});
test('symptoms and fatigue override an AI advance proposal',()=>{
 for(const patch of [{draft:{comfort:'불편해'}},{draft:{symptoms:['쉰 소리']}},{mood:'조금 피곤해'},{aiConditionCheck:true},{draft:{memo:'목이 아파서 그만했어요'}}]){
  const c=M.recommend({...base,...patch});assert.equal(c.task,'reflection');assert.equal(c.vocal,false);
 }
});
test('invalid AI task falls back and demos never become recommendations',()=>{
 assert.equal(M.recommend({...base,aiNextTask:'scene'}).source,'rules');
 assert.equal(M.recommend({...base,demo:true}),null);
});
test('saving is explicit, keeps proposal details, and never alters teacher homework',()=>{
 const task={id:'teacher',title:'선생님 숙제 그대로',status:'todo'},db={assignments:[task]};
 M.record(db,{id:base.id,task:base.task,seconds:20,room:base},'2026-11-11');
 assert.equal(db.dailyGoals,undefined);
 assert.throws(()=>M.goal(db,{...base,nextTask:'scene'},'2026-11-11'));
 M.goal(db,{...base,nextTask:'melody'},'2026-11-11');
 assert.equal(db.dailyGoals.length,1);assert.equal(db.dailyGoals[0].recommendation.minutes,8);
 assert.equal(db.dailyGoals[0].songId,'song-1');assert.deepEqual(db.assignments,[task]);
});
test('home reuses the proposal and keeps teacher assignments immutable, including rest days',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const db={assignments:[1,2,3].map(id=>({id:String(id),title:'숙제 '+id})),practices:[]};
 M.record(db,{id:base.id,task:base.task,seconds:20,room:base},'2026-11-11');
 const before=JSON.stringify(db.assignments),V={db,media:{list:async()=>[]},esc:String,today:()=> '2026-11-11',taskInPeriod:()=>true,taskLessons:()=>[],taskSongId:()=>'',practiceTips:()=>({tips:[]}),route:()=>{}};
 const window={VZ:V,VocalzipPracticeRoomModel:M,addEventListener:()=>{}};
 vm.runInNewContext(fs.readFileSync('app/guided-practice.js','utf8'),{window,document:{addEventListener:()=>{}}});
 let rows=await V.guidedRecommendations();assert.equal(rows.length,3);assert.equal(rows[2].kind,'room');assert.equal(rows[2].task,'melody');assert.match(rows[2].href,/result=recommend-session-1234/);
 db.practices[0].practiceRoom.draft.comfort='불편해';rows=await V.guidedRecommendations();assert.equal(rows.length,1);assert.equal(rows[0].task,'reflection');assert.equal(JSON.stringify(db.assignments),before);
});
