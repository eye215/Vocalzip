/* Dedicated practice recorder — independent of shared lesson recorder. */
(()=>{'use strict';
const root=document.querySelector('#practice');if(!root)return;
const box=document.createElement('div');box.className='card';box.id='vzip-practice-capture';box.innerHTML=`<h2>연습 녹음</h2><p class="muted">종료하면 보관함에 저장하고 지금 작성하는 연습에 연결해요.</p><div class="two"><button type="button" class="btn secondary" data-kind="audio" aria-pressed="true"><i class="ph ph-microphone" aria-hidden="true"></i> 음성 녹음</button><button type="button" class="btn secondary" data-kind="video" aria-pressed="false"><i class="ph ph-video-camera" aria-hidden="true"></i> 영상 녹화</button></div><strong id="vzip-capture-clock" aria-live="off">00:00</strong><canvas id="vzip-capture-wave" width="600" height="156" aria-label="실시간 마이크 파형"></canvas><div class="vzip-capture-actions"><button type="button" id="vzip-capture-mark" disabled><i class="ph ph-flag" aria-hidden="true"></i>마크</button><button type="button" class="vzip-capture-primary" id="vzip-capture-start"><i class="ph ph-microphone" aria-hidden="true"></i>시작</button><button type="button" class="vzip-capture-primary" id="vzip-capture-pause" hidden><i class="ph ph-pause" aria-hidden="true"></i><span>일시정지</span></button><button type="button" id="vzip-capture-stop" disabled><i class="ph ph-stop" aria-hidden="true"></i>종료·저장</button></div><video id="vzip-capture-preview" playsinline muted autoplay hidden style="width:100%;max-height:300px"></video><p id="vzip-capture-status" class="muted" role="status">시작하면 마이크 또는 카메라 사용 권한을 요청해요.</p><details class="vzip-capture-name"><summary>녹음 이름 (선택)</summary><label for="vzip-capture-name">이름</label><input id="vzip-capture-name" placeholder="입력하지 않아도 저장할 수 있어요"></details>`;
const form=root.querySelector('#practice-form');if(form)form.prepend(box);else root.insertBefore(box,root.firstElementChild);
const $=s=>box.querySelector(s),start=$('#vzip-capture-start'),stop=$('#vzip-capture-stop'),status=$('#vzip-capture-status'),clock=$('#vzip-capture-clock'),preview=$('#vzip-capture-preview');
const pause=$('#vzip-capture-pause'),mark=$('#vzip-capture-mark'),wave=$('#vzip-capture-wave');
let audioContext,animation,sampleLevel=()=>0;
let kind='audio',state='idle',stream=null,recorder=null,tick,token=0,recoveryURL;
const recovery=document.createElement('div');recovery.id='vzip-capture-recovery';recovery.hidden=true;box.append(recovery);
function setState(next){
  state=next;start.disabled=next!=='idle';stop.disabled=!['recording','paused'].includes(next);
  pause.hidden=!['recording','paused'].includes(next);start.hidden=!pause.hidden;mark.disabled=next!=='recording';
  pause.querySelector('span').textContent=next==='paused'?'계속 녹음':'일시정지';
  pause.querySelector('i').className='ph ph-'+(next==='paused'?'play':'pause');
  box.querySelectorAll('[data-kind]').forEach(button=>button.disabled=next!=='idle');
  window.vzipSetPracticeBusy?.('capture',next!=='idle');
}
function releaseTracks(){
  clearInterval(tick);sampleLevel=()=>0;cancelAnimationFrame(animation);if(audioContext){audioContext.close().catch(()=>{});audioContext=null}wave.getContext('2d').clearRect(0,0,wave.width,wave.height);if(stream)stream.getTracks().forEach(track=>track.stop());
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
    let peaks=[],peakSpan=1,peakCount=0,peakMax=0;
    let stoppedAt=0,pausedAt=0,pausedMs=0;const startedAt=Date.now();
    const elapsed=()=>Math.max(0,((stoppedAt||pausedAt||Date.now())-startedAt-pausedMs)/1000);
    pause.onclick=()=>{if(current.state==='recording'){current.pause();pausedAt=Date.now();setState('paused');status.textContent='일시정지 중이에요.'}else if(current.state==='paused'){current.resume();pausedMs+=Date.now()-pausedAt;pausedAt=0;setState('recording');status.textContent='녹음 중이에요.'}};
    mark.onclick=()=>{if(state!=='recording')return;const memo=form.querySelector('[name=memo]');const seconds=Math.floor(elapsed());const stamp=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');memo.value+=(memo.value?'\n':'')+'['+stamp+'] 다시 듣기';memo.dispatchEvent(new Event('input',{bubbles:true}));status.textContent=stamp+' 마크를 연습 메모에 추가했어요.'};
    current.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};
    current.onerror=()=>{setState('saving');status.textContent='녹음이 중단됐어요. 수신한 데이터를 저장하고 있어요.'};
    current.onstop=async()=>{
      const seconds=elapsed();
      setState('saving');releaseTracks();
      const blob=new Blob(chunks,{type:current.mimeType||chunks[0]?.type||''});
      if(!blob.size){setState('idle');status.textContent='녹음 데이터가 없어 저장하지 못했어요. 다시 시작해 주세요.';return}
      const song=document.querySelector('#practice-song');
      await saveItem({id:crypto.randomUUID(),name:$('#vzip-capture-name').value.trim()||'연습 '+new Date().toLocaleString('ko-KR'),
        created:Date.now(),songId:song?.value||'',song:song?.value?song.selectedOptions[0].textContent:'',
        type:blob.type,source:'practice',blob,durationSeconds:seconds,waveform:peaks.concat(peakCount?[peakMax]:[])});
    };
    recorder=current;
    const finish=()=>{if(['recording','paused'].includes(current.state)){stoppedAt=pausedAt||Date.now();setState('saving');current.stop()}};
    current.vzipFinish=finish;current.start(1000);clearRecovery();setState('recording');clock.textContent='00:00';
    acquired.getTracks().forEach(track=>track.addEventListener('ended',finish));
    // Visualize only live input. Failure here must not interrupt recording.
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;audioContext=new Audio();
      const source=audioContext.createMediaStreamSource(acquired),analyser=audioContext.createAnalyser();
      analyser.fftSize=256;source.connect(analyser);audioContext.resume().catch(()=>{});
      const data=new Uint8Array(analyser.fftSize),ctx=wave.getContext('2d');
      sampleLevel=()=>{analyser.getByteTimeDomainData(data);return data.reduce((max,value)=>Math.max(max,Math.abs(value-128)/128),0)};
      const draw=()=>{ctx.clearRect(0,0,wave.width,wave.height);if(state==='recording'){analyser.getByteTimeDomainData(data);ctx.strokeStyle='#a279e9';ctx.lineWidth=4;ctx.beginPath();data.forEach((value,index)=>{const x=index/(data.length-1)*wave.width,y=value/255*wave.height;index?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}animation=requestAnimationFrame(draw)};draw();
    }catch{if(audioContext){audioContext.close().catch(()=>{});audioContext=null}}

    tick=setInterval(()=>{if(state==='recording'){peakMax=Math.max(peakMax,sampleLevel());if(++peakCount>=peakSpan){peaks.push(peakMax);peakCount=0;peakMax=0;if(peaks.length>=512){peaks=peaks.filter((_,i)=>i%2===0).map((value,i)=>Math.max(value,peaks[i*2+1]));peakSpan*=2}}}const seconds=Math.floor(elapsed());clock.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')},500);
    status.textContent='● 녹음 중이에요. 종료하고 저장을 눌러주세요.';
  }catch(error){
    releaseTracks();setState('idle');
    status.textContent=error.name==='NotAllowedError'?'마이크·카메라 권한이 거부됐어요. Safari 웹사이트 권한을 확인해 주세요.':'녹음을 시작하지 못했어요: '+error.message;
  }
};
stop.onclick=()=>{
  if(!['recording','paused'].includes(state))return;
  try{recorder.vzipFinish()}catch(error){releaseTracks();setState('idle');status.textContent='종료 실패: '+error.message}
};
window.addEventListener('pagehide',()=>{
  token++;if(state==='requesting')setState('idle');
  if(['recording','paused'].includes(recorder?.state))try{recorder.vzipFinish()}catch{}
  releaseTracks();
});
})();