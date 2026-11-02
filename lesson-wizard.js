/* VOCAL.zip v0.8: four-step lesson entry, progressive disclosure */
(()=>{'use strict';
const form=document.querySelector('#lesson-form');if(!form)return;
const children=[...form.children];
const byName=name=>form.querySelector('[name="'+name+'"]');
const date=byName('date'),song=byName('song'),category=byName('category'),feedback=byName('feedback'),memo=byName('memo'),homework=byName('homework');
const tools=form.querySelector('[data-inline-tools]'),carry=form.querySelector('#carryover-panel'),save=children.find(x=>x.tagName==='BUTTON'&&x.type!=='button');
if(!date||!song||!category||!feedback||!memo||!homework||!tools||!carry||!save)return;
const todayBtn=document.querySelector('#lesson-today');if(todayBtn)todayBtn.onclick=()=>{date.value=new Date().toLocaleDateString('sv-SE');date.dispatchEvent(new Event('change',{bubbles:true}))};
const steps=[
 {title:'기본 정보',hint:'언제, 어떤 곡을 배웠나요?',nodes:children.slice(0,children.indexOf(category.parentElement))},
 {title:'녹음',hint:'레슨 중 여러 번 녹음하고, 이름은 나중에 수정해요.',nodes:[]},
 {title:'레슨 기록 · 숙제',hint:'녹음별 메모, 레슨 내용과 숙제를 정리해요.',nodes:children.slice(children.indexOf(category.parentElement),children.indexOf(save))},
 {title:'최종 확인',hint:'입력한 내용을 확인하고 기록을 저장해요.',nodes:[]}
];
/* First stage ends before the category label, not after it. */
const categoryLabel=children[children.indexOf(category.parentElement)-1];
if(categoryLabel?.tagName==='LABEL'){steps[0].nodes=children.slice(0,children.indexOf(categoryLabel));steps[2].nodes=children.slice(children.indexOf(categoryLabel),children.indexOf(save))}
const wrapper=document.createElement('div');wrapper.className='lesson-wizard';
const progress=document.createElement('div');progress.className='wizard-progress';progress.setAttribute('aria-label','레슨 기록 진행 단계');
const panels=steps.map((step,i)=>{const p=document.createElement('div');p.className='wizard-panel';p.dataset.step=i;p.setAttribute('aria-label',step.title);const head=document.createElement('div');head.className='wizard-heading';head.innerHTML='<span class="wizard-count">STEP '+(i+1)+' / 4</span><h3>'+step.title+'</h3><p>'+step.hint+'</p>';p.append(head);step.nodes.forEach(n=>p.append(n));return p});
const foot=document.createElement('div');foot.className='wizard-actions';const prev=document.createElement('button');prev.type='button';prev.className='btn secondary';prev.textContent='← 이전';const next=document.createElement('button');next.type='button';next.className='btn';next.textContent='다음 단계 →';foot.append(prev,next);const summary=document.createElement('div');summary.className='wizard-summary';panels[3].append(summary,save);form.append(progress,wrapper,foot);panels.forEach(p=>wrapper.append(p));
const recorder=document.createElement('div');recorder.className='wizard-record-note';recorder.innerHTML='<b>🎙️ 레슨 녹음·녹화</b><p>이 단계에서 여러 번 녹음하고 종료하면 각각 자동 저장돼요. 녹음 파일은 보관함에서도 확인할 수 있어요.</p><div id="vzip-lesson-recorder-slot"></div>';panels[1].append(recorder);
let index=0;
const draftKey='vocalzip_lesson_draft_v1';
const draftBar=document.createElement('div');draftBar.className='wizard-draft-bar';draftBar.setAttribute('role','status');
const draftText=document.createElement('span');draftText.textContent='작성 내용은 자동 임시 저장돼요';
const clearDraft=document.createElement('button');clearDraft.type='button';clearDraft.className='wizard-clear';clearDraft.textContent='초기화';
draftBar.append(draftText,clearDraft);form.insertBefore(draftBar,progress);
let draftTimer;
function snapshot(){return{date:date.value,song:song.value,category:category.value,detail:byName('detail')?.value||'',feedback:feedback.value,memo:memo.value,homework:homework.value,carry:[...carry.querySelectorAll('input:checked')].map(x=>x.value),step:index}}
function writeDraft(){try{sessionStorage.setItem(draftKey,JSON.stringify(snapshot()));draftText.textContent='✓ 임시 저장됨'}catch{draftText.textContent='임시 저장을 사용할 수 없어요'}}
function queueDraft(){draftText.textContent='저장 중…';clearTimeout(draftTimer);draftTimer=setTimeout(writeDraft,450)}
function restoreDraft(){try{const data=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(!data)return false;
date.value=data.date||date.value;
for(const [el,val] of [[song,data.song],[category,data.category]])if(val&&[...el.options].some(o=>o.value===val))el.value=val;
category.dispatchEvent(new Event('change'));
const detail=byName('detail');if(data.detail&&detail&&[...detail.options].some(o=>o.value===data.detail))detail.value=data.detail;
feedback.value=data.feedback||'';memo.value=data.memo||'';homework.value=data.homework||'';
carry.querySelectorAll('input[type=checkbox]').forEach(el=>el.checked=(data.carry||[]).includes(el.value));
draftText.textContent='✓ 작성하던 내용을 복원했어요';return Math.min(3,Math.max(0,data.step||0));
}catch{return false}}
form.addEventListener('input',queueDraft);
form.addEventListener('change',queueDraft);
clearDraft.onclick=()=>{if(!confirm('작성 중인 레슨 내용을 초기화할까요?'))return;sessionStorage.removeItem(draftKey);clearTimeout(draftTimer);form.reset();date.value=new Date().toLocaleDateString('sv-SE');draftText.textContent='작성 내용은 자동 임시 저장돼요';show(0)};

const txt=el=>el?.selectedOptions?.[0]?.textContent||'선택 안 함';
function renderSummary(){const selected=[...carry.querySelectorAll('input:checked')].map(x=>x.closest('label')?.innerText.trim()||'숙제');const lines=homework.value.split('\n').map(s=>s.trim()).filter(Boolean);summary.replaceChildren();const rows=[['레슨 날짜',date.value||'미입력'],['레슨곡',txt(song)],['연습 항목',txt(category)+' / '+txt(byName('detail'))],['선생님 피드백',feedback.value||'미입력'],['레슨 메모',memo.value||'미입력'],['이어갈 숙제',selected.join(', ')||'없음'],['새 숙제',lines.join(', ')||'없음']];rows.forEach(([label,value])=>{const row=document.createElement('div');row.className='wizard-summary-row';const k=document.createElement('span');k.textContent=label;const v=document.createElement('strong');v.textContent=value;row.append(k,v);summary.append(row)})}
function show(i){index=Math.min(3,Math.max(0,i));panels.forEach((p,n)=>{p.hidden=n!==index;p.classList.toggle('current',n===index)});progress.replaceChildren();steps.forEach((step,n)=>{const b=document.createElement('button');b.type='button';b.className='wizard-progress-item'+(n===index?' active':'')+(n<index?' done':'');b.textContent=(n+1)+'. '+step.title;b.disabled=n>index;b.onclick=()=>show(n);progress.append(b)});prev.hidden=index===0;next.hidden=index===3;save.hidden=index!==3;if(index===3)renderSummary();progress.setAttribute('aria-label','레슨 기록 '+(index+1)+'단계 / 4단계')}
prev.onclick=()=>{show(index-1);queueDraft()};
next.onclick=()=>{if(index===0&&!date.value){date.reportValidity();return}show(index+1);queueDraft()};
const editButtons=document.createElement('div');editButtons.className='wizard-review-edit';
[['기본 정보 수정',0],['녹음 확인',1],['레슨 내용·숙제 수정',2]].forEach(([label,n])=>{const button=document.createElement('button');button.type='button';button.className='smallbtn';button.textContent='✎ '+label;button.onclick=()=>{show(n);queueDraft()};editButtons.append(button)});
panels[3].insertBefore(editButtons,summary);
form.addEventListener('submit',e=>{if(index!==3){e.preventDefault();e.stopImmediatePropagation();show(3);return}},true);
window.addEventListener('vzip:lesson-saved',()=>{clearTimeout(draftTimer);sessionStorage.removeItem(draftKey);draftText.textContent='작성 내용은 자동 임시 저장돼요';show(0)});
const restored=restoreDraft();show(restored===false?0:restored);
})();