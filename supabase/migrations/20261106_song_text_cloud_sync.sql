-- VOCAL.zip: account-scoped reference lyrics and paid STT transcripts.
-- Additive only. Does not alter or remove vocal_data, vocal_media or recordings.
create table if not exists public.vocal_song_texts (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('reference','recognition')),
 record_id text not null check (length(record_id) between 1 and 128),
 transcript text not null check (length(transcript) between 1 and 1600),
 source text not null default 'manual' check (source in ('manual','stt','legacy')),
 updated_at timestamptz not null default now(),
 primary key (user_id, kind, record_id)
);
create index if not exists vocal_song_texts_user_updated
 on public.vocal_song_texts(user_id, updated_at desc);
alter table public.vocal_song_texts enable row level security;
revoke all on public.vocal_song_texts from public, anon;
grant select, insert, update, delete on public.vocal_song_texts to authenticated;
drop policy if exists own_song_text_read on public.vocal_song_texts;
drop policy if exists own_song_text_insert on public.vocal_song_texts;
drop policy if exists own_song_text_update on public.vocal_song_texts;
drop policy if exists own_song_text_delete on public.vocal_song_texts;
create policy own_song_text_read on public.vocal_song_texts
 for select to authenticated using ((select auth.uid()) = user_id);
create policy own_song_text_insert on public.vocal_song_texts
 for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_song_text_update on public.vocal_song_texts
 for update to authenticated using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
create policy own_song_text_delete on public.vocal_song_texts
 for delete to authenticated using ((select auth.uid()) = user_id);
comment on table public.vocal_song_texts is 'Private per-user song reference text and cached paid STT transcripts (no audio bytes).';
