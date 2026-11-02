/* VOCAL.zip — on-device voice/video recorder. Files remain in this browser (IndexedDB). */
(()=>{'use strict';
const $=s=>document.querySelector(s);
const section=$('#practice');
if(!section)return;
const panel=document.createElement('div');
panel.className='card';
panel.id='vzip-recorder';
panel.innerHTML=`<h2>🎙️ 바로 녹음 · 녹화</h2>
<p class="muted">레슨이나 연습 중에 이 화면에서 바로 녹음/녹화할 수 있어요. 파일은 서버에 전송하지 않고 현재 브라우저에만 저장해요.</p>
<div class="two"><div><label for="vzip-kind">기록 방식</label><select id="vzip-kind"><option value="audio">🎤 음성 녹음</option><option value="video">🎬 영상 녹화 (카메라 + 마이크)</option></select></div><div><label for="vzip-title">파일 이름 (선택 · 나중에 수정 가능)</label><input id="vzip-title" placeholder="비워두면 날짜·시간으로 자동 저장"></div></div>
<div class="buttons"><button type="button" class="btn" id="vzip-start">● 녹음 시작</button><button type="button" class="btn danger" id="vzip-stop" disabled>■ 종료하고 저장</button><span id="vzip-timer" class="muted">00:00</span></div>
<video id="vzip-live" playsinline muted autoplay style="display:none;width:100%;max-height:300px;margin-top:12px;border-radius:12px;background:#111"></video>
<p id="vzip-status" class="muted" role="status">시작을 누르면 마이크 또는 카메라 권한을 요청해요.</p>
<div class="vzip-import-box"><h3>📂 예전 녹음·영상 한꺼번에 등록</h3><p class="muted">아이폰 파일 앱이나 사진 보관함에서 여러 개를 선택해 한 번에 저장할 수 있어요. 곡은 나중에 파일별로 수정할 수도 있어요.</p><label for="vzip-import-song">일괄 적용할 곡 (선택)</label><select id="vzip-import-song"><option value="">곡 미지정 · 나중에 연결</option></select><label for="vzip-import-files" class="btn secondary vzip-file-picker">＋ 기존 녹음·영상 여러 개 선택</label><input id="vzip-import-files" type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4,.mov,.webm" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden"><label for="vzip-import-videos" class="btn secondary vzip-file-picker">🎬 사진 앱에서 동영상 선택</label><input id="vzip-import-videos" type="file" accept="video/*,.mov,.mp4" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden"><p id="vzip-import-status" class="muted" role="status">선택한 파일은 이 기기의 브라우저 저장소에 복사돼요. 서버에는 업로드되지 않아요.</p></div><div class="item"><b>내 녹음·영상 보관함</b><p class="muted">녹음을 종료하면 즉시 자동 저장돼요. 곡명과 파일 이름은 나중에 수정할 수 있어요. 다른 기기에서는 보이지 않으며 브라우저 데이터를 지우면 삭제될 수 있어요. 중요한 파일은 다운로드해 보관해 주세요.</p><div id="vzip-library"></div></div>`;
const editor=document.createElement('div');editor.id='vzip-editor';editor.className='vzip-editor';editor.hidden=true;
editor.innerHTML='<div class="vzip-editor-card" role="dialog" aria-modal="true" aria-labelledby="vzip-editor-heading"><h3 id="vzip-editor-heading">녹음 정보 수정</h3><label for="vzip-edit-name">녹음 제목</label><input id="vzip-edit-name" type="text"><label for="vzip-edit-date">녹음·촬영 날짜</label><input id="vzip-edit-date" type="date"><label for="vzip-edit-song">곡 선택</label><select id="vzip-edit-song"></select><label for="vzip-edit-custom">목록에 없는 곡 직접 입력</label><input id="vzip-edit-custom" type="text" placeholder="곡명 입력 시 곡 목록에도 추가돼요"><p class="muted">기존 녹음 파일은 수정되지 않아요.</p><div class="buttons"><button type="button" class="btn secondary" id="vzip-edit-cancel">취소</button><button type="button" class="btn" id="vzip-edit-save">변경 저장</button></div></div>';
document.body.append(editor);
let editingId=null;
const editDate=editor.querySelector('#vzip-edit-date'),editName=editor.querySelector('#vzip-edit-name'),editSong=editor.querySelector('#vzip-edit-song'),editCustom=editor.querySelector('#vzip-edit-custom');
function songCatalog(){try{return JSON.parse(localStorage.getItem('vocal-zip_mvp_v1'))||{songs:[]}}catch{return{songs:[]}}}
function closeEditor(){editor.hidden=true;editingId=null}
editor.querySelector('#vzip-edit-cancel').onclick=closeEditor;
editor.addEventListener('click',e=>{if(e.target===editor)closeEditor()});
async function openEditor(item){editingId=item.id;editName.value=item.name;editDate.value=new Date(item.created||Date.now()).toLocaleDateString('sv-SE');editSong.replaceChildren();editSong.add(new Option('곡 미지정',''));const songs=songCatalog().songs||[];songs.forEach(x=>editSong.add(new Option(x.title+(x.show?' — '+x.show:''),x.id)));editSong.value=item.songId&&songs.some(x=>x.id===item.songId)?item.songId:'';editCustom.value=!item.songId?item.song||'':'';editor.hidden=false;editName.focus()}
editor.querySelector('#vzip-edit-save').onclick=async()=>{if(!editingId)return;const item=await get(editingId);if(!item)return;const name=editName.value.trim();if(!name){editName.focus();status.textContent='녹음 제목을 입력해 주세요.';return}const data=songCatalog(),songs=data.songs||[],custom=editCustom.value.trim();if(custom){let match=songs.find(x=>x.title.trim().toLowerCase()===custom.toLowerCase());if(!match){match={id:crypto.randomUUID?.()||String(Date.now()),title:custom,show:''};songs.push(match);data.songs=songs;try{localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(data))}catch(e){status.textContent='곡 목록 저장 실패: '+e.message;return}}item.songId=match.id;item.song=match.title}else{const match=songs.find(x=>x.id===editSong.value);item.songId=match?.id||'';item.song=match?(match.title+(match.show?' — '+match.show:'')):''}item.name=safeName(name);if(editDate.value){const old=new Date(item.created||Date.now());const parts=editDate.value.split('-').map(Number);const next=new Date(parts[0],parts[1]-1,parts[2],old.getHours(),old.getMinutes(),old.getSeconds());item.created=next.getTime()}try{await put(item);window.dispatchEvent(new CustomEvent('vzip:media-updated',{detail:{id:item.id}}));closeEditor();status.textContent='✓ 녹음 제목과 곡 정보를 저장했어요.';await refresh()}catch(e){status.textContent='수정 실패: '+e.message}};
const target=section.querySelectorAll('.card')[1];section.insertBefore(panel,target||null);
const start=$('#vzip-start'),stop=$('#vzip-stop'),status=$('#vzip-status'),timer=$('#vzip-timer'),live=$('#vzip-live'),list=$('#vzip-library');
let stream=null,recorder=null,chunks=[],started=0,interval=null,recording=false,activeURL=null;
const dbName='vocalzip_media_v1';
function openDb(){return new Promise((ok,no)=>{if(!indexedDB)return no(Error('브라우저 저장소를 사용할 수 없어요.'));const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('recordings'))req.result.createObjectStore('recordings',{keyPath:'id'})};req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error)})}
async function transaction(mode,action){const db=await openDb();try{return await new Promise((ok,no)=>{const tx=db.transaction('recordings',mode),store=tx.objectStore('recordings');let result;const req=action(store);if(req){req.onsuccess=()=>result=req.result;req.onerror=()=>no(req.error)}tx.oncomplete=()=>ok(result);tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error)})}finally{db.close()}}
const all=()=>transaction('readonly',s=>s.getAll());
const put=item=>transaction('readwrite',s=>s.put(item));
const del=id=>transaction('readwrite',s=>s.delete(id));
const get=id=>transaction('readonly',s=>s.get(id));
const fmt=t=>{const n=Math.floor(t/1000);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
function release(){if(interval){clearInterval(interval);interval=null}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}live.pause();live.srcObject=null;live.style.display='none';recording=false;start.disabled=false;stop.disabled=true;timer.textContent='00:00'}
function mime(kind){const candidates=kind==='video'?['video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];return candidates.find(x=>MediaRecorder.isTypeSupported(x))||''}
function suffix(type){return type.includes('mp4')?'.mp4':type.includes('ogg')?'.ogg':type.startsWith('video/')?'.webm':'.webm'}
function safeName(s){return (s||'VOCAL.zip 기록').replace(/[\\/:*?"<>|]/g,'_').slice(0,70)}
async function refresh(){try{const items=(await all()).sort((a,b)=>b.created-a.created);list.innerHTML='';if(!items.length){list.innerHTML='<p class="muted">아직 저장된 녹음이 없어요.</p>';return}for(const item of items){const div=document.createElement('div');div.className='item';const label=document.createElement('div');label.className='mini';label.textContent=new Date(item.created).toLocaleString('ko-KR')+' · '+(item.song||'곡 미지정')+' · '+(item.type.startsWith('video/')?'영상':'음성');const name=document.createElement('b');name.textContent=item.name;const controls=document.createElement('div');controls.className='buttons';for(const [action,title] of [['play','▶ 재생'],['download','↓ 다운로드'],['edit','✎ 날짜·곡명·제목 수정'],['delete','삭제']]){const b=document.createElement('button');b.type='button';b.className='smallbtn';b.textContent=title;b.dataset.action=action;b.dataset.id=item.id;controls.append(b)}div.append(name,label,controls);list.append(div)}}catch(e){list.textContent='이 브라우저에서 녹음 보관함을 사용할 수 없어요: '+e.message}}
const importInput=$('#vzip-import-files'),videoInput=$('#vzip-import-videos'),importSong=$('#vzip-import-song'),importStatus=$('#vzip-import-status');
function updateImportSongs(){const current=importSong.value;const songs=songCatalog().songs||[];importSong.replaceChildren(new Option('곡 미지정 · 나중에 연결',''));songs.forEach(song=>importSong.add(new Option(song.title+(song.show?' — '+song.show:''),song.id)));if(songs.some(song=>song.id===current))importSong.value=current}
importSong.addEventListener('focus',updateImportSongs);
async function importSelected(input){
 const files=Array.from(input.files||[]);if(!files.length)return;
 const allowed=files.filter(f=>f.type.startsWith('audio/')||f.type.startsWith('video/')||/\.(m4a|mp3|wav|mp4|mov|webm|aac|ogg|flac)$/i.test(f.name));
 const skipped=files.length-allowed.length;
 if(!allowed.length){importStatus.textContent='음성 또는 동영상 파일을 선택해 주세요.';input.value='';return}
 const songs=songCatalog().songs||[],song=songs.find(x=>x.id===importSong.value);
 const cloud=!!window.vzipCloudSignedIn?.();
 if(!cloud&&allowed.some(f=>f.type.startsWith('video/')||/\.(mov|mp4|webm)$/i.test(f.name))){
  if(!confirm('클라우드에 로그인하지 않았어요. 동영상을 이 아이폰 브라우저에만 저장할까요? 큰 영상은 저장 공간 부족으로 실패할 수 있어요.\n\n취소하면 관리 탭에서 로그인한 뒤 클라우드로 바로 업로드할 수 있어요.')){input.value='';return}
 }
 let success=0,failed=0,errors=[];input.disabled=true;
 try{
  for(const file of allowed){
   const n=success+failed+1;
   importStatus.textContent='파일 '+n+'/'+allowed.length+' · '+file.name+' 준비 중…';
   try{
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    const type=file.type||(ext==='mov'?'video/quicktime':ext==='mp4'?'video/mp4':ext==='m4a'?'audio/mp4':ext==='mp3'?'audio/mpeg':ext==='wav'?'audio/wav':'application/octet-stream');
    const name=safeName(file.name.replace(/\.[^.]+$/,''));
    if(cloud){
     await window.vzipCloudImport(file,{name,songId:song?.id||'',song:song?(song.title+(song.show?' — '+song.show:'')):'',type},percent=>{
      importStatus.textContent='☁️ '+n+'/'+allowed.length+' · '+file.name+' '+percent+'% 업로드 중…';
     });
    }else{
     await put({id:crypto.randomUUID?.()||String(Date.now())+'-'+n,name,created:file.lastModified||Date.now(),importedAt:Date.now(),songId:song?.id||'',song:song?(song.title+(song.show?' — '+song.show:'')):'',type,blob:file});
    }
    success++;
   }catch(e){failed++;errors.push(file.name+': '+e.message);importStatus.textContent='실패 '+failed+'개 · '+e.message}
  }
 }finally{input.disabled=false;input.value=''}
 importStatus.textContent='✓ '+success+'개 '+(cloud?'클라우드 업로드':'기기 저장')+' 완료'+(failed?' · 실패 '+failed+'개: '+errors.slice(0,2).join(' / '):'')+(skipped?' · 형식 제외 '+skipped+'개':'')+(cloud?' · 관리 → 클라우드 녹음·영상 가져오기로 이 기기 보관함에 내려받을 수 있어요.':'');
 await refresh();
}
importInput.addEventListener('change',()=>importSelected(importInput));
videoInput.addEventListener('change',()=>importSelected(videoInput));
updateImportSongs();
start.onclick=async()=>{if(recording)return;if(!window.isSecureContext){status.textContent='HTTPS로 접속해야 마이크·카메라를 사용할 수 있어요.';return}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status.textContent='이 브라우저에서는 직접 녹음·녹화를 지원하지 않아요.';return}
start.disabled=true;const kind=$('#vzip-kind').value;try{stream=await navigator.mediaDevices.getUserMedia(kind==='video'?{audio:true,video:{facingMode:'user'}}:{audio:true});if(kind==='video'){live.srcObject=stream;live.style.display='block';live.play().catch(()=>{})}const type=mime(kind);recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onerror=e=>{status.textContent='녹음 중 오류가 발생했어요: '+(e.error?.message||'알 수 없음')};recorder.onstop=async()=>{const actualType=recorder.mimeType||type||(kind==='video'?'video/mp4':'audio/mp4');const blob=new Blob(chunks,{type:actualType});const chosen=$('#practice-song')?.selectedOptions?.[0];const song=chosen?.value?chosen.textContent:'';const songId=$('#practice-song')?.value||'';const name=safeName($('#vzip-title').value.trim()||'녹음 '+new Date().toLocaleString('ko-KR'));release();if(!blob.size){status.textContent='녹음 데이터가 비어 있어 저장하지 않았어요.';return}try{const mediaId=crypto.randomUUID?.()||String(Date.now());await put({id:mediaId,name,created:Date.now(),song,songId,type:actualType,blob});status.textContent='✓ 녹음이 자동 저장됐어요. 곡명·제목은 보관함에서 수정할 수 있어요.';window.dispatchEvent(new CustomEvent('vzip:media-saved',{detail:{id:mediaId}}));await refresh()}catch(e){status.textContent='브라우저 저장 실패: '+e.message+' (저장 공간이나 시크릿 모드를 확인해 주세요.)';const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+suffix(actualType);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}};recorder.start(1000);recording=true;stop.disabled=false;started=Date.now();timer.textContent='00:00';interval=setInterval(()=>timer.textContent=fmt(Date.now()-started),500);status.textContent='녹음 중이에요. 종료하고 저장을 누르면 보관함에 들어가요.'}catch(e){release();status.textContent=e.name==='NotAllowedError'?'마이크/카메라 접근이 거부됐어요. 브라우저 권한을 허용해 주세요.':'시작할 수 없어요: '+e.message}};
stop.onclick=()=>{if(!recorder||recorder.state==='inactive')return;stop.disabled=true;status.textContent='파일 저장 중…';try{recorder.stop()}catch(e){release();status.textContent='녹음을 종료하지 못했어요: '+e.message}};
list.onclick=async e=>{const b=e.target.closest('button[data-action]');if(!b)return;const id=b.dataset.id,action=b.dataset.action;if(action==='delete'){if(!confirm('이 녹음·영상 파일을 삭제할까요?'))return;await del(id);await refresh();return}const item=await get(id);if(!item?.blob){status.textContent='원본 파일을 찾을 수 없어요.';return}if(action==='edit'){await openEditor(item);return}if(action==='download'){const url=URL.createObjectURL(item.blob),a=document.createElement('a');a.href=url;a.download=safeName(item.name)+suffix(item.type);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return}if(activeURL){URL.revokeObjectURL(activeURL);activeURL=null}list.querySelectorAll('.vzip-player').forEach(n=>n.remove());const el=document.createElement(item.type.startsWith('video/')?'video':'audio');el.className='vzip-player';el.controls=true;el.playsInline=true;el.style.width='100%';el.style.marginTop='8px';activeURL=URL.createObjectURL(item.blob);el.src=activeURL;b.closest('.item').append(el);el.play().catch(()=>{})};
window.addEventListener('pagehide',()=>{if(recorder?.state==='recording'){try{recorder.stop()}catch{}}if(stream)stream.getTracks().forEach(t=>t.stop());if(activeURL)URL.revokeObjectURL(activeURL)});
refresh();
})();