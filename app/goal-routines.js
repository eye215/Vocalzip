/* 반복 연습 목표 (신규 2, Phase 09·11·17).
 * A routine is "this goal every day for N days". Its days are written as ordinary dailyGoals (id routine.id+':'+date),
 * so home, progress and cross-device merge keep working unchanged. Edits and endings change only today's
 * unfinished goal and later days: past goals and completed checks stay as they were (decided 2026-11-11).
 * Completion may optionally carry the minutes really practised and today's recordings. Only typed minutes count as
 * practice time (one practice record per goal, so re-saving updates instead of adding); recording length is never
 * added. Homework goals link the session to the assignment without marking the assignment done. */
(function(root,factory){
  const api=factory();
  root.VzipGoalRoutines=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const shift=(date,days)=>{const [y,m,d]=date.split('-').map(Number),at=new Date(y,m-1,d,12);at.setDate(at.getDate()+days);return at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate());};
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const MAX_DAYS=60;
const routines=db=>(db.practicePlans||[]).filter(p=>p&&p.kind==='routine');
const goalsOf=(db,id)=>(db.dailyGoals||[]).filter(g=>g&&g.sourceId===id).sort((a,b)=>a.date.localeCompare(b.date));
function title(v){const t=String(v??'').trim().replace(/\s+/g,' ');if(!t||t.length>200)throw Error('목표 내용을 1~200자로 적어 주세요.');return t;}
function days(v){const n=Number(v);if(!Number.isInteger(n)||n<2||n>MAX_DAYS)throw Error('반복 일수는 2~'+MAX_DAYS+'일로 정해 주세요.');return n;}

/** Create one routine per title, starting today; writes its daily goals. Returns the routine ids. */
function create(db,{titles,days:count,today,uid,now=Date.now()}){
  if(!isDate(today))throw Error('날짜를 확인해 주세요.');
  const list=(Array.isArray(titles)?titles:[titles]).map(title),n=days(count);
  db.practicePlans||=[];db.dailyGoals||=[];
  return list.map(t=>{
    const id='routine:'+uid();
    if(db.practicePlans.some(p=>p.id===id))throw Error('목표 ID가 겹쳤어요. 다시 시도해 주세요.');
    db.practicePlans.push({id,kind:'routine',title:t,days:n,startDate:today,endDate:shift(today,n-1),created:now,archived:false,changes:[]});
    for(let i=0;i<n;i++){
      const date=shift(today,i);
      if(db.dailyGoals.some(g=>g.id===id+':'+date))continue;
      db.dailyGoals.push({id:id+':'+date,date,title:t,source:'personal',sourceId:id,routine:true,completed:false,
        order:db.dailyGoals.filter(g=>g.date===date).length,created:now});
    }
    return id;
  });
}
/** Rename from today on. Past days and completed goals keep the title they were done under. */
function rename(db,id,next,today,now=Date.now()){
  const r=routines(db).find(p=>p.id===id&&!p.archived);if(!r)return false;
  const t=title(next);if(t===r.title)return true;
  for(const g of goalsOf(db,id))if(g.date>=today&&g.completed!==true)g.title=t;
  r.changes=[...(r.changes||[]),{from:today,title:t,before:r.title,at:now}];r.title=t;
  return true;
}
/** End the routine: today's unfinished goal and later days are removed; past days and completed checks stay. */
function end(db,id,today,now=Date.now()){
  const r=routines(db).find(p=>p.id===id&&!p.archived);if(!r)return false;
  db.dailyGoals=(db.dailyGoals||[]).filter(g=>g?.sourceId!==id||g.date<today||g.completed===true);
  r.archived=true;r.archivedAt=now;r.endedOn=today;
  return true;
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
/** Save the optional performance of a completed goal. minutes: null or 1..600; mediaIds: today's recordings. */
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
    if(old)Object.assign(old,{minutes:0,manualMinutes:0,mediaIds:ids,updatedAt:now});
    return true;
  }
  const homework=goal.source==='homework'&&goal.sourceId,song=goal.songId||songId||'';
  const row={...old,id,date:goal.date,minutes:mins,manualMinutes:mins,practiceTimeSource:'goal',practiceMode:song?'song':'training',songId:song,
    mediaIds:ids,memo:'[목표] '+goal.title,goalId:goal.id,goalSource:goal.source||'personal',
    completed:homework?[goal.sourceId]:[],assignmentReps:homework?{[goal.sourceId]:1}:{},assignmentNotes:old?.assignmentNotes||{},
    technique:old?.technique||[],created:old?.created||now,updatedAt:now};
  if(at<0)db.practices.push(row);else db.practices[at]=row;
  return true;
}
return {MAX_DAYS,shift,routines,goalsOf,create,rename,end,progress,perform,otherMinutes,practiceId};
});

/* UI: routine section inside 오늘의 목표 sheet + optional 수행 기록 sheet after a goal is checked. */
(()=>{
'use strict';
if(typeof window==="undefined")return;
const V=window.VZ,R=window.VzipGoalRoutines;
if(!V||!R||typeof document==='undefined')return;
const esc=V.esc;
V.goalRoutines=R;
/** Markup for the plan sheet: repeat toggle for new personal goals + active routines with 고치기/끝내기. */
V.routineFields=()=>{
  const today=V.today(),active=R.routines(V.db).filter(r=>!r.archived);
  return '<div class="vz-routine-new"><label class="vz-routine-toggle"><input type="checkbox" name="repeat"><span>매일 반복</span></label>'+
    '<label class="vz-routine-days" data-routine-days hidden><input type="number" name="repeatDays" min="2" max="'+R.MAX_DAYS+'" value="7" inputmode="numeric" aria-label="반복 일수"><span>일 동안</span></label></div>'+
    (active.length?'<fieldset class="vz-plan-section vz-routines"><legend>반복 중인 목표</legend>'+active.map(r=>{const p=R.progress(V.db,r.id,today);
      return '<div class="vz-routine" data-routine="'+esc(r.id)+'"><span class="vz-routine-main"><strong>'+esc(r.title)+'</strong><small>'+p.done+'/'+p.total+'일 완료 · '+esc(r.endDate.slice(5).replace('-','.'))+'까지</small></span>'+
        '<button type="button" class="icon-btn" data-routine-edit aria-label="'+esc(r.title)+' 고치기"><i class="ph ph-pencil-simple"></i></button>'+
        '<button type="button" class="icon-btn" data-routine-end aria-label="'+esc(r.title)+' 끝내기"><i class="ph ph-stop-circle"></i></button></div>';}).join('')+
      '<p class="vz-plan-help">고치거나 끝내면 오늘 이후만 바뀌어요. 지난 기록과 완료 체크는 그대로예요.</p></fieldset>':'');
};
/** Wire the fields; onChange runs after a routine was renamed or ended (the caller reopens its sheet). */
V.routineBind=(el,onChange)=>{
  const box=el.querySelector('[name=repeat]'),daysEl=el.querySelector('[data-routine-days]');
  if(box)box.onchange=()=>{daysEl.hidden=!box.checked;};
  el.querySelectorAll('[data-routine]').forEach(row=>{
    const id=row.dataset.routine,r=R.routines(V.db).find(x=>x.id===id);if(!r)return;
    row.querySelector('[data-routine-edit]').onclick=()=>{
      const next=window.prompt('반복 목표 고치기 (오늘부터 적용)',r.title);if(next==null)return;
      const clean=next.trim();if(!clean||clean.length>200){V.toast('목표 내용을 1~200자로 적어 주세요.','error');return;}
      try{if(V.change(db=>{if(!R.rename(db,id,next,V.today()))throw Error('이 목표가 변경됐어요.');},{silent:true})){V.toast('오늘부터 바뀐 목표로 반복해요.');onChange?.();}}
      catch(e){V.toast(e.message,'error');}
    };
    row.querySelector('[data-routine-end]').onclick=async()=>{
      if(!await V.confirm('반복 끝내기','"'+r.title+'" 반복을 끝낼까요? 오늘 아직 안 한 목표와 내일부터의 목표가 빠지고, 지난 기록은 남아요.',{ok:'끝내기'}))return;
      if(V.change(db=>{if(!R.end(db,id,V.today()))throw Error('이 목표가 변경됐어요.');},{silent:true})){V.toast('반복을 끝냈어요.');onChange?.();}
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
