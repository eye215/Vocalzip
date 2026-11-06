/* VOCAL.zip: optional one-off song suggestions. No automatic paid calls. */
(() => {
'use strict';
const VZ=window.VZ, M=VZ?.media;
if (!VZ || !M) return;
const esc=VZ.esc;
const API='https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vzip-song-stt';
const cachePrefix='vzip_song_suggest_v1:';
const backupPrefix='vzip_song_assignment_backup:';
const backupPointer='vzip_song_assignment_last';
const MAX_BYTES=12*1024*1024, PAGE_SIZE=40;
// Guard decoded PCM (not just compressed bytes). The browser may allocate 2-3 copies.
const MAX_DURATION_SECONDS=80, MAX_PCM_BYTES=32*1024*1024;
const checkpointKey='vzip_song_suggest_checkpoint_v2';
const state={items:[],chosen:new Set(),results:new Map(),running:false,cancel:false,shown:PAGE_SIZE,controller:null};
const owner=()=>window.vzipCloudUserId?.()||'device';
let viewOwner=owner(), busy=false, authGeneration=0;
const scoped=key=>key+':'+viewOwner;
window.addEventListener('vzip:auth-changed',()=>{
 if(owner()===viewOwner)return;
 authGeneration++;state.cancel=true;state.controller?.abort();state.results.clear();state.chosen.clear();
});
async function exclusive(main,action){
 if(busy||owner()!==viewOwner)return;
 busy=true;const generation=authGeneration;
 const check=()=>{if(generation!==authGeneration||owner()!==viewOwner||!main.isConnected)throw Error('화면 또는 계정이 변경되어 중단했어요.')};
 try{await action(main,check)}catch(error){VZ.toast(String(error.message||error),'error')}
 finally{busy=false}
}
const pause=()=>new Promise(resolve=>setTimeout(resolve,120));
function saveCheckpoint(){try{localStorage.setItem(scoped(checkpointKey),JSON.stringify({ids:[...state.chosen],at:Date.now()}))}catch{}}
function loadCheckpoint(){try{const saved=JSON.parse(localStorage.getItem(scoped(checkpointKey))||'null');return Array.isArray(saved?.ids)?saved.ids:[]}catch{return []}}
const plain=s=>String(s||'').toLocaleLowerCase().normalize('NFKC')
 .replace(/20\d\d[-_. ](?:0?[1-9]|1[0-2])[-_. ](?:[0-2]?\d|3[01])/g,' ')
 .replace(/\.(?:m4a|wav|mp3|aac|flac|ogg|mp4)$/i,' ')
 .replace(/[_.,()\[\]#-]+/g,' ').replace(/\s+/g,' ').trim();
const songs=()=>VZ.db.songs||[];
function freeMatch(item){
 const name=plain(item.originalFilename||item.name||'');
 const candidates=songs().map(s=>({id:s.id,title:s.title,display:VZ.songLabel(s),
   hit:plain(s.title).length>=5 && name.includes(plain(s.title))})).filter(s=>s.hit);
 return candidates.length===1?{id:candidates[0].id,title:candidates[0].display,reason:'파일명에 곡명 포함',level:'높음'}:null;
}
function cacheKey(item){return scoped(cachePrefix)+':'+item.id+':'+(item.size||0)+':'+(item.r2Key||'')+':'+(item.originalFilename||item.name||'');}
function readCache(item){try{const r=JSON.parse(localStorage.getItem(cacheKey(item))||'null');return r&&r.version===1?r:null}catch{return null}}
function writeCache(item,result){try{localStorage.setItem(cacheKey(item),JSON.stringify({...result,version:1}))}catch{}}
function fmt(item){return M.label(item)+' · '+(M.dateOf(item)||'날짜 없음');}
function resultFor(item){return state.results.get(item.id)||readCache(item)|| (freeMatch(item)?{status:'후보',candidate:freeMatch(item),method:'filename'}:null)}
function eligible(item){return !item.songId&&!item.song && !M.isVideo(item);}
function setResult(item,result){state.results.set(item.id,result);writeCache(item,result);saveCheckpoint();}
function durationOf(url,signal){
 return new Promise((resolve,reject)=>{
  const el=document.createElement('audio');el.preload='metadata';el.muted=true;
  const timer=setTimeout(()=>finish(Error('음원 길이를 확인하지 못했어요.')),12000);
  function finish(error,duration){
   clearTimeout(timer);signal?.removeEventListener('abort',abort);
   el.onloadedmetadata=null;el.onerror=null;el.removeAttribute('src');el.load();
   error?reject(error):resolve(duration);
  }
  function abort(){finish(new DOMException('분석 중단','AbortError'))}
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)return abort();
  el.onloadedmetadata=()=>finish(null,el.duration);
  el.onerror=()=>finish(Error('음원 메타데이터를 읽지 못했어요.'));
  el.src=url;
 });
}
async function getAudioBytes(item,signal){
 // VZ.media.src returns signed R2 URL or local blob URL. Only read-only requests.
 const source=await M.src(item);
 try {
  // HTML audio metadata requests are typically byte-ranged by the browser.
  // Do NOT blindly fetch first 3-5MB: M4A moov atoms may live at the end.
  const seconds=await durationOf(source.url,signal);
  if(!Number.isFinite(seconds)||seconds<=0)
   throw Error('길이가 확인되지 않는 파일은 전체 디코딩하지 않아요. Mac 분석 도구를 이용해 주세요.');
  if(seconds>MAX_DURATION_SECONDS)
   throw Error('아이폰 메모리 보호: '+Math.ceil(seconds)+'초 음원은 Mac의 구간 STT 도구에서 분석해 주세요 (80초 제한).');
  const estimatedPcm=seconds*48000*2*4;
  if(estimatedPcm>MAX_PCM_BYTES)
   throw Error('압축 해제 예상 용량이 커서 아이폰 분석을 건너뛰었어요.');
  const response=await fetch(source.url,{cache:'no-store',signal});
  if(!response.ok)throw Error('음원을 불러오지 못했어요: '+response.status);
  const size=Number(response.headers.get('content-length')||0);
  if(size>MAX_BYTES)throw Error('12MB 초과 원본은 아이폰에서 분석하지 않아요.');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_BYTES)throw Error('12MB 초과 원본은 아이폰에서 분석하지 않아요.');
  return bytes;
 }finally{if(source.revoke)URL.revokeObjectURL(source.url)}
}
function wavBytes(buffer, offsetSec=20, seconds=30){
 const sr=16000, from=Math.min(buffer.length-1,Math.max(0,Math.floor(offsetSec*buffer.sampleRate)));
 const length=Math.min(Math.floor(seconds*buffer.sampleRate),buffer.length-from);
 if(length<buffer.sampleRate*2)throw Error('가사가 있는 녹음 구간이 너무 짧아요.');
 // Resampling is performed here rather than returning large decoded audio to the server.
 const bytes=new ArrayBuffer(44+Math.ceil(length*sr/buffer.sampleRate)*2);
 const view=new DataView(bytes);let p=0;
 function word(s){for(const c of s)view.setUint8(p++,c.charCodeAt(0))}
 function u16(x){view.setUint16(p,x,true);p+=2}
 function u32(x){view.setUint32(p,x,true);p+=4}
 const n=Math.floor(length*sr/buffer.sampleRate);
 word('RIFF');u32(36+2*n);word('WAVEfmt ');u32(16);u16(1);u16(1);u32(sr);u32(sr*2);u16(2);u16(16);word('data');u32(n*2);
 const channels=Array.from({length:Math.min(buffer.numberOfChannels,2)},(_,c)=>buffer.getChannelData(c));
 for(let i=0;i<n;i++){
   const pos=from+i*buffer.sampleRate/sr, j=Math.min(Math.floor(pos),buffer.length-1), k=Math.min(j+1,buffer.length-1), frac=pos-j;
   let sample=0;for(const chan of channels)sample+=(chan[j]*(1-frac)+chan[k]*frac)/channels.length;
   sample=Math.max(-1,Math.min(1,sample));view.setInt16(44+i*2,Math.round(sample<0?sample*32768:sample*32767),true);
 }
 return new Blob([bytes],{type:'audio/wav'});
}
async function clip(item,signal){
 let bytes=await getAudioBytes(item,signal);
 const audioCtx=new (window.AudioContext||window.webkitAudioContext)();
 try{
  // decodeAudioData can expand a small AAC file into many MB of PCM.
  const decoded=await audioCtx.decodeAudioData(bytes);
  bytes=null; // release reference before allocating excerpt WAV
  if(signal?.aborted)throw new DOMException('분석 중단','AbortError');
  const actualPcm=decoded.length*decoded.numberOfChannels*4;
  if(actualPcm>MAX_PCM_BYTES)throw Error('실제 디코딩 음원이 32MB를 초과해 분석을 중단했어요.');
  const start=Math.max(0,Math.min(20,decoded.duration-32));
  return wavBytes(decoded,start,30);
 }finally{bytes=null;await audioCtx.close().catch(()=>{})}
}
async function stt(item,signal){
 if(!window.vzipCloudSignedIn?.())throw Error('로그인이 필요해요.');
 const token=await window.vzipCloudAccessToken?.();
 if(!token)throw Error('로그인 세션이 만료됐어요.');
 const status=await fetch(API,{headers:{Authorization:'Bearer '+token},signal,cache:'no-store'});
 if(!status.ok){const data=await status.json().catch(()=>({}));throw Error(data.error||'STT_DISABLED ('+status.status+')')}
 if(signal?.aborted||owner()!==viewOwner)throw new DOMException('분석 중단','AbortError');
 const form=new FormData();
 // For 3–5 minute M4A recordings in R2: Cloudflare extracts 30 seconds
 // before anything is downloaded to Safari. Never decode the full recording.
 let excerpt;
 if(item.storageProvider==='r2' && item.r2Key){
  if(!window.VzipR2?.clip)throw Error('30초 R2 구간 추출 기능이 배포되지 않았어요.');
  excerpt=await window.VzipR2.clip(item.r2Key,{time:20,duration:30,signal});
 } else {
  // Small local/legacy files keep the existing memory-bounded decoder path.
  excerpt=new File([await clip(item,signal)],'vocal-clip.wav',{type:'audio/wav'});
 }
 form.append('file',excerpt,excerpt.name);
 form.append('songs',JSON.stringify(songs().map(s=>({id:s.id,title:s.title,show:s.show||''})).slice(0,250)));
 const res=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+token},body:form,signal});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'STT 서버 응답 오류 ('+res.status+')');
 const found=songs().find(s=>s.id===data.songId);
 return {status:found?'후보':'식별 불가',transcript:String(data.transcript||'').slice(0,250),
  candidate:found?{id:found.id,title:VZ.songLabel(found),reason:data.reason||'가사 단서 분석',level:data.level||'확인 필요'}:null,
  method:'stt'};
}
function controls(main){
 const root=main.querySelector('[data-suggest]');
 const count=state.chosen.size,done=state.items.filter(m=>state.chosen.has(m.id)&&resultFor(m)?.candidate).length;
 root.querySelector('[data-counter]').textContent=state.running?'분석 중 · '+count+'개 선택':count+'개 선택 · 추천 '+done+'개';
 root.querySelector('[data-analyze]').disabled=state.running||!count;
 root.querySelector('[data-apply]').disabled=state.running||!done;
 root.querySelector('[data-undo]').disabled=state.running;
 for(const el of root.querySelectorAll('input,select,[data-select-all],[data-clear]'))el.disabled=state.running;
 root.querySelector('[data-stop]').hidden=!state.running;
}
function draw(main){
 const root=main.querySelector('[data-suggest]'),list=root.querySelector('[data-suggest-list]');
 if(!list)return;
 const rows=state.items;
 list.replaceChildren();
 for(const item of rows.slice(0,state.shown)){
  const result=resultFor(item);
  const card=document.createElement('article');card.className='card';card.style.cssText='margin-bottom:8px;padding:12px';
  const box=document.createElement('input');box.type='checkbox';box.checked=state.chosen.has(item.id);box.setAttribute('aria-label',M.label(item)+' 선택');
  box.onchange=()=>{box.checked?state.chosen.add(item.id):state.chosen.delete(item.id);saveCheckpoint();controls(main)};
  const label=document.createElement('span');label.className='small';label.style.cssText='overflow-wrap:anywhere;margin-left:8px';label.textContent=fmt(item);
  const top=document.createElement('div');top.className='row';top.append(box,label);card.append(top);
  const sub=document.createElement('p');sub.className='small muted';
  sub.textContent=result?.error?'분석 실패: '+result.error:result?.candidate?'🎵 '+result.candidate.title+' · '+result.candidate.reason+' ('+result.candidate.level+')':result?.status||'분석 전';
  card.append(sub);
  const picker=document.createElement('select');picker.setAttribute('aria-label',M.label(item)+' 추천 곡 검토');
  picker.add(new Option('곡 미지정 (변경 안 함)',''));
  for(const song of songs())picker.add(new Option(VZ.songLabel(song),song.id));
  picker.value=result?.candidate?.id||'';
  picker.onchange=()=>{const selected=songs().find(s=>s.id===picker.value);
    setResult(item,{...(result||{}),status:selected?'후보':'미분류',candidate:selected?{id:selected.id,title:VZ.songLabel(selected),reason:'직접 선택',level:'사용자 지정'}:null});
    controls(main);
  };card.append(picker);
  list.append(card);
 }
 const more=root.querySelector('[data-more]');if(more){more.hidden=state.shown>=rows.length;more.textContent='더 보기 ('+Math.min(state.shown,rows.length)+'/'+rows.length+')'}
 controls(main);
}
async function analyze(main,check=()=>{}){
 const root=main.querySelector('[data-suggest]');
 const targets=state.items.filter(m=>state.chosen.has(m.id));
 const paid=targets.filter(m=>!resultFor(m)?.candidate&&readCache(m)?.method!=='stt').length;
 // Until a durable server quota is in place, limit each manual action to one paid request.
 if(paid>1){VZ.toast('안전한 테스트를 위해 유료 음성 분석은 한 번에 1개만 선택해 주세요.','error');return}
 if(paid&&!await VZ.confirm('AI 음성 분석 실행',paid+'개 파일에 유료 STT를 호출할 수 있어요. 파일당 최대 30초를 보내며, API 과금이 발생합니다. 원본을 변경하지 않아요.\n\n분석을 진행할까요?',{ok:'분석 시작'}))return;
 check();state.running=true;state.cancel=false;state.controller=new AbortController();saveCheckpoint();controls(main);
 let success=0,failed=0,seen=0;
 try{
  for(const m of targets){
   if(state.cancel||!main.isConnected||state.controller.signal.aborted)break;
   seen++;root.querySelector('[data-progress]').textContent=seen+'/'+targets.length+' · '+M.label(m);
   const cached=readCache(m);if(resultFor(m)?.candidate){const f=resultFor(m);state.results.set(m.id,f);success++;continue}if(cached?.method==='stt'){state.results.set(m.id,cached);failed++;continue}
   try{const result=await stt(m,state.controller.signal);check();setResult(m,result);result.candidate?success++:failed++}
   catch(error){
     const text=String(error.message||error);
     // Cache only successful recognition; failed queries are retryable.
     state.results.set(m.id,{status:'실패',error:text});failed++;
     if(/API 키 미설정|비활성화|사용 한도|not configured|STT_DISABLED|503/.test(text)){state.cancel=true}
   }
   if(main.isConnected)draw(main);
   // Allow UI to paint and the browser a chance to reclaim decoded audio between files.
   await pause();
  }
 }finally{state.running=false;state.controller=null;root.querySelector('[data-progress]').textContent='후보 '+success+'개 · 미분류/실패 '+failed+'개'+(state.cancel?' · 중지됨':'');if(main.isConnected)draw(main)}
}
async function undo(main,check=()=>{}){
 let backup;try{backup=JSON.parse(localStorage.getItem(localStorage.getItem(scoped(backupPointer))||'')||'null')}catch{}
 if(!backup?.rows?.some(row=>row.applied)){VZ.toast('되돌릴 성공 기록이 없어요.','error');return}
 if(!await VZ.confirm('곡 지정 되돌리기',backup.rows.filter(row=>row.applied).length+'개 중 다른 기기에서 수정되지 않은 녹음만 복구합니다.',{ok:'되돌리기'}))return;
 check();state.running=true;controls(main);
 let undone=0,skipped=0,failed=0;
 try{
  const fresh=await M.list(true);
  check();
  for(const row of backup.rows.filter(row=>row.applied)){
   check();
   const m=fresh.find(item=>item.id===row.id);
   if(!m||m.songId!==row.assignedId||m.song!==row.assignedSong){skipped++;continue}
   try{
    await M.assignSongSafe(m,{songId:row.oldId||'',song:row.oldSong||''},
      {expectedSongId:row.assignedId,expectedSong:row.assignedSong,expectedUpdatedAt:row.updatedAt||null});
    undone++;
   }catch{failed++}
  }
  M.invalidate();window.dispatchEvent(new Event('vzip:media-updated'));
  state.items=(await M.list(true)).filter(eligible);
 }finally{state.running=false;main.querySelector('[data-progress]').textContent='되돌림 '+undone+'개 · 건너뜀 '+skipped+'개 · 실패 '+failed+'개';draw(main)}
}
async function apply(main,check=()=>{}){
 const approved=state.items.filter(m=>state.chosen.has(m.id)&&resultFor(m)?.candidate)
  .map(m=>({id:m.id,candidate:{...resultFor(m).candidate}}));
 if(!approved.length)return;
 if(!await VZ.confirm('추천 결과 일괄 지정',approved.length+'개 녹음의 곡을 선택된 추천대로 지정할까요? 기존 곡이 연결된 파일은 변경하지 않아요. 원본 음원도 그대로입니다.',{ok:'네, 지정할게요'}))return;
 check();state.running=true;controls(main);
 let done=0,skipped=0,failed=0;
 try{
  const fresh=await M.list(true);
  check();
  const changes=approved.map(previous=>({old:fresh.find(x=>x.id===previous.id),newSong:previous.candidate})).filter(x=>x.old&&eligible(x.old)&&x.newSong&&songs().some(s=>s.id===x.newSong.id));
  const backup={at:new Date().toISOString(),rows:changes.map(x=>({id:x.old.id,oldId:x.old.songId||'',oldSong:x.old.song||'',assignedId:x.newSong.id,assignedSong:x.newSong.title,applied:false,updatedAt:null}))};
  if(!backup.rows.length){VZ.toast('지정할 녹음이 없어요.');return}
  let backupKey;
  try{backupKey=scoped(backupPrefix)+':'+Date.now();localStorage.setItem(backupKey,JSON.stringify(backup));localStorage.setItem(scoped(backupPointer),backupKey)}
  catch{throw Error('변경 전 백업을 저장하지 못했어요. 안전을 위해 곡 지정을 중단합니다.')}
  for(const previous of approved){
   check();
   const item=fresh.find(x=>x.id===previous.id),candidate=previous.candidate;
   if(!item||!eligible(item)||!songs().some(s=>s.id===candidate?.id)){skipped++;continue}
   try{
     const written=await M.assignSongSafe(item,{songId:candidate.id,song:candidate.title},
       {expectedSongId:item.songId||'',expectedSong:item.song||''});
     const row=backup.rows.find(r=>r.id===item.id);
     if(row){row.applied=true;row.updatedAt=written.updatedAt||null;localStorage.setItem(backupKey,JSON.stringify(backup))}
     done++;state.chosen.delete(item.id);
   }catch{failed++}
  }
  M.invalidate();window.dispatchEvent(new Event('vzip:media-updated'));
  state.items=(await M.list(true)).filter(eligible);
 }finally{
  state.running=false;
  main.querySelector('[data-progress]').textContent='곡 지정 '+done+'개 · 건너뜀 '+skipped+'개 · 실패 '+failed+'개';
  draw(main);
 }
}
VZ.route('song-suggest',{title:'AI 곡 추천',back:true,tab:'record',render(){
 return '<section data-suggest><div class="card"><h2>🎵 미분류 녹음 곡 추천</h2><p class="small muted">파일명은 무료로 분석해요. R2의 3~5분 녹음도 Cloudflare에서 30초만 추출해 STT에 전송해요. 미지원 파일은 건너뜁니다. 노래 인식은 틀릴 수 있으니 확인한 뒤에만 저장돼요.</p><p class="small muted" data-counter></p><div class="btn-row"><button class="btn ghost" type="button" data-select-all>전체 선택</button><button class="btn ghost" type="button" data-clear>선택 해제</button></div><div class="btn-row"><button class="btn" type="button" data-analyze>AI 분석 시작</button><button class="btn secondary" type="button" data-apply>추천대로 곡 지정</button></div><button class="btn ghost" type="button" data-stop hidden>분석 중단</button><button class="btn ghost" type="button" data-undo>↶ 마지막 일괄 지정 되돌리기</button><p role="status" class="small muted" data-progress>목록 확인 중…</p></div><div data-suggest-list></div><button class="btn ghost block" type="button" data-more hidden>더 보기</button></section>';
 },async mount(main){
  if(busy){main.textContent='이전 작업을 마무리하고 있어요. 잠시 후 다시 열어 주세요.';return}
  viewOwner=owner();
  const root=main.querySelector('[data-suggest]');state.chosen.clear();state.results.clear();state.running=false;state.cancel=false;state.controller=null;state.shown=PAGE_SIZE;
  state.items=(await M.list(true).catch(()=>[])).filter(eligible);
  if(!main.isConnected)return;
  const previous=new Set(loadCheckpoint());state.chosen=new Set(state.items.filter(m=>previous.has(m.id)).map(m=>m.id));
  root.querySelector('[data-progress]').textContent=state.items.length+'개 곡 미지정 음원'+(state.chosen.size?' · 이전 선택 '+state.chosen.size+'개 복원':'');
  root.querySelector('[data-select-all]').onclick=()=>{state.chosen=new Set(state.items.map(x=>x.id));saveCheckpoint();draw(main)};
  root.querySelector('[data-clear]').onclick=()=>{state.chosen.clear();saveCheckpoint();draw(main)};
  root.querySelector('[data-more]').onclick=()=>{state.shown+=PAGE_SIZE;draw(main)};
  root.querySelector('[data-stop]').onclick=()=>{state.cancel=true;state.controller?.abort();root.querySelector('[data-progress]').textContent='분석을 중단합니다.'};
  root.querySelector('[data-analyze]').onclick=()=>exclusive(main,analyze);
  root.querySelector('[data-apply]').onclick=()=>exclusive(main,apply);
  root.querySelector('[data-undo]').onclick=()=>exclusive(main,undo);
  draw(main);
 }});
})();
