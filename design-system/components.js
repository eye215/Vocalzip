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
  main.append(copy,textRow(el("div"),"strong","vz-hero__count","D-" + Math.max(0,daysLeft)));
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
    ["calendar","캘린더","ph ph-calendar-blank"],
    ["growth","성장","ph ph-chart-line-up"]
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
