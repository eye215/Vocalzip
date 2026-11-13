// 오늘 연습 세트: default set, wall-clock time accounting, goal links and idempotent saves (app/practice-set-model.js).
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

test('the clock is the wall clock: time away and a reload count once, a pause stops it, recordings add nothing',()=>{
  const s=P.start(P.build(seed(),{today:TODAY}).steps,{id:'set1',date:TODAY,now:0});
  P.play(s,1000);P.tick(s,2000);P.tick(s,3000);
  P.tick(s,3000+2*60*1000); // another app for two minutes: the whole stretch counts on the running step
  assert.equal(s.steps[0].elapsed,122);
  assert.equal(P.elapsedNow(s,3000+2*60*1000+500),122.5); // a display between counts changes nothing
  assert.equal(s.steps[0].elapsed,122);
  // Reload while running: the stored session is still running and the gap is counted exactly once.
  const stored=JSON.stringify(s),restored=P.restore(JSON.parse(stored));
  assert.equal(restored.running,true);assert.equal(restored.lastAt,s.lastAt);
  P.tick(restored,123000+30000);assert.equal(restored.steps[0].elapsed,152);
  P.tick(restored,123000+30000);assert.equal(restored.steps[0].elapsed,152);
  const again=P.restore(JSON.parse(JSON.stringify(restored)));P.tick(again,153000);assert.equal(again.steps[0].elapsed,152);
  // The pause button stops it: nothing is counted until play, however long, also across a reload.
  P.pause(restored,160000);assert.equal(restored.steps[0].elapsed,159);
  P.tick(restored,900000);assert.equal(restored.steps[0].elapsed,159);
  const paused=P.restore(JSON.parse(JSON.stringify(restored)));
  assert.equal(paused.running,false);P.tick(paused,5_000_000);assert.equal(paused.steps[0].elapsed,159);
  P.play(paused,5_000_000);P.tick(paused,5_001_000);assert.equal(paused.steps[0].elapsed,160);
  // A clock that jumped backwards never takes time away.
  P.tick(paused,4_000_000);assert.equal(paused.steps[0].elapsed,160);
  paused.steps[4].mediaIds=['rec1'];
  const rows=P.summary(paused);assert.equal(rows[0].minutes,3);assert.equal(rows[4].minutes,0);assert.deepEqual(rows[4].mediaIds,['rec1']);
  // A session stored by the earlier version (it stopped whenever the page was hidden) comes back paused.
  const old=P.restore({...JSON.parse(stored),v:1});
  assert.equal(old.running,false);assert.equal(old.v,2);P.tick(old,9_000_000);assert.equal(old.steps[0].elapsed,122);
  assert.equal(P.restore({...JSON.parse(stored),v:3}),null);
});

test('a planned time that ran out while away is marked, never skipped; moving on clears the mark',()=>{
  const s=P.start(P.build(seed(),{today:TODAY}).steps,{id:'set1',date:TODAY,now:0});
  const target=s.steps[0].minutes*60;
  const T=1_000_000;
  P.play(s,T);P.tick(s,T+60000);
  P.tick(s,T+60000+20*60*1000,{away:true}); // back after twenty minutes on a five-minute step
  assert.equal(s.steps[0].elapsed,21*60);assert.ok(s.steps[0].elapsed>target);
  assert.equal(s.overAway,s.steps[0].id);assert.equal(s.index,0);assert.equal(s.running,true);assert.equal(s.steps[0].done,false);
  P.go(s,1,T+1_500_000);assert.equal(s.overAway,undefined);
  // Watching the timer pass its planned time (not away) is not marked; coming back to a step already over is not marked again.
  P.tick(s,T+1_500_000+s.steps[1].minutes*60000+1000);assert.equal(s.overAway,undefined);
  P.tick(s,T+1_500_000+s.steps[1].minutes*60000+90000,{away:true});assert.equal(s.overAway,undefined);
});

test('away longer than three hours is not counted until the singer chooses: planned end, all of it, or nothing',()=>{
  const HOURS=3600000,T=1_000_000;
  const make=()=>{const s=P.start(P.build(seed(),{today:TODAY}).steps,{id:'set1',date:TODAY,now:T});P.play(s,T);P.tick(s,T+120000);return s;};
  assert.equal(P.LONG_GAP_MS,3*HOURS);
  const short=make();P.tick(short,T+120000+3*HOURS,{away:true}); // exactly the limit still counts by itself
  assert.equal(short.away,undefined);assert.equal(short.steps[0].elapsed,120+3*3600);
  const s=make();P.tick(s,T+120000+5*HOURS,{away:true});
  assert.equal(s.running,false);assert.equal(s.steps[0].elapsed,120); // nothing counted yet
  const info=P.awayInfo(s);assert.equal(info.step.id,s.steps[0].id);assert.equal(info.seconds,5*3600);assert.equal(info.planned,s.steps[0].minutes*60-120);
  P.play(s,T+120000+5*HOURS);assert.equal(s.running,false); // it waits for the answer
  // The question survives a reload and the stretch is still not counted.
  const kept=P.restore(JSON.parse(JSON.stringify(s)));assert.ok(P.awayInfo(kept));assert.equal(kept.running,false);
  P.tick(kept,T+120000+9*HOURS);assert.equal(kept.steps[0].elapsed,120);
  assert.throws(()=>P.resolveAway(kept,'maybe'),/골라/);assert.ok(kept.away);
  P.resolveAway(kept,'planned');assert.equal(kept.steps[0].elapsed,kept.steps[0].minutes*60);assert.equal(kept.away,undefined);assert.equal(kept.running,false);
  assert.equal(kept.overAway,kept.steps[0].id);
  const all=P.restore(JSON.parse(JSON.stringify(s)));P.resolveAway(all,'all');assert.equal(all.steps[0].elapsed,120+5*3600);
  assert.equal(P.summary(all)[0].minutes,302);
  const none=P.restore(JSON.parse(JSON.stringify(s)));P.resolveAway(none,'none');assert.equal(none.steps[0].elapsed,120);assert.equal(none.overAway,undefined);
  P.play(none,T+120000+5*HOURS);P.tick(none,T+121000+5*HOURS);assert.equal(none.steps[0].elapsed,121);
  // Noticed first by a tap on 다음 or 마치기: the stretch still waits, on the step it belongs to.
  const moved=make();P.go(moved,1,T+120000+4*HOURS);
  assert.equal(moved.index,1);assert.equal(moved.running,false);assert.equal(P.awayInfo(moved).step.id,moved.steps[0].id);assert.equal(moved.steps[1].elapsed,0);
  const ended=make();P.end(ended,T+120000+4*HOURS);
  assert.equal(ended.phase,'summary');assert.equal(P.summary(ended)[0].minutes,2);P.resolveAway(ended,'none');assert.equal(P.summary(ended)[0].minutes,2);
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
