/* Expanding-circle transition from a root tab's recording quick action. */
(()=>{
 'use strict';
 let busy=false;
 function open(source,target='#/record'){
  if(busy)return true;
  const go=()=>window.VZ?.nav?window.VZ.nav(target):location.hash=target;
  if(!source||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){go();return true;}
  const box=source.getBoundingClientRect(),size=Math.max(44,box.width,box.height);
  const x=box.left+box.width/2,y=box.top+box.height/2;
  const far=Math.max(Math.hypot(x,y),Math.hypot(innerWidth-x,y),Math.hypot(x,innerHeight-y),Math.hypot(innerWidth-x,innerHeight-y));
  const circle=document.createElement('div');circle.className='vz-record-expansion';circle.setAttribute('aria-hidden','true');
  circle.style.setProperty('--vz-record-x',x+'px');circle.style.setProperty('--vz-record-y',y+'px');
  circle.style.setProperty('--vz-record-size',size+'px');circle.style.setProperty('--vz-record-scale',String((far*2+32)/size));
  document.body.append(circle);busy=true;
  requestAnimationFrame(()=>requestAnimationFrame(()=>circle.classList.add('is-expanded')));
  setTimeout(()=>{
   go();
   requestAnimationFrame(()=>requestAnimationFrame(()=>circle.classList.add('is-revealing')));
   setTimeout(()=>{circle.remove();busy=false;},230);
  },470);
  return true;
 }
 window.VzipRecordTransition={open};
})();
