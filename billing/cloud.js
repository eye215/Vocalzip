/* Manual, revision-checked cloud transfer. Never writes the app's auth or data keys. */
(()=>{'use strict';
const localStorage=window.VzipAccountScope?.storage||window.localStorage;
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
  const response=await fetch(URL+path,{method:body?'POST':'GET',headers:{apikey:KEY,Authorization:'Bearer '+auth.token,...(window.VzipAccountScope?{'X-Client-Info':'vocalzip-device-session-v2'}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
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
 const result=envelope(rows[0]);if(result)await S.rememberDeletionGuards(result.payload);return result;
}
/** Read only this account's current lesson IDs. Dates never identify a deletion target. */
async function lessonDeletionTargets(row){
 let lessons=S.lessons().map(l=>({id:l.lesson_id,billingDeductionId:l.billing_deduction_id}));
 if(S.account.id.startsWith('user:')){
  const {userId}=credentials();
  const capability=await request('/rest/v1/rpc/vzip_lesson_delete_capabilities',{});
  if(capability?.version!==1||!capability.charge_guard||!capability.lesson_permanent)throw Error('안전한 삭제를 위한 서버 확인을 마치지 못했어요.');
  const remote=await request('/rest/v1/vocal_data?select='+encodeURIComponent('lessons:payload->lessons')+'&user_id=eq.'+encodeURIComponent(userId));
  if(!Array.isArray(remote)||remote.length>1||remote[0]&&remote[0].lessons!==null&&!Array.isArray(remote[0].lessons))throw Error('연결 레슨 응답을 확인하지 못했어요.');
  lessons=lessons.concat(remote[0]?.lessons||[]);
 }
 const hits=lessons.filter(l=>l?.id&&(l.id===row.lessonId||l.billingDeductionId===row.id));
 return [...new Set(hits.map(l=>l.id))];
}
async function preview(direction){
 const local=await S.status(),remote=await read();S.ensureAccount();
 if(direction==='download'){if(!remote)throw Error('클라우드에 저장된 정산이 없어요.');return {direction,localRevision:local.state.revision,payload:remote.payload,remoteRevision:remote.revision,remoteAt:remote.updatedAt,before:B.summary(local.state),after:B.summary(remote.payload)}}
 const payload=B.parse(JSON.stringify(local.state));await S.checkDeletionGuards(payload);
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
 await S.checkDeletionGuards(plan.payload);
 if(plan.identical){const remote=await read();if(!remote||remote.revision!==plan.remoteRevision||!B.same(remote.payload,plan.payload))throw Error('클라우드가 변경됐어요. 다시 확인해 주세요.');return S.acknowledge(remote.revision,plan.localRevision)}
 const result=envelope(await request('/rest/v1/rpc/vocal_billing_save',{p_expected_revision:plan.remoteRevision,p_payload:plan.payload,p_request_id:plan.requestId}));
 if(!result||!B.same(result.payload,plan.payload))throw Error('클라우드 저장 응답이 달라요. 다시 확인해 주세요.');
 return S.acknowledge(result.revision,plan.localRevision);
}
/* ---------- automatic sync ----------
 * Uses the same revision checks as the manual transfer. Only one side changed since the last sync: it is copied
 * (upload, or download that keeps the previous ledger in recovery). Both changed and different: nothing is written;
 * the user chooses (merge, cloud, this device). Off per account in 백업·동기화. */
const AKEY='vzip_billing_autosync_v1';
function autoOn(){try{const all=JSON.parse(localStorage.getItem(AKEY)||'{}');if(window.VzipAccountScope&&!Object.hasOwn(all,S.account.id))return JSON.parse(window.localStorage.getItem(AKEY)||'{}')[S.account.id]!==false;return all[S.account.id]!==false;}catch{return true}}
function setAuto(on){try{const all=JSON.parse(localStorage.getItem(AKEY)||'{}');if(window.VzipAccountScope)all[S.account.id]=!!on;else if(on)delete all[S.account.id];else all[S.account.id]=false;localStorage.setItem(AKEY,JSON.stringify(all))}catch{}}
const empty=state=>!['passes','payments','deductions','adjustments'].some(key=>(state[key]||[]).length);
async function push(state,expected){
 const payload=B.parse(JSON.stringify(state));await S.checkDeletionGuards(payload);
 const result=envelope(await request('/rest/v1/rpc/vocal_billing_save',{p_expected_revision:expected,p_payload:payload,p_request_id:crypto.randomUUID()}));
 if(!result||!B.same(result.payload,payload))throw Error('클라우드 저장 응답이 달라요. 다시 확인해 주세요.');
 await S.acknowledge(result.revision,state.revision);return result;
}
let syncing=null;
function sync(){
 return syncing||=(async()=>{try{
  credentials();
  const local=await S.status(),state=local.state,meta=local.meta,remote=await read();
  const remoteRevision=remote?.revision||0,localChanged=meta.syncedLocalRevision!==state.revision,remoteChanged=remoteRevision!==meta.remoteRevision;
  if(!remote){if(empty(state))return {action:'none'};await push(state,0);return {action:'upload'}}
  if(!localChanged&&!remoteChanged)return {action:'none'};
  if(localChanged&&!remoteChanged){await push(state,remoteRevision);return {action:'upload'}}
  if(B.same(B.parse(JSON.stringify(state)),remote.payload)){await S.acknowledge(remoteRevision,state.revision);return {action:'none'}}
  if(!localChanged||empty(state)){await S.replace(remote.payload,state.revision,{reason:'cloud.auto',remoteRevision});return {action:'download'}}
  return {action:'conflict',remote};
 }finally{syncing=null}})();
}
/** Both ledgers' records: same record id → the higher version (edits and deletions raise it); everything else is kept. */
function mergeStates(mine,theirs){
 const next=JSON.parse(JSON.stringify(mine));
 for(const key of ['passes','payments','deductions','adjustments','imports','importRows','history']){
  const at=new Map(next[key].map((row,i)=>[row.id,i]));
  for(const row of theirs[key]||[]){
   if(!at.has(row.id)){at.set(row.id,next[key].length);next[key].push(row);continue}
   const i=at.get(row.id);if(Number(row.version||0)>Number(next[key][i].version||0))next[key][i]=row;
  }
 }
 if(!next.hourlyRate&&theirs.hourlyRate)next.hourlyRate=theirs.hourlyRate;
 return next;
}
/** After a conflict: 'merge' (both, then upload), 'cloud' (take the cloud's), 'device' (send this device's). */
async function resolve(choice){
 credentials();const local=await S.status(),state=local.state,remote=await read();
 if(!remote)return push(state,0);
 if(choice==='cloud')return S.replace(remote.payload,state.revision,{reason:'cloud.conflict.cloud',remoteRevision:remote.revision});
 if(choice==='device')return push(state,remote.revision);
 const merged=await S.replace(mergeStates(state,remote.payload),state.revision,{reason:'cloud.conflict.merge'});
 return push(merged,remote.revision);
}
/* ---------- versions kept on the server (supabase/migrations/20261106_keep_history.sql) ---------- */
/** Saved versions of this account's ledger, newest first (id, time, revision). Null when the server has no history yet. */
async function versions(){
 const {userId}=credentials();
 try{
  const rows=await request('/rest/v1/vocal_history?select=id,op,at,rev:data->>revision&source=eq.vocal_billing_documents&user_id=eq.'+encodeURIComponent(userId)+'&order=at.desc,id.desc&limit=60');
  return Array.isArray(rows)?rows:[];
 }catch(error){if(/\(404\)|\(400\)/.test(error.message))return null;throw error}
}
async function version(id){
 const {userId}=credentials(),rows=await request('/rest/v1/vocal_history?select=data&source=eq.vocal_billing_documents&user_id=eq.'+encodeURIComponent(userId)+'&id=eq.'+encodeURIComponent(id));
 const payload=rows?.[0]?.data?.payload;if(!payload)throw Error('그 버전을 찾지 못했어요.');
 const parsed=B.parse(JSON.stringify(payload));if(parsed.owner!==S.account.id)throw Error('다른 계정의 기록이에요.');
 return parsed;
}
/** Make a kept version the ledger on this device (the current one stays restorable); automatic sync then sends it. */
async function restoreVersion(id){const payload=await version(id),local=await S.status();return S.replace(payload,local.state.revision,{reason:'cloud.history'})}
window.VzipBillingCloud={read,lessonDeletionTargets,preview,commit,sync,resolve,autoOn,setAuto,mergeStates,versions,version,restoreVersion};
})();
