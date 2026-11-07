// Disposable PostgreSQL only. No production URLs or credentials.
import {test, before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
const DB_URL=process.env.VZ_SESSION_TEST_DB;
const skip=!DB_URL;
const U='11111111-1111-4111-8111-111111111111', V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D='dddddddd-dddd-4ddd-8ddd-dddddddddddd', E='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', F='ffffffff-ffff-4fff-8fff-ffffffffffff';
let admin,db,name;
const migration=readFileSync(new URL('../supabase/migrations/20261112_device_session_contract.sql',import.meta.url),'utf8');
async function as(user,session,fn,connection=db) {
 await connection.query('begin');
 try {
  await connection.query('set local role authenticated');
  await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,session_id:session})]);
  await connection.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-client-info':'vocalzip-device-session-v2'})]);
  const result=await fn(connection); await connection.query('commit'); return result;
 } catch(e){await connection.query('rollback');throw e;}
}
const register=(u,s,replace=null,revision=null,c=db)=>as(u,s,async q=>(await q.query('select public.vzip_register_session($1,$2,$3) as r',['test login',replace,revision])).rows[0].r,c);
const listing=(u,s)=>as(u,s,async q=>(await q.query('select public.vzip_list_sessions() as r')).rows[0].r);
const revoke=(u,s,id=null,all=false,revision=null,c=db)=>as(u,s,async q=>(await q.query('select public.vzip_revoke_sessions($1,$2,$3) as r',[id,all,revision])).rows[0].r,c);
const active=(u,s)=>as(u,s,async q=>(await q.query('select public.vzip_session_is_active() as r')).rows[0].r);
before(async()=>{
 if(skip)return;
 admin=new pg.Client({connectionString:DB_URL});await admin.connect();
 name='vzip_sessions_'+Date.now();await admin.query('create database '+name);
 db=new pg.Client({connectionString:DB_URL.replace(/\/[^/]*$/,'/'+name)});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
 await db.query(`create schema auth; create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated;
 insert into auth.users values ('${U}'),('${V}');
 insert into auth.sessions values ('${A}','${U}'),('${B}','${U}'),('${C}','${U}');
 create table public.vocal_data(user_id uuid primary key,payload jsonb);
 alter table public.vocal_data enable row level security;
 grant select,insert,update,delete on public.vocal_data to authenticated;
 create policy owner on public.vocal_data for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 insert into public.vocal_data values ('${U}','{"songs":["keep"]}'),('${V}','{"songs":["private"]}');
 create schema storage; grant usage on schema storage to authenticated;
 create table storage.objects(id text primary key,bucket_id text,owner_id uuid);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 create policy owner on storage.objects for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 insert into storage.objects values ('audio','vocal-recordings','${U}'),('other','other-bucket','${U}');
 `);
 for(const table of ['vocal_media','vocal_history','vocal_song_texts','vocal_analysis_jobs','vocal_billing_documents','vzip_song_stt_quota','vzip_worker_wake']) {
  await db.query(`create table public.${table}(id text primary key,user_id uuid,payload jsonb);
   alter table public.${table} enable row level security;
   grant select,insert,update,delete on public.${table} to authenticated;
   create policy owner on public.${table} for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());`);
  await db.query(`insert into public.${table} values ('test',$1,'{"keep":true}')`,[U]);
 }
 await db.query(migration);await db.query(migration);
});
after(async()=>{if(skip)return;await db?.end();if(admin){if(name)await admin.query('drop database if exists '+name);await admin.end();}});


beforeEach(async()=>{
 if(skip)return;
 await db.query('truncate public.vzip_device_sessions,public.vzip_account_session_state');
 await db.query('delete from auth.sessions');
 for(const session of [A,B,C,D,E])await db.query('insert into auth.sessions values ($1,$2)',[session,U]);
 await db.query('insert into auth.sessions values ($1,$2)',[F,V]);
});
const slots=async()=>{for(const s of [A,B,C])assert.equal((await register(U,s)).status,'active');return listing(U,A);};

test('three independent logins coexist; retries do not consume another slot',{skip},async()=>{
 const state=await slots();assert.equal(state.limit,3);assert.equal(state.sessions.length,3);
 for(const s of [A,B,C]){
  assert.equal(await active(U,s),true);
  assert.equal((await as(U,s,q=>q.query('select * from public.vocal_data'))).rows[0].payload.songs[0],'keep');
 }
 assert.equal((await register(U,A)).revision,state.revision);
});
test('fourth login requires explicit selection; cancellation never revokes existing sessions',{skip},async()=>{
 const state=await slots(),pending=await register(U,D);
 assert.equal(pending.status,'device_limit');assert.equal(pending.revision,state.revision);
 assert.equal(pending.sessions.length,3);assert.equal(await active(U,D),false);
 for(const s of [A,B,C])assert.equal(await active(U,s),true);
 await assert.rejects(listing(U,D),/active session required/);
});
test('confirmed replacement revokes only the selected JWT; all table and Storage guards reject it',{skip},async()=>{
 const state=await slots();assert.equal((await register(U,D,B,state.revision)).status,'active');
 for(const s of [A,C,D])assert.equal(await active(U,s),true);
 assert.equal(await active(U,B),false);
 assert.equal((await register(U,B)).status,'revoked');
 assert.equal((await as(U,B,q=>q.query('select * from public.vocal_data'))).rowCount,0);
 assert.equal((await as(U,B,q=>q.query("update public.vocal_data set payload='{}' returning *"))).rowCount,0);
 assert.equal((await as(U,B,q=>q.query('delete from public.vocal_data returning *'))).rowCount,0);
 await assert.rejects(as(U,B,q=>q.query("insert into public.vocal_data values ($1,'{}')",[U])),/row-level security/);
 for(const table of ['vocal_media','vocal_history','vocal_song_texts','vocal_analysis_jobs','vocal_billing_documents','vzip_song_stt_quota','vzip_worker_wake']){
  assert.equal((await as(U,B,q=>q.query('select * from public.'+table))).rowCount,0);
  assert.equal((await as(U,B,q=>q.query("update public."+table+" set payload='{}' returning *"))).rowCount,0);
  assert.equal((await as(U,B,q=>q.query('delete from public.'+table+' returning *'))).rowCount,0);
  await assert.rejects(as(U,B,q=>q.query("insert into public."+table+" values ('new',$1,'{}')",[U])),/row-level security/);
  assert.equal((await as(U,D,q=>q.query('select * from public.'+table))).rows[0].payload.keep,true);
 }
 assert.equal((await as(U,B,q=>q.query("select * from storage.objects where bucket_id='vocal-recordings'"))).rowCount,0);
 assert.equal((await as(U,B,q=>q.query("update storage.objects set id='changed' where id='audio' returning *"))).rowCount,0);
 assert.equal((await as(U,B,q=>q.query("delete from storage.objects where id='audio' returning *"))).rowCount,0);
 await assert.rejects(as(U,B,q=>q.query("insert into storage.objects values ('blocked','vocal-recordings',$1)",[U])),/row-level security/);
 assert.equal((await as(U,B,q=>q.query("select * from storage.objects where bucket_id='other-bucket'"))).rowCount,1);
});
test('concurrent replacements use account revision CAS; a stale choice cannot revoke a second device',{skip},async()=>{
 const state=await slots(),other=new pg.Client({connectionString:DB_URL.replace(/\/[^/]*$/,'/'+name)});await other.connect();
 try{
  const answers=await Promise.all([register(U,D,B,state.revision),register(U,E,B,state.revision,other)]);
  assert.equal(answers.filter(x=>x.status==='active').length,1);assert.equal(answers.filter(x=>x.status==='sessions_changed').length,1);
  assert.equal((await listing(U,A)).sessions.length,3);assert.equal(await active(U,A),true);assert.equal(await active(U,C),true);
 }finally{await other.end();}
});
test('concurrent first registrations cannot exceed the server slot limit',{skip},async()=>{
 const connections=await Promise.all([1,2,3].map(async()=>{const c=new pg.Client({connectionString:DB_URL.replace(/\/[^/]*$/,'/'+name)});await c.connect();return c;}));
 try{
  const answers=await Promise.all([A,B,C,D].map((s,i)=>register(U,s,null,null,i?connections[i-1]:db)));
  assert.equal(answers.filter(x=>x.status==='active').length,3);assert.equal(answers.filter(x=>x.status==='device_limit').length,1);
 }finally{await Promise.all(connections.map(c=>c.end()));}
});
test('specific remote revoke preserves other devices and cannot be undone by old-token registration',{skip},async()=>{
 const state=await slots();const result=await revoke(U,A,B,false,state.revision);
 assert.equal(result.status,'revoked');assert.equal(result.count,1);assert.equal(await active(U,B),false);
 assert.equal((await register(U,B)).status,'revoked');assert.equal(await active(U,A),true);assert.equal(await active(U,C),true);
 assert.equal((await revoke(U,A,C,false,state.revision)).status,'sessions_changed');assert.equal(await active(U,C),true);
 await assert.rejects(revoke(U,B,A,false,result.revision),/active session required/);
});
test('all-device logout revokes every registered session and prevents delayed callbacks reclaiming them',{skip},async()=>{
 const state=await slots();const result=await revoke(U,A,null,true,state.revision);assert.equal(result.count,3);
 for(const s of [A,B,C]){assert.equal(await active(U,s),false);assert.equal((await register(U,s)).status,'revoked');}
 assert.equal((await register(U,D)).status,'active');
});
test('local logout is idempotent and never logs out other devices',{skip},async()=>{
 await slots();
 for(const expected of [true,false])assert.equal((await as(U,A,q=>q.query('select public.vzip_release_session() as r'))).rows[0].r,expected);
 assert.equal(await active(U,A),false);assert.equal(await active(U,B),true);assert.equal(await active(U,C),true);
 assert.equal((await register(U,A)).status,'revoked');
});
test('account ownership and registry privileges remain restrictive',{skip},async()=>{
 await register(U,A);await register(V,F);
 assert.equal((await listing(U,A)).sessions.length,1);assert.equal((await listing(V,F)).sessions[0].session_id,F);
 assert.equal((await as(U,A,q=>q.query('select * from public.vocal_data where user_id=$1',[V]))).rowCount,0);
 await assert.rejects(as(U,A,q=>q.query('update public.vocal_data set user_id=$1 where user_id=$2',[V,U])),/row-level security/);
 const state=await listing(U,A);assert.equal((await revoke(U,A,F,false,state.revision)).count,0);assert.equal(await active(V,F),true);
 for(const table of ['vzip_device_sessions','vzip_account_session_state']){
  await assert.rejects(as(U,A,q=>q.query('select * from public.'+table)),/permission denied/);
  await assert.rejects(as(U,A,q=>q.query('delete from public.'+table)),/permission denied/);
 }
 await assert.rejects(as(U,A,q=>q.query('select public.vzip_session_snapshot()')),/permission denied/);
 for(const [u,s] of [[V,A],[U,null],[U,'bad']])await assert.rejects(register(u,s),/valid authenticated session required/);
 await db.query('begin');try{await db.query('set local role anon');await assert.rejects(db.query('select public.vzip_register_session()'),/permission denied/);}finally{await db.query('rollback');}
});
test('removed Auth sessions do not authorize requests or occupy a slot',{skip},async()=>{
 await slots();await db.query('delete from auth.sessions where id=$1',[B]);
 assert.equal(await active(U,B),false);assert.equal((await listing(U,A)).sessions.length,2);assert.equal((await register(U,D)).status,'active');
 await assert.rejects(register(U,B),/valid authenticated session required/);
});
test('legacy client protocol and ambiguous revocation arguments fail closed',{skip},async()=>{
 const state=await register(U,A);
 for(const args of [[null,false],[B,true],[null,null]])await assert.rejects(revoke(U,A,args[0],args[1],state.revision),/choose one session or all sessions/);
 await as(U,A,async q=>{
  await q.query("select set_config('request.headers','{}',true)");
  assert.equal((await q.query('select public.vzip_session_is_active() as r')).rows[0].r,false);
  assert.equal((await q.query('select * from public.vocal_data')).rowCount,0);
 });
 await assert.rejects(as(U,A,async q=>{await q.query("select set_config('request.headers','{}',true)");return q.query('select public.vzip_register_session()');}),/valid authenticated session required/);
});
