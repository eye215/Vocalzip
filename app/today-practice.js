/* Today's practice against the day's target: one helper for home (오늘 연습), the goal time sheet and 오늘의 연습.
 * Minutes and target come from the home week model (app/student-home-model.js), so there is no second counting rule:
 * only minutes the user entered count, recording length never does. Nothing here writes data. */
(function(root,factory){
  const api=factory();
  root.VzipTodayPractice=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const node=typeof module==='object'&&module.exports;
const Home=()=>node?require('./student-home-model.js'):globalThis.VzipStudentHomeModel;
/** Minutes as the home writes them: 22분, 1시간, 1시간 5분. */
const duration=value=>{const n=Math.max(0,Math.round(Number(value)||0));return n>=60?Math.floor(n/60)+'시간'+(n%60?' '+n%60+'분':''):n+'분';};
/** {minutes, targetMinutes, percent} for one day. targetMinutes is null when that day has no target; percent then too. */
function compute(db,{date,today,defaultDailyTargetMinutes,timeEntries}={}){
  const day=Home().build(db||{},{today,weekStart:date,defaultDailyTargetMinutes,...(Array.isArray(timeEntries)?{timeEntries}:{})}).week.days.find(d=>d.date===date);
  const minutes=Number(day?.minutes)||0,targetMinutes=Number(day?.targetMinutes)>0?Number(day.targetMinutes):null;
  return {minutes,targetMinutes,percent:targetMinutes?Math.round(minutes/targetMinutes*100):null};
}
/** "오늘 22분 / 목표 30분 · 73%", or "오늘 22분 · 목표 없음" without a target. */
function text(x){
  const minutes=duration(x?.minutes),target=Number(x?.targetMinutes)>0?Number(x.targetMinutes):null;
  return target?'오늘 '+minutes+' / 목표 '+duration(target)+' · '+(x.percent??Math.round((Number(x.minutes)||0)/target*100))+'%':'오늘 '+minutes+' · 목표 없음';
}
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const shift=(date,n)=>{const [y,m,d]=String(date).split('-').map(Number),value=new Date(y,m-1,d,12);value.setDate(value.getDate()+n);return ymd(value);};
const week=(db,o,anchor)=>Home().build(db||{},{today:o.today,weekStart:anchor,defaultDailyTargetMinutes:o.defaultDailyTargetMinutes,...(Array.isArray(o.timeEntries)?{timeEntries:o.timeEntries}:{})}).week;
/** The `count` days that end at `date`, oldest first, each exactly as the home week model counts it:
 * [{date,label,minutes,targetMinutes,met,today}]. met = that day reached its own target. */
function recent(db,{date,count=7,...o}={}){
  const first=shift(date,1-count),days=[];
  for(let anchor=first,guard=0;guard<count+1;guard++){
    const w=week(db,o,anchor);
    for(const d of w.days)if(d.date>=first&&d.date<=date)days.push({date:d.date,label:d.label,minutes:Number(d.minutes)||0,targetMinutes:Number(d.targetMinutes)>0?Number(d.targetMinutes):null,met:d.timeMet===true,today:d.date===date});
    if(w.end>=date)break;
    anchor=shift(w.end,1);
  }
  return days;
}
/** Days in a row that reached their target, counted back from `date`. While `date` itself has not reached it yet the
 * run that ended the day before is returned with open:true. Same daily rule as the home week (no second counting). */
function streak(db,{date,limit=366,...o}={}){
  let days=0,open=false,cursor=date,w=null;
  for(let i=0;i<=limit;i++,cursor=shift(cursor,-1)){
    if(!w||cursor<w.start)w=week(db,o,cursor);
    if(w.days.find(d=>d.date===cursor)?.timeMet===true)days++;
    else if(i===0)open=true;
    else break;
  }
  return {days,open};
}
/** What a result says for today's numbers x (from compute) and the minutes just added (it was the result popup's,
 * removed 2026-11-26: 오늘 연습 on home always shows today against the target): where today stood
 * before (now − added, never below 0), the moment (empty · free · start · progress · almost · goal · over) with its
 * headline and hint, the streak line (only from two days) and the spoken summary. goal = this record crossed 100%. */
function moment(x,addedMinutes,run){
  const minutes=Math.max(0,Number(x?.minutes)||0),target=Number(x?.targetMinutes)>0?Number(x.targetMinutes):null;
  const added=Number(addedMinutes)>0?Number(addedMinutes):0,before=Math.max(0,minutes-added);
  const percent=target?x.percent??Math.round(minutes/target*100):null,beforePercent=target?Math.round(before/target*100):null;
  const state=!target?(minutes>0?'free':'empty'):minutes<=0?'empty':minutes>=target?(before<target?'goal':'over'):percent>=80?'almost':before<=0&&added>0?'start':'progress';
  const left=target?duration(target-minutes):'',extra=target&&minutes>target?'목표보다 '+duration(minutes-target)+' 더 했어요':'';
  const headline={empty:'아직 기록한 시간이 없어요',free:'오늘 연습을 기록했어요',start:'오늘 첫 연습이에요',progress:'잘 쌓이고 있어요',almost:'거의 다 왔어요',goal:'오늘 목표를 채웠어요',over:minutes>target?'목표보다 더 연습했어요':'오늘 목표를 채웠어요'}[state];
  const hint={empty:'연습 시간을 적으면 여기에 쌓여요',free:'',start:'목표까지 '+left+' 남았어요',progress:'목표까지 '+left+' 남았어요',almost:'목표까지 '+left+' 남았어요',goal:extra||'목표 '+duration(target)+'을 다 채웠어요',over:extra}[state];
  const n=target&&Number(run?.days)>=2?Number(run.days):0;
  const streakText=n?(run.open?'어제까지 ':'')+n+'일 연속 목표 달성':'';
  const summary='오늘 '+duration(minutes)+(target?', 목표 '+duration(target)+'의 '+percent+'%':', 목표 없음')+(streakText?'. '+streakText:'');
  return {state,headline,hint,minutes,targetMinutes:target,percent,added,before,beforePercent,met:!!target&&minutes>=target,streakText,summary};
}
const api={compute,text,duration,recent,streak,moment};
if(typeof window!=='object'||!window.VZ||typeof document==='undefined')return api;
const V=window.VZ;
/** Daily time target chosen at signup (account metadata) or later in settings; 30 minutes when neither exists. */
V.dailyTargetMinutes=()=>V.db.settings?.dailyTargetMinutes??window.vzipCloudUserDailyTarget?.()??30;
const options=date=>({date,today:V.today(),defaultDailyTargetMinutes:V.dailyTargetMinutes(),timeEntries:V.timeEntries(V.media?.cached?.()||[])});
V.todayPractice=(date=V.today())=>compute(V.db,options(date));
V.todayPracticeText=x=>text(x||V.todayPractice());
return api;
});
