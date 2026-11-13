(()=>{
'use strict';const V=window.VZ,M=window.VzipLessonAI;if(!V||!M)return;const esc=V.esc;
V.route('lesson-ai',{title:'레슨 숙제 후보',back:true,tab:'calendar',noAutoRefresh:true,
 render:()=>'<section class="card" data-lesson-ai><h2>피드백에서 다음 숙제 찾기</h2><p>선생님 피드백·곡별 메모와 기존 숙제 내용을 AI 서버에 보내 후보 한 가지를 정리해요. 선생님 숙제는 자동 수정하지 않아요.</p><button class="btn secondary" data-request>AI 숙제 후보 받기</button><p role="status" data-status></p><div data-candidate></div></section>',
 mount(host,r){const box=host.querySelector('[data-lesson-ai]'),out=box.querySelector('[data-candidate]'),status=box.querySelector('[data-status]'),button=box.querySelector('[data-request]'),lessonId=r.params[0];let evidence;
 try{evidence=M.context(V.db,lessonId);}catch(e){status.textContent=e.message;button.disabled=true;return;}
 if(!evidence.feedback.trim()&&!Object.values(evidence.songFeedback).some(v=>String(v).trim())){status.textContent='먼저 레슨 피드백을 작성해 주세요.';button.disabled=true;return;}
 const snapshot=JSON.stringify(evidence);
 button.onclick=async()=>{button.disabled=true;status.textContent='숙제 후보를 정리하고 있어요…';try{const result=await window.vzipCloudCoach({mode:'text',task:'레슨 피드백에서 숙제 후보 한 가지 추출',summary:'선생님 피드백에 명시된 연습만 다음 시도로 정리. 지시를 변경하거나 새 기법을 창작하지 말 것. 기존 숙제는 수정 금지. 원문에 구간이나 횟수가 없으면 만들지 말 것.',answers:[JSON.stringify(evidence)]});if(!box.isConnected)return;const title=M.candidate(result);
 out.innerHTML='<p class="small muted">AI가 정리한 후보예요. 원문을 확인하고 선택해 주세요.</p><details><summary>선생님 피드백 원문</summary><p style="white-space:pre-wrap">'+esc(evidence.feedback)+'<br>'+esc(Object.values(evidence.songFeedback).join('\n'))+'</p></details><form><label class="field"><span>숙제 후보</span><textarea name="title" maxlength="500" required>'+esc(title)+'</textarea></label>'+V.songSelect('song','',{label:'연결 곡'})+'<label class="field"><span>기존 숙제와 연결</span><select name="existing"><option value="">후보를 새 숙제로 추가</option>'+(V.db.assignments||[]).filter(t=>t.status!=='done').map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+'</option>').join('')+'</select></label><p class="small muted">기존 숙제를 고르면 원문 그대로 오늘 목표에 연결해요. 새 후보를 저장하면 AI 후보에서 추가한 숙제로 표시해요.</p><button class="btn" type="submit">확인하고 오늘 목표에 연결</button></form>';
 out.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.target;if(!f.reportValidity())return;let answer;try{const ok=V.change(db=>{answer=M.apply(db,{lessonId,snapshot,title:f.elements.title.value,existingId:f.elements.existing.value,songId:f.elements.song.value,date:V.today(),id:V.uid(),goalId:V.uid()});},{silent:true});if(ok){status.textContent=answer.duplicate?'이미 오늘 목표에 연결되어 있어요.':answer.existing?'기존 숙제를 그대로 오늘 목표에 연결했어요.':'확인한 후보를 숙제와 오늘 목표에 추가했어요.';out.querySelector('[type=submit]').disabled=true;}}catch(err){status.textContent=err.message;}};status.textContent='후보를 확인해 주세요. 아직 숙제나 목표는 추가하지 않았어요.';
 }catch(e){if(box.isConnected)status.textContent=e.message||'후보를 가져오지 못했어요.';}finally{button.disabled=false;}};
 }
});
})();
