/* Reuse the approved comparison page for one explicitly selected interrupted deletion. */
(()=>{'use strict';
window.VzipMediaDeleteReview={open({list,review,resolve,retry,onClose=()=>{}}){
 const VZ=window.VZ;if(!VZ?.sheet||!window.VzipSnapshotReview)throw Error('파일 확인 화면을 불러오지 못했어요.');
 let alive=true,moving=false,finished=false,offset=0;
 const finish=()=>{if(!finished){finished=true;onClose();}};
 const api=VZ.sheet({title:'중단된 파일 삭제',variant:'page',body:'<div class="snapshot-review"><p>파일을 골라 최신 원본 정보와 달라진 기록을 확인하세요. 확인 전에는 추가 삭제하지 않아요.</p><p role="status" data-delete-list-message>파일을 확인하고 있어요…</p><div data-delete-list></div><div class="btn-row"><button type="button" class="btn secondary" data-delete-prev hidden>이전</button><button type="button" class="btn secondary" data-delete-next hidden>다음</button></div></div>',
  onClose:()=>{alive=false;window.removeEventListener('vzip:auth-changed',authChanged);if(!moving)finish();}});
 api.el.classList.add('snapshot-review-page');
 const status=api.el.querySelector('[data-delete-list-message]'),rows=api.el.querySelector('[data-delete-list]'),prev=api.el.querySelector('[data-delete-prev]'),next=api.el.querySelector('[data-delete-next]');
 const choose=id=>{
  moving=true;api.close();let reviewId=null;
  try{window.VzipSnapshotReview.open({mediaDelete:true,
   review:async()=>{const value=await review(id);reviewId=value.reviewId;return value;},
   resolve,retry:()=>retry(reviewId),onClose:finish
  });}catch(e){finish();VZ.toast(e.message,'error');}
 };
 async function draw(){
  status.textContent='파일을 확인하고 있어요…';prev.hidden=true;next.hidden=true;rows.replaceChildren();
  try{
   const result=await list({offset});if(!alive)return;
   status.textContent=result.total?'중단된 삭제 '+result.total+'개':'확인할 삭제가 없어요.';
   for(const row of result.rows){
    const button=document.createElement('button');button.type='button';button.className='snapshot-review-option';button.style.width='100%';button.dataset.mediaDeleteItem=row.id;
    const name=document.createElement('span');name.textContent=row.name;button.append(name);button.onclick=()=>choose(row.id);rows.append(button);
   }
   prev.hidden=offset===0;next.hidden=offset+20>=result.total;
  }catch(e){if(alive)status.textContent=e.message+' 원본은 유지돼요.';}
 }
 function authChanged(){api.close();}
 window.addEventListener('vzip:auth-changed',authChanged);
 prev.onclick=()=>{offset=Math.max(0,offset-20);void draw();};next.onclick=()=>{offset+=20;void draw();};
 void draw();return api;
}};
})();
