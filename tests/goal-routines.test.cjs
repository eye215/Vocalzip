// 반복 목표: daily routine contract (future-only edits, typed minutes only, no double counting).
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../app/goal-routines.js'),Time=require('../app/practice-time-model.js');
let n=0;const uid=()=>'u'+(++n);
const base=()=>({dailyGoals:[{id:'g0',date:'2026-11-10',title:'어제 목표',source:'personal',completed:true}],practicePlans:[],practices:[],assignments:[{id:'a1',title:'립트릴',status:'active'}]});

test('create writes one goal per day with stable ids and leaves other goals alone',()=>{
  const db=base();const [id]=R.create(db,{titles:['립트릴 10분'],days:7,today:'2026-11-11',uid});
  const goals=R.goalsOf(db,id);
  assert.equal(goals.length,7);assert.equal(goals[0].date,'2026-11-11');assert.equal(goals[6].date,'2026-11-17');
  assert.ok(goals.every(g=>g.id===id+':'+g.date&&g.routine&&g.source==='personal'&&!g.completed));
  assert.deepEqual(db.dailyGoals[0],base().dailyGoals[0]);
  assert.equal(db.practicePlans[0].endDate,'2026-11-17');
  assert.throws(()=>R.create(base(),{titles:['x'],days:1,today:'2026-11-11',uid}),/2~60/);
  assert.throws(()=>R.create(base(),{titles:['x'],days:61,today:'2026-11-11',uid}),/2~60/);
  assert.throws(()=>R.create(base(),{titles:['  '],days:3,today:'2026-11-11',uid}),/1~200/);
});

test('rename and end change only today-unfinished and later days; the denominator keeps past days',()=>{
  const db=base();const [id]=R.create(db,{titles:['허밍'],days:5,today:'2026-11-09',uid});
  const g=d=>db.dailyGoals.find(x=>x.id===id+':'+d);
  g('2026-11-09').completed=true;g('2026-11-11').completed=true;
  assert.ok(R.rename(db,id,'허밍 15분','2026-11-11'));
  assert.equal(g('2026-11-09').title,'허밍');assert.equal(g('2026-11-10').title,'허밍');
  assert.equal(g('2026-11-11').title,'허밍','a completed goal keeps the title it was done under');
  assert.equal(g('2026-11-12').title,'허밍 15분');
  assert.deepEqual(R.progress(db,id,'2026-11-11'),{done:2,total:5,elapsed:3,missed:1});
  assert.ok(R.end(db,id,'2026-11-12'));
  assert.deepEqual(R.goalsOf(db,id).map(x=>x.date),['2026-11-09','2026-11-10','2026-11-11']);
  assert.deepEqual(R.progress(db,id,'2026-11-12'),{done:2,total:3,elapsed:3,missed:1});
  assert.equal(R.rename(db,id,'다시','2026-11-12'),false,'an ended routine cannot be edited');
  assert.equal(db.practicePlans[0].archived,true);
});

test('perform counts only typed minutes, once per goal, and links homework without finishing it',()=>{
  const db=base();
  db.dailyGoals.push({id:'h1',date:'2026-11-11',title:'립트릴',source:'homework',sourceId:'a1',completed:true});
  R.perform(db,'h1',{minutes:12,mediaIds:['m1','m1']});
  R.perform(db,'h1',{minutes:15,mediaIds:['m1']});
  assert.equal(db.practices.length,1);
  const p=db.practices[0];
  assert.equal(p.id,'goal:h1');assert.equal(p.manualMinutes,15);assert.deepEqual(p.mediaIds,['m1']);
  assert.deepEqual(p.completed,['a1']);assert.equal(p.goalSource,'homework');
  assert.equal(db.assignments[0].status,'active','homework completion stays the teacher/student decision');
  assert.equal(Time.entries(db.practices).reduce((s,e)=>s+e.minutes,0),15);
  R.perform(db,'h1',{minutes:null,mediaIds:['m2']});
  assert.equal(Time.entries(db.practices).reduce((s,e)=>s+e.minutes,0),0,'clearing the time stops counting it');
  assert.deepEqual(db.dailyGoals.find(g=>g.id==='h1').performance.mediaIds,['m2']);
});

test('perform without time adds no practice; unchecked goals and bad minutes are refused',()=>{
  const db=base();db.dailyGoals.push({id:'p1',date:'2026-11-11',title:'가사 읽기',source:'personal',completed:true},{id:'p2',date:'2026-11-11',title:'x',completed:false});
  R.perform(db,'p1',{minutes:'',mediaIds:['m9']});
  assert.equal(db.practices.length,0);assert.deepEqual(db.dailyGoals.find(g=>g.id==='p1').performance.mediaIds,['m9']);
  assert.throws(()=>R.perform(db,'p2',{minutes:5}),/완료한 목표/);
  assert.throws(()=>R.perform(db,'p1',{minutes:0}),/1~600/);
  assert.throws(()=>R.perform(db,'p1',{minutes:601}),/1~600/);
  assert.throws(()=>R.perform(db,'nope',{minutes:5}),/변경/);
});

test('otherMinutes shows time already saved by guided practice for the same homework',()=>{
  const db=base();const goal={id:'h1',date:'2026-11-11',sourceId:'a1'};
  db.practices.push({id:'guided:x',date:'2026-11-11',manualMinutes:4,completed:['a1']},{id:'other',date:'2026-11-10',manualMinutes:9,completed:['a1']});
  assert.equal(R.otherMinutes(db,goal),4);
});
