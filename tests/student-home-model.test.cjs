/* Run with: node --test tests/student-home-model.test.cjs */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const M=require('../app/student-home-model.js');
const today='2026-11-07';
const day=(date,targetMinutes)=>({id:'day:'+date,period:'day',date,targetMinutes});
const practice=(id,date,minutes,extra={})=>({id,date,minutes,...extra});
const build=(db={},options={})=>M.build(db,{today,...options});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');

test('calendar weeks remain Monday–Sunday across DST, year and month boundaries in four local zones',()=>{
  const modulePath=require.resolve('../app/student-home-model.js');
  const script=`const m=require(process.argv[1]);process.stdout.write(JSON.stringify(['2026-03-08','2026-03-09','2026-11-01','2026-11-02','2027-01-01'].map(today=>{const w=m.build({}, {today}).week;return [w.start,w.end,w.days.map(d=>d.date)]})))`;
  for(const TZ of ['UTC','America/New_York','Europe/Berlin','Asia/Seoul']){
    const weeks=JSON.parse(execFileSync(process.execPath,['-e',script,modulePath],{env:{...process.env,TZ},encoding:'utf8'}));
    assert.deepEqual(weeks.map(w=>w.slice(0,2)),[
      ['2026-03-02','2026-03-08'],['2026-03-09','2026-03-15'],
      ['2026-10-26','2026-11-01'],['2026-11-02','2026-11-08'],['2026-12-28','2027-01-03']]);
    for(const week of weeks)assert.equal(new Set(week[2]).size,7);
  }
});

test('0, 99, 100, 120 and 121 percent select the promised flower states',()=>{
  for(const [minutes,state] of [[0,'empty'],[99,'partial'],[100,'met'],[120,'met'],[121,'high']]){
    const result=build({practices:[practice('p',today,minutes)],practicePlans:[day(today,100)]});
    const column=result.week.days.find(d=>d.today);
    assert.equal(column.state,state);
    assert.equal(column.ratio,minutes);
    assert.equal(column.today,true);
  }
});

test('future time is ignored and missing or zero targets never divide by zero',()=>{
  const result=build({practices:[practice('a',today,10),practice('b','2026-11-08',900)],
    practicePlans:[day(today,0),day('2026-11-08',30)]});
  assert.equal(result.week.actualMinutes,10);
  assert.equal(result.week.days[5].state,'unplanned');
  assert.equal(result.week.days[5].ratio,null);
  assert.equal(result.week.days[6].state,'future');
  assert.equal(result.week.days[6].minutes,0);
  assert.equal(result.week.targetMinutes,180);
  assert.equal(result.week.ratio,10/180*100);
  assert.equal(build().week.days.filter(d=>d.today).length,1);
});

test('weekly target uses the explicit plan or all seven explicit daily plans',()=>{
  const dates=build().week.days.map(d=>d.date);
  const plans=dates.map(date=>day(date,30));
  assert.equal(build({practicePlans:plans}).week.targetMinutes,210);
  assert.equal(build({practicePlans:plans.slice(1)}).week.targetMinutes,210);
  const weekly={id:'week:2026-11-02',period:'week',date:'2026-11-02',targetMinutes:180};
  assert.equal(build({practicePlans:[...plans,weekly]}).week.targetMinutes,180);
  assert.equal(build({practicePlans:[{...weekly,targetMinutes:0}]}).week.ratio,null);
});

test('actual time prefers manual minutes, deduplicates IDs and never adds media durations',()=>{
  const result=build({practices:[
    practice('a',today,40,{manualMinutes:10,mediaIds:['file'],durationSeconds:3600}),
    practice('a',today,999),practice('b',today,'20'),
    practice('c',today,99,{manualMinutes:0}),practice('d',today,5,{manualMinutes:'bad'}),
    practice('e',today,-10),practice('f','bad-date',100)],
    media:[{id:'file',durationSeconds:7200,date:today}],
    lessons:[{id:'l',date:today,minutes:60,status:'done'}]});
  assert.equal(result.week.actualMinutes,35);
  assert.equal(result.week.streak,1);
});

test('newer duplicate practice version wins once',()=>{
  const result=build({practices:[
    practice('a',today,10,{updatedAt:1}),practice('a',today,20,{updatedAt:2})]});
  assert.equal(result.week.actualMinutes,20);
});

test('shared ledger includes recording time and keeps last week available after Monday midnight',()=>{
  const db={practices:[practice('manual','2026-11-08',4)]};
  const timeEntries=[{date:'2026-11-08',minutes:4},{date:'2026-11-08',minutes:225/60},
    {date:'2026-11-08',minutes:191/60},{date:'2026-11-08',minutes:232/60}];
  const before=M.build(db,{today:'2026-11-08',timeEntries});
  assert.equal(before.week.actualMinutes,14.8);
  const after=M.build(db,{today:'2026-11-09',timeEntries});
  assert.equal(after.week.start,'2026-11-09');assert.equal(after.week.actualMinutes,0);
  const previous=M.build(db,{today:'2026-11-09',weekStart:'2026-11-02',timeEntries});
  assert.equal(previous.week.actualMinutes,before.week.actualMinutes);
  assert.equal(previous.week.days[6].date,'2026-11-08');
  assert.equal(previous.week.days[6].today,false);assert.equal(previous.week.current,false);
  assert.equal(previous.today,'2026-11-09');assert.equal(db.practices[0].minutes,4);
});

test('browsing another week does not shift today, daily goals, streak, or future time into the past',()=>{
  const db={practices:[practice('p','2026-11-08',10)],dailyGoals:[{id:'g',date:'2026-11-09',title:'Today'}]};
  const past=M.build(db,{today:'2026-11-09',weekStart:'2026-11-02'});
  assert.equal(past.week.streak,1);assert.equal(past.goals[0].id,'g');
  const future=M.build(db,{today:'2026-11-09',weekStart:'2026-11-16',timeEntries:[{date:'2026-11-16',minutes:100}]});
  assert.equal(future.week.actualMinutes,0);assert.ok(future.week.days.every(d=>d.state==='future'));
  assert.throws(()=>M.build(db,{today:'2026-11-09',weekStart:'invalid'}),/주간 날짜/);
});

test('streak survives an unpracticed today, ends at a gap and ignores future dates',()=>{
  const practices=[practice('a','2026-11-06',1),practice('b','2026-11-05',1),
    practice('c','2026-11-03',99),practice('f','2026-11-08',99)];
  assert.equal(build({practices}).week.streak,2);
  assert.equal(build({practices:[...practices,practice('t',today,1)]}).week.streak,3);
  assert.equal(build({practices:[practice('c','2026-11-05',10)]}).week.streak,0);
});

test('empty and 900-item goal lists have distinct, finite progress',()=>{
  assert.deepEqual(build().goalProgress,{total:0,completed:0,ratio:null});
  const goals=Array.from({length:900},(_,i)=>({id:'g'+i,date:today,title:'목표 '+i,source:'personal',completed:i<300,order:i}));
  const result=build({dailyGoals:goals});
  assert.equal(result.goals.length,900);
  assert.equal(result.goalProgress.total,900);
  assert.equal(result.goalProgress.completed,300);
  assert.ok(Math.abs(result.goalProgress.ratio-100/3)<1e-10);
});

test('long goal text and source survive; checking changes one record without creating actual practice',()=>{
  const title='<script> & 긴 목표 '.repeat(300);
  const db={dailyGoals:[
    {id:'a',date:today,title,source:'homework',sourceId:'assignment',completed:false,order:0},
    {id:'b',date:today,title:'개인',source:'personal',completed:true,order:1},
    {id:'c',date:'2026-11-06',title:'이전',source:'recommendation',completed:false,order:0}],
    assignments:[{id:'assignment',title,status:'active'}],practices:[],lessons:[]};
  const originals=hash({assignments:db.assignments,practices:db.practices,lessons:db.lessons});
  const other=hash(db.dailyGoals.slice(1));
  assert.equal(M.setGoal(db,'a',true),true);
  assert.equal(hash(db.dailyGoals.slice(1)),other);
  assert.equal(hash({assignments:db.assignments,practices:db.practices,lessons:db.lessons}),originals);
  assert.equal(build(db).goals[0].title,title);
  assert.equal(build(db).goals[0].sourceId,'assignment');
  assert.equal(build(db).week.actualMinutes,0);
  assert.equal(M.setGoal(db,'missing',true),false);
  M.setGoal(db,'a',false);
  assert.equal(db.dailyGoals[0].completed,false);
});

test('recommendations respect homework dates and remain separate from saved goals',()=>{
  const result=build({assignments:[
    {id:'open',title:'오늘 숙제',status:'active',startDate:today,dueDate:today},
    {id:'legacy',title:'기간 없는 숙제'},
    {id:'done',title:'완료',status:'done'},
    {id:'later',title:'나중',startDate:'2026-11-08'},
    {id:'past',title:'과거',dueDate:'2026-11-06'}]});
  assert.deepEqual(result.recommendationCandidates.map(t=>t.sourceId),['open','legacy']);
  assert.equal(result.recommendationCandidates[0].source,'homework');
  assert.equal(result.goals.length,0);
});

test('nearest future show uses its actual session, with start fallback and cancellation filtering',()=>{
  const db={songs:[{id:'song',title:'곡명'}],performances:[
    {id:'late',title:'나중 공연',start:'2026-11-08',status:'preparing'},
    {id:'near',title:'연속 공연',start:'2026-10-01',end:'2026-12-01',status:'preparing',songLinks:[{songId:'song'}],
      sessions:[{id:'old',date:'2026-10-01'},{id:'today',date:today,time:'19:00'},{id:'next',date:'2026-11-10'}]},
    {id:'cancelled',start:today,status:'cancelled'},
    {id:'completed',start:today,status:'completed'}]};
  const result=build(db);
  assert.equal(result.stage.id,'near');
  assert.equal(result.stage.session.id,'today');
  assert.equal(result.stage.date,today);
  assert.equal(result.stage.daysUntil,0);
  assert.deepEqual(result.stage.songTitles,['곡명']);
  assert.equal(build({performances:[db.performances[0]]}).stage.daysUntil,1);
  assert.equal(build({performances:db.performances.slice(2)}).stage,null);
  assert.equal(build({performances:[{id:'past',start:'2026-10-01',end:'2026-12-01'}]}).stage,null);
  const sessionOnly=build({performances:[{id:'p',start:'2026-10-01',sessions:[
    {id:'skip',date:today,status:'cancelled'},{id:'next',date:'2026-11-09'}]}]}).stage;
  assert.equal(sessionOnly.session.id,'next');
});

test('next lesson excludes legacy completed records, cancellations and past dates',()=>{
  const result=build({lessons:[
    {id:'legacy',date:today},{id:'done',date:today,status:'done'},
    {id:'cancelled',date:today,status:'cancelled'},
    {id:'past',date:'2026-11-06',status:'scheduled'},
    {id:'later',date:'2026-11-08',status:'scheduled'},
    {id:'pm',date:today,startTime:'18:00',status:'scheduled'},
    {id:'am',date:today,startTime:'10:00',status:'scheduled'}]});
  assert.equal(result.lesson.id,'am');
  assert.equal(build().lesson,null);
});

test('recent song uses actual practice date then created order and skips absent songs or future dates',()=>{
  const result=build({songs:[{id:'a',title:'A'},{id:'b',title:'B'}],practices:[
    practice('a','2026-11-06',10,{songId:'a',created:999}),
    practice('b',today,10,{songId:'b',created:1}),
    practice('c',today,10,{songId:'a',created:2}),
    practice('missing',today,10,{songId:'deleted',created:3}),
    practice('training',today,10,{songId:'b',practiceMode:'training',created:4}),
    practice('future','2026-11-08',10,{songId:'b',created:999})]});
  assert.equal(result.recent.song.id,'a');
  assert.equal(result.recent.practice.id,'c');
  assert.equal(build().recent,null);
});

test('build accepts frozen legacy input and returns detached data without mutating any source',()=>{
  const db={dailyGoals:[{id:'g',date:today,title:'목표',completed:false,order:0}],
    songs:[{id:'s',title:'노래'}],practices:[practice('p',today,10,{songId:'s'})],
    assignments:[{id:'hw',title:'숙제'}],
    performances:[{id:'stage',title:'무대',start:today,sessions:[]}],
    lessons:[{id:'lesson',date:today,status:'scheduled'}],practicePlans:[day(today,30)]};
  const before=hash(db);
  const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze)}};
  freeze(db);
  const result=build(db);
  assert.equal(hash(db),before);
  result.goals[0].title='changed';
  result.recent.song.title='changed';
  result.stage.title='changed';
  result.lesson.date='changed';
  assert.equal(hash(db),before);
  assert.throws(()=>build({}, {today:'2026-02-30'}));
});

test('saving a plan preserves old IDs, ordering, completion and other dates; saves only explicit targets',()=>{
  const db={dailyGoals:[
    {id:'a',date:today,title:'A',source:'homework',sourceId:'hw',completed:true,order:0,updatedAt:1},
    {id:'b',date:today,title:'B',source:'personal',completed:false,order:1},
    {id:'other',date:'2026-11-06',title:'다른 날짜',source:'personal',completed:true,order:0}],
    practicePlans:[day('2026-11-06',45)],assignments:[{id:'hw',status:'active'}],practices:[]};
  const other=hash(db.dailyGoals[2]),original=hash(db.assignments);
  M.savePlan(db,{date:today,goals:[{id:'b',title:'B 수정'},{id:'a',title:'A'},{id:'new',title:'새 목표',source:'recommendation'}],
    targetMinutes:60,weekTargetMinutes:240});
  const result=build(db);
  assert.deepEqual(result.goals.map(g=>g.id),['a','b','new']);
  assert.equal(result.goals[0].completed,true);
  assert.equal(result.goals[0].sourceId,'hw');
  assert.equal(hash(db.dailyGoals.find(g=>g.id==='other')),other);
  assert.equal(hash(db.assignments),original);
  assert.equal(result.week.targetMinutes,240);
  assert.equal(db.practicePlans.find(p=>p.id==='day:'+today).targetMinutes,60);
  assert.equal(db.practicePlans.find(p=>p.id==='week:2026-11-02').date,'2026-11-02');
  assert.equal(db.practicePlans.find(p=>p.id==='day:2026-11-06').targetMinutes,45);
  M.savePlan(db,{date:today,targetMinutes:null});
  assert.equal(build(db).goals.length,3);
  assert.equal(db.practicePlans.find(p=>p.id==='day:'+today).targetMinutes,null);
  M.savePlan(db,{date:today,goals:[]});
  assert.equal(build(db).goals.length,0);
  assert.equal(db.practicePlans.find(p=>p.id==='week:2026-11-02').targetMinutes,240);
});

test('invalid plan writes are atomic and cannot reuse a goal ID from another date',()=>{
  const db={dailyGoals:[{id:'other',date:'2026-11-06',title:'어제'}],practicePlans:[]};
  const before=hash(db);
  for(const input of [
    {date:today,goals:[{id:'other',title:'충돌'}]},
    {date:today,goals:[{title:'ID없음'}]},
    {date:today,goals:[{id:'x',title:'A'},{id:'x',title:'B'}]},
    {date:today,goals:[{id:'x',title:'정상'}],targetMinutes:-1},
    {date:'2026-02-30',targetMinutes:10}]){
    assert.throws(()=>M.savePlan(db,input));
    assert.equal(hash(db),before);
  }
});


test('week navigation stops at the first record and this week without future schedules',()=>{
 const empty=M.build({}, {today:'2026-11-09'}).week;
 assert.equal(empty.canPrevious,false);assert.equal(empty.canNext,false);
 const db={lessons:[{id:'l',date:'2026-10-28'}],practices:[{id:'p',date:'2026-11-02',minutes:1}]};
 const options={today:'2026-11-09',mediaDates:['2026-10-18','invalid']};
 assert.deepEqual(M.weekBounds(db,options),{first:'2026-10-12',last:'2026-11-09',current:'2026-11-09'});
 const first=M.build(db,{...options,weekStart:'2026-10-12'}).week;
 assert.equal(first.canPrevious,false);assert.equal(first.canNext,true);
 const current=M.build(db,options).week;assert.equal(current.canPrevious,true);assert.equal(current.canNext,false);
});
test('future schedule weeks extend the upper boundary, excluding cancellations and deleted records',()=>{
 const db={lessons:[{id:'past',date:'2025-12-24'},{id:'next',date:'2026-01-14',status:'scheduled'},{id:'cancel',date:'2030-01-01',status:'cancelled'},{id:'deleted',date:'2040-01-01'}],performances:[{id:'show',start:'2026-01-30',sessions:[{date:'2026-01-18'}]},{id:'cancelShow',start:'2050-01-01',status:'cancelled'}],deleted:{lessons:['deleted']}};
 const options={today:'2026-01-01',mediaDates:['2026-12-01']};
 assert.deepEqual(M.weekBounds(db,options),{first:'2025-12-22',last:'2026-01-12',current:'2025-12-29'});
 const last=M.build(db,{...options,weekStart:'2026-01-12'}).week;assert.equal(last.canNext,false);assert.equal(last.canPrevious,true);
});

 test('past weeks use 30 minutes per unplanned day without changing saved records',()=>{
 const db={practicePlans:[day('2026-11-02',45)]},before=JSON.stringify(db);
 const result=M.build(db,{today:'2026-11-09',weekStart:'2026-11-02'});
 assert.equal(result.week.targetMinutes,225);
 assert.deepEqual(result.week.days.map(d=>d.targetMinutes),[45,30,30,30,30,30,30]);
 assert.equal(JSON.stringify(db),before);
 });
