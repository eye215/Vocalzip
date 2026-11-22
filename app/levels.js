/* 단계 (#/levels, #/levels/<area>) — the viewing screens (light) of app/levels-model.js, and what the rest of the app
 * asks of it (VZ.levels): the line on 오늘 (design-system/student-home-app.js), and the step-up / level-up notice on
 * the completion summary of 오늘의 연습 (app/practice-set.js).
 *   큰 단계 (Lv + 이름)  꾸준함 only; points are derived from the records each time, nothing about them is stored
 *   기본기 단계          8 areas × 5 steps from what the voice-only exercises of 오늘의 연습 measured
 *   선생님 지적 배지      레슨 지적 retired as 이제 됐어요 / 몸에 붙었어요
 *   기준표               the whole table and the person's numbers as plain text, with 복사
 * WRITES (rows of practicePlans, see the model): the reached level / first-measured days when the 단계 page or 오늘
 * opens and a level was passed, and — only when a set is saved — the earned steps. So a step-up is always told on a
 * completion summary, once, never in the middle of practice. Observations, not verdicts: "3번 유지했어요". */
(()=>{
'use strict';
const V=window.VZ,L=window.VzipLevels;
if(!V||!L||typeof document==='undefined')return;
const esc=V.esc;
const DOW='일월화수목금토';
const day=date=>{const d=V.parseYmd(date);return d?(d.getMonth()+1)+'.'+d.getDate()+' ('+DOW[d.getDay()]+')':'';};
/** Today and the days of the song recordings (media is not in the record: only its dates are read, never its length). */
function env(){
  const M=V.media,gone=new Set(V.db.deleted?.media||[]),dates=[];
  for(const m of M?.cached?.()||[]){
    if(!m||gone.has(m.id))continue;
    try{if(M.recordingCategory(m)==='song'){const d=M.dateOf(m);if(d)dates.push(d);}}catch{}
  }
  return {today:V.today(),recordingDates:dates};
}
const now=()=>L.level(V.db,env());
/** 이/가 after a Korean word (by its last syllable's final consonant). */
const subject=word=>{const c=String(word).trim().charCodeAt(String(word).trim().length-1)-0xAC00;return c>=0&&c<11172&&c%28===0?'가':'이';};
const areaName=a=>a.title+(a.sub?' · '+a.sub:'');
const pips=(n,ghost=0)=>'<span class="lv-pips" aria-hidden="true">'+Array.from({length:L.STEPS},(_,i)=>'<i class="'+(i<n?'is-on':i<ghost?'is-ghost':'')+'"></i>').join('')+'</span>';
const bar=(percent,label)=>'<div class="lv-bar" role="progressbar" aria-label="'+esc(label)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><i style="width:'+percent+'%"></i></div>';

/* ---------- what other screens ask ---------- */
V.levels={
  now,
  /** The line on 오늘: {level, name, percent, toNext, label}. Reading it writes nothing. */
  home(){
    try{const x=now();return {level:x.level,name:x.name,percent:x.percent,toNext:x.toNext,
      label:'큰 단계 Lv '+x.level+', '+x.name+(x.next==null?'':', 다음 단계까지 '+x.toNext+'점')+', 단계 보기'};}
    catch(error){console.error(error);return null;}
  },
  /** A level was passed since it was last kept: keep it, so the level shown never drops when a record is deleted. */
  keepReached(){
    try{const e=env();if(L.nextState(V.db,e).raised)V.change(db=>{L.keep(db,e);},{silent:true});}catch(error){console.error(error);}
  },
  /** Around saving a set (app/practice-set.js): the level before, then — inside the same change — award and keep.
   * Returns what is new: {level:{n,name}|null, steps:[{area,title,step}]}. */
  beforeSave(){try{return now().level;}catch{return 0;}},
  afterSave(db,before){
    const e=env(),steps=L.award(db,e).map(x=>({area:x.area,title:x.title,step:x.step}));
    L.keep(db,e);
    const lv=L.level(db,e);
    return {level:before&&lv.level>before?{n:lv.level,name:lv.name}:null,steps};
  },
  /** The notice on the completion summary (empty when nothing is new). */
  newsHtml(news){
    if(!news||(!news.level&&!news.steps?.length))return '';
    return '<div class="lv-news" data-level-news role="status"><span class="lv-news-mark" aria-hidden="true"><i class="ph ph-arrow-fat-line-up"></i></span><div class="lv-news-copy">'+
      (news.level?'<p data-news="level"><strong>Lv '+news.level.n+' · '+esc(news.level.name)+'</strong>'+subject(news.level.name)+' 됐어요</p>':'')+
      (news.steps||[]).map(s=>'<p data-news="step" data-area="'+esc(s.area)+'"><strong>'+esc(s.title)+' '+s.step+'단계</strong> · 기준을 서로 다른 '+L.RULES.days+'일에 채웠어요</p>').join('')+
      '</div><a class="lv-news-link" href="#/levels">단계 보기</a></div>';
  }
};

/* ---------- 단계 ---------- */
function levelCard(x){
  const t=x.today;
  return '<section class="lv-card lv-level" data-lv-level aria-labelledby="lv-level-title">'+
    '<p class="lv-eyebrow">큰 단계 · 꾸준히 한 만큼</p>'+
    '<h2 id="lv-level-title" class="lv-now"><span class="lv-num" data-lv-num>Lv '+x.level+'</span><span class="lv-name" data-lv-name>'+esc(x.name)+'</span></h2>'+
    bar(x.percent,'다음 단계까지')+
    '<p class="lv-sub" data-lv-points>'+x.points+'점'+(x.next==null?' · 가장 높은 단계예요':' · 다음 Lv '+(x.level+1)+' '+esc(x.nextName)+'까지 '+x.toNext+'점')+'</p>'+
    (x.held?'<p class="lv-note" data-lv-held>기록이 줄어 점수는 내려갔지만, 한 번 오른 단계는 그대로예요.</p>':'')+
    '<div class="lv-today" data-lv-today><h3>오늘 받은 점수 <b>'+t.points+'점</b></h3>'+
      (t.parts.length?'<ul class="lv-parts">'+t.parts.map(p=>'<li data-part="'+p.key+'"><span>'+esc(p.text)+'</span><b>+'+p.points+'</b></li>').join('')+'</ul>'+
        (t.capped?'<p class="lv-note">하루에 받는 점수는 '+L.POINTS.dayCap+'점까지예요.</p>':''):
        '<p class="lv-empty">오늘은 아직 없어요. 오늘의 연습을 하면 점수가 쌓여요.</p>')+'</div>'+
    '<div class="lv-how" data-lv-how><h3>점수는 이렇게 쌓여요</h3><ul class="lv-parts">'+L.HOW.map(([what,points])=>'<li><span>'+esc(what)+'</span><b>'+esc(points)+'</b></li>').join('')+'</ul>'+
      '<p class="lv-note">하루 최대 '+L.POINTS.dayCap+'점이에요. 연습 시간과 녹음 길이는 점수가 아니에요. 기록을 지우면 점수도 그만큼 줄지만, 한 번 오른 단계는 내려가지 않아요.</p></div>'+
    '</section>';
}
function tile(a){
  let big,small,ghost=0;
  if(a.state==='step'){big='<strong>'+a.step+' / '+L.STEPS+'<small>단계</small></strong>';
    small=a.next?.due?'다음 연습을 마치면 '+a.next.step+'단계':a.step?(a.keeping?'요즘도 유지 중':'최근 '+L.RULES.keepDays+'일엔 기록이 없어요'):'아직 1단계 전이에요';}
  else if(a.state==='calibrating'){big='<strong class="is-word">기준 맞추는 중</strong>';small=a.day+'일째'+(a.estimate?' · 지금은 '+a.estimate+'단계쯤':'');ghost=a.estimate;}
  else if(a.state==='ready'){big='<strong class="is-word">아직 안 쟀어요</strong>';small='오늘의 연습에서 재요';}
  else{big='<strong class="is-word">준비 중</strong>';small='재는 연습을 준비 중이에요';}
  const said=a.state==='step'?a.step+'단계'+(a.keeping?', 요즘도 유지 중':''):a.state==='calibrating'?'기준 맞추는 중 '+a.day+'일째':a.state==='ready'?'아직 재지 않았어요':'재는 연습을 준비 중이에요';
  return '<li><a class="lv-tile" href="#/levels/'+a.id+'" data-area="'+a.id+'" data-state="'+a.state+'"'+(a.keeping?' data-keeping':'')+' aria-label="'+esc(areaName(a)+', '+said+', 자세히 보기')+'">'+
    '<span class="lv-tile-name">'+esc(a.title)+(a.sub?'<small>'+esc(a.sub)+'</small>':'')+(a.keeping?'<i class="ph ph-check-circle lv-keep" aria-hidden="true"></i>':'')+'</span>'+
    big+pips(a.step,ghost)+'<span class="lv-tile-sub" data-tile-sub>'+esc(small)+'</span></a></li>';
}
function badgesCard(){
  const rows=L.badges(V.db);
  return '<section class="lv-card" data-lv-badges aria-labelledby="lv-badges-title"><h2 id="lv-badges-title">선생님 지적 배지</h2>'+
    '<p class="lv-basis">레슨에서 들은 지적 가운데 “이제 됐어요”로 넘긴 것들이에요. 숫자와는 따로 모아요.</p>'+
    (rows.length?'<ul class="lv-badges">'+rows.map(b=>'<li class="lv-badge" data-badge><span class="lv-badge-mark" aria-hidden="true"><i class="ph ph-seal-check"></i></span><span class="lv-badge-copy"><strong>'+esc(b.text)+'</strong>'+
      '<small>'+esc([b.song,b.date?day(b.date)+' 몸에 붙었어요':''].filter(Boolean).join(' · '))+'</small></span></li>').join('')+'</ul>':
      '<p class="lv-empty">아직 없어요. 곡 화면의 레슨 지적에서 “이제 됐어요”를 고르면 여기에 모여요.</p>')+'</section>';
}
function pageHtml(){
  const x=now(),areas=L.skills(V.db,env());
  return levelCard(x)+
    '<section class="lv-card" data-lv-skills aria-labelledby="lv-skills-title"><h2 id="lv-skills-title">기본기</h2>'+
      '<p class="lv-basis">오늘의 연습에서 목소리만으로 하는 연습을 마이크를 켜고 하면 재요. 기준을 서로 다른 '+L.RULES.days+'일에 채우면 한 단계 올라가고, 한 번 오른 단계는 내려가지 않아요.</p>'+
      '<ul class="lv-tiles">'+areas.map(tile).join('')+'</ul></section>'+
    badgesCard()+
    '<section class="lv-card lv-sheet-card"><h2>기준표</h2><p class="lv-basis">모든 단계의 기준과 지금 내 숫자를 글로 볼 수 있어요. 선생님께 보여 드리거나 기준을 맞출 때 써요.</p>'+
      '<button type="button" class="btn secondary block" data-lv-sheet><i class="ph ph-list-checks" aria-hidden="true"></i>기준표 보기</button></section>';
}
async function copyText(text){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch{}
  const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.append(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch{}ta.remove();return ok;
}
function sheet(){
  const text=L.sheetText(V.db,env());
  V.sheet({title:'기준표',confirmClose:false,
    body:'<div class="lv-sheet"><p class="lv-basis">첫 초안이에요. 처음 두 주 동안 잰 기록을 보고 숫자를 맞춰 가요. 이름이나 곡은 들어 있지 않아요.</p><pre class="lv-sheet-text" data-lv-sheet-text tabindex="0">'+esc(text)+'</pre></div>',
    foot:'<button type="button" class="btn block" data-lv-copy><i class="ph ph-copy" aria-hidden="true"></i><span>복사</span></button>',
    onMount:el=>{
      const button=el.parentNode.querySelector('[data-lv-copy]');
      button.onclick=async()=>{
        const ok=await copyText(text);
        button.querySelector('span').textContent=ok?'복사했어요':'복사하지 못했어요';
        V.toast(ok?'기준표를 복사했어요.':'복사하지 못했어요. 글을 길게 눌러 복사해 주세요.',ok?undefined:'error');
      };
    }});
}

/* ---------- 영역 ---------- */
function exerciseNames(a){
  const D=window.VzipDailySet;
  return a.by.map(id=>{const e=D?.exercise?.(id);return e?{title:e.title,group:D.groupOf(e.group)?.title||''}:null;}).filter(Boolean);
}
function areaHtml(a){
  const head=(()=>{
    if(a.state==='step')return '<p class="lv-state" data-lv-state>'+(a.step?'<strong>'+a.step+'단계</strong>예요':'아직 <strong>1단계 전</strong>이에요')+'</p>'+
      (a.step?'<p class="lv-keepline" data-lv-keeping="'+(a.keeping?'yes':'no')+'">'+(a.keeping?'<i class="ph ph-check-circle" aria-hidden="true"></i>요즘도 유지 중 · 최근 '+L.RULES.keepDays+'일 안에 이 기준을 채웠어요':
        '최근 '+L.RULES.keepDays+'일 안에는 이 기준을 채운 기록이 없어요. 단계는 그대로예요.')+'</p>':'');
    if(a.state==='calibrating')return '<p class="lv-state" data-lv-state><strong>기준 맞추는 중</strong> · '+a.day+'일째</p>'+
      '<p class="lv-estimate" data-lv-estimate>'+(a.estimate?'지금 기록으로는 '+a.estimate+'단계쯤이에요':'지금 기록으로는 아직 1단계 전이에요')+'</p>'+
      '<p class="lv-note">처음 '+L.RULES.calibrationDays+'일 동안은 재기만 하고 단계는 정하지 않아요. '+a.daysLeft+'일 뒤부터 단계가 정해져요.</p>';
    if(a.state==='ready')return '<p class="lv-state" data-lv-state>아직 재지 않았어요</p><p class="lv-note">오늘의 연습에서 아래 연습을 마이크를 켜고 하면 재기 시작해요.</p>';
    return '<p class="lv-state" data-lv-state>재는 연습을 준비 중이에요</p><p class="lv-note">준비 중인 연습 · '+esc(a.soon)+'</p>';
  })();
  const n=a.next,dots=n?'<span class="lv-dots" aria-hidden="true">'+Array.from({length:n.need},(_,i)=>'<i class="'+(i<n.count?'is-on':'')+'"></i>').join('')+'</span>':'';
  const next=!n?'<section class="lv-card" data-lv-next><h3>다음 단계</h3><p class="lv-say">'+L.STEPS+'단계까지 모두 했어요.</p></section>':
    '<section class="lv-card" data-lv-next><h3>다음 · '+n.step+'단계</h3><p class="lv-say" data-lv-say>'+esc(n.say)+'</p>'+
      (n.soon?'<p class="lv-note" data-lv-soon>이 단계를 재는 연습을 준비 중이에요'+(a.state==='soon'?'. 연습이 생기면 그때부터 세요.':' · '+esc(n.soon))+'</p>':
        '<p class="lv-progress" data-lv-progress>'+dots+'<span>'+n.need+'번 중 '+n.count+'번 했어요</span></p>'+
        (n.days.length?'<p class="lv-note" data-lv-days>'+n.days.map(d=>esc(day(d.date))).join(' · ')+'</p>':'')+
        '<p class="lv-note">서로 다른 날에 '+n.need+'번 채우면 돼요.'+(a.state==='calibrating'?' 기준 맞추는 중에는 세기만 하고 단계는 올리지 않아요.':n.due?' 다 채웠어요. 다음 오늘의 연습을 마치면 '+n.step+'단계가 돼요.':'')+'</p>')+'</section>';
  const recent='<section class="lv-card" data-lv-recent><h3>최근 기록</h3>'+(a.recent.length?'<ul class="lv-recent">'+a.recent.map(r=>'<li><span>'+esc(day(r.date))+'</span><b>'+esc(r.text)+'</b></li>').join('')+'</ul>'+
    (a.base?'<p class="lv-note" data-lv-base>처음 음역 · '+esc(L.noteName(a.base.low)+'–'+L.noteName(a.base.high))+(a.base.closed?'':' (첫 주라 아직 재는 중이에요)')+'</p>':''):
    '<p class="lv-empty">'+(a.state==='soon'?'재는 연습이 생기면 여기에 쌓여요.':'아직 기록이 없어요.')+'</p>')+'</section>';
  const steps='<section class="lv-card" data-lv-steps><h3>단계 기준</h3><ol class="lv-steps">'+a.steps.map(s=>'<li data-step="'+s.step+'" data-state="'+s.state+'"><span class="lv-step-n" aria-hidden="true">'+(s.state==='earned'?'<i class="ph ph-check"></i>':s.step)+'</span>'+
    '<span class="lv-step-copy"><strong>'+s.step+'단계'+(s.state==='earned'?' · 했어요'+(s.date?' ('+esc(day(s.date))+')':''):s.state==='next'?' · 다음':'')+'</strong><span>'+esc(s.say)+'</span>'+(s.soon?'<small>재는 연습 준비 중</small>':'')+'</span></li>').join('')+'</ol>'+
    '<p class="lv-note">첫 초안이에요. 처음 두 주의 기록을 보고 숫자를 맞춰 가요.</p></section>';
  const names=exerciseNames(a);
  const how='<section class="lv-card" data-lv-exercise><h3>이 연습으로 재요</h3>'+(names.length?'<ul class="lv-ex">'+names.map(e=>'<li><i class="ph ph-microphone" aria-hidden="true"></i><span><strong>'+esc(e.title)+'</strong><small>'+esc(e.group)+' · 마이크를 켜고 할 때만 재요</small></span></li>').join('')+'</ul>'+
      '<button type="button" class="btn secondary block" data-lv-pick><i class="ph ph-pencil-simple" aria-hidden="true"></i>오늘의 연습 편집</button>':
      '<p class="lv-say">재는 연습을 준비 중이에요</p><p class="lv-note">'+esc(a.soon)+'</p>')+
    (a.how&&names.length?'<p class="lv-how-to" data-lv-how-to>'+esc(a.how)+'</p>':'')+
    (a.note?'<p class="lv-note" data-lv-guard>'+esc(a.note)+'</p>':'')+'</section>';
  return '<section class="lv-card lv-area-head" data-lv-area="'+a.id+'" data-state="'+a.state+'"><p class="lv-eyebrow">기본기</p><h2>'+esc(a.title)+(a.sub?'<small>'+esc(a.sub)+'</small>':'')+'</h2><p class="lv-basis">'+esc(a.line)+'</p>'+
    pips(a.step,a.state==='calibrating'?a.estimate:0)+head+(a.limit?'<p class="lv-limit" data-lv-limit><i class="ph ph-info" aria-hidden="true"></i><span>'+esc(a.limit)+'</span></p>':'')+'</section>'+next+recent+steps+how;
}

let stop=()=>{};
V.route('levels',{title:r=>L.SKILLS.find(a=>a.id===r.params[0])?.title||'단계',back:true,tab:'home',noSettings:true,
  render:()=>'<div class="lv" data-lv-host></div>',
  mount(main,r){
    stop();
    const host=main.querySelector('[data-lv-host]'),area=L.SKILLS.find(a=>a.id===r.params[0])||null;
    const paint=()=>{
      if(!host.isConnected)return;
      try{
        host.dataset.lvView=area?'area':'main';
        host.innerHTML=area?areaHtml(L.skill(V.db,area.id,env())):pageHtml();
      }catch(error){console.error(error);host.innerHTML='<p role="alert" class="lv-empty">단계를 불러오지 못했어요. 기록은 그대로 있어요.</p>';return;}
      host.querySelector('[data-lv-sheet]')?.addEventListener('click',sheet);
      host.querySelector('[data-lv-pick]')?.addEventListener('click',()=>{if(V.dailySet?.pick)V.dailySet.pick();else V.nav('#/practice-set');});
    };
    paint();
    // The recordings' dates (곡 녹음 points) arrive with the media list.
    const media=()=>paint();
    window.addEventListener('vzip:v6-media',media);
    stop=()=>{window.removeEventListener('vzip:v6-media',media);stop=()=>{};};
    V.media?.list?.().then(()=>{if(host.isConnected){paint();V.levels.keepReached();}}).catch(()=>{});
    V.levels.keepReached();
  },
  leave(){stop();}});
})();
