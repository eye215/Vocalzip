/* Today's practice against the day's target: one helper for home, the goal time sheet and 오늘 연습 세트.
 * Minutes and target come from the home week model (app/student-home-model.js), so there is no second counting rule:
 * only minutes the user entered count, recording length never does. Nothing here writes data. */
(function(root,factory){
  const api=factory();
  root.VzipTodayPractice=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const node=typeof module==='object'&&module.exports;
const Home=()=>node?require('./student-home-model.js'):globalThis.VzipStudentHomeModel;
/** Minutes as the home writes them: 22분, 1시간, 1시간 5분. */
const duration=value=>{const n=Math.max(0,Math.round(Number(value)||0));return n>=60?Math.floor(n/60)+'시간'+(n%60?' '+n%60+'분':''):n+'분';};
/** {minutes, targetMinutes, percent} for one day. targetMinutes is null when that day has no target; percent then too. */
function compute(db,{date,today,defaultDailyTargetMinutes,timeEntries}={}){
  const day=Home().build(db||{},{today,weekStart:date,defaultDailyTargetMinutes,...(Array.isArray(timeEntries)?{timeEntries}:{})}).week.days.find(d=>d.date===date);
  const minutes=Number(day?.minutes)||0,targetMinutes=Number(day?.targetMinutes)>0?Number(day.targetMinutes):null;
  return {minutes,targetMinutes,percent:targetMinutes?Math.round(minutes/targetMinutes*100):null};
}
/** "오늘 22분 / 목표 30분 · 73%", or "오늘 22분 · 목표 없음" without a target. */
function text(x){
  const minutes=duration(x?.minutes),target=Number(x?.targetMinutes)>0?Number(x.targetMinutes):null;
  return target?'오늘 '+minutes+' / 목표 '+duration(target)+' · '+(x.percent??Math.round((Number(x.minutes)||0)/target*100))+'%':'오늘 '+minutes+' · 목표 없음';
}
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const shift=(date,n)=>{const [y,m,d]=String(date).split('-').map(Number),value=new Date(y,m-1,d,12);value.setDate(value.getDate()+n);return ymd(value);};
const week=(db,o,anchor)=>Home().build(db||{},{today:o.today,weekStart:anchor,defaultDailyTargetMinutes:o.defaultDailyTargetMinutes,...(Array.isArray(o.timeEntries)?{timeEntries:o.timeEntries}:{})}).week;
/** The `count` days that end at `date`, oldest first, each exactly as the home week model counts it:
 * [{date,label,minutes,targetMinutes,met,today}]. met = that day reached its own target. */
function recent(db,{date,count=7,...o}={}){
  const first=shift(date,1-count),days=[];
  for(let anchor=first,guard=0;guard<count+1;guard++){
    const w=week(db,o,anchor);
    for(const d of w.days)if(d.date>=first&&d.date<=date)days.push({date:d.date,label:d.label,minutes:Number(d.minutes)||0,targetMinutes:Number(d.targetMinutes)>0?Number(d.targetMinutes):null,met:d.timeMet===true,today:d.date===date});
    if(w.end>=date)break;
    anchor=shift(w.end,1);
  }
  return days;
}
/** Days in a row that reached their target, counted back from `date`. While `date` itself has not reached it yet the
 * run that ended the day before is returned with open:true. Same daily rule as the home week (no second counting). */
function streak(db,{date,limit=366,...o}={}){
  let days=0,open=false,cursor=date,w=null;
  for(let i=0;i<=limit;i++,cursor=shift(cursor,-1)){
    if(!w||cursor<w.start)w=week(db,o,cursor);
    if(w.days.find(d=>d.date===cursor)?.timeMet===true)days++;
    else if(i===0)open=true;
    else break;
  }
  return {days,open};
}
/** What the result popup says for today's numbers x (from compute) and the minutes just added: where today stood
 * before (now − added, never below 0), the moment (empty · free · start · progress · almost · goal · over) with its
 * headline and hint, the streak line (only from two days) and the spoken summary. goal = this record crossed 100%. */
function moment(x,addedMinutes,run){
  const minutes=Math.max(0,Number(x?.minutes)||0),target=Number(x?.targetMinutes)>0?Number(x.targetMinutes):null;
  const added=Number(addedMinutes)>0?Number(addedMinutes):0,before=Math.max(0,minutes-added);
  const percent=target?x.percent??Math.round(minutes/target*100):null,beforePercent=target?Math.round(before/target*100):null;
  const state=!target?(minutes>0?'free':'empty'):minutes<=0?'empty':minutes>=target?(before<target?'goal':'over'):percent>=80?'almost':before<=0&&added>0?'start':'progress';
  const left=target?duration(target-minutes):'',extra=target&&minutes>target?'목표보다 '+duration(minutes-target)+' 더 했어요':'';
  const headline={empty:'아직 기록한 시간이 없어요',free:'오늘 연습을 기록했어요',start:'오늘 첫 연습이에요',progress:'잘 쌓이고 있어요',almost:'거의 다 왔어요',goal:'오늘 목표를 채웠어요',over:minutes>target?'목표보다 더 연습했어요':'오늘 목표를 채웠어요'}[state];
  const hint={empty:'연습 시간을 적으면 여기에 쌓여요',free:'',start:'목표까지 '+left+' 남았어요',progress:'목표까지 '+left+' 남았어요',almost:'목표까지 '+left+' 남았어요',goal:extra||'목표 '+duration(target)+'을 다 채웠어요',over:extra}[state];
  const n=target&&Number(run?.days)>=2?Number(run.days):0;
  const streakText=n?(run.open?'어제까지 ':'')+n+'일 연속 목표 달성':'';
  const summary='오늘 '+duration(minutes)+(target?', 목표 '+duration(target)+'의 '+percent+'%':', 목표 없음')+(streakText?'. '+streakText:'');
  return {state,headline,hint,minutes,targetMinutes:target,percent,added,before,beforePercent,met:!!target&&minutes>=target,streakText,summary};
}
const api={compute,text,duration,recent,streak,moment};
if(typeof window!=='object'||!window.VZ||typeof document==='undefined')return api;
const V=window.VZ;
/** Daily time target chosen at signup (account metadata) or later in settings; 30 minutes when neither exists. */
V.dailyTargetMinutes=()=>V.db.settings?.dailyTargetMinutes??window.vzipCloudUserDailyTarget?.()??30;
const options=date=>({date,today:V.today(),defaultDailyTargetMinutes:V.dailyTargetMinutes(),timeEntries:V.timeEntries(V.media?.cached?.()||[])});
V.todayPractice=(date=V.today())=>compute(V.db,options(date));
V.todayPracticeText=x=>text(x||V.todayPractice());
/* ---- Result popup -------------------------------------------------------------------------------------------
 * Shown after a goal (or a practice set) was saved: a ring that sweeps from where today stood before this record to
 * where it stands now, the percentage counting up with it, "+N분" flying into the total, the last seven days as bars
 * against the target line, and a short celebration the moment the target is crossed. Every number is today's real
 * value (VZ.todayPractice) or a real past day (the home week model); the motion only moves between before and after.
 * The final texts are in the DOM from the start; with prefers-reduced-motion the final state is shown at once. */
const R=50,C=2*Math.PI*R,SWEEP_AT=260,SWEEP=780,END=1100,PARTICLES=28;
const CONFETTI=['#7A32F5','#A65CFF','#DCC4FF','#7A32F5','#23855C','#A65CFF','#078994','#DCC4FF','#DE3E0A'];
const offset=part=>(C*(1-Math.max(0,Math.min(1,part)))).toFixed(2);
const still=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const buzz=pattern=>{try{if(typeof navigator.vibrate==='function')navigator.vibrate(pattern);}catch{}};
let open=null;
/** Closes with 계속, the ✕, a tap outside, Escape, or by itself after about six seconds unless it was touched, so it
 * never stands in the way of the next check. Returns the sheet handle ({close}). */
V.todayPracticePopup=({addedMinutes,title,onClose,duration:ms=6000}={})=>{
  open?.close();
  const x=V.todayPractice();
  let days=[],run=null;
  try{const o=options(V.today());days=recent(V.db,o);run=x.targetMinutes?streak(V.db,o):null;}catch(e){console.error(e);}
  const m=moment(x,addedMinutes,run),target=m.targetMinutes,heading=title||'완료했어요';
  for(const d of days)if(d.today){d.minutes=m.minutes;d.met=m.met;} // today's bar is the popup's own number
  const top=Math.max(target||0,...days.map(d=>d.minutes),1)*1.12,part=n=>n>0?Math.max(n/top,.07):0,slide=n=>'translateY('+((1-part(n))*100).toFixed(2)+'%)';
  const metDays=days.filter(d=>d.met).length;
  const chartLabel='최근 7일 연습 시간. '+days.map(d=>(d.today?'오늘':d.label+'요일')+' '+duration(d.minutes)+(d.met?' 목표 달성':'')).join(', ')+(target?'. 오늘 목표 '+duration(target):'');
  const ring='<div class="vz-tp-ring"'+(target?' role="progressbar" aria-label="오늘 목표 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,m.percent)+'" aria-valuetext="'+m.percent+'%"':'')+'>'+
    '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><linearGradient id="vz-tp-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A65CFF"/><stop offset="1" stop-color="#6D2BE5"/></linearGradient></defs>'+
    '<circle class="vz-tp-track" cx="60" cy="60" r="'+R+'"/>'+
    (target?'<circle class="vz-tp-arc" data-today-arc cx="60" cy="60" r="'+R+'" transform="rotate(-90 60 60)" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+offset(m.percent/100)+'"/>'+
      '<circle class="vz-tp-lap" data-today-lap cx="60" cy="60" r="'+R+'" transform="rotate(-90 60 60)" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+offset(m.percent/100-1)+'"/>':'')+'</svg>'+
    '<div class="vz-tp-center" aria-hidden="true">'+(target?'<strong data-today-percent>'+m.percent+'%</strong><span data-today-total>'+duration(m.minutes)+'</span><small>목표 '+duration(target)+'</small>':'<strong data-today-total>'+duration(m.minutes)+'</strong><small>오늘 연습</small>')+'</div>'+
    '<span class="vz-tp-badge" aria-hidden="true"><i class="ph ph-check"></i></span></div>';
  const chart=days.length?'<div class="vz-tp-chart" data-today-chart role="img" aria-label="'+V.esc(chartLabel)+'"><div class="vz-tp-chart-head" aria-hidden="true"><span>최근 7일</span>'+(target?'<span class="vz-tp-key"><i></i>목표 '+duration(target)+'</span>':'')+'</div>'+
    '<div class="vz-tp-bars" aria-hidden="true">'+(target?'<i class="vz-tp-line" data-today-line style="--at:'+(target/top).toFixed(4)+'"></i>':'')+
    days.map(d=>'<div class="vz-tp-day" data-date="'+d.date+'" data-minutes="'+d.minutes+'" data-met="'+d.met+'"'+(d.today?' data-today="true"':'')+'><span class="vz-tp-mark"><i class="ph ph-check"></i></span><span class="vz-tp-col"><i class="vz-tp-bar" style="transform:'+slide(d.minutes)+'"></i></span><span class="vz-tp-label">'+(d.today?'오늘':d.label)+'</span></div>').join('')+'</div></div>':'';
  let timer=0,frame=0,sweep=0,root=null,sheetEl=null;
  const sheet=V.sheet({title:heading,label:heading,variant:'alert',
    body:'<div class="vz-today-result" data-state="'+m.state+'" data-phase="done" data-reached="'+m.met+'" data-celebrated="0"'+(m.met?' data-met="true"':'')+'>'+
      '<p class="vz-sr-only" data-today-summary role="status" aria-live="polite">'+V.esc(m.summary)+'</p><p class="vz-sr-only" data-today-text aria-hidden="true">'+V.esc(text(x))+'</p>'+
      '<div class="vz-tp-stage">'+ring+'<button type="button" class="vz-tp-replay" data-today-replay aria-label="달성률 움직임 다시 보기"></button>'+
      (m.added?'<span class="vz-tp-plus" data-today-plus aria-hidden="true">+'+duration(m.added)+'</span>':'')+'</div>'+
      '<p class="vz-tp-headline" data-today-headline>'+m.headline+'</p>'+(m.hint?'<p class="vz-tp-hint" data-today-hint>'+m.hint+'</p>':'')+
      (m.added||m.streakText?'<div class="vz-tp-chips">'+(m.added?'<p class="vz-today-added" data-today-added>이번 기록 +'+duration(m.added)+'</p>':'')+(m.streakText?'<p class="vz-tp-streak" data-today-streak><i class="ph ph-fire" aria-hidden="true"></i>'+m.streakText+'</p>':'')+'</div>':'')+
      chart+'</div>',
    foot:'<button type="button" class="btn block" data-ok>계속</button>',
    onMount:(el,close)=>{
      sheetEl=el;el.classList.add('vz-today-popup');el.tabIndex=-1; // a tap on the card keeps the focus inside, so Escape still closes it
      if(still()||!m.added||m.before>=m.minutes)el.classList.add('vz-today-quiet');root=el.querySelector('.vz-today-result');
      const x2=el.querySelector('.sheet-head [data-close]');
      if(x2){x2.setAttribute('aria-label','닫기');x2.innerHTML='<i class="ph ph-x" aria-hidden="true"></i>';}
      const burst=document.createElement('div');burst.className='vz-tp-burst';burst.setAttribute('aria-hidden','true');el.append(burst);
      el.parentNode.querySelector('[data-ok]').onclick=close;
      const arc=root.querySelector('[data-today-arc]'),lap=root.querySelector('[data-today-lap]'),percent=root.querySelector('[data-today-percent]'),total=root.querySelector('[data-today-total]');
      const today=root.querySelector('.vz-tp-day[data-today]'),bar=today?.querySelector('.vz-tp-bar'),plus=root.querySelector('[data-today-plus]');
      /** Everything that follows the minutes shown: ring, numbers, today's bar and the reached marks. */
      const paint=shown=>{
        const last=shown>=m.minutes,value=last?m.minutes:shown,p=target?value/target:0,reached=!!target&&value>=target;
        if(arc){arc.setAttribute('stroke-dashoffset',offset(p));arc.style.opacity=p>0?1:0;lap.setAttribute('stroke-dashoffset',offset(p-1));lap.style.opacity=p>1?1:0;}
        if(percent)percent.textContent=(last?m.percent:Math.round(p*100))+'%';
        if(total)total.textContent=duration(value);
        if(bar)bar.style.transform=slide(value);
        if(today)today.dataset.met=String(reached);
        root.dataset.reached=String(reached);
      };
      const clearBurst=()=>burst.replaceChildren();
      const celebrate=()=>{
        root.dataset.celebrated=String(Number(root.dataset.celebrated)+1);
        root.dataset.bounce='0';void root.offsetWidth;root.dataset.bounce='1';
        const box=el.getBoundingClientRect(),from=root.querySelector('.vz-tp-ring').getBoundingClientRect();
        burst.style.setProperty('--ox',(from.left+from.width/2-box.left).toFixed(1)+'px');burst.style.setProperty('--oy',(from.top+from.height/2-box.top+el.scrollTop).toFixed(1)+'px');
        clearBurst();
        for(let i=0;i<PARTICLES;i++){
          const dot=document.createElement('i'),angle=i*2.39996,far=78+(i%5)*15;
          dot.style.cssText='--x:'+(Math.cos(angle)*far).toFixed(1)+'px;--y:'+(Math.sin(angle)*far+26).toFixed(1)+'px;--r:'+((i%2?1:-1)*(160+i*37%200))+'deg;background:'+CONFETTI[i%CONFETTI.length]+';animation-delay:'+(i%4)*30+'ms;'+(i%3?'':'border-radius:50%;height:7px;');
          burst.append(dot);
        }
        burst.lastChild.addEventListener('animationend',clearBurst,{once:true});
        clearTimeout(sweep);sweep=setTimeout(clearBurst,1600);
        buzz([12,50,18]);
      };
      const finish=()=>{frame=0;paint(m.minutes);if(plus)plus.dataset.at='gone';root.dataset.phase='done';};
      /** One run of the motion, from the first frame's time. Nothing to move (no new minutes, or reduced motion) ends at once. */
      const play=()=>{
        cancelAnimationFrame(frame);frame=0;clearBurst();root.dataset.bounce='0';
        if(still()||!m.added||m.before>=m.minutes)return finish();
        let began=null,cheered=false;
        root.dataset.phase='run';paint(m.before);if(plus)plus.dataset.at='wait';
        const step=now=>{
          if(began==null)began=now;
          const t=now-began,k=Math.max(0,Math.min(1,(t-SWEEP_AT)/SWEEP)),shown=m.before+(m.minutes-m.before)*(1-Math.pow(1-k,3));
          if(plus)plus.dataset.at=t<60?'wait':t<480?'in':'gone';
          paint(k>=1?m.minutes:shown);
          if(m.state==='goal'&&!cheered&&shown>=target){cheered=true;celebrate();}
          if(t>=END){finish();if(!cheered)buzz(8);}else frame=requestAnimationFrame(step);
        };
        frame=requestAnimationFrame(step);
      };
      const replay=root.querySelector('[data-today-replay]');
      if(still())replay.hidden=true;
      replay.onclick=()=>{root.dataset.pop='0';void root.offsetWidth;root.dataset.pop='1';play();};
      // A touch means the user is looking at it: it then stays until they close it.
      for(const type of ['pointerdown','keydown'])el.addEventListener(type,()=>clearTimeout(timer));
      play();
      timer=setTimeout(close,ms);
    },
    onClose:()=>{clearTimeout(timer);clearTimeout(sweep);cancelAnimationFrame(frame);if(open===sheet)open=null;onClose?.();}});
  open=sheet;
  (sheetEl.querySelector('.sheet-head [data-close]')||sheetEl.parentNode.querySelector('[data-ok]'))?.focus({preventScroll:true});
  return sheet;
};
return api;
});
