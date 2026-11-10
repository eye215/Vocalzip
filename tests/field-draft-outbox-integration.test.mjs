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
const Snap=require('../sync/snapshot-transport.js'),Merge=require('../data-merge.js');
const URL_=process.env.VZ_DRAFT_TEST_DB,skip=!URL_;
if(URL_&&!['localhost','127.0.0.1','[::1]'].includes(new URL(URL_).hostname))throw Error('local disposable database required');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',D='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const base=()=>({categories:[],songs:[{id:'song-legacy',title:'keep song'}],lessons:[{id:'lesson-old-id',memo:'original memo',prepMemo:'original prep',feedback:'original feedback',recordings:[{id:'keep-media'}]},{id:'lesson-other',memo:'other lesson'}],assignments:[{id:'homework-old',lessonId:'lesson-old-id'}],practices:[{id:'practice-old',manualMinutes:12}],performances:[{id:'show-old'}],deleted:{lessons:[]}});
let admin,db,name,conn;
const proposal=readFileSync(new URL('../supabase/proposals/20261113_snapshot_revision.sql',import.meta.url),'utf8');
const drafts=readFileSync(new URL('../supabase/proposals/20261114_field_drafts.sql',import.meta.url),'utf8');
const sessions=readFileSync(new URL('../supabase/migrations/20261112_device_session_contract.sql',import.meta.url),'utf8');
const withSnapshotRollout=process.env.VZIP_WITH_SNAPSHOT_ROLLOUT==='1';
const snapshotRollout=withSnapshotRollout?readFileSync(new URL('../supabase/proposals/20261115_snapshot_rollout.sql',import.meta.url),'utf8'):null;
const withPermanentDelete=process.env.VZIP_WITH_PERMANENT_DELETE==='1';
const deletion=withPermanentDelete?readFileSync(new URL('../supabase/migrations/20261114_permanent_lesson_delete.sql',import.meta.url),'utf8'):null;
const history=readFileSync(new URL('../supabase/migrations/20261106_keep_history.sql',import.meta.url),'utf8');
async function as(u,s,fn,c=db){
 await c.query('begin');
 try{
  await c.query('set local role authenticated');
  await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers',$3,true)",[u,JSON.stringify({sub:u,session_id:s,role:'authenticated'}),JSON.stringify({'x-client-info':'vocalzip-device-session-v2'})]);
  const out=await fn(c);await c.query('commit');return out;
 }catch(e){await c.query('rollback');throw e}
}
const register=(u,s)=>as(u,s,async c=>(await c.query('select public.vzip_register_session($1,null,null) r',['test'])).rows[0].r);
before(async()=>{
 if(skip)return;
 admin=new pg.Client({connectionString:URL_});await admin.connect();name='vzip_outbox_integration_'+Date.now();await admin.query('create database '+name);
 conn=URL_.replace(/\/[^/]*$/,'/'+name);db=new pg.Client({connectionString:conn});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
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
 await db.query(history);await db.query(sessions);await db.query(proposal);await db.query(proposal);await db.query(drafts);await db.query(drafts);if(snapshotRollout){await db.query(snapshotRollout);await db.query(snapshotRollout);}if(deletion){await db.query(deletion);await db.query(deletion);}
 const row=(await db.query('select payload,revision from public.vocal_data where user_id=$1',[U])).rows[0];
 assert.deepEqual(row.payload,legacy);assert.equal(row.revision,'0');

});
beforeEach(async()=>{
 if(skip)return;
 await db.query('truncate public.vzip_field_draft_rollout,public.vzip_field_commit_markers,public.vzip_field_conflicts,public.vzip_field_requests,public.vzip_field_drafts,public.vzip_data_write_requests,public.vocal_data,public.vzip_device_sessions,public.vzip_account_session_state,public.vocal_history');
 if(snapshotRollout)await db.query('truncate public.vzip_snapshot_rollout');
 if(deletion)await db.query('truncate public.vzip_permanent_delete_guards');
 await db.query('delete from auth.sessions');
 await db.query('insert into auth.users values ($1),($2) on conflict do nothing',[U,V]);
 for(const s of [A,B,D])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[s,U]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[C,V]);
 await db.query('update public.vzip_session_rollout set enforced=true');
 for(const [u,s] of [[U,A],[U,B],[V,C]])assert.equal((await register(u,s)).status,'active');
 for(const u of [U,V]){await db.query('select public.vzip_set_field_draft_enabled($1,true)',[u]);if(snapshotRollout)await db.query("select public.vzip_set_snapshot_mode($1,'revision')",[u]);}
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
 removeItem(k){this.rows.delete(k);}
 setItem(k,v){if(this.failNext){this.failNext=false;throw Error('quota failure');}this.rows.set(k,v);}
 key(i){return [...this.rows.keys()][i]??null;}
 get length(){return this.rows.size;}
}
const jwt=(u,s)=>'test.'+Buffer.from(JSON.stringify({sub:u,session_id:s,role:'authenticated'})).toString('base64url')+'.synthetic-signature';
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

function snapshotDevice({owner=U,session=A,store=new Store(),getLocal=null,onAck=()=>{}}={}){
 const identity={owner,session},wire={lost:false,calls:0};
 const transport=Snap.createTransport({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test',
  getOwner:()=>identity.owner,getSessionId:()=>identity.session,getCredentials:async()=>jwt(identity.owner,identity.session),
  fetch:async(url,options)=>{
   wire.calls++;if(options.method==='POST')await wire.beforeSave?.();const path=new URL(url),claims=JSON.parse(Buffer.from(options.headers.Authorization.split(' ')[1].split('.')[1],'base64url').toString());
   assert.equal(options.headers['X-Client-Info'],'vocalzip-device-session-v2');
   const connection=new pg.Client({connectionString:conn});await connection.connect();
   let data;
   try{
    data=await as(claims.sub,claims.session_id,async c=>{
     if(options.method==='GET'){
      assert.equal(path.searchParams.get('user_id'),'eq.'+claims.sub);
      return (await c.query('select user_id,payload,updated_at::text updated_at,revision::text revision,generation from public.vocal_data where user_id=$1',[claims.sub])).rows;
     }
     assert.equal(path.pathname,'/rest/v1/rpc/vzip_save_snapshot');const q=JSON.parse(options.body);
     return (await c.query('select public.vzip_save_snapshot($1,$2,$3,$4) r',[q.p_expected_revision,q.p_payload,q.p_request_id,q.p_expected_generation])).rows[0].r;
    },connection);
   }catch(e){return {ok:false,status:e.code==='42501'?403:400,json:async()=>({code:e.code})};}
   finally{await connection.end();}
   if(options.method==='POST')await wire.afterSave?.();
   if(options.method==='POST'&&wire.lost){wire.lost=false;throw Error('synthetic response loss');}
   return {ok:true,status:200,json:async()=>structuredClone(data)};
  }});
 const options={storage:store,identity:()=>identity,...transport,getLocal,onAck,lock:async work=>work(),valid:Merge.valid,same:Merge.same,
  deletedIds:()=>wire.deleted||[],redact:(data,ids)=>{for(const id of ids)Merge.deleteLesson(data,id);return data;},
  deletedMediaIds:()=>wire.deletedMedia||[],redactMedia:(data,ids)=>{for(const id of ids)Merge.deleteMedia(data,id);return data;}};
 return {model:Snap.create(options),recreate:()=>Snap.create(options),wire,store};
}
test('snapshot bridge replays one durable request after a real SQL commit loses its HTTP response',{skip,timeout:20000},async()=>{
 const d=snapshotDevice(),row=await d.model.read();await d.model.observe(row,base());const value=base();value.practices.push({id:'late-practice',manualMinutes:25});
 d.wire.lost=true;await assert.rejects(d.model.write(row,value));const pending=d.model.state().pending;
 await d.recreate().recover();
 assert.equal((await db.query('select revision from public.vocal_data where user_id=$1',[U])).rows[0].revision,'2');
 assert.equal((await db.query('select count(*) n from public.vzip_data_write_requests where user_id=$1',[U])).rows[0].n,'1');
 assert.equal((await body()).practices[1].manualMinutes,25);assert.equal(d.model.state().pending,null);assert.ok(pending.id);
});
test('snapshot bridge preserves both sides of two registered sessions instead of silently merging a conflict',{skip,timeout:20000},async()=>{
 const a=snapshotDevice(),b=snapshotDevice({session:B}),first=await a.model.read();await a.model.observe(first,base());await b.model.observe(first,base());
 const phone=base(),tablet=base();phone.lessons[0].memo='phone confirmed';tablet.lessons[0].memo='tablet unsent';
 await a.model.write(first,phone);await assert.rejects(b.model.write(first,tablet),e=>e.code==='conflict');
 assert.equal((await body()).lessons[0].memo,'phone confirmed');assert.equal(b.model.state().pending.payload.lessons[0].memo,'tablet unsent');
 assert.equal((await db.query('select revision from public.vocal_data where user_id=$1',[U])).rows[0].revision,'2');
});
test('snapshot bridge respects protected field leases and retains the blocked payload',{skip,timeout:20000},async()=>{
 const field=device(api());await field.open();
 const d=snapshotDevice(),row=await d.model.read();await d.model.observe(row,base());const value=base();value.lessons[0].memo='unversioned raw change';
 await assert.rejects(d.model.write(row,value));
 assert.equal((await body()).lessons[0].memo,'original memo');assert.equal(d.model.state().pending.payload.lessons[0].memo,'unversioned raw change');
 assert.equal((await db.query('select count(*) n from public.vzip_data_write_requests where user_id=$1',[U])).rows[0].n,'0');
});
test('snapshot bridge deletion removes pending lesson text without losing unrelated input or restoring a SQL-deleted lesson',{skip:skip||!withPermanentDelete,timeout:20000},async()=>{
 const d=snapshotDevice(),row=await d.model.read();await d.model.observe(row,base());const value=base();value.lessons[0].feedback='private unsent feedback';value.practices.push({id:'keep-unrelated',manualMinutes:25});
 d.wire.lost=true;await assert.rejects(d.model.write(row,value));await permanentDelete();
 await d.model.redactLessons([S.entityId]);const state=d.model.state();
 assert.ok(!JSON.stringify(state).includes('private unsent feedback'));assert.equal(state.pending.payload.practices[1].manualMinutes,25);
 const calls=d.wire.calls;await assert.rejects(d.model.recover(),e=>e.code==='deleted');assert.equal(d.wire.calls,calls);
 assert.equal((await body()).lessons.some(l=>l.id===S.entityId),false);assert.equal((await body()).practices[1].manualMinutes,25);
 assert.equal((await db.query("select count(*) n from public.vocal_media where id='keep-media'")).rows[0].n,'1');
});

async function mediaOperation(d){
 await db.query("update public.vocal_media set metadata=$1,updated_at=clock_timestamp() where id='keep-media' and user_id=$2",[{id:'keep-media',storageProvider:'r2',r2Key:'u/'+U+'/keep-media/original.wav',review:'keep latest review'},U]);
 const make=core=>Snap.createMediaDeletion({storage:d.store,identity:()=>({owner:U,session:A}),lock:async work=>work(),
  read:async id=>(await db.query('select metadata,updated_at::text updated_at from public.vocal_media where user_id=$1 and id=$2',[U,id])).rows[0]||null,
  prepare:async({id,stamp})=>{
   const pending=core.state().pending;
   if(pending){assert.equal(pending.context?.kind,'media-delete');assert.equal(pending.context?.id,id);assert.equal(pending.context?.stamp,stamp);await core.recover();}
   const row=await core.read();if(row.payload.deleted?.media?.includes(id))return row;
   let value;await core.prepare(row,()=>({payload:base(),dirty:false}),()=>{value=Merge.deleteMedia(structuredClone(row.payload),id);});
   return core.write(row,value,{kind:'media-delete',id,stamp});
  },
  cleanup:async(row,guard,id)=>{
   guard();assert.ok((await body()).deleted.media.includes(id));d.wire.physical=(d.wire.physical||0)+1;
   if(row)await db.query('delete from public.vocal_media where user_id=$1 and id=$2',[U,id]);guard();
  }});
 return {model:make(d.model),recreate:()=>make(d.recreate())};
}
test('media deletion commits its revision before cleanup and keeps lease text and unrelated history',{skip,timeout:20000},async()=>{
 const field=device(api());await field.open();const text=(await serverDraft()).text_value;
 const d=snapshotDevice(),row=await d.model.read();await d.model.observe(row,base());const m=await mediaOperation(d);
 await m.model.run('keep-media');assert.equal(m.model.list()[0].phase,'cloud-complete');await m.model.acknowledge('keep-media');
 const current=await body();assert.equal(current.lessons[0].memo,'original memo');assert.deepEqual(current.lessons[0].recordings,[]);
 assert.equal(current.practices[0].manualMinutes,12);assert.equal(current.songs[0].id,'song-legacy');assert.equal((await serverDraft()).text_value,text);
 assert.equal((await db.query('select count(*) n from public.vzip_data_write_requests where user_id=$1',[U])).rows[0].n,'1');assert.deepEqual(m.model.list(),[]);
});
test('real SQL lost media-delete reply reuses the receipt before any object cleanup',{skip,timeout:20000},async()=>{
 const d=snapshotDevice(),row=await d.model.read();await d.model.observe(row,base());const m=await mediaOperation(d);d.wire.lost=true;
 await assert.rejects(m.model.run('keep-media'));assert.equal(d.wire.physical||0,0);assert.equal(d.model.state().pending.context.kind,'media-delete');
 assert.equal((await db.query("select count(*) n from public.vocal_media where id='keep-media'")).rows[0].n,'1');
 const restored=m.recreate();await restored.run('keep-media');await restored.acknowledge('keep-media');
 assert.equal(d.wire.physical,1);assert.equal((await db.query('select count(*) n from public.vzip_data_write_requests where user_id=$1',[U])).rows[0].n,'1');
 assert.equal((await body()).practices[0].manualMinutes,12);
});
test('metadata changed after a real snapshot commit prevents the destructive media step',{skip,timeout:20000},async()=>{
 const d=snapshotDevice(),row=await d.model.read();await d.model.observe(row,base());const m=await mediaOperation(d);
 d.wire.afterSave=()=>db.query("update public.vocal_media set metadata=jsonb_set(metadata,'{review}',to_jsonb('new device review'::text)),updated_at=clock_timestamp() where id='keep-media'");
 await assert.rejects(m.model.run('keep-media'),e=>e.code==='mediaChanged');assert.equal(d.wire.physical||0,0);
 assert.equal((await db.query("select metadata->>'review' r from public.vocal_media where id='keep-media'")).rows[0].r,'new device review');
 assert.equal(m.model.list()[0].phase,'root-confirmed');assert.equal((await body()).lessons[0].memo,'original memo');
});

test('reviewed recovery rebinds a real SQL lost receipt to the other active session without replaying the old id',{skip,timeout:20000},async()=>{
 let local=base();
 const a=snapshotDevice(),row=await a.model.read();await a.model.observe(row,base());
 const value=base();value.practices.push({id:'previous-login-practice',manualMinutes:19});a.wire.lost=true;
 await assert.rejects(a.model.write(row,value));const old=a.model.state().pending.id;
 local.lessons[0].memo='new login local note';
 const b=snapshotDevice({session:B,store:a.store,getLocal:()=>local,onAck:(saved,payload,meta)=>{assert.ok(meta.recovery);local=structuredClone(saved.payload);}});
 const r=await b.model.reviewRecovery();
 const chosen=Merge.merge(Merge.merge(r.device,r.pending.payload).data,r.cloud.payload).data;
 chosen.lessons[0].memo='new login local note';
 await b.model.resolveRecovery(r.reviewId,chosen,{confirmed:true});
 assert.equal(local.practices[1].manualMinutes,19);assert.equal(local.lessons[0].memo,'new login local note');
 const receipts=(await db.query('select request_id,session_id,result_revision::text from public.vzip_data_write_requests where user_id=$1 order by result_revision',[U])).rows;
 assert.equal(receipts.length,2);assert.equal(receipts[0].request_id,old);assert.equal(receipts[0].session_id,A);
 assert.notEqual(receipts[1].request_id,old);assert.equal(receipts[1].session_id,B);
 assert.equal(b.model.state().pending,null);assert.equal(b.model.state().recoveries[0].pending.id,old);
});
test('real SQL recovery of unchanged cloud content creates a fresh fence and preserves the old input',{skip,timeout:20000},async()=>{
 let local=base();local.lessons[0].memo='unconfirmed device choice';
 const a=snapshotDevice({getLocal:()=>local}),row=await a.model.read();await a.model.observe(row,local);
 const r=await a.model.reviewRecovery();
 await a.model.resolveRecovery(r.reviewId,r.cloud.payload,{confirmed:true});
 assert.equal((await body()).lessons[0].memo,'original memo');
 assert.equal(a.model.state().recoveries[0].device.lessons[0].memo,'unconfirmed device choice');
 assert.equal((await db.query('select revision::text r from public.vocal_data where user_id=$1',[U])).rows[0].r,'2');
 assert.equal((await db.query('select count(*) n from public.vzip_data_write_requests where user_id=$1',[U])).rows[0].n,'1');
});
test('revoking a session after review blocks the real SQL recovery and retains its durable inputs',{skip,timeout:20000},async()=>{
 const local=base(),d=snapshotDevice({getLocal:()=>local}),r=await d.model.reviewRecovery();
 d.wire.beforeSave=()=>as(U,A,c=>c.query('select public.vzip_release_session()'));
 await assert.rejects(d.model.resolveRecovery(r.reviewId,r.cloud.payload,{confirmed:true}),e=>e.code==='auth');
 assert.ok(d.model.state().pending);assert.equal(d.model.state().recoveries.length,1);
 assert.equal((await db.query('select count(*) n from public.vzip_data_write_requests where user_id=$1',[U])).rows[0].n,'0');
 assert.equal((await body()).lessons[0].memo,'original memo');
});
test('a real protected field lease rejects recovery without modifying the original body',{skip,timeout:20000},async()=>{
 const field=device(api());await field.open();
 const local=base(),d=snapshotDevice({getLocal:()=>local}),r=await d.model.reviewRecovery();
 const chosen=structuredClone(r.cloud.payload);chosen.lessons[0].memo='must not bypass the field lease';
 await assert.rejects(d.model.resolveRecovery(r.reviewId,chosen,{confirmed:true}));
 assert.equal((await body()).lessons[0].memo,'original memo');assert.ok(d.model.state().pending);
 assert.equal(d.model.state().recoveries[0].cloud.payload.lessons[0].memo,'original memo');
});

async function mediaResumeFixture(){
 await db.query("update public.vocal_media set metadata=$1,updated_at=clock_timestamp() where user_id=$2 and id='keep-media'",[{id:'keep-media',name:'synthetic.wav'},U]);
 const read=async()=>(await db.query("select metadata,updated_at::text updated_at from public.vocal_media where user_id=$1 and id='keep-media'",[U])).rows[0]||null;
 const metadata=await read(),stamp=await Snap.mediaStamp(metadata),a=snapshotDevice(),row=await a.model.read();await a.model.observe(row,base());
 const key='vzip_media_delete_v1:'+U+':keep-media';
 a.store.setItem(key,JSON.stringify({version:1,owner:U,session:A,id:'keep-media',stamp,phase:'prepared',createdAt:1}));
 const value=Merge.deleteMedia(structuredClone(base()),'keep-media');value.practices.push({id:'keep-unsent',manualMinutes:23});a.wire.lost=true;
 await assert.rejects(a.model.write(row,value,{kind:'media-delete',id:'keep-media',stamp}));const old=a.model.state().pending.id;
 let local=base(),physical=0;
 const b=snapshotDevice({session:B,store:a.store,getLocal:()=>local,onAck:saved=>{local=structuredClone(saved.payload);}});
 const engine=Snap.createMediaDeletion({storage:a.store,identity:()=>({owner:U,session:B}),lock:async work=>work(),read,
  prepare:()=>b.model.read(),reviewRoot:ctx=>b.model.reviewMediaRecovery(ctx),
  prepareResume:({reviewId,payload,retry})=>retry?b.model.recover():b.model.resolveRecovery(reviewId,payload,{confirmed:true}),
  cleanup:async(row,guard)=>{guard();assert.ok((await body()).deleted.media.includes('keep-media'));if(row){physical++;await as(U,B,c=>c.query("delete from public.vocal_media where user_id=$1 and id='keep-media'",[U]));}}});
 return {a,b,engine,key,old,get physical(){return physical},get local(){return local}};
}
test('real SQL media resume replaces an old-session purpose with a fresh CAS before metadata cleanup',{skip,timeout:20000},async()=>{
 const f=await mediaResumeFixture(),review=await f.engine.review('keep-media');
 const candidate=Merge.merge(Merge.merge(review.root.device,review.root.cloud.payload).data,review.root.pending.payload).data;
 await f.engine.resume(review.reviewId,candidate,{confirmed:true});
 assert.equal(f.physical,1);assert.equal(f.local.practices[1].manualMinutes,23);assert.equal(f.local.lessons[0].memo,'original memo');assert.deepEqual(f.local.lessons[0].recordings,[]);
 const receipts=(await db.query('select request_id,session_id from public.vzip_data_write_requests where user_id=$1 order by result_revision',[U])).rows;
 assert.equal(receipts.length,2);assert.equal(receipts[0].request_id,f.old);assert.equal(receipts[0].session_id,A);assert.notEqual(receipts[1].request_id,f.old);assert.equal(receipts[1].session_id,B);
 assert.equal(f.b.model.state().recoveries[0].mediaDelete.fromSession,A);assert.equal(f.engine.list()[0].phase,'cloud-complete');assert.equal(f.engine.list()[0].session,B);
 await f.engine.acknowledge('keep-media');assert.deepEqual(f.engine.list(),[]);
});
test('real SQL revoked resume cannot adopt the old intent or remove metadata',{skip,timeout:20000},async()=>{
 const f=await mediaResumeFixture(),review=await f.engine.review('keep-media'),old=f.a.store.getItem(f.key);
 f.b.wire.beforeSave=()=>as(U,B,c=>c.query('select public.vzip_release_session()'));
 const candidate=Merge.merge(review.root.device,review.root.cloud.payload).data;
 await assert.rejects(f.engine.resume(review.reviewId,candidate,{confirmed:true}),e=>e.code==='auth');
 assert.equal(f.physical,0);assert.equal(f.a.store.getItem(f.key),old);
 assert.equal((await db.query("select count(*) n from public.vocal_media where user_id=$1 and id='keep-media'",[U])).rows[0].n,'1');assert.ok(f.b.model.state().pending);
});
