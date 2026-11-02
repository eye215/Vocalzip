/* VOCAL.zip v3 — real information architecture; existing forms/data untouched. */
(()=>{'use strict';
const $=s=>document.querySelector(s), nav=$('.nav');
const sections={home:$('#home'),lessons:$('#lessons'),practice:$('#practice'),media:$('#media'),archive:$('#archive'),manage:$('#manage')};
let route='home';
const head=(eyebrow,title,desc)=>{const el=document.createElement('div');el.className='vzip-page-head';el.innerHTML='<div class="vzip-page-eyebrow">'+eyebrow+'</div><h2>'+title+'</h2><p>'+desc+'</p>';return el};
const action=(label,fn,kind='primary')=>{const b=document.createElement('button');b.type='button';b.className='vzip-ia-action '+kind;b.textContent=label;b.addEventListener('click',fn);return b};
const panel=(title,subtitle)=>{const d=document.createElement('div');d.className='vzip-ia-panel';d.innerHTML='<h3>'+title+'</h3><p>'+subtitle+'</p>';return d};
const showTab=tab=>{nav?.querySelector('button[data-tab="'+tab+'"]')?.click();route=tab;document.body.dataset.vzipPage=tab;window.scrollTo(0,0)};
function go(tab,sub){showTab(tab);if(sub){const btn=sections[tab]?.querySelector('[data-ia-open="'+sub+'"]');btn?.click()}}
const home=sections.home;const homeCards=[...home.querySelectorAll(':scope > .card')];const backup=homeCards.find(x=>x.querySelector('#export'));if(backup){backup.classList.add('vzip-settings-backup');sections.manage.append(backup)}
home.prepend(head('TODAY · VOCAL.zip','오늘의 보컬','오늘은 어떤 목소리를 남길까요?'));
const shortcuts=document.createElement('div');shortcuts.className='vzip-shortcuts';shortcuts.append(action('🎤 연습 기록',()=>go('practice','new')),action('📖 레슨 기록',()=>go('lessons','new')),action('🎵 녹음 올리기',()=>go('media'),'secondary'),action('📈 성장 확인',()=>go('archive'),'secondary'));home.querySelector('.vzip-page-head').after(shortcuts);
const hero=home.querySelector('.hero');if(hero)hero.classList.add('vzip-home-hero');
const manage=sections.manage;
manage.prepend(head('SETTINGS','설정','계정, 곡, 연습 항목과 백업을 관리해요.'));
const settingsCards=[...manage.querySelectorAll(':scope > .card')];const config=[
{key:'account',label:'👤 계정 · 클라우드',desc:'로그인 상태, 동기화 및 녹음 백업',find:el=>!!el.querySelector('#vzip-cloud-root')||el.id==='vzip-cloud-root'},
{key:'songs',label:'🎼 연습곡 관리',desc:'곡 추가 및 목록 관리',find:el=>!!el.querySelector('#song-form')},
{key:'categories',label:'🎯 연습 항목 관리',desc:'발성 · 세부 연습 항목 수정',find:el=>!!el.querySelector('#manage-category')},
{key:'backup',label:'📦 데이터 백업',desc:'기록 내보내기 · 복원',find:el=>!!el.querySelector('#export')}];
const settingsMenu=document.createElement('div');settingsMenu.className='vzip-ia-menu';manage.querySelector('.vzip-page-head').after(settingsMenu);
const settingsDetail=document.createElement('div');settingsDetail.className='vzip-ia-detail';settingsMenu.after(settingsDetail);
function settingsOpen(key){settingsMenu.hidden=true;settingsDetail.hidden=false;settingsDetail.replaceChildren();settingsDetail.append(action('← 설정 목록',settingsList,'back'));const cfg=config.find(c=>c.key===key);if(!cfg)return;settingsDetail.append(head('SETTINGS',cfg.label,cfg.desc));const match=[...manage.querySelectorAll(':scope > .card'),...manage.querySelectorAll('.vzip-settings-fold')].find(x=>cfg.find(x)||!!x.querySelector(cfg.key==='account'?'#vzip-cloud-root':cfg.key==='songs'?'#song-form':cfg.key==='categories'?'#manage-category':'#export'));if(match){if(match.tagName==='DETAILS')match.open=true;settingsDetail.append(match)}else{const original=settingsCards.find(cfg.find);if(original)settingsDetail.append(original)}window.scrollTo(0,0)}
function settingsList(){settingsDetail.hidden=true;settingsMenu.hidden=false;window.scrollTo(0,0)}
for(const cfg of config){const b=document.createElement('button');b.type='button';b.className='vzip-ia-menu-row';b.innerHTML='<span><strong>'+cfg.label+'</strong><small>'+cfg.desc+'</small></span><b>›</b>';b.dataset.iaOpen=cfg.key;b.onclick=()=>settingsOpen(cfg.key);settingsMenu.append(b)}settingsList();
const topSettings=$('#vzip-open-settings');topSettings?.addEventListener('click',()=>{showTab('manage');settingsList()});
nav?.querySelector('button[data-tab="manage"]')?.addEventListener('click',settingsList);
for(const tab of ['lessons','practice']){const section=sections[tab];section.prepend(head(tab==='lessons'?'LESSON JOURNAL':'PRACTICE JOURNAL',tab==='lessons'?'레슨':'연습',tab==='lessons'?'배운 내용과 숙제를 한곳에서 관리해요.':'연습 시간과 달라진 점을 기록해요.'));const formCard=section.querySelector(':scope > .card');const history=[...section.querySelectorAll(':scope > .card')].filter(x=>x!==formCard);const controls=document.createElement('div');controls.className='vzip-ia-segment';controls.append(action('기록 보기',()=>toggle(false),'segment'),action(tab==='lessons'?'＋ 레슨 작성':'＋ 연습 작성',()=>toggle(true),'segment'));section.querySelector('.vzip-page-head').after(controls);function toggle(edit){formCard.hidden=!edit;history.forEach(x=>x.hidden=edit);[...controls.children].forEach((b,i)=>b.classList.toggle('is-active',i===(edit?1:0)));window.scrollTo(0,0)}toggle(false);controls.children[1].dataset.iaOpen='new';section.querySelector('form')?.addEventListener('submit',()=>setTimeout(()=>toggle(false),250))}
const media=sections.media;media.prepend(head('YOUR LIBRARY','보관함','녹음·영상 업로드, 재생, 개별 관리. 파일을 누르면 비교를 시작해요.'));const oldMediaIntro=$('#vzip-media-page-head');if(oldMediaIntro)oldMediaIntro.remove();
const archive=sections.archive;archive.prepend(head('GROWTH','성장','목소리의 변화를 비교하고 기록으로 남겨요.'));
const oldCompare=archive.querySelector('.vzip-legacy-compare');if(oldCompare)oldCompare.hidden=true;
const saved=$('#vzip-saved-reports')?.closest('.card');const growthTimeline=archive.querySelector('#archive-timeline')?.closest('.card');const growthArchive=archive.querySelector('#archive-song')?.closest('.card');
const reportPage=document.createElement('div');reportPage.id='vzip-ia-reports';reportPage.hidden=true;archive.append(reportPage);if(saved)reportPage.append(saved);
const growthMain=document.createElement('div');growthMain.id='vzip-ia-growth-main';archive.querySelector('.vzip-page-head').after(growthMain);const growthActions=panel('나의 성장','녹음을 비교하거나 저장한 결과를 확인하세요.');growthActions.classList.add('vzip-growth-actions');growthActions.append(action('🎧 새 비교 시작',()=>go('media')),action('📊 저장된 리포트',()=>openReports(),'secondary'));growthMain.append(growthActions);if(growthArchive)growthMain.append(growthArchive);if(growthTimeline)growthMain.append(growthTimeline);
function openReports(){growthMain.hidden=true;reportPage.hidden=false;archive.querySelector('.vzip-page-head').hidden=true;if(!reportPage.querySelector('.vzip-report-back'))reportPage.prepend(action('← 성장으로',closeReports,'back'));window.scrollTo(0,0)}
function closeReports(){growthMain.hidden=false;reportPage.hidden=true;archive.querySelector('.vzip-page-head').hidden=false;window.scrollTo(0,0)}
window.vzipOpenReports=openReports;
const cloudRoot=$('#vzip-cloud-root');if(cloudRoot){const oldFold=cloudRoot.closest('.vzip-settings-fold');if(oldFold){oldFold.open=true;oldFold.querySelector('summary')?.remove()}}
nav?.querySelectorAll('button[data-tab]').forEach(b=>b.addEventListener('click',()=>{route=b.dataset.tab;document.body.dataset.vzipPage=route;if(route==='manage')settingsList();if(route==='archive')closeReports();window.scrollTo(0,0)}));
document.querySelectorAll('[data-go-tab]').forEach(b=>b.addEventListener('click',()=>{const tab=b.dataset.goTab;if(tab==='lessons'||tab==='practice')setTimeout(()=>sections[tab]?.querySelector('[data-ia-open="new"]')?.click(),0)}));
document.body.dataset.vzipPage='home';
})();