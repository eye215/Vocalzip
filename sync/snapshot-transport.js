/* Phase 03/05 snapshot bridge. Dormant unless explicitly enabled; never falls back after a pending RPC. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipSnapshotTransport=api;})(globalThis,()=>{
'use strict';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const copy=v=>JSON.parse(JSON.stringify(v)),key=owner=>'vzip_snapshot_transport_v1:'+encodeURIComponent(owner);
const messages={identity:'로그인 계정 또는 세션이 변경되어 저장을 멈췄어요.',storage:'저장 요청을 기기에 보존하지 못했어요. 현재 기록은 유지돼요.',corrupt:'미완료 저장 기록을 확인하지 못했어요. 자동으로 덮어쓰지 않아요.',pending:'이전 저장 요청을 먼저 확인해야 해요. 기기 기록은 유지돼요.',session:'이전 로그인에서 확인되지 않은 저장이 있어요. 복구 확인 전에는 새로 덮어쓰지 않아요.',conflict:'다른 기기에서 저장한 내용이 있어요. 현재 기기의 변경도 보존하고 동기화를 멈췄어요.',bootstrap:'기기와 클라우드가 달라 새 저장 방식으로 바로 전환하지 않아요. 기존 방식에서 동기화를 확인해 주세요.',advanced:'저장 후 다른 기기에서 다시 변경했어요. 양쪽 내용을 확인하기 전에는 덮어쓰지 않아요.',unavailable:'새 저장 계약을 사용할 수 없어요. 기기 기록을 유지하고 동기화를 멈췄어요.',response:'서버 저장 확인 결과를 읽지 못했어요. 같은 요청으로 다시 확인해요.',auth:'로그인 세션을 다시 확인해 주세요.',network:'클라우드 응답을 확인하지 못했어요. 저장 요청은 기기에 보존돼요.',busy:'다른 탭의 저장 확인이 끝난 뒤 다시 동기화해 주세요.',review:'복구 확인 뒤 내용이 바뀌었어요. 양쪽 기록을 다시 확인해 주세요.',generation:'클라우드 기록의 세대가 바뀌었어요. 자동 복구 대신 별도 확인이 필요해요.',localChanged:'복구 저장 중 새 입력이 생겼어요. 새 입력과 확인한 기록을 모두 보존하고 다시 확인해요.',incomplete:'복구 내용에서 한쪽에만 있는 기록이 빠졌어요. 삭제하지 않고 다시 확인해요.',mediaChanged:'삭제를 준비하는 동안 파일 정보가 바뀌었어요. 원본은 더 지우지 않고 확인을 기다려요.',deleted:'삭제한 레슨·파일을 제외한 미전송 기록을 보존했어요. 최신 클라우드와 확인하기 전에는 다시 보내지 않아요.'};
const fail=code=>Object.assign(Error(messages[code]||messages.response),{code});
function revision(v){const s=String(v);if(!/^(0|[1-9][0-9]{0,18})$/.test(s)||BigInt(s)>9223372036854775807n||typeof v==='number'&&!Number.isSafeInteger(v))throw fail('response');return s;}
function version(row){if(row===null)return {revision:'0',generation:null};const r=revision(row.revision),g=row.generation??null;if(g!==null&&!uuid.test(g)||r!=='0'&&!g)throw fail('response');return {revision:r,generation:g};}
const pair=(a,b)=>a?.revision===b?.revision&&a?.generation===b?.generation;
function hasState(storage,owner){return storage.getItem(key(owner))!==null;}
function hasMediaDeletes(storage,owner){const prefix='vzip_media_delete_v1:'+encodeURIComponent(owner)+':';for(let i=0;i<storage.length;i++)if(storage.key(i)?.startsWith(prefix))return true;return false;}
function create({storage,identity,read,send,lock,makeId=()=>crypto.randomUUID(),same,valid,onAck=()=>{},deletedIds=()=>[],redact=null,deletedMediaIds=()=>[],redactMedia=null,getLocal=null,maxBytes=2*1024*1024}){
 if(!storage||typeof identity!=='function'||typeof read!=='function'||typeof send!=='function'||typeof lock!=='function'||typeof same!=='function'||typeof valid!=='function')throw fail('unavailable');
 const who=identity();if(!who||!uuid.test(who.owner)||!uuid.test(who.session))throw fail('identity');
 const owner=who.owner,session=who.session,k=key(owner);let reviewed=null;
 const guard=()=>{const i=identity();if(i?.owner!==owner||i?.session!==session)throw fail('identity');};
 function state(){
  guard();const raw=storage.getItem(k);if(raw===null)return {version:1,owner,baseline:null,pending:null,conflict:null};
  let s;try{s=JSON.parse(raw);}catch{throw fail('corrupt');}
  if(s?.version!==1||s.owner!==owner||s.baseline&&!pair(version(s.baseline),s.baseline))throw fail('corrupt');
  const p=s.pending;
  if(p&&(!uuid.test(p.id)||p.owner!==owner||!uuid.test(p.session)||!valid(p.payload)||!pair(version(p),p)))throw fail('corrupt');
  if(p?.context)mediaContext(p.context);
  if(s.recoveries!==undefined&&(!Array.isArray(s.recoveries)||s.recoveries.some(r=>!recoveryValid(r))))throw fail('corrupt');
  if(p?.recoveryId&&(!uuid.test(p.recoveryId)||!(s.recoveries||[]).some(r=>r.id===p.recoveryId)))throw fail('corrupt');
  return s;
 }
 function recoveryValid(r){
  if(r?.version!==1||r.owner!==owner||!uuid.test(r.id)||!uuid.test(r.requestId)||!uuid.test(r.session)||!Number.isFinite(r.createdAt)||!stampPattern.test(r.deviceStamp)||!valid(r.device))return false;
  try{rowCheck(r.cloud);const p=r.pending;if(p&&(!uuid.test(p.id)||p.owner!==owner||!uuid.test(p.session)||!valid(p.payload)||!pair(version(p),p)))return false;if(p?.context)mediaContext(p.context);}catch{return false;}
  return true;
 }
 function localCopy(){guard();if(typeof getLocal!=='function')throw fail('unavailable');const v=getLocal();if(!valid(v))throw fail('corrupt');return copy(v);}
 function put(s){
  guard();const raw=JSON.stringify(s);if(raw.length*2>maxBytes)throw fail('storage');
  try{storage.setItem(k,raw);if(storage.getItem(k)!==raw)throw fail('storage');}catch{throw fail('storage');}guard();
 }
 function sanitized(payload,ids=deletedIds(),media=deletedMediaIds()){
  for(const list of [ids,media])if(!Array.isArray(list)||list.some(id=>typeof id!=='string'||!id))throw fail('response');
  let next=copy(payload);
  if(ids.length){if(typeof redact!=='function')throw fail('unavailable');next=redact(next,[...new Set(ids)]);}
  if(media.length){if(typeof redactMedia!=='function')throw fail('unavailable');next=redactMedia(next,[...new Set(media)]);}
  if(!valid(next))throw fail('response');return next;
 }
 function scrub(s,ids=deletedIds(),media=deletedMediaIds()){
  let next=s;
  if(s.recoveries){
   const recoveries=s.recoveries.map(r=>({...r,device:sanitized(r.device,ids,media),
    cloud:r.cloud?{...r.cloud,payload:sanitized(r.cloud.payload,ids,media)}:null,
    pending:r.pending?{...r.pending,payload:sanitized(r.pending.payload,ids,media)}:null}));
   if(!same(recoveries,s.recoveries))next={...next,recoveries};
  }
  if(!s.pending)return next;const payload=sanitized(s.pending.payload,ids,media);
  if(same(payload,s.pending.payload))return next;
  const id=makeId();if(!uuid.test(id)||id===s.pending.id)throw fail('response');
  return {...next,pending:{...s.pending,id,retiredRequestId:s.pending.retiredRequestId||s.pending.id,payload},conflict:{...s.baseline,kind:'deleted'}};
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
  const recovery=p.recoveryId?(s.recoveries||[]).find(r=>r.id===p.recoveryId):null;
  if(recovery){
   const currentLocal=localCopy(),stamp=await digest(currentLocal);guard();
   if(stamp!==recovery.deviceStamp||!same(localCopy(),currentLocal))return conflict(s,row,'localChanged');
  }
  const applied=onAck(row,copy(p.payload),recovery?{recovery:copy(recovery)}:null);
  if(applied&&typeof applied.then==='function')throw fail('response');guard();
  // One atomic local entry: an interrupted acknowledgement always retains the original request.
  put({...current,baseline:result,pending:null,conflict:null});return row;
 }
 function observed(s,row,local,dirty){
  rowCheck(row);if(s.pending)throw fail('pending');
  const next=version(row),identical=row&&local&&same(local,row.payload);
  if(s.baseline&&pair(s.baseline,next)&&!s.conflict)return s;
  if(!s.baseline&&row&&dirty&&local&&!identical)throw fail('bootstrap');
  if(s.baseline&&!pair(s.baseline,next)&&dirty&&!identical)return conflict(s,row);
  if(s.conflict&&dirty&&!identical)throw fail(s.conflict.kind||'conflict');
  return {...s,baseline:next,conflict:null};
 }
 // A review is an in-memory capability. Any journal, local input or server change invalidates it.
 // No automatic last-writer choice is made. The caller must obtain explicit confirmation of
 // the selected same-record/field values before passing a candidate to resolveRecovery.
 function recoverySources(s,device,cloud){
  return [device,cloud?.payload,s.pending?.payload,...(s.recoveries||[]).flatMap(r=>[r.device,r.cloud?.payload,r.pending?.payload])].filter(Boolean);
 }
 function cleanRecovery(payload,sources){
  const gone=Object.create(null);
  for(const source of sources)for(const [name,ids] of Object.entries(source.deleted||{})){
   if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id))throw fail('corrupt');
   gone[name]=[...new Set([...(gone[name]||[]),...ids])];
  }
  // Recovery cannot introduce new deletions. Those use the separate deletion workflow.
  for(const [name,ids] of Object.entries(payload.deleted||{})){
   if(!Array.isArray(ids)||ids.some(id=>!gone[name]?.includes(id)))throw fail('incomplete');
  }
  const result=sanitized(payload,[...new Set([...(gone.lessons||[]),...deletedIds()])],[...new Set([...(gone.media||[]),...deletedMediaIds()])]);
  for(const [name,ids] of Object.entries(result.deleted||{}))gone[name]=[...new Set([...(gone[name]||[]),...ids])];
  result.deleted=gone;
  for(const [name,ids] of Object.entries(gone))if(Array.isArray(result[name]))result[name]=result[name].filter(r=>!ids.includes(String(r?.id)));
  return result;
 }
 function requireRecords(candidate,sources){
  for(const rows of Object.values(candidate)){
   if(!Array.isArray(rows))continue;
   const ids=rows.filter(r=>r&&typeof r==='object'&&r.id!=null).map(r=>String(r.id));
   if(new Set(ids).size!==ids.length)throw fail('incomplete');
  }
  // Preserve records unique to any source, including future id-based collections.
  // Conflicting values inside a shared record require a caller's explicit field choice.
  for(const source of sources)for(const [name,rows] of Object.entries(source)){
   if(!Array.isArray(rows)||!rows.some(r=>r&&typeof r==='object'&&r.id!=null))continue;
   const selected=new Set((Array.isArray(candidate[name])?candidate[name]:[]).map(r=>String(r?.id)));
   for(const row of rows)if(row?.id!=null&&!candidate.deleted?.[name]?.includes(String(row.id))&&!selected.has(String(row.id)))throw fail('incomplete');
  }
 }
 function newId(s){
  const used=new Set([s.pending?.id,s.pending?.retiredRequestId,...(s.recoveries||[]).flatMap(r=>[r.id,r.requestId,r.pending?.id,r.pending?.retiredRequestId])]);
  const id=makeId();if(!uuid.test(id)||used.has(id))throw fail('response');return id;
 }
 async function reviewRecovery(){
  return exclusive(async()=>{
   const old=state(),s=scrub(old);if(s!==old)put(s);
   const cloud=await readRow(),device=localCopy();guard();
   if(!same(state(),s))throw fail('review');
   const id=newId(s);
   reviewed={id,journal:copy(s),device,cloud:copy(cloud)};
   const sources=recoverySources(s,device,cloud);
   // Returned values are independent copies and never expose token/credential state.
   return copy({reviewId:id,owner,session,baseline:s.baseline,reason:s.conflict?.kind||(s.pending?.session&&s.pending.session!==session?'session':s.pending?'pending':'review'),
    device:cleanRecovery(device,sources),cloud:cloud?{...cloud,payload:cleanRecovery(cloud.payload,sources)}:null,
    pending:s.pending?{...s.pending,payload:cleanRecovery(s.pending.payload,sources)}:null,
    recoveries:(s.recoveries||[]).map(r=>({...r,device:cleanRecovery(r.device,sources),cloud:r.cloud?{...r.cloud,payload:cleanRecovery(r.cloud.payload,sources)}:null,pending:r.pending?{...r.pending,payload:cleanRecovery(r.pending.payload,sources)}:null}))});
  });
 }
 async function resolveRecovery(reviewId,payload,{confirmed=false}={}){
  return exclusive(async()=>{
   guard();const r=reviewed,s=state();
   if(!confirmed||!r||r.id!==reviewId||!same(s,r.journal)||!same(localCopy(),r.device))throw fail('review');
   if(!valid(payload))throw fail('response');
   // Physical deletion retains a separate proof and must not be re-authorized here.
   if(s.pending?.context||hasMediaDeletes(storage,owner))throw fail('pending');
   const cloud=await readRow();guard();
   if(!same(cloud,r.cloud)||!same(state(),s)||!same(localCopy(),r.device))throw fail('review');
   const expected=version(cloud);
   if(s.baseline?.generation&&s.baseline.generation!==expected.generation)throw fail('generation');
   const sources=recoverySources(s,r.device,cloud),clean=cleanRecovery(payload,sources);
   requireRecords(clean,sources);
   const deviceStamp=await digest(r.device);guard();
   if(!same(state(),s)||!same(localCopy(),r.device))throw fail('review');
   const archive={version:1,id:r.id,owner,session,createdAt:Date.now(),deviceStamp,device:cleanRecovery(r.device,sources),
    cloud:cloud?{...cloud,payload:cleanRecovery(cloud.payload,sources)}:null,
    pending:s.pending?{...s.pending,payload:cleanRecovery(s.pending.payload,sources)}:null};
   const id=newId({...s,recoveries:[...(s.recoveries||[]),archive]});archive.requestId=id;
   // Persist both inputs plus the fresh current-session CAS request in ONE entry before send.
   // Even choosing unchanged cloud content needs this CAS fence against an old in-flight write.
   const next={...s,recoveries:[...(s.recoveries||[]),archive],conflict:null,
    pending:{id,owner,session,...expected,payload:clean,recoveryId:archive.id}};
   put(next);reviewed=null;return finish(next);
  });
 }
 return {
  state:()=>copy(state()),
  reviewRecovery,resolveRecovery,
  recover:()=>exclusive(async()=>{const s=state(),next=scrub(s);if(next!==s)put(next);return finish(next);}),
  redactLessons:(ids,apply=()=>{})=>exclusive(async()=>{const s=state(),next=scrub(s,ids);if(next!==s)put(next);return apply();}),
  redactMedia:(ids,apply=()=>{})=>exclusive(async()=>{const s=state(),next=scrub(s,undefined,ids);if(next!==s)put(next);return apply();}),
  read:readRow,
  observe:(row,local,{dirty=false}={})=>exclusive(async()=>{const s=state(),next=observed(s,row,local,dirty);if(next!==s)put(next);}),
  prepare:(row,getLocal,apply)=>exclusive(async()=>{
   const s=state(),local=getLocal(),next=observed(s,row,local.payload,local.dirty);
   const result=apply(local.payload);if(result&&typeof result.then==='function')throw fail('response');
   if(next!==s)put(next);return result;
  }),
  write:(row,payload,context=null)=>exclusive(async()=>{
   rowCheck(row);if(!valid(payload))throw fail('response');
   const s=state();if(s.pending)throw fail('pending');if(s.conflict)throw fail(s.conflict.kind||'conflict');
   const expected=version(row);if(!s.baseline||!pair(s.baseline,expected))throw fail('conflict');
   const id=makeId();if(!uuid.test(id))throw fail('response');
   const clean=sanitized(payload),changed=!same(clean,payload);
   const next={...s,pending:{id,owner,session,...expected,payload:clean,...(context?{context:mediaContext(context)}:{})},...(changed?{conflict:{...expected,kind:'deleted'}}:{})};
   put(next);return finish(next);
  })
 };
}

const mediaId=/^[a-z0-9_-]{1,200}$/i,stampPattern=/^[a-f0-9]{64}$/;
function mediaContext(value){
 if(value?.kind!=='media-delete'||typeof value.id!=='string'||!mediaId.test(value.id)||value.stamp!==null&&!stampPattern.test(value.stamp)||Object.keys(value).some(k=>!['kind','id','stamp'].includes(k)))throw fail('corrupt');
 return {kind:value.kind,id:value.id,stamp:value.stamp};
}
async function digest(value){
 if(!globalThis.crypto?.subtle)throw fail('unavailable');
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))))),b=>b.toString(16).padStart(2,'0')).join('');
}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function mediaStamp(row){
 if(row===null)return null;
 if(!row||!row.metadata||typeof row.metadata!=='object'||Array.isArray(row.metadata)||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw fail('response');
 const bytes=new TextEncoder().encode(JSON.stringify(canonical({metadata:row.metadata,updated_at:row.updated_at})));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/** Small, account/session-bound delete intents; file bytes and metadata text are never copied. */
function createMediaDeletion({storage,identity,lock,read,validate=()=>{},prepare,cleanup}){
 if(!storage||[identity,lock,read,prepare,cleanup].some(f=>typeof f!=='function'))throw fail('unavailable');
 const who=identity();if(!who||!uuid.test(who.owner)||!uuid.test(who.session))throw fail('identity');
 const {owner,session}=who,prefix='vzip_media_delete_v1:'+encodeURIComponent(owner)+':';
 const guard=()=>{const now=identity();if(now?.owner!==owner||now?.session!==session)throw fail('identity');};
 const key=id=>{if(typeof id!=='string'||!mediaId.test(id))throw fail('response');return prefix+encodeURIComponent(id);};
 function get(id){
  guard();const raw=storage.getItem(key(id));if(raw===null)return null;
  let r;try{r=JSON.parse(raw);}catch{throw fail('corrupt');}
  if(r?.version!==1||r.owner!==owner||r.id!==id||!uuid.test(r.session)||r.stamp!==null&&!stampPattern.test(r.stamp)||!['prepared','root-confirmed','cloud-complete'].includes(r.phase)||!Number.isFinite(r.createdAt)||Object.keys(r).some(k=>!['version','id','owner','session','stamp','phase','createdAt'].includes(k)))throw fail('corrupt');
  return r;
 }
 function put(r){
  guard();const raw=JSON.stringify(r);if(raw.length>4096)throw fail('storage');
  try{storage.setItem(key(r.id),raw);if(storage.getItem(key(r.id))!==raw)throw fail('storage');}catch{throw fail('storage');}guard();
 }
 const own=r=>{if(r&&r.session!==session)throw fail('session');};
 return {
  list:()=>{
   guard();const out=[];
   for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix)){let id;try{id=decodeURIComponent(k.slice(prefix.length));}catch{throw fail('corrupt');}const r=get(id);if(r)out.push(copy(r));}}
   return out;
  },
  run:id=>lock(async()=>{
   guard();let intent=get(id);own(intent);
   const row=await read(id);guard();validate(row);const stamp=await mediaStamp(row);guard();
   if(intent&&row!==null&&intent.stamp!==stamp)throw fail('mediaChanged');
   if(!intent){intent={version:1,id,owner,session,stamp,phase:'prepared',createdAt:Date.now()};put(intent);}
   const proof=await prepare({id,stamp:intent.stamp});guard();
   if(!proof||!Array.isArray(proof.payload?.deleted?.media)||!proof.payload.deleted.media.includes(id))throw fail('response');
   version(proof);
   if(intent.phase!=='cloud-complete'){intent={...intent,phase:'root-confirmed'};put(intent);}
   const latest=await read(id);guard();validate(latest);
   if(latest!==null&&await mediaStamp(latest)!==intent.stamp)throw fail('mediaChanged');guard();
   await cleanup(latest,guard,id);guard();
   intent={...intent,phase:'cloud-complete'};put(intent);return copy(intent);
  },'run',id),
  acknowledge:id=>lock(async()=>{
   guard();const r=get(id);if(!r)return;own(r);if(r.phase!=='cloud-complete')throw fail('pending');
   try{storage.removeItem(key(id));if(storage.getItem(key(id))!==null)throw fail('storage');}catch{throw fail('storage');}guard();
  },'ack',id)
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
return {create,createTransport,hasState,hasMediaDeletes,version,mediaStamp,createMediaDeletion};
});
