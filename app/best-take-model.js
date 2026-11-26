/* 베스트 테이크 후보 (owner, 2026-11-26): of one song's recordings, the ones that measured best — so 대표 테이크 is
 * chosen by ear from three, not from a list of hundreds. Pure (tests/best-take-model.test.cjs). It only suggests; the
 * person listens and picks. Measures (lower is better unless said): 음정 오차 (intonation.meanAbsCents), 지속음 흔들림
 * (stability.wobbleCents), 프레이즈 길이 (breath.medianPhrase, higher is better). Each take is ranked within the song on
 * every measure it has; its score is the mean rank (0 = best). Only reliable analyses with an 음정 value take part. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipBestTake=api;})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const num=v=>Number.isFinite(Number(v))&&v!==null&&v!==''?Number(v):null;
const MEASURES=[
  {id:'intonation',get:a=>num(a?.metrics?.intonation?.meanAbsCents),dir:-1,best:'음정이 가장 정확해요',show:v=>'음정 오차 ±'+(Math.round(v*10)/10)+' cent'},
  {id:'stability',get:a=>num(a?.metrics?.stability?.wobbleCents),dir:-1,best:'소리가 가장 덜 흔들려요',show:v=>'흔들림 ±'+(Math.round(v*10)/10)+' cent'},
  {id:'phrase',get:a=>num(a?.metrics?.breath?.medianPhrase),dir:1,best:'프레이즈를 가장 길게 이어요',show:v=>'프레이즈 '+(Math.round(v*10)/10)+'초'}];
/** takes: [{id, created, analysis, …}] of ONE song. → [{take, score, reasons:[…], values:'…'}] best first (max `limit`). */
function pick(takes,{reliable=()=>true,limit=3}={}){
  const pool=(Array.isArray(takes)?takes:[]).filter(m=>{try{return m&&m.analysis&&reliable(m)&&MEASURES[0].get(m.analysis)!=null;}catch{return false;}});
  if(pool.length<2)return [];
  const ranks=new Map(pool.map(m=>[m.id,[]])),bestOf=new Map(pool.map(m=>[m.id,[]]));
  for(const d of MEASURES){
    const has=pool.map(m=>({m,v:d.get(m.analysis)})).filter(x=>x.v!=null);
    if(has.length<2)continue;
    const sorted=has.slice().sort((a,b)=>d.dir*(b.v-a.v));               // best first
    sorted.forEach((x,i)=>{
      const same=sorted.filter(y=>y.v===x.v).map(y=>sorted.indexOf(y)),r=same.reduce((a,b)=>a+b,0)/same.length;
      ranks.get(x.m.id).push(r/(sorted.length-1));
      if(x.v===sorted[0].v)bestOf.get(x.m.id).push(d.best);
    });
  }
  return pool.map(m=>{
    const r=ranks.get(m.id),score=r.length?r.reduce((a,b)=>a+b,0)/r.length:1;
    return {take:m,score,reasons:bestOf.get(m.id),values:MEASURES.map(d=>{const v=d.get(m.analysis);return v==null?'':d.show(v);}).filter(Boolean).join(' · ')};
  }).sort((a,b)=>a.score-b.score||(Number(b.take.created)||0)-(Number(a.take.created)||0)).slice(0,limit);
}
return {pick,MEASURES};
});
