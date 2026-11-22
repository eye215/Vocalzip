/* 내 로드맵 — what to fix next, from how the person sings lately (pure: no DOM, storage or network; also loaded by
 * Node tests). It replaces the fixed 9-chapter roadmap of 노래 연습실: nothing here is a fixed order, everything is
 * worked out again from the records each time (a new analysed recording changes it at once).
 *
 * Inputs, all read, nothing stored:
 *   tips   VZ.practiceTips(media) — the rules over the recordings' analysis (app/practice-tips.js): the median of the
 *          last reliable takes (3 or more, one analysis version) for 음정 오차 (into), 지속음 흔들림 (wob), 비브라토 (vib)
 *          and 프레이즈 길이 (phr); `tips` lists the ones past their line, `measured` the ones that had a value at all.
 *   db     the 기본기 단계 records (app/levels-model.js): step per area, and its focus when the recordings say nothing.
 *
 * build({db, today, tips}) → {
 *   basis:{enough, count, range},           how many recordings the roadmap stands on
 *   focus:[{area, title, from:'recording'|'skill', why, goal, metric?, value?, tipKey?, exercise, step, stepSay}],
 *                                           at most FOCUS_MAX, the most needed first: these are what 오늘의 연습 does
 *   areas:[{id, title, state:'fix'|'ok'|'skill'|'unknown', line}]  every 기본기 area, in the table's order
 * }
 * Order of focus: what the recordings show past its line (the strongest first); when they show nothing (too few
 * takes, or all fine), the 기본기 focus (app/levels-model.js focus: a step one day away, else an area not measured).
 * Words: what to practise and why, never a verdict on the voice. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const req=(path,name)=>node?require(path):root[name];
  const api=factory({levels:()=>req('./levels-model.js','VzipLevels')});
  if(node)module.exports=api;else root.VzipRoadmap=api;
})(typeof self!=='undefined'?self:globalThis,dep=>{
'use strict';
const list=v=>Array.isArray(v)?v:[];
const FOCUS_MAX=2;
/** Which 기본기 area each recording rule speaks for. */
const TIP_AREA={into:'pitch',wob:'sustain',vib:'vibrato',phr:'breath'};
const AREA_TIP=Object.fromEntries(Object.entries(TIP_AREA).map(([k,a])=>[a,k]));
const josa=(w,a,b)=>{const c=String(w).trim().slice(-1).charCodeAt(0);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28?a:b;};

function build({db={},today='',tips=null,isOn=()=>true}={}){
  const L=dep.levels();if(!L)return {basis:{enough:false,count:0,range:''},focus:[],areas:[]};
  const env={today},enough=!!tips?.enough,fired=new Map(list(tips?.tips).filter(t=>TIP_AREA[t.key]).map(t=>[TIP_AREA[t.key],t]));
  const measured=new Set(list(tips?.measured));
  const skill=id=>{try{return L.skill(db,id,env);}catch{return null;}};
  const exerciseOf=id=>{const s=skill(id),step=s?.next?.step||5;return {exercise:L.exerciseFor(id,step),step:s?.next?.step||0,stepSay:s?.next?.say||''};};
  const focus=[];
  // 1. The recordings: past its line, the strongest first (practiceTips sorts by score).
  for(const t of list(tips?.tips)){
    const area=TIP_AREA[t.key];if(!area||focus.some(f=>f.area===area))continue;
    const a=L.SKILLS.find(x=>x.id===area),ex=exerciseOf(area);
    if(!ex.exercise||!isOn(ex.exercise))continue;
    focus.push({area,title:a.title,from:'recording',tipKey:t.key,metric:t.metric,value:t.value,
      why:'최근 녹음에서 '+t.metric+' '+t.value+' ('+t.basis+')',goal:t.goal,...ex});
    if(focus.length>=FOCUS_MAX)break;
  }
  // 2. Nothing from the recordings: the 기본기 focus (a step one day away, an area not measured yet …).
  if(!focus.length){
    let f=null;try{f=L.focus(db,env,{isOn});}catch{}
    if(f)focus.push({area:f.area,title:f.title,from:'skill',why:f.why,goal:f.step+'단계: '+f.say,exercise:f.exercise,step:f.step,stepSay:f.say});
  }
  const areas=L.SKILLS.map(a=>{
    const t=fired.get(a.id),s=skill(a.id),stepLine=s?(s.step?'기본기 '+s.step+'단계':s.state==='calibrating'?'기본기 기준 맞추는 중':'기본기 아직 안 쟀어요'):'';
    if(t)return {id:a.id,title:a.title,state:'fix',line:t.metric+' '+t.value+' · '+stepLine};
    const tip=AREA_TIP[a.id];
    if(tip&&enough&&measured.has(tip))return {id:a.id,title:a.title,state:'ok',line:'최근 녹음에서 괜찮아요 · '+stepLine};
    if(s&&(s.step||s.measured))return {id:a.id,title:a.title,state:'skill',line:stepLine};
    return {id:a.id,title:a.title,state:'unknown',line:tip?'녹음이 '+(enough?'이 부분을 재지 못했어요':'3개 넘게 분석되면 알 수 있어요')+' · '+stepLine:'오늘의 연습에서 재요'};
  });
  return {basis:{enough,count:Number(tips?.count)||0,range:String(tips?.range||'')},focus,areas};
}
/** One line for the 오늘 row: "손볼 곳 · 음정 · 호흡" (or what to do first). */
function summary(r){
  const f=list(r?.focus);
  if(!f.length)return '녹음을 분석하면 손볼 곳을 정해요';
  return (f[0].from==='recording'?'손볼 곳 · ':'기본기 · ')+f.map(x=>x.title).join(' · ');
}
return {FOCUS_MAX,TIP_AREA,build,summary,josa};
});
