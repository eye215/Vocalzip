/* Training plan outcome: deterministic and based on recorded goals and actual same-song measurements.
 * Never treats distance from nearest semitone as written-score accuracy or as a diagnosis.
 *
 * 성장 리포트 v2 rules (app/growth-metrics-model.js, rules:2): the plan metric is compared with the same definitions
 * and 판정 보류 rules as the growth report — the latest usable take before the plan vs the latest usable take during
 * it (same song, same analysis version, same phrases preferred). Nothing is re-implemented here: the pair and the
 * judgement come from VzipGrowthMetrics.periodReport. Old plan keys map to the growth measures:
 *   intonation → 음정 정확도, stability → 음정 안정성, phrase → 호흡 유지 (matched phrases, tempo-corrected).
 *   vibrato has no growth-report measure: the old whole-recording average is kept, shown as 참고 and never judged.
 * Reports saved before rules:2 keep every field they had and still render (plan-outcome-ui.js legacy view);
 * new reports keep all the old fields (before/after/delta/change/mixedVersions/counts/ids) and add new ones. */
(function(root,factory){
'use strict';
const growth=()=>root.VzipGrowthMetrics||(typeof module==='object'&&module.exports&&typeof require==='function'?require('./growth-metrics-model.js'):null);
const model=factory(growth);
if(typeof module==='object'&&module.exports)module.exports=model;
else root.VzipPlanOutcome=model;
})(typeof self!=='undefined'?self:globalThis,growth=>{
'use strict';
const RULES=2;
const PATHS={intonation:['intonation','meanAbsCents'],stability:['stability','wobbleCents'],
 phrase:['breath','medianPhrase'],vibrato:['vibrato','regularity']};
/** Plan key → growth-report measure id. Missing (vibrato) = reference only. */
const GROWTH={intonation:'intonation',stability:'stability',phrase:'phrase'};
const ROUND=x=>Math.round(x*10)/10;
function shift(date,n){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
 const [y,m,d]=date.split('-').map(Number);
 const at=new Date(y,m-1,d,12);if(at.getFullYear()!==y||at.getMonth()!==m-1||at.getDate()!==d)return '';
 at.setDate(at.getDate()+n);
 const pad=x=>String(x).padStart(2,'0');
 return at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate());
}
function completeDate(plan){
 return plan?.startDate&&Number.isInteger(plan.days)&&plan.days>=1&&plan.days<=365
  ?shift(plan.startDate,plan.days-1):'';
}
function raw(analysis,key){
 const path=PATHS[key];if(!path)return null;
 let v=analysis?.metrics;for(const p of path)v=v?.[p];
 return typeof v==='number'&&Number.isFinite(v)?v:null;
}
/** Whole-recording value of one take (kept for callers of the old API). */
function value(media,key){return raw(media?.analysis,key);}
const avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
/** Legacy `change` for clients that predate rules:2: anything not judged reads as 'insufficient'. */
const legacyChange=state=>['better','worse','similar'].includes(state)?state:'insufficient';
/** Vibrato: no growth measure. Old averaging (≤ 5 reliable takes per side), shown as 참고 only. */
function vibratoReference(before,during){
 const pick=list=>list.filter(t=>t.ok&&raw(t.a,'vibrato')!=null).sort((x,y)=>y.date.localeCompare(x.date)||(Number(y.created)||0)-(Number(x.created)||0)||String(y.id).localeCompare(String(x.id))).slice(0,5);
 const b=pick(before),d=pick(during);
 const why=list=>list.some(t=>!t.ok&&raw(t.a,'vibrato')!=null)?'confidence':'no-data';
 let reason='';
 if(!before.length||!during.length)reason='no-pair';
 else if(!b.length)reason=why(before);
 else if(!d.length)reason=why(during);
 else if(new Set([...b,...d].map(t=>t.a?.v??null)).size>1)reason='version-mixed';
 if(reason)return {state:'hold',reason};
 const r2=x=>Math.round(x*100)/100,x=r2(avg(b.map(t=>raw(t.a,'vibrato')))),y=r2(avg(d.map(t=>raw(t.a,'vibrato'))));
 return {state:'reference',basis:'average',before:x,after:y,delta:r2(y-x),beforeIds:b.map(t=>t.id),afterIds:d.map(t=>t.id),
  beforeDate:b[0].date,afterDate:d[0].date};
}
/** Preview and archived reports use the exact same rules and takes: same song, before the plan vs during it. */
function measurement(plan,recordings=[],dateOf,valid){
 if(!plan||!PATHS[plan.metric]||typeof dateOf!=='function'||typeof valid!=='function')
  throw Error('분석 비교 입력을 확인해 주세요.');
 const endDate=completeDate(plan);
 if(!endDate)throw Error('연습 계획 날짜를 확인해 주세요.');
 const G=growth();
 if(!G&&GROWTH[plan.metric])throw Error('성장 지표 기준을 불러오지 못했어요.');
 const takes=recordings.filter(m=>m?.songId===plan.songId&&m.analysis?.metrics)
  .map(m=>({id:m.id,a:m.analysis,date:String(dateOf(m)||'').slice(0,10),created:m.created,ok:!!valid(m)}))
  .filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date));
 const before=takes.filter(t=>t.date<plan.startDate),during=takes.filter(t=>t.date>=plan.startDate&&t.date<=endDate);
 const id=GROWTH[plan.metric]||'';
 let x;
 if(!id)x=vibratoReference(before,during);
 else if(!before.length||!during.length)x={state:'hold',reason:'no-pair'};
 else{
  const c=G.periodReport(before,during)[id]||{state:'hold',reason:'no-pair'};
  x=c.state==='hold'?{state:'hold',reason:c.reason||'no-data'}:
   {state:c.state,basis:c.basis||'',matched:c.matched??null,tempo:c.tempo??null,before:c.before,after:c.after,delta:c.delta,
    beforeIds:[c.firstId],afterIds:[c.lastId],beforeDate:c.from||'',afterDate:c.to||''};
 }
 const held=x.state==='hold';
 return {rules:RULES,growthMetric:id,state:x.state,reason:held?x.reason:'',basis:x.basis||'',
  matched:x.matched??null,tempo:x.tempo??null,beforeDate:x.beforeDate||'',afterDate:x.afterDate||'',
  before:held?null:x.before,after:held?null:x.after,delta:held?null:x.delta,
  change:legacyChange(x.state),mixedVersions:x.reason==='version-mixed',
  // Analysed same-song takes in each window; the ids are only the takes actually compared.
  beforeCount:before.length,afterCount:during.length,beforeIds:held?[]:x.beforeIds,afterIds:held?[]:x.afterIds};
}
/** repeat / maintain / collect as before; held → always collect (more data); 참고 (not judged) → listen. */
function recommendation(state){
 return state==='worse'?'repeat':state==='better'?'maintain':state==='reference'||state==='mixed'?'listen':'collect';
}
function report({plan,goals=[],recordings=[],dateOf,valid,asOf}){
 if(!plan||plan.kind!=='monthly-vocal'||!PATHS[plan.metric])throw Error('올바른 연습 계획을 선택해 주세요.');
 if(typeof dateOf!=='function'||typeof valid!=='function')throw Error('녹음 날짜와 분석 신뢰도를 확인해 주세요.');
 const endDate=completeDate(plan);
 if(!endDate)throw Error('계획의 기간을 확인해 주세요.');
 if(asOf<endDate)throw Error('계획 종료 후 결과를 생성할 수 있어요.');
 const scheduled=goals.filter(g=>g?.sourceId===plan.id && g.date>=plan.startDate&&g.date<=endDate);
 // Use planned count, not rows left after cancellation or sync anomalies, as denominator.
 const days=plan.days,done=new Set(scheduled.filter(g=>g.completed===true).map(g=>g.date)).size;
 const snapshot=measurement(plan,recordings,dateOf,valid);
 return {id:'plan-outcome:'+plan.id,planId:plan.id,songId:plan.songId,metric:plan.metric,rules:RULES,
  sourceMonth:plan.sourceMonth||'',startDate:plan.startDate,endDate,
  completedDays:Math.min(done,days),scheduledDays:days,completionRate:ROUND(Math.min(done,days)/days*100),
  measurement:snapshot,
  recommendation:recommendation(snapshot.state),
  // Summary metrics cover takes, not the plan segment: same phrases when they matched, else the whole recording.
  scope:snapshot.basis==='phrases'?'same-phrases':'whole-recording'};
}
/** A report saved before rules:2 (whole-recording averages, old wording). */
const isLegacy=r=>!(r?.rules>=2&&r.measurement?.state);
return {RULES,GROWTH,report,measurement,completeDate,value,recommendation,isLegacy};
});
