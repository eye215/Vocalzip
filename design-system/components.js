/* VOCAL.zip DS v1 · Safe DOM factories (no backend calls, no live app mutations).
 * Components intentionally accept data + callbacks; all user content uses textContent.
 */
const el = (tag, className = "", text = undefined) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const percent = (complete, total) => total > 0 ? Math.round(100 * complete / total) : null;
function textRow(parent, tag, cls, content) { const node=el(tag,cls,content); parent.append(node); return node; }

export function createProgressRing({ completed = 0, total = 0, label = "오늘의 목표 달성률" } = {}) {
  const pct = percent(completed, total);
  const ring = el("div", "vz-ring" + (pct === null ? " vz-ring--unset" : ""));
  ring.setAttribute("role","img");
  ring.setAttribute("aria-label", pct === null ? label + " 미설정" : label + " " + pct + "퍼센트, " + completed + "/" + total + "개");
  ring.style.setProperty("--vz-ring-progress", (pct === null ? 0 : clamp(pct,0,100)) + "%");
  const center = el("div","vz-ring__center");
  textRow(center,"strong","vz-ring__value",pct === null ? "—" : pct + "%");
  textRow(center,"span","vz-ring__detail",pct === null ? "목표 미설정" : completed + "/" + total + "개 완료");
  ring.append(center); return ring;
}

export function createHeroCard({ title = "다가오는 무대", event = "뮤지컬 오디션", song = "Defying Gravity", daysLeft = 12, lesson = "11/10 오후 3시 · 다음 레슨", lessonDaysLeft = 3 } = {}) {
  const card = el("section","vz-card vz-card--hero");
  card.setAttribute("aria-label",title);
  textRow(card,"p","vz-hero__eyebrow",title);
  const main = el("div","vz-hero__main");
  const copy = el("div");
  textRow(copy,"h2","vz-hero__title",event);
  textRow(copy,"p","vz-hero__subtitle",song);
  const visual=el("div","vz-hero__visual");
  const jewel=el("div","vz-hero__jewel");
  const glyph=el("i","ph-fill ph-microphone");
  glyph.setAttribute("aria-hidden","true");
  jewel.append(glyph);
  visual.append(jewel,textRow(el("div"),"strong","vz-hero__count","D-" + Math.max(0,daysLeft)));
  main.append(copy,visual);
  card.append(main);
  const sub=el("div","vz-hero__subrow");
  textRow(sub,"span","",lesson);
  textRow(sub,"span","","D-" + Math.max(0,lessonDaysLeft));
  card.append(sub); return card;
}

export function createGoalCard({ goals=[], practicedMinutes=0, targetMinutes=null, status="planned", onOpen=()=>{}, onAction=()=>{} }={}) {
  const card = el("section","vz-card vz-goal-card"+(status==="rest"?" vz-goal-card--rest":""));
  card.setAttribute("aria-label","오늘의 목표");
  const head=el("header","vz-card__head");
  textRow(head,"h2","vz-card__title","✦ 오늘의 목표");
  const open=el("button","vz-card__link","↗");
  open.type="button";open.setAttribute("aria-label","오늘의 목표 설정 및 수정");open.addEventListener("click",onOpen);head.append(open);card.append(head);
  const body=el("div","vz-goal-card__body");
  if(status==="rest"){
    const summary=el("div","vz-goal-card__summary");
    const restRing=el("div","vz-ring vz-ring--unset");restRing.setAttribute("aria-hidden","true");textRow(restRing,"span","vz-ring__center","☾");summary.append(restRing);
    textRow(summary,"small","vz-goal-card__time","휴식일");
    const msg=el("div");textRow(msg,"strong","","오늘은 쉬어가는 날");
    textRow(msg,"p","vz-empty","연습은 언제든 다시 시작할 수 있어요.");
    body.append(summary,msg);card.append(body);return card;
  }
  const completed=goals.filter(g=>g.completed).length;
  const summary=el("div","vz-goal-card__summary");
  summary.append(createProgressRing({completed,total:goals.length}));
  const timeLabel=targetMinutes === null || targetMinutes === undefined
    ? (practicedMinutes > 0 ? "오늘 "+practicedMinutes+"분 연습" : "연습 시간 목표 미설정")
    : "오늘 "+practicedMinutes+"/"+targetMinutes+"분";
  textRow(summary,"span","vz-goal-card__time",timeLabel);
  const right=el("div","vz-goal-card__side");
  textRow(right,"p","vz-goal-card__count",goals.length?"오늘 할 일  "+completed+"/"+goals.length:"오늘 할 일");
  if(goals.length===0) textRow(right,"p","vz-empty",status==="deferred"?"나중에 오늘의 목표를 정해보세요.":"오늘 할 목표를 선택해보세요.");
  else {
    const list=el("div","vz-goal-list");
    list.tabIndex=0;
    list.setAttribute("role","region");
    list.setAttribute("aria-label","오늘의 목표 목록, 내부 스크롤");
    const rows=el("div","vz-goal-list__inner");
    for(const goal of goals){
      const button=el("button","vz-goal-row");button.type="button";button.setAttribute("aria-pressed",String(Boolean(goal.completed)));
      button.setAttribute("aria-label",goal.title+" "+(goal.completed?"완료":"미완료") + (goal.kind && goal.kind!=="check" ? ", 수행량 입력" : ", 완료 상태 변경"));
      textRow(button,"span","vz-goal-row__check",goal.completed?"✓":"");
      textRow(button,"span","vz-goal-row__label",goal.title);
      button.addEventListener("click",()=>onAction(goal));
      rows.append(button);
    }
    list.append(rows);right.append(list);
  }
  body.append(summary,right);card.append(body);return card;
}

const DAY_SYMBOL={met:"✓",partial:"·",empty:"",future:"",rest:"☾",unplanned:"—"};
export function createWeekCard({ days=[], streak=0, targetLabel="주간 목표 미설정", achievementLabel="—" }={}) {
  const card=el("section","vz-card vz-week");
  card.setAttribute("aria-label","이번 주 연습");
  const head=el("header","vz-card__head");
  textRow(head,"h2","vz-card__title","이번 주 연습");
  if(streak>0) textRow(head,"span","vz-week__streak",streak+"일 연속 연습");
  card.append(head);
  const grid=el("div","vz-week-grid");
  for(const item of days){
    const day=el("div","vz-week-day");day.dataset.state=item.state||"empty";
    const full=(item.label||"")+"요일, "+(item.minutes===null||item.minutes===undefined?"기록 없음":item.minutes+"분")+", "+(item.state||"empty");
    day.setAttribute("aria-label",full);
    textRow(day,"div","vz-week-day__label",item.label||"");
    textRow(day,"div","vz-week-day__tile",DAY_SYMBOL[item.state]??"");
    textRow(day,"div","vz-week-day__time",item.minutes==null?"—":item.minutes+"분");
    grid.append(day);
  }
  card.append(grid);
  const footer=el("div","vz-week__footer");
  textRow(footer,"span","",targetLabel);
  textRow(footer,"strong","","달성률 "+achievementLabel);
  card.append(footer);return card;
}

export function createWidgetGrid({ song="Defying Gravity", subtitle="Wicked", onSong=()=>{}, onScore=()=>{}, onTraining=()=>{} } = {}) {
  const grid=el("div","vz-widget-grid");
  const songCard=el("button","vz-card vz-song-tile");
  songCard.type="button";songCard.style.textAlign="left";songCard.style.color="var(--vz-color-ink)";
  songCard.setAttribute("aria-label","최근 연습곡 "+song+" 열기");
  const art=el("div","vz-song-tile__art");
  const artIcon=el("i","ph ph-music-notes");
  artIcon.setAttribute("aria-hidden","true");art.append(artIcon);songCard.append(art);
  const bottom=el("div");
  textRow(bottom,"div","vz-song-tile__title",song);
  textRow(bottom,"div","vz-song-tile__sub",subtitle);
  songCard.append(bottom);songCard.addEventListener("click",onSong);grid.append(songCard);
  const stack=el("div","vz-quick-stack");
  const actions=[{name:"악보 열기",icon:"ph ph-file-pdf",act:onScore},{name:"트레이닝",icon:"ph ph-waveform",act:onTraining}];
  for(const a of actions){
    const b=el("button","vz-quick-tile");b.type="button";
    const icon=el("i","vz-quick-tile__icon "+a.icon);icon.setAttribute("aria-hidden","true");
    textRow(b,"span","vz-quick-tile__name",a.name);b.prepend(icon);b.addEventListener("click",a.act);stack.append(b);
  }
  grid.append(stack);return grid;
}

export function createDock({ active="home", onNavigate=()=>{} }={}){
  const nav=el("nav","vz-dock");nav.setAttribute("aria-label","하단 탐색");
  const links=[
    ["home","홈","ph ph-house"],
    ["songs","내 곡","ph ph-music-notes"],
    ["record","녹음","ph-fill ph-microphone"],
    ["library","보관함","ph ph-archive-box"],
    ["calendar","일정","ph ph-calendar-blank"]
  ];
  for(const [id,label,iconClass] of links){
    const b=el("button","vz-dock__item"+(id==="record"?" vz-dock__item--record":""));
    b.type="button";
    if(id===active)b.setAttribute("aria-current","page");
    const icon=el("i","vz-dock__icon "+iconClass);icon.setAttribute("aria-hidden","true");
    b.append(icon,textRow(el("span"),"span","",label));
    b.addEventListener("click",()=>onNavigate(id));
    nav.append(b);
  }
  return nav;
}

export function openPlanSheet({ suggestions=[], targetMinutes=30, onSave=()=>{}, onRest=()=>{}, onDefer=()=>{} }={}){
  const oldFocus=document.activeElement;
  const overlay=el("div","vz-overlay");
  const dialog=el("div","vz-sheet");
  dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
  dialog.setAttribute("aria-labelledby","vz-goal-sheet-title");
  textRow(dialog,"div","vz-sheet__handle","");
  const heading=textRow(dialog,"h2","vz-sheet__title","오늘의 목표를 설정하세요");heading.id="vz-goal-sheet-title";
  textRow(dialog,"p","vz-sheet__caption","오늘은 어떤 연습을 해볼까요?");
  const list=el("div","vz-sheet__list");
  for(const suggestion of suggestions){
    const row=el("div","vz-sheet__row");
    const check=el("input");check.type="checkbox";check.checked=suggestion.selected!==false;check.value=suggestion.id;
    check.id="vz-suggestion-"+suggestion.id;
    const label=el("label");label.htmlFor=check.id;
    textRow(label,"span","",suggestion.title);
    if(suggestion.subtitle)textRow(label,"small","",suggestion.subtitle);
    row.append(check,label);list.append(row);
  }
  dialog.append(list);
  const field=el("label","vz-sheet__field");
  textRow(field,"span","","오늘의 연습 시간 목표 (선택)");
  const time=el("input");time.type="number";time.min="0";time.max="720";time.step="5";
  time.value=targetMinutes===null?"":String(targetMinutes);
  time.placeholder="미설정";time.setAttribute("aria-label","오늘의 목표 시간 분");
  field.append(time);dialog.append(field);
  const actions=el("div","vz-sheet__actions");
  const save=el("button","vz-button vz-button--primary vz-button--block","오늘의 목표 설정하기");
  const rest=el("button","vz-button vz-button--secondary vz-button--block","오늘은 쉴래요");
  const defer=el("button","vz-button vz-button--quiet vz-button--block","나중에 정할게요");
  save.type=rest.type=defer.type="button";
  actions.append(save,rest,defer);dialog.append(actions);overlay.append(dialog);
  const priorOverflow=document.body.style.overflow;
  function close(){
    overlay.removeEventListener("keydown",handleKeys);
    overlay.remove();document.body.style.overflow=priorOverflow;
    if(oldFocus && typeof oldFocus.focus==="function")oldFocus.focus();
  }
  function handleKeys(event){
    if(event.key==="Escape"){event.preventDefault();close();onDefer();return;}
    if(event.key!=="Tab")return;
    const focusable=[...dialog.querySelectorAll("button:not([disabled]),input:not([disabled])")];
    if(!focusable.length)return;
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
  overlay.addEventListener("keydown",handleKeys);
  overlay.addEventListener("click",e=>{if(e.target===overlay){close();onDefer();}});
  save.addEventListener("click",()=>{
    const raw=time.value.trim();
    const minutes=raw===""?null:Number(raw);
    if(minutes!==null && (!Number.isFinite(minutes)||minutes<0||minutes>720)){time.setCustomValidity("0~720분 범위로 입력하세요.");time.reportValidity();return;}
    const selectedIds=[...list.querySelectorAll("input:checked")].map(x=>x.value);
    close();onSave({selectedIds,targetMinutes:minutes});
  });
  time.addEventListener("input",()=>time.setCustomValidity(""));
  rest.addEventListener("click",()=>{close();onRest();});
  defer.addEventListener("click",()=>{close();onDefer();});
  document.body.append(overlay);document.body.style.overflow="hidden";
  save.focus();
  return {close,root:overlay};
}

/* Approved student home v1: composes the DS layer, without persistence or routing.
 * Time, date, streak and goal eligibility are calculated by the caller.
 * ratios are percentages (100 = 100%). All user supplied text uses textContent.
 */
function homeIcon(name, className="") {
  const icon=el("i","ph-fill ph-"+name+" vz-home-icon "+className);
  icon.setAttribute("aria-hidden","true"); return icon;
}
function homeButton(label, icon, callback, className="") {
  const button=el("button",className); button.type="button";
  button.setAttribute("aria-label",label);
  if(icon)button.append(homeIcon(icon));
  if(callback)button.addEventListener("click",callback);
  return button;
}
function homeHeading(title, icon) {
  const heading=el("h2","vz-home-heading");heading.append(homeIcon(icon),el("span","",title));return heading;
}
function homeCard(title, icon) {
  const card=el("section","vz-card vz-home-card");
  const head=el("header","vz-home-card-head"); head.append(homeHeading(title,icon));card.append(head);
  return {card,head};
}
const homeNumber=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const homeDuration=value=>{
  const minutes=Math.round(homeNumber(value));
  return minutes>=60?Math.floor(minutes/60)+"시간"+(minutes%60?" "+minutes%60+"분":""):minutes+"분";
};
const homeCompactDuration=value=>{
  const minutes=Math.round(homeNumber(value));return minutes>=60?(Math.round(minutes/6)/10)+"h":minutes+"분";
};
function homeDayLabel(daysLeft) {
  if(!Number.isFinite(Number(daysLeft))||daysLeft==null)return "";
  return Number(daysLeft)===0?"D-day":Number(daysLeft)>0?"D-"+daysLeft:"D+"+Math.abs(daysLeft);
}
export function createStudentHeader({greeting="반가워요,",name="",subtitle="오늘도 무대를 향해 한 걸음 더!",onNotifications,onProfile}={}) {
  const header=el("header","vz-home-header");
  const brand=el("div","vz-home-brand");
  const mark=el("span","vz-home-brand-mark");mark.setAttribute("aria-hidden","true");
  for(let i=0;i<5;i++)mark.append(el("b"));
  brand.append(mark,el("span","","Vocalzip"));header.append(brand);
  const actions=el("div","vz-home-header-actions");
  const notification=homeButton("알림","bell",onNotifications,"vz-home-round");
  // A notification dot is only rendered when the caller has supplied a count/state.
  actions.append(notification,homeButton("프로필","user",onProfile,"vz-home-round"));
  header.append(actions);
  textRow(header,"h1","vz-home-greeting",greeting+(name?" "+name+"님":""));
  textRow(header,"p","vz-home-greeting-sub",subtitle);
  return header;
}
export function createUpcomingStage({stage=null,lesson=null,onOpen=()=>{},onStage=onOpen,onLesson=onOpen}={}) {
  const {card,head}=homeCard("다가오는 무대","mask-happy");
  card.classList.add("vz-home-stage");
  const open=homeButton("전체 일정 보기","caret-right",onOpen,"vz-home-text-button");
  open.prepend(el("span","","전체보기"));head.append(open);
  if(stage){
    const content=el("div","vz-home-stage-content");
    const copy=el("div","vz-home-stage-copy");
    const title=el("div","vz-home-stage-title");
    title.append(el("h3","",stage.title||"다가오는 무대"));
    if(homeDayLabel(stage.daysLeft))title.append(el("strong","vz-home-dday",homeDayLabel(stage.daysLeft)));
    copy.append(title);
    if(stage.subtitle)textRow(copy,"p","vz-home-stage-song",stage.subtitle);
    if(stage.dateLabel){const date=el("p","vz-home-stage-date");date.append(homeIcon("calendar-blank"),el("span","",stage.dateLabel));copy.append(date);}
    const art=el("div","vz-home-stage-art");art.setAttribute("aria-hidden","true");if(stage.id!=null)art.dataset.poster=String(stage.id);
    art.append(el("span","vz-home-curtain vz-home-curtain--left"),el("span","vz-home-curtain vz-home-curtain--right"),el("span","vz-home-stage-light"),el("span","vz-home-stage-floor"));
    content.append(copy,art);const detail=homeButton("무대 상세 보기",null,onStage,"vz-home-stage-detail"); detail.append(content);card.append(detail);
  }else{
    const empty=homeButton("다가오는 무대 일정 확인","calendar-blank",onOpen,"vz-home-stage-empty");
    empty.append(el("span","","다가오는 무대를 준비해 보세요"));card.append(empty);
  }
  const strip=homeButton(lesson?"다음 레슨 보기":"레슨 일정 확인","calendar-blank",onLesson,"vz-home-lesson");
  strip.append(el("strong","","다음 레슨"),el("span","vz-home-lesson-date",lesson?(lesson.dateLabel||lesson.subtitle||lesson.title||"일정 확인"):"레슨 일정 확인"));
  if(lesson&&homeDayLabel(lesson.daysLeft))strip.append(el("span","vz-home-lesson-dday",homeDayLabel(lesson.daysLeft)));
  strip.append(homeIcon("caret-right"));card.append(strip);return card;
}
export function createGoalProgress({completed=0,total=0}={}) {
  const pct=percent(completed,total);
  const gauge=el("div","vz-home-gauge");
  gauge.setAttribute("role","img");
  gauge.setAttribute("aria-label",pct==null?"목표 없음":"오늘의 목표 "+completed+"/"+total+"개 완료, "+pct+"퍼센트");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 106 57");svg.setAttribute("aria-hidden","true");
  for(const kind of ["track","progress"]){
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d","M 4 53 A 49 49 0 0 1 102 53");path.setAttribute("class","vz-home-gauge-"+kind);
    path.setAttribute("pathLength","100");
    if(kind==="progress"){path.setAttribute("stroke-dasharray",clamp(pct??0,0,100)+" 100");if(!pct)path.setAttribute("visibility","hidden");}
    svg.append(path);
  }
  gauge.append(svg,el("strong","vz-home-gauge-value",pct==null?"—":pct+"%"),el("span","vz-home-gauge-detail",pct==null?"목표 없음":completed+"/"+total+" 완료"));return gauge;
}
export function createGoalChecklist({goals=[],onGoalToggle=()=>{},onGoals=()=>{}}={}) {
  const {card,head}=homeCard("오늘의 목표","sparkle");card.classList.add("vz-home-goals");
  const edit=homeButton("오늘의 목표 설정","caret-right",onGoals,"vz-home-icon-button");head.append(edit);
  const body=el("div","vz-home-goal-body");
  // Clone state: optimistic UI must never mutate application records.
  const items=goals.map(goal=>({...goal,completed:Boolean(goal.completed)}));
  const summary=el("div","vz-home-goal-summary");
  const refresh=()=>summary.replaceChildren(createGoalProgress({completed:items.filter(g=>g.completed).length,total:items.length}));
  refresh();body.append(summary);
  const list=el("div","vz-home-goal-list vz-goal-list");list.tabIndex=0;list.setAttribute("role","region");list.setAttribute("aria-label","오늘의 목표 목록, 내부 스크롤");
  const status=el("p","vz-home-goal-status");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  if(!items.length){
    const empty=homeButton("오늘의 목표 설정",null,onGoals,"vz-home-empty-action");empty.append(el("span","","오늘의 목표를 정해보세요"),homeIcon("caret-right"));list.append(empty);
  }
  for(const goal of items){
    const row=el("label","vz-home-goal-row vz-goal-row");
    const check=el("input","vz-home-goal-check");check.type="checkbox";check.checked=goal.completed;
    check.setAttribute("aria-label",goal.title||"목표");
    const title=el("span","vz-home-goal-title",goal.title||"목표");
    const source=el("span","vz-home-goal-source",({homework:"숙제",personal:"개인",recommendation:"추천"})[goal.source]||"");
    row.append(check,title,source);list.append(row);
    check.addEventListener("change",async()=>{
      const previous=goal.completed,next=check.checked;
      goal.completed=next;check.disabled=true;row.setAttribute("aria-busy","true");
      status.textContent="목표 저장 중…";refresh();
      try{
        const result=await onGoalToggle(goal.id,next);
        if(result===false)throw new Error("save rejected");
        status.textContent="목표를 저장했어요.";
      }catch{
        goal.completed=previous;check.checked=previous;refresh();
        status.textContent="저장하지 못했어요. 다시 체크해 주세요.";
      }finally{check.disabled=false;row.removeAttribute("aria-busy");}
    });
  }
  body.append(list);card.append(body,status);return card;
}
const flowerPath="M20 3 C24 -1 29 2 29 7 C35 5 39 10 36 15 C42 18 41 24 36 27 C39 33 34 37 29 35 C27 41 21 41 18 36 C13 40 8 36 9 31 C3 32 0 26 4 22 C-1 18 2 12 8 12 C7 6 13 2 17 6 C17 4 18 3 20 3 Z";
function homeFlower({state,ratio,minutes,today}) {
  const flower=el("span","vz-home-flower");
  const hasTarget=ratio!=null;
  const level=state==="future"?"future":!hasTarget?"unplanned":!minutes?"empty":ratio>120?"high":ratio>=100?"met":"low";
  flower.dataset.level=level;
  if(today)flower.classList.add("is-today");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","-4 -4 48 48");svg.setAttribute("aria-hidden","true");
  if(today){const outline=document.createElementNS(svg.namespaceURI,"path");outline.setAttribute("d",flowerPath);outline.setAttribute("class","vz-home-flower-today");svg.append(outline);}
  const shape=document.createElementNS(svg.namespaceURI,"path");shape.setAttribute("d",flowerPath);shape.setAttribute("class","vz-home-flower-shape");svg.append(shape);
  if(hasTarget&&ratio>=100&&state!=="future"){
    const check=document.createElementNS(svg.namespaceURI,"path");check.setAttribute("d","M11 20 L17 26 L29 13");check.setAttribute("class","vz-home-flower-check");svg.append(check);
  }
  flower.append(svg);return flower;
}
export function createWeeklyPractice({days=[],actualMinutes=0,targetMinutes=null,ratio=null,streak=0,onGrowth}={}) {
  const {card,head}=homeCard("이번 주 연습","chart-bar");card.classList.add("vz-home-week");
  const streakLabel=el("span","vz-home-streak");streakLabel.append(homeIcon("fire"),el("span","",homeNumber(streak)+"일 연속"));head.append(streakLabel);
  if(onGrowth){const growth=homeButton("성장 기록 보기","caret-right",onGrowth,"vz-home-icon-button");head.append(growth);}
  const grid=el("div","vz-home-week-grid");
  for(const item of days.slice(0,7)){
    const minutes=homeNumber(item.minutes);
    const dayRatio=Number(item.targetMinutes)>0?minutes/Number(item.targetMinutes)*100:item.ratio!=null&&Number.isFinite(Number(item.ratio))?Number(item.ratio):null;
    const day=el("div","vz-home-week-day vz-week-day");
    day.dataset.date=item.date||"";day.dataset.state=item.state||"empty";day.dataset.today=String(Boolean(item.today));
    day.setAttribute("aria-label",[item.date,item.label?item.label+"요일":"",item.today?"오늘":"",item.state==="future"?"예정":minutes+"분 연습",dayRatio==null?"목표 미설정":"달성률 "+Math.round(dayRatio)+"%"].filter(Boolean).join(", "));
    const label=el("span","vz-home-day-label"+(item.today?" is-today":""),item.today?"오늘":item.label||"");
    label.setAttribute("aria-hidden","true");
    day.append(label,homeFlower({state:item.state,ratio:dayRatio,minutes,today:item.today}),el("span","vz-home-day-time",item.state==="future"?"–":minutes+"분"));grid.append(day);
  }
  card.append(grid);
  if(!days.length)textRow(card,"p","vz-home-no-week","이번 주 연습 기록이 아직 없어요.");
  const pct=Number(targetMinutes)>0?homeNumber(actualMinutes)/Number(targetMinutes)*100:ratio;
  const footer=el("p","vz-home-week-summary");
  textRow(footer,"span","vz-home-summary-full","실제 "+homeDuration(actualMinutes)+" · 목표 "+(targetMinutes==null?"미설정":homeDuration(targetMinutes))+" · 달성률 ");
  textRow(footer,"span","vz-home-summary-compact","실제 "+homeCompactDuration(actualMinutes)+" · 목표 "+(targetMinutes==null?"미설정":homeCompactDuration(targetMinutes))+" · ");
  textRow(footer,"strong","",pct==null?"—":Math.round(homeNumber(pct))+"%");
  card.append(footer);return card;
}
export function createRecentSongActions({recent=null,onPlay=()=>{},onRecent=onPlay,onLessons=()=>{},onPractice=()=>{}}={}) {
  const grid=el("div","vz-home-bottom-grid vz-recent-region");
  const song=el("article","vz-card vz-home-song vz-song-tile");
  const songDetail=homeButton(recent?"최근 연습곡 "+recent.title+" 열기":"내 곡 선택",null,onRecent,"vz-home-song-detail");
  const head=el("div","vz-home-song-heading");head.append(homeHeading("최근 연습곡","music-notes"),homeIcon("caret-right"));songDetail.append(head);
  const cover=el("span","vz-home-song-cover");cover.setAttribute("aria-hidden","true");
  cover.append(homeIcon("music-notes"));songDetail.append(cover);
  const copy=el("span","vz-home-song-copy");copy.append(el("strong","",recent?.title||"연습할 곡을 골라보세요"),el("span","",recent?.artist||"내 곡에서 시작하기"));songDetail.append(copy);song.append(songDetail);
  if(recent?.canPlay){const play=homeButton("최근 곡 녹음 재생","play",onPlay,"vz-home-play");song.append(play);}
  if(recent)song.title=[recent.title,recent.artist].filter(Boolean).join(" · ");
  grid.append(song);
  const quick=el("div","vz-home-quick-stack vz-quick-actions");
  for(const [label,icon,action] of [["레슨노트","notebook",onLessons],["연습기록","clock-counter-clockwise",onPractice]]){
    const button=homeButton(label,icon,action,"vz-card vz-home-quick");
    button.append(el("span","",label),homeIcon("caret-right"));quick.append(button);
  }
  grid.append(quick);return grid;
}
export function createStudentHome({greeting,name,subtitle,stage,lesson,goals=[],week={},recent,onGoals,onGoalToggle,onNotifications,onProfile,onPractice,onLessons,onPlay,onRecent,onStage,onLesson,onGrowth,onCalendar}={}) {
  const home=el("div","vz-student-home");home.dataset.vzTheme="student";home.dataset.vzDesign="approved-home-v1";
  home.append(createStudentHeader({greeting,name,subtitle,onNotifications,onProfile}));
  const stack=el("div","vz-home-stack");
  stack.append(createUpcomingStage({stage,lesson,onOpen:onCalendar||onLessons,onStage,onLesson}),
    createGoalChecklist({goals,onGoals,onGoalToggle}),
    createWeeklyPractice({...week,onGrowth}),
    createRecentSongActions({recent,onPlay,onRecent,onLessons,onPractice}));
  home.append(stack);return home;
}
/* Standalone preview dock only; the application keeps its existing .v-nav router. */
export function createStudentDock({active="home",onNavigate=()=>{}}={}) {
  const dock=el("nav","vz-approved-dock vz-home-dock");dock.setAttribute("aria-label","하단 탐색");
  dock.dataset.vzTheme="student";dock.dataset.vzDesign="approved-home-v1";
  for(const [id,label,icon] of [["home","홈","house"],["songs","내 곡","music-notes"],["record","녹음","microphone"],["library","보관함","archive-box"],["calendar","일정","calendar-blank"]]){
    const button=homeButton(label,icon,()=>onNavigate(id),"vz-approved-dock-item"+(id==="record"?" vz-approved-dock-record":""));
    button.append(el("span","",label));if(id===active)button.setAttribute("aria-current","page");dock.append(button);
  }
  return dock;
}
