/* 오늘 연습 세트 (#/practice-set): one guided session made of today's items in order, with a timer per step.
 * Model and save rules: app/practice-set-model.js. The running session lives in memory and, while it runs, in this
 * device's account-scoped storage (a UI draft like the daily goal prompt), so a reload or a trip to the recorder
 * resumes it; nothing is written to the synced records until the singer saves the summary.
 * The timer follows the wall clock: it keeps running on other screens, in another app, with the phone locked and
 * across a reload; only the pause button stops it. Other screens show it as a small pill (app/practice-set-mini.js),
 * which reads V.practiceSetClock below. Reuses the recorder route
 * (#/record?song=…), MR playback (VZ.renderSongMR) and the guided-practice category rule (VZ.guidedCategory). */
(()=>{
'use strict';
const V=window.VZ,P=window.VzipPracticeSet;
if(!V||!P||typeof document==='undefined')return;
const esc=V.esc;
const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'local';
const store=()=>window.VzipAccountScope?.storage||window.localStorage;
const KEY=()=>'vzip_practice_set_live:'+owner();
const KIND={warmup:'웜업',goal:'오늘의 목표',song:'곡 구간',record:'녹음'};
const SOURCE={homework:'숙제',personal:'개인',recommendation:'추천'};
const DAYS='일월화수목금토';
let session=null,loadedFor='',draft=null,reorder=false,saved=null,timer=null,awake=false,alerted='';
const watchers=new Set();
const routeName=()=>document.body.dataset.vzRoute||'';
const changed=()=>{for(const fn of watchers){try{fn();}catch(e){console.error(e);}}};

function load(){
  if(loadedFor===owner())return session;
  loadedFor=owner();session=null;
  try{session=P.restore(JSON.parse(store().getItem(KEY())||'null'));}catch{session=null;}
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
function syncAwake(){keepAwake(!!session?.running&&['practice-set','record'].includes(routeName()));}
/** Count the time since the last count. away: the timer was not being watched — the app is in front again after
 * another app, a locked screen or a reload, or the singer is on another screen. */
function count(away=false){
  if(!session?.running)return;
  const mark=session.overAway;
  P.tick(session,Date.now(),{away});
  // A set that comes back on another day is closed there: its summary saves under the day it was practised.
  if(away&&session.running&&session.date!==V.today())P.end(session,Date.now());
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
    if(session.running){paintClock();changed();}else{syncAwake();paint();changed();}
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
window.VzipAccountScope?.beforeLeave?.(()=>{if(session?.running)pause();session=null;loadedFor='';draft=null;saved=null;keepAwake(false);changed();});

const total=steps=>steps.reduce((n,s)=>n+(Number(s.minutes)||0),0);
const songTitle=id=>V.songTitle?.(id)||V.song?.(id)?.title||'';
/** The list and the step screen already say the kind, so "곡 구간 · X" reads as "X" there. */
const shortTitle=s=>{const k=KIND[s.kind];return k&&String(s.title).startsWith(k+' · ')?String(s.title).slice(k.length+3):String(s.title);};
const kindLabel=s=>s.first?'시작 체크':s.kind==='goal'?(s.routine?(s.source==='homework'?'숙제 · 매일 반복':'매일 반복'):(SOURCE[s.source]||'목표')):KIND[s.kind]||'연습';
function recentSongId(){
  try{const a=V.songActivity?.(V.media?.cached?.()||[]);if(a){const id=[...a.keys()].filter(id=>V.song(id)).sort((x,y)=>a.get(y).localeCompare(a.get(x)))[0];if(id)return id;}}catch{}
  return '';
}
function fresh(){
  const today=V.today(),built=P.build(V.db,{today,recentSongId:recentSongId()});
  const slot=built.template?.slot||'';
  return {today,steps:built.steps,base:built.base,slot,remember:slot||'default'};
}
/* Today against the daily target comes from the shared helper (app/today-practice.js: VZ.todayPractice,
 * VZ.todayPracticeText, VZ.todayPracticePopup). Without it nothing extra is shown. Only saved minutes count there. */
function todayOf(date){
  if(date!==V.today())return null;
  try{const t=V.todayPractice?.(date);return t&&Number.isFinite(Number(t.minutes))?{minutes:Number(t.minutes),targetMinutes:Number(t.targetMinutes)>0?Number(t.targetMinutes):null,percent:t.percent??null}:null;}catch(e){console.error(e);return null;}
}
const plus=(t,add)=>{const minutes=t.minutes+add;return {minutes,targetMinutes:t.targetMinutes,percent:t.targetMinutes?Math.round(minutes/t.targetMinutes*100):null};};
function todayText(t){
  try{const text=V.todayPracticeText?.(t);if(text)return String(text);}catch(e){console.error(e);}
  return t.targetMinutes?'오늘 '+t.minutes+'분 / 목표 '+t.targetMinutes+'분 · '+t.percent+'%':'오늘 '+t.minutes+'분 · 목표 없음';
}
/** Home entry: what the compact "오늘 연습 시작" row says. Null when nothing can be built. */
V.practiceSetEntry=()=>{
  try{
    const s=load();
    if(s&&s.phase==='summary')return {state:'summary',title:'연습 세트 기록 저장하기',line:'시간을 확인하고 저장해요',label:'연습 세트 기록 저장하기'};
    if(s)return {state:'live',title:'연습 세트 이어서 하기',line:(s.index+1)+'/'+s.steps.length+' · '+s.steps[s.index].title,label:'연습 세트 이어서 하기, '+(s.index+1)+'/'+s.steps.length+'단계'};
    const f=fresh();if(!f.steps.length)return null;
    const minutes=total(f.steps);
    return {state:'new',title:'오늘 연습 시작',line:f.steps.length+'단계 · 약 '+minutes+'분',label:'오늘 연습 시작, '+f.steps.length+'단계 약 '+minutes+'분'};
  }catch(error){console.error(error);return null;}
};
/** What the small timer on other screens shows: null unless today's set is in its steps (running or paused).
 * seconds/target are for the current step; left<0 means the step is over its planned time. */
V.practiceSetClock={
  state(){
    try{
      const s=load();
      if(!s||s.phase!=='run'||s.date!==V.today())return null;
      const st=s.steps[s.index],seconds=P.elapsedNow(s,Date.now()),target=st.minutes*60;
      return {id:s.id,index:s.index,total:s.steps.length,title:shortTitle(st),running:s.running,away:!!s.away,seconds,target,left:target-seconds,
        text:countdown(target-seconds)};
    }catch(error){console.error(error);return null;}
  },
  /** The pause button: the only thing that stops the clock. */
  toggle(){
    if(!session||session.phase!=='run'||session.away)return;
    if(session.running)pause();else play();
    paint();
  },
  watch(fn){watchers.add(fn);return ()=>watchers.delete(fn);}
};

/* ---------- 시작 전: 편집 목록 ---------- */
function planHtml(){
  const steps=draft.steps,day=DAYS[P.weekday(draft.today)];
  return '<section class="pset pset-plan" aria-labelledby="pset-plan-title">'+
    '<div class="pset-plan-head"><p class="pset-help" id="pset-plan-title">순서대로 이어서 해요. 시간은 단계마다 정해요.</p><span class="pset-total" data-pset-total>'+steps.length+'단계 · 약 '+total(steps)+'분</span></div>'+
    (steps.length?'<ol class="pset-list'+(reorder?' is-reorder':'')+'">'+steps.map((s,i)=>
      '<li class="pset-row" data-step="'+esc(s.id)+'"><span class="pset-row-copy"><small>'+esc(s.kind==='goal'?kindLabel(s):KIND[s.kind]||kindLabel(s))+(s.optional?' · 선택':'')+'</small><strong>'+esc(shortTitle(s))+'</strong>'+
        (s.segmentStart!=null?'<em>구간 '+esc(P.segmentLabel(s.segmentStart,s.segmentEnd))+'</em>':'')+'</span>'+
      (reorder?'<span class="pset-row-tools"><button type="button" class="pset-icon" data-up aria-label="'+esc(s.title)+' 위로"'+(i===0?' disabled':'')+'><i class="ph ph-arrow-up" aria-hidden="true"></i></button>'+
        '<button type="button" class="pset-icon" data-down aria-label="'+esc(s.title)+' 아래로"'+(i===steps.length-1?' disabled':'')+'><i class="ph ph-arrow-down" aria-hidden="true"></i></button></span>':
       '<label class="pset-min"><input type="number" inputmode="numeric" min="1" max="120" value="'+esc(s.minutes)+'" data-min aria-label="'+esc(s.title)+' 시간(분)"><span>분</span></label>'+
       '<button type="button" class="pset-icon" data-remove aria-label="'+esc(s.title)+' 빼기"><i class="ph ph-x" aria-hidden="true"></i></button>')+'</li>').join('')+'</ol>':
      '<p class="pset-empty">연습할 항목이 없어요. 아래에서 추가해 주세요.</p>')+
    '<div class="pset-plan-tools"><button type="button" class="pset-chip" data-add><i class="ph ph-plus" aria-hidden="true"></i>항목 추가</button>'+
      (steps.length>1?'<button type="button" class="pset-chip" data-reorder aria-pressed="'+reorder+'"><i class="ph ph-arrows-down-up" aria-hidden="true"></i>'+(reorder?'순서 완료':'순서 바꾸기')+'</button>':'')+'</div>'+
    '<fieldset class="pset-remember"><legend>이 구성 기억하기</legend><div class="pset-seg">'+
      [['w'+P.weekday(draft.today),day+'요일 세트'],['default','기본 세트'],['none','이번만']].map(([v,l])=>
        '<label><input type="radio" name="pset-remember" value="'+v+'"'+(draft.remember===v?' checked':'')+'><span>'+l+'</span></label>').join('')+'</div></fieldset>'+
    '<p role="alert" class="pset-error" data-pset-error></p>'+
    '<button type="button" class="btn block pset-start" data-start'+(steps.length?'':' disabled')+'><i class="ph ph-play" aria-hidden="true"></i>시작하기</button></section>';
}
function bindPlan(host){
  const steps=draft.steps,index=id=>steps.findIndex(s=>s.id===id);
  host.querySelectorAll('.pset-row').forEach(row=>{
    const i=()=>index(row.dataset.step);
    row.querySelector('[data-min]')?.addEventListener('change',e=>{const n=Math.round(Number(e.target.value));if(n>=1&&n<=120){steps[i()].minutes=n;host.querySelector('[data-pset-total]').textContent=steps.length+'단계 · 약 '+total(steps)+'분';}else e.target.value=steps[i()].minutes;});
    row.querySelector('[data-remove]')?.addEventListener('click',()=>{steps.splice(i(),1);paint();});
    row.querySelector('[data-up]')?.addEventListener('click',()=>{const k=i();if(k>0){steps.splice(k-1,0,...steps.splice(k,1));paint();host.querySelector('[data-step="'+CSS.escape(row.dataset.step)+'"] [data-up]:not(:disabled),[data-step="'+CSS.escape(row.dataset.step)+'"] [data-down]')?.focus();}});
    row.querySelector('[data-down]')?.addEventListener('click',()=>{const k=i();if(k<steps.length-1){steps.splice(k+1,0,...steps.splice(k,1));paint();host.querySelector('[data-step="'+CSS.escape(row.dataset.step)+'"] [data-down]:not(:disabled),[data-step="'+CSS.escape(row.dataset.step)+'"] [data-up]')?.focus();}});
  });
  host.querySelector('[data-reorder]')?.addEventListener('click',()=>{reorder=!reorder;paint();host.querySelector('[data-reorder]')?.focus();});
  host.querySelector('[data-add]').onclick=addSheet;
  host.querySelectorAll('[name=pset-remember]').forEach(r=>r.onchange=()=>{draft.remember=r.value;});
  host.querySelector('[data-start]').onclick=()=>{
    const error=host.querySelector('[data-pset-error]');error.textContent='';
    try{
      const s=P.start(draft.steps,{id:V.uid(),date:draft.today,now:Date.now()});
      // Remember the composition only when it differs from today's defaults or replaces a saved set.
      const slot=draft.remember;
      if(slot!=='none'){
        const same=JSON.stringify(P.templateFrom(draft.steps,draft.base))===JSON.stringify(P.templateFrom(draft.base,draft.base));
        const exists=(V.db.practicePlans||[]).some(p=>p?.id===P.templateId(slot));
        if(!same||exists)V.change(db=>{P.saveTemplate(db,slot,draft.steps,draft.base);},{silent:true});
      }
      session=s;loadedFor=owner();draft=null;reorder=false;alerted='';
      play();paint();
    }catch(e){error.textContent=e.message;}
  };
}
const parseTime=v=>{const t=String(v||'').trim();if(!t)return null;const m=t.match(/^(\d{1,3}):([0-5]\d)$/);const n=m?Number(m[1])*60+Number(m[2]):/^\d{1,4}$/.test(t)?Number(t):NaN;return Number.isFinite(n)?n:NaN;};
function addSheet(){
  const have=new Set(draft.steps.map(s=>s.goalId).filter(Boolean)),kinds=new Set(draft.steps.map(s=>s.kind));
  const goals=draft.base.filter(s=>s.kind==='goal'&&!have.has(s.goalId));
  const lastSong=[...draft.steps].reverse().find(s=>s.songId)?.songId||recentSongId();
  const options=[...goals.map(s=>({key:'goal:'+s.goalId,label:s.title,meta:kindLabel(s),step:s})),
    ...(!kinds.has('warmup')?[{key:'warmup',label:(draft.base.find(s=>s.kind==='warmup')||{title:'웜업 · 호흡과 발성'}).title,meta:'웜업',step:draft.base.find(s=>s.kind==='warmup')||{kind:'warmup',title:'웜업 · 호흡과 발성',detail:'호흡과 발성',categoryLabel:'발성',tips:[]}}]:[]),
    ...(!kinds.has('record')&&lastSong&&V.song(lastSong)?[{key:'record',label:'녹음 · '+songTitle(lastSong),meta:'녹음 · 선택',step:{kind:'record',songId:lastSong,title:'녹음 · '+songTitle(lastSong),optional:true,minutes:3}}]:[])];
  V.sheet({title:'항목 추가',body:'<div class="pset-add-sheet">'+(options.length?'<div class="pset-add-list">'+options.map((o,i)=>
      '<button type="button" class="pset-add-option" data-option="'+i+'"><span><small>'+esc(o.meta)+'</small><strong>'+esc(o.label)+'</strong></span><i class="ph ph-plus" aria-hidden="true"></i></button>').join('')+'</div>':'')+
    '<form class="pset-song-form" data-song-form><h3>곡 구간 추가</h3>'+V.songSelect('song',lastSong,{none:'곡 선택'})+
      '<div class="pset-song-grid"><label class="field"><span>시작 <small>분:초</small></span><input name="from" type="text" inputmode="numeric" placeholder="0:30" aria-label="구간 시작 (분:초)"></label>'+
      '<label class="field"><span>끝 <small>분:초</small></span><input name="to" type="text" inputmode="numeric" placeholder="1:10" aria-label="구간 끝 (분:초)"></label></div>'+
      '<label class="field"><span>시간(분)</span><input name="minutes" type="number" min="1" max="120" value="10" inputmode="numeric" aria-label="곡 구간 시간(분)"></label>'+
      '<p class="pset-help">구간을 비우면 곡 전체를 연습해요.</p><p role="alert" class="pset-error" data-song-error></p>'+
      '<button type="submit" class="btn secondary block">곡 구간 넣기</button></form></div>',
    onMount:(el,close)=>{
      el.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{const o=options[Number(b.dataset.option)];draft.steps=P.normalize([...draft.steps,{...o.step,id:undefined}]);close();paint();});
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
        const at=draft.steps.findIndex(s=>s.kind==='record');if(at<0)draft.steps.push(step);else draft.steps.splice(at,0,step);
        draft.steps=P.normalize(draft.steps);close();paint();
      };
    }});
}

/* ---------- 진행 중 ---------- */
const clock=sec=>{sec=Math.max(0,Math.floor(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
/** Time left on a step as the timer shows it: 2:00 … 0:00, then +0:01 once the planned time has passed. */
const countdown=left=>(left<0?'+':'')+clock(Math.abs(left<0?Math.floor(-left):Math.ceil(left)));
const span=sec=>{sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return h?h+'시간'+(m?' '+m+'분':''):m?m+'분':sec+'초';};
function paintClock(){
  const host=document.querySelector('[data-pset-run]');if(!host||!session)return;
  const st=session.steps[session.index],target=st.minutes*60,left=target-st.elapsed,over=left<0;
  const value=host.querySelector('[data-clock]'),sub=host.querySelector('[data-clock-sub]'),bar=host.querySelector('[data-meter]');
  if(value)value.textContent=countdown(left);
  if(sub)sub.textContent=over?'목표 '+st.minutes+'분 지남 · 연습 '+clock(st.elapsed):'남음 · 목표 '+st.minutes+'분';
  host.querySelector('.pset-clock')?.classList.toggle('is-over',over);
  if(bar)bar.style.width=Math.min(100,Math.round(st.elapsed/Math.max(1,target)*100))+'%';
  if(over&&session.running&&alerted!==session.id+':'+st.id){alerted=session.id+':'+st.id;try{navigator.vibrate?.(200);}catch{}}
}
function helperHtml(st){
  if(st.kind==='warmup'||st.first)return (st.tips?.length?'<ul class="pset-tips">'+st.tips.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'')+(st.href?'<a class="pset-chip" href="'+esc(st.href)+'">열기</a>':'');
  const song=st.songId&&V.song(st.songId),seg=st.segmentStart!=null?P.segmentLabel(st.segmentStart,st.segmentEnd):'';
  let html='';
  if(st.kind==='goal'){
    const g=(V.db.dailyGoals||[]).find(x=>x.id===st.goalId),rec=g?.recommendation;
    if(rec?.reason)html+='<p class="pset-note">'+esc(rec.reason)+'</p>';
    html+='<p class="pset-note">'+(st.source==='homework'?'마치면 오늘의 목표가 체크되고 숙제에 연습이 연결돼요. 숙제 완료는 따로 정해요.':'마치면 오늘의 목표가 체크돼요.')+'</p>';
  }
  if(song)html+='<p class="pset-song"><i class="ph ph-music-note" aria-hidden="true"></i><strong>'+esc(song.title)+'</strong>'+(seg?'<span>구간 '+esc(seg)+'</span>':'<span>전체</span>')+'</p>';
  if(st.kind==='record'){
    const n=st.mediaIds.length;
    html+='<button type="button" class="btn secondary block pset-record" data-record><i class="ph ph-microphone" aria-hidden="true"></i>'+(n?'한 번 더 녹음하기':'녹음하기')+'</button>'+
      '<p class="pset-note" data-linked>'+(n?'녹음 '+n+'개를 이 단계에 연결했어요. ':'')+'녹음 길이는 연습 시간에 더하지 않아요.</p>';
  }
  if(song&&(song.mrTracks||[]).some(x=>!x.deleted)&&V.renderSongMR)html+='<div class="pset-mr" data-mr-host></div>';
  return html;
}
function runHtml(){
  const s=session,st=s.steps[s.index],next=s.steps[s.index+1],last=s.index===s.steps.length-1,today=todayOf(s.date);
  return '<section class="pset pset-run" data-pset-run aria-labelledby="pset-step-title">'+
    '<div class="pset-progress"><span>'+(s.index+1)+' / '+s.steps.length+'</span><ol class="pset-dots" aria-hidden="true">'+s.steps.map((x,i)=>'<li class="'+(i===s.index?'is-now':x.done?'is-done':'')+'"></li>').join('')+'</ol></div>'+
    '<p class="pset-kicker">'+esc(KIND[st.kind]||'연습')+(st.kind==='goal'?' · '+esc(kindLabel(st)):'')+(st.optional?' · 선택':'')+'</p>'+
    '<h2 id="pset-step-title" class="pset-step-title">'+esc(shortTitle(st))+'</h2>'+
    '<div class="pset-clock" role="timer" aria-label="단계 타이머"><strong data-clock>0:00</strong><small data-clock-sub></small><div class="pset-meter"><i data-meter></i></div></div>'+
    (s.overAway===st.id?'<p class="pset-over-note" role="status" data-over-note><i class="ph ph-clock-countdown" aria-hidden="true"></i><span>다른 곳에 있는 동안 계획한 '+st.minutes+'분이 지났어요. 단계는 그대로 두었어요. 더 하거나 다음으로 넘어가요.</span></p>':'')+
    (today?'<p class="pset-today" data-pset-today>오늘 '+today.minutes+'분'+(today.targetMinutes?' / 목표 '+today.targetMinutes+'분':'')+' · 이 세트는 저장하면 더해져요</p>':'')+
    '<div class="pset-helper">'+helperHtml(st)+'</div>'+
    '<div class="pset-controls"><button type="button" class="pset-ctl" data-prev'+(s.index?'':' disabled')+'><i class="ph ph-caret-left" aria-hidden="true"></i>이전</button>'+
      '<button type="button" class="pset-play" data-toggle aria-label="'+(s.running?'일시정지':'계속')+'"><i class="ph-fill ph-'+(s.running?'pause':'play')+'" aria-hidden="true"></i></button>'+
      '<button type="button" class="pset-ctl" data-next>'+(last?'마치기':'다음')+'<i class="ph ph-caret-right" aria-hidden="true"></i></button></div>'+
    '<p class="pset-upnext">'+(next?'다음 · '+esc(next.title):'마지막 단계예요')+'</p>'+
    '<button type="button" class="pset-quiet" data-finish>여기까지 하고 기록하기</button></section>';
}
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
function bindRun(host){
  paintClock();
  const s=session;
  host.querySelector('[data-toggle]').onclick=()=>{if(session.running)pause();else play();paint();host.isConnected&&document.querySelector('[data-pset-run] [data-toggle]')?.focus();};
  host.querySelector('[data-prev]').onclick=()=>{P.go(session,session.index-1,Date.now());persist();paint();changed();document.querySelector('[data-pset-run] [data-prev]:not(:disabled),[data-pset-run] [data-next]')?.focus();};
  host.querySelector('[data-next]').onclick=()=>{
    if(session.index===session.steps.length-1)return finishRun();
    P.go(session,session.index+1,Date.now());session.steps[session.index].openedAt||=Date.now();persist();paint();changed();
    document.querySelector('[data-pset-run] [data-next]')?.focus();
  };
  host.querySelector('[data-finish]').onclick=finishRun;
  host.querySelector('[data-record]')?.addEventListener('click',()=>{
    const st=s.steps[s.index];st.openedAt=Date.now();persist();
    // The session keeps running while the singer records (real elapsed time, not the recording's length).
    V.nav('#/record'+(st.songId?'?song='+encodeURIComponent(st.songId):''));
  });
  const mr=host.querySelector('[data-mr-host]'),song=V.song(s.steps[s.index].songId);
  if(mr&&song)try{V.renderSongMR(mr,song);}catch(e){console.error(e);}
}
function finishRun(){
  P.end(session,Date.now());persist();syncAwake();paint();changed();
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
    document.querySelector('[data-pset-run] [data-toggle],.pset-summary [data-save]')?.focus();
  });
}

/* ---------- 요약·저장 ---------- */
function summaryHtml(){
  const s=session,rows=P.summary(s),stale=s.date!==V.today();
  return '<section class="pset pset-summary" aria-labelledby="pset-summary-title"><h2 id="pset-summary-title">연습 세트 정리</h2>'+
    '<p class="pset-help">'+(stale?esc(V.dateLabel?.(s.date)||s.date)+' 연습이에요. ':'')+'실제로 연습한 시간만 기록해요. 필요하면 고쳐 주세요. 녹음 길이는 더하지 않아요.</p>'+
    '<ul class="pset-list pset-sum-list">'+rows.map((r,i)=>{const st=s.steps[i];
      return '<li class="pset-row" data-step="'+esc(r.id)+'"><span class="pset-row-copy"><small>'+esc(KIND[st.kind]||'연습')+(st.kind==='goal'?' · '+esc(kindLabel(st)):'')+'</small><strong>'+esc(shortTitle(st))+'</strong>'+
        (st.kind==='goal'?'<label class="pset-check"><input type="checkbox" data-done'+(r.done?' checked':'')+'><span>목표 완료로 체크</span></label>':'')+
        (r.mediaIds.length?'<em>녹음 '+r.mediaIds.length+'개 연결</em>':'')+'</span>'+
        '<label class="pset-min"><input type="number" inputmode="numeric" min="0" max="600" value="'+r.minutes+'" data-min aria-label="'+esc(r.title)+' 연습한 시간(분)"><span>분</span></label></li>';}).join('')+'</ul>'+
    '<p class="pset-sum-total">합계 <b data-sum>'+rows.reduce((n,r)=>n+r.minutes,0)+'분</b></p>'+
    '<p class="pset-sum-today" data-sum-today></p>'+
    '<p role="alert" class="pset-error" data-pset-error></p>'+
    '<button type="button" class="btn block" data-save>기록 저장</button>'+
    '<div class="pset-sum-tools"><button type="button" class="pset-quiet" data-resume>이어서 하기</button><button type="button" class="pset-quiet is-danger" data-discard>저장하지 않고 끝내기</button></div></section>';
}
function bindSummary(host){
  const read=()=>[...host.querySelectorAll('.pset-row')].map(row=>({id:row.dataset.step,minutes:Number(row.querySelector('[data-min]').value),done:row.querySelector('[data-done]')?row.querySelector('[data-done]').checked:undefined}));
  const today=todayOf(session.date);
  const sum=()=>{
    const n=read().reduce((n,r)=>n+(Number.isFinite(r.minutes)&&r.minutes>0?Math.round(r.minutes):0),0);
    host.querySelector('[data-sum]').textContent=n+'분';
    // Before saving: what today becomes with this set (today's saved minutes + this set's minutes).
    host.querySelector('[data-sum-today]').textContent=today?'이 세트 '+n+'분을 저장하면 '+todayText(plus(today,n)):'';
  };
  host.querySelectorAll('[data-min]').forEach(i=>i.addEventListener('input',sum));sum();
  host.querySelector('[data-resume]').onclick=()=>{session.phase='run';persist();paint();changed();};
  host.querySelector('[data-discard]').onclick=async()=>{
    if(!await V.confirm('연습 세트 끝내기','이번 연습 세트를 기록하지 않고 끝낼까요? 저장한 녹음은 그대로 남아요.',{ok:'끝내기',danger:true}))return;
    session=null;persist();syncAwake();changed();V.nav('#/home');
  };
  host.querySelector('[data-save]').onclick=()=>{
    const error=host.querySelector('[data-pset-error]'),button=host.querySelector('[data-save]');error.textContent='';
    const rows=read(),category=(db,st)=>V.guidedCategory?V.guidedCategory(db,{title:st.detail||st.title}):null;
    let result=null;
    try{
      if(rows.some(r=>!(Number.isFinite(r.minutes)&&r.minutes>=0&&r.minutes<=600)))throw Error('연습 시간은 0~600분으로 적어 주세요.');
      P.save(structuredClone(V.db),session,rows,{category});
      button.disabled=true;
      if(!V.change(db=>{result=P.save(db,session,rows,{category});},{silent:true}))throw Error('기록을 저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.');
    }catch(e){error.textContent=e.message;button.disabled=false;return;}
    // Today against the target: the shared popup when it is loaded, else one line with a thin bar on the done screen.
    const date=session.date;let popup=false;
    if(date===V.today()&&typeof V.todayPracticePopup==='function'){try{V.todayPracticePopup({addedMinutes:result.minutes,title:'오늘 연습 세트'});popup=true;}catch(e){console.error(e);}}
    saved={...result,date,today:popup?null:todayOf(date)};session=null;persist();syncAwake();paint();changed();
    if(!popup)V.toast(result.minutes?'연습 '+result.minutes+'분을 기록했어요.':'연습 세트를 저장했어요.');
  };
}
function doneHtml(){
  const t=saved.today,percent=t?.targetMinutes?Number(t.percent)||0:null;
  const today=t?'<div class="pset-done-today" data-done-today><p>'+esc(todayText(t))+'</p>'+
    (percent!=null?'<div class="pset-done-bar" role="progressbar" aria-label="오늘 목표" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,percent)+'"><i style="width:'+Math.min(100,percent)+'%"></i></div>'+
      (percent>=100?'<small>오늘 목표를 채웠어요</small>':''):'')+'</div>':'';
  return '<section class="pset pset-done" aria-labelledby="pset-done-title"><span class="pset-done-mark" aria-hidden="true"><i class="ph ph-check"></i></span>'+
    '<h2 id="pset-done-title">오늘 연습을 기록했어요</h2><p class="pset-help">연습 '+saved.minutes+'분'+(saved.goals?' · 목표 '+saved.goals+'개 체크':'')+'</p>'+today+
    '<a class="btn block" href="#/home">홈으로</a><a class="btn secondary block" href="#/practices">연습 기록 보기</a></section>';
}

/* ---------- 화면 ---------- */
function paint(){
  const host=document.querySelector('[data-pset-host]');if(!host)return;
  load();
  if(session?.away&&P.awayInfo(session)){host.innerHTML=awayHtml();bindAway(host);}
  else if(session){
    // A set left running past midnight is closed: its summary saves under the day it was practised.
    if(session.phase==='run'&&session.date!==V.today()&&!session.running){P.end(session,Date.now());persist();changed();}
    host.innerHTML=session.phase==='summary'?summaryHtml():runHtml();
    if(session.phase==='summary')bindSummary(host);else bindRun(host);
  }else if(saved){host.innerHTML=doneHtml();}
  else{
    if(!draft||draft.today!==V.today())draft=fresh();
    host.innerHTML=planHtml();bindPlan(host);
  }
}
V.route('practice-set',{title:'오늘 연습 세트',back:true,tab:'home',noSettings:true,noAutoRefresh:true,
  render:()=>'<div class="pset-host" data-pset-host></div>',
  mount(){
    load();
    // Back from the recorder (or reopened after iOS reloaded the page): link the takes saved since the step opened.
    linkRecordings();
    if(!session&&saved&&saved.date!==V.today())saved=null;
    count();syncAwake();paint();
  },
  leave(){
    // Leaving keeps the clock running (the small timer shows it on other screens); only the pause button stops it.
    if(!session){saved=null;draft=null;}
  }});
})();
