/* In-browser streaming video optimizer. Uses <video> decode + canvas and MediaRecorder;
   never reads the original file into an ArrayBuffer. On unsupported devices it fails
   safely with a useful message rather than crashing the page. */
(()=>{'use strict';
const MB=1024*1024, LIMIT=100*MB;
window.vzipOptimizeVideo=async function(file,progress=()=>{}){
 if(file.size<=LIMIT)return file;
 if(!(/video\//.test(file.type)||/\.(mov|mp4|webm|m4v)$/i.test(file.name)))throw Error('100MB를 초과하는 음성 파일은 압축할 수 없어요.');
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw Error('이 브라우저는 자동 영상 압축을 지원하지 않아요. iPhone Safari 최신 버전에서 다시 시도해 주세요.');
 const url=URL.createObjectURL(file),video=document.createElement('video'),canvas=document.createElement('canvas');
 let context=null,stream=null,recorder=null,timer=null,raf=null,finished=false;
 const cleanup=()=>{finished=true;clearInterval(timer);cancelAnimationFrame(raf);try{recorder?.state==='recording'&&recorder.stop()}catch{};try{video.pause();video.removeAttribute('src');video.load()}catch{};try{stream?.getTracks().forEach(t=>t.stop())}catch{};try{context?.close()}catch{};URL.revokeObjectURL(url)};
 try{
  video.src=url;video.preload='metadata';video.playsInline=true;video.muted=false;
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('영상 정보를 읽지 못했어요. 파일 형식을 확인해 주세요.')),20000);video.onloadedmetadata=()=>{clearTimeout(timeout);resolve()};video.onerror=()=>{clearTimeout(timeout);reject(Error('영상 디코딩을 지원하지 않아요.'))}});
  const duration=video.duration;
  if(!Number.isFinite(duration)||duration<=0)throw Error('영상 길이를 확인할 수 없어요.');
  const width=video.videoWidth,height=video.videoHeight;
  if(!width||!height)throw Error('영상 해상도를 읽지 못했어요.');
  const ratio=Math.min(1,1280/Math.max(width,height));canvas.width=Math.max(2,Math.round(width*ratio/2)*2);canvas.height=Math.max(2,Math.round(height*ratio/2)*2);
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('영상 변환 메모리를 확보하지 못했어요.');
  stream=canvas.captureStream(24);
  // Route original audio into the output stream when supported.
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){try{context=new AC();const source=context.createMediaElementSource(video),dest=context.createMediaStreamDestination();source.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));await context.resume()}catch(e){throw Error('원본 음성을 보존할 수 없어 압축을 중단했어요. '+e.message)}}
  else throw Error('음성을 보존하는 압축을 지원하지 않는 브라우저예요.');
  const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime)throw Error('지원되는 영상 인코딩 형식이 없어요.');
  const targetBits=Math.max(350000,Math.min(2200000,Math.floor((LIMIT*.83*8/duration)-128000)));
  if(targetBits<=350000&&duration>900)throw Error('영상이 너무 길어 음질을 유지하면서 100MB 이하로 만들기 어려워요.');
  const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:targetBits,audioBitsPerSecond:128000});
  const result=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onerror=e=>reject(Error(e.error?.message||'영상 인코딩에 실패했어요.'));recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}))});
  const draw=()=>{if(finished)return;try{ctx.drawImage(video,0,0,canvas.width,canvas.height)}catch{};raf=requestAnimationFrame(draw)};
  video.currentTime=0;await video.play().catch(()=>{throw Error('브라우저에서 영상 재생이 차단됐어요. Safari에서 직접 업로드를 다시 시도해 주세요.')});
  draw();recorder.start(2000);progress(0);
  timer=setInterval(()=>{progress(Math.min(99,Math.round(video.currentTime/duration*100)));if(video.ended&&recorder.state==='recording')recorder.stop()},350);
  video.addEventListener('ended',()=>{if(recorder.state==='recording')recorder.stop()},{once:true});
  const blob=await result;
  if(!blob.size)throw Error('압축된 영상이 비어 있어요.');
  if(blob.size>LIMIT)throw Error('압축 후에도 100MB를 초과해요. 영상을 나누거나 길이를 줄여 주세요.');
  progress(100);
  const ext=mime.includes('mp4')?'mp4':'webm';
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'-optimized.'+ext,{type:blob.type,lastModified:file.lastModified});
 }finally{cleanup()}
};
})();
