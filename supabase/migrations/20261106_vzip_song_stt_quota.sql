-- One-time VOCAL.zip STT quota. Execute only after reviewing, before enabling STT.
-- Server-side hard request count: 3 transcription attempts per UTC day, 15 lifetime.
-- This caps call counts, NOT exact dollars; OpenAI account billing controls remain necessary.
create table if not exists public.vzip_song_stt_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usage_date date not null default (timezone('utc', now()))::date,
  used_today integer not null default 0 check (used_today >= 0),
  used_total integer not null default 0 check (used_total >= 0)
);
alter table public.vzip_song_stt_quota enable row level security;
revoke all on public.vzip_song_stt_quota from anon, authenticated;

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
  where q.used_total < 15
    and (q.usage_date <> excluded.usage_date or q.used_today < 3)
  returning true into did_reserve;
  return coalesce(did_reserve, false);
end;
$$;
revoke all on function public.vzip_song_stt_reserve() from public, anon;
grant execute on function public.vzip_song_stt_reserve() to authenticated;
comment on function public.vzip_song_stt_reserve() is
  'Atomic authenticated reservation for VOCAL.zip paid STT (max 3 UTC day, 15 lifetime); no direct table access for clients.';
