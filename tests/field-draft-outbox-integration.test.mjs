// Disposable PostgreSQL only. Exercises real transactions, RLS and existing 2-session SQL.
// This suite never uses production credentials and refuses nonlocal DB URLs.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create,createTransport}=require('../sync/field-draft-outbox.js');
const URL_=process.env.VZ_DRAFT_TEST_DB,skip=!URL_;
if(URL_&&!['localhost','127.0.0.1','[::1]'].includes(new URL(URL_).hostname))throw Error('local disposable database required');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',D='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const base=()=>({categories:[],songs:[{id:'song-legacy',title:'keep song'}],lessons:[{id:'lesson-old-id',memo:'original memo',prepMemo:'original prep',feedback:'original feedback',recordings:[{id:'keep-media'}]},{id:'lesson-other',memo:'other lesson'}],assignments:[{id:'homework-old',lessonId:'lesson-old-id'}],practices:[{id:'practice-old',manualMinutes:12}],performances:[{id:'show-old'}],deleted:{lessons:[]}});
let admin,db,name,conn;
const proposal=readFileSync(new URL('../supabase/proposals/20261113_snapshot_revision.sql',import.meta.url),'utf8');
const drafts=readFileSync(new URL('../supabase/proposals/20261114_field_drafts.sql',import.meta.url),'utf8');
const sessions=readFileSync(new URL('../supabase/migrations/20261112_device_session_contract.sql',import.meta.url),'utf8');
const withPermanentDelete=process.env.VZIP_WITH_PERMANENT_DELETE==='1';
const deletion=withPermanentDelete?readFileSync(new URL('../supabase/migrations/20261114_permanent_lesson_delete.sql',import.meta.url),'utf8'):null;
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
 admin=new pg.Client({connectionString:URL_});await admin.connect();name='vzip_outbox_integration_'+Date.now();await admin.query('create database '+name);
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
 await db.query(history);await db.query(sessions);await db.query(proposal);await db.query(proposal);await db.query(drafts);await db.query(drafts);if(deletion){await db.query(deletion);await db.query(deletion);}
 const row=(await db.query('select payload,revision from public.vocal_data where user_id=$1',[U])).rows[0];
 assert.deepEqual(row.payload,legacy);assert.equal(row.revision,'0');

});
beforeEach(async()=>{
 if(skip)return;
 await db.query('truncate public.vzip_field_draft_rollout,public.vzip_field_commit_markers,public.vzip_field_conflicts,public.vzip_field_requests,public.vzip_field_drafts,public.vzip_data_write_requests,public.vocal_data,public.vzip_device_sessions,public.vzip_account_session_state,public.vocal_history');
 if(deletion)await db.query('truncate public.vzip_permanent_delete_guards');
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

// This is not a PostgREST/signature E2E: the HTTP adapter verifies routing and
// executes the real RPC under authenticated claims in disposable PostgreSQL.
const E1='10000000-0000-4000-8000-000000000001',E2='10000000-0000-4000-8000-000000000002';
const S={entityId:'lesson-old-id',field:'memo'};
class Store {
 constructor(){this.rows=new Map();this.failNext=false;}
 getItem(k){return this.rows.get(k)??null;}
 setItem(k,v){if(this.failNext){this.failNext=false;throw Error('quota failure');}this.rows.set(k,v);}
 key(i){return [...this.rows.keys()][i]??null;}
 get length(){return this.rows.size;}
}
const jwt=(u,s)=>'test.'+Buffer.from(JSON.stringify({sub:u,session_id:s})).toString('base64url')+'.synthetic-signature';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};
function api(){
 const instance={calls:[],after:null,offline:false};
 instance.fetch=async(url,options)=>{
  assert.equal(url,'https://example.supabase.co/rest/v1/rpc/vzip_field_draft');
  const q=JSON.parse(options.body),claims=JSON.parse(Buffer.from(options.headers.Authorization.split(' ')[1].split('.')[1],'base64url').toString());
  instance.calls.push({q,owner:claims.sub,session:claims.session_id});
  if(instance.offline)return {ok:false,status:503};
  const c=new pg.Client({connectionString:conn});await c.connect();
  let r;
  try{
   r=await as(claims.sub,claims.session_id,async db=>{
    await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-client-info':options.headers['X-Client-Info']})]);
    return (await db.query('select public.vzip_field_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r',[
     q.p_operation,q.p_entity_id,q.p_field_key,q.p_editor_instance??null,q.p_draft_id??null,q.p_expected_revision??null,
     q.p_expected_epoch??null,q.p_text??null,q.p_request_id??null,q.p_target_editor??null,q.p_confirm_unsynced??false,
     q.p_expected_snapshot_revision??null,q.p_expected_generation??null
    ])).rows[0].r;
   },c);
  }finally{await c.end()}
  if(instance.after)await instance.after(q,r);
  return {ok:true,status:200,json:async()=>structuredClone(r)};
 };
 return instance;
}
function device(wire,{owner=U,session=A,editor=E1,storage=new Store()}={}){
 const identity={owner,session};
 const transport=createTransport({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',
  getCredentials:async()=>jwt(identity.owner,identity.session),getOwner:()=>identity.owner,getSessionId:()=>identity.session,fetch:wire.fetch});
 const model=create({owner,sessionId:session,editorId:editor,storage,send:transport,
  getOwner:()=>identity.owner,getSessionId:()=>identity.session,makeId:randomUUID});
 const request=(op,state={},extra={},scope=S)=>transport({p_operation:op,p_entity_id:scope.entityId,p_field_key:scope.field,
  p_editor_instance:editor,p_draft_id:state.draft_id??null,p_expected_revision:state.revision??'0',p_expected_epoch:state.epoch??'0',
  p_request_id:randomUUID(),p_expected_snapshot_revision:state.snapshot_revision??null,p_expected_generation:state.generation??null,...extra});
 const open=async(scope=S)=>{
  const loaded=await request('load',{}, {},scope),acquired=await request('acquire',loaded,{},scope);
  assert.equal(acquired.status,'acquired');assert.equal(acquired.is_editor,true);
  model.start(scope,loaded.text);model.attachLease(scope,{...loaded,...acquired});
 };
 return {model,transport,request,open,storage,identity,owner,session,editor};
}
const body=async()=> (await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload;
const serverDraft=async()=> (await db.query("select * from public.vzip_field_drafts where user_id=$1 and entity_id='lesson-old-id' and field_key='memo'",[U])).rows[0];
test('outbox saves a real SQL draft without changing the confirmed snapshot',{skip,timeout:20000},async()=>{
 const wire=api(),d=device(wire);await d.open();d.model.edit(S,'typed via outbox');
 assert.equal((await d.model.sync(S)).status,'server_draft');assert.equal((await serverDraft()).text_value,'typed via outbox');
 assert.deepEqual(await body(),base());assert.equal((await serverDraft()).revision,'1');
});
test('lost SQL response retries the original request without another revision or receipt',{skip,timeout:20000},async()=>{
 const wire=api(),d=device(wire);await d.open();d.model.edit(S,'response lost');
 let lose=true;wire.after=async q=>{if(q.p_operation==='save'&&lose){lose=false;throw Error('response lost');}};
 assert.equal((await d.model.sync(S)).status,'retryable');const pending=d.model.read(S).pending;
 assert.equal((await serverDraft()).revision,'1');assert.equal((await d.model.sync(S)).status,'server_draft');
 const saves=wire.calls.filter(c=>c.q.p_operation==='save');assert.equal(saves.length,2);
 assert.equal(saves[0].q.p_request_id,pending.id);assert.equal(saves[1].q.p_request_id,pending.id);
 assert.equal((await serverDraft()).revision,'1');assert.equal((await db.query('select count(*) n from public.vzip_field_requests where user_id=$1',[U])).rows[0].n,'2');
});
test('edits during the real SQL acknowledgement keep newer local text for the next revision',{skip,timeout:20000},async()=>{
 const wire=api(),d=device(wire);await d.open();const gate=deferred();
 wire.after=async q=>{if(q.p_operation==='save')await gate.promise;};
 d.model.edit(S,'first');const saving=d.model.sync(S);
 while(!(await serverDraft()).revision|| (await serverDraft()).revision==='0')await new Promise(r=>setTimeout(r,10));
 d.model.edit(S,'second');gate.resolve();await saving;
 assert.equal(d.model.read(S).text,'second');assert.equal(d.model.read(S).baseText,'first');assert.equal(d.model.read(S).status,'local');
 await d.model.sync(S);assert.equal((await serverDraft()).text_value,'second');assert.equal((await serverDraft()).revision,'2');assert.deepEqual(await body(),base());
});
test('quota failure after a real SQL acknowledgement recovers through the same receipt',{skip,timeout:20000},async()=>{
 const wire=api(),d=device(wire);await d.open();d.model.edit(S,'durable packet');
 let fail=true;wire.after=async q=>{if(q.p_operation==='save'&&fail){fail=false;d.storage.failNext=true;}};
 await assert.rejects(d.model.sync(S),/quota/);const pending=d.model.read(S).pending;assert.ok(pending);
 await d.model.sync(S);assert.equal((await serverDraft()).revision,'1');assert.equal(d.model.read(S).pending,null);
 assert.equal(wire.calls.filter(c=>c.q.p_operation==='save').at(-1).q.p_request_id,pending.id);
});
test('real handoff fences the old outbox, preserves both texts, then commits only the selected field',{skip,timeout:20000},async()=>{
 const wire=api(),a=device(wire),b=device(wire,{session:B,editor:E2});
 await a.open();a.model.edit(S,'source draft');await a.model.sync(S);
 const target=await b.request('load');await b.request('request_handoff',target);
 const source=await a.request('load');assert.equal((await a.request('accept_handoff',source,{p_target_editor:E2})).status,'handed_off');
 const next=await b.request('load');assert.equal(next.is_editor,true);b.model.start(S,next.text);b.model.attachLease(S,next);
 b.model.edit(S,'target latest');await b.model.sync(S);
 a.model.edit(S,'late offline source');assert.equal((await a.model.sync(S)).status,'conflict');
 assert.equal(a.model.read(S).text,'late offline source');assert.equal(a.model.read(S).conflicts[0].serverPreserved,true);
 assert.equal((await serverDraft()).text_value,'target latest');
 const done=await b.request('commit',await b.request('load'));assert.equal(done.status,'committed');
 const expected=base();expected.lessons[0].memo='target latest';assert.deepEqual(await body(),expected);
 const observed=await a.request('load');
 const recovered=await a.request('recover_handoff',observed,{p_confirm_unsynced:true});
 a.model.resolve(S,{...observed,...recovered},'keep_local');await a.model.sync(S);
 assert.equal((await serverDraft()).text_value,'late offline source');
 assert.ok(a.model.read(S).conflicts.some(c=>c.text==='target latest'));
 assert.deepEqual(await body(),expected); // resolving a draft never implicitly commits the confirmed body

});
test('identity change after SQL commit does not write an acknowledgement into the next account',{skip,timeout:20000},async()=>{
 const wire=api(),a=device(wire);await a.open();a.model.edit(S,'A private');const gate=deferred();
 wire.after=async q=>{if(q.p_operation==='save')await gate.promise;};
 const saving=a.model.sync(S);while((await serverDraft()).revision==='0')await new Promise(r=>setTimeout(r,10));
 a.identity.owner=V;a.identity.session=C;gate.resolve();assert.equal((await saving).status,'identity_changed');
 assert.throws(()=>a.model.read(S),e=>e.code==='owner_changed');
 const b=device(wire,{owner:V,session:C,editor:E2,storage:a.storage});assert.equal(b.model.read(S),null);
 a.identity.owner=U;a.identity.session=A;assert.ok(a.model.read(S).pending);
 wire.after=null;await a.model.sync(S);assert.equal((await serverDraft()).revision,'1');assert.equal(a.model.read(S).status,'server_draft');
});
test('source recreation preserves offline local text and never resurrects a deleted server draft',{skip,timeout:20000},async()=>{
 const wire=api(),a=device(wire);await a.open();a.model.edit(S,'offline old text');
 const snapshot=async payload=>{
  const row=(await db.query('select revision,generation from public.vocal_data where user_id=$1',[U])).rows[0];
  return as(U,A,c=>c.query('select public.vzip_save_snapshot($1,$2,$3,$4)',[row.revision,payload,randomUUID(),row.generation]));
 };
 const removed=base();removed.lessons.shift();removed.deleted.lessons=['lesson-old-id'];await snapshot(removed);
 const recreated=base();recreated.lessons[0].memo='new server source';await snapshot(recreated);
 assert.equal((await a.model.sync(S)).status,'conflict');assert.equal(a.model.read(S).text,'offline old text');
 assert.equal(a.model.read(S).conflicts[0].serverPreserved,false);assert.equal(await serverDraft(),undefined);
 assert.equal((await body()).lessons[0].memo,'new server source');
});
test('service unavailability keeps the durable packet and recovery never uses snapshot fallback',{skip,timeout:20000},async()=>{
 const wire=api(),a=device(wire);await a.open();a.model.edit(S,'wait for server');wire.offline=true;
 assert.equal((await a.model.sync(S)).status,'retryable');assert.ok(a.model.read(S).pending);
 assert.equal((await serverDraft()).revision,'0');wire.offline=false;await a.model.sync(S);
 assert.equal((await serverDraft()).text_value,'wait for server');assert.deepEqual(await body(),base());
 assert.ok(wire.calls.every(c=>['load','acquire','save'].includes(c.q.p_operation)));
});

test('operator pause blocks new outbox writes while preserving the durable packet for explicit recovery',{skip,timeout:20000},async()=>{
 const wire=api(),a=device(wire);await a.open();a.model.edit(S,'paused local input');
 await db.query('select public.vzip_set_field_draft_enabled($1,false)',[U]);
 assert.equal((await a.model.sync(S)).status,'blocked');assert.equal(a.model.read(S).blockedReason,'feature_disabled');assert.ok(a.model.read(S).pending);
 assert.equal((await serverDraft()).text_value,'original memo');
 await db.query('select public.vzip_set_field_draft_enabled($1,true)',[U]);
 const fresh=await a.request('load');a.model.resolve(S,fresh,'keep_local');await a.model.sync(S);
 assert.equal((await serverDraft()).text_value,'paused local input');assert.deepEqual(await body(),base());
});

async function permanentDelete(){
 const row=(await db.query('select updated_at::text updated_at from public.vocal_data where user_id=$1',[U])).rows[0];
 let result;
 do{result=await as(U,A,async c=>(await c.query('select public.vzip_delete_lesson($1,$2,$3,$4) r',[S.entityId,'combined-delete',row.updated_at,''])).rows[0].r);}while(result.pending);
 assert.equal(result.ok,true);return result;
}
test('permanent deletion cascades only its draft, conflict copies and request receipts under snapshot triggers',{skip:skip||!withPermanentDelete,timeout:20000},async()=>{
 const wire=api(),a=device(wire),other=device(wire,{owner:V,session:C,editor:E2});
 await a.open();a.model.edit(S,'private server draft');await a.model.sync(S);
 await other.open();other.model.edit(S,'other account draft');await other.model.sync(S);
 const b=device(wire,{session:B,editor:E2}),loaded=await b.request('load');
 const conflict=await b.request('save',loaded,{p_text:'private conflicting text'});
 assert.equal(conflict.status,'conflict');assert.equal(conflict.preserved,true);
 assert.equal((await db.query('select count(*) n from public.vzip_field_conflicts where user_id=$1',[U])).rows[0].n,'1');
 const otherBody=(await db.query('select payload from public.vocal_data where user_id=$1',[V])).rows[0].payload;
 await permanentDelete();
 for(const table of ['vzip_field_drafts','vzip_field_conflicts','vzip_field_requests','vzip_field_commit_markers'])
  assert.equal((await db.query('select count(*) n from public.'+table+' where user_id=$1',[U])).rows[0].n,'0',table);
 assert.equal((await db.query('select text_value from public.vzip_field_drafts where user_id=$1',[V])).rows[0].text_value,'other account draft');
 assert.deepEqual((await db.query('select payload from public.vocal_data where user_id=$1',[V])).rows[0].payload,otherBody);
 const current=await body();assert.equal(current.lessons.some(l=>l.id===S.entityId),false);
 assert.equal(current.lessons[0].id,'lesson-other');assert.equal(current.practices[0].manualMinutes,12);
 assert.equal((await db.query("select count(*) n from public.vocal_media where id='keep-media'")).rows[0].n,'1');
 const history=(await db.query('select data from public.vocal_history where user_id=$1',[U])).rows;
 assert.ok(history.every(h=>!(h.data.payload?.lessons||[]).some(l=>l.id===S.entityId)));
});
test('snapshot replay and offline outbox cannot recreate a permanently deleted lesson or its draft',{skip:skip||!withPermanentDelete,timeout:20000},async()=>{
 const wire=api(),a=device(wire);await a.open();a.model.edit(S,'offline pending text');
 await permanentDelete();
 const row=(await db.query('select revision,generation from public.vocal_data where user_id=$1',[U])).rows[0];
 const response=await as(U,B,async c=>(await c.query('select public.vzip_save_snapshot($1,$2,$3,$4) r',[row.revision,base(),randomUUID(),row.generation])).rows[0].r);
 assert.equal(response.status,'saved');assert.equal((await body()).lessons.some(l=>l.id===S.entityId),false);
 assert.ok((await body()).deleted.lessons.includes(S.entityId));
 const result=await a.model.sync(S);assert.notEqual(result.status,'server_draft');
 assert.equal(a.model.read(S).text,'offline pending text');assert.ok(a.model.read(S).pending);
 assert.equal(await serverDraft(),undefined);
 const current=await body();assert.equal(current.songs[0].id,'song-legacy');assert.equal(current.performances[0].id,'show-old');
});
