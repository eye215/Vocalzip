// Disposable PostgreSQL only. Exercises real transactions, RLS and existing 2-session SQL.
// This suite never uses production credentials and refuses nonlocal DB URLs.
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const URL_=process.env.VZ_MEDIA_VERSION_TEST_DB,skip=!URL_;
if(URL_&&!['localhost','127.0.0.1','[::1]'].includes(new URL(URL_).hostname))throw Error('local disposable database required');
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',D='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const base=id=>({categories:[],songs:id?[{id,title:id}]:[],lessons:[],assignments:[],practices:[]});
let admin,db,name,conn,mf;
const rpcTrace=[];
const shared='isolated-media-version-secret-never-production-32',jwtSecret='isolated-media-jwt-secret-never-production';
const mediaProposal=readFileSync(new URL('../supabase/proposals/20261116_media_version_guard.sql',import.meta.url),'utf8');
const publicationProposal=readFileSync(new URL('../supabase/proposals/20261117_media_publication.sql',import.meta.url),'utf8');
const require=createRequire(import.meta.url);
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
const rollout=readFileSync(new URL('../supabase/proposals/20261115_snapshot_rollout.sql',import.meta.url),'utf8');
before(async()=>{
 if(skip)return;
 admin=new pg.Client({connectionString:URL_});await admin.connect();name='vzip_media_versions_'+Date.now();await admin.query('create database '+name);
 conn=URL_.replace(/\/[^/]*$/,'/'+name);db=new pg.Client({connectionString:conn});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
 await db.query(String.raw`
 create schema extensions;
 create extension pgcrypto with schema extensions;
 create schema vault;
 create table vault.decrypted_secrets(name text primary key,decrypted_secret text not null);
 create schema storage;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner uuid);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;
 grant select,insert,update,delete on storage.objects to authenticated;
 create schema auth;
 create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
 create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated;
 create policy own_storage on storage.objects for all to authenticated using(owner=auth.uid()) with check(owner=auth.uid());

 create table public.vocal_data(user_id uuid primary key references auth.users(id) on delete cascade,payload jsonb not null,updated_at timestamptz not null);
 alter table public.vocal_data enable row level security;
 grant select,insert,update,delete on public.vocal_data to authenticated;
 create policy own on public.vocal_data for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create table public.vocal_media(id text primary key,user_id uuid,metadata jsonb,updated_at timestamptz);
 alter table public.vocal_media enable row level security;
 grant select,insert,update,delete on public.vocal_media to authenticated;
 create policy own_media on public.vocal_media for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create table public.vocal_billing_documents(user_id uuid primary key,payload jsonb,previous_payload jsonb,previous_revision bigint,updated_at timestamptz);
 create function public.vocal_billing_save(bigint,jsonb,uuid) returns jsonb language sql as $$select $2$$;
 create function public.vzip_enqueue_my_media() returns integer language sql as $$select 0$$;
 create function public.vzip_song_stt_reserve() returns boolean language sql as $$select false$$;
 create function public.vzip_song_stt_usage() returns table(used_total integer,used_today integer) language sql as $$select 0,0$$;
 `);
 await db.query('insert into vault.decrypted_secrets values($1,$2)',['vzip_media_version_secret',shared]);
 await db.query('insert into auth.users values ($1),($2)',[U,V]);
 const legacy=base('legacy-id-not-uuid');await db.query("insert into public.vocal_data values($1,$2,'2099-01-01T00:00:00Z')",[U,legacy]);
 await db.query(history);await db.query(sessions);await db.query(proposal);await db.query(proposal);
 const row=(await db.query('select payload,revision from public.vocal_data where user_id=$1',[U])).rows[0];
 assert.deepEqual(row.payload,legacy);assert.equal(row.revision,'0');
 // First update of a legacy future-clock row must also advance the real DB token.
 await db.query("update public.vocal_data set payload=payload,revision=999999,updated_at='1900-01-01' where user_id=$1",[U]);
 assert.equal((await db.query("select revision,updated_at>'2099-01-01T00:00:00Z'::timestamptz advanced from public.vocal_data where user_id=$1",[U])).rows[0].advanced,true);
 assert.equal((await db.query('select revision from public.vocal_data where user_id=$1',[U])).rows[0].revision,'1');
 const prior=(await db.query('select payload,revision,generation,updated_at::text from public.vocal_data')).rows;
 await db.query(rollout);await db.query(rollout);
 assert.deepEqual((await db.query('select payload,revision,generation,updated_at::text from public.vocal_data')).rows,prior);
 assert.equal((await db.query('select count(*) from public.vzip_snapshot_rollout')).rows[0].count,'0');
 const preserved=(await db.query('select payload,revision,generation,updated_at::text from public.vocal_data')).rows;
 await db.query(mediaProposal);await db.query(mediaProposal);
 await db.query(publicationProposal);await db.query(publicationProposal);
 assert.deepEqual((await db.query('select payload,revision,generation,updated_at::text from public.vocal_data')).rows,preserved);
 assert.equal((await db.query('select count(*) n from public.vzip_media_delete_guards')).rows[0].n,'0');
 await bootWorker();
});
beforeEach(async()=>{
 if(skip)return;
 await db.query('truncate public.vzip_media_publications,storage.objects,public.vzip_media_delete_requests,public.vzip_media_delete_guards,public.vocal_media,public.vzip_snapshot_rollout,public.vzip_data_write_requests,public.vocal_data,public.vzip_device_sessions,public.vzip_account_session_state,public.vocal_history');
 await db.query('insert into vault.decrypted_secrets values($1,$2) on conflict(name) do update set decrypted_secret=excluded.decrypted_secret',['vzip_media_version_secret',shared]);
 await db.query('delete from auth.sessions');
 for(const s of [A,B,D])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[s,U]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[C,V]);
 await db.query('update public.vzip_session_rollout set enforced=true');
 for(const [u,s] of [[U,A],[U,B],[V,C]])assert.equal((await register(u,s)).status,'active');
});
after(async()=>{
 if(skip)return;await mf?.dispose();await db?.end();
 if(admin){if(name)await admin.query('drop database if exists '+name);await admin.end()}
});


const version='dddddddd-dddd-4ddd-8ddd-dddddddddddd',id='voice',key='u/'+U+'/'+id+'/'+version+'/original.wav';
const rootHash='a'.repeat(64),stamp='2026-11-10T00:00:00.123456Z';
const sign=text=>createHmac('sha256',shared).update(text).digest('hex');
const objectText=d=>['vzip-media-object-v1','1',d.owner,d.id,d.key,d.version,String(d.size),d.type,d.root,d.etag].join('\n');
async function seed({owner=U,mediaId=id,objectKey=key,objectVersion=version,size=3,root=rootHash,etag='"fixture"',marked=true}={}){
 const payload={...base('song'),lessons:[{id:'lesson',memo:'keep lesson note',recordings:[{id:'other'}]}],practices:[{id:'practice',manualMinutes:17,mediaIds:['other']}],...(marked?{deleted:{media:[mediaId]}}:{})};
 await db.query('insert into public.vocal_data(user_id,payload) values($1,$2)',[owner,payload]);
 await db.query('insert into public.vocal_media values($1,$2,$3,$4)',[mediaId,owner,{id:mediaId,storageProvider:'r2',r2Key:objectKey,size},stamp]);
 await db.query("select public.vzip_set_snapshot_mode($1,'revision')",[owner]);
 return {owner,id:mediaId,key:objectKey,version:objectVersion,size,type:'audio/wav',root,etag,at:stamp,request:randomUUID()};
}
const prepare=(d,owner=d.owner,sid=A,extra={})=>{
 d={...d,...extra};return as(owner,sid,async c=>(await c.query('select public.vzip_prepare_media_delete($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r',
 [d.request,d.id,d.key,d.version,d.at,d.size,d.type,d.root,d.etag,extra.signature??sign(objectText(d))])).rows[0].r);
};
const status=(request,owner=U,sid=A)=>as(owner,sid,async c=>(await c.query('select public.vzip_media_delete_status($1) r',[request])).rows[0].r);
const finish=(r,signature=sign(['vzip-media-deleted-v1',r.user_id,r.session_id,r.request_id,r.object_key,r.object_version].join('\n')),owner=U,sid=A)=>
 as(owner,sid,async c=>(await c.query('select public.vzip_finish_media_delete($1,$2) r',[r.request_id,signature])).rows[0].r);
const count=table=>db.query('select count(*) n from public.'+table).then(r=>Number(r.rows[0].n));
test('server mode is owner-scoped; legacy and paused accounts cannot prepare deletion',{skip},async()=>{
 const d=await seed();assert.equal((await as(U,A,c=>c.query('select public.vzip_media_mutation_context() r'))).rows[0].r.mode,'revision');
 assert.equal((await as(V,C,c=>c.query('select public.vzip_media_mutation_context() r'))).rows[0].r.mode,'legacy');
 await assert.rejects(prepare(d,V,C),{code:'42501'});await db.query("select public.vzip_set_snapshot_mode($1,'paused')",[U]);
 await assert.rejects(prepare(d),{code:'42501'});assert.equal(await count('vzip_media_delete_requests'),0);
});
test('prepare persists one minimal guard and receipt without deleting metadata or user notes',{skip},async()=>{
 const d=await seed(),r=await prepare(d);assert.equal(r.state,'reserved');assert.equal(r.expected_updated_at,stamp);
 assert.equal(await count('vocal_media'),1);assert.equal(await count('vzip_media_delete_guards'),1);
 const body=(await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload;
 assert.equal(body.lessons[0].memo,'keep lesson note');assert.equal(body.practices[0].manualMinutes,17);
 assert.ok(!JSON.stringify((await db.query('select to_jsonb(r) j from public.vzip_media_delete_requests r')).rows).includes('keep lesson note'));
 assert.deepEqual(await prepare(d),r);
});
test('unsigned or cross-purpose attestations cannot authorize an original',{skip},async()=>{
 const d=await seed();await assert.rejects(prepare(d,U,A,{signature:'0'.repeat(64)}),{code:'42501'});
 await assert.rejects(prepare(d,U,A,{signature:sign('vzip-media-delete-v1\nunrelated')}),{code:'42501'});
 assert.equal(await count('vzip_media_delete_guards'),0);
});
test('a confirmed array tombstone and cleared recording references are required',{skip},async()=>{
 const d=await seed({marked:false});await assert.rejects(prepare(d),{code:'55000'});
 const payload={...base(),deleted:{media:{[id]:true}}};await db.query('update public.vocal_data set payload=$1 where user_id=$2',[payload,U]);
 await assert.rejects(prepare(d),{code:'55000'});
 payload.deleted.media=[id];payload.practices=[{id:'p',mediaIds:[id]}];await db.query('update public.vocal_data set payload=$1 where user_id=$2',[payload,U]);
 await assert.rejects(prepare(d),{code:'55000'});assert.equal(await count('vzip_media_delete_guards'),0);
});
test('a different metadata version or legacy fixed path cannot be reserved',{skip},async()=>{
 const d=await seed();await assert.rejects(prepare(d,U,A,{at:'2026-11-10T00:00:00.123457Z'}),{code:'40001'});
 await assert.rejects(prepare(d,U,A,{key:'u/'+U+'/'+id+'/original.wav'}),{code:'22023'});
 await db.query("update public.vocal_media set metadata=metadata||'{\"legacyStorage\":{\"path\":\"old\"}}'::jsonb");
 await assert.rejects(prepare(d),{code:'40001'});assert.equal(await count('vzip_media_delete_requests'),0);
});
test('direct client metadata DML is blocked only for adopted accounts',{skip},async()=>{
 const d=await seed();for(const text of ['update public.vocal_media set metadata=metadata where user_id=$1','delete from public.vocal_media where user_id=$1']){
  await assert.rejects(as(U,A,c=>c.query(text,[U])),{code:'42501'});
 }
 await as(V,C,c=>c.query("insert into public.vocal_media values('bob',$1,'{}',clock_timestamp())",[V]));
 assert.equal(await count('vocal_media'),2);
});
test('trusted old RPC-style metadata and root restoration cannot undo a deletion guard',{skip},async()=>{
 const d=await seed();await prepare(d);
 await assert.rejects(db.query("update public.vocal_media set metadata=jsonb_set(metadata,'{r2Key}',to_jsonb('new-key'::text)) where user_id=$1",[U]),{code:'55000'});
 await assert.rejects(db.query('update public.vocal_data set payload=$1 where user_id=$2',[base('restore'),U]),{code:'55000'});
 const payload=(await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload;
 payload.songs[0].repertoire={takeId:id};await assert.rejects(db.query('update public.vocal_data set payload=$1 where user_id=$2',[payload,U]),{code:'55000'});
});
test('client cannot claim physical deletion; only a separate Worker completion proof finishes metadata',{skip},async()=>{
 const d=await seed(),r=await prepare(d);await assert.rejects(finish(r,sign(objectText(d))),{code:'42501'});
 assert.equal(await count('vocal_media'),1);assert.equal((await status(d.request)).state,'reserved');
 const done=await finish(r);assert.equal(done.state,'deleted');assert.equal(await count('vocal_media'),0);
 assert.deepEqual(await finish(done),done);
 await assert.rejects(db.query('insert into public.vocal_media values($1,$2,$3,$4)',[id,U,{storageProvider:'r2',r2Key:key,size:3},stamp]),{code:'55000'});
});
test('request IDs cannot be replayed by another session or with changed input',{skip},async()=>{
 const d=await seed();await prepare(d);await assert.rejects(prepare(d,U,B),{code:'22023'});
 await assert.rejects(prepare(d,U,A,{size:4}),{code:'22023'});await assert.rejects(status(d.request,U,B),{code:'42501'});
 await assert.rejects(status(d.request,V,C),{code:'42501'});
});
test('revocation and pausing refuse status/completion without metadata deletion',{skip},async()=>{
 const d=await seed(),r=await prepare(d);await as(U,A,c=>c.query('select public.vzip_release_session()'));
 await assert.rejects(status(d.request),{code:'42501'});assert.equal(await count('vocal_media'),1);
 await db.query("select public.vzip_set_snapshot_mode($1,'paused')",[U]);await assert.rejects(finish(r,undefined,U,B),{code:'42501'});
});
test('deleted IDs cannot upload again and ordinary input remains editable with the tombstone',{skip},async()=>{
 const d=await seed();await prepare(d);
 assert.equal((await as(U,A,c=>c.query('select public.vzip_media_upload_allowed($1) r',[id]))).rows[0].r,false);
 assert.equal((await as(U,A,c=>c.query("select public.vzip_media_upload_allowed('different') r"))).rows[0].r,true);
 const payload=(await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload;payload.lessons[0].memo='new unrelated note';
 const row=(await db.query('select revision,generation from public.vocal_data where user_id=$1',[U])).rows[0];
 assert.equal((await save(U,A,row.revision,payload,randomUUID(),db,row.generation)).status,'saved');
 assert.equal((await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload.lessons[0].memo,'new unrelated note');
});
test('private proof keys and ledgers have no direct client privileges',{skip},async()=>{
 await seed();
 for(const text of ['select * from vault.decrypted_secrets','select * from public.vzip_media_delete_guards','select * from public.vzip_media_delete_requests',"select public.vzip_media_check_proof('x','y')"]){
  await assert.rejects(as(U,A,c=>c.query(text)),{code:'42501'});
 }
 await db.query('delete from vault.decrypted_secrets');await assert.rejects(prepare(await currentDescriptor()),{code:'55000'});
});
async function currentDescriptor(){
 const row=(await db.query('select metadata from public.vocal_media where user_id=$1',[U])).rows[0];
 return {owner:U,id,key:row.metadata.r2Key,version,size:3,type:'audio/wav',root:rootHash,etag:'"fixture"',at:stamp,request:randomUUID()};
}

async function bootWorker(){
 const workerRequire=createRequire(new URL('../r2-worker/package.json',import.meta.url)),{Miniflare}=await import(workerRequire.resolve('miniflare'));
 mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('../r2-worker/src/index.js',import.meta.url)),compatibilityDate:'2025-01-01',r2Buckets:['MEDIA'],
  bindings:{SUPABASE_URL:'https://media-db.test',SUPABASE_ANON_KEY:'public-fixture',SUPABASE_JWT_SECRET:jwtSecret,SIGNING_SECRET:jwtSecret,SESSION_GUARD_ENABLED:'true',UPLOADS_V2_ENABLED:'true',MEDIA_VERSION_GUARD_ENABLED:'true',MEDIA_VERSION_SECRET:shared},
  outboundService:async request=>{
   const body=await request.json(),name=new URL(request.url).pathname.split('/').at(-1),jwt=request.headers.get('authorization').split(' ')[1],claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'));
   rpcTrace.push(name);
   const connection=new pg.Client({connectionString:conn});await connection.connect();
   try{
    const result=await as(claims.sub,claims.session_id,async c=>{
     if(name==='vzip_session_context')return (await c.query('select public.vzip_session_context() r')).rows[0].r;
     if(name==='vzip_media_mutation_context')return (await c.query('select public.vzip_media_mutation_context() r')).rows[0].r;
     if(name==='vzip_media_upload_allowed')return (await c.query('select public.vzip_media_upload_allowed($1) r',[body.p_media_id])).rows[0].r;
     if(name==='vzip_publish_media')return (await c.query('select public.vzip_publish_media($1,$2,$3,$4,$5,$6) r',[body.p_request_id,body.p_metadata_text,body.p_version,body.p_root,body.p_etag,body.p_signature])).rows[0].r;
     if(name==='vzip_prepare_media_delete')return (await c.query('select public.vzip_prepare_media_delete($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r',[body.p_request_id,body.p_media_id,body.p_key,body.p_version,body.p_expected_updated_at,body.p_size,body.p_type,body.p_root,body.p_etag,body.p_signature])).rows[0].r;
     if(name==='vzip_media_delete_status')return (await c.query('select public.vzip_media_delete_status($1) r',[body.p_request_id])).rows[0].r;
     if(name==='vzip_finish_media_delete')return (await c.query('select public.vzip_finish_media_delete($1,$2) r',[body.p_request_id,body.p_signature])).rows[0].r;
     throw Error('unlisted RPC');
    },connection);
    return Response.json(result);
   }catch(e){rpcTrace.push(name+':'+e.code);return Response.json({code:e.code},{status:e.code==='42501'?403:e.code==='40001'||e.code==='55000'?409:400});}
   finally{await connection.end();}
  }});
}
function jwt(owner=U,sid=A){
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),text=enc({alg:'HS256'})+'.'+enc({sub:owner,session_id:sid,role:'authenticated',iss:'https://media-db.test/auth/v1',exp:Math.floor(Date.now()/1000)+3600});
 return text+'.'+createHmac('sha256',jwtSecret).update(text).digest('base64url');
}
async function call(path,{body,method=body?'POST':'GET'}={}){
 const headers={authorization:'Bearer '+jwt(),'x-client-info':'vocalzip-device-session-v2'};
 if(body instanceof Blob)body=new Uint8Array(await body.arrayBuffer());
 if(body instanceof Uint8Array)headers['content-length']=String(body.length);
 else if(body!==undefined){body=JSON.stringify(body);headers['content-type']='application/json';}
 return mf.dispatchFetch('https://media.test'+path,{method,headers,body});
}
async function original(mediaId,bytes){
 const client=require('../r2-resumable-upload.js'),file=new File([bytes],'voice.wav',{type:'audio/wav'}),manifest=await client.inspect(file),levels=await client.tree(manifest);
 const start=await call('/v2/uploads',{body:{mediaId,contentType:'audio/wav',size:file.size,ext:'wav',root:manifest.root}});
 assert.equal(start.status,200,(await start.clone().text())+' RPC names: '+rpcTrace.join(','));const upload=await start.json(),parts=[];
 // Use the exact signed upload and Merkle proof headers for the real R2 multipart part.
 const part=await mf.dispatchFetch('https://media.test/v2/uploads/parts/1',{method:'PUT',headers:{authorization:'Bearer '+jwt(),'x-client-info':'vocalzip-device-session-v2','x-vzip-upload':JSON.stringify({descriptor:upload.descriptor,signature:upload.signature}),'x-vzip-proof':client.proof(levels,0).join(','),'content-length':String(bytes.length)},body:bytes});
 assert.equal(part.status,200,await part.clone().text());parts.push(await part.json());
 const ticket={descriptor:upload.descriptor,signature:upload.signature},done=await call('/v2/uploads/complete',{body:{upload:ticket,parts}});
 assert.equal(done.status,200,await done.clone().text());return {done:await done.json(),ticket,parts};
}
test('real Miniflare R2 and SQL delete an old attempt while retaining a newer attempt and all notes',{skip,timeout:60000},async()=>{
 const one=await original('actual-old',new Uint8Array([1,2,3])),two=await original('actual-old',new Uint8Array([7,8,9]));
 const d=await seed({mediaId:'actual-old',objectKey:one.done.key,objectVersion:one.ticket.descriptor.attempt,size:3,root:one.done.root,etag:one.done.etag});
 const prep=await call('/v2/media/delete/prepare',{body:{requestId:d.request,mediaId:d.id,key:d.key,updatedAt:d.at,size:d.size}});
 assert.equal(prep.status,200,await prep.clone().text());const {ticket}=await prep.json();
 const done=await call('/v2/media/delete/commit',{body:{ticket}});assert.equal(done.status,200,await done.clone().text());
 const bucket=await mf.getR2Bucket('MEDIA');assert.equal(await bucket.head(one.done.key),null);
 assert.deepEqual(new Uint8Array(await(await bucket.get(two.done.key)).arrayBuffer()),new Uint8Array([7,8,9]));
 assert.equal(await count('vocal_media'),0);assert.equal((await db.query('select payload from public.vocal_data where user_id=$1',[U])).rows[0].payload.lessons[0].memo,'keep lesson note');
 assert.equal((await call('/v2/media/delete/commit',{body:{ticket}})).status,200);
 assert.equal((await call('/v2/uploads/complete',{body:{upload:one.ticket,parts:one.parts}})).status,409);
 assert.equal(await bucket.head(one.done.key),null);
});
test('a newly published metadata version makes the old delete request fail before physical deletion',{skip,timeout:60000},async()=>{
 const one=await original('actual-change',new Uint8Array([1,2,3])),two=await original('actual-change',new Uint8Array([9,8,7]));
 const d=await seed({mediaId:'actual-change',objectKey:one.done.key,objectVersion:one.ticket.descriptor.attempt,size:3,root:one.done.root,etag:one.done.etag});
 await db.query("update public.vocal_media set metadata=jsonb_set(metadata,'{r2Key}',to_jsonb($1::text)),updated_at=clock_timestamp() where id=$2",[two.done.key,d.id]);
 const response=await call('/v2/media/delete/prepare',{body:{requestId:d.request,mediaId:d.id,key:d.key,updatedAt:d.at,size:3}});
 assert.equal(response.status,409);assert.ok(rpcTrace.includes('vzip_prepare_media_delete:40001'));const bucket=await mf.getR2Bucket('MEDIA');
 assert.ok(await bucket.head(one.done.key));assert.deepEqual(new Uint8Array(await(await bucket.get(two.done.key)).arrayBuffer()),new Uint8Array([9,8,7]));assert.equal(await count('vzip_media_delete_requests'),0);
});

test('old Supabase storage writes cannot bypass the guard; reads and other accounts/buckets remain available',{skip},async()=>{
 await seed();
 await db.query("insert into storage.objects(bucket_id,name,owner) values('vocal-recordings','old-original',$1)",[U]);
 assert.equal((await as(U,A,c=>c.query("select * from storage.objects where bucket_id='vocal-recordings'"))).rowCount,1);
 assert.equal((await as(U,A,c=>c.query("delete from storage.objects where bucket_id='vocal-recordings'"))).rowCount,0);
 assert.equal((await as(U,A,c=>c.query("update storage.objects set name='changed' where bucket_id='vocal-recordings'"))).rowCount,0);
 await assert.rejects(as(U,A,c=>c.query("insert into storage.objects(bucket_id,name,owner) values('vocal-recordings','new',$1)",[U])),{code:'42501'});
 await as(U,A,c=>c.query("insert into storage.objects(bucket_id,name,owner) values('other-bucket','ok',$1)",[U]));
 await as(V,C,c=>c.query("insert into storage.objects(bucket_id,name,owner) values('vocal-recordings','legacy-ok',$1)",[V]));
 assert.equal((await as(V,C,c=>c.query("delete from storage.objects where name='legacy-ok'"))).rowCount,1);
 assert.equal((await db.query("select count(*) n from storage.objects where name='old-original'")).rows[0].n,'1');
});


const publicationMetadata=()=>({id:'publish-voice',name:'처음 제목',songId:'song',recordedDate:'2026-11-10',review:'원래 메모',
 storageProvider:'r2',r2Key:'u/'+U+'/publish-voice/'+version+'/original.wav',r2Etag:'"fixture"',size:3,type:'audio/wav'});
async function publicationAccount(){
 await db.query('insert into public.vocal_data(user_id,payload) values($1,$2)',[U,base('song')]);
 await db.query("select public.vzip_set_snapshot_mode($1,'revision')",[U]);
}
function publicationArgs(metadata=publicationMetadata(),request=version,sid=A,overrides={}){
 const text=JSON.stringify(metadata);
 const digest=require('node:crypto').createHash('sha256').update(text).digest('hex');
 const proof=['vzip-media-publish-v1','1',U,sid,request,metadata.id,metadata.r2Key,version,String(metadata.size),metadata.type,rootHash,metadata.r2Etag,digest].join('\n');
 return {request,text,version,root:rootHash,etag:metadata.r2Etag,signature:sign(proof),...overrides};
}
const publishSQL=(p,owner=U,sid=A)=>as(owner,sid,async c=>(await c.query(
 'select public.vzip_publish_media($1,$2,$3,$4,$5,$6) r',[p.request,p.text,p.version,p.root,p.etag,p.signature])).rows[0].r);
test('publication inserts a verified original once without changing root or copying notes into its ledger',{skip},async()=>{
 await publicationAccount();const before=(await db.query('select payload,revision from public.vocal_data')).rows;
 const result=await publishSQL(publicationArgs());assert.deepEqual(result.metadata,publicationMetadata());assert.equal(result.request_id,version);
 assert.deepEqual((await db.query('select payload,revision from public.vocal_data')).rows,before);
 const receipt=(await db.query('select * from public.vzip_media_publications')).rows[0];
 assert.equal(JSON.stringify(receipt).includes('원래 메모'),false);assert.equal(await count('vocal_media'),1);
 assert.equal((await publishSQL(publicationArgs())).updated_at,result.updated_at);
});
test('publication retry preserves a newer title/date/song edit and refuses different input or login reuse',{skip},async()=>{
 await publicationAccount();const args=publicationArgs();await publishSQL(args);
 await db.query("update public.vocal_media set metadata=metadata||$1,updated_at=clock_timestamp()",[{name:'다른 기기 제목',recordedDate:'2026-11-11',songId:'other',review:'새 메모'}]);
 const retry=await publishSQL(args);assert.equal(retry.metadata.name,'다른 기기 제목');assert.equal(retry.metadata.review,'새 메모');
 await assert.rejects(publishSQL(publicationArgs({...publicationMetadata(),name:'changed'})),e=>e.code==='40001');
 await assert.rejects(publishSQL(publicationArgs(publicationMetadata(),version,B),U,B),e=>e.code==='40001');
});
test('publication proof binds the full metadata, session and purpose and is inaccessible without a valid server proof',{skip},async()=>{
 await publicationAccount();const p=publicationArgs();
 for(const changed of [{...p,text:JSON.stringify({...publicationMetadata(),name:'tampered'})},{...p,signature:'0'.repeat(64)},{...p,signature:sign('vzip-media-deleted-v1')}]){
  await assert.rejects(publishSQL(changed),e=>e.code==='42501');
 }
 await assert.rejects(as(V,C,c=>c.query('select * from public.vzip_media_publications')),e=>e.code==='42501');
 assert.equal(await count('vocal_media'),0);assert.equal(await count('vzip_media_publications'),0);
});
test('a different original or another account ID cannot be overwritten by publication',{skip},async()=>{
 await publicationAccount();const m=publicationMetadata();
 await db.query('insert into public.vocal_media values($1,$2,$3,clock_timestamp())',[m.id,U,{...m,r2Key:m.r2Key.replace(version,A)}]);
 await assert.rejects(publishSQL(publicationArgs()),e=>e.code==='40001');
 await db.query('delete from public.vocal_media');
 await db.query('insert into public.vocal_media values($1,$2,$3,clock_timestamp())',[m.id,V,{id:m.id,name:'private other account'}]);
 await assert.rejects(publishSQL(publicationArgs()),e=>e.code==='40001');
 assert.equal(await count('vzip_media_publications'),0);
 assert.equal((await db.query('select metadata from public.vocal_media')).rows[0].metadata.name,'private other account');
});
test('publication rejects deleted IDs, malformed tombstones and paused/revoked/legacy accounts',{skip},async()=>{
 await publicationAccount();const p=publicationArgs(),id=publicationMetadata().id;
 for(const marker of [[id],{[id]:true}]){
  await db.query('update public.vocal_data set payload=payload||$1',[{deleted:{media:marker}}]);
  await assert.rejects(publishSQL(p),e=>e.code==='55000');
 }
 await db.query('update public.vocal_data set payload=$1',[base('song')]);
 await db.query("select public.vzip_set_snapshot_mode($1,'paused')",[U]);
 await assert.rejects(publishSQL(p),e=>e.code==='42501');
 await db.query("select public.vzip_set_snapshot_mode($1,'revision')",[U]);
 await as(U,A,c=>c.query('select public.vzip_release_session()'));
 await assert.rejects(publishSQL(p),e=>e.code==='42501');
 await assert.rejects(publishSQL(publicationArgs(),V,C),e=>e.code==='42501');
 assert.equal(await count('vocal_media'),0);
});
test('publication refuses legacy paths, alternate storage pointers, invalid descriptors and oversized input',{skip},async()=>{
 await publicationAccount();const m=publicationMetadata();
 for(const bad of [{...m,r2Key:m.r2Key.replace('/'+version,'')},{...m,path:'legacy/file'},{...m,blob:'bytes'},{...m,size:0},{...m,type:'video/mp4'},{...m,r2Root:'b'.repeat(64)},{...m,name:'x'.repeat(16000)}]){
  await assert.rejects(publishSQL(publicationArgs(bad)),e=>['22023','42501'].includes(e.code));
 }
 assert.equal(await count('vocal_media'),0);
});
test('real Worker HEAD and SQL publish only completed immutable audio; replay keeps later edits',{skip,timeout:60000},async()=>{
 await publicationAccount();
 const upload=await original('published-e2e',new Uint8Array([4,5,6])),d=upload.ticket.descriptor;
 const metadata={...publicationMetadata(),id:d.mediaId,r2Key:d.key,r2Etag:upload.done.etag,size:3};
 const body={requestId:d.attempt,metadata};
 const saved=await call('/v2/media/publish',{body});assert.equal(saved.status,200,await saved.clone().text());
 assert.deepEqual((await saved.json()).metadata,metadata);
 await db.query('update public.vocal_media set metadata=metadata||$1',[{name:'newer edit',songId:'new-song'}]);
 const again=await call('/v2/media/publish',{body});assert.equal(again.status,200);assert.equal((await again.json()).metadata.name,'newer edit');
 for(const bad of [{...metadata,size:4},{...metadata,r2Etag:'"different"'},{...metadata,r2Key:metadata.r2Key.replace(d.attempt,B)}]){
  const failed=await call('/v2/media/publish',{body:{requestId:d.attempt,metadata:bad}});assert.equal(failed.status,409,await failed.clone().text());
 }
 assert.equal(await count('vzip_media_publications'),1);
 const bucket=await mf.getR2Bucket('MEDIA');assert.deepEqual(new Uint8Array(await(await bucket.get(d.key)).arrayBuffer()),new Uint8Array([4,5,6]));
});
