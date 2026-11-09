// Disposable PostgreSQL only. Never connects to an operating database or uses real accounts.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import C from '../billing/core.js';
const url=process.env.VZ_DELETE_TEST_DB;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Disposable local PostgreSQL is required');
const db=new pg.Client({connectionString:url});await db.connect();
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const json=x=>JSON.stringify(x),source='supabase/migrations/20261114_permanent_lesson_delete.sql';
const payload=(id='lesson')=>({categories:[],songs:[{id:'keep-song'}],lessons:[{id,feedback:'erase private text',recordings:[]},{id:'keep',feedback:'keep feedback'}],
 assignments:[{id:'task',lessonIds:[id,'keep'],lessonId:id,title:'keep homework'}],practices:[{id:'p',minutes:12}],deleted:{}});
async function admin(){await db.query('reset role');}
async function auth(id=A,active=true){
 await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.fixture_active',$2,false)",[id,active?'yes':'no']);
 await db.query('set role authenticated');
}
async function putApp(id,value){await admin();await db.query('insert into public.vocal_data(user_id,payload) values($1,$2) on conflict(user_id) do update set payload=excluded.payload,updated_at=clock_timestamp()',[id,json(value)]);}
async function row(id=A){return (await db.query('select payload,updated_at from public.vocal_data where user_id=$1',[id])).rows[0];}
async function remove(id='lesson',at=null,operation=randomUUID(),link=''){
 const version=at??(await row()).updated_at;
 return (await db.query('select public.vzip_delete_lesson($1,$2,$3,$4) result',[id,operation,version,link])).rows[0].result;
}
before(async()=>{
 await db.query(await readFile('billing/tests/sql-setup.sql','utf8'));
 await db.query(await readFile('supabase/tests/app-tables.sql','utf8'));
 await db.query(await readFile('billing/migrations/20261104_billing_cloud.sql','utf8'));
 await db.query(await readFile('supabase/migrations/20261106_keep_history.sql','utf8'));
 await db.query(`create function public.vzip_session_read_allowed() returns boolean language sql stable as
  $$ select auth.uid() is not null and coalesce(current_setting('request.fixture_active',true),'')='yes' $$;
 create function public.vzip_assert_session() returns void language plpgsql as $$
 begin if not public.vzip_session_read_allowed() then raise exception 'inactive session' using errcode='42501';end if;end;$$;`);
 const migration=await readFile(source,'utf8');await db.query(migration);await db.query(migration);
});
after(async()=>{await db.end();});
test('migration is re-runnable and does not backfill or mutate existing user records',async()=>{
 await admin();assert.equal((await db.query('select count(*) n from public.vzip_permanent_delete_guards')).rows[0].n,'0');
 assert.equal((await row()).payload.songs[0].id,'s1');
});
test('anonymous users and inactive sessions cannot invoke deletion or inspect guards',async()=>{
 await putApp(A,payload());await admin();await db.query('set role anon');
 await assert.rejects(db.query('select public.vzip_delete_lesson($1,$2,now(),$3)',['lesson','op','']),e=>e.code==='42501');
 await auth(A,false);await assert.rejects(remove(),e=>e.code==='42501');
 await auth();await assert.rejects(db.query('select * from public.vzip_permanent_delete_guards'),e=>e.code==='42501');
 await assert.rejects(db.query('select public.vzip_redact_deleted_lessons($1,$2)',[B,json(payload())]),e=>e.code==='42501');
 const capabilities=(await db.query('select public.vzip_lesson_delete_capabilities() x')).rows[0].x;
 assert.equal(capabilities.lesson_permanent,true);
});
test('stale root versions reject before guards or lesson state change',async()=>{
 await auth();const before=await row();await admin();
 await db.query('update public.vocal_data set updated_at=updated_at+interval \'1 second\' where user_id=$1',[A]);
 await auth();await assert.rejects(remove('lesson',before.updated_at),e=>e.code==='PT409');
 assert.equal((await row()).payload.lessons.length,2);
 await admin();assert.equal((await db.query('select count(*) n from public.vzip_permanent_delete_guards')).rows[0].n,'0');
});
test('deletion redacts old history in bounded batches and hides pending text immediately',async()=>{
 await putApp(A,payload());await putApp(B,payload());
 await admin();const original=await row();
 await db.query(`insert into public.vocal_history(user_id,source,row_id,op,data)
  select $1,'vocal_data',$1::text,'update',jsonb_build_object('payload',$2::jsonb)
  from generate_series(1,240)`,[A,json(payload())]);
 await auth();const first=await remove('lesson',original.updated_at,'operation-a','billing-source');
 assert.equal(first.ok,false);assert.equal(first.pending,true);assert.equal(first.redacted,100);
 const current=(await row()).payload;assert.deepEqual(current.lessons,[{id:'keep',feedback:'keep feedback'}]);
 assert.equal(current.assignments[0].title,'keep homework');assert.deepEqual(current.assignments[0].lessonIds,['keep']);assert.equal(current.assignments[0].lessonId,'keep');
 assert.equal(current.practices[0].minutes,12);assert.deepEqual(current.deleted.billingLessonLinks,['billing-source']);
 const visible=(await db.query("select data from public.vocal_history where source='vocal_data'")).rows;
 assert.ok(visible.length>0);assert.ok(!json(visible).includes('erase private text'));
 const second=await remove('lesson',original.updated_at,'operation-a');
 assert.equal(second.pending,true);
 const third=await remove('lesson',original.updated_at,'operation-a');assert.equal(third.ok,true);
 await admin();assert.equal((await db.query("select count(*) n from public.vocal_history where user_id=$1 and source='vocal_data' and public.vzip_payload_has_deleted_lesson($1,data->'payload')",[A])).rows[0].n,'0');
 assert.equal((await row(B)).payload.lessons[0].feedback,'erase private text');
});
test('old clients and history replay cannot resurrect lessons or homework links',async()=>{
 await auth();await db.query('update public.vocal_data set payload=$1 where user_id=$2',[json(payload()),A]);
 const current=(await row()).payload;
 assert.deepEqual(current.lessons.map(l=>l.id),['keep']);assert.deepEqual(current.assignments[0].lessonIds,['keep']);
 assert.ok(current.deleted.lessons.includes('lesson'));
 const visible=(await db.query("select data from public.vocal_history where source='vocal_data'")).rows;
 assert.ok(!json(visible).includes('erase private text'));
});
test('whole-document removal and recreation retain account deletion guards',async()=>{
 await auth();await db.query('delete from public.vocal_data where user_id=$1',[A]);
 await db.query('insert into public.vocal_data(user_id,payload) values($1,$2)',[A,json(payload())]);
 assert.deepEqual((await row()).payload.lessons.map(l=>l.id),['keep']);
});
test('cross-account requests never select or redact another account lesson',async()=>{
 await auth(B);await remove('own-only');
 assert.equal((await row(B)).payload.lessons[0].id,'lesson');
 const foreign=(await db.query('select payload from public.vocal_data where user_id=$1',[A])).rows;assert.equal(foreign.length,0);
 await admin();const guard=(await db.query("select count(*) n from public.vzip_permanent_delete_guards where user_id=$1 and entity_id='own-only'",[A])).rows[0].n;
 assert.equal(guard,'0');
});
test('cancelled charges cannot be reactivated by old payloads, clear/recreate or other devices',async()=>{
 let n=0,state=C.empty('user:'+A),run=(s,type,p)=>C.reduce(s,{type,payload:p},{uid:()=> 'fixture-'+(++n),now:'2026-11-09T12:00:00Z'});
 state=run(state,'pass.save',{name:'pass',amount:300000,totalUnits:1000});const passId=state.passes[0].id;
 state=run(state,'payment.save',{passId,date:'2026-11-09',amount:300000,kind:'payment'});
 state=run(state,'deduction.save',{passId,date:'2026-11-09',units:100,status:'completed',lessonId:'l'});
 const original=structuredClone(state),charge=state.deductions[0];
 state=run(state,'deduction.cancelForDeletion',{id:charge.id,expectedVersion:charge.version,lessonId:'l',operationId:'cancel-op'});
 await admin();
 await db.query(`insert into public.vocal_billing_documents(user_id,payload,revision,last_request_id)
  values($1,$2,1,$3)`,[A,json(state),randomUUID()]);
 await assert.rejects(db.query('update public.vocal_billing_documents set payload=$1 where user_id=$2',[json(original),A]),e=>e.code==='23514');
 await db.query('delete from public.vocal_billing_documents where user_id=$1',[A]);
 await assert.rejects(db.query('insert into public.vocal_billing_documents(user_id,payload,revision,last_request_id) values($1,$2,1,$3)',[A,json(original),randomUUID()]),e=>e.code==='23514');
 await db.query('insert into public.vocal_billing_documents(user_id,payload,revision,last_request_id) values($1,$2,1,$3)',[A,json(state),randomUUID()]);
 const after=(await db.query('select payload from public.vocal_billing_documents where user_id=$1',[A])).rows[0].payload;
 assert.deepEqual(after.payments,original.payments);assert.ok(after.deductions[0].voidedAt);
});
test('guards are private, all definer helpers have a fixed search path, and no anon RPC grants exist',async()=>{
 await admin();
 const rows=(await db.query("select proname,proconfig from pg_proc where proname in ('vzip_delete_lesson','vzip_redact_deleted_lessons','vzip_permanent_delete_guard_write')")).rows;
 assert.equal(rows.length,3);assert.ok(rows.every(r=>r.proconfig.some(c=>c.startsWith('search_path='))));
 assert.equal((await db.query("select has_function_privilege('anon','public.vzip_delete_lesson(text,text,timestamptz,text)','execute') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select relrowsecurity enabled from pg_class where oid='public.vzip_permanent_delete_guards'::regclass")).rows[0].enabled,true);
});
