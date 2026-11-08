(()=>{
'use strict';
const V=window.VZ,E=V.esc;
V.route('home',{title:'홈',render:()=>'<div id="vocalzip-refined-preview"><div class="vz-phone">'+window.__APPROVED_HOME_CONTENT__+'</div></div>',mount(main){
 const assign=(selector,run)=>main.querySelectorAll(selector).forEach(el=>{el.onclick=run;if(el.tagName!=='BUTTON'&&el.tagName!=='A'){el.setAttribute('role','button');el.tabIndex=0;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run();}};}});
 assign('.vz-event',()=>V.nav('#/lesson/l1'));main.querySelectorAll('.vz-event-row').forEach((el,i)=>el.onclick=()=>i?V.nav('#/performances'):V.nav('#/show/pf1'));
 assign('.vz-week .vz-title',()=>V.nav('#/growth'));assign('.vz-song .vz-play',()=>V.practiceSheet({songId:'s1'}));main.querySelectorAll('.vz-shortcut').forEach((el,i)=>el.onclick=()=>i?V.practiceSheet():V.nav('#/lessons'));assign('.vz-goal-tools button',()=>V.nav('#/homework'));
 const checks=[...main.querySelectorAll('.vz-goal-list input')];checks.forEach(el=>el.onchange=()=>main.querySelector('.vz-count').textContent=checks.filter(c=>c.checked).length+' / 3 완료');
}});
const originalRender=V.render;let lastPreviewHash='#/home',recordReturn='#/home';
V.render=()=>{
 const name=(location.hash.slice(2).split(/[/?]/)[0]||'home');if(name==='record'&&!lastPreviewHash.startsWith('#/record'))recordReturn=lastPreviewHash;lastPreviewHash=location.hash||'#/home';document.body.dataset.page=name;
 originalRender();
 const top=document.getElementById('top');
 if(name==='home'){top.innerHTML='<div class="v-top-left"><h1 class="preview-logo"><i class="ph ph-waveform"></i>Vocalzip</h1></div><div class="v-top-actions"><button class="icon-btn" data-preview-alert aria-label="알림"><i class="ph ph-bell"></i></button><a class="icon-btn" href="#/settings" aria-label="설정"><i class="ph ph-user-circle"></i></a></div>';}
 if(name==='record'){const back=top.querySelector('[data-back]');if(back){back.setAttribute('aria-label','닫기');back.removeAttribute('data-back');back.setAttribute('data-preview-close','');back.innerHTML='<i class="ph ph-x"></i>';}const note=document.createElement('p');note.className='preview-note';note.textContent='녹음 흐름 확인용 · 실제 마이크를 사용하지 않는 시안이에요.';document.getElementById('view').prepend(note);}
 if(name==='settings'){const box=document.querySelector('[data-cloud]');if(box)box.innerHTML='<div class="row"><span class="avatar"><i class="ph ph-user-circle"></i></span><div><strong>유리님</strong><div class="small muted">예시 데이터 · 계정 및 서버 미연결</div></div></div>';}
 const params=(location.hash.slice(2).split('?')[0]).split('/');document.getElementById('preview-fab').href='#/record'+(name==='song'?'?song='+encodeURIComponent(params[1]||''):'');
 document.querySelector('.v-nav').hidden=name==='record';document.getElementById('preview-fab').hidden=name==='record';
};
document.addEventListener('click',e=>{if(e.target.closest('[data-preview-close]')){e.preventDefault();e.stopImmediatePropagation();V.nav(recordReturn);return;}if(e.target.closest('[data-preview-alert]'))V.toast('현재 개발본에는 알림 목록 화면이 등록되어 있지 않아요.');const a=e.target.closest('a[href]');if(a){const href=a.getAttribute('href');if(href.startsWith('billing/')||/^https?:/.test(href)){e.preventDefault();e.stopImmediatePropagation();V.toast('시안에서는 외부 페이지로 이동하지 않아요.');}}},true);
if(!location.hash)history.replaceState(null,'',location.pathname+location.search+'#/home');
V.render();
})();
