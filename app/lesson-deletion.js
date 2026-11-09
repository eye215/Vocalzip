/* Account-bound deletion UI and durable per-device execution. Never starts work on page load. */
(()=>{
'use strict';
const V=window.VZ,M=V.media,P=window.VzipLessonDeletionModel,esc=V.esc;
const storage=window.VzipAccountScope?.storage||window.localStorage;
const owner=()=>{
 const scope=window.VzipAccountScope;
 if(scope?.leaving)throw Error('계정 전환 중에는 삭제하지 않아요.');
 return scope?scope.owner:(window.vzipCloudSignedIn?.()?window.vzipCloudUserId():'device');
};
const key=()=> 'vzip_lesson_deletions_v1:'+encodeURIComponent(owner());
function jobs(){
 const raw=storage.getItem(key());if(!raw)return [];
 let values;try{values=JSON.parse(raw);}catch{throw Error('미완료 삭제 기록을 읽지 못했어요. 새 삭제를 시작하지 않았어요.');}
 if(!Array.isArray(values))throw Error('삭제 작업 기록을 확인해 주세요.');
 return values.map(P.validate);
}
function save(job){
 if(owner()!==job.owner)throw Error('계정 변경으로 삭제 기록 저장을 멈췄어요.');
 const next=jobs().filter(x=>x.id!==job.id);
 if(job.phase!=='complete')next.push(job);
 // No lesson text, media bytes or secrets are retained in these receipts.
 storage.setItem(key(),JSON.stringify(next));
}
async function verify(job){
 if(owner()!==job.owner||job.cloud&&!window.vzipCloudSignedIn?.())throw Error('원래 로그인 계정에서 삭제를 다시 확인해 주세요.');
 const matches=V.db.lessons.filter(l=>l.id===job.lesson.id);
 if(!matches.length){
  if((V.db.deleted?.lessons||[]).includes(job.lesson.id)&&job.done.billing&&job.mediaIds.every(id=>job.done.media.includes(id)))return;
  throw Error('삭제할 레슨을 찾지 못했어요. 다른 기록은 지우지 않았어요.');
 }
 if(matches.length!==1)throw Error('같은 ID의 레슨이 여러 개예요. 삭제를 멈췄어요.');
 const value=P.lessonValue(matches[0],job.mediaIds);
 if(await P.fingerprint(matches[0],job.mediaIds)!==job.lessonSignature||
   P.lessonValue(V.db.lessons.find(l=>l.id===job.lesson.id)||{},job.mediaIds)!==value)
  throw Error('레슨 내용이 바뀌었어요. 최신 내용을 확인한 뒤 삭제해 주세요.');
}
let active=false;
async function run(job,onProgress){
 if(active)throw Error('다른 삭제 작업이 끝난 뒤 다시 시도해 주세요.');
 if(!navigator.locks?.request)throw Error('안전한 삭제를 위해 최신 Safari 또는 Chrome에서 다시 시도해 주세요.');
 active=true;
 try{
  return await navigator.locks.request('vzip-lesson-delete:'+job.owner,{ifAvailable:true},async lock=>{
   if(!lock)throw Error('다른 탭에서 삭제 중이에요. 작업이 끝난 뒤 다시 확인해 주세요.');
   return P.execute(job,{
    owner,verify,save,progress:onProgress,
    cancelCharge:job=>V.billingCancelForDeletion(job),
    removeMedia:async(job,id)=>{
     const files=await M.list(true);await verify(job);
     if(M.cloudError())throw Error(M.cloudError());
     const file=files.find(m=>m.id===id)||{id,cloud:job.cloud};
     if(file.accountOwner&&file.accountOwner!==job.owner)throw Error('다른 계정의 파일은 삭제하지 않아요.');
     await M.remove(file);
    },
    removeCloudLesson:job=>window.vzipCloudLessonDelete(job),
    removeLocalLesson:job=>{
     // This mutation is synchronous. Recheck the exact current string after the last async guard.
     const current=V.db.lessons.find(l=>l.id===job.lesson.id);
     const value=current?P.lessonValue(current,job.mediaIds):null;
     if(!V.change(db=>{
      const next=db.lessons.find(l=>l.id===job.lesson.id);
      if((next?P.lessonValue(next,job.mediaIds):null)!==value)throw Error('삭제 직전에 레슨이 변경됐어요.');
      window.VzipDataMerge.deleteLesson(db,job.lesson.id);
     },{silent:true}))throw Error('레슨 삭제를 저장하지 못했어요. 미완료 삭제에서 다시 시도해 주세요.');
    }
   });
  });
 }finally{active=false;}
}
function progressText(job){
 return ['정산 차감 '+(job.done.billing?'확인 완료':'대기'),
  '파일 '+job.done.media.length+'/'+job.mediaIds.length+'개',
  '레슨 '+(job.done.lesson?'삭제 완료':'대기')].join(' · ');
}
function progress(job){
 let latest=job,running=false;
 V.sheet({title:'레슨 삭제 진행',body:'<p class="muted">확인한 대상만 순서대로 처리해요. 중간에 멈추면 완료된 단계는 유지하고 다시 시도할 수 있어요.</p><p data-delete-progress role="status"></p><p data-delete-error role="alert"></p>',
  foot:'<button type="button" class="btn danger block" data-delete-retry>삭제 재시도</button>',
  onMount:(el,close)=>{
   const status=el.querySelector('[data-delete-progress]'),error=el.querySelector('[data-delete-error]'),button=el.querySelector('[data-delete-retry]');
   const start=async()=>{
    if(running)return;running=true;button.disabled=true;error.textContent='';
    try{
     const result=await run(latest,next=>{latest=next;status.textContent=progressText(next);});
     status.textContent=progressText(result);V.toast('선택한 레슨과 항목을 삭제했어요.');close();V.nav('#/lessons');
    }catch(e){
     error.textContent=e.message;
     try{latest=jobs().find(x=>x.id===job.id)||latest;}catch{}
     status.textContent=progressText(latest);button.disabled=false;
    }finally{running=false;}
   };
   button.onclick=start;status.textContent=progressText(job);start();
  }});
}
function pending(){
 let list;try{list=jobs();}catch(error){V.toast(error.message,'error');return;}
 if(!list.length)return;
 V.sheet({title:'미완료 레슨 삭제',body:'<p class="muted">이미 삭제한 파일은 복구할 수 없어요. 확인했던 대상의 남은 단계만 다시 처리합니다.</p><div class="list">'+list.map(j=>'<button type="button" class="item" data-job="'+esc(j.id)+'"><span class="item-main"><span class="item-title">'+esc(V.dateLabel(j.lesson.date))+'</span><span class="item-sub">'+esc(progressText(j))+'</span></span><i class="ph ph-caret-right"></i></button>').join('')+'</div>',
  onMount:(el,close)=>el.querySelectorAll('[data-job]').forEach(b=>b.onclick=()=>{const j=list.find(j=>j.id===b.dataset.job);close();progress(j);})});
}
async function open(id){
 if(active)return V.toast('진행 중인 삭제가 끝난 뒤 다시 확인해 주세요.');
 try{
  const old=jobs().find(j=>j.lesson.id===id);if(old){progress(old);return;}
  const account=owner(),lesson=structuredClone(V.db.lessons.find(l=>l.id===id));
  if(!lesson)throw Error('레슨을 찾지 못했어요.');
  const [ledger,files]=await Promise.all([V.billingDeletionLedger(),M.list(true)]);
  if(owner()!==account)throw Error('계정이 변경됐어요.');if(M.cloudError())throw Error(M.cloudError());
  const charge=P.target(lesson,ledger),refs=[...new Set((lesson.recordings||[]).map(r=>r.id))];
  const lines=refs.map(fileId=>{
   const file=files.find(m=>m.id===fileId);
   return '<label class="item"><input type="checkbox" name="media" value="'+esc(fileId)+'"><span class="item-main">'+esc(file?M.label(file):'연결 파일 · 원본 확인 후 삭제')+'</span></label>';
  }).join('');
  V.sheet({title:'레슨 삭제 대상',body:'<form id="lesson-delete-form"><p>'+esc(V.dateLabel(lesson.date))+' 레슨을 영구 삭제해요.</p><p class="muted">체크하지 않은 녹음과 정산은 유지돼요. 숙제·연습 기록·곡은 남고 레슨 연결만 해제돼요.</p>'+
   (lines?'<fieldset><legend>함께 영구 삭제할 녹음 · 기본 선택 없음</legend><div class="list">'+lines+'</div></fieldset>':'<p class="muted">연결된 녹음이 없어요.</p>')+
   (charge?'<label class="item"><input type="checkbox" name="billing"><span class="item-main">연결 차감 취소 · '+esc(String(charge.units/100))+'회 반환<small class="item-sub">결제·환불과 최소 거래 이력은 유지돼요.</small></span></label>':'<p class="muted">취소할 연결 차감이 없어요. 다른 날짜나 같은 날의 별도 정산은 유지돼요.</p>')+
   '<p data-delete-plan-error role="alert"></p></form>',
   foot:'<button type="submit" form="lesson-delete-form" class="btn danger block">삭제 대상 확인</button>',
   onMount:(el,close)=>{
    const form=el.querySelector('form'),button=el.querySelector('button[type=submit]');
    form.onsubmit=async e=>{
     e.preventDefault();button.disabled=true;
     try{
      const selected=[...new FormData(form).getAll('media')],cancel=!!form.elements.billing?.checked;
      const job=await P.plan({id:V.uid(),owner:account,lesson,mediaIds:selected,deduction:cancel?charge:null,cloud:!!window.vzipCloudSignedIn?.()});
      await verify(job);close();
      const shared=selected.filter(fileId=>V.db.practices.some(p=>(p.mediaIds||[]).includes(fileId))||
       V.db.lessons.some(l=>l.id!==id&&(l.recordings||[]).some(r=>r.id===fileId))||V.db.songs.some(s=>s.repertoire?.takeId===fileId));
      const message='레슨 1건'+(selected.length?' · 녹음 '+selected.length+'개':'')+(cancel?' · 연결 차감 취소':'')+
       '\n\n선택한 레슨과 파일은 영구 삭제되며 복구할 수 없습니다.'+
       (selected.length?' 선택 파일은 다른 레슨·연습에서도 원본과 연결이 삭제되고 기록·메모·연습시간은 남습니다.':'')+
       (shared.length?'\n다른 기록에서도 사용하는 파일 '+shared.length+'개가 포함되어 있습니다.':'')+
       '\n체크하지 않은 파일·정산, 결제·환불은 유지합니다.';
      if(await V.confirm('선택 항목 영구 삭제',message,{ok:'영구 삭제',danger:true})){
       await verify(job);progress(job);
      }
     }catch(error){if(el.isConnected){el.querySelector('[data-delete-plan-error]').textContent=error.message;button.disabled=false;}else V.toast(error.message,'error');}
    };
   }});
 }catch(error){V.toast(error.message,'error');}
}
V.lessonDeletion={open,pending,run,jobs,
 pendingButton(){try{const n=jobs().length;return n?'<button type="button" class="btn ghost block" data-delete-pending>미완료 레슨 삭제 '+n+'건 확인</button>':'';}catch{return '<p role="alert">미완료 삭제 기록을 읽지 못했어요. 원본은 자동으로 지우지 않습니다.</p>';}}};
document.addEventListener('click',e=>{if(e.target.closest('[data-delete-pending]'))pending();});
})();
