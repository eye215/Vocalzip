/* Opt-in snapshot RPC transport. Journals use the caller's account-scoped storage.
 * An acknowledgement confirms one request, never the latest cloud contents.
 * Activation still requires the field/legacy bridge and explicit recovery UI. */
((root)=>{
'use strict';
const PREFIX='vzip_snapshot_request_v1:';
const ISSUED_PREFIX='vzip_snapshot_issued_v1:';
const revision=v=>typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v);
const idOK=v=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const clone=v=>JSON.parse(JSON.stringify(v));
const failure=(name,message,id)=>Object.assign(Error(message),{name,...(id?{requestId:id}:{})});
class MissingRequest extends Error{
 constructor(id){super('보존한 저장 요청을 찾지 못했어요.');this.name='VzipSnapshotRequestMissing';this.requestId=id;}
}
function create({rpc,storage,owner,session,isCurrent,valid,uuid=()=>crypto.randomUUID()}){
 if(typeof owner!=='string'||!owner||typeof session!=='string'||!session||!storage||
    ['getItem','setItem','removeItem','key'].some(k=>typeof storage[k]!=='function')||
    typeof rpc!=='function'||typeof isCurrent!=='function'||typeof valid!=='function'||typeof uuid!=='function')
  throw Error('저장 연결 정보를 확인하지 못했어요.');
 const check=()=>{if(!isCurrent())throw failure('VzipSnapshotSessionChanged','계정 또는 로그인이 변경되어 저장을 중단했어요. 임시 사본은 보존됩니다.');};
 const key=id=>PREFIX+id;
 const conflict=entry=>failure('VzipSnapshotConflict','다른 기기의 저장과 충돌했어요. 서버 기록과 이 기기의 임시 사본을 보존했습니다.',entry.requestId);
 const malformed=()=>failure('VzipSnapshotInvalidJournal','임시 저장 요청 형식을 확인하지 못했어요. 사본을 보존합니다.');
 // Include every immutable field when deciding whether an acknowledgement owns a journal.
 const identity=e=>JSON.stringify([e.owner,e.session,e.requestId,e.expectedRevision,e.payload,e.createdAt]);
 function read(id){
  check();if(!idOK(id))throw malformed();
  const raw=storage.getItem(key(id));check();if(raw==null)return null;
  let entry;try{entry=JSON.parse(raw);}catch{throw malformed();}
  if(entry?.owner!==owner)throw failure('VzipSnapshotForeignOwner','다른 계정의 저장 요청은 보낼 수 없어요.',id);
  if(entry.requestId!==id||typeof entry.session!=='string'||!entry.session||
     !revision(entry.expectedRevision)||!valid(entry.payload)||
     !Number.isSafeInteger(entry.createdAt)||entry.createdAt<0||
     !['pending','conflict'].includes(entry.status)||
     (entry.status==='conflict'&&!revision(entry.remoteRevision)))throw malformed();
  check();return entry;
 }
 function pending(){
  check();const ids=[];
  for(let i=0;i<storage.length;i++){const k=storage.key(i);check();if(k?.startsWith(PREFIX))ids.push(k.slice(PREFIX.length));}
  const entries=ids.map(read).filter(Boolean).sort((a,b)=>a.createdAt-b.createdAt||a.requestId.localeCompare(b.requestId));
  check();return entries;
 }
 async function call(name,args){
  check();
  // A rejected RPC must cross the same account/session guard as a resolved RPC.
  let response;try{response=await rpc(name,args);}finally{check();}
  if(!response||typeof response!=='object')throw failure('VzipSnapshotInvalidResponse','서버 응답을 확인하지 못했어요. 임시 사본은 보존됩니다.');
  if(response.error)throw Error(response.error.message||'서버 저장 응답을 확인하지 못했어요. 임시 사본은 보존됩니다.');
  return response.data;
 }
 async function load(){
  const data=await call('vzip_load_snapshot',{});check();
  if(!data||typeof data.exists!=='boolean'||!revision(data.revision))throw failure('VzipSnapshotInvalidResponse','서버 기록 버전을 확인하지 못했어요.');
  if(!data.exists){
   if(data.revision!=='0'||data.payload!==null||data.updated_at!==null)throw failure('VzipSnapshotInvalidResponse','빈 서버 기록 형식을 확인하지 못했어요.');
   return null;
  }
  if(data.revision==='0'||!valid(data.payload)||!stamp(data.updated_at))throw failure('VzipSnapshotInvalidResponse','서버 기록 형식을 확인하지 못했어요.');
  const result={payload:clone(data.payload),revision:data.revision,updated_at:data.updated_at};check();return result;
 }
 async function retry(id){
  const entry=read(id);
  if(!entry)throw new MissingRequest(id);
  if(entry.session!==session)throw failure('VzipSnapshotRecoveryRequired','이전 로그인에서 보낸 저장 요청이 남아 있어요. 사본을 보존하고 복구를 기다립니다.',id);
  if(entry.status==='conflict')throw conflict(entry);
  // Never recreate a journal after a timeout: another tab may have acknowledged it.
  const data=await call('vzip_save_snapshot',{p_expected_revision:entry.expectedRevision,p_payload:clone(entry.payload),p_request_id:id});check();
  const same=()=>{const current=read(id);if(current&&identity(current)!==identity(entry))throw failure('VzipSnapshotJournalChanged','보존한 저장 요청이 변경되어 확인을 중단했어요.',id);return current;};
  if(data?.status==='conflict'&&revision(data.revision)&&typeof data.exists==='boolean'&&
     (data.exists?data.revision!=='0':data.revision==='0')){
   const current=same();check();
   if(current)storage.setItem(key(id),JSON.stringify({...current,status:'conflict',remoteRevision:data.revision}));
   check();throw conflict(entry);
  }
  if(data?.status!=='saved'||!revision(data.revision)||data.revision==='0'||typeof data.replayed!=='boolean'||!stamp(data.updated_at))
   throw failure('VzipSnapshotInvalidResponse','서버 저장 완료를 확인하지 못했어요. 임시 사본은 보존됩니다.',id);
  const current=same();check();
  if(current){
   // Retain only an ID reservation after acknowledgement, preventing accidental UUID reuse.
   storage.setItem(ISSUED_PREFIX+id,owner);check();
   storage.removeItem(key(id));check();
  }
  return {status:'saved',revision:data.revision,updated_at:data.updated_at,replayed:data.replayed,requestId:id};
 }
 async function save(expectedRevision,payload){
  check();if(!revision(expectedRevision)||!valid(payload))throw Error('저장할 기록과 버전을 확인해 주세요.');
  const snapshot=clone(payload);
  if(!valid(snapshot))throw Error('저장할 기록 형식을 확인해 주세요.');
  const candidate=uuid();check();const id=typeof candidate==='string'?candidate.toLowerCase():candidate;
  if(!idOK(id)||storage.getItem(key(id))!==null||storage.getItem(ISSUED_PREFIX+id)!==null)throw Error('새 저장 요청 번호를 만들지 못했어요.');
  const entry={owner,session,requestId:id,expectedRevision,payload:snapshot,createdAt:Date.now(),status:'pending'};
  // Quota/security failures happen before any network I/O. ID reservations are never payloads.
  check();storage.setItem(ISSUED_PREFIX+id,owner);check();
  storage.setItem(key(id),JSON.stringify(entry));check();
  return retry(id);
 }
 async function resume(){
  for(const entry of pending()){
   try{await retry(entry.requestId);}catch(error){
    check();
    // Only an entry removed between enumeration and retry is safe to skip.
    if(!(error instanceof MissingRequest)||error.requestId!==entry.requestId)throw error;
   }
   check();
  }
 }
 return {load,save,retry,resume,pending};
}
const api={create,PREFIX};
root.VzipSnapshotSync=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
