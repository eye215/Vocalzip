/* Register private range streams without downloading/assembling the original file. */
(()=>{
'use strict';
let pending;
async function worker(){
 if(!('serviceWorker' in navigator))throw Error('이 브라우저는 대용량 재생을 지원하지 않아요. 최신 Safari 또는 Chrome을 사용해 주세요.');
 if(pending)return pending;
 pending=(async()=>{
  const registration=await navigator.serviceWorker.register(new URL('share-worker.js',location.href),{scope:new URL('./',location.href).pathname});
  await registration.update();
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{
   const done=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve()};
   const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);reject(Error('대용량 재생 준비에 실패했어요. 새로고침 후 재생해 주세요.'))},15000);
   navigator.serviceWorker.addEventListener('controllerchange',done);
   if(navigator.serviceWorker.controller)done();
  });
  return navigator.serviceWorker.controller;
 })().catch(error=>{pending=null;throw error});
 return pending;
}
async function send(message){
 const target=await worker();
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('대용량 재생 준비 시간이 초과됐어요.'))},10000);
  channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data.error?reject(Error(event.data.error)):resolve(event.data)};
  target.postMessage(message,[channel.port2]);
 });
}
window.vzipChunkMediaURL=async(item,sign)=>{
 VzipChunks.validate(item);
 const signed=[];
 for(const part of item.parts)signed.push({...part,url:await sign(part.path)});
 const id=crypto.randomUUID();
 await send({type:'vzip-stream-open',id,item:{storageVersion:2,size:item.size,type:item.type,parts:signed},expires:Date.now()+55*60*1000});
 return new URL('__vzip_media__/'+id,location.href).href;
};
window.vzipRevokeChunkMedia=()=>{
 navigator.serviceWorker?.controller?.postMessage({type:'vzip-stream-clear'});
};
})();
