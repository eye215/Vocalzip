-- CI fixture only (never run on Supabase): stand-ins shaped like the app's existing tables, with a few existing rows.
create table public.vocal_data (user_id uuid primary key references auth.users(id), payload jsonb not null, updated_at timestamptz not null default now());
create table public.vocal_media (id text primary key, user_id uuid not null references auth.users(id), metadata jsonb not null, updated_at timestamptz not null default now());
alter table public.vocal_data enable row level security;
alter table public.vocal_media enable row level security;
grant select, insert, update, delete on public.vocal_data, public.vocal_media to authenticated;
create policy own_data on public.vocal_data for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_media on public.vocal_media for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
insert into auth.users(id) values ('33333333-3333-4333-8333-333333333333');
insert into public.vocal_data values ('11111111-1111-4111-8111-111111111111', '{"songs":[{"id":"s1"}]}');
insert into public.vocal_media values ('m-old', '11111111-1111-4111-8111-111111111111', '{"name":"old take"}');
