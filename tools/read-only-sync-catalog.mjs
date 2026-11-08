// Catalog only. Never emits credentials, user rows, SQL definitions or raw errors.
import pg from 'pg';
import { X509Certificate } from 'node:crypto';
const raw=process.env.SUPABASE_DB_URL;
let db;
try {
 if(!raw)throw Error('missing configuration');
 const parsed=new URL(raw);
 if(parsed.hostname!=='db.chxnbtiyuyhiywzeshis.supabase.co'&&!decodeURIComponent(parsed.username).endsWith('.chxnbtiyuyhiywzeshis'))throw Error('unexpected project');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','sslpassword'])parsed.searchParams.delete(key);
 // Fixed official Studio certificate source: supabase/supabase
 // apps/studio/hooks/custom-content/custom-content.json, ssl:certificate_url (env=prod).
 // HTTPS and PostgreSQL chain + hostname verification stay enabled.
 let ca=process.env.SUPABASE_DB_CA_CERT;
 if(!ca){
  const response=await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',{
   redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('official certificate unavailable');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>65536)throw Error('invalid official certificate');
  ca=Buffer.from(bytes).toString('utf8');
 }
 const certificate=new X509Certificate(ca);
 if(!certificate.ca||Date.parse(certificate.validFrom)>Date.now()||Date.parse(certificate.validTo)<=Date.now())throw Error('invalid official certificate');
 db=new pg.Client({connectionString:parsed.toString(),ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:10000});
 await db.connect();await db.query('begin read only');
 await db.query("set local statement_timeout='5s'");
 if((await db.query("select current_setting('transaction_read_only') v")).rows[0].v!=='on')throw Error('read only required');
 const columns=(await db.query("select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='vocal_data'")).rows;
 const has=(name,type,nullable)=>columns.some(x=>x.column_name===name&&x.data_type===type&&x.is_nullable===nullable);
 const baseOk=has('user_id','uuid','NO')&&has('payload','jsonb','NO')&&has('updated_at','timestamp with time zone','NO');
 const rls=(await db.query("select relrowsecurity from pg_class where oid=to_regclass('public.vocal_data')")).rows[0]?.relrowsecurity===true;
 const constraints=(await db.query("select contype,confdeltype,confrelid=to_regclass('auth.users') as user_fk from pg_constraint where conrelid=to_regclass('public.vocal_data')")).rows;
 const pk=constraints.some(x=>x.contype==='p'),cascade=constraints.some(x=>x.contype==='f'&&x.user_fk&&x.confdeltype==='c');
 const functions=(await db.query("select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vzip_assert_session','vzip_session_is_active','vzip_request_session','vzip_session_read_allowed')")).rows;
 const helpers=['vzip_assert_session','vzip_session_is_active','vzip_request_session','vzip_session_read_allowed'].every(name=>functions.some(x=>x.proname===name&&x.prosecdef));
 const history=(await db.query("select exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=to_regclass('public.vocal_data') and not t.tgisinternal and (t.tgname ilike '%history%' or p.proname ilike '%history%')) ok")).rows[0].ok;
 const installed=(await db.query("select to_regprocedure('public.vzip_save_snapshot(bigint,jsonb,uuid,uuid)') is not null snapshot_rpc,to_regprocedure('public.vzip_field_draft(text,text,text,uuid,uuid,bigint,bigint,text,uuid,uuid,boolean,bigint,uuid)') is not null draft_rpc")).rows[0];
 console.log(JSON.stringify({read_only:true,base_columns:baseOk,rls,primary_key:pk,account_delete_cascade:cascade,session_helpers:helpers,history_trigger:history,
  revision_column:columns.some(x=>x.column_name==='revision'),generation_column:columns.some(x=>x.column_name==='generation'),...installed}));
 if(!baseOk||!rls||!pk||!cascade||!helpers||!history)throw Error('catalog differs');
 await db.query('rollback');
 console.log('READ_ONLY_SYNC_CATALOG_VERIFIED');
 } catch(error) {
 const allowed=new Set(['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','ECONNREFUSED','ENETUNREACH','ETIMEDOUT','ENOTFOUND','28P01','42501','42703','42P01']);
 const code=allowed.has(error?.code)?error.code:({'missing configuration':'MISSING_CONFIGURATION','unexpected project':'WRONG_PROJECT','read only required':'READ_ONLY_REQUIRED','catalog differs':'CATALOG_DIFFERENCE'}[error?.message]||'CONNECTION_OR_CATALOG');
 console.error('READ_ONLY_SYNC_CATALOG_NOT_VERIFIED '+code);
 process.exitCode=1;
} finally {
 if(db){try{await db.query('rollback');}catch{}try{await db.end();}catch{}}
}
