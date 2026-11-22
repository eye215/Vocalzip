/* 성장 › 나 — "am I getting better, and what next", in one glance (성장 v2, .kiro/specs/growth-v2 R2). Pure: no DOM,
 * storage or network; also loaded by Node tests. It only arranges what the existing models already work out:
 *   lv(db, today)            the 큰 단계 card: level, name, % to the next, points today   (app/levels-model.js level)
 *   tiles(db, today)         the eight 기본기 areas: step n/5 · 기준 맞추는 중 · 아직, 유지 중, and the values of the
 *                            last measured days for a tiny line (one value a day, the day's last)  (levels skills · measurements)
 *   changeLine(changes, kind) ONE sentence of what changed in the period, from 무엇이 달라졌나
 *                            (app/growth-changes-model.js build with a period): the latest song pair with a change that is
 *                            not "비슷해요", else a listening verdict, else the 음역 line; null when nothing is comparable
 * Numbers are observations, never a verdict on the voice. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(()=>node?require('./levels-model.js'):root.VzipLevels);
  if(node)module.exports=api;else root.VzipGrowthMe=api;
})(typeof self!=='undefined'?self:globalThis,levels=>{
'use strict';
const list=v=>Array.isArray(v)?v:[];
const SPARK=8;
const AGAINST={week:'지난주와 비교',month:'지난달과 비교',all:'처음과 비교'};
function lv(db={},today=''){
  const L=levels();if(!L)return null;
  const x=L.level(db,{today});
  return {level:x.level,name:x.name,percent:x.percent,points:x.points,toNext:x.toNext,nextName:x.nextName,today:x.today?.points||0};
}
/** The values of an area's last measured days, oldest first (the day's last value), at most SPARK. */
function spark(ms){
  const byDay=new Map();for(const m of ms)if(Number.isFinite(m.value))byDay.set(m.date,m.value);
  return [...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-SPARK).map(([date,value])=>({date,value}));
}
function tiles(db={},today=''){
  const L=levels();if(!L)return [];
  const all=L.measurements(db,{today});
  return L.skills(db,{today}).map(a=>{
    const label=a.state==='step'?(a.step||0)+' / 5단계':a.state==='calibrating'?'기준 맞추는 중':a.state==='soon'?'준비 중':'아직';
    return {id:a.id,title:a.title,state:a.state,step:a.step||0,label,keeping:a.keeping===true,
      spark:spark(all.filter(m=>m.area===a.id)),lower:['sustain','rhythm'].includes(a.id)};
  });
}
/** One sentence of what changed: {text, basis, songId?, firstId?, lastId?} | null. */
function changeLine(changes,kind='month'){
  const against=AGAINST[kind]||AGAINST.month;
  for(const s of list(changes?.songs)){
    const c=list(s.changes).find(x=>!x.similar);
    if(c)return {text:s.title+' · '+c.text,basis:against+' · 같은 곡 · '+(c.numbers||''),songId:s.songId,firstId:s.firstId,lastId:s.lastId};
  }
  const v=list(changes?.verdicts)[0];
  if(v)return {text:v.title+' · 들어 본 평가: '+v.overall,basis:'직접 들어 본 평가',songId:v.songId,firstId:v.firstId,lastId:v.secondId};
  const s=list(changes?.songs)[0];
  if(s&&list(s.changes)[0])return {text:s.title+' · '+s.changes[0].text,basis:against+' · 같은 곡',songId:s.songId,firstId:s.firstId,lastId:s.lastId};
  if(changes?.range?.text)return {text:changes.range.text,basis:changes.range.basis||''};
  return null;
}
return {SPARK,AGAINST,lv,tiles,spark,changeLine};
});
