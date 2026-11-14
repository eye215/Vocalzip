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

test('daily time and selected goals contribute independently to each weekly mark',()=>{
  const date=today,base={id:'g',date,title:'발성',source:'personal',completed:false};
  const view=(minutes,completed,goals=[base])=>build({dailyGoals:goals.map(g=>({...g,completed})),practices:[practice('p',date,minutes)]},{defaultDailyTargetMinutes:30}).week.days.find(d=>d.date===date);
  assert.deepEqual([view(40,false).timeMet,view(40,false).goalsComplete],[true,false]);
  assert.deepEqual([view(10,true).timeMet,view(10,true).goalsComplete],[false,true]);
  assert.deepEqual([view(40,true).timeMet,view(40,true).goalsComplete],[true,true]);
  assert.deepEqual([view(40,true,[]).timeMet,view(40,true,[]).goalsComplete],[true,false]);
  assert.equal(view(40,true).targetMinutes,30);
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

test('shared ledger excludes recording time and keeps last week available after Monday midnight',()=>{
  const db={practices:[practice('manual','2026-11-08',4)]};
  const timeEntries=[{date:'2026-11-08',minutes:4},{date:'2026-11-08',minutes:225/60,kind:'recording'},
    {date:'2026-11-08',minutes:191/60,kind:'recording'},{date:'2026-11-08',minutes:232/60,kind:'recording'}];
  const before=M.build(db,{today:'2026-11-08',timeEntries});
  assert.equal(before.week.actualMinutes,4);
  const after=M.build(db,{today:'2026-11-09',timeEntries});
  assert.equal(after.week.start,'2026-11-09');assert.equal(after.week.actualMinutes,0);
  const previous=M.build(db,{today:'2026-11-09',weekStart:'2026-11-02',timeEntries});
  assert.equal(previous.week.actualMinutes,before.week.actualMinutes);
  assert.equal(previous.week.days[6].date,'2026-11-08');
  assert.equal(previous.week.days[6].today,false);assert.equal(previous.week.current,false);
  assert.equal(previous.today,'2026-11-09');assert.equal(db.practices[0].minutes,4);
});

test('browsing another week keeps today and daily goals while the streak follows the selected week',()=>{
  const db={practices:[practice('p','2026-11-08',10)],dailyGoals:[{id:'g',date:'2026-11-09',title:'Today'}]};
  const past=M.build(db,{today:'2026-11-09',weekStart:'2026-11-02'});
  assert.equal(past.week.streak,1);assert.equal(past.goals[0].id,'g');
  const future=M.build(db,{today:'2026-11-09',weekStart:'2026-11-16',timeEntries:[{date:'2026-11-16',minutes:100}]});
  assert.equal(future.week.actualMinutes,0);assert.equal(future.week.streak,0);assert.ok(future.week.days.every(d=>d.state==='future'));
  assert.throws(()=>M.build(db,{today:'2026-11-09',weekStart:'invalid'}),/주간 날짜/);
});

test('weekly streak crosses Sunday to Monday and restarts after a missed day',()=>{
  const dates=['2026-11-02','2026-11-04','2026-11-06','2026-11-08','2026-11-09','2026-11-10'];
  const practices=dates.map((date,i)=>practice(String(i),date,10));
  assert.equal(M.build({practices},{today:'2026-11-10',weekStart:'2026-11-09'}).week.streak,3);
  assert.equal(M.build({practices},{today:'2026-11-10',weekStart:'2026-11-02'}).week.streak,1);
  const interrupted=['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-06','2026-11-08','2026-11-10']
    .map((date,i)=>practice('gap'+i,date,10));
  assert.equal(M.build({practices:interrupted},{today:'2026-11-10',weekStart:'2026-11-09'}).week.streak,1);
});

test('weekly streak uses the latest practice in the displayed week and stops at a gap',()=>{
  const practices=[practice('a','2026-11-06',1),practice('b','2026-11-05',1),
    practice('c','2026-11-03',99),practice('f','2026-11-08',99)];
  assert.equal(build({practices}).week.streak,2);
  assert.equal(build({practices:[...practices,practice('t',today,1)]}).week.streak,3);
  assert.equal(build({practices:[practice('c','2026-11-05',10)]}).week.streak,1);
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
test('legacy duplicate practice room goals show once and toggle together',()=>{
  const first={id:'practice-room:submission-one:next',date:today,title:'짧은 선율 따라 부르기',source:'personal',sourceId:'practice-room:submission-one',completed:false,order:0};
  const second={...first,id:'practice-room:submission-two:next',sourceId:'practice-room:submission-two',completed:true,order:1};
  const unrelated={id:'manual',date:today,title:first.title,source:'personal',sourceId:'',completed:false,order:2};
  const db={dailyGoals:[first,second,unrelated]};
  const view=build(db);
  assert.equal(view.goalProgress.total,2);
  assert.equal(view.goalProgress.completed,1);
  assert.deepEqual(view.goals.map(g=>g.id),[first.id,unrelated.id]);
  assert.equal(M.setGoal(db,first.id,false),true);
  assert.equal(db.dailyGoals[1].completed,false);
  assert.equal(db.dailyGoals[2].completed,false);
  assert.equal(M.setGoal(db,first.id,true),true);
  assert.deepEqual(db.dailyGoals.map(g=>g.completed),[true,true,false]);
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
  assert.deepEqual(result.recommendationCandidates.map(t=>t.sourceId),['open','legacy','basic:breathing']);
  assert.equal(result.recommendationCandidates[0].source,'homework');
  assert.equal(result.recommendationCandidates[2].source,'recommendation');
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
  // Leaving every goal out removes the open ones; the completed goal stays.
  M.savePlan(db,{date:today,goals:[]});
  assert.deepEqual(build(db).goals.map(g=>[g.id,g.completed]),[['a',true]]);
  assert.equal(db.practicePlans.find(p=>p.id==='week:2026-11-02').targetMinutes,240);
});

test('saving a plan never drops a completed goal or a goal with a 수행 기록, and leaves practice rows alone',()=>{
  const db={dailyGoals:[
    {id:'done',date:today,title:'완료',source:'personal',completed:true,order:0,performance:{minutes:12,mediaIds:['m1'],at:5}},
    {id:'r:'+today,date:today,title:'반복',source:'personal',sourceId:'r',routineId:'r',routine:true,completed:true,order:1},
    {id:'r:2026-11-08',date:'2026-11-08',title:'반복',source:'personal',sourceId:'r',routineId:'r',routine:true,completed:false,order:0},
    {id:'unchecked',date:today,title:'체크를 푼 목표',source:'homework',sourceId:'hw',completed:false,order:2},
    {id:'open',date:today,title:'아직',source:'personal',completed:false,order:3}],
    practicePlans:[{id:'r',kind:'routine',title:'반복',days:2,startDate:today,endDate:'2026-11-08',archived:false,changes:[]}],
    practices:[{id:'goal:done',date:today,manualMinutes:12,goalId:'done'},{id:'goal:unchecked',date:today,manualMinutes:7,goalId:'unchecked'}]};
  assert.equal(M.keptGoal(db,db.dailyGoals[0]),'done');
  assert.equal(M.keptGoal(db,db.dailyGoals[3]),'recorded');
  assert.equal(M.keptGoal(db,db.dailyGoals[4]),'');
  const rows=()=>hash(db.dailyGoals.filter(g=>!['open','new'].includes(g.id)).sort((a,b)=>a.id.localeCompare(b.id)));
  const kept=rows(),practices=hash(db.practices),plans=hash(db.practicePlans);
  M.savePlan(db,{date:today,goals:[{id:'new',title:'새 목표'}]});
  assert.equal(rows(),kept);
  assert.deepEqual(build(db).goals.map(g=>g.id),['done','r:'+today,'unchecked','new']);
  assert.equal(hash(db.practices),practices);
  assert.equal(hash(db.practicePlans),plans);
  // Every goal practice row still has its goal.
  for(const p of db.practices)assert.ok(db.dailyGoals.some(g=>g.id===p.goalId));
  // A kept goal passed back by the editor is written once, not twice.
  M.savePlan(db,{date:today,goals:build(db).goals});
  assert.deepEqual(build(db).goals.map(g=>g.id),['done','r:'+today,'unchecked','new']);
  assert.equal(db.dailyGoals.filter(g=>g.date===today).length,4);
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

test('unconfirmed imports cannot satisfy a goal even when an adapter supplies old totals',()=>{
 const pending={id:'new',date:today,minutes:99,manualMinutes:99,practiceTimeSource:'unconfirmed'};
 const result=M.build({practices:[pending]},{today,timeEntries:[{date:today,minutes:99,kind:'practice',ref:pending}]});
 assert.equal(result.week.actualMinutes,0);
});

// 2026-11-13: the home says where the week target comes from, and one helper gives today's time against its target.
test('week target source: this week\'s plan, the daily setting on all seven days, or a sum that includes day plans',()=>{
  const weekly={id:'week:2026-11-02',period:'week',date:'2026-11-02',targetMinutes:180};
  const pick=w=>[w.targetMinutes,w.targetSource,w.dailyTargetMinutes];
  assert.deepEqual(pick(build({},{defaultDailyTargetMinutes:30}).week),[210,'daily',30]);
  assert.deepEqual(pick(build({practicePlans:[weekly]},{defaultDailyTargetMinutes:30}).week),[180,'week',30]);
  assert.deepEqual(pick(build({practicePlans:[day(today,45)]},{defaultDailyTargetMinutes:30}).week),[225,'days',30]);
  // No daily setting: only past days fall back to 30 minutes, so this week has no target yet.
  assert.deepEqual(pick(build({}).week),[null,null,null]);
  assert.deepEqual(pick(M.build({},{today:'2026-11-09',weekStart:'2026-11-02'}).week),[210,'days',null]);
});

const Today=require('../app/today-practice.js');
test('today practice helper: minutes, target and percent come from the home week model',()=>{
  const db={practices:[practice('a',today,99,{manualMinutes:22}),practice('b','2026-11-06',40),practice('c',today,50,{practiceTimeSource:'unconfirmed'})],practicePlans:[]};
  const before=JSON.stringify(db),options={date:today,today,defaultDailyTargetMinutes:30};
  assert.deepEqual(Today.compute(db,options),{minutes:22,targetMinutes:30,percent:73});
  assert.equal(Today.compute(db,options).minutes,build(db,{defaultDailyTargetMinutes:30}).week.days.find(d=>d.today).minutes,'no second counting rule');
  assert.equal(Today.text(Today.compute(db,options)),'오늘 22분 / 목표 30분 · 73%');
  // A day plan wins over the daily setting; another day is read by its own date.
  assert.deepEqual(Today.compute({...db,practicePlans:[day(today,20)]},options),{minutes:22,targetMinutes:20,percent:110});
  assert.deepEqual(Today.compute(db,{...options,date:'2026-11-06'}),{minutes:40,targetMinutes:30,percent:133});
  // No target: null target and percent, and the text says so.
  assert.deepEqual(Today.compute(db,{date:today,today}),{minutes:22,targetMinutes:null,percent:null});
  assert.equal(Today.text(Today.compute(db,{date:today,today})),'오늘 22분 · 목표 없음');
  assert.deepEqual(Today.compute({...db,practicePlans:[day(today,0)]},{date:today,today}),{minutes:22,targetMinutes:null,percent:null});
  // 0 minutes and more than 100%.
  assert.deepEqual(Today.compute({},options),{minutes:0,targetMinutes:30,percent:0});
  assert.equal(Today.text(Today.compute({},options)),'오늘 0분 / 목표 30분 · 0%');
  assert.equal(Today.text(Today.compute({},{date:today,today})),'오늘 0분 · 목표 없음');
  const over=Today.compute({practices:[practice('x',today,65)]},options);
  assert.deepEqual(over,{minutes:65,targetMinutes:30,percent:217});
  assert.equal(Today.text(over),'오늘 1시간 5분 / 목표 30분 · 217%');
  assert.equal(Today.text({minutes:60,targetMinutes:90,percent:67}),'오늘 1시간 / 목표 1시간 30분 · 67%');
  assert.equal(JSON.stringify(db),before);
});

test('a new personal goal may name its song (목표로 넣기 from a score memo); goals made without one are unchanged',()=>{
  const db={dailyGoals:[{id:'a',date:today,title:'A',source:'personal',sourceId:'',completed:false,order:0}],practicePlans:[],practices:[]};
  M.savePlan(db,{date:today,goals:[...build(db).goals,{id:'memo',title:'2절 숨 크게',source:'personal',sourceId:'',songId:'s1',completed:false},{id:'hand',title:'손으로 적은 목표',source:'personal',sourceId:'',completed:false}]});
  assert.deepEqual(db.dailyGoals.map(g=>[g.id,g.songId,g.order]),[['a',undefined,0],['memo','s1',1],['hand',undefined,2]]);
  // Same fields as a goal typed in 오늘의 목표, plus the song.
  assert.deepEqual(Object.keys(db.dailyGoals[1]).sort(),[...Object.keys(db.dailyGoals[2]),'songId'].sort());
  // Saving the day again keeps the song; an existing goal does not pick one up.
  M.savePlan(db,{date:today,goals:build(db).goals.map(g=>g.id==='a'?{...g,songId:'s9'}:g)});
  assert.deepEqual(db.dailyGoals.map(g=>[g.id,g.songId]),[['a',undefined],['memo','s1'],['hand',undefined]]);
});
