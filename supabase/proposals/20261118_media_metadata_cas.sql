-- PROPOSAL ONLY: metadata CAS for immutable audio. No production installation or backfill.
-- Requires reviewed session/snapshot/rollout + 20261116_media_version_guard.sql.
begin;
create table if not exists public.vzip_media_edits(
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, session_id uuid not null,
 media_id text not null, object_key text not null,
 input_hash text not null, applied_updated_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
alter table public.vzip_media_edits enable row level security;
revoke all on public.vzip_media_edits from public,anon,authenticated;

create or replace function public.vzip_edit_media(
 p_request_id uuid,p_media_id text,p_key text,p_expected_updated_at timestamptz,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 u uuid:=public.vzip_media_assert_revision(); sid uuid:=public.vzip_request_session();
 payload jsonb; edited_metadata jsonb; m public.vocal_media; r public.vzip_media_edits;
 field text; value jsonb; input_hash text; next_at timestamptz; replayed boolean:=false;
begin
 if p_request_id is null or p_media_id is null or p_media_id!~'^[A-Za-z0-9_-]{1,100}$'
 or p_expected_updated_at is null or not isfinite(p_expected_updated_at)
 or p_key is null or length(p_key)>300
 or p_key!~('^u/'||u::text||'/'||p_media_id||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/original\.[a-z0-9]{1,8}$')
 or p_patch is null or jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb
 or octet_length(p_patch::text)>16000 then
  raise exception 'invalid media edit' using errcode='22023';
 end if;
 for field,value in select * from jsonb_each(p_patch) loop
  if field not in ('name','song','songId','recordedDate','dateSource','rating','review') then
   raise exception 'unsupported media edit field' using errcode='22023';
  end if;
  if field='rating' then
   if value<>'null'::jsonb then
    if jsonb_typeof(value) is distinct from 'number' then raise exception 'invalid media rating' using errcode='22023';end if;
    if (value#>>'{}')::numeric<0 or (value#>>'{}')::numeric>5
     or trunc((value#>>'{}')::numeric)<>(value#>>'{}')::numeric then
     raise exception 'invalid media rating' using errcode='22023';
    end if;
   end if;
  else
   if jsonb_typeof(value) is distinct from 'string'
   or length(value#>>'{}')>case field when 'review' then 8000 when 'songId' then 200 when 'recordedDate' then 10 when 'dateSource' then 40 else 500 end
   or (field='name' and length(btrim(value#>>'{}'))=0) then
    raise exception 'invalid media text' using errcode='22023';
   end if;
   if field='recordedDate' and value#>>'{}'<>'' then
    if (value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid recorded date' using errcode='22023';end if;
    begin
     if to_char((value#>>'{}')::date,'YYYY-MM-DD')<>value#>>'{}' then raise exception 'invalid recorded date' using errcode='22023';end if;
    exception when invalid_datetime_format or datetime_field_overflow then
     raise exception 'invalid recorded date' using errcode='22023';
    end;
   end if;
  end if;
 end loop;
 if (p_patch ? 'songId')<>(p_patch ? 'song') then
  raise exception 'song id and label must be edited together' using errcode='22023';
 end if;
 select d.payload into payload from public.vocal_data d where user_id=u for update;
 if not found or (payload->'deleted'->'media' is not null and jsonb_typeof(payload->'deleted'->'media')<>'array')
 or coalesce((payload->'deleted'->'media') ? p_media_id,false)
 or exists(select 1 from public.vzip_media_delete_guards g where g.user_id=u and g.media_id=p_media_id) then
  raise exception 'media edit is blocked by deletion' using errcode='55000';
 end if;
 -- A supplied song belongs to this account's root; neither new songs nor references are created here.
 if p_patch ? 'songId' then
  if p_patch->>'songId'='' then
   if p_patch->>'song'<>'' then raise exception 'cleared song requires an empty label' using errcode='22023';end if;
  elsif jsonb_typeof(payload->'songs') is distinct from 'array'
   or not exists(select 1 from jsonb_array_elements(payload->'songs') s where s->>'id'=p_patch->>'songId')
   or coalesce((payload->'deleted'->'songs') ? (p_patch->>'songId'),false) then
   raise exception 'song does not belong to this account' using errcode='22023';
  end if;
 end if;
 input_hash:=encode(sha256(convert_to(jsonb_build_object('id',p_media_id,'key',p_key,
  'expected',to_char(p_expected_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'patch',p_patch)::text,'UTF8')),'hex');
 select * into r from public.vzip_media_edits e where e.user_id=u and e.request_id=p_request_id for update;
 if found then
  if r.session_id<>sid or r.media_id<>p_media_id or r.object_key<>p_key or r.input_hash<>input_hash then
   raise exception 'media edit request changed' using errcode='40001';
  end if;
  replayed:=true;
 end if;
 select * into m from public.vocal_media v where v.user_id=u and v.id=p_media_id for update;
 if not found or jsonb_typeof(m.metadata) is distinct from 'object'
 or m.metadata->>'id' is distinct from p_media_id or m.metadata->>'storageProvider' is distinct from 'r2'
 or m.metadata->>'r2Key' is distinct from p_key
 or jsonb_typeof(m.metadata->'size') is distinct from 'number'
 or coalesce(m.metadata->>'size','')!~'^[0-9]{1,10}$'
 or (m.metadata->>'size')::bigint not between 1 and 2147483648
 or coalesce(m.metadata->>'type','')!~'^audio/[A-Za-z0-9.+-]{1,60}$'
 or coalesce(m.metadata->>'r2Etag','')!~'^[!-~]{1,200}$'
 or m.metadata ?| array['path','parts','legacyStorage','storageVersion']
 or m.updated_at is null or not isfinite(m.updated_at) then
  raise exception 'media original changed or requires adoption' using errcode='40001';
 end if;
 if not replayed then
  if m.updated_at is distinct from p_expected_updated_at then
   raise exception 'newer media edit must be reviewed' using errcode='40001';
  end if;
  next_at:=greatest(clock_timestamp(),m.updated_at+interval '1 microsecond');edited_metadata:=m.metadata||p_patch;
  update public.vocal_media v set metadata=edited_metadata,updated_at=next_at
   where v.user_id=u and v.id=p_media_id and v.updated_at=p_expected_updated_at returning * into m;
  if not found or m.metadata is distinct from edited_metadata or m.updated_at is null
   or not isfinite(m.updated_at) or m.updated_at<=p_expected_updated_at then
   raise exception 'media edit version or content was not preserved' using errcode='40001';
  end if;
  insert into public.vzip_media_edits(user_id,request_id,session_id,media_id,object_key,input_hash,applied_updated_at)
   values(u,p_request_id,sid,p_media_id,p_key,input_hash,m.updated_at) returning * into r;
 end if;
 return jsonb_build_object('version',1,'user_id',u,'session_id',sid,'request_id',p_request_id,
  'id',p_media_id,'object_key',p_key,'metadata',m.metadata,
  'applied_updated_at',to_char(r.applied_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'updated_at',to_char(m.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'replayed',replayed,'superseded',m.updated_at is distinct from r.applied_updated_at);
end $$;
revoke all on function public.vzip_edit_media(uuid,text,text,timestamptz,jsonb) from public,anon;
grant execute on function public.vzip_edit_media(uuid,text,text,timestamptz,jsonb) to authenticated;
comment on table public.vzip_media_edits is
 'Proposal only. Minimal session-bound CAS receipts without copied notes or patch bodies. No direct access. Retention, UI/outbox, legacy adoption and device/HTTP acceptance remain activation gates.';
commit;
