// Narrow deployment for reviewed permanent-delete guards. No customer IDs/data or raw errors in logs.
import pg from 'pg';
import {X509Certificate,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
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

const sqlPath='supabase/migrations/20261114_permanent_lesson_delete.sql';
const hash=text=>createHash('sha256').update(text).digest('hex');
async function verifiedSource(sha,migration){
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('INVALID_SOURCE');
 const headers={Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'};
 const root='https://api.github.com/repos/eye215/Vocalzip';
 const r=await fetch(root+'/actions/runs?head_sha='+sha+'&per_page=100',{headers,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('SOURCE_CHECK_UNAVAILABLE');
 const runs=(await r.json()).workflow_runs;
 for(const name of ['Selective lesson deletion safety','Permanent deletion database contract']){
  const relevant=runs.filter(r=>r.name===name&&r.conclusion!=='cancelled');
  if(!relevant.some(r=>r.status==='completed'&&r.conclusion==='success')||relevant.some(r=>r.conclusion==='failure'))throw Error('SOURCE_NOT_VERIFIED');
 }
 const source=await fetch(root+'/contents/'+sqlPath+'?ref='+sha,{headers,signal:AbortSignal.timeout(15000)});
 if(!source.ok)throw Error('SOURCE_CONTENT_UNAVAILABLE');
 const file=await source.json(),body=Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8');
 if(hash(body)!==hash(migration))throw Error('SOURCE_SQL_MISMATCH');
}
async function checks(db){
 const base=(await db.query("select to_regprocedure('public.vzip_assert_session()') is not null session_guard,to_regprocedure('public.vzip_session_read_allowed()') is not null read_guard,to_regclass('public.vocal_history') is not null history")).rows[0];
 if(Object.values(base).some(v=>!v))throw Error('PREREQUISITE_MISSING');
 const tables=(await db.query("select relname,relrowsecurity from pg_class where oid=any($1::regclass[])",[['public.vocal_data','public.vocal_media','public.vocal_billing_documents','public.vocal_history']])).rows;
 if(tables.length!==4||tables.some(r=>!r.relrowsecurity))throw Error('SCHEMA_MISMATCH');
}
async function counts(db){
 const out={};for(const table of ['vocal_data','vocal_media','vocal_billing_documents','vocal_history'])out[table]=(await db.query('select count(*) n from public.'+table)).rows[0].n;
 return out;
}
async function installed(db){
 const r=(await db.query(`select
  (select relrowsecurity from pg_class where oid='public.vzip_permanent_delete_guards'::regclass) private_rls,
  has_table_privilege('authenticated','public.vzip_permanent_delete_guards','select') exposed,
  has_function_privilege('anon','public.vzip_delete_lesson(text,text,timestamptz,text)','execute') anon_rpc,
  has_function_privilege('authenticated','public.vzip_delete_lesson(text,text,timestamptz,text)','execute') user_rpc,
  (select count(*) from pg_trigger where not tgisinternal and tgname in ('vzip_permanent_delete_guard','vzip_redact_lesson_history')) triggers,
  (select count(*) from pg_policy where polrelid='public.vocal_history'::regclass and polname='vzip_history_no_deleted_lessons' and not polpermissive) history_policy`)).rows[0];
 if(!r.private_rls||r.exposed||r.anon_rpc||!r.user_rpc||r.triggers!=='3'||r.history_policy!=='1')throw Error('INSTALLED_GUARD_MISMATCH');
}
let db;
try{
 const plan=JSON.parse(readFileSync('ops/permanent-delete-release.json','utf8'));
 if(!['preflight','apply','verify'].includes(plan.mode))throw Error('INVALID_MODE');
 const migration=readFileSync(sqlPath,'utf8');
 if(plan.mode==='apply')await verifiedSource(plan.sourceSha,migration);
 db=await connectProduction();await db.query(plan.mode==='apply'?'begin':'begin read only');
 await db.query("set local lock_timeout='5s'");await db.query("set local statement_timeout='25s'");await checks(db);
 if(plan.mode==='apply'){
  // Short metadata lock prevents racing row-count checks. No record rewrite/backfill is executed.
  await db.query('lock table public.vocal_data,public.vocal_media,public.vocal_billing_documents,public.vocal_history in share row exclusive mode');
  const before=await counts(db);await db.query(migration);await installed(db);const after=await counts(db);
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('RECORD_COUNTS_CHANGED');
  await db.query('commit');
  console.log(JSON.stringify({schema_applied:true,rls_and_rpc_privileges_verified:true,customer_record_counts_unchanged:true,record_backfill:false,media_operations:false}));
 }else if(plan.mode==='verify'){
  await installed(db);await db.query('rollback');
  console.log(JSON.stringify({installed_contract_verified:true,operating_writes:false}));
 }else{
  const present=(await db.query("select to_regclass('public.vzip_permanent_delete_guards') is not null installed")).rows[0].installed;
  await db.query('rollback');console.log(JSON.stringify({prerequisites_verified:true,installed:present,operating_writes:false,sql_sha256:hash(migration)}));
 }
}catch(e){
 const known=['INVALID_SOURCE','SOURCE_CHECK_UNAVAILABLE','SOURCE_NOT_VERIFIED','SOURCE_CONTENT_UNAVAILABLE','SOURCE_SQL_MISMATCH','PREREQUISITE_MISSING','SCHEMA_MISMATCH','INSTALLED_GUARD_MISMATCH','RECORD_COUNTS_CHANGED','INVALID_MODE','MISSING_CONNECTION','WRONG_PROJECT','CA_UNAVAILABLE','INVALID_CA'];
 console.error('PERMANENT_DELETE_RELEASE_STOPPED '+(known.includes(e.message)?e.message:/^[0-9A-Z]{5}$/.test(e.code||'')?e.code:'CONNECTION_OR_CHECK'));process.exitCode=1;
}finally{if(db){await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}}
