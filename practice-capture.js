/* Dedicated practice recorder — independent of shared lesson recorder. */
(()=>{'use strict';
const root=document.querySelector('#practice');if(!root)return;
const box=document.createElement('div');box.className='card';box.id='vzip-practice-capture';box.innerHTML=`<h2>🎙️ 연습 바로 녹음 · 녹화</h2><p class="muted">이 폼에서 바로 녹음·녹화하세요. 종료하면 보관함에 저장하고 지금 작성하는 연습에 연결해요.</p><div class="two"><button type="button" class="btn secondary" data-kind="audio" aria-pressed="true">🎤 음성 녹음</button><button type="button" class="btn secondary" data-kind="video" aria-pressed="false">🎬 영상 녹화</button></div><label for="vzip-capture-name">녹음 이름 (선택)</label><input id="vzip-capture-name" placeholder="예: 오늘의 발성 연습"><div class="buttons"><button type="button" class="btn" id="vzip-capture-start">● 시작</button><button type="button" class="btn danger" id="vzip-capture-stop" disabled>■ 종료하고 저장</button><strong id="vzip-capture-clock" aria-live="off">00:00</strong></div><video id="vzip-capture-preview" playsinline muted autoplay hidden style="width:100%;max-height:300px"></video><p id="vzip-capture-status" class="muted" role="status">시작하면 마이크 또는 카메라 사용 권한을 요청해요.</p>`;
const form=root.querySelector('#practice-form');if(form){const attach=form.querySelector('#practice-attachments');if(attach){const label=attach.previousElementSibling;if(label?.tagName==='LABEL')label.before(box);else attach.before(box)}else form.append(box)}else root.insertBefore(box,root.firstElementChild);
const $=s=>box.querySelector(s),start=$('#vzip-capture-start'),stop=$('#vzip-capture-stop'),status=$('#vzip-capture-status'),clock=$('#vzip-capture-clock'),preview=$('#vzip-capture-preview');
let kind='audio',state='idle',stream=null,recorder=null,tick,token=0,recoveryURL;
const recovery=document.createElement('div');recovery.id='vzip-capture-recovery';recovery.hidden=true;box.append(recovery);
function setState(next){
  state=next;start.disabled=next!=='idle';stop.disabled=next!=='recording';
  box.querySelectorAll('[data-kind]').forEach(button=>button.disabled=next!=='idle');
  window.vzipSetPracticeBusy?.('capture',next!=='idle');
}
function releaseTracks(){
  clearInterval(tick);if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;preview.srcObject=null;preview.hidden=true;
}
function clearRecovery(){
  if(recoveryURL)URL.revokeObjectURL(recoveryURL);
  recoveryURL=null;recovery.replaceChildren();recovery.hidden=true;
}
async function saveItem(item){
  setState('saving');status.textContent='저장 중…';
  try{
    if(!window.vzipStorePracticeMedia)throw Error('저장 모듈을 불러오지 못했어요.');
    await window.vzipStorePracticeMedia(item);
    window.dispatchEvent(new CustomEvent('vzip:media-saved',{detail:{
      id:item.id,source:'practice',attachToPractice:true,durationSeconds:item.durationSeconds
    }}));
    clearRecovery();status.textContent='✓ 저장 완료! 연습 기록에 연결했고 보관함에서도 확인할 수 있어요.';setState('idle');
  }catch(error){
    setState('recovery');clearRecovery();recovery.hidden=false;
    status.textContent='기기 저장 실패: '+error.message+' · 다시 저장하거나 파일을 내려받아 주세요.';
    const retry=document.createElement('button');retry.type='button';retry.className='btn';
    retry.id='vzip-capture-retry';retry.textContent='다시 저장';
    retry.onclick=()=>{retry.disabled=true;saveItem(item)};
    const download=document.createElement('a');download.className='btn secondary';download.textContent='녹음 파일 다운로드';
    recoveryURL=URL.createObjectURL(item.blob);download.href=recoveryURL;
    download.download=item.name.replace(/[\\/:*?"<>|]/g,'_')+(item.type.includes('mp4')?'.mp4':item.type.includes('ogg')?'.ogg':'.webm');
    const skip=document.createElement('button');skip.type='button';skip.className='btn secondary';
    skip.id='vzip-capture-skip';skip.textContent='이 파일 연결 없이 계속';
    skip.onclick=()=>{retry.disabled=true;skip.disabled=true;setState('idle');status.textContent='이 파일은 저장되지 않았어요. 필요하면 다운로드해 주세요.'};
    recovery.append(retry,download,skip);
  }
}
box.querySelectorAll('[data-kind]').forEach(button=>button.onclick=()=>{
  if(state!=='idle')return;kind=button.dataset.kind;
  box.querySelectorAll('[data-kind]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
});
start.onclick=async()=>{
  if(state!=='idle')return;
  if(!window.isSecureContext){status.textContent='HTTPS 환경에서만 녹음할 수 있어요.';return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status.textContent='현재 브라우저에서 녹음 기능을 지원하지 않아요.';return}
  const run=++token,captureKind=kind;setState('requesting');
  try{
    const acquired=await navigator.mediaDevices.getUserMedia(captureKind==='video'?{audio:true,video:{facingMode:'user'}}:{audio:true});
    if(run!==token){acquired.getTracks().forEach(track=>track.stop());return}
    stream=acquired;
    if(captureKind==='video'){preview.hidden=false;preview.srcObject=stream;preview.play().catch(()=>{})}
    const types=captureKind==='video'?['video/mp4','video/webm;codecs=vp8,opus','video/webm']:['audio/mp4','audio/webm;codecs=opus','audio/webm'];
    const mime=types.find(type=>MediaRecorder.isTypeSupported?.(type));
    const current=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];
    let stoppedAt=0;const startedAt=Date.now();
    current.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};
    current.onerror=()=>{setState('saving');status.textContent='녹음이 중단됐어요. 수신한 데이터를 저장하고 있어요.'};
    current.onstop=async()=>{
      const seconds=Math.max(0,((stoppedAt||Date.now())-startedAt)/1000);
      setState('saving');releaseTracks();
      const blob=new Blob(chunks,{type:current.mimeType||chunks[0]?.type||''});
      if(!blob.size){setState('idle');status.textContent='녹음 데이터가 없어 저장하지 못했어요. 다시 시작해 주세요.';return}
      const song=document.querySelector('#practice-song');
      await saveItem({id:crypto.randomUUID(),name:$('#vzip-capture-name').value.trim()||'연습 '+new Date().toLocaleString('ko-KR'),
        created:Date.now(),songId:song?.value||'',song:song?.value?song.selectedOptions[0].textContent:'',
        type:blob.type,source:'practice',blob,durationSeconds:seconds});
    };
    recorder=current;
    const finish=()=>{if(current.state==='recording'){stoppedAt=Date.now();setState('saving');current.stop()}};
    current.vzipFinish=finish;current.start(1000);clearRecovery();setState('recording');clock.textContent='00:00';
    acquired.getTracks().forEach(track=>track.addEventListener('ended',finish));
    tick=setInterval(()=>{const seconds=Math.floor((Date.now()-startedAt)/1000);clock.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')},500);
    status.textContent='● 녹음 중이에요. 종료하고 저장을 눌러주세요.';
  }catch(error){
    releaseTracks();setState('idle');
    status.textContent=error.name==='NotAllowedError'?'마이크·카메라 권한이 거부됐어요. Safari 웹사이트 권한을 확인해 주세요.':'녹음을 시작하지 못했어요: '+error.message;
  }
};
stop.onclick=()=>{
  if(state!=='recording')return;
  try{recorder.vzipFinish()}catch(error){releaseTracks();setState('idle');status.textContent='종료 실패: '+error.message}
};
window.addEventListener('pagehide',()=>{
  token++;if(state==='requesting')setState('idle');
  if(recorder?.state==='recording')try{recorder.vzipFinish()}catch{}
  releaseTracks();
});
})();