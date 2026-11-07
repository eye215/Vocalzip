/* Read-only Project A bridge; isolated local ledger, cloud baseline and recovery. */
(()=>{'use strict';
const C=window.VzipBilling,B=window.VzipBillingBackup,APP_KEY='vocal-zip_mvp_v1',AUTH_KEY='sb-chxnbtiyuyhiywzeshis-auth-token';
function session(){try{const data=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');return data?.currentSession||data}catch{return null}}
// While the app still remembers the signed-in account (vzip_cloud_linked_user), an expired or momentarily missing session
// keeps using that account's ledger. Otherwise entries made then went to a separate '이 기기 전용' ledger and looked lost.
const appStorage=window.VzipAccountScope?.storage||window.localStorage;
function linkedUser(){try{return appStorage.getItem('vzip_cloud_linked_user')||''}catch{return ''}}
function account(){const user=session()?.user;if(user?.id)return {id:'user:'+user.id,label:user.email||'로그인 계정'};const linked=linkedUser();return linked?{id:'user:'+linked,label:'로그인 계정 (다시 로그인하면 클라우드도 사용할 수 있어요)'}:{id:'device',label:'이 기기 전용'}}
const initialAccount=account();
function ensureAccount(){window.VzipBillingSession?.assert();if(account().id!==initialAccount.id)throw Error('로그인 계정이 변경됐어요. 새로고침 후 계속해 주세요.')}
function lessons(){
 try{if(window.VzipBillingSession&&!window.VzipBillingSession.active)return [];const linked=appStorage.getItem('vzip_cloud_linked_user');if(linked&&initialAccount.id!=='user:'+linked)return [];
 const data=JSON.parse(appStorage.getItem(APP_KEY)||'{}');return (Array.isArray(data.lessons)?data.lessons:[]).filter(row=>row?.id).map(row=>({lesson_id:String(row.id),lesson_date:row.date||'',lesson_status:C.status(row.lesson_status||row.status),lesson_start:typeof row.startTime==='string'?row.startTime:'',lesson_end:typeof row.endTime==='string'?row.endTime:'',lesson_label:[row.place,row.teacher].filter(item=>typeof item==='string'&&item).join(' · '),billing_deduction_id:typeof row.billingDeductionId==='string'?row.billingDeductionId:'',lesson_touched:Math.max(Number(row.created)||0,Number(row.updatedAt)||0)}))}catch{return []}
}
function openNamed(name){return new Promise((resolve,reject)=>{const request=indexedDB.open(name,2);let blocked=false;
 request.onupgradeneeded=()=>{for(const name of ['documents','sync','recovery'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'owner'})};
 request.onblocked=()=>{blocked=true;reject(Error('이전 정산 탭을 닫고 다시 시도해 주세요.'))};
 request.onerror=()=>reject(request.error);request.onsuccess=()=>{if(blocked)request.result.close();else{request.result.onversionchange=()=>request.result.close();resolve(request.result)}};
})}
let migrated=null;
async function open(){
 if(window.VzipBillingSession)await window.VzipBillingSession.ready;
 ensureAccount();
 const scoped=!!window.VzipAccountScope,name=scoped?window.VzipAccountScope.billingDb():'vocalzip_billing_v1';
 const db=await openNamed(name);
 if(scoped){
  try{
   migrated ||= copyOwnedLegacy(db).catch(e=>{migrated=null;throw e;});
   await migrated;ensureAccount();
  }catch(e){db.close();throw e;}
 }
 return db;
}
async function copyOwnedLegacy(target){
 const legacy=await openNamed('vocalzip_billing_v1');
 try{
  const names=['documents','sync','recovery'];
  const values=await new Promise((resolve,reject)=>{
   const tx=legacy.transaction(names),out={};
   for(const name of names){const r=tx.objectStore(name).get(initialAccount.id);r.onsuccess=()=>{out[name]=r.result;};}
   tx.oncomplete=()=>resolve(out);tx.onerror=tx.onabort=()=>reject(tx.error||Error('이전 정산 읽기 실패'));
  });
  if(!values.documents)return;
  C.validateState(values.documents);
  if(values.documents.owner!==initialAccount.id)throw Error('이전 정산 소유자를 확인할 수 없어요.');
  await new Promise((resolve,reject)=>{
   ensureAccount();const tx=target.transaction(names,'readwrite'),existing=tx.objectStore('documents').get(initialAccount.id);
   existing.onsuccess=()=>{
    if(existing.result)return;
    for(const name of names)if(values[name]?.owner===initialAccount.id)tx.objectStore(name).add(values[name]);
   };
   tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('이전 정산 복사 실패. 원본은 유지됩니다.'));
  });
 }finally{legacy.close();}
}
async function transaction(write,fn){
 ensureAccount();const db=await open();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(['documents','sync','recovery'],write?'readwrite':'readonly'),documents=tx.objectStore('documents'),sync=tx.objectStore('sync'),recovery=tx.objectStore('recovery');
  const requests=[documents.get(initialAccount.id),sync.get(initialAccount.id),recovery.get(initialAccount.id)];let remaining=3,result,error;
  for(const request of requests)request.onsuccess=()=>{if(--remaining)return;try{
   ensureAccount();const state=C.validateState(requests[0].result||C.empty(initialAccount.id)),meta=requests[1].result||{owner:initialAccount.id,remoteRevision:0,syncedLocalRevision:null};
   result=fn({state,meta,previous:requests[2].result,documents,sync,recovery});
  }catch(problem){error=problem;tx.abort()}};
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('정산 저장이 중단됐어요. 입력 내용을 유지했어요.'));
 })}finally{db.close()}
}
function expected(state,revision){if(state.revision!==revision)throw Error('다른 정산 탭에서 데이터가 변경됐어요. 다시 불러온 뒤 입력을 확인해 주세요.')}
const load=()=>transaction(false,({state})=>state);
const status=()=>transaction(false,({state,meta,previous})=>({state,meta,recovery:previous?{at:previous.at,reason:previous.reason,summary:B.summary(previous.state)}:null}));
const save=(command,revision)=>transaction(true,({state,documents})=>{expected(state,revision);const next=C.reduce(state,command);documents.put(next);return next});
function replace(source,revision,{reason='backup.restore',allowOwnerChange=false,remoteRevision=null,undo=false}={}){
 const incoming=source?B.validate(source):null;
 return transaction(true,({state,meta,previous,documents,sync,recovery})=>{
  expected(state,revision);let next=undo?B.validate(previous?.state):incoming;
  if(!next)throw Error('복원할 기록이 없어요.');
  if(next.owner!==initialAccount.id&&!allowOwnerChange)throw Error('다른 계정 또는 기기의 백업이에요. 소유자 변경을 확인해 주세요.');
  if(remoteRevision!==null&&(!Number.isSafeInteger(remoteRevision)||remoteRevision<1||remoteRevision<meta.remoteRevision))throw Error('클라우드 버전이 변경됐어요. 다시 미리보기를 확인해 주세요.');
  next={...next,owner:initialAccount.id,revision:state.revision+1};
  // Keep the imported audit trail intact; the previous complete ledger is retained separately.
  recovery.put({owner:initialAccount.id,state,at:new Date().toISOString(),reason});
  documents.put(next);sync.put({...meta,remoteRevision:remoteRevision??meta.remoteRevision,syncedLocalRevision:remoteRevision===null?null:next.revision});
  return next;
 });
}
const acknowledge=(remoteRevision,sentRevision)=>transaction(true,({state,meta,sync})=>{
 if(!Number.isSafeInteger(remoteRevision)||remoteRevision<1||remoteRevision<meta.remoteRevision)throw Error('더 최신 클라우드 상태가 있어요. 다시 확인해 주세요.');
 if(!Number.isSafeInteger(sentRevision)||sentRevision>state.revision)throw Error('기기 버전을 확인해 주세요.');
 sync.put({...meta,remoteRevision,syncedLocalRevision:sentRevision});return state;
});
const clear=revision=>transaction(true,({state,documents,sync,recovery})=>{
 expected(state,revision);
 const next={...C.empty(initialAccount.id),revision:state.revision+1};
 documents.put(next);sync.delete(initialAccount.id);recovery.delete(initialAccount.id);
 return next;
});
const recoveryData=()=>transaction(false,({previous})=>previous?.state||null);
const ROWS=['passes','payments','deductions','adjustments','imports','importRows','history'];
/** Ledgers on this device saved under another owner (e.g. '이 기기 전용' while signed out) with records the current one lacks. */
async function others(current){
 if(window.VzipAccountScope){
  ensureAccount();
  const claim=window.localStorage.getItem('vzip_legacy_claim_owner_v1');
  if(claim&&claim!==window.VzipAccountScope.owner)return [];
  const legacy=await openNamed('vocalzip_billing_v1');
  try{
   const state=await new Promise((resolve,reject)=>{const q=legacy.transaction('documents').objectStore('documents').get('device');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
   if(!state||state.owner!=='device')return [];
   const missing=['passes','payments','deductions','adjustments'].reduce((n,key)=>{const have=new Set((current[key]||[]).map(x=>x.id));return n+(state[key]||[]).filter(x=>!x.voidedAt&&!have.has(x.id)).length;},0);
   return missing?[{owner:'device',label:'소유자 확인이 필요한 이전 기기 전용 정산',missing,state:C.validateState(state)}]:[];
  }finally{legacy.close();}
 }
 const db=await open();
 try{
  const all=await new Promise((resolve,reject)=>{const q=db.transaction('documents','readonly').objectStore('documents').getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)});
  return all.filter(doc=>doc?.owner&&doc.owner!==initialAccount.id).map(doc=>{
   const have=key=>new Set((current[key]||[]).map(row=>row.id));
   const missing=['passes','payments','deductions','adjustments'].reduce((n,key)=>{const ids=have(key);return n+(doc[key]||[]).filter(row=>!row.voidedAt&&!ids.has(row.id)).length},0);
   return {owner:doc.owner,label:doc.owner==='device'?'이 기기 전용 저장소':'다른 로그인 계정 저장소',missing,state:doc};
  }).filter(x=>x.missing>0);
 }finally{db.close()}
}
/** Add the records of another ledger on this device to the current one (nothing is removed; the previous state stays restorable). */
function mergeFrom(current,other){
 const merge=source=>{
  const next=JSON.parse(JSON.stringify(current));
  for(const key of ROWS){const ids=new Set(next[key].map(row=>row.id));for(const row of source[key]||[])if(!ids.has(row.id))next[key].push(row);}
  if(!next.hourlyRate&&source.hourlyRate)next.hourlyRate=source.hourlyRate;
  return replace(next,current.revision,{reason:'merge.'+source.owner,allowOwnerChange:true});
 };
 if(!window.VzipAccountScope)return merge(other);
 if(other?.owner!=='device')throw Error('다른 로그인 계정의 정산을 가져오지 않아요.');
 if(!navigator.locks?.request)throw Error('안전한 이전을 위해 최신 브라우저에서 다시 확인해 주세요.');
 return navigator.locks.request('vzip-legacy-import-owner',{mode:'exclusive'},async()=>{
  ensureAccount();const owner=window.VzipAccountScope.owner,claim=window.localStorage.getItem('vzip_legacy_claim_owner_v1');
  if(!owner||claim&&claim!==owner)throw Error('이전 자료의 소유 계정이 달라요.');
  const legacy=await openNamed('vocalzip_billing_v1');let source;
  try{source=await new Promise((resolve,reject)=>{const q=legacy.transaction('documents').objectStore('documents').get('device');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}finally{legacy.close();}
  if(!source||!B.same(source,other))throw Error('이전 정산이 변경됐어요. 다시 확인해 주세요.');
  ensureAccount();window.localStorage.setItem('vzip_legacy_claim_owner_v1',owner);
  return merge(C.validateState(source));
 });
}
window.VzipBillingStore={account:initialAccount,session,lessons,load,status,save,clear,replace,acknowledge,recoveryData,ensureAccount,others,mergeFrom};
window.addEventListener('storage',event=>{if((event.key===AUTH_KEY||event.key===null)&&account().id!==initialAccount.id)window.dispatchEvent(new Event('billing:account-changed'))});
})();
