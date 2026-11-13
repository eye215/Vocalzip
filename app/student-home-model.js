/* Student home: pure selectors and explicit plan mutations. No storage, DOM, media or network access. */
(function(root,factory){
  const api=factory();
  root.VzipStudentHomeModel=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const Time=typeof module==='object'&&module.exports?require('./practice-time-model.js'):globalThis.VzipPracticeTime;
const list=v=>Array.isArray(v)?v:[];
const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const labels=['일','월','화','수','목','금','토'];
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function parse(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const [y,m,d]=date.split('-').map(Number), value=new Date(0);
  value.setFullYear(y,m-1,d);value.setHours(12,0,0,0);
  return ymd(value)===date?value:null;
}
function shift(date,n){const d=parse(date);d.setDate(d.getDate()+n);return ymd(d)}
function monday(date){const d=parse(date);return shift(date,-((d.getDay()+6)%7))}
function dayDifference(a,b){
  // Rounding local-noon differences removes the DST hour; dates are never parsed as UTC strings.
  return Math.round((parse(b)-parse(a))/86400000);
}
function minutes(value){
  if(value==null||typeof value==='boolean'||(typeof value==='string'&&!value.trim()))return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
function practiceMinutes(p){return Time.actualMinutes(p)}
function unique(records){
  const out=[],index=new Map();
  for(const r of list(records)){
    if(!r||typeof r!=='object')continue;
    if(r.id==null||r.id===''){out.push(r);continue}
    const id=String(r.id);
    if(!index.has(id)){index.set(id,out.length);out.push(r)}
    else if((Number(r.updatedAt)||0)>(Number(out[index.get(id)].updatedAt)||0))out[index.get(id)]=r;
  }
  return out;
}
function practiceRoomGoal(g){return typeof g?.sourceId==='string'&&g.sourceId.startsWith('practice-room:')&&String(g.id||'').endsWith(':next')}
function goalTitle(g){return String(g.title||'').trim().replace(/\s+/g,' ')}
function visibleGoals(records){
  const result=[],byTitle=new Map();
  for(const goal of records){
    if(!practiceRoomGoal(goal)){result.push(goal);continue}
    const key=goal.date+'\0'+goalTitle(goal);
    if(!byTitle.has(key)){byTitle.set(key,result.length);result.push(goal)}
    else if(goal.completed===true)result[byTitle.get(key)].completed=true;
  }
  return result;
}
function target(plans,period,date){
  const p=plans.find(p=>p.id===period+':'+date&&p.period===period&&p.date===date);
  return p?minutes(p.targetMinutes):null;
}
function nextStage(db,today){
  const candidates=[];
  for(const p of unique(db.performances)){
    if((p.status||'preparing')!=='preparing')continue;
    const sessions=list(p.sessions).filter(s=>s&&parse(s.date)&&s.date>=today&&s.status!=='cancelled'&&s.status!=='completed'&&!s.appeared)
      .slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.time||'').localeCompare(String(b.time||'')));
    const session=sessions[0]||null;
    const date=session?.date||(parse(p.start)&&p.start>=today?p.start:'');
    if(!date)continue;
    const songTitles=list(p.songLinks).map(link=>list(db.songs).find(s=>s.id===link.songId)?.title||link.title||'').filter(Boolean);
    candidates.push({...copy(p),date,time:session?.time||'',session:copy(session),daysUntil:dayDifference(today,date),songTitles});
  }
  return candidates.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time))[0]||null;
}
function nextLesson(db,today){
  return copy(unique(db.lessons).filter(l=>(l.status||'done')==='scheduled'&&parse(l.date)&&l.date>=today)
    .sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime||'').localeCompare(String(b.startTime||'')))[0]||null);
}
function recentSong(db,practices,today){
  const ordered=practices.filter(p=>parse(p.date)&&p.date<=today&&p.songId&&p.practiceMode!=='training')
    .slice().sort((a,b)=>b.date.localeCompare(a.date)||(Number(b.created)||0)-(Number(a.created)||0));
  for(const p of ordered){const song=list(db.songs).find(s=>s&&s.id===p.songId);if(song)return {song:copy(song),practice:copy(p),date:p.date}}
  return null;
}
/** Weeks available in the calendar: real recordings/practices and non-cancelled schedules. */
function weekBounds(db={},options={}){
  const today=options.today||ymd(new Date()),current=monday(today),history=[],schedule=[];
  const add=(to,date)=>{if(parse(date))to.push(date)};
  const live=(key)=>unique(db[key]).filter(r=>!list(db.deleted?.[key]).includes(r.id));
  for(const date of list(options.mediaDates))add(history,date);
  for(const entry of list(options.timeEntries))add(history,entry.date);
  for(const p of live('practices'))add(history,p.date);
  for(const lesson of live('lessons'))if(lesson.status!=='cancelled')add(schedule,lesson.date);
  for(const show of live('performances')){
    if(show.status==='cancelled')continue;
    const sessions=list(show.sessions);
    if(sessions.length){for(const session of sessions)if(session.status!=='cancelled')add(schedule,session.date);}
    else add(schedule,show.start);
  }
  const dates=history.concat(schedule).filter(date=>date<=today).sort();
  const first=dates.length?monday(dates[0]):current;
  const future=schedule.filter(date=>date>today).sort();
  const last=future.length?monday(future[future.length-1]):current;
  return {first,last,current};
}
function build(db={},options={}){
  const today=options.today||ymd(options.now==null?new Date():new Date(options.now));
  if(!parse(today))throw Error('올바른 오늘 날짜가 필요해요.');
  const anchor=options.weekStart||today;
  if(!parse(anchor))throw Error('올바른 주간 날짜가 필요해요.');
  const start=monday(anchor),plans=unique(db.practicePlans),practices=unique(db.practices),allGoals=visibleGoals(unique(db.dailyGoals).map(copy)),totals=new Map();
  // Daily time target from onboarding/settings. Without it the model keeps the 30-minute fallback for past days only.
  const defaultDailyTarget=minutes(options.defaultDailyTargetMinutes);
  // Every view uses performed practice time; standalone recording lengths are never added.
  const entries=Array.isArray(options.timeEntries)?options.timeEntries:practices.map(p=>({date:p.date,minutes:practiceMinutes(p)}));
  for(const p of entries){if(p.kind==='recording'||!parse(p.date)||p.date>today)continue;const actual=p.ref?practiceMinutes(p.ref):minutes(p.minutes)||0;totals.set(p.date,(totals.get(p.date)||0)+actual)}
  const days=Array.from({length:7},(_,i)=>{
    const date=shift(start,i),actual=totals.get(date)||0,goal=target(plans,'day',date)??(defaultDailyTarget>0?defaultDailyTarget:date<today?30:null),ratio=goal>0?actual/goal*100:null;
    const state=date>today?'future':actual===0?'empty':!(goal>0)?'unplanned':ratio<100?'partial':ratio<=120?'met':'high';
    const dayGoals=allGoals.filter(g=>g.date===date),goalsComplete=dayGoals.length>0&&dayGoals.every(g=>g.completed===true);
    return {date,label:labels[parse(date).getDay()],minutes:actual,targetMinutes:goal,ratio,state,today:date===today,
      goalCount:dayGoals.length,goalsComplete,timeMet:goal>0&&actual>=goal};
  });
  // Where the week target comes from, so the UI can say it: 'week' = this week's own plan, 'daily' = the settings
  // daily target on all seven days, 'days' = a sum that includes day plans (or the past-day fallback), null = none.
  let targetMinutes=target(plans,'week',start),targetSource=targetMinutes!=null?'week':null;
  if(targetMinutes==null&&days.every(d=>d.targetMinutes!=null)){
    targetMinutes=days.reduce((n,d)=>n+d.targetMinutes,0);
    targetSource=defaultDailyTarget>0&&days.every(d=>target(plans,'day',d.date)==null)?'daily':'days';
  }
  const bounds=weekBounds(db,{...options,today});
  const actualMinutes=days.reduce((n,d)=>n+d.minutes,0);
  // The label belongs to the displayed week. Start at its latest practiced day,
  // then count consecutive calendar dates even when the run crosses Monday.
  let cursor=days.slice().reverse().find(d=>d.minutes>0)?.date,streak=0;
  while(cursor&&(totals.get(cursor)||0)>0){streak++;cursor=shift(cursor,-1)}
  const goals=visibleGoals(unique(db.dailyGoals).filter(g=>g.date===today).map((g,i)=>({...copy(g),_index:i})))
    .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||a._index-b._index).map(g=>{delete g._index;return g});
  const completed=goals.filter(g=>g.completed===true).length;
  const recommendationCandidates=unique(db.assignments).filter(t=>t.status!=='done'&&(!t.startDate||today>=t.startDate)&&(!t.dueDate||today<=t.dueDate))
    .map(t=>({title:String(t.title||''),source:'homework',sourceId:t.id}));
  const latestSong=recentSong(db,practices,today)?.song;
  recommendationCandidates.push({title:latestSong?latestSong.title+' 한 번 연습하기':'호흡과 발성 연습하기',source:'recommendation',sourceId:latestSong?'song:'+latestSong.id:'basic:breathing'});
  return {today,goals,goalProgress:{total:goals.length,completed,ratio:goals.length?completed/goals.length*100:null},
    week:{start,end:shift(start,6),current:start===monday(today),firstWeek:bounds.first,lastWeek:bounds.last,canPrevious:start>bounds.first,canNext:start<bounds.last,days,actualMinutes,targetMinutes,targetSource,dailyTargetMinutes:defaultDailyTarget>0?defaultDailyTarget:null,ratio:targetMinutes>0?actualMinutes/targetMinutes*100:null,streak},
    stage:nextStage(db,today),lesson:nextLesson(db,today),recent:recentSong(db,practices,today),recommendationCandidates};
}
/** Call mutations inside VZ.change. updatedAt and tombstones belong to core/data-merge. */
function setGoal(db,id,completed){
  if(typeof completed!=='boolean')throw Error('완료 상태를 확인해 주세요.');
  const goal=list(db.dailyGoals).find(g=>g&&g.id===id);
  if(!goal)return false;
  if(practiceRoomGoal(goal)){
    const title=goalTitle(goal);
    for(const same of db.dailyGoals)if(same?.date===goal.date&&practiceRoomGoal(same)&&goalTitle(same)===title)same.completed=completed;
  }else goal.completed=completed;
  return true;
}
function planMinutes(value){const n=minutes(value);if(value==null||value==='')return null;if(n==null)throw Error('목표 시간을 확인해 주세요.');return n}
// Local optimistic guard: compare only the goal editor's day/week inputs.
function planSnapshot(db,date){
  if(!parse(date))throw Error('목표 날짜를 확인해 주세요.');
  const start=monday(date),end=shift(start,6);
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
    Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const stable=rows=>rows.map(r=>JSON.stringify(canonical(r))).sort();
  return JSON.stringify({
    goals:stable(list(db.dailyGoals).filter(g=>g?.date===date)),
    plans:stable(list(db.practicePlans).filter(p=>p&&(
      p.period==='day'&&p.date>=start&&p.date<=end||p.period==='week'&&p.date===start)))
  });
}
/** 'done' for a completed goal, 'recorded' for a goal with a 수행 기록 (its record or its practice row 'goal:<id>'),
 * '' otherwise. The plan editor never drops these, so a check and its minutes are not left without their goal. */
function keptGoal(db,goal){
  if(!goal)return '';
  if(goal.completed===true)return 'done';
  return goal.performance||list(db?.practices).some(p=>p&&p.id==='goal:'+goal.id)?'recorded':'';
}
function savePlan(db,input){
  const date=input?.date;
  if(!parse(date))throw Error('목표 날짜를 확인해 주세요.');
  if(has(input,'expectedSnapshot')&&input.expectedSnapshot!==planSnapshot(db,date))throw Error('목표나 시간 설정이 변경됐어요. 입력을 확인한 뒤 창을 다시 열어 주세요.');
  let goals=list(db.dailyGoals),plans=list(db.practicePlans);
  if(has(input,'goals')){
    if(!Array.isArray(input.goals))throw Error('목표 목록을 확인해 주세요.');
    const previous=new Map(goals.filter(g=>g.date===date).map(g=>[g.id,g])),seen=new Set();
    const otherIds=new Set(goals.filter(g=>g.date!==date).map(g=>g.id));
    let nextOrder=Math.max(-1,...[...previous.values()].map(g=>Number(g.order)||0))+1;
    const next=input.goals.map(g=>{
      if(!g||typeof g.id!=='string'||!g.id||seen.has(g.id)||otherIds.has(g.id))throw Error('서로 다른 목표 ID가 필요해요.');
      seen.add(g.id);
      const old=previous.get(g.id),title=String(g.title??old?.title??'').trim(),source=g.source||old?.source||'personal';
      if(!title||!['homework','personal','recommendation'].includes(source))throw Error('목표 내용과 출처를 확인해 주세요.');
      return {...old,...(!old&&g.recommendation?{songId:String(g.songId||''),recommendation:copy(g.recommendation)}:{}),id:g.id,date,title,source,sourceId:String(g.sourceId??old?.sourceId??''),
        completed:typeof g.completed==='boolean'?g.completed:old?.completed===true,order:old?Number(old.order)||0:nextOrder++};
    });
    // Leaving a goal out removes it, except completed goals and goals with a 수행 기록: those stay as they are.
    const kept=[...previous.values()].filter(g=>!seen.has(g.id)&&keptGoal(db,g));
    goals=goals.filter(g=>g.date!==date).concat(kept,next);
  }
  for(const [key,period,planDate] of [['targetMinutes','day',date],['weekTargetMinutes','week',monday(date)]]){
    if(!has(input,key))continue;
    const id=period+':'+planDate,old=plans.find(p=>p.id===id);
    const plan={...old,id,period,date:planDate,targetMinutes:planMinutes(input[key])};
    plans=plans.filter(p=>p.id!==id).concat(plan);
  }
  // Validate the complete request before publishing either array.
  if(has(input,'goals'))db.dailyGoals=goals;
  if(has(input,'targetMinutes')||has(input,'weekTargetMinutes'))db.practicePlans=plans;
  return true;
}
return {build,weekBounds,setGoal,savePlan,planSnapshot,keptGoal};
});

