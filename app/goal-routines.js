/* 반복 연습 목표 (신규 2, Phase 09·11·17; 보강 2026-11-12).
 * A routine is "this goal every day for N days". Its days are written as ordinary dailyGoals (routineId on every day),
 * so home, progress and cross-device merge keep working. Edits, length changes and endings change only today's
 * unfinished goal and later days: past goals and completed checks stay (decided 2026-11-11).
 * Cross-device: the generic merge keeps one version of a record (newer updatedAt) and honours tombstones. So every
 * rename / length change / end is also written as its own small record (kind 'routine-change', never edited), which a
 * merge can only add, never overwrite; the routine's state is its row plus those records (view()). After a cloud merge
 * reconcile() re-applies the rule to the days (drops unfinished days after the end, applies titles from their day on,
 * keeps one row per routine day, restores a goal's record from its practice row). Days are pre-created with stable
 * ids (homework routines: stable routine id per assignment and start day), so two devices write the same rows.
 * Completion may optionally carry the minutes really practised and today's recordings. Only typed minutes count as
 * practice time (one practice record per goal, so re-saving updates instead of adding); recording length is never
 * added. Homework goals (also homework routines) link the session to the assignment without marking it done. */
(function(root,factory){
  const api=factory();
  root.VzipGoalRoutines=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const shift=(date,days)=>{const [y,m,d]=date.split('-').map(Number),at=new Date(y,m-1,d,12);at.setDate(at.getDate()+days);return at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate());};
const span=(a,b)=>{const [y1,m1,d1]=a.split('-').map(Number),[y2,m2,d2]=b.split('-').map(Number);return Math.round((new Date(y2,m2-1,d2,12)-new Date(y1,m1-1,d1,12))/86400000);};
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const MAX_DAYS=60,CHANGE='routine-change';
const isRoutine=p=>p&&p.kind==='routine'&&typeof p.id==='string';
const rows=db=>(db.practicePlans||[]).filter(isRoutine);
/** The routine a daily goal belongs to ('' for ordinary goals). Days written before routineId used sourceId. */
const routineOf=g=>g?(g.routineId||(g.routine===true&&typeof g.sourceId==='string'&&g.sourceId.startsWith('routine:')?g.sourceId:'')):'';
const goalsOf=(db,id)=>(db.dailyGoals||[]).filter(g=>routineOf(g)===id).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
const changeKey=c=>[Number(c?.at)||0,c?.from||'',c?.title??'',c?.endDate??'',c?.end?1:0].join('\u0001');
/** Every change of a routine: the change records plus the log kept on rows written before 2026-11-12, oldest first. */
function log(db,r){
  const seen=new Map();
  for(const c of [...(Array.isArray(r.changes)?r.changes:[]),...(db.practicePlans||[]).filter(p=>p?.kind===CHANGE&&p.routineId===r.id)])
    if(c&&isDate(c.from)&&!seen.has(changeKey(c)))seen.set(changeKey(c),c);
  return [...seen.values()].sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)||(changeKey(a)<changeKey(b)?-1:1));
}
/** The routine as all devices agree on it: latest title and length by change time; an end on any device stays. */
function view(db,r){
  const all=log(db,r),named=all.filter(c=>c.title).at(-1),sized=all.filter(c=>isDate(c.endDate)).at(-1),ends=all.filter(c=>c.end===true);
  const out={...r,changes:all};
  if(named)out.title=named.title;
  if(sized){out.endDate=sized.endDate;if(isDate(r.startDate))out.days=span(r.startDate,sized.endDate)+1;}
  if(r.archived===true||ends.length){
    out.archived=true;
    const days=[r.archived===true?r.endedOn:null,...ends.map(c=>c.from)].filter(isDate).sort(),at=[r.archived===true?r.archivedAt:null,...ends.map(c=>c.at)].map(Number).filter(n=>n>0);
    if(days.length)out.endedOn=days[0];if(at.length)out.archivedAt=Math.min(...at);
  }
  return out;
}
const routines=db=>rows(db).map(r=>view(db,r));
/** Still running on `today`: not ended and its last day not passed. */
const active=(r,today)=>!r.archived&&!(isDate(r.endDate)&&r.endDate<today);
function title(v){const t=String(v??'').trim().replace(/\s+/g,' ');if(!t||t.length>200)throw Error('목표 내용을 1~200자로 적어 주세요.');return t;}
function days(v){const n=Number(v);if(!Number.isInteger(n)||n<2||n>MAX_DAYS)throw Error('반복 일수는 2~'+MAX_DAYS+'일로 정해 주세요.');return n;}
const order=(db,date)=>db.dailyGoals.filter(g=>g?.date===date).length;
/** Stable day id; a day removed earlier (tombstoned, e.g. shortened then extended) gets the next free suffix. */
function dayId(db,r,date){const gone=new Set(db.deleted?.dailyGoals||[]);let id=r.id+':'+date,k=1;while(gone.has(id))id=r.id+':'+date+'~'+(++k);return id;}
function dayGoal(r,date,t,db,now){
  const homework=r.source==='homework';
  return {id:dayId(db,r,date),date,title:t,source:homework?'homework':'personal',sourceId:homework?r.sourceId:r.id,routineId:r.id,routine:true,
    ...(r.songId?{songId:r.songId}:{}),completed:false,order:order(db,date),created:now};
}
/** Write the routine's days from..to. A homework day already planned for that assignment joins the routine instead of
 * being duplicated; a day that already exists is left alone. */
function fill(db,r,from,to,t,now){
  for(let date=from;date<=to;date=shift(date,1)){
    if(db.dailyGoals.some(g=>g?.date===date&&routineOf(g)===r.id))continue;
    const same=r.source==='homework'&&db.dailyGoals.find(g=>g?.date===date&&g.source==='homework'&&g.sourceId===r.sourceId&&!routineOf(g));
    if(same){same.routineId=r.id;same.routine=true;continue;}
    db.dailyGoals.push(dayGoal(r,date,t,db,now));
  }
}
/** Create one routine per title, starting today; writes its daily goals. Returns the routine ids.
 * source 'homework' + sourceId: a teacher assignment repeated daily (its days stay homework goals). */
function create(db,{titles,days:count,today,uid,now=Date.now(),source='personal',sourceId='',songId=''}){
  if(!isDate(today))throw Error('날짜를 확인해 주세요.');
  const list=(Array.isArray(titles)?titles:[titles]).map(title),n=days(count),homework=source==='homework';
  if(homework&&(!sourceId||list.length!==1))throw Error('반복할 숙제를 확인해 주세요.');
  db.practicePlans||=[];db.dailyGoals||=[];
  if(homework&&routines(db).some(r=>r.source==='homework'&&r.sourceId===sourceId&&active(r,today)))throw Error('이미 매일 반복 중인 숙제예요.');
  return list.map(t=>{
    // A homework routine has a stable id per assignment and start day, so two devices starting it offline make one routine.
    const id=homework?'routine:hw:'+sourceId+':'+today:'routine:'+uid();
    if(db.practicePlans.some(p=>p.id===id))throw Error(homework?'오늘 이미 반복을 시작했던 숙제예요.':'목표 ID가 겹쳤어요. 다시 시도해 주세요.');
    const r={id,kind:'routine',title:t,days:n,startDate:today,endDate:shift(today,n-1),created:now,archived:false,changes:[],
      ...(homework?{source:'homework',sourceId:String(sourceId),...(songId?{songId:String(songId)}:{})}:{})};
    db.practicePlans.push(r);
    fill(db,r,today,r.endDate,t,now);
    return id;
  });
}
/** The stored row and the agreed view of a routine still running today. */
function find(db,id,today){
  const row=rows(db).find(p=>p.id===id);if(!row)return null;
  const v=view(db,row);return active(v,today)?{row,v}:null;
}
function record(db,id,change,now){
  const kind=change.end?'end':change.title!=null?'title':'length';
  db.practicePlans.push({id:id+'~'+kind+(change.end?'':'~'+now),kind:CHANGE,routineId:id,...change,at:now});
}
/** Rename from today on. Past days and completed goals keep the title they were done under. */
function rename(db,id,next,today,now=Date.now()){
  const f=find(db,id,today);if(!f)return false;
  const t=title(next);if(t===f.v.title)return true;
  for(const g of goalsOf(db,id))if(g.date>=today&&g.completed!==true)g.title=t;
  record(db,id,{from:today,title:t,before:f.v.title},now);f.row.title=t;
  return true;
}
/** Allowed remaining days (today included) so the whole routine stays within 2..60 days. */
function remainingRange(r,today){
  const before=Math.max(0,span(r.startDate,today));
  return {min:Math.max(1,2-before),max:MAX_DAYS-before,now:span(today,r.endDate)+1};
}
/** Change how many days are left (today included). Shortening drops only unfinished later days; extending adds days
 * after the current last day. Past days, completed checks and days already counted stay. */
function resize(db,id,remaining,today,now=Date.now()){
  const f=find(db,id,today);if(!f)return false;
  const {min,max}=remainingRange(f.v,today),n=Number(remaining);
  if(!Number.isInteger(n)||n<min||n>max)throw Error('남은 일수는 '+min+'~'+max+'일로 정해 주세요.');
  const end=shift(today,n-1),old=f.v.endDate;if(end===old)return true;
  db.dailyGoals||=[];
  if(end<old)db.dailyGoals=db.dailyGoals.filter(g=>routineOf(g)!==id||g.date<=end||g.completed===true);
  else fill(db,f.v,shift(old,1),end,f.v.title,now);
  record(db,id,{from:today,endDate:end,before:old},now);
  f.row.endDate=end;f.row.days=span(f.row.startDate,end)+1;
  return true;
}
/** End the routine: today's unfinished goal and later days are removed; past days and completed checks stay. */
function end(db,id,today,now=Date.now()){
  const f=find(db,id,today);if(!f)return false;
  db.dailyGoals=(db.dailyGoals||[]).filter(g=>routineOf(g)!==id||g.date<today||g.completed===true);
  record(db,id,{from:today,end:true},now);
  Object.assign(f.row,{archived:true,archivedAt:now,endedOn:today});
  return true;
}
/** Title in force on a date: the latest change (by time) that applies from that date or earlier. */
function titleOn(v,date){
  let best=null;for(const c of v.changes)if(c.title&&c.from<=date&&(!best||(Number(c.at)||0)>=(Number(best.at)||0)))best=c;
  return best?.title||null;
}
const outside=(v,date)=>isDate(v.endDate)&&date>v.endDate||v.archived===true&&isDate(v.endedOn)&&date>=v.endedOn;
/** Re-apply every routine's rule after a merge brought in another device's edits. Mutates db; returns true when
 * something changed. Drops only unfinished days after the agreed end; keeps one row per routine day (a completed or
 * recorded row wins); restores a goal's 수행 기록 from its newer practice row. Never touches days before the rule. */
function reconcile(db){
  const list=rows(db);if(!list.length||!Array.isArray(db.dailyGoals))return false;
  let changed=false;
  const views=new Map(list.map(r=>{const v=view(db,r);
    // The row itself converges to the agreed view (other code and older app versions read the row).
    for(const k of ['title','endDate','days','archived','endedOn','archivedAt'])if(v[k]!==undefined&&r[k]!==v[k]){r[k]=v[k];changed=true;}
    return [r.id,v];}));
  const practices=new Map((db.practices||[]).filter(p=>p?.goalId).map(p=>[p.id,p]));
  const rank=g=>(g.completed===true?4:0)+(g.performance?2:0)+(routineOf(g)?1:0);
  const kept=new Map(),out=[];
  for(const g of db.dailyGoals){
    // A goal whose newer check came from another device keeps the record saved with its practice row.
    const p=g&&practices.get('goal:'+g.id),at=Number(p?.performedAt)||0;
    if(at>(Number(g.performance?.at)||0)){g.performance={minutes:Number(p.manualMinutes)>0?Number(p.manualMinutes):null,mediaIds:Array.isArray(p.mediaIds)?p.mediaIds.slice():[],at};changed=true;}
    const v=views.get(routineOf(g));
    if(!v||!isDate(g.date)){out.push(g);continue;}
    if(g.completed!==true&&outside(v,g.date)){changed=true;continue;}
    const t=g.completed===true?null:titleOn(v,g.date);
    if(t&&t!==g.title){g.title=t;changed=true;}
    // One row per routine day; a homework routine also absorbs a plain homework goal for the same assignment/day.
    const key=g.date+'\u0001'+(v.source==='homework'?'hw:'+v.sourceId:v.id);
    if(!kept.has(key)){kept.set(key,out.length);out.push(g);continue;}
    const i=kept.get(key),other=out[i];changed=true;
    out[i]=rank(g)>rank(other)||rank(g)===rank(other)&&String(g.id)<String(other.id)?g:other;
  }
  for(let i=out.length-1;i>=0;i--){
    const g=out[i];if(!g||routineOf(g)||g.source!=='homework'||!isDate(g.date))continue;
    const key=g.date+'\u0001hw:'+g.sourceId;if(!kept.has(key))continue;
    const j=kept.get(key);
    if(rank(g)>rank(out[j])){Object.assign(g,{routineId:routineOf(out[j]),routine:true});out[j]=g;}
    out.splice(i,1);changed=true;for(const [k,x] of kept)if(x>i)kept.set(k,x-1);
  }
  if(changed)db.dailyGoals=out;
  return changed;
}
/** done/total for the days that exist (ended routines count only the days they ran). */
function progress(db,id,today){
  const goals=goalsOf(db,id),past=goals.filter(g=>g.date<=today);
  return {done:goals.filter(g=>g.completed===true).length,total:goals.length,elapsed:past.length,
    missed:past.filter(g=>g.date<today&&g.completed!==true).length};
}
const practiceId=goal=>'goal:'+goal.id;
/** Practice already saved for this goal's homework/recommendation by another flow (e.g. 따라 하기), for display. */
function otherMinutes(db,goal){
  return (db.practices||[]).filter(p=>p&&p.date===goal.date&&p.id!==practiceId(goal)&&
    (goal.sourceId&&(Array.isArray(p.completed)&&p.completed.includes(goal.sourceId)||p.guidedExerciseKey===goal.sourceId)))
    .reduce((n,p)=>n+(Number(p.manualMinutes??p.minutes)||0),0);
}
/** Save the optional performance of a completed goal. minutes: null or 1..600; mediaIds: today's recordings.
 * Idempotent per goal: one practice row 'goal:<goalId>' (same id on every device), so minutes never add up twice. */
function perform(db,goalId,{minutes,mediaIds=[],songId},now=Date.now()){
  const goal=(db.dailyGoals||[]).find(g=>g?.id===goalId);
  if(!goal)throw Error('이 목표가 변경됐어요. 화면을 새로 열어 주세요.');
  if(goal.completed!==true)throw Error('완료한 목표에만 수행 기록을 남길 수 있어요.');
  const mins=minutes==null||minutes===''?null:Number(minutes);
  if(mins!=null&&!(Number.isFinite(mins)&&mins>0&&mins<=600))throw Error('연습 시간은 1~600분으로 적어 주세요.');
  const ids=[...new Set((Array.isArray(mediaIds)?mediaIds:[]).map(String))].slice(0,20);
  goal.performance={minutes:mins,mediaIds:ids,at:now};
  db.practices||=[];
  const id=practiceId(goal),at=db.practices.findIndex(p=>p?.id===id),old=at<0?null:db.practices[at];
  if(mins==null){
    // No typed time: nothing to count. An earlier time entry from this sheet is kept as 0 minutes, never re-added.
    if(old)Object.assign(old,{minutes:0,manualMinutes:0,mediaIds:ids,performedAt:now,updatedAt:now});
    return true;
  }
  const homework=goal.source==='homework'&&goal.sourceId,song=goal.songId||songId||'';
  const row={...old,id,date:goal.date,minutes:mins,manualMinutes:mins,practiceTimeSource:'goal',practiceMode:song?'song':'training',songId:song,
    mediaIds:ids,memo:'[목표] '+goal.title,goalId:goal.id,goalSource:goal.source||'personal',
    completed:homework?[goal.sourceId]:[],assignmentReps:homework?{[goal.sourceId]:1}:{},assignmentNotes:old?.assignmentNotes||{},
    technique:old?.technique||[],created:old?.created||now,performedAt:now,updatedAt:now};
  if(at<0)db.practices.push(row);else db.practices[at]=row;
  return true;
}
return {MAX_DAYS,shift,span,routines,routineOf,goalsOf,active,view,create,rename,resize,remainingRange,end,reconcile,progress,perform,otherMinutes,practiceId};
});

/* UI: routine section inside 오늘의 목표 sheet + optional 수행 기록 sheet after a goal is checked. */
(()=>{
'use strict';
if(typeof window==="undefined")return;
const V=window.VZ,R=window.VzipGoalRoutines;
if(!V||!R||typeof document==='undefined')return;
const esc=V.esc;
V.goalRoutines=R;
const md=d=>String(d||'').slice(5).replace('-','.');
/** After a cloud merge (or import) brings another device's routine edits, re-apply the routine rules once.
 * Runs through VZ.change like any edit; reconcile is idempotent, so the follow-up event finds nothing to do. */
let settling=false;
const settle=()=>{
  if(settling||!R.routines(V.db).length)return;
  try{if(!R.reconcile(structuredClone(V.db)))return;}catch(e){console.error(e);return;}
  settling=true;
  try{if(V.change(db=>{R.reconcile(db);},{silent:true}))V.softRender?.();}finally{settling=false;}
};
window.addEventListener('vzip:data-changed',e=>{if(e.detail?.source!=='v6')setTimeout(settle,0);});
setTimeout(settle,0);
/** Compact routine progress for a home goal row: {label, done, total} or null. */
V.routineInfo=goal=>{
  const id=R.routineOf(goal);if(!id||!R.routines(V.db).some(r=>r.id===id))return null;
  const p=R.progress(V.db,id,V.today());
  return {label:goal.source==='homework'?'숙제 반복':'반복',done:p.done,total:p.total};
};
const homeworkDays=(t,today)=>t.dueDate>=today?Math.min(R.MAX_DAYS,Math.max(2,R.span(today,t.dueDate)+1)):7;
const repeatable=today=>{
  const running=R.routines(V.db).filter(r=>r.source==='homework'&&R.active(r,today)).map(r=>r.sourceId);
  return (V.db.assignments||[]).filter(t=>t&&t.status!=='done'&&(!t.startDate||today>=t.startDate)&&(!t.dueDate||today<=t.dueDate)&&!running.includes(t.id));
};
/** Markup for the plan sheet: repeat toggle for new personal goals, active homework to repeat daily,
 * running routines with 고치기/끝내기 and the finished ones (collapsed, final n/N). */
V.routineFields=()=>{
  const today=V.today(),all=R.routines(V.db),active=all.filter(r=>R.active(r,today)),ended=all.filter(r=>!R.active(r,today)),homework=repeatable(today);
  const end=r=>R.goalsOf(V.db,r.id).at(-1)?.date||r.endDate;
  return '<div class="vz-routine-new"><label class="vz-routine-toggle"><input type="checkbox" name="repeat"><span>매일 반복</span></label>'+
    '<label class="vz-routine-days" data-routine-days hidden><input type="number" name="repeatDays" min="2" max="'+R.MAX_DAYS+'" value="7" inputmode="numeric" aria-label="반복 일수"><span>일 동안</span></label></div>'+
    (homework.length?'<fieldset class="vz-plan-section vz-routines"><legend>숙제를 매일 반복</legend>'+homework.map(t=>
      '<div class="vz-routine" data-homework-routine="'+esc(t.id)+'"><span class="vz-routine-main"><strong>'+esc(t.title||'숙제')+'</strong><small>숙제'+(t.dueDate?' · '+esc(md(t.dueDate))+' 마감':'')+'</small></span>'+
      '<button type="button" class="vz-routine-action" data-homework-repeat aria-label="'+esc(t.title||'숙제')+' 매일 반복으로">매일 반복으로</button></div>').join('')+'</fieldset>':'')+
    (active.length?'<fieldset class="vz-plan-section vz-routines"><legend>반복 중인 목표</legend>'+active.map(r=>{const p=R.progress(V.db,r.id,today);
      return '<div class="vz-routine" data-routine="'+esc(r.id)+'"><span class="vz-routine-main"><strong>'+esc(r.title)+'</strong><small>'+(r.source==='homework'?'숙제 · ':'')+p.done+'/'+p.total+'일 완료'+(p.missed?' · <b>'+p.missed+'일 놓침</b>':'')+' · '+esc(md(r.endDate))+'까지</small></span>'+
        '<button type="button" class="icon-btn" data-routine-edit aria-label="'+esc(r.title)+' 고치기"><i class="ph ph-pencil-simple"></i></button>'+
        '<button type="button" class="icon-btn" data-routine-end aria-label="'+esc(r.title)+' 끝내기"><i class="ph ph-stop-circle"></i></button></div>';}).join('')+
      '<p class="vz-plan-help">고치거나 끝내면 오늘 이후만 바뀌어요. 지난 기록과 완료 체크는 그대로예요.</p></fieldset>':'')+
    (ended.length?'<details class="vz-routines-ended"><summary>끝난 반복 <small>'+ended.length+'</small><i class="ph ph-caret-down" aria-hidden="true"></i></summary>'+
      ended.sort((a,b)=>String(end(b)).localeCompare(String(end(a)))).map(r=>{const p=R.progress(V.db,r.id,today);
        return '<div class="vz-routine is-ended"><span class="vz-routine-main"><strong>'+esc(r.title)+'</strong><small>최종 '+p.done+'/'+p.total+'일 완료 · '+esc(md(end(r)))+' 끝</small></span></div>';}).join('')+'</details>':'');
};
/** Inline editor under a routine row (no nested sheet): fields + 취소/저장. apply(values) returns the mutation. */
function editor(row,html,apply){
  row.parentNode.querySelector('.vz-routine-edit')?.remove();
  const box=document.createElement('div');box.className='vz-routine-edit';
  box.innerHTML=html+'<p role="alert" data-routine-error></p><div class="vz-routine-edit-actions"><button type="button" class="btn secondary sm" data-routine-cancel>취소</button><button type="button" class="btn sm" data-routine-apply>저장</button></div>';
  row.after(box);
  const error=box.querySelector('[data-routine-error]'),run=()=>{
    error.textContent='';
    let mutate;
    try{mutate=apply(box);if(!mutate)return box.remove();mutate(structuredClone(V.db));}catch(e){error.textContent=e.message;return;}
    if(!V.change(mutate,{silent:true})){error.textContent='저장하지 못했어요. 다시 시도해 주세요.';return;}
    box.dispatchEvent(new CustomEvent('routine-saved',{bubbles:false}));
  };
  box.querySelector('[data-routine-cancel]').onclick=()=>{box.remove();row.querySelector('button')?.focus();};
  box.querySelector('[data-routine-apply]').onclick=run;
  // Enter applies this edit instead of submitting the whole goal form.
  box.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});
  box.querySelector('input')?.focus();
  return box;
}
/** Wire the fields; onChange runs after a routine was changed (the caller reopens its sheet). */
V.routineBind=(el,onChange)=>{
  const box=el.querySelector('[name=repeat]'),daysEl=el.querySelector('[data-routine-days]');
  if(box)box.onchange=()=>{daysEl.hidden=!box.checked;};
  const saved=(edit,message)=>edit.addEventListener('routine-saved',()=>{V.toast(message());onChange?.();});
  el.querySelectorAll('[data-routine]').forEach(row=>{
    const id=row.dataset.routine,r=R.routines(V.db).find(x=>x.id===id);if(!r)return;
    row.querySelector('[data-routine-edit]').onclick=()=>{
      const today=V.today(),range=R.remainingRange(r,today);
      const edit=editor(row,'<label class="field"><span>반복할 목표</span><input type="text" name="routineTitle" maxlength="200" value="'+esc(r.title)+'" aria-label="반복할 목표"></label>'+
        '<label class="vz-routine-days"><span>남은 일수</span><input type="number" name="routineLeft" min="'+range.min+'" max="'+range.max+'" value="'+range.now+'" inputmode="numeric" aria-label="남은 일수"><span>일 (오늘 포함)</span></label>'+
        '<p class="vz-plan-help">오늘부터 적용돼요. 최대 '+range.max+'일까지 늘리거나 줄일 수 있고, 지난 날짜와 완료 체크는 그대로예요.</p>',
      box=>{
        const next=box.querySelector('[name=routineTitle]').value,left=Number(box.querySelector('[name=routineLeft]').value);
        if(next.trim().replace(/\s+/g,' ')===r.title&&left===range.now)return null;
        return db=>{if(!R.rename(db,id,next,today)||!R.resize(db,id,left,today))throw Error('이 목표가 변경됐어요. 창을 다시 열어 주세요.');};
      });
      saved(edit,()=>'오늘부터 바뀐 내용으로 반복해요.');
    };
    row.querySelector('[data-routine-end]').onclick=async()=>{
      if(!await V.confirm('반복 끝내기','"'+r.title+'" 반복을 끝낼까요? 오늘 아직 안 한 목표와 내일부터의 목표가 빠지고, 지난 기록은 남아요.',{ok:'끝내기'}))return;
      if(V.change(db=>{if(!R.end(db,id,V.today()))throw Error('이 목표가 변경됐어요.');},{silent:true})){V.toast('반복을 끝냈어요.');onChange?.();}
    };
  });
  el.querySelectorAll('[data-homework-routine]').forEach(row=>{
    const t=(V.db.assignments||[]).find(x=>x.id===row.dataset.homeworkRoutine);if(!t)return;
    row.querySelector('[data-homework-repeat]').onclick=()=>{
      const today=V.today();let count=0;
      const edit=editor(row,'<label class="vz-routine-days"><input type="number" name="homeworkDays" min="2" max="'+R.MAX_DAYS+'" value="'+homeworkDays(t,today)+'" inputmode="numeric" aria-label="숙제 반복 일수"><span>일 동안 매일</span></label>'+
        '<p class="vz-plan-help">매일 숙제 목표로 들어가요. 체크해도 숙제 완료는 따로 정해요.</p>',
      box=>{count=Number(box.querySelector('[name=homeworkDays]').value);
        return db=>R.create(db,{titles:[t.title||'숙제'],days:count,today,uid:V.uid,source:'homework',sourceId:t.id,songId:t.songId||''});});
      saved(edit,()=>'오늘부터 '+count+'일 동안 숙제를 매일 반복해요.');
    };
  });
};
/** Read the repeat choice from the plan form: null when not repeating. */
V.routineChoice=form=>{
  if(!form.repeat?.checked)return null;
  const n=Number(form.repeatDays.value);
  if(!Number.isInteger(n)||n<2||n>R.MAX_DAYS)throw Error('반복 일수는 2~'+R.MAX_DAYS+'일로 정해 주세요.');
  return n;
};
/** After a check: a small, non-blocking offer (6 s) to add real minutes or recordings. Ignoring it keeps a plain check. */
V.goalPerformanceOffer=goalId=>{
  const goal=(V.db.dailyGoals||[]).find(g=>g?.id===goalId);if(!goal||goal.completed!==true)return;
  document.querySelector('.toast')?.remove();
  const el=document.createElement('div');
  el.className='toast vz-perform-offer';el.setAttribute('role','status');
  el.innerHTML='<span>완료했어요</span><button type="button" data-perform-open>연습 시간·녹음 남기기</button>';
  el.querySelector('[data-perform-open]').onclick=()=>{el.remove();V.goalPerformanceSheet(goalId);};
  document.body.append(el);setTimeout(()=>el.remove(),6000);
};
/** Optional record after checking a goal: real minutes and today's recordings. Skipping keeps a plain check. */
V.goalPerformanceSheet=async goalId=>{
  const goal=(V.db.dailyGoals||[]).find(g=>g?.id===goalId);if(!goal||goal.completed!==true)return;
  const files=(await V.media.list().catch(()=>V.media.cached?.()||[])).filter(m=>V.media.dateOf(m)===goal.date&&!V.db.deleted?.media?.includes(m.id)).slice(0,12);
  const prev=goal.performance||{},other=R.otherMinutes(V.db,goal),picked=new Set(prev.mediaIds||[]);
  V.sheet({title:'수행 기록',body:'<form class="vz-perform" data-perform><p class="vz-perform-goal"><i class="ph ph-check-circle" aria-hidden="true"></i>'+esc(goal.title)+'</p>'+
      '<label class="field"><span>실제로 연습한 시간 <small>선택</small></span><span class="vz-perform-min"><input type="number" name="minutes" min="1" max="600" inputmode="numeric" aria-label="실제로 연습한 시간(분)" value="'+(prev.minutes??'')+'"><span>분</span></span></label>'+
      (other?'<p class="vz-plan-help">따라 하기 등에서 이 목표로 이미 '+Math.round(other)+'분이 기록됐어요. 그 시간은 다시 적지 않아도 돼요.</p>':'')+
      '<p class="vz-plan-help">적은 시간만 연습 시간에 더해져요. 녹음 길이는 자동으로 더하지 않아요.</p>'+
      (files.length?'<fieldset class="vz-plan-section"><legend>오늘 녹음 연결 <small>선택</small></legend><div class="vz-plan-options">'+files.map(m=>
        '<label class="vz-plan-option"><input type="checkbox" name="media" value="'+esc(m.id)+'"'+(picked.has(m.id)?' checked':'')+'><span class="vz-plan-check" aria-hidden="true"></span><span class="vz-plan-title">'+esc(V.media.label?.(m)||m.name||'녹음')+'</span></label>').join('')+'</div></fieldset>':'')+
      '<p role="alert" data-perform-error></p></form>',
    foot:'<button type="button" class="btn block vz-home-primary-button" data-save>기록 저장</button>',
    onMount:(el,close)=>{
      el.classList.add('vz-plan-sheet');
      const form=el.querySelector('[data-perform]'),foot=el.parentNode;
      foot.querySelector('[data-save]').onclick=()=>{
        try{
          const minutes=form.minutes.value.trim()||null;
          if(minutes!=null&&!(Number(minutes)>0&&Number(minutes)<=600))throw Error('연습 시간은 1~600분으로 적어 주세요.');
          const mediaIds=[...form.querySelectorAll('[name=media]:checked')].map(x=>x.value);
          const songId=files.find(m=>mediaIds.includes(m.id)&&m.songId)?.songId||'';
          if(!V.change(db=>R.perform(db,goalId,{minutes,mediaIds,songId}),{silent:true}))throw Error('기록을 저장하지 못했어요. 다시 시도해 주세요.');
          close();V.softRender?.();V.toast(minutes?'연습 '+minutes+'분을 기록했어요.':'수행 기록을 저장했어요.');
        }catch(e){el.querySelector('[data-perform-error]').textContent=e.message;}
      };
    }});
};
})();
