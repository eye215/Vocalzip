-- CI only: paid STT reservation limits (test values first, then the raised ones).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
-- Raised limit: 200 a day.
do $$declare ok int := 0; begin
 for i in 1..205 loop if public.vzip_song_stt_reserve() then ok := ok + 1; end if; end loop;
 if ok <> 200 then raise exception 'daily limit should be 200, got %', ok; end if;
end$$;
reset role;
-- A new UTC day starts again; the lifetime total keeps counting from the existing row.
update public.vzip_song_stt_quota set usage_date = usage_date - 1, used_total = 2998 where user_id = '33333333-3333-4333-8333-333333333333';
set local role authenticated;
do $$declare ok int := 0; begin
 for i in 1..5 loop if public.vzip_song_stt_reserve() then ok := ok + 1; end if; end loop;
 if ok <> 2 then raise exception 'lifetime limit should stop at 3000, got % more', ok; end if;
end$$;
-- Clients still cannot read or change the counter table directly.
do $$begin
 begin perform 1 from public.vzip_song_stt_quota; raise exception 'quota table readable';
 exception when insufficient_privilege then null; end;
end$$;
-- Signed out: never reserves.
select set_config('request.jwt.claim.sub','',true);
do $$begin if public.vzip_song_stt_reserve() then raise exception 'anonymous reservation'; end if; end$$;
rollback;
