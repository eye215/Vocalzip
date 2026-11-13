/* VOCAL.zip 주간 요약 — pure week model (Monday–Sunday, Korea time). Read-only: never changes db or media.
 * Practice time is the performed time of practice records only (app/practice-time-model.js): recording length is
 * never added, and a record saved twice (same id) counts once. Growth uses app/growth-metrics-model.js periodReport
 * (this week's takes vs earlier takes of the same song); the highest note (range) and passaggio are never judged.
 * Optional sections (매일 보이스 체크, 오늘 연습 세트) appear only when their data exists. */
(function(root,factory){
 const node=typeof module==='object'&&module.exports;
 const api=factory(node?require('./practice-time-model.js'):root.VzipPracticeTime,
  node?require('./growth-metrics-model.js'):root.VzipGrowthMetrics,
  node?require('./goal-routines.js'):root.VzipGoalRoutines);
 if(node)module.exports=api;else root.VzipWeeklySummary=api;
})(globalThis,(Time,G,R)=>{
'use strict';
const DAY=86400000,KST=9*3600000;
const list=v=>Array.isArray(v)?v:[];
const isDate=s=>{
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s;
};
/** Calendar day in Korea (UTC+9, no DST) of a millisecond timestamp. */
const kstDate=ms=>{const n=Number(ms);return ms!=null&&ms!==''&&Number.isFinite(n)&&n>0?new Date(n+KST).toISOString().slice(0,10):'';};
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const monday=d=>shift(d,-((new Date(Date.parse(d+'T00:00:00Z')).getUTCDay()+6)%7));
/** A recording's day: its explicit recorded date wins, otherwise its creation time in Korea. */
const mediaDate=m=>isDate(m?.recordedDate)?m.recordedDate:kstDate(m?.created);
const live=(db,key)=>{const gone=new Set(list(db?.deleted?.[key]));return Time.records(db?.[key]).filter(r=>!gone.has(r.id));};
const text=v=>String(v??'').replace(/\s+/g,' ').trim();
const snippet=(v,n=80)=>{const t=text(v);return t.length>n?t.slice(0,n-1)+'…':t;};
const minutesLabel=min=>{min=Math.round(Number(min)||0);return min>=60?Math.floor(min/60)+'시간'+(min%60?' '+min%60+'분':''):min+'분';};
const signed=n=>(n>0?'+':n<0?'−':'±')+minutesLabel(Math.abs(n));
const CATEGORIES=[['song','곡'],['lesson','레슨'],['training','트레이닝'],['room','연습실']];
const JUDGED=['intonation','stability','phrase','high']; // never range (highest note) or passaggio
const COMPARED=['better','worse','similar','mixed'];
const roomGoal=g=>typeof g?.sourceId==='string'&&g.sourceId.startsWith('practice-room:')&&String(g.id||'').endsWith(':next');
/** The home shows one row for repeated practice-room "next" goals of a day; count them the same way. */
function visibleGoals(goals){
 const out=[],seen=new Map();
 for(const g of goals){
  if(!roomGoal(g)){out.push({...g});continue;}
  const key=g.date+'\0'+text(g.title);
  if(!seen.has(key)){seen.set(key,out.length);out.push({...g});}
  else if(g.completed===true)out[seen.get(key)].completed=true;
 }
 return out;
}
const practiceSetKey=p=>{
 const s=p?.practiceSet;
 if(s&&typeof s==='object')return String(s.sessionId||s.id||p.practiceSetId||p.practiceSetSession||p.id);
 if(s===true||p?.practiceSetId||p?.practiceSetSession||p?.source==='practice-set'||p?.session?.kind==='practice-set')
  return String(p.practiceSetId||p.practiceSetSession||p.session?.id||p.id);
 return '';
};
function bounds(db,media,today){
 const dates=[];
 for(const p of live(db,'practices'))if(isDate(p.date))dates.push(p.date);
 for(const l of live(db,'lessons'))if(isDate(l.date)&&l.status!=='cancelled')dates.push(l.date);
 for(const g of live(db,'dailyGoals'))if(isDate(g.date))dates.push(g.date);
 const gone=new Set(list(db?.deleted?.media));
 for(const m of list(media))if(m&&!gone.has(m.id)){const d=mediaDate(m);if(d)dates.push(d);}
 const past=dates.filter(d=>d<=today).sort(),current=monday(today);
 return {first:past.length?monday(past[0]):current,last:current};
}
/**
 * db: the app data (V.db). media: plain recordings {id, recordedDate, created, category, songId, songTake, analysis,
 * ok, voiceCheck}. options: today|now, weekStart, growth:false (skip the per-song comparison), voiceCheckLines(items)
 * (optional, tolerant).
 */
function build(db={},media=[],options={}){
 const today=isDate(options.today)?options.today:kstDate(options.now??Date.now());
 const range=bounds(db,media,today);
 let start=monday(isDate(options.weekStart)?options.weekStart:today);
 if(start>range.last)start=range.last;
 const end=shift(start,6),prevStart=shift(start,-7),prevEnd=shift(start,-1);
 const inWeek=d=>isDate(d)&&d>=start&&d<=end;
 const songs=live(db,'songs'),songTitle=id=>songs.find(s=>s.id===id)?.title||'';

 /* 연습: performed minutes only */
 const practices=live(db,'practices');
 const entries=Time.entries(practices).filter(e=>isDate(e.date)&&e.date<=today);
 const totals=new Map();for(const e of entries)totals.set(e.date,(totals.get(e.date)||0)+e.minutes);
 const sumRange=(a,b)=>entries.filter(e=>e.date>=a&&e.date<=b).reduce((n,e)=>n+e.minutes,0);
 const days=Array.from({length:7},(_,i)=>{const date=shift(start,i);return {date,minutes:totals.get(date)||0,future:date>today,today:date===today};});
 const minutes=days.reduce((n,d)=>n+d.minutes,0),practisedDays=days.filter(d=>d.minutes>0).length;
 const prevMinutes=sumRange(prevStart,prevEnd),prevDays=new Set(entries.filter(e=>e.date>=prevStart&&e.date<=prevEnd).map(e=>e.date)).size;
 let cursor=days.slice().reverse().find(d=>d.minutes>0)?.date,streak=0;
 while(cursor&&(totals.get(cursor)||0)>0){streak++;cursor=shift(cursor,-1);}
 const plans=live(db,'practicePlans'),plan=(period,date)=>Time.number(plans.find(p=>p.id===period+':'+date&&p.period===period&&p.date===date)?.targetMinutes);
 let target=plan('week',start);
 if(target==null){const daily=days.map(d=>plan('day',d.date));if(daily.every(v=>v!=null))target=daily.reduce((a,b)=>a+b,0);}
 const bySong=new Map();
 for(const e of entries.filter(e=>inWeek(e.date))){
  const key=e.training?'training:':'song:'+(e.songId||'');
  const row=bySong.get(key)||{songId:e.training?'':e.songId||'',training:e.training,minutes:0,sessions:0};
  row.minutes+=e.minutes;row.sessions++;bySong.set(key,row);
 }
 const topSongs=[...bySong.values()].sort((a,b)=>b.minutes-a.minutes||b.sessions-a.sessions||String(a.songId).localeCompare(String(b.songId))).slice(0,3)
  .map(r=>({...r,title:r.training?'보컬 트레이닝':r.songId?songTitle(r.songId)||'삭제된 곡':'곡 미지정'}));
 const practice={minutes,days:practisedDays,streak,daysList:days,previous:{minutes:prevMinutes,days:prevDays},
  delta:minutes-prevMinutes,target,ratio:target>0?Math.round(minutes/target*100):null,topSongs};

 /* 목표 */
 const goals=visibleGoals(live(db,'dailyGoals').filter(g=>inWeek(g.date)));
 const routineViews=new Map((R?.routines?.(db)||[]).map(r=>[r.id,r]));
 const routineOf=g=>R?.routineOf?R.routineOf(g):g?.routineId||'';
 const byRoutine=new Map();
 for(const g of goals){const id=routineOf(g);if(!id)continue;const row=byRoutine.get(id)||{id,title:text(routineViews.get(id)?.title||g.title),done:0,total:0};row.total++;if(g.completed===true)row.done++;byRoutine.set(id,row);}
 const assignments=live(db,'assignments');
 const hwPractices=practices.filter(p=>inWeek(p.date)&&Array.isArray(p.completed)&&p.completed.length);
 const hwTasks=new Map();
 for(const p of hwPractices)for(const id of new Set(p.completed)){
  const row=hwTasks.get(id)||{id,title:text(assignments.find(a=>a.id===id)?.title)||'삭제된 숙제',sessions:0,reps:0};
  row.sessions++;row.reps+=Time.homeworkRepetitions(p,id);hwTasks.set(id,row);
 }
 const goalSummary={done:goals.filter(g=>g.completed===true).length,total:goals.length,
  routines:[...byRoutine.values()].sort((a,b)=>b.total-a.total||a.title.localeCompare(b.title)),
  homework:{sessions:hwPractices.length,tasks:[...hwTasks.values()].sort((a,b)=>b.sessions-a.sessions||a.title.localeCompare(b.title))}};

 /* 녹음 */
 const goneMedia=new Set(list(db?.deleted?.media));
 const items=list(media).filter(m=>m&&m.id!=null&&!goneMedia.has(m.id)).map(m=>({...m,date:mediaDate(m)}));
 const weekItems=items.filter(m=>inWeek(m.date));
 const byCategory=Object.fromEntries(CATEGORIES.map(([k])=>[k,0]));
 for(const m of weekItems)byCategory[CATEGORIES.some(([k])=>k===m.category)?m.category:'song']++;
 const recordings={total:weekItems.length,byCategory,
  // Recordings made this week that have an analysis. The analysis time (analysis.at) is not used: the server
  // re-analyses older recordings in bulk, and those are not this week's work.
  analyses:weekItems.filter(m=>m.analysis&&(m.analysis.v||m.analysis.metrics)).length,
  newSongs:songs.filter(s=>inWeek(kstDate(s.created))).map(s=>({id:s.id,title:text(s.title)}))};

 /* 성장: this week's takes of a song vs its earlier takes; at most 3 songs */
 const reference=id=>{const r=songs.find(s=>s.id===id)?.vocalRange;return r&&Number.isFinite(r.highMidi)?r:null;};
 const takes=items.filter(m=>m.songTake&&m.songId&&m.analysis?.metrics&&isDate(m.date));
 const takeOf=m=>({id:m.id,a:m.analysis,date:m.date,ok:!!m.ok});
 const growthSongs=[...new Set(takes.filter(m=>inWeek(m.date)).map(m=>m.songId))];
 const reports=G&&options.growth!==false?growthSongs.map(songId=>{
  const before=takes.filter(t=>t.songId===songId&&t.date<start).map(takeOf),after=takes.filter(t=>t.songId===songId&&inWeek(t.date)).map(takeOf);
  const title=songTitle(songId)||'삭제된 곡';
  if(!before.length)return {songId,title,rank:0,lines:[],hold:'no-earlier',holdText:'이번 주 전에 분석한 같은 곡 녹음이 없어 비교를 보류해요'};
  const report=G.periodReport(before,after,{reference:reference(songId)});
  const rows=JUDGED.map(id=>report[id]).filter(Boolean),compared=rows.filter(x=>COMPARED.includes(x.state));
  const moved=compared.filter(x=>x.state==='better'||x.state==='worse');
  const lines=[...moved,...compared.filter(x=>!moved.includes(x))].slice(0,2).map(x=>({id:x.id,title:G.METRICS.find(d=>d.id===x.id)?.title||x.id,state:x.state,label:G.stateLabel(x),text:G.changeText(x)}));
  const holds={};for(const x of rows.filter(x=>x.state==='hold'))holds[x.reason]=(holds[x.reason]||0)+1;
  const reason=Object.entries(holds).sort((a,b)=>b[1]-a[1])[0]?.[0]||'no-pair';
  return {songId,title,rank:moved.length?2:compared.length?1:0,lines,hold:lines.length?null:reason,holdText:lines.length?'':G.holdText(reason)};
 }).sort((a,b)=>b.rank-a.rank||a.title.localeCompare(b.title)):[];
 const growth={songs:reports.length,items:reports.slice(0,3),more:Math.max(0,reports.length-3)};

 /* 레슨 */
 const weekLessons=live(db,'lessons').filter(l=>inWeek(l.date)&&l.status!=='cancelled'&&l.status!=='canceled')
  .sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime||'').localeCompare(String(b.startTime||'')));
 const lessonIds=new Set(weekLessons.map(l=>l.id));
 const taskLessons=t=>list(t.lessonIds).length?t.lessonIds:t.lessonId?[t.lessonId]:[];
 const lessons=weekLessons.map(l=>{
  const ids=[...new Set([...list(l.songIds),l.songId].filter(Boolean))];
  const songFeedback=ids.map(id=>l.songFeedback?.[id]).find(v=>text(v));
  return {id:l.id,date:l.date,startTime:l.startTime||'',status:l.status||'done',songs:ids.map(id=>songTitle(id)).filter(Boolean),
   feedback:snippet(l.feedback||songFeedback||''),homework:assignments.filter(t=>taskLessons(t).includes(l.id)).map(t=>snippet(t.title,60))};
 });
 const newHomework=assignments.filter(t=>inWeek(kstDate(t.created))||taskLessons(t).some(id=>lessonIds.has(id))).map(t=>({id:t.id,title:snippet(t.title,60)}));

 /* Optional sections: only when the data exists */
 const checks=weekItems.filter(m=>m.voiceCheck);
 let voiceCheck=null;
 if(checks.length){
  let lines=[];
  try{const out=options.voiceCheckLines?.(checks);lines=(typeof out==='string'?[out]:list(out)).map(v=>snippet(typeof v==='string'?v:v?.text??'',90)).filter(Boolean).slice(0,3);}catch{lines=[];}
  voiceCheck={count:checks.length,days:new Set(checks.map(m=>m.date)).size,lines};
 }
 const setRows=practices.filter(p=>inWeek(p.date)&&p.date<=today&&practiceSetKey(p));
 const practiceSet=setRows.length?{sessions:new Set(setRows.map(practiceSetKey)).size,
  minutes:setRows.reduce((n,p)=>n+Time.actualMinutes(p),0),days:new Set(setRows.map(p=>p.date)).size}:null;

 const empty=!minutes&&!goals.length&&!weekItems.length&&!lessons.length&&!recordings.analyses&&!hwPractices.length&&!recordings.newSongs.length;
 return {today,start,end,current:start===monday(today),previousWeek:start===shift(monday(today),-7),
  firstWeek:range.first,canPrevious:start>range.first,canNext:start<range.last,
  practice,goals:goalSummary,recordings,growth,lessons:{list:lessons,newHomework},voiceCheck,practiceSet,empty};
}
const md=d=>Number(d.slice(5,7))+'월 '+Number(d.slice(8,10))+'일';
function rangeLabel(s){
 const a=md(s.start),b=s.start.slice(5,7)===s.end.slice(5,7)?Number(s.end.slice(8,10))+'일':md(s.end);
 return a+' – '+b;
}
/** Plain text for 복사 / the saved image. Sections in the order of the screen; optional ones only when present. */
function lines(s){
 const out=[],p=s.practice,g=s.goals,r=s.recordings;
 out.push({kind:'title',text:'VOCAL.zip 주간 요약'});
 out.push({kind:'meta',text:s.start.slice(0,4)+'년 '+rangeLabel(s)+(s.current?' (이번 주)':'')});
 out.push({kind:'head',text:'연습'});
 out.push({kind:'body',text:'연습 시간 '+minutesLabel(p.minutes)+' · 연습한 날 '+p.days+'/7일'+(p.streak>1?' · '+p.streak+'일 연속':'')});
 out.push({kind:'body',text:'지난주 대비 '+(p.previous.minutes||p.minutes?signed(p.delta):'기록 없음')+(p.target>0?' · 주간 목표 '+minutesLabel(p.target)+'의 '+p.ratio+'%':' · 주간 목표 미설정')});
 for(const x of p.topSongs)out.push({kind:'item',text:x.title+' '+minutesLabel(x.minutes)+' ('+x.sessions+'회)'});
 out.push({kind:'head',text:'목표'});
 out.push({kind:'body',text:g.total?'오늘의 목표 '+g.done+'/'+g.total+'개 완료':'세운 목표가 없어요'});
 for(const x of g.routines.slice(0,3))out.push({kind:'item',text:'반복 · '+x.title+' '+x.done+'/'+x.total+'일'});
 if(g.homework.sessions)out.push({kind:'body',text:'숙제를 연결한 연습 '+g.homework.sessions+'번'+(g.homework.tasks.length?' ('+g.homework.tasks.slice(0,3).map(t=>t.title).join(', ')+')':'')});
 out.push({kind:'head',text:'녹음'});
 out.push({kind:'body',text:r.total?'녹음 '+r.total+'개 · '+CATEGORIES.filter(([k])=>r.byCategory[k]).map(([k,l])=>l+' '+r.byCategory[k]).join(' · '):'녹음이 없어요'});
 if(r.analyses||r.newSongs.length)out.push({kind:'body',text:['분석 '+r.analyses+'개',r.newSongs.length?'새 곡 '+r.newSongs.map(x=>x.title).join(', '):''].filter(Boolean).join(' · ')});
 if(s.growth.items.length){
  out.push({kind:'head',text:'성장'});
  for(const x of s.growth.items)out.push({kind:'item',text:x.title+': '+(x.lines.length?x.lines.map(l=>l.title+' '+l.label).join(', '):'판정 보류 · '+x.holdText)});
 }
 if(s.lessons.list.length){
  out.push({kind:'head',text:'레슨'});
  for(const l of s.lessons.list)out.push({kind:'item',text:md(l.date)+(l.songs.length?' · '+l.songs.join(', '):'')+(l.feedback?' — '+l.feedback:'')});
 }
 if(s.lessons.newHomework.length)out.push({kind:'body',text:'새 숙제: '+s.lessons.newHomework.map(t=>t.title).slice(0,4).join(', ')});
 if(s.voiceCheck){out.push({kind:'head',text:'매일 보이스 체크'});out.push({kind:'body',text:s.voiceCheck.days+'일 · '+s.voiceCheck.count+'번 체크'});for(const t of s.voiceCheck.lines)out.push({kind:'item',text:t});}
 if(s.practiceSet){out.push({kind:'head',text:'오늘 연습 세트'});out.push({kind:'body',text:s.practiceSet.sessions+'세트 · '+s.practiceSet.days+'일'+(s.practiceSet.minutes?' · '+minutesLabel(s.practiceSet.minutes):'')});}
 return out;
}
const toText=s=>lines(s).map(l=>l.kind==='head'?'\n['+l.text+']':l.kind==='item'?'· '+l.text:l.text).join('\n').trim();
return {VERSION:1,KST,kstDate,monday,shift,mediaDate,isDate,bounds,build,lines,toText,rangeLabel,minutesLabel,signed,CATEGORIES,practiceSetKey};
});
