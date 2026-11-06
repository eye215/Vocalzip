-- VOCAL.zip: recordings left at "곡 확인 필요" (song job status 'review') are matched again later — but only when
-- something they are compared with has changed. Lyric matching is deterministic: the same transcript against the
-- same lyrics always gives the same answer, so re-running on a timer alone would only spend worker time.
--
--  * vzip_song_refs_sig(owner): a fingerprint of everything song matching compares with (each song's lyrics and the
--    saved reference transcripts). The worker stores it on the job when it matches (refs_sig).
--  * vzip_recheck_review_jobs(): every 30 minutes (pg_cron) song jobs in 'review' go back to the queue when the
--    owner's fingerprint differs from the one they were matched with, the recording still has no song, and the job
--    has rested for 30 minutes. vzip_wake_worker() then starts the worker as usual.
--  * No new STT charge: the worker reuses the saved transcript. Only jobs that never had lyrics to compare and no
--    transcript yet ('no lyrics to compare') get their first, one-time transcription once lyrics exist.
--  * 'no singing found' is never re-queued: the audio has not changed, so the answer would not either.
--  * force => true re-queues every review job once (use after changing the matcher or the auto-assign policy).
-- Additive only: two columns on the job table, two functions, one schedule. Safe to run again.

alter table public.vocal_analysis_jobs add column if not exists refs_sig text;
alter table public.vocal_analysis_jobs add column if not exists rechecks integer not null default 0;
alter table public.vocal_analysis_jobs add column if not exists rechecked_at timestamptz;
create index if not exists vocal_analysis_jobs_review on public.vocal_analysis_jobs (user_id) where kind = 'song' and status = 'review';

create or replace function public.vzip_song_refs_sig(owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select payload from public.vocal_data where user_id = owner),
  gone as (select jsonb_array_elements_text(coalesce(d.payload -> 'deleted' -> 'songs', '[]'::jsonb)) as id from d),
  songs as (
    select s ->> 'id' as id, btrim(coalesce(s ->> 'lyrics', '')) as lyrics
      from d, jsonb_array_elements(case when jsonb_typeof(d.payload -> 'songs') = 'array' then d.payload -> 'songs' else '[]'::jsonb end) s
     where coalesce(s ->> 'id', '') <> '' and (s ->> 'id') not in (select id from gone)),
  parts as (
    select 's:' || id || ':' || md5(case when length(lyrics) >= 12 then lyrics else '' end) as p from songs
    union all
    select 'r:' || t.record_id || ':' || md5(coalesce(t.transcript, ''))
      from public.vocal_song_texts t
     where t.user_id = owner and t.kind = 'reference' and t.deleted_at is null)
  select md5(coalesce(string_agg(p, '|' order by p), '')) from parts;
$$;
revoke all on function public.vzip_song_refs_sig(uuid) from public, anon, authenticated;

create or replace function public.vzip_recheck_review_jobs(force boolean default false, max_rows integer default 5000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  with owners as (
    select o.user_id, public.vzip_song_refs_sig(o.user_id) as sig
      from (select distinct user_id from public.vocal_analysis_jobs where kind = 'song' and status = 'review') o),
  pick as (
    select j.id
      from public.vocal_analysis_jobs j
      join owners o on o.user_id = j.user_id
      join public.vocal_media m on m.id = j.media_id and m.user_id = j.user_id
     where j.kind = 'song' and j.status = 'review'
       and coalesce(j.result ->> 'reason', '') <> 'no singing found'
       and coalesce(m.metadata ->> 'songId', '') = '' and coalesce(m.metadata ->> 'song', '') = ''
       and (force or (j.refs_sig is distinct from o.sig and j.updated_at < now() - interval '30 minutes'))
     order by j.updated_at
     limit greatest(1, least(max_rows, 20000))
       for update of j skip locked)
  update public.vocal_analysis_jobs j
     set status = 'queued', attempts = 0, last_error = null, locked_at = null, locked_by = null,
         rechecks = j.rechecks + 1, rechecked_at = now(), updated_at = now()
    from pick where j.id = pick.id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.vzip_recheck_review_jobs(boolean, integer) from public, anon, authenticated;

-- Every 30 minutes; the 5-minute wake schedule (20261110) then starts the worker if anything was queued.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vzip-recheck-review-songs';
    perform cron.schedule('vzip-recheck-review-songs', '*/30 * * * *', 'select public.vzip_recheck_review_jobs()');
  end if;
end $$;
