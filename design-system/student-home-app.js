/* Approved student home: thin adapter over existing VZ records/actions.
 * No auth, upload, analysis, billing or server-policy changes. */
import {createStudentHome,createRecentSongActions,createHomeIcon} from './components.js?v=8';
const V=window.VZ,M=window.VzipStudentHomeModel;
if(V&&M&&window.VZIP_APPROVED_HOME_ENABLED!==false){
 const esc=V.esc,nav=hash=>V.nav(hash),today=()=>V.today();
 const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'';
 const state=()=>M.build({...V.db,performances:(V.db.performances||[]).filter(p=>p.ownerId===owner()&&owner())},{today:today()});
 const dayLabel=date=>date?V.dateLabel(date):'';
 const lessonDay=date=>{const d=V.parseYmd(date);return d?(d.getMonth()+1)+'.'+d.getDate()+' ('+'일월화수목금토'[d.getDay()]+')':'';};
 const meta=document.querySelector('meta[name="theme-color"]'),originalTheme=meta?.content;
 function applyTheme(){
  const home=!!document.querySelector('[data-approved-home-host]');
  document.body.classList.toggle('vz-home-mode',home);
  document.body.dataset.vzTheme='student';document.body.dataset.vzDesign='approved-home-v1';
  document.querySelector('.v-nav')?.classList.add('vz-home-dock');
  const icons={home:"house",songs:"music-notes",record:"microphone",library:"archive-box",calendar:"calendar-blank"};
  document.querySelectorAll('.v-nav [data-nav]').forEach(link=>{
   const icon=link.querySelector('i');
   if(icon&&!icon.querySelector('.vz-nav-art')&&icons[link.dataset.nav])icon.append(createHomeIcon(icons[link.dataset.nav],"vz-nav-art"));
  });
  if(meta)meta.content=home?'#f2eff8':originalTheme;
  // The existing library controller used the record tab before it had its own dock entry.
  const route=location.hash.replace(/^#\/?/,'').split(/[/?]/)[0];
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
   dateLabel:dayLabel(s.stage.date)+(s.stage.time?' '+s.stage.time:''),daysLeft:s.stage.daysUntil}:null;
  const l=s.lesson,lesson=l?{id:l.id,title:'다음 레슨',subtitle:[l.place,l.teacher].filter(Boolean).join(' · '),
   dateLabel:lessonDay(l.date)+(l.startTime?' '+l.startTime:''),daysLeft:V.daysBetween(today(),l.date)}:null;
  return {stage,lesson};
 }
 function recentData(recent,files=[]){
  if(!recent)return null;
  const media=files.filter(f=>f.songId===recent.song.id&&!V.db.deleted?.media?.includes(f.id))
   .sort((a,b)=>String(window.VZ.media.dateOf(b)||'').localeCompare(String(window.VZ.media.dateOf(a)||''))||(b.created||0)-(a.created||0))[0];
  return {id:recent.song.id,title:recent.song.title,artist:recent.song.show||'',canPlay:!!media,media};
 }
 function recentCallbacks(recent){
  return {onRecent:()=>recent?nav('#/song/'+encodeURIComponent(recent.id)):nav('#/songs'),
   onPlay:()=>recent?.media?play(recent.media):recent?nav('#/song/'+encodeURIComponent(recent.id)):nav('#/songs'),
   onLessons:()=>nav('#/lessons'),onPractice:()=>nav('#/practices')};
 }
 function play(file){
  let player;
  V.sheet({title:file.name||'최근 녹음',body:'<div data-home-player></div>',
   onMount:(el)=>{const host=el.querySelector('[data-home-player]');player=V.media.player(host,file,{tools:true});host._player=player;player.play();},
   onClose:()=>player?.destroy()});
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
  const body='<form id="student-home-plan"><p class="small muted">선택한 목표만 오늘의 목록에 넣어요. 수행 체크는 연습 시간이나 숙제의 최종 완료를 만들지 않아요.</p>'+
   (choices.length?'<fieldset class="field" style="border:0;padding:0"><legend>오늘 할 목표</legend><div class="vz-plan-options">'+choices.map(c=>'<label class="vz-plan-option"><input type="checkbox" name="goal" value="'+esc(c.key)+'"'+(c.checked?' checked':'')+'><span>'+esc(c.goal.title)+'</span><small>'+label(c.goal)+'</small></label>').join('')+'</div></fieldset>':'')+
   '<label class="field"><span>개인 목표</span><textarea name="personal" rows="3" maxlength="10000" placeholder="한 줄에 목표 하나씩 입력하세요"></textarea></label>'+
   '<div class="two"><label class="field"><span>오늘 목표 시간(분)</span><input type="number" name="dayMinutes" min="0" max="1440" inputmode="numeric" value="'+(s.week.days.find(d=>d.today)?.targetMinutes??'')+'" placeholder="미설정"></label>'+
   '<label class="field"><span>이번 주 목표 시간(분)</span><input type="number" name="weekMinutes" min="0" max="10080" inputmode="numeric" value="'+(s.week.targetMinutes??'')+'" placeholder="미설정"></label></div><p class="small muted">시간 목표는 직접 정해요. 입력하지 않으면 달성률을 만들지 않아요.</p><p role="alert" class="small" data-plan-error></p></form>';
  V.sheet({title:'오늘의 목표',body,foot:'<button type="submit" form="student-home-plan" class="btn block">목표 저장</button>',
   onMount:(el,close)=>{
    const form=el.querySelector('form');form.addEventListener('input',()=>{dirty=true;});
    beforeUnload=e=>{if(dirty&&!approved){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    const guard=e=>{if(e.target.closest('[data-close]')&&dirty&&!approved&&!confirm('저장하지 않은 목표 설정을 닫을까요?')){e.preventDefault();e.stopImmediatePropagation();}};
    el.parentNode.addEventListener('click',guard,true);
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
 V.route('home',{title:'홈',render(){return '<div data-approved-home-host></div>';},
  async mount(main){
   const host=main.querySelector('[data-approved-home-host]');if(!host)return;
   const s=state(),r=recentData(s.recent);
   const root=createStudentHome({greeting:greeting(),name:displayName(),...upcoming(s),goals:s.goals,week:s.week,recent:r,
    ...recentCallbacks(r),onGoals:planSheet,onNotifications:notices,onProfile:()=>nav('#/settings'),onGrowth:()=>nav('#/growth'),onCalendar:()=>nav('#/calendar'),
    onStage:()=>s.stage?nav('#/show/'+encodeURIComponent(s.stage.id)):nav('#/performances'),
    onLesson:()=>s.lesson?nav('#/lesson/'+encodeURIComponent(s.lesson.id)):V.lessonSheet(),
    onGoalToggle:async(id,completed)=>{
     const ok=V.change(db=>{if(!M.setGoal(db,id,completed))throw Error('이 목표가 변경됐어요. 화면을 새로 열어주세요.');},{silent:true});
     if(!ok)throw Error('체크를 저장하지 못했어요. 다시 시도해 주세요.');
     delete main.dataset.dirty;
    }});
   host.replaceChildren(root);applyTheme();
   Promise.resolve(V.archiveAssets?.posters(root,s.stage?[s.stage]:[])).then(()=>{
    if(root.isConnected)root.querySelectorAll(".vz-home-stage-art").forEach(slot=>slot.classList.toggle("has-user-poster",!!slot.querySelector("img")));
   }).catch(()=>{});
   const media=await V.media.list().catch(()=>[]);
   if(!host.isConnected)return;
   // Reuse the same real records; this region alone changes after media metadata arrives.
   let recent=s.recent;
   if(!recent){
    const activity=V.songActivity(media),id=[...activity.keys()].filter(id=>V.song(id)).sort((a,b)=>activity.get(b).localeCompare(activity.get(a)))[0];
    if(id)recent={song:V.song(id),date:activity.get(id)};
   }
   const resolved=recentData(recent,media),region=root.querySelector('.vz-recent-region');
   if(region)region.replaceWith(createRecentSongActions({recent:resolved,...recentCallbacks(resolved)}));
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
