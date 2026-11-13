/* 오늘 연습 세트 — the small timer on other screens. While today's set is in its steps (running or paused) and the
 * singer is anywhere but #/practice-set, a pill above the bottom nav shows step i/N, the step's short name and the same
 * countdown as the set screen, with a pause/resume button; tapping the pill goes back to the set.
 * State and the clock live in app/practice-set.js (V.practiceSetClock); this file only draws. Placement, hiding under
 * sheets and the reduced form on the recorder (a chip in the header: step and time, no pause button, so the
 * recorder's own controls stay clear) are in app/practice-set.css (.pset-mini). */
(()=>{
'use strict';
const V=window.VZ,C=V?.practiceSetClock;
if(!C||typeof document==='undefined')return;
let el=null,shown='';
function build(){
  el=document.createElement('div');
  el.className='pset-mini';el.hidden=true;el.dataset.psetMini='';
  el.setAttribute('role','group');el.setAttribute('aria-label','연습 세트 타이머');
  el.innerHTML='<a class="pset-mini-body" href="#/practice-set" data-open><i class="pset-mini-icon ph ph-timer" data-icon aria-hidden="true"></i><span class="pset-mini-step" data-step></span><span class="pset-mini-name" data-name></span>'+
    '<strong class="pset-mini-time" data-time></strong><span class="pset-mini-sr"> 연습 세트로 돌아가기</span></a>'+
    '<button type="button" class="pset-mini-toggle" data-toggle><i class="ph-fill ph-pause" aria-hidden="true"></i></button>';
  el.querySelector('[data-toggle]').addEventListener('click',()=>{C.toggle();paint();});
  document.body.append(el);
}
const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
function paint(){
  const body=document.body,route=body.dataset.vzRoute||'';
  // Not on the set's own screen, not before the first screen is drawn, never on (or behind) the login screen.
  const blocked=!route||route==='practice-set'||body.classList.contains('vzip-auth-locked')||!!document.getElementById('vzip-boot-cover');
  const s=blocked?null:C.state();
  if(!s){if(el&&!el.hidden){el.hidden=true;shown='';}return;}
  if(!el)build();
  const mode=s.away?'away':s.running?'run':'pause',key=[s.id,s.index,mode].join(':');
  if(key!==shown){
    shown=key;
    el.dataset.state=mode;
    text(el.querySelector('[data-step]'),s.away?'':(s.index+1)+'/'+s.total);
    text(el.querySelector('[data-name]'),s.away?'오래 자리를 비웠어요':s.title);
    const toggle=el.querySelector('[data-toggle]');
    toggle.hidden=s.away;
    toggle.setAttribute('aria-label',s.running?'연습 세트 일시정지':'연습 세트 계속');
    toggle.firstElementChild.className='ph-fill ph-'+(s.running?'pause':'play');
    el.querySelector('[data-icon]').className='pset-mini-icon ph ph-'+(s.running?'timer':s.away?'clock-countdown':'pause');
  }
  text(el.querySelector('[data-time]'),s.away?'확인':s.text);
  el.classList.toggle('is-over',!s.away&&s.left<0);
  el.hidden=false;
}
C.watch(paint);
window.addEventListener('hashchange',paint);
window.addEventListener('vzip:auth-changed',()=>setTimeout(paint,0));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint();});
// The router writes the screen's name on <body>; the login gate toggles a class there.
new MutationObserver(paint).observe(document.body,{attributes:true,attributeFilter:['data-vz-route','class']});
paint();
})();
