const test=require('node:test');
const assert=require('node:assert/strict');
const {report,measurement,completeDate}=require('../app/plan-outcome-model.js');
const p={id:'plan-A',kind:'monthly-vocal',metric:'stability',songId:'song-1',startDate:'2026-11-01',days:5};
const audio=(id,date,wobble,songId='song-1')=>({id,recordedDate:date,songId,analysis:{metrics:{stability:{wobbleCents:wobble}}}});
const args={plan:p,dateOf:m=>m.recordedDate,valid:()=>true,asOf:'2026-11-07'};
test('outcome reports actual progress with planned days as denominator',()=>{
 const r=report({...args,goals:[{sourceId:p.id,date:'2026-11-01',completed:true},{sourceId:p.id,date:'2026-11-02',completed:true}]});
 assert.equal(r.completedDays,2);
 assert.equal(r.completionRate,40);
 assert.equal(r.scheduledDays,5);
 assert.equal(completeDate(p),'2026-11-05');
});
test('same-song reliable before/within-plan takes only',()=>{
 const r=report({...args,recordings:[audio('before','2026-10-29',27),audio('during','2026-11-03',19),
 audio('after','2026-11-06',1),audio('other','2026-11-04',1,'song-2')]});
 assert.equal(r.measurement.change,'better');
 assert.equal(r.measurement.before,27);
 assert.equal(r.measurement.after,19);
 assert.deepEqual(r.measurement.afterIds,['during']);
});
test('insufficient baseline does not claim improved',()=>{
 const r=report({...args,recordings:[audio('only','2026-11-03',12)]});
 assert.equal(r.measurement.change,'insufficient');
 assert.equal(r.recommendation,'collect');
});
test('cannot finalize plan before last scheduled day',()=>{
 assert.throws(()=>report({...args,asOf:'2026-11-04'}),/종료 후/);
});
test('vibrato has no growth-report measure: old average kept as 참고, never judged',()=>{
 const source={...p,metric:'vibrato'};
 const rows=[{id:'x',songId:'song-1',recordedDate:'2026-10-01',analysis:{metrics:{vibrato:{regularity:0.40}}}},
 {id:'y',songId:'song-1',recordedDate:'2026-11-03',analysis:{metrics:{vibrato:{regularity:0.55}}}}];
 const r=report({...args,plan:source,recordings:rows});
 assert.equal(r.measurement.state,'reference');
 assert.equal(r.measurement.change,'insufficient'); // older app versions read "not judged"
 assert.equal(r.measurement.before,0.4);
 assert.equal(r.measurement.after,0.55);
 assert.equal(r.recommendation,'listen');
});

test('preview and final report share the same before/during window, excluding later recordings',()=>{
 const recordings=[audio('baseline','2026-10-29',27),audio('during','2026-11-03',19),
  audio('later','2026-11-10',1),audio('wrong-song','2026-11-03',1,'other')];
 const preview=measurement(p,recordings,args.dateOf,args.valid);
 const saved=report({...args,recordings});
 assert.deepEqual(preview,saved.measurement);
 assert.deepEqual(preview.afterIds,['during']);
 assert.equal(preview.after,19);
});
test('a preview is allowed before the final day, but a report is not',()=>{
 const preview=measurement(p,[audio('baseline','2026-10-29',22),audio('during','2026-11-03',18)],args.dateOf,args.valid);
 assert.equal(preview.after,18);
 assert.throws(()=>report({...args,asOf:'2026-11-03'}),/종료 후/);
});

/* ---------- 성장 리포트 v2 rules (growth-metrics-model.js) ---------- */
const G=require('../app/growth-metrics-model.js');
const {isLegacy}=require('../app/plan-outcome-model.js');
// [start, dur, midi, intonation, wobble]
const PHR=({shift=0,stretch=1,longer=0,into=12,wob=8}={})=>[[10,3,64],[15,2.5,67],[20,3.5,69],[26,4,72],[32,2,71]]
 .map(([t,d,m])=>[Math.round((shift+10+(t-10)*stretch)*10)/10,Math.round((d*stretch+longer)*10)/10,m,into,wob]);
const BANDS=[[60,4,.6,1,3,6],[62,4,.6,1,3,6],[64,5,.7,1.2,4,7],[67,4,.6,1,3,6],[72,3,.8,1.2,3,10]];
const v2=({into=12,wob=8,phrases=PHR({into,wob}),detail=true,instant=9600}={})=>({v:2,metrics:{voicedSeconds:40,
 intonation:{meanAbsCents:into,notes:30},stability:{wobbleCents:wob,notes:12},breath:{phrases:5,medianPhrase:3},
 range:{stableHigh:{note:'E5',cents:7600},instantaneous:{note:'C7',cents:instant},main:{low:'C4',high:'D5',lowCents:6000,highCents:7400}},
 ...(detail?{phrases:{v:1,rows:phrases},pitchBands:{v:1,rows:BANDS}}:{})}});
const rec=(id,date,analysis,ok=true)=>({id,songId:'song-1',recordedDate:date,analysis,ok});
const v2args={dateOf:m=>m.recordedDate,valid:m=>m.ok!==false};
const plan=metric=>({...p,metric});
test('v2: same phrases are compared (whole-song accuracy alone would say worse)',()=>{
 const recordings=[rec('pre','2026-10-28',v2({into:30,phrases:PHR({into:20})})),
  rec('mid','2026-11-03',v2({into:40,phrases:PHR({shift:3,into:11})}))];
 const m=measurement(plan('intonation'),recordings,v2args.dateOf,v2args.valid);
 assert.equal(m.rules,2);assert.equal(m.growthMetric,'intonation');
 assert.equal(m.basis,'phrases');assert.equal(m.matched,5);
 assert.equal(m.state,'better');assert.equal(m.change,'better');
 assert.equal(m.before,20);assert.equal(m.after,11);
 assert.deepEqual(m.beforeIds,['pre']);assert.deepEqual(m.afterIds,['mid']);
 // Same result as the growth report for the same two takes.
 const g=G.compareMetric('intonation',{id:'pre',a:recordings[0].analysis,date:'2026-10-28',ok:true},{id:'mid',a:recordings[1].analysis,date:'2026-11-03',ok:true});
 assert.equal(g.state,m.state);assert.equal(g.before,m.before);assert.equal(g.after,m.after);
});
test('v2: the latest take before the plan vs the latest take during it, later takes excluded',()=>{
 const recordings=[rec('old','2026-09-01',v2({wob:30})),rec('pre','2026-10-30',v2({wob:12})),
  rec('mid1','2026-11-02',v2({wob:20})),rec('mid2','2026-11-04',v2({wob:6})),rec('late','2026-11-09',v2({wob:40}))];
 const m=measurement(plan('stability'),recordings,v2args.dateOf,v2args.valid);
 assert.deepEqual([m.beforeIds,m.afterIds],[['pre'],['mid2']]);
 assert.equal(m.beforeCount,2);assert.equal(m.afterCount,2);
 assert.equal(m.beforeDate,'2026-10-30');assert.equal(m.afterDate,'2026-11-04');
});
test('v2 holds: confidence, version mix, v1 and missing detail, tempo, no take before the plan → collect',()=>{
 const cases=[
  ['intonation',[rec('a','2026-10-28',v2(),false),rec('b','2026-11-03',v2(),false)],'confidence'],
  ['intonation',[rec('a','2026-10-28',{v:1,metrics:{voicedSeconds:30,intonation:{meanAbsCents:30,notes:10}}}),rec('b','2026-11-03',v2())],'version-mixed'],
  ['phrase',[rec('a','2026-10-28',{v:1,metrics:{voicedSeconds:30,breath:{medianPhrase:2}}}),rec('b','2026-11-03',{v:1,metrics:{voicedSeconds:30,breath:{medianPhrase:4}}})],'v1'],
  ['phrase',[rec('a','2026-10-28',v2({detail:false})),rec('b','2026-11-03',v2({detail:false}))],'reanalyze'],
  ['phrase',[rec('a','2026-10-28',v2()),rec('b','2026-11-03',v2({phrases:PHR({stretch:1.3})}))],'tempo'],
  ['stability',[rec('b','2026-11-03',v2())],'no-pair'],
  ['stability',[rec('a','2026-10-28',v2())],'no-pair']
 ];
 for(const [metric,recordings,reason] of cases){
  const r=report({...v2args,plan:plan(metric),recordings,asOf:'2026-11-07'});
  assert.equal(r.measurement.state,'hold',metric+' '+reason);
  assert.equal(r.measurement.reason,reason,metric+' '+reason);
  assert.equal(r.measurement.change,'insufficient');
  assert.equal(r.measurement.before,null);assert.equal(r.measurement.delta,null);
  assert.deepEqual([r.measurement.beforeIds,r.measurement.afterIds],[[],[]]);
  assert.equal(r.measurement.mixedVersions,reason==='version-mixed');
  assert.equal(r.recommendation,'collect');
 }
 assert.match(G.holdText('version-mixed'),/판정 보류/);
});
test('breath compares the same phrases with the tempo corrected',()=>{
 const recordings=[rec('a','2026-10-28',v2()),rec('b','2026-11-03',v2({phrases:PHR({stretch:1.1})}))];
 const r=report({...v2args,plan:plan('phrase'),recordings,asOf:'2026-11-07'});
 assert.equal(r.measurement.state,'similar');assert.equal(r.measurement.tempo,1.1);assert.equal(r.scope,'same-phrases');
});
test('the instant highest note never changes an outcome, and range is not a plan metric',()=>{
 const a=[rec('a','2026-10-28',v2({wob:12,instant:9000})),rec('b','2026-11-03',v2({wob:6,instant:10500}))];
 const b=[rec('a','2026-10-28',v2({wob:12,instant:9000})),rec('b','2026-11-03',v2({wob:6,instant:7000}))];
 assert.deepEqual(measurement(plan('stability'),a,v2args.dateOf,v2args.valid),measurement(plan('stability'),b,v2args.dateOf,v2args.valid));
 for(const metric of ['range','high','passaggio'])assert.throws(()=>measurement(plan(metric),a,v2args.dateOf,v2args.valid),/분석 비교/);
});
test('backward compatibility: old saved reports are recognised; new ones keep every old field',()=>{
 const old={id:'plan-outcome:plan-A',planId:'plan-A',songId:'song-1',metric:'stability',startDate:'2026-11-01',endDate:'2026-11-05',
  completedDays:2,scheduledDays:5,completionRate:40,recommendation:'maintain',scope:'whole-recording',
  measurement:{before:27,after:19,delta:-8,change:'better',mixedVersions:false,beforeCount:1,afterCount:1,beforeIds:['x'],afterIds:['y']}};
 assert.equal(isLegacy(old),true);
 const fresh=report({...args,recordings:[audio('before','2026-10-29',27),audio('during','2026-11-03',19)]});
 assert.equal(isLegacy(fresh),false);
 for(const k of Object.keys(old))assert.ok(k in fresh,'top-level '+k);
 for(const k of Object.keys(old.measurement))assert.ok(k in fresh.measurement,'measurement.'+k);
 assert.equal(typeof fresh.measurement.delta,'number');
 assert.ok(Array.isArray(fresh.measurement.beforeIds)&&Array.isArray(fresh.measurement.afterIds));
 // Recording deletion still clears the compared ids (the only recording references a report stores).
 const {deleteMedia}=require('../data-merge.js');
 const db={vocalPlanReports:[fresh],practicePlans:[],lessons:[],practices:[]};
 deleteMedia(db,'during');
 assert.deepEqual(db.vocalPlanReports[0].measurement.afterIds,[]);
 assert.equal(JSON.stringify(db.vocalPlanReports[0]).includes('"during"'),false);
});
