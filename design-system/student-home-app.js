/* Approved student home: thin adapter over existing VZ records/actions.
 * No auth, upload, analysis, billing or server-policy changes. */
import {createFloatingHome} from './student-home-html.js?v=pset-20261112';
const V=window.VZ,M=window.VzipStudentHomeModel;
if(V&&M&&window.VZIP_APPROVED_HOME_ENABLED!==false){
 const esc=V.esc,nav=hash=>V.nav(hash),today=()=>V.today();
 const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'';
 // Daily time target chosen at signup (account metadata) or later in settings; 30 minutes when neither exists.
 const dailyTarget=()=>V.db.settings?.dailyTargetMinutes??window.vzipCloudUserDailyTarget?.()??30;
 const state=(files=V.media.cached(),weekStart=null,{withDefault=true}={})=>{
  const db={...V.db,performances:(V.db.performances||[]).filter(p=>p.ownerId===owner()&&owner())};
  const options={...(withDefault?{defaultDailyTargetMinutes:dailyTarget()}:{}),today:today(),timeEntries:V.timeEntries(files),mediaDates:files.filter(f=>!V.db.deleted?.media?.includes(f.id)).map(f=>V.media.dateOf(f))};
  const bounds=M.weekBounds(db,options),requested=weekStart||bounds.current;
  return M.build(db,{...options,weekStart:requested<bounds.first?bounds.first:requested>bounds.last?bounds.last:requested});
 };
 let selectedWeekStart=null,stopHome=()=>{};
 const calendar=date=>nav('#/calendar?date='+encodeURIComponent(date));
 const dayLabel=date=>date?V.dateLabel(date):'';
 const lessonDay=date=>{const d=V.parseYmd(date);return d?(d.getMonth()+1)+'.'+d.getDate()+' ('+'일월화수목금토'[d.getDay()]+')':'';};
 const meta=document.querySelector('meta[name="theme-color"]'),originalTheme=meta?.content;
 function applyTheme(){
  const home=!!document.querySelector('[data-approved-home-host]');
  document.body.classList.toggle('vz-home-mode',home);
   if(meta)meta.content=home?'#f8f6fd':document.body.classList.contains('vz-record-mode')?'#0b0911':originalTheme;
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
  * then the next lesson; with nothing at all, setting today's goals. */
 const dday=date=>{const n=V.daysBetween(today(),date);return n===0?'D-day':n>0?'D-'+n:'';};
 function nowCard(s,songs){
  const l=s.lesson,lessonToday=l&&V.daysBetween(today(),l.date)===0,homework=s.recommendationCandidates.find(t=>t.source==='homework');
  const lessonCard=title=>({kind:'lesson',title:title+(l.title||'보컬 레슨'),badge:lessonToday?(l.startTime||'오늘'):dday(l.date),line:lessonToday?[l.place,l.teacher].filter(Boolean).join(' · ')||'레슨 준비하기':lessonDay(l.date)+(l.startTime?' '+l.startTime:''),label:'다음 레슨 보기',action:()=>nav('#/lesson/'+encodeURIComponent(l.id))});
  if(lessonToday)return lessonCard('오늘 ');
  if(homework)return {kind:'homework',title:homework.title,badge:'숙제',line:'오늘 해 볼 숙제예요',label:'숙제 '+homework.title+' 보기',action:()=>nav('#/homework')};
  if(songs[0])return {kind:'practice',title:'이어서 연습하기',badge:'',line:songs[0].title,label:songs[0].title+' 이어서 연습하기',action:()=>nav('#/record?song='+encodeURIComponent(songs[0].id))};
  if(l)return lessonCard('');
  // Nothing scheduled or practised: suggest one practice in 노래 연습실 instead of a second "오늘의 목표 정하기" (the
  // empty goal list below already offers that). A suggestion already in today's goals is not repeated; then simply record.
  const rec=s.recommendationCandidates.find(c=>c.source==='recommendation'&&!(s.goals||[]).some(g=>g.source===c.source&&g.sourceId===c.sourceId));
  if(rec)return {kind:'recommend',title:rec.title,badge:'추천',line:'연습실에서 시작해요',label:'추천 연습 '+rec.title,action:()=>nav('#/practice-room')};
  return {kind:'record',title:'지금 녹음하기',badge:'',line:'짧게라도 한 번 불러 봐요',label:'지금 녹음하기',action:()=>nav('#/record')};
 }
 /* Home summary rows: next lesson (unless it is already the 지금 할 것 card), next stage, and a needs-attention row
  * only when something needs attention. The 이번 주 row is painted by the home from the week data. */
 function summaryRows(s,current){
  const rows=[],l=s.lesson,st=s.stage;
  if(l&&current?.kind!=='lesson')rows.push({key:'lesson',icon:'\ue34c',label:'다음 레슨',value:lessonDay(l.date)+(l.startTime?' '+l.startTime:''),badge:dday(l.date),action:()=>nav('#/lesson/'+encodeURIComponent(l.id))});
  if(st)rows.push({key:'stage',icon:'\ue490',label:({performance:'공연',audition:'오디션'})[st.kind]||'무대',value:st.title,badge:dday(st.date),action:()=>nav('#/show/'+encodeURIComponent(st.id))});
  const c=V.serverAnalysisCounts?.(),review=c?.song?.review||0,failed=c?(c.vocal.fail+c.song.fail):0;
  if(review)rows.push({key:'attention',tone:'attention',icon:'\ue4e2',label:'확인 필요',value:'곡 확인 '+review+'건',action:()=>nav('#/song-suggest')});
  else if(failed)rows.push({key:'attention',tone:'attention',icon:'\ue4e2',label:'확인 필요',value:'분석 실패 '+failed+'건',action:()=>nav('#/processing-log')});
  return rows;
 }
 /** Up to three recent songs: the latest practised song first, then by recording activity. */
 function recentSongs(s,files){
  const activity=V.songActivity(files),ids=[...activity.keys()].filter(id=>V.song(id)).sort((a,b)=>activity.get(b).localeCompare(activity.get(a)));
  if(s.recent?.song?.id)ids.unshift(s.recent.song.id);
  return [...new Set(ids)].filter(id=>V.song(id)).slice(0,3).map(id=>({id,title:V.song(id).title}));
 }
 function notices(){
  const s=state(),tasks=s.recommendationCandidates.filter(t=>t.source==='homework');
  const content=(s.lesson?'<a class="item" href="#/lesson/'+esc(s.lesson.id)+'"><span>'+esc(dayLabel(s.lesson.date))+' · 다음 레슨</span></a>':'')+
   (s.stage?'<a class="item" href="#/show/'+esc(s.stage.id)+'"><span>'+esc(s.stage.title)+' · '+esc(dayLabel(s.stage.date))+'</span></a>':'')+
   tasks.map(t=>'<a class="item" href="#/homework"><span>'+esc(t.title)+'</span><small class="muted">숙제</small></a>').join('');
  V.sheet({title:'일정과 숙제 알림',body:content?'<div class="list">'+content+'</div>':'<p class="muted">확인할 일정과 숙제가 없어요.</p>'});
 }
 function planSheet(options){
  // automatic: the once-a-day prompt. It offers goals only; time targets stay in this manual sheet and settings.
  const automatic=options?.automatic===true;
  const s=state(),expectedSnapshot=M.planSnapshot(V.db,s.today),existing=s.goals;
  const suggestions=s.recommendationCandidates.filter(c=>c.source==='recommendation'&&!existing.some(g=>g.source===c.source&&g.sourceId===c.sourceId));
  const choices=[...existing.map(g=>({key:'existing:'+g.id,goal:g,checked:true})),...suggestions.map((g,i)=>({key:'candidate:'+i,goal:g,checked:false}))];
  let recommended=[];
  const routine=g=>!!window.VzipGoalRoutines?.routineOf(g);
  const label=g=>g.source==='homework'?(routine(g)?'숙제·반복':'숙제'):g.source==='recommendation'?'추천':routine(g)?'반복':'개인';
  let dirty=false,approved=false,beforeUnload=null;
  // Prefill only explicit day/week plans; the settings default (onboarding) must not be written back as an override.
  const explicit=state(undefined,null,{withDefault:false}).week,dayTarget=explicit.days.find(d=>d.today)?.targetMinutes,weekTarget=explicit.targetMinutes;
  const defaultTarget=dailyTarget();
  const body='<form id="student-home-plan"><p class="vz-plan-intro">오늘 연습할 항목을 골라주세요.'+(automatic?' 하루 연습 시간은 설정에서 바꿀 수 있어요.':'')+'</p><div data-guided-recommendations></div>'+
   (choices.length?'<fieldset class="vz-plan-section"><legend>오늘 할 목표 <span data-plan-count>'+existing.length+'개 선택</span></legend><div class="vz-plan-options">'+choices.map(c=>'<label class="vz-plan-option"><input type="checkbox" name="goal" value="'+esc(c.key)+'"'+(c.checked?' checked':'')+'><span class="vz-plan-check" aria-hidden="true"></span><span class="vz-plan-title">'+esc(c.goal.title)+'</span><small class="vz-plan-source">'+label(c.goal)+'</small></label>').join('')+'</div><p class="vz-plan-help">수행 체크는 숙제 완료나 연습 시간과 별도로 기록돼요.</p></fieldset>':'')+
   '<label class="field vz-plan-personal"><span>개인 목표 <small>추가</small></span><textarea name="personal" aria-label="개인 목표" rows="2" maxlength="10000" placeholder="예: 후렴 고음에서 힘 빼기" aria-describedby="vz-plan-personal-help"></textarea><small id="vz-plan-personal-help" class="vz-plan-help">여러 목표는 한 줄에 하나씩 적어주세요.</small></label>'+
   (V.routineFields?.()||'')+
   (automatic?'':'<details class="vz-plan-time"'+(dayTarget!=null||weekTarget!=null?' open':'')+'><summary>연습 시간 목표 <small>선택</small><i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="two"><label class="field"><span>오늘 목표 시간(분)</span><input type="number" name="dayMinutes" min="0" max="1440" inputmode="numeric" value="'+(dayTarget??'')+'" placeholder="기본 '+defaultTarget+'분"></label>'+
   '<label class="field"><span>이번 주 목표 시간(분)</span><input type="number" name="weekMinutes" min="0" max="10080" inputmode="numeric" value="'+(weekTarget??'')+'" placeholder="미설정"></label></div><p class="vz-plan-help">설정한 시간 기준으로 달성률을 표시해요. 오늘 시간을 비워 두면 설정의 하루 목표('+defaultTarget+'분)를 써요.</p></details>')+'<p role="alert" data-plan-error></p></form>';
  V.sheet({title:'오늘의 목표',body,foot:(automatic?'<button type="button" class="btn secondary vz-plan-later">나중에 설정할래요</button>':'')+'<button type="submit" form="student-home-plan" class="btn block vz-home-primary-button">목표 저장</button>',
   onMount:(el,close)=>{
    el.classList.add('vz-plan-sheet');
    el.parentNode.querySelector('.vz-plan-later')?.addEventListener('click',close);
    const form=el.querySelector('form');form.addEventListener('input',()=>{dirty=true;});
    V.guidedRecommendations?.({date:s.today}).then(rows=>{
      if(!form.isConnected)return;
      recommended=rows.filter(c=>!existing.some(g=>(g.sourceId===(c.assignmentId||c.key)&&g.source===(c.assignmentId?'homework':'recommendation'))||(c.kind==='room'&&g.recommendation?.sourceId===c.sourceId)));
      el.querySelector('[data-guided-recommendations]').innerHTML=recommended.length?V.guidedRecommendationCards(recommended,{selectable:true,showStart:false}):'';
    }).catch(()=>{});
    V.routineBind?.(el,()=>{approved=true;dirty=false;close();V.softRender();setTimeout(planSheet,350);});
    form.addEventListener('change',()=>{const count=el.querySelector('[data-plan-count]');if(count)count.textContent=form.querySelectorAll('[name=goal]:checked').length+'개 선택';});
    beforeUnload=e=>{if(dirty&&!approved){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    const guard=e=>{if((e.target===el.parentNode||e.target.closest('[data-close]')||e.key==='Escape')&&dirty&&!approved&&!confirm('저장하지 않은 목표 설정을 닫을까요?')){e.preventDefault();e.stopImmediatePropagation();}};
    el.parentNode.addEventListener('click',guard,true);
    el.parentNode.addEventListener('keydown',guard,true);
    V.setGuard(()=>dirty&&!approved?'저장하지 않은 목표 설정이 있어요. 나갈까요?':'');
    form.onsubmit=e=>{
      e.preventDefault();const button=el.parentNode.querySelector('[type=submit]');button.disabled=true;
     try{
      const data=new FormData(form),selected=new Set(data.getAll('goal')),goals=choices.filter(c=>selected.has(c.key)).map(c=>c.checked?{...c.goal}:{...c.goal,id:V.uid(),completed:false});
      const guided=new Set(data.getAll('guided-recommendation'));
      for(const c of recommended.filter(c=>guided.has(c.key)))goals.push({id:V.uid(),title:c.title,source:c.assignmentId?'homework':'recommendation',sourceId:c.assignmentId||c.key,...(c.kind==='room'?{songId:c.songId,recommendation:{reason:c.reason,action:c.action,minutes:c.minutes,days:c.days,section:c.section,task:c.task,sourceId:c.sourceId}}:{}),completed:false});
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
      const ok=V.change(db=>{M.savePlan(db,{date:s.today,expectedSnapshot,goals,...times});
       if(repeatDays)window.VzipGoalRoutines.create(db,{titles:personal,days:repeatDays,today:s.today,uid:V.uid});},{silent:true});
      if(!ok)throw Error('목표를 저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.');
      approved=true;dirty=false;close();delete document.getElementById('view').dataset.dirty;V.softRender();V.toast(repeatDays?'오늘부터 '+repeatDays+'일 동안 매일 반복해요.':'오늘의 목표를 저장했어요.');
     }catch(error){el.querySelector('[data-plan-error]').textContent=error.message;button.disabled=false;}
    };
   },onClose:()=>{V.setGuard(null);if(beforeUnload)window.removeEventListener('beforeunload',beforeUnload);}});
 }
 V.route('home',{title:'홈',leave(){stopHome();},render(){stopHome();return '<div data-approved-home-host></div>';},
  async mount(main){
   const host=main.querySelector('[data-approved-home-host]');if(!host)return;
   let files=V.media.cached(),root;
   const s=state(files,selectedWeekStart),songs=recentSongs(s,files),current=nowCard(s,songs);
   const refreshWeek=()=>{root?.updateWeek(state(files,selectedWeekStart).week);root?.updateThisWeek?.(state(files).week);};
   try{root=await createFloatingHome({today:today(),thisWeek:state(files).week,goals:s.goals.map(g=>({...g,routineInfo:V.routineInfo?.(g)||null})),onGoalRecord:id=>V.goalPerformanceSheet?.(id),week:s.week,now:current,summary:summaryRows(s,current),recentSongs:songs,
    onRecentSong:song=>nav('#/record?song='+encodeURIComponent(song.id)),onWeek:()=>nav('#/calendar'),onDay:calendar,onRecord:source=>window.VzipRecordTransition?.open(source,'#/record')||nav('#/record'),onNavigate:id=>nav('#/'+id),
    practiceSet:V.practiceSetEntry?.()||null,onPracticeSet:()=>nav('#/practice-set'),onGoals:planSheet,onDailyRecommendation:()=>nav('#/practice-review?mode=today'),onWeeklyReview:()=>nav('#/practice-review'),onGuidedPractice:c=>nav(c.href||'#/guided-practice/'+encodeURIComponent(c.key)+(c.songId?'?song='+encodeURIComponent(c.songId):'')),onNotifications:notices,onProfile:()=>nav('#/settings'),onCalendar:()=>calendar(today()),onWeek:()=>calendar(today()),onDay:calendar,
    onWeekMove:delta=>{const week=state(files,selectedWeekStart).week;if(delta<0&&!week.canPrevious||delta>0&&!week.canNext)return;const d=V.parseYmd(week.start);d.setDate(d.getDate()+delta*7);selectedWeekStart=V.ymd(d);refreshWeek();},
    onStage:()=>s.stage?nav('#/show/'+encodeURIComponent(s.stage.id)):nav('#/performances'),
    onLesson:()=>s.lesson?nav('#/lesson/'+encodeURIComponent(s.lesson.id)):V.lessonSheet(),
    onGoalToggle:async(id,completed)=>{
     const ok=V.change(db=>{if(!M.setGoal(db,id,completed))throw Error('이 목표가 변경됐어요. 화면을 새로 열어주세요.');},{silent:true});
     if(!ok)throw Error('체크를 저장하지 못했어요. 다시 시도해 주세요.');
     refreshWeek();
     delete main.dataset.dirty;
     if(completed)V.goalPerformanceOffer?.(id);
    }});
   }catch(error){
    if(!host.isConnected)return;
    host.innerHTML='<p role="alert">홈을 불러오지 못했어요. 기록은 그대로 보관돼 있어요.</p><button type="button" data-home-retry>다시 불러오기</button> <a href="#/songs">내 곡으로 이동</a>';
    host.querySelector('[data-home-retry]').onclick=()=>V.render();return;
   }
   if(!host.isConnected)return;
   host.replaceChildren(root);applyTheme();
   let mediaGeneration=0,lastDate=today();
   const refreshMedia=async()=>{
    const generation=++mediaGeneration;
    const media=await V.media.list().catch(()=>files);
    if(!root.isConnected||generation!==mediaGeneration)return;
    files=media;refreshWeek();
    const recommendations=await V.guidedRecommendations({date:today(),media}).catch(()=>[]);
    if(root.isConnected&&generation===mediaGeneration)root.updateRecommendations(recommendations);
    const fresh=state(files),list=recentSongs(fresh,media),next=nowCard(fresh,list);
    root.updateRecent(list);root.updateNow(next);root.updateSummary(summaryRows(fresh,next));root.updatePracticeSet?.(V.practiceSetEntry?.()||null);
   };
   const checkDate=()=>{if(root.isConnected&&today()!==lastDate){lastDate=today();V.softRender();}};
   const visible=()=>{if(document.visibilityState==='visible'){checkDate();if(root.isConnected)refreshMedia();}};
   const timer=setInterval(checkDate,30000);
   window.addEventListener('vzip:v6-media',refreshMedia);
   document.addEventListener('visibilitychange',visible);
   stopHome=()=>{clearInterval(timer);window.removeEventListener('vzip:v6-media',refreshMedia);document.removeEventListener('visibilitychange',visible);};
   await refreshMedia();
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
   const rows=[...V.db.practices].sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.created||0)-(a.created||0));
   return rows.length?'<div class="list">'+rows.map(p=>'<button type="button" class="item" data-practice="'+esc(p.id)+'"><span class="avatar"><i class="ph ph-timer"></i></span><span class="item-main"><span class="item-title">'+esc(p.practiceMode==='training'?(p.detail||p.categoryLabel||'보컬 트레이닝'):(V.songTitle(p.songId)||'연습'))+'</span><span class="item-sub">'+esc(dayLabel(p.date))+' · '+esc(V.minutes(p.manualMinutes??p.minutes))+'</span></span><i class="ph ph-caret-right"></i></button>').join('')+'</div>':
    V.empty('timer','아직 연습 기록이 없어요.','<button type="button" class="btn" data-home-add-practice>연습 기록 추가</button>');
  },mount(main){document.querySelectorAll('[data-home-add-practice]').forEach(b=>b.onclick=()=>V.practiceSheet());}});
 applyTheme();
 if((location.hash.replace(/^#\/?/,'').split(/[/?]/)[0]||'home')==='home')V.softRender();
}






