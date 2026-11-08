-- PROPOSAL ONLY. Depends on 20261113_snapshot_revision.sql.
-- No automatic production migration or UI activation.
begin;
create table if not exists public.vzip_field_drafts (
 user_id uuid not null references auth.users(id) on delete cascade,
 entity_id text not null check(octet_length(entity_id) between 1 and 200),
 field_key text not null check(field_key in ('memo','prepMemo','feedback')),
 draft_id uuid not null unique default gen_random_uuid(),
 revision bigint not null default 0 check(revision>=0),
 text_value text not null check(octet_length(text_value)<=65536),
 base_value jsonb not null,
 base_generation uuid not null,
 committed_revision bigint not null default 0,
 lease_session uuid,
 editor_instance uuid,
 lease_epoch bigint not null default 0 check(lease_epoch>=0),
 lease_expires_at timestamptz,
 handoff_session uuid,
 handoff_editor uuid,
 handoff_revision bigint,
 handoff_epoch bigint,
 handoff_expires_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,entity_id,field_key),
 check(committed_revision between 0 and revision)
);
create table if not exists public.vzip_field_conflicts (
 conflict_id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 draft_id uuid not null references public.vzip_field_drafts(draft_id) on delete cascade,
 session_id uuid not null,
 editor_instance uuid not null,
 base_revision bigint not null,
 lease_epoch bigint not null,
 server_revision bigint not null,
 text_value text not null check(octet_length(text_value)<=65536),
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists vzip_field_conflicts_owner on public.vzip_field_conflicts(user_id,draft_id);
create table if not exists public.vzip_field_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 draft_id uuid not null references public.vzip_field_drafts(draft_id) on delete cascade,
 session_id uuid not null,
 digest bytea not null,
 response jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
-- Transient markers, never committed. GUC/current_user checks are forgeable or
-- would also trust the generic snapshot RPC, so they are not a commit bypass.
create table if not exists public.vzip_field_commit_markers (
 user_id uuid not null,
 tx_id bigint not null,
 draft_id uuid not null references public.vzip_field_drafts(draft_id) on delete cascade,
 value_hash bytea not null,
 primary key(user_id,tx_id,draft_id)
);
alter table public.vzip_field_drafts enable row level security;
alter table public.vzip_field_conflicts enable row level security;
alter table public.vzip_field_requests enable row level security;
alter table public.vzip_field_commit_markers enable row level security;
revoke all on public.vzip_field_drafts,public.vzip_field_conflicts,public.vzip_field_requests,public.vzip_field_commit_markers from public,anon,authenticated;
grant select on public.vzip_field_drafts,public.vzip_field_conflicts,public.vzip_field_requests to authenticated;
drop policy if exists draft_owner_read on public.vzip_field_drafts;
create policy draft_owner_read on public.vzip_field_drafts for select to authenticated using(user_id=auth.uid() and public.vzip_session_read_allowed());
drop policy if exists conflict_owner_read on public.vzip_field_conflicts;
create policy conflict_owner_read on public.vzip_field_conflicts for select to authenticated using(user_id=auth.uid() and public.vzip_session_read_allowed());
drop policy if exists request_owner_read on public.vzip_field_requests;
create policy request_owner_read on public.vzip_field_requests for select to authenticated using(user_id=auth.uid() and public.vzip_session_read_allowed());

create or replace function public.vzip_field_meta(d public.vzip_field_drafts)
returns jsonb language sql immutable set search_path=''
as $$ select jsonb_build_object('draft_id',d.draft_id,'revision',d.revision::text,
 'committed_revision',d.committed_revision::text,'epoch',d.lease_epoch::text,
 'lease_expires_at',d.lease_expires_at,'editor_instance',d.editor_instance,
 'handoff_editor',d.handoff_editor,'saved_at',d.updated_at); $$;
revoke all on function public.vzip_field_meta(public.vzip_field_drafts) from public,anon,authenticated;

-- Protect confirmed fields after a draft has been created, even after lease expiry.
-- Whole-snapshot writers can still edit other fields. A real tombstoned lesson
-- deletion removes draft/conflict text and receipts, never recreating a lesson.
create or replace function public.vzip_protect_field_drafts()
returns trigger language plpgsql security definer set search_path=''
as $$
declare d public.vzip_field_drafts; a jsonb; b jsonb; n integer;
begin
 if tg_op='DELETE' then
  delete from public.vzip_field_drafts where user_id=old.user_id;
  return old;
 end if;
 for d in select * from public.vzip_field_drafts where user_id=old.user_id loop
  select count(*),min(x::text)::jsonb into n,b from jsonb_array_elements(new.payload->'lessons') x where x->>'id'=d.entity_id;
  if n=0 then
   if not exists(select 1 from jsonb_array_elements_text(coalesce(new.payload#>'{deleted,lessons}','[]')) x where x=d.entity_id) then
    raise exception 'protected lesson deletion requires a tombstone' using errcode='55000';
   end if;
   delete from public.vzip_field_drafts where draft_id=d.draft_id;
   continue;
  elsif n<>1 then raise exception 'ambiguous protected lesson id' using errcode='22023';
  end if;
  select x->d.field_key into a from jsonb_array_elements(old.payload->'lessons') x where x->>'id'=d.entity_id;
  b:=b->d.field_key;
  if a is distinct from b and not exists(
   select 1 from public.vzip_field_commit_markers m
   where m.user_id=old.user_id and m.tx_id=txid_current() and m.draft_id=d.draft_id
    and m.value_hash=sha256(convert_to(coalesce(b,'null'::jsonb)::text,'UTF8'))
  ) then raise exception 'field draft requires a versioned commit' using errcode='55000'; end if;
 end loop;
 return new;
end $$;
revoke all on function public.vzip_protect_field_drafts() from public,anon,authenticated;
drop trigger if exists vzip_protect_field_drafts on public.vocal_data;
create trigger vzip_protect_field_drafts before update or delete on public.vocal_data
 for each row execute function public.vzip_protect_field_drafts();

create or replace function public.vzip_field_draft(
 p_operation text,p_entity_id text,p_field_key text,
 p_editor_instance uuid default null,p_draft_id uuid default null,
 p_expected_revision bigint default null,p_expected_epoch bigint default null,
 p_text text default null,p_request_id uuid default null,p_target_editor uuid default null,
 p_confirm_unsynced boolean default false,p_expected_snapshot_revision bigint default null,
 p_expected_generation uuid default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 u uuid:=auth.uid(); s uuid; snap public.vocal_data; d public.vzip_field_drafts;
 receipt public.vzip_field_requests; hash bytea; result jsonb; lesson jsonb;
 idx integer; n integer; current_value jsonb; made boolean:=false; owns boolean;
 conflict_id uuid; preserved boolean; bytes bigint; count_ bigint;
begin
 if u is null then raise exception 'authenticated session required' using errcode='42501'; end if;
 perform 1 from public.vzip_account_session_state where user_id=u for update;
 if not found then raise exception 'registered session required' using errcode='42501'; end if;
 perform public.vzip_assert_session();
 if not public.vzip_session_is_active() then raise exception 'active session required' using errcode='42501'; end if;
 s:=public.vzip_request_session();
 if not exists(select 1 from auth.sessions a where a.id=s and a.user_id=u and (a.not_after is null or a.not_after>clock_timestamp())) then
  raise exception 'active session required' using errcode='42501';
 end if;
 if p_operation is null or p_operation not in ('load','acquire','save','renew','release','commit','request_handoff','accept_handoff','recover_handoff') then
  raise exception 'invalid draft operation' using errcode='22023';
 end if;
 if p_entity_id is null or octet_length(p_entity_id) not between 1 and 200 or p_field_key is null or p_field_key not in ('memo','prepMemo','feedback') then
  raise exception 'invalid draft field' using errcode='22023';
 end if;
 select * into snap from public.vocal_data where user_id=u for update;
 if not found then raise exception 'source lesson not found' using errcode='P0002'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(snap.payload#>'{deleted,lessons}','[]')) x where x=p_entity_id) then
  raise exception 'source lesson deleted' using errcode='P0002';
 end if;
 select count(*),min(x::text)::jsonb,min(ord)::integer-1 into n,lesson,idx
  from jsonb_array_elements(snap.payload->'lessons') with ordinality as j(x,ord) where x->>'id'=p_entity_id;
 if n<>1 then raise exception 'source lesson missing or ambiguous' using errcode='P0002'; end if;
 current_value:=coalesce(lesson->p_field_key,'null'::jsonb);
 if jsonb_typeof(current_value) not in ('null','string') then raise exception 'source field is not text' using errcode='22023'; end if;
 select * into d from public.vzip_field_drafts where user_id=u and entity_id=p_entity_id and field_key=p_field_key for update;
 if p_operation='load' then
  if d.draft_id is null then
   return jsonb_build_object('status','loaded','draft_id',null,'revision','0','committed_revision','0','epoch','0',
    'text',coalesce(lesson->>p_field_key,''),'confirmed_text',coalesce(lesson->>p_field_key,''),
    'snapshot_revision',snap.revision::text,'generation',snap.generation,'is_editor',false);
  end if;
  return public.vzip_field_meta(d)||jsonb_build_object('status','loaded','text',d.text_value,
   'confirmed_text',coalesce(lesson->>p_field_key,''),'snapshot_revision',snap.revision::text,'generation',snap.generation,
   'is_editor',coalesce(d.lease_session=s and d.editor_instance=p_editor_instance and d.lease_expires_at>clock_timestamp(),false));
 end if;
 if p_editor_instance is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_epoch is null or p_expected_epoch<0 then
  raise exception 'editor, request id and nonnegative version required' using errcode='22023';
 end if;
 if (p_operation='save' and (p_text is null or octet_length(p_text)>65536)) or (p_operation<>'save' and p_text is not null)
  or (p_operation<>'recover_handoff' and coalesce(p_confirm_unsynced,false)) then
  raise exception 'invalid draft text or confirmation' using errcode='22023';
 end if;
 hash:=sha256(convert_to(jsonb_build_array(p_operation,p_entity_id,p_field_key,p_editor_instance,p_draft_id,
  p_expected_revision,p_expected_epoch,p_text,p_target_editor,p_confirm_unsynced,p_expected_snapshot_revision,p_expected_generation)::text,'UTF8'));
 select * into receipt from public.vzip_field_requests where user_id=u and request_id=p_request_id;
 if found then
  if receipt.session_id<>s or receipt.digest<>hash then raise exception 'request id reused with different input or session' using errcode='22023'; end if;
  return receipt.response||jsonb_build_object('replayed',true);
 end if;
 if (select count(*) from public.vzip_field_requests where user_id=u)>=10000 then
  raise exception 'draft request capacity reached; preserve local copy' using errcode='54000';
 end if;
 if d.draft_id is null then
  if p_operation<>'acquire' or p_draft_id is not null then
   return jsonb_build_object('status','conflict','reason','draft_missing','preserved',false);
  end if;
  if p_expected_revision<>0 or p_expected_epoch<>0 or p_expected_snapshot_revision is distinct from snap.revision or p_expected_generation is distinct from snap.generation then
   return jsonb_build_object('status','conflict','reason','source_changed','snapshot_revision',snap.revision::text,'generation',snap.generation,'preserved',false);
  end if;
  select count(*),coalesce(sum(octet_length(text_value)),0) into count_,bytes from public.vzip_field_drafts where user_id=u;
  if count_>=512 or bytes+octet_length(coalesce(lesson->>p_field_key,''))>4194304 then raise exception 'draft capacity reached' using errcode='54000'; end if;
  if snap.generation is null then
   -- Lazy metadata adoption for this one account, never a payload backfill.
   update public.vocal_data set payload=payload where user_id=u returning * into snap;
  end if;
  insert into public.vzip_field_drafts(user_id,entity_id,field_key,text_value,base_value,base_generation)
   values(u,p_entity_id,p_field_key,coalesce(lesson->>p_field_key,''),current_value,snap.generation)
   returning * into d;
  made:=true;
 elsif p_draft_id is distinct from d.draft_id then
  return public.vzip_field_meta(d)||jsonb_build_object('status','conflict','reason','draft_changed','preserved',false);
 end if;
 owns:=coalesce(d.lease_session=s and d.editor_instance=p_editor_instance and d.lease_epoch=p_expected_epoch and d.lease_expires_at>clock_timestamp(),false);
 if p_operation='save' and (not owns or d.revision<>p_expected_revision) then
  select count(*),coalesce(sum(octet_length(text_value)),0) into count_,bytes from public.vzip_field_conflicts where user_id=u;
  preserved:=count_<128 and bytes+octet_length(p_text)<=4194304;
  if preserved then
   insert into public.vzip_field_conflicts(user_id,draft_id,session_id,editor_instance,base_revision,lease_epoch,server_revision,text_value)
    values(u,d.draft_id,s,p_editor_instance,p_expected_revision,p_expected_epoch,d.revision,p_text)
    returning vzip_field_conflicts.conflict_id into conflict_id;
  end if;
  result:=jsonb_build_object('status','conflict','reason',case when not owns then 'lease_changed' else 'revision_changed' end,
   'preserved',preserved,'conflict_id',conflict_id);
 elsif d.revision<>p_expected_revision or d.lease_epoch<>p_expected_epoch then
  result:=jsonb_build_object('status','conflict','reason','version_changed');
 elsif p_operation='acquire' then
  if d.lease_expires_at>clock_timestamp() and not owns then result:=jsonb_build_object('status','locked');
  elsif owns then result:=jsonb_build_object('status','acquired');
  else
   update public.vzip_field_drafts set lease_session=s,editor_instance=p_editor_instance,lease_epoch=lease_epoch+1,
    lease_expires_at=clock_timestamp()+interval '90 seconds',handoff_session=null,handoff_editor=null,handoff_expires_at=null
    where draft_id=d.draft_id returning * into d;
   result:=jsonb_build_object('status','acquired');
  end if;
 elsif p_operation='recover_handoff' then
  if not coalesce(p_confirm_unsynced,false) then raise exception 'explicit unsynced-copy confirmation required' using errcode='22023'; end if;
  update public.vzip_field_drafts set lease_session=s,editor_instance=p_editor_instance,lease_epoch=lease_epoch+1,
   lease_expires_at=clock_timestamp()+interval '90 seconds',handoff_session=null,handoff_editor=null,handoff_expires_at=null
   where draft_id=d.draft_id returning * into d;
  result:=jsonb_build_object('status','acquired','recovered',true);
 elsif p_operation='request_handoff' then
  if owns then result:=jsonb_build_object('status','already_editor');
  elsif d.handoff_expires_at>clock_timestamp() and (d.handoff_session is distinct from s or d.handoff_editor is distinct from p_editor_instance) then
   result:=jsonb_build_object('status','handoff_pending');
  else
   update public.vzip_field_drafts set handoff_session=s,handoff_editor=p_editor_instance,
    handoff_revision=revision,handoff_epoch=lease_epoch,handoff_expires_at=clock_timestamp()+interval '90 seconds'
    where draft_id=d.draft_id returning * into d;
   result:=jsonb_build_object('status','handoff_requested');
  end if;
 elsif not owns then result:=jsonb_build_object('status','conflict','reason','lease_changed');
 elsif p_operation='save' then
  select coalesce(sum(octet_length(text_value)),0)-octet_length(d.text_value)+octet_length(p_text) into bytes from public.vzip_field_drafts where user_id=u;
  if bytes>4194304 then raise exception 'draft capacity reached' using errcode='54000'; end if;
  update public.vzip_field_drafts set text_value=p_text,revision=revision+1,updated_at=clock_timestamp(),
   handoff_session=null,handoff_editor=null,handoff_expires_at=null where draft_id=d.draft_id returning * into d;
  result:=jsonb_build_object('status','saved');
 elsif p_operation='renew' then
  update public.vzip_field_drafts set lease_expires_at=clock_timestamp()+interval '90 seconds' where draft_id=d.draft_id returning * into d;
  result:=jsonb_build_object('status','renewed');
 elsif p_operation='release' then
  update public.vzip_field_drafts set lease_session=null,editor_instance=null,lease_epoch=lease_epoch+1,lease_expires_at=null,
   handoff_session=null,handoff_editor=null,handoff_expires_at=null where draft_id=d.draft_id returning * into d;
  result:=jsonb_build_object('status','released');
 elsif p_operation='accept_handoff' then
  if p_target_editor is null or d.handoff_editor is distinct from p_target_editor or d.handoff_expires_at is null or d.handoff_expires_at<=clock_timestamp()
   or d.handoff_revision<>d.revision or d.handoff_epoch<>d.lease_epoch then
   result:=jsonb_build_object('status','conflict','reason','handoff_changed');
  elsif not exists(select 1 from public.vzip_device_sessions ds join auth.sessions a on a.id=ds.session_id and a.user_id=ds.user_id
   where ds.user_id=u and ds.session_id=d.handoff_session and ds.revoked_at is null and (a.not_after is null or a.not_after>clock_timestamp())) then
   result:=jsonb_build_object('status','conflict','reason','target_session_revoked');
  else
   update public.vzip_field_drafts set lease_session=handoff_session,editor_instance=handoff_editor,lease_epoch=lease_epoch+1,
    lease_expires_at=clock_timestamp()+interval '90 seconds',handoff_session=null,handoff_editor=null,handoff_expires_at=null
    where draft_id=d.draft_id returning * into d;
   result:=jsonb_build_object('status','handed_off');
  end if;
 elsif p_operation='commit' then
  if snap.generation is distinct from d.base_generation or current_value is distinct from d.base_value then
   result:=jsonb_build_object('status','conflict','reason','body_changed','preserved',true);
  else
   insert into public.vzip_field_commit_markers values(u,txid_current(),d.draft_id,sha256(convert_to(to_jsonb(d.text_value)::text,'UTF8')));
   update public.vocal_data set payload=jsonb_set(payload,array['lessons',idx::text,p_field_key],to_jsonb(d.text_value),true)
    where user_id=u and revision=snap.revision and generation=snap.generation returning * into snap;
   if not found then raise exception 'snapshot changed during commit' using errcode='40001'; end if;
   delete from public.vzip_field_commit_markers where user_id=u and tx_id=txid_current() and draft_id=d.draft_id;
   update public.vzip_field_drafts set committed_revision=revision,base_value=to_jsonb(text_value) where draft_id=d.draft_id returning * into d;
   result:=jsonb_build_object('status','committed','snapshot_revision',snap.revision::text,'generation',snap.generation,'updated_at',snap.updated_at);
  end if;
 end if;
 result:=public.vzip_field_meta(d)||result||jsonb_build_object('replayed',false);
 insert into public.vzip_field_requests(user_id,request_id,draft_id,session_id,digest,response)
  values(u,p_request_id,d.draft_id,s,hash,result);
 return result;
end $$;
revoke all on function public.vzip_field_draft(text,text,text,uuid,uuid,bigint,bigint,text,uuid,uuid,boolean,bigint,uuid) from public,anon;
grant execute on function public.vzip_field_draft(text,text,text,uuid,uuid,bigint,bigint,text,uuid,uuid,boolean,bigint,uuid) to authenticated;
commit;
