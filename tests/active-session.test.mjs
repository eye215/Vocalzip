// Disposable PostgreSQL only. No production URLs or credentials.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
const DB_URL=process.env.VZ_SESSION_TEST_DB;
const skip=!DB_URL;
const U='11111111-1111-4111-8111-111111111111', V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let admin,db,name;
const migration=readFileSync(new URL('../supabase/migrations/20261112_active_session_contract.sql',import.meta.url),'utf8');
async function as(user,session,fn,connection=db) {
 await connection.query('begin');
 try {
  await connection.query('set local role authenticated');
  await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,session_id:session})]);
  await connection.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-vzip-client-protocol':'account-session-v1'})]);
  const result=await fn(connection); await connection.query('commit'); return result;
 } catch(e){await connection.query('rollback');throw e;}
}
const claim=(u,s,expected=null,c=db)=>as(u,s,async q=>(await q.query('select public.vzip_claim_session($1) as r',[expected])).rows[0].r,c);
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

test('first claim activates; another login needs confirmation; cancel leaves original data access intact',{skip},async()=>{
 assert.deepEqual(await claim(U,A),{status:'active'});
 const pending=await claim(U,B);assert.deepEqual(pending,{status:'confirmation_required',expected_previous:A});
 assert.equal((await as(U,A,q=>q.query('select * from public.vocal_data'))).rows.length,1);
 assert.equal((await as(U,B,q=>q.query('select * from public.vocal_data'))).rows.length,0);
});
test('confirmed takeover blocks the old JWT direct reads and all mutations, including Storage',{skip},async()=>{
 assert.deepEqual(await claim(U,B,A),{status:'active'});
 const changed=await as(U,A,q=>q.query("update public.vocal_data set payload='{}' where user_id=$1 returning *",[U]));
 assert.equal(changed.rowCount,0);
 assert.equal((await as(U,A,q=>q.query('delete from public.vocal_data where user_id=$1 returning *',[U]))).rowCount,0);
 await assert.rejects(as(U,A,q=>q.query("insert into public.vocal_data values ($1,'{}')",[U])),/row-level security/);
 assert.equal((await as(U,A,q=>q.query("select * from storage.objects where bucket_id='vocal-recordings'"))).rowCount,0);
 await assert.rejects(as(U,A,q=>q.query("insert into storage.objects values ('blocked','vocal-recordings',$1)",[U])),/row-level security/);
 assert.equal((await as(U,B,q=>q.query('select * from public.vocal_data'))).rows[0].payload.songs[0],'keep');
 assert.equal((await as(U,A,q=>q.query("update storage.objects set id='changed' where id='audio' returning *"))).rowCount,0);
 assert.equal((await as(U,A,q=>q.query("delete from storage.objects where id='audio' returning *"))).rowCount,0);
 for(const table of ['vocal_media','vocal_history','vocal_song_texts','vocal_analysis_jobs','vocal_billing_documents','vzip_song_stt_quota','vzip_worker_wake']){
  assert.equal((await as(U,A,q=>q.query(`select * from public.${table}`))).rowCount,0);
  assert.equal((await as(U,A,q=>q.query(`update public.${table} set payload='{}' returning *`))).rowCount,0);
  assert.equal((await as(U,A,q=>q.query(`delete from public.${table} returning *`))).rowCount,0);
  await assert.rejects(as(U,A,q=>q.query(`insert into public.${table} values ('new',$1,'{}')`,[U])),/row-level security/);
  assert.equal((await as(U,B,q=>q.query(`select * from public.${table}`))).rows[0].payload.keep,true);
 }
 // Unrelated bucket access still follows existing ownership rules.
 assert.equal((await as(U,A,q=>q.query("select * from storage.objects where bucket_id='other-bucket'"))).rowCount,1);
});
test('a delayed logout cannot release the new session; stale confirmation cannot steal it',{skip},async()=>{
 assert.equal((await as(U,A,q=>q.query('select public.vzip_release_session() as r'))).rows[0].r,false);
 assert.deepEqual(await claim(U,C,A),{status:'confirmation_required',expected_previous:B});
 assert.equal((await as(U,B,q=>q.query('select public.vzip_session_is_active() as r'))).rows[0].r,true);
});
test('forged foreign session, missing or malformed claims cannot claim; no direct registry access',{skip},async()=>{
 for(const [u,s] of [[V,A],[U,null],[U,'not-a-uuid']])await assert.rejects(claim(u,s),/valid authenticated session required/);
 await assert.rejects(as(U,B,q=>q.query('select * from public.vzip_active_sessions')),/permission denied/);
 await assert.rejects(as(U,B,q=>q.query("update public.vzip_active_sessions set session_id=$1",[A])),/permission denied/);
 await db.query('begin');try{await db.query('set local role anon');await assert.rejects(db.query('select public.vzip_claim_session(null)'),/permission denied/);}finally{await db.query('rollback');}
});
test('simultaneous confirmed takeovers serialize; only one wins and owner policies remain restrictive',{skip},async()=>{
 const other=new pg.Client({connectionString:DB_URL.replace(/\/[^/]*$/,'/'+name)});await other.connect();
 try{
  const results=await Promise.all([claim(U,A,B),claim(U,C,B,other)]);
  assert.equal(results.filter(r=>r.status==='active').length,1);
  assert.equal(results.filter(r=>r.status==='confirmation_required').length,1);
  const {rows:[active]}=await db.query('select session_id from public.vzip_active_sessions where user_id=$1',[U]);
  assert.equal((await as(U,active.session_id,q=>q.query('select * from public.vocal_data where user_id=$1',[V]))).rowCount,0);
  await assert.rejects(as(U,active.session_id,q=>q.query("update public.vocal_data set user_id=$1 where user_id=$2",[V,U])),/row-level security/);
 }finally{await other.end();}
});
test('current logout releases only its own row; revoked auth sessions never pass the guard',{skip},async()=>{
 const {rows:[active]}=await db.query('select session_id from public.vzip_active_sessions where user_id=$1',[U]);
 await db.query('delete from auth.sessions where id=$1',[active.session_id]);
 assert.equal((await as(U,active.session_id,q=>q.query('select public.vzip_session_is_active() as r'))).rows[0].r,false);
 const next=active.session_id===A?C:A;
 const answer=await claim(U,next,active.session_id);assert.equal(answer.status,'active');
 assert.equal((await as(U,next,q=>q.query('select public.vzip_release_session() as r'))).rows[0].r,true);
 assert.equal((await as(U,next,q=>q.query('select public.vzip_session_is_active() as r'))).rows[0].r,false);
});

test('legacy clients cannot reuse the active token without the account isolation protocol',{skip},async()=>{
 const {rows:[r]}=await db.query('select id from auth.sessions where user_id=$1 limit 1',[U]);
 await claim(U,r.id);
 await as(U,r.id,async q=>{
  await q.query("select set_config('request.headers','{}',true)");
  assert.equal((await q.query('select public.vzip_session_is_active() as r')).rows[0].r,false);
  assert.equal((await q.query('select * from public.vocal_data')).rowCount,0);
  assert.equal((await q.query("update public.vocal_data set payload='{}' returning *")).rowCount,0);
  await assert.rejects(q.query('select public.vzip_claim_session(null)'),/valid authenticated session required/);
 }).catch(e=>{if(!/current transaction is aborted/.test(e.message))throw e;});
});
