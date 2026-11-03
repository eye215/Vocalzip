(() => {
  'use strict';
  const root=document.querySelector('#assignment-history'),card=root?.closest('.card');if(!card)return;
  const section=document.querySelector('#lessons'),controls=section.querySelector('.vzip-ia-segment');
  const all=controls.querySelector('button'),write=controls.querySelector('[data-ia-open]');
  all.textContent='전체';
  const taskTab=document.createElement('button');taskTab.type='button';taskTab.className='vzip-ia-action';taskTab.textContent='숙제';taskTab.dataset.homeworkTab='';all.after(taskTab);
  card.classList.add('vzip-homework-card');card.querySelector('h2').textContent='숙제';card.querySelector(':scope>p')?.remove();
  section.querySelector('#lessons-heading').textContent='레슨';
  const history=section.querySelector('.vzip-journal-history');
  const setMode=mode=>{for(const child of history.children)child.hidden=mode==='tasks'&&child!==card;taskTab.setAttribute('aria-pressed',String(mode==='tasks'));taskTab.classList.toggle('is-active',mode==='tasks');all.setAttribute('aria-pressed',String(mode==='all'));all.classList.toggle('is-active',mode==='all');};
  all.addEventListener('click',()=>setMode('all'));
  taskTab.onclick=()=>{all.click();setMode('tasks')};write.addEventListener('click',()=>{taskTab.classList.remove('is-active');taskTab.setAttribute('aria-pressed','false')});
  window.addEventListener('vzip:lesson-saved',()=>setMode('all'));setMode('all');
  const add=document.createElement('button');add.type='button';add.className='btn vzip-homework-add';add.textContent='＋ 숙제 추가';card.append(add);
  const editor=document.createElement('form');editor.className='vzip-homework-editor';editor.hidden=true;
  editor.innerHTML='<h3>숙제 추가</h3><label>숙제 내용<input name="title" required maxlength="300" placeholder="예: 립트릴로 패사지오 연결"></label><label>연습할 때 기억할 점<textarea name="note" maxlength="3000" rows="3" placeholder="목에 힘을 주지 않고 연결하기"></textarea></label><p role="status"></p><div class="buttons"><button type="button" class="btn secondary" data-cancel>취소</button><button type="submit" class="btn">숙제 저장</button></div>';
  card.append(editor);let editingId='',previousFocus;
  const close=()=>{editor.hidden=true;add.hidden=false;editingId='';if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});else add.focus({preventScroll:true})};
  function open(task){previousFocus=document.activeElement;editingId=task?.id||'';editor.querySelector('h3').textContent=task?'숙제 수정':'숙제 추가';editor.elements.title.value=task?.title||'';editor.elements.note.value=task?.note||'';editor.querySelector('[role=status]').textContent='';editor.hidden=false;add.hidden=true;editor.elements.title.focus();}
  add.onclick=()=>open();editor.querySelector('[data-cancel]').onclick=close;
  editor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close()}});
  editor.onsubmit=event=>{event.preventDefault();const result=window.vzipSaveHomework({id:editingId,title:editor.elements.title.value,note:editor.elements.note.value});if(!result.ok){editor.querySelector('[role=status]').textContent=result.error;return}close();};
  root.addEventListener('click',event=>{const status=event.target.closest('[data-status]');if(status){const id=status.dataset.id;queueMicrotask(()=>{const next=[...root.querySelectorAll('[data-status]')].find(button=>button.dataset.id===id);const completed=next?.closest('.vzip-homework-completed');(completed&&!completed.open?completed.querySelector('summary'):next)?.focus({preventScroll:true})})}const button=event.target.closest('[data-edit-task]');if(!button)return;let data;try{data=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}')}catch{return}const task=data.assignments?.find(task=>task.id===button.dataset.editTask);if(task)open(task)});
  let completedOpen=false;
  function group(){
    const rows=[...root.querySelectorAll(':scope>.vzip-task-item')];if(!rows.length&&root.querySelector('.vzip-homework-active'))return;
    const active=document.createElement('div');active.className='vzip-homework-active';
    const done=document.createElement('details');done.className='vzip-homework-completed';done.open=completedOpen;
    done.addEventListener('toggle',()=>{completedOpen=done.open});
    const activeCount=rows.filter(row=>row.dataset.taskDone!=='true').length;
    const heading=document.createElement('h3');heading.textContent='진행 중인 숙제 '+activeCount;active.append(heading);
    const summary=document.createElement('summary');summary.textContent='완료된 숙제 '+(rows.length-activeCount);done.append(summary);
    for(const row of rows)(row.dataset.taskDone==='true'?done:active).append(row);
    if(!activeCount){const empty=document.createElement('p');empty.className='muted';empty.textContent='진행 중인 숙제가 없어요.';active.append(empty)}
    root.replaceChildren(active,done);
  }
  window.addEventListener('vzip:data-changed',group);group();
})();
