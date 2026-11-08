// Disposable PostgreSQL only. Exercises real transactions, RLS and existing 2-session SQL.
// This suite never uses production credentials and refuses nonlocal DB URLs.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const URL_=process.env.VZ_DRAFT_TEST_DB,skip=!URL_;
if(URL_&&!['localhost','127.0.0.1','[::1]'].includes(new URL(URL_).hostname))throw Error('local disposable database required');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',D='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const base=()=>({categories:[],songs:[{id:'song-legacy',title:'keep song'}],lessons:[{id:'lesson-old-id',memo:'original memo',prepMemo:'original prep',feedback:'original feedback',recordings:[{id:'keep-media'}]},{id:'lesson-other',memo:'other lesson'}],assignments:[{id:'homework-old',lessonId:'lesson-old-id'}],practices:[{id:'practice-old',manualMinutes:12}],performances:[{id:'show-old'}],deleted:{lessons:[]}});
let admin,db,name,conn;
const proposal=readFileSync(new URL('../supabase/proposals/20261113_snapshot_revision.sql',import.meta.url),'utf8');
const drafts=readFileSync(new URL('../supabase/proposals/20261114_field_drafts.sql',import.meta.url),'utf8');
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
before(async()=>{
 if(skip)return;
 admin=new pg.Client({connectionString:URL_});await admin.connect();name='vzip_drafts_'+Date.now();await admin.query('create database '+name);
 conn=URL_.replace(/\/[^/]*$/,'/'+name);db=new pg.Client({connectionString:conn});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
 await db.query(String.raw`
 create schema auth;
 create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
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
 await db.query(history);await db.query(sessions);await db.query(proposal);await db.query(proposal);await db.query(drafts);await db.query(drafts);
 const row=(await db.query('select payload,revision from public.vocal_data where user_id=$1',[U])).rows[0];
 assert.deepEqual(row.payload,legacy);assert.equal(row.revision,'0');

});
beforeEach(async()=>{
 if(skip)return;
 await db.query('truncate public.vzip_field_draft_rollout,public.vzip_field_commit_markers,public.vzip_field_conflicts,public.vzip_field_requests,public.vzip_field_drafts,public.vzip_data_write_requests,public.vocal_data,public.vzip_device_sessions,public.vzip_account_session_state,public.vocal_history');
 await db.query('delete from auth.sessions');
 await db.query('insert into auth.users values ($1),($2) on conflict do nothing',[U,V]);
 for(const s of [A,B,D])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[s,U]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[C,V]);
 await db.query('update public.vzip_session_rollout set enforced=true');
 for(const [u,s] of [[U,A],[U,B],[V,C]])assert.equal((await register(u,s)).status,'active');
 for(const u of [U,V])await db.query('select public.vzip_set_field_draft_enabled($1,true)',[u]);
 await db.query('insert into public.vocal_data(user_id,payload) values($1,$2),($3,$4)',[U,base(),V,base()]);
 await db.query("insert into public.vocal_media(id,user_id,metadata) values('keep-media',$1,'{}') on conflict(id) do nothing",[U]);
});
after(async()=>{
 if(skip)return;await db?.end();
 if(admin){if(name)await admin.query('drop database if exists '+name);await admin.end()}
});

const E1='10000000-0000-4000-8000-000000000001',E2='10000000-0000-4000-8000-000000000002';
const tokens=r=>({draftId:r.draft_id,rev:r.revision,epoch:r.epoch,snapshotRev:r.snapshot_revision??null,generation:r.generation??null});
async function rpc(op,o={}) {
 const {u=U,s=A,editor=E1,entity='lesson-old-id',field='memo',draftId=null,rev=0,epoch=0,text=null,id=randomUUID(),target=null,confirm=false,snapshotRev=null,generation=null,c=db}=o;
 return as(u,s,async q=>(await q.query('select public.vzip_field_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r',[op,entity,field,editor,draftId,rev,epoch,text,id,target,confirm,snapshotRev,generation])).rows[0].r,c);
}
const load=o=>rpc('load',o);
async function acquire(o={}) { return rpc('acquire',{...o,...tokens(await load(o))}); }
const write=(text,state,o={})=>rpc('save',{...o,...tokens(state),text});
const snapshotRow=async(u=U)=>(await db.query('select * from public.vocal_data where user_id=$1',[u])).rows[0];
async function snapshot(payload,o={}) {
 const row=await snapshotRow(o.u||U);
 return as(o.u||U,o.s||A,async c=>(await c.query('select public.vzip_save_snapshot($1,$2,$3,$4) r',[row?.revision||0,payload,randomUUID(),row?.generation||null])).rows[0].r,o.c||db);
}
const count=async table=>Number((await db.query('select count(*) n from public.'+table)).rows[0].n);
test('load is read-only and returns confirmed legacy text',{skip},async()=>{
 const before=await snapshotRow(),r=await load();assert.equal(r.text,'original memo');assert.equal(r.draft_id,null);
 assert.equal(await count('vzip_field_drafts'),0);assert.deepEqual((await snapshotRow()).payload,before.payload);
});
test('draft save stays separate; commit preserves every other field and record',{skip},async()=>{
 const before=await snapshotRow(),a=await acquire(),b=await write('new memo',a);assert.equal(b.status,'saved');
 assert.deepEqual((await snapshotRow()).payload,before.payload);
 assert.equal((await rpc('commit',tokens(b))).status,'committed');
 const expected=structuredClone(before.payload);expected.lessons[0].memo='new memo';
 assert.deepEqual((await snapshotRow()).payload,expected);assert.equal((await snapshotRow()).revision,'2');
 assert.equal(await count('vzip_field_commit_markers'),0);assert.equal((await load()).committed_revision,'1');
});
test('request replay is idempotent and binds content and session',{skip},async()=>{
 const a=await acquire(),args={...tokens(a),text:'one',id:randomUUID()};
 const first=await rpc('save',args),second=await rpc('save',args);assert.equal(second.replayed,true);assert.equal(second.revision,first.revision);
 assert.equal((await load()).revision,'1');assert.equal(await count('vzip_field_conflicts'),0);
 await assert.rejects(rpc('save',{...args,text:'different'}),/reused/);await assert.rejects(rpc('save',{...args,s:B}),/reused/);
});
test('stale save preserves server and deduplicated incoming conflict text',{skip},async()=>{
 const a=await acquire();await write('server text',a);const args={...tokens(a),text:'late text',id:randomUUID()};
 const r=await rpc('save',args);assert.equal(r.preserved,true);assert.equal(r.status,'conflict');
 assert.equal((await load()).text,'server text');assert.equal((await db.query('select text_value from public.vzip_field_conflicts')).rows[0].text_value,'late text');
 assert.equal((await rpc('save',args)).replayed,true);assert.equal(await count('vzip_field_conflicts'),1);
});
test('another device and another tab cannot silently steal an active lease',{skip},async()=>{
 await acquire();assert.equal((await acquire({s:B,editor:E2})).status,'locked');assert.equal((await acquire({editor:E2})).status,'locked');
 assert.equal((await load()).is_editor,true);assert.equal((await load({editor:E2})).is_editor,false);
});
test('explicit recovery fences the prior editor and preserves its late input',{skip},async()=>{
 const a=await acquire(),b=await write('phone',a),r=await load({s:B,editor:E2});
 await assert.rejects(rpc('recover_handoff',{s:B,editor:E2,...tokens(r)}),/explicit/);
 const next=await rpc('recover_handoff',{s:B,editor:E2,...tokens(r),confirm:true});assert.ok(BigInt(next.epoch)>BigInt(b.epoch));
 const late=await write('late offline phone',b);assert.equal(late.reason,'lease_changed');assert.equal(late.preserved,true);
 assert.equal((await rpc('renew',tokens(b))).status,'conflict');assert.equal((await write('tablet',next,{s:B,editor:E2})).status,'saved');
});
test('expiry denies renew and forces a fresh epoch for the same editor',{skip},async()=>{
 const a=await acquire();await db.query("update public.vzip_field_drafts set lease_expires_at=clock_timestamp()-interval '1 second'");
 assert.equal((await rpc('renew',tokens(a))).status,'conflict');const b=await acquire();assert.ok(BigInt(b.epoch)>BigInt(a.epoch));
 assert.equal((await write('late packet',a)).status,'conflict');assert.equal((await load()).text,'original memo');
});
test('release retains text and invalidates queued writes',{skip},async()=>{
 const a=await acquire(),b=await write('keep me',a);assert.equal((await rpc('release',tokens(b))).status,'released');
 assert.equal((await load()).text,'keep me');assert.equal((await write('old queue',b)).status,'conflict');
 assert.equal((await acquire({s:B,editor:E2})).status,'acquired');
});
test('cooperative handoff is atomic and invalidates the previous epoch',{skip},async()=>{
 const a=await acquire(),b=await write('source flushed',a),r=await load({s:B,editor:E2});
 assert.equal((await rpc('request_handoff',{s:B,editor:E2,...tokens(r)})).status,'handoff_requested');assert.equal((await load()).is_editor,true);
 const done=await rpc('accept_handoff',{...tokens(b),target:E2});assert.equal(done.status,'handed_off');assert.equal(done.is_editor,false);assert.ok(BigInt(done.epoch)>BigInt(b.epoch));
 assert.equal((await load({s:B,editor:E2})).is_editor,true);assert.equal((await write('old source',b)).status,'conflict');
 assert.equal((await write('target text',done,{s:B,editor:E2})).status,'saved');
});
test('source changes invalidate a pending handoff',{skip},async()=>{
 const a=await acquire(),r=await load({s:B,editor:E2});await rpc('request_handoff',{s:B,editor:E2,...tokens(r)});
 const next=await write('source changed',a),done=await rpc('accept_handoff',{...tokens(next),target:E2});
 assert.equal(done.reason,'handoff_changed');assert.equal((await load()).is_editor,true);
});
test('a revoked target cannot receive the handoff',{skip},async()=>{
 const a=await acquire(),r=await load({s:B,editor:E2});await rpc('request_handoff',{s:B,editor:E2,...tokens(r)});
 const sessions=await as(U,A,async c=>(await c.query('select public.vzip_list_sessions() r')).rows[0].r);
 await as(U,A,c=>c.query('select public.vzip_revoke_sessions($1,false,$2)',[B,sessions.revision]));
 assert.equal((await rpc('accept_handoff',{...tokens(a),target:E2})).reason,'target_session_revoked');assert.equal((await load()).is_editor,true);
});
test('revocation blocks mutations, receipt replay and all new table reads',{skip},async()=>{
 const a=await acquire(),args={...tokens(a),text:'private',id:randomUUID()};await rpc('save',args);
 const sessions=await as(U,B,async c=>(await c.query('select public.vzip_list_sessions() r')).rows[0].r);
 await as(U,B,c=>c.query('select public.vzip_revoke_sessions($1,false,$2)',[A,sessions.revision]));
 await assert.rejects(rpc('save',args),/active|registered/);
 for(const table of ['vzip_field_drafts','vzip_field_conflicts','vzip_field_requests'])assert.equal((await as(U,A,c=>c.query('select * from public.'+table))).rowCount,0);
});
test('owners are isolated despite equal entity and operation IDs; direct writes are denied',{skip},async()=>{
 const a=await acquire(),v=await acquire({u:V,s:C}),id=randomUUID();await write('U private',a,{id});await write('V private',v,{u:V,s:C,id});
 assert.equal((await load()).text,'U private');assert.equal((await load({u:V,s:C})).text,'V private');
 const rows=await as(U,A,c=>c.query('select user_id from public.vzip_field_drafts'));assert.equal(rows.rowCount,1);assert.equal(rows.rows[0].user_id,U);
 for(const table of ['vzip_field_drafts','vzip_field_conflicts','vzip_field_requests','vzip_field_commit_markers'])await assert.rejects(as(U,A,c=>c.query('delete from public.'+table)),/permission denied/);
});
test('whole snapshot and direct writes cannot replace a protected field',{skip},async()=>{
 await acquire();const before=await snapshotRow(),stale=structuredClone(before.payload);stale.lessons[0].memo='stale';
 await assert.rejects(snapshot(stale),/versioned commit/);
 await assert.rejects(as(U,A,c=>c.query('update public.vocal_data set payload=$1 where user_id=$2',[stale,U])),/versioned commit/);
 const next=structuredClone(before.payload);next.lessons[1].memo='allowed';assert.equal((await snapshot(next)).status,'saved');assert.deepEqual((await snapshotRow()).payload,next);
});
test('caller GUC values do not authorize private commit markers',{skip},async()=>{
 await acquire();const next=base();next.lessons[0].memo='forged';
 await assert.rejects(as(U,A,async c=>{await c.query("select set_config('vzip.field_commit','true',true)");return c.query('update public.vocal_data set payload=$1 where user_id=$2',[next,U]);}),/versioned commit/);
 await assert.rejects(as(U,A,c=>c.query("select public.vzip_protect_field_drafts()")),/permission denied|trigger functions can only/);
});
test('concurrent different-field commits preserve both changes',{skip},async()=>{
 const a=await acquire(),b=await acquire({s:B,editor:E2,field:'feedback'});
 const aa=await write('memo result',a),bb=await write('feedback result',b,{s:B,editor:E2,field:'feedback'});
 const other=new pg.Client({connectionString:conn});await other.connect();
 try{const results=await Promise.all([rpc('commit',tokens(aa)),rpc('commit',{s:B,editor:E2,field:'feedback',...tokens(bb),c:other})]);assert.ok(results.every(r=>r.status==='committed'));}finally{await other.end()}
 const expected=base();expected.lessons[0].memo='memo result';expected.lessons[0].feedback='feedback result';assert.deepEqual((await snapshotRow()).payload,expected);
});
test('tombstoned source deletion removes draft/conflict/receipts and keeps other records',{skip},async()=>{
 const a=await acquire(),b=await write('latest',a);await write('conflict',a);await acquire({entity:'lesson-other'});
 const next=base();next.lessons.shift();await assert.rejects(snapshot(next),/requires a tombstone/);
 next.deleted.lessons=['lesson-old-id'];assert.equal((await snapshot(next)).status,'saved');
 assert.equal((await db.query('select * from public.vzip_field_drafts where draft_id=$1',[b.draft_id])).rowCount,0);assert.equal(await count('vzip_field_conflicts'),0);
 assert.equal((await db.query('select * from public.vzip_field_requests where draft_id=$1',[b.draft_id])).rowCount,0);
 assert.equal((await db.query("select * from public.vzip_field_drafts where entity_id='lesson-other'")).rowCount,1);assert.equal((await db.query("select * from public.vocal_media where id='keep-media'")).rowCount,1);
 await assert.rejects(load(),/deleted/);
});
test('recreated source fences old draft IDs and old first-acquire tokens',{skip},async()=>{
 const initial=await load(),a=await acquire();await write('old',a);
 const next=base();next.lessons.shift();next.deleted.lessons=['lesson-old-id'];await snapshot(next);
 const fresh=base();fresh.lessons[0].memo='new source';await snapshot(fresh);
 assert.equal((await rpc('acquire',tokens(initial))).reason,'source_changed');
 const now=await acquire();assert.notEqual(now.draft_id,a.draft_id);const stale=await write('late',a);
 assert.equal(stale.reason,'draft_changed');assert.equal(stale.preserved,false);assert.equal((await load()).text,'new source');
});
test('invalid fields and oversize UTF-8 writes never truncate input',{skip},async()=>{
 await assert.rejects(load({field:'recordings'}),/invalid draft field/);await assert.rejects(load({entity:'missing'}),/missing/);
 const a=await acquire();await assert.rejects(write('가'.repeat(21846),a),/invalid draft text/);assert.equal((await load()).text,'original memo');
 assert.equal((await write('a'.repeat(65536),a)).status,'saved');assert.equal((await load()).text.length,65536);
});
test('conflict capacity reports local-only instead of falsely claiming preservation',{skip},async()=>{
 const a=await acquire();await write('server',a);
 await db.query("insert into public.vzip_field_conflicts(user_id,draft_id,session_id,editor_instance,base_revision,lease_epoch,server_revision,text_value) select $1,$2,$3,$4,0,0,1,'existing' from generate_series(1,128)",[U,a.draft_id,A,E1]);
 const r=await write('local only',a);assert.equal(r.preserved,false);assert.equal(r.conflict_id,null);assert.equal(await count('vzip_field_conflicts'),128);assert.equal((await load()).text,'server');
});
test('receipt failure rolls back body, history, transient markers and committed revision',{skip},async()=>{
 const a=await acquire(),b=await write('not committed',a),before=await snapshotRow(),histories=await count('vocal_history');
 await db.query("alter table public.vzip_field_requests add constraint deny_commit_receipt check(response->>'status'<>'committed')");
 try{await assert.rejects(rpc('commit',tokens(b)),/deny_commit_receipt/);assert.deepEqual(await snapshotRow(),before);assert.equal(await count('vocal_history'),histories);assert.equal(await count('vzip_field_commit_markers'),0);assert.equal((await load()).committed_revision,'0');}
 finally{await db.query('alter table public.vzip_field_requests drop constraint deny_commit_receipt')}
});
test('account deletion cascades all new private text',{skip},async()=>{
 const a=await acquire();await write('draft',a);await write('conflict',a);await db.query('delete from auth.users where id=$1',[U]);
 for(const table of ['vzip_field_drafts','vzip_field_conflicts','vzip_field_requests','vzip_field_commit_markers'])assert.equal(await count(table),0);
});

test('anonymous, unregistered and mismatched JWT sessions cannot call field APIs',{skip},async()=>{
 await assert.rejects(rpc('load',{s:D}),/active|registered/);
 await assert.rejects(rpc('load',{u:V,s:A}),/active|registered/);
 await db.query('begin');
 try{await db.query('set local role anon');await assert.rejects(db.query("select public.vzip_field_draft('load','lesson-old-id','memo')"),/permission denied/);}
 finally{await db.query('rollback')}
 assert.equal(await count('vzip_field_drafts'),0);
});
test('two simultaneous writes to the same field keep winner and loser texts',{skip},async()=>{
 const a=await acquire(),other=new pg.Client({connectionString:conn});await other.connect();
 let results;
 try{results=await Promise.all([write('phone text',a),write('tablet packet',a,{c:other})]);}finally{await other.end()}
 assert.equal(results.filter(r=>r.status==='saved').length,1);assert.equal(results.filter(r=>r.status==='conflict'&&r.preserved).length,1);
 const values=[(await load()).text,(await db.query('select text_value from public.vzip_field_conflicts')).rows[0].text_value].sort();
 assert.deepEqual(values,['phone text','tablet packet']);assert.equal((await load()).revision,'1');
});
test('legacy generation is adopted lazily without changing any original payload values',{skip},async()=>{
 const before=(await snapshotRow()).payload;
 await db.query('alter table public.vocal_data disable trigger vzip_data_next_revision');
 try{await db.query('update public.vocal_data set generation=null,revision=0 where user_id=$1',[U]);}
 finally{await db.query('alter table public.vocal_data enable trigger vzip_data_next_revision')}
 assert.equal((await load()).generation,null);const a=await acquire();assert.equal(a.status,'acquired');assert.equal(a.is_editor,true);
 assert.ok((await snapshotRow()).generation);assert.deepEqual((await snapshotRow()).payload,before);
 assert.equal((await write('legacy resumed',a)).status,'saved');
});
test('receipt capacity preserves existing replay and blocks only new operations',{skip},async()=>{
 const a=await acquire(),args={...tokens(a),text:'last saved',id:randomUUID()};await rpc('save',args);
 await db.query("insert into public.vzip_field_requests(user_id,request_id,draft_id,session_id,digest,response) select $1,gen_random_uuid(),$2,$3,decode('00','hex'),'{}' from generate_series(1,10000-(select count(*) from public.vzip_field_requests where user_id=$1))",[U,a.draft_id,A]);
 assert.equal((await rpc('save',args)).replayed,true);
 const latest=await load();await assert.rejects(write('must stay local',latest),/capacity/);
 assert.equal((await load()).text,'last saved');assert.equal(await count('vzip_field_requests'),10000);
});

test('draft writes default off per account; only an operator can enable them',{skip},async()=>{
 await db.query('delete from public.vzip_field_draft_rollout where user_id=$1',[U]);
 assert.equal((await load()).enabled,false);assert.equal((await acquire()).status,'disabled');assert.equal(await count('vzip_field_drafts'),0);
 await assert.rejects(as(U,A,c=>c.query('select public.vzip_set_field_draft_enabled($1,true)',[U])),/permission denied/);
 await assert.rejects(as(U,A,c=>c.query('update public.vzip_field_draft_rollout set enabled=true')),/permission denied/);
 await db.query('select public.vzip_set_field_draft_enabled($1,true)',[U]);
 const a=await acquire();assert.equal(a.status,'acquired');assert.equal(a.is_editor,true);
});
test('pausing writes preserves read access, old receipts, body and all unsent text',{skip},async()=>{
 const a=await acquire(),args={...tokens(a),text:'saved before pause',id:randomUUID()};await rpc('save',args);
 await db.query('select public.vzip_set_field_draft_enabled($1,false)',[U]);
 const r=await load();assert.equal(r.enabled,false);assert.equal(r.is_editor,false);assert.equal(r.text,'saved before pause');
 assert.equal((await rpc('save',args)).replayed,true);
 assert.equal((await write('not silently discarded',r)).status,'disabled');
 assert.equal((await load()).text,'saved before pause');assert.equal((await snapshotRow()).payload.lessons[0].memo,'original memo');
});

test('database foreign keys forbid cross-owner draft associations even in server-side inserts',{skip},async()=>{
 const a=await acquire();
 await assert.rejects(db.query("insert into public.vzip_field_conflicts(user_id,draft_id,session_id,editor_instance,base_revision,lease_epoch,server_revision,text_value) values($1,$2,$3,$4,0,0,0,'wrong owner')",[V,a.draft_id,C,E1]),/foreign key/);
 await assert.rejects(db.query("insert into public.vzip_field_requests(user_id,request_id,draft_id,session_id,digest,response) values($1,$2,$3,$4,decode('00','hex'),'{}')",[V,randomUUID(),a.draft_id,C]),/foreign key/);
 await assert.rejects(db.query("insert into public.vzip_field_commit_markers values($1,txid_current(),$2,decode('00','hex'))",[V,a.draft_id]),/foreign key/);
});
