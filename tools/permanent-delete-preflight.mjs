// Read-only operating schema check. Never prints connection values, user IDs, records, SQL or raw errors.
import pg from 'pg';
import {X509Certificate} from 'node:crypto';
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

let db;
try{
 db=await connectProduction();await db.query('begin read only');
 await db.query("set local statement_timeout='15s'");
 const names=['vocal_data','vocal_media','vocal_billing_documents','vocal_history'];
 const tables=(await db.query("select relname,relrowsecurity from pg_class where oid=any($1::regclass[])",[names.map(n=>'public.'+n)])).rows;
 if(tables.length!==4||tables.some(t=>!t.relrowsecurity))throw Error('SCHEMA_MISMATCH');
 const required=(await db.query("select to_regprocedure('public.vzip_assert_session()') is not null session_assert,to_regprocedure('public.vzip_session_read_allowed()') is not null session_read,to_regprocedure('public.vocal_billing_save(bigint,jsonb,uuid)') is not null billing_cas")).rows[0];
 if(Object.values(required).some(v=>!v))throw Error('PREREQUISITE_MISSING');
 const types=(await db.query("select table_name,column_name,udt_name from information_schema.columns where table_schema='public' and (table_name,column_name) in (('vocal_data','user_id'),('vocal_data','payload'),('vocal_data','updated_at'),('vocal_history','data'),('vocal_history','source'),('vocal_billing_documents','payload'))")).rows;
 if(types.length!==6||types.some(r=>!({user_id:'uuid',payload:'jsonb',updated_at:'timestamptz',data:'jsonb',source:'text'}[r.column_name]===r.udt_name)))throw Error('COLUMN_MISMATCH');
 const installed=(await db.query("select to_regclass('public.vzip_permanent_delete_guards') is not null guards,to_regprocedure('public.vzip_delete_lesson(text,text,timestamptz,text)') is not null rpc")).rows[0];
 console.log(JSON.stringify({operating_schema_verified:true,rls_tables:tables.length,active_session_and_billing_contracts:true,delete_guard_installed:installed.guards,delete_rpc_installed:installed.rpc,user_records_read:false,operating_writes:false}));
 await db.query('rollback');
}catch(e){
 console.error('DELETE_PREFLIGHT_STOPPED '+(['SCHEMA_MISMATCH','PREREQUISITE_MISSING','COLUMN_MISMATCH','MISSING_CONNECTION','WRONG_PROJECT','CA_UNAVAILABLE','INVALID_CA'].includes(e.message)?e.message:/^[0-9A-Z]{5}$/.test(e.code||'')?e.code:'CONNECTION_OR_CHECK'));
 process.exitCode=1;
}finally{if(db){await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}}
