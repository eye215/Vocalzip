-- Student 1.0 v1.2: one active authenticated session per account.
-- Apply only after the client takeover UI and local account isolation are ready.
-- This migration file is NOT permission to apply it to production.
begin;

create table if not exists public.vzip_active_sessions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 session_id uuid not null,
 changed_at timestamptz not null default now()
);
alter table public.vzip_active_sessions enable row level security;
revoke all on public.vzip_active_sessions from public, anon, authenticated;

-- A session id is trusted only from the verified JWT, never from an RPC argument.
create or replace function public.vzip_request_session()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare u uuid := auth.uid(); s uuid;
begin
 if u is null then return null; end if;
 if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-vzip-client-protocol','')<>'account-session-v1' then return null; end if;
 begin s := nullif(auth.jwt()->>'session_id','')::uuid;
 exception when invalid_text_representation then return null; end;
 if s is null or not exists(select 1 from auth.sessions a where a.id=s and a.user_id=u) then return null; end if;
 return s;
end $$;
revoke all on function public.vzip_request_session() from public, anon;
grant execute on function public.vzip_request_session() to authenticated;

create or replace function public.vzip_session_is_active()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(select 1 from public.vzip_active_sessions a
   where a.user_id=auth.uid() and a.session_id=public.vzip_request_session());
$$;
revoke all on function public.vzip_session_is_active() from public, anon;
grant execute on function public.vzip_session_is_active() to authenticated;

-- First call never replaces a different device. After an explicit user confirmation,
-- send exactly the session id shown in confirmation_required. A stale confirmation fails.
create or replace function public.vzip_claim_session(expected_previous uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid(); s uuid := public.vzip_request_session(); a uuid;
begin
 if u is null or s is null then raise exception 'valid authenticated session required' using errcode='28000'; end if;
 insert into public.vzip_active_sessions(user_id,session_id) values(u,s) on conflict(user_id) do nothing;
 select session_id into a from public.vzip_active_sessions where user_id=u for update;
 if a=s then return jsonb_build_object('status','active'); end if;
 if expected_previous is null or expected_previous<>a then
   return jsonb_build_object('status','confirmation_required','expected_previous',a);
 end if;
 update public.vzip_active_sessions set session_id=s,changed_at=now() where user_id=u;
 return jsonb_build_object('status','active');
end $$;
revoke all on function public.vzip_claim_session(uuid) from public, anon;
grant execute on function public.vzip_claim_session(uuid) to authenticated;

-- Delayed logout on the old device must not log out the newly active device.
create or replace function public.vzip_release_session()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
 delete from public.vzip_active_sessions where user_id=auth.uid() and session_id=public.vzip_request_session();
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.vzip_release_session() from public, anon;
grant execute on function public.vzip_release_session() to authenticated;

-- Restrictive policies AND with existing owner policies. They never grant access.
-- Guards cover direct PostgREST reads/writes; SECURITY DEFINER/service-role paths
-- and R2 need their own enforcement before rollout (see integration checklist).
do $$
declare t text;
begin
 foreach t in array array['vocal_data','vocal_media','vocal_history','vocal_song_texts',
   'vocal_analysis_jobs','vocal_billing_documents','vzip_song_stt_quota','vzip_worker_wake']
 loop
   if to_regclass('public.'||t) is not null then
     execute format('drop policy if exists vzip_active_session_guard on public.%I',t);
     execute format('create policy vzip_active_session_guard on public.%I as restrictive for all to authenticated using ((select public.vzip_session_is_active())) with check ((select public.vzip_session_is_active()))',t);
   end if;
 end loop;
 if to_regclass('storage.objects') is not null then
   execute 'drop policy if exists vzip_active_session_guard on storage.objects';
   execute 'create policy vzip_active_session_guard on storage.objects as restrictive for all to authenticated using (bucket_id <> ''vocal-recordings'' or (select public.vzip_session_is_active())) with check (bucket_id <> ''vocal-recordings'' or (select public.vzip_session_is_active()))';
 end if;
end $$;
commit;
