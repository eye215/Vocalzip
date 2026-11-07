// Disposable PostgreSQL only. Exercises real transactions, RLS and existing 2-session SQL.
// This suite never uses production credentials and refuses nonlocal DB URLs.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const URL_=process.env.VZ_SNAPSHOT_TEST_DB,skip=!URL_;
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
const save=(u=U,s=A,revision=0,payload=base('keep'),id=randomUUID(),c=db)=>as(u,s,async q=>(await q.query('select public.vzip_save_snapshot($1,$2,$3) r',[revision,payload,id])).rows[0].r,c);
before(async()=>{
 if(skip)return;
 admin=new pg.Client({connectionString:URL_});await admin.connect();name='vzip_snapshot_'+Date.now();await admin.query('create database '+name);
 conn=URL_.replace(/\/[^/]*$/,'/'+name);db=new pg.Client({connectionString:conn});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
 await db.query(String.raw`
 create schema auth;
 create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
 create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated;
 create table public.vocal_data(user_id uuid primary key references auth.users(id),payload jsonb,updated_at timestamptz);
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
 await db.query('truncate public.vzip_data_write_requests,public.vocal_data,public.vzip_device_sessions,public.vzip_account_session_state,public.vocal_history');
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
test('server creates and updates numeric-string revisions; original IDs remain',{skip},async()=>{
 const a=await save();assert.equal(a.revision,'1');assert.equal(a.status,'saved');
 const b=await save(U,B,1,base('next'));assert.equal(b.revision,'2');
 assert.equal((await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload.songs[0].id,'next');
 assert.equal((await db.query('select count(*) from public.vzip_data_write_requests')).rows[0].count,'2');
});
test('same request retry returns its receipt and cannot apply twice',{skip},async()=>{
 const id=randomUUID(),a=await save(U,A,0,base('one'),id),b=await save(U,A,0,base('one'),id);
 assert.equal(b.replayed,true);assert.equal(b.revision,a.revision);assert.equal(b.updated_at,a.updated_at);
 assert.equal((await db.query('select revision from public.vocal_data where user_id=$1',[U])).rows[0].revision,'1');
});
test('same key with different content/base revision/session is rejected',{skip},async()=>{
 const id=randomUUID();await save(U,A,0,base('one'),id);
 await assert.rejects(save(U,A,0,base('two'),id),/reused/);
 await assert.rejects(save(U,A,1,base('one'),id),/reused/);
 await assert.rejects(save(U,B,0,base('one'),id),/reused/);
});
test('two sessions racing on the same revision have exactly one winner',{skip},async()=>{
 await save();const other=new pg.Client({connectionString:conn});await other.connect();
 try{
  const results=await Promise.all([save(U,A,1,base('phone')),save(U,B,1,base('tablet'),randomUUID(),other)]);
  assert.equal(results.filter(x=>x.status==='saved').length,1);assert.equal(results.filter(x=>x.status==='conflict').length,1);
  assert.equal((await db.query('select revision from public.vocal_data where user_id=$1',[U])).rows[0].revision,'2');
 }finally{await other.end()}
});
test('two concurrent first saves do not replace the created snapshot',{skip},async()=>{
 const other=new pg.Client({connectionString:conn});await other.connect();
 try{
  const results=await Promise.all([save(U,A,0,base('phone')),save(U,B,0,base('tablet'),randomUUID(),other)]);
  assert.equal(results.filter(x=>x.status==='saved').length,1);assert.equal(results.filter(x=>x.status==='conflict').length,1);
  assert.equal((await db.query('select revision from public.vocal_data where user_id=$1',[U])).rows[0].revision,'1');
 }finally{await other.end()}
});
test('nonexistent expected revision fails without creating data',{skip},async()=>{
 const r=await save(U,A,9);assert.deepEqual(r,{status:'conflict',revision:'0',exists:false});
 assert.equal((await db.query('select * from public.vocal_data')).rowCount,0);
});
test('owner and request namespaces are isolated; direct receipt writes are forbidden',{skip},async()=>{
 const id=randomUUID();await save(U,A,0,base('private-A'),id);await save(V,C,0,base('private-V'),id);
 const rows=await as(U,A,c=>c.query('select * from public.vzip_data_write_requests'));
 assert.equal(rows.rowCount,1);assert.equal(rows.rows[0].user_id,U);assert.equal(rows.rows[0].content_hash.length,32);
 assert.equal((await as(U,A,c=>c.query('select * from public.vocal_data where user_id=$1',[V]))).rowCount,0);
 for(const sql of ["delete from public.vzip_data_write_requests","update public.vzip_data_write_requests set result_revision=999"]){
  await assert.rejects(as(U,A,c=>c.query(sql)),/permission denied/);
 }
});
test('revoked JWT cannot replay a saved receipt, write, or read receipts',{skip},async()=>{
 const id=randomUUID();await save(U,A,0,base('private'),id);
 const state=await as(U,B,async c=>(await c.query('select public.vzip_list_sessions() r')).rows[0].r);
 await as(U,B,c=>c.query('select public.vzip_revoke_sessions($1,false,$2)',[A,state.revision]));
 await assert.rejects(save(U,A,0,base('private'),id),/active|registered/);
 assert.equal((await as(U,A,c=>c.query('select * from public.vzip_data_write_requests'))).rowCount,0);
 assert.equal((await save(U,B,1,base('still-active'))).status,'saved');
});
test('unregistered actual Auth session cannot write',{skip},async()=>{
 await assert.rejects(save(U,D),/active|registered/);
 assert.equal((await db.query('select * from public.vocal_data')).rowCount,0);
});
test('legacy direct writes cannot forge revision or timestamp',{skip},async()=>{
 await save();const before=(await db.query('select updated_at from public.vocal_data where user_id=$1',[U])).rows[0].updated_at;
 await as(U,A,c=>c.query("update public.vocal_data set revision=9999,updated_at='1900-01-01',payload=$1 where user_id=$2",[base('legacy-write'),U]));
 const r=(await db.query('select revision,updated_at from public.vocal_data where user_id=$1',[U])).rows[0];
 assert.equal(r.revision,'2');assert.ok(r.updated_at>=before);
});
test('old updated_at CAS cannot overwrite an RPC commit',{skip},async()=>{
 const a=await save();await save(U,B,1,base('newest'));
 const stale=await as(U,A,c=>c.query("update public.vocal_data set payload=$1 where user_id=$2 and updated_at=$3 returning *",[base('stale'),U,a.updated_at]));
 assert.equal(stale.rowCount,0);
 assert.equal((await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload.songs[0].id,'newest');
});
test('receipt insertion failure rolls back the whole snapshot mutation',{skip},async()=>{
 await db.query('alter table public.vzip_data_write_requests add constraint test_receipt_failure check(result_revision<0)');
 try{
  await assert.rejects(save(),/test_receipt_failure/);
  assert.equal((await db.query('select * from public.vocal_data')).rowCount,0);
  assert.equal((await db.query('select * from public.vocal_history')).rowCount,0);
 }finally{await db.query('alter table public.vzip_data_write_requests drop constraint test_receipt_failure')}
});
for(const payload of [null,[],{songs:[]},{...base(),lessons:'bad'}]){
 test('malformed payload is rejected before a write: '+JSON.stringify(payload),{skip},async()=>{
  await assert.rejects(save(U,A,0,payload),/invalid snapshot/);
  assert.equal((await db.query('select * from public.vocal_data')).rowCount,0);
 });
}
test('null request id and negative revision do not write',{skip},async()=>{
 await assert.rejects(save(U,A,0,base(),null),/request id/);await assert.rejects(save(U,A,-1),/nonnegative/);
 assert.equal((await db.query('select * from public.vocal_data')).rowCount,0);
});

test('existing history captures server revisions and retry receipts add no versions',{skip},async()=>{
 const id=randomUUID();
 await save(U,A,0,base('original'),id);
 await save(U,A,0,base('original'),id);
 await save(U,B,1,base('next'));
 const rows=await as(U,A,c=>c.query("select op,data from public.vocal_history where source='vocal_data' order by id"));
 assert.equal(rows.rowCount,2);
 assert.deepEqual(rows.rows.map(x=>[x.op,String(x.data.revision),x.data.payload.songs[0].id]),[['insert','1','original'],['update','2','next']]);
 assert.equal(rows.rows[0].data.user_id,U);
});
test('history and receipts are unreadable across owners and after session revocation',{skip},async()=>{
 await save(U,A,0,base('private-A'));await save(V,C,0,base('private-V'));
 const own=await as(U,A,c=>c.query('select data from public.vocal_history'));
 assert.equal(own.rowCount,1);assert.equal(own.rows[0].data.user_id,U);
 const state=await as(U,B,async c=>(await c.query('select public.vzip_list_sessions() r')).rows[0].r);
 await as(U,B,c=>c.query('select public.vzip_revoke_sessions($1,false,$2)',[A,state.revision]));
 assert.equal((await as(U,A,c=>c.query('select * from public.vocal_history'))).rowCount,0);
 assert.equal((await as(U,A,c=>c.query('select * from public.vzip_data_write_requests'))).rowCount,0);
});
