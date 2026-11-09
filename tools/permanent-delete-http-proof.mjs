// Synthetic operating HTTP proof only. No media or customer records; no secrets/identities in logs.
import {randomUUID,randomBytes,X509Certificate} from 'node:crypto';
import pg from 'pg';
import {isDeepStrictEqual} from 'node:util';
import C from '../billing/core.js';
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

const base='https://chxnbtiyuyhiywzeshis.supabase.co',service=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!service)throw Error('MISSING_SERVICE_CONNECTION');
let uid='',email='',db,cleaned=false;
async function api(path,{token=service,body,method=body?'POST':'GET'}={}){
 const response=await fetch(base+path,{method,headers:{apikey:service,Authorization:'Bearer '+token,'X-Client-Info':'vocalzip-device-session-v2',...(body?{'Content-Type':'application/json'}:{}),Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch{}
 return {status:response.status,data};
}
const check=(value,code)=>{if(!value)throw Error(code)};
try{
 email='vzip-delete-ci-'+randomUUID()+'@example.invalid';const password=randomBytes(32).toString('base64url');
 const created=await api('/auth/v1/admin/users',{body:{email,password,email_confirm:true,user_metadata:{purpose:'automated deletion safety fixture'}}});
 uid=created.data?.id||'';check(created.status<300&&/^[a-f0-9-]{36}$/.test(uid),'FIXTURE_CREATE_FAILED');
 const login=await api('/auth/v1/token?grant_type=password',{body:{email,password}});
 const token=login.data?.access_token;check(login.status===200&&token,'FIXTURE_LOGIN_FAILED');
 const registered=await api('/rest/v1/rpc/vzip_register_session',{token,body:{p_label:'Synthetic deletion verification'}});
 check(registered.status===200&&registered.data?.status==='active','FIXTURE_SESSION_FAILED');
 const capabilities=await api('/rest/v1/rpc/vzip_lesson_delete_capabilities',{token,body:{}});
 check(capabilities.status===200&&capabilities.data?.version===1,'CAPABILITY_FAILED');
 const lessonId='fixture-'+randomUUID(),op=randomUUID(),secretText='synthetic-private-'+randomUUID();
 const original={categories:[],songs:[{id:'keep-song',title:'synthetic'}],lessons:[{id:lessonId,date:'2026-11-09',feedback:secretText}],assignments:[{id:'keep-task',lessonIds:[lessonId],lessonId,title:'synthetic homework'}],practices:[{id:'keep-practice',manualMinutes:12,minutes:12}]};
 check((await api('/rest/v1/vocal_data',{token,body:{user_id:uid,payload:original,updated_at:new Date().toISOString()}})).status<300,'FIXTURE_APP_SAVE_FAILED');
 let row=(await api('/rest/v1/vocal_data?select=payload,updated_at&user_id=eq.'+uid,{token})).data?.[0];
 check(row?.payload?.lessons?.length===1,'FIXTURE_APP_READ_FAILED');
 const result=await api('/rest/v1/rpc/vzip_delete_lesson',{token,body:{p_lesson_id:lessonId,p_operation_id:op,p_expected_updated_at:row.updated_at,p_billing_link:''}});
 check(result.status===200&&result.data?.ok,'PERMANENT_DELETE_FAILED');
 row=(await api('/rest/v1/vocal_data?select=payload,updated_at&user_id=eq.'+uid,{token})).data?.[0];
 check(row.payload.lessons.length===0&&row.payload.practices[0].minutes===12&&row.payload.assignments[0].title==='synthetic homework','PRESERVATION_FAILED');
 const history=await api('/rest/v1/vocal_history?select=data&source=eq.vocal_data&user_id=eq.'+uid,{token});
 check(history.status===200&&!JSON.stringify(history.data).includes(secretText),'HISTORY_TEXT_EXPOSED');
 check((await api('/rest/v1/vocal_data?user_id=eq.'+uid,{token,method:'PATCH',body:{payload:original,updated_at:new Date().toISOString()}})).status<300,'LEGACY_WRITE_FAILED');
 row=(await api('/rest/v1/vocal_data?select=payload&user_id=eq.'+uid,{token})).data?.[0];
 check(row.payload.lessons.length===0&&row.payload.deleted.lessons.includes(lessonId),'LEGACY_RESURRECTION');
 let state=C.empty('user:'+uid);const run=(type,payload)=>state=C.reduce(state,{type,payload});
 run('pass.save',{name:'synthetic pass',amount:300000,totalUnits:1000});const passId=state.passes[0].id;
 run('payment.save',{passId,date:'2026-11-09',kind:'payment',amount:300000});
 run('payment.save',{passId,date:'2026-11-09',kind:'refund',amount:10000});
 run('deduction.save',{passId,date:'2026-11-09',lessonId:'synthetic-billing-lesson',status:'completed',units:100});
 const prior=structuredClone(state),charge=state.deductions[0];
 const first=await api('/rest/v1/rpc/vocal_billing_save',{token,body:{p_expected_revision:0,p_payload:state,p_request_id:randomUUID()}});
 check(first.status===200,'FIXTURE_BILLING_SAVE_FAILED');
 run('deduction.cancelForDeletion',{id:charge.id,expectedVersion:charge.version,lessonId:'synthetic-billing-lesson',operationId:randomUUID()});
 const cancelled=await api('/rest/v1/rpc/vocal_billing_save',{token,body:{p_expected_revision:first.data.revision,p_payload:state,p_request_id:randomUUID()}});
 check(cancelled.status===200,'FIXTURE_CANCELLATION_SAVE_FAILED');
 const restore=await api('/rest/v1/rpc/vocal_billing_save',{token,body:{p_expected_revision:cancelled.data.revision,p_payload:prior,p_request_id:randomUUID()}});
 check(restore.status>=400&&restore.data?.code==='23514','SERVER_RESTORE_ALLOWED');
 const kept=(await api('/rest/v1/vocal_billing_documents?select=payload&user_id=eq.'+uid,{token})).data?.[0]?.payload;
 check(isDeepStrictEqual(kept.payments,prior.payments)&&kept.deductions[0].voidedAt,'PAYMENT_FACTS_CHANGED');
 check((await api('/rest/v1/rpc/vzip_release_session',{token,body:{}})).status===200,'FIXTURE_REVOKE_FAILED');
 check((await api('/rest/v1/rpc/vzip_lesson_delete_capabilities',{token,body:{}})).status===403,'REVOKED_SESSION_ALLOWED');
 console.log(JSON.stringify({synthetic_http_proof:true,registered_session:true,permanent_lesson_delete:true,history_text_redacted:true,legacy_resurrection_blocked:true,server_charge_restore_blocked:true,payment_refund_preserved:true,revoked_session_denied:true,customer_data_used:false,media_operations:false}));
}catch(e){console.error('PERMANENT_DELETE_HTTP_PROOF_STOPPED '+(/^[A-Z_]+$/.test(e.message)?e.message:'REQUEST_OR_CHECK'));process.exitCode=1;}
finally{
 if(uid){
  try{
   db=await connectProduction();await db.query('begin');
   const fixture=(await db.query('select count(*) n from auth.users where id=$1 and email=$2',[uid,email])).rows[0].n;
   check(fixture==='1'&&email.startsWith('vzip-delete-ci-')&&email.endsWith('@example.invalid'),'FIXTURE_CLEANUP_IDENTITY');
   for(const table of ['vocal_data','vocal_media','vocal_billing_documents','vocal_history','vzip_permanent_delete_guards'])await db.query('delete from public.'+table+' where user_id=$1',[uid]);
   await db.query('commit');
   const removed=await api('/auth/v1/admin/users/'+uid,{method:'DELETE'});
   check(removed.status<300,'FIXTURE_AUTH_CLEANUP');
   cleaned=true;console.log(JSON.stringify({synthetic_fixture_cleaned:true}));
  }catch{console.error('PERMANENT_DELETE_FIXTURE_CLEANUP_FAILED');process.exitCode=1;}
  finally{if(db){await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}}
 }
}
