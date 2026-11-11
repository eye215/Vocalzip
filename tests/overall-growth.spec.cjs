const test=require('node:test');
const assert=require('node:assert/strict');
const {calculate,DEFINITIONS}=require('../app/overall-growth-model.js');
const clip=(id,songId,date,into,stable=10,phrase=3,vib=.6)=>({
 id,songId,date,analysis:{v:1,metrics:{intonation:{meanAbsCents:into},
  stability:{wobbleCents:stable},breath:{medianPhrase:phrase},
  vibrato:{regularity:vib},voicedSeconds:24}}
});
const make=(items)=>calculate(items,{getDate:m=>m.date,valid:m=>m.analysis?.v===1});
test('lifetime metrics compare only the earliest and latest distinct-day takes for the same song',()=>{
 const r=make([clip('a','s1','2026-09-01',40),clip('b','s1','2026-10-01',20),
  clip('c','s1','2026-11-09',10),clip('d','s2','2026-11-03',99)]);
 const metric=r.metrics.find(x=>x.id==='intonation');
 assert.equal(r.recordings,4);
 assert.equal(r.analysisCount,4);
 assert.equal(r.analyzedSongs,2);
 assert.equal(metric.pairedSongs,1);
 assert.equal(metric.pairs[0].before,40);
 assert.equal(metric.pairs[0].after,10);
 assert.equal(metric.pairs[0].state,'better');
 assert.equal(metric.current,54.5); // latest per-song: (10 + 99) / 2
});
test('no claim of improvement from different songs or repeat takes on the same date',()=>{
 const r=make([clip('first','s1','2026-10-01',50),clip('same','s1','2026-10-01',12),
  clip('new','s2','2026-11-01',5)]);
 assert.equal(r.metrics.find(x=>x.id==='intonation').pairedSongs,0);
 assert.equal(r.topStrength,null);
 assert.equal(r.topWatch,null);
});
test('no analysis remains a data-quality blank rather than a fabricated score',()=>{
 const r=make([{id:'no-analysis',songId:'song',date:'2026-11-03'}]);
 assert.equal(r.recordings,1);
 assert.equal(r.analysisCount,0);
 assert.equal(r.monthCount,0);
 assert.equal(r.metrics.every(m=>m.current==null&&m.pairedSongs===0),true);
 assert.equal(r.recommendations.length,0);
});
test('low-is-better intonation and high-is-better phrase directions are explicit',()=>{
 const r=make([clip('a','s1','2026-09-01',40,20,3,.6),
  clip('b','s1','2026-11-01',20,10,4,.8)]);
 assert.equal(r.metrics.find(x=>x.id==='intonation').improved,1);
 assert.equal(r.metrics.find(x=>x.id==='stability').improved,1);
 assert.equal(r.metrics.find(x=>x.id==='phrase').improved,1);
 assert.equal(r.metrics.find(x=>x.id==='vibrato').improved,1);
});
test('metric chart holds the latest 12 measured months, not all imported months',()=>{
 const takes=Array.from({length:15},(_,i)=>{
  const date=new Date(2025,i,2).toISOString().slice(0,10);
  return clip('rec-'+i,'s1',date,30-i);
 });
 const r=make(takes);
 assert.equal(r.metrics[0].trend.length,12);
 assert.equal(r.metrics[0].trend.at(-1).month,'2026-03');
 assert.equal(DEFINITIONS.length,4);
});
