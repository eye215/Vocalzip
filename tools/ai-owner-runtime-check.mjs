// One synthetic, marked Auth account. No actual-user login or paid/audio request.
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const plan=JSON.parse(readFileSync('ops/ai-owner-only-release.json','utf8'));
if(plan.mode!=='verify')process.exit(0);
const root='https://chxnbtiyuyhiywzeshis.supabase.co';
const anon=readFileSync('cloud-sync.js','utf8').match(/const key='([^']+)'/)?.[1];
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const marker='ai-owner-'+process.env.GITHUB_RUN_ID+'-'+randomBytes(8).toString('hex');
let fixture,completed=false,cleaned=false;
const check=(ok,label)=>{if(!ok)throw Error(label);};
async function api(path,{token,body,method=body?'POST':'GET',admin=false,contentType='application/json'}={}){
 const response=await fetch(root+path,{method,headers:{apikey:admin?service:anon,Authorization:'Bearer '+(admin?service:token||anon),'X-Client-Info':'vocalzip-device-session-v2',...(body?{'Content-Type':contentType}:{})},body:body?typeof body==='string'?body:JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let data=null;try{data=await response.json();}catch{}
 return {ok:response.ok,status:response.status,data};
}
try{
 check(anon&&service,'CONNECTION_MISSING');
 const email='vzip-ai-gate-'+randomBytes(12).toString('hex')+'@example.invalid',password=randomBytes(32).toString('base64url');
 const created=await api('/auth/v1/admin/users',{admin:true,body:{email,password,email_confirm:true,user_metadata:{vzip_ai_owner_gate_e2e:marker}}});
 check(created.ok,'FIXTURE_CREATE');fixture=created.data?.user||created.data;check(fixture?.id,'FIXTURE_ID');
 const login=await api('/auth/v1/token?grant_type=password',{body:{email,password}});
 check(login.ok&&login.data?.user?.id===fixture.id&&login.data?.access_token,'FIXTURE_LOGIN');
 const token=login.data.access_token,rpc=(name,body={})=>api('/rest/v1/rpc/'+name,{token,body});
 check((await rpc('vzip_register_session',{p_label:'AI owner gate check'})).ok,'FIXTURE_REGISTER');
 const context=await rpc('vzip_session_context');check(context.ok&&context.data?.allowed===true,'FIXTURE_SESSION');
 const allowed=await rpc('vzip_ai_owner_allowed');check(allowed.ok&&allowed.data===false,'NON_OWNER_POLICY');
 const reserved=await rpc('vzip_song_stt_reserve');check(reserved.ok&&reserved.data===false,'NON_OWNER_RESERVATION');
 const readiness=await api('/functions/v1/vzip-song-stt',{token});check(readiness.status===403,'NON_OWNER_EDGE_READINESS');
 // Malformed, non-audio data cannot reach a paid model even if the check regresses.
 const post=await api('/functions/v1/vzip-song-stt',{token,body:'{"fixture":true}'});
 check(post.status===403,'NON_OWNER_EDGE_POST');
 const usage=await rpc('vzip_song_stt_usage');
 check(usage.ok&&Array.isArray(usage.data)&&usage.data.every(x=>x.used_total===0&&x.used_today===0),'FIXTURE_USAGE');
 console.log(JSON.stringify({registered_non_owner:true,owner_policy_denied:true,reservation_denied:true,edge_readiness_status:readiness.status,edge_post_status:post.status,fixture_usage_zero:true,paid_audio_requests_sent:0}));
 completed=true;
}catch(error){
 const safe=new Set(['CONNECTION_MISSING','FIXTURE_CREATE','FIXTURE_ID','FIXTURE_LOGIN','FIXTURE_REGISTER','FIXTURE_SESSION','NON_OWNER_POLICY','NON_OWNER_RESERVATION','NON_OWNER_EDGE_READINESS','NON_OWNER_EDGE_POST','FIXTURE_USAGE']);
 console.error('AI_OWNER_RUNTIME_CHECK_FAILED '+(safe.has(error.message)?error.message:'NETWORK_OR_CHECK'));process.exitCode=1;
}finally{
 if(fixture?.id){
  try{
   const current=await api('/auth/v1/admin/users/'+encodeURIComponent(fixture.id),{admin:true});
   const user=current.data?.user||current.data;
   check(current.ok&&user?.id===fixture.id&&user?.user_metadata?.vzip_ai_owner_gate_e2e===marker,'CLEANUP_OWNERSHIP');
   const removed=await api('/auth/v1/admin/users/'+encodeURIComponent(fixture.id),{admin:true,method:'DELETE'});
   check(removed.ok,'CLEANUP_FAILED');cleaned=true;
  }catch{console.error('AI_OWNER_FIXTURE_CLEANUP_FAILED');process.exitCode=1;}
 }
 console.log(JSON.stringify({runtime_checks_passed:completed,synthetic_fixture_removed:cleaned}));
}
