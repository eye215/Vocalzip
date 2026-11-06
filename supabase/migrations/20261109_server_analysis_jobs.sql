-- VOCAL.zip server background analysis: a job queue in Supabase, worked by the analysis worker
-- (.github/workflows/analysis-worker.yml, worker/analysis-worker.mjs) — so recordings are analyzed and
-- sorted into songs after upload even when the app is closed.
--
-- Additive only: no existing table, row or file is changed or removed by this migration.
--  * vocal_analysis_jobs: one row per (user, recording, kind). kind = 'vocal' (pitch measurements) or
--    'song' (AI song identification). Owners can READ their own jobs; only the worker changes them.
--  * New recordings (vocal_media inserts) are queued automatically by a trigger.
--  * vzip_enqueue_my_media(): the signed-in user queues their existing recordings that still need work.
--  * vzip_claim_analysis_jobs(): the worker takes jobs atomically (SKIP LOCKED); a job whose worker died is
--    taken again after 30 minutes; after 3 attempts it stays 'failed'. Not callable by app users.
--  * Realtime: vocal_media and the job table are published so an open app sees results at once.
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.vocal_analysis_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id text not null check (length(media_id) between 1 and 200),
  kind text not null check (kind in ('vocal', 'song')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'review', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result jsonb,
  cost_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_id, kind)
);
create index if not exists vocal_analysis_jobs_pending on public.vocal_analysis_jobs (status, created_at) where status in ('queued', 'running');
create index if not exists vocal_analysis_jobs_user on public.vocal_analysis_jobs (user_id, updated_at desc);
alter table public.vocal_analysis_jobs enable row level security;
revoke all on public.vocal_analysis_jobs from public, anon, authenticated;
grant select on public.vocal_analysis_jobs to authenticated;
drop policy if exists own_analysis_jobs_read on public.vocal_analysis_jobs;
create policy own_analysis_jobs_read on public.vocal_analysis_jobs for select to authenticated using ((select auth.uid()) = user_id);
comment on table public.vocal_analysis_jobs is 'VOCAL.zip server analysis queue (vocal measurements, AI song identification). Read-only for owners; written by the worker.';

-- Queue a recording: measurements always; song identification only while it has no song.
create or replace function public.vzip_queue_media(owner uuid, media text, meta jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare added integer := 0; n integer;
begin
  if (meta -> 'analysis' ->> 'v') is null then
    insert into public.vocal_analysis_jobs (user_id, media_id, kind) values (owner, media, 'vocal') on conflict do nothing;
    get diagnostics n = row_count; added := added + n;
  end if;
  if coalesce(meta ->> 'songId', '') = '' and coalesce(meta ->> 'song', '') = '' then
    insert into public.vocal_analysis_jobs (user_id, media_id, kind) values (owner, media, 'song') on conflict do nothing;
    get diagnostics n = row_count; added := added + n;
  end if;
  return added;
end;
$$;
revoke all on function public.vzip_queue_media(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.vzip_queue_new_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.vzip_queue_media(new.user_id, new.id, new.metadata);
  return new;
end;
$$;
drop trigger if exists vzip_queue_new_media on public.vocal_media;
create trigger vzip_queue_new_media after insert on public.vocal_media
  for each row execute function public.vzip_queue_new_media();

-- The signed-in user's existing recordings that still need work (already queued ones are left alone).
create or replace function public.vzip_enqueue_my_media()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare who uuid := (select auth.uid()); total integer := 0; r record;
begin
  if who is null then return 0; end if;
  for r in select id, metadata from public.vocal_media where user_id = who loop
    total := total + public.vzip_queue_media(who, r.id, r.metadata);
  end loop;
  return total;
end;
$$;
revoke all on function public.vzip_enqueue_my_media() from public, anon;
grant execute on function public.vzip_enqueue_my_media() to authenticated;

-- Worker only: take up to `max_jobs` jobs of the given kinds (a worker without an STT key leaves song jobs queued). Each job is given to one worker; a stale lock (worker died)
-- is taken again after 30 minutes; three attempts at most.
create or replace function public.vzip_claim_analysis_jobs(worker text, max_jobs integer, kinds text[] default array['vocal', 'song'])
returns setof public.vocal_analysis_jobs
language sql
security definer
set search_path = ''
as $$
  update public.vocal_analysis_jobs j
     set status = 'running', locked_at = now(), locked_by = worker, attempts = j.attempts + 1, updated_at = now()
   where j.id in (
     select id from public.vocal_analysis_jobs
      where attempts < 3 and kind = any(kinds)
        and (status = 'queued' or (status = 'running' and locked_at < now() - interval '30 minutes'))
      order by (kind = 'song') desc, created_at
      limit greatest(1, least(max_jobs, 500))
      for update skip locked)
  returning j.*;
$$;
revoke all on function public.vzip_claim_analysis_jobs(text, integer, text[]) from public, anon, authenticated;

-- Jobs whose worker died three times stay visible as failed instead of 'running' forever.
create or replace function public.vzip_fail_abandoned_jobs()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    update public.vocal_analysis_jobs set status = 'failed', last_error = coalesce(last_error, '서버 작업이 중단됐어요.'), updated_at = now()
     where status = 'running' and attempts >= 3 and locked_at < now() - interval '30 minutes'
    returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function public.vzip_fail_abandoned_jobs() from public, anon, authenticated;

-- Realtime for an open app (respects RLS: each user receives only their own rows).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vocal_media') then
      execute 'alter publication supabase_realtime add table public.vocal_media';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vocal_analysis_jobs') then
      execute 'alter publication supabase_realtime add table public.vocal_analysis_jobs';
    end if;
  end if;
end $$;
