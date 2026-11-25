/* VOCAL.zip lifetime growth model — no score accuracy or health claims.
 * 성장 리포트 v2: the six separated measures of app/growth-metrics-model.js, compared per song (earliest vs latest
 * comparable take on different days, same analysis version), every song weighted equally. Never the highest note. */
(function(root,factory){
'use strict';
const node=typeof module==='object'&&module.exports;
const G=node?require('./growth-metrics-model.js'):root.VzipGrowthMetrics;
const api=factory(G,node?require('./growth-dataset.js'):root.VzipGrowthDataset);
if(typeof module==='object'&&module.exports)module.exports=api;
else root.VzipOverallGrowth=api;
})(typeof self!=='undefined'?self:globalThis,(G,D)=>{
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
/** 측정 방식: how a saved analysis was measured — as recorded, with the song's MR removed, or after AI separation. */
const methodOf=a=>a?.confidence?.aiSeparated?'aiSeparated':a?.confidence?.mrRemoved?'mrRemoved':'asRecorded';
const methodCounts=list=>{const out={asRecorded:0,mrRemoved:0,aiSeparated:0};for(const m of list)out[methodOf(m.analysis)]++;return out;};
function calculate(items,{getDate,valid,reference=()=>null,title=()=>''}={}){
 if(typeof getDate!=='function'||typeof valid!=='function')throw Error('녹음 날짜와 분석 신뢰도 함수가 필요해요.');
 const recordings=items.filter(m=>m?.songId&&dateOf(m,getDate));
 const analyzed=recordings.filter(m=>m.analysis?.metrics);
 const eligible=analyzed.filter(m=>valid(m));
 const songIds=new Set(recordings.map(m=>m.songId));
 const dates=recordings.map(m=>dateOf(m,getDate)).sort();
 const perSong=new Map();
 // The take shape comes from app/growth-dataset.js (the one place that defines it).
 for(const m of analyzed){const list=perSong.get(m.songId)||[];list.push(D.take(m,m.analysis,dateOf(m,getDate),valid(m)));perSong.set(m.songId,list);}
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
   // Each song's mean per month (cell), then — 곡 영향 빼기 (owner, 2026-11-25: "월별 성장이 노래 자체 음역에 따라 영향을
   // 많이 받네") — a month is not the plain mean of whatever songs were sung (a month of high songs reads worse): each
   // song counts as how far it was from ITS OWN usual (the mean of its months), placed on the level of those songs'
   // usual. Only songs sung in two months or more say anything about change; a month with none of them is left out.
   // With no such song at all the plain monthly mean stays (adjusted:false), as before.
   const cells=new Map();// songId → Map(month → mean)
   for(const [month,takes] of byMonth)for(const songId of new Set(takes.map(x=>x.songId))){
    const obs=takes.filter(x=>x.songId===songId).map(m=>value(m,agg.id)).filter(n=>n!=null);
    if(!obs.length)continue;
    const row=cells.get(songId)||new Map();row.set(month,avg(obs));cells.set(songId,row);
   }
   const usual=new Map([...cells].filter(([,row])=>row.size>=2).map(([songId,row])=>[songId,avg([...row.values()])]));
   const level=usual.size?avg([...usual.values()]):null;
   trend=[...byMonth.keys()].sort().map(month=>{
    if(level==null){const means=[...cells.values()].map(row=>row.get(month)).filter(n=>n!=null);return {month,value:avg(means),songs:means.length,adjusted:false};}
    const gaps=[...usual].filter(([songId])=>cells.get(songId).has(month)).map(([songId,own])=>cells.get(songId).get(month)-own);
    return {month,value:gaps.length?level+avg(gaps):null,songs:gaps.length,adjusted:true};
   }).filter(x=>x.value!=null).slice(-12);
  }
  // 파사지오: what recurs over every counted take (the latest 40), next to the per-song lines. Reference only.
  if(agg.reference)agg={...agg,recurring:G.passaggioRecurring([...perSong.values()].flat())};
  // Which measurement methods the counted takes of this measure came from (shown under 분석 방법·곡별 근거).
  const methods=agg.reference?null:methodCounts(eligible.filter(m=>value(m,agg.id)!=null));
  return {...agg,methods,current:agg.latestValue,currentSongs:agg.measured,pairedSongs:agg.compared,
   improved:agg.better,worsened:agg.worse,pairs:agg.rows,trend,trendVersion:newest};
 });
 const judged=metrics.filter(m=>m.judged&&m.pairedSongs>0);
 const strong=judged.filter(m=>m.improved>m.worsened).sort((a,b)=>(b.improved-b.worsened)/b.pairedSongs-(a.improved-a.worsened)/a.pairedSongs);
 // 우선 확인할 항목: a measure that is not improving overall. A measure that improved overall (the strength, or any
 // "좋아진 방향" card) is never also the priority item — its worse songs are named instead (watchSongs).
 const worsening=judged.filter(m=>m.worsened).sort((a,b)=>b.worsened-a.worsened);
 const watch=[...worsening.filter(m=>m.state!=='better'),...worsening.filter(m=>m.state==='better')];
 const topWatch=watch.find(m=>m.state!=='better'&&m!==strong[0])||null;
 const watchSongs=topWatch?null:worsening.map(m=>({id:m.id,title:m.title,songs:m.rows.filter(x=>x.state==='worse').map(x=>({songId:x.songId,title:x.title||''}))})).find(x=>x.songs.length)||null;
 const recommendations=[...watch,...judged.filter(m=>!watch.includes(m)),
   ...metrics.filter(m=>m.judged&&!m.pairedSongs&&m.current!=null)].slice(0,3);
 return {recordings:recordings.length,analysisCount:eligible.length,songCount:songIds.size,
  analyzedSongs:[...perSong.keys()].filter(id=>eligible.some(m=>m.songId===id)).length,monthCount:months.size,
  firstDate:dates[0]||'',lastDate:dates.at(-1)||'',
  v1Count:analyzed.filter(m=>!(m.analysis.v>=2)).length,
  detailMissing:analyzed.filter(m=>m.analysis.v>=2&&!G.hasDetail(m.analysis)).length,
  excludedFromTrend:eligible.length-trendTakes.length,methods:methodCounts(eligible),
  metrics,reports,topStrength:strong[0]||null,topWatch,watchSongs,
  recommendations,months:[...months.keys()].sort()};
}
return {DEFINITIONS,TREND,calculate,value,methodOf,methodCounts};
});
