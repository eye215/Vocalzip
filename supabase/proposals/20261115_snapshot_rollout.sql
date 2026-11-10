-- PROPOSAL ONLY: no migration, installation or account activation.
-- Depends on 20261113_snapshot_revision.sql with the optional rollout guard.
begin;
do $$ begin
 if to_regprocedure('public.vzip_save_snapshot(bigint,jsonb,uuid,uuid)') is null
 or position('vzip_assert_snapshot_enabled' in pg_get_functiondef('public.vzip_save_snapshot(bigint,jsonb,uuid,uuid)'::regprocedure))=0 then
  raise exception 'reviewed snapshot foundation with rollout hook required' using errcode='55000';
 end if;
end $$;
create table if not exists public.vzip_snapshot_rollout (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mode text not null check(mode in ('revision','paused')),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.vzip_snapshot_rollout enable row level security;
revoke all on public.vzip_snapshot_rollout from public,anon,authenticated;
grant select on public.vzip_snapshot_rollout to authenticated;
drop policy if exists read_own on public.vzip_snapshot_rollout;
create policy read_own on public.vzip_snapshot_rollout for select to authenticated
 using(user_id=(select auth.uid()) and (select public.vzip_session_read_allowed()));

-- This getter may reveal only the caller's own routing mode, never another account.
-- It does not confer write access: the save RPC independently asserts an active session.
create or replace function public.vzip_snapshot_mode_for(p_user_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare result text;
begin
 if auth.uid() is null or auth.uid() is distinct from p_user_id then
  raise exception 'own snapshot account required' using errcode='42501';
 end if;
 select mode into result from public.vzip_snapshot_rollout where user_id=p_user_id;
 return coalesce(result,'legacy');
end $$;
revoke all on function public.vzip_snapshot_mode_for(uuid) from public,anon;
grant execute on function public.vzip_snapshot_mode_for(uuid) to authenticated;

create or replace function public.vzip_assert_snapshot_enabled(p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if public.vzip_snapshot_mode_for(p_user_id)<>'revision' then
  raise exception 'snapshot revision is not enabled for this account' using errcode='42501';
 end if;
end $$;
revoke all on function public.vzip_assert_snapshot_enabled(uuid) from public,anon,authenticated;

-- Only reviewed operators can activate/pause an already registered account.
-- No function returns an adopted account to legacy direct writes.
-- Lock order matches snapshot saves and session revocation.
create or replace function public.vzip_set_snapshot_mode(p_user_id uuid,p_mode text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if p_mode is null or p_mode not in ('revision','paused') then
  raise exception 'explicit revision or paused mode required' using errcode='22023';
 end if;
 perform 1 from public.vzip_account_session_state where user_id=p_user_id for update;
 if not found then raise exception 'registered account required' using errcode='22023'; end if;
 insert into public.vzip_snapshot_rollout(user_id,mode) values(p_user_id,p_mode)
 on conflict(user_id) do update set mode=excluded.mode,updated_at=clock_timestamp();
end $$;
revoke all on function public.vzip_set_snapshot_mode(uuid,text) from public,anon,authenticated;
grant execute on function public.vzip_set_snapshot_mode(uuid,text) to service_role;

-- Invoker, deliberately not SECURITY DEFINER: current_user is the executing SQL
-- role, not a client-supplied JWT/GUC. Only direct authenticated/anon DML is gated.
-- Existing trusted SECURITY DEFINER mutations retain their own authorization,
-- validation and tombstone/lease guards. Inventory them before any activation.
create or replace function public.vzip_guard_snapshot_direct_write()
returns trigger language plpgsql set search_path=''
as $$
declare target_user uuid;
begin
 target_user:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if current_user in ('authenticated','anon') then
  if current_user='anon' or public.vzip_snapshot_mode_for(target_user)<>'legacy' then
   raise exception 'direct snapshot write disabled; use revision contract' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.vzip_guard_snapshot_direct_write() from public,anon,authenticated;
drop trigger if exists vzip_snapshot_direct_write_guard on public.vocal_data;
create trigger vzip_snapshot_direct_write_guard before insert or update or delete on public.vocal_data
 for each row execute function public.vzip_guard_snapshot_direct_write();

comment on table public.vzip_snapshot_rollout is
 'Proposal only. Missing row=legacy with revision RPC denied; revision=RPC allowed/direct client DML blocked; paused=both blocked. No account backfill or legacy downgrade.';
commit;
