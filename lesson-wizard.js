/* VOCAL.zip v0.8: four-step lesson entry, progressive disclosure */
(()=>{'use strict';
const form=document.querySelector('#lesson-form');if(!form)return;
const children=[...form.children];
const byName=name=>form.querySelector('[name="'+name+'"]');
const date=byName('date'),song=byName('song'),category=byName('category'),feedback=byName('feedback'),memo=byName('memo'),homework=byName('homework');
const tools=form.querySelector('[data-inline-tools]'),carry=form.querySelector('#carryover-panel'),save=children.find(x=>x.tagName==='BUTTON'&&x.type!=='button');
if(!date||!song||!category||!feedback||!memo||!homework||!tools||!carry||!save)return;
const steps=[
 {title:'기본 정보',hint:'언제, 어떤 곡을 배웠나요?',nodes:children.slice(0,children.indexOf(category.parentElement))},
 {title:'레슨 내용',hint:'오늘 배운 핵심과 선생님의 피드백을 남겨요.',nodes:children.slice(children.indexOf(category.parentElement),children.indexOf(carry))},
 {title:'숙제 · 녹음',hint:'다음 연습으로 이어갈 숙제를 정리해요.',nodes:children.slice(children.indexOf(carry),children.indexOf(save))},
 {title:'최종 확인',hint:'입력한 내용을 확인하고 기록을 저장해요.',nodes:[]}
];
/* First stage ends before the category label, not after it. */
const categoryLabel=children[children.indexOf(category.parentElement)-1];
if(categoryLabel?.tagName==='LABEL'){steps[0].nodes=children.slice(0,children.indexOf(categoryLabel));steps[1].nodes=children.slice(children.indexOf(categoryLabel),children.indexOf(carry))}
const wrapper=document.createElement('div');wrapper.className='lesson-wizard';
const progress=document.createElement('div');progress.className='wizard-progress';progress.setAttribute('aria-label','레슨 기록 진행 단계');
const panels=steps.map((step,i)=>{const p=document.createElement('section');p.className='wizard-panel';p.dataset.step=i;p.setAttribute('aria-label',step.title);const head=document.createElement('div');head.className='wizard-heading';head.innerHTML='<span class="wizard-count">STEP '+(i+1)+' / 4</span><h3>'+step.title+'</h3><p>'+step.hint+'</p>';p.append(head);step.nodes.forEach(n=>p.append(n));return p});
const foot=document.createElement('div');foot.className='wizard-actions';const prev=document.createElement('button');prev.type='button';prev.className='btn secondary';prev.textContent='← 이전';const next=document.createElement('button');next.type='button';next.className='btn';next.textContent='다음 단계 →';foot.append(prev,next);const summary=document.createElement('div');summary.className='wizard-summary';panels[3].append(summary,save);form.append(progress,wrapper,foot);panels.forEach(p=>wrapper.append(p));
const recorder=document.createElement('div');recorder.className='wizard-record-note';recorder.innerHTML='<b>🎙️ 녹음·영상도 남기고 싶나요?</b><p>직접 녹음은 현재 ‘개인 연습’에서 이용할 수 있어요. 레슨 기록 저장 후 녹음해 주세요. 레슨에 녹음을 직접 첨부하는 기능은 준비 중이에요.</p>';panels[2].append(recorder);
let index=0;
const txt=el=>el?.selectedOptions?.[0]?.textContent||'선택 안 함';
function renderSummary(){const selected=[...carry.querySelectorAll('input:checked')].map(x=>x.closest('label')?.innerText.trim()||'숙제');const lines=homework.value.split('\n').map(s=>s.trim()).filter(Boolean);summary.replaceChildren();const rows=[['레슨 날짜',date.value||'미입력'],['레슨곡',txt(song)],['연습 항목',txt(category)+' / '+txt(byName('detail'))],['선생님 피드백',feedback.value||'미입력'],['레슨 메모',memo.value||'미입력'],['이어갈 숙제',selected.join(', ')||'없음'],['새 숙제',lines.join(', ')||'없음']];rows.forEach(([label,value])=>{const row=document.createElement('div');row.className='wizard-summary-row';const k=document.createElement('span');k.textContent=label;const v=document.createElement('strong');v.textContent=value;row.append(k,v);summary.append(row)})}
function show(i){index=Math.min(3,Math.max(0,i));panels.forEach((p,n)=>{p.hidden=n!==index;p.classList.toggle('current',n===index)});progress.replaceChildren();steps.forEach((step,n)=>{const b=document.createElement('button');b.type='button';b.className='wizard-progress-item'+(n===index?' active':'')+(n<index?' done':'');b.textContent=(n+1)+'. '+step.title;b.disabled=n>index;b.onclick=()=>show(n);progress.append(b)});prev.hidden=index===0;next.hidden=index===3;save.hidden=index!==3;if(index===3)renderSummary();const heading=panels[index].querySelector('h3');heading?.scrollIntoView({block:'nearest',behavior:'smooth'})}
prev.onclick=()=>show(index-1);next.onclick=()=>{if(index===0&&!date.value){date.reportValidity();return}show(index+1)};
form.addEventListener('submit',e=>{if(index!==3){e.preventDefault();e.stopImmediatePropagation();show(3);return}setTimeout(()=>show(0),0)},true);
show(0);
})();