import {
  createHeroCard, createGoalCard, createWeekCard,
  createWidgetGrid, createDock, openPlanSheet
} from "./components.js";

const initialGoals=[
  {id:"warmup",title:"발성 스케일",kind:"check",completed:true},
  {id:"high",title:"2절 고음 반복 5회",kind:"count",target:5,actual:0,completed:false},
  {id:"lyrics",title:"가사 암기",kind:"check",completed:false},
  {id:"breathing",title:"호흡 컨트롤 10분",kind:"duration",target:10,actual:10,completed:true},
  {id:"audition",title:"오디션 지정곡 연습",kind:"check",completed:false},
  {id:"vowels",title:"모음 공명 연습",kind:"check",completed:false}
];
const suggested=[
  {id:"warmup",title:"발성 스케일",subtitle:"선생님 숙제",selected:true},
  {id:"high",title:"2절 고음 반복 5회",subtitle:"선생님 숙제 · 5회",selected:true},
  {id:"lyrics",title:"가사 암기",subtitle:"오디션 준비 · D-12",selected:true},
  {id:"breathing",title:"호흡 컨트롤 10분",subtitle:"개인 목표 · 10분",selected:true},
  {id:"audition",title:"오디션 지정곡 연습",subtitle:"오디션 준비",selected:true},
  {id:"vowels",title:"모음 공명 연습",subtitle:"개인 루틴",selected:true}
];
const copyInitial=()=>initialGoals.map(g=>({...g}));
const state={theme:"student",status:"planned",goals:copyInitial(),practicedMinutes:15,targetMinutes:30};
const root=document.getElementById("preview-root");
if(new URLSearchParams(location.search).get("visual")==="1")document.body.classList.add("vz-visual-only");
const make=(tag,cls="",text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};

function toast(message){
  document.querySelector(".vz-preview-toast")?.remove();
  const note=make("div","vz-preview-toast",message);note.setAttribute("role","status");document.body.append(note);
  setTimeout(()=>note.remove(),2400);
}
function render(){
  const previousScroll=document.querySelector(".vz-goal-list")?.scrollTop??0;
  root.replaceChildren();
  const page=make("main","vz-page");
  const header=make("header","vz-preview-header");
  const logo=make("div");
  const name=make("h1","vz-preview-logo");name.append("♫ ",Object.assign(make("span"),{textContent:"Vocalzip"}));
  logo.append(name);
  const shortcuts=make("div","vz-preview-head-actions");
  for(const [icon,label] of [["ph ph-bell","알림"],["ph ph-user","프로필"]]){
    const button=make("button","vz-preview-head-btn");
    button.type="button";button.setAttribute("aria-label",label);
    const glyph=make("i",icon);glyph.setAttribute("aria-hidden","true");button.append(glyph);
    button.addEventListener("click",()=>toast(label+" · 데모"));shortcuts.append(button);
  }
  header.append(logo,shortcuts);
  page.append(header,make("h2","vz-page-title","좋은 오후예요 ☀️"),make("p","vz-greeting-sub","오늘도 즐겁게 노래해요!"));
  const stack=make("div","vz-stack");
  stack.append(createHeroCard({
    title:"다가오는 무대",event:"뮤지컬 오디션",song:"Wicked · Defying Gravity",daysLeft:12,
    lesson:"다음 레슨 · 11/10 오후 3시",lessonDaysLeft:3
  }));
  stack.append(createWidgetGrid({
    song:"Defying Gravity",subtitle:"Wicked",
    onSong:()=>toast("최근 연습곡 열기 · 데모"),
    onScore:()=>toast("악보 열기 · 데모"),onTraining:()=>toast("트레이닝 · 데모")
  }));
  stack.append(createGoalCard({
    goals:state.status==="planned"?state.goals:[],
    status:state.status,
    practicedMinutes:state.practicedMinutes,targetMinutes:state.targetMinutes,
    onOpen:openPlanner,onAction:actionGoal
  }));
  stack.append(createWeekCard({
    days:[
      {label:"월",minutes:15,state:"partial"}, {label:"화",minutes:30,state:"met"},
      {label:"수",minutes:60,state:"met"}, {label:"목",minutes:30,state:"met"},
      {label:"금",minutes:15,state:"partial"}, {label:"토",minutes:null,state:"empty"},
      {label:"일",minutes:null,state:"future"}
    ],
    streak:5,targetLabel:"주간 목표 3시간",achievementLabel:"83%"
  }));
  page.append(stack);
  const docs=make("div","vz-preview-docs");
  docs.append(make("p","","이 페이지는 계정 데이터와 분리된 인터랙티브 컴포넌트 샘플입니다."),
              make("p","","학생/선생님 테마, 목표 완료·기록, 하루 휴식, 첫 진입 시트를 테스트하세요."));
  page.append(docs);
  root.append(page);
  document.querySelector(".vz-dock")?.remove();
  document.body.append(createDock({
    active:"home",onNavigate:id=>toast(id==="record"?"가운데 녹음 진입 · 데모":"탭 "+id+" · 데모")
  }));
  const list=document.querySelector(".vz-goal-list");if(list)list.scrollTop=previousScroll;
  document.documentElement.dataset.vzTheme=state.theme;
  document.getElementById("toggle-theme").textContent=state.theme==="student"?"선생님 테마 보기":"학생 테마 보기";
  document.getElementById("toggle-rest").textContent=state.status==="rest"?"연습 상태로 전환":"휴식 상태 보기";
}
function openPlanner(){
  openPlanSheet({
    suggestions:suggested.map(s=>({...s,selected:state.goals.some(g=>g.id===s.id)})),
    targetMinutes:state.targetMinutes,
    onSave:({selectedIds,targetMinutes})=>{
      const previous=new Map(state.goals.map(g=>[g.id,g]));
      state.goals=selectedIds.map(id=>({...initialGoals.find(g=>g.id===id),...(previous.get(id)||{})}));
      state.targetMinutes=targetMinutes;state.status="planned";render();toast("오늘의 목표를 설정했어요");
    },
    onRest:()=>{state.status="rest";render();toast("오늘은 쉬어가는 날");},
    onDefer:()=>{state.status="deferred";render();toast("나중에 설정할 수 있어요");}
  });
}
function actionGoal(goal){
  const item=state.goals.find(g=>g.id===goal.id);if(!item)return;
  if(item.kind==="check"){item.completed=!item.completed;render();return;}
  openRecordDialog(item);
}
function openRecordDialog(goal){
  const dialog=make("dialog","vz-sheet");
  dialog.style.cssText="border:0;max-width:calc(100% - 32px);width:360px;position:fixed;inset:0;margin:auto;max-height:fit-content";
  const title=make("h2","vz-sheet__title","수행 기록 입력");title.id="vz-record-dialog-title";
  dialog.setAttribute("aria-labelledby",title.id);
  dialog.append(title,make("p","vz-sheet__caption",goal.title));
  const form=make("form");form.method="dialog";
  const label=make("label","vz-sheet__field");
  label.append(make("span","",goal.kind==="duration"?"실제 연습 시간 (분)":"수행 횟수 (회)"));
  const input=make("input");input.type="number";input.required=true;input.min="0";input.max="720";input.step="1";
  input.value=String(goal.actual??0);input.setAttribute("aria-label","실제 수행량");
  label.append(input);form.append(label);
  const actions=make("div","vz-sheet__actions");
  const save=make("button","vz-button vz-button--primary vz-button--block","기록 저장");save.type="submit";
  const cancel=make("button","vz-button vz-button--quiet vz-button--block","취소");cancel.type="button";
  cancel.addEventListener("click",()=>dialog.close());
  actions.append(save,cancel);form.append(actions);dialog.append(form);
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const value=Number(input.value);
    if(!Number.isInteger(value)||value<0||value>720){input.reportValidity();return;}
    goal.actual=value;goal.completed=value>=goal.target;
    if(goal.kind==="duration")state.practicedMinutes=Math.max(state.practicedMinutes,value);
    dialog.close();render();toast("수행 기록을 저장했어요");
  });
  dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();input.focus();
}
document.getElementById("toggle-theme").addEventListener("click",()=>{state.theme=state.theme==="student"?"teacher":"student";render();});
document.getElementById("open-planner").addEventListener("click",openPlanner);
document.getElementById("toggle-rest").addEventListener("click",()=>{state.status=state.status==="rest"?"planned":"rest";render();});
document.getElementById("reset-demo").addEventListener("click",()=>{
  state.status="planned";state.goals=copyInitial();state.targetMinutes=30;state.practicedMinutes=15;render();
});
render();
if(new URLSearchParams(location.search).get("firstEntry")==="1")setTimeout(openPlanner,120);
