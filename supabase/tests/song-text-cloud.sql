-- CI only: strict per-user isolation and cross-device persistence via shared row.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.vocal_song_texts(user_id,kind,record_id,transcript,source)
 values ('11111111-1111-4111-8111-111111111111','reference','song-a','Alice reference kept across devices','manual');
insert into public.vocal_song_texts(user_id,kind,record_id,transcript,source)
 values ('11111111-1111-4111-8111-111111111111','recognition','media-1','Already-paid STT transcript','stt');
do $$begin
 if (select count(*) from public.vocal_song_texts) <> 2 then raise exception 'owner cannot read own rows'; end if;
end$$;
-- A different logged-in user must see zero rows for the same table.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 if exists(select 1 from public.vocal_song_texts) then raise exception 'cross-user data leak'; end if;
end$$;
insert into public.vocal_song_texts(user_id,kind,record_id,transcript,source)
 values ('22222222-2222-4222-8222-222222222222','reference','song-a','Bob own song reference','manual');
do $$begin
 if (select count(*) from public.vocal_song_texts) <> 1 then raise exception 'bad per-account query isolation'; end if;
end$$;
-- Closing one browser has no effect; a new session of the same account sees both original rows.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$begin
 if (select count(*) from public.vocal_song_texts) <> 2 then raise exception 'cross-device same-account read failed'; end if;
end$$;
rollback;
