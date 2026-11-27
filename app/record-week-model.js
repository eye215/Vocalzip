/* 기록 탭 (rec1, 2026-11-27): the week strip, the day's title and its one gray summary line. Pure functions: no DOM,
 * no storage, nothing written. Weeks run Sunday–Saturday like the month grid; a week is named after the month of its
 * Wednesday ("11월 첫째 주" = the first week whose Wednesday is in November). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipRecordWeek=api;})(globalThis,()=>{
'use strict';
const DOW='일월화수목금토',ORDINAL=['첫째','둘째','셋째','넷째','다섯째'];
const pad=n=>String(n).padStart(2,'0'),ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
function parse(key){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key||''));if(!m)return null;
 const d=new Date(+m[1],+m[2]-1,+m[3]);return d.getMonth()===+m[2]-1?d:null;
}
const addDays=(key,n)=>{const d=parse(key);d.setDate(d.getDate()+n);return ymd(d);};
const weekStart=key=>addDays(key,-parse(key).getDay());
const weekDays=key=>{const start=weekStart(key);return Array.from({length:7},(_,i)=>addDays(start,i));};
const yearPrefix=(d,thisYear)=>thisYear&&d.getFullYear()!==thisYear?d.getFullYear()+'년 ':'';
/** "11월 첫째 주" (with the year when it is not this year). */
function weekLabel(key,thisYear){
 const mid=parse(addDays(weekStart(key),3));
 return yearPrefix(mid,thisYear)+(mid.getMonth()+1)+'월 '+ORDINAL[Math.ceil(mid.getDate()/7)-1]+' 주';
}
/** "11월 4일 수요일". */
function dayTitle(key,thisYear){
 const d=parse(key);if(!d)return '';
 return yearPrefix(d,thisYear)+(d.getMonth()+1)+'월 '+d.getDate()+'일 '+DOW[d.getDay()]+'요일';
}
/** ‹ › in the week strip: the same weekday a week away, or today when that week holds today. */
function moveWeek(day,step,today){
 const next=addDays(day,7*step);
 return weekDays(next).includes(today)?today:next;
}
/** ‹ › in the month grid (unchanged rule): today in this month, else the 1st. */
function moveMonth(month,step,today){
 const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+step,1),next=ymd(d).slice(0,7);
 return {month:next,day:next===today.slice(0,7)?today:next+'-01'};
}
/** Share of the day's practice target, 0–1, for the ring around a day. */
function ring(minutes,target){
 const n=Number(minutes)>0?Number(minutes):0;
 if(!(Number(target)>0))return n>0?1:0;
 return Math.min(1,n/Number(target));
}
/** A lesson's length from its times ("18:30"–"19:30" → 60); 0 when unknown (billing's 00:00 placeholder too). */
function lessonMinutes(lesson){
 const t=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||''));return m?+m[1]*60+ +m[2]:null;};
 if(lesson?.importedFrom==='billing'&&lesson.startTime==='00:00')return 0;
 const a=t(lesson?.startTime),b=t(lesson?.endTime);
 return a!=null&&b!=null&&b>a?b-a:0;
}
/** 30초 · 7분 · 1시간 · 1시간 5분 (the same words as the month summary). */
function duration(value){
 const n=Number(value)>0?Number(value):0,seconds=Math.round(n*60),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
 return hours?hours+'시간'+(minutes?' '+minutes+'분':''):minutes?minutes+'분':seconds?seconds+'초':'0분';
}
/** The gray line under the day's title: "레슨 1 · 보이스 체크 완료 · 연습 22분 · 녹음 2". */
function summary({lessons=0,stages=0,voiceCheck=false,practices=0,practiceMinutes=0,recordings=0}={}){
 return [lessons?'레슨 '+lessons:'',stages?'무대 '+stages:'',voiceCheck?'보이스 체크 완료':'',
  practices?'연습 '+(practiceMinutes>0?duration(practiceMinutes):practices+'개'):'',recordings?'녹음 '+recordings:''].filter(Boolean).join(' · ');
}
return {parse,ymd,addDays,weekStart,weekDays,weekLabel,dayTitle,moveWeek,moveMonth,ring,lessonMinutes,duration,summary};
});
