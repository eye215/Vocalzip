// Read-only production catalog preflight. Never reads payloads, user IDs or media.
// Uses the same configured DB secret as the existing Ops audit; prints metadata only.
import pg from 'pg';
const url=process.env.SUPABASE_DB_URL;
if(!url)throw Error('DB connection secret is not configured');
const db=new pg.Client({connectionString:url,ssl:process.env.SUPABASE_DB_SSL==='off'?false:{rejectUnauthorized:false}});
try{
 await db.connect();
 await db.query('begin transaction read only');
 await db.query("set local statement_timeout='10s'");
 const columns=(await db.query("select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name in ('vocal_data','vocal_history','vzip_data_write_requests') order by table_name,ordinal_position")).rows;
 const constraints=(await db.query("select c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c where c.conrelid='public.vocal_data'::regclass order by c.conname")).rows;
 const triggers=(await db.query("select tgname from pg_trigger where tgrelid='public.vocal_data'::regclass and not tgisinternal order by tgname")).rows;
 const functions=(await db.query("select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vzip_assert_session','vzip_session_is_active','vzip_request_session','vzip_session_read_allowed','vzip_save_snapshot') order by p.proname")).rows;
 const rollout=(await db.query('select enforced from public.vzip_session_rollout where singleton=true')).rows;
 const cap=(await db.query('select coalesce(bool_and(max_sessions=2),true) all_accounts_configured_for_two from public.vzip_account_session_state')).rows;
 console.log(JSON.stringify({readOnly:true,columns,constraints,triggers,functions,rollout,cap},null,2));
}catch(e){console.error('Catalog preflight failed:',e.code||e.name);process.exitCode=1;}
finally{await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
