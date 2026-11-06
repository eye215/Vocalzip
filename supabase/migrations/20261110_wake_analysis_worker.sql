-- VOCAL.zip: Supabase wakes the server analysis worker (GitHub Actions) when recordings are waiting.
-- GitHub's own 10-minute schedule did not fire for this repository, so new uploads could wait until someone
-- started the worker by hand. Every 5 minutes (pg_cron) the database checks the queue and, only when something is
-- waiting and no worker is busy or was just started, asks GitHub to run the "Analysis worker" workflow (pg_net).
--
-- Needs one secret in Supabase Vault, named github_actions_token: a GitHub fine-grained token for eye215/Vocalzip
-- with only "Actions: Read and write" (it can start workflows, nothing else). Without it nothing is sent.
-- Adds a function, a one-row table and a schedule; no existing data is changed. Safe to run again.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then create extension if not exists pg_cron; end if;
end $$;

create table if not exists public.vzip_worker_wake (
  id int primary key default 1 check (id = 1),
  last_at timestamptz,
  last_result text,
  last_request bigint
);
alter table public.vzip_worker_wake enable row level security; -- no policies: the app cannot read or write it
revoke all on public.vzip_worker_wake from anon, authenticated;

create or replace function public.vzip_wake_worker(force boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  waiting int; busy boolean; last timestamptz; token text; req bigint; result text;
begin
  select count(*) into waiting from public.vocal_analysis_jobs
   where attempts < 3 and (status = 'queued' or (status = 'running' and locked_at < now() - interval '30 minutes'));
  if waiting = 0 then return 'idle'; end if;
  -- A worker is working right now (it keeps claiming until the queue is empty, then starts the next run itself).
  select exists (select 1 from public.vocal_analysis_jobs
                  where status = 'running' and locked_by is distinct from 'retry-wait' and locked_at > now() - interval '5 minutes') into busy;
  select last_at into last from public.vzip_worker_wake where id = 1;
  if not force and busy then result := 'busy';
  elsif not force and last is not null and last > now() - interval '15 minutes' then result := 'recently started';
  else
    begin
      select decrypted_secret into token from vault.decrypted_secrets where name = 'github_actions_token' limit 1;
    exception when others then token := null;
    end;
    if coalesce(token, '') = '' then result := 'no github_actions_token in Vault';
    else
      select net.http_post(
        url := 'https://api.github.com/repos/eye215/Vocalzip/actions/workflows/analysis-worker.yml/dispatches',
        body := jsonb_build_object('ref', 'main'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || token, 'Accept', 'application/vnd.github+json',
                                      'Content-Type', 'application/json', 'User-Agent', 'vocalzip-supabase', 'X-GitHub-Api-Version', '2022-11-28')
      ) into req;
      result := 'started (' || waiting || ' waiting)';
      insert into public.vzip_worker_wake (id, last_at, last_result, last_request) values (1, now(), result, req)
        on conflict (id) do update set last_at = excluded.last_at, last_result = excluded.last_result, last_request = excluded.last_request;
      return result;
    end if;
  end if;
  insert into public.vzip_worker_wake (id, last_result) values (1, result)
    on conflict (id) do update set last_result = excluded.last_result;
  return result;
end $$;
revoke all on function public.vzip_wake_worker(boolean) from public, anon, authenticated;

-- What happened last time (GitHub answers 204 when the run was started; 401/403/404 means the token is wrong).
create or replace function public.vzip_wake_worker_status()
returns table (last_at timestamptz, last_result text, github_status int, github_error text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select w.last_at, w.last_result, r.status_code, left(coalesce(r.error_msg, case when r.status_code >= 300 then r.content end), 200)
      from public.vzip_worker_wake w left join net._http_response r on r.id = w.last_request
     where w.id = 1;
exception when undefined_table or invalid_schema_name then
  return query select w.last_at, w.last_result, null::int, null::text from public.vzip_worker_wake w where w.id = 1;
end $$;
revoke all on function public.vzip_wake_worker_status() from public, anon, authenticated;

-- Every 5 minutes (replaces an earlier schedule of the same name).
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vzip-wake-analysis-worker';
    perform cron.schedule('vzip-wake-analysis-worker', '*/5 * * * *', 'select public.vzip_wake_worker()');
  end if;
end $$;
