/* Opt-in snapshot RPC transport. Journals live only in the caller's account scope.
 * An acknowledgement confirms one request, never the current contents of the whole cloud.
 * Field drafts/leases and user-facing conflict resolution are separate follow-up work. */
((root)=>{
'use strict';
const PREFIX='vzip_snapshot_request_v1:';
const revision=v=>typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v);
const idOK=v=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const clone=v=>JSON.parse(JSON.stringify(v));
function create({rpc,storage,owner,session,isCurrent,valid,uuid=()=>crypto.randomUUID()}){
 if(!owner||!session||!storage||typeof rpc!=='function'||typeof isCurrent!=='function'||typeof valid!=='function')throw Error('저장 연결 정보를 확인하지 못했어요.');
 const check=()=>{if(!isCurrent())throw Error('계정 또는 로그인이 변경되어 저장을 중단했어요. 임시 사본은 보존됩니다.');};
 const key=id=>PREFIX+id;
 const conflict=entry=>{const e=Error('다른 기기의 저장과 충돌했어요. 서버 기록과 이 기기의 임시 사본을 보존했습니다.');e.name='VzipSnapshotConflict';e.requestId=entry.requestId;return e;};
 function read(id){
  check();if(!idOK(id))throw Error('저장 요청 번호를 확인해 주세요.');
  const raw=storage.getItem(key(id));if(raw==null)return null;
  let entry;try{entry=JSON.parse(raw);}catch{throw Error('임시 저장 요청을 읽지 못했어요. 사본을 보존합니다.');}
  if(entry?.owner!==owner)throw Error('다른 계정의 저장 요청은 보낼 수 없어요.');
  if(entry.requestId!==id||!revision(entry.expectedRevision)||!valid(entry.payload)||!['pending','conflict'].includes(entry.status))throw Error('임시 저장 요청 형식을 확인하지 못했어요. 사본을 보존합니다.');
  return entry;
 }
 function pending(){
  check();const ids=[];
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(PREFIX))ids.push(k.slice(PREFIX.length));}
  return ids.map(read).filter(Boolean).sort((a,b)=>a.createdAt-b.createdAt||a.requestId.localeCompare(b.requestId));
 }
 async function load(){
  check();const {data,error}=await rpc('vzip_load_snapshot',{});check();
  if(error)throw Error(error.message||'서버 저장 연결을 확인하지 못했어요.');
  if(!data||typeof data.exists!=='boolean'||!revision(data.revision))throw Error('서버 기록 버전을 확인하지 못했어요.');
  if(!data.exists){if(data.revision!=='0'||data.payload!==null)throw Error('빈 서버 기록 형식을 확인하지 못했어요.');return null;}
  if(!valid(data.payload)||typeof data.updated_at!=='string'||!Number.isFinite(Date.parse(data.updated_at)))throw Error('서버 기록 형식을 확인하지 못했어요.');
  return {payload:data.payload,revision:data.revision,updated_at:data.updated_at};
 }
 async function retry(id){
  const entry=read(id);if(!entry)throw Error('보존한 저장 요청을 찾지 못했어요.');
  if(entry.session!==session)throw Error('이전 로그인에서 보낸 저장 요청이 남아 있어요. 사본을 보존하고 복구를 기다립니다.');
  if(entry.status==='conflict')throw conflict(entry);
  check();
  // Keep the same request ID/base/payload after a timeout or a lost response.
  // Errors never rewrite or recreate a journal another tab may have acknowledged.
  const {data,error}=await rpc('vzip_save_snapshot',{p_expected_revision:entry.expectedRevision,p_payload:clone(entry.payload),p_request_id:id});
  check();
  if(error)throw Error(error.message||'서버 저장 응답을 확인하지 못했어요. 임시 사본은 보존됩니다.');
  if(data?.status==='conflict'&&revision(data.revision)&&typeof data.exists==='boolean'){
   const current=read(id);
   if(current)storage.setItem(key(id),JSON.stringify({...current,status:'conflict',remoteRevision:data.revision}));
   throw conflict(entry);
  }
  if(data?.status!=='saved'||!revision(data.revision)||data.revision==='0'||typeof data.replayed!=='boolean'||typeof data.updated_at!=='string'||!Number.isFinite(Date.parse(data.updated_at)))throw Error('서버 저장 완료를 확인하지 못했어요. 임시 사본은 보존됩니다.');
  // Remove only this exact request after an authenticated, same-session acknowledgement.
  if(read(id))storage.removeItem(key(id));
  return {...data,requestId:id};
 }
 async function save(expectedRevision,payload){
  check();if(!revision(expectedRevision)||!valid(payload))throw Error('저장할 기록과 버전을 확인해 주세요.');
  const id=uuid();if(!idOK(id)||storage.getItem(key(id))!==null)throw Error('새 저장 요청 번호를 만들지 못했어요.');
  const entry={owner,session,requestId:id,expectedRevision,payload:clone(payload),createdAt:Date.now(),status:'pending'};
  // Persist before network I/O. Quota/security failures stop the upload.
  storage.setItem(key(id),JSON.stringify(entry));
  return retry(id);
 }
 async function resume(){for(const entry of pending())await retry(entry.requestId);}
 return {load,save,retry,resume,pending};
}
const api={create,PREFIX};
root.VzipSnapshotSync=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
