/* Isolated route addon: no edits to core, the vocal lab or cloud sync. Existing capture/save contracts only. */
(()=>{
'use strict';const V=window.VZ,S=window.VzipPrecisionSession;if(!V||!S)return;
const e=V.esc,owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'local',storage=()=>window.VzipAccountScope?.storage||localStorage,key=()=> 'vzip_precision_session:'+owner();
let session=null,sessionOwner='',live=null,busy=false,controller=null,timer=null,deadline=0,message='',pendingTake=null,navStyle=null;
const active=()=>document.querySelector('[data-precision-session]');
function load(){if(sessionOwner===owner())return;sessionOwner=owner();session=null;try{session=S.restore(JSON.parse(storage().getItem(key())||'null'),owner());}catch{}}
function persist(){if(sessionOwner!==owner())throw Error('계정이 변경됐어요. 원래 계정의 녹음은 보존돼요.');try{storage().setItem(key(),JSON.stringify(session));}catch{throw Error('기기 저장 공간이 부족해요. 화면을 닫기 전에 저장을 다시 시도해 주세요.');}}
const state=t=>({pending:'아직 안 함',captured:'녹음 보관됨',analyzing:'분석 중',complete:'완료',failed:'분석 재시도'})[t.state]||'아직 안 함';
const task=()=>session?.tasks[session.index];
const note=m=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][m%12]+(Math.floor(m/12)-1);
function html(){
 if(!session)return '<section class="precision-panel"><h2>편안한 소리로 정밀 측정</h2><p>8가지 과제를 짧게 나누어 녹음해요. 편안한 음역만 사용하고, 회차 사이에는 쉬어 주세요. 원본과 기존 분석은 그대로 보관해요.</p><form data-precision-setup><label>편안한 기준음<select name="pitch">'+Array.from({length:49},(_,i)=>{const m=36+i,n=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][m%12]+(Math.floor(m/12)-1);return '<option value="'+m+'"'+(m===57?' selected':'')+'>'+n+'</option>';}).join('')+'</select></label><label>녹음 환경 이름 <small>비교 때 같은 마이크·거리·공간을 구분해요</small><input name="environment" maxlength="100" placeholder="예: 휴대폰 · 조용한 방 · 30cm" required></label><label><span><input type="checkbox" name="clean" required style="width:20px;min-height:20px"> 이어폰을 사용하며 반주 없이 목소리만 녹음해요</span></label><button class="btn block" type="submit">측정 준비</button></form></section>';
 const t=task(),p=S.progress(session),allDone=p.complete===p.total;
 return '<div class="precision-session-cols"><div><section class="precision-panel"><p>전체 진행 '+p.complete+' / '+p.total+' · '+p.failed+'개 재시도 가능</p><progress max="'+p.total+'" value="'+p.complete+'" aria-label="완료 과제"></progress><h2>'+e(t.title)+'</h2><p>'+e(t.guide)+'</p><p>목표 '+t.seconds+'초 · 편안한 기준음 '+note(t.targetMidi)+'</p>'+
  '<p data-count role="timer">'+(live?Math.max(0,Math.ceil((deadline-Date.now())/1000)):'')+'</p><div class="precision-actions">'+(live?'<button type="button" class="btn" data-stop>여기까지 녹음하고 보관</button>':
   '<button type="button" class="btn" data-record'+(busy?' disabled':'')+'>'+(t.attempts.length?'이 과제 다시 녹음':'녹음 시작')+'</button>'+((t.attempts.length||pendingTake)?'<button type="button" class="btn secondary" data-analyze'+(busy?' disabled':'')+'>'+(pendingTake?'녹음 저장 다시 시도':'보관된 녹음 분석')+'</button>':''))+
  '<button type="button" class="btn secondary" data-next'+(busy||live?' disabled':'')+'>다음 과제</button></div><p>다시 녹음해도 이전 녹음은 삭제하지 않아요. 녹음 길이를 연습 시간에 자동으로 더하지 않아요.</p></section>'+
  '<section class="precision-panel"><h2>'+(allDone?'전체 측정 완료':'과제별 결과')+'</h2>'+session.tasks.filter(t=>t.attempts.at(-1)?.result).map(t=>{const r=t.attempts.at(-1).result;return '<p>'+e(t.title)+' · '+(r.metrics?.f0?.value!=null?e(r.metrics.f0.value.toFixed(1))+' Hz':'측정 보류')+'</p>';}).join('')+(V.precisionReportLink?.(S.summary(session))||'<p>전체 결과는 이 기기에 보관돼요. 정밀 리포트 연결은 후속 분석 모듈에서 제공해요.</p>')+'</section></div>'+
  '<ol class="precision-task-list">'+session.tasks.map((t,i)=>'<li><button type="button" data-task="'+i+'" aria-current="'+(i===session.index)+'"'+(busy||live?' disabled':'')+'><span>'+e(t.title)+'</span><small>'+state(t)+'</small></button></li>').join('')+'</ol></div>';
}
function paint(){const host=active();if(!host)return;load();host.innerHTML='<div role="status" data-precision-status>'+e(busy?'녹음과 분석을 처리하고 있어요.':'')+'</div><p role="alert" data-precision-error>'+e(message)+'</p>'+html();bind(host);}
function bind(host){
 host.querySelector('[data-precision-setup]')?.addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;session=S.create({id:V.uid(),owner:owner(),targetMidi:Number(form.pitch.value),environment:form.environment.value.trim()});try{persist();message='';paint();}catch(err){message=err.message;paint();}});
 host.querySelector('[data-record]')?.addEventListener('click',record);
 host.querySelector('[data-stop]')?.addEventListener('click',()=>finish(false));
 host.querySelector('[data-analyze]')?.addEventListener('click',()=>pendingTake?storeTake():analyze());
 host.querySelector('[data-next]')?.addEventListener('click',()=>{session.index=(session.index+1)%session.tasks.length;message='';persist();paint();});
 host.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{session.index=Number(b.dataset.task);message='';persist();paint();});
}
async function record(){
 if(busy||live)return;if(pendingTake){message='보관 대기 중인 녹음을 먼저 저장해 주세요.';paint();return;}busy=true;message='';paint();const original=owner();let capture;
 try{capture=await V.media.capture({});if(original!==owner()||!active()){capture.cancel();return;}live=capture;live.start();deadline=Date.now()+task().seconds*1000;
  V.setGuard(()=>live?'녹음 중이에요. 나가면 지금까지의 소리를 보관해요.':'');paint();timer=setInterval(()=>{const count=active()?.querySelector('[data-count]');if(count)count.textContent=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(Date.now()>=deadline)finish(false);},200);
 }catch(err){message='마이크를 열지 못했어요. 권한을 확인하고 다시 시도해 주세요. '+(err.name==='NotAllowedError'?'권한이 거절됐어요.':'');}finally{busy=false;paint();}
}
async function finish(interrupted){
 const capture=live;if(!capture)return;const taskId=task().id,captureOwner=sessionOwner;live=null;clearInterval(timer);V.setGuard(null);busy=true;paint();
 try{const res=await capture.stop();pendingTake={res,taskId,owner:captureOwner,mediaId:V.uid(),interrupted};await storeTake();}
 catch(err){message='녹음을 마무리하지 못했어요. 기기의 녹음 복구 상태를 확인해 주세요.';}finally{busy=false;paint();}
}
async function storeTake(){
 const take=pendingTake;if(!take)return;if(take.owner!==owner()){message='원래 계정으로 돌아와 녹음을 저장해 주세요.';paint();return;}
 busy=true;paint();try{
  const t=session.tasks.find(t=>t.id===take.taskId),res=take.res,item={id:take.mediaId,name:'정밀 측정 · '+t.title,created:Date.now(),recordedDate:V.today(),dateSource:'recorded',type:res.type||res.blob.type,source:'practice',origin:'precision-measurement',recordingCategory:'training',songId:'',blob:res.blob,durationSeconds:res.durationSeconds,waveform:res.waveform,...(res.accountOwner?{accountOwner:res.accountOwner}:{})};
  const stored=take.stored||await V.media.saveBlob(item);take.stored=stored||item;
  if(!t.attempts.some(a=>a.mediaId===item.id))S.capture(session,t.id,{mediaId:item.id,duration:res.durationSeconds});persist();res.releaseProtection?.();pendingTake=null;
  message=take.interrupted?'화면을 벗어나기 전까지의 녹음을 보관했어요. 이 과제를 다시 시도할 수 있어요.':'녹음을 보관했어요.';
  if(!take.interrupted&&active())await analyze();
 }catch(err){message='저장하지 못했어요. 녹음은 이 화면에서 유지하고 있어요. 저장을 다시 시도해 주세요.';}finally{busy=false;paint();}
}
async function analyze(){
 const t=task(),attempt=t.attempts.at(-1);if(!attempt)return;
 if(!V.precisionAnalyze){message='정밀 분석 모듈이 아직 연결되지 않았어요. 녹음은 보관돼 있어요.';paint();return;}
 const atOwner=owner(),previousState=t.state;let started=false,received=false;
 busy=true;controller=new AbortController();
 try{t.state='analyzing';persist();started=true;paint();const item=(await V.media.list()).find(m=>m.id===attempt.mediaId);if(!item)throw Error('saved media not available');
  const result=await V.precisionAnalyze(item,{signal:controller.signal,context:{source:'clean',owner:atOwner,task:t.task,vowel:t.vowel,environment:t.environment,targetMidi:t.targetMidi,loudness:t.loudness,measurementId:session.id,trial:t.id}});
  if(atOwner!==owner())return;const summary={engineVersion:result.engineVersion,archiveId:result.archiveId,metrics:result.metrics,quality:result.quality};S.result(session,t.id,summary,result.metrics?.f0?.value!=null?'complete':'failed');received=true;persist();message=t.state==='complete'?'과제 분석을 보관했어요.':'신뢰할 수 있는 값이 부족해요. 이 과제만 다시 녹음할 수 있어요.';
 }catch(err){if(atOwner===owner()){if(!received)t.state=started?'failed':previousState;try{persist();message=err.name==='AbortError'?'분석을 멈췄어요. 보관된 녹음으로 다시 분석할 수 있어요.':'분석하지 못했어요. 녹음은 보관돼 있어요.';}catch(storageError){message=storageError.message;}}}finally{busy=false;controller=null;paint();}
}
V.precisionMeasurement={summary:()=>{load();return session?S.summary(session):null;}};
V.route('precision-measurement',{title:'발성 정밀 측정',back:true,tab:'growth',noAutoRefresh:true,noSettings:true,render:()=>'<div class="precision-session" data-precision-session></div>',mount(){const nav=document.querySelector('body>.v-nav');if(nav){navStyle=[nav.style.getPropertyValue('display'),nav.style.getPropertyPriority('display')];nav.style.setProperty('display','none','important');}load();paint();},leave(){const nav=document.querySelector('body>.v-nav');if(nav&&navStyle){nav.style.setProperty('display',...navStyle);navStyle=null;}controller?.abort();if(live)finish(true);}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){controller?.abort();if(live)finish(true);}});
window.addEventListener('pagehide',()=>{controller?.abort();if(live)finish(true);});
window.VzipAccountScope?.beforeLeave?.(()=>{controller?.abort();if(live)finish(true);});
function entry(){const host=document.querySelector('[data-hub-training]');if(!host||host.querySelector('[data-precision-entry]'))return;const link=document.createElement('a');link.className='item';link.href='#/precision-measurement';link.dataset.precisionEntry='';link.innerHTML='<i class="ph ph-waveform" aria-hidden="true"></i><span class="item-main"><span class="item-title">발성 정밀 측정</span><span class="item-sub">편안한 음역에서 8가지 과제</span></span><i class="ph ph-caret-right" aria-hidden="true"></i>';host.append(link);}
const view=document.getElementById('view');if(view)new MutationObserver(entry).observe(view,{childList:true,subtree:true});
})();
