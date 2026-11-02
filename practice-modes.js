/* VOCAL.zip practice UX v5 — clear warm-up/training vs song-practice flows, mobile-first. */
(()=>{'use strict';
const form=document.querySelector('#practice-form');if(!form)return;
const $=s=>form.querySelector(s),date=$('[name=date]'),minutes=$('[name=minutes]'),song=$('[name=song]'),rating=$('[name=rating]'),memo=$('[name=memo]'),category=$('[name=category]'),detail=$('[name=detail]');
const css=document.createElement('style');css.textContent=`
#practice-form .vzip-practice-switch{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:18px 0 20px}
#practice-form .vzip-practice-switch button{min-height:54px;padding:12px 8px;border-radius:15px;border:1px solid #ffffff35;background:#ffffff0d;color:#e9e2ff;font-weight:750;font-size:14px}
#practice-form .vzip-practice-switch button[aria-pressed=true]{background:linear-gradient(120deg,#9674e8,#7059ce);border-color:#c3a9ff;color:#fff}
#practice-form .vzip-practice-panel{border:1px solid #ffffff30;border-radius:18px;padding:16px;margin:14px 0;background:rgba(255,255,255,.035)}
#practice-form .vzip-practice-panel h3{font-size:17px;margin:0 0 7px}
#practice-form .vzip-practice-panel>p{font-size:12px;line-height:1.6;color:#c7c0dc;margin:0 0 14px}
#practice-form .vzip-training-row{display:grid;grid-template-columns:minmax(0,1fr) 78px 38px;gap:7px;align-items:center;margin:9px 0}
#practice-form .vzip-training-row select,#practice-form .vzip-training-row input{min-width:0;width:100%;margin:0;min-height:47px;padding:9px;font-size:14px}
#practice-form .vzip-training-row button{min-height:43px;border:1px solid #ffffff35;border-radius:10px;background:#ffffff12;color:white}
#practice-form .vzip-add-row{width:100%;min-height:47px;border:1px dashed #ffffff55;border-radius:12px;background:#ffffff0d;color:#eee8ff;margin-top:7px}
#practice-form .vzip-training-total,#practice-form .vzip-practice-hint{padding:13px;border-radius:12px;background:rgba(135,115,213,.15);margin-top:13px;color:#e4dcff;font-size:13px;line-height:1.5}
#practice-form .vzip-field{margin:15px 0}
#practice-form .vzip-field label{display:block;margin:0 0 7px}
#practice-form .vzip-field textarea{width:100%;min-height:82px}
#practice-form .vzip-practice-song-fields[hidden],#practice-form .vzip-training-panel[hidden]{display:none!important}
#practice-form .vzip-manual-time{display:block}
#practice-form .vzip-manual-time[hidden]{display:none!important}
#practice-form #practice-time-summary{margin-top:12px}
@media(max-width:420px){#practice-form .vzip-training-row{grid-template-columns:minmax(0,1fr) 70px 36px;gap:6px}#practice-form .vzip-training-row select,#practice-form .vzip-training-row input{font-size:13px}}
`;document.head.append(css);
const originalLabels=[...form.querySelectorAll('label')];const labelFor=el=>originalLabels.find(l=>l.htmlFor===el.id)||el.previousElementSibling;
const songLabel=labelFor(song),dateLabel=labelFor(date),minutesLabel=labelFor(minutes),catLabel=labelFor(category),ratingLabel=labelFor(rating),memoLabel=labelFor(memo);
const dateWrap=date.parentElement.closest('.two')||date.parentElement;
const switcher=document.createElement('div');switcher.className='vzip-practice-switch';switcher.innerHTML='<button type="button" data-mode="training" aria-pressed="true">🎼 보컬 트레이닝</button><button type="button" data-mode="song" aria-pressed="false">🎵 곡 연습</button>';
const training=document.createElement('section');training.className='vzip-practice-panel vzip-training-panel';training.innerHTML='<h3>🎼 보컬 트레이닝</h3><p>목풀기부터 호흡·발성 기초까지, 오늘 진행한 항목과 시간을 각각 기록해요.</p><div class="vzip-training-rows"></div><button type="button" class="vzip-add-row">＋ 트레이닝 항목 추가</button><div class="vzip-training-total" aria-live="polite">트레이닝 총 0분</div>';
const songPanel=document.createElement('section');songPanel.className='vzip-practice-panel vzip-practice-song-fields';songPanel.hidden=true;songPanel.innerHTML='<h3>🎵 곡 연습</h3><p>곡과 집중해서 연습한 구간, 표현·기술적인 과제를 기록해요.</p><div class="vzip-field vzip-song-select"></div><div class="vzip-field"><label>집중 연습한 구간</label><input class="vzip-song-section" type="text" placeholder="예: 2절 후렴, 고음 진입 전 4마디"></div><div class="vzip-field"><label>오늘의 연습 목표</label><textarea class="vzip-song-goal" placeholder="예: 고음에서 힘을 빼고 모음 연결하기"></textarea></div><div class="vzip-field"><label>연습 결과·다음에 보완할 점</label><textarea class="vzip-song-result" placeholder="어떤 점이 나아졌고, 무엇이 아직 어려웠나요?"></textarea></div>';
const rows=training.querySelector('.vzip-training-rows'),total=training.querySelector('.vzip-training-total');
const catalog=[['워밍업','립트릴','허밍','스트로우 발성','가벼운 스케일','하품·하품 한숨'],['호흡·지지','복식호흡','호흡 유지','호흡 압력 조절','프레이즈 호흡'],['발성·공명','공명','성구 전환(패사지오)','저음 강화','음정·피치','비브라토','발음·딕션']];
function addRow(name='',mins=''){const row=document.createElement('div');row.className='vzip-training-row';const sel=document.createElement('select');sel.setAttribute('aria-label','보컬 트레이닝 항목');sel.innerHTML='<option value="">항목 선택</option>'+catalog.flatMap(([g,...items])=>items.map(n=>'<option value="'+n.replace(/&/g,'&amp;')+'">'+g+' · '+n+'</option>')).join('');if(name&&!catalog.some(g=>g.slice(1).includes(name)))sel.add(new Option('직접 입력 · '+name,name));sel.value=name;const min=document.createElement('input');min.type='number';min.min='0';min.max='600';min.step='0.5';min.inputMode='decimal';min.placeholder='분';min.setAttribute('aria-label','항목별 연습 시간(분)');min.value=mins;const del=document.createElement('button');del.type='button';del.textContent='×';del.setAttribute('aria-label','항목 삭제');del.onclick=()=>{row.remove();calc()};sel.onchange=calc;min.oninput=calc;row.append(sel,min,del);rows.append(row);calc()}
function calc(){const n=[...rows.querySelectorAll('input')].reduce((a,x)=>a+(Number(x.value)||0),0);total.textContent='보컬 트레이닝 합계 · '+n+'분';minutes.value=String(n);minutes.dispatchEvent(new Event('input',{bubbles:true}))}
function moveLabelAndControl(label,control,parent){if(label&&label.parentElement!==parent)parent.append(label);if(control&&control.parentElement!==parent)parent.append(control)}
const songSlot=songPanel.querySelector('.vzip-song-select');moveLabelAndControl(songLabel,song,songSlot);
const timeWrap=document.createElement('div');timeWrap.className='vzip-field vzip-manual-time';timeWrap.append(minutesLabel,minutes);
const intro=form.querySelector('.form-intro');if(intro){intro.insertAdjacentElement('afterend',dateWrap);dateWrap.insertAdjacentElement('afterend',switcher);switcher.after(training,songPanel,timeWrap)}else{form.prepend(dateWrap,switcher,training,songPanel,timeWrap)}
if(dateLabel&&dateLabel.parentElement!==dateWrap)dateWrap.prepend(dateLabel);
if(minutesLabel)minutesLabel.textContent='직접 연습한 시간 (분)';
if(catLabel)catLabel.hidden=true;category?.closest('.two')?.setAttribute('hidden','');form.querySelector('.inline-category-tools')?.setAttribute('hidden','');
const oldSongContainer=songLabel?.parentElement;if(oldSongContainer&&oldSongContainer!==songSlot&&oldSongContainer!==songPanel)oldSongContainer.hidden=true;
const manualSongHint=document.createElement('p');manualSongHint.className='vzip-practice-hint';manualSongHint.textContent='곡 연습에 실제 사용한 시간만 입력하세요. 녹음·영상 길이는 보관함에서 선택하면 별도로 합산할 수 있어요.';timeWrap.append(manualSongHint);
const mediaLabel=originalLabels.find(l=>l.textContent.includes('녹음·영상 첨부'));const mediaInput=form.querySelector('#practice-attachments');const mediaPreview=form.querySelector('#media-preview');if(mediaLabel){mediaLabel.textContent='파일 길이 미리보기 (선택)';mediaLabel.insertAdjacentHTML('afterend','<p class="muted">실제 녹음은 아래 연습 녹음·녹화 기능을 이용하세요. 이 파일 선택은 길이 확인용이며 원본을 연습 기록에 복사하지 않아요.</p>')}
const memoBox=document.createElement('div');memoBox.className='vzip-field';memoBox.innerHTML='<label>연습 메모 · 오늘 느낀 점</label>';memoBox.append(memo);if(memoLabel)memoLabel.remove();const ratingBox=document.createElement('div');ratingBox.className='vzip-field';ratingBox.append(ratingLabel,rating);if(ratingLabel)ratingLabel.textContent='오늘의 만족도 (1~5)';
const homework=form.querySelector('#homework-checks')?.parentElement;const saveButton=form.querySelector('button[type=submit],button:not([type])');if(homework)homework.before(ratingBox,memoBox);else form.append(ratingBox,memoBox);
let mode='training';function setMode(next){mode=next;switcher.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));training.hidden=mode!=='training';songPanel.hidden=mode!=='song';timeWrap.hidden=mode==='training';minutes.readOnly=mode==='training';if(mode==='training'){song.value='';calc()}else{minutes.value='0';minutes.dispatchEvent(new Event('input',{bubbles:true}))}}
switcher.addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(b)setMode(b.dataset.mode)});
training.querySelector('.vzip-add-row').onclick=()=>addRow();
addRow('립트릴','5');addRow('허밍','5');
form.addEventListener('submit',()=>{const notes=[];if(mode==='training'){const items=[...rows.querySelectorAll('.vzip-training-row')].map(r=>({name:r.querySelector('select').value,minutes:Number(r.querySelector('input').value)||0})).filter(x=>x.name&&x.minutes>0);form.dataset.vzipPracticeMode='training';form.dataset.vzipTechnique=JSON.stringify(items);if(items.length)notes.push('보컬 트레이닝: '+items.map(x=>x.name+' '+x.minutes+'분').join(' · '))}else{form.dataset.vzipPracticeMode='song';form.dataset.vzipTechnique='[]';const section=songPanel.querySelector('.vzip-song-section').value.trim(),goal=songPanel.querySelector('.vzip-song-goal').value.trim(),result=songPanel.querySelector('.vzip-song-result').value.trim();if(section)notes.push('집중 구간: '+section);if(goal)notes.push('연습 목표: '+goal);if(result)notes.push('연습 결과: '+result)}if(notes.length)memo.value=[notes.join('\n'),memo.value].filter(Boolean).join('\n\n')},true);
form.addEventListener('reset',()=>setTimeout(()=>{rows.replaceChildren();addRow('립트릴','5');addRow('허밍','5');songPanel.querySelectorAll('input,textarea').forEach(x=>x.value='');setMode('training')},0));
setMode('training');
})();