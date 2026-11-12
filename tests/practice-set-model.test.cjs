// 오늘 연습 세트: default set, real-time accounting, goal links and idempotent saves (app/practice-set-model.js).
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../app/practice-set-model.js'),Time=require('../app/practice-time-model.js'),R=require('../app/goal-routines.js');
const TODAY='2026-11-04'; // Wednesday
const seed=()=>({
  categories:[{id:'c-voice',name:'발성',items:['립트릴']}],
  songs:[{id:'s1',title:'This Is the Moment'},{id:'s2',title:'Defying Gravity'}],
  assignments:[{id:'a1',title:'호흡을 길게 유지하기',status:'active',startDate:'2026-11-01',dueDate:'2026-11-08'}],
  practices:[{id:'p-old',date:'2026-11-03',minutes:20,manualMinutes:20,songId:'s1',practiceMode:'song'}],
  dailyGoals:[
    {id:'g1',date:TODAY,title:'호흡을 길게 유지하기',source:'homework',sourceId:'a1',completed:false,order:0},
    {id:'g2',date:TODAY,title:'가사 읽기',source:'personal',completed:true,order:1},
    {id:'g3',date:TODAY,title:'후렴 연결',source:'personal',completed:false,order:2,routineId:'routine:r1',routine:true,sourceId:'routine:r1'}
  ],
  practicePlans:[{id:'routine:r1',kind:'routine',title:'후렴 연결',days:7,startDate:'2026-11-01',endDate:'2026-11-07',archived:false,changes:[]}],
  deleted:{}
});
const run=(s,plan)=>{ // plan: [[seconds,'next'|'end'],...] on a fake clock
  let now=1_000_000;P.play(s,now);
  for(const [seconds,action] of plan){for(let i=0;i<seconds;i++){now+=1000;P.tick(s,now);}if(action==='next')P.go(s,s.index+1,now);else if(action==='end')P.end(s,now);}
  return now;
};

test('default set: warm-up, today\'s unfinished goals in order, the recent song section, then an optional take',()=>{
  const {steps}=P.build(seed(),{today:TODAY});
  assert.deepEqual(steps.map(s=>s.kind),['warmup','goal','goal','song','record']);
  assert.equal(steps[0].title,'웜업 · 립트릴');assert.equal(steps[0].categoryId,'c-voice');
  assert.deepEqual(steps.filter(s=>s.kind==='goal').map(s=>s.goalId),['g1','g3']); // completed g2 is not repeated
  assert.equal(steps[2].routine,true);
  assert.equal(steps[3].songId,'s1');assert.equal(steps[4].songId,'s1');assert.equal(steps[4].optional,true);
  assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
  // Editing the list never changes the defaults it is compared with.
  const built=P.build(seed(),{today:TODAY});built.steps[0].minutes=9;built.steps.pop();
  assert.equal(built.base[0].minutes,5);assert.equal(built.base.length,5);
  assert.ok(steps.every(s=>s.minutes>=1));
});

test('a running monthly song plan supplies the song section with its segment; the basic warm-up goal replaces the warm-up',()=>{
  const db=seed();
  db.practicePlans.push({id:'mp1',kind:'monthly-vocal',songId:'s2',metric:'stability',segmentStart:30,segmentEnd:70,minutes:12,days:5,startDate:'2026-11-02',archived:false});
  db.dailyGoals.push({id:'mp1:'+TODAY,date:TODAY,title:'Defying Gravity · 음정 안정성 (0:30–1:10, 12분)',source:'personal',sourceId:'mp1',completed:false,order:3},
    {id:'gb',date:TODAY,title:'호흡과 발성 연습하기',source:'recommendation',sourceId:'basic:breathing',completed:false,order:4});
  const {steps}=P.build(db,{today:TODAY});
  assert.deepEqual(steps.map(s=>s.kind+':'+(s.goalId||s.songId||'')),['goal:gb','goal:g1','goal:g3','goal:mp1:'+TODAY,'record:s2']);
  const song=steps[3];assert.equal(song.segmentStart,30);assert.equal(song.segmentEnd,70);assert.equal(song.minutes,12);assert.equal(song.songId,'s2');
  assert.equal(steps[4].segmentStart,30);
  // A plan without today's goal (e.g. already ended for today) still gives a plain song step.
  const other=seed();other.practicePlans.push({id:'mp2',kind:'monthly-vocal',songId:'s2',segmentStart:10,segmentEnd:20,minutes:8,days:3,startDate:TODAY,archived:false});
  const s2=P.build(other,{today:TODAY}).steps.find(s=>s.kind==='song');
  assert.equal(s2.songId,'s2');assert.equal(s2.segmentStart,10);assert.equal(s2.minutes,8);
});

test('the voice-check hook can add an optional first step without changing the rest',()=>{
  const off=P.registerStep((db,{today})=>({kind:'voice-check',title:'매일 보이스 체크',minutes:1,today}));
  try{
    const {steps}=P.build(seed(),{today:TODAY});
    assert.equal(steps[0].kind,'voice-check');assert.equal(steps[0].first,true);assert.equal(steps[1].kind,'warmup');
  }finally{off();}
  assert.equal(P.build(seed(),{today:TODAY}).steps[0].kind,'warmup');
});

test('templates remember order, removed fixed steps, minutes and added song sections per weekday; goals still come from today',()=>{
  const db=seed();const {steps,base}=P.build(db,{today:TODAY});
  const edited=[{...steps[3],minutes:15},steps[1],steps[2],{...steps[0],minutes:8},
    {kind:'song',songId:'s2',title:'곡 구간 · Defying Gravity 0:30–1:00',minutes:6,segmentStart:30,segmentEnd:60,added:true}]; // record removed, g3 kept
  P.saveTemplate(db,'w'+P.weekday(TODAY),P.normalize(edited),base);
  assert.equal(db.practicePlans.filter(p=>p.kind==='practice-set-template').length,1);
  const next=P.build(db,{today:TODAY}).steps;
  assert.deepEqual(next.map(s=>s.kind),['song','goal','goal','warmup','song']); // an added section keeps its own place
  assert.equal(next[0].minutes,15);assert.equal(next[3].minutes,8);assert.equal(next[4].songId,'s2');assert.equal(next[4].segmentStart,30);
  // Next Wednesday a new goal still appears; another weekday falls back to defaults (no 기본 세트 saved).
  const later=seed();later.practicePlans.push(...db.practicePlans.filter(p=>p.kind==='practice-set-template'));
  later.dailyGoals.push({id:'g9',date:TODAY,title:'새 숙제',source:'personal',completed:false,order:9});
  assert.ok(P.build(later,{today:TODAY}).steps.some(s=>s.goalId==='g9'));
  assert.deepEqual(P.build(db,{today:'2026-11-05'}).steps.map(s=>s.kind),['warmup','song','record']);
  // Removing one of today's goals is not remembered.
  const t=P.templateFrom(P.normalize([steps[0],steps[1],steps[3],steps[4]]),base);
  assert.deepEqual(t.removed,[]);
  P.saveTemplate(db,'default',P.normalize([steps[1],steps[0]]),base);
  assert.deepEqual(P.build(db,{today:'2026-11-05'}).steps.map(s=>s.kind),['warmup']);
  assert.throws(()=>P.saveTemplate(db,'monday',steps,base),/세트/);
});

test('only real running time counts: pauses, long suspended gaps and recordings add nothing',()=>{
  const s=P.start(P.build(seed(),{today:TODAY}).steps,{id:'set1',date:TODAY,now:0});
  P.play(s,1000);P.tick(s,2000);P.tick(s,3000);
  P.tick(s,3000+10*60*1000); // the phone slept for ten minutes: at most one tick gap counts
  assert.equal(s.steps[0].elapsed,2+P.MAX_GAP_MS/1000);
  P.pause(s,603500);P.tick(s,900000);assert.equal(s.steps[0].elapsed,4.5);
  // A restored session is paused; time while the page was closed is not counted.
  P.play(s,900000);const restored=P.restore(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.running,false);P.tick(restored,2_000_000);assert.equal(restored.steps[0].elapsed,4.5);
  restored.steps[4].mediaIds=['rec1'];
  const rows=P.summary(restored);assert.equal(rows[0].minutes,0);assert.equal(rows[4].minutes,0);assert.deepEqual(rows[4].mediaIds,['rec1']);
});

test('saving checks finished goals through perform, links homework without completing it, and is idempotent',()=>{
  const db=seed(),before=Time.entries(db.practices).reduce((n,e)=>n+e.minutes,0);
  const s=P.start(P.build(db,{today:TODAY}).steps,{id:'set1',date:TODAY,now:0});
  run(s,[[300,'next'],[240,'next'],[30,'next'],[600,'next'],[90,'end']]);
  s.steps[4].mediaIds=['rec-take'];
  const rows=P.summary(s);
  assert.deepEqual(rows.map(r=>r.minutes),[5,4,1,10,2]);
  assert.ok(rows.every(r=>r.done));
  const res=P.save(db,s,rows);
  assert.equal(res.minutes,22);assert.equal(res.goals,2);
  const g1=db.dailyGoals.find(g=>g.id==='g1'),g3=db.dailyGoals.find(g=>g.id==='g3');
  assert.equal(g1.completed,true);assert.equal(g3.completed,true);assert.equal(g1.performance.minutes,4);
  assert.equal(db.assignments[0].status,'active'); // homework is linked, never completed
  const hw=db.practices.find(p=>p.id==='goal:g1');
  assert.deepEqual(hw.completed,['a1']);assert.deepEqual(hw.assignmentReps,{a1:1});assert.equal(hw.practiceTimeSource,'goal');
  assert.equal(Time.homeworkProgress(db,'a1').sessions,1);
  const warm=db.practices.find(p=>p.id==='practice-set:set1:warmup');
  assert.equal(warm.practiceMode,'training');assert.equal(warm.categoryId,'c-voice');assert.equal(warm.minutes,5);
  const take=db.practices.find(p=>p.id==='practice-set:set1:record-s1');
  assert.deepEqual(take.mediaIds,['rec-take']);assert.equal(take.minutes,2);assert.equal(take.songId,'s1');
  const added=Time.entries(db.practices).reduce((n,e)=>n+e.minutes,0)-before;
  assert.equal(added,22);
  // Saving the same session again (double tap, or after a resume) replaces rows: nothing is counted twice.
  const snapshot=JSON.stringify(db.practices.map(p=>[p.id,p.minutes]));
  P.save(db,s,rows);P.save(db,P.restore(JSON.parse(JSON.stringify(s))),rows);
  assert.equal(JSON.stringify(db.practices.map(p=>[p.id,p.minutes])),snapshot);
  assert.equal(db.practices.filter(p=>p.id==='goal:g1').length,1);
  // An edited summary replaces the earlier numbers.
  P.save(db,s,rows.map(r=>r.id==='g-g1'?{...r,minutes:7}:r));
  assert.equal(db.practices.find(p=>p.id==='goal:g1').minutes,7);
  assert.equal(Time.entries(db.practices).reduce((n,e)=>n+e.minutes,0)-before,25);
});

test('a goal already timed elsewhere keeps that time; unfinished goal time still counts without checking it',()=>{
  const db=seed();
  // g3 was checked, timed (6 min) and unchecked again earlier today.
  db.dailyGoals[2].completed=true;R.perform(db,'g3',{minutes:6});db.dailyGoals[2].completed=false;
  const s=P.start(P.build(db,{today:TODAY}).steps.filter(x=>x.kind==='goal'),{id:'set2',date:TODAY,now:0});
  run(s,[[120,'next'],[180,'end']]);
  const rows=P.summary(s).map(r=>r.goalId==='g1'?{...r,done:false}:r);
  P.save(db,s,rows);P.save(db,s,rows);
  assert.equal(db.dailyGoals.find(g=>g.id==='g1').completed,false);
  assert.equal(db.practices.find(p=>p.id==='goal:g3').minutes,9); // 6 + 3, once
  const plain=db.practices.find(p=>p.id==='practice-set:set2:g-g1');
  assert.equal(plain.minutes,2);assert.deepEqual(plain.completed,[]);
  // Checking it later in the same session moves its time into the goal row instead of adding it again.
  P.save(db,s,rows.map(r=>r.goalId==='g1'?{...r,done:true}:r));
  assert.equal(db.practices.find(p=>p.id==='goal:g1').minutes,2);assert.equal(db.practices.find(p=>p.id==='practice-set:set2:g-g1').minutes,0);
  const total=Time.entries(db.practices).filter(e=>e.date===TODAY).reduce((n,e)=>n+e.minutes,0);
  assert.equal(total,11);
});

test('invalid minutes are rejected before anything is written; zero-minute steps write nothing',()=>{
  const db=seed(),s=P.start(P.build(db,{today:TODAY}).steps,{id:'set3',date:TODAY,now:0});
  const before=JSON.stringify(db);
  assert.throws(()=>P.save(db,s,[{id:'warmup',minutes:601}]),/0~600/);
  assert.throws(()=>P.save(db,s,[{id:'warmup',minutes:-1}]),/0~600/);
  assert.equal(JSON.stringify(db),before);
  P.save(db,s,P.summary(s).map(r=>({...r,done:false})));
  assert.equal(JSON.stringify(db.practices),JSON.stringify(seed().practices));
  assert.throws(()=>P.start([],{id:'x',date:TODAY}),/하나 이상/);
});
