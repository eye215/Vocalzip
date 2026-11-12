-- VOCAL.zip automatic lyrics recognition (server analysis worker) under a service-wide monthly cap.
-- Approved by the owner on 2026-11-12: at most $2.00 per calendar month (UTC) for ALL accounts together, only for
-- song recordings without a song (lesson / training / room recordings and recordings with a song are never sent).
-- At the cap the worker stops automatic recognition for the rest of the month; app-requested STT
-- (vzip-song-stt, vzip_song_stt_reserve) is not touched by this migration and continues as before.
--
--  * vzip_auto_stt_budget: one row, the monthly cap (2.00 USD). Change it here, not in the worker.
--  * vzip_auto_stt_ledger: one row per paid clip. A clip is RESERVED before the API is called (under a lock on the
--    budget row, so two workers can never overshoot together) and settled afterwards:
--      charged  the transcript came back                      → counts, and the recording is never paid again
--      failed   network error/timeout (may have been billed)  → counts (conservative), the job may retry
--      released the API answered with an error (not billed)   → does not count
--    A reservation left behind by a worker that died counts until it is 15 minutes old, then becomes 'failed'.
--  * vzip_auto_stt_reserve / _settle / _month_state: worker only (not callable by app users).
--  * vzip_auto_stt_month_usage(): signed-in users read this month's total automatic spend and the cap (one
--    service-wide number, no per-account data) for the "사용 금액" display.
-- Without this migration the worker keeps failing closed (no automatic paid STT), exactly as before.
-- Additive only: two new tables and five functions; nothing existing is changed. Safe to run again.
begin;

create table if not exists public.vzip_auto_stt_budget (
  singleton boolean primary key default true check (singleton),
  monthly_cap_usd numeric(10, 4) not null default 2.00 check (monthly_cap_usd >= 0),
  updated_at timestamptz not null default now()
);
insert into public.vzip_auto_stt_budget (singleton) values (true) on conflict (singleton) do nothing;
alter table public.vzip_auto_stt_budget enable row level security;
revoke all on public.vzip_auto_stt_budget from public, anon, authenticated;

create table if not exists public.vzip_auto_stt_ledger (
  id bigint generated always as identity primary key,
  month date not null,                                  -- first day of the UTC calendar month
  user_id uuid references auth.users(id) on delete set null, -- spend stays counted after an account is deleted
  media_id text not null check (length(media_id) between 1 and 200),
  job_id bigint,
  status text not null default 'reserved' check (status in ('reserved', 'charged', 'failed', 'released')),
  amount_usd numeric(10, 4) not null check (amount_usd > 0 and amount_usd <= 0.05),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
-- One live or paid clip per recording: a recording is never paid for twice.
create unique index if not exists vzip_auto_stt_once on public.vzip_auto_stt_ledger (user_id, media_id) where status in ('reserved', 'charged');
create index if not exists vzip_auto_stt_by_month on public.vzip_auto_stt_ledger (month) where status <> 'released';
alter table public.vzip_auto_stt_ledger enable row level security;
revoke all on public.vzip_auto_stt_ledger from public, anon, authenticated;
comment on table public.vzip_auto_stt_ledger is 'VOCAL.zip automatic (worker) STT clips: reserved before the paid call, settled after. Worker only.';

-- This month's automatic spend (reserved + charged + failed) and the cap.
create or replace function public.vzip_auto_stt_month_state()
returns table(spent_usd numeric, cap_usd numeric, clips integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.amount_usd), 0)::numeric, (select b.monthly_cap_usd from public.vzip_auto_stt_budget b where b.singleton), count(l.id)::integer
    from public.vzip_auto_stt_ledger l
   where l.month = date_trunc('month', timezone('utc', now()))::date and l.status <> 'released';
$$;
revoke all on function public.vzip_auto_stt_month_state() from public, anon, authenticated;

-- Reserve one clip for a song job. Returns the ledger id, or null with the reason ('cap', 'already', 'not a song job').
create or replace function public.vzip_auto_stt_reserve(job bigint, cost numeric)
returns table(ledger_id bigint, refused text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap numeric; spent numeric; j record; new_id bigint;
  this_month date := date_trunc('month', timezone('utc', now()))::date;
begin
  if cost is null or cost <= 0 or cost > 0.05 then raise exception 'invalid clip cost'; end if;
  -- Every reservation waits here for the one before it to commit: the sum below always includes it.
  select b.monthly_cap_usd into cap from public.vzip_auto_stt_budget b where b.singleton for update;
  if cap is null then return query select null::bigint, 'cap'::text; return; end if;
  select aj.user_id, aj.media_id into j from public.vocal_analysis_jobs aj where aj.id = job and aj.kind = 'song';
  if not found then return query select null::bigint, 'not a song job'::text; return; end if;
  update public.vzip_auto_stt_ledger set status = 'failed', settled_at = now()
   where user_id = j.user_id and media_id = j.media_id and status = 'reserved' and created_at < now() - interval '15 minutes';
  if exists (select 1 from public.vzip_auto_stt_ledger l where l.user_id = j.user_id and l.media_id = j.media_id and l.status in ('reserved', 'charged')) then
    return query select null::bigint, 'already'::text; return;
  end if;
  select coalesce(sum(l.amount_usd), 0) into spent from public.vzip_auto_stt_ledger l where l.month = this_month and l.status <> 'released';
  if spent + cost > cap then return query select null::bigint, 'cap'::text; return; end if;
  insert into public.vzip_auto_stt_ledger (month, user_id, media_id, job_id, amount_usd) values (this_month, j.user_id, j.media_id, job, cost)
  returning id into new_id;
  return query select new_id, null::text;
end;
$$;
revoke all on function public.vzip_auto_stt_reserve(bigint, numeric) from public, anon, authenticated;

create or replace function public.vzip_auto_stt_settle(ledger bigint, outcome text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if outcome not in ('charged', 'failed', 'released') then raise exception 'invalid outcome'; end if;
  update public.vzip_auto_stt_ledger set status = outcome, settled_at = now() where id = ledger and status = 'reserved';
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.vzip_auto_stt_settle(bigint, text) from public, anon, authenticated;

-- App display: one service-wide number for this month, for signed-in users with an active session.
create or replace function public.vzip_auto_stt_month_usage()
returns table(spent_usd numeric, cap_usd numeric, clips integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare ok boolean := true;
begin
  if (select auth.uid()) is null then return; end if;
  if to_regprocedure('public.vzip_session_read_allowed()') is not null then
    execute 'select public.vzip_session_read_allowed()' into ok;
  end if;
  if not coalesce(ok, false) then return; end if;
  return query select * from public.vzip_auto_stt_month_state();
end;
$$;
revoke all on function public.vzip_auto_stt_month_usage() from public, anon;
grant execute on function public.vzip_auto_stt_month_usage() to authenticated;
comment on function public.vzip_auto_stt_month_usage() is 'This month''s total automatic (worker) STT spend and the monthly cap; service-wide, no per-account data.';

commit;
