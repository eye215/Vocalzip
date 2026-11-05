/* Read-only Project A bridge; isolated local ledger, cloud baseline and recovery. */
(()=>{'use strict';
const C=window.VzipBilling,B=window.VzipBillingBackup,APP_KEY='vocal-zip_mvp_v1',AUTH_KEY='sb-chxnbtiyuyhiywzeshis-auth-token';
function session(){try{const data=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');return data?.currentSession||data}catch{return null}}
function account(){const user=session()?.user;return user?.id?{id:'user:'+user.id,label:user.email||'로그인 계정'}:{id:'device',label:'이 기기 전용'}}
const initialAccount=account();
function ensureAccount(){if(account().id!==initialAccount.id)throw Error('로그인 계정이 변경됐어요. 새로고침 후 계속해 주세요.')}
function lessons(){
 try{const linked=localStorage.getItem('vzip_cloud_linked_user');if(linked&&initialAccount.id!=='user:'+linked)return [];
 const data=JSON.parse(localStorage.getItem(APP_KEY)||'{}');return (Array.isArray(data.lessons)?data.lessons:[]).filter(row=>row?.id).map(row=>({lesson_id:String(row.id),lesson_date:row.date||'',lesson_status:C.status(row.lesson_status||row.status),lesson_start:typeof row.startTime==='string'?row.startTime:'',lesson_end:typeof row.endTime==='string'?row.endTime:'',lesson_label:[row.place,row.teacher].filter(item=>typeof item==='string'&&item).join(' · '),billing_deduction_id:typeof row.billingDeductionId==='string'?row.billingDeductionId:'',lesson_touched:Math.max(Number(row.created)||0,Number(row.updatedAt)||0)}))}catch{return []}
}
function open(){return new Promise((resolve,reject)=>{const request=indexedDB.open('vocalzip_billing_v1',2);let blocked=false;
 request.onupgradeneeded=()=>{for(const name of ['documents','sync','recovery'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'owner'})};
 request.onblocked=()=>{blocked=true;reject(Error('이전 정산 탭을 닫고 다시 시도해 주세요.'))};
 request.onerror=()=>reject(request.error);request.onsuccess=()=>{if(blocked)request.result.close();else{request.result.onversionchange=()=>request.result.close();resolve(request.result)}};
})}
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
window.VzipBillingStore={account:initialAccount,session,lessons,load,status,save,clear,replace,acknowledge,recoveryData,ensureAccount};
window.addEventListener('storage',event=>{if((event.key===AUTH_KEY||event.key===null)&&account().id!==initialAccount.id)window.dispatchEvent(new Event('billing:account-changed'))});
})();
