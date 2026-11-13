/* Today's practice against the day's target: one helper for home, the goal time sheet and 오늘 연습 세트.
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
const api={compute,text,duration};
if(typeof window!=='object'||!window.VZ||typeof document==='undefined')return api;
const V=window.VZ;
/** Daily time target chosen at signup (account metadata) or later in settings; 30 minutes when neither exists. */
V.dailyTargetMinutes=()=>V.db.settings?.dailyTargetMinutes??window.vzipCloudUserDailyTarget?.()??30;
V.todayPractice=(date=V.today())=>compute(V.db,{date,today:V.today(),defaultDailyTargetMinutes:V.dailyTargetMinutes(),timeEntries:V.timeEntries(V.media?.cached?.()||[])});
V.todayPracticeText=x=>text(x||V.todayPractice());
/** Small centred popup after a goal (or a practice set step) is completed: today's minutes against the target with a
 * thin bar, and "이번 기록 +N분" when time was just saved. Closes with 확인, a tap outside, Escape, or by itself after
 * about four seconds, so it never stands in the way of the next check. Returns the sheet handle ({close}). */
let open=null;
V.todayPracticePopup=({addedMinutes,title,onClose,duration:ms=4000}={})=>{
  open?.close();
  const x=V.todayPractice(),met=x.percent!=null&&x.percent>=100,added=Number(addedMinutes)>0?Number(addedMinutes):0;
  const heading=met?'오늘 목표를 채웠어요':title||'완료했어요';
  let timer=0;
  const sheet=V.sheet({title:heading,label:heading,variant:'alert',
    body:'<div class="vz-today-result"'+(met?' data-met="true"':'')+'><p class="vz-today-result-line" data-today-text>'+V.esc(text(x))+'</p>'+
      (x.targetMinutes?'<div class="vz-today-bar" role="progressbar" aria-label="오늘 목표 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,x.percent)+'"><i style="width:'+Math.min(100,x.percent)+'%"></i></div>':'')+
      (added?'<p class="vz-today-added" data-today-added>이번 기록 +'+duration(added)+'</p>':'')+'</div>',
    foot:'<button type="button" class="btn block" data-ok>확인</button>',
    onMount:(el,close)=>{
      el.classList.add('vz-today-popup');
      el.parentNode.querySelector('[data-ok]').onclick=close;
      timer=setTimeout(close,ms);
    },
    onClose:()=>{clearTimeout(timer);if(open===sheet)open=null;onClose?.();}});
  open=sheet;
  sheet.el.parentNode.querySelector('[data-ok]')?.focus({preventScroll:true});
  return sheet;
};
return api;
});
