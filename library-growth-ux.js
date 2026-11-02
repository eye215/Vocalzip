/* v3.3 — clear library / growth UX for iPhone */
(()=>{'use strict';
const $=s=>document.querySelector(s),media=$('#media'),growth=$('#archive');if(!media||!growth)return;
const style=document.createElement('style');style.textContent=`
#media .vzip-page-head,#archive .vzip-page-head{margin-bottom:8px}
#vzip-media-hub>.muted{display:none}
#vzip-media-hub{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
#vzip-media-hub>h2{display:none}
#vzip-media-hub>.vzip-hub-buttons{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;margin:0 0 14px}
#vzip-media-hub>.vzip-hub-buttons label{background:#9572e0;color:#fff;border-radius:15px;min-height:54px;font-weight:750}
#vzip-media-hub>.vzip-hub-buttons button{min-width:50px!important;min-height:52px;border-radius:15px}
#vzip-media-hub .vzip-hub-filters{margin:10px 0 15px}
#vzip-hub-status{font-size:12px;line-height:1.6;padding:0 2px;margin:8px 0}
#vzip-hub-list .vzip-hub-item{background:#ffffff0d;border:1px solid #ffffff22;border-radius:17px;padding:16px;margin:10px 0}
#vzip-hub-list .vzip-hub-item .vzip-hub-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
#vzip-hub-list .vzip-hub-item .smallbtn{padding:10px 4px;font-size:12px;border-radius:11px}
#vzip-hub-list .vzip-hub-item:focus-visible{outline:2px solid #c3a4ff}
.vzip-library-help{padding:11px 13px;margin:0 0 15px;background:#ffffff0a;border:1px solid #ffffff1d;border-radius:13px;color:#c9c4dd;font-size:12px;line-height:1.55}
.vzip-library-count{font-size:13px;font-weight:750;margin:16px 2px 8px;color:#eee4ff}
.vzip-growth-entry{background:linear-gradient(140deg,#3b315c,#29233e);border:1px solid #a183da55;border-radius:19px;padding:20px;margin:8px 0 16px}
.vzip-growth-entry h3{margin:0 0 7px;font-size:19px}.vzip-growth-entry p{font-size:13px;color:#c7bddb;line-height:1.55;margin:0 0 16px}
.vzip-growth-entry button{display:block;width:100%;min-height:51px;border-radius:13px;margin:8px 0;background:#9a75e6;border:0;color:#fff;font-weight:750;font-size:14px}
.vzip-growth-entry button.secondary{background:#ffffff15;border:1px solid #ffffff2a}
#vzip-ia-growth-main>.vzip-growth-actions{display:none}
#vzip-ia-growth-main>.card{margin:12px 0}
#vzip-compare-modal .vzip-sheet{max-height:90dvh;max-height:90svh}
#vzip-compare-modal .vzip-choices{max-height:40dvh;overscroll-behavior:contain}
@media(max-width:390px){#vzip-hub-list .vzip-hub-item .smallbtn{font-size:11px}#vzip-media-hub>.vzip-hub-buttons label{font-size:13px}}
`;document.head.append(style);
const hub=$('#vzip-media-hub'),list=$('#vzip-hub-list');
if(hub){const note=document.createElement('p');note.className='vzip-library-help';note.textContent='파일을 올리면 바로 아래 목록에 나타나요. 재생·정보 수정·삭제는 파일별로, 비교는 파일 카드를 눌러 시작해요.';hub.querySelector('.vzip-hub-filters')?.after(note);const count=document.createElement('div');count.className='vzip-library-count';list?.before(count);const update=()=>{const rows=list?.querySelectorAll('.vzip-hub-item')||[];count.textContent='내 녹음·영상 · '+rows.length+'개';};new MutationObserver(update).observe(list,{childList:true});update()}
const main=$('#vzip-ia-growth-main');if(main){const entry=document.createElement('div');entry.className='vzip-growth-entry';entry.innerHTML='<h3>🎧 목소리 비교하기</h3><p>보관함에서 녹음 2개를 고르면 날짜별로 듣고 비교 메모를 남길 수 있어요.</p><button type="button" id="vzip-growth-start">＋ 새 비교 시작</button><button type="button" class="secondary" id="vzip-growth-saved">📊 저장된 비교 리포트 보기</button>';main.prepend(entry);$('#vzip-growth-start').onclick=()=>{document.querySelector('.nav button[data-tab="media"]')?.click();const note=$('#vzip-hub-status');if(note)note.textContent='비교할 첫 번째 파일 카드를 눌러주세요.'};$('#vzip-growth-saved').onclick=()=>window.vzipOpenReports?.()}
const tabs=document.querySelectorAll('.nav button[data-tab]');tabs.forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab==='media')setTimeout(()=>hub?.querySelector('#vzip-hub-upload')?.removeAttribute('disabled'),0)}));
})();