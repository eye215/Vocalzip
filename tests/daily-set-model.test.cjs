// 오늘의 연습 (app/daily-set-model.js): what is in a day's set — 숙제 · 놓친 레슨 지적 first, one exercise per built-in
// group by date rotation, the person's own steps kept after them — 고르기, resume state, minutes and the ONE run row.
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../app/daily-set-model.js'),P=require('../app/practice-set-model.js'),Time=require('../app/practice-time-model.js');
const TODAY='2026-11-04'; // Wednesday
const day=n=>{const d=new Date(Date.UTC(2026,10,4+n));return d.toISOString().slice(0,10);};
const empty=()=>({categories:[],songs:[{id:'s1',title:'This Is the Moment'}],assignments:[],practices:[],dailyGoals:[],practicePlans:[],scoreAnnotations:[],deleted:{}});
const seed=()=>({...empty(),
  categories:[{id:'c-voice',name:'발성',items:['립트릴']}],
  assignments:[{id:'a1',title:'호흡을 길게 유지하기',status:'active',startDate:'2026-11-01',dueDate:'2026-11-08'},
    {id:'a2',title:'가사 외우기',status:'active',startDate:'2026-11-01',dueDate:'2026-11-06'}],
  dailyGoals:[
    {id:'g1',date:TODAY,title:'호흡을 길게 유지하기',source:'homework',sourceId:'a1',completed:false,order:0},
    {id:'g3',date:TODAY,title:'후렴 연결',source:'personal',completed:false,order:2,routineId:'routine:r1',routine:true,sourceId:'routine:r1'}],
  practicePlans:[{id:'routine:r1',kind:'routine',title:'후렴 연결',days:7,startDate:'2026-11-01',endDate:'2026-11-07',archived:false,changes:[]}]});
const ids=steps=>steps.map(s=>s.id);
/** The set of four exercises these tests were written for: 리듬 (added later) rests. */
const four=()=>{const db=empty();D.savePrefs(db,{groupsOff:{rhythm:true}});return db;};
const groupsOf=steps=>steps.filter(s=>s.kind==='exercise').map(s=>s.group);

test('a day with nothing set up: one exercise from each group, 목 풀기 → 호흡 → 발성 → 음감 → 리듬, about 15 minutes, each with minutes and a mic flag',()=>{
  const b=D.build(empty(),{today:TODAY});
  assert.deepEqual(b.steps.map(s=>s.kind),['exercise','exercise','exercise','exercise','exercise']);
  assert.deepEqual(groupsOf(b.steps),['loosen','breath','voice','ear','rhythm']);
  assert.deepEqual(D.GROUPS.map(g=>g.title),['목 풀기','호흡','발성','음감','리듬']);
  assert.ok(b.minutes>=12&&b.minutes<=18,'total '+b.minutes);
  for(const s of b.steps){assert.ok(s.minutes>=1);assert.equal(typeof s.mic,'boolean');assert.ok(s.why);assert.equal(D.exercise(s.exercise).group,s.group);}
  assert.equal(b.steps.at(-1).mic,true);assert.equal(b.steps[0].mic,false);
  assert.deepEqual(b.own,[]);
});

test('곡: the set ends with 곡에 적용하기 for the plan song or the latest song, then the optional 녹음 — as 오늘 연습 세트 did; 고르기 can rest it',()=>{
  const db=empty(),b=D.build(db,{today:TODAY,recentSongId:'s1'});
  assert.deepEqual(b.steps.map(s=>s.kind),['exercise','exercise','exercise','exercise','exercise','song','record']);
  const [song,record]=b.steps.slice(-2);
  assert.deepEqual([song.title,song.apply,song.songId,D.labelOf(song),D.modeOf(song),song.id],['곡에 적용하기 · This Is the Moment',true,'s1','곡','free','song-s1']);
  assert.deepEqual([record.kind,record.optional,record.songId,D.labelOf(record)],['record',true,'s1','녹음']);
  assert.deepEqual(b.own.map(s=>s.kind),['song','record']);
  assert.equal(D.SONG.title,'곡');assert.equal(D.prefs(db).groupsOff.song,undefined); // on by default
  // The same source rule as before (app/practice-set-model.js): a running monthly plan's song and section first.
  const plan=empty();plan.songs.push({id:'s2',title:'Defying Gravity'});
  plan.practicePlans.push({id:'mp1',kind:'monthly-vocal',songId:'s2',metric:'stability',segmentStart:30,segmentEnd:70,minutes:12,days:5,startDate:'2026-11-02',archived:false});
  const p=D.build(plan,{today:TODAY,recentSongId:'s1'}).steps.slice(-2);
  assert.deepEqual([p[0].title,p[0].planId,p[0].segmentStart,p[0].minutes,p[1].songId],['곡에 적용하기 · Defying Gravity','mp1',30,12,'s2']);
  // No song to apply to: no step (and nothing to record).
  assert.ok(!D.build(empty(),{today:TODAY}).steps.some(s=>s.kind==='song'||s.kind==='record'));
  // A homework of today's set about a song already covers it.
  const hw=empty();hw.assignments.push({id:'a9',title:'후렴 고음 연습',status:'active',startDate:'2026-11-01',dueDate:'2026-11-08',songId:'s1'});
  const covered=D.build(hw,{today:TODAY,recentSongId:'s1'});
  assert.equal(covered.steps[0].assignmentId,'a9');
  assert.equal(covered.steps[0].songId,'s1');assert.ok(!covered.steps.some(s=>s.apply));
  assert.deepEqual(covered.steps.slice(-1).map(s=>[s.kind,s.songId]),[['record','s1']]); // the optional 녹음 of that song still closes the set
  // 곡 turned off in 고르기: both steps leave; a section the person added stays; 처음대로 brings them back.
  D.savePrefs(db,D.setGroup(D.prefs(db),'song',false));
  assert.equal(db.practicePlans.find(x=>x.id===D.PREFS_ID).groupsOff.song,true);
  assert.deepEqual(D.build(db,{today:TODAY,recentSongId:'s1'}).steps.map(s=>s.kind),['exercise','exercise','exercise','exercise','exercise']);
  const own=[{kind:'song',songId:'s1',title:'곡 구간 · This Is the Moment 0:30–1:10',minutes:8,added:true,segmentStart:30,segmentEnd:70}];
  assert.deepEqual(D.build(db,{today:TODAY,own}).steps.slice(-1).map(s=>[s.kind,s.added,s.apply]),[['song',true,undefined]]);
  D.savePrefs(db,D.resetPrefs(D.prefs(db)));
  assert.deepEqual(D.build(db,{today:TODAY,recentSongId:'s1'}).steps.slice(-2).map(s=>s.kind),['song','record']);
});

test('the catalogue is data: every exercise has what the runner and later versions need',()=>{
  for(const e of D.CATALOG){
    assert.ok(D.groupOf(e.group),e.id);assert.ok(e.title&&e.why&&e.minutes>0,e.id);assert.equal(typeof e.mic,'boolean');
    assert.ok(['timed','breath','follow','hold','hiss','rhythm','vibrato','scale','siren'].includes(e.mode),e.id);
    // The measuring exercises listen (a timer without the mic) and say which 기본기 area they measure.
    if(['hiss','rhythm','vibrato','siren'].includes(e.mode))assert.ok(e.mic&&Array.isArray(e.measure)&&e.measure.length===1,e.id);
    if(e.mode==='scale')assert.ok(e.mic&&e.measure.join()==='pitch,range',e.id);
    if(e.mode==='timed'){assert.ok(e.steps.length>=2);assert.ok(Math.abs(e.steps.reduce((n,s)=>n+s.seconds,0)-e.minutes*60)<=30,e.id);}
    if(e.mode==='hold')assert.ok(e.hold>0&&e.tolerance===25&&e.mic,e.id);
  }
  for(const g of D.GROUPS)assert.ok(D.exercisesOf(g.id).length>=1,g.id);
  assert.equal(new Set(D.CATALOG.map(e=>e.id)).size,D.CATALOG.length);
  // The paced “스~” is not measured; “스~” 길게 is (호흡), as are “타” 따라 하기 (리듬) and 롱톤 비브라토 (비브라토).
  assert.equal(D.exercise('breath-s').measure,null);
  assert.deepEqual(['breath-hiss','rhythm-ta','voice-vibrato'].map(id=>[D.exercise(id).group,D.exercise(id).mode,D.exercise(id).measure[0]]),
    [['breath','hiss','breath'],['rhythm','rhythm','rhythm'],['voice','vibrato','vibrato']]);
  const vib=D.exercise('voice-vibrato');assert.deepEqual([vib.hold,vib.cue],[8,4]);
  assert.deepEqual(D.notesFor(vib,{low:55,high:67},TODAY).map(n=>n-D.notesFor(vib,{low:55,high:67},TODAY)[0]),[0,4]); // two pitches
  // 스케일 (음정 · 음역, in 음감), 사이렌 (소리 길, in 목 풀기), 맨 위 음 유지 (고음, in 발성): every 기본기 area has an exercise.
  assert.deepEqual(['ear-scale','loosen-siren','voice-high'].map(id=>[D.exercise(id).group,D.exercise(id).mode,D.exercise(id).measure.join()]),
    [['ear','scale','pitch,range'],['loosen','siren','path'],['voice','hold','high,range']]);
  const high=D.exercise('voice-high');assert.deepEqual(D.notesFor(high,{low:55,high:67},TODAY),[64,66,67,67,67]);
  assert.deepEqual([0,3,4].map(i=>D.noteTags(high,i)),[{fromTop:-3,vowel:'아'},{fromTop:0,vowel:'에'},{fromTop:0,vowel:'이'}]);
  const ear=D.exercise('ear-follow');assert.equal(ear.count,5);assert.equal(ear.hold,4);
});

test('숙제 and a missed lesson point go first, two at most; a homework that is one of today\'s goals is that goal\'s step',()=>{
  const db=seed();db.assignments.pop(); // only a1, which is one of today's goals
  db.scoreAnnotations=[{id:'point:pt1',kind:'score-point',songId:'s1',text:'호흡을 끊지 않기',measures:{from:3,to:4},created:1},
    {id:'point-run:r1',kind:'score-point-run',songId:'s1',date:'2026-11-03',at:2,results:{'point:pt1':'missed'}}];
  const b=D.build(db,{today:TODAY}),next=D.nextItems(db,TODAY);
  assert.ok(next.length<=D.NEXT_MAX);
  const lead=b.steps.slice(0,next.length);
  // a1 is in today's goals: the goal's own step leads (finishing it checks the goal and links the homework).
  assert.equal(lead[0].kind,'goal');assert.equal(lead[0].goalId,'g1');assert.equal(lead[0].lead,true);assert.equal(D.labelOf(lead[0]),'숙제');
  assert.deepEqual(next.map(x=>x.source),['homework','lesson-point']);
  assert.deepEqual([lead[1].kind,lead[1].source,lead[1].pointId,lead[1].songId,D.labelOf(lead[1])],['next','lesson-point','point:pt1','s1','레슨 지적']);
  assert.deepEqual(groupsOf(b.steps),['loosen','breath','voice','ear','rhythm']);
  assert.ok(b.steps.findIndex(s=>s.kind==='exercise')>=next.length);
  assert.equal(b.steps.filter(s=>s.goalId==='g1').length,1,'never twice');
  // Without a goal for it, a homework is a plain first step that links the assignment.
  const plain=seed();plain.dailyGoals=[];
  const p=D.build(plain,{today:TODAY});
  assert.deepEqual(p.steps.slice(0,2).map(s=>[s.kind,s.source,s.assignmentId]),[['next','homework','a2'],['next','homework','a1']]); // due soonest first
  assert.equal(p.steps[0].minutes,D.NEXT_MINUTES);
  assert.equal(p.steps.filter(s=>s.kind==='next').length,2);
  // A homework already checked off in today's goals is not asked again.
  const done=seed();done.dailyGoals[0].completed=true;done.assignments.pop();
  assert.ok(!D.build(done,{today:TODAY}).steps.some(s=>s.assignmentId==='a1'));
});

test('the person\'s own steps stay, after the built-in ones',()=>{
  const b=D.build(seed(),{today:TODAY});
  assert.deepEqual(b.steps.map(s=>s.kind==='exercise'?s.group:s.kind+':'+(s.goalId||s.assignmentId||'')),['next:a2','goal:g1','loosen','breath','voice','ear','rhythm','goal:g3']);
  assert.equal(b.steps.at(-1).routine,true);
  assert.deepEqual(b.own.map(s=>s.goalId),['g1','g3']);
  // A saved 기본 세트 keeps what it holds: an added song section, the song and the recording that were left in.
  const db=seed();
  const old=P.build(db,{today:TODAY,recentSongId:'s1'});
  old.steps.push({kind:'song',songId:'s1',title:'곡 구간 · This Is the Moment 0:30–1:10',minutes:8,added:true,segmentStart:30,segmentEnd:70});
  P.saveTemplate(db,'default',P.normalize(old.steps),old.base);
  const kept=D.build(db,{today:TODAY,recentSongId:'s1'});
  assert.ok(kept.template);
  assert.deepEqual(kept.own.map(s=>s.kind).sort(),['goal','goal','record','song','song']);
  assert.ok(kept.own.some(s=>s.added&&s.segmentStart===30&&s.minutes===8));
  // The automatic warm-up gives way to the built-in groups, and comes back when they are all off.
  assert.ok(!kept.steps.some(s=>s.kind==='warmup'));
  D.savePrefs(db,{groupsOff:{loosen:true,breath:true,voice:true}});
  const bare=D.build(db,{today:TODAY,recentSongId:'s1'});
  assert.ok(bare.steps.some(s=>s.kind==='warmup'));assert.deepEqual(groupsOf(bare.steps),['ear','rhythm']);
  // A running monthly plan's section stays even without a saved set.
  const plan=empty();plan.practicePlans.push({id:'mp1',kind:'monthly-vocal',songId:'s1',metric:'stability',segmentStart:30,segmentEnd:70,minutes:12,days:5,startDate:'2026-11-02',archived:false});
  assert.deepEqual(D.build(plan,{today:TODAY}).own.map(s=>[s.kind,s.planId]),[['song','mp1'],['record',undefined]]);
});

test('an own step tagged for a group takes that group\'s place',()=>{
  const db=seed(),before=D.build(db,{today:TODAY}),routine=before.own.find(s=>s.goalId==='g3');
  assert.equal(D.ownKey(db,routine),'routine:routine:r1');
  assert.equal(D.ownKey(db,before.own.find(s=>s.goalId==='g1')),''); // a one-day goal has no lasting name
  D.savePrefs(db,{replace:{[D.ownKey(db,routine)]:'voice'}});
  const b=D.build(db,{today:TODAY});
  assert.deepEqual(b.steps.map(s=>s.kind==='exercise'?s.group:s.goalId||s.assignmentId),['a2','g1','loosen','breath','g3','ear','rhythm']);
  const tagged=b.steps.find(s=>s.goalId==='g3');
  assert.equal(tagged.replaces,'voice');assert.equal(D.labelOf(tagged),'발성');assert.equal(tagged.kind,'goal');
  // The group turned off: the tagged step is simply one of the person's own again.
  D.savePrefs(db,{replace:{'routine:routine:r1':'voice'},groupsOff:{voice:true}});
  assert.deepEqual(D.build(db,{today:TODAY}).steps.map(s=>s.kind==='exercise'?s.group:s.goalId||s.assignmentId),['a2','g1','loosen','breath','ear','rhythm','g3']);
});

test('inside a group the exercises left on rotate by the date: same day same one, none again until the list is through',()=>{
  const db=empty(),pf=D.prefs(db),n=D.exercisesOf('loosen').length;
  assert.ok(n>=3);
  const run=Array.from({length:n*2},(_,i)=>D.pick(pf,'loosen',day(i)).id);
  assert.equal(new Set(run.slice(0,n)).size,n);assert.deepEqual(run.slice(n),run.slice(0,n));
  assert.equal(D.pick(pf,'loosen',TODAY).id,D.pick(pf,'loosen',TODAY).id);
  assert.notEqual(D.build(db,{today:day(0)}).steps[0].exercise,D.build(db,{today:day(1)}).steps[0].exercise);
  // Month and year ends keep the order.
  const turn=['2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03','2027-01-04'].map(d=>D.pick(pf,'loosen',d).id);
  assert.equal(new Set(turn.slice(0,n)).size,n);assert.equal(turn[n],turn[0]);
  // One exercise turned off: the others take turns, that one never comes.
  const off=D.setExercise(pf,run[0],false),two=Array.from({length:6},(_,i)=>D.pick(off,'loosen',day(i)).id);
  assert.ok(!two.includes(run[0]));assert.equal(new Set(two).size,n-1);assert.notEqual(two[0],two[1]);
});

test('고르기: one exercise per group stays on, a whole group can rest, 처음대로 turns everything on; kept as ONE practicePlans row',()=>{
  const db=empty();let pf=D.prefs(db);
  assert.deepEqual([pf.off,pf.groupsOff,pf.recording],[{},{},false]);
  for(const e of D.exercisesOf('breath').slice(1))pf=D.setExercise(pf,e.id,false);
  assert.throws(()=>D.setExercise(pf,D.exercisesOf('breath')[0].id,false),/하나는 켜 두어야/);
  for(const e of D.exercisesOf('ear').slice(1))pf=D.setExercise(pf,e.id,false);
  assert.throws(()=>D.setExercise(pf,D.exercisesOf('ear')[0].id,false),/하나는 켜 두어야/);
  pf=D.setGroup(pf,'ear',false);
  D.savePrefs(db,pf);D.savePrefs(db,pf);
  const rows=db.practicePlans.filter(p=>p.kind===D.PREFS_KIND);
  assert.equal(rows.length,1);assert.equal(rows[0].id,D.PREFS_ID);
  assert.deepEqual(Object.keys(db).sort(),Object.keys(empty()).sort(),'no new list');
  const b=D.build(db,{today:TODAY});
  assert.deepEqual(groupsOf(b.steps),['loosen','breath','voice','rhythm']);
  for(let i=0;i<5;i++)assert.equal(D.build(db,{today:day(i)}).steps[1].exercise,D.exercisesOf('breath')[0].id);
  // A stored row that turned a whole group's exercises off still gives one (the first).
  const broken=empty();broken.practicePlans.push({id:D.PREFS_ID,kind:D.PREFS_KIND,off:Object.fromEntries(D.exercisesOf('voice').map(e=>[e.id,true])),replace:{x:'nope'},comfort:{low:70,high:60}});
  assert.equal(D.rotation(D.prefs(broken),'voice').length,1);assert.deepEqual(D.prefs(broken).replace,{});assert.equal(D.prefs(broken).comfort,null);
  // 처음대로 keeps the person's own answers.
  D.savePrefs(db,{...D.prefs(db),comfort:{low:55,high:64},recording:true,recordSongId:'s1',phrase:'후렴 첫 줄'});
  const reset=D.resetPrefs(D.prefs(db));
  assert.deepEqual([reset.off,reset.groupsOff,reset.comfort,reset.recording,reset.phrase],[{},{},{low:55,high:64},true,'후렴 첫 줄']);
  // A deleted row is the defaults again.
  db.deleted={practicePlans:[D.PREFS_ID]};assert.deepEqual(D.prefs(db).groupsOff,{});
});

test('연습 전후 30초 녹음 (off by default): a take before the first step and after the last',()=>{
  const db=seed();
  assert.ok(!D.build(db,{today:TODAY}).steps.some(s=>s.kind==='take'));
  D.savePrefs(db,{recording:true,recordSongId:'s1',phrase:'후렴 첫 줄'});
  const b=D.build(db,{today:TODAY});
  assert.equal(b.steps[0].id,'take-before');assert.equal(b.steps.at(-1).id,'take-after');
  assert.deepEqual([b.steps[0].slot,b.steps[0].songId,b.steps[0].phrase,b.steps[0].optional,b.steps[0].mic],['before','s1','후렴 첫 줄',true,true]);
  assert.equal(D.modeOf(b.steps[0]),'take');assert.equal(D.TAKE_SECONDS,30);
  assert.ok(b.steps.length<=D.MAX_STEPS);
  assert.ok(!b.own.some(s=>s.kind==='take'));
});

test('the timeline and the resume state follow the session',()=>{
  const b=D.build(four(),{today:TODAY});
  assert.deepEqual(D.timeline(b.steps).map(x=>x.state),['next','left','left','left']);
  assert.deepEqual(D.timeline(b.steps).map(x=>x.label),['목 풀기','호흡 · 추천','발성','음감']); // today's 기본기 (호흡, not measured yet) is marked
  let now=1_000_000;
  const s=P.start(b.steps,{id:'run1',date:TODAY,now});
  assert.equal(s.running,false);
  P.play(s,now);now+=100_000;
  D.finishItem(s,{state:'done',result:{mode:'timed',parts:3},now});
  assert.deepEqual([s.index,s.running,s.steps[0].done,s.steps[0].elapsed],[1,false,true,100]);
  now+=3_600_000; // away for an hour with nothing running: nothing is counted
  D.finishItem(s,{state:'skipped',now});
  assert.deepEqual([s.steps[1].done,s.steps[1].skipped,s.steps[1].elapsed,s.steps[1].result.state],[false,true,0,'skipped']);
  assert.deepEqual(D.timeline(s.steps,s).map(x=>x.state),['done','skipped','next','left']);
  assert.deepEqual(D.progress(s),{done:2,total:4});
  // Stored and read back (this device's draft): the same place, the same results.
  const back=P.restore(JSON.parse(JSON.stringify(s)));
  assert.deepEqual([back.index,back.running,back.phase],[2,false,'run']);
  assert.deepEqual(D.timeline(back.steps,back).map(x=>x.state),['done','skipped','next','left']);
  assert.deepEqual(back.steps[0].result,{mode:'timed',parts:3,state:'done'});
  // Stopping early does not mark the step in hand as done.
  P.play(back,now);now+=20_000;D.stop(back,now);
  assert.deepEqual([back.phase,back.running,back.steps[2].done,back.steps[2].elapsed],['summary',false,false,20]);
  assert.deepEqual(D.timeline(back.steps,back).map(x=>x.state),['done','skipped','left','left']);
  // The last step done leads to the summary.
  const t=P.start(D.build(four(),{today:TODAY}).steps.slice(0,1),{id:'run2',date:TODAY,now});
  D.finishItem(t,{now});assert.equal(t.phase,'summary');assert.equal(t.steps[0].done,true);
});

test('saving writes ONE practice row for the set: real active minutes, per-item results, no double counting',()=>{
  const db=four();let now=1_000_000;
  const s=P.start(D.build(db,{today:TODAY}).steps,{id:'run1',date:TODAY,now});
  const act=(seconds,state,result)=>{P.play(s,now);now+=seconds*1000;D.finishItem(s,{state,result,now});};
  act(150,'done',{mode:'timed',parts:3});
  act(40,'skipped',{mode:'breath',rounds:2,longestOut:8});
  act(95,'done',{mode:'hold',parts:5,holdSeconds:17.5,accuracy:82,notes:[{midi:62,ok:true,held:4,sung:5,accuracy:80,cents:6}]});
  act(75,'done',{mode:'hold',timer:true,parts:5,notes:[{midi:60}]});
  assert.equal(s.phase,'summary');
  const first=D.save(db,s,[]);
  assert.deepEqual([first.rows,first.goals,first.runId],[1,0,'practice-set:run1']);
  assert.equal(db.practices.length,1);
  const row=db.practices[0];
  assert.equal(row.minutes,6);assert.equal(row.manualMinutes,6); // 360 s of activity
  assert.deepEqual([row.date,row.practiceMode,row.practiceTimeSource,row.practiceSetId,row.songId],[TODAY,'training','practice-set','run1','']);
  assert.equal(Time.actualMinutes(row),6);
  assert.deepEqual(row.dailySet.items.map(x=>[x.exercise,x.state,x.seconds]),[[s.steps[0].exercise,'done',150],[s.steps[1].exercise,'skipped',40],[s.steps[2].exercise,'done',95],[s.steps[3].exercise,'done',75]]);
  assert.deepEqual([row.dailySet.items[2].holdSeconds,row.dailySet.items[2].accuracy,row.dailySet.items[2].notes.length],[17.5,82,1]);
  assert.equal(row.dailySet.items[3].timer,true);assert.equal(row.dailySet.items[3].accuracy,undefined);
  assert.equal(row.dailySet.items[1].longestOut,8);
  assert.deepEqual(row.technique.map(t=>t.minutes),[2.5,.667,1.583,1.25]);
  assert.equal(row.memo,'[오늘의 연습] 4개 중 3개');
  // Saving again (a second tap, another device with the same draft) replaces the row.
  D.save(db,s,[]);
  assert.equal(db.practices.length,1);
  assert.equal(Time.entries(db.practices).reduce((n,e)=>n+e.minutes,0),6);
  assert.deepEqual(D.runsOn(db,TODAY).map(p=>p.id),['practice-set:run1']);assert.deepEqual(D.runsOn(db,day(1)),[]);
  // Nothing done, no time: nothing is written.
  const none=empty(),z=P.start(D.build(none,{today:TODAY}).steps,{id:'run0',date:TODAY,now});
  D.stop(z,now);assert.equal(D.save(none,z,[]).rows,0);assert.deepEqual(none.practices,[]);
});

test('goal steps keep their own goal row, a homework without a goal is linked on the run row, recordings are linked and never add time',()=>{
  const db=seed();D.savePrefs(db,{recording:true,recordSongId:'s1',groupsOff:{rhythm:true}});
  let now=1_000_000;
  const s=P.start(D.build(db,{today:TODAY}).steps,{id:'run1',date:TODAY,now});
  assert.deepEqual(ids(s.steps).slice(0,3),['take-before','next-hw-a2','g-g1']);
  const act=(seconds,state='done',result)=>{if(seconds)P.play(s,now);now+=seconds*1000;D.finishItem(s,{state,result,now});};
  s.steps[0].mediaIds=['m-before'];act(0,'done',{mode:'take',seconds:30}); // a take: the clock never runs
  act(120);            // a2: homework without a goal
  act(180);            // g1: homework goal
  for(let i=0;i<4;i++)act(60);
  act(240);            // g3: routine goal
  s.steps.at(-1).mediaIds=['m-after'];act(0,'done',{mode:'take',seconds:28});
  assert.equal(s.phase,'summary');
  const sum=D.summary(s);
  assert.deepEqual(sum.map(r=>r.measured),[true,true,false,true,true,true,true,false,true]);
  const r=D.save(db,s,[{id:'g-g1',minutes:3,done:true},{id:'g-g3',minutes:5,done:true}]);
  assert.deepEqual([r.goals,r.minutes],[2,14]); // 3 + 5 typed for the goals, 2 + 4 measured
  assert.deepEqual(db.practices.map(p=>p.id).sort(),['goal:g1','goal:g3','practice-set:run1']);
  assert.deepEqual(db.dailyGoals.map(g=>g.completed),[true,true]);
  assert.equal(db.practices.find(p=>p.id==='goal:g1').minutes,3);
  assert.deepEqual(db.practices.find(p=>p.id==='goal:g1').completed,['a1']);
  assert.equal(db.assignments.find(a=>a.id==='a1').status,'active'); // linked, never completed
  const row=db.practices.find(p=>p.id==='practice-set:run1');
  assert.equal(row.minutes,6);
  assert.deepEqual(row.completed,['a2']);assert.deepEqual(row.assignmentReps,{a2:1});
  assert.deepEqual(row.mediaIds,['m-before','m-after']);
  assert.deepEqual(row.dailySet.recording,{songId:'s1',phrase:'',beforeId:'m-before',afterId:'m-after'});
  // Every step is listed; the goals name their own row and add nothing to this row's time.
  assert.deepEqual(row.dailySet.items.filter(x=>x.row).map(x=>[x.goalId,x.row,x.minutes,x.state]),[['g1','goal:g1',3,'done'],['g3','goal:g3',5,'done']]);
  assert.equal(row.dailySet.items.length,9);assert.equal(row.dailySet.minutes,14);
  assert.equal(Time.entries(db.practices).reduce((n,e)=>n+e.minutes,0),14);
  D.save(db,s,[{id:'g-g1',minutes:3,done:true},{id:'g-g3',minutes:5,done:true}]);
  assert.equal(Time.entries(db.practices).reduce((n,e)=>n+e.minutes,0),14);
  // A goal step left unfinished is not checked; its time stays in the run row.
  const db2=seed();db2.assignments.pop();
  const t=P.start(D.build(db2,{today:TODAY}).steps,{id:'run2',date:TODAY,now});
  P.play(t,now);now+=90_000;D.stop(t,now);
  const r2=D.save(db2,t,[{id:'g-g1',minutes:2,done:false}]);
  assert.deepEqual([r2.goals,db2.dailyGoals[0].completed,db2.practices.map(p=>p.id)],[0,false,['practice-set:run2']]);
  assert.equal(db2.practices[0].minutes,2);assert.deepEqual(db2.practices[0].completed,[]);
});

test('word first: the answer for a pitch reading, and the hold meter',()=>{
  assert.equal(D.word(null).text,'소리를 내 보세요');
  assert.deepEqual([D.word(4).text,D.word(-9).text,D.word(20).text,D.word(-25).text],['딱 맞아요','딱 맞아요','그대로 유지!','그대로 유지!']);
  assert.deepEqual([D.word(40).text,D.word(-60).text,D.word(180).text,D.word(-300).text],['조금 높아요','조금 낮아요','많이 높아요','많이 낮아요']);
  // 4 seconds inside ±25 cent in one go; a slip shorter than 0.3 s is forgiven, a longer one starts again.
  let h=D.holdStart();
  for(let i=0;i<30;i++)D.holdTick(h,10,.1,{need:4});
  assert.equal(h.ok,false);
  D.holdTick(h,40,.1,{need:4});D.holdTick(h,40,.1,{need:4}); // 0.2 s outside
  for(let i=0;i<10;i++)D.holdTick(h,-12,.1,{need:4});
  assert.equal(h.ok,true);
  const r=D.holdResult(h);
  assert.ok(r.held>=4);assert.equal(r.accuracy,Math.round(4/4.2*100));
  h=D.holdStart();
  for(let i=0;i<30;i++)D.holdTick(h,10,.1,{need:4});
  for(let i=0;i<5;i++)D.holdTick(h,60,.1,{need:4}); // half a second outside: the hold starts again
  for(let i=0;i<30;i++)D.holdTick(h,5,.1,{need:4});
  assert.equal(h.ok,false);assert.ok(Math.abs(D.holdResult(h).held-3)<.01);
  h=D.holdStart();for(let i=0;i<50;i++)D.holdTick(h,null,.1,{need:4});
  assert.deepEqual(D.holdResult(h),{ok:false,held:0,sung:0,accuracy:null,cents:null});
});

test('the comfortable range: measured first, then the 보이스 체크 notes, then the answer given once; notes stay inside it',()=>{
  assert.equal(D.comfort({}),null);
  assert.deepEqual(D.comfort({measured:{low:50,high:62},voiceCheck:{refNote:60,highNote:69},asked:{low:40,high:50}}),{low:50,high:62,source:'measured'});
  assert.deepEqual(D.comfort({voiceCheck:{refNote:60,highNote:69},asked:{low:40,high:50}}),{low:58,high:69,source:'voice-check'});
  assert.deepEqual(D.comfort({asked:{low:51,high:60}}),{low:51,high:60,source:'asked'});
  assert.equal(D.comfort({asked:{low:60,high:61}}),null);
  const c={low:55,high:67};
  for(const e of D.CATALOG.filter(e=>e.mode==='hold')){
    const notes=D.notesFor(e,c,TODAY);
    assert.equal(notes.length,e.count||(e.tops||e.offsets).length,e.id);
    assert.ok(notes.every(n=>Number.isInteger(n)&&n>=c.low&&n<=c.high),e.id+' '+notes);
    assert.deepEqual(D.notesFor(e,c,TODAY),notes,'the same day gives the same notes');
  }
  const ear=D.exercise('ear-follow');
  assert.notDeepEqual(D.notesFor(ear,c,day(0)),D.notesFor(ear,c,day(1)));
  assert.ok(D.notesFor(ear,c,TODAY).every((n,i,a)=>!i||n!==a[i-1]));
  assert.equal(D.noteName(60),'C4');assert.equal(D.noteName(57),'A3');
});

test('an exercise grows with its area: “멈” 롱톤 6 s → 8 s (지속음 2단계) → a high note (4단계); 비브라토 “오~” from 4단계',()=>{
  const mum=D.exercise('voice-mum'),vib=D.exercise('voice-vibrato'),c={low:55,high:67},at=n=>()=>n;
  assert.equal(D.adapt(mum,at(0)),mum,'unchanged before 2단계');assert.equal(D.adapt(mum,at(1)).hold,6);
  const eight=D.adapt(mum,at(2));assert.deepEqual([eight.id,eight.hold,eight.highNote],['voice-mum',8,undefined]);assert.match(eight.text,/8초/);
  const high=D.adapt(mum,at(4));assert.equal(high.hold,8);
  const notes=D.notesFor(high,c,TODAY);assert.equal(notes.length,4);assert.equal(notes.at(-1),65);
  assert.deepEqual(D.noteTags(high,3),{top:true});assert.deepEqual(D.noteTags(high,0),{});
  assert.equal(D.adapt(vib,at(3)),vib);
  const oh=D.adapt(vib,at(4));assert.deepEqual(oh.vowels,['아~','오~']);assert.equal(D.syllableOf(oh,1),'오~');assert.equal(D.syllableOf(vib,1),'아~');
  assert.equal(mum.hold,6,'the catalogue itself never changes');
});

test('기본기 추천: today\'s focus exercise takes its group\'s place (said why); not when it is off, a group rests, or a 그룹 대신 step is tagged', () => {
  const L = require('../app/levels-model.js');
  const run = (date, measures, exercise) => ({id:'practice-set:' + date, date, created:Date.parse(date + 'T10:00:00Z'), dailySet:{v:1, items:[{exercise, state:'done', measures}]}});
  const scale = {area:'pitch', kind:'scale5', value:85, unit:'%', right:40, of:47};
  const held = {area:'pitch', kind:'hold', value:5, of:5, unit:'개', hold:4, tolerance:25};
  // 음정 1·2단계 earned; 3단계 (5음 스케일 80%) met on two days: one more day makes it.
  const db = {...empty(), practices:[day(-30), day(-29), day(-28)].map(d => run(d, [held], 'ear-follow')).concat([run(day(-3), [scale], 'ear-scale'), run(day(-2), [scale], 'ear-scale')]),
    practicePlans:[1, 2].map(step => ({id:'skill-step:pitch:' + step, kind:'skill-step', v:1, area:'pitch', step, earned:day(-20), days:[], created:1}))};
  {
    const f = D.focusOf(db, TODAY);
    assert.deepEqual([f.area, f.step, f.exercise, f.count], ['pitch', 3, 'ear-scale', 2]);
    // On a day the ear rotation would give 음 따라 부르기, the set has the 스케일, with why.
    const date = [0, 1, 2, 3].map(day).find(d => D.pick(D.prefs(db), 'ear', d).id === 'ear-follow');
    const st = D.build(db, {today:date}).steps.find(s => s.group === 'ear');
    assert.equal(st.exercise, 'ear-scale');
    assert.deepEqual(st.focus, {area:'pitch', title:'음정', step:3, why:'음정 3단계까지 1일 남았어요 (3번 중 2번)'});
    assert.equal(D.build(db, {today:date}).steps.filter(s => s.focus).length, 1, 'one focus a day');
  }
  // Turned off, or 음감 resting: the rotation as before.
  const off = {...db, practicePlans:[...db.practicePlans, {id:'daily-set-prefs', kind:'daily-set-prefs', v:1, off:{'ear-scale':true}, groupsOff:{}, replace:{}}]};
  assert.notEqual(D.focusOf(off, TODAY)?.exercise, 'ear-scale');
  const rest = {...db, practicePlans:[...db.practicePlans, {id:'daily-set-prefs', kind:'daily-set-prefs', v:1, off:{}, groupsOff:{ear:true}, replace:{}}]};
  assert.equal(D.build(rest, {today:TODAY}).steps.some(s => s.group === 'ear'), false);
  assert.equal(L.exerciseFor('pitch', 3), 'ear-scale');
});

/* 노래 연습실 → 곡에 적용하기 (2026-11-26): the room's 가사·표현 tasks take turns on the set's song step. */
const songStep=b=>b.steps.find(s=>s.apply);
test('곡에 적용하기 carries ONE 가사·표현 task of the former 노래 연습실, by the date: the same day the same task, the 5 in turn',()=>{
  const db=empty(),keys=[];
  for(let n=0;n<10;n++){const st=songStep(D.build(db,{today:day(n),recentSongId:'s1'}));keys.push(st.roomTask);assert.equal(st.roomWhy,'rotation');}
  assert.deepEqual(D.ROTATION,['connect','reflection','delivery','expressive','scene']);
  assert.deepEqual(new Set(keys.slice(0,5)),new Set(D.ROTATION));          // none repeats until the list is through
  assert.deepEqual(keys.slice(5),keys.slice(0,5));                          // then the same turn again
  assert.equal(keys[0],D.ROTATION[D.dayNumber(TODAY)%5]);
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomTask,keys[0]); // same day → same task
  // An edited list (the set screen's own steps) gets today's task too.
  const own=D.build(db,{today:TODAY,recentSongId:'s1'}).own.map(s=>({...s,roomTask:'scene',roomWhy:'rotation'}));
  assert.equal(songStep(D.build(db,{today:day(1),own})).roomTask,keys[1]);
  // The words are the room's: name and its one-line instruction (practice-room/app.js TASKS).
  const st=songStep(D.build(db,{today:TODAY,recentSongId:'s1'})),info=D.applyInfo(st);
  assert.deepEqual([info.name,info.text],[D.APPLY_TASKS[st.roomTask].name,D.APPLY_TASKS[st.roomTask].text]);
  assert.equal(info.why,'가사·표현 과제 5개가 돌아가며 나와요 · 원래 노래 연습실 과제');
  const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../practice-room/app.js'),'utf8');
  for(const [key,t] of Object.entries(D.APPLY_TASKS)){
    assert.ok(app.includes(key+":{name:'"+t.name),key+' name');
    assert.ok(app.includes("goal:'"+t.text+"'"),key+' text');
  }
  assert.equal(D.applyInfo({kind:'song'}),null);
});

test('곡에 적용하기: a performance (나의 공연) within 30 days gives 공연 연습 녹음과 회고 instead',()=>{
  const db=empty(),show=(o)=>({id:'pf1',title:'정기 공연',status:'preparing',songLinks:[{songId:'s1'}],...o});
  db.performances=[show({sessions:[{date:day(30),status:'scheduled'}]})];
  let st=songStep(D.build(db,{today:TODAY,recentSongId:'s1'}));
  assert.deepEqual([st.roomTask,st.roomWhy,D.applyInfo(st).name],['performance','performance','공연 연습 녹음과 회고']);
  assert.equal(D.nextPerformance(db,TODAY),30);
  db.performances=[show({sessions:[{date:day(31),status:'scheduled'}]})];
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'rotation');
  db.performances=[show({sessions:[{date:day(5),status:'cancelled'}]})];                 // cancelled: no performance
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'rotation');
  db.performances=[show({start:day(0),sessions:[]})];                                     // today, from its start date
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomTask,'performance');
  db.performances=[show({start:day(3),status:'completed'})];                              // not in preparation
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'rotation');
  db.performances=[show({start:day(3)})];db.deleted={performances:['pf1']};                // deleted
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'rotation');
});

test('곡에 적용하기 on a rest day: today\'s 보이스 체크 목 상태 ≤ 2 (or a room submission of today that says rest) gives the task without singing',()=>{
  const check=(date,rating,at)=>({id:'voice-check:'+date+at,date,minutes:.5,practiceMode:'training',voiceCheck:{v:1,selfRating:rating,at}});
  const db=empty();db.performances=[{id:'pf1',status:'preparing',start:day(3)}]; // rest wins over a performance
  db.practices=[check(TODAY,2,1)];
  let st=songStep(D.build(db,{today:TODAY,recentSongId:'s1'}));
  assert.deepEqual([st.roomTask,st.roomWhy,D.APPLY_TASKS.reflection.vocal],['reflection','rest',false]);
  assert.equal(D.applyInfo(st).why,'직접 남긴 불편함이나 목 상태를 우선했어요 · 소리 없이 해요');
  db.practices=[check(TODAY,2,1),check(TODAY,4,2)];                    // the latest check of today counts
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'performance');
  db.practices=[check(day(-1),1,1)];db.performances=[];               // yesterday's says nothing about today
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'rotation');
  db.practices=[check(TODAY,1,1)];db.deleted={practices:[db.practices[0].id]}; // a deleted check counts for nothing
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'rotation');
  db.deleted={};db.practices=[check(TODAY,3,1)];
  assert.equal(D.restToday(db,TODAY),'');
  // practice-room-model's own rule (conditionFor) on a room submission of today; an older one does not hold every later day.
  db.practices=[{id:'practice-room:x1',date:TODAY,practiceRoom:{task:'delivery',draft:{symptoms:['쉰 소리']}}}];
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomTask,'reflection');
  db.practices[0].date=day(-1);
  assert.equal(songStep(D.build(db,{today:TODAY,recentSongId:'s1'})).roomWhy,'rotation');
});

test('곡에 적용하기 off (고르기) or covered by a homework about a song: no step, so no task; the set row keeps the task key, no practiceRoom row',()=>{
  const db=empty();D.savePrefs(db,D.setGroup(D.prefs(db),'song',false));
  const off=D.build(db,{today:TODAY,recentSongId:'s1'});
  assert.ok(!off.steps.some(s=>s.roomTask||s.apply));
  const hw=empty();hw.assignments.push({id:'a9',title:'후렴 고음 연습',status:'active',startDate:'2026-11-01',dueDate:'2026-11-08',songId:'s1'});
  assert.ok(!D.build(hw,{today:TODAY,recentSongId:'s1'}).steps.some(s=>s.roomTask));
  // Saved: the step's item names its task; the song step keeps its own song row; nothing is written as 노래 연습실.
  const on=four();let now=1_000_000;
  const s=P.start(D.build(on,{today:TODAY,recentSongId:'s1'}).steps,{id:'run9',date:TODAY,now});
  while(s.phase==='run'){P.play(s,now);now+=60_000;D.finishItem(s,{state:'done',result:{mode:'free'},now});}
  D.save(on,s,[]);
  const run=on.practices.find(p=>p.id==='practice-set:run9'),item=run.dailySet.items.find(x=>x.apply);
  assert.equal(item.roomTask,songStep({steps:s.steps}).roomTask);
  assert.equal(item.title,'곡에 적용하기 · This Is the Moment');
  assert.ok(on.practices.every(p=>!p.practiceRoom&&p.categoryLabel!=='노래 연습실'));
  assert.ok(!run.dailySet.items.filter(x=>!x.apply).some(x=>'roomTask' in x));
});

test('따라 하기 is a set of one guide step: the run row counts the homework once and checks its goal, with no goal row and no minutes twice',()=>{
  const db=seed(),now=Date.parse(TODAY+'T12:00:00Z');
  const step={kind:'next',source:'homework',id:'guide:homework:a1',title:'호흡을 길게 유지하기',minutes:5,assignmentId:'a1',
    guide:{key:'homework:a1',lines:[],video:{id:'Kl85hKuMP5Y',title:'영상'},reference:null,scale:null,tuner:false,metronome:null}};
  assert.equal(D.modeOf(step),'guide');assert.equal(D.modeOf({kind:'next',source:'homework'}),'free');
  assert.equal(D.labelOf(step),'숙제');
  const s=P.start([step],{id:'g-run',date:TODAY,now});
  P.play(s,now);P.tick(s,now+90000);
  D.finishItem(s,{state:'done',result:{mode:'guide'},now:now+90000});
  assert.equal(s.phase,'summary');
  const out=D.save(db,s,[],{now:now+91000});
  const run=db.practices.find(p=>p.id==='practice-set:g-run');
  assert.deepEqual(run.completed,['a1']);assert.deepEqual(run.assignmentReps,{a1:1});
  assert.equal(run.minutes,1.5);assert.equal(out.goals,1);
  assert.deepEqual(run.dailySet.items.map(x=>[x.id,x.kind,x.source,x.assignmentId,x.state,x.mode]),[['guide:homework:a1','next','homework','a1','done','guide']]);
  assert.equal(db.dailyGoals.find(g=>g.id==='g1').completed,true);
  assert.equal(db.practices.some(p=>p.id==='goal:g1'),false);
  assert.equal(db.practices.length,1);
  assert.equal(db.assignments.find(t=>t.id==='a1').status,'active');
  assert.equal(D.isGuideRun(run),true);
  // Saving again replaces the same row: still one practice of the homework, the same minutes.
  D.save(db,s,[],{now:now+92000});
  assert.equal(db.practices.length,1);assert.equal(Time.homeworkProgress(db,'a1').reps,1);
  // Skipped: nothing is counted for the homework and the goal is not checked.
  const other=seed(),z=P.start([{...step}],{id:'z',date:TODAY,now});
  P.play(z,now);P.tick(z,now+30000);D.finishItem(z,{state:'skipped',now:now+30000});D.save(other,z,[],{now});
  assert.deepEqual(other.practices[0].completed,[]);assert.equal(other.dailyGoals.find(g=>g.id==='g1').completed,false);
  // A recommendation (no homework) checks the goal made from it by its key.
  const rec=seed();rec.dailyGoals.push({id:'g9',date:TODAY,title:'롱톤',source:'recommendation',sourceId:'analysis:wob',completed:false,order:3});
  const t=P.start([{kind:'next',source:'practice-tip',id:'guide:analysis:wob',title:'롱톤',minutes:5,guide:{key:'analysis:wob',lines:[],video:null}}],{id:'t',date:TODAY,now});
  P.play(t,now);P.tick(t,now+60000);D.finishItem(t,{state:'done',result:{mode:'guide',timer:true},now:now+60000});D.save(rec,t,[],{now});
  assert.equal(rec.dailyGoals.find(g=>g.id==='g9').completed,true);assert.equal(rec.dailyGoals.find(g=>g.id==='g1').completed,false);
  assert.deepEqual(rec.practices[0].completed,[]);assert.equal(rec.practices[0].dailySet.items[0].timer,true);
  // With a song: the one run row is that song's (곡별 연습량), and no second song row holds the same minutes.
  const sg=seed(),u=P.start([{...step,songId:'s1'}],{id:'u',date:TODAY,now});
  P.play(u,now);P.tick(u,now+120000);D.finishItem(u,{state:'done',result:{mode:'guide'},now:now+120000});D.save(sg,u,[],{now});
  assert.equal(sg.practices.length,1);
  assert.deepEqual([sg.practices[0].songId,sg.practices[0].practiceMode,sg.practices[0].minutes],['s1','song',2]);
  assert.equal(sg.practices.filter(p=>p.songId==='s1').reduce((n,p)=>n+Time.actualMinutes(p),0),2);
  assert.deepEqual(sg.practices[0].completed,['a1']);
  // Without a song (and any full set) the row stays training with no song.
  assert.deepEqual([run.songId,run.practiceMode],['','training']);
  // A full set's run is not a 따라 하기.
  assert.equal(D.isGuideRun({dailySet:{items:[{id:'ex-loosen-neck'},{id:'next-hw-a1'}]}}),false);
});

test('AI 청취 코멘트: the 녹음 step item carries aiCoach / aiCoachAt only when asked; one that comes after saving goes on that item in place',()=>{
  const now=Date.parse('2026-11-04T12:00:00Z'),db=empty();
  const s=P.start([{kind:'song',songId:'s1',title:'곡 구간 · This Is the Moment',minutes:5},{kind:'record',songId:'s1',title:'녹음 · This Is the Moment',optional:true,minutes:3}],{id:'k',date:TODAY,now});
  P.play(s,now);P.tick(s,now+60000);D.finishItem(s,{state:'done',now:now+60000});
  P.play(s,now+60000);P.tick(s,now+90000);s.steps[1].mediaIds=['m1'];s.steps[1].aiCoach='  들리는 특징: 끝음이 또렷해요\n다음 시도: 한 번 더  ';s.steps[1].aiCoachAt=now+80000;
  D.finishItem(s,{state:'done',now:now+90000});
  D.save(db,s,[],{now});
  const run=db.practices.find(p=>p.id==='practice-set:k'),[song,rec]=run.dailySet.items;
  assert.equal(rec.aiCoach,'들리는 특징: 끝음이 또렷해요\n다음 시도: 한 번 더');assert.equal(rec.aiCoachAt,now+80000);
  assert.equal('aiCoach' in song,false);assert.equal('aiCoachAt' in song,false);
  // The comment is only on the run row: the step's own song row is as before.
  const own=db.practices.find(p=>p.id===rec.row);assert.equal(own.songId,'s1');assert.equal('aiCoach' in own,false);
  // Came after saving: set in place, nothing else of the row changes.
  const before=JSON.parse(JSON.stringify(run));
  assert.equal(D.setCoach(db,'practice-set:k',song.id,'들리는 특징: 나중에 온 코멘트',now+200000),true);
  assert.deepEqual({...run,dailySet:{...run.dailySet,items:run.dailySet.items.map(x=>{const {aiCoach,aiCoachAt,...rest}=x;return x.id===song.id?rest:x;})}},before);
  assert.equal(D.setCoach(db,'practice-set:gone',song.id,'x'),false);assert.equal(D.setCoach(db,'practice-set:k','nope','x'),false);assert.equal(D.setCoach(db,'practice-set:k',song.id,'   '),false);
  // coachNotes: newest first, with the song of the step's own row (else the run row's).
  const notes=D.coachNotes(db);
  assert.deepEqual(notes.map(n=>[n.itemId,n.songId,n.date]),[[song.id,'s1',TODAY],[rec.id,'s1',TODAY]]);
  // An old row (no aiCoach anywhere) is untouched and gives no notes; a deleted run gives none.
  assert.deepEqual(D.coachNotes({practices:[{id:'practice-set:o',date:TODAY,dailySet:{v:1,items:[{id:'a',kind:'record',title:'녹음',state:'done'}]}}]}),[]);
  assert.deepEqual(D.coachNotes({...db,deleted:{practices:['practice-set:k']}}),[]);
});
