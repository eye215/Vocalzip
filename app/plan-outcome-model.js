/* Training plan outcome: deterministic and based on recorded goals and actual same-song measurements.
 * Never treats distance from nearest semitone as written-score accuracy or as a diagnosis.
 */
(function(root,factory){
'use strict';
const model=factory();
if(typeof module==='object'&&module.exports)module.exports=model;
else root.VzipPlanOutcome=model;
})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const PATHS={intonation:['intonation','meanAbsCents'],stability:['stability','wobbleCents'],
 phrase:['breath','medianPhrase'],vibrato:['vibrato','regularity']};
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
function value(media,key){
 const path=PATHS[key];if(!path)return null;
 let v=media?.analysis?.metrics;for(const p of path)v=v?.[p];
 return typeof v==='number'&&Number.isFinite(v)?v:null;
}
function avg(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function report({plan,goals=[],recordings=[],dateOf,valid,asOf}){
 if(!plan||plan.kind!=='monthly-vocal'||!PATHS[plan.metric])throw Error('올바른 연습 계획을 선택해 주세요.');
 if(typeof dateOf!=='function'||typeof valid!=='function')throw Error('녹음 날짜와 분석 신뢰도를 확인해 주세요.');
 const endDate=completeDate(plan);
 if(!endDate)throw Error('계획의 기간을 확인해 주세요.');
 if(asOf<endDate)throw Error('계획 종료 후 결과를 생성할 수 있어요.');
 const scheduled=goals.filter(g=>g?.sourceId===plan.id && g.date>=plan.startDate&&g.date<=endDate);
 // Use planned count, not rows left after cancellation or sync anomalies, as denominator.
 const days=plan.days,done=new Set(scheduled.filter(g=>g.completed===true).map(g=>g.date)).size;
 const available=recordings.filter(m=>m?.songId===plan.songId&&valid(m)&&value(m,plan.metric)!=null);
 const before=available.filter(m=>dateOf(m)&&dateOf(m)<plan.startDate).sort((a,b)=>dateOf(b).localeCompare(dateOf(a))).slice(0,5);
 const after=available.filter(m=>dateOf(m)&&dateOf(m)>=plan.startDate&&dateOf(m)<=endDate)
   .sort((a,b)=>dateOf(a).localeCompare(dateOf(b))).slice(-5);
 const b=avg(before.map(m=>value(m,plan.metric))),a=avg(after.map(m=>value(m,plan.metric)));
 const delta=b!=null&&a!=null?ROUND(a-b):null;
 // Threshold avoids falsely asserting growth from tiny numeric jitter.
 const margin=b!=null?Math.max(3,Math.abs(b)*.05):null;
 const direction=plan.metric==='intonation'||plan.metric==='stability'?-1:1;
 const change=delta==null?'insufficient':Math.abs(delta)<margin?'similar':Math.sign(delta)===direction?'better':'worse';
 return {id:'plan-outcome:'+plan.id,planId:plan.id,songId:plan.songId,metric:plan.metric,
  sourceMonth:plan.sourceMonth||'',startDate:plan.startDate,endDate,
  completedDays:Math.min(done,days),scheduledDays:days,completionRate:ROUND(Math.min(done,days)/days*100),
  measurement:{before:b==null?null:ROUND(b),after:a==null?null:ROUND(a),delta,
    change,beforeCount:before.length,afterCount:after.length,
    beforeIds:before.map(x=>x.id),afterIds:after.map(x=>x.id)},
  recommendation:change==='worse'?'repeat':change==='better'?'maintain':'collect',
  // No specific segment comparison is asserted: summary metrics cover full takes.
  scope:'whole-recording'};
}
return {report,completeDate,value};
});
