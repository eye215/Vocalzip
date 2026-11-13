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

// 완료 직후 시간 묻기 (2026-11-13): what the sheet opens with, and the time shown on the goal row.
test('titleMinutes reads only a duration that ends the goal text',()=>{
  for(const [text,minutes] of [['립트릴 (8분)',8],['허밍 5분',5],['고음 1시간 30분',90],['발성 (1시간)',60],['호흡 (8분) ',8],
    ['3분 지점부터 다시',null],['10분씩 3일',null],['가사 읽기',null],['쉬기 0분',null],['너무 긴 999분',null],['',null],[null,null]])
    assert.equal(R.titleMinutes(text),minutes,String(text));
});

test('suggestMinutes prefers the saved time, then the goal itself, then the last time for the same goal',()=>{
  const db=base();
  db.dailyGoals.push(
    {id:'r:10',date:'2026-11-10',title:'가사 읽기',source:'personal',sourceId:'routine:r',routineId:'routine:r',routine:true,completed:true},
    {id:'r:11',date:'2026-11-11',title:'가사 읽기',source:'personal',sourceId:'routine:r',routineId:'routine:r',routine:true,completed:true},
    {id:'h0',date:'2026-11-09',title:'립트릴',source:'homework',sourceId:'a1',completed:true},
    {id:'h1',date:'2026-11-11',title:'립트릴 다시',source:'homework',sourceId:'a1',completed:true},
    {id:'t1',date:'2026-11-11',title:'호흡 (8분)',source:'personal',completed:true},
    {id:'rec',date:'2026-11-11',title:'후렴 · 힘 빼기 · 10분씩 3일',source:'recommendation',sourceId:'rec:1',recommendation:{minutes:10},completed:true},
    {id:'new',date:'2026-11-11',title:'처음 하는 목표',source:'personal',completed:true});
  const goal=id=>db.dailyGoals.find(g=>g.id===id);
  assert.deepEqual(R.suggestMinutes(db,goal('new')),{minutes:null,from:''});
  assert.deepEqual(R.suggestMinutes(db,goal('t1')),{minutes:8,from:'goal'});
  assert.deepEqual(R.suggestMinutes(db,goal('rec')),{minutes:10,from:'goal'});
  assert.deepEqual(R.suggestMinutes(db,goal('r:11')),{minutes:null,from:''});
  // The same routine yesterday and the same homework two days ago were saved with a time.
  R.perform(db,'r:10',{minutes:7},1);R.perform(db,'h0',{minutes:25},2);
  assert.deepEqual(R.suggestMinutes(db,goal('r:11')),{minutes:7,from:'last'});
  assert.deepEqual(R.suggestMinutes(db,goal('h1')),{minutes:25,from:'last'});
  assert.deepEqual(R.suggestMinutes(db,goal('new')),{minutes:null,from:''},'another goal is never guessed from');
  // Its own saved time always wins, and a suggestion alone never creates practice time.
  const before=JSON.stringify(db);
  R.suggestMinutes(db,goal('t1'));assert.equal(JSON.stringify(db),before);
  R.perform(db,'t1',{minutes:12},3);
  assert.deepEqual(R.suggestMinutes(db,goal('t1')),{minutes:12,from:'saved'});
  assert.equal(R.savedMinutes(db,goal('t1')),12);assert.equal(R.savedMinutes(db,goal('new')),null);
  R.perform(db,'t1',{minutes:null},4);
  assert.equal(R.savedMinutes(db,goal('t1')),null,'a cleared time is not shown as saved');
  assert.deepEqual(R.suggestMinutes(db,goal('t1')),{minutes:8,from:'goal'});
});

test('suggestMinutes preselects nothing when another flow already recorded this goal\'s time; savedMinutes follows the practice row',()=>{
  const db=base();
  db.dailyGoals.push({id:'h1',date:'2026-11-11',title:'립트릴 (8분)',source:'homework',sourceId:'a1',completed:true});
  db.practices.push({id:'guided:x',date:'2026-11-11',manualMinutes:4,completed:['a1']});
  assert.deepEqual(R.suggestMinutes(db,db.dailyGoals.at(-1)),{minutes:null,from:''});
  // The counted time is the practice row 'goal:<id>' (one rule with practice-time-model): an unconfirmed row counts as none.
  db.practices.push({id:'goal:h1',date:'2026-11-11',manualMinutes:9,practiceTimeSource:'unconfirmed'});
  assert.equal(R.savedMinutes(db,db.dailyGoals.at(-1)),null);
  db.practices.at(-1).practiceTimeSource='goal';
  assert.equal(R.savedMinutes(db,db.dailyGoals.at(-1)),9);
});
