// Owner-only paid AI rollout. CLI never prints identity, token, SQL text or raw errors.
import pg from 'pg';
import {X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const normalize=value=>String(value).replace(/\s+/g,'').toLowerCase();
const oldBody="begin if not public.vzip_server_session_allowed() then raise exception 'current login session is not active' using errcode='42501'; end if; return public.vzip_song_stt_reserve_session_impl(); end";
export async function ownerPolicyRelease(db,{selector,apply=false,migration}){
 if(!/^[a-f0-9]{64}$/.test(selector))throw Error('INVALID_SELECTOR');
 const expected=migration.match(/create or replace function public\.vzip_song_stt_reserve\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/)?.[1];
 if(!expected)throw Error('INVALID_MIGRATION');
 let committed=false;
 await db.query(apply?'begin':'begin read only');
 try{
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='20s'");
  if(apply)await db.query("select pg_advisory_xact_lock(hashtext('vzip-ai-owner-rollout'))");
  const matches=(await db.query("select id from auth.users where encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex')=$1",[selector])).rows;
  if(matches.length!==1)throw Error('OWNER_MATCH_NOT_UNIQUE');
  const owner=matches[0].id;
  const row=(await db.query("select p.prosrc,p.prosecdef,p.proconfig from pg_proc p where p.oid=to_regprocedure('public.vzip_song_stt_reserve()')")).rows[0];
  if(!row?.prosecdef||![normalize(oldBody),normalize(expected)].includes(normalize(row.prosrc)))throw Error('RESERVATION_CONTRACT_CHANGED');
  const prerequisites=(await db.query("select to_regprocedure('public.vzip_server_session_allowed()') is not null session_guard,to_regprocedure('public.vzip_song_stt_reserve_session_impl()') is not null implementation,has_function_privilege('authenticated','public.vzip_song_stt_reserve_session_impl()','EXECUTE') implementation_exposed")).rows[0];
  if(!prerequisites.session_guard||!prerequisites.implementation||prerequisites.implementation_exposed)throw Error('PREREQUISITES_CHANGED');
  const active=(await db.query("select count(*)::integer n from public.vzip_device_sessions d join auth.sessions a on a.id=d.session_id and a.user_id=d.user_id where d.user_id=$1 and d.revoked_at is null and (a.not_after is null or a.not_after>now())",[owner])).rows[0].n;
  if(apply){
   await db.query('lock table public.vzip_song_stt_quota in share mode');
   const snapshot=()=>db.query('select count(*)::text rows,coalesce(sum(used_total),0)::text total,coalesce(sum(used_today),0)::text today from public.vzip_song_stt_quota').then(r=>r.rows[0]);
   const before=await snapshot();
   const body=migration.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
   await db.query(body);
   const changed=await db.query('update public.vzip_ai_owner_policy set owner_user_id=$1,enabled=true,updated_at=now() where singleton returning enabled,owner_user_id=$1 matches',[owner]);
   if(changed.rowCount!==1||!changed.rows[0].enabled||!changed.rows[0].matches)throw Error('OWNER_POLICY_NOT_SET');
   if(JSON.stringify(await snapshot())!==JSON.stringify(before))throw Error('USAGE_CHANGED');
   const grants=(await db.query("select has_table_privilege('authenticated','public.vzip_ai_owner_policy','SELECT') or has_table_privilege('authenticated','public.vzip_ai_owner_policy','UPDATE') policy_exposed,has_function_privilege('authenticated','public.vzip_song_stt_reserve_session_impl()','EXECUTE') implementation_exposed,has_function_privilege('anon','public.vzip_ai_owner_allowed()','EXECUTE') anonymous_exposed")).rows[0];
   if(Object.values(grants).some(Boolean))throw Error('OWNER_POLICY_EXPOSED');
  }
  await db.query(apply?'commit':'rollback');committed=apply;
  return {matched_accounts:1,reservation_contract_verified:true,owner_registered_sessions:active,applied:apply,usage_preserved:true};
 }catch(error){if(!committed)await db.query('rollback');throw error;}
}
export async function verifyOwnerPolicy(db,{selector}){
 await db.query('begin read only');
 try{
  const owners=(await db.query("select id from auth.users where encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex')=$1",[selector])).rows;
  if(owners.length!==1)throw Error('OWNER_MATCH_NOT_UNIQUE');
  const owner=owners[0].id;
  const policy=(await db.query('select count(*)::integer n,bool_and(enabled and owner_user_id=$1) matches from public.vzip_ai_owner_policy',[owner])).rows[0];
  if(policy.n!==1||policy.matches!==true)throw Error('OWNER_POLICY_NOT_SET');
  const sessions=(await db.query("select d.user_id,d.session_id from public.vzip_device_sessions d join auth.sessions a on a.id=d.session_id and a.user_id=d.user_id where d.revoked_at is null and (a.not_after is null or a.not_after>now())")).rows;
  const own=sessions.find(x=>x.user_id===owner),other=sessions.find(x=>x.user_id!==owner);
  await db.query('set local role authenticated');
  const identity=async row=>db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[row.user_id,JSON.stringify({sub:row.user_id,session_id:row.session_id})]);
  let ownerAllowed=null,otherDenied=null;
  if(own){await identity(own);ownerAllowed=(await db.query('select public.vzip_ai_owner_allowed() allowed')).rows[0].allowed;if(ownerAllowed!==true)throw Error('OWNER_RUNTIME_DENIED');}
  if(other){
   await identity(other);
   const r=(await db.query('select public.vzip_ai_owner_allowed() allowed,public.vzip_song_stt_reserve() reserved')).rows[0];
   otherDenied=r.allowed===false&&r.reserved===false;if(!otherDenied)throw Error('NON_OWNER_RUNTIME_ALLOWED');
  }
  await db.query('rollback');
  return {policy_single_owner:true,owner_runtime_allowed:ownerAllowed,registered_non_owner_checked:!!other,non_owner_rpc_denied:otherDenied};
 }catch(error){await db.query('rollback');throw error;}
}
async function connectProduction(){
 const raw=process.env.SUPABASE_DB_URL;if(!raw)throw Error('MISSING_CONNECTION');
 const parsed=new URL(raw);
 if(parsed.hostname!=='db.chxnbtiyuyhiywzeshis.supabase.co'&&!decodeURIComponent(parsed.username).endsWith('.chxnbtiyuyhiywzeshis'))throw Error('WRONG_PROJECT');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','sslpassword'])parsed.searchParams.delete(key);
 let ca=process.env.SUPABASE_DB_CA_CERT;
 if(!ca){
  const r=await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('CA_UNAVAILABLE');const bytes=await r.arrayBuffer();if(bytes.byteLength>65536)throw Error('INVALID_CA');ca=Buffer.from(bytes).toString('utf8');
 }
 const certificate=new X509Certificate(ca);
 if(!certificate.ca||Date.parse(certificate.validFrom)>Date.now()||Date.parse(certificate.validTo)<=Date.now())throw Error('INVALID_CA');
 const db=new pg.Client({connectionString:parsed.toString(),ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:10000});
 await db.connect();return db;
}
async function verifiedSource(sha){
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('INVALID_SOURCE');
 const r=await fetch('https://api.github.com/repos/eye215/Vocalzip/actions/runs?head_sha='+sha+'&per_page=30',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('SOURCE_CHECK_UNAVAILABLE');
 const d=await r.json(),runs=d.workflow_runs.filter(x=>x.name==='Paid AI owner-only safety'&&x.conclusion!=='cancelled');
 if(!runs.length||runs.some(x=>x.status!=='completed'||x.conclusion!=='success'))throw Error('SOURCE_NOT_VERIFIED');
}
async function main(){
 let db;
 try{
  const plan=JSON.parse(readFileSync('ops/ai-owner-only-release.json','utf8'));
  if(!['preflight','apply','verify'].includes(plan.mode))throw Error('INVALID_MODE');
  if(plan.mode==='apply')await verifiedSource(plan.sourceSha);
  db=await connectProduction();
  const options={selector:plan.ownerEmailSha256,migration:readFileSync('supabase/migrations/20261113_ai_owner_only.sql','utf8'),apply:plan.mode==='apply'};
  if(plan.mode==='verify')console.log(JSON.stringify(await verifyOwnerPolicy(db,options)));
  else{
   console.log(JSON.stringify(await ownerPolicyRelease(db,options)));
   if(options.apply)console.log(JSON.stringify(await verifyOwnerPolicy(db,options)));
  }
  const response=await fetch('https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vzip-song-stt',{signal:AbortSignal.timeout(15000)});
  console.log(JSON.stringify({anonymous_edge_status:response.status,edge_deployed_by_this_run:false}));
 }catch(error){
  const safe=new Set(['INVALID_SELECTOR','INVALID_MIGRATION','OWNER_MATCH_NOT_UNIQUE','RESERVATION_CONTRACT_CHANGED','PREREQUISITES_CHANGED','OWNER_POLICY_NOT_SET','USAGE_CHANGED','OWNER_POLICY_EXPOSED','OWNER_RUNTIME_DENIED','NON_OWNER_RUNTIME_ALLOWED','MISSING_CONNECTION','WRONG_PROJECT','CA_UNAVAILABLE','INVALID_CA','INVALID_SOURCE','SOURCE_CHECK_UNAVAILABLE','SOURCE_NOT_VERIFIED','INVALID_MODE']);
  console.error('AI_OWNER_RELEASE_STOPPED '+(safe.has(error.message)?error.message:/^[0-9A-Z]{5}$/.test(error.code||'')?error.code:'CONNECTION_OR_CHECK'));
  process.exitCode=1;
 }finally{if(db){try{await db.query('rollback');}catch{}await db.end().catch(()=>{});}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
