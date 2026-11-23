-- 휴대폰으로 녹음 알림 (Web Push), 2026-11-23. Owner's ask: the request from the iPad reaches the phone (and its watch)
-- as a notification, also when the app is closed. Additive only: one new table and two functions; no existing table,
-- row or policy is touched. Apply in one reviewed transaction (needs approval before it runs on production).
--
-- One row per device that allowed notifications: the push service's endpoint and the two public keys the browser gave
-- (they let the server encrypt a message for that device; nothing here can read or send anything by itself).
-- A person sees and changes only their own rows. The edge function vzip-push-handoff reads them with the service role.
begin;
create table if not exists public.vzip_push_subscriptions (
  endpoint    text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null check (length(device_id) between 1 and 100),
  device_name text not null default '' check (length(device_name) <= 40),
  p256dh      text not null check (length(p256dh) between 20 and 200),
  auth        text not null check (length(auth) between 10 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vzip_push_subscriptions_user_idx on public.vzip_push_subscriptions(user_id);
alter table public.vzip_push_subscriptions enable row level security;
revoke all on public.vzip_push_subscriptions from public, anon;
grant select, delete on public.vzip_push_subscriptions to authenticated;
drop policy if exists vzip_push_own_select on public.vzip_push_subscriptions;
create policy vzip_push_own_select on public.vzip_push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists vzip_push_own_delete on public.vzip_push_subscriptions;
create policy vzip_push_own_delete on public.vzip_push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Register this device for the signed-in person. A browser endpoint belongs to one device: when another account
-- signs in on it, the row moves to that account (the previous one stops getting this device's notifications).
-- At most 10 devices per person (the oldest goes).
create or replace function public.vzip_push_register(p_endpoint text, p_p256dh text, p_auth text, p_device_id text, p_device_name text default '')
returns boolean language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.vzip_push_subscriptions(endpoint, user_id, device_id, device_name, p256dh, auth)
  values (p_endpoint, uid, p_device_id, left(coalesce(p_device_name, ''), 40), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, device_id = excluded.device_id,
    device_name = excluded.device_name, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  -- One endpoint per device of a person: an older endpoint of the same device id goes.
  delete from public.vzip_push_subscriptions s where s.user_id = uid and s.device_id = p_device_id and s.endpoint <> p_endpoint;
  delete from public.vzip_push_subscriptions s where s.endpoint in (
    select x.endpoint from public.vzip_push_subscriptions x where x.user_id = uid order by x.updated_at desc offset 10);
  return true;
end $$;
revoke all on function public.vzip_push_register(text, text, text, text, text) from public, anon;
grant execute on function public.vzip_push_register(text, text, text, text, text) to authenticated;

create or replace function public.vzip_push_unregister(p_endpoint text)
returns boolean language sql security definer set search_path = ''
as $$
  with gone as (delete from public.vzip_push_subscriptions s where s.endpoint = p_endpoint and s.user_id = auth.uid() returning 1)
  select exists(select 1 from gone);
$$;
revoke all on function public.vzip_push_unregister(text) from public, anon;
grant execute on function public.vzip_push_unregister(text) to authenticated;
commit;
