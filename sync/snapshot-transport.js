/* Phase 03/05 snapshot bridge. Dormant unless explicitly enabled; never falls back after a pending RPC. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipSnapshotTransport=api;})(globalThis,()=>{
'use strict';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const copy=v=>JSON.parse(JSON.stringify(v)),key=owner=>'vzip_snapshot_transport_v1:'+encodeURIComponent(owner);
const messages={identity:'로그인 계정 또는 세션이 변경되어 저장을 멈췄어요.',storage:'저장 요청을 기기에 보존하지 못했어요. 현재 기록은 유지돼요.',corrupt:'미완료 저장 기록을 확인하지 못했어요. 자동으로 덮어쓰지 않아요.',pending:'이전 저장 요청을 먼저 확인해야 해요. 기기 기록은 유지돼요.',session:'이전 로그인에서 확인되지 않은 저장이 있어요. 복구 확인 전에는 새로 덮어쓰지 않아요.',conflict:'다른 기기에서 저장한 내용이 있어요. 현재 기기의 변경도 보존하고 동기화를 멈췄어요.',bootstrap:'기기와 클라우드가 달라 새 저장 방식으로 바로 전환하지 않아요. 기존 방식에서 동기화를 확인해 주세요.',advanced:'저장 후 다른 기기에서 다시 변경했어요. 양쪽 내용을 확인하기 전에는 덮어쓰지 않아요.',unavailable:'새 저장 계약을 사용할 수 없어요. 기기 기록을 유지하고 동기화를 멈췄어요.',response:'서버 저장 확인 결과를 읽지 못했어요. 같은 요청으로 다시 확인해요.',auth:'로그인 세션을 다시 확인해 주세요.',network:'클라우드 응답을 확인하지 못했어요. 저장 요청은 기기에 보존돼요.',busy:'다른 탭의 저장 확인이 끝난 뒤 다시 동기화해 주세요.',deleted:'삭제한 레슨을 제외한 미전송 기록을 보존했어요. 최신 클라우드와 확인하기 전에는 다시 보내지 않아요.'};
const fail=code=>Object.assign(Error(messages[code]||messages.response),{code});
function revision(v){const s=String(v);if(!/^(0|[1-9][0-9]{0,18})$/.test(s)||BigInt(s)>9223372036854775807n||typeof v==='number'&&!Number.isSafeInteger(v))throw fail('response');return s;}
function version(row){if(row===null)return {revision:'0',generation:null};const r=revision(row.revision),g=row.generation??null;if(g!==null&&!uuid.test(g)||r!=='0'&&!g)throw fail('response');return {revision:r,generation:g};}
const pair=(a,b)=>a?.revision===b?.revision&&a?.generation===b?.generation;
function hasState(storage,owner){return storage.getItem(key(owner))!==null;}
function create({storage,identity,read,send,lock,makeId=()=>crypto.randomUUID(),same,valid,onAck=()=>{},deletedIds=()=>[],redact=null,maxBytes=2*1024*1024}){
 if(!storage||typeof identity!=='function'||typeof read!=='function'||typeof send!=='function'||typeof lock!=='function'||typeof same!=='function'||typeof valid!=='function')throw fail('unavailable');
 const who=identity();if(!who||!uuid.test(who.owner)||!uuid.test(who.session))throw fail('identity');
 const owner=who.owner,session=who.session,k=key(owner);
 const guard=()=>{const i=identity();if(i?.owner!==owner||i?.session!==session)throw fail('identity');};
 function state(){
  guard();const raw=storage.getItem(k);if(raw===null)return {version:1,owner,baseline:null,pending:null,conflict:null};
  let s;try{s=JSON.parse(raw);}catch{throw fail('corrupt');}
  if(s?.version!==1||s.owner!==owner||s.baseline&&!pair(version(s.baseline),s.baseline))throw fail('corrupt');
  const p=s.pending;
  if(p&&(!uuid.test(p.id)||p.owner!==owner||!uuid.test(p.session)||!valid(p.payload)||!pair(version(p),p)))throw fail('corrupt');
  return s;
 }
 function put(s){
  guard();const raw=JSON.stringify(s);if(raw.length*2>maxBytes)throw fail('storage');
  try{storage.setItem(k,raw);if(storage.getItem(k)!==raw)throw fail('storage');}catch{throw fail('storage');}guard();
 }
 function sanitized(payload,ids=deletedIds()){
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id))throw fail('response');
  if(!ids.length)return copy(payload);if(typeof redact!=='function')throw fail('unavailable');
  const next=redact(copy(payload),[...new Set(ids)]);if(!valid(next))throw fail('response');return next;
 }
 function scrub(s,ids=deletedIds()){
  if(!s.pending)return s;const payload=sanitized(s.pending.payload,ids);
  if(same(payload,s.pending.payload))return s;
  const id=makeId();if(!uuid.test(id))throw fail('response');
  return {...s,pending:{...s.pending,id,retiredRequestId:s.pending.retiredRequestId||s.pending.id,payload},conflict:{...s.baseline,kind:'deleted'}};
 }
 const rowCheck=row=>{if(row!==null&&(!valid(row.payload)||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at))))throw fail('response');version(row);return row;};
 const exclusive=work=>lock(async()=>{guard();return work();});
 async function readRow(){guard();const row=await read();guard();return rowCheck(row);}
 function conflict(s,row,kind='conflict'){put({...s,conflict:{...version(row),kind}});throw fail(kind);}
 async function finish(s){
  if(s.conflict?.kind==='deleted')throw fail('deleted');
  const p=s.pending;if(!p)return null;if(p.session!==session)throw fail('session');
  const response=await send({p_expected_revision:p.revision,p_expected_generation:p.generation,p_payload:copy(p.payload),p_request_id:p.id});guard();
  if(response?.status==='conflict')return conflict(s,{revision:response.revision,generation:response.generation},'conflict');
  if(response?.status!=='saved')throw fail('response');
  const result=version(response);
  if(result.revision==='0'||!result.generation||BigInt(result.revision)<=BigInt(p.revision)||p.generation&&result.generation!==p.generation)throw fail('response');
  const row=await readRow();
  if(!row||!pair(version(row),result))return conflict(s,row,'advanced');
  const current=state();if(JSON.stringify(current.pending)!==JSON.stringify(p))throw fail('pending');
  onAck(row,copy(p.payload));guard();
  // One atomic local entry: an interrupted acknowledgement always retains the original request.
  put({...current,baseline:result,pending:null,conflict:null});return row;
 }
 function observed(s,row,local,dirty){
  rowCheck(row);if(s.pending)throw fail('pending');
  const next=version(row),identical=row&&local&&same(local,row.payload);
  if(s.baseline&&pair(s.baseline,next)&&!s.conflict)return s;
  if(!s.baseline&&row&&dirty&&local&&!identical)return conflict(s,row,'bootstrap');
  if(s.baseline&&!pair(s.baseline,next)&&dirty&&!identical)return conflict(s,row);
  if(s.conflict&&dirty&&!identical)throw fail(s.conflict.kind||'conflict');
  return {...s,baseline:next,conflict:null};
 }
 return {
  state:()=>copy(state()),
  recover:()=>exclusive(async()=>{const s=state(),next=scrub(s);if(next!==s)put(next);return finish(next);}),
  redactLessons:(ids,apply=()=>{})=>exclusive(async()=>{const s=state(),next=scrub(s,ids);if(next!==s)put(next);return apply();}),
  read:readRow,
  observe:(row,local,{dirty=false}={})=>exclusive(async()=>{const s=state(),next=observed(s,row,local,dirty);if(next!==s)put(next);}),
  prepare:(row,getLocal,apply)=>exclusive(async()=>{
   const s=state(),local=getLocal(),next=observed(s,row,local.payload,local.dirty);
   const result=apply(local.payload);if(result&&typeof result.then==='function')throw fail('response');
   if(next!==s)put(next);return result;
  }),
  write:(row,payload)=>exclusive(async()=>{
   rowCheck(row);if(!valid(payload))throw fail('response');
   const s=state();if(s.pending)throw fail('pending');if(s.conflict)throw fail(s.conflict.kind||'conflict');
   const expected=version(row);if(!s.baseline||!pair(s.baseline,expected))throw fail('conflict');
   const id=makeId();if(!uuid.test(id))throw fail('response');
   const clean=sanitized(payload),changed=!same(clean,payload);
   const next={...s,pending:{id,owner,session,...expected,payload:clean},...(changed?{conflict:{...expected,kind:'deleted'}}:{})};
   put(next);return finish(next);
  })
 };
}
function createTransport({projectUrl,publishableKey,getCredentials,getOwner,getSessionId,fetch:request=globalThis.fetch}){
 if(typeof publishableKey!=='string'||!publishableKey||publishableKey.startsWith('sb_secret_')||typeof getCredentials!=='function'||typeof getOwner!=='function'||typeof getSessionId!=='function'||typeof request!=='function')throw fail('unavailable');
 const url=new URL(projectUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw fail('unavailable');
 const claims=token=>{try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(globalThis.atob(p.padEnd(Math.ceil(p.length/4)*4,'=')));}catch{throw fail('auth');}};
 if(publishableKey.includes('.')&&claims(publishableKey).role==='service_role')throw fail('unavailable');
 async function call(path,payload){
  const owner=getOwner(),session=getSessionId();if(!uuid.test(owner)||!uuid.test(session))throw fail('identity');
  const body=payload===undefined?undefined:JSON.stringify(payload),credentials=await getCredentials();
  const guard=()=>{if(getOwner()!==owner||getSessionId()!==session)throw fail('identity');};guard();
  const token=typeof credentials==='string'?credentials:credentials?.accessToken;if(typeof token!=='string'||token.length>16384)throw fail('auth');
  const jwt=claims(token);if(jwt.role!=='authenticated'||jwt.sub!==owner||jwt.session_id!==session)throw fail('identity');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await request(url.origin+path(owner),{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,
    headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json','X-Client-Info':'vocalzip-device-session-v2'},body});
   guard();if(!response.ok)throw Object.assign(fail([401,403].includes(response.status)?'auth':response.status===404?'unavailable':'network'),{status:response.status});
   const data=await response.json();guard();return {data,owner};
  }catch(e){if(e.code)throw e;throw fail('network');}finally{clearTimeout(timer);}
 }
 return {
  read:async()=>{
   const {data,owner}=await call(owner=>'/rest/v1/vocal_data?select='+encodeURIComponent('user_id,payload,updated_at,revision:revision::text,generation')+'&user_id=eq.'+encodeURIComponent(owner));
   if(!Array.isArray(data)||data.length>1||data[0]&&data[0].user_id!==owner)throw fail('response');return data[0]||null;
  },
  send:async payload=>{
   const allowed=['p_expected_revision','p_expected_generation','p_payload','p_request_id'];
   if(!payload||Object.keys(payload).length!==4||Object.keys(payload).some(k=>!allowed.includes(k)))throw fail('response');
   return (await call(()=>'/rest/v1/rpc/vzip_save_snapshot',payload)).data;
  }
 };
}
return {create,createTransport,hasState,version};
});
