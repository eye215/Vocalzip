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
:host{display:block;width:100%;background:#f8f6fd;}
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
#vocalzip-refined-preview .vz-empty-action{min-height:44px;padding:0;color:#7a32f5;font-weight:600;text-align:left;}
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
 const week=opts.week||{},actual=num(week.actualMinutes),target=week.targetMinutes,ratio=Number(target)>0?actual/Number(target)*100:null;
 q(".vz-time b").textContent=String(Math.round(actual));
 action(q(".vz-week .vz-title"),"성장 기록 보기",opts.onGrowth);
 const meta=q(".vz-week-meta"),goal=meta.children[0];
 if(target==null){
  const button=el("button","목표 설정","vz-empty-action");button.type="button";button.setAttribute("aria-label","주간 목표 설정");button.onclick=()=>opts.onGoals?.();goal.replaceChildren(button);
 }else goal.textContent="목표 "+duration(target);
 const achievement=meta.children[1],strong=achievement.querySelector("strong");strong.textContent=ratio==null?"—":Math.round(ratio)+"%";
 const streak=meta.querySelector(".vz-streak"),flame=streak.querySelector("svg").cloneNode(true);streak.replaceChildren(flame,document.createTextNode(num(week.streak)+"일 연속"));
 const days=q(".vz-days"),dayPrototype=days.firstElementChild.cloneNode(true),check=days.querySelector(".vz-day-dot svg").cloneNode(true);days.replaceChildren();
 for(const item of (week.days||[]).slice(0,7)){
  const day=dayPrototype.cloneNode(true),minutes=num(item.minutes),future=item.state==="future",planned=Number(item.targetMinutes)>0;
  const rate=planned?minutes/Number(item.targetMinutes)*100:item.ratio!=null&&Number.isFinite(Number(item.ratio))?Number(item.ratio):null;
  const level=future?"future":minutes===0?"missed":rate==null||rate<100?"partial":rate<=120?"done":"exceeded";
  day.className=item.today?"vz-today":"";day.dataset.date=item.date||"";day.dataset.state=item.state||level;day.dataset.today=String(Boolean(item.today));
  day.setAttribute("aria-label",[item.date,(item.label||"")+"요일",item.today?"오늘":"",future?"예정":minutes+"분 연습",rate==null?"목표 미설정":"달성률 "+Math.round(rate)+"%"].filter(Boolean).join(", "));
  day.firstElementChild.textContent=item.label||"";
  const dot=day.querySelector(".vz-day-dot");dot.className="vz-day-dot "+level+(item.today?" today":"");dot.replaceChildren();
  if(!future&&minutes>0){dot.append(check.cloneNode(true));if(item.today)dot.style.backgroundColor=({partial:"#D9C5FA",done:"#7A32F5",exceeded:"#4C188E"})[level];}
  day.querySelector(".vz-day-minutes").textContent=future||item.today&&minutes===0?"":Math.round(minutes)+"분";days.append(day);
 }
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
 if(!items.length){const button=el("button","오늘의 목표를 정해보세요","vz-empty-action");button.type="button";button.setAttribute("aria-label","목표 추가");button.onclick=()=>opts.onGoals?.();list.append(button);}
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
