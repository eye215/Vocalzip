// Disposable PostgreSQL only. Exercises real transactions, RLS and existing 2-session SQL.
// This suite never uses production credentials and refuses nonlocal DB URLs.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const URL_=process.env.VZ_SNAPSHOT_ROLLOUT_TEST_DB,skip=!URL_;
if(URL_&&!['localhost','127.0.0.1','[::1]'].includes(new URL(URL_).hostname))throw Error('local disposable database required');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',D='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const base=id=>({categories:[],songs:id?[{id,title:id}]:[],lessons:[],assignments:[],practices:[]});
let admin,db,name,conn;
const proposal=readFileSync(new URL('../supabase/proposals/20261113_snapshot_revision.sql',import.meta.url),'utf8');
const sessions=readFileSync(new URL('../supabase/migrations/20261112_device_session_contract.sql',import.meta.url),'utf8');
const history=readFileSync(new URL('../supabase/migrations/20261106_keep_history.sql',import.meta.url),'utf8');
async function as(u,s,fn,c=db){
 await c.query('begin');
 try{
  await c.query('set local role authenticated');
  await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers',$3,true)",[u,JSON.stringify({sub:u,session_id:s}),JSON.stringify({'x-client-info':'vocalzip-device-session-v2'})]);
  const out=await fn(c);await c.query('commit');return out;
 }catch(e){await c.query('rollback');throw e}
}
const register=(u,s)=>as(u,s,async c=>(await c.query('select public.vzip_register_session($1,null,null) r',['test'])).rows[0].r);
const save=async(u=U,s=A,revision=0,payload=base('keep'),id=randomUUID(),c=db,generation=undefined)=>{
 if(generation===undefined)generation=Number(revision)>0?(await db.query('select generation from public.vocal_data where user_id=$1',[u])).rows[0]?.generation||null:null;
 return as(u,s,async q=>(await q.query('select public.vzip_save_snapshot($1,$2,$3,$4) r',[revision,payload,id,generation])).rows[0].r,c);
};
before(async()=>{
 if(skip)return;
 admin=new pg.Client({connectionString:URL_});await admin.connect();name='vzip_snapshot_rollout_'+Date.now();await admin.query('create database '+name);
 conn=URL_.replace(/\/[^/]*$/,'/'+name);db=new pg.Client({connectionString:conn});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
 await db.query(String.raw`
 create schema auth;
 create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
 create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated;
 create table public.vocal_data(user_id uuid primary key references auth.users(id) on delete cascade,payload jsonb not null,updated_at timestamptz not null);
 alter table public.vocal_data enable row level security;
 grant select,insert,update,delete on public.vocal_data to authenticated;
 create policy own on public.vocal_data for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create table public.vocal_media(id text primary key,user_id uuid,metadata jsonb,updated_at timestamptz);
 create table public.vocal_billing_documents(user_id uuid primary key,payload jsonb,previous_payload jsonb,previous_revision bigint,updated_at timestamptz);
 create function public.vocal_billing_save(bigint,jsonb,uuid) returns jsonb language sql as $$select $2$$;
 create function public.vzip_enqueue_my_media() returns integer language sql as $$select 0$$;
 create function public.vzip_song_stt_reserve() returns boolean language sql as $$select false$$;
 create function public.vzip_song_stt_usage() returns table(used_total integer,used_today integer) language sql as $$select 0,0$$;
 `);
 await db.query('insert into auth.users values ($1),($2)',[U,V]);
 const legacy=base('legacy-id-not-uuid');await db.query("insert into public.vocal_data values($1,$2,'2099-01-01T00:00:00Z')",[U,legacy]);
 await db.query(history);await db.query(sessions);await db.query(proposal);await db.query(proposal);
 const row=(await db.query('select payload,revision from public.vocal_data where user_id=$1',[U])).rows[0];
 assert.deepEqual(row.payload,legacy);assert.equal(row.revision,'0');
 // First update of a legacy future-clock row must also advance the real DB token.
 await db.query("update public.vocal_data set payload=payload,revision=999999,updated_at='1900-01-01' where user_id=$1",[U]);
 assert.equal((await db.query("select revision,updated_at>'2099-01-01T00:00:00Z'::timestamptz advanced from public.vocal_data where user_id=$1",[U])).rows[0].advanced,true);
 assert.equal((await db.query('select revision from public.vocal_data where user_id=$1',[U])).rows[0].revision,'1');
});
beforeEach(async()=>{
 if(skip)return;
 await db.query('truncate public.vzip_snapshot_rollout,public.vzip_data_write_requests,public.vocal_data,public.vzip_device_sessions,public.vzip_account_session_state,public.vocal_history');
 await db.query('delete from auth.sessions');
 for(const s of [A,B,D])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[s,U]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[C,V]);
 await db.query('update public.vzip_session_rollout set enforced=true');
 for(const [u,s] of [[U,A],[U,B],[V,C]])assert.equal((await register(u,s)).status,'active');
});
after(async()=>{
 if(skip)return;await db?.end();
 if(admin){if(name)await admin.query('drop database if exists '+name);await admin.end()}
});

const rollout=readFileSync(new URL('../supabase/proposals/20261115_snapshot_rollout.sql',import.meta.url),'utf8');
before(async()=>{
 if(skip)return;
 const prior=(await db.query('select payload,revision,generation,updated_at::text from public.vocal_data')).rows;
 await db.query(rollout);await db.query(rollout);
 assert.deepEqual((await db.query('select payload,revision,generation,updated_at::text from public.vocal_data')).rows,prior);
 assert.equal((await db.query('select count(*) from public.vzip_snapshot_rollout')).rows[0].count,'0');
});
const mode=(u,m)=>db.query('select public.vzip_set_snapshot_mode($1,$2)',[u,m]);
const snapshot=async(u=U)=>(await db.query('select payload,revision,generation,updated_at::text from public.vocal_data where user_id=$1',[u])).rows[0];
const direct=(u=U,s=A,payload=base('legacy'))=>as(u,s,c=>c.query('insert into public.vocal_data(user_id,payload) values($1,$2) on conflict(user_id) do update set payload=excluded.payload',[u,payload]));
async function asRole(role,fn){
 await db.query('begin');
 try{await db.query('set local role '+role);const r=await fn(db);await db.query('commit');return r;}
 catch(e){await db.query('rollback');throw e;}
}
const denied={code:'42501'};
test('absent rollout preserves legacy DML and denies the revision RPC',{skip},async()=>{
 await assert.rejects(save(),denied);
 await direct();await as(U,A,c=>c.query('update public.vocal_data set payload=$1 where user_id=$2',[base('edited'),U]));
 assert.equal((await snapshot()).payload.songs[0].id,'edited');
 await as(U,A,c=>c.query('delete from public.vocal_data where user_id=$1',[U]));
 assert.equal(await snapshot(),undefined);assert.equal((await db.query('select count(*) from public.vzip_data_write_requests')).rows[0].count,'0');
});
test('enabling one account never enables another account',{skip},async()=>{
 await mode(U,'revision');assert.equal((await save()).status,'saved');
 await assert.rejects(save(V,C),denied);await direct(V,C,base('other-owner'));
 assert.equal((await snapshot(V)).payload.songs[0].id,'other-owner');
});
test('activation and pausing never rewrite payload IDs, timestamps or revisions',{skip},async()=>{
 await direct();const prior=await snapshot();await mode(U,'revision');assert.deepEqual(await snapshot(),prior);
 await mode(U,'paused');assert.deepEqual(await snapshot(),prior);
});
test('only the operator role can set the account mode',{skip},async()=>{
 await assert.rejects(as(U,A,c=>c.query("select public.vzip_set_snapshot_mode($1,'revision')",[U])),denied);
 await asRole('service_role',c=>c.query("select public.vzip_set_snapshot_mode($1,'revision')",[U]));
 assert.equal((await save()).status,'saved');
});
for(const operation of [
 "insert into public.vzip_snapshot_rollout(user_id,mode) values($1,'revision')",
 "update public.vzip_snapshot_rollout set mode='paused' where user_id=$1",
 "delete from public.vzip_snapshot_rollout where user_id=$1"
]){
 test('authenticated cannot mutate rollout rows: '+operation.split(' ')[0],{skip},async()=>{
  await mode(U,'revision');await assert.rejects(as(U,A,c=>c.query(operation,[U])),denied);
  assert.equal((await db.query('select mode from public.vzip_snapshot_rollout where user_id=$1',[U])).rows[0].mode,'revision');
 });
}
test('rollout reads and getter cannot reveal another account',{skip},async()=>{
 await mode(U,'revision');await mode(V,'paused');
 const rows=await as(U,A,c=>c.query('select user_id,mode from public.vzip_snapshot_rollout'));
 assert.deepEqual(rows.rows,[{user_id:U,mode:'revision'}]);
 const own=await as(U,A,c=>c.query('select public.vzip_snapshot_mode_for($1) mode',[U]));assert.equal(own.rows[0].mode,'revision');
 await assert.rejects(as(U,A,c=>c.query('select public.vzip_snapshot_mode_for($1)',[V])),denied);
});
for(const m of ['revision','paused'])for(const [kind,query] of [
 ['insert',"insert into public.vocal_data(user_id,payload) values($1,$2) on conflict(user_id) do update set payload=excluded.payload"],
 ['update',"update public.vocal_data set payload=$2 where user_id=$1"],
 ['delete',"delete from public.vocal_data where user_id=$1 and $2::jsonb is not null"]
]){
 test(m+' rejects direct '+kind+' and preserves the snapshot',{skip},async()=>{
  await direct();const prior=await snapshot();await mode(U,m);
  await assert.rejects(as(U,A,c=>c.query(query,[U,base('stale-client')])),denied);
  assert.deepEqual(await snapshot(),prior);
 });
}
test('paused account rejects fresh saves and receipt replay without losing the receipt',{skip},async()=>{
 await mode(U,'revision');const id=randomUUID();await save(U,A,0,base('saved'),id);const prior=await snapshot();
 await mode(U,'paused');await assert.rejects(save(U,A,0,base('saved'),id),denied);await assert.rejects(save(U,B,1,base('new')),denied);
 assert.deepEqual(await snapshot(),prior);assert.equal((await db.query('select count(*) from public.vzip_data_write_requests')).rows[0].count,'1');
 await mode(U,'revision');const replay=await save(U,A,0,base('saved'),id);assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(),prior);
});
test('operator cannot silently downgrade an adopted account to legacy',{skip},async()=>{
 await mode(U,'revision');for(const m of ['legacy','',null,'invalid'])await assert.rejects(mode(U,m),/explicit revision or paused/);
 assert.equal((await db.query('select mode from public.vzip_snapshot_rollout')).rows[0].mode,'revision');
 await assert.rejects(mode(randomUUID(),'revision'),/registered account/);
});
test('client-supplied bypass flags and fake JWT role do not authorize direct DML',{skip},async()=>{
 await mode(U,'revision');await assert.rejects(as(U,A,async c=>{
  await c.query("select set_config('vzip.snapshot_rpc','true',true),set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:U,session_id:A,role:'service_role'})]);
  return c.query('insert into public.vocal_data(user_id,payload) values($1,$2)',[U,base('forged')]);
 }),denied);assert.equal(await snapshot(),undefined);
 await assert.rejects(as(U,A,c=>c.query('select public.vzip_assert_snapshot_enabled($1)',[U])),denied);
});
test('rollout does not authorize an unregistered or revoked Auth session',{skip},async()=>{
 await mode(U,'revision');await assert.rejects(save(U,D),denied);
 const state=await as(U,B,async c=>(await c.query('select public.vzip_list_sessions() r')).rows[0].r);
 await as(U,B,c=>c.query('select public.vzip_revoke_sessions($1,false,$2)',[A,state.revision]));
 await assert.rejects(save(U,A),denied);assert.equal((await save(U,B)).status,'saved');
});
test('reinstalling the foundation and rollout keeps the guard and selected mode',{skip},async()=>{
 await mode(U,'paused');await db.query(proposal);await db.query(rollout);await db.query(rollout);
 await assert.rejects(save(),denied);await assert.rejects(direct(),denied);
});
test('installer fails closed if the required foundation hook is missing',{skip},async()=>{
 try{
  await db.query(proposal.replaceAll('vzip_assert_snapshot_enabled','vzip_missing_guard'));
  await assert.rejects(db.query(rollout),/foundation with rollout hook required/);await db.query('rollback');
 }finally{await db.query('rollback');await db.query(proposal);}
 await mode(U,'revision');assert.equal((await save()).status,'saved');
});
test('a mode pause serializes with a save already in flight',{skip,timeout:15000},async()=>{
 await mode(U,'revision');const other=new pg.Client({connectionString:conn});await other.connect();
 let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 const saving=as(U,A,async c=>{const r=(await c.query('select public.vzip_save_snapshot($1,$2,$3,$4) r',[0,base('inflight'),randomUUID(),null])).rows[0].r;started();await gate;return r;},other);
 try{
  await entered;await db.query("set statement_timeout='250ms'");
  await assert.rejects(mode(U,'paused'),/statement timeout/);
 }finally{
  await db.query('set statement_timeout=0');release();await saving;await other.end();
 }
 await mode(U,'paused');await assert.rejects(save(U,B,1,base('after-pause')),denied);assert.equal((await snapshot()).payload.songs[0].id,'inflight');
});
test('anonymous role cannot call snapshot or rollout APIs',{skip},async()=>{
 await assert.rejects(asRole('anon',c=>c.query('select public.vzip_set_snapshot_mode($1,$2)',[U,'revision'])),denied);
 await assert.rejects(asRole('anon',c=>c.query('select public.vzip_save_snapshot($1,$2,$3,$4)',[0,base(),randomUUID(),null])),denied);
});
