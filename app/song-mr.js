/* Song accompaniment attachments: private R2 files and explicit YouTube links.
 * Stored on songs[].mrTracks, never in the recording/analysis library. */
(() => {
'use strict';
const V=window.VZ;if(!V)return;
const esc=V.esc,MAX=100*1024*1024;
const identity=()=>[window.vzipCloudUserId?.()||'device',window.vzipCloudSessionId?.()||'',window.VzipAccountScope?.owner||''].join(':');
const tracks=id=>(V.song(id)?.mrTracks||[]).filter(x=>!x.deleted);
function youtube(value){
 try{
  const u=new URL(String(value||'').trim());if(!['https:','http:'].includes(u.protocol))return null;
  const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');let id='';
  if(host==='youtu.be')id=u.pathname.slice(1).split('/')[0];
  else if(host==='youtube.com'||host==='youtube-nocookie.com')id=u.pathname==='/watch'?u.searchParams.get('v'):['shorts','embed','live'].includes(u.pathname.split('/')[1])?u.pathname.split('/')[2]:'';
  return /^[\w-]{11}$/.test(id||'')?{videoId:id,url:'https://www.youtube.com/watch?v='+id}:null;
 }catch{return null;}
}
const save=(id,mutate)=>V.change(d=>{const song=d.songs.find(s=>s.id===id);if(!song)throw Error('곡을 찾을 수 없어요.');song.mrTracks||=[];mutate(song.mrTracks);});
function add(song,redraw){
 const account=identity(),controller=new AbortController();let closed=false,pending=null,busy=false;
 const abort=()=>controller.abort(),release=window.VzipAccountScope?.beforeLeave?.(abort);
 window.addEventListener('vzip:auth-changed',abort);
 const guard=()=>{if(closed||controller.signal.aborted||identity()!==account||window.VzipAccountScope?.leaving)throw Error('화면 또는 계정이 바뀌어 중단했어요.');};
 V.sheet({title:'MR 추가',body:'<form id="song-mr-add"><label class="field"><span>등록 방식</span><select name="kind"><option value="file">파일 업로드</option><option value="youtube">유튜브 영상</option></select></label><label class="field"><span>이름 (선택)</span><input type="text" name="title" maxlength="120" placeholder="예: 원키 반주"></label><div data-mr-file><label class="field"><span>MR 오디오 파일</span><input type="file" name="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.webm,.caf" aria-label="MR 오디오 파일"></label><p class="small muted" data-mr-filename>MP3·M4A·WAV 등 오디오 파일, 최대 100MB</p></div><div data-mr-youtube hidden><label class="field"><span>유튜브 링크</span><input type="url" name="url" inputmode="url" maxlength="2000" placeholder="https://www.youtube.com/watch?v=…"></label></div><p class="small muted" data-mr-status role="status"></p></form>',
  foot:'<button type="submit" form="song-mr-add" class="btn block" data-mr-save>저장</button>',onClose:()=>{closed=true;controller.abort();window.removeEventListener('vzip:auth-changed',abort);release?.();},
  onMount:(el,close)=>{
   const form=el.querySelector('form'),field=n=>form.elements.namedItem(n),status=el.querySelector('[data-mr-status]'),go=el.querySelector('[data-mr-save]');
   const update=()=>{
    const file=field('kind').value==='file';el.querySelector('[data-mr-file]').hidden=!file;el.querySelector('[data-mr-youtube]').hidden=file;
    field('file').required=file;field('file').disabled=!file;field('url').required=!file;field('url').disabled=file;
    go.disabled=busy||!(file?field('file').files[0]:youtube(field('url').value));
   };
   form.addEventListener('input',update);field('kind').onchange=()=>{status.textContent='';update()};
   field('file').onchange=()=>{pending=null;el.querySelector('[data-mr-filename]').textContent=field('file').files[0]?.name||'오디오 파일, 최대 100MB';update()};update();
   form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;try{guard()}catch(error){status.textContent=error.message;return;}
    const kind=field('kind').value,title=field('title').value.trim(),file=field('file').files[0],link=youtube(field('url').value);
    if(kind==='youtube'&&!link){status.textContent='유효한 유튜브 영상 링크를 입력해 주세요.';return;}
    if(kind==='file'){
     if(!file||!file.size){status.textContent='오디오 파일을 골라 주세요.';return;}
     if(!/^audio\//.test(file.type)&&! /\.(mp3|m4a|wav|aac|flac|ogg|webm|caf)$/i.test(file.name)){status.textContent='오디오 파일만 올릴 수 있어요.';return;}
     if(file.size>MAX){status.textContent='100MB 이하 파일을 골라 주세요.';return;}
     if(!window.vzipCloudSignedIn?.()||!window.VzipR2?.enabled?.()){status.textContent='파일 업로드는 로그인과 클라우드 연결이 필요해요.';return;}
    }
    busy=true;go.disabled=true;for(const control of form.elements)control.disabled=true;
    try{
     let entry;
     if(kind==='youtube')entry={id:'mr-'+V.uid(),kind,...link,title:title||'유튜브 MR',created:Date.now()};
     else{
      pending||={id:'mr-'+V.uid(),receipt:null};
      const type=V.media.typeOf(file);status.textContent='업로드를 준비하고 있어요.';
      pending.receipt||=await window.VzipR2.upload(file,{mediaId:pending.id,type,signal:controller.signal,onProgress:p=>{if(!closed)status.textContent='올리는 중 '+Math.round(p)+'%'}});
      guard();if(!pending.receipt?.key)throw Error('업로드 결과를 확인하지 못했어요.');
      entry={id:pending.id,kind:'file',title:title||file.name.replace(/\.[^.]+$/,''),fileName:file.name,type,r2Key:pending.receipt.key,size:file.size,created:Date.now()};
     }
     guard();if(!save(song.id,list=>{if(!list.some(x=>x.id===entry.id))list.push(entry)}))throw Error('MR 목록을 저장하지 못했어요. 다시 저장해 주세요.');
     close();V.toast('MR을 저장했어요.');redraw();
    }catch(error){if(!closed)status.textContent=error.message||'저장하지 못했어요.';}
    finally{busy=false;if(!closed){for(const control of form.elements)control.disabled=false;update();}}
   };
  }});
}
// Players open under MR rows: closing one also stops its key-shift audio graph (app/mr-key-shift.js).
// Their .media-open marker (while not hidden) holds off background re-renders, as an open recording does.
const live=new WeakMap();
const closePlayer=el=>{live.get(el)?.();live.delete(el);el.replaceChildren();el.hidden=true;};
const shiftOf=id=>V.mrKey?V.mrKey.clamp(V.song(id)?.mrKeyShift):0;
/** File MR: the stored file streams through <audio> untouched; the key capsule only changes how it is played. */
function filePlayer(player,song,track,url,account,row){
 const K=V.mrKey,make=cors=>{const audio=document.createElement('audio');audio.controls=true;audio.preload='none';if(cors)audio.crossOrigin='anonymous';audio.src=url;audio.setAttribute('aria-label',track.title+' MR 재생');return audio;};
 let audio=make(!!K);
 if(!K){player.replaceChildren(audio);return;}
 const keys=K.keysOf(V.song(song.id)),label='mr-key-'+String(track.id).replace(/[^\w-]/g,'');
 const box=document.createElement('div');box.className='vz-mr-key';box.dataset.mrKey='';
 box.innerHTML='<div class="vz-mr-key-row"><span class="vz-mr-key-title" id="'+label+'">키</span><div class="vz-mr-key-capsule" role="group" aria-labelledby="'+label+'"><button type="button" data-mr-key-down aria-label="반음 내리기"><i class="ph ph-minus" aria-hidden="true"></i></button><button type="button" data-mr-key-value></button><button type="button" data-mr-key-up aria-label="반음 올리기"><i class="ph ph-plus" aria-hidden="true"></i></button></div>'+
  (keys.practiceKey?'<button type="button" class="vz-mr-key-practice" data-mr-key-practice><span>연습 키 <b>'+esc(keys.practiceKey)+'</b></span><small data-mr-key-suggest></small></button>':'')+'</div><p class="vz-mr-key-msg" data-mr-key-msg role="status"></p>';
 player.replaceChildren(audio,box);
 const down=box.querySelector('[data-mr-key-down]'),up=box.querySelector('[data-mr-key-up]'),value=box.querySelector('[data-mr-key-value]'),msg=box.querySelector('[data-mr-key-msg]'),practice=box.querySelector('[data-mr-key-practice]');
 let n=shiftOf(song.id),timer=0,engine=null,off=false;
 const persist=()=>{
  clearTimeout(timer);timer=0;if(identity()!==account||window.VzipAccountScope?.leaving)return;
  const current=V.song(song.id);if(!current||current.mrKeyShift===n||(!n&&current.mrKeyShift==null))return;
  // Silent: a full re-render would tear down the player that is playing right now.
  if(!V.change(d=>{const s=d.songs.find(x=>x.id===song.id);if(s)s.mrKeyShift=n;},{silent:true}))msg.textContent='키 설정을 저장하지 못했어요.';
 };
 const paint=()=>{
  value.textContent=K.label(n);value.setAttribute('aria-label','현재 '+K.spoken(n)+(n?'. 누르면 원키로 돌아가요':''));value.disabled=off||!n;
  down.disabled=off||n<=K.MIN;up.disabled=off||n>=K.MAX;
  if(practice){
   const s=keys.suggested,hint=practice.querySelector('[data-mr-key-suggest]');
   const to=s==null?'':K.label(s)+([3,6].includes(Math.abs(s))?'으로':'로');
   hint.textContent=s==null?'':s===n?'MR 맞춤':'MR '+to+' 맞추기';
   practice.disabled=off||s==null||s===n;
   practice.setAttribute('aria-label','연습 키 '+keys.practiceKey+(s!=null&&s!==n?'. MR을 '+to+' 맞추기':''));
  }
  const small=row.querySelector('[data-mr-open] small');if(small)small.textContent=(track.fileName||'오디오 파일')+(n?' · 키 '+K.label(n):'');
 };
 const report=error=>{if(!off)msg.textContent=error.message;};
 const apply=next=>{
  if(off)return;n=K.clamp(next);paint();msg.textContent='';
  clearTimeout(timer);timer=setTimeout(persist,400);
  // Runs inside the tap up to its first await, so the AudioContext can start on iPhone.
  engine.set(n).then(route=>{if(route!=='loading'&&msg.textContent==='키 변경을 준비하고 있어요…')msg.textContent='';},report);
 };
 engine=K.attach(audio,{onState:s=>{if(s==='loading')msg.textContent='키 변경을 준비하고 있어요…';}});
 audio.addEventListener('play',()=>{if(n)setTimeout(()=>{if(!off&&!audio.paused&&engine.context&&engine.context.state!=='running')msg.textContent='소리가 나지 않으면 키 버튼(− 또는 +)을 한 번 눌러 주세요.';},600);});
 // A shift chosen before: build the graph now (the open tap already woke the AudioContext on iPhone).
 if(n)engine.set(n).then(()=>{if(msg.textContent==='키 변경을 준비하고 있어요…')msg.textContent='';},report);
 // Key change needs CORS access to the stream. If storage refuses it, fall back to plain playback in the original key.
 let loaded=false;
 audio.addEventListener('loadedmetadata',()=>{loaded=true;},{once:true});
 audio.addEventListener('error',async()=>{
  if(loaded||!audio.crossOrigin)return;
  let cors=true;try{const r=await fetch(url,{headers:{range:'bytes=0-0'}});await r.body?.cancel();}catch{cors=false;}
  if(cors||!audio.isConnected)return;
  engine.destroy();off=true;const plain=make(false);audio.replaceWith(plain);audio=plain;paint();
  msg.textContent='이 MR은 저장소 설정 때문에 키를 바꿀 수 없어 원키로 재생해요.';
 },{once:true});
 paint();
 down.onclick=()=>apply(n-1);up.onclick=()=>apply(n+1);value.onclick=()=>apply(0);
 if(practice)practice.onclick=()=>{if(keys.suggested!=null)apply(keys.suggested);};
 live.set(player,()=>{if(timer)persist();engine?.destroy();});
}
V.renderSongMR=(host,song)=>{
 const draw=()=>{
  if(!host.isConnected)return;
  const list=tracks(song.id),account=identity();
  host.innerHTML='<section class="vz-ar-links vz-mr-links" aria-label="MR 반주"><div class="vz-ar-heading"><strong>MR 반주 <span>'+list.length+'</span></strong><button type="button" data-mr-add aria-label="MR 추가"><i class="ph ph-plus" aria-hidden="true"></i></button></div>'+
   (list.length?'<div class="vz-mr-list">'+list.map(x=>'<div class="vz-mr-row" data-mr="'+esc(x.id)+'"><div class="vz-mr-row-head"><button type="button" data-mr-open><i class="ph ph-'+(x.kind==='youtube'?'youtube-logo':'music-notes')+'" aria-hidden="true"></i><span><strong>'+esc(x.title)+'</strong><small>'+esc(x.kind==='youtube'?'유튜브 영상':(x.fileName||'오디오 파일')+(shiftOf(song.id)?' · 키 '+V.mrKey.label(shiftOf(song.id)):''))+'</small></span><i class="ph ph-play-circle" aria-hidden="true"></i></button><button type="button" class="icon-btn" data-mr-share aria-label="'+esc(x.title)+' MR 공유"><i class="ph ph-share" aria-hidden="true"></i></button><button type="button" class="icon-btn" data-mr-remove aria-label="'+esc(x.title)+' MR 삭제"><i class="ph ph-trash" aria-hidden="true"></i></button></div><div data-mr-player class="media-open" hidden></div></div>').join('')+'</div>':'<p>반주 파일이나 유튜브 영상을 추가해 주세요.</p>')+'</section>';
  host.querySelector('[data-mr-add]').onclick=()=>add(song,draw);
  window.VzipR2?.prefetch?.(list.filter(x=>x.kind==='file').slice(0,5).map(x=>x.r2Key)).catch(()=>{});
  for(const row of host.querySelectorAll('[data-mr]')){
   const track=list.find(x=>x.id===row.dataset.mr),player=row.querySelector('[data-mr-player]'),button=row.querySelector('[data-mr-open]');
   button.setAttribute('aria-expanded','false');
   button.onclick=async()=>{
    if(!player.hidden){closePlayer(player);button.setAttribute('aria-expanded','false');return;}
    for(const other of host.querySelectorAll('[data-mr-player]')){closePlayer(other);other.closest('[data-mr]').querySelector('[data-mr-open]').setAttribute('aria-expanded','false');}
    player.hidden=false;button.setAttribute('aria-expanded','true');
    if(track.kind==='youtube'){
     const link=youtube(track.url);if(!link){player.textContent='영상 링크를 확인해 주세요.';return;}
     player.innerHTML='<iframe src="https://www.youtube-nocookie.com/embed/'+link.videoId+'" title="'+esc(track.title)+'" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><a href="'+esc(link.url)+'" target="_blank" rel="noopener noreferrer">유튜브에서 열기 <i class="ph ph-arrow-square-out" aria-hidden="true"></i></a><p class="vz-mr-key-off" data-mr-key-off>유튜브 MR은 키를 바꿀 수 없어요. 영상 소리는 유튜브 플레이어 안에서만 나와 앱이 처리할 수 없어요. 키를 바꾸려면 MR 파일을 올려 주세요.</p>';return;
    }
    player.textContent='MR을 불러오는 중…';
    // A remembered key shift needs Web Audio: wake it while this tap still counts as a user gesture (iPhone Safari).
    if(shiftOf(song.id)){V.mrKey.context();V.mrKey.load().catch(()=>{});}
    try{
     const url=await window.VzipR2.url(track.r2Key);
     if(!player.isConnected||player.hidden||identity()!==account||window.VzipAccountScope?.leaving)return;
     filePlayer(player,song,track,url,account,row);
    }catch(error){if(player.isConnected&&!player.hidden)player.textContent='재생하지 못했어요: '+error.message;}
   };
   // File MR: a revocable link like a recording; YouTube MR: send the video link itself.
   row.querySelector('[data-mr-share]').onclick=()=>track.kind==='youtube'?V.shareUrl?.(track.title||'유튜브 MR',track.url):V.shareSheet?.({id:track.id,name:track.title,r2Key:track.r2Key},{title:(song.title?song.title+' · ':'')+(track.title||'MR')});
   row.querySelector('[data-mr-remove]').onclick=async()=>{
    if(!await V.confirm('MR 삭제','이 곡의 MR을 삭제할까요?',{ok:'삭제',danger:true}))return;
    try{
     if(identity()!==account||window.VzipAccountScope?.leaving)throw Error('계정이 바뀌어 중단했어요.');
     if(track.kind==='file')await window.VzipR2.remove(track.r2Key);
     if(identity()!==account||window.VzipAccountScope?.leaving)throw Error('계정이 바뀌어 중단했어요.');
     if(save(song.id,all=>{const found=all.find(x=>x.id===track.id);if(found){found.deleted=true;found.updatedAt=Date.now()}})){V.toast('MR을 삭제했어요.');draw();}
    }catch(error){V.toast(error.message,'error');}
   };
  }
 };
 draw();
};
window.addEventListener('vzip:auth-changed',()=>{document.querySelectorAll('.vz-mr-links [data-mr-player]').forEach(closePlayer);});
})();
