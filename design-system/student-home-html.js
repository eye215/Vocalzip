/* Direct integration of PR #139's HTML. The distributed HTML blob is unmodified.
 * Demo scripts/dialogs stay inert; only its root markup and original style blocks are used. */
export const FLOATING_HOME_SOURCE = "b4ad1520615f1cae216393239679657779389d06";
const asset=new URL("./Vocalzip_Floating_Record_Home.html?v="+FLOATING_HOME_SOURCE.slice(0,12),import.meta.url);
let sourcePromise;
async function source(){
 if(!sourcePromise)sourcePromise=fetch(asset,{cache:"force-cache"}).then(async response=>{
  if(!response.ok)throw Error("홈 HTML을 불러오지 못했어요.");
  const doc=new DOMParser().parseFromString(await response.text(),"text/html");
  const root=doc.querySelector("#vocalzip-refined-preview");
  if(!root||root.querySelectorAll(".vz-nav-item").length!==4||!root.querySelector(".vz-floating-record"))throw Error("홈 HTML 구성을 확인해 주세요.");
  return {root,styles:[...doc.querySelectorAll("style")].map(s=>s.textContent.replace(/@import\s+url\([^;]*\);/g,""))};
 }).catch(error=>{sourcePromise=null;throw error;});
 return sourcePromise;
}
const num=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const daysText=value=>value==null||typeof value==="boolean"||!Number.isFinite(Number(value))?"":Number(value)===0?"D-day":Number(value)>0?"D-"+value:"D+"+Math.abs(value);
const duration=value=>{const n=Math.round(num(value));return n>=60?Math.floor(n/60)+"시간"+(n%60?" "+n%60+"분":""):n+"분";};
function el(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;}
function action(element,label,fn){
 element.setAttribute("role","button");element.tabIndex=0;element.setAttribute("aria-label",label);
 element.onclick=()=>fn?.();
 element.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fn?.();}};
}
const adaptations=String.raw`
#vocalzip-refined-preview .vz-week{touch-action:pan-y;}
#vocalzip-refined-preview .vz-week .vz-time[data-target-met="true"] b,#vocalzip-refined-preview .vz-week .vz-time[data-target-met="true"]>span{color:#7a32f5;}
#vocalzip-refined-preview .vz-week-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;margin:12px 0 0;min-height:44px;background:transparent;}
#vocalzip-refined-preview .vz-week-nav button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:radial-gradient(circle at center,#f2f4f7 0 16px,transparent 16.5px);color:var(--ink-2,#5f5a74);cursor:pointer;padding:0;}
#vocalzip-refined-preview .vz-week-nav button:disabled{color:#c7bfd2;cursor:default;opacity:.5;}
#vocalzip-refined-preview .vz-week-nav button svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.5;fill:none;stroke-linecap:round;stroke-linejoin:round;}
#vocalzip-refined-preview .vz-week-nav .vz-week-range{text-align:center;white-space:nowrap;line-height:1.25;}
#vocalzip-refined-preview .vz-week-year{display:block;color:#667085;font-size:11px;font-weight:400;}
#vocalzip-refined-preview .vz-week-dates{display:block;color:#475467;font-size:14px;font-weight:600;letter-spacing:.01em;font-variant-numeric:tabular-nums;margin-top:2px;}
#vocalzip-refined-preview .vz-days{margin-top:14px;}
#vocalzip-refined-preview .vz-days>div{min-height:80px;cursor:pointer;}
#vocalzip-refined-preview .vz-days>div>span:first-child{font-size:15px;font-weight:600;line-height:22px;color:#344054;}
#vocalzip-refined-preview .vz-days>div.vz-saturday>span:first-child{color:#617596;}
#vocalzip-refined-preview .vz-days>div.vz-sunday>span:first-child{color:#a96171;}
#vocalzip-refined-preview .vz-days>div.vz-today>span:first-child{color:#7a32f5;}
#vocalzip-refined-preview .vz-streak{color:#667085;margin-left:0;}
#vocalzip-refined-preview .vz-streak[data-active="true"]{color:#7a32f5;}
#vocalzip-refined-preview .vz-streak svg{width:22px;height:22px;}
#vocalzip-refined-preview .vz-week-meta{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;box-sizing:border-box;min-height:47px;border-top:1px solid #ece6f4;margin-top:8px;padding-top:10px;}
#vocalzip-refined-preview .vz-week-meta>span{display:flex;align-items:center;gap:3px;min-height:36px;white-space:nowrap;}
#vocalzip-refined-preview .vz-week .vz-empty-action{min-height:36px;}
#vocalzip-refined-preview .vz-week [role=button]:focus-visible,#vocalzip-refined-preview .vz-week button:focus-visible{outline:2px solid #7A32F5;outline-offset:3px;}

:host{display:block;width:100%;background:#f8f6fd;}
/* Use the device width rather than leaving a 390px mock phone inside wider phones. */
#vocalzip-refined-preview .vz-phone{max-width:560px;padding:8px 12px 0;padding-top:max(8px,env(safe-area-inset-top));}
#vocalzip-refined-preview .vz-nav-item.vz-active{background:#EDE1FF;}
#vocalzip-refined-preview .vz-header{min-height:44px;margin-bottom:8px;}
#vocalzip-refined-preview .vz-logo{font-size:26px;line-height:34px;gap:8px;}
#vocalzip-refined-preview .vz-logo b{font-weight:700;}
#vocalzip-refined-preview .vz-logo svg{width:28px;height:28px;}
#vocalzip-refined-preview .vz-schedule{padding:0 0 8px;}
#vocalzip-refined-preview .vz-card{padding:16px;}
#vocalzip-refined-preview .vz-song h3{max-width:none;}
#vocalzip-refined-preview main{padding-bottom:calc(142px + max(12px,env(safe-area-inset-bottom)));}
#vocalzip-refined-preview .vz-nav-space{max-width:528px;}
#vocalzip-refined-preview .vz-floating-record{right:max(16px,calc((100vw - 560px)/2 + 16px));}
.vz-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;clip:rect(0,0,0,0)!important;overflow:hidden!important;white-space:nowrap!important;}
#vocalzip-refined-preview [role=button]{cursor:pointer;}
#vocalzip-refined-preview [role=button]:focus-visible{outline:2px solid #7a32f5;outline-offset:3px;}
#vocalzip-refined-preview .vz-event-row{min-height:44px;}
#vocalzip-refined-preview .vz-title[role=button],#vocalzip-refined-preview .vz-song h3[role=button]{position:relative;}
#vocalzip-refined-preview .vz-title[role=button]::after,#vocalzip-refined-preview .vz-song h3[role=button]::before{content:"";position:absolute;left:0;right:0;top:50%;height:max(100%,44px);transform:translateY(-50%);}
#vocalzip-refined-preview .vz-card-heading{flex-wrap:wrap;}
#vocalzip-refined-preview .vz-dday{flex:none;white-space:nowrap;}
#vocalzip-refined-preview .vz-event-heading h2{min-width:0;}
#vocalzip-refined-preview .vz-listen{min-width:0;white-space:normal;}
#vocalzip-refined-preview .vz-event-content,#vocalzip-refined-preview .vz-event-heading,#vocalzip-refined-preview .vz-title,#vocalzip-refined-preview .vz-shortcut>span{min-width:0;}
#vocalzip-refined-preview .vz-event h2{overflow-wrap:anywhere;line-height:1.33333333;}
#vocalzip-refined-preview .vz-card h2{line-height:1.44444444;}
#vocalzip-refined-preview .vz-song{aspect-ratio:auto;}
#vocalzip-refined-preview .vz-song h3{line-height:1.27777778;}
#vocalzip-refined-preview .vz-time b{line-height:1.14285714;}
#vocalzip-refined-preview .vz-day-minutes{line-height:1.45454545;}
#vocalzip-refined-preview .vz-event-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-shortcut strong{min-width:0;white-space:normal;overflow-wrap:anywhere;}
#vocalzip-refined-preview .vz-goal-list label[data-long=true]{align-items:flex-start;padding-block:12px;}
#vocalzip-refined-preview .vz-goal-list label>span{flex:1;min-width:0;overflow-wrap:anywhere;}
#vocalzip-refined-preview .vz-goal-list label small{flex:none;}
#vocalzip-refined-preview .vz-goal-list[data-many=true]{max-height:300px;overflow-y:auto;overscroll-behavior-y:contain;scroll-padding-block:8px;}
#vocalzip-refined-preview .vz-goal-list input{scroll-margin-block:8px;}
#vocalzip-refined-preview .vz-save-error{font-size:12px;line-height:1.45;color:#b42318;}
#vocalzip-refined-preview .vz-save-error:empty{display:none;}
#vocalzip-refined-preview .vz-goals .vz-empty-action{display:flex;align-items:center;gap:10px;min-height:56px;width:100%;margin-top:12px;padding:12px 14px;border-radius:14px;background:#f7f5fb;color:#858194;font-weight:500;text-align:left;}
#vocalzip-refined-preview .vz-goals .vz-empty-action svg{width:22px;height:22px;flex:none;stroke:#858194;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
#vocalzip-refined-preview .vz-goals .vz-empty-action svg:last-child{width:16px;height:16px;margin-left:auto;}
#vocalzip-refined-preview .vz-goal-list:empty{display:none;}
@media(max-width:355px){#vocalzip-refined-preview .vz-event h2{line-height:1.45454545;}#vocalzip-refined-preview .vz-card h2{line-height:1.625;}}
`;
export async function createFloatingHome(opts={}){
 const template=await source(),host=el("section");host.className="vz-student-home";host.dataset.sourceBlob=FLOATING_HOME_SOURCE;host.setAttribute("aria-label","학생 홈");
 const shadow=host.attachShadow({mode:"open"});
 template.styles.forEach((css,i)=>{const style=el("style",css);style.dataset.sourceStyle=String(i);shadow.append(style);});
 const integration=el("style",adaptations);integration.dataset.integration="accessibility";shadow.append(integration);
 const root=document.importNode(template.root,true);root.setAttribute("aria-label","Vocalzip 홈");shadow.append(root);
 const q=selector=>root.querySelector(selector);
 q("main").setAttribute("role","presentation");
 root.prepend(el("h1","홈","vz-visually-hidden"));
 q('[aria-label="알림"]').onclick=()=>opts.onNotifications?.();
 q('[aria-label="프로필"]').onclick=()=>opts.onProfile?.();
 const section=q(".vz-schedule"),lessonPrototype=q(".vz-event"),rowPrototype=q(".vz-event-row").cloneNode(true);
 const events=Array.isArray(opts.upcomingEvents)?opts.upcomingEvents:[
  ...(opts.lesson?[{...opts.lesson,kind:"lesson",action:opts.onLesson}]:[]),
  ...(opts.stage?[{...opts.stage,kind:opts.stage.kind||"stage",action:opts.onStage}]:[])
 ];
 const lesson=events.find(e=>e.kind==="lesson");
 if(lesson){
  lessonPrototype.querySelector("h2").textContent=lesson.title||"보컬 레슨";
  const badge=lessonPrototype.querySelector(".vz-dday");badge.textContent=daysText(lesson.daysLeft);badge.hidden=!badge.textContent;
  lessonPrototype.querySelector("p").textContent=lesson.dateLabel||"";
  action(lessonPrototype,lesson.buttonLabel||"다음 레슨 보기",lesson.action||opts.onLesson);lessonPrototype.dataset.kind="lesson";
 }else lessonPrototype.remove();
 section.querySelectorAll(".vz-event-row").forEach(e=>e.remove());
 const distance=e=>e.daysLeft!=null&&Number.isFinite(Number(e.daysLeft))?Number(e.daysLeft):Infinity;
 events.filter(e=>e.kind!=="lesson").map((e,i)=>({e,i})).sort((a,b)=>distance(a.e)-distance(b.e)||a.i-b.i).forEach(({e})=>{
  const row=rowPrototype.cloneNode(true),kind=({performance:"공연",audition:"오디션",stage:"무대"})[e.kind]||"무대";
  row.querySelector(".vz-kind").textContent=kind;row.querySelector("strong").textContent=e.title||kind;
  row.querySelector(".vz-row-day").textContent=daysText(e.daysLeft);
  row.setAttribute("aria-label",e.buttonLabel||"무대 상세 보기");row.title=[e.title,e.dateLabel].filter(Boolean).join(" · ");row.dataset.kind=e.kind||"stage";
  row.onclick=()=>{(e.action||opts.onStage||opts.onCalendar)?.();};section.append(row);
 });
 if(!events.length)section.remove();
 const weekCard=q(".vz-week"),meta=q(".vz-week-meta"),goal=meta.children[0];
 const days=q(".vz-days"),dayPrototype=days.firstElementChild.cloneNode(true),check=days.querySelector(".vz-day-dot svg").cloneNode(true);
 const flame=meta.querySelector(".vz-streak svg").cloneNode(true);
 action(q(".vz-week .vz-title"),"오늘 일정 보기",opts.onWeek||opts.onCalendar);
 const weekNav=el("div",null,"vz-week-nav"),prev=el("button"),range=el("div",null,"vz-week-range"),next=el("button");
 prev.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4.5-7.5 7.5 7.5 7.5"/></svg>';
 next.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4.5 7.5 7.5-7.5 7.5"/></svg>';
 for(const [button,label,fn] of [[prev,"이전 주",()=>opts.onWeekMove?.(-1)],[next,"다음 주",()=>opts.onWeekMove?.(1)]]){
  button.type="button";button.setAttribute("aria-label",label);button.onclick=fn;
 }
 weekNav.append(prev,range,next);meta.before(weekNav);days.after(meta);
 const shortDate=date=>{const parts=String(date||"").split("-");return parts.length===3?Number(parts[1])+"."+Number(parts[2]):"";};
 host.updateWeek=week=>{
  const actual=num(week.actualMinutes),target=week.targetMinutes,ratio=Number(target)>0?actual/Number(target)*100:null;
  weekCard.dataset.weekStart=week.start||"";
  prev.disabled=week.canPrevious===false;next.disabled=week.canNext===false;
  prev.setAttribute("aria-disabled",String(prev.disabled));next.setAttribute("aria-disabled",String(next.disabled));
  q(".vz-week h2").textContent="주간 연습";
  q(".vz-time b").textContent=String(Math.round(actual));
  q(".vz-time").dataset.targetMet=String(Number(target)>0&&actual>=Number(target));
  const startYear=String(week.start||"").slice(0,4),endYear=String(week.end||"").slice(0,4);
  const currentYear=String(new Date().getFullYear()),showYear=startYear!==currentYear||endYear!==currentYear;
  range.replaceChildren(el("span",week.start?(showYear?startYear+".":"")+shortDate(week.start)+" – "+(showYear&&endYear!==startYear?endYear+".":"")+shortDate(week.end):"","vz-week-dates"));
  if(target==null){
   if(week.current===false)goal.textContent="목표 미설정";
   else{const button=el("button","목표 설정","vz-empty-action");button.type="button";button.setAttribute("aria-label","주간 목표 설정");button.onclick=()=>opts.onGoals?.();goal.replaceChildren(button);}
  }else goal.textContent="목표 "+duration(target);
  meta.children[1].querySelector("strong").textContent=ratio==null?"—":Math.round(ratio)+"%";
  meta.querySelector(".vz-streak").dataset.active=String(num(week.streak)>=2);
  meta.querySelector(".vz-streak").replaceChildren(flame.cloneNode(true),document.createTextNode(num(week.streak)+"일 연속"));
  days.replaceChildren();
  for(const item of (week.days||[]).slice(0,7)){
   const day=dayPrototype.cloneNode(true),minutes=num(item.minutes),future=item.state==="future",planned=Number(item.targetMinutes)>0;
   const rate=planned?minutes/Number(item.targetMinutes)*100:item.ratio!=null&&Number.isFinite(Number(item.ratio))?Number(item.ratio):null;
   const level=future?"future":minutes===0?"missed":rate==null||rate<100?"partial":rate<=120?"done":"exceeded";
   const weekday=item.date?new Date(item.date+"T12:00:00").getDay():-1;
   day.className=[item.today?"vz-today":"",weekday===6?"vz-saturday":"",weekday===0?"vz-sunday":""].filter(Boolean).join(" ");day.dataset.date=item.date||"";day.dataset.state=item.state||level;day.dataset.today=String(Boolean(item.today));
   const label=[item.date,(item.label||"")+"요일",item.today?"오늘":"",future?"예정":Math.round(minutes)+"분 연습",rate==null?"목표 미설정":"달성률 "+Math.round(rate)+"%","일정 보기"].filter(Boolean).join(", ");
   action(day,label,()=>opts.onDay?.(item.date));
   day.firstElementChild.textContent=item.date?String(Number(String(item.date).slice(8,10))):"";
   const dot=day.querySelector(".vz-day-dot");dot.className="vz-day-dot "+level+(item.today?" today":"");dot.replaceChildren();
   if(!future&&minutes>0){dot.append(check.cloneNode(true));if(item.today)dot.style.backgroundColor=({partial:"#D9C5FA",done:"#7A32F5",exceeded:"#4C188E"})[level];}
   day.querySelector(".vz-day-minutes").textContent=future||item.today&&minutes===0?"":Math.round(minutes)+"분";days.append(day);
  }
 };
 host.updateWeek(opts.week||{});
 // Horizontal gestures change weeks; vertical page scrolling stays available.
 let pointer=null,suppressClickUntil=0,wheelMovedAt=-Infinity;
 weekCard.addEventListener("pointerdown",event=>{if(event.button===0)pointer={id:event.pointerId,x:event.clientX,y:event.clientY};});
 weekCard.addEventListener("pointercancel",()=>{pointer=null;});
 weekCard.addEventListener("pointerup",event=>{
  const start=pointer;pointer=null;if(!start||start.id!==event.pointerId)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClickUntil=performance.now()+350;opts.onWeekMove?.(dx<0?1:-1);}
 });
 weekCard.addEventListener("click",event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 weekCard.addEventListener("wheel",event=>{
  if(Math.abs(event.deltaX)<25||Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;
  event.preventDefault();if(performance.now()-wheelMovedAt<450)return;wheelMovedAt=performance.now();opts.onWeekMove?.(event.deltaX>0?1:-1);
 },{passive:false});
 days.addEventListener("keydown",event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();opts.onWeekMove?.(event.key==="ArrowRight"?1:-1);}});
 const song=q(".vz-song"),name=song.querySelector("h3"),info=song.querySelector("p"),continueButton=song.querySelector(".vz-play");
 host.updateRecent=(recent,callbacks=opts)=>{
  name.textContent=recent?.title||"연습할 곡을 골라보세요";info.textContent=recent?.artist||"내 곡에서 시작하기";
  action(name,recent?"최근 연습곡 "+recent.title+" 열기":"내 곡 선택",callbacks.onRecent);
  song.onclick=e=>{if(!e.target.closest("button")&&e.target!==name&&!name.contains(e.target))callbacks.onRecent?.();};
  continueButton.setAttribute("aria-label",recent?recent.title+" 계속 연습하기":"곡 추가 또는 선택");
  continueButton.querySelector(".vz-listen").lastElementChild.textContent=recent?"계속 연습하기":"곡 추가·선택";
  continueButton.onclick=()=>{(recent?callbacks.onContinue:callbacks.onRecent)?.();};
 };
 host.updateRecent(opts.recent,opts);
 const quick=[...root.querySelectorAll(".vz-shortcut")];quick[0].setAttribute("aria-label","레슨노트");quick[0].onclick=()=>opts.onLessons?.();quick[1].setAttribute("aria-label","연습기록");quick[1].onclick=()=>opts.onPractice?.();
 q(".vz-goal-tools button").setAttribute("aria-label","오늘의 목표 설정");q(".vz-goal-tools button").onclick=()=>opts.onGoals?.();
 const list=q(".vz-goal-list"),prototype=list.firstElementChild.cloneNode(true),items=(opts.goals||[]).map(g=>({...g,completed:Boolean(g.completed)}));list.replaceChildren();list.dataset.many=String(items.length>6);
 if(items.length>6){list.tabIndex=0;list.setAttribute("role","region");list.setAttribute("aria-label","오늘의 목표 목록, 내부 스크롤");}
 const error=el("p","","vz-save-error");error.setAttribute("role","status");error.setAttribute("aria-live","polite");list.after(error);
 const refresh=()=>{q(".vz-count").textContent=items.filter(g=>g.completed).length+" / "+items.length+" 완료";};refresh();
 if(!items.length){const button=el("button",null,"vz-empty-action");button.type="button";button.setAttribute("aria-label","오늘의 목표 정하기");button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5v18h14V4h-3M8 2h8v4H8zM7 11l1.5 1.5L11 10m2 2h4M7 17l1.5 1.5L11 16m2 2h4"/></svg><span>오늘의 목표 정하기</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 8 8-8 8"/></svg>';button.onclick=()=>opts.onGoals?.();list.append(button);}
 for(const item of items){
  const row=prototype.cloneNode(true),input=row.querySelector("input");row.dataset.long=String(String(item.title||"").length>80);input.removeAttribute("checked");input.checked=item.completed;input.setAttribute("aria-label",item.title||"목표");
  row.querySelector("span").textContent=item.title||"목표";row.querySelector("small").textContent=({homework:"숙제",personal:"개인",recommendation:"추천"})[item.source]||"";row.querySelector("small").hidden=!row.querySelector("small").textContent;
  input.onchange=async()=>{
   const before=item.completed;item.completed=input.checked;input.disabled=true;row.setAttribute("aria-busy","true");error.textContent="";refresh();
   try{if(await opts.onGoalToggle?.(item.id,item.completed)===false)throw Error("save rejected");}
   catch{item.completed=before;input.checked=before;refresh();error.textContent="저장하지 못했어요. 다시 체크해 주세요.";}
   finally{input.disabled=false;row.removeAttribute("aria-busy");}
  };list.append(row);
 }
 q(".vz-floating-record").onclick=()=>opts.onRecord?.();
 const routes=["home","songs","library","calendar"];
 [...root.querySelectorAll(".vz-nav-item")].forEach((button,i)=>{button.dataset.nav=routes[i];button.onclick=()=>opts.onNavigate?.(routes[i]);});
 return host;
}


