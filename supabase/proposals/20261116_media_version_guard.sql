-- PROPOSAL ONLY. No installation, migration execution or account activation.
-- Requires reviewed session + snapshot revision + snapshot rollout proposals.
-- Worker MEDIA_VERSION_SECRET must match Vault vzip_media_version_secret (>=32 chars).
begin;
do $$ begin
 if to_regprocedure('public.vzip_snapshot_mode_for(uuid)') is null
 or to_regprocedure('public.vzip_session_is_active()') is null
 or to_regprocedure('extensions.hmac(bytea,bytea,text)') is null then
  raise exception 'reviewed snapshot/session contract and extensions.pgcrypto required' using errcode='55000';
 end if;
end $$;

create table if not exists public.vzip_media_delete_guards(
 user_id uuid not null references auth.users(id) on delete cascade,
 media_id text not null,
 object_key text not null,
 object_version uuid not null,
 expected_updated_at timestamptz not null,
 size bigint not null check(size>0),
 content_type text not null,
 content_root text not null,
 etag text not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,media_id)
);
create table if not exists public.vzip_media_delete_requests(
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 session_id uuid not null,
 media_id text not null,
 object_key text not null,
 object_version uuid not null,
 expected_updated_at timestamptz not null,
 size bigint not null check(size>0),
 content_type text not null,
 content_root text not null,
 etag text not null,
 state text not null check(state in ('reserved','deleted')),
 created_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 primary key(user_id,request_id)
);
alter table public.vzip_media_delete_guards enable row level security;
alter table public.vzip_media_delete_requests enable row level security;
revoke all on public.vzip_media_delete_guards,public.vzip_media_delete_requests from public,anon,authenticated;

create or replace function public.vzip_media_mutation_context()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare u uuid:=auth.uid(); m text;
begin
 if u is null then raise exception 'authenticated account required' using errcode='42501'; end if;
 m:=public.vzip_snapshot_mode_for(u);
 if m<>'legacy' then
  perform public.vzip_assert_session();
  if not public.vzip_session_is_active() then raise exception 'active session required' using errcode='42501'; end if;
 end if;
 return jsonb_build_object('user_id',u,'mode',m,'session_id',public.vzip_request_session());
end $$;
revoke all on function public.vzip_media_mutation_context() from public,anon;
grant execute on function public.vzip_media_mutation_context() to authenticated;

create or replace function public.vzip_media_upload_allowed(p_media_id text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare u uuid:=auth.uid(); context jsonb; payload jsonb;
begin
 if p_media_id is null or p_media_id!~'^[A-Za-z0-9_-]{1,100}$' then raise exception 'invalid media id' using errcode='22023'; end if;
 context:=public.vzip_media_mutation_context();
 if context->>'mode'='paused' then return false; end if;
 if exists(select 1 from public.vzip_media_delete_guards where user_id=u and media_id=p_media_id) then return false; end if;
 select d.payload into payload from public.vocal_data d where user_id=u;
 return not coalesce((payload->'deleted'->'media') ? p_media_id,false);
end $$;
revoke all on function public.vzip_media_upload_allowed(text) from public,anon;
grant execute on function public.vzip_media_upload_allowed(text) to authenticated;

create or replace function public.vzip_media_assert_revision()
returns uuid language plpgsql security definer set search_path=''
as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'authenticated account required' using errcode='42501'; end if;
 perform 1 from public.vzip_account_session_state where user_id=u for update;
 if not found then raise exception 'registered account required' using errcode='42501'; end if;
 perform public.vzip_assert_session();
 if not public.vzip_session_is_active() or public.vzip_snapshot_mode_for(u)<>'revision' then
  raise exception 'active revision account required' using errcode='42501';
 end if;
 return u;
end $$;
revoke all on function public.vzip_media_assert_revision() from public,anon,authenticated;

create or replace function public.vzip_media_marker_valid(p_payload jsonb,p_media_id text)
returns boolean language sql immutable set search_path=''
as $$
 select coalesce(jsonb_typeof(p_payload->'deleted'->'media'),'null')='array' and coalesce((p_payload->'deleted'->'media') ? p_media_id,false)
 and not jsonb_path_exists(p_payload,'$.songs[*].repertoire.takeId ? (@ == $id)',jsonb_build_object('id',p_media_id))
 and not jsonb_path_exists(p_payload,'$.lessons[*].recordings[*].id ? (@ == $id)',jsonb_build_object('id',p_media_id))
 and not jsonb_path_exists(p_payload,'$.practices[*].mediaIds[*] ? (@ == $id)',jsonb_build_object('id',p_media_id))
 and not jsonb_path_exists(p_payload,'$.comparisonReports[*].firstId ? (@ == $id)',jsonb_build_object('id',p_media_id))
 and not jsonb_path_exists(p_payload,'$.comparisonReports[*].secondId ? (@ == $id)',jsonb_build_object('id',p_media_id))
$$;
revoke all on function public.vzip_media_marker_valid(jsonb,text) from public,anon,authenticated;

create or replace function public.vzip_media_delete_receipt(p public.vzip_media_delete_requests)
returns jsonb language sql stable set search_path=''
as $$
 select jsonb_build_object('version',1,'user_id',p.user_id,'session_id',p.session_id,
 'request_id',p.request_id,'media_id',p.media_id,'object_key',p.object_key,'object_version',p.object_version,
 'expected_updated_at',to_char(p.expected_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'size',p.size,'content_type',p.content_type,
 'content_root',p.content_root,'etag',p.etag,'state',p.state)
$$;
revoke all on function public.vzip_media_delete_receipt(public.vzip_media_delete_requests) from public,anon,authenticated;

create or replace function public.vzip_media_check_proof(p_message text,p_signature text)
returns void language plpgsql security definer set search_path=''
as $$
declare secret text; expected text;
begin
 if p_signature is null or p_signature!~'^[0-9a-f]{64}$' then raise exception 'invalid media proof' using errcode='42501'; end if;
 if to_regclass('vault.decrypted_secrets') is null then raise exception 'media proof verification is not configured' using errcode='55000'; end if;
 begin
  select decrypted_secret into strict secret from vault.decrypted_secrets where name='vzip_media_version_secret';
 exception when no_data_found or too_many_rows then raise exception 'media proof verification is not configured' using errcode='55000';
 end;
 if length(secret)<32 or length(secret)>1024 then raise exception 'media proof verification is not configured' using errcode='55000'; end if;
 expected:=encode(extensions.hmac(convert_to(p_message,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex');
 if sha256(convert_to(expected,'UTF8'))<>sha256(convert_to(p_signature,'UTF8')) then
  raise exception 'invalid media proof' using errcode='42501';
 end if;
end $$;
revoke all on function public.vzip_media_check_proof(text,text) from public,anon,authenticated;

create or replace function public.vzip_prepare_media_delete(
 p_request_id uuid,p_media_id text,p_key text,p_version uuid,p_expected_updated_at timestamptz,
 p_size bigint,p_type text,p_root text,p_etag text,p_signature text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 u uuid:=public.vzip_media_assert_revision(); sid uuid:=public.vzip_request_session();
 r public.vzip_media_delete_requests; g public.vzip_media_delete_guards; m public.vocal_media;
 payload jsonb; secret text; message text; expected text;
begin
 if p_request_id is null or p_version is null or p_expected_updated_at is null or not isfinite(p_expected_updated_at)
 or p_media_id is null or p_media_id!~'^[A-Za-z0-9_-]{1,100}$'
 or p_key is null or p_key!~('^u/'||u::text||'/'||p_media_id||'/'||p_version::text||'/original\.[a-z0-9]{1,8}$')
 or length(p_key)>300 or p_size is null or p_size<1 or p_size>2147483648
 or p_type is null or p_type!~'^audio/[A-Za-z0-9.+-]{1,60}$'
 or p_root is null or p_root!~'^[0-9a-f]{64}$'
 or p_etag is null or p_etag!~'^[!-~]{1,200}$'
 or p_signature is null or p_signature!~'^[0-9a-f]{64}$' then
  raise exception 'invalid media deletion proof' using errcode='22023';
 end if;
 select d.payload into payload from public.vocal_data d where user_id=u for update;
 if not found or not public.vzip_media_marker_valid(payload,p_media_id) then
  raise exception 'confirmed root tombstone and removed references required' using errcode='55000';
 end if;
 select * into r from public.vzip_media_delete_requests where user_id=u and request_id=p_request_id for update;
 if found then
  if r.session_id<>sid or r.media_id<>p_media_id or r.object_key<>p_key or r.object_version<>p_version
  or r.expected_updated_at<>p_expected_updated_at or r.size<>p_size or r.content_type<>p_type
  or r.content_root<>p_root or r.etag<>p_etag then
   raise exception 'request id reused with different input or session' using errcode='22023';
  end if;
  return public.vzip_media_delete_receipt(r);
 end if;
 message:=concat_ws(E'\n','vzip-media-object-v1','1',u::text,p_media_id,p_key,p_version::text,p_size::text,p_type,p_root,p_etag);
 perform public.vzip_media_check_proof(message,p_signature);
 select * into g from public.vzip_media_delete_guards where user_id=u and media_id=p_media_id for update;
 if found then
  if g.object_key<>p_key or g.object_version<>p_version or g.expected_updated_at<>p_expected_updated_at
  or g.size<>p_size or g.content_type<>p_type or g.content_root<>p_root or g.etag<>p_etag then
   raise exception 'media deletion target changed' using errcode='40001';
  end if;
 else
  select * into m from public.vocal_media where user_id=u and id=p_media_id for update;
  if not found or m.updated_at is distinct from p_expected_updated_at
  or m.metadata->>'storageProvider' is distinct from 'r2' or m.metadata->>'r2Key' is distinct from p_key
  or m.metadata->>'size' is distinct from p_size::text
  or (m.metadata ? 'legacyStorage' and m.metadata->'legacyStorage'<>'null'::jsonb) then
   raise exception 'media metadata changed or requires legacy adoption' using errcode='40001';
  end if;
  insert into public.vzip_media_delete_guards(user_id,media_id,object_key,object_version,expected_updated_at,size,content_type,content_root,etag)
   values(u,p_media_id,p_key,p_version,p_expected_updated_at,p_size,p_type,p_root,p_etag);
 end if;
 insert into public.vzip_media_delete_requests(user_id,request_id,session_id,media_id,object_key,object_version,expected_updated_at,size,content_type,content_root,etag,state)
 values(u,p_request_id,sid,p_media_id,p_key,p_version,p_expected_updated_at,p_size,p_type,p_root,p_etag,'reserved') returning * into r;
 return public.vzip_media_delete_receipt(r);
end $$;
revoke all on function public.vzip_prepare_media_delete(uuid,text,text,uuid,timestamptz,bigint,text,text,text,text) from public,anon;
grant execute on function public.vzip_prepare_media_delete(uuid,text,text,uuid,timestamptz,bigint,text,text,text,text) to authenticated;

create or replace function public.vzip_media_delete_status(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare u uuid:=public.vzip_media_assert_revision(); r public.vzip_media_delete_requests; payload jsonb; m public.vocal_media;
begin
 select d.payload into payload from public.vocal_data d where user_id=u for update;
 select * into r from public.vzip_media_delete_requests where user_id=u and request_id=p_request_id for update;
 if not found then return null; end if;
 if r.session_id<>public.vzip_request_session() then raise exception 'request belongs to another session' using errcode='42501'; end if;
 if not public.vzip_media_marker_valid(payload,r.media_id) then raise exception 'root tombstone changed' using errcode='55000'; end if;
 if not exists(select 1 from public.vzip_media_delete_guards g where g.user_id=u and g.media_id=r.media_id
 and g.object_key=r.object_key and g.object_version=r.object_version and g.expected_updated_at=r.expected_updated_at) then
  raise exception 'media deletion guard changed' using errcode='55000';
 end if;
 select * into m from public.vocal_media where user_id=u and id=r.media_id for update;
 if found and (m.updated_at is distinct from r.expected_updated_at or m.metadata->>'r2Key' is distinct from r.object_key) then
  raise exception 'media metadata changed' using errcode='40001';
 end if;
 return public.vzip_media_delete_receipt(r);
end $$;
revoke all on function public.vzip_media_delete_status(uuid) from public,anon;
grant execute on function public.vzip_media_delete_status(uuid) to authenticated;

create or replace function public.vzip_finish_media_delete(p_request_id uuid,p_signature text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb; r public.vzip_media_delete_requests;
begin
 result:=public.vzip_media_delete_status(p_request_id);
 if result is null then raise exception 'unknown deletion request' using errcode='22023'; end if;
 perform public.vzip_media_check_proof(concat_ws(E'\n','vzip-media-deleted-v1',result->>'user_id',result->>'session_id',result->>'request_id',result->>'object_key',result->>'object_version'),p_signature);
 if result->>'state'='deleted' then return result; end if;
 select * into r from public.vzip_media_delete_requests where user_id=auth.uid() and request_id=p_request_id;
 delete from public.vocal_media where user_id=r.user_id and id=r.media_id
  and updated_at=r.expected_updated_at and metadata->>'r2Key'=r.object_key;
 update public.vzip_media_delete_requests set state='deleted',completed_at=clock_timestamp()
  where user_id=r.user_id and request_id=r.request_id returning * into r;
 return public.vzip_media_delete_receipt(r);
end $$;
revoke all on function public.vzip_finish_media_delete(uuid,text) from public,anon;
grant execute on function public.vzip_finish_media_delete(uuid,text) to authenticated;

-- All direct old-client writes are blocked for adopted/paused accounts.
create or replace function public.vzip_guard_media_direct_write()
returns trigger language plpgsql set search_path=''
as $$
declare u uuid;
begin
 u:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if current_user in ('authenticated','anon') then
  if current_user='anon' or public.vzip_snapshot_mode_for(u)<>'legacy' then
   raise exception 'versioned media contract required' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
revoke all on function public.vzip_guard_media_direct_write() from public,anon,authenticated;
drop trigger if exists vzip_media_direct_write_guard on public.vocal_media;
create trigger vzip_media_direct_write_guard before insert or update or delete on public.vocal_media
 for each row execute function public.vzip_guard_media_direct_write();

-- A reserved/completed ID cannot be pointed at new content or restored by trusted old RPCs.
create or replace function public.vzip_guard_media_resurrection()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if exists(select 1 from public.vzip_media_delete_guards where user_id=new.user_id and media_id=new.id)
 or (tg_op='UPDATE' and exists(select 1 from public.vzip_media_delete_guards where user_id=old.user_id and media_id=old.id)) then
  raise exception 'deleted media ID is permanently guarded' using errcode='55000';
 end if;
 return new;
end $$;
revoke all on function public.vzip_guard_media_resurrection() from public,anon,authenticated;
drop trigger if exists vzip_media_resurrection_guard on public.vocal_media;
create trigger vzip_media_resurrection_guard before insert or update on public.vocal_media
 for each row execute function public.vzip_guard_media_resurrection();

create or replace function public.vzip_guard_media_root_restore()
returns trigger language plpgsql security definer set search_path=''
as $$
declare g record;
begin
 for g in select media_id from public.vzip_media_delete_guards where user_id=new.user_id loop
  if not public.vzip_media_marker_valid(new.payload,g.media_id) then
   raise exception 'deleted media tombstone and cleared references must be preserved' using errcode='55000';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.vzip_guard_media_root_restore() from public,anon,authenticated;
drop trigger if exists vzip_media_root_restore_guard on public.vocal_data;
create trigger vzip_media_root_restore_guard before insert or update on public.vocal_data
 for each row execute function public.vzip_guard_media_root_restore();


-- Old clients must not bypass the R2 guard through the legacy Supabase bucket.
-- Existing owner/session policies remain ANDed; reads and unrelated buckets are unchanged.
do $$
declare op text; policy_name text;
begin
 if to_regclass('storage.objects') is not null then
  foreach op in array array['insert','update','delete'] loop
   policy_name:='vzip_versioned_recordings_'||op;
   execute format('drop policy if exists %I on storage.objects',policy_name);
   if op='insert' then
    execute format('create policy %I on storage.objects as restrictive for insert to authenticated with check (bucket_id<>''vocal-recordings'' or public.vzip_snapshot_mode_for((select auth.uid()))=''legacy'')',policy_name);
   elsif op='update' then
    execute format('create policy %I on storage.objects as restrictive for update to authenticated using (bucket_id<>''vocal-recordings'' or public.vzip_snapshot_mode_for((select auth.uid()))=''legacy'') with check (bucket_id<>''vocal-recordings'' or public.vzip_snapshot_mode_for((select auth.uid()))=''legacy'')',policy_name);
   else
    execute format('create policy %I on storage.objects as restrictive for delete to authenticated using (bucket_id<>''vocal-recordings'' or public.vzip_snapshot_mode_for((select auth.uid()))=''legacy'')',policy_name);
   end if;
  end loop;
 end if;
end $$;

comment on table public.vzip_media_delete_guards is
 'Proposal only: permanent immutable-object deletion guards, no media bodies or user notes. Do not activate before client publication/deletion, legacy adoption, all writer inventory and HTTP/device acceptance.';
commit;
