const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../app/student-home-model.js'),T=require('../app/practice-time-model.js');
const date='2026-11-04';
const seed=()=>({dailyGoals:[{id:'g',date,title:'keep',source:'homework',sourceId:'a',completed:false}],practicePlans:[{id:'day:'+date,period:'day',date,targetMinutes:30}],assignments:[{id:'a',status:'active'}],practices:[{id:'p',date,manualMinutes:10,completed:['a'],assignmentReps:{a:3}}]});
for(const kind of ['check','new goal','removed goal','day target','week target','other day target in same week']){
 test('stale editor rejects '+kind+' without overwriting any data',()=>{
  const db=seed(),expectedSnapshot=M.planSnapshot(db,date),goals=structuredClone(db.dailyGoals);
  if(kind==='check')db.dailyGoals[0].completed=true;
  if(kind==='new goal')db.dailyGoals.push({id:'new',date,title:'new'});
  if(kind==='removed goal')db.dailyGoals=[];
  if(kind==='day target')db.practicePlans[0].targetMinutes=60;
  if(kind==='week target')db.practicePlans.push({period:'week',date:'2026-11-02',targetMinutes:210});
  if(kind==='other day target in same week')db.practicePlans.push({period:'day',date:'2026-11-03',targetMinutes:60});
  const before=JSON.stringify(db);
  assert.throws(()=>M.savePlan(db,{date,expectedSnapshot,goals,targetMinutes:30}),/변경됐어요/);
  assert.equal(JSON.stringify(db),before);
 });
}
test('unrelated practice, other-date goals and other-week plans do not block a valid save',()=>{
 const db=seed(),expectedSnapshot=M.planSnapshot(db,date);
 db.practices.push({id:'later',date,manualMinutes:20});
 db.dailyGoals.push({id:'other',date:'2026-11-03',title:'keep'});
 db.practicePlans.push({period:'day',date:'2026-11-11',targetMinutes:60});
 M.savePlan(db,{date,expectedSnapshot,goals:[{id:'g',title:'updated'}],targetMinutes:45});
 assert.equal(db.dailyGoals.find(g=>g.id==='g').title,'updated');
 assert.equal(db.dailyGoals.find(g=>g.id==='other').title,'keep');
 assert.equal(T.entries(db.practices).reduce((n,p)=>n+p.minutes,0),30);
});
test('snapshot ignores object-key and row ordering but detects values',()=>{
 const db=seed();db.dailyGoals.push({id:'two',date,title:'two'});
 const other=structuredClone(db);other.dailyGoals.reverse();
 other.dailyGoals=other.dailyGoals.map(g=>Object.fromEntries(Object.entries(g).reverse()));
 assert.equal(M.planSnapshot(db,date),M.planSnapshot(other,date));
 other.dailyGoals[0].title='changed';assert.notEqual(M.planSnapshot(db,date),M.planSnapshot(other,date));
});
test('latest duplicate practice version counts once; distinct same-day sessions are retained',()=>{
 const db=seed();db.practices[0].updatedAt=1;
 db.practices.push({...db.practices[0],updatedAt:2,assignmentReps:{a:5}},
  {id:'p2',date,manualMinutes:15,completed:['a','a'],assignmentReps:{a:'2'}});
 const before=JSON.stringify(db);
 assert.deepEqual(T.homeworkProgress(db,'a'),{sessions:2,reps:7,last:date});
 assert.deepEqual(T.homeworkProgress(db,'a','p'),{sessions:1,reps:2,last:date});
 assert.equal(T.entries(db.practices).reduce((n,p)=>n+p.minutes,0),25);
 assert.equal(JSON.stringify(db),before);
});
test('newer removed completion does not revive an older completed session',()=>{
 const db=seed();db.practices[0].updatedAt=1;db.practices.push({...db.practices[0],updatedAt:2,completed:[]});
 assert.deepEqual(T.homeworkProgress(db,'a'),{sessions:0,reps:0,last:''});
});
test('only absent legacy repetitions default to one; explicit zero and invalid values never inflate counts',()=>{
 assert.equal(T.homeworkRepetitions({completed:['a']},'a'),1);
 for(const value of [0,null,true,false,-1,1.5,'', ' ',{},[],Infinity,NaN,'Infinity']){
  assert.equal(T.homeworkRepetitions({completed:['a'],assignmentReps:{a:value}},'a'),0,String(value));
 }
 assert.equal(T.homeworkRepetitions({completed:['a'],assignmentReps:{a:'12'}},'a'),12);
 assert.equal(T.homeworkRepetitions({completed:[],assignmentReps:{a:12}},'a'),0);
 assert.deepEqual(T.homeworkProgress({},'a'),{sessions:0,reps:0,last:''});
});
test('goal check and homework repetitions neither finish the assignment nor invent time',()=>{
 const db=seed(),tasks=JSON.stringify(db.assignments),practices=JSON.stringify(db.practices);
 M.setGoal(db,'g',true);
 assert.equal(JSON.stringify(db.assignments),tasks);assert.equal(JSON.stringify(db.practices),practices);
 assert.equal(T.entries(db.practices)[0].minutes,10);
 assert.equal(T.homeworkProgress(db,'a').reps,3);
});
