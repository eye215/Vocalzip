/* VOCAL.zip lifetime growth model — no score accuracy or health claims.
 * Same-song, distinct-day earliest/latest take pairs have equal song weights. */
(function(root,factory){
'use strict';
const api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
else root.VzipOverallGrowth=api;
})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const DEFINITIONS=[
 {id:'intonation',title:'음정 오차',path:['intonation','meanAbsCents'],unit:'cent',direction:-1,floor:3,
  hint:'낮을수록 가까운 반음과의 음높이 편차가 작아요. 악보 정답률은 아니에요.',
  practice:'기준음 듣기 → 편안한 음역의 짧은 구간 따라 부르기',minutes:10},
 {id:'stability',title:'지속음 흔들림',path:['stability','wobbleCents'],unit:'cent',direction:-1,floor:3,
  hint:'낮을수록 지속음의 흔들림이 작아요. 울림이나 성대 상태를 진단하지 않아요.',
  practice:'편한 음에서 5초 유지하고 같은 조건으로 다시 녹음하기',minutes:8},
 {id:'phrase',title:'프레이즈 길이',path:['breath','medianPhrase'],unit:'초',direction:1,floor:0.3,
  hint:'길수록 이어 부르는 시간이 길어요. 길이가 호흡 지지의 우수함을 증명하진 않아요.',
  practice:'무리하지 않고 한 문장을 자연스럽게 연결해 부르기',minutes:8},
 {id:'vibrato',title:'비브라토 규칙성',path:['vibrato','regularity'],unit:'%',direction:1,floor:0.05,
  hint:'높을수록 분석된 진동의 규칙성이 커요. 소리의 아름다움이나 적합성 점수는 아니에요.',
  practice:'가볍게 지속음을 녹음하고 자연스러운 진동만 관찰하기',minutes:5}
];
const avg=ns=>ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;
const ym=s=>/^\d{4}-\d{2}/.test(String(s||''))?String(s).slice(0,7):'';
function value(m,d){
 let v=m?.analysis?.metrics;
 for(const key of d.path)v=v?.[key];
 return typeof v==='number'&&Number.isFinite(v)?v:null;
}
function dateOf(m,getDate){
 const s=String(getDate(m)||'');
 return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';
}
function calculate(items,{getDate,valid}={}){
 if(typeof getDate!=='function'||typeof valid!=='function')throw Error('녹음 날짜와 분석 신뢰도 함수가 필요해요.');
 const recordings=items.filter(m=>m?.songId&&dateOf(m,getDate));
 const eligible=recordings.filter(m=>valid(m));
 const songIds=new Set(recordings.map(m=>m.songId));
 const dates=recordings.map(m=>dateOf(m,getDate)).sort();
 const months=new Map();
 for(const m of eligible){
  const month=ym(dateOf(m,getDate));const rows=months.get(month)||[];rows.push(m);months.set(month,rows);
 }
 const perSong=new Map();
 for(const m of eligible){const list=perSong.get(m.songId)||[];list.push(m);perSong.set(m.songId,list);}
 for(const takes of perSong.values())takes.sort((a,b)=>dateOf(a,getDate).localeCompare(dateOf(b,getDate))||
   String(a.id||'').localeCompare(String(b.id||'')));
 const metrics=DEFINITIONS.map(d=>{
  const latest=[],pairs=[];
  for(const [songId,takes] of perSong){
   const withValue=takes.filter(m=>value(m,d)!=null);
   if(!withValue.length)continue;
   const last=withValue.at(-1);latest.push(value(last,d));
   const first=withValue[0];
   if(dateOf(first,getDate)===dateOf(last,getDate))continue;
   const before=value(first,d),after=value(last,d),delta=after-before;
   const threshold=Math.max(d.floor,Math.abs(before)*0.05);
   const state=Math.abs(delta)<threshold?'similar':Math.sign(delta)===d.direction?'better':'worse';
   pairs.push({songId,before,after,delta,state,from:dateOf(first,getDate),to:dateOf(last,getDate)});
  }
  const before=avg(pairs.map(x=>x.before)),after=avg(pairs.map(x=>x.after));
  const delta=before==null?null:after-before;
  const improved=pairs.filter(x=>x.state==='better').length;
  const worsened=pairs.filter(x=>x.state==='worse').length;
  const similar=pairs.filter(x=>x.state==='similar').length;
  const trend=months.size? [...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,takes])=>{
   const means=[];
   for(const songId of new Set(takes.map(x=>x.songId))){
    const observations=takes.filter(x=>x.songId===songId).map(m=>value(m,d)).filter(n=>n!=null);
    if(observations.length)means.push(avg(observations));
   }
   return {month,value:avg(means),songs:means.length};
  }).filter(x=>x.value!=null).slice(-12):[];
  return {...d,current:avg(latest),currentSongs:latest.length,
   before,after,delta,
   pairedSongs:pairs.length,improved,worsened,similar,pairs,trend};
 });
 const strong=metrics.filter(m=>m.pairedSongs>0).sort((a,b)=>
  (b.improved-b.worsened)/b.pairedSongs-(a.improved-a.worsened)/a.pairedSongs);
 const watch=[...metrics].filter(m=>m.pairedSongs&&m.worsened).sort((a,b)=>b.worsened-a.worsened);
 const recommendations=[...watch,...metrics.filter(m=>m.pairedSongs&&!watch.includes(m)),
   ...metrics.filter(m=>!m.pairedSongs&&m.current!=null)].slice(0,3);
 return {recordings:recordings.length,analysisCount:eligible.length,songCount:songIds.size,
  analyzedSongs:perSong.size,monthCount:months.size,firstDate:dates[0]||'',lastDate:dates.at(-1)||'',
  metrics,topStrength:strong.find(x=>x.improved>x.worsened)||null,topWatch:watch[0]||null,
  recommendations,months:[...months.keys()].sort()};
}
return {DEFINITIONS,calculate,value};
});
