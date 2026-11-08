/* Headless account-scoped field draft outbox. Not loaded by the application yet. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.VzipFieldDraftOutbox=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const fields=new Set(['memo','prepMemo','feedback']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const utf8=s=>new TextEncoder().encode(s).length;
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const revision=s=>{
 if(typeof s!=='string'||!/^(0|[1-9]\d*)$/.test(s)||BigInt(s)>9223372036854775807n)throw fail('invalid_version');
 return s;
};
const text=s=>{if(typeof s!=='string'||utf8(s)>65536)throw fail('invalid_text');return s;};
const id=s=>{if(typeof s!=='string'||!uuid.test(s))throw fail('invalid_id');return s.toLowerCase();};
function create({owner,editorId,sessionId,storage,send,getOwner,getSessionId,now=Date.now,makeId=()=>globalThis.crypto.randomUUID()}){
 if(typeof owner!=='string'||!owner||typeof getOwner!=='function'||typeof getSessionId!=='function'||!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.key!=='function'||!Number.isSafeInteger(storage.length)||typeof send!=='function')throw fail('invalid_options');
 editorId=id(editorId);sessionId=id(sessionId);
 const prefix='vzip_field_outbox_v1:'+encodeURIComponent(owner)+':';
 const inFlight=new Map();
 const guard=()=>{if(getOwner()!==owner)throw fail('owner_changed');};
 const active=()=>{guard();if(getSessionId()!==sessionId)throw fail('session_changed');};
 const scope=s=>{if(!s||typeof s.entityId!=='string'||utf8(s.entityId)<1||utf8(s.entityId)>200||!fields.has(s.field))throw fail('invalid_scope');return {entityId:s.entityId,field:s.field};};
 const key=s=>{s=scope(s);return prefix+encodeURIComponent(s.entityId)+':'+s.field+':'+editorId;};
 function validate(r,s,actor=editorId){
  if(!r||r.schema!==1||r.owner!==owner||r.editorId!==actor||r.entityId!==s.entityId||r.field!==s.field)throw fail('invalid_store');
  if(!Number.isSafeInteger(r.localRevision)||r.localRevision<0||!Number.isSafeInteger(r.ackRevision)||r.ackRevision<0||r.ackRevision>r.localRevision)throw fail('invalid_store');
  text(r.text);text(r.baseText);
  if(!['local','syncing','server_draft','conflict','blocked'].includes(r.status)||!Array.isArray(r.conflicts)||r.conflicts.length>32)throw fail('invalid_store');
  for(const c of r.conflicts){if(!c||typeof c.id!=='string')throw fail('invalid_store');text(c.text);}
  if(r.remote){id(r.remote.draftId);revision(r.remote.revision);revision(r.remote.epoch);id(r.remote.sessionId);}
  if(r.pending){const p=r.pending;id(p.id);id(p.sessionId);text(p.text);id(p.draftId);revision(p.revision);revision(p.epoch);
   if(!Number.isSafeInteger(p.localRevision)||p.localRevision<0||p.localRevision>r.localRevision)throw fail('invalid_store');
  }
  return r;
 }
 function read(s){
  guard();s=scope(s);const raw=storage.getItem(key(s));if(raw==null)return null;
  let r;try{r=JSON.parse(raw);}catch{throw fail('invalid_store');}
  return copy(validate(r,s));
 }
 function persist(s,r){
  guard();validate(r,scope(s));const raw=JSON.stringify(r);if(utf8(raw)>4194304)throw fail('local_capacity');
  storage.setItem(key(s),raw);return copy(r);
 }
 function start(s,baseText){
  guard();s=scope(s);const existing=read(s);if(existing)return existing;text(baseText);
  let n=0;for(let i=0;i<storage.length;i++)if(storage.key(i)?.startsWith(prefix))n++;
  if(n>=512)throw fail('local_capacity');
  return persist(s,{schema:1,owner,editorId,...s,text:baseText,baseText,localRevision:0,ackRevision:0,
   status:'local',remote:null,pending:null,conflicts:[],candidate:null,blockedReason:null,updatedAt:now()});
 }
 function edit(s,value){
  guard();text(value);const r=read(s);if(!r)throw fail('draft_missing');if(r.text===value)return r;
  if(r.localRevision===Number.MAX_SAFE_INTEGER)throw fail('local_version_exhausted');
  r.text=value;r.localRevision++;r.updatedAt=now();
  if(!['conflict','blocked'].includes(r.status))r.status='local';
  return persist(s,r);
 }
 function remote(result){
  if(!result||typeof result!=='object')throw fail('invalid_remote');
  const out={draftId:id(result.draft_id),revision:revision(result.revision),epoch:revision(result.epoch),sessionId};
  if(result.editor_instance!==editorId||result.is_editor===false)throw fail('not_editor');
  return out;
 }
 function candidate(result){
  return {text:text(result.text),remote:remote(result)};
 }
 function attachLease(s,result){
  active();const r=read(s);if(!r)throw fail('draft_missing');if(r.pending)throw fail('pending_operation');
  const next=candidate(result);
  const dirty=r.text!==r.baseText;
  if(dirty&&(next.text!==r.baseText||(r.remote&&r.remote.draftId!==next.remote.draftId))){
   r.candidate=next;r.status='conflict';return persist(s,r);
  }
  if(!dirty&&r.text!==next.text){r.text=next.text;r.localRevision++;}
  r.baseText=next.text;r.remote=next.remote;r.candidate=null;r.blockedReason=null;
  r.status=r.text===next.text?'server_draft':'local';
  if(r.status==='server_draft')r.ackRevision=r.localRevision;
  return persist(s,r);
 }
 function archive(r,entry){
  if(r.conflicts.some(c=>c.id===entry.id))return;
  if(r.conflicts.length>=32)throw fail('conflict_capacity');
  r.conflicts.push(entry);
 }
 function resolve(s,result,choice){
  active();if(!['keep_local','use_server'].includes(choice))throw fail('explicit_choice_required');
  const r=read(s);if(!r)throw fail('draft_missing');const next=candidate(result);
  if(r.pending)archive(r,{id:r.pending.id,text:r.pending.text,reason:'explicit_resolution',serverPreserved:false});
  if(choice==='use_server'&&r.text!==next.text)archive(r,{id:id(makeId()),text:r.text,reason:'local_copy_before_selection',serverPreserved:false});
  r.pending=null;r.remote=next.remote;r.baseText=next.text;r.candidate=null;r.blockedReason=null;r.localRevision++;
  if(choice==='use_server')r.text=next.text;
  r.status=r.text===next.text?'server_draft':'local';
  if(r.status==='server_draft')r.ackRevision=r.localRevision;
  r.updatedAt=now();return persist(s,r);
 }
 function markBlocked(s,reason='lease_changed'){
  guard();const r=read(s);if(!r)throw fail('draft_missing');r.status='blocked';r.blockedReason=String(reason).slice(0,80);return persist(s,r);
 }
 async function transmit(s){
  active();let r=read(s);if(!r)throw fail('draft_missing');
  if(['conflict','blocked'].includes(r.status))return {status:r.status};
  if(!r.remote)return {status:'no_lease'};
  if(r.remote.sessionId!==sessionId||(r.pending&&r.pending.sessionId!==sessionId))return {status:'session_changed'};
  if(!r.pending){
   if(r.text===r.baseText)return {status:'no_changes'};
   r.pending={id:id(makeId()),sessionId,localRevision:r.localRevision,text:r.text,
    draftId:r.remote.draftId,revision:r.remote.revision,epoch:r.remote.epoch};
  }
  const p=copy(r.pending);r.status='syncing';persist(s,r); // durable before any network request
  let response;
  try{
   response=await send({p_operation:'save',p_entity_id:s.entityId,p_field_key:s.field,p_editor_instance:editorId,
    p_draft_id:p.draftId,p_expected_revision:p.revision,p_expected_epoch:p.epoch,p_text:p.text,p_request_id:p.id});
  }catch(error){
   if(getOwner()!==owner||getSessionId()!==sessionId)return {status:'identity_changed'};
   r=read(s);if(r?.pending?.id===p.id){
    r.status=[401,403].includes(error?.status)?'blocked':'local';r.blockedReason=r.status==='blocked'?'authentication':null;persist(s,r);
   }
   return {status:[401,403].includes(error?.status)?'blocked':'retryable'};
  }
  if(getOwner()!==owner||getSessionId()!==sessionId)return {status:'identity_changed'};
  r=read(s);if(!r||r.pending?.id!==p.id)return {status:'stale_ack'};
  if(!response||typeof response!=='object'||!['saved','conflict'].includes(response.status))throw fail('invalid_response');
  if(response.status==='saved'){
   if(id(response.draft_id)!==p.draftId||revision(response.epoch)!==p.epoch||BigInt(revision(response.revision))!==BigInt(p.revision)+1n)throw fail('invalid_response');
   r.pending=null;r.baseText=p.text;r.ackRevision=p.localRevision;r.remote={draftId:p.draftId,revision:response.revision,epoch:p.epoch,sessionId};
   if(r.text===p.text)r.ackRevision=r.localRevision;
   if(r.status!=='blocked'){r.status=r.text===p.text?'server_draft':'local';r.blockedReason=null;}
  }else{
   if(typeof response.preserved!=='boolean')throw fail('invalid_response');
   if(response.preserved&& !uuid.test(response.conflict_id||''))throw fail('invalid_response');
   archive(r,{id:p.id,text:p.text,reason:String(response.reason||'conflict').slice(0,80),
    serverPreserved:response.preserved,serverConflictId:response.conflict_id||null});
   r.pending=null;r.status='conflict';r.blockedReason=null;
  }
  r.updatedAt=now();persist(s,r);return {status:r.status};
 }
 function sync(s){
  guard();s=scope(s);const k=key(s);if(inFlight.has(k))return inFlight.get(k);
  const promise=transmit(s).finally(()=>{if(inFlight.get(k)===promise)inFlight.delete(k);});
  inFlight.set(k,promise);return promise;
 }
 function list(){
  guard();const records=[],corrupt=[];
  for(let i=0;i<storage.length;i++){
   const k=storage.key(i);if(!k?.startsWith(prefix))continue;
   try{const r=JSON.parse(storage.getItem(k)),actor=id(r.editorId),s=scope(r);validate(r,s,actor);
    if(k!==prefix+encodeURIComponent(s.entityId)+':'+s.field+':'+actor)throw fail('invalid_store');
    records.push(copy(r));}catch{corrupt.push(k);}
  }
  return {records,corrupt};
 }
 function exportRaw(s){
  guard();const raw=storage.getItem(key(scope(s)));if(raw==null)return raw;
  let data;try{data=JSON.parse(raw);}catch{return raw;}
  if(data&&typeof data.owner==='string'&&data.owner!==owner)throw fail('owner_mismatch');
  return raw;
 }
 return {start,edit,read,attachLease,resolve,markBlocked,sync,list,exportRaw};
}

function createTransport({projectUrl,publishableKey,getCredentials,getOwner,getSessionId,fetch:request=globalThis.fetch}){
 if(typeof getCredentials!=='function'||typeof getOwner!=='function'||typeof getSessionId!=='function'||typeof request!=='function'||typeof publishableKey!=='string'||!publishableKey||publishableKey.startsWith('sb_secret_'))throw fail('invalid_transport');
 const url=new URL(projectUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw fail('invalid_transport');
 const claims=token=>{
  try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(globalThis.atob(p.padEnd(Math.ceil(p.length/4)*4,'=')));}
  catch{throw fail('invalid_credentials');}
 };
 if(publishableKey.includes('.')&&claims(publishableKey).role==='service_role')throw fail('publishable_key_required');
 const allowed=new Set(['p_operation','p_entity_id','p_field_key','p_editor_instance','p_draft_id','p_expected_revision','p_expected_epoch','p_text','p_request_id','p_target_editor','p_confirm_unsynced','p_expected_snapshot_revision','p_expected_generation']);
 return async payload=>{
  const owner=getOwner(),session=getSessionId();
  if(typeof owner!=='string'||!owner||typeof session!=='string'||!uuid.test(session))throw fail('invalid_credentials');
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>!allowed.has(k)))throw fail('invalid_request');
  // Freeze the exact bytes before awaiting auth; later caller edits cannot alter a durable operation.
  const body=JSON.stringify(payload);
  const credentials=await getCredentials();
  if(getOwner()!==owner||getSessionId()!==session)throw fail('identity_changed');
  const token=typeof credentials==='string'?credentials:credentials?.accessToken;
  if(typeof token!=='string'||token.length>16384)throw fail('invalid_credentials');
  // Claim decoding is only a routing guard, never a substitute for server signature/session checks.
  const jwt=claims(token);
  if(jwt.sub!==owner||jwt.session_id!==session)throw fail('credential_mismatch');
  const response=await request(url.origin+'/rest/v1/rpc/vzip_field_draft',{
   method:'POST',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json','X-Client-Info':'vocalzip-device-session-v2'},
   body
  });
  if(!response.ok)throw Object.assign(fail('rpc_failed'),{status:response.status});
  return response.json();
 };
}

return {create,createTransport};
});
