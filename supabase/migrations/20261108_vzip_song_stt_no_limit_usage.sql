-- VOCAL.zip paid STT: no app-side limit any more (the OpenAI account budget is the limit), but every call
-- is still counted so the app can show what has been spent so far.
--  * vzip_song_stt_reserve(): same name and security as before (the edge function needs no redeploy);
--    it now always counts and allows the call for a signed-in user.
--  * vzip_song_stt_usage(): the signed-in user's own counts (total, and today in UTC). Read-only.
-- Existing counts are kept. Run once in the Supabase SQL editor (after 20261106_vzip_song_stt_quota.sql).
create or replace function public.vzip_song_stt_reserve()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  today_utc date := (timezone('utc', now()))::date;
begin
  if who is null then
    return false;
  end if;
  insert into public.vzip_song_stt_quota as q (user_id, usage_date, used_today, used_total)
  values (who, today_utc, 1, 1)
  on conflict (user_id) do update
  set usage_date = excluded.usage_date,
      used_today = case when q.usage_date = excluded.usage_date then q.used_today + 1 else 1 end,
      used_total = q.used_total + 1;
  return true;
end;
$$;
revoke all on function public.vzip_song_stt_reserve() from public, anon;
grant execute on function public.vzip_song_stt_reserve() to authenticated;
comment on function public.vzip_song_stt_reserve() is
  'Counts one VOCAL.zip paid STT call for the signed-in user (no limit; the OpenAI budget is the limit).';

create or replace function public.vzip_song_stt_usage()
returns table(used_total integer, used_today integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(q.used_total, 0),
         case when q.usage_date = (timezone('utc', now()))::date then coalesce(q.used_today, 0) else 0 end
  from (select (select auth.uid()) as who) me
  left join public.vzip_song_stt_quota q on q.user_id = me.who
  where me.who is not null;
$$;
revoke all on function public.vzip_song_stt_usage() from public, anon;
grant execute on function public.vzip_song_stt_usage() to authenticated;
comment on function public.vzip_song_stt_usage() is 'The signed-in user''s paid STT call counts (total, today UTC); nothing else.';
