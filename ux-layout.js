/* VOCAL.zip v2.6 — purpose-first iPhone layout */
(()=>{'use strict';
const $=s=>document.querySelector(s);
const nav=$('.nav'),settings=$('#vzip-open-settings');
const go=tab=>{const btn=nav?.querySelector('button[data-tab="'+tab+'"]');if(!btn)return;btn.click();window.scrollTo({top:0,behavior:'instant'});document.body.dataset.vzipPage=tab;};
settings?.addEventListener('click',()=>go('manage'));
nav?.querySelectorAll('button[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.body.dataset.vzipPage=b.dataset.tab;window.scrollTo(0,0)}));
document.body.dataset.vzipPage='home';
const archive=$('#archive');if(archive){
const cards=[...archive.querySelectorAll(':scope > .card')];
const oldComparison=cards.find(c=>c.querySelector('#archive-a'));if(oldComparison){const details=document.createElement('details');details.className='vzip-legacy-compare';details.innerHTML='<summary>기존 두 녹음 직접 비교 열기</summary>';oldComparison.before(details);details.append(oldComparison)}
const heading=document.createElement('div');heading.className='vzip-section-heading';heading.innerHTML='<span class="vzip-eyebrow">YOUR PROGRESS</span><h2>📈 성장 리포트</h2><p>녹음을 비교하고, 변화 기록을 확인해요.</p><button type="button" class="btn" id="vzip-growth-compare">＋ 새 비교 시작</button>';archive.prepend(heading);
$('#vzip-growth-compare').onclick=()=>{go('media');const hub=$('#vzip-media-hub');hub?.scrollIntoView({behavior:'smooth',block:'start'});const note=$('#vzip-hub-status');if(note)note.textContent='비교할 녹음 하나를 누르면 두 번째 녹음을 선택할 수 있어요.'};
}
const media=$('#media');if(media){const heading=media.querySelector('#vzip-media-page-head');if(heading)heading.classList.add('vzip-compact-intro')}
const manage=$('#manage');if(manage){const head=document.createElement('div');head.className='vzip-section-heading';head.innerHTML='<span class="vzip-eyebrow">ACCOUNT & PREFERENCES</span><h2>⚙️ 설정</h2><p>계정과 연습 항목을 관리해요.</p>';manage.prepend(head);
const cloud=$('#vzip-cloud-root');if(cloud){const details=document.createElement('details');details.className='vzip-settings-fold';details.open=false;const summary=document.createElement('summary');summary.innerHTML='☁️ 클라우드 동기화 상세 설정 <span>⌄</span>';cloud.before(details);details.append(summary,cloud)}
}
const top=$('.top');if(top){top.setAttribute('role','banner')}
})();