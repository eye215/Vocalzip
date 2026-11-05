/* VOCAL.zip v1.3 — authenticated cloud sync. Never erase local records automatically. */
(()=>{'use strict';
const root=document.querySelector('#vzip-cloud-root');if(!root)return;
const url='https://chxnbtiyuyhiywzeshis.supabase.co';
const key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeG5idGl5dXloaXl3emVzaGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDA0ODcsImV4cCI6MjEwOTE3NjQ4N30.65LSQMuaq8MQOpFUjCSyRT4ZITtNxKF3c_xa_ZVEi_E';
const dataKey='vocal-zip_mvp_v1',mediaDb='vocalzip_media_v1';
const $=s=>document.querySelector(s);
root.insertAdjacentHTML('beforeend',`<div class="cloud-controls">
<div id="cloud-signed-out"><label for="cloud-email">이메일</label><input id="cloud-email" type="email" autocomplete="email" placeholder="이메일 주소"><label for="cloud-password">비밀번호 (8자 이상)</label><div class="vzip-password-row"><input id="cloud-password" type="password" autocomplete="current-password" minlength="8" placeholder="비밀번호 입력"><button type="button" class="smallbtn" id="cloud-show-password" aria-label="비밀번호 표시">보기</button></div><div class="cloud-actions"><button class="btn" type="button" id="cloud-login">로그인</button><button class="btn secondary" type="button" id="cloud-signup">처음 가입하기</button></div><p class="muted">이미 이메일 링크로 가입했다면 비밀번호 재설정을 이용해 비밀번호를 만들 수 있어요.</p><button class="smallbtn" type="button" id="cloud-reset">비밀번호 재설정 메일 받기</button></div>
<div id="cloud-signed-in" hidden><p id="cloud-user" class="muted"></p><p class="muted">기기와 클라우드의 기록을 항목별로 합쳐 저장해요. 어느 쪽 기록도 덮어쓰거나 지우지 않아요.</p><div class="cloud-actions"><button type="button" class="btn" id="cloud-upload">지금 동기화 (기기·클라우드 합치기)</button><button type="button" class="btn secondary" id="cloud-download">클라우드 기록 합쳐서 불러오기</button><button type="button" class="btn secondary" id="cloud-media-upload">음원 클라우드 백업</button><button type="button" class="btn secondary" id="cloud-media-download">클라우드 음원 가져오기</button><button type="button" class="smallbtn" id="cloud-logout">로그아웃</button></div></div>
<p id="cloud-status" role="status" class="muted">연결 확인 중…</p></div>`);

// Dedicated full-screen authentication view. Keep local data untouched.
const authStyle=document.createElement('style');
authStyle.textContent=`#vzip-auth-screen{position:fixed;inset:0;z-index:99999;overflow-y:auto;background:radial-gradient(ellipse at 80% 5%,#283060 0%,transparent 53%),linear-gradient(160deg,#101026,#1c183a 65%,#11152c);color:#f7f4ff;padding:env(safe-area-inset-top) 22px calc(35px + env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif}#vzip-auth-screen[hidden]{display:none!important}#vzip-auth-screen .vzip-auth-wrap{max-width:430px;margin:0 auto;padding-top:max(32px,7vh)}#vzip-auth-screen .vzip-auth-logo{font-size:38px;font-weight:850;letter-spacing:-1.6px;margin-bottom:6px}#vzip-auth-screen .vzip-auth-logo span{color:#c5a2ff}#vzip-auth-screen .vzip-auth-sub{color:#b6b4d3;margin-bottom:35px;font-size:14px}#vzip-auth-screen .vzip-auth-card{background:#ffffff0b;border:1px solid #ffffff26;border-radius:25px;padding:24px 21px;box-shadow:0 16px 50px #0003}#vzip-auth-screen h2{font-size:23px;color:#fff;margin:0 0 8px}#vzip-auth-screen .vzip-auth-note{color:#b8b6d0;font-size:13px;line-height:1.65;margin:0 0 18px}#vzip-auth-screen label{color:#f5f3ff;font-size:13px}#vzip-auth-screen input{background:#0c1029;border:1px solid #ffffff35;color:#fff;border-radius:13px;min-height:50px}#vzip-auth-screen button{cursor:pointer}#vzip-auth-screen .btn{min-height:49px}#vzip-auth-screen .cloud-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}#vzip-auth-screen .cloud-actions .btn{font-size:14px;padding:10px 7px}#vzip-auth-screen .muted{color:#b6b5d1}#vzip-auth-screen #cloud-reset{color:#ddd0ff;background:#ffffff12;border:1px solid #ffffff35;border-radius:11px;padding:11px}#vzip-auth-message{color:#dcd8ff;background:#ffffff10;border-radius:12px;padding:13px;margin-top:17px;font-size:13px;line-height:1.6}body.vzip-auth-locked{overflow:hidden}body.vzip-auth-locked>.app{pointer-events:none}#vzip-auth-screen .vzip-password-row{display:grid;grid-template-columns:minmax(0,1fr) 62px;gap:8px}#vzip-auth-screen .vzip-password-row input{min-width:0}#vzip-auth-screen .vzip-password-row button{color:white;background:#ffffff20;border:1px solid #ffffff35;border-radius:10px}`;
document.head.appendChild(authStyle);
const authScreen=document.createElement('div');
authScreen.id='vzip-auth-screen';
authScreen.innerHTML='<div class="vzip-auth-wrap"><div class="vzip-auth-logo">VOCAL<span>.zip ♫</span></div><p class="vzip-auth-sub">나의 보컬 성장 기록</p><div class="vzip-auth-card"><h2>다시 만나서 반가워요 💜</h2><p class="vzip-auth-note">로그인하면 레슨과 연습 기록을 이어서 관리할 수 있어요.</p><div id="vzip-auth-fields"></div><p id="vzip-auth-message" role="status">로그인 상태를 확인하고 있어요…</p></div></div>';
document.body.appendChild(authScreen);
authScreen.querySelector('#vzip-auth-fields').appendChild(root.querySelector('#cloud-signed-out'));
// After moving the form into the full-screen login, query it from its actual location.
const authField=selector=>authScreen.querySelector(selector);
function updateAuthScreen(){document.getElementById('vzip-boot-cover')?.remove();const signedIn=!!user;authScreen.hidden=signedIn;document.body.classList.toggle('vzip-auth-locked',!signedIn);const form=document.getElementById('cloud-signed-out');if(form)form.hidden=signedIn;}

const status=$('#cloud-status');let client,user=null,ready=false,uploadTimer=null,busy=false;
function say(message){status.textContent=message;const a=document.querySelector('#vzip-auth-message');if(a)a.textContent=message}
function localData(){try{return JSON.parse(localStorage.getItem(dataKey)||'null')}catch{return null}}
function count(data){return (data?.lessons?.length||0)+(data?.practices?.length||0)+(data?.assignments?.length||0)}
function mediaExtension(type){
 return ({'audio/mp4':'m4a','video/mp4':'mp4','video/quicktime':'mov','audio/mpeg':'mp3',
 'audio/wav':'wav','audio/x-wav':'wav','audio/aac':'aac','audio/ogg':'ogg','audio/flac':'flac',
 'audio/webm':'webm','video/webm':'webm'})[(type||'').split(';')[0].toLowerCase()]||'bin';
}
function localMedia(){return new Promise((resolve,reject)=>{const req=indexedDB.open(mediaDb,1);req.onupgradeneeded=()=>req.result.createObjectStore('recordings',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('recordings','readonly'),get=tx.objectStore('recordings').getAll();get.onsuccess=()=>resolve(get.result||[]);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close()}})}
async function remoteData(){const {data,error}=await client.from('vocal_data').select('payload,updated_at').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}
/* Sync merges device and cloud records by id (data-merge.js): nothing on either side is lost;
   only records deleted on purpose (tombstones) disappear. The device copy before any local
   rewrite is kept as vzip_before_cloud_<time> (last 5). */
const Merge=window.VzipDataMerge;
let syncAgain=false;
function snapshot(data){if(!data)return;try{localStorage.setItem('vzip_before_cloud_'+Date.now(),JSON.stringify(data));const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^vzip_before_cloud_\d+$/.test(k||''))keys.push(k)}keys.sort().slice(0,-5).forEach(k=>localStorage.removeItem(k))}catch{}}
async function sync({silent=false,reload=false}={}){
 if(!user)return;if(busy){syncAgain=true;return}
 const local=localData();busy=true;
 try{
  const row=await remoteData(),remote=row?.payload&&Merge.valid(row.payload)?row.payload:null;
  if(!local&&!remote){say('아직 저장된 기록이 없어요.');return}
  const merged=remote?Merge.merge(local||{},remote).data:local;
  if(!Merge.valid(merged))throw Error('기록 형식을 확인하지 못했어요.');
  if(!local||!Merge.same(merged,local)){snapshot(local);localStorage.setItem(dataKey,JSON.stringify(merged));window.dispatchEvent(new CustomEvent('vzip:data-changed',{detail:{source:'cloud-merge'}}))}
  if(!remote||!Merge.same(merged,remote)){const {error}=await client.from('vocal_data').upsert({user_id:user.id,payload:merged,updated_at:new Date().toISOString()});if(error)throw error}
  localStorage.setItem('vzip_cloud_linked_user',user.id);ready=true;
  say('✓ 이 기기와 클라우드 기록을 합쳐 저장했어요 · '+Merge.count(merged)+'건'+(silent?' (자동 동기화)':''));
  if(reload&&local&&!Merge.same(merged,local))setTimeout(()=>location.reload(),650);
 }catch(e){say('동기화 실패: '+e.message+' · 기록은 그대로 있어요.')}
 finally{busy=false;if(syncAgain){syncAgain=false;setTimeout(()=>sync({silent:true}),300)}}
}
async function upload(silent=false){return sync({silent})}
async function download(){return sync({reload:true})}
async function backupVideoAudio(item,blob,onProgress){
 const prepared=await window.vzipPrepareMedia(new File([blob],item.name+'.'+mediaExtension(item.type),{type:item.type,lastModified:item.created||Date.now()}));
 try{
  const info={...item,...prepared.metadata,id:item.id,type:prepared.file.type};
  if(item.dateSource==='manual')Object.assign(info,{created:item.created,recordedDate:item.recordedDate,dateSource:'manual'});
  return await window.vzipCloudImport(prepared.file,info,onProgress);
 }finally{await prepared.dispose()}
}
async function uploadMedia(){if(!user||busy)return;busy=true;try{const items=await localMedia();if(!items.length)return say('이 기기에 음원이 없어요.');if(!confirm(items.length+'개 파일을 비공개 클라우드 저장소에 백업할까요? 영상은 용량에 따라 시간이 걸릴 수 있어요.'))return;const remotePaths=new Map((await window.vzipCloudMediaList()).map(item=>[item.id,item.path]));let ok=0,fail=0;for(const item of items){say('음원 업로드 '+(ok+fail+1)+'/'+items.length+'…');try{item.blob=window.vzipMediaBlob(item);if(!item.blob)throw Error('원본 파일이 없어요.');if((item.type||item.blob.type).startsWith('video/')){await backupVideoAudio(item,item.blob,p=>say('음원 백업 '+p+'%'));ok++;continue}if(item.blob.size>50*1024*1024||window.VzipR2?.enabled()){await window.vzipCloudImport(new File([item.blob],item.name+'.'+mediaExtension(item.type),{type:item.type}),{...item,id:item.id},p=>say('대용량 백업 '+p+'%'));ok++;continue}const ext=mediaExtension(item.blob.type||item.type);const path=remotePaths.get(item.id)||user.id+'/'+encodeURIComponent(item.id)+'.'+ext;const {error}=await client.storage.from('vocal-recordings').upload(path,item.blob,{upsert:true,contentType:item.blob.type||item.type||'application/octet-stream'});if(error)throw error;const meta={id:item.id,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,recordedDate:item.recordedDate||'',dateSource:item.dateSource||'',originalMedia:item.originalMedia||null,audioExtraction:item.audioExtraction||null,type:item.blob.type||item.type,source:item.source||'import',durationSeconds:item.durationSeconds||0,rating:item.rating??null,review:item.review||'',path};const {error:metaError}=await client.from('vocal_media').upsert({user_id:user.id,id:item.id,metadata:meta,updated_at:new Date().toISOString()});if(metaError)throw metaError;ok++;window.dispatchEvent(new Event('vzip:cloud-media-changed'))}catch(e){fail++;say('업로드 오류: '+e.message)}}say('✓ 음원 백업 '+ok+'개 성공'+(fail?', '+fail+'개 실패':'')+'. 원본은 이 기기에 남아 있어요.')}catch(e){say('녹음 백업 실패: '+e.message)}finally{busy=false}}
async function downloadMedia(){if(!user||busy)return;busy=true;try{const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',user.id);if(error)throw error;if(!data?.length)return say('클라우드에 백업된 녹음이 없어요.');const existing=new Set((await localMedia()).map(x=>x.id));const remoteMissing=data.map(x=>x.metadata).filter(x=>!existing.has(x.id));const missing=remoteMissing.filter(x=>x.storageVersion!==2);if(!missing.length)return say(remoteMissing.length?'대용량 파일은 보관함에서 바로 스트리밍으로 재생할 수 있어요.':'이 기기에 모든 녹음이 이미 있어요.');if(!confirm(missing.length+'개 음원을 이 기기에 다운로드해 보관할까요?'))return;let ok=0,fail=0;for(const meta of missing){say('녹음 가져오는 중 '+(ok+fail+1)+'/'+missing.length);try{const {data:blob,error:err}=await client.storage.from('vocal-recordings').download(meta.path);if(err)throw err;await window.vzipStorePracticeMedia({...meta,blob});ok++}catch{fail++}}say('✓ '+ok+'개 가져오기 완료'+(fail?', '+fail+'개 실패':'')+'. 보관함을 다시 열어 확인해 주세요.')}catch(e){say('녹음 가져오기 실패: '+e.message)}finally{busy=false}}
async function autoUploadMedia(id){if(!user||!ready)return;if(window.VZ?.media?.backupLocal)return;/* the v6 app uploads device files itself (resumable queue) */try{const item=(await localMedia()).find(x=>x.id===id);if(!item)return;const blob=window.vzipMediaBlob(item);if(!blob)throw Error('원본 파일이 없어요.');if((item.type||blob.type).startsWith('video/')){await backupVideoAudio(item,blob);return}if(blob.size>50*1024*1024||window.VzipR2?.enabled()){await window.vzipCloudImport(new File([blob],item.name+'.'+mediaExtension(item.type),{type:item.type}),{...item,id:item.id});return}const ext=mediaExtension(blob.type);const existing=(await window.vzipCloudMediaList()).find(remote=>remote.id===item.id);const path=existing?.path||user.id+'/'+encodeURIComponent(item.id)+'.'+ext;const {error}=await client.storage.from('vocal-recordings').upload(path,blob,{upsert:true,contentType:blob.type||'application/octet-stream'});if(error)throw error;const {error:metaError}=await client.from('vocal_media').upsert({user_id:user.id,id:item.id,metadata:{id:item.id,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,recordedDate:item.recordedDate||'',dateSource:item.dateSource||'',originalMedia:item.originalMedia||null,audioExtraction:item.audioExtraction||null,type:blob.type,source:item.source||'import',durationSeconds:item.durationSeconds||0,rating:item.rating??null,review:item.review||'',path},updated_at:new Date().toISOString()});if(metaError)throw metaError;window.dispatchEvent(new Event('vzip:cloud-media-changed'));say('✓ 새 녹음이 이 기기와 클라우드에 저장됐어요.')}catch(e){say('녹음은 이 기기에 저장됐지만 클라우드 백업 실패: '+e.message+'. 다시 백업해 주세요.')}}
window.addEventListener('vzip:media-updated',async e=>{if(!user||!e.detail?.id)return;try{const item=(await localMedia()).find(x=>x.id===e.detail.id);if(!item)return;const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',user.id).eq('id',item.id).maybeSingle();if(error||!data)return;const metadata={...data.metadata,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,recordedDate:item.recordedDate||'',dateSource:item.dateSource||'',type:item.type,rating:item.rating??null,review:item.review||''};const {error:err}=await client.from('vocal_media').update({metadata,updated_at:new Date().toISOString()}).eq('id',item.id).eq('user_id',user.id);if(err)throw err}catch(err){say('기기에서 수정 완료 · 클라우드 정보 반영 실패: '+err.message)}});
window.addEventListener('vzip:media-saved',e=>{if(e.detail?.id)autoUploadMedia(e.detail.id)});

/* Each >50MiB original is stored as independent <=24MiB objects, one metadata row. */
let mediaImportActive=false;
const mediaPageId=crypto.randomUUID();
const pendingKey='vzip_pending_media_parts_v1';
function pendingUploads(){try{return JSON.parse(localStorage.getItem(pendingKey)||'[]')}catch{return []}}
function journal(entry){
 const entries=pendingUploads().filter(x=>x.id!==entry.id);entries.push(entry);
 localStorage.setItem(pendingKey,JSON.stringify(entries));
}
function forget(id){localStorage.setItem(pendingKey,JSON.stringify(pendingUploads().filter(x=>x.id!==id)))}
async function cleanupPending(owner){
 for(const entry of pendingUploads().filter(x=>x.owner===owner)){
  if(!navigator.locks?.request&&entry.page!==mediaPageId)continue;
  const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',entry.id).maybeSingle();
  if(error||user?.id!==owner)continue;
  // A committed row wins after a lost response or a page close during commit.
  if(data?.metadata){forget(entry.id);continue}
  const {error:removeError}=await client.storage.from('vocal-recordings').remove(entry.paths);
  if(!removeError)forget(entry.id);
 }
}
async function importMedia(file,info={},onProgress,options={}){
 if(!client||!user)throw Error('클라우드 로그인이 필요해요. 설정에서 로그인해 주세요.');
 if(!file||file.size<=0)throw Error('빈 파일은 업로드할 수 없어요.');
 if((window.vzipMediaType?.(file)||file.type||'').startsWith('video/'))throw Error('영상은 음원으로 추출한 뒤 저장해 주세요.');
 if(file.size>VzipChunks.MAX_SIZE)throw Error('파일당 최대 1GB까지 업로드할 수 있어요.');
 if(mediaImportActive)throw Error('다른 파일을 업로드하고 있어요. 완료하거나 취소한 뒤 다시 선택해 주세요.');
 const owner=user.id,controller=new AbortController(),signal=controller.signal;
 const cancel=()=>controller.abort(),authChanged=()=>{if(user?.id!==owner)controller.abort()};
 const aborted=()=>{if(signal.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');if(user?.id!==owner)throw Error('로그인이 변경되었어요. 다시 로그인해 주세요.')};
 if(options.signal?.aborted)cancel();options.signal?.addEventListener('abort',cancel);
 window.addEventListener('vzip:auth-changed',authChanged);
 mediaImportActive=true;let id,committing=false,committed=false,r2=null;
 try{
  aborted();
  await cleanupPending(owner);aborted();
  const type=window.vzipMediaType?.(file)||file.type||info.type||'application/octet-stream';
  id=info.id||crypto.randomUUID();
  if(!/^[a-z0-9_-]{1,200}$/i.test(id))throw Error('잘못된 파일 ID예요.');
  if(info.id){
   const {data:existing,error:lookupError}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',id).maybeSingle();
   if(lookupError)throw lookupError;aborted();
   if(existing?.metadata){onProgress?.(100);return {...existing.metadata,id}}
  }
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  // R2 (when the owner has set it up, r2-config.js) replaces the Supabase upload; the record stays in vocal_media.
  if(await window.VzipR2?.ready?.()){r2=await window.VzipR2.upload(file,{mediaId:id,type,signal,onProgress:p=>onProgress?.(Math.min(99,p))});aborted()}
  const multipart=!r2&&file.size>50*1024*1024;
  const parts=multipart?Array.from({length:Math.ceil(file.size/VzipChunks.PART_SIZE)},(_,index)=>({
   path:owner+'/'+id+'/part-'+String(index).padStart(4,'0'),
   size:Math.min(VzipChunks.PART_SIZE,file.size-index*VzipChunks.PART_SIZE)
  })):[{path:owner+'/'+id+'.'+ext,size:file.size}];
  if(!r2)journal({id,owner,page:mediaPageId,paths:parts.map(x=>x.path),created:Date.now()});
  if(!r2&&!window.tus?.Upload)throw Error('업로드 모듈을 불러오지 못했어요. 새로고침해 주세요.');
  let offset=0;
  for(const part of r2?[]:parts){
  const {data:session,error:sessionError}=await client.auth.getSession();aborted();
  if(sessionError||!session?.session?.access_token)throw Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
   aborted();
   const path=part.path,piece=multipart?file.slice(offset,offset+part.size,type):file;
  await new Promise((resolve,reject)=>{
   let upload=null,settled=false;
   const finish=(error)=>{
    if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);
    upload=null;error?reject(error):resolve();
   };
   const cancel=()=>{
    if(settled)return;
    const task=upload;
    // Do not retain this File while automatic retries are pending after cancellation.
    try{Promise.resolve(task?.abort(false)).catch(()=>{})}catch{}
    finish(new DOMException('업로드를 취소했어요.','AbortError'));
   };
   signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted){cancel();return}
   try{
    upload=new window.tus.Upload(piece,{
     endpoint:'https://chxnbtiyuyhiywzeshis.storage.supabase.co/storage/v1/upload/resumable',
     headers:{authorization:'Bearer '+session.session.access_token,apikey:key},
     uploadDataDuringCreation:false,removeFingerprintOnSuccess:true,
     chunkSize:6*1024*1024,retryDelays:[0,1000,3000,5000,10000],
     storeFingerprintForResuming:false,
     metadata:{bucketName:'vocal-recordings',objectName:path,contentType:type,cacheControl:'3600'},
     onError:error=>finish(error),onSuccess:()=>finish(),
     onProgress:(sent,total)=>{if(!settled&&total>0)onProgress?.(Math.min(99,Math.round((offset+(sent/total)*part.size)/file.size*100)))}
    });
    upload.start();
   }catch(error){finish(error)}
  });
   offset+=part.size;
  }
  aborted();
  options.onCommit?.();committing=true;
  const metadata={id,name:info.name||file.name.replace(/\.[^.]+$/,''),song:info.song||'',songId:info.songId||'',
   created:info.created||file.lastModified||Date.now(),dateTag:info.dateTag||'',recordedDate:info.recordedDate||'',dateSource:info.dateSource||'file-modified',originalMedia:info.originalMedia||null,audioExtraction:info.audioExtraction||null,type,durationSeconds:Number(info.durationSeconds)||0,
   source:info.source||'import',size:file.size,
   // Import facts from the import hub (source, original name, fingerprint) stay with the file.
   ...Object.fromEntries(['sourceType','originalFilename','fileHash','importedAt','recordedAtSource','occasion'].filter(k=>info[k]!=null&&info[k]!=='').map(k=>[k,info[k]])),
   ...(r2?{storageProvider:'r2',r2Key:r2.key}:multipart?{storageVersion:2,parts}:{path:parts[0].path})};
  const {error}=await client.from('vocal_media').upsert({id,user_id:owner,metadata,updated_at:new Date().toISOString()});
  // Success means the row is really there: a lost reply may hide a write that went through, and a reported success is checked.
  const {data:check,error:checkError}=await client.from('vocal_media').select('id').eq('user_id',owner).eq('id',id).maybeSingle();
  if(checkError||!check){
   // Never delete the uploaded file here: it is kept and noted so it can be linked again later without uploading.
   if(r2)orphan({id,key:r2.key,size:file.size,name:metadata.name,fileHash:metadata.fileHash||'',reason:(error||checkError)?.message||'row missing'});
   committing=false;r2=null;
   throw Error('보관함 연결을 확인하지 못했어요'+(error?': '+error.message:'')+'. 올린 파일은 지우지 않았어요.');
  }
  committed=true;forget(id);
  if(user?.id!==owner)throw Error('로그인이 변경되어 현재 화면에 파일을 연결하지 않았어요. 원래 계정의 보관함에서 확인해 주세요.');
  onProgress?.(100);window.dispatchEvent(new Event('vzip:cloud-media-changed'));
  return metadata;
 }catch(error){
  // Keep the journal if commit outcome is uncertain; next upload checks the row first.
  if(id&&!committing&&!committed&&user?.id===owner){
   try{await cleanupPending(owner)}catch{}
  }
  if(r2&&!committing&&!committed)orphan({id,key:r2.key,size:file.size,name:info.name||file.name,fileHash:info.fileHash||'',reason:error?.message||'stopped'});
  throw error;
 }finally{
  options.signal?.removeEventListener('abort',cancel);window.removeEventListener('vzip:auth-changed',authChanged);
  mediaImportActive=false;
 }
};
/** Files that reached R2 but whose library row could not be confirmed: kept (never deleted) for re-linking. */
function orphan(entry){try{const k='vzip_r2_orphans_v1',all=JSON.parse(localStorage.getItem(k)||'[]').filter(x=>x.id!==entry.id);all.push({...entry,owner:user?.id||'',at:Date.now()});localStorage.setItem(k,JSON.stringify(all.slice(-5000)))}catch{}}
window.vzipR2Orphans=()=>{try{return JSON.parse(localStorage.getItem('vzip_r2_orphans_v1')||'[]')}catch{return []}};
window.vzipCloudImport=(...args)=>{
 if(navigator.locks?.request)return navigator.locks.request('vzip-cloud-media-upload',{ifAvailable:true},lock=>{
  if(!lock)throw Error('다른 파일을 업로드하고 있어요. 다른 탭의 업로드를 완료하거나 취소한 뒤 다시 선택해 주세요.');
  return importMedia(...args);
 });
 return importMedia(...args);
};
/** All of the user's rows, page by page (the server returns at most 1,000 rows per request). */
async function allRows(columns){
 const owner=user?.id;if(!owner)return [];const out=[];
 const page=from=>client.from('vocal_media').select(columns).eq('user_id',owner).order('updated_at',{ascending:false}).order('id').range(from,from+999);
 // The first two pages are asked for together (one wait instead of two for 1,000–2,000 files); then one by one.
 const first=await Promise.all([page(0),page(1000)]);
 for(const [i,{data,error}] of first.entries()){
  if(error)throw error;if(user?.id!==owner)throw Error('로그인이 변경됐어요.');
  out.push(...(data||[]));if(!data||data.length<1000)return out;
  if(i===0)continue;
 }
 for(let from=2000;;from+=1000){
  const {data,error}=await page(from);
  if(error)throw error;if(user?.id!==owner)throw Error('로그인이 변경됐어요.');
  out.push(...(data||[]));if(!data||data.length<1000)return out;
 }
}
/* The library list is kept on this device (IndexedDB) per account. Later reads ask only for id + updated_at (small) and
 * fetch full rows just for files that are new or changed (every write here sets updated_at); a day-old copy is refreshed
 * in full. Reads that overlap share one request. Nothing on the server is changed by reading. */
const LIST_DB='vocalzip_cache_v1',FULL_AFTER=24*3600*1000;
function listDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(LIST_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('lists'))r.result.createObjectStore('lists',{keyPath:'owner'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function listCache(owner,entry){try{const db=await listDb();try{return await new Promise(resolve=>{const t=db.transaction('lists',entry?'readwrite':'readonly'),st=t.objectStore('lists'),q=entry?st.put(entry):st.get(owner);let out=null;q.onsuccess=()=>{out=entry?true:q.result||null};t.oncomplete=()=>resolve(out);t.onerror=t.onabort=()=>resolve(null)})}finally{db.close()}}catch{return null}}
const asItems=rows=>rows.map(x=>({...x.metadata,id:x.id,cloud:true}));
let listing=null;
async function readList(owner){
 const cached=await listCache(owner);let rows;
 if(!cached||Date.now()-cached.at>FULL_AFTER)rows=await allRows('id,metadata,updated_at');
 else{
  const index=await allRows('id,updated_at'),have=new Map(cached.rows.map(r=>[r.id,r])),fresh=new Map();
  for(const r of index)if(r.metadata!==undefined)fresh.set(r.id,r);
  const need=index.filter(r=>!fresh.has(r.id)&&(!have.has(r.id)||have.get(r.id).updated_at!==r.updated_at)).map(r=>r.id);
  for(let i=0;i<need.length;i+=200){
   const {data,error}=await client.from('vocal_media').select('id,metadata,updated_at').eq('user_id',owner).in('id',need.slice(i,i+200));
   if(error)throw error;for(const r of data||[])fresh.set(r.id,r);
  }
  rows=index.map(r=>fresh.get(r.id)||have.get(r.id)).filter(r=>r&&r.metadata);
 }
 if(user?.id!==owner)throw Error('로그인이 변경됐어요.');
 listCache(owner,{owner,at:cached&&Date.now()-cached.at<=FULL_AFTER?cached.at:Date.now(),rows});
 return rows;
}
window.vzipCloudMediaList=async()=>{
 const owner=user?.id;if(!owner)return [];
 if(listing?.owner===owner)return listing.promise;
 const promise=readList(owner).then(asItems);listing={owner,promise};
 try{return await promise}finally{if(listing?.promise===promise)listing=null}
};
/** The last list kept on this device (no network), for showing the library at once. */
window.vzipCloudMediaCached=async()=>{const owner=user?.id;if(!owner)return null;const c=await listCache(owner);return c?asItems(c.rows):null};
/** Read-only rows with server times, for the upload check (설정 → 저장 공간 관리 → 업로드 상태 진단). */
window.vzipCloudMediaRows=async()=>allRows('id,metadata,updated_at');
window.vzipCloudUserId=()=>user?.id||'';
window.vzipCloudMediaUrl=async item=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;
 const sign=async path=>{
  if(!path.startsWith(owner+'/')||path.includes('..'))throw Error('다른 계정의 파일은 재생할 수 없어요.');
  const {data,error}=await client.storage.from('vocal-recordings').createSignedUrl(path,3600);
  if(error)throw error;if(user?.id!==owner)throw Error('로그인이 변경되었어요.');
  return data.signedUrl;
 };
 if(item?.storageProvider==='r2'){if(!window.VzipR2?.configured())throw Error('R2 저장소 주소가 설정되지 않았어요.');return window.VzipR2.url(item.r2Key)}
 if(item?.storageVersion===2)return window.vzipChunkMediaURL(item,sign);
 if(!item?.path)throw Error('클라우드 파일 경로가 없어요.');
 return sign(item.path);
};
window.vzipCloudMediaUpdate=async(item,changes)=>{if(!user)throw Error('로그인이 필요해요.');const metadata={...item,...changes};delete metadata.cloud;delete metadata.local;delete metadata.blob;delete metadata.bytes;const {error}=await client.from('vocal_media').update({metadata,updated_at:new Date().toISOString()}).eq('id',item.id).eq('user_id',user.id);if(error)throw error;window.dispatchEvent(new Event('vzip:cloud-media-changed'));return metadata};
window.vzipCloudMediaDelete=async item=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;
 const old=item.storageProvider==='r2'?(item.legacyStorage||{}):item;
 const paths=old.storageVersion===2?VzipChunks.validate(old).parts.map(x=>x.path):(old.path?[old.path]:[]);
 if(paths.some(path=>!path.startsWith(owner+'/')||path.includes('..')))throw Error('다른 계정의 파일은 삭제할 수 없어요.');
 if(item.storageProvider==='r2'&&item.r2Key)await window.VzipR2.remove(item.r2Key);
 if(paths.length){const {error}=await client.storage.from('vocal-recordings').remove(paths);if(error)throw error}
 if(user?.id!==owner)throw Error('로그인이 변경되었어요.');
 const {error}=await client.from('vocal_media').delete().eq('id',item.id).eq('user_id',owner);
 if(error)throw error;window.dispatchEvent(new Event('vzip:cloud-media-changed'));
};
/* ---------- R2 move (storage screen) ---------- */
/** The original bytes of a cloud file (Supabase, single or multi-part). */
window.vzipCloudMediaBlob=async(item,signal)=>{const res=await fetch(await window.vzipCloudMediaUrl(item),{signal});if(!res.ok)throw Error('클라우드 파일을 받지 못했어요 ('+res.status+').');return res.blob()};
/** Point a record at its R2 copy (same id, so every link stays). The previous cloud location is kept
 * in legacyStorage until the user removes it from the storage screen. */
window.vzipCloudR2Attach=async(item,{key,size,type})=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;if(!String(key).startsWith('u/'+owner+'/'))throw Error('다른 계정의 저장 위치예요.');
 const {data:row,error:readError}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',item.id).maybeSingle();
 if(readError)throw readError;
 const base={...(row?.metadata||item)};
 for(const k of ['blob','bytes','local','cloud','path','parts','storageVersion','storageProvider','r2Key','legacyStorage'])delete base[k];
 const prev=row?.metadata;
 const legacy=prev&&prev.storageProvider!=='r2'&&(prev.path||prev.storageVersion===2)?{path:prev.path,storageVersion:prev.storageVersion,parts:prev.parts,size:prev.size}:prev?.legacyStorage;
 const metadata={...base,id:item.id,type:type||base.type,size,storageProvider:'r2',r2Key:key,movedToR2At:Date.now(),...(legacy?{legacyStorage:Object.fromEntries(Object.entries(legacy).filter(([,v])=>v!==undefined))}:{})};
 const {error}=await client.from('vocal_media').upsert({id:item.id,user_id:owner,metadata,updated_at:new Date().toISOString()});
 if(error)throw error;window.dispatchEvent(new Event('vzip:cloud-media-changed'));return metadata;
};
/** Remove the old Supabase copy of a file that now lives in R2, after re-checking the R2 copy's size. */
window.vzipCloudLegacyCleanup=async item=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;
 const {data:row,error:readError}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',item.id).maybeSingle();
 if(readError)throw readError;const meta=row?.metadata;
 if(meta?.storageProvider!=='r2'||!meta.legacyStorage)return;
 const stat=await window.VzipR2.stat(meta.r2Key);
 if(!stat||stat.size!==meta.size)throw Error('R2 사본을 확인하지 못했어요.');
 const old=meta.legacyStorage,paths=old.storageVersion===2?VzipChunks.validate(old).parts.map(x=>x.path):(old.path?[old.path]:[]);
 if(paths.some(path=>!path.startsWith(owner+'/')||path.includes('..')))throw Error('다른 계정의 파일은 삭제할 수 없어요.');
 if(paths.length){const {error}=await client.storage.from('vocal-recordings').remove(paths);if(error)throw error}
 const next={...meta};delete next.legacyStorage;
 const {error}=await client.from('vocal_media').update({metadata:next,updated_at:new Date().toISOString()}).eq('id',item.id).eq('user_id',owner);
 if(error)throw error;window.dispatchEvent(new Event('vzip:cloud-media-changed'));
};
window.vzipCloudAccessToken=async()=>{if(!client||!user)return null;const {data}=await client.auth.getSession();return data.session?.access_token||null};window.vzipCloudSignedIn=()=>!!user;
let streamOwner=null;
function showUser(){if(streamOwner&&streamOwner!==user?.id)window.vzipRevokeChunkMedia?.();streamOwner=user?.id||null;window.dispatchEvent(new Event('vzip:auth-changed'));const logged=!!user;$('#cloud-signed-in').hidden=!logged;updateAuthScreen();if(logged){$('#cloud-user').textContent=user.email||'로그인됨';ready=localStorage.getItem('vzip_cloud_linked_user')===user.id;say(ready?'연결됨 · 기록을 수정하면 자동으로 서버에 저장돼요.':'로그인 완료! 이 기기와 클라우드 기록을 합치는 중…');sync({silent:true})}else{ready=false;say('로그인하면 다른 기기에서도 기록을 불러올 수 있어요.')}}
async function boot(){if(!window.supabase?.createClient){say('서버 연결 라이브러리를 불러오지 못했어요. 새로고침해 주세요.');return}client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data}=await client.auth.getUser();user=data?.user||null;showUser();client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;showUser()});const credentials=()=>({email:$('#cloud-email').value.trim(),password:$('#cloud-password').value});
$('#cloud-show-password').onclick=()=>{const el=$('#cloud-password');el.type=el.type==='password'?'text':'password';$('#cloud-show-password').textContent=el.type==='password'?'보기':'숨기기'};
$('#cloud-login').onclick=async()=>{const {email,password}=credentials();if(!email||!password)return say('이메일과 비밀번호를 입력해 주세요.');say('로그인 중…');const {error}=await client.auth.signInWithPassword({email,password});say(error?'로그인 실패: '+(error.message==='Invalid login credentials'?'이메일 또는 비밀번호가 맞지 않아요. 기존 이메일 링크 계정이면 비밀번호 재설정을 눌러 주세요.':error.message):'✓ 로그인 완료!')};
$('#cloud-signup').onclick=async()=>{const {email,password}=credentials();if(!email||password.length<8)return say('이메일과 8자 이상의 비밀번호를 입력해 주세요.');if(!confirm('이 이메일로 새 계정을 만들까요? 이미 가입했다면 비밀번호 재설정을 이용해 주세요.'))return;say('계정 생성 중…');const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});say(error?'가입 실패: '+error.message:data.session?'✓ 가입 및 로그인 완료!':'가입 요청 완료. 이메일 인증이 필요할 수 있어요. 이메일이 오지 않으면 발송 제한이 풀린 뒤 다시 확인해 주세요.')};
$('#cloud-reset').onclick=async()=>{const email=$('#cloud-email').value.trim();if(!email)return say('먼저 이메일을 입력해 주세요.');say('비밀번호 재설정 메일 요청 중…');const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});say(error?'재설정 메일 발송 실패: '+error.message:'✓ 비밀번호 재설정 메일을 확인해 주세요.')};
client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){setTimeout(async()=>{const password=prompt('새 비밀번호를 8자 이상 입력해 주세요.');if(!password)return;if(password.length<8){say('비밀번호는 8자 이상이어야 해요.');return}const {error}=await client.auth.updateUser({password});say(error?'비밀번호 변경 실패: '+error.message:'✓ 비밀번호가 설정됐어요. 다음부터 이메일과 비밀번호로 로그인하세요.')},200)}});
$('#cloud-logout').onclick=async()=>{await client.auth.signOut();localStorage.removeItem('vzip_cloud_linked_user');user=null;showUser()};$('#cloud-upload').onclick=()=>sync();$('#cloud-download').onclick=download;$('#cloud-media-upload').onclick=uploadMedia;$('#cloud-media-download').onclick=downloadMedia;window.addEventListener('vzip:data-changed',e=>{if(!ready||!user||e.detail?.source==='cloud-merge')return;clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>upload(true),900)});}
boot().catch(e=>{say('연결 오류: '+e.message);document.getElementById('vzip-boot-cover')?.remove()});
})();