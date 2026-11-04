/* Manual, revision-checked cloud transfer. Never writes the app's auth or data keys. */
(()=>{'use strict';
const S=window.VzipBillingStore,B=window.VzipBillingBackup;
const URL='https://chxnbtiyuyhiywzeshis.supabase.co',KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeG5idGl5dXloaXl3emVzaGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDA0ODcsImV4cCI6MjEwOTE3NjQ4N30.65LSQMuaq8MQOpFUjCSyRT4ZITtNxKF3c_xa_ZVEi_E";
function credentials(){
 S.ensureAccount();const session=S.session();
 if(!S.account.id.startsWith('user:')||!session?.access_token)throw Error('VOCAL.zip에서 로그인한 뒤 정산 화면을 새로고침해 주세요.');
 if(session.expires_at&&session.expires_at*1000<=Date.now())throw Error('로그인 시간이 만료됐어요. VOCAL.zip에서 다시 연결한 뒤 돌아와 주세요.');
 return {token:session.access_token,userId:S.account.id.slice(5)};
}
async function request(path,body){
 const auth=credentials(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(URL+path,{method:body?'POST':'GET',headers:{apikey:KEY,Authorization:'Bearer '+auth.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
  const data=await response.json();S.ensureAccount();
  if(!response.ok){
   if(response.status===401||response.status===403)throw Error('로그인 또는 정산 접근 권한을 확인해 주세요. VOCAL.zip에서 다시 로그인할 수 있어요.');
   if(response.status===409||data.code==='PT409')throw Error('다른 기기에서 클라우드를 수정했어요. 덮어쓰지 않았습니다. 클라우드 가져오기에서 비교해 주세요.');
   throw Error('클라우드 요청 실패 ('+response.status+'). 기기 기록은 유지됩니다.');
  }
  return data;
 }catch(error){if(error.name==='AbortError')throw Error('클라우드 응답 시간이 초과됐어요. 다시 확인하면 저장 여부를 확인할 수 있습니다.');if(error instanceof TypeError)throw Error('클라우드에 연결하지 못했어요. 기기 기록은 유지됩니다.');throw error}
 finally{clearTimeout(timeout)}
}
function envelope(row){
 if(!row)return null;
 if(!Number.isSafeInteger(row.revision)||row.revision<1||!row.payload)throw Error('클라우드 정산 형식을 확인해 주세요.');
 const payload=B.parse(JSON.stringify(row.payload));if(payload.owner!==S.account.id)throw Error('클라우드 소유자가 현재 계정과 달라요.');
 return {payload,revision:row.revision,updatedAt:row.updated_at,requestId:row.last_request_id};
}
async function read(){
 const {userId}=credentials(),rows=await request('/rest/v1/vocal_billing_documents?select=payload,revision,updated_at,last_request_id&user_id=eq.'+encodeURIComponent(userId));
 if(!Array.isArray(rows)||rows.length>1)throw Error('클라우드 응답 형식을 확인해 주세요.');
 return envelope(rows[0]);
}
async function preview(direction){
 const local=await S.status(),remote=await read();S.ensureAccount();
 if(direction==='download'){if(!remote)throw Error('클라우드에 저장된 정산이 없어요.');return {direction,localRevision:local.state.revision,payload:remote.payload,remoteRevision:remote.revision,remoteAt:remote.updatedAt,before:B.summary(local.state),after:B.summary(remote.payload)}}
 const payload=B.parse(JSON.stringify(local.state));
 // A matching payload also recovers a committed upload whose response was lost.
 const identical=remote&&B.same(payload,remote.payload);
 if(!identical&&(remote?.revision||0)!==local.meta.remoteRevision)throw Error('다른 기기의 클라우드 기록이 있어요. 먼저 클라우드 가져오기에서 비교해 주세요. 현재 기기 기록은 자동으로 덮어쓰지 않습니다.');
 return {direction:'upload',localRevision:local.state.revision,payload,remoteRevision:remote?.revision||0,identical:!!identical,requestId:crypto.randomUUID(),before:remote?B.summary(remote.payload):null,after:B.summary(payload)};
}
async function commit(plan){
 S.ensureAccount();const current=await S.load();if(current.revision!==plan.localRevision)throw Error('미리보기 이후 기기 기록이 변경됐어요. 다시 미리보기를 만들어 주세요.');
 if(plan.direction==='download'){
  // Recheck the remote revision just before local replacement.
  const remote=await read();if(!remote||remote.revision!==plan.remoteRevision||!B.same(remote.payload,plan.payload))throw Error('미리보기 이후 클라우드가 변경됐어요. 다시 미리보기를 만들어 주세요.');
  return S.replace(plan.payload,plan.localRevision,{reason:'cloud.download',remoteRevision:plan.remoteRevision});
 }
 if(plan.identical){const remote=await read();if(!remote||remote.revision!==plan.remoteRevision||!B.same(remote.payload,plan.payload))throw Error('클라우드가 변경됐어요. 다시 확인해 주세요.');return S.acknowledge(remote.revision,plan.localRevision)}
 const result=envelope(await request('/rest/v1/rpc/vocal_billing_save',{p_expected_revision:plan.remoteRevision,p_payload:plan.payload,p_request_id:plan.requestId}));
 if(!result||!B.same(result.payload,plan.payload))throw Error('클라우드 저장 응답이 달라요. 다시 확인해 주세요.');
 return S.acknowledge(result.revision,plan.localRevision);
}
window.VzipBillingCloud={read,preview,commit};
})();
