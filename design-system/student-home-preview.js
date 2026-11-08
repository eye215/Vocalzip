/* Fixed fixtures are isolated to this preview. No persistence or service calls.
 * Query ?state=empty|many|failure|boundaries to inspect additional states.
 */
import {createStudentHome,createStudentDock} from "./components.js?v=7";
const state=new URLSearchParams(location.search).get("state");
const status=document.querySelector(".preview-status");
const announce=label=>()=>{status.textContent=label;};
const goals=[
  {id:"warmup",title:"발성 연습",source:"homework",completed:true},
  {id:"highnote",title:"2절 고음 연습",source:"homework",completed:false},
  {id:"lyrics",title:"가사 암기",source:"personal",completed:false}
];
const daily=[15,30,60,30,15,30,null];
const boundary=[0,29.7,30,36,36.3,0,null];
const minutes=state==="boundaries"?boundary:daily;
const days=minutes.map((value,index)=>({
  date:"2026-11-"+String(2+index).padStart(2,"0"),
  label:["월","화","수","목","금","토","일"][index],
  minutes:value,targetMinutes:30,ratio:value==null?null:value/30*100,
  state:value==null?"future":value===0?"empty":value<30?"partial":"met",today:index===5
}));
const home=createStudentHome({
  greeting:"좋은 오후예요,",name:"유리",subtitle:"목표를 확인하고, 오늘의 연습을 시작해요.",
  stage:state==="empty"?null:{title:"뮤지컬 오디션",subtitle:"Wicked · Defying Gravity",dateLabel:"11월 19일 (목) 오후 2:00",daysLeft:12},
  lesson:state==="empty"?null:{title:"다음 레슨",dateLabel:"11.10 (화) 15:00",daysLeft:3},
  goals:state==="empty"?[]:state==="many"?Array.from({length:900},(_,i)=>({id:"goal-"+i,title:i%2?"긴 한글 목표명과 English Song Title 발성 및 호흡 연습 "+(i+1):"목표 "+(i+1),source:i%3?"homework":"personal",completed:i===0})):goals,
  week:state==="empty"?{days:[],actualMinutes:0,targetMinutes:null,ratio:null,streak:0}:{days,actualMinutes:minutes.reduce((sum,x)=>sum+(x||0),0),targetMinutes:180,ratio:100,streak:6},
  recent:state==="empty"?null:{id:"song",title:"Defying Gravity",artist:"뮤지컬 · Wicked",canPlay:true},
  onGoalToggle:async()=>{if(state==="failure")throw new Error("preview failure");},
  onRecord:announce("녹음 시작 · 프리뷰"),onGoals:announce("오늘의 목표 설정 · 프리뷰"),
  onNotifications:announce("알림 · 프리뷰"),onProfile:announce("프로필 · 프리뷰"),
  onStage:announce("무대 상세 · 프리뷰"),onLesson:announce("다음 레슨 · 프리뷰"),onCalendar:announce("일정 · 프리뷰"),
  onLessons:announce("레슨노트 · 프리뷰"),onPractice:announce("연습기록 · 프리뷰"),
  onRecent:announce("최근 연습곡 상세 · 프리뷰"),onPlay:announce("최근 곡 녹음 재생 · 프리뷰"),onGrowth:announce("성장 기록 · 프리뷰")
});
document.querySelector("#preview").append(home);
document.body.append(createStudentDock({onNavigate:id=>announce(({home:"홈",songs:"내 곡",record:"녹음",library:"보관함",calendar:"일정"})[id]+" · 프리뷰")()}));
