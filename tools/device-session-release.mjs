// Explicit release operations only. No secret values, user data or bearer URLs in logs.
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const env=process.env,plan=JSON.parse(readFileSync('ops/device-session-release.json','utf8'));
const ROOT='https://chxnbtiyuyhiywzeshis.supabase.co',PROJECT='chxnbtiyuyhiywzeshis';
const PUBLIC=readFileSync('cloud-sync.js','utf8').match(/const key='([^']+)'/)[1];
const PROTOCOL='vocalzip-device-session-v2',AUTH_KEY='sb-'+PROJECT+'-auth-token';
const WORKER=readFileSync('r2-config.js','utf8').match(/VZIP_R2_ENDPOINT = '([^']+)'/)[1].replace(/\/+$/,'');
let step='validate plan',activated=false,db,server;
const created=[],run=env.GITHUB_RUN_ID||randomBytes(8).toString('hex');
const mark=value=>{step=value;console.log('STEP '+value);};
const check=(value,label)=>{if(!value)throw Error(label);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,{token,body,method=body?'POST':'GET',admin=false,protocol=true,headers={}}={}){
 const res=await fetch(ROOT+path,{method,headers:{apikey:admin?env.SUPABASE_SERVICE_ROLE_KEY:PUBLIC,Authorization:'Bearer '+(admin?env.SUPABASE_SERVICE_ROLE_KEY:token||PUBLIC),...(protocol?{'X-Client-Info':PROTOCOL}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let data=null;try{data=await res.json();}catch{}
 return{status:res.status,ok:res.ok,data};
}
const rpc=(session,name,body={},protocol=true)=>api('/rest/v1/rpc/'+name,{token:session?.access_token,body,protocol});
async function requireRpc(session,name,body={}){const r=await rpc(session,name,body);check(r.ok,'RPC status '+r.status);return r.data;}
const sid=session=>JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString()).session_id;
async function createFixture(label){
 mark('create synthetic '+label);
 const email='vzip-session-'+run+'-'+label+'-'+randomBytes(5).toString('hex')+'@example.invalid',password=randomBytes(30).toString('base64url');
 const r=await api('/auth/v1/admin/users',{admin:true,body:{email,password,email_confirm:true,user_metadata:{vzip_e2e_run:run}}});
 check(r.ok&&r.data?.id,'fixture creation');
 created.push(r.data.id);return{id:r.data.id,email,password};
}
async function login(user){
 const r=await api('/auth/v1/token?grant_type=password',{body:{email:user.email,password:user.password}});
 check(r.ok&&r.data?.access_token&&r.data?.refresh_token,'fixture login '+r.status);
 const session=r.data,claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
 session.expires_at=claims.exp;return session;
}
async function cleanup(){
 for(const id of created){
  try{
   const current=await api('/auth/v1/admin/users/'+id,{admin:true});
   if(current.status===404)continue;
   check(current.ok&&current.data?.id===id&&current.data?.user_metadata?.vzip_e2e_run===run,'fixture cleanup ownership');
   const r=await api('/auth/v1/admin/users/'+id,{admin:true,method:'DELETE',body:{should_soft_delete:false}});
   check(r.ok,'fixture cleanup failed');
  }catch{console.error('Synthetic fixture cleanup requires follow-up');process.exitCode=1;}
 }
}
async function workerRequest(session,path,body){
 const response=await fetch(WORKER+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'X-Client-Info':PROTOCOL,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let data=null;try{data=await response.json();}catch{}
 return{ok:response.ok,status:response.status,data};
}
async function workerReady(){
 mark('wait for deployed R2 session guard');
 for(let i=0;i<12;i++){
  try{const r=await fetch(WORKER+'/health?release='+plan.sourceSha,{cache:'no-store',signal:AbortSignal.timeout(10000)});const data=await r.json();if(r.ok&&data.ok&&data.bucket&&data.sessionContract==='v2')return;}catch{}
  await pause(20000);
 }
 throw Error('R2 deployment not ready');
}
async function browserSmoke(user,sessions){
 mark('candidate browser authentication and billing smoke');
 const {chromium}=await import('@playwright/test');
 server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:8765/')).ok)break;}catch{}await pause(200);}
 const browser=await chromium.launch({headless:true});
 const contexts=[];
 try{
  for(const session of sessions.slice(0,2)){
   const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
   await context.addInitScript(({session,owner,key})=>{
    localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('vzip_account_scope_owner_v1',owner);
   },{session,owner:user.id,key:AUTH_KEY});
   const page=await context.newPage();await page.goto('http://127.0.0.1:8765/');
   await page.waitForFunction(()=>window.vzipCloudSignedIn?.()===true,{},{timeout:45000});
   check(await page.evaluate(()=>document.querySelector('#vzip-auth-screen').hidden),'browser login gate');
   check(await page.evaluate(()=>window.VzipAccountScope?.owner)===user.id,'browser account boundary');
   await page.goto('http://127.0.0.1:8765/billing/');
   await page.waitForFunction(()=>window.VzipBillingSession?.active===true&&!!window.VzipBillingStore,{},{timeout:30000});
   check(await page.evaluate(()=>!document.querySelector('main.billing').inert),'billing gate');
   check(await page.evaluate(async()=>(await window.VzipBillingStore.load()).owner)==='user:'+user.id,'billing owner and scoped store');
  }
  console.log('Browser smoke: two independent sessions and billing verified');
 }finally{await browser.close();server.kill();server=null;}
}
async function exercise({withWorker=false,activate=false,browser=false}={}){
 const a=await createFixture('a'),b=await createFixture('b');
 mark('two Auth sessions and server slots');
 const first=await login(a),second=await login(a);
 check((await requireRpc(first,'vzip_register_session',{p_label:'release phone'})).status==='active','first slot');
 check((await requireRpc(second,'vzip_register_session',{p_label:'release tablet'})).status==='active','second slot');
 const list=await requireRpc(second,'vzip_list_sessions');
 check(list.limit===2&&list.sessions.length===2,'server limit is two');
 mark('refresh preserves a concurrent login');
 const refreshed=await api('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:first.refresh_token}});
 check(refreshed.ok&&sid(refreshed.data)===sid(first),'concurrent Auth refresh');
 Object.assign(first,refreshed.data);first.expires_at=JSON.parse(Buffer.from(first.access_token.split('.')[1],'base64url').toString()).exp;
 const third=await login(a),pending=await requireRpc(third,'vzip_register_session',{p_label:'release computer'});
 check(pending.status==='device_limit'&&pending.sessions.length===2,'third slot confirmation');
 if(browser)await browserSmoke(a,[first,second]);
 let signed=null,legacy=null,otherSession=await login(b);
 if(withWorker){
  mark('R2 active session and revocable link');
  const key='u/'+a.id+'/release-fixture-no-object/original.wav';
  signed=await workerRequest(first,'/v1/sign',{key,ttl:60});check(signed.ok&&new URL(signed.data.url).searchParams.get('cap'),'session playback signature');
  const before=await fetch(signed.data.url,{signal:AbortSignal.timeout(20000)});check(before.status===404,'authorized missing fixture object');
  if(activate){
   const old=await workerRequest(otherSession,'/v1/sign',{key:'u/'+b.id+'/release-legacy-no-object/original.wav',ttl:60});
   check(old.ok&&!new URL(old.data.url).searchParams.get('cap'),'legacy preparation link');legacy=old.data.url;
  }
 }
 if(activate){
  mark('activate verified two-session rollout');
  await db.query('update public.vzip_session_rollout set enforced=true where singleton');activated=true;
  const noSlot=await workerRequest(otherSession,'/v1/me');check(noSlot.status===401,'unenrolled R2 access after activation');
  const old=await fetch(legacy,{signal:AbortSignal.timeout(20000)});check(old.status===403,'legacy URL refused after activation');
 }
 mark('fixture owner separation');
 check((await requireRpc(otherSession,'vzip_register_session',{p_label:'foreign fixture'})).status==='active','foreign registration');
 const payload={songs:[],lessons:[],practices:[],assignments:[],categories:[]};
 for(const [owner,session]of[[a.id,first],[b.id,otherSession]]){
  const row=await api('/rest/v1/vocal_data',{token:session.access_token,body:{user_id:owner,payload},headers:{Prefer:'resolution=merge-duplicates'}});
  check(row.ok,'fixture-only data creation');
 }
 const foreign=await api('/rest/v1/vocal_data?select=user_id&user_id=eq.'+b.id,{token:first.access_token});
 check(foreign.ok&&Array.isArray(foreign.data)&&foreign.data.length===0,'foreign data RLS');
 const cap=(await requireRpc(first,'vzip_session_context')).playback_token;
 mark('approved replacement revokes one Auth session');
 const approved=await requireRpc(third,'vzip_register_session',{p_label:'release computer',p_replace_session:sid(first),p_expected_revision:pending.revision});
 check(approved.status==='active'&&approved.sessions.length===2,'selected replacement');
 const activeSecond=await requireRpc(second,'vzip_session_is_active');check(activeSecond===true,'other login retained');
 const denied=await api('/rest/v1/vocal_data?select=user_id',{token:first.access_token});
 check(denied.ok&&Array.isArray(denied.data)&&denied.data.length===0,'revoked direct reads');
 for(const [name,body]of[
  ['vocal_billing_save',{p_expected_revision:0,p_payload:{},p_request_id:randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5')}],
  ['vzip_enqueue_my_media',{}],['vzip_song_stt_reserve',{}],['vzip_song_stt_usage',{}]
 ]){
  const r=await rpc(first,name,body);check([401,403].includes(r.status),'revoked definer RPC');
 }
 const owner=await api('/rest/v1/rpc/vzip_playback_owner',{body:{p_capability:cap}});check(owner.ok&&owner.data===null,'revoked playback capability');
 const oldRefresh=await api('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:first.refresh_token}});
 check(!oldRefresh.ok,'revoked refresh token');
 if(withWorker){
  check((await workerRequest(first,'/v1/me')).status===401,'revoked R2 JWT');
  check((await fetch(signed.data.url,{signal:AbortSignal.timeout(20000)})).status===403,'revoked signed URL');
  check((await workerRequest(second,'/v1/me')).status===200,'other R2 login retained');
 }
 mark('current and all-session logout');
 check(await requireRpc(third,'vzip_release_session')===true,'current logout');
 check(await requireRpc(second,'vzip_session_is_active')===true,'current logout retains other');
 const latest=await requireRpc(second,'vzip_list_sessions');
 const all=await requireRpc(second,'vzip_revoke_sessions',{p_session_id:null,p_all:true,p_expected_revision:latest.revision});
 check(all.status==='revoked','all logout');
 const after=await api('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:second.refresh_token}});
 check(!after.ok,'all logout refresh refusal');
 const fresh=await login(a);check((await requireRpc(fresh,'vzip_register_session',{p_label:'fresh release login'})).status==='active','fresh authentication');
 console.log('Live fixture checks passed; no original users or media modified');
}
try{
 check(['prepare','verify_worker','activate'].includes(plan.mode),'release mode');
 check(/^[0-9a-f]{40}$/.test(plan.sourceSha),'source SHA');
 const changed=execFileSync('git',['diff','--name-only',plan.sourceSha,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 check(changed.every(p=>p==='ops/device-session-release.json'),'unverified source changes');
 mark('verified source CI');
 const checkResponse=await fetch('https://api.github.com/repos/'+env.GITHUB_REPOSITORY+'/commits/'+plan.sourceSha+'/check-runs?per_page=100',{headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json'}});
 check(checkResponse.ok,'CI status access');
 const allChecks=(await checkResponse.json()).check_runs,latest=new Map();
 for(const c of allChecks)if(c.conclusion!=='cancelled'&&(!latest.has(c.name)||latest.get(c.name).id<c.id))latest.set(c.name,c);
 for(const name of ['session-db','browser','billing','database','ui','safety','worker'])check(latest.get(name)?.conclusion==='success','source check '+name);
 for(const c of latest.values())if(c.conclusion!=='cancelled')check(c.conclusion==='success','source check '+c.name);
 check(env.SUPABASE_DB_URL&&env.SUPABASE_SERVICE_ROLE_KEY,'release credentials');
 const dbUrl=new URL(env.SUPABASE_DB_URL);
 check(dbUrl.hostname.includes(PROJECT)||decodeURIComponent(dbUrl.username).endsWith('.'+PROJECT),'database project mismatch');
 db=new pg.Client({connectionString:env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await db.connect();
 await db.query("select pg_advisory_lock(hashtext('vzip_device_session_release'))");
 if(plan.mode==='prepare'){
  mark('Auth admin credential check');
  const adminCheck=await api('/auth/v1/admin/users/00000000-0000-0000-0000-000000000000',{admin:true});
  check(adminCheck.status===404,'Auth admin credential status');
  mark('Auth cascade and RPC prerequisites');
  const fk=await db.query("select count(*)::int as n from pg_constraint where contype='f' and conrelid='auth.refresh_tokens'::regclass and confrelid='auth.sessions'::regclass and confdeltype='c'");
  check(fk.rows[0].n>0,'Auth refresh token cascade');
  await db.query(readFileSync('supabase/migrations/20261112_device_session_contract.sql','utf8'));
  await db.query("notify pgrst, 'reload schema'");
  await pause(3000);
  const stage=await db.query('select enforced from public.vzip_session_rollout where singleton');check(stage.rows[0]?.enforced===false,'already activated; prepare refused');
  await exercise({browser:true});
 }else{
  await workerReady();
  if(plan.mode==='activate'){
   mark('published frontend version');
   for(const path of ['account-config.js','index.html','billing/session-guard.js','cloud-sync.js']){
    const response=await fetch('https://vocalzip.yullul.com/'+path+'?release='+plan.sourceSha,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    check(response.ok&&(await response.text()).replaceAll('\r\n','\n')===readFileSync(path,'utf8').replaceAll('\r\n','\n'),'frontend deployment '+path);
   }
  }
  await exercise({withWorker:true,activate:plan.mode==='activate'});
 }
 mark('release operation complete');
 console.log(JSON.stringify({mode:plan.mode,source:plan.sourceSha,success:true}));
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'## Two-session rollout\n\nMode: '+plan.mode+'\n\nSource: '+plan.sourceSha+'\n\nLive fixture checks passed. Original users/media unchanged.\n');
}catch(e){
 console.error('Release failed at '+step+' ('+(e.code||e.name)+')');process.exitCode=1;
 if(activated&&db){await db.query('update public.vzip_session_rollout set enforced=false where singleton').catch(()=>{});console.error('Global enforcement returned to preparation mode.');}
}finally{
 server?.kill();await cleanup();await db?.end().catch(()=>{});
}
