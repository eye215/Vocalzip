-- CI only: paid STT calls are counted without a limit; each user reads only their own counts.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
-- No limit: 250 calls in a day are all allowed and counted.
do $$declare ok int := 0; begin
 for i in 1..250 loop if public.vzip_song_stt_reserve() then ok := ok + 1; end if; end loop;
 if ok <> 250 then raise exception 'every call should be allowed, got %', ok; end if;
end$$;
do $$declare t int; d int; begin
 select used_total, used_today into t, d from public.vzip_song_stt_usage();
 if t <> 250 or d <> 250 then raise exception 'usage should be 250/250, got %/%', t, d; end if;
end$$;
reset role;
-- Yesterday's calls: today resets, the total keeps counting.
update public.vzip_song_stt_quota set usage_date = usage_date - 1 where user_id = '33333333-3333-4333-8333-333333333333';
set local role authenticated;
do $$declare t int; d int; begin
 select used_total, used_today into t, d from public.vzip_song_stt_usage();
 if t <> 250 or d <> 0 then raise exception 'after a day: 250/0 expected, got %/%', t, d; end if;
 perform public.vzip_song_stt_reserve();
 select used_total, used_today into t, d from public.vzip_song_stt_usage();
 if t <> 251 or d <> 1 then raise exception 'next day: 251/1 expected, got %/%', t, d; end if;
end$$;
-- Another account sees only its own (none yet).
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$declare t int; begin
 select used_total into t from public.vzip_song_stt_usage();
 if t <> 0 then raise exception 'cross-account usage leak: %', t; end if;
end$$;
-- The counter table itself stays closed to clients.
do $$begin
 begin perform 1 from public.vzip_song_stt_quota; raise exception 'quota table readable';
 exception when insufficient_privilege then null; end;
end$$;
-- Signed out: never counted or allowed, and no usage row.
select set_config('request.jwt.claim.sub','',true);
do $$begin
 if public.vzip_song_stt_reserve() then raise exception 'anonymous reservation'; end if;
 if exists(select 1 from public.vzip_song_stt_usage()) then raise exception 'anonymous usage'; end if;
end$$;
rollback;
