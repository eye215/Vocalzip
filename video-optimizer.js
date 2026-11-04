/* Optional video-only compression. The worker copies and verifies every encoded audio packet. */
(()=>{
'use strict';
let active=false;const resources=new Set();
window.vzipCanCompressVideo=()=>typeof Worker==='function'&&typeof VideoEncoder==='function'&&typeof VideoDecoder==='function'&&!!navigator.storage?.getDirectory;
window.vzipVideoCompressionOption=(file,initial=false)=>{
 const host=document.createElement('label');host.className='vzip-compression-option';
 const input=document.createElement('input');input.type='checkbox';input.checked=initial&&window.vzipCanCompressVideo();
 input.disabled=!window.vzipCanCompressVideo();
 const text=document.createElement('span');text.textContent='영상만 압축 · 음성 원본 유지 (720p)';
 const hint=document.createElement('small');hint.textContent=input.disabled?'이 브라우저에서는 원본 업로드를 이용해 주세요.':'영상 화질을 낮춰 전송량을 줄여요. 압축 중에도 화면을 유지해 주세요.';
 host.append(input,text,hint);host.hidden=!/^(video\/)|\.(mov|mp4|m4v|webm)$/i.test((file.type||'')+' '+(file.name||''));
 return {element:host,get selected(){return !host.hidden&&input.checked&&!input.disabled}};
};
async function remove(id){for(let attempt=0;attempt<5;attempt++){try{const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle('vzip-video-temp-v1');await directory.removeEntry(id);return}catch(error){if(error.name==='NotFoundError')return;await new Promise(resolve=>setTimeout(resolve,100))}}}
async function compress(file,{signal,onProgress=()=>{}}={}){
 if(active)throw Error('다른 영상을 압축 중이에요. 완료한 뒤 다시 시도해 주세요.');
 if(!window.vzipCanCompressVideo())throw Error('이 브라우저에서는 영상 압축을 지원하지 않아요. 원본 업로드를 선택해 주세요.');
 if(file.size>1024*1024*1024)throw Error('압축할 원본은 최대 1GB까지 선택할 수 있어요.');
 if(signal?.aborted)throw new DOMException('압축을 취소했어요.','AbortError');
 active=true;
 const id=Date.now()+'-'+crypto.randomUUID();let worker;
 try{worker=new Worker(new URL('video-compress-worker.js?v=1',location.href),{type:'module'})}catch(error){active=false;throw Error('압축 기능을 시작하지 못했어요. 원본 업로드를 선택해 주세요.')}
 let disposed=false;
 const dispose=async()=>{if(disposed)return;disposed=true;resources.delete(dispose);worker.terminate();await remove(id)};
 resources.add(dispose);
 try{
  return await new Promise((resolve,reject)=>{
   let settled=false;
   const finish=async(error,result)=>{
    if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);
    active=false;
    if(error){await dispose();reject(error)}else{worker.terminate();resolve({...result,dispose})}
   };
   const cancel=()=>{worker.postMessage({type:'cancel'});finish(new DOMException('압축을 취소했어요.','AbortError'))};
   signal?.addEventListener('abort',cancel,{once:true});
   worker.onmessage=event=>{
    const data=event.data;
    if(data.type==='progress'){if(!settled)onProgress(data.value,data.message)}
    else if(data.type==='done')finish(null,{file:data.file,proof:data.proof});
    else if(data.type==='error'){const error=Error(data.message);error.name=data.name||'Error';finish(error)}
   };
   worker.onerror=event=>{event.preventDefault();finish(Error('압축 모듈을 실행하지 못했어요. 원본 업로드를 선택해 주세요.'))};
   if(signal?.aborted){cancel();return}
   worker.postMessage({type:'compress',file,id});
  });
 }catch(error){active=false;await dispose();throw error}
}
window.vzipCompressVideo=(file,options={})=>{
 if(navigator.locks?.request)return navigator.locks.request('vzip-video-compression',{ifAvailable:true},lock=>{
  if(!lock)throw Error('다른 탭에서 영상을 압축 중이에요. 완료 후 다시 시도해 주세요.');
  return compress(file,options);
 });
 return compress(file,options);
};
window.addEventListener('pagehide',()=>{for(const dispose of [...resources])dispose()});
})();
