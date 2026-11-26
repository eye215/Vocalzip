/* Approved student home: thin adapter over existing VZ records/actions.
 * No auth, upload, analysis, billing or server-policy changes. */
import {createFloatingHome} from './student-home-html.js?v=today1-20261126';
const V=window.VZ,M=window.VzipStudentHomeModel;
if(V&&M&&window.VZIP_APPROVED_HOME_ENABLED!==false){
 const esc=V.esc,nav=hash=>V.nav(hash),today=()=>V.today();
 const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'';
 // Daily time target chosen at signup (account metadata) or later in settings; 30 minutes when neither exists.
 const dailyTarget=()=>V.dailyTargetMinutes?.()??V.db.settings?.dailyTargetMinutes??window.vzipCloudUserDailyTarget?.()??30;
 const state=(files=V.media.cached(),weekStart=null,{withDefault=true}={})=>{
  const db={...V.db,performances:(V.db.performances||[]).filter(p=>p.ownerId===owner()&&owner())};
  const options={...(withDefault?{defaultDailyTargetMinutes:dailyTarget()}:{}),today:today(),timeEntries:V.timeEntries(files),mediaDates:files.filter(f=>!V.db.deleted?.media?.includes(f.id)).map(f=>V.media.dateOf(f))};
  const bounds=M.weekBounds(db,options),requested=weekStart||bounds.current;
  return M.build(db,{...options,weekStart:requested<bounds.first?bounds.first:requested>bounds.last?bounds.last:requested});
 };
 let selectedWeekStart=null,stopHome=()=>{};
 /** 연습하기 asked for on the way here (VZ.homeShow, app/growth-hub.js: the former 보컬 트레이닝 addresses and
  * "연습은 오늘 탭에서 해요" in 성장) — only an ask made a moment ago, so an old one never moves the page later. It
  * is dropped on leaving 오늘, not on the first draw: home can be drawn again right after it opens (a list that
  * arrives, a sync), and that draw has to land on the section too. */
 const practiceWanted=()=>{const w=V.homeWants;return w?.what==='practice'&&Date.now()-w.at<8000;};
 const calendar=date=>nav('#/calendar?date='+encodeURIComponent(date));
 const dayLabel=date=>date?V.dateLabel(date):'';
 const lessonDay=date=>{const d=V.parseYmd(date);return d?(d.getMonth()+1)+'.'+d.getDate()+' ('+'일월화수목금토'[d.getDay()]+')':'';};
 const meta=document.querySelector('meta[name="theme-color"]'),originalTheme=meta?.content;
 function applyTheme(){
  const home=!!document.querySelector('[data-approved-home-host]');
  document.body.classList.toggle('vz-home-mode',home);
   if(meta)meta.content=home?'#f8f6fd':document.body.classList.contains('vz-record-mode')||document.body.classList.contains('vz-set-run')?'#0b0911':originalTheme;
  const route=(location.hash.startsWith('#/')?location.hash.slice(2):location.hash.slice(1)).split('/')[0].split('?')[0];
  if(route==='library'||route==='practices'||route==='growth'){
   document.querySelectorAll('.v-nav [aria-current]').forEach(a=>a.removeAttribute('aria-current'));
   document.querySelector('.v-nav [data-nav="'+({library:'songs',practices:'calendar',growth:'home'}[route])+'"]')?.setAttribute('aria-current','page');
  }
 }
 new MutationObserver(applyTheme).observe(document.getElementById('view'),{childList:true});
 window.addEventListener('hashchange',applyTheme);
 const greeting=()=>new Date().getHours()<12?'좋은 아침이에요':new Date().getHours()<18?'좋은 오후예요':'좋은 저녁이에요';
 const displayName=()=>String(V.db.profile?.displayName||V.db.settings?.displayName||'');
 /* v4 home: one "지금 할 것" card. Today's lesson first, then open homework, then carrying on with the latest song,
  * then the next lesson; with nothing at all, setting today's goals.
  * 다음 연습 하나로 (2026-11-26): where the card recommends something (the homework, the suggestion) it is the first item
  * of the ONE 다음 연습 list (VZ.nextPractice, app/next-practice.js) — the list 성장 › 나 and #/next-practice show —
  * with "다음 연습 n개 더" under it. `next` is that list, computed once per drawing of home. */
 const dday=date=>{const n=V.daysBetween(today(),date);return n===0?'D-day':n>0?'D-'+n:'';};
 /** 다음 연습 for home: once per drawing, from the recordings home already holds. null without the list. */
 const nextList=files=>{try{return V.nextPractice?.({media:files})||null;}catch(error){console.error(error);return null;}};
 const withMore=(card,open,fromList)=>{const n=open.length-(fromList?1:0);return n>0?{...card,more:{count:n,text:'다음 연습 '+n+'개'+(fromList?' 더':''),action:()=>nav('#/next-practice')}}:card;};
 function nowCard(s,songs,next){
  const card=pick(s,songs,next);
  return next&&card?withMore(card,next.items.filter(x=>!x.doneToday),card.fromList):card;
 }
 function pick(s,songs,next){
  const l=s.lesson,lessonToday=l&&V.daysBetween(today(),l.date)===0,doneToday=new Set((V.db.practices||[]).filter(p=>p&&p.date===today()&&!(V.db.deleted?.practices||[]).includes(p.id)).flatMap(p=>Array.isArray(p.completed)?p.completed:[]));
  // The open part of 다음 연습 (done today goes last there, so it is not offered again first); without the list, the model's homework.
  const open=next?next.items.filter(x=>!x.doneToday):null,first=open?.[0];
  const homework=open?(first?.source==='homework'?first:null):s.recommendationCandidates.find(t=>t.source==='homework'&&!doneToday.has(t.sourceId)); // a homework already done today is not "오늘 해 볼 숙제" (1.0 점검)
  const lessonCard=title=>({kind:'lesson',title:title+(l.title||'보컬 레슨'),badge:lessonToday?(l.startTime||'오늘'):dday(l.date),line:lessonToday?[l.place,l.teacher].filter(Boolean).join(' · ')||'레슨 준비하기':lessonDay(l.date)+(l.startTime?' '+l.startTime:''),label:'다음 레슨 보기',action:()=>nav('#/lesson/'+encodeURIComponent(l.id))});
  if(lessonToday)return lessonCard('오늘 ');
  if(homework)return {kind:'homework',fromList:!!open,title:homework.title,badge:'숙제',line:'오늘 해 볼 숙제예요',label:'숙제 '+homework.title+' 보기',action:()=>nav('#/homework')};
  // A new student with no song yet: adding the first song comes first (UI 정리 3차) — recordings, lessons and homework
  // are kept by song, so everything after is easier.
  if(!(V.db.songs||[]).some(x=>x&&!(V.db.deleted?.songs||[]).includes(x.id)))return {kind:'first-song',title:'첫 곡 추가하기',badge:'시작',line:'곡마다 녹음·레슨·숙제가 모여요',label:'첫 곡 추가하기',action:()=>{if(V.songSheet)V.songSheet(null,id=>nav('#/song/'+encodeURIComponent(id)));else nav('#/songs');}};
  if(songs[0])return {kind:'practice',title:'이어서 연습하기',badge:'',line:songs[0].title,label:songs[0].title+' 이어서 연습하기',action:()=>nav('#/record?song='+encodeURIComponent(songs[0].id))};
  if(l)return lessonCard('');
  // No lesson coming either: the first take (1.0 점검 P1 #3: a new student's home pointed to a breathing exercise, not to singing the song just
  // added): songs, but nothing practised or recorded yet — record the newest song. Recording is all it does; nothing is saved.
  const firstSong=!songs[0]&&!(V.db.practices||[]).length&&!(V.media?.cached?.()||[]).length&&V.songsNewest?.().find(x=>x&&!(V.db.deleted?.songs||[]).includes(x.id));
  if(firstSong)return {kind:'first-take',title:'첫 녹음하기',badge:'시작',line:firstSong.title+' · 지금 목소리를 남겨 두면 나중에 비교돼요',label:firstSong.title+' 첫 녹음하기',action:()=>nav('#/record?song='+encodeURIComponent(firstSong.id))};
  // Nothing scheduled or practised: suggest one practice (done in 오늘의 연습) instead of a second "오늘의 목표 정하기" (the
  // empty goal list below already offers that). A suggestion already in today's goals is not repeated; then simply record.
  if(open){
   const rec=open.find(x=>!x.inGoals);
   if(rec)return {kind:'recommend',fromList:true,title:rec.title,badge:V.nextPractice.label(rec.source)||'추천',line:rec.why||'',label:'다음 연습 '+rec.title,action:()=>nav(rec.go?.href||'#/next-practice')};
  }else{
   const rec=s.recommendationCandidates.find(c=>c.source==='recommendation'&&!(s.goals||[]).some(g=>g.source===c.source&&g.sourceId===c.sourceId));
   if(rec)return {kind:'recommend',title:rec.title,badge:'추천',line:'오늘의 연습에서 해요',label:'다음 연습 '+rec.title,action:()=>nav('#/practice-set')};
  }
  return {kind:'record',title:'지금 녹음하기',badge:'',line:'짧게라도 한 번 불러 봐요',label:'지금 녹음하기',action:()=>nav('#/record')};
 }
 /* Home summary rows: next lesson (unless it is already the 지금 할 것 card) and next stage. What needs a check is in the
  * bell (attentionItems), not here, so it is not shown twice. The 이번 주 row is painted by the home from the week data. */
 function summaryRows(s,current){
  const rows=[],l=s.lesson,st=s.stage;
  if(l&&current?.kind!=='lesson')rows.push({key:'lesson',icon:'\ue34c',label:'다음 레슨',value:lessonDay(l.date)+(l.startTime?' '+l.startTime:''),badge:dday(l.date),action:()=>nav('#/lesson/'+encodeURIComponent(l.id))});
  if(st)rows.push({key:'stage',icon:'\ue490',label:({performance:'공연',audition:'오디션'})[st.kind]||'무대',value:st.title,badge:dday(st.date),action:()=>nav('#/show/'+encodeURIComponent(st.id))});
  const weekly=V.weeklySummaryHomeRow?.();if(weekly)rows.push(weekly); // 지난주 요약 (app/weekly-summary.js), Mon–Wed only
  return rows;
 }
 /** Up to three recent songs: the latest practised song first, then by recording activity. */
 /* 오늘 부를 곡 (app/song-pick-model.js) in the 최근 곡 place: up to three of my songs with the reason for today. Without
  * the model (an old cached script) the recent songs stay. */
 function todayPicks(s,files){
  const P=window.VzipSongPick;if(!P)return recentSongs(s,files);
  const media=(files||[]).map(m=>({songId:m?.songId,date:V.media?.dateOf?.(m)||''}));
  return P.pick(V.db,{today:today(),media}).map(x=>({id:x.songId,title:x.title,reason:x.reason,extra:x.extra}));
 }
 function recentSongs(s,files){
  const activity=V.songActivity(files),ids=[...activity.keys()].filter(id=>V.song(id)).sort((a,b)=>activity.get(b).localeCompare(activity.get(a)));
  if(s.recent?.song?.id)ids.unshift(s.recent.song.id);
  return [...new Set(ids)].filter(id=>V.song(id)).slice(0,3).map(id=>({id,title:V.song(id).title}));
 }
 /* 오늘 연습 (owner's design, 2026-11-26): ONE card for today's goals (계획) and today's practice records (추가), with
  * 오늘의 연습 and 타이머만 켜기 and small rows for 매일 보이스 체크 · 내 로드맵 · 주간 돌아보기. What is listed is
  * app/today-card.js; the card is design-system/today-card-html.js. Everything opens inside the card: no sheet, no
  * result popup (today against the target is always on the card). Writes go through VZ.change, the record shape is
  * 연습 기록 시트's (VZ.writePractice), goals keep their own rules (setGoal, perform, routines). */
 const T=window.VzipTodayCard,TP=window.VzipTodayPractice,R=window.VzipGoalRoutines;
 const songTitle=id=>V.songTitle?.(id)||'';
 const liveSongs=()=>(V.db.songs||[]).filter(x=>x&&!(V.db.deleted?.songs||[]).includes(x.id)&&!x.archived).map(x=>({id:x.id,title:x.title||'곡'}));
 const categoryNames=()=>[...new Set([...(T?.CATEGORIES||[]),...(V.db.categories||[]).map(c=>String(c?.name||'').trim()).filter(Boolean)])];
 /** The 분류 by name: the record's own one when it is unchanged, an existing one, or a new one (added on save, as the
  * practice sheet adds a new 분류). */
 const categoryFor=(name,p=null)=>{
  name=String(name||'').trim();if(!name)return {id:'',name:''};
  if(p&&p.categoryId&&String(p.categoryLabel||'').trim()===name)return {id:p.categoryId,name};
  const c=(V.db.categories||[]).find(x=>x&&String(x.name||'').trim()===name);
  return c?{id:c.id,name:c.name}:{id:V.uid(),name};
 };
 /** Check on a copy first (an Error says why), then write for real. */
 const write=(mutate,fail='저장하지 못했어요. 다시 시도해 주세요.')=>{mutate(structuredClone(V.db));if(!V.change(mutate,{silent:true}))throw Error(fail);return true;};
 function linkRows(){
  const rows=[],check=V.voiceCheck?.status?.();
  // Not done yet: straight into the 30-second check, as the home card did. Done: the page with today's result and the last 30 days.
  if(check)rows.push({key:'voice-check',icon:'',title:'매일 보이스 체크',state:check.line,tone:check.done?'done':'',
   label:'매일 보이스 체크, '+check.line+(check.done?', 결과 보기':', 30초 체크 시작하기'),action:()=>V.voiceCheck.status().done?nav('#/voice-check'):V.voiceCheck.open()});
  // 내 로드맵: a plain link. What it says to fix is in 다음 연습 and in 오늘의 연습 (다음 연습 하나로, 2026-11-26).
  if(V.roadmap)rows.push({key:'roadmap',icon:'',title:'내 로드맵',state:'',label:'내 로드맵 보기',action:()=>nav('#/roadmap')});
  rows.push({key:'weekly-review',icon:'',title:'주간 돌아보기',state:'다음 목표 추천',label:'주간 돌아보기 · 다음 목표 추천',action:()=>nav('#/practice-review')});
  return rows;
 }
 /** Everything the 오늘 연습 card shows. Reading it writes nothing. */
 function todayModel(files=V.media.cached()){
  if(!T)return null;
  const date=today();let data;
  try{data=T.build(V.db,{today:date,songTitle});}catch(error){console.error(error);return null;}
  const x=V.todayPractice?.()||{minutes:0,targetMinutes:null};
  let days=[],hint=null,set=null;
  try{days=TP?TP.recent(V.db,{date,today:date,defaultDailyTargetMinutes:dailyTarget(),timeEntries:V.timeEntries(files)}).map(d=>({date:d.date,label:d.label,minutes:d.minutes,met:d.met,today:d.today})):[];}catch(error){console.error(error);}
  try{hint=T.repeatHint(V.db,{today:date,songTitle});}catch(error){console.error(error);}
  const entry=V.practiceSetEntry?.();
  // 오늘의 연습: its button says the estimated time before starting ("시작하기 · 약 18분"); otherwise as the set says.
  if(entry)set={...entry,button:entry.state==='new'?'시작하기 · 약 '+entry.minutes+'분':entry.button};
  const goal=id=>(V.db.dailyGoals||[]).find(g=>g?.id===id);
  return {today:date,counts:data.counts,minutes:x.minutes,target:x.targetMinutes,days,
   // 녹음하기: the recorder carries the goal (and its song), as the goal row's mic did.
   plan:data.plan.map(g=>{const sid=goal(g.id)?.songId;return {...g,suggest:R?.suggestMinutes?.(V.db,goal(g.id))?.minutes??null,
    record:'#/record?goal='+encodeURIComponent(g.id)+(sid&&V.song(sid)?'&song='+encodeURIComponent(sid):'')};}),extra:data.extra,open:data.open,hint,set,
   groups:(window.VzipDailySet?.GROUPS||[]).map(g=>g.title),timer:V.freeTimer?.state()||null,timerBlocked:!V.freeTimer||!!V.freeTimer.blocked(),note:V.freeTimer?.note?.()||null,
   links:linkRows(),chips:V.PRACTICE_MINUTE_CHIPS||[5,10,20,30,60],songs:liveSongs(),categories:categoryNames()};
 }
 function todayActions(refresh){
  return {
   homeworkFor:date=>(V.db.assignments||[]).filter(t=>t&&!(V.db.deleted?.assignments||[]).includes(t.id)&&(V.taskInPeriod?V.taskInPeriod(t,date):t.status!=='done')).map(t=>({id:t.id,title:t.title||'숙제'})),
   // The circle only checks (or unchecks). No time sheet, no popup: the time is a choice in the row (시간 적고 체크).
   onToggle:async(id,completed)=>{
    const ok=V.change(db=>{if(!M.setGoal(db,id,completed))throw Error('이 목표가 변경됐어요. 화면을 새로 열어주세요.');},{silent:true});
    if(!ok)throw Error('체크를 저장하지 못했어요. 다시 시도해 주세요.');
    refresh();
   },
   // 오늘 기록 연결: the record names the goal and the goal is checked; no row is added, so no minute counts twice.
   onLink:(goalId,practiceId)=>write(db=>{T.link(db,{goalId,practiceId});},'기록을 연결하지 못했어요. 다시 시도해 주세요.'),
   // 시간 적고 체크: the goal's own practice row, as the time sheet always wrote it (one row per goal, saved again = replaced).
   onTimeCheck:(goalId,minutes)=>write(db=>{if(!M.setGoal(db,goalId,true))throw Error('이 목표가 변경됐어요. 화면을 새로 열어주세요.');R.perform(db,goalId,{minutes});}),
   onSetGo:()=>{if(V.dailySet?.go)V.dailySet.go();else nav('#/practice-set');},
   onSetPick:()=>V.dailySet?.pick?.(),
   onAddPlan:()=>planSheet(),
   // + 직접 적기: one practice record exactly as 연습 기록 시트 writes it; a chosen 계획 is linked to it, a homework gets
   // "했어요" (one 회) as the sheet records it — the homework itself is not marked done.
   onDirect:({minutes,date,goalId,homeworkId,songId,category,memo})=>{
    if(!(Number(minutes)>=1&&Number(minutes)<=1440))throw Error('연습 시간을 1분 이상 입력해 주세요.');
    if(!V.parseYmd(date))throw Error('날짜를 골라 주세요.');
    const id=V.uid(),created=Date.now(),cat=categoryFor(category),song=songId&&V.song(songId)?songId:'';
    write(db=>{
     V.writePractice(db,{date,minutes:Number(minutes),mode:song?'song':'training',songId:song,catId:cat.id,catName:cat.name,memo,
      completed:homeworkId?[homeworkId]:[],assignmentReps:homeworkId?{[homeworkId]:1}:{},assignmentNotes:{}},null,{id,created});
     if(goalId&&date===today())T.link(db,{goalId,practiceId:id});
    });
    window.dispatchEvent(new Event('vzip:practice-saved'));
    V.toast(date===today()?'연습 기록을 저장했어요.':V.dateLabel(date)+' 연습 기록을 저장했어요.');
    return true;
   },
   // A 추가 row's 곡 · 분류 · 메모, written back through the same save code (the record keeps its minutes and the rest).
   onEditExtra:(id,{songId,category,memo})=>{
    const p=(V.db.practices||[]).find(x=>x?.id===id);
    if(!p||!T.own(p))throw Error('이 기록은 여기서 고칠 수 없어요. 연습 기록에서 고쳐 주세요.');
    const song=songId&&V.song(songId)?songId:'',cat=categoryFor(category,p),same=cat.id&&cat.id===p.categoryId;
    if(song===(p.songId||'')&&cat.id===(p.categoryId||'')&&String(memo??'')===String(p.memo||''))return true;
    return write(db=>{V.writePractice(db,{date:p.date,minutes:V.practiceMinutes(p),mode:song?'song':'training',songId:song,catId:cat.id,catName:cat.name,
     detail:same?p.detail||'':'',detail2:same?p.detail2||'':'',recommendation:same&&p.recommendationSource?{source:p.recommendationSource,sourceId:p.recommendationSourceId}:null,
     rating:p.rating||0,memo:String(memo??''),completed:p.completed||[],assignmentReps:p.assignmentReps||{},assignmentNotes:p.assignmentNotes||{},
     mediaIds:p.mediaIds||[],mediaSeconds:p.mediaSeconds||0},p);});
   },
   onTimerStart:()=>V.freeTimer?.start(),
   onTimerStop:()=>V.freeTimer?.stop(),
   onTimerAway:choice=>V.freeTimer?.resolveAway(choice),
   // 반복 계획으로 넣기: a routine goal through the routine code (7 days from today, as the goal picker offers).
   onHint:()=>{
    const h=T.repeatHint(V.db,{today:today(),songTitle});if(!h)return true;
    write(db=>{R.create(db,{titles:[h.title],days:7,today:today(),uid:V.uid});});
    V.toast('오늘부터 7일 동안 매일 반복해요.');return true;
   }
  };
 }
 /** 큰 단계 next to the streak (app/levels.js): "Lv 3 · 이름" and how far to the next level. Read-only. */
 const levelLine=()=>V.levels?.home?.()||null;
 /* The bell (화면 지도 정리, 2026-11-26): only what needs the person's attention. 다음 레슨 · 다음 무대 · 숙제 are already in
  * 요약 and 지금 할 것. Counts are the server analysis ones (app/server-analysis.js); there is no kept count of failed
  * uploads (the import hub counts them per batch only), so they are not listed. */
 function attentionItems(){
  const c=V.serverAnalysisCounts?.(),review=c?.song?.review||0,failed=c?(c.vocal.fail+c.song.fail):0;
  return [review&&{key:'review',label:'곡 확인',count:review,href:'#/song-suggest'},failed&&{key:'failed',label:'분석 실패',count:failed,href:'#/processing-log'}].filter(Boolean);
 }
 function notices(){
  const items=attentionItems();
  V.sheet({title:'확인할 것',body:items.length?'<div class="list">'+items.map(i=>'<a class="item" href="'+i.href+'" data-attention="'+i.key+'"><span>'+esc(i.label)+' '+i.count+'건</span><i class="ph ph-caret-right" aria-hidden="true"></i></a>').join('')+'</div>':'<p class="muted" data-attention-empty>확인할 게 없어요</p>'});
 }
 /* 오늘 · 이번 주 row → a short sheet: today and this week against their targets, where the week target comes from
  * (with the way to change it) and the calendar. The numbers are the same ones the row shows. */
 function weekSheet(){
  const w=state().week,x=V.todayPractice?.()||{minutes:w.days.find(d=>d.today)?.minutes||0,targetMinutes:null,percent:null};
  const target=Number(w.targetMinutes)>0?Number(w.targetMinutes):null,percent=target?Math.round(w.actualMinutes/target*100):null,daily=w.dailyTargetMinutes;
  const bar=(value,label)=>value==null?'':'<div class="vz-today-bar" role="progressbar" aria-label="'+label+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,value)+'"><i style="width:'+Math.min(100,value)+'%"></i></div>';
  const block=(key,label,minutes,goal,ratio)=>'<div class="vz-week-block" data-week-block="'+key+'"><span>'+label+'</span><strong>'+esc(V.minutes(minutes))+'</strong><small>'+(goal?'/ 목표 '+esc(V.minutes(goal))+' · '+ratio+'%':'· 목표 없음')+'</small>'+bar(goal?ratio:null,label+' 목표 달성률')+'</div>';
  // Where the week target comes from, said once, with the place to change it.
  const [source,link,to]=target==null?['이번 주 목표가 없어요 · ','설정에서 하루 연습 목표를 정할 수 있어요','settings']:
   w.targetSource==='week'?['이번 주 목표로 직접 정한 시간이에요 · ','오늘의 목표 설정에서 바꿀 수 있어요','plan']:
   w.targetSource==='daily'?['하루 '+V.minutes(daily)+' × 7일 · ','설정에서 바꿀 수 있어요','settings']:
   ['요일마다 정한 목표를 더한 시간이에요'+(daily?' (기본 하루 '+V.minutes(daily)+')':'')+' · ','설정에서 바꿀 수 있어요','settings'];
  V.sheet({title:'이번 주 연습',variant:'compact',
   body:'<div class="vz-week-detail">'+block('today','오늘',x.minutes,x.targetMinutes,x.percent)+block('week','이번 주',w.actualMinutes,target,percent)+
    '<p class="vz-week-source" data-week-source>'+esc(source)+'<button type="button" data-week-setting>'+esc(link)+'</button></p></div>',
   foot:'<button type="button" class="btn block vz-home-primary-button" data-week-calendar>기록에서 보기</button>',
   onMount:(el,close)=>{
    el.classList.add('vz-plan-sheet','vz-week-sheet');
    el.parentNode.querySelector('[data-week-calendar]').onclick=()=>{close();calendar(today());};
    el.querySelector('[data-week-setting]').onclick=()=>{
     close();if(to==='plan')return planSheet();
     nav('#/settings');
     // Bring 하루 연습 목표 시간 into view once the settings page is drawn.
     let tries=0;const find=()=>{const row=document.querySelector('[data-daily-target]');if(row){row.scrollIntoView({block:'center'});row.focus({preventScroll:true});}else if(++tries<30)setTimeout(find,50);};find();
    };
   }});
 }
 function planSheet(options){
  // automatic: the once-a-day prompt. It offers goals only; time targets stay in this manual sheet and settings.
  const automatic=options?.automatic===true;
  const s=state(),expectedSnapshot=M.planSnapshot(V.db,s.today),existing=s.goals;
  // 다음 연습 담기: the top three of the ONE 다음 연습 list (VZ.nextPractice) that are not in today's goals yet (담김) and not
  // done today. Without the list, the model's suggestions as before.
  let next=null;try{next=V.nextPractice?.({date:s.today})||null;}catch(error){console.error(error);}
  const suggestions=next?next.items.filter(x=>!x.doneToday&&!x.inGoals&&x.canAdd).slice(0,3).map(item=>({title:item.title,source:item.source,item})):
   s.recommendationCandidates.filter(c=>c.source==='recommendation'&&!existing.some(g=>g.source===c.source&&g.sourceId===c.sourceId));
  // Completed goals and goals with a 수행 기록 are shown as kept (locked): unticking must never drop a check or its minutes.
  const choices=[...existing.map(g=>({key:'existing:'+g.id,goal:g,checked:true,kept:M.keptGoal(V.db,g)})),...suggestions.map((g,i)=>({key:'candidate:'+i,goal:g,checked:false}))];
  const routine=g=>!!window.VzipGoalRoutines?.routineOf(g);
  const label=g=>g.item?'다음 연습 · '+(V.nextPractice.label(g.item.source)||'추천'):g.source==='homework'?(routine(g)?'숙제·반복':'숙제'):g.source==='recommendation'?'추천':routine(g)?'반복':'개인';
  let dirty=false,approved=false,beforeUnload=null;
  // Prefill only explicit day/week plans; the settings default (onboarding) must not be written back as an override.
  const explicit=state(undefined,null,{withDefault:false}).week,dayTarget=explicit.days.find(d=>d.today)?.targetMinutes,weekTarget=explicit.targetMinutes;
  const defaultTarget=dailyTarget();
  const body='<form id="student-home-plan"><p class="vz-plan-intro">오늘 연습할 항목을 골라주세요.'+(automatic?' 하루 연습 시간은 설정에서 바꿀 수 있어요.':'')+'</p>'+
   (choices.length?'<fieldset class="vz-plan-section"><legend>오늘 할 목표 <span data-plan-count>'+existing.length+'개 선택</span></legend><div class="vz-plan-options">'+choices.map(c=>'<label class="vz-plan-option'+(c.kept?' is-kept':'')+'"><input type="checkbox" name="goal" value="'+esc(c.key)+'"'+(c.checked?' checked':'')+(c.kept?' disabled':'')+'><span class="vz-plan-check" aria-hidden="true"></span><span class="vz-plan-title">'+esc(c.goal.title)+'</span><small class="vz-plan-source">'+(c.kept?'<b>'+(c.kept==='done'?'완료':'기록 있음')+'</b> · ':'')+label(c.goal)+'</small></label>').join('')+'</div><p class="vz-plan-help">수행 체크는 숙제 완료나 연습 시간과 별도로 기록돼요.'+(choices.some(c=>c.kept)?' 완료했거나 수행 기록이 있는 목표는 오늘 목록에 그대로 남아요.':'')+'</p></fieldset>':'')+
   (next?.items.length?'<a class="vz-plan-next-all" href="#/next-practice" data-plan-next-all>다음 연습 전체 보기 <i class="ph ph-caret-right" aria-hidden="true"></i></a>':'')+
   '<label class="field vz-plan-personal"><span>개인 목표 <small>추가</small></span><textarea name="personal" aria-label="개인 목표" rows="2" maxlength="10000" placeholder="예: 후렴 고음에서 힘 빼기" aria-describedby="vz-plan-personal-help"></textarea><small id="vz-plan-personal-help" class="vz-plan-help">여러 목표는 한 줄에 하나씩 적어주세요.</small></label>'+
   (V.routineFields?.()||'')+
   (automatic?'':'<details class="vz-plan-time"'+(dayTarget!=null||weekTarget!=null?' open':'')+'><summary>연습 시간 목표 <small>선택</small><i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="two"><label class="field"><span>오늘 목표 시간(분)</span><input type="number" name="dayMinutes" min="0" max="1440" inputmode="numeric" value="'+(dayTarget??'')+'" placeholder="기본 '+defaultTarget+'분"></label>'+
   '<label class="field"><span>이번 주 목표 시간(분)</span><input type="number" name="weekMinutes" min="0" max="10080" inputmode="numeric" value="'+(weekTarget??'')+'" placeholder="미설정"></label></div><p class="vz-plan-help">설정한 시간 기준으로 달성률을 표시해요. 오늘 시간을 비워 두면 설정의 하루 목표('+defaultTarget+'분)를 써요.</p></details>')+'<p role="alert" data-plan-error></p></form>';
  V.sheet({title:'오늘의 목표',body,foot:(automatic?'<button type="button" class="btn secondary vz-plan-later">나중에 설정할래요</button>':'')+'<button type="submit" form="student-home-plan" class="btn block vz-home-primary-button">목표 저장</button>',
   onMount:(el,close)=>{
    el.classList.add('vz-plan-sheet');
    el.parentNode.querySelector('.vz-plan-later')?.addEventListener('click',close);
    const form=el.querySelector('form');form.addEventListener('input',()=>{dirty=true;});
    // 다음 연습 전체 보기: the list page (it closes this sheet; unsaved choices are asked about first, as on 닫기).
    el.querySelector('[data-plan-next-all]')?.addEventListener('click',event=>{event.preventDefault();if(dirty&&!approved&&!confirm('저장하지 않은 목표 설정을 닫을까요?'))return;approved=true;close();nav('#/next-practice');});
    V.routineBind?.(el,()=>{approved=true;dirty=false;close();V.softRender();setTimeout(planSheet,350);});
    form.addEventListener('change',()=>{const count=el.querySelector('[data-plan-count]');if(count)count.textContent=form.querySelectorAll('[name=goal]:checked').length+'개 선택';});
    beforeUnload=e=>{if(dirty&&!approved){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    const guard=e=>{if((e.target===el.parentNode||e.target.closest('[data-close]')||e.key==='Escape')&&dirty&&!approved&&!confirm('저장하지 않은 목표 설정을 닫을까요?')){e.preventDefault();e.stopImmediatePropagation();}};
    el.parentNode.addEventListener('click',guard,true);
    el.parentNode.addEventListener('keydown',guard,true);
    V.setGuard(()=>dirty&&!approved?'저장하지 않은 목표 설정이 있어요. 나갈까요?':'');
    form.onsubmit=async e=>{
      e.preventDefault();const button=el.parentNode.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
     try{
      // Kept (disabled) rows are not part of FormData: they always stay selected.
      // A 다음 연습 item becomes the goal the list's 목표에 담기 makes (VZ.nextPractice.goalFor).
      const data=new FormData(form),selected=new Set([...data.getAll('goal'),...choices.filter(c=>c.kept).map(c=>c.key)]),goals=choices.filter(c=>selected.has(c.key)).map(c=>c.checked?{...c.goal}:c.goal.item?(g=>g&&{...g,completed:false})(V.nextPractice.goalFor(c.goal.item,s.today)):{...c.goal,id:V.uid(),completed:false}).filter(Boolean);
      const personal=form.personal.value.split(/\r?\n/).map(t=>t.trim()).filter(Boolean),repeatDays=V.routineChoice?.(form)??null;
      if(repeatDays&&!personal.length)throw Error('반복할 개인 목표를 적어 주세요.');
      if(repeatDays&&personal.some(t=>t.length>200))throw Error('반복 목표는 200자 이내로 적어 주세요.');
      if(!repeatDays)for(const title of personal)goals.push({id:V.uid(),title,source:'personal',sourceId:'',completed:false});
      const n=(value,max)=>{if(value==='')return null;const v=Number(value);if(!Number.isFinite(v)||v<0||v>max)throw Error('목표 시간을 확인해 주세요.');return v;};
      if(expectedSnapshot!==M.planSnapshot(V.db,s.today))throw Error('목표나 시간 설정이 변경됐어요. 입력을 확인한 뒤 창을 다시 열어 주세요.');
      // Only write a time plan the user actually changed, so saving goals never pins the settings default.
      const times={};
      if(form.dayMinutes&&form.dayMinutes.value!==String(dayTarget??''))times.targetMinutes=n(form.dayMinutes.value,1440);
      if(form.weekMinutes&&form.weekMinutes.value!==String(weekTarget??''))times.weekTargetMinutes=n(form.weekMinutes.value,10080);
      if(!goals.length&&!repeatDays&&!existing.length&&!Object.keys(times).length)throw Error('숙제나 추천 목표를 선택하거나 목표를 직접 입력해 주세요.');
      // Unticking an existing goal removes it from today: ask once for all of them before saving.
      const removed=choices.filter(c=>c.checked&&!selected.has(c.key)).map(c=>c.goal);
      if(removed.length&&!await V.confirm('목표 빼기','목표 '+removed.length+'개를 오늘 목록에서 뺄까요?\n'+removed.slice(0,3).map(g=>'· '+g.title).join('\n')+(removed.length>3?'\n· 그 밖에 '+(removed.length-3)+'개':'')+
        (removed.some(routine)?'\n반복 목표는 오늘 것만 빠지고 내일부터는 그대로 반복해요.':'')+'\n완료한 목표와 연습 기록은 그대로 남아요.',{ok:'빼기'})){button.disabled=false;return;}
      if(!form.isConnected)return;
      const ok=V.change(db=>{M.savePlan(db,{date:s.today,expectedSnapshot,goals,...times});
       if(repeatDays)window.VzipGoalRoutines.create(db,{titles:personal,days:repeatDays,today:s.today,uid:V.uid});},{silent:true});
      if(!ok)throw Error('목표를 저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.');
      approved=true;dirty=false;close();delete document.getElementById('view').dataset.dirty;V.softRender();V.toast(repeatDays?'오늘부터 '+repeatDays+'일 동안 매일 반복해요.':'오늘의 목표를 저장했어요.');
     }catch(error){el.querySelector('[data-plan-error]').textContent=error.message;button.disabled=false;}
    };
   },onClose:()=>{V.setGuard(null);if(beforeUnload)window.removeEventListener('beforeunload',beforeUnload);}});
 }
 V.route('home',{title:'홈',leave(){stopHome();V.homeWants=null;},render(){stopHome();return '<div data-approved-home-host></div>';},
  async mount(main){
   const host=main.querySelector('[data-approved-home-host]');if(!host)return;
   let files=V.media.cached(),root;
   const s=state(files,selectedWeekStart),songs=recentSongs(s,files),current=nowCard(s,songs,nextList(files));
   const refreshWeek=()=>{root?.updateWeek(state(files,selectedWeekStart).week);root?.updateThisWeek?.(state(files).week,V.todayPractice?.());};
   try{root=await createFloatingHome({today:today(),thisWeek:state(files).week,todayPractice:V.todayPractice?.()||null,
    todayModel:todayModel(files),todayCard:todayActions(()=>{refreshWeek();delete main.dataset.dirty;}),onWeekSummary:weekSheet,week:s.week,now:current,summary:summaryRows(s,current),alerts:attentionItems(),recentSongs:todayPicks(s,files),
    onRecentSong:song=>nav('#/record?song='+encodeURIComponent(song.id)),
    onRandomSong:()=>{if(V.songRoulette)return V.songRoulette();const one=window.VzipSongPick?.random?.(V.db,{today:today(),media:(V.media.cached()||[]).map(m=>({songId:m?.songId,date:V.media?.dateOf?.(m)||''}))});if(!one)return;V.toast('오늘은 '+one.title+'!');nav('#/record?song='+encodeURIComponent(one.songId));},onWeek:()=>nav('#/calendar'),onDay:calendar,onRecord:source=>window.VzipRecordTransition?.open(source,'#/record')||nav('#/record'),onNavigate:id=>nav('#/'+id),
    level:levelLine(),onLevel:()=>nav('#/levels'),onGoals:planSheet,onNotifications:notices,onProfile:()=>nav('#/settings'),onCalendar:()=>calendar(today()),onWeek:()=>calendar(today()),onDay:calendar,
    onWeekMove:delta=>{const week=state(files,selectedWeekStart).week;if(delta<0&&!week.canPrevious||delta>0&&!week.canNext)return;const d=V.parseYmd(week.start);d.setDate(d.getDate()+delta*7);selectedWeekStart=V.ymd(d);refreshWeek();},
    onStage:()=>s.stage?nav('#/show/'+encodeURIComponent(s.stage.id)):nav('#/performances'),
    onLesson:()=>s.lesson?nav('#/lesson/'+encodeURIComponent(s.lesson.id)):V.lessonSheet()});
   }catch(error){
    if(!host.isConnected)return;
    host.innerHTML='<p role="alert">홈을 불러오지 못했어요. 기록은 그대로 보관돼 있어요.</p><button type="button" data-home-retry>다시 불러오기</button> <a href="#/songs">내 곡으로 이동</a>';
    host.querySelector('[data-home-retry]').onclick=()=>V.render();return;
   }
   if(!host.isConnected)return;
   host.replaceChildren(root);applyTheme();
   // 오늘 연습 asked for (V.homeShow): once now that home is drawn, and again after the recordings are read (the cards
   // above may have changed height meanwhile).
   const wanted=practiceWanted();
   if(wanted)requestAnimationFrame(()=>{if(root.isConnected)root.showPractice();});
   // A check, a record, a submission or a set saved while home is open: the card, today and the week follow without
   // drawing home again.
   const practiceChanged=()=>{if(root.isConnected){root.updateToday?.(todayModel(files));refreshWeek();root.updateLevel?.(levelLine());}};
   // 타이머만 켜기: its second only changes the time on the card; starting, stopping or a long gap draws the card again.
   let timerShape='';
   const timerChanged=()=>{
    if(!root.isConnected)return;
    const st=V.freeTimer?.state()||null,shape=st?(st.away?'away':'run'):'off';
    if(shape!==timerShape){timerShape=shape;root.updateToday?.(todayModel(files));}else root.tickToday?.(st);
   };
   timerShape=(st=>st?(st.away?'away':'run'):'off')(V.freeTimer?.state()||null);
   const unwatchTimer=V.freeTimer?.watch?.(timerChanged)||(()=>{});
   let mediaGeneration=0,lastDate=today();
   const refreshMedia=async()=>{
    const generation=++mediaGeneration;
    const media=await V.media.list().catch(()=>files);
    if(!root.isConnected||generation!==mediaGeneration)return;
    files=media;refreshWeek();
    // 발성 정밀 측정 results (this device) are part of 다음 연습: read them once here, as 성장 › 나 does.
    await V.nextPractice?.loadPrecision?.();
    if(!root.isConnected||generation!==mediaGeneration)return;
    const fresh=state(files),list=recentSongs(fresh,media),next=nowCard(fresh,list,nextList(media));
    root.updateRecent(todayPicks(fresh,media));root.updateNow(next);root.updateSummary(summaryRows(fresh,next));root.updateAlerts?.(attentionItems());root.updateToday?.(todayModel(media));root.updateLevel?.(levelLine());
   };
   const checkDate=()=>{if(root.isConnected&&today()!==lastDate){lastDate=today();V.softRender();}};
   const visible=()=>{if(document.visibilityState==='visible'){checkDate();if(root.isConnected)refreshMedia();}};
   const timer=setInterval(checkDate,30000);
   // The bell's dot follows the server analysis counts as soon as they arrive (they load after home is drawn).
   const alertsChanged=()=>{if(root.isConnected)root.updateAlerts?.(attentionItems());};
   window.addEventListener('vzip:v6-media',refreshMedia);window.addEventListener('vzip:data-changed',practiceChanged);window.addEventListener('vzip:server-analysis-updated',alertsChanged);
   document.addEventListener('visibilitychange',visible);
   stopHome=()=>{unwatchTimer();clearInterval(timer);window.removeEventListener('vzip:v6-media',refreshMedia);window.removeEventListener('vzip:data-changed',practiceChanged);window.removeEventListener('vzip:server-analysis-updated',alertsChanged);document.removeEventListener('visibilitychange',visible);};
   await refreshMedia();
   if(wanted&&root.isConnected)root.showPractice();
   // A level passed since it was last kept is kept now (rare: nine times in all), so it never drops when a record is deleted.
   if(root.isConnected)V.levels?.keepReached?.();
   // Record first contact as the baseline; starting with the following day,
   // offer the goal picker once per local date. Skipping never loops on re-entry.
   // The date is a per-device UI marker (account-scoped storage), not a record: writing it to V.db
   // would add a cloud save on every first home visit of the day.
   if(root.isConnected){
    const store=window.VzipAccountScope?.storage||window.localStorage,key='vzip_daily_goal_prompt:'+(owner()||'local');
    const date=today();let seen=null,saved=false;
    try{seen=store.getItem(key);if(seen!==date){store.setItem(key,date);saved=true;}}catch{}
    if(saved&&seen&&state(files).goals.length===0){
     setTimeout(()=>{if(root.isConnected&&today()===date&&!document.querySelector('.sheet-back'))planSheet({automatic:true});},0);
    }
   }
  }});
 // Reuse the existing practice detail/edit/record actions; the old app had no standalone history route.
 V.route('practices',{title:'연습 기록',back:true,tab:'calendar',
  actions:()=>'<button type="button" class="icon-btn" data-home-add-practice aria-label="연습 기록 추가"><i class="ph ph-plus"></i></button>',
  render(){
   // One heading per day (newest first), each record in the shared practice row: real time (V.practiceMinutes), where it
   // was recorded, the person's own memo. Removed rows and empty step rows of 오늘의 연습 (their time lives in the goal's
   // record) are left out of the list only; nothing stored changes.
   const gone=new Set(V.db.deleted?.practices||[]);
   const rows=[...V.db.practices].filter(p=>p&&!gone.has(p.id)&&!p.deleted&&!(V.practiceHidden?.(p))).sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.created||0)-(a.created||0));
   const days=new Map();for(const p of rows){const k=String(p.date||'');if(!days.has(k))days.set(k,[]);days.get(k).push(p);}
   const row=p=>V.practiceRow?V.practiceRow(p,{day:true}):'<button type="button" class="item" data-practice="'+esc(p.id)+'"><span class="item-main"><span class="item-title">'+esc(V.songTitle(p.songId)||'연습')+'</span></span></button>';
   return rows.length?[...days].map(([d,list])=>{const total=list.reduce((s,p)=>s+(p.practiceTimeSource==='unconfirmed'?0:(V.practiceMinutes?.(p)||0)),0);
     return '<h3 class="cal-group practice vz-practice-day"><span>'+esc(dayLabel(d))+'</span>'+(total>0?'<span class="vz-practice-day-total">'+esc(V.minutes(total))+'</span>':'')+'</h3><div class="list">'+list.map(row).join('')+'</div>';}).join(''):
    V.empty('timer','아직 연습 기록이 없어요.','<button type="button" class="btn" data-home-add-practice>연습 기록 추가</button>');
  },mount(main){document.querySelectorAll('[data-home-add-practice]').forEach(b=>b.onclick=()=>V.practiceSheet());}});
 applyTheme();
 // This module registers its routes after the first render: draw again when the address is one of them (reload / deep link).
 if(['home','practices'].includes(location.hash.replace(/^#\/?/,'').split(/[/?]/)[0]||'home'))V.softRender();
}






