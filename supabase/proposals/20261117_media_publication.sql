-- Proposal only. No production installation, activation or existing-row backfill.
-- Requires reviewed session/snapshot/rollout and 20261116_media_version_guard.sql.
begin;
create table if not exists public.vzip_media_publications(
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, session_id uuid not null,
 media_id text not null, object_key text not null, object_version uuid not null,
 metadata_hash text not null, created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
alter table public.vzip_media_publications enable row level security;
revoke all on public.vzip_media_publications from public,anon,authenticated;

create or replace function public.vzip_publish_media(
 p_request_id uuid,p_metadata_text text,p_version uuid,p_root text,p_etag text,p_signature text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 u uuid:=public.vzip_media_assert_revision(); sid uuid:=public.vzip_request_session();
 m jsonb; payload jsonb; k text; target_id text; n bigint; typ text; hash text;
 r public.vzip_media_publications; saved public.vocal_media;
begin
 if p_request_id is null or p_version is null or p_metadata_text is null or octet_length(p_metadata_text)>16000
 or p_root is null or p_root!~'^[0-9a-f]{64}$' or p_etag is null or p_etag!~'^[!-~]{1,200}$' then
  raise exception 'invalid publication' using errcode='22023';
 end if;
 m:=p_metadata_text::jsonb;
 if jsonb_typeof(m) is distinct from 'object' or m ?| array['blob','bytes','path','parts','legacyStorage','storageVersion']
 or m->>'storageProvider' is distinct from 'r2'
 or jsonb_typeof(m->'id') is distinct from 'string'
 or jsonb_typeof(m->'r2Key') is distinct from 'string'
 or jsonb_typeof(m->'size') is distinct from 'number'
 or m->>'r2Etag' is distinct from p_etag then
  raise exception 'invalid original metadata' using errcode='22023';
 end if;
 target_id:=m->>'id';k:=m->>'r2Key';typ:=m->>'type';
 if target_id!~'^[A-Za-z0-9_-]{1,100}$'
 or length(k)>300 or k!~('^u/'||u::text||'/'||target_id||'/'||p_version::text||'/original\.[a-z0-9]{1,8}$')
 or (m->>'size')!~'^[0-9]{1,10}$' or typ is null or typ!~'^audio/[A-Za-z0-9.+-]{1,60}$'
 or (m ? 'r2Root' and m->>'r2Root' is distinct from p_root) then
  raise exception 'invalid original descriptor' using errcode='22023';
 end if;
 n:=(m->>'size')::bigint;
 if n<1 or n>2147483648 then raise exception 'invalid original size' using errcode='22023';end if;
 hash:=encode(sha256(convert_to(p_metadata_text,'UTF8')),'hex');
 perform public.vzip_media_check_proof(concat_ws(E'\n','vzip-media-publish-v1','1',u::text,sid::text,
  p_request_id::text,target_id,k,p_version::text,n::text,typ,p_root,p_etag,hash),p_signature);
 select d.payload into payload from public.vocal_data d where user_id=u for update;
 if not found or (payload->'deleted'->'media' is not null and jsonb_typeof(payload->'deleted'->'media')<>'array')
 or coalesce((payload->'deleted'->'media') ? target_id,false)
 or exists(select 1 from public.vzip_media_delete_guards where user_id=u and vzip_media_delete_guards.media_id=target_id) then
  raise exception 'original cannot be published' using errcode='55000';
 end if;
 select * into r from public.vzip_media_publications where user_id=u and request_id=p_request_id for update;
 if found and (r.session_id<>sid or r.media_id<>target_id or r.object_key<>k or r.object_version<>p_version or r.metadata_hash<>hash) then
  raise exception 'publication request changed' using errcode='40001';
 end if;
 -- INSERT ONLY. A concurrent creation or a newer edit always wins.
 insert into public.vocal_media(id,user_id,metadata,updated_at)
 values(target_id,u,m,clock_timestamp()) on conflict do nothing;
 select * into saved from public.vocal_media where user_id=u and id=target_id for update;
 if not found or saved.metadata->>'storageProvider' is distinct from 'r2'
 or saved.metadata->>'r2Key' is distinct from k or saved.metadata->>'size' is distinct from n::text
 or saved.metadata->>'type' is distinct from typ or saved.metadata->>'r2Etag' is distinct from p_etag then
  raise exception 'existing library original differs' using errcode='40001';
 end if;
 insert into public.vzip_media_publications(user_id,request_id,session_id,media_id,object_key,object_version,metadata_hash)
 values(u,p_request_id,sid,target_id,k,p_version,hash) on conflict do nothing;
 return jsonb_build_object('version',1,'user_id',u,'session_id',sid,'request_id',p_request_id,
 'id',target_id,'metadata',saved.metadata,
 'updated_at',to_char(saved.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end $$;
revoke all on function public.vzip_publish_media(uuid,text,uuid,text,text,text) from public,anon;
grant execute on function public.vzip_publish_media(uuid,text,uuid,text,text,text) to authenticated;
comment on table public.vzip_media_publications is
 'Proposal only. Minimal publication receipts, no original bytes or copied user notes. No direct client writes. Retention and full client/legacy acceptance required before activation.';
commit;
