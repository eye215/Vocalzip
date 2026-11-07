-- D20: multiple independently revocable login sessions. Policy default: 2 Auth sessions.
-- Supersedes the unshipped single-session draft; NOT a production migration authorization.
begin;
create table if not exists public.vzip_account_session_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0,
 max_sessions smallint not null default 2 check(max_sessions between 1 and 10)
);
create table if not exists public.vzip_device_sessions (
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 playback_token uuid not null unique default gen_random_uuid(),
 label text not null check(char_length(label) between 1 and 80),
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 primary key(user_id,session_id)
);
alter table public.vzip_account_session_state enable row level security;
alter table public.vzip_device_sessions enable row level security;
revoke all on public.vzip_account_session_state,public.vzip_device_sessions from public,anon,authenticated;

-- Identity comes from verified JWT + auth.sessions, never a client-supplied current session.
create or replace function public.vzip_authenticated_session()
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare u uuid:=auth.uid(); s uuid;
begin
 if u is null then return null; end if;
 begin s:=nullif(auth.jwt()->>'session_id','')::uuid;
 exception when invalid_text_representation then return null; end;
 if s is null or not exists(select 1 from auth.sessions a where a.id=s and a.user_id=u and (a.not_after is null or a.not_after>now())) then return null; end if;
 return s;
end $$;
revoke all on function public.vzip_authenticated_session() from public,anon,authenticated;

create or replace function public.vzip_request_session()
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare u uuid:=auth.uid(); s uuid;
begin
 if u is null then return null; end if;
 if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','')<>'vocalzip-device-session-v2' then return null; end if;
 begin s:=nullif(auth.jwt()->>'session_id','')::uuid;
 exception when invalid_text_representation then return null; end;
 if s is null or not exists(select 1 from auth.sessions a where a.id=s and a.user_id=u and (a.not_after is null or a.not_after>now())) then return null; end if;
 return s;
end $$;
revoke all on function public.vzip_request_session() from public,anon;
grant execute on function public.vzip_request_session() to authenticated;

create or replace function public.vzip_session_is_active()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.vzip_device_sessions d
  where d.user_id=auth.uid() and d.session_id=public.vzip_request_session() and d.revoked_at is null);
$$;
revoke all on function public.vzip_session_is_active() from public,anon;
grant execute on function public.vzip_session_is_active() to authenticated;

-- Staged rollout: unenrolled accounts keep existing access until activation.
create table if not exists public.vzip_session_rollout (
 singleton boolean primary key default true check(singleton),
 enforced boolean not null default false
);
insert into public.vzip_session_rollout(singleton) values(true) on conflict(singleton) do nothing;
alter table public.vzip_session_rollout enable row level security;
revoke all on public.vzip_session_rollout from public,anon,authenticated;

create or replace function public.vzip_session_access_allowed()
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and (
  (not coalesce((select enforced from public.vzip_session_rollout where singleton),true)
   and not exists(select 1 from public.vzip_account_session_state where user_id=auth.uid()))
  or public.vzip_session_is_active());
$$;
revoke all on function public.vzip_session_access_allowed() from public,anon;
grant execute on function public.vzip_session_access_allowed() to authenticated;

create or replace function public.vzip_assert_session()
returns void language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.vzip_session_access_allowed() then
  raise exception 'current login session is not active' using errcode='42501';
 end if;
end $$;
revoke all on function public.vzip_assert_session() from public,anon;
grant execute on function public.vzip_assert_session() to authenticated;

-- Worker calls this with the original user JWT, never a caller-supplied owner/session id.
create or replace function public.vzip_session_context()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('user_id',auth.uid(),'allowed',public.vzip_session_access_allowed(),
  'required',coalesce((select enforced from public.vzip_session_rollout where singleton),true)
   or exists(select 1 from public.vzip_account_session_state where user_id=auth.uid()),
  'playback_token',(select playback_token from public.vzip_device_sessions
   where user_id=auth.uid() and session_id=public.vzip_request_session() and revoked_at is null));
$$;
revoke all on function public.vzip_session_context() from public,anon;
grant execute on function public.vzip_session_context() to authenticated;

-- An opaque random playback capability can only validate an already signed media URL.
-- It is not an Auth token and cannot authorize writes or enumerate another session.
create or replace function public.vzip_playback_owner(p_capability uuid)
returns uuid language sql stable security definer set search_path=''
as $$
 select d.user_id from public.vzip_device_sessions d
 where d.playback_token=p_capability and d.revoked_at is null
  and exists(select 1 from auth.sessions a where a.id=d.session_id and a.user_id=d.user_id
   and (a.not_after is null or a.not_after>now()));
$$;
revoke all on function public.vzip_playback_owner(uuid) from public;
grant execute on function public.vzip_playback_owner(uuid) to anon,authenticated;

-- Old playback URLs have no session identity; stop accepting them after activation.
create or replace function public.vzip_legacy_media_allowed()
returns boolean language sql stable security definer set search_path=''
as $$
 select not coalesce((select enforced from public.vzip_session_rollout where singleton),true);
$$;
revoke all on function public.vzip_legacy_media_allowed() from public;
grant execute on function public.vzip_legacy_media_allowed() to anon,authenticated;

-- Internal snapshot: caller functions validate identity and serialize mutations per account.
create or replace function public.vzip_session_snapshot()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('revision',st.revision,'limit',st.max_sessions,
  'current_session',public.vzip_request_session(),'sessions',coalesce((
   select jsonb_agg(jsonb_build_object('session_id',d.session_id,'label',d.label,'created_at',d.created_at)
    order by d.created_at,d.session_id)
   from public.vzip_device_sessions d
   where d.user_id=st.user_id and d.revoked_at is null
    and exists(select 1 from auth.sessions a where a.id=d.session_id and a.user_id=d.user_id and (a.not_after is null or a.not_after>now()))
  ),'[]'::jsonb))
 from public.vzip_account_session_state st where st.user_id=auth.uid();
$$;
revoke all on function public.vzip_session_snapshot() from public,anon,authenticated;

create or replace function public.vzip_register_session(
 p_label text default null,p_replace_session uuid default null,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare u uuid:=auth.uid(); s uuid:=public.vzip_request_session(); st public.vzip_account_session_state;
 d public.vzip_device_sessions; n integer;
begin
 if u is null or s is null then raise exception 'valid authenticated session required' using errcode='28000'; end if;
 insert into public.vzip_account_session_state(user_id) values(u) on conflict(user_id) do nothing;
 select * into st from public.vzip_account_session_state where user_id=u for update;
 select * into d from public.vzip_device_sessions where user_id=u and session_id=s;
 if found then
  -- A revoked JWT must never re-register itself, including delayed Auth callbacks.
  if d.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  return public.vzip_session_snapshot()||jsonb_build_object('status','active');
 end if;
 if p_replace_session is not null and p_expected_revision is distinct from st.revision then
  return public.vzip_session_snapshot()||jsonb_build_object('status','sessions_changed');
 end if;
 select count(*) into n from public.vzip_device_sessions x where x.user_id=u and x.revoked_at is null
  and exists(select 1 from auth.sessions a where a.id=x.session_id and a.user_id=u);
 if n>=st.max_sessions then
  if p_replace_session is null then return public.vzip_session_snapshot()||jsonb_build_object('status','device_limit'); end if;
  update public.vzip_device_sessions set revoked_at=now()
   where user_id=u and session_id=p_replace_session and revoked_at is null
    and exists(select 1 from auth.sessions a where a.id=p_replace_session and a.user_id=u);
  if not found then return public.vzip_session_snapshot()||jsonb_build_object('status','sessions_changed'); end if;
  delete from auth.sessions where user_id=u and id=p_replace_session;
 end if;
 insert into public.vzip_device_sessions(user_id,session_id,label)
  values(u,s,coalesce(nullif(left(btrim(p_label),80),''),'이름 없는 로그인'));
 update public.vzip_account_session_state set revision=revision+1 where user_id=u;
 return public.vzip_session_snapshot()||jsonb_build_object('status','active');
end $$;
revoke all on function public.vzip_register_session(text,uuid,bigint) from public,anon;
grant execute on function public.vzip_register_session(text,uuid,bigint) to authenticated;

create or replace function public.vzip_list_sessions()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.vzip_session_is_active() then raise exception 'active session required' using errcode='28000'; end if;
 return public.vzip_session_snapshot();
end $$;
revoke all on function public.vzip_list_sessions() from public,anon;
grant execute on function public.vzip_list_sessions() to authenticated;

-- Same account lock and CAS as registration. Remote revoke cannot affect another account.
create or replace function public.vzip_revoke_sessions(
 p_session_id uuid default null,p_all boolean default false,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare u uuid:=auth.uid(); st public.vzip_account_session_state; n integer;
begin
 select * into st from public.vzip_account_session_state where user_id=u for update;
 if not found or not public.vzip_session_is_active() then raise exception 'active session required' using errcode='28000'; end if;
 if p_all is null or (p_all and p_session_id is not null) or (not p_all and p_session_id is null) then
  raise exception 'choose one session or all sessions' using errcode='22023'; end if;
 if p_expected_revision is distinct from st.revision then
  return public.vzip_session_snapshot()||jsonb_build_object('status','sessions_changed');
 end if;
 update public.vzip_device_sessions set revoked_at=now()
  where user_id=u and revoked_at is null and (p_all or session_id=p_session_id);
 get diagnostics n=row_count;
 delete from auth.sessions where user_id=u and (p_all or id=p_session_id);
 update public.vzip_account_session_state set revision=revision+1 where user_id=u and n>0;
 return public.vzip_session_snapshot()||jsonb_build_object('status','revoked','count',n);
end $$;
revoke all on function public.vzip_revoke_sessions(uuid,boolean,bigint) from public,anon;
grant execute on function public.vzip_revoke_sessions(uuid,boolean,bigint) to authenticated;

-- Local logout is idempotent and affects only its JWT's registry row, never other devices.
create or replace function public.vzip_release_session()
returns boolean language plpgsql security definer set search_path=''
as $$
declare u uuid:=auth.uid(); s uuid:=public.vzip_request_session(); n integer;
begin
 if u is null or s is null then return false; end if;
 perform 1 from public.vzip_account_session_state where user_id=u for update;
 update public.vzip_device_sessions set revoked_at=now()
  where user_id=u and session_id=s and revoked_at is null;
 get diagnostics n=row_count;
 delete from auth.sessions where user_id=u and id=s;
 update public.vzip_account_session_state set revision=revision+1 where user_id=u and n>0;
 return n=1;
end $$;
revoke all on function public.vzip_release_session() from public,anon;
grant execute on function public.vzip_release_session() to authenticated;

-- Restrictive AND policies preserve existing owner RLS. Definer/service-role/R2 need integration.
do $$
declare t text;
begin
 foreach t in array array['vocal_data','vocal_media','vocal_history','vocal_song_texts',
  'vocal_analysis_jobs','vocal_billing_documents','vzip_song_stt_quota','vzip_worker_wake'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop policy if exists vzip_active_session_guard on public.%I',t);
   execute format('create policy vzip_active_session_guard on public.%I as restrictive for all to authenticated using ((select public.vzip_session_access_allowed())) with check ((select public.vzip_session_access_allowed()))',t);
  end if;
 end loop;
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists vzip_active_session_guard on storage.objects';
  execute 'create policy vzip_active_session_guard on storage.objects as restrictive for all to authenticated using (bucket_id <> ''vocal-recordings'' or (select public.vzip_session_access_allowed())) with check (bucket_id <> ''vocal-recordings'' or (select public.vzip_session_access_allowed()))';
 end if;
end $$;
-- The existing server STT Edge Function forwards the verified user JWT but not the
-- browser protocol header. Validate its actual Auth/registry session, not an SDK label.
create or replace function public.vzip_server_session_allowed()
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and (
  (not coalesce((select enforced from public.vzip_session_rollout where singleton),true)
   and not exists(select 1 from public.vzip_account_session_state where user_id=auth.uid()))
  or exists(select 1 from public.vzip_device_sessions
   where user_id=auth.uid() and session_id=public.vzip_authenticated_session() and revoked_at is null));
$$;
revoke all on function public.vzip_server_session_allowed() from public,anon,authenticated;

-- Preserve original RPC bodies under non-callable implementation names.
do $$
declare f text; signature text; impl text;
begin
 foreach f in array array['vocal_billing_save','vzip_enqueue_my_media','vzip_song_stt_reserve','vzip_song_stt_usage'] loop
  signature:=case when f='vocal_billing_save' then '(bigint,jsonb,uuid)' else '()' end;
  impl:=f||'_session_impl';
  if to_regprocedure('public.'||impl||signature) is null then
   if to_regprocedure('public.'||f||signature) is null then raise exception 'missing prerequisite RPC: %',f; end if;
   execute format('alter function public.%I%s rename to %I',f,signature,impl);
  end if;
  execute format('revoke all on function public.%I%s from public,anon,authenticated',impl,signature);
 end loop;
 if to_regprocedure('public.vzip_queue_new_media()') is not null then
  revoke all on function public.vzip_queue_new_media() from public,anon,authenticated;
 end if;
end $$;
create or replace function public.vocal_billing_save(p_expected_revision bigint,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ begin perform public.vzip_assert_session(); return public.vocal_billing_save_session_impl(p_expected_revision,p_payload,p_request_id); end $$;
create or replace function public.vzip_enqueue_my_media()
returns integer language plpgsql security definer set search_path=''
as $$ begin perform public.vzip_assert_session(); return public.vzip_enqueue_my_media_session_impl(); end $$;
create or replace function public.vzip_song_stt_reserve()
returns boolean language plpgsql security definer set search_path=''
as $$ begin if not public.vzip_server_session_allowed() then raise exception 'current login session is not active' using errcode='42501'; end if; return public.vzip_song_stt_reserve_session_impl(); end $$;
create or replace function public.vzip_song_stt_usage()
returns table(used_total integer,used_today integer) language plpgsql stable security definer set search_path=''
as $$ begin perform public.vzip_assert_session(); return query select * from public.vzip_song_stt_usage_session_impl(); end $$;
revoke all on function public.vocal_billing_save(bigint,jsonb,uuid),public.vzip_enqueue_my_media(),public.vzip_song_stt_reserve(),public.vzip_song_stt_usage() from public,anon;
grant execute on function public.vocal_billing_save(bigint,jsonb,uuid),public.vzip_enqueue_my_media(),public.vzip_song_stt_reserve(),public.vzip_song_stt_usage() to authenticated;

commit;
