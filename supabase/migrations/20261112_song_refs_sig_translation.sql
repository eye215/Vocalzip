-- Song matching also compares the Korean translation ('한글 해석 / 번역', song.translation) since 2026-11-12:
-- a Korean-language production is sung in the translated words. The app (app/song-suggestions.js) and the server
-- worker (worker/analysis-worker.mjs) both use it, so the fingerprint of "what matching compares with" must include it:
-- adding or editing a translation then re-queues the owner's 'review' song jobs (vzip_recheck_review_jobs, every
-- 30 minutes) and the worker matches them again from the SAVED transcript. No new STT charge.
--
-- Only songs that actually have a translation of 12+ characters add a part, so for every account without
-- translations the fingerprint stays exactly what it was and nothing is re-queued by this change.
-- Replaces one function body. No table, row or data change. Safe to run again.

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
    select s ->> 'id' as id, btrim(coalesce(s ->> 'lyrics', '')) as lyrics, btrim(coalesce(s ->> 'translation', '')) as translation
      from d, jsonb_array_elements(case when jsonb_typeof(d.payload -> 'songs') = 'array' then d.payload -> 'songs' else '[]'::jsonb end) s
     where coalesce(s ->> 'id', '') <> '' and (s ->> 'id') not in (select id from gone)),
  parts as (
    select 's:' || id || ':' || md5(case when length(lyrics) >= 12 then lyrics else '' end) as p from songs
    union all
    select 't:' || id || ':' || md5(translation) from songs where length(translation) >= 12
    union all
    select 'r:' || t.record_id || ':' || md5(coalesce(t.transcript, ''))
      from public.vocal_song_texts t
     where t.user_id = owner and t.kind = 'reference' and t.deleted_at is null)
  select md5(coalesce(string_agg(p, '|' order by p), '')) from parts;
$$;
revoke all on function public.vzip_song_refs_sig(uuid) from public, anon, authenticated;
