-- VOCAL.zip: raise the paid STT safety limit from the test values (3 a day / 15 in total)
-- to 200 a UTC day / 3,000 in total, so the ~1,000 unsorted recordings can actually be sorted.
-- Cost guide (gpt-4o-mini-transcribe ≈ $0.003 per minute): a 30-second clip ≈ $0.0015,
-- 200 clips a day ≈ $0.30, 3,000 clips ≈ $4.50. Keep a monthly budget limit on the OpenAI account too.
-- Same function, same table, same security; only the two numbers change. Existing counts are kept.
-- Run once in the Supabase SQL editor (requires 20261106_vzip_song_stt_quota.sql to have been run).
create or replace function public.vzip_song_stt_reserve()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  today_utc date := (timezone('utc', now()))::date;
  did_reserve boolean;
begin
  if who is null then
    return false;
  end if;
  insert into public.vzip_song_stt_quota as q
    (user_id, usage_date, used_today, used_total)
  values (who, today_utc, 1, 1)
  on conflict (user_id) do update
  set usage_date = excluded.usage_date,
      used_today = case when q.usage_date = excluded.usage_date
                        then q.used_today + 1 else 1 end,
      used_total = q.used_total + 1
  where q.used_total < 3000
    and (q.usage_date <> excluded.usage_date or q.used_today < 200)
  returning true into did_reserve;
  return coalesce(did_reserve, false);
end;
$$;
revoke all on function public.vzip_song_stt_reserve() from public, anon;
grant execute on function public.vzip_song_stt_reserve() to authenticated;
comment on function public.vzip_song_stt_reserve() is
  'Atomic authenticated reservation for VOCAL.zip paid STT (max 200 per UTC day, 3,000 in total); no direct table access for clients.';
