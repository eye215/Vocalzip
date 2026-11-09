// Disposable PostgreSQL only. No actual users, media, provider keys or paid API calls.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {ownerPolicyRelease,verifyOwnerPolicy} from '../tools/ai-owner-release.mjs';
const url=process.env.VZ_AI_OWNER_TEST_DB,skip=!url;
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let admin,db,name,connection;
const sql=readFileSync('supabase/migrations/20261113_ai_owner_only.sql','utf8');
async function as(user,session,query,args=[],client=db){
 await client.query('begin');
 try{
  await client.query('set local role authenticated');
  await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,session_id:session})]);
  const result=await client.query(query,args);await client.query('commit');return result.rows;
 }catch(error){await client.query('rollback');throw error;}
}
const allowed=(user=U,session=A)=>as(user,session,'select public.vzip_ai_owner_allowed() allowed').then(rows=>rows[0].allowed);
const reserve=(user=U,session=A,client=db)=>as(user,session,'select public.vzip_song_stt_reserve() allowed',[],client).then(rows=>rows[0].allowed);
const counts=()=>db.query('select user_id,used_total,used_today from public.vzip_song_stt_quota order by user_id').then(r=>r.rows);
before(async()=>{
 if(skip)return;
 const parsed=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname),'test DB must be local');
 admin=new pg.Client({connectionString:url});await admin.connect();name='ai_owner_'+Date.now();
 await admin.query('create database '+name);parsed.pathname='/'+name;connection=parsed.toString();
 db=new pg.Client({connectionString:connection});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$");
 await db.query(`create schema auth;create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth,public to anon,authenticated;
 insert into auth.users values ('${U}'),('${V}');
 insert into auth.sessions values ('${A}','${U}',null),('${B}','${U}',null),('${C}','${V}',null);`);
 await db.query(readFileSync('supabase/migrations/20261106_vzip_song_stt_quota.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261108_vzip_song_stt_no_limit_usage.sql','utf8'));
 // Exercise the existing actual Auth/registered-session SQL helpers, without unrelated app tables.
 const sessionSQL=readFileSync('supabase/migrations/20261112_device_session_contract.sql','utf8');
 assert.ok(sessionSQL.includes('-- Realtime has verified JWT'));
 await db.query(sessionSQL.split('-- Realtime has verified JWT')[0]+'\ncommit;');
 await db.query(`alter function public.vzip_song_stt_reserve() rename to vzip_song_stt_reserve_session_impl;
 revoke all on function public.vzip_song_stt_reserve_session_impl() from public,anon,authenticated;
 update public.vzip_session_rollout set enforced=true;
 insert into public.vzip_account_session_state(user_id) values ('${U}'),('${V}');
 insert into public.vzip_device_sessions(user_id,session_id,label) values ('${U}','${A}','owner phone'),('${U}','${B}','owner tablet'),('${V}','${C}','other user');`);
 await db.query("alter table auth.users add column email text");
 await db.query("update auth.users set email=case when id=$1 then 'owner@example.invalid' else 'other@example.invalid' end",[U]);
 await db.query(sql);await db.query(sql);
});
beforeEach(async()=>{
 if(skip)return;
 await db.query('update public.vzip_ai_owner_policy set enabled=true,owner_user_id=$1',[U]);
 await db.query('update public.vzip_device_sessions set revoked_at=null');
 await db.query('update auth.sessions set not_after=null');
 await db.query('truncate public.vzip_song_stt_quota');
 await db.query('insert into public.vzip_song_stt_quota(user_id,used_today,used_total) values ($1,3,7),($2,2,5)',[U,V]);
});
after(async()=>{if(db)await db.end();if(admin){if(name)await admin.query('drop database '+name+' with (force)');await admin.end();}});
test('configured owner can use both registered login sessions; another account is denied',{skip},async()=>{
 assert.equal(await allowed(U,A),true);assert.equal(await allowed(U,B),true);assert.equal(await allowed(V,C),false);
});
test('non-owner cannot reserve paid use and existing counts remain unchanged',{skip},async()=>{
 const before=await counts();assert.equal(await reserve(V,C),false);assert.deepEqual(await counts(),before);
 assert.equal(await reserve(U,A),true);const rows=await counts();assert.equal(rows[0].used_total,8);assert.equal(rows[1].used_total,5);
});
test('disabled, missing owner and missing policy row all fail closed',{skip},async()=>{
 await db.query('update public.vzip_ai_owner_policy set enabled=false');assert.equal(await allowed(),false);assert.equal(await reserve(),false);
 await db.query('update public.vzip_ai_owner_policy set enabled=true,owner_user_id=null');assert.equal(await allowed(),false);
 await db.query('delete from public.vzip_ai_owner_policy');assert.equal(await allowed(),false);assert.equal(await reserve(),false);
 await db.query(sql);assert.equal(await allowed(),false);
});
test('a revoked or expired owner session cannot reserve',{skip},async()=>{
 await db.query('update public.vzip_device_sessions set revoked_at=now() where session_id=$1',[A]);
 assert.equal(await allowed(),false);await assert.rejects(reserve(),{code:'42501'});
 assert.equal(await allowed(U,B),true);
 await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[B]);
 assert.equal(await allowed(U,B),false);await assert.rejects(reserve(U,B),{code:'42501'});
});
test('a different users session UUID does not authenticate the owner',{skip},async()=>{
 assert.equal(await allowed(U,C),false);await assert.rejects(reserve(U,C),{code:'42501'});
});
test('browser roles cannot read or change the owner policy or invoke the old implementation',{skip},async()=>{
 for(const query of ['select * from public.vzip_ai_owner_policy',"update public.vzip_ai_owner_policy set owner_user_id='"+V+"'",'select public.vzip_song_stt_reserve_session_impl()']){
  await assert.rejects(as(V,C,query),{code:'42501'});
 }
 await db.query('begin');
 try{await db.query('set local role anon');await assert.rejects(db.query('select public.vzip_ai_owner_allowed()'),{code:'42501'});}
 finally{await db.query('rollback');}
 assert.equal(await allowed(),true);
});
test('app owner metadata cannot grant paid access',{skip},async()=>{
 const rows=await as(V,C,"select set_config('request.jwt.claims',$1,true),public.vzip_ai_owner_allowed() allowed",[JSON.stringify({sub:V,session_id:C,role:'owner',user_metadata:{owner:true}})]);
 assert.equal(rows[0].allowed,false);assert.equal(await reserve(V,C),false);
});
test('reapplying policy keeps the configured owner and historical usage',{skip},async()=>{
 const before=await counts();await db.query(sql);assert.deepEqual(await counts(),before);assert.equal(await allowed(),true);assert.equal(await allowed(V,C),false);
});
test('only an administrative owner change grants the replacement account',{skip},async()=>{
 await db.query('update public.vzip_ai_owner_policy set owner_user_id=$1',[V]);
 assert.equal(await allowed(),false);assert.equal(await reserve(),false);assert.equal(await allowed(V,C),true);
});
test('concurrent requests never let another account increment paid usage',{skip},async()=>{
 const a=new pg.Client({connectionString:connection}),b=new pg.Client({connectionString:connection});await Promise.all([a.connect(),b.connect()]);
 try{assert.deepEqual(await Promise.all([reserve(U,A,a),reserve(V,C,b)]),[true,false]);}
 finally{await Promise.all([a.end(),b.end()]);}
 const rows=await counts();assert.equal(rows[0].used_total,8);assert.equal(rows[1].used_total,5);
});

const selector=email=>createHash('sha256').update(email).digest('hex');
test('release preflight is read only and exactly matches the synthetic email',{skip},async()=>{
 await db.query('update public.vzip_ai_owner_policy set enabled=false');
 const before=await counts(),r=await ownerPolicyRelease(db,{selector:selector('owner@example.invalid'),migration:sql});
 assert.equal(r.matched_accounts,1);assert.equal(r.applied,false);assert.equal(await allowed(),false);assert.deepEqual(await counts(),before);
});
test('release applies the owner atomically and verifies a real registered non-owner without writing usage',{skip},async()=>{
 await db.query('update public.vzip_ai_owner_policy set enabled=false');const before=await counts();
 const r=await ownerPolicyRelease(db,{selector:selector('owner@example.invalid'),migration:sql,apply:true});
 assert.equal(r.applied,true);assert.deepEqual(await counts(),before);
 assert.deepEqual(await verifyOwnerPolicy(db,{selector:selector('owner@example.invalid')}),{policy_single_owner:true,owner_runtime_allowed:true,registered_non_owner_checked:true,non_owner_rpc_denied:true});
 assert.deepEqual(await counts(),before);
});
test('release cannot select a missing or ambiguous owner and rolls back',{skip},async()=>{
 await assert.rejects(ownerPolicyRelease(db,{selector:selector('missing@example.invalid'),migration:sql,apply:true}),/OWNER_MATCH_NOT_UNIQUE/);
 await db.query("update auth.users set email='owner@example.invalid'");
 try{await assert.rejects(ownerPolicyRelease(db,{selector:selector('owner@example.invalid'),migration:sql,apply:true}),/OWNER_MATCH_NOT_UNIQUE/);}
 finally{await db.query("update auth.users set email=case when id=$1 then 'owner@example.invalid' else 'other@example.invalid' end",[U]);}
 assert.equal(await allowed(),true);
});
test('release preserves an unexpected reservation implementation and stops',{skip},async()=>{
 await db.query("create or replace function public.vzip_song_stt_reserve() returns boolean language sql security definer set search_path='' as $$ select false $$");
 try{await assert.rejects(ownerPolicyRelease(db,{selector:selector('owner@example.invalid'),migration:sql,apply:true}),/RESERVATION_CONTRACT_CHANGED/);}
 finally{await db.query(sql);}
 assert.equal(await allowed(),true);
});
