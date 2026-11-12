// 주간 요약 (app/weekly-summary-model.js): KST Monday–Sunday weeks, performed minutes only, no double counting,
// growth via periodReport (no highest-note judgement), optional sections only when their data exists.
const {test}=require('node:test'),assert=require('node:assert/strict');
const W=require('../app/weekly-summary-model.js');

const kst=(date,time)=>Date.parse(date+'T'+time+'+09:00');
const v2=(into,wob=8)=>({v:2,at:1,metrics:{voicedSeconds:40,intonation:{meanAbsCents:into,within20:80,notes:30},stability:{wobbleCents:wob,notes:12},
 range:{stableHigh:{note:'A5',cents:8100},instantaneous:{note:'C7',cents:9600},main:{lowCents:6000,highCents:7400}},breath:{phrases:5,medianPhrase:3}},confidence:{pitchConfidence:.95}});
const base=()=>({songs:[{id:'s1',title:'This Is Me',created:kst('2026-10-01','10:00')},{id:'s2',title:'새 곡',created:kst('2026-11-10','09:00')}],
 practices:[],dailyGoals:[],practicePlans:[],lessons:[],assignments:[],deleted:{}});

test('KST week bounds: Monday start, Sunday 23:59 KST stays in the week, Monday 00:00 KST is the next week',()=>{
 assert.equal(W.monday('2026-11-09'),'2026-11-09');
 assert.equal(W.monday('2026-11-15'),'2026-11-09');
 assert.equal(W.monday('2026-11-16'),'2026-11-16');
 assert.equal(W.kstDate(kst('2026-11-15','23:59')),'2026-11-15');
 assert.equal(W.kstDate(kst('2026-11-16','00:00')),'2026-11-16');
 // Sunday 23:30 KST is 14:30 UTC Sunday; Monday 00:30 KST is still Sunday in UTC.
 const media=[{id:'a',created:kst('2026-11-15','23:30'),category:'song'},{id:'b',created:kst('2026-11-16','00:30'),category:'song'}];
 const s=W.build(base(),media,{today:'2026-11-16',weekStart:'2026-11-12'});
 assert.equal(s.start,'2026-11-09');assert.equal(s.end,'2026-11-15');
 assert.equal(s.recordings.total,1);
 assert.equal(W.build(base(),media,{today:'2026-11-16'}).recordings.total,1);
 // "now" on Sunday night in KST is still that week.
 assert.equal(W.build(base(),[],{now:kst('2026-11-15','23:50')}).start,'2026-11-09');
 assert.equal(W.build(base(),[],{now:kst('2026-11-16','00:10')}).start,'2026-11-16');
});

test('explicit recorded date wins over the creation time',()=>{
 const s=W.build(base(),[{id:'a',recordedDate:'2026-11-10',created:kst('2026-11-20','10:00'),category:'lesson'}],{today:'2026-11-21',weekStart:'2026-11-10'});
 assert.equal(s.recordings.total,1);assert.equal(s.recordings.byCategory.lesson,1);
});

test('practice minutes use performed time only, never recording length, and count a duplicated record once',()=>{
 const db=base();
 db.practices=[
  {id:'p1',date:'2026-11-09',songId:'s1',minutes:20,mediaSeconds:3600,updatedAt:1},
  {id:'p1',date:'2026-11-09',songId:'s1',minutes:25,mediaSeconds:3600,updatedAt:2}, // same record synced twice: newer wins
  {id:'p2',date:'2026-11-10',songId:'s1',manualMinutes:15,minutes:40},
  {id:'p3',date:'2026-11-11',practiceMode:'training',minutes:10},
  {id:'p4',date:'2026-11-12',songId:'s1',practiceTimeSource:'unconfirmed',minutes:300},
  {id:'p5',date:'2026-11-02',songId:'s1',minutes:30},
  {id:'p6',date:'2026-11-03',songId:'s1',minutes:30},
  {id:'gone',date:'2026-11-10',songId:'s1',minutes:999}
 ];
 db.deleted={practices:['gone']};
 const media=[{id:'m1',created:kst('2026-11-09','10:00'),category:'song',durationSeconds:7200}];
 const s=W.build(db,media,{today:'2026-11-15',weekStart:'2026-11-09'});
 assert.equal(s.practice.minutes,25+15+10);
 assert.equal(s.practice.days,3);
 assert.deepEqual(s.practice.daysList.map(d=>d.minutes),[25,15,10,0,0,0,0]);
 assert.equal(s.practice.previous.minutes,60);
 assert.equal(s.practice.previous.days,2);
 assert.equal(s.practice.delta,-10);
 assert.equal(s.practice.streak,3);
 assert.equal(s.practice.topSongs[0].title,'This Is Me');assert.equal(s.practice.topSongs[0].minutes,40);assert.equal(s.practice.topSongs[0].sessions,2);
 assert.equal(s.practice.topSongs[1].title,'보컬 트레이닝');
});

test('weekly target from the week plan, else the sum of seven day plans, else unset',()=>{
 const db=base();db.practices=[{id:'p',date:'2026-11-10',songId:'s1',minutes:60}];
 db.practicePlans=[{id:'week:2026-11-09',period:'week',date:'2026-11-09',targetMinutes:120}];
 let s=W.build(db,[],{today:'2026-11-15',weekStart:'2026-11-09'});
 assert.equal(s.practice.target,120);assert.equal(s.practice.ratio,50);
 db.practicePlans=Array.from({length:7},(_,i)=>({id:'day:'+W.shift('2026-11-09',i),period:'day',date:W.shift('2026-11-09',i),targetMinutes:20}));
 s=W.build(db,[],{today:'2026-11-15',weekStart:'2026-11-09'});assert.equal(s.practice.target,140);
 db.practicePlans.pop();
 s=W.build(db,[],{today:'2026-11-15',weekStart:'2026-11-09'});assert.equal(s.practice.target,null);assert.equal(s.practice.ratio,null);
});

test('streak continues across Monday into the previous week',()=>{
 const db=base();db.practices=['2026-11-07','2026-11-08','2026-11-09','2026-11-10'].map((date,i)=>({id:'p'+i,date,songId:'s1',minutes:10}));
 assert.equal(W.build(db,[],{today:'2026-11-15',weekStart:'2026-11-09'}).practice.streak,4);
});

test('goals, routine progress and homework sessions linked in the week',()=>{
 const db=base();
 db.practicePlans=[{id:'routine:r1',kind:'routine',title:'립트릴 5분',startDate:'2026-11-08',days:7}];
 db.dailyGoals=[
  {id:'g1',date:'2026-11-09',title:'A',completed:true},{id:'g2',date:'2026-11-10',title:'B',completed:false},
  {id:'routine:r1:2026-11-09',date:'2026-11-09',title:'립트릴 5분',routineId:'routine:r1',completed:true},
  {id:'routine:r1:2026-11-10',date:'2026-11-10',title:'립트릴 5분',routineId:'routine:r1',completed:false},
  {id:'routine:r1:2026-11-08',date:'2026-11-08',title:'립트릴 5분',routineId:'routine:r1',completed:true},
  {id:'x:next',sourceId:'practice-room:1',date:'2026-11-11',title:'다시 부르기',completed:false},
  {id:'y:next',sourceId:'practice-room:2',date:'2026-11-11',title:'다시 부르기',completed:true}
 ];
 db.assignments=[{id:'t1',title:'후렴 호흡',created:kst('2026-11-01','10:00')}];
 db.practices=[{id:'p1',date:'2026-11-10',songId:'s1',minutes:10,completed:['t1'],assignmentReps:{t1:3}},{id:'p2',date:'2026-11-11',songId:'s1',minutes:5,completed:['t1']}];
 const s=W.build(db,[],{today:'2026-11-15',weekStart:'2026-11-09'});
 assert.equal(s.goals.total,5);assert.equal(s.goals.done,3);
 assert.deepEqual(s.goals.routines,[{id:'routine:r1',title:'립트릴 5분',done:1,total:2}]);
 assert.equal(s.goals.homework.sessions,2);
 assert.deepEqual(s.goals.homework.tasks,[{id:'t1',title:'후렴 호흡',sessions:2,reps:4}]);
});

test('recordings by category, analyses done this week and new songs',()=>{
 const media=[
  {id:'a',created:kst('2026-11-09','10:00'),category:'song'},{id:'b',created:kst('2026-11-10','10:00'),category:'lesson'},
  {id:'c',created:kst('2026-11-11','10:00'),category:'training'},{id:'d',created:kst('2026-11-11','11:00'),category:'room'},
  {id:'e',created:kst('2026-10-01','10:00'),category:'song',analysis:{v:2,at:kst('2026-11-12','09:00')}},
  {id:'f',created:kst('2026-11-12','10:00'),category:'song'}
 ];
 const db=base();db.deleted={media:['f']};
 const s=W.build(db,media,{today:'2026-11-15',weekStart:'2026-11-09'});
 assert.equal(s.recordings.total,4);
 assert.deepEqual(s.recordings.byCategory,{song:1,lesson:1,training:1,room:1});
 assert.equal(s.recordings.analyses,1);
 assert.deepEqual(s.recordings.newSongs.map(x=>x.title),['새 곡']);
});

test('growth compares this week with earlier takes of the same song, holds honestly, never judges the highest note, max 3',()=>{
 const db=base();
 db.songs.push({id:'s3',title:'C'},{id:'s4',title:'D'},{id:'s5',title:'E'});
 const take=(id,songId,date,into,ok=true)=>({id,songId,songTake:true,recordedDate:date,category:'song',analysis:v2(into),ok});
 const media=[
  take('a1','s1','2026-11-01',20),take('a2','s1','2026-11-10',10), // better intonation
  take('b2','s2','2026-11-11',10),                                 // no earlier take → 판정 보류
  take('c1','s3','2026-11-02',10),take('c2','s3','2026-11-12',10,false), // low confidence this week → hold
  take('d1','s4','2026-11-02',10),take('d2','s4','2026-11-12',10.2),
  take('e1','s5','2026-11-02',10),take('e2','s5','2026-11-13',10.1)
 ];
 const s=W.build(db,media,{today:'2026-11-15',weekStart:'2026-11-09'});
 assert.equal(s.growth.songs,5);assert.equal(s.growth.items.length,3);assert.equal(s.growth.more,2);
 const first=s.growth.items[0];
 assert.equal(first.title,'This Is Me');
 assert.equal(first.lines[0].id,'intonation');assert.equal(first.lines[0].state,'better');
 for(const item of s.growth.items)for(const line of item.lines)assert.ok(!['range','passaggio'].includes(line.id));
 const all=W.build(db,media.filter(m=>['b2','c1','c2'].includes(m.id)),{today:'2026-11-15',weekStart:'2026-11-09'}).growth.items;
 assert.equal(all.find(x=>x.songId==='s2').hold,'no-earlier');
 assert.equal(all.find(x=>x.songId==='s3').hold,'confidence');
 assert.ok(all.every(x=>x.lines.length===0&&x.holdText));
});

test('lessons this week with feedback snippet and new homework; cancelled lessons are skipped',()=>{
 const db=base();
 db.lessons=[{id:'l1',date:'2026-11-11',startTime:'19:00',songIds:['s1'],feedback:'  턱 힘 빼기.\n후렴 첫 음 미리 준비하기 '+'가'.repeat(100)},
  {id:'l2',date:'2026-11-12',status:'cancelled'},{id:'l3',date:'2026-11-02'}];
 db.assignments=[{id:'t1',title:'후렴 5회',lessonIds:['l1'],created:kst('2026-11-11','21:00')},{id:'t2',title:'따로 만든 숙제',created:kst('2026-11-13','08:00')},{id:'t3',title:'예전 숙제',created:kst('2026-10-01','08:00')}];
 const s=W.build(db,[],{today:'2026-11-15',weekStart:'2026-11-09'});
 assert.equal(s.lessons.list.length,1);
 const l=s.lessons.list[0];
 assert.deepEqual(l.songs,['This Is Me']);assert.ok(l.feedback.startsWith('턱 힘 빼기. 후렴'));assert.ok(l.feedback.length<=80);
 assert.deepEqual(l.homework,['후렴 5회']);
 assert.deepEqual(s.lessons.newHomework.map(t=>t.title),['후렴 5회','따로 만든 숙제']);
});

test('optional sections are absent without their data and present with it; set minutes are never added twice',()=>{
 const db=base();db.practices=[{id:'p1',date:'2026-11-10',songId:'s1',minutes:10}];
 let s=W.build(db,[{id:'m',created:kst('2026-11-10','09:00'),category:'training'}],{today:'2026-11-15',weekStart:'2026-11-09'});
 assert.equal(s.voiceCheck,null);assert.equal(s.practiceSet,null);
 assert.ok(!W.toText(s).includes('보이스 체크'));assert.ok(!W.toText(s).includes('연습 세트'));
 db.practices.push({id:'p2',date:'2026-11-11',songId:'s1',minutes:12,practiceSet:{sessionId:'set-1'}},{id:'p3',date:'2026-11-11',minutes:8,practiceMode:'training',practiceSet:{sessionId:'set-1'}},
  {id:'p4',date:'2026-11-12',minutes:5,practiceSetId:'set-2'});
 const media=[{id:'v1',created:kst('2026-11-10','08:00'),category:'training',voiceCheck:true},{id:'v2',created:kst('2026-11-11','08:00'),category:'training',voiceCheck:{v:1}}];
 s=W.build(db,media,{today:'2026-11-15',weekStart:'2026-11-09',voiceCheckLines:items=>['평균 안정성 ±'+items.length*4+' cent',{text:'두 번째 줄'},null]});
 assert.deepEqual(s.voiceCheck,{count:2,days:2,lines:['평균 안정성 ±8 cent','두 번째 줄']});
 assert.deepEqual(s.practiceSet,{sessions:2,minutes:25,days:2});
 assert.equal(s.practice.minutes,35);
 // A broken optional API never breaks the summary.
 s=W.build(db,media,{today:'2026-11-15',weekStart:'2026-11-09',voiceCheckLines:()=>{throw Error('x');}});
 assert.deepEqual(s.voiceCheck.lines,[]);
});

test('empty week, navigation bounds and no mutation of the input',()=>{
 const db=base();db.practices=[{id:'p',date:'2026-10-20',songId:'s1',minutes:10}];
 const frozen=JSON.stringify(db);
 const s=W.build(db,[],{today:'2026-11-15',weekStart:'2026-11-02'});
 assert.equal(s.empty,true);assert.equal(s.canPrevious,true);assert.equal(s.canNext,true);
 assert.equal(s.firstWeek,'2026-10-19');
 const future=W.build(db,[],{today:'2026-11-15',weekStart:'2026-12-01'});
 assert.equal(future.start,'2026-11-09');assert.equal(future.canNext,false);assert.equal(future.current,true);
 assert.equal(JSON.stringify(db),frozen);
 assert.ok(W.toText(s).startsWith('VOCAL.zip 주간 요약'));
});
