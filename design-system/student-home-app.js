/* Approved student home: thin adapter over existing VZ records/actions.
 * No auth, upload, analysis, billing or server-policy changes. */
import {createFloatingHome} from './student-home-html.js?v=12';
const V=window.VZ,M=window.VzipStudentHomeModel;
if(V&&M&&window.VZIP_APPROVED_HOME_ENABLED!==false){
 const esc=V.esc,nav=hash=>V.nav(hash),today=()=>V.today();
 const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'';
 const state=(files=V.media.cached(),weekStart=null)=>{
  const db={...V.db,performances:(V.db.performances||[]).filter(p=>p.ownerId===owner()&&owner())};
  const options={today:today(),timeEntries:V.timeEntries(files),mediaDates:files.filter(f=>!V.db.deleted?.media?.includes(f.id)).map(f=>V.media.dateOf(f))};
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
  if(meta)meta.content=home?'#f8f6fd':originalTheme;
  const route=(location.hash.startsWith('#/')?location.hash.slice(2):location.hash.slice(1)).split('/')[0].split('?')[0];
  if(route==='library'||route==='practices'||route==='growth'){
   document.querySelectorAll('.v-nav [aria-current]').forEach(a=>a.removeAttribute('aria-current'));
   document.querySelector('.v-nav [data-nav="'+({library:'library',practices:'calendar',growth:'home'}[route])+'"]')?.setAttribute('aria-current','page');
  }
 }
 new MutationObserver(applyTheme).observe(document.getElementById('view'),{childList:true});
 window.addEventListener('hashchange',applyTheme);
 const greeting=()=>new Date().getHours()<12?'좋은 아침이에요':new Date().getHours()<18?'좋은 오후예요':'좋은 저녁이에요';
 const displayName=()=>String(V.db.profile?.displayName||V.db.settings?.displayName||'');
 function upcoming(s){
  const stage=s.stage?{id:s.stage.id,title:s.stage.title,subtitle:s.stage.songTitles.join(' · '),
   date:s.stage.date,time:s.stage.time||'',dateLabel:dayLabel(s.stage.date)+(s.stage.time?' '+s.stage.time:''),daysLeft:s.stage.daysUntil}:null;
  const l=s.lesson,lesson=l?{id:l.id,title:l.title||'보컬 레슨',subtitle:[l.place,l.teacher].filter(Boolean).join(' · '),
   date:l.date,time:l.startTime||'',dateLabel:lessonDay(l.date)+(l.startTime?' '+l.startTime:''),daysLeft:V.daysBetween(today(),l.date)}:null;
  return {stage,lesson};
 }
 function recentData(recent,files=[]){
  if(!recent)return null;
  const media=files.filter(f=>f.songId===recent.song.id&&!V.db.deleted?.media?.includes(f.id))
   .sort((a,b)=>String(window.VZ.media.dateOf(b)||'').localeCompare(String(window.VZ.media.dateOf(a)||''))||(b.created||0)-(a.created||0))[0];
  return {id:recent.song.id,title:recent.song.title,artist:recent.song.show||'',canPlay:!!media,media};
 }
 function recentCallbacks(recent){
  return {onRecent:()=>recent?nav('#/record?song='+encodeURIComponent(recent.id)):nav('#/songs'),
   onContinue:()=>recent?nav('#/record?song='+encodeURIComponent(recent.id)):nav('#/songs'),
   onLessons:()=>nav('#/lessons'),onPractice:()=>nav('#/practices')};
 }
 function notices(){
  const s=state(),tasks=s.recommendationCandidates;
  const content=(s.lesson?'<a class="item" href="#/lesson/'+esc(s.lesson.id)+'"><span>'+esc(dayLabel(s.lesson.date))+' · 다음 레슨</span></a>':'')+
   (s.stage?'<a class="item" href="#/show/'+esc(s.stage.id)+'"><span>'+esc(s.stage.title)+' · '+esc(dayLabel(s.stage.date))+'</span></a>':'')+
   tasks.map(t=>'<a class="item" href="#/homework"><span>'+esc(t.title)+'</span><small class="muted">숙제</small></a>').join('');
  V.sheet({title:'일정과 숙제 알림',body:content?'<div class="list">'+content+'</div>':'<p class="muted">확인할 일정과 숙제가 없어요.</p>'});
 }
 function planSheet(){
  const s=state(),existing=s.goals,candidates=s.recommendationCandidates.filter(c=>!existing.some(g=>g.source==='homework'&&g.sourceId===c.sourceId));
  const choices=[...existing.map(g=>({key:'existing:'+g.id,goal:g,checked:true})),...candidates.map((g,i)=>({key:'candidate:'+i,goal:g,checked:false}))];
  const label=g=>g.source==='homework'?'숙제':g.source==='recommendation'?'추천':'개인';
  let dirty=false,approved=false,beforeUnload=null;
  const dayTarget=s.week.days.find(d=>d.today)?.targetMinutes;
  const body='<form id="student-home-plan"><p class="vz-plan-intro">오늘 연습할 항목을 골라주세요.</p>'+
   (choices.length?'<fieldset class="vz-plan-section"><legend>오늘 할 목표 <span data-plan-count>'+existing.length+'개 선택</span></legend><div class="vz-plan-options">'+choices.map(c=>'<label class="vz-plan-option"><input type="checkbox" name="goal" value="'+esc(c.key)+'"'+(c.checked?' checked':'')+'><span class="vz-plan-check" aria-hidden="true"></span><span class="vz-plan-title">'+esc(c.goal.title)+'</span><small class="vz-plan-source">'+label(c.goal)+'</small></label>').join('')+'</div><p class="vz-plan-help">수행 체크는 숙제 완료나 연습 시간과 별도로 기록돼요.</p></fieldset>':'')+
   '<label class="field vz-plan-personal"><span>개인 목표 <small>추가</small></span><textarea name="personal" aria-label="개인 목표" rows="2" maxlength="10000" placeholder="예: 후렴 고음에서 힘 빼기" aria-describedby="vz-plan-personal-help"></textarea><small id="vz-plan-personal-help" class="vz-plan-help">여러 목표는 한 줄에 하나씩 적어주세요.</small></label>'+
   '<details class="vz-plan-time"'+(dayTarget!=null||s.week.targetMinutes!=null?' open':'')+'><summary>연습 시간 목표 <small>선택</small><i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="two"><label class="field"><span>오늘 목표 시간(분)</span><input type="number" name="dayMinutes" min="0" max="1440" inputmode="numeric" value="'+(dayTarget??'')+'" placeholder="미설정"></label>'+
   '<label class="field"><span>이번 주 목표 시간(분)</span><input type="number" name="weekMinutes" min="0" max="10080" inputmode="numeric" value="'+(s.week.targetMinutes??'')+'" placeholder="미설정"></label></div><p class="vz-plan-help">설정한 시간 기준으로 달성률을 표시해요.</p></details><p role="alert" data-plan-error></p></form>';
  V.sheet({title:'오늘의 목표',body,foot:'<button type="submit" form="student-home-plan" class="btn block vz-home-primary-button">목표 저장</button>',
   onMount:(el,close)=>{
    el.classList.add('vz-plan-sheet');
    const form=el.querySelector('form');form.addEventListener('input',()=>{dirty=true;});
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
      const selected=new Set(new FormData(form).getAll('goal')),goals=choices.filter(c=>selected.has(c.key)).map(c=>c.checked?{...c.goal}:{...c.goal,id:V.uid(),completed:false});
      for(const title of form.personal.value.split(/\r?\n/).map(t=>t.trim()).filter(Boolean))goals.push({id:V.uid(),title,source:'personal',sourceId:'',completed:false});
      const n=(value,max)=>{if(value==='')return null;const v=Number(value);if(!Number.isFinite(v)||v<0||v>max)throw Error('목표 시간을 확인해 주세요.');return v;};
      const ok=V.change(db=>M.savePlan(db,{date:s.today,goals,targetMinutes:n(form.dayMinutes.value,1440),weekTargetMinutes:n(form.weekMinutes.value,10080)}),{silent:true});
      if(!ok)throw Error('목표를 저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.');
      approved=true;dirty=false;close();delete document.getElementById('view').dataset.dirty;V.softRender();V.toast('오늘의 목표를 저장했어요.');
     }catch(error){el.querySelector('[data-plan-error]').textContent=error.message;button.disabled=false;}
    };
   },onClose:()=>{V.setGuard(null);if(beforeUnload)window.removeEventListener('beforeunload',beforeUnload);}});
 }
 V.route('home',{title:'홈',leave(){stopHome();},render(){stopHome();return '<div data-approved-home-host></div>';},
  async mount(main){
   const host=main.querySelector('[data-approved-home-host]');if(!host)return;
   let files=V.media.cached(),root;
   const s=state(files,selectedWeekStart),r=recentData(s.recent);
   const refreshWeek=()=>root?.updateWeek(state(files,selectedWeekStart).week);
   try{root=await createFloatingHome({...upcoming(s),goals:s.goals,week:s.week,recent:r,
    ...recentCallbacks(r),onRecord:()=>nav('#/record'),onNavigate:id=>nav('#/'+id),
    onGoals:planSheet,onNotifications:notices,onProfile:()=>nav('#/settings'),onCalendar:()=>calendar(today()),onWeek:()=>calendar(today()),onDay:calendar,
    onWeekMove:delta=>{const week=state(files,selectedWeekStart).week;if(delta<0&&!week.canPrevious||delta>0&&!week.canNext)return;const d=V.parseYmd(week.start);d.setDate(d.getDate()+delta*7);selectedWeekStart=V.ymd(d);refreshWeek();},
    onStage:()=>s.stage?nav('#/show/'+encodeURIComponent(s.stage.id)):nav('#/performances'),
    onLesson:()=>s.lesson?nav('#/lesson/'+encodeURIComponent(s.lesson.id)):V.lessonSheet(),
    onGoalToggle:async(id,completed)=>{
     const ok=V.change(db=>{if(!M.setGoal(db,id,completed))throw Error('이 목표가 변경됐어요. 화면을 새로 열어주세요.');},{silent:true});
     if(!ok)throw Error('체크를 저장하지 못했어요. 다시 시도해 주세요.');
     delete main.dataset.dirty;
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
    let recent=state(files).recent;
    if(!recent){
     const activity=V.songActivity(media),id=[...activity.keys()].filter(id=>V.song(id)).sort((a,b)=>activity.get(b).localeCompare(activity.get(a)))[0];
     if(id)recent={song:V.song(id),date:activity.get(id)};
    }
    const resolved=recentData(recent,media);root.updateRecent(resolved,recentCallbacks(resolved));
   };
   const checkDate=()=>{if(root.isConnected&&today()!==lastDate){lastDate=today();V.softRender();}};
   const visible=()=>{if(document.visibilityState==='visible'){checkDate();if(root.isConnected)refreshMedia();}};
   const timer=setInterval(checkDate,30000);
   window.addEventListener('vzip:v6-media',refreshMedia);
   document.addEventListener('visibilitychange',visible);
   stopHome=()=>{clearInterval(timer);window.removeEventListener('vzip:v6-media',refreshMedia);document.removeEventListener('visibilitychange',visible);};
   await refreshMedia();
  }});
 // Reuse the existing practice detail/edit/record actions; the old app had no standalone history route.
 V.route('practices',{title:'연습 기록',back:true,tab:'calendar',
  actions:()=>'<button type="button" class="icon-btn" data-home-add-practice aria-label="연습 기록 추가"><i class="ph ph-plus"></i></button>',
  render(){
   const rows=[...V.db.practices].sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.created||0)-(a.created||0));
   return rows.length?'<div class="list">'+rows.map(p=>'<button type="button" class="item" data-practice="'+esc(p.id)+'"><span class="avatar"><i class="ph-fill ph-clock-counter-clockwise"></i></span><span class="item-main"><span class="item-title">'+esc(p.practiceMode==='training'?(p.detail||p.categoryLabel||'보컬 트레이닝'):(V.songTitle(p.songId)||'연습'))+'</span><span class="item-sub">'+esc(dayLabel(p.date))+' · '+esc(V.minutes(p.manualMinutes??p.minutes))+'</span></span><i class="ph ph-caret-right"></i></button>').join('')+'</div>':
    V.empty('clock-counter-clockwise','아직 연습 기록이 없어요.','<button type="button" class="btn" data-home-add-practice>연습 기록 추가</button>');
  },mount(main){document.querySelectorAll('[data-home-add-practice]').forEach(b=>b.onclick=()=>V.practiceSheet());}});
 applyTheme();
 if((location.hash.replace(/^#\/?/,'').split(/[/?]/)[0]||'home')==='home')V.softRender();
}




