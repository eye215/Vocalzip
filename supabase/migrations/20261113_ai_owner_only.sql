-- Paid AI is temporarily owner-only. Apply/configure in one reviewed transaction.
-- Existing usage, media and app ledgers are retained. Missing/disabled owner policy fails closed.
begin;
do $$ begin
 if to_regprocedure('public.vzip_server_session_allowed()') is null
 or to_regprocedure('public.vzip_song_stt_reserve_session_impl()') is null then
  raise exception 'registered-session STT prerequisites missing';
 end if;
end $$;
create table if not exists public.vzip_ai_owner_policy (
 singleton boolean primary key default true check(singleton),
 owner_user_id uuid references auth.users(id) on delete set null,
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.vzip_ai_owner_policy(singleton) values(true) on conflict(singleton) do nothing;
alter table public.vzip_ai_owner_policy enable row level security;
revoke all on public.vzip_ai_owner_policy from public,anon,authenticated;

create or replace function public.vzip_ai_owner_allowed()
returns boolean language sql stable security definer set search_path=''
as $$
 select coalesce((select p.enabled and p.owner_user_id=auth.uid()
  and public.vzip_server_session_allowed()
  from public.vzip_ai_owner_policy p where p.singleton),false);
$$;
revoke all on function public.vzip_ai_owner_allowed() from public,anon;
grant execute on function public.vzip_ai_owner_allowed() to authenticated;

-- Protect old deployed clients as well: no non-owner reservation can reach the paid boundary.
create or replace function public.vzip_song_stt_reserve()
returns boolean language plpgsql security definer set search_path=''
as $$ begin
 if not public.vzip_server_session_allowed() then
  raise exception 'current login session is not active' using errcode='42501';
 end if;
 if not public.vzip_ai_owner_allowed() then return false; end if;
 return public.vzip_song_stt_reserve_session_impl();
end $$;
revoke all on function public.vzip_song_stt_reserve() from public,anon;
grant execute on function public.vzip_song_stt_reserve() to authenticated;
revoke all on function public.vzip_song_stt_reserve_session_impl() from public,anon,authenticated;
comment on table public.vzip_ai_owner_policy is 'One server-configured owner may request paid AI; no client configuration access. Disabled until explicitly configured.';
commit;
