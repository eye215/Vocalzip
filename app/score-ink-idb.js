/* Large editable-score ink storage foundation.
 * IndexedDB is per-device; cloud/device-to-device synchronization is NOT implied.
 * This deliberately does not delete or rewrite existing scoreAnnotations/localStorage.
 * Consumers must switch their read/write paths atomically before enabling imports.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VzipScoreInkIDB=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const DB_NAME='vzip_score_ink_v2',VERSION=2,STORE='strokes',META='migrations';
 const fail=(message,code)=>Object.assign(Error(message),{code});
 const clone=row=>JSON.parse(JSON.stringify(row));
 const keyOf=b=>[b.ownerId,b.scoreId,b.pdfHash];
 const pageKey=b=>[b.ownerId,b.scoreId,b.pdfHash,b.page];
 const sameBinding=(s,b)=>s.ownerId===b.ownerId&&s.songId===b.songId&&s.scoreId===b.scoreId&&s.r2Key===b.r2Key&&s.pdfHash===b.pdfHash;
 const reqPromise=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||fail('필기 저장소 요청 실패','storage'));});
 const finished=tx=>new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve(true);
  tx.onabort=()=>reject(tx.error||fail('필기 저장을 완료하지 못했어요.','storage'));
  tx.onerror=()=>{}; // abort reports the precise transaction failure
 });
 async function create({indexedDB:factory=typeof indexedDB==='undefined'?null:indexedDB,owner,identity,valid}={}){
  if(!factory||typeof factory.open!=='function')throw fail('이 브라우저에서 대용량 필기 저장을 사용할 수 없어요.','unsupported');
  if(typeof owner!=='string'||!owner||typeof identity!=='function'||typeof valid!=='function')throw fail('필기 저장소 설정을 확인해 주세요.','configuration');
  function current(){if(identity()?.owner!==owner)throw fail('계정이 바뀌어 필기 작업을 중단했어요.','identity');}
  current();
  const db=await new Promise((resolve,reject)=>{
   const req=factory.open(DB_NAME,VERSION);
   req.onupgradeneeded=()=>{
    const database=req.result;
    if(!database.objectStoreNames.contains(STORE)){
     const s=database.createObjectStore(STORE,{keyPath:'id'});
     s.createIndex('scope',['ownerId','scoreId','pdfHash']);
     s.createIndex('page',['ownerId','scoreId','pdfHash','page']);
    }
    if(!database.objectStoreNames.contains(META))database.createObjectStore(META,{keyPath:'key'});
   };
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||fail('필기 저장소를 열 수 없어요.','storage'));
   req.onblocked=()=>reject(fail('다른 탭에서 악보 편집기를 닫은 뒤 다시 시도해 주세요.','blocked'));
  });
  let closed=false;
  db.onversionchange=()=>{closed=true;db.close();};
  function check(){current();if(closed)throw fail('필기 저장소가 변경되어 다시 열어야 해요.','closed');}
  function binding(b){check();if(!b||b.ownerId!==owner||!b.songId||!b.scoreId||!b.r2Key||!b.pdfHash)throw fail('이 악보의 필기인지 확인할 수 없어요.','binding');}
  async function list(b,page=null){
   binding(b);
   const tx=db.transaction(STORE,'readonly'),s=tx.objectStore(STORE);
   const range=IDBKeyRange.only(page===null?keyOf(b):pageKey({...b,page}));
   const request=(page===null?s.index('scope'):s.index('page')).getAll(range);
   const done=finished(tx),rows=await reqPromise(request);await done;check();
   return rows.filter(row=>sameBinding(row,b)&&(page===null||row.page===page)).map(clone);
  }
  async function commit(b,{add=[],remove=[]}={}){
   binding(b);
   if(!Array.isArray(add)||!Array.isArray(remove)||add.some(row=>!valid(row)||!sameBinding(row,b))||remove.some(id=>typeof id!=='string'||!id))
    throw fail('필기 저장 요청의 형식을 확인해 주세요.','validation');
   const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);
   const done=finished(tx);
   let error=null;
   const abort=reason=>{if(!error){error=reason;try{tx.abort();}catch{}}};
   // Check ids within the same transaction so no racing tab can overwrite another version.
   const ops=[...add.map(row=>({op:'add',id:row.id,row})),...remove.map(id=>({op:'remove',id}))];
   for(const op of ops){
    const req=s.get(op.id);
    req.onsuccess=()=>{
     const old=req.result;
     if(op.op==='add'){
      if(old&&JSON.stringify(old)!==JSON.stringify(op.row))return abort(fail('같은 필기 ID에 다른 내용이 있어요.','conflict'));
      if(!old)s.put(clone(op.row));
     }else{
      if(old&&!sameBinding(old,b))return abort(fail('다른 악보의 필기는 지울 수 없어요.','identity'));
      if(old)s.delete(op.id);
     }
    };
    req.onerror=()=>abort(req.error||fail('필기를 확인하지 못했어요.','storage'));
   }
   try{await done;}catch(e){throw error||e;}
   check();return true;
  }
  const migrationKey=b=>JSON.stringify([b.ownerId,b.songId,b.scoreId,b.r2Key,b.pdfHash]);
  async function migrationState(b){
   binding(b);
   const tx=db.transaction(META,'readonly'),done=finished(tx),row=await reqPromise(tx.objectStore(META).get(migrationKey(b)));
   await done;check();return row||null;
  }
  async function migrateLegacy(b,rows){
   binding(b);
   if(!Array.isArray(rows)||rows.some(row=>!valid(row)||!sameBinding(row,b)))throw fail('기존 필기 전체의 형식을 확인해야 해요. 복사를 중단했어요.','validation');
   let count=0;
   // Copy only. A successful copy is never a signal to delete cloud/root/legacy data.
   for(let i=0;i<rows.length;i+=100){
    check();
    const part=rows.slice(i,i+100).filter(row=>valid(row)&&sameBinding(row,b));
    if(part.length){await commit(b,{add:part});count+=part.length;}
   }
   return {copied:count,legacyRetained:true};
  }
  async function ensureMigrated(b,rows){
   binding(b);
   if(await migrationState(b))return {copied:0,already:true,legacyRetained:true};
   const copy=await migrateLegacy(b,rows);
   check();
   const tx=db.transaction(META,'readwrite'),done=finished(tx);
   tx.objectStore(META).put({key:migrationKey(b),ownerId:owner,completedAt:Date.now(),count:rows.length});
   await done;check();return {...copy,already:false};
  }
  async function removeScore(b){
   binding(b);
   const rows=await list(b);
   for(let i=0;i<rows.length;i+=100)await commit(b,{remove:rows.slice(i,i+100).map(s=>s.id)});
   return rows.length;
  }
  async function removeScoreVersions({ownerId,scoreId,r2Key}={}){
   check();
   if(ownerId!==owner||!scoreId||!r2Key)throw fail('삭제할 악보를 확인할 수 없어요.','identity');
   const tx=db.transaction(STORE,'readwrite'),index=tx.objectStore(STORE).index('scope'),done=finished(tx);
   const range=IDBKeyRange.bound([owner,scoreId,''],[owner,scoreId,'\uffff']),cursor=index.openCursor(range);
   let removed=0;
   cursor.onsuccess=()=>{
    const row=cursor.result;
    if(!row)return;
    if(row.value.ownerId===owner&&row.value.scoreId===scoreId&&row.value.r2Key===r2Key){row.delete();removed++;}
    row.continue();
   };
   try{await done;}catch(e){throw e;}
   check();return removed;
  }
  return {list,commit,migrateLegacy,ensureMigrated,migrationState,removeScore,removeScoreVersions,close(){closed=true;db.close();},databaseName:DB_NAME};
 }
 return {create,DB_NAME,VERSION};
});
