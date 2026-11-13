/* Performance files use existing private R2 transport; metadata stays in the performance in vocal_data. */
(()=>{
'use strict';
const V=window.VZ,U=V.archiveUI,E=V.esc;
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',pdf:'application/pdf',txt:'text/plain',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
const category=t=>t.startsWith('image/')?'사진':t.startsWith('video/')?'영상':'문서';
const alive=(p,account)=>{if(U.owner()!==account||!U.get(p.id))throw Error('계정 또는 공연이 변경됐어요. 다시 열어 주세요.')};
const ownedKey=(asset,account)=>asset.ownerId===account&&asset.key.startsWith('u/'+account+'/performance-');
function attach(p,asset,account){alive(p,account);U.save(db=>{const row=db.performances.find(x=>x.id===p.id);if(!row||row.ownerId!==account)throw Error('공연을 찾을 수 없어요.');if(!(row.assets||[]).some(x=>x.id===asset.id))row.assets=[...(row.assets||[]),asset]})}
function uploadSheet(p){
 const account=U.owner(),journal='vzip_performance_pending:'+account;let rows=[],running=false,abort;
 const unsaved=()=>running||rows.some(r=>!r.done);
 const unload=e=>{if(unsaved()){e.preventDefault();e.returnValue=''}};
 window.addEventListener('beforeunload',unload);V.setGuard(()=>unsaved()?'아직 저장하지 않은 공연 자료가 있어요. 이동할까요?':'');
 const pending=()=>{try{return JSON.parse(localStorage.getItem(journal)||'[]')}catch{return []}};
 const keep=asset=>localStorage.setItem(journal,JSON.stringify([...pending().filter(x=>x.asset.id!==asset.id),{performanceId:p.id,asset}]));
 const forget=id=>localStorage.setItem(journal,JSON.stringify(pending().filter(x=>x.asset.id!==id)));
 rows=pending().filter(x=>x.performanceId===p.id).map(x=>({id:x.asset.id,asset:x.asset,file:null,status:'메타데이터 저장 대기',done:false}));
 const api=V.sheet({title:'공연 자료 업로드',body:'<div class="archive-page"><label class="field"><span>포스터·사진·공연 영상·PDF·문서</span><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.mp4,.mov,.webm,.pdf,.txt,.docx" data-files></label><p class="small muted">공연 영상은 영상 그대로 보관합니다. 파일당 최대 1GB이며 비공개 R2에 저장해요.</p><div data-queue></div></div>',
 onMount:(el,close)=>{
  el.classList.add('archive-sheet');
  el.querySelector('[data-files]').onchange=e=>{if(running)return;rows=rows.filter(r=>r.asset&&!r.done).concat([...e.target.files].map(file=>({file,id:'performance-'+V.uid(),status:'대기',done:false,asset:null})));draw()};
  function draw(){el.querySelector('[data-queue]').innerHTML=rows.map((r,i)=>'<div class="archive-asset"><strong>'+E(r.file?.name||r.asset.name)+'</strong><span>'+E(r.status)+'</span><button class="btn sm secondary" data-upload="'+i+'"'+(r.done||running?' disabled':'')+'>'+(r.done?'저장 완료':r.asset?'메타데이터 저장 재시도':'업로드·재시도')+'</button></div>').join('');el.querySelectorAll('[data-upload]').forEach(b=>b.onclick=()=>run(rows[+b.dataset.upload]))}
  async function run(r){
   if(running)return;running=true;abort=new AbortController();r.status='연결 확인';el.querySelector('[data-files]').disabled=true;draw();
   try{
    alive(p,account);if(!window.VzipR2?.configured()||!await VzipR2.ready())throw Error('R2 연결을 확인해 주세요.');
    const ext=r.file?.name.split('.').pop().toLowerCase(),type=r.asset?.type||types[ext];if(!type)throw Error('지원하지 않는 자료 형식이에요.');if(!r.asset&&(!r.file.size||r.file.size>1024**3))throw Error('빈 파일 또는 1GB 초과 파일은 올릴 수 없어요.');
    if(!r.asset){const result=await VzipR2.upload(r.file,{mediaId:r.id,type,purpose:'performance',signal:abort.signal,onProgress:n=>{r.status=n+'%';draw()}});r.asset={id:r.id,ownerId:account,key:result.key,name:r.file.name,type,size:result.size,created:Date.now()};keep(r.asset)}
    attach(p,r.asset,account);forget(r.asset.id);r.done=true;r.status='저장 완료';
   }catch(e){r.status=e.message||'실패'}finally{running=false;el.querySelector('[data-files]').disabled=false;draw()}
  }
  draw();
  const stop=e=>{if(!unsaved())return;if(e.type==='keydown'&&e.key!=='Escape')return;if(e.type==='click'&&e.target!==el.parentNode&&!e.target.closest('[data-close]'))return;e.preventDefault();e.stopImmediatePropagation();V.confirm('공연 자료 닫기','저장하지 않은 파일 선택을 닫을까요? 진행 중인 업로드는 중지됩니다.',{ok:'닫기'}).then(ok=>{if(ok){abort?.abort();close()}})};
  el.parentNode.addEventListener('click',stop,true);el.parentNode.addEventListener('keydown',stop,true);
 },onClose:()=>{abort?.abort();V.setGuard(null);window.removeEventListener('beforeunload',unload);V.softRender()}});
}
V.archiveAssets={
 mount(host,p){
  const account=U.owner(),assets=(p.assets||[]).filter(a=>ownedKey(a,account));
  host.innerHTML='<button class="btn secondary" data-add-assets>자료 업로드</button><div>'+assets.map(a=>'<div class="archive-asset"><strong>'+E(a.name)+'</strong><span class="small">'+category(a.type)+' · '+V.size(a.size)+'</span><div class="archive-actions"><button class="btn sm ghost" data-open="'+E(a.id)+'">열기</button>'+(a.type.startsWith('image/')?'<button class="btn sm ghost" data-poster="'+E(a.id)+'">'+(p.posterId===a.id?'대표 포스터 해제':'대표 포스터')+'</button>':'')+'<button class="btn sm ghost" data-remove="'+E(a.id)+'">자료 삭제</button></div><div data-preview="'+E(a.id)+'"></div></div>').join('')+'</div>';
  host.querySelector('[data-add-assets]').onclick=()=>uploadSheet(p);
  host.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const a=assets.find(a=>a.id===b.dataset.open);try{alive(p,account);const url=await VzipR2.url(a.key);alive(p,account);const target=host.querySelector('[data-preview="'+CSS.escape(a.id)+'"]');target.replaceChildren();if(a.type.startsWith('image/')&&a.type!=='image/heic'){const img=new Image();img.alt=a.name;img.src=url;target.append(img)}else if(a.type.startsWith('video/')){const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=url;target.append(video)}else{const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.download=a.name;link.className='btn sm';link.textContent='파일 다운로드';target.append(link)}}catch(e){V.toast(e.message,'error')}});
  host.querySelectorAll('[data-poster]').forEach(b=>b.onclick=()=>{try{alive(p,account);U.save(db=>{const show=db.performances.find(x=>x.id===p.id);show.posterId=show.posterId===b.dataset.poster?'':b.dataset.poster})}catch(e){V.toast(e.message,'error')}});
  host.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{
   const a=assets.find(x=>x.id===b.dataset.remove);
   if(!await V.confirm('자료 삭제','공연 자료 원본을 삭제할까요? 되돌릴 수 없습니다.',{ok:'삭제',danger:true}))return;
   b.disabled=true;try{alive(p,account);if(!ownedKey(a,account))throw Error('파일 소유자를 확인하지 못했어요.');await VzipR2.remove(a.key);alive(p,account);U.save(db=>{const row=db.performances.find(x=>x.id===p.id);row.assets=row.assets.filter(x=>x.id!==a.id);if(row.posterId===a.id)row.posterId=''})}catch(e){V.toast(e.message+' · 실패한 단계부터 다시 삭제할 수 있어요.','error');b.disabled=false}
  });
 },
 async posters(host,shows){const account=U.owner();for(const p of shows){const a=p.assets?.find(a=>a.id===p.posterId&&ownedKey(a,account));if(!a||!a.type.startsWith('image/')||a.type==='image/heic')continue;try{const url=await VzipR2.url(a.key);if(!host.isConnected||account!==U.owner())return;const slot=host.querySelector('[data-poster="'+CSS.escape(p.id)+'"]');if(slot){const img=new Image();img.alt=p.title+' 포스터';img.src=url;slot.replaceChildren(img)}}catch{}}}
};
})();
