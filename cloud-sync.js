/* VOCAL.zip v1.3 — authenticated cloud sync. Never erase local records automatically. */
(()=>{'use strict';
const root=document.querySelector('#vzip-cloud-root');if(!root)return;
const url='https://chxnbtiyuyhiywzeshis.supabase.co';
const key='sb_publishable_GGxY7HzmyaYGG1Ho9Ir67A_SXXLzRFT';
const dataKey='vocal-zip_mvp_v1',mediaDb='vocalzip_media_v1';
const $=s=>root.querySelector(s);
root.insertAdjacentHTML('beforeend',`<div class="cloud-controls">
<div id="cloud-signed-out"><label for="cloud-email">이메일로 로그인</label><input id="cloud-email" type="email" autocomplete="email" placeholder="이메일 주소"><button class="btn" type="button" id="cloud-login">로그인 링크 받기</button></div>
<div id="cloud-signed-in" hidden><p id="cloud-user" class="muted"></p><p class="muted">처음 연결할 때는 어느 데이터를 사용할지 직접 선택해 주세요. 자동으로 기존 기록을 덮어쓰지 않아요.</p><div class="cloud-actions"><button type="button" class="btn" id="cloud-upload">이 기기 기록 → 클라우드</button><button type="button" class="btn secondary" id="cloud-download">클라우드 기록 → 이 기기</button><button type="button" class="btn secondary" id="cloud-media-upload">녹음·영상 클라우드 백업</button><button type="button" class="btn secondary" id="cloud-media-download">클라우드 녹음·영상 가져오기</button><button type="button" class="smallbtn" id="cloud-logout">로그아웃</button></div></div>
<p id="cloud-status" role="status" class="muted">연결 확인 중…</p></div>`);
const status=$('#cloud-status');let client,user=null,ready=false,uploadTimer=null,busy=false;
function say(message){status.textContent=message}
function localData(){try{return JSON.parse(localStorage.getItem(dataKey)||'null')}catch{return null}}
function count(data){return (data?.lessons?.length||0)+(data?.practices?.length||0)+(data?.assignments?.length||0)}
function localMedia(){return new Promise((resolve,reject)=>{const req=indexedDB.open(mediaDb,1);req.onupgradeneeded=()=>req.result.createObjectStore('recordings',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('recordings','readonly'),get=tx.objectStore('recordings').getAll();get.onsuccess=()=>resolve(get.result||[]);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close()}})}
function putMedia(item){return new Promise((resolve,reject)=>{const req=indexedDB.open(mediaDb,1);req.onupgradeneeded=()=>req.result.createObjectStore('recordings',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('recordings','readwrite');tx.objectStore('recordings').put(item);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}}})}
async function remoteData(){const {data,error}=await client.from('vocal_data').select('payload,updated_at').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}
async function upload(silent=false){if(!user||busy)return;const data=localData();if(!data)return say('이 기기에 저장된 기록이 없어요.');busy=true;try{const {error}=await client.from('vocal_data').upsert({user_id:user.id,payload:data,updated_at:new Date().toISOString()});if(error)throw error;localStorage.setItem('vzip_cloud_linked_user',user.id);ready=true;say('✓ 클라우드에 레슨·연습 기록 '+count(data)+'건 저장 완료'+(silent?' (자동 동기화)':''))}catch(e){say('동기화 실패: '+e.message)}finally{busy=false}}
async function download(){if(!user||busy)return;busy=true;try{const row=await remoteData();if(!row?.payload)return say('클라우드에 저장된 기록이 아직 없어요.');const data=row.payload;if(!Array.isArray(data.lessons)||!Array.isArray(data.practices)||!Array.isArray(data.songs)||!Array.isArray(data.categories)||!Array.isArray(data.assignments))throw Error('클라우드 기록 형식이 올바르지 않아요.');const existing=localData();if(!confirm('클라우드 기록 '+count(data)+'건을 이 기기로 가져올까요?\n현재 기기 기록 '+count(existing)+'건은 별도 백업 없이 덮어쓰게 됩니다.'))return;const backup='vzip_before_cloud_'+Date.now();if(existing)localStorage.setItem(backup,JSON.stringify(existing));localStorage.setItem(dataKey,JSON.stringify(data));localStorage.setItem('vzip_cloud_linked_user',user.id);ready=true;say('✓ 클라우드 기록을 가져왔어요. 화면을 새로고침합니다.');setTimeout(()=>location.reload(),650)}catch(e){say('가져오기 실패: '+e.message)}finally{busy=false}}
async function uploadMedia(){if(!user||busy)return;busy=true;try{const items=await localMedia();if(!items.length)return say('이 기기에 녹음·영상이 없어요.');if(!confirm(items.length+'개 파일을 비공개 클라우드 저장소에 백업할까요? 영상은 용량에 따라 시간이 걸릴 수 있어요.'))return;let ok=0,fail=0;for(const item of items){say('녹음·영상 업로드 '+(ok+fail+1)+'/'+items.length+'…');try{const ext=(item.blob.type||item.type||'').includes('mp4')?'mp4':(item.blob.type||item.type||'').includes('quicktime')?'mov':(item.blob.type||item.type||'').includes('mpeg')?'mp3':'webm';const path=user.id+'/'+encodeURIComponent(item.id)+'.'+ext;const {error}=await client.storage.from('vocal-recordings').upload(path,item.blob,{upsert:true,contentType:item.blob.type||item.type||'application/octet-stream'});if(error)throw error;const meta={id:item.id,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,type:item.type,path};const {error:metaError}=await client.from('vocal_media').upsert({user_id:user.id,id:item.id,metadata:meta});if(metaError)throw metaError;ok++}catch(e){fail++;say('업로드 오류: '+e.message)}}say('✓ 녹음·영상 백업 '+ok+'개 성공'+(fail?', '+fail+'개 실패':'')+'. 원본은 이 기기에 남아 있어요.')}catch(e){say('녹음 백업 실패: '+e.message)}finally{busy=false}}
async function downloadMedia(){if(!user||busy)return;busy=true;try{const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',user.id);if(error)throw error;if(!data?.length)return say('클라우드에 백업된 녹음이 없어요.');const existing=new Set((await localMedia()).map(x=>x.id));const missing=data.map(x=>x.metadata).filter(x=>!existing.has(x.id));if(!missing.length)return say('이 기기에 모든 녹음이 이미 있어요.');if(!confirm(missing.length+'개 녹음·영상을 이 기기에 다운로드해 보관할까요?'))return;let ok=0,fail=0;for(const meta of missing){say('녹음 가져오는 중 '+(ok+fail+1)+'/'+missing.length);try{const {data:blob,error:err}=await client.storage.from('vocal-recordings').download(meta.path);if(err)throw err;await putMedia({...meta,blob});ok++}catch{fail++}}say('✓ '+ok+'개 가져오기 완료'+(fail?', '+fail+'개 실패':'')+'. 보관함을 다시 열어 확인해 주세요.')}catch(e){say('녹음 가져오기 실패: '+e.message)}finally{busy=false}}
async function autoUploadMedia(id){if(!user||!ready)return;try{const item=(await localMedia()).find(x=>x.id===id);if(!item)return;const ext=(item.blob.type||item.type||'').includes('mp4')?'mp4':(item.blob.type||item.type||'').includes('quicktime')?'mov':(item.blob.type||item.type||'').includes('mpeg')?'mp3':'webm';const path=user.id+'/'+encodeURIComponent(item.id)+'.'+ext;const {error}=await client.storage.from('vocal-recordings').upload(path,item.blob,{upsert:true,contentType:item.blob.type||item.type||'application/octet-stream'});if(error)throw error;const {error:metaError}=await client.from('vocal_media').upsert({user_id:user.id,id:item.id,metadata:{id:item.id,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,type:item.type,path}});if(metaError)throw metaError;say('✓ 새 녹음이 이 기기와 클라우드에 저장됐어요.')}catch(e){say('녹음은 이 기기에 저장됐지만 클라우드 백업 실패: '+e.message+'. 다시 백업해 주세요.')}}
window.addEventListener('vzip:media-updated',async e=>{if(!user||!e.detail?.id)return;try{const item=(await localMedia()).find(x=>x.id===e.detail.id);if(!item)return;const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',user.id).eq('id',item.id).maybeSingle();if(error||!data)return;const metadata={...data.metadata,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,type:item.type};const {error:err}=await client.from('vocal_media').update({metadata,updated_at:new Date().toISOString()}).eq('id',item.id).eq('user_id',user.id);if(err)throw err}catch(err){say('기기에서 수정 완료 · 클라우드 정보 반영 실패: '+err.message)}});
window.addEventListener('vzip:media-saved',e=>{if(e.detail?.id)autoUploadMedia(e.detail.id)});

/* Large imports go directly to private Storage, without first filling Safari IndexedDB. */
window.vzipCloudImport=async function(file,info,onProgress){
 if(!client||!user)throw Error('먼저 관리 탭에서 이메일 로그인해 주세요.');
 if(file.size>100*1024*1024)throw Error('현재 파일당 100MB 제한이에요. 더 큰 영상은 별도 설정이 필요해요.');
 const id=crypto.randomUUID(),ext=(file.name.split('.').pop()||'mp4').toLowerCase().replace(/[^a-z0-9]/g,'');
 const path=user.id+'/'+id+'.'+ext;
 const {data:session,error:sessionError}=await client.auth.getSession();
 if(sessionError||!session?.session?.access_token)throw Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
 if(!window.tus?.Upload)throw Error('대용량 업로드 모듈을 불러오지 못했어요. 새로고침해 주세요.');
 await new Promise((resolve,reject)=>{
  const upload=new window.tus.Upload(file,{
   endpoint:'https://chxnbtiyuyhiywzeshis.storage.supabase.co/storage/v1/upload/resumable',
   headers:{authorization:'Bearer '+session.session.access_token,apikey:key},
   uploadDataDuringCreation:true,
   removeFingerprintOnSuccess:true,
   chunkSize:6*1024*1024,
   retryDelays:[0,1000,3000,5000,10000],
   metadata:{bucketName:'vocal-recordings',objectName:path,contentType:file.type||'application/octet-stream',cacheControl:'3600'},
   onError:reject,onSuccess:resolve,
   onProgress:(sent,total)=>onProgress?.(Math.round(sent/total*100))
  });
  upload.start();
 });
 const metadata={id,name:info.name||file.name.replace(/\.[^.]+$/,''),song:info.song||'',songId:info.songId||'',created:file.lastModified||Date.now(),type:file.type||'video/mp4',path,size:file.size};
 const {error}=await client.from('vocal_media').upsert({id,user_id:user.id,metadata});
 if(error)throw Error('영상 업로드 완료, 기록 연결 실패: '+error.message);
 return metadata;
};
window.vzipCloudSignedIn=()=>!!user;
function showUser(){const logged=!!user;$('#cloud-signed-in').hidden=!logged;$('#cloud-signed-out').hidden=logged;if(logged){$('#cloud-user').textContent='🔒 '+(user.email||'로그인됨');ready=localStorage.getItem('vzip_cloud_linked_user')===user.id;say(ready?'연결됨 · 기록을 수정하면 자동으로 서버에 저장돼요.':'로그인 완료! 먼저 이 기기 기록을 업로드하거나 클라우드 기록을 가져와 주세요.')}else{ready=false;say('로그인하면 다른 기기에서도 기록을 불러올 수 있어요.')}}
async function boot(){if(!window.supabase?.createClient){say('서버 연결 라이브러리를 불러오지 못했어요. 새로고침해 주세요.');return}client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data}=await client.auth.getUser();user=data?.user||null;showUser();client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;showUser()});$('#cloud-login').onclick=async()=>{const email=$('#cloud-email').value.trim();if(!email)return say('이메일 주소를 입력해 주세요.');say('로그인 링크 전송 중…');const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});say(error?'로그인 링크 발송 실패: '+error.message:'✓ 이메일을 확인해 주세요. 로그인 링크를 누르면 이 앱으로 돌아와요.')};$('#cloud-logout').onclick=async()=>{await client.auth.signOut();localStorage.removeItem('vzip_cloud_linked_user');user=null;showUser()};$('#cloud-upload').onclick=async()=>{if(!confirm('이 기기 레슨·연습 기록을 클라우드에 저장할까요? 클라우드의 기존 기록이 있다면 덮어씁니다.'))return;await upload()};$('#cloud-download').onclick=download;$('#cloud-media-upload').onclick=uploadMedia;$('#cloud-media-download').onclick=downloadMedia;window.addEventListener('vzip:data-changed',()=>{if(!ready||!user)return;clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>upload(true),900)});}
boot().catch(e=>say('연결 오류: '+e.message));
})();