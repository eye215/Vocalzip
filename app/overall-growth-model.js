/* VOCAL.zip lifetime growth model — no score accuracy or health claims.
 * 성장 리포트 v2: the six separated measures of app/growth-metrics-model.js, compared per song (earliest vs latest
 * comparable take on different days, same analysis version), every song weighted equally. Never the highest note. */
(function(root,factory){
'use strict';
const G=typeof module==='object'&&module.exports?require('./growth-metrics-model.js'):root.VzipGrowthMetrics;
const api=factory(G);
if(typeof module==='object'&&module.exports)module.exports=api;
else root.VzipOverallGrowth=api;
})(typeof self!=='undefined'?self:globalThis,G=>{
'use strict';
const DEFINITIONS=G.METRICS;
const TREND=['intonation','stability']; // whole-recording values: the only ones a monthly average can show
const avg=ns=>ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;
const ym=s=>/^\d{4}-\d{2}/.test(String(s||''))?String(s).slice(0,7):'';
function value(m,d){return G.value(m?.analysis,typeof d==='string'?d:d.id);}
function dateOf(m,getDate){
 const s=String(getDate(m)||'');
 return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';
}
/** items: song recordings. getDate(m) → 'YYYY-MM-DD'; valid(m) → analysis is reliable enough to compare;
 * reference(songId) → confirmed song.vocalRange or null; title(songId) → song title. */
function calculate(items,{getDate,valid,reference=()=>null,title=()=>''}={}){
 if(typeof getDate!=='function'||typeof valid!=='function')throw Error('녹음 날짜와 분석 신뢰도 함수가 필요해요.');
 const recordings=items.filter(m=>m?.songId&&dateOf(m,getDate));
 const analyzed=recordings.filter(m=>m.analysis?.metrics);
 const eligible=analyzed.filter(m=>valid(m));
 const songIds=new Set(recordings.map(m=>m.songId));
 const dates=recordings.map(m=>dateOf(m,getDate)).sort();
 const perSong=new Map();
 for(const m of analyzed){const list=perSong.get(m.songId)||[];list.push({id:m.id,a:m.analysis,date:dateOf(m,getDate),created:m.created,ok:!!valid(m)});perSong.set(m.songId,list);}
 const reports=[...perSong].map(([songId,takes])=>({songId,title:title(songId)||'',report:G.songReport(takes,{reference:reference(songId)})}));
 // Monthly trend of whole-recording values: one version only (the newest one present), so v1 and v2 never mix.
 const newest=eligible.some(m=>m.analysis.v>=2)?2:1;
 const trendTakes=eligible.filter(m=>(m.analysis.v>=2?2:1)===newest);
 const months=new Map();
 for(const m of eligible){const month=ym(dateOf(m,getDate));const rows=months.get(month)||[];rows.push(m);months.set(month,rows);}
 const metrics=G.aggregate(reports).map(agg=>{
  let trend=[];
  if(TREND.includes(agg.id)){
   const byMonth=new Map();
   for(const m of trendTakes){const month=ym(dateOf(m,getDate));const rows=byMonth.get(month)||[];rows.push(m);byMonth.set(month,rows);}
   trend=[...byMonth].sort(([a],[b])=>a.localeCompare(b)).map(([month,takes])=>{
    const means=[];
    for(const songId of new Set(takes.map(x=>x.songId))){
     const obs=takes.filter(x=>x.songId===songId).map(m=>value(m,agg.id)).filter(n=>n!=null);
     if(obs.length)means.push(avg(obs));
    }
    return {month,value:avg(means),songs:means.length};
   }).filter(x=>x.value!=null).slice(-12);
  }
  return {...agg,current:agg.latestValue,currentSongs:agg.measured,pairedSongs:agg.compared,
   improved:agg.better,worsened:agg.worse,pairs:agg.rows,trend,trendVersion:newest};
 });
 const judged=metrics.filter(m=>m.judged&&m.pairedSongs>0);
 const strong=judged.filter(m=>m.improved>m.worsened).sort((a,b)=>(b.improved-b.worsened)/b.pairedSongs-(a.improved-a.worsened)/a.pairedSongs);
 const watch=judged.filter(m=>m.worsened).sort((a,b)=>b.worsened-a.worsened);
 const recommendations=[...watch,...judged.filter(m=>!watch.includes(m)),
   ...metrics.filter(m=>m.judged&&!m.pairedSongs&&m.current!=null)].slice(0,3);
 return {recordings:recordings.length,analysisCount:eligible.length,songCount:songIds.size,
  analyzedSongs:[...perSong.keys()].filter(id=>eligible.some(m=>m.songId===id)).length,monthCount:months.size,
  firstDate:dates[0]||'',lastDate:dates.at(-1)||'',
  v1Count:analyzed.filter(m=>!(m.analysis.v>=2)).length,
  detailMissing:analyzed.filter(m=>m.analysis.v>=2&&!G.hasDetail(m.analysis)).length,
  excludedFromTrend:eligible.length-trendTakes.length,
  metrics,reports,topStrength:strong[0]||null,topWatch:watch[0]||null,
  recommendations,months:[...months.keys()].sort()};
}
return {DEFINITIONS,TREND,calculate,value};
});
