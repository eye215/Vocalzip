// Deployment preflight: catalog reads only. Never print credentials or user data.
import pg from 'pg';
const output=(name,value)=>console.log(JSON.stringify({name,value}));
output('database_credential_configured',!!process.env.SUPABASE_DB_URL);
output('auth_admin_credential_configured',!!process.env.SUPABASE_SERVICE_ROLE_KEY);
if(!process.env.SUPABASE_DB_URL)process.exit(1);
const db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});
try{
 await db.connect();await db.query('begin read only');
 const tables=await db.query("select table_name from information_schema.tables where table_schema='public' order by table_name");
 output('public_tables',tables.rows.map(x=>x.table_name));
 const columns=await db.query("select column_name,data_type from information_schema.columns where table_schema='auth' and table_name in ('sessions','refresh_tokens') order by table_name,ordinal_position");
 output('auth_session_columns',columns.rows);
 const funcs=await db.query("select p.proname,pg_get_function_identity_arguments(p.oid) as args,p.prosecdef,has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef order by p.proname");
 output('definer_rpc_contracts',funcs.rows);
 const policies=await db.query("select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname");
 output('policy_metadata',policies.rows);
 await db.query('rollback');
}catch(e){console.error('Read-only preflight failed: '+(e.code||e.name));process.exitCode=1;}
finally{await db.end().catch(()=>{});}
