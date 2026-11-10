/* Dormant immutable-object deletion contract. No key is conditionally overwritten.
 * A completed, unique upload-attempt key + server tombstone guard is the authority.
 * No credentials or original/user metadata are included in logs. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
 ID=/^[A-Za-z0-9_-]{1,100}$/,HEX=/^[0-9a-f]{64}$/;
export async function mediaRpc(request,env,name,body,{fail}){
 if(!env.SUPABASE_ANON_KEY)fail(503,'media validation is not configured');
 let response;
 try{response=await fetch(String(env.SUPABASE_URL||'').replace(/\/+$/,'')+'/rest/v1/rpc/'+name,{
  method:'POST',redirect:'manual',headers:{apikey:env.SUPABASE_ANON_KEY,authorization:request.headers.get('authorization')||'',
   'content-type':'application/json','x-client-info':request.headers.get('x-client-info')||''},
  body:JSON.stringify(body),signal:AbortSignal.timeout(8000)
 });}catch{fail(503,'media validation unavailable');}
 if(!response.ok)fail(response.status===401?401:response.status===403?403:[400,409].includes(response.status)?409:503,'media operation not confirmed');
 try{return await response.json();}catch{fail(503,'invalid media validation response');}
}
export function isMediaMutation(path,method){
 return ['POST','PUT','DELETE'].includes(method)&&(
  path.startsWith('/v1/uploads')||path.startsWith('/v1/media/')||
  path.startsWith('/v2/media/')||path.startsWith('/v2/uploads')&&path!=='/v2/uploads/status');
}
export async function mediaPolicy(request,env,uid,api){
 if(env.MEDIA_VERSION_GUARD_ENABLED!=='true')return null;
 const url=new URL(request.url),mutation=isMediaMutation(url.pathname,request.method);
 if(!mutation&&url.pathname!=='/v1/me')return null;
 const {fail}=api;if(env.SESSION_GUARD_ENABLED!=='true')fail(503,'registered media sessions required');
 const context=await mediaRpc(request,env,'vzip_media_mutation_context',{},api);
 if(!context||context.user_id!==uid||!['legacy','revision','paused'].includes(context.mode))fail(503,'invalid media account context');
 if(mutation){
  if(context.mode==='paused')fail(423,'media writes are paused');
  const legacy=url.pathname.startsWith('/v1/uploads')||url.pathname.startsWith('/v1/media/');
  if(legacy&&context.mode!=='legacy')fail(426,'versioned media contract required');
  if(url.pathname.startsWith('/v1/media/')){
   let key;try{key=decodeURIComponent(url.pathname.slice('/v1/media/'.length));}catch{fail(400,'invalid media key');}
   const parts=key.split('/');if(parts.length===5&&UUID.test(parts[3])&&/^original\.[a-z0-9]{1,8}$/.test(parts[4]))fail(426,'immutable media requires a deletion ticket');
  }
 }
 return context;
}
async function bounded(request,fail){
 const limit=16384;if(Number(request.headers.get('content-length'))>limit||!request.body)fail(413,'invalid media request');
 const reader=request.body.getReader(),bytes=new Uint8Array(limit);let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;if(size+next.value.length>limit){await reader.cancel();fail(413,'media request too large');}bytes.set(next.value,size);size+=next.value.length;}}finally{reader.releaseLock();}
 try{return JSON.parse(new TextDecoder().decode(bytes.subarray(0,size)));}catch{fail(400,'invalid media request');}
}
function secret(env,fail){
 if(typeof env.MEDIA_VERSION_SECRET!=='string'||env.MEDIA_VERSION_SECRET.length<32||env.MEDIA_VERSION_SECRET.length>1024)fail(503,'media proof signing is not configured');
 return env.MEDIA_VERSION_SECRET;
}
async function sign(env,text,fail){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret(env,fail)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
const fields=['version','user_id','session_id','request_id','media_id','object_key','object_version','expected_updated_at','size','content_type','content_root','etag'];
const ticketText=d=>['vzip-media-delete-v1',...fields.map(k=>String(d[k]))].join('\n');
const completedText=d=>['vzip-media-deleted-v1',d.user_id,d.session_id,d.request_id,d.object_key,d.object_version].join('\n');
const objectText=d=>['vzip-media-object-v1','1',d.user_id,d.media_id,d.object_key,d.object_version,String(d.size),d.content_type,d.content_root,d.etag].join('\n');
function objectKey(uid,id,key,fail){
 if(!ID.test(id||'')||typeof key!=='string'||key.length>300)fail(400,'invalid immutable media');
 const p=key.split('/');
 if(p.length!==5||p[0]!=='u'||p[1]!==uid||p[2]!==id||!UUID.test(p[3])||!/^original\.[a-z0-9]{1,8}$/.test(p[4]))fail(409,'legacy or different media target');
 return p[3];
}
function receipt(value,uid,sid,fail){
 if(!value||value.version!==1||value.user_id!==uid||value.session_id!==sid||!UUID.test(value.request_id||'')||!UUID.test(value.object_version||'')||
  !['reserved','deleted'].includes(value.state)||!Number.isSafeInteger(value.size)||value.size<1||value.size>2147483648||
  !/^audio\/[A-Za-z0-9.+-]{1,60}$/.test(value.content_type||'')||!HEX.test(value.content_root||'')||!/^[!-~]{1,200}$/.test(value.etag||'')||
  typeof value.expected_updated_at!=='string'||value.expected_updated_at.length>80||!Number.isFinite(Date.parse(value.expected_updated_at)))fail(503,'invalid deletion receipt');
 if(objectKey(uid,value.media_id,value.object_key,fail)!==value.object_version)fail(503,'invalid deletion version');
 return Object.fromEntries([...fields,'state'].map(k=>[k,value[k]]));
}
function headMatches(head,d,fail){
 if(!head)return;
 const m=head.customMetadata||{};
 if(head.size!==d.size||head.httpMetadata?.contentType!==d.content_type||head.httpEtag!==d.etag||
  m.owner!==d.user_id||m.mediaId!==d.media_id||m.uploadAttempt!==d.object_version||m.uploadRoot!==d.content_root)fail(409,'immutable object changed');
}
export async function handleMediaV2(request,env,uid,sid,context,api){
 const {fail,json,equal}=api,url=new URL(request.url);
 if(env.MEDIA_VERSION_GUARD_ENABLED!=='true'||env.SESSION_GUARD_ENABLED!=='true')fail(503,'versioned media is disabled');
 if(context?.mode!=='revision')fail(403,'revision media account required');
 if(!UUID.test(sid||''))fail(401,'registered media session required');secret(env,fail);
 const body=await bounded(request,fail);
 if(url.pathname==='/v2/media/publish'&&request.method==='POST'){
  const m=body?.metadata;
  if(!UUID.test(body?.requestId||'')||!m||Array.isArray(m)||typeof m!=='object'||
   m.storageProvider!=='r2'||!Number.isSafeInteger(m.size)||m.size<1||m.size>2147483648||
   ['blob','bytes','path','parts','legacyStorage','storageVersion'].some(k=>Object.hasOwn(m,k)))fail(400,'invalid publication metadata');
  const version=objectKey(uid,m.id,m.r2Key,fail),text=JSON.stringify(m);
  if(new TextEncoder().encode(text).length>16000)fail(413,'publication metadata too large');
  const head=await env.MEDIA.head(m.r2Key);if(!head)fail(409,'completed original is not verified');
  const d={version:1,user_id:uid,session_id:sid,request_id:body.requestId,media_id:m.id,object_key:m.r2Key,object_version:version,
   expected_updated_at:new Date().toISOString(),size:m.size,content_type:m.type,content_root:head.customMetadata?.uploadRoot,etag:m.r2Etag,state:'reserved'};
  receipt(d,uid,sid,fail);headMatches(head,d,fail);
  if(Object.hasOwn(m,'r2Root')&&m.r2Root!==d.content_root)fail(409,'publication root changed');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  const proof=['vzip-media-publish-v1','1',uid,sid,body.requestId,m.id,m.r2Key,version,String(m.size),m.type,d.content_root,m.r2Etag,hash].join('\n');
  const saved=await mediaRpc(request,env,'vzip_publish_media',{p_request_id:body.requestId,p_metadata_text:text,p_version:version,
   p_root:d.content_root,p_etag:m.r2Etag,p_signature:await sign(env,proof,fail)},api);
  if(!saved||saved.version!==1||saved.user_id!==uid||saved.session_id!==sid||saved.request_id!==body.requestId||
   saved.id!==m.id||saved.metadata?.id!==m.id||saved.metadata?.storageProvider!=='r2'||saved.metadata?.r2Key!==m.r2Key||
   saved.metadata?.size!==m.size||saved.metadata?.type!==m.type||saved.metadata?.r2Etag!==m.r2Etag||
   !Number.isFinite(Date.parse(saved.updated_at)))fail(503,'publication not confirmed');
  return json(saved);
 }
 if(url.pathname==='/v2/media/delete/prepare'&&request.method==='POST'){
  if(!UUID.test(body.requestId||'')||typeof body.updatedAt!=='string'||body.updatedAt.length>80||!Number.isFinite(Date.parse(body.updatedAt))||
   !Number.isSafeInteger(body.size)||body.size<1||body.size>2147483648)fail(400,'invalid deletion target');
  const version=objectKey(uid,body.mediaId,body.key,fail);
  const head=await env.MEDIA.head(body.key);let stored;
  if(head){
   const d={version:1,user_id:uid,session_id:sid,request_id:body.requestId,media_id:body.mediaId,object_key:body.key,object_version:version,
    expected_updated_at:body.updatedAt,size:body.size,content_type:head.httpMetadata?.contentType,content_root:head.customMetadata?.uploadRoot,etag:head.httpEtag,state:'reserved'};
   receipt(d,uid,sid,fail);headMatches(head,d,fail);
   stored=await mediaRpc(request,env,'vzip_prepare_media_delete',{
    p_request_id:d.request_id,p_media_id:d.media_id,p_key:d.object_key,p_version:d.object_version,p_expected_updated_at:d.expected_updated_at,
    p_size:d.size,p_type:d.content_type,p_root:d.content_root,p_etag:d.etag,p_signature:await sign(env,objectText(d),fail)
   },api);
  }else stored=await mediaRpc(request,env,'vzip_media_delete_status',{p_request_id:body.requestId},api);
  if(!stored)fail(409,'completed original is not verified');
  const d=receipt(stored,uid,sid,fail);
  if(d.request_id!==body.requestId||d.media_id!==body.mediaId||d.object_key!==body.key||d.object_version!==version||
    d.size!==body.size||Date.parse(d.expected_updated_at)!==Date.parse(body.updatedAt))fail(409,'deletion target changed');
  const descriptor=Object.fromEntries(fields.map(k=>[k,d[k]]));
  return json({ticket:{descriptor,signature:await sign(env,ticketText(descriptor),fail)},state:d.state});
 }
 if(url.pathname==='/v2/media/delete/commit'&&request.method==='POST'){
  const ticket=body.ticket,d=receipt({...ticket?.descriptor,state:'reserved'},uid,sid,fail);
  if(!ticket?.descriptor||Object.keys(ticket.descriptor).length!==fields.length||Object.keys(ticket.descriptor).some(k=>!fields.includes(k))||
   !HEX.test(ticket.signature||''))fail(403,'invalid deletion ticket');
  const expected=await sign(env,ticketText(d),fail);if(!equal(expected,ticket.signature))fail(403,'invalid deletion ticket');
  let current=receipt(await mediaRpc(request,env,'vzip_media_delete_status',{p_request_id:d.request_id},api),uid,sid,fail);
  if(ticketText(current)!==ticketText(d))fail(409,'deletion proof changed');
  if(current.state==='deleted')return json({ok:true,state:'deleted',key:d.object_key,requestId:d.request_id});
  const head=await env.MEDIA.head(d.object_key);headMatches(head,d,fail);
  current=receipt(await mediaRpc(request,env,'vzip_media_delete_status',{p_request_id:d.request_id},api),uid,sid,fail);
  if(ticketText(current)!==ticketText(d))fail(409,'deletion proof changed');
  if(current.state!=='deleted'){
   if(head)await env.MEDIA.delete(d.object_key);
   const done=receipt(await mediaRpc(request,env,'vzip_finish_media_delete',{p_request_id:d.request_id,p_signature:await sign(env,completedText(d),fail)},api),uid,sid,fail);
   if(done.state!=='deleted'||ticketText(done)!==ticketText(d))fail(503,'deletion completion not confirmed');
  }
  return json({ok:true,state:'deleted',key:d.object_key,requestId:d.request_id});
 }
 fail(404,'not found');
}
