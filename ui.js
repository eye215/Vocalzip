/* VOCAL.zip — Glass Studio UI interactions */
(()=>{
'use strict';
document.querySelectorAll('[data-go-tab]').forEach(button=>{
  button.addEventListener('click',()=>{
    const tab=button.getAttribute('data-go-tab');
    const navButton=document.querySelector('.nav button[data-tab="'+tab+'"]');
    if(!navButton)return;
    navButton.click();
    window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
});
const nav=document.querySelector('.nav');
if(nav){
  nav.setAttribute('aria-label','VOCAL.zip 주요 메뉴');
  nav.querySelectorAll('button[data-tab]').forEach(button=>{
    button.setAttribute('aria-controls',button.dataset.tab);
    button.setAttribute('aria-pressed',String(button.classList.contains('active')));
    button.addEventListener('click',()=>{
      nav.querySelectorAll('button[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    });
  });
}
})();