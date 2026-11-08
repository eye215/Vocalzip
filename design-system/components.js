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
let homeGlyphId=0;
const homeGlyphs={"house":"<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z\"/>","music-notes":"<path d=\"M9 18V5l12-2v13M9 8l12-2\"/><ellipse cx=\"6\" cy=\"18\" rx=\"3\" ry=\"3\"/><ellipse cx=\"18\" cy=\"16\" rx=\"3\" ry=\"3\"/>","bell":"<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4\"/>","user":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>","mask-happy":"<path d=\"M4 4q8 4 16 0v8c0 5-5 9-8 10-3-1-8-5-8-10zM8 10h1m6 0h1M8 15q4 4 8 0\"/>","sparkle":"<path d=\"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z\"/>","chart-bar":"<path d=\"M5 20v-7m7 7V4m7 16V9\"/>","calendar-blank":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M7 3v4m10-4v4M3 11h18\"/>","archive-box":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"5\" rx=\"1\"/><path d=\"M5 8v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4\"/>","notebook":"<rect x=\"5\" y=\"3\" width=\"15\" height=\"18\" rx=\"2\"/><path d=\"M2 7h5m-5 5h5m-5 5h5m4-9h5m-5 4h5\"/>","clock-counter-clockwise":"<path d=\"M3 11a9 9 0 1 1 3 8M3 4v7h7m2-4v5l4 2\"/>","microphone":"<rect x=\"8\" y=\"2\" width=\"8\" height=\"13\" rx=\"4\"/><path d=\"M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8\"/>","caret-right":"<path d=\"m9 5 7 7-7 7\"/>","play":"<path d=\"m9 5 11 7-11 7z\" fill=\"currentColor\" stroke=\"none\"/>","fire":"<path d=\"M13 3c1 5 7 6 7 12a8 8 0 1 1-16 0c0-4 3-6 5-9-1 4 1 6 3 6 2-2 2-5 1-9z\"/>","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1\"/>"};
export function createHomeIcon(name,className="") {
  const icon=el("span","vz-home-icon "+className);icon.setAttribute("aria-hidden","true");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("focusable","false");
  svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
  svg.setAttribute("stroke-width","1.7");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
  // Only local icon constants enter SVG markup; user text uses textContent.
  svg.innerHTML=homeGlyphs[name]||homeGlyphs.sparkle;icon.append(svg);return icon;
}
const homeIcon=createHomeIcon;
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
export function createStudentHeader({greeting="반가워요,",name="",subtitle="목표를 확인하고, 오늘의 연습을 시작해요.",onNotifications,onProfile}={}) {
  const header=el("header","vz-home-header");
  const brand=el("div","vz-home-brand");
  const mark=el("span","vz-home-brand-mark");mark.setAttribute("aria-hidden","true");
  for(let i=0;i<5;i++)mark.append(el("b"));
  brand.append(mark,el("span","","VOCAL.zip"));header.append(brand);
  const actions=el("div","vz-home-header-actions");
  const notification=homeButton("알림","bell",onNotifications,"vz-home-round");
  // A notification dot is only rendered when the caller has supplied a count/state.
  actions.append(notification,homeButton("프로필","user",onProfile,"vz-home-round"));
  header.append(actions);
  const hello=textRow(header,"h1","vz-home-greeting",greeting+(name?" "+name+"님":""));
  hello.append(homeIcon("sun","vz-home-sun"));
  textRow(header,"p","vz-home-greeting-sub",subtitle);
  return header;
}
export function createUpcomingStage({stage=null,lesson=null,onOpen=()=>{},onStage=onOpen,onLesson=onOpen}={}) {
  const {card,head}=homeCard(stage?"다가오는 무대":"다가오는 레슨",stage?"mask-happy":"calendar-blank");
  card.classList.add("vz-home-stage");
  if(!stage)card.classList.add("vz-home-stage--lesson-only");
  const open=homeButton("전체 일정 보기","caret-right",onOpen,"vz-home-text-button");
  open.prepend(el("span","","전체보기"));head.append(open);
  if(stage){
    const content=el("div","vz-home-stage-content");
    const copy=el("div","vz-home-stage-copy");
    const title=el("div","vz-home-stage-title");
    const name=el("h3","",stage.title||"다가오는 무대");name.title=stage.title||"다가오는 무대";title.append(name);
    if(homeDayLabel(stage.daysLeft))title.append(el("strong","vz-home-dday",homeDayLabel(stage.daysLeft)));
    copy.append(title);
    if(stage.subtitle){const subtitle=textRow(copy,"p","vz-home-stage-song",stage.subtitle);subtitle.title=stage.subtitle;}
    if(stage.dateLabel){const date=el("p","vz-home-stage-date");date.append(homeIcon("calendar-blank"),el("span","",stage.dateLabel));copy.append(date);}
    const art=el("div","vz-home-stage-art");art.setAttribute("aria-hidden","true");if(stage.id!=null)art.dataset.poster=String(stage.id);
    // The home skin shows only actual user posters; poster references remain unchanged.
    content.append(copy,art);const detail=homeButton("무대 상세 보기",null,onStage,"vz-home-stage-detail"); detail.append(content);card.append(detail);
  }
  if(lesson){
    const strip=homeButton("다음 레슨 보기","calendar-blank",onLesson,"vz-home-lesson");
    strip.append(el("strong","","다음 레슨"),el("span","vz-home-lesson-date",lesson.dateLabel||lesson.subtitle||lesson.title||"일정 확인"));
    if(homeDayLabel(lesson.daysLeft))strip.append(el("span","vz-home-lesson-dday",homeDayLabel(lesson.daysLeft)));
    strip.append(homeIcon("caret-right"));card.append(strip);
  }
  return card;
}
export function createGoalProgress({completed=0,total=0}={}) {
  const pct=percent(completed,total),gauge=el("div","vz-home-gauge");
  gauge.setAttribute("role","img");
  gauge.setAttribute("aria-label",pct==null?"목표 없음":"오늘의 목표 "+completed+"/"+total+"개 완료, "+pct+"퍼센트");
  gauge.append(el("span","vz-home-gauge-label","목표 달성률"),el("strong","vz-home-gauge-value",pct==null?"—":pct+"%"),el("span","vz-home-gauge-detail",pct==null?"오늘의 목표를 설정해 보세요":completed+" / "+total+"개 완료"));
  const bar=el("span","vz-home-progress");bar.setAttribute("aria-hidden","true");
  bar.style.setProperty("--vz-goal-progress",clamp(pct??0,0,100)+"%");gauge.append(bar);return gauge;
}
export function createGoalChecklist({goals=[],onGoalToggle=()=>{},onGoals=()=>{},onRecord=()=>{}}={}) {
  const {card,head}=homeCard("오늘의 연습","sparkle");card.classList.add("vz-home-goals");
  const heading=head.querySelector("h2"),edit=homeButton("오늘의 목표 설정",null,onGoals,"vz-home-heading-action");
  edit.append(...heading.childNodes);heading.append(edit);
  const body=el("div","vz-home-goal-body");
  // Clone state: optimistic UI must never mutate application records.
  const items=goals.map(goal=>({...goal,completed:Boolean(goal.completed)}));
  const summary=el("div","vz-home-goal-summary");
  const refresh=()=>summary.replaceChildren(createGoalProgress({completed:items.filter(g=>g.completed).length,total:items.length}));
  refresh();
  const record=homeButton("녹음 시작하기","microphone",onRecord,"vz-home-record-start");record.append(el("span","","녹음 시작"),homeIcon("caret-right"));
  const overview=el("div","vz-home-goal-overview");overview.append(summary,record);body.append(overview);
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
  const updateScroll=()=>{
    const available=Math.max(0,list.clientHeight-12),total=list.scrollHeight,overflow=total>list.clientHeight+1;
    list.classList.toggle("is-overflowing",overflow);
    const thumb=overflow?Math.max(20,available*list.clientHeight/total):0;
    list.style.setProperty("--vz-scroll-thumb",thumb+"px");
    list.style.setProperty("--vz-scroll-offset",(6+(total>list.clientHeight?(available-thumb)*list.scrollTop/(total-list.clientHeight):0))+"px");
  };
  list.addEventListener("scroll",updateScroll,{passive:true});requestAnimationFrame(updateScroll);
  body.append(list);card.append(body,status);return card;
}
function homeFlower({state,ratio,minutes,today}) {
  const bar=el("span","vz-home-flower"),hasTarget=ratio!=null;
  bar.dataset.level=state==="future"?"future":!hasTarget?"unplanned":!minutes?"empty":ratio>120?"high":ratio>=100?"met":"low";
  bar.dataset.hasMinutes=String(minutes>0);if(today)bar.classList.add("is-today");
  bar.style.setProperty("--vz-day-fill",Math.min(100,hasTarget?Math.max(0,ratio):minutes>0?50:0)+"%");
  bar.setAttribute("aria-hidden","true");return bar;
}
export function createWeeklyPractice({days=[],actualMinutes=0,targetMinutes=null,ratio=null,streak=0,onGrowth}={}) {
  const {card,head}=homeCard("이번 주 연습","chart-bar");card.classList.add("vz-home-week");
  const streakLabel=el("span","vz-home-streak");streakLabel.append(homeIcon("fire"),el("span","",homeNumber(streak)+"일 연속"));
  if(onGrowth){const growth=homeButton("성장 기록 보기",null,onGrowth,"vz-home-streak-action");growth.append(streakLabel);head.append(growth);}else head.append(streakLabel);
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
  const full=el("span","vz-home-summary-full");full.append("실제 ");textRow(full,"strong","vz-home-summary-duration",homeDuration(actualMinutes));full.append(" · 목표 ");textRow(full,"strong","vz-home-summary-duration",targetMinutes==null?"미설정":homeDuration(targetMinutes));full.append(" · 달성률 ");footer.append(full);
  textRow(footer,"span","vz-home-summary-compact","실제 "+homeCompactDuration(actualMinutes)+" · 목표 "+(targetMinutes==null?"미설정":homeCompactDuration(targetMinutes))+" · ");
  textRow(footer,"strong","",pct==null?"—":Math.round(homeNumber(pct))+"%");
  card.append(footer);return card;
}
export function createRecentSongActions({recent=null,onPlay=()=>{},onRecent=onPlay,onLessons=()=>{},onPractice=()=>{}}={}) {
  const grid=el("div","vz-home-bottom-grid vz-recent-region");
  const song=el("article","vz-card vz-home-song vz-song-tile");if(recent?.canPlay)song.classList.add("has-representative-media");
  const songDetail=homeButton(recent?"최근 연습곡 "+recent.title+" 열기":"내 곡 선택",null,onRecent,"vz-home-song-detail");
  const head=el("div","vz-home-song-heading");head.append(homeHeading("최근 연습곡","music-notes"),homeIcon("caret-right"));songDetail.append(head);
  const cover=el("span","vz-home-song-cover");cover.setAttribute("aria-hidden","true");
  cover.classList.toggle("vz-home-song-cover--playable",Boolean(recent?.canPlay));
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
export function createStudentHome({greeting,name,subtitle,stage,lesson,goals=[],week={},recent,onGoals,onGoalToggle,onNotifications,onProfile,onPractice,onLessons,onPlay,onRecent,onStage,onLesson,onGrowth,onCalendar,onRecord}={}) {
  const home=el("div","vz-student-home");home.dataset.vzTheme="student";home.dataset.vzDesign="approved-home-v1";
  home.append(createStudentHeader({greeting,name,subtitle,onNotifications,onProfile}));
  const stack=el("div","vz-home-stack");
  stack.append(createGoalChecklist({goals,onGoals,onGoalToggle,onRecord}),createWeeklyPractice({...week,onGrowth}));
  if(stage||lesson)stack.append(createUpcomingStage({stage,lesson,onOpen:onCalendar||onLessons,onStage,onLesson}));
  stack.append(createRecentSongActions({recent,onPlay,onRecent,onLessons,onPractice}));
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
