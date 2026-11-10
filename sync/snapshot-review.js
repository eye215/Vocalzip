/* Recovery uses the approved full-page task component; opens only after an explicit action. */
(()=>{'use strict';
window.VzipSnapshotReview={open({review,resolve,retry,onClose=()=>{}}){
 const VZ=window.VZ,Model=window.VzipSnapshotReviewModel;if(!VZ?.sheet||!Model)throw Error('기록 비교 화면을 불러오지 못했어요.');
 let alive=true,saving=false,view=null,model=null,choices={},shown=20,stale=false,retryable=false;
 const api=VZ.sheet({title:'저장할 기록 확인',variant:'page',body:'<div class="snapshot-review" data-snapshot-review><p role="status" data-review-message>기기와 클라우드 기록을 확인하고 있어요…</p><div data-review-content></div></div>',
  foot:'<div class="snapshot-review-actions"><label class="snapshot-review-approve"><input type="checkbox" data-review-approve>선택한 내용으로 합쳐 저장할게요</label><button type="button" class="btn" data-review-save disabled>확인한 내용 저장</button><button type="button" class="btn secondary" data-review-refresh hidden>다시 비교</button><button type="button" class="btn secondary" data-review-retry hidden>저장 결과 확인</button></div>',
  onClose:()=>{alive=false;window.removeEventListener('vzip:auth-changed',authChanged);window.removeEventListener('vzip:data-changed',changed);onClose();}});
 const el=api.el,content=el.querySelector('[data-review-content]'),message=el.querySelector('[data-review-message]');
 const save=el.querySelector('[data-review-save]'),approve=el.querySelector('[data-review-approve]'),refresh=el.querySelector('[data-review-refresh]'),again=el.querySelector('[data-review-retry]');
 el.classList.add('snapshot-review-page');
 const esc=VZ.esc,notice=text=>{if(alive)message.textContent=text;};
 function update(){
  const count=model?model.conflicts.filter(c=>Object.hasOwn(choices,c.id)).length:0;
  save.disabled=saving||stale||!model||!approve.checked||count!==model.conflicts.length;
  approve.disabled=saving||stale||!model;refresh.disabled=saving;again.disabled=saving;
  el.querySelector('[data-close]').disabled=saving;
  save.textContent=saving?'저장 결과 확인 중…':'확인한 내용 저장';
  const status=el.querySelector('[data-review-progress]');if(status)status.textContent='다른 내용 '+(model?.conflicts.length||0)+'개 중 '+count+'개 선택';
 }
 function draw(){
  if(!alive)return;
  content.innerHTML='<p class="muted">한쪽에만 있는 기록은 함께 보존해요. 서로 다른 내용만 골라 주세요. 선택 전에는 기록을 바꾸지 않아요.</p><p data-review-progress role="status"></p><div data-review-conflicts></div><button type="button" class="btn secondary" data-review-more hidden>다음 항목 보기</button>';
  const list=content.querySelector('[data-review-conflicts]');
  for(const c of model.conflicts.slice(0,shown)){
   const block=document.createElement('fieldset');block.className='snapshot-review-item';
   block.innerHTML='<legend>'+esc(c.record)+'</legend><p>'+esc(c.field)+'</p>'+c.options.map(o=>'<label class="snapshot-review-option"><input type="radio" name="snapshot-choice-'+esc(c.id)+'" value="'+esc(o.id)+'" data-conflict="'+esc(c.id)+'"'+(choices[c.id]===o.id?' checked':'')+'><span><small>'+esc(o.sources.join(' · '))+'</small><span>'+esc(Model.format(o.value,view.device))+'</span></span></label>').join('');
   list.append(block);
  }
  if(!model.conflicts.length)list.innerHTML='<p>서로 다른 내용이 없어요. 보존한 기록을 함께 저장할 수 있어요.</p>';
  const more=content.querySelector('[data-review-more]');more.hidden=shown>=model.conflicts.length;more.onclick=()=>{shown+=20;draw();};
  content.querySelectorAll('[data-conflict]').forEach(input=>{input.onchange=()=>{choices[input.dataset.conflict]=input.value;update();};});update();
 }
 async function load(){
  stale=true;model=null;choices={};approve.checked=false;refresh.hidden=true;again.hidden=true;retryable=false;update();
  notice('기기와 클라우드 기록을 확인하고 있어요…');
  try{const next=await review();if(!alive)return;view=next;model=Model.plan(view);shown=20;stale=false;notice('저장할 내용을 선택해 주세요.');draw();}
  catch(e){if(!alive)return;notice(e.message);refresh.hidden=false;update();}
 }
 function failed(e){
  saving=false;stale=true;approve.checked=false;retryable=['network','response','auth'].includes(e.code);
  notice(e.message+' 현재 기록과 미완료 저장은 유지돼요.');refresh.hidden=false;again.hidden=!retryable||typeof retry!=='function';update();
 }
 async function submit(recheck=false){
  if(saving||!alive||!recheck&&save.disabled)return;
  saving=true;notice('확인한 내용을 저장하고 있어요…');update();
  try{
   if(recheck)await retry();else await resolve(view.reviewId,model.candidate(choices),{confirmed:true});
   if(alive){api.close();VZ.toast('확인한 기록을 저장했어요.');}
  }catch(e){if(alive)failed(e);}
 }
 save.onclick=()=>submit();approve.onchange=update;refresh.onclick=load;again.onclick=()=>submit(true);
 function authChanged(){api.close();}
 function changed(){if(!alive||saving)return;stale=true;approve.checked=false;notice('확인 중 기록이 바뀌었어요. 다시 비교해 주세요.');refresh.hidden=false;update();}
 window.addEventListener('vzip:auth-changed',authChanged);window.addEventListener('vzip:data-changed',changed);
 // A submitted request is durable; prevent a misleading cancel toast while its ACK is pending.
 el.parentNode.addEventListener('click',e=>{if(saving&&(e.target===el.parentNode||e.target.closest('[data-close]'))){e.preventDefault();e.stopImmediatePropagation();}},true);
 el.parentNode.addEventListener('keydown',e=>{if(saving&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}},true);
 void load();return api;
}};
})();
