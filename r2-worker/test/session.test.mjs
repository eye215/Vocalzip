import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.js';
const uid='11111111-1111-4111-8111-111111111111',sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',cap='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const secret='isolated-session-test-secret',protocol='vocalzip-device-session-v2',key='u/'+uid+'/clip/original.wav';
const originalFetch=globalThis.fetch;
let state;
function token(){const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const text=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,session_id:sid,role:'authenticated',aud:'authenticated',iss:'https://supabase.test/auth/v1',exp:Math.floor(Date.now()/1000)+3600});return text+'.'+createHmac('sha256',secret).update(text).digest('base64url');}
function fixture(){
 state={active:true,unavailable:false,legacy:false,completed:false,deletes:0,revokeOnComplete:false};
 const data=new TextEncoder().encode('voice'),meta={size:data.length,httpEtag:'"voice"',writeHttpMetadata:h=>h.set('content-type','audio/wav')};
 const env={SESSION_GUARD_ENABLED:'true',SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'public-fixture',SUPABASE_JWT_SECRET:secret,SIGNING_SECRET:secret,ALLOWED_ORIGINS:'https://app.test',
 MEDIA:{head:async()=>meta,get:async()=>({...meta,body:data}),delete:async()=>{state.deletes++;},resumeMultipartUpload:()=>({complete:async()=>{state.completed=true;if(state.revokeOnComplete)state.active=false;return meta;}})}};
 globalThis.fetch=async(url,options)=>{
  if(state.unavailable)return new Response('{}',{status:503});
  const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body||'{}'),headers=new Headers(options.headers);
  let result;
  if(name==='vzip_session_context')result={user_id:uid,allowed:state.active&&headers.get('x-client-info')===protocol,required:true,playback_token:state.active?cap:null};
  else if(name==='vzip_playback_owner')result=state.active&&body.p_capability===cap?uid:null;
  else if(name==='vzip_legacy_media_allowed')result=state.legacy;
  else throw Error('Unexpected test RPC: '+name);
  return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
 };
 return env;
}
after(()=>{globalThis.fetch=originalFetch;});
function request(path,{body,method=body?'POST':'GET',headers={}}={}){
 return new Request('https://worker.test'+path,{method,headers:{authorization:'Bearer '+token(),'x-client-info':protocol,...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
}
test('R2 requests require the registered session and protocol; backend outages fail closed',async()=>{
 const env=fixture();
 assert.equal((await worker.fetch(request('/v1/me'),env)).status,200);
 assert.equal((await worker.fetch(request('/v1/me',{headers:{'x-client-info':''}}),env)).status,401);
 state.active=false;assert.equal((await worker.fetch(request('/v1/me'),env)).status,401);
 state.active=true;state.unavailable=true;assert.equal((await worker.fetch(request('/v1/me'),env)).status,503);
});
test('signed media URLs are bound to their session and reject revoked, stripped and tampered capabilities',async()=>{
 const env=fixture(),signed=await worker.fetch(request('/v1/sign',{body:{key}}),env);
 assert.equal(signed.status,200);const {url}=await signed.json();assert.equal(new URL(url).searchParams.get('cap'),cap);
 let result=await worker.fetch(new Request(url),env);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');
 const stripped=new URL(url);stripped.searchParams.delete('cap');assert.equal((await worker.fetch(new Request(stripped),env)).status,403);
 const tampered=new URL(url);tampered.searchParams.set('cap','dddddddd-dddd-4ddd-8ddd-dddddddddddd');assert.equal((await worker.fetch(new Request(tampered),env)).status,403);
 state.active=false;
 assert.equal((await worker.fetch(new Request(url),env)).status,403);
 assert.equal((await worker.fetch(new Request(url,{method:'HEAD'}),env)).status,403);
 assert.equal((await worker.fetch(new Request(url,{headers:{range:'bytes=0-1'}}),env)).status,403);
});
test('legacy signatures are refused after server activation and retained during preparation',async()=>{
 const env=fixture(),exp=Math.floor(Date.now()/1000)+60,sig=createHmac('sha256',secret).update(key+'\n'+exp).digest('base64url');
 const url='https://worker.test/v1/media/'+key+'?exp='+exp+'&sig='+sig;
 assert.equal((await worker.fetch(new Request(url),env)).status,403);
 state.legacy=true;assert.equal((await worker.fetch(new Request(url),env)).status,200);
});
test('logout during multipart completion refuses finalization without deleting the uploaded original',async()=>{
 const env=fixture();state.revokeOnComplete=true;
 const r=await worker.fetch(request('/v1/uploads/mock/complete?key='+encodeURIComponent(key),{body:{parts:[{partNumber:1,etag:'one'}]}}),env);
 assert.equal(r.status,401);assert.equal(state.completed,true);assert.equal(state.deletes,0);
});
test('CORS allows the session protocol header and health identifies the deployed guard',async()=>{
 const env=fixture();
 const r=await worker.fetch(new Request('https://worker.test/v1/me',{method:'OPTIONS',headers:{origin:'https://app.test','access-control-request-headers':'x-client-info,authorization'}}),env);
 assert.equal(r.status,204);assert.match(r.headers.get('access-control-allow-headers'),/x-client-info/);
 assert.equal((await (await worker.fetch(new Request('https://worker.test/health'),env)).json()).sessionContract,'v2');
});
