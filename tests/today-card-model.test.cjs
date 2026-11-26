/* Run with: node --test tests/today-card-model.test.cjs
 * 오늘 연습 (app/today-card.js): one list of 계획 (today's goals) and 추가 (today's records linked to no goal). */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../app/today-card.js');
const Time=require('../app/practice-time-model.js');
const today='2026-11-26';
const songs={s1:'On My Own',s2:'Defying Gravity'};
const songTitle=id=>songs[id]||'';
const manual=(id,date,minutes,extra={})=>({id,date,minutes,manualMinutes:minutes,practiceTimeSource:'manual',mediaSeconds:0,mediaIds:[],practiceMode:'training',technique:[],songId:'',
  categoryId:'',categoryLabel:'',detail:'',detail2:'',recommendationSource:'',recommendationSourceId:'',rating:0,memo:'',completed:[],assignmentReps:{},assignmentNotes:{},created:Date.UTC(2026,10,26,1,20),...extra});
const seed=()=>({
  dailyGoals:[
    {id:'g1',date:today,title:'2절 브릿지 호흡 위치',source:'homework',sourceId:'hw1',completed:true,order:0},
    {id:'g2',date:today,title:'허밍 롱톤 8초',source:'personal',sourceId:'',completed:false,order:1},
    {id:'g3',date:today,title:'가사 1절 외우기',source:'personal',sourceId:'',completed:true,order:2}],
  practices:[
    {id:'goal:g1',date:today,minutes:12,manualMinutes:12,practiceTimeSource:'goal',goalId:'g1',completed:['hw1'],assignmentReps:{hw1:1}},
    {id:'goal:g3',date:today,minutes:8,manualMinutes:8,practiceTimeSource:'goal',goalId:'g3',completed:[],assignmentReps:{}},
    manual('p1',today,15,{songId:'s1',practiceMode:'song',categoryId:'c1',categoryLabel:'호흡'}),
    manual('p2',today,10),
    manual('old',  '2026-11-25',20)],
  assignments:[{id:'hw1',title:'2절 브릿지 호흡 위치',status:'active'}],
  practicePlans:[],categories:[{id:'c1',name:'호흡',items:[]}]
});
const dayMinutes=(db,date)=>Time.records(db.practices).filter(p=>p.date===date).reduce((n,p)=>n+Time.actualMinutes(p),0);

test('the list: 계획 rows are today\'s goals with their linked minutes; 추가 rows are today\'s records linked to no goal',()=>{
  const db=seed(),before=JSON.stringify(db),x=T.build(db,{today,songTitle});
  assert.deepEqual(x.plan.map(g=>[g.id,g.title,g.done,g.tag,g.minutes]),[['g1','2절 브릿지 호흡 위치',true,'숙제',12],['g2','허밍 롱톤 8초',false,'계획',0],['g3','가사 1절 외우기',true,'계획',8]]);
  assert.deepEqual(x.extra.map(r=>[r.id,r.title,r.minutes,r.editable,r.undecided]),[['p1','호흡 · On My Own',15,true,false],['p2','연습 · '+new Date(Date.UTC(2026,10,26,1,20)).getHours().toString().padStart(2,'0')+':20 · 아직 안 정함',10,true,true]]);
  // "계획 n/m" counts only 계획 rows; 추가 is its own count.
  assert.deepEqual(x.counts,{planDone:2,planTotal:3,extra:2});
  assert.deepEqual(x.open.map(o=>o.id),['p1','p2']);
  assert.equal(JSON.stringify(db),before,'reading writes nothing');
});

test('a practice of a homework (completed, as 연습 기록 시트 writes it) sits under that homework goal, not as 추가',()=>{
  const db=seed();db.practices.push(manual('hwp',today,7,{completed:['hw1'],assignmentReps:{hw1:1}}));
  const x=T.build(db,{today,songTitle});
  assert.equal(x.plan[0].minutes,19);
  assert.ok(!x.extra.some(r=>r.id==='hwp'));
  // The rows of one 오늘의 연습 run are one 추가 row and are never linked by their homework ids.
  db.practices.push({id:'practice-set:run1',date:today,minutes:9,manualMinutes:9,practiceTimeSource:'practice-set',practiceSetId:'run1',completed:['hw1'],dailySet:{v:1,items:[]}},
    {id:'practice-set:run1:song',date:today,minutes:4,manualMinutes:4,practiceTimeSource:'practice-set',practiceSetId:'run1',songId:'s1'});
  const y=T.build(db,{today,songTitle}),set=y.extra.find(r=>r.kind==='set');
  assert.deepEqual([set.title,set.minutes,set.editable,set.linkable],['오늘의 연습',13,false,false]);
  assert.equal(y.plan[0].minutes,19);
  assert.ok(!y.open.some(o=>o.id===set.id));
});

test('linking an unlinked record checks the goal and moves the record under it: no new row, minutes counted once',()=>{
  const db=seed(),rows=db.practices.length,total=dayMinutes(db,today);
  assert.equal(T.link(db,{goalId:'g2',practiceId:'p2'}),true);
  assert.equal(db.practices.length,rows,'no row is added');
  assert.equal(dayMinutes(db,today),total,'today\'s minutes are unchanged');
  const p2=db.practices.find(p=>p.id==='p2');
  assert.equal(p2.goalId,'g2');assert.equal(p2.manualMinutes,10);
  assert.equal(db.dailyGoals.find(g=>g.id==='g2').completed,true);
  const x=T.build(db,{today,songTitle});
  assert.equal(x.plan.find(g=>g.id==='g2').minutes,10);
  assert.deepEqual(x.extra.map(r=>r.id),['p1']);
  assert.deepEqual(x.counts,{planDone:3,planTotal:3,extra:1});
  // A linked record is not offered again, and cannot be taken by another goal.
  assert.ok(!x.open.some(o=>o.id==='p2'));
  assert.throws(()=>T.link(db,{goalId:'g3',practiceId:'p2'}),/이미 다른 계획/);
  // Linking it to its own goal again changes nothing.
  const again=JSON.stringify(db);T.link(db,{goalId:'g2',practiceId:'p2'});assert.equal(JSON.stringify(db),again);
});

test('linking to a homework goal counts one practice of the homework on that record; the homework is not marked done',()=>{
  const db=seed();db.dailyGoals[0].completed=false;
  T.link(db,{goalId:'g1',practiceId:'p2'});
  const p2=db.practices.find(p=>p.id==='p2');
  assert.deepEqual([p2.completed,p2.assignmentReps],[['hw1'],{hw1:1}]);
  assert.equal(db.assignments[0].status,'active');
  assert.equal(Time.homeworkProgress(db,'hw1').reps,2,'the goal\'s own row and the linked record');
});

test('a goal\'s own row, a set row and another day\'s record cannot be linked',()=>{
  const db=seed();
  assert.throws(()=>T.link(db,{goalId:'g2',practiceId:'goal:g3'}));
  assert.throws(()=>T.link(db,{goalId:'g2',practiceId:'old'}),/찾지 못했어요/);
  assert.throws(()=>T.link(db,{goalId:'nope',practiceId:'p2'}),/바뀌었어요/);
});

test('repeat hint: the same unplanned song or 분류 as 추가 on three days of the last seven, once, and not when already planned',()=>{
  const day=n=>{const d=new Date(2026,10,26-n,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const db={dailyGoals:[],practicePlans:[],practices:[manual('a',day(0),10,{songId:'s2',practiceMode:'song'}),manual('b',day(2),10,{songId:'s2',practiceMode:'song'})]};
  assert.equal(T.repeatHint(db,{today,songTitle}),null,'two days are not enough');
  db.practices.push(manual('c',day(6),5,{songId:'s2',practiceMode:'song'}));
  const h=T.repeatHint(db,{today,songTitle});
  assert.deepEqual([h.label,h.title,h.days,h.text],['Defying Gravity','Defying Gravity 연습',3,'요즘 ‘Defying Gravity’를 자주 하네요']);
  // A day further back does not count; the same day twice counts once.
  db.practices.splice(2,1,manual('c',day(7),5,{songId:'s2',practiceMode:'song'}),manual('d',day(0),5,{songId:'s2',practiceMode:'song'}));
  assert.equal(T.repeatHint(db,{today,songTitle}),null);
  // 분류 too; records linked to a goal of their day, and screens' own rows, are not "unplanned".
  const cat=n=>manual('k'+n,day(n),10,{categoryId:'c1',categoryLabel:'호흡'});
  const db2={dailyGoals:[{id:'x',date:day(1),title:'호흡',source:'personal',completed:true}],practicePlans:[],practices:[cat(0),cat(1),cat(3)]};
  db2.practices[1].goalId='x';
  assert.equal(T.repeatHint(db2,{today,songTitle}),null);
  db2.practices.push(cat(4));
  assert.equal(T.repeatHint(db2,{today,songTitle}).text,'요즘 ‘호흡’을 자주 하네요');
  db2.practices.push({id:'vc',date:day(5),minutes:1,manualMinutes:1,practiceTimeSource:'voice-check',categoryLabel:'보이스 체크'});
  assert.equal(T.repeatHint(db2,{today,songTitle}).label,'호흡');
  // Already a goal today or a running routine with that title: no hint.
  db2.dailyGoals.push({id:'t',date:today,title:'호흡 연습',source:'personal',completed:false});
  assert.equal(T.repeatHint(db2,{today,songTitle}),null);
});

test('을/를 after a name',()=>{
  assert.deepEqual(['호흡','발성','On My Own','Defying Gravity','가사','리듬','Song 2'].map(T.object),['을','을','을','를','를','을','를']);
});
