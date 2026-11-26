/* 오늘의 연습 (#/practice-set; it was 오늘 연습 세트): today's ONE set, step by step.
 * What is in the set and how its result is kept: app/daily-set-model.js (built-in groups by rotation, 숙제 · 놓친 레슨
 * 지적 first, the person's own steps after). The session, its wall clock and the goal rows are still
 * app/practice-set-model.js. Screens here: the list before starting — the ONE place the set is changed (a row's
 * sheet, + 연습 추가; 오늘's 편집 opens it) —, the doing screen for every step (app/daily-set-run.js) and the summary.
 * The running session lives in memory and, while it lasts, in this device's account-scoped storage (a UI draft like
 * the daily goal prompt), so leaving, a reload or a trip to the recorder resumes it; nothing is written to the synced
 * records until the summary is saved.
 * Clock: a built-in exercise counts only while it is being done on its screen (leaving pauses it). One of the person's
 * own steps keeps the wall clock as before — other screens, another app, a locked phone, a reload; only its pause
 * button stops it — and shows as a small pill elsewhere (app/practice-set-mini.js, V.practiceSetClock).
 * 따라 하기 (#/practice-set?guide=<key>[&song=<id>], VZ.guideHref; old #/guided-practice/<key> links redirect here) starts a
 * set of ONE step (VZ.guidedStepFor, app/guided-practice.js) — a set like any other: one at a time, never while the free
 * timer runs, saved through the same summary. */
(()=>{
'use strict';
const V=window.VZ,P=window.VzipPracticeSet,D=window.VzipDailySet;
if(!V||!P||!D||typeof document==='undefined')return;
const esc=V.esc;
const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'local';
const store=()=>window.VzipAccountScope?.storage||window.localStorage;
const KEY=()=>'vzip_practice_set_live:'+owner();
const copy=v=>JSON.parse(JSON.stringify(v));
const MIC_KEY=()=>'vzip_daily_set_mic:'+owner();
const DAYS='일월화수목금토';
let session=null,loadedFor='',draft=null,saved=null,timer=null,awake=false,alerted='',runner=null,lastDone='',autostart=false;
const watchers=new Set();
const routeName=()=>document.body.dataset.vzRoute||'';
const changed=()=>{for(const fn of watchers){try{fn();}catch(e){console.error(e);}}};

function load(){
  if(loadedFor===owner())return session;
  loadedFor=owner();session=null;
  try{session=P.restore(JSON.parse(store().getItem(KEY())||'null'));}catch{session=null;}
  // A built-in exercise that was cut off mid-way (the page was closed while it ran): only the time already counted stays.
  if(session?.running&&session.phase==='run'&&!wall(session.steps[session.index])){session.running=false;session.lastAt=0;persist();}
  // Reloaded (or reopened by iOS) while running: the time away is counted once, from the stored moment.
  if(session?.running){count(true);syncAwake();}
  return session;
}
function persist(){
  try{if(session)store().setItem(KEY(),JSON.stringify(session));else store().removeItem(KEY());}catch{}
}
function keepAwake(on){
  if(on===awake)return;awake=on;
  try{V.media?.keepAwake?.(on);}catch{}
}
/** The screen stays awake while the timer is on screen (the set, or the recorder opened from it). */
function syncAwake(){const route=routeName();keepAwake(route==='practice-set'?!!session&&session.phase==='run'&&!session.away:!!session?.running&&route==='record');}
/** Count the time since the last count. away: the timer was not being watched — the app is in front again after
 * another app, a locked screen or a reload, or the singer is on another screen. */
function count(away=false){
  if(!session?.running)return;
  const mark=session.overAway;
  P.tick(session,Date.now(),{away});
  // A set that comes back on another day is closed there: its summary saves under the day it was practised.
  if(away&&session.running&&session.date!==V.today())D.stop(session,Date.now());
  // Stored when more than the time changed: the time itself is the stored moment plus the clock.
  if(!session.running||session.overAway!==mark)persist();
  if(session.running)ensureTimer();
}
/** One clock for the whole app. It only draws: the time itself comes from the wall clock (P.tick), so a tick that
 * never ran (suspended page) loses nothing. */
function ensureTimer(){
  if(timer)return;
  timer=setInterval(()=>{
    if(!session?.running){clearInterval(timer);timer=null;return;}
    if(document.hidden)return;
    count(routeName()!=='practice-set');
    if(session.running){overAlert();changed();}else{syncAwake();paint();changed();}
  },1000);
}
function play(){P.play(session,Date.now());delete session.overAway;persist();syncAwake();ensureTimer();changed();}
function pause(){if(!session)return;P.pause(session,Date.now());delete session.overAway;persist();syncAwake();changed();}
/** Back in front: count the stretch away in one piece and redraw. Leaving only stores the moment. */
function front(){
  if(!session?.running||loadedFor!==owner())return;
  if(document.hidden){P.tick(session,Date.now());persist();return;}
  count(true);syncAwake();paint();changed();
}
document.addEventListener('visibilitychange',front);
// Another screen: the clock goes on; the screen is only kept awake where the timer itself is on screen.
window.addEventListener('hashchange',()=>setTimeout(syncAwake,0));
window.addEventListener('pageshow',e=>{if(e.persisted)front();});
window.addEventListener('pagehide',()=>{if(session?.running){P.tick(session,Date.now());persist();}});
// Signing out pauses the set: time in a signed-out app is not practice.
window.VzipAccountScope?.beforeLeave?.(()=>{runner?.destroy();runner=null;if(session?.running)pause();session=null;loadedFor='';draft=null;saved=null;keepAwake(false);changed();});


const total=steps=>D.totalMinutes(steps);
const songTitle=id=>V.songTitle?.(id)||V.song?.(id)?.title||'';
const shortTitle=D.shortTitle,kindLabel=D.labelOf;
/** A built-in exercise counts only on its own screen; the person's own step keeps the wall clock. */
const wall=st=>D.modeOf(st)==='free';
function recentSongId(){
  try{const a=V.songActivity?.(V.media?.cached?.()||[]);if(a){const id=[...a.keys()].filter(id=>V.song(id)).sort((x,y)=>a.get(y).localeCompare(a.get(x)))[0];if(id)return id;}}catch{}
  return '';
}
/** Today's set (app/daily-set-model.js build). own: the person's steps as edited on the list. */
/** Today's list as last changed on the set screen (this device only; another day starts from the saved set). */
const OWN_KEY=()=>'vzip_daily_set_own:'+owner();
function todayOwn(today){try{const v=JSON.parse(store().getItem(OWN_KEY())||'null');return v&&v.date===today&&Array.isArray(v.own)?v.own:null;}catch{return null;}}
function saveTodayOwn(date,own){try{store().setItem(OWN_KEY(),JSON.stringify({date,own}));}catch{}}
function fresh(own){
  const today=V.today();own||=todayOwn(today);
  // 내 로드맵's focus (what the recordings show to fix) goes first in its groups (app/roadmap.js).
  let focus=null;try{focus=V.roadmap?.()?.focus||null;}catch{}
  const built=D.build(V.db,{today,recentSongId:recentSongId(),...(own?{own}:{}),...(focus?.length?{focus}:{})});
  const slot=built.template?.slot||'';
  return {today,steps:built.steps,own:built.own,base:built.base,slot,prefs:built.prefs};
}
/* Today against the daily target comes from the shared helper (app/today-practice.js: VZ.todayPractice,
 * VZ.todayPracticeText). Without it nothing extra is shown. Only saved minutes count there. */
function todayOf(date){
  if(date!==V.today())return null;
  try{const t=V.todayPractice?.(date);return t&&Number.isFinite(Number(t.minutes))?{minutes:Number(t.minutes),targetMinutes:Number(t.targetMinutes)>0?Number(t.targetMinutes):null,percent:t.percent??null}:null;}catch(e){console.error(e);return null;}
}
const plus=(t,add)=>{const minutes=Math.round(t.minutes+add);return {minutes,targetMinutes:t.targetMinutes,percent:t.targetMinutes?Math.round(minutes/t.targetMinutes*100):null};};
function todayText(t){
  try{const text=V.todayPracticeText?.(t);if(text)return String(text);}catch(e){console.error(e);}
  return t.targetMinutes?'오늘 '+t.minutes+'분 / 목표 '+t.targetMinutes+'분 · '+t.percent+'%':'오늘 '+t.minutes+'분 · 목표 없음';
}
/** 오늘 › 오늘 연습's 오늘의 연습 part: {state 'new'|'live'|'summary'|'done', title, line, label, items (timeline), done, total,
 * minutes, button}. Null when nothing can be built. Reading it writes nothing. */
V.practiceSetEntry=()=>{
  try{
    const s=load(),title='오늘의 연습';
    if(s&&(s.phase==='summary'||s.date!==V.today())){
      const items=D.timeline(s.steps,{...s,phase:'summary'}),n=items.filter(x=>x.state!=='left').length;
      return {state:'summary',title,line:'시간을 확인하고 저장해요',label:'오늘의 연습 기록 저장하기',items,done:n,total:items.length,minutes:total(s.steps),button:'기록 저장하기'};
    }
    if(s){
      const items=D.timeline(s.steps,s),p=D.progress(s),now=shortTitle(s.steps[s.index]);
      return {state:'live',title,line:p.done+' / '+p.total+' · 약 '+total(s.steps)+'분',label:'오늘의 연습 이어서 하기, '+p.done+' / '+p.total+', 다음 '+now,items,done:p.done,total:p.total,minutes:total(s.steps),button:'이어서 하기 · '+now};
    }
    // A 따라 하기 (a set of one step) is not today's set: the card still offers the set itself.
    const run=D.runsOn(V.db,V.today()).filter(r=>!D.isGuideRun(r)).at(-1);
    if(run){
      // Under a minute is said in seconds ("40초"), not rounded to "0분" (2026-11-25: a 30-second measure read as 0분).
      const timeOf=x=>{const sec=Math.round(Number(x.seconds??Number(x.minutes)*60)||0);return sec>0&&sec<60?sec+'초':Math.round(Number(x.minutes)||sec/60)+'분';};
      const items=run.dailySet.items.map(x=>({id:x.id,title:shortTitle(x),label:D.labelOf(x),minutes:Math.round(x.minutes),time:timeOf(x),mic:!!x.mic,state:x.state==='done'?'done':x.state==='skipped'?'skipped':'left'}));
      const n=items.filter(x=>x.state==='done').length,minutes=Math.round(Number(run.dailySet.minutes??run.manualMinutes??run.minutes)||0);
      // Stopped part-way and saved: said as it is, not as finished.
      const said=items.some(x=>x.state==='left')?n+' / '+items.length+' · '+minutes+'분':'오늘 연습 끝 · '+minutes+'분';
      return {state:'done',title,line:said,label:'오늘의 연습, '+said+', 한 번 더 하기',items,done:n,total:items.length,minutes,button:'한 번 더 하기'};
    }
    const f=fresh();if(!f.steps.length)return null;
    const items=D.timeline(f.steps),minutes=total(f.steps),first=shortTitle(f.steps[0]);
    return {state:'new',title,line:f.steps.length+'개 · 약 '+minutes+'분',label:'오늘의 연습 시작하기, '+f.steps.length+'개 약 '+minutes+'분, 처음 '+first,items,done:0,total:f.steps.length,minutes,button:'시작하기 · '+first};
  }catch(error){console.error(error);return null;}
};
/** Start today's set right away (the card's one button) or carry on with the one in hand. */
function startNow(steps,date){
  // One clock at a time: 타이머만 켜기 (app/free-timer.js) would count the same minutes again.
  if(V.freeTimer?.running?.())throw Error('타이머가 돌아가는 중이에요. 오늘 연습에서 타이머를 멈춘 뒤에 시작해 주세요.');
  session=P.start(steps,{id:V.uid(),date,now:Date.now()});loadedFor=owner();draft=null;alerted='';saved=null;lastDone='';autostart=true;
  persist();changed();
}
V.dailySet={
  /** The card's button: 시작하기 / 이어서 하기 / 기록 저장하기 / 한 번 더 하기. */
  go(){
    load();
    if(!session){
      // The free timer runs: said where the button was (the card shows the Error's message).
      if(V.freeTimer?.running?.())throw Error('타이머가 돌아가는 중이에요. 타이머를 멈춘 뒤에 시작해 주세요.');
      try{const f=fresh();if(!f.steps.length)return;startNow(f.steps,f.today);}catch(error){console.error(error);V.toast('오늘의 연습을 시작하지 못했어요.','error');return;}
    }
    if(routeName()==='practice-set')paint();else V.nav('#/practice-set');
  },
  /** 편집: the list of today's set is where it is changed. */
  pick(){V.nav('#/practice-set');}
};
/** What the small timer on other screens shows: null unless one of the person's own steps is in hand (running or
 * paused) in today's set — a built-in exercise is never timed away from its screen.
 * seconds/target are for the current step; left<0 means the step is over its planned time. */
V.practiceSetClock={
  state(){
    try{
      const s=load();
      if(!s||s.phase!=='run'||s.date!==V.today())return null;
      const st=s.steps[s.index],seconds=P.elapsedNow(s,Date.now()),target=st.minutes*60;
      if(!wall(st)||!(s.running||s.away||st.elapsed>0))return null;
      return {id:s.id,index:s.index,total:s.steps.length,title:shortTitle(st),running:s.running,away:!!s.away,seconds,target,left:target-seconds,
        text:countdown(target-seconds)};
    }catch(error){console.error(error);return null;}
  },
  /** The pause button: the only thing that stops the clock. */
  toggle(){
    if(!session||session.phase!=='run'||session.away||!wall(session.steps[session.index]))return;
    if(session.running)pause();else play();
    paint();
  },
  watch(fn){watchers.add(fn);return ()=>watchers.delete(fn);}
};

/* ---------- 시작 전: 오늘 할 연습 — the ONE place to change the set ----------
 * Every change is made on this list and kept at once (no 고르기 sheet, no 기억하기 choice):
 *   a row → its sheet. A built-in exercise: which of its group take turns, or rest the group. One of the person's own
 *   steps: 시간, 위로/아래로, 기본 연습 대신 (a 그룹 대신 tag), 빼기. 숙제 · 레슨 지적: said, not edited.
 *   + 연습 추가 → one sheet: a group that rests (다시 넣기), today's goals, 웜업, 녹음, 곡 구간, 연습 전후 30초 녹음.
 * Kept where it always was: built-in choices in the 고르기 row (app/daily-set-model.js savePrefs); the person's own
 * steps as the template of the set in use (a 요일 세트 kept from before on its day, else 기본 — P.saveTemplate) for the
 * days to come, and today's exact list (a removed goal, each step's minutes) as a draft on this device for today. */
const micBadge='<span class="pset-badge"><i class="ph ph-microphone" aria-hidden="true"></i><span class="pset-sr">마이크 사용</span></span>';
const movable=()=>draft.own.filter(s=>!s.lead&&!s.replaces);
function redraw(){const f=fresh(draft.own);draft.steps=f.steps;draft.own=f.own;paint();}
/** Keep the person's own steps: today's list exactly (this device), the template for the days to come (synced). */
function keepOwn(own){
  const slot=draft.slot||'default',base=draft.base;
  draft.own=P.normalize(own);
  const same=JSON.stringify(P.templateFrom(draft.own,base))===JSON.stringify(P.templateFrom(draft.ownBase,base));
  const exists=(V.db.practicePlans||[]).some(p=>p?.id===P.templateId(slot));
  if((!same||exists)&&!V.change(db=>{P.saveTemplate(db,slot,draft.own,base);},{silent:true})){V.toast('저장하지 못했어요. 다시 시도해 주세요.','error');return false;}
  saveTodayOwn(draft.today,draft.own);redraw();changed();return true;
}
/** Keep the built-in choices (the 고르기 row) and build the list again. */
function keepPrefs(next,toast=''){
  if(!V.change(db=>{D.savePrefs(db,next);},{silent:true})){V.toast('저장하지 못했어요. 다시 시도해 주세요.','error');return false;}
  if(draft)redraw();else paint();
  changed();if(toast)V.toast(toast);return true;
}
function planHtml(){
  const steps=draft.steps,own=new Set(draft.own.map(s=>s.id)),day=DAYS[P.weekday(draft.today)];
  const row=s=>{
    const mine=own.has(s.id),edit=mine||s.kind==='exercise'||s.kind==='take';
    const copy='<span class="pset-row-copy"><small>'+esc(kindLabel(s))+(s.optional?' · 선택':'')+(s.focus?'<span class="pset-focus-tag">추천</span>':'')+'</small><strong>'+esc(shortTitle(s))+'</strong>'+
      (s.segmentStart!=null?'<em>구간 '+esc(P.segmentLabel(s.segmentStart,s.segmentEnd))+'</em>':'')+(D.applyInfo?.(s)?'<em data-room-task="'+esc(s.roomTask)+'">'+esc(D.applyInfo(s).name)+'</em>':'')+(s.focus?'<em class="pset-why" data-focus-why>'+esc(s.focus.why)+'</em>':'')+'</span>'+
      '<span class="pset-fixed">'+(s.mic?micBadge:'')+'<b>'+s.minutes+'분</b>'+(edit?'<i class="ph ph-caret-right" aria-hidden="true"></i>':'')+'</span>';
    return '<li class="pset-row'+(mine?'':' is-fixed')+'" data-step="'+esc(s.id)+'" data-kind="'+esc(s.kind)+'">'+
      (edit?'<button type="button" class="pset-row-btn" data-edit aria-label="'+esc(shortTitle(s))+', '+s.minutes+'분, 바꾸기">'+copy+'</button>':copy)+'</li>';
  };
  return '<section class="pset pset-plan" aria-labelledby="pset-plan-title">'+
    '<div class="pset-plan-head"><p class="pset-help" id="pset-plan-title">위에서부터 차례로 해요. 줄을 누르면 바꾸거나 뺄 수 있어요.</p><span class="pset-total" data-pset-total>'+steps.length+'개 · 약 '+total(steps)+'분</span></div>'+
    (draft.slot&&draft.slot!=='default'?'<p class="pset-help pset-slot" data-pset-slot>'+day+'요일에 쓰는 구성이에요. 여기서 고치면 '+day+'요일 구성이 바뀌어요.</p>':'')+
    (steps.length?'<ol class="pset-list">'+steps.map(row).join('')+'</ol>':'<p class="pset-empty">연습할 항목이 없어요. 아래에서 연습을 추가해 주세요.</p>')+
    '<button type="button" class="pset-add-btn" data-add><i class="ph ph-plus" aria-hidden="true"></i>연습 추가</button>'+
    '<p role="alert" class="pset-error" data-pset-error></p>'+
    '<button type="button" class="btn block pset-start" data-start'+(steps.length?'':' disabled')+'><i class="ph ph-play" aria-hidden="true"></i>시작하기</button></section>';
}
function bindPlan(host){
  host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>rowSheet(b.closest('.pset-row').dataset.step));
  host.querySelector('[data-add]').onclick=addSheet;
  host.querySelector('[data-start]').onclick=()=>{
    const error=host.querySelector('[data-pset-error]');error.textContent='';
    try{const steps=draft.steps,date=draft.today;P.start(steps,{id:'check',date,now:Date.now()});startNow(steps,date);paint();}
    catch(e){error.textContent=e.message;}
  };
}
/** The sheet of one row: what can be changed about that step, nothing else. */
function rowSheet(id){
  const st=draft?.steps.find(s=>s.id===id);if(!st)return;
  if(st.kind==='exercise')return groupSheet(st);
  if(st.kind==='take')return recordSheet();
  if(draft.own.some(s=>s.id===id))return ownSheet(st);
}
/** A built-in exercise: which exercises of its group take turns (one a day), or rest the whole group. */
function groupSheet(st){
  const pf=D.prefs(V.db),g=D.groupOf(st.group);
  V.sheet({title:g.title,
    body:'<form id="pset-group" class="pset-group-form" data-group-sheet="'+esc(g.id)+'">'+
      (st.focus?'<p class="pset-focus" data-focus>추천 · '+esc(st.focus.why)+'<br>오늘은 이 연습으로 '+esc(st.focus.title)+' '+st.focus.step+'단계를 재요.</p>':'')+
      '<p class="pset-help">켜 둔 연습이 하루에 하나씩 돌아가며 나와요.</p><div class="dset-opts">'+
      D.exercisesOf(g.id).map(e=>'<label class="dset-opt"><input type="checkbox" name="ex" value="'+e.id+'"'+(pf.off[e.id]?'':' checked')+'><span class="dset-check" aria-hidden="true"></span>'+
        '<span class="dset-opt-copy"><strong>'+esc(e.title)+'</strong><small>'+e.minutes+'분'+(e.mic?' · 마이크':'')+(e.id===st.exercise?' · 오늘':'')+'</small></span></label>').join('')+'</div>'+
      '<p role="alert" class="pset-error" data-sheet-error></p>'+
      '<button type="button" class="pset-chip pset-rest" data-rest><i class="ph ph-moon" aria-hidden="true"></i>'+esc(g.title)+' 쉬기</button></form>',
    foot:'<button type="submit" form="pset-group" class="btn block">저장</button>',
    onMount:(el,close)=>{
      const form=el.querySelector('form'),error=form.querySelector('[data-sheet-error]');
      form.querySelector('[data-rest]').onclick=()=>{if(keepPrefs({...pf,groupsOff:{...pf.groupsOff,[g.id]:true}},g.title+'을 쉬어요. 연습 추가에서 다시 넣을 수 있어요.'))close();};
      form.onsubmit=e=>{
        e.preventDefault();const boxes=[...form.querySelectorAll('[name=ex]')];
        if(!boxes.some(b=>b.checked)){error.textContent='하나는 켜 두세요. 다 쉬려면 ‘'+g.title+' 쉬기’를 눌러요.';return;}
        const off={...pf.off};for(const b of boxes){if(b.checked)delete off[b.value];else off[b.value]=true;}
        if(keepPrefs({...pf,off}))close();
      };
    }});
}
/** One of the person's own steps: 시간, 위로/아래로, 기본 연습 대신, 빼기. */
function ownSheet(st){
  const pf=D.prefs(V.db),key=D.ownKey(V.db,st),list=movable(),k=list.findIndex(s=>s.id===st.id);
  V.sheet({title:shortTitle(st),
    body:'<form id="pset-own" class="pset-own-form" data-own-sheet><p class="pset-help">'+esc(kindLabel(st))+(st.segmentStart!=null?' · 구간 '+esc(P.segmentLabel(st.segmentStart,st.segmentEnd)):'')+'</p>'+
      '<div class="pset-stepper"><button type="button" class="pset-icon" data-less aria-label="1분 줄이기"><i class="ph ph-minus" aria-hidden="true"></i></button>'+
        '<label class="pset-min"><input type="number" inputmode="numeric" min="1" max="120" value="'+esc(st.minutes)+'" name="minutes" aria-label="시간(분)"><span>분</span></label>'+
        '<button type="button" class="pset-icon" data-more aria-label="1분 늘리기"><i class="ph ph-plus" aria-hidden="true"></i></button></div>'+
      (k>=0&&list.length>1?'<div class="pset-move"><button type="button" class="pset-chip" data-up'+(k===0?' disabled':'')+'><i class="ph ph-arrow-up" aria-hidden="true"></i>위로</button>'+
        '<button type="button" class="pset-chip" data-down'+(k===list.length-1?' disabled':'')+'><i class="ph ph-arrow-down" aria-hidden="true"></i>아래로</button></div>':'')+
      (key?'<label class="field"><span>기본 연습 대신 하기</span><select name="tag" aria-label="기본 연습 대신 하기"><option value="">기본 연습 뒤에 하기</option>'+
        D.GROUPS.map(g=>'<option value="'+g.id+'"'+(pf.replace[key]===g.id?' selected':'')+'>'+esc(g.title)+' 대신</option>').join('')+'</select></label>':'')+
      '<p role="alert" class="pset-error" data-sheet-error></p>'+
      '<button type="button" class="pset-chip pset-remove" data-remove><i class="ph ph-trash" aria-hidden="true"></i>빼기</button></form>',
    foot:'<button type="submit" form="pset-own" class="btn block">저장</button>',
    onMount:(el,close)=>{
      const form=el.querySelector('form'),input=form.minutes,error=form.querySelector('[data-sheet-error]');
      const step=n=>{input.value=String(Math.max(1,Math.min(120,(Math.round(Number(input.value))||st.minutes)+n)));};
      form.querySelector('[data-less]').onclick=()=>step(-1);form.querySelector('[data-more]').onclick=()=>step(1);
      const at=()=>draft.own.findIndex(s=>s.id===st.id);
      const move=d=>{const other=list[k+d];if(!other)return;const own=draft.own.slice(),a=at(),b=own.findIndex(s=>s.id===other.id);[own[a],own[b]]=[own[b],own[a]];if(keepOwn(own))close();};
      form.querySelector('[data-up]')?.addEventListener('click',()=>move(-1));
      form.querySelector('[data-down]')?.addEventListener('click',()=>move(1));
      // 곡에 적용하기 takes its song's 녹음 with it (the two came in together).
      form.querySelector('[data-remove]').onclick=()=>{const own=draft.own.filter(s=>s.id!==st.id&&!(st.apply&&s.kind==='record'&&s.songId===st.songId));if(keepOwn(own)){close();V.toast('뺐어요.');}};
      form.onsubmit=e=>{
        e.preventDefault();const n=Math.round(Number(input.value));
        if(!(n>=1&&n<=120)){error.textContent='시간은 1~120분으로 정해 주세요.';input.focus();return;}
        const tag=form.tag?.value??null;
        if(key&&tag!==null&&tag!==(pf.replace[key]||'')){const replace={...pf.replace};if(tag)replace[key]=tag;else delete replace[key];if(!V.change(db=>{D.savePrefs(db,{...pf,replace});},{silent:true})){error.textContent='저장하지 못했어요.';return;}}
        const own=draft.own.map(s=>s.id===st.id?{...s,minutes:n}:s);
        if(keepOwn(own))close();
      };
    }});
}
/** 연습 전후 30초 녹음: on with a song (and where to sing), or off. */
function recordSheet(){
  const pf=D.prefs(V.db),songs=(V.db.songs||[]).filter(x=>x&&!(V.db.deleted?.songs||[]).includes(x.id)&&!x.archived);
  V.sheet({title:'연습 전후 30초 녹음',
    body:'<form id="pset-rec" class="pset-rec-form" data-rec-sheet><p class="pset-help">같은 구절을 처음과 끝에 불러 두고, 끝나면 가려 놓고 비교해 들어요. 녹음 길이는 연습 시간에 더하지 않아요.</p>'+
      (songs.length?'<label class="field"><span>부를 곡</span><select name="recordSong" aria-label="부를 곡"><option value="">곡 선택</option>'+songs.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===pf.recordSongId?' selected':'')+'>'+esc(V.songLabel?.(x)||x.title)+'</option>').join('')+'</select></label>'+
        '<label class="field"><span>부를 곳 <small>선택</small></span><input type="text" name="phrase" maxlength="80" value="'+esc(pf.phrase)+'" placeholder="예: 후렴 첫 두 줄"></label>':
        '<p class="pset-help">내 곡에 곡을 먼저 추가하면 쓸 수 있어요.</p>')+
      '<p role="alert" class="pset-error" data-sheet-error></p>'+(pf.recording?'<button type="button" class="pset-chip pset-remove" data-off><i class="ph ph-trash" aria-hidden="true"></i>전후 녹음 빼기</button>':'')+'</form>',
    foot:songs.length?'<button type="submit" form="pset-rec" class="btn block">'+(pf.recording?'저장':'넣기')+'</button>':'',
    onMount:(el,close)=>{
      const form=el.querySelector('form'),error=form.querySelector('[data-sheet-error]');
      form.querySelector('[data-off]')?.addEventListener('click',()=>{if(keepPrefs({...pf,recording:false}))close();});
      form.onsubmit=e=>{
        e.preventDefault();const id=form.recordSong?.value||'';
        if(!V.song(id)){error.textContent='녹음할 곡을 골라 주세요.';form.recordSong?.focus();return;}
        if(keepPrefs({...pf,recording:true,recordSongId:id,phrase:form.phrase?.value||''}))close();
      };
    }});
}
const parseTime=v=>{const t=String(v||'').trim();if(!t)return null;const m=t.match(/^(\d{1,3}):([0-5]\d)$/);const n=m?Number(m[1])*60+Number(m[2]):/^\d{1,4}$/.test(t)?Number(t):NaN;return Number.isFinite(n)?n:NaN;};
/** + 연습 추가: everything that can come into the set, in one sheet. */
function addSheet(){
  const pf=D.prefs(V.db),have=new Set(draft.own.map(s=>s.goalId).filter(Boolean)),kinds=new Set(draft.own.map(s=>s.kind));
  const goals=draft.base.filter(s=>s.kind==='goal'&&!have.has(s.goalId));
  const lastSong=[...draft.own].reverse().find(s=>s.songId)?.songId||recentSongId();
  const warm=draft.base.find(s=>s.kind==='warmup')||{kind:'warmup',title:'웜업 · 호흡과 발성',detail:'호흡과 발성',categoryLabel:'발성',tips:[]};
  const resting=[...D.GROUPS,D.SONG].filter(g=>pf.groupsOff[g.id]);
  const options=[...resting.map(g=>({key:'group:'+g.id,label:g.title,meta:'기본 연습 · 다시 넣기',group:g.id})),
    ...goals.map(s=>({key:'goal:'+s.goalId,label:s.title,meta:kindLabel(s),step:s})),
    ...(!kinds.has('warmup')?[{key:'warmup',label:warm.title,meta:'웜업 · 내 방식대로',step:warm}]:[]),
    ...(!kinds.has('record')&&lastSong&&V.song(lastSong)?[{key:'record',label:'녹음 · '+songTitle(lastSong),meta:'녹음 · 선택',step:{kind:'record',songId:lastSong,title:'녹음 · '+songTitle(lastSong),optional:true,minutes:3}}]:[]),
    ...(!pf.recording?[{key:'takes',label:'연습 전후 30초 녹음',meta:'처음과 끝에 같은 구절',takes:true}]:[])];
  V.sheet({title:'연습 추가',body:'<div class="pset-add-sheet">'+(options.length?'<div class="pset-add-list">'+options.map((o,i)=>
      '<button type="button" class="pset-add-option" data-option="'+i+'" data-key="'+esc(o.key)+'"><span><small>'+esc(o.meta)+'</small><strong>'+esc(o.label)+'</strong></span><i class="ph ph-plus" aria-hidden="true"></i></button>').join('')+'</div>':'')+
    '<form class="pset-song-form" data-song-form><h3>곡 구간</h3>'+V.songSelect('song',lastSong,{none:'곡 선택'})+
      '<div class="pset-song-grid"><label class="field"><span>시작 <small>분:초</small></span><input name="from" type="text" inputmode="numeric" placeholder="0:30" aria-label="구간 시작 (분:초)"></label>'+
      '<label class="field"><span>끝 <small>분:초</small></span><input name="to" type="text" inputmode="numeric" placeholder="1:10" aria-label="구간 끝 (분:초)"></label></div>'+
      '<label class="field"><span>시간(분)</span><input name="minutes" type="number" min="1" max="120" value="10" inputmode="numeric" aria-label="곡 구간 시간(분)"></label>'+
      '<p class="pset-help">구간을 비우면 곡 전체를 연습해요.</p><p role="alert" class="pset-error" data-song-error></p>'+
      '<button type="submit" class="btn secondary block">곡 구간 넣기</button></form></div>',
    onMount:(el,close)=>{
      el.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{
        const o=options[Number(b.dataset.option)];
        if(o.group){
          const groupsOff={...pf.groupsOff};delete groupsOff[o.group];
          // 곡 comes back as today's defaults give it (곡에 적용하기 and 녹음): today's own list starts again from the saved set.
          if(o.group===D.SONG.id){saveTodayOwn(draft.today,null);draft=null;}
          if(keepPrefs({...pf,groupsOff}))close();return;
        }
        if(o.takes){close();recordSheet();return;}
        if(keepOwn([...draft.own,{...o.step,id:undefined}]))close();
      });
      const form=el.querySelector('[data-song-form]');
      form.onsubmit=e=>{
        e.preventDefault();const error=form.querySelector('[data-song-error]');error.textContent='';
        const a=parseTime(form.from.value),b=parseTime(form.to.value),m=Math.round(Number(form.minutes.value));
        if(Number.isNaN(a)||Number.isNaN(b)||(a==null)!==(b==null)||a!=null&&b<=a){error.textContent='구간은 0:30처럼 적고, 끝이 시작보다 뒤여야 해요.';return;}
        if(!(m>=1&&m<=120)){error.textContent='시간은 1~120분으로 정해 주세요.';return;}
        const id=V.readSong(form,'song');if(id===null)return;if(!id||!V.song(id)){error.textContent='곡을 골라 주세요.';return;}
        const seg=a!=null?P.segmentLabel(a,b):'';
        const step={kind:'song',songId:id,title:'곡 구간 · '+songTitle(id)+(seg?' '+seg:''),minutes:m,added:true,...(seg?{segmentStart:a,segmentEnd:b}:{})};
        // A new song section goes before the closing recording.
        const own=draft.own.slice(),at=own.findIndex(s=>s.kind==='record');if(at<0)own.push(step);else own.splice(at,0,step);
        if(keepOwn(own))close();
      };
    }});
}

/* ---------- 진행 중 ---------- */
const clock=sec=>{sec=Math.max(0,Math.floor(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
/** Time left on a step as the timer shows it: 2:00 … 0:00, then +0:01 once the planned time has passed. */
const countdown=left=>(left<0?'+':'')+clock(Math.abs(left<0?Math.floor(-left):Math.ceil(left)));
const span=sec=>{sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return h?h+'시간'+(m?' '+m+'분':''):m?m+'분':sec+'초';};
const took=sec=>{sec=Math.max(0,Math.round(sec));const m=Math.floor(sec/60),s=sec%60;return m?m+'분'+(s?' '+s+'초':''):s+'초';};
/** One buzz when one of the person's own steps passes its planned time. */
function overAlert(){
  if(!session?.running)return;
  const st=session.steps[session.index];
  if(st.elapsed>st.minutes*60&&alerted!==session.id+':'+st.id){alerted=session.id+':'+st.id;try{navigator.vibrate?.(200);}catch{}}
}
/** The comfortable range for note exercises: measured from the recordings when there are enough, else the 보이스 체크
 * reference notes, else the answer given once (kept in 고르기's row). null: the doing screen asks. */
let measured;
function measuredRange(){
  if(measured!==undefined)return measured;
  measured=null;
  try{
    const R=window.VzipGrowthRange,items=V.media?.cached?.()||[];
    const usual=R&&V.growthDataset&&items.length?R.build(V.growthDataset(items).forRange(),{today:V.today()})?.usual:null;
    // The usual main range can span two octaves: exercises stay in its lower, comfortable part.
    if(usual)measured={low:usual.low.midi+2,high:Math.min(usual.high.midi-2,usual.low.midi+12)};
  }catch(e){console.error(e);}
  return measured;
}
const comfortNow=()=>D.comfort({measured:measuredRange(),voiceCheck:V.db.settings?.voiceCheck||null,asked:D.prefs(V.db).comfort});
function micKnown(){
  if(session?.mic)return session.mic;
  try{return store().getItem(MIC_KEY())==='ok'?'granted':'';}catch{return '';}
}
/** What the last step left, said on the next step's screen. */
function resultLine(st){
  const r=st.result||{},name=shortTitle(st);
  if(st.skipped)return name+' · 건너뛰었어요';
  if(r.mode==='hold'&&!r.timer&&Array.isArray(r.notes))return name+' · 음 '+r.notes.length+'개 중 '+r.notes.filter(n=>n.ok).length+'개 맞췄어요';
  if(r.mode==='take')return name+' · 저장했어요';
  const measured=window.VzipDailyMeasure?.resultWords?.(r);if(measured)return name+' · '+measured;
  return name+' · 끝';
}
/** A practice recording of the 30-second take: the same path as any practice recording (VZ.media.saveBlob), tagged
 * 트레이닝 so the song's growth numbers leave it out, with the song it was sung from. */
async function saveTake(st,res){
  const id=V.uid(),song=V.song?.(st.songId),d=new Date(),run=session?.id||'';
  const item={id,...(window.VzipAccountScope&&res.accountOwner?{accountOwner:res.accountOwner}:{}),
    name:(st.slot==='after'?'연습 후':'연습 전')+' · '+(song?.title||'오늘의 연습')+' '+(d.getMonth()+1)+'.'+d.getDate(),created:Date.now(),recordedDate:V.today(),dateSource:'recorded',
    type:res.type,source:'practice',origin:'daily-set',recordingCategory:'training',songId:song?st.songId:'',song:song?(V.songLabel?.(song)||song.title):'',
    blob:res.blob,durationSeconds:res.durationSeconds,waveform:res.waveform,dailySet:{v:1,run,slot:st.slot}};
  await V.media.saveBlob(item);res.releaseProtection?.();
  return id;
}
function helperHtml(st){
  const song=st.songId&&V.song(st.songId),seg=st.segmentStart!=null?P.segmentLabel(st.segmentStart,st.segmentEnd):'';
  let html='';
  if(st.kind==='warmup'||st.first)html+=(st.tips?.length?'<ul class="pset-tips">'+st.tips.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'')+(st.href?'<a class="pset-chip" href="'+esc(st.href)+'">열기</a>':'');
  if(song&&st.kind!=='next')html+='<p class="pset-song"><i class="ph ph-music-note" aria-hidden="true"></i><strong>'+esc(song.title)+'</strong>'+(seg?'<span>구간 '+esc(seg)+'</span>':'<span>전체</span>')+'</p>';
  if(song&&st.kind==='song'){
    // 곡에 적용하기 · 곡 구간: the song's own screen (악보 · MR · 녹음), and its 레슨 지적 when it has some to check while singing.
    let points=0;try{const M=window.VzipScorePointsModel;points=M?M.active(M.points(V.db,st.songId)).length:0;}catch{}
    html+='<p class="pset-links"><a class="pset-chip" href="#/song/'+encodeURIComponent(st.songId)+'" data-song-open><i class="ph ph-music-notes" aria-hidden="true"></i>곡 열기</a>'+
      (points?'<a class="pset-chip" href="#/song/'+encodeURIComponent(st.songId)+'" data-song-points><i class="ph ph-check-square" aria-hidden="true"></i>레슨 지적 '+points+'개 · 부르면서 체크</a>':'')+'</p>';
  }
  if(st.kind==='next'&&st.href)html+='<a class="pset-chip" href="'+esc(st.href)+'" data-point-open><i class="ph ph-music-notes" aria-hidden="true"></i>곡에서 지적 보기</a>';
  if(st.kind==='record'){
    const n=st.mediaIds.length;
    html+='<button type="button" class="btn secondary block pset-record" data-record><i class="ph ph-microphone" aria-hidden="true"></i>'+(n?'한 번 더 녹음하기':'녹음하기')+'</button>'+
      '<p class="pset-note" data-linked>'+(n?'녹음 '+n+'개를 이 단계에 연결했어요. ':'')+'녹음 길이는 연습 시간에 더하지 않아요.</p>';
  }
  if(song&&st.kind!=='next'&&(song.mrTracks||[]).some(x=>!x.deleted)&&V.renderSongMR)html+='<div class="pset-mr" data-mr-host></div>';
  return html;
}
function bindHelper(host,st){
  host.querySelector('[data-record]')?.addEventListener('click',()=>{
    st.openedAt=Date.now();persist();
    // The set keeps running while the singer records (real elapsed time, not the recording's length).
    V.nav('#/record'+(st.songId?'?song='+encodeURIComponent(st.songId):''));
  });
  const mr=host.querySelector('[data-mr-host]'),song=V.song(st.songId);
  if(mr&&song)try{V.renderSongMR(mr,song);}catch(e){console.error(e);}
}
function whyOf(st){
  const task=D.applyInfo?.(st);if(task)return task.text;
  if(st.why)return st.why;
  if(st.kind==='goal'){
    const g=(V.db.dailyGoals||[]).find(x=>x.id===st.goalId);
    return g?.recommendation?.reason||(st.source==='homework'?'마치면 오늘의 목표가 체크되고 숙제에 연습이 연결돼요':'마치면 오늘의 목표가 체크돼요');
  }
  return st.kind==='record'?'오늘 한 것을 한 번 남겨 두면 다음에 들어 볼 수 있어요':st.apply?'방금 푼 목과 숨을 그대로 곡에서 써 봐요':st.kind==='song'?'정한 구간을 천천히 반복해요':'';
}
const noteOf=st=>session.overAway===st.id?'<p class="pset-over-note" role="status" data-over-note><i class="ph ph-clock-countdown" aria-hidden="true"></i><span>다른 곳에 있는 동안 계획한 '+st.minutes+'분이 지났어요. 단계는 그대로 두었어요. 더 하거나 다음으로 넘어가요.</span></p>':'';
function linkRecordings(){
  let st=session?.steps[session.index];if(!st||st.kind!=='record'||!V.media?.list)return;
  const since=Number(st.openedAt)||session.startedAt;
  V.media.list().then(files=>{
    if(!session||session.steps[session.index]?.id!==st.id)return;
    st=session.steps[session.index];
    const gone=new Set(V.db.deleted?.media||[]);
    const found=files.filter(m=>m&&!gone.has(m.id)&&(Number(m.created)||0)>=since&&(!st.songId||m.songId===st.songId)).map(m=>String(m.id));
    const add=found.filter(id=>!st.mediaIds.includes(id));if(!add.length)return;
    st.mediaIds.push(...add);persist();
    if(document.querySelector('[data-pset-run]'))paint();
  }).catch(()=>{});
}
/** What the doing screen (app/daily-set-run.js) needs from the set: the clock, the answers it keeps, the next step. */
function runContext(){
  return {session,
    start(){if(session&&!session.running)play();},
    pause(){if(session?.running)pause();},
    elapsed:()=>P.elapsedNow(session,Date.now()),
    finish(state,result){
      const st=session.steps[session.index];
      D.finishItem(session,{state,result,now:Date.now()});lastDone=resultLine(st);
      if(session.phase==='run')session.steps[session.index].openedAt||=Date.now();
      persist();syncAwake();paint();changed();
    },
    redo(){delete session.steps[session.index].result;persist();},
    /** Keep what a step changed on itself (따라 하기: the seconds of the video watched, 타이머로 하기). */
    save(){if(session)persist();},
    stop(){D.stop(session,Date.now());persist();syncAwake();paint();changed();},
    exit(){
      // 따라 하기 goes back to where it was pressed. Left before any second was counted, nothing was practised: the set
      // of one step is not kept in hand (it would hold the clock for nothing).
      if(session?.steps.length===1&&session.steps[0].guide){
        const empty=!session.running&&!(P.elapsedNow(session,Date.now())>0);
        if(empty){session=null;persist();syncAwake();changed();}
        if(history.length>1)history.back();else V.nav('#/home');
        if(!empty)V.toast('오늘 안에 이어서 할 수 있어요.');
        return;
      }
      V.nav('#/home');V.toast('오늘 안에 이어서 할 수 있어요.');
    },
    comfort:comfortNow,
    saveComfort(c){return V.change(db=>{D.savePrefs(db,{...D.prefs(db),comfort:c});},{silent:true})?comfortNow():null;},
    mic:micKnown,
    setMic(value){session.mic=value;persist();try{if(value==='granted')store().setItem(MIC_KEY(),'ok');}catch{}},
    saveTake,helper:helperHtml,bindHelper,why:whyOf,note:noteOf,lastLine:()=>lastDone};
}
/** 곡에 적용하기 not started yet: its task is read again, so a 보이스 체크 done earlier in this set (목 상태 1–2)
 * turns it into the task done without singing. */
function refreshTask(st){
  if(!st?.roomTask||st.elapsed>0||st.done||st.skipped)return;
  const t=D.applyTask?.(V.db,session.date);if(!t||(t.key===st.roomTask&&t.why===st.roomWhy))return;
  st.roomTask=t.key;st.roomWhy=t.why;persist();
}
function mountRun(host){
  runner?.destroy();
  refreshTask(session.steps[session.index]);
  const st=session.steps[session.index],go=autostart;autostart=false;
  runner=V.dailySetRunner.mount(host.querySelector('[data-pset-run]'),runContext());
  // The step before was replaced under the finger: the one big button takes the focus it lost.
  if(!document.activeElement||document.activeElement===document.body)host.querySelector('[data-run-primary]')?.focus({preventScroll:true});
  // The tap that started the set also starts its first step when that step needs no sound or mic to begin.
  if(go&&['timed','breath','free'].includes(D.modeOf(st))&&!session.running)runner.begin();
}
/* A long stretch away (P.LONG_GAP_MS) is never counted by itself: the singer says how to count it. */
function awayHtml(){
  const a=P.awayInfo(session),left=Math.round(a.planned);
  const choice=(key,title,line)=>'<button type="button" class="pset-away-choice" data-away="'+key+'"><span><strong>'+title+'</strong><small>'+esc(line)+'</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>';
  return '<section class="pset pset-away" data-pset-away aria-labelledby="pset-away-title"><span class="pset-away-mark" aria-hidden="true"><i class="ph ph-clock-countdown"></i></span>'+
    '<h2 id="pset-away-title">오래 자리를 비웠어요</h2>'+
    '<p class="pset-help">‘'+esc(shortTitle(a.step))+'’ 타이머를 켜 둔 채 '+esc(span(a.seconds))+'이 지났어요. 이 시간을 어떻게 셀지 골라 주세요. 고르기 전에는 아무것도 기록하지 않아요.</p>'+
    '<div class="pset-away-list">'+
      (left>0?choice('planned','계획한 시간까지만 세기','계획한 '+a.step.minutes+'분까지 '+span(left)+'만 더해요'):'')+
      choice('all','지금까지 모두 세기',span(a.seconds)+'을 모두 더해요')+
      choice('none','세지 않기','자리를 비운 시간은 빼요')+'</div>'+
    '<p class="pset-note">타이머는 멈춰 두었어요. 고른 뒤에 이어서 할 수 있고, 시간은 저장하기 전에 고칠 수 있어요.</p></section>';
}
function bindAway(host){
  host.querySelectorAll('[data-away]').forEach(b=>b.onclick=()=>{
    P.resolveAway(session,b.dataset.away);persist();paint();changed();
    document.querySelector('[data-pset-run] [data-run-primary],.pset-summary [data-save]')?.focus();
  });
}

/* ---------- 요약·저장 ---------- */
const STATE={done:'완료',skipped:'건너뜀',left:'안 함'};
function resultText(r){
  const x=r.result||{};
  if(x.mode==='hold'&&!x.timer&&Array.isArray(x.notes))return '음 '+x.notes.length+'개 중 '+x.notes.filter(n=>n.ok).length+'개'+(x.accuracy!=null?' · 맞은 시간 '+x.accuracy+'%':'');
  if(x.mode==='hold'&&x.timer)return '타이머로 했어요';
  if(x.mode==='guide')return x.timer?'타이머로 했어요':'영상과 함께 했어요';
  if(x.mode==='breath'&&x.longestOut)return '가장 길게 '+x.longestOut+'초';
  return window.VzipDailyMeasure?.resultWords?.(x)||'';
}
function summaryHtml(){
  const s=session,rows=D.summary(s),stale=s.date!==V.today(),left=rows.some(r=>r.state==='left');
  return '<section class="pset pset-summary" aria-labelledby="pset-summary-title"><h2 id="pset-summary-title">오늘의 연습 정리</h2>'+
    '<p class="pset-help">'+(stale?esc(V.dateLabel?.(s.date)||s.date)+' 연습이에요. ':'')+'실제로 연습한 시간만 기록해요. 녹음 길이는 더하지 않아요.</p>'+
    '<ul class="pset-list pset-sum-list">'+rows.map((r,i)=>{const st=s.steps[i],extra=resultText(r);
      return '<li class="pset-row" data-step="'+esc(r.id)+'" data-state="'+r.state+'"'+(r.measured?' data-measured':'')+'><span class="pset-row-copy"><small>'+esc(r.label)+' · <b class="pset-state">'+STATE[r.state]+'</b></small><strong>'+esc(r.title)+'</strong>'+
        (extra?'<em>'+esc(extra)+'</em>':'')+
        (st.kind==='goal'?'<label class="pset-check"><input type="checkbox" data-done'+(r.done?' checked':'')+'><span>목표 완료로 체크</span></label>':'')+
        (r.mediaIds.length?'<em>녹음 '+r.mediaIds.length+'개 연결</em>':'')+'</span>'+
        (r.measured?'<span class="pset-fixed"><b data-sec="'+r.seconds+'">'+(st.kind==='take'?'—':took(r.seconds))+'</b></span>':
          '<label class="pset-min"><input type="number" inputmode="numeric" min="0" max="600" value="'+r.minutes+'" data-min aria-label="'+esc(st.title)+' 연습한 시간(분)"><span>분</span></label>')+'</li>';}).join('')+'</ul>'+
    '<p class="pset-sum-total">합계 <b data-sum></b></p>'+
    '<p class="pset-sum-today" data-sum-today></p>'+
    '<p role="alert" class="pset-error" data-pset-error></p>'+
    '<button type="button" class="btn block" data-save>기록 저장</button>'+
    '<div class="pset-sum-tools">'+(left&&!stale?'<button type="button" class="pset-quiet" data-resume>이어서 하기</button>':'')+'<button type="button" class="pset-quiet is-danger" data-discard>저장하지 않고 끝내기</button></div></section>';
}
function bindSummary(host){
  const read=()=>[...host.querySelectorAll('.pset-row:not([data-measured])')].map(row=>({id:row.dataset.step,minutes:Number(row.querySelector('[data-min]').value),done:row.querySelector('[data-done]')?row.querySelector('[data-done]').checked:undefined}));
  const measuredMinutes=[...host.querySelectorAll('[data-sec]')].reduce((n,el)=>n+Number(el.dataset.sec)/60,0);
  const today=todayOf(session.date);
  const sum=()=>{
    const n=Math.round(measuredMinutes+read().reduce((n,r)=>n+(Number.isFinite(r.minutes)&&r.minutes>0?Math.round(r.minutes):0),0));
    host.querySelector('[data-sum]').textContent=n+'분';
    // Before saving: what today becomes with this set (today's saved minutes + this set's minutes).
    host.querySelector('[data-sum-today]').textContent=today?'이 연습 '+n+'분을 저장하면 '+todayText(plus(today,n)):'';
  };
  host.querySelectorAll('[data-min]').forEach(i=>i.addEventListener('input',sum));sum();
  host.querySelector('[data-resume]')?.addEventListener('click',()=>{session.phase='run';lastDone='';persist();paint();changed();});
  host.querySelector('[data-discard]').onclick=async()=>{
    if(!await V.confirm('오늘의 연습 끝내기','이번 연습을 기록하지 않고 끝낼까요? 저장한 녹음은 그대로 남아요.',{ok:'끝내기',danger:true}))return;
    session=null;persist();syncAwake();changed();V.nav('#/home');
  };
  host.querySelector('[data-save]').onclick=()=>{
    const error=host.querySelector('[data-pset-error]'),button=host.querySelector('[data-save]');error.textContent='';
    const rows=read(),category=(db,st)=>V.guidedCategory?V.guidedCategory(db,{title:st.detail||st.title}):null;
    // 단계 (app/levels.js): with the set saved, the steps its measures earned and the level its points reached are kept
    // in the same change; what is new is told once, on the screen after saving.
    let result=null,news=null;const levelBefore=V.levels?.beforeSave?.()||0;
    try{
      if(rows.some(r=>!(Number.isFinite(r.minutes)&&r.minutes>=0&&r.minutes<=600)))throw Error('연습 시간은 0~600분으로 적어 주세요.');
      D.save(structuredClone(V.db),session,rows,{category});
      button.disabled=true;
      if(!V.change(db=>{
        result=D.save(db,session,rows,{category});
        try{news=V.levels?.afterSave?.(db,levelBefore)||null;}catch(e){console.error(e);news=null;}
      },{silent:true}))throw Error('기록을 저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.');
    }catch(e){error.textContent=e.message;button.disabled=false;return;}
    // Today against the target: one line with a thin bar on the done screen (no popup: 오늘 연습 on home always shows it).
    const date=session.date,items=D.summary(session),minutes=Math.round(result.minutes);
    const run=result.runId?(V.db.practices||[]).find(p=>p.id===result.runId):null,rec=run?.dailySet?.recording;
    saved={...result,minutes,date,news,today:todayOf(date),did:items.filter(x=>x.state==='done').length,count:items.length,
      pair:rec&&rec.songId&&rec.beforeId&&rec.afterId&&V.song(rec.songId)?{songId:rec.songId,a:rec.beforeId,b:rec.afterId}:null};
    // The done screen says it ("오늘 연습을 기록했어요 · 연습 n분"): no toast over the next screen's buttons.
    session=null;persist();syncAwake();paint();changed();
  };
}
function doneHtml(){
  const t=saved.today,percent=t?.targetMinutes?Number(t.percent)||0:null;
  const today=t?'<div class="pset-done-today" data-done-today><p>'+esc(todayText(t))+'</p>'+
    (percent!=null?'<div class="pset-done-bar" role="progressbar" aria-label="오늘 목표" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,percent)+'"><i style="width:'+Math.min(100,percent)+'%"></i></div>'+
      (percent>=100?'<small>오늘 목표를 채웠어요</small>':''):'')+'</div>':'';
  // 연습 전후 녹음이 둘 다 있으면: the existing blind A/B (app/listen-verdict.js) for the pair.
  const pair=saved.pair?'<div class="pset-pair" data-pset-pair><button type="button" class="btn secondary block" data-listen-open data-song="'+esc(saved.pair.songId)+'" data-a="'+esc(saved.pair.a)+'" data-b="'+esc(saved.pair.b)+'"><i class="ph ph-headphones" aria-hidden="true"></i>가리고 듣기 · 연습 전후 비교</button>'+
    '<p class="pset-note">어느 쪽이 연습 전인지 가려 놓고 들어 봐요.</p></div>':'';
  return '<section class="pset pset-done" aria-labelledby="pset-done-title"><span class="pset-done-mark" aria-hidden="true"><i class="ph ph-check"></i></span>'+
    '<h2 id="pset-done-title">오늘 연습을 기록했어요</h2><p class="pset-help">연습 '+saved.minutes+'분'+(saved.count?' · '+saved.count+'개 중 '+saved.did+'개':'')+(saved.goals?' · 목표 '+saved.goals+'개 체크':'')+'</p>'+(V.levels?.newsHtml?.(saved.news)||'')+today+pair+
    '<a class="btn block" href="#/home">홈으로</a><a class="btn secondary block" href="#/practices">연습 기록 보기</a></section>';
}

/* ---------- 화면 ---------- */
function paint(){
  const host=document.querySelector('[data-pset-host]');
  if(!host){runner?.destroy();runner=null;return;}
  load();
  runner?.destroy();runner=null;
  // A set left past midnight is closed: its summary saves under the day it was practised.
  if(session&&!session.away&&session.phase==='run'&&session.date!==V.today()&&!session.running){D.stop(session,Date.now());persist();changed();}
  const running=!!session&&session.phase==='run'&&!(session.away&&P.awayInfo(session));
  // Doing is dark, looking is light: only the step screen gets the dark studio.
  document.body.classList.toggle('vz-set-run',running);
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta){if(running){meta.dataset.setRun||=meta.content;meta.content='#0b0911';}else if(meta.dataset.setRun){meta.content=meta.dataset.setRun;delete meta.dataset.setRun;}}
  if(session?.away&&P.awayInfo(session)){host.innerHTML=awayHtml();bindAway(host);}
  else if(session){
    if(session.phase==='summary'){host.innerHTML=summaryHtml();bindSummary(host);}
    else{host.innerHTML='<section class="dset-run" data-pset-run aria-labelledby="pset-step-title"></section>';mountRun(host);}
  }else if(saved){host.innerHTML=doneHtml();}
  else{
    // ownBase: the steps the saved set gives today, to tell whether a change differs from it (then the set is kept).
    if(!draft||draft.today!==V.today()){draft=fresh();draft.ownBase=copy(D.build(V.db,{today:draft.today,recentSongId:recentSongId()}).own);}
    host.innerHTML=planHtml();bindPlan(host);
  }
}
/** 따라 하기: start a set of one step for the exercise `key`, then show it at #/practice-set (the link is replaced, so 뒤로
 * goes back to where 따라 하기 was pressed). One set at a time: a set in hand is carried on instead. */
async function guideFrom(key,songId){
  const host=document.querySelector('[data-pset-host]'),here=location.hash;
  if(host)host.innerHTML='<p class="pset-help" data-pset-guide-wait>연습을 준비하고 있어요…</p>';
  if(session){
    const same=session.phase==='run'&&session.steps.length===1&&session.steps[0].id==='guide:'+key;
    if(!same)V.toast('하던 오늘의 연습이 있어요. 마치거나 저장한 뒤에 따라 하기를 시작해 주세요.');
    location.replace('#/practice-set');return;
  }
  // One clock at a time: 타이머만 켜기 (app/free-timer.js) would count the same minutes again.
  if(V.freeTimer?.running?.()){V.toast('타이머가 돌아가는 중이에요. 타이머를 멈춘 뒤에 시작해 주세요.','error');location.replace('#/home');return;}
  let step=null;
  try{step=await V.guidedStepFor?.(key,{songId});}catch(error){console.error(error);}
  if(location.hash!==here)return;
  if(!step){
    const h=document.querySelector('[data-pset-host]');
    if(h)h.innerHTML='<section class="pset" data-pset-guide-missing><p class="pset-help">연습을 찾을 수 없어요. 다음 연습 목록에서 다시 골라 주세요.</p><a class="btn secondary block" href="#/next-practice">다음 연습 보기</a></section>';
    return;
  }
  // Never over a set in hand: one may have started while the exercise was being read.
  if(load()){location.replace('#/practice-set');return;}
  try{startNow([step],V.today());}catch(error){V.toast(error.message||'따라 하기를 시작하지 못했어요.','error');location.replace('#/home');return;}
  location.replace('#/practice-set');
}
function leaveRun(){
  runner?.destroy();runner=null;document.body.classList.remove('vz-set-run');
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta?.dataset.setRun){meta.content=meta.dataset.setRun;delete meta.dataset.setRun;}
}
V.route('practice-set',{title:'오늘의 연습',back:true,tab:'home',noSettings:true,noAutoRefresh:true,
  render:()=>'<div class="pset-host" data-pset-host></div>',
  mount(host,r){
    load();
    const guide=r?.query?.get('guide');
    if(guide)return guideFrom(guide,r.query.get('song')||'');
    // Back from the recorder (or reopened after iOS reloaded the page): link the takes saved since the step opened.
    linkRecordings();
    if(!session&&saved&&saved.date!==V.today())saved=null;
    count();syncAwake();paint();
  },
  leave(){
    // Leaving stops a built-in exercise (its screen is gone); one of the person's own steps keeps its clock running.
    leaveRun();
    if(!session){saved=null;draft=null;}
  }});
})();
