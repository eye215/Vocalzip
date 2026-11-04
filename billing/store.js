/* Read-only Project A bridge plus independent IndexedDB ledger. */
(()=>{'use strict';
const C=window.VzipBilling,APP_KEY='vocal-zip_mvp_v1',AUTH_KEY='sb-chxnbtiyuyhiywzeshis-auth-token';
function account(){try{const data=JSON.parse(localStorage.getItem(AUTH_KEY)||'null'),user=data?.user||data?.currentSession?.user;if(user?.id)return {id:'user:'+user.id,label:user.email||'로그인 계정'}}catch{}return {id:'device',label:'이 기기 전용'}}
const initialAccount=account();
function ensureAccount(){if(account().id!==initialAccount.id)throw Error('로그인 계정이 변경됐어요. 새로고침 후 계속해 주세요.')}
function lessons(){
 try{const linked=localStorage.getItem('vzip_cloud_linked_user');if(linked&&initialAccount.id!=='user:'+linked)return [];
 const data=JSON.parse(localStorage.getItem(APP_KEY)||'{}');return (Array.isArray(data.lessons)?data.lessons:[]).filter(row=>row?.id).map(row=>({lesson_id:String(row.id),lesson_date:row.date||'',lesson_status:C.status(row.lesson_status||row.status)}))}catch{return []}
}
function open(){return new Promise((resolve,reject)=>{const request=indexedDB.open('vocalzip_billing_v1',1);let blocked=false;
 request.onupgradeneeded=()=>request.result.createObjectStore('documents',{keyPath:'owner'});
 request.onblocked=()=>{blocked=true;reject(Error('다른 정산 탭을 닫고 다시 시도해 주세요.'))};
 request.onerror=()=>reject(request.error);request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result)};
})}
async function transaction(command,expectedRevision){
 ensureAccount();const db=await open();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('documents',command?'readwrite':'readonly'),store=tx.objectStore('documents'),get=store.get(initialAccount.id);let result,error;
  get.onsuccess=()=>{
   try{
    ensureAccount();const state=C.validateState(get.result||C.empty(initialAccount.id));
    if(command){if(state.revision!==expectedRevision)throw Error('다른 정산 탭에서 데이터가 변경됐어요. 다시 불러온 뒤 입력을 확인해 주세요.');result=C.reduce(state,command);store.put(result)}else result=state;
   }catch(problem){error=problem;tx.abort()}
  };
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('정산 저장이 중단됐어요. 입력 내용을 유지했어요.'));
 })}finally{db.close()}
}
window.VzipBillingStore={account:initialAccount,lessons,load:()=>transaction(),save:(command,revision)=>transaction(command,revision),ensureAccount};
window.addEventListener('storage',event=>{if(event.key===AUTH_KEY&&account().id!==initialAccount.id)window.dispatchEvent(new Event('billing:account-changed'))});
})();
