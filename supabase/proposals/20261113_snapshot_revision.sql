-- PROPOSAL ONLY: Phase 03 snapshot revision foundation. Not in migrations/.
-- Apply/test only in a disposable DB until the client/legacy bridge and rollout
-- procedure are reviewed. No payload backfill, media changes, or auth policy changes.
begin;

alter table public.vocal_data add column if not exists revision bigint not null default 0;

create table if not exists public.vzip_data_write_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 session_id uuid not null,
 expected_revision bigint not null check(expected_revision>=0),
 content_hash bytea not null,
 result_revision bigint not null,
 result_updated_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
alter table public.vzip_data_write_requests enable row level security;
revoke all on public.vzip_data_write_requests from public,anon,authenticated;
grant select on public.vzip_data_write_requests to authenticated;
drop policy if exists read_own on public.vzip_data_write_requests;
create policy read_own on public.vzip_data_write_requests for select to authenticated
 using(user_id=(select auth.uid()) and (select public.vzip_session_read_allowed()));

-- Override caller clocks/revisions, including legacy direct writes.
create or replace function public.vzip_data_next_revision()
returns trigger language plpgsql set search_path=''
as $$
begin
 if tg_op='UPDATE' then
  if new.user_id is distinct from old.user_id then
   raise exception 'snapshot owner is immutable' using errcode='42501';
  end if;
  if old.updated_at is not null and not isfinite(old.updated_at) then
   raise exception 'invalid existing snapshot timestamp' using errcode='22023';
  end if;
  new.revision:=old.revision+1;
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 else
  new.revision:=1;
  new.updated_at:=clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function public.vzip_data_next_revision() from public,anon,authenticated;
drop trigger if exists vzip_data_next_revision on public.vocal_data;
create trigger vzip_data_next_revision before insert or update on public.vocal_data
 for each row execute function public.vzip_data_next_revision();

-- Successful request receipts contain hashes/revision metadata, not copied snapshots.
-- Conflicts never claim success and are not committed request receipts.
create or replace function public.vzip_save_snapshot(
 p_expected_revision bigint,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 u uuid:=auth.uid();
 s uuid;
 receipt public.vzip_data_write_requests;
 current_row public.vocal_data;
 result_row public.vocal_data;
 digest bytea;
begin
 if u is null then raise exception 'authenticated session required' using errcode='42501'; end if;
 -- Match the existing session-revoke lock order; a revoke and this mutation serialize.
 perform 1 from public.vzip_account_session_state where user_id=u for update;
 if not found then raise exception 'registered session required' using errcode='42501'; end if;
 perform public.vzip_assert_session();
 if not public.vzip_session_is_active() then
  raise exception 'registered session required' using errcode='42501';
 end if;
 s:=public.vzip_request_session();
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then
  raise exception 'request id and nonnegative revision required' using errcode='22023';
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or exists(
  select 1 from unnest(array['categories','songs','lessons','assignments','practices']) k
  where jsonb_typeof(p_payload->k) is distinct from 'array'
 ) then raise exception 'invalid snapshot payload' using errcode='22023'; end if;
 digest:=sha256(convert_to(p_payload::text,'UTF8'));
 select * into receipt from public.vzip_data_write_requests
  where user_id=u and request_id=p_request_id;
 if found then
  if receipt.session_id<>s or receipt.expected_revision<>p_expected_revision or receipt.content_hash<>digest then
   raise exception 'request id reused with different input or session' using errcode='22023';
  end if;
  return jsonb_build_object('status','saved','revision',receipt.result_revision::text,
   'updated_at',receipt.result_updated_at,'replayed',true);
 end if;
 select * into current_row from public.vocal_data where user_id=u for update;
 if found then
  if current_row.revision<>p_expected_revision then
   return jsonb_build_object('status','conflict','revision',current_row.revision::text,'exists',true);
  end if;
  update public.vocal_data set payload=p_payload
   where user_id=u and revision=p_expected_revision returning * into result_row;
 else
  if p_expected_revision<>0 then
   return jsonb_build_object('status','conflict','revision','0','exists',false);
  end if;
  insert into public.vocal_data(user_id,payload) values(u,p_payload)
   on conflict(user_id) do nothing returning * into result_row;
  if not found then
   -- A legacy direct first writer may have created the row outside the account lock.
   select * into current_row from public.vocal_data where user_id=u;
   return jsonb_build_object('status','conflict','revision',current_row.revision::text,'exists',true);
  end if;
 end if;
 insert into public.vzip_data_write_requests(user_id,request_id,session_id,expected_revision,content_hash,result_revision,result_updated_at)
 values(u,p_request_id,s,p_expected_revision,digest,result_row.revision,result_row.updated_at);
 return jsonb_build_object('status','saved','revision',result_row.revision::text,
  'updated_at',result_row.updated_at,'replayed',false);
end $$;
revoke all on function public.vzip_save_snapshot(bigint,jsonb,uuid) from public,anon;
grant execute on function public.vzip_save_snapshot(bigint,jsonb,uuid) to authenticated;

comment on table public.vzip_data_write_requests is
 'Phase 03 proposal: successful snapshot-write receipts only; no payload copies. Production activation requires client/legacy bridge and retention/deletion policy.';
commit;
