/* Monthly growth → editable, user-confirmed song practice plan.
 * Not an AI-localized timestamp: segments are entered by the singer. */
(()=>{
'use strict';
const V=window.VZ, M=V?.media;if(!V||!M)return;
const E=V.esc;
const pad=n=>String(n).padStart(2,'0');
const dayShift=(date,offset)=>{
 const [y,m,d]=date.split('-').map(Number),at=new Date(y,m-1,d,12);
 at.setDate(at.getDate()+offset);
 return at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate());
};
const fmt=seconds=>Math.floor(seconds/60)+':'+pad(seconds%60);
// Same names as the growth report (성장 리포트 v2). vibrato has no growth measure: kept for old and new plans, but its
// outcome is shown as 참고 and never judged (app/plan-outcome-model.js).
const options=[{key:'intonation',label:'음정 정확도'},{key:'stability',label:'음정 안정성'},
 {key:'phrase',label:'호흡 유지'},{key:'vibrato',label:'비브라토 규칙성 (참고)'}];
const reviewState={player:null,revoke:null,generation:0};
function stopReview(){
 reviewState.generation++;
 if(reviewState.player){reviewState.player.pause();reviewState.player.removeAttribute('src');reviewState.player.load();reviewState.player=null;}
 if(reviewState.revoke){reviewState.revoke();reviewState.revoke=null;}
}
window.addEventListener('hashchange',stopReview);
window.addEventListener('pagehide',stopReview);
window.VzipAccountScope?.beforeLeave(stopReview);
const plans=()=> (V.db.practicePlans||[]).filter(x=>x?.kind==='monthly-vocal'&&!x.archived);
function entries(plan){return (V.db.dailyGoals||[]).filter(g=>g.sourceId===plan.id).sort((a,b)=>a.date.localeCompare(b.date));}
function status(plan){
 const goals=entries(plan);
 const done=new Set(goals.filter(g=>g.completed===true).map(g=>g.date)).size;
 return {done,total:Number.isInteger(plan.days)&&plan.days>0?plan.days:goals.length};
}
function form(month,items,rows){
 // A new plan can be created before the first take of that song is recorded.
 const ids=[...new Set([...(V.db.songs||[]).map(x=>x.id),...items.map(m=>m.songId)].filter(Boolean))];
 const songList=ids.map(id=>V.song(id)).filter(Boolean);
 const prioritized=rows.filter(r=>r.c?.state==='worse').map(r=>r.d.id);
 return '<form data-plan-form class="growth-plan-form"><label class="field"><span>집중할 항목</span><select name="metric">'+
  options.map(o=>'<option value="'+o.key+'" '+(prioritized[0]===o.key?'selected':'')+'>'+o.label+'</option>').join('')+'</select></label>'+
  '<label class="field"><span>연습할 곡</span><select name="song" required><option value="">곡 선택</option>'+
  songList.map(x=>'<option value="'+E(x.id)+'">'+E(x.title)+'</option>').join('')+'</select></label>'+
  '<div class="growth-plan-grid"><label class="field"><span>구간 시작 (초)</span><input name="start" type="number" min="0" max="7200" value="0" required></label>'+
  '<label class="field"><span>구간 종료 (초)</span><input name="end" type="number" min="1" max="7200" value="30" required></label>'+
  '<label class="field"><span>하루 연습 (분)</span><input name="minutes" type="number" min="3" max="60" value="10" required></label>'+
  '<label class="field"><span>연습 일수</span><input name="days" type="number" min="1" max="14" value="5" required></label></div>'+
  '<div class="growth-weak-search"><h3>녹음에서 확인할 구간 찾기</h3><label class="field"><span>분석할 녹음</span><select data-weak-record><option value="">곡을 먼저 선택하세요</option></select></label>'+
  '<button type="button" class="btn ghost" data-find-weak>음높이 확인 구간 찾기</button>'+
  '<p class="small muted">기기에서 녹음을 다시 측정해 음높이가 가까운 반음에서 다소 벗어난 지속음을 검토 후보로 찾아요. 곡의 악보·정답 음정과 비교한 오답 판정은 아닙니다.</p>'+
  '<div data-weak-results aria-live="polite"></div><input type="hidden" name="sourceRecording" value=""></div>'+
  '<p class="small muted">확인된 후보를 눌러 구간을 채우거나, 직접 시작·종료 시간을 입력할 수 있어요. 계획은 등록 버튼을 누르기 전까지 저장되지 않아요.</p>'+
  '<button class="btn block" type="submit">이 계획을 오늘부터 등록</button><p class="small muted" data-plan-message role="status"></p></form>';
}
function compareSongTakes(plan,items){
 const model=window.VzipPlanOutcome;
 if(!model?.measurement||!V.planOutcomePreview)return '';
 // The exact measurement the saved outcome report uses (growth report v2 rules, 판정 보류 reasons included).
 try{
  return V.planOutcomePreview(plan,model.measurement(plan,items,M.dateOf,x=>[1,2].includes(x.analysis?.v)&&V.analysisReliable?.(x.analysis)));
 }catch{return '<p class="small muted">저장된 계획의 날짜나 측정 기준을 확인해 주세요.</p>';}
}

function card(plan,items){
 const {done,total}=status(plan),name=V.songTitle(plan.songId)||'삭제된 곡';
 const last=entries(plan).at(-1)?.date||plan.startDate;
 return '<article class="growth-plan-item"><div class="row between"><strong>'+E(name)+'</strong><span class="small muted">'+done+'/'+total+'회 완료</span></div>'+
 '<p>'+E(options.find(x=>x.key===plan.metric)?.label||'보컬 연습')+' · '+
 fmt(plan.segmentStart)+'–'+fmt(plan.segmentEnd)+' · '+plan.minutes+'분 × '+plan.days+'일</p>'+
 '<p class="small muted">'+E(plan.startDate)+' ~ '+E(last)+' · 홈의 오늘 목표에서 완료 체크</p>'+compareSongTakes(plan,items)+
 '<div class="row"><a class="btn sm ghost" href="#/song/'+encodeURIComponent(plan.songId)+'">곡 상세 보기</a>'+
 '<button type="button" class="btn sm ghost" data-ab-plan="'+E(plan.id)+'">구간 A/B 비교</button>'+ (plan.archived?'':'<button type="button" class="btn sm ghost" data-archive-plan="'+E(plan.id)+'">계획 종료</button>')+'</div>'+ '<div data-ab-host="'+E(plan.id)+'"></div><div data-plan-outcome="'+E(plan.id)+'"></div></article>';
}
function create(form,month,items){
 const metric=form.elements.metric.value,songId=form.elements.song.value,
 start=Number(form.elements.start.value),end=Number(form.elements.end.value),
 minutes=Number(form.elements.minutes.value),days=Number(form.elements.days.value);
 if(!options.some(o=>o.key===metric)||!V.song(songId))throw Error('등록된 곡과 연습 항목을 선택해 주세요.');
 if(![start,end,minutes,days].every(Number.isInteger)||start<0||end>7200||end<=start||
    minutes<3||minutes>60||days<1||days>14)throw Error('구간·시간·일수를 확인해 주세요.');
 const sourceId=String(form.elements.sourceRecording.value||'');
 const source=sourceId?items.find(m=>m.id===sourceId):null;
 if(sourceId && (!source||source.songId!==songId))throw Error('선택한 녹음의 곡 정보가 변경됐어요. 다시 선택해 주세요.');
 const today=V.today(),id='monthly-plan:'+V.uid(),title=V.songTitle(songId);
 const segment=fmt(start)+'–'+fmt(end);
 const label=title+' · '+(options.find(o=>o.key===metric)?.label||'연습')+' ('+segment+', '+minutes+'분)';
 const ok=V.change(db=>{
  db.practicePlans||=[];db.dailyGoals||=[];
  db.practicePlans.push({id,kind:'monthly-vocal',sourceMonth:month,songId,metric,
   segmentStart:start,segmentEnd:end,minutes,days,reviewRecordingId:sourceId||'',startDate:today,created:Date.now(),archived:false});
  for(let i=0;i<days;i++){
   const date=dayShift(today,i);
   db.dailyGoals.push({id:id+':'+date,date,title:label,source:'personal',sourceId:id,
    completed:false,order:db.dailyGoals.filter(g=>g.date===date).length,created:Date.now()});
  }
 },{silent:true});
 if(!ok)throw Error('계획을 저장하지 못했어요.');
 return id;
}
function render(host,month,items,rows){
 if(!host?.isConnected)return;
 stopReview();
 V.segmentABStop?.();
 const mine=plans().sort((a,b)=>(b.created||0)-(a.created||0));
 // Cancelled plans must remain discoverable even without a saved final report.
 const retired=(V.db.practicePlans||[]).filter(x=>x?.kind==='monthly-vocal'&&x.archived)
  .sort((a,b)=>(b.archivedAt||0)-(a.archivedAt||0));
 host.innerHTML='<section class="card growth-section"><h2>곡별 집중 연습 계획</h2>'+
 '<p class="small muted">월간 추천을 실제 곡과 직접 선택한 구간에 연결해요. 하루 목표 완료로 진행률을 추적합니다.</p>'+
 (mine.length?'<div class="growth-plan-list">'+mine.map(plan=>card(plan,items)).join('')+'</div>':'<p>진행 중인 집중 연습 계획이 없어요.</p>')+
 (retired.length?'<details class="growth-plan-expand"><summary>완료·종료된 계획의 보관 리포트 ('+retired.length+')</summary><div class="growth-plan-list">'+retired.map(plan=>card(plan,items)).join('')+'</div></details>':'')+
 '<details class="growth-plan-expand"><summary>새 연습 계획 만들기</summary>'+form(month,items,rows)+'</details></section>';

 const formEl=host.querySelector('[data-plan-form]');
 function nextPlan(p){
  const form=host.querySelector('[data-plan-form]');
  const details=form?.closest('details');
  if(!details||!form)return;
  details.open=true;
  form.elements.metric.value=p.metric;
  form.elements.song.value=p.songId;
  form.elements.song.dispatchEvent(new Event('change',{bubbles:true}));
  form.elements.start.value=p.segmentStart;
  form.elements.end.value=p.segmentEnd;
  form.elements.minutes.value=p.minutes;
  form.elements.days.value=Math.min(5,p.days);
  details.scrollIntoView({behavior:'smooth',block:'start'});
  V.toast('이전 계획을 바탕으로 입력했어요. 확인 후 등록하세요.');
 }
 for(const p of [...mine,...retired]){
  const card=host.querySelectorAll('[data-plan-outcome]');
  const target=[...card].find(x=>x.dataset.planOutcome===p.id);
  if(target)V.planOutcomeCard?.(target,p,items,nextPlan);
 }

 const songInput=formEl.elements.song,recordInput=formEl.querySelector('[data-weak-record]');
 const statusEl=formEl.querySelector('[data-weak-results]');
 const button=formEl.querySelector('[data-find-weak]');
 let weakToken=0;
 function updateRecordings(){
  stopReview(); weakToken++;statusEl.textContent='';formEl.elements.sourceRecording.value='';
  const available=items.filter(m=>m.songId===songInput.value&&!M.isVideo(m)&&(!m.size||m.size<=60*1024*1024));
  recordInput.innerHTML='<option value="">녹음 선택</option>'+available.map(m=>
   '<option value="'+E(m.id)+'">'+E((M.dateOf(m)||'날짜 없음')+' · '+M.label(m))+'</option>').join('');
  button.disabled=!available.length;
  if(!available.length)statusEl.textContent='분석 가능한 해당 곡의 녹음이 아직 없어요. 구간을 직접 입력해 계획을 등록할 수 있어요.';
 }
 songInput.addEventListener('change',updateRecordings);
 updateRecordings();
 recordInput.addEventListener('change',()=>{stopReview();weakToken++;statusEl.textContent='';formEl.elements.sourceRecording.value='';});
 for(const field of [formEl.elements.start,formEl.elements.end])field.addEventListener('input',()=>{formEl.elements.sourceRecording.value='';});
 async function playSegment(item,seg,playerHost){
  stopReview();const generation=reviewState.generation;
  playerHost.textContent='재생 불러오는 중…';
  try{
   const src=await M.src(item);
   if(generation!==reviewState.generation||!playerHost.isConnected){
    if(src.revoke)URL.revokeObjectURL(src.url);
    return;
   }
   const audio=document.createElement('audio');
   audio.controls=true;audio.preload='metadata';audio.src=src.url;audio.setAttribute('aria-label','검토 구간 듣기');
   reviewState.player=audio;
   if(src.revoke)reviewState.revoke=()=>URL.revokeObjectURL(src.url);
   playerHost.replaceChildren(audio);
   audio.addEventListener('loadedmetadata',()=>{audio.currentTime=Math.min(seg.start,Number.isFinite(audio.duration)?Math.max(0,audio.duration-.1):seg.start);},{once:true});
   audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=seg.end)audio.pause();});
   audio.play().catch(()=>{});
  }catch(err){if(generation===reviewState.generation)playerHost.textContent=err.message||'재생할 수 없어요.';}
 }
 button.onclick=async()=>{
  if(!recordInput.value)return;
  const item=items.find(m=>m.id===recordInput.value&&m.songId===songInput.value);
  if(!item)return;
  stopReview();const token=++weakToken;button.disabled=true;
  statusEl.textContent='기기에서 녹음을 분석하고 있어요…';
  try{
   const result=await V.analyzeRecording(item,{save:false,onProgress:p=>{
    if(token===weakToken&&statusEl.isConnected)statusEl.textContent='구간 확인 중 · '+Math.round(Math.min(1,Math.max(0,p))*100)+'%';
   }});
   if(token!==weakToken||!statusEl.isConnected)return;
   if(!V.analysisReliable(result.summary)){
    statusEl.textContent='목소리와 반주를 충분히 분리하지 못했거나 유효한 발화가 짧아 자동 구간 추천을 보류했어요.';
    return;
   }
   const found=window.VzipWeakPhrase?.candidates(result)||[];
   if(!found.length){statusEl.textContent='확신할 만한 검토 후보를 찾지 못했어요. 직접 구간을 지정해 주세요.';return;}
   statusEl.innerHTML='<p class="small muted">음높이 확인 후보 '+found.length+'개 · 녹음을 듣고 실제 연습 구간인지 확인하세요.</p>'+
     found.map((seg,i)=>'<div class="growth-weak-item"><button type="button" data-use-weak="'+i+'" class="btn sm ghost">'+
      fmt(Math.floor(seg.start))+'–'+fmt(Math.ceil(seg.end))+' 선택</button><button type="button" data-play-weak="'+i+'" class="btn sm ghost">▶ 듣기</button>'+
      '<span class="small muted">기준 반음 편차 '+(seg.deviation>0?'+':'')+seg.deviation+' cent · 정답 판정 아님</span></div>').join('')+
     '<div data-weak-player></div>';
   statusEl.querySelectorAll('[data-use-weak]').forEach(b=>b.onclick=()=>{
    const segment=found[Number(b.dataset.useWeak)];
    formEl.elements.start.value=Math.floor(segment.start);
    formEl.elements.end.value=Math.ceil(segment.end);
    formEl.elements.sourceRecording.value=item.id;
    V.toast('구간을 입력했어요. 재생해 확인한 뒤 계획을 저장하세요.');
   });
   statusEl.querySelectorAll('[data-play-weak]').forEach(b=>b.onclick=()=>playSegment(item,found[Number(b.dataset.playWeak)],statusEl.querySelector('[data-weak-player]')));
  }catch(err){if(token===weakToken&&statusEl.isConnected)statusEl.textContent=err.message||'녹음 분석에 실패했어요.';}
  finally{if(token===weakToken&&button.isConnected)button.disabled=false;}
 };

 formEl.onsubmit=event=>{
  event.preventDefault();
  const statusEl=formEl.querySelector('[data-plan-message]');
  try{create(formEl,month,items);V.toast('계획을 저장했어요. 홈의 오늘 목표에서 확인해 주세요.');render(host,month,items,rows);}
  catch(error){statusEl.textContent=error.message||'계획을 저장하지 못했어요.';}
 };
 host.querySelectorAll('[data-ab-plan]').forEach(btn=>btn.onclick=()=>{
  const plan=[...mine,...retired].find(x=>x.id===btn.dataset.abPlan),panel=btn.closest('.growth-plan-item')?.querySelector('[data-ab-host]');
  if(!plan||!panel||!V.segmentABPanel)return;
  if(panel.childElementCount){V.segmentABStop?.();panel.replaceChildren();return;}
  V.segmentABPanel(panel,plan,items);
 });
 host.querySelectorAll('[data-archive-plan]').forEach(btn=>btn.onclick=async()=>{
  const id=btn.dataset.archivePlan;
  if(!await V.confirm('계획 종료','남은 날짜의 목표를 제거하고 이 계획을 종료할까요?'))return;
  const today=V.today();
  const ok=V.change(db=>{
   const p=db.practicePlans.find(p=>p.id===id&&p.kind==='monthly-vocal');if(!p)return;
   p.archived=true;p.archivedAt=Date.now();
   db.dailyGoals=db.dailyGoals.filter(g=>g.sourceId!==id||g.completed===true||g.date<today);
  },{silent:true});
  if(ok){V.toast('계획을 종료했어요. 완료한 목표는 남겨뒀어요.');render(host,month,items,rows);}
 });
}
V.monthlyPracticePlans=render;
})();
