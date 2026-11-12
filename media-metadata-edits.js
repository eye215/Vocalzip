/* Account/session-bound media metadata outbox. No original bytes, tokens or signed URLs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipMediaMetadataEdits=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const PREFIX='vzip_media_edit_v1:',MAX_BYTES=1024*1024,MAX_JOBS=100;
const FIELDS=['name','nameMode','autoName','song','songId','created','recordedDate','dateSource','rating','review'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>JSON.stringify(order(a))===JSON.stringify(order(b));
function order(v){return Array.isArray(v)?v.map(order):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])])):v;}
const fail=(message,code,extra={})=>Object.assign(Error(message),{code,...extra});
function stamp(value){
 const m=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!m||!Number.isFinite(Date.parse(m[1]+'Z'))||new Date(m[1]+'Z').toISOString().slice(0,19)!==m[1])throw fail('파일의 수정 버전을 확인해 주세요.','version');
 const at=Date.parse(m[1]+m[3]);if(!Number.isFinite(at))throw fail('파일의 수정 버전을 확인해 주세요.','version');
 const out=new Date(at).toISOString().replace('.000Z','.'+(m[2]||'').padEnd(6,'0')+'Z');
 if(!/^\d{4}-/.test(out))throw fail('파일의 수정 버전을 확인해 주세요.','version');return out;
}
function patch(before,after){
 if(!before||!after||Array.isArray(after)||typeof after!=='object')throw fail('파일 수정 내용을 확인해 주세요.','patch');
 const out={};
 for(const k of new Set([...Object.keys(before),...Object.keys(after)])){
  if(same(before[k],after[k]))continue;
  if(!FIELDS.includes(k)||!Object.hasOwn(after,k)||after[k]===undefined)throw fail('원본 저장 정보는 이 수정으로 바꿀 수 없어요.','unsupported');
  out[k]=clone(after[k]);
 }
 if(Object.hasOwn(out,'songId')||Object.hasOwn(out,'song')){out.songId=String(after.songId||'');out.song=String(after.song||'');}
 if(Object.hasOwn(out,'nameMode')||Object.hasOwn(out,'autoName')){out.name=after.name;out.nameMode=after.nameMode;out.autoName=after.autoName??null;}
 if(Object.hasOwn(out,'created'))out.recordedDate=String(after.recordedDate||'');
 if(new TextEncoder().encode(JSON.stringify(out)).length>16000)throw fail('수정 메모가 너무 길어요. 입력은 이 화면에 남아 있어요.','capacity');
 return out;
}
function prefix(owner){return PREFIX+encodeURIComponent(owner)+':';}
function keys(storage,owner,listKeys){
 const p=prefix(owner),out=[],all=listKeys?listKeys():Array.from({length:storage.length},(_,i)=>storage.key(i));
 for(const k of all)if(k?.startsWith(p))out.push(k);return out;
}
function hasPending(storage,owner,listKeys){return !!owner&&keys(storage,owner,listKeys).length>0;}
function create({storage,identity,mode,send,lock,uuid,listKeys,now=Date.now}){
 const start=identity(),owner=start?.owner,session=start?.session;
 if(!owner||!session)throw fail('로그인 세션을 확인해 주세요.','identity');
 const p=prefix(owner);let active=0;
 function current(){const n=identity();if(n?.owner!==owner||n?.session!==session)throw fail('로그인이 변경되어 수정을 멈췄어요. 이전 입력은 보존돼요.','identity');}
 const key=id=>p+encodeURIComponent(id);
 function read(id){
  current();const raw=storage.getItem(key(id));if(raw===null)return null;let j;
  try{j=JSON.parse(raw);}catch{throw fail('미완료 파일 수정이 손상됐어요. 원문을 보존했어요.','corrupt');}
  if(raw.length*2>65536||j?.version!==1||j.owner!==owner||j.id!==id||typeof j.session!=='string'||
   !['pending','conflict','superseded'].includes(j.state)||!UUID.test(j.request?.requestId||'')||j.request.mediaId!==id||
   typeof j.request.key!=='string'||!j.request.key.startsWith('u/'+owner+'/'+id+'/')||
   !j.request.patch||Array.isArray(j.request.patch)||typeof j.request.patch!=='object'||!j.intent||
   Object.keys(j.request.patch).some(k=>!FIELDS.includes(k)))throw fail('미완료 파일 수정 형식을 확인해 주세요. 기존 입력은 유지돼요.','corrupt');
  stamp(j.request.updatedAt);return {job:j,raw};
 }
 function put(job,expected){
  current();const k=key(job.id);if(storage.getItem(k)!==expected)throw fail('다른 탭의 미완료 수정이 있어요. 다시 확인해 주세요.','pending');
  const raw=JSON.stringify(job);let bytes=raw.length*2,count=1;
  for(const other of keys(storage,owner,listKeys))if(other!==k){count++;bytes+=(storage.getItem(other)||'').length*2;}
  if(raw.length*2>65536||bytes>MAX_BYTES||count>MAX_JOBS)throw fail('미완료 수정 보관 공간이 부족해요. 이전 입력은 유지돼요.','capacity');
  storage.setItem(k,raw);current();return raw;
 }
 function unchanged(id,raw){current();if(storage.getItem(key(id))!==raw)throw fail('미완료 수정이 다른 탭에서 바뀌었어요. 덮어쓰지 않았어요.','pending');}
 async function route(id){
  current();const value=await mode();current();
  if(value==='legacy'){if(read(id))throw fail('미완료 수정을 보존하고 이전 저장 방식으로 우회하지 않아요.','pending');return false;}
  if(value!=='revision')throw fail('현재 파일 수정 저장 방식을 확인해 주세요.','mode');return true;
 }
 async function transmit(job,raw){
  current();if(job.session!==session)throw fail('이전 로그인에서 작성한 수정이 남아 있어요. 확인 전에는 다시 보내지 않아요.','previous_session');
  if(job.state!=='pending')throw fail(job.state==='superseded'?'이후에 다른 수정이 있어요. 보관된 입력과 최신 내용을 확인해 주세요.':'다른 기기 수정과 충돌했어요. 보관된 입력을 확인해 주세요.',job.state);
  unchanged(job.id,raw);
  try{
   const result=await send(clone(job.request));unchanged(job.id,raw);
   if(!result||result.version!==1||result.user_id!==owner||result.session_id!==session||
    result.request_id!==job.request.requestId||result.id!==job.id||result.object_key!==job.request.key||
    result.metadata?.id!==job.id||result.metadata?.r2Key!==job.request.key||
    typeof result.replayed!=='boolean'||typeof result.superseded!=='boolean'||
    stamp(result.applied_updated_at)<=job.request.updatedAt||stamp(result.applied_updated_at)>stamp(result.updated_at)||
    result.superseded!==(stamp(result.applied_updated_at)!==stamp(result.updated_at))||
    (result.superseded&&!result.replayed)||(!result.superseded&&Object.entries(job.request.patch).some(([k,v])=>!same(result.metadata[k],v))))
     throw fail('수정 응답을 확인하지 못했어요. 같은 요청으로 결과를 확인해 주세요.','response');
   if(result.superseded){put({...job,state:'superseded'},raw);throw fail('이후에 다른 수정이 있어요. 최신 내용으로 조용히 교체하지 않고 입력을 보존했어요.','superseded');}
   storage.removeItem(key(job.id));current();return clone(result);
  }catch(error){
   current();
   if(error.status===409){unchanged(job.id,raw);put({...job,state:'conflict'},raw);}
   throw error;
  }
 }
 async function locked(id,fn){
  current();if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw fail('파일 ID를 확인해 주세요.','binding');
  if(typeof lock!=='function')throw fail('이 브라우저의 안전한 파일 수정 잠금을 확인해 주세요.','lock');
  active++;try{return await lock('vzip-media-edit:'+owner+':'+id,async()=>{current();return fn();});}finally{active--;}
 }
 async function run({id,intent,load,mutate}){
  current();if(!await route(id))return null;
  return locked(id,async()=>{
   const old=read(id);
   if(old){if(!same(old.job.intent,intent))throw fail('다른 미완료 수정이 남아 있어요. 먼저 결과를 확인해 주세요.','pending');return transmit(old.job,old.raw);}
   const row=await load();current();if(!row?.metadata)throw fail('원본 파일 정보를 찾지 못했어요.','missing');
   const before=clone(row.metadata),after=mutate(clone(before));current();
   if(after===null)return {metadata:before,updated_at:stamp(row.updated_at),noop:true};
   const changes=patch(before,after);
   if(!Object.keys(changes).length)return {metadata:before,updated_at:stamp(row.updated_at),noop:true};
   const version=stamp(row.updated_at),parts=String(before.r2Key||'').split('/');
   if(before.id!==id||before.storageProvider!=='r2'||parts.length!==5||parts[0]!=='u'||parts[1]!==owner||parts[2]!==id||
    !UUID.test(parts[3])||!/^original\.[a-z0-9]{1,8}$/.test(parts[4])||
    !Number.isSafeInteger(before.size)||before.size<1||before.size>2147483648||!/^audio\/[A-Za-z0-9.+-]{1,60}$/.test(before.type||'')||
    !/^[!-~]{1,200}$/.test(before.r2Etag||'')||['legacyStorage','path','parts','storageVersion'].some(k=>Object.hasOwn(before,k)))
     throw fail('기존 원본은 새 저장 방식 인수가 먼저 필요해요.','adoption');
   const request={requestId:uuid(),mediaId:id,key:before.r2Key,updatedAt:version,patch:changes};
   if(!UUID.test(request.requestId))throw fail('수정 요청 ID를 만들지 못했어요.','request');
   const job={version:1,owner,session,id,state:'pending',createdAt:now(),intent:clone(intent||{}),request};
   const raw=put(job,null);return transmit(job,raw);
  });
 }
 function list(){current();return keys(storage,owner,listKeys).map(k=>read(decodeURIComponent(k.slice(p.length)))?.job).filter(Boolean).map(clone);}
 async function retry(id){return locked(id,async()=>{if(!await route(id))throw fail('미완료 수정을 기존 방식으로 다시 보내지 않아요.','mode');const old=read(id);if(!old)throw fail('미완료 수정이 없어요.','missing');return transmit(old.job,old.raw);});}
 async function discard(id,{confirmed=false,requestId}={}){
  if(confirmed!==true)throw fail('보관된 수정 입력 삭제를 확인해 주세요.','confirmation');
  return locked(id,()=>{
   const old=read(id);if(!old||old.job.request.requestId!==requestId)throw fail('미완료 수정이 바뀌었어요. 다시 확인해 주세요.','pending');
   if(old.job.state==='pending')throw fail('아직 저장 결과가 불명확해요. 먼저 같은 요청의 결과를 확인해 주세요.','pending');
   unchanged(id,old.raw);storage.removeItem(key(id));return true;
  });
 }
 return {run,retry,discard,list,route,busy:()=>active>0};
}
return {create,stamp,patch,hasPending,FIELDS,PREFIX,MAX_BYTES,MAX_JOBS};
});
