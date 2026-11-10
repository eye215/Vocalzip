-- A signed-in owner can requeue failed analysis jobs from 처리 내역. No paid STT is started here:
-- the song worker only compares an already saved transcript with reference lyrics.
-- Apply after 20261109_server_analysis_jobs.sql and 20261110_wake_analysis_worker.sql.
alter table public.vocal_analysis_jobs
  add column if not exists manual_retries integer not null default 0 check (manual_retries between 0 and 5);

create or replace function public.vzip_retry_my_failed_analysis()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  retried integer := 0;
begin
  if who is null then raise exception '로그인이 필요해요.'; end if;
  if pg_catalog.to_regprocedure('public.vzip_assert_session()') is not null then
    execute 'select public.vzip_assert_session()';
  end if;
  with target as (
    select j.id
      from public.vocal_analysis_jobs j
      join public.vocal_media m on m.id = j.media_id and m.user_id = j.user_id
     where j.user_id = who and j.status = 'failed' and j.manual_retries < 5
     order by j.updated_at
     limit 100
     for update of j skip locked
  ), updated as (
    update public.vocal_analysis_jobs j
       set status = 'queued', attempts = 0, manual_retries = j.manual_retries + 1,
           last_error = null, locked_at = null, locked_by = null, updated_at = now()
      from target where j.id = target.id
    returning 1
  ) select count(*)::integer into retried from updated;
  if retried > 0 then
    begin perform public.vzip_wake_worker(false);
    exception when others then
      -- The scheduled worker can still pick up the queued jobs if the immediate wake fails.
      raise warning 'vzip retry queued %, worker wake failed: %', retried, sqlerrm;
    end;
  end if;
  return retried;
end;
$$;
revoke all on function public.vzip_retry_my_failed_analysis() from public, anon, authenticated;
grant execute on function public.vzip_retry_my_failed_analysis() to authenticated;
