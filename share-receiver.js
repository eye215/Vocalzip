(()=>{
'use strict';
if('serviceWorker'in navigator)navigator.serviceWorker.register(new URL('share-worker.js',location.href),{scope:new URL('./',location.href).pathname}).catch(()=>{});
const query=new URLSearchParams(location.search);if(!query.has('shared')&&!query.has('share_error'))return;
function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('vzip_share_inbox_v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function receive(){
 const db=await openDb();let count=0;
 try{
  const files=await new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error)});
  for(const entry of files){
   let prepared;
   try{
    const type=window.vzipMediaType({name:entry.name,type:entry.type});
    prepared=await window.vzipPrepareMedia(new File([entry.blob],entry.name,{type,lastModified:entry.lastModified}));
    const file=prepared.file,metadata={...prepared.metadata,name:file.name.replace(/\.[^.]+$/,''),type:file.type||type,source:'import',song:'',songId:''};
    let id=crypto.randomUUID();
    if(file.size>25*1024*1024){if(!window.vzipCloudSignedIn?.())throw Error('25MB 초과 음원은 로그인 후 가져와 주세요.');id=(await window.vzipCloudImport(file,{...metadata,id})).id}
    else await window.vzipStorePracticeMedia({...metadata,id,blob:file});
    await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(entry.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    window.dispatchEvent(new CustomEvent('vzip:media-saved',{detail:{id,source:'import'}}));
    window.dispatchEvent(new CustomEvent('vzip:media-imported',{detail:{id,date:metadata.recordedDate}}));count++;
   }finally{await prepared?.dispose()}
  }
 }finally{db.close()}
 document.querySelector('.nav button[data-tab=media]')?.click();
 if(count)window.vzipNotice?.('음원 '+count+'개를 원본 날짜로 가져왔어요.');
}
window.addEventListener('load',()=>setTimeout(async()=>{
 try{if(query.has('shared'))await receive();else alert('공유 파일을 받을 수 없어요. 보관함에서 가져와 주세요.')}
 catch(error){alert('공유 파일 가져오기 실패: '+error.message)}
 finally{history.replaceState({},'',location.pathname)}
},1300));
})();
