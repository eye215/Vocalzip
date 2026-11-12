// 반복 목표 across devices: every scenario runs the real merge (data-merge.js, unchanged) in both directions,
// then the routine reconcile the app runs after a cloud merge (goal-routines.js, through VZ.change).
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../app/goal-routines.js'),Merge=require('../data-merge.js'),Home=require('../app/student-home-model.js'),Time=require('../app/practice-time-model.js');
const D1='2026-11-09',D2='2026-11-10',D3='2026-11-11',D4='2026-11-12',D5='2026-11-13';
const ARRAYS=['practices','dailyGoals','practicePlans','assignments'];
/** Mirrors VZ.change's stamp (app/core.js): updatedAt on changed rows, a tombstone for every removed row. */
function change(db,mutate,now){
  const before=structuredClone(db);mutate(db);
  for(const k of ARRAYS){
    const old=new Map((before[k]||[]).map(x=>[String(x.id),JSON.stringify(x)])),ids=new Set();
    for(const x of db[k]||[]){ids.add(String(x.id));if(old.get(String(x.id))!==JSON.stringify(x))x.updatedAt=now;}
    const removed=[...old.keys()].filter(id=>!ids.has(id));
    if(removed.length){db.deleted||={};db.deleted[k]=[...new Set([...(db.deleted[k]||[]),...removed])];}
  }
  return db;
}
const empty=()=>({categories:[],songs:[],lessons:[],assignments:[{id:'a1',title:'립트릴',status:'active'}],practices:[],dailyGoals:[],practicePlans:[]});
/** One routine (5 days from D1) synced to both devices, with D1 done and D2 missed. */
function synced(){
  const db=empty();let n=0;
  const [id]=R.create(db,{titles:['허밍'],days:5,today:D1,uid:()=>'r'+(++n),now:1});
  db.dailyGoals.find(g=>g.date===D1).completed=true;
  return {id,a:structuredClone(db),b:structuredClone(db)};
}
/** One sync: merge, then the app's reconcile as its own change (stamped like any edit). */
const sync=(a,b,now=999)=>change(structuredClone(Merge.merge(structuredClone(a),structuredClone(b)).data),db=>{R.reconcile(db);},now);
const both=(a,b)=>[sync(a,b),sync(b,a)];
const days=(db,id)=>R.goalsOf(db,id).map(g=>[g.date,g.title,g.completed===true]);
const minutes=db=>Time.entries(db.practices).reduce((s,e)=>s+e.minutes,0);

test('(a) both devices complete the same routine day: one check, one practice row, minutes counted once',()=>{
  const {id,a,b}=synced(),goal=id+':'+D3;
  change(a,db=>{Home.setGoal(db,goal,true);R.perform(db,goal,{minutes:20},100);},100);
  change(b,db=>Home.setGoal(db,goal,true),110);
  for(const out of both(a,b)){
    const rows=out.dailyGoals.filter(g=>g.id===goal);
    assert.equal(rows.length,1);assert.equal(rows[0].completed,true);
    assert.equal(rows[0].performance.minutes,20,'the newer plain check does not drop the other device’s record');
    assert.equal(out.practices.filter(p=>p.goalId===goal).length,1);
    assert.equal(minutes(out),20);
    assert.deepEqual(R.progress(out,id,D3),{done:2,total:5,elapsed:3,missed:1});
  }
});

test('(d) performance edited on two devices: last write wins per goal and the minutes count once',()=>{
  const {id,a,b}=synced(),goal=id+':'+D3;
  for(const db of [a,b])change(db,x=>Home.setGoal(x,goal,true),50);
  change(a,db=>R.perform(db,goal,{minutes:20,mediaIds:['m1']},100),100);
  change(b,db=>R.perform(db,goal,{minutes:35,mediaIds:['m2']},120),120);
  for(const out of both(a,b)){
    const g=out.dailyGoals.find(x=>x.id===goal),p=out.practices.filter(x=>x.goalId===goal);
    assert.deepEqual([g.performance.minutes,g.performance.mediaIds],[35,['m2']]);
    assert.equal(p.length,1);assert.equal(p[0].manualMinutes,35);assert.equal(minutes(out),35);
  }
  // Clearing the time on the later device stops counting it on both.
  change(a,db=>R.perform(db,goal,{minutes:null},130),130);
  for(const out of both(a,b))assert.equal(minutes(out),0);
});

test('(b) rename on one device while the other ends: from today on everywhere, no resurrected days, past kept',()=>{
  const {id,a,b}=synced();
  // A (late) checks yesterday and renames from today; B ends today.
  change(a,db=>{Home.setGoal(db,id+':'+D2,true);assert.ok(R.rename(db,id,'허밍 15분',D3,200));},200);
  change(b,db=>assert.ok(R.end(db,id,D3,210)),210);
  const [ab,ba]=both(a,b);
  for(const out of [ab,ba]){
    const r=R.routines(out).find(x=>x.id===id),row=out.practicePlans.find(p=>p.id===id);
    assert.equal(r.archived,true);assert.equal(r.endedOn,D3);assert.equal(r.title,'허밍 15분');
    assert.deepEqual([row.archived,row.title],[true,'허밍 15분'],'the stored row converges too');
    assert.deepEqual(days(out,id),[[D1,'허밍',true],[D2,'허밍',true]],'past days and A’s late check stay; nothing from today on comes back');
    assert.deepEqual(R.progress(out,id,D3),{done:2,total:2,elapsed:2,missed:0});
  }
  assert.deepEqual(days(ab,id),days(ba,id));
  // A later sync with the stale copy still brings nothing back.
  const again=sync(a,ab);assert.deepEqual(days(again,id),days(ab,id));
  assert.equal(R.reconcile(structuredClone(ab)),false,'reconcile settles in one pass');
});

// Known limit (storage layer, out of this change's scope): VZ.change tombstones every removed row and data-merge
// tombstones carry no time, so if B ends the routine while A checks *today's* day before syncing, B's tombstone for that
// day wins and A's check is lost. Fixing it needs tombstones with a time (or a "revived after" rule) in data-merge.js.
test('(b) today checked on A while B ends today keeps A’s check',{todo:'needs timestamped tombstones in data-merge.js'},()=>{
  const {id,a,b}=synced();
  change(a,db=>Home.setGoal(db,id+':'+D3,true),200);
  change(b,db=>R.end(db,id,D3,210),210);
  for(const out of both(a,b))assert.deepEqual(days(out,id).at(-1),[D3,'허밍',true]);
});

test('(b) rename + new length on one device, end on the other: the earliest end wins and titles follow the log',()=>{
  const {id,a,b}=synced();
  change(a,db=>{R.rename(db,id,'새 이름',D3,300);R.resize(db,id,8,D3,300);},300);
  change(b,db=>R.rename(db,id,'다른 이름',D4,320),320);
  for(const out of both(a,b)){
    const r=R.routines(out).find(x=>x.id===id);
    assert.equal(r.endDate,R.shift(D3,7));assert.equal(r.days,10);assert.equal(r.title,'다른 이름');
    const t=Object.fromEntries(R.goalsOf(out,id).map(g=>[g.date,g.title]));
    assert.deepEqual([t[D2],t[D3],t[D4],t[R.shift(D3,7)]],['허밍','새 이름','다른 이름','다른 이름']);
    assert.equal(R.goalsOf(out,id).length,10);
  }
  change(b,db=>R.end(db,id,D4,400),400);
  for(const out of both(a,b)){
    assert.deepEqual(R.goalsOf(out,id).map(g=>g.date),[D1,D2,D3]);
    assert.equal(R.routines(out).find(x=>x.id===id).archived,true);
  }
});

test('shorten then extend: the days come back after sync although the removed ids are tombstoned',()=>{
  const {id,a,b}=synced();
  change(a,db=>R.resize(db,id,1,D3,100),100);
  assert.deepEqual(R.goalsOf(a,id).map(g=>g.date),[D1,D2,D3]);
  for(const out of both(a,b))assert.deepEqual(R.goalsOf(out,id).map(g=>g.date),[D1,D2,D3],'stale device days are not resurrected');
  change(a,db=>R.resize(db,id,4,D3,200),200);
  assert.ok(a.deleted.dailyGoals.includes(id+':'+D4));
  for(const out of both(a,b)){
    assert.deepEqual(R.goalsOf(out,id).map(g=>g.date),[D1,D2,D3,D4,D5,R.shift(D5,1)]);
    assert.equal(R.goalsOf(out,id).find(g=>g.date===D4).id,id+':'+D4+'~2');
  }
});

test('the routine row keeps both edits even when the merge keeps only one version of it',()=>{
  const {id,a,b}=synced();
  change(b,db=>R.end(db,id,D3,100),100);
  change(a,db=>R.resize(db,id,10,D3,200),200);   // newer row on A: archived:false, endDate later
  const merged=Merge.merge(structuredClone(a),structuredClone(b)).data;
  assert.equal(merged.practicePlans.find(p=>p.id===id).archived,false,'generic merge alone would lose the end');
  for(const out of both(a,b)){
    const row=out.practicePlans.find(p=>p.id===id),v=R.routines(out)[0];
    assert.equal(row.archived,true);assert.equal(v.archived,true);assert.equal(v.endedOn,D3);
    assert.deepEqual(R.goalsOf(out,id).map(g=>g.date),[D1,D2],'A’s extension days are dropped');
  }
});

test('(c) both devices plan the same days offline: one row per routine day',()=>{
  const a=empty(),b=empty();
  // The same homework repeated on both devices on the same day gets the same routine id.
  change(a,db=>R.create(db,{titles:['립트릴'],days:3,today:D3,uid:()=>'x',source:'homework',sourceId:'a1',now:10}),10);
  // B had already planned (and checked) today's homework as a plain goal, then repeats it too.
  change(b,db=>{db.dailyGoals.push({id:'plain',date:D3,title:'립트릴',source:'homework',sourceId:'a1',completed:true});},5);
  change(b,db=>R.create(db,{titles:['립트릴'],days:3,today:D3,uid:()=>'y',source:'homework',sourceId:'a1',now:12}),12);
  assert.equal(b.dailyGoals.filter(g=>g.date===D3).length,1,'the planned homework goal joins the routine');
  const [ab,ba]=both(a,b);
  for(const out of [ab,ba]){
    assert.equal(R.routines(out).length,1);
    const goals=out.dailyGoals.filter(g=>g.sourceId==='a1');
    assert.deepEqual(goals.map(g=>g.date).sort(),[D3,D4,D5]);
    const today=goals.find(g=>g.date===D3);assert.equal(today.completed,true);assert.equal(today.source,'homework');
    assert.equal(R.progress(out,R.routines(out)[0].id,D3).done,1);
    assert.equal(out.assignments[0].status,'active');
  }
  // Extending on both devices to the same day writes the same ids.
  const id=R.routines(ab)[0].id,x=structuredClone(ab),y=structuredClone(ab);
  change(x,db=>R.resize(db,id,5,D3,50),50);change(y,db=>R.resize(db,id,5,D3,60),60);
  for(const out of both(x,y))assert.equal(R.goalsOf(out,id).length,5);
});

test('reconcile leaves ordinary goals and data without routines alone',()=>{
  const {id,a,b}=synced();
  change(a,db=>R.rename(db,id,'바뀐 이름',D3,100),100);
  b.dailyGoals.push({id:'own',date:D3,title:'개인',source:'personal',completed:false},{id:'hw',date:D3,title:'숙제',source:'homework',sourceId:'zz'});
  const out=sync(b,a);
  assert.deepEqual(out.dailyGoals.filter(g=>['own','hw'].includes(g.id)).map(g=>g.title),['개인','숙제']);
  assert.equal(out.dailyGoals.find(g=>g.id===id+':'+D4).title,'바뀐 이름');
  const plain=empty();plain.dailyGoals.push({id:'x',date:D3,title:'x'});assert.equal(R.reconcile(plain),false);
});
