/* VOCAL.zip: optional one-off song suggestions. No automatic paid calls. */
(() => {
'use strict';
const VZ=window.VZ, M=VZ?.media;
if (!VZ || !M) return;
const esc=VZ.esc;
const API='https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vzip-song-stt';
const cachePrefix='vzip_song_suggest_v2:';
const backupPrefix='vzip_song_assignment_backup:';
const backupPointer='vzip_song_assignment_last';
const MAX_BYTES=12*1024*1024, PAGE_SIZE=30;
// Paid STT per tap. The server quota (vzip_song_stt_reserve) is the real cap; this keeps one run reviewable.
// No per-run limit: spending is bounded by the OpenAI account budget. What has been spent so far is shown
// instead (server count of paid STT calls × ≈ $0.0015 per 30-second clip, gpt-4o-mini-transcribe ≈ $0.003/min).
const MAX_PAID_PER_RUN=Infinity, COST_PER_CLIP_USD=0.0015;
const spend={total:null,today:null};
const usd=n=>'$'+(n*COST_PER_CLIP_USD).toFixed(n*COST_PER_CLIP_USD<1?3:2);
function showSpend(main){const el=main?.querySelector?.('[data-spend]');if(!el)return;el.hidden=spend.total==null;if(spend.total!=null){el.textContent='사용 금액 약 '+usd(spend.total);el.title='음성 분석 '+spend.total.toLocaleString()+'회'+(spend.today?' · 오늘 '+spend.today+'회':'')}}
async function loadSpend(main){try{const u=await window.vzipSttUsage?.();if(u){spend.total=u.total;spend.today=u.today}}catch{}showSpend(main)}
const SEARCH_SECONDS=120, MIN_SUNG_SECONDS=4;
// Guard decoded PCM (not just compressed bytes). The browser may allocate 2-3 copies.
const MAX_DURATION_SECONDS=80, MAX_PCM_BYTES=32*1024*1024;
const checkpointKey='vzip_song_suggest_checkpoint_v2';
const referenceKey='vzip_song_stt_references_v1';
const inlinePlayers=new Map();
function destroyPlayers(){for(const player of inlinePlayers.values())player.destroy();inlinePlayers.clear()}
window.addEventListener('hashchange',destroyPlayers);
window.addEventListener('pagehide',destroyPlayers);
// Top-1 is picked by default (still applied only after the user confirms), but never below this lyric
// similarity: under it the best match is noise, and a bulk "추천대로 곡 지정" would assign wrong songs.
const AUTO_PICK_MIN=0.12;
function topPick(match){if(match?.candidate)return match.candidate;const top=match?.matches?.[0];return top&&top.score>=AUTO_PICK_MIN?top.songId:null}
const pickReason=(match,why)=>match?.candidate?why:'유사도 1위 자동 선택 ('+Math.round((match?.matches?.[0]?.score||0)*100)+'%) · 확인 필요';
function candidateMatches(match){return match.matches.map(x=>({songId:x.songId,score:Math.round(x.score*1000)/1000})).slice(0,3)}
const state={items:[],referenceItems:[],chosen:new Set(),results:new Map(),recognitions:new Map(),referenceRows:[],cloudReady:false,running:false,cancel:false,page:0,filter:'all',controller:null};
const owner=()=>window.vzipCloudUserId?.()||'device';
let viewOwner=owner(), busy=false, authGeneration=0;
const scoped=key=>key+':'+viewOwner;
function references(){
 // The user's original lyrics are already synced through the existing song catalog (#80).
 // Use them first; supplement songs without lyrics from the new private Supabase table.
 const typed=songs().filter(song=>String(song.lyrics||'').trim().length>=12)
  .map(song=>({songId:song.id,transcript:String(song.lyrics).trim().slice(0,16000),source:'lyrics'}));
 const ids=new Set(typed.map(r=>r.songId));
 return [...typed,...state.referenceRows.filter(r=>!ids.has(r.songId))];
}
async function saveReference(songId,transcript,source='manual'){
 if(!state.cloudReady)throw Error('클라우드 기준 가사를 아직 불러오지 못했어요.');
 const originalOwner=owner();await window.vzipCloudSongTextSave({kind:'reference',recordId:songId,transcript,source});
 if(originalOwner!==owner()||owner()!==viewOwner)throw Error('계정이 변경되어 표시를 중단했어요.');
 state.referenceRows=[...state.referenceRows.filter(r=>r.songId!==songId),{songId,transcript,at:Date.now()}];
}
async function removeReference(songId){
 if(!state.cloudReady)throw Error('클라우드 기준 가사를 아직 불러오지 못했어요.');
 const originalOwner=owner();await window.vzipCloudSongTextDelete('reference',songId);
 if(originalOwner!==owner()||owner()!==viewOwner)throw Error('계정이 변경되어 표시를 중단했어요.');
 state.referenceRows=state.referenceRows.filter(r=>r.songId!==songId);
}
async function saveRecognition(item,transcript){
 if(!state.cloudReady)throw Error('클라우드 STT 기록이 아직 준비되지 않았어요.');
 // Local backup is written first so a failed DB sync never triggers another paid STT.
 writeCache(item,{status:'식별 불가',candidate:null,transcript,method:'stt'});
 const originalOwner=owner();await window.vzipCloudSongTextSave({kind:'recognition',recordId:item.id,transcript,source:'stt',onlyIfMissing:true});
 if(originalOwner!==owner()||owner()!==viewOwner)throw Error('계정 변경으로 다른 사용자의 기록을 표시하지 않아요.');
 state.recognitions.set(item.id,transcript);
}
async function loadCloudTexts(){
 state.cloudReady=false;state.referenceRows=[];state.recognitions.clear();
 if(!window.vzipCloudSignedIn?.()||!window.vzipCloudSongTextList||!window.vzipCloudSongTextSave)
  throw Error('기준 가사를 동기화하려면 Supabase 로그인과 최신 앱 버전이 필요해요.');
 const uid=viewOwner;
 let rows=await window.vzipCloudSongTextList();
 if(uid!==owner())throw Error('계정이 변경되어 동기화를 중단했어요.');
 const remoteRefs=new Set(rows.filter(r=>r.kind==='reference').map(r=>r.record_id));
 // One-time, non-overwriting import of old browser-only references.
 let legacy=[];
 try{const saved=JSON.parse(localStorage.getItem(scoped(referenceKey))||'[]');if(Array.isArray(saved))legacy=saved}catch{}
 for(const ref of legacy){
  if(!ref?.songId||typeof ref.transcript!=='string'||!ref.transcript.trim()||ref.transcript.length>1600||ref.songId.length>128)continue;
  if(remoteRefs.has(ref.songId))continue; // newer remote data wins
  if(uid!==owner())throw Error('계정 변경으로 이전 데이터 전송을 중단했어요.');
  await window.vzipCloudSongTextSave({kind:'reference',recordId:ref.songId,transcript:ref.transcript,source:'legacy',onlyIfMissing:true});
  remoteRefs.add(ref.songId);
 }
 // Previous paid transcripts exist in browser caches. Upload each once, never re-transcribe.
 const remoteRecognitions=new Set(rows.filter(r=>r.kind==='recognition').map(r=>r.record_id));
 for(const item of [...state.items,...state.referenceItems]){
  const cached=readCache(item);
  if(!cached?.transcript||cached.method!=='stt'||remoteRecognitions.has(item.id))continue;
  if(uid!==owner())throw Error('계정 변경으로 이전 데이터 전송을 중단했어요.');
  await window.vzipCloudSongTextSave({kind:'recognition',recordId:item.id,transcript:String(cached.transcript).slice(0,1600),source:'legacy',onlyIfMissing:true});
  remoteRecognitions.add(item.id);
 }
 // Only remove the old reference key after EVERY migration write succeeded.
 if(uid!==owner())throw Error('계정 변경으로 이전 데이터 전송을 중단했어요.');
 if(legacy.length)localStorage.removeItem(scoped(referenceKey));
 rows=await window.vzipCloudSongTextList();
 if(uid!==owner())throw Error('계정이 변경되어 동기화를 중단했어요.');
 state.referenceRows=rows.filter(r=>r.kind==='reference'&&!r.deleted_at).map(r=>({songId:r.record_id,transcript:r.transcript,at:r.updated_at}));
 state.recognitions=new Map(rows.filter(r=>r.kind==='recognition'&&!r.deleted_at).map(r=>[r.record_id,r.transcript]));
 for(const item of state.items){
  if(state.recognitions.has(item.id)&&!readCache(item))
   writeCache(item,{status:'식별 불가',candidate:null,transcript:state.recognitions.get(item.id),method:'stt'});
 }
 state.cloudReady=true;
}
window.addEventListener('vzip:auth-changed',()=>{
 if(owner()===viewOwner)return;
 authGeneration++;state.cancel=true;state.controller?.abort();destroyPlayers();state.results.clear();state.chosen.clear();state.referenceRows=[];state.recognitions.clear();state.cloudReady=false;
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
function readCache(item){try{
 const key=cacheKey(item),current=JSON.parse(localStorage.getItem(key)||'null');
 if(current?.version===1)return current;
 // Reuse STT text that the user ALREADY paid for under the earlier GPT-matcher.
 // Its old guessed song is deliberately discarded, not automatically applied.
 const legacy=JSON.parse(localStorage.getItem(key.replace(cachePrefix,'vzip_song_suggest_v1:'))||'null');
 if(legacy?.version===1&&legacy.method==='stt'&&legacy.transcript){
  const migrated={version:1,method:'stt',status:'식별 불가',candidate:null,transcript:String(legacy.transcript).slice(0,1600)};
  localStorage.setItem(key,JSON.stringify(migrated));return migrated;
 }
 return null;
}catch{return null}}
function writeCache(item,result){try{localStorage.setItem(cacheKey(item),JSON.stringify({...result,version:1}))}catch{}}
function fmt(item){return M.label(item)+' · '+(M.dateOf(item)||'날짜 없음');}
function resultFor(item){
 const result=state.results.get(item.id)||readCache(item)|| (freeMatch(item)?{status:'후보',candidate:freeMatch(item),method:'filename'}:null);
 if(result&&!result.candidate&&!result.userSelected&&result.matches?.length&&result.matches[0].score>=AUTO_PICK_MIN){
  const song=songs().find(s=>s.id===result.matches[0].songId);
  if(song)return {...result,status:'후보',candidate:{id:song.id,title:VZ.songLabel(song),reason:'유사도 1위 자동 선택 ('+Math.round(result.matches[0].score*100)+'%) · 확인 필요',level:'확인 필요'}};
 }
 return result;
}
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
/** Where the singing is: the on-device vocal analysis (app/analysis.js) follows the voice over the
 * MR, then the 30 seconds with the most singing are chosen. Free — and a clip with no singing is
 * never paid for. Without the analyzer, the old fixed 20-second start is used. */
async function singingStart(samples,rate,signal){
 const total=samples.length/rate,fallback=Math.max(0,Math.min(20,total-30));
 if(!VZ.analyzeSamples)return fallback;
 const r=await VZ.analyzeSamples(samples,rate);
 if(signal?.aborted)throw new DOMException('분석 중단','AbortError');
 const c=r.curve||[],fps=r.fps||20,win=Math.min(c.length,30*fps);
 let sum=0,best=-1,at=0;
 for(let i=0;i<c.length;i++){
  sum+=c[i]!=null?1:0;if(i>=win)sum-=c[i-win]!=null?1:0;
  if(i>=win-1&&sum>best){best=sum;at=i-win+1}
 }
 if(best/fps<MIN_SUNG_SECONDS)throw Error('노래 구간을 찾지 못했어요 (반주만 있거나 목소리가 작게 녹음됨). 비용은 들지 않았어요.');
 // Start half a second early so the first word is not cut.
 return Math.max(0,Math.min(at/fps-0.5,total-30));
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
  // Mono copy of the first two minutes for the singing finder (the decoded buffer stays as is).
  const n=Math.min(decoded.length,Math.floor(SEARCH_SECONDS*decoded.sampleRate)),mono=new Float32Array(n);
  for(let c=0;c<decoded.numberOfChannels;c++){const d=decoded.getChannelData(c);for(let i=0;i<n;i++)mono[i]+=d[i]/decoded.numberOfChannels}
  const start=await singingStart(mono,decoded.sampleRate,signal);
  return wavBytes(decoded,start,30);
 }finally{bytes=null;await audioCtx.close().catch(()=>{})}
}
async function stt(item,signal,{reference=false}={}){
 if(!state.cloudReady)throw Error('기준 가사와 STT 기록의 클라우드 동기화가 필요해요.');
 const previous=state.recognitions.get(item.id)||readCache(item)?.transcript;
 if(previous){
  if(reference)return {transcript:previous};
  const {matchTranscripts}=await import('../song-text-match.mjs?v=1');
  const match=matchTranscripts(previous,references()),found=songs().find(s=>s.id===topPick(match));
  return {status:found?'후보':'식별 불가',transcript:previous,
   candidate:found?{id:found.id,title:VZ.songLabel(found),reason:pickReason(match,match.reason),level:'확인 필요'}:null,method:'stt',reason:match.reason,matches:candidateMatches(match)};
 }
 if(!window.vzipCloudSignedIn?.())throw Error('로그인이 필요해요.');
 const token=await window.vzipCloudAccessToken?.();
 if(!token)throw Error('로그인 세션이 만료됐어요.');
 const status=await fetch(API,{headers:{Authorization:'Bearer '+token},signal,cache:'no-store'});
 if(!status.ok){const data=await status.json().catch(()=>({}));throw Error(data.error||'STT_DISABLED ('+status.status+')')}
 if(signal?.aborted||owner()!==viewOwner)throw new DOMException('분석 중단','AbortError');
 const form=new FormData();
 let excerpt;
 if(item.storageProvider==='r2' && item.r2Key){
  // Sparse authenticated range reads: only the first two minutes are decoded on the device (never the
  // whole file, never on a server), the singing is found in them, and only those 30 s are sent.
  // Works for Voice Memos M4A, video-extracted audio, MP3, WAV, FLAC. Original R2 data is never modified.
  if(!window.VzipR2?.url)throw Error('클라우드 음원 주소를 가져올 수 없어요.');
  const signedUrl=await window.VzipR2.url(item.r2Key);
  const {extractR2AudioPcm,clipFromPcm}=await import('../stt-clip-browser.mjs?v=2');
  const {pcm,rate}=await extractR2AudioPcm(signedUrl,{time:0,seconds:SEARCH_SECONDS,signal});
  const offset=await singingStart(Float32Array.from(pcm,v=>v/32768),rate,signal);
  excerpt=clipFromPcm(pcm,offset);
 } else {
  // Small local/legacy files keep the existing memory-bounded decoder path.
  excerpt=new File([await clip(item,signal)],'vocal-clip.wav',{type:'audio/wav'});
 }
 form.append('file',excerpt,excerpt.name);
 form.set('mode','transcript-only');
 form.append('songs',JSON.stringify(songs().map(s=>({id:s.id,title:s.title,show:s.show||''})).slice(0,250)));
 const res=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+token},body:form,signal});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'STT 서버 응답 오류 ('+res.status+')');
 if(spend.total!=null){spend.total++;spend.today=(spend.today||0)+1}
 const transcript=String(data.transcript||'').slice(0,1600);
 if(transcript.trim())await saveRecognition(item,transcript);
 if(reference)return {transcript};
 const {matchTranscripts}=await import('../song-text-match.mjs?v=1');
 const match=matchTranscripts(transcript,references());
 const found=songs().find(s=>s.id===topPick(match));
 return {status:found?'후보':'식별 불가',transcript,
  candidate:found?{id:found.id,title:VZ.songLabel(found),reason:pickReason(match,match.reason),level:'확인 필요'}:null,
  method:'stt',reason:match.reason,matches:candidateMatches(match)};
}
function classification(item){
 const result=resultFor(item);
 if(result?.error||result?.status==='실패')return 'failed';
 if(result?.candidate)return 'complete';
 if(result?.status==='식별 불가'||result?.transcript)return 'unknown';
 return 'pending';
}
function filteredItems(){return state.items.filter(item=>state.filter==='all'||classification(item)===state.filter)}
function updateMetrics(main){
 const c=VZ.serverAnalysisCounts?.(),root=main.querySelector('[data-suggest]');if(!root)return;
 const values={'[data-review-count]':c?.song?.review,'[data-auto-count]':c?.song?.auto,'[data-wait-count]':c?c.vocal.wait+c.song.wait:null};
 for(const [selector,value] of Object.entries(values)){const el=root.querySelector(selector);if(el)el.textContent=value==null?'—':value.toLocaleString()}
 const vocal=root.querySelector('[data-vocal-count]');if(vocal)vocal.textContent=c?.vocal?.total?`보컬 측정 ${c.vocal.done}/${c.vocal.total} 완료`:'보컬 측정 내역 확인 중';
}
function controls(main){
 const root=main.querySelector('[data-suggest]');if(!root)return;
 const count=state.chosen.size,done=state.items.filter(m=>state.chosen.has(m.id)&&resultFor(m)?.candidate).length;
 const counter=root.querySelector('[data-counter]');if(counter)counter.textContent=count?'선택 '+count+'개':'';
 const selectionMore=root.querySelector('[data-selection-more]');if(selectionMore)selectionMore.disabled=state.running||!count;
 const all=root.querySelector('[data-select-all]'),scope=filteredItems();
 if(all){all.disabled=state.running||!scope.length;all.setAttribute('aria-pressed',String(!!scope.length&&scope.every(m=>state.chosen.has(m.id))))}
 const analyzeBtn=root.querySelector('[data-analyze]'),applyBtn=root.querySelector('[data-apply]');
 if(analyzeBtn)analyzeBtn.disabled=state.running||!count;
 if(applyBtn)applyBtn.disabled=state.running||!done;
 const undo=root.querySelector('[data-undo]');if(undo)undo.disabled=state.running;
 for(const el of root.querySelectorAll('input,select,[data-more],[data-file-delete]'))el.disabled=state.running;
 const stop=root.querySelector('[data-stop]');if(stop)stop.hidden=!state.running;
}
function pickSong(main,item){
 const result=resultFor(item),matches=Array.isArray(result?.matches)?result.matches.slice(0,3):[];
 const matchRows=matches.map((match,i)=>{const song=songs().find(x=>x.id===match.songId);return song?'<button type="button" data-pick="'+esc(song.id)+'"><strong>'+(i+1)+'위 '+esc(VZ.songLabel(song))+'</strong><small>가사 유사도 '+Math.round(Math.max(0,Math.min(1,match.score))*100)+'% · 곡이 맞을 확률은 아니에요</small></button>':''}).join('');
 const options=songs().map(song=>'<option value="'+esc(song.id)+'"'+(song.id===result?.candidate?.id?' selected':'')+'>'+esc(VZ.songLabel(song))+'</option>').join('');
 VZ.sheet({title:'곡 선택',body:'<div class="vz-sc-pick">'+(matchRows||'')+'<label class="field"><span>내 곡에서 직접 선택</span><select data-pick-select><option value="">곡 미지정 (변경 안 함)</option>'+options+'</select></label><p class="small muted">선택 후 아래 ‘추천대로 곡 지정’을 눌러야 저장돼요.</p></div>',onMount:(el,close)=>{
  const choose=id=>{const song=songs().find(x=>x.id===id);setResult(item,{...(result||{}),userSelected:true,status:song?'후보':'미분류',candidate:song?{id:song.id,title:VZ.songLabel(song),reason:'직접 선택',level:'사용자 지정'}:null});draw(main);close()};
  el.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>choose(button.dataset.pick));
  el.querySelector('[data-pick-select]').onchange=e=>choose(e.target.value);
 }});
}
function openRecordMenu(main,item){
 VZ.sheet({title:M.label(item),body:'<button type="button" class="btn ghost block" data-file-delete>파일 삭제</button>',onMount:(el,close)=>{
  el.querySelector('[data-file-delete]').onclick=()=>{close();exclusive(main,async(_main,check)=>{
   if(state.running||!await M.confirmRemove(item))return;check();await M.remove(item);check();
   state.items=state.items.filter(x=>x.id!==item.id);state.chosen.delete(item.id);state.results.delete(item.id);state.recognitions.delete(item.id);
   saveCheckpoint();draw(main);VZ.toast('파일을 삭제했어요. 연습·레슨 기록은 남아 있어요.');
  })};
 }});
}
function openSelectionMenu(main){
 const root=main.querySelector('[data-suggest]'),count=state.chosen.size;
 if(!count||state.running)return;
 const ready=state.items.some(m=>state.chosen.has(m.id)&&resultFor(m)?.candidate);
 VZ.menu({title:'선택한 녹음 '+count+'개',body:'<div class="vz-choice-list"><button type="button" class="vz-choice" data-selection-analyze>분석 시작 <i class="ph ph-arrow-right"></i></button><button type="button" class="vz-choice" data-selection-apply'+(ready?'':' disabled')+'>추천대로 곡 지정 <i class="ph ph-arrow-right"></i></button><button type="button" class="vz-choice" data-selection-clear>선택 해제 <i class="ph ph-x"></i></button></div>',onMount:(el,close)=>{
  el.querySelector('[data-selection-analyze]').onclick=()=>{close();root.querySelector('[data-analyze]').click()};
  el.querySelector('[data-selection-apply]').onclick=()=>{close();root.querySelector('[data-apply]').click()};
  el.querySelector('[data-selection-clear]').onclick=()=>{close();state.chosen.clear();saveCheckpoint();draw(main)};
 }});
}
function draw(main){
 const root=main.querySelector('[data-suggest]'),list=root?.querySelector('[data-suggest-list]');if(!list)return;
 const rows=filteredItems(),shown=rows.slice(0,(state.page+1)*PAGE_SIZE);
 destroyPlayers();list.replaceChildren();
 for(const item of shown){
  const result=resultFor(item),kind=classification(item),status=kind==='failed'?'분석 실패':kind==='unknown'?'식별 불가':kind==='complete'?'추천 곡':'분석 전';
  const title=result?.candidate?.title||'곡 직접 선택',duration=VZ.clock(item.durationSeconds||0),name=M.label(item);
  const date=VZ.dateLabel?.(M.dateOf(item))||'날짜 없음';
  const card=document.createElement('article');card.className='vz-sc-record';
  card.innerHTML='<div class="vz-sc-record-main"><div class="vz-sc-record-head"><label class="vz-sc-record-check"><input type="checkbox" aria-label="'+esc(name)+' 선택"'+(state.chosen.has(item.id)?' checked':'')+'><span class="vz-sc-checkbox" aria-hidden="true"></span></label><div class="vz-sc-record-name"><strong title="'+esc(name)+'">'+esc(name)+'</strong><small>'+esc(date)+' · '+esc(duration)+' · 음성</small></div><button type="button" class="vz-sc-menu" aria-label="'+esc(name)+' 더 보기"><i class="ph ph-dots-three-vertical"></i></button></div><div class="vz-sc-player-placeholder"><button type="button" class="vz-sc-play-trigger" aria-label="'+esc(name)+' 재생"><i class="ph-fill ph-play"></i></button><span class="vz-sc-track" aria-hidden="true"></span><span class="vz-sc-time">0:00 / '+esc(duration)+'</span></div><div class="vz-sc-player-host" hidden></div></div><button type="button" class="vz-sc-recommend'+(kind==='failed'||kind==='unknown'?' failed':'')+'" aria-label="'+esc(name)+' 곡 선택"><span class="tag">'+status+'</span><span class="divider"></span><span class="song">'+esc(title)+'</span><i class="ph ph-caret-right"></i></button>';
  card.querySelector('input').onchange=e=>{e.target.checked?state.chosen.add(item.id):state.chosen.delete(item.id);saveCheckpoint();controls(main)};
  card.querySelector('.vz-sc-play-trigger').onclick=()=>{const host=card.querySelector('.vz-sc-player-host');try{const player=M.player(host,item,{prefetch:false,tools:false});inlinePlayers.set(item.id,player);card.querySelector('.vz-sc-player-placeholder').hidden=true;host.hidden=false;player.play()}catch(error){VZ.toast('재생할 수 없어요: '+String(error.message||error),'error')}};
  card.querySelector('.vz-sc-recommend').onclick=()=>pickSong(main,item);
  card.querySelector('.vz-sc-menu').onclick=()=>openRecordMenu(main,item);
  list.append(card);
 }
 if(!shown.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=state.items.length?'해당 상태의 녹음이 없어요.':'곡을 확인할 미지정 녹음이 없어요.';list.append(empty)}
 const more=root.querySelector('[data-more]');if(more){more.hidden=shown.length>=rows.length;more.disabled=state.running}
 const indicator=root.querySelector('[data-page-count]');if(indicator)indicator.textContent=rows.length?'1–'+shown.length+' / 전체 '+rows.length+'개':'목록 없음';
 for(const tab of root.querySelectorAll('[data-filter]')){tab.setAttribute('aria-selected',String(tab.dataset.filter===state.filter));if(tab.dataset.filter==='all')tab.textContent='전체 '+state.items.length}
 updateMetrics(main);controls(main);
}

function showReferenceControls(main){
 const select=main.querySelector('[data-ref-picker]'),summary=main.querySelector('[data-ref-list]');
 if(!select||!summary)return;
 const last=select.value;
 select.replaceChildren(new Option('곡 지정된 기준 녹음 선택',''));
 for(const item of state.referenceItems){
  const song=songs().find(s=>s.id===(item.songId||item.song));
  if(song)select.add(new Option(VZ.songLabel(song)+' · '+M.label(item),item.id));
 }
 select.value=last||'';
 const stored=references();
 summary.textContent='모든 기기에서 사용 가능한 기준: '+stored.length+'곡 (내 곡 가사 우선 + 추가 가사 기준)';
 const selected=state.referenceItems.find(m=>m.id===select.value);
 main.querySelector('[data-ref-clear]').disabled=state.running||!state.referenceRows.some(r=>r.songId===(selected?.songId||selected?.song));
}
async function rematchCached(main){
 const refs=references();if(!refs.length||!state.items.some(m=>{
  const c=readCache(m);return c?.transcript&&!c.userSelected&&c.method==='stt'&&!['직접 선택','사용자가 유사도 후보 중 선택'].includes(c.candidate?.reason)
 }))return;
 const {matchTranscripts}=await import('../song-text-match.mjs?v=1');
 let changed=0;
 for(const item of state.items){
  const previous=readCache(item);
  if(!previous?.transcript||previous.userSelected||previous.method!=='stt'||['직접 선택','사용자가 유사도 후보 중 선택'].includes(previous.candidate?.reason))continue;
  const match=matchTranscripts(previous.transcript,refs),found=songs().find(s=>s.id===topPick(match));
  const nextMatches=candidateMatches(match);
  const same=JSON.stringify(previous.matches||[])===JSON.stringify(nextMatches) &&
   (previous.candidate?.id||'')===(found?.id||'');
  if(same)continue;
  setResult(item,{...previous,status:found?'후보':'식별 불가',
   candidate:found?{id:found.id,title:VZ.songLabel(found),reason:pickReason(match,match.reason),level:'확인 필요'}:null,
   matches:nextMatches});
  changed++;
 }
 if(changed&&main.isConnected)draw(main);
}
async function indexReference(main,check=()=>{}){
 const item=state.referenceItems.find(m=>m.id===main.querySelector('[data-ref-picker]').value);
 const songId=item?.songId||item?.song;
 if(!item||!songs().some(s=>s.id===songId))throw Error('곡이 지정된 녹음을 선택해 주세요.');
 if(!await VZ.confirm('곡별 기준 녹음 만들기','선택한 녹음을 처음 한 번 유료 STT로 변환해 기준 가사로 저장합니다. 이후 비교는 무료이고 결과는 로그인한 계정에 비공개 저장됩니다.\\n\\n진행할까요?',{ok:'기준 만들기'}))return;
 check();state.running=true;state.controller=new AbortController();controls(main);
 try{
  const result=await stt(item,state.controller.signal,{reference:true});check();
  if(result.transcript.trim().length<12)throw Error('인식된 가사가 부족해 다른 녹음이 필요해요.');
  await saveReference(songId,result.transcript,'stt');
  await rematchCached(main);
  VZ.toast('곡별 기준이 저장됐어요. 다음부터 비교는 무료예요.');
 }finally{state.running=false;state.controller=null;showReferenceControls(main);controls(main)}
}
async function deleteReference(main){
 const item=state.referenceItems.find(m=>m.id===main.querySelector('[data-ref-picker]').value);
 const songId=item?.songId||item?.song;
 if(!songId||!state.referenceRows.some(r=>r.songId===songId))throw Error('이 곡의 별도 기준이 없어요. 내 곡의 원문 가사는 곡 상세 → 가사에서 수정해 주세요.');
 if(!await VZ.confirm('기준 삭제','로그인 계정의 모든 기기에서 선택 곡의 기준 가사를 삭제할까요?',{ok:'삭제'}))return;
 await removeReference(songId);showReferenceControls(main);
}

async function analyze(main,check=()=>{}){
 const root=main.querySelector('[data-suggest]');
 if(!state.cloudReady){VZ.toast('클라우드 기준 가사 동기화를 먼저 완료해 주세요.','error');return}
 await rematchCached(main);
 const targets=state.items.filter(m=>state.chosen.has(m.id));
 if(targets.some(m=>!resultFor(m)?.candidate)&&!references().length){VZ.toast('비교할 기준 가사가 없어요. 내 곡의 가사 탭에 입력하거나 아래에서 기준을 등록해 주세요.','error');return}
 const paid=targets.filter(m=>!resultFor(m)?.candidate&&!state.recognitions.has(m.id)&&!readCache(m)?.transcript).length;
 // Until a durable server quota is in place, limit each manual action to one paid request.
 if(paid&&!await VZ.confirm('AI 음성 분석 실행',paid+'개 파일에 STT만 사용해요(GPT 비용 없음). 파일마다 노래가 나오는 30초만 보내요. 예상 비용 약 $'+(paid*COST_PER_CLIP_USD).toFixed(3)+' (30초당 약 $'+COST_PER_CLIP_USD+')'+(spend.total!=null?' · 지금까지 약 '+usd(spend.total):'')+'. 노래 구간이 없는 파일은 보내지 않아 비용이 없어요. 기준 텍스트와의 비교는 무료이고 원본은 바뀌지 않아요.\n\n분석을 진행할까요?',{ok:'분석 시작'}))return;
 check();state.running=true;state.cancel=false;state.controller=new AbortController();saveCheckpoint();controls(main);
 // Up to 100 files take ~10 minutes: keep the screen awake so iOS does not suspend the run.
 M.keepAwake?.(true);
 let success=0,failed=0,seen=0;
 try{
  for(const m of targets){
   if(state.cancel||!main.isConnected||state.controller.signal.aborted)break;
   seen++;root.querySelector('[data-progress]').textContent=seen+'/'+targets.length+' · '+M.label(m);
   const cached=readCache(m);if(resultFor(m)?.candidate){const f=resultFor(m);state.results.set(m.id,f);success++;continue}if(cached?.method==='stt'&&!cached.candidate){state.results.set(m.id,cached);failed++;continue}
   try{const result=await stt(m,state.controller.signal);check();setResult(m,result);result.candidate?success++:failed++}
   catch(error){
     const text=String(error.message||error);
     // Cache only successful recognition; failed queries are retryable.
     state.results.set(m.id,{status:'실패',error:text});failed++;
     if(/API 키 미설정|비활성화|한도|not configured|STT_DISABLED|503|429/.test(text)){state.cancel=true}
   }
   if(main.isConnected)draw(main);
   // Allow UI to paint and the browser a chance to reclaim decoded audio between files.
   await pause();
  }
 }finally{M.keepAwake?.(false);loadSpend(main);state.running=false;state.controller=null;root.querySelector('[data-progress]').textContent='후보 '+success+'개 · 미분류/실패 '+failed+'개'+(state.cancel?' · 중지됨':'');if(main.isConnected)draw(main)}
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
let helpAbort=null;
function wireHelp(main){
 helpAbort?.abort();helpAbort=new AbortController();const signal=helpAbort.signal;
 const icon=document.querySelector('#top [data-song-help]'),help=main.querySelector('[data-song-help-tip]');if(!icon||!help)return;
 const position=()=>{const rect=icon.getBoundingClientRect(),width=Math.min(286,innerWidth-24),left=Math.max(12,Math.min(rect.left-16,innerWidth-width-12));help.style.setProperty('--tip-left',left+'px');help.style.setProperty('--tip-top',(rect.bottom+8)+'px');help.style.setProperty('--arrow-left',Math.max(12,Math.min(rect.left+rect.width/2-left-5,width-22))+'px')};
 const toggle=open=>{if(open)position();help.hidden=!open;icon.setAttribute('aria-expanded',String(open))};
 icon.onclick=()=>toggle(help.hidden);
 document.addEventListener('pointerdown',e=>{if(!help.hidden&&!e.target.closest('[data-song-help],[data-song-help-tip]'))toggle(false)},{signal});
 document.addEventListener('click',e=>{if(!help.hidden&&!e.target.closest('[data-song-help],[data-song-help-tip]'))toggle(false)},{signal});
 document.addEventListener('keydown',e=>{if(!help.hidden&&(e.key==='Escape'||(!['Shift','Control','Alt','Meta'].includes(e.key)&&!e.target.closest('[data-song-help]'))))toggle(false)},{signal});
 document.addEventListener('focusin',e=>{if(!help.hidden&&!e.target.closest('[data-song-help]'))toggle(false)},{signal});
 window.addEventListener('scroll',()=>{if(!help.hidden)toggle(false)},{passive:true,signal});
 window.addEventListener('resize',()=>{if(!help.hidden)position()},{signal});
}
VZ.route('song-suggest',{title:'곡 확인',back:true,tab:'record',
 titleAddon:()=>'<button type="button" class="icon-btn" data-song-help aria-label="곡 확인 도움말" aria-expanded="false" aria-controls="song-check-help"><i class="ph ph-info"></i></button>',
 actions:()=>'<button type="button" class="icon-btn" data-song-settings aria-label="곡 확인 설정"><i class="ph ph-gear-six"></i></button>',
 render(){return `<section data-suggest class="vz-song-check">
 <div class="vz-sc-status"><div class="vz-sc-status-head"><div class="vz-sc-status-title"><i class="ph ph-chart-line-up"></i>분석 현황 <small>내 계정 기준</small></div><div class="vz-sc-complete"><i class="ph ph-check"></i><span data-vocal-count>보컬 측정 내역 확인 중</span></div></div>
 <div class="vz-sc-metrics"><div class="vz-sc-metric"><strong data-review-count>—</strong><span>확인 필요</span></div><div class="vz-sc-metric"><strong data-auto-count>—</strong><span>곡 자동 지정</span></div><div class="vz-sc-metric"><strong data-wait-count>—</strong><span>대기·분석 중</span></div></div>
 <div class="vz-sc-status-foot"><span>곡 지정은 확인 후 적용</span><span data-spend hidden></span></div></div>
 <div class="vz-sc-sticky"><div class="vz-sc-section-head"><h2>미지정 녹음</h2><span>식별 실패·분석 실패 포함</span></div>
 <div class="vz-sc-tabs" role="tablist" aria-label="분석 상태"><button class="vz-sc-tab" role="tab" type="button" data-filter="all" aria-selected="true">전체 0</button><button class="vz-sc-tab" role="tab" type="button" data-filter="unknown" aria-selected="false">식별 불가</button><button class="vz-sc-tab" role="tab" type="button" data-filter="failed" aria-selected="false">분석 실패</button><button class="vz-sc-tab" role="tab" type="button" data-filter="complete" aria-selected="false">분석 완료</button></div>
 <div class="vz-sc-selection"><button type="button" class="vz-sc-select-all" data-select-all aria-pressed="false"><span class="vz-sc-checkbox" aria-hidden="true"></span>전체선택</button><div class="vz-sc-selection-end"><span data-counter></span><button type="button" class="vz-sc-selection-more" data-selection-more aria-label="선택한 녹음 더보기" disabled><i class="ph ph-dots-three" aria-hidden="true"></i></button></div></div></div>
 <div class="vz-sc-list" data-suggest-list></div><button type="button" class="vz-sc-more" data-more hidden>더 보기 <i class="ph ph-caret-down"></i></button><span class="sr-only" data-page-count aria-live="polite"></span>
 <p role="status" class="vz-sc-progress" data-progress>목록 확인 중…</p><button class="btn ghost" type="button" data-stop hidden>분석 중단</button>
 <details class="reference-options vz-sc-advanced" hidden><summary>가사 없는 곡용 기준 만들기 (고급)</summary><p class="small muted">가사를 입력하기 어려운 곡만 녹음으로 기준을 만들어요. 최초 음성 변환에 비용이 발생해요. 이미 저장한 기준은 계속 매칭에 사용돼요.</p><select data-ref-picker aria-label="기준 녹음 선택"></select><div class="btn-row"><button class="btn secondary" data-ref-add type="button">기준 녹음 만들기(최초 STT 비용)</button><button class="btn ghost" data-ref-clear type="button">선택 곡 기준 삭제</button></div><p class="small muted" data-ref-list></p><button class="btn ghost block" type="button" data-undo>↶ 마지막 일괄 지정 되돌리기</button><p class="small muted"><a href="#/songs">가사는 곡 상세의 가사 탭에서 입력 →</a></p></details>
 <div id="song-check-help" class="vz-sc-help" role="tooltip" data-song-help-tip hidden>원어 가사부터 비교하고, 맞지 않으면 한국어 가사도 확인해요. 가사 수정 후 AI 분석을 누르면 다시 비교해요.</div>
 <div class="vz-sc-bottom"><button type="button" data-analyze>분석 시작</button><button type="button" data-apply>추천대로 곡 지정</button></div></section>`},
 async mount(main){
  if(busy){main.textContent='이전 작업을 마무리하고 있어요. 잠시 후 다시 열어 주세요.';return}
  viewOwner=owner();wireHelp(main);
  const root=main.querySelector('[data-suggest]');state.chosen.clear();state.results.clear();state.cloudReady=false;state.running=false;state.cancel=false;state.controller=null;state.page=0;state.filter='all';
  loadSpend(main);updateMetrics(main);
  const mediaItems=await M.list(true).catch(()=>[]);
  state.items=mediaItems.filter(eligible);
  state.referenceItems=mediaItems.filter(m=>!!(m.songId||m.song)&&!M.isVideo(m));
  try{await loadCloudTexts()}catch(error){root.querySelector('[data-progress]').textContent='동기화 실패: '+String(error.message||error)+' · 이전 데이터는 삭제하지 않았어요.';VZ.toast('가사 동기화 실패: '+String(error.message||error),'error')}
  if(!main.isConnected||owner()!==viewOwner)return;
  for(const m of state.items){const r=VZ.serverReview?.(m.id);if(r&&!state.results.has(m.id)&&!readCache(m))state.results.set(m.id,{status:'식별 불가',candidate:null,method:'stt',transcript:r.transcript,matches:r.top3.map(x=>({songId:x.songId,score:x.score})),reason:'서버 분석 결과'})}
  const previous=new Set(loadCheckpoint());state.chosen=new Set(state.items.filter(m=>previous.has(m.id)).map(m=>m.id));
  if(state.cloudReady)root.querySelector('[data-progress]').textContent=state.items.length+'개 미지정 녹음'+(state.chosen.size?' · 이전 선택 '+state.chosen.size+'개 복원':'');
  root.querySelector('[data-select-all]').onclick=()=>{const scope=filteredItems(),all=scope.length&&scope.every(m=>state.chosen.has(m.id));for(const item of scope)all?state.chosen.delete(item.id):state.chosen.add(item.id);saveCheckpoint();draw(main)};
  root.querySelector('[data-selection-more]').onclick=()=>openSelectionMenu(main);
  root.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;state.page=0;draw(main)});
  root.querySelector('[data-more]').onclick=()=>{if(!state.running){state.page++;draw(main)}};
  root.querySelector('[data-stop]').onclick=()=>{state.cancel=true;state.controller?.abort();root.querySelector('[data-progress]').textContent='분석을 중단합니다.'};
  root.querySelector('[data-analyze]').onclick=()=>exclusive(main,analyze);
  root.querySelector('[data-apply]').onclick=()=>exclusive(main,apply);
  root.querySelector('[data-undo]').onclick=()=>exclusive(main,undo);
  root.querySelector('[data-ref-add]').onclick=()=>exclusive(main,indexReference);
  root.querySelector('[data-ref-picker]').onchange=()=>showReferenceControls(main);
  root.querySelector('[data-ref-clear]').onclick=()=>exclusive(main,deleteReference);
  document.querySelector('#top [data-song-settings]').onclick=()=>{const advanced=root.querySelector('.reference-options');advanced.hidden=false;advanced.open=true;advanced.scrollIntoView({block:'start',behavior:'smooth'})};
  window.addEventListener('vzip:server-analysis-updated',()=>{if(main.isConnected)updateMetrics(main)},{signal:helpAbort.signal});
  showReferenceControls(main);draw(main);
 },leave(){helpAbort?.abort();helpAbort=null;destroyPlayers()}
});
})();
