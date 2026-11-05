/* Inspect capture dates and turn selected videos into losslessly copied audio files. */
(()=>{
'use strict';
let active=false;const resources=new Set();
const video=file=>file.type?.startsWith('audio/')?false:file.type?.startsWith('video/')||/\.(mov|mp4|m4v|webm)$/i.test(file.name||'');
async function remove(id){if(!navigator.storage?.getDirectory)return;for(let n=0;n<5;n++)try{const folder=await(await navigator.storage.getDirectory()).getDirectoryHandle('vzip-audio-temp-v1');await folder.removeEntry(id);return}catch(error){if(error.name==='NotFoundError')return;await new Promise(resolve=>setTimeout(resolve,100))}}
window.vzipPrepareMedia=async(file,{signal,onProgress=()=>{}}={})=>{
 if(!file?.size)throw Error('빈 파일은 가져올 수 없어요.');
 if(file.size>1024*1024*1024)throw Error('원본 파일은 최대 1GB까지 선택할 수 있어요.');
 if(signal?.aborted)throw new DOMException('가져오기를 취소했어요.','AbortError');
 const fallback=()=>({file,metadata:VzipMediaDates.pick({},file.lastModified),dispose:async()=>{}});
 if(typeof Worker!=='function'){if(video(file))throw Error('영상 대신 음원 파일로 가져와 주세요.');return fallback()}
 if(active)throw Error('다른 파일을 준비 중이에요. 완료 후 다시 시도해 주세요.');
 active=true;const id=Date.now()+'-'+crypto.randomUUID();let worker;
 try{worker=new Worker(new URL('audio-extract-worker.js?v=4',location.href),{type:'module'})}catch(error){active=false;if(!video(file))return fallback();throw Error('영상의 음원 추출을 시작하지 못했어요. 음원 파일로 가져와 주세요.')}
 let disposed=false;
 const dispose=async()=>{if(disposed)return;disposed=true;worker.terminate();resources.delete(dispose);await remove(id)};
 resources.add(dispose);
 return new Promise((resolve,reject)=>{
  let settled=false,requiresExtraction=video(file);
  const finish=async(error,data)=>{
   if(settled)return;settled=true;active=false;signal?.removeEventListener('abort',cancel);
   if(error){await dispose();reject(error)}else{
    worker.terminate();
    if(!data.file){await dispose();resolve({file,metadata:data.metadata,dispose:async()=>{}})}
    else resolve({file:data.file,metadata:data.metadata,dispose});
   }
  };
  const cancel=()=>{worker.postMessage({type:'cancel'});finish(new DOMException('가져오기를 취소했어요.','AbortError'))};
  signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=event=>{const data=event.data;if(data.type==='detected-video'){requiresExtraction=true}else if(data.type==='progress'){if(!settled)onProgress(data.message)}else if(data.type==='done')finish(null,data);else if(data.type==='error'){if(!requiresExtraction&&data.name!=='AbortError'){finish(null,{metadata:VzipMediaDates.pick({},file.lastModified)});return}const error=Error(data.message);error.name=data.name||'Error';finish(error)}};
  worker.onerror=event=>{event.preventDefault();if(!video(file))finish(null,{metadata:VzipMediaDates.pick({},file.lastModified)});else finish(Error('영상에서 음성을 읽지 못했어요. 음원 파일로 가져와 주세요.'))};
  if(signal?.aborted){cancel();return}
  onProgress(video(file)?'영상의 음성과 촬영 날짜를 읽는 중…':'녹음 날짜를 읽는 중…');
  worker.postMessage({type:'prepare',file,id,videoHint:video(file)});
 });
};
/** Read capture date and length only (no extraction). Never throws: unreadable files fall back to file info. */
window.vzipInspectMedia=(file,{signal}={})=>new Promise((resolve,reject)=>{
 const fallback=extra=>({metadata:VzipMediaDates.pick({},file.lastModified),duration:null,readable:false,...extra});
 if(typeof Worker!=='function'){resolve(fallback());return}
 let worker;try{worker=new Worker(new URL('audio-extract-worker.js?v=4',location.href),{type:'module'})}catch{resolve(fallback());return}
 let settled=false;const finish=value=>{if(settled)return;settled=true;worker.terminate();signal?.removeEventListener('abort',abort);resolve(value)};
 const abort=()=>{if(settled)return;settled=true;worker.postMessage({type:'cancel'});worker.terminate();reject(new DOMException('가져오기를 취소했어요.','AbortError'))};
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>finish(fallback({timedOut:true})),30000);
 worker.onmessage=event=>{const data=event.data;if(data.type==='done'){clearTimeout(timer);finish({metadata:data.metadata,...(data.inspect||{})})}else if(data.type==='error'){clearTimeout(timer);finish(fallback({error:data.message}))}};
 worker.onerror=event=>{event.preventDefault();clearTimeout(timer);finish(fallback())};
 worker.postMessage({type:'prepare',file,id:'inspect-'+crypto.randomUUID(),videoHint:false,inspect:true});
});
window.addEventListener('pagehide',()=>{for(const dispose of [...resources])dispose()});
})();
