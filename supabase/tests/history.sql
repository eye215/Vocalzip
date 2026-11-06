-- Runs after sql-setup, app-tables, the billing migration and the history migration (CI database only).
\set ON_ERROR_STOP on
-- Running the migration again changes nothing (no duplicate snapshots, no error).
\i supabase/migrations/20261106_keep_history.sql
do $$ begin
 if exists (select 1 from public.vocal_history where op = 'snapshot' group by source, row_id having count(*) > 1) then raise exception 'a row was snapshotted twice'; end if;
 if not exists (select 1 from public.vocal_history where op = 'snapshot' and source = 'vocal_media' and row_id = 'm-old') then raise exception 'existing media row not snapshotted'; end if;
 if not exists (select 1 from public.vocal_history where op = 'snapshot' and source = 'vocal_data' and row_id = '11111111-1111-4111-8111-111111111111') then raise exception 'existing app data not snapshotted'; end if;
end $$;
-- A separate account so the billing tests' rows do not matter.
insert into public.vocal_data values ('33333333-3333-4333-8333-333333333333', '{"songs":[{"id":"s1"}]}');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
update public.vocal_data set payload = '{"songs":[{"id":"s1"},{"id":"s2"}]}', updated_at = now();
update public.vocal_data set updated_at = now() + interval '1 second';          -- no real change: not kept
insert into public.vocal_media values ('m1', auth.uid(), '{"name":"take 1"}');
update public.vocal_media set metadata = '{"name":"take 1 (renamed)"}' where id = 'm1';
delete from public.vocal_media where id = 'm1';                                   -- a deletion is kept
do $$
declare p jsonb := jsonb_build_object('schemaVersion',1,'owner','user:'||auth.uid()::text,'revision',0,'passes','[]'::jsonb,'payments','[]'::jsonb,'deductions','[]'::jsonb,'adjustments','[]'::jsonb,'imports','[]'::jsonb,'importRows','[]'::jsonb,'history','[]'::jsonb);
begin
 perform public.vocal_billing_save(0, p, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 perform public.vocal_billing_save(1, jsonb_set(p, '{revision}', '1'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 if (select count(*) from public.vocal_history where user_id = auth.uid() and source = 'vocal_data' and op = 'update') <> 1 then raise exception 'vocal_data change not kept exactly once'; end if;
 if (select string_agg(op, ',' order by id) from public.vocal_history where source = 'vocal_media' and row_id = 'm1') <> 'insert,update,delete' then raise exception 'media insert/update/delete not all kept'; end if;
 if (select data->'metadata'->>'name' from public.vocal_history where source = 'vocal_media' and row_id = 'm1' and op = 'delete') <> 'take 1 (renamed)' then raise exception 'deleted row content not kept'; end if;
 if (select count(*) from public.vocal_history where user_id = auth.uid() and source = 'vocal_billing_documents') <> 2 then raise exception 'billing versions not kept'; end if;
 if exists (select 1 from public.vocal_history where user_id = auth.uid() and data ? 'previous_payload') then raise exception 'billing previous payload duplicated in history'; end if;
 if (select max((data->>'revision')::int) from public.vocal_history where user_id = auth.uid() and source = 'vocal_billing_documents') <> 2 then raise exception 'latest billing revision missing'; end if;
 -- The owner cannot write, change or delete the history.
 begin insert into public.vocal_history (user_id, source, row_id, op, data) values (auth.uid(), 'vocal_data', 'x', 'update', '{}'); raise exception 'history insert accepted'; exception when insufficient_privilege then null; end;
 begin update public.vocal_history set data = '{}'; raise exception 'history update accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.vocal_history; raise exception 'history delete accepted'; exception when insufficient_privilege then null; end;
 begin perform public.vocal_history_trim(auth.uid(), 'vocal_data'); raise exception 'trim callable by users'; exception when insufficient_privilege then null; end;
end $$;
-- Another account sees none of it.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin if (select count(*) from public.vocal_history where user_id = '33333333-3333-4333-8333-333333333333') <> 0 then raise exception 'another account can read the history'; end if; end $$;
reset role;
-- Thinning: 6 versions in one hour 5 days ago → 1 kept; 3 in one day 40 days ago → 1 kept; recent and deletions untouched.
insert into public.vocal_history (user_id, source, row_id, op, data, at)
select '11111111-1111-4111-8111-111111111111', 'vocal_media', 'm-old', 'update', jsonb_build_object('v', g), date_trunc('hour', now() - interval '5 days') + g * interval '5 minutes' from generate_series(1, 6) g;
insert into public.vocal_history (user_id, source, row_id, op, data, at)
select '11111111-1111-4111-8111-111111111111', 'vocal_media', 'm-old', 'update', jsonb_build_object('w', g), date_trunc('day', now() - interval '40 days') + g * interval '3 hours' from generate_series(1, 3) g;
insert into public.vocal_history (user_id, source, row_id, op, data, at)
values ('11111111-1111-4111-8111-111111111111', 'vocal_media', 'm-old', 'delete', '{"gone":true}', now() - interval '40 days' + interval '1 minute');
do $$
declare before int; after int;
begin
 select count(*) into before from public.vocal_history;
 perform public.vocal_history_trim('11111111-1111-4111-8111-111111111111', 'vocal_media');
 select count(*) into after from public.vocal_history;
 if before - after <> 7 then raise exception 'thinning removed % rows, expected 7', before - after; end if;
 if (select data->>'v' from public.vocal_history where row_id = 'm-old' and data ? 'v') <> '6' then raise exception 'the last version of the hour was not the one kept'; end if;
 if not exists (select 1 from public.vocal_history where row_id = 'm-old' and op = 'delete') then raise exception 'a deletion was thinned'; end if;
 if (select count(*) from public.vocal_history where source = 'vocal_media' and row_id = 'm1') <> 3 then raise exception 'recent versions were thinned'; end if;
end $$;
\echo 'history checks passed'
