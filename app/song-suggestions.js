/* VOCAL.zip: optional one-off song suggestions. No automatic paid calls. */
(() => {
'use strict';
const VZ=window.VZ, M=VZ?.media;
if (!VZ || !M) return;
const esc=VZ.esc;
const API='https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vzip-song-stt';
const cachePrefix='vzip_song_suggest_v1:';
const MAX_BYTES=12*1024*1024, PAGE_SIZE=40;
const state={items:[],chosen:new Set(),results:new Map(),running:false,cancel:false,shown:PAGE_SIZE};
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
function cacheKey(item){return cachePrefix+item.id+':'+(item.size||0)+':'+(item.updated_at||item.updatedAt||'');}
function readCache(item){try{const r=JSON.parse(localStorage.getItem(cacheKey(item))||'null');return r&&r.version===1?r:null}catch{return null}}
function writeCache(item,result){try{localStorage.setItem(cacheKey(item),JSON.stringify({...result,version:1}))}catch{}}
function fmt(item){return M.label(item)+' · '+(M.dateOf(item)||'날짜 없음');}
function resultFor(item){return state.results.get(item.id)||readCache(item)|| (freeMatch(item)?{status:'후보',candidate:freeMatch(item),method:'filename'}:null)}
function eligible(item){return !item.songId&&!item.song && !M.isVideo(item);}
function setResult(item,result){state.results.set(item.id,result);writeCache(item,result);}
async function getAudio(item){
 let blob=M.blobOf(item);
 if(!blob){
  if(!item.cloud)throw Error('클라우드에 없는 파일이에요.');
  const url=await window.vzipCloudMediaUrl(item);
  const response=await fetch(url);
  if(!response.ok)throw Error('음원을 불러오지 못했어요: '+response.status);
  blob=await response.blob();
 }
 if(blob.size>MAX_BYTES)throw Error('12MB 초과 음원은 현재 아이폰 STT 대상에서 제외했어요.');
 return blob;
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
async function clip(item){
 const raw=await getAudio(item), audioCtx=new (window.AudioContext||window.webkitAudioContext)();
 try{
  const decoded=await audioCtx.decodeAudioData(await raw.arrayBuffer());
  const start=Math.max(0,Math.min(20,decoded.duration-32));
  return wavBytes(decoded,start,30);
 }finally{audioCtx.close().catch(()=>{})}
}
async function stt(item){
 if(!window.vzipCloudSignedIn?.())throw Error('로그인이 필요해요.');
 const token=await window.vzipCloudAccessToken?.();
 if(!token)throw Error('로그인 세션이 만료됐어요.');
 const form=new FormData();form.append('file',await clip(item),'vocal-clip.wav');
 form.append('songs',JSON.stringify(songs().map(s=>({id:s.id,title:s.title,show:s.show||''})).slice(0,250)));
 const res=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'STT 서버 응답 오류 ('+res.status+')');
 const found=songs().find(s=>s.id===data.songId);
 return {status:found?'후보':'식별 불가',transcript:String(data.transcript||'').slice(0,250),
  candidate:found?{id:found.id,title:VZ.songLabel(found),reason:data.reason||'가사 단서 분석',level:data.level||'확인 필요'}:null,
  method:'stt'};
}
function controls(main){
 const root=main.querySelector('[data-suggest]');
 const count=state.chosen.size,done=[...state.chosen].filter(id=>state.results.get(id)?.status==='후보').length;
 root.querySelector('[data-counter]').textContent=state.running?'분석 중 · '+count+'개 선택':count+'개 선택 · 추천 '+done+'개';
 root.querySelector('[data-analyze]').disabled=state.running||!count;
 root.querySelector('[data-apply]').disabled=state.running||!done;
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
  box.onchange=()=>{box.checked?state.chosen.add(item.id):state.chosen.delete(item.id);controls(main)};
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
async function analyze(main){
 const root=main.querySelector('[data-suggest]');
 const targets=state.items.filter(m=>state.chosen.has(m.id));
 const paid=targets.filter(m=>!resultFor(m)?.candidate&&!readCache(m)).length;
 if(paid&&!await VZ.confirm('AI 음성 분석 실행',paid+'개 파일에 유료 STT를 호출할 수 있어요. 파일당 최대 30초를 보내며, API 과금이 발생합니다. 원본을 변경하지 않아요.\n\n분석을 진행할까요?',{ok:'분석 시작'}))return;
 state.running=true;state.cancel=false;controls(main);
 let success=0,failed=0,seen=0;
 try{
  for(const m of targets){
   if(state.cancel)break;
   seen++;root.querySelector('[data-progress]').textContent=seen+'/'+targets.length+' · '+M.label(m);
   if(resultFor(m)?.candidate){const f=resultFor(m);state.results.set(m.id,f);success++;continue}
   try{const result=await stt(m);setResult(m,result);result.candidate?success++:failed++}
   catch(error){
     const text=String(error.message||error);
     // Cache only successful recognition; failed queries are retryable.
     state.results.set(m.id,{status:'실패',error:text});failed++;
     if(/API 키 미설정|비활성화|사용 한도|not configured|STT_DISABLED|503/.test(text)){state.cancel=true}
   }
   if(main.isConnected)draw(main);
  }
 }finally{state.running=false;root.querySelector('[data-progress]').textContent='후보 '+success+'개 · 미분류/실패 '+failed+'개'+(state.cancel?' · 중지됨':'');if(main.isConnected)draw(main)}
}
async function apply(main){
 const approved=state.items.filter(m=>state.chosen.has(m.id)&&state.results.get(m.id)?.candidate);
 if(!approved.length)return;
 if(!await VZ.confirm('추천 결과 일괄 지정',approved.length+'개 녹음의 곡을 선택된 추천대로 지정할까요? 기존 곡이 연결된 파일은 변경하지 않아요. 원본 음원도 그대로입니다.',{ok:'네, 지정할게요'}))return;
 state.running=true;controls(main);
 let done=0,skipped=0,failed=0;
 try{
  const fresh=await M.list(true);
  for(const previous of approved){
   const item=fresh.find(x=>x.id===previous.id),candidate=state.results.get(previous.id)?.candidate;
   if(!item||!eligible(item)||!songs().some(s=>s.id===candidate?.id)){skipped++;continue}
   try{await M.update(item,{songId:candidate.id,song:candidate.title},{quiet:true});done++;state.chosen.delete(item.id)}
   catch{failed++}
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
 return '<section data-suggest><div class="card"><h2>🎵 미분류 녹음 곡 추천</h2><p class="small muted">파일명은 무료로 분석하고, 선택한 음원만 30초 STT를 실행해요. 노래 인식은 틀릴 수 있으니 확인한 뒤에만 저장돼요.</p><p class="small muted" data-counter></p><div class="btn-row"><button class="btn ghost" type="button" data-select-all>전체 선택</button><button class="btn ghost" type="button" data-clear>선택 해제</button></div><div class="btn-row"><button class="btn" type="button" data-analyze>AI 분석 시작</button><button class="btn secondary" type="button" data-apply>추천대로 곡 지정</button></div><button class="btn ghost" type="button" data-stop hidden>분석 중단</button><p role="status" class="small muted" data-progress>목록 확인 중…</p></div><div data-suggest-list></div><button class="btn ghost block" type="button" data-more hidden>더 보기</button></section>';
 },async mount(main){
  const root=main.querySelector('[data-suggest]');state.chosen.clear();state.results.clear();state.running=false;state.cancel=false;state.shown=PAGE_SIZE;
  state.items=(await M.list(true).catch(()=>[])).filter(eligible);
  if(!main.isConnected)return;
  root.querySelector('[data-progress]').textContent=state.items.length+'개 곡 미지정 음원';
  root.querySelector('[data-select-all]').onclick=()=>{state.chosen=new Set(state.items.map(x=>x.id));draw(main)};
  root.querySelector('[data-clear]').onclick=()=>{state.chosen.clear();draw(main)};
  root.querySelector('[data-more]').onclick=()=>{state.shown+=PAGE_SIZE;draw(main)};
  root.querySelector('[data-stop]').onclick=()=>{state.cancel=true;root.querySelector('[data-progress]').textContent='현재 분석이 끝나면 중단합니다.'};
  root.querySelector('[data-analyze]').onclick=()=>analyze(main);
  root.querySelector('[data-apply]').onclick=()=>apply(main);
  draw(main);
 }});
})();
