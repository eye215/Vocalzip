import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.js';
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',T='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',A='cccccccc-cccc-4ccc-8ccc-cccccccccccc',B='dddddddd-dddd-4ddd-8ddd-dddddddddddd',R='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const secret='isolated-media-proof-secret-not-production',jwtSecret='isolated-jwt-secret-not-production',originalFetch=globalThis.fetch;
const key='u/'+U+'/voice/'+A+'/original.wav',newKey='u/'+U+'/voice/'+B+'/original.wav',legacy='u/'+U+'/voice/original.wav',stamp='2026-11-10T00:00:00.123456Z';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(owner=U,sid=S){const text=encode({alg:'HS256'})+'.'+encode({sub:owner,session_id:sid,role:'authenticated',iss:'https://media-db.test/auth/v1',exp:Math.floor(Date.now()/1000)+3600});return text+'.'+createHmac('sha256',jwtSecret).update(text).digest('base64url');}
function fixture(){
 const state={mode:'revision',active:true,outage:false,receipts:new Map(),calls:[],deleted:[],metadata:true,create:0,uploadsAllowed:true};
 const head={size:3,httpEtag:'"fake-etag"',httpMetadata:{contentType:'audio/wav'},customMetadata:{owner:U,mediaId:'voice',uploadAttempt:A,uploadRoot:'a'.repeat(64)}};
 const objects=new Map([[key,structuredClone(head)],[newKey,{...structuredClone(head),customMetadata:{...head.customMetadata,uploadAttempt:B}}],[legacy,structuredClone(head)]]);
 const env={MEDIA_VERSION_GUARD_ENABLED:'true',SESSION_GUARD_ENABLED:'true',UPLOADS_V2_ENABLED:'true',MEDIA_VERSION_SECRET:secret,SUPABASE_URL:'https://media-db.test',SUPABASE_ANON_KEY:'public-test-key',SUPABASE_JWT_SECRET:jwtSecret,SIGNING_SECRET:jwtSecret,
  MEDIA:{head:async k=>{await state.onHead?.(k);return objects.get(k)||null;},delete:async k=>{state.deleted.push(k);objects.delete(k);await state.afterDelete?.();},createMultipartUpload:async()=>{state.create++;return {uploadId:'fake'};}}};
 globalThis.fetch=async(url,options)=>{
  const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body),claims=JSON.parse(Buffer.from(options.headers.authorization.split('.')[1],'base64url'));state.calls.push({name,body});
  if(state.outage)return Response.json({},{status:503});
  if(name==='vzip_session_context')return Response.json({user_id:claims.sub,allowed:state.active&&options.headers['x-client-info']==='vocalzip-device-session-v2',required:true,playback_token:null});
  if(name==='vzip_media_mutation_context')return Response.json({user_id:claims.sub,mode:state.mode,session_id:claims.session_id});
  if(!state.active)return Response.json({},{status:403});
  if(name==='vzip_edit_media'){
   if(state.conflict)return Response.json({},{status:409});
   const result={version:1,user_id:claims.sub,session_id:claims.session_id,request_id:body.p_request_id,
    id:body.p_media_id,object_key:body.p_key,metadata:{id:body.p_media_id,storageProvider:'r2',r2Key:body.p_key,size:3,type:'audio/wav',r2Etag:'"fake-etag"',...body.p_patch},
    updated_at:'2026-11-10T00:00:00.123457Z',applied_updated_at:'2026-11-10T00:00:00.123457Z',replayed:false,superseded:false};
   return Response.json(state.editResult?state.editResult(result):result);
  }
  if(name==='vzip_media_upload_allowed')return Response.json(state.uploadsAllowed);
  if(name==='vzip_prepare_media_delete'){
   if(state.conflict)return Response.json({},{status:409});
   const r={version:1,user_id:claims.sub,session_id:claims.session_id,request_id:body.p_request_id,media_id:body.p_media_id,object_key:body.p_key,object_version:body.p_version,
    expected_updated_at:body.p_expected_updated_at,size:body.p_size,content_type:body.p_type,content_root:body.p_root,etag:body.p_etag,state:'reserved'};
   const message=['vzip-media-object-v1','1',r.user_id,r.media_id,r.object_key,r.object_version,String(r.size),r.content_type,r.content_root,r.etag].join('\n');
   assert.equal(body.p_signature,createHmac('sha256',secret).update(message).digest('hex'));state.receipts.set(r.request_id,r);return Response.json(r);
  }
  const r=state.receipts.get(body.p_request_id);
  if(name==='vzip_media_delete_status'){state.statusCalls=(state.statusCalls||0)+1;await state.onStatus?.();return Response.json(r||null);}
  if(name==='vzip_finish_media_delete'){
   const message=['vzip-media-deleted-v1',r.user_id,r.session_id,r.request_id,r.object_key,r.object_version].join('\n');
   assert.equal(body.p_signature,createHmac('sha256',secret).update(message).digest('hex'));
   r.state='deleted';state.metadata=false;if(state.loseFinish){state.loseFinish=false;return Response.json({},{status:503});}return Response.json(r);
  }
  throw Error('Unexpected RPC: '+name);
 };
 const call=(path,{body,method=body?'POST':'GET',owner=U,sid=S,headers={}}={})=>worker.fetch(new Request('https://media.test'+path,{method,headers:{authorization:'Bearer '+token(owner,sid),'x-client-info':'vocalzip-device-session-v2',...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}),env);
 const prepare=()=>call('/v2/media/delete/prepare',{body:{requestId:R,mediaId:'voice',key,updatedAt:stamp,size:3}});
 return {env,state,objects,call,prepare};
}
after(()=>{globalThis.fetch=originalFetch;});
test('new contract stays dormant and legacy writes retain their previous path',async()=>{
 const f=fixture();f.env.MEDIA_VERSION_GUARD_ENABLED='false';
 assert.equal((await f.prepare()).status,503);
 assert.equal((await f.call('/v1/media/'+legacy,{method:'DELETE'})).status,200);assert.deepEqual(f.state.deleted,[legacy]);
});
test('protected accounts cannot use old multipart or raw delete APIs, even with a forged client header',async()=>{
 const f=fixture();
 for(const [path,method]of [['/v1/uploads','POST'],['/v1/uploads/old/parts/1?key='+encodeURIComponent(legacy),'PUT'],['/v1/uploads/old/complete?key='+encodeURIComponent(legacy),'POST'],['/v1/media/'+key,'DELETE']]){
  const r=await f.call(path,{method,body:method==='DELETE'?undefined:{},headers:{'x-vzip-media-contract':'immutable-v1'}});
  assert.equal(r.status,426);
 }assert.equal(f.state.create,0);assert.equal(f.state.deleted.length,0);
});
test('legacy account cannot raw-delete an immutable key when the server guard is on',async()=>{
 const f=fixture();f.state.mode='legacy';
 assert.equal((await f.call('/v1/media/'+key,{method:'DELETE'})).status,426);
 assert.equal((await f.call('/v1/media/'+legacy,{method:'DELETE'})).status,200);assert.ok(f.objects.has(key));
});
test('paused accounts and an unavailable backend perform no mutation',async()=>{
 const f=fixture();f.state.mode='paused';assert.equal((await f.prepare()).status,423);
 f.state.mode='revision';f.state.outage=true;assert.equal((await f.prepare()).status,503);assert.equal(f.state.deleted.length,0);
});
test('prepare is read-only for R2 and commit deletes only the exact immutable attempt',async()=>{
 const f=fixture(),response=await f.prepare();assert.equal(response.status,200,await response.clone().text());const {ticket}=await response.json();
 assert.equal(f.state.deleted.length,0);const r=await f.call('/v2/media/delete/commit',{body:{ticket}});
 assert.equal(r.status,200);assert.deepEqual(f.state.deleted,[key]);assert.ok(f.objects.has(newKey));assert.equal(f.state.metadata,false);
 const replay=await f.call('/v2/media/delete/commit',{body:{ticket}});assert.equal(replay.status,200);assert.deepEqual(f.state.deleted,[key]);
});
test('tampered, foreign-session and foreign-owner tickets never delete an object',async()=>{
 for(const kind of ['signature','target','session','owner']){
  const f=fixture(),{ticket}=await(await f.prepare()).json();
  if(kind==='signature')ticket.signature='0'.repeat(64);if(kind==='target')ticket.descriptor.object_key=newKey;
  const r=await f.call('/v2/media/delete/commit',{body:{ticket},...(kind==='session'?{sid:T}:{}),...(kind==='owner'?{owner:V}:{})});
  assert.notEqual(r.status,200);assert.equal(f.state.deleted.length,0);assert.ok(f.objects.has(key));
 }
});
test('wrong size, changed metadata or missing attested original is held before R2 deletion',async()=>{
 const f=fixture();f.objects.get(key).size=4;assert.notEqual((await f.prepare()).status,200);assert.equal(f.state.deleted.length,0);
 f.objects.get(key).size=3;f.state.conflict=true;assert.equal((await f.prepare()).status,409);
 f.state.conflict=false;f.objects.delete(key);assert.equal((await f.prepare()).status,409);
});
test('object mutation after reservation is refused at commit',async()=>{
 const f=fixture(),{ticket}=await(await f.prepare()).json();f.objects.get(key).httpEtag='"different"';
 assert.equal((await f.call('/v2/media/delete/commit',{body:{ticket}})).status,409);assert.equal(f.state.deleted.length,0);
});
test('revocation between prepare and commit cannot delete bytes',async()=>{
 const f=fixture(),{ticket}=await(await f.prepare()).json();f.state.active=false;
 assert.equal((await f.call('/v2/media/delete/commit',{body:{ticket}})).status,401);assert.equal(f.state.deleted.length,0);
});
test('revocation while checking the object is rechecked before physical deletion',async()=>{
 const f=fixture(),{ticket}=await(await f.prepare()).json();f.state.onHead=()=>{f.state.active=false;};
 assert.equal((await f.call('/v2/media/delete/commit',{body:{ticket}})).status,403);assert.equal(f.state.deleted.length,0);
});
test('lost database finish response resumes from its receipt without deleting the new attempt',async()=>{
 const f=fixture(),{ticket}=await(await f.prepare()).json();f.state.loseFinish=true;
 assert.equal((await f.call('/v2/media/delete/commit',{body:{ticket}})).status,503);assert.equal(f.state.metadata,false);
 assert.equal((await f.call('/v2/media/delete/commit',{body:{ticket}})).status,200);assert.deepEqual(f.state.deleted,[key]);assert.ok(f.objects.has(newKey));
});
test('deleted ID uploads are rejected before allocating a multipart upload',async()=>{
 const f=fixture();f.state.uploadsAllowed=false;
 const r=await f.call('/v2/uploads',{body:{mediaId:'voice',contentType:'audio/wav',size:3,ext:'wav',root:'a'.repeat(64)}});
 assert.equal(r.status,409);assert.equal(f.state.create,0);
});
test('missing signing configuration and missing session guard fail closed',async()=>{
 const f=fixture();delete f.env.MEDIA_VERSION_SECRET;assert.equal((await f.prepare()).status,503);
 f.env.SESSION_GUARD_ENABLED='false';assert.equal((await f.call('/v1/media/'+legacy,{method:'DELETE'})).status,503);assert.equal(f.state.deleted.length,0);
});
test('chunked over-limit JSON is rejected before database preparation or object deletion',async()=>{
 const f=fixture();const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(17000)));c.close();}});
 const r=await worker.fetch(new Request('https://media.test/v2/media/delete/prepare',{method:'POST',headers:{authorization:'Bearer '+token(),'x-client-info':'vocalzip-device-session-v2'},body,duplex:'half'}),f.env);
 assert.equal(r.status,413);assert.equal(f.state.deleted.length,0);assert.ok(!f.state.calls.some(x=>x.name==='vzip_prepare_media_delete'));
});

const editBody=()=>({requestId:R,mediaId:'voice',key,updatedAt:stamp,patch:{name:'직접 쓴 제목',review:'개인 메모'}});
test('metadata edit forwards an exact version and patch without touching R2 or retrying conflicts',async()=>{
 const f=fixture();f.state.onHead=()=>{throw Error('metadata-only edit must not read R2');};
 const response=await f.call('/v2/media/edit',{body:editBody()});assert.equal(response.status,200);
 assert.equal((await response.json()).metadata.name,'직접 쓴 제목');
 const rpc=f.state.calls.find(x=>x.name==='vzip_edit_media').body;
 assert.equal(rpc.p_expected_updated_at,stamp);assert.deepEqual(rpc.p_patch,editBody().patch);assert.equal(rpc.p_key,key);
 f.state.conflict=true;assert.equal((await f.call('/v2/media/edit',{body:editBody()})).status,409);
 assert.equal(f.state.calls.filter(x=>x.name==='vzip_edit_media').length,2);assert.equal(f.state.deleted.length,0);assert.ok(f.objects.has(key));
});
test('metadata edit stays disabled for legacy, paused, revoked and unconfigured server states',async()=>{
 for(const scenario of ['legacy','paused','revoked','disabled']){
  const f=fixture();if(scenario==='disabled')f.env.MEDIA_VERSION_GUARD_ENABLED='false';else if(scenario==='revoked')f.state.active=false;else f.state.mode=scenario;
  const response=await f.call('/v2/media/edit',{body:editBody()});
  assert.equal(response.status,{legacy:403,paused:423,revoked:401,disabled:503}[scenario],scenario);
  assert.equal(f.state.calls.some(x=>x.name==='vzip_edit_media'),false);
 }
});
test('metadata edit rejects alternate originals, unversioned timestamps, unknown fields and oversized bodies',async()=>{
 for(const body of [{...editBody(),key:legacy},{...editBody(),key:key.replace(U,V)},{...editBody(),updatedAt:'2026-11-10T00:00:00Z'},
  {...editBody(),requestId:'invalid'},{...editBody(),patch:{}},{...editBody(),patch:{r2Key:newKey}},{...editBody(),patch:{review:'가'.repeat(6000)}}]){
  const f=fixture(),response=await f.call('/v2/media/edit',{body});assert.ok([400,409,413].includes(response.status));assert.equal(f.state.calls.some(x=>x.name==='vzip_edit_media'),false);
 }
});
test('metadata edit cannot acknowledge another identity, request, original, version or unapplied patch',async()=>{
 for(const patch of [{user_id:V},{session_id:T},{request_id:B},{id:'other'},{object_key:newKey},{updated_at:null},
  {replayed:null},{superseded:true},{applied_updated_at:stamp,updated_at:stamp},
  {metadata:{id:'voice',storageProvider:'r2',r2Key:key,name:'unapplied'}}]){
  const f=fixture();f.state.editResult=r=>({...r,...patch});
  // An unchanged version is not a valid acknowledgement of a new edit.
  const response=await f.call('/v2/media/edit',{body:editBody()});
  assert.equal(response.status,503);
 }
});
test('metadata retry can return a later revision only when explicitly marked superseded and replayed',async()=>{
 const f=fixture();f.state.editResult=r=>({...r,replayed:true,superseded:true,updated_at:'2026-11-10T00:00:00.123458Z',metadata:{...r.metadata,name:'나중 제목'}});
 const response=await f.call('/v2/media/edit',{body:editBody()});assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.superseded,true);assert.equal(result.metadata.name,'나중 제목');assert.equal(f.state.deleted.length,0);
});
