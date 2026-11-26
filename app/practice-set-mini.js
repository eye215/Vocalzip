/* 오늘의 연습 — the small timer on other screens. While one of the person's own steps of today's set is in hand
 * (running or paused; a built-in exercise is never timed away from its screen) and the
 * singer is anywhere but #/practice-set, a pill above the bottom nav shows step i/N, the step's short name and the same
 * countdown as the set screen, with a pause/resume button; tapping the pill goes back to the set.
 * State and the clock live in app/practice-set.js (V.practiceSetClock); this file only draws. Placement, hiding under
 * sheets and the reduced form on the recorder (a chip in the header: step and time, no pause button, so the
 * recorder's own controls stay clear) are in app/practice-set.css (.pset-mini).
 * 타이머만 켜기 (app/free-timer.js, V.freeTimer) uses the same pill on every screen: "연습 중 · mm:ss · 멈추기". 멈추기
 * saves at once, with no question (on 오늘 the card says what was saved; elsewhere a short toast does). */
(()=>{
'use strict';
const V=window.VZ,C=V?.practiceSetClock,F=V?.freeTimer;
if(!C||typeof document==='undefined')return;
let el=null,shown='';
function build(){
  el=document.createElement('div');
  el.className='pset-mini';el.hidden=true;el.dataset.psetMini='';
  el.setAttribute('role','group');el.setAttribute('aria-label','오늘의 연습 타이머');
  el.innerHTML='<a class="pset-mini-body" href="#/practice-set" data-open><i class="pset-mini-icon ph ph-timer" data-icon aria-hidden="true"></i><span class="pset-mini-step" data-step></span><span class="pset-mini-name" data-name></span>'+
    '<strong class="pset-mini-time" data-time></strong><span class="pset-mini-sr"> 오늘의 연습으로 돌아가기</span></a>'+
    '<button type="button" class="pset-mini-toggle" data-toggle><i class="ph-fill ph-pause" aria-hidden="true"></i></button>'+
    '<button type="button" class="pset-mini-toggle pset-mini-stop" data-free-stop hidden>멈추기</button>';
  el.querySelector('[data-toggle]').addEventListener('click',()=>{C.toggle();paint();});
  // 타이머만 켜기's 멈추기: saved at once; on 오늘 the card says it, elsewhere a short toast.
  el.querySelector('[data-free-stop]').addEventListener('click',()=>{
    let r=null;try{r=F?.stop();}catch(e){V.toast(e.message,'error');return;}
    if(r&&(document.body.dataset.vzRoute||'')!=='home')V.toast(r.saved?'연습 '+V.minutes(r.minutes)+'을 기록했어요.':'1분이 안 돼서 기록하지 않았어요.');
    paint();
  });
  document.body.append(el);
}
const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
function paint(){
  const body=document.body,route=body.dataset.vzRoute||'';
  // Not on the set's own screen, not before the first screen is drawn, never on (or behind) the login screen.
  const locked=!route||body.classList.contains('vzip-auth-locked')||!!document.getElementById('vzip-boot-cover');
  const blocked=locked||route==='practice-set';
  const s=blocked?null:C.state();
  // The free timer shows on every screen (오늘's card shows it too).
  const f=!s&&!locked?F?.state?.():null;
  if(!s&&!f){if(el&&!el.hidden){el.hidden=true;shown='';}return;}
  if(!el)build();
  if(f)return paintFree(f);
  const mode=s.away?'away':s.running?'run':'pause',key=[s.id,s.index,mode].join(':');
  if(key!==shown){
    shown=key;
    el.dataset.state=mode;
    text(el.querySelector('[data-step]'),s.away?'':(s.index+1)+'/'+s.total);
    text(el.querySelector('[data-name]'),s.away?'오래 자리를 비웠어요':s.title);
    const toggle=el.querySelector('[data-toggle]');
    toggle.hidden=s.away;
    toggle.setAttribute('aria-label',s.running?'오늘의 연습 일시정지':'오늘의 연습 계속');
    toggle.firstElementChild.className='ph-fill ph-'+(s.running?'pause':'play');
    el.querySelector('[data-icon]').className='pset-mini-icon ph ph-'+(s.running?'timer':s.away?'clock-countdown':'pause');
  }
  el.querySelector('[data-free-stop]').hidden=true;el.querySelector('[data-open]').setAttribute('href','#/practice-set');
  el.setAttribute('aria-label','오늘의 연습 타이머');text(el.querySelector('.pset-mini-sr'),' 오늘의 연습으로 돌아가기');
  text(el.querySelector('[data-time]'),s.away?'확인':s.text);
  el.classList.toggle('is-over',!s.away&&s.left<0);
  el.hidden=false;
}
/** 타이머만 켜기: "연습 중 · mm:ss · 멈추기"; after a long gap "오래 자리를 비웠어요 · 확인" (the card on 오늘 asks how to count it). */
function paintFree(f){
  const mode=f.away?'away':'free',key='free:'+mode;
  if(key!==shown){
    shown=key;el.dataset.state=mode;
    text(el.querySelector('[data-step]'),'');
    text(el.querySelector('[data-name]'),f.away?'오래 자리를 비웠어요':'연습 중');
    el.querySelector('[data-toggle]').hidden=true;
    el.querySelector('[data-free-stop]').hidden=f.away;
    el.querySelector('[data-open]').setAttribute('href','#/home');
    el.querySelector('[data-icon]').className='pset-mini-icon ph ph-'+(f.away?'clock-countdown':'timer');
    el.setAttribute('aria-label','연습 타이머');text(el.querySelector('.pset-mini-sr'),' 오늘 연습으로 가기');
  }
  text(el.querySelector('[data-time]'),f.away?'확인':f.text);
  el.classList.remove('is-over');
  el.hidden=false;
}
C.watch(paint);
F?.watch?.(paint);
window.addEventListener('hashchange',paint);
window.addEventListener('vzip:auth-changed',()=>setTimeout(paint,0));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint();});
// The router writes the screen's name on <body>; the login gate toggles a class there.
new MutationObserver(paint).observe(document.body,{attributes:true,attributeFilter:['data-vz-route','class']});
paint();
})();
