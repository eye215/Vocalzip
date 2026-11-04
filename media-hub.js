/* VOCAL.zip media library: cloud-first, no iPhone download required. */
(()=>{'use strict';
const archive=document.querySelector('#media');if(!archive)return;
const card=document.createElement('div');card.className='card';card.id='vzip-media-hub';
card.innerHTML='<h2>내 음원</h2><p class="muted">설정 없이 바로 올리고 확인해요. 파일을 누르면 비교할 수 있어요.</p><div class="vzip-hub-buttons"><label class="btn" for="vzip-hub-upload">＋ 음원·영상 가져오기</label><input id="vzip-hub-upload" type="file" multiple accept=".mp4,.mov,.m4v,.m4a,.mp3,.wav,.webm,.aac,.ogg,.flac,video/mp4,video/quicktime,audio/mp4,audio/mpeg,audio/wav" hidden><button class="btn secondary" id="vzip-hub-reload" type="button">↻ 새로고침</button></div><div class="vzip-hub-filters" role="group" aria-label="파일 필터"><button type="button" class="active" data-filter="all">전체</button><button type="button" data-filter="audio">🎤 음성</button></div><p class="muted" id="vzip-hub-status" role="status"></p><div id="vzip-hub-list"></div>';
archive.append(card);const originFilters=document.createElement('div');originFilters.className='vzip-hub-filters';originFilters.setAttribute('role','group');originFilters.setAttribute('aria-label','녹음 출처');originFilters.innerHTML='<button type="button" class="active" data-origin="all">전체 출처</button><button type="button" data-origin="lesson">🎓 레슨</button><button type="button" data-origin="practice">🎼 연습</button><button type="button" data-origin="import">📂 가져온 파일</button>';card.querySelector('.vzip-hub-filters')?.after(originFilters);
const $=s=>card.querySelector(s),status=$('#vzip-hub-status'),list=$('#vzip-hub-list');
const key='vocal-zip_mvp_v1',dbName='vocalzip_media_v1';let items=[],activeUrl=null,activeEl=null,filter='all',origin='all',groupBySong=false,refreshRun=0,playRun=0,uploadMessage='';
const songs=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}').songs||[]}catch{return []}};
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('recordings'))req.result.createObjectStore('recordings',{keyPath:'id'})};req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result)})}
async function localAll(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readonly'),req=tx.objectStore('recordings').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function localChange(id,fn){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readwrite'),store=tx.objectStore('recordings'),req=store.get(id);req.onsuccess=()=>{if(req.result){const updated=fn(req.result);if(updated)store.put(updated);else store.delete(id)}};tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)})}
function date(n){const d=new Date(n);return n==null||n===''||Number.isNaN(+d)?'날짜 미상':d.toLocaleDateString('ko-KR')}
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function refresh(){clearTimeout(window.__vzipHubTimer);const run=++refreshRun;status.textContent=uploadMessage||'녹음·영상 목록 불러오는 중…';try{const local=await localAll();let remote=[];if(window.vzipCloudSignedIn?.()&&window.vzipCloudMediaList){remote=await window.vzipCloudMediaList()}if(run!==refreshRun)return;const map=new Map();local.forEach(x=>map.set(x.id,{...x,local:true}));remote.forEach(x=>map.set(x.id,{...map.get(x.id),...x,cloud:true}));items=[...map.values()].sort((a,b)=>(b.created||0)-(a.created||0));render();status.textContent=uploadMessage||items.length+'개 파일 · '+remote.length+'개 클라우드 저장'+(remote.length?' · 기기에 다운로드하지 않아도 재생 가능':'');window.dispatchEvent(new CustomEvent('vzip:hub-refreshed',{detail:{items}}))}catch(e){if(run!==refreshRun)return;status.textContent='클라우드 목록 확인 실패: '+e.message+' · 기기 파일을 표시해요.';try{const local=await localAll();if(run!==refreshRun)return;items=local.map(x=>({...x,local:true}));render()}catch(error){if(run===refreshRun)status.textContent='파일 목록 확인 실패: '+error.message}}}
const groupControl=document.createElement('button');groupControl.type='button';groupControl.className='btn secondary';groupControl.textContent='♫ 곡별 묶어보기';groupControl.setAttribute('aria-pressed','false');groupControl.style.margin='10px 0';list.before(groupControl);
groupControl.onclick=()=>{groupBySong=!groupBySong;groupControl.setAttribute('aria-pressed',String(groupBySong));groupControl.textContent=groupBySong?'☷ 최신순으로 보기':'♫ 곡별 묶어보기';render()};
function render(){clearPlayer();list.replaceChildren();if(!items.length){list.innerHTML='<p class="empty">아직 녹음·영상이 없어요. 위에서 파일을 업로드해 보세요.</p>';return}
const visible=items.filter(x=>(filter==='all'||(filter==='video'?x.type?.startsWith('video/'):!x.type?.startsWith('video/')))&&(origin==='all'||(origin==='import'?!['lesson','practice'].includes(x.source):x.source===origin)));
if(!visible.length){list.innerHTML='<p class="empty">선택한 조건에 맞는 파일이 없어요. 다른 필터를 선택해 주세요.</p>';return}
const groupKey=item=>item.songId?'id:'+item.songId:item.song?'legacy:'+item.song:'unassigned';
const ordered=groupBySong?[...visible].sort((a,b)=>{
 return groupKey(a).localeCompare(groupKey(b),'ko')||((b.created||0)-(a.created||0));
}):visible;
let lastSong=null;
for(const item of ordered){
 if(groupBySong){const current=groupKey(item);if(current!==lastSong){
  const heading=document.createElement('h3');heading.className='vzip-song-group-title';heading.style.cssText='margin:24px 0 8px;padding:0 2px;font-size:17px';
  const count=ordered.filter(x=>groupKey(x)===current).length;
  heading.dataset.songKey=current;
  heading.textContent=(songs().find(x=>x.id===item.songId)?.title||item.song||'곡 미지정')+' · '+count+'개 녹음';list.append(heading);lastSong=current;
 }}
 const row=document.createElement('article');row.className='vzip-hub-item';row.dataset.id=item.id;row.setAttribute('aria-label',item.name||'제목 없는 파일');
const head=document.createElement('div');head.innerHTML='<strong>'+escape(item.type?.startsWith('video/')?'🎬 ':'🎤 ')+escape(item.name||'제목 없음')+'</strong><div class="muted">'+escape(item.recordedDate||date(item.created))+' · '+escape(item.song||'곡 미지정')+' · '+escape(item.source==='lesson'?'🎓 레슨':item.source==='practice'?'🎼 연습':'📂 가져온 파일')+' · '+(item.cloud?'☁️ 클라우드':'📱 기기')+'</div>';row.append(head);
if(item.rating||item.review){const review=document.createElement('div');review.className='vzip-media-review-summary';const score=item.rating?'💜 '+escape(item.rating)+'/5 · ':'';review.textContent=score+(item.review||'');row.append(review)}
const buttons=document.createElement('div');buttons.className='vzip-hub-buttons';for(const [action,label] of [['play','▶ 재생'],['edit','✎ 곡·감상 기록'],['compare','비교 선택'],['delete','🗑 삭제']]){const b=document.createElement('button');b.type='button';b.className='smallbtn';b.dataset.action=action;b.textContent=label;buttons.append(b)}row.append(buttons);list.append(row)}}
card.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;card.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});render()}));
originFilters.querySelectorAll('[data-origin]').forEach(b=>b.addEventListener('click',()=>{origin=b.dataset.origin;originFilters.querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});render()}));
function clearPlayer(){playRun++;if(activeEl){activeEl.pause();activeEl.removeAttribute('src');activeEl.load();activeEl.vzipRemovePlayer?.();activeEl.remove();activeEl=null}if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl=null}}
async function play(item,row){
 clearPlayer();const run=playRun;status.textContent='재생 준비 중…';
 const current=()=>run===playRun&&row.isConnected&&!archive.hidden;
 try{
  const blob=window.vzipMediaBlob(item);
  const src=blob?URL.createObjectURL(blob):await window.vzipCloudMediaUrl(item);
  if(!current()){if(blob)URL.revokeObjectURL(src);return}
  if(blob)activeUrl=src;
  const el=document.createElement(window.vzipMediaType(item).startsWith('video/')?'video':'audio');
  el.controls=true;el.playsInline=true;el.preload='metadata';el.style.width='100%';el.style.marginTop='10px';
  el.onloadedmetadata=()=>{if(current())status.textContent='재생할 수 있어요.'};
  el.onerror=()=>{if(current())status.textContent='파일을 재생하지 못했어요. 원본 형식과 네트워크를 확인한 뒤 다시 재생해 주세요.'};
  el.src=src;row.append(el);window.vzipEnhancePlayer?.(el,item);activeEl=el;
  el.play().catch(()=>{if(current()&&!el.error)status.textContent='재생 버튼을 눌러 들어보세요.'});
 }catch(e){if(current())status.textContent='재생 실패: '+e.message}
}
async function edit(item,trigger){
const modal=document.createElement('div');modal.className='vzip-media-edit-backdrop';modal.innerHTML='<div class="vzip-media-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="vzip-media-edit-title"><h3 id="vzip-media-edit-title">🎧 이 녹음의 감상 기록</h3><p class="muted">녹음·영상 한 개마다 곡과 만족도, 느낀 점을 따로 저장해요.</p><label>파일 이름<input name="name" type="text" required></label><label>곡 선택<select name="song"></select></label><label>목록에 없는 곡 직접 입력<input name="customSong" type="text" placeholder="곡명을 입력하면 새 곡으로 등록돼요"></label><p class="muted" data-date-origin></p><label>녹음 날짜<input name="date" type="date" required></label><label>이번 녹음 만족도<select name="rating"><option value="">평가하지 않음</option><option value="1">💜 1점</option><option value="2">💜 2점</option><option value="3">💜 3점</option><option value="4">💜 4점</option><option value="5">💜 5점</option></select></label><label>내가 듣기엔 어땠나요?<textarea name="review" rows="5" maxlength="3000" placeholder="호흡, 음정, 감정 표현, 잘된 부분과 다음에 고칠 점을 적어보세요."></textarea></label><div class="buttons"><button type="button" class="btn secondary" data-cancel>취소</button><button type="button" class="btn" data-save>변경 저장</button></div><p role="status" class="muted" data-error></p></div>';document.body.append(modal);
const name=modal.querySelector('[name=name]'),song=modal.querySelector('[name=song]'),dateInput=modal.querySelector('[name=date]'),customSong=modal.querySelector('[name=customSong]'),err=modal.querySelector('[data-error]');name.value=item.name||'';song.add(new Option('곡 미지정',''));songs().forEach(x=>song.add(new Option(x.title+(x.show?' — '+x.show:''),x.id)));song.value=item.songId||'';if(item.songId&&!songs().some(x=>x.id===item.songId)&&item.song){song.add(new Option(item.song+' (기록에 연결됨)',item.songId));song.value=item.songId}if(!item.songId&&item.song)customSong.value=item.song;song.addEventListener('change',()=>{if(song.value)customSong.value='' });dateInput.value=item.recordedDate||new Date(item.created||Date.now()).toLocaleDateString('sv-SE');
modal.querySelector('[data-date-origin]').textContent=item.dateSource==='metadata'?'파일 메타데이터에서 가져온 날짜예요. 아래에서 수정할 수 있어요.':item.dateSource==='file-modified'?'녹음 날짜 정보가 없어 파일 수정일을 사용했어요. 아래에서 수정할 수 있어요.':'녹음 날짜를 직접 수정할 수 있어요.';
const ratingInput=modal.querySelector('[name=rating]'),reviewInput=modal.querySelector('[name=review]');ratingInput.value=item.rating?String(item.rating):'';reviewInput.value=item.review||'';
const previousFocus=trigger||document.activeElement;
const close=()=>{modal.remove();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})};
modal.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();close();return}
 if(event.key!=='Tab')return;
 const focusable=[...modal.querySelectorAll('button:not(:disabled),input,select')],first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});
name.focus();modal.querySelector('[data-cancel]').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});
modal.querySelector('[data-save]').onclick=async()=>{if(!name.value.trim()){err.textContent='파일 이름을 입력해 주세요.';return}const d=new Date(dateInput.value+'T12:00:00');if(!dateInput.value||Number.isNaN(+d)){err.textContent='날짜를 확인해 주세요.';return}let selected=songs().find(x=>x.id===song.value);if(!selected&&song.value===item.songId&&item.song)selected={id:item.songId,title:item.song,show:''};const typed=customSong.value.trim();if(typed){const catalog=JSON.parse(localStorage.getItem(key)||'{}');catalog.songs=catalog.songs||[];selected=catalog.songs.find(x=>x.title.trim().toLowerCase()===typed.toLowerCase());if(!selected){selected={id:crypto.randomUUID?.()||String(Date.now()),title:typed,show:''};catalog.songs.push(selected);try{localStorage.setItem(key,JSON.stringify(catalog));window.dispatchEvent(new Event('vzip:data-changed'))}catch(e){err.textContent='곡 목록 저장 실패: '+e.message;return}}}const changes={name:name.value.trim(),songId:selected?.id||'',song:selected?(selected.title+(selected.show?' — '+selected.show:'')):'',created:d.getTime(),recordedDate:dateInput.value,dateSource:'manual',rating:ratingInput.value?Number(ratingInput.value):null,review:reviewInput.value.trim()};const button=modal.querySelector('[data-save]');button.disabled=true;try{if(item.cloud)await window.vzipCloudMediaUpdate(item,changes);if(item.local)await localChange(item.id,x=>({...x,...changes}));window.dispatchEvent(new Event('vzip:media-updated'));close();await refresh()}catch(e){err.textContent='수정 실패: '+e.message;button.disabled=false}};
}
async function remove(item){if(!confirm('이 녹음·영상을 영구 삭제할까요? 클라우드와 이 기기에 모두 있으면 둘 다 삭제됩니다.'))return;try{if(item.cloud)await window.vzipCloudMediaDelete(item);if(item.local)await localChange(item.id,()=>null);clearPlayer();window.dispatchEvent(new Event('vzip:media-updated'));await refresh()}catch(e){status.textContent='삭제 실패: '+e.message}}
list.addEventListener('click',async e=>{const b=e.target.closest('button[data-action]');if(!b){if(e.target.closest('.vzip-player,audio,video,input,select,textarea,a,label,button'))return;const row=e.target.closest('.vzip-hub-item');if(row)window.dispatchEvent(new CustomEvent('vzip:compare-open',{detail:{id:row.dataset.id}}));return;}const item=items.find(x=>x.id===b.closest('[data-id]')?.dataset.id);if(!item)return;if(b.dataset.action==='compare')window.dispatchEvent(new CustomEvent('vzip:compare-open',{detail:{id:item.id}}));if(b.dataset.action==='play')await play(item,b.closest('.vzip-hub-item'));if(b.dataset.action==='edit')await edit(item,b);if(b.dataset.action==='delete')await remove(item)});
$('#vzip-hub-reload').onclick=()=>{uploadMessage='';refresh()};
const importHint=document.createElement('p');importHint.className='muted';
importHint.textContent='영상은 음성만 추출해 저장하고, 녹음·촬영 날짜로 자동 정리해요. 날짜는 곡·감상 기록에서 수정할 수 있어요. 여러 파일을 선택하고 파일별 곡을 지정하세요. 파일당 최대 1GB, 25MB 초과 파일은 클라우드 로그인이 필요해요. 업로드 중에는 화면을 유지해 주세요.';
$('#vzip-hub-upload').closest('.vzip-hub-buttons').after(importHint);
const cancelUpload=document.createElement('button');cancelUpload.type='button';cancelUpload.className='btn secondary';
cancelUpload.id='vzip-hub-upload-cancel';cancelUpload.textContent='업로드 취소';cancelUpload.hidden=true;importHint.after(cancelUpload);
function chooseUploadSong(fileName){
 return new Promise(resolve=>{
  const overlay=document.createElement('div');
  overlay.className='vzip-edit-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:100002;background:#0b0b23bd;display:flex;align-items:flex-end;justify-content:center';
  const sheet=document.createElement('div');
  sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','업로드 곡 선택');
  sheet.style.cssText='background:#fff;color:#292439;width:100%;max-width:600px;max-height:85dvh;overflow:auto;border-radius:22px 22px 0 0;padding:22px 18px calc(22px + env(safe-area-inset-bottom))';
  const title=document.createElement('h2');title.textContent='이 파일은 어떤 곡인가요?';
  const file=document.createElement('p');file.className='muted';file.textContent=fileName;
  const label=document.createElement('label');label.textContent='곡 선택 (선택사항)';
  const select=document.createElement('select');select.setAttribute('aria-label','업로드할 곡');
  select.add(new Option('나중에 지정하기',''));
  songs().forEach(x=>select.add(new Option(x.title+(x.show?' — '+x.show:''),x.id)));
  const newLabel=document.createElement('label');newLabel.textContent='새 곡 등록 (선택사항)';
  const custom=document.createElement('input');custom.placeholder='목록에 없는 곡명 입력';custom.maxLength=150;
  select.addEventListener('change',()=>{if(select.value)custom.value=''});
  const error=document.createElement('p');error.className='error';error.setAttribute('role','alert');
  const actions=document.createElement('div');actions.className='buttons';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary';cancel.textContent='취소';
  const start=document.createElement('button');start.type='button';start.className='btn';start.textContent='이 파일 업로드';
  actions.append(cancel,start);sheet.append(title,file,label,select,newLabel,custom,error,actions);overlay.append(sheet);document.body.append(overlay);
  const previous=document.activeElement;let done=false;
  const finish=value=>{if(done)return;done=true;overlay.remove();previous?.focus?.();resolve(value)};
  cancel.onclick=()=>finish(null);
  overlay.onclick=e=>{if(e.target===overlay)finish(null)};
  overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();finish(null)}
   if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===select){e.preventDefault();start.focus()}else if(!e.shiftKey&&document.activeElement===start){e.preventDefault();select.focus()}}
  };
  start.onclick=()=>{
   const typed=custom.value.trim();let selected=songs().find(x=>x.id===select.value);
   if(typed){let catalog;try{catalog=JSON.parse(localStorage.getItem(key)||'{}')}catch{catalog={}}
    catalog.songs=catalog.songs||[];
    selected=catalog.songs.find(x=>x.title?.trim().toLowerCase()===typed.toLowerCase());
    if(!selected){selected={id:crypto.randomUUID(),title:typed,show:''};catalog.songs.push(selected);
     try{localStorage.setItem(key,JSON.stringify(catalog));window.dispatchEvent(new Event('vzip:data-changed'))}
     catch(e){error.textContent='곡 저장 실패: '+e.message;return}
    }
   }
   finish({songId:selected?.id||'',song:selected?(selected.title+(selected.show?' — '+selected.show:'')):''});
  };
  select.focus();
 });
}
const queue=document.createElement('div');queue.id='vzip-hub-upload-queue';cancelUpload.after(queue);
$('#vzip-hub-upload').onchange=async event=>{
 const input=event.target,files=Array.from(input.files||[]);if(!files.length||input.disabled)return;
 input.disabled=true;uploadMessage='';status.textContent='파일 준비 중…';queue.replaceChildren();
 try{
  // Reject unsupported/oversized single inputs before asking for their song.
  if(files.length===1){
   if(!/^(audio|video)\//.test(window.vzipMediaType(files[0])))throw Error('지원하지 않는 형식이에요.');
   if(!files[0].size)throw Error('빈 파일은 가져올 수 없어요.');
   if(files[0].size>25*1024*1024&&!window.vzipCloudSignedIn?.())throw Error('25MB 초과 파일은 클라우드 로그인이 필요해요.');
   if(files[0].size>VzipChunks.MAX_SIZE)throw Error('파일당 최대 1GB까지 가져올 수 있어요.');
  }
  await window.vzipImportBatch(files,{
   host:queue,cancelButton:cancelUpload,
   choose:async batch=>batch.length>1?window.vzipChooseUploadSongs(batch):((chosen)=>chosen?[chosen]:null)(await chooseUploadSong(batch[0].name)),
   onBusy:value=>input.disabled=value,
   onSummary:message=>{uploadMessage=message;status.textContent=message;refresh()},
   importFile:async(file,chosen,progress,signal)=>{
    const type=window.vzipMediaType(file);
    if(!/^(audio|video)\//.test(type))throw Error('지원하지 않는 형식이에요.');
    if(!file.size)throw Error('빈 파일은 가져올 수 없어요.');
    if(file.size>VzipChunks.MAX_SIZE)throw Error('파일당 최대 1GB까지 가져올 수 있어요.');
    if(file.size>25*1024*1024&&!window.vzipCloudSignedIn?.())throw Error('25MB 초과 파일은 클라우드 로그인이 필요해요.');
    const name=file.name.replace(/\.[^.]+$/,'');
    if(window.vzipCloudSignedIn?.()){
     await window.vzipCloudImport(file,{name,type,...chosen},value=>{progress('업로드 '+value+'%');uploadMessage=file.name+' · 업로드 '+value+'%';status.textContent=uploadMessage},
      {signal,onCommit:()=>progress('보관함 연결 중…')});
    }else{
     if(signal.aborted)throw new DOMException('취소','AbortError');
     await window.vzipStorePracticeMedia({id:chosen.id,name,created:file.lastModified||Date.now(),
      type,source:'import',...chosen,blob:file});
     window.dispatchEvent(new Event('vzip:media-updated'));
    }
   }
  });
 }catch(error){uploadMessage='가져오기 실패: '+error.message;status.textContent=uploadMessage}
 finally{input.value='';input.disabled=false}
};

window.addEventListener('vzip:cloud-media-changed',()=>{clearTimeout(window.__vzipHubTimer);window.__vzipHubTimer=setTimeout(refresh,200)});
window.addEventListener('vzip:media-saved',()=>{clearTimeout(window.__vzipHubTimer);window.__vzipHubTimer=setTimeout(refresh,300)});
document.querySelector('button[data-tab="media"]')?.addEventListener('click',refresh);
window.addEventListener('vzip:auth-changed',refresh);
card.querySelectorAll('[data-filter],[data-origin]').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active'))));
window.addEventListener('vzip:route-change',event=>{if(event.detail.tab!=='media')clearPlayer()});
window.addEventListener('pagehide',clearPlayer);
refresh();
})();
