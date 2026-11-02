/* One recorder shared between lesson and practice, without duplicate IDs. */
(()=>{'use strict';
const $=s=>document.querySelector(s),rec=$('#vzip-recorder'),lesson=$('#lessons'),practice=$('#practice');if(!rec||!lesson||!practice)return;
const lessonSlot=$('#vzip-lesson-recorder-slot'),practiceForm=$('#practice-form');
if(!lessonSlot||!practiceForm)return;
const practiceHost=document.createElement('div');practiceHost.id='vzip-practice-recorder-slot';practiceForm.after(practiceHost);
const oldLibrary=rec.querySelector('#vzip-library')?.closest('.item');const oldImport=rec.querySelector('.vzip-import-box');if(oldImport)oldImport.hidden=true;if(oldLibrary)oldLibrary.hidden=true;
const move=tab=>{const target=tab==='lessons'?lessonSlot:practiceHost;if(rec.parentElement!==target)target.append(rec);rec.hidden=false;rec.querySelector('h2').textContent=tab==='lessons'?'🎙️ 레슨 녹음 · 녹화':'🎙️ 연습 녹음 · 녹화'};
const isRecording=()=>!!rec.querySelector('#vzip-stop:not(:disabled)');
function switchTab(tab){if(isRecording()&&rec.parentElement!==(tab==='lessons'?lessonSlot:practiceHost)){/* Do not move a live recording mid-session. */return}if(tab==='lessons'||tab==='practice')move(tab)}
document.querySelectorAll('.nav button[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
document.querySelectorAll('[data-go-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.goTab)));
window.addEventListener('vzip:media-saved',()=>{const text=rec.querySelector('#vzip-status');if(text)text.textContent='✓ 저장 완료! 보관함에서 녹음·영상을 확인할 수 있어요.'});
move('practice');
})();