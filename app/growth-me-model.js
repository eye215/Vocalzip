/* 성장 › 나 — "am I getting better, and what next", in one glance (성장 v2, .kiro/specs/growth-v2 R2). Pure: no DOM,
 * storage or network; also loaded by Node tests. It only arranges what the existing models already work out:
 *   lv(db, today)            the 큰 단계 card: level, name, % to the next, points today   (app/levels-model.js level)
 *   tiles(db, today)         the eight 기본기 areas: step n/5 · 기준 맞추는 중 · 아직, 유지 중, and the values of the
 *                            last measured days for a tiny line (one value a day, the day's last)  (levels skills · measurements)
 *   changeLine(changes, kind) ONE sentence of what changed in the period, from 무엇이 달라졌나
 *                            (app/growth-changes-model.js build with a period): the latest song pair with a change that is
 *                            not "비슷해요", else a listening verdict, else the 음역 line; null when nothing is comparable
 * The period overview of 나 (성장 새 디자인, 2026-11-27) — spans are {from, to, today} ('YYYY-MM-DD', resolved by the screen):
 *   practice(db, span, prev)  연습량: the entered minutes a day (직접 적은 시간, app/practice-time-model.js), a running
 *                            average over the elapsed days for the small line, against the previous span's average
 *   condition(db, media, span) 목 상태: one dot a day (the 보이스 체크 self-rating 1–5 of that day, or checked without a
 *                            rating), the average rating and its word
 *   mix(db, takes, span)     이 달 연습 구성: 곡 (entered minutes, not 트레이닝) · 기본기 (entered 트레이닝 minutes) · 녹음 (the
 *                            length of the span's recordings) — each said as what it is
 *   oneLine({better, worse, practice, kind, fallback}) 이 달 한마디: one or two short sentences from the measures that
 *                            changed and the practice change; the fallback (달라진 한 줄) when nothing moved
 *   stats(values, direction) 처음 · 평균 · 최고 (the best in the measure's own direction) · 개수
 * Numbers are observations, never a verdict on the voice. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(()=>node?require('./levels-model.js'):root.VzipLevels,()=>node?require('./practice-time-model.js'):root.VzipPracticeTime);
  if(node)module.exports=api;else root.VzipGrowthMe=api;
})(typeof self!=='undefined'?self:globalThis,(levels,time)=>{
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
/* ---------- the period overview ---------- */
const isDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d);
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
/** Every day from..to (inclusive), at most 400. */
function daysOf(from,to){const out=[];if(!isDay(from)||!isDay(to))return out;for(let d=from;d<=to&&out.length<400;d=shift(d,1))out.push(d);return out;}
const live=(db,key)=>{const gone=new Set(list(db?.deleted?.[key]).map(String));return list(db?.[key]).filter(x=>x&&typeof x==='object'&&!gone.has(String(x.id)));};
const entries=db=>{const T=time();return T?T.entries(T.records(live(db,'practices'))).filter(e=>isDay(e.date)):[];};
/** The elapsed part of a span: from..min(to, today); '' bounds are not allowed here (the screen resolves 전체). */
const elapsed=({from,to,today})=>daysOf(from,to&&to<today?to:today);
function practice(db={},span={},prev=null){
  const days=elapsed(span),rows=entries(db),byDay=new Map();
  for(const e of rows)byDay.set(e.date,(byDay.get(e.date)||0)+e.minutes);
  let sum=0;const line=days.map((d,i)=>{sum+=byDay.get(d)||0;return {date:d,minutes:byDay.get(d)||0,avg:sum/(i+1)};});
  const total=sum,avg=days.length?total/days.length:0,practised=days.filter(d=>(byDay.get(d)||0)>0).length;
  let before=null;
  if(prev&&isDay(prev.from)&&isDay(prev.to)){const pd=daysOf(prev.from,prev.to);const t=pd.reduce((n,d)=>n+(byDay.get(d)||0),0);before={total:t,avg:pd.length?t/pd.length:0};}
  const delta=before?Math.round(avg)-Math.round(before.avg):null;
  return {days:days.length,practised,total,avg,line,before,delta,trend:delta==null?null:delta>0?'up':delta<0?'down':'same'};
}
const RATINGS=['많이 지침','조금 불편','보통','좋음','아주 좋음'];
/** media: [{date, voiceCheck}] — the recordings of 매일 보이스 체크 count as a checked day too. */
function condition(db={},media=[],span={}){
  const days=elapsed(span),inSpan=new Set(days),rated=new Map(),checked=new Set();
  const checks=live(db,'practices').filter(p=>p.voiceCheck&&typeof p.voiceCheck==='object'&&inSpan.has(String(p.date||'').slice(0,10)))
    .sort((a,b)=>(Number(a.created)||0)-(Number(b.created)||0));
  for(const p of checks){const d=String(p.date).slice(0,10);checked.add(d);const r=p.voiceCheck.selfRating;if(Number.isInteger(r)&&r>=1&&r<=5)rated.set(d,r);}
  for(const m of list(media))if(m?.voiceCheck&&inSpan.has(m.date))checked.add(m.date);
  const values=[...rated.values()],avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  return {dots:days.map(d=>({date:d,rating:rated.get(d)??null,checked:checked.has(d)})),avg,rated:values.length,checkedDays:checked.size,
    word:avg==null?'':RATINGS[Math.min(5,Math.max(1,Math.round(avg)))-1]};
}
/** takes: [{date, seconds}] — the span's recordings (the screen leaves the deleted ones out). */
function mix(db={},takes=[],span={}){
  const days=new Set(elapsed(span));let song=0,basic=0,rec=0;
  for(const e of entries(db))if(days.has(e.date)){if(e.training)basic+=e.minutes;else song+=e.minutes;}
  for(const t of list(takes))if(days.has(t?.date)&&Number.isFinite(Number(t.seconds))&&Number(t.seconds)>0)rec+=Number(t.seconds)/60;
  return {song,basic,rec,total:song+basic+rec};
}
/** 이/가 · 은/는 after a word: the first form after a final consonant. */
function josa(word,withFinal,without){const c=String(word||'').trim().slice(-1).charCodeAt(0);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?withFinal:without;}
const LAST={week:'지난주',month:'지난달',all:''};
function oneLine({better=[],worse=[],practice:p=null,kind='month',fallback=''}={}){
  const b=list(better).slice(0,2),w=list(worse).slice(0,1),names=b.join('·'),last=b.at(-1)||'';
  let first='';
  if(b.length&&p==='up')first=names+josa(last,'이','가')+' 좋아지고 연습도 늘었어요.';
  else if(b.length)first=names+josa(last,'이','가')+' 좋아졌어요.'+(p==='down'?' 연습은 줄었어요.':'');
  else if(p==='up')first=(LAST[kind]?LAST[kind]+'보다 ':'')+'연습이 늘었어요.';
  else if(p==='down')first=(LAST[kind]?LAST[kind]+'보다 ':'')+'연습이 줄었어요.';
  const second=w.length?w[0]+josa(w[0],'은','는')+' 다시 살펴봐요.':'';
  const text=[first,second].filter(Boolean).join(' ');
  if(text&&(b.length||w.length||!fallback))return text;
  if(fallback)return text?fallback+' '+text:fallback;
  return p==='same'?'연습량은 '+(LAST[kind]?LAST[kind]+josa(LAST[kind],'과','와'):'전과')+' 비슷해요.':'아직 견줄 녹음이 부족해요. 같은 곡을 다시 녹음하면 달라진 점을 알려 드려요.';
}
/** values: numbers in time order; direction −1 = smaller is better (cent), 1 = larger, 0 = neither (best = highest). */
function stats(values,direction=1){
  const v=list(values).filter(Number.isFinite);
  if(!v.length)return {count:0,first:null,avg:null,best:null,last:null};
  return {count:v.length,first:v[0],last:v.at(-1),avg:v.reduce((a,b)=>a+b,0)/v.length,best:direction===-1?Math.min(...v):Math.max(...v)};
}
return {SPARK,AGAINST,RATINGS,lv,tiles,spark,changeLine,daysOf,practice,condition,mix,josa,oneLine,stats};
});
