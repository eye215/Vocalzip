/* 오늘 연습 세트: pure model (no DOM, storage or network). One guided session made of today's items in order:
 * 웜업/발성 → 오늘의 목표(숙제·매일 반복·개인·추천) → 곡 구간 → 녹음(선택).
 * Time rules (app/practice-time-model.js): only real elapsed seconds on a running step, or minutes the singer typed,
 * count as practice time; recording length is never added.
 * The clock is the wall clock: a running session keeps the moment it was last counted (lastAt) next to the seconds
 * already counted, so time in another app, with the phone locked, or across a reload is counted once when the app
 * comes back. Only the pause button stops it. Away longer than LONG_GAP_MS is not counted until the singer says how. Saving is idempotent per session and step:
 *  - a step done for a daily goal checks that goal and writes its one practice row 'goal:<goalId>' through
 *    VzipGoalRoutines.perform (homework goals link the session to the assignment, never mark it done);
 *  - every other step writes 'practice-set:<sessionId>:<stepId>'.
 * So saving twice, or saving after a resume, replaces rows instead of adding minutes again.
 * Hook: registerStep(provider) lets another feature (e.g. 매일 보이스 체크) put an optional first step in the default
 * set. provider(db,{today}) returns null or {kind,title,minutes,...}; such steps are timed and saved like a warm-up. */
(function(root,factory){
  const api=factory();
  root.VzipPracticeSet=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const node=typeof module==='object'&&module.exports;
const Time=node?require('./practice-time-model.js'):globalThis.VzipPracticeTime;
const Home=()=>node?require('./student-home-model.js'):globalThis.VzipStudentHomeModel;
const Routines=()=>node?require('./goal-routines.js'):globalThis.VzipGoalRoutines;
const list=v=>Array.isArray(v)?v:[];
const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const LONG_GAP_MS=3*60*60*1000,MAX_MINUTES=600,MAX_STEPS=12;
const KINDS=['warmup','goal','song','record'];
const SLOT_DEFAULT_MINUTES={warmup:5,goal:5,song:10,record:3,first:2};
const providers=[];
/** Register an optional first step (the 매일 보이스 체크 hook). Returns an unregister function. */
function registerStep(provider){if(typeof provider==='function'&&!providers.includes(provider))providers.push(provider);return ()=>{const i=providers.indexOf(provider);if(i>=0)providers.splice(i,1);};}
const live=(db,key)=>Time.records(db?.[key]).filter(r=>!list(db?.deleted?.[key]).includes(r.id));
const songOf=(db,id)=>id?live(db,'songs').find(s=>s&&s.id===id)||null:null;
const clampMinutes=n=>{const v=Number(n);return Number.isFinite(v)&&v>=0?Math.min(MAX_MINUTES,Math.round(v)):0;};
const pad=n=>String(n).padStart(2,'0');
const fmt=s=>Math.floor(s/60)+':'+pad(Math.floor(s%60));
const segmentLabel=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>a?fmt(a)+'–'+fmt(b):'';
function addDays(date,n){const [y,m,d]=date.split('-').map(Number),at=new Date(y,m-1,d,12);at.setDate(at.getDate()+n);return at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate());}
function weekday(date){const [y,m,d]=date.split('-').map(Number);return new Date(y,m-1,d,12).getDay();}
/** Monthly song plans (app/monthly-practice-plans.js) running on `today`. */
function activePlans(db,today){
  return live(db,'practicePlans').filter(p=>p.kind==='monthly-vocal'&&!p.archived&&isDate(p.startDate)&&p.startDate<=today&&
    today<=addDays(p.startDate,Math.max(1,Number(p.days)||1)-1));
}
/** 웜업: a training category (발성 first, then 호흡) or the basic long-tone exercise. */
function warmupStep(db){
  const cats=list(db.categories).filter(c=>c&&c.name);
  const cat=cats.find(c=>c.name==='발성')||cats.find(c=>c.name==='호흡')||null;
  const detail=String(list(cat?.items).filter(Boolean).at(-1)||'호흡과 발성');
  return {kind:'warmup',title:'웜업 · '+detail,detail,categoryId:cat?.id||'',categoryLabel:cat?.name||'발성',
    tips:['허밍이나 립트릴로 편한 음역부터 천천히','편한 음역에서 롱톤 5초씩 5회','숨은 짧게 들이마시고 길게 내쉬기']};
}
function goalStep(db,g,plans){
  const plan=plans.find(p=>p.id===g.sourceId)||null,rec=g.recommendation||null;
  const songId=g.songId||plan?.songId||'',routine=Routines().routineOf(g);
  const step={kind:'goal',title:String(g.title||'목표'),goalId:g.id,source:g.source||'personal',routine:!!routine,songId,
    minutes:Number(plan?.minutes)>0?Number(plan.minutes):Number(rec?.minutes)>0?Number(rec.minutes):null};
  if(plan&&Number.isFinite(plan.segmentStart)&&Number.isFinite(plan.segmentEnd)){step.segmentStart=plan.segmentStart;step.segmentEnd=plan.segmentEnd;step.planId=plan.id;}
  if(g.source==='homework'&&g.sourceId)step.assignmentId=g.sourceId;
  return step;
}
/** Slot of a step in the default order. A goal with a song section belongs to 곡 구간; sections the singer added keep their own place. */
const slotOf=s=>s.first?'first':s.added?'extra':s.kind==='goal'?(s.segmentStart!=null?'song':'goal'):s.kind;
/** The default set for today (before a saved template is applied). options.recentSongId: latest practised song. */
function defaults(db={},{today,recentSongId=''}={}){
  if(!isDate(today))throw Error('오늘 날짜를 확인해 주세요.');
  const home=Home().build(db,{today}),plans=activePlans(db,today);
  const goals=home.goals.filter(g=>g.completed!==true);
  recentSongId=recentSongId||home.recent?.song?.id||'';
  const steps=[];
  for(const p of providers){try{const s=p(db,{today});if(s&&typeof s==='object'&&s.title)steps.push({...s,kind:String(s.kind||'first'),first:true});}catch{}}
  // A goal that already is the basic warm-up exercise takes the warm-up place instead of a second warm-up.
  const warmGoal=goals.find(g=>g.source==='recommendation'&&g.sourceId==='basic:breathing');
  if(!warmGoal)steps.push(warmupStep(db));
  for(const g of goals)steps.push(goalStep(db,g,plans));
  if(warmGoal){const i=steps.findIndex(s=>s.goalId===warmGoal.id);steps.splice(steps.filter(s=>s.first).length,0,...steps.splice(i,1));}
  // 곡 구간: a running monthly plan without a goal today, else the latest song (unless a goal already covers a song).
  const covered=new Set(steps.filter(s=>s.songId).map(s=>s.planId||'song:'+s.songId));
  const plan=plans.find(p=>!covered.has(p.id)&&songOf(db,p.songId));
  const anySongStep=steps.some(s=>s.kind==='goal'&&s.segmentStart!=null);
  const songId=plan?.songId||(!anySongStep&&songOf(db,recentSongId)?recentSongId:'');
  if(songId){
    const s={kind:'song',songId,title:'곡 구간 · '+songOf(db,songId).title};
    if(plan){s.segmentStart=plan.segmentStart;s.segmentEnd=plan.segmentEnd;s.planId=plan.id;s.minutes=Number(plan.minutes)||null;}
    steps.push(s);
  }
  const lastSong=[...steps].reverse().find(s=>s.songId&&songOf(db,s.songId));
  if(lastSong)steps.push({kind:'record',songId:lastSong.songId,title:'녹음 · '+songOf(db,lastSong.songId).title,optional:true,
    ...(lastSong.segmentStart!=null?{segmentStart:lastSong.segmentStart,segmentEnd:lastSong.segmentEnd}:{})});
  // Default order by slot; stable inside a slot.
  const rank={first:0,warmup:1,goal:2,song:3,record:4};
  return finish(steps.map((s,i)=>({s,i})).sort((a,b)=>(rank[slotOf(a.s)]??2)-(rank[slotOf(b.s)]??2)||a.i-b.i).map(x=>x.s));
}
/** Stable ids and minutes for a step list. */
function finish(steps){
  const used=new Set();
  return steps.slice(0,MAX_STEPS).map(s=>{
    let id=s.id||(s.goalId?'g-'+s.goalId:s.kind+(s.songId?'-'+s.songId:''));
    let k=1,base=id;while(used.has(id))id=base+'-'+(++k);used.add(id);
    return {...s,id,minutes:clampMinutes(s.minutes!=null&&s.minutes!==''?s.minutes:SLOT_DEFAULT_MINUTES[s.first?'first':s.kind]??5)||1};
  });
}
/* Templates: remembered as small practicePlans rows (synced like other plans). A template keeps the order of slots,
 * which default slots were removed, minutes per slot and the song sections the singer added; today's goals always
 * come from today. Slot 'w0'..'w6' is a weekday, 'default' the 기본 세트. */
const TEMPLATE='practice-set-template';
const templateId=slot=>TEMPLATE+':'+slot;
function templateFor(db,today){
  const rows=live(db,'practicePlans').filter(p=>p.kind===TEMPLATE);
  return rows.find(p=>p.id===templateId('w'+weekday(today)))||rows.find(p=>p.id===templateId('default'))||null;
}
function templateFrom(steps,base){
  // Removing one of today's goals is about today only: only warm-up, song, recording and hook steps are remembered.
  const order=[],minutes={},fixed=x=>list(x).filter(s=>s.kind!=='goal').map(slotOf),had=new Set(fixed(base)),kept=new Set(fixed(steps));
  for(const s of steps){const slot=slotOf(s);if(!order.includes(slot))order.push(slot);if(minutes[s.kind]==null&&!s.added)minutes[s.kind]=clampMinutes(s.minutes);}
  return {order,removed:[...had].filter(k=>!kept.has(k)),minutes,
    added:steps.filter(s=>s.added&&s.kind==='song'&&s.songId).map(s=>({songId:s.songId,minutes:clampMinutes(s.minutes),
      ...(s.segmentStart!=null?{segmentStart:s.segmentStart,segmentEnd:s.segmentEnd}:{})})).slice(0,4)};
}
/** Apply a saved template to today's default steps. */
function applyTemplate(db,steps,t){
  if(!t)return steps;
  const removed=new Set(list(t.removed)),order=list(t.order);
  let out=steps.filter(s=>s.kind==='goal'||!removed.has(slotOf(s))).map(s=>{
    const m=t.minutes?.[s.kind];
    // A goal keeps its own suggested minutes (plan or recommendation); otherwise the remembered minutes apply.
    return m>0&&!(s.kind==='goal'&&s.planId)?{...s,minutes:m}:s;
  });
  for(const a of list(t.added)){
    const song=songOf(db,a.songId);if(!song)continue;
    const seg=segmentLabel(a.segmentStart,a.segmentEnd);
    out.push({kind:'song',songId:a.songId,title:'곡 구간 · '+song.title+(seg?' '+seg:''),minutes:a.minutes||SLOT_DEFAULT_MINUTES.song,added:true,
      ...(seg?{segmentStart:a.segmentStart,segmentEnd:a.segmentEnd}:{})});
  }
  const pos=slot=>{const i=order.indexOf(slot);return i<0?order.length+['first','warmup','goal','song','extra','record'].indexOf(slot):i;};
  out=out.map((s,i)=>({s,i})).sort((a,b)=>pos(slotOf(a.s))-pos(slotOf(b.s))||a.i-b.i).map(x=>x.s);
  return finish(out);
}
function build(db={},options={}){
  const base=defaults(db,options),t=options.template===undefined?templateFor(db,options.today):options.template;
  // The editable steps never share objects with the defaults they are compared against.
  return {steps:applyTemplate(db,copy(base),t),base,template:t?{id:t.id,slot:t.slot}:null};
}
/** Write (or replace) a template. Call inside VZ.change. */
function saveTemplate(db,slot,steps,base){
  if(!(slot==='default'||/^w[0-6]$/.test(slot)))throw Error('저장할 세트를 확인해 주세요.');
  db.practicePlans||=[];
  const id=templateId(slot),row={id,kind:TEMPLATE,slot,...templateFrom(steps,base)};
  const at=db.practicePlans.findIndex(p=>p&&p.id===id);
  if(at<0)db.practicePlans.push(row);else db.practicePlans[at]={...db.practicePlans[at],...row};
  return id;
}

/* Session: a plain object kept by the page (and in this device's storage while it runs). */
function start(steps,{id,date,now=Date.now()}={}){
  if(!id||!isDate(date))throw Error('연습 세트를 시작할 수 없어요.');
  const items=finish(steps||[]);
  if(!items.length)throw Error('연습할 항목을 하나 이상 남겨 주세요.');
  return {v:2,id:String(id),date,startedAt:now,index:0,running:false,lastAt:0,phase:'run',savedAt:0,
    steps:items.map(s=>({...s,elapsed:0,done:false,mediaIds:Array.isArray(s.mediaIds)?s.mediaIds.map(String):[]}))};
}
const seconds=n=>Math.round(n*1000)/1000;
const targetOf=st=>(Number(st.minutes)||0)*60;
/** Count the time since the session was last counted on the current step (wall clock, any length up to LONG_GAP_MS).
 * options.away: the app is coming back (another app, locked screen, reload) — a planned time that ran out meanwhile
 * is marked (overAway) so the screen can say so. A longer gap stops the clock and waits for resolveAway(). */
function tick(s,now=Date.now(),{away=false}={}){
  if(!s||!s.running)return s;
  const st=s.steps[s.index],gap=Math.max(0,now-(s.lastAt||now));
  if(gap>LONG_GAP_MS){s.away={step:st.id,from:s.lastAt,to:now};s.running=false;s.lastAt=0;return s;}
  const before=st.elapsed;
  st.elapsed=seconds(before+gap/1000);s.lastAt=now;
  if(away&&before<targetOf(st)&&st.elapsed>=targetOf(st))s.overAway=st.id;
  return s;
}
/** Seconds on the current step right now, without changing the session (for a display between counts). */
function elapsedNow(s,now=Date.now()){
  const st=s.steps[s.index];
  return s.running?seconds(st.elapsed+Math.min(LONG_GAP_MS,Math.max(0,now-(s.lastAt||now)))/1000):st.elapsed;
}
/** The stretch waiting for an answer: {step,seconds,planned} (planned: seconds left to the step's planned end). */
function awayInfo(s){
  if(!s?.away)return null;
  const st=s.steps.find(x=>x.id===s.away.step);if(!st)return null;
  const gap=Math.max(0,(Number(s.away.to)||0)-(Number(s.away.from)||0))/1000;
  return {step:st,seconds:gap,planned:Math.min(gap,Math.max(0,targetOf(st)-st.elapsed))};
}
/** Answer a long gap: 'planned' counts up to the step's planned end, 'all' the whole stretch, 'none' nothing.
 * The session stays paused; the singer resumes it. */
function resolveAway(s,choice){
  const info=awayInfo(s);
  if(!['planned','all','none'].includes(choice))throw Error('어떻게 셀지 골라 주세요.');
  if(info){
    const add=choice==='all'?info.seconds:choice==='planned'?info.planned:0,before=info.step.elapsed;
    info.step.elapsed=seconds(before+add);
    if(add>0&&before<targetOf(info.step)&&info.step.elapsed>=targetOf(info.step)&&s.steps[s.index]===info.step&&s.phase==='run')s.overAway=info.step.id;
  }
  delete s.away;return s;
}
function play(s,now=Date.now()){if(s.phase!=='run'||s.away)return s;s.running=true;s.lastAt=now;return s;}
function pause(s,now=Date.now()){tick(s,now);s.running=false;s.lastAt=0;return s;}
/** Move to another step. Moving forward marks the step left behind as done. */
function go(s,index,now=Date.now()){
  if(index<0||index>=s.steps.length||index===s.index)return s;
  tick(s,now);
  if(index>s.index)s.steps[s.index].done=true;
  s.index=index;s.lastAt=s.running?now:0;delete s.overAway;return s;
}
function end(s,now=Date.now()){tick(s,now);s.steps[s.index].done=true;s.running=false;s.lastAt=0;s.phase='summary';delete s.overAway;return s;}
/** After a reload a running session is still running: the time away is counted by the next tick().
 * A session stored by the earlier version (v1, which stopped whenever the page was hidden) comes back paused. */
function restore(raw){
  if(!raw||!(raw.v===1||raw.v===2)||!raw.id||!isDate(raw.date)||!Array.isArray(raw.steps)||!raw.steps.length)return null;
  const s=copy(raw);s.index=Math.min(Math.max(0,Number(s.index)||0),s.steps.length-1);
  for(const st of s.steps){st.elapsed=Math.max(0,Number(st.elapsed)||0);st.mediaIds=list(st.mediaIds).map(String);st.done=st.done===true;}
  const lastAt=Number(s.lastAt);
  s.running=raw.v===2&&s.running===true&&s.phase==='run'&&!s.away&&Number.isFinite(lastAt)&&lastAt>0;
  s.lastAt=s.running?lastAt:0;s.v=2;
  if(s.away&&!awayInfo(s))delete s.away;
  return s;
}
/** Summary rows: minutes from real elapsed seconds (rounded), never from recordings. */
function summary(s){
  return s.steps.map(st=>({id:st.id,kind:st.kind,title:st.title,goalId:st.goalId||'',done:st.done===true,seconds:Math.round(st.elapsed),
    minutes:clampMinutes(st.elapsed/60),targetMinutes:st.minutes,mediaIds:st.mediaIds.slice()}));
}
const rowId=(s,st)=>'practice-set:'+s.id+':'+st.id;
/** Save the session into db (call inside VZ.change). rows: [{id,minutes,done}] edited by the singer.
 * options.category(db,step) → {categoryId,categoryLabel,detail} for training steps (the app passes VZ.guidedCategory).
 * Returns {minutes,goals,rows}. */
function save(db,s,rows,{now=Date.now(),category=null}={}){
  if(!s||!Array.isArray(s.steps))throw Error('연습 세트를 찾지 못했어요.');
  const edits=new Map(list(rows).map(r=>[r.id,r]));
  for(const r of edits.values()){const n=Number(r.minutes);if(!(Number.isFinite(n)&&n>=0&&n<=MAX_MINUTES))throw Error('연습 시간은 0~600분으로 적어 주세요.');}
  db.practices||=[];db.dailyGoals||=[];
  const H=Home(),R=Routines();
  let total=0,goals=0,written=0;
  for(const st of s.steps){
    const edit=edits.get(st.id)||{},minutes=clampMinutes(edit.minutes??st.elapsed/60),done=(edit.done??st.done)===true;
    const goal=st.goalId?db.dailyGoals.find(g=>g&&g.id===st.goalId):null;
    const plainId=rowId(s,st),plainAt=db.practices.findIndex(p=>p&&p.id===plainId),plain=plainAt<0?null:db.practices[plainAt];
    total+=minutes;
    if(goal&&done){
      // The goal's single practice row keeps time recorded before this session (base) and adds this step once.
      const pid=R.practiceId(goal),old=db.practices.find(p=>p&&p.id===pid);
      const base=old?(old.practiceSetId===s.id?Number(old.practiceSetBase)||0:Time.actualMinutes(old)):0;
      if(!H.setGoal(db,goal.id,true))throw Error('목표를 찾지 못했어요.');
      const media=[...new Set([...list(goal.performance?.mediaIds),...st.mediaIds])];
      const sum=Math.min(MAX_MINUTES,base+minutes);
      R.perform(db,goal.id,{minutes:sum>0?sum:null,mediaIds:media,songId:st.songId||''},now);
      const row=db.practices.find(p=>p&&p.id===pid);
      if(row)Object.assign(row,{practiceSetId:s.id,practiceSetStep:st.id,practiceSetBase:base});
      // Saved earlier as plain time (step not yet done): that time now lives in the goal row.
      if(plain)Object.assign(plain,{minutes:0,manualMinutes:0,technique:[]});
      goals++;written++;continue;
    }
    if(!(minutes>0||st.mediaIds.length||plain))continue;
    const training=!st.songId,cat=training?(st.categoryId&&list(db.categories).some(c=>c.id===st.categoryId)?
      {categoryId:st.categoryId,categoryLabel:st.categoryLabel||'',detail:st.detail||st.title}:category?.(db,st)||{categoryLabel:st.categoryLabel||'보컬 트레이닝',detail:st.detail||st.title}):{};
    const row={...plain,id:plainId,date:s.date,minutes,manualMinutes:minutes,practiceTimeSource:'practice-set',practiceMode:training?'training':'song',
      songId:st.songId||'',...cat,technique:minutes>0?[{name:st.title,minutes}]:[],memo:'[오늘 연습 세트] '+st.title,mediaIds:st.mediaIds.slice(),
      completed:[],assignmentReps:{},assignmentNotes:plain?.assignmentNotes||{},practiceSetId:s.id,practiceSetStep:st.id,
      ...(st.segmentStart!=null?{segmentStart:st.segmentStart,segmentEnd:st.segmentEnd}:{}),created:plain?.created||now};
    if(plainAt<0)db.practices.push(row);else db.practices[plainAt]=row;
    written++;
  }
  return {minutes:total,goals,rows:written};
}
return {KINDS,LONG_GAP_MS,registerStep,providers,defaults,build,applyTemplate,templateFor,templateFrom,saveTemplate,templateId,weekday,
  activePlans,normalize:finish,start,tick,elapsedNow,awayInfo,resolveAway,play,pause,go,end,restore,summary,save,rowId,segmentLabel,slotOf};
});
