/* Completed R2 uploads waiting for a library row. No blobs, tokens or automatic deletion. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VzipMediaUploadRecovery=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const PREFIX='vzip_r2_library_receipts_v1:',MAX_ROWS=1000,MAX_BYTES=4*1024*1024;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const error=(message,code)=>Object.assign(Error(message),{code});
 function create({storage,identity,loadRow,insertRow,stat,deletedIds}){
  const start=identity(),owner=start?.owner,session=start?.session;
  if(!owner||!session)throw error('로그인이 필요해요.','identity');
  const key=PREFIX+encodeURIComponent(owner);
  const current=()=>{const now=identity();if(now?.owner!==owner||now?.session!==session)throw error('로그인이 변경되어 복구를 중단했어요.','identity');};
  function valid(entry){
   const m=entry?.metadata,r=entry?.receipt;
   return !!r&&!!m&&entry?.owner===owner&&typeof entry.id==='string'&&/^[a-z0-9_-]{1,200}$/i.test(entry.id)&&
    m?.id===entry.id&&m.storageProvider==='r2'&&m.r2Key===r?.key&&m.size===r?.size&&m.r2Etag===r?.etag&&
    typeof r.key==='string'&&r.key.startsWith('u/'+owner+'/'+entry.id+'/')&&!r.key.includes('..')&&!r.key.includes('//')&&r.key.length<=300&&
    Number.isSafeInteger(r.size)&&r.size>0&&typeof r.etag==='string'&&r.etag.length>0&&r.etag.length<=200&&!/^W\//i.test(r.etag)&&!/[\r\n]/.test(r.etag);
  }
  function read(){
   current();const entries=[],keys=[];
   for(let i=0;i<storage.length;i++){const name=storage.key(i);if(name?.startsWith(key+':'))keys.push(name);}
   let bytes=0;
   for(const name of keys){
    const raw=storage.getItem(name);if(raw===null)continue;bytes+=raw.length*2;
    let entry;try{entry=JSON.parse(raw);}catch{throw error('업로드 복구 기록을 읽지 못했어요. 원본 기록은 보존했어요.','corrupt');}
    if(entry?.version!==1||!valid(entry)||name!==key+':'+entry.id)throw error('업로드 복구 기록 형식을 확인해야 해요.','corrupt');
    entries.push(entry);
   }
   if(entries.length>MAX_ROWS||bytes>MAX_BYTES)throw error('업로드 복구 기록 한도를 확인해야 해요.','capacity');
   return {entries,bytes};
  }
  function remember(metadata,receipt){
   current();if(!metadata||!receipt)throw error('업로드 결과를 확인하지 못했어요.','receipt');
   const entry={version:1,owner,id:metadata.id,metadata:clone({...metadata,r2Etag:receipt.etag}),receipt:{key:receipt.key,size:receipt.size,etag:receipt.etag}};
   if(!valid(entry))throw error('업로드 결과를 확인하지 못했어요.','receipt');
   const data=read(),previous=data.entries.find(x=>x.id===entry.id);
   if(previous){
    if(previous.receipt.key!==entry.receipt.key||previous.receipt.etag!==entry.receipt.etag||previous.receipt.size!==entry.receipt.size)
     throw error('같은 ID의 이전 업로드 결과가 남아 있어요.','conflict');
    return clone(previous);
   }
   if(data.entries.length>=MAX_ROWS)throw error('업로드 복구 기록 개수 한도에 도달했어요.','capacity');
   const json=JSON.stringify(entry);if(data.bytes+json.length*2>MAX_BYTES)throw error('업로드 복구 기록 공간이 부족해요.','capacity');
   current();storage.setItem(key+':'+entry.id,json);current();return clone(entry);
  }
  function forget(id){
   current();storage.removeItem(key+':'+id);current();
  }
  async function deleted(id){const ids=await deletedIds();current();if(!Array.isArray(ids))throw error('삭제 기록을 확인하지 못했어요.','deleted_unavailable');return ids.includes(id);}
  function acknowledge(id,row){
   const entry=read().entries.find(x=>x.id===id);
   if(!entry)throw error('업로드 복구 기록이 없어요.','receipt');
   if(row?.id!==id||row.storageProvider!=='r2'||row.r2Key!==entry.receipt.key||row.size!==entry.receipt.size||
    (row.r2Etag&&row.r2Etag!==entry.receipt.etag))throw error('같은 ID의 다른 전체 녹음 기록을 덮어쓰지 않았어요.','conflict');
   try{forget(id);}catch(e){if(e.code==='identity')throw e;}
   return clone(row);
  }
  async function recover(id){
   current();const entry=read().entries.find(x=>x.id===id);if(!entry)return null;
   if(await deleted(id))throw error('삭제한 파일은 전체 녹음에 다시 연결하지 않아요.','deleted');
   let row=await loadRow(id);current();
   const head=await stat(entry.receipt.key);current();
   if(!head||head.size!==entry.receipt.size||head.etag!==entry.receipt.etag)
    throw error('저장된 원본이 업로드 결과와 달라 복구를 중단했어요.','object_changed');
   const same=metadata=>metadata?.id===id&&metadata.storageProvider==='r2'&&metadata.r2Key===entry.receipt.key&&metadata.size===entry.receipt.size&&
    (!metadata.r2Etag||metadata.r2Etag===entry.receipt.etag);
   if(row&&!same(row))throw error('같은 ID의 다른 전체 녹음 기록을 덮어쓰지 않았어요.','conflict');
   if(!row){
    if(await deleted(id))throw error('삭제한 파일은 전체 녹음에 다시 연결하지 않아요.','deleted');
    // INSERT ON CONFLICT DO NOTHING. Even an intervening write must win.
    let insertError;
    try{await insertRow(id,clone(entry.metadata));}catch(e){insertError=e;}
    current();row=await loadRow(id);current();
    if(!row)throw insertError||error('전체 녹음 연결을 확인하지 못했어요. 올린 파일은 지우지 않았어요.','unconfirmed');
    if(!same(row))throw error('다른 기기에서 저장한 전체 녹음 기록을 덮어쓰지 않았어요.','conflict');
   }
   if(await deleted(id))throw error('삭제 기록이 확인되어 복구를 중단했어요.','deleted');
   return acknowledge(id,row);
  }
  return {remember,recover,acknowledge,pending:()=>clone(read().entries),key};
 }
 return {create};
});
